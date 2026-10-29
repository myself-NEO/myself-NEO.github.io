## From requirements to things

Once requirements are written down, the next step is to find the **entities** — the core "things" your system manages — and decide **who is responsible for what**. Get this right and the class design almost writes itself. Get it wrong and you end up with a `Manager` class that does everything while every other class is an empty data holder.

## Step 1 — Noun and verb analysis

Read the requirements and underline:

- **Nouns** → candidate classes or fields.
- **Verbs** → candidate methods (behaviour).

Take three parking lot requirements:

> 1. A **vehicle** **enters** through an **entry gate** and receives a **ticket**.
> 2. The **lot** **assigns** the nearest free **spot** that fits the vehicle's **size**.
> 3. On **exit**, the **fee** is **calculated** from the **duration** and the vehicle **type**.

| Noun | Decision | Why |
|---|---|---|
| Vehicle | Class (or record) | Has identity (plate) and a type that affects rules |
| Entry gate | Probably out of scope as a class | No behaviour of its own in these requirements |
| Ticket | Class | Has state (entry time, spot, paid?) that changes |
| Lot | Class — the orchestrator | Owns the collection of spots and the assignment rule |
| Spot | Class | Has state (free/occupied) and a rule (fits a size) |
| Size | Enum | A small fixed set of values |
| Fee | Value (`Money` or `long` cents) | Computed, not stored independently |
| Duration | `java.time.Duration` | Already exists in the JDK |

Not every noun becomes a class. Ask: **does it have state that changes, or rules to enforce?** If not, it is probably a field, an enum, or a value.

## Step 2 — Entities, value objects and services

Three kinds of objects show up in almost every design:

- **Entity** — has an identity that persists while its attributes change. A `Ticket` is still the same ticket after it is paid. Equality is by ID.
- **Value object** — defined entirely by its attributes, usually immutable. Two `Money(500, "INR")` objects are interchangeable. Java `record`s are perfect for these.
- **Service** — stateless (or nearly) behaviour that doesn't naturally belong to one entity: `FeeCalculator`, `PaymentGateway`. Use sparingly; most logic should live in entities.

> [!WARNING] The anaemic model trap
> If every entity is just fields with getters and setters, and all logic lives in services, you have written procedural code with extra steps. Prefer **rich entities** that enforce their own rules.

## Step 3 — Assign responsibilities to the information expert

The most useful rule of thumb: **give a responsibility to the class that has the information needed to fulfil it.** (This is the "Information Expert" principle from the GRASP guidelines.)

- *Can this spot fit this vehicle?* → `Spot` knows its size → `spot.canFit(vehicle)`.
- *Which free spot is nearest?* → `ParkingLot` (or `Level`) knows all the spots → `lot.findSpotFor(vehicle)`.
- *How long was the vehicle parked?* → `Ticket` knows the entry time → `ticket.durationUntil(exitTime)`.
- *How much is the fee?* → depends on a pricing **policy** that may change → a `PricingStrategy`.

A quick technique is a **CRC card** per class: **C**lass name, **R**esponsibilities, **C**ollaborators.

```text
┌──────────────────────────────┬─────────────────────┐
│ ParkingLot                   │ Collaborators       │
├──────────────────────────────┼─────────────────────┤
│ • find a free spot that fits │ Spot, Vehicle       │
│ • issue tickets on entry     │ Ticket              │
│ • release spot on exit       │ PricingStrategy     │
└──────────────────────────────┴─────────────────────┘
```

## Step 4 — Relationships

Sketch how entities relate, with rough cardinality:

- `ParkingLot` **has many** `Spot`s (composition — spots don't exist without the lot).
- `Ticket` **refers to** one `Spot` and one `Vehicle` (association).
- `ParkingLot` **uses** a `PricingStrategy` (dependency on an interface).

```uml title="Parking lot — first-pass entities"
class ParkingLot
  - spots: List<Spot>
  - activeTickets: Map<String, Ticket>
  + park(vehicle: Vehicle): Ticket
  + leave(ticketId: String): long
class Spot
  - id: String
  - size: Size
  + canFit(vehicle: Vehicle): boolean
class Ticket
  - id: String
  - entryTime: Instant
interface PricingStrategy
  + feeFor(ticket: Ticket, exit: Instant): long
record Vehicle
  + plate: String
  + size: Size
ParkingLot *-- "1..*" Spot : owns
ParkingLot o-- "0..*" Ticket : tracks
Ticket --> Spot
Ticket --> Vehicle
ParkingLot --> PricingStrategy : uses
```

## Putting it into Java

```java title="Responsibilities placed with their experts" file="ParkingEntitiesDemo.java"
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public class ParkingEntitiesDemo {
    public static void main(String[] args) {
        List<Spot> spots = List.of(new Spot("A1", Size.SMALL), new Spot("A2", Size.LARGE));
        Vehicle truck = new Vehicle("KA-01-7777", Size.LARGE);
        Spot spot = findSpotFor(spots, truck).orElseThrow();
        spot.occupy(truck);
        System.out.println(truck.plate() + " parked at " + spot.id());

        Ticket ticket = new Ticket("T1", spot, Instant.parse("2026-01-01T10:00:00Z"));
        System.out.println("Parked for " + ticket.durationUntil(Instant.parse("2026-01-01T12:30:00Z")).toMinutes() + " min");
    }

    static Optional<Spot> findSpotFor(List<Spot> spots, Vehicle v) {
        return spots.stream().filter(s -> s.isFree() && s.canFit(v)).findFirst();
    }
}

enum Size { SMALL, MEDIUM, LARGE }

record Vehicle(String plate, Size size) {}

class Spot {
    private final String id;
    private final Size size;
    private Vehicle occupant;

    Spot(String id, Size size) { this.id = id; this.size = size; }

    String id() { return id; }
    boolean isFree() { return occupant == null; }

    /** The spot is the expert on its own size. */
    boolean canFit(Vehicle v) { return v.size().ordinal() <= size.ordinal(); }

    void occupy(Vehicle v) {
        if (!isFree()) throw new IllegalStateException("Spot " + id + " already occupied");
        if (!canFit(v)) throw new IllegalArgumentException(v.plate() + " does not fit in " + id);
        occupant = v;
    }
}

class Ticket {
    private final String id;
    private final Spot spot;
    private final Instant entryTime;

    Ticket(String id, Spot spot, Instant entryTime) {
        this.id = id; this.spot = spot; this.entryTime = entryTime;
    }

    /** The ticket is the expert on its own timing. */
    Duration durationUntil(Instant exit) {
        if (exit.isBefore(entryTime)) throw new IllegalArgumentException("Exit before entry");
        return Duration.between(entryTime, exit);
    }
}
```

## Real-world example

In an e-commerce codebase, the rule *"an order can only be cancelled before it ships"* was enforced in the API controller, the admin tool and a batch job — three copies, one of which was wrong. Moving the rule into `Order.cancel()` (the information expert: the order knows its status) fixed a production bug and made the rule testable in isolation.

## Common mistakes

- **Every noun becomes a class.** `EntryGate`, `ExitGate`, `Display`, `Floor`, `Attendant`… without behaviour, these are noise.
- **Everything in the orchestrator.** `ParkingLot.canSpotFitVehicle(spot, vehicle)` should be `spot.canFit(vehicle)`.
- **Confusing abstract concepts with physical ones.** A library has `Book` (title, author, ISBN) *and* `BookCopy` (a physical item that can be lent). Merging them breaks as soon as there are two copies.
- **Forgetting value objects.** Representing money as `double` and time as `long` scatters validation everywhere.

## In the interview

> [!INTERVIEW] What to draw
> A handful of boxes (4–7) with arrows, labelled with one-line responsibilities. Say: *"These are the core entities. `ParkingLot` is the orchestrator; rules about fitting live in `Spot`; pricing is a strategy because it's likely to change."* Then check in before detailed class design.

## Key takeaways

- Use **nouns** for candidate classes and **verbs** for candidate methods — then prune.
- Distinguish **entities** (identity), **value objects** (immutable values) and **services** (behaviour without a natural home).
- Assign each responsibility to the **information expert** — the class holding the needed data.
- Watch for physical-vs-abstract splits like `Book`/`BookCopy` and `Show`/`Seat`.

## Knowledge check

```quiz
? In a library system, which class should own the rule "a copy that is already lent cannot be lent again"?
- LibraryService
+ BookCopy
- Book
- Member
> The copy holds its own lending state, so it is the information expert for that rule.

? Which is the best candidate for a value object?
- Member (identified by membership number)
- Order (status changes over time)
+ Money (amount + currency)
- ParkingSpot (occupied or free)
> Value objects are defined by their attributes and are usually immutable; `Money` fits perfectly.

? The requirement says "The display board shows free spots per floor". What is the most reasonable first design choice?
- Create DisplayBoard, Floor, FreeSpotCounter and BoardRenderer classes
+ Give Level (floor) a freeSpotCount() method; a display can call it later
- Ignore the requirement
> Start with the behaviour on the information expert; introduce more classes only if the requirement grows.
```

## Exercise

Apply noun/verb analysis to this prompt and produce: an entity list (marked entity/value/service), one-line responsibilities, and the relationships.

> Users browse **movies** playing at **theatres**. Each theatre has **screens**; each screen runs **shows** at specific times. A user selects **seats** for a show, the seats are **held** for 10 minutes while the user **pays**, and then a **booking** is **confirmed**.

````hint title="Hint 1"
Is a seat a property of the screen or of the show? Think about what "booked" is attached to — the physical chair, or the chair *for a specific show*?
````

````hint title="Hint 2"
Where does the 10-minute hold rule live? Who knows when the hold started?
````

````solution title="Sample answer"
| Class | Kind | Responsibility |
|---|---|---|
| `Movie` | entity | Title, duration, rating |
| `Theatre` | entity | Has screens; location |
| `Screen` | entity | Physical layout of `Seat`s |
| `Seat` | value/entity | Row and number, seat type |
| `Show` | entity | Movie + screen + start time; **owns the status of each seat for this show** (`ShowSeat`) |
| `SeatHold` | entity | Which seats, which user, expiry time; knows if it has expired |
| `Booking` | entity | Confirmed seats, amount, status |
| `PaymentGateway` | service (interface) | Charges the user |

**Key insight:** availability belongs to `Show` (or `ShowSeat`), not `Seat` — the same physical seat is free for the 6pm show and booked for the 9pm show.

**Relationships:** `Theatre *-- Screen *-- Seat`; `Show --> Movie`, `Show --> Screen`; `Show *-- ShowSeat`; `Booking --> Show`, `Booking --> ShowSeat (1..*)`.

The full design is in [Movie Ticket Booking](problem:movie-ticket-booking).
````
