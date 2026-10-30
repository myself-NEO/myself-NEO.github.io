## Problem statement

Design the allocation core of a large multi-level parking garage with **many entry and exit gates working at the same time**. Each gate asks for a spot for an arriving vehicle and releases spots when vehicles leave. Under rush-hour load, two gates must never hand out the same spot, a ticket must never be used to exit twice, and gates should not queue up behind one global lock.

> [!TIP] Try it first
> Start from the single-threaded [Parking Lot](problem:parking-lot). Then ask: what shared state does `park` read and write, and what is the **smallest** thing you can lock to keep it consistent?

## Clarifying questions

1. How many gates and levels? How hot is the contention?
2. Which spot should a vehicle get?
3. Vehicle and spot sizes?
4. What must never happen? What is acceptable to be approximate?
5. Can the same vehicle enter twice (cloned plates, sensor glitches)?

````reveal title="Answers we'll assume"
- Tens of gates, several levels, thousands of spots; at peak, hundreds of requests per second.
- A gate prefers the **level nearest to it**, then the next nearest. The policy must be pluggable (least-loaded level, reserved floors).
- Spots are `SMALL`, `MEDIUM`, `LARGE`; a vehicle takes the **smallest** free spot that fits (motorcycle → small first; car → medium first; truck → large only).
- **Never:** one spot given to two vehicles; one ticket used to exit twice; a free spot lost. **Approximate is fine:** the "free spaces" numbers on display boards.
- A plate that is already inside is rejected.
````

## Requirements

**Functional**

1. `park(vehicle, gate)` returns a ticket with a spot, or fails if nothing fits.
2. `unpark(ticketId)` frees the spot exactly once.
3. Free-space counts per level for display boards.

**Non-functional**

4. Safe under concurrent calls from all gates.
5. No global lock: gates on different levels proceed in parallel.
6. No deadlocks; no spot ever leaked or duplicated.

## Step 1 — Find the shared state

````reveal title="What needs protecting, and how"
| Shared state | Operation | Protection |
|---|---|---|
| Free spots on a level | check-then-take a spot | **one lock per level** (lock striping) |
| Active tickets | create on entry; remove on exit | `ConcurrentHashMap`; `remove(id)` is atomic, so only one exit wins |
| Vehicles inside | reject duplicates | `ConcurrentHashMap.putIfAbsent(plate, ticket)` |
| Free counts for displays | read often, write on every change | `AtomicInteger` per level, read without locking |

**Lock striping:** instead of one lock for the whole garage, each level is a stripe with its own lock. A park request takes **at most one lock at a time**, trying levels in the strategy's order. Two requests contend only if they hit the same level at the same moment, and holding one lock at a time rules out deadlock.
````

## Step 2 — Class design

```uml title="Concurrent parking lot"
class ParkingLot
  - levels: List<Level>
  - strategy: SpotAllocationStrategy
  - active: ConcurrentHashMap<String, Ticket>
  - ticketByPlate: ConcurrentHashMap<String, String>
  + park(v: Vehicle, gate: Gate): Ticket
  + unpark(ticketId: String): Spot
  + freeByLevel(): Map<Integer, Integer>
class Level
  - lock: ReentrantLock
  - free: Map<SpotSize, TreeSet<Spot>>
  - freeCount: AtomicInteger
  + tryAllocate(type: VehicleType): Optional<Spot>
  + release(s: Spot): void
interface SpotAllocationStrategy
  + order(levels: List<Level>, gate: Gate): List<Level>
class NearestLevelFirst
record Spot
  + level: int
  + size: SpotSize
  + number: int
record Ticket
  + id: String
  + vehicle: Vehicle
  + spot: Spot
record Gate
  + id: String
  + level: int
ParkingLot *-- "1..*" Level
ParkingLot --> SpotAllocationStrategy
ParkingLot o-- "0..*" Ticket
Level *-- "0..*" Spot
NearestLevelFirst ..|> SpotAllocationStrategy
```

## Step 3 — Implementation

````hint title="Hint — the duplicate-vehicle check"
Claim the plate **before** allocating (`putIfAbsent(plate, ticketId)`), and release the claim if no spot is found. Checking "is this plate inside?" and inserting it later would let two gates both pass the check.
````

````solution title="Complete Java solution"
```java title="ConcurrentParkingDemo.java" file="ConcurrentParkingDemo.java"
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.locks.ReentrantLock;

public class ConcurrentParkingDemo {
    public static void main(String[] args) throws InterruptedException {
        Map<SpotSize, Integer> layout = Map.of(SpotSize.SMALL, 2, SpotSize.MEDIUM, 3, SpotSize.LARGE, 1);
        ParkingLot lot = new ParkingLot(3, layout, new NearestLevelFirst());
        Gate ground = new Gate("G0", 0);
        Gate roof = new Gate("G2", 2);

        System.out.println("car KA-01 at G0 -> " + lot.park(new Vehicle("KA-01", VehicleType.CAR), ground).spot());
        System.out.println("car KA-02 at G2 -> " + lot.park(new Vehicle("KA-02", VehicleType.CAR), roof).spot());
        System.out.println("bike MH-9 at G0 -> " + lot.park(new Vehicle("MH-9", VehicleType.MOTORCYCLE), ground).spot());
        Ticket truck1 = lot.park(new Vehicle("TN-1", VehicleType.TRUCK), ground);
        System.out.println("truck TN-1 at G0 -> " + truck1.spot());
        System.out.println("truck TN-2 at G0 -> " + lot.park(new Vehicle("TN-2", VehicleType.TRUCK), ground).spot());
        attempt(() -> lot.park(new Vehicle("KA-01", VehicleType.CAR), roof));
        System.out.println("TN-1 leaves from " + lot.unpark(truck1.id()));
        attempt(() -> lot.unpark(truck1.id()));
        System.out.println("free per level: " + lot.freeByLevel());

        // Rush hour: 8 gates race for 100 spots with 400 cars, then every ticket is presented at two exits at once.
        ParkingLot big = new ParkingLot(4, Map.of(SpotSize.MEDIUM, 25), new NearestLevelFirst());
        List<Ticket> tickets = Collections.synchronizedList(new ArrayList<>());
        AtomicInteger rejected = new AtomicInteger();
        runConcurrently(8, gate -> {
            for (int i = 0; i < 50; i++) {
                try {
                    tickets.add(big.park(new Vehicle("G" + gate + "-" + i, VehicleType.CAR), new Gate("G" + gate, gate % 4)));
                } catch (ParkingException e) {
                    rejected.incrementAndGet();
                }
            }
        });
        Set<Spot> distinct = new HashSet<>();
        tickets.forEach(t -> distinct.add(t.spot()));
        System.out.println("rush hour: parked " + tickets.size() + ", rejected " + rejected + ", distinct spots " + distinct.size());

        AtomicInteger exits = new AtomicInteger();
        AtomicInteger duplicateExits = new AtomicInteger();
        runConcurrently(2, exitGate -> {
            for (Ticket t : List.copyOf(tickets)) {
                try {
                    big.unpark(t.id());
                    exits.incrementAndGet();
                } catch (ParkingException e) {
                    duplicateExits.incrementAndGet();
                }
            }
        });
        System.out.println("exits " + exits + ", duplicate exits refused " + duplicateExits + ", free now " + big.freeByLevel());
    }

    interface GateJob { void run(int gate); }

    static void runConcurrently(int gates, GateJob job) throws InterruptedException {
        ExecutorService pool = Executors.newFixedThreadPool(gates);
        CountDownLatch go = new CountDownLatch(1);
        for (int g = 0; g < gates; g++) {
            int gate = g;
            pool.submit(() -> {
                go.await();
                job.run(gate);
                return null;
            });
        }
        go.countDown();
        pool.shutdown();
        pool.awaitTermination(30, TimeUnit.SECONDS);
    }

    static void attempt(Runnable action) {
        try {
            action.run();
        } catch (ParkingException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
    }
}

class ParkingException extends RuntimeException {
    ParkingException(String message) { super(message); }
}

enum SpotSize { SMALL, MEDIUM, LARGE }

enum VehicleType {
    MOTORCYCLE(SpotSize.SMALL), CAR(SpotSize.MEDIUM), TRUCK(SpotSize.LARGE);

    private final SpotSize minimum;
    VehicleType(SpotSize minimum) { this.minimum = minimum; }

    /** Sizes this vehicle fits in, smallest first. */
    List<SpotSize> fits() { return Arrays.stream(SpotSize.values()).filter(s -> s.compareTo(minimum) >= 0).toList(); }
}

record Vehicle(String plate, VehicleType type) {}
record Gate(String id, int level) {}
record Ticket(String id, Vehicle vehicle, Spot spot, Gate entry) {}

record Spot(int level, SpotSize size, int number) {
    @Override public String toString() { return "L" + level + "-" + size.name().charAt(0) + number; }
}

/** One lock stripe: all free-spot bookkeeping for one level. */
final class Level {
    private final int number;
    private final ReentrantLock lock = new ReentrantLock();
    private final Map<SpotSize, TreeSet<Spot>> free = new EnumMap<>(SpotSize.class);
    private final AtomicInteger freeCount = new AtomicInteger();      // read without the lock (display boards, fast path)

    Level(int number, Map<SpotSize, Integer> layout) {
        this.number = number;
        for (SpotSize size : SpotSize.values()) {
            TreeSet<Spot> spots = new TreeSet<>(Comparator.comparingInt(Spot::number));
            for (int i = 1; i <= layout.getOrDefault(size, 0); i++) spots.add(new Spot(number, size, i));
            free.put(size, spots);
            freeCount.addAndGet(spots.size());
        }
    }

    int number() { return number; }
    int freeCount() { return freeCount.get(); }

    Optional<Spot> tryAllocate(VehicleType type) {
        if (freeCount.get() == 0) return Optional.empty();            // fast path: skip a full level without locking
        lock.lock();
        try {
            for (SpotSize size : type.fits()) {
                Spot s = free.get(size).pollFirst();                    // check-then-take, atomic under the level lock
                if (s != null) {
                    freeCount.decrementAndGet();
                    return Optional.of(s);
                }
            }
            return Optional.empty();
        } finally {
            lock.unlock();
        }
    }

    void release(Spot s) {
        lock.lock();
        try {
            if (!free.get(s.size()).add(s)) throw new IllegalStateException(s + " was already free");
            freeCount.incrementAndGet();
        } finally {
            lock.unlock();
        }
    }
}

interface SpotAllocationStrategy {
    /** Levels to try, in order of preference, for a vehicle arriving at this gate. */
    List<Level> order(List<Level> levels, Gate gate);
}

final class NearestLevelFirst implements SpotAllocationStrategy {
    public List<Level> order(List<Level> levels, Gate gate) {
        return levels.stream()
                .sorted(Comparator.comparingInt((Level l) -> Math.abs(l.number() - gate.level())).thenComparingInt(Level::number))
                .toList();
    }
}

final class ParkingLot {
    private final List<Level> levels = new ArrayList<>();
    private final SpotAllocationStrategy strategy;
    private final Map<String, Ticket> active = new ConcurrentHashMap<>();
    private final Map<String, String> ticketByPlate = new ConcurrentHashMap<>();
    private final AtomicLong ids = new AtomicLong();

    ParkingLot(int levelCount, Map<SpotSize, Integer> layoutPerLevel, SpotAllocationStrategy strategy) {
        for (int i = 0; i < levelCount; i++) levels.add(new Level(i, layoutPerLevel));
        this.strategy = strategy;
    }

    Ticket park(Vehicle v, Gate gate) {
        String ticketId = "T" + ids.incrementAndGet();
        if (ticketByPlate.putIfAbsent(v.plate(), ticketId) != null) throw new ParkingException(v.plate() + " is already inside");
        for (Level level : strategy.order(levels, gate)) {            // one lock at a time: no deadlock possible
            Optional<Spot> spot = level.tryAllocate(v.type());
            if (spot.isPresent()) {
                Ticket t = new Ticket(ticketId, v, spot.get(), gate);
                active.put(ticketId, t);
                return t;
            }
        }
        ticketByPlate.remove(v.plate(), ticketId);                     // give the plate claim back
        throw new ParkingException("no spot for " + v.type() + " " + v.plate());
    }

    Spot unpark(String ticketId) {
        Ticket t = active.remove(ticketId);                            // atomic: exactly one exit gate wins
        if (t == null) throw new ParkingException("ticket " + ticketId + " is unknown or already used");
        levels.get(t.spot().level()).release(t.spot());
        ticketByPlate.remove(t.vehicle().plate(), ticketId);
        return t.spot();
    }

    Map<Integer, Integer> freeByLevel() {
        Map<Integer, Integer> counts = new TreeMap<>();
        levels.forEach(l -> counts.put(l.number(), l.freeCount()));
        return counts;
    }
}
```
````

## Design decisions

- **Lock striping by level.** Each `Level` owns a `ReentrantLock` and its free-spot sets. A request locks one level, takes a spot or moves on. Gates on different levels never wait for each other (see [Locks and atomics](lesson:locks-and-atomics)).
- **Atomic map operations instead of locks** where one key is enough: `putIfAbsent` for "is this plate already inside?", `remove` for "has this ticket been used?". The map does the check-and-update atomically (see [Race conditions](lesson:concurrent-state-transitions)).
- **Counts as hints.** `freeCount` is an `AtomicInteger` read without the lock: display boards and the "skip a full level" fast path may see a slightly stale number, which is fine. The real decision is always made under the level lock.
- **Smallest fitting spot first**, nearest level first: both are policy, isolated in `VehicleType.fits()` and the `SpotAllocationStrategy` (see [Strategy](lesson:strategy)).
- **`release` refuses a spot that's already free.** If that ever fires, there's a bug elsewhere; failing loudly beats silently creating a phantom spot.

## Patterns and principles

[Strategy](lesson:strategy) (`SpotAllocationStrategy`), **lock striping** (one lock per level), atomic [check-then-act](lesson:concurrent-state-transitions) with concurrent maps, and [Scarcity](lesson:scarcity): a fixed pool of spots shared by many competing gates (see also [Thread safety](lesson:thread-safety)).

## Example execution flow

```text
park(KA-01 car, G0)   order: L0, L1, L2 -> L0 lock -> MEDIUM pollFirst -> L0-M1
park(KA-02 car, G2)   order: L2, L1, L0 -> L2-M1
park(MH-9 bike, G0)   SMALL first -> L0-S1
park(TN-1 truck, G0)  LARGE only -> L0-L1
park(TN-2 truck, G0)  L0 has no LARGE left -> L1-L1
park(KA-01, G2)       putIfAbsent(KA-01) finds the existing claim -> rejected
unpark(T4)            active.remove(T4) -> L0-L1 back on level 0
unpark(T4) again      remove returns null -> rejected
rush hour             8 threads, 400 cars, 100 spots: each spot handed out under its level lock exactly once
two exits per ticket  active.remove decides the single winner per ticket
```

```text title="Program output"
car KA-01 at G0 -> L0-M1
car KA-02 at G2 -> L2-M1
bike MH-9 at G0 -> L0-S1
truck TN-1 at G0 -> L0-L1
truck TN-2 at G0 -> L1-L1
Rejected: KA-01 is already inside
TN-1 leaves from L0-L1
Rejected: ticket T4 is unknown or already used
free per level: {0=4, 1=5, 2=5}
rush hour: parked 100, rejected 300, distinct spots 100
exits 100, duplicate exits refused 100, free now {0=25, 1=25, 2=25, 3=25}
```

## Edge cases

- **All levels full** → each level's fast path returns immediately; the plate claim is released.
- **Same plate at two gates at once** → `putIfAbsent` lets exactly one through.
- **Same ticket at two exits at once** → `remove` lets exactly one through; the spot is released once.
- **A vehicle that fits nowhere** (truck, no large spots left) → rejected even if small spots are free.
- **Double release** (a bug) → `IllegalStateException`, never a duplicated spot.

## Tests

```java title="ConcurrentParkingTest.java" file="ConcurrentParkingTest.java" test="ConcurrentParkingDemo.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class ConcurrentParkingTest {
    private static void race(int threads, Runnable body) throws InterruptedException {
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch go = new CountDownLatch(1);
        for (int i = 0; i < threads; i++) pool.submit(() -> { go.await(); body.run(); return null; });
        go.countDown();
        pool.shutdown();
        pool.awaitTermination(30, TimeUnit.SECONDS);
    }

    @Test
    void smallestFittingSpotOnTheNearestLevel() {
        ParkingLot lot = new ParkingLot(2, Map.of(SpotSize.MEDIUM, 1, SpotSize.LARGE, 1), new NearestLevelFirst());
        assertEquals("L1-M1", lot.park(new Vehicle("a", VehicleType.CAR), new Gate("g", 1)).spot().toString());
        assertEquals("L1-L1", lot.park(new Vehicle("b", VehicleType.CAR), new Gate("g", 1)).spot().toString());
        assertEquals("L0-M1", lot.park(new Vehicle("c", VehicleType.CAR), new Gate("g", 1)).spot().toString());
        assertEquals("L0-L1", lot.park(new Vehicle("d", VehicleType.CAR), new Gate("g", 1)).spot().toString());
        assertThrows(ParkingException.class, () -> lot.park(new Vehicle("e", VehicleType.TRUCK), new Gate("g", 0)));
    }

    @Test
    void plateAndTicketAreSingleUse() {
        ParkingLot lot = new ParkingLot(1, Map.of(SpotSize.MEDIUM, 5), new NearestLevelFirst());
        Ticket t = lot.park(new Vehicle("a", VehicleType.CAR), new Gate("g", 0));
        assertThrows(ParkingException.class, () -> lot.park(new Vehicle("a", VehicleType.CAR), new Gate("g", 0)));
        lot.unpark(t.id());
        assertThrows(ParkingException.class, () -> lot.unpark(t.id()));
        lot.park(new Vehicle("a", VehicleType.CAR), new Gate("g", 0));          // may enter again after leaving
    }

    @Test
    void concurrentEntriesNeverShareASpot() throws InterruptedException {
        ParkingLot lot = new ParkingLot(5, Map.of(SpotSize.MEDIUM, 20), new NearestLevelFirst());
        List<Ticket> tickets = Collections.synchronizedList(new ArrayList<>());
        AtomicInteger seq = new AtomicInteger();
        race(16, () -> {
            for (int i = 0; i < 200; i++) {
                int n = seq.incrementAndGet();
                try { tickets.add(lot.park(new Vehicle("v" + n, VehicleType.CAR), new Gate("g", n % 5))); } catch (ParkingException ignored) { }
            }
        });
        Set<Spot> spots = new HashSet<>();
        tickets.forEach(t -> spots.add(t.spot()));
        assertEquals(100, tickets.size());
        assertEquals(100, spots.size());
        assertEquals(Map.of(0, 0, 1, 0, 2, 0, 3, 0, 4, 0), lot.freeByLevel());
    }

    @Test
    void churnLeavesNoLeakedOrDuplicatedSpots() throws InterruptedException {
        ParkingLot lot = new ParkingLot(3, Map.of(SpotSize.SMALL, 5, SpotSize.MEDIUM, 5), new NearestLevelFirst());
        AtomicInteger seq = new AtomicInteger();
        race(12, () -> {
            for (int i = 0; i < 2_000; i++) {
                VehicleType type = ThreadLocalRandom.current().nextBoolean() ? VehicleType.CAR : VehicleType.MOTORCYCLE;
                try {
                    Ticket t = lot.park(new Vehicle("v" + seq.incrementAndGet(), type), new Gate("g", i % 3));
                    lot.unpark(t.id());
                } catch (ParkingException ignored) { }
            }
        });
        assertEquals(Map.of(0, 10, 1, 10, 2, 10), lot.freeByLevel());
    }
}
```

## Concurrency

- **Why not `synchronized` on the whole lot?** Correct, but every gate in the building serialises on one monitor. With striping, contention is limited to requests that land on the same level at the same instant.
- **Why one lock at a time?** A request never holds level A's lock while waiting for level B's, so there's no cycle and no deadlock. If an operation ever needs two levels (moving a car between floors), acquire them **in level order**.
- **Hot level:** if everyone prefers the ground floor, it becomes the bottleneck. Stripe further (per level **and** size, or per section of a level), or use lock-free free lists (`ConcurrentLinkedDeque.poll()` per size) — `poll` is atomic, so each spot still goes to exactly one caller.
- **Memory visibility:** everything a gate reads about a spot is either under the level lock or in a concurrent map, so changes made by one gate are visible to the next.

## Common mistakes and alternatives

- **"Find a free spot" without the lock, then "mark it taken"** — two gates find the same spot.
- **`containsKey(ticket)` then `remove(ticket)`** — two exits both pass the check; use the return value of `remove`.
- **Holding a lock while printing a ticket or opening a barrier** — slow I/O inside the critical section.
- **A global `AtomicInteger freeSpots` as the source of truth** — it can say "1 free" when no spot of the right size exists.
- **Alternative:** a single-threaded allocator fed by a queue (an actor). Simple and contention-free, but every request waits in one line; fine for small lots.

## Follow-up questions

````reveal title="Reservations made in advance"
A reservation is a spot taken for a future window. Keep reserved spots out of the free sets during their window (a scheduler moves them back if the driver doesn't show within 15 minutes). The gate checks the reservation by plate first and goes straight to the reserved spot.
````

````reveal title="Fees and payment at exit"
Exit becomes two steps: compute the fee (pricing strategy from the [Parking Lot](problem:parking-lot) problem) and take payment, then `unpark`. Only the final `unpark` must be atomic; payment happens before it, with the ticket ID as the idempotency key so a retried payment doesn't charge twice.
````

````reveal title="Garages across a city with a central app"
Each garage keeps its own allocator (state stays local and fast). The app reads free counts that garages publish every few seconds — approximate is fine for "where should I go?" — and the real allocation still happens at the gate.
````

## Complexity

- `park`: O(L + log S) — try up to L levels, each `pollFirst` on a sorted set of S spots.
- `unpark`: O(log S).
- Free counts: O(L), no locking.

## Interviewer checklist

- [ ] Shared state identified; invariants stated (no double assignment, single exit)
- [ ] Lock striping per level; one lock at a time (no deadlock)
- [ ] Atomic map operations for plate and ticket uniqueness
- [ ] Approximate counts kept separate from the authoritative state
- [ ] Concurrency tests: no shared spots, no leaks under churn
- [ ] Hot-spot mitigation discussed
