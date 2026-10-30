## Concept explanation

### Why not `new Thread()` per task?

Creating a platform thread per task is expensive (an OS thread and a stack), unbounded (a traffic spike creates thousands of threads), and leaves you managing lifecycles, results and errors by hand. **The executor framework** (Java 5) separates *what* to run (tasks) from *how* it runs (threads, pooling, scheduling):

| Interface | Adds |
|---|---|
| **`Executor`** | `execute(Runnable)`: "run this somehow" |
| **`ExecutorService`** | `submit(Callable/Runnable)` → **`Future`**; `invokeAll`, `invokeAny`; lifecycle: `shutdown`, `shutdownNow`, `awaitTermination`, `close()` (Java 19+) |
| **`ScheduledExecutorService`** | `schedule(task, delay)`, `scheduleAtFixedRate`, `scheduleWithFixedDelay` |

A **thread pool** keeps a set of worker threads and a **work queue**. Tasks are queued, and idle workers take them, so threads are reused and concurrency is bounded.

### Future

`submit` returns a `Future<V>`:
- `get()` waits for the result, and throws **`ExecutionException`** wrapping the task's exception;
- `get(timeout, unit)` waits at most that long (`TimeoutException`);
- `cancel(mayInterrupt)`, `isDone()`, `isCancelled()`;
- `resultNow()` and `state()` (Java 19+).

`execute` returns nothing: exceptions from `execute`d tasks go to the worker thread's uncaught-exception handler. Exceptions from `submit`ted tasks sit **silently** in the `Future` until someone calls `get()`, so a "fire-and-forget" `submit` hides failures.

### What the `Executors` factory methods really create

| Factory | Actually | Watch out |
|---|---|---|
| `newFixedThreadPool(n)` | `ThreadPoolExecutor(n, n, 0, LinkedBlockingQueue())` | **unbounded queue**: overload leads to memory growth and huge latency |
| `newCachedThreadPool()` | `ThreadPoolExecutor(0, MAX_VALUE, 60 s, SynchronousQueue)` | **unbounded threads**: a burst creates thousands |
| `newSingleThreadExecutor()` | a wrapper around a 1-thread pool (sequential, ordered) | unbounded queue |
| `newScheduledThreadPool(n)` | `ScheduledThreadPoolExecutor` with a delay queue | unbounded queue; a task that throws stops being rescheduled |
| `newWorkStealingPool(n)` | a `ForkJoinPool` | daemon threads; not for blocking tasks |
| `newVirtualThreadPerTaskExecutor()` (21) | a new virtual thread per task | not a pool; see virtual threads |

For production services, prefer an explicitly configured **`ThreadPoolExecutor`** with a **bounded queue**, named threads and a deliberate rejection policy (next lesson), or virtual threads for blocking I/O.

### Bulk operations

- **`invokeAll(tasks)`** runs all the tasks and returns their futures **in task order**, once all are done. With a timeout, unfinished tasks are cancelled.
- **`invokeAny(tasks)`** returns the result of **one task that succeeded**, usually the fastest, and cancels the rest. It's useful for redundant requests to replicas.

### Shutdown

Pools hold non-daemon threads, so **an executor you never shut down keeps the JVM alive**. The standard sequence:

```java
pool.shutdown();                                       // stop accepting new tasks; finish queued ones
if (!pool.awaitTermination(30, SECONDS)) {
    pool.shutdownNow();                                // interrupt running tasks, drop the queue
    pool.awaitTermination(10, SECONDS);
}
```

Since Java 19, `ExecutorService` is `AutoCloseable`: `try (var pool = …) { … }` calls `close()`, which shuts down and waits.

## Internal working

- **`ThreadPoolExecutor`** keeps a set of `Worker`s (each wrapping a `Thread`) and a `BlockingQueue<Runnable>`. A worker loops: `task = getTask()` (`queue.take()`, or `poll(keepAlive)` for threads above the core size), then `beforeExecute` → `task.run()` → `afterExecute`. Pool state and worker count are packed into one atomic `ctl` integer.
- **`submit`** wraps the task in a **`FutureTask`** and passes it to `execute`. The `FutureTask` catches every exception from the task and stores it, which is why submitted tasks never reach the uncaught-exception handler.
- **Thread naming and settings** come from the **`ThreadFactory`** (by default `pool-N-thread-M`, non-daemon, normal priority). Custom factories set meaningful names, which are invaluable in thread dumps, plus daemon status and uncaught-exception handlers.
- **`ScheduledThreadPoolExecutor`** uses a `DelayedWorkQueue` (a heap ordered by trigger time):
  - fixed-rate tasks are re-queued for `start + n·period`;
  - fixed-delay tasks for `end of last run + delay`;
  - a periodic task that throws is **not rescheduled**, and the exception is only visible via its `Future`.
- **Happens-before**: actions before submitting a task happen-before the task runs, and the task's actions happen-before `Future.get()` returns. That's why passing data into tasks and reading results needs no extra synchronisation.

## Visual representation

```text title="A thread pool"
   submit(task) --> [ FutureTask ] --> work queue [ t5 | t6 | t7 | ... ]
                                               |       |       |
                                        +------+--+----+--+----+-----+
                                        | worker 1 | worker 2 | worker 3 |   reused threads
                                        +----------+----------+----------+
   future.get()  <---- result or ExecutionException(cause) ------------------+

   shutdown():    no new tasks; queued + running finish      -> TERMINATED
   shutdownNow(): interrupt running, return queued tasks      -> TERMINATED (if tasks respond)

   newFixedThreadPool(4)  = TPE(core 4, max 4, LinkedBlockingQueue unbounded)
   newCachedThreadPool()  = TPE(core 0, max MAX_VALUE, SynchronousQueue, keepAlive 60 s)
```

## Java code example

```java title="ExecutorsDemo.java" file="ExecutorsDemo.java"
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public class ExecutorsDemo {
    static ThreadFactory named(String prefix) {
        AtomicInteger n = new AtomicInteger();
        return task -> {
            Thread t = new Thread(task, prefix + "-" + n.incrementAndGet());
            t.setUncaughtExceptionHandler((th, e) ->
                    System.out.println("uncaught-exception handler of a '" + prefix + "' thread: " + e.getMessage()));
            return t;
        };
    }

    static Callable<String> quote(String name, long ms) {
        return () -> {
            Thread.sleep(ms);
            return name + " (" + ms + " ms)";
        };
    }

    static String describe(ExecutorService e) {
        if (e instanceof ThreadPoolExecutor t) {
            return t.getClass().getSimpleName() + " core=" + t.getCorePoolSize() + " max=" + t.getMaximumPoolSize()
                    + " queue=" + t.getQueue().getClass().getSimpleName() + " keepAlive=" + t.getKeepAliveTime(TimeUnit.SECONDS) + "s";
        }
        return e.getClass().getSimpleName();
    }

    public static void main(String[] args) throws Exception {
        // 1. Executor is just "run this somehow"
        Executor direct = Runnable::run;                       // runs on the caller's thread
        direct.execute(() -> System.out.println("Executor ran task on " + Thread.currentThread().getName()));

        ExecutorService pool = Executors.newFixedThreadPool(3, named("worker"));

        // 2. submit + Future
        Future<Integer> sum = pool.submit(() -> {
            int s = 0;
            for (int i = 1; i <= 1_000; i++) {
                s += i;
            }
            return s;
        });
        System.out.println("Future.get(): " + sum.get());

        // 3. invokeAll keeps task order; invokeAny returns one successful result
        List<Future<String>> all = pool.invokeAll(List.of(quote("slow", 150), quote("fast", 20), quote("medium", 80)));
        StringBuilder results = new StringBuilder();
        for (Future<String> f : all) {
            results.append(f.get()).append("; ");
        }
        System.out.println("invokeAll (task order): " + results);
        System.out.println("invokeAny (first success): " + pool.invokeAny(List.of(quote("slow", 400), quote("fast", 20), quote("medium", 200))));

        // 4. Exceptions: submit stores them in the Future, execute reaches the handler
        Future<?> failing = pool.submit(() -> {
            throw new IllegalStateException("submitted task failed");
        });
        try {
            failing.get();
        } catch (ExecutionException e) {
            System.out.println("submit -> ExecutionException: " + e.getCause().getMessage());
        }
        CountDownLatch handled = new CountDownLatch(1);
        pool.execute(() -> {
            try {
                throw new IllegalStateException("executed task failed");
            } finally {
                handled.countDown();
            }
        });
        handled.await();
        Thread.sleep(100);                                     // let the handler print before we continue

        // 5. Timeouts on get
        Future<String> slow = pool.submit(quote("very slow", 2_000));
        try {
            slow.get(100, TimeUnit.MILLISECONDS);
        } catch (java.util.concurrent.TimeoutException e) {
            System.out.println("get(100 ms) timed out; cancelling: " + slow.cancel(true));
        }

        // 6. What the factory methods create
        for (ExecutorService e : List.of(Executors.newFixedThreadPool(4), Executors.newCachedThreadPool(),
                Executors.newSingleThreadExecutor(), Executors.newScheduledThreadPool(2))) {
            System.out.println("  " + describe(e));
            e.shutdown();
        }

        // 7. Scheduling: one delayed task and a periodic task stopped after 3 runs
        ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(1, named("scheduler"));
        ScheduledFuture<String> later = scheduler.schedule(() -> "delayed result", 50, TimeUnit.MILLISECONDS);
        System.out.println("schedule(50 ms): " + later.get());
        AtomicInteger ticks = new AtomicInteger();
        CountDownLatch threeTicks = new CountDownLatch(3);
        ScheduledFuture<?> heartbeat = scheduler.scheduleAtFixedRate(() -> {
            ticks.incrementAndGet();
            threeTicks.countDown();
        }, 0, 20, TimeUnit.MILLISECONDS);
        threeTicks.await();
        heartbeat.cancel(false);
        System.out.println("periodic task ran at least 3 times, then cancelled: " + heartbeat.isCancelled());

        // 8. Graceful shutdown
        for (ExecutorService e : List.of(pool, scheduler)) {
            e.shutdown();
            if (!e.awaitTermination(5, TimeUnit.SECONDS)) {
                e.shutdownNow();
            }
            System.out.println("terminated: " + e.isTerminated());
        }
    }
}
```

## Output

```text title="Output" output="ExecutorsDemo.java"
Executor ran task on main
Future.get(): 500500
invokeAll (task order): slow (150 ms); fast (20 ms); medium (80 ms); 
invokeAny (first success): fast (20 ms)
submit -> ExecutionException: submitted task failed
uncaught-exception handler of a 'worker' thread: executed task failed
get(100 ms) timed out; cancelling: true
  ThreadPoolExecutor core=4 max=4 queue=LinkedBlockingQueue keepAlive=0s
  ThreadPoolExecutor core=0 max=2147483647 queue=SynchronousQueue keepAlive=60s
  FinalizableDelegatedExecutorService
  ScheduledThreadPoolExecutor core=2 max=2147483647 queue=DelayedWorkQueue keepAlive=0s
schedule(50 ms): delayed result
periodic task ran at least 3 times, then cancelled: true
terminated: true
terminated: true
```

- The trivial `Executor` ran the task on `main`: an executor decides *where* tasks run, not necessarily on another thread.
- `invokeAll` returned the results in **task order**, regardless of which finished first. `invokeAny` returned the fastest success and cancelled the others.
- The `submit`ted failure surfaced only through `get()` (wrapped in `ExecutionException`). The `execute`d failure went straight to the worker's uncaught-exception handler, installed by the named `ThreadFactory`.
- `get(timeout)` plus `cancel(true)` bounded how long the caller waited and freed the worker.
- The factory methods revealed their hidden configuration: an unbounded `LinkedBlockingQueue` for fixed pools, unbounded threads with a `SynchronousQueue` for cached pools.
- A periodic heartbeat was cancelled after it had run three times, and `shutdown` + `awaitTermination` ended the pools cleanly.

## Real-world application

- **Spring's `@Async` and `TaskExecutor`**, servlet containers, Kafka listener containers, `CompletableFuture` stages and gRPC servers all run on configured executors. Naming their threads (`order-async-3`) makes thread dumps readable.
- **Fan-out requests**: `invokeAll` (or `CompletableFuture.allOf`) to call several services in parallel, with a timeout. `invokeAny` for hedged requests to replicas.
- **Scheduled jobs**: cache refreshes, heartbeats, metrics flushes. Wrap the body in `try/catch`, because one exception silently stops a periodic task.
- **Graceful shutdown hooks** (Spring's `@PreDestroy`, `Runtime.addShutdownHook`) call `shutdown`/`awaitTermination` so in-flight work completes during deploys.

## Common mistakes

- **Never shutting down executors**, so the JVM doesn't exit, or threads leak in tests and redeploys.
- **Fire-and-forget `submit`**, which loses exceptions. Log inside the task, use `execute` with a handler, or check the futures.
- **`newFixedThreadPool`/`newSingleThreadExecutor` in servers under load** (unbounded queue → memory and latency blow-up), or **`newCachedThreadPool`** with slow tasks (unbounded threads).
- **Calling `future.get()` without a timeout** on remote calls.
- **Creating a new executor per request** instead of sharing one.
- **Blocking a pool's own threads waiting for its other tasks** (thread-starvation deadlock, see liveness hazards).
- **Unchecked exceptions in scheduled periodic tasks**, which silently end the schedule.

## Interview questions

**Q1. What's the difference between `execute()` and `submit()`?**

````reveal title="Answer"
`execute(Runnable)` (from `Executor`) returns nothing; an exception thrown by the task reaches the worker thread's uncaught-exception handler. `submit(Callable/Runnable)` returns a `Future`; the task is wrapped in a `FutureTask` that captures the result or the exception, so exceptions are only visible when you call `future.get()` (wrapped in `ExecutionException`). Ignoring the future therefore hides failures.
````

**Q2. Why are `Executors.newFixedThreadPool` and `newCachedThreadPool` risky in production?**

````reveal title="Answer"
`newFixedThreadPool` uses an **unbounded** `LinkedBlockingQueue`. When producers outpace the threads, the queue grows without limit: memory pressure, eventually `OutOfMemoryError`, and ever-growing latency, with no back-pressure. `newCachedThreadPool` has an unbounded **maximum thread count** with a `SynchronousQueue`, so a burst of slow tasks creates thousands of threads. Production code should configure a `ThreadPoolExecutor` with a bounded queue and an explicit rejection policy (or use virtual threads for blocking I/O).
````

**Q3. How do you shut down an `ExecutorService` gracefully?**

````reveal title="Answer"
1. Call `shutdown()` (no new tasks; queued and running tasks complete).
2. `awaitTermination(timeout)`.
3. If it doesn't terminate in time, call `shutdownNow()`, which interrupts running tasks and returns the queued ones, then await again.
4. Tasks must respond to interruption for this to work.

Since Java 19, `close()` (try-with-resources) shuts down and waits. Do it in shutdown hooks or lifecycle callbacks.
````

**Q4. `invokeAll` vs `invokeAny`?**

````reveal title="Answer"
`invokeAll` executes all the tasks and returns a list of completed futures in the same order as the tasks, after all have completed (or after the timeout, cancelling the unfinished ones). `invokeAny` returns the result of one task that completed successfully, normally the first, and cancels the rest. It throws `ExecutionException` only if all fail.
````

**Q5. `scheduleAtFixedRate` vs `scheduleWithFixedDelay`?**

````reveal title="Answer"
Fixed rate schedules executions at `initialDelay + n × period`, measured from start times. If a run takes longer than the period, the next starts late but runs aren't concurrent. Fixed delay waits `delay` after each run *ends* before starting the next. Use fixed rate for clock-aligned work (metrics every 10 s) and fixed delay for "pause between attempts" (polling). In both, an uncaught exception cancels further executions.
````

## Hands-on exercise

Fetch prices from four suppliers in parallel, with an overall deadline:
- each supplier is a `Callable<String>` that sleeps a different time (40, 90, 60 and 3,000 ms) and returns `"supplier: price"`;
- use `invokeAll(tasks, 500, MILLISECONDS)` on a fixed pool of 4 named threads;
- for each future, print the price, or `"timed out"` if it was cancelled;
- report how many suppliers answered and the cheapest price among them;
- shut the pool down gracefully.

````hint title="Hint"
After a timed `invokeAll`, every future is done: finished futures give a value; unfinished ones are **cancelled** (`isCancelled()` is true, and `get()` would throw `CancellationException`). Parse the price from `"name: 12.50"` with `split(": ")`.
````

````solution title="Solution"
```java title="PriceFanOut.java" file="PriceFanOut.java"
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public class PriceFanOut {
    record Supplier(String name, long latencyMs, double price) { }

    public static void main(String[] args) throws Exception {
        List<Supplier> suppliers = List.of(
                new Supplier("acme", 40, 12.50), new Supplier("globex", 90, 11.75),
                new Supplier("initech", 60, 13.10), new Supplier("umbrella", 3_000, 9.99));
        AtomicInteger n = new AtomicInteger();
        ExecutorService pool = Executors.newFixedThreadPool(4, r -> new Thread(r, "price-" + n.incrementAndGet()));

        List<Callable<String>> tasks = new ArrayList<>();
        for (Supplier s : suppliers) {
            tasks.add(() -> {
                Thread.sleep(s.latencyMs());                   // simulated remote call
                return s.name() + ": " + s.price();
            });
        }

        List<Future<String>> futures = pool.invokeAll(tasks, 500, TimeUnit.MILLISECONDS);
        double cheapest = Double.MAX_VALUE;
        int answered = 0;
        for (int i = 0; i < futures.size(); i++) {
            Future<String> f = futures.get(i);
            if (f.isCancelled()) {
                System.out.println(suppliers.get(i).name() + " -> timed out");
                continue;
            }
            String quote = f.get();
            answered++;
            cheapest = Math.min(cheapest, Double.parseDouble(quote.split(": ")[1]));
            System.out.println(quote);
        }
        System.out.println(answered + " of " + suppliers.size() + " suppliers answered within 500 ms; cheapest " + cheapest);

        pool.shutdown();
        if (!pool.awaitTermination(2, TimeUnit.SECONDS)) {
            pool.shutdownNow();
        }
        System.out.println("pool terminated: " + pool.isTerminated());
    }
}
```

```text title="Output" output="PriceFanOut.java"
acme: 12.5
globex: 11.75
initech: 13.1
umbrella -> timed out
3 of 4 suppliers answered within 500 ms; cheapest 11.75
pool terminated: true
```

The overall latency was bounded by the 500 ms deadline, not by the slowest supplier. The timed-out task was cancelled with an interrupt, which ended its `sleep` so the pool could shut down promptly. The suspiciously cheap supplier was too slow to count, which is often the right trade-off for an interactive page.
````

## Knowledge check

```quiz
? What does future.get() throw if the task threw an exception?
+ ExecutionException wrapping the original exception
- The original exception directly
- Nothing; it returns null
> Use getCause() to see what the task threw.

? What queue does Executors.newFixedThreadPool(n) use?
+ An unbounded LinkedBlockingQueue
- A SynchronousQueue
- An ArrayBlockingQueue of size n
> Unbounded queues give no back-pressure.

? Why might a program never exit after main returns?
+ An ExecutorService with non-daemon threads was never shut down
- The garbage collector is still running
- System.out wasn't flushed
> Pool threads keep the JVM alive.

? In what order does invokeAll return its futures?
+ The same order as the submitted tasks
- In completion order
- Random order
> Use a CompletionService if you want completion order.

? A periodic task scheduled with scheduleAtFixedRate throws an exception once. What happens?
+ It is not run again
- It is retried immediately
- The scheduler thread dies and is replaced, and the task continues
> Catch exceptions inside periodic tasks.
```

## Key takeaways

- Executors separate **tasks** from **threads**. `ExecutorService.submit` returns a **`Future`**; `invokeAll` (task order) and `invokeAny` (first success) run task collections.
- **`execute`** sends exceptions to the uncaught handler; **`submit`** hides them in the future until `get()`, which throws `ExecutionException`.
- The `Executors` factories hide **unbounded queues** (fixed, single) or **unbounded threads** (cached). Configure `ThreadPoolExecutor` explicitly in production.
- Name threads with a `ThreadFactory`, use timeouts on `get`, and catch exceptions in scheduled tasks.
- Always **shut down**: `shutdown` → `awaitTermination` → `shutdownNow` (or `close()` on Java 19+).
