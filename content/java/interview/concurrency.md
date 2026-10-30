# Concurrency

### `volatile` vs `synchronized` vs `AtomicInteger`: when do you use which?
`id: volatile-sync-atomic` `level: intermediate` `kind: concept` `tricky` `lessons: java-memory-model,synchronized-and-intrinsic-locks,atomics-and-cas`

#### Hints
1. Which ones make `count++` safe?
2. Which ones can protect an invariant spanning two fields?

#### Answer
| | Visibility | Atomic read-modify-write | Multi-variable invariants | Blocks? |
|---|---|---|---|---|
| `volatile` | yes | **no** | no | no |
| `AtomicInteger` (and friends) | yes | **yes, for one variable** (CAS, `incrementAndGet`, `updateAndGet`) | only via one `AtomicReference` to an immutable object | no |
| `synchronized` / locks | yes | yes | **yes** (one lock around all the fields) | yes |

- `volatile`: flags, and publishing immutable references (one writer, many readers).
- Atomics: counters, sequence numbers, lock-free state transitions.
- `synchronized` or locks: compound operations across several variables, or when you need to wait for conditions.

#### Why other answers fall short
- **"volatile makes operations atomic."** Only single reads and writes; `volatile count++` loses updates.
- **"Atomics replace locks everywhere."** Two separate atomics can't keep a relationship between them consistent.

#### Follow-up
**Which is fastest for a heavily contended counter?** `LongAdder`, which spreads updates across padded cells, then `AtomicLong`, then a lock. `LongAdder.sum()` isn't an atomic snapshot, though.

### What is happens-before in the Java Memory Model?
`id: happens-before` `level: advanced` `kind: concept` `lessons: java-memory-model`

#### Hints
1. Why might a thread not see another thread's write at all?
2. Name the actions that create ordering between threads.

#### Answer
Compilers and CPUs reorder and cache memory operations, so without synchronisation a thread may see stale or reordered values. The JMM defines **happens-before**: if A happens-before B, A's effects are visible to B and ordered before it. Edges:
- **program order** within a thread;
- **unlock → later lock** of the same monitor or `Lock`;
- **volatile write → later read** of that variable;
- **`Thread.start()`** → actions of the started thread;
- **thread actions → successful `join()`** (or `isAlive() == false`);
- **`interrupt()`** → the interrupted thread detecting it;
- **end of a constructor → reads of `final` fields** (for properly published objects);
- **`java.util.concurrent` hand-offs** (queue put → take, submit → run, task end → `Future.get`, `countDown` → `await`);
- **transitivity**.

Two conflicting accesses (at least one a write) without a happens-before path form a **data race**.

#### Why other answers fall short
- **"Happens-before means 'executes earlier in time'."** It's a visibility and ordering guarantee, not wall-clock order.
- **"Sleeping long enough makes writes visible."** Timing creates no edge.

#### Follow-up
**How does the `volatile` rule make "publish data with a flag" correct?** Plain writes before the volatile write (program order) happen-before the volatile write, which happens-before the reader's volatile read that sees it, which happens-before the reader's later reads (transitivity).

### Does this loop terminate?
`id: visibility-spin-loop` `level: intermediate` `kind: output` `tricky` `lessons: java-memory-model`

```java
static boolean stop;   // not volatile

// worker thread
while (!stop) { }
System.out.println("stopped");

// main thread, 500 ms later
stop = true;
```

#### Hints
1. Is there a happens-before edge between the write and the read?
2. What can the JIT do with a field that never changes inside the loop?

#### Answer
**Possibly never**, and on HotSpot it usually doesn't. With no `volatile` and no lock, there's no happens-before edge, so the worker isn't required to ever see the write. Once C2 compiles the loop, it hoists the read of `stop` out of it (it's not written in the loop), effectively `if (!stop) while (true) {}`. In the lesson's demo, the non-volatile spinner was still running two seconds after `stop = true`, while a `volatile` version stopped immediately.

Fix: declare the field `volatile`, use `AtomicBoolean`, or read and write it under the same lock. For stopping threads, interruption is usually better.

#### Why other answers fall short
- **"It stops as soon as the cache is flushed."** Caches aren't the issue: the compiler is allowed to never re-read the field.
- **"It always works on x86."** The x86 memory model doesn't help when the JIT hoists the load.

#### Follow-up
**Would adding `System.out.println` inside the loop "fix" it?** It often appears to, because `println` synchronises internally and limits the optimisation, but that's an accident, not a guarantee. Use `volatile`.

### Why does double-checked locking need `volatile`?
`id: double-checked-locking` `level: advanced` `kind: concept` `tricky` `lessons: java-memory-model,synchronized-and-intrinsic-locks`

```java
private static Service instance;            // missing volatile
static Service get() {
    if (instance == null) {
        synchronized (Service.class) {
            if (instance == null) instance = new Service();
        }
    }
    return instance;
}
```

#### Hints
1. Which threads skip the `synchronized` block?
2. Can the reference become visible before the constructor's writes?

#### Answer
A thread that finds `instance != null` **skips the lock**, so it has no happens-before edge with the thread that constructed the object. The write of the reference can be reordered with, or become visible before, the field writes inside the constructor, so the second thread can see a non-null reference to a **partially constructed** object (fields still `0`/`null`). Declaring `instance` **`volatile`** fixes it: the volatile write publishes the fully constructed object, and the unsynchronised volatile read acquires it.

Simpler alternatives:
- the **holder idiom**: `private static class Holder { static final Service I = new Service(); }` (lazy, thread-safe class initialisation);
- an **enum** singleton;
- eager initialisation.

#### Why other answers fall short
- **"The `synchronized` block already makes it safe."** Only for threads that enter it.
- **"Only an old JVM bug, fixed in Java 5."** Java 5 made the *volatile* version correct; without `volatile` it's still broken.

#### Follow-up
**Why is the holder idiom thread-safe without any locking in your code?** Class initialisation is performed once, under a JVM-managed lock, and completes before any thread can access the class's static fields.

### Is `count++` thread-safe if `count` is `volatile`?
`id: volatile-increment` `level: beginner` `kind: concept` `tricky` `lessons: race-conditions-and-thread-safety,java-memory-model`

#### Hints
1. How many operations does `count++` consist of?
2. What exactly does `volatile` guarantee?

#### Answer
No. `count++` is **read, add, write**. `volatile` makes each read and each write visible and ordered, but two threads can still both read 41 and both write 42: a **lost update**. Use:
- `AtomicInteger.incrementAndGet()` (CAS or fetch-and-add);
- `LongAdder.increment()` for hot counters;
- `synchronized` around the increment.

The same applies to any check-then-act or read-modify-write on a volatile field.

#### Why other answers fall short
- **"Yes, volatile makes it visible, so it's safe."** Visibility isn't atomicity.
- **"It's safe on 64-bit CPUs."** The CPU's word size is irrelevant to the compound operation.

#### Follow-up
**When is `volatile` alone enough for a counter?** When only one thread ever writes it (others only read), as with a progress counter updated by a single worker.

### What are the conditions for deadlock, and how do you prevent it?
`id: deadlock-prevention` `level: intermediate` `kind: concept` `lessons: liveness-hazards,explicit-locks`

#### Hints
1. There are four Coffman conditions.
2. Which one does lock ordering break?

#### Answer
Deadlock needs **all four** conditions:
1. mutual exclusion;
2. hold and wait;
3. no preemption;
4. circular wait.

Prevention breaks one:
- **a global lock order** (always lock the lower account id first), so circular wait is impossible;
- **`tryLock(timeout)`**, releasing what you hold and retrying with random back-off, so locks can effectively be preempted;
- **acquiring all locks up front**, or never calling unknown code while holding a lock (no hold and wait);
- **reducing locking**: immutability, lock-free structures, confinement.

Also avoid **thread-starvation deadlocks**: a task blocking on another task submitted to the same bounded pool.

Detection: thread dumps (`Found one Java-level deadlock`) or `ThreadMXBean.findDeadlockedThreads()`. The JVM never resolves deadlocks itself.

#### Why other answers fall short
- **"Use fair locks."** Fairness prevents starvation, not deadlock.
- **"Add timeouts to everything."** That masks the symptom without fixing the lock-order cycle.

#### Follow-up
**How do you order locks for objects without a natural id?** By `System.identityHashCode`, with a global tie-breaker lock taken first in the rare case of equal hash codes.

### `ReentrantLock` vs `synchronized`?
`id: reentrantlock-vs-synchronized` `level: intermediate` `kind: concept` `lessons: explicit-locks,synchronized-and-intrinsic-locks`

#### Hints
1. What can you do with a `ReentrantLock` that you can't with `synchronized`?
2. What's the risk?

#### Answer
Both are reentrant mutual-exclusion locks with the same memory semantics. `ReentrantLock` adds:
- `tryLock()` and `tryLock(timeout)`;
- **interruptible** acquisition (`lockInterruptibly`);
- optional **fairness**;
- **multiple `Condition`s** per lock;
- introspection (`isLocked`, `getQueueLength`, `hasQueuedThreads`).

The cost: you must `unlock()` in `finally` (a missed unlock leaks the lock forever), and the JIT can't elide or coarsen it the way it does intrinsic locks. Default to `synchronized`, and switch for those features. On Java 21–23, `ReentrantLock` also avoided pinning virtual threads; Java 24 removed that difference.

#### Why other answers fall short
- **"ReentrantLock is always faster."** Performance is similar on modern JVMs.
- **"synchronized isn't reentrant."** It is.

#### Follow-up
**Why call `lock()` before the `try`, not inside it?** If `lock()` threw inside the `try`, `finally` would call `unlock()` on a lock you don't hold, throwing `IllegalMonitorStateException` and masking the original error.

### What is CAS, and what is the ABA problem?
`id: cas-and-aba` `level: advanced` `kind: internals` `lessons: atomics-and-cas,lock-free-and-false-sharing`

#### Hints
1. What does compare-and-set check?
2. Can a value change and change back between your read and your CAS?

#### Answer
**Compare-and-swap** atomically writes a new value only if the location still holds the expected value, and reports success. Atomic classes build lock-free read-modify-write as **retry loops**: read, compute, CAS, and retry if another thread changed the value meanwhile.

**ABA**: a thread reads A; other threads change the location to B and back to A; the delayed thread's CAS (expecting A) succeeds although the state changed. In a lock-free stack this can put an already-popped node back on top. The lesson replays exactly that. Fixes:
- `AtomicStampedReference` (the reference plus a version stamp, compared together);
- not reusing nodes, or immutable nodes.

Java's GC prevents the memory-reuse flavour seen in C/C++, where a freed node is reallocated at the same address.

#### Why other answers fall short
- **"CAS locks the variable briefly."** It's a single atomic instruction (`lock cmpxchg`); no lock object is involved.
- **"ABA can't happen in Java because of GC."** Logical ABA (the same object reinserted) still can.

#### Follow-up
**Why must functions passed to `updateAndGet` be side-effect-free?** The CAS loop may call them several times when it retries.

### `AtomicLong` or `LongAdder` for a request counter hit by many threads?
`id: longadder-vs-atomiclong` `level: intermediate` `kind: concept` `lessons: atomics-and-cas,lock-free-and-false-sharing`

#### Hints
1. Where do all the threads' CAS operations land with `AtomicLong`?
2. What does `LongAdder.sum()` have to do?

#### Answer
**`LongAdder`.** With `AtomicLong`, every thread updates **one** memory location: CAS failures and retries pile up, and the cache line bounces between cores. `LongAdder` starts with one base value and, on contention, spreads increments over a growing array of **cells** (padded with `@Contended` against false sharing), one per contending thread. `sum()` adds them up. Increments scale almost linearly with threads.

Trade-offs:
- `sum()` isn't an atomic snapshot during concurrent updates;
- there's no `compareAndSet`/`getAndIncrement`;
- it uses more memory.

Use `AtomicLong` for ids and sequence numbers, and anything needing an exact current value or CAS.

#### Why other answers fall short
- **"They're equivalent."** They differ hugely under contention.
- **"LongAdder is always better."** Not for sequences or conditional updates.

#### Follow-up
**What's `LongAccumulator`?** The generalisation of `LongAdder` to any associative operation, such as `new LongAccumulator(Long::max, Long.MIN_VALUE)` for a concurrent maximum.

### `CountDownLatch` vs `CyclicBarrier` vs `Semaphore`?
`id: latch-barrier-semaphore` `level: intermediate` `kind: concept` `lessons: synchronizers`

#### Hints
1. Which one is reusable?
2. Which one waits for *events* rather than for *threads*?

#### Answer
- **`CountDownLatch(n)`**: threads `await()` until `countDown()` has been called *n* times, by any threads. **One-shot**. Used for "wait until N tasks/services are done or ready" and start gates.
- **`CyclicBarrier(n)`**: *n* threads `await()` **each other**; when the last arrives, an optional barrier action runs, everyone proceeds, and the barrier **resets**. A failure **breaks** it for all. Used for phased parallel computations.
- **`Semaphore(n)`**: *n* permits; `acquire()` blocks when none are left, and `release()` returns one. Used for **bounding concurrency** and resource pools. Permits aren't owned, so release in `finally`.

(`Phaser` is a reusable barrier with dynamic parties; `Exchanger` swaps objects between two threads.)

#### Why other answers fall short
- **"Latch and barrier are the same."** A latch can't be reused, and its counters don't wait.
- **"A Semaphore(1) is the same as a lock."** It's not reentrant and has no owner.

#### Follow-up
**How do you make 10 test threads start at exactly the same moment?** Give them a `CountDownLatch(1)` start gate that each awaits, then `countDown()` it once from the test.

### A `ThreadPoolExecutor` has core 2, max 4 and an `ArrayBlockingQueue(2)`. Seven long-running tasks are submitted. What happens to each?
`id: tpe-submission-order` `level: advanced` `kind: output` `tricky` `lessons: threadpoolexecutor-internals`

#### Hints
1. When are threads beyond the core size created?
2. What happens when the queue is full and the pool is at its maximum?

#### Answer
```text
task 1 -> new core thread         threads=1 queue=0
task 2 -> new core thread         threads=2 queue=0
task 3 -> queued                  threads=2 queue=1
task 4 -> queued                  threads=2 queue=2
task 5 -> new extra thread        threads=3 queue=2
task 6 -> new extra thread        threads=4 queue=2
task 7 -> rejected (AbortPolicy: RejectedExecutionException)
```

The algorithm is: **core threads first, then the queue, then extra threads up to the maximum, then reject.** Extra threads are created only when the queue is **full**. This trace was reproduced exactly in the lesson. After the tasks finish, the two extra threads exit when idle longer than `keepAliveTime`.

#### Why other answers fall short
- **"Threads grow to 4 first, then tasks queue."** That's the intuitive but wrong order.
- **"Task 7 waits in the queue."** The queue is full, so it's rejected.

#### Follow-up
**What changes with an unbounded `LinkedBlockingQueue`?** The queue never fills, so the pool never grows beyond 2 threads, `maximumPoolSize` is ignored, and tasks queue without limit.

### Why can `Executors.newFixedThreadPool` take a service down under load?
`id: fixed-pool-unbounded-queue` `level: intermediate` `kind: scenario` `tricky` `lessons: executors-and-thread-pools,threadpoolexecutor-internals`

#### Hints
1. What queue does it use, and what is its capacity?
2. What happens when requests arrive faster than the pool processes them?

#### Answer
`newFixedThreadPool(n)` is `new ThreadPoolExecutor(n, n, 0, ms, new LinkedBlockingQueue<>())`, with an **unbounded** queue. When arrival rate exceeds processing rate (a slow database, a traffic spike):
- the queue grows **without limit**, holding tasks and everything they reference;
- **latency explodes** (each new task waits behind the backlog, often past client timeouts, so the work is wasted);
- memory climbs until **`OutOfMemoryError`**.

There's no back-pressure and no rejection signal. `newCachedThreadPool` has the mirror problem: unbounded **threads**.

Fix: an explicit `ThreadPoolExecutor` with a **bounded queue**, a deliberate **rejection policy** (abort and return 503, or `CallerRunsPolicy` for back-pressure), named threads, metrics on queue depth and rejections, and timeouts on the downstream calls. For blocking I/O on Java 21+, virtual threads plus a semaphore are an alternative.

#### Why other answers fall short
- **"Increase the pool size."** That moves the bottleneck downstream and still allows unbounded queueing.
- **"Fixed means bounded."** The *threads* are bounded; the *queue* isn't.

#### Follow-up
**What's Little's law, and how does it help size the queue and pool?** Average work in the system = arrival rate × average time in system. It tells you the concurrency needed for a target latency, and how quickly a queue grows when processing can't keep up.

### When should you use virtual threads?
`id: virtual-threads-when` `level: intermediate` `kind: scenario` `lessons: virtual-threads`

#### Hints
1. What does a virtual thread do when it blocks?
2. Does it help a CPU-bound computation?

#### Answer
Use them for **high concurrency of mostly-blocking work**: request-per-thread servers, fan-out calls to databases and HTTP services, message handlers. A blocked virtual thread **unmounts** from its carrier OS thread, so millions of waiting tasks cost little, and you keep simple blocking code instead of reactive chains.

Don't expect gains for **CPU-bound** work (still limited by cores), and:
- **don't pool them**: create one per task;
- **limit access to scarce resources with a `Semaphore`**, not a small pool;
- watch `ThreadLocal`-heavy code;
- remember downstream limits (connection pools);
- on **Java 21–23**, avoid blocking inside `synchronized` (pinning), which Java 24 fixed.

#### Why other answers fall short
- **"Virtual threads make code faster."** They make waiting cheaper; per-task latency is unchanged.
- **"Replace every thread pool with them."** CPU-bound pools and bounded resources still need explicit limits.

#### Follow-up
**What is pinning?** A virtual thread that can't unmount while blocked, holding its carrier: in Java 21–23, blocking inside `synchronized` or native frames. Detect it with JFR's `jdk.VirtualThreadPinned`.

### After a deploy, users occasionally see other users' data. The code uses a `ThreadLocal<User>` set in a filter. What's wrong?
`id: threadlocal-pool-leak` `level: intermediate` `kind: debugging` `tricky` `lessons: threadlocal-and-scoped-values`

```java
public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain) throws IOException, ServletException {
    CURRENT_USER.set(authenticate(req));
    chain.doFilter(req, res);
}
```

#### Hints
1. Do servlet container threads die after each request?
2. What happens when authentication fails for the next request on the same thread?

#### Answer
Request threads are **pooled and reused**. The filter sets the thread-local but never **removes** it, so the value outlives the request. If a later request on the same thread doesn't overwrite it (anonymous access, an early return, an exception before `set`, an `authenticate` that returns early), the code reads the **previous user's identity**: a security bug. The values also keep objects reachable, which leaks memory and, after redeploys, class loaders.

Fix:
```java
CURRENT_USER.set(authenticate(req));
try {
    chain.doFilter(req, res);
} finally {
    CURRENT_USER.remove();          // always, even on exceptions
}
```

The lesson reproduces the leak deterministically with a single-thread executor: task B saw the user task A set. On Java 25, `ScopedValue.where(CURRENT_USER, user).run(...)` removes the problem by design: the binding ends with the scope.

#### Why other answers fall short
- **"ThreadLocal values are cleared when the request ends."** Nothing clears them automatically; the thread lives on.
- **"Use `InheritableThreadLocal`."** It doesn't help with pools, and inherits stale values.

#### Follow-up
**Why don't async tasks (`@Async`, `CompletableFuture`) see the current user at all?** They run on other pool threads that never had the value. The context must be captured and restored (Spring's `TaskDecorator`, `DelegatingSecurityContextExecutor`), or passed explicitly.
