## Concept explanation

### What it is

```java
try {
    risky();                                   // code that may throw
} catch (FileNotFoundException e) {            // most specific first
    useDefaults();
} catch (IOException | SQLException e) {       // multi-catch (Java 7)
    log.warn("storage problem", e);
    throw new StorageException("load failed", e);
} finally {
    cleanUp();                                 // runs on every path out of the try
}
```

- **`try`** wraps code that may throw. It must be followed by at least one `catch` or a `finally` (or be a try-with-resources).
- **`catch (Type e)`** handles exceptions assignable to `Type`. The **first matching** clause wins, so subclasses must come **before** superclasses — otherwise the later clause is unreachable and doesn't compile.
- **Multi-catch** `catch (A | B e)` handles several unrelated types with one block; `e` is implicitly `final`, and the alternatives can't be subclasses of each other.
- **`finally`** runs whether the `try` completes normally, returns, breaks, or throws — and whether or not a `catch` handled the exception.

### `throw` vs `throws`

| | `throw` | `throws` |
|---|---|---|
| What | a **statement** that raises an exception object | part of a **method signature** listing checked exceptions it may propagate |
| Example | `throw new IllegalStateException("closed");` | `void read() throws IOException` |
| Count | one exception per statement | a comma-separated list |

`throws` is required for checked exceptions the method doesn't catch; it's optional (documentation only) for unchecked ones.

### Propagation

If a method doesn't catch an exception, it **propagates** to its caller, then that caller's caller, and so on (**stack unwinding**). Each frame that's unwound runs its pending `finally` blocks on the way. The stack trace records where the exception was **created**, top frame first; `Caused by:` sections show wrapped causes.

### The semantics of `finally` — including the traps

1. `finally` runs even when the `try` executes `return`. The return **value** is computed **before** `finally` runs and saved; changing a local primitive in `finally` doesn't change what's returned (mutating a returned *object* does show).
2. A **`return` in `finally` overrides** the `try`'s return value — and **discards any exception** in flight.
3. An **exception thrown in `finally`** replaces the original exception, which is lost (unless you add it as suppressed).
4. `finally` does **not** run if the JVM halts: `System.exit()`, `Runtime.halt()`, a crash or kill, or when a daemon thread is abandoned at exit. An infinite loop or deadlock in `try` also prevents it.

### Rethrowing

- `catch (Exception e) { log(e); throw e; }` — since Java 7, **precise rethrow** lets the compiler know `e` can only be the checked types the `try` actually throws, so the method can declare those instead of `Exception` (as long as `e` isn't reassigned).
- Wrap to change abstraction level: `throw new RepositoryException("save failed", e)` — always pass the **cause**.

### When to use what

Catch only where you can **do something**: recover, retry, translate to a better exception, or add context. Otherwise let it propagate. Use `finally` (or better, try-with-resources) for clean-up that must always happen.

## Internal working

- `javac` compiles each `try`/`catch` into ranges in the method's **exception table**: `(from, to, handler, type)`. `catch` handlers become code at `handler` that stores the exception in a local.
- **`finally` is duplicated**: `javac` copies the `finally` block's bytecode onto **every exit path** — after the normal end of the `try`, after each `catch`, before each `return`/`break`/`continue` — plus a catch-all handler (`type = any`) that stores the in-flight exception, runs the copy, and rethrows it with `athrow`. That's why `finally` can't be skipped by any normal control flow.
- **Return values**: for `return x;` inside `try`, `javac` evaluates `x` into a hidden local, runs the inlined `finally`, then returns the hidden local — which is why changing `x` in `finally` has no effect, while a `return` *inside* `finally` simply returns earlier with its own value.
- **Multi-catch** compiles to several exception-table entries pointing at the same handler.
- **Stack traces** are captured when the exception is **constructed**, not when thrown; rethrowing a caught exception keeps its original trace.

## Visual representation

```text title="Propagation and unwinding"
  main()  ->  placeOrder()  ->  charge()  ->  gateway.call()   throws IOException
                                                     |
             no handler in gateway.call: pop frame (run its finally, if any)
             no handler in charge():     pop frame (run its finally)
             placeOrder(): catch (IOException e) { throw new PaymentException("declined", e); }
                                                     |
             main(): catch (PaymentException e) -> handled

  stack trace (printed top = where the exception was created):
     PaymentException: declined
         at Shop.placeOrder(Shop.java:21)
         at Shop.main(Shop.java:9)
     Caused by: java.io.IOException: gateway timeout
         at Shop.charge(Shop.java:30)
         ...
```

```text title="finally around return"
  int f() { int x = 1; try { return x; } finally { x = 99; } }
     1. evaluate x (1) -> hidden slot
     2. run finally: x = 99          (hidden slot still 1)
     3. return hidden slot -> 1

  int g() { try { throw new RuntimeException(); } finally { return 7; } }
     exception in flight -> finally returns 7 -> exception DISCARDED
```

## Java code example

```java title="TryCatchFinallyDemo.java" file="TryCatchFinallyDemo.java"
import java.io.FileNotFoundException;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

public class TryCatchFinallyDemo {
    public static void main(String[] args) {
        // 1. Catch order and multi-catch
        for (int scenario = 1; scenario <= 4; scenario++) {
            try {
                trigger(scenario);
                System.out.println(scenario + ": no exception");
            } catch (FileNotFoundException e) {                 // subclass first
                System.out.println(scenario + ": file missing (" + e.getMessage() + ")");
            } catch (IOException | IllegalStateException e) {   // multi-catch
                System.out.println(scenario + ": " + e.getClass().getSimpleName());
            } finally {
                System.out.println(scenario + ": finally runs");
            }
        }

        // 2. finally vs return
        System.out.println("returnFromTry() = " + returnFromTry());
        System.out.println("mutateReturnedObject() = " + mutateReturnedObject());
        System.out.println("returnInFinally() = " + returnInFinally() + "  (the exception vanished)");

        // 3. An exception from finally replaces the original
        try {
            throwInBoth();
        } catch (RuntimeException e) {
            System.out.println("caught: " + e.getMessage() + ", original lost? " + (e.getSuppressed().length == 0));
        }

        // 4. Propagation with a wrapped cause and a readable stack trace
        try {
            placeOrder();
        } catch (PaymentException e) {
            System.out.println("caught " + e.getMessage() + " caused by " + e.getCause());
            StackTraceElement top = e.getStackTrace()[0];
            System.out.println("created in " + top.getMethodName() + ", cause created in " + e.getCause().getStackTrace()[0].getMethodName());
        }
    }

    static void trigger(int scenario) throws IOException {
        switch (scenario) {
            case 1:
                throw new FileNotFoundException("app.yml");
            case 2:
                throw new IOException("disk full");
            case 3:
                throw new IllegalStateException("closed");
            default:
                // no exception
        }
    }

    static int returnFromTry() {
        int x = 1;
        try {
            return x;                           // value 1 is saved before finally runs
        } finally {
            x = 99;                             // too late to change the result
        }
    }

    static List<String> mutateReturnedObject() {
        List<String> list = new ArrayList<>();
        try {
            list.add("from try");
            return list;
        } finally {
            list.add("from finally");           // same object: the caller sees it
        }
    }

    @SuppressWarnings("finally")
    static int returnInFinally() {
        try {
            throw new IllegalStateException("important failure");
        } finally {
            return 7;                           // overrides and swallows the exception: never do this
        }
    }

    @SuppressWarnings("finally")
    static void throwInBoth() {
        try {
            throw new RuntimeException("original problem");
        } finally {
            throw new RuntimeException("cleanup problem");   // replaces the original
        }
    }

    static void placeOrder() throws PaymentException {
        try {
            charge();
        } catch (IOException e) {
            throw new PaymentException("payment declined", e);   // translate and keep the cause
        }
    }

    static void charge() throws IOException {
        throw new IOException("gateway timeout");
    }
}

class PaymentException extends Exception {
    PaymentException(String message, Throwable cause) {
        super(message, cause);
    }
}
```

## Output

```text title="Output" output="TryCatchFinallyDemo.java"
1: file missing (app.yml)
1: finally runs
2: IOException
2: finally runs
3: IllegalStateException
3: finally runs
4: no exception
4: finally runs
returnFromTry() = 1
mutateReturnedObject() = [from try, from finally]
returnInFinally() = 7  (the exception vanished)
caught: cleanup problem, original lost? true
caught payment declined caused by java.io.IOException: gateway timeout
created in placeOrder, cause created in charge
```

- `finally` ran in all four scenarios, including the one with no exception.
- `returnFromTry` returned 1: the value was saved before `finally` changed `x`. Mutating the returned **object** in `finally` did show up.
- `return` in `finally` returned 7 and silently discarded the `IllegalStateException` (javac warns: `-Xlint:finally`).
- The exception thrown from `finally` replaced the original one completely.
- The wrapped exception kept its cause; each stack trace starts where that exception was constructed.

## Real-world application

- **Error translation at layer boundaries**: a repository catches `SQLException` and throws `OrderRepositoryException(…, e)`; a controller maps domain exceptions to HTTP status codes in one `@ControllerAdvice`.
- **Clean-up**: unlocking (`lock.unlock()` in `finally`), restoring thread state (`MDC.clear()`), stopping timers/metrics, deleting temp files — anything that must run on every path.
- **Incident analysis**: reading stack traces — the top frame of each `Caused by:` section is where that problem originated; the deepest cause is usually the real root.
- **Retry loops** catch a specific transient exception (timeout, 503) and retry, letting everything else propagate (see the [retry exercise](problem:retry-with-backoff)).

## Common mistakes

- **Empty catch blocks** (`catch (Exception e) {}`) — failures disappear.
- **Catching too broadly** (`Exception`, `Throwable`) in business code.
- **`return` or `throw` in `finally`** — swallows or replaces exceptions.
- **Losing the cause** when wrapping (`throw new MyException(e.getMessage())`).
- **Logging and rethrowing at every layer** — the same stack trace appears five times in the logs.
- **Using exceptions for control flow** (e.g. `catch (NumberFormatException)` to detect non-numbers in a hot loop).
- **Clean-up in `finally` that can itself throw** and mask the original problem — use try-with-resources (suppressed exceptions).

## Interview questions

**Q1. Does `finally` always execute?**

````reveal title="Answer"
It runs on every normal way out of the `try`/`catch`: completion, `return`, `break`, `continue`, or an exception (caught or not). It does **not** run if the JVM stops — `System.exit()`, `Runtime.halt()`, a crash, the process being killed — or if a daemon thread is abandoned when the JVM exits, or if the `try` never finishes (infinite loop, deadlock).
````

**Q2. What happens when an exception is thrown from a `finally` block?**

````reveal title="Answer"
It propagates and **replaces** any exception that was already in flight from the `try` or `catch` — the original is lost (not even recorded as suppressed). Similarly, a `return` in `finally` discards an in-flight exception. That's why clean-up code shouldn't throw, and why try-with-resources records clean-up failures as **suppressed** exceptions instead.
````

**Q3. What does this method return?** `int f() { int x = 10; try { return x; } finally { x = 20; } }`

````reveal title="Answer"
`10`. The `return` expression is evaluated and stored before the `finally` block runs; changing the local variable afterwards doesn't affect the stored value. If `finally` itself contained `return x;`, the method would return `20`.
````

**Q4. `throw` vs `throws`?**

````reveal title="Answer"
`throw` is a statement that raises one exception instance at run time. `throws` is a clause in a method signature declaring which checked exceptions the method may propagate to its callers (required for checked exceptions it doesn't handle; optional documentation for unchecked ones).
````

**Q5. Why must catch blocks go from most specific to most general?**

````reveal title="Answer"
Clauses are tried in order and the first match wins. If `catch (IOException e)` came before `catch (FileNotFoundException e)`, the second could never execute, so the compiler rejects it as unreachable ("exception FileNotFoundException has already been caught").
````

## Hands-on exercise

Predict the output of each method, then write them and check:

```java
static String a() { try { return "try"; } finally { System.out.print("[finally] "); } }
static int b() { int i = 0; try { i = 1; throw new RuntimeException(); } catch (RuntimeException e) { i = 2; return i; } finally { i = 3; } }
static int c() { try { System.exit(0); } finally { System.out.println("never"); } return 0; }   // don't call it
static String d() { StringBuilder sb = new StringBuilder("x"); try { return sb.append("y").toString(); } finally { sb.append("z"); } }
```

Then fix `throwInBoth` from the example so the clean-up failure is attached to the original exception as a **suppressed** exception instead of replacing it.

````hint title="Hint"
In `b`, the `catch` returns 2 — saved before `finally` runs. In `d`, `toString()` creates a new `String` before `finally` mutates the builder. For the fix: catch the primary exception, run clean-up in a nested `try`, and call `primary.addSuppressed(cleanupFailure)`.
````

````solution title="Solution"
```java title="FinallyQuiz.java" file="FinallyQuiz.java"
public class FinallyQuiz {
    static String a() {
        try {
            return "try";
        } finally {
            System.out.print("[finally] ");
        }
    }

    static int b() {
        int i = 0;
        try {
            i = 1;
            throw new RuntimeException();
        } catch (RuntimeException e) {
            i = 2;
            return i;
        } finally {
            i = 3;
        }
    }

    static String d() {
        StringBuilder sb = new StringBuilder("x");
        try {
            return sb.append("y").toString();
        } finally {
            sb.append("z");
        }
    }

    static void workThenCleanUp() {
        RuntimeException primary = null;
        try {
            throw new RuntimeException("original problem");
        } catch (RuntimeException e) {
            primary = e;
            throw e;
        } finally {
            try {
                throw new IllegalStateException("cleanup problem");
            } catch (IllegalStateException cleanup) {
                if (primary != null) {
                    primary.addSuppressed(cleanup);       // keep both
                } else {
                    throw cleanup;
                }
            }
        }
    }

    public static void main(String[] args) {
        System.out.println(a());
        System.out.println(b());
        System.out.println(d());
        try {
            workThenCleanUp();
        } catch (RuntimeException e) {
            System.out.println(e.getMessage() + ", suppressed: " + e.getSuppressed()[0].getMessage());
        }
    }
}
```

```text title="Output" output="FinallyQuiz.java"
[finally] try
2
xy
original problem, suppressed: cleanup problem
```

`a()` printed `[finally] ` before `main` printed the returned `"try"`. `c()` would exit the JVM without running `finally`. This manual pattern is exactly what try-with-resources generates for you.
````

## Knowledge check

```quiz
? Which order of catch clauses compiles?
+ catch (FileNotFoundException e) then catch (IOException e)
- catch (IOException e) then catch (FileNotFoundException e)
- Either order
> A superclass first makes the subclass clause unreachable.

? `try { return 1; } finally { return 2; }` returns...
- 1
+ 2
- Compile error
> A return in finally overrides the try's return (and swallows exceptions).

? When does finally NOT run?
+ After System.exit() in the try
- When the try returns
- When the catch rethrows
> The JVM halts without running finally blocks.

? An exception is thrown in try and another in finally. Which reaches the caller?
+ The one from finally; the original is lost
- The original one
- Both, as suppressed exceptions
> Only try-with-resources records suppressed exceptions automatically.

? What does `throws IOException` in a method signature mean?
+ The method may propagate IOException to its caller, which must handle or declare it
- The method always throws IOException
- The method catches IOException
> throws declares; throw raises.
```

## Key takeaways

- `catch` clauses are tried **in order** — specific first; multi-catch handles unrelated types together.
- **`finally` runs on every exit path** (it's inlined by `javac`), except when the JVM halts.
- The `try`'s return value is **saved before** `finally`; a `return`/`throw` **in** `finally` overrides and loses the original outcome.
- `throw` raises; `throws` declares. Unhandled exceptions **propagate**, unwinding frames and running their `finally` blocks.
- Wrap with the **cause**, catch only where you can act, and never leave catch blocks empty.
