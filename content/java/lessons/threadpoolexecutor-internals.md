## Concept explanation

### The constructor, parameter by parameter

```java
new ThreadPoolExecutor(
        corePoolSize,      // threads kept alive even when idle
        maximumPoolSize,   // upper limit on threads
        keepAliveTime, unit,   // how long threads above core may sit idle before dying
        workQueue,         // where tasks wait when the core threads are busy
        threadFactory,     // how threads are created (names, daemon flag, handlers)
        rejectionHandler); // what happens when the pool can't accept a task
```

### The submission algorithm (the part almost everyone gets wrong)

When you call `execute(task)`:

1. If fewer than **`corePoolSize`** threads are running, **start a new thread** for this task, even if other core threads are idle.
2. Otherwise, try to **queue** the task.
3. If the queue is **full**, start a new thread, as long as there are fewer than **`maximumPoolSize`** threads.
4. Otherwise, **reject** the task.

So **threads beyond the core size are created only when the queue is full**. Consequences:
- With an **unbounded queue** (`newFixedThreadPool`), step 3 never happens: `maximumPoolSize` is ignored and tasks queue forever.
- With a **`SynchronousQueue`** (zero capacity, used by `newCachedThreadPool`), every task beyond the busy threads gets a new thread immediately, up to the maximum.
- With a **bounded queue**, the pool grows past its core size only under real overload, and then rejects.

### Work queues

| Queue | Behaviour |
|---|---|
| `ArrayBlockingQueue(n)` | bounded FIFO, which gives back-pressure. **The usual production choice.** |
| `LinkedBlockingQueue()` | unbounded unless given a capacity |
| `SynchronousQueue` | hand-off; no storage |
| `PriorityBlockingQueue` | ordered by priority; unbounded |

### Rejection policies

| Policy | On rejection | Use when |
|---|---|---|
| `AbortPolicy` (the default) | throws `RejectedExecutionException` | the caller must know and react (return 503, retry later) |
| **`CallerRunsPolicy`** | runs the task **on the submitting thread** | natural **back-pressure**: the producer slows down because it's busy running work |
| `DiscardPolicy` | silently drops the task | rarely appropriate (best-effort metrics, for example) |
| `DiscardOldestPolicy` | drops the **oldest queued** task, then retries | only the newest data matters (status updates) |
| custom `RejectedExecutionHandler` | anything: dead-letter queue, metrics, fallback | most explicit option for important work |

### Sizing

- **CPU-bound** work: about **number of cores** (+1). More threads just add context switches.
- **I/O-bound** work, from *Java Concurrency in Practice*: **threads ≈ cores × target CPU utilisation × (1 + wait time / compute time)**. With 8 cores, 80% target utilisation and tasks that wait 9× longer than they compute: 8 × 0.8 × 10 = 64 threads.
- **Little's law** for capacity: in-flight work = arrival rate × time in system. At 200 requests/s and 0.25 s per request, about 50 requests are in flight, so a pool of 50 (or a queue that absorbs bursts) is needed.
- **Downstream limits** cap everything: a pool of 200 threads calling a database with a 20-connection pool just moves the queue to the connection pool.

Then measure: pool size, active count, queue depth, rejection count and task latency, and adjust. For mostly blocking I/O on Java 21+, virtual threads often replace this calculation entirely (with a semaphore to protect downstream limits).

## Internal working

- **`ctl`**: one `AtomicInteger` packs the **run state** (RUNNING, SHUTDOWN, STOP, TIDYING, TERMINATED) in its high 3 bits and the **worker count** in the low 29 bits. Both change atomically together, avoiding races between "add a worker" and "shut down".
- **`execute`** follows the four steps with re-checks:
  - after queueing, if the pool shut down meanwhile, remove and reject the task;
  - if the worker count is 0 (all core threads timed out), start one.
- **Workers**: each `Worker` is an AQS-based non-reentrant lock wrapping a thread. It holds the lock while running a task, which lets `shutdown()` interrupt only *idle* workers (those whose lock it can take).
- **`getTask()`**:
  - core threads call `queue.take()` and wait forever;
  - threads above core (or all threads with `allowCoreThreadTimeOut(true)`) call `poll(keepAliveTime)`; returning `null` makes the worker exit, which is how the pool shrinks.
- **Exceptions in tasks** run through `afterExecute(task, throwable)`. For `execute`d tasks, the worker thread then dies and is **replaced**. `submit`ted tasks never throw out of `FutureTask.run`.
- **Hooks**: override `beforeExecute`, `afterExecute` and `terminated` for timing, metrics, MDC context, or logging failures of `submit`ted tasks (inspect the `Future` in `afterExecute`).
- **Monitoring getters**: `getPoolSize`, `getActiveCount`, `getLargestPoolSize`, `getQueue().size()`, `getCompletedTaskCount`, `getTaskCount`. Micrometer's `ExecutorServiceMetrics` exposes them.

## Visual representation

```text title="What happens to the Nth task (core 2, max 4, queue capacity 2)"
  task 1 -> threads 0 < core 2       -> NEW core thread         [T1]           queue []
  task 2 -> threads 1 < core 2       -> NEW core thread         [T1 T2]        queue []
  task 3 -> core full, queue has room -> QUEUED                  [T1 T2]        queue [3]
  task 4 -> core full, queue has room -> QUEUED                  [T1 T2]        queue [3 4]
  task 5 -> queue FULL, threads < max -> NEW extra thread        [T1 T2 T3]     queue [3 4]
  task 6 -> queue FULL, threads < max -> NEW extra thread        [T1 T2 T3 T4]  queue [3 4]
  task 7 -> queue FULL, threads = max -> REJECTED (policy)
  later: extra threads idle for keepAliveTime -> exit -> back to 2 core threads

  unbounded queue: step 3 never fails -> pool never grows past core; max is ignored
```

## Java code example

```java title="TpeInternals.java" file="TpeInternals.java"
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.RejectedExecutionHandler;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

public class TpeInternals {
    static void await(CountDownLatch latch) {
        try {
            latch.await();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    // A pool with hooks: counts tasks, failures and total task time
    static final class InstrumentedPool extends ThreadPoolExecutor {
        final AtomicInteger completed = new AtomicInteger();
        final AtomicInteger failed = new AtomicInteger();
        final AtomicLong nanos = new AtomicLong();
        private final ThreadLocal<Long> start = new ThreadLocal<>();

        InstrumentedPool() {
            super(2, 2, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(10));
        }

        @Override
        protected void beforeExecute(Thread t, Runnable r) {
            start.set(System.nanoTime());
        }

        @Override
        protected void afterExecute(Runnable r, Throwable t) {
            nanos.addAndGet(System.nanoTime() - start.get());
            start.remove();
            if (t == null) {
                completed.incrementAndGet();
            } else {
                failed.incrementAndGet();
            }
        }
    }

    public static void main(String[] args) throws Exception {
        // 1. Trace the submission algorithm with tasks that block until released
        CountDownLatch release = new CountDownLatch(1);
        ThreadPoolExecutor pool = new ThreadPoolExecutor(2, 4, 200, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(2));
        for (int i = 1; i <= 7; i++) {
            int before = pool.getPoolSize();
            try {
                pool.execute(() -> await(release));
                String what = pool.getPoolSize() > before
                        ? (before < pool.getCorePoolSize() ? "new core thread" : "new extra thread (queue full)")
                        : "queued";
                System.out.printf("task %d -> %-30s threads=%d queue=%d%n", i, what, pool.getPoolSize(), pool.getQueue().size());
            } catch (RejectedExecutionException e) {
                System.out.printf("task %d -> rejected (threads at max, queue full)%n", i);
            }
        }
        release.countDown();
        while (pool.getPoolSize() > pool.getCorePoolSize()) {
            Thread.sleep(20);
        }
        System.out.println("after keep-alive the pool shrank back to " + pool.getPoolSize() + " threads; largest was " + pool.getLargestPoolSize());
        pool.shutdown();

        // 2. The four built-in rejection policies (1 thread, queue of 1, worker blocked)
        List<RejectedExecutionHandler> policies = List.of(new ThreadPoolExecutor.AbortPolicy(),
                new ThreadPoolExecutor.CallerRunsPolicy(), new ThreadPoolExecutor.DiscardPolicy(),
                new ThreadPoolExecutor.DiscardOldestPolicy());
        for (RejectedExecutionHandler policy : policies) {
            List<String> ran = new CopyOnWriteArrayList<>();
            CountDownLatch go = new CountDownLatch(1);
            ThreadPoolExecutor tiny = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(1), policy);
            String outcome = "";
            for (int i = 1; i <= 3; i++) {
                int id = i;
                try {
                    tiny.execute(() -> {
                        if (id == 1) {
                            await(go);                         // task 1 occupies the only thread
                        }
                        ran.add(id + (Thread.currentThread().getName().equals("main") ? "@main" : ""));
                    });
                } catch (RejectedExecutionException e) {
                    outcome = "task " + id + " threw RejectedExecutionException";
                }
            }
            go.countDown();
            tiny.shutdown();
            tiny.awaitTermination(5, TimeUnit.SECONDS);
            System.out.println(String.format("%-20s ran %-12s %s", policy.getClass().getSimpleName(),
                    ran.stream().sorted().toList(), outcome).stripTrailing());
        }

        // 3. Hooks for monitoring
        InstrumentedPool instrumented = new InstrumentedPool();
        for (int i = 0; i < 6; i++) {
            int id = i;
            instrumented.execute(() -> {
                if (id == 3) {
                    throw new IllegalStateException("task 3 failed");
                }
            });
        }
        instrumented.shutdown();
        instrumented.awaitTermination(5, TimeUnit.SECONDS);
        System.out.println("hooks: completed " + instrumented.completed.get() + ", failed " + instrumented.failed.get()
                + ", timed every task: " + (instrumented.nanos.get() > 0));

        // 4. Sizing arithmetic
        int cores = 8;
        double utilisation = 0.8;
        double waitToCompute = 9.0;
        System.out.printf("I/O-bound sizing: %d cores x %.1f x (1 + %.0f) = %.0f threads; CPU-bound: about %d%n",
                cores, utilisation, waitToCompute, cores * utilisation * (1 + waitToCompute), cores);
    }
}
```

## Output

```text title="Output" output="TpeInternals.java"
task 1 -> new core thread                threads=1 queue=0
task 2 -> new core thread                threads=2 queue=0
task 3 -> queued                         threads=2 queue=1
task 4 -> queued                         threads=2 queue=2
task 5 -> new extra thread (queue full)  threads=3 queue=2
task 6 -> new extra thread (queue full)  threads=4 queue=2
task 7 -> rejected (threads at max, queue full)
after keep-alive the pool shrank back to 2 threads; largest was 4
AbortPolicy          ran [1, 2]       task 3 threw RejectedExecutionException
CallerRunsPolicy     ran [1, 2, 3@main]
DiscardPolicy        ran [1, 2]
DiscardOldestPolicy  ran [1, 3]
hooks: completed 5, failed 1, timed every task: true
I/O-bound sizing: 8 cores x 0.8 x (1 + 9) = 64 threads; CPU-bound: about 8
```

- Tasks 1–2 got **core threads**, tasks 3–4 were **queued**, and only when the queue was full did tasks 5–6 get **extra threads**. Task 7 was **rejected**.
- After the tasks finished, the two extra threads idled past the 200 ms keep-alive and exited.
- With the worker blocked and the single queue slot taken, task 3 was handled differently by each policy:
  - `AbortPolicy` threw;
  - `CallerRunsPolicy` ran it **on `main`** (back-pressure on the submitter);
  - `DiscardPolicy` dropped it silently;
  - `DiscardOldestPolicy` dropped the queued task 2 and ran 3 instead.
- The hooks counted one failure out of six tasks without touching the task code. The failing worker thread was replaced automatically.

## Real-world application

- **Request handling with explicit overload behaviour**: a bounded queue with `AbortPolicy`, mapped to HTTP 503 + `Retry-After`, sheds load gracefully instead of collapsing.
- **Batch ingestion with `CallerRunsPolicy`**: when workers fall behind, the reader thread processes a record itself, naturally slowing intake. Spring's `ThreadPoolTaskExecutor` supports it directly.
- **Bulkheads**: separate pools for slow and fast dependencies (payments vs recommendations), so one slow downstream can't consume all threads.
- **Observability**: export active count, queue size, rejected count and task timing, and alert on sustained queue growth or any rejections.
- **Tomcat's connector executor** is a `ThreadPoolExecutor` subclass whose queue pretends to be full, so the pool grows to its maximum *before* queueing: a deliberate tweak of the algorithm above.

## Common mistakes

- **Expecting `maximumPoolSize` to matter with an unbounded queue.**
- **Setting `corePoolSize` 1 and a big maximum with an unbounded queue**, which effectively gives a single thread.
- **Unbounded queues in front of slow work**: memory grows, latency explodes, no back-pressure.
- **`DiscardPolicy` for important work**: data disappears silently.
- **One shared pool for everything**: one slow dependency starves all the other work.
- **Sizing by guesswork** (200 threads "to be safe") without considering cores, wait ratios and downstream limits.
- **Forgetting that `execute`d task exceptions kill and replace the worker**, and that `submit`ted ones are swallowed unless you check the future (or use `afterExecute`).

## Interview questions

**Q1. Explain how `ThreadPoolExecutor` decides what to do with a new task.**

````reveal title="Answer"
1. If fewer than `corePoolSize` threads exist, it starts a new thread to run the task.
2. Otherwise it offers the task to the work queue.
3. If the queue rejects it (because it's full), it starts a new thread, as long as the count is below `maximumPoolSize`.
4. Otherwise the task is rejected through the `RejectedExecutionHandler`.

Threads above core time out after `keepAliveTime`. The key subtlety: extra threads are only created when the queue is full, so an unbounded queue means the pool never exceeds its core size.
````

**Q2. What rejection policies exist, and which would you choose?**

````reveal title="Answer"
- `AbortPolicy` (default): throws `RejectedExecutionException`.
- `CallerRunsPolicy`: runs the task in the submitting thread, which throttles producers.
- `DiscardPolicy`: drops the task silently.
- `DiscardOldestPolicy`: drops the oldest queued task and retries.
- Custom handlers: dead-letter queues, metrics, fallbacks.

For request handling, abort and translate it into a "busy" response. For pipelines needing back-pressure, `CallerRunsPolicy`. Discarding only when losing work is genuinely acceptable.
````

**Q3. How do you size a thread pool?**

````reveal title="Answer"
- **CPU-bound**: about the number of cores.
- **I/O-bound**: cores × target utilisation × (1 + wait/compute), for example 8 × 0.8 × (1 + 9) = 64.
- **Capacity checks**: Little's law (concurrency = throughput × latency), and the downstream limits (DB connection pool, API rate limits), which cap useful concurrency.

Start there, measure (queue depth, active threads, latency, CPU), and tune. For blocking I/O on Java 21+, consider virtual threads with explicit concurrency limits.
````

**Q4. What happens if a task submitted with `execute()` throws an exception?**

````reveal title="Answer"
The exception propagates out of the worker's run loop: `afterExecute(task, throwable)` is called, then the worker thread terminates (the uncaught-exception handler prints it) and the pool **replaces** it with a new thread. For `submit()`, the `FutureTask` captures the exception, so the worker survives and the exception only appears when someone calls `get()`.
````

**Q5. What does `allowCoreThreadTimeOut(true)` do?**

````reveal title="Answer"
It applies `keepAliveTime` to core threads too: idle core threads exit, so an idle pool can shrink to zero threads. That's useful for pools that are rarely used (saving memory and threads), at the cost of thread-creation latency on the next burst. The opposite is `prestartAllCoreThreads()`, which creates all core threads up front to avoid first-request latency.
````

## Hands-on exercise

Write a custom **dead-letter** `RejectedExecutionHandler` that records rejected tasks instead of losing or throwing them:
- tasks are `record Job(int id) implements Runnable`;
- the handler casts the rejected `Runnable` to `Job` and adds its id to a `CopyOnWriteArrayList<Integer>` dead-letter list;
- use a pool with core 1, max 2 and `ArrayBlockingQueue(2)`, whose tasks block on a latch;
- submit jobs 1–6 and show which ran, which were rejected into the dead-letter list, and that every job is accounted for.

````hint title="Hint"
With core 1, max 2 and a queue of 2: job 1 gets a core thread, jobs 2–3 are queued, job 4 gets the extra thread, and jobs 5–6 are rejected. In the handler: `if (r instanceof Job job) deadLetters.add(job.id());`. Record ran jobs in another thread-safe list, release the latch, shut down and await termination, then print both lists sorted.
````

````solution title="Solution"
```java title="DeadLetterPool.java" file="DeadLetterPool.java"
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.RejectedExecutionHandler;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

public class DeadLetterPool {
    static final List<Integer> RAN = new CopyOnWriteArrayList<>();
    static final CountDownLatch RELEASE = new CountDownLatch(1);

    record Job(int id) implements Runnable {
        @Override
        public void run() {
            try {
                RELEASE.await();                                  // simulate slow work
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            RAN.add(id);
        }
    }

    public static void main(String[] args) throws InterruptedException {
        List<Integer> deadLetters = new CopyOnWriteArrayList<>();
        RejectedExecutionHandler toDeadLetters = (task, executor) -> {
            if (task instanceof Job job) {
                deadLetters.add(job.id());                        // keep it for a retry or an alert
            }
        };
        ThreadPoolExecutor pool = new ThreadPoolExecutor(1, 2, 1, TimeUnit.SECONDS,
                new ArrayBlockingQueue<>(2), toDeadLetters);

        for (int id = 1; id <= 6; id++) {
            pool.execute(new Job(id));
        }
        System.out.println("while blocked: threads=" + pool.getPoolSize() + ", queued=" + pool.getQueue().size()
                + ", dead letters=" + deadLetters);
        RELEASE.countDown();
        pool.shutdown();
        pool.awaitTermination(5, TimeUnit.SECONDS);
        List<Integer> ran = RAN.stream().sorted().toList();
        System.out.println("ran: " + ran + ", dead letters: " + deadLetters);
        System.out.println("every job accounted for: " + (ran.size() + deadLetters.size() == 6));
    }
}
```

```text title="Output" output="DeadLetterPool.java"
while blocked: threads=2, queued=2, dead letters=[5, 6]
ran: [1, 2, 3, 4], dead letters: [5, 6]
every job accounted for: true
```

The pool used both threads and both queue slots before rejecting anything, exactly as the algorithm predicts, and the rejected jobs were preserved instead of thrown away or silently dropped. In a real system the handler would publish them to a durable retry queue and increment a metric.
````

## Knowledge check

```quiz
? A ThreadPoolExecutor has core 2, max 10 and an unbounded LinkedBlockingQueue. 50 slow tasks arrive. How many threads run them?
+ 2
- 10
- 50
> Extra threads are created only when the queue is full, and an unbounded queue never is.

? In what order does execute() try its options?
+ New core thread, then queue, then new extra thread, then reject
- Queue, then new core thread, then reject
- New thread up to max, then queue, then reject
> Core first; the queue before extra threads.

? Which rejection policy slows producers down by making them run the task?
+ CallerRunsPolicy
- DiscardOldestPolicy
- AbortPolicy
> The submitting thread is busy running the task, so it can't submit more.

? What is a reasonable pool size for CPU-bound tasks on 8 cores?
+ About 8 (or 9)
- 64
- 200
> More threads than cores only adds context switching for CPU-bound work.

? What happens to the worker thread when an execute()'d task throws?
+ It terminates, and the pool creates a replacement
- It keeps running the next task
- The whole pool shuts down
> submit()'d tasks capture the exception instead.
```

## Key takeaways

- `ThreadPoolExecutor` = core size, max size, keep-alive, **work queue**, thread factory, **rejection handler**.
- **Submission order**: core thread → **queue** → extra thread (only when the queue is full) → reject. Unbounded queues make the max size meaningless.
- Use **bounded queues** and a **deliberate rejection policy**: abort (signal overload), **caller-runs** (back-pressure), or a custom dead-letter handler. Avoid silent discards.
- Size CPU-bound pools at about the core count; I/O-bound pools by **cores × utilisation × (1 + W/C)**, capped by downstream limits. Then measure.
- Use **hooks** (`beforeExecute`/`afterExecute`) and pool metrics for observability; keep separate pools as bulkheads.
