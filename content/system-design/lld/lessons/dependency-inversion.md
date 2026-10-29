## The principle

> **High-level modules should not depend on low-level modules. Both should depend on abstractions.**
> **Abstractions should not depend on details. Details should depend on abstractions.**

- **High-level modules** contain policy — the business rules: "a booking is confirmed when payment succeeds".
- **Low-level modules** contain details — how things are done: MySQL queries, Stripe HTTP calls, SMTP.

Naively, policy code calls detail code directly, so business rules depend on infrastructure. DIP **inverts** that: the policy defines the interface it needs, and the infrastructure implements it.

## Analogy

A laptop doesn't depend on a particular brand of charger; it defines a USB-C port spec, and any compliant charger works. The laptop (high level) owns the abstraction (the port spec). Chargers (low level) conform to it. If laptops instead had a specific charger soldered in, replacing the charger would mean redesigning the laptop.

## The problematic version

```java title="❌ Business rules depend on infrastructure"
class MySqlBookingDao {
    void insert(Booking b) { /* JDBC */ }
}
class StripeClient {
    String charge(String card, long amount) { /* HTTPS call */ return "ch_123"; }
}

class BookingService {                                     // high-level policy...
    private final MySqlBookingDao dao = new MySqlBookingDao();      // ...welded to MySQL
    private final StripeClient stripe = new StripeClient();          // ...welded to Stripe

    void confirm(Booking booking, String card) {
        stripe.charge(card, booking.amount());
        dao.insert(booking);
    }
}
```

```text
Dependency direction (❌):

  BookingService ───────▶ MySqlBookingDao
        │
        └──────────────▶ StripeClient
  (policy)                 (details)
```

Consequences:

- You can't unit test `BookingService` without a database and network.
- Switching to Razorpay or PostgreSQL means editing business logic.
- The most important code (rules) is the most fragile (it changes when infrastructure does).

## The improved version

```java title="✅ Policy owns the abstractions; details implement them" file="DipDemo.java"
import java.util.ArrayList;
import java.util.List;

public class DipDemo {
    public static void main(String[] args) {
        // Composition root: the only place that knows the concrete classes.
        InMemoryBookings bookings = new InMemoryBookings();
        BookingService service = new BookingService(bookings, new FakePaymentGateway());

        service.confirm(new Booking("B1", 1_200), "4111-1111");
        System.out.println("Stored: " + bookings.all());
    }
}

record Booking(String id, long amount) {}

// -- Abstractions owned by the high-level (domain) side --
interface BookingRepository { void save(Booking booking); }
interface PaymentGateway { String charge(String card, long amount); }

// -- High-level policy: no imports of JDBC, HTTP or SDKs --
class BookingService {
    private final BookingRepository bookings;
    private final PaymentGateway payments;

    BookingService(BookingRepository bookings, PaymentGateway payments) {
        this.bookings = bookings;
        this.payments = payments;
    }

    void confirm(Booking booking, String card) {
        if (booking.amount() <= 0) throw new IllegalArgumentException("nothing to charge");
        String chargeId = payments.charge(card, booking.amount());
        System.out.println("Charged " + chargeId);
        bookings.save(booking);
    }
}

// -- Low-level details depend on the abstractions --
class InMemoryBookings implements BookingRepository {
    private final List<Booking> store = new ArrayList<>();
    public void save(Booking booking) { store.add(booking); }
    List<Booking> all() { return List.copyOf(store); }
}

class FakePaymentGateway implements PaymentGateway {
    public String charge(String card, long amount) { return "fake_ch_" + amount; }
}
// In production: class MySqlBookingRepository implements BookingRepository { ... }
//                class StripePaymentGateway implements PaymentGateway { ... }
```

```text
Dependency direction (✅):

  BookingService ──▶ «interface» PaymentGateway ◀── StripePaymentGateway
        │
        └────────▶ «interface» BookingRepository ◀── MySqlBookingRepository

  Arrows from the details now point INTO the policy's abstractions.
```

## Why it works

- **Business rules are isolated** from infrastructure churn.
- **Testing is trivial**: pass in fakes (see [Testing](lesson:testing-lld)).
- **Swapping providers** means writing one new class.
- The **source-code dependency** points the opposite way to the runtime call flow — hence "inversion".

## Who owns the interface?

This is the subtle part. The interface should be expressed **in the high-level module's language** and live **with the high-level module**:

- ✅ `PaymentGateway.charge(card, amount)` — what the booking domain needs.
- ❌ `StripeApi.createPaymentIntent(StripeRequest)` — Stripe's vocabulary leaking into your domain.

If the interface mirrors one vendor's API, you haven't inverted anything; you've just put an interface in front of the vendor. An [Adapter](lesson:adapter) translates the domain's interface to the vendor's API.

## DIP vs DI vs IoC

| Term | What it is |
|---|---|
| **Dependency Inversion Principle (DIP)** | A *design principle* about the direction of source-code dependencies |
| **Dependency Injection (DI)** | A *technique*: pass dependencies in (usually via the constructor) instead of creating them |
| **Inversion of Control (IoC) container** | A *framework* (Spring, Guice) that performs DI for you |

You can follow DIP with plain constructor injection and a `main` method — no framework required. See [Dependency Injection](lesson:dependency-injection).

## Real-world example

A logistics company's routing service called Google Maps directly from 30 classes. When pricing changed, they needed to move to another map provider, and the estimate was three months. After introducing a `RouteProvider` interface owned by the routing domain, the switch to the new provider was one adapter class plus configuration, and they could A/B test providers.

## Common mistakes

- **Interfaces that mirror the implementation** (vendor-shaped interfaces).
- **Putting interfaces in the infrastructure package**, so the domain still imports infrastructure.
- **Applying DIP to stable things.** You don't need an interface in front of `java.time.LocalDate` or `ArrayList`. Invert dependencies on **volatile** details: I/O, external services, time and randomness.
- **Service locators** (`Registry.get(PaymentGateway.class)` inside methods), which hide dependencies just like `new` does.

## Interview questions

> [!INTERVIEW] Likely questions
> - *"How would you test `confirm()` without hitting Stripe?"* → "BookingService depends on a `PaymentGateway` interface; in tests I pass a fake."
> - *"What's the difference between DIP and DI?"* → see the table above.
> - *"Where would the `PaymentGateway` interface live?"* → "In the domain or application layer, next to `BookingService` — the infrastructure package depends on it, not the other way round."

## Key takeaways

- Policy (business rules) should **not** depend on details (I/O, vendors).
- The **high-level module owns the abstraction**, in its own vocabulary.
- Details **implement** those abstractions; wiring happens in a composition root.
- DIP is a principle; **DI** is the technique that usually implements it.

## Knowledge check

```quiz
? Which interface best follows DIP for a booking domain?
- `interface StripeClient { PaymentIntent createIntent(StripeRequest r); }`
+ `interface PaymentGateway { String charge(String card, long amount); }` defined alongside BookingService
- No interface: BookingService calls `new StripeClient()`
> The abstraction should be in the domain's language and owned by the domain.

? What does "inversion" refer to in DIP?
+ Source-code dependencies point from details toward policy-owned abstractions, the opposite of the naive direction
- Methods are called in reverse order
- Subclasses call superclass methods
> Infrastructure now depends on the domain's interfaces rather than the domain depending on infrastructure.

? Which dependency least needs to be inverted?
- An SMS provider's HTTP API
- The database
+ java.util.ArrayList
- The system clock in time-based rules
> Stable library types don't need abstraction; volatile details (I/O, vendors, time) do.
```

## Exercise

`InvoiceService` below creates its own dependencies. Apply DIP so it can be tested without email or the clock, then write a short `main` that wires real-looking implementations.

```java
class InvoiceService {
    void sendOverdueReminders(List<Invoice> invoices) {
        LocalDate today = LocalDate.now();
        SmtpMailer mailer = new SmtpMailer("smtp.example.com");
        for (Invoice i : invoices)
            if (i.dueDate().isBefore(today)) mailer.send(i.customerEmail(), "Invoice " + i.id() + " is overdue");
    }
}
```

````hint title="Hint"
Two hidden dependencies: the mailer and *time*. `java.time.Clock` is the JDK's abstraction for time.
````

````solution title="Reference solution"
```java file="InvoiceDipDemo.java"
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

public class InvoiceDipDemo {
    public static void main(String[] args) {
        Clock fixed = Clock.fixed(Instant.parse("2026-02-10T00:00:00Z"), ZoneId.of("UTC"));
        Mailer console = (to, body) -> System.out.println("mail to " + to + ": " + body);
        InvoiceService service = new InvoiceService(console, fixed);

        service.sendOverdueReminders(List.of(
                new Invoice("INV-1", "a@x.com", LocalDate.of(2026, 2, 1)),
                new Invoice("INV-2", "b@x.com", LocalDate.of(2026, 3, 1))));
    }
}

record Invoice(String id, String customerEmail, LocalDate dueDate) {}

interface Mailer { void send(String to, String body); }   // owned by the invoicing domain

class InvoiceService {
    private final Mailer mailer;
    private final Clock clock;

    InvoiceService(Mailer mailer, Clock clock) {
        this.mailer = mailer;
        this.clock = clock;
    }

    void sendOverdueReminders(List<Invoice> invoices) {
        LocalDate today = LocalDate.now(clock);
        for (Invoice i : invoices) {
            if (i.dueDate().isBefore(today)) mailer.send(i.customerEmail(), "Invoice " + i.id() + " is overdue");
        }
    }
}
```

In production, `main` would pass an `SmtpMailer implements Mailer` and `Clock.systemUTC()`.
````
