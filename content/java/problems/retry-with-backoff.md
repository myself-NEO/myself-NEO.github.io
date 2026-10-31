## Problem statement

Write a reusable `Retry` utility for calls to flaky dependencies (HTTP, database, message broker):

```java
record Policy(int maxAttempts, Duration initialDelay, double multiplier, Duration maxDelay,
              Predicate<Throwable> retryable) {
    Duration delayBeforeRetry(int retryNumber);   // retryNumber 1 = the wait before attempt 2
}
interface Sleeper { void sleep(Duration d) throws InterruptedException; }   // injected: tests never really sleep
static final Sleeper THREAD_SLEEP;                // the production sleeper, based on Thread.sleep

Retry(Policy policy, Sleeper sleeper)
<T> T call(Callable<T> operation) throws Exception
```

**Behaviour**:
1. Run the operation. On success, return its result.
2. If it throws an exception that the policy considers **retryable**, wait, then try again. The wait before retry *n* is `initialDelay × multiplier^(n-1)`, **capped** at `maxDelay`. There's no wait after the last attempt.
3. **Non-retryable** exceptions (for example `IllegalArgumentException`) propagate **immediately and unchanged**: the same instance, not wrapped.
4. When all `maxAttempts` fail, throw `RetryExhaustedException` (a checked exception):
   - message `"gave up after N attempts"`;
   - the **last** failure as its **cause**;
   - the earlier failures attached as **suppressed** exceptions, so nothing is lost.
5. **Interrupts are respected**:
   - an operation that throws `InterruptedException` is never retried;
   - an interrupt during the wait stops retrying at once;
   - a thread that is already interrupted doesn't start an attempt.
   
   In all three cases `call` throws `InterruptedException`.
6. **Policy validation**: `maxAttempts ≥ 1`, non-negative delays, `multiplier ≥ 1`. Otherwise `IllegalArgumentException`.

## Starter code

```java title="Retry.java" starter="true"
import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.function.Predicate;

public final class Retry {
    record Policy(int maxAttempts, Duration initialDelay, double multiplier, Duration maxDelay, Predicate<Throwable> retryable) {
        // TODO: validate

        Duration delayBeforeRetry(int retryNumber) {          // retryNumber 1 = the wait before attempt 2
            throw new UnsupportedOperationException("TODO");
        }
    }

    interface Sleeper {
        void sleep(Duration d) throws InterruptedException;
    }

    static final Sleeper THREAD_SLEEP = d -> Thread.sleep(d.toMillis());

    static final class RetryExhaustedException extends Exception {
        private static final long serialVersionUID = 1L;
        RetryExhaustedException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    private final Policy policy;
    private final Sleeper sleeper;

    Retry(Policy policy, Sleeper sleeper) {
        this.policy = policy;
        this.sleeper = sleeper;
    }

    <T> T call(Callable<T> operation) throws Exception {
        return operation.call();                     // TODO: retries, backoff, classification, interrupts
    }

    static Callable<String> failingTimes(int failures, int[] attempts) {
        return () -> {
            attempts[0]++;
            if (attempts[0] <= failures) throw new IOException("connection reset #" + attempts[0]);
            return "200 OK after " + attempts[0] + " attempts";
        };
    }

    public static void main(String[] args) throws Exception {
        List<Duration> waits = new ArrayList<>();
        Sleeper recording = waits::add;
        Policy policy = new Policy(5, Duration.ofMillis(100), 2.0, Duration.ofMillis(500), e -> e instanceof IOException);
        Retry retry = new Retry(policy, recording);

        int[] attempts = { 0 };
        System.out.println("flaky (3 failures): " + retry.call(failingTimes(3, attempts)) + ", waits " + waits);

        waits.clear();
        try {
            retry.call(failingTimes(99, new int[] { 0 }));
        } catch (RetryExhaustedException e) {
            System.out.println("always failing: " + e.getMessage() + ", cause " + e.getCause().getMessage()
                    + ", suppressed " + e.getSuppressed().length + ", waits " + waits);
        }

        waits.clear();
        int[] calls = { 0 };
        try {
            retry.call(() -> { calls[0]++; throw new IllegalArgumentException("bad order id"); });
        } catch (IllegalArgumentException e) {
            System.out.println("non-retryable: thrown after " + calls[0] + " attempt(s), waits " + waits + ", message " + e.getMessage());
        }

        Retry interruptedDuringWait = new Retry(policy, d -> { throw new InterruptedException("shutdown"); });
        int[] beforeInterrupt = { 0 };
        try {
            interruptedDuringWait.call(failingTimes(99, beforeInterrupt));
        } catch (InterruptedException e) {
            System.out.println("interrupted while waiting: stopped after " + beforeInterrupt[0] + " attempt(s)");
        }

        try {
            new Policy(0, Duration.ZERO, 2.0, Duration.ZERO, e -> true);
        } catch (IllegalArgumentException e) {
            System.out.println("invalid policy: " + e.getMessage());
        }
    }
}
```

## Hints

````hint title="Hint 1: the loop"
```java
List<Exception> failures = new ArrayList<>();
for (int attempt = 1; ; attempt++) {
    if (Thread.interrupted()) throw new InterruptedException("interrupted before attempt " + attempt);
    try {
        return operation.call();
    } catch (InterruptedException e) {
        throw e;                                   // never retry an interrupt
    } catch (Exception e) {
        if (!policy.retryable().test(e)) throw e;  // same instance, unchanged
        failures.add(e);
        if (attempt == policy.maxAttempts()) throw exhausted(failures);
        sleeper.sleep(delayBefore(attempt + 1));
    }
}
```
````

````hint title="Hint 2: computing the delay"
`initialDelay × multiplier^(retry - 1)` grows very fast. Compute it in `double` milliseconds or nanoseconds and cap it **before** converting back, so it can never overflow:

```java
double nanos = initial.toNanos() * Math.pow(multiplier, retry - 2);   // retry = attempt number about to run
return Duration.ofNanos((long) Math.min(nanos, maxDelay.toNanos()));
```
````

````hint title="Hint 3: keeping every failure"
- Build the exhausted exception with the **last** failure as the cause.
- Add the earlier failures with `addSuppressed`.
- `Thread.interrupted()` clears the flag while checking it. That's fine here, because the method then *throws* `InterruptedException`, the other standard way to report an interrupt.
````

## Test cases

| Scenario (5 attempts, 100 ms × 2, cap 500 ms) | Expected |
|---|---|
| Fails 3 times, then succeeds | result returned; waits `[PT0.1S, PT0.2S, PT0.4S]` |
| Always fails | `RetryExhaustedException("gave up after 5 attempts")`; cause is failure #5; 4 suppressed; waits `[0.1, 0.2, 0.4, 0.5]` s (capped) |
| Throws `IllegalArgumentException` | the same exception after 1 attempt, no waits |
| The sleeper throws `InterruptedException` | `InterruptedException` after 1 attempt |
| The operation throws `InterruptedException` | propagated, not retried |
| The thread is already interrupted | `InterruptedException`, the operation never runs |
| A real sleeping thread is interrupted | stops promptly, no further attempts |
| `maxAttempts = 0` | `IllegalArgumentException` |

## Expected output

```text title="Expected output" output="Retry.java"
flaky (3 failures): 200 OK after 4 attempts, waits [PT0.1S, PT0.2S, PT0.4S]
always failing: gave up after 5 attempts, cause connection reset #5, suppressed 4, waits [PT0.1S, PT0.2S, PT0.4S, PT0.5S]
non-retryable: thrown after 1 attempt(s), waits [], message bad order id
interrupted while waiting: stopped after 1 attempt(s)
invalid policy: maxAttempts must be at least 1
```

## Reference solution

````solution title="Reference solution (Retry.java)"
```java title="Retry.java" file="Retry.java"
import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.Callable;
import java.util.function.Predicate;

public final class Retry {
    record Policy(int maxAttempts, Duration initialDelay, double multiplier, Duration maxDelay, Predicate<Throwable> retryable) {
        Policy {
            if (maxAttempts < 1) throw new IllegalArgumentException("maxAttempts must be at least 1");
            Objects.requireNonNull(initialDelay, "initialDelay");
            Objects.requireNonNull(maxDelay, "maxDelay");
            Objects.requireNonNull(retryable, "retryable");
            if (initialDelay.isNegative() || maxDelay.isNegative()) throw new IllegalArgumentException("delays must not be negative");
            if (!(multiplier >= 1.0)) throw new IllegalArgumentException("multiplier must be >= 1");
        }

        Duration delayBeforeRetry(int retryNumber) {          // retryNumber 1 = the wait before attempt 2
            double nanos = initialDelay.toNanos() * Math.pow(multiplier, retryNumber - 1);
            return Duration.ofNanos((long) Math.min(nanos, maxDelay.toNanos()));   // cap before converting: no overflow
        }
    }

    interface Sleeper {
        void sleep(Duration d) throws InterruptedException;
    }

    static final class RetryExhaustedException extends Exception {
        private static final long serialVersionUID = 1L;
        RetryExhaustedException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    static final Sleeper THREAD_SLEEP = d -> Thread.sleep(d.toMillis(), d.toNanosPart() % 1_000_000);

    private final Policy policy;
    private final Sleeper sleeper;

    Retry(Policy policy, Sleeper sleeper) {
        this.policy = Objects.requireNonNull(policy);
        this.sleeper = Objects.requireNonNull(sleeper);
    }

    <T> T call(Callable<T> operation) throws Exception {
        List<Exception> failures = new ArrayList<>();
        for (int attempt = 1; ; attempt++) {
            if (Thread.interrupted()) {                        // don't start work on a cancelled thread
                throw new InterruptedException("interrupted before attempt " + attempt);
            }
            try {
                return operation.call();
            } catch (InterruptedException e) {
                throw e;                                       // an interrupt is a request to stop, never a transient error
            } catch (Exception e) {
                if (!policy.retryable().test(e)) {
                    throw e;                                   // non-retryable: same instance, unchanged
                }
                failures.add(e);
                if (attempt >= policy.maxAttempts()) {
                    RetryExhaustedException exhausted = new RetryExhaustedException("gave up after " + attempt + " attempts", e);
                    for (Exception earlier : failures.subList(0, failures.size() - 1)) {
                        exhausted.addSuppressed(earlier);      // keep every failure for diagnosis
                    }
                    throw exhausted;
                }
                sleeper.sleep(policy.delayBeforeRetry(attempt));   // InterruptedException propagates: stop retrying
            }
        }
    }

    static Callable<String> failingTimes(int failures, int[] attempts) {
        return () -> {
            attempts[0]++;
            if (attempts[0] <= failures) throw new IOException("connection reset #" + attempts[0]);
            return "200 OK after " + attempts[0] + " attempts";
        };
    }

    public static void main(String[] args) throws Exception {
        List<Duration> waits = new ArrayList<>();
        Sleeper recording = waits::add;
        Policy policy = new Policy(5, Duration.ofMillis(100), 2.0, Duration.ofMillis(500), e -> e instanceof IOException);
        Retry retry = new Retry(policy, recording);

        int[] attempts = { 0 };
        System.out.println("flaky (3 failures): " + retry.call(failingTimes(3, attempts)) + ", waits " + waits);

        waits.clear();
        try {
            retry.call(failingTimes(99, new int[] { 0 }));
        } catch (RetryExhaustedException e) {
            System.out.println("always failing: " + e.getMessage() + ", cause " + e.getCause().getMessage()
                    + ", suppressed " + e.getSuppressed().length + ", waits " + waits);
        }

        waits.clear();
        int[] calls = { 0 };
        try {
            retry.call(() -> { calls[0]++; throw new IllegalArgumentException("bad order id"); });
        } catch (IllegalArgumentException e) {
            System.out.println("non-retryable: thrown after " + calls[0] + " attempt(s), waits " + waits + ", message " + e.getMessage());
        }

        Retry interruptedDuringWait = new Retry(policy, d -> { throw new InterruptedException("shutdown"); });
        int[] beforeInterrupt = { 0 };
        try {
            interruptedDuringWait.call(failingTimes(99, beforeInterrupt));
        } catch (InterruptedException e) {
            System.out.println("interrupted while waiting: stopped after " + beforeInterrupt[0] + " attempt(s)");
        }

        try {
            new Policy(0, Duration.ZERO, 2.0, Duration.ZERO, e -> true);
        } catch (IllegalArgumentException e) {
            System.out.println("invalid policy: " + e.getMessage());
        }
    }
}
```
````

## Step-by-step explanation

````solution title="Step-by-step explanation"
1. **Policy as a validated record.** All the knobs live in one immutable value, with the rules enforced in the compact constructor. `!(multiplier >= 1.0)` also rejects `NaN`. The policy computes its own delays, so the loop stays readable.
2. **Capped exponential backoff.** The wait before retry n is `initial × multiplier^(n-1)`: 100, 200, 400 ms, then capped at 500. Computing in `double` and applying `Math.min` with the cap **before** converting to `long` avoids overflow: `Duration.ofMillis(100).multipliedBy(2^40)` would otherwise overflow or produce absurd waits.
3. **Classify errors.**
   - **Retryable**: I/O resets and timeouts are transient, so retrying can help.
   - **Non-retryable**: validation errors, authentication failures and bugs fail identically every time, so retrying only adds latency and load.
   
   The predicate makes this a policy decision. Non-retryable exceptions are rethrown **as the same object**, so callers' `catch` blocks and stack traces work as if there were no retry wrapper.
4. **Never lose information.** The final exception's *cause* is the last failure, and every earlier failure is attached with `addSuppressed`, so logs show the whole sequence (reset, timeout, reset…) and not just the last symptom.
5. **Respect interrupts.** Cancelling a task (`Future.cancel(true)`, executor shutdown) interrupts its thread, and a retry loop that ignores this would keep a "cancelled" task running for minutes. The utility:
   - checks `Thread.interrupted()` before each attempt;
   - never retries an operation that threw `InterruptedException`;
   - lets an `InterruptedException` from the sleep end the loop.
   
   Throwing `InterruptedException` is the proper signal. If a method can't throw it, it must call `Thread.currentThread().interrupt()` instead.
6. **Injected sleeper.** Production passes `THREAD_SLEEP`. Tests record the waits instead, so the whole retry schedule is verified in microseconds.
````

## Edge cases

- **`maxAttempts = 1`**: no retries. A retryable failure ends as `RetryExhaustedException` with zero suppressed exceptions.
- **Zero delays** (`initialDelay = 0`): retries happen back-to-back. That's acceptable for tests, but dangerous against real services.
- **Thundering herd**: many clients retrying on the same schedule hit a recovering service simultaneously. Production retries add **jitter** (for example "full jitter": a random wait between 0 and the computed delay) with an injected `Random`.
- **Non-idempotent operations** (charging a card): retrying after a timeout may execute the operation twice. Use idempotency keys or don't retry.
- **Overall deadline**: the total time can reach the sum of all delays plus the attempt durations. Many APIs also take a deadline and stop when the next wait would exceed it.
- **`Error`s** (`OutOfMemoryError`) aren't `Exception`s, so they're never caught or retried here, and that's intended.
- **Retry budgets and circuit breakers**: under a widespread outage, retries multiply the load. Resilience4j combines retries with circuit breakers and rate limits.

## JUnit tests

```java title="RetryTest.java" file="RetryTest.java" test="Retry.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

class RetryTest {
    private final List<Duration> waits = new ArrayList<>();
    private final Retry.Policy policy = new Retry.Policy(5, Duration.ofMillis(100), 2.0, Duration.ofMillis(500), e -> e instanceof IOException);
    private final Retry retry = new Retry(policy, waits::add);

    @Test
    void successOnFirstAttemptDoesNotWait() throws Exception {
        assertEquals("ok", retry.call(() -> "ok"));
        assertEquals(List.of(), waits);
    }

    @Test
    void retriesTransientFailuresWithBackoff() throws Exception {
        AtomicInteger attempts = new AtomicInteger();
        String result = retry.call(() -> {
            if (attempts.incrementAndGet() <= 3) throw new IOException("reset");
            return "done";
        });
        assertEquals("done", result);
        assertEquals(4, attempts.get());
        assertEquals(List.of(Duration.ofMillis(100), Duration.ofMillis(200), Duration.ofMillis(400)), waits);
    }

    @Test
    void exhaustedKeepsEveryFailure() {
        AtomicInteger attempts = new AtomicInteger();
        Retry.RetryExhaustedException e = assertThrows(Retry.RetryExhaustedException.class,
                () -> retry.call(() -> { throw new IOException("fail #" + attempts.incrementAndGet()); }));
        assertEquals("gave up after 5 attempts", e.getMessage());
        assertEquals("fail #5", e.getCause().getMessage());
        assertEquals(4, e.getSuppressed().length);
        assertEquals("fail #1", e.getSuppressed()[0].getMessage());
        assertEquals(List.of(Duration.ofMillis(100), Duration.ofMillis(200), Duration.ofMillis(400), Duration.ofMillis(500)), waits);
    }

    @Test
    void nonRetryablePropagatesSameInstanceImmediately() {
        IllegalStateException boom = new IllegalStateException("bug");
        AtomicInteger attempts = new AtomicInteger();
        IllegalStateException thrown = assertThrows(IllegalStateException.class,
                () -> retry.call(() -> { attempts.incrementAndGet(); throw boom; }));
        assertSame(boom, thrown);
        assertEquals(1, attempts.get());
        assertEquals(List.of(), waits);
    }

    @Test
    void interruptedOperationIsNotRetried() {
        AtomicInteger attempts = new AtomicInteger();
        Retry anyError = new Retry(new Retry.Policy(5, Duration.ZERO, 1.0, Duration.ZERO, e -> true), waits::add);
        assertThrows(InterruptedException.class, () -> anyError.call(() -> { attempts.incrementAndGet(); throw new InterruptedException(); }));
        assertEquals(1, attempts.get());
    }

    @Test
    void alreadyInterruptedThreadDoesNotStart() {
        AtomicInteger attempts = new AtomicInteger();
        Thread.currentThread().interrupt();
        assertThrows(InterruptedException.class, () -> retry.call(() -> attempts.incrementAndGet()));
        assertEquals(0, attempts.get());
        Thread.interrupted();                                         // leave the test thread clean
    }

    @Test
    void realSleepIsInterruptedPromptly() throws Exception {
        Retry slow = new Retry(new Retry.Policy(10, Duration.ofSeconds(30), 1.0, Duration.ofSeconds(30), e -> true), Retry.THREAD_SLEEP);
        AtomicInteger attempts = new AtomicInteger();
        AtomicReference<Throwable> outcome = new AtomicReference<>();
        CountDownLatch failedOnce = new CountDownLatch(1);
        Thread worker = new Thread(() -> {
            try {
                slow.call(() -> {
                    attempts.incrementAndGet();
                    failedOnce.countDown();
                    throw new IOException("down");
                });
            } catch (Throwable t) {
                outcome.set(t);
            }
        });
        worker.start();
        assertTrue(failedOnce.await(5, TimeUnit.SECONDS));
        worker.interrupt();
        worker.join(5_000);
        assertTrue(outcome.get() instanceof InterruptedException, String.valueOf(outcome.get()));
        assertEquals(1, attempts.get());
    }

    @Test
    void policyValidation() {
        assertThrows(IllegalArgumentException.class, () -> new Retry.Policy(0, Duration.ZERO, 2, Duration.ZERO, e -> true));
        assertThrows(IllegalArgumentException.class, () -> new Retry.Policy(3, Duration.ofMillis(-1), 2, Duration.ZERO, e -> true));
        assertThrows(IllegalArgumentException.class, () -> new Retry.Policy(3, Duration.ZERO, 0.5, Duration.ZERO, e -> true));
        assertThrows(IllegalArgumentException.class, () -> new Retry.Policy(3, Duration.ZERO, Double.NaN, Duration.ZERO, e -> true));
    }

    @Test
    void hugeExponentsAreCappedWithoutOverflow() {
        Retry.Policy p = new Retry.Policy(100, Duration.ofSeconds(1), 10.0, Duration.ofMinutes(1), e -> true);
        assertEquals(Duration.ofMinutes(1), p.delayBeforeRetry(80));
    }
}
```
