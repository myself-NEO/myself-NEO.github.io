## Why concurrency shows up in LLD

Many LLD problems have a hidden concurrency requirement: several parking gates, many users booking the last seat, a rate limiter shared by request threads, a cache read by thousands of threads. Interviewers at SDE-2 level and above often ask *"what happens if two requests do this at the same time?"* You need a clear mental model and a few reliable tools.

> [!NOTE] Where this fits
> This lesson and the next three cover **correctness**: keeping shared state consistent. Threads that must *wait for each other* are covered in [Coordination](lesson:coordination), and limited resources in [Scarcity](lesson:scarcity). The [overview](lesson:concurrency-overview) explains how to tell them apart.

## What "thread-safe" means

A class is **thread-safe** if it behaves correctly — keeps its invariants and gives sensible results — when used by multiple threads at once, **without callers needing extra synchronisation**.

Three things go wrong with shared mutable state:

1. **Atomicity** — an operation that looks like one step is really several. `count++` is *read, add, write*; two threads can interleave and lose an update.
2. **Visibility** — one thread's write may not be seen by another thread (CPU caches, compiler reordering) unless there's a *happens-before* relationship, for example through `synchronized`, `volatile` or concurrent collections.
3. **Ordering** — without synchronisation, the JVM and CPU may reorder instructions. Another thread can observe a half-constructed object or flags set out of order.

## The two classic races

### Read-modify-write

```java
// Thread A and B both run: count = count + 1
// A reads 5        B reads 5
// A writes 6       B writes 6     -> one increment lost
```

### Check-then-act

```java
if (!seat.isBooked()) {       // A checks: free     B checks: free
    seat.book(user);          // A books            B books  -> double booking
}
```

Check-then-act is **the** race in LLD problems: double booking, double allocation of a spot, overselling stock, two drivers assigned to one ride. The check and the act must happen **atomically**.

## Seeing a race

```java title="Lost updates — and three fixes" file="RaceDemo.java"
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public class RaceDemo {
    static final int THREADS = 8, INCREMENTS = 100_000;

    public static void main(String[] args) throws InterruptedException {
        UnsafeCounter unsafe = new UnsafeCounter();
        SyncCounter sync = new SyncCounter();
        AtomicInteger atomic = new AtomicInteger();

        run(unsafe::increment);
        run(sync::increment);
        run(atomic::incrementAndGet);

        int expected = THREADS * INCREMENTS;
        System.out.println("expected  " + expected);
        System.out.println("unsafe    " + unsafe.get() + "   (usually less: lost updates; varies per run)");
        System.out.println("sync      " + sync.get());
        System.out.println("atomic    " + atomic.get());
    }

    static void run(Runnable increment) throws InterruptedException {
        ExecutorService pool = Executors.newFixedThreadPool(THREADS);
        for (int t = 0; t < THREADS; t++) {
            pool.submit(() -> { for (int i = 0; i < INCREMENTS; i++) increment.run(); });
        }
        pool.shutdown();
        if (!pool.awaitTermination(30, TimeUnit.SECONDS)) throw new IllegalStateException("timed out");
    }
}

class UnsafeCounter {
    private int count;
    void increment() { count++; }          // read-modify-write: not atomic
    int get() { return count; }
}

class SyncCounter {
    private int count;
    synchronized void increment() { count++; }   // mutual exclusion + visibility
    synchronized int get() { return count; }
}
```

## Three strategies for safe shared state

Before reaching for locks, ask whether the state needs to be **shared and mutable** at all.

### 1. Don't share: confinement

State owned by **one thread** needs no synchronisation. Examples: local variables, request-scoped objects, a single-threaded event loop or actor that owns the state and receives commands through a queue. A common LLD trick: all mutations for one aggregate go through a single-threaded executor.

### 2. Don't mutate: immutability

[Immutable objects](lesson:immutability) can be shared freely. Replace an immutable snapshot atomically when it changes (`AtomicReference<Config>`, or a `volatile` field holding an immutable map).

### 3. Synchronise access

If state must be shared *and* mutated, guard **every** access — reads included — with the **same** lock, or use thread-safe building blocks:

- `synchronized` methods or blocks, or `ReentrantLock`
- atomics (`AtomicInteger`, `AtomicReference`, `LongAdder`)
- concurrent collections (`ConcurrentHashMap`, `CopyOnWriteArrayList`, `BlockingQueue`)

[Locks, Atomics & Concurrent Collections](lesson:locks-and-atomics) covers when to use each.

## Guarding invariants, not fields

The unit of synchronisation is the **invariant**, not the field. If two fields must change together (`balance` and `transactionHistory`, or `bookedSeats` and `availableCount`), they must be updated under **one** lock. Two separately synchronised fields still allow other threads to observe an inconsistent combination.

```java
// BAD: Each method is "thread-safe", but the pair isn't consistent between calls
inventory.decrementAvailable();   // synchronized on its own
inventory.addReservation(r);      // synchronized on its own

// GOOD: One atomic operation that preserves the invariant
inventory.reserve(r);             // synchronized: check available, decrement, record
```

## Concurrent collections aren't magic

`ConcurrentHashMap` makes each **individual** operation thread-safe. A **sequence** of operations is not atomic:

```java
// BAD: check-then-act across two calls
if (!map.containsKey(key)) map.put(key, value);
// GOOD: atomic single call
map.putIfAbsent(key, value);
map.computeIfAbsent(key, k -> create(k));
map.merge(key, 1, Integer::sum);
```

## `volatile` in one paragraph

`volatile` guarantees **visibility** and **ordering** for a single variable (reads see the latest write), but **not atomicity** of compound actions. It's right for flags (`volatile boolean running`) and for publishing immutable snapshots, and wrong for counters (`volatile int count; count++` is still a race).

## Real-world example

A ticketing platform's `ShowSeat.isAvailable()` and `ShowSeat.book()` were each `synchronized`, but the booking service called them separately. Under load at the start of popular sales, about 0.3% of seats were double-booked. The fix was a single `tryBook(user)` that checks and books under one lock, returning whether it succeeded. That's a check-then-act turned into one atomic step. See [Movie Ticket Booking](problem:movie-ticket-booking).

## Common mistakes

- Synchronising **writes but not reads** (stale reads; no visibility guarantee).
- Using **different locks** for the same invariant.
- **Check-then-act across separate calls**, even on thread-safe objects.
- `volatile` for counters.
- **Synchronising everything** with one global lock, which kills throughput, or holding locks during slow I/O.
- Publishing `this` from a constructor (starting a thread or registering a listener before construction finishes).

## In the interview

> [!INTERVIEW] Name the race, then the fix
> *"The race is check-then-act: two gates both see spot 7 free. I'll make `claimSpot()` atomic per level — check and mark occupied under the level's lock — so gates on different levels don't contend. The ticket map is a `ConcurrentHashMap` using `putIfAbsent`."* Precise and scoped beats "I'll add synchronized everywhere".

## Key takeaways

- Thread safety = correct behaviour under concurrent use without extra caller synchronisation.
- Problems: **atomicity, visibility, ordering**. Races: **read-modify-write** and **check-then-act**.
- Prefer **confinement** and **immutability**; otherwise **synchronise every access** to shared mutable state.
- Synchronise around **invariants**; a sequence of thread-safe calls isn't atomic.

## Knowledge check

```quiz
? Why is `count++` on a shared int not thread-safe?
+ It's a read-modify-write sequence; two threads can read the same value and one update is lost
- int can't be shared between threads
- It throws ConcurrentModificationException
> Compound actions need atomicity.

? Two synchronized methods, isFree() and occupy(), are called one after the other by a service. Is the booking safe?
- Yes — both methods are synchronized
+ No — the check and the act are separate critical sections, so another thread can act in between
- Only if the JVM has one CPU
> Make check-and-act a single atomic operation.

? Which is a correct use of volatile?
+ A boolean `running` flag read by a worker loop and set by another thread
- A counter incremented by many threads
- Making a HashMap thread-safe
> volatile gives visibility for single reads and writes, not atomic compound updates.
```

## Exercise

This class is used by many threads. Identify every concurrency bug and rewrite it to be thread-safe while preserving the invariant `available + reserved.size() == capacity`.

```java
class TicketPool {
    private int available;
    private final List<String> reserved = new ArrayList<>();
    private final int capacity;
    TicketPool(int capacity) { this.capacity = capacity; this.available = capacity; }
    boolean hasTickets() { return available > 0; }
    void reserve(String user) { if (hasTickets()) { available--; reserved.add(user); } }
    void cancel(String user) { if (reserved.remove(user)) available++; }
    int available() { return available; }
}
```

````hint title="Hint"
Bugs: unsynchronised read-modify-write on `available`; check-then-act in `reserve`; `ArrayList` mutated concurrently; unsynchronised reads (visibility); and the invariant spans two fields.
````

````solution title="Reference solution"
```java file="TicketPoolDemo.java"
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public class TicketPoolDemo {
    public static void main(String[] args) throws InterruptedException {
        TicketPool pool = new TicketPool(100);
        AtomicInteger successes = new AtomicInteger();
        ExecutorService exec = Executors.newFixedThreadPool(16);
        CountDownLatch start = new CountDownLatch(1);
        for (int i = 0; i < 1_000; i++) {
            String user = "u" + i;
            exec.submit(() -> {
                start.await();
                if (pool.tryReserve(user)) successes.incrementAndGet();
                return null;
            });
        }
        start.countDown();                 // release all threads at once
        exec.shutdown();
        exec.awaitTermination(30, TimeUnit.SECONDS);
        System.out.println("successful reservations: " + successes.get() + ", available: " + pool.available()
                + ", invariant holds: " + pool.invariantHolds());
    }
}

final class TicketPool {
    private final int capacity;
    private int available;                          // guarded by this
    private final List<String> reserved = new ArrayList<>();   // guarded by this

    TicketPool(int capacity) { this.capacity = capacity; this.available = capacity; }

    /** Check-then-act made atomic; returns whether the reservation succeeded. */
    synchronized boolean tryReserve(String user) {
        if (available == 0) return false;
        available--;
        reserved.add(user);
        return true;
    }

    synchronized boolean cancel(String user) {
        if (!reserved.remove(user)) return false;
        available++;
        return true;
    }

    synchronized int available() { return available; }

    synchronized boolean invariantHolds() { return available + reserved.size() == capacity; }
}
```

Exactly 100 reservations succeed every run, and the invariant always holds. Note the API change: `hasTickets()` + `reserve()` became `tryReserve()` returning a boolean. **APIs designed for concurrency avoid exposing check-then-act to callers.**
````
