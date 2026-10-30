## Concept explanation

### Compare-and-set (CAS)

Modern CPUs offer an atomic instruction: **compare-and-swap**. "If this memory location still holds the value I expect, replace it with the new value; tell me whether it worked." The check and the write happen as **one indivisible step**, with no lock.

`java.util.concurrent.atomic` exposes it:

```java
AtomicInteger count = new AtomicInteger();
boolean swapped = count.compareAndSet(expected, newValue);   // true if it was `expected`
```

Any read-modify-write can be built from a **CAS retry loop**:

```java
int current, next;
do {
    current = count.get();                 // 1. read
    next = compute(current);               // 2. compute without holding anything
} while (!count.compareAndSet(current, next));   // 3. publish, or retry if someone else won
```

If another thread changed the value between steps 1 and 3, the CAS fails and the loop retries with fresh data. No thread ever blocks, so this is **lock-free** (some thread always makes progress).

### The atomic classes

| Class | Use |
|---|---|
| `AtomicInteger`, `AtomicLong`, `AtomicBoolean` | counters, sequence numbers, flags |
| `AtomicReference<V>` | atomically swap an object reference: immutable state snapshots, lock-free structures |
| `AtomicIntegerArray`, `AtomicLongArray`, `AtomicReferenceArray` | per-element atomic operations |
| `AtomicStampedReference<V>` | reference + int stamp, to defeat the **ABA problem** |
| `AtomicMarkableReference<V>` | reference + boolean mark (lock-free list deletion) |
| `LongAdder`, `LongAccumulator`, `DoubleAdder` | **high-contention** counters and accumulators |
| `VarHandle` (Java 9) | atomic and ordered access to ordinary fields and array elements |

Useful methods (Java 8+):
- `incrementAndGet`, `getAndIncrement`, `addAndGet`;
- `updateAndGet(fn)` and `getAndUpdate(fn)`;
- `accumulateAndGet(x, (current, x) -> …)`;
- `compareAndExchange` (Java 9), which returns the witnessed value.

The functions passed to `updateAndGet`/`accumulateAndGet` **may run more than once** under contention (that's the retry loop inside), so they **must be side-effect-free**.

### The ABA problem

CAS checks *the value*, not *whether anything happened*. If a reference changes from A to B and back to A, a thread that read A earlier sees "still A" and its CAS succeeds, even though the structure underneath changed. In a lock-free stack this can resurrect a popped node and corrupt the list. Fixes:
- `AtomicStampedReference`, which compares a version stamp together with the reference;
- never reusing nodes (Java's GC helps: a node can't be freed and reallocated while a thread still references it, so classic ABA from memory reuse is rarer in Java than in C++);
- immutable nodes.

### AtomicLong vs LongAdder

Under heavy contention, many threads CAS the **same** memory location. They all fail and retry, and the cache line bounces between cores. **`LongAdder`** spreads updates over a dynamic array of **cells** (roughly one per contending thread) and sums them on `sum()`.

| | `AtomicLong` | `LongAdder` |
|---|---|---|
| Uncontended updates | fast | about as fast |
| Heavily contended updates | slow (CAS failures, cache-line ping-pong) | **much faster** |
| Read the exact current value | yes, `get()` | `sum()` is not an atomic snapshot under concurrent updates |
| CAS / conditional updates | yes | no |
| Memory | one long | grows with contention |

Use `LongAdder` for statistics and metrics (hit counters, request counts). Use `AtomicLong` for sequence numbers, ids and anything needing CAS.

## Internal working

- **CPU instructions**: CAS maps to `lock cmpxchg` on x86 and to `casal` or LL/SC (`ldaxr`/`stlxr`) on ARM. `getAndIncrement` uses `lock xadd`, a single fetch-and-add with no retry loop needed. Atomic operations also act as full memory barriers on x86, giving `volatile`-strength visibility.
- **`AtomicInteger`** is a `volatile int value` plus operations implemented with `Unsafe`/`VarHandle` intrinsics, which the JIT compiles to the instructions above.
- **`LongAdder`** (`Striped64`):
  - starts with a single `base` field;
  - on CAS contention it creates a `Cell[]` and hashes threads to cells via a per-thread probe value, growing the array up to the CPU count;
  - cells are padded with `@Contended` to avoid false sharing (lock-free lesson);
  - `sum()` adds the base and every cell.
- **`VarHandle`** gives atomic and ordered access modes on any field or array element: plain, opaque, acquire/release, volatile, plus `compareAndSet`, `getAndAdd` and others. It's how JDK classes such as `ConcurrentHashMap`, `AQS` and `FutureTask` implement lock-free paths without `Unsafe`.
- **Progress guarantees**:
  - a CAS loop is **lock-free** (system-wide progress);
  - `getAndAdd` via `xadd` is **wait-free** (every thread finishes in bounded steps);
  - locks are **blocking**: a descheduled lock holder stalls everyone.

## Visual representation

```text title="CAS retry loop and the ABA problem"
  counter = 5          T1: read 5, compute 6            T2: read 5, compute 6
                       T1: CAS(5 -> 6)  ok   counter=6
                                                        T2: CAS(5 -> 6)  FAILS (it's 6) -> re-read 6, compute 7
                                                        T2: CAS(6 -> 7)  ok   counter=7   (no update lost)

  ABA on a lock-free stack  top -> A -> B -> C
    T1: reads top=A, next=B ... (paused)
    T2: pop A, pop B, push A again        top -> A -> C   (B is gone)
    T1: CAS(top: A -> B) succeeds!        top -> B -> C   B was popped: the stack is corrupted
  AtomicStampedReference: T1 expected (A, stamp 0); now (A, stamp 3) -> CAS fails
```

## Java code example

```java title="AtomicsDemo.java" file="AtomicsDemo.java"
import java.lang.invoke.MethodHandles;
import java.lang.invoke.VarHandle;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicStampedReference;
import java.util.concurrent.atomic.LongAdder;

public class AtomicsDemo {
    static final class Node {                              // a stack node whose link can be reused
        final String value;
        Node next;

        Node(String value, Node next) {
            this.value = value;
            this.next = next;
        }
    }

    record Stats(long count, long sum, long max) {
        Stats add(long sample) {
            return new Stats(count + 1, sum + sample, Math.max(max, sample));
        }
    }

    private volatile int plainField;                      // updated atomically through a VarHandle
    private static final VarHandle PLAIN_FIELD;

    static {
        try {
            PLAIN_FIELD = MethodHandles.lookup().findVarHandle(AtomicsDemo.class, "plainField", int.class);
        } catch (ReflectiveOperationException e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    static void inThreads(int n, Runnable body) throws InterruptedException {
        List<Thread> all = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            Thread t = new Thread(body);
            all.add(t);
            t.start();
        }
        for (Thread t : all) {
            t.join();
        }
    }

    public static void main(String[] args) throws Exception {
        // 1. Basic atomic operations
        AtomicInteger hits = new AtomicInteger();
        System.out.println("getAndIncrement returns " + hits.getAndIncrement() + ", incrementAndGet returns " + hits.incrementAndGet());
        hits.set(0);
        inThreads(8, () -> {
            for (int i = 0; i < 100_000; i++) {
                hits.incrementAndGet();
            }
        });
        System.out.println("8 threads x 100,000 increments = " + hits.get());

        // 2. A hand-written CAS loop: increment, but never above a limit
        AtomicInteger permits = new AtomicInteger();
        int limit = 5_000;
        inThreads(8, () -> {
            for (int i = 0; i < 1_000; i++) {
                int current;
                do {
                    current = permits.get();
                    if (current >= limit) {
                        return;                           // never exceed the limit
                    }
                } while (!permits.compareAndSet(current, current + 1));
            }
        });
        System.out.println("bounded CAS counter (8,000 attempts, limit 5,000): " + permits.get());

        // 3. updateAndGet / accumulateAndGet: the function may run more than once
        AtomicLong highWater = new AtomicLong();
        AtomicInteger functionCalls = new AtomicInteger();
        inThreads(4, () -> {
            for (long v = 1; v <= 50_000; v++) {
                long sample = v;
                highWater.accumulateAndGet(sample, (cur, x) -> {
                    functionCalls.incrementAndGet();      // side effect only to observe retries: don't do this
                    return Math.max(cur, x);
                });
            }
        });
        System.out.println("high-water mark: " + highWater.get() + ", function ran at least once per update: " + (functionCalls.get() >= 200_000));

        // 4. AtomicReference to an immutable snapshot: several fields updated as one
        AtomicReference<Stats> stats = new AtomicReference<>(new Stats(0, 0, 0));
        inThreads(4, () -> {
            for (int i = 1; i <= 1_000; i++) {
                long sample = i;
                stats.updateAndGet(s -> s.add(sample));
            }
        });
        System.out.println("stats " + stats.get() + " (count 4000, sum 4 x 500500, max 1000)");

        // 5. The ABA problem, replayed step by step on a lock-free stack
        Node c = new Node("C", null);
        Node b = new Node("B", c);
        Node a = new Node("A", b);
        AtomicReference<Node> top = new AtomicReference<>(a);
        Node seenByT1 = top.get();                        // T1 (pop) reads top = A and plans top = A.next = B
        Node plannedNext = seenByT1.next;
        top.set(top.get().next);                          // T2: pop A        stack: B -> C
        top.set(top.get().next);                          // T2: pop B        stack: C
        a.next = top.get();                               // T2: push A back  stack: A -> C
        top.set(a);
        boolean casWorked = top.compareAndSet(seenByT1, plannedNext);   // T1 resumes: top is A again, so CAS succeeds
        System.out.println("plain CAS after A->B->A succeeded: " + casWorked + ", top is now the already-popped node " + top.get().value);

        AtomicStampedReference<Node> stampedTop = new AtomicStampedReference<>(a, 0);
        int[] stampHolder = new int[1];
        Node t1Saw = stampedTop.get(stampHolder);
        int t1Stamp = stampHolder[0];
        stampedTop.set(b, 1);                             // T2: pop A
        stampedTop.set(c, 2);                             // T2: pop B
        stampedTop.set(a, 3);                             // T2: push A back (same reference, new stamp)
        System.out.println("stamped CAS after A->B->A succeeded: " + stampedTop.compareAndSet(t1Saw, b, t1Stamp, t1Stamp + 1)
                + " (stamp is " + stampedTop.getStamp() + ", T1 expected " + t1Stamp + ")");

        // 6. LongAdder for hot counters
        LongAdder requests = new LongAdder();
        inThreads(8, () -> {
            for (int i = 0; i < 100_000; i++) {
                requests.increment();
            }
        });
        System.out.println("LongAdder sum: " + requests.sum());

        // 7. VarHandle: CAS on an ordinary (volatile) field
        AtomicsDemo holder = new AtomicsDemo();
        System.out.println("VarHandle CAS 0 -> 42: " + PLAIN_FIELD.compareAndSet(holder, 0, 42)
                + ", again expecting 0: " + PLAIN_FIELD.compareAndSet(holder, 0, 7) + ", field = " + holder.plainField);
    }
}
```

## Output

```text title="Output" output="AtomicsDemo.java"
getAndIncrement returns 0, incrementAndGet returns 2
8 threads x 100,000 increments = 800000
bounded CAS counter (8,000 attempts, limit 5,000): 5000
high-water mark: 50000, function ran at least once per update: true
stats Stats[count=4000, sum=2002000, max=1000] (count 4000, sum 4 x 500500, max 1000)
plain CAS after A->B->A succeeded: true, top is now the already-popped node B
stamped CAS after A->B->A succeeded: false (stamp is 3, T1 expected 0)
LongAdder sum: 800000
VarHandle CAS 0 -> 42: true, again expecting 0: false, field = 42
```

- `getAndIncrement` returns the **old** value and `incrementAndGet` the **new** one. Eight threads of `incrementAndGet` lost no updates.
- The hand-written CAS loop enforced a limit that a plain "check then increment" couldn't: exactly 5,000, never more.
- `accumulateAndGet`'s function ran at least once per update (retries add more), so functions passed to atomics must be pure.
- Swapping immutable `Stats` records through an `AtomicReference` kept count, sum and max consistent without a lock.
- In the ABA replay, the plain CAS **succeeded** after A was popped and pushed back, putting the already-popped node B on top. The stamped CAS **failed**, because the stamp had moved on.
- `LongAdder` and a `VarHandle` CAS on an ordinary field behaved like the other atomics.

## Real-world application

- **Sequence and id generators**: `AtomicLong.incrementAndGet()` for in-process ids, request numbering and versioning.
- **Metrics**: Micrometer's counters and timers use `LongAdder`/`DoubleAdder` internally, so hot paths don't serialise on a counter.
- **Lock-free state machines**: `AtomicReference<State>` with `compareAndSet(expected, next)` ensures a transition (for example OPEN → CLOSED in a circuit breaker) happens exactly once. Resilience4j and Netty use this pattern.
- **Configuration and routing snapshots**: `AtomicReference<Config>` with `updateAndGet(old -> old.with(change))` for copy-on-write updates.
- **JDK internals**: `ConcurrentHashMap` (CAS on bins), `ConcurrentLinkedQueue`, `AQS` (the lock state) and `CompletableFuture` (CAS on its result) are all built on CAS.

## Common mistakes

- **Side effects inside `updateAndGet`/`accumulateAndGet` functions**: they may run several times.
- **Using several atomics for one invariant** (`count` and `sum` as two `AtomicLong`s) and expecting them to stay consistent. Use one `AtomicReference` to an immutable record, or a lock.
- **"Check then set" on an atomic**: `if (a.get() < limit) a.incrementAndGet();` is still a race. Use a CAS loop or `updateAndGet`.
- **`LongAdder.sum()` as an exact snapshot during concurrent updates**, or using it where you need CAS or `getAndIncrement` semantics.
- **Long or expensive computations in CAS loops under heavy contention**: lots of wasted retries. A lock may be better.
- **Assuming CAS loops are always faster than locks**: under extreme contention they can burn CPU.

## Interview questions

**Q1. What is CAS, and how do atomic classes use it?**

````reveal title="Answer"
Compare-and-swap is an atomic CPU instruction: "if the location holds the expected value, write the new value", returning success or failure. Atomic classes implement read-modify-write operations as loops: read the current value, compute the new value, CAS; on failure (another thread changed it), retry. No thread blocks, so the operations are lock-free. Simple increments use fetch-and-add instructions directly.
````

**Q2. What is the ABA problem, and how do you avoid it?**

````reveal title="Answer"
A thread reads value A, gets delayed, and meanwhile other threads change it to B and back to A. The delayed thread's CAS (expecting A) succeeds even though the state changed. In pointer-based structures (lock-free stacks or queues) this can resurrect removed nodes and corrupt the structure. Avoid it with `AtomicStampedReference` (a version stamp checked together with the reference), by not reusing nodes, or with immutable nodes. Java's GC prevents the memory-reuse variant, but logical ABA is still possible.
````

**Q3. `AtomicLong` vs `LongAdder`?**

````reveal title="Answer"
`AtomicLong` keeps one value and updates it by CAS or fetch-and-add. Under heavy contention, threads fight over one cache line. `LongAdder` spreads increments over a growing array of padded cells (one per contending thread, roughly) and sums them on read, so it's much faster under contention, but `sum()` isn't an atomic snapshot and it offers no CAS. Use `LongAdder` for counters and statistics, and `AtomicLong` for ids, sequences and conditional updates.
````

**Q4. Is `AtomicInteger` better than `volatile int`?**

````reveal title="Answer"
They solve different problems. `volatile int` guarantees visibility of single reads and writes, but `count++` on it still loses updates. `AtomicInteger` adds atomic read-modify-write operations (`incrementAndGet`, `compareAndSet`, `updateAndGet`) with the same visibility. For a flag or a value written by one thread, `volatile` is enough; for concurrent updates, use an atomic.
````

**Q5. When would you choose a lock over CAS-based code?**

````reveal title="Answer"
- **Several variables** must change together and can't be packed into one immutable object.
- **The critical section is long or expensive**, so CAS retries would waste a lot of work.
- **Contention is extreme**, so spinning CAS loops burn CPU.
- **You need blocking semantics** (wait until a condition holds).

Locks are also simpler to reason about. Lock-free algorithms are notoriously hard to get right beyond simple counters and reference swaps.
````

## Hands-on exercise

Build a lock-free **request tracker** used by 8 threads:
- a unique **request id** for each call, from an `AtomicLong`; show that all 80,000 ids are distinct and contiguous;
- the **highest concurrent in-flight count** ever observed: increment an `AtomicInteger` on entry and decrement it on exit, and record the maximum in an `AtomicInteger` with `accumulateAndGet(Math::max)`;
- a **latency summary** (count, total, max) in one `AtomicReference<Summary>` updated with `updateAndGet` and an immutable record, where "latency" is `id % 100`.

````hint title="Hint"
`long id = ids.incrementAndGet();` gives unique, gap-free ids. Collect them in a `ConcurrentHashMap.newKeySet()` to check uniqueness. For the peak: `int now = inFlight.incrementAndGet(); peak.accumulateAndGet(now, Math::max); … inFlight.decrementAndGet();`. Summary: `summary.updateAndGet(s -> s.record(latency))`. The expected total is 80,000 × 49.5 = 3,960,000, since ids 1..80,000 mod 100 cycle evenly through 0..99.
````

````solution title="Solution"
```java title="RequestTracker.java" file="RequestTracker.java"
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

public class RequestTracker {
    record Summary(long count, long totalLatency, long maxLatency) {
        Summary record(long latency) {
            return new Summary(count + 1, totalLatency + latency, Math.max(maxLatency, latency));
        }
    }

    final AtomicLong ids = new AtomicLong();
    final AtomicInteger inFlight = new AtomicInteger();
    final AtomicInteger peak = new AtomicInteger();
    final AtomicReference<Summary> summary = new AtomicReference<>(new Summary(0, 0, 0));

    long handle() {
        long id = ids.incrementAndGet();                         // unique and gap-free
        int now = inFlight.incrementAndGet();
        peak.accumulateAndGet(now, Math::max);                   // highest concurrency seen
        try {
            long latency = id % 100;                             // simulated work result
            summary.updateAndGet(s -> s.record(latency));        // pure function: safe to retry
            return id;
        } finally {
            inFlight.decrementAndGet();
        }
    }

    public static void main(String[] args) throws InterruptedException {
        RequestTracker tracker = new RequestTracker();
        Set<Long> seen = ConcurrentHashMap.newKeySet();
        List<Thread> threads = new ArrayList<>();
        for (int t = 0; t < 8; t++) {
            Thread thread = new Thread(() -> {
                for (int i = 0; i < 10_000; i++) {
                    seen.add(tracker.handle());
                }
            });
            threads.add(thread);
            thread.start();
        }
        for (Thread t : threads) {
            t.join();
        }
        long min = seen.stream().mapToLong(Long::longValue).min().orElse(0);
        long max = seen.stream().mapToLong(Long::longValue).max().orElse(0);
        System.out.println("distinct ids: " + seen.size() + ", range " + min + ".." + max + " (contiguous: " + (max - min + 1 == seen.size()) + ")");
        System.out.println("peak in-flight between 1 and 8: " + (tracker.peak.get() >= 1 && tracker.peak.get() <= 8)
                + ", in flight now: " + tracker.inFlight.get());
        System.out.println("summary: " + tracker.summary.get());
    }
}
```

```text title="Output" output="RequestTracker.java"
distinct ids: 80000, range 1..80000 (contiguous: true)
peak in-flight between 1 and 8: true, in flight now: 0
summary: Summary[count=80000, totalLatency=3960000, maxLatency=99]
```

Every piece of state is either a single atomic variable (ids, the in-flight count, the peak) or one atomically swapped immutable record (the summary). That's why no locks were needed and no update was lost.
````

## Knowledge check

```quiz
? What does compareAndSet(expected, update) do?
+ Atomically sets the value to update only if it currently equals expected, and reports success
- Waits until the value equals expected, then sets it
- Sets the value and returns the previous one
> It's the building block of lock-free algorithms.

? Why must the function passed to updateAndGet be side-effect-free?
+ It may be called several times when the CAS fails and retries
- It runs on a different thread
- It's called only once, before the update
> Retries re-run the function with the fresh value.

? In which situation does LongAdder clearly beat AtomicLong?
+ Many threads incrementing the same counter concurrently
- A single thread generating sequential ids
- Code that needs compareAndSet
> It stripes updates across cells to avoid contention.

? A value changes A -> B -> A between a thread's read and its CAS. What does a plain CAS expecting A do?
+ Succeeds, unaware of the intermediate change
- Fails
- Throws ConcurrentModificationException
> That's the ABA problem; a stamped reference detects it.

? Two counters `count` and `sum` must always be consistent. Which approach works?
+ One AtomicReference to an immutable record holding both, updated with updateAndGet
- Two separate AtomicLong fields
- Two volatile long fields
> Separate atomics can't keep a multi-field invariant.
```

## Key takeaways

- **CAS** atomically replaces a value only if it's unchanged. **CAS retry loops** implement lock-free read-modify-write: read, compute, CAS, retry.
- Atomic classes cover numbers, booleans, references, arrays and fields (**`VarHandle`**). Prefer `updateAndGet`/`accumulateAndGet` with **pure** functions.
- **ABA**: the same value doesn't mean nothing changed. Use `AtomicStampedReference` or immutable nodes.
- **`LongAdder`** for contended counters and metrics; **`AtomicLong`** for ids and CAS.
- Multi-field invariants need **one atomic reference to an immutable object**, or a lock. Lock-free beyond simple cases is hard: use the JDK's structures.
