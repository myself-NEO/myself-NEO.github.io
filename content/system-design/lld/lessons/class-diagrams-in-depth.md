## Beyond boxes and arrows

[UML Class Diagram Basics](lesson:uml-basics) covered notation. This lesson is about using class diagrams to make **design decisions** visible: who owns what, how many of each, which direction references go, and where responsibilities sit. A diagram is useful when it answers questions a reviewer would otherwise have to dig through code to answer.

## Multiplicity drives your data structures

Multiplicity isn't decoration; it tells you the Java type to use and which invariants to enforce.

| Multiplicity | Java shape | Invariant to enforce |
|---|---|---|
| `1` | `final` field, non-null | `Objects.requireNonNull` in the constructor |
| `0..1` | nullable field, `Optional` accessor | Check before use |
| `0..*` | `List`/`Set`/`Map` field | — |
| `1..*` | collection field | Constructor or factory requires at least one element |
| `2..4` (bounded) | collection field | Size checked on add |
| Qualified (`[seatNumber] 0..1`) | `Map<SeatNumber, Seat>` | Unique key |

A **qualified association** (a key on the association) is drawn as a small box on the owner's side: `Screen [seatId] ── 0..1 Seat`. In Java it becomes a `Map`. Spotting this early leads to O(1) lookups by design.

## Navigability: which way do references go?

An arrowhead on an association shows **who holds the reference**. `Booking ──> Show` means `Booking` has a `Show` field; `Show` doesn't know its bookings.

Default to **unidirectional** associations. A bidirectional association (both sides hold references) must be kept consistent on every change:

```java
// Bidirectional: two places to update, easy to get out of sync
show.addBooking(booking);
booking.setShow(show);
```

If `Show` needs its bookings, prefer a **query** (`bookingRepository.findByShow(showId)`) or make one side the clear owner that updates both inside a single method.

## Association classes

When a relationship has its own data, promote it to a class. A `Student`–`Course` many-to-many relationship with a grade becomes an `Enrollment`. A `Show`–`Seat` relationship with a booking status becomes a `ShowSeat`.

```uml title="Association class: the status belongs to the pair, not to either side"
class Show
  - startsAt: LocalDateTime
  + seat(id: SeatId): ShowSeat
class Seat
  - id: SeatId
  - type: SeatType
class ShowSeat
  - status: SeatStatus
  - heldBy: String
  + hold(user: String, until: Instant): void
  + confirm(user: String): void
enum SeatStatus
  AVAILABLE
  HELD
  BOOKED
Show *-- "1..*" ShowSeat : seat map
ShowSeat --> "1" Seat : refers to
ShowSeat --> SeatStatus
```

## Responsibilities on the diagram

A class diagram with only fields is a database schema. Include the **key methods** — the behaviour — so the diagram shows **where rules live**:

- `ShowSeat.hold(user, until)` — the seat enforces "only an available seat can be held".
- `Show.seat(id)` — the show owns the seat map (qualified by `SeatId`).
- `BookingService.book(...)` — orchestration across shows, payments and repositories.

If every method lives in one `*Service` box and every other box has only fields, the diagram is telling you the model is anaemic.

## Diagram ↔ Java, line by line

```java title="The diagram above, in Java" file="ShowSeatDemo.java"
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public class ShowSeatDemo {
    public static void main(String[] args) {
        Show show = new Show(LocalDateTime.of(2026, 5, 1, 18, 0),
                List.of(new Seat(new SeatId('A', 1), SeatType.REGULAR), new Seat(new SeatId('A', 2), SeatType.PREMIUM)));
        Instant now = Instant.parse("2026-05-01T12:00:00Z");

        ShowSeat a1 = show.seat(new SeatId('A', 1));
        a1.hold("asha", now.plusSeconds(600), now);
        a1.confirm("asha", now.plusSeconds(60));
        System.out.println("A1: " + a1.status());

        try {
            a1.hold("ravi", now.plusSeconds(600), now);
        } catch (IllegalStateException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
    }
}

record SeatId(char row, int number) {}
enum SeatType { REGULAR, PREMIUM }
enum SeatStatus { AVAILABLE, HELD, BOOKED }

/** Physical seat in a screen: immutable. */
record Seat(SeatId id, SeatType type) {}

/** Association class: status of one seat for one show. */
class ShowSeat {
    private final Seat seat;                  // ShowSeat --> 1 Seat
    private SeatStatus status = SeatStatus.AVAILABLE;
    private String heldBy;
    private Instant holdExpiresAt;

    ShowSeat(Seat seat) { this.seat = Objects.requireNonNull(seat); }

    SeatStatus status() { return status; }

    void hold(String user, Instant until, Instant now) {
        expireIfNeeded(now);
        if (status != SeatStatus.AVAILABLE) throw new IllegalStateException(seat.id() + " is " + status);
        status = SeatStatus.HELD;
        heldBy = user;
        holdExpiresAt = until;
    }

    void confirm(String user, Instant now) {
        expireIfNeeded(now);
        if (status != SeatStatus.HELD || !user.equals(heldBy)) throw new IllegalStateException("no active hold for " + user);
        status = SeatStatus.BOOKED;
    }

    private void expireIfNeeded(Instant now) {
        if (status == SeatStatus.HELD && !now.isBefore(holdExpiresAt)) {
            status = SeatStatus.AVAILABLE;
            heldBy = null;
        }
    }
}

class Show {
    private final LocalDateTime startsAt;
    private final Map<SeatId, ShowSeat> seats = new LinkedHashMap<>();   // qualified association [SeatId]

    Show(LocalDateTime startsAt, List<Seat> layout) {
        if (layout.isEmpty()) throw new IllegalArgumentException("a show needs at least one seat");   // 1..*
        this.startsAt = startsAt;
        layout.forEach(s -> seats.put(s.id(), new ShowSeat(s)));              // composition: Show creates ShowSeats
    }

    ShowSeat seat(SeatId id) {
        ShowSeat s = seats.get(id);
        if (s == null) throw new IllegalArgumentException("no seat " + id);
        return s;
    }
}
```

Every element of the diagram has a home: multiplicity `1..*` becomes a constructor check, the qualified association becomes a `Map`, composition becomes construction inside `Show`, and the `hold`/`confirm` methods put the seat rules on `ShowSeat`.

## Keeping diagrams focused

A diagram should answer one question well. For larger designs, draw several small ones:

- **Domain model** — entities, value objects and their relationships.
- **Extension points** — interfaces and their implementations (strategies, adapters).
- **Layers** — services, repositories, controllers and their dependencies.

Leave out getters, setters, `equals`/`hashCode` and trivial classes.

## Real-world example

During a design review for a hotel booking system, a class diagram showed `Room` with a `status` field (AVAILABLE/BOOKED). The reviewer asked: *"Booked for which dates?"* The diagram made the flaw obvious in seconds. Status belongs to the room-for-a-date-range relationship — a `Reservation` association class — not to the room. See [Hotel Reservation](problem:hotel-reservation).

## Common mistakes

- **Status on the wrong class** (on `Seat` instead of `ShowSeat`, on `Room` instead of `Reservation`).
- **Bidirectional associations by default.**
- **Missing multiplicities**, hiding important constraints such as `1..*` or `0..1`.
- **Diagrams that drift from the code** you then write.

## In the interview

> [!INTERVIEW] Use the diagram to ask yourself questions
> After drawing, check each relationship: *"How many? Who holds the reference? Who creates it? Where does its status live?"* Saying these checks out loud often surfaces a design fix — like moving status into an association class — before you write code.

## Key takeaways

- **Multiplicity** determines Java types and invariants; **qualified associations** become maps.
- Prefer **unidirectional** navigability; bidirectional links need careful ownership.
- Promote relationships with their own data to **association classes** (`ShowSeat`, `Enrollment`, `Reservation`).
- Show **key methods** so the diagram reveals where rules live; keep each diagram focused.

## Knowledge check

```quiz
? A seat can be booked for the 6pm show and free for the 9pm show. Where should booking status live?
- On Seat
- On Screen
+ On ShowSeat, an association class between Show and Seat
> The status belongs to the seat-for-a-show pair, not to the physical seat.

? A Screen's seats are looked up by seat number. Which notation and Java shape fit?
+ A qualified association [seatNumber] → a Map<SeatNumber, Seat>
- 0..1 multiplicity → Optional<Seat>
- Dependency → method parameter
> Qualified associations naturally become maps keyed by the qualifier.

? Why prefer unidirectional associations?
- Java doesn't support bidirectional references
+ Each extra direction is another reference that must be kept consistent on every change
- They use less memory
> Bidirectional links double the bookkeeping and the chances of inconsistency.
```

## Exercise

Draw a class diagram (text is fine) for a **meeting room booking** system: rooms have capacity and equipment; a booking reserves one room for a time slot for an organiser with attendees; bookings can be cancelled. Include multiplicities, navigability, at least one association class or value object, and the key methods that enforce "no overlapping bookings in the same room".

````hint title="Hint"
Which class has enough information to detect an overlap — the booking, or the room's calendar? A time slot is a perfect value object.
````

````solution title="Sample answer"
```uml title="Meeting rooms"
class MeetingRoom
  - id: String
  - capacity: int
  - equipment: Set<Equipment>
  - calendar: RoomCalendar
  + book(slot: TimeSlot, organiser: String, attendees: Set<String>): Booking
class RoomCalendar
  - bookings: TreeMap<Instant, Booking>
  + isFree(slot: TimeSlot): boolean
  + add(booking: Booking): void
  + remove(bookingId: String): void
class Booking
  - id: String
  - slot: TimeSlot
  - organiser: String
  - attendees: Set<String>
  - status: BookingStatus
  + cancel(): void
record TimeSlot
  + start: Instant
  + end: Instant
  + overlaps(other: TimeSlot): boolean
MeetingRoom *-- "1" RoomCalendar
RoomCalendar o-- "0..*" Booking
Booking --> "1" TimeSlot
```

`RoomCalendar` is the information expert for overlaps. With a `TreeMap` keyed by start time, checking the floor and ceiling entries finds conflicts in O(log n). See [Meeting Room Booking](problem:meeting-room-booking).
````
