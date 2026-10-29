## The two forces

Almost every design review comment reduces to one of two ideas:

- **Cohesion** — how strongly the parts *inside* a class belong together. High cohesion: every field and method serves one purpose.
- **Coupling** — how much a class *depends on others*. Low coupling: you can change one class without touching many others.

The goal is **high cohesion, low coupling**. The two reinforce each other: when each class does one focused thing, it needs to know less about everything else.

## Cohesion: does this class have one job?

A quick test: **describe the class in one sentence without using "and"**.

- ✅ `PasswordHasher` — "hashes and verifies passwords" (one concept: password hashing).
- ❌ `UserManager` — "validates input *and* saves users *and* sends welcome emails *and* generates reports".

Signs of low cohesion:

- Groups of fields used only by groups of methods (the class is really two classes).
- Method names spanning unrelated verbs: `validateEmail`, `exportCsv`, `retryPayment`.
- The class name is vague: `Manager`, `Helper`, `Utils`, `Processor`.

## Coupling: how much does this class know?

Kinds of coupling, roughly from worst to best:

| Coupling | Example | Why it hurts |
|---|---|---|
| **Content** | Reaching into another object's internals (public fields, reflection) | Any internal change breaks you |
| **Global / static** | Reading `Config.INSTANCE.timeout` everywhere | Hidden dependency, hard to test |
| **Concrete type** | `new MySqlUserRepository()` inside a service | Can't swap or fake it |
| **Data via chains** | `order.getCustomer().getAddress().getCity()` | Coupled to the entire object graph |
| **Interface** | Constructor takes a `UserRepository` interface | Depends only on a small, stable contract |
| **Message / data** | Method takes the two values it needs | Minimal knowledge |

## A god object, before and after

```java title="Before: one class, five reasons to change"
class OrderManager {
    void placeOrder(Map<String, Integer> cart, String userEmail, String cardNumber) {
        // 1. validation
        if (cart.isEmpty()) throw new IllegalArgumentException("empty cart");
        // 2. pricing (with tax rules)
        double total = 0;
        for (var e : cart.entrySet()) total += PRICES.get(e.getKey()) * e.getValue();
        total *= 1.18;
        // 3. payment over HTTP
        HttpClient.newHttpClient(); /* ... charge card ... */
        // 4. persistence via JDBC
        /* INSERT INTO orders ... */
        // 5. email
        /* SMTP send to userEmail ... */
    }
}
```

Five reasons to change (tax rules, payment provider, database, email template, validation), and it can't be unit tested without a network and a database.

```java title="After: cohesive pieces, coupled through interfaces" file="OrderCohesionDemo.java"
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class OrderCohesionDemo {
    public static void main(String[] args) {
        Map<String, Long> catalogue = Map.of("pen", 20L, "notebook", 120L);
        List<String> sentEmails = new ArrayList<>();
        OrderService service = new OrderService(
                new PriceCalculator(catalogue, 18),
                (card, amount) -> "PAY-" + amount,                  // fake gateway
                order -> System.out.println("saved " + order),       // fake repository
                (to, msg) -> sentEmails.add(to + ": " + msg));       // fake notifier

        Order order = service.placeOrder(Map.of("pen", 2, "notebook", 1), "asha@example.com", "4111");
        System.out.println(order.total() + " " + sentEmails);
    }
}

record Order(Map<String, Integer> items, long total, String paymentId) {}

/** Cohesive: only pricing and tax. */
class PriceCalculator {
    private final Map<String, Long> prices;
    private final int taxPercent;

    PriceCalculator(Map<String, Long> prices, int taxPercent) {
        this.prices = Map.copyOf(prices);
        this.taxPercent = taxPercent;
    }

    long totalWithTax(Map<String, Integer> items) {
        long subtotal = items.entrySet().stream()
                .mapToLong(e -> priceOf(e.getKey()) * e.getValue())
                .sum();
        return subtotal + subtotal * taxPercent / 100;
    }

    private long priceOf(String sku) {
        Long price = prices.get(sku);
        if (price == null) throw new IllegalArgumentException("Unknown product " + sku);
        return price;
    }
}

interface PaymentGateway { String charge(String card, long amount); }
interface OrderRepository { void save(Order order); }
interface Notifier { void send(String to, String message); }

/** Coordinates the steps; knows nothing about HTTP, SQL or SMTP. */
class OrderService {
    private final PriceCalculator pricing;
    private final PaymentGateway payments;
    private final OrderRepository orders;
    private final Notifier notifier;

    OrderService(PriceCalculator pricing, PaymentGateway payments, OrderRepository orders, Notifier notifier) {
        this.pricing = pricing;
        this.payments = payments;
        this.orders = orders;
        this.notifier = notifier;
    }

    Order placeOrder(Map<String, Integer> items, String email, String card) {
        if (items.isEmpty()) throw new IllegalArgumentException("Cart is empty");
        long total = pricing.totalWithTax(items);
        String paymentId = payments.charge(card, total);
        Order order = new Order(Map.copyOf(items), total, paymentId);
        orders.save(order);
        notifier.send(email, "Order confirmed: " + total);
        return order;
    }
}
```

Each class now has one reason to change, and `OrderService` is coupled only to small interfaces. The demo tests it with lambdas instead of real infrastructure. The same structure underpins the [Dependency Inversion](lesson:dependency-inversion) and [Testing](lesson:testing-lld) lessons.

## Two smells to recognise

**Feature envy** — a method that uses another object's data more than its own:

```java
// In ReportService: envies Order's data
long discount(Order o) { return o.getTotal() > 1000 && o.getCustomer().isPremium() ? o.getTotal() / 10 : 0; }
// Move it to where the data lives: order.discount()
```

**Train wrecks** (Law of Demeter violations) — long navigation chains:

```java
String city = order.getCustomer().getAddress().getCity();   // coupled to three classes
String city = order.shippingCity();                          // coupled to one
```

The **Law of Demeter** says a method should talk only to its immediate collaborators: its own fields, its parameters and objects it creates — not to strangers reached through them.

## Real-world example

A team couldn't upgrade their email provider because 40 classes called the provider's SDK directly — high coupling to a concrete type. Introducing a `Notifier` interface with one adapter took a day; the provider switch afterwards took an hour. See [Adapter](lesson:adapter).

## Common mistakes

- **Splitting too far.** Ten one-method classes that always change together is *low* cohesion at the package level. Cohesion is about reasons to change, not class size.
- **Interfaces everywhere.** Coupling to a stable concrete value class like `String` or `Money` is fine. Introduce interfaces at **volatile** boundaries such as I/O, external services and policies.
- **Hidden coupling through statics and singletons**, which don't show up in constructors.

## In the interview

> [!INTERVIEW] Name the responsibility
> When you introduce a class, give its one-sentence responsibility. When a class starts accumulating unrelated methods, say so out loud: *"`ParkingLot` is starting to do pricing too — I'll pull that into a `PricingStrategy` so the lot only manages spots."*

## Key takeaways

- **High cohesion**: one purpose per class (describe it without "and").
- **Low coupling**: depend on few, small, stable abstractions; avoid chains and hidden statics.
- God objects are fixed by extracting cohesive collaborators behind interfaces.
- Watch for **feature envy** and **Law of Demeter** violations — they show where behaviour belongs.

## Knowledge check

```quiz
? Which class most clearly has low cohesion?
- PasswordHasher with hash() and verify()
+ UserManager with validateEmail(), saveToDatabase(), sendWelcomeEmail() and exportCsv()
- Money with add(), subtract() and multiply()
> Its methods serve unrelated purposes, so it has many reasons to change.

? `invoice.getOrder().getCustomer().getAddress().getZip()` mainly violates which guideline?
- Single Responsibility
+ Law of Demeter
- Liskov Substitution
> The caller navigates through strangers, coupling itself to the whole object graph.

? Where is introducing an interface most valuable for reducing coupling?
- Around String and Integer
+ At boundaries to volatile things like payment providers, storage and notification channels
- Around every class, by default
> Interfaces pay off where change is likely; elsewhere they add indirection without benefit.
```

## Exercise

This `ParkingLot` class has crept beyond its job. List its responsibilities, decide which ones should move out, and sketch the resulting classes.

```java
class ParkingLot {
    List<Spot> spots;
    Map<String, Ticket> tickets;
    double hourlyRate, weekendMultiplier;
    String smtpHost;

    Ticket park(Vehicle v) { /* find spot, create ticket */ }
    double computeFee(Ticket t) { /* rates, weekends, holidays */ }
    void emailReceipt(String to, Ticket t) { /* SMTP */ }
    String dailyReportCsv() { /* occupancy stats */ }
}
```

````hint title="Hint"
Group fields with the methods that use them. Each group is a candidate class.
````

````solution title="Sample answer"
Responsibilities: (1) spot allocation and ticketing, (2) fee calculation, (3) receipt delivery, (4) reporting.

- `ParkingLot` keeps `spots` and `tickets` and offers `park()`/`unpark()`.
- `PricingStrategy` (interface) with `HourlyPricing` holding `hourlyRate`, `weekendMultiplier` and holiday rules.
- `ReceiptSender` (interface) with an `EmailReceiptSender` that owns `smtpHost`.
- `OccupancyReport` reads lot state (via a query method such as `lot.occupancySnapshot()`) and formats CSV.

`ParkingLot` receives `PricingStrategy` through its constructor, which avoids concrete coupling. Receipts and reports are triggered by the application service, not the lot. See [Parking Lot](problem:parking-lot) for the full design.
````
