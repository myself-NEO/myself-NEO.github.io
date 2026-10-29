## Problem statement

Design a parking lot system for a multi-level garage. Vehicles of different sizes enter, get assigned a suitable spot and a ticket, and leave later, paying a fee based on how long they stayed. Several entry and exit gates operate at the same time.

> [!TIP] Try it first
> Spend 5 minutes writing your own clarifying questions and a requirements list before revealing anything below. Then work through each step, attempting it before opening the answer.

## Clarifying questions

Good questions to ask, grouped the way the [requirements lesson](lesson:requirements-gathering) suggests:

1. **Capabilities:** How many levels? Which vehicle types? Do we show availability?
2. **Rules:** Can a small vehicle use a bigger spot? How is the spot chosen? How is the fee calculated?
3. **Errors:** What happens when the lot is full, or a ticket is lost or used twice?
4. **Scope:** Payments, reservations, EV charging, a UI?
5. **Scale and concurrency:** How many gates operate at once?

````reveal title="Answers we'll assume"
- Several levels, each with **small, medium and large** spots.
- Vehicle types: **motorcycle → small, car → medium, truck → large**. A vehicle may use a **larger** spot if no fitting spot is free.
- Spot choice: **smallest adequate size first** (keep large spots for trucks), then the **lowest level**, then the **lowest spot number** (closest to the ramp).
- Fee: **hourly, rounded up, minimum 1 hour**, with a rate per vehicle type. Pricing rules **will change** (weekend rates are planned).
- Lot full → a clear error. Unknown or already-used ticket → error. The same vehicle can't be parked twice.
- **Out of scope:** payment processing (we compute the fee only), reservations, EV charging, UI.
- **Multiple gates concurrently**: no spot may ever be assigned twice.
````

## Requirements

**Functional**

1. Park a vehicle: assign a spot per the selection rule and issue a ticket.
2. Unpark with a ticket: free the spot and return the fee.
3. Report free spots per level and size.

**Non-functional**

4. Thread-safe: concurrent gates must never double-assign a spot or double-process a ticket.
5. Pricing must be replaceable without touching parking logic.
6. Allocation should be efficient (no scanning thousands of spots per car).

**Out of scope:** payments, reservations, EV charging, persistence (an in-memory design is fine).

## Step 1 — Core entities

Before opening the answer: list the nouns, decide which have **state that changes** or **rules to enforce**, and give each a one-sentence responsibility.

````reveal title="Entities and responsibilities"
| Entity | Kind | Responsibility |
|---|---|---|
| `ParkingLot` | Orchestrator (facade) | Park and unpark; owns levels, active tickets and pricing |
| `Level` | Entity | Owns its spots; claims and releases free spots of a given size **atomically** |
| `ParkingSpot` | Entity | Spot ID, size and level number |
| `SpotSize` | Enum | SMALL, MEDIUM, LARGE, plus the rule "which sizes can hold me?" |
| `VehicleType` | Enum | MOTORCYCLE, CAR, TRUCK, plus the minimum spot size |
| `Vehicle` | Value object (record) | Plate + type |
| `Ticket` | Value object (record) | ID, vehicle, spot, entry time |
| `PricingStrategy` | Interface (Strategy) | Fee for a ticket at an exit time |

Deliberately **not** classes: `EntryGate`/`ExitGate` (no behaviour in our requirements), `DisplayBoard` (a query method is enough), `Payment` (out of scope).
````

## Step 2 — Class design

Think about two questions first: *where does the "is this spot free?" rule live, and how does a gate find a free spot without scanning every spot?*

````reveal title="Class diagram and reasoning"
- **Allocation lives in `Level`.** Each level keeps a pool of free spots **per size**, as a `TreeSet` ordered by spot number. Claiming is `pollFirst()`, O(log n), under the level's lock. Different levels never block each other.
- **`ParkingLot` orchestrates.** It walks sizes from the smallest that fits up to LARGE, and levels from lowest to highest, asking each level to claim. It keeps active tickets in a `ConcurrentHashMap`.
- **Pricing is a Strategy**, injected, because requirement 5 says it will change.
- **Time and IDs are injected** (`Clock`, an `AtomicLong` sequence) for deterministic tests.

```uml title="Parking lot"
class ParkingLot
  - levels: List<Level>
  - activeTickets: ConcurrentHashMap<String, Ticket>
  - plates: ConcurrentHashMap<String, String>
  - pricing: PricingStrategy
  - clock: Clock
  + park(v: Vehicle): Ticket
  + unpark(ticketId: String): long
  + freeSpots(): Map<Integer, Map<SpotSize, Integer>>
class Level
  - number: int
  - free: EnumMap<SpotSize, TreeSet<ParkingSpot>>
  + claim(size: SpotSize): Optional<ParkingSpot>
  + release(spot: ParkingSpot): void
record ParkingSpot
  + id: String
  + size: SpotSize
  + level: int
record Ticket
  + id: String
  + vehicle: Vehicle
  + spot: ParkingSpot
  + entryTime: Instant
interface PricingStrategy
  + fee(t: Ticket, exit: Instant): long
class HourlyPricing
enum SpotSize
  SMALL
  MEDIUM
  LARGE
ParkingLot *-- "1..*" Level : owns
Level *-- "1..*" ParkingSpot : owns
ParkingLot o-- "0..*" Ticket : active
Ticket --> ParkingSpot
ParkingLot --> PricingStrategy : delegates fees
HourlyPricing ..|> PricingStrategy
```
````

## Step 3 — Lifecycle

```states title="A spot"
[*] --> FREE
FREE --> OCCUPIED : claim (park)
OCCUPIED --> FREE : release (unpark)
```

A spot's state is implicit: it's **free if and only if it's in its level's free pool**. That keeps a single source of truth: there's no `occupied` flag to keep in sync with the pool.

## Step 4 — Implementation

Attempt `park` and `unpark` yourself, including the concurrency handling, before opening the solution.

````hint title="Hint 1 — preventing double parking of the same car"
Two gates could receive the same plate (a cloned plate, or a retry). Use `ConcurrentHashMap.putIfAbsent(plate, …)` as an atomic "claim" of the plate *before* allocating a spot, and undo it if allocation fails.
````

````hint title="Hint 2 — preventing double unpark"
`ConcurrentHashMap.remove(ticketId)` is atomic: only one caller gets the ticket back. Everyone else gets `null` and should fail.
````

````solution title="Complete Java solution (Java 17, single file)"
```java title="ParkingLotDemo.java" file="ParkingLotDemo.java"
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

public class ParkingLotDemo {
    public static void main(String[] args) {
        MutableClock clock = new MutableClock(Instant.parse("2026-01-10T09:00:00Z"));
        PricingStrategy pricing = new HourlyPricing(Map.of(VehicleType.MOTORCYCLE, 10L, VehicleType.CAR, 40L, VehicleType.TRUCK, 100L));
        ParkingLot lot = ParkingLot.withLevels(List.of(
                Map.of(SpotSize.SMALL, 1, SpotSize.MEDIUM, 2, SpotSize.LARGE, 0),
                Map.of(SpotSize.SMALL, 0, SpotSize.MEDIUM, 1, SpotSize.LARGE, 1)), pricing, clock);

        Ticket car1 = lot.park(new Vehicle("KA-01-1111", VehicleType.CAR));
        Ticket bike = lot.park(new Vehicle("KA-02-2222", VehicleType.MOTORCYCLE));
        Ticket truck = lot.park(new Vehicle("KA-03-3333", VehicleType.TRUCK));
        System.out.println(car1.spot().id() + ", " + bike.spot().id() + ", " + truck.spot().id());
        System.out.println("Free: " + lot.freeSpots());

        clock.advance(Duration.ofMinutes(150));
        System.out.println("Car fee after 2h30m: " + lot.unpark(car1.id()));

        try {
            lot.unpark(car1.id());
        } catch (IllegalArgumentException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
        try {
            lot.park(new Vehicle("KA-03-3333", VehicleType.TRUCK));
        } catch (IllegalStateException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
    }
}

// ---------- Value types ----------

enum SpotSize { SMALL, MEDIUM, LARGE }

enum VehicleType {
    MOTORCYCLE(SpotSize.SMALL), CAR(SpotSize.MEDIUM), TRUCK(SpotSize.LARGE);

    private final SpotSize minimumSize;
    VehicleType(SpotSize minimumSize) { this.minimumSize = minimumSize; }

    /** Sizes this vehicle can use, smallest first. */
    List<SpotSize> fittingSizes() {
        List<SpotSize> sizes = new ArrayList<>();
        for (SpotSize s : SpotSize.values()) if (s.ordinal() >= minimumSize.ordinal()) sizes.add(s);
        return sizes;
    }
}

record Vehicle(String plate, VehicleType type) {
    Vehicle {
        if (plate == null || plate.isBlank()) throw new IllegalArgumentException("plate required");
        if (type == null) throw new IllegalArgumentException("type required");
    }
}

record ParkingSpot(String id, SpotSize size, int level, int number) {}

record Ticket(String id, Vehicle vehicle, ParkingSpot spot, Instant entryTime) {}

class LotFullException extends RuntimeException {
    LotFullException(VehicleType type) { super("No spot available for " + type); }
}

// ---------- Pricing (Strategy) ----------

interface PricingStrategy {
    long fee(Ticket ticket, Instant exitTime);
}

final class HourlyPricing implements PricingStrategy {
    private final Map<VehicleType, Long> ratePerHour;

    HourlyPricing(Map<VehicleType, Long> ratePerHour) {
        for (VehicleType t : VehicleType.values()) {
            if (!ratePerHour.containsKey(t)) throw new IllegalArgumentException("missing rate for " + t);
        }
        this.ratePerHour = new EnumMap<>(ratePerHour);
    }

    @Override
    public long fee(Ticket ticket, Instant exitTime) {
        long minutes = Duration.between(ticket.entryTime(), exitTime).toMinutes();
        if (minutes < 0) throw new IllegalArgumentException("exit before entry");
        long hours = Math.max(1, (minutes + 59) / 60);        // round up, minimum one hour
        return hours * ratePerHour.get(ticket.vehicle().type());
    }
}

// ---------- Level: owns its spots, allocation is atomic per level ----------

final class Level {
    private final int number;
    private final Map<SpotSize, TreeSet<ParkingSpot>> free = new EnumMap<>(SpotSize.class);

    Level(int number, Map<SpotSize, Integer> counts) {
        this.number = number;
        Comparator<ParkingSpot> byNumber = Comparator.comparingInt(ParkingSpot::number);
        int next = 1;
        for (SpotSize size : SpotSize.values()) {
            TreeSet<ParkingSpot> pool = new TreeSet<>(byNumber);
            for (int i = 0; i < counts.getOrDefault(size, 0); i++, next++) {
                pool.add(new ParkingSpot("L" + number + "-" + size.name().charAt(0) + next, size, number, next));
            }
            free.put(size, pool);
        }
    }

    int number() { return number; }

    /** Check-and-take in one atomic step: two gates can never receive the same spot. */
    synchronized Optional<ParkingSpot> claim(SpotSize size) {
        return Optional.ofNullable(free.get(size).pollFirst());
    }

    synchronized void release(ParkingSpot spot) {
        if (spot.level() != number) throw new IllegalArgumentException("spot " + spot.id() + " is not on level " + number);
        if (!free.get(spot.size()).add(spot)) throw new IllegalStateException("spot " + spot.id() + " was already free");
    }

    synchronized Map<SpotSize, Integer> freeCounts() {
        Map<SpotSize, Integer> counts = new EnumMap<>(SpotSize.class);
        free.forEach((size, pool) -> counts.put(size, pool.size()));
        return counts;
    }
}

// ---------- ParkingLot: the facade gates talk to ----------

final class ParkingLot {
    private static final String RESERVING = "";            // placeholder while a spot is being found

    private final List<Level> levels;
    private final PricingStrategy pricing;
    private final Clock clock;
    private final Map<String, Ticket> activeTickets = new ConcurrentHashMap<>();   // ticketId -> ticket
    private final Map<String, String> ticketByPlate = new ConcurrentHashMap<>();   // plate -> ticketId
    private final AtomicLong ticketSeq = new AtomicLong();

    ParkingLot(List<Level> levels, PricingStrategy pricing, Clock clock) {
        if (levels.isEmpty()) throw new IllegalArgumentException("at least one level required");
        this.levels = List.copyOf(levels);
        this.pricing = pricing;
        this.clock = clock;
    }

    static ParkingLot withLevels(List<Map<SpotSize, Integer>> layout, PricingStrategy pricing, Clock clock) {
        List<Level> levels = new ArrayList<>();
        for (int i = 0; i < layout.size(); i++) levels.add(new Level(i + 1, layout.get(i)));
        return new ParkingLot(levels, pricing, clock);
    }

    Ticket park(Vehicle vehicle) {
        // 1. Atomically claim the plate so the same vehicle can't be parked twice concurrently.
        if (ticketByPlate.putIfAbsent(vehicle.plate(), RESERVING) != null) {
            throw new IllegalStateException(vehicle.plate() + " is already parked");
        }
        try {
            // 2. Smallest fitting size first, then lowest level.
            for (SpotSize size : vehicle.type().fittingSizes()) {
                for (Level level : levels) {
                    Optional<ParkingSpot> spot = level.claim(size);
                    if (spot.isPresent()) {
                        Ticket ticket = new Ticket("T" + ticketSeq.incrementAndGet(), vehicle, spot.get(), clock.instant());
                        activeTickets.put(ticket.id(), ticket);
                        ticketByPlate.put(vehicle.plate(), ticket.id());
                        return ticket;
                    }
                }
            }
            throw new LotFullException(vehicle.type());
        } catch (RuntimeException e) {
            ticketByPlate.remove(vehicle.plate(), RESERVING);   // undo the plate claim on failure
            throw e;
        }
    }

    /** Returns the fee. Only one caller can ever succeed for a given ticket. */
    long unpark(String ticketId) {
        Ticket ticket = activeTickets.remove(ticketId);          // atomic: second caller gets null
        if (ticket == null) throw new IllegalArgumentException("unknown or already used ticket " + ticketId);
        long fee = pricing.fee(ticket, clock.instant());
        levelOf(ticket.spot()).release(ticket.spot());
        ticketByPlate.remove(ticket.vehicle().plate(), ticket.id());
        return fee;
    }

    Map<Integer, Map<SpotSize, Integer>> freeSpots() {
        Map<Integer, Map<SpotSize, Integer>> result = new LinkedHashMap<>();
        for (Level l : levels) result.put(l.number(), l.freeCounts());
        return result;
    }

    int activeCount() { return activeTickets.size(); }

    private Level levelOf(ParkingSpot spot) { return levels.get(spot.level() - 1); }
}

/** Controllable clock for demos and tests. */
final class MutableClock extends Clock {
    private volatile Instant now;
    MutableClock(Instant start) { this.now = start; }
    void advance(Duration d) { now = now.plus(d); }
    @Override public Instant instant() { return now; }
    @Override public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
    @Override public Clock withZone(java.time.ZoneId zone) { return this; }
}
```
````

## Design decisions

- **Allocation per level, under that level's lock.** The check-and-take (`pollFirst`) is atomic, so two gates can't get the same spot, and gates working on different levels don't contend. A single global lock would be simpler but would serialise every gate.
- **Free pools instead of an `occupied` flag.** The spot is free if and only if it's in the pool — one source of truth, and O(log n) allocation instead of an O(n) scan.
- **Plate claim before allocation.** `putIfAbsent` makes "one active ticket per vehicle" atomic, and the claim is undone if the lot turns out to be full.
- **`activeTickets.remove()` as the unpark gate.** It's atomic, so a double-submitted exit can't release a spot twice.
- **Fee computed before releasing the spot**, so pricing sees a consistent ticket. (Persisting the payment would come here too.)
- **Records for value types** (`Vehicle`, `Ticket`, `ParkingSpot`) and **enums with behaviour** (`fittingSizes`).

## Patterns and principles

| Where | Pattern / principle |
|---|---|
| `PricingStrategy` / `HourlyPricing` | [Strategy](lesson:strategy), [Open/Closed](lesson:open-closed) |
| `ParkingLot` as the single entry point | [Facade](lesson:facade) |
| `Level.claim` owning allocation | Information expert, [high cohesion](lesson:coupling-and-cohesion) |
| Injected `Clock` and pricing | [Dependency Injection](lesson:dependency-injection) |
| `VehicleType.fittingSizes()` | [Enums with behaviour](lesson:enums-and-records) instead of a switch |

Deliberately **not** used: Singleton for the lot (one instance is created in `main`), and a Factory for vehicles (a record constructor is enough).

## Example execution flow

```text
park(car KA-01-1111)      sizes [MEDIUM, LARGE] -> level 1 MEDIUM -> L1-M2        ticket T1 @09:00
park(bike KA-02-2222)     sizes [SMALL, ...]    -> level 1 SMALL  -> L1-S1        ticket T2
park(truck KA-03-3333)    sizes [LARGE]         -> level 1 none   -> level 2 LARGE -> L2-L2   ticket T3
freeSpots()               {1={SMALL=0, MEDIUM=1, LARGE=0}, 2={SMALL=0, MEDIUM=1, LARGE=0}}
clock +150 min
unpark(T1)                remove T1 -> fee = ceil(150/60)=3h * 40 = 120 -> release L1-M2
unpark(T1) again          remove returns null -> "unknown or already used ticket T1"
park(truck KA-03-3333)    plate already active -> "KA-03-3333 is already parked"
```

Program output:

```text
L1-M2, L1-S1, L2-L2
Free: {1={SMALL=0, MEDIUM=1, LARGE=0}, 2={SMALL=0, MEDIUM=1, LARGE=0}}
Car fee after 2h30m: 120
Rejected: unknown or already used ticket T1
Rejected: KA-03-3333 is already parked
```

## Edge cases

- **Lot full for a size but larger spots free:** the car overflows into a LARGE spot (by design).
- **Lot completely full:** `LotFullException`, and the plate claim is rolled back so the car can retry later.
- **Zero-minute stay:** charged the 1-hour minimum.
- **Exit time before entry** (clock skew): `IllegalArgumentException` from pricing.
- **Double exit** with the same ticket: the second call fails, and the spot isn't released twice.
- **Same plate parked twice:** rejected atomically, even if two gates race.
- **Releasing a spot that's already free:** `Level.release` detects it (defensive invariant check).

## Tests

```java title="ParkingLotTest.java" file="ParkingLotTest.java" test="ParkingLotDemo.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class ParkingLotTest {
    private MutableClock clock;
    private ParkingLot lot;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(Instant.parse("2026-01-10T09:00:00Z"));
        lot = ParkingLot.withLevels(List.of(
                Map.of(SpotSize.SMALL, 1, SpotSize.MEDIUM, 1, SpotSize.LARGE, 0),
                Map.of(SpotSize.SMALL, 0, SpotSize.MEDIUM, 1, SpotSize.LARGE, 1)),
                (ticket, exit) -> 99, clock);                       // fake pricing
    }

    @Test
    void prefersSmallestFittingSizeThenLowestLevel() {
        assertEquals("L1-M2", lot.park(new Vehicle("C1", VehicleType.CAR)).spot().id());
        assertEquals("L2-M1", lot.park(new Vehicle("C2", VehicleType.CAR)).spot().id());
        assertEquals("L2-L2", lot.park(new Vehicle("C3", VehicleType.CAR)).spot().id());   // overflow to LARGE
    }

    @Test
    void throwsWhenNoFittingSpotAndAllowsRetryLater() {
        Ticket first = lot.park(new Vehicle("TRUCK-1", VehicleType.TRUCK));
        assertThrows(LotFullException.class, () -> lot.park(new Vehicle("TRUCK-2", VehicleType.TRUCK)));
        // the failed attempt must not leave the plate "reserved"
        lot.unpark(first.id());
        assertEquals("L2-L2", lot.park(new Vehicle("TRUCK-2", VehicleType.TRUCK)).spot().id());
    }

    @Test
    void rejectsSameVehicleTwice() {
        lot.park(new Vehicle("C1", VehicleType.CAR));
        assertThrows(IllegalStateException.class, () -> lot.park(new Vehicle("C1", VehicleType.CAR)));
    }

    @Test
    void unparkReleasesSpotAndUsesStrategy() {
        Ticket t = lot.park(new Vehicle("B1", VehicleType.MOTORCYCLE));
        assertEquals(99, lot.unpark(t.id()));
        assertEquals(1, lot.freeSpots().get(1).get(SpotSize.SMALL));
        assertThrows(IllegalArgumentException.class, () -> lot.unpark(t.id()));
    }

    @ParameterizedTest
    @CsvSource({"0,40", "60,40", "61,80", "150,120"})
    void hourlyPricingRoundsUpWithOneHourMinimum(long minutes, long expectedFee) {
        HourlyPricing pricing = new HourlyPricing(Map.of(VehicleType.MOTORCYCLE, 10L, VehicleType.CAR, 40L, VehicleType.TRUCK, 100L));
        Instant in = Instant.parse("2026-01-10T09:00:00Z");
        Ticket t = new Ticket("T", new Vehicle("C", VehicleType.CAR), new ParkingSpot("S", SpotSize.MEDIUM, 1, 1), in);
        assertEquals(expectedFee, pricing.fee(t, in.plus(Duration.ofMinutes(minutes))));
    }

    @Test
    void concurrentGatesNeverAssignTheSameSpotTwice() throws InterruptedException {
        ParkingLot big = ParkingLot.withLevels(List.of(
                Map.of(SpotSize.MEDIUM, 25), Map.of(SpotSize.MEDIUM, 25)), (t, e) -> 0, clock);
        Set<String> spots = ConcurrentHashMap.newKeySet();
        ExecutorService gates = Executors.newFixedThreadPool(8);
        CountDownLatch start = new CountDownLatch(1);
        for (int i = 0; i < 100; i++) {
            String plate = "CAR-" + i;
            gates.submit(() -> {
                start.await();
                try {
                    spots.add(big.park(new Vehicle(plate, VehicleType.CAR)).spot().id());
                } catch (LotFullException expected) {
                    // 50 cars won't fit
                }
                return null;
            });
        }
        start.countDown();
        gates.shutdown();
        gates.awaitTermination(10, TimeUnit.SECONDS);

        assertEquals(50, spots.size());          // 50 distinct spots handed out
        assertEquals(50, big.activeCount());     // and exactly 50 tickets
    }
}
```

## Concurrency

- **Critical section 1: claiming a spot.** It's `Level.claim`, synchronised per level. Contention is limited to gates allocating on the same level at the same moment.
- **Critical section 2: one active ticket per plate.** It's `ConcurrentHashMap.putIfAbsent`, atomic per key.
- **Critical section 3: unpark.** It's `ConcurrentHashMap.remove`, so exactly one caller wins.
- **No nested locks**, so there's no deadlock risk: `ParkingLot` never holds a lock while calling a level.
- **Known trade-off:** a car may be told "full" while another gate is releasing a spot at the same instant. That's acceptable (it's eventually consistent from a driver's point of view) and avoids a global lock.

See [Thread Safety](lesson:thread-safety) and the [Concurrent Parking Lot](problem:concurrent-parking-lot) problem for a deeper take.

## Common mistakes and alternatives

- **`ParkingLot` as a Singleton** — hides the dependency and blocks testing multiple lots.
- **An inheritance tree of spot types** (`CompactSpot extends Spot`…) with no behaviour difference. An enum is enough.
- **Scanning every spot on every park** — fine for an interview with 50 spots if stated; free pools scale better.
- **A `boolean occupied` field plus a separate list** — two sources of truth that drift apart.
- **Fee logic inside `ParkingLot`** with a switch on vehicle type — breaks OCP; use a strategy.
- **Alternative design:** a single `ParkingSpotManager` holding `EnumMap<SpotSize, PriorityQueue<Spot>>` across all levels ordered by (level, number). It's simpler to allocate globally, but one lock covers everything.

## Follow-up questions

````reveal title="Add weekend pricing (double rates on Saturday and Sunday)"
Write a `WeekendMultiplier implements PricingStrategy` that wraps another strategy (a [Decorator](lesson:decorator)) and multiplies the fee when the exit time falls on a weekend. Inject `new WeekendMultiplier(new HourlyPricing(rates), 2)`. `ParkingLot` doesn't change.
````

````reveal title="Add EV charging spots"
Give `ParkingSpot` a set of features (`EnumSet<SpotFeature>`), and give `Vehicle` an optional "needs charging" flag. `Level` keeps pools keyed by (size, feature) or filters on claim. Charging fees become another pricing decorator, `ChargingFee`. `park()` passes the vehicle's requirements to the level.
````

````reveal title="Support reservations made in advance"
Add a `RESERVED` concept: a `Reservation(spot, plate, window)` takes the spot out of the free pool for the window. On arrival, `park()` first checks for a reservation by plate. Expired reservations return their spots to the pool (a scheduled or lazy expiry transition). This is where a small [state machine](lesson:state-machines) per spot (FREE/RESERVED/OCCUPIED) starts to pay off.
````

````reveal title="Display boards on each level showing free counts"
Make `Level` publish a `FreeCountChanged(level, size, count)` event after each claim and release ([Observer](lesson:observer)). Boards subscribe. Publish **after** releasing the lock to avoid calling foreign code while holding it.
````

## Complexity

| Operation | Time | Notes |
|---|---|---|
| `park` | O(S × L × log n) worst case | S ≤ 3 sizes, L levels, a TreeSet poll per level; effectively O(L log n) |
| `unpark` | O(log n) | Map remove + TreeSet add |
| `freeSpots` | O(L × S) | |
| Memory | O(total spots + active tickets) | |

For hundreds of levels, keep a lot-wide index of "levels with free spots of size X" to avoid probing full levels.

## Interviewer checklist

- [ ] Clarified vehicle/spot sizes, the selection rule, pricing and concurrency
- [ ] Entities limited to what the requirements need; no gate or display classes without behaviour
- [ ] Allocation logic owned by `Level` (or a spot manager), not by a god class
- [ ] Pricing behind a strategy interface, injected
- [ ] Atomic claim of spots; no double assignment under concurrency
- [ ] Double unpark and double park handled
- [ ] Edge cases: full lot, overflow to a larger size, zero-minute stays, rounding
- [ ] Clock injected; tests described (including a concurrency test)
- [ ] Follow-ups answered as local changes (pricing decorator, spot features, reservations)
