## Concept explanation

### What it is

An **exception** is an object describing an abnormal event that interrupts the normal flow of a program. When code **throws** one, the JVM stops executing the current statement and searches up the call stack for a matching **handler** (`catch`). If none is found, the thread dies and the exception's stack trace is printed.

Every throwable object is an instance of **`java.lang.Throwable`**, which has two direct subclasses:

| Branch | Meaning | Examples | Should you catch it? |
|---|---|---|---|
| **`Error`** | serious problems in the JVM or environment that applications usually can't recover from | `OutOfMemoryError`, `StackOverflowError`, `NoClassDefFoundError`, `AssertionError`, `ExceptionInInitializerError` | almost never (log at a top-level boundary and exit/restart) |
| **`Exception`** | conditions an application might want to handle | `IOException`, `SQLException`, `InterruptedException`, `TimeoutException` | yes, where you can do something useful |
| ↳ **`RuntimeException`** (subclass of `Exception`) | usually **programming errors** or violated preconditions | `NullPointerException`, `IllegalArgumentException`, `IllegalStateException`, `IndexOutOfBoundsException`, `ClassCastException`, `ArithmeticException`, `UnsupportedOperationException`, `ConcurrentModificationException` | usually fix the bug; catch at boundaries |

### Checked vs unchecked

- **Checked exceptions**: `Exception` and its subclasses **except** `RuntimeException`. The compiler forces every method that may throw one to either **catch** it or **declare** it with `throws` (the *catch-or-specify* rule).
- **Unchecked exceptions**: `RuntimeException`, `Error` and their subclasses. The compiler doesn't enforce anything.

```java
void load(Path p) throws IOException {         // checked: must be declared or caught
    Files.readString(p);
}
void setAge(int age) {
    if (age < 0) throw new IllegalArgumentException("age < 0");   // unchecked: no declaration needed
}
```

The distinction is **purely a compile-time rule**; the JVM treats all throwables the same way.

### Why it exists

Exceptions separate **error handling from the main logic** (no `if (rc != 0)` after every call), carry **rich information** (type, message, cause, stack trace), and **propagate automatically** to the level that can handle them. Checked exceptions add a design statement: "callers must think about this recoverable failure" (a missing file, a network timeout).

### When to use which kind

- **Checked**: recoverable conditions the caller can reasonably handle and that aren't programming errors — but use sparingly; they spread through signatures and don't compose with lambdas/streams.
- **Unchecked**: precondition violations (`IllegalArgumentException`), illegal states (`IllegalStateException`), unsupported operations — and, in modern code, most domain and infrastructure failures (Spring wraps checked JDBC exceptions in unchecked `DataAccessException`s).
- **Errors**: don't throw or catch them in application code (except `AssertionError` from failed invariants in tests/asserts).

## Internal working

- **Creating** an exception calls `Throwable`'s constructor, which by default calls **`fillInStackTrace()`**: the JVM walks the current thread's stack and records each frame (class, method, file, line). This is the expensive part — far more than `new` itself. (HotSpot captures it lazily in a compact form and materialises `StackTraceElement`s only if you call `getStackTrace()`/`printStackTrace()`.)
- **Throwing** compiles to the `athrow` bytecode. The JVM consults the current method's **exception table** — entries of `(start pc, end pc, handler pc, catch type)` generated from `try`/`catch` — and jumps to the first entry whose range covers the throwing instruction and whose type matches. If none matches, the frame is popped and the search continues in the caller (**stack unwinding**).
- **No match anywhere** on the thread → the thread's `UncaughtExceptionHandler` (default: print the stack trace to `System.err`) runs and the thread terminates. If it's the main thread and no non-daemon threads remain, the JVM exits with status 1.
- **Implicit exceptions**: the JVM itself throws `NullPointerException` (null dereference), `ArithmeticException` (integer `/ 0`), `ArrayIndexOutOfBoundsException`, `ClassCastException` (`checkcast`), `NegativeArraySizeException`, `ArrayStoreException`, and errors like `StackOverflowError` and `OutOfMemoryError`.
- **"Try blocks are free"**: a `try` costs nothing when no exception is thrown — it's just an entry in the exception table. Only throwing is expensive.
- `Throwable` fields: `detailMessage`, `cause`, `stackTrace`, `suppressedExceptions`. Constructors `(message)`, `(message, cause)`, `(cause)`, and a protected one that can disable suppression and stack traces.

## Visual representation

```text title="The Throwable hierarchy"
                                  Throwable
                     (message, cause, stack trace, suppressed)
                      /                                  \
               Error (unchecked)                      Exception (checked)
              /        |        \                    /        |         \
   OutOfMemoryError  StackOverflowError  ...   IOException  SQLException  InterruptedException ...
   NoClassDefFoundError  AssertionError             |
                                           FileNotFoundException
                                                       RuntimeException (unchecked)
                                       /            |             |              \
                         NullPointerException  IllegalArgumentException  IllegalStateException  ...
                                                    |
                                          NumberFormatException

  checked   = Exception and its subclasses, EXCEPT RuntimeException and its subclasses
  unchecked = RuntimeException, Error, and all their subclasses
```

## Java code example

```java title="ExceptionHierarchyDemo.java" file="ExceptionHierarchyDemo.java"
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;

public class ExceptionHierarchyDemo {
    public static void main(String[] args) {
        List<Throwable> samples = List.of(
                new FileNotFoundException("config.yml"),
                new IllegalArgumentException("age must be >= 0"),
                new NumberFormatException("For input string: \"x\""),
                new UncheckedIOException(new IOException("disk")),
                new InterruptedException("stopped"),
                new StackOverflowError(),
                new OutOfMemoryError("Java heap space"));
        for (Throwable t : samples) {
            System.out.printf("%-32s %-10s %s%n", t.getClass().getSimpleName(), kind(t), chain(t.getClass()));
        }

        // Exceptions the JVM throws by itself
        Runnable[] jvmThrows = {
            () -> { String s = null; s.length(); },
            () -> { int zero = 0; System.out.println(10 / zero); },
            () -> { int[] a = new int[2]; a[2] = 1; },
            () -> { Object o = "text"; Integer i = (Integer) o; },
            () -> { Object[] arr = new String[1]; arr[0] = 1; },
        };
        for (Runnable r : jvmThrows) {
            try {
                r.run();
            } catch (RuntimeException e) {
                System.out.println("JVM threw " + e.getClass().getSimpleName());
            }
        }

        // An uncaught exception ends only the thread that threw it
        Thread worker = new Thread(() -> {
            throw new IllegalStateException("worker failed");
        });
        worker.setUncaughtExceptionHandler((t, e) -> System.out.println("handler for " + t.getName() + ": " + e.getMessage()));
        worker.setName("worker-1");
        worker.start();
        try {
            worker.join();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        System.out.println("main still running");
    }

    static String kind(Throwable t) {
        if (t instanceof Error) {
            return "error";
        }
        return t instanceof RuntimeException ? "unchecked" : "CHECKED";
    }

    static String chain(Class<?> type) {
        StringBuilder sb = new StringBuilder();
        for (Class<?> c = type.getSuperclass(); c != Object.class; c = c.getSuperclass()) {
            sb.append(" < ").append(c.getSimpleName());
        }
        return sb.toString().trim();
    }
}
```

## Output

```text title="Output" output="ExceptionHierarchyDemo.java"
FileNotFoundException            CHECKED    < IOException < Exception < Throwable
IllegalArgumentException         unchecked  < RuntimeException < Exception < Throwable
NumberFormatException            unchecked  < IllegalArgumentException < RuntimeException < Exception < Throwable
UncheckedIOException             unchecked  < RuntimeException < Exception < Throwable
InterruptedException             CHECKED    < Exception < Throwable
StackOverflowError               error      < VirtualMachineError < Error < Throwable
OutOfMemoryError                 error      < VirtualMachineError < Error < Throwable
JVM threw NullPointerException
JVM threw ArithmeticException
JVM threw ArrayIndexOutOfBoundsException
JVM threw ClassCastException
JVM threw ArrayStoreException
handler for worker-1: worker failed
main still running
```

- Whether an exception is checked depends only on whether `RuntimeException` (or `Error`) appears in its superclass chain. `NumberFormatException` is a `RuntimeException` via `IllegalArgumentException`.
- `UncheckedIOException` (Java 8) wraps an `IOException` in an unchecked type — handy inside lambdas.
- The JVM raised five different runtime exceptions on its own, with no `throw` statement in our code.
- The worker thread's uncaught exception went to its handler and killed only that thread; `main` continued.

## Real-world application

- **API design**: libraries decide what callers must handle. `java.io`/`java.net`/JDBC use checked exceptions; most modern frameworks (Spring, Hibernate, AWS SDK v2, gRPC) expose unchecked ones and document them.
- **Validation**: `IllegalArgumentException`/`IllegalStateException`/`NullPointerException` (`Objects.requireNonNull`) signal broken contracts early.
- **Thread pools and servers** rely on boundaries: a servlet container catches exceptions per request; an `ExecutorService` captures them in the `Future`; uncaught exceptions in raw threads go to the `UncaughtExceptionHandler` — set one so failures are logged instead of disappearing.
- **Operations**: `OutOfMemoryError` and `StackOverflowError` usually mean the process should be restarted (`-XX:+ExitOnOutOfMemoryError` in containers) after collecting diagnostics.

## Common mistakes

- **`catch (Exception e)` or `catch (Throwable t)` everywhere** — hides bugs and catches `InterruptedException`, `Error`s and more.
- **Catching `Error`s** (like `OutOfMemoryError`) and continuing as if nothing happened.
- **Declaring `throws Exception`** on every method, which defeats the purpose of checked exceptions.
- **Using checked exceptions for programming errors** (bad arguments) or unchecked ones for genuinely expected, recoverable situations without documenting them.
- **Thinking `RuntimeException` means "happens at run time" and checked means "at compile time"** — all exceptions happen at run time; "checked" refers to the compiler's checking of declarations.
- **Forgetting that threads swallow uncaught exceptions silently** unless a handler or the default output is watched.

## Interview questions

**Q1. What's the difference between checked and unchecked exceptions?**

````reveal title="Answer"
Checked exceptions are `Exception` and its subclasses other than `RuntimeException`; the compiler requires methods that can throw them to catch them or declare them with `throws`. Unchecked exceptions are `RuntimeException`, `Error` and their subclasses; no such requirement. It's purely a compile-time rule — at run time all throwables propagate identically. Checked = recoverable conditions the caller should consider; unchecked = programming errors or failures callers usually can't handle locally.
````

**Q2. What's the difference between `Error` and `Exception`?**

````reveal title="Answer"
Both extend `Throwable`. `Error` represents serious problems an application generally shouldn't try to catch — JVM resource exhaustion (`OutOfMemoryError`, `StackOverflowError`), linkage problems (`NoClassDefFoundError`), failed assertions. `Exception` represents conditions an application might handle. Errors are unchecked.
````

**Q3. Is `try` expensive? What makes exceptions slow?**

````reveal title="Answer"
A `try` block costs nothing when no exception is thrown — it only adds exception-table entries. Throwing is the costly part, mainly because constructing the exception captures the stack trace (`fillInStackTrace`), and unwinding may deoptimise compiled code. Don't use exceptions for normal control flow; for very hot "expected failure" paths, return a result object or reuse a stackless exception.
````

**Q4. What happens to an exception nobody catches?**

````reveal title="Answer"
It unwinds the whole stack of its thread; the thread's `UncaughtExceptionHandler` (or the thread group's, or the default handler) is invoked — by default printing the stack trace to `System.err` — and the thread terminates. Other threads keep running; the JVM exits when no non-daemon threads remain (exit code 1 if the main thread died with an exception).
````

## Hands-on exercise

Write `static String classify(Class<? extends Throwable> type)` that returns `"checked"`, `"unchecked"` or `"error"`, and use it to classify: `IOException`, `SQLException`, `TimeoutException`, `NullPointerException`, `DateTimeParseException`, `NoSuchElementException`, `ClassNotFoundException`, `NoClassDefFoundError`, `CloneNotSupportedException`. Predict each answer first — the class-not-found pair is a classic trap.

````hint title="Hint"
`Error.class.isAssignableFrom(type)` and `RuntimeException.class.isAssignableFrom(type)` decide it. `ClassNotFoundException` is checked (reflection by name); `NoClassDefFoundError` is an error (class present at compile time, missing at run time).
````

````solution title="Solution"
```java title="Classify.java" file="Classify.java"
import java.io.IOException;
import java.sql.SQLException;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.concurrent.TimeoutException;

public class Classify {
    static String classify(Class<? extends Throwable> type) {
        if (Error.class.isAssignableFrom(type)) {
            return "error";
        }
        return RuntimeException.class.isAssignableFrom(type) ? "unchecked" : "checked";
    }

    public static void main(String[] args) {
        List<Class<? extends Throwable>> types = List.of(IOException.class, SQLException.class, TimeoutException.class,
                NullPointerException.class, DateTimeParseException.class, NoSuchElementException.class,
                ClassNotFoundException.class, NoClassDefFoundError.class, CloneNotSupportedException.class);
        for (Class<? extends Throwable> t : types) {
            System.out.println(t.getSimpleName() + " -> " + classify(t));
        }
    }
}
```

```text title="Output" output="Classify.java"
IOException -> checked
SQLException -> checked
TimeoutException -> checked
NullPointerException -> unchecked
DateTimeParseException -> unchecked
NoSuchElementException -> unchecked
ClassNotFoundException -> checked
NoClassDefFoundError -> error
CloneNotSupportedException -> checked
```
````

## Knowledge check

```quiz
? Which is a checked exception?
- IllegalStateException
+ IOException
- OutOfMemoryError
> IOException extends Exception but not RuntimeException.

? What makes an exception unchecked?
+ It extends RuntimeException or Error
- It is thrown by the JVM rather than by user code
- It has no message
> Checkedness depends only on the class hierarchy.

? Which part of creating an exception is the most expensive?
- Allocating the object
+ Capturing the stack trace (fillInStackTrace)
- Entering the try block
> try blocks are free when nothing is thrown.

? A thread throws an exception nobody catches. What happens to other threads?
+ They keep running; only the throwing thread terminates
- The JVM exits immediately
- All threads are interrupted
> Uncaught exceptions are per thread.

? NoClassDefFoundError is...
- a checked exception
+ an Error
- a RuntimeException
> It extends LinkageError, which extends Error.
```

## Key takeaways

- Everything throwable extends **`Throwable`**: **`Error`** (don't handle) and **`Exception`** (may handle), with **`RuntimeException`** under `Exception`.
- **Checked** = `Exception` minus `RuntimeException`; the compiler enforces **catch-or-declare**. **Unchecked** = `RuntimeException` + `Error`.
- Throwing searches the **exception table**, unwinding frames until a handler matches; uncaught → thread dies via its handler.
- `try` is free; **stack-trace capture** makes throwing costly.
- Use unchecked exceptions for programming errors; checked ones sparingly for recoverable conditions.
