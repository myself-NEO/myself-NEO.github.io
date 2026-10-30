## Concept explanation

### What it is

`static` marks a member as belonging to the **class itself** rather than to any instance:

| Static member | Meaning |
|---|---|
| **Static field** | one variable shared by all instances (and usable with no instance) |
| **Static method** | called on the class (`Math.max`); has no `this` |
| **Static initialiser block** | `static { ... }` — runs once when the class is initialised |
| **Static nested class** | a class declared inside another that doesn't need an outer instance |
| **Static import** | use a static member without its class name (see [packages](lesson:packages-imports-cli)) |

### Why it exists

Some data and behaviour genuinely belong to the concept, not to individual objects: a count of instances created, a constant like `MAX_RETRIES`, a pure function like `Math.abs`, a factory like `List.of`. Without `static`, you'd need an object just to call a function that doesn't use any object state.

### Rules

- A static method can't use `this`, `super`, or instance members directly — there's no current object. It can create objects and call their methods.
- Instance methods **can** use static members.
- Static methods are **not polymorphic**. A subclass that declares a static method with the same signature **hides** the parent's method; which one runs depends on the **compile-time type** of the expression (or the class name), never on the object. `@Override` on a static method is a compile error.
- Calling a static method through a reference (`obj.staticMethod()`) compiles, with a warning, and ignores the object entirely — even `null` works.

### When to use it

- **Constants**: `static final`.
- **Pure utility functions** that depend only on their arguments: put them in a final class with a private constructor (`Collections`, `Objects`, `Math`).
- **Static factory methods**: `Duration.ofMinutes(5)`.
- **Static nested classes** for helpers that don't need the outer instance (builders, nodes of a linked list).

Avoid **mutable static state** (global variables): it's shared across all requests and threads, hard to test, and lives as long as the class is loaded.

## Internal working

- **Storage:** static fields are part of the class's run-time data. In HotSpot they live in the `java.lang.Class` mirror object on the heap (since JDK 7). There is exactly one copy **per class per class loader** — two class loaders loading the same class produce two independent sets of statics.
- **Initialisation:** during *preparation* static fields get default values; during *initialisation* the compiler-generated **`<clinit>`** method runs all static field initialisers and `static {}` blocks **in source order**, exactly once, under a lock that makes it thread-safe. Initialisation happens lazily on first active use: `new`, a static method call, reading a non-constant static field, or `Class.forName`. (Reading a compile-time constant does **not** initialise the class: the value was inlined by `javac`.)
- **Invocation:** static calls compile to `invokestatic` with a fixed target method — no receiver, no virtual dispatch. That's why hiding, not overriding, is the rule.
- If `<clinit>` throws, the class is marked erroneous: the first access gets `ExceptionInInitializerError`, every later access `NoClassDefFoundError`.
- The **initialisation-on-demand holder idiom** uses this lazy, thread-safe `<clinit>` to build lazy singletons without locks (see [thread-safe singleton](problem:thread-safe-singleton)).

## Visual representation

```text title="Static versus instance members"
               class Order  (one per class loader)
   +--------------------------------------------------------+
   | static int created = 3        static Order of(...)     |
   | static final int MAX_ITEMS    static { ... } (<clinit>)|
   +--------------------------------------------------------+
        ^ shared by every Order, reachable without an instance

   Order #1                 Order #2                 Order #3
   +----------------+       +----------------+       +----------------+
   | id = 1         |       | id = 2         |       | id = 3         |
   | items = [...]  |       | items = [...]  |       | items = [...]  |
   +----------------+       +----------------+       +----------------+
     instance fields: one copy per object
```

## Java code example

```java title="StaticDemo.java" file="StaticDemo.java"
public class StaticDemo {
    public static void main(String[] args) {
        System.out.println("main starts");
        Order a = Order.of("book");                  // first use triggers Order's <clinit>
        Order b = Order.of("pen");
        System.out.println(a + ", " + b + ", created = " + Order.created());

        // Hiding, not overriding: chosen by the compile-time type
        Animal animal = new Dog();
        System.out.println("animal.describe(): " + animal.describe());    // instance: dynamic dispatch -> Dog
        System.out.println("Animal.kind():     " + Animal.kind());
        System.out.println("Dog.kind():        " + Dog.kind());
        @SuppressWarnings("static")
        String viaReference = animal.kind();         // static call on a reference: uses Animal (compile-time type)
        System.out.println("animal.kind():     " + viaReference);

        Animal nothing = null;
        @SuppressWarnings("static")
        String viaNull = nothing.kind();             // no NPE: the reference is ignored
        System.out.println("null.kind():       " + viaNull);

        System.out.println("max via utility: " + MathUtil.clamp(42, 0, 10));
    }
}

final class Order {
    static final int MAX_ITEMS = 50;                  // compile-time constant
    private static int created;                       // shared counter
    private static final String PREFIX;

    static {
        PREFIX = "ORD-";
        System.out.println("Order class initialised");
    }

    private final String id;
    private final String item;

    private Order(String item) {
        this.id = PREFIX + (++created);
        this.item = item;
    }

    static Order of(String item) {                    // static factory
        return new Order(item);
    }

    static int created() {
        return created;                               // a static method can read static state
    }

    @Override
    public String toString() {
        return id + "(" + item + ")";                 // instance methods can use statics too
    }
}

class Animal {
    static String kind() {
        return "animal";
    }

    String describe() {
        return "generic animal";
    }
}

class Dog extends Animal {
    static String kind() {                            // HIDES Animal.kind(); @Override would not compile
        return "dog";
    }

    @Override
    String describe() {
        return "a dog";
    }
}

final class MathUtil {
    private MathUtil() {                              // no instances of a utility class
    }

    static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }
}
```

## Output

```text title="Output" output="StaticDemo.java"
main starts
Order class initialised
ORD-1(book), ORD-2(pen), created = 2
animal.describe(): a dog
Animal.kind():     animal
Dog.kind():        dog
animal.kind():     animal
null.kind():       animal
max via utility: 10
```

- `Order class initialised` printed **after** `main starts`: the class was initialised lazily at the first `Order.of` call.
- `animal.describe()` ran `Dog`'s version (instance methods are dispatched on the object). `animal.kind()` ran `Animal`'s, because static calls are bound to the variable's declared type — `Dog.kind()` hides, it doesn't override.
- Calling a static method through a `null` reference doesn't throw: the compiler replaces the reference with the class.

## Real-world application

- **Constants and configuration keys** (`static final Duration TIMEOUT`).
- **Factories and utilities** across the JDK: `List.of`, `Map.entry`, `Objects.requireNonNull`, `Collections.unmodifiableList`, `Files.readString`.
- **Loggers**: `private static final Logger log = LoggerFactory.getLogger(MyClass.class);` — one logger per class, not per object.
- **Caches and registries**: tempting as statics, but they become hidden global state; in services prefer an instance managed by the DI container so it can be configured, replaced in tests and shut down.
- **Memory leaks** in application servers often come from static collections that keep growing, or statics that keep a whole class loader alive after redeploy.

## Common mistakes

- **Mutable static fields** shared by all requests/threads without synchronisation.
- **Expecting static methods to be overridden** and polymorphic.
- **Calling static methods through instances** — misleading; IDEs warn for a reason.
- **"non-static ... cannot be referenced from a static context"**: trying to use instance fields from `main`. Create an object.
- **Heavy or failing static initialisers**, which turn into `ExceptionInInitializerError` and then `NoClassDefFoundError`.
- **Static helpers that need to be mocked** in tests: static calls are hard-wired; inject an interface instead when behaviour must vary.

## Interview questions

**Q1. Can you override a static method?**

````reveal title="Answer"
No. A subclass method with the same signature **hides** the superclass static method. Static calls are resolved at compile time (`invokestatic`) using the declared type or class name, so `Parent p = new Child(); p.staticMethod()` calls `Parent`'s version. `@Override` on a static method doesn't compile, and an instance method can't override (or be hidden by) a static one with the same signature — that's a compile error.
````

**Q2. When is a static block executed?**

````reveal title="Answer"
Once, when the class is initialised — on its first active use (instantiation, static method call, access to a non-constant static field, reflection like `Class.forName`, or initialisation of a subclass). Static blocks and static field initialisers run in source order inside `<clinit>`, which the JVM runs under a lock, so it's thread-safe. Loading a class without using it (or reading an inlined constant) doesn't run it.
````

**Q3. Why can't a static method access instance variables?**

````reveal title="Answer"
Instance variables belong to a particular object, and a static method is called without one — there's no `this` to say *whose* field. A static method can access instance members of an object it has a reference to (`order.total()`), just not implicitly.
````

**Q4. Are static fields thread-safe?**

````reveal title="Answer"
No more than instance fields. Their *initialisation* in `<clinit>` is thread-safe, but later reads and writes from several threads need synchronisation, `volatile`, atomics, or immutability. Because statics are shared by every thread in the JVM, unsynchronised mutable statics are a classic source of race conditions.
````

## Hands-on exercise

Write an `IdGenerator` class:

- a static method `next(String prefix)` that returns `prefix-1`, `prefix-2`, … with an **independent counter per prefix**;
- a static method `resetForTests()`;
- a private constructor (no instances).

Then explain in a comment why this design is awkward for unit tests, and sketch the non-static alternative.

````hint title="Hint"
Keep a `static final Map<String, Integer>` and use `merge(prefix, 1, Integer::sum)` to increment and read in one call. For thread safety, use a `ConcurrentHashMap`.
````

````solution title="Solution"
```java title="IdGeneratorDemo.java" file="IdGeneratorDemo.java"
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class IdGeneratorDemo {
    public static void main(String[] args) {
        System.out.println(IdGenerator.next("ORD") + " " + IdGenerator.next("ORD") + " " + IdGenerator.next("INV"));
        IdGenerator.resetForTests();
        System.out.println(IdGenerator.next("ORD"));

        // The instance-based alternative: each test (or tenant) gets its own generator.
        SequenceGenerator orders = new SequenceGenerator();
        SequenceGenerator invoices = new SequenceGenerator();
        System.out.println(orders.next("ORD") + " " + invoices.next("ORD"));
    }
}

/**
 * Global, static state: every caller in the JVM shares the counters, so tests interfere with each
 * other unless they remember to reset, and there is no way to substitute another implementation.
 */
final class IdGenerator {
    private static final Map<String, Integer> COUNTERS = new ConcurrentHashMap<>();

    private IdGenerator() {
    }

    static String next(String prefix) {
        return prefix + "-" + COUNTERS.merge(prefix, 1, Integer::sum);   // atomic per key
    }

    static void resetForTests() {
        COUNTERS.clear();
    }
}

/** Instance state: inject it where needed; tests create fresh instances. */
final class SequenceGenerator {
    private final Map<String, Integer> counters = new ConcurrentHashMap<>();

    String next(String prefix) {
        return prefix + "-" + counters.merge(prefix, 1, Integer::sum);
    }
}
```

```text title="Output" output="IdGeneratorDemo.java"
ORD-1 ORD-2 INV-1
ORD-1
ORD-1 ORD-1
```
````

## Knowledge check

```quiz
? `Parent p = new Child(); p.greet();` where `greet` is static in both classes. Which runs?
+ Parent.greet()
- Child.greet()
- Compile error
> Static methods are bound to the compile-time type; Child.greet hides, it doesn't override.

? How many copies of a static field exist?
- One per object
+ One per class (per class loader)
- One per thread
> Statics belong to the class.

? When does a class's static block run?
- When the JVM starts
+ Once, on the class's first active use
- Every time an instance is created
> Class initialisation is lazy and happens once.

? Which is NOT allowed inside a static method?
- Creating a new object
- Calling another static method
+ Using `this`
> There is no current instance in a static context.

? Calling a static method through a null reference, `MyClass x = null; x.util();`, does what?
+ Calls MyClass.util() normally
- Throws NullPointerException
- Doesn't compile
> The reference is only used for its static type.
```

## Key takeaways

- `static` members belong to the **class**: one copy per class loader, usable without instances, no `this`.
- Static initialisers run **once, lazily, thread-safely** in `<clinit>`, in source order.
- Static methods are bound at compile time: subclasses **hide**, never override them.
- Use static for **constants, pure utilities, factories and nested helper classes**.
- Avoid **mutable static state**: it's global, shared across threads, and hard to test.
