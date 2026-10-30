## Problem statement

Design a meeting room booking system for an office. Employees book a specific room for a time slot, or ask for "any room that fits N people" and let the system choose. Two meetings may never overlap in the same room. People also want to see which rooms are free for a given slot, and to cancel their bookings.

> [!TIP] Try it first
> Decide how you'll answer "does this slot overlap any booking in this room?" **without scanning every booking**. The data structure is the heart of this problem.

## Clarifying questions

1. Is a slot `[start, end)` — can a meeting start exactly when another ends?
2. Specific room, "any room that fits", or both? Which room should "any" pick?
3. Single day, or bookings across days?
4. Recurring meetings?
5. Who may cancel a booking?
6. Many people booking at the same time?

````reveal title="Answers we'll assume"
- Slots are **half-open** `[start, end)`: 10:00–11:00 and 11:00–12:00 don't conflict.
- Both: book a named room, or let the system choose. The default choice is **best fit** — the smallest room that holds everyone — so big rooms stay free for big meetings. The policy must be swappable.
- Bookings can be on any date and time (minute precision).
- Recurring meetings are a follow-up.
- Only the organizer can cancel.
- Yes: concurrent requests for the same room and slot must have exactly one winner.
````

## Requirements

**Functional**

1. Add rooms with a name and capacity.
2. Book a named room for a slot, or book any room that fits N attendees.
3. Reject overlapping bookings in the same room.
4. List rooms that are free for a slot and fit N attendees.
5. Cancel a booking (organizer only).

**Non-functional**

6. Overlap check in O(log n) per room.
7. Thread-safe without a single global lock; different rooms don't contend.
8. The room-selection policy is pluggable.

## Step 1 — Entities

````reveal title="Entities and responsibilities"
| Entity | Responsibility |
|---|---|
| `TimeSlot` | Value object `[start, end)`; validates `start < end`; knows how to print itself |
| `Room` | Name, capacity, and its **own calendar** of bookings; guards the no-overlap invariant |
| `Booking` | Immutable record: id, room, organizer, slot |
| `RoomSelectionStrategy` | Orders candidate rooms for "any room" requests |
| `MeetingScheduler` | Facade: registry of rooms and bookings; orchestrates booking and cancellation |

**Key insight:** the no-overlap rule belongs to one room, so the room owns its calendar and its lock. That makes rooms independent of each other.
````

## Step 2 — Overlap detection in O(log n)

````reveal title="Using a TreeMap keyed by start time"
Keep each room's bookings in a `TreeMap<LocalDateTime, Booking>` keyed by start. Bookings in one room never overlap, so sorted by start they are also sorted by end.

A new slot `[s, e)` overlaps something **iff** the booking with the greatest start **before `e`** ends after `s`:

```text
existing:   [09:00-10:00)  [10:00-11:00)  [11:30-12:00)
new slot:            [10:30 ------- 11:15)
lowerEntry(11:15) -> [10:00-11:00), its end 11:00 > 10:30 -> overlap
```

Any booking that starts at or after `e` can't overlap, and the latest one starting before `e` has the latest end among the rest. So one `lowerEntry` call (O(log n)) decides it. Scanning a list would be O(n).
````

## Step 3 — Class design

```uml title="Meeting room booking"
class MeetingScheduler
  - rooms: Map<String, Room>
  - bookings: Map<String, Booking>
  - selection: RoomSelectionStrategy
  + book(organizer: String, attendees: int, slot: TimeSlot): Booking
  + bookRoom(organizer: String, room: String, slot: TimeSlot): Booking
  + cancel(bookingId: String, organizer: String): void
  + freeRooms(attendees: int, slot: TimeSlot): List<String>
class Room
  - name: String
  - capacity: int
  - calendar: TreeMap<LocalDateTime, Booking>
  + isFree(slot: TimeSlot): boolean
  + tryBook(b: Booking): boolean
  + cancel(b: Booking): boolean
record TimeSlot
  + start: LocalDateTime
  + end: LocalDateTime
record Booking
  + id: String
  + room: String
  + organizer: String
  + slot: TimeSlot
interface RoomSelectionStrategy
  + order(candidates: List<Room>, attendees: int): List<Room>
class BestFitSelection
MeetingScheduler o-- "0..*" Room
Room *-- "0..*" Booking
Booking --> TimeSlot
MeetingScheduler --> RoomSelectionStrategy
BestFitSelection ..|> RoomSelectionStrategy
```

## Step 4 — Implementation

````hint title="Hint — booking 'any room' without a global lock"
Ask the strategy for an ordered list of candidate rooms, then call `tryBook` on each in turn. Each `tryBook` is atomic under that room's lock. If someone grabs a room between your look and your try, `tryBook` just returns `false` and you move on to the next room.
````

````solution title="Complete Java solution"
```java title="MeetingRoomDemo.java" file="MeetingRoomDemo.java"
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

public class MeetingRoomDemo {
    static final LocalDate DAY = LocalDate.of(2026, 5, 4);

    public static void main(String[] args) {
        MeetingScheduler s = new MeetingScheduler(new BestFitSelection());
        s.addRoom(new Room("Focus", 4));
        s.addRoom(new Room("Huddle", 6));
        s.addRoom(new Room("Board", 12));

        Booking asha = s.book("asha", 5, slot("10:00", "11:00"));
        System.out.println("asha (5 people) -> " + asha.room());
        System.out.println("ravi (5 people) -> " + s.book("ravi", 5, slot("10:30", "11:30")).room());
        attempt(() -> s.book("meera", 5, slot("10:30", "11:00")));
        System.out.println("kabir books Huddle 11:00-12:00 -> " + s.bookRoom("kabir", "Huddle", slot("11:00", "12:00")).id());
        attempt(() -> s.bookRoom("dev", "Focus", slot("12:00", "11:00")));
        attempt(() -> s.cancel(asha.id(), "ravi"));
        System.out.println("free for 2 at 10:00-11:00: " + s.freeRooms(2, slot("10:00", "11:00")));

        s.cancel(asha.id(), "asha");
        System.out.println("after cancel, meera -> " + s.book("meera", 5, slot("10:30", "11:00")).room());
        System.out.println("Huddle: " + s.schedule("Huddle"));
    }

    static TimeSlot slot(String from, String to) {
        return new TimeSlot(DAY.atTime(LocalTime.parse(from)), DAY.atTime(LocalTime.parse(to)));
    }

    static void attempt(Runnable action) {
        try {
            action.run();
        } catch (BookingException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
    }
}

class BookingException extends RuntimeException {
    BookingException(String message) { super(message); }
}

/** Half-open interval [start, end). */
record TimeSlot(LocalDateTime start, LocalDateTime end) {
    TimeSlot {
        if (!start.isBefore(end)) throw new BookingException("invalid slot: end must be after start");
    }

    boolean overlaps(TimeSlot other) { return start.isBefore(other.end) && other.start.isBefore(end); }

    @Override public String toString() { return start.toLocalTime() + "-" + end.toLocalTime(); }
}

record Booking(String id, String room, String organizer, TimeSlot slot) {}

/** A room owns its calendar and guards the no-overlap invariant under its own lock. */
final class Room {
    private final String name;
    private final int capacity;
    private final TreeMap<LocalDateTime, Booking> calendar = new TreeMap<>();

    Room(String name, int capacity) {
        if (capacity <= 0) throw new IllegalArgumentException("capacity must be positive");
        this.name = name;
        this.capacity = capacity;
    }

    String name() { return name; }
    int capacity() { return capacity; }

    synchronized boolean isFree(TimeSlot slot) {
        // Bookings don't overlap each other, so the one starting last before slot.end is the only candidate.
        Map.Entry<LocalDateTime, Booking> last = calendar.lowerEntry(slot.end());
        return last == null || !last.getValue().slot().overlaps(slot);
    }

    /** Atomic check-then-act: returns false instead of throwing so callers can try another room. */
    synchronized boolean tryBook(Booking booking) {
        if (!isFree(booking.slot())) return false;
        calendar.put(booking.slot().start(), booking);
        return true;
    }

    synchronized boolean cancel(Booking booking) { return calendar.remove(booking.slot().start(), booking); }

    synchronized List<Booking> bookings() { return List.copyOf(calendar.values()); }
}

interface RoomSelectionStrategy {
    /** Candidate rooms in order of preference; every room returned must fit the attendees. */
    List<Room> order(List<Room> rooms, int attendees);
}

/** Smallest room that fits first, so large rooms stay free for large meetings. */
final class BestFitSelection implements RoomSelectionStrategy {
    public List<Room> order(List<Room> rooms, int attendees) {
        return rooms.stream()
                .filter(r -> r.capacity() >= attendees)
                .sorted(Comparator.comparingInt(Room::capacity).thenComparing(Room::name))
                .toList();
    }
}

final class MeetingScheduler {
    private final Map<String, Room> rooms = new ConcurrentHashMap<>();
    private final Map<String, Booking> bookings = new ConcurrentHashMap<>();
    private final RoomSelectionStrategy selection;
    private final AtomicLong ids = new AtomicLong();

    MeetingScheduler(RoomSelectionStrategy selection) { this.selection = selection; }

    void addRoom(Room room) {
        if (rooms.putIfAbsent(room.name(), room) != null) throw new BookingException("room " + room.name() + " exists");
    }

    /** Lets the strategy pick: tries each candidate room in order until one accepts. */
    Booking book(String organizer, int attendees, TimeSlot slot) {
        if (attendees <= 0) throw new BookingException("attendees must be positive");
        String id = "M" + ids.incrementAndGet();
        for (Room room : selection.order(List.copyOf(rooms.values()), attendees)) {
            Booking booking = new Booking(id, room.name(), organizer, slot);
            if (room.tryBook(booking)) return register(booking);
        }
        throw new BookingException("no room for " + attendees + " people at " + slot);
    }

    Booking bookRoom(String organizer, String roomName, TimeSlot slot) {
        Room room = room(roomName);
        Booking booking = new Booking("M" + ids.incrementAndGet(), roomName, organizer, slot);
        if (!room.tryBook(booking)) throw new BookingException(roomName + " is busy at " + slot);
        return register(booking);
    }

    void cancel(String bookingId, String organizer) {
        Booking b = bookings.get(bookingId);
        if (b == null) throw new BookingException("no booking " + bookingId);
        if (!b.organizer().equals(organizer)) throw new BookingException("only " + b.organizer() + " can cancel " + bookingId);
        if (bookings.remove(bookingId, b)) room(b.room()).cancel(b);   // remove() decides the winner of two cancels
    }

    List<String> freeRooms(int attendees, TimeSlot slot) {
        List<String> free = new ArrayList<>();
        for (Room r : selection.order(List.copyOf(rooms.values()), attendees)) {
            if (r.isFree(slot)) free.add(r.name());
        }
        return free;
    }

    List<String> schedule(String roomName) {
        return room(roomName).bookings().stream().map(b -> b.slot() + " " + b.organizer()).toList();
    }

    private Booking register(Booking b) {
        bookings.put(b.id(), b);
        return b;
    }

    private Room room(String name) {
        Room r = rooms.get(name);
        if (r == null) throw new BookingException("no room " + name);
        return r;
    }
}
```
````

## Design decisions

- **Half-open intervals.** `[10:00, 11:00)` and `[11:00, 12:00)` don't overlap, which is what people expect for back-to-back meetings. The `overlaps` rule is `a.start < b.end && b.start < a.end`.
- **Each room owns its calendar and its lock.** The no-overlap invariant is per room, so the lock is per room too. Booking different rooms never contends.
- **`tryBook` returns a boolean** instead of throwing. "Any room" booking expects some rooms to be taken; it's a normal outcome, not an exception.
- **Best fit as a strategy.** Other policies — fewest bookings today (spread wear), nearest to the organizer's desk — are new `RoomSelectionStrategy` classes.
- **`TimeSlot` validates itself** in its compact constructor, so an invalid slot can't exist anywhere in the system (see [Domain invariants](lesson:domain-invariants)).

## Patterns and principles

[Strategy](lesson:strategy) (`RoomSelectionStrategy`), [choosing data structures](lesson:data-structure-selection) (`TreeMap.lowerEntry` for O(log n) overlap checks), [value objects with invariants](lesson:domain-invariants) (`TimeSlot`), and [atomic check-then-act](lesson:concurrent-state-transitions) per room.

## Example execution flow

```text
book(asha, 5, 10:00-11:00)  best fit: Huddle(6), Board(12) -> Huddle free -> booked
book(ravi, 5, 10:30-11:30)  Huddle busy (lowerEntry 10:00-11:00 overlaps) -> Board free -> booked
book(meera, 5, 10:30-11:00) Huddle busy, Board busy -> rejected
bookRoom(kabir, Huddle, 11:00-12:00) lowerEntry(12:00) = 10:00-11:00, ends 11:00, not after 11:00 -> free
cancel(M1, asha)            Huddle 10:00-11:00 removed
book(meera, 5, 10:30-11:00) Huddle free now -> booked
```

```text title="Program output"
asha (5 people) -> Huddle
ravi (5 people) -> Board
Rejected: no room for 5 people at 10:30-11:00
kabir books Huddle 11:00-12:00 -> M4
Rejected: invalid slot: end must be after start
Rejected: only asha can cancel M1
free for 2 at 10:00-11:00: [Focus]
after cancel, meera -> Huddle
Huddle: [10:30-11:00 meera, 11:00-12:00 kabir]
```

## Edge cases

- **Back-to-back meetings** → allowed (half-open intervals).
- **A slot that contains, or sits inside, an existing booking** → both caught by the same `lowerEntry` check.
- **End before start, or zero length** → `TimeSlot` refuses to exist.
- **No room big enough** → rejected with a clear message; `freeRooms` returns an empty list.
- **Cancelling someone else's booking, or cancelling twice** → rejected / no-op.

## Tests

```java title="MeetingRoomTest.java" file="MeetingRoomTest.java" test="MeetingRoomDemo.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class MeetingRoomTest {
    private MeetingScheduler s;

    private static TimeSlot slot(String from, String to) {
        LocalDate d = LocalDate.of(2026, 5, 4);
        return new TimeSlot(d.atTime(LocalTime.parse(from)), d.atTime(LocalTime.parse(to)));
    }

    @BeforeEach
    void setUp() {
        s = new MeetingScheduler(new BestFitSelection());
        s.addRoom(new Room("Small", 4));
        s.addRoom(new Room("Large", 10));
    }

    @Test
    void bestFitPicksTheSmallestRoomThatFits() {
        assertEquals("Small", s.book("a", 3, slot("09:00", "10:00")).room());
        assertEquals("Large", s.book("b", 5, slot("09:00", "10:00")).room());
    }

    @Test
    void everyKindOfOverlapIsRejected() {
        s.bookRoom("a", "Small", slot("10:00", "11:00"));
        for (TimeSlot t : List.of(slot("09:00", "12:00"), slot("10:15", "10:45"), slot("09:30", "10:01"), slot("10:59", "11:30"))) {
            assertThrows(BookingException.class, () -> s.bookRoom("b", "Small", t), t.toString());
        }
    }

    @Test
    void backToBackMeetingsAreAllowed() {
        s.bookRoom("a", "Small", slot("10:00", "11:00"));
        s.bookRoom("b", "Small", slot("11:00", "12:00"));
        s.bookRoom("c", "Small", slot("09:00", "10:00"));
        assertEquals(List.of("Large"), s.freeRooms(4, slot("09:30", "11:30")));   // Small is fully booked 09:00-12:00
    }

    @Test
    void cancelFreesTheSlotAndOnlyTheOrganizerMayCancel() {
        Booking b = s.bookRoom("a", "Small", slot("10:00", "11:00"));
        assertThrows(BookingException.class, () -> s.cancel(b.id(), "intruder"));
        s.cancel(b.id(), "a");
        assertEquals(List.of("Small", "Large"), s.freeRooms(2, slot("10:00", "11:00")));
    }

    @Test
    void invalidSlotCannotBeCreated() {
        assertThrows(BookingException.class, () -> slot("11:00", "11:00"));
    }

    @Test
    void concurrentRequestsForTheSameRoomAndSlotHaveOneWinner() throws InterruptedException {
        AtomicInteger winners = new AtomicInteger();
        ExecutorService pool = Executors.newFixedThreadPool(16);
        CountDownLatch go = new CountDownLatch(1);
        for (int i = 0; i < 200; i++) {
            String who = "u" + i;
            pool.submit(() -> {
                go.await();
                try { s.bookRoom(who, "Small", slot("14:00", "15:00")); winners.incrementAndGet(); } catch (BookingException ignored) { }
                return null;
            });
        }
        go.countDown();
        pool.shutdown();
        pool.awaitTermination(10, TimeUnit.SECONDS);
        assertEquals(1, winners.get());
    }
}
```

## Concurrency

- **Critical section:** "is the slot free? then insert" in one room → `synchronized` on the `Room` (`tryBook`).
- **"Any room" bookings** take one room lock at a time and never hold two, so there's no lock ordering and no deadlock.
- **Cancel vs cancel:** `bookings.remove(id, booking)` is atomic, so only one caller goes on to remove the calendar entry.
- **In a database:** a unique index can't express "no overlap", but PostgreSQL can with an **exclusion constraint** on `(room_id, tsrange(start, end))`. Without one, lock the room row (`SELECT ... FOR UPDATE`) before checking.

## Common mistakes and alternatives

- **Closed intervals** — make back-to-back meetings conflict.
- **Scanning every booking** in every room for each request — O(rooms × bookings).
- **One global lock** — correct but serialises every booking in the company.
- **Checking `isFree` and then booking in two separate calls** — another thread can book in between; the check and the insert must be one atomic step.
- **Alternative:** an interval tree supports "all bookings overlapping X" queries; for the "is anything overlapping?" question the `TreeMap` trick is simpler.

## Follow-up questions

````reveal title="Recurring meetings"
A `Recurrence` (daily/weekly, until a date) expands into concrete slots for a booking window (say, the next 3 months). Booking a series is all-or-nothing: lock the room once, check every occurrence, then insert them all. Store the series ID on each `Booking` so "cancel this one" and "cancel the series" both work.
````

````reveal title="Suggest the next free slot"
For one room: walk the calendar from the requested start with `ceilingEntry`, looking for the first gap of the required length (O(k log n) for k bookings skipped). For "any room", run that per candidate room and pick the earliest.
````

````reveal title="Book across time zones"
Store slots as `Instant`s (or `OffsetDateTime`) and convert at the edges. A room has a home time zone for working-hours rules; the comparison logic doesn't change.
````

## Complexity

- `isFree` / `tryBook` / `cancel` per room: O(log n) for n bookings in that room.
- `book` (any room): O(r log r + r log n) for r rooms.
- `freeRooms`: O(r log n).

## Interviewer checklist

- [ ] Half-open intervals and the overlap condition stated
- [ ] O(log n) overlap check (sorted structure), not a scan
- [ ] Per-room lock; atomic check-then-insert
- [ ] Room selection as a strategy (best fit)
- [ ] Organizer-only cancellation
- [ ] Concurrency test with one winner
