## Problem statement

Design the matching core of a ride-hailing app. Drivers go online and report their location; a rider requests a trip from a pickup point to a drop-off point; the system picks a suitable nearby driver and creates a trip. The trip then moves through its lifecycle (assigned, in progress, completed, or cancelled), and riders and drivers are notified along the way. Thousands of riders request at the same moment at rush hour, and a driver must never be given two trips.

> [!TIP] Try it first
> Two riders standing next to each other request at the same instant; one driver is closest to both. Decide what makes "this driver is now taken" **atomic** before designing the rest.

## Clarifying questions

1. How is "nearby" measured? A search radius?
2. Which driver should win — the nearest, the best rated, something else? Will that change?
3. What states does a trip go through? Who can cancel, and until when?
4. Can a rider have two trips at once? Can a driver go offline mid-trip?
5. How is the fare computed?
6. Who needs to hear about trip events?

````reveal title="Answers we'll assume"
- Locations are points on a plane in kilometres (straight-line distance); only drivers within a **radius** (3 km) are considered. Real geo-indexing is a follow-up.
- Matching policy is **pluggable**: nearest driver by default, or best rated within the radius.
- Trip: `ASSIGNED → IN_PROGRESS → COMPLETED`; `ASSIGNED → CANCELLED` (rider or driver, before pickup). No cancellation after the trip starts.
- One active trip per rider. A driver can only go offline when not on a trip.
- Fare = base 50 + 12 per km of trip distance (surge pricing is a follow-up).
- Riders and drivers are notified of every trip status change.
````

## Requirements

**Functional**

1. Drivers go online/offline and update their location.
2. `requestRide(rider, pickup, dropoff)` matches an available driver within the radius, using the current strategy, and creates a trip with a fare.
3. Only the assigned driver can start and complete a trip; rider or driver can cancel before the start.
4. On completion the driver becomes available at the drop-off point; on cancellation, where they are.
5. Listeners are notified of every status change.

**Non-functional**

6. A driver is never assigned to two trips, even under concurrent requests.
7. A rider never has two active trips.
8. Matching strategies and fare rules are replaceable.

## Step 1 — Who talks to whom

````reveal title="A mediator between riders and drivers"
Riders and drivers never reference each other. The `RideService` sits in the middle: it receives requests, asks the matching strategy for candidates, claims a driver, creates the trip, and tells listeners. That keeps the coordination rules (one trip per driver, one per rider, who may cancel) in one place instead of spread across `Rider` and `Driver` objects.
````

````reveal title="Claiming a driver atomically"
Each driver's status is an `AtomicReference<DriverStatus>`. Matching ranks candidates, then tries `compareAndSet(AVAILABLE, ON_TRIP)` on each in order. If another request took that driver a microsecond earlier, the CAS fails and we try the next candidate. No global lock: requests in different parts of the city never wait for each other, and two requests that want the same driver are decided by one CAS.
````

## Step 2 — Trip lifecycle

```states title="Trip"
[*] --> ASSIGNED : requestRide [driver claimed]
ASSIGNED --> IN_PROGRESS : start (assigned driver)
ASSIGNED --> CANCELLED : cancel (rider or driver) / driver available
IN_PROGRESS --> COMPLETED : complete (assigned driver) / driver available at drop-off
COMPLETED --> [*]
CANCELLED --> [*]
```

## Step 3 — Class design

```uml title="Ride-sharing matching"
class RideService
  - drivers: Map<String, Driver>
  - trips: Map<String, Trip>
  - activeTripByRider: Map<String, String>
  - strategy: MatchingStrategy
  - fares: FareCalculator
  - listeners: List<TripListener>
  + requestRide(rider: String, pickup: Location, dropoff: Location): Trip
  + start(tripId: String, driverId: String): void
  + complete(tripId: String, driverId: String): void
  + cancel(tripId: String, by: String): void
class Driver
  - id: String
  - rating: double
  - location: Location
  - status: AtomicReference<DriverStatus>
  + tryClaim(): boolean
  + release(at: Location): void
class Trip
  - id: String
  - rider: String
  - driver: Driver
  - fare: long
  - status: TripStatus
interface MatchingStrategy
  + rank(available: List<Driver>, pickup: Location): List<Driver>
class NearestDriver
class BestRatedNearby
interface FareCalculator
  + fare(pickup: Location, dropoff: Location): long
interface TripListener
  + onStatusChanged(t: Trip, status: TripStatus): void
record Location
  + x: double
  + y: double
RideService o-- "0..*" Driver
RideService o-- "0..*" Trip
RideService --> MatchingStrategy
RideService --> FareCalculator
RideService o-- "0..*" TripListener
Trip --> Driver
NearestDriver ..|> MatchingStrategy
BestRatedNearby ..|> MatchingStrategy
```

## Step 4 — Implementation

````hint title="Hint — claim the rider too"
"One active trip per rider" has the same race as drivers: two taps from the same rider must not create two trips. Claim the rider with `activeTripByRider.putIfAbsent(rider, ...)` before matching, and remove the claim if no driver is found.
````

````solution title="Complete Java solution"
```java title="RideSharingDemo.java" file="RideSharingDemo.java"
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

public class RideSharingDemo {
    public static void main(String[] args) throws InterruptedException {
        RideService rides = new RideService(new NearestDriver(3.0), new StandardFare(50, 12));
        rides.addListener((trip, status) -> System.out.println("  -> " + trip.rider() + " & " + trip.driver().name() + ": " + trip.id() + " " + status));
        rides.addDriver(new Driver("d1", "Ravi", 4.9, new Location(1, 1)));
        rides.addDriver(new Driver("d2", "Meera", 4.6, new Location(0, 2)));
        rides.addDriver(new Driver("d3", "Dev", 4.8, new Location(2, 0)));
        Driver kabir = new Driver("d4", "Kabir", 5.0, new Location(0, 0));
        rides.addDriver(kabir);
        kabir.goOffline();

        Trip t1 = rides.requestRide("asha", new Location(0, 0), new Location(6, 8));
        System.out.println(t1);
        attempt(() -> rides.requestRide("asha", new Location(0, 0), new Location(1, 1)));
        Trip t2 = rides.requestRide("zoya", new Location(0, 1), new Location(0, 4));
        System.out.println(t2);
        attempt(() -> rides.start(t1.id(), "d2"));
        rides.start(t1.id(), "d1");
        attempt(() -> rides.cancel(t1.id(), "asha"));
        rides.complete(t1.id(), "d1");
        rides.cancel(t2.id(), "zoya");
        System.out.println("Ravi is now " + rides.driver("d1").status() + " at " + rides.driver("d1").location());

        rides.setStrategy(new BestRatedNearby(3.0));
        System.out.println(rides.requestRide("leo", new Location(1, 1), new Location(4, 5)));
        attempt(() -> rides.requestRide("nia", new Location(20, 20), new Location(21, 21)));

        RideService rush = new RideService(new NearestDriver(50), new StandardFare(50, 12));
        for (int i = 0; i < 10; i++) rush.addDriver(new Driver("r" + i, "Driver" + i, 4.5, new Location(i, i)));
        List<Trip> matched = Collections.synchronizedList(new ArrayList<>());
        ExecutorService pool = Executors.newFixedThreadPool(16);
        CountDownLatch go = new CountDownLatch(1);
        for (int i = 0; i < 50; i++) {
            String rider = "rider" + i;
            pool.submit(() -> {
                go.await();
                try { matched.add(rush.requestRide(rider, new Location(5, 5), new Location(6, 6))); } catch (RideException ignored) { }
                return null;
            });
        }
        go.countDown();
        pool.shutdown();
        pool.awaitTermination(10, TimeUnit.SECONDS);
        Set<String> drivers = new HashSet<>();
        matched.forEach(t -> drivers.add(t.driver().id()));
        System.out.println("rush hour: 50 requests, " + matched.size() + " trips, " + drivers.size() + " distinct drivers");
    }

    static void attempt(Runnable action) {
        try {
            action.run();
        } catch (RideException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
    }
}

class RideException extends RuntimeException {
    RideException(String message) { super(message); }
}

record Location(double x, double y) {
    double distanceTo(Location o) { return Math.hypot(x - o.x, y - o.y); }
    @Override public String toString() { return "(" + fmt(x) + ", " + fmt(y) + ")"; }
    private static String fmt(double v) { return v == Math.rint(v) ? String.valueOf((long) v) : String.valueOf(v); }
}

enum DriverStatus { OFFLINE, AVAILABLE, ON_TRIP }
enum TripStatus { ASSIGNED, IN_PROGRESS, COMPLETED, CANCELLED }

final class Driver {
    private final String id;
    private final String name;
    private final double rating;
    private volatile Location location;
    private final AtomicReference<DriverStatus> status = new AtomicReference<>(DriverStatus.AVAILABLE);

    Driver(String id, String name, double rating, Location location) {
        this.id = id; this.name = name; this.rating = rating; this.location = location;
    }

    String id() { return id; }
    String name() { return name; }
    double rating() { return rating; }
    Location location() { return location; }
    DriverStatus status() { return status.get(); }
    void updateLocation(Location l) { location = l; }

    /** The atomic claim: exactly one request can take an available driver. */
    boolean tryClaim() { return status.compareAndSet(DriverStatus.AVAILABLE, DriverStatus.ON_TRIP); }

    void release(Location at) {
        location = at;
        status.set(DriverStatus.AVAILABLE);
    }

    void goOffline() {
        if (!status.compareAndSet(DriverStatus.AVAILABLE, DriverStatus.OFFLINE)) throw new RideException(name + " is on a trip");
    }

    void goOnline() { status.compareAndSet(DriverStatus.OFFLINE, DriverStatus.AVAILABLE); }
}

final class Trip {
    private final String id;
    private final String rider;
    private final Driver driver;
    private final Location pickup;
    private final Location dropoff;
    private final long fare;
    private TripStatus status = TripStatus.ASSIGNED;

    Trip(String id, String rider, Driver driver, Location pickup, Location dropoff, long fare) {
        this.id = id; this.rider = rider; this.driver = driver; this.pickup = pickup; this.dropoff = dropoff; this.fare = fare;
    }

    String id() { return id; }
    String rider() { return rider; }
    Driver driver() { return driver; }
    Location dropoff() { return dropoff; }
    long fare() { return fare; }
    synchronized TripStatus status() { return status; }

    synchronized void moveTo(TripStatus from, TripStatus to) {
        if (status != from) throw new RideException("cannot move " + id + " to " + to + " while " + status);
        status = to;
    }

    @Override public String toString() {
        return id + ": " + rider + " with " + driver.name() + " (" + driver.rating() + "), "
                + String.format("%.2f", driver.location().distanceTo(pickup)) + " km away, fare " + fare;
    }
}

// ---------- Strategies ----------

interface MatchingStrategy {
    /** Candidates in order of preference; only drivers within reach of the pickup. */
    List<Driver> rank(List<Driver> available, Location pickup);
}

final class NearestDriver implements MatchingStrategy {
    private final double radiusKm;
    NearestDriver(double radiusKm) { this.radiusKm = radiusKm; }

    public List<Driver> rank(List<Driver> available, Location pickup) {
        return available.stream()
                .filter(d -> d.location().distanceTo(pickup) <= radiusKm)
                .sorted(Comparator.comparingDouble((Driver d) -> d.location().distanceTo(pickup)).thenComparing(Driver::id))
                .toList();
    }
}

final class BestRatedNearby implements MatchingStrategy {
    private final double radiusKm;
    BestRatedNearby(double radiusKm) { this.radiusKm = radiusKm; }

    public List<Driver> rank(List<Driver> available, Location pickup) {
        return available.stream()
                .filter(d -> d.location().distanceTo(pickup) <= radiusKm)
                .sorted(Comparator.comparingDouble(Driver::rating).reversed()
                        .thenComparingDouble(d -> d.location().distanceTo(pickup)))
                .toList();
    }
}

interface FareCalculator { long fare(Location pickup, Location dropoff); }

final class StandardFare implements FareCalculator {
    private final long base;
    private final long perKm;
    StandardFare(long base, long perKm) { this.base = base; this.perKm = perKm; }
    public long fare(Location pickup, Location dropoff) { return base + Math.round(perKm * pickup.distanceTo(dropoff)); }
}

interface TripListener { void onStatusChanged(Trip trip, TripStatus status); }

// ---------- Mediator ----------

final class RideService {
    private final Map<String, Driver> drivers = new ConcurrentHashMap<>();
    private final Map<String, Trip> trips = new ConcurrentHashMap<>();
    private final Map<String, String> activeTripByRider = new ConcurrentHashMap<>();
    private final List<TripListener> listeners = new CopyOnWriteArrayList<>();
    private final FareCalculator fares;
    private final AtomicLong ids = new AtomicLong();
    private volatile MatchingStrategy strategy;

    RideService(MatchingStrategy strategy, FareCalculator fares) {
        this.strategy = strategy;
        this.fares = fares;
    }

    void addDriver(Driver d) { drivers.put(d.id(), d); }
    Driver driver(String id) { return drivers.get(id); }
    void setStrategy(MatchingStrategy s) { strategy = s; }
    void addListener(TripListener l) { listeners.add(l); }

    Trip requestRide(String rider, Location pickup, Location dropoff) {
        String tripId = "T" + ids.incrementAndGet();
        if (activeTripByRider.putIfAbsent(rider, tripId) != null) throw new RideException(rider + " already has an active trip");
        List<Driver> available = drivers.values().stream().filter(d -> d.status() == DriverStatus.AVAILABLE).toList();
        for (Driver d : strategy.rank(available, pickup)) {
            if (d.tryClaim()) {                                    // lost the race? try the next candidate
                Trip t = new Trip(tripId, rider, d, pickup, dropoff, fares.fare(pickup, dropoff));
                trips.put(tripId, t);
                publish(t, TripStatus.ASSIGNED);
                return t;
            }
        }
        activeTripByRider.remove(rider, tripId);
        throw new RideException("no driver available near " + pickup + " for " + rider);
    }

    void start(String tripId, String driverId) {
        Trip t = tripForDriver(tripId, driverId);
        t.moveTo(TripStatus.ASSIGNED, TripStatus.IN_PROGRESS);
        publish(t, TripStatus.IN_PROGRESS);
    }

    void complete(String tripId, String driverId) {
        Trip t = tripForDriver(tripId, driverId);
        t.moveTo(TripStatus.IN_PROGRESS, TripStatus.COMPLETED);
        finish(t, t.dropoff());
        publish(t, TripStatus.COMPLETED);
    }

    /** Rider or assigned driver, before pickup only. */
    void cancel(String tripId, String by) {
        Trip t = trip(tripId);
        if (!by.equals(t.rider()) && !by.equals(t.driver().id())) throw new RideException(by + " cannot cancel " + tripId);
        t.moveTo(TripStatus.ASSIGNED, TripStatus.CANCELLED);
        finish(t, t.driver().location());
        publish(t, TripStatus.CANCELLED);
    }

    private void finish(Trip t, Location driverEndsAt) {
        t.driver().release(driverEndsAt);
        activeTripByRider.remove(t.rider(), t.id());
    }

    private Trip tripForDriver(String tripId, String driverId) {
        Trip t = trip(tripId);
        if (!t.driver().id().equals(driverId)) throw new RideException(driverId + " is not the driver of " + tripId);
        return t;
    }

    private Trip trip(String id) {
        Trip t = trips.get(id);
        if (t == null) throw new RideException("no trip " + id);
        return t;
    }

    private void publish(Trip t, TripStatus status) { listeners.forEach(l -> l.onStatusChanged(t, status)); }
}
```
````

## Design decisions

- **Mediator.** `RideService` is the only place that knows about both riders and drivers; it enforces "one trip per driver" and "one per rider", and drivers and riders stay simple (see [Mediator](lesson:mediator)).
- **Matching is a strategy.** `NearestDriver` and `BestRatedNearby` rank candidates; the service just tries them in order. Strategies can be swapped at runtime (`setStrategy`) — for an A/B test, or a premium tier (see [Strategy](lesson:strategy)).
- **CAS claims instead of locks.** A driver's status changes with `compareAndSet`; losing the race is a normal outcome, handled by moving to the next candidate (see [Race conditions](lesson:concurrent-state-transitions)).
- **Ranking can be stale; claiming can't.** The strategy works on a snapshot of available drivers, which may be slightly out of date — that's fine, because the claim re-checks atomically.
- **Trip state machine** with guarded transitions (`moveTo(from, to)`); cancelling after the start fails because the trip is no longer `ASSIGNED` (see [State machines](lesson:state-machines)).
- **Observers for notifications.** Push messages, ETA updates and analytics subscribe to trip events (see [Observer](lesson:observer)).

## Patterns and principles

[Strategy](lesson:strategy) (matching, fares), [State](lesson:state-machines) (trip lifecycle), [Observer](lesson:observer) (`TripListener`), [Mediator](lesson:mediator) (`RideService`), and lock-free [concurrent state transitions](lesson:concurrent-state-transitions).

## Example execution flow

```text
asha (0,0)->(6,8)    available within 3 km: Ravi 1.41, Meera 2.00, Dev 2.00 (Kabir offline)
                     nearest: Ravi -> CAS AVAILABLE->ON_TRIP -> T1, fare 50 + 12 x 10 = 170
asha again           rider already has an active trip -> rejected
zoya (0,1)->(0,4)    Meera 1.00, Dev 2.24 -> Meera -> T3 (T2 went to asha's rejected request), fare 86
start T1 by d2       not T1's driver -> rejected; start by d1 -> IN_PROGRESS
cancel T1 by asha    not ASSIGNED any more -> rejected
complete T1          Ravi AVAILABLE at (6, 8); cancel T3 -> Meera AVAILABLE
best-rated, leo (1,1)  within 3 km: Dev 4.8, Meera 4.6 -> Dev
50 riders at once, 10 drivers -> 10 trips, every driver claimed exactly once
```

```text title="Program output"
  -> asha & Ravi: T1 ASSIGNED
T1: asha with Ravi (4.9), 1.41 km away, fare 170
Rejected: asha already has an active trip
  -> zoya & Meera: T3 ASSIGNED
T3: zoya with Meera (4.6), 1.00 km away, fare 86
Rejected: d2 is not the driver of T1
  -> asha & Ravi: T1 IN_PROGRESS
Rejected: cannot move T1 to CANCELLED while IN_PROGRESS
  -> asha & Ravi: T1 COMPLETED
  -> zoya & Meera: T3 CANCELLED
Ravi is now AVAILABLE at (6, 8)
  -> leo & Dev: T4 ASSIGNED
T4: leo with Dev (4.8), 1.41 km away, fare 110
Rejected: no driver available near (20, 20) for nia
rush hour: 50 requests, 10 trips, 10 distinct drivers
```

## Edge cases

- **Two requests for the same nearest driver** → one CAS wins; the other takes the next candidate.
- **Rider taps twice** → `putIfAbsent` on the rider rejects the second request.
- **No driver within the radius** → rejected; the rider's claim is released so they can retry.
- **Wrong driver starts or completes** → rejected.
- **Cancel after pickup** → rejected by the state machine.
- **Driver going offline during a trip** → rejected (`goOffline` only from `AVAILABLE`).
- **A failed request consumes a trip ID** (T2 above) — IDs are unique, not gapless.

## Tests

```java title="RideSharingTest.java" file="RideSharingTest.java" test="RideSharingDemo.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class RideSharingTest {
    private RideService rides;
    private Driver near;
    private Driver far;

    @BeforeEach
    void setUp() {
        rides = new RideService(new NearestDriver(5), new StandardFare(50, 10));
        near = new Driver("near", "Near", 4.0, new Location(1, 0));
        far = new Driver("far", "Far", 5.0, new Location(4, 0));
        rides.addDriver(near);
        rides.addDriver(far);
    }

    @Test
    void nearestAvailableDriverWinsAndOfflineDriversAreIgnored() {
        near.goOffline();
        assertEquals("far", rides.requestRide("r", new Location(0, 0), new Location(3, 4)).driver().id());
    }

    @Test
    void bestRatedStrategyPrefersRatingWithinTheRadius() {
        rides.setStrategy(new BestRatedNearby(5));
        Trip t = rides.requestRide("r", new Location(0, 0), new Location(3, 4));
        assertEquals("far", t.driver().id());
        assertEquals(100, t.fare());
    }

    @Test
    void lifecycleFreesTheDriverAtTheDropoff() {
        Trip t = rides.requestRide("r", new Location(0, 0), new Location(3, 4));
        assertThrows(RideException.class, () -> rides.complete(t.id(), "near"));   // not started
        rides.start(t.id(), "near");
        assertThrows(RideException.class, () -> near.goOffline());
        rides.complete(t.id(), "near");
        assertEquals(DriverStatus.AVAILABLE, near.status());
        assertEquals(new Location(3, 4), near.location());
        rides.requestRide("r", new Location(3, 4), new Location(0, 0));            // rider may ride again
    }

    @Test
    void onlyRiderOrDriverMayCancelAndOnlyBeforePickup() {
        Trip t = rides.requestRide("r", new Location(0, 0), new Location(1, 1));
        assertThrows(RideException.class, () -> rides.cancel(t.id(), "stranger"));
        rides.cancel(t.id(), "near");
        assertEquals(TripStatus.CANCELLED, t.status());
        assertEquals(DriverStatus.AVAILABLE, near.status());
    }

    @Test
    void oneActiveTripPerRider() {
        rides.requestRide("r", new Location(0, 0), new Location(1, 1));
        assertThrows(RideException.class, () -> rides.requestRide("r", new Location(0, 0), new Location(1, 1)));
    }

    @Test
    void concurrentRequestsNeverShareADriver() throws InterruptedException {
        RideService city = new RideService(new NearestDriver(100), new StandardFare(50, 10));
        for (int i = 0; i < 20; i++) city.addDriver(new Driver("d" + i, "D" + i, 4.5, new Location(i, 0)));
        List<Trip> trips = Collections.synchronizedList(new ArrayList<>());
        ExecutorService pool = Executors.newFixedThreadPool(32);
        CountDownLatch go = new CountDownLatch(1);
        for (int i = 0; i < 200; i++) {
            String rider = "r" + (i % 120);                       // some riders request twice
            pool.submit(() -> {
                go.await();
                try { trips.add(city.requestRide(rider, new Location(0, 0), new Location(1, 0))); } catch (RideException ignored) { }
                return null;
            });
        }
        go.countDown();
        pool.shutdown();
        pool.awaitTermination(10, TimeUnit.SECONDS);
        Set<String> drivers = new HashSet<>();
        Set<String> riders = new HashSet<>();
        trips.forEach(t -> { drivers.add(t.driver().id()); riders.add(t.rider()); });
        assertEquals(20, trips.size());
        assertEquals(20, drivers.size());
        assertEquals(20, riders.size());
    }
}
```

## Concurrency

- **Driver claim:** `compareAndSet(AVAILABLE, ON_TRIP)` — one winner per driver, no lock held while ranking.
- **Rider claim:** `putIfAbsent` on `activeTripByRider` — one active trip per rider.
- **Trip transitions:** `synchronized` per trip; "rider cancels" racing "driver starts" is decided by whichever takes the trip's lock first.
- **Thundering herd on the best driver:** at rush hour many requests rank the same driver first; all but one lose the CAS and fall through. To reduce wasted work, rank from a geo index cell and add a little randomness among near-equal candidates, or batch-match requests every second (global assignment).

## Common mistakes and alternatives

- **"Find nearest available driver" then "assign" as two steps without an atomic claim** — two riders get the same driver.
- **A global lock around matching** — correct but serialises the whole city.
- **Drivers holding references to riders (and vice versa)** — coordination rules end up duplicated in both.
- **Scanning every driver in the country** for each request — see the geo-index follow-up.
- **Alternative:** batch matching — collect requests for a short window and solve the assignment for all of them at once (minimising total pickup distance). Better global outcomes, slightly higher latency.

## Follow-up questions

````reveal title="Find nearby drivers without scanning everyone"
Index driver locations in a grid of cells (or geohashes / H3 cells). A driver's location update moves them between cells; a request looks at the pickup's cell and its neighbours, widening rings until enough candidates are found. Matching cost then depends on local density, not on the total number of drivers.
````

````reveal title="Surge pricing"
A `SurgeFare` decorator multiplies the base fare by a factor computed per cell from recent demand (requests) over supply (available drivers), capped and smoothed over a few minutes. Quote the fare at request time and store it on the trip so it can't change mid-ride.
````

````reveal title="Driver accepts or declines"
Add an `OFFERED` state: the claim reserves the driver, the offer expires after 15 seconds, and a decline or timeout releases the driver and offers the next candidate. That's the same CAS + expiry pattern as [Flash Sale holds](problem:flash-sale-inventory).
````

## Complexity

- `requestRide`: O(D log D) to rank D available drivers (O(local) with a geo index) + O(1) per CAS attempt.
- Lifecycle operations: O(1).

## Interviewer checklist

- [ ] Matching as a pluggable strategy; radius filter
- [ ] Atomic driver claim; fall through to the next candidate on a lost race
- [ ] One active trip per rider
- [ ] Trip state machine with role checks
- [ ] Mediator between riders and drivers; observers for notifications
- [ ] Geo indexing and surge pricing discussed
