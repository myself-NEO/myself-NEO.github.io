## Concept explanation

`java.util.concurrent.locks` (Java 5) offers locks as ordinary objects, with features `synchronized` lacks.

### ReentrantLock

```java
private final ReentrantLock lock = new ReentrantLock();

lock.lock();
try {
    // critical section
} finally {
    lock.unlock();               // ALWAYS in finally: nothing releases it for you
}
```

Same semantics as `synchronized` (mutual exclusion, reentrancy, happens-before from `unlock` to the next `lock`), plus:

| Feature | API | Why it matters |
|---|---|---|
| **Try without blocking** | `tryLock()` | do something else if the lock is busy |
| **Timeouts** | `tryLock(100, MILLISECONDS)` | avoid waiting forever; a way out of deadlocks |
| **Interruptible waiting** | `lockInterruptibly()` | cancellable acquisition (`synchronized` entry isn't interruptible) |
| **Fairness** | `new ReentrantLock(true)` | grant the lock in arrival order: no starvation, lower throughput |
| **Multiple conditions** | `lock.newCondition()` | separate wait sets: `notFull`, `notEmpty` |
| **Introspection** | `isLocked()`, `getHoldCount()`, `hasQueuedThreads()` | monitoring, tests, assertions |

The cost is discipline: forgetting `unlock()` (or calling it outside `finally`) leaks the lock forever.

### Condition

A `Condition` is the `ReentrantLock` equivalent of `wait`/`notify`: `await()` releases the lock and waits, `signal()`/`signalAll()` wake waiters. Because each condition has its **own wait set**, a bounded buffer can wake only consumers when an item arrives (`notEmpty.signal()`) and only producers when space frees up (`notFull.signal()`), making `signal()` safe where `notify()` wasn't. The same rule applies: `while (!condition) cond.await();`.

### ReadWriteLock

`ReentrantReadWriteLock` has two locks:
- the **read lock** can be held by **many readers at once**, as long as no writer holds the write lock;
- the **write lock** is **exclusive**.

It helps only when reads **heavily** outnumber writes **and** each read holds the lock long enough to matter. For short critical sections, its bookkeeping often makes it *slower* than a plain lock, and a `ConcurrentHashMap` or an immutable snapshot published through a `volatile` reference usually beats both. Rules:
- **Downgrading** (hold write → acquire read → release write) is allowed.
- **Upgrading** (hold read → acquire write) is **not**: it deadlocks, because the writer waits for all readers, including itself.
- Writers can be starved by a continuous stream of readers unless fairness is enabled.

### StampedLock (Java 8)

A non-reentrant lock with three modes: write, read, and **optimistic read**. An optimistic read takes no lock at all. You read the fields into locals and then `validate(stamp)`: if no write happened in between, the values are consistent; otherwise you retry with a real read lock. It's very fast for read-mostly data with tiny critical sections. But it's **not reentrant**, has no `Condition`s, and must be used exactly in the documented pattern.

```java
long stamp = lock.tryOptimisticRead();
double x = this.x, y = this.y;            // copy fields to locals
if (!lock.validate(stamp)) {              // a write happened: fall back
    stamp = lock.readLock();
    try { x = this.x; y = this.y; } finally { lock.unlockRead(stamp); }
}
return Math.hypot(x, y);                  // use the consistent copies
```

### synchronized or ReentrantLock?

Default to `synchronized`: it's simpler, can't leak, and is just as fast in modern JVMs. Choose `ReentrantLock` when you need `tryLock`, timeouts, interruptible acquisition, fairness or multiple conditions, or virtual threads on Java 21–23, where blocking inside `synchronized` pinned the carrier.

## Internal working

- **AQS**: `ReentrantLock`, `ReentrantReadWriteLock`, `Semaphore`, `CountDownLatch` and `FutureTask` are built on **`AbstractQueuedSynchronizer`**:
  - an `int state` (the hold count for a lock; read and write counts packed into 16-bit halves for a RW lock; permits for a semaphore);
  - a FIFO **CLH-style queue** of waiting threads;
  - state changes by CAS, blocking via `LockSupport.park`/`unpark`.
- **Acquiring**: try a CAS on `state`. If it fails, enqueue a node, park, and retry when unparked by the predecessor's release.
- **Fair vs unfair**:
  - **Unfair** (the default) lets an arriving thread **barge**: it tries the CAS before queueing, which often wins because the woken queued thread needs time to get scheduled. That gives higher throughput, with possible starvation.
  - **Fair** checks `hasQueuedPredecessors()` and always queues behind earlier threads.
- **Conditions** keep their own queue of waiting nodes. `signal()` transfers the first one to the lock's queue, and it re-acquires the lock before `await()` returns.
- **Read/write state**: the upper 16 bits count read holds, the lower 16 bits write holds. Readers increment with CAS, which is cheap without writers but causes cache-line contention on many cores. `StampedLock` avoids this with a version counter: an optimistic read is just reading the version.
- **Thread dumps** show threads waiting for these locks as `WAITING (parking)` with `parking to wait for <0x…> (a java.util.concurrent.locks.ReentrantLock$NonfairSync)`, and list the owned synchronizers per thread.

## Visual representation

```text title="AQS: state + queue"
  ReentrantLock                         state = hold count (0 = free)
  +-------------------------------------------------------------------+
  | state: 1   owner: T1                                              |
  | queue: head -> [T2 parked] -> [T3 parked] -> tail                 |
  +-------------------------------------------------------------------+
  T1.unlock(): state 1 -> 0, unpark T2 -> T2 CASes state 0 -> 1 (unfair: a newcomer T4 may barge first)

  ReentrantReadWriteLock        state = [ read count : 16 bits | write count : 16 bits ]
     readers R1 R2 R3 hold read  -> writer W queued until all three release
     R1 holds read, calls writeLock().lock()  -> waits for readers to leave, including itself: DEADLOCK

  StampedLock optimistic read:  stamp = version; read x, y; validate(stamp)? use : retry with readLock()
```

## Java code example

```java title="ExplicitLocks.java" file="ExplicitLocks.java"
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;
import java.util.concurrent.locks.ReentrantReadWriteLock;
import java.util.concurrent.locks.StampedLock;

public class ExplicitLocks {
    static final class BoundedBuffer {                    // two Conditions on one lock
        private final ReentrantLock lock = new ReentrantLock();
        private final Condition notFull = lock.newCondition();
        private final Condition notEmpty = lock.newCondition();
        private final Deque<Integer> items = new ArrayDeque<>();
        private final int capacity;

        BoundedBuffer(int capacity) {
            this.capacity = capacity;
        }

        void put(int item) throws InterruptedException {
            lock.lock();
            try {
                while (items.size() == capacity) {
                    notFull.await();
                }
                items.addLast(item);
                notEmpty.signal();                        // wakes a consumer only
            } finally {
                lock.unlock();
            }
        }

        int take() throws InterruptedException {
            lock.lock();
            try {
                while (items.isEmpty()) {
                    notEmpty.await();
                }
                int item = items.removeFirst();
                notFull.signal();                         // wakes a producer only
                return item;
            } finally {
                lock.unlock();
            }
        }
    }

    static final class Point {                            // StampedLock-protected coordinates
        private final StampedLock sl = new StampedLock();
        private double x;
        private double y;

        void move(double dx, double dy) {
            long stamp = sl.writeLock();
            try {
                x += dx;
                y += dy;
            } finally {
                sl.unlockWrite(stamp);
            }
        }

        String distance(Runnable betweenReads) {
            long stamp = sl.tryOptimisticRead();
            double cx = x;
            betweenReads.run();                           // test hook: maybe a writer runs here
            double cy = y;
            if (sl.validate(stamp)) {
                return "optimistic read valid, distance " + Math.hypot(cx, cy);
            }
            stamp = sl.readLock();                        // fall back to a real read lock
            try {
                return "optimistic read invalidated, re-read under lock: distance " + Math.hypot(x, y);
            } finally {
                sl.unlockRead(stamp);
            }
        }
    }

    public static void main(String[] args) throws Exception {
        ReentrantLock lock = new ReentrantLock();

        // 1. Reentrancy and hold count
        lock.lock();
        lock.lock();
        System.out.println("hold count after locking twice: " + lock.getHoldCount());
        lock.unlock();
        lock.unlock();

        // 2. tryLock and tryLock with timeout while another thread holds the lock
        CountDownLatch held = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        Thread owner = new Thread(() -> {
            lock.lock();
            try {
                held.countDown();
                release.await();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } finally {
                lock.unlock();
            }
        });
        owner.start();
        held.await();
        long start = System.nanoTime();
        System.out.println("tryLock(): " + lock.tryLock() + ", tryLock(200 ms): " + lock.tryLock(200, TimeUnit.MILLISECONDS)
                + " after waiting >= 200 ms: " + ((System.nanoTime() - start) / 1_000_000 >= 195));

        // 3. lockInterruptibly can be cancelled while waiting
        Thread waiter = new Thread(() -> {
            try {
                lock.lockInterruptibly();
                lock.unlock();
            } catch (InterruptedException e) {
                System.out.println("waiter: interrupted while waiting for the lock");
            }
        });
        waiter.start();
        while (!lock.hasQueuedThread(waiter)) {
            Thread.sleep(1);
        }
        waiter.interrupt();
        waiter.join();
        release.countDown();
        owner.join();

        // 4. Conditions: a bounded buffer with separate wait sets
        BoundedBuffer buffer = new BoundedBuffer(2);
        int[] sum = new int[1];
        Thread consumer = new Thread(() -> {
            try {
                for (int i = 0; i < 50; i++) {
                    sum[0] += buffer.take();
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        consumer.start();
        for (int i = 1; i <= 50; i++) {
            buffer.put(i);
        }
        consumer.join();
        System.out.println("buffer moved 1..50 through 2 slots, sum " + sum[0]);

        // 5. A fair lock grants the lock in arrival order
        ReentrantLock fair = new ReentrantLock(true);
        List<String> order = new CopyOnWriteArrayList<>();
        fair.lock();
        List<Thread> queued = new ArrayList<>();
        for (String name : List.of("first", "second", "third")) {
            Thread t = new Thread(() -> {
                fair.lock();
                try {
                    order.add(Thread.currentThread().getName());
                } finally {
                    fair.unlock();
                }
            }, name);
            t.start();
            while (!fair.hasQueuedThread(t)) {            // make the arrival order explicit
                Thread.sleep(1);
            }
            queued.add(t);
        }
        fair.unlock();
        for (Thread t : queued) {
            t.join();
        }
        System.out.println("fair lock order: " + order);

        // 6. ReadWriteLock: concurrent readers, exclusive writer, no upgrades
        ReentrantReadWriteLock rw = new ReentrantReadWriteLock();
        CyclicBarrier allReadersInside = new CyclicBarrier(3);
        CountDownLatch readersIn = new CountDownLatch(3);
        CountDownLatch readersMayLeave = new CountDownLatch(1);
        List<Thread> readers = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            Thread r = new Thread(() -> {
                rw.readLock().lock();
                try {
                    allReadersInside.await();             // passes only if all three hold the read lock together
                    readersIn.countDown();
                    readersMayLeave.await();
                } catch (Exception e) {
                    throw new IllegalStateException(e);
                } finally {
                    rw.readLock().unlock();
                }
            });
            readers.add(r);
            r.start();
        }
        readersIn.await();
        System.out.println("3 readers inside together; read locks held: " + rw.getReadLockCount()
                + ", writer tryLock: " + rw.writeLock().tryLock());
        readersMayLeave.countDown();
        for (Thread r : readers) {
            r.join();
        }
        rw.readLock().lock();
        System.out.println("holding the read lock, upgrade via writeLock().tryLock(): " + rw.writeLock().tryLock() + " (lock() would deadlock)");
        rw.readLock().unlock();
        rw.writeLock().lock();
        rw.readLock().lock();                             // downgrade: allowed
        rw.writeLock().unlock();
        System.out.println("downgrade write -> read allowed, now holding read: " + (rw.getReadHoldCount() == 1));
        rw.readLock().unlock();

        // 7. StampedLock optimistic reads
        Point p = new Point();
        p.move(3, 4);
        System.out.println(p.distance(() -> { }));
        System.out.println(p.distance(() -> {
            Thread writer = new Thread(() -> p.move(3, 4));   // a write between the two reads
            writer.start();
            try {
                writer.join();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }));
    }
}
```

## Output

```text title="Output" output="ExplicitLocks.java"
hold count after locking twice: 2
tryLock(): false, tryLock(200 ms): false after waiting >= 200 ms: true
waiter: interrupted while waiting for the lock
buffer moved 1..50 through 2 slots, sum 1275
fair lock order: [first, second, third]
3 readers inside together; read locks held: 3, writer tryLock: false
holding the read lock, upgrade via writeLock().tryLock(): false (lock() would deadlock)
downgrade write -> read allowed, now holding read: true
optimistic read valid, distance 5.0
optimistic read invalidated, re-read under lock: distance 10.0
```

- `getHoldCount()` showed reentrancy: two `lock()` calls need two `unlock()` calls.
- While another thread owned the lock, `tryLock()` returned `false` immediately and `tryLock(200 ms)` gave up after the timeout. Neither option exists with `synchronized`.
- `lockInterruptibly()` let a queued thread be cancelled.
- Separate `notFull`/`notEmpty` conditions made `signal()` safe in the buffer.
- The fair lock admitted the queued threads in arrival order.
- Three readers held the read lock **at the same time** (the barrier proved it) while a writer couldn't get in. A read lock can't be upgraded, but a write lock can be downgraded.
- The second optimistic read was invalidated by a concurrent `move`, so it fell back to a real read lock and returned the updated distance (10.0).

## Real-world application

- **`tryLock` with a timeout** for operations that must not hang: acquiring a per-account lock in a payment system, and failing the request with "try again" instead of piling up threads.
- **Conditions** in hand-written queues, schedulers and rate limiters. `ArrayBlockingQueue` is implemented this way.
- **Read-mostly configuration or routing tables** used `ReadWriteLock` historically. Today, immutable snapshots behind a `volatile` reference or `ConcurrentHashMap` are usually simpler and faster.
- **`StampedLock`** in hot read paths: coordinates, metrics snapshots, in-memory geometry and finance calculations.
- **Virtual threads on Java 21–23**: libraries such as JDBC drivers and HTTP clients replaced `synchronized` with `ReentrantLock` around blocking I/O to avoid pinning carrier threads.

## Common mistakes

- **Calling `unlock()` outside `finally`**: one exception and the lock is held forever.
- **Calling `lock()` inside the `try`**: if `lock()` itself fails, `finally` calls `unlock()` on a lock you don't hold (`IllegalMonitorStateException`). Lock before the `try`.
- **Trying to upgrade** a read lock to a write lock, which deadlocks.
- **Using `ReadWriteLock` for tiny critical sections or write-heavy data**, where it's slower than a plain lock.
- **Treating `StampedLock` as reentrant**, or using values from an optimistic read without validating them.
- **Making every lock fair "to be safe"**: it can cost a lot of throughput. Use fairness only when starvation is a real problem.
- **Using `await` with `if` instead of `while`**, or `signal` when waiters wait for different conditions on the same `Condition`.

## Interview questions

**Q1. `ReentrantLock` vs `synchronized`?**

````reveal title="Answer"
Both provide reentrant mutual exclusion and the same memory semantics. `ReentrantLock` adds:
- `tryLock` with or without a timeout;
- interruptible acquisition (`lockInterruptibly`);
- optional fairness;
- multiple `Condition`s;
- introspection (`isLocked`, `getQueueLength`).

But you must unlock in `finally` yourself. `synchronized` is simpler, can't leak, and supports lock elision and coarsening by the JIT. Use `synchronized` by default and `ReentrantLock` when you need its features. On Java 21–23, `ReentrantLock` also avoided virtual-thread pinning.
````

**Q2. What is a fair lock, and why isn't it the default?**

````reveal title="Answer"
A fair lock grants access in the order threads requested it: a newly arriving thread queues behind waiting ones. That prevents starvation. Unfair locks (the default) let a newcomer grab the lock if it happens to be free, avoiding the cost of waking a parked thread and scheduling it. Throughput is significantly higher, at the risk that an unlucky thread waits a long time.
````

**Q3. When does a `ReadWriteLock` help?**

````reveal title="Answer"
When reads greatly outnumber writes, reads are long enough that the extra bookkeeping is worth it, and readers truly run concurrently on multiple cores. For short critical sections or frequent writes, a plain lock is often faster. Alternatives like `ConcurrentHashMap`, `CopyOnWriteArrayList` or immutable snapshots behind `volatile` are often better. Upgrading read to write isn't possible (it deadlocks); downgrading is.
````

**Q4. What is a `Condition`, and how is it better than `wait`/`notify`?**

````reveal title="Answer"
A `Condition` is a wait set associated with a `Lock`: `await()` releases the lock and waits, `signal`/`signalAll` wake waiters, and `await` re-acquires the lock before returning. One lock can have several conditions (`notFull`, `notEmpty`), so you wake exactly the threads that can make progress, instead of `notifyAll` waking everyone on a single monitor. It also offers timed and uninterruptible variants. The same `while`-loop discipline applies.
````

**Q5. What is `StampedLock`'s optimistic read?**

````reveal title="Answer"
`tryOptimisticRead()` returns a stamp without acquiring any lock. You copy the fields into locals, then call `validate(stamp)`: if no write lock was acquired since the stamp was issued, the copies are consistent; otherwise you fall back to `readLock()` and read again. It makes uncontended reads almost free. The constraints: `StampedLock` isn't reentrant, has no conditions, and you must only use the copied values after validation.
````

## Hands-on exercise

Build a **compute-once cache** with a `ReentrantReadWriteLock`:
- `V get(K key, Function<K, V> loader)` first looks up the key under the **read** lock. On a miss, it takes the **write** lock, **checks again** (another thread may have loaded the key meanwhile), and loads only if still missing.
- Run 8 threads that all request keys `"a"`, `"b"` and `"c"` in different orders, released together by a `CountDownLatch`, with a loader that counts invocations and takes a little time.
- Show that each key was loaded **exactly once**, and every thread got the same values.

````hint title="Hint"
Release the read lock *before* taking the write lock (an upgrade would deadlock). The second check under the write lock is what prevents duplicate loads. Use an `AtomicInteger` for the load count and a `ConcurrentHashMap<String, Set<String>>` to collect what each thread saw.
````

````solution title="Solution"
```java title="ComputeOnceCache.java" file="ComputeOnceCache.java"
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.ReentrantReadWriteLock;
import java.util.function.Function;

public class ComputeOnceCache<K, V> {
    private final Map<K, V> map = new HashMap<>();              // guarded by rw
    private final ReentrantReadWriteLock rw = new ReentrantReadWriteLock();

    V get(K key, Function<K, V> loader) {
        rw.readLock().lock();
        try {
            V value = map.get(key);
            if (value != null) {
                return value;                                    // fast path: many readers at once
            }
        } finally {
            rw.readLock().unlock();                              // release BEFORE taking the write lock
        }
        rw.writeLock().lock();
        try {
            V value = map.get(key);                              // check again: someone may have loaded it
            if (value == null) {
                value = loader.apply(key);
                map.put(key, value);
            }
            return value;
        } finally {
            rw.writeLock().unlock();
        }
    }

    public static void main(String[] args) throws InterruptedException {
        ComputeOnceCache<String, String> cache = new ComputeOnceCache<>();
        AtomicInteger loads = new AtomicInteger();
        Function<String, String> loader = key -> {
            loads.incrementAndGet();
            try {
                Thread.sleep(20);                                // an expensive load
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return key.toUpperCase() + "-v1";
        };

        Map<String, Set<String>> seen = new ConcurrentHashMap<>();
        CountDownLatch start = new CountDownLatch(1);
        List<Thread> threads = new ArrayList<>();
        List<List<String>> orders = List.of(List.of("a", "b", "c"), List.of("c", "b", "a"), List.of("b", "a", "c"));
        for (int i = 0; i < 8; i++) {
            List<String> order = orders.get(i % orders.size());
            Thread t = new Thread(() -> {
                try {
                    start.await();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                for (String key : order) {
                    seen.computeIfAbsent(key, k -> ConcurrentHashMap.newKeySet()).add(cache.get(key, loader));
                }
            });
            threads.add(t);
            t.start();
        }
        start.countDown();                                       // release all eight together
        for (Thread t : threads) {
            t.join();
        }
        System.out.println("loader invocations: " + loads.get() + " (one per key)");
        System.out.println("values seen per key: " + new TreeMap<>(seen));
    }
}
```

```text title="Output" output="ComputeOnceCache.java"
loader invocations: 3 (one per key)
values seen per key: {a=[A-v1], b=[B-v1], c=[C-v1]}
```

The second check under the write lock is the essential step. Without it, every thread that missed under the read lock would reload the key once it got the write lock. In production, `ConcurrentHashMap.computeIfAbsent`, or Caffeine's `cache.get(key, loader)`, gives the same compute-once guarantee with per-key rather than whole-cache locking.
````

## Knowledge check

```quiz
? Where must lock.unlock() be called?
+ In a finally block, after lock() was called before the try
- At the end of the try block
- In a catch block
> Otherwise an exception leaks the lock forever.

? Another thread holds a ReentrantLock. What does tryLock() return?
+ false, immediately
- true, after waiting
- It blocks until the lock is free
> Use tryLock(timeout) to wait a bounded time.

? What happens if a thread holding the read lock of a ReentrantReadWriteLock calls writeLock().lock()?
+ It deadlocks: the write lock waits for all readers, including itself
- The lock is upgraded atomically
- IllegalMonitorStateException
> Upgrading isn't supported; downgrading is.

? What does StampedLock.validate(stamp) tell you after an optimistic read?
+ Whether a write happened since the stamp was issued
- Whether the read lock is still held
- Whether the values are null
> Invalid means: re-read under a real read lock.

? Why is ReentrantLock unfair by default?
+ Letting arriving threads barge avoids waking parked threads and gives higher throughput
- Fair locks are not thread-safe
- Fairness is only supported for read locks
> Fairness prevents starvation at a throughput cost.
```

## Key takeaways

- **`ReentrantLock`**: same semantics as `synchronized`, plus `tryLock`, timeouts, `lockInterruptibly`, fairness, multiple **`Condition`s** and introspection. Always `lock()` before `try` and `unlock()` in `finally`.
- **`Condition`** = a wait set per condition; same `while (!cond) await()` discipline; `signal` becomes safe when each condition has one kind of waiter.
- **`ReadWriteLock`**: shared reads, exclusive writes; downgrade yes, **upgrade no**; worthwhile only for read-heavy, non-trivial critical sections.
- **`StampedLock`** optimistic reads are nearly free when validated. It isn't reentrant.
- All of them are built on **AQS** (state + CAS + FIFO queue + park). Use `synchronized` unless you need these features.
