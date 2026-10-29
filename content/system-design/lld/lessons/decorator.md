## The problem

You want to add **optional responsibilities** to objects — caching, logging, retries, compression, extra toppings — in **any combination**. Subclassing explodes: `LoggingCachingRetryingRepository`, `CachingRetryingRepository`… With *n* optional features you'd need up to 2ⁿ subclasses, all fixed at compile time.

**Decorator** attaches responsibilities dynamically by **wrapping** an object in another object that implements the **same interface**, adds its behaviour, and delegates to the wrapped object. Wrappers can be stacked in any order.

## When to use it — and when not

**Use when:**

- Optional behaviours combine freely (toppings, middleware, I/O streams, cross-cutting concerns).
- You want to add behaviour **without modifying** the original class, often because you don't own it.
- Behaviour should be configurable at runtime.

**Don't use when:**

- There's one fixed combination: just write the class.
- The "decorations" are just data (a list of add-on prices to sum). A simple collection is clearer.
- Order-dependent pipelines with early exit: [Chain of Responsibility](lesson:chain-of-responsibility) fits better.

## Core idea

```text
client ──▶ RetryingGateway ──▶ LoggingGateway ──▶ RealGateway
           (same interface)    (same interface)   (does the work)
```

Each decorator:

1. Implements the component interface.
2. Holds a reference to another component (the one it wraps).
3. Does something before and/or after delegating.

## UML

```uml title="Decorator"
interface Beverage
  + cost(): long
  + description(): String
class Espresso
abstract class AddOn
  # inner: Beverage
class Milk
class ExtraShot
class Caramel
Espresso ..|> Beverage
AddOn ..|> Beverage
AddOn --> Beverage : wraps
Milk --|> AddOn
ExtraShot --|> AddOn
Caramel --|> AddOn
```

## Java implementation

```java title="Stackable behaviour — two examples" file="DecoratorDemo.java"
import java.util.HashMap;
import java.util.Map;

public class DecoratorDemo {
    public static void main(String[] args) {
        // 1. Classic: pricing toppings
        Beverage order = new Caramel(new ExtraShot(new Milk(new Espresso())));
        System.out.println(order.description() + " = Rs " + order.cost());

        // 2. Practical: cross-cutting concerns around a slow service
        PriceService raw = new SlowPriceService();
        PriceService decorated = new LoggingPriceService(new CachingPriceService(raw));
        decorated.priceOf("SKU-1");
        decorated.priceOf("SKU-1");   // served from cache; logging still happens
        System.out.println("Backend calls: " + ((SlowPriceService) raw).calls);
    }
}

// -- Example 1 --
interface Beverage {
    long cost();
    String description();
}

class Espresso implements Beverage {
    public long cost() { return 120; }
    public String description() { return "Espresso"; }
}

abstract class AddOn implements Beverage {
    protected final Beverage inner;
    protected AddOn(Beverage inner) { this.inner = inner; }
}

class Milk extends AddOn {
    Milk(Beverage b) { super(b); }
    public long cost() { return inner.cost() + 30; }
    public String description() { return inner.description() + " + milk"; }
}

class ExtraShot extends AddOn {
    ExtraShot(Beverage b) { super(b); }
    public long cost() { return inner.cost() + 50; }
    public String description() { return inner.description() + " + extra shot"; }
}

class Caramel extends AddOn {
    Caramel(Beverage b) { super(b); }
    public long cost() { return inner.cost() + 40; }
    public String description() { return inner.description() + " + caramel"; }
}

// -- Example 2 --
interface PriceService { long priceOf(String sku); }

class SlowPriceService implements PriceService {
    int calls = 0;
    public long priceOf(String sku) { calls++; return 999; }   // imagine a remote call
}

class CachingPriceService implements PriceService {
    private final PriceService inner;
    private final Map<String, Long> cache = new HashMap<>();
    CachingPriceService(PriceService inner) { this.inner = inner; }
    public long priceOf(String sku) { return cache.computeIfAbsent(sku, inner::priceOf); }
}

class LoggingPriceService implements PriceService {
    private final PriceService inner;
    LoggingPriceService(PriceService inner) { this.inner = inner; }
    public long priceOf(String sku) {
        long start = System.nanoTime();
        long price = inner.priceOf(sku);
        System.out.println("priceOf(" + sku + ") = " + price + " in " + (System.nanoTime() - start) / 1_000 + "us");
        return price;
    }
}
```

Each decorator is small, focused (SRP) and reusable. `CachingPriceService` works around *any* `PriceService`.

## Realistic use case

- **Java I/O:** `new BufferedReader(new InputStreamReader(new GZIPInputStream(fileStream)))` — a stack of decorators.
- **Repositories and clients:** `RetryingPaymentGateway(MetricsPaymentGateway(StripeAdapter))`.
- **Collections:** `Collections.unmodifiableList(list)` and `Collections.synchronizedMap(map)`.
- **Logging frameworks:** formatters and filters wrapping appenders ([Logging Framework](problem:logging-framework)).

## Trade-offs and alternatives

- **Pros:** combinations without subclass explosion; open/closed; each concern is isolated and testable.
- **Cons:** many small objects; debugging through deep wrapper stacks; **order matters** (cache-then-log ≠ log-then-cache); identity checks (`instanceof`) see only the outermost wrapper.
- **Alternatives:**
  - **Data instead of wrappers** — `Order` with `List<AddOn>` and `total = base + sum(addOns)`. Simpler when add-ons only change price and description.
  - **[Chain of Responsibility](lesson:chain-of-responsibility)** — when handlers may stop processing.
  - **[Proxy](lesson:proxy)** — same structure, but the intent is *access control* rather than adding behaviour.
  - **AOP / framework interceptors** — for cross-cutting concerns at scale.

## Recognising it in an interview

- "Pizza with any combination of toppings", "coffee with add-ons".
- "Add caching / logging / retries / rate limiting to an existing service without changing it."
- "Filters or formatters that can be combined."

> [!TIP] In interviews, prefer the simple data version for toppings
> For a pizza or coffee problem, `List<Topping>` summed by the order is usually clearer than decorators. Mention Decorator as an alternative if toppings need **behaviour** (for example, "extra cheese changes bake time"), not just a price.

## Common mistakes

- Decorators that change the **interface** — that's an Adapter.
- Forgetting to delegate some interface methods, so behaviour silently disappears.
- Stateful decorators shared between components.
- Deep stacks built by hand all over the codebase instead of in one factory or composition root.

## Key takeaways

- Decorator **wraps** an object with the **same interface** to add behaviour before or after delegating.
- It avoids subclass explosion and supports **runtime composition**.
- Order of wrapping matters; build stacks in one place.
- For simple priced add-ons, a **list of values** is often simpler.

## Knowledge check

```quiz
? Which is a decorator in the JDK?
+ BufferedReader wrapping another Reader
- ArrayList
- Optional.of
> BufferedReader implements Reader and adds buffering around another Reader.

? You need retries, metrics and caching around a payment client, configurable per environment. Which pattern fits?
- Singleton
+ Decorator
- Abstract Factory
> Independent, stackable behaviours around the same interface are the classic Decorator case.

? What's the key structural difference between Decorator and Adapter?
+ A decorator keeps the same interface and adds behaviour; an adapter converts to a different interface
- A decorator always uses inheritance from the concrete class
- There is no difference
> Same interface + extra behaviour = decorator. Different interface = adapter.
```

## Exercise

Write decorators for `interface DataStore { void put(String key, String value); String get(String key); }`:

1. `EncryptingDataStore` — reverses the string on `put` and reverses it back on `get` (a stand-in for real encryption).
2. `AuditingDataStore` — records every operation in a list.

Show that `new AuditingDataStore(new EncryptingDataStore(new InMemoryDataStore()))` audits plaintext keys while storing "encrypted" values.

````hint title="Hint"
Each decorator implements `DataStore`, holds an inner `DataStore`, and transforms or records before delegating.
````

````solution title="Reference solution"
```java file="DataStoreDecoratorDemo.java"
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class DataStoreDecoratorDemo {
    public static void main(String[] args) {
        InMemoryDataStore raw = new InMemoryDataStore();
        AuditingDataStore store = new AuditingDataStore(new EncryptingDataStore(raw));
        store.put("card", "4111");
        System.out.println("Read back: " + store.get("card"));
        System.out.println("Stored raw: " + raw.dump());
        System.out.println("Audit: " + store.log());
    }
}

interface DataStore {
    void put(String key, String value);
    String get(String key);
}

class InMemoryDataStore implements DataStore {
    private final Map<String, String> map = new HashMap<>();
    public void put(String key, String value) { map.put(key, value); }
    public String get(String key) { return map.get(key); }
    Map<String, String> dump() { return Map.copyOf(map); }
}

class EncryptingDataStore implements DataStore {
    private final DataStore inner;
    EncryptingDataStore(DataStore inner) { this.inner = inner; }
    public void put(String key, String value) { inner.put(key, new StringBuilder(value).reverse().toString()); }
    public String get(String key) {
        String v = inner.get(key);
        return v == null ? null : new StringBuilder(v).reverse().toString();
    }
}

class AuditingDataStore implements DataStore {
    private final DataStore inner;
    private final List<String> log = new ArrayList<>();
    AuditingDataStore(DataStore inner) { this.inner = inner; }
    public void put(String key, String value) { log.add("PUT " + key); inner.put(key, value); }
    public String get(String key) { log.add("GET " + key); return inner.get(key); }
    List<String> log() { return List.copyOf(log); }
}
```
````
