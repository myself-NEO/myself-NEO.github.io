## Problem statement

Design an in-process rate limiter library. A service calls `allow(clientId)` before handling each request; the limiter answers yes or no so that no client exceeds its quota (for example, 100 requests per minute). Different clients may have different quotas, the algorithm should be swappable, and the limiter is called from many request threads at once.

> [!TIP] Try it first
> Before writing classes, compare two algorithms on this input: a limit of 2 per 10 seconds, with 2 requests at t=9s and 2 more at t=10s. How many does each algorithm let through?

## Clarifying questions

1. Limit per what — client, API key, IP, endpoint?
2. Which algorithm? Are short bursts acceptable?
3. Same quota for everyone, or tiers?
4. Single process or a distributed limit across servers?
5. What does the caller do with a "no" — reject (HTTP 429) or wait?
6. How precise must it be?

````reveal title="Answers we'll assume"
- Limits are per **client ID** (the caller decides what the ID is: user, key, IP).
- Support **token bucket** (allows bursts up to a capacity, then a steady rate), **sliding window log** (exact, no bursts across window edges) and **fixed window counter** (cheap, but bursty at edges). The algorithm is chosen per configuration.
- Quotas come from a **tier policy** (free vs pro).
- **Single process** first; distributed limiting is a follow-up.
- `allow` is non-blocking: it returns `true`/`false` immediately.
- Must be exact under concurrency: with a limit of 1000, 1000 concurrent callers get through, never 1001.
````

## Requirements

**Functional**

1. `allow(clientId)` returns whether the request may proceed.
2. Each client has an independent limit taken from its tier.
3. Three algorithms behind one interface; new ones can be added.

**Non-functional**

4. Thread-safe and exact under concurrent calls.
5. O(1) time per call for token bucket and fixed window.
6. Time is injectable, so tests don't sleep.

## Step 1 — Compare the algorithms

````reveal title="Token bucket, fixed window, sliding window log"
| Algorithm | State per client | Behaviour | Cost |
|---|---|---|---|
| **Token bucket** | tokens, last refill time | Bursts up to `capacity`, then `rate` per second on average | O(1) time and memory |
| **Fixed window counter** | window start, count | `limit` per aligned window; up to **2 × limit** across a window edge | O(1) |
| **Sliding window log** | timestamps of recent requests | Exactly `limit` in **any** window of that length | O(limit) memory |

The edge problem with fixed windows: with 2 per 10 s, requests at 9 s and 9.5 s fill window [0, 10); requests at 10 s and 10.5 s fill window [10, 20). Four requests in 1.5 seconds. The sliding log refuses the last two.

A common compromise is the **sliding window counter** (weight the previous window's count by how much of it still overlaps) — O(1) memory and close to exact; it's a good follow-up.
````

## Step 2 — Class design

```uml title="Rate limiter"
interface RateLimiter
  + tryAcquire(): boolean
class TokenBucket
  - capacity: long
  - tokens: double
  - refillPerNano: double
  - lastRefill: long
class FixedWindowCounter
  - limit: int
  - windowStart: long
  - count: int
class SlidingWindowLog
  - limit: int
  - timestamps: ArrayDeque<Long>
record LimitConfig
  + algorithm: Algorithm
  + limit: int
  + window: Duration
class RateLimiterFactory
  + create(config: LimitConfig, ticker: Ticker): RateLimiter
class ClientRateLimiter
  - limiters: ConcurrentHashMap<String, RateLimiter>
  - tiers: Function<String, LimitConfig>
  + allow(clientId: String): boolean
interface Ticker
  + nanos(): long
TokenBucket ..|> RateLimiter
FixedWindowCounter ..|> RateLimiter
SlidingWindowLog ..|> RateLimiter
RateLimiterFactory ..> RateLimiter : creates
ClientRateLimiter o-- "0..*" RateLimiter
ClientRateLimiter --> RateLimiterFactory
RateLimiter --> Ticker
```

## Step 3 — Implementation

````hint title="Hint — lazy refill"
Don't run a timer that adds tokens every second. When a request arrives, compute how many tokens accumulated since the last call (`elapsed × rate`), cap at capacity, then try to take one. Same idea for windows: decide the current window from the timestamp of the call.
````

````solution title="Complete Java solution"
```java title="RateLimiterDemo.java" file="RateLimiterDemo.java"
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Function;

public class RateLimiterDemo {
    public static void main(String[] args) {
        FakeTicker ticker = new FakeTicker();
        RateLimiter bucket = RateLimiterFactory.create(new LimitConfig(Algorithm.TOKEN_BUCKET, 3, Duration.ofSeconds(3)), ticker);
        System.out.println("token bucket t=0s,  5 calls: " + burst(bucket, 5));
        ticker.advance(Duration.ofSeconds(1));
        System.out.println("token bucket t=1s,  2 calls: " + burst(bucket, 2));
        ticker.advance(Duration.ofSeconds(60));
        System.out.println("token bucket t=61s, 4 calls: " + burst(bucket, 4));

        for (Algorithm algorithm : List.of(Algorithm.FIXED_WINDOW, Algorithm.SLIDING_WINDOW_LOG)) {
            FakeTicker t = new FakeTicker();
            RateLimiter limiter = RateLimiterFactory.create(new LimitConfig(algorithm, 2, Duration.ofSeconds(10)), t);
            t.advance(Duration.ofSeconds(9));
            List<Boolean> calls = new ArrayList<>(burst(limiter, 2));
            t.advance(Duration.ofSeconds(1));
            calls.addAll(burst(limiter, 2));
            System.out.println(algorithm + " 2 calls at 9s + 2 at 10s: " + calls);
        }

        Function<String, LimitConfig> tiers = client -> client.startsWith("pro-")
                ? new LimitConfig(Algorithm.TOKEN_BUCKET, 5, Duration.ofSeconds(10))
                : new LimitConfig(Algorithm.TOKEN_BUCKET, 2, Duration.ofSeconds(10));
        ClientRateLimiter api = new ClientRateLimiter(tiers, ticker);
        for (String client : List.of("free-asha", "pro-ravi", "free-meera")) {
            int allowed = 0;
            for (int i = 0; i < 4; i++) if (api.allow(client)) allowed++;
            System.out.println(client + ": " + allowed + " of 4 allowed");
        }
    }

    static List<Boolean> burst(RateLimiter limiter, int calls) {
        List<Boolean> results = new ArrayList<>();
        for (int i = 0; i < calls; i++) results.add(limiter.tryAcquire());
        return results;
    }
}

// ---------- Time ----------

interface Ticker { long nanos(); }

final class SystemTicker implements Ticker {
    public long nanos() { return System.nanoTime(); }
}

final class FakeTicker implements Ticker {
    private final AtomicLong now = new AtomicLong();
    public long nanos() { return now.get(); }
    void advance(Duration d) { now.addAndGet(d.toNanos()); }
}

// ---------- Algorithms ----------

interface RateLimiter {
    /** Non-blocking: true if the caller may proceed now. */
    boolean tryAcquire();
}

/** Bursts up to {@code capacity}; refills {@code capacity} tokens per {@code period}, continuously. */
final class TokenBucket implements RateLimiter {
    private final long capacity;
    private final double refillPerNano;
    private final Ticker ticker;
    private double tokens;
    private long lastRefill;

    TokenBucket(long capacity, Duration period, Ticker ticker) {
        this.capacity = capacity;
        this.refillPerNano = (double) capacity / period.toNanos();
        this.ticker = ticker;
        this.tokens = capacity;               // start full: a new client may burst immediately
        this.lastRefill = ticker.nanos();
    }

    public synchronized boolean tryAcquire() {
        long now = ticker.nanos();
        tokens = Math.min(capacity, tokens + (now - lastRefill) * refillPerNano);   // lazy refill
        lastRefill = now;
        if (tokens < 1) return false;
        tokens -= 1;
        return true;
    }
}

/** At most {@code limit} calls per aligned window [k*w, (k+1)*w). Cheap, but bursty at window edges. */
final class FixedWindowCounter implements RateLimiter {
    private final int limit;
    private final long windowNanos;
    private final Ticker ticker;
    private long windowStart = Long.MIN_VALUE;
    private int count;

    FixedWindowCounter(int limit, Duration window, Ticker ticker) {
        this.limit = limit;
        this.windowNanos = window.toNanos();
        this.ticker = ticker;
    }

    public synchronized boolean tryAcquire() {
        long now = ticker.nanos();
        long start = now - Math.floorMod(now, windowNanos);
        if (start != windowStart) {
            windowStart = start;
            count = 0;
        }
        if (count >= limit) return false;
        count++;
        return true;
    }
}

/** Exactly {@code limit} calls in any window of length w; stores one timestamp per allowed call. */
final class SlidingWindowLog implements RateLimiter {
    private final int limit;
    private final long windowNanos;
    private final Ticker ticker;
    private final ArrayDeque<Long> timestamps = new ArrayDeque<>();

    SlidingWindowLog(int limit, Duration window, Ticker ticker) {
        this.limit = limit;
        this.windowNanos = window.toNanos();
        this.ticker = ticker;
    }

    public synchronized boolean tryAcquire() {
        long now = ticker.nanos();
        while (!timestamps.isEmpty() && now - timestamps.peekFirst() >= windowNanos) timestamps.pollFirst();
        if (timestamps.size() >= limit) return false;
        timestamps.addLast(now);
        return true;
    }
}

// ---------- Configuration + factory ----------

enum Algorithm { TOKEN_BUCKET, FIXED_WINDOW, SLIDING_WINDOW_LOG }

record LimitConfig(Algorithm algorithm, int limit, Duration window) {
    LimitConfig {
        if (limit <= 0 || window.isZero() || window.isNegative()) throw new IllegalArgumentException("limit and window must be positive");
    }
}

final class RateLimiterFactory {
    private RateLimiterFactory() { }

    static RateLimiter create(LimitConfig c, Ticker ticker) {
        return switch (c.algorithm()) {
            case TOKEN_BUCKET -> new TokenBucket(c.limit(), c.window(), ticker);
            case FIXED_WINDOW -> new FixedWindowCounter(c.limit(), c.window(), ticker);
            case SLIDING_WINDOW_LOG -> new SlidingWindowLog(c.limit(), c.window(), ticker);
        };
    }
}

// ---------- Per-client registry ----------

final class ClientRateLimiter {
    private final Map<String, RateLimiter> limiters = new ConcurrentHashMap<>();
    private final Function<String, LimitConfig> tiers;
    private final Ticker ticker;

    ClientRateLimiter(Function<String, LimitConfig> tiers, Ticker ticker) {
        this.tiers = tiers;
        this.ticker = ticker;
    }

    boolean allow(String clientId) {
        // computeIfAbsent creates exactly one limiter per client, even under concurrent first calls.
        return limiters.computeIfAbsent(clientId, id -> RateLimiterFactory.create(tiers.apply(id), ticker)).tryAcquire();
    }
}
```
````

## Design decisions

- **One interface, three algorithms.** Callers depend on `RateLimiter.tryAcquire()` only; the `RateLimiterFactory` maps a `LimitConfig` to an implementation. A new algorithm is one new class and one new `case` (see [Strategy](lesson:strategy) and [Factory Method](lesson:factory-method)).
- **Lazy refill, no timers.** State is updated only when a request arrives, so idle clients cost nothing and there is no background thread to race with.
- **Injectable `Ticker`.** All algorithms read a monotonic nanosecond clock (`System.nanoTime()` in production). Tests move a fake ticker instead of sleeping (see [Testing LLD](lesson:testing-lld)).
- **One lock per client.** Each limiter's check-and-update is `synchronized` on that limiter, so clients never contend with each other (see [Scarcity](lesson:scarcity)).
- **Exactly one limiter per client** via `ConcurrentHashMap.computeIfAbsent`; a `get`-then-`put` could create two and double the client's quota.

## Patterns and principles

[Strategy](lesson:strategy) (the algorithms), [Factory Method](lesson:factory-method) (`RateLimiterFactory`), [thread safety](lesson:thread-safety) with per-key locks, [Scarcity](lesson:scarcity) (limiting access to a shared resource), and [testing with fake time](lesson:testing-lld).

## Example execution flow

```text
token bucket, capacity 3, refill 3 per 3s (1/s)
t=0    tokens 3 -> calls take 3; calls 4 and 5 find tokens 0 -> false
t=1s   refill +1 -> one call allowed, the next refused
t=61s  refill +60, capped at 3 -> 3 allowed, 4th refused

limit 2 per 10s, calls at 9s, 9s, 10s, 10s
fixed window   [0,10) count 2 -> new window [10,20) count resets -> all 4 allowed
sliding log    at 10s the log still holds 9s, 9s (within 10s) -> last 2 refused
```

```text title="Program output"
token bucket t=0s,  5 calls: [true, true, true, false, false]
token bucket t=1s,  2 calls: [true, false]
token bucket t=61s, 4 calls: [true, true, true, false]
FIXED_WINDOW 2 calls at 9s + 2 at 10s: [true, true, true, true]
SLIDING_WINDOW_LOG 2 calls at 9s + 2 at 10s: [true, true, false, false]
free-asha: 2 of 4 allowed
pro-ravi: 4 of 4 allowed
free-meera: 2 of 4 allowed
```

## Edge cases

- **Long idle period** → the bucket refills only up to capacity, never beyond.
- **Exactly at the window edge** → the sliding log drops entries that are a full window old (`>=`), so a call exactly 10 s later is allowed.
- **Invalid configuration** (zero limit or window) → rejected when the `LimitConfig` is created.
- **First calls from a new client at the same moment** → one limiter is created, not two.
- **Clock going backwards** → `System.nanoTime()` is monotonic; never use wall-clock time for elapsed time.

## Tests

```java title="RateLimiterTest.java" file="RateLimiterTest.java" test="RateLimiterDemo.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class RateLimiterTest {
    private final FakeTicker ticker = new FakeTicker();

    private RateLimiter limiter(Algorithm a, int limit, int seconds) {
        return RateLimiterFactory.create(new LimitConfig(a, limit, Duration.ofSeconds(seconds)), ticker);
    }

    @Test
    void tokenBucketRefillsAtTheConfiguredRate() {
        RateLimiter bucket = limiter(Algorithm.TOKEN_BUCKET, 10, 10);   // 1 token per second
        for (int i = 0; i < 10; i++) assertTrue(bucket.tryAcquire());
        assertFalse(bucket.tryAcquire());
        ticker.advance(Duration.ofMillis(2500));
        assertTrue(bucket.tryAcquire());
        assertTrue(bucket.tryAcquire());
        assertFalse(bucket.tryAcquire());                              // half a token left
    }

    @Test
    void slidingLogAllowsExactlyLimitInAnyWindow() {
        RateLimiter log = limiter(Algorithm.SLIDING_WINDOW_LOG, 3, 10);
        for (int i = 0; i < 3; i++) assertTrue(log.tryAcquire());
        ticker.advance(Duration.ofMillis(9_999));
        assertFalse(log.tryAcquire());
        ticker.advance(Duration.ofMillis(1));
        assertTrue(log.tryAcquire());
    }

    @Test
    void fixedWindowResetsAtTheBoundary() {
        RateLimiter fixed = limiter(Algorithm.FIXED_WINDOW, 1, 10);
        assertTrue(fixed.tryAcquire());
        assertFalse(fixed.tryAcquire());
        ticker.advance(Duration.ofSeconds(10));
        assertTrue(fixed.tryAcquire());
    }

    @Test
    void clientsAreIsolated() {
        ClientRateLimiter api = new ClientRateLimiter(id -> new LimitConfig(Algorithm.FIXED_WINDOW, 1, Duration.ofMinutes(1)), ticker);
        assertTrue(api.allow("a"));
        assertFalse(api.allow("a"));
        assertTrue(api.allow("b"));
    }

    @Test
    void invalidConfigIsRejected() {
        assertThrows(IllegalArgumentException.class, () -> new LimitConfig(Algorithm.TOKEN_BUCKET, 0, Duration.ofSeconds(1)));
    }

    @Test
    void exactUnderConcurrency() throws InterruptedException {
        for (Algorithm a : Algorithm.values()) {
            RateLimiter shared = limiter(a, 1_000, 60);                 // time frozen: no refill during the test
            AtomicInteger allowed = new AtomicInteger();
            ExecutorService pool = Executors.newFixedThreadPool(32);
            CountDownLatch go = new CountDownLatch(1);
            for (int t = 0; t < 32; t++) {
                pool.submit(() -> {
                    go.await();
                    for (int i = 0; i < 100; i++) if (shared.tryAcquire()) allowed.incrementAndGet();
                    return null;
                });
            }
            go.countDown();
            pool.shutdown();
            pool.awaitTermination(10, TimeUnit.SECONDS);
            assertEquals(1_000, allowed.get(), a.name());
        }
    }
}
```

## Concurrency

- **Critical section:** read state → decide → update state. Without the lock two threads can both see 1 token and both take it.
- **Lock-free variant:** a token bucket can pack `(tokens, lastRefill)` into one `AtomicLong` (or keep an `AtomicReference` to an immutable state record) and update it with a CAS loop. Worth it only if profiling shows contention on hot clients (see [Locks and atomics](lesson:locks-and-atomics)).
- **Memory:** the client map grows forever. Evict limiters that have been idle longer than their window (a cache with expire-after-access); a recreated limiter starts full, which is the same as an idle one would be.

## Common mistakes and alternatives

- **A background thread that refills every bucket** — O(clients) work per tick, and it races with requests.
- **Wall-clock time** (`System.currentTimeMillis`) for elapsed time — jumps when the clock is adjusted.
- **`get` then `put` in the client map** — two limiters per client under a race.
- **Fixed windows where bursts matter** — they allow 2× the limit across an edge.
- **Distributed limits in local memory** — with 10 servers, each allows the full quota. See the follow-up.

## Follow-up questions

````reveal title="Rate limit across many servers"
Keep the counter in a shared store. With Redis, a fixed or sliding window counter is `INCR key` + `EXPIRE`; a token bucket needs a small Lua script so read-refill-take is atomic on the server. Cost: one network round trip per request — mitigate with local pre-allocation (each server takes tokens in batches) at the price of some precision.
````

````reveal title="Tell the client when to retry"
Return a `Decision(allowed, retryAfter)` instead of a boolean. For a token bucket, `retryAfter = (1 - tokens) / refillRate`; for a sliding log, it's when the oldest timestamp leaves the window. The HTTP layer turns it into `429` with a `Retry-After` header.
````

````reveal title="Blocking acquire for internal callers"
Add `acquire()` that waits until a permit is available instead of refusing — this is Guava's `RateLimiter` model. Compute the wait time under the lock, release the lock, then sleep; never sleep while holding it.
````

## Complexity

- Token bucket and fixed window: O(1) time, O(1) memory per client.
- Sliding window log: amortised O(1) time, O(limit) memory per client.

## Interviewer checklist

- [ ] Algorithms compared, including the fixed-window edge burst
- [ ] Common interface + factory; algorithm chosen by configuration
- [ ] Lazy refill with an injectable monotonic clock
- [ ] Per-client limiter, created atomically
- [ ] Exactness under concurrency (lock or CAS), with a test
- [ ] Idle-client eviction and the distributed version discussed
