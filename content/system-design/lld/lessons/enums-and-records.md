## Two features that remove a lot of boilerplate

LLD solutions are full of **fixed sets of values** (vehicle sizes, order statuses, coin denominations) and **small immutable data carriers** (money, positions, time slots). Java has a purpose-built feature for each: **enums** and **records**. Using them well makes designs shorter and safer.

## Enums: more than named constants

An enum is a class with a fixed set of instances. Compare:

```java
// Fragile: any string compiles, typos fail at runtime.
if (status.equals("CANCELED")) { ... }   // was it "CANCELLED"?

// Safe: the compiler knows every legal value.
if (status == OrderStatus.CANCELLED) { ... }
```

Enums can have **fields, constructors and methods**, so related data and behaviour live together:

```java title="Enums carrying data and behaviour" file="EnumDemo.java"
import java.util.EnumMap;
import java.util.Map;

public class EnumDemo {
    public static void main(String[] args) {
        System.out.println(Coin.TEN.value() + " rupees");
        System.out.println(SpotSize.MEDIUM.fits(VehicleSize.BIKE));    // true
        System.out.println(SpotSize.SMALL.fits(VehicleSize.CAR));      // false

        Map<Coin, Integer> till = new EnumMap<>(Coin.class);            // compact and ordered
        till.merge(Coin.FIVE, 3, Integer::sum);
        till.merge(Coin.TEN, 2, Integer::sum);
        System.out.println(till);

        for (Operation op : Operation.values()) {
            System.out.println("6 " + op.symbol + " 3 = " + op.apply(6, 3));
        }
    }
}

enum Coin {
    ONE(1), TWO(2), FIVE(5), TEN(10);

    private final int value;
    Coin(int value) { this.value = value; }
    int value() { return value; }
}

enum VehicleSize { BIKE, CAR, TRUCK }

enum SpotSize {
    SMALL(VehicleSize.BIKE), MEDIUM(VehicleSize.CAR), LARGE(VehicleSize.TRUCK);

    private final VehicleSize largestAllowed;
    SpotSize(VehicleSize largestAllowed) { this.largestAllowed = largestAllowed; }

    /** The rule lives with the data it depends on. */
    boolean fits(VehicleSize v) { return v.ordinal() <= largestAllowed.ordinal(); }
}

/** Constant-specific bodies: each constant implements the abstract method. */
enum Operation {
    PLUS("+") { int apply(int a, int b) { return a + b; } },
    MINUS("-") { int apply(int a, int b) { return a - b; } },
    TIMES("*") { int apply(int a, int b) { return a * b; } };

    final String symbol;
    Operation(String symbol) { this.symbol = symbol; }
    abstract int apply(int a, int b);
}
```

Useful companions:

- **`EnumMap`** and **`EnumSet`** — very fast, compact collections keyed by enums (internally an array or a bit vector).
- **`switch` expressions** (Java 14+) over enums are exhaustive and concise:

```java
long baseRate = switch (size) {
    case SMALL -> 20;
    case MEDIUM -> 40;
    case LARGE -> 80;
};   // compile error if a constant is missing (for switch expressions)
```

## Enums for states

Enums are the natural representation for a lifecycle. You can even encode the allowed transitions:

```java
enum OrderStatus {
    PLACED, PAID, SHIPPED, DELIVERED, CANCELLED;

    boolean canMoveTo(OrderStatus next) {
        return switch (this) {
            case PLACED -> next == PAID || next == CANCELLED;
            case PAID -> next == SHIPPED || next == CANCELLED;
            case SHIPPED -> next == DELIVERED;
            case DELIVERED, CANCELLED -> false;
        };
    }
}
```

This idea is developed fully in [State Machines](lesson:state-machines).

## When an enum should become a class hierarchy

Enums are **closed**: adding a constant means editing the enum. That's perfect when the set is fixed by the domain (days of the week, chess piece colours). It's a poor fit when:

- New variants are added **frequently**, or by **other teams or plugins** (payment providers, notification channels).
- Each variant needs **different dependencies** (an SMS sender needs an HTTP client; email needs SMTP config).
- Behaviour per constant grows large — constant-specific bodies become an unreadable class.

In those cases use an **interface with implementations**. See [Strategy](lesson:strategy) and [Extensible APIs](lesson:extensible-apis).

## Records: transparent, immutable data carriers

A record declares its state once; Java generates the constructor, accessors (`name()` rather than `getName()`), `equals`, `hashCode` and `toString`.

```java title="Records with validation and behaviour" file="RecordDemo.java"
import java.time.LocalTime;

public class RecordDemo {
    public static void main(String[] args) {
        Position a = new Position(2, 3);
        System.out.println(a.equals(new Position(2, 3)));       // value equality: true
        System.out.println(a.move(1, -1));

        TimeSlot morning = new TimeSlot(LocalTime.of(9, 0), LocalTime.of(10, 30));
        TimeSlot overlap = new TimeSlot(LocalTime.of(10, 0), LocalTime.of(11, 0));
        System.out.println("Overlaps? " + morning.overlaps(overlap));

        try {
            new Position(-1, 0);
        } catch (IllegalArgumentException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
    }
}

record Position(int row, int col) {
    Position {                                  // compact constructor: validate
        if (row < 0 || col < 0) throw new IllegalArgumentException("negative coordinate");
    }
    Position move(int dRow, int dCol) { return new Position(row + dRow, col + dCol); }
}

record TimeSlot(LocalTime start, LocalTime end) {
    TimeSlot {
        if (!end.isAfter(start)) throw new IllegalArgumentException("end must be after start");
    }
    boolean overlaps(TimeSlot other) {
        return start.isBefore(other.end) && other.start.isBefore(end);
    }
}
```

### When *not* to use a record

- **Entities with identity and a lifecycle** (`Order`, `Booking`). Records use value equality: two orders with the same fields would be "equal", and you can't change their status.
- Types that need to **hide** their representation. Record components are always exposed through accessors.
- Types that need **inheritance**. Records are implicitly `final` (they can implement interfaces, though).

## Real-world example

A logistics service stored shipment states as strings and had `"IN_TRANSIT"`, `"InTransit"` and `"in-transit"` in production data from different services. Migrating to an `enum ShipmentStatus` with `canMoveTo()` caught three illegal transitions at compile or test time, and the database column became a check-constrained enum.

## Common mistakes

- **Using `ordinal()` for persisted data.** Reordering constants changes ordinals and corrupts stored data. Store `name()` or an explicit code field. (Using `ordinal()` for in-memory comparisons, as in `SpotSize.fits`, is fine.)
- **Giant enums** with dependencies and I/O inside constant bodies.
- **Records for mutable entities.**
- **Forgetting validation** in compact constructors, so invalid values slip in.

## In the interview

> [!INTERVIEW] Quick wins
> Use enums for statuses, types and denominations, and records for value objects. Then say why: *"`SpotSize` is an enum because the set is fixed; `PaymentMethod` is an interface because new methods will be added."* That distinction shows real design judgement.

## Key takeaways

- **Enums** model closed sets and can carry data, behaviour and transition rules; pair them with `EnumMap`/`EnumSet`.
- **Records** are concise, immutable value objects — validate in the compact constructor.
- Switch from an enum to an **interface hierarchy** when the set is open or variants need different dependencies.
- Never persist `ordinal()`.

## Knowledge check

```quiz
? New payment providers are integrated every few months, each needing its own API client. How should PaymentProvider be modelled?
- As an enum with one constant per provider
+ As an interface with one implementation per provider
- As a String field
> The set is open and variants need different dependencies, so an interface fits better than an enum.

? Why is a record a poor choice for an Order entity?
- Records cannot have methods
+ Records use value equality and are immutable, but an order has identity and a changing status
- Records cannot be stored in a List
> Entities need identity-based equality and controlled mutation.

? What's the risk of storing `status.ordinal()` in a database?
+ Reordering or inserting constants silently changes the meaning of stored values
- ordinal() is slow
- ordinal() can return null
> Ordinals depend on declaration order; persist names or explicit codes instead.
```

## Exercise

Create:

1. An `enum Denomination` for Indian notes (10, 20, 50, 100, 200, 500) with a `value()` method and a static method `largestFirst()` that returns the constants in descending value order.
2. A `record CashBundle(Map<Denomination, Integer> notes)` that validates there are no negative counts, takes an immutable copy, and has a `total()` method.

````hint title="Hint"
`EnumMap` keeps keys in declaration order. For `largestFirst()`, you can reverse `values()` if you declare the constants in ascending order.
````

````solution title="Reference solution"
```java file="CashDemo.java"
import java.util.Arrays;
import java.util.Collections;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

public class CashDemo {
    public static void main(String[] args) {
        System.out.println(Denomination.largestFirst());
        CashBundle bundle = new CashBundle(Map.of(Denomination.D500, 2, Denomination.D100, 3));
        System.out.println(bundle.total());   // 1300
    }
}

enum Denomination {
    D10(10), D20(20), D50(50), D100(100), D200(200), D500(500);

    private final int value;
    Denomination(int value) { this.value = value; }
    int value() { return value; }

    static List<Denomination> largestFirst() {
        List<Denomination> list = Arrays.asList(values().clone());
        Collections.reverse(list);
        return List.copyOf(list);
    }
}

record CashBundle(Map<Denomination, Integer> notes) {
    CashBundle {
        notes.forEach((d, count) -> {
            if (count < 0) throw new IllegalArgumentException("negative count for " + d);
        });
        EnumMap<Denomination, Integer> copy = new EnumMap<>(Denomination.class);   // also works when empty
        copy.putAll(notes);
        notes = Collections.unmodifiableMap(copy);
    }

    long total() {
        return notes.entrySet().stream().mapToLong(e -> (long) e.getKey().value() * e.getValue()).sum();
    }
}
```

Why `new EnumMap<>(Denomination.class)` plus `putAll` rather than `new EnumMap<>(notes)`? The copy constructor throws on an empty non-`EnumMap` input. The [ATM](problem:atm) problem uses this structure for cash dispensing.
````
