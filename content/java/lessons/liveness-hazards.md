## Concept explanation

*Safety* means "nothing bad happens" (no races, no corrupted state). **Liveness** means "something good eventually happens": threads make progress. Locks that fix safety problems create liveness problems.

### Deadlock

Threads wait for each other **forever**. The classic case:

```text
  T1: lock(A) ... lock(B)         T2: lock(B) ... lock(A)
  T1 holds A, waits for B   <--->  T2 holds B, waits for A
```

A deadlock requires all four **Coffman conditions** at once. Break any one and it can't happen:

| Condition | Meaning | How to break it |
|---|---|---|
| Mutual exclusion | resources can't be shared | lock-free or immutable designs, read locks |
| Hold and wait | a thread holds one lock while waiting for another | acquire everything at once, or never call out while holding a lock |
| No preemption | a lock can't be taken away | **`tryLock` with a timeout**, then release and retry |
| **Circular wait** | a cycle in the waits-for graph | **a global lock order** (always lock the lower id first) |

**Lock ordering** is the standard fix: if every thread acquires locks in the same global order (by account id, or `System.identityHashCode` with a tie-breaker lock), no cycle can form.

Deadlocks also hide in:
- **calling alien code while holding a lock** (a listener or overridable method that takes another lock);
- **class initialisation** (two static initialisers that need each other on different threads);
- **thread pools**: a task that submits a subtask to the *same bounded pool* and waits for it, when no free thread is left to run the subtask. This is a **thread-starvation deadlock**.

### Livelock

Threads aren't blocked; they keep **responding to each other** without progress. Picture two people stepping aside in a corridor, both to the same side, forever, or two transactions that detect a conflict, both roll back, and both retry in lockstep. The fix is to break the symmetry: **randomised back-off** (exponential with jitter), or a priority rule.

### Starvation

A thread is ready to run but **never gets the resource**: unfair locks where newcomers always barge in, a reader stream that keeps a writer out of a `ReadWriteLock`, low priorities, or long-running tasks hogging a small pool. Fixes: fair locks or queues, bounded work per task, separate pools for slow work.

### Contention

Not a liveness *failure*, but its everyday cousin: many threads competing for one lock **serialise**, so adding threads adds waiting, not throughput. Symptoms: high `BLOCKED` or `WAITING (parking)` counts in thread dumps, and low CPU despite load. Fixes:
- **shorten critical sections**: compute outside the lock, and never do I/O inside;
- **split locks** (one per account, not one global lock);
- **stripe** state (`LongAdder`, `ConcurrentHashMap` bins);
- go **lock-free** or **immutable**;
- **avoid sharing** altogether (thread confinement, partitioning work by key).

## Internal working

- **The JVM detects monitor and `j.u.c` lock deadlocks**: `ThreadMXBean.findDeadlockedThreads()` follows "waiting for lock → owner → waiting for lock…" chains through intrinsic monitors and `AbstractOwnableSynchronizer`s (`ReentrantLock`, `ReentrantReadWriteLock`). `jstack` and `jcmd Thread.print` print `Found one Java-level deadlock` with both stacks. It **can't** see deadlocks built on `wait`/`notify` conditions, semaphores, latches or futures, because those have no owner. They appear as threads `WAITING` forever.
- **The JVM never resolves a deadlock.** The threads stay stuck until the process restarts. Prevention is the only cure; detection helps diagnose.
- **Lock-ordering by identity**: when objects have no natural id, order by `System.identityHashCode`. Hash ties are possible, so the textbook solution acquires a global "tie lock" first in that rare case.
- **`tryLock` back-off** turns a potential deadlock into a retry: the thread releases what it holds, sleeps a random small time, and tries again. Randomness prevents livelock.
- **Contention metrics**: `ThreadMXBean.getThreadInfo(id).getBlockedCount()/getBlockedTime()` (enable timing with `setThreadContentionMonitoringEnabled(true)`), JFR's `JavaMonitorEnter`/`ThreadPark` events, and `jcmd Thread.print` summaries show where threads wait. Lock *ownership time* matters more than lock *count*.

## Visual representation

```text title="Waits-for graph: cycle vs ordered locking"
  deadlock (circular wait)                     global lock order: always lower id first
     T1 --holds--> A                              T1: lock(A) lock(B)      T2: lock(A) lock(B)
     T1 --waits--> B --held by--> T2              T2 waits for A (holds nothing)
     T2 --waits--> A --held by--> T1              T1 finishes, releases; T2 proceeds
           cycle: T1 -> T2 -> T1                        no cycle possible

  livelock (corridor):   step 1: both move left    step 2: both move right   ... forever (symmetry)
     fix: random back-off or a rule ("the lower id yields") breaks the symmetry

  thread-starvation deadlock (pool of 1 thread):
     task A runs on the only thread -> submits subtask B to the same pool -> waits for B
     B sits in the queue: there's no free thread to run it -> A waits forever
```

## Java code example

```java title="LivenessDemo.java" file="LivenessDemo.java"
import java.lang.management.ManagementFactory;
import java.lang.management.ThreadInfo;
import java.lang.management.ThreadMXBean;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.LongAdder;
import java.util.concurrent.locks.ReentrantLock;

public class LivenessDemo {
    record Account(int id, ReentrantLock lock) {
        Account(int id) {
            this(id, new ReentrantLock());
        }
    }

    static Thread daemon(String name, Runnable body) {
        Thread t = new Thread(body, name);
        t.setDaemon(true);
        t.start();
        return t;
    }

    static void await(CyclicBarrier b) {
        try {
            b.await();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    // Naive: lock "from" then "to". Opposite transfers acquire in opposite orders.
    static void naiveTransfer(Account from, Account to, CyclicBarrier bothHoldFirstLock) {
        from.lock().lock();
        try {
            await(bothHoldFirstLock);                    // test hook: guarantee the bad interleaving
            to.lock().lock();
            to.lock().unlock();
        } finally {
            from.lock().unlock();
        }
    }

    // Fix 1: a global order (lower id first) makes a cycle impossible
    static void orderedTransfer(Account from, Account to) {
        Account first = from.id() < to.id() ? from : to;
        Account second = first == from ? to : from;
        first.lock().lock();
        try {
            second.lock().lock();
            second.lock().unlock();
        } finally {
            first.lock().unlock();
        }
    }

    // Fix 2: tryLock with timeout, release everything, back off randomly, retry
    static int tryLockTransfer(Account from, Account to) throws InterruptedException {
        for (int attempt = 1; ; attempt++) {
            if (from.lock().tryLock(10, TimeUnit.MILLISECONDS)) {
                try {
                    if (to.lock().tryLock(10, TimeUnit.MILLISECONDS)) {
                        to.lock().unlock();
                        return attempt;
                    }
                } finally {
                    from.lock().unlock();
                }
            }
            Thread.sleep(ThreadLocalRandom.current().nextInt(1, 10));   // random back-off breaks symmetry
        }
    }

    static int repeatTryLockTransfers(Account from, Account to, int times) {
        int attempts = 0;
        try {
            for (int i = 0; i < times; i++) {
                attempts += tryLockTransfer(from, to);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return attempts;
    }

    public static void main(String[] args) throws Exception {
        ThreadMXBean threads = ManagementFactory.getThreadMXBean();
        Account a = new Account(1);
        Account b = new Account(2);

        // 1. A guaranteed deadlock, detected by the JVM
        CyclicBarrier hook = new CyclicBarrier(2);
        daemon("transfer A->B", () -> naiveTransfer(a, b, hook));
        daemon("transfer B->A", () -> naiveTransfer(b, a, hook));
        long[] stuck = null;
        while (stuck == null) {
            Thread.sleep(20);
            stuck = threads.findDeadlockedThreads();
        }
        TreeSet<String> cycle = new TreeSet<>();
        for (ThreadInfo info : threads.getThreadInfo(stuck)) {
            cycle.add("'" + info.getThreadName() + "' waits for a lock owned by '" + info.getLockOwnerName() + "'");
        }
        System.out.println("deadlock detected: " + cycle);

        // 2. Ordered locking: the same opposite transfers always complete
        Account c = new Account(3);
        Account d = new Account(4);
        Thread t1 = new Thread(() -> { for (int i = 0; i < 100_000; i++) orderedTransfer(c, d); });
        Thread t2 = new Thread(() -> { for (int i = 0; i < 100_000; i++) orderedTransfer(d, c); });
        t1.start();
        t2.start();
        t1.join(10_000);
        t2.join(10_000);
        System.out.println("ordered locking: 200,000 opposite transfers completed: " + (!t1.isAlive() && !t2.isAlive()));

        // 3. tryLock with back-off also completes
        Account e = new Account(5);
        Account f = new Account(6);
        int[] attempts = new int[2];
        Thread t3 = new Thread(() -> attempts[0] = repeatTryLockTransfers(e, f, 2_000));
        Thread t4 = new Thread(() -> attempts[1] = repeatTryLockTransfers(f, e, 2_000));
        t3.start();
        t4.start();
        t3.join();
        t4.join();
        System.out.println("tryLock + back-off: 4,000 transfers completed, attempts >= transfers: " + (attempts[0] + attempts[1] >= 4_000));

        // 4. Livelock, simulated step by step: two polite people in a corridor
        int left = 0;
        int right = 0;
        int steps = 0;
        while (left == right && steps < 10) {           // same side: blocked, both step aside the same way
            left = 1 - left;
            right = 1 - right;
            steps++;
        }
        System.out.println("symmetric politeness: still blocked after " + steps + " steps: " + (left == right));
        left = 0;
        right = 0;
        steps = 0;
        while (left == right && steps < 10) {           // rule: only the lower id steps aside
            left = 1 - left;
            steps++;
        }
        System.out.println("asymmetric rule: passed after " + steps + " step");

        // 5. Thread-starvation deadlock: a task waiting for a subtask in its own 1-thread pool
        ExecutorService single = Executors.newSingleThreadExecutor();
        Future<String> outer = single.submit(() -> {
            Future<String> inner = single.submit(() -> "inner result");
            return inner.get();                         // the only thread waits for a task that can't run
        });
        try {
            outer.get(500, TimeUnit.MILLISECONDS);
        } catch (TimeoutException ex) {
            System.out.println("task waiting on its own pool: no progress after 500 ms (thread-starvation deadlock)");
        }
        single.shutdownNow();

        // 6. Contention: threads serialised on one lock vs a striped LongAdder
        Object hot = new Object();
        long[] counter = new long[1];
        CountDownLatch finished = new CountDownLatch(4);
        CountDownLatch mayExit = new CountDownLatch(1);
        List<Thread> workers = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            workers.add(new Thread(() -> {
                for (int j = 0; j < 200_000; j++) {
                    synchronized (hot) {
                        counter[0]++;
                    }
                }
                finished.countDown();
                try {
                    mayExit.await();                    // stay alive so their statistics can be read
                } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                }
            }));
        }
        workers.forEach(Thread::start);
        finished.await();
        long blocked = 0;
        for (Thread w : workers) {
            blocked += threads.getThreadInfo(w.getId()).getBlockedCount();   // times it waited to enter a monitor
        }
        mayExit.countDown();
        for (Thread w : workers) {
            w.join();
        }
        LongAdder adder = new LongAdder();
        List<Thread> adders = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            adders.add(new Thread(() -> { for (int j = 0; j < 200_000; j++) adder.increment(); }));
        }
        adders.forEach(Thread::start);
        for (Thread w : adders) {
            w.join();
        }
        System.out.println("one hot lock: count " + counter[0] + ", threads had to block on it: " + (blocked > 0));
        System.out.println("LongAdder (striped, no lock): count " + adder.sum());
    }
}
```

## Output

```text title="Output" output="LivenessDemo.java"
deadlock detected: ['transfer A->B' waits for a lock owned by 'transfer B->A', 'transfer B->A' waits for a lock owned by 'transfer A->B']
ordered locking: 200,000 opposite transfers completed: true
tryLock + back-off: 4,000 transfers completed, attempts >= transfers: true
symmetric politeness: still blocked after 10 steps: true
asymmetric rule: passed after 1 step
task waiting on its own pool: no progress after 500 ms (thread-starvation deadlock)
one hot lock: count 800000, threads had to block on it: true
LongAdder (striped, no lock): count 800000
```

- With both threads holding their first lock (the barrier guaranteed it), each waited for the other's forever. The JVM's detector named the cycle. They're daemon threads, so the demo can continue; in a real server, those threads (and every request needing those accounts) would be stuck until a restart.
- Locking the lower id first let 200,000 opposite transfers finish, because a cycle could never form. `tryLock` with random back-off finished too, at the cost of some retries.
- Symmetric "politeness" never passed; one asymmetric rule passed in one step. That's the essence of livelock and its fix.
- A task that waited for another task in its own single-thread pool made no progress: a deadlock with no locks at all.
- Four threads hammering one `synchronized` counter had to **block** on it repeatedly (the JVM counts every contended monitor entry). The `LongAdder` reached the same count with no lock at all by spreading increments over per-thread cells.

## Real-world application

- **Money transfers, inventory moves, seat swaps**: anything that locks two entities at once. Order the locks by primary key, both in code and in the database (`SELECT … FOR UPDATE ORDER BY id`). Databases detect deadlocks and abort one transaction, which application code must retry.
- **Thread-pool deadlocks**: a `CompletableFuture` chain that blocks (`join()`) inside a task of the same bounded executor, or nested parallel streams on a saturated common pool, give the same starvation deadlock as the demo. Use separate pools for dependent stages, or don't block inside pool tasks.
- **Retry storms**: clients that retry on conflict or timeout at fixed intervals livelock or overload a service. Production retry policies use exponential back-off with **jitter** (Resilience4j, AWS SDKs).
- **Hot locks** discovered with JFR or thread dumps are fixed by narrowing the critical section, sharding (lock per key or partition), or switching to `ConcurrentHashMap`, `LongAdder` or immutable snapshots.

## Common mistakes

- **Acquiring multiple locks in inconsistent orders**, often hidden across method calls (`a.transfer(b)` vs `b.transfer(a)`).
- **Calling unknown code while holding a lock**: listeners, callbacks, overridable methods, logging appenders that lock.
- **Blocking on futures inside tasks of the same bounded pool.**
- **"Fixing" deadlocks by adding timeouts everywhere** without understanding the cycle. Find the order violation.
- **Retrying in lockstep** (fixed delays, no jitter), which causes livelock and thundering herds.
- **Ignoring contention**: adding threads to a lock-bound workload just adds waiting.
- **Holding locks during I/O**, which multiplies lock hold time by network latency.

## Interview questions

**Q1. What are the conditions for deadlock, and how do you prevent it?**

````reveal title="Answer"
All four Coffman conditions must hold: mutual exclusion, hold-and-wait, no preemption, and circular wait. Prevent it by breaking one:
- impose a **global lock order**, so no circular wait is possible;
- use `tryLock` **with timeouts** and back off (preemption by giving up);
- acquire all needed locks at once, or avoid holding a lock while acquiring another (no hold-and-wait);
- reduce sharing (immutability, lock-free structures).

Also avoid calling alien code while holding locks.
````

**Q2. How do you detect a deadlock in a running Java application?**

````reveal title="Answer"
Take a thread dump (`jstack <pid>`, `jcmd <pid> Thread.print`, or `kill -3`). The JVM reports "Found one Java-level deadlock" with each thread, the lock it waits for and its owner. Programmatically, `ThreadMXBean.findDeadlockedThreads()` returns the ids for monitors and `ReentrantLock`-style locks. Deadlocks involving `wait`/`notify`, latches, semaphores or futures aren't detected automatically: they show as threads `WAITING` forever, which you find by reading several dumps.
````

**Q3. What is livelock? How is it different from deadlock?**

````reveal title="Answer"
In a livelock, threads aren't blocked: they keep running and changing state in response to each other but make no progress, like two people stepping aside in the same direction repeatedly, or transactions that keep aborting and retrying in lockstep. In a deadlock, threads are blocked and do nothing. Livelocks are fixed by breaking symmetry: randomised exponential back-off, or a priority rule.
````

**Q4. What is starvation?**

````reveal title="Answer"
A thread that's able to run never gets the resource it needs, because others keep getting it first. Examples:
- unfair locks where newcomers barge;
- writers starved by continuous readers on a `ReadWriteLock`;
- low-priority threads;
- slow tasks monopolising a small pool.

Fixes: fair locks or queues, bounded task durations, separate pools for different workloads.
````

**Q5. What is a thread-starvation deadlock in a thread pool?**

````reveal title="Answer"
A task running in a bounded pool submits another task to the same pool and blocks waiting for its result. If all pool threads are occupied by such waiting tasks, the subtasks sit in the queue with no thread to run them, and everything waits forever without any lock cycle. Avoid it by not blocking inside pool tasks (compose asynchronously with `thenCompose`), by using separate executors for dependent stages, or with fork/join, whose `join` helps execute pending subtasks.
````

## Hands-on exercise

Implement deadlock-free **bank transfers**:
- Five `Account`s (id, balance, `ReentrantLock`), each starting with 1,000.
- `transfer(from, to, amount)` locks both accounts **in id order**, checks the balance, and moves the money (skipping transfers that would overdraw).
- Run 4 threads, each doing 20,000 transfers between random pairs of distinct accounts, with a fixed seed per thread so the run is repeatable.
- Verify that all threads finished within a timeout, that the total money is still 5,000, and that no balance is negative.

````hint title="Hint"
`Account first = from.id < to.id ? from : to; Account second = (first == from) ? to : from;` then `first.lock.lock(); try { second.lock.lock(); try { … } finally { second.lock.unlock(); } } finally { first.lock.unlock(); }`. Use `new Random(seed)` per thread, and pick `to` until it differs from `from`.
````

````solution title="Solution"
```java title="SafeTransfers.java" file="SafeTransfers.java"
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.ReentrantLock;

public class SafeTransfers {
    static final class Account {
        final int id;
        final ReentrantLock lock = new ReentrantLock();
        long balance;                                        // guarded by lock

        Account(int id, long balance) {
            this.id = id;
            this.balance = balance;
        }
    }

    static boolean transfer(Account from, Account to, long amount) {
        Account first = from.id < to.id ? from : to;          // global order: lower id first
        Account second = first == from ? to : from;
        first.lock.lock();
        try {
            second.lock.lock();
            try {
                if (from.balance < amount) {
                    return false;                            // would overdraw: skip
                }
                from.balance -= amount;
                to.balance += amount;
                return true;
            } finally {
                second.lock.unlock();
            }
        } finally {
            first.lock.unlock();
        }
    }

    public static void main(String[] args) throws InterruptedException {
        List<Account> accounts = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            accounts.add(new Account(i, 1_000));
        }
        AtomicInteger done = new AtomicInteger();
        List<Thread> workers = new ArrayList<>();
        for (int w = 0; w < 4; w++) {
            long seed = 42 + w;
            Thread t = new Thread(() -> {
                Random random = new Random(seed);
                for (int i = 0; i < 20_000; i++) {
                    Account from = accounts.get(random.nextInt(5));
                    Account to;
                    do {
                        to = accounts.get(random.nextInt(5));
                    } while (to == from);
                    if (transfer(from, to, 1 + random.nextInt(100))) {
                        done.incrementAndGet();
                    }
                }
            });
            workers.add(t);
            t.start();
        }
        boolean allFinished = true;
        for (Thread t : workers) {
            t.join(10_000);
            allFinished &= !t.isAlive();
        }
        long total = 0;
        boolean noneNegative = true;
        for (Account a : accounts) {
            a.lock.lock();
            try {
                total += a.balance;
                noneNegative &= a.balance >= 0;
            } finally {
                a.lock.unlock();
            }
        }
        System.out.println("all 4 threads finished (no deadlock): " + allFinished);
        System.out.println("successful transfers > 0: " + (done.get() > 0) + ", total money: " + total + ", no negative balance: " + noneNegative);
    }
}
```

```text title="Output" output="SafeTransfers.java"
all 4 threads finished (no deadlock): true
successful transfers > 0: true, total money: 5000, no negative balance: true
```

Opposite transfers (2→4 and 4→2) happen constantly here, but both lock account 2 first, so a cycle can't form. The balance check and the move happen under both locks, so money is conserved and no account goes negative, whatever the interleaving.
````

## Knowledge check

```quiz
? Which change prevents deadlock between two transfers locking accounts in opposite orders?
+ Always acquire the locks in a global order, such as by account id
- Make the lock fair
- Use synchronized instead of ReentrantLock
> Ordering removes the circular-wait condition.

? Two threads repeatedly back off and retry in lockstep, never making progress, while using CPU. What is this?
+ Livelock
- Deadlock
- A race condition
> Break the symmetry with randomised back-off.

? Which deadlocks does ThreadMXBean.findDeadlockedThreads() detect?
+ Cycles involving monitors and ownable synchronizers like ReentrantLock
- Any thread waiting forever, including on CountDownLatch
- Deadlocks between different JVMs
> Latches, semaphores, futures and wait/notify conditions have no owner to follow.

? A task in a single-thread executor submits a subtask to the same executor and calls get(). What happens?
+ It waits forever: the subtask can never run
- The subtask runs on the calling thread
- The executor creates a second thread
> This is a thread-starvation deadlock.

? What does tryLock(timeout) with random back-off break?
+ The no-preemption condition (threads give up what they hold) and lockstep retries
- Mutual exclusion
- Visibility guarantees
> It turns a potential deadlock into a retry.
```

## Key takeaways

- **Deadlock** needs mutual exclusion, hold-and-wait, no preemption and **circular wait**. Prevent it with a **global lock order**, **`tryLock` with timeouts and random back-off**, and never calling alien code under a lock.
- The JVM **detects but never resolves** monitor and `ReentrantLock` deadlocks (thread dumps, `findDeadlockedThreads`). Latch, future and condition deadlocks show as threads `WAITING` forever.
- **Livelock** (busy, no progress): break the symmetry with jittered back-off. **Starvation** (never served): use fairness, bounded tasks and separate pools.
- **Thread-starvation deadlocks** happen in bounded pools when tasks block on other tasks of the same pool.
- **Contention** serialises threads: shorten critical sections, split or stripe locks, use `LongAdder`, `ConcurrentHashMap` or immutable snapshots.
