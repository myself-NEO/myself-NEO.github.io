## Problem statement

Implement `BoundedBlockingQueue<E>`, a simplified `ArrayBlockingQueue`, using a **`ReentrantLock` with two `Condition`s** (`notEmpty`, `notFull`) over a **ring buffer** (`Object[]` plus `takeIndex`, `putIndex`, `count`).

| Method | Contract |
|---|---|
| `BoundedBlockingQueue(int capacity)` | capacity < 1 → `IllegalArgumentException` |
| `void put(E e)` | blocks while full; interruptible |
| `E take()` | blocks while empty; interruptible |
| `boolean offer(E e, long timeout, TimeUnit unit)` | waits at most `timeout` for space; returns `false` if it timed out |
| `E poll(long timeout, TimeUnit unit)` | waits at most `timeout` for an element; returns `null` if it timed out |
| `boolean offer(E e)`, `E poll()` | non-blocking variants |
| `int size()`, `int remainingCapacity()` | consistent snapshots |

**Rules**:
- `null` elements → `NullPointerException`, because `null` is reserved to mean "timed out" in `poll`;
- FIFO order;
- every item is delivered exactly once under any number of producers and consumers;
- blocked threads respond to interrupts with `InterruptedException`.

## Starter code

```java title="BoundedBlockingQueue.java" starter="true"
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;

public class BoundedBlockingQueue<E> {
    private final Object[] items;
    private int takeIndex;
    private int putIndex;
    private int count;
    private final ReentrantLock lock = new ReentrantLock();
    private final Condition notEmpty = lock.newCondition();
    private final Condition notFull = lock.newCondition();

    public BoundedBlockingQueue(int capacity) {
        items = new Object[capacity];                 // TODO: validate
    }

    public void put(E e) throws InterruptedException { throw new UnsupportedOperationException("TODO"); }
    public E take() throws InterruptedException { throw new UnsupportedOperationException("TODO"); }
    public boolean offer(E e, long timeout, TimeUnit unit) throws InterruptedException { throw new UnsupportedOperationException("TODO"); }
    public E poll(long timeout, TimeUnit unit) throws InterruptedException { throw new UnsupportedOperationException("TODO"); }
    public boolean offer(E e) { throw new UnsupportedOperationException("TODO"); }
    public E poll() { throw new UnsupportedOperationException("TODO"); }
    public int size() { throw new UnsupportedOperationException("TODO"); }
    public int remainingCapacity() { throw new UnsupportedOperationException("TODO"); }

    public static void main(String[] args) throws Exception {
        BoundedBlockingQueue<String> q = new BoundedBlockingQueue<>(3);
        StringBuilder order = new StringBuilder();
        for (int round = 0; round < 3; round++) {             // wraps the ring buffer several times
            q.put("a" + round);
            q.put("b" + round);
            order.append(q.take()).append(' ');
            q.put("c" + round);
            order.append(q.take()).append(' ').append(q.take()).append(' ');
        }
        System.out.println("FIFO across wrap-around: " + order.toString().trim());
    }
}
```

## Hints

````hint title="Hint 1: the ring buffer"
Insert at `putIndex`, then `putIndex = (putIndex + 1) % items.length`, and `count++`. Remove at `takeIndex` the same way, and **null out the slot** so the queue doesn't keep a reference to removed objects. `count` alone tells you whether the buffer is full (`count == items.length`) or empty (`count == 0`), so the indexes never need comparing.
````

````hint title="Hint 2: two conditions instead of notifyAll"
```java
lock.lockInterruptibly();
try {
    while (count == items.length) notFull.await();   // loop: spurious wake-ups, competing producers
    enqueue(e);                                       // ends with notEmpty.signal()
} finally {
    lock.unlock();
}
```

With separate conditions, `signal()` wakes exactly one thread **of the right kind**: a consumer after an insert, a producer after a removal. With a single monitor you'd need `notifyAll()`.
````

````hint title="Hint 3: timed waits"
`long nanos = unit.toNanos(timeout); while (count == items.length) { if (nanos <= 0) return false; nanos = notFull.awaitNanos(nanos); }`. `awaitNanos` returns the **remaining** time, so the loop keeps the total wait bounded, even across spurious wake-ups.
````

## Test cases

| Scenario | Expected |
|---|---|
| Capacity 3, interleaved puts and takes over several wrap-arounds | strict FIFO: `a0 b0 c0 a1 b1 c1 a2 b2 c2` |
| `offer(x, 100 ms)` on a full queue | `false` after about 100 ms |
| `poll(100 ms)` on an empty queue | `null` after about 100 ms |
| `put` on a full queue in another thread | that thread is `WAITING` until a `take` |
| `put(null)` | `NullPointerException` |
| Interrupt a blocked `take` | `InterruptedException` |
| 4 producers × 50,000 items, 4 consumers, capacity 64 | 200,000 delivered exactly once; size never above 64 |
| `new BoundedBlockingQueue<>(0)` | `IllegalArgumentException` |

## Expected output

```text title="Expected output" output="BoundedBlockingQueue.java"
FIFO across wrap-around: a0 b0 c0 a1 b1 c1 a2 b2 c2
offer(2, 100 ms) on a full queue -> false, waited about 100 ms: true
poll(100 ms) on an empty queue -> null, waited about 100 ms: true
put on a full queue -> producer WAITING, take() -> 7
blocked put completed, queue holds 8, remaining capacity 1
4 producers x 50,000, 4 consumers, capacity 64: delivered exactly once 200,000 of 200,000; size never above capacity: true
```

## Reference solution

````solution title="Reference solution (BoundedBlockingQueue.java)"
```java title="BoundedBlockingQueue.java" file="BoundedBlockingQueue.java"
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicIntegerArray;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;

public class BoundedBlockingQueue<E> {
    private final Object[] items;
    private int takeIndex;
    private int putIndex;
    private int count;
    private final ReentrantLock lock = new ReentrantLock();
    private final Condition notEmpty = lock.newCondition();
    private final Condition notFull = lock.newCondition();

    public BoundedBlockingQueue(int capacity) {
        if (capacity < 1) {
            throw new IllegalArgumentException("capacity must be at least 1");
        }
        items = new Object[capacity];
    }

    // ---- internal helpers: the caller holds the lock
    private void enqueue(E e) {
        items[putIndex] = e;
        putIndex = (putIndex + 1) % items.length;
        count++;
        notEmpty.signal();                            // exactly one waiting consumer can proceed
    }

    @SuppressWarnings("unchecked")
    private E dequeue() {
        E e = (E) items[takeIndex];
        items[takeIndex] = null;                      // don't retain removed elements
        takeIndex = (takeIndex + 1) % items.length;
        count--;
        notFull.signal();                             // exactly one waiting producer can proceed
        return e;
    }

    public void put(E e) throws InterruptedException {
        Objects.requireNonNull(e);
        lock.lockInterruptibly();
        try {
            while (count == items.length) {
                notFull.await();
            }
            enqueue(e);
        } finally {
            lock.unlock();
        }
    }

    public E take() throws InterruptedException {
        lock.lockInterruptibly();
        try {
            while (count == 0) {
                notEmpty.await();
            }
            return dequeue();
        } finally {
            lock.unlock();
        }
    }

    public boolean offer(E e, long timeout, TimeUnit unit) throws InterruptedException {
        Objects.requireNonNull(e);
        long nanos = unit.toNanos(timeout);
        lock.lockInterruptibly();
        try {
            while (count == items.length) {
                if (nanos <= 0) {
                    return false;                     // timed out
                }
                nanos = notFull.awaitNanos(nanos);    // returns the time still left
            }
            enqueue(e);
            return true;
        } finally {
            lock.unlock();
        }
    }

    public E poll(long timeout, TimeUnit unit) throws InterruptedException {
        long nanos = unit.toNanos(timeout);
        lock.lockInterruptibly();
        try {
            while (count == 0) {
                if (nanos <= 0) {
                    return null;
                }
                nanos = notEmpty.awaitNanos(nanos);
            }
            return dequeue();
        } finally {
            lock.unlock();
        }
    }

    public boolean offer(E e) {
        Objects.requireNonNull(e);
        lock.lock();
        try {
            if (count == items.length) {
                return false;
            }
            enqueue(e);
            return true;
        } finally {
            lock.unlock();
        }
    }

    public E poll() {
        lock.lock();
        try {
            return count == 0 ? null : dequeue();
        } finally {
            lock.unlock();
        }
    }

    public int size() {
        lock.lock();
        try {
            return count;
        } finally {
            lock.unlock();
        }
    }

    public int remainingCapacity() {
        lock.lock();
        try {
            return items.length - count;
        } finally {
            lock.unlock();
        }
    }

    public static void main(String[] args) throws Exception {
        BoundedBlockingQueue<String> q = new BoundedBlockingQueue<>(3);
        StringBuilder order = new StringBuilder();
        for (int round = 0; round < 3; round++) {             // wraps the ring buffer several times
            q.put("a" + round);
            q.put("b" + round);
            order.append(q.take()).append(' ');
            q.put("c" + round);
            order.append(q.take()).append(' ').append(q.take()).append(' ');
        }
        System.out.println("FIFO across wrap-around: " + order.toString().trim());

        BoundedBlockingQueue<Integer> full = new BoundedBlockingQueue<>(1);
        full.put(1);
        long start = System.nanoTime();
        boolean offered = full.offer(2, 100, TimeUnit.MILLISECONDS);
        long waitedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
        System.out.println("offer(2, 100 ms) on a full queue -> " + offered + ", waited about 100 ms: " + (waitedMs >= 90 && waitedMs < 2_000));
        full.take();
        start = System.nanoTime();
        Integer polled = full.poll(100, TimeUnit.MILLISECONDS);
        waitedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
        System.out.println("poll(100 ms) on an empty queue -> " + polled + ", waited about 100 ms: " + (waitedMs >= 90 && waitedMs < 2_000));

        full.put(7);
        Thread producer = new Thread(() -> {
            try {
                full.put(8);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        producer.start();
        while (producer.getState() != Thread.State.WAITING) Thread.onSpinWait();
        System.out.println("put on a full queue -> producer " + producer.getState() + ", take() -> " + full.take());
        producer.join();
        System.out.println("blocked put completed, queue holds " + full.poll() + ", remaining capacity " + full.remainingCapacity());

        int producers = 4, consumers = 4, perProducer = 50_000, capacity = 64;
        BoundedBlockingQueue<Integer> shared = new BoundedBlockingQueue<>(capacity);
        AtomicIntegerArray seen = new AtomicIntegerArray(producers * perProducer);
        List<Thread> threads = new ArrayList<>();
        int[] maxSize = { 0 };
        for (int p = 0; p < producers; p++) {
            int base = p * perProducer;
            threads.add(new Thread(() -> {
                try {
                    for (int i = 0; i < perProducer; i++) shared.put(base + i);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }));
        }
        for (int c = 0; c < consumers; c++) {
            threads.add(new Thread(() -> {
                try {
                    for (int i = 0; i < perProducer; i++) {
                        seen.incrementAndGet(shared.take());
                        int size = shared.size();
                        synchronized (maxSize) {
                            maxSize[0] = Math.max(maxSize[0], size);
                        }
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }));
        }
        threads.forEach(Thread::start);
        for (Thread t : threads) t.join();
        int exactlyOnce = 0;
        for (int i = 0; i < seen.length(); i++) if (seen.get(i) == 1) exactlyOnce++;
        System.out.printf("4 producers x 50,000, 4 consumers, capacity 64: delivered exactly once %,d of %,d; size never above capacity: %b%n",
                exactlyOnce, seen.length(), maxSize[0] <= capacity);
    }
}
```
````

## Step-by-step explanation

````solution title="Step-by-step explanation"
1. **Ring buffer**: a fixed `Object[]` with two cursors that wrap with `% length`, and a `count`. Enqueue and dequeue are O(1) with no allocation, which is why `ArrayBlockingQueue` produces no garbage per element. Clearing the dequeued slot prevents the queue from keeping consumed objects alive.
2. **One lock, two conditions**:
   - every operation that reads or writes the buffer holds `lock`;
   - `notFull` holds producers waiting for space, and `notEmpty` holds consumers waiting for elements;
   - after an enqueue, `notEmpty.signal()` wakes **one consumer**, the only kind of thread that can benefit; after a dequeue, `notFull.signal()` wakes one producer.
   
   That's the advantage over a single monitor, where `notifyAll()` would wake everyone so that the right kind of thread is included.
3. **Wait in loops**: `await()` releases the lock and parks the thread, and it re-acquires the lock before returning. The condition is re-checked because another thread may have consumed the space or element in between, and because spurious wake-ups are allowed.
4. **Interruptibility**: `lockInterruptibly()` and `await()` both throw `InterruptedException`, so a blocked producer or consumer can be cancelled. The `finally { unlock(); }` releases the lock on every exit path, including exceptions.
5. **Timed operations**: `awaitNanos` returns the time still remaining, and the loop stops when it reaches zero. The total wait therefore stays bounded even if the thread wakes up many times without success. The return values (`false`/`null`) report a timeout, which is why `null` elements are forbidden.
6. **Snapshots**: `size()` and `remainingCapacity()` lock briefly so they read a consistent `count`. They're still only snapshots: by the time the caller acts, the value may have changed. Never write `if (q.size() < cap) q.put(x)` and expect it to be atomic.
7. **Evidence**: the demo checks FIFO order across several wrap-arounds, timed waits of about 100 ms, a producer `WAITING` on `notFull` until space appears, and 200,000 items delivered exactly once under contention.
````

## Edge cases

- **Capacity 1**: every operation alternates between full and empty. It's correct, but each hand-off costs a context switch (`SynchronousQueue` is the zero-capacity extreme).
- **Signal vs signalAll**: `signal` is correct here because each condition has exactly one kind of waiter and each state change enables exactly one waiter. With a single condition for both, `signal` could wake the wrong kind and stall.
- **Fairness**: `new ReentrantLock(true)` grants the lock in arrival order, reducing starvation at a significant throughput cost. `ArrayBlockingQueue` has the same constructor option.
- **Timeout ≤ 0**: behaves like the non-blocking `offer`/`poll`.
- **Interrupt while waiting**: the thread leaves `await()` holding the lock again, then `finally` unlocks. No item is lost or duplicated, because the state wasn't changed.
- **Two locks**: `LinkedBlockingQueue` uses separate put and take locks so producers and consumers don't contend, but that's harder with a ring buffer and needs an atomic count.
- **`drainTo`**: batching removals under one lock acquisition is a common production optimisation for consumers.

## JUnit tests

```java title="BoundedBlockingQueueTest.java" file="BoundedBlockingQueueTest.java" test="BoundedBlockingQueue.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicIntegerArray;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

class BoundedBlockingQueueTest {
    private static void awaitState(Thread t, Thread.State state) {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (t.getState() != state) {
            if (System.nanoTime() > deadline) throw new AssertionError("thread never reached " + state);
            Thread.onSpinWait();
        }
    }

    @Test
    void fifoWithWrapAround() throws InterruptedException {
        BoundedBlockingQueue<Integer> q = new BoundedBlockingQueue<>(2);
        List<Integer> out = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            q.put(i);
            if (i % 2 == 1) {
                out.add(q.take());
                out.add(q.take());
            }
        }
        assertEquals(List.of(0, 1, 2, 3, 4, 5, 6, 7, 8, 9), out);
    }

    @Test
    void nonBlockingOperationsAndSizes() {
        BoundedBlockingQueue<String> q = new BoundedBlockingQueue<>(2);
        assertNull(q.poll());
        assertTrue(q.offer("a"));
        assertTrue(q.offer("b"));
        assertFalse(q.offer("c"));
        assertEquals(2, q.size());
        assertEquals(0, q.remainingCapacity());
        assertEquals("a", q.poll());
        assertEquals(1, q.remainingCapacity());
    }

    @Test
    void validation() {
        assertThrows(IllegalArgumentException.class, () -> new BoundedBlockingQueue<String>(0));
        BoundedBlockingQueue<String> q = new BoundedBlockingQueue<>(1);
        assertThrows(NullPointerException.class, () -> q.put(null));
        assertThrows(NullPointerException.class, () -> q.offer(null));
    }

    @Test
    void timedOperationsTimeOut() throws InterruptedException {
        BoundedBlockingQueue<Integer> q = new BoundedBlockingQueue<>(1);
        q.put(1);
        long start = System.nanoTime();
        assertFalse(q.offer(2, 50, TimeUnit.MILLISECONDS));
        assertTrue(System.nanoTime() - start >= TimeUnit.MILLISECONDS.toNanos(45));
        q.take();
        start = System.nanoTime();
        assertNull(q.poll(50, TimeUnit.MILLISECONDS));
        assertTrue(System.nanoTime() - start >= TimeUnit.MILLISECONDS.toNanos(45));
    }

    @Test
    void timedOfferSucceedsWhenSpaceAppears() throws Exception {
        BoundedBlockingQueue<Integer> q = new BoundedBlockingQueue<>(1);
        q.put(1);
        Thread consumer = new Thread(() -> {
            try { Thread.sleep(50); q.take(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        });
        consumer.start();
        assertTrue(q.offer(2, 5, TimeUnit.SECONDS));
        consumer.join();
        assertEquals(2, q.take());
    }

    @Test
    void putBlocksUntilTake() throws InterruptedException {
        BoundedBlockingQueue<Integer> q = new BoundedBlockingQueue<>(1);
        q.put(1);
        Thread producer = new Thread(() -> {
            try { q.put(2); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        });
        producer.start();
        awaitState(producer, Thread.State.WAITING);
        assertEquals(1, q.take());
        producer.join(5_000);
        assertEquals(2, q.take());
    }

    @Test
    void blockedTakeIsInterruptible() throws InterruptedException {
        BoundedBlockingQueue<Integer> q = new BoundedBlockingQueue<>(1);
        AtomicReference<Throwable> outcome = new AtomicReference<>();
        Thread consumer = new Thread(() -> {
            try { q.take(); } catch (Throwable t) { outcome.set(t); }
        });
        consumer.start();
        awaitState(consumer, Thread.State.WAITING);
        consumer.interrupt();
        consumer.join(5_000);
        assertTrue(outcome.get() instanceof InterruptedException);
        assertTrue(q.offer(5));                              // the queue still works afterwards
    }

    @Test
    void exactlyOnceUnderContention() {
        assertTimeoutPreemptively(Duration.ofSeconds(30), () -> {
            int producers = 4, consumers = 4, per = 20_000;
            BoundedBlockingQueue<Integer> q = new BoundedBlockingQueue<>(8);
            AtomicIntegerArray seen = new AtomicIntegerArray(producers * per);
            List<Thread> threads = new ArrayList<>();
            for (int p = 0; p < producers; p++) {
                int base = p * per;
                threads.add(new Thread(() -> {
                    try { for (int i = 0; i < per; i++) q.put(base + i); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
                }));
            }
            for (int c = 0; c < consumers; c++) {
                threads.add(new Thread(() -> {
                    try { for (int i = 0; i < per; i++) seen.incrementAndGet(q.take()); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
                }));
            }
            threads.forEach(Thread::start);
            for (Thread t : threads) t.join();
            for (int i = 0; i < seen.length(); i++) assertEquals(1, seen.get(i), "item " + i);
            assertEquals(0, q.size());
        });
    }
}
```
