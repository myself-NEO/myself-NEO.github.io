## The problem: handing off work between threads

Correctness is about threads **not interfering** with each other. Coordination is the opposite: threads that **depend** on each other. The canonical shape is **producer–consumer**:

```text
 producers ──put──▶ [ bounded queue ] ──take──▶ consumers
   (requests,         capacity = N            (workers, background
    events, jobs)                              senders, writers)
```

Two kinds of waiting must happen, and both must be efficient:

1. **Queue empty** → consumers must wait until work arrives, **without burning CPU**.
2. **Queue full** → producers must slow down or stop (**backpressure**), instead of growing memory without limit.

And three more things must hold: no **lost wake-ups** (a waiting thread must notice new work), no **lost work** (tasks aren't dropped by accident), and a **clean shutdown** (workers stop when told, after or instead of draining).

You'll meet this shape in an [async logger](problem:logging-framework), a [task scheduler](problem:task-scheduler), [pub/sub](problem:pub-sub), notification retries and request pipelines.

## Anti-pattern: busy-waiting

```java title="Don't do this"
while (queue.isEmpty()) { }                    // spins one CPU core at 100% while waiting
Task t = queue.poll();                         // and it's a check-then-act race anyway

while (queue.isEmpty()) Thread.sleep(10);      // "fixed": now adds up to 10ms latency, still polls, still racy
```

Busy-waiting wastes CPU that other threads need, and sleep-polling trades CPU for latency without fixing the race. The right tool makes the waiting thread **block**: the OS parks it, it uses no CPU, and it wakes up **when signalled** that something changed.

## Level 1: guarded blocks with `wait` / `notifyAll`

Every Java object has a monitor with a **wait set**. Inside a `synchronized` block on that object:

- `wait()` atomically **releases the lock and parks** the thread until it's notified (or interrupted). On wake-up it re-acquires the lock before returning.
- `notifyAll()` wakes **all** threads waiting on that monitor; `notify()` wakes one arbitrary thread.

The rules that make it correct:

1. **Always wait in a `while` loop that re-checks the condition** — never an `if`. Wake-ups can be spurious, and another thread may have consumed the item between the notify and your wake-up.
2. **Hold the monitor** when calling `wait`/`notify` (otherwise `IllegalMonitorStateException`).
3. **Prefer `notifyAll()`** when different kinds of waiters (producers *and* consumers) share one monitor; `notify()` can wake the wrong kind and leave everyone asleep.

## Level 2: `ReentrantLock` with two `Condition`s

A `Condition` is a separate wait set attached to a lock. With **`notFull`** and **`notEmpty`**, producers and consumers wait in different sets, so each signal wakes only threads that can make progress. Conditions also support **timed** (`awaitNanos`) and **interruptible** waits — essential for "wait at most 50ms, then give up".

```java title="Bounded buffers built from scratch (monitor and Condition versions)" file="BoundedBufferDemo.java"
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;

public class BoundedBufferDemo {
    static final int PRODUCERS = 3, CONSUMERS = 2, ITEMS_PER_PRODUCER = 1_000, CAPACITY = 8;

    public static void main(String[] args) throws InterruptedException {
        run("monitor (wait/notifyAll)", new MonitorBuffer<>(CAPACITY));
        run("lock + 2 conditions", new ConditionBuffer<>(CAPACITY));

        ConditionBuffer<Integer> full = new ConditionBuffer<>(1);
        full.put(42);
        boolean accepted = full.offer(43, 50, TimeUnit.MILLISECONDS);   // nobody is consuming
        System.out.println("timed offer on a full buffer gave up: " + !accepted);
    }

    static void run(String name, Buffer<Integer> buffer) throws InterruptedException {
        AtomicLong sum = new AtomicLong();
        AtomicLong count = new AtomicLong();
        List<Thread> threads = new ArrayList<>();
        for (int c = 0; c < CONSUMERS; c++) {
            threads.add(new Thread(() -> {
                try {
                    while (true) {
                        int item = buffer.take();
                        if (item < 0) return;                          // poison pill
                        sum.addAndGet(item);
                        count.incrementAndGet();
                    }
                } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            }));
        }
        List<Thread> producers = new ArrayList<>();
        for (int p = 0; p < PRODUCERS; p++) {
            producers.add(new Thread(() -> {
                try {
                    for (int i = 1; i <= ITEMS_PER_PRODUCER; i++) buffer.put(i);   // blocks when full
                } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            }));
        }
        threads.forEach(Thread::start);
        producers.forEach(Thread::start);
        for (Thread p : producers) p.join();
        for (int c = 0; c < CONSUMERS; c++) buffer.put(-1);      // one pill per consumer, after all real items
        for (Thread t : threads) t.join();

        System.out.println(name + ": consumed " + count.get() + " items, sum " + sum.get()
                + ", size never exceeded capacity: " + (buffer.maxSizeSeen() <= CAPACITY));
    }
}

interface Buffer<T> {
    void put(T item) throws InterruptedException;
    T take() throws InterruptedException;
    int maxSizeSeen();
}

/** Level 1: one monitor, one wait set shared by producers and consumers. */
final class MonitorBuffer<T> implements Buffer<T> {
    private final Deque<T> items = new ArrayDeque<>();
    private final int capacity;
    private int maxSeen;

    MonitorBuffer(int capacity) { this.capacity = capacity; }

    public synchronized void put(T item) throws InterruptedException {
        while (items.size() == capacity) wait();     // WHILE, not if
        items.addLast(item);
        maxSeen = Math.max(maxSeen, items.size());
        notifyAll();                                 // wake consumers (and possibly producers, who re-check)
    }

    public synchronized T take() throws InterruptedException {
        while (items.isEmpty()) wait();
        T item = items.removeFirst();
        notifyAll();                                 // a slot freed up: wake producers
        return item;
    }

    public synchronized int maxSizeSeen() { return maxSeen; }
}

/** Level 2: separate wait sets, so each signal wakes only threads that can proceed. */
final class ConditionBuffer<T> implements Buffer<T> {
    private final Deque<T> items = new ArrayDeque<>();
    private final int capacity;
    private final ReentrantLock lock = new ReentrantLock();
    private final Condition notFull = lock.newCondition();
    private final Condition notEmpty = lock.newCondition();
    private int maxSeen;

    ConditionBuffer(int capacity) { this.capacity = capacity; }

    public void put(T item) throws InterruptedException {
        lock.lock();
        try {
            while (items.size() == capacity) notFull.await();
            enqueue(item);
        } finally {
            lock.unlock();
        }
    }

    /** Bounded wait: returns false if no space appeared within the timeout. */
    boolean offer(T item, long timeout, TimeUnit unit) throws InterruptedException {
        long nanos = unit.toNanos(timeout);
        lock.lock();
        try {
            while (items.size() == capacity) {
                if (nanos <= 0) return false;
                nanos = notFull.awaitNanos(nanos);   // returns the remaining time
            }
            enqueue(item);
            return true;
        } finally {
            lock.unlock();
        }
    }

    public T take() throws InterruptedException {
        lock.lock();
        try {
            while (items.isEmpty()) notEmpty.await();
            T item = items.removeFirst();
            notFull.signal();                        // exactly one producer can use the freed slot
            return item;
        } finally {
            lock.unlock();
        }
    }

    private void enqueue(T item) {
        items.addLast(item);
        maxSeen = Math.max(maxSeen, items.size());
        notEmpty.signal();                           // exactly one consumer can take it
    }

    public int maxSizeSeen() {
        lock.lock();
        try { return maxSeen; } finally { lock.unlock(); }
    }
}
```

Both versions consume exactly 3,000 items with a sum of 3 × 500,500 = 1,501,500, and the buffer never holds more than its capacity: producers simply **block** when it's full. You'll rarely write these by hand in production — but interviewers do ask, and understanding them makes the library classes obvious.

## Level 3: use `java.util.concurrent`

In real code, use a `BlockingQueue`. It's exactly the `ConditionBuffer` above, written and tested by experts.

| Queue | Bounded? | Use for |
|---|---|---|
| `ArrayBlockingQueue` | Yes (fixed) | The default producer–consumer buffer |
| `LinkedBlockingQueue` | Optional — **unbounded by default** | Bounded hand-off with separate head and tail locks (pass a capacity!) |
| `SynchronousQueue` | Capacity 0 | Direct hand-off: `put` waits until a consumer `take`s |
| `PriorityBlockingQueue` | Unbounded | Consumers always take the highest-priority item |
| `DelayQueue` | Unbounded | Items become available only after their delay — the core of a scheduler |
| `LinkedTransferQueue` | Unbounded | Producers can optionally wait for a consumer (`transfer`) |

| Method pair | When full / empty | Use when |
|---|---|---|
| `put` / `take` | Block indefinitely | Background workers; producers that must not lose work |
| `offer(e, timeout)` / `poll(timeout)` | Block up to a timeout | Request paths that must not hang; periodic housekeeping |
| `offer(e)` / `poll()` | Return `false` / `null` immediately | Load shedding; optional work |
| `add` / `remove` | Throw | Rarely — when full or empty is a bug |

## Backpressure: when consumers are slower than producers

If producers outpace consumers for long enough, *something* has to give. Choose deliberately:

| Strategy | How | Trade-off |
|---|---|---|
| **Block the producer** | Bounded queue + `put` | Upstream slows down; never loses work; can stall request threads |
| **Time out and fail** | `offer(e, timeout)`, then reject upstream (HTTP 429/503) | Bounded latency; caller must retry |
| **Drop** | `offer(e)` returns false → drop newest or oldest, count drops | Fine for metrics or debug logs; never for payments |
| **Caller runs** | The executor's `CallerRunsPolicy` makes the submitting thread do the work | Natural throttling of the producer |
| **Unbounded queue** | `new LinkedBlockingQueue<>()` | Hides the problem until memory runs out ❌ |

> [!WARNING] `Executors.newFixedThreadPool(n)` uses an unbounded queue
> Its `LinkedBlockingQueue` has no capacity limit, so under sustained overload it buffers tasks until the JVM runs out of memory. Build a `ThreadPoolExecutor` with a bounded queue and an explicit rejection policy instead — see [Scarcity](lesson:scarcity).

## Clean shutdown

Consumers block in `take()`, so they won't notice "we're done" unless you tell them:

- **Poison pill:** enqueue a special sentinel, one per consumer, *after* all real work. Consumers finish the backlog, see the pill and exit. Simple and orderly (used in both demos on this page).
- **Interruption:** `thread.interrupt()` / `executor.shutdownNow()` makes `take()` throw `InterruptedException`. Faster, but the backlog may be abandoned; decide whether to drain it first.
- **Never swallow `InterruptedException`.** Either propagate it or restore the flag with `Thread.currentThread().interrupt()`, so code higher up knows the thread was asked to stop.

See [Resource Lifecycle](lesson:resource-lifecycle) for executor shutdown patterns.

## One-shot and phased coordination

Not every hand-off is a stream of tasks:

| Tool | Coordinates | Example |
|---|---|---|
| `CountDownLatch(n)` | Wait until **n events** have happened (one-shot) | Start all test threads at once; wait for 3 services to warm up |
| `CyclicBarrier(n)` / `Phaser` | **n threads meet** at a barrier, phase after phase | Simulation steps; parallel phases of a batch job |
| `CompletableFuture<T>` | Hand off **one result**; compose async steps | Fetch 3 price quotes in parallel and pick the cheapest |
| `ExecutorService` | A ready-made producer–consumer: a work queue + worker threads | Almost all background processing |

```java title="A pipeline with an executor, a latch and futures" file="PipelineDemo.java"
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class PipelineDemo {
    private static final String POISON = "<<stop>>";

    public static void main(String[] args) throws Exception {
        List<String> lines = List.of("the cat sat", "the dog sat", "a cat ran", "the end");
        BlockingQueue<String> queue = new ArrayBlockingQueue<>(2);       // tiny on purpose: forces backpressure
        Map<String, Integer> counts = new ConcurrentHashMap<>();
        int workers = 3;
        CountDownLatch done = new CountDownLatch(workers);
        ExecutorService pool = Executors.newFixedThreadPool(workers);

        for (int i = 0; i < workers; i++) {
            pool.submit(() -> {
                try {
                    for (String line = queue.take(); !line.equals(POISON); line = queue.take()) {
                        for (String word : line.split(" ")) counts.merge(word, 1, Integer::sum);   // atomic per key
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    done.countDown();
                }
            });
        }
        for (String line : lines) queue.put(line);                       // producer blocks when 2 lines are pending
        for (int i = 0; i < workers; i++) queue.put(POISON);
        done.await();                                                    // wait for every worker to finish
        pool.shutdown();
        pool.awaitTermination(5, TimeUnit.SECONDS);
        System.out.println("word counts: " + new TreeMap<>(counts));

        // One-shot hand-offs: three async quotes, then combine.
        CompletableFuture<Long> a = CompletableFuture.supplyAsync(() -> quote("courier-a", 120));
        CompletableFuture<Long> b = CompletableFuture.supplyAsync(() -> quote("courier-b", 95));
        CompletableFuture<Long> c = CompletableFuture.supplyAsync(() -> quote("courier-c", 110));
        long cheapest = CompletableFuture.allOf(a, b, c)
                .thenApply(v -> Math.min(a.join(), Math.min(b.join(), c.join())))
                .get(2, TimeUnit.SECONDS);                               // never wait forever
        System.out.println("cheapest quote: " + cheapest);
    }

    static long quote(String courier, long price) {
        try { Thread.sleep(20); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        return price;
    }
}
```

## Coordination inside LLD problems

| Problem | Coordination piece |
|---|---|
| [Logging Framework](problem:logging-framework) | Async appender: callers enqueue log events; a background thread writes them. Bounded queue: block for ERROR, drop DEBUG when full |
| [Task Scheduler](problem:task-scheduler) | Workers wait for the **next due** task: `condition.awaitUntil(nextDueTime)`, or a `DelayQueue`; scheduling an earlier task must **signal** the waiter |
| [Pub/Sub](problem:pub-sub) | A queue (or offset) per subscriber, so a slow subscriber doesn't block the others |
| [Notification Service](problem:notification-service) | Retry queue with delays; worker pool per channel |
| [Elevator](problem:elevator) | Button presses arrive from other threads while the controller loop runs |

```java title="Scheduler wait loop (sketch)"
lock.lock();
try {
    while (true) {
        Task next = queue.peek();                       // PriorityQueue ordered by dueAt
        if (next == null) { hasWork.await(); continue; }
        long waitNanos = Duration.between(clock.instant(), next.dueAt()).toNanos();
        if (waitNanos <= 0) { queue.poll(); executor.execute(next); continue; }
        hasWork.awaitNanos(waitNanos);                  // woken early if an earlier task is scheduled
    }
} finally { lock.unlock(); }
```

## Real-world example

A payments API logged every request through an "async" appender backed by an unbounded queue. During an incident, a downstream timeout made every request log three stack traces; the log writer fell behind, the queue grew to several gigabytes, and the JVM died with `OutOfMemoryError` — turning a partial outage into a full one. The fix: a bounded queue (10k events), **drop DEBUG/INFO when full** (with a "dropped N events" counter), **block for ERROR** with a short timeout, and an alert on the drop counter.

## Common mistakes

- **`if` instead of `while`** around `wait()`/`await()`.
- **`notify()` with mixed waiters** on one monitor → the wrong thread wakes and everyone sleeps (use `notifyAll` or separate conditions).
- **Calling `wait()` without holding the lock** → `IllegalMonitorStateException`; or checking the condition outside the lock → a lost wake-up.
- **Holding a lock while blocking on a queue** → other threads that need the lock to make progress can't, so the pipeline deadlocks.
- **Unbounded queues** (including the defaults in `Executors.newFixedThreadPool` and `new LinkedBlockingQueue<>()`).
- **Swallowing `InterruptedException`**, so shutdown never works.
- **No shutdown story** → non-daemon threads keep the JVM alive, or tasks are silently lost.

## In the interview

> [!INTERVIEW] What to say
> *"Logging calls shouldn't block on disk, so the appender puts events on a bounded `ArrayBlockingQueue` and one background thread writes them. If the queue is full, we drop DEBUG events and count them, but ERROR events wait up to 100ms. On shutdown, `close()` enqueues a poison pill and joins the writer, so everything already queued is flushed."* That covers hand-off, waiting, backpressure and shutdown in four sentences.

## Key takeaways

- Coordination is about threads **waiting for and handing work to** each other.
- **Block, don't spin:** `wait`/`notifyAll` (always in a `while` loop), `Condition`s, or — in practice — `BlockingQueue`.
- **Bound every queue** and choose a backpressure strategy: block, time out, drop, or caller-runs.
- Plan **shutdown**: poison pills or interruption, never swallowing `InterruptedException`.
- Use **latches, barriers and futures** for one-shot and phased coordination; executors for task streams.

## Knowledge check

```quiz
? Why must `wait()` be called inside a `while` loop that re-checks the condition?
+ Wake-ups can be spurious, and another thread may have changed the state between the notification and this thread re-acquiring the lock
- Because wait() only works inside loops
- To make the thread wait longer
> Always re-check the guard after waking.

? Consumers are slower than producers for several minutes. Which design avoids running out of memory without losing payment events?
- An unbounded LinkedBlockingQueue
+ A bounded queue where producers block (or time out and reject upstream) when it's full
- Dropping the oldest events silently
> Bounded queues plus blocking or explicit rejection give backpressure without losing critical work.

? You need to start 50 test threads at exactly the same moment. Which tool fits?
+ A CountDownLatch(1) that all threads await, counted down once by the main thread
- A Semaphore with 50 permits
- Thread.sleep in each thread
> A latch is a one-shot gate: every waiting thread is released together.
```

## Exercise

Build an **async log appender**:

- `log(level, message)` hands events to a **bounded queue** (capacity configurable) without writing them on the caller's thread.
- When the queue is full: **DEBUG and INFO are dropped** (and counted); **WARN and ERROR wait up to 100ms**, and are counted as dropped only if still no space.
- One background writer thread drains the queue into a sink.
- `close()` flushes everything already queued and stops the writer.

````hint title="Hint 1"
`offer(event)` for low levels, `offer(event, 100, MILLISECONDS)` for high levels. A poison-pill event makes `close()` orderly: the writer drains everything queued before the pill.
````

````hint title="Hint 2 — testing drops deterministically"
Let the appender be created *without* starting its writer thread, so a test can fill the queue first, then call `start()`.
````

````solution title="Reference solution"
```java file="AsyncAppenderDemo.java"
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;

public class AsyncAppenderDemo {
    public static void main(String[] args) throws InterruptedException {
        List<String> sink = Collections.synchronizedList(new ArrayList<>());
        AsyncAppender appender = new AsyncAppender(5, sink::add);

        for (int i = 1; i <= 10; i++) appender.log(Level.DEBUG, "debug " + i);   // writer not started: 5 fit, 5 dropped
        appender.start();
        appender.log(Level.ERROR, "disk almost full");                         // waits briefly for space if needed
        appender.close();                                                      // flushes, then stops the writer

        System.out.println("written=" + sink.size() + " dropped=" + appender.dropped());
        System.out.println("last written: " + sink.get(sink.size() - 1));
    }
}

enum Level { DEBUG, INFO, WARN, ERROR }

record LogEvent(Level level, String message) {
    static final LogEvent POISON = new LogEvent(Level.ERROR, "<<stop>>");
}

final class AsyncAppender implements AutoCloseable {
    private final BlockingQueue<LogEvent> queue;
    private final Consumer<String> sink;
    private final AtomicLong dropped = new AtomicLong();
    private final Thread writer;
    private volatile boolean closed;

    AsyncAppender(int capacity, Consumer<String> sink) {
        this.queue = new ArrayBlockingQueue<>(capacity);
        this.sink = sink;
        this.writer = new Thread(this::drain, "async-appender");
        this.writer.setDaemon(true);
    }

    void start() { writer.start(); }

    void log(Level level, String message) throws InterruptedException {
        if (closed) throw new IllegalStateException("appender closed");
        LogEvent event = new LogEvent(level, message);
        boolean accepted = level.compareTo(Level.WARN) >= 0
                ? queue.offer(event, 100, TimeUnit.MILLISECONDS)   // important: bounded wait
                : queue.offer(event);                             // chatty: drop if full
        if (!accepted) dropped.incrementAndGet();
    }

    private void drain() {
        try {
            for (LogEvent e = queue.take(); e != LogEvent.POISON; e = queue.take()) {
                sink.accept("[" + e.level() + "] " + e.message());
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    long dropped() { return dropped.get(); }

    @Override
    public void close() {
        if (closed) return;
        closed = true;
        try {
            queue.put(LogEvent.POISON);   // queued after every accepted event
            writer.join(2_000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
```

Output: `written=6 dropped=5`, and the last event written is the ERROR. The full logging design is in the [Logging Framework](problem:logging-framework) problem.
````
