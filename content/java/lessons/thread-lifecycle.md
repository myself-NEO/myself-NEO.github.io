## Concept explanation

### The six states

`Thread.getState()` returns one of six `Thread.State` values:

| State | Meaning | How a thread gets there |
|---|---|---|
| **`NEW`** | created, not started | `new Thread(...)` |
| **`RUNNABLE`** | running, or ready to run and waiting for a CPU, or blocked in native I/O | `start()`; leaving any waiting state |
| **`BLOCKED`** | waiting to **acquire a monitor** (enter `synchronized`) held by another thread | entering a contended `synchronized` block or method, or re-acquiring the monitor after `wait()` |
| **`WAITING`** | waiting **indefinitely** for another thread's action | `Object.wait()`, `Thread.join()`, `LockSupport.park()` (used by `java.util.concurrent` locks, queues and futures) |
| **`TIMED_WAITING`** | the same, but with a timeout | `Thread.sleep(ms)`, `wait(ms)`, `join(ms)`, `parkNanos`, `tryLock(timeout)`, `poll(timeout)` |
| **`TERMINATED`** | `run()` has completed or thrown | end of `run()` |

Java has **no separate "running" state**: the JVM doesn't know whether a `RUNNABLE` thread is on a CPU right now. A thread blocked in a socket read is also `RUNNABLE`. And a thread waiting for a `ReentrantLock` is `WAITING` (parked), **not** `BLOCKED`, which applies only to `synchronized` monitors.

### Scheduling

The **OS scheduler** decides which runnable threads get CPU time. Threads are **preempted** at any instruction, so you can never assume one thread "runs first" or "finishes before" another without explicit coordination.

- **Priorities** (`setPriority(1..10)`, default 5, inherited from the creating thread) are only **hints**. On Linux, HotSpot ignores them by default. Never use priorities for correctness.
- **`Thread.yield()`** hints that the current thread is willing to give up the CPU. It has no guaranteed effect and is rarely useful.
- **`Thread.onSpinWait()`** (Java 9) hints that the thread is in a spin loop, so the CPU can relax (the x86 `PAUSE` instruction).

### sleep, join and daemons

- **`Thread.sleep(ms)`** pauses the current thread (`TIMED_WAITING`) **without releasing any locks** it holds. It throws `InterruptedException` if interrupted.
- **`t.join()`** waits until `t` terminates. **`t.join(ms)`** waits at most `ms`; check `t.isAlive()` afterwards to know which happened. A successful `join` makes everything `t` did **visible** to the joining thread.
- **Daemon threads** (`setDaemon(true)`, before `start()`) don't keep the JVM alive. When the last non-daemon thread ends, the JVM exits and daemon threads are stopped abruptly: no `finally` blocks, no shutdown of resources. Use them for background helpers (monitoring, cache cleanup), never for work that must complete. New threads inherit daemon status from their creator.

## Internal working

- **The state is updated by the JVM** at transitions:
  - entering a contended monitor sets `BLOCKED`;
  - `park`/`wait` set `WAITING` or `TIMED_WAITING`;
  - returning to Java code sets `RUNNABLE`.

  `getState()` is a snapshot for monitoring, not for synchronisation: by the time you act on it, the state may have changed.
- **`wait()` vs `BLOCKED`**: after `notify()`, a waiting thread must re-acquire the monitor. Until it gets it, it's `BLOCKED`. That's why thread dumps sometimes show threads `BLOCKED` "on" a monitor they'll own when they continue.
- **`join()`** is implemented with `wait()` on the `Thread` object. When a thread terminates, the JVM calls `notifyAll()` on it. That's one reason to never use `Thread` objects as your own locks.
- **`sleep`** maps to OS timed waits. Its accuracy depends on the OS timer resolution, so `sleep(1)` can take 1–2 ms or more. Don't build timing logic on exact sleep durations.
- **The JVM exit sequence** (`DestroyJavaVM`): the main thread's return waits for the remaining non-daemon threads, then shutdown hooks run, then the VM halts, killing daemon threads wherever they are.
- **Context switches** cost microseconds (saving and restoring registers, cache and TLB effects). Thousands of busy platform threads on a few cores spend real time switching instead of working: another reason to size thread pools deliberately.

## Visual representation

```text title="Thread state machine"
                   start()
        NEW  -------------------->  RUNNABLE  <-------------------------------------+
                                     |  |  |                                        |
             contended synchronized  |  |  |  wait() / join() / park()              |
                  +------------------+  |  +-------------------+                     |
                  v                     |                      v                     |
               BLOCKED                  |                   WAITING                  |
                  |  monitor acquired   |                      | notify / unpark /   |
                  +---------------------+--> RUNNABLE <--------+ thread ended        |
                                        |                                            |
                                        | sleep(ms) / wait(ms) / join(ms) / parkNanos|
                                        v                                            |
                                  TIMED_WAITING ---- timeout or notify --------------+
                                        |
             run() returns or throws    v
                                  TERMINATED
```

## Java code example

One thread is driven through every state while `main` watches it with `getState()`. A helper polls until the expected state appears, so the output doesn't depend on timing.

```java title="ThreadLifecycle.java" file="ThreadLifecycle.java"
import java.nio.file.Path;
import java.util.List;

public class ThreadLifecycle {
    static volatile boolean keepSpinning = true;

    static void awaitState(Thread t, Thread.State expected) throws InterruptedException {
        long deadline = System.nanoTime() + 5_000_000_000L;
        while (t.getState() != expected) {
            if (System.nanoTime() > deadline) {
                throw new IllegalStateException(t.getName() + " never reached " + expected + ", is " + t.getState());
            }
            Thread.sleep(1);
        }
        System.out.println("observed: " + expected);
    }

    public static void main(String[] args) throws Exception {
        if (args.length == 1) {
            childJvm(args[0]);
            return;
        }
        Object lock = new Object();
        Thread subject = new Thread(() -> {
            while (keepSpinning) {
                Thread.onSpinWait();                       // RUNNABLE: busy on the CPU
            }
            sleepQuietly(300);                             // TIMED_WAITING
            synchronized (lock) {                          // BLOCKED until main releases the lock
                try {
                    lock.wait();                           // WAITING (and releases the lock)
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
        }, "subject");

        System.out.println("observed: " + subject.getState());
        synchronized (lock) {
            subject.start();
            awaitState(subject, Thread.State.RUNNABLE);
            keepSpinning = false;
            awaitState(subject, Thread.State.TIMED_WAITING);
            awaitState(subject, Thread.State.BLOCKED);     // main still holds the lock
        }
        awaitState(subject, Thread.State.WAITING);         // got the lock, then wait() released it
        synchronized (lock) {
            lock.notify();
        }
        subject.join();
        System.out.println("observed: " + subject.getState());

        // join with a timeout returns even if the thread is still running
        Thread slow = new Thread(() -> sleepQuietly(2_000), "slow");
        slow.setDaemon(true);
        slow.start();
        slow.join(100);
        System.out.println("join(100) returned; slow is still alive: " + slow.isAlive());

        // priorities are inherited hints
        Thread child = new Thread(() -> { });
        System.out.println("priorities: min " + Thread.MIN_PRIORITY + ", default " + child.getPriority() + ", max " + Thread.MAX_PRIORITY
                + "; main is daemon: " + Thread.currentThread().isDaemon() + ", child inherits daemon=" + child.isDaemon());

        // daemon vs non-daemon threads decide when the JVM exits
        for (String mode : List.of("daemon", "user")) {
            long start = System.nanoTime();
            Process p = new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", "java").toString(),
                    "-cp", System.getProperty("java.class.path"), "ThreadLifecycle", mode).redirectErrorStream(true).start();
            String out = new String(p.getInputStream().readAllBytes()).strip().replace(System.lineSeparator(), " | ");
            p.waitFor();
            long ms = (System.nanoTime() - start) / 1_000_000;
            System.out.println(mode + " background thread: child JVM printed [" + out + "]"
                    + (mode.equals("daemon") ? ", exited without waiting 5 s: " + (ms < 5_000) : ""));
        }
    }

    static void childJvm(String mode) {
        boolean daemon = mode.equals("daemon");
        Thread background = new Thread(() -> {
            sleepQuietly(daemon ? 5_000 : 300);                 // 5 s for the daemon, 300 ms for the user thread
            System.out.println("background finished");
        });
        background.setDaemon(daemon);
        background.start();
        System.out.println("main finished");
    }

    static void sleepQuietly(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
```

## Output

```text title="Output" output="ThreadLifecycle.java"
observed: NEW
observed: RUNNABLE
observed: TIMED_WAITING
observed: BLOCKED
observed: WAITING
observed: TERMINATED
join(100) returned; slow is still alive: true
priorities: min 1, default 5, max 10; main is daemon: false, child inherits daemon=false
daemon background thread: child JVM printed [main finished], exited without waiting 5 s: true
user background thread: child JVM printed [main finished | background finished]
```

- `subject` passed through all six states. Notice that it was `BLOCKED` while `main` held the lock, then `WAITING` inside `wait()`, which releases the lock it had just acquired.
- `join(100)` returned while `slow` was still running. Always check `isAlive()` after a timed join.
- New threads inherit priority 5 and the creator's daemon flag.
- With a **daemon** background thread, the child JVM exited as soon as `main` finished and the background work never printed. With a normal (**user**) thread, the JVM waited for it.

## Real-world application

- **Thread dumps** in production use exactly these states. Knowing that `BLOCKED` means "waiting for `synchronized`" while `WAITING (parking)` means "waiting for a `java.util.concurrent` lock, queue or future" points you to the right code.
- **Graceful shutdown**: application servers and frameworks keep the JVM alive with non-daemon threads (the HTTP connector, Kafka consumers) and stop them in shutdown hooks. Daemon threads suit heartbeats, metrics reporters and cleanup timers.
- **Timeouts everywhere**: `join(ms)`, `Future.get(timeout)`, `tryLock(timeout)` and `poll(timeout)` keep a stuck dependency from hanging a request forever.
- **Never sleep to synchronise**: tests that `sleep(100)` "to let the other thread start" are flaky in CI. Use latches, futures or `join` (next lessons).

## Common mistakes

- **Using `sleep` for coordination** ("wait until the other thread is ready"). It's timing-dependent and flaky.
- **Holding a lock while sleeping**: `sleep` doesn't release monitors, so everyone else blocks.
- **Calling `setDaemon` after `start()`** (`IllegalThreadStateException`), or making important work daemon so it's killed mid-write at exit.
- **Relying on priorities or `yield()`** for correctness or fairness.
- **Assuming `RUNNABLE` means "using CPU"**: threads waiting on sockets are `RUNNABLE` too.
- **Acting on `getState()`** for control flow: it's a stale snapshot. Use proper synchronisation.
- **Forgetting that `join` without a timeout can wait forever** if the other thread hangs.

## Interview questions

**Q1. What are the thread states in Java?**

````reveal title="Answer"
- `NEW`: created, not started.
- `RUNNABLE`: running, ready to run, or in native I/O.
- `BLOCKED`: waiting to acquire a `synchronized` monitor.
- `WAITING`: waiting indefinitely via `wait()`, `join()` or `LockSupport.park()`.
- `TIMED_WAITING`: the same with a timeout, or `sleep`.
- `TERMINATED`: finished.

Waiting for a `ReentrantLock` shows as `WAITING` or `TIMED_WAITING` (parking), not `BLOCKED`.
````

**Q2. What's the difference between `BLOCKED` and `WAITING`?**

````reveal title="Answer"
`BLOCKED` means the thread is trying to enter a `synchronized` block or method (or re-enter one after `wait`) and another thread holds the monitor. It proceeds automatically once the monitor is free. `WAITING` means the thread voluntarily suspended itself until another thread acts: `notify`, `unpark`, or the joined thread ending. `java.util.concurrent` locks, queues and futures park threads, so contention on them shows as `WAITING`, not `BLOCKED`.
````

**Q3. What is a daemon thread?**

````reveal title="Answer"
A background thread that doesn't prevent the JVM from exiting. When all non-daemon threads have finished, the JVM exits and daemon threads are stopped abruptly, without running `finally` blocks. Set it with `setDaemon(true)` before `start()`. New threads inherit the creator's status. Use daemons for helpers (monitoring, cleanup), never for work that must complete, such as writing files or committing transactions.
````

**Q4. Does `Thread.sleep()` release the locks a thread holds?**

````reveal title="Answer"
No. A sleeping thread keeps every monitor and lock it holds, so other threads that need them stay `BLOCKED` or `WAITING` for the whole sleep. `Object.wait()` is different: it releases the monitor of the object it's called on, and only that one, while waiting.
````

**Q5. What does `join()` do, and why does it matter for memory visibility?**

````reveal title="Answer"
`t.join()` makes the calling thread wait until `t` terminates (`join(ms)` waits at most that long; check `isAlive()` afterwards). Under the Java Memory Model, all actions of `t` happen-before a successful return from `join`, so the joining thread is guaranteed to see every write `t` made, with no `volatile` or locks needed for data handed off that way.
````

## Hands-on exercise

Run three "downloads" in parallel with a **global deadline** of 1 second:
- the workers sleep 50 ms, 100 ms and 3,000 ms respectively, and each records whether it finished or was interrupted;
- join each worker with only the **remaining** time until the deadline;
- after the deadline, report which workers finished, interrupt the stragglers, and join them;
- finally print each worker's state (all `TERMINATED`) and how it ended.

````hint title="Hint"
Compute `long deadline = System.nanoTime() + 1_000_000_000L;`, then for each worker `long remainingMs = Math.max(1, (deadline - System.nanoTime()) / 1_000_000); worker.join(remainingMs);`. Workers catch `InterruptedException` from `sleep` and record "cancelled". Store outcomes in a `ConcurrentHashMap`, or in a slot per worker that is read only after `join`.
````

````solution title="Solution"
```java title="DeadlineDownloads.java" file="DeadlineDownloads.java"
import java.util.ArrayList;
import java.util.List;

public class DeadlineDownloads {
    public static void main(String[] args) throws InterruptedException {
        long[] durations = {50, 100, 3_000};
        String[] outcome = new String[durations.length];          // each slot written by one worker
        List<Thread> workers = new ArrayList<>();
        for (int i = 0; i < durations.length; i++) {
            int id = i;
            Thread t = new Thread(() -> {
                try {
                    Thread.sleep(durations[id]);                       // simulated download
                    outcome[id] = "completed";
                } catch (InterruptedException e) {
                    outcome[id] = "cancelled";                         // interruption = cancellation request
                }
            }, "download-" + id + " (" + durations[id] + " ms)");
            workers.add(t);
            t.start();
        }

        long deadline = System.nanoTime() + 1_000_000_000L;
        for (Thread t : workers) {
            long remainingMs = Math.max(1, (deadline - System.nanoTime()) / 1_000_000);
            t.join(remainingMs);                                       // never waits past the global deadline
        }

        for (Thread t : workers) {
            System.out.println(t.getName() + " finished before the deadline: " + !t.isAlive());
            if (t.isAlive()) {
                t.interrupt();                                         // ask the straggler to stop
            }
        }
        for (Thread t : workers) {
            t.join();                                                  // stragglers end quickly once interrupted
        }
        for (int i = 0; i < workers.size(); i++) {
            System.out.println(workers.get(i).getName() + " -> " + workers.get(i).getState() + ", " + outcome[i]);
        }
    }
}
```

```text title="Output" output="DeadlineDownloads.java"
download-0 (50 ms) finished before the deadline: true
download-1 (100 ms) finished before the deadline: true
download-2 (3000 ms) finished before the deadline: false
download-0 (50 ms) -> TERMINATED, completed
download-1 (100 ms) -> TERMINATED, completed
download-2 (3000 ms) -> TERMINATED, cancelled
```

The total wait was bounded by the deadline, not by the slowest download. Writing each outcome to its own array slot and reading it only after `join()` is safe: `join` guarantees visibility of everything the worker wrote.
````

## Knowledge check

```quiz
? A thread is waiting to enter a synchronized block held by another thread. What is its state?
+ BLOCKED
- WAITING
- TIMED_WAITING
> BLOCKED is specific to monitor entry.

? A thread calls lock.lock() on a ReentrantLock held by someone else. What does getState() report?
+ WAITING
- BLOCKED
- RUNNABLE
> java.util.concurrent locks park threads.

? Which call does NOT release locks held by the current thread?
+ Thread.sleep(1000)
- lock.wait() on that lock's object
- Condition.await() on a condition of that ReentrantLock
> sleep keeps every lock; wait and await release the lock they belong to.

? When does the JVM exit (without System.exit)?
+ When all non-daemon threads have finished
- When main() returns
- When all threads, including daemons, have finished
> Daemon threads are stopped abruptly.

? What should you check after t.join(500) returns?
+ t.isAlive(), to know whether t finished or the timeout expired
- t.getPriority()
- Nothing; join only returns when t has finished
> Timed join returns either way.
```

## Key takeaways

- Six states: **NEW, RUNNABLE, BLOCKED, WAITING, TIMED_WAITING, TERMINATED**. `BLOCKED` applies only to `synchronized`; `j.u.c` locks show as WAITING (parking); `RUNNABLE` includes native I/O.
- Scheduling is preemptive and up to the OS. **Priorities and `yield` are hints**, never correctness tools.
- **`sleep` keeps locks**; **`join`** waits and guarantees visibility; timed `join` needs an `isAlive()` check.
- **Daemon** threads don't keep the JVM alive and are killed abruptly, so they're for helpers only.
- Coordinate with joins, futures, latches and locks, **never with sleeps**.
