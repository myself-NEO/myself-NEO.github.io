## Concept explanation

### What it is

An **enum** is a class with a **fixed set of named instances**, declared up front:

```java
public enum OrderStatus { CREATED, PAID, SHIPPED, DELIVERED, CANCELLED }
```

Unlike C enums, Java enums are full classes. They can have:

- **fields and constructors** (constructors are implicitly `private`),
- **methods**, including abstract ones,
- **constant-specific bodies** that override methods per constant,
- **interfaces** they implement.

Every enum implicitly extends `java.lang.Enum` (so it can't extend anything else), is effectively final, and gets:

| Member | Meaning |
|---|---|
| `values()` | a **new array** of all constants, in declaration order |
| `valueOf(String)` | the constant with that exact name, or `IllegalArgumentException` |
| `name()` | the declared name (final; `toString()` returns it unless overridden) |
| `ordinal()` | the position in the declaration (0-based) |
| `compareTo` | by ordinal; enums are `Comparable` |

### Why it exists

Before Java 5, constants were `public static final int` values: no type safety (`setStatus(42)` compiled), no namespace, no behaviour, and printing showed numbers. Enums give:

- **Type safety**: a method taking `OrderStatus` accepts only its constants (or `null`).
- **Singletons per constant**: compare with `==`, safely.
- **Behaviour with data**: each constant can carry values and implement methods.
- **Fast specialised collections**: `EnumSet` and `EnumMap`.
- **Exhaustive switches**: switch expressions over enums must cover every constant (or have a `default`).

### When to use it

Whenever a value comes from a **closed, known-at-compile-time set**: statuses, types, units, days, directions, roles, feature flags, HTTP methods. If the set changes at run time (product categories from a database), use data, not an enum.

### Behaviour inside the enum

Put logic that varies per constant **in the constant** instead of switching on it everywhere:

```java
enum Operation {
    PLUS("+")  { int apply(int a, int b) { return a + b; } },
    TIMES("*") { int apply(int a, int b) { return a * b; } };
    private final String symbol;
    Operation(String symbol) { this.symbol = symbol; }
    abstract int apply(int a, int b);
}
```

Adding a constant then forces you to implement `apply` — the compiler won't let you forget.

## Internal working

- `javac` compiles an enum to a `final` class extending `Enum<OrderStatus>`, with one `public static final` field per constant, plus a private static `$VALUES` array. The constants are created in the class's **static initialiser**, in declaration order — so the JVM's class-initialisation guarantees make them **thread-safe singletons**.
- Constants with bodies compile to **anonymous subclasses** (`Operation$1`, `Operation$2`), which is why `getClass()` differs from `getDeclaringClass()` for them.
- `values()` returns `$VALUES.clone()` — a **new array every call**; cache it if you call it in a hot loop.
- `valueOf` uses a lazily built name → constant map (`Enum.valueOf` via `Class.enumConstantDirectory()`).
- **Switch on an enum** compiles to a `tableswitch` on the ordinal through a synthetic lookup array (so reordering constants in a separately compiled library doesn't break callers).
- **Serialization** writes only the constant's name and resolves it back to the existing instance, and **reflection can't instantiate** enums (`Constructor.newInstance` throws) — that's why an enum is the most robust singleton.
- **`EnumSet`** is a bit vector (one `long` for up to 64 constants); **`EnumMap`** is an array indexed by ordinal. Both are much faster and smaller than `HashSet`/`HashMap` (see [specialized maps and sets](lesson:specialized-maps-and-sets)).

## Visual representation

```text title="What javac generates for an enum with a constant-specific body"
  enum Operation { PLUS("+") {...}, TIMES("*") {...}; ... }

  final class Operation extends Enum<Operation>     (abstract here: it has an abstract method)
     public static final Operation PLUS   -> instance of Operation$1  (name "PLUS",  ordinal 0)
     public static final Operation TIMES  -> instance of Operation$2  (name "TIMES", ordinal 1)
     private static final Operation[] $VALUES = { PLUS, TIMES }
     static { PLUS = new Operation$1("PLUS", 0, "+"); TIMES = new Operation$2("TIMES", 1, "*"); ... }

  EnumSet<Day> weekend = EnumSet.of(SAT, SUN)   ->   bits: 0b1100000   (one long)
  EnumMap<Day, Shift> roster                    ->   array[7] indexed by ordinal
```

## Java code example

```java title="EnumsDemo.java" file="EnumsDemo.java"
import java.util.Arrays;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

public class EnumsDemo {
    public static void main(String[] args) {
        // Fields, constructor, methods
        for (Planet p : Planet.values()) {
            System.out.printf(Locale.ROOT, "%-7s ordinal=%d gravity=%.1f%n", p, p.ordinal(), p.surfaceGravity());
        }

        // Constant-specific behaviour instead of switch
        for (Operation op : Operation.values()) {
            System.out.println("6 " + op.symbol() + " 3 = " + op.apply(6, 3));
        }

        // valueOf, name, comparison
        OrderStatus s = OrderStatus.valueOf("PAID");
        System.out.println(s.name() + " == PAID? " + (s == OrderStatus.PAID) + ", before SHIPPED? " + (s.compareTo(OrderStatus.SHIPPED) < 0));
        try {
            OrderStatus.valueOf("paid");
        } catch (IllegalArgumentException e) {
            System.out.println("valueOf is case-sensitive: " + e.getMessage());
        }

        // State machine rules live in the enum
        System.out.println("PAID -> SHIPPED allowed? " + OrderStatus.PAID.canMoveTo(OrderStatus.SHIPPED));
        System.out.println("DELIVERED -> CANCELLED allowed? " + OrderStatus.DELIVERED.canMoveTo(OrderStatus.CANCELLED));

        // Exhaustive switch expression (Java 14+): no default needed
        System.out.println("PAID label: " + label(OrderStatus.PAID));

        // EnumSet and EnumMap
        Set<OrderStatus> terminal = EnumSet.of(OrderStatus.DELIVERED, OrderStatus.CANCELLED);
        Set<OrderStatus> active = EnumSet.complementOf(EnumSet.copyOf(terminal));
        Map<OrderStatus, Integer> counts = new EnumMap<>(OrderStatus.class);
        for (OrderStatus st : new OrderStatus[] {OrderStatus.PAID, OrderStatus.CREATED, OrderStatus.PAID}) {
            counts.merge(st, 1, Integer::sum);
        }
        System.out.println("active = " + active + ", counts = " + counts);

        // values() returns a fresh array every time
        System.out.println("values() copies: " + (OrderStatus.values() != OrderStatus.values())
                + ", " + Arrays.toString(OrderStatus.values()));

        // The enum singleton
        System.out.println("next id: " + IdSequence.INSTANCE.next() + ", " + IdSequence.INSTANCE.next());
    }

    static String label(OrderStatus status) {
        return switch (status) {
            case CREATED -> "awaiting payment";
            case PAID -> "ready to ship";
            case SHIPPED -> "on the way";
            case DELIVERED -> "done";
            case CANCELLED -> "cancelled";
        };
    }
}

enum Planet {
    MERCURY(3.303e+23, 2.4397e6),
    EARTH(5.976e+24, 6.37814e6),
    JUPITER(1.9e+27, 7.1492e7);

    private static final double G = 6.67300E-11;
    private final double mass;
    private final double radius;

    Planet(double mass, double radius) {                  // implicitly private
        this.mass = mass;
        this.radius = radius;
    }

    double surfaceGravity() {
        return G * mass / (radius * radius);
    }
}

enum Operation {
    PLUS("+") {
        @Override
        int apply(int a, int b) {
            return a + b;
        }
    },
    MINUS("-") {
        @Override
        int apply(int a, int b) {
            return a - b;
        }
    },
    TIMES("*") {
        @Override
        int apply(int a, int b) {
            return a * b;
        }
    };

    private final String symbol;

    Operation(String symbol) {
        this.symbol = symbol;
    }

    String symbol() {
        return symbol;
    }

    abstract int apply(int a, int b);                     // every constant must implement it
}

enum OrderStatus {
    CREATED, PAID, SHIPPED, DELIVERED, CANCELLED;

    boolean canMoveTo(OrderStatus next) {
        switch (this) {
            case CREATED:
                return next == PAID || next == CANCELLED;
            case PAID:
                return next == SHIPPED || next == CANCELLED;
            case SHIPPED:
                return next == DELIVERED;
            default:
                return false;                             // DELIVERED and CANCELLED are terminal
        }
    }
}

enum IdSequence {
    INSTANCE;                                             // thread-safe, serialization- and reflection-proof

    private long last;

    synchronized long next() {
        return ++last;
    }
}
```

## Output

```text title="Output" output="EnumsDemo.java"
MERCURY ordinal=0 gravity=3.7
EARTH   ordinal=1 gravity=9.8
JUPITER ordinal=2 gravity=24.8
6 + 3 = 9
6 - 3 = 3
6 * 3 = 18
PAID == PAID? true, before SHIPPED? true
valueOf is case-sensitive: No enum constant OrderStatus.paid
PAID -> SHIPPED allowed? true
DELIVERED -> CANCELLED allowed? false
PAID label: ready to ship
active = [CREATED, PAID, SHIPPED], counts = {CREATED=1, PAID=2}
values() copies: true, [CREATED, PAID, SHIPPED, DELIVERED, CANCELLED]
next id: 1, 2
```

- Each `Planet` carries its own data; `surfaceGravity()` is ordinary code.
- `Operation` puts the varying behaviour in each constant; a new constant without `apply` wouldn't compile.
- The switch **expression** in `label` has no `default`: the compiler checks all five constants are covered.
- `EnumSet`/`EnumMap` iterate in declaration order.
- `IdSequence.INSTANCE` is a singleton: one instance, created during class initialisation.

## Real-world application

- **Status fields and state machines** (`OrderStatus`, `PaymentState`) with transition rules inside the enum — see the [state machines lesson](#system-design/lld/learn/state-machines) in System Design.
- **JDK enums**: `TimeUnit` (with conversion methods per constant), `DayOfWeek`, `ChronoUnit`, `RoundingMode`, `StandardCharsets`-like constants, `Thread.State`.
- **Strategy registries**: `enum Shipping implements CostPolicy { STANDARD {...}, EXPRESS {...} }` selected from configuration with `valueOf`.
- **Persistence**: JPA's `@Enumerated(EnumType.STRING)` stores names — never `ORDINAL`, which breaks when constants are reordered.
- **Feature flags and permissions** as `EnumSet`s.

## Common mistakes

- **Persisting or serialising `ordinal()`** — inserting a constant renumbers everything after it.
- **`valueOf` on untrusted input** without handling `IllegalArgumentException` (and its case sensitivity).
- **Giant `switch` statements** on an enum scattered across the codebase instead of methods on the enum.
- **Mutable state in enum constants** (they're global singletons shared by all threads).
- **Calling `values()` repeatedly in hot code** (allocates a new array each time).
- **Using enums for open-ended sets** that should be data.
- **Comparing with `equals` and worrying about it** — `==` is correct and null-safe on the left.

## Interview questions

**Q1. How are Java enums different from enums in C?**

````reveal title="Answer"
Java enums are full classes: each constant is an object (a singleton instance of the enum class) with optional fields, constructors and methods, possibly constant-specific behaviour, and they can implement interfaces. They're type-safe (a parameter of the enum type only accepts its constants or `null`), print their names, and come with `values()`, `valueOf()`, `ordinal()`, `EnumSet` and `EnumMap`. C enums are just named integers.
````

**Q2. Why is an enum the best way to implement a singleton?**

````reveal title="Answer"
The JVM creates enum constants exactly once during class initialisation (thread-safe, lazy on first use of the enum). Serialization preserves the single instance (it serialises the name and resolves it back), and reflection is forbidden from creating new enum instances. Hand-written singletons need extra code (`readResolve`, constructor guards) for those guarantees. The limitation: an enum can't extend another class.
````

**Q3. Can an enum have a constructor? Can you call it?**

````reveal title="Answer"
Yes, and it's implicitly `private` (declaring it `public` or `protected` is a compile error). Only the enum's own constant declarations invoke it, during class initialisation. You can't call `new` on an enum.
````

**Q4. What's wrong with storing `ordinal()` in a database?**

````reveal title="Answer"
The ordinal is just the declaration position. Adding, removing or reordering constants silently changes the meaning of stored numbers (`2` used to be SHIPPED, now it's CANCELLED). Store `name()`, or an explicit stable code field you control.
````

**Q5. What does `values()` return, and is it cheap?**

````reveal title="Answer"
A new array containing all constants in declaration order — the compiler implements it as `$VALUES.clone()`, so every call allocates. Cache it in a `private static final` field (or use `EnumSet.allOf`) if you call it frequently.
````

## Hands-on exercise

Model coffee sizes and drinks:

- `enum Size { SMALL(250), MEDIUM(350), LARGE(450) }` with millilitres and a `price(Drink d)` that applies a size multiplier (1.0, 1.25, 1.5).
- `enum Drink` with a base price in cents and an abstract `String describe(Size s)` implemented per constant (`ESPRESSO` says "double shot" for LARGE, `LATTE` mentions milk volume).
- A safe parser `static Optional<Size> parseSize(String raw)` that accepts any case and surrounding spaces.

````hint title="Hint"
`Size.valueOf(raw.strip().toUpperCase(Locale.ROOT))` inside a try/catch for `IllegalArgumentException`. Compute prices with `Math.round(base * multiplier)` in cents.
````

````solution title="Solution"
```java title="CoffeeDemo.java" file="CoffeeDemo.java"
import java.util.Locale;
import java.util.Optional;

public class CoffeeDemo {
    public static void main(String[] args) {
        for (Drink d : Drink.values()) {
            for (Size s : Size.values()) {
                System.out.println(d + " " + s + " (" + s.ml() + "ml): " + s.price(d) + "c - " + d.describe(s));
            }
        }
        System.out.println(parseSize("  large ") + " " + parseSize("venti"));
    }

    static Optional<Size> parseSize(String raw) {
        try {
            return Optional.of(Size.valueOf(raw.strip().toUpperCase(Locale.ROOT)));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}

enum Size {
    SMALL(250, 1.0), MEDIUM(350, 1.25), LARGE(450, 1.5);

    private final int ml;
    private final double multiplier;

    Size(int ml, double multiplier) {
        this.ml = ml;
        this.multiplier = multiplier;
    }

    int ml() {
        return ml;
    }

    long price(Drink d) {
        return Math.round(d.baseCents() * multiplier);
    }
}

enum Drink {
    ESPRESSO(220) {
        @Override
        String describe(Size s) {
            return s == Size.LARGE ? "double shot" : "single shot";
        }
    },
    LATTE(380) {
        @Override
        String describe(Size s) {
            return "espresso with " + (s.ml() - 50) + "ml steamed milk";
        }
    };

    private final int baseCents;

    Drink(int baseCents) {
        this.baseCents = baseCents;
    }

    int baseCents() {
        return baseCents;
    }

    abstract String describe(Size s);
}
```

```text title="Output" output="CoffeeDemo.java"
ESPRESSO SMALL (250ml): 220c - single shot
ESPRESSO MEDIUM (350ml): 275c - single shot
ESPRESSO LARGE (450ml): 330c - double shot
LATTE SMALL (250ml): 380c - espresso with 200ml steamed milk
LATTE MEDIUM (350ml): 475c - espresso with 300ml steamed milk
LATTE LARGE (450ml): 570c - espresso with 400ml steamed milk
Optional[LARGE] Optional.empty
```
````

## Knowledge check

```quiz
? What is the implicit superclass of every enum?
+ java.lang.Enum
- java.lang.Object directly
- java.lang.Record
> Which is why an enum can't extend another class (but can implement interfaces).

? Which access modifier can an enum constructor have?
+ private (implicitly) or package-private written explicitly
- public
- protected
> Enum constructors can't be public or protected.

? How should you compare two enum values?
+ With == (each constant is a singleton)
- Only with equals
- By comparing ordinal() values
> == is correct and null-safe on the left.

? Why is storing ordinal() in a database risky?
+ Reordering or inserting constants changes the numbers
- ordinal() is random
- ordinal() is not unique
> Store name() or an explicit code.

? A switch expression over an enum lists every constant and has no default. What happens when a constant is added later and the code is recompiled?
+ Compile error until the new constant is handled
- The new constant falls through silently
> Switch expressions must be exhaustive.
```

## Key takeaways

- Enums are **classes with a fixed set of singleton instances**: fields, private constructors, methods, interfaces, constant-specific bodies.
- They give **type safety**, `==` comparison, `values()`/`valueOf()`, and fast **`EnumSet`/`EnumMap`**.
- Put **varying behaviour in the constants** (or exhaustive switch expressions) instead of scattered switches.
- Never persist **`ordinal()`**; store `name()` or a stable code.
- An enum is the most robust **singleton** (thread-safe, serialization- and reflection-proof).
