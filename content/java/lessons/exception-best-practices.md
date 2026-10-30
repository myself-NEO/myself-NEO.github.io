## Concept explanation

### What it is

A consistent **exception strategy** answers, for every layer of a system: which failures can occur, who handles them, what gets logged, what the user or client sees, and what happens next (retry, fallback, abort). The rules below are what senior reviewers look for.

### The rules

1. **Fail fast.** Validate inputs and preconditions at the boundary (`Objects.requireNonNull`, `IllegalArgumentException`) so errors surface where they're caused, not three layers later as a `NullPointerException`.
2. **Never swallow.** An empty `catch` is a bug report you've thrown away. If you truly expect and ignore an exception, name the variable `ignored` and comment why.
3. **Catch only what you can handle — where you can handle it.** Recover, retry, fall back, or translate with context. Otherwise let it propagate.
4. **Log once, at the boundary.** Either handle-and-log **or** rethrow — not both. The request handler, message listener or scheduled-job wrapper logs with the full stack trace and context; inner layers add context by wrapping, not by logging.
5. **Preserve the cause** when translating (see [custom exceptions](lesson:custom-exceptions)).
6. **Don't use exceptions for control flow.** Expected outcomes (not found, validation failed, end of input) are often better as return values: `Optional`, a result type, or a boolean method. Exceptions are for the exceptional.
7. **Handle `InterruptedException` properly**: restore the flag with `Thread.currentThread().interrupt()` (or propagate it) — never swallow it (see [interrupts](lesson:interrupts-and-cancellation)).
8. **Retry only transient failures**, with limits, backoff and jitter, and only when the operation is **idempotent** (or protected by an idempotency key). Never retry validation errors or bugs.
9. **Don't expose internals.** Clients get a stable error code and a safe message; logs get the details. No stack traces, SQL or secrets in responses.
10. **Catch `Throwable`/`Error` only at the top** of a thread or process (to log and exit/restart), never in business logic.
11. **Clean up with try-with-resources**, not `finally` blocks that might throw.
12. **Know where exceptions go in concurrent code**: `ExecutorService.submit` stores them in the `Future` (you only see them via `get()` → `ExecutionException`); `execute` sends them to the thread's uncaught-exception handler; `CompletableFuture` carries them through the chain until something handles them.

### Why it matters

Most production incidents are made worse by bad error handling: swallowed exceptions hide the cause, double logging floods the logs, broad catches turn bugs into silent data corruption, retries of non-idempotent operations charge a customer twice, and leaked stack traces expose internals to attackers.

### When to use exceptions vs result values

| Situation | Prefer |
|---|---|
| programming error, broken invariant | unchecked exception (fail fast) |
| infrastructure failure (I/O, network, DB) | exception, translated at layer boundaries |
| expected business outcome the caller must branch on ("not found", "rejected") | `Optional` / result type, or a specific exception handled at the boundary |
| high-frequency parsing/validation | return a result; avoid throwing in hot loops |

## Internal working

- **Cost**: constructing an exception captures the stack trace — microseconds, and much more under deep stacks. A service that throws thousands of exceptions per second for normal outcomes (e.g. `NumberFormatException` for validation) burns CPU and allocations. HotSpot can optimise frequently thrown implicit exceptions (`-XX:+OmitStackTraceInFastThrow` drops their stack traces after many repeats — which is why some production NPEs show no trace).
- **Executors**: `submit(callable)` wraps the task in a `FutureTask`; any exception is caught and stored, and `Future.get()` throws `ExecutionException` with it as the cause. If nobody calls `get()`, the failure is invisible. `execute(runnable)` lets the exception escape the worker, triggering the `UncaughtExceptionHandler` (and the pool replaces the dead worker thread).
- **Lambdas and checked exceptions**: functional interfaces like `Function` don't declare checked exceptions, so a lambda can't throw `IOException` directly; wrap it (`UncheckedIOException`) or use your own throwing functional interface.
- **Frameworks**: Spring's `@ExceptionHandler`/`@ControllerAdvice`, JAX-RS `ExceptionMapper`, and message-listener error handlers are the "boundary" where exceptions become responses and log lines.
- **Logging an exception** with SLF4J: `log.error("payment {} failed", paymentId, e)` — the last argument as a `Throwable` prints the stack trace including causes and suppressed exceptions.

## Visual representation

```text title="Where exceptions are handled in a service"
  Client <-- 4xx/5xx + error code + safe message --+
                                                    |
  Boundary (controller advice / listener wrapper)   |   LOG ONCE here: stack trace + request id + context
       ^  maps OrderNotFound -> 404, Validation -> 400, everything else -> 500
       |
  Service      validates (fail fast), translates, decides retries/fallbacks   (no logging of rethrown exceptions)
       ^
  Repository / client   translates SQLException / IOException -> domain-level exceptions (with cause)
       ^
  Driver / network      throws

  Anti-pattern:  log + rethrow at every layer  ->  1 failure = 4 stack traces in the logs
```

## Java code example

```java title="BestPracticesDemo.java" file="BestPracticesDemo.java"
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

public class BestPracticesDemo {
    static final List<String> LOG = new ArrayList<>();

    public static void main(String[] args) throws Exception {
        // 1. Fail fast with a clear message
        try {
            new Transfer(null, "acc-2", 100);
        } catch (NullPointerException e) {
            System.out.println("fail fast: " + e.getMessage());
        }

        // 2. Log once: compare the anti-pattern with logging at the boundary
        LOG.clear();
        try {
            serviceLogAndRethrow();
        } catch (IllegalStateException e) {
            LOG.add("boundary: " + e.getMessage());
        }
        System.out.println("log-and-rethrow at every layer -> " + LOG.size() + " log entries for one failure");
        LOG.clear();
        try {
            serviceWrapOnly();
        } catch (IllegalStateException e) {
            LOG.add("boundary: " + e.getMessage() + " (cause: " + e.getCause().getMessage() + ")");
        }
        System.out.println("wrap, log once at the boundary -> " + LOG.size() + " entry: " + LOG.get(0));

        // 3. Expected outcomes as values, not exceptions
        System.out.println("parse '42' -> " + parsePort("42") + ", parse 'abc' -> " + parsePort("abc") + ", parse '70000' -> " + parsePort("70000"));

        // 4. Exceptions inside executors: submit() hides them until get()
        ExecutorService pool = Executors.newSingleThreadExecutor();
        Future<?> f = pool.submit(() -> {
            throw new IllegalStateException("task failed silently");
        });
        try {
            f.get();
        } catch (ExecutionException e) {
            System.out.println("submit + get: ExecutionException caused by " + e.getCause());
        }
        pool.shutdown();
        pool.awaitTermination(5, TimeUnit.SECONDS);

        // 5. InterruptedException: restore the flag instead of swallowing it
        Thread worker = new Thread(BestPracticesDemo::pollUntilInterrupted);
        worker.start();
        worker.interrupt();
        worker.join();

        // 6. Checked exceptions inside lambdas: wrap them
        List<String> files = List.of("ok.txt", "missing.txt");
        try {
            files.forEach(name -> {
                try {
                    read(name);
                } catch (IOException e) {
                    throw new UncheckedIOException(e);
                }
            });
        } catch (UncheckedIOException e) {
            System.out.println("lambda wrapped: " + e.getCause().getMessage());
        }
    }

    record Transfer(String from, String to, long cents) {
        Transfer {
            Objects.requireNonNull(from, "from account is required");
            Objects.requireNonNull(to, "to account is required");
            if (cents <= 0) {
                throw new IllegalArgumentException("amount must be positive");
            }
        }
    }

    static void repositoryLogAndRethrow() {
        try {
            throw new IllegalStateException("db timeout");
        } catch (IllegalStateException e) {
            LOG.add("repository: " + e.getMessage());     // anti-pattern
            throw e;
        }
    }

    static void serviceLogAndRethrow() {
        try {
            repositoryLogAndRethrow();
        } catch (IllegalStateException e) {
            LOG.add("service: " + e.getMessage());        // anti-pattern
            throw e;
        }
    }

    static void serviceWrapOnly() {
        try {
            throw new IllegalStateException("db timeout");
        } catch (IllegalStateException e) {
            throw new IllegalStateException("could not load order 42", e);   // add context, don't log
        }
    }

    static Optional<Integer> parsePort(String raw) {
        if (raw == null || !raw.matches("\\d{1,5}")) {
            return Optional.empty();                      // expected bad input: no exception thrown
        }
        int port = Integer.parseInt(raw);
        return port <= 65_535 ? Optional.of(port) : Optional.empty();
    }

    static void pollUntilInterrupted() {
        try {
            while (true) {
                Thread.sleep(1_000);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();           // restore, so callers up the stack can see it
            System.out.println("worker interrupted, flag restored: " + Thread.currentThread().isInterrupted());
        }
    }

    static void read(String name) throws IOException {
        if (name.startsWith("missing")) {
            throw new IOException(name + " not found");
        }
    }
}
```

## Output

```text title="Output" output="BestPracticesDemo.java"
fail fast: from account is required
log-and-rethrow at every layer -> 3 log entries for one failure
wrap, log once at the boundary -> 1 entry: boundary: could not load order 42 (cause: db timeout)
parse '42' -> Optional[42], parse 'abc' -> Optional.empty, parse '70000' -> Optional.empty
submit + get: ExecutionException caused by java.lang.IllegalStateException: task failed silently
worker interrupted, flag restored: true
lambda wrapped: missing.txt not found
```

- The record's compact constructor rejected the bad transfer before any work was done, with a message naming the problem.
- One failure produced three log entries when every layer logged and rethrew; wrapping with context and logging only at the boundary produced one complete entry.
- Expected bad input returned `Optional.empty()` without the cost of throwing.
- The executor stored the task's exception; it surfaced only through `Future.get()` as the cause of an `ExecutionException`.
- The interrupted worker restored its interrupt flag rather than hiding the interruption.

## Real-world application

- **Spring Boot services**: a `@RestControllerAdvice` maps domain exceptions to `ProblemDetail` responses (RFC 9457) with codes; a logging filter adds request ids (MDC) so the single log entry is traceable.
- **Message consumers** (Kafka, SQS): classify failures — transient → retry with backoff; poison messages → dead-letter queue after N attempts; always commit offsets deliberately.
- **Payments and orders**: idempotency keys make retries safe; the [payment workflow](#system-design/lld/problems/payment-workflow) problem shows the design.
- **Batch jobs**: per-record error handling (collect failures, continue) instead of failing the whole batch on one bad row — with a cap on the failure rate.
- **Operations**: `-XX:+HeapDumpOnOutOfMemoryError` and `-XX:+ExitOnOutOfMemoryError` instead of catching `OutOfMemoryError`.

## Common mistakes

- `catch (Exception e) { e.printStackTrace(); }` — prints to stderr, bypasses logging, continues as if nothing happened.
- Swallowing `InterruptedException` (`catch (InterruptedException ignored) {}`), which breaks shutdown.
- Logging **and** rethrowing at every layer.
- Throwing generic `RuntimeException("error")` with no context.
- Retrying everything, including `IllegalArgumentException` and non-idempotent writes.
- Returning `null` on failure instead of throwing or returning `Optional`, moving the crash somewhere else.
- `submit()`-ing tasks to executors and never calling `get()` — failures vanish.
- Exposing exception messages and stack traces to API clients.

## Interview questions

**Q1. What is your strategy for exception handling in a layered service?**

````reveal title="Answer"
Validate early and throw unchecked exceptions for contract violations. In infrastructure code, translate low-level exceptions (`SQLException`, `IOException`) into meaningful domain or infrastructure exceptions with the cause attached. Let exceptions propagate through business layers unless they can recover, retry (only transient + idempotent operations), or add context. At the boundary — controller advice, listener wrapper, job runner — log once with full context and map exceptions to responses with stable error codes and safe messages. Never swallow, never log-and-rethrow at every layer.
````

**Q2. How should you handle `InterruptedException`?**

````reveal title="Answer"
Either propagate it (declare `throws InterruptedException`) or, if you can't, restore the interrupt status with `Thread.currentThread().interrupt()` and stop what you're doing. Swallowing it clears the flag and leaves the thread running when someone asked it to stop — breaking cancellation and graceful shutdown of executors.
````

**Q3. Why is "log and rethrow" an anti-pattern?**

````reveal title="Answer"
The same failure gets logged at every layer it passes through, producing duplicate stack traces that make incidents harder to read and inflate log volume and cost, while each copy lacks the context the others have. Instead: add context by wrapping (with the cause) as it propagates, and log once where it's finally handled.
````

**Q4. When would you return `Optional` or a result object instead of throwing?**

````reveal title="Answer"
When the "failure" is an expected, frequent outcome the caller must branch on — a lookup that may find nothing, input validation, parsing user data — especially in hot paths, since throwing captures a stack trace. Exceptions remain right for unexpected failures, broken invariants and infrastructure errors that should propagate to a boundary.
````

**Q5. A task submitted to an `ExecutorService` throws. Where does the exception go?**

````reveal title="Answer"
With `submit`, the `FutureTask` catches it and stores it; it's rethrown wrapped in `ExecutionException` when someone calls `Future.get()` — if nobody does, it's never seen. With `execute`, it escapes to the worker thread's `UncaughtExceptionHandler` (logged to stderr by default) and the pool replaces the worker. With `CompletableFuture`, it completes the future exceptionally and flows to `exceptionally`/`handle`/`join` (as `CompletionException`).
````

## Hands-on exercise

Write `static <T> T withRetry(Callable<T> action, int maxAttempts, long baseDelayMs)` that:

- retries only exceptions classified as **transient** (`IOException` or a custom `TransientException`), with exponential backoff (`base × 2^(attempt-1)`);
- immediately rethrows anything else;
- after the last attempt, throws a `RetriesExhaustedException` whose cause is the last failure and whose **suppressed** exceptions are the earlier failures;
- restores the interrupt flag and stops if interrupted while sleeping.

Test it with an action that fails twice with `IOException` then succeeds, and one that throws `IllegalArgumentException`.

````hint title="Hint"
Loop `for (int attempt = 1; ; attempt++)`. In the `catch (Exception e)`, check `isTransient(e)`; if not transient, rethrow (wrap checked ones). Keep a `List<Exception>` of failures; when attempts run out, create the exhausted exception with the last one as cause and `addSuppressed` the others.
````

````solution title="Solution"
```java title="RetryDemo.java" file="RetryDemo.java"
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.atomic.AtomicInteger;

public class RetryDemo {
    static class TransientException extends RuntimeException {
        TransientException(String message) {
            super(message);
        }
    }

    static class RetriesExhaustedException extends RuntimeException {
        RetriesExhaustedException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    static <T> T withRetry(Callable<T> action, int maxAttempts, long baseDelayMs) throws Exception {
        List<Exception> failures = new ArrayList<>();
        for (int attempt = 1; ; attempt++) {
            try {
                return action.call();
            } catch (Exception e) {
                if (!isTransient(e)) {
                    throw e;                                       // bugs and permanent errors: no retry
                }
                failures.add(e);
                if (attempt == maxAttempts) {
                    RetriesExhaustedException ex = new RetriesExhaustedException("gave up after " + attempt + " attempts", e);
                    failures.subList(0, failures.size() - 1).forEach(ex::addSuppressed);
                    throw ex;
                }
                long delay = baseDelayMs * (1L << (attempt - 1));
                System.out.println("  attempt " + attempt + " failed (" + e.getMessage() + "), retrying in " + delay + " ms");
                try {
                    Thread.sleep(delay);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw ie;
                }
            }
        }
    }

    static boolean isTransient(Exception e) {
        return e instanceof IOException || e instanceof TransientException;
    }

    public static void main(String[] args) throws Exception {
        AtomicInteger calls = new AtomicInteger();
        String result = withRetry(() -> {
            if (calls.incrementAndGet() < 3) {
                throw new IOException("timeout #" + calls.get());
            }
            return "ok on call " + calls.get();
        }, 5, 10);
        System.out.println("result: " + result);

        try {
            withRetry(() -> {
                throw new IllegalArgumentException("bad request");
            }, 5, 10);
        } catch (IllegalArgumentException e) {
            System.out.println("not retried: " + e.getMessage());
        }

        try {
            withRetry(() -> {
                throw new TransientException("service unavailable");
            }, 3, 5);
        } catch (RetriesExhaustedException e) {
            System.out.println(e.getMessage() + ", cause: " + e.getCause().getMessage() + ", suppressed: " + e.getSuppressed().length);
        }
    }
}
```

```text title="Output" output="RetryDemo.java"
  attempt 1 failed (timeout #1), retrying in 10 ms
  attempt 2 failed (timeout #2), retrying in 20 ms
result: ok on call 3
not retried: bad request
  attempt 1 failed (service unavailable), retrying in 5 ms
  attempt 2 failed (service unavailable), retrying in 10 ms
gave up after 3 attempts, cause: service unavailable, suppressed: 2
```

Production versions add jitter (random spread of the delay), a total time budget, and only retry idempotent operations. The full [retry exercise](problem:retry-with-backoff) builds this out.
````

## Knowledge check

```quiz
? Where should an exception usually be logged?
+ Once, where it is finally handled (the boundary)
- In every catch block it passes through
- Nowhere; stack traces are enough
> Wrap with context as it propagates; log once.

? A method catches InterruptedException but can't rethrow it. What should it do?
+ Call Thread.currentThread().interrupt() and stop its work
- Ignore it and continue
- Throw a RuntimeException without restoring the flag
> Restoring the flag preserves the cancellation request.

? A task submitted with executor.submit() throws. When do you see the exception?
+ When you call future.get(), wrapped in ExecutionException
- Immediately, in the submitting thread
- Never
> FutureTask stores the exception.

? Which failure should a retry loop retry?
+ A timeout calling an idempotent service
- IllegalArgumentException from validation
- NullPointerException
> Retry only transient failures of operations that are safe to repeat.

? Why avoid exceptions for expected outcomes in hot paths?
+ Creating exceptions captures stack traces, which is expensive
- Exceptions can't carry data
- The compiler forbids it
> Use Optional or result types for frequent expected outcomes.
```

## Key takeaways

- **Fail fast**, **never swallow**, catch only where you can **act**, and **log once at the boundary**.
- **Translate with the cause**; expose **codes and safe messages**, keep details in logs.
- **Restore interrupts**; retry only **transient + idempotent** operations with backoff and limits.
- Prefer **`Optional`/result types** for expected outcomes; exceptions for the exceptional.
- In concurrent code, know where exceptions go: `Future.get()`, uncaught handlers, `CompletableFuture` chains.
