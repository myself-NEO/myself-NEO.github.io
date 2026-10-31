## Problem statement

A shopping site shows the **best price** for a product by asking several partner services. Some are slow, some fail, and the page has a latency budget. Implement `PriceAggregator`:

```java
interface PriceService { String name(); long quoteCents(String sku) throws Exception; }   // blocking, slow, unreliable
enum Status { OK, TIMEOUT, ERROR, FALLBACK }
record Quote(String provider, Status status, long cents, String detail) { }
record Result(String sku, Optional<Quote> best, List<Quote> quotes) { }

PriceAggregator(List<PriceService> services, Duration perCallTimeout)   // AutoCloseable
CompletableFuture<Result> bestPrice(String sku)
```

**Requirements**:
1. Query **all services in parallel**. The total latency must be about the slowest *allowed* call (bounded by `perCallTimeout`), not the sum.
2. **Per-call timeout**: a call that doesn't answer in time becomes `TIMEOUT`, and its worker thread is **interrupted**, so slow calls don't pile up.
3. A call that throws becomes `ERROR`, with the exception's class name in `detail`.
4. `best` is the cheapest `OK` quote. Every successful best price is remembered per SKU.
5. **Fallback**: if no service answers, return the last known best price for the SKU with status `FALLBACK`, or `Optional.empty()` if there's none.
6. `quotes` lists every provider's outcome **in the order the services were given**.
7. `close()` shuts down the aggregator's threads.

## Starter code

```java title="PriceAggregator.java" starter="true"
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

public final class PriceAggregator implements AutoCloseable {
    interface PriceService {
        String name();
        long quoteCents(String sku) throws Exception;
    }

    enum Status { OK, TIMEOUT, ERROR, FALLBACK }

    record Quote(String provider, Status status, long cents, String detail) {
        @Override
        public String toString() {
            return provider + ": " + status + (status == Status.OK || status == Status.FALLBACK ? " " + cents : "")
                    + (detail.isEmpty() ? "" : " (" + detail + ")");
        }
    }

    record Result(String sku, Optional<Quote> best, List<Quote> quotes) { }

    private final List<PriceService> services;
    private final Duration perCallTimeout;
    private final Map<String, Quote> lastKnownBest = new ConcurrentHashMap<>();

    PriceAggregator(List<PriceService> services, Duration perCallTimeout) {
        this.services = List.copyOf(services);
        this.perCallTimeout = perCallTimeout;
        // TODO: executors for the calls and for the timeouts
    }

    CompletableFuture<Result> bestPrice(String sku) {
        throw new UnsupportedOperationException("TODO");
    }

    @Override
    public void close() {
        // TODO: shut down the executors
    }

    // ---------------- demo scaffolding (given) ----------------
    static final class SimulatedService implements PriceService {
        private final String name;
        private final long latencyMs;
        private final long cents;
        volatile boolean down;
        final java.util.concurrent.CountDownLatch interrupted = new java.util.concurrent.CountDownLatch(1);

        SimulatedService(String name, long latencyMs, long cents) {
            this.name = name;
            this.latencyMs = latencyMs;
            this.cents = cents;
        }

        @Override public String name() { return name; }

        @Override
        public long quoteCents(String sku) throws Exception {
            if (down || cents < 0) throw new java.io.IOException(name + " unavailable");
            try {
                Thread.sleep(latencyMs);
            } catch (InterruptedException e) {
                interrupted.countDown();                     // proof that the timeout cancelled us
                throw e;
            }
            return cents;
        }
    }

    public static void main(String[] args) throws Exception {
        SimulatedService fast = new SimulatedService("fast", 20, 1_999);
        SimulatedService slow = new SimulatedService("slow", 3_000, 1_799);       // cheapest, but too slow
        SimulatedService flaky = new SimulatedService("flaky", 10, -1);           // always throws
        SimulatedService medium = new SimulatedService("medium", 100, 2_099);
        try (PriceAggregator aggregator = new PriceAggregator(List.of(fast, slow, flaky, medium), Duration.ofMillis(300))) {
            Result r = aggregator.bestPrice("A1").get(5, java.util.concurrent.TimeUnit.SECONDS);
            System.out.println("A1 best: " + r.best().orElseThrow());
            System.out.println("A1 quotes: " + r.quotes());
        }
    }
}
```

## Hints

````hint title="Hint 1: one future per service"
For each service, create a `CompletableFuture<Quote>` that **always completes normally**, with an `OK`, `ERROR` or `TIMEOUT` quote. Failures become data, so a single bad provider can't fail the whole aggregation. Then combine:

```java
CompletableFuture.allOf(futures.toArray(CompletableFuture<?>[]::new))
        .thenApply(v -> futures.stream().map(CompletableFuture::join).toList())
```

`join()` inside `thenApply` doesn't block, because `allOf` guarantees every future is already complete.
````

````hint title="Hint 2: timeouts that also cancel the work"
`orTimeout` completes the *future* exceptionally, but the thread running the blocking call keeps working. To also stop it:
- `executor.submit(...)` the blocking call, and keep the `Future`;
- have the task call `cf.complete(OK quote)`, or `cf.complete(ERROR quote)` in its `catch`;
- schedule the timeout on a `ScheduledExecutorService`: `if (cf.complete(TIMEOUT quote)) task.cancel(true);`.

Whichever completes first wins: `complete` returns `false` if the future already has a value, so there's no race on the result.
````

````hint title="Hint 3: choosing and remembering"
- Pick the best with `quotes.stream().filter(q -> q.status() == OK).min(Comparator.comparingLong(Quote::cents))`.
- If present, store it in a `ConcurrentHashMap<String, Quote>`.
- If absent, look up the last known best and re-label it `FALLBACK`: `new Quote(q.provider(), FALLBACK, q.cents(), "last known price")`.
````

## Test cases

| Scenario (per-call timeout 300 ms) | Expected |
|---|---|
| fast (20 ms, 1999), slow (3 s, 1799), flaky (throws), medium (100 ms, 2099) | best `fast: OK 1999`; slow `TIMEOUT`, flaky `ERROR (IOException)`; done in well under 1 s |
| Same calls run sequentially would take | over 3.1 s, so parallelism is required |
| The slow service after its timeout | its worker thread was interrupted |
| Every service down, SKU priced before | `FALLBACK` with the last best price |
| Every service down, unknown SKU | `Optional.empty()` |
| Quotes order | always the service order, regardless of completion order |

## Expected output

```text title="Expected output" output="PriceAggregator.java"
A1 best: fast: OK 1999
A1 quotes: [fast: OK 1999, slow: TIMEOUT, flaky: ERROR (IOException), medium: OK 2099]
finished in under 1 s: true (sequential calls would take over 3.1 s)
slow service interrupted after its timeout: true
A1 with every provider down: fast: FALLBACK 1999 (last known price)
Z9 never priced, every provider down: Optional.empty
```

## Reference solution

````solution title="Reference solution (PriceAggregator.java)"
```java title="PriceAggregator.java" file="PriceAggregator.java"
import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public final class PriceAggregator implements AutoCloseable {
    interface PriceService {
        String name();
        long quoteCents(String sku) throws Exception;
    }

    enum Status { OK, TIMEOUT, ERROR, FALLBACK }

    record Quote(String provider, Status status, long cents, String detail) {
        @Override
        public String toString() {
            return provider + ": " + status + (status == Status.OK || status == Status.FALLBACK ? " " + cents : "")
                    + (detail.isEmpty() ? "" : " (" + detail + ")");
        }
    }

    record Result(String sku, Optional<Quote> best, List<Quote> quotes) { }

    private final List<PriceService> services;
    private final Duration perCallTimeout;
    private final Map<String, Quote> lastKnownBest = new ConcurrentHashMap<>();
    private final ExecutorService callers = Executors.newCachedThreadPool(daemon("price-call"));
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(daemon("price-timeout"));

    PriceAggregator(List<PriceService> services, Duration perCallTimeout) {
        this.services = List.copyOf(services);
        this.perCallTimeout = perCallTimeout;
    }

    private static java.util.concurrent.ThreadFactory daemon(String name) {
        return r -> {
            Thread t = new Thread(r, name);
            t.setDaemon(true);
            return t;
        };
    }

    /** Never completes exceptionally: every outcome becomes a Quote. */
    private CompletableFuture<Quote> ask(PriceService service, String sku) {
        CompletableFuture<Quote> result = new CompletableFuture<>();
        Future<?> task = callers.submit(() -> {
            try {
                result.complete(new Quote(service.name(), Status.OK, service.quoteCents(sku), ""));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();          // cancelled after a timeout: the TIMEOUT quote already won
            } catch (Exception e) {
                result.complete(new Quote(service.name(), Status.ERROR, -1, e.getClass().getSimpleName()));
            }
        });
        timer.schedule(() -> {
            if (result.complete(new Quote(service.name(), Status.TIMEOUT, -1, ""))) {
                task.cancel(true);                           // interrupt the slow call: free the thread
            }
        }, perCallTimeout.toNanos(), TimeUnit.NANOSECONDS);
        return result;
    }

    CompletableFuture<Result> bestPrice(String sku) {
        List<CompletableFuture<Quote>> futures = new ArrayList<>();
        for (PriceService s : services) {
            futures.add(ask(s, sku));                        // all calls start now, in parallel
        }
        return CompletableFuture.allOf(futures.toArray(CompletableFuture<?>[]::new))
                .thenApply(done -> {
                    List<Quote> quotes = futures.stream().map(CompletableFuture::join).toList();   // service order
                    Optional<Quote> best = quotes.stream()
                            .filter(q -> q.status() == Status.OK)
                            .min(Comparator.comparingLong(Quote::cents));
                    if (best.isPresent()) {
                        lastKnownBest.put(sku, best.get());
                    } else {
                        best = Optional.ofNullable(lastKnownBest.get(sku))
                                .map(q -> new Quote(q.provider(), Status.FALLBACK, q.cents(), "last known price"));
                    }
                    return new Result(sku, best, quotes);
                });
    }

    @Override
    public void close() {
        callers.shutdownNow();
        timer.shutdownNow();
    }

    // ---------------- demo ----------------
    static final class SimulatedService implements PriceService {
        private final String name;
        private final long latencyMs;
        private final long cents;
        volatile boolean down;
        final CountDownLatch interrupted = new CountDownLatch(1);

        SimulatedService(String name, long latencyMs, long cents) {
            this.name = name;
            this.latencyMs = latencyMs;
            this.cents = cents;
        }

        @Override public String name() { return name; }

        @Override
        public long quoteCents(String sku) throws Exception {
            if (down || cents < 0) throw new IOException(name + " unavailable");
            try {
                Thread.sleep(latencyMs);
            } catch (InterruptedException e) {
                interrupted.countDown();                     // proof that the timeout cancelled us
                throw e;
            }
            return cents;
        }
    }

    public static void main(String[] args) throws Exception {
        SimulatedService fast = new SimulatedService("fast", 20, 1_999);
        SimulatedService slow = new SimulatedService("slow", 3_000, 1_799);       // cheapest, but too slow
        SimulatedService flaky = new SimulatedService("flaky", 10, -1);           // always throws
        SimulatedService medium = new SimulatedService("medium", 100, 2_099);
        List<SimulatedService> all = List.of(fast, slow, flaky, medium);

        try (PriceAggregator aggregator = new PriceAggregator(List.copyOf(all), Duration.ofMillis(300))) {
            long start = System.nanoTime();
            Result r = aggregator.bestPrice("A1").get(5, TimeUnit.SECONDS);
            long ms = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
            System.out.println("A1 best: " + r.best().orElseThrow());
            System.out.println("A1 quotes: " + r.quotes());
            System.out.println("finished in under 1 s: " + (ms < 1_000) + " (sequential calls would take over 3.1 s)");
            System.out.println("slow service interrupted after its timeout: " + slow.interrupted.await(2, TimeUnit.SECONDS));

            all.forEach(s -> s.down = true);
            System.out.println("A1 with every provider down: " + aggregator.bestPrice("A1").get(5, TimeUnit.SECONDS).best().orElseThrow());
            System.out.println("Z9 never priced, every provider down: " + aggregator.bestPrice("Z9").get(5, TimeUnit.SECONDS).best());
        }
    }
}
```
````

## Step-by-step explanation

````solution title="Step-by-step explanation"
1. **Failures are values.** Each service call produces a `CompletableFuture<Quote>` that always completes *normally*, carrying `OK`, `ERROR` or `TIMEOUT`. Aggregation therefore never needs exception plumbing, and one broken partner can't sink the page: no `allOf` failing because of a single exceptional future.
2. **Parallel fan-out.** All calls are submitted before anything waits. Total latency ≈ min(slowest call, timeout) ≈ 300 ms here, versus over 3.1 s sequentially. A dedicated cached pool keeps these **blocking** calls off the common `ForkJoinPool`, which `supplyAsync` would use by default and which is sized for CPU work.
3. **Timeouts that free resources.**
   - A scheduled task tries `result.complete(TIMEOUT)`. If that wins, it calls `task.cancel(true)`, which interrupts the worker stuck in the slow call (the demo's `slow` service saw the interrupt).
   - With `orTimeout` alone, the future would time out, but the thread would stay blocked for the full 3 s: under load, threads leak until the pool is exhausted.
   - `complete()` is atomic and first-wins, so a late success and a timeout can't both be recorded.
4. **Combine without blocking.** `allOf(...).thenApply(...)` runs only after every per-service future has completed. The `join()` calls inside are therefore non-blocking, and mapping over the original `futures` list keeps the **service order**, regardless of which call finished first.
5. **Choose and remember.** The cheapest `OK` quote wins and is cached per SKU. When nothing answers, the cached quote is returned, clearly labelled `FALLBACK`, so the UI can show "price may be outdated". With no cache entry, `Optional.empty()` lets the caller render "price unavailable".
6. **Lifecycle.** The aggregator owns its threads, so it's `AutoCloseable`, and try-with-resources shuts them down. The threads are daemons, so a forgotten `close()` can't keep the JVM alive.

Production systems add: a circuit breaker per provider (stop calling one that keeps failing), hedged requests, metrics per status, and an overall deadline across all calls.
````

## Edge cases

- **A late success after a timeout** is ignored: `complete()` returns `false`, and the cancelled task can't overwrite the result.
- **Services that ignore interrupts** (busy loops, some legacy socket I/O) keep their thread busy despite `cancel(true)`. Bound the pool, and prefer clients with built-in timeouts (`HttpClient` with `.timeout(...)`).
- **Equal best prices**: `min` keeps the first in service order. Make the tie-break explicit (preferred partner, or `thenComparing(Quote::provider)`) if it matters.
- **Stale fallbacks**: cache entries need a TTL. A week-old price shown as current is a business bug.
- **Thread pool choice**: an unbounded cached pool plus a slow partner under heavy traffic means many threads. Use a bounded pool per provider (bulkhead), or virtual threads (Java 21) for blocking calls.
- **No services configured**: `allOf()` of nothing completes immediately, giving an empty quote list and a fallback-or-empty best.
- **Exceptions inside `thenApply`** would make the whole result fail. Keep combination logic simple, or add `exceptionally`/`handle` at the end.

## JUnit tests

```java title="PriceAggregatorTest.java" file="PriceAggregatorTest.java" test="PriceAggregator.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

class PriceAggregatorTest {
    private static PriceAggregator.Result fetch(PriceAggregator a, String sku) throws Exception {
        return a.bestPrice(sku).get(10, TimeUnit.SECONDS);
    }

    @Test
    void picksCheapestSuccessfulQuoteInParallel() throws Exception {
        List<PriceAggregator.PriceService> services = List.of(
                new PriceAggregator.SimulatedService("a", 200, 500),
                new PriceAggregator.SimulatedService("b", 200, 300),
                new PriceAggregator.SimulatedService("c", 200, 400));
        try (PriceAggregator agg = new PriceAggregator(services, Duration.ofSeconds(2))) {
            long start = System.nanoTime();
            PriceAggregator.Result r = fetch(agg, "X");
            long ms = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
            assertEquals("b", r.best().orElseThrow().provider());
            assertEquals(300, r.best().orElseThrow().cents());
            assertTrue(ms < 550, "calls must run in parallel, took " + ms + " ms");
        }
    }

    @Test
    void timeoutsAndErrorsBecomeStatusesInServiceOrder() throws Exception {
        PriceAggregator.SimulatedService slow = new PriceAggregator.SimulatedService("slow", 5_000, 100);
        List<PriceAggregator.PriceService> services = List.of(
                slow, new PriceAggregator.SimulatedService("broken", 5, -1), new PriceAggregator.SimulatedService("ok", 10, 900));
        try (PriceAggregator agg = new PriceAggregator(services, Duration.ofMillis(200))) {
            long start = System.nanoTime();
            PriceAggregator.Result r = fetch(agg, "X");
            assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start) < 1_500);
            assertEquals(List.of(PriceAggregator.Status.TIMEOUT, PriceAggregator.Status.ERROR, PriceAggregator.Status.OK),
                    r.quotes().stream().map(PriceAggregator.Quote::status).toList());
            assertEquals("IOException", r.quotes().get(1).detail());
            assertEquals(900, r.best().orElseThrow().cents());
            assertTrue(slow.interrupted.await(2, TimeUnit.SECONDS), "the timed-out call must be interrupted");
        }
    }

    @Test
    void fallsBackToLastKnownPriceOrEmpty() throws Exception {
        PriceAggregator.SimulatedService only = new PriceAggregator.SimulatedService("only", 5, 777);
        try (PriceAggregator agg = new PriceAggregator(List.of(only), Duration.ofMillis(500))) {
            assertEquals(777, fetch(agg, "A").best().orElseThrow().cents());
            only.down = true;
            PriceAggregator.Quote fallback = fetch(agg, "A").best().orElseThrow();
            assertEquals(PriceAggregator.Status.FALLBACK, fallback.status());
            assertEquals(777, fallback.cents());
            assertEquals(Optional.empty(), fetch(agg, "never-seen").best());
        }
    }

    @Test
    void noServicesMeansNoPrice() throws Exception {
        try (PriceAggregator agg = new PriceAggregator(List.of(), Duration.ofMillis(100))) {
            PriceAggregator.Result r = fetch(agg, "A");
            assertEquals(List.of(), r.quotes());
            assertEquals(Optional.empty(), r.best());
        }
    }
}
```
