## Concept explanation

### What it is

A **constructor** is a special block that runs when an object is created with `new`. It has the class's name and **no return type** (not even `void`). Its job: turn freshly zeroed memory into a **valid** object.

```java
public class Point {
    private final int x, y;
    public Point(int x, int y) {   // constructor
        this.x = x;
        this.y = y;
    }
}
```

### Why it exists

Without constructors, every caller would have to create an object and then remember to set each field correctly. Constructors make **"an object exists" imply "an object is valid"**: if the arguments break the rules, the constructor throws and no half-built object escapes.

### The default constructor

If you write **no** constructor, the compiler adds a public (well, same access as the class) **no-argument default constructor** that calls `super()`. As soon as you declare any constructor, the default one is **not** generated — `new Point()` then fails to compile.

### Constructor overloading and chaining

A class can have several constructors with different parameter lists. To avoid duplicating validation, one constructor delegates to another with **`this(...)`**, which must be the **first statement**:

```java
public Point() { this(0, 0); }              // delegates to the full constructor
```

Similarly `super(...)` calls a superclass constructor (see [inheritance](lesson:inheritance)). A constructor can start with `this(...)` **or** `super(...)`, not both. If it starts with neither, the compiler inserts `super()`.

> [!NOTE] Java 25: statements before `this()`/`super()`
> JEP 513 (*flexible constructor bodies*, final in Java 25) allows statements such as argument validation **before** an explicit `this(...)` or `super(...)` call, as long as they don't use the instance being constructed. In Java 17 the call must come first.

### Every use of `this`

| Use | Example | Why |
|---|---|---|
| Refer to a field shadowed by a parameter | `this.x = x;` | parameter names that match fields are idiomatic |
| Call another constructor | `this(0, 0);` | constructor chaining |
| Pass the current object | `registry.register(this);` | callbacks, listeners (careful in constructors!) |
| Return the current object | `return this;` | fluent APIs and builders |
| Qualified `this` in inner classes | `Outer.this.field` | reach the enclosing instance |

`this` doesn't exist in `static` methods: there is no current object.

### When to use what

- One constructor that takes **everything required**, with validation; convenience overloads delegate to it.
- More than ~4 parameters, or many optional ones → a **builder** or a **static factory method** (`Duration.ofSeconds(5)`, `List.of(...)`), which can have descriptive names and return cached instances.
- Never do heavy work (I/O, starting threads) in a constructor.

## Internal working

- `javac` compiles each constructor to a method named **`<init>`**. A constructor that doesn't start with `this(...)` gets, in order: the `super(...)` call, then **all instance field initialisers and instance initialiser blocks** (in source order), then the constructor body. A constructor that starts with `this(...)` skips the initialisers — the delegated-to constructor already ran them, so they execute exactly once.
- `new Point(1, 2)` compiles to `new Point; dup; iconst_1; iconst_2; invokespecial Point.<init>(II)V`. The JVM allocates and zeroes the object **before** `<init>` runs, which is why a field read inside the constructor before assignment sees `0`/`null`.
- The bytecode verifier enforces that `<init>` calls a superclass (or same-class) constructor before the object is used, which is how "`super()`/`this()` first" is guaranteed even for hand-written bytecode.
- Constructors are **not inherited** and are **not polymorphic**: they are invoked with `invokespecial`, never through virtual dispatch.
- `final` fields must be **definitely assigned** in every constructor path; the Java Memory Model then guarantees other threads see those values once the constructor finishes, provided `this` didn't escape during construction.

## Visual representation

```text title="Constructor chaining with this(...)"
  new Rectangle()                       new Rectangle(5)                new Rectangle(4, 3)
        |                                     |                                |
        v                                     v                                |
  Rectangle()  --- this(1) --->  Rectangle(int side) --- this(side, side) --->  |
                                                                                 v
                                                          Rectangle(int w, int h)
                                                            super()   (Object)
                                                            field initialisers
                                                            validate w > 0, h > 0
                                                            this.width = w; this.height = h
  All paths end in ONE place that validates and assigns.
```

## Java code example

```java title="ConstructorsDemo.java" file="ConstructorsDemo.java"
public class ConstructorsDemo {
    public static void main(String[] args) {
        System.out.println(new Rectangle());
        System.out.println(new Rectangle(5));
        System.out.println(new Rectangle(4, 3).scale(2).scale(2));    // fluent: scale returns a new object
        try {
            new Rectangle(-1, 3);
        } catch (IllegalArgumentException e) {
            System.out.println("rejected: " + e.getMessage());
        }

        Temperature t = Temperature.ofFahrenheit(212);                 // static factory with a clear name
        System.out.println(t + " / " + Temperature.ofCelsius(-40));

        Counter counter = new Counter().increment().increment().increment();
        System.out.println("counter = " + counter.value());
    }
}

final class Rectangle {
    private static int created;
    private final int width;
    private final int height;
    private final int id = ++created;          // field initialiser: runs once per object

    Rectangle() {
        this(1);                               // delegate: no duplicated validation
    }

    Rectangle(int side) {
        this(side, side);
    }

    Rectangle(int width, int height) {
        if (width <= 0 || height <= 0) {
            throw new IllegalArgumentException("sides must be positive: " + width + "x" + height);
        }
        this.width = width;                    // this.width is the field, width the parameter
        this.height = height;
    }

    Rectangle scale(int factor) {
        return new Rectangle(width * factor, height * factor);
    }

    @Override
    public String toString() {
        return "Rectangle#" + id + " " + width + "x" + height + " area=" + (width * height);
    }
}

final class Temperature {
    private final double celsius;

    private Temperature(double celsius) {      // private: callers use the named factories
        this.celsius = celsius;
    }

    static Temperature ofCelsius(double c) {
        return new Temperature(c);
    }

    static Temperature ofFahrenheit(double f) {
        return new Temperature((f - 32) * 5 / 9);
    }

    @Override
    public String toString() {
        return celsius + " C";
    }
}

final class Counter {
    private int value;

    Counter increment() {
        value++;
        return this;                           // return the current object for chaining
    }

    int value() {
        return value;
    }
}
```

## Output

```text title="Output" output="ConstructorsDemo.java"
Rectangle#1 1x1 area=1
Rectangle#2 5x5 area=25
Rectangle#5 16x12 area=192
rejected: sides must be positive: -1x3
100.0 C / -40.0 C
counter = 3
```

- All three `Rectangle` constructors funnel into the two-argument one, so validation lives in one place.
- The `id` field initialiser ran once per object — `Rectangle#5` is the fifth object because `scale` created #4 and #5.
- The rejected rectangle still consumed an id (#6): field initialisers run **before** the constructor body's validation. Construction failed, so the object was never returned.
- `Temperature`'s constructor is private; named factories make the unit explicit.

## Real-world application

- **Value objects** (`Money`, `EmailAddress`, `OrderId`) validate in their constructor so an invalid instance can't exist anywhere in the system.
- **Dependency injection** frameworks (Spring) prefer **constructor injection**: required collaborators are constructor parameters, fields are `final`, and the object is complete once constructed.
- **JDK factories** — `List.of`, `Optional.empty()`, `Integer.valueOf`, `Path.of` — use static factory methods to return cached or specialised instances, something a constructor can't do.
- **Builders** (`HttpRequest.newBuilder()...build()`) replace constructors with many optional parameters.

## Common mistakes

- **Adding a return type** (`public void Point(...)`) — it silently becomes an ordinary method, and the class keeps the default constructor.
- **Declaring a constructor with parameters and expecting `new X()` to still work.**
- **Duplicated validation** in several overloads instead of delegating with `this(...)`.
- **Calling overridable methods in a constructor**: a subclass override runs before the subclass's fields are initialised (see [initialisation order](lesson:object-initialization-order)).
- **Letting `this` escape** from a constructor (registering a listener, starting a thread with `this`): other threads may see a half-built object.
- **Telescoping constructors** with many parameters of the same type: `new User("a", "b", "c", true, false)` — use a builder.

## Interview questions

**Q1. Are constructors inherited? Can they be overridden?**

````reveal title="Answer"
No to both. A subclass doesn't inherit its superclass's constructors; it must declare its own, and each one calls a superclass constructor (explicitly or the implicit `super()`). Constructors aren't virtual methods — they're invoked with `invokespecial` on the exact class — so overriding doesn't apply. They can be overloaded.
````

**Q2. Why must `this(...)` or `super(...)` be the first statement (before Java 25)?**

````reveal title="Answer"
To guarantee that the superclass part of the object is initialised before any subclass code can use the object. The verifier enforces it at the bytecode level. Java 25's flexible constructor bodies relax the rule only for code that doesn't touch `this` (e.g. validating or transforming arguments), so the guarantee still holds.
````

**Q3. When does the compiler generate a default constructor?**

````reveal title="Answer"
Only when the class declares no constructors at all. It is no-arg, has the same access modifier as the class, and calls `super()`. If the superclass has no accessible no-arg constructor, the class fails to compile until you write a constructor that calls an existing superclass constructor.
````

**Q4. Constructor or static factory method — how do you choose?**

````reveal title="Answer"
Static factories can have descriptive names (`ofFahrenheit`), return cached or shared instances (`Boolean.valueOf`), return a subtype or a different implementation (`List.of`), and avoid ambiguous overloads. Constructors are simpler and required for subclassing. A common design: private constructor plus named factories for value types; public constructor for straightforward classes and DI-managed services.
````

## Hands-on exercise

Write an immutable `Email` value class:

- Constructor `Email(String address)` trims and lower-cases the address (with `Locale.ROOT`) and rejects anything without exactly one `@` and a non-empty local and domain part.
- A second constructor `Email(String local, String domain)` delegates to the first.
- A static factory `tryParse(String raw)` that returns `Optional<Email>` instead of throwing.

````hint title="Hint"
`this(local + "@" + domain)` delegates. Check `indexOf('@') == lastIndexOf('@')` for "exactly one". In `tryParse`, catch the `IllegalArgumentException` and return `Optional.empty()`.
````

````solution title="Solution"
```java title="EmailDemo.java" file="EmailDemo.java"
import java.util.Locale;
import java.util.Optional;

public class EmailDemo {
    public static void main(String[] args) {
        System.out.println(new Email("  Ada@Example.COM "));
        System.out.println(new Email("grace", "navy.mil"));
        System.out.println(Email.tryParse("no-at-sign"));
        System.out.println(Email.tryParse("a@b@c"));
        System.out.println(Email.tryParse("linus@kernel.org").map(Email::domain).orElse("?"));
    }
}

final class Email {
    private final String value;

    Email(String address) {
        String normalised = address.strip().toLowerCase(Locale.ROOT);
        int at = normalised.indexOf('@');
        if (at <= 0 || at != normalised.lastIndexOf('@') || at == normalised.length() - 1) {
            throw new IllegalArgumentException("invalid email: " + address);
        }
        this.value = normalised;
    }

    Email(String local, String domain) {
        this(local + "@" + domain);
    }

    static Optional<Email> tryParse(String raw) {
        try {
            return Optional.of(new Email(raw));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }

    String domain() {
        return value.substring(value.indexOf('@') + 1);
    }

    @Override
    public String toString() {
        return value;
    }
}
```

```text title="Output" output="EmailDemo.java"
ada@example.com
grace@navy.mil
Optional.empty
Optional.empty
kernel.org
```
````

## Knowledge check

```quiz
? A class declares only `Car(String model)`. What happens with `new Car()`?
- The compiler-generated default constructor runs
+ Compile error: no no-arg constructor exists
- model is set to null
> The default constructor is only generated when no constructor is declared.

? Where must `this(...)` appear in a Java 17 constructor?
+ As the first statement
- Anywhere, but only once
- As the last statement
> The constructor call must come first so the object is initialised before use.

? Which line assigns the field rather than the parameter?
- `name = name;`
+ `this.name = name;`
- `name = this.name;`
> this.name refers to the field shadowed by the parameter.

? What happens if you write `public void Point(int x, int y)`?
- It's a constructor with a void return
+ It's an ordinary method named Point; the class still gets a default constructor
- Compile error
> Constructors have no return type; adding one makes it a method.

? A constructor delegates with `this(...)`. How many times do field initialisers run?
+ Once, in the constructor that does not delegate
- Once per constructor in the chain
- Never
> javac only inlines initialisers into constructors that call super().
```

## Key takeaways

- Constructors make **creation imply validity**; they have no return type and aren't inherited.
- No constructor declared → a **default no-arg** one is generated; declare any → it isn't.
- Chain overloads with **`this(...)`** (first statement) so validation lives in one place.
- `this` means the current object: fields, chaining, fluent returns, passing yourself (not from constructors).
- Prefer **static factories** or **builders** when names, caching or many optional parameters matter.
