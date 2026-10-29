## The problem: more demand than supply

Your service has **10 database connections** and receives **100 concurrent requests**. Only 10 can talk to the database at once. The other 90 must do *something*. That's a **scarcity** problem, and the same shape appears everywhere:

| Scarce resource | Typical limit |
|---|---|
| Database / HTTP connections | Pool size (10–200) |
| Worker threads | Thread pool size |
| Parking spots, meeting rooms, seats, drivers | Physical capacity |
| Stock in a flash sale | Units available |
| A partner API | Concurrent calls or requests per second |
| Memory for queued work | Queue capacity |

Every scarcity design must answer four questions:

1. **Admission:** how do we stop more than N users holding the resource at once?
2. **When none is free:** wait, wait up to a timeout, or reject immediately?
3. **Return:** how do we guarantee the resource always comes back, even on exceptions?
4. **Isolation:** can one slow or greedy consumer starve everyone else?

## Three answers to "none left"

| Policy | Java | Good for | Risk |
|---|---|---|---|
| **Block** (wait until free) | `semaphore.acquire()`, `queue.put()` | Background jobs that must eventually run | Unbounded waits; threads pile up behind a stuck resource |
| **Bounded wait** | `tryAcquire(timeout)`, `offer(e, timeout)` | User-facing requests — fail with "busy, try again" | Choosing the timeout; callers must handle failure |
| **Reject immediately** (load shedding) | `tryAcquire()`, `offer(e)`, `AbortPolicy` | Protecting the system under overload; optional work | Some requests fail even though capacity frees up soon |

> [!TIP] Never wait forever on a request path
> A request thread blocked indefinitely on a pool is a request that will eventually time out at the client anyway — while holding its own thread, memory and possibly locks. Bounded waits turn "everything is slow" into "some requests fail fast", which is usually what keeps a system alive.

## Semaphores: counting permits

A `Semaphore(n)` holds **n permits**. `acquire()` takes one (blocking while none are free); `release()` returns one. It doesn't care *what* the resource is, so it's the simplest way to cap concurrency around any code.

```java title="10 connections, 100 requests — and executors with bounded queues" file="ScarcityDemo.java"
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.Semaphore;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public class ScarcityDemo {
    public static void main(String[] args) throws Exception {
        // 1. Semaphore: 100 requests, only 10 may use the database at once.
        LimitedDatabase db = new LimitedDatabase(10);
        ExecutorService requests = Executors.newFixedThreadPool(32);
        List<java.util.concurrent.Future<String>> results = new ArrayList<>();
        for (int i = 0; i < 100; i++) {
            int id = i;
            results.add(requests.submit(() -> db.query("SELECT " + id)));
        }
        for (var f : results) f.get();
        requests.shutdown();
        System.out.println("100 queries served; peak concurrent queries <= 10: " + (db.peakConcurrency() <= 10));

        // 2. Bounded wait: when every permit is held, give up after 50ms instead of hanging.
        LimitedDatabase tiny = new LimitedDatabase(2);
        CountDownLatch hold = new CountDownLatch(1), holding = new CountDownLatch(2);
        for (int i = 0; i < 2; i++) {
            new Thread(() -> tiny.holdUntil(hold, holding)).start();
        }
        holding.await();                                                  // both permits are now taken
        System.out.println("third request rejected after timeout: " + tiny.tryQuery("SELECT 1", 50).isEmpty());
        hold.countDown();

        // 3. Thread pools are scarce too: 2 workers + queue of 3, AbortPolicy.
        CountDownLatch gate = new CountDownLatch(1);
        ThreadPoolExecutor pool = new ThreadPoolExecutor(2, 2, 0, TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(3), new ThreadPoolExecutor.AbortPolicy());
        AtomicInteger completed = new AtomicInteger();
        int rejected = 0;
        for (int i = 0; i < 10; i++) {
            try {
                pool.execute(() -> { await(gate); completed.incrementAndGet(); });
            } catch (RejectedExecutionException e) {
                rejected++;
            }
        }
        System.out.println("accepted " + (10 - rejected) + " (2 running + " + pool.getQueue().size() + " queued), rejected " + rejected);
        gate.countDown();
        pool.shutdown();
        pool.awaitTermination(5, TimeUnit.SECONDS);
        System.out.println("completed " + completed.get());

        // 4. CallerRunsPolicy: overflow work runs on the submitting thread, which naturally slows the producer.
        CountDownLatch gate2 = new CountDownLatch(1);
        ThreadPoolExecutor throttled = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(1), new ThreadPoolExecutor.CallerRunsPolicy());
        List<String> ranOn = java.util.Collections.synchronizedList(new ArrayList<>());
        throttled.execute(() -> await(gate2));                                     // occupies the only worker
        throttled.execute(() -> ranOn.add("queued task ran on a pool thread: " + !Thread.currentThread().getName().equals("main")));
        throttled.execute(() -> ranOn.add("overflow task ran on: " + Thread.currentThread().getName()));   // queue full
        gate2.countDown();
        throttled.shutdown();
        throttled.awaitTermination(5, TimeUnit.SECONDS);
        System.out.println(ranOn);                     // overflow ran first, synchronously, on main
    }

    static void await(CountDownLatch latch) {
        try { latch.await(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }
}

final class LimitedDatabase {
    private final Semaphore connections;
    private final AtomicInteger inUse = new AtomicInteger();
    private final AtomicInteger peak = new AtomicInteger();

    LimitedDatabase(int maxConnections) { this.connections = new Semaphore(maxConnections, true); }   // fair: FIFO

    String query(String sql) throws InterruptedException {
        connections.acquire();                          // block until a connection is free
        try {
            return run(sql);
        } finally {
            connections.release();                      // ALWAYS returned, even if run() throws
        }
    }

    java.util.Optional<String> tryQuery(String sql, long timeoutMs) throws InterruptedException {
        if (!connections.tryAcquire(timeoutMs, TimeUnit.MILLISECONDS)) return java.util.Optional.empty();
        try {
            return java.util.Optional.of(run(sql));
        } finally {
            connections.release();
        }
    }

    /** Test helper: hold a connection until released. */
    void holdUntil(CountDownLatch release, CountDownLatch acquired) {
        try {
            connections.acquire();
            try {
                acquired.countDown();
                release.await();
            } finally {
                connections.release();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private String run(String sql) throws InterruptedException {
        peak.accumulateAndGet(inUse.incrementAndGet(), Math::max);
        try {
            Thread.sleep(3);                            // simulated query time
            return "ok: " + sql;
        } finally {
            inUse.decrementAndGet();
        }
    }

    int peakConcurrency() { return peak.get(); }
}
```

Key details:

- **`release()` in `finally`.** A permit leaked by an exception is gone forever; leak ten and the service is dead.
- **Fair semaphores** (`new Semaphore(n, true)`) hand permits out in arrival order. Unfair ones are faster but can let a waiting thread be overtaken repeatedly (**starvation**). Prefer fairness for user-facing waits where predictable latency matters.
- **A `Semaphore` doesn't track owners.** Releasing twice silently *raises* capacity above N. Guard releases (see the pool below).
- **Multiple permits at once:** if an operation needs 2 connections, use `acquire(2)`. Taking them one at a time can deadlock when every thread holds one and waits for a second.

## Object pools: when permits must be real objects

A connection pool hands out **actual objects**, not just permission. The standard shape is a **semaphore for admission plus a queue of idle objects**, and a **lease** that returns the object exactly once.

```java title="A generic pool with AutoCloseable leases" file="ResourcePoolDemo.java"
import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

public class ResourcePoolDemo {
    public static void main(String[] args) throws InterruptedException {
        AtomicInteger created = new AtomicInteger();
        Pool<String> pool = new Pool<>(2, () -> "conn-" + created.incrementAndGet());

        Pool.Lease<String> a = pool.acquire(Duration.ofMillis(50)).orElseThrow();
        try (Pool.Lease<String> b = pool.acquire(Duration.ofMillis(50)).orElseThrow()) {
            System.out.println("holding " + a.get() + " and " + b.get());
            System.out.println("third caller while both are out: " + pool.acquire(Duration.ofMillis(50)).map(Pool.Lease::get).orElse("timed out"));
        }                                                                  // b returned automatically here
        a.close();
        a.close();                                                         // second close is a no-op: no over-release
        System.out.println("available permits: " + pool.available() + ", objects created: " + created.get());
        try (Pool.Lease<String> c = pool.acquire(Duration.ofMillis(50)).orElseThrow()) {
            System.out.println("reused: " + c.get());
        }
    }
}

final class Pool<T> {
    private final Semaphore permits;
    private final ConcurrentLinkedQueue<T> idle = new ConcurrentLinkedQueue<>();
    private final Supplier<T> factory;

    Pool(int size, Supplier<T> factory) {
        this.permits = new Semaphore(size, true);
        this.factory = factory;
    }

    Optional<Lease<T>> acquire(Duration maxWait) throws InterruptedException {
        if (!permits.tryAcquire(maxWait.toMillis(), TimeUnit.MILLISECONDS)) return Optional.empty();
        T object = idle.poll();
        if (object == null) object = factory.get();                 // lazily create up to `size` objects
        return Optional.of(new Lease<>(this, object));
    }

    int available() { return permits.availablePermits(); }

    private void giveBack(T object) {
        idle.offer(object);
        permits.release();
    }

    /** Returned exactly once, however many times close() is called. */
    static final class Lease<T> implements AutoCloseable {
        private final Pool<T> pool;
        private final T object;
        private final AtomicBoolean returned = new AtomicBoolean();

        private Lease(Pool<T> pool, T object) { this.pool = pool; this.object = object; }

        T get() {
            if (returned.get()) throw new IllegalStateException("lease already returned");
            return object;
        }

        @Override public void close() {
            if (returned.compareAndSet(false, true)) pool.giveBack(object);
        }
    }
}
```

Production pools (HikariCP and others) add **validation** on borrow, **max lifetime** and **idle timeout** for objects, and **leak detection** (warn if a lease is held longer than expected). In an interview, the semaphore-plus-idle-queue shape with `AutoCloseable` leases is what matters.

## Thread pools are a scarce resource too

A thread pool is a scarcity mechanism (N workers) wrapped around a coordination mechanism (a work queue). `ThreadPoolExecutor` exposes every knob:

| Parameter | Meaning | Guidance |
|---|---|---|
| `corePoolSize` / `maximumPoolSize` | Workers kept / maximum workers | For a fixed pool, set both equal |
| `workQueue` | Where tasks wait | **Bounded** `ArrayBlockingQueue`; unbounded queues hide overload |
| `RejectedExecutionHandler` | What happens when the queue is full and no worker is free | See below |

| Rejection policy | Behaviour | Use for |
|---|---|---|
| `AbortPolicy` (default) | Throw `RejectedExecutionException` | Fail fast; map to "service busy" |
| `CallerRunsPolicy` | The submitting thread runs the task itself | Built-in backpressure: producers slow down |
| `DiscardPolicy` | Silently drop the new task | Rarely; only for truly optional work |
| `DiscardOldestPolicy` | Drop the oldest queued task and retry | Latest-value-wins work (status refreshes) |

The demo above shows both: with 2 workers and a queue of 3, ten submissions give **2 running + 3 queued + 5 rejected**; with `CallerRunsPolicy`, the overflow task runs on `main` — the producer is forced to do the work, so it can't submit more until it finishes.

### Sizing pools

- **Little's law:** *concurrency = arrival rate × time in system.* At 200 requests/s, each holding a DB connection for 50ms, you need about 200 × 0.05 = **10 connections** on average. Add headroom for bursts — but more connections than the database can serve just moves the queue there.
- **CPU-bound work:** roughly **number of cores** threads; more just adds context switching.
- **I/O-bound work:** roughly **cores × (1 + wait time / compute time)**, then measure.
- **Measure under load.** Formulas give a starting point, not an answer.

## Bulkheads: don't let one dependency take everything

If checkout and recommendations share one pool of 50 HTTP threads, and the recommendations service slows down, its calls pile up until **all 50 threads** are stuck — and checkout fails too. A **bulkhead** (named after a ship's watertight compartments) gives each dependency its own limit: a semaphore or pool per dependency. A slow dependency can then only exhaust **its own** compartment.

Combine bulkheads with **timeouts** (so stuck calls release their permit) and, in larger systems, **circuit breakers** (stop calling a dependency that keeps failing).

## Concurrency limits vs rate limits

Both protect scarce capacity, but they measure different things:

| | Concurrency limit | Rate limit |
|---|---|---|
| Limits | Requests **in flight at once** | Requests **per unit of time** |
| Tool | `Semaphore`, pool size, bulkhead | Token bucket, sliding window |
| Protects | Connections, threads, memory | A partner's quota, fairness between clients |
| Example | "At most 20 concurrent calls to the PDF service" | "At most 100 requests per minute per API key" |

Systems often need both. The [Rate Limiter](problem:rate-limiter) problem builds the second kind.

## Scarcity inside LLD problems

| Problem | What's scarce | Typical mechanism |
|---|---|---|
| [Parking Lot](problem:parking-lot) / [Concurrent Parking Lot](problem:concurrent-parking-lot) | Spots per size | Free-spot pools; a semaphore per size if gates should *wait* for a spot |
| [Flash Sale](problem:flash-sale-inventory) | Units of stock | Atomic counter + reservations with expiry (leases) |
| [Meeting Room](problem:meeting-room-booking) / [Movie Booking](problem:movie-ticket-booking) | Rooms per slot, seats per show | Per-aggregate locks + holds with TTL |
| [Ride-Sharing](problem:ride-sharing) | Available drivers | Atomic driver claim; requests wait with a timeout |
| [Task Scheduler](problem:task-scheduler) | Worker threads | Bounded executor + rejection or queueing policy |

## Real-world example

An e-commerce service used one shared HTTP client pool (200 connections) for every downstream call. One afternoon, the recommendations service started responding in 30 seconds instead of 50ms. Within two minutes all 200 connections were waiting on recommendations, and checkout, payment and search calls queued behind them: the whole site went down because of a non-essential widget. The fix had three parts: **per-dependency bulkheads** (recommendations capped at 20 concurrent calls), **short timeouts** (300ms for recommendations), and **fallbacks** (show bestsellers when recommendations are unavailable).

## Common mistakes

- **`release()` outside `finally`** → permits leak until the service deadlocks.
- **Releasing more than you acquired** → the semaphore silently allows more than N.
- **Unbounded waits** on request paths; **unbounded queues** in executors.
- **One shared pool for every dependency** (no bulkheads).
- **Acquiring several resources one at a time** → deadlock when everyone holds one.
- **Sizing by guesswork** instead of Little's law and measurement.
- **Confusing rate limits with concurrency limits.**

## In the interview

> [!INTERVIEW] What to say
> *"The PDF renderer can only handle 8 jobs at once, so I wrap calls in a fair `Semaphore(8)`. User requests wait at most 2 seconds for a permit, then get a 'try again' response — no unbounded waits. Batch jobs go through a separate bulkhead so they can't starve user traffic. The permit is released in `finally`, so a failing render can't leak capacity."*

## Key takeaways

- Scarcity = **more demand than supply**. Decide admission, what happens when none is free, guaranteed return, and isolation.
- **Semaphores** cap concurrency; **pools** hand out real objects via **leases**; both release in `finally`.
- Prefer **bounded waits or rejection** over waiting forever; use **fairness** where latency predictability matters.
- **Thread pools are scarce resources:** bound the queue and pick a rejection policy; size with **Little's law**.
- Use **bulkheads** to isolate dependencies, and distinguish **concurrency limits** from **rate limits**.

## Knowledge check

```quiz
? A method acquires a semaphore permit, calls a service that sometimes throws, then releases the permit on the next line. What happens over time?
+ Each exception leaks a permit, until no permits remain and every caller blocks
- Nothing; permits are released automatically
- The semaphore throws an exception
> Always release in a finally block (or use an AutoCloseable lease).

? A user-facing endpoint needs one of 10 connections. All 10 are busy. What's usually the best behaviour?
- Wait indefinitely until one frees up
+ Wait briefly (a bounded timeout), then fail fast with a "busy, try again" response
- Create an 11th connection
> Bounded waits protect latency and threads; unbounded waits cascade into outages.

? Which executor configuration provides natural backpressure on the code submitting tasks?
- Executors.newFixedThreadPool with its default queue
+ A bounded queue with CallerRunsPolicy, so overflow tasks run on the submitting thread
- An unbounded queue with DiscardPolicy
> CallerRunsPolicy makes producers do the work themselves, which slows their submission rate.
```

## Exercise

Implement a **`Bulkhead`** that limits concurrent calls to one dependency: `call(Callable<T>)` waits at most a configured time for a permit and throws `BulkheadFullException` if none frees up. Then show that when the *recommendations* bulkhead is saturated by slow calls, calls through the *payments* bulkhead still succeed.

````hint title="Hint"
A fair `Semaphore` plus `tryAcquire(timeout)`, and a `finally` release. To make the demo deterministic, block the slow calls on a `CountDownLatch` and wait until they've *started* before testing.
````

````solution title="Reference solution"
```java file="BulkheadDemo.java"
import java.time.Duration;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

public class BulkheadDemo {
    public static void main(String[] args) throws Exception {
        Bulkhead payments = new Bulkhead("payments", 2, Duration.ofMillis(50));
        Bulkhead recommendations = new Bulkhead("recommendations", 2, Duration.ofMillis(20));

        CountDownLatch slowServiceRecovers = new CountDownLatch(1);
        CountDownLatch bothStarted = new CountDownLatch(2);
        for (int i = 0; i < 2; i++) {
            new Thread(() -> {
                try {
                    recommendations.call(() -> { bothStarted.countDown(); slowServiceRecovers.await(); return "recs"; });
                } catch (Exception ignored) { }
            }).start();
        }
        bothStarted.await();                                       // recommendations bulkhead is now full

        try {
            recommendations.call(() -> "recs");
        } catch (BulkheadFullException e) {
            System.out.println("Rejected: " + e.getMessage() + " -> show bestsellers instead");
        }
        System.out.println("payments still works: " + payments.call(() -> "charged 499"));
        slowServiceRecovers.countDown();
    }
}

class BulkheadFullException extends RuntimeException {
    BulkheadFullException(String name) { super(name + " bulkhead is full"); }
}

final class Bulkhead {
    private final String name;
    private final Semaphore permits;
    private final Duration maxWait;

    Bulkhead(String name, int maxConcurrentCalls, Duration maxWait) {
        this.name = name;
        this.permits = new Semaphore(maxConcurrentCalls, true);
        this.maxWait = maxWait;
    }

    <T> T call(Callable<T> work) throws Exception {
        if (!permits.tryAcquire(maxWait.toMillis(), TimeUnit.MILLISECONDS)) throw new BulkheadFullException(name);
        try {
            return work.call();
        } finally {
            permits.release();
        }
    }
}
```

The recommendations outage is contained: its third caller is rejected after 20ms (and can fall back to bestsellers), while payments keep their own two permits.
````
