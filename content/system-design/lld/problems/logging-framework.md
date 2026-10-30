## Problem statement

Design a logging library like a small Log4j or Logback. Application code asks for a named logger (`shop.db`) and logs messages at levels from `TRACE` to `ERROR`. Configuration decides which levels are enabled per logger, where events go (console, file, memory), and how they're formatted (plain text or JSON). Logging must be cheap when disabled and safe to call from many threads; slow destinations must not slow the application down.

> [!TIP] Try it first
> Separate the three questions an event goes through: **should it be logged at all?** (levels), **where does it go?** (appenders and the logger hierarchy), **what does it look like?** (formatters).

## Clarifying questions

1. Which levels? How is the level chosen for a logger nobody configured?
2. Do loggers form a hierarchy by name (`shop.db` under `shop`)?
3. Which destinations and formats?
4. Message templates (`"took {} ms"`)? Exceptions?
5. Thread safety? Asynchronous writing?
6. What happens when the async buffer is full?

````reveal title="Answers we'll assume"
- Levels `TRACE < DEBUG < INFO < WARN < ERROR`. A logger without a level **inherits** the nearest ancestor's; the root defaults to `INFO`.
- Loggers form a **dot-separated hierarchy**. An event goes to the logger's appenders and then up to its ancestors' appenders, unless a logger is marked **non-additive**.
- Appenders: console and in-memory (a file appender is the same shape). Each appender has a **threshold** and a **formatter** (pattern or JSON).
- `{}` placeholders filled from arguments; a trailing `Throwable` argument is the event's error. Lazy `Supplier<String>` messages for expensive debug output.
- Many threads log at once. An **async appender** moves writing to a background thread with a bounded queue.
- When the queue is full, events below `WARN` are **dropped (and counted)**; `WARN` and `ERROR` wait for space.
````

## Requirements

**Functional**

1. `LoggerRegistry.getLogger(name)` returns the same logger for the same name and builds the hierarchy.
2. Levels per logger with inheritance; level checks before any formatting.
3. Appenders with thresholds and formatters; additivity per logger.
4. Placeholders, trailing exceptions and lazy messages.
5. Async appender with a bounded queue, a drop policy, and a `close()` that flushes.

**Non-functional**

6. A disabled log call costs a level comparison, nothing more.
7. Thread-safe; an appender never interleaves two events' output.
8. New appenders and formatters plug in without changing `Logger`.

## Step 1 — Entities

````reveal title="Entities and responsibilities"
| Entity | Responsibility |
|---|---|
| `Level` | Ordered severities; `isAtLeast` comparison |
| `LogEvent` | Immutable: time, level, logger name, message, optional error |
| `Logger` | Name, optional level, appenders, additivity, parent; filters by level and passes events up the chain |
| `LoggerRegistry` | Creates and caches loggers by name; owns the root; a global instance for convenience |
| `Appender` | A destination; `AbstractAppender` adds threshold + formatter (template method) |
| `Formatter` | Strategy: event → text (pattern, JSON) |
| `AsyncAppender` | Decorator: queues events for a background thread |
````

## Step 2 — Where does an event go?

````reveal title="The logger hierarchy as a chain of responsibility"
```text
root (INFO)  [console >= INFO]
 +- shop      (inherits INFO)
     +- shop.db (DEBUG) [dbFile >= DEBUG]
     +- shop.payments (inherits INFO)
```

`shop.db.debug("query took 12 ms")`:
1. Effective level of `shop.db` is `DEBUG`, so the event is created.
2. `shop.db`'s appenders: `dbFile` (threshold DEBUG) writes it.
3. Additive, so pass to `shop` (no appenders), then `root`: `console` has threshold `INFO`, skips it.

Each logger handles the event with its own appenders and passes it to its parent — a chain of responsibility that a non-additive logger stops.
````

## Step 3 — Class design

```uml title="Logging framework"
class LoggerRegistry
  - loggers: ConcurrentHashMap<String, Logger>
  - root: Logger
  + global(): LoggerRegistry
  + getLogger(name: String): Logger
class Logger
  - name: String
  - parent: Logger
  - level: Level
  - additive: boolean
  - appenders: List<Appender>
  + log(level: Level, pattern: String, args: Object...): void
  + isEnabled(level: Level): boolean
  + effectiveLevel(): Level
interface Appender
  + append(e: LogEvent): void
  + close(): void
abstract class AbstractAppender
  - threshold: Level
  - formatter: Formatter
  # write(line: String): void
class ConsoleAppender
class MemoryAppender
class AsyncAppender
  - delegate: Appender
  - queue: BlockingQueue<LogEvent>
  - dropped: AtomicLong
interface Formatter
  + format(e: LogEvent): String
class PatternFormatter
class JsonFormatter
record LogEvent
  + time: Instant
  + level: Level
  + logger: String
  + message: String
  + error: Throwable
LoggerRegistry *-- "1..*" Logger
Logger --> Logger : parent
Logger o-- "0..*" Appender
AbstractAppender ..|> Appender
ConsoleAppender --|> AbstractAppender
MemoryAppender --|> AbstractAppender
AsyncAppender ..|> Appender
AsyncAppender --> Appender : delegate
AbstractAppender --> Formatter
PatternFormatter ..|> Formatter
JsonFormatter ..|> Formatter
```

## Step 4 — Implementation

````hint title="Hint — make disabled logging free"
Check `isEnabled(level)` **first**, before formatting the message or allocating the event. Placeholders (`"took {} ms", ms`) let the caller avoid string concatenation, and a `Supplier<String>` overload defers expensive work entirely.
````

````solution title="Complete Java solution"
```java title="LoggingDemo.java" file="LoggingDemo.java"
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;

public class LoggingDemo {
    public static void main(String[] args) throws InterruptedException {
        LoggerRegistry logs = new LoggerRegistry(Clock.fixed(Instant.parse("2026-05-01T12:00:00Z"), ZoneOffset.UTC));
        logs.root().addAppender(new ConsoleAppender(Level.INFO, new PatternFormatter()));

        Logger shop = logs.getLogger("shop");
        Logger db = logs.getLogger("shop.db");
        db.setLevel(Level.DEBUG);
        MemoryAppender dbFile = new MemoryAppender(Level.DEBUG, new JsonFormatter());
        db.addAppender(dbFile);

        shop.info("server started on port {}", 8080);
        shop.debug(() -> "cache stats: " + expensiveStats());          // disabled: the supplier never runs
        db.debug("query took {} ms", 12);                              // dbFile only (console threshold is INFO)
        db.error("connection lost", new IllegalStateException("timeout"));
        logs.getLogger("shop.payments").warn("retrying payment {} (attempt {})", "P-7", 2);
        db.setAdditive(false);
        db.warn("pool exhausted");                                     // stops at shop.db
        System.out.println("shop.db effective level: " + db.effectiveLevel() + ", shop.payments: " + logs.getLogger("shop.payments").effectiveLevel());
        System.out.println("db file:");
        dbFile.lines().forEach(l -> System.out.println("  " + l));

        MemoryAppender sink = new MemoryAppender(Level.TRACE, new PatternFormatter());
        AsyncAppender async = new AsyncAppender(sink, 64);
        Logger bench = logs.getLogger("bench");
        bench.setAdditive(false);
        bench.addAppender(async);
        List<Thread> threads = new ArrayList<>();
        for (int t = 0; t < 4; t++) {
            Thread th = new Thread(() -> { for (int i = 0; i < 250; i++) bench.warn("event {}", i); });
            threads.add(th);
            th.start();
        }
        for (Thread th : threads) th.join();
        async.close();                                                 // flushes everything still queued
        System.out.println("async: " + sink.lines().size() + " events written, " + async.dropped() + " dropped");
    }

    static String expensiveStats() {
        throw new AssertionError("must not be called when DEBUG is off");
    }
}

// ---------- Core types ----------

enum Level {
    TRACE, DEBUG, INFO, WARN, ERROR;
    boolean isAtLeast(Level other) { return compareTo(other) >= 0; }
}

record LogEvent(Instant time, Level level, String logger, String message, Throwable error) {}

final class MessageFormatter {
    private MessageFormatter() { }

    /** Fills {} placeholders in order; a trailing Throwable that no placeholder used becomes the error. */
    static LogEvent event(Instant time, Level level, String logger, String pattern, Object... args) {
        StringBuilder out = new StringBuilder();
        int argIndex = 0;
        int from = 0;
        for (int at = pattern.indexOf("{}"); at >= 0 && argIndex < args.length; at = pattern.indexOf("{}", from)) {
            out.append(pattern, from, at).append(args[argIndex++]);
            from = at + 2;
        }
        out.append(pattern.substring(from));
        Throwable error = argIndex < args.length && args[args.length - 1] instanceof Throwable t ? t : null;
        return new LogEvent(time, level, logger, out.toString(), error);
    }
}

// ---------- Formatters (strategies) ----------

interface Formatter { String format(LogEvent e); }

final class PatternFormatter implements Formatter {
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm:ss.SSS").withZone(ZoneOffset.UTC);

    public String format(LogEvent e) {
        return TIME.format(e.time()) + " [" + e.level() + "] " + e.logger() + " - " + e.message()
                + (e.error() == null ? "" : " (" + e.error() + ")");
    }
}

final class JsonFormatter implements Formatter {
    public String format(LogEvent e) {
        StringBuilder sb = new StringBuilder("{");
        field(sb, "time", e.time().toString()).append(',');
        field(sb, "level", e.level().name()).append(',');
        field(sb, "logger", e.logger()).append(',');
        field(sb, "message", e.message());
        if (e.error() != null) field(sb.append(','), "error", e.error().toString());
        return sb.append('}').toString();
    }

    private static StringBuilder field(StringBuilder sb, String key, String value) {
        String escaped = value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
        return sb.append('"').append(key).append("\":\"").append(escaped).append('"');
    }
}

// ---------- Appenders ----------

interface Appender {
    void append(LogEvent e);
    default void close() { }
}

/** Template method: threshold check and formatting are fixed; subclasses only write a line. */
abstract class AbstractAppender implements Appender {
    private final Level threshold;
    private final Formatter formatter;

    AbstractAppender(Level threshold, Formatter formatter) {
        this.threshold = threshold;
        this.formatter = formatter;
    }

    public final void append(LogEvent e) {
        if (!e.level().isAtLeast(threshold)) return;
        String line = formatter.format(e);
        synchronized (this) {                                          // one event's output is never interleaved
            write(line);
        }
    }

    protected abstract void write(String line);
}

final class ConsoleAppender extends AbstractAppender {
    ConsoleAppender(Level threshold, Formatter formatter) { super(threshold, formatter); }
    protected void write(String line) { System.out.println(line); }
}

final class MemoryAppender extends AbstractAppender {
    private final List<String> lines = new ArrayList<>();
    MemoryAppender(Level threshold, Formatter formatter) { super(threshold, formatter); }
    protected void write(String line) { lines.add(line); }
    synchronized List<String> lines() { return List.copyOf(lines); }
}

/** Decorator: callers enqueue; one background thread writes to the delegate. */
final class AsyncAppender implements Appender {
    private static final LogEvent STOP = new LogEvent(Instant.EPOCH, Level.ERROR, "", "", null);

    private final Appender delegate;
    private final BlockingQueue<LogEvent> queue;
    private final AtomicLong dropped = new AtomicLong();
    private final Thread worker;
    private volatile boolean closed;

    AsyncAppender(Appender delegate, int capacity) {
        this.delegate = delegate;
        this.queue = new ArrayBlockingQueue<>(capacity);
        this.worker = new Thread(this::drain, "async-appender");
        worker.setDaemon(true);
        worker.start();
    }

    public void append(LogEvent e) {
        if (closed || queue.offer(e)) return;
        if (!e.level().isAtLeast(Level.WARN)) {                        // full: shed low-value events...
            dropped.incrementAndGet();
            return;
        }
        try {
            queue.put(e);                                              // ...but wait for room for WARN and ERROR
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        }
    }

    private void drain() {
        try {
            for (LogEvent e = queue.take(); e != STOP; e = queue.take()) delegate.append(e);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        }
    }

    @Override public void close() {
        closed = true;
        try {
            queue.put(STOP);
            worker.join();
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        }
        for (LogEvent e = queue.poll(); e != null; e = queue.poll()) if (e != STOP) delegate.append(e);   // late arrivals
        delegate.close();
    }

    long dropped() { return dropped.get(); }
}

// ---------- Loggers ----------

final class Logger {
    private final String name;
    private final Logger parent;
    private final Clock clock;
    private final List<Appender> appenders = new CopyOnWriteArrayList<>();
    private volatile Level level;                                      // null: inherit from the parent
    private volatile boolean additive = true;

    Logger(String name, Logger parent, Clock clock) {
        this.name = name;
        this.parent = parent;
        this.clock = clock;
    }

    String name() { return name; }
    void setLevel(Level level) { this.level = level; }
    void setAdditive(boolean additive) { this.additive = additive; }
    void addAppender(Appender a) { appenders.add(a); }

    Level effectiveLevel() {
        for (Logger l = this; l != null; l = l.parent) if (l.level != null) return l.level;
        return Level.INFO;
    }

    boolean isEnabled(Level l) { return l.isAtLeast(effectiveLevel()); }

    void log(Level l, String pattern, Object... args) {
        if (!isEnabled(l)) return;                                     // cheap exit: no formatting, no allocation
        dispatch(MessageFormatter.event(clock.instant(), l, name, pattern, args));
    }

    void log(Level l, Supplier<String> message) {
        if (isEnabled(l)) dispatch(new LogEvent(clock.instant(), l, name, message.get(), null));
    }

    /** Chain of responsibility: this logger's appenders, then the parent's, until a non-additive logger. */
    private void dispatch(LogEvent e) {
        for (Logger l = this; l != null; l = l.parent) {
            for (Appender a : l.appenders) a.append(e);
            if (!l.additive) break;
        }
    }

    void trace(String p, Object... a) { log(Level.TRACE, p, a); }
    void debug(String p, Object... a) { log(Level.DEBUG, p, a); }
    void debug(Supplier<String> m) { log(Level.DEBUG, m); }
    void info(String p, Object... a) { log(Level.INFO, p, a); }
    void warn(String p, Object... a) { log(Level.WARN, p, a); }
    void error(String p, Object... a) { log(Level.ERROR, p, a); }
}

final class LoggerRegistry {
    private static final LoggerRegistry GLOBAL = new LoggerRegistry(Clock.systemUTC());

    private final Map<String, Logger> loggers = new ConcurrentHashMap<>();
    private final Logger root;
    private final Clock clock;

    LoggerRegistry(Clock clock) {
        this.clock = clock;
        this.root = new Logger("root", null, clock);
        root.setLevel(Level.INFO);
    }

    /** Process-wide default, for code that can't have a registry injected. */
    static LoggerRegistry global() { return GLOBAL; }

    Logger root() { return root; }

    Logger getLogger(String name) {
        Logger existing = loggers.get(name);
        if (existing != null) return existing;
        int dot = name.lastIndexOf('.');
        Logger parent = dot < 0 ? root : getLogger(name.substring(0, dot));   // create ancestors first, outside computeIfAbsent
        return loggers.computeIfAbsent(name, n -> new Logger(n, parent, clock));
    }
}
```
````

## Design decisions

- **Level check first.** `log` compares levels before touching the message; with placeholders or a `Supplier`, a disabled `debug` call allocates nothing (the demo's supplier would throw if it ran).
- **Hierarchy as a chain.** Each logger handles an event with its own appenders and passes it to its parent; additivity stops the chain. Configuration lives on a few ancestors instead of every logger (see [Chain of Responsibility](lesson:chain-of-responsibility)).
- **Formatter strategy, appender template.** `AbstractAppender.append` fixes the algorithm (threshold → format → write under a lock); subclasses implement only `write`. JSON vs text is a `Formatter` choice, independent of the destination (see [Single responsibility](lesson:single-responsibility)).
- **Async as a decorator.** `AsyncAppender` wraps any appender, so "async file" and "async console" need no new classes. Its bounded queue protects memory; the drop policy protects latency for low-value events while never losing warnings and errors (see [Coordination](lesson:coordination)).
- **Registry singleton, but injectable.** `LoggerRegistry.global()` serves code that just wants a logger; tests create their own registry with a fixed clock (see [Singleton](lesson:singleton)).

## Patterns and principles

[Chain of Responsibility](lesson:chain-of-responsibility) (logger hierarchy), [Strategy](lesson:strategy) (`Formatter`), [Template Method](lesson:template-method) (`AbstractAppender`), [Decorator](lesson:decorator) (`AsyncAppender`), [Singleton](lesson:singleton) (global registry), [extensible APIs](lesson:extensible-apis), and producer–consumer [coordination](lesson:coordination).

## Example execution flow

```text
shop.info("server started on port {}", 8080)
  effective level of shop = INFO (from root) -> enabled -> message "server started on port 8080"
  shop: no appenders -> root: console >= INFO -> printed
shop.debug(supplier)          DEBUG < INFO -> return before calling the supplier
db.debug("query took {} ms")  shop.db is DEBUG -> dbFile (JSON) writes; console skips (threshold INFO)
db.error(msg, exception)      trailing Throwable -> event.error; dbFile + console
payments.warn(...)            inherits INFO; no own appenders -> console
db.setAdditive(false); db.warn("pool exhausted")  -> dbFile only
4 threads x 250 WARN -> AsyncAppender(queue 64) -> worker -> sink; close() drains the rest
```

```text title="Program output"
12:00:00.000 [INFO] shop - server started on port 8080
12:00:00.000 [ERROR] shop.db - connection lost (java.lang.IllegalStateException: timeout)
12:00:00.000 [WARN] shop.payments - retrying payment P-7 (attempt 2)
shop.db effective level: DEBUG, shop.payments: INFO
db file:
  {"time":"2026-05-01T12:00:00Z","level":"DEBUG","logger":"shop.db","message":"query took 12 ms"}
  {"time":"2026-05-01T12:00:00Z","level":"ERROR","logger":"shop.db","message":"connection lost","error":"java.lang.IllegalStateException: timeout"}
  {"time":"2026-05-01T12:00:00Z","level":"WARN","logger":"shop.db","message":"pool exhausted"}
async: 1000 events written, 0 dropped
```

## Edge cases

- **More placeholders than arguments** → the rest stay as `{}`; **more arguments than placeholders** → extras ignored, except a trailing `Throwable`, which becomes the error.
- **Messages containing quotes or newlines** → escaped in JSON.
- **Asking for `a.b.c` before `a.b`** → ancestors are created on the way.
- **Two threads asking for the same new logger** → `computeIfAbsent` returns one instance.
- **Logging after an async appender is closed** → ignored, never blocks.
- **Full async queue** → `TRACE`–`INFO` dropped and counted; `WARN`/`ERROR` wait.

## Tests

```java title="LoggingTest.java" file="LoggingTest.java" test="LoggingDemo.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class LoggingTest {
    private LoggerRegistry logs;
    private MemoryAppender rootSink;

    @BeforeEach
    void setUp() {
        logs = new LoggerRegistry(Clock.fixed(Instant.parse("2026-01-01T00:00:00Z"), ZoneOffset.UTC));
        rootSink = new MemoryAppender(Level.TRACE, e -> e.level() + " " + e.logger() + " " + e.message());
        logs.root().addAppender(rootSink);
    }

    @Test
    void levelsAreInheritedFromTheNearestConfiguredAncestor() {
        logs.getLogger("a").setLevel(Level.WARN);
        Logger abc = logs.getLogger("a.b.c");
        abc.info("hidden");
        abc.warn("shown");
        assertEquals(List.of("WARN a.b.c shown"), rootSink.lines());
        assertSame(abc, logs.getLogger("a.b.c"));
    }

    @Test
    void appenderThresholdAndAdditivity() {
        Logger db = logs.getLogger("db");
        db.setLevel(Level.DEBUG);
        MemoryAppender errorsOnly = new MemoryAppender(Level.ERROR, e -> e.message());
        db.addAppender(errorsOnly);
        db.debug("d");
        db.error("e");
        assertEquals(List.of("e"), errorsOnly.lines());
        assertEquals(2, rootSink.lines().size());
        db.setAdditive(false);
        db.error("only local");
        assertEquals(2, rootSink.lines().size());
    }

    @Test
    void placeholdersAndTrailingThrowable() {
        LogEvent e = MessageFormatter.event(Instant.EPOCH, Level.ERROR, "x", "{} of {} failed", 3, 5, new RuntimeException("boom"));
        assertEquals("3 of 5 failed", e.message());
        assertEquals("boom", e.error().getMessage());
        assertEquals("missing {}", MessageFormatter.event(Instant.EPOCH, Level.INFO, "x", "missing {}").message());
    }

    @Test
    void lazyMessageIsNotBuiltWhenDisabled() {
        List<String> calls = new ArrayList<>();
        logs.getLogger("lazy").debug(() -> { calls.add("built"); return "x"; });
        assertTrue(calls.isEmpty());
    }

    @Test
    void asyncAppenderDeliversEverythingFromManyThreads() throws InterruptedException {
        MemoryAppender sink = new MemoryAppender(Level.TRACE, LogEvent::message);
        AsyncAppender async = new AsyncAppender(sink, 16);
        Logger l = logs.getLogger("async");
        l.setAdditive(false);
        l.addAppender(async);
        List<Thread> threads = new ArrayList<>();
        for (int t = 0; t < 8; t++) threads.add(new Thread(() -> { for (int i = 0; i < 500; i++) l.error("x"); }));
        threads.forEach(Thread::start);
        for (Thread th : threads) th.join();
        async.close();
        assertEquals(4_000, sink.lines().size());
    }

    @Test
    void asyncAppenderDropsLowLevelEventsWhenFull() throws InterruptedException {
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        List<String> written = new ArrayList<>();
        Appender slow = e -> {
            entered.countDown();
            try { release.await(); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
            synchronized (written) { written.add(e.message()); }
        };
        AsyncAppender async = new AsyncAppender(slow, 1);
        async.append(new LogEvent(Instant.EPOCH, Level.INFO, "x", "first", null));
        assertTrue(entered.await(5, TimeUnit.SECONDS));                 // worker is now stuck writing "first"
        async.append(new LogEvent(Instant.EPOCH, Level.INFO, "x", "queued", null));
        for (int i = 0; i < 5; i++) async.append(new LogEvent(Instant.EPOCH, Level.INFO, "x", "dropped", null));
        assertEquals(5, async.dropped());
        release.countDown();
        async.close();
        assertEquals(List.of("first", "queued"), written);
    }
}
```

## Concurrency

- **Many writers, one destination.** `AbstractAppender` formats outside the lock and writes inside it: lines never interleave, and the expensive part (formatting) runs in parallel.
- **Configuration changes while logging.** Levels and additivity are `volatile`; appender lists are `CopyOnWriteArrayList` — adding an appender at runtime is safe, and iteration never throws.
- **Async appender** is a bounded producer–consumer queue with one consumer, so the delegate sees events from one thread in order. `close()` sends a stop marker, joins the worker, then drains anything that slipped in.
- **Bounded memory is a choice.** An unbounded queue never drops, but a log storm can exhaust memory. Dropping debug noise under pressure is the usual production trade-off.

## Common mistakes and alternatives

- **Building the message before the level check** — `log.debug("x=" + expensive())` pays even when debug is off.
- **A global lock around all logging** — every thread serialises on I/O.
- **`synchronized` formatting with shared `SimpleDateFormat`** — not thread-safe; `DateTimeFormatter` is.
- **Recursive `computeIfAbsent`** to create parent loggers — `ConcurrentHashMap` forbids it ("recursive update"); create the parent first.
- **Losing events on shutdown** — always `close()` async appenders (a shutdown hook in production).

## Follow-up questions

````reveal title="A rolling file appender"
`RollingFileAppender extends AbstractAppender`: writes to `app.log`; before each write, a `RollingPolicy` (Strategy: by size or by day) decides whether to roll — close the file, rename it to `app.2026-05-01.log`, open a new one. Old files beyond a retention count are deleted.
````

````reveal title="Configuration from a file"
Parse a config (`logger.shop.db.level=DEBUG`, `appender.file.type=rolling`) into the same calls the demo makes: create appenders through a factory keyed by type name, attach them, set levels. Reloading at runtime swaps appenders and levels — safe because of the volatile fields and copy-on-write lists.
````

````reveal title="Context per request (MDC)"
A `ThreadLocal<Map<String, String>>` holds context such as `requestId`; `Logger` copies it into each `LogEvent`, and formatters print it. With async appenders, copying at event creation is essential — the worker thread has a different (or empty) context.
````

## Complexity

- Disabled call: O(depth) to find the effective level (cacheable to O(1)).
- Enabled call: O(message length) to format + O(appenders along the chain).
- `getLogger`: O(1) for existing loggers; O(depth) the first time.

## Interviewer checklist

- [ ] Levels with inheritance; cheap disabled path
- [ ] Logger hierarchy and additivity (chain of responsibility)
- [ ] Appenders with thresholds; formatters as strategies
- [ ] Thread safety without a global lock
- [ ] Async appender: bounded queue, drop policy, flush on close
- [ ] Testability: injectable clock and registry
