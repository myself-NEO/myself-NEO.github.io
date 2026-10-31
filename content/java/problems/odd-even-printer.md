## Problem statement

Two threads must print the numbers `1..n` **in order**: a thread named `odd` prints the odd numbers and a thread named `even` prints the even ones, strictly alternating. Implement it twice in `OddEvenPrinter`:

1. **`static List<String> withWaitNotify(int n)`** coordinates with `synchronized`, `wait()` and `notifyAll()` on a shared lock.
2. **`static List<String> withSemaphores(int n)`** coordinates with two `java.util.concurrent.Semaphore`s.

Both methods:
- start the two threads, wait for them to finish, and return the lines the threads produced, in order (`"odd 1"`, `"even 2"`, …). Collecting lines instead of writing to `System.out` makes the order testable;
- must work for any `n ≥ 0` (including 0 and 1), with **both threads terminating**;
- must not busy-wait, and must not rely on `Thread.sleep` for ordering.

## Starter code

```java title="OddEvenPrinter.java" starter="true"
import java.util.ArrayList;
import java.util.List;

public final class OddEvenPrinter {
    private OddEvenPrinter() { }

    static List<String> withWaitNotify(int n) throws InterruptedException {
        return new ArrayList<>();                  // TODO: two threads, one lock, wait/notifyAll
    }

    static List<String> withSemaphores(int n) throws InterruptedException {
        return new ArrayList<>();                  // TODO: two threads, two semaphores
    }

    static boolean isCorrect(List<String> lines, int n) {
        if (lines.size() != n) return false;
        for (int i = 1; i <= n; i++) {
            if (!lines.get(i - 1).equals((i % 2 == 1 ? "odd " : "even ") + i)) return false;
        }
        return true;
    }

    public static void main(String[] args) throws InterruptedException {
        System.out.println("wait/notify, n = 10: " + withWaitNotify(10));
        System.out.println("semaphores,  n = 10: " + withSemaphores(10));
        System.out.println("n = 0: " + withWaitNotify(0) + " " + withSemaphores(0) + "; n = 1: " + withWaitNotify(1) + " " + withSemaphores(1));
        System.out.println("n = 100,000 strictly ordered: wait/notify " + isCorrect(withWaitNotify(100_000), 100_000)
                + ", semaphores " + isCorrect(withSemaphores(100_000), 100_000));
    }
}
```

## Hints

````hint title="Hint 1: one shared state variable"
With wait/notify, both threads share a lock and a counter `next` (the number to print next). A thread may print only when `next` has its parity. Otherwise it waits. After printing, it increments `next` and calls `notifyAll()`, so the other thread re-checks.
````

````hint title="Hint 2: wait in a while loop, and plan the exit"
```java
synchronized (lock) {
    while (next <= n && next % 2 != parity) lock.wait();   // while, never if
    if (next > n) { lock.notifyAll(); return; }            // wake the other thread so it can exit too
    ...
}
```

`wait()` can return spuriously, or after a notification meant for a different condition, so the condition must be re-checked. When the last number is printed, the other thread must be woken to notice that the work is done; otherwise it waits forever.
````

````hint title="Hint 3: semaphores as baton passing"
Start with `odd = new Semaphore(1)` (odd goes first) and `even = new Semaphore(0)`. The odd thread loops over 1, 3, 5…: `odd.acquire()`, print, `even.release()`. The even thread mirrors it. Each thread knows exactly how many numbers it prints, so termination is automatic. A `release` without a matching `acquire` at the very end is harmless.
````

## Test cases

| Input | Expected |
|---|---|
| `n = 10` (both versions) | `[odd 1, even 2, odd 3, even 4, odd 5, even 6, odd 7, even 8, odd 9, even 10]` |
| `n = 0` | `[]`, both threads terminate |
| `n = 1` | `[odd 1]` |
| `n = 9` (odd n) | ends with `odd 9`; the even thread terminates |
| `n = 100,000` | strictly ordered, alternating threads |
| Any n | finishes promptly, with no thread left waiting |

## Expected output

```text title="Expected output" output="OddEvenPrinter.java"
wait/notify, n = 10: [odd 1, even 2, odd 3, even 4, odd 5, even 6, odd 7, even 8, odd 9, even 10]
semaphores,  n = 10: [odd 1, even 2, odd 3, even 4, odd 5, even 6, odd 7, even 8, odd 9, even 10]
n = 0: [] []; n = 1: [odd 1] [odd 1]
n = 100,000 strictly ordered: wait/notify true, semaphores true
```

## Reference solution

````solution title="Reference solution (OddEvenPrinter.java)"
```java title="OddEvenPrinter.java" file="OddEvenPrinter.java"
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Semaphore;

public final class OddEvenPrinter {
    private OddEvenPrinter() { }

    // ---------- version 1: one monitor, wait/notifyAll ----------
    private static final class Turn {
        private final int n;
        private int next = 1;                                  // guarded by this
        private final List<String> lines = new ArrayList<>();  // guarded by this

        Turn(int n) {
            this.n = n;
        }

        void run(String name, int parity) {
            while (true) {
                synchronized (this) {
                    while (next <= n && next % 2 != parity) {
                        try {
                            wait();                            // releases the monitor while waiting
                        } catch (InterruptedException e) {
                            Thread.currentThread().interrupt();
                            return;
                        }
                    }
                    if (next > n) {
                        notifyAll();                           // let the other thread see the end too
                        return;
                    }
                    lines.add(name + " " + next);
                    next++;
                    notifyAll();                               // pass the turn
                }
            }
        }
    }

    static List<String> withWaitNotify(int n) throws InterruptedException {
        Turn turn = new Turn(n);
        Thread odd = new Thread(() -> turn.run("odd", 1), "odd");
        Thread even = new Thread(() -> turn.run("even", 0), "even");
        odd.start();
        even.start();
        odd.join();                                            // join: happens-before, so the list is visible
        even.join();
        synchronized (turn) {
            return new ArrayList<>(turn.lines);
        }
    }

    // ---------- version 2: two semaphores ----------
    static List<String> withSemaphores(int n) throws InterruptedException {
        Semaphore oddTurn = new Semaphore(1);                  // odd prints first
        Semaphore evenTurn = new Semaphore(0);
        List<String> lines = new ArrayList<>();                // handed over by acquire/release (happens-before)
        Thread odd = new Thread(() -> {
            try {
                for (int i = 1; i <= n; i += 2) {
                    oddTurn.acquire();
                    lines.add("odd " + i);
                    evenTurn.release();
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }, "odd");
        Thread even = new Thread(() -> {
            try {
                for (int i = 2; i <= n; i += 2) {
                    evenTurn.acquire();
                    lines.add("even " + i);
                    oddTurn.release();
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }, "even");
        odd.start();
        even.start();
        odd.join();
        even.join();
        return lines;
    }

    static boolean isCorrect(List<String> lines, int n) {
        if (lines.size() != n) return false;
        for (int i = 1; i <= n; i++) {
            if (!lines.get(i - 1).equals((i % 2 == 1 ? "odd " : "even ") + i)) return false;
        }
        return true;
    }

    public static void main(String[] args) throws InterruptedException {
        System.out.println("wait/notify, n = 10: " + withWaitNotify(10));
        System.out.println("semaphores,  n = 10: " + withSemaphores(10));
        System.out.println("n = 0: " + withWaitNotify(0) + " " + withSemaphores(0) + "; n = 1: " + withWaitNotify(1) + " " + withSemaphores(1));
        System.out.println("n = 100,000 strictly ordered: wait/notify " + isCorrect(withWaitNotify(100_000), 100_000)
                + ", semaphores " + isCorrect(withSemaphores(100_000), 100_000));
    }
}
```
````

## Step-by-step explanation

````solution title="Step-by-step explanation"
**wait/notify version**
1. **Shared state under one lock**: `next` is the only coordination variable. Each thread "owns" one parity, and all reads and writes of `next` and `lines` happen inside `synchronized (this)`, which gives both mutual exclusion and visibility.
2. **The guarded wait**: `while (next <= n && next % 2 != parity) wait();`. `wait()` atomically releases the monitor and sleeps, which is what lets the other thread get in and make progress. The `while` re-checks the condition after every wake-up: spurious wake-ups are allowed by the specification, and `notifyAll` may wake a thread whose condition is still false.
3. **Act and signal**: print (record), increment, `notifyAll()`. `notify()` would work here too, with exactly one other thread waiting on this monitor, but `notifyAll` is the robust default: with more waiters, `notify` can wake the "wrong" thread and lose the signal.
4. **Termination**: the wait condition includes `next <= n`, so once the work is done, the waiting thread falls through, sees `next > n`, notifies, and exits. Without that clause, whichever thread didn't print the last number would wait forever, and `join` would hang. The demo's `n = 0` and odd-`n` cases check this.
5. **Interrupts**: restoring the flag and returning gives a clean shutdown path.

**Semaphore version**
1. **The permits are the turn token**: `oddTurn` starts with one permit, `evenTurn` with zero. Each thread acquires its own semaphore, prints, and releases the *other* one, passing the baton.
2. **No shared counter or lock** is needed. Each thread knows its own sequence (`i += 2`), so loop bounds handle termination. With odd `n`, the final `evenTurn.release()` leaves an unused permit, which is harmless.
3. **Visibility**: `Semaphore.release()` *happens-before* a successful `acquire()` in another thread. The plain `ArrayList` is therefore handed safely from thread to thread, and `join()` publishes the final state to the caller.

**Which to use?** Semaphores (or `SynchronousQueue`/`Exchanger`) express hand-offs more clearly and are harder to get wrong. wait/notify is what interviewers ask you to write, to check that you know about the loop, the lock and the lost-signal problems. For N threads, generalise the "whose turn" variable (see the round-robin exercise).
````

## Edge cases

- **`n = 0`**: neither thread prints. Both must still exit (the wait/notify version checks `next > n` first).
- **Odd `n`**: the even thread has nothing to print for the last turn and must not wait forever.
- **Using `if` instead of `while` around `wait()`**: it works most of the time and fails rarely, after a spurious wake-up. Always use the loop.
- **Calling `wait`/`notify` without holding the monitor**: `IllegalMonitorStateException`.
- **Lost signal**: notifying *before* the other thread waits is fine here, because the condition is state-based (`next`), not signal-based. The waiter checks `next` and doesn't wait at all.
- **Interrupts and shutdown**: an interrupted thread must exit and leave the other able to finish, or be interrupted too. In production, prefer executors with cancellation.
- **Performance**: each number costs a context switch, so this is a coordination exercise, not a fast way to print numbers. A single thread is far faster.

## JUnit tests

```java title="OddEvenPrinterTest.java" file="OddEvenPrinterTest.java" test="OddEvenPrinter.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.util.List;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class OddEvenPrinterTest {
    private static final List<String> TEN = List.of("odd 1", "even 2", "odd 3", "even 4", "odd 5",
            "even 6", "odd 7", "even 8", "odd 9", "even 10");

    @ParameterizedTest
    @ValueSource(strings = { "waitNotify", "semaphores" })
    void printsOneToTenInOrder(String variant) {
        assertEquals(TEN, run(variant, 10));
    }

    @ParameterizedTest
    @ValueSource(strings = { "waitNotify", "semaphores" })
    void smallAndOddSizesTerminate(String variant) {
        assertEquals(List.of(), run(variant, 0));
        assertEquals(List.of("odd 1"), run(variant, 1));
        assertEquals(TEN.subList(0, 9), run(variant, 9));
    }

    @ParameterizedTest
    @ValueSource(strings = { "waitNotify", "semaphores" })
    void largeRunStaysStrictlyOrdered(String variant) {
        assertTrue(OddEvenPrinter.isCorrect(run(variant, 50_000), 50_000));
    }

    private static List<String> run(String variant, int n) {
        return assertTimeoutPreemptively(Duration.ofSeconds(20), () ->
                variant.equals("waitNotify") ? OddEvenPrinter.withWaitNotify(n) : OddEvenPrinter.withSemaphores(n));
    }
}
```
