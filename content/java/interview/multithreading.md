# Multithreading

### What is the difference between a process and a thread?
`id: process-vs-thread` `level: beginner` `kind: concept` `lessons: processes-and-threads`

#### Hints
1. What does each one have its own copy of?
2. What happens to the others when one crashes?

#### Answer
A **process** is a running program with its **own address space**: heap, static data, file handles. A **thread** is a path of execution **inside** a process. Threads of the same process **share the heap** (all objects and static fields), and each has its own **stack** and **program counter**.

| | Process | Thread |
|---|---|---|
| Memory | isolated | shared heap |
| Communication | IPC (sockets, pipes, files) | shared objects, which need synchronisation |
| Cost | heavy to create and switch | lighter |
| Failure | isolated | `System.exit` or a fatal error ends all threads |

In Java, one `java` process is one JVM, and a classic `Thread` is a platform thread mapped 1:1 to an OS thread. Java 21 adds virtual threads, multiplexed onto a few OS threads.

#### Why other answers fall short
- **"Threads are lightweight processes."** That's partly true at the OS level, but it misses the key difference: shared memory, and with it the need for synchronisation.
- **"Threads have separate memory."** Only their stacks are separate.

#### Follow-up
**Why might you still choose separate processes?** For failure and security isolation (a crash or memory corruption stays contained), independent deployment and scaling (microservices), or running untrusted code.

### What does this print?
`id: start-vs-run-output` `level: beginner` `kind: output` `tricky` `lessons: processes-and-threads`

```java
Thread t = new Thread(() -> System.out.println("running in " + Thread.currentThread().getName()), "worker");
t.run();
t.start();
t.join();
t.start();
```

#### Hints
1. Does `run()` create a thread?
2. How many times can one `Thread` object be started?

#### Answer
```text
running in main
running in worker
Exception in thread "main" java.lang.IllegalThreadStateException
```

- `t.run()` is an ordinary method call, so the lambda runs on the **calling** thread (`main`).
- `t.start()` creates a new thread named `worker` that calls `run()`.
- A `Thread` can be started **only once**. After it terminates, a second `start()` throws `IllegalThreadStateException`.

#### Why other answers fall short
- **"running in worker" twice.** `run()` doesn't create a thread.
- **"It restarts the thread."** Threads can't be restarted; create a new `Thread`, or submit the task to an executor again.

#### Follow-up
**How would you run the same task repeatedly on background threads?** Submit the `Runnable` to an `ExecutorService` (or a `ScheduledExecutorService`) as many times as needed. Tasks are reusable; `Thread` objects aren't.

### `Runnable` vs `Callable` vs `Thread`: how should you define work for a thread?
`id: runnable-vs-callable` `level: beginner` `kind: concept` `lessons: processes-and-threads,executors-and-thread-pools`

#### Hints
1. Which one can return a value?
2. Which one can throw a checked exception?

#### Answer
- **`Runnable`**: `void run()`. No result, no checked exceptions.
- **`Callable<V>`**: `V call() throws Exception`. Returns a value and may throw. Run it via `ExecutorService.submit` or a `FutureTask`, and get the result or exception from the **`Future`** (`get()` wraps task exceptions in `ExecutionException`).
- **Extending `Thread`**: couples the task to one execution mechanism and uses up your single superclass. Avoid it unless you're customising thread behaviour.

Prefer `Runnable`/`Callable` lambdas submitted to an executor (or virtual threads), which separates *what* runs from *how* it runs.

#### Why other answers fall short
- **"Callable is just Runnable with a return value."** It also allows checked exceptions, and needs an executor or `FutureTask` to run.
- **"Extend Thread, it's simpler."** You lose pooling, reuse and composability.

#### Follow-up
**How do you run a `Callable` without an executor?** Wrap it in `FutureTask<V> ft = new FutureTask<>(callable)`, run `new Thread(ft).start()`, then call `ft.get()`.

### What are the thread states? Which state does a thread waiting for a `ReentrantLock` show?
`id: thread-states-reentrantlock` `level: intermediate` `kind: concept` `tricky` `lessons: thread-lifecycle,explicit-locks`

#### Hints
1. There are six `Thread.State` values.
2. `BLOCKED` is specific to one kind of lock.

#### Answer
- `NEW`: created, not started.
- `RUNNABLE`: running, ready to run, **or blocked in native I/O**.
- `BLOCKED`: waiting to enter a **`synchronized`** monitor.
- `WAITING`: waiting indefinitely: `wait()`, `join()`, **`LockSupport.park()`**.
- `TIMED_WAITING`: the same with a timeout, or `sleep`.
- `TERMINATED`: finished.

A thread waiting for a **`ReentrantLock`** (or any `java.util.concurrent` lock, queue, latch or future) is **`WAITING`** (or `TIMED_WAITING` with `tryLock(timeout)`), because those are built on `LockSupport.park`. Thread dumps show it as `WAITING (parking)` with `parking to wait for <0x…> (a …ReentrantLock$NonfairSync)`.

#### Why other answers fall short
- **"BLOCKED, like any lock."** Only intrinsic monitors produce `BLOCKED`.
- **"RUNNING."** There's no such state; Java doesn't distinguish running from ready.

#### Follow-up
**A thread dump shows hundreds of `RUNNABLE` threads but low CPU. Why?** They're probably blocked in native socket reads, which are reported as `RUNNABLE`. Look at their top frames (`socketRead0`, `epollWait`).

### What's the difference between `sleep()` and `wait()`?
`id: sleep-vs-wait` `level: beginner` `kind: concept` `tricky` `lessons: wait-and-notify,thread-lifecycle`

#### Hints
1. Which one requires holding a lock?
2. Which one releases a lock?

#### Answer
| | `Thread.sleep(ms)` | `obj.wait()` |
|---|---|---|
| Defined in | `Thread` (static) | `Object` |
| Must hold `obj`'s monitor? | no | **yes**, otherwise `IllegalMonitorStateException` |
| Releases locks? | **no**: keeps every lock it holds | **releases `obj`'s monitor** while waiting, re-acquires it before returning |
| Wakes on | timeout or interrupt | `notify`/`notifyAll`, timeout, interrupt, or spuriously |
| Purpose | pause for time | wait for a **condition** another thread changes |

Both throw `InterruptedException`.

#### Why other answers fall short
- **"Both release locks."** `sleep` holds them all, blocking other threads.
- **"wait releases all locks."** Only the monitor of the object it's called on.

#### Follow-up
**Why must `wait()` be called inside a `while` loop?** Spurious wakeups, and other threads changing the state between the notification and re-acquiring the lock. The thread must re-check its condition.

### Why must `wait()` be called in a loop, and what is a lost notification?
`id: wait-loop-lost-notification` `level: intermediate` `kind: debugging` `lessons: wait-and-notify`

```java
synchronized (lock) {
    if (!ready) {
        lock.wait();
    }
    use(data);
}
```

#### Hints
1. Can `wait()` return although `ready` is still false?
2. What if the other thread set `ready` and notified *before* this thread reached `wait()`?

#### Answer
Two bugs threaten this code:
- **The `if` should be `while`.** `wait()` may return spuriously, or another consumer may have taken the data between the notification and this thread re-acquiring the lock. The thread must re-check: `while (!ready) lock.wait();`.
- **Lost notifications** are what the `ready` flag prevents. `notify()` isn't remembered: if it's called before anyone waits, the signal disappears. Because the waiter checks **state** (`ready`) before waiting, a late arrival sees `ready == true` and never waits. Code that waits **without** a state check (a bare `lock.wait()` waiting for "the next notify") can wait forever.

The correct idiom: change the state and `notifyAll()` under the lock; wait with `while (!condition) wait();` under the same lock.

#### Why other answers fall short
- **"`if` is fine because `notify` wakes exactly when the condition holds."** Spurious wakeups and competing threads break that assumption.
- **"Use `sleep` in a loop instead."** That's polling: wasteful, and slow to react.

#### Follow-up
**What library classes remove the need for this code?** `BlockingQueue`, `CountDownLatch`, `CompletableFuture`, and `ReentrantLock` with `Condition`. They implement these guarded waits correctly.

### `notify()` or `notifyAll()`?
`id: notify-vs-notifyall` `level: intermediate` `kind: scenario` `lessons: wait-and-notify,explicit-locks`

#### Hints
1. What if producers and consumers wait on the same monitor?
2. Who gets woken by `notify()`?

#### Answer
`notify()` wakes **one arbitrary** waiter; `notifyAll()` wakes **all**, and each re-checks its condition.
- Use **`notifyAll()` by default**: with guarded `while` loops it's always correct.
- `notify()` is only safe when **all waiters wait for the same condition** and **any one** of them can handle the change.

In a bounded buffer where producers wait for "not full" and consumers for "not empty" on **one** monitor, `notify()` can wake another producer when a consumer was needed. The signal is wasted, and the system can stall with everyone waiting. `ReentrantLock` with two `Condition`s (`notFull`, `notEmpty`) makes targeted `signal()` safe, because each condition has one kind of waiter.

#### Why other answers fall short
- **"Always use `notify()` for performance."** That risks missed wakeups and stalls.
- **"`notifyAll` causes race conditions."** Not with `while` loops; it only costs extra wakeups.

#### Follow-up
**How does `ArrayBlockingQueue` avoid this?** One `ReentrantLock` with two `Condition`s, so `put` signals `notEmpty` and `take` signals `notFull`.

### What is a daemon thread?
`id: daemon-threads` `level: beginner` `kind: concept` `lessons: thread-lifecycle`

#### Hints
1. Does the JVM wait for it before exiting?
2. Do its `finally` blocks run at exit?

#### Answer
A **daemon** thread is a background thread that **doesn't keep the JVM alive**. When the last non-daemon (user) thread finishes, the JVM exits and daemon threads are **stopped abruptly**: no `finally` blocks, no cleanup. Mark a thread with `setDaemon(true)` **before** `start()` (afterwards, it throws `IllegalThreadStateException`). New threads inherit daemon status from their creator. GC and JIT helper threads, `Finalizer`, `Reference Handler`, and all virtual threads are daemons.

Use daemons for helpers (metrics reporters, cache cleanup, heartbeats), never for work that must finish (writing files, committing transactions).

#### Why other answers fall short
- **"Daemon threads have low priority."** Daemon status is unrelated to priority.
- **"The JVM waits for daemon threads to finish."** It doesn't.

#### Follow-up
**Why does a program with an unclosed `ExecutorService` never exit?** Its worker threads are non-daemon by default. Call `shutdown()`, or use a `ThreadFactory` that creates daemon threads.

### What does `join()` guarantee besides waiting?
`id: join-visibility` `level: intermediate` `kind: concept` `lessons: thread-lifecycle,java-memory-model`

#### Hints
1. Can the joining thread safely read data the worker wrote without `volatile`?
2. Which Java Memory Model rule applies?

#### Answer
`t.join()` blocks until `t` terminates, **and** creates a **happens-before** edge: every action of `t` happens-before the successful return from `join()`. The joining thread is therefore guaranteed to see all of `t`'s writes (results stored in arrays, fields, collections) without `volatile` or locks. That's why "start workers, join them all, then read their results" is correct. Similar edges exist for `Thread.start()` (the parent's prior writes are visible to the new thread) and `Future.get()`.

`join(ms)` returns after the timeout even if `t` is still running; check `t.isAlive()` before relying on its results.

#### Why other answers fall short
- **"`join` just waits; you still need volatile."** Not for data written before termination: `join` already provides the visibility.
- **"`join(1000)` always means the thread finished."** Only if `isAlive()` is false.

#### Follow-up
**Does `Thread.sleep(1000)` give the same guarantee as `join()`?** No. Timing creates no happens-before edge; without one, the reader may see stale values.

### How do you stop a thread in Java?
`id: stop-a-thread` `level: intermediate` `kind: concept` `lessons: interrupts-and-cancellation`

#### Hints
1. What happened to `Thread.stop()`?
2. What is the interrupt flag?

#### Answer
**Cooperatively.** Java can't safely kill a thread: `Thread.stop()` was deprecated because it released locks mid-update and left objects corrupted, and it has thrown `UnsupportedOperationException` since Java 20. Instead:
1. **Signal** the thread: `t.interrupt()`, a `volatile boolean running = false`, or a poison pill on its queue.
2. **The thread checks the signal** regularly (`Thread.currentThread().isInterrupted()`), and treats `InterruptedException` from blocking calls (`sleep`, `wait`, `take`, `get`, `await`) as the request to stop.
3. **It cleans up** in `finally` and returns.

With executors: `future.cancel(true)` interrupts a task, and `shutdownNow()` interrupts all tasks. Blocking that isn't interruptible (`synchronized` entry, classic socket I/O) needs timeouts or closing the resource.

#### Why other answers fall short
- **"Call `Thread.stop()`."** It's unsafe, and now unsupported.
- **"`interrupt()` kills the thread."** It only sets a flag and wakes interruptible blocking calls.

#### Follow-up
**Why is a `volatile` stop flag alone sometimes insufficient?** A thread blocked in `sleep`, `take` or `wait` doesn't check the flag until it wakes up; `interrupt()` wakes it immediately. Many designs use both.

### What happens when a thread, or a submitted task, throws an uncaught exception?
`id: uncaught-exception-thread` `level: intermediate` `kind: concept` `tricky` `lessons: processes-and-threads,executors-and-thread-pools`

#### Hints
1. Does the exception reach `main`?
2. What does `submit()` wrap the task in?

#### Answer
- **A raw thread**: the exception terminates **only that thread**. It goes to the thread's `UncaughtExceptionHandler` (then the group's, then the default one, which prints the stack trace to `System.err`). Other threads and the JVM continue.
- **`executor.execute(task)`**: the same. The worker thread dies, the handler prints the exception, and the pool **replaces** the worker.
- **`executor.submit(task)`**: the task is wrapped in a `FutureTask`, which **catches** the exception and stores it in the `Future`. Nothing is printed; you only see it when calling `future.get()`, which throws `ExecutionException` with the original as its cause. Fire-and-forget `submit` therefore **loses errors silently**.
- **`CompletableFuture`**: the future completes exceptionally; `join()` throws `CompletionException`.

#### Why other answers fall short
- **"The program crashes."** Only that thread ends.
- **"`submit` and `execute` behave the same."** `submit` hides exceptions in the future.

#### Follow-up
**How do you make sure background failures are noticed?** Set a default `UncaughtExceptionHandler` that logs and alerts, check every `Future`, log inside tasks, or override `ThreadPoolExecutor.afterExecute` to inspect futures and throwables.

### Can two threads run a static synchronized method and an instance synchronized method of the same class at the same time?
`id: static-vs-instance-lock` `level: intermediate` `kind: concept` `tricky` `lessons: synchronized-and-intrinsic-locks`

```java
class Counter {
    static synchronized void staticWork() { /* long work */ }
    synchronized void instanceWork() { /* ... */ }
}
// thread A: Counter.staticWork();   thread B: counter.instanceWork();
```

#### Hints
1. Which object does each method lock?
2. Are those locks related?

#### Answer
**Yes, they run concurrently.** A `static synchronized` method locks the **`Counter.class` object**; an instance `synchronized` method locks **`this`**. They're different monitors, so neither blocks the other (verified: the instance method ran while another thread held the class lock). Consequences:
- static fields mutated by instance synchronised methods aren't protected against static synchronised methods;
- to share protection, both must use the same lock, for example `synchronized (Counter.class)` in the instance method, or a common `private static final Object LOCK`.

#### Why other answers fall short
- **"No, synchronized locks the whole class."** Only static synchronised methods lock the `Class` object.
- **"Synchronized methods of the same class always exclude each other."** Only if they synchronise on the same object.

#### Follow-up
**Do `a.instanceWork()` and `b.instanceWork()` on two different `Counter` instances block each other?** No. Each instance is its own lock.

### Implement a producer–consumer with `wait`/`notifyAll`.
`id: producer-consumer-wait-notify` `level: intermediate` `kind: coding` `lessons: wait-and-notify,concurrent-collections-in-practice`

#### Hints
1. Producers wait while the buffer is full; consumers wait while it's empty.
2. Which object's monitor do both use?

#### Answer
```java
class BoundedBuffer {
    private final Deque<Integer> items = new ArrayDeque<>();
    private final int capacity;

    BoundedBuffer(int capacity) { this.capacity = capacity; }

    synchronized void put(int value) throws InterruptedException {
        while (items.size() == capacity) {   // guarded wait: re-check after every wakeup
            wait();
        }
        items.addLast(value);
        notifyAll();                         // wake consumers (and anyone else) to re-check
    }

    synchronized int take() throws InterruptedException {
        while (items.isEmpty()) {
            wait();
        }
        int value = items.removeFirst();
        notifyAll();                         // a producer may be waiting for space
        return value;
    }
}
// one producer putting 1..100 through a buffer of 2 and one consumer taking 100 items -> sum 5050
```

Key points:
- one monitor (`this`) guards the state;
- `while` loops, not `if`;
- `notifyAll` after **every** state change, because producers and consumers share the wait set;
- `InterruptedException` is propagated so callers can cancel.

In production, use `ArrayBlockingQueue`, which does exactly this with a `ReentrantLock` and two conditions.

#### Why other answers fall short
- **Using `if` instead of `while`**: it breaks on spurious wakeups or with multiple consumers.
- **`notify()`**: it may wake a thread of the wrong kind and stall.
- **Calling `wait()` outside `synchronized`**: `IllegalMonitorStateException`.

#### Follow-up
**How would you shut the consumers down cleanly?** Send one poison-pill value per consumer after the last real item, or interrupt them (`take()` throws `InterruptedException`).

### Print 1 to 10 with two threads: one prints odd numbers, the other even numbers, strictly alternating.
`id: odd-even-semaphores` `level: intermediate` `kind: coding` `lessons: synchronizers,wait-and-notify`

#### Hints
1. Each thread must wait for its turn and then hand the turn to the other.
2. A semaphore with zero permits makes a thread wait until another releases it.

#### Answer
Two semaphores pass the turn back and forth:

```java
class OddEven {
    private final Semaphore oddTurn = new Semaphore(1);    // odd goes first
    private final Semaphore evenTurn = new Semaphore(0);
    private final int max;

    OddEven(int max) { this.max = max; }

    void printOdd() throws InterruptedException {
        for (int i = 1; i <= max; i += 2) {
            oddTurn.acquire();                              // wait for my turn
            System.out.println("odd:" + i);
            evenTurn.release();                             // hand the turn over
        }
    }

    void printEven() throws InterruptedException {
        for (int i = 2; i <= max; i += 2) {
            evenTurn.acquire();
            System.out.println("even:" + i);
            oddTurn.release();
        }
    }
}
// two threads -> odd:1, even:2, odd:3, ... even:10 (verified, strictly alternating)
```

The same structure works with `wait`/`notifyAll` and a shared `turn` variable (`while (turn != ODD) wait();`), or with `ReentrantLock` and two `Condition`s. Semaphores need the least code and can't lose a signal, because permits are remembered.

#### Why other answers fall short
- **`Thread.sleep` between prints**: alternation then depends on timing and will eventually break.
- **A non-volatile `turn` flag with busy-waiting**: visibility bugs and wasted CPU.

#### Follow-up
**How would you generalise to N threads printing in round-robin?** Create an array of N semaphores where only the first has a permit. Thread *i* acquires `sem[i]`, prints, and releases `sem[(i + 1) % N]`.
