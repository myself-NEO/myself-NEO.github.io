## The technique

**Dependency injection (DI)** means an object **receives** its collaborators instead of **creating or looking them up** itself.

```java
// Without DI: the class decides its own dependencies.
class OrderService {
    private final PaymentGateway gateway = new StripeGateway("sk_live_...");
}

// With DI: someone else decides; the class just declares what it needs.
class OrderService {
    private final PaymentGateway gateway;
    OrderService(PaymentGateway gateway) { this.gateway = gateway; }
}
```

That's all DI is. No framework is required. It's the practical tool for following the [Dependency Inversion Principle](lesson:dependency-inversion), and the single biggest enabler of testable code.

## Three styles

| Style | How | Use when |
|---|---|---|
| **Constructor injection** | Dependencies are constructor parameters, stored in `final` fields | **Default.** Required dependencies; makes objects immutable and always complete |
| **Setter injection** | `setX(...)` after construction | Optional dependencies with sensible defaults; circular-dependency escape hatch (rare) |
| **Method injection** | Passed into the method that needs it | The dependency varies per call (for example, a `Clock` or a request context) |

Constructor injection wins by default because:

- The object **can't exist** without its dependencies — no half-initialised state.
- Fields can be `final`.
- Dependencies are **visible** in one place. A constructor with eight parameters is a loud signal that the class does too much ([SRP](lesson:single-responsibility)).

## The composition root

If nobody creates dependencies internally, *someone* must create them. That place is the **composition root** — usually `main` (or your framework's configuration). It's the only code that knows concrete classes.

```java title="Hand-wired DI with a composition root" file="DiDemo.java"
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;

public class DiDemo {
    public static void main(String[] args) {
        // -- Composition root: build the object graph once --
        Clock clock = Clock.fixed(Instant.parse("2026-01-05T09:00:00Z"), ZoneOffset.UTC);
        IdGenerator ids = new SequentialIds("TKT-");
        TicketRepository repo = new InMemoryTicketRepository();
        Notifier notifier = (user, msg) -> System.out.println("[notify " + user + "] " + msg);

        SupportDesk desk = new SupportDesk(repo, ids, notifier, clock);

        // -- Application code only talks to the top-level object --
        String id = desk.open("asha", "Printer on fire");
        desk.resolve(id);
        System.out.println(repo.findById(id).orElseThrow());
    }
}

record SupportTicket(String id, String user, String summary, Instant openedAt, boolean resolved) {
    SupportTicket resolve() { return new SupportTicket(id, user, summary, openedAt, true); }
}

interface TicketRepository {
    void save(SupportTicket t);
    Optional<SupportTicket> findById(String id);
}
interface IdGenerator { String next(); }
interface Notifier { void notify(String user, String message); }

class SupportDesk {
    private final TicketRepository tickets;
    private final IdGenerator ids;
    private final Notifier notifier;
    private final Clock clock;

    // Every collaborator is explicit, required and final.
    SupportDesk(TicketRepository tickets, IdGenerator ids, Notifier notifier, Clock clock) {
        this.tickets = tickets;
        this.ids = ids;
        this.notifier = notifier;
        this.clock = clock;
    }

    String open(String user, String summary) {
        SupportTicket t = new SupportTicket(ids.next(), user, summary, clock.instant(), false);
        tickets.save(t);
        notifier.notify(user, "Ticket " + t.id() + " opened at " + t.openedAt());
        return t.id();
    }

    void resolve(String id) {
        SupportTicket t = tickets.findById(id).orElseThrow(() -> new IllegalArgumentException("No ticket " + id));
        tickets.save(t.resolve());
        notifier.notify(t.user(), "Ticket " + id + " resolved");
    }
}

class InMemoryTicketRepository implements TicketRepository {
    private final Map<String, SupportTicket> store = new HashMap<>();
    public void save(SupportTicket t) { store.put(t.id(), t); }
    public Optional<SupportTicket> findById(String id) { return Optional.ofNullable(store.get(id)); }
}

class SequentialIds implements IdGenerator {
    private final String prefix;
    private final AtomicLong counter = new AtomicLong();
    SequentialIds(String prefix) { this.prefix = prefix; }
    public String next() { return prefix + counter.incrementAndGet(); }
}
```

Notice that **time** (`Clock`) and **ID generation** are injected too. Hidden calls to `Instant.now()`, `UUID.randomUUID()` or `new Random()` make behaviour non-deterministic and tests flaky.

## Programming to interfaces (without inventing needless ones)

"Program to an interface, not an implementation" means: **declare** variables, fields and parameters by the most general type that offers what you need.

```java
List<Ticket> open = new ArrayList<>();     // GOOD: program to List
ArrayList<Ticket> open = new ArrayList<>();// BAD: needlessly specific
```

For your own types, introduce an interface when:

- There are (or will predictably be) **multiple implementations** — payment providers, storage backends.
- The dependency is **volatile or slow** — I/O, network, time, randomness — and you want to substitute it in tests.
- You want to define a **boundary** owned by the domain ([DIP](lesson:dependency-inversion)).

Don't introduce `IFooService` for every `FooService` by reflex. A concrete class with no external effects (`PriceCalculator`) can be injected directly. You can extract an interface later in seconds.

## DI containers

Frameworks like **Spring** and **Guice** automate the composition root: you annotate classes, and the container builds and injects the graph. They're excellent in large applications. In an LLD interview, **hand-wire in `main`**. It shows you understand what the container does, and it keeps the code framework-free.

## Real-world example

A team's integration tests took 25 minutes because `ReportService` created its own `S3Client` and `PostgresConnection`. Converting to constructor injection took an afternoon; most tests then ran against in-memory fakes in seconds, and only a small suite exercised the real infrastructure.

## Common mistakes

- **`new` inside business logic** for volatile dependencies.
- **Service locator** (`ServiceRegistry.get(Mailer.class)`) — dependencies are still hidden; tests must configure global state.
- **Injecting the container** itself into classes.
- **Field injection** (`@Autowired private Mailer mailer;`) in framework code — fields can't be `final`, and the class can't be constructed without the framework.
- **Constructor bloat** — eight dependencies means the class has several responsibilities; split it.

## In the interview

> [!INTERVIEW] What to show
> Write constructors that take interfaces, and finish with a small `main` (or a "wiring" comment) that builds the graph. When asked about testing, say: *"Everything external is injected — repository, clock, ID generator — so the core logic runs in a plain unit test."*

## Key takeaways

- DI = receive collaborators instead of creating them. **Constructor injection** is the default.
- A **composition root** (`main`) is the only place that knows concrete classes.
- Inject **time, randomness and IDs** for deterministic tests.
- Program to interfaces where implementations vary or are volatile; don't create interfaces reflexively.
- No framework is needed; containers just automate the wiring.

## Knowledge check

```quiz
? Why is constructor injection usually preferred over setter injection?
+ The object can't be created without its required dependencies, and fields can be final
- It's faster at runtime
- Setters are not allowed in Java
> Constructor injection guarantees complete, immutable wiring.

? A class calls `Instant.now()` to decide whether a coupon has expired. What's the best DI improvement?
- Mock the static method with reflection
+ Inject a java.time.Clock and call clock.instant()
- Pass the current time as a String
> Injecting Clock makes time controllable in tests and keeps the code simple.

? Where should concrete classes like StripeGateway be instantiated?
- Inside every service that needs payments
+ In the composition root (main or framework configuration)
- In a static field of the PaymentGateway interface
> Only the composition root should know the concrete classes.
```

## Exercise

Refactor this rate limiter so it can be tested deterministically, then write the wiring code for production and for a test:

```java
class ApiRateLimiter {
    private final Map<String, Deque<Long>> hits = new HashMap<>();
    boolean allow(String clientId) {
        long now = System.currentTimeMillis();
        Deque<Long> q = hits.computeIfAbsent(clientId, k -> new ArrayDeque<>());
        while (!q.isEmpty() && now - q.peekFirst() >= 60_000) q.pollFirst();
        if (q.size() >= 100) return false;
        q.addLast(now);
        return true;
    }
}
```

````hint title="Hint"
What's hidden? The time source, and arguably the limit and the window. Which should be constructor parameters?
````

````solution title="Reference solution"
```java file="RateLimiterDiDemo.java"
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.Map;

public class RateLimiterDiDemo {
    public static void main(String[] args) {
        MutableClock clock = new MutableClock(Instant.parse("2026-01-01T00:00:00Z"));
        SlidingWindowLimiter limiter = new SlidingWindowLimiter(2, Duration.ofSeconds(60), clock);  // test wiring

        System.out.println(limiter.allow("c1"));   // true
        System.out.println(limiter.allow("c1"));   // true
        System.out.println(limiter.allow("c1"));   // false: limit reached
        clock.advance(Duration.ofSeconds(61));
        System.out.println(limiter.allow("c1"));   // true: window moved on

        // Production wiring: new SlidingWindowLimiter(100, Duration.ofMinutes(1), Clock.systemUTC());
    }
}

class SlidingWindowLimiter {
    private final int limit;
    private final Duration window;
    private final Clock clock;
    private final Map<String, Deque<Instant>> hits = new HashMap<>();

    SlidingWindowLimiter(int limit, Duration window, Clock clock) {
        if (limit <= 0) throw new IllegalArgumentException("limit must be > 0");
        this.limit = limit;
        this.window = window;
        this.clock = clock;
    }

    boolean allow(String clientId) {
        Instant now = clock.instant();
        Deque<Instant> q = hits.computeIfAbsent(clientId, k -> new ArrayDeque<>());
        while (!q.isEmpty() && !q.peekFirst().plus(window).isAfter(now)) q.pollFirst();
        if (q.size() >= limit) return false;
        q.addLast(now);
        return true;
    }
}

/** A tiny controllable clock for tests. */
class MutableClock extends Clock {
    private Instant now;
    MutableClock(Instant start) { this.now = start; }
    void advance(Duration d) { now = now.plus(d); }
    @Override public Instant instant() { return now; }
    @Override public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
    @Override public Clock withZone(java.time.ZoneId zone) { return this; }
}
```

The limiter isn't thread-safe yet; the [Rate Limiter](problem:rate-limiter) problem adds that.
````
