## Concept explanation

### Progress guarantees

Concurrent algorithms are classified by what they guarantee when threads are delayed, descheduled, or stuck in a GC pause:

| Guarantee | Meaning | Example |
|---|---|---|
| **Blocking** | one stalled thread holding a lock can stall everyone | `synchronized`, `ReentrantLock` |
| **Obstruction-free** | a thread running *alone* finishes in bounded steps | some STM designs |
| **Lock-free** | *some* thread always makes progress; individual threads may retry indefinitely | CAS retry loops, `ConcurrentLinkedQueue`, Treiber stack |
| **Wait-free** | *every* thread finishes in bounded steps | `AtomicInteger.getAndIncrement` (one `xadd`) |

Lock-free code can't deadlock and is immune to lock-holder preemption. But it's **hard to write correctly** (ABA, memory reclamation, subtle ordering bugs) and not automatically faster under heavy contention. Use the JDK's lock-free structures instead of writing your own, except for simple CAS state machines.

### A lock-free stack (Treiber, 1986)

```java
void push(T value) {
    Node<T> node = new Node<>(value);
    do {
        node.next = top.get();                         // link to the current top
    } while (!top.compareAndSet(node.next, node));     // publish, or retry if top changed
}
```

`pop` is symmetric: read `top`, CAS it to `top.next`. Java's garbage collector makes it safe to reuse memory: a node can't be freed while another thread still holds a reference, which eliminates the hardest problem lock-free code has in C and C++.

### False sharing

CPUs move memory between cores in **cache lines** of 64 bytes (128 on some ARM chips). If two threads write to **different variables that happen to share a cache line**, each write invalidates the other core's copy, and the line ping-pongs between cores. That's **false sharing**: no logical sharing, but real contention. It can make two "independent" counters several times slower.

Fixes:
- **padding**: keep hot fields at least a cache line apart;
- **`@jdk.internal.vm.annotation.Contended`** (used inside the JDK: `LongAdder` cells, `Thread`'s random seeds, `ConcurrentHashMap` counters; it needs `-XX:-RestrictContended` for user code);
- **per-thread accumulation** (`LongAdder`, thread-local counters merged at the end);
- **separate objects or arrays per thread**.

### Backpressure

When producers are faster than consumers, something must give. Without **backpressure**, queues grow until memory runs out and latency becomes unbounded. With it, the system **pushes back** on producers. Mechanisms:
- **bounded queues**: `put` blocks when full;
- **`CallerRunsPolicy`**: a saturated pool makes the submitting thread do the work, which slows it down;
- **`Semaphore`s** limiting in-flight requests;
- **rejecting with a retryable error** (HTTP 429/503);
- **reactive streams** (`Flow`, Reactor), where consumers *request* n items at a time.

## Internal working

- **Cache coherence (MESI)**: a core must own a line exclusively (the M or E state) to write it. When another core writes the same line, the first core's copy is invalidated, and its next access misses. A write-heavy line bouncing between two cores costs tens of nanoseconds per access instead of about one.
- **Object layout and false sharing**: HotSpot packs fields densely. Two `volatile long` counters in one object, or adjacent array elements written by different threads, almost certainly share a line. Padding works by inserting about 7 unused `long`s (56 bytes) or more between hot fields. `@Contended` makes the JVM add padding (128 bytes by default) around the annotated field or group.
- **CAS under contention**: every CAS needs exclusive ownership of the line. Many threads CASing one location serialise on that line *and* waste work on failed attempts, so high contention can make a lock-free counter slower than a striped one (`LongAdder`) or even a lock.
- **Treiber stack reclamation**: in Java, a popped node is reclaimed by the GC only when no thread references it, so the "free and reuse" form of ABA can't occur. Logical ABA, with the same node pushed back, is still possible with node reuse; allocating fresh nodes avoids it.
- **`java.util.concurrent.Flow`** (Java 9) defines the Reactive Streams interfaces: `Publisher`, `Subscriber`, `Subscription.request(n)`. That's demand-driven backpressure used by Reactor, RxJava, Akka Streams and `HttpClient`'s body handlers.

## Visual representation

```text title="False sharing and padding"
  one 64-byte cache line:   [ counterA (8 bytes) | counterB (8 bytes) | ...                     ]
     core 1 writes A -> owns the line; core 2's copy invalidated
     core 2 writes B -> owns the line; core 1's copy invalidated       -> ping-pong on every write

  padded:   line 1: [ counterA | padding ............................................. ]
            line 2: [ counterB | padding ............................................. ]
     each core keeps its own line: no invalidations

  backpressure:   producer --put--> [ bounded queue: full ] --take--> consumers
                     ^ blocks (or CallerRuns / 429) until consumers catch up
```

## Java code example

```java title="LockFreeDemo.java" file="LockFreeDemo.java"
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLongArray;
import java.util.concurrent.atomic.AtomicReference;

public class LockFreeDemo {
    // Treiber's lock-free stack
    static final class LockFreeStack<T> {
        private static final class Node<T> {
            final T value;
            Node<T> next;

            Node(T value) {
                this.value = value;
            }
        }

        private final AtomicReference<Node<T>> top = new AtomicReference<>();

        void push(T value) {
            Node<T> node = new Node<>(value);
            do {
                node.next = top.get();
            } while (!top.compareAndSet(node.next, node));
        }

        T pop() {
            Node<T> current;
            do {
                current = top.get();
                if (current == null) {
                    return null;
                }
            } while (!top.compareAndSet(current, current.next));
            return current.value;
        }
    }

    static void runAll(List<Thread> threads) throws InterruptedException {
        threads.forEach(Thread::start);
        for (Thread t : threads) {
            t.join();
        }
    }

    static long timeCounters(int gap) throws InterruptedException {
        AtomicLongArray counters = new AtomicLongArray(64);
        Thread a = new Thread(() -> {
            for (int i = 0; i < 20_000_000; i++) {
                counters.getAndIncrement(0);
            }
        });
        Thread b = new Thread(() -> {
            for (int i = 0; i < 20_000_000; i++) {
                counters.getAndIncrement(gap);
            }
        });
        long start = System.nanoTime();
        a.start();
        b.start();
        a.join();
        b.join();
        return (System.nanoTime() - start) / 1_000_000;
    }

    public static void main(String[] args) throws Exception {
        // 1. Lock-free stack: 4 pushers, then 4 poppers, nothing lost or duplicated
        LockFreeStack<Integer> stack = new LockFreeStack<>();
        List<Thread> pushers = new ArrayList<>();
        for (int t = 0; t < 4; t++) {
            int base = t * 25_000;
            pushers.add(new Thread(() -> {
                for (int i = 0; i < 25_000; i++) {
                    stack.push(base + i);
                }
            }));
        }
        runAll(pushers);
        List<List<Integer>> popped = new ArrayList<>();
        List<Thread> poppers = new ArrayList<>();
        for (int t = 0; t < 4; t++) {
            List<Integer> mine = new ArrayList<>();
            popped.add(mine);
            poppers.add(new Thread(() -> {
                for (Integer v = stack.pop(); v != null; v = stack.pop()) {
                    mine.add(v);
                }
            }));
        }
        runAll(poppers);
        Set<Integer> distinct = new HashSet<>();
        int total = 0;
        for (List<Integer> mine : popped) {
            total += mine.size();
            distinct.addAll(mine);
        }
        System.out.println("lock-free stack: pushed 100000, popped " + total + ", distinct " + distinct.size() + ", now empty: " + (stack.pop() == null));

        // 2. False sharing: neighbouring counters vs counters 16 longs (128 bytes) apart
        long adjacent = Long.MAX_VALUE;
        long padded = Long.MAX_VALUE;
        for (int round = 0; round < 3; round++) {                // best of 3 to reduce noise
            adjacent = Math.min(adjacent, timeCounters(1));
            padded = Math.min(padded, timeCounters(16));
        }
        System.out.println("false sharing: counters on separate cache lines were faster: " + (padded < adjacent));

        // 3. Backpressure: a bounded queue + CallerRunsPolicy slows the producer down
        AtomicInteger ranOnCaller = new AtomicInteger();
        AtomicInteger maxQueue = new AtomicInteger();
        ThreadPoolExecutor pool = new ThreadPoolExecutor(2, 2, 0, TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(10), new ThreadPoolExecutor.CallerRunsPolicy());
        for (int i = 0; i < 200; i++) {
            pool.execute(() -> {
                if (Thread.currentThread().getName().equals("main")) {
                    ranOnCaller.incrementAndGet();               // the producer had to do the work itself
                }
                try {
                    Thread.sleep(2);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            });
            maxQueue.accumulateAndGet(pool.getQueue().size(), Math::max);
        }
        pool.shutdown();
        pool.awaitTermination(10, TimeUnit.SECONDS);
        System.out.println("backpressure: queue never exceeded 10: " + (maxQueue.get() <= 10)
                + ", producer ran tasks itself when saturated: " + (ranOnCaller.get() > 0)
                + ", all 200 completed: " + (pool.getCompletedTaskCount() + ranOnCaller.get() == 200));
    }
}
```

## Output

```text title="Output" output="LockFreeDemo.java"
lock-free stack: pushed 100000, popped 100000, distinct 100000, now empty: true
false sharing: counters on separate cache lines were faster: true
backpressure: queue never exceeded 10: true, producer ran tasks itself when saturated: true, all 200 completed: true
```

- Four threads pushed concurrently and four popped concurrently without any lock. All 100,000 values came out exactly once.
- Two threads hammering *different* elements of an array ran faster when the elements were 128 bytes apart than when they were neighbours sharing a cache line. The exact ratio depends on the CPU (typically 1.5–5×), which is why the demo prints only the comparison.
- With a 10-slot queue and `CallerRunsPolicy`, the queue never grew past 10. When it was full, the producer ran tasks itself, which naturally throttled submission, and every task still ran.

## Real-world application

- **JDK structures you already use are lock-free inside**: `ConcurrentLinkedQueue`, `ConcurrentSkipListMap`, `ConcurrentHashMap`'s empty-bin inserts, atomics, `LongAdder`, and `CompletableFuture`'s dependent stack.
- **Low-latency systems** (LMAX Disruptor, Aeron, Chronicle) use padded sequences, single-writer principles and lock-free ring buffers to process millions of events per second.
- **Metrics libraries** avoid false sharing with striped, padded counters.
- **Backpressure everywhere**:
  - API gateways return 429 when queues fill;
  - Kafka consumers pause partitions;
  - Reactor and `Flow` subscribers request bounded demand;
  - thread pools use bounded queues with caller-runs or abort policies;
  - virtual-thread servers guard downstream calls with semaphores.

## Common mistakes

- **Writing your own lock-free data structures** for production instead of using the JDK's: subtle bugs (ABA, publication) surface only under load.
- **Assuming lock-free means faster**: under high contention, CAS retries and cache-line traffic can lose to striping or even a lock.
- **Ignoring false sharing** in per-thread counters, stats arrays or adjacent `volatile` fields written by different threads.
- **"Fixing" false sharing by adding padding everywhere**: padding wastes memory and helps only hot, independently written fields. Measure with JMH and `perf`.
- **Unbounded queues and fire-and-forget submission** without any backpressure.
- **Dropping work silently** (`DiscardPolicy`) when the real requirement is slowing producers down.

## Interview questions

**Q1. What is the difference between lock-free and wait-free?**

````reveal title="Answer"
- **Lock-free**: at any time, at least one thread completes its operation in a bounded number of steps, so the system as a whole progresses, but an individual thread may keep losing CAS races and retry indefinitely.
- **Wait-free**: every thread completes in a bounded number of its own steps, regardless of others (fetch-and-add, for example).
- **Blocking** algorithms (locks) offer neither: a preempted lock holder stops everyone.
````

**Q2. Explain how a Treiber stack works.**

````reveal title="Answer"
The stack keeps an `AtomicReference` to its top node.
- **push**: create a node, set `node.next = top.get()`, then `compareAndSet(oldTop, node)`, retrying if another thread changed `top` meanwhile.
- **pop**: read `top`; if it's null the stack is empty; otherwise `compareAndSet(top, top.next)` and return the old top's value, retrying on failure.

It's lock-free. In languages without GC it suffers from the ABA and memory-reclamation problems; in Java, GC prevents premature reuse of nodes.
````

**Q3. What is false sharing, and how do you avoid it?**

````reveal title="Answer"
Threads on different cores write different variables that sit in the same cache line (usually 64 bytes). Cache coherence transfers the whole line between cores on every write, causing heavy slowdowns although no data is logically shared. Avoid it by:
- separating hot fields by at least a cache line (manual padding, or `@Contended`, which the JDK uses in `LongAdder`, `Thread` and `ConcurrentHashMap`);
- using per-thread or striped accumulators;
- giving threads separate objects or array regions.
````

**Q4. What is backpressure, and how can you implement it in a Java service?**

````reveal title="Answer"
A mechanism by which a slower consumer signals a faster producer to slow down, instead of buffering without limit. Implementations:
- bounded `BlockingQueue`s (`put` blocks);
- `ThreadPoolExecutor` with a bounded queue and `CallerRunsPolicy` (or abort, mapped to 429/503 responses);
- `Semaphore`s limiting in-flight work;
- rate limiters;
- reactive streams' `request(n)` demand signalling (`java.util.concurrent.Flow`, Reactor).

Without backpressure, queues grow until latency explodes or memory runs out.
````

**Q5. Is a CAS-based counter always faster than a synchronized one?**

````reveal title="Answer"
No. With low or moderate contention, CAS (or fetch-and-add) avoids blocking and is usually faster. Under very high contention, many threads fail and retry, and the single cache line bounces between cores. Throughput can drop below a lock that queues threads, or far below a striped counter like `LongAdder`, which gives each thread its own cell. The right choice depends on the contention level and whether you need an exact current value. Benchmark with JMH.
````

## Hands-on exercise

Implement a lock-free **in-flight limiter** with an `AtomicInteger`:
- `boolean tryAcquire()` increments the in-flight count **only if** it's below the limit (a CAS loop), returning `false` otherwise;
- `void release()` decrements it.

Run 8 threads, each making 20,000 attempts: on success, record the current in-flight value in a shared "maximum observed" (`accumulateAndGet`), then release. Verify:
- the maximum observed never exceeded the limit (3);
- the final in-flight count is 0;
- successes + rejections = attempts.

````hint title="Hint"
`while (true) { int current = inFlight.get(); if (current >= limit) return false; if (inFlight.compareAndSet(current, current + 1)) return true; }`. Record `peak.accumulateAndGet(inFlight.get(), Math::max)` right after a successful acquire. Count successes and rejections in two `AtomicLong`s.
````

````solution title="Solution"
```java title="InFlightLimiter.java" file="InFlightLimiter.java"
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

public class InFlightLimiter {
    private final int limit;
    private final AtomicInteger inFlight = new AtomicInteger();

    InFlightLimiter(int limit) {
        this.limit = limit;
    }

    boolean tryAcquire() {
        while (true) {
            int current = inFlight.get();
            if (current >= limit) {
                return false;                                     // full: reject without blocking
            }
            if (inFlight.compareAndSet(current, current + 1)) {
                return true;                                      // we won the slot
            }                                                     // lost a race: re-read and retry
        }
    }

    void release() {
        inFlight.decrementAndGet();
    }

    public static void main(String[] args) throws InterruptedException {
        InFlightLimiter limiter = new InFlightLimiter(3);
        AtomicInteger peak = new AtomicInteger();
        AtomicLong accepted = new AtomicLong();
        AtomicLong rejected = new AtomicLong();
        List<Thread> threads = new ArrayList<>();
        for (int t = 0; t < 8; t++) {
            threads.add(new Thread(() -> {
                for (int i = 0; i < 20_000; i++) {
                    if (limiter.tryAcquire()) {
                        try {
                            peak.accumulateAndGet(limiter.inFlight.get(), Math::max);
                            accepted.incrementAndGet();
                        } finally {
                            limiter.release();
                        }
                    } else {
                        rejected.incrementAndGet();
                    }
                }
            }));
        }
        threads.forEach(Thread::start);
        for (Thread t : threads) {
            t.join();
        }
        System.out.println("max in flight observed <= 3: " + (peak.get() <= 3));
        System.out.println("in flight at the end: " + limiter.inFlight.get());
        System.out.println("accepted + rejected = 160000: " + (accepted.get() + rejected.get() == 160_000));
    }
}
```

```text title="Output" output="InFlightLimiter.java"
max in flight observed <= 3: true
in flight at the end: 0
accepted + rejected = 160000: true
```

Unlike a `Semaphore`, this limiter never blocks: callers that find it full are rejected immediately (fail fast, a form of backpressure). The CAS loop makes "check below limit, then increment" one atomic step. A plain `if (get() < limit) incrementAndGet()` would let several threads slip past the limit at once.
````

## Knowledge check

```quiz
? Which progress guarantee does a CAS retry loop provide?
+ Lock-free: some thread always makes progress
- Wait-free: every thread finishes in bounded steps
- Blocking
> An individual thread can keep losing races.

? Two threads increment different fields that share a 64-byte cache line. What happens?
+ False sharing: the line ping-pongs between cores and both slow down
- Nothing; the fields are independent
- The updates are lost
> The data is correct, but performance suffers badly.

? How does LongAdder avoid false sharing between its cells?
+ Its cells are padded with @Contended
- It uses a lock per cell
- It stores cells in a HashMap
> Each cell sits on its own cache line.

? A producer submits tasks to a pool with a bounded queue and CallerRunsPolicy faster than workers can run them. What happens?
+ The producer runs some tasks itself, slowing its submission rate
- The queue grows without limit
- Tasks are silently dropped
> That's backpressure.

? Why is memory reclamation easier for lock-free structures in Java than in C++?
+ The garbage collector won't free a node while any thread still references it
- Java has no pointers
- Java forbids CAS on references
> GC removes the classic free-and-reuse ABA hazard.
```

## Key takeaways

- **Progress guarantees**: blocking < obstruction-free < **lock-free** (CAS loops) < **wait-free** (fetch-and-add). Lock-free avoids deadlock but is hard: prefer the JDK's structures.
- The **Treiber stack** shows the pattern: read, link, CAS, retry. Java's GC removes the memory-reclamation ABA hazard.
- **False sharing**: independent writes to one cache line serialise cores. Fix it with padding, `@Contended`, striping (`LongAdder`) or per-thread data, and measure first.
- CAS isn't free under heavy contention. Striped counters or even locks can win.
- **Backpressure** (bounded queues, `CallerRunsPolicy`, semaphores, 429s, `Flow.request(n)`) keeps fast producers from overwhelming consumers.
