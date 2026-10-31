## Problem statement

An API gateway needs two kinds of protection, implemented in `RateLimiters`:

1. **`TokenBucketLimiter`** limits each client to a **rate**: a burst of `capacity` requests, refilled at `refillPerSecond`.
   - `boolean tryAcquire(String clientId)` must be **lock-free**: per-client state in an `AtomicReference` holding an immutable snapshot, updated with **compare-and-set** loops. No `synchronized`, no locks.
   - Time comes from an injected `LongSupplier` nano-clock.
   - Use integer arithmetic only (no `double` drift).
2. **`ConcurrencyLimiter`** limits the number of **in-flight** calls to a fragile downstream service, using a `Semaphore`.
   - `<T> T call(Callable<T> task, Duration maxWait)` waits at most `maxWait` for a permit, else throws `RejectedException`.
   - The permit is released even if the task throws.
   - `inFlight()` and `peakInFlight()` expose metrics.

**Correctness under contention**:
- with time frozen, 16 threads hammering one client must get **exactly** `capacity` permits, never one more;
- the concurrency limiter must never exceed its limit;
- invalid configuration → `IllegalArgumentException`.

## Starter code

```java title="RateLimiters.java" starter="true"
import java.time.Duration;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.LongSupplier;

public final class RateLimiters {
    private RateLimiters() { }

    static final class TokenBucketLimiter {
        private record State(long credit, long lastRefill) { }   // credit = tokens * nanosPerToken

        private final ConcurrentHashMap<String, AtomicReference<State>> buckets = new ConcurrentHashMap<>();

        TokenBucketLimiter(long capacity, long refillPerSecond, LongSupplier nanoClock) {
            // TODO: validate and store
        }

        boolean tryAcquire(String clientId) {
            throw new UnsupportedOperationException("TODO: CAS loop");
        }
    }

    static final class RejectedException extends Exception {
        private static final long serialVersionUID = 1L;
        RejectedException(String message) { super(message); }
    }

    static final class ConcurrencyLimiter {
        ConcurrencyLimiter(int maxConcurrent) {
            // TODO
        }

        <T> T call(Callable<T> task, Duration maxWait) throws Exception {
            throw new UnsupportedOperationException("TODO");
        }

        int inFlight() { throw new UnsupportedOperationException("TODO"); }
        int peakInFlight() { throw new UnsupportedOperationException("TODO"); }
    }

    /** n attempts for one client, as a string such as "YYn" (Y = allowed). */
    static String attempts(TokenBucketLimiter limiter, String client, int n) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < n; i++) sb.append(limiter.tryAcquire(client) ? 'Y' : 'n');
        return sb.toString();
    }

    public static void main(String[] args) throws Exception {
        long[] now = { 0 };
        TokenBucketLimiter limiter = new TokenBucketLimiter(3, 2, () -> now[0]);
        System.out.println("burst of 5 (capacity 3): " + attempts(limiter, "ada", 5));
    }
}
```

## Hints

````hint title="Hint 1: the CAS loop shape"
```java
AtomicReference<State> ref = buckets.computeIfAbsent(clientId, id -> new AtomicReference<>(new State(maxCredit, clock.getAsLong())));
while (true) {
    State current = ref.get();
    long now = clock.getAsLong();
    long credit = Math.min(maxCredit, current.credit() + Math.max(0, now - current.lastRefill()));
    if (credit < nanosPerToken) return false;                 // not enough: nothing to update
    State next = new State(credit - nanosPerToken, now);
    if (ref.compareAndSet(current, next)) return true;        // nobody changed it meanwhile: done
    // lost the race: re-read and retry
}
```

Each attempt computes a complete new state from one consistent snapshot, and `compareAndSet` publishes it only if the snapshot is still current.
````

````hint title="Hint 2: integer tokens"
Store "credit" in nanoseconds: one token = `nanosPerToken = 1_000_000_000 / refillPerSecond`, and capacity = `capacity * nanosPerToken` (use `Math.multiplyExact`). Elapsed nanoseconds add credit directly, with no floating-point rounding. Guard against `now - lastRefill` being negative, which can happen if threads read the clock in a different order from the one in which they win the CAS.
````

````hint title="Hint 3: the semaphore limiter"
```java
if (!permits.tryAcquire(maxWait.toNanos(), TimeUnit.NANOSECONDS)) throw new RejectedException(...);
try {
    int current = inFlight.incrementAndGet();
    peak.accumulateAndGet(current, Math::max);
    return task.call();
} finally {
    inFlight.decrementAndGet();
    permits.release();                                        // always, even if the task throws
}
```
````

## Test cases

| Scenario | Expected |
|---|---|
| Capacity 3, 2 tokens/s, 5 immediate calls | `YYYnn` |
| +0.5 s, then 2 calls | `Yn` (one token refilled) |
| +10 s, then 5 calls | `YYYnn` (credit capped at capacity) |
| Two clients | independent buckets |
| 16 threads × 10,000 attempts, capacity 1,000, frozen clock | exactly 1,000 allowed |
| Concurrency limit 4, 4 calls blocked inside the service | the next 6 immediate calls are rejected; in flight stays 4 |
| A call waits up to 1 s while a permit frees after 50 ms | accepted |
| A task throws | the exception propagates; in flight returns to 0 |
| 32 threads with random work, limit 5 | peak in flight ≤ 5 |

## Expected output

```text title="Expected output" output="RateLimiters.java"
burst of 5 (capacity 3): YYYnn
after 0.5 s at 2 tokens/s: Yn, other client: YYYn
after 10 s idle (capped at 3): YYYnn
16 threads x 10,000 attempts, capacity 1,000, frozen clock -> allowed 1000
limit 4 with 4 calls in flight: next 6 immediate calls rejected 6, in flight 4
a call willing to wait: accepted after waiting; peak in flight 4
failing task: downstream 500 propagated, in flight back to 0
```

## Reference solution

````solution title="Reference solution (RateLimiters.java)"
```java title="RateLimiters.java" file="RateLimiters.java"
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.LongSupplier;

public final class RateLimiters {
    private RateLimiters() { }

    // ---------------- 1. lock-free token bucket ----------------
    static final class TokenBucketLimiter {
        private record State(long credit, long lastRefill) { }   // credit = tokens * nanosPerToken

        private final ConcurrentHashMap<String, AtomicReference<State>> buckets = new ConcurrentHashMap<>();
        private final long nanosPerToken;
        private final long maxCredit;
        private final LongSupplier clock;

        TokenBucketLimiter(long capacity, long refillPerSecond, LongSupplier nanoClock) {
            if (capacity < 1 || refillPerSecond < 1) {
                throw new IllegalArgumentException("capacity and refill rate must be positive");
            }
            this.nanosPerToken = TimeUnit.SECONDS.toNanos(1) / refillPerSecond;
            this.maxCredit = Math.multiplyExact(capacity, nanosPerToken);
            this.clock = nanoClock;
        }

        boolean tryAcquire(String clientId) {
            AtomicReference<State> ref = buckets.computeIfAbsent(clientId,
                    id -> new AtomicReference<>(new State(maxCredit, clock.getAsLong())));
            while (true) {
                State current = ref.get();                           // one consistent snapshot
                long now = clock.getAsLong();
                long elapsed = Math.max(0, now - current.lastRefill());
                long credit = Math.min(maxCredit, current.credit() + elapsed);
                if (credit < nanosPerToken) {
                    return false;                                    // denied: no state change needed
                }
                State next = new State(credit - nanosPerToken, Math.max(now, current.lastRefill()));
                if (ref.compareAndSet(current, next)) {
                    return true;                                     // our snapshot was still current
                }
                // another thread updated the bucket first: re-read and retry
            }
        }
    }

    // ---------------- 2. semaphore-based concurrency limiter ----------------
    static final class RejectedException extends Exception {
        private static final long serialVersionUID = 1L;
        RejectedException(String message) { super(message); }
    }

    static final class ConcurrencyLimiter {
        private final Semaphore permits;
        private final int maxConcurrent;
        private final AtomicInteger inFlight = new AtomicInteger();
        private final AtomicInteger peak = new AtomicInteger();

        ConcurrencyLimiter(int maxConcurrent) {
            if (maxConcurrent < 1) throw new IllegalArgumentException("maxConcurrent must be positive");
            this.maxConcurrent = maxConcurrent;
            this.permits = new Semaphore(maxConcurrent);
        }

        <T> T call(Callable<T> task, Duration maxWait) throws Exception {
            if (!permits.tryAcquire(maxWait.toNanos(), TimeUnit.NANOSECONDS)) {
                throw new RejectedException("more than " + maxConcurrent + " calls in flight");
            }
            try {
                peak.accumulateAndGet(inFlight.incrementAndGet(), Math::max);
                return task.call();
            } finally {
                inFlight.decrementAndGet();
                permits.release();                                   // always returned, even on exceptions
            }
        }

        int inFlight() { return inFlight.get(); }
        int peakInFlight() { return peak.get(); }
    }

    static String attempts(TokenBucketLimiter limiter, String client, int n) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < n; i++) sb.append(limiter.tryAcquire(client) ? 'Y' : 'n');
        return sb.toString();
    }

    public static void main(String[] args) throws Exception {
        long[] now = { 0 };
        TokenBucketLimiter limiter = new TokenBucketLimiter(3, 2, () -> now[0]);
        System.out.println("burst of 5 (capacity 3): " + attempts(limiter, "ada", 5));
        now[0] += TimeUnit.MILLISECONDS.toNanos(500);
        System.out.println("after 0.5 s at 2 tokens/s: " + attempts(limiter, "ada", 2) + ", other client: " + attempts(limiter, "bob", 4));
        now[0] += TimeUnit.SECONDS.toNanos(10);
        System.out.println("after 10 s idle (capped at 3): " + attempts(limiter, "ada", 5));

        TokenBucketLimiter frozen = new TokenBucketLimiter(1_000, 1, () -> 42L);
        AtomicInteger allowed = new AtomicInteger();
        CyclicBarrier start = new CyclicBarrier(16);
        List<Thread> threads = new ArrayList<>();
        for (int t = 0; t < 16; t++) {
            threads.add(new Thread(() -> {
                try {
                    start.await();
                    for (int i = 0; i < 10_000; i++) if (frozen.tryAcquire("hot-client")) allowed.incrementAndGet();
                } catch (Exception e) {
                    throw new IllegalStateException(e);
                }
            }));
        }
        threads.forEach(Thread::start);
        for (Thread t : threads) t.join();
        System.out.println("16 threads x 10,000 attempts, capacity 1,000, frozen clock -> allowed " + allowed.get());

        ConcurrencyLimiter downstream = new ConcurrencyLimiter(4);
        CountDownLatch release = new CountDownLatch(1);
        List<Thread> slowCalls = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            Thread t = new Thread(() -> {
                try {
                    downstream.call(() -> { release.await(); return "ok"; }, Duration.ZERO);
                } catch (Exception e) {
                    throw new IllegalStateException(e);
                }
            });
            slowCalls.add(t);
            t.start();
        }
        while (downstream.inFlight() < 4) Thread.onSpinWait();
        int rejected = 0;
        for (int i = 0; i < 6; i++) {
            try {
                downstream.call(() -> "fast", Duration.ZERO);
            } catch (RejectedException e) {
                rejected++;
            }
        }
        System.out.println("limit 4 with 4 calls in flight: next 6 immediate calls rejected " + rejected + ", in flight " + downstream.inFlight());
        Thread freer = new Thread(() -> {
            try { Thread.sleep(50); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            release.countDown();
        });
        freer.start();
        String waited = downstream.call(() -> "accepted after waiting", Duration.ofSeconds(5));
        for (Thread t : slowCalls) t.join();
        freer.join();
        System.out.println("a call willing to wait: " + waited + "; peak in flight " + downstream.peakInFlight());
        try {
            downstream.call(() -> { throw new IllegalStateException("downstream 500"); }, Duration.ZERO);
        } catch (IllegalStateException e) {
            System.out.println("failing task: " + e.getMessage() + " propagated, in flight back to " + downstream.inFlight());
        }
    }
}
```
````

## Step-by-step explanation

````solution title="Step-by-step explanation"
**Lock-free token bucket**
1. **Immutable state plus `AtomicReference`**: a bucket's state is a small record `(credit, lastRefill)`. Threads never modify it. They build a new record and swap it in with `compareAndSet(expected, next)`, which succeeds only if no other thread swapped first. That gives atomic multi-field updates without a lock.
2. **The CAS loop**:
   - read the snapshot;
   - compute the refill from elapsed time (capped at capacity);
   - if there isn't a whole token, return `false` without writing;
   - otherwise try to publish the debited state, and retry on contention.
   
   Losing a CAS means someone else made progress (lock-freedom): the system as a whole never blocks, even if a thread is descheduled mid-update.
3. **Exactly-once accounting**: under 16 threads and 160,000 attempts against a frozen clock, exactly 1,000 succeeded. A non-atomic read-check-write (`if (tokens > 0) tokens--`) would over-admit, because two threads could both see the last token.
4. **Integer credit**: tokens are stored as nanoseconds of credit, so refills are exact (0.5 s at 2 tokens/s is exactly one token). `Math.multiplyExact` guards the capacity computation against overflow, and `Math.max(0, now - last)` tolerates threads that read the clock in a different order from the one in which they win the CAS.
5. **No ABA problem**: the CAS compares *references* to freshly allocated records, so an old reference can never come back to fool it.

**Semaphore concurrency limiter**
1. **Permits = in-flight slots.** `tryAcquire(maxWait)` either gets a slot within the wait budget or fails fast with `RejectedException`. That's load shedding: callers get an immediate error instead of queuing until timeouts cascade.
2. **`finally` guarantees release**, so a failing task can't leak permits (in flight returned to 0 after the exception). A leaked permit permanently shrinks capacity.
3. **Metrics** (`inFlight`, `peakInFlight`) are what you'd export to dashboards. The peak proves the limit held.

**Rate vs concurrency**: a token bucket limits *how often* calls start (requests per second). A semaphore limits *how many* run at once, which protects a downstream service whose latency grows under load. Gateways usually need both (Resilience4j calls them `RateLimiter` and `Bulkhead`).
````

## Edge cases

- **Clock jumps**: use `System.nanoTime()` (monotonic), never `currentTimeMillis()`, which can jump backwards with NTP adjustments.
- **Very high contention on one client**: CAS retries burn CPU. If a single hot key dominates, a lock or striped counters (`LongAdder`-style) can perform better than spinning.
- **Unbounded client map**: idle clients' buckets stay in the map forever. Expire them (a scheduled sweep, or a Caffeine cache with `expireAfterAccess`).
- **Distributed limits**: per-instance buckets allow N × the rate across N instances. Use a shared store (Redis with an atomic script), or divide the rate per instance.
- **`maxWait = 0`** means "reject immediately when full". A long `maxWait` turns the limiter into a queue, so bound it.
- **Fairness**: `new Semaphore(n, true)` serves waiters in arrival order, preventing starvation under sustained overload, at a throughput cost.
- **Virtual threads**: semaphores work well with them, and are the recommended way to bound concurrency towards a downstream resource when threads are no longer the limit.

## JUnit tests

```java title="RateLimitersTest.java" file="RateLimitersTest.java" test="RateLimiters.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class RateLimitersTest {
    @Test
    void burstRefillAndCap() {
        long[] now = { 0 };
        RateLimiters.TokenBucketLimiter l = new RateLimiters.TokenBucketLimiter(3, 2, () -> now[0]);
        assertEquals("YYYnn", RateLimiters.attempts(l, "a", 5));
        now[0] += TimeUnit.MILLISECONDS.toNanos(500);
        assertEquals("Yn", RateLimiters.attempts(l, "a", 2));
        now[0] += TimeUnit.MILLISECONDS.toNanos(250);
        assertEquals("n", RateLimiters.attempts(l, "a", 1));          // half a token is not enough
        now[0] += TimeUnit.MILLISECONDS.toNanos(250);
        assertEquals("Yn", RateLimiters.attempts(l, "a", 2));
        now[0] += TimeUnit.HOURS.toNanos(1);
        assertEquals("YYYn", RateLimiters.attempts(l, "a", 4));
    }

    @Test
    void clientsAreIndependent() {
        RateLimiters.TokenBucketLimiter l = new RateLimiters.TokenBucketLimiter(2, 1, () -> 0L);
        assertEquals("YYn", RateLimiters.attempts(l, "a", 3));
        assertEquals("YYn", RateLimiters.attempts(l, "b", 3));
    }

    @Test
    void neverOverAdmitsUnderContention() {
        assertTimeoutPreemptively(Duration.ofSeconds(30), () -> {
            RateLimiters.TokenBucketLimiter l = new RateLimiters.TokenBucketLimiter(500, 1, () -> 7L);
            AtomicInteger allowed = new AtomicInteger();
            CyclicBarrier start = new CyclicBarrier(12);
            List<Thread> threads = new ArrayList<>();
            for (int t = 0; t < 12; t++) {
                threads.add(new Thread(() -> {
                    try {
                        start.await();
                        for (int i = 0; i < 5_000; i++) if (l.tryAcquire("x")) allowed.incrementAndGet();
                    } catch (Exception e) {
                        throw new IllegalStateException(e);
                    }
                }));
            }
            threads.forEach(Thread::start);
            for (Thread t : threads) t.join();
            assertEquals(500, allowed.get());
        });
    }

    @Test
    void validation() {
        assertThrows(IllegalArgumentException.class, () -> new RateLimiters.TokenBucketLimiter(0, 1, () -> 0L));
        assertThrows(IllegalArgumentException.class, () -> new RateLimiters.TokenBucketLimiter(1, 0, () -> 0L));
        assertThrows(IllegalArgumentException.class, () -> new RateLimiters.ConcurrencyLimiter(0));
    }

    @Test
    void rejectsWhenFullAndReleasesOnFailure() throws Exception {
        RateLimiters.ConcurrencyLimiter limiter = new RateLimiters.ConcurrencyLimiter(1);
        CountDownLatch inside = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        Thread holder = new Thread(() -> {
            try {
                limiter.call(() -> { inside.countDown(); release.await(); return null; }, Duration.ZERO);
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        });
        holder.start();
        assertTrue(inside.await(5, TimeUnit.SECONDS));
        assertThrows(RateLimiters.RejectedException.class, () -> limiter.call(() -> "x", Duration.ofMillis(20)));
        release.countDown();
        holder.join(5_000);
        assertThrows(IllegalStateException.class, () -> limiter.call(() -> { throw new IllegalStateException("boom"); }, Duration.ZERO));
        assertEquals(0, limiter.inFlight());
        assertEquals("ok", limiter.call(() -> "ok", Duration.ZERO));
    }

    @Test
    void peakNeverExceedsLimit() {
        assertTimeoutPreemptively(Duration.ofSeconds(30), () -> {
            RateLimiters.ConcurrencyLimiter limiter = new RateLimiters.ConcurrencyLimiter(5);
            AtomicInteger completed = new AtomicInteger();
            List<Thread> threads = new ArrayList<>();
            for (int t = 0; t < 32; t++) {
                threads.add(new Thread(() -> {
                    for (int i = 0; i < 20; i++) {
                        try {
                            limiter.call(() -> {
                                Thread.sleep(ThreadLocalRandom.current().nextInt(2));
                                return completed.incrementAndGet();
                            }, Duration.ofSeconds(10));
                        } catch (Exception e) {
                            throw new IllegalStateException(e);
                        }
                    }
                }));
            }
            threads.forEach(Thread::start);
            for (Thread t : threads) t.join();
            assertEquals(640, completed.get());
            assertTrue(limiter.peakInFlight() <= 5);
            assertEquals(0, limiter.inFlight());
        });
    }
}
```
