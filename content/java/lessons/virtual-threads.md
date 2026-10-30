## Concept explanation

### The problem virtual threads solve

A typical server request spends most of its time **waiting**: for the database, other services, files. With **platform threads** (1:1 with OS threads), each waiting request holds an expensive thread: about 1 MB of stack and kernel scheduling. A few thousand concurrent requests exhaust the machine long before the CPU is busy. The industry's answer was asynchronous code (callbacks, `CompletableFuture`, reactive streams), which scales but is hard to write, debug and profile.

**Virtual threads** (Project Loom, final in **Java 21**, JEP 444) are `java.lang.Thread`s implemented by the JVM rather than the OS:
- **Cheap**: a few hundred bytes to start, with stacks stored in the heap as small, growable chunks. Millions can exist.
- **Blocking is cheap**: when a virtual thread blocks on I/O, a lock or `sleep`, the JVM **unmounts** it from its OS **carrier thread** and runs another virtual thread there. The OS thread never sits idle waiting.
- **Same programming model**: plain blocking code, real stack traces, debuggers, `try/catch`, `ThreadLocal`s.

```java
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {   // a new virtual thread per task
    for (Request r : requests) {
        executor.submit(() -> handle(r));                            // blocking code inside is fine
    }
}                                                                    // close() waits for all tasks

Thread.ofVirtual().name("worker-", 0).start(task);                   // builder API
Thread.startVirtualThread(task);
```

### When they help, and when they don't

| Workload | Virtual threads? |
|---|---|
| many concurrent tasks that mostly **block on I/O** (HTTP calls, JDBC, files, messaging) | **yes**: the main use case; throughput scales with concurrency |
| **CPU-bound** computation | **no**: still limited by cores; use a pool sized to the CPUs, or parallel streams |
| a handful of long-running threads | no benefit |

Virtual threads make *waiting* cheap. They don't make code run faster.

### Rules of thumb

- **Don't pool virtual threads.** Create one per task; pooling is for expensive resources, and they aren't one. To **limit concurrency** (for example "at most 50 calls to the payment API"), use a **`Semaphore`**, not a small pool.
- **Pinning**: on Java 21–23, a virtual thread that blocks **inside a `synchronized` block** (or a native frame) **pins** its carrier: the carrier can't be reused until the block exits. Many pinned threads can starve the scheduler. The workaround was `ReentrantLock` around blocking calls. **Java 24 (JEP 491) removed pinning for `synchronized`**, so on 24+ it's no longer a concern (native frames still pin).
- **`ThreadLocal`s work** but are per thread. With millions of short-lived threads, avoid using them as caches of expensive objects. **Scoped values** (final in Java 25) are the lighter alternative for passing context.
- **They're always daemon threads**, and priorities don't apply.

### Structured concurrency (preview)

`StructuredTaskScope` treats a group of concurrent subtasks as **one unit of work**: they start inside a scope, the scope **waits** for them, if one fails the others are **cancelled**, and none can outlive the scope (no leaked threads). It's still a **preview** in Java 25 (fifth preview, JEP 505), so it needs `--enable-preview`, and the API changed between previews.

## Internal working

- **A virtual thread is a `Continuation`** (a resumable stack of frames) plus a scheduler. The default scheduler is a dedicated **`ForkJoinPool` in FIFO mode** whose worker threads are the **carriers**, with parallelism equal to the CPU count (`-Djdk.virtualThreadScheduler.parallelism`).
- **Mounting**: to run, a virtual thread's frames are mounted on a carrier. When it blocks (a socket read, `sleep`, `LockSupport.park`, `BlockingQueue.take`), the JDK code calls `Continuation.yield`: the frames are copied into a heap object and the carrier picks up another virtual thread. When the I/O is ready (via the NIO poller) or the timer fires, the thread is rescheduled, possibly on a different carrier.
- **The JDK was rewritten to cooperate**: sockets, `java.io` streams over sockets, `Thread.sleep`, `java.util.concurrent` locks and queues all *park* virtual threads instead of blocking carriers. File I/O and some native calls can't unmount; the scheduler **temporarily adds a carrier** to compensate.
- **Pinning** happened because a `synchronized` monitor was owned by the *carrier* thread in the JVM's lock implementation, so the frames couldn't be moved while holding it. Java 24 changed monitors to be owned by the virtual thread itself.
- **Diagnostics**: `jcmd <pid> Thread.dump_to_file -format=json` dumps virtual threads too, and JFR has `jdk.VirtualThreadPinned` and `jdk.VirtualThreadSubmitFailed` events. A virtual thread's `toString()` shows its current carrier, for example `VirtualThread[#22]/runnable@ForkJoinPool-1-worker-1`.

## Visual representation

```text title="Mounting and unmounting"
  carriers (platform threads):   C1                    C2
  virtual threads:               V1 runs on C1         V2 runs on C2
                                 V1: socket.read() -> blocks -> UNMOUNT (frames saved to the heap)
                                 C1 is free: mounts V3, V3 runs ...
                                 ...data arrives for V1 -> V1 re-queued -> later MOUNT on C2 (any carrier)

  Java 21-23 pinning:  synchronized (lock) { socket.read(); }   -> V1 can't unmount: C1 is blocked too
  Java 24+:            monitors are owned by the virtual thread -> V1 unmounts normally

  10,000 virtual threads sleeping 100 ms on ONE carrier  ->  ~0.1-0.2 s total
  10,000 tasks on 100 platform threads                   ->  ~10 s (100 waves of 100 ms)
```

## Java code example

Run on Java 21 with `-Djdk.virtualThreadScheduler.parallelism=1`, so all virtual threads share **one** carrier thread and pinning becomes visible.

```java title="VirtualThreadsDemo.java" file="VirtualThreadsDemo.java" java="21" run="-Djdk.virtualThreadScheduler.parallelism=1"
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.ReentrantLock;

public class VirtualThreadsDemo {
    static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    static String carrierOf(Thread t) {
        String s = t.toString();                              // VirtualThread[#22]/runnable@ForkJoinPool-1-worker-1
        return s.substring(s.indexOf('@') + 1);
    }

    static long twoBlockingSections(boolean useSynchronized) throws InterruptedException {
        long start = System.nanoTime();
        List<Thread> threads = new ArrayList<>();
        for (int i = 0; i < 2; i++) {
            Object monitor = new Object();
            ReentrantLock lock = new ReentrantLock();
            threads.add(Thread.ofVirtual().start(() -> {
                if (useSynchronized) {
                    synchronized (monitor) {
                        sleep(300);                           // blocks while holding a monitor
                    }
                } else {
                    lock.lock();
                    try {
                        sleep(300);
                    } finally {
                        lock.unlock();
                    }
                }
            }));
        }
        for (Thread t : threads) {
            t.join();
        }
        return (System.nanoTime() - start) / 1_000_000;
    }

    public static void main(String[] args) throws Exception {
        // 1. Creating virtual threads
        Thread vt = Thread.ofVirtual().name("vt-demo").start(() -> { });
        vt.join();
        System.out.println(vt.getName() + ": isVirtual=" + vt.isVirtual() + ", daemon=" + vt.isDaemon()
                + "; main isVirtual=" + Thread.currentThread().isVirtual());

        // 2. 10,000 blocking tasks, one virtual thread each, all on ONE carrier
        Set<String> carriers = ConcurrentHashMap.newKeySet();
        AtomicInteger finished = new AtomicInteger();
        long start = System.nanoTime();
        try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
            for (int i = 0; i < 10_000; i++) {
                executor.submit(() -> {
                    carriers.add(carrierOf(Thread.currentThread()));
                    sleep(100);                               // unmounts: the carrier runs others meanwhile
                    finished.incrementAndGet();
                });
            }
        }                                                     // close() waits for every task
        long ms = (System.nanoTime() - start) / 1_000_000;
        System.out.println(finished.get() + " tasks x 100 ms sleep finished in under 2 s: " + (ms < 2_000)
                + ", using " + carriers.size() + " carrier thread");

        // 3. Pinning on Java 21: blocking inside synchronized holds the carrier
        long pinned = twoBlockingSections(true);
        long unpinned = twoBlockingSections(false);
        System.out.println("synchronized + sleep: the two ran one after the other (>= 550 ms): " + (pinned >= 550));
        System.out.println("ReentrantLock + sleep: the two overlapped (< 450 ms): " + (unpinned < 450));
    }
}
```

The same pinning test on **Java 25**, where JEP 491 (Java 24) lets virtual threads block inside `synchronized` without holding their carrier:

```java title="PinningFixed.java" file="PinningFixed.java" java="25" run="-Djdk.virtualThreadScheduler.parallelism=1"
import java.util.ArrayList;
import java.util.List;

public class PinningFixed {
    public static void main(String[] args) throws InterruptedException {
        long start = System.nanoTime();
        List<Thread> threads = new ArrayList<>();
        for (int i = 0; i < 2; i++) {
            Object monitor = new Object();
            threads.add(Thread.ofVirtual().start(() -> {
                synchronized (monitor) {
                    try {
                        Thread.sleep(300);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                }
            }));
        }
        for (Thread t : threads) {
            t.join();
        }
        long ms = (System.nanoTime() - start) / 1_000_000;
        System.out.println("Java " + Runtime.version().feature() + ": synchronized + sleep on one carrier overlapped (< 450 ms): " + (ms < 450));
    }
}
```

Structured concurrency, a **preview** in Java 25: if one subtask fails, the scope cancels the others and `join()` throws.

```java title="StructuredDemo.java" file="StructuredDemo.java" java="25" preview="true"
import java.util.concurrent.StructuredTaskScope;
import java.util.concurrent.StructuredTaskScope.Subtask;

public class StructuredDemo {
    static String call(String what, long ms, boolean fail) throws InterruptedException {
        Thread.sleep(ms);
        if (fail) {
            throw new IllegalStateException(what + " failed");
        }
        return what;
    }

    public static void main(String[] args) throws Exception {
        try (var scope = StructuredTaskScope.open()) {         // default policy: all must succeed
            Subtask<String> user = scope.fork(() -> call("user", 50, false));
            Subtask<String> orders = scope.fork(() -> call("orders", 80, false));
            scope.join();                                     // waits for both subtasks
            System.out.println("both succeeded: " + user.get() + " + " + orders.get());
        }
        long start = System.nanoTime();
        try (var scope = StructuredTaskScope.open()) {
            scope.fork(() -> call("slow report", 5_000, false));
            scope.fork(() -> call("inventory", 50, true));
            scope.join();
        } catch (StructuredTaskScope.FailedException e) {
            long ms = (System.nanoTime() - start) / 1_000_000;
            System.out.println("failed: " + e.getCause().getMessage() + "; slow sibling cancelled, scope closed in under 1 s: " + (ms < 1_000));
        }
    }
}
```

## Output

`VirtualThreadsDemo.java` (Java 21):

```text title="Output" output="VirtualThreadsDemo.java"
vt-demo: isVirtual=true, daemon=true; main isVirtual=false
10000 tasks x 100 ms sleep finished in under 2 s: true, using 1 carrier thread
synchronized + sleep: the two ran one after the other (>= 550 ms): true
ReentrantLock + sleep: the two overlapped (< 450 ms): true
```

`PinningFixed.java` (Java 25):

```text title="Output" output="PinningFixed.java"
Java 25: synchronized + sleep on one carrier overlapped (< 450 ms): true
```

`StructuredDemo.java` (Java 25, `--enable-preview`):

```text title="Output" output="StructuredDemo.java"
both succeeded: user + orders
failed: inventory failed; slow sibling cancelled, scope closed in under 1 s: true
```

- Virtual threads are real `Thread`s (`isVirtual()` is true) and always daemons.
- Ten thousand tasks that each slept 100 ms finished in a fraction of a second, all on **one** carrier thread: every sleeping virtual thread unmounted and freed the carrier. With a pool of 100 platform threads, the same work would take about 10 seconds.
- On Java 21, two virtual threads sleeping **inside `synchronized`** pinned the single carrier, so they ran one after the other. With `ReentrantLock` they overlapped.
- On Java 25 the same `synchronized` code overlapped: pinning was removed in Java 24.
- The structured scope collected both results on success. On failure it cancelled the 5-second sibling right away, instead of leaking it.

## Real-world application

- **Spring Boot 3.2+** (`spring.threads.virtual.enabled=true`), **Tomcat/Jetty**, **Helidon Níma** and **Quarkus** can serve each request on a virtual thread, so blocking JDBC or HTTP code scales like asynchronous code.
- **Fan-out calls**: call 20 microservices in parallel with simple blocking code inside `newVirtualThreadPerTaskExecutor` (or a structured scope), with no `CompletableFuture` chains needed.
- **Messaging and batch I/O**: one virtual thread per message, file or partition, with a `Semaphore` protecting downstream limits (database connections, API rate limits).
- **Migration notes**:
  - check libraries for `synchronized` around blocking I/O if you're on 21–23;
  - remove thread pools used only to "limit threads";
  - keep connection pools, which still bound database concurrency;
  - watch `ThreadLocal`-heavy frameworks.

## Common mistakes

- **Using virtual threads for CPU-bound work** and expecting a speed-up.
- **Pooling virtual threads**, or limiting concurrency with a small fixed virtual-thread pool. Use a `Semaphore`.
- **On Java 21–23: long blocking calls inside `synchronized`**, which pin carriers and can deadlock the scheduler under load. Upgrade to 24+ or use `ReentrantLock`.
- **Caching expensive objects in `ThreadLocal`s**, which multiplies memory across millions of threads.
- **Assuming the database scales with them**: 10,000 virtual threads still share a 20-connection pool, so the bottleneck just moves.
- **Expecting structured concurrency APIs to be stable**: they're a preview, and the API has changed between releases.

## Interview questions

**Q1. What are virtual threads, and how are they different from platform threads?**

````reveal title="Answer"
Virtual threads (final in Java 21) are lightweight `Thread`s managed by the JVM. Many virtual threads are multiplexed onto a small pool of platform **carrier** threads (a `ForkJoinPool`). When a virtual thread blocks on I/O, `sleep` or a `j.u.c` lock, it unmounts: its stack is saved in the heap and the carrier runs another virtual thread. Platform threads map 1:1 to OS threads, with large fixed stacks and kernel scheduling. Virtual threads are cheap enough to create one per task (millions), keeping the simple blocking programming model with the scalability of async code.
````

**Q2. When should you use virtual threads, and when not?**

````reveal title="Answer"
Use them for high-concurrency workloads that mostly wait on blocking I/O: request-per-thread servers, fan-out calls to services and databases, message handling. Don't expect gains for CPU-bound work (still limited by cores; use a pool sized to the CPUs), and don't pool them. Limit concurrency to fragile resources with semaphores, and remember that downstream limits (connection pools, rate limits) still apply.
````

**Q3. What is pinning?**

````reveal title="Answer"
A virtual thread is pinned when it can't unmount from its carrier while blocking, so the carrier is blocked too. In Java 21–23 this happened when blocking inside a `synchronized` block or method (and inside native frames or foreign calls). Many pinned threads can exhaust the carriers. The fix was to use `ReentrantLock` around blocking operations. Java 24 (JEP 491) made monitors work with virtual threads, so `synchronized` no longer pins; native frames still do. JFR's `jdk.VirtualThreadPinned` event detects it.
````

**Q4. Should you pool virtual threads?**

````reveal title="Answer"
No. Pools exist to reuse expensive resources and bound their number, and virtual threads are cheap to create and discard. Use `Executors.newVirtualThreadPerTaskExecutor()` or `Thread.ofVirtual()`. If you need to limit concurrency (for example, at most 10 concurrent calls to a service), use a `Semaphore` around that call, so the limit applies to the resource rather than to threads.
````

**Q5. What is structured concurrency?**

````reveal title="Answer"
An approach (`StructuredTaskScope`, a preview in Java 21–25) where concurrent subtasks are scoped to a code block, like a method's control flow. Subtasks are forked inside a try-with-resources scope, the scope's `join()` waits for them, a configurable policy decides the outcome (for example all must succeed, or the first success wins), failures cancel the remaining subtasks, and no subtask can outlive the scope. This gives reliable cancellation, error propagation and observability (thread dumps show the task hierarchy).
````

## Hands-on exercise

Simulate fetching **1,000 URLs**, where each "fetch" sleeps 100 ms, using virtual threads, but never allow more than **50 concurrent fetches** (the remote server's limit):
- use `Executors.newVirtualThreadPerTaskExecutor()` with one task per URL;
- guard the fetch with a `Semaphore(50)`, and track the current and maximum number of in-flight fetches;
- report that all 1,000 completed, the maximum concurrency, and that the run took at least 2 s (1,000 × 100 ms ÷ 50) but well under the sequential 100 s.

````hint title="Hint"
Inside each task: `permits.acquire(); try { int now = inFlight.incrementAndGet(); max.accumulateAndGet(now, Math::max); Thread.sleep(100); inFlight.decrementAndGet(); } finally { permits.release(); }`. A thousand virtual threads wait on the semaphore cheaply: waiting threads are parked and unmounted.
````

````solution title="Solution"
```java title="LimitedFetcher.java" file="LimitedFetcher.java" java="21"
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicInteger;

public class LimitedFetcher {
    public static void main(String[] args) {
        Semaphore permits = new Semaphore(50);                 // the remote server's concurrency limit
        AtomicInteger inFlight = new AtomicInteger();
        AtomicInteger maxInFlight = new AtomicInteger();
        AtomicInteger fetched = new AtomicInteger();

        long start = System.nanoTime();
        try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
            for (int i = 0; i < 1_000; i++) {
                String url = "https://example.test/item/" + i;
                executor.submit(() -> {
                    permits.acquire();
                    try {
                        maxInFlight.accumulateAndGet(inFlight.incrementAndGet(), Math::max);
                        Thread.sleep(100);                     // the blocking "HTTP call" for url
                        inFlight.decrementAndGet();
                        fetched.incrementAndGet();
                    } finally {
                        permits.release();
                    }
                    return url;
                });
            }
        }
        long ms = (System.nanoTime() - start) / 1_000_000;
        System.out.println("fetched " + fetched.get() + " URLs, max concurrent " + maxInFlight.get() + " (limit 50)");
        System.out.println("took at least 2 s (limit respected) and under 6 s (far from the sequential 100 s): " + (ms >= 1_950 && ms < 6_000));
    }
}
```

```text title="Output" output="LimitedFetcher.java"
fetched 1000 URLs, max concurrent 50 (limit 50)
took at least 2 s (limit respected) and under 6 s (far from the sequential 100 s): true
```

One virtual thread per URL keeps the code a simple loop of blocking calls. The **semaphore**, not a thread pool, enforces the limit that actually matters: concurrent requests to the remote server. The 950 waiting tasks cost almost nothing while parked.
````

## Knowledge check

```quiz
? What happens when a virtual thread blocks on a socket read?
+ It unmounts from its carrier, which then runs other virtual threads
- Its carrier OS thread blocks until the data arrives
- The JVM creates a new OS thread for it
> Its stack is saved in the heap until the read can continue.

? Which workload benefits most from virtual threads?
+ Thousands of concurrent requests that mostly wait on database and HTTP calls
- Multiplying large matrices
- A single long-running background job
> Virtual threads make waiting cheap, not computation faster.

? How should you limit concurrent calls to a fragile service when using virtual threads?
+ With a Semaphore around the call
- With a fixed pool of 10 virtual threads
- With Thread priorities
> Pooling virtual threads is an anti-pattern.

? What caused pinning in Java 21-23?
+ Blocking inside a synchronized block or method (or a native frame)
- Using ReentrantLock
- Calling Thread.sleep outside a lock
> Java 24 removed pinning for synchronized.

? Are virtual threads daemon threads?
+ Yes, always
- No, never
- Only if setDaemon(true) is called
> They don't keep the JVM alive.
```

## Key takeaways

- **Virtual threads** (Java 21) are cheap JVM-managed threads multiplexed on a few **carrier** threads. **Blocking unmounts** them, so millions of mostly-waiting tasks scale with plain blocking code.
- Great for **I/O-bound concurrency**; no help for **CPU-bound** work. **Don't pool them**: use a **semaphore** to limit access to scarce resources.
- **Pinning** (blocking inside `synchronized`) was a Java 21–23 pitfall, fixed in **Java 24**. Native frames still pin.
- Mind `ThreadLocal` usage and downstream limits (connection pools).
- **Structured concurrency** (`StructuredTaskScope`) scopes subtasks, propagates failures and cancels siblings. It's still a **preview in Java 25**.
