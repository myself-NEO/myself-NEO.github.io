## Concept explanation

### Java can't kill a thread, and that's a feature

There's no safe way to stop a thread from the outside. `Thread.stop()` was deprecated in Java 1.2 and throws `UnsupportedOperationException` since Java 20, because killing a thread mid-operation leaves locks released and data half-updated. Instead, Java uses **cooperative cancellation**: one thread *asks* another to stop, and the target decides when it's safe to do so.

### What `interrupt()` actually does

`t.interrupt()` sets `t`'s **interrupt status flag**, and that's all it does, except:
- if `t` is blocked in an **interruptible** method (`sleep`, `wait`, `join`, `BlockingQueue.take/put`, `Future.get`, `lockInterruptibly`, `Condition.await`, `CountDownLatch.await`, interruptible NIO channels), that method wakes up and throws **`InterruptedException`**, **clearing the flag**;
- if `t` is busy computing, nothing happens until `t` checks `Thread.currentThread().isInterrupted()`.

| Method | What it does |
|---|---|
| `t.interrupt()` | requests interruption of `t` |
| `t.isInterrupted()` | reads `t`'s flag, without changing it |
| `Thread.interrupted()` (static) | reads **and clears** the *current* thread's flag |

Some blocking is **not** interruptible: waiting to enter `synchronized` (`BLOCKED`), classic `java.io` socket and file streams, and `ReentrantLock.lock()` (use `lockInterruptibly()`).

### Handling `InterruptedException`

The exception means "someone wants this thread to stop". Never swallow it. Choose one of these:

1. **Propagate it**: declare `throws InterruptedException` and let the caller decide. That's the best option for library methods.
2. **Restore the flag**: `catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }`, used when you can't throw (inside `Runnable.run()`, for example). The code above you can still see the request.
3. **Finish the cancellation yourself** (clean up, return a partial result), when you *own* the thread's policy, as in a task's top-level loop.

Swallowing the exception (an empty catch, or catch-and-log-and-continue) erases the request, so the thread may never stop: shutdowns hang and pools leak threads.

### Cancellation in the executor world

- **`future.cancel(true)`** interrupts the thread running the task. `cancel(false)` only prevents a task that hasn't started.
- **`executor.shutdown()`** stops accepting tasks and lets queued ones finish. **`shutdownNow()`** interrupts running tasks and returns the queued tasks that never started.
- **Poison pills**: for queue consumers, a special "stop" item is often cleaner than interruption, because it drains in order.

## Internal working

- **The interrupt flag** lives in the thread, and the JVM also signals the thread's park/sleep "event" so blocked waits wake promptly. Interruptible JDK methods check the flag on entry and when they wake up; when they throw `InterruptedException`, they clear the flag first, by convention, so the exception *is* the signal.
- **`LockSupport.park()`** returns immediately (no exception) when the thread is interrupted. That's why `j.u.c` code checks `Thread.interrupted()` after parking and converts it into `InterruptedException`, or re-asserts the flag.
- **`FutureTask.cancel(true)`** atomically moves the task's state to `INTERRUPTING`, calls `runner.interrupt()`, then sets the state to `INTERRUPTED`. `get()` throws `CancellationException`, and `isCancelled()` returns `true`, even if the task ignores the interrupt and keeps running.
- **`ThreadPoolExecutor.shutdownNow()`** interrupts every worker thread and drains the queue. Tasks that ignore interruption keep the pool's threads alive, and `awaitTermination` times out.
- **Virtual threads** (Java 21) are interrupted the same way, and blocking socket I/O on them *is* interruptible, because it's implemented with NIO underneath.

## Visual representation

```text title="Cooperative cancellation"
  requester                         target thread
  ---------                         -------------------------------------------------
  t.interrupt()  -- sets flag -->   [busy loop]   checks isInterrupted()? -> stop cleanly
                                    [sleep/wait/take/get/await] -> InterruptedException (flag cleared)
                                         |
                                         +-- propagate:  throws InterruptedException
                                         +-- restore:    Thread.currentThread().interrupt(); return
                                         +-- swallow:    catch {} -> request LOST, thread keeps going  (bug)

  future.cancel(true) -> interrupt the running task      executor.shutdownNow() -> interrupt all workers
```

## Java code example

```java title="InterruptDemo.java" file="InterruptDemo.java"
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

public class InterruptDemo {
    static void pauseSwallowing() {
        try {
            Thread.sleep(200);
        } catch (InterruptedException e) {
            // BUG: the request is swallowed; the flag is now clear
        }
    }

    static void pauseRestoring() {
        try {
            Thread.sleep(200);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();          // restore the request for the caller
        }
    }

    static int runFiveSteps(boolean restoring, CountDownLatch firstStepStarted) {
        int steps = 0;
        while (steps < 5 && !Thread.currentThread().isInterrupted()) {
            if (steps == 0) {
                firstStepStarted.countDown();
            }
            if (restoring) {
                pauseRestoring();
            } else {
                pauseSwallowing();
            }
            steps++;
        }
        return steps;
    }

    public static void main(String[] args) throws Exception {
        // 1. Interrupting a sleeping thread
        Thread sleeper = new Thread(() -> {
            try {
                Thread.sleep(10_000);
            } catch (InterruptedException e) {
                System.out.println("sleeper: InterruptedException, flag now " + Thread.currentThread().isInterrupted());
            }
        });
        sleeper.start();
        Thread.sleep(50);
        sleeper.interrupt();
        sleeper.join();

        // 2. A busy loop must check the flag itself
        Thread cruncher = new Thread(() -> {
            long work = 0;
            while (!Thread.currentThread().isInterrupted()) {
                work++;
            }
            System.out.println("cruncher: noticed the flag and stopped cleanly after doing work: " + (work > 0));
        });
        cruncher.start();
        Thread.sleep(50);
        cruncher.interrupt();
        cruncher.join();

        // 3. Swallowing vs restoring the interrupt
        for (boolean restoring : new boolean[] {false, true}) {
            CountDownLatch started = new CountDownLatch(1);
            int[] steps = new int[1];
            Thread worker = new Thread(() -> steps[0] = runFiveSteps(restoring, started));
            worker.start();
            started.await();
            worker.interrupt();
            worker.join();
            System.out.println((restoring ? "restoring" : "swallowing") + " worker completed " + steps[0] + " of 5 steps");
        }

        // 4. isInterrupted() vs Thread.interrupted()
        Thread.currentThread().interrupt();
        System.out.println("isInterrupted: " + Thread.currentThread().isInterrupted()
                + ", interrupted(): " + Thread.interrupted() + ", then interrupted(): " + Thread.interrupted());

        // 5. Future.cancel(true) interrupts the running task
        ExecutorService pool = Executors.newSingleThreadExecutor();
        CountDownLatch running = new CountDownLatch(1);
        CountDownLatch sawInterrupt = new CountDownLatch(1);
        Future<String> report = pool.submit(() -> {
            running.countDown();
            try {
                Thread.sleep(10_000);
                return "done";
            } catch (InterruptedException e) {
                sawInterrupt.countDown();
                throw e;
            }
        });
        running.await();
        System.out.println("cancel(true) returned " + report.cancel(true) + ", isCancelled " + report.isCancelled()
                + ", task saw the interrupt: " + sawInterrupt.await(5, TimeUnit.SECONDS));
        try {
            report.get();
        } catch (CancellationException e) {
            System.out.println("get() on a cancelled future -> CancellationException");
        }

        // 6. shutdownNow interrupts running tasks and returns the ones never started
        CountDownLatch blocked = new CountDownLatch(1);
        pool.submit(() -> {
            blocked.countDown();
            Thread.sleep(10_000);
            return null;
        });
        pool.submit(() -> System.out.println("never runs"));
        blocked.await();
        List<Runnable> neverStarted = pool.shutdownNow();
        System.out.println("shutdownNow: " + neverStarted.size() + " queued task returned, terminated in time: "
                + pool.awaitTermination(5, TimeUnit.SECONDS));

        // 7. Interruptible blocking: a consumer waiting on take()
        BlockingQueue<String> queue = new ArrayBlockingQueue<>(10);
        Thread consumer = new Thread(() -> {
            try {
                queue.take();
            } catch (InterruptedException e) {
                System.out.println("consumer: woke from take() with InterruptedException");
            }
        });
        consumer.start();
        while (consumer.getState() != Thread.State.WAITING) {
            Thread.sleep(1);
        }
        consumer.interrupt();
        consumer.join();

        // 8. Waiting to enter synchronized is NOT interruptible
        Object monitor = new Object();
        Thread waitsForMonitor;
        synchronized (monitor) {
            waitsForMonitor = new Thread(() -> {
                synchronized (monitor) {
                    System.out.println("monitor waiter: entered only after main released the lock; interrupted flag "
                            + Thread.currentThread().isInterrupted());
                }
            });
            waitsForMonitor.start();
            while (waitsForMonitor.getState() != Thread.State.BLOCKED) {
                Thread.sleep(1);
            }
            waitsForMonitor.interrupt();
            Thread.sleep(100);
            System.out.println("monitor waiter after interrupt: " + waitsForMonitor.getState());
        }
        waitsForMonitor.join();
    }
}
```

## Output

```text title="Output" output="InterruptDemo.java"
sleeper: InterruptedException, flag now false
cruncher: noticed the flag and stopped cleanly after doing work: true
swallowing worker completed 5 of 5 steps
restoring worker completed 1 of 5 steps
isInterrupted: true, interrupted(): true, then interrupted(): false
cancel(true) returned true, isCancelled true, task saw the interrupt: true
get() on a cancelled future -> CancellationException
shutdownNow: 1 queued task returned, terminated in time: true
consumer: woke from take() with InterruptedException
monitor waiter after interrupt: BLOCKED
monitor waiter: entered only after main released the lock; interrupted flag true
```

- The sleeper woke immediately with `InterruptedException`, and the flag was **already cleared** inside the catch block.
- The busy `cruncher` got no exception; it stopped only because it checked `isInterrupted()`.
- The **swallowing** worker erased the request and ran all 5 steps. The **restoring** worker stopped after the interrupted step, because the loop condition saw the restored flag.
- `Thread.interrupted()` returned `true` once and cleared the flag, so the second call returned `false`.
- `cancel(true)` and `shutdownNow()` both worked by **interrupting** the task's thread. `shutdownNow` also handed back the queued task that never ran.
- A thread waiting to enter `synchronized` stayed `BLOCKED` despite the interrupt. It only proceeded when the lock was released, with its flag still set.

## Real-world application

- **Graceful shutdown**: Spring's `ThreadPoolTaskExecutor`, Kafka consumers (`consumer.wakeup()`), Netty event loops and Tomcat connectors all stop through interruption or a stop flag. Tasks that swallow interrupts are the classic cause of "the app takes 30 seconds to stop" or "Kubernetes had to SIGKILL the pod".
- **Timeouts**: `future.get(2, SECONDS)` followed by `future.cancel(true)` gives up on a slow call and frees the worker thread, if the task responds to interruption.
- **User cancellation**: a "Cancel export" button calls `cancel(true)` on the export task, which checks `isInterrupted()` between batches and deletes its temporary file in `finally`.
- **Virtual threads and structured concurrency** (later lessons) rely on interruption to cancel sibling subtasks when one fails.

## Common mistakes

- **Swallowing `InterruptedException`** (empty catch, or log and continue). Restore the flag, or propagate.
- **Wrapping it in `RuntimeException` without restoring the flag**, which loses the request for code further up.
- **Checking `Thread.interrupted()` when you meant `isInterrupted()`**, which clears the flag as a side effect.
- **Long CPU loops that never check the flag**: the task can't be cancelled.
- **Expecting `interrupt()` to unblock `synchronized`, classic socket reads or `ReentrantLock.lock()`.** Use `lockInterruptibly()`, socket timeouts or NIO.
- **Forgetting cleanup**: put resource release in `finally`, so a cancelled task doesn't leak files, connections or locks.
- **Calling `Thread.stop()`**: it's gone, and for good reason.

## Interview questions

**Q1. What does `Thread.interrupt()` do?**

````reveal title="Answer"
It sets the target thread's interrupt status flag. If the thread is blocked in an interruptible operation (`sleep`, `wait`, `join`, `BlockingQueue.take`, `Future.get`, `Condition.await`, `lockInterruptibly`…), that operation throws `InterruptedException` and clears the flag. Otherwise nothing happens until the thread checks `isInterrupted()`. It doesn't stop the thread; it's a cooperative request.
````

**Q2. How should you handle `InterruptedException`?**

````reveal title="Answer"
Don't swallow it. Either:
- propagate it, by declaring `throws InterruptedException`;
- or, if you can't throw (for example in `Runnable.run`), restore the flag with `Thread.currentThread().interrupt()` and return or stop promptly, so callers and the thread's owner can see the request.

Only code that owns the thread's cancellation policy, such as a task's top-level loop, should consume it, after cleaning up.
````

**Q3. What's the difference between `isInterrupted()` and `Thread.interrupted()`?**

````reveal title="Answer"
`t.isInterrupted()` is an instance method that reads `t`'s flag without changing it. `Thread.interrupted()` is a static method that reads the *current* thread's flag and **clears** it. Calling `Thread.interrupted()` twice in a row typically returns `true`, then `false`.
````

**Q4. How do you stop a thread in Java?**

````reveal title="Answer"
Cooperatively. Signal it with `interrupt()` (or a `volatile` stop flag, or a poison pill for queue consumers), and write the thread's code so it checks the signal regularly, responds to `InterruptedException` from blocking calls, cleans up in `finally`, and returns. With executors, use `Future.cancel(true)` or `shutdownNow()`, which interrupt the running tasks. `Thread.stop()` was unsafe and is now unsupported.
````

**Q5. Which blocking operations don't respond to interruption?**

````reveal title="Answer"
- waiting to enter a `synchronized` block or method (`BLOCKED`);
- `ReentrantLock.lock()` (use `lockInterruptibly()` or `tryLock` with a timeout);
- classic `java.io` stream and socket reads and writes (use socket timeouts, close the socket from another thread, or use NIO interruptible channels).

On virtual threads, socket I/O becomes interruptible.
````

## Hands-on exercise

Write a cancellable **batch consumer**:
- It takes items from a `BlockingQueue<String>`, processes each one (upper-cases it into a results list), and stops on interruption.
- Cleanup (printing "released resources") must run however it stops.
- It returns the number of items processed.
- Submit it to an executor and feed it three items. Wait until all three are processed, then cancel it with `cancel(true)` while it's blocked waiting for a fourth.
- Show that the future is cancelled, that cleanup ran, and that exactly three items were processed.

````hint title="Hint"
Loop with `while (!Thread.currentThread().isInterrupted())` around `queue.take()`, and catch `InterruptedException` to exit the loop (the task owns this thread's cancellation policy). Use a `CountDownLatch(3)` counted down per processed item, so the main thread knows when to cancel. Keep the results in a thread-safe list, or read them only after the cleanup latch.
````

````solution title="Solution"
```java title="CancellableConsumer.java" file="CancellableConsumer.java"
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

public class CancellableConsumer {
    public static void main(String[] args) throws Exception {
        BlockingQueue<String> queue = new LinkedBlockingQueue<>();
        List<String> results = new CopyOnWriteArrayList<>();
        CountDownLatch processedThree = new CountDownLatch(3);
        CountDownLatch cleanedUp = new CountDownLatch(1);
        int[] processed = new int[1];

        ExecutorService pool = Executors.newSingleThreadExecutor();
        Future<?> consumer = pool.submit(() -> {
            try {
                while (!Thread.currentThread().isInterrupted()) {
                    String item = queue.take();                 // blocks; responds to interruption
                    results.add(item.toUpperCase());
                    processed[0]++;
                    processedThree.countDown();
                }
            } catch (InterruptedException e) {
                // this task owns the thread's cancellation policy: stop here
            } finally {
                System.out.println("consumer: released resources");
                cleanedUp.countDown();
            }
        });

        for (String item : List.of("alpha", "beta", "gamma")) {
            queue.put(item);
        }
        processedThree.await();                                 // all three handled; consumer now waits in take()
        boolean cancelled = consumer.cancel(true);
        boolean cleaned = cleanedUp.await(5, TimeUnit.SECONDS);  // wait before printing: no interleaved output
        System.out.println("cancel(true): " + cancelled + ", isCancelled: " + consumer.isCancelled());
        System.out.println("cleanup ran: " + cleaned);
        System.out.println("processed " + processed[0] + " items: " + results);
        pool.shutdown();
        System.out.println("pool terminated: " + pool.awaitTermination(5, TimeUnit.SECONDS));
    }
}
```

```text title="Output" output="CancellableConsumer.java"
consumer: released resources
cancel(true): true, isCancelled: true
cleanup ran: true
processed 3 items: [ALPHA, BETA, GAMMA]
pool terminated: true
```

The task stopped promptly because `take()` is interruptible, and the `finally` block guaranteed cleanup. Reading `processed[0]` after `cleanedUp.await()` is safe: the latch establishes happens-before from the consumer's writes to the main thread's reads.
````

## Knowledge check

```quiz
? What does t.interrupt() do to a thread that is busy computing in a loop?
+ Sets its interrupt flag; nothing else happens unless the loop checks it
- Throws InterruptedException inside the loop
- Stops the thread immediately
> Interruption is cooperative.

? After catching InterruptedException from sleep(), what is the thread's interrupt flag?
+ false: the flag was cleared when the exception was thrown
- true
- It depends on the operating system
> Restore it with Thread.currentThread().interrupt() if you can't propagate.

? What is the best way to handle InterruptedException inside Runnable.run(), where you can't rethrow it?
+ Restore the flag with Thread.currentThread().interrupt() and stop promptly
- Ignore it and continue
- Wrap it in a RuntimeException and keep looping
> Swallowing erases the cancellation request.

? Which call can't be interrupted while waiting?
+ Entering a synchronized block held by another thread
- BlockingQueue.take()
- Thread.sleep()
> Monitor entry (BLOCKED) ignores interruption.

? What does future.cancel(true) do to a running task?
+ Interrupts the thread running it
- Kills the thread
- Nothing, if the task has already started
> cancel(false) wouldn't interrupt a running task.
```

## Key takeaways

- Java stops threads **cooperatively**: `interrupt()` sets a flag; interruptible blocking calls throw **`InterruptedException`** and **clear** it; busy code must check `isInterrupted()`.
- Never swallow `InterruptedException`: **propagate it** or **restore the flag**. `Thread.interrupted()` clears it; `isInterrupted()` doesn't.
- `Future.cancel(true)` and `shutdownNow()` cancel by interrupting. Tasks must respond and clean up in `finally`.
- `synchronized` entry, `lock()` and classic I/O aren't interruptible. Prefer `lockInterruptibly`, timeouts and NIO.
- Design every long-running task to be cancellable: it's what makes shutdowns, timeouts and failure handling work.
