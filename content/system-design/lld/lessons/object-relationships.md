## How objects relate

Objects rarely live alone. A design is mostly a web of relationships, and naming them precisely tells your reader **who owns whom** and **how long things live**. From weakest to strongest:

| Relationship | Meaning | Lifetime | Example |
|---|---|---|---|
| **Dependency** | "uses temporarily" | Not stored | `ReportService` uses a `Clock` passed into a method |
| **Association** | "knows about" | Independent | A `Booking` references a `Customer` |
| **Aggregation** | "has, but doesn't own" | Parts outlive the whole | A `Team` has `Player`s, who can move teams |
| **Composition** | "owns; part of" | Parts die with the whole | An `Order` owns its `OrderLine`s |

Inheritance (**is-a**) and realization (**implements**) are covered in [UML Class Diagram Basics](lesson:uml-basics).

## Dependency — used, not kept

The class uses another type as a parameter, local variable or return value, but doesn't store a reference.

```java
class InvoicePrinter {
    String print(Invoice invoice, java.time.Clock clock) {   // depends on Invoice and Clock
        return invoice.number() + " printed at " + clock.instant();
    }
}
```

## Association — a long-lived reference

One object holds a reference to another, but neither creates nor destroys the other.

```java
class Booking {
    private final Customer customer;   // association: the customer exists independently
    Booking(Customer customer) { this.customer = customer; }
}
```

Associations have a **direction** (navigability). Here `Booking` knows its `Customer`; the customer doesn't necessarily know its bookings. Keep associations **one-directional** unless both directions are really needed. Bidirectional links must be kept in sync, which is a common source of bugs.

## Aggregation — a whole made of shareable parts

The whole holds references to parts that are created elsewhere and can outlive it or belong to several wholes.

```java
class Team {
    private final List<Player> players = new ArrayList<>();
    void sign(Player p) { players.add(p); }        // player created elsewhere
    void release(Player p) { players.remove(p); }  // player still exists afterwards
}
```

## Composition — exclusive ownership

The whole **creates and owns** its parts. Parts are never shared, and when the whole goes away, the parts go with it. In Java, this usually shows up as: the whole constructs the parts itself, and never exposes them for outsiders to keep.

```java title="Composition: the order owns its lines" file="OrderCompositionDemo.java"
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class OrderCompositionDemo {
    public static void main(String[] args) {
        Order order = new Order("ORD-1");
        order.addLine("Keyboard", 1, 2_500);
        order.addLine("Mouse", 2, 700);
        System.out.println(order.id() + " total = " + order.total());
        System.out.println("Lines: " + order.lines());
    }
}

/** Value object describing one line. Immutable, so sharing a read-only view is safe. */
record OrderLine(String product, int quantity, long unitPrice) {
    OrderLine {
        if (quantity <= 0) throw new IllegalArgumentException("quantity must be > 0");
    }
    long subtotal() { return quantity * unitPrice; }
}

class Order {
    private final String id;
    private final List<OrderLine> lines = new ArrayList<>();   // created and owned by Order

    Order(String id) { this.id = id; }

    /** Parts are created here, by the whole - callers never construct or hold mutable lines. */
    void addLine(String product, int quantity, long unitPrice) {
        lines.add(new OrderLine(product, quantity, unitPrice));
    }

    long total() { return lines.stream().mapToLong(OrderLine::subtotal).sum(); }

    String id() { return id; }

    /** Read-only view: outsiders can look but not modify the composition. */
    List<OrderLine> lines() { return Collections.unmodifiableList(lines); }
}
```

## Multiplicity — how many?

Each end of a relationship can carry a **multiplicity**:

| Notation | Meaning | Java shape |
|---|---|---|
| `1` | exactly one | non-null field |
| `0..1` | optional | nullable field or `Optional` return |
| `*` or `0..*` | any number | `List`/`Set`/`Map` |
| `1..*` | at least one | collection + constructor check |

```uml title="Relationships with multiplicity"
class Order
  - lines: List<OrderLine>
  + addLine(product: String, qty: int, price: long): void
class OrderLine
class Customer
class Team
class Player
class InvoicePrinter
  + print(invoice: Invoice, clock: Clock): String
Order *-- "1..*" OrderLine : owns
Order --> "1" Customer : placed by
Team o-- "0..*" Player : roster
InvoicePrinter ..> Order : formats
```

> [!TIP] Composition vs aggregation in practice
> Interviewers rarely penalise mixing up the diamond shapes. They *do* care whether you understand **ownership**: who creates the part, who can change it, and what happens to it when the whole is deleted. Say it in words: *"A `Level` owns its `Spot`s — spots never move between levels."*

## Real-world example

In a document editor, a `Document` **composes** its `Page`s (deleting a document deletes its pages). Pages **aggregate** `Image` assets from a shared media library (deleting a page doesn't delete the image file). A `Comment` is **associated** with its `User` author. Getting these wrong leads to real bugs: deleting a document that cascaded into deleting shared images used by other documents.

## Common mistakes

- **Exposing composed parts mutably.** Returning the internal `List<OrderLine>` lets callers add lines that bypass the order's rules.
- **Bidirectional everything.** `Order` knows `Customer` *and* `Customer` holds `List<Order>`, maintained in two places. Prefer one direction plus a query (`orderRepository.findByCustomer(id)`).
- **Composition across aggregate boundaries.** A `Customer` shouldn't own `Order`s in memory just because there's a foreign key. Large object graphs become slow and hard to keep consistent.
- **Unclear lifetimes.** Not deciding what happens to children when the parent is removed.

## In the interview

> [!INTERVIEW] What to say while drawing
> Label arrows with a verb and a multiplicity: *"ParkingLot owns 1..* Levels, each Level owns its Spots; a Ticket refers to exactly one Spot."* That one sentence communicates more than a perfectly drawn diamond.

## Key takeaways

- **Dependency** (uses) < **association** (knows) < **aggregation** (has, shared) < **composition** (owns, exclusive).
- Composition means the whole **creates, controls and outlives** its parts; don't leak them mutably.
- Add **multiplicity** to every relationship and map it to Java types.
- Prefer **one-directional** associations.

## Knowledge check

```quiz
? A ParkingLevel creates its ParkingSpots in its constructor; spots never move between levels. What is the relationship?
- Dependency
- Aggregation
+ Composition
- Association
> The level creates and exclusively owns its spots, and they don't outlive it.

? Which Java signature best expresses a `0..1` relationship from Ticket to Payment?
- `List<Payment> payments()`
+ `Optional<Payment> payment()`
- `Payment payment()` that never returns null
> `Optional` documents that the payment may be absent.

? Why is returning the internal `ArrayList` from `Order.lines()` a problem?
+ Callers can add or remove lines and bypass Order's validation
- ArrayList cannot be returned from methods
- It is slower than returning an array
> Leaking a mutable internal collection breaks encapsulation of the composition.
```

## Exercise

Model a university:

- A `University` has `Department`s. Departments are created by and belong to exactly one university.
- A `Department` has `Professor`s, but a professor can hold joint appointments in two departments.
- A `Course` is taught by one `Professor` and belongs to one `Department`.
- `Student`s enroll in many courses; a course has many students.

Identify each relationship type and multiplicity, then sketch the fields in Java.

````hint title="Hint"
Ask, for each pair: who creates whom? Can the part be shared? What happens when the whole is deleted?
````

````solution title="Sample answer"
| Pair | Relationship | Multiplicity |
|---|---|---|
| University → Department | Composition | 1 → 1..* |
| Department → Professor | Aggregation (shared by joint appointments) | * ↔ * |
| Course → Professor | Association | * → 1 |
| Department → Course | Composition (a course belongs to one department) | 1 → 0..* |
| Student ↔ Course | Association via an `Enrollment` object | * ↔ * |

```java
class University { private final List<Department> departments = new ArrayList<>(); }
class Department { private final Set<Professor> faculty = new HashSet<>(); private final List<Course> courses = new ArrayList<>(); }
class Course { private final Professor instructor; private final Department department; }
record Enrollment(Student student, Course course, String term) {}
```

Modelling the many-to-many as an `Enrollment` object gives a natural home for per-enrollment data such as grade and term.
````
