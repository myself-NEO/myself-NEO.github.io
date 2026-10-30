## Concept explanation

### Monitors and condition waiting

Every Java object has a **monitor**: a lock (used by `synchronized`) plus a **wait set**. Three `Object` methods coordinate threads through it:

| Method | Effect |
|---|---|
| `wait()` / `wait(ms)` | **releases the monitor**, suspends the thread in the object's wait set, and later **re-acquires the monitor** before returning |
| `notify()` | wakes **one** arbitrary thread in the wait set |
| `notifyAll()` | wakes **all** threads in the wait set; they compete to re-acquire the monitor |

All three **must be called while holding that object's monitor** (inside `synchronized (obj)`), or they throw `IllegalMonitorStateException`. Notifying doesn't release the lock: woken threads continue only after the notifier leaves its `synchronized` block.

### The guarded-block idiom

Threads wait for a **condition** ("the buffer isn't empty"), not for a notification. The only correct shape is:

```java
synchronized (lock) {
    while (!condition) {        // ALWAYS a loop, never an if
        lock.wait();
    }
    // condition holds, and we hold the lock: act on the state
}

synchronized (lock) {
    changeStateSoTheConditionMayHold();
    lock.notifyAll();           // after changing state, while holding the lock
}
```

Why a `while` loop?
- **Spurious wakeups**: the JVM and OS are allowed to wake a waiting thread for no reason.
- **Stolen conditions**: between being notified and re-acquiring the lock, another thread may have consumed the item.
- **Shared wait sets**: with `notifyAll`, threads waiting for *different* conditions wake up too and must re-check.

### Lost notifications

`notify()` has no memory: if nobody is waiting yet, the signal is gone. A thread that then starts waiting sleeps forever. Guarded blocks avoid this because the **state** (`condition`) remembers what happened: a thread that arrives late sees the condition is already true and never waits.

### notify vs notifyAll

- Use **`notifyAll()`** by default. It's always correct with guarded blocks, at the cost of waking threads that go back to sleep.
- **`notify()`** is safe only when all waiters wait for the **same condition** and any one of them can handle the change ("one item added, wake one consumer"). With producers and consumers sharing one monitor, `notify()` can wake a producer when a consumer was needed: the signal is wasted, and the system can stall with everyone waiting.

### wait vs sleep

| | `wait()` | `Thread.sleep()` |
|---|---|---|
| Defined in | `Object` | `Thread` (static) |
| Requires holding the monitor? | **yes** | no |
| Releases locks? | **releases this object's monitor** | **releases nothing** |
| Woken by | `notify`/`notifyAll`, timeout, interrupt, spuriously | timeout or interrupt |
| Purpose | wait for a **condition** changed by another thread | pause for **time** |

### In modern code

`wait`/`notify` is low-level. `java.util.concurrent` gives you higher-level, safer tools: `BlockingQueue` (producer/consumer), `CountDownLatch` and `CyclicBarrier`, `Semaphore`, `CompletableFuture`, and `ReentrantLock` with `Condition` (several wait sets per lock). Learn wait/notify to understand them, and to answer interview questions, but reach for the library first.

## Internal working

- **The monitor** (an `ObjectMonitor` in HotSpot, created when a lock is contended or `wait` is called) holds an *entry list* of threads trying to acquire the lock, and a **wait set** of threads that called `wait()`.
- **`wait()`**:
  1. adds the thread to the wait set;
  2. fully releases the monitor, even if it was acquired reentrantly several times, remembering the recursion count;
  3. parks the thread (`WAITING`).
- **`notify()`** moves one thread from the wait set to the entry queue; `notifyAll()` moves all of them. A moved thread is `BLOCKED` until it re-acquires the monitor, then returns from `wait()` with its recursion count restored.
- **Memory visibility**: the `synchronized` blocks around the state changes and checks give happens-before. Everything the notifier wrote before releasing the monitor is visible to the woken thread after it re-acquires it.
- **`wait(ms)`** can return because of the timeout, a notify or a spurious wakeup, and you can't tell which. Re-check the condition and the remaining time in the loop.
- **`Thread.join()`** is implemented as `wait()` on the `Thread` object, and the JVM calls `notifyAll()` on it when the thread dies. That's why using `Thread` objects (or other library objects) as your own monitors causes surprises. Lock on private final objects.

## Visual representation

```text title="Monitor: entry list and wait set"
                     +------------------- monitor of `lock` -------------------+
   synchronized  --> | entry list (BLOCKED): T3, T4      owner: T1               |
                     | wait set   (WAITING): T2 (called wait, released the lock) |
                     +----------------------------------------------------------+

   T1: changes state, calls notifyAll()  -> T2 moves from wait set to entry list
   T1: leaves synchronized               -> T2 / T3 / T4 compete; T2 re-acquires, re-checks `while (!cond)`

   lost notification:   notifier: notify()  (nobody waiting: signal lost)
                         waiter:   wait()     ...waits forever
   guarded block:        notifier: ready = true; notifyAll()
                         waiter:   while (!ready) wait()   -> ready is already true: never waits
```

## Java code example

```java title="WaitNotifyDemo.java" file="WaitNotifyDemo.java"
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

public class WaitNotifyDemo {
    // A bounded buffer built from guarded blocks
    static final class BoundedBuffer<T> {
        private final Deque<T> items = new ArrayDeque<>();
        private final int capacity;
        private int maxSeen;

        BoundedBuffer(int capacity) {
            this.capacity = capacity;
        }

        synchronized void put(T item) throws InterruptedException {
            while (items.size() == capacity) {         // wait for "not full"
                wait();
            }
            items.addLast(item);
            maxSeen = Math.max(maxSeen, items.size());
            notifyAll();                               // a consumer may be waiting for "not empty"
        }

        synchronized T take() throws InterruptedException {
            while (items.isEmpty()) {                  // wait for "not empty"
                wait();
            }
            T item = items.removeFirst();
            notifyAll();                               // a producer may be waiting for "not full"
            return item;
        }

        synchronized int maxSeen() {
            return maxSeen;
        }
    }

    public static void main(String[] args) throws Exception {
        // 1. Producers and consumers through a buffer of capacity 3
        BoundedBuffer<Integer> buffer = new BoundedBuffer<>(3);
        long[] consumed = new long[2];
        List<Thread> threads = new ArrayList<>();
        for (int p = 0; p < 2; p++) {
            int base = p * 1_000;
            threads.add(new Thread(() -> {
                try {
                    for (int i = 1; i <= 100; i++) {
                        buffer.put(base + i);
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }, "producer-" + p));
        }
        for (int c = 0; c < 2; c++) {
            int id = c;
            threads.add(new Thread(() -> {
                try {
                    for (int i = 0; i < 100; i++) {
                        consumed[id] += buffer.take();
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }, "consumer-" + c));
        }
        threads.forEach(Thread::start);
        for (Thread t : threads) {
            t.join();
        }
        long expected = 0;
        for (int p = 0; p < 2; p++) {
            for (int i = 1; i <= 100; i++) {
                expected += p * 1_000 + i;
            }
        }
        System.out.println("200 items moved, sum matches: " + (consumed[0] + consumed[1] == expected)
                + ", buffer never held more than " + buffer.maxSeen() + " items");

        // 2. wait() without holding the monitor
        Object lock = new Object();
        try {
            lock.wait();
        } catch (IllegalMonitorStateException e) {
            System.out.println("wait() outside synchronized -> IllegalMonitorStateException");
        }

        // 3. A lost notification: notify() before anyone waits
        synchronized (lock) {
            lock.notify();                             // nobody is waiting: the signal is lost
        }
        long start = System.nanoTime();
        synchronized (lock) {
            lock.wait(300);                            // waits the full timeout
        }
        System.out.println("bare wait() after an early notify() timed out: " + ((System.nanoTime() - start) / 1_000_000 >= 290));

        // The guarded version remembers the event in state, so a late waiter never waits
        boolean[] ready = {false};
        synchronized (lock) {
            ready[0] = true;
            lock.notifyAll();
        }
        start = System.nanoTime();
        synchronized (lock) {
            while (!ready[0]) {
                lock.wait();
            }
        }
        System.out.println("guarded wait() returned immediately: " + ((System.nanoTime() - start) / 1_000_000 < 100));

        // 4. wait() releases the monitor; sleep() keeps it
        Object monitor = new Object();
        Thread waiter = new Thread(() -> {
            synchronized (monitor) {
                try {
                    monitor.wait();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
        });
        waiter.start();
        while (waiter.getState() != Thread.State.WAITING) {
            Thread.sleep(1);
        }
        synchronized (monitor) {                       // possible only because wait() released it
            System.out.println("main entered the monitor while the waiter was in wait(): true");
            monitor.notifyAll();
        }
        waiter.join();

        Thread sleeper = new Thread(() -> {
            synchronized (monitor) {
                try {
                    Thread.sleep(300);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
        });
        sleeper.start();
        while (sleeper.getState() != Thread.State.TIMED_WAITING) {
            Thread.sleep(1);
        }
        Thread blocked = new Thread(() -> {
            synchronized (monitor) {
                System.out.println("second thread entered only after the sleeper finished");
            }
        });
        blocked.start();
        while (blocked.getState() != Thread.State.BLOCKED) {
            Thread.sleep(1);
        }
        System.out.println("while the holder sleeps, another thread is " + blocked.getState());
        sleeper.join();
        blocked.join();
    }
}
```

## Output

```text title="Output" output="WaitNotifyDemo.java"
200 items moved, sum matches: true, buffer never held more than 3 items
wait() outside synchronized -> IllegalMonitorStateException
bare wait() after an early notify() timed out: true
guarded wait() returned immediately: true
main entered the monitor while the waiter was in wait(): true
while the holder sleeps, another thread is BLOCKED
second thread entered only after the sleeper finished
```

- Two producers and two consumers moved 200 items through a 3-slot buffer without losing any, and the buffer never exceeded its capacity. Each side waited in a `while` loop for its own condition and woke everyone with `notifyAll()`.
- Calling `wait()` without the lock failed immediately.
- The early `notify()` was lost, and the bare `wait()` sat out its full timeout. With a `ready` flag, the late waiter saw the condition was already true and never waited.
- `main` could enter the monitor while the other thread was in `wait()`, but a thread that tried to enter while the holder was in `sleep()` stayed `BLOCKED` until the sleeper finished.

## Real-world application

- **`ArrayBlockingQueue`, `LinkedBlockingQueue`, `CountDownLatch` and `FutureTask`** implement exactly these guarded-wait patterns, using `ReentrantLock`/`Condition` or `LockSupport` rather than `Object.wait`.
- **Legacy code and frameworks** written before Java 5 still use wait/notify. Recognising the idiom (and its bugs: `if` instead of `while`, `notify` instead of `notifyAll`) is a common maintenance task.
- **Interview classics**: producer–consumer, odd/even printers, ping-pong and round-robin printing are wait/notify exercises (see the Practice section).
- **Configuration reload / "wait until ready"** patterns (a service waiting until its cache is warmed) are guarded blocks: a state flag, plus waiting for it to become true.

## Common mistakes

- **`if (!condition) wait();`** instead of `while`. Spurious wakeups and stolen conditions break it.
- **Calling `wait`/`notify` without holding that object's monitor**, or holding a *different* object's monitor (`IllegalMonitorStateException`).
- **Using `notify()` when waiters wait for different conditions**, which leads to missed wakeups and stalls.
- **Notifying without changing state first**, or waiting without a state variable at all, which causes lost notifications.
- **Using `sleep` to wait for another thread's work**, which is either too long or too short.
- **Locking on public or shared objects** (`this` in a public class, `Thread` objects, string literals), which lets unrelated code notify or steal your monitor. Use a `private final Object lock`.
- **Swallowing `InterruptedException` from `wait`**.

## Interview questions

**Q1. Why must `wait()` be called inside a loop?**

````reveal title="Answer"
Because returning from `wait()` doesn't guarantee the condition holds. Threads can wake spuriously; another thread may have changed the state again between the notification and this thread re-acquiring the lock; and with `notifyAll`, threads waiting for different conditions wake too. The loop `while (!condition) wait();` re-checks the condition while holding the lock before proceeding.
````

**Q2. What's the difference between `wait()` and `sleep()`?**

````reveal title="Answer"
- `wait()` is an `Object` method that must be called while holding that object's monitor. It **releases** the monitor while waiting and is woken by `notify`/`notifyAll`, a timeout, an interrupt or spuriously. It's used to wait for a condition.
- `Thread.sleep()` is a static `Thread` method that pauses for a time, can be called anywhere, and **releases no locks**.

Both throw `InterruptedException`.
````

**Q3. `notify()` vs `notifyAll()`: which should you use?**

````reveal title="Answer"
`notifyAll()` by default: it wakes every waiter, and each re-checks its condition, which is always correct with guarded blocks. `notify()` wakes one arbitrary waiter. It's safe and more efficient only when all waiters wait for the same condition and any single one can make progress. With mixed waiters (producers and consumers on one monitor), `notify()` can wake the wrong kind of thread and stall the system.
````

**Q4. Why are `wait`, `notify` and `notifyAll` defined in `Object` and not in `Thread`?**

````reveal title="Answer"
They operate on an object's **monitor**, the lock and wait set associated with every object, not on a thread. A thread waits *on an object* for a condition protected by that object's lock, and another thread notifies *that object*. Every object can be a lock in Java (`synchronized(obj)`), so every object needs a wait set.
````

**Q5. What is a lost notification, and how do guarded blocks prevent it?**

````reveal title="Answer"
`notify()` doesn't queue signals: if it happens before the other thread starts waiting, the notification is lost, and the waiter may wait forever. Guarded blocks pair every wait with a state variable: the notifier changes the state and then notifies (under the lock), and the waiter checks the state before (and after) waiting. A late waiter sees the state already changed and doesn't wait.
````

## Hands-on exercise

Implement a one-shot **`SimpleLatch`** (a mini `CountDownLatch`) using only `synchronized`, `wait` and `notifyAll`:
- `SimpleLatch(int count)`;
- `countDown()` decrements, and wakes all waiters when the count reaches zero (extra calls are ignored);
- `await()` blocks until the count is zero;
- `boolean await(long timeoutMs)` returns `false` if the timeout expires first, handling spurious wakeups correctly with the remaining time.

Test it:
1. three workers each do some work and call `countDown()`; `main` awaits and then prints the combined result;
2. a second latch with count 1 that nobody counts down must return `false` from `await(200)`.

````hint title="Hint"
Keep `private int count` guarded by `this`. `await(timeout)`: compute a deadline, then `while (count > 0) { long left = deadline - now; if (left <= 0) return false; wait(left); }`. `countDown()`: `if (count > 0 && --count == 0) notifyAll();`.
````

````solution title="Solution"
```java title="SimpleLatchDemo.java" file="SimpleLatchDemo.java"
import java.util.concurrent.atomic.AtomicInteger;

public class SimpleLatchDemo {
    static final class SimpleLatch {
        private int count;

        SimpleLatch(int count) {
            this.count = count;
        }

        synchronized void countDown() {
            if (count > 0 && --count == 0) {
                notifyAll();                                // release every waiter at once
            }
        }

        synchronized void await() throws InterruptedException {
            while (count > 0) {
                wait();
            }
        }

        synchronized boolean await(long timeoutMs) throws InterruptedException {
            long deadline = System.nanoTime() + timeoutMs * 1_000_000;
            while (count > 0) {
                long leftMs = (deadline - System.nanoTime()) / 1_000_000;
                if (leftMs <= 0) {
                    return false;                           // timed out
                }
                wait(leftMs);                               // may wake early: the loop re-checks
            }
            return true;
        }
    }

    public static void main(String[] args) throws InterruptedException {
        SimpleLatch done = new SimpleLatch(3);
        AtomicInteger total = new AtomicInteger();
        for (int i = 1; i <= 3; i++) {
            int part = i * 10;
            new Thread(() -> {
                total.addAndGet(part);                      // the "work"
                done.countDown();
            }, "worker-" + i).start();
        }
        done.await();
        System.out.println("all workers finished, total = " + total.get());
        done.countDown();                                   // extra calls are harmless
        System.out.println("await() on an open latch returns immediately: " + done.await(10));

        SimpleLatch never = new SimpleLatch(1);
        long start = System.nanoTime();
        boolean opened = never.await(200);
        System.out.println("await(200) on a latch nobody opens -> " + opened + " after >= 200 ms: "
                + ((System.nanoTime() - start) / 1_000_000 >= 195));
    }
}
```

```text title="Output" output="SimpleLatchDemo.java"
all workers finished, total = 60
await() on an open latch returns immediately: true
await(200) on a latch nobody opens -> false after >= 200 ms: true
```

The count is the latch's **state**, so workers that finish before `main` calls `await()` don't lose their signal, which is exactly why guarded blocks beat bare notifications. `java.util.concurrent.CountDownLatch` provides the same contract, built on `AbstractQueuedSynchronizer` instead of a monitor.
````

## Knowledge check

```quiz
? What happens when a thread calls wait() on an object?
+ It releases that object's monitor and waits until notified, interrupted or timed out
- It keeps the monitor and sleeps
- It releases every lock it holds
> Only the monitor of the object it waits on is released.

? Why is `if (!condition) wait();` wrong?
+ Spurious wakeups and state changes before re-acquiring the lock mean the condition may still be false
- if statements are not allowed in synchronized blocks
- wait() can only be used in for loops
> Always re-check in a while loop.

? What happens if you call notify() outside a synchronized block on that object?
+ IllegalMonitorStateException
- Nothing; the call is ignored
- All waiting threads wake up
> The calling thread must own the monitor.

? When is notify() (rather than notifyAll()) safe?
+ When all waiters wait for the same condition and any one of them can proceed
- Always; it's just faster
- Only with a single waiting thread that started first
> Mixed conditions on one monitor need notifyAll.

? Which statement about Thread.sleep() is true?
+ It doesn't release any locks the thread holds
- It releases the current object's monitor
- It must be called inside synchronized
> That's the key difference from wait().
```

## Key takeaways

- Every object has a **monitor** with a **wait set**. `wait`/`notify`/`notifyAll` require holding that monitor; `wait` **releases** it and re-acquires it before returning.
- Always use **guarded blocks**: a state variable plus `while (!condition) wait();`, changing state and then `notifyAll()` under the same lock.
- **Lost notifications** happen without state; **spurious wakeups** happen without loops. `notifyAll` is the safe default.
- `wait` vs `sleep`: monitor required and released vs no monitor and **no locks released**.
- In practice, prefer `BlockingQueue`, latches, `Condition` and futures, which are built on the same ideas.
