## The problem

Sometimes you need to **control access** to an object without changing it or its callers:

- It's **expensive** to create or call (a remote service, a large image), so you want to create it lazily or cache its results.
- Calls must be **authorised**, **rate-limited** or **audited**.
- It lives **elsewhere** (another process or machine), and you want callers to treat it like a local object.

**Proxy** provides a **stand-in** object with the **same interface** as the real subject. The proxy decides whether, when and how to forward calls.

## When to use it — and when not

**Use when** you need one of the classic proxy roles:

| Proxy type | Controls | Example |
|---|---|---|
| **Virtual** | *When* the real object is created | Load a high-resolution image only when displayed |
| **Protection** | *Who* may call | Only admins may call `deleteUser` |
| **Caching** | *Whether* the real call is needed | Cache exchange rates for 60 seconds |
| **Remote** | *Where* the object lives | An RPC/gRPC client stub that looks like a local interface |
| **Rate-limiting / circuit-breaking** | *How often* calls go through | Reject calls above 10/s; stop calling a failing service |

**Don't use when** you're adding general-purpose behaviour such as formatting or extra features — that's a [Decorator](lesson:decorator).

## Core idea

Structurally, Proxy and Decorator look the same: both implement the subject's interface and hold a reference to a real object. The difference is **intent**:

- A **decorator** *adds responsibilities*; you typically stack several.
- A **proxy** *controls access* to one real subject, and it often manages that subject's lifecycle (creating it lazily, for example).

## UML

```uml title="Proxy"
interface ExchangeRates
  + rate(from: String, to: String): double
class RemoteExchangeRates
class CachingRatesProxy
  - real: ExchangeRates
  - cache: Map<String, CachedRate>
  - ttl: Duration
class PricingService
RemoteExchangeRates ..|> ExchangeRates
CachingRatesProxy ..|> ExchangeRates
CachingRatesProxy --> RemoteExchangeRates : controls access
PricingService --> ExchangeRates
```

## Java implementation

```java title="Caching, lazy and protection proxies" file="ProxyDemo.java"
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;

public class ProxyDemo {
    public static void main(String[] args) {
        // Caching proxy with an injected clock
        MutableClock clock = new MutableClock(Instant.parse("2026-01-01T00:00:00Z"));
        RemoteExchangeRates remote = new RemoteExchangeRates();
        ExchangeRates rates = new CachingRatesProxy(remote, Duration.ofSeconds(60), clock);
        rates.rate("USD", "INR");
        rates.rate("USD", "INR");                   // cache hit
        clock.advance(Duration.ofSeconds(61));
        rates.rate("USD", "INR");                   // expired -> remote again
        System.out.println("Remote calls: " + remote.calls);

        // Virtual (lazy) proxy
        Report report = new LazyReport(() -> new HeavyReport("Q3"));
        System.out.println("Proxy created; report not loaded yet");
        System.out.println(report.title());          // triggers loading

        // Protection proxy
        UserAdmin admin = new AuthorisedUserAdmin(new RealUserAdmin(), () -> "ravi", Set.of("asha"));
        try {
            admin.deleteUser("u42");
        } catch (SecurityException e) {
            System.out.println("Denied: " + e.getMessage());
        }
    }
}

// -- Caching proxy --
interface ExchangeRates { double rate(String from, String to); }

class RemoteExchangeRates implements ExchangeRates {
    int calls = 0;
    public double rate(String from, String to) { calls++; return 83.2; }   // imagine an HTTP call
}

class CachingRatesProxy implements ExchangeRates {
    private record Cached(double value, Instant fetchedAt) {}

    private final ExchangeRates real;
    private final Duration ttl;
    private final Clock clock;
    private final Map<String, Cached> cache = new HashMap<>();

    CachingRatesProxy(ExchangeRates real, Duration ttl, Clock clock) {
        this.real = real;
        this.ttl = ttl;
        this.clock = clock;
    }

    public double rate(String from, String to) {
        String key = from + "->" + to;
        Instant now = clock.instant();
        Cached c = cache.get(key);
        if (c != null && c.fetchedAt().plus(ttl).isAfter(now)) return c.value();
        double fresh = real.rate(from, to);
        cache.put(key, new Cached(fresh, now));
        return fresh;
    }
}

// -- Virtual proxy --
interface Report { String title(); }

class HeavyReport implements Report {
    private final String quarter;
    HeavyReport(String quarter) {
        this.quarter = quarter;
        System.out.println("Loading 50MB of data for " + quarter + "...");
    }
    public String title() { return "Sales report " + quarter; }
}

class LazyReport implements Report {
    private final Supplier<Report> loader;
    private Report real;                       // created on first use

    LazyReport(Supplier<Report> loader) { this.loader = loader; }

    public String title() {
        if (real == null) real = loader.get();
        return real.title();
    }
}

// -- Protection proxy --
interface UserAdmin { void deleteUser(String userId); }

class RealUserAdmin implements UserAdmin {
    public void deleteUser(String userId) { System.out.println("Deleted " + userId); }
}

class AuthorisedUserAdmin implements UserAdmin {
    private final UserAdmin real;
    private final Supplier<String> currentUser;
    private final Set<String> admins;

    AuthorisedUserAdmin(UserAdmin real, Supplier<String> currentUser, Set<String> admins) {
        this.real = real;
        this.currentUser = currentUser;
        this.admins = Set.copyOf(admins);
    }

    public void deleteUser(String userId) {
        String who = currentUser.get();
        if (!admins.contains(who)) throw new SecurityException(who + " may not delete users");
        real.deleteUser(userId);
    }
}

class MutableClock extends Clock {
    private Instant now;
    MutableClock(Instant start) { now = start; }
    void advance(Duration d) { now = now.plus(d); }
    @Override public Instant instant() { return now; }
    @Override public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
    @Override public Clock withZone(java.time.ZoneId zone) { return this; }
}
```

The caching and lazy proxies above are **not thread-safe**. In a concurrent setting, use `ConcurrentHashMap` and a thread-safe lazy initialisation — see [Locks & Atomics](lesson:locks-and-atomics).

## Realistic use case

- **ORMs** (Hibernate) return lazy-loading proxies for associations: `order.getCustomer()` hits the database only when used.
- **Spring** wraps beans in proxies for `@Transactional`, `@Cacheable` and security annotations.
- **gRPC/RMI client stubs** are remote proxies.
- **`java.lang.reflect.Proxy`** creates proxies dynamically at runtime for any interface.
- In LLD problems: a caching proxy in front of a slow repository ([Cache with Eviction](problem:cache-eviction)), or a rate-limiting proxy in front of an API client ([Rate Limiter](problem:rate-limiter)).

## Trade-offs and alternatives

- **Pros:** access control without touching the real class or its callers; transparent laziness, caching and remoting.
- **Cons:** hidden costs (a "local" call that's actually remote); stale caches; harder debugging; framework proxies can surprise you (for example, self-invocation bypasses Spring's proxy).
- **Alternatives:** explicit calls (`cache.getOrLoad(key, loader)`) are more visible; [Decorator](lesson:decorator) for adding behaviour; dedicated libraries (Caffeine for caching, Resilience4j for rate limits and circuit breakers).

## Recognising it in an interview

- "The service is slow — add caching without changing callers."
- "Only admins should be able to…" when the check must wrap an existing interface.
- "Load X only when needed."

## Common mistakes

- Calling a decorator a proxy, or the reverse. Name the intent.
- Unbounded caches in caching proxies (memory leaks). Add TTL or size limits.
- Proxies that **change semantics** (returning stale data where freshness is required).
- Non-thread-safe lazy initialisation in concurrent code.

## Key takeaways

- Proxy = a **stand-in** with the **same interface** that **controls access** to the real subject.
- Common kinds: **virtual (lazy), protection, caching, remote, rate-limiting**.
- It's structurally similar to Decorator; the difference is **intent**.
- Mind staleness, thread safety and hidden costs.

## Knowledge check

```quiz
? Hibernate returns an object that loads the associated customer from the database only when it's first accessed. Which proxy type is that?
+ Virtual (lazy-loading) proxy
- Protection proxy
- Adapter
> It defers creating or loading the real object until it's needed.

? What primarily distinguishes Proxy from Decorator?
- Proxies use a different interface
+ Intent: a proxy controls access to the real subject; a decorator adds responsibilities
- Decorators can't hold references
> Their structure is similar; their purpose differs.

? What's a key risk of a caching proxy?
- It changes the interface
+ Serving stale data or growing without bound if TTL and size aren't managed
- It can't be used with interfaces
> Caches need expiry and size policies.
```

## Exercise

Write a `RateLimitedWeatherClient` proxy for `interface WeatherClient { String forecast(String city); }` that allows at most **N calls per minute** (injected `Clock`) and throws `RateLimitExceededException` beyond that. Then explain in two sentences how you'd combine it with a caching proxy, and in which order.

````hint title="Hint"
Keep a deque of call timestamps; drop those older than a minute before checking the count.
````

````solution title="Sample answer"
```java
class RateLimitedWeatherClient implements WeatherClient {
    private final WeatherClient real; private final int limit; private final Clock clock;
    private final Deque<Instant> calls = new ArrayDeque<>();

    RateLimitedWeatherClient(WeatherClient real, int limit, Clock clock) { this.real = real; this.limit = limit; this.clock = clock; }

    public synchronized String forecast(String city) {
        Instant now = clock.instant();
        while (!calls.isEmpty() && !calls.peekFirst().plusSeconds(60).isAfter(now)) calls.pollFirst();
        if (calls.size() >= limit) throw new RateLimitExceededException("limit " + limit + "/min");
        calls.addLast(now);
        return real.forecast(city);
    }
}
```

**Ordering:** put the **caching proxy outside** the rate limiter — `new CachingWeatherClient(new RateLimitedWeatherClient(real, 10, clock))`. Cache hits then never consume the rate budget; only real misses are counted. The [Rate Limiter](problem:rate-limiter) problem covers stronger algorithms and thread safety.
````
