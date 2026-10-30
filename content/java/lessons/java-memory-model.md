## Concept explanation

### The surprise: threads can see stale and reordered values

Single-threaded intuition says "a write is immediately visible to everyone, in program order". On real hardware with JIT compilers that's false:

- **Caches and store buffers**: a core's write can sit in its store buffer or cache before other cores see it.
- **Compiler optimisations**: the JIT may keep a field in a register, hoist a read out of a loop, or reorder independent statements.
- **CPU reordering**: out-of-order execution and memory systems reorder loads and stores.

Without synchronisation, a thread may **never** see another thread's write (*visibility*), or see writes in a different order from the one they were made in (*ordering*). The classic symptom:

```java
boolean stop;                          // not volatile
// worker:  while (!stop) { }          -> the JIT hoists the read: loops forever
// main:    stop = true;
```

### The Java Memory Model (JMM)

The JMM (JLS chapter 17, rebuilt in Java 5 by JSR-133) defines exactly which values a read may return. Its central idea is the **happens-before** relation: if action A *happens-before* action B, then A's effects are **visible** to B, and A is **ordered** before B. Without a happens-before path between a write and a read of the same variable you have a **data race**, and the read may see stale values.

**The happens-before rules:**

| Rule | A happens-before B when… |
|---|---|
| Program order | A comes before B in the same thread |
| Monitor lock | A releases (unlocks) a monitor, and B later acquires the same monitor |
| Volatile | A writes a `volatile` variable, and B later reads that variable (seeing the write) |
| Thread start | A calls `t.start()`, and B is any action in `t` |
| Thread termination | A is any action in `t`, and B is a successful `t.join()` (or sees `t.isAlive() == false`) |
| Interruption | A calls `t.interrupt()`, and B is `t` detecting the interrupt |
| Final fields | the end of a constructor (the "freeze") happens-before code that reads the object's `final` fields through a properly published reference |
| Transitivity | A hb B and B hb C, so A hb C |

The `java.util.concurrent` classes document their own edges:
- putting into a `BlockingQueue` hb taking that element out;
- task submission hb task execution;
- task completion hb `Future.get()` returning;
- `countDown()` hb `await()` returning;
- `ConcurrentHashMap.put` hb a `get` that sees the value.

### `volatile`

A `volatile` field gives:
- **visibility**: every read sees the latest write;
- **ordering**: writes before a volatile write can't be moved after it, and reads after a volatile read can't be moved before it. A volatile write publishes everything before it to a thread that reads the variable.
- atomic reads and writes of `long` and `double` (which may otherwise "tear" into two 32-bit halves on some 32-bit platforms).

It does **not** make compound actions atomic (`volatile` `count++` still loses updates). Use it for flags, state published once and read many times, and one-writer patterns.

### Safe publication

An object is **safely published** when the reference *and* its fully constructed state become visible together. The safe ways are:
- initialise it in a **static initialiser**;
- store it in a **`volatile`** field or an `AtomicReference`;
- store it in a **`final`** field of a properly constructed object;
- store it in a field **guarded by a lock**;
- put it into a **concurrent collection** or a `BlockingQueue`.

Publishing through a plain field is a data race: another thread can see the reference but default (zero or null) values in the object's non-final fields.

### Double-checked locking

```java
private static volatile Service instance;       // volatile is REQUIRED
static Service get() {
    Service s = instance;
    if (s == null) {
        synchronized (Service.class) {
            s = instance;
            if (s == null) {
                instance = s = new Service();
            }
        }
    }
    return s;
}
```

Without `volatile`, the write of the reference may become visible *before* the constructor's writes, so another thread can skip the lock and use a half-constructed object. Simpler alternatives: the **holder idiom** (`private static class Holder { static final Service I = new Service(); }`), an **enum** singleton, or eager initialisation.

## Internal working

- **What volatile compiles to** on x86: a volatile *read* is a plain load (x86 doesn't reorder loads with other loads); a volatile *write* is a store followed by a full fence (`lock addl` / `mfence`), which drains the store buffer. On ARM and POWER, `volatile` maps to load-acquire and store-release instructions plus barriers. The JIT also stops treating the field as cacheable in a register.
- **Why the non-volatile loop hangs**: C2 sees that `stop` isn't volatile and isn't written inside the loop, so it hoists the load out and compiles `if (!stop) while (true) { }`. Nothing in the language forces it to reload. The interpreter happens to re-read the field, so the bug may appear only after JIT compilation, which is a classic "works in debug, fails in production".
- **`synchronized`**: a lock acquire has acquire semantics (later accesses can't move before it), and a release has release semantics (earlier accesses can't move after it). This is why *reads* of shared state must also hold the lock: the acquire is what makes the previous holder's writes visible.
- **Final field freeze**: the JIT emits a store-store barrier at the end of constructors that write `final` fields (a no-op on x86, where stores aren't reordered with stores). If `this` escapes during construction, for example by registering a listener in the constructor, the guarantee is void.
- **Out-of-thin-air and causality rules** forbid certain impossible results (values appearing from nowhere). Programmers rarely need them, but they're why the JMM is so long.
- **Testing**: memory-model bugs depend on the CPU, the JIT and timing. A bug may never show on x86 (a relatively strong memory model) and appear on ARM servers (a weak one). **jcstress**, the OpenJDK concurrency stress harness, systematically explores outcomes.

## Visual representation

```text title="Happens-before makes writes visible"
  Thread A                                    Thread B
  --------                                    --------
  data = 42;          (1)
  config.name = "x";  (2)
  ready = true;       (3) volatile write  ------hb------>  (4) volatile read: if (ready)
                                                           (5) read data   -> guaranteed 42
                                                           (6) read name   -> guaranteed "x"
  (1),(2) hb (3) by program order; (3) hb (4) by the volatile rule; (4) hb (5),(6): transitivity

  without volatile:  A's writes may sit in a store buffer, or B's JIT may hoist `ready` into a register
                     -> B may spin forever, or see ready == true but data == 0
```

## Java code example

```java title="JmmDemo.java" file="JmmDemo.java"
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;

public class JmmDemo {
    static boolean plainStop;                 // no happens-before: may never be seen
    static volatile boolean volatileStop;

    static int payload;                        // plain fields published via a volatile flag
    static String message;
    static volatile boolean published;

    static final AtomicInteger constructions = new AtomicInteger();

    static final class Service {
        final String name;

        Service() {
            constructions.incrementAndGet();
            name = "service";
        }
    }

    private static volatile Service instance;

    static Service getInstance() {             // correct double-checked locking
        Service s = instance;
        if (s == null) {
            synchronized (JmmDemo.class) {
                s = instance;
                if (s == null) {
                    instance = s = new Service();
                }
            }
        }
        return s;
    }

    public static void main(String[] args) throws Exception {
        // 1. Visibility: a plain flag vs a volatile flag
        Thread plainSpinner = new Thread(() -> {
            while (!plainStop) {
                // busy loop; the JIT may hoist the read of plainStop
            }
        });
        plainSpinner.setDaemon(true);              // so the demo can exit even if it never stops
        plainSpinner.start();
        Thread volatileSpinner = new Thread(() -> {
            while (!volatileStop) {
                // re-reads the volatile field every iteration
            }
        });
        volatileSpinner.start();
        Thread.sleep(500);                         // let the JIT compile both loops
        plainStop = true;
        volatileStop = true;
        volatileSpinner.join(2_000);
        plainSpinner.join(2_000);
        System.out.println("volatile flag: spinner stopped = " + !volatileSpinner.isAlive());
        System.out.println("plain flag:    spinner stopped = " + !plainSpinner.isAlive() + " (it may spin forever)");

        // 2. Publishing plain data through a volatile write
        Thread reader = new Thread(() -> {
            while (!published) {
                Thread.onSpinWait();
            }
            System.out.println("reader saw payload=" + payload + ", message=" + message + " (guaranteed by happens-before)");
        });
        reader.start();
        payload = 42;                              // ordinary writes...
        message = "hello";
        published = true;                          // ...published by the volatile write
        reader.join();

        // 3. Other happens-before edges: start, join, latch
        int[] box = new int[1];
        box[0] = 7;                                // written before start(): visible in the thread
        Thread t = new Thread(() -> box[0] *= 6);
        t.start();
        t.join();                                  // the thread's writes are visible after join()
        CountDownLatch latch = new CountDownLatch(1);
        String[] handoff = new String[1];
        new Thread(() -> {
            handoff[0] = "via latch";
            latch.countDown();                     // countDown() hb await() returning
        }).start();
        latch.await();
        System.out.println("start/join edge: " + box[0] + ", latch edge: " + handoff[0]);

        // 4. Double-checked locking with volatile: one instance, fully constructed
        CountDownLatch go = new CountDownLatch(1);
        List<Thread> racers = new ArrayList<>();
        AtomicInteger sawName = new AtomicInteger();
        for (int i = 0; i < 16; i++) {
            Thread racer = new Thread(() -> {
                try {
                    go.await();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                if ("service".equals(getInstance().name)) {
                    sawName.incrementAndGet();
                }
            });
            racers.add(racer);
            racer.start();
        }
        go.countDown();                            // release all 16 at once
        for (Thread r : racers) {
            r.join();
        }
        System.out.println("DCL: " + constructions.get() + " construction, " + sawName.get() + " of 16 threads saw the final field set");
    }
}
```

## Output

```text title="Output" output="JmmDemo.java"
volatile flag: spinner stopped = true
plain flag:    spinner stopped = false (it may spin forever)
reader saw payload=42, message=hello (guaranteed by happens-before)
start/join edge: 42, latch edge: via latch
DCL: 1 construction, 16 of 16 threads saw the final field set
```

- The thread spinning on the `volatile` flag stopped immediately. The one spinning on the plain flag was **still running** two seconds after the flag was set: once compiled, its loop never re-read the field. (It's a daemon thread, so the program can still exit.) This is allowed by the JMM and happens routinely on HotSpot.
- The reader saw `payload=42` and `message=hello` without any locks: the volatile write of `published` came after them in program order, and the reader's volatile read saw it.
- `start`/`join` and `CountDownLatch` carried writes between threads just as reliably.
- Double-checked locking with a `volatile` field produced exactly one `Service`, and all 16 threads saw its fields set.

## Real-world application

- **Shutdown and stop flags** (`volatile boolean running`) in workers, schedulers and server loops. Without `volatile`, a stop request may be ignored forever once the loop is compiled.
- **Configuration and feature-flag reloads**: build a new immutable config object, then publish it with one `volatile` (or `AtomicReference`) write. Readers always see a consistent snapshot without locks.
- **Lazy singletons and caches**: double-checked locking needs `volatile`; better still, use the holder idiom, enums, or `ConcurrentHashMap.computeIfAbsent`.
- **Hand-offs through `java.util.concurrent`**: queues, executors, futures and latches all document happens-before. Using them correctly means you rarely reason about the JMM directly.
- **Porting to ARM** (AWS Graviton, Apple Silicon): racy code that "worked" on x86's stronger memory model can start failing.

## Common mistakes

- **Using a plain `boolean` as a cross-thread flag.**
- **Thinking `volatile` makes `count++` atomic.**
- **Synchronising writes but reading without the lock**: the reader has no happens-before edge and may see stale values.
- **Double-checked locking without `volatile`**, which lets threads see a half-constructed object.
- **Letting `this` escape from a constructor** (starting threads, registering listeners), which voids final-field guarantees.
- **"It works on my machine"**: memory-model bugs depend on the CPU, the JIT and load. Prove correctness with happens-before reasoning, not with tests alone.
- **Publishing mutable objects** and then changing them. Publish immutable snapshots instead.

## Interview questions

**Q1. What is the Java Memory Model, and what is happens-before?**

````reveal title="Answer"
The JMM (JLS §17) specifies which values a read can observe in a multithreaded program, given compiler and CPU reorderings and caching. Happens-before is its ordering relation: if A happens-before B, A's effects are visible to and ordered before B. Edges come from:
- program order;
- unlocking then locking the same monitor;
- a volatile write then a read of it;
- `Thread.start`, `join` and `interrupt`;
- final-field freezes;
- `java.util.concurrent` hand-offs;
- transitivity.

Conflicting accesses without a happens-before path are data races, with weak guarantees.
````

**Q2. What does `volatile` guarantee, and what doesn't it?**

````reveal title="Answer"
It guarantees visibility (reads see the most recent write) and ordering: a volatile write publishes all earlier writes to a thread that later reads the variable, and reads and writes can't be reordered across volatile accesses in ways that break this. It also makes `long`/`double` reads and writes atomic. It doesn't make compound actions atomic (`count++`, check-then-act) and doesn't provide mutual exclusion.
````

**Q3. Why does double-checked locking need `volatile`?**

````reveal title="Answer"
Without `volatile`, the write of the instance reference can become visible to another thread before the writes performed by the constructor, because of compiler or CPU reordering, or because the object's fields haven't propagated yet. A second thread that sees a non-null reference skips the synchronised block and can use a partially constructed object. Declaring the field `volatile` makes the reference write a release and the unsynchronised read an acquire, so the constructor's writes happen-before the use.
````

**Q4. Can a thread loop forever on `while (!stop) {}` after another thread sets `stop = true`?**

````reveal title="Answer"
Yes, if `stop` isn't `volatile` (and isn't accessed under a common lock). There's no happens-before edge, so the JIT may legally hoist the read out of the loop, keeping the value in a register, and the loop never sees the update. Declaring `stop` `volatile`, using an `AtomicBoolean`, or reading it under a lock fixes it.
````

**Q5. What does "safe publication" mean? Name some safe publication idioms.**

````reveal title="Answer"
Making an object's reference and its fully initialised state visible to other threads together. Idioms:
- a static initialiser;
- a `volatile` field or `AtomicReference`;
- a `final` field of a properly constructed object;
- a field guarded by a lock that readers also take;
- putting it into a concurrent collection or `BlockingQueue`.

Immutable objects with `final` fields are safe even under data races, provided `this` didn't escape during construction.
````

## Hands-on exercise

Show why publishing **immutable snapshots** through a `volatile` reference beats updating shared mutable fields:
1. **Mutable**: a writer thread repeatedly sets two plain fields, `version` then `checksum = version * 31`, on a shared object. Reader threads check `checksum == version * 31`. Show that readers observe torn, inconsistent states (retry until seen).
2. **Immutable**: the writer publishes `record Config(int version, int checksum)` instances through a `volatile Config current`. Readers check the same invariant on their snapshot. Show zero violations over the same number of reads.

````hint title="Hint"
For the mutable case, the reader reads `version` and `checksum` into locals, then compares them. The writer can be between its two writes, so mismatches happen even without JIT effects. For the immutable case, the reader takes **one** snapshot `Config c = current;` and checks `c.checksum() == c.version() * 31`. Both fields come from the same object, which was fully constructed before it was published.
````

````solution title="Solution"
```java title="SnapshotPublishing.java" file="SnapshotPublishing.java"
import java.util.concurrent.atomic.AtomicLong;

public class SnapshotPublishing {
    static final class MutableConfig {             // shared and mutated: readers can see half an update
        volatile int version;
        volatile int checksum;
    }

    record Config(int version, int checksum) { }

    static volatile Config current = new Config(0, 0);
    static volatile boolean running;

    static long readersSeeTornState(boolean immutable) throws InterruptedException {
        MutableConfig shared = new MutableConfig();
        AtomicLong violations = new AtomicLong();
        running = true;
        Thread writer = new Thread(() -> {
            for (int v = 1; running; v++) {
                if (immutable) {
                    current = new Config(v, v * 31);  // one write publishes a consistent pair
                } else {
                    shared.version = v;               // two separate writes
                    shared.checksum = v * 31;
                }
            }
        });
        Thread[] readers = new Thread[3];
        for (int r = 0; r < readers.length; r++) {
            readers[r] = new Thread(() -> {
                for (int i = 0; i < 2_000_000; i++) {
                    if (immutable) {
                        Config c = current;           // a single snapshot
                        if (c.checksum() != c.version() * 31) {
                            violations.incrementAndGet();
                        }
                    } else {
                        int v = shared.version;
                        int c = shared.checksum;
                        if (c != v * 31) {
                            violations.incrementAndGet();
                        }
                    }
                }
            });
        }
        writer.start();
        for (Thread r : readers) {
            r.start();
        }
        for (Thread r : readers) {
            r.join();
        }
        running = false;
        writer.join();
        return violations.get();
    }

    public static void main(String[] args) throws InterruptedException {
        boolean torn = false;
        for (int attempt = 0; attempt < 10 && !torn; attempt++) {
            torn = readersSeeTornState(false) > 0;
        }
        System.out.println("mutable fields (even volatile ones): readers saw inconsistent pairs: " + torn);
        System.out.println("immutable snapshots via volatile: violations = " + readersSeeTornState(true));
    }
}
```

```text title="Output" output="SnapshotPublishing.java"
mutable fields (even volatile ones): readers saw inconsistent pairs: true
immutable snapshots via volatile: violations = 0
```

Making each field `volatile` gave visibility but not **consistency**: a reader could see the new `version` with the old `checksum`. Publishing one immutable object through one `volatile` reference makes the update atomic from the reader's point of view, with no locks. This is the pattern behind copy-on-write configuration, routing tables and feature-flag reloads.
````

## Knowledge check

```quiz
? A worker loops on `while (!stop) {}` with a non-volatile stop flag set by another thread. What can happen?
+ It may never stop, because the JIT can hoist the read out of the loop
- It always stops within a millisecond
- It throws an IllegalMonitorStateException
> Without a happens-before edge, the update need not ever be seen.

? Which creates a happens-before edge from writer to reader?
+ The writer writes a volatile field after its plain writes, and the reader reads that field and sees the write
- The reader sleeps for 100 ms before reading
- Both threads run on the same CPU core
> Timing never creates happens-before; volatile, locks and j.u.c hand-offs do.

? Does volatile make count++ atomic?
+ No
- Yes
- Only for int, not long
> volatile covers visibility and ordering of single reads and writes.

? Why is `volatile` needed in double-checked locking?
+ So other threads can't see the reference before the constructor's writes
- So the synchronized block is skipped faster
- To make the constructor thread-safe
> Without it, a half-constructed object can escape through the unsynchronised read.

? Which object can safely be shared via a data race (no synchronisation) if `this` didn't escape its constructor?
+ An immutable object whose fields are all final
- An object with private non-final fields
- Any object, as long as it's small
> Final-field semantics guarantee visibility of the constructed values.
```

## Key takeaways

- Without synchronisation, threads may see **stale** values (caches, registers, hoisted loads) and **reordered** writes. The JMM defines what's allowed.
- **Happens-before** gives visibility and ordering: program order, monitor unlock→lock, volatile write→read, `start`, `join`, `interrupt`, final-field freeze, `java.util.concurrent` hand-offs, transitivity.
- **`volatile`** = visibility + ordering (+ atomic `long`/`double`), **not** atomic compound actions.
- **Safe publication**: static initialiser, `volatile`/`AtomicReference`, `final` fields, a common lock, concurrent collections. Prefer publishing **immutable snapshots**.
- Double-checked locking needs `volatile`, or use the holder idiom. Prove correctness with happens-before, and stress-test with jcstress.
