## Problem statement

An order-ingestion service has several **producer** threads (reading from network sockets) and several **consumer** threads (writing to the database), connected by a **bounded buffer**. When consumers fall behind, producers must block instead of exhausting memory. Implement it twice in `ProducerConsumer`:

1. **`BoundedBuffer<T>`**, built with `synchronized`/`wait`/`notifyAll` over an `ArrayDeque`:
   - `put(T)` blocks while the buffer is full;
   - `Optional<T> take()` blocks while it's empty;
   - `close()` stops accepting items: `put` after `close` throws `IllegalStateException`, and once a closed buffer is empty, `take` returns `Optional.empty()` so consumers can exit;
   - capacity < 1 → `IllegalArgumentException`.
2. **`runWithWaitNotify(producers, consumers, itemsPerProducer, capacity)`** runs a pipeline over `BoundedBuffer`. **`runWithBlockingQueue(...)`** runs the same pipeline over an `ArrayBlockingQueue`, stopping consumers with **poison pills**.

Both runners return a `Report(consumed, duplicates, missing, maxSizeSeen, consumersStopped)`. Every produced item must be consumed **exactly once**, the buffer must never exceed its capacity, and all threads must terminate.

## Starter code

```java title="ProducerConsumer.java" starter="true"
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Optional;

public final class ProducerConsumer {
    private ProducerConsumer() { }

    record Report(int consumed, int duplicates, int missing, int maxSizeSeen, int consumersStopped) { }

    static final class BoundedBuffer<T> {
        private final Deque<T> items = new ArrayDeque<>();
        private final int capacity;
        private boolean closed;
        private int maxSizeSeen;

        BoundedBuffer(int capacity) {
            this.capacity = capacity;                     // TODO: validate
        }

        void put(T item) throws InterruptedException {
            throw new UnsupportedOperationException("TODO");
        }

        Optional<T> take() throws InterruptedException {
            throw new UnsupportedOperationException("TODO");
        }

        void close() {
            throw new UnsupportedOperationException("TODO");
        }

        synchronized int size() { return items.size(); }
        synchronized int maxSizeSeen() { return maxSizeSeen; }
    }

    static Report runWithWaitNotify(int producers, int consumers, int itemsPerProducer, int capacity) throws InterruptedException {
        throw new UnsupportedOperationException("TODO");
    }

    static Report runWithBlockingQueue(int producers, int consumers, int itemsPerProducer, int capacity) throws InterruptedException {
        throw new UnsupportedOperationException("TODO");
    }

    public static void main(String[] args) throws Exception {
        Report a = runWithWaitNotify(4, 3, 25_000, 16);
        System.out.println("wait/notify buffer, 4 producers x 25,000, 3 consumers, capacity 16: consumed " + a.consumed()
                + ", duplicates " + a.duplicates() + ", missing " + a.missing() + ", never above capacity: " + (a.maxSizeSeen() <= 16)
                + ", consumers stopped: " + a.consumersStopped());
        Report b = runWithBlockingQueue(4, 3, 25_000, 16);
        System.out.println("ArrayBlockingQueue + poison pills, same load: consumed " + b.consumed()
                + ", duplicates " + b.duplicates() + ", missing " + b.missing() + ", never above capacity: " + (b.maxSizeSeen() <= 16)
                + ", consumers stopped: " + b.consumersStopped());
    }
}
```

## Hints

````hint title="Hint 1: two conditions, one monitor"
`put` waits **while full**, and `take` waits **while empty and not closed**. Both run in `synchronized` methods, both loop with `while` around `wait()`, and both call `notifyAll()` after changing the state. A single `notify()` could wake a thread of the wrong kind (a producer, when a consumer is needed) and stall the pipeline.
````

````hint title="Hint 2: shutting down cleanly"
With the monitor buffer: after **all producers** have finished (`join` them), call `close()`.
- `close` sets `closed = true` and calls `notifyAll()`, so consumers waiting on an empty buffer wake up.
- In `take`, if the buffer is empty **and** closed, return `Optional.empty()`; consumers stop on that.

With `ArrayBlockingQueue`: after all producers finish, put **one poison pill per consumer** (a unique sentinel object or value). Each consumer stops when it takes a pill.
````

````hint title="Hint 3: proving exactly-once delivery"
Give every item a unique id: producer `p` produces `p * itemsPerProducer + i`. Consumers increment `seen.incrementAndGet(id)` in an `AtomicIntegerArray`. At the end:
- any slot with a count above 1 is a duplicate;
- any slot at 0 is a missing item.

Track the maximum size inside the buffer, under its lock, to prove the bound held.
````

## Test cases

| Scenario | Expected |
|---|---|
| 4 producers × 25,000 items, 3 consumers, capacity 16 (both versions) | consumed 100,000, duplicates 0, missing 0, max size ≤ 16, 3 consumers stopped |
| 1 producer, 1 consumer, capacity 1 | everything delivered in FIFO order |
| `put` on a full buffer | the producer thread blocks (state `WAITING`) until a `take` |
| `take` on an empty buffer | blocks until `put` or `close` |
| `close()` while consumers wait | they wake and receive `Optional.empty()` |
| `put` after `close()` | `IllegalStateException` |
| A blocked `take()` is interrupted | `InterruptedException` |
| `new BoundedBuffer<>(0)` | `IllegalArgumentException` |

## Expected output

```text title="Expected output" output="ProducerConsumer.java"
wait/notify buffer, 4 producers x 25,000, 3 consumers, capacity 16: consumed 100000, duplicates 0, missing 0, never above capacity: true, consumers stopped: 3
ArrayBlockingQueue + poison pills, same load: consumed 100000, duplicates 0, missing 0, never above capacity: true, consumers stopped: 3
put on a full buffer -> producer state WAITING; take() -> first
producer finished after the take; buffer now holds second
consumer woken by close() -> Optional.empty
put after close -> IllegalStateException: buffer is closed
```

## Reference solution

````solution title="Reference solution (ProducerConsumer.java)"
```java title="ProducerConsumer.java" file="ProducerConsumer.java"
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicIntegerArray;

public final class ProducerConsumer {
    private ProducerConsumer() { }

    record Report(int consumed, int duplicates, int missing, int maxSizeSeen, int consumersStopped) { }

    static final class BoundedBuffer<T> {
        private final Deque<T> items = new ArrayDeque<>();
        private final int capacity;
        private boolean closed;
        private int maxSizeSeen;

        BoundedBuffer(int capacity) {
            if (capacity < 1) {
                throw new IllegalArgumentException("capacity must be at least 1");
            }
            this.capacity = capacity;
        }

        synchronized void put(T item) throws InterruptedException {
            while (items.size() == capacity && !closed) {
                wait();                                     // full: release the lock and wait for a take
            }
            if (closed) {
                throw new IllegalStateException("buffer is closed");
            }
            items.addLast(item);
            maxSizeSeen = Math.max(maxSizeSeen, items.size());
            notifyAll();                                    // wake consumers waiting for "not empty"
        }

        synchronized Optional<T> take() throws InterruptedException {
            while (items.isEmpty() && !closed) {
                wait();                                     // empty: wait for a put or close
            }
            if (items.isEmpty()) {
                return Optional.empty();                    // closed and drained: tell the consumer to stop
            }
            T item = items.removeFirst();
            notifyAll();                                    // wake producers waiting for "not full"
            return Optional.of(item);
        }

        synchronized void close() {
            closed = true;
            notifyAll();                                    // release everyone blocked in put/take
        }

        synchronized int size() { return items.size(); }
        synchronized int maxSizeSeen() { return maxSizeSeen; }
    }

    private static Report report(AtomicIntegerArray seen, int maxSizeSeen, int consumersStopped) {
        int consumed = 0, duplicates = 0, missing = 0;
        for (int i = 0; i < seen.length(); i++) {
            int count = seen.get(i);
            consumed += count;
            if (count > 1) duplicates++;
            if (count == 0) missing++;
        }
        return new Report(consumed, duplicates, missing, maxSizeSeen, consumersStopped);
    }

    static Report runWithWaitNotify(int producers, int consumers, int itemsPerProducer, int capacity) throws InterruptedException {
        BoundedBuffer<Integer> buffer = new BoundedBuffer<>(capacity);
        AtomicIntegerArray seen = new AtomicIntegerArray(producers * itemsPerProducer);
        AtomicInteger stopped = new AtomicInteger();
        List<Thread> producerThreads = new ArrayList<>();
        List<Thread> consumerThreads = new ArrayList<>();
        for (int p = 0; p < producers; p++) {
            int base = p * itemsPerProducer;
            producerThreads.add(new Thread(() -> {
                try {
                    for (int i = 0; i < itemsPerProducer; i++) buffer.put(base + i);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }, "producer-" + p));
        }
        for (int c = 0; c < consumers; c++) {
            consumerThreads.add(new Thread(() -> {
                try {
                    for (Optional<Integer> item = buffer.take(); item.isPresent(); item = buffer.take()) {
                        seen.incrementAndGet(item.get());
                    }
                    stopped.incrementAndGet();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }, "consumer-" + c));
        }
        consumerThreads.forEach(Thread::start);
        producerThreads.forEach(Thread::start);
        for (Thread t : producerThreads) t.join();
        buffer.close();                                     // no more items: consumers drain and stop
        for (Thread t : consumerThreads) t.join();
        return report(seen, buffer.maxSizeSeen(), stopped.get());
    }

    static Report runWithBlockingQueue(int producers, int consumers, int itemsPerProducer, int capacity) throws InterruptedException {
        BlockingQueue<Integer> queue = new ArrayBlockingQueue<>(capacity);
        final Integer poison = Integer.valueOf(-1);         // a value producers never send
        AtomicIntegerArray seen = new AtomicIntegerArray(producers * itemsPerProducer);
        AtomicInteger stopped = new AtomicInteger();
        AtomicInteger maxSize = new AtomicInteger();
        List<Thread> producerThreads = new ArrayList<>();
        List<Thread> consumerThreads = new ArrayList<>();
        for (int p = 0; p < producers; p++) {
            int base = p * itemsPerProducer;
            producerThreads.add(new Thread(() -> {
                try {
                    for (int i = 0; i < itemsPerProducer; i++) {
                        queue.put(base + i);                // blocks while full
                        maxSize.accumulateAndGet(queue.size(), Math::max);
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }, "producer-" + p));
        }
        for (int c = 0; c < consumers; c++) {
            consumerThreads.add(new Thread(() -> {
                try {
                    while (true) {
                        Integer item = queue.take();        // blocks while empty
                        if (item.equals(poison)) break;     // one pill stops exactly one consumer
                        seen.incrementAndGet(item);
                    }
                    stopped.incrementAndGet();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }, "consumer-" + c));
        }
        consumerThreads.forEach(Thread::start);
        producerThreads.forEach(Thread::start);
        for (Thread t : producerThreads) t.join();
        for (int c = 0; c < consumers; c++) queue.put(poison);   // after all real items, in FIFO order
        for (Thread t : consumerThreads) t.join();
        return report(seen, maxSize.get(), stopped.get());
    }

    public static void main(String[] args) throws Exception {
        Report a = runWithWaitNotify(4, 3, 25_000, 16);
        System.out.println("wait/notify buffer, 4 producers x 25,000, 3 consumers, capacity 16: consumed " + a.consumed()
                + ", duplicates " + a.duplicates() + ", missing " + a.missing() + ", never above capacity: " + (a.maxSizeSeen() <= 16)
                + ", consumers stopped: " + a.consumersStopped());
        Report b = runWithBlockingQueue(4, 3, 25_000, 16);
        System.out.println("ArrayBlockingQueue + poison pills, same load: consumed " + b.consumed()
                + ", duplicates " + b.duplicates() + ", missing " + b.missing() + ", never above capacity: " + (b.maxSizeSeen() <= 16)
                + ", consumers stopped: " + b.consumersStopped());

        BoundedBuffer<String> one = new BoundedBuffer<>(1);
        one.put("first");
        Thread blockedProducer = new Thread(() -> {
            try {
                one.put("second");
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        blockedProducer.start();
        while (blockedProducer.getState() != Thread.State.WAITING) Thread.onSpinWait();
        System.out.println("put on a full buffer -> producer state " + blockedProducer.getState() + "; take() -> " + one.take().orElseThrow());
        blockedProducer.join();
        System.out.println("producer finished after the take; buffer now holds " + one.take().orElseThrow());

        BoundedBuffer<String> idle = new BoundedBuffer<>(4);
        Thread waitingConsumer = new Thread(() -> {
            try {
                System.out.println("consumer woken by close() -> " + idle.take());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        waitingConsumer.start();
        while (waitingConsumer.getState() != Thread.State.WAITING) Thread.onSpinWait();
        idle.close();
        waitingConsumer.join();
        try {
            idle.put("late");
        } catch (IllegalStateException e) {
            System.out.println("put after close -> IllegalStateException: " + e.getMessage());
        }
    }
}
```
````

## Step-by-step explanation

````solution title="Step-by-step explanation"
**The monitor-based buffer**
1. **State**: a deque, the capacity, a `closed` flag, and a high-water mark, all guarded by the buffer's own monitor (`synchronized` methods).
2. **Two wait conditions on one monitor**:
   - producers wait while `size == capacity`;
   - consumers wait while empty and not closed.
   
   Both use `while` loops: after waking, the condition may already be false again, because another consumer may have taken the item first (or the wake-up was spurious).
3. **`notifyAll` after every state change.** Producers and consumers wait on the *same* monitor, so `notify()` could wake another producer when a consumer was needed, and both kinds of threads could end up waiting forever. `notifyAll` costs some extra wake-ups but is always correct. Separate `Condition`s (next exercise) avoid the waste.
4. **Clean shutdown with `close()`**: the runner joins all producers, then closes the buffer. `close()` wakes every waiting thread. Consumers drain the remaining items, then receive `Optional.empty()` and exit. Returning an empty `Optional` instead of `null` makes "no more items" explicit. `put` after `close` is a programming error, so it throws.
5. **Backpressure is visible**: in the demo, the second `put` on a capacity-1 buffer left the producer `WAITING` until a `take` freed space. That's exactly what protects the service's memory when the database slows down.

**The `BlockingQueue` version**
1. `ArrayBlockingQueue.put`/`take` already implement "block while full / block while empty", with a `ReentrantLock` and two `Condition`s internally. The pipeline code shrinks to the business loop.
2. **Poison pills**: queues have no "close", so the runner adds one sentinel per consumer **after** all producers have finished. FIFO order guarantees every real item is taken before any pill. Each consumer stops at its pill, and each pill stops exactly one consumer.
3. The pill must be a value producers never send. In typed pipelines, use a dedicated sentinel object, or a wrapper type with an `END` marker.

**Verification**: unique ids plus an `AtomicIntegerArray` of counts prove exactly-once delivery (no duplicates, nothing missing), and the high-water mark proves the bound. Both versions consumed all 100,000 items under real contention.
````

## Edge cases

- **Capacity 1**: maximum contention, every item a hand-off. It's still correct, just slow.
- **More consumers than items**: the extra consumers wait until `close`, or until their pill, then exit.
- **A producer fails half-way**: always close or send pills in a `finally`, or the consumers wait forever. Production pipelines also propagate the error (`ExecutorService` plus `Future`s, or structured concurrency).
- **Interrupts**: a blocked `put`/`take` throws `InterruptedException`. Restore the flag and stop, and don't keep consuming.
- **Unbounded queues** (`LinkedBlockingQueue` without a capacity) remove backpressure: producers never block, and memory grows until an `OutOfMemoryError`. That's the classic `Executors.newFixedThreadPool` pitfall.
- **Poison pills with multiple producers**: the pills must be sent only after **all** producers are done, which is why the runner joins them first. Otherwise a consumer could stop while items are still coming.
- **Fairness**: neither version guarantees which waiting producer goes next. `new ArrayBlockingQueue<>(cap, true)` gives FIFO fairness, at some throughput cost.

## JUnit tests

```java title="ProducerConsumerTest.java" file="ProducerConsumerTest.java" test="ProducerConsumer.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class ProducerConsumerTest {
    private static void awaitState(Thread t, Thread.State state) {
        long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
        while (t.getState() != state) {
            if (System.nanoTime() > deadline) throw new AssertionError(t.getName() + " never reached " + state);
            Thread.onSpinWait();
        }
    }

    @Test
    void fifoAndValidation() throws InterruptedException {
        ProducerConsumer.BoundedBuffer<Integer> b = new ProducerConsumer.BoundedBuffer<>(3);
        b.put(1);
        b.put(2);
        assertEquals(Optional.of(1), b.take());
        assertEquals(Optional.of(2), b.take());
        assertThrows(IllegalArgumentException.class, () -> new ProducerConsumer.BoundedBuffer<Integer>(0));
    }

    @Test
    void putBlocksWhenFullUntilTake() throws InterruptedException {
        ProducerConsumer.BoundedBuffer<String> b = new ProducerConsumer.BoundedBuffer<>(1);
        b.put("a");
        Thread producer = new Thread(() -> {
            try { b.put("b"); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        }, "blocked-producer");
        producer.start();
        awaitState(producer, Thread.State.WAITING);
        assertEquals(Optional.of("a"), b.take());
        producer.join(5_000);
        assertEquals(Optional.of("b"), b.take());
    }

    @Test
    void closeWakesWaitingConsumersAndRejectsPuts() throws InterruptedException {
        ProducerConsumer.BoundedBuffer<String> b = new ProducerConsumer.BoundedBuffer<>(2);
        AtomicReference<Optional<String>> got = new AtomicReference<>();
        Thread consumer = new Thread(() -> {
            try { got.set(b.take()); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        }, "waiting-consumer");
        consumer.start();
        awaitState(consumer, Thread.State.WAITING);
        b.close();
        consumer.join(5_000);
        assertEquals(Optional.empty(), got.get());
        assertThrows(IllegalStateException.class, () -> b.put("late"));
    }

    @Test
    void closedBufferIsDrainedBeforeReportingEmpty() throws InterruptedException {
        ProducerConsumer.BoundedBuffer<String> b = new ProducerConsumer.BoundedBuffer<>(2);
        b.put("x");
        b.close();
        assertEquals(Optional.of("x"), b.take());
        assertEquals(Optional.empty(), b.take());
    }

    @Test
    void blockedTakeIsInterruptible() throws InterruptedException {
        ProducerConsumer.BoundedBuffer<String> b = new ProducerConsumer.BoundedBuffer<>(1);
        AtomicReference<Throwable> outcome = new AtomicReference<>();
        Thread consumer = new Thread(() -> {
            try { b.take(); } catch (Throwable t) { outcome.set(t); }
        });
        consumer.start();
        awaitState(consumer, Thread.State.WAITING);
        consumer.interrupt();
        consumer.join(5_000);
        assertTrue(outcome.get() instanceof InterruptedException);
    }

    @ParameterizedTest(name = "{0} producers, {1} consumers, {2} items each, capacity {3}")
    @CsvSource({ "1, 1, 1000, 1", "3, 5, 2000, 2", "4, 3, 25000, 16", "6, 1, 500, 4" })
    void everyItemIsConsumedExactlyOnce(int producers, int consumers, int items, int capacity) {
        for (boolean queue : new boolean[] { false, true }) {
            ProducerConsumer.Report r = assertTimeoutPreemptively(Duration.ofSeconds(30), () -> queue
                    ? ProducerConsumer.runWithBlockingQueue(producers, consumers, items, capacity)
                    : ProducerConsumer.runWithWaitNotify(producers, consumers, items, capacity));
            assertEquals(producers * items, r.consumed());
            assertEquals(0, r.duplicates());
            assertEquals(0, r.missing());
            assertTrue(r.maxSizeSeen() <= capacity);
            assertEquals(consumers, r.consumersStopped());
        }
    }
}
```
