## Concept explanation

### What it is

**try-with-resources** (Java 7) declares one or more **resources** in parentheses after `try`; each is **closed automatically** when the block exits, normally or by exception:

```java
try (BufferedReader in = Files.newBufferedReader(path);
     BufferedWriter out = Files.newBufferedWriter(target)) {
    in.lines().map(String::toUpperCase).forEach(line -> write(out, line));
}   // out.close(), then in.close() - always, in reverse order
```

A resource is any object implementing **`AutoCloseable`** (`void close() throws Exception`). Its sub-interface **`Closeable`** (`void close() throws IOException`, from `java.io`) adds the requirement that `close()` be **idempotent** (calling it twice is harmless).

Rules:

- Resources are closed in **reverse order of declaration** (last opened, first closed).
- Resource variables are implicitly **`final`**. Since **Java 9** you can also list an existing **effectively final** variable: `try (existingReader) { … }`.
- A resource whose initialiser yields `null` is simply **not closed**.
- A `catch` or `finally` attached to the statement runs **after** the resources are closed.

### Suppressed exceptions

If the body throws exception **A** and then `close()` throws **B**, Java keeps **A** as the primary exception and records **B** via `A.addSuppressed(B)`. Nothing is lost: `getSuppressed()` returns the clean-up failures, and `printStackTrace()` prints them under `Suppressed:`. If the body succeeds and `close()` throws, B propagates as the primary exception.

### Why it exists

Before Java 7, correct clean-up looked like this — and was routinely written wrong:

```java
InputStream in = null;
try {
    in = new FileInputStream(file);
    // use in
} finally {
    if (in != null) {
        try { in.close(); } catch (IOException ignored) { }   // or: close failure hides the real one
    }
}
```

Problems: verbose, easy to forget, nested resources multiply the boilerplate, and an exception from `close()` in `finally` **replaces** the body's exception (see [try, catch, finally](lesson:try-catch-finally)). try-with-resources fixes all of it.

### When to use it

For **anything that holds a resource beyond memory**: files and streams, sockets, JDBC `Connection`/`PreparedStatement`/`ResultSet`, locks you wrap in an `AutoCloseable`, `ExecutorService` (`AutoCloseable` since Java 19), `Stream`s backed by I/O (`Files.lines`, `Files.walk`), HTTP responses, temporary directories, tracing spans, `MDC` scopes.

## Internal working

`javac` desugars (JLS 14.20.3) a single-resource statement roughly into:

```java
final R r = init;
Throwable primary = null;
try {
    body;
} catch (Throwable t) {
    primary = t;
    throw t;
} finally {
    if (r != null) {
        if (primary != null) {
            try {
                r.close();
            } catch (Throwable suppressed) {
                primary.addSuppressed(suppressed);     // keep the clean-up failure
            }
        } else {
            r.close();                                 // body succeeded: close() failure propagates
        }
    }
}
```

Multiple resources nest: the second resource's statement is the body of the first, which produces reverse-order closing and correct handling if a later resource's **initialiser** fails (earlier ones are still closed). Modern `javac` emits slightly optimised bytecode, but the semantics are exactly these.

`Throwable.addSuppressed` stores exceptions in a list; the `Throwable(message, cause, enableSuppression, writableStackTrace)` constructor can disable suppression for special exceptions (e.g. preallocated `OutOfMemoryError`s).

## Visual representation

```text title="Close order and suppressed exceptions"
  try (A a = openA(); B b = openB(); C c = openC()) {
      body();                 // throws X
  }

  timeline:  openA  openB  openC  body -> X
             c.close() -> throws Y    X.addSuppressed(Y)
             b.close() -> ok
             a.close() -> throws Z    X.addSuppressed(Z)
  caller receives X  with  getSuppressed() = [Y, Z]

  if openC() itself throws W:  b.close(), a.close() still run; W is primary
```

## Java code example

```java title="TryWithResourcesDemo.java" file="TryWithResourcesDemo.java"
import java.io.BufferedReader;
import java.io.IOException;
import java.io.StringReader;
import java.util.Arrays;
import java.util.concurrent.locks.ReentrantLock;

public class TryWithResourcesDemo {
    @SuppressWarnings("try")        // some demo resources are deliberately unused in their blocks
    public static void main(String[] args) throws Exception {
        // 1. Reverse close order
        try (Res a = new Res("A", false); Res b = new Res("B", false)) {
            System.out.println("body uses " + a.name + " and " + b.name);
        }

        // 2. Body fails and close fails: the close failure is SUPPRESSED, not lost
        try (Res c = new Res("C", true)) {
            throw new IllegalStateException("body failed");
        } catch (IllegalStateException e) {
            System.out.println("primary: " + e.getMessage() + ", suppressed: "
                    + Arrays.stream(e.getSuppressed()).map(Throwable::getMessage).toList());
        }

        // 3. Body succeeds, close fails: the close exception propagates
        try (Res d = new Res("D", true)) {
            System.out.println("body ok with " + d.name);
        } catch (IllegalStateException e) {
            System.out.println("from close: " + e.getMessage());
        }

        // 4. If a later resource fails to open, earlier ones are still closed
        try (Res e = new Res("E", false); Res f = Res.failingToOpen("F")) {
            System.out.println("not reached");
        } catch (IllegalStateException ex) {
            System.out.println("open failed: " + ex.getMessage());
        }

        // 5. Java 9: an existing effectively final variable; catch runs AFTER close
        Res g = new Res("G", false);
        try (g) {
            throw new IllegalArgumentException("oops");
        } catch (IllegalArgumentException ex) {
            System.out.println("catch runs after close, g closed: " + g.closed);
        }

        // 6. null resources are skipped
        try (Res nothing = null) {
            System.out.println("null resource: body runs, no close attempted");
        }

        // 7. A real Closeable and a lock adapter
        try (BufferedReader reader = new BufferedReader(new StringReader("line 1\nline 2"))) {
            System.out.println("first line: " + reader.readLine());
        }
        ReentrantLock lock = new ReentrantLock();
        try (LockScope scope = LockScope.acquire(lock)) {
            System.out.println("lock held: " + lock.isHeldByCurrentThread());
        }
        System.out.println("lock held after block: " + lock.isHeldByCurrentThread());
    }
}

class Res implements AutoCloseable {
    final String name;
    private final boolean failOnClose;
    boolean closed;

    Res(String name, boolean failOnClose) {
        this.name = name;
        this.failOnClose = failOnClose;
        System.out.println("open " + name);
    }

    static Res failingToOpen(String name) {
        throw new IllegalStateException("cannot open " + name);
    }

    @Override
    public void close() {
        closed = true;
        System.out.println("close " + name);
        if (failOnClose) {
            throw new IllegalStateException("close " + name + " failed");
        }
    }
}

/** Turns lock/unlock into a try-with-resources scope. */
final class LockScope implements AutoCloseable {
    private final ReentrantLock lock;

    private LockScope(ReentrantLock lock) {
        this.lock = lock;
    }

    static LockScope acquire(ReentrantLock lock) {
        lock.lock();
        return new LockScope(lock);
    }

    @Override
    public void close() {
        lock.unlock();                                   // no checked exception: callers need no catch
    }
}
```

## Output

```text title="Output" output="TryWithResourcesDemo.java"
open A
open B
body uses A and B
close B
close A
open C
close C
primary: body failed, suppressed: [close C failed]
open D
body ok with D
close D
from close: close D failed
open E
close E
open failed: cannot open F
open G
close G
catch runs after close, g closed: true
null resource: body runs, no close attempted
first line: line 1
lock held: true
lock held after block: false
```

- `B` (opened last) closed first.
- When both the body and `close()` failed, the caller got the body's exception with the close failure attached as suppressed — the reverse of what a hand-written `finally` would do.
- When only `close()` failed, its exception was the one thrown.
- `F` failed while opening, yet `E` was still closed.
- The `catch` clause ran after `G` was closed.
- `LockScope.close()` declares no checked exception, so callers don't need a `catch` — narrow `close()` signatures make resources nicer to use.

## Real-world application

- **JDBC**: `try (Connection c = dataSource.getConnection(); PreparedStatement ps = c.prepareStatement(sql); ResultSet rs = ps.executeQuery()) { … }` — returning connections to the pool even when queries fail (see [JDBC](lesson:jdbc-fundamentals)).
- **File processing**: `try (Stream<String> lines = Files.lines(path)) { … }` — `Files.lines`/`walk`/`list` return streams that hold open file handles; forgetting to close them leaks descriptors until the process hits "Too many open files".
- **Concurrency**: `try (var executor = Executors.newVirtualThreadPerTaskExecutor()) { … }` (Java 21) waits for tasks and shuts the executor down.
- **Observability**: tracing spans (`try (Scope s = span.makeCurrent())`), MDC contexts and timers implemented as `AutoCloseable` so they always end.

## Common mistakes

- **Not closing streams from `Files.lines`/`Files.walk`** because "streams don't need closing" (most don't — these do).
- **Wrapping constructor chains in one resource**: `try (BufferedReader r = new BufferedReader(new FileReader(f)))` — if the `BufferedReader` constructor failed, the `FileReader` wouldn't be closed; declare both or use `Files.newBufferedReader`.
- **Swallowing `close()` exceptions** of *output* resources: a failed `close()` on a writer can mean data wasn't flushed.
- **`close()` that isn't idempotent** for `Closeable` implementations.
- **Declaring `close() throws Exception`** in your own resources when nothing checked can be thrown — forces callers to catch `Exception`.
- **Ignoring suppressed exceptions** when logging (most frameworks print them; custom loggers may not).

## Interview questions

**Q1. What is try-with-resources and what problem does it solve?**

````reveal title="Answer"
A `try` statement that declares `AutoCloseable` resources which are closed automatically, in reverse order, however the block exits. It replaces error-prone `finally` blocks: it can't forget to close, handles multiple resources and failed initialisation correctly, and when both the body and `close()` throw, it keeps the body's exception as primary and attaches the close failure as **suppressed** instead of losing the original.
````

**Q2. What are suppressed exceptions?**

````reveal title="Answer"
Exceptions that occurred while closing resources after another exception was already propagating. They're attached to the primary exception with `addSuppressed` and retrieved with `getSuppressed()`; `printStackTrace` shows them under `Suppressed:`. They exist so clean-up failures don't mask the original failure.
````

**Q3. `AutoCloseable` vs `Closeable`?**

````reveal title="Answer"
`AutoCloseable` (`java.lang`, Java 7) declares `void close() throws Exception` and is what try-with-resources requires. `Closeable` (`java.io`, Java 5) extends it with `void close() throws IOException` and requires `close()` to be idempotent. Implement `AutoCloseable` and narrow the `throws` clause (or remove it) for non-I/O resources.
````

**Q4. In which order are resources closed, and when do `catch`/`finally` run?**

````reveal title="Answer"
In reverse order of declaration — the last resource opened is closed first. Any `catch` or `finally` clauses of the try-with-resources statement run **after** all resources have been closed, so a `catch` can see both the primary and suppressed exceptions.
````

## Hands-on exercise

Write a `TempDir` resource that creates a temporary directory on construction and **deletes it recursively** in `close()`. Use it in a try-with-resources block that writes two files into it, prints how many files exist inside the block, and after the block prints whether the directory still exists.

````hint title="Hint"
`Files.createTempDirectory("demo")` creates it. To delete recursively, walk the tree with `Files.walk(dir)` (itself a resource!), sort paths in reverse order (children before parents) and delete each. Make `close()` throw `UncheckedIOException` or `IOException`.
````

````solution title="Solution"
```java title="TempDirDemo.java" file="TempDirDemo.java"
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.stream.Stream;

public class TempDirDemo {
    public static void main(String[] args) throws IOException {
        Path seen;
        try (TempDir tmp = new TempDir("notebook")) {
            Files.writeString(tmp.path().resolve("a.txt"), "alpha");
            Files.createDirectories(tmp.path().resolve("sub"));
            Files.writeString(tmp.path().resolve("sub/b.txt"), "beta");
            try (Stream<Path> files = Files.walk(tmp.path())) {
                System.out.println("regular files inside: " + files.filter(Files::isRegularFile).count());
            }
            seen = tmp.path();
        }
        System.out.println("directory exists after the block: " + Files.exists(seen));
    }
}

final class TempDir implements AutoCloseable {
    private final Path path;

    TempDir(String prefix) throws IOException {
        this.path = Files.createTempDirectory(prefix);
    }

    Path path() {
        return path;
    }

    @Override
    public void close() {
        try (Stream<Path> paths = Files.walk(path)) {
            paths.sorted(Comparator.reverseOrder())          // children before parents
                 .forEach(p -> {
                     try {
                         Files.delete(p);
                     } catch (IOException e) {
                         throw new UncheckedIOException(e);
                     }
                 });
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
```

```text title="Output" output="TempDirDemo.java"
regular files inside: 2
directory exists after the block: false
```
````

## Knowledge check

```quiz
? Resources A then B are declared in one try-with-resources. Which closes first?
+ B
- A
- Unspecified
> Reverse order of declaration.

? The body throws X and close() throws Y. What does the caller receive?
+ X, with Y in getSuppressed()
- Y, and X is lost
- Both as separate exceptions
> try-with-resources preserves the primary exception.

? What must a class implement to be used as a resource?
+ AutoCloseable
- Serializable
- Runnable
> Closeable extends AutoCloseable, so it also works.

? When does a catch clause attached to try-with-resources run?
+ After all resources are closed
- Before the resources are closed
- Only if close() fails
> Closing happens first.

? Since Java 9, which can appear in the parentheses of try-with-resources?
+ An existing effectively final variable
- Any expression returning void
- A non-final variable that is reassigned later
> try (reader) { ... } works if reader is effectively final.
```

## Key takeaways

- try-with-resources closes every `AutoCloseable` **automatically, in reverse order**, on every exit path; `catch`/`finally` run **after** closing.
- Clean-up failures become **suppressed** exceptions on the primary one instead of hiding it.
- `Closeable` = `AutoCloseable` + `IOException` + idempotent `close()`.
- Use it for files, I/O-backed streams, JDBC objects, executors, locks and scopes; narrow `close()`'s `throws`.
- Java 9 accepts effectively final variables; `null` resources are skipped.
