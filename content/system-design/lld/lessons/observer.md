## The problem

When something happens to one object — an order ships, a stock price changes, an elevator arrives at a floor — **several other objects need to react**: send an email, update a dashboard, award loyalty points, write an audit log. If the order calls each of them directly, it's coupled to all of them, and every new reaction means editing the order.

**Observer** defines a **one-to-many dependency**: when the **subject** changes, all registered **observers** are notified automatically. The subject knows only that observers implement an interface, not who they are.

## When to use it — and when not

**Use when:**

- Several independent components react to the same event.
- The set of reactions changes over time or is configured at runtime.
- The subject shouldn't depend on the reacting components (for example, the domain shouldn't depend on email).

**Don't use when:**

- There's exactly one reaction that's part of the core workflow — just call it.
- The order of reactions, or transactional all-or-nothing behaviour, matters a lot. Explicit orchestration is clearer.

## Core idea

- **Subject (publisher)** — keeps a list of observers; offers `subscribe`/`unsubscribe`; calls `notify` on each when an event occurs.
- **Observer (subscriber/listener)** — implements a callback (`onEvent(event)`).
- **Event** — preferably an **immutable object** describing what happened (`OrderShipped(orderId, at)`), so observers don't reach back into the subject.

**Push vs pull:** push the event data to observers (preferred — decoupled), or notify them and let them query the subject (pull — couples observers to the subject).

## UML

```uml title="Observer"
class OrderEvents
  - listeners: List<OrderListener>
  + subscribe(l: OrderListener): Subscription
  + publish(e: OrderEvent): void
interface OrderListener
  + onEvent(e: OrderEvent): void
class EmailListener
class LoyaltyListener
class AuditListener
record OrderEvent
OrderEvents o-- "0..*" OrderListener
EmailListener ..|> OrderListener
LoyaltyListener ..|> OrderListener
AuditListener ..|> OrderListener
OrderEvents ..> OrderEvent : publishes
```

## Java implementation

```java title="A small, safe event publisher" file="ObserverDemo.java"
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

public class ObserverDemo {
    public static void main(String[] args) {
        EventBus<OrderEvent> bus = new EventBus<>();
        List<String> audit = new ArrayList<>();

        bus.subscribe(e -> System.out.println("EMAIL: order " + e.orderId() + " is " + e.status()));
        EventBus.Subscription loyalty = bus.subscribe(e -> {
            if (e.status() == Status.DELIVERED) System.out.println("LOYALTY: +50 points for " + e.customer());
        });
        bus.subscribe(e -> audit.add(e.orderId() + ":" + e.status()));
        bus.subscribe(e -> { throw new RuntimeException("buggy analytics listener"); });   // must not break others

        Order order = new Order("ORD-9", "asha", bus);
        order.ship();
        order.deliver();

        loyalty.unsubscribe();
        new Order("ORD-10", "ravi", bus).ship();

        System.out.println("Audit: " + audit);
    }
}

enum Status { PLACED, SHIPPED, DELIVERED }

/** Immutable event: observers get facts, not a handle to mutate the order. */
record OrderEvent(String orderId, String customer, Status status) {}

@FunctionalInterface
interface Listener<E> { void onEvent(E event); }

/** Subject logic extracted into a reusable publisher. */
class EventBus<E> {
    // CopyOnWriteArrayList: safe if listeners (un)subscribe while an event is being delivered.
    private final List<Listener<E>> listeners = new CopyOnWriteArrayList<>();

    interface Subscription { void unsubscribe(); }

    Subscription subscribe(Listener<E> listener) {
        listeners.add(listener);
        return () -> listeners.remove(listener);
    }

    void publish(E event) {
        for (Listener<E> l : listeners) {
            try {
                l.onEvent(event);
            } catch (RuntimeException ex) {
                // One failing observer must not prevent the others from being notified.
                System.out.println("listener failed: " + ex.getMessage());
            }
        }
    }
}

/** The domain object stays ignorant of email, loyalty or audit. */
class Order {
    private final String id;
    private final String customer;
    private final EventBus<OrderEvent> events;
    private Status status = Status.PLACED;

    Order(String id, String customer, EventBus<OrderEvent> events) {
        this.id = id;
        this.customer = customer;
        this.events = events;
    }

    void ship() { transition(Status.PLACED, Status.SHIPPED); }
    void deliver() { transition(Status.SHIPPED, Status.DELIVERED); }

    private void transition(Status expected, Status next) {
        if (status != expected) throw new IllegalStateException("cannot move from " + status + " to " + next);
        status = next;                                              // change state first...
        events.publish(new OrderEvent(id, customer, next));         // ...then notify
    }
}
```

Important details:

- **Unsubscribe handles** prevent the classic memory leak of listeners that are never removed.
- **Exception isolation** stops one bad observer from breaking the others (or the subject).
- **Notify after the state change**, so observers see consistent state.
- `CopyOnWriteArrayList` allows subscribing and unsubscribing during notification, and from other threads.

## Synchronous vs asynchronous delivery

The bus above notifies **synchronously**, on the caller's thread. That's simple and predictable, but a slow observer (sending email) slows down `order.ship()`. Options:

- **Asynchronous delivery** — hand events to an `ExecutorService`. The publisher returns immediately, but ordering, retries and failure handling become your problem.
- **Outbox / message broker** — in distributed systems, events are persisted and delivered by infrastructure (Kafka, SQS). That's the HLD version of Observer; see the [Pub/Sub](problem:pub-sub) problem for an in-process take.

## Realistic use case

- **Notifications**: order and booking status changes fan out to email, SMS and push ([Notification Service](problem:notification-service)).
- **Elevator displays**: each floor's display observes the elevator's position ([Elevator](problem:elevator)).
- **Price alerts**: users subscribe to "notify me when below X".
- **UI frameworks**: button click listeners. **Java**: `PropertyChangeListener`, `java.util.concurrent.Flow` (reactive streams).

## Trade-offs and alternatives

- **Pros:** loose coupling; open/closed for new reactions; reactions are configurable at runtime.
- **Cons:** control flow becomes **implicit** (harder to follow); ordering between observers is unspecified; failures and slow observers need handling; cascades of events can loop.
- **Alternatives:**
  - **Direct calls** when the reaction is essential to the use case (charging payment isn't an "observer" of placing an order — it's part of it).
  - **[Mediator](lesson:mediator)** when components need two-way coordination.
  - **Message queues** across process boundaries.

## Recognising it in an interview

"Notify users when…", "update all displays when…", "multiple systems need to know when…", "subscribe / unsubscribe". Also any follow-up like *"also send an SMS when the order ships"* — the answer should be "add a listener", not "edit `Order`".

## Common mistakes

- **Leaking listeners** — no way to unsubscribe.
- **Mutable events**, or passing the subject itself, so observers modify it.
- **Notifying before the state change** is complete.
- **Core workflow steps as observers** (losing control over failure and ordering).
- **Iterating a plain `ArrayList` while listeners modify it**, causing `ConcurrentModificationException`.

## Key takeaways

- Observer = a subject notifies a **dynamic list** of observers through an interface.
- Publish **immutable events**, **after** state changes; isolate observer failures; support **unsubscribe**.
- Decide **sync vs async** deliberately.
- Use it for side-effect fan-out, not for essential workflow steps.

## Knowledge check

```quiz
? Why publish an immutable OrderEvent instead of passing the Order itself to observers?
+ Observers get the facts they need without being able to modify the order or depend on its internals
- Records are faster than classes
- Java requires events to be records
> Immutable events decouple observers and protect the subject's state.

? One observer throws an exception during publish(). What should a robust subject do?
- Stop notifying the remaining observers
+ Catch it, log or report it, and continue notifying the others
- Roll back the state change silently
> One faulty observer must not break the others or the subject.

? Which reaction should NOT be modelled as an observer of "order placed"?
- Sending a confirmation email
- Updating an analytics dashboard
+ Charging the customer's payment, which must succeed for the order to exist
> Essential workflow steps belong in explicit orchestration, not in fire-and-forget observers.
```

## Exercise

Build a **stock price alert** system: `StockTicker` publishes `PriceChanged(symbol, oldPrice, newPrice)` events. Users create alerts such as "notify me when TCS drops below 3500" or "when INFY rises above 1600". Each alert should fire **once** and then unsubscribe itself.

````hint title="Hint"
An alert is a listener holding its symbol, threshold, direction and subscription handle. When it fires, it calls `subscription.unsubscribe()`. A copy-on-write listener list makes that safe during notification.
````

````solution title="Reference solution"
```java file="StockAlertDemo.java"
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;

public class StockAlertDemo {
    public static void main(String[] args) {
        StockTicker ticker = new StockTicker();
        PriceAlert.create(ticker, "TCS", 3500, Direction.BELOW, msg -> System.out.println("ALERT asha: " + msg));
        PriceAlert.create(ticker, "INFY", 1600, Direction.ABOVE, msg -> System.out.println("ALERT ravi: " + msg));

        ticker.update("TCS", 3600);
        ticker.update("TCS", 3480);   // fires
        ticker.update("TCS", 3400);   // already fired: silent
        ticker.update("INFY", 1650);  // fires
        System.out.println("Listeners left: " + ticker.listenerCount());
    }
}

record PriceChanged(String symbol, double oldPrice, double newPrice) {}
enum Direction { ABOVE, BELOW }

class StockTicker {
    private final List<Consumer<PriceChanged>> listeners = new CopyOnWriteArrayList<>();
    private final Map<String, Double> prices = new HashMap<>();

    Runnable subscribe(Consumer<PriceChanged> l) {
        listeners.add(l);
        return () -> listeners.remove(l);
    }

    void update(String symbol, double price) {
        Double old = prices.put(symbol, price);
        PriceChanged event = new PriceChanged(symbol, old == null ? price : old, price);
        listeners.forEach(l -> l.accept(event));
    }

    int listenerCount() { return listeners.size(); }
}

class PriceAlert implements Consumer<PriceChanged> {
    private final String symbol;
    private final double threshold;
    private final Direction direction;
    private final Consumer<String> notifier;
    private Runnable unsubscribe;

    private PriceAlert(String symbol, double threshold, Direction direction, Consumer<String> notifier) {
        this.symbol = symbol; this.threshold = threshold; this.direction = direction; this.notifier = notifier;
    }

    static PriceAlert create(StockTicker ticker, String symbol, double threshold, Direction dir, Consumer<String> notifier) {
        PriceAlert alert = new PriceAlert(symbol, threshold, dir, notifier);
        alert.unsubscribe = ticker.subscribe(alert);
        return alert;
    }

    public void accept(PriceChanged e) {
        if (!e.symbol().equals(symbol)) return;
        boolean crossed = direction == Direction.BELOW ? e.newPrice() < threshold : e.newPrice() > threshold;
        if (crossed) {
            notifier.accept(symbol + " is " + e.newPrice() + " (" + direction.name().toLowerCase() + " " + threshold + ")");
            unsubscribe.run();   // fire once
        }
    }
}
```
````
