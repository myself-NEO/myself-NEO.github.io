## Concept explanation

### Beyond `Future`

A plain `Future` can only be *waited on* (`get()`), which blocks a thread and can't express "when this finishes, do that". **`CompletableFuture<T>`** (Java 8) is a future you can **compose**: attach callbacks that run when it completes, chain dependent asynchronous steps, combine independent ones, and handle errors, all without blocking threads in between.

### Starting work

```java
CompletableFuture<User> user = CompletableFuture.supplyAsync(() -> userService.load(id), ioPool);
CompletableFuture<Void> audit = CompletableFuture.runAsync(() -> auditLog.write(event), ioPool);
CompletableFuture<String> done = CompletableFuture.completedFuture("cached");
```

Without an executor argument, `*Async` methods use the **common `ForkJoinPool`**, which is shared by the whole JVM and sized for CPU work. **Pass your own executor for blocking I/O.**

### Composing

| Method | Shape | Use for |
|---|---|---|
| `thenApply(fn)` | `T -> U` | transform the result (like `map`) |
| `thenCompose(fn)` | `T -> CompletableFuture<U>` | a **dependent async step**: the next call needs this result (like `flatMap`) |
| `thenCombine(other, (a, b) -> …)` | two futures → one | **independent** steps running in parallel |
| `thenAccept(consumer)` / `thenRun(runnable)` | `T -> void` / `() -> void` | side effects at the end |
| `allOf(cfs…)` | `CompletableFuture<Void>` | wait for all; then read each with `join()` |
| `anyOf(cfs…)` | `CompletableFuture<Object>` | the first to complete (success **or** failure) |

`thenApply` with a function that returns a future gives `CompletableFuture<CompletableFuture<U>>`; `thenCompose` flattens it.

Each method has an `…Async` variant that runs the callback on an executor instead of whichever thread completed the previous stage.

### Errors

An exception in any stage completes the future **exceptionally**. Dependent stages are skipped, and the failure propagates down the chain, wrapped in a **`CompletionException`**.

| Method | Runs when | Can change the result? |
|---|---|---|
| `exceptionally(ex -> fallback)` | only on failure | yes: recover with a value |
| `handle((value, ex) -> …)` | always | yes: map success *or* failure |
| `whenComplete((value, ex) -> …)` | always | **no**: side effects (logging, metrics) only |
| `exceptionallyCompose` (12) | on failure | recover with another future |

At the end:
- `join()` throws `CompletionException` (unchecked);
- `get()` throws `ExecutionException` (checked);
- in both cases the real exception is the **cause**.

### Timeouts (Java 9)

- `orTimeout(1, SECONDS)` completes the future with `TimeoutException` if it isn't done in time.
- `completeOnTimeout(fallback, 1, SECONDS)` completes it with a default value instead.

Neither cancels the underlying work: the task keeps running unless it checks for interruption itself.

### Manual completion

`new CompletableFuture<>()` and later `complete(value)` / `completeExceptionally(ex)`: bridges callback-style APIs (event listeners, message replies, Netty) into composable futures.

## Internal working

- **State**: a `CompletableFuture` holds a `volatile Object result` (the value, an `AltResult` wrapping `null`, or an exception) and a lock-free **stack of dependent actions**. Completion CASes the result in, then pops and runs the dependents.
- **Which thread runs a callback?**
  - For non-async methods (`thenApply`), the callback runs either on the thread that completes the previous stage, or **immediately on the calling thread** if the stage is already complete.
  - For `…Async` methods, it's submitted to the given executor (or the common pool).

  That's why a "cheap" `thenApply` can end up running on a precious I/O thread, or on your request thread.
- **`allOf`** builds a tree of dependents that completes when every input does. It returns `CompletableFuture<Void>`, so you collect results by `join`ing each input afterwards, which never blocks because they're all done.
- **Exception propagation**: when a stage throws, `encodeThrowable` wraps the exception in a `CompletionException` (unless it already is one), and every dependent stage sees an exceptional result and skips its function, except `exceptionally`, `handle` and `whenComplete`.
- **`orTimeout`** uses a single daemon `ScheduledThreadPoolExecutor` ("CompletableFutureDelayScheduler") to complete the future exceptionally at the deadline.
- **Memory effects**: actions before completing a future happen-before dependent actions and `get`/`join` returns.

## Visual representation

```text title="A composed request"
           supplyAsync(loadUser)                       supplyAsync(loadPromotions)
                  | 50 ms                                     | 60 ms   (independent: runs in parallel)
           thenCompose(user -> loadOrders(user))              |
                  | 80 ms (dependent: needs the user)         |
                  +-------------- thenCombine ----------------+
                                       | (orders, promos) -> page
                               completeOnTimeout(fallback, 500 ms)
                               exceptionally(ex -> errorPage)
                                       |
                                     join()     total ~130 ms, not 190 ms

  failure path:  stage throws -> CompletionException(cause) -> later stages skipped -> exceptionally/handle recover
```

## Java code example

```java title="CompletableFutureDemo.java" file="CompletableFutureDemo.java"
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;

public class CompletableFutureDemo {
    static final AtomicInteger THREADS = new AtomicInteger();
    static final ExecutorService IO = Executors.newFixedThreadPool(8, r -> {
        Thread t = new Thread(r, "io-" + THREADS.incrementAndGet());
        t.setDaemon(true);
        return t;
    });

    static <T> T slow(long ms, T value) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return value;
    }

    static CompletableFuture<String> loadUser(int id) {
        return CompletableFuture.supplyAsync(() -> slow(50, "ada#" + id), IO);
    }

    static CompletableFuture<List<String>> loadOrders(String user) {
        return CompletableFuture.supplyAsync(() -> slow(80, List.of(user + ":book", user + ":lamp")), IO);
    }

    static CompletableFuture<Integer> loadLoyaltyPoints(String user) {
        return CompletableFuture.supplyAsync(() -> {
            slow(30, null);
            throw new IllegalStateException("loyalty service unavailable");
        }, IO);
    }

    public static void main(String[] args) throws Exception {
        // 1. thenApply transforms; thenCompose chains a dependent async call
        String upper = loadUser(7).thenApply(String::toUpperCase).join();
        List<String> orders = loadUser(7).thenCompose(CompletableFutureDemo::loadOrders).join();
        System.out.println("thenApply: " + upper + " | thenCompose: " + orders);

        // 2. thenCombine runs independent calls in parallel
        long start = System.nanoTime();
        CompletableFuture<String> a = CompletableFuture.supplyAsync(() -> slow(200, "prices"), IO);
        CompletableFuture<String> b = CompletableFuture.supplyAsync(() -> slow(200, "stock"), IO);
        String combined = a.thenCombine(b, (x, y) -> x + " + " + y).join();
        long ms = (System.nanoTime() - start) / 1_000_000;
        System.out.println("thenCombine: " + combined + ", two 200 ms calls took less than 350 ms: " + (ms < 350));

        // 3. allOf collects many results; anyOf takes the fastest
        List<CompletableFuture<Integer>> squares = List.of(1, 2, 3, 4, 5).stream()
                .map(n -> CompletableFuture.supplyAsync(() -> slow(20, n * n), IO))
                .toList();
        CompletableFuture.allOf(squares.toArray(new CompletableFuture<?>[0])).join();
        System.out.println("allOf: " + squares.stream().map(CompletableFuture::join).toList());
        Object fastest = CompletableFuture.anyOf(
                CompletableFuture.supplyAsync(() -> slow(300, "replica-1"), IO),
                CompletableFuture.supplyAsync(() -> slow(30, "replica-2"), IO),
                CompletableFuture.supplyAsync(() -> slow(150, "replica-3"), IO)).join();
        System.out.println("anyOf: " + fastest);

        // 4. Errors: propagation, exceptionally, handle, whenComplete
        CompletableFuture<Integer> points = loadLoyaltyPoints("ada").thenApply(p -> p * 2);   // skipped on failure
        try {
            points.join();
        } catch (CompletionException e) {
            System.out.println("join() -> CompletionException caused by " + e.getCause().getMessage());
        }
        try {
            points.get();
        } catch (ExecutionException e) {
            System.out.println("get()  -> ExecutionException caused by " + e.getCause().getMessage());
        }
        System.out.println("exceptionally: " + points.exceptionally(ex -> 0).join() + " points (fallback)");
        String handled = points.handle((value, ex) -> ex == null ? "points " + value : "no points: " + ex.getCause().getMessage()).join();
        System.out.println("handle: " + handled);
        CompletableFuture<String> logged = loadUser(1).whenComplete((value, ex) -> System.out.println("whenComplete saw " + value));
        System.out.println("whenComplete leaves the result unchanged: " + logged.join());

        // 5. Timeouts (Java 9)
        try {
            CompletableFuture.supplyAsync(() -> slow(1_000, "late"), IO).orTimeout(100, TimeUnit.MILLISECONDS).join();
        } catch (CompletionException e) {
            System.out.println("orTimeout -> " + e.getCause().getClass().getSimpleName());
        }
        String withDefault = CompletableFuture.supplyAsync(() -> slow(1_000, "late"), IO)
                .completeOnTimeout("cached value", 100, TimeUnit.MILLISECONDS).join();
        System.out.println("completeOnTimeout -> " + withDefault);

        // 6. Manual completion bridges callback APIs
        CompletableFuture<String> reply = new CompletableFuture<>();
        new Thread(() -> reply.complete("reply from a callback")).start();
        System.out.println("manual: " + reply.get(1, TimeUnit.SECONDS));
        CompletableFuture<String> broken = new CompletableFuture<>();
        broken.completeExceptionally(new TimeoutException("no reply"));
        System.out.println("manual failure is exceptional: " + broken.isCompletedExceptionally());

        IO.shutdown();
    }
}
```

## Output

```text title="Output" output="CompletableFutureDemo.java"
thenApply: ADA#7 | thenCompose: [ada#7:book, ada#7:lamp]
thenCombine: prices + stock, two 200 ms calls took less than 350 ms: true
allOf: [1, 4, 9, 16, 25]
anyOf: replica-2
join() -> CompletionException caused by loyalty service unavailable
get()  -> ExecutionException caused by loyalty service unavailable
exceptionally: 0 points (fallback)
handle: no points: loyalty service unavailable
whenComplete saw ada#1
whenComplete leaves the result unchanged: ada#1
orTimeout -> TimeoutException
completeOnTimeout -> cached value
manual: reply from a callback
manual failure is exceptional: true
```

- `thenCompose` waited for the user, then started the dependent orders call, and flattened the result into a single future of a list.
- `thenCombine` overlapped two 200 ms calls, finishing in about 200 ms rather than 400 ms.
- `allOf` waited for all five squares, which were then read with non-blocking `join()`s in submission order. `anyOf` returned the fastest replica.
- The failure in the loyalty service skipped the `thenApply` and surfaced as `CompletionException` from `join()` and `ExecutionException` from `get()`, with the real cause inside. `exceptionally`, `handle` and `whenComplete` show the three ways to react.
- `orTimeout` failed the slow call after 100 ms; `completeOnTimeout` substituted a cached value.

## Real-world application

- **API aggregation (BFF)**: a product page calls catalogue, price, stock, reviews and recommendations in parallel, combines them with `thenCombine`/`allOf`, uses `completeOnTimeout` for optional parts and `exceptionally` for fallbacks. Typical latency becomes `max(calls)` instead of `sum(calls)`.
- **Async HTTP and messaging clients**: `java.net.http.HttpClient.sendAsync`, Spring's `WebClient.toFuture()`, AWS SDK v2 and Kafka's `send()` return futures you compose.
- **Spring `@Async` methods** can return `CompletableFuture<T>`, letting controllers compose service calls.
- **Request–reply over messaging**: store a `CompletableFuture` per correlation id, `complete` it when the reply arrives, and `orTimeout` it if none does.
- **Virtual threads (Java 21)** often let you write the same parallel calls as simple blocking code, with structured concurrency for the fan-out. `CompletableFuture` remains essential for truly asynchronous APIs and pipelines.

## Common mistakes

- **Using the common pool for blocking I/O** (no executor argument), which starves parallel streams and every other `CompletableFuture` in the JVM.
- **`thenApply` with a function returning a future** (nested futures): use `thenCompose`.
- **Calling `join()`/`get()` too early** (`supplyAsync(a).join()` then `supplyAsync(b).join()`), which runs things sequentially. Start all the futures first, then combine.
- **Swallowing errors**: a chain with no `exceptionally`/`handle` whose result is never joined hides failures entirely.
- **Assuming `orTimeout` stops the work.** It only completes the future; the task keeps running.
- **Expecting `anyOf` to skip failures**: it completes with the first result, *even if that's an exception*.
- **Blocking (`join()`) inside a stage running on the same bounded executor**, which can cause a thread-starvation deadlock.

## Interview questions

**Q1. `thenApply` vs `thenCompose`?**

````reveal title="Answer"
`thenApply(fn)` transforms the result with a function `T -> U` (like `map`). `thenCompose(fn)` takes a function `T -> CompletionStage<U>`, for a dependent asynchronous step, and flattens it so you get `CompletableFuture<U>` rather than a nested future (like `flatMap`). Use `thenCompose` when the next step is itself an async call that needs the previous result.
````

**Q2. How do you run several independent calls in parallel and combine the results?**

````reveal title="Answer"
Start all of them first with `supplyAsync(..., executor)`. Then:
- for two: `a.thenCombine(b, (x, y) -> …)`;
- for many: `CompletableFuture.allOf(futures).thenApply(v -> futures.stream().map(CompletableFuture::join).toList())`, since every `join` is non-blocking once `allOf` has completed.

Add `orTimeout`/`completeOnTimeout` and `exceptionally` for resilience. Total latency is about the slowest call.
````

**Q3. How does exception handling work in a `CompletableFuture` chain?**

````reveal title="Answer"
An exception in a stage completes that stage exceptionally (wrapped in `CompletionException`). Dependent `thenApply`/`thenCompose`/`thenAccept` stages are skipped and propagate the failure. You recover with:
- `exceptionally(ex -> value)`, failure only;
- `handle((v, ex) -> …)`, both outcomes, can change the result;
- `exceptionallyCompose`, recovering with another future.

`whenComplete` observes without changing the result. At the end, `join()` throws `CompletionException` and `get()` throws `ExecutionException`, both with the original exception as the cause.
````

**Q4. Which thread executes the callbacks?**

````reveal title="Answer"
For non-async methods (`thenApply`, `thenAccept`…), the thread that completes the previous stage runs the callback, or, if the stage is already complete when you attach the callback, the thread attaching it. `…Async` variants run the callback on the supplied executor, or on the common `ForkJoinPool` if none is given. Pass explicit executors for blocking work, and be aware that "cheap" callbacks can run on I/O threads.
````

**Q5. What's the difference between `orTimeout` and `completeOnTimeout`?**

````reveal title="Answer"
Both were added in Java 9 and act if the future isn't complete within the given time. `orTimeout` completes it exceptionally with `TimeoutException`; `completeOnTimeout(value, …)` completes it normally with the given fallback value. Neither cancels or interrupts the underlying computation, which continues in the background unless you design it to stop.
````

## Hands-on exercise

Build an **account page** for a user id by composing simulated services, each a method returning a `CompletableFuture` on a dedicated executor:
- `profile(id)` (40 ms) → `"Ada"`;
- `orders(name)` (60 ms), which **depends on** the profile → `List.of("book", "lamp")`;
- `recommendations(id)` (independent, but sometimes slow): 2,000 ms, so fall back to `List.of("bestsellers")` after 200 ms with `completeOnTimeout`;
- `loyalty(id)` (independent) fails, so recover with 0 points via `exceptionally`.

Combine everything into `record AccountPage(String name, List<String> orders, List<String> recommendations, int points)`, and show the total time is well under the sum of the latencies.

````hint title="Hint"
`var name = profile(id); var orders = name.thenCompose(this::orders); var recs = recommendations(id).completeOnTimeout(List.of("bestsellers"), 200, MILLISECONDS); var points = loyalty(id).exceptionally(ex -> 0);` Then `name.thenCombine(orders, …)` and combine with the rest, or `allOf(...)` followed by `join`s.
````

````solution title="Solution"
```java title="AccountPageAggregator.java" file="AccountPageAggregator.java"
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class AccountPageAggregator {
    record AccountPage(String name, List<String> orders, List<String> recommendations, int points) { }

    private final ExecutorService io = Executors.newFixedThreadPool(8, r -> {
        Thread t = new Thread(r, "account-io");
        t.setDaemon(true);
        return t;
    });

    static <T> T after(long ms, T value) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return value;
    }

    CompletableFuture<String> profile(int id) {
        return CompletableFuture.supplyAsync(() -> after(40, "Ada"), io);
    }

    CompletableFuture<List<String>> orders(String name) {
        return CompletableFuture.supplyAsync(() -> after(60, List.of("book", "lamp")), io);
    }

    CompletableFuture<List<String>> recommendations(int id) {
        return CompletableFuture.supplyAsync(() -> after(2_000, List.of("personalised picks")), io);
    }

    CompletableFuture<Integer> loyalty(int id) {
        return CompletableFuture.supplyAsync(() -> {
            after(20, null);
            throw new IllegalStateException("loyalty service down");
        }, io);
    }

    AccountPage load(int id) {
        CompletableFuture<String> name = profile(id);
        CompletableFuture<List<String>> orders = name.thenCompose(this::orders);          // dependent
        CompletableFuture<List<String>> recs = recommendations(id)                        // independent, slow
                .completeOnTimeout(List.of("bestsellers"), 200, TimeUnit.MILLISECONDS);
        CompletableFuture<Integer> points = loyalty(id).exceptionally(ex -> 0);           // independent, failing
        return CompletableFuture.allOf(name, orders, recs, points)
                .thenApply(v -> new AccountPage(name.join(), orders.join(), recs.join(), points.join()))
                .join();
    }

    public static void main(String[] args) {
        AccountPageAggregator aggregator = new AccountPageAggregator();
        long start = System.nanoTime();
        AccountPage page = aggregator.load(42);
        long ms = (System.nanoTime() - start) / 1_000_000;
        System.out.println(page);
        System.out.println("built in under 500 ms (sequential would be over 2,100 ms): " + (ms < 500));
        aggregator.io.shutdownNow();
    }
}
```

```text title="Output" output="AccountPageAggregator.java"
AccountPage[name=Ada, orders=[book, lamp], recommendations=[bestsellers], points=0]
built in under 500 ms (sequential would be over 2,100 ms): true
```

The dependent chain (profile → orders, 100 ms) ran in parallel with the independent calls. The slow recommendations were cut off at 200 ms with a sensible default, and the failing loyalty service degraded to 0 points instead of failing the whole page. That's the resilience pattern behind most aggregation endpoints.
````

## Knowledge check

```quiz
? Which method chains a dependent asynchronous call that itself returns a CompletableFuture?
+ thenCompose
- thenApply
- thenCombine
> thenApply would produce a nested CompletableFuture<CompletableFuture<U>>.

? What executor do supplyAsync and the *Async methods use when none is given?
+ The common ForkJoinPool
- A new thread per call
- The calling thread
> Pass your own executor for blocking I/O.

? A stage throws; what does join() on the final future throw?
+ CompletionException with the original exception as its cause
- The original exception
- ExecutionException
> get() throws ExecutionException instead.

? Which method can observe a result or failure but not change it?
+ whenComplete
- handle
- exceptionally
> Use handle or exceptionally to recover.

? Does orTimeout stop the underlying task?
+ No; it only completes the future exceptionally
- Yes, it interrupts the task's thread
- Yes, it kills the executor
> Design tasks to stop themselves if needed.
```

## Key takeaways

- `CompletableFuture` composes async work: **`thenApply`** (map), **`thenCompose`** (dependent async, flatMap), **`thenCombine`/`allOf`** (independent, in parallel), **`anyOf`** (first).
- Errors propagate as **`CompletionException`**. Recover with **`exceptionally`** / **`handle`**; observe with **`whenComplete`**. `join()` → `CompletionException`, `get()` → `ExecutionException`.
- **Timeouts**: `orTimeout` (fail) and `completeOnTimeout` (fallback). Neither stops the work.
- **Executors matter**: pass a dedicated pool for blocking calls, and know which thread runs non-async callbacks.
- Start all independent futures **before** joining any; never block inside stages on the same bounded pool.
