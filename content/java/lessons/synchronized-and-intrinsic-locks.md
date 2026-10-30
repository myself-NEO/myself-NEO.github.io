## Concept explanation

### Intrinsic locks

Every Java object has an **intrinsic lock** (its *monitor*). `synchronized` acquires it on entry and releases it on exit, **including exit by exception**. While one thread holds it, other threads trying to acquire the same lock are `BLOCKED`. `synchronized` gives you two things:

1. **Mutual exclusion**: only one thread at a time executes code guarded by that lock, so compound actions become atomic.
2. **Visibility**: releasing a lock happens-before the next acquisition of the same lock, so everything written inside is visible to the next holder.

### Forms and what they lock

| Form | Lock used |
|---|---|
| `synchronized void m()` (instance method) | `this` |
| `static synchronized void m()` | the `Class` object (`MyClass.class`) |
| `synchronized (obj) { … }` | `obj` |

Consequences:
- An **instance lock and the class lock are unrelated**: a static synchronised method doesn't block instance synchronised methods, and vice versa. So static fields guarded by `synchronized` instance methods aren't protected.
- **Different instances have different locks**: `a.m()` and `b.m()` run in parallel.
- **What matters is the object, not the code**: two different methods synchronising on the same object exclude each other; the same method on different objects doesn't.

### Reentrancy

Intrinsic locks are **reentrant**: a thread that holds a lock can acquire it again (for a recursive call, a call to another synchronised method of the same object, or a subclass calling `super.m()`). The JVM counts acquisitions and releases the lock when the count drops to zero. Without reentrancy, a synchronised method calling another synchronised method on `this` would deadlock with itself.

### Choosing the lock object

- **Prefer a `private final Object lock = new Object();`**: outside code can't synchronise on it, so it can't interfere with or deadlock your class. `synchronized` methods lock `this`, which any caller can also lock.
- **Never lock on**:
  - **a field that gets reassigned**, because threads end up locking different objects;
  - **boxed values or `String` literals**: `Integer` and `String` instances are cached or interned and shared across unrelated code;
  - **`new Object()` created per call**;
  - **value-based classes** (javac warns since Java 16).
- **Guard each piece of shared state with one specific lock**, consistently, for reads *and* writes. Document it (`// guarded by lock`, `@GuardedBy("lock")`).

### Granularity

Keep critical sections **short**: compute outside, lock only to read or update shared state. Never do I/O, remote calls or `sleep` while holding a lock. Too coarse (one lock around everything) kills throughput; too fine (a lock per field) breaks multi-field invariants and invites deadlocks. Match locks to **invariants**.

### `volatile` vs `synchronized`

| | `volatile` | `synchronized` |
|---|---|---|
| Visibility | yes | yes |
| Atomic compound actions | **no** | **yes** |
| Mutual exclusion / blocking | no | yes (threads may block) |
| Typical use | flags, published immutable references | read-modify-write, multi-field invariants |

## Internal working

- **Bytecode**:
  - A `synchronized` block compiles to `monitorenter` / `monitorexit`, plus a hidden exception handler that executes `monitorexit` and rethrows, which is how exceptions release the lock.
  - A `synchronized` method has the `ACC_SYNCHRONIZED` flag; the JVM acquires the lock on invocation.
- **HotSpot locking**, using the object header's mark word:
  - **Lightweight locking**: an uncontended lock is taken with a CAS on the header, or, since the new implementation became the default in Java 23, by pushing the object on a per-thread *lock stack*. It costs about one atomic instruction.
  - **Inflation**: on contention, or when `wait()` is called, the lock is inflated to a heavyweight **`ObjectMonitor`** with an entry queue and a wait set. Contending threads **spin adaptively** for a while (cheap if the holder releases quickly), then park.
  - **Biased locking** (assuming one thread owns a lock forever) was disabled in Java 15 and removed in 18.
- **JIT optimisations**:
  - **lock elision**: escape analysis removes locks on objects that never escape a thread, such as a local `StringBuffer`;
  - **lock coarsening**: adjacent lock/unlock pairs on the same object are merged.
- **Memory effects**: entering a monitor has acquire semantics and exiting has release semantics, which is how `synchronized` provides happens-before.
- **Virtual threads**: in Java 21–23, a virtual thread that blocks *inside* `synchronized` **pins** its carrier thread. Java 24 (JEP 491) removed that limitation, so `synchronized` is again fine with virtual threads.

## Visual representation

```text title="Which lock does each form take?"
  class Account {
      synchronized void deposit()        -> lock: this (the Account instance)
      static synchronized void audit()   -> lock: Account.class   (independent of every instance lock)
      void transfer() { synchronized (lock) { ... } }   -> lock: private final Object lock (preferred)
  }

  acct1.deposit()  ||  acct2.deposit()   run in parallel (different objects)
  acct1.deposit()  ->  acct1.withdraw()  exclude each other (same object, different methods)
  acct1.deposit()  ||  Account.audit()   run in parallel (instance lock vs class lock)

  reentrancy: thread T holds lock(this) [count 1] -> calls another synchronized method [count 2]
              -> returns [count 1] -> returns [count 0: released]
```

## Java code example

```java title="SynchronizedDemo.java" file="SynchronizedDemo.java"
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;

public class SynchronizedDemo {
    static class Account {
        private long balance;                        // guarded by this

        synchronized void deposit(long amount) {
            balance += amount;
        }

        synchronized long balance() {                // reads must lock too (visibility)
            return balance;
        }

        synchronized void holdWhile(CountDownLatch held, CountDownLatch release) throws InterruptedException {
            held.countDown();
            release.await();                         // keeps the instance lock
        }

        static synchronized String audit() {         // locks Account.class, not an instance
            return "audit ran";
        }
    }

    static class Parent {
        synchronized String describe(int depth) {
            return depth == 0 ? "parent" : describe(depth - 1);   // reentrant recursion
        }
    }

    static class Child extends Parent {
        @Override
        synchronized String describe(int depth) {
            return "child -> " + super.describe(depth);           // same lock acquired again
        }
    }

    static void runThreads(int n, Runnable body) throws InterruptedException {
        List<Thread> threads = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            Thread t = new Thread(body);
            threads.add(t);
            t.start();
        }
        for (Thread t : threads) {
            t.join();
        }
    }

    static int sharedCounter;

    public static void main(String[] args) throws Exception {
        // 1. Correct use: one lock guards the state for reads and writes
        Account account = new Account();
        runThreads(4, () -> {
            for (int i = 0; i < 100_000; i++) {
                account.deposit(1);
            }
        });
        System.out.println("balance after 400,000 synchronized deposits: " + account.balance());

        // 2. Instance lock vs class lock vs another instance
        Account other = new Account();
        CountDownLatch held = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        Thread holder = new Thread(() -> {
            try {
                account.holdWhile(held, release);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        holder.start();
        held.await();                                // account's lock is now held
        System.out.println("static synchronized method while an instance lock is held: " + Account.audit());
        other.deposit(5);
        System.out.println("another instance's synchronized method ran: balance " + other.balance());
        Thread blockedDepositor = new Thread(() -> account.deposit(1));
        blockedDepositor.start();
        while (blockedDepositor.getState() != Thread.State.BLOCKED) {
            Thread.sleep(1);
        }
        System.out.println("deposit on the SAME instance is " + blockedDepositor.getState());
        release.countDown();
        holder.join();
        blockedDepositor.join();

        // 3. Reentrancy
        System.out.println("reentrant: " + new Child().describe(3));

        // 4. Exceptions release the lock
        Object lock = new Object();
        try {
            synchronized (lock) {
                throw new IllegalStateException("fail inside synchronized");
            }
        } catch (IllegalStateException e) {
            System.out.println("after exception, main still holds the lock: " + Thread.holdsLock(lock));
        }

        // 5. Wrong lock objects provide no mutual exclusion
        boolean lost = false;
        for (int attempt = 0; attempt < 20 && !lost; attempt++) {
            sharedCounter = 0;
            runThreads(4, () -> {
                for (int i = 0; i < 100_000; i++) {
                    synchronized (new Object()) {    // a different lock every time
                        sharedCounter++;
                    }
                }
            });
            lost = sharedCounter != 400_000;
        }
        System.out.println("synchronized(new Object()) lost updates: " + lost);

        // 6. Interned strings are shared: unrelated code contends on the same lock
        CountDownLatch inA = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(1);
        Thread componentA = new Thread(() -> {
            synchronized ("LOCK") {                  // component A's "private" lock...
                inA.countDown();
                try {
                    done.await();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
        });
        componentA.start();
        inA.await();
        Thread componentB = new Thread(() -> {
            synchronized ("LOCK") {                  // ...is the same interned String in component B
                System.out.println("component B finally got the shared String lock");
            }
        });
        componentB.start();
        while (componentB.getState() != Thread.State.BLOCKED) {
            Thread.sleep(1);
        }
        System.out.println("component B is " + componentB.getState() + " by component A's string-literal lock");
        done.countDown();
        componentA.join();
        componentB.join();
    }
}
```

## Output

```text title="Output" output="SynchronizedDemo.java"
balance after 400,000 synchronized deposits: 400000
static synchronized method while an instance lock is held: audit ran
another instance's synchronized method ran: balance 5
deposit on the SAME instance is BLOCKED
reentrant: child -> child -> child -> child -> parent
after exception, main still holds the lock: false
synchronized(new Object()) lost updates: true
component B is BLOCKED by component A's string-literal lock
component B finally got the shared String lock
```

- All 400,000 deposits survived: `deposit` and `balance` use the same lock (`this`).
- While a thread held `account`'s lock, the **static** synchronised method (which locks `Account.class`) and a **different** account ran freely. Only a deposit on the **same** account was `BLOCKED`.
- The same thread re-acquired the lock it already held five times, with no self-deadlock. (`Parent`'s recursive call `describe(depth - 1)` dispatches back to the `Child` override, hence the repeated "child".)
- The exception released the lock automatically.
- `synchronized (new Object())` excluded nobody. A `String` literal lock coupled two components that had nothing to do with each other.

## Real-world application

- **Small, well-encapsulated shared state** (an in-memory cache with an LRU `LinkedHashMap`, counters with invariants, a connection registry) is often simplest and fast enough with a private lock and `synchronized`.
- **Legacy JDK classes** (`Vector`, `Hashtable`, `StringBuffer`, `Collections.synchronizedXxx`) use `synchronized` per method, which is safe for single calls but needs client-side locking for compound actions.
- **Library design**: frameworks synchronise on private locks so user code can't deadlock them. Locking on `this` in a public class is part of your API.
- **With virtual threads (Java 21–23)**, long blocking operations inside `synchronized` (JDBC calls, for example) pinned carriers. Many libraries switched to `ReentrantLock` for that reason; on Java 24+ it no longer matters.

## Common mistakes

- **Synchronising writes but not reads** (stale reads).
- **Guarding the same state with different locks** (`this` in one method, `lock` in another), or static state with instance locks.
- **Locking on reassigned fields, boxed numbers, `String` literals or `new Object()`.**
- **Calling foreign or overridable code, I/O or `sleep` while holding a lock**: slow, and it risks deadlocks.
- **Over-synchronising**: one global lock around everything serialises the application.
- **Assuming `synchronized` on two separate methods makes a sequence of calls atomic.** The lock is released between calls.

## Interview questions

**Q1. What does `synchronized` guarantee?**

````reveal title="Answer"
- **Mutual exclusion**: only one thread at a time can hold the object's monitor, so guarded compound actions are atomic.
- **Visibility and ordering**: releasing the monitor happens-before every later acquisition of the same monitor, so writes made inside are visible to the next thread that locks it.

The lock is released on normal and exceptional exit, and it's reentrant.
````

**Q2. What is the difference between a synchronized instance method and a synchronized static method?**

````reveal title="Answer"
An instance method locks `this` (each instance has its own lock); a static method locks the `Class` object. They're independent: a thread in a static synchronised method doesn't block threads in instance synchronised methods, and vice versa. Static mutable fields must therefore be guarded by the class lock (or another shared lock), not by instance locks.
````

**Q3. What is reentrancy, and why does it matter?**

````reveal title="Answer"
A reentrant lock can be acquired again by the thread that already holds it. The JVM keeps a hold count and releases the lock when the count returns to zero. It lets synchronised methods call other synchronised methods on the same object, recurse, and call `super` implementations without deadlocking themselves. Intrinsic locks and `ReentrantLock` are both reentrant.
````

**Q4. `volatile` vs `synchronized`?**

````reveal title="Answer"
Both guarantee visibility. `volatile` applies to single reads and writes of a variable: no blocking, no atomicity of compound actions. It suits flags and publishing immutable references. `synchronized` provides mutual exclusion, so compound actions and multi-variable invariants become atomic, plus visibility for everything done under the lock, at the cost of possible blocking and contention.
````

**Q5. Why is synchronising on a `String` literal or an `Integer` a bad idea?**

````reveal title="Answer"
These objects are shared across unrelated code. String literals are interned, so every `"LOCK"` in the JVM is the same object, and small `Integer`s are cached. Unrelated components then contend for, or deadlock on, the same monitor without knowing it. Boxed counters are also replaced on every `++`, so threads lock different objects. Always use a dedicated `private final Object lock`.
````

## Hands-on exercise

A `NumberRange` keeps the invariant `lower <= upper`, using two `AtomicInteger`s:

```java
void setLower(int v) { if (v > upper.get()) throw new IllegalArgumentException(); lower.set(v); }
void setUpper(int v) { if (v < lower.get()) throw new IllegalArgumentException(); upper.set(v); }
```

1. Starting from `(0, 10)`, run `setLower(5)` and `setUpper(4)` concurrently, with a `CyclicBarrier(2)` hook placed after each check. Show that both succeed and the range ends up `(5, 4)`, violating the invariant.
2. Write `SafeRange`, which guards both fields with one private lock (no hook needed). Show that one of the two calls is rejected and the invariant holds, whatever the order.

````hint title="Hint"
Atomic fields make each *field* consistent, but the invariant involves *both*, so both checks and both writes must happen under the same lock. In `SafeRange`, `setLower` and `setUpper` both do `synchronized (lock) { check; write; }`. Run the two calls in two threads and collect any `IllegalArgumentException` messages.
````

````solution title="Solution"
```java title="NumberRangeDemo.java" file="NumberRangeDemo.java"
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.atomic.AtomicInteger;

public class NumberRangeDemo {
    static class UnsafeRange {
        final AtomicInteger lower = new AtomicInteger(0);
        final AtomicInteger upper = new AtomicInteger(10);
        final CyclicBarrier hook;

        UnsafeRange(CyclicBarrier hook) {
            this.hook = hook;
        }

        void setLower(int v) throws Exception {
            if (v > upper.get()) {
                throw new IllegalArgumentException("lower " + v + " > upper");
            }
            hook.await();                                    // both checks have passed
            lower.set(v);
        }

        void setUpper(int v) throws Exception {
            if (v < lower.get()) {
                throw new IllegalArgumentException("upper " + v + " < lower");
            }
            hook.await();
            upper.set(v);
        }
    }

    static class SafeRange {
        private final Object lock = new Object();
        private int lower = 0;                                // guarded by lock
        private int upper = 10;                               // guarded by lock

        void setLower(int v) {
            synchronized (lock) {
                if (v > upper) {
                    throw new IllegalArgumentException("lower " + v + " > upper " + upper);
                }
                lower = v;
            }
        }

        void setUpper(int v) {
            synchronized (lock) {
                if (v < lower) {
                    throw new IllegalArgumentException("upper " + v + " < lower " + lower);
                }
                upper = v;
            }
        }

        String range() {
            synchronized (lock) {
                return "(" + lower + ", " + upper + ")";
            }
        }
    }

    interface Call {
        void run() throws Exception;
    }

    static List<String> concurrently(Call a, Call b) throws InterruptedException {
        List<String> rejected = new CopyOnWriteArrayList<>();
        Thread t1 = new Thread(() -> attempt(a, rejected));
        Thread t2 = new Thread(() -> attempt(b, rejected));
        t1.start();
        t2.start();
        t1.join();
        t2.join();
        return rejected;
    }

    static void attempt(Call call, List<String> rejected) {
        try {
            call.run();
        } catch (IllegalArgumentException e) {
            rejected.add(e.getMessage());
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    public static void main(String[] args) throws InterruptedException {
        UnsafeRange unsafe = new UnsafeRange(new CyclicBarrier(2));
        List<String> rejected = concurrently(() -> unsafe.setLower(5), () -> unsafe.setUpper(4));
        System.out.println("atomic fields: rejected " + rejected + ", range (" + unsafe.lower.get() + ", " + unsafe.upper.get()
                + "), invariant holds: " + (unsafe.lower.get() <= unsafe.upper.get()));

        SafeRange safe = new SafeRange();
        rejected = concurrently(() -> safe.setLower(5), () -> safe.setUpper(4));
        String range = safe.range();                          // (5, 10) or (0, 4): depends on which call won
        System.out.println("one lock:      " + rejected.size() + " call rejected, invariant holds: "
                + (range.equals("(5, 10)") || range.equals("(0, 4)")));
    }
}
```

```text title="Output" output="NumberRangeDemo.java"
atomic fields: rejected [], range (5, 4), invariant holds: false
one lock:      1 call rejected, invariant holds: true
```

With atomic fields, each check passed against the *old* value of the other field, and the range became (5, 4). With one lock around both fields, whichever call ran second saw the first call's update and was rejected. Which call loses depends on timing, but the invariant always holds.
````

## Knowledge check

```quiz
? Which lock does a static synchronized method acquire?
+ The Class object of its class
- this
- A global JVM lock
> It's independent of every instance's lock.

? Thread T holds the lock on `account`. Which call blocks?
+ Another thread calling a synchronized instance method on the same account
- Another thread calling a static synchronized method of Account
- Another thread calling a synchronized method on a different Account
> Locks belong to objects; only the same object's lock conflicts.

? A synchronized method calls another synchronized method on the same object. What happens?
+ It proceeds, because intrinsic locks are reentrant
- Deadlock
- IllegalMonitorStateException
> The hold count goes up and back down.

? What happens to the lock if an exception is thrown inside a synchronized block?
+ It is released automatically
- It stays held until the thread dies
- The JVM throws IllegalMonitorStateException
> The compiler adds a monitorexit in a hidden exception handler.

? Which is the safest lock object for a class's internal state?
+ private final Object lock = new Object();
- A String literal such as "LOCK"
- An Integer field that is incremented
> Private and final: no outside interference, never reassigned.
```

## Key takeaways

- `synchronized` = **mutual exclusion + visibility**. It locks `this`, the `Class` object (static methods), or the given object, and is released even on exceptions.
- Locks belong to **objects**: same object → exclusion; different objects or instance vs class → none. Intrinsic locks are **reentrant**.
- Use a **`private final` lock object**; never lock on reassigned fields, boxed values, `String` literals or new objects per call.
- Guard **every access** (reads too) and **every multi-field invariant** with the same lock; keep critical sections short, without I/O.
- HotSpot: lightweight locking → inflated `ObjectMonitor` under contention; elision and coarsening by the JIT. Virtual-thread pinning in `synchronized` was fixed in Java 24.
