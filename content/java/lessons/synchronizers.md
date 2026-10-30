## Concept explanation

**Synchronizers** coordinate *when* threads proceed, rather than protecting data. `java.util.concurrent` has five, and choosing the right one usually turns pages of `wait`/`notify` into a few lines.

| Synchronizer | Mental model | Reusable? | Key methods |
|---|---|---|---|
| **`CountDownLatch`** | a gate that opens once, after N events | **no** (one-shot) | `countDown()`, `await()`, `await(timeout)` |
| **`CyclicBarrier`** | N threads meet, then all continue together; repeats | **yes** | `await()`; optional barrier action |
| **`Semaphore`** | N permits: at most N holders at once | yes | `acquire()`, `tryAcquire(timeout)`, `release()` |
| **`Phaser`** | a reusable barrier where parties can join and leave between phases | yes | `register()`, `arriveAndAwaitAdvance()`, `arriveAndDeregister()` |
| **`Exchanger<V>`** | two threads swap objects at a meeting point | yes | `exchange(v)` |

### CountDownLatch

Initialised with a count. `countDown()` decrements it (any thread, any number of times), and `await()` blocks until it reaches zero. Once open it stays open. Typical uses:
- **"wait for N workers/services to finish or become ready"**;
- a **start gate**: `new CountDownLatch(1)` that releases many threads at once, which makes concurrency tests overlap.

### CyclicBarrier

`N` parties call `await()`, and all block until the N-th arrives, then all are released and the barrier **resets** for the next round. An optional **barrier action** runs once per round (in the last thread to arrive) before anyone is released, which is perfect for merging per-phase results. If one party is interrupted, times out or fails, the barrier is **broken**, and everyone gets `BrokenBarrierException`, so a phase can't silently proceed with missing work.

### Semaphore

A counter of **permits**. `acquire()` takes one, blocking if none are available; `release()` returns one. It's used to **bound concurrency**:
- at most 10 concurrent calls to a fragile downstream API;
- a pool of 5 connections;
- limiting in-flight requests per tenant.

Permits aren't owned: any thread can release, so pair `acquire`/`release` with `try`/`finally`. `tryAcquire(timeout)` lets callers fail fast instead of queueing forever. A semaphore with one permit is a **mutex**, but a non-reentrant one.

### Phaser

A flexible barrier for **multi-phase** work where the number of participants changes: workers can `register()` mid-way or `arriveAndDeregister()` when done. Overriding `onAdvance(phase, registeredParties)` runs code between phases and can terminate the phaser. It also supports tiering for very large party counts.

### Exchanger

Two threads meet, and each hands the other an object. The classic use is **double buffering**: a producer fills buffer A while a consumer drains buffer B, then they swap.

## Internal working

- **`CountDownLatch`** and **`Semaphore`** are thin wrappers over **AQS** in *shared* mode:
  - for a latch, the `state` is the count; `countDown` CAS-decrements it, and when it reaches zero, **all** queued threads are released (shared release propagates down the queue);
  - for a semaphore, the `state` is the number of permits, with fair or unfair acquisition like `ReentrantLock`.
- **`CyclicBarrier`** is implemented with a `ReentrantLock` and a `Condition`, plus a *generation* object. The last thread to arrive runs the barrier action, signals all, and starts a new generation. Breakage marks the generation broken and wakes everyone.
- **`Phaser`** packs the phase number, registered parties and unarrived parties into one `long` updated by CAS, with waiting implemented by a lock-free queue of nodes per phase parity. Its phase number wraps at `Integer.MAX_VALUE`.
- **Memory effects**:
  - actions before `countDown()` happen-before `await()` returning;
  - actions before `barrier.await()` happen-before actions after the barrier in other parties;
  - `release()` happens-before a successful `acquire()`;
  - `exchange` hands off safely.

  You can pass plain data through all of them without extra synchronisation.

## Visual representation

```text title="Five coordination shapes"
  CountDownLatch(3)      worker1 --countDown--+
                         worker2 --countDown--+--> count 0 --> main.await() returns   (one-shot)
                         worker3 --countDown--+

  CyclicBarrier(3)       T1 ---await--|                 |---await--|
                         T2 ---await--|--action-->all go--await----|--action--> ...      (reusable)
                         T3 ---await--|                 |---await--|
                                    phase 0                      phase 1

  Semaphore(3)           [permit][permit][permit]    4th acquire() waits until someone release()s

  Phaser                 parties: 3 -> (one arriveAndDeregister) -> 2 -> register() -> 3 ...

  Exchanger              producer: full buffer  <==exchange==>  consumer: empty buffer
```

## Java code example

```java title="SynchronizersDemo.java" file="SynchronizersDemo.java"
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.BrokenBarrierException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Exchanger;
import java.util.concurrent.Phaser;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

public class SynchronizersDemo {
    static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    public static void main(String[] args) throws Exception {
        // 1. CountDownLatch: a start gate and a completion latch
        CountDownLatch startGate = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(5);
        AtomicLong total = new AtomicLong();
        for (int i = 1; i <= 5; i++) {
            int part = i;
            new Thread(() -> {
                try {
                    startGate.await();                         // all workers start together
                    total.addAndGet(part * 100L);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    done.countDown();                          // always count down, even on failure
                }
            }).start();
        }
        startGate.countDown();
        System.out.println("latch: all 5 workers finished: " + done.await(5, TimeUnit.SECONDS) + ", total " + total.get());

        // 2. CyclicBarrier: 3 workers, 3 phases, a barrier action merging each phase
        AtomicLong phaseSum = new AtomicLong();
        AtomicInteger phase = new AtomicInteger();
        CyclicBarrier barrier = new CyclicBarrier(3, () ->
                System.out.println("barrier: phase " + phase.getAndIncrement() + " complete, running sum " + phaseSum.get()));
        List<Thread> workers = new ArrayList<>();
        for (int w = 1; w <= 3; w++) {
            int id = w;
            Thread t = new Thread(() -> {
                try {
                    for (int p = 0; p < 3; p++) {
                        phaseSum.addAndGet(id * 10L);             // this worker's part of the phase
                        barrier.await();                         // wait for the other two
                    }
                } catch (InterruptedException | BrokenBarrierException e) {
                    Thread.currentThread().interrupt();
                }
            });
            workers.add(t);
            t.start();
        }
        for (Thread t : workers) {
            t.join();
        }

        // 3. Semaphore: at most 3 tasks inside at once
        Semaphore permits = new Semaphore(3);
        AtomicInteger inside = new AtomicInteger();
        AtomicInteger maxInside = new AtomicInteger();
        List<Thread> tasks = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            Thread t = new Thread(() -> {
                try {
                    permits.acquire();
                    try {
                        maxInside.accumulateAndGet(inside.incrementAndGet(), Math::max);
                        sleep(50);                               // simulated call to a slow service
                        inside.decrementAndGet();
                    } finally {
                        permits.release();
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            });
            tasks.add(t);
            t.start();
        }
        for (Thread t : tasks) {
            t.join();
        }
        System.out.println("semaphore(3): 10 tasks ran, at most " + maxInside.get() + " at the same time");
        permits.acquire(3);                                    // take all permits
        System.out.println("tryAcquire(100 ms) with no permits left: " + permits.tryAcquire(100, TimeUnit.MILLISECONDS));
        permits.release(3);

        // 4. Phaser: parties leave between phases
        Phaser phaser = new Phaser(1) {                        // main is registered as a party
            @Override
            protected boolean onAdvance(int phaseNumber, int registered) {
                System.out.println("phaser: phase " + phaseNumber + " done with " + registered + " registered parties");
                return registered == 0;                          // terminate when everyone has left
            }
        };
        for (int w = 0; w < 3; w++) {
            int phasesToRun = w + 1;                            // worker 0 leaves after 1 phase, worker 2 after 3
            phaser.register();
            new Thread(() -> {
                for (int p = 0; p < phasesToRun - 1; p++) {
                    phaser.arriveAndAwaitAdvance();
                }
                phaser.arriveAndDeregister();
            }).start();
        }
        phaser.arriveAndDeregister();                          // main leaves; workers continue
        while (!phaser.isTerminated()) {
            Thread.sleep(5);
        }

        // 5. Exchanger: swap a full buffer for an empty one
        Exchanger<List<Integer>> exchanger = new Exchanger<>();
        Thread producer = new Thread(() -> {
            List<Integer> buffer = new ArrayList<>(List.of(1, 2, 3, 4, 5));
            try {
                List<Integer> back = exchanger.exchange(buffer);
                System.out.println("producer received a buffer of size " + back.size() + " to refill");
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        producer.start();
        List<Integer> received = exchanger.exchange(new ArrayList<>());
        producer.join();
        System.out.println("consumer received " + received);
    }
}
```

## Output

```text title="Output" output="SynchronizersDemo.java"
latch: all 5 workers finished: true, total 1500
barrier: phase 0 complete, running sum 60
barrier: phase 1 complete, running sum 120
barrier: phase 2 complete, running sum 180
semaphore(3): 10 tasks ran, at most 3 at the same time
tryAcquire(100 ms) with no permits left: false
phaser: phase 0 done with 2 registered parties
phaser: phase 1 done with 1 registered parties
phaser: phase 2 done with 0 registered parties
producer received a buffer of size 0 to refill
consumer received [1, 2, 3, 4, 5]
```

- The start gate released all five workers together, and the completion latch told `main` when they were done. `countDown` in `finally` guarantees the latch opens even if a worker fails.
- The `CyclicBarrier` ran its action exactly once per phase, after all three workers had added their part (60 per phase), and reset itself for the next round.
- The semaphore never let more than 3 of the 10 tasks in at once. With all permits taken, `tryAcquire` gave up after its timeout instead of hanging.
- The phaser's party count shrank as workers deregistered, and it terminated itself when the last party left.
- The exchanger swapped the full and empty buffers between the two threads.

## Real-world application

- **Tests**: a `CountDownLatch(1)` start gate maximises contention in concurrency tests; a completion latch with a timeout fails the test instead of hanging the build.
- **Application start-up**: wait for N subsystems (cache warm-up, connections, Kafka partition assignment) with a latch before accepting traffic.
- **Parallel batch phases**: simulations, game ticks and iterative algorithms (map, then reduce, then next iteration) use `CyclicBarrier` or `Phaser` with a merging action.
- **Bulkheads and rate protection**: Resilience4j's semaphore bulkhead, database connection limits, and "at most 20 concurrent calls to the payment provider" are semaphores.
- **Pipelines**: `Exchanger`-style double buffering in logging and I/O libraries, so producers never wait for a full flush.

## Common mistakes

- **Reusing a `CountDownLatch`**: it can't be reset. Use a `CyclicBarrier` or `Phaser` for repeated rounds.
- **Not counting down in `finally`**: one failing worker leaves `await()` waiting forever.
- **`await()` without a timeout** in production code and tests, which turns bugs into hangs.
- **Acquiring a semaphore permit without releasing it in `finally`**, which leaks permits until the system starves.
- **Releasing more permits than acquired**: semaphores don't check ownership, so the limit silently grows.
- **Ignoring `BrokenBarrierException`**: if one party fails, the others must stop or recover, not continue blindly.
- **Choosing the wrong tool**: a barrier for one-time events, or a latch for repeated phases.

## Interview questions

**Q1. `CountDownLatch` vs `CyclicBarrier`?**

````reveal title="Answer"
- **`CountDownLatch`**: one or more threads wait until a count reaches zero. The counting is done by any threads (often different from the waiters), it's **one-shot**, and the counters don't wait.
- **`CyclicBarrier`**: a fixed number of threads wait **for each other**. Each calls `await()`, all are released when the last arrives, an optional barrier action runs, and it **resets** for the next cycle. If a party fails or times out, the barrier breaks and the others get `BrokenBarrierException`.
````

**Q2. What is a `Semaphore` used for?**

````reveal title="Answer"
To limit how many threads can access a resource or perform an action at the same time, using N permits. Examples: bounding concurrent calls to a downstream service, implementing resource pools, throttling. `acquire()` blocks when no permits are left (`tryAcquire(timeout)` fails fast), and `release()` returns one. It doesn't track owners, so always release in `finally`, and only after a successful acquire.
````

**Q3. When would you use a `Phaser` instead of a `CyclicBarrier`?**

````reveal title="Answer"
When the number of participants changes between phases (parties `register` and `arriveAndDeregister` dynamically), when you need to know the phase number, when you want custom termination logic (`onAdvance`), or when there are very many parties (tiered phasers reduce contention). `CyclicBarrier` has a fixed party count.
````

**Q4. How would you make 10 threads start at exactly the same time in a test?**

````reveal title="Answer"
Use a start gate: create `CountDownLatch startGate = new CountDownLatch(1)`, have each thread call `startGate.await()` first, start all threads, then call `startGate.countDown()` once to release them together. Add a completion `CountDownLatch(10)` (counted down in `finally`) awaited with a timeout to know when they're all done. A `CyclicBarrier(10)` at the start of each thread works too.
````

**Q5. What memory guarantees do synchronizers provide?**

````reveal title="Answer"
They create happens-before edges:
- actions before `countDown()` happen-before actions after a successful `await()` on that latch;
- actions before a party's `barrier.await()` happen-before actions after the barrier in every party (and the barrier action runs between);
- `semaphore.release()` happens-before a subsequent successful `acquire()`;
- data passed through `Exchanger.exchange` is safely published.

So data handed off through them needs no extra synchronisation.
````

## Hands-on exercise

Build a tiny **connection pool** with a `Semaphore` (2 permits) and a `ConcurrentLinkedQueue` of connection names (`"conn-1"`, `"conn-2"`):
- `String borrow(long timeoutMs)`: `tryAcquire` with the timeout, then poll a connection; throw `IllegalStateException("pool exhausted")` on timeout.
- `void giveBack(String c)`: offer the connection back, then `release()`.

Show the sequence:
1. two borrowers take both connections;
2. a third `borrow(100)` fails;
3. one connection is returned;
4. the third borrow now succeeds, with the returned connection;
5. all are returned, and two permits are available again.

````hint title="Hint"
Acquire the permit **first**: it guarantees a connection is in the queue. Release **after** putting the connection back, so a woken borrower always finds one. Use `availablePermits()` to show the pool's state.
````

````solution title="Solution"
```java title="ConnectionPool.java" file="ConnectionPool.java"
import java.util.List;
import java.util.Queue;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

public class ConnectionPool {
    private final Queue<String> idle = new ConcurrentLinkedQueue<>();
    private final Semaphore permits;

    ConnectionPool(List<String> connections) {
        idle.addAll(connections);
        permits = new Semaphore(connections.size(), true);         // fair: borrowers served in order
    }

    String borrow(long timeoutMs) throws InterruptedException {
        if (!permits.tryAcquire(timeoutMs, TimeUnit.MILLISECONDS)) {
            throw new IllegalStateException("pool exhausted after " + timeoutMs + " ms");
        }
        return idle.poll();                                         // a permit guarantees one is there
    }

    void giveBack(String connection) {
        idle.offer(connection);                                     // put it back first...
        permits.release();                                          // ...then wake a waiting borrower
    }

    int available() {
        return permits.availablePermits();
    }

    public static void main(String[] args) throws InterruptedException {
        ConnectionPool pool = new ConnectionPool(List.of("conn-1", "conn-2"));
        String first = pool.borrow(100);
        String second = pool.borrow(100);
        System.out.println("borrowed " + first + " and " + second + ", available permits: " + pool.available());
        try {
            pool.borrow(100);
        } catch (IllegalStateException e) {
            System.out.println("third borrower: " + e.getMessage());
        }
        pool.giveBack(first);
        String third = pool.borrow(100);
        System.out.println("after one return, third borrower got " + third);
        pool.giveBack(second);
        pool.giveBack(third);
        System.out.println("all returned, available permits: " + pool.available());
    }
}
```

```text title="Output" output="ConnectionPool.java"
borrowed conn-1 and conn-2, available permits: 0
third borrower: pool exhausted after 100 ms
after one return, third borrower got conn-1
all returned, available permits: 2
```

The semaphore enforces the *count*; the queue holds the actual objects. Real pools (HikariCP) add validation, timeouts per borrower, leak detection and metrics on top of the same idea.
````

## Knowledge check

```quiz
? Which synchronizer can't be reset after it opens?
+ CountDownLatch
- CyclicBarrier
- Phaser
> Use a barrier or phaser for repeated rounds.

? Five threads must each finish phase 1 before any starts phase 2, for 10 phases. Which fits best?
+ CyclicBarrier(5)
- CountDownLatch(5)
- Semaphore(5)
> It resets automatically after each phase.

? What does Semaphore(3) guarantee?
+ At most 3 permits are held at any time
- Exactly 3 threads exist
- Threads run in groups of 3
> It bounds concurrency; release in finally.

? Why should a worker call latch.countDown() in a finally block?
+ So the latch still opens if the worker throws, instead of hanging the waiter
- Because countDown() must run after return
- For memory visibility
> One missed countDown means await() waits forever.

? What happens to the other parties if one thread waiting at a CyclicBarrier is interrupted?
+ The barrier breaks and they get BrokenBarrierException
- They keep waiting for a replacement
- The barrier action runs anyway
> Breakage stops a phase from proceeding with missing work.
```

## Key takeaways

- **`CountDownLatch`**: wait for N events, one-shot; start gates and completion signals.
- **`CyclicBarrier`**: N threads meet repeatedly, with a barrier action per round, and it breaks on failure.
- **`Semaphore`**: N permits to bound concurrency or pool resources. Release in `finally`, and use `tryAcquire(timeout)` to fail fast.
- **`Phaser`**: multi-phase barriers with dynamic parties. **`Exchanger`**: two-thread buffer swaps.
- All are built on AQS or locks and give **happens-before** hand-offs. Count down and release in `finally`, and always use timeouts.
