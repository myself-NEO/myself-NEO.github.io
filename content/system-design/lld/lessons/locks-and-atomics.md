## The toolbox

Once you've decided state must be shared and mutable (see [Thread Safety](lesson:thread-safety)), Java offers several tools. Picking the right one — and the right **granularity** — is what interviewers listen for.

| Tool | Use for | Notes |
|---|---|---|
| `synchronized` | Simple mutual exclusion around an invariant | Re-entrant, automatic release, easiest to get right |
| `ReentrantLock` | `tryLock` with timeout, interruptible waits, fairness, several `Condition`s | Must `unlock()` in `finally` |
| `ReentrantReadWriteLock` | Read-heavy data with occasional writes | Readers share; writers are exclusive |
| `AtomicInteger` / `AtomicLong` / `AtomicReference` | Single-variable updates, compare-and-set (CAS) | Lock-free; retries on contention |
| `LongAdder` | Hot counters updated by many threads | Faster than `AtomicLong` under contention; reads are slower |
| `ConcurrentHashMap` | Shared maps; atomic per-key updates with `compute`/`merge` | Never use `HashMap` across threads |
| `BlockingQueue` | Producer–consumer handoff | `ArrayBlockingQueue` (bounded), `LinkedBlockingQueue`. See [Coordination](lesson:coordination) |
| `CopyOnWriteArrayList` | Listener lists: many reads, rare writes | Every write copies the array |
| `Semaphore` | Limit concurrent access to N permits | Connection limits, bulkheads. See [Scarcity](lesson:scarcity) |
| `CountDownLatch` / `CyclicBarrier` | Wait for N events, or synchronise phases | Common in tests. See [Coordination](lesson:coordination) |

## `synchronized` — the default

```java
class Account {
    private long balance;                       // guarded by this
    synchronized void withdraw(long amt) {
        if (amt > balance) throw new IllegalStateException("insufficient");
        balance -= amt;
    }
    synchronized long balance() { return balance; }
}
```

Use a **private lock object** (`private final Object lock = new Object();`) when you don't want outside code that synchronises on your instance to interfere with you.

## `ReentrantLock` — when you need more control

```java
private final ReentrantLock lock = new ReentrantLock();

boolean tryTransfer(Duration timeout) throws InterruptedException {
    if (!lock.tryLock(timeout.toMillis(), TimeUnit.MILLISECONDS)) return false;   // don't wait forever
    try {
        // critical section
        return true;
    } finally {
        lock.unlock();                                                          // ALWAYS in finally
    }
}
```

## Compare-and-set: lock-free updates

**CAS** atomically sets a value *only if* it still equals what you expected; otherwise you retry. It's the foundation of atomics and of **optimistic concurrency**.

```java title="CAS loops, LongAdder and ConcurrentHashMap.compute" file="AtomicsDemo.java"
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.LongAdder;

public class AtomicsDemo {
    public static void main(String[] args) throws InterruptedException {
        BoundedStock stock = new BoundedStock(500);
        LongAdder requests = new LongAdder();
        Map<String, Integer> perUser = new ConcurrentHashMap<>();
        AtomicInteger sold = new AtomicInteger();

        ExecutorService pool = Executors.newFixedThreadPool(12);
        for (int i = 0; i < 2_000; i++) {
            String user = "user" + (i % 50);
            pool.submit(() -> {
                requests.increment();                                   // hot counter
                if (stock.tryTake(1)) {
                    sold.incrementAndGet();
                    perUser.merge(user, 1, Integer::sum);               // atomic per-key update
                }
            });
        }
        pool.shutdown();
        pool.awaitTermination(30, TimeUnit.SECONDS);

        int perUserTotal = perUser.values().stream().mapToInt(Integer::intValue).sum();
        System.out.println("requests=" + requests.sum() + " sold=" + sold.get()
                + " remaining=" + stock.remaining() + " perUserTotal=" + perUserTotal);
    }
}

/** Never oversells: a CAS loop on a single atomic counter. */
final class BoundedStock {
    private final AtomicInteger remaining;

    BoundedStock(int initial) { this.remaining = new AtomicInteger(initial); }

    boolean tryTake(int qty) {
        while (true) {
            int current = remaining.get();
            if (current < qty) return false;                              // not enough: give up
            if (remaining.compareAndSet(current, current - qty)) return true;   // won the race
            // lost the race: another thread changed it; re-read and retry
        }
    }

    int remaining() { return remaining.get(); }
}
```

It always prints `sold=500 remaining=0 perUserTotal=500`, no matter how the threads interleave.

> [!TIP] `ConcurrentHashMap.compute` is a per-key lock
> `map.compute(key, (k, v) -> ...)` runs the function atomically for that key. It's a neat way to do check-then-act on one entry without a separate lock. Keep the function **short and side-effect-free**; it runs while holding an internal lock, so never call other map operations or slow I/O inside it.

## Choosing granularity

| Granularity | Example | Trade-off |
|---|---|---|
| **Global lock** | `synchronized` on the whole `BookingService` | Simple and correct, but serialises everything |
| **Per-aggregate lock** | One lock per `Show`, `Room` or `Level` | Unrelated work proceeds in parallel; the common LLD sweet spot |
| **Lock striping** | N locks, chosen by `hash(key) % N` | Bounded memory for many keys; some false sharing |
| **Lock-free / CAS** | `AtomicInteger` stock counter | Highest throughput for single-variable invariants; complex for multi-field ones |

Rule of thumb: **lock at the scope of the invariant.** "No two bookings overlap *in a room*" → lock per room.

## Deadlocks and how to avoid them

A deadlock happens when threads wait for each other's locks in a cycle: T1 holds A and wants B; T2 holds B and wants A.

Avoidance techniques:

1. **Lock ordering** — always acquire multiple locks in a global order (for example, by account ID).
2. **`tryLock` with a timeout**, then back off and retry.
3. **Don't call unknown code** (listeners, callbacks) while holding a lock.
4. **Hold locks briefly**; never across network or disk I/O.

```java
void transfer(Account a, Account b, long amt) {
    Account first = a.id().compareTo(b.id()) < 0 ? a : b;      // consistent global order
    Account second = first == a ? b : a;
    synchronized (first) {
        synchronized (second) {
            a.debit(amt);
            b.credit(amt);
        }
    }
}
```

## Real-world example

A rate-limiting gateway used one `synchronized` method for all clients, and throughput plateaued at ~8k requests/second regardless of cores. Switching to a `ConcurrentHashMap<clientId, TokenBucket>`, with each bucket synchronising on itself (per-key locking), raised throughput to ~90k/s, because unrelated clients no longer contended. See [Rate Limiter](problem:rate-limiter).

## Common mistakes

- `lock()` without `unlock()` in `finally`.
- A `ReadWriteLock` for write-heavy data (slower than a plain lock).
- Long work inside `ConcurrentHashMap.compute`.
- CAS loops that do expensive or side-effecting work before the CAS (it may run many times).
- Inconsistent lock ordering, leading to deadlock.
- A `synchronized` block on a **new object each time** (`synchronized (new Object())`), which provides no exclusion.

## In the interview

> [!INTERVIEW] Match the tool to the invariant
> *"Stock is a single counter, so a CAS loop on an `AtomicInteger` prevents overselling without locks. Per-user purchase limits use `ConcurrentHashMap.merge`. The order itself — reserve stock and create the order together — is guarded by a lock on the product, because it touches two pieces of state."*

## Key takeaways

- Default to **`synchronized`** at the scope of the invariant; use `ReentrantLock` when you need `tryLock`, timeouts or conditions.
- **Atomics/CAS** for single-variable invariants; **`LongAdder`** for hot counters.
- **`ConcurrentHashMap`** atomic methods (`putIfAbsent`, `compute`, `merge`) for per-key check-then-act.
- Choose **granularity** deliberately; avoid deadlocks with **lock ordering** and short critical sections.

## Knowledge check

```quiz
? Thousands of threads increment a request counter that is read once a minute. What's the best choice?
+ LongAdder
- A synchronized int
- A volatile long
> LongAdder minimises contention for write-heavy counters.

? Why must `unlock()` be in a finally block?
+ So the lock is released even if the critical section throws; otherwise other threads block forever
- finally blocks run faster
- Java's compiler requires it
> An exception without finally leaks the lock.

? Two threads transfer money between accounts A and B in opposite directions, each locking source then destination. What can happen?
- Nothing — synchronized prevents all issues
+ Deadlock; fix it by acquiring locks in a consistent global order
- Lost updates
> Inconsistent lock ordering creates a cycle of waits.
```

## Exercise

Implement a thread-safe **bounded connection pool** with `acquire(timeout)` returning `Optional<Connection>` and `release(connection)`. At most N connections can be in use at once; `acquire` waits up to the timeout. Releasing a connection that wasn't acquired must throw.

````hint title="Hint"
A `Semaphore` with N permits plus a `BlockingQueue` (or `ConcurrentLinkedQueue`) of idle connections works well. Track in-use connections in a concurrent set to validate releases.
````

````solution title="Reference solution"
```java file="ConnectionPoolDemo.java"
import java.time.Duration;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

public class ConnectionPoolDemo {
    public static void main(String[] args) throws InterruptedException {
        ConnectionPool pool = new ConnectionPool(2);
        Connection a = pool.acquire(Duration.ofMillis(100)).orElseThrow();
        Connection b = pool.acquire(Duration.ofMillis(100)).orElseThrow();
        System.out.println("Third acquire: " + pool.acquire(Duration.ofMillis(100)));   // Optional.empty after timeout
        pool.release(a);
        System.out.println("After release: " + pool.acquire(Duration.ofMillis(100)).map(c -> "connection " + c.id()).orElse("none"));
        try {
            pool.release(new Connection(99));
        } catch (IllegalArgumentException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
        pool.release(b);
    }
}

record Connection(int id) {}

final class ConnectionPool {
    private final Semaphore permits;
    private final ConcurrentLinkedQueue<Connection> idle = new ConcurrentLinkedQueue<>();
    private final Set<Connection> inUse = ConcurrentHashMap.newKeySet();

    ConnectionPool(int size) {
        permits = new Semaphore(size, true);
        for (int i = 1; i <= size; i++) idle.add(new Connection(i));
    }

    Optional<Connection> acquire(Duration timeout) throws InterruptedException {
        if (!permits.tryAcquire(timeout.toMillis(), TimeUnit.MILLISECONDS)) return Optional.empty();
        Connection c = idle.poll();          // a permit guarantees an idle connection exists
        inUse.add(c);
        return Optional.of(c);
    }

    void release(Connection c) {
        if (!inUse.remove(c)) throw new IllegalArgumentException("connection " + c.id() + " was not acquired from this pool");
        idle.add(c);
        permits.release();
    }
}
```
````
