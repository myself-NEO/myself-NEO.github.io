## Acquire, use, release

Some objects hold **resources** beyond plain memory: file handles, sockets, database connections, locks, threads, timers, seat holds, reserved inventory. The garbage collector frees memory, but it doesn't reliably release these — or not soon enough. Every resource needs a clear **lifecycle**: who acquires it, who releases it, and what happens when something goes wrong in between.

Leaks show up as "too many open files", exhausted connection pools, JVMs that won't shut down because of non-daemon threads, or — in LLD domains — seats held forever and stock that's never released.

## `AutoCloseable` and try-with-resources

Any class that holds a releasable resource should implement `AutoCloseable` (or `Closeable` for I/O). Callers then use **try-with-resources**, which guarantees `close()` runs even if an exception is thrown, and closes multiple resources in reverse order.

```java title="Deterministic cleanup with try-with-resources" file="ResourceDemo.java"
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.locks.ReentrantLock;

public class ResourceDemo {
    public static void main(String[] args) {
        // 1. Resources close in reverse order, even when the body throws.
        try (Resource db = new Resource("db-connection"); Resource file = new Resource("report.csv")) {
            System.out.println("using " + db.name() + " and " + file.name());
            throw new IllegalStateException("something failed mid-way");
        } catch (IllegalStateException e) {
            System.out.println("caught: " + e.getMessage());
        }

        // 2. A lock wrapped as an AutoCloseable "guard".
        ReentrantLock lock = new ReentrantLock();
        try (LockGuard ignored = LockGuard.acquire(lock)) {
            System.out.println("in critical section, locked=" + lock.isLocked());
        }
        System.out.println("after block, locked=" + lock.isLocked());

        // 3. A domain resource: a seat hold that is released unless committed.
        SeatMap seats = new SeatMap();
        try (SeatMap.Hold hold = seats.hold(List.of("A1", "A2"))) {
            System.out.println("held " + hold.seats() + "; payment fails...");
            // no hold.commit() -> released automatically on close
        }
        System.out.println("free after failed payment: " + seats.free());

        try (SeatMap.Hold hold = seats.hold(List.of("A1"))) {
            hold.commit();                                  // payment succeeded
        }
        System.out.println("free after successful payment: " + seats.free());
    }
}

class Resource implements AutoCloseable {
    private final String name;
    Resource(String name) { this.name = name; System.out.println("open " + name); }
    String name() { return name; }
    @Override public void close() { System.out.println("close " + name); }
}

final class LockGuard implements AutoCloseable {
    private final ReentrantLock lock;
    private LockGuard(ReentrantLock lock) { this.lock = lock; }
    static LockGuard acquire(ReentrantLock lock) { lock.lock(); return new LockGuard(lock); }
    @Override public void close() { lock.unlock(); }
}

final class SeatMap {
    private final List<String> free = new ArrayList<>(List.of("A1", "A2", "A3"));

    synchronized Hold hold(List<String> wanted) {
        if (!free.containsAll(wanted)) throw new IllegalStateException("unavailable: " + wanted);
        free.removeAll(wanted);
        return new Hold(wanted);
    }

    synchronized List<String> free() { return List.copyOf(free); }

    private synchronized void release(List<String> seats) { free.addAll(seats); }

    /** Released on close unless committed: the safe default. */
    final class Hold implements AutoCloseable {
        private final List<String> seats;
        private boolean committed;
        private boolean closed;

        private Hold(List<String> seats) { this.seats = List.copyOf(seats); }

        List<String> seats() { return seats; }
        void commit() { committed = true; }

        @Override public void close() {
            if (closed) return;                 // idempotent close
            closed = true;
            if (!committed) release(seats);
        }
    }
}
```

The `Hold` pattern — **release on close unless committed** — makes the safe outcome the default. If any step between acquiring and committing throws, the seats come back automatically.

## Rules for `close()`

- **Idempotent**: calling `close()` twice must be harmless.
- **Don't throw if you can help it**; if you must, the exception is attached as *suppressed* to any primary exception from the try body.
- **Release in reverse acquisition order**; try-with-resources does this for you.
- After closing, other methods should fail clearly (`IllegalStateException("closed")`).

## Executors and background threads

Thread pools are resources too. A non-shutdown `ExecutorService` keeps the JVM alive and leaks threads.

```java
ExecutorService workers = Executors.newFixedThreadPool(4);
try {
    // submit work
} finally {
    workers.shutdown();                                        // stop accepting new tasks
    if (!workers.awaitTermination(10, TimeUnit.SECONDS)) {     // let running tasks finish
        workers.shutdownNow();                                 // interrupt stragglers
    }
}
```

(On Java 19+, `ExecutorService` itself implements `AutoCloseable`. For Java 17 compatibility, use the explicit pattern above, or wrap the executor in your own `AutoCloseable` component such as a `Scheduler` with `close()`.)

Make long-running loops **interruptible** (check `Thread.currentThread().isInterrupted()` and handle `InterruptedException` by restoring the flag) so `shutdownNow()` actually stops them.

## Leases: resources with expiry

In distributed and concurrent designs you often can't rely on the holder to release, because the client might crash. Use a **lease**: the resource is held **until an expiry time**, and the holder must renew it or commit before then.

- Seat holds expire after 10 minutes ([Movie Booking](problem:movie-ticket-booking)).
- Flash-sale reservations expire if checkout doesn't complete ([Flash Sale](problem:flash-sale-inventory)).
- A task scheduler's worker leases a job; if it doesn't finish in time, the job becomes visible again ([Task Scheduler](problem:task-scheduler)).

Expiry is a [state transition](lesson:state-machines) and must be [race-safe](lesson:concurrent-state-transitions) with commit.

## Other lifecycles to manage

- **Listeners/subscriptions** — return an unsubscribe handle (see [Observer](lesson:observer)) to avoid leaks.
- **Caches** — bound their size and evict, or they become memory leaks ([Cache](problem:cache-eviction)).
- **Components with start/stop** — a logger with a flushing thread, or a scheduler. Give them explicit `start()` and `close()` methods, and close them in reverse order of creation in `main`.

## Real-world example

A reporting service opened a JDBC `ResultSet` and returned a lazy iterator to callers, who sometimes stopped iterating early. Unclosed cursors accumulated until the database refused connections every afternoon. The fix was to make the iterator `AutoCloseable`, require callers to use try-with-resources, and close automatically when iteration completes. In general, **whoever acquires should release, in the same scope**.

## Common mistakes

- Closing in `finally` blocks by hand and getting it wrong (nested try/finally, swallowed exceptions).
- **Leaking executors**, or using non-daemon threads with no shutdown path.
- **Domain holds without expiry**, held forever when clients vanish.
- `close()` that throws on a second call.
- Relying on **finalizers or `Cleaner`** for correctness; they're safety nets at best.

## In the interview

> [!INTERVIEW] Name the release path
> *"Seat holds are leases with a 10-minute expiry. The booking flow uses a hold object that releases on close unless committed, so any failure between hold and payment returns the seats. The scheduler that expires holds owns an executor that `main` shuts down cleanly."*

## Key takeaways

- Resources need explicit **acquire/release lifecycles**; GC isn't enough.
- Implement **`AutoCloseable`** and use **try-with-resources**; make `close()` idempotent.
- **Release unless committed** makes the safe path the default.
- Shut down **executors** properly; make loops interruptible.
- Use **leases with expiry** when holders may disappear.

## Knowledge check

```quiz
? What does try-with-resources guarantee?
+ close() is called on each resource, in reverse order, even if the body throws
- No exceptions are ever thrown
- Resources are closed in the order they were opened
> Resources close in reverse order, with suppressed exceptions preserved.

? Why should a seat hold have an expiry (a lease)?
+ The client might crash or abandon checkout, and the seats must eventually return to the pool
- To make the code faster
- Because Java objects can't live longer than 10 minutes
> Leases bound how long an absent holder can block others.

? A "release unless committed" Hold object is closed twice. What should happen?
+ Nothing on the second call: close() should be idempotent
- It should release the seats a second time
- It should throw IllegalStateException
> Idempotent close prevents double-releases and surprises.
```

## Exercise

Design a `ReservationScope` for a [flash-sale](problem:flash-sale-inventory) checkout that reserves stock for several items, all or nothing; is `AutoCloseable` and releases everything unless `commit()` is called; and has a deadline after which `commit()` throws. Write the class and a usage example in which payment fails.

````hint title="Hint"
Reserve items one by one; if any reservation fails, release the ones already taken before throwing. Store the reserved items for `close()`.
````

````solution title="Sample answer"
```java
final class ReservationScope implements AutoCloseable {
    private final Inventory inventory;
    private final Map<String, Integer> reserved = new LinkedHashMap<>();
    private final Instant deadline;
    private final Clock clock;
    private boolean committed, closed;

    ReservationScope(Inventory inventory, Map<String, Integer> wanted, Duration ttl, Clock clock) {
        this.inventory = inventory;
        this.clock = clock;
        this.deadline = clock.instant().plus(ttl);
        try {
            wanted.forEach((sku, qty) -> {
                if (!inventory.tryReserve(sku, qty)) throw new OutOfStockException(sku);
                reserved.put(sku, qty);
            });
        } catch (RuntimeException e) {
            releaseAll();                         // all-or-nothing
            throw e;
        }
    }

    void commit() {
        if (closed) throw new IllegalStateException("closed");
        if (!clock.instant().isBefore(deadline)) throw new IllegalStateException("reservation expired");
        inventory.confirm(reserved);
        committed = true;
    }

    @Override public void close() {
        if (closed) return;
        closed = true;
        if (!committed) releaseAll();
    }

    private void releaseAll() { reserved.forEach(inventory::release); reserved.clear(); }
}

// Usage
try (ReservationScope scope = new ReservationScope(inventory, Map.of("PHONE-X", 1, "CASE-X", 1), Duration.ofMinutes(5), clock)) {
    payments.charge(card, total);   // throws PaymentDeclinedException
    scope.commit();
}                                     // payment failed -> close() releases both items
```
````
