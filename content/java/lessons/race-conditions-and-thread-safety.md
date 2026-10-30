## Concept explanation

### What a race condition is

A **race condition** happens when the correctness of a program depends on the **relative timing** of threads. The program works in tests, then fails under load, intermittently and unreproducibly. Two shapes cover most real races:

**1. Read-modify-write.** `count++` looks like one operation but is three: *read* `count`, *add* 1, *write* it back. Two threads can both read 41 and both write 42: one increment is **lost**.

```text
  thread A: read 41            add -> 42   write 42
  thread B:          read 41   add -> 42             write 42      result: 42, not 43
```

**2. Check-then-act.** A decision based on a check that's stale by the time you act:

```java
if (instance == null) instance = new Service();        // two threads both see null: two instances
if (!map.containsKey(k)) map.put(k, create());         // both create; one overwrites the other
if (stock >= qty) stock -= qty;                        // both pass the check: oversold
```

Using a thread-safe collection doesn't fix check-then-act: each call is atomic, but the **sequence** of two calls isn't.

### Atomicity and critical sections

An operation is **atomic** if other threads can never see it half-done. A **critical section** is a piece of code that must run atomically with respect to other code touching the same state. You protect it with **mutual exclusion** (`synchronized`, locks) or replace it with an **atomic primitive** (`AtomicInteger.incrementAndGet`, `ConcurrentHashMap.computeIfAbsent`). Every access to the shared state, reads included, must go through the same protection.

### What makes a class thread-safe

A class is **thread-safe** if it behaves correctly when used from several threads, with no extra synchronisation by callers. Strategies, roughly in order of preference:

| Strategy | Idea | Examples |
|---|---|---|
| **Don't share** (thread confinement) | each thread has its own data | local variables, objects created and used within one request, `ThreadLocal` |
| **Don't mutate** (immutability) | shared data never changes, so there's nothing to race on | `String`, records with immutable components, `List.of` |
| **Delegate** | use thread-safe building blocks for single-variable state | `AtomicLong`, `ConcurrentHashMap`, `BlockingQueue`, `LongAdder` |
| **Synchronise** | guard all access to related state with one lock | `synchronized` methods, `ReentrantLock` |

**Invariants that span several variables** (for example `low <= high`, or "balance equals the sum of entries") need **one lock around all of them**. Making each field individually atomic doesn't preserve the relationship.

### Data races vs race conditions

A **data race** is a Java Memory Model term: two threads access the same variable, at least one writes, and there's no happens-before ordering. Data races cause *visibility* problems as well (next lesson). A **race condition** is a logic error about timing. You can have a race condition without a data race (check-then-act with a `ConcurrentHashMap`), and vice versa.

## Internal working

- **`count++` in bytecode** is `getfield count`, `iconst_1`, `iadd`, `putfield count`: four instructions, and the thread can be preempted, or simply run in parallel on another core, between any two of them. On multicore CPUs the load and store are separate memory operations even when the JIT turns the sequence into one machine instruction like `add [mem], 1`, unless it uses a `lock`-prefixed atomic instruction, which is what `AtomicInteger` emits.
- **Why races hide in testing**: the window between check and act may be a few nanoseconds. It only gets hit under real concurrency (many cores, high load, GC pauses, context switches at unlucky moments). That's why tests for concurrent code *widen the window* deliberately (latches, barriers, `Thread.yield()` hooks) or use tools like **jcstress**, which run millions of interleavings.
- **Compound actions on thread-safe collections**: `Collections.synchronizedList` locks each method on the list itself. Callers can perform a multi-step action atomically by **client-side locking**, `synchronized (list) { if (!list.contains(x)) list.add(x); }`, because it's the same lock. `ConcurrentHashMap` doesn't use a lock you can hold; it offers atomic compound methods instead: `putIfAbsent`, `computeIfAbsent`, `merge`, `compute`, `replace(k, old, new)`.
- **Stateless and immutable objects are always thread-safe**: no shared mutable state means no races. That's why servlets, Spring singletons and request handlers should keep request data in local variables, not in fields.

## Visual representation

```text title="Lost update and check-then-act, step by step"
  read-modify-write (count = 41)                     check-then-act (stock = 1, two buyers)
  ---------------------------------                  ---------------------------------------
  A: load 41                                         A: if (stock >= 1)      -> true
  B: load 41                                         B: if (stock >= 1)      -> true
  A: add 1 -> 42, store 42                           A: stock -= 1           -> 0
  B: add 1 -> 42, store 42   <- A's update lost      B: stock -= 1           -> -1   oversold

  fix: make the whole read-modify-write or check-then-act ONE atomic step
       synchronized (lock) { ... }   |   atomic.incrementAndGet()   |   map.computeIfAbsent(k, f)
```

## Java code example

The check-then-act races below get a **test hook**: a `CyclicBarrier` placed *inside* the unsafe window, so both threads are guaranteed to be there at the same time. That turns "fails one run in a million" into "fails every time", which is how you write reliable tests for race conditions.

```java title="RaceConditions.java" file="RaceConditions.java"
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.atomic.AtomicInteger;

public class RaceConditions {
    static int unsafeCount;
    static int syncCount;
    static final AtomicInteger atomicCount = new AtomicInteger();
    static final Object LOCK = new Object();
    static final AtomicInteger servicesCreated = new AtomicInteger();

    static final class Service {
        Service() {
            servicesCreated.incrementAndGet();
        }
    }

    static Service instance;

    static Service unsafeGet(CyclicBarrier window) {
        if (instance == null) {                           // check
            await(window);                                // TEST HOOK: both threads are now inside the gap
            instance = new Service();                     // act
        }
        return instance;
    }

    static synchronized Service safeGet() {
        if (instance == null) {
            instance = new Service();
        }
        return instance;
    }

    static void runInThreads(int threads, Runnable body) throws InterruptedException {
        List<Thread> all = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            Thread t = new Thread(body);
            all.add(t);
            t.start();
        }
        for (Thread t : all) {
            t.join();
        }
    }

    public static void main(String[] args) throws Exception {
        // 1. Read-modify-write: count++ loses updates
        boolean lost = false;
        for (int attempt = 1; attempt <= 20 && !lost; attempt++) {
            unsafeCount = 0;
            runInThreads(4, () -> {
                for (int i = 0; i < 100_000; i++) {
                    unsafeCount++;
                }
            });
            lost = unsafeCount != 400_000;
        }
        System.out.println("unsynchronized count++ lost updates: " + lost);
        runInThreads(4, () -> {
            for (int i = 0; i < 100_000; i++) {
                synchronized (LOCK) {
                    syncCount++;
                }
                atomicCount.incrementAndGet();
            }
        });
        System.out.println("synchronized count = " + syncCount + ", AtomicInteger count = " + atomicCount.get());

        // 2. Check-then-act: lazy initialisation
        CyclicBarrier window = new CyclicBarrier(2);
        runInThreads(2, () -> unsafeGet(window));
        System.out.println("unsafe lazy init created " + servicesCreated.get() + " instances");
        instance = null;
        servicesCreated.set(0);
        runInThreads(8, RaceConditions::safeGet);
        System.out.println("synchronized lazy init created " + servicesCreated.get() + " instance");

        // 3. Check-then-act on a thread-safe map is still a race
        Map<String, Service> cache = new ConcurrentHashMap<>();
        servicesCreated.set(0);
        CyclicBarrier mapWindow = new CyclicBarrier(2);
        runInThreads(2, () -> {
            if (!cache.containsKey("db")) {               // each call is atomic...
                await(mapWindow);
                cache.put("db", new Service());           // ...but the sequence is not
            }
        });
        System.out.println("containsKey + put created " + servicesCreated.get() + " services for one key");
        Map<String, Service> fixed = new ConcurrentHashMap<>();
        servicesCreated.set(0);
        runInThreads(8, () -> fixed.computeIfAbsent("db", k -> new Service()));
        System.out.println("computeIfAbsent created " + servicesCreated.get() + " service");

        // 4. Confinement and immutability need no locks
        record Point(int x, int y) { }
        Point shared = new Point(1, 2);                   // immutable: safe to share
        int[] sums = new int[4];
        List<Thread> readers = new ArrayList<>();
        for (int t = 0; t < 4; t++) {
            int id = t;
            Thread reader = new Thread(() -> {
                int local = 0;                            // confined to this thread's stack
                for (int i = 0; i < 1_000; i++) {
                    local += shared.x() + shared.y();
                }
                sums[id] = local;                         // each thread writes its own slot
            });
            readers.add(reader);
            reader.start();
        }
        for (Thread r : readers) {
            r.join();
        }
        System.out.println("immutable + confined: every thread computed " + sums[0] + " (all equal: "
                + (sums[0] == sums[1] && sums[1] == sums[2] && sums[2] == sums[3]) + ")");
    }

    static void await(CyclicBarrier barrier) {
        try {
            barrier.await();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
```

## Output

```text title="Output" output="RaceConditions.java"
unsynchronized count++ lost updates: true
synchronized count = 400000, AtomicInteger count = 400000
unsafe lazy init created 2 instances
synchronized lazy init created 1 instance
containsKey + put created 2 services for one key
computeIfAbsent created 1 service
immutable + confined: every thread computed 3000 (all equal: true)
```

- The unsynchronised counter lost updates. The `synchronized` and `AtomicInteger` counters were exactly 400,000.
- With both threads held inside the check-then-act window, the unsafe lazy initialiser created **two** services. The synchronised version created one, however many threads raced.
- `containsKey` + `put` on a `ConcurrentHashMap` created two services for one key, because each call was thread-safe but the pair wasn't. `computeIfAbsent` made the whole check-and-create atomic.
- Sharing an immutable record and accumulating into locals needed no synchronisation at all.

## Real-world application

- **Double booking and overselling**: "check seat is free, then book it" in application code races unless the check and the write are atomic, using a lock, an atomic update, a database constraint, `SELECT … FOR UPDATE` or optimistic locking with a version column. The same race exists across *processes*, where only database or distributed locks help.
- **Caches**: the "check, compute, put" pattern causes duplicate expensive loads (cache stampedes). `computeIfAbsent` or Caffeine's `get(key, loader)` fix it.
- **Counters and metrics**: request counters as plain `int` fields under-count in production. Use `AtomicLong`, `LongAdder` or a metrics library.
- **Spring singletons and servlets** are shared by all request threads. Instance fields holding request data are a classic race, and the fix is to keep that data in local variables.
- **Lazy singletons** are a famous check-then-act; prefer eager initialisation, an enum singleton, or the holder idiom.

## Common mistakes

- **Believing `count++` or `x += y` is atomic**, even on a `volatile` field.
- **Thinking a thread-safe collection makes compound actions safe** (`if (!map.containsKey(k)) map.put(k, v)`).
- **Synchronising writes but not reads**, or guarding related fields with different locks.
- **Testing concurrency by running once on a laptop** and concluding "it works". Use many threads, many iterations, barrier hooks, and jcstress for low-level code.
- **Adding `synchronized` everywhere**: it kills scalability and can cause deadlocks. Prefer confinement, immutability and atomic building blocks.
- **Storing per-request state in fields** of shared objects (controllers, services, singletons).

## Interview questions

**Q1. What is a race condition? Give two examples.**

````reveal title="Answer"
A bug where correctness depends on the timing or interleaving of threads.
- **Read-modify-write**: `count++` from several threads loses updates, because the read, increment and write can interleave.
- **Check-then-act**: `if (instance == null) instance = new X();` can create two instances; `if (!map.containsKey(k)) map.put(k, v)` can overwrite; `if (stock >= q) stock -= q` can oversell.

The fix is making the compound action atomic.
````

**Q2. Is `i++` atomic in Java? What about on a `volatile int`?**

````reveal title="Answer"
No in both cases. `i++` is a read, an add and a write: separate operations that other threads can interleave with. `volatile` guarantees visibility and ordering of each individual read and write, not atomicity of the combination. Use `AtomicInteger.incrementAndGet()`, `LongAdder`, or a lock.
````

**Q3. If I use a `ConcurrentHashMap`, is my code thread-safe?**

````reveal title="Answer"
Only for single operations. Each method is atomic, but sequences like `containsKey` then `put`, or `get` then `put`, are check-then-act races. Use the map's atomic compound methods (`putIfAbsent`, `computeIfAbsent`, `compute`, `merge`, `replace(k, old, new)`), and make sure the overall invariant doesn't span other unsynchronised state.
````

**Q4. What strategies make a class thread-safe?**

````reveal title="Answer"
- **Don't share state**: thread confinement with local variables, per-request objects, `ThreadLocal`.
- **Make shared state immutable**: final fields, defensive copies, records.
- **Delegate to thread-safe components**: atomics, concurrent collections, `BlockingQueue`.
- **Synchronise all access** to mutable shared state with a single lock covering each invariant.

Document the class's thread-safety guarantees (for example with `@ThreadSafe` or `@GuardedBy` annotations).
````

**Q5. What's the difference between a data race and a race condition?**

````reveal title="Answer"
A **data race** (a JMM term) is two threads accessing the same variable, at least one writing, without a happens-before relationship. It can cause stale or reordered values. A **race condition** is a higher-level logic flaw where the outcome depends on timing. They often coincide, but a check-then-act on a `ConcurrentHashMap` is a race condition with no data race, and a benign racy flag read can be a data race without a logic problem.
````

## Hands-on exercise

An inventory service oversells:

```java
boolean reserve(int qty) {
    if (stock >= qty) {      // check
        stock -= qty;        // act
        return true;
    }
    return false;
}
```

1. Reproduce it **deterministically**: start with `stock = 5`, run 10 threads that each reserve 1, and put a `CyclicBarrier(10)` hook between the check and the act. Show the number of successful reservations and the final (negative) stock.
2. Fix it with `synchronized` (remove the hook: it would deadlock inside the lock) and show exactly 5 successes and a final stock of 0.
3. Write a lock-free version with `AtomicInteger` and a CAS loop, and show the same result.

````hint title="Hint"
The CAS version is: `while (true) { int current = stock.get(); if (current < qty) return false; if (stock.compareAndSet(current, current - qty)) return true; }`. It re-reads and retries if another thread changed the stock in between. Count successes with an `AtomicInteger`.
````

````solution title="Solution"
```java title="InventoryRace.java" file="InventoryRace.java"
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.atomic.AtomicInteger;

public class InventoryRace {
    static class UnsafeInventory {
        int stock = 5;
        final CyclicBarrier window;

        UnsafeInventory(CyclicBarrier window) {
            this.window = window;
        }

        boolean reserve(int qty) {
            if (stock >= qty) {
                try {
                    window.await();                              // test hook: everyone passed the check
                } catch (Exception e) {
                    throw new IllegalStateException(e);
                }
                synchronized (this) {
                    stock -= qty;                                // the decrement itself is atomic...
                }
                return true;                                     // ...but the check before it was stale
            }
            return false;
        }
    }

    static class SynchronizedInventory {
        private int stock = 5;

        synchronized boolean reserve(int qty) {
            if (stock >= qty) {
                stock -= qty;
                return true;
            }
            return false;
        }

        synchronized int stock() {
            return stock;
        }
    }

    static class AtomicInventory {
        private final AtomicInteger stock = new AtomicInteger(5);

        boolean reserve(int qty) {
            while (true) {
                int current = stock.get();
                if (current < qty) {
                    return false;
                }
                if (stock.compareAndSet(current, current - qty)) {   // fails if someone changed it: retry
                    return true;
                }
            }
        }

        int stock() {
            return stock.get();
        }
    }

    static int race(int buyers, java.util.function.BooleanSupplier reserveOne) throws InterruptedException {
        AtomicInteger successes = new AtomicInteger();
        List<Thread> threads = new ArrayList<>();
        for (int i = 0; i < buyers; i++) {
            Thread t = new Thread(() -> {
                if (reserveOne.getAsBoolean()) {
                    successes.incrementAndGet();
                }
            });
            threads.add(t);
            t.start();
        }
        for (Thread t : threads) {
            t.join();
        }
        return successes.get();
    }

    public static void main(String[] args) throws InterruptedException {
        UnsafeInventory unsafe = new UnsafeInventory(new CyclicBarrier(10));
        int sold = race(10, () -> unsafe.reserve(1));
        System.out.println("unsafe:       " + sold + " reservations, final stock " + unsafe.stock);

        SynchronizedInventory sync = new SynchronizedInventory();
        System.out.println("synchronized: " + race(10, () -> sync.reserve(1)) + " reservations, final stock " + sync.stock());

        AtomicInventory atomic = new AtomicInventory();
        System.out.println("CAS loop:     " + race(10, () -> atomic.reserve(1)) + " reservations, final stock " + atomic.stock());
    }
}
```

```text title="Output" output="InventoryRace.java"
unsafe:       10 reservations, final stock -5
synchronized: 5 reservations, final stock 0
CAS loop:     5 reservations, final stock 0
```

All ten buyers passed the stale check, so five items sold ten times and the stock went to −5. Both fixes make "check and decrement" a single atomic step: the lock by excluding other threads, the CAS loop by detecting interference and retrying. In a real system the stock lives in a database, where the equivalent fix is `UPDATE … SET stock = stock - 1 WHERE id = ? AND stock >= 1`, checking the affected-row count.
````

## Knowledge check

```quiz
? Two threads each run count++ 1,000 times on a shared int starting at 0. What can the result be?
+ Any value up to 2,000, often less
- Always exactly 2,000
- Always exactly 1,000
> Interleaved read-modify-write sequences lose updates.

? `if (!map.containsKey(k)) map.put(k, v);` on a ConcurrentHashMap: is it atomic?
+ No; the check and the put can interleave with another thread's
- Yes, ConcurrentHashMap makes all code using it atomic
- Yes, but only for String keys
> Use putIfAbsent or computeIfAbsent.

? Which of these is inherently thread-safe without synchronisation?
+ An immutable object shared between threads
- A HashMap that is only written by one thread and read by others
- A volatile int incremented by many threads
> No mutation means no race.

? Making each of two fields an AtomicInteger is NOT enough when...
+ An invariant relates both fields, like low <= high
- Each field is updated independently
- The fields are only read
> Multi-variable invariants need one lock around both.

? How can a test make a check-then-act race reproducible?
+ Put a latch or barrier inside the window so threads are forced to interleave there
- Run the test once with a single thread
- Add Thread.sleep(1000) in main
> Widening the window turns a rare failure into a certain one.
```

## Key takeaways

- **Race conditions** = timing-dependent correctness. The two classic shapes are **read-modify-write** (`count++`) and **check-then-act** (lazy init, put-if-absent, overselling).
- Thread-safe building blocks don't make **compound actions** atomic. Use atomic compound methods (`computeIfAbsent`, `merge`, CAS) or one lock around the whole sequence.
- Thread-safety strategies: **confinement**, **immutability**, **delegation** to thread-safe classes, **synchronisation** of every access; multi-variable invariants need one lock.
- Races hide in tests. Widen windows with latches or barriers, use many threads, and use jcstress for low-level code.
- `volatile` gives visibility, **not** atomicity of compound actions (next lesson: the memory model).
