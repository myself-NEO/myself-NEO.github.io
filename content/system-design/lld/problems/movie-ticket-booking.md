## Problem statement

Design a movie ticket booking system like BookMyShow. Users browse shows, pick seats on a seat map, **hold** them while they pay, and get a confirmed booking. Holds expire if payment isn't completed in time. At the start of a popular sale, many users try to book the same seats at once.

> [!TIP] Try it first
> The heart of this problem is a **concurrent state machine on seats**. Design the seat lifecycle and decide where the lock goes before anything else.

## Clarifying questions

1. Scope: browsing movies and theatres, or just booking for a given show?
2. Seat selection: user-chosen seats, or "best available"?
3. Hold duration? What happens when it expires?
4. Payment: in scope, or an external gateway?
5. Pricing: by seat type? Dynamic?
6. Cancellations and refunds?
7. Max seats per booking?

````reveal title="Answers we'll assume"
- Catalogue browsing is simple (shows by movie); the focus is **booking for a show**.
- Users **choose specific seats**. A booking is **all-or-nothing** across the chosen seats (at most 6).
- Seats are **held for 10 minutes**; an expired hold returns the seats to the pool automatically.
- Payment goes through an external **`PaymentGateway`** (it can fail or decline).
- Price per seat type (REGULAR, PREMIUM); the pricing policy may change.
- Cancellation allowed until the show starts, with a full refund (policy may change).
- **No double booking, ever**, even with thousands of concurrent requests.
````

## Requirements

**Functional**

1. List the seat map of a show with seat status.
2. Hold 1–6 chosen seats for a user (all or nothing).
3. Confirm a hold by paying; produce a booking.
4. Release a hold explicitly, or expire it after 10 minutes.
5. Cancel a confirmed booking before the show starts (refund).

**Non-functional**

6. Correct under high concurrency: a seat is never held or booked by two users.
7. Different shows don't contend with each other.
8. Pricing and payment are pluggable; time is injectable.

## Step 1 — Entities

````reveal title="Entities and responsibilities"
| Entity | Responsibility |
|---|---|
| `Show` | **Aggregate root** for one screening: owns its `ShowSeat`s; all seat transitions go through it, under one lock |
| `ShowSeat` | Status of one seat **for this show**: AVAILABLE → HELD(user, until) → BOOKED |
| `Seat` / `SeatId` | Physical seat: row, number, type (value objects) |
| `Hold` | Value object: show, user, seats, expiry — the "token" a user pays against |
| `Booking` | Confirmed seats, amount, payment reference, status |
| `PricingPolicy` | Strategy: price for a set of seats |
| `PaymentGateway` | Port to the external payment provider |
| `BookingService` | Facade: hold → pay → confirm, with compensation; cancellation |

**Key insight:** status lives on `ShowSeat` (seat × show), not on `Seat`. The same chair is free at 6pm and booked at 9pm.
````

## Step 2 — Seat lifecycle

```states title="ShowSeat"
[*] --> AVAILABLE
AVAILABLE --> HELD : hold(user) / holdUntil = now + 10 min
HELD --> BOOKED : confirm(user) [same user, now < holdUntil]
HELD --> AVAILABLE : release(user) [same user]
HELD --> AVAILABLE : expire [now >= holdUntil]
BOOKED --> AVAILABLE : cancel booking [before show starts]
```

## Step 3 — Class design and the locking decision

````reveal title="Where does the lock go?"
A booking spans **several seats of one show** and must be all-or-nothing. Locking each seat separately would need ordered locking to avoid deadlock, plus rollback. Locking the **`Show`** makes the multi-seat check-then-act trivially atomic, and different shows never contend. That matches requirement 7.

Payment is **not** done while holding the show lock (it's slow and remote). The flow is: lock → hold seats → unlock → pay → lock → confirm (re-checking the hold is still valid) → unlock. Expiry is a transition checked under the same lock, so "confirm" and "expire" can't both win.
````

```uml title="Movie booking"
class BookingService
  - shows: Map<String, Show>
  - pricing: PricingPolicy
  - payments: PaymentGateway
  - clock: Clock
  + hold(showId: String, user: String, seats: List<SeatId>): Hold
  + confirm(hold: Hold, card: String): Booking
  + release(hold: Hold): void
  + cancel(bookingId: String, user: String): void
class Show
  - id: String
  - startsAt: Instant
  - seats: Map<SeatId, ShowSeat>
  + hold(user: String, ids: List<SeatId>, now: Instant): Hold
  + confirm(h: Hold, bookingId: String, now: Instant): void
  + release(h: Hold): void
class ShowSeat
  - status: SeatStatus
  - heldBy: String
  - holdUntil: Instant
record Hold
  + showId: String
  + user: String
  + seats: List<SeatId>
  + expiresAt: Instant
class Booking
  - id: String
  - amount: long
  - status: BookingStatus
interface PricingPolicy
  + price(seats: List<Seat>): long
interface PaymentGateway
  + charge(card: String, amount: long, key: String): PaymentResult
BookingService o-- "0..*" Show
Show *-- "1..*" ShowSeat
BookingService ..> Hold
BookingService o-- "0..*" Booking
BookingService --> PricingPolicy
BookingService --> PaymentGateway
```

## Step 4 — Implementation

````hint title="Hint — compensation"
If the payment fails, release the hold immediately (don't wait for expiry). If the payment succeeds but the hold has already expired (the user paid at 10:01), the confirmation must fail and the charge must be **refunded**.
````

````solution title="Complete Java solution"
```java title="MovieBookingDemo.java" file="MovieBookingDemo.java"
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

public class MovieBookingDemo {
    public static void main(String[] args) {
        MutableClock clock = new MutableClock(Instant.parse("2026-05-01T12:00:00Z"));
        FakeGateway gateway = new FakeGateway();
        BookingService service = new BookingService(new SeatTypePricing(Map.of(SeatType.REGULAR, 200L, SeatType.PREMIUM, 350L)), gateway, clock);
        service.addShow(new Show("S1", Instant.parse("2026-05-01T18:00:00Z"), List.of(
                new Seat(SeatId.of("A1"), SeatType.REGULAR), new Seat(SeatId.of("A2"), SeatType.REGULAR),
                new Seat(SeatId.of("A3"), SeatType.REGULAR), new Seat(SeatId.of("B1"), SeatType.PREMIUM))));

        Hold asha = service.hold("S1", "asha", List.of(SeatId.of("A1"), SeatId.of("A2")));
        Booking b1 = service.confirm(asha, "4111");
        System.out.println("asha booked " + b1.seats() + " for " + b1.amount());

        attempt(() -> service.hold("S1", "ravi", List.of(SeatId.of("A2"), SeatId.of("A3"))));   // A2 taken: nothing held

        Hold ravi = service.hold("S1", "ravi", List.of(SeatId.of("A3")));
        attempt(() -> service.confirm(ravi, "0000-DECLINE"));                                     // declined: released
        System.out.println("A3 after decline: " + service.seatMap("S1").get(SeatId.of("A3")));

        Hold meera = service.hold("S1", "meera", List.of(SeatId.of("B1")));
        clock.advance(Duration.ofMinutes(11));
        attempt(() -> service.confirm(meera, "4111"));                                            // expired: rejected before charging
        System.out.println("refunds issued: " + gateway.refunds());
        System.out.println("kabir holds B1: " + service.hold("S1", "kabir", List.of(SeatId.of("B1"))).seats());

        service.cancel(b1.id(), "asha");
        System.out.println("after cancel: " + service.seatMap("S1"));
    }

    static void attempt(Runnable r) {
        try {
            r.run();
        } catch (BookingException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
    }
}

// ---------- Value types ----------

record SeatId(char row, int number) {
    static SeatId of(String s) { return new SeatId(s.charAt(0), Integer.parseInt(s.substring(1))); }
    @Override public String toString() { return "" + row + number; }
}

enum SeatType { REGULAR, PREMIUM }
record Seat(SeatId id, SeatType type) {}
enum SeatStatus { AVAILABLE, HELD, BOOKED }
enum BookingStatus { CONFIRMED, CANCELLED }

record Hold(String showId, String user, List<SeatId> seats, Instant expiresAt) {}
record PaymentResult(boolean success, String reference) {}

class BookingException extends RuntimeException {
    BookingException(String message) { super(message); }
}

// ---------- Ports ----------

interface PricingPolicy { long price(List<Seat> seats); }

final class SeatTypePricing implements PricingPolicy {
    private final Map<SeatType, Long> prices;
    SeatTypePricing(Map<SeatType, Long> prices) { this.prices = Map.copyOf(prices); }
    public long price(List<Seat> seats) { return seats.stream().mapToLong(s -> prices.get(s.type())).sum(); }
}

interface PaymentGateway {
    PaymentResult charge(String card, long amount, String idempotencyKey);
    void refund(String reference);
}

final class FakeGateway implements PaymentGateway {
    private final List<String> refunds = new ArrayList<>();
    private final AtomicLong seq = new AtomicLong();
    public PaymentResult charge(String card, long amount, String key) {
        return card.contains("DECLINE") ? new PaymentResult(false, null) : new PaymentResult(true, "pay_" + seq.incrementAndGet());
    }
    public synchronized void refund(String reference) { refunds.add(reference); }
    synchronized List<String> refunds() { return List.copyOf(refunds); }
}

// ---------- Aggregate: one show, one lock ----------

final class ShowSeat {
    final Seat seat;
    SeatStatus status = SeatStatus.AVAILABLE;
    String heldBy;
    Instant holdUntil;
    String bookingId;

    ShowSeat(Seat seat) { this.seat = seat; }

    void expireIfDue(Instant now) {
        if (status == SeatStatus.HELD && !now.isBefore(holdUntil)) clear();
    }

    void clear() {
        status = SeatStatus.AVAILABLE;
        heldBy = null;
        holdUntil = null;
        bookingId = null;
    }
}

final class Show {
    static final Duration HOLD_TTL = Duration.ofMinutes(10);
    static final int MAX_SEATS = 6;

    private final String id;
    private final Instant startsAt;
    private final Map<SeatId, ShowSeat> seats = new LinkedHashMap<>();

    Show(String id, Instant startsAt, List<Seat> layout) {
        this.id = id;
        this.startsAt = startsAt;
        layout.forEach(s -> seats.put(s.id(), new ShowSeat(s)));
    }

    String id() { return id; }

    /** All-or-nothing: either every requested seat becomes HELD, or none does. */
    synchronized Hold hold(String user, List<SeatId> ids, Instant now) {
        if (!now.isBefore(startsAt)) throw new BookingException("show " + id + " has started");
        if (ids.isEmpty() || ids.size() > MAX_SEATS) throw new BookingException("choose 1.." + MAX_SEATS + " seats");
        List<ShowSeat> wanted = new ArrayList<>();
        for (SeatId sid : ids) {
            ShowSeat s = seats.get(sid);
            if (s == null) throw new BookingException("no seat " + sid);
            s.expireIfDue(now);
            if (s.status != SeatStatus.AVAILABLE) throw new BookingException("seat " + sid + " is " + s.status);
            if (wanted.contains(s)) throw new BookingException("seat " + sid + " requested twice");
            wanted.add(s);
        }
        Instant until = now.plus(HOLD_TTL);
        for (ShowSeat s : wanted) {                 // commit only after every check passed
            s.status = SeatStatus.HELD;
            s.heldBy = user;
            s.holdUntil = until;
        }
        return new Hold(id, user, List.copyOf(ids), until);
    }

    /** Re-validates the hold under the lock: confirm and expiry can't both win. */
    synchronized void confirm(Hold hold, String bookingId, Instant now) {
        for (SeatId sid : hold.seats()) {
            ShowSeat s = seats.get(sid);
            s.expireIfDue(now);
            if (s.status != SeatStatus.HELD || !hold.user().equals(s.heldBy)) throw new BookingException("hold on " + sid + " is no longer valid");
        }
        for (SeatId sid : hold.seats()) {
            ShowSeat s = seats.get(sid);
            s.status = SeatStatus.BOOKED;
            s.bookingId = bookingId;
            s.heldBy = null;
            s.holdUntil = null;
        }
    }

    synchronized void release(Hold hold) {
        for (SeatId sid : hold.seats()) {
            ShowSeat s = seats.get(sid);
            if (s.status == SeatStatus.HELD && hold.user().equals(s.heldBy)) s.clear();
        }
    }

    synchronized void cancel(String bookingId, List<SeatId> ids, Instant now) {
        if (!now.isBefore(startsAt)) throw new BookingException("cannot cancel after the show started");
        for (SeatId sid : ids) {
            ShowSeat s = seats.get(sid);
            if (s.status == SeatStatus.BOOKED && bookingId.equals(s.bookingId)) s.clear();
        }
    }

    synchronized List<Seat> seatsOf(List<SeatId> ids) {
        List<Seat> list = new ArrayList<>();
        ids.forEach(i -> list.add(seats.get(i).seat));
        return list;
    }

    synchronized Map<SeatId, SeatStatus> seatMap(Instant now) {
        Map<SeatId, SeatStatus> map = new LinkedHashMap<>();
        seats.forEach((sid, s) -> {
            s.expireIfDue(now);
            map.put(sid, s.status);
        });
        return map;
    }
}

final class Booking {
    private final String id;
    private final String showId;
    private final String user;
    private final List<SeatId> seats;
    private final long amount;
    private final String paymentRef;
    private BookingStatus status = BookingStatus.CONFIRMED;

    Booking(String id, String showId, String user, List<SeatId> seats, long amount, String paymentRef) {
        this.id = id; this.showId = showId; this.user = user; this.seats = seats; this.amount = amount; this.paymentRef = paymentRef;
    }

    String id() { return id; }
    String showId() { return showId; }
    String user() { return user; }
    List<SeatId> seats() { return seats; }
    long amount() { return amount; }
    String paymentRef() { return paymentRef; }
    BookingStatus status() { return status; }

    void markCancelled() {
        if (status == BookingStatus.CANCELLED) throw new BookingException("already cancelled");
        status = BookingStatus.CANCELLED;
    }
}

// ---------- Facade ----------

final class BookingService {
    private final Map<String, Show> shows = new ConcurrentHashMap<>();
    private final Map<String, Booking> bookings = new ConcurrentHashMap<>();
    private final PricingPolicy pricing;
    private final PaymentGateway payments;
    private final Clock clock;
    private final AtomicLong ids = new AtomicLong();

    BookingService(PricingPolicy pricing, PaymentGateway payments, Clock clock) {
        this.pricing = pricing;
        this.payments = payments;
        this.clock = clock;
    }

    void addShow(Show show) { shows.put(show.id(), show); }

    Hold hold(String showId, String user, List<SeatId> seats) { return show(showId).hold(user, seats, clock.instant()); }

    void release(Hold hold) { show(hold.showId()).release(hold); }

    Booking confirm(Hold hold, String card) {
        Show show = show(hold.showId());
        if (!clock.instant().isBefore(hold.expiresAt())) {
            show.release(hold);
            throw new BookingException("hold expired");
        }
        long amount = pricing.price(show.seatsOf(hold.seats()));
        String bookingId = "BK-" + ids.incrementAndGet();
        PaymentResult payment = payments.charge(card, amount, bookingId);   // slow call: NOT under the show lock
        if (!payment.success()) {
            show.release(hold);                                            // compensation 1: free the seats now
            throw new BookingException("payment declined");
        }
        try {
            show.confirm(hold, bookingId, clock.instant());
        } catch (BookingException e) {
            payments.refund(payment.reference());                          // compensation 2: paid too late
            throw e;
        }
        Booking booking = new Booking(bookingId, show.id(), hold.user(), hold.seats(), amount, payment.reference());
        bookings.put(bookingId, booking);
        return booking;
    }

    void cancel(String bookingId, String user) {
        Booking b = bookings.get(bookingId);
        if (b == null || !b.user().equals(user)) throw new BookingException("no booking " + bookingId + " for " + user);
        synchronized (b) {
            show(b.showId()).cancel(bookingId, b.seats(), clock.instant());
            b.markCancelled();
        }
        payments.refund(b.paymentRef());
    }

    Map<SeatId, SeatStatus> seatMap(String showId) { return show(showId).seatMap(clock.instant()); }

    private Show show(String id) {
        Show s = shows.get(id);
        if (s == null) throw new BookingException("no show " + id);
        return s;
    }
}

final class MutableClock extends Clock {
    private volatile Instant now;
    MutableClock(Instant start) { now = start; }
    void advance(Duration d) { now = now.plus(d); }
    @Override public Instant instant() { return now; }
    @Override public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
    @Override public Clock withZone(java.time.ZoneId zone) { return this; }
}
```
````

## Design decisions

- **`Show` is the aggregate and the lock.** Every seat transition for a show goes through its synchronized methods, so multi-seat holds are atomic without per-seat lock ordering. Shows don't contend with each other.
- **Two-phase flow** (hold, then confirm) with **payment outside the lock**. Holding a lock across a network call would serialise the whole show behind slow payments.
- **Lazy expiry** (`expireIfDue`) inside every seat operation: no background job is needed, and expiry is decided under the same lock as confirm.
- **Compensations:** a declined payment releases the seats immediately; a payment that succeeds after the hold expired is refunded.
- **The payment idempotency key is the booking ID**, so a retried `charge` can't double-charge (see [Idempotency](lesson:idempotency)).

## Patterns and principles

[Facade](lesson:facade) (`BookingService`), [aggregate + invariants](lesson:domain-invariants) (`Show`), [state machine](lesson:state-machines) (`ShowSeat`), [Strategy](lesson:strategy) (`PricingPolicy`), [ports and adapters](lesson:dependency-inversion) (`PaymentGateway`), and [concurrent state transitions](lesson:concurrent-state-transitions).

## Example execution flow

```text
hold(asha, A1+A2)    S1 lock: both AVAILABLE -> HELD until 12:10
confirm(asha)        price 400 -> charge OK -> S1 lock: still HELD by asha -> BOOKED
hold(ravi, A2+A3)    A2 BOOKED -> reject; A3 untouched (all-or-nothing)
hold(ravi, A3); confirm with declining card -> release A3 immediately
hold(meera, B1); +11 min; confirm -> hold already expired -> release, reject (no charge attempted)
hold(kabir, B1)      B1 expired -> AVAILABLE -> HELD by kabir
cancel(asha's booking) -> A1, A2 AVAILABLE, refund
```

```text title="Program output"
asha booked [A1, A2] for 400
Rejected: seat A2 is BOOKED
Rejected: payment declined
A3 after decline: AVAILABLE
Rejected: hold expired
refunds issued: []
kabir holds B1: [B1]
after cancel: {A1=AVAILABLE, A2=AVAILABLE, A3=AVAILABLE, B1=HELD}
```

## Edge cases

- **The same seat twice in one request** → rejected.
- **Partial availability** → nothing is held (all-or-nothing).
- **The user pays exactly at expiry** → the hold is invalid (`now >= holdUntil`); a successful charge is refunded.
- **Show already started** → no holds, no cancellations.
- **Releasing someone else's hold** → ignored (the `heldBy` check).
- **Cancelling twice** → the second attempt fails (`markCancelled`).

## Tests

```java title="MovieBookingTest.java" file="MovieBookingTest.java" test="MovieBookingDemo.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class MovieBookingTest {
    private MutableClock clock;
    private FakeGateway gateway;
    private BookingService service;
    private final List<SeatId> a1a2 = List.of(SeatId.of("A1"), SeatId.of("A2"));

    @BeforeEach
    void setUp() {
        clock = new MutableClock(Instant.parse("2026-05-01T12:00:00Z"));
        gateway = new FakeGateway();
        service = new BookingService(new SeatTypePricing(Map.of(SeatType.REGULAR, 200L, SeatType.PREMIUM, 350L)), gateway, clock);
        service.addShow(new Show("S1", Instant.parse("2026-05-01T18:00:00Z"), List.of(
                new Seat(SeatId.of("A1"), SeatType.REGULAR), new Seat(SeatId.of("A2"), SeatType.PREMIUM))));
    }

    @Test
    void holdAndConfirmBooksSeatsAtCorrectPrice() {
        Booking b = service.confirm(service.hold("S1", "u1", a1a2), "4111");
        assertEquals(550, b.amount());
        assertEquals(SeatStatus.BOOKED, service.seatMap("S1").get(SeatId.of("A2")));
    }

    @Test
    void holdIsAllOrNothing() {
        service.hold("S1", "u1", List.of(SeatId.of("A2")));
        assertThrows(BookingException.class, () -> service.hold("S1", "u2", a1a2));
        assertEquals(SeatStatus.AVAILABLE, service.seatMap("S1").get(SeatId.of("A1")));
    }

    @Test
    void expiredHoldCannotBeConfirmedAndSeatsReturn() {
        Hold h = service.hold("S1", "u1", a1a2);
        clock.advance(Duration.ofMinutes(10));                 // exactly at expiry
        assertThrows(BookingException.class, () -> service.confirm(h, "4111"));
        assertEquals(SeatStatus.AVAILABLE, service.seatMap("S1").get(SeatId.of("A1")));
    }

    @Test
    void declinedPaymentReleasesSeatsImmediately() {
        Hold h = service.hold("S1", "u1", a1a2);
        assertThrows(BookingException.class, () -> service.confirm(h, "DECLINE"));
        service.hold("S1", "u2", a1a2);                        // available again
    }

    @Test
    void cancelFreesSeatsAndRefunds() {
        Booking b = service.confirm(service.hold("S1", "u1", a1a2), "4111");
        service.cancel(b.id(), "u1");
        assertEquals(List.of(b.paymentRef()), gateway.refunds());
        assertThrows(BookingException.class, () -> service.cancel(b.id(), "u1"));
    }

    @Test
    void concurrentHoldsOnSameSeatsHaveOneWinner() throws InterruptedException {
        AtomicInteger winners = new AtomicInteger();
        ExecutorService pool = Executors.newFixedThreadPool(16);
        CountDownLatch go = new CountDownLatch(1);
        for (int i = 0; i < 200; i++) {
            String user = "u" + i;
            pool.submit(() -> {
                go.await();
                try { service.hold("S1", user, a1a2); winners.incrementAndGet(); } catch (BookingException ignored) { }
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

- **Critical section:** check-then-hold for several seats → `synchronized` on the `Show`.
- **Confirm vs expire:** both decided under the show lock with the same time-aware guard, so exactly one wins.
- **Hot shows:** one lock per show can become a bottleneck for a mega-release (thousands of requests per second for one show). Options: lock striping by **row or section** (a hold may span stripes → acquire stripes in sorted order), or a single-writer queue per show that processes hold commands in order.
- **In a database-backed version:** `UPDATE show_seat SET status='HELD', held_by=?, hold_until=? WHERE show_id=? AND seat_id IN (...) AND status='AVAILABLE'`, and check that the affected row count equals the number of seats requested, all inside a transaction.

## Common mistakes and alternatives

- **Status on `Seat`** instead of `ShowSeat`.
- **Paying inside the lock** — kills throughput.
- **Background expiry thread racing with confirm** without sharing the lock.
- **Partial holds** that leave some seats held when the request fails.
- **Alternative:** optimistic concurrency with a version per seat (see [Race Conditions](lesson:concurrent-state-transitions)) — great with a database and low contention, but needs retries.

## Follow-up questions

````reveal title="Best-available seat selection"
Add a `SeatSelectionStrategy` (Strategy) that, given the seat map and a count, proposes seats — for example, contiguous seats closest to the centre. The service tries to hold the proposal; if someone grabbed one of those seats meanwhile, it re-runs the strategy on a fresh map (bounded retries).
````

````reveal title="Dynamic pricing (surge when the show is nearly full)"
`OccupancyPricing` decorates the base `PricingPolicy`: it reads the show's occupancy and applies a multiplier. Price is computed at confirm time and shown to the user at hold time with a "price may change" rule, or locked into the `Hold` (store the quoted amount in the hold — more user-friendly).
````

````reveal title="Waitlist for sold-out shows"
Keep a per-show queue of waiting users. When seats are released (expiry, cancellation), notify the next waiting user and give them a short exclusive hold — the same hold-on-release idea as library holds.
````

## Complexity

- `hold` / `confirm` / `release`: O(k) for k requested seats (map lookups), under a per-show lock.
- `seatMap`: O(S) for S seats in the show.

## Interviewer checklist

- [ ] ShowSeat (seat × show) status identified
- [ ] Hold → pay → confirm flow with a TTL
- [ ] Lock granularity justified (per show; not a global lock; not inside payment)
- [ ] All-or-nothing multi-seat holds
- [ ] Expiry vs confirm race resolved
- [ ] Compensation for declined or late payments; idempotent payment key
- [ ] Concurrency test described
