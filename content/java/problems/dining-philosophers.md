## Problem statement

`n` philosophers sit around a table with one fork (a `ReentrantLock`) between each pair. To eat, philosopher `i` needs fork `i` (left) **and** fork `(i + 1) % n` (right). Each philosopher must eat `meals` times.

Implement `DiningPhilosophers.run(Strategy strategy, int n, int meals)`, which starts one thread per philosopher, waits for them (with a timeout), and returns a `Report`:
- whether everyone finished;
- total meals eaten;
- whether two neighbours ever ate at the same time (they must never);
- how many threads the JVM reports as **deadlocked**.

Implement four strategies:

| Strategy | Rule |
|---|---|
| `NAIVE` | take the left fork, then the right. **Reproduce the deadlock deterministically**: a test hook makes every philosopher hold their left fork before anyone reaches for the right one |
| `ORDERED` | always lock the **lower-numbered** fork first (a global lock order) |
| `TRY_LOCK` | hold the left fork and `tryLock` the right one with a short timeout; on failure, release the left one, back off randomly, and retry |
| `WAITER` | a `Semaphore(n - 1)` "waiter" lets at most `n - 1` philosophers reach for forks at once |

After a deadlock is detected, the run must **recover**: interrupt the stuck threads so the program can continue. Validation: `n ≥ 2` and `meals ≥ 0`.

## Starter code

```java title="DiningPhilosophers.java" starter="true"
import java.util.concurrent.locks.ReentrantLock;

public final class DiningPhilosophers {
    private DiningPhilosophers() { }

    enum Strategy { NAIVE, ORDERED, TRY_LOCK, WAITER }

    record Report(boolean finished, int mealsEaten, boolean neighboursAteTogether, int deadlockedThreads) { }

    static Report run(Strategy strategy, int n, int meals) throws InterruptedException {
        ReentrantLock[] forks = new ReentrantLock[n];
        for (int i = 0; i < n; i++) forks[i] = new ReentrantLock();
        // TODO: one thread per philosopher, eat 'meals' times with the chosen strategy,
        //       check neighbours never eat together, detect deadlock, recover, report
        return new Report(false, 0, false, 0);
    }

    public static void main(String[] args) throws InterruptedException {
        for (Strategy s : Strategy.values()) {
            System.out.println(s + " -> " + run(s, 5, 1_000));
        }
    }
}
```

## Hints

````hint title="Hint 1: forcing the deadlock"
Deadlock needs a cycle: each philosopher holds one fork and waits for the next. Make it deterministic for `NAIVE` with a `CyclicBarrier(n)`: each philosopher locks the left fork, then waits at the barrier, then reaches for the right fork. Once all are past the barrier, every right fork is already held, which closes the cycle.
- Lock the second fork with `lockInterruptibly()`, so the stuck threads can be interrupted later.
- `ManagementFactory.getThreadMXBean().findDeadlockedThreads()` reports cycles of threads blocked on monitors **or** `java.util.concurrent` locks.
````

````hint title="Hint 2: breaking one Coffman condition"
Deadlock requires mutual exclusion, hold-and-wait, no preemption, **and** a circular wait.
- **`ORDERED`** breaks the circular wait: everyone locks `min(left, right)` first, so philosopher `n - 1` reaches for fork 0 first, and no cycle can form.
- **`TRY_LOCK`** breaks hold-and-wait: give up the left fork when the right one isn't available.
- **`WAITER`** limits contention: with at most `n - 1` philosophers at the table, by the pigeonhole principle at least one of them can get both forks.
````

````hint title="Hint 3: checking safety"
Keep an `AtomicIntegerArray eating`. While philosopher `i` eats:
- set `eating[i] = 1`;
- check that `eating[(i + 1) % n]` and `eating[(i + n - 1) % n]` are 0, and record a violation otherwise;
- then reset `eating[i] = 0`.

Correct fork locking makes violations impossible. The check proves it under heavy contention.
````

## Test cases

| Strategy (5 philosophers, 1,000 meals each) | Expected |
|---|---|
| `NAIVE` with the hook | not finished; 5 deadlocked threads detected; threads recovered by interrupt |
| `ORDERED` | finished; 5,000 meals; neighbours never ate together; 0 deadlocked |
| `TRY_LOCK` | finished; 5,000 meals; never together; 0 deadlocked |
| `WAITER` | finished; 5,000 meals; never together; 0 deadlocked |
| `n = 2` (both forks shared by both philosophers) | all three fixes finish |
| `meals = 0` | finished immediately, 0 meals |
| `n = 1` | `IllegalArgumentException` |

## Expected output

```text title="Expected output" output="DiningPhilosophers.java"
NAIVE -> Report[finished=false, mealsEaten=0, neighboursAteTogether=false, deadlockedThreads=5]
ORDERED -> Report[finished=true, mealsEaten=5000, neighboursAteTogether=false, deadlockedThreads=0]
TRY_LOCK -> Report[finished=true, mealsEaten=5000, neighboursAteTogether=false, deadlockedThreads=0]
WAITER -> Report[finished=true, mealsEaten=5000, neighboursAteTogether=false, deadlockedThreads=0]
2 philosophers: ORDERED true, TRY_LOCK true, WAITER true
1 philosopher -> IllegalArgumentException: need at least 2 philosophers
```

## Reference solution

````solution title="Reference solution (DiningPhilosophers.java)"
```java title="DiningPhilosophers.java" file="DiningPhilosophers.java"
import java.lang.management.ManagementFactory;
import java.lang.management.ThreadMXBean;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.BrokenBarrierException;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Semaphore;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicIntegerArray;
import java.util.concurrent.locks.ReentrantLock;

public final class DiningPhilosophers {
    private DiningPhilosophers() { }

    enum Strategy { NAIVE, ORDERED, TRY_LOCK, WAITER }

    record Report(boolean finished, int mealsEaten, boolean neighboursAteTogether, int deadlockedThreads) { }

    static Report run(Strategy strategy, int n, int meals) throws InterruptedException {
        if (n < 2) throw new IllegalArgumentException("need at least 2 philosophers");
        if (meals < 0) throw new IllegalArgumentException("meals must not be negative");
        ReentrantLock[] forks = new ReentrantLock[n];
        for (int i = 0; i < n; i++) forks[i] = new ReentrantLock();
        AtomicIntegerArray eating = new AtomicIntegerArray(n);
        AtomicBoolean violation = new AtomicBoolean();
        AtomicInteger eaten = new AtomicInteger();
        Semaphore waiter = new Semaphore(n - 1);
        CyclicBarrier allHoldLeft = new CyclicBarrier(n);       // test hook for NAIVE: close the cycle on purpose

        List<Thread> philosophers = new ArrayList<>();
        for (int p = 0; p < n; p++) {
            int me = p;
            ReentrantLock left = forks[me];
            ReentrantLock right = forks[(me + 1) % n];
            Runnable eat = () -> {
                eating.set(me, 1);
                if (eating.get((me + 1) % n) == 1 || eating.get((me + n - 1) % n) == 1) violation.set(true);
                eaten.incrementAndGet();
                eating.set(me, 0);
            };
            Thread t = new Thread(() -> {
                try {
                    for (int meal = 0; meal < meals; meal++) {
                        switch (strategy) {
                            case NAIVE -> naive(left, right, eat, meal == 0 ? allHoldLeft : null);
                            case ORDERED -> ordered(me, (me + 1) % n, left, right, eat);
                            case TRY_LOCK -> tryLock(left, right, eat);
                            case WAITER -> waiter(waiter, left, right, eat);
                        }
                    }
                } catch (InterruptedException | BrokenBarrierException e) {
                    Thread.currentThread().interrupt();          // recovery path: give up
                }
            }, "philosopher-" + me);
            t.setDaemon(true);
            philosophers.add(t);
        }
        philosophers.forEach(Thread::start);

        // Watchdog: wait for completion, checking for a deadlock while the philosophers run
        ThreadMXBean mx = ManagementFactory.getThreadMXBean();
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(20);
        int deadlocked = 0;
        int confirmations = 0;
        while (philosophers.stream().anyMatch(Thread::isAlive) && System.nanoTime() < deadline) {
            long[] ids = mx.findDeadlockedThreads();
            // A timed tryLock can look like a cycle for a moment; a real deadlock is untimed and persists.
            boolean stuck = ids != null && Arrays.stream(mx.getThreadInfo(ids))
                    .allMatch(info -> info != null && info.getThreadState() == Thread.State.WAITING);
            confirmations = stuck ? confirmations + 1 : 0;
            if (confirmations >= 3) {
                deadlocked = ids.length;
                break;
            }
            Thread.sleep(10);
        }
        boolean finished = philosophers.stream().noneMatch(Thread::isAlive);
        if (!finished) {
            philosophers.forEach(Thread::interrupt);             // recover: lockInterruptibly() throws
            for (Thread t : philosophers) t.join(5_000);
        }
        return new Report(finished, eaten.get(), violation.get(), deadlocked);
    }

    // Left, then right. With the barrier, everyone holds a left fork before reaching right: circular wait.
    private static void naive(ReentrantLock left, ReentrantLock right, Runnable eat, CyclicBarrier hook)
            throws InterruptedException, BrokenBarrierException {
        left.lockInterruptibly();
        try {
            if (hook != null) hook.await();
            right.lockInterruptibly();
            try {
                eat.run();
            } finally {
                right.unlock();
            }
        } finally {
            left.unlock();
        }
    }

    // Global order: lower-numbered fork first. No cycle is possible.
    private static void ordered(int leftId, int rightId, ReentrantLock left, ReentrantLock right, Runnable eat)
            throws InterruptedException {
        ReentrantLock first = leftId < rightId ? left : right;
        ReentrantLock second = leftId < rightId ? right : left;
        first.lockInterruptibly();
        try {
            second.lockInterruptibly();
            try {
                eat.run();
            } finally {
                second.unlock();
            }
        } finally {
            first.unlock();
        }
    }

    // Don't hold and wait: if the right fork is busy, put the left one down and try again later.
    private static void tryLock(ReentrantLock left, ReentrantLock right, Runnable eat) throws InterruptedException {
        while (true) {
            left.lockInterruptibly();
            try {
                if (right.tryLock(1, TimeUnit.MILLISECONDS)) {
                    try {
                        eat.run();
                        return;
                    } finally {
                        right.unlock();
                    }
                }
            } finally {
                left.unlock();
            }
            Thread.sleep(0, ThreadLocalRandom.current().nextInt(1, 500_000));   // random back-off avoids livelock
        }
    }

    // At most n - 1 philosophers compete: at least one can always get both forks.
    private static void waiter(Semaphore seats, ReentrantLock left, ReentrantLock right, Runnable eat) throws InterruptedException {
        seats.acquire();
        try {
            left.lockInterruptibly();
            try {
                right.lockInterruptibly();
                try {
                    eat.run();
                } finally {
                    right.unlock();
                }
            } finally {
                left.unlock();
            }
        } finally {
            seats.release();
        }
    }

    public static void main(String[] args) throws InterruptedException {
        for (Strategy s : Strategy.values()) {
            System.out.println(s + " -> " + run(s, 5, 1_000));
        }
        System.out.println("2 philosophers: ORDERED " + run(Strategy.ORDERED, 2, 500).finished()
                + ", TRY_LOCK " + run(Strategy.TRY_LOCK, 2, 500).finished() + ", WAITER " + run(Strategy.WAITER, 2, 500).finished());
        try {
            run(Strategy.ORDERED, 1, 1);
        } catch (IllegalArgumentException e) {
            System.out.println("1 philosopher -> IllegalArgumentException: " + e.getMessage());
        }
    }
}
```
````

## Step-by-step explanation

````solution title="Step-by-step explanation"
1. **Reproduce first.** Deadlocks are timing-dependent, so tests that "usually pass" prove nothing. The `CyclicBarrier` hook makes every philosopher hold their left fork before anyone reaches for the right one, which guarantees the circular wait. The run reports `finished=false`, and the JVM's own detector (`ThreadMXBean.findDeadlockedThreads`, which understands `ReentrantLock` ownership too) confirms all 5 threads are deadlocked. Because the second fork is taken with `lockInterruptibly()`, interrupting the threads breaks the deadlock and the program recovers. With `lock()` or `synchronized`, they'd be stuck until the JVM exits (they're daemons here for safety).
2. **`ORDERED`: break the circular wait.** Number the resources and always acquire in ascending order. Philosophers 0…3 take their left fork first, but philosopher 4 takes fork 0 first (lower than fork 4). A cycle would need someone to hold a higher fork while waiting for a lower one, which the rule forbids. This is the standard production fix (for example, lock accounts in id order for transfers), and it costs nothing at run time.
3. **`TRY_LOCK`: break hold-and-wait.** `tryLock` with a timeout either gets the right fork or gives up. On failure the philosopher **releases** the left fork and backs off for a random sub-millisecond time. Random back-off prevents **livelock**: everyone picking up, giving up, and retrying in lockstep forever. It needs `ReentrantLock` (`synchronized` has no try-acquire), and it tolerates lock orders you can't control.
4. **`WAITER`: limit concurrency.** With only `n - 1` seats, at most `n - 1` philosophers hold forks, and some philosopher has both neighbours' forks reachable (pigeonhole), so progress is guaranteed. It's a coarse but simple fix. A semaphore guarding a scarce resource pool is a common real-world pattern (connection limits, bulkheads).
5. **Safety check.** The `eating` flags prove the forks really exclude neighbours: zero violations across 5,000 meals per strategy. All three fixes ate exactly `n × meals` meals, so nobody starved.
````

## Edge cases

- **`n = 2`**: both philosophers share the same two forks, the maximum contention case. All fixes still work.
- **`meals = 0`**: threads exit immediately, so the run finishes with 0 meals.
- **Fairness**: non-fair `ReentrantLock`s allow a philosopher to re-acquire forks repeatedly while a neighbour waits. That's fine for a fixed number of meals, but for endless loops consider fair locks or a fair semaphore against starvation.
- **Livelock with `tryLock`**: without randomised back-off, symmetric retries can repeat forever. Add jitter, or make retries asymmetric.
- **Detection timing and false positives**: `findDeadlockedThreads` reports a cycle only once every member is blocked in it, so the watchdog polls while the threads run. It also reports threads parked in a **timed** `tryLock` that happen to form a cycle for a millisecond. The watchdog therefore counts only cycles of untimed `WAITING` threads that persist over several polls. In production, take periodic thread dumps (`jcmd Thread.print`) or use JFR, both of which report deadlocks.
- **Lock ordering by `System.identityHashCode`** (when objects have no natural id) needs a tie-breaker lock for equal hashes. That's an Effective-Java-era pitfall.

## JUnit tests

```java title="DiningPhilosophersTest.java" file="DiningPhilosophersTest.java" test="DiningPhilosophers.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

class DiningPhilosophersTest {
    @ParameterizedTest
    @EnumSource(value = DiningPhilosophers.Strategy.class, names = { "ORDERED", "TRY_LOCK", "WAITER" })
    void fixesFinishWithoutViolations(DiningPhilosophers.Strategy strategy) throws InterruptedException {
        for (int n : new int[] { 2, 5, 9 }) {
            DiningPhilosophers.Report r = DiningPhilosophers.run(strategy, n, 300);
            assertTrue(r.finished(), strategy + " n=" + n);
            assertEquals(n * 300, r.mealsEaten());
            assertFalse(r.neighboursAteTogether());
            assertEquals(0, r.deadlockedThreads());
        }
    }

    @Test
    void naiveDeadlocksAndIsDetectedAndRecovered() throws InterruptedException {
        DiningPhilosophers.Report r = DiningPhilosophers.run(DiningPhilosophers.Strategy.NAIVE, 5, 10);
        assertFalse(r.finished());
        assertEquals(5, r.deadlockedThreads());
        assertEquals(0, r.mealsEaten());
        // recovery: a later run works normally, so no locks or threads were left behind
        assertTrue(DiningPhilosophers.run(DiningPhilosophers.Strategy.ORDERED, 5, 10).finished());
    }

    @Test
    void zeroMealsAndValidation() throws InterruptedException {
        DiningPhilosophers.Report r = DiningPhilosophers.run(DiningPhilosophers.Strategy.WAITER, 4, 0);
        assertTrue(r.finished());
        assertEquals(0, r.mealsEaten());
        assertThrows(IllegalArgumentException.class, () -> DiningPhilosophers.run(DiningPhilosophers.Strategy.ORDERED, 1, 1));
        assertThrows(IllegalArgumentException.class, () -> DiningPhilosophers.run(DiningPhilosophers.Strategy.ORDERED, 3, -1));
    }
}
```
