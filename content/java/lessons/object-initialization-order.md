## Concept explanation

### What it is

When a class is first used and an object is created, Java runs several kinds of initialisation code in a precise, specified order. Knowing it lets you predict "what does this print?" puzzles and avoid real bugs.

**Class initialisation** (once per class, on first active use):

1. Superclass first (recursively up to `Object`).
2. Static field initialisers and `static {}` blocks, **in source order**.

**Object creation** (`new C(...)`), after the class is initialised:

1. Memory is allocated and **all fields are set to defaults** (`0`, `false`, `null`).
2. The chosen constructor of `C` starts. If it begins with `this(...)`, that constructor runs instead (repeat).
3. The **superclass constructor** runs — the whole sequence 3–5 for the parent, all the way up to `Object`.
4. `C`'s **instance field initialisers and instance initialiser blocks** (`{ ... }`) run **in source order**.
5. The rest of `C`'s **constructor body** runs.

### Why it exists

The rules guarantee that a superclass is fully set up before a subclass can use it, and that a class's static state exists before any instance does. The cost: during step 3, the object exists but the subclass part is still at default values.

### The danger: overridable calls during construction

If a superclass constructor calls a method that the subclass overrides, the **subclass version runs in step 3**, before the subclass's field initialisers (step 4). It sees `0`/`null` for its own fields, and a `final` field can appear to have two different values.

**Rule:** constructors should only call `private`, `static` or `final` methods of their own class.

### When it matters

- Output-prediction interview questions (very common).
- Frameworks that call `init` hooks from constructors; logging in constructors; listeners registered with `this` during construction.
- Static state that depends on other static state (`static final List<X> ALL = load();` placed above the field it uses).

## Internal working

- `javac` compiles static initialisers and static blocks into one method, **`<clinit>`**, preserving source order. The JVM runs it during *class initialisation*, holding the class's initialisation lock so it happens exactly once even with concurrent first use. A superclass is initialised before its subclass; interfaces are initialised only when their own static fields are used (not when an implementing class is initialised).
- Each constructor becomes an **`<init>`** method. For constructors that don't start with `this(...)`, `javac` emits: the `super(...)` call, then a copy of **all instance initialisers and field initialisers in source order**, then the constructor body. Constructors starting with `this(...)` contain no initialiser code (it runs in the delegated-to constructor).
- `new` allocates and zeroes the object **before** any `<init>` runs, which is why fields read during super-construction see defaults, not garbage.
- **Static field defaults are visible during `<clinit>`**: a static method called from a static initialiser can read a static field that hasn't been assigned yet and get `0`/`null`.
- A **compile-time constant** (`static final int N = 3;`) is never "uninitialised": it's inlined, and its `ConstantValue` attribute sets it during preparation.

## Visual representation

```text title="new Child() where Child extends Parent (both classes not yet initialised)"
  CLASS INITIALISATION (once)              OBJECT CREATION (every new)
  1. Parent static fields/blocks           5. allocate, zero all fields (Parent's and Child's)
  2. Child  static fields/blocks           6. Child(...) starts -> super(...)
                                           7.   Parent(...) starts -> super() -> Object()
                                           8.   Parent instance initialisers (source order)
                                           9.   Parent constructor body
                                                  (an overridden method called here sees
                                                   Child's fields still at default values!)
                                          10. Child instance initialisers (source order)
                                          11. Child constructor body
```

## Java code example

```java title="InitOrderDemo.java" file="InitOrderDemo.java"
public class InitOrderDemo {
    public static void main(String[] args) {
        System.out.println("== first new Child()");
        new Child();
        System.out.println("== second new Child()");
        new Child();
        System.out.println("== static-order trap");
        System.out.println("Config.LIMIT_TIMES_TWO = " + Config.LIMIT_TIMES_TWO);
    }
}

class Parent {
    static String sp = log("Parent static field");

    static {
        log("Parent static block");
    }

    String ip = log("Parent instance field");

    {
        log("Parent instance block");
    }

    Parent() {
        log("Parent constructor body");
        describe();                                   // overridable call from a constructor: dangerous
    }

    void describe() {
        log("Parent.describe");
    }

    static String log(String message) {
        System.out.println("  " + message);
        return message;
    }
}

class Child extends Parent {
    static String sc = log("Child static field");

    static {
        log("Child static block");
    }

    private final String name = log("Child instance field");
    private int size = 42;

    {
        log("Child instance block");
    }

    Child() {
        super();
        log("Child constructor body (name=" + name + ", size=" + size + ")");
    }

    @Override
    void describe() {
        log("Child.describe sees name=" + name + ", size=" + size);   // runs before Child's initialisers
    }
}

class Config {
    static final int LIMIT_TIMES_TWO = doubled();       // runs BEFORE LIMIT is assigned below
    static int LIMIT = 50;

    private static int doubled() {
        return LIMIT * 2;                                // LIMIT is still 0 here
    }
}
```

## Output

```text title="Output" output="InitOrderDemo.java"
== first new Child()
  Parent static field
  Parent static block
  Child static field
  Child static block
  Parent instance field
  Parent instance block
  Parent constructor body
  Child.describe sees name=null, size=0
  Child instance field
  Child instance block
  Child constructor body (name=Child instance field, size=42)
== second new Child()
  Parent instance field
  Parent instance block
  Parent constructor body
  Child.describe sees name=null, size=0
  Child instance field
  Child instance block
  Child constructor body (name=Child instance field, size=42)
== static-order trap
Config.LIMIT_TIMES_TWO = 0
```

- Static initialisation happened **once**, parent before child; the second `new Child()` skipped it.
- `Parent`'s constructor called `describe()`, which dispatched to `Child.describe()` **before** `Child`'s initialisers ran: the `final` field `name` was `null` and `size` was `0`.
- `Config.LIMIT_TIMES_TWO` is `0`: static initialisers run top to bottom, and `doubled()` read `LIMIT` before its initialiser had run.

## Real-world application

- **Framework hooks**: designs that call `init()`/`configure()` from a base-class constructor let subclasses observe half-initialised state. Prefer a separate lifecycle method called after construction (`@PostConstruct` in DI containers) or a static factory that constructs, then initialises.
- **Spring and JPA proxies** subclass your classes; if their constructors call overridable methods, proxy creation can trigger surprising behaviour.
- **Static registries and constants** that depend on each other must be declared in dependency order, or computed lazily.
- **Interview "what does this print?" questions** almost always combine static blocks, instance blocks, constructors and an overridden method call.

## Common mistakes

- **Calling overridable methods (or abstract ones) from constructors.**
- **Letting `this` escape** during construction (registering listeners, starting threads), so other code sees a partly built object.
- **Static fields declared after the static code that uses them.**
- **Assuming instance blocks run before the superclass constructor** — they run after it.
- **Heavy work in static initialisers** that may fail (`ExceptionInInitializerError`, then `NoClassDefFoundError`).
- **Believing a `final` field always has one value**: it can be observed as `null`/`0` before assignment through an overridden call.

## Interview questions

**Q1. What is the exact order of initialisation when you create the first instance of a subclass?**

````reveal title="Answer"
Superclass static initialisers (fields and blocks in source order), then subclass static initialisers; then for the object: fields zeroed, subclass constructor invoked → superclass constructor (recursively to `Object`) → superclass instance initialisers in source order → superclass constructor body → subclass instance initialisers in source order → subclass constructor body. Static initialisation happens only once per class.
````

**Q2. Why is calling an overridable method from a constructor dangerous?**

````reveal title="Answer"
Dynamic dispatch works during construction, so the subclass override runs while the superclass constructor is executing — before the subclass's field initialisers and constructor body. The override sees default values (`null`, `0`), even for `final` fields, and may throw `NullPointerException` or act on wrong state. Call only private/static/final methods from constructors.
````

**Q3. When do instance initialiser blocks run relative to the constructor?**

````reveal title="Answer"
After the superclass constructor returns and before the rest of the current constructor's body. `javac` copies them (with field initialisers, in source order) into every constructor that calls `super(...)`. Constructors that delegate with `this(...)` don't run them directly; the constructor they delegate to does.
````

**Q4. Does creating an instance of a class that implements an interface initialise the interface?**

````reveal title="Answer"
Only in one case. Initialising a class initialises its superclasses, and also those superinterfaces that **declare default methods** (JLS 12.4.1). Other interfaces are initialised only when they are used directly — a static method is invoked or a static field that isn't a compile-time constant is read. So an interface's static code doesn't run just because a class implements it, unless that interface has default methods.
````

## Hands-on exercise

Predict the output, then run it:

```java
class A {
    static { System.out.print("1 "); }
    { System.out.print("2 "); }
    A() { System.out.print("3 "); }
}
class B extends A {
    static { System.out.print("4 "); }
    { System.out.print("5 "); }
    B() { this(0); System.out.print("6 "); }
    B(int x) { System.out.print("7 "); }
}
new B(); System.out.println(); new B();
```

Then fix the `Parent`/`Child` example so `describe()` is never called on a half-built object, while still printing the description once construction finishes.

````hint title="Hint"
Static blocks: once, parent first. Instance blocks of `B` run in the constructor that calls `super()` — that's `B(int)`, not `B()`. For the fix, move the `describe()` call out of the constructor into a static factory that creates the object and then calls it.
````

````solution title="Solution"
```java title="InitQuiz.java" file="InitQuiz.java"
public class InitQuiz {
    public static void main(String[] args) {
        new B();
        System.out.println();
        new B();
        System.out.println();
        Widget w = Widget.create("gauge");          // describe() runs after construction completes
        System.out.println(w.label());
    }
}

class A {
    static {
        System.out.print("1 ");
    }

    {
        System.out.print("2 ");
    }

    A() {
        System.out.print("3 ");
    }
}

class B extends A {
    static {
        System.out.print("4 ");
    }

    {
        System.out.print("5 ");
    }

    B() {
        this(0);
        System.out.print("6 ");
    }

    B(int x) {
        System.out.print("7 ");
    }
}

class Widget {
    private final String name;
    private String label;

    private Widget(String name) {
        this.name = name;                            // constructor only assigns state
    }

    static Widget create(String name) {
        Widget w = new Widget(name);
        w.describe();                                // safe: the object is fully constructed
        return w;
    }

    void describe() {
        label = "widget '" + name + "' ready";
    }

    String label() {
        return label;
    }
}
```

```text title="Output" output="InitQuiz.java"
1 4 2 3 5 7 6 
2 3 5 7 6 
widget 'gauge' ready
```

`B()` delegates to `B(int)`, which calls `super()` (printing `2 3`), then runs `B`'s instance block (`5`) and its body (`7`); control returns to `B()` for `6`. The static blocks (`1 4`) appear only before the first object.
````

## Knowledge check

```quiz
? Which runs first when `new Child()` is the first use of both classes?
+ Parent's static block
- Child's static block
- Parent's constructor
> Class initialisation is parent-first and precedes object creation.

? When do Child's instance initialiser blocks run?
- Before Parent's constructor
+ After Parent's constructor returns, before the rest of Child's constructor body
- After Child's constructor body
> javac places them right after the super(...) call.

? A Parent constructor calls an overridden method that reads a Child field initialised to 42. What does it see?
+ 0
- 42
- A compile error prevents this
> The Child field initialiser hasn't run yet.

? `static int A = twice(); static int B = 5; static int twice() { return B * 2; }` — value of A?
+ 0
- 10
> Static initialisers run in source order; B is still 0 when twice() runs.

? How many times does a class's static block run?
+ Once per class (per class loader)
- Once per object
- Every time a static method is called
> Class initialisation happens exactly once.
```

## Key takeaways

- **Class init (once, parent first):** static fields and static blocks in **source order**.
- **Object init:** zero fields → constructor → **super constructor chain** → this class's **instance initialisers in source order** → constructor body.
- `this(...)` delegation means initialisers run in the constructor that calls `super(...)`.
- Overridable calls from constructors see **default values** — even for `final` fields. Don't make them.
- Order static declarations by dependency, or compute lazily.
