## Problem statement

`n` threads named `T1…Tn` must print the numbers `1..max` **strictly round-robin**: `T1:1, T2:2, T3:3, T1:4, …`. Every thread must **terminate cleanly** when the numbers run out, including threads that never get a number (when `n > max`). Implement it in `RoundRobinPrinter` in two ways:

1. **`static List<String> withConditions(int n, int max)`**: one `ReentrantLock` with **one `Condition` per thread**, so each turn wakes exactly the next thread.
2. **`static List<String> withSemaphores(int n, int max)`**: a ring of `n` semaphores, where each thread passes the baton to the next.

Both return the printed lines in order, after all threads have finished. Validation: `n ≥ 1` and `max ≥ 0`, otherwise `IllegalArgumentException`.

Then, to see why per-thread conditions matter, compare them with **`withSignalAll(int n, int max)`**: a single condition with `signalAll()`, which also returns the number of **wasted wake-ups** (threads woken when it wasn't their turn).

## Starter code

```java title="RoundRobinPrinter.java" starter="true"
import java.util.ArrayList;
import java.util.List;

public final class RoundRobinPrinter {
    private RoundRobinPrinter() { }

    record SignalAllResult(List<String> lines, long wastedWakeUps) { }

    static List<String> withConditions(int n, int max) throws InterruptedException {
        return new ArrayList<>();                     // TODO
    }

    static List<String> withSemaphores(int n, int max) throws InterruptedException {
        return new ArrayList<>();                     // TODO
    }

    static SignalAllResult withSignalAll(int n, int max) throws InterruptedException {
        return new SignalAllResult(new ArrayList<>(), 0);   // TODO
    }

    static boolean isRoundRobin(List<String> lines, int n, int max) {
        if (lines.size() != max) return false;
        for (int k = 1; k <= max; k++) {
            if (!lines.get(k - 1).equals("T" + ((k - 1) % n + 1) + ":" + k)) return false;
        }
        return true;
    }

    public static void main(String[] args) throws InterruptedException {
        System.out.println("conditions, 3 threads, 1..10: " + withConditions(3, 10));
        System.out.println("semaphores, 3 threads, 1..10: " + withSemaphores(3, 10));
    }
}
```

## Hints

````hint title="Hint 1: whose turn is it?"
Keep one shared counter `next` (the number to print next). Thread `i` (0-based) owns the numbers where `(next - 1) % n == i`. Everything else follows from that rule: the waiting condition, the hand-off and the exit check.
````

````hint title="Hint 2: wake exactly one thread, and everyone at the end"
- Give each thread its own `Condition turn[i] = lock.newCondition()`.
- After printing, increment `next` and call `turn[(i + 1) % n].signal()`: only the next thread wakes.
- When `next > max`, **every** waiting thread must learn that the work is done. Signal all the conditions, so each thread re-checks its loop condition `next <= max && notMyTurn` and exits.
````

````hint title="Hint 3: the semaphore ring"
`sems[0]` starts with one permit, all the others with zero. Thread `i` loops over `k = i + 1, i + 1 + n, …` while `k <= max`: `sems[i].acquire()`, print `k`, `sems[(i + 1) % n].release()`. A thread whose first number exceeds `max` never enters the loop and exits immediately. Each thread knows its own numbers, so there's nothing to coordinate at the end.
````

## Test cases

| Call | Expected |
|---|---|
| `withConditions(3, 10)` / `withSemaphores(3, 10)` | `[T1:1, T2:2, T3:3, T1:4, T2:5, T3:6, T1:7, T2:8, T3:9, T1:10]` |
| `(1, 4)` | `[T1:1, T1:2, T1:3, T1:4]` |
| `(5, 3)` (more threads than numbers) | `[T1:1, T2:2, T3:3]`; T4 and T5 terminate |
| `(4, 0)` | `[]`; all threads terminate |
| `(7, 70,000)` | strictly round-robin |
| `n = 0` or `max = -1` | `IllegalArgumentException` |
| `withSignalAll(4, 40,000)` | correct order; the wasted wake-up count varies from run to run (often about one per number) |

## Expected output

```text title="Expected output" output="RoundRobinPrinter.java"
conditions, 3 threads, 1..10: [T1:1, T2:2, T3:3, T1:4, T2:5, T3:6, T1:7, T2:8, T3:9, T1:10]
semaphores, 3 threads, 1..10: [T1:1, T2:2, T3:3, T1:4, T2:5, T3:6, T1:7, T2:8, T3:9, T1:10]
5 threads, 1..3: [T1:1, T2:2, T3:3] [T1:1, T2:2, T3:3]; 4 threads, nothing to print: [] []
7 threads, 1..70,000 strictly round-robin: conditions true, semaphores true
single condition + signalAll, 4 threads, 1..40,000: correct true (its wasted wake-up count depends on scheduling, so it isn't printed)
0 threads -> IllegalArgumentException: need at least one thread
```

## Reference solution

````solution title="Reference solution (RoundRobinPrinter.java)"
```java title="RoundRobinPrinter.java" file="RoundRobinPrinter.java"
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Semaphore;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;

public final class RoundRobinPrinter {
    private RoundRobinPrinter() { }

    record SignalAllResult(List<String> lines, long wastedWakeUps) { }

    private static void validate(int n, int max) {
        if (n < 1) throw new IllegalArgumentException("need at least one thread");
        if (max < 0) throw new IllegalArgumentException("max must not be negative");
    }

    private static void startAndJoin(List<Thread> threads) throws InterruptedException {
        threads.forEach(Thread::start);
        for (Thread t : threads) t.join();                       // join publishes the threads' writes to us
    }

    // ---------- 1. one lock, one condition per thread ----------
    static List<String> withConditions(int n, int max) throws InterruptedException {
        validate(n, max);
        ReentrantLock lock = new ReentrantLock();
        Condition[] turn = new Condition[n];
        for (int i = 0; i < n; i++) turn[i] = lock.newCondition();
        int[] next = { 1 };                                      // guarded by lock
        List<String> lines = new ArrayList<>();                  // guarded by lock
        List<Thread> threads = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            int me = i;
            threads.add(new Thread(() -> {
                lock.lock();
                try {
                    while (true) {
                        while (next[0] <= max && (next[0] - 1) % n != me) {
                            turn[me].awaitUninterruptibly();
                        }
                        if (next[0] > max) {
                            for (Condition c : turn) c.signal(); // wake everyone so they can exit too
                            return;
                        }
                        lines.add("T" + (me + 1) + ":" + next[0]);
                        next[0]++;
                        turn[(me + 1) % n].signal();             // wake exactly the next thread
                    }
                } finally {
                    lock.unlock();
                }
            }, "T" + (i + 1)));
        }
        startAndJoin(threads);
        return lines;
    }

    // ---------- 2. a ring of semaphores ----------
    static List<String> withSemaphores(int n, int max) throws InterruptedException {
        validate(n, max);
        Semaphore[] sems = new Semaphore[n];
        for (int i = 0; i < n; i++) sems[i] = new Semaphore(i == 0 ? 1 : 0);
        List<String> lines = new ArrayList<>();                  // handed along by release/acquire
        List<Thread> threads = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            int me = i;
            threads.add(new Thread(() -> {
                try {
                    for (int k = me + 1; k <= max; k += n) {     // this thread's own numbers
                        sems[me].acquire();
                        lines.add("T" + (me + 1) + ":" + k);
                        sems[(me + 1) % n].release();            // pass the baton
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }, "T" + (i + 1)));
        }
        startAndJoin(threads);
        return lines;
    }

    // ---------- 3. for comparison: one condition, signalAll ----------
    static SignalAllResult withSignalAll(int n, int max) throws InterruptedException {
        validate(n, max);
        ReentrantLock lock = new ReentrantLock();
        Condition changed = lock.newCondition();
        int[] next = { 1 };
        long[] wasted = { 0 };
        List<String> lines = new ArrayList<>();
        List<Thread> threads = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            int me = i;
            threads.add(new Thread(() -> {
                lock.lock();
                try {
                    while (true) {
                        while (next[0] <= max && (next[0] - 1) % n != me) {
                            changed.awaitUninterruptibly();
                            if (next[0] <= max && (next[0] - 1) % n != me) wasted[0]++;   // woken for nothing
                        }
                        if (next[0] > max) {
                            changed.signalAll();
                            return;
                        }
                        lines.add("T" + (me + 1) + ":" + next[0]);
                        next[0]++;
                        changed.signalAll();                     // wakes ALL waiters; most go back to sleep
                    }
                } finally {
                    lock.unlock();
                }
            }, "T" + (i + 1)));
        }
        startAndJoin(threads);
        return new SignalAllResult(lines, wasted[0]);
    }

    static boolean isRoundRobin(List<String> lines, int n, int max) {
        if (lines.size() != max) return false;
        for (int k = 1; k <= max; k++) {
            if (!lines.get(k - 1).equals("T" + ((k - 1) % n + 1) + ":" + k)) return false;
        }
        return true;
    }

    public static void main(String[] args) throws InterruptedException {
        System.out.println("conditions, 3 threads, 1..10: " + withConditions(3, 10));
        System.out.println("semaphores, 3 threads, 1..10: " + withSemaphores(3, 10));
        System.out.println("5 threads, 1..3: " + withConditions(5, 3) + " " + withSemaphores(5, 3)
                + "; 4 threads, nothing to print: " + withConditions(4, 0) + " " + withSemaphores(4, 0));
        System.out.println("7 threads, 1..70,000 strictly round-robin: conditions " + isRoundRobin(withConditions(7, 70_000), 7, 70_000)
                + ", semaphores " + isRoundRobin(withSemaphores(7, 70_000), 7, 70_000));
        SignalAllResult naive = withSignalAll(4, 40_000);
        System.out.println("single condition + signalAll, 4 threads, 1..40,000: correct " + isRoundRobin(naive.lines(), 4, 40_000)
                + " (its wasted wake-up count depends on scheduling, so it isn't printed)");
        try {
            withConditions(0, 5);
        } catch (IllegalArgumentException e) {
            System.out.println("0 threads -> IllegalArgumentException: " + e.getMessage());
        }
    }
}
```
````

## Step-by-step explanation

````solution title="Step-by-step explanation"
**Lock with per-thread conditions**
1. **One rule decides everything**: `(next - 1) % n == me`. The shared `next` lives under one lock, so checking and updating it is atomic, and every thread sees the latest value.
2. **Targeted wake-ups**: each thread waits on its own `Condition`. After printing, it signals only `turn[(me + 1) % n]`: one wake-up per number, and it's always the right thread.
3. **Clean termination**: when `next > max`, the thread that discovers it signals **every** condition. Each sleeping thread wakes, sees `next > max` in its loop condition, and exits, also signalling, which is harmless. Without this, threads waiting for a turn that will never come would block `join` forever. The `5 threads, 1..3` and `4 threads, nothing to print` cases check exactly that.
4. **Why `awaitUninterruptibly`**: this exercise has no cancellation path. In production, use `await()`, handle `InterruptedException` by setting a shutdown flag, and signal everyone.

**Semaphore ring**
1. **Permits are the baton**: only one semaphore holds a permit at any moment, so exactly one thread can print. Releasing the *next* thread's semaphore passes the turn along the ring.
2. **Each thread knows its own numbers** (`me + 1`, `me + 1 + n`, …), so there's no shared counter, and termination is just the end of a `for` loop.
3. **Visibility**: a `release()` happens-before the `acquire()` that obtains the permit, so the plain `ArrayList` is handed safely around the ring, and `join` publishes the final list to the caller.

**Why not `signalAll`?** With a single condition, every number can wake all `n - 1` waiting threads, and all but one of them go straight back to sleep. How many are actually waiting at each signal depends on scheduling. Measured runs of `withSignalAll(4, 40_000)` ranged from almost no wasted wake-ups to about 40,000 (one per number), which is why the demo doesn't print the count. In the bad case, that's context switches and lock contention growing with `n`. Per-thread conditions (or semaphores) guarantee exactly one wake-up per hand-off, whatever the scheduling.
````

## Edge cases

- **`n > max`**: threads `T(max+1)…Tn` never print. With conditions, they wait until the final signal. With semaphores, they skip their loop entirely.
- **`max = 0`**: nobody prints, and everyone must still exit.
- **`n = 1`**: the thread signals itself, which is harmless because it isn't waiting.
- **Fairness and starvation**: not an issue, because the turn rule makes the order fully deterministic regardless of lock fairness.
- **Interrupts**: a robust version uses `await()`, catches `InterruptedException`, sets a shared `stopped` flag under the lock, and signals all conditions so everyone exits.
- **Throughput**: every number is a thread hand-off (a context switch). This is a coordination exercise, not a fast way to print numbers, and a single thread is orders of magnitude faster.
- **Using `notify()` with a single monitor** for N > 2 threads can wake the wrong thread and deadlock (every awake thread finds it's not its turn and waits). That's why the classic interview answer needs `notifyAll`, or per-thread conditions.

## JUnit tests

```java title="RoundRobinPrinterTest.java" file="RoundRobinPrinterTest.java" test="RoundRobinPrinter.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class RoundRobinPrinterTest {
    private static List<String> run(String variant, int n, int max) {
        return assertTimeoutPreemptively(Duration.ofSeconds(20), () -> switch (variant) {
            case "conditions" -> RoundRobinPrinter.withConditions(n, max);
            case "semaphores" -> RoundRobinPrinter.withSemaphores(n, max);
            default -> RoundRobinPrinter.withSignalAll(n, max).lines();
        });
    }

    @ParameterizedTest
    @ValueSource(strings = { "conditions", "semaphores", "signalAll" })
    void threeThreadsToTen(String variant) {
        assertEquals(List.of("T1:1", "T2:2", "T3:3", "T1:4", "T2:5", "T3:6", "T1:7", "T2:8", "T3:9", "T1:10"), run(variant, 3, 10));
    }

    @ParameterizedTest
    @ValueSource(strings = { "conditions", "semaphores", "signalAll" })
    void edgeSizesTerminate(String variant) {
        assertEquals(List.of("T1:1", "T1:2", "T1:3"), run(variant, 1, 3));
        assertEquals(List.of("T1:1", "T2:2", "T3:3"), run(variant, 5, 3));
        assertEquals(List.of(), run(variant, 4, 0));
    }

    @ParameterizedTest
    @ValueSource(strings = { "conditions", "semaphores" })
    void largeRunsStayInOrder(String variant) {
        assertTrue(RoundRobinPrinter.isRoundRobin(run(variant, 7, 35_000), 7, 35_000));
    }

    @Test
    void validation() {
        assertThrows(IllegalArgumentException.class, () -> RoundRobinPrinter.withConditions(0, 5));
        assertThrows(IllegalArgumentException.class, () -> RoundRobinPrinter.withSemaphores(2, -1));
    }
}
```
