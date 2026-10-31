## Concept explanation

### Why not `System.out.println`

Production code needs logs that can be:
- **filtered by severity**, globally and per component;
- **routed** to files, the console, JSON collectors or alerting;
- **enriched** with context (time, thread, request id, user);
- **changed without redeploying**.

`System.out` offers none of this. A logging framework does:

| Level (SLF4J / JUL) | Use for |
|---|---|
| `ERROR` / `SEVERE` | a failed operation needing attention (with the exception) |
| `WARN` / `WARNING` | unexpected but handled: retries, fallbacks, deprecated usage |
| `INFO` / `INFO` | business milestones: started, order placed, job finished |
| `DEBUG` / `FINE` | diagnostic detail for developers, off in production by default |
| `TRACE` / `FINEST` | very fine detail (payloads, loops) |

### The Java logging landscape

- **SLF4J**: the de-facto **facade**. Application and library code calls `org.slf4j.Logger`, and the **back-end** is chosen at deployment: **Logback** (Spring Boot's default) or **Log4j 2**. Libraries should log through the facade only.
- **`java.util.logging` (JUL)**: built into the JDK, with loggers, handlers, formatters and levels. It's rarely the main framework in applications, but it's useful without dependencies.
- **`System.Logger`** (Java 9): a minimal JDK facade that routes to JUL by default, or to any back-end via `System.LoggerFinder`.
- **Spring Boot**: SLF4J + Logback, configured with `logging.level.com.shop=DEBUG` and `logback-spring.xml`. It has built-in structured JSON logging since Boot 3.4.

### Logging well

- **Parameterised messages**: `log.debug("Order {} for {}", id, user)`. The string is built only if `DEBUG` is enabled. Use **lambdas** (`log.fine(() -> expensive())`, or SLF4J 2's fluent `log.atDebug().addArgument(() -> …)`) for expensive arguments.
- **Pass the exception as the last argument** (`log.error("Payment failed for {}", id, e)`) to get the stack trace. Don't log and rethrow the same exception at every layer: log it once where it's handled.
- **Context**: the **MDC** (Mapped Diagnostic Context, a per-thread map) adds a `requestId`/`traceId` to every line of a request. OpenTelemetry injects trace ids the same way.
- **Structured logs** (JSON, one event per line) are what Elasticsearch, Loki and Datadog parse best.
- **Never log secrets or personal data**: passwords, tokens, full card numbers.
- **Untrusted input** in log messages can forge log lines (CR/LF injection). **Log4Shell** (CVE-2021-44228) let attacker-controlled strings trigger JNDI lookups in Log4j 2: keep logging libraries patched.

### Assertions

`assert condition : message;` checks an **internal invariant** that should never be false if the code is correct.
- Assertions are **disabled by default**: the JVM skips them entirely unless started with **`-ea`** (`-enableassertions`).
- They can be enabled selectively: `-ea:com.shop...` for a package and its subpackages, `-ea:com.shop.Cart` for one class, `-da:…` to disable, `-esa` for system classes.
- When enabled and false, they throw `AssertionError`.
- **Don't** use them to validate arguments of public methods or user input: they'd be skipped in production. Use `Objects.requireNonNull`, `IllegalArgumentException` and validation instead.
- **Never put side effects** in an assertion: the program would behave differently with `-ea`.
- Tests (JUnit's `assertEquals`) are a different thing: library methods that always run.

## Internal working

- **Logger hierarchy**: loggers are named with dots (`com.shop.payments`) and form a tree.
  - A logger without its own level **inherits the effective level** of its nearest configured ancestor.
  - Records **propagate** to the parent loggers' handlers (appenders) unless `useParentHandlers=false` (Logback: `additivity="false"`).
  - Configure levels at package roots.
- **JUL pipeline**:
  - `Logger.log(record)` checks the level (a cheap integer comparison) before creating the `LogRecord`;
  - each **`Handler`** (`ConsoleHandler` writes to **stderr** by default, `FileHandler`…) has its own level and **`Formatter`**;
  - `formatMessage` fills `{0}` placeholders using `MessageFormat`.
- **JUL loggers are weakly referenced** by the `LogManager`. A logger configured in code and not kept in a field can be garbage collected, and its level setting is lost. Keep loggers in `static final` fields.
- **Cost**:
  - a disabled log call costs a level check, plus the argument evaluation for **concatenated** strings, which run even when nothing is logged;
  - enabled logging costs formatting and I/O. Synchronous file or console appenders can become a bottleneck (they hold a lock), hence **async appenders** with bounded queues (Logback's `AsyncAppender`, Log4j 2's async loggers using the LMAX Disruptor).
- **Assertions in bytecode**:
  - the compiler adds a `static final boolean $assertionsDisabled` field, initialised when the class is initialised from `desiredAssertionStatus()`;
  - each `assert` compiles to `if (!$assertionsDisabled && !cond) throw new AssertionError(msg)`;
  - with assertions disabled, the JIT removes the dead branch, so they cost nothing.

## Visual representation

```text title="A log call travelling through the hierarchy"
 log = Logger("com.shop.orders")          level: (none) -> inherits INFO from "com.shop"
 log.fine("cart {0}", id)    -> FINE < INFO  -> dropped at once (args not formatted)
 log.info("placed {0}", id)  -> accepted -> LogRecord
        |
        +--> handlers on "com.shop.orders" (none)
        +--> handlers on "com.shop"        (none)          propagate upwards
        +--> handlers on root ""           StdoutHandler -> Formatter -> "INFO com.shop.orders placed 42"

 "com.shop.payments" has its own level FINE -> its fine() calls are logged

 assert x > 0 : "msg";   compiles to   if (!$assertionsDisabled && !(x > 0)) throw new AssertionError("msg");
 java App        -> $assertionsDisabled = true  (skipped)
 java -ea App    -> $assertionsDisabled = false (checked)
```

## Java code example

Real projects would use SLF4J with Logback. This demo uses the JDK's built-in `java.util.logging`, so it needs no dependencies, but the concepts map one-to-one (logger hierarchy, levels, handlers/appenders, formatters/layouts, MDC). The formatter leaves out timestamps so the output is reproducible.

```java title="LoggingDemo.java" file="LoggingDemo.java"
import java.util.logging.Formatter;
import java.util.logging.Handler;
import java.util.logging.Level;
import java.util.logging.LogManager;
import java.util.logging.LogRecord;
import java.util.logging.Logger;

public class LoggingDemo {
    // Keep loggers in static fields: JUL holds them weakly, and their levels vanish if they are collected
    private static final Logger SHOP = Logger.getLogger("com.shop");
    private static final Logger ORDERS = Logger.getLogger("com.shop.orders");
    private static final Logger PAYMENTS = Logger.getLogger("com.shop.payments");

    // A tiny MDC: per-thread context added to every line
    private static final ThreadLocal<String> REQUEST_ID = new ThreadLocal<>();

    static final class LineFormatter extends Formatter {
        @Override
        public String format(LogRecord r) {
            String request = REQUEST_ID.get() == null ? "-" : REQUEST_ID.get();
            String error = r.getThrown() == null ? "" : " | " + r.getThrown();
            return String.format("%-7s [req=%s] %s: %s%s%n", r.getLevel(), request, r.getLoggerName(), formatMessage(r), error);
        }
    }

    static final class StdoutHandler extends Handler {
        @Override
        public void publish(LogRecord r) {
            if (isLoggable(r)) {
                System.out.print(getFormatter().format(r));
            }
        }

        @Override public void flush() { System.out.flush(); }
        @Override public void close() { }
    }

    static int expensiveCalls;

    static String expensiveCartDump() {
        expensiveCalls++;
        return "[book x1, pen x3]";
    }

    static void placeOrder(String requestId, long orderId, boolean cardDeclined) {
        REQUEST_ID.set(requestId);
        try {
            ORDERS.info(() -> "placing order " + orderId);
            ORDERS.fine("cart contents: " + expensiveCartDump());   // concatenation runs even though FINE is off
            ORDERS.fine(() -> "cart contents: " + expensiveCartDump()); // the supplier runs only if FINE is on
            PAYMENTS.fine(() -> "authorising card for order " + orderId);
            if (cardDeclined) {
                try {
                    throw new IllegalStateException("card declined: insufficient funds");
                } catch (IllegalStateException e) {
                    PAYMENTS.log(Level.WARNING, "payment failed for order " + orderId + ", will retry", e);
                }
            }
            ORDERS.log(Level.INFO, "order {0} status {1}", new Object[] { orderId, cardDeclined ? "PENDING" : "PAID" });
        } finally {
            REQUEST_ID.remove();                                   // always clear thread-local context
        }
    }

    public static void main(String[] args) {
        LogManager.getLogManager().reset();                        // drop the default stderr ConsoleHandler
        Logger root = Logger.getLogger("");
        Handler handler = new StdoutHandler();
        handler.setFormatter(new LineFormatter());
        handler.setLevel(Level.ALL);
        root.addHandler(handler);
        root.setLevel(Level.WARNING);
        SHOP.setLevel(Level.INFO);                                 // the whole com.shop tree: INFO
        PAYMENTS.setLevel(Level.FINE);                             // payments: more detail

        System.out.println("effective levels: orders inherits from com.shop -> FINE loggable? "
                + ORDERS.isLoggable(Level.FINE) + ", payments FINE loggable? " + PAYMENTS.isLoggable(Level.FINE));

        placeOrder("r-101", 42, false);
        placeOrder("r-102", 43, true);
        System.out.println("expensiveCartDump() calls: " + expensiveCalls + " (only from the concatenated messages)");

        Logger.getLogger("org.thirdparty.http").info("noisy library message");   // root is WARNING: dropped
        Logger.getLogger("org.thirdparty.http").warning("library warning passes the root level");

        System.Logger sys = System.getLogger("com.shop.legacy");  // JDK facade, routed to JUL here
        sys.log(System.Logger.Level.INFO, "System.Logger message with argument {0}", 7);
    }
}
```

Assertions are tested by starting **child JVMs** of the same program with different flags:

```java title="AssertionsDemo.java" file="AssertionsDemo.java"
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

public class AssertionsDemo {
    static int sideEffects;

    static boolean countCheck() {
        sideEffects++;                       // a side effect inside an assert: a bug
        return true;
    }

    static long average(long[] values) {
        assert values.length > 0 : "values must not be empty";   // internal invariant, not input validation
        long sum = 0;
        for (long v : values) {
            sum += v;
        }
        return sum / values.length;
    }

    static void child() {
        boolean enabled = false;
        assert enabled = true;               // assignment runs only when assertions are enabled
        System.out.println("assertions enabled: " + enabled);
        assert countCheck();
        System.out.println("side effects counted: " + sideEffects);
        try {
            System.out.println("average = " + average(new long[0]));
        } catch (AssertionError e) {
            System.out.println("AssertionError: " + e.getMessage());
        } catch (ArithmeticException e) {
            System.out.println("no assertion, so ArithmeticException: " + e.getMessage());
        }
    }

    static void runChild(String... flags) throws IOException, InterruptedException {
        List<String> cmd = new ArrayList<>();
        cmd.add(Path.of(System.getProperty("java.home"), "bin", "java").toString());
        cmd.addAll(List.of(flags));
        cmd.addAll(List.of("-cp", System.getProperty("java.class.path"), "AssertionsDemo", "child"));
        Process p = new ProcessBuilder(cmd).redirectErrorStream(true).start();
        String out = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        p.waitFor();
        System.out.println("java " + String.join(" ", flags) + (flags.length == 0 ? "(no flags)" : ""));
        out.lines().forEach(line -> System.out.println("    " + line));
    }

    public static void main(String[] args) throws Exception {
        if (args.length > 0) {
            child();
            return;
        }
        runChild();
        runChild("-ea");
        runChild("-ea:AssertionsDemo");      // just this class
        runChild("-ea", "-da:AssertionsDemo");
    }
}
```

## Output

```text title="Output" output="LoggingDemo.java"
effective levels: orders inherits from com.shop -> FINE loggable? false, payments FINE loggable? true
INFO    [req=r-101] com.shop.orders: placing order 42
FINE    [req=r-101] com.shop.payments: authorising card for order 42
INFO    [req=r-101] com.shop.orders: order 42 status PAID
INFO    [req=r-102] com.shop.orders: placing order 43
FINE    [req=r-102] com.shop.payments: authorising card for order 43
WARNING [req=r-102] com.shop.payments: payment failed for order 43, will retry | java.lang.IllegalStateException: card declined: insufficient funds
INFO    [req=r-102] com.shop.orders: order 43 status PENDING
expensiveCartDump() calls: 2 (only from the concatenated messages)
WARNING [req=-] org.thirdparty.http: library warning passes the root level
INFO    [req=-] com.shop.legacy: System.Logger message with argument 7
```

```text title="Output" output="AssertionsDemo.java"
java (no flags)
    assertions enabled: false
    side effects counted: 0
    no assertion, so ArithmeticException: / by zero
java -ea
    assertions enabled: true
    side effects counted: 1
    AssertionError: values must not be empty
java -ea:AssertionsDemo
    assertions enabled: true
    side effects counted: 1
    AssertionError: values must not be empty
java -ea -da:AssertionsDemo
    assertions enabled: false
    side effects counted: 0
    no assertion, so ArithmeticException: / by zero
```

**Logging**:
- `com.shop.orders` has no level of its own, so it inherited `INFO` from `com.shop` and its `fine` calls were dropped. `com.shop.payments` was set to `FINE`, so its detail appeared.
- **Every line carries the request id** from the thread-local context, set at the start of each request and cleared in `finally`.
- **`expensiveCartDump()` ran twice**, once per request, both times from the **concatenated** `fine` message that was then thrown away. The supplier version never ran.
- The exception was attached to the `WARNING` record, not glued into the message. A real layout prints the full stack trace.
- The third-party logger inherited the root's `WARNING` level, which silenced its `INFO` noise.
- `System.Logger` routed through JUL to the same handler.

**Assertions**:
- **Without `-ea` the `assert` statements were skipped entirely**: the side-effecting check never ran, and the empty array caused an `ArithmeticException` instead of the descriptive `AssertionError`.
- `-ea` (globally or for just this class) enabled them, and `-da:AssertionsDemo` turned them off again for this class.

## Real-world application

- **Spring Boot**: SLF4J + Logback.
  - Configure levels per package in `application.yml` (`logging.level.org.hibernate.SQL: DEBUG` to see generated SQL).
  - Change levels at run time through the Actuator `/loggers` endpoint during an incident.
  - Use JSON output (`logging.structured.format.console=ecs`) for log platforms.
- **Request tracing**: a servlet filter puts `requestId`/`traceId` into the MDC (Micrometer Tracing and OpenTelemetry do it automatically), so you can grep one request's lines across services. With thread pools and `CompletableFuture`, the context must be **copied** to the worker thread (task decorators). With virtual threads and structured concurrency, scoped values carry it.
- **Incident practice**:
  - log at `INFO` what happened to the business;
  - log at `WARN`/`ERROR` with the exception and identifiers (order id, but no card number);
  - sample or rate-limit noisy logs;
  - alert on error rates via metrics, not via log grepping.
- **Audit logs**: security-relevant events (logins, permission changes) go to separate, tamper-evident sinks.
- **Assertions**: some teams enable `-ea` in tests and CI (Maven Surefire enables them by default) to catch broken invariants early, and disable them in production. Libraries such as Guava's `Preconditions`, or `Objects.requireNonNull`/`checkIndex`, do the always-on checks.

## Common mistakes

- **String concatenation in disabled log statements** (`log.debug("x=" + heavy())`): the work runs anyway. Use placeholders or suppliers.
- **Logging an exception without the throwable** (`log.error("failed: " + e.getMessage())`): the stack trace is lost. Pass `e` as the last argument.
- **Log-and-rethrow at every layer**: one failure produces five stack traces. Log once, where the exception is handled.
- **Logging secrets/PII**, or unescaped user input (forged lines, Log4Shell-style lookups in unpatched libraries).
- **Forgetting to clear the MDC/`ThreadLocal`** in pooled threads: the next request inherits the previous request's id.
- **Libraries binding to a specific back-end**, or shipping a `logback.xml` in a library JAR. Libraries should depend on the SLF4J API only.
- **Using `assert` for argument validation** or for checks with side effects. They're skipped without `-ea`.
- **Keeping JUL loggers in local variables** after configuring their levels: they can be garbage collected, and the configuration is lost.

## Interview questions

**Q1. Why use SLF4J instead of a logging implementation directly?**

````reveal title="Answer"
SLF4J is a facade: code depends on a small API, and the application chooses the back-end (Logback, Log4j 2, JUL) at deployment by putting one binding on the class path (a provider found via `ServiceLoader` in SLF4J 2). Libraries that log through SLF4J don't force their logging framework on users. Bridges (`jul-to-slf4j`, `log4j-over-slf4j`) route other APIs into the same back-end, so the whole application has one configuration.
````

**Q2. What's the difference between `log.debug("x=" + x)` and `log.debug("x={}", x)`?**

````reveal title="Answer"
In the first, the string is concatenated (and `x.toString()` called) **before** the call, even when DEBUG is disabled, which wastes CPU and allocations on hot paths. In the second, the framework checks the level first and formats only when the event will be logged. For arguments that are expensive to compute, guard with `if (log.isDebugEnabled())` or use lazy suppliers (SLF4J 2's fluent API, JUL's `Supplier` overloads, Log4j 2 lambdas).
````

**Q3. What is the MDC, and what's the pitfall with thread pools?**

````reveal title="Answer"
The Mapped Diagnostic Context is a thread-local map of key-value pairs (`requestId`, `userId`, `traceId`) that the layout adds to every log line. It's set at the start of a request and removed in `finally`. With thread pools, the context doesn't follow tasks submitted to other threads, so those lines lack the id. And if it isn't cleared, a pooled thread leaks the previous request's id into unrelated work. Use task decorators that copy and restore the MDC, or tracing libraries that propagate context.
````

**Q4. How are assertions enabled, and when should you use them?**

````reveal title="Answer"
They're disabled by default. Enable them with `-ea` (globally), `-ea:com.pkg...` (a package tree), `-ea:com.pkg.Class` (one class), and disable with `-da:…`; `-esa` covers system classes. When disabled, the JIT removes them, so they cost nothing. Use them for **internal invariants** and "can't happen" states in private code. Don't use them for public argument checks, user input or anything with side effects: those must always run, so use exceptions.
````

**Q5. Which log level would you use for a failed payment that will be retried, and why?**

````reveal title="Answer"
`WARN` for a recoverable failure that is handled with a retry: it's unusual and worth seeing, but nobody needs to be woken up. If retries are exhausted and the payment fails for good, log `ERROR` once, with the exception and the identifiers (order id, provider, attempt count), and no card details. Routine success is `INFO` at most, or a metric. Alerting should come from metrics (failure rate), not from counting log lines.
````

## Hands-on exercise

Write a **JSON-lines formatter** for `java.util.logging` and use it with a thread-local context:
- each record becomes one line: `{"level":"INFO","logger":"com.shop.api","msg":"...","requestId":"r-7"}`, plus `"error":"<exception class>: <message>"` when a throwable is attached;
- **escape** `"` and `\` and turn newlines into `\n`, so a malicious message like `bad"input\nFAKE ERROR` can't break the format or forge a second line;
- a helper `withRequest(String id, Runnable body)` sets the context and **restores the previous value** afterwards (requests can nest);
- log a normal request, a nested call with a different id, a request with an exception, and one with the malicious input.

````hint title="Hint"
Escape with `s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r")`; the order matters, so backslashes go first. For nesting, save `String previous = CONTEXT.get()`, set the new id, and in `finally` restore `previous` (or `remove()` if it was null).
````

````solution title="Solution"
```java title="JsonLogging.java" file="JsonLogging.java"
import java.util.logging.Formatter;
import java.util.logging.Handler;
import java.util.logging.Level;
import java.util.logging.LogManager;
import java.util.logging.LogRecord;
import java.util.logging.Logger;

public class JsonLogging {
    private static final Logger API = Logger.getLogger("com.shop.api");
    private static final Logger DB = Logger.getLogger("com.shop.db");
    private static final ThreadLocal<String> CONTEXT = new ThreadLocal<>();

    static String escape(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r");
    }

    static final class JsonFormatter extends Formatter {
        @Override
        public String format(LogRecord r) {
            StringBuilder json = new StringBuilder("{");
            json.append("\"level\":\"").append(r.getLevel()).append('"');
            json.append(",\"logger\":\"").append(escape(r.getLoggerName())).append('"');
            json.append(",\"msg\":\"").append(escape(formatMessage(r))).append('"');
            if (CONTEXT.get() != null) {
                json.append(",\"requestId\":\"").append(escape(CONTEXT.get())).append('"');
            }
            if (r.getThrown() != null) {
                json.append(",\"error\":\"").append(escape(r.getThrown().toString())).append('"');
            }
            return json.append("}").append(System.lineSeparator()).toString();
        }
    }

    static void withRequest(String id, Runnable body) {
        String previous = CONTEXT.get();
        CONTEXT.set(id);
        try {
            body.run();
        } finally {
            if (previous == null) {
                CONTEXT.remove();
            } else {
                CONTEXT.set(previous);
            }
        }
    }

    public static void main(String[] args) {
        LogManager.getLogManager().reset();
        Handler handler = new Handler() {
            @Override public void publish(LogRecord r) { System.out.print(getFormatter().format(r)); }
            @Override public void flush() { }
            @Override public void close() { }
        };
        handler.setFormatter(new JsonFormatter());
        Logger.getLogger("").addHandler(handler);

        withRequest("r-7", () -> {
            API.info("GET /orders/42");
            withRequest("r-7.db", () -> DB.info("SELECT order 42 took 3 ms"));
            API.info("200 OK");
        });
        withRequest("r-8", () -> API.log(Level.SEVERE, "POST /orders failed",
                new IllegalStateException("inventory service \"timeout\"")));
        withRequest("r-9", () -> API.warning("rejected search term: " + "bad\"input\nFAKE ERROR {\"level\":\"SEVERE\"}"));
        API.info("outside any request");
    }
}
```

```text title="Output" output="JsonLogging.java"
{"level":"INFO","logger":"com.shop.api","msg":"GET /orders/42","requestId":"r-7"}
{"level":"INFO","logger":"com.shop.db","msg":"SELECT order 42 took 3 ms","requestId":"r-7.db"}
{"level":"INFO","logger":"com.shop.api","msg":"200 OK","requestId":"r-7"}
{"level":"SEVERE","logger":"com.shop.api","msg":"POST /orders failed","requestId":"r-8","error":"java.lang.IllegalStateException: inventory service \"timeout\""}
{"level":"WARNING","logger":"com.shop.api","msg":"rejected search term: bad\"input\nFAKE ERROR {\"level\":\"SEVERE\"}","requestId":"r-9"}
{"level":"INFO","logger":"com.shop.api","msg":"outside any request"}
```

Every event stays one valid JSON line: the attacker's quote and newline were escaped, so no forged `SEVERE` line appeared. The nested call carried its own id, and the outer id came back afterwards. Logstash-logback-encoder and Spring Boot's structured logging produce this format with MDC fields included automatically.
````

## Knowledge check

```quiz
? com.shop is set to INFO and com.shop.orders has no level. Is com.shop.orders.fine(...) logged?
+ No, it inherits INFO from com.shop
- Yes, unset loggers log everything
- Only if the root is FINE
> The effective level comes from the nearest configured ancestor.

? log.debug("total=" + compute()) with DEBUG disabled. Does compute() run?
+ Yes, the argument is built before the call
- No, the logger skips it
- Only the first time
> Use placeholders or suppliers.

? A program is started without -ea. What happens to assert x > 0 when x is -1?
+ Nothing, the assertion is skipped
- AssertionError is thrown
- A warning is logged
> Assertions are disabled by default.

? Where should the exception go in a log call?
+ As the last argument (the throwable), so the stack trace is kept
- Concatenated into the message with getMessage()
- In a separate log statement
> log.error("Payment failed for {}", id, e).

? Why must MDC/ThreadLocal context be cleared in finally?
+ Pooled threads would carry the previous request's context into the next task
- ThreadLocals are not garbage collected at all
- Logging frameworks require it
> Reused threads keep their ThreadLocal values.
```

## Key takeaways

- Use a logging **facade** (SLF4J) with one back-end (Logback/Log4j 2). Configure **levels per package**, and use handlers/appenders for destinations and formatters/layouts for format.
- Prefer **parameterised or lazy messages**, **pass exceptions as the throwable**, log once where an exception is handled, and keep secrets out of logs.
- Add **context** with the MDC (and clear it), and use **structured JSON** for log platforms. Escape untrusted input.
- Loggers form a hierarchy: levels are inherited and records propagate to the ancestors' handlers.
- **Assertions** check internal invariants, are **off by default** (`-ea` enables them), must have no side effects, and never replace argument validation.
