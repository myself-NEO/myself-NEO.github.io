## The problem

A use case often needs several subsystems in a precise order: booking a movie ticket means looking up the show, holding seats, calculating price, charging payment, confirming seats, saving the booking and sending a confirmation. If every client (mobile API, web controller, kiosk) orchestrates those calls itself, the sequence gets duplicated, done inconsistently, and every client is coupled to every subsystem.

**Facade** provides a **single, simplified entry point** to a subsystem. Clients call one method; the facade coordinates the parts.

## When to use it — and when not

**Use when:**

- Clients need a **simple** way to perform a multi-step operation across several components.
- You want to **decouple** clients from subsystem internals so they can evolve.
- You're layering a system: the facade is the application-service boundary.

**Don't use when:**

- It would only forward one call to one class (pointless indirection).
- It starts accumulating **business rules** that belong in the domain objects. A facade orchestrates; it doesn't decide.

## Core idea

The facade:

- Knows **which** subsystem objects to call and **in what order**.
- Exposes a small, **use-case-shaped** API (`bookTickets`, `cancelBooking`).
- Doesn't prevent advanced clients from using the subsystem directly if they need to.

## UML

```uml title="Facade over a booking subsystem"
class BookingFacade
  + book(showId: String, seats: List<String>, card: String): Booking
class ShowCatalog
  + find(showId: String): Show
class SeatInventory
  + hold(showId: String, seats: List<String>): void
  + confirm(showId: String, seats: List<String>): void
  + release(showId: String, seats: List<String>): void
class PricingEngine
  + price(show: Show, seats: List<String>): long
interface PaymentGateway
  + charge(card: String, amount: long): boolean
class Notifier
BookingFacade --> ShowCatalog
BookingFacade --> SeatInventory
BookingFacade --> PricingEngine
BookingFacade --> PaymentGateway
BookingFacade --> Notifier
```

## Java implementation

```java title="One call, many collaborators" file="FacadeDemo.java"
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class FacadeDemo {
    public static void main(String[] args) {
        ShowCatalog catalog = new ShowCatalog(Map.of("S1", new Show("S1", "Dune", 250)));
        BookingFacade facade = new BookingFacade(catalog, new SeatInventory(), new PricingEngine(),
                (card, amount) -> !card.startsWith("0000"),                 // fake gateway
                msg -> System.out.println("[notify] " + msg));

        System.out.println(facade.book("S1", List.of("A1", "A2"), "4111"));
        try {
            facade.book("S1", List.of("A2", "A3"), "4111");                // A2 already taken
        } catch (IllegalStateException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
        try {
            facade.book("S1", List.of("B1"), "0000-declined");
        } catch (IllegalStateException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
        System.out.println(facade.book("S1", List.of("B1"), "4111"));      // B1 was released after the failed payment
    }
}

record Show(String id, String title, long pricePerSeat) {}
record Booking(String showId, List<String> seats, long amount) {}

// -- Subsystem classes (each focused, unaware of the facade) --
class ShowCatalog {
    private final Map<String, Show> shows;
    ShowCatalog(Map<String, Show> shows) { this.shows = Map.copyOf(shows); }
    Show find(String id) {
        Show s = shows.get(id);
        if (s == null) throw new IllegalArgumentException("No show " + id);
        return s;
    }
}

class SeatInventory {
    private final Map<String, Set<String>> held = new HashMap<>();
    private final Map<String, Set<String>> booked = new HashMap<>();

    void hold(String showId, List<String> seats) {
        Set<String> h = held.computeIfAbsent(showId, k -> new HashSet<>());
        Set<String> b = booked.computeIfAbsent(showId, k -> new HashSet<>());
        for (String s : seats) if (h.contains(s) || b.contains(s)) throw new IllegalStateException("Seat " + s + " unavailable");
        h.addAll(seats);
    }
    void confirm(String showId, List<String> seats) {
        held.get(showId).removeAll(seats);
        booked.get(showId).addAll(seats);
    }
    void release(String showId, List<String> seats) { held.get(showId).removeAll(seats); }
}

class PricingEngine {
    long price(Show show, List<String> seats) { return show.pricePerSeat() * seats.size(); }
}

interface PaymentGateway { boolean charge(String card, long amount); }
interface Notifier { void send(String message); }

// -- The facade: orchestration only --
class BookingFacade {
    private final ShowCatalog catalog;
    private final SeatInventory inventory;
    private final PricingEngine pricing;
    private final PaymentGateway payments;
    private final Notifier notifier;

    BookingFacade(ShowCatalog catalog, SeatInventory inventory, PricingEngine pricing,
                  PaymentGateway payments, Notifier notifier) {
        this.catalog = catalog;
        this.inventory = inventory;
        this.pricing = pricing;
        this.payments = payments;
        this.notifier = notifier;
    }

    Booking book(String showId, List<String> seats, String card) {
        Show show = catalog.find(showId);
        inventory.hold(showId, seats);                         // 1. hold first
        long amount = pricing.price(show, seats);
        if (!payments.charge(card, amount)) {                  // 2. pay
            inventory.release(showId, seats);                  //    compensate on failure
            throw new IllegalStateException("Payment declined");
        }
        inventory.confirm(showId, seats);                      // 3. confirm
        notifier.send("Booked " + seats + " for " + show.title());
        return new Booking(showId, List.copyOf(seats), amount);
    }
}
```

Every client now calls `facade.book(...)`. The hold → pay → confirm/release sequence (including compensation on failure) lives in one place.

## Realistic use case

In layered architectures, **application services** are facades: `OrderApplicationService.placeOrder(cmd)` coordinates repositories, domain objects, payment adapters and event publishers. Controllers, CLI commands and message consumers all call it, so the use-case logic is never duplicated. At library level, SLF4J is a facade: one simple logging API in front of interchangeable backends (Logback, Log4j 2, JUL).

## Trade-offs and alternatives

- **Pros:** simpler clients; one place for use-case sequencing; subsystems can change behind it.
- **Cons:** risk of becoming a **god object** if it grows rules or too many use cases; another layer to maintain.
- **Mitigations:** keep one facade per bounded area (bookings, payments); push rules into domain objects; keep methods use-case-shaped.
- **Related patterns:** [Adapter](lesson:adapter) converts an interface; [Mediator](lesson:mediator) coordinates **peers** that talk to each other, whereas a facade is a one-way entry point to a subsystem.

## Recognising it in an interview

Nearly every LLD solution has a top-level class like `ParkingLotService`, `BookingService` or `LibraryService` that the client calls. That's a facade. Name it, keep it thin, and make sure rules live in entities: *"`BookingService` is the facade clients use; seat rules live in `ShowSeat`, pricing in `PricingStrategy`."*

## Common mistakes

- **Fat facades** containing pricing, validation and state rules.
- **Leaky facades** returning subsystem internals (mutable entities, repositories).
- **Facade per class** — pointless wrappers.
- **Hiding failures**: swallowing subsystem exceptions without compensation.

## Key takeaways

- Facade = a **simple, use-case-shaped entry point** to a complex subsystem.
- It **orchestrates**; domain objects **decide**.
- It's the natural home for **sequencing and compensation** (release on payment failure).
- Keep facades thin and split them by area to avoid god objects.

## Knowledge check

```quiz
? Which responsibility belongs in a BookingFacade?
+ Calling hold, pay, then confirm, and releasing seats if payment fails
- Deciding whether a seat type is allowed for a member tier
- Implementing the seat-availability check
> Facades sequence calls and handle compensation; rules belong in domain objects.

? What's the main risk of a facade?
- It makes subsystems unusable directly
+ It can grow into a god object full of business rules
- It forces inheritance
> Keep facades thin; push rules down into the domain.

? How does a facade differ from a mediator?
+ A facade is a one-way simplified entry point to a subsystem; a mediator coordinates communication among peer objects
- They are identical
- A mediator is a creational pattern
> Facades are entry points; mediators are hubs between collaborators.
```

## Exercise

Design a `CheckoutFacade.placeOrder(cartId, paymentMethod, address)` for an e-commerce store using `CartService`, `InventoryService` (reserve/release), `PricingService`, `PaymentGateway`, `OrderRepository` and `EventPublisher`. Write the method body, including compensation if payment fails *or* if saving the order fails after payment.

````hint title="Hint"
Order the steps so cheap, reversible actions come first. What must be undone if the order save fails after payment succeeded?
````

````solution title="Sample answer"
```java
Order placeOrder(String cartId, PaymentMethod pm, Address address) {
    Cart cart = carts.get(cartId);
    if (cart.isEmpty()) throw new IllegalStateException("cart is empty");
    Reservation reservation = inventory.reserve(cart.items());              // reversible
    long total = pricing.total(cart, address);
    PaymentResult payment = payments.charge(pm, total);
    if (!payment.success()) {
        inventory.release(reservation);
        throw new PaymentDeclinedException(payment.reason());
    }
    try {
        Order order = Order.place(cart, address, total, payment.reference());
        orders.save(order);
        inventory.commit(reservation);
        events.publish(new OrderPlaced(order.id()));
        carts.clear(cartId);
        return order;
    } catch (RuntimeException e) {
        payments.refund(payment.reference());                                 // compensate
        inventory.release(reservation);
        throw e;
    }
}
```

The facade sequences and compensates; `Order.place(...)` enforces the order's own invariants. See [Food Ordering](problem:food-ordering).
````
