## Concept explanation

**Design patterns** are named, reusable solutions to recurring design problems. They come from the "Gang of Four" (GoF) book of 1994. Their real value is a **shared vocabulary**: "wrap it in a decorator" says a lot in four words. Modern Java changed how many of them look:
- **lambdas** replace one-method strategy and command classes;
- **records** make value objects trivial;
- **enums** give safe singletons and state machines;
- **sealed types plus pattern matching** often replace the Visitor.

### The catalogue, with JDK examples

| Pattern | Intent | In the JDK and frameworks |
|---|---|---|
| **Builder** | construct complex objects step by step, validate once, then make them immutable | `StringBuilder`, `HttpRequest.newBuilder()`, `Stream.builder()`, Lombok `@Builder` |
| **Static factory** | named creation methods that can cache, choose a subtype or validate | `List.of`, `Integer.valueOf`, `Optional.of`, `Path.of`, `EnumSet.of` |
| **Abstract factory** | create families of related objects without naming classes | `DocumentBuilderFactory`, `XMLInputFactory`, JDBC `Connection` → `Statement` |
| **Singleton** | exactly one instance | `Runtime.getRuntime()`; prefer an **enum** or a DI-managed singleton |
| **Adapter** | make one interface usable as another | `Arrays.asList` (array → `List`), `InputStreamReader` (bytes → chars) |
| **Decorator** | add behaviour by wrapping an object with the same interface | `BufferedInputStream`, `Collections.unmodifiableList`, `synchronizedMap` |
| **Proxy** | control access to an object | `java.lang.reflect.Proxy`, Spring AOP, Hibernate lazy loading |
| **Facade** | a simple front to a complex subsystem | `java.nio.file.Files`, `HttpClient`, Spring's `JdbcTemplate` |
| **Composite** | treat individual objects and groups uniformly | Swing `Container`/`Component`, JSON trees (`JsonNode`) |
| **Flyweight** | share immutable instances | `Integer` cache (-128..127), string pool, enum constants |
| **Strategy** | interchangeable algorithms behind one interface | `Comparator`, `RejectedExecutionHandler`, Spring `PasswordEncoder` |
| **Template method** | fixed algorithm skeleton with overridable steps | `AbstractList`, `HttpServlet.service` → `doGet`, `AbstractQueuedSynchronizer` |
| **Observer** | notify subscribers of events | listeners, `Flow.Publisher`, Spring `ApplicationEvent`, reactive streams |
| **Chain of responsibility** | pass a request along handlers until one handles or rejects it | servlet `Filter`s, Spring Security's filter chain, logging handlers |
| **Command** | an action as an object (queue, log, undo) | `Runnable`, `Callable`, `ExecutorService.submit` |
| **State** | behaviour depends on internal state, with explicit transitions | enum state machines, Spring Statemachine |
| **Iterator** | traverse without exposing the structure | `Iterator`/`Iterable`, `Spliterator` |
| **Visitor** | add operations over a fixed type hierarchy | `FileVisitor`, `javax.lang.model` element visitors; sealed + `switch` (Java 21) is the modern alternative |

**Patterns are tools, not goals.** Use one when it removes a real problem (duplication, rigid conditionals, hard-to-test code), and name it in code review. Avoid "pattern-itis": factories of factories for one implementation.

## Internal working

- **Builder** keeps the object immutable: the builder is mutable and holds partial state, and `build()` validates **cross-field invariants** once (a GET with a body, missing required fields) before calling the private constructor. With records, a builder is mostly needed when there are many optional fields. Java has no named or default parameters, so the builder is the idiomatic substitute.
- **Static factories vs constructors**: factories have names (`Duration.ofSeconds`), can return **cached instances** (`Integer.valueOf`, `Boolean.valueOf`), can return **subtypes** (`List.of` returns compact internal `ImmutableCollections.ListN`/`List12` classes), and can validate before allocating. Constructors always allocate a new instance of exactly that class.
- **Enum singleton**: the JVM guarantees enum constants are created once during class initialisation, which is thread-safe. They're also serialisation-safe (deserialisation resolves by name) and reflection-safe (`Constructor.newInstance` refuses enums). In applications, prefer a **DI-managed singleton** (one bean), which is testable and replaceable, over a global static one.
- **Decorator vs inheritance**: decorators compose at run time (`new BufferedReader(new InputStreamReader(new GZIPInputStream(in)))`), whereas subclassing would need a class for every combination. Decorators **delegate**, so they don't see self-calls within the wrapped object (the same trap as proxies).
- **Observer pitfalls**:
  - listeners are strong references, so forgetting to unsubscribe leaks memory (JVM stage);
  - synchronous notification runs listeners on the publisher's thread, so one slow listener blocks everyone;
  - modifying the listener list during notification needs a copy-on-write list.
- **Template method vs strategy**: template method uses **inheritance** (the subclass fills in hooks, and the skeleton is `final`); strategy uses **composition** (the algorithm is injected). Composition is usually more flexible and easier to test.
- **Visitor vs sealed types**: a classic visitor uses double dispatch (`node.accept(visitor)` → `visitor.visitX(this)`) to add operations without editing node classes. Java 21 sealed interfaces with exhaustive pattern-matching `switch` give the same benefit with less ceremony, and the compiler checks exhaustiveness.

## Visual representation

```text title="Structural patterns: wrap, adapt, simplify"
 Decorator:  client -> Dedup( Prefix( Console ) )      each wrapper implements Notifier and delegates
 Adapter:    client -> TemperatureSource (Celsius) --adapts--> LegacyThermometer (tenths of Fahrenheit)
 Facade:     client -> CheckoutFacade.placeOrder() --> Inventory, Payments, Shipping (hidden subsystem)
 Composite:  Bundle(price = sum of children - 10%) --> Product, Product, Bundle(...)

 Behavioural:
 Strategy:   sort(orders, comparator)                choose the algorithm at the call site
 Chain:      order -> [StockCheck] -> [FraudCheck] -> [LimitCheck] -> accepted   (first failure stops)
 State:      NEW --pay--> PAID --ship--> SHIPPED --deliver--> DELIVERED    (illegal moves rejected)
 Observer:   bus.publish(event) -> listener1, listener2 ...  (unsubscribe to avoid leaks)
```

## Java code example

**Creational and structural patterns**:

```java title="StructuralPatterns.java" file="StructuralPatterns.java"
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

public class StructuralPatterns {
    // ---- Builder: many optional parts, validated once, immutable result
    static final class RequestSpec {
        private final String method, url, body;
        private final Map<String, String> headers;
        private final Duration timeout;

        private RequestSpec(Builder b) {
            method = b.method;
            url = b.url;
            body = b.body;
            headers = Collections.unmodifiableMap(new LinkedHashMap<>(b.headers));
            timeout = b.timeout;
        }

        static Builder get(String url) { return new Builder("GET", url); }
        static Builder post(String url) { return new Builder("POST", url); }

        @Override
        public String toString() {
            return method + " " + url + " headers=" + headers + " timeout=" + timeout.toSeconds() + "s" + (body == null ? "" : " body=" + body);
        }

        static final class Builder {
            private final String method, url;
            private final Map<String, String> headers = new LinkedHashMap<>();
            private Duration timeout = Duration.ofSeconds(10);
            private String body;

            private Builder(String method, String url) {
                this.method = method;
                this.url = url;
            }

            Builder header(String name, String value) { headers.put(name, value); return this; }
            Builder timeout(Duration d) { timeout = d; return this; }
            Builder body(String b) { body = b; return this; }

            RequestSpec build() {
                if (!url.startsWith("https://")) throw new IllegalStateException("only https URLs allowed");
                if (method.equals("GET") && body != null) throw new IllegalStateException("GET must not have a body");
                return new RequestSpec(this);
            }
        }
    }

    // ---- Static factory + flyweight cache
    static final class Currency {
        private static final Map<String, Currency> CACHE = new ConcurrentHashMap<>();
        private static final Set<String> SUPPORTED = Set.of("USD", "EUR", "INR");
        final String code;

        private Currency(String code) { this.code = code; }

        static Currency of(String code) {
            String normalized = code.trim().toUpperCase(Locale.ROOT);
            if (!SUPPORTED.contains(normalized)) throw new IllegalArgumentException("unsupported currency " + code);
            return CACHE.computeIfAbsent(normalized, Currency::new);
        }
    }

    // ---- Singleton: an enum
    enum OrderNumbers {
        INSTANCE;
        private final AtomicLong next = new AtomicLong(1_000);
        long next() { return next.getAndIncrement(); }
    }

    // ---- Adapter: legacy API with a different interface
    static final class LegacyThermometer {
        int readTenthsFahrenheit() { return 986; }            // 98.6 F
    }

    interface TemperatureSource { double celsius(); }

    static final class ThermometerAdapter implements TemperatureSource {
        private final LegacyThermometer legacy;
        ThermometerAdapter(LegacyThermometer legacy) { this.legacy = legacy; }
        @Override public double celsius() { return (legacy.readTenthsFahrenheit() / 10.0 - 32) * 5 / 9; }
    }

    // ---- Decorator: stack behaviour around a Notifier
    interface Notifier { void send(String message); }

    static Notifier console() { return m -> System.out.println("    sent: " + m); }

    static Notifier withPrefix(String prefix, Notifier inner) { return m -> inner.send(prefix + m); }

    static Notifier deduplicating(Notifier inner) {
        Set<String> seen = new HashSet<>();
        return m -> {
            if (seen.add(m)) inner.send(m);
            else System.out.println("    (duplicate suppressed)");
        };
    }

    // ---- Composite: products and bundles priced uniformly
    interface Item { String name(); long priceCents(); }

    record Product(String name, long priceCents) implements Item { }

    record Bundle(String name, List<Item> items, int discountPercent) implements Item {
        public long priceCents() {
            long sum = items.stream().mapToLong(Item::priceCents).sum();
            return sum - sum * discountPercent / 100;
        }
    }

    // ---- Facade: one call hides three subsystems
    static final class CheckoutFacade {
        private final List<String> audit = new ArrayList<>();

        String placeOrder(String sku, int qty) {
            audit.add("inventory.reserve(" + sku + ", " + qty + ")");
            audit.add("payments.charge()");
            audit.add("shipping.schedule()");
            return "order " + OrderNumbers.INSTANCE.next() + " placed via " + audit;
        }
    }

    public static void main(String[] args) {
        System.out.println("Builder: " + RequestSpec.post("https://api.example.com/orders")
                .header("Content-Type", "application/json").timeout(Duration.ofSeconds(3)).body("{\"sku\":\"A1\"}").build());
        try {
            RequestSpec.get("https://api.example.com/orders").body("oops").build();
        } catch (IllegalStateException e) {
            System.out.println("Builder validation: " + e.getMessage());
        }

        System.out.println("Static factory + flyweight: Currency.of(\"usd\") == Currency.of(\" USD \"): "
                + (Currency.of("usd") == Currency.of(" USD ")));
        System.out.println("JDK flyweight: Integer.valueOf(127) == Integer.valueOf(127): " + (Integer.valueOf(127) == Integer.valueOf(127))
                + ", Integer.valueOf(128) == Integer.valueOf(128): " + (Integer.valueOf(128) == Integer.valueOf(128)));

        System.out.println("Singleton: " + OrderNumbers.INSTANCE.next() + ", " + OrderNumbers.INSTANCE.next());

        TemperatureSource source = new ThermometerAdapter(new LegacyThermometer());
        System.out.printf("Adapter: legacy 986 tenths-F -> %.1f C%n", source.celsius());
        String[] array = { "b", "a", "c" };
        List<String> view = Arrays.asList(array);              // JDK adapter: array -> List, write-through
        Collections.sort(view);
        System.out.println("JDK adapter Arrays.asList: sorting the list sorted the array too: " + Arrays.toString(array));

        System.out.println("Decorator chain:");
        Notifier notifier = deduplicating(withPrefix("[shop] ", console()));
        notifier.send("order shipped");
        notifier.send("order shipped");
        notifier.send("order delivered");
        List<String> readOnly = Collections.unmodifiableList(new ArrayList<>(List.of("x")));
        try {
            readOnly.add("y");
        } catch (UnsupportedOperationException e) {
            System.out.println("JDK decorator Collections.unmodifiableList blocked add()");
        }

        Item kit = new Bundle("starter kit", List.of(
                new Product("keyboard", 4_999),
                new Product("mouse", 1_999),
                new Bundle("cable pack", List.of(new Product("usb-c", 999), new Product("hdmi", 1_499)), 20)), 10);
        System.out.println("Composite: " + kit.name() + " costs " + kit.priceCents() + " cents");

        System.out.println("Facade: " + new CheckoutFacade().placeOrder("A1", 2));
    }
}
```

**Behavioural patterns**:

```java title="BehavioralPatterns.java" file="BehavioralPatterns.java"
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;
import java.util.function.ToLongFunction;

public class BehavioralPatterns {
    record Order(String id, String customer, long totalCents, int items, boolean expressShipping) { }

    // ---- Strategy: interchangeable shipping cost algorithms
    static final Map<String, ToLongFunction<Order>> SHIPPING = Map.of(
            "flat", o -> 499,
            "per-item", o -> 150L * o.items(),
            "free-over-50", o -> o.totalCents() >= 5_000 ? 0 : 599);

    // ---- Template method: fixed skeleton, overridable steps
    abstract static class Exporter {
        final String export(List<Order> orders) {              // final: subclasses can't change the order of steps
            StringBuilder out = new StringBuilder(header());
            for (Order o : orders) out.append(row(o));
            return out.append(footer(orders.size())).toString();
        }

        abstract String header();
        abstract String row(Order o);
        String footer(int count) { return ""; }                  // optional hook
    }

    static final class CsvExporter extends Exporter {
        String header() { return "id,customer,total\n"; }
        String row(Order o) { return o.id() + "," + o.customer() + "," + o.totalCents() + "\n"; }
    }

    static final class MarkdownExporter extends Exporter {
        String header() { return "| id | customer | total |\n|---|---|---|\n"; }
        String row(Order o) { return "| " + o.id() + " | " + o.customer() + " | " + o.totalCents() + " |\n"; }
        @Override String footer(int count) { return "\n" + count + " orders\n"; }
    }

    // ---- Chain of responsibility: the first handler that rejects stops the chain
    interface Check { Optional<String> reject(Order o); }

    static final List<Check> CHECKS = List.of(
            o -> o.items() <= 0 ? Optional.of("empty order") : Optional.empty(),
            o -> o.totalCents() > 100_000 ? Optional.of("over the auto-approve limit, needs review") : Optional.empty(),
            o -> o.customer().startsWith("blocked") ? Optional.of("customer blocked by fraud check") : Optional.empty());

    static String validate(Order o) {
        for (Check c : CHECKS) {
            Optional<String> reason = c.reject(o);
            if (reason.isPresent()) return "rejected: " + reason.get();
        }
        return "accepted";
    }

    // ---- Observer: an event bus with unsubscribe
    static final class EventBus<E> {
        private final List<Consumer<E>> listeners = new CopyOnWriteArrayList<>();

        Runnable subscribe(Consumer<E> listener) {
            listeners.add(listener);
            return () -> listeners.remove(listener);             // call to unsubscribe (avoid leaks)
        }

        void publish(E event) { listeners.forEach(l -> l.accept(event)); }
    }

    // ---- Command with undo
    interface Command { void execute(); void undo(); String name(); }

    static final class Cart {
        final List<String> items = new ArrayList<>();
        private final Deque<Command> history = new ArrayDeque<>();

        void run(Command c) { c.execute(); history.push(c); }
        void undo() { Command c = history.pop(); c.undo(); System.out.println("  undo " + c.name() + " -> " + items); }

        Command add(String item) {
            return new Command() {
                public void execute() { items.add(item); }
                public void undo() { items.remove(items.size() - 1); }
                public String name() { return "add " + item; }
            };
        }
    }

    // ---- Iterator: a custom Iterable usable in for-each
    record Range(int from, int to, int step) implements Iterable<Integer> {
        public Iterator<Integer> iterator() {
            return new Iterator<>() {
                int next = from;
                public boolean hasNext() { return next < to; }
                public Integer next() {
                    if (!hasNext()) throw new NoSuchElementException();
                    int current = next;
                    next += step;
                    return current;
                }
            };
        }
    }

    // ---- Visitor (classic double dispatch)
    interface Node { <R> R accept(Visitor<R> v); }
    record Num(int value) implements Node { public <R> R accept(Visitor<R> v) { return v.visitNum(this); } }
    record Add(Node left, Node right) implements Node { public <R> R accept(Visitor<R> v) { return v.visitAdd(this); } }
    record Mul(Node left, Node right) implements Node { public <R> R accept(Visitor<R> v) { return v.visitMul(this); } }

    interface Visitor<R> { R visitNum(Num n); R visitAdd(Add a); R visitMul(Mul m); }

    static final Visitor<Integer> EVAL = new Visitor<>() {
        public Integer visitNum(Num n) { return n.value(); }
        public Integer visitAdd(Add a) { return a.left().accept(this) + a.right().accept(this); }
        public Integer visitMul(Mul m) { return m.left().accept(this) * m.right().accept(this); }
    };

    static final Visitor<String> PRINT = new Visitor<>() {
        public String visitNum(Num n) { return String.valueOf(n.value()); }
        public String visitAdd(Add a) { return "(" + a.left().accept(this) + " + " + a.right().accept(this) + ")"; }
        public String visitMul(Mul m) { return a(m.left()) + " * " + a(m.right()); }
        private String a(Node n) { return n.accept(this); }
    };

    public static void main(String[] args) {
        List<Order> orders = List.of(
                new Order("o-3", "cy", 12_000, 4, false),
                new Order("o-1", "ada", 2_500, 1, true),
                new Order("o-2", "bob", 7_800, 3, false));

        System.out.println("Strategy (Comparator): " + orders.stream()
                .sorted(Comparator.comparing(Order::expressShipping).reversed().thenComparing(Order::totalCents))
                .map(Order::id).toList());
        for (String name : List.of("flat", "per-item", "free-over-50")) {
            System.out.println("Strategy (shipping " + name + "): " + orders.stream().map(o -> SHIPPING.get(name).applyAsLong(o)).toList());
        }

        System.out.print("Template method (CSV):\n" + new CsvExporter().export(orders));
        System.out.print("Template method (Markdown):\n" + new MarkdownExporter().export(orders));

        for (Order o : List.of(orders.get(0), new Order("o-9", "blocked-user", 900, 1, false),
                new Order("o-8", "eve", 250_000, 2, false), new Order("o-7", "fay", 0, 0, false))) {
            System.out.println("Chain of responsibility " + o.id() + ": " + validate(o));
        }

        EventBus<String> bus = new EventBus<>();
        Runnable unsubscribeEmail = bus.subscribe(e -> System.out.println("  email listener: " + e));
        bus.subscribe(e -> System.out.println("  analytics listener: " + e));
        System.out.println("Observer:");
        bus.publish("order o-1 paid");
        unsubscribeEmail.run();
        bus.publish("order o-2 paid");

        System.out.println("Command with undo:");
        Cart cart = new Cart();
        cart.run(cart.add("book"));
        cart.run(cart.add("pen"));
        System.out.println("  items " + cart.items);
        cart.undo();
        cart.undo();

        StringBuilder evens = new StringBuilder();
        for (int i : new Range(0, 10, 2)) evens.append(i).append(' ');
        System.out.println("Iterator (custom Range): " + evens.toString().trim());

        Node expr = new Add(new Num(2), new Mul(new Num(3), new Add(new Num(4), new Num(1))));
        System.out.println("Visitor: " + expr.accept(PRINT) + " = " + expr.accept(EVAL));
    }
}
```

## Output

```text title="Output" output="StructuralPatterns.java"
Builder: POST https://api.example.com/orders headers={Content-Type=application/json} timeout=3s body={"sku":"A1"}
Builder validation: GET must not have a body
Static factory + flyweight: Currency.of("usd") == Currency.of(" USD "): true
JDK flyweight: Integer.valueOf(127) == Integer.valueOf(127): true, Integer.valueOf(128) == Integer.valueOf(128): false
Singleton: 1000, 1001
Adapter: legacy 986 tenths-F -> 37.0 C
JDK adapter Arrays.asList: sorting the list sorted the array too: [a, b, c]
Decorator chain:
    sent: [shop] order shipped
    (duplicate suppressed)
    sent: [shop] order delivered
JDK decorator Collections.unmodifiableList blocked add()
Composite: starter kit costs 8098 cents
Facade: order 1002 placed via [inventory.reserve(A1, 2), payments.charge(), shipping.schedule()]
```

```text title="Output" output="BehavioralPatterns.java"
Strategy (Comparator): [o-1, o-2, o-3]
Strategy (shipping flat): [499, 499, 499]
Strategy (shipping per-item): [600, 150, 450]
Strategy (shipping free-over-50): [0, 599, 0]
Template method (CSV):
id,customer,total
o-3,cy,12000
o-1,ada,2500
o-2,bob,7800
Template method (Markdown):
| id | customer | total |
|---|---|---|
| o-3 | cy | 12000 |
| o-1 | ada | 2500 |
| o-2 | bob | 7800 |

3 orders
Chain of responsibility o-3: accepted
Chain of responsibility o-9: rejected: customer blocked by fraud check
Chain of responsibility o-8: rejected: over the auto-approve limit, needs review
Chain of responsibility o-7: rejected: empty order
Observer:
  email listener: order o-1 paid
  analytics listener: order o-1 paid
  analytics listener: order o-2 paid
Command with undo:
  items [book, pen]
  undo add pen -> [book]
  undo add book -> []
Iterator (custom Range): 0 2 4 6 8
Visitor: (2 + 3 * (4 + 1)) = 17
```

**Structural**:
- The **builder** produced an immutable request and rejected an invalid combination in `build()`, before any object existed.
- **Static factories** returned the same `Currency` instance for `"usd"` and `" USD "` (normalised and cached), the same flyweight idea as the JDK's `Integer` cache, which covers only -128..127.
- The **enum singleton** handed out sequential numbers.
- The **adapter** translated a legacy reading. `Arrays.asList` is a write-through adapter over the array.
- The **decorator chain** added a prefix and suppressed a duplicate. `unmodifiableList` decorates a list to block writes.
- The **composite** priced a nested bundle uniformly (a 20%-off cable pack inside a 10%-off kit).
- The **facade** coordinated three subsystems behind one call, and the singleton's counter continued at 1002.

**Behavioural**:
- **Strategies** swapped sort orders and shipping algorithms without `if` chains. The **template method** fixed the export skeleton while subclasses supplied the format.
- The **chain** stopped at the first rejecting check.
- **Observers** received events until unsubscribed.
- **Commands** recorded history for undo. The custom **iterator** worked with for-each.
- The **visitor** added two operations (print, evaluate) to an expression tree without changing the node classes.

## Real-world application

- **Spring is built from patterns**:
  - singleton beans with dependency injection;
  - proxy (AOP, `@Transactional`);
  - template method (`JdbcTemplate`, `RestTemplate`, `TransactionTemplate`), as callbacks;
  - observer (`ApplicationEventPublisher`, `@EventListener`), chain of responsibility (filter chains, `HandlerInterceptor`s), strategy (`PasswordEncoder`, `ResourceLoader`), factory (`BeanFactory`, `FactoryBean`), adapter (`HandlerAdapter`).
- **Payment and notification systems**: strategy per provider (Stripe, Razorpay, PayPal) chosen by configuration; decorators for retries, metrics and circuit breakers; observers for domain events (order paid → email, analytics, loyalty points).
- **Workflow and domain logic**: order and shipment **state machines** with explicit transitions; **chain of responsibility** for validation and rule engines; **command** objects for job queues and audit logs (event sourcing records commands or events).
- **API and SDK design**: builders for clients and requests (AWS SDK v2, OkHttp, `HttpClient`), static factories for value types, facades over complex subsystems.
- **Interviews and LLD rounds** (parking lot, elevator, vending machine): state, strategy, observer, factory and singleton are the expected vocabulary. Justify each pattern by the change it absorbs.

## Common mistakes

- **Pattern-itis**: interfaces, factories and strategies for code that never varies. Start simple, and introduce a pattern when the second variation arrives.
- **Singletons as global mutable state**: hidden dependencies, untestable code, concurrency bugs. Prefer DI-managed single instances, and enums for true constants.
- **Double-checked locking without `volatile`** for lazy singletons. Use an enum, a holder class or eager initialisation.
- **Telescoping constructors** (`new Pizza(size, true, false, true, null)`): use a builder or a record with a few factory methods.
- **Observer leaks**: subscribing without unsubscribing, or doing slow work synchronously in listeners.
- **Deep template-method hierarchies**: subclasses overriding many hooks become fragile. Prefer composition (strategy).
- **A builder without validation**, or one that leaves the built object mutable.
- **Visitor for hierarchies that change often**: every new node type breaks every visitor. With Java 21, use sealed types and pattern matching.

## Interview questions

**Q1. What are the ways to implement a singleton in Java, and which is best?**

````reveal title="Answer"
- **Eager static final field**: simple and thread-safe, but initialised at class load.
- **Lazy initialisation-on-demand holder** (`static class Holder { static final X INSTANCE = new X(); }`): lazy and thread-safe thanks to class initialisation semantics.
- **Double-checked locking with `volatile`**: works but is verbose.
- **Enum singleton** (`enum X { INSTANCE; }`): thread-safe, serialisation-safe and reflection-safe, which makes it the best for true singletons (Effective Java).

In applications, the usual answer is a container-managed singleton (one Spring bean), which keeps the code testable and replaceable.
````

**Q2. Decorator vs proxy vs adapter?**

````reveal title="Answer"
All three wrap an object.
- An **adapter** changes the interface (`InputStreamReader` turns a byte stream into a `Reader`).
- A **decorator** keeps the interface and adds behaviour; decorators are designed to be stacked (buffering, compression, unmodifiable views).
- A **proxy** keeps the interface and **controls access**: lazy loading, remote calls, security, transactions. It's often generated (dynamic proxies), and the client usually doesn't know it's there.

The structure is similar; the intent differs.
````

**Q3. How do lambdas change the Strategy and Command patterns?**

````reveal title="Answer"
Both are one-method interfaces, so a lambda or method reference implements them directly. `Comparator.comparing(Order::total)`, `executor.submit(() -> …)` and `Map<String, ToLongFunction<Order>>` replace a class per strategy or command. The patterns still exist (an interface with interchangeable implementations), but with far less ceremony. Named classes remain useful when a strategy has state, multiple methods (like `undo` for a command) or needs to be found by name or injected.
````

**Q4. When would you use the Builder pattern instead of a constructor?**

````reveal title="Answer"
When an object has many parameters, especially optional ones or several of the same type (mixing them up is easy), or needs validation across fields before creation, or should be immutable once built. A builder gives named, readable construction (`.timeout(...).header(...)`), defaults, and a single `build()` that validates and creates the immutable object. For 2-3 required fields, a constructor or record is simpler, and static factories give named variants.
````

**Q5. How do you implement a state machine cleanly in Java?**

````reveal title="Answer"
Model states as an **enum**, and give each constant its allowed transitions (an `EnumSet` of next states, or per-constant methods for each event). Keep the current state in the entity and centralise transitions in one method that checks legality and throws on illegal moves. Publish events (observer) on each transition for side effects. For complex workflows (guards, timers, persistence), use Spring Statemachine or a workflow engine (Temporal, Camunda). With Java 21, sealed records per state can carry state-specific data.
````

## Hands-on exercise

Implement an **order lifecycle** with the **State** and **Observer** patterns:
- `enum Status { NEW, PAID, SHIPPED, DELIVERED, CANCELLED }`, where each constant knows its allowed next states:
  - NEW → PAID or CANCELLED;
  - PAID → SHIPPED or CANCELLED;
  - SHIPPED → DELIVERED;
  - DELIVERED and CANCELLED are terminal;
- `Order.transition(Status next)` throws `IllegalStateException("PAID -> NEW not allowed")` on illegal moves, otherwise changes the state and notifies listeners with `(orderId, from, to)`;
- register two listeners: an "email" listener that reacts only to SHIPPED and DELIVERED, and an "audit" listener recording every transition;
- run the happy path, an illegal transition, and a cancellation after payment, then print the audit log.

````hint title="Hint"
Give the enum an abstract method or a lookup: `Set<Status> next()` using `switch (this)` returning `EnumSet`s (an enum constant can't reference later constants in its constructor). Listeners can be `interface TransitionListener { void onTransition(String id, Status from, Status to); }` stored in a `List`.
````

````solution title="Solution"
```java title="OrderLifecycle.java" file="OrderLifecycle.java"
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

public class OrderLifecycle {
    enum Status {
        NEW, PAID, SHIPPED, DELIVERED, CANCELLED;

        Set<Status> next() {
            return switch (this) {
                case NEW -> EnumSet.of(PAID, CANCELLED);
                case PAID -> EnumSet.of(SHIPPED, CANCELLED);
                case SHIPPED -> EnumSet.of(DELIVERED);
                case DELIVERED, CANCELLED -> EnumSet.noneOf(Status.class);
            };
        }

        boolean isTerminal() { return next().isEmpty(); }
    }

    @FunctionalInterface
    interface TransitionListener {
        void onTransition(String orderId, Status from, Status to);
    }

    static final class Order {
        private final String id;
        private Status status = Status.NEW;
        private final List<TransitionListener> listeners;

        Order(String id, List<TransitionListener> listeners) {
            this.id = id;
            this.listeners = listeners;
        }

        void transition(Status next) {
            if (!status.next().contains(next)) {
                throw new IllegalStateException(status + " -> " + next + " not allowed");
            }
            Status from = status;
            status = next;
            listeners.forEach(l -> l.onTransition(id, from, next));
        }

        Status status() { return status; }
    }

    public static void main(String[] args) {
        List<String> audit = new ArrayList<>();
        TransitionListener email = (id, from, to) -> {
            if (to == Status.SHIPPED || to == Status.DELIVERED) {
                System.out.println("  email: your order " + id + " is " + to.name().toLowerCase());
            }
        };
        TransitionListener auditor = (id, from, to) -> audit.add(id + ": " + from + " -> " + to);
        List<TransitionListener> listeners = List.of(email, auditor);

        System.out.println("happy path for o-1:");
        Order o1 = new Order("o-1", listeners);
        for (Status s : List.of(Status.PAID, Status.SHIPPED, Status.DELIVERED)) {
            o1.transition(s);
        }
        System.out.println("  final " + o1.status() + ", terminal " + o1.status().isTerminal());

        try {
            o1.transition(Status.CANCELLED);
        } catch (IllegalStateException e) {
            System.out.println("illegal move on o-1: " + e.getMessage());
        }

        Order o2 = new Order("o-2", listeners);
        o2.transition(Status.PAID);
        try {
            o2.transition(Status.NEW);
        } catch (IllegalStateException e) {
            System.out.println("illegal move on o-2: " + e.getMessage());
        }
        o2.transition(Status.CANCELLED);
        System.out.println("o-2 cancelled after payment (a refund listener would react here)");

        System.out.println("audit log:");
        audit.forEach(line -> System.out.println("  " + line));
    }
}
```

```text title="Output" output="OrderLifecycle.java"
happy path for o-1:
  email: your order o-1 is shipped
  email: your order o-1 is delivered
  final DELIVERED, terminal true
illegal move on o-1: DELIVERED -> CANCELLED not allowed
illegal move on o-2: PAID -> NEW not allowed
o-2 cancelled after payment (a refund listener would react here)
audit log:
  o-1: NEW -> PAID
  o-1: PAID -> SHIPPED
  o-1: SHIPPED -> DELIVERED
  o-2: NEW -> PAID
  o-2: PAID -> CANCELLED
```

The legal transitions live in **one place** (the enum), so a new rule (say, `SHIPPED → RETURNED`) is a one-line change, and the compiler's exhaustive `switch` flags any status you forgot. Side effects such as email, audit, refunds or analytics are listeners, so the lifecycle logic doesn't know about them (Open/Closed). That combination is the standard answer for order, payment and ticket workflows in LLD interviews.
````

## Knowledge check

```quiz
? Which JDK class is a classic Decorator?
+ BufferedInputStream
- Arrays
- Runtime
> It wraps another InputStream and adds buffering, with the same interface.

? Why is an enum often the best way to implement a singleton?
+ The JVM guarantees one instance, and it's safe against serialisation and reflection
- Enums are faster than classes
- Enums can't have fields
> Effective Java recommends the enum singleton.

? Comparator passed to List.sort is an example of which pattern?
+ Strategy
- Template method
- Observer
> The algorithm (ordering) is chosen by the caller.

? Integer.valueOf(127) == Integer.valueOf(127) is true, but the same comparison is false for 128. Which pattern explains the true case?
+ Flyweight (a cache of shared immutable instances)
- Prototype
- Singleton
> Integer caches -128..127 by default.

? What is the main drawback of the classic Visitor pattern?
+ Adding a new element type requires changing every visitor
- It can't return values
- It requires reflection
> Sealed types with pattern matching make that trade-off explicit and compiler-checked.
```

## Key takeaways

- Patterns are a **shared vocabulary** for recurring designs. Use them when they absorb real change, not by default.
- **Creational**: builder (validated immutable construction), static factory (named, cached, subtype-returning), enum singleton (or DI-managed beans).
- **Structural**: adapter (convert an interface), decorator (stack behaviour), proxy (control access), facade (simplify), composite (trees), flyweight (share instances). The JDK is full of them.
- **Behavioural**: strategy and command become lambdas; template method uses inheritance (prefer composition); observer needs unsubscribe; chain of responsibility for pipelines; enum state machines for workflows; sealed + `switch` over Visitor in modern Java.
- In LLD interviews, name the pattern **and** the change it accommodates.
