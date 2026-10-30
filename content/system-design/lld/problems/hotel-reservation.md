## Problem statement

Design a hotel reservation system. Guests search for available rooms of a type (standard, deluxe, suite) for a range of dates, reserve one, and later check in and check out. Reservations can be cancelled before arrival; guests who never arrive are marked as no-shows. Weekend nights cost more than weekday nights.

> [!TIP] Try it first
> Two things decide this design: how you represent **"room R is taken on these nights"**, and the **reservation lifecycle**. Sketch both before writing classes.

## Clarifying questions

1. Does the guest choose a room number, or a room type?
2. Is the check-out day a night of the stay?
3. How is the price computed?
4. What states does a reservation go through? Can a checked-in stay be cancelled?
5. One hotel or a chain?
6. Overbooking allowed?

````reveal title="Answers we'll assume"
- Guests choose a **room type**; the system assigns a free room of that type.
- A stay `[checkIn, checkOut)` covers the **nights** from check-in up to, but not including, check-out. Checking out on the 15th and someone checking in on the 15th don't conflict.
- Price = sum over nights of the type's base rate, with a **+25% surcharge on Friday and Saturday nights**. Pricing must be replaceable (seasons, promotions).
- Lifecycle: `CONFIRMED → CHECKED_IN → CHECKED_OUT`; `CONFIRMED → CANCELLED` (before the check-in date); `CONFIRMED → NO_SHOW` (check-in date passed). Nothing else.
- One hotel; a chain is a follow-up.
- No overbooking: a room is never reserved twice for the same night.
````

## Requirements

**Functional**

1. Search available rooms of a type for a date range.
2. Reserve a room of a type for a guest (validated: dates, capacity).
3. Price the stay with a pluggable pricing policy.
4. Check in (on or after the check-in date), check out, cancel (before arrival), mark no-shows.
5. Look up reservations by ID and by guest.

**Non-functional**

6. No double booking, even with concurrent requests.
7. Storage behind a repository interface; time is injectable for tests.

## Step 1 — Entities

````reveal title="Entities and responsibilities"
| Entity | Responsibility |
|---|---|
| `StayDates` | Value object `[checkIn, checkOut)`; validates the range; lists the nights |
| `HotelRoom` | Room number, type, and the **nights it is taken** (night → reservation ID); atomic `tryReserve` |
| `ReservationRequest` | What the guest asks for; built and validated by a **Builder** |
| `Reservation` | ID, guest, assigned room, dates, price, **status** (state machine) |
| `PricingStrategy` | Price for a room type and stay |
| `ReservationRepository` | Stores and finds reservations |
| `HotelService` | Facade: search, reserve, and lifecycle operations |

**Key insight:** availability is per **room × night**. Storing booked nights on each room makes "is room 201 free from the 12th to the 15th?" a lookup per night, and makes the room the natural lock.
````

## Step 2 — Reservation lifecycle

```states title="Reservation"
[*] --> CONFIRMED
CONFIRMED --> CHECKED_IN : checkIn [checkIn date <= today < checkOut]
CONFIRMED --> CANCELLED : cancel [today < checkIn date] / free nights
CONFIRMED --> NO_SHOW : markNoShows [checkIn date passed] / free nights
CHECKED_IN --> CHECKED_OUT : checkOut
CHECKED_OUT --> [*]
CANCELLED --> [*]
NO_SHOW --> [*]
```

## Step 3 — Class design

```uml title="Hotel reservation"
class HotelService
  - rooms: List<HotelRoom>
  - repository: ReservationRepository
  - pricing: PricingStrategy
  - clock: Clock
  + search(type: RoomType, dates: StayDates): List<String>
  + reserve(request: ReservationRequest): Reservation
  + checkIn(id: String): void
  + checkOut(id: String): void
  + cancel(id: String): void
  + markNoShows(): int
class HotelRoom
  - number: String
  - type: RoomType
  - nights: Map<LocalDate, String>
  + isFree(dates: StayDates): boolean
  + tryReserve(dates: StayDates, reservationId: String): boolean
  + release(dates: StayDates, reservationId: String): void
class ReservationRequest
  - guest: String
  - type: RoomType
  - dates: StayDates
  - guests: int
  + builder(): Builder
class Reservation
  - id: String
  - room: String
  - price: long
  - status: ReservationStatus
  + moveTo(next: ReservationStatus): void
record StayDates
  + checkIn: LocalDate
  + checkOut: LocalDate
enum ReservationStatus
  CONFIRMED
  CHECKED_IN
  CHECKED_OUT
  CANCELLED
  NO_SHOW
interface PricingStrategy
  + price(type: RoomType, dates: StayDates): long
class WeekendSurchargePricing
interface ReservationRepository
  + save(r: Reservation): void
  + findById(id: String): Optional<Reservation>
  + findByGuest(guest: String): List<Reservation>
class InMemoryReservationRepository
HotelService o-- "1..*" HotelRoom
HotelService --> ReservationRepository
HotelService --> PricingStrategy
HotelService ..> ReservationRequest
Reservation --> StayDates
Reservation --> ReservationStatus
WeekendSurchargePricing ..|> PricingStrategy
InMemoryReservationRepository ..|> ReservationRepository
```

## Step 4 — Implementation

````hint title="Hint — where do the rules live?"
- Date-range validity → `StayDates` (compact constructor).
- "Is this request complete and sensible?" → `ReservationRequest.Builder.build()`.
- "Which status changes are legal?" → `ReservationStatus.canMoveTo`.
- "Is today a valid day to check in or cancel?" → `HotelService`, because it needs the clock.
- "Are these nights free?" → `HotelRoom`, under its own lock.
````

````solution title="Complete Java solution"
```java title="HotelDemo.java" file="HotelDemo.java"
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Stream;

public class HotelDemo {
    public static void main(String[] args) {
        MutableClock clock = new MutableClock(LocalDate.parse("2026-06-01"));
        HotelService hotel = new HotelService(
                List.of(new HotelRoom("101", RoomType.STANDARD), new HotelRoom("201", RoomType.DELUXE), new HotelRoom("202", RoomType.DELUXE)),
                new InMemoryReservationRepository(),
                new WeekendSurchargePricing(Map.of(RoomType.STANDARD, 5_000L, RoomType.DELUXE, 8_000L, RoomType.SUITE, 15_000L), 25),
                clock);

        System.out.println("DELUXE free 12-15 Jun: " + hotel.search(RoomType.DELUXE, StayDates.of("2026-06-12", "2026-06-15")));
        Reservation asha = hotel.reserve(request("asha", "2026-06-12", "2026-06-15", 2));
        System.out.println(asha);
        Reservation ravi = hotel.reserve(request("ravi", "2026-06-13", "2026-06-14", 1));
        System.out.println(ravi);
        attempt(() -> hotel.reserve(request("meera", "2026-06-13", "2026-06-16", 2)));
        attempt(() -> hotel.reserve(request("kabir", "2026-06-20", "2026-06-22", 5)));

        hotel.cancel(ravi.id());
        System.out.println(hotel.reserve(request("meera", "2026-06-13", "2026-06-16", 2)));

        attempt(() -> hotel.checkIn(asha.id()));                  // too early
        clock.set(LocalDate.parse("2026-06-12"));
        hotel.checkIn(asha.id());
        attempt(() -> hotel.cancel(asha.id()));                   // already checked in
        hotel.checkOut(asha.id());
        System.out.println("asha's history: " + hotel.reservationsOf("asha"));
    }

    static ReservationRequest request(String guest, String in, String out, int guests) {
        return ReservationRequest.builder().guest(guest).roomType(RoomType.DELUXE).stay(in, out).guests(guests).build();
    }

    static void attempt(Runnable action) {
        try {
            action.run();
        } catch (ReservationException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
    }
}

class ReservationException extends RuntimeException {
    ReservationException(String message) { super(message); }
}

enum RoomType {
    STANDARD(2), DELUXE(3), SUITE(4);

    final int maxGuests;
    RoomType(int maxGuests) { this.maxGuests = maxGuests; }
}

/** The nights [checkIn, checkOut). */
record StayDates(LocalDate checkIn, LocalDate checkOut) {
    StayDates {
        if (!checkIn.isBefore(checkOut)) throw new ReservationException("check-out must be after check-in");
    }

    static StayDates of(String in, String out) { return new StayDates(LocalDate.parse(in), LocalDate.parse(out)); }

    Stream<LocalDate> nights() { return checkIn.datesUntil(checkOut); }

    @Override public String toString() { return checkIn + ".." + checkOut; }
}

// ---------- Request + Builder ----------

final class ReservationRequest {
    final String guest;
    final RoomType type;
    final StayDates dates;
    final int guests;

    private ReservationRequest(Builder b) {
        this.guest = b.guest;
        this.type = b.type;
        this.dates = b.dates;
        this.guests = b.guests;
    }

    static Builder builder() { return new Builder(); }

    static final class Builder {
        private String guest;
        private RoomType type;
        private StayDates dates;
        private int guests = 1;

        Builder guest(String guest) { this.guest = guest; return this; }
        Builder roomType(RoomType type) { this.type = type; return this; }
        Builder stay(String checkIn, String checkOut) { this.dates = StayDates.of(checkIn, checkOut); return this; }
        Builder guests(int guests) { this.guests = guests; return this; }

        /** All cross-field validation happens once, here. */
        ReservationRequest build() {
            if (guest == null || guest.isBlank()) throw new ReservationException("guest is required");
            if (type == null || dates == null) throw new ReservationException("room type and dates are required");
            if (guests < 1 || guests > type.maxGuests) throw new ReservationException(type + " holds at most " + type.maxGuests + " guests");
            return new ReservationRequest(this);
        }
    }
}

// ---------- Lifecycle ----------

enum ReservationStatus {
    CONFIRMED, CHECKED_IN, CHECKED_OUT, CANCELLED, NO_SHOW;

    boolean canMoveTo(ReservationStatus next) {
        return switch (this) {
            case CONFIRMED -> next == CHECKED_IN || next == CANCELLED || next == NO_SHOW;
            case CHECKED_IN -> next == CHECKED_OUT;
            case CHECKED_OUT, CANCELLED, NO_SHOW -> false;
        };
    }
}

final class Reservation {
    private final String id;
    private final String guest;
    private final String room;
    private final StayDates dates;
    private final long price;
    private ReservationStatus status = ReservationStatus.CONFIRMED;

    Reservation(String id, String guest, String room, StayDates dates, long price) {
        this.id = id; this.guest = guest; this.room = room; this.dates = dates; this.price = price;
    }

    String id() { return id; }
    String guest() { return guest; }
    String room() { return room; }
    StayDates dates() { return dates; }
    synchronized ReservationStatus status() { return status; }

    synchronized void moveTo(ReservationStatus next) {
        if (!status.canMoveTo(next)) throw new ReservationException("cannot move " + id + " from " + status + " to " + next);
        status = next;
    }

    @Override public synchronized String toString() { return id + " " + guest + " room " + room + " " + dates + " " + price + " " + status; }
}

// ---------- Rooms ----------

final class HotelRoom {
    private final String number;
    private final RoomType type;
    private final Map<LocalDate, String> nights = new HashMap<>();   // night -> reservation id

    HotelRoom(String number, RoomType type) { this.number = number; this.type = type; }

    String number() { return number; }
    RoomType type() { return type; }

    synchronized boolean isFree(StayDates dates) { return dates.nights().noneMatch(nights::containsKey); }

    /** Atomic: all nights or none. */
    synchronized boolean tryReserve(StayDates dates, String reservationId) {
        if (!isFree(dates)) return false;
        dates.nights().forEach(n -> nights.put(n, reservationId));
        return true;
    }

    synchronized void release(StayDates dates, String reservationId) {
        dates.nights().forEach(n -> nights.remove(n, reservationId));
    }
}

// ---------- Ports ----------

interface PricingStrategy { long price(RoomType type, StayDates dates); }

/** Base rate per night, plus a surcharge on Friday and Saturday nights. */
final class WeekendSurchargePricing implements PricingStrategy {
    private final Map<RoomType, Long> base;
    private final int surchargePercent;

    WeekendSurchargePricing(Map<RoomType, Long> base, int surchargePercent) {
        this.base = new EnumMap<>(base);
        this.surchargePercent = surchargePercent;
    }

    public long price(RoomType type, StayDates dates) {
        long rate = base.get(type);
        return dates.nights().mapToLong(n -> isWeekendNight(n) ? rate * (100 + surchargePercent) / 100 : rate).sum();
    }

    private static boolean isWeekendNight(LocalDate night) {
        return night.getDayOfWeek() == DayOfWeek.FRIDAY || night.getDayOfWeek() == DayOfWeek.SATURDAY;
    }
}

interface ReservationRepository {
    void save(Reservation r);
    Optional<Reservation> findById(String id);
    List<Reservation> findByGuest(String guest);
    List<Reservation> findAll();
}

final class InMemoryReservationRepository implements ReservationRepository {
    private final Map<String, Reservation> byId = new ConcurrentHashMap<>();

    public void save(Reservation r) { byId.put(r.id(), r); }
    public Optional<Reservation> findById(String id) { return Optional.ofNullable(byId.get(id)); }
    public List<Reservation> findByGuest(String guest) {
        return byId.values().stream().filter(r -> r.guest().equals(guest)).sorted(Comparator.comparing(Reservation::id)).toList();
    }
    public List<Reservation> findAll() { return List.copyOf(byId.values()); }
}

// ---------- Facade ----------

final class HotelService {
    private final List<HotelRoom> rooms;
    private final Map<String, HotelRoom> roomByNumber = new HashMap<>();
    private final ReservationRepository repository;
    private final PricingStrategy pricing;
    private final Clock clock;
    private final AtomicLong ids = new AtomicLong();

    HotelService(List<HotelRoom> rooms, ReservationRepository repository, PricingStrategy pricing, Clock clock) {
        this.rooms = rooms.stream().sorted(Comparator.comparing(HotelRoom::number)).toList();
        this.rooms.forEach(r -> roomByNumber.put(r.number(), r));
        this.repository = repository;
        this.pricing = pricing;
        this.clock = clock;
    }

    List<String> search(RoomType type, StayDates dates) {
        List<String> free = new ArrayList<>();
        for (HotelRoom r : rooms) if (r.type() == type && r.isFree(dates)) free.add(r.number());
        return free;
    }

    Reservation reserve(ReservationRequest req) {
        if (req.dates.checkIn().isBefore(today())) throw new ReservationException("check-in date is in the past");
        String id = "R" + ids.incrementAndGet();
        for (HotelRoom room : rooms) {
            if (room.type() == req.type && room.tryReserve(req.dates, id)) {   // first free room of the type wins
                Reservation r = new Reservation(id, req.guest, room.number(), req.dates, pricing.price(req.type, req.dates));
                repository.save(r);
                return r;
            }
        }
        throw new ReservationException("no " + req.type + " room free for " + req.dates);
    }

    void checkIn(String id) {
        Reservation r = find(id);
        LocalDate today = today();
        if (today.isBefore(r.dates().checkIn())) throw new ReservationException("check-in opens on " + r.dates().checkIn());
        if (!today.isBefore(r.dates().checkOut())) throw new ReservationException("the stay has ended");
        r.moveTo(ReservationStatus.CHECKED_IN);
    }

    void checkOut(String id) { find(id).moveTo(ReservationStatus.CHECKED_OUT); }

    void cancel(String id) {
        Reservation r = find(id);
        if (!today().isBefore(r.dates().checkIn())) throw new ReservationException("too late to cancel " + id);
        r.moveTo(ReservationStatus.CANCELLED);                     // throws if not CONFIRMED
        roomByNumber.get(r.room()).release(r.dates(), id);
    }

    /** Run daily: CONFIRMED reservations whose check-in date has passed become NO_SHOW. */
    int markNoShows() {
        int count = 0;
        for (Reservation r : repository.findAll()) {
            if (r.status() == ReservationStatus.CONFIRMED && r.dates().checkIn().isBefore(today())) {
                r.moveTo(ReservationStatus.NO_SHOW);
                roomByNumber.get(r.room()).release(r.dates(), r.id());
                count++;
            }
        }
        return count;
    }

    List<String> reservationsOf(String guest) {
        return repository.findByGuest(guest).stream().map(r -> r.id() + " " + r.status()).toList();
    }

    private Reservation find(String id) {
        return repository.findById(id).orElseThrow(() -> new ReservationException("no reservation " + id));
    }

    private LocalDate today() { return LocalDate.ofInstant(clock.instant(), clock.getZone()); }
}

final class MutableClock extends Clock {
    private volatile Instant now;
    MutableClock(LocalDate day) { set(day); }
    void set(LocalDate day) { now = day.atStartOfDay(ZoneOffset.UTC).toInstant(); }
    @Override public Instant instant() { return now; }
    @Override public ZoneId getZone() { return ZoneOffset.UTC; }
    @Override public Clock withZone(ZoneId zone) { return this; }
}
```
````

## Design decisions

- **Nights, not intervals.** A hotel sells nights, and stays are short, so a set of taken nights per room is simpler than interval arithmetic and makes "all nights free?" obvious. (Meeting rooms use a `TreeMap` of intervals instead, because slots are arbitrary minutes.)
- **The room is the lock.** `tryReserve` checks and takes all nights atomically under the room's lock; two guests can't get the same room for overlapping nights, and different rooms don't contend.
- **Builder for the request.** A request has several optional and cross-dependent fields (guest count depends on room type); `build()` validates them together, so the service never sees a half-formed request (see [Builder](lesson:builder)).
- **Transitions in the enum.** `canMoveTo` is the whole state machine in one place; `Reservation.moveTo` enforces it. Date-based guards (too early, too late) live in the service because they need the clock.
- **Repository port.** The service doesn't know whether reservations live in a map or a database (see [Repository](lesson:repository-pattern)).

## Patterns and principles

[Builder](lesson:builder) (`ReservationRequest`), [state machine](lesson:state-machines) (`ReservationStatus`), [Strategy](lesson:strategy) (`PricingStrategy`), [Repository](lesson:repository-pattern), [Facade](lesson:facade) (`HotelService`), and [domain invariants](lesson:domain-invariants) enforced by value objects (`StayDates`).

## Example execution flow

```text
today = Mon 1 Jun
search DELUXE 12..15      201 and 202 have no taken nights -> [201, 202]
reserve asha 12..15       201.tryReserve(nights 12,13,14) -> R1; price Fri+Sat at 10000, Sun at 8000 = 28000
reserve ravi 13..14       201 has night 13 -> try 202 -> R2; Sat night = 10000
reserve meera 13..16      201 taken on 13, 202 taken on 13 -> rejected
reserve kabir, 5 guests   Builder.build(): DELUXE holds at most 3 -> rejected
cancel R2                 CONFIRMED -> CANCELLED, 202 night 13 released
reserve meera 13..16      202 free -> R4
checkIn R1 on 1 Jun       too early -> rejected
today = Fri 12 Jun; checkIn R1 -> CHECKED_IN
cancel R1                 too late (check-in date reached) -> rejected; checkOut R1 -> CHECKED_OUT
```

```text title="Program output"
DELUXE free 12-15 Jun: [201, 202]
R1 asha room 201 2026-06-12..2026-06-15 28000 CONFIRMED
R2 ravi room 202 2026-06-13..2026-06-14 10000 CONFIRMED
Rejected: no DELUXE room free for 2026-06-13..2026-06-16
Rejected: DELUXE holds at most 3 guests
R4 meera room 202 2026-06-13..2026-06-16 26000 CONFIRMED
Rejected: check-in opens on 2026-06-12
Rejected: too late to cancel R1
asha's history: [R1 CHECKED_OUT]
```

## Edge cases

- **Check-out equals someone else's check-in** → no conflict (the check-out day is not a night of the stay).
- **Check-out on or before check-in** → `StayDates` refuses to exist.
- **Too many guests, missing fields** → the builder rejects the request.
- **Check-in before the date, or after the stay ended** → rejected.
- **Cancel on or after the check-in date** → rejected (the guest is a no-show or already in).
- **Cancel twice / check out without checking in** → illegal transitions.
- **A failed reservation attempt** consumes an ID (R3 here); IDs are unique, not gapless.

## Tests

```java title="HotelTest.java" file="HotelTest.java" test="HotelDemo.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class HotelTest {
    private MutableClock clock;
    private HotelService hotel;

    private static ReservationRequest req(String guest, String in, String out) {
        return ReservationRequest.builder().guest(guest).roomType(RoomType.STANDARD).stay(in, out).guests(2).build();
    }

    @BeforeEach
    void setUp() {
        clock = new MutableClock(LocalDate.parse("2026-06-01"));
        hotel = new HotelService(List.of(new HotelRoom("101", RoomType.STANDARD)), new InMemoryReservationRepository(),
                new WeekendSurchargePricing(Map.of(RoomType.STANDARD, 1_000L, RoomType.DELUXE, 2_000L, RoomType.SUITE, 3_000L), 50), clock);
    }

    @Test
    void weekendNightsAreSurcharged() {
        assertEquals(List.of("101"), hotel.search(RoomType.STANDARD, StayDates.of("2026-06-11", "2026-06-14")));
        Reservation r = hotel.reserve(req("a", "2026-06-11", "2026-06-14"));   // Thu, Fri, Sat nights
        assertEquals("R1 a room 101 2026-06-11..2026-06-14 4000 CONFIRMED", r.toString());
    }

    @Test
    void overlappingStaysConflictButAdjacentStaysDoNot() {
        hotel.reserve(req("a", "2026-06-10", "2026-06-12"));
        assertThrows(ReservationException.class, () -> hotel.reserve(req("b", "2026-06-11", "2026-06-13")));
        hotel.reserve(req("c", "2026-06-12", "2026-06-13"));
    }

    @Test
    void builderRejectsInvalidRequests() {
        assertThrows(ReservationException.class, () -> ReservationRequest.builder().roomType(RoomType.SUITE).stay("2026-06-10", "2026-06-11").build());
        assertThrows(ReservationException.class, () -> req("a", "2026-06-10", "2026-06-10"));
        assertThrows(ReservationException.class,
                () -> ReservationRequest.builder().guest("a").roomType(RoomType.STANDARD).stay("2026-06-10", "2026-06-11").guests(3).build());
    }

    @Test
    void lifecycleRulesAreEnforced() {
        Reservation r = hotel.reserve(req("a", "2026-06-10", "2026-06-12"));
        assertThrows(ReservationException.class, () -> hotel.checkIn(r.id()));
        clock.set(LocalDate.parse("2026-06-10"));
        hotel.checkIn(r.id());
        assertThrows(ReservationException.class, () -> hotel.cancel(r.id()));
        hotel.checkOut(r.id());
        assertThrows(ReservationException.class, () -> hotel.checkOut(r.id()));
    }

    @Test
    void noShowsFreeTheirNights() {
        Reservation r = hotel.reserve(req("a", "2026-06-10", "2026-06-12"));
        clock.set(LocalDate.parse("2026-06-11"));
        assertEquals(1, hotel.markNoShows());
        assertEquals(ReservationStatus.NO_SHOW, r.status());
        assertEquals(List.of("101"), hotel.search(RoomType.STANDARD, StayDates.of("2026-06-11", "2026-06-12")));
    }

    @Test
    void concurrentRequestsForTheLastRoomHaveOneWinner() throws InterruptedException {
        AtomicInteger winners = new AtomicInteger();
        ExecutorService pool = Executors.newFixedThreadPool(16);
        CountDownLatch go = new CountDownLatch(1);
        for (int i = 0; i < 100; i++) {
            String guest = "g" + i;
            pool.submit(() -> {
                go.await();
                try { hotel.reserve(req(guest, "2026-06-20", "2026-06-22")); winners.incrementAndGet(); } catch (ReservationException ignored) { }
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

- **Double booking** is prevented by `HotelRoom.tryReserve`: check every night and take them all under the room's lock.
- **Status changes** are serialised by the `Reservation`'s own lock, so "cancel" and "check in" racing on one reservation can't both succeed.
- **Cancel releases nights after the transition.** Releasing first would let another guest grab the room while the cancellation could still fail.
- **In a database:** a table `room_night(room_id, night, reservation_id)` with a **unique key on `(room_id, night)`** makes double booking impossible at the storage level; inserting the nights of a stay in one transaction gives you all-or-nothing.

## Common mistakes and alternatives

- **Treating check-out day as a booked night** — blocks same-day turnover.
- **Assigning a room at search time** — searches don't reserve; only `tryReserve` does, so the search result can be stale and that's fine.
- **Status as free-form strings set from anywhere** — no single place enforces the lifecycle.
- **Inventory counters per type ("5 deluxe left") without room assignment** — works for counting, but then room assignment at check-in must still avoid overlaps; many real systems do exactly this and assign rooms on arrival.

## Follow-up questions

````reveal title="Early check-out and extensions"
Early check-out: move to `CHECKED_OUT` and release the remaining nights (from today to the original check-out). Extension: `tryReserve` the extra nights on the **same** room; if it's taken, offer a room move, which is a new reservation for the extra nights linked to the first.
````

````reveal title="Cancellation fees"
Add a `CancellationPolicy` strategy: free until 48 hours before check-in, then one night's price. The service asks the policy for the fee when cancelling and records it on the reservation; the state machine is unchanged.
````

````reveal title="A hotel chain"
`HotelService` becomes per hotel; a `ChainSearchService` fans out searches to hotels in a city and merges results. Each hotel's inventory stays independent, so locking doesn't change.
````

## Complexity

- `search`: O(R × N) for R rooms of the type and N nights.
- `reserve`: O(R × N) worst case; usually the first free room.
- Lifecycle operations: O(1) plus O(N) to release nights.

## Interviewer checklist

- [ ] Stay as `[checkIn, checkOut)` nights; adjacent stays don't conflict
- [ ] Availability per room × night; atomic all-nights reservation
- [ ] Lifecycle state machine with guarded, time-aware transitions
- [ ] Builder validating the request
- [ ] Pricing strategy (weekend surcharge) and repository interface
- [ ] Concurrency story for the last room
