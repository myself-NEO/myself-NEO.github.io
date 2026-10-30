## Concept explanation

### What it is

A **`BlockingQueue<E>`** (`java.util.concurrent`) is a thread-safe queue whose operations can **wait**: a consumer taking from an empty queue blocks until an element arrives; a producer putting into a full (bounded) queue blocks until space frees up. It is the standard building block for **producer–consumer** designs.

Four method families:

| | Throws | Special value | **Blocks** | Times out |
|---|---|---|---|---|
| insert | `add(e)` | `offer(e)` → `false` | **`put(e)`** | `offer(e, time, unit)` → `false` |
| remove | `remove()` | `poll()` → `null` | **`take()`** | `poll(time, unit)` → `null` |
| examine | `element()` | `peek()` → `null` | — | — |

Plus `drainTo(collection, max)` (move several elements at once) and `remainingCapacity()`. Blocking queues **reject `null`** (null is the "nothing" signal for `poll`).

### The implementations

| Class | Bounded? | Structure | Locking | Use when |
|---|---|---|---|---|
| **`ArrayBlockingQueue`** | yes (fixed capacity) | circular array | **one** `ReentrantLock` + two conditions (`notEmpty`, `notFull`); optional fairness | bounded buffer with predictable memory |
| **`LinkedBlockingQueue`** | optional (default `Integer.MAX_VALUE`) | linked nodes | **two** locks (`putLock`, `takeLock`) so producers and consumers don't contend | high-throughput pipelines (always give a capacity!) |
| **`PriorityBlockingQueue`** | no | binary heap | one lock | consume by priority across threads |
| **`DelayQueue`** | no | priority queue of `Delayed` | one lock | elements become available only after their delay (retries, expiries) |
| **`SynchronousQueue`** | **zero** capacity | direct handoff | lock-free transfer | each `put` waits for a `take` — used by `Executors.newCachedThreadPool()` |
| **`LinkedTransferQueue`** | no | linked, lock-free | CAS | `transfer(e)` waits until a consumer receives it |
| **`LinkedBlockingDeque`** | optional | linked, both ends | one lock | work-stealing-style deques |

### Why it exists

Hand-written producer–consumer code with `wait`/`notify` is easy to get wrong (missed signals, spurious wakeups, lost updates — see [wait and notify](lesson:wait-and-notify)). A blocking queue packages the locking, signalling and **backpressure** (a bounded queue slows producers down when consumers fall behind) into one well-tested class.

### When to use it

- Passing work between threads: request handlers → background writers, readers → parsers → database loaders.
- Thread pools: every `ThreadPoolExecutor` holds its pending tasks in a `BlockingQueue` (see [ThreadPoolExecutor internals](lesson:threadpoolexecutor-internals)).
- Bounded buffers that protect memory under load.

## Internal working

### `ArrayBlockingQueue`

```java
final Object[] items;          // fixed-size circular buffer
int takeIndex, putIndex, count;
final ReentrantLock lock;
private final Condition notEmpty, notFull;
```

- **`put(e)`** (insertion): `lock.lockInterruptibly()`; `while (count == items.length) notFull.await();` then enqueue at `putIndex` (wrapping), `count++`, **`notEmpty.signal()`**; unlock.
- **`take()`** (retrieval): lock; `while (count == 0) notEmpty.await();` dequeue at `takeIndex`, null the slot, `count--`, **`notFull.signal()`**; unlock.
- The `while` loop (not `if`) re-checks the condition after waking, which handles spurious wakeups and competing threads.
- One lock means producers and consumers serialise, but there's no allocation per element — predictable and GC-friendly. `fair = true` grants the lock in FIFO order (lower throughput).

### `LinkedBlockingQueue`

Uses **two locks**: `put` only needs `putLock` (it appends at `last`), `take` only needs `takeLock` (it removes at `head`), and an `AtomicInteger count` coordinates them. Producers and consumers can therefore run **in parallel**. Each element allocates a `Node`. Without a capacity it is effectively **unbounded** — a classic source of `OutOfMemoryError` when consumers are slower than producers.

### Memory and thread-safety notes

All implementations are thread-safe, and every `put` **happens-before** the matching `take` (the handoff publishes the element safely). Iterators are weakly consistent. Bounded queues cap memory; unbounded ones (`LinkedBlockingQueue()`, `PriorityBlockingQueue`, `DelayQueue`) don't.

## Visual representation

```text title="ArrayBlockingQueue(2): producers block when full, consumers when empty"
  time ->
  producer:  put(1) ok   put(2) ok   put(3) ......BLOCKED (notFull.await)...... ok   put(4) ...
  queue:     [1]         [1,2]       [1,2] full                               [2,3]
  consumer:                                          take() -> 1  (notFull.signal) ^
                                                     wakes the producer -----------+

  LinkedBlockingQueue: two locks
     producers --putLock--> [last] ... [head] --takeLock--> consumers     (run in parallel)
```

## Java code example

```java title="BlockingQueuesDemo.java" file="BlockingQueuesDemo.java"
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.DelayQueue;
import java.util.concurrent.Delayed;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.PriorityBlockingQueue;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.TimeUnit;

public class BlockingQueuesDemo {
    private static final Integer POISON = -1;                       // sentinel: "no more work"

    public static void main(String[] args) throws InterruptedException {
        // 1. Producer-consumer with a bounded buffer and a poison pill
        BlockingQueue<Integer> buffer = new ArrayBlockingQueue<>(2);
        List<Integer> consumed = new ArrayList<>();
        Thread consumer = new Thread(() -> {
            try {
                while (true) {
                    Integer item = buffer.take();                   // blocks while empty
                    if (item.equals(POISON)) {
                        return;
                    }
                    consumed.add(item * item);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        consumer.start();
        for (int i = 1; i <= 6; i++) {
            buffer.put(i);                                          // blocks while full (capacity 2)
        }
        buffer.put(POISON);
        consumer.join();
        System.out.println("consumed squares: " + consumed);

        // 2. Timeouts instead of blocking forever
        BlockingQueue<String> full = new ArrayBlockingQueue<>(1);
        full.put("only");
        System.out.println("offer with 100ms timeout on a full queue: " + full.offer("more", 100, TimeUnit.MILLISECONDS));
        BlockingQueue<String> empty = new LinkedBlockingQueue<>(10);
        System.out.println("poll with 100ms timeout on an empty queue: " + empty.poll(100, TimeUnit.MILLISECONDS));

        // 3. drainTo moves a batch at once
        BlockingQueue<Integer> events = new LinkedBlockingQueue<>(100);
        for (int i = 1; i <= 7; i++) {
            events.offer(i);
        }
        List<Integer> batch = new ArrayList<>();
        int moved = events.drainTo(batch, 5);
        System.out.println("drained " + moved + " " + batch + ", left " + events);

        // 4. PriorityBlockingQueue: take() returns the smallest
        BlockingQueue<Integer> urgent = new PriorityBlockingQueue<>(List.of(30, 10, 20));
        System.out.println("priority take: " + urgent.take() + ", " + urgent.take());

        // 5. SynchronousQueue: no capacity, a direct handoff
        SynchronousQueue<String> handoff = new SynchronousQueue<>();
        System.out.println("SynchronousQueue offer with no taker waiting: " + handoff.offer("x"));
        Thread taker = new Thread(() -> {
            try {
                System.out.println("taker received: " + handoff.take());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        taker.start();
        handoff.put("hello");                                       // waits until the taker takes it
        taker.join();

        // 6. DelayQueue: elements become available after their delay
        DelayQueue<Retry> retries = new DelayQueue<>();
        long now = System.nanoTime();
        retries.put(new Retry("job-b", now + TimeUnit.MILLISECONDS.toNanos(150)));
        retries.put(new Retry("job-a", now + TimeUnit.MILLISECONDS.toNanos(50)));
        System.out.println("immediately available: " + retries.poll());
        System.out.println("first due: " + retries.take().name + ", then: " + retries.take().name);
    }

    static final class Retry implements Delayed {
        final String name;
        final long dueNanos;

        Retry(String name, long dueNanos) {
            this.name = name;
            this.dueNanos = dueNanos;
        }

        @Override
        public long getDelay(TimeUnit unit) {
            return unit.convert(dueNanos - System.nanoTime(), TimeUnit.NANOSECONDS);
        }

        @Override
        public int compareTo(Delayed other) {
            return Long.compare(getDelay(TimeUnit.NANOSECONDS), other.getDelay(TimeUnit.NANOSECONDS));
        }

        @Override
        public String toString() {
            return name;
        }
    }
}
```

## Output

```text title="Output" output="BlockingQueuesDemo.java"
consumed squares: [1, 4, 9, 16, 25, 36]
offer with 100ms timeout on a full queue: false
poll with 100ms timeout on an empty queue: null
drained 5 [1, 2, 3, 4, 5], left [6, 7]
priority take: 10, 20
SynchronousQueue offer with no taker waiting: false
taker received: hello
immediately available: null
first due: job-a, then: job-b
```

- The producer put six items into a 2-slot buffer: it blocked whenever the consumer fell behind (backpressure) and the consumer stopped at the poison pill. Order is preserved: one producer, FIFO queue.
- Timed `offer`/`poll` gave up after 100 ms instead of hanging.
- `SynchronousQueue.offer` failed with no consumer waiting — it holds nothing; `put` only completed once the taker thread took the element.
- The `DelayQueue` released `job-a` (50 ms) before `job-b` (150 ms) regardless of insertion order.

## Real-world application

- **Thread pools**: `newFixedThreadPool` uses an **unbounded** `LinkedBlockingQueue` (tasks can pile up until OOM); `newCachedThreadPool` uses a `SynchronousQueue` (every task needs a free or new thread). Production pools usually configure a bounded `ArrayBlockingQueue` with a rejection policy.
- **Logging frameworks**: async appenders (Logback, Log4j2) buffer events in a bounded queue and decide whether to block or drop when it's full.
- **ETL and ingestion pipelines**: reader → parser → writer stages connected by bounded queues so a slow database slows readers instead of exhausting memory.
- **Retry with backoff and session expiry**: `DelayQueue` holds items until they're due; `ScheduledThreadPoolExecutor` uses a similar delayed work queue.

## Common mistakes

- **Unbounded `LinkedBlockingQueue`** in front of a slow consumer → memory grows without limit.
- **Using `add`/`remove`** (throw) or `offer`/`poll` (non-blocking) when you meant `put`/`take` — busy loops or lost items.
- **No shutdown signal**: consumers blocked in `take()` forever. Use a poison pill (one per consumer), interrupts, or `poll` with a timeout plus a flag.
- **Swallowing `InterruptedException`** in consumers — restore the interrupt flag and exit (see [interrupts](lesson:interrupts-and-cancellation)).
- **Checking `isEmpty()` then calling `take()`** — check-then-act races; just `take` or `poll(timeout)`.
- **Putting `null`** → `NullPointerException`.
- **Relying on `size()`** for decisions under concurrency — it's a snapshot that's stale immediately.

## Interview questions

**Q1. How does `ArrayBlockingQueue` make `put` block when full?**

````reveal title="Answer"
It holds a `ReentrantLock` with two `Condition`s. `put` acquires the lock and loops `while (count == items.length) notFull.await()`, which releases the lock and parks the thread. A `take` that removes an element calls `notFull.signal()`, waking one waiting producer, which re-acquires the lock, re-checks the condition and inserts. `take` mirrors this with `notEmpty`.
````

**Q2. `ArrayBlockingQueue` vs `LinkedBlockingQueue`?**

````reveal title="Answer"
`ArrayBlockingQueue`: always bounded, preallocated circular array (no per-element allocation), a single lock for both ends (optional fairness). `LinkedBlockingQueue`: optionally bounded (default `Integer.MAX_VALUE` — effectively unbounded), allocates a node per element, and uses separate put and take locks so producers and consumers proceed concurrently, often giving higher throughput. Always pass a capacity to `LinkedBlockingQueue` in production.
````

**Q3. What is a `SynchronousQueue` and where is it used?**

````reveal title="Answer"
A queue with no capacity: each `put` must wait for a `take` (and vice versa) — a direct handoff between threads. `Executors.newCachedThreadPool()` uses it, so a submitted task is either handed to an idle thread immediately or causes a new thread to be created; nothing ever waits in a queue.
````

**Q4. How do you stop consumer threads blocked in `take()`?**

````reveal title="Answer"
Options: put a **poison pill** sentinel per consumer after the last real item; **interrupt** the consumer threads (`take` throws `InterruptedException`; executors do this in `shutdownNow`); or use `poll(timeout)` in a loop that also checks a volatile "running" flag. Poison pills guarantee all queued work is processed first.
````

## Hands-on exercise

Build a two-stage pipeline: a **reader** thread produces the lines `"a=1"`, `"b=2"`, `"bad"`, `"c=3"`; a **parser** thread converts valid lines to `Map.Entry<String, Integer>` and passes them through a second queue to a **summer** thread that totals the values. Use bounded queues of capacity 2, poison pills to shut down each stage, and print the total and the number of rejected lines.

````hint title="Hint"
Use `ArrayBlockingQueue<String>` between reader and parser and `ArrayBlockingQueue<Map.Entry<String,Integer>>` between parser and summer. When the parser receives the string poison pill, it forwards an entry poison pill and exits. Use `AtomicInteger` (or join and then read) for counters shared across threads.
````

````solution title="Solution"
```java title="PipelineDemo.java" file="PipelineDemo.java"
import java.util.List;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.atomic.AtomicInteger;

public class PipelineDemo {
    private static final String LINE_EOF = "__EOF__";
    private static final Map.Entry<String, Integer> ENTRY_EOF = Map.entry("__EOF__", 0);

    public static void main(String[] args) throws InterruptedException {
        BlockingQueue<String> lines = new ArrayBlockingQueue<>(2);
        BlockingQueue<Map.Entry<String, Integer>> entries = new ArrayBlockingQueue<>(2);
        AtomicInteger rejected = new AtomicInteger();
        AtomicInteger total = new AtomicInteger();

        Thread reader = new Thread(() -> {
            try {
                for (String line : List.of("a=1", "b=2", "bad", "c=3")) {
                    lines.put(line);
                }
                lines.put(LINE_EOF);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        Thread parser = new Thread(() -> {
            try {
                for (String line = lines.take(); !line.equals(LINE_EOF); line = lines.take()) {
                    String[] kv = line.split("=");
                    if (kv.length == 2) {
                        entries.put(Map.entry(kv[0], Integer.parseInt(kv[1])));
                    } else {
                        rejected.incrementAndGet();
                    }
                }
                entries.put(ENTRY_EOF);                       // forward the shutdown signal
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        Thread summer = new Thread(() -> {
            try {
                for (Map.Entry<String, Integer> e = entries.take(); e != ENTRY_EOF; e = entries.take()) {
                    total.addAndGet(e.getValue());
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        reader.start();
        parser.start();
        summer.start();
        reader.join();
        parser.join();
        summer.join();
        System.out.println("total = " + total.get() + ", rejected lines = " + rejected.get());
    }
}
```

```text title="Output" output="PipelineDemo.java"
total = 6, rejected lines = 1
```

The sentinel entry is compared by identity (`!=`) so a real entry with the same key could never stop the pipeline.
````

## Knowledge check

```quiz
? Which method blocks until space is available in a bounded BlockingQueue?
+ put
- offer
- add
> offer returns false, add throws, put waits.

? What's the default capacity of `new LinkedBlockingQueue<>()`?
+ Integer.MAX_VALUE (effectively unbounded)
- 16
- 0
> Always pass a capacity in production.

? Which queue has zero capacity and hands elements directly from producer to consumer?
+ SynchronousQueue
- ArrayBlockingQueue
- DelayQueue
> Each put waits for a take.

? Why does ArrayBlockingQueue use `while (count == 0) notEmpty.await()` instead of `if`?
+ To re-check after spurious wakeups or when another consumer took the element first
- Because if doesn't compile with await
- For performance
> Conditions must be re-checked after waking.

? How many locks does LinkedBlockingQueue use?
- One
+ Two: one for put, one for take
- None (lock-free)
> Producers and consumers don't contend with each other.
```

## Key takeaways

- `BlockingQueue` adds **`put`/`take`** (block) and **timed `offer`/`poll`** to the queue API; it rejects nulls and safely publishes elements between threads.
- **`ArrayBlockingQueue`**: bounded circular array, one lock, two conditions. **`LinkedBlockingQueue`**: linked, two locks, unbounded by default — set a capacity.
- **`PriorityBlockingQueue`**, **`DelayQueue`** and **`SynchronousQueue`** cover priority, delayed and direct-handoff needs.
- Bounded queues give **backpressure**; shut consumers down with **poison pills** or interrupts.
- Thread pools are built on blocking queues — the queue choice decides how a pool behaves under load.
