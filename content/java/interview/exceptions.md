# Exceptions

### Checked vs unchecked exceptions
`id: checked-vs-unchecked` `level: beginner` `kind: concept` `lessons: exception-hierarchy`

#### Hints
1. Which class's subclasses are exempt from the compiler's rule?
2. Is the difference visible at run time?

#### Answer
**Checked** exceptions are `Exception` and its subclasses **except** `RuntimeException`; the compiler enforces *catch-or-declare* for them. **Unchecked** exceptions are `RuntimeException`, `Error` and their subclasses; no compile-time requirement. At run time there's no difference — it's purely a compiler rule.

Use checked exceptions for recoverable conditions every caller should consider (rarely, in modern code); unchecked for programming errors (`IllegalArgumentException`, `IllegalStateException`, `NullPointerException`) and most domain/infrastructure failures handled at a boundary.

#### Why other answers fall short
- **"Checked exceptions happen at compile time."** All exceptions occur at run time; "checked" refers to compile-time checking of declarations.
- **"Errors are checked."** `Error` is unchecked.

#### Follow-up
**Why do many modern frameworks prefer unchecked exceptions?** Checked exceptions leak through every signature, don't compose with lambdas/streams, and are usually handled far from where they're thrown — at a request boundary — so forcing every intermediate method to declare them adds noise without improving handling.

### What happens when an exception is thrown from `finally`?
`id: exception-from-finally` `level: intermediate` `kind: concept` `tricky` `lessons: try-catch-finally,try-with-resources`

#### Hints
1. If the `try` block already threw, what happens to that exception?
2. What does try-with-resources do differently for `close()` failures?

#### Answer
The exception from `finally` **replaces** whatever was in flight: if the `try` (or `catch`) threw exception A and `finally` throws B, the caller receives **B** and A is **lost** — not even attached as suppressed. Likewise a `return` in `finally` discards an in-flight exception entirely.

That's why clean-up code shouldn't throw, and why **try-with-resources** exists: when the body throws A and `close()` throws B, it keeps **A** as primary and records B with `A.addSuppressed(B)`.

#### Why other answers fall short
- **"Both exceptions are thrown."** A method can only complete with one exception.
- **"The original exception is thrown and the finally exception is ignored."** It's the other way round for plain `finally`.
- **"Java chains them automatically."** Only try-with-resources records suppressed exceptions automatically.

#### Follow-up
**How would you preserve both in a manual `finally`?** Catch the clean-up exception and `primary.addSuppressed(cleanup)` when a primary exception exists — exactly what try-with-resources generates.

### What does this print?
`id: finally-return-output` `level: intermediate` `kind: output` `tricky` `lessons: try-catch-finally`

```java
static int count = 0;
static int f() {
    try {
        count++;
        return count;
    } finally {
        count += 10;
    }
}
public static void main(String[] args) {
    System.out.println(f() + " " + count);
}
```

#### Hints
1. When is the return value computed relative to `finally`?
2. Is `count` a local or a field?

#### Answer
`1 11`.

`return count;` evaluates `count` (now 1) and stores the value before the `finally` block runs. `finally` then adds 10 to the **field**, so `count` becomes 11, but `f()` still returns the saved 1. String concatenation evaluates `f()` first (left to right), then reads `count`.

#### Why other answers fall short
- **`11 11`** — assumes `finally` runs before the return value is captured.
- **`1 1`** — assumes `finally` can't affect anything after `return`; it runs and changes the field.

#### Follow-up
**What if `finally` contained `return count;`?** Then `f()` returns 11 — a `return` in `finally` overrides the `try`'s value.

### Can an overriding method throw a broader checked exception?
`id: override-throws-rule` `level: intermediate` `kind: concept` `lessons: polymorphism-and-overriding,exception-hierarchy`

```java
class Reader { void read() throws IOException { } }
class FileReader2 extends Reader {
    @Override void read() throws Exception { }     // ?
}
```

#### Hints
1. What can a caller holding a `Reader` reference assume about `read()`?
2. Do unchecked exceptions follow the same rule?

#### Answer
No — it doesn't compile. An override may throw **the same, narrower, or no** checked exceptions, never new or broader ones. Callers using a `Reader` reference only handle `IOException`; if the subclass could throw `Exception`, the compiler's guarantee would be broken (Liskov substitution for exceptions). Unchecked exceptions are unrestricted.

Valid overrides: `void read() throws IOException`, `void read() throws FileNotFoundException`, `void read()`.

#### Why other answers fall short
- **"Yes, overriding can change the `throws` clause freely."** Only by narrowing.
- **"Overrides can't throw any exception."** They can throw the same/narrower checked ones and any unchecked ones.

#### Follow-up
**Does the same rule apply to constructors?** No — constructors aren't overridden. A subclass constructor must declare (or handle) whatever checked exceptions the superclass constructor it calls can throw, and may add more.

### `ClassNotFoundException` vs `NoClassDefFoundError`
`id: cnfe-vs-ncdfe` `level: intermediate` `kind: concept` `tricky` `lessons: exception-hierarchy,class-loading`

#### Hints
1. Which one is thrown when you ask for a class **by name**?
2. Which one happens when a class that existed at **compile time** is missing or broken at run time?

#### Answer
- **`ClassNotFoundException`** — a **checked exception**. Thrown when code explicitly loads a class **by name** (`Class.forName`, `ClassLoader.loadClass`, deserialization) and no class loader can find it. The caller asked dynamically and can handle it.
- **`NoClassDefFoundError`** — an **Error**. Thrown when the JVM needs a class that was present when the code was **compiled** but can't be loaded now: a JAR missing from the runtime class path, a version mismatch, or a class whose **static initialiser failed earlier** (the first attempt throws `ExceptionInInitializerError`; later uses throw `NoClassDefFoundError: Could not initialize class X`).

#### Why other answers fall short
- **"They're the same, one is just newer."** Different types, different causes, different handling.
- **"Both are errors."** `ClassNotFoundException` is a checked exception.

#### Follow-up
**How do you diagnose a `NoClassDefFoundError` in production?** Look for an earlier `ExceptionInInitializerError` in the logs, check the deployed class path (`-verbose:class`, `jcmd <pid> VM.class_hierarchy`), and compare dependency versions (`mvn dependency:tree`).

### Should you catch `OutOfMemoryError` or `Throwable`?
`id: catch-throwable` `level: advanced` `kind: scenario` `lessons: exception-hierarchy,exception-best-practices,outofmemory-and-stackoverflow`

A teammate wraps a batch job in `catch (Throwable t) { log.error("failed", t); }` and lets the loop continue with the next batch. Good idea?

#### Hints
1. What state is the JVM in after an `OutOfMemoryError` or `StackOverflowError`?
2. What else does `Throwable` include besides exceptions?

#### Answer
Catching `Throwable` (or `Error`) to log at the **outermost** boundary of a thread is reasonable — but **continuing** is not. After `OutOfMemoryError` the heap may be exhausted mid-operation: data structures can be half-updated, locks may be held, other threads may be failing too; `StackOverflowError` similarly leaves operations incomplete. `Throwable` also catches `ThreadDeath`/linkage errors and `AssertionError`s that indicate bugs.

Better: catch `Exception` (or specific exceptions) per batch to continue past bad data; let `Error`s propagate; log at the top level and **exit**, letting the orchestrator restart the process. Configure `-XX:+HeapDumpOnOutOfMemoryError` and `-XX:+ExitOnOutOfMemoryError` (or `CrashOnOutOfMemoryError`) so you get evidence and a clean restart.

#### Why other answers fall short
- **"Never catch Throwable anywhere."** A last-resort handler that logs before dying is useful.
- **"Catching OOM lets you free memory and continue."** Only in very narrow, controlled cases (e.g. failing to allocate one giant buffer); in general the process state is unknown.

#### Follow-up
**Does catching `Exception` catch `InterruptedException`?** Yes — another reason broad catches are dangerous: they can swallow interrupts unless you restore the flag.

### Find the bug: the shutdown never finishes
`id: swallowed-interrupt` `level: intermediate` `kind: debugging` `lessons: exception-best-practices,interrupts-and-cancellation`

```java
executor.submit(() -> {
    while (!Thread.currentThread().isInterrupted()) {
        try {
            process(queue.take());
        } catch (InterruptedException e) {
            log.warn("interrupted, continuing");
        }
    }
});
// later: executor.shutdownNow(); executor.awaitTermination(...) times out
```

#### Hints
1. What does throwing `InterruptedException` do to the thread's interrupt flag?
2. What does the loop condition check next?

#### Answer
When `take()` throws `InterruptedException`, the JVM has **cleared** the interrupt flag. The catch block logs and swallows it, so the `while` condition sees `isInterrupted() == false` and the loop continues forever — `shutdownNow()`'s interrupt is lost and `awaitTermination` times out.

Fix: restore the flag (`Thread.currentThread().interrupt();`) and/or `return`/`break` from the loop:

```java
} catch (InterruptedException e) {
    Thread.currentThread().interrupt();   // preserve the request
    return;                               // and stop
}
```

#### Why other answers fall short
- **"Use `Thread.interrupted()` in the condition."** That *clears* the flag too; the issue is the swallowed exception.
- **"Increase the `awaitTermination` timeout."** The task will never stop.

#### Follow-up
**Why does Java clear the flag when throwing `InterruptedException`?** The exception itself now carries the signal; clearing avoids repeated exceptions. Code that can't propagate the exception is responsible for re-setting the flag.

### What is printed, and in what order?
`id: nested-try-order` `level: advanced` `kind: output` `lessons: try-catch-finally`

```java
try {
    try {
        throw new IllegalStateException("A");
    } catch (IllegalArgumentException e) {
        System.out.print("inner-catch ");
    } finally {
        System.out.print("inner-finally ");
    }
} catch (RuntimeException e) {
    System.out.print("outer-catch:" + e.getMessage() + " ");
} finally {
    System.out.print("outer-finally");
}
```

#### Hints
1. Does the inner `catch` match `IllegalStateException`?
2. When does the inner `finally` run relative to the outer `catch`?

#### Answer
`inner-finally outer-catch:A outer-finally`

The inner `catch` handles only `IllegalArgumentException`, so the `IllegalStateException` propagates out of the inner `try` — but the inner `finally` runs **first**, during unwinding. Then the outer `catch (RuntimeException)` matches, and finally the outer `finally` runs.

#### Why other answers fall short
- **`inner-catch …`** — `IllegalStateException` isn't an `IllegalArgumentException` (they're siblings).
- **`outer-catch:A inner-finally …`** — inner `finally` blocks run before control reaches outer handlers.

#### Follow-up
**What if the inner `finally` threw `new RuntimeException("B")`?** The outer `catch` would print `outer-catch:B`: the exception from `finally` replaces `A`.

### Design error handling for a REST API
`id: rest-error-strategy` `level: advanced` `kind: scenario` `lessons: exception-best-practices,custom-exceptions`

Your order service returns inconsistent errors: sometimes stack traces, sometimes `500` for "order not found", and logs show the same exception several times. How do you fix it?

#### Hints
1. Where should exceptions turn into HTTP responses and log lines?
2. What should clients receive versus what goes into logs?

#### Answer
1. **Define a small exception vocabulary**: e.g. `OrderNotFoundException`, `ValidationException` (with field errors), `ConflictException`, `UpstreamUnavailableException` — unchecked, carrying error codes and ids.
2. **Translate at infrastructure boundaries** (repository/HTTP clients) with causes attached; **don't log** in inner layers.
3. **One global handler** (`@RestControllerAdvice`) maps types to status codes — 404, 400/422, 409, 503 (with `Retry-After`), and everything unexpected to 500 — returning a consistent body (RFC 9457 *problem details*: `type`, `title`, `status`, `detail`, plus a stable `code` and a request/trace id).
4. **Log once there**: expected client errors at `WARN`/`INFO` without stack traces; unexpected ones at `ERROR` with the full stack trace and the request id (MDC).
5. **Never return stack traces, SQL, or internal messages**; clients use the error code, support uses the trace id to find the log entry.

#### Why other answers fall short
- **"Catch `Exception` in every controller method."** Duplicated, inconsistent mapping.
- **"Return `e.getMessage()` to the client."** Leaks internals and couples clients to unstable text.

#### Follow-up
**How do you make retries by clients safe for `POST /payments`?** Require an `Idempotency-Key` header; store the outcome per key and replay it for duplicates, so a retried request after a timeout doesn't charge twice.
