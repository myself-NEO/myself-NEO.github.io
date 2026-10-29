## How to read this lesson

This is a condensed transcript of a strong 45-minute LLD interview for **"Design a meeting room booking system."** The candidate's lines are labelled **C**, the interviewer's **I**. Commentary boxes explain *why* each move works. Notice how often the candidate checks in, how decisions are tied to requirements, and how pushback is handled.

---

## 00:00 — Requirements (5 minutes)

**I:** Design a meeting room booking system for our office.

**C:** Before designing, I'd like to clarify scope. One office or several? Do rooms have capacity and equipment? Can bookings recur? What should happen on a conflict? And will many people book at once?

**I:** One office, about 50 rooms with capacity and equipment like projectors. Start without recurring bookings. Conflicts must be rejected. Yes — lots of people book at 9am Monday.

**C:** Let me write this down.

```text
Functional
 1. Rooms have id, capacity, equipment.
 2. Book a room for [start, end) for an organiser with attendees.
 3. Reject overlapping bookings in the same room.
 4. Cancel a booking (organiser only).
 5. Find available rooms for a time slot with capacity ≥ N and required equipment.
Non-functional
 6. Concurrent booking requests must never double-book a room.
 7. Room search should be fast for ~50 rooms (no need for indexing tricks).
Out of scope (for now)
 - Recurring meetings, multi-office, calendar sync, notifications.
```

**C:** Does that match what you had in mind?

**I:** Yes.

> [!NOTE] Why this works
> Five questions in one breath, grouped. The answers became a numbered list, NFR 6 captured the "9am Monday" hint as a requirement, and the out-of-scope list protects the candidate's time.

---

## 00:05 — Entities and invariants (4 minutes)

**C:** Core entities: `Room` (capacity, equipment), `Booking` (room, time slot, organiser, attendees, status), and a `TimeSlot` value object for `[start, end)`. Something must own the "no overlap" rule. The information expert is whoever holds all bookings for one room, so I'll give each room a `RoomCalendar`. A `BookingService` orchestrates booking, cancelling and search.

**C:** Invariants: within one calendar, no two **active** bookings overlap; a slot's end is after its start; only the organiser can cancel.

```text
BookingService ──> RoomRepository
Room ◆── 1 RoomCalendar ◇── 0..* Booking
Booking ──> TimeSlot (value object)
```

> [!NOTE] Why this works
> The candidate reasoned their way to *where* the overlap rule lives ("whoever holds all bookings for one room") instead of putting everything in the service. That one sentence earns the class-design signal.

---

## 00:09 — Class design & API (8 minutes)

**C:** Public API, top-down:

```java
class BookingService {
    Booking book(String roomId, TimeSlot slot, String organiser, Set<String> attendees);
    void cancel(String bookingId, String requestedBy);
    List<Room> findAvailable(TimeSlot slot, int minCapacity, Set<Equipment> required);
}
class RoomCalendar {
    synchronized Booking add(String bookingId, TimeSlot slot, String organiser, Set<String> attendees);
    synchronized void cancel(Booking booking, String requestedBy);
    synchronized boolean isFree(TimeSlot slot);
}
record TimeSlot(Instant start, Instant end) { boolean overlaps(TimeSlot other); }
```

**C:** For the calendar's data structure, I'll use a `TreeMap<Instant, Booking>` keyed by start time. To check a new slot, I only need the booking that starts just before it (`floorEntry`) and the one that starts just after (`ceilingEntry`) — O(log n) instead of scanning every booking.

**I:** Why not just a list? It's only 50 rooms.

**C:** Fair challenge. With a few dozen bookings per room per day, a list scan would be fine. The TreeMap costs nothing extra in code, and it keeps the calendar ordered, which also helps the "show my day" view. If you'd prefer, I can use a list. The class API doesn't change either way.

> [!INTERVIEW] Handling pushback: acknowledge → reason → alternative
> The candidate didn't get defensive. They agreed the simple option works, gave a concrete reason for their choice, and pointed out that the API hides the decision, which makes it cheap to change. That's exactly the judgement interviewers look for.

**I:** Let's keep the TreeMap. Booking status?

**C:** `CONFIRMED → CANCELLED`. Cancelled bookings are removed from the calendar map but kept in a `bookingsById` map for history, so "active" always means "in the tree".

---

## 00:17 — Implementation (15 minutes)

**C:** I'll implement `RoomCalendar` fully, because it holds the core rule and the concurrency concern, then `BookingService.book`.

```java title="The candidate's core implementation (cleaned up)" file="MeetingRoomInterviewDemo.java"
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

public class MeetingRoomInterviewDemo {
    public static void main(String[] args) {
        BookingService service = new BookingService();
        service.addRoom(new Room("R1", 6, EnumSet.of(Equipment.PROJECTOR)));
        service.addRoom(new Room("R2", 12, EnumSet.of(Equipment.PROJECTOR, Equipment.VIDEO)));

        TimeSlot nineToTen = TimeSlot.of("2026-03-02T09:00:00Z", "2026-03-02T10:00:00Z");
        TimeSlot nineThirty = TimeSlot.of("2026-03-02T09:30:00Z", "2026-03-02T10:30:00Z");
        TimeSlot tenToEleven = TimeSlot.of("2026-03-02T10:00:00Z", "2026-03-02T11:00:00Z");

        Booking b1 = service.book("R1", nineToTen, "asha", Set.of("ravi"));
        System.out.println("Booked " + b1.id());
        try {
            service.book("R1", nineThirty, "meera", Set.of());
        } catch (IllegalStateException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
        System.out.println("Back-to-back OK: " + service.book("R1", tenToEleven, "meera", Set.of()).id());
        System.out.println("Free at 9:30 for 8 with projector: "
                + service.findAvailable(nineThirty, 8, EnumSet.of(Equipment.PROJECTOR)).stream().map(Room::id).toList());

        service.cancel(b1.id(), "asha");
        System.out.println("After cancel, R1 free 9:00-10:00? " + service.calendar("R1").isFree(nineToTen));
    }
}

enum Equipment { PROJECTOR, VIDEO, WHITEBOARD }
enum BookingStatus { CONFIRMED, CANCELLED }

record TimeSlot(Instant start, Instant end) {
    TimeSlot {
        if (!end.isAfter(start)) throw new IllegalArgumentException("end must be after start");
    }
    static TimeSlot of(String start, String end) { return new TimeSlot(Instant.parse(start), Instant.parse(end)); }
    /** Half-open intervals: [9,10) and [10,11) do not overlap. */
    boolean overlaps(TimeSlot o) { return start.isBefore(o.end) && o.start.isBefore(end); }
}

record Room(String id, int capacity, Set<Equipment> equipment) {
    Room {
        if (capacity <= 0) throw new IllegalArgumentException("capacity must be positive");
        equipment = Set.copyOf(equipment);
    }
    boolean satisfies(int minCapacity, Set<Equipment> required) {
        return capacity >= minCapacity && equipment.containsAll(required);
    }
}

final class Booking {
    private final String id;
    private final String roomId;
    private final TimeSlot slot;
    private final String organiser;
    private final Set<String> attendees;
    private BookingStatus status = BookingStatus.CONFIRMED;

    Booking(String id, String roomId, TimeSlot slot, String organiser, Set<String> attendees) {
        this.id = id; this.roomId = roomId; this.slot = slot; this.organiser = organiser;
        this.attendees = Set.copyOf(attendees);
    }

    String id() { return id; }
    TimeSlot slot() { return slot; }
    String organiser() { return organiser; }
    BookingStatus status() { return status; }

    void cancel(String requestedBy) {
        if (!organiser.equals(requestedBy)) throw new SecurityException("only the organiser can cancel");
        if (status == BookingStatus.CANCELLED) throw new IllegalStateException("already cancelled");
        status = BookingStatus.CANCELLED;
    }
}

/** Information expert for "no overlaps in this room". One lock per room. */
final class RoomCalendar {
    private final String roomId;
    private final TreeMap<Instant, Booking> active = new TreeMap<>();   // keyed by start time

    RoomCalendar(String roomId) { this.roomId = roomId; }

    synchronized boolean isFree(TimeSlot slot) {
        Map.Entry<Instant, Booking> before = active.floorEntry(slot.start());
        if (before != null && before.getValue().slot().overlaps(slot)) return false;
        Map.Entry<Instant, Booking> after = active.ceilingEntry(slot.start());
        return after == null || !after.getValue().slot().overlaps(slot);
    }

    /** Check-then-act under one lock, so two requests can't both see "free". */
    synchronized Booking add(String bookingId, TimeSlot slot, String organiser, Set<String> attendees) {
        if (!isFree(slot)) throw new IllegalStateException("room " + roomId + " is taken for " + slot);
        Booking b = new Booking(bookingId, roomId, slot, organiser, attendees);
        active.put(slot.start(), b);
        return b;
    }

    synchronized void cancel(Booking booking, String requestedBy) {
        booking.cancel(requestedBy);
        active.remove(booking.slot().start());
    }
}

final class BookingService {
    private final Map<String, Room> rooms = new HashMap<>();
    private final Map<String, RoomCalendar> calendars = new HashMap<>();
    private final Map<String, Booking> bookingsById = new ConcurrentHashMap<>();
    private final Map<String, String> roomOfBooking = new ConcurrentHashMap<>();
    private final AtomicLong ids = new AtomicLong();

    void addRoom(Room room) {
        rooms.put(room.id(), room);
        calendars.put(room.id(), new RoomCalendar(room.id()));
    }

    RoomCalendar calendar(String roomId) {
        RoomCalendar c = calendars.get(roomId);
        if (c == null) throw new IllegalArgumentException("unknown room " + roomId);
        return c;
    }

    Booking book(String roomId, TimeSlot slot, String organiser, Set<String> attendees) {
        Room room = rooms.get(roomId);
        if (room == null) throw new IllegalArgumentException("unknown room " + roomId);
        if (attendees.size() + 1 > room.capacity()) throw new IllegalArgumentException("room too small");
        Booking b = calendar(roomId).add("BK-" + ids.incrementAndGet(), slot, organiser, attendees);
        bookingsById.put(b.id(), b);
        roomOfBooking.put(b.id(), roomId);
        return b;
    }

    void cancel(String bookingId, String requestedBy) {
        Booking b = Optional.ofNullable(bookingsById.get(bookingId))
                .orElseThrow(() -> new IllegalArgumentException("unknown booking " + bookingId));
        calendar(roomOfBooking.get(bookingId)).cancel(b, requestedBy);
    }

    List<Room> findAvailable(TimeSlot slot, int minCapacity, Set<Equipment> required) {
        List<Room> result = new ArrayList<>();
        for (Room r : rooms.values()) {
            if (r.satisfies(minCapacity, required) && calendar(r.id()).isFree(slot)) result.add(r);
        }
        result.sort((a, b) -> Integer.compare(a.capacity(), b.capacity()));   // smallest adequate room first
        return result;
    }
}
```

**C:** Let me trace it. Asha books R1 9–10. Meera asks for 9:30–10:30: `floorEntry(9:30)` is Asha's 9:00 booking, which overlaps, so it's rejected. Meera asks for 10–11: `floorEntry(10:00)` is the 9:00 booking, but with half-open intervals `[9,10)` doesn't overlap `[10,11)`, so it's accepted. Back-to-back meetings work, which is a common bug.

> [!NOTE] Why this works
> The candidate implemented the hardest piece fully, used a value object (`TimeSlot`) to hold the overlap rule, and traced a scenario that targets a classic edge case: back-to-back bookings with half-open intervals.

---

## 00:32 — Pushback and follow-ups (10 minutes)

**I:** Your `findAvailable` checks `isFree` and then the user books later. Isn't that a race?

**C:** Yes, but a benign one. Search results are advisory; `book()` re-checks under the room's lock. If someone else got there first, the booking fails cleanly with "room taken", and the UI can refresh suggestions. Holding locks between search and booking would hurt throughput for no real benefit.

**I:** Why lock per room instead of one global lock?

**C:** A global lock would serialise all 9am bookings, even for different rooms. Per-room locks let bookings for different rooms proceed in parallel; only requests for the *same* room contend, which is exactly where we need mutual exclusion. Since every operation touches exactly one calendar, there's no lock ordering issue and no deadlock risk.

**I:** Now support recurring meetings — weekly, for 10 weeks.

**C:** I'd add a `RecurrenceRule` that expands into concrete `TimeSlot`s, and a `SeriesBooking` that groups the child bookings. The key decision is atomicity: should the series fail if any occurrence conflicts? If yes, that's all-or-nothing within one room, so I'd hold that room's lock, check every occurrence, then add them all. If no, book what's free and report the conflicts. `RoomCalendar.add` itself doesn't change. I'd ask the product owner which behaviour they want — my default would be all-or-nothing with a list of conflicts returned.

**I:** What would you test?

**C:** Overlap boundaries (touching, containing, contained, identical slots), cancellation by a non-organiser, double cancel, capacity limits, and a concurrency test where 50 threads try to book the same slot in the same room and exactly one succeeds.

> [!INTERVIEW] What made the follow-ups strong
> Every answer pointed to a **specific, local change** (a new `RecurrenceRule`; `RoomCalendar.add` unchanged), surfaced a **product decision** instead of guessing (all-or-nothing vs partial), and backed concurrency claims with **reasons** (lock granularity, no lock ordering issues).

---

## 00:42 — Wrap-up (3 minutes)

**C:** To summarise: rooms own calendars; the calendar is the single place enforcing non-overlap, with per-room locking for concurrency; `TimeSlot` is an immutable value object with half-open overlap logic; and the service orchestrates and searches. With more time I'd add a repository interface for persistence, notifications through an observer on booking events, and the recurring-series feature.

## Evaluation: what this candidate showed

| Signal | Evidence |
|---|---|
| Problem analysis | Grouped questions, numbered requirements, NFR captured from a hint |
| Class design | Rule placed with the information expert (`RoomCalendar`), value object for slots |
| Code quality | Immutable records, guard clauses, half-open intervals, no public mutable state |
| Extensibility | Recurring bookings as a local change; a product question raised |
| Communication | Checkpoints, scenario trace, calm and reasoned pushback |
| Concurrency | Per-room locks, check-then-act under one lock, the benign search race explained |

## Common mistakes this candidate avoided

- Putting overlap logic in `BookingService` with a scan of all bookings.
- Closed intervals that reject back-to-back meetings.
- A global `synchronized` on the service.
- Answering the recurring-meetings follow-up with a redesign.

## Key takeaways

- Strong interviews **narrate decisions**, check in, and **tie every abstraction to a requirement**.
- Implement and **trace** the core rule; target classic edge cases deliberately.
- Handle pushback with **acknowledge → reason → alternative**.
- Answer follow-ups with **local changes** and surface product decisions explicitly.

## Knowledge check

```quiz
? Why does the candidate use half-open intervals [start, end)?
+ So back-to-back meetings (9–10 and 10–11) don't count as overlapping
- Because Java's Instant requires it
- To make the code shorter
> Half-open intervals model adjacency correctly.

? The interviewer points out a race between search and booking. Why is the candidate's answer acceptable?
- Races are always acceptable
+ Search is advisory and booking re-checks under the room lock, so the worst case is a clean "already taken" failure
- Java prevents races automatically
> The correctness-critical step is atomic; the advisory step can be stale.

? Why per-room locks instead of one global lock?
+ Bookings for different rooms can proceed in parallel, while same-room requests are still mutually exclusive
- Global locks are not allowed in Java
- Per-room locks prevent all exceptions
> Lock granularity should match the scope of the invariant: one room's calendar.
```

## Exercise

Re-run this interview yourself, but with the follow-up: **"Users want to book *any* room with ≥ 8 seats and a projector for 2–3pm; pick the best one automatically, and make it safe under concurrency."** Write the `bookAny(...)` method and explain how it avoids two users being given the same room.

````hint title="Hint"
Iterate candidates (smallest adequate first) and *try* to book each one through its calendar's atomic `add`. If it fails because the room was taken in the meantime, move on to the next candidate.
````

````solution title="Sample answer"
```java
Booking bookAny(TimeSlot slot, int minCapacity, Set<Equipment> required, String organiser, Set<String> attendees) {
    for (Room room : findAvailable(slot, minCapacity, required)) {     // advisory list, smallest first
        try {
            return book(room.id(), slot, organiser, attendees);           // atomic per room
        } catch (IllegalStateException taken) {
            // someone booked it between search and now: try the next candidate
        }
    }
    throw new NoRoomAvailableException(slot, minCapacity, required);
}
```

Safety comes from the same place as before: each attempt is a check-then-act inside one room's lock, so two users can never get the same room. The search may be stale, but a stale entry just means one failed attempt and a move to the next room. The full problem is [Meeting Room Booking](problem:meeting-room-booking).
````
