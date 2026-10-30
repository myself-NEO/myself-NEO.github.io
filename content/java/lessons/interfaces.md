## Concept explanation

### What it is

An **interface** is a named contract: a set of method signatures (and constants) that implementing classes promise to provide.

```java
public interface PaymentGateway {
    Receipt charge(Money amount, Card card);          // implicitly public abstract
}

public class StripeGateway implements PaymentGateway {
    @Override public Receipt charge(Money amount, Card card) { /* ... */ }
}
```

What an interface may contain:

| Member | Since | Notes |
|---|---|---|
| abstract methods | 1.0 | implicitly `public abstract` |
| constants | 1.0 | implicitly `public static final` |
| **default** methods | Java 8 | `default void log() {...}` — inherited implementation that classes may override |
| **static** methods | Java 8 | `Comparator.naturalOrder()` — called on the interface, **not inherited** by implementers |
| **private** methods | Java 9 | helpers shared by default/static methods |
| nested types | 1.0 | implicitly `static` |

Interfaces have **no instance fields and no constructors**: they carry behaviour and contracts, never per-object state.

### Why it exists

- **Decoupling:** callers depend on `PaymentGateway`, not on `StripeGateway`. You can swap implementations, run tests with a fake, or choose one at run time.
- **Multiple inheritance of type:** a class can implement any number of interfaces — `ArrayList implements List, RandomAccess, Cloneable, Serializable` — and be used wherever any of them is expected.
- **Capabilities across unrelated classes:** `Comparable`, `AutoCloseable`, `Runnable` apply to classes with nothing else in common.
- **Evolving APIs:** default methods (Java 8) let the JDK add `forEach`, `stream`, `removeIf` to `Collection` without breaking every existing implementation.

### Multiple inheritance and the diamond rules

A class may inherit two default methods with the same signature. Java resolves conflicts with three rules (JLS 8.4.8 / 9.4.1):

1. **Classes win.** A method declared in the class or any superclass beats any interface default.
2. **The most specific interface wins.** If `B extends A` and both supply `hello()`, `B`'s default wins.
3. **Otherwise it's ambiguous** and won't compile: the class must override the method and may call a chosen parent with `InterfaceName.super.method()`.

Because interfaces have no fields, there's no ambiguity about **state** — the problem that made Java reject multiple class inheritance.

### Functional interfaces

An interface with exactly **one abstract method** (`Runnable`, `Comparator`, `Predicate`) can be implemented by a **lambda**. `@FunctionalInterface` asks the compiler to enforce the rule. See [lambdas](lesson:lambdas-and-functional-interfaces).

### Interface or abstract class?

| Need | Use |
|---|---|
| A contract that unrelated classes can fulfil | interface |
| A type that a class adds **alongside** other types | interface |
| Shared **state** (fields) or constructors | abstract class |
| A template method with protected hooks | abstract class |
| A lambda-friendly single operation | functional interface |

A common combination: interface for the contract + optional abstract "skeletal" class (`List` + `AbstractList`).

## Internal working

- An interface compiles to a class file with `ACC_INTERFACE | ACC_ABSTRACT`. Default methods are ordinary non-abstract methods in that file; static interface methods are called with `invokestatic`.
- Calls through an interface type compile to **`invokeinterface`**. Because a class can implement interfaces in any order, a single vtable index can't work; HotSpot uses **itables** (a per-class table per implemented interface) and, much more often, **inline caches**: a call site remembers the receiver classes it has seen and calls the target directly. Monomorphic interface calls are as fast as direct calls after JIT compilation.
- A class implementing an interface gets **default methods** in its method tables unless it (or a superclass) provides its own — that's how rule 1 is implemented.
- `X.super.m()` compiles to `invokespecial` on the named interface, which is only allowed for a **direct** superinterface.
- Constants are compile-time-inlined like any `static final` constant. Putting constants in an interface just to "inherit" them (the *constant interface antipattern*) pollutes the implementing class's API; use a final class or enum instead.

## Visual representation

```text title="The diamond: which default wins?"
              interface Greeter
              default hello() -> "Greeter"
               ^                    ^
               |                    |
   interface Polite            interface Loud
   default hello() -> "Polite" default hello() -> "LOUD"
               ^                    ^
               +---------+----------+
                         |
              class Robot implements Polite, Loud
              -> COMPILE ERROR unless Robot overrides hello()
                 and picks: Polite.super.hello() / Loud.super.hello()

   class Butler extends Person implements Polite   (Person has hello())
              -> Person.hello() wins: classes beat interfaces (rule 1)
```

## Java code example

```java title="InterfacesDemo.java" file="InterfacesDemo.java"
import java.util.ArrayList;
import java.util.List;

public class InterfacesDemo {
    public static void main(String[] args) {
        // Program to the interface; swap implementations freely
        List<Notifier> channels = List.of(new EmailNotifier(), new SmsNotifier(), message -> "[slack] " + message);
        for (Notifier n : channels) {
            System.out.println(n.send("build #42 failed"));
        }
        System.out.println(Notifier.broadcast(channels, "deploy done").size() + " notifications via the static helper");

        // Multiple interfaces on one class
        Drone drone = new Drone();
        Flyer flyer = drone;
        Camera camera = drone;
        System.out.println(flyer.fly() + " / " + camera.photo());

        // Diamond resolution
        System.out.println("Robot: " + new Robot().hello());
        System.out.println("Butler: " + new Butler().hello());
        System.out.println("Intern: " + new Intern().hello());
    }
}

@FunctionalInterface
interface Notifier {
    String send(String message);                               // the single abstract method

    default String sendUrgent(String message) {                // default method
        return send(prefix() + message);
    }

    private String prefix() {                                  // private helper (Java 9)
        return "URGENT: ";
    }

    static List<String> broadcast(List<Notifier> channels, String message) {   // static method
        List<String> results = new ArrayList<>();
        for (Notifier n : channels) {
            results.add(n.sendUrgent(message));
        }
        return results;
    }
}

class EmailNotifier implements Notifier {
    @Override
    public String send(String message) {
        return "[email] " + message;
    }
}

class SmsNotifier implements Notifier {
    @Override
    public String send(String message) {
        return "[sms] " + message.substring(0, Math.min(12, message.length()));
    }
}

interface Flyer {
    default String fly() {
        return "flying";
    }
}

interface Camera {
    String photo();
}

class Drone implements Flyer, Camera {
    @Override
    public String photo() {
        return "click";
    }
}

interface Greeter {
    default String hello() {
        return "Greeter";
    }
}

interface Polite extends Greeter {
    @Override
    default String hello() {
        return "Polite";
    }
}

interface Loud extends Greeter {
    @Override
    default String hello() {
        return "LOUD";
    }
}

class Robot implements Polite, Loud {
    @Override
    public String hello() {                                    // required: two equally specific defaults
        return Polite.super.hello() + " + " + Loud.super.hello();
    }
}

class Person {
    public String hello() {
        return "Person";
    }
}

class Butler extends Person implements Polite {                // rule 1: the class method wins
}

class Intern implements Greeter, Polite {                      // rule 2: Polite is more specific than Greeter
}
```

## Output

```text title="Output" output="InterfacesDemo.java"
[email] build #42 failed
[sms] build #42 fa
[slack] build #42 failed
3 notifications via the static helper
flying / click
Robot: Polite + LOUD
Butler: Person
Intern: Polite
```

- The third notifier is a **lambda**: `Notifier` has one abstract method.
- `Drone` is both a `Flyer` and a `Camera`.
- `Robot` had to resolve the conflict itself; `Butler` got `Person.hello()` because a class method beats a default; `Intern` got `Polite`'s default because `Polite` extends `Greeter`.

## Real-world application

- **Dependency inversion in services**: controllers depend on `OrderService`, repositories are interfaces (`OrderRepository`), and Spring/DI injects the implementation; tests inject fakes.
- **The JDK's core abstractions** are interfaces: `List`, `Map`, `Comparator`, `Iterable`, `AutoCloseable`, `Executor`, `Path`.
- **Plug-ins**: `java.sql.Driver` and other SPI interfaces are implemented by third parties and discovered with `ServiceLoader` (see [modules and SPI](lesson:modules-and-spi)).
- **API evolution**: library authors add default methods to published interfaces to avoid breaking implementers — the way `Collection.stream()` arrived in Java 8.

## Common mistakes

- **Interfaces mirroring a single class one-to-one** with no second implementation and no testing need ("header interfaces").
- **Fat interfaces** that force implementers to stub methods they don't support (violates interface segregation).
- **Putting state-like behaviour in defaults** (defaults can't hold fields; they can only call other methods).
- **The constant interface antipattern** (`implements Constants`).
- **Forgetting that static interface methods aren't inherited**: `EmailNotifier.broadcast(...)` doesn't compile; call `Notifier.broadcast(...)`.
- **Adding an abstract method to a published interface** — every implementation breaks; add a default method instead.

## Interview questions

**Q1. What's the difference between an abstract class and an interface in modern Java?**

````reveal title="Answer"
Interfaces can have abstract, default, static and private methods but **no instance fields and no constructors**; a class can implement many. Abstract classes can have state, constructors, any access modifiers and final methods, but a class extends only one. Use interfaces for contracts and capabilities (and lambdas), abstract classes for shared state and template-method skeletons. They're often combined.
````

**Q2. How does Java resolve a conflict between two default methods?**

````reveal title="Answer"
Three rules: (1) a method from a class or superclass wins over any default; (2) otherwise the most specific sub-interface wins; (3) otherwise the class must override the method — it can delegate with `A.super.method()`. Without the override, compilation fails.
````

**Q3. Why were default methods added in Java 8?**

````reveal title="Answer"
To evolve interfaces without breaking existing implementations. Adding `stream()`, `forEach()` or `removeIf()` as abstract methods to `Collection` would have broken every third-party collection. Defaults also enable small "mixin" behaviours and convenience methods (`Comparator.reversed()`, `thenComparing()`).
````

**Q4. Can an interface have a constructor or instance variables? Why not?**

````reveal title="Answer"
No. Interfaces describe behaviour, not state; fields are implicitly `public static final` constants. Not having state is what makes multiple inheritance of interfaces safe: there's never ambiguity about which copy of a field an object has, or which constructor initialises it.
````

**Q5. What is a marker interface? Give examples.**

````reveal title="Answer"
An interface with no methods that tags a class with a capability checked elsewhere: `Serializable` (ObjectOutputStream checks it), `Cloneable` (`Object.clone` checks it), `RandomAccess` (algorithms choose index-based loops). Modern code often uses annotations instead, but marker interfaces have the advantage of being a type the compiler can check.
````

## Hands-on exercise

Design a small discount system:

- `interface DiscountRule { long apply(long priceCents); }` plus a **default** method `andThen(DiscountRule next)` that applies this rule and then `next`, and a **static** factory `percentOff(int pct)`.
- Implement `FlatOff(long cents)` as a class and a "minimum price 100" rule as a **lambda**.
- Combine rules and price an item of 2,500 cents: 10 % off, then 300 off, then the floor.

````hint title="Hint"
`andThen` returns a new `DiscountRule`: `price -> next.apply(apply(price))`. For percentages, compute in `long`: `price * (100 - pct) / 100`.
````

````solution title="Solution"
```java title="DiscountDemo.java" file="DiscountDemo.java"
public class DiscountDemo {
    public static void main(String[] args) {
        DiscountRule floor = price -> Math.max(100, price);
        DiscountRule pipeline = DiscountRule.percentOff(10).andThen(new FlatOff(300)).andThen(floor);
        System.out.println("2500 -> " + pipeline.apply(2500));
        System.out.println("350  -> " + pipeline.apply(350));
    }
}

@FunctionalInterface
interface DiscountRule {
    long apply(long priceCents);

    default DiscountRule andThen(DiscountRule next) {
        return price -> next.apply(apply(price));
    }

    static DiscountRule percentOff(int pct) {
        if (pct < 0 || pct > 100) {
            throw new IllegalArgumentException("percent must be 0..100");
        }
        return price -> price * (100 - pct) / 100;
    }
}

final class FlatOff implements DiscountRule {
    private final long cents;

    FlatOff(long cents) {
        this.cents = cents;
    }

    @Override
    public long apply(long priceCents) {
        return priceCents - cents;
    }
}
```

```text title="Output" output="DiscountDemo.java"
2500 -> 1950
350  -> 100
```

2500 → 2250 (10 % off) → 1950 (−300) → 1950 (above the floor). For 350: 315 → 15 → 100 (floor).
````

## Knowledge check

```quiz
? Which can an interface NOT declare?
- A static method
- A private method
+ An instance field
> Interface fields are implicitly public static final constants.

? A class extends `Person` (which has `hello()`) and implements `Polite` (default `hello()`). Which runs?
+ Person.hello()
- Polite.hello()
- Compile error
> Rule 1: class methods beat interface defaults.

? A class implements two unrelated interfaces with the same default method. What must it do?
+ Override the method (optionally delegating with X.super.method())
- Nothing; the first interface listed wins
- Extend one of the interfaces
> Unresolved default conflicts are compile errors.

? Which bytecode instruction calls a method through an interface reference?
- invokevirtual
+ invokeinterface
- invokestatic
> Interface dispatch uses invokeinterface (itables / inline caches).

? Why could Java add `forEach` to `Iterable` in Java 8 without breaking existing classes?
+ It was added as a default method with an implementation
- All implementations were updated by the JDK
- Interfaces can't be implemented outside the JDK
> Default methods let interfaces evolve.
```

## Key takeaways

- An interface is a **contract**: abstract methods plus optional **default**, **static** and **private** methods — but **no state or constructors**.
- A class can implement **many** interfaces: multiple inheritance of **type and behaviour**, never of state.
- Default conflicts: **class wins → most specific interface wins → otherwise override** (using `X.super.m()`).
- One abstract method = **functional interface** = lambda-friendly.
- Depend on interfaces to decouple callers from implementations; keep them small and focused.
