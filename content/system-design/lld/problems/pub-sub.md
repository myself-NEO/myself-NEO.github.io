## Problem statement

Design an in-process publish/subscribe library. Producers publish messages to named **topics**; each **subscriber** to a topic receives every message published after it subscribed, in order, at its own pace. Delivery is **at least once**: a message is never lost because a handler failed, but it may be delivered more than once. A slow subscriber must not let memory grow without bound — producers feel **backpressure** instead.

> [!TIP] Try it first
> Each subscriber needs to remember "how far it has got". Decide what that position is, **when** it moves forward, and what that implies for a crash in the middle of handling a message.

## Clarifying questions

1. Do all subscribers get every message (fan-out), or do they share the work (a queue)?
2. Ordering guarantees?
3. Delivery guarantee: at most once, at least once, exactly once?
4. What happens when a handler throws? Retries? A poison message?
5. What if a subscriber is slow — buffer forever, drop, or slow down producers?
6. Do new subscribers see old messages?
7. Push (callbacks) or pull (poll)?

````reveal title="Answers we'll assume"
- **Fan-out:** every subscription gets every message (consumer groups that share work are a follow-up).
- **Per-topic order** is preserved for each subscriber.
- **At least once:** a subscriber's offset advances only **after** its handler finishes. Handlers that can't tolerate duplicates are made idempotent (we provide a de-duplicating wrapper keyed by message ID).
- A failing message is retried up to N attempts; then it goes to the subscription's **dead-letter list** and the offset moves on, so one poison message can't block the stream forever.
- Each topic has a **capacity**: the maximum number of messages the slowest subscriber may lag behind. When it's reached, `publish` follows the topic's **overflow policy** — block up to a timeout, or reject immediately.
- New subscribers start from the **next** message.
- **Push:** each subscription has a worker thread that calls its handler.
````

## Requirements

**Functional**

1. Create topics with a capacity and an overflow policy.
2. `publish(topic, id, payload)` appends a message with the next offset.
3. `subscribe(topic, name, handler, maxAttempts)` starts delivery; `close()` stops it.
4. Per-subscriber offsets, retries, dead letters; idempotent handler wrapper.
5. `awaitDrained(topic)` for orderly shutdown and tests.

**Non-functional**

6. A slow or failing subscriber doesn't affect other subscribers' delivery.
7. Memory per topic is bounded by its capacity.
8. Thread-safe publishing from many threads.

## Step 1 — Offsets and the log

````reveal title="An append-only log per topic, one offset per subscriber"
```text
offsets:      0    1    2    3    4    5
log:        [o1] [o2] [o3] [o3] [o4]  _      nextOffset = 5
billing     committed = 5  (caught up)
shipping    committed = 2  (handling offset 2 right now)
lag of the slowest = nextOffset - min(committed) = 3
```

- A subscriber's **committed offset** is "everything before this has been handled". It moves to `offset + 1` only after the handler returns — so if the process dies mid-handle, that message is delivered again: **at least once**.
- Messages below the **minimum** committed offset are no longer needed by anyone. Since the lag is capped at `capacity`, the log fits in a **ring buffer** of `capacity` slots: offset `o` lives in slot `o % capacity`, and a slot is reused only after every subscriber has passed it.
- Backpressure is then just "is `nextOffset − minCommitted` at capacity?".
````

## Step 2 — Class design

```uml title="Pub/Sub library"
class Broker
  - topics: Map<String, Topic>
  + createTopic(name: String, capacity: int, policy: OverflowPolicy): void
  + publish(topic: String, id: String, payload: String): long
  + subscribe(topic: String, name: String, h: MessageHandler, maxAttempts: int): Subscription
  + awaitDrained(topic: String, timeout: Duration): boolean
class Topic
  - ring: Message[]
  - nextOffset: long
  - lock: ReentrantLock
  - changed: Condition
  - subscriptions: List<Subscription>
  - overflow: OverflowPolicy
  + publish(id: String, payload: String): long
  + awaitAt(offset: long): Message
  + acknowledge(s: Subscription, next: long): void
class Subscription
  - committed: long
  - handler: MessageHandler
  - maxAttempts: int
  - deadLetters: List<Message>
  - worker: Thread
interface MessageHandler
  + handle(m: Message): void
class DedupingHandler
  - seen: Set<String>
interface OverflowPolicy
  + waitForSpace(c: Condition, full: BooleanSupplier): boolean
class BlockFor
class Reject
record Message
  + offset: long
  + id: String
  + payload: String
Broker *-- "0..*" Topic
Topic o-- "0..*" Subscription
Topic --> OverflowPolicy
Subscription --> MessageHandler
DedupingHandler ..|> MessageHandler
DedupingHandler --> MessageHandler : wraps
BlockFor ..|> OverflowPolicy
Reject ..|> OverflowPolicy
```

## Step 3 — Implementation

````hint title="Hint — one lock and one condition per topic"
Publishers wait for **space**, subscribers wait for **messages**, and `awaitDrained` waits for **acknowledgements**. All three are "wait until the topic's state changes", so a single `Condition` with `signalAll()` on every publish and acknowledge is enough — each waiter re-checks its own condition in a loop.
````

````solution title="Complete Java solution"
```java title="PubSubDemo.java" file="PubSubDemo.java"
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.BooleanSupplier;

public class PubSubDemo {
    public static void main(String[] args) throws Exception {
        try (Broker broker = new Broker()) {
            broker.createTopic("orders", 100, new BlockFor(Duration.ofSeconds(1)));
            List<String> billed = Collections.synchronizedList(new ArrayList<>());
            Set<String> failedOnce = ConcurrentHashMap.newKeySet();
            Subscription billing = broker.subscribe("orders", "billing", m -> {
                if (m.payload().startsWith("bad")) throw new IllegalArgumentException("unparseable");
                if (m.id().equals("o2") && failedOnce.add(m.id())) throw new IllegalStateException("db timeout");
                billed.add(m.id());
            }, 3);
            List<String> shipped = Collections.synchronizedList(new ArrayList<>());
            Subscription shipping = broker.subscribe("orders", "shipping",
                    new DedupingHandler(m -> { if (!m.payload().startsWith("bad")) shipped.add(m.id()); }), 3);

            broker.publish("orders", "o1", "order 1");
            broker.publish("orders", "o2", "order 2");
            broker.publish("orders", "o3", "order 3");
            broker.publish("orders", "o3", "order 3");          // the producer retried after losing the ack
            broker.publish("orders", "o4", "bad payload");
            System.out.println("orders drained: " + broker.awaitDrained("orders", Duration.ofSeconds(5)));
            System.out.println("billing handled " + billed + ", redeliveries " + billing.redeliveries()
                    + ", dead letters " + billing.deadLetterIds());
            System.out.println("shipping handled " + shipped + " (duplicates skipped), offset " + shipping.committed());

            broker.createTopic("audit", 2, new BlockFor(Duration.ofMillis(100)));
            CountDownLatch release = new CountDownLatch(1);
            List<String> audited = Collections.synchronizedList(new ArrayList<>());
            broker.subscribe("audit", "slow-auditor", m -> { release.await(); audited.add(m.id()); }, 1);
            broker.publish("audit", "a1", "login");
            broker.publish("audit", "a2", "logout");
            try {
                broker.publish("audit", "a3", "login");
            } catch (BackpressureException e) {
                System.out.println("Rejected: " + e.getMessage());
            }
            release.countDown();                                  // the auditor catches up
            broker.publish("audit", "a3", "login");
            broker.awaitDrained("audit", Duration.ofSeconds(5));
            System.out.println("audit handled " + audited);
        }
    }
}

record Message(long offset, String id, String payload) {}

@FunctionalInterface
interface MessageHandler {
    void handle(Message m) throws Exception;
}

class BackpressureException extends RuntimeException {
    BackpressureException(String topic, int capacity) {
        super("topic " + topic + " is full (" + capacity + " unacknowledged messages)");
    }
}

// ---------- Overflow strategies ----------

interface OverflowPolicy {
    /** Called with the topic lock held while the topic is full; true once there is space. */
    boolean waitForSpace(Condition changed, BooleanSupplier isFull) throws InterruptedException;
}

final class BlockFor implements OverflowPolicy {
    private final Duration timeout;
    BlockFor(Duration timeout) { this.timeout = timeout; }

    public boolean waitForSpace(Condition changed, BooleanSupplier isFull) throws InterruptedException {
        long nanos = timeout.toNanos();
        while (isFull.getAsBoolean()) {
            if (nanos <= 0) return false;
            nanos = changed.awaitNanos(nanos);
        }
        return true;
    }
}

final class Reject implements OverflowPolicy {
    public boolean waitForSpace(Condition changed, BooleanSupplier isFull) { return !isFull.getAsBoolean(); }
}

// ---------- Idempotent consumer ----------

/** Decorator: makes any handler safe under at-least-once delivery by skipping message IDs it has handled. */
final class DedupingHandler implements MessageHandler {
    private final MessageHandler inner;
    private final Set<String> handled = ConcurrentHashMap.newKeySet();

    DedupingHandler(MessageHandler inner) { this.inner = inner; }

    public void handle(Message m) throws Exception {
        if (handled.contains(m.id())) return;
        inner.handle(m);
        handled.add(m.id());                                     // only after success, so a failure is retried
    }
}

// ---------- Topic ----------

final class Topic {
    private final String name;
    private final Message[] ring;
    private final OverflowPolicy overflow;
    private final ReentrantLock lock = new ReentrantLock();
    private final Condition changed = lock.newCondition();
    private final List<Subscription> subscriptions = new ArrayList<>();
    private long nextOffset;
    private boolean closed;

    Topic(String name, int capacity, OverflowPolicy overflow) {
        if (capacity <= 0) throw new IllegalArgumentException("capacity must be positive");
        this.name = name;
        this.ring = new Message[capacity];
        this.overflow = overflow;
    }

    long publish(String id, String payload) {
        lock.lock();
        try {
            if (closed) throw new IllegalStateException("topic " + name + " is closed");
            if (isFull() && !overflow.waitForSpace(changed, this::isFull)) throw new BackpressureException(name, ring.length);
            Message m = new Message(nextOffset, id, payload);
            ring[(int) (nextOffset % ring.length)] = m;          // the slot's previous message was acknowledged by everyone
            nextOffset++;
            changed.signalAll();
            return m.offset();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BackpressureException(name, ring.length);
        } finally {
            lock.unlock();
        }
    }

    Subscription subscribe(String subscriber, MessageHandler handler, int maxAttempts) {
        Subscription s;
        lock.lock();
        try {
            s = new Subscription(subscriber, this, handler, maxAttempts, nextOffset);   // starts at the next message
            subscriptions.add(s);
        } finally {
            lock.unlock();
        }
        s.start();
        return s;
    }

    void unsubscribe(Subscription s) {
        lock.lock();
        try {
            subscriptions.remove(s);
            changed.signalAll();                                 // may free space for blocked publishers
        } finally {
            lock.unlock();
        }
    }

    /** Blocks until the message at {@code offset} exists; null once the topic is closed and nothing is left. */
    Message awaitAt(long offset) throws InterruptedException {
        lock.lock();
        try {
            while (offset >= nextOffset && !closed) changed.await();
            return offset < nextOffset ? ring[(int) (offset % ring.length)] : null;
        } finally {
            lock.unlock();
        }
    }

    void acknowledge(Subscription s, long next) {
        lock.lock();
        try {
            s.setCommitted(next);
            changed.signalAll();                                 // wakes publishers waiting for space and drain waiters
        } finally {
            lock.unlock();
        }
    }

    boolean awaitDrained(Duration timeout) throws InterruptedException {
        lock.lock();
        try {
            long nanos = timeout.toNanos();
            while (minCommitted() < nextOffset) {
                if (nanos <= 0) return false;
                nanos = changed.awaitNanos(nanos);
            }
            return true;
        } finally {
            lock.unlock();
        }
    }

    void close() throws InterruptedException {
        List<Subscription> subs;
        lock.lock();
        try {
            closed = true;
            changed.signalAll();
            subs = List.copyOf(subscriptions);
        } finally {
            lock.unlock();
        }
        for (Subscription s : subs) s.join();
    }

    private boolean isFull() { return nextOffset - minCommitted() >= ring.length; }

    private long minCommitted() {
        long min = nextOffset;
        for (Subscription s : subscriptions) min = Math.min(min, s.committed());
        return min;
    }
}

// ---------- Subscription ----------

final class Subscription {
    private final String name;
    private final Topic topic;
    private final MessageHandler handler;
    private final int maxAttempts;
    private final List<Message> deadLetters = new CopyOnWriteArrayList<>();
    private final AtomicInteger redeliveries = new AtomicInteger();
    private final Thread worker;
    private volatile long committed;

    Subscription(String name, Topic topic, MessageHandler handler, int maxAttempts, long startOffset) {
        this.name = name;
        this.topic = topic;
        this.handler = handler;
        this.maxAttempts = maxAttempts;
        this.committed = startOffset;
        this.worker = new Thread(this::run, "sub-" + name);
        worker.setDaemon(true);
    }

    void start() { worker.start(); }
    long committed() { return committed; }
    void setCommitted(long next) { committed = next; }
    int redeliveries() { return redeliveries.get(); }
    List<String> deadLetterIds() { return deadLetters.stream().map(Message::id).toList(); }

    private void run() {
        try {
            long next = committed;
            for (Message m = topic.awaitAt(next); m != null; m = topic.awaitAt(next)) {
                deliver(m);
                next = m.offset() + 1;
                topic.acknowledge(this, next);                   // at least once: commit only after handling
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private void deliver(Message m) throws InterruptedException {
        for (int attempt = 1; ; attempt++) {
            try {
                handler.handle(m);
                return;
            } catch (InterruptedException e) {
                throw e;
            } catch (Exception e) {
                if (attempt >= maxAttempts) {
                    deadLetters.add(m);                          // park the poison message and move on
                    return;
                }
                redeliveries.incrementAndGet();
            }
        }
    }

    /** Stops delivery; undelivered messages stop counting towards backpressure. */
    void close() throws InterruptedException {
        topic.unsubscribe(this);
        worker.interrupt();
        worker.join();
    }

    void join() throws InterruptedException { worker.join(); }

    @Override public String toString() { return name + "@" + committed; }
}

// ---------- Broker ----------

final class Broker implements AutoCloseable {
    private final Map<String, Topic> topics = new ConcurrentHashMap<>();

    void createTopic(String name, int capacity, OverflowPolicy policy) {
        if (topics.putIfAbsent(name, new Topic(name, capacity, policy)) != null) throw new IllegalArgumentException("topic " + name + " exists");
    }

    long publish(String topic, String id, String payload) { return topic(topic).publish(id, payload); }

    Subscription subscribe(String topic, String name, MessageHandler handler, int maxAttempts) {
        return topic(topic).subscribe(name, handler, maxAttempts);
    }

    boolean awaitDrained(String topic, Duration timeout) throws InterruptedException { return topic(topic).awaitDrained(timeout); }

    private Topic topic(String name) {
        Topic t = topics.get(name);
        if (t == null) throw new IllegalArgumentException("no topic " + name);
        return t;
    }

    /** Lets every subscriber finish what was already published, then stops the workers. */
    @Override public void close() {
        try {
            for (Topic t : topics.values()) t.close();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();                      // keep the interrupt for the caller to see
        }
    }
}
```
````

## Design decisions

- **Offsets instead of per-subscriber queues.** One log per topic, one number per subscriber. Fan-out costs no copying, and "how far behind is everyone" is a subtraction.
- **Commit after handling = at least once.** The offset moves only when the handler returns (or the message is dead-lettered). Moving it *before* handling would be at-most-once: a crash loses the message.
- **Idempotency belongs to the consumer.** `DedupingHandler` wraps any handler and skips IDs it has handled, turning at-least-once into effectively-once processing for that subscriber (see [Idempotency](lesson:idempotency)).
- **Bounded memory through backpressure.** The ring buffer holds at most `capacity` messages; when the slowest subscriber is that far behind, producers wait or are rejected — the `OverflowPolicy` strategy decides (see [Strategy](lesson:strategy)).
- **Observer, with isolation.** Subscribers register handlers and are notified of new messages, but each runs on its own worker thread with its own offset: a slow or failing subscriber can't delay the others (see [Observer](lesson:observer)).
- **Poison messages don't block the stream.** After `maxAttempts` the message is parked in the dead-letter list and the subscriber continues.

## Patterns and principles

[Observer](lesson:observer) (subscriptions), [Strategy](lesson:strategy) (`OverflowPolicy`), [Decorator](lesson:decorator) (`DedupingHandler`), [idempotency](lesson:idempotency), and producer–consumer [coordination](lesson:coordination) with one lock and one condition per topic (see also [Locks and atomics](lesson:locks-and-atomics)).

## Example execution flow

```text
publish o1..o4 (o3 twice)    offsets 0..4 in the orders log
billing      o1 ok; o2 throws (db timeout) -> retry -> ok; o3 ok; o3 ok again (no dedupe);
             o4 throws 3 times -> dead letter; committed = 5
shipping     DedupingHandler: o1, o2, o3 handled; second o3 skipped; o4 ignored by the handler; committed = 5
audit (capacity 2): slow-auditor blocks inside a1
publish a1, a2               lag 2 = capacity
publish a3                   full -> BlockFor waits 100 ms -> still full -> BackpressureException
release; auditor acks a1, a2 -> publish a3 succeeds
```

```text title="Program output"
orders drained: true
billing handled [o1, o2, o3, o3], redeliveries 3, dead letters [o4]
shipping handled [o1, o2, o3] (duplicates skipped), offset 5
Rejected: topic audit is full (2 unacknowledged messages)
audit handled [a1, a2, a3]
```

## Edge cases

- **No subscribers** → nothing to wait for; messages are accepted and immediately unneeded.
- **A subscriber joins late** → starts at the next offset; it doesn't see history.
- **Handler throws** → retried immediately up to `maxAttempts`, then dead-lettered; the offset still advances.
- **Duplicate publish (same ID)** → two messages in the log; deduping subscribers handle it once.
- **Slowest subscriber unsubscribes** → its offset no longer counts; blocked publishers wake up.
- **Close** → each subscriber drains what was published before close, then its worker exits.

## Tests

```java title="PubSubTest.java" file="PubSubTest.java" test="PubSubDemo.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class PubSubTest {
    @Test
    void everySubscriberGetsEveryMessageInOrder() throws Exception {
        try (Broker b = new Broker()) {
            b.createTopic("t", 16, new BlockFor(Duration.ofSeconds(5)));
            List<Long> one = Collections.synchronizedList(new ArrayList<>());
            List<Long> two = Collections.synchronizedList(new ArrayList<>());
            b.subscribe("t", "one", m -> one.add(m.offset()), 1);
            b.subscribe("t", "two", m -> two.add(m.offset()), 1);
            for (int i = 0; i < 1_000; i++) b.publish("t", "m" + i, "p");
            assertTrue(b.awaitDrained("t", Duration.ofSeconds(10)));
            List<Long> expected = new ArrayList<>();
            for (long i = 0; i < 1_000; i++) expected.add(i);
            assertEquals(expected, one);
            assertEquals(expected, two);
        }
    }

    @Test
    void failuresAreRetriedThenDeadLettered() throws Exception {
        try (Broker b = new Broker()) {
            b.createTopic("t", 8, new Reject());
            AtomicInteger calls = new AtomicInteger();
            Subscription s = b.subscribe("t", "s", m -> { calls.incrementAndGet(); throw new IllegalStateException("always"); }, 4);
            b.publish("t", "poison", "x");
            assertTrue(b.awaitDrained("t", Duration.ofSeconds(5)));
            assertEquals(4, calls.get());
            assertEquals(3, s.redeliveries());
            assertEquals(List.of("poison"), s.deadLetterIds());
        }
    }

    @Test
    void offsetAdvancesOnlyAfterTheHandlerFinishes() throws Exception {
        try (Broker b = new Broker()) {
            b.createTopic("t", 8, new Reject());
            CountDownLatch inside = new CountDownLatch(1);
            CountDownLatch release = new CountDownLatch(1);
            Subscription s = b.subscribe("t", "s", m -> { inside.countDown(); release.await(); }, 1);
            b.publish("t", "m", "x");
            assertTrue(inside.await(5, TimeUnit.SECONDS));
            assertEquals(0, s.committed());                       // still being handled: not acknowledged
            release.countDown();
            assertTrue(b.awaitDrained("t", Duration.ofSeconds(5)));
            assertEquals(1, s.committed());
        }
    }

    @Test
    void dedupingHandlerSkipsRedeliveredIds() throws Exception {
        List<String> seen = new ArrayList<>();
        DedupingHandler h = new DedupingHandler(m -> seen.add(m.id()));
        h.handle(new Message(0, "a", "x"));
        h.handle(new Message(1, "a", "x"));
        h.handle(new Message(2, "b", "x"));
        assertEquals(List.of("a", "b"), seen);
    }

    @Test
    void slowSubscriberCausesBackpressureUntilItUnsubscribes() throws Exception {
        try (Broker b = new Broker()) {
            b.createTopic("t", 2, new BlockFor(Duration.ofSeconds(5)));
            CountDownLatch never = new CountDownLatch(1);
            Subscription slow = b.subscribe("t", "slow", m -> never.await(), 1);
            b.publish("t", "1", "x");
            b.publish("t", "2", "x");
            Thread publisher = new Thread(() -> b.publish("t", "3", "x"));
            publisher.start();
            publisher.join(200);
            assertTrue(publisher.isAlive());                      // blocked: the topic is full
            slow.close();                                         // the laggard leaves
            publisher.join(5_000);
            assertTrue(!publisher.isAlive());
        }
    }

    @Test
    void rejectPolicyFailsFast() throws Exception {
        try (Broker b = new Broker()) {
            b.createTopic("t", 1, new Reject());
            CountDownLatch release = new CountDownLatch(1);
            b.subscribe("t", "s", m -> release.await(), 1);
            b.publish("t", "1", "x");
            assertThrows(BackpressureException.class, () -> b.publish("t", "2", "x"));
            release.countDown();
        }
    }

    @Test
    void concurrentPublishersKeepEachProducersOrder() throws Exception {
        try (Broker b = new Broker()) {
            b.createTopic("t", 64, new BlockFor(Duration.ofSeconds(10)));
            List<String> got = Collections.synchronizedList(new ArrayList<>());
            b.subscribe("t", "s", m -> got.add(m.payload()), 1);
            List<Thread> producers = new ArrayList<>();
            for (int p = 0; p < 4; p++) {
                int id = p;
                producers.add(new Thread(() -> { for (int i = 0; i < 500; i++) b.publish("t", id + "-" + i, id + ":" + i); }));
            }
            producers.forEach(Thread::start);
            for (Thread t : producers) t.join();
            assertTrue(b.awaitDrained("t", Duration.ofSeconds(10)));
            assertEquals(2_000, got.size());
            for (int p = 0; p < 4; p++) {
                String prefix = p + ":";
                List<Integer> seq = got.stream().filter(s -> s.startsWith(prefix)).map(s -> Integer.parseInt(s.substring(prefix.length()))).toList();
                for (int i = 0; i < seq.size(); i++) assertEquals(i, seq.get(i));
            }
        }
    }
}
```

## Concurrency

- **One lock and one condition per topic.** Publishers wait for space, workers wait for messages, `awaitDrained` waits for acknowledgements; `signalAll` after each publish or ack wakes everyone, and each re-checks its own condition in a loop (which also makes spurious wake-ups harmless).
- **Handlers run outside the lock.** A worker takes the lock only to fetch the next message and to acknowledge; a slow handler never blocks publishers or other subscribers — only its own offset falls behind.
- **Per-producer order** follows from the lock: a single producer's publishes get increasing offsets. Across producers the order is whatever order they acquired the lock.
- **Ring buffer safety:** a slot is overwritten only when every subscriber's committed offset has passed it, and that check happens under the same lock as the write.
- **Topics are independent:** separate locks, so a busy topic doesn't slow down another.

## Common mistakes and alternatives

- **Committing the offset before calling the handler** — silently at-most-once.
- **Retrying a poison message forever** — the subscription stops making progress.
- **An unbounded queue per subscriber** — one stuck subscriber eventually exhausts memory.
- **Calling handlers while holding the topic lock** — one slow handler stalls every publisher.
- **Dedupe that records the ID before handling** — a failed attempt would then be skipped on retry.
- **Alternative:** a pull API (`poll(max)` + `commit(offset)`) like Kafka consumers; the caller controls threading and batching. Push is friendlier for in-process use; pull scales better across processes.

## Follow-up questions

````reveal title="Consumer groups (work sharing)"
Members of a group share one offset space: split the topic into **partitions** (by hash of a message key), and assign each partition to exactly one member of the group. Order is then preserved per key, and adding members spreads the work. Rebalancing on join/leave reassigns partitions, resuming from each partition's committed offset.
````

````reveal title="Durable topics and replay"
Append messages to a file (segment files with an index) instead of a ring buffer, and store committed offsets durably. Retention becomes time- or size-based rather than "until everyone acked", and a new subscriber can choose to start from the earliest offset to replay history.
````

````reveal title="Retry with backoff without blocking the stream"
Instead of retrying in place (which delays every later message), move a failed message to a **retry topic** with a "not before" time; a separate subscriber re-delivers it after the backoff. The main stream keeps flowing, at the cost of no longer preserving order for retried messages.
````

## Complexity

- `publish`: O(S) to compute the minimum committed offset over S subscribers (cacheable).
- Delivery: O(1) per message per subscriber.
- Memory: O(capacity) per topic, regardless of how many subscribers.

## Interviewer checklist

- [ ] Offsets per subscriber over a shared log; fan-out semantics
- [ ] At-least-once via commit-after-handle; idempotent consumers
- [ ] Retries and dead letters for poison messages
- [ ] Bounded memory and an explicit backpressure policy
- [ ] Subscriber isolation (own thread, own offset)
- [ ] Locking and signalling explained
