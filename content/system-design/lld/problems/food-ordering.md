## Problem statement

Design the core of a food ordering app. Customers browse restaurant menus, add items to a cart, and place an order, which is paid for up front. The restaurant accepts or rejects it and prepares the food; a courier picks it up and delivers it. The customer sees every status change and can cancel until the kitchen starts cooking. A rejected or cancelled order is refunded.

> [!TIP] Try it first
> Write down the order's states and, for each transition, **who** is allowed to trigger it (customer, restaurant, courier). That table is most of the design.

## Clarifying questions

1. Can a cart hold items from several restaurants?
2. What is the bill: item prices, delivery fee, taxes, discounts?
3. If the menu changes after the order is placed, which price applies?
4. Which states does an order go through, and who moves it?
5. Until when can the customer cancel? What happens to the money?
6. Who needs to hear about status changes?

````reveal title="Answers we'll assume"
- **One restaurant per cart.** Adding from another restaurant is rejected until the cart is cleared.
- Bill = subtotal + delivery fee (40, **free from 500**) + **5% tax** on the subtotal. Discounts are a follow-up.
- **Prices are snapshotted** into the order when it is placed; later menu changes don't affect it.
- States: `PLACED → ACCEPTED → PREPARING → OUT_FOR_DELIVERY → DELIVERED`, plus `REJECTED` (restaurant, from `PLACED`) and `CANCELLED` (customer, from `PLACED` or `ACCEPTED`).
- Payment is **charged when the order is placed** and **refunded** if the order is rejected or cancelled.
- The customer is notified of every change; refunds react to changes too.
````

## Requirements

**Functional**

1. Restaurants have menus; items can become unavailable.
2. Per-customer cart, locked to one restaurant.
3. Place an order: validate, price, charge, snapshot lines, clear the cart.
4. Move orders through their lifecycle; only the right role can trigger each step.
5. Notify listeners of each status change; refund rejected and cancelled orders.

**Non-functional**

6. Each class has one job: cart, pricing, lifecycle, orchestration and notifications are separate.
7. New reactions to status changes (analytics, courier assignment) plug in without editing the order code.

## Step 1 — Entities

````reveal title="Entities and responsibilities"
| Entity | Responsibility |
|---|---|
| `Restaurant` / `MenuItem` | Menu with prices and availability |
| `Cart` | A customer's selection; enforces "one restaurant" |
| `PriceCalculator` | Turns order lines into a `Bill` (subtotal, delivery fee, tax, total) |
| `Order` | Snapshot of lines and bill, payment reference, **status and history**; built with a **Builder** |
| `OrderEvent` | The transition table: who may trigger it, from which states, to which state |
| `OrderListener` | Observers: customer notifications, refunds |
| `OrderService` | Facade: carts, placing orders, applying events, publishing changes |
````

## Step 2 — Order lifecycle

```states title="Order"
[*] --> PLACED
PLACED --> ACCEPTED : ACCEPT (restaurant)
PLACED --> REJECTED : REJECT (restaurant) / refund
PLACED --> CANCELLED : CANCEL (customer) / refund
ACCEPTED --> CANCELLED : CANCEL (customer) / refund
ACCEPTED --> PREPARING : START_PREPARING (restaurant)
PREPARING --> OUT_FOR_DELIVERY : PICK_UP (courier)
OUT_FOR_DELIVERY --> DELIVERED : DELIVER (courier)
DELIVERED --> [*]
REJECTED --> [*]
CANCELLED --> [*]
```

````reveal title="Events as a transition table"
Instead of methods like `accept()`, `reject()`, `cancel()` each re-checking state, put the rules in one enum:

| Event | Role | From | To |
|---|---|---|---|
| ACCEPT | RESTAURANT | PLACED | ACCEPTED |
| REJECT | RESTAURANT | PLACED | REJECTED |
| START_PREPARING | RESTAURANT | ACCEPTED | PREPARING |
| PICK_UP | COURIER | PREPARING | OUT_FOR_DELIVERY |
| DELIVER | COURIER | OUT_FOR_DELIVERY | DELIVERED |
| CANCEL | CUSTOMER | PLACED, ACCEPTED | CANCELLED |

`Order.apply(event, role)` checks the role and the source state, then moves. The whole lifecycle is readable in one place, and a new step is one new row.
````

## Step 3 — Class design

```uml title="Food ordering"
class OrderService
  - restaurants: Map<String, Restaurant>
  - carts: Map<String, Cart>
  - orders: Map<String, Order>
  - pricing: PriceCalculator
  - payments: PaymentGateway
  - listeners: List<OrderListener>
  + cart(customer: String): Cart
  + placeOrder(customer: String, address: String, card: String): Order
  + update(orderId: String, event: OrderEvent, role: Role): void
class Restaurant
  - menu: Map<String, MenuItem>
  - open: boolean
  + item(id: String): MenuItem
class Cart
  - restaurant: Restaurant
  - quantities: Map<String, Integer>
  + add(r: Restaurant, itemId: String, qty: int): void
class PriceCalculator
  + bill(lines: List<OrderLine>): Bill
class Order
  - lines: List<OrderLine>
  - bill: Bill
  - status: OrderStatus
  - history: List<OrderStatus>
  + builder(): Builder
  + apply(e: OrderEvent, role: Role): OrderStatus
enum OrderEvent
  ACCEPT
  REJECT
  START_PREPARING
  PICK_UP
  DELIVER
  CANCEL
interface OrderListener
  + onStatusChanged(o: Order, from: OrderStatus, to: OrderStatus): void
class CustomerNotifier
class RefundOnCancel
OrderService o-- "0..*" Restaurant
OrderService *-- "0..*" Cart
OrderService o-- "0..*" Order
OrderService --> PriceCalculator
OrderService o-- "0..*" OrderListener
Order ..> OrderEvent
CustomerNotifier ..|> OrderListener
RefundOnCancel ..|> OrderListener
Restaurant *-- "0..*" MenuItem
```

## Step 4 — Implementation

````hint title="Hint — what to re-check at checkout"
The cart was filled minutes ago. At checkout, re-read every item from the menu: it may have become unavailable, and its **current** price is the one you snapshot into the order. Also check the restaurant is still open. Only then charge the customer.
````

````solution title="Complete Java solution"
```java title="FoodOrderingDemo.java" file="FoodOrderingDemo.java"
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;

public class FoodOrderingDemo {
    public static void main(String[] args) {
        Restaurant spice = new Restaurant("R1", "Spice Hub");
        spice.addItem(new MenuItem("paneer", "Paneer Tikka", 240, true));
        spice.addItem(new MenuItem("dal", "Dal Makhani", 180, true));
        spice.addItem(new MenuItem("naan", "Naan", 40, true));
        Restaurant pizza = new Restaurant("R2", "Pizza Point");
        pizza.addItem(new MenuItem("marg", "Margherita", 300, true));

        FakePayments payments = new FakePayments();
        OrderService service = new OrderService(List.of(spice, pizza), new PriceCalculator(40, 500, 5), payments);
        service.addListener(new CustomerNotifier());
        service.addListener(new RefundOnCancel(payments));

        Cart asha = service.cart("asha");
        asha.add(spice, "paneer", 1);
        asha.add(spice, "naan", 2);
        asha.add(spice, "dal", 1);
        attempt(() -> asha.add(pizza, "marg", 1));
        Order o1 = service.placeOrder("asha", "12 MG Road", "card-1");
        System.out.println(o1.id() + " bill: " + o1.bill());
        service.update(o1.id(), OrderEvent.ACCEPT, Role.RESTAURANT);
        service.update(o1.id(), OrderEvent.START_PREPARING, Role.RESTAURANT);
        attempt(() -> service.update(o1.id(), OrderEvent.CANCEL, Role.CUSTOMER));
        attempt(() -> service.update(o1.id(), OrderEvent.PICK_UP, Role.RESTAURANT));
        service.update(o1.id(), OrderEvent.PICK_UP, Role.COURIER);
        service.update(o1.id(), OrderEvent.DELIVER, Role.COURIER);

        service.cart("ravi").add(spice, "dal", 1);
        Order o2 = service.placeOrder("ravi", "4 Park St", "card-2");
        System.out.println(o2.id() + " bill: " + o2.bill());
        service.update(o2.id(), OrderEvent.REJECT, Role.RESTAURANT);

        service.cart("meera").add(spice, "naan", 3);
        spice.setAvailable("naan", false);
        attempt(() -> service.placeOrder("meera", "9 Lake Rd", "card-3"));

        System.out.println(o1.id() + " history: " + o1.history());
        System.out.println("refunds: " + payments.refunds());
    }

    static void attempt(Runnable action) {
        try {
            action.run();
        } catch (OrderException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
    }
}

class OrderException extends RuntimeException {
    OrderException(String message) { super(message); }
}

// ---------- Menu ----------

record MenuItem(String id, String name, long price, boolean available) {
    MenuItem withAvailable(boolean a) { return new MenuItem(id, name, price, a); }
}

final class Restaurant {
    private final String id;
    private final String name;
    private final Map<String, MenuItem> menu = new ConcurrentHashMap<>();
    private volatile boolean open = true;

    Restaurant(String id, String name) { this.id = id; this.name = name; }

    String id() { return id; }
    String name() { return name; }
    boolean isOpen() { return open; }
    void setOpen(boolean open) { this.open = open; }
    void addItem(MenuItem item) { menu.put(item.id(), item); }
    void setAvailable(String itemId, boolean available) { menu.computeIfPresent(itemId, (k, v) -> v.withAvailable(available)); }

    MenuItem item(String itemId) {
        MenuItem m = menu.get(itemId);
        if (m == null) throw new OrderException(name + " has no item " + itemId);
        return m;
    }
}

// ---------- Cart ----------

final class Cart {
    private Restaurant restaurant;
    private final Map<String, Integer> quantities = new LinkedHashMap<>();

    synchronized void add(Restaurant r, String itemId, int qty) {
        if (qty <= 0) throw new OrderException("quantity must be positive");
        if (restaurant != null && restaurant != r) throw new OrderException("cart has items from " + restaurant.name() + "; clear it first");
        if (!r.item(itemId).available()) throw new OrderException(r.item(itemId).name() + " is not available");
        restaurant = r;
        quantities.merge(itemId, qty, Integer::sum);
    }

    synchronized void clear() {
        restaurant = null;
        quantities.clear();
    }

    synchronized Restaurant restaurant() { return restaurant; }
    synchronized Map<String, Integer> quantities() { return new LinkedHashMap<>(quantities); }
}

// ---------- Pricing ----------

record OrderLine(String itemId, String name, long unitPrice, int quantity) {
    long total() { return unitPrice * quantity; }
}

record Bill(long subtotal, long deliveryFee, long tax, long total) {
    @Override public String toString() { return "subtotal " + subtotal + " + delivery " + deliveryFee + " + tax " + tax + " = " + total; }
}

final class PriceCalculator {
    private final long deliveryFee;
    private final long freeDeliveryFrom;
    private final int taxPercent;

    PriceCalculator(long deliveryFee, long freeDeliveryFrom, int taxPercent) {
        this.deliveryFee = deliveryFee;
        this.freeDeliveryFrom = freeDeliveryFrom;
        this.taxPercent = taxPercent;
    }

    Bill bill(List<OrderLine> lines) {
        long subtotal = lines.stream().mapToLong(OrderLine::total).sum();
        long fee = subtotal >= freeDeliveryFrom ? 0 : deliveryFee;
        long tax = subtotal * taxPercent / 100;
        return new Bill(subtotal, fee, tax, subtotal + fee + tax);
    }
}

// ---------- Lifecycle ----------

enum Role { CUSTOMER, RESTAURANT, COURIER }

enum OrderStatus { PLACED, ACCEPTED, PREPARING, OUT_FOR_DELIVERY, DELIVERED, REJECTED, CANCELLED }

/** The whole lifecycle in one table: who may trigger each event, from where, to where. */
enum OrderEvent {
    ACCEPT(Role.RESTAURANT, OrderStatus.ACCEPTED, OrderStatus.PLACED),
    REJECT(Role.RESTAURANT, OrderStatus.REJECTED, OrderStatus.PLACED),
    START_PREPARING(Role.RESTAURANT, OrderStatus.PREPARING, OrderStatus.ACCEPTED),
    PICK_UP(Role.COURIER, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.PREPARING),
    DELIVER(Role.COURIER, OrderStatus.DELIVERED, OrderStatus.OUT_FOR_DELIVERY),
    CANCEL(Role.CUSTOMER, OrderStatus.CANCELLED, OrderStatus.PLACED, OrderStatus.ACCEPTED);

    final Role role;
    final OrderStatus to;
    final Set<OrderStatus> from;

    OrderEvent(Role role, OrderStatus to, OrderStatus first, OrderStatus... rest) {
        this.role = role;
        this.to = to;
        this.from = EnumSet.of(first, rest);
    }
}

final class Order {
    private final String id;
    private final String customer;
    private final String restaurantId;
    private final String address;
    private final List<OrderLine> lines;
    private final Bill bill;
    private final String paymentRef;
    private final List<OrderStatus> history = new ArrayList<>(List.of(OrderStatus.PLACED));
    private OrderStatus status = OrderStatus.PLACED;

    private Order(Builder b) {
        id = b.id; customer = b.customer; restaurantId = b.restaurantId; address = b.address;
        lines = List.copyOf(b.lines); bill = b.bill; paymentRef = b.paymentRef;
    }

    static Builder builder() { return new Builder(); }

    String id() { return id; }
    String customer() { return customer; }
    String restaurantId() { return restaurantId; }
    String address() { return address; }
    List<OrderLine> lines() { return lines; }
    Bill bill() { return bill; }
    String paymentRef() { return paymentRef; }
    synchronized OrderStatus status() { return status; }
    synchronized List<OrderStatus> history() { return List.copyOf(history); }

    /** Validates role and source state, then moves. Returns the previous status. */
    synchronized OrderStatus apply(OrderEvent event, Role role) {
        if (event.role != role) throw new OrderException(role + " cannot " + event + " an order");
        if (!event.from.contains(status)) throw new OrderException("cannot " + event + " order " + id + " when " + status);
        OrderStatus previous = status;
        status = event.to;
        history.add(status);
        return previous;
    }

    static final class Builder {
        private String id, customer, restaurantId, address, paymentRef;
        private List<OrderLine> lines = List.of();
        private Bill bill;

        Builder id(String v) { id = v; return this; }
        Builder customer(String v) { customer = v; return this; }
        Builder restaurant(String v) { restaurantId = v; return this; }
        Builder address(String v) { address = v; return this; }
        Builder lines(List<OrderLine> v) { lines = v; return this; }
        Builder bill(Bill v) { bill = v; return this; }
        Builder paymentRef(String v) { paymentRef = v; return this; }

        Order build() {
            if (id == null || customer == null || restaurantId == null || bill == null || paymentRef == null) throw new IllegalStateException("incomplete order");
            if (address == null || address.isBlank()) throw new OrderException("delivery address is required");
            if (lines.isEmpty()) throw new OrderException("an order needs at least one item");
            return new Order(this);
        }
    }
}

// ---------- Payments + observers ----------

interface PaymentGateway {
    String charge(String card, long amount, String idempotencyKey);
    void refund(String paymentRef);
}

final class FakePayments implements PaymentGateway {
    private final List<String> refunds = new CopyOnWriteArrayList<>();
    public String charge(String card, long amount, String key) { return "pay-" + key; }
    public void refund(String paymentRef) { refunds.add(paymentRef); }
    List<String> refunds() { return List.copyOf(refunds); }
}

interface OrderListener { void onStatusChanged(Order order, OrderStatus from, OrderStatus to); }

final class CustomerNotifier implements OrderListener {
    public void onStatusChanged(Order order, OrderStatus from, OrderStatus to) {
        System.out.println("  -> " + order.customer() + ": order " + order.id() + " is " + to);
    }
}

final class RefundOnCancel implements OrderListener {
    private final PaymentGateway payments;
    RefundOnCancel(PaymentGateway payments) { this.payments = payments; }

    public void onStatusChanged(Order order, OrderStatus from, OrderStatus to) {
        if (to == OrderStatus.REJECTED || to == OrderStatus.CANCELLED) payments.refund(order.paymentRef());
    }
}

// ---------- Facade ----------

final class OrderService {
    private final Map<String, Restaurant> restaurants = new ConcurrentHashMap<>();
    private final Map<String, Cart> carts = new ConcurrentHashMap<>();
    private final Map<String, Order> orders = new ConcurrentHashMap<>();
    private final List<OrderListener> listeners = new CopyOnWriteArrayList<>();
    private final PriceCalculator pricing;
    private final PaymentGateway payments;
    private final AtomicLong ids = new AtomicLong();

    OrderService(List<Restaurant> restaurants, PriceCalculator pricing, PaymentGateway payments) {
        restaurants.forEach(r -> this.restaurants.put(r.id(), r));
        this.pricing = pricing;
        this.payments = payments;
    }

    void addListener(OrderListener l) { listeners.add(l); }

    Cart cart(String customer) { return carts.computeIfAbsent(customer, c -> new Cart()); }

    Order placeOrder(String customer, String address, String card) {
        Cart cart = cart(customer);
        Restaurant restaurant;
        Map<String, Integer> quantities;
        synchronized (cart) {                                       // consistent snapshot of the cart
            restaurant = cart.restaurant();
            quantities = cart.quantities();
        }
        if (restaurant == null) throw new OrderException("cart is empty");
        if (!restaurant.isOpen()) throw new OrderException(restaurant.name() + " is closed");
        List<OrderLine> lines = new ArrayList<>();
        quantities.forEach((itemId, qty) -> {
            MenuItem m = restaurant.item(itemId);                   // re-read: availability and price may have changed
            if (!m.available()) throw new OrderException(m.name() + " is no longer available");
            lines.add(new OrderLine(m.id(), m.name(), m.price(), qty));
        });
        Bill bill = pricing.bill(lines);
        String id = "O" + ids.incrementAndGet();
        String paymentRef = payments.charge(card, bill.total(), id); // the order ID doubles as the idempotency key
        Order order = Order.builder().id(id).customer(customer).restaurant(restaurant.id())
                .address(address).lines(lines).bill(bill).paymentRef(paymentRef).build();
        orders.put(id, order);
        cart.clear();
        publish(order, null, OrderStatus.PLACED);
        return order;
    }

    void update(String orderId, OrderEvent event, Role role) {
        Order order = orders.get(orderId);
        if (order == null) throw new OrderException("no order " + orderId);
        OrderStatus from = order.apply(event, role);
        publish(order, from, event.to);
    }

    private void publish(Order order, OrderStatus from, OrderStatus to) {
        listeners.forEach(l -> l.onStatusChanged(order, from, to));
    }
}
```
````

## Design decisions

- **Single responsibility per class.** `Cart` collects choices, `PriceCalculator` prices, `Order` guards its lifecycle, `OrderService` orchestrates, listeners react. Changing the tax rule touches one class (see [Single responsibility](lesson:single-responsibility)).
- **Transition table in an enum.** `OrderEvent` lists role, source states and target state for every step. `Order.apply` is six lines and never changes when steps are added (see [State machines](lesson:state-machines)).
- **Snapshot at checkout.** `OrderLine` copies name and unit price, so a later menu change can't alter a placed order or its refund.
- **Builder for the order.** Many fields, all required except at different moments; `build()` validates once so an `Order` is always complete (see [Builder](lesson:builder)).
- **Refunds as an observer.** The order doesn't know about payments; `RefundOnCancel` reacts to `REJECTED` and `CANCELLED`. Courier assignment on `ACCEPTED` would be another listener (see [Observer](lesson:observer)).

## Patterns and principles

[State machine](lesson:state-machines) (`OrderEvent` table), [Builder](lesson:builder) (`Order.Builder`), [Observer](lesson:observer) (`OrderListener`), [Facade](lesson:facade) (`OrderService`), [single responsibility](lesson:single-responsibility), and [idempotency](lesson:idempotency) for the charge (order ID as key).

## Example execution flow

```text
asha's cart: Spice Hub - Paneer Tikka x1, Naan x2, Dal Makhani x1
add Margherita (Pizza Point)  -> rejected: cart is locked to Spice Hub
placeOrder(asha)    re-read menu -> lines with current prices -> bill 500 + 0 + 25 = 525
                    charge(card-1, 525, key O1) -> build Order -> clear cart -> PLACED
ACCEPT (restaurant) -> ACCEPTED; START_PREPARING -> PREPARING
CANCEL (customer)   -> PREPARING not in {PLACED, ACCEPTED} -> rejected
PICK_UP (restaurant) -> wrong role -> rejected; PICK_UP (courier) -> OUT_FOR_DELIVERY; DELIVER -> DELIVERED
ravi: Dal Makhani -> bill 180 + 40 + 9 = 229; REJECT -> RefundOnCancel refunds pay-O2
meera: Naan becomes unavailable after it was added -> checkout rejected, nothing charged
```

```text title="Program output"
Rejected: cart has items from Spice Hub; clear it first
  -> asha: order O1 is PLACED
O1 bill: subtotal 500 + delivery 0 + tax 25 = 525
  -> asha: order O1 is ACCEPTED
  -> asha: order O1 is PREPARING
Rejected: cannot CANCEL order O1 when PREPARING
Rejected: RESTAURANT cannot PICK_UP an order
  -> asha: order O1 is OUT_FOR_DELIVERY
  -> asha: order O1 is DELIVERED
  -> ravi: order O2 is PLACED
O2 bill: subtotal 180 + delivery 40 + tax 9 = 229
  -> ravi: order O2 is REJECTED
Rejected: Naan is no longer available
O1 history: [PLACED, ACCEPTED, PREPARING, OUT_FOR_DELIVERY, DELIVERED]
refunds: [pay-O2]
```

## Edge cases

- **Item from a second restaurant** → rejected; the cart is unchanged.
- **Item becomes unavailable between cart and checkout** → checkout rejected before charging; the cart is kept so the customer can edit it.
- **Menu price changes after ordering** → the order keeps its snapshot price.
- **Empty cart, missing address, closed restaurant** → rejected.
- **Cancel after cooking started** → rejected by the transition table.
- **Wrong actor** (restaurant marking delivered) → rejected by the role check.

## Tests

```java title="FoodOrderingTest.java" file="FoodOrderingTest.java" test="FoodOrderingDemo.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class FoodOrderingTest {
    private Restaurant r1;
    private Restaurant r2;
    private FakePayments payments;
    private OrderService service;

    @BeforeEach
    void setUp() {
        r1 = new Restaurant("R1", "One");
        r1.addItem(new MenuItem("a", "Item A", 100, true));
        r2 = new Restaurant("R2", "Two");
        r2.addItem(new MenuItem("b", "Item B", 100, true));
        payments = new FakePayments();
        service = new OrderService(List.of(r1, r2), new PriceCalculator(40, 500, 5), payments);
        service.addListener(new RefundOnCancel(payments));
    }

    private Order order(String customer, int qty) {
        service.cart(customer).add(r1, "a", qty);
        return service.placeOrder(customer, "addr", "card");
    }

    @Test
    void billAppliesFreeDeliveryThresholdAndTax() {
        assertEquals(new Bill(400, 40, 20, 460), order("c1", 4).bill());
        assertEquals(new Bill(500, 0, 25, 525), order("c2", 5).bill());
    }

    @Test
    void cartIsLockedToOneRestaurant() {
        service.cart("c").add(r1, "a", 1);
        assertThrows(OrderException.class, () -> service.cart("c").add(r2, "b", 1));
        service.cart("c").clear();
        service.cart("c").add(r2, "b", 1);
    }

    @Test
    void happyPathRecordsTheFullHistory() {
        Order o = order("c", 1);
        service.update(o.id(), OrderEvent.ACCEPT, Role.RESTAURANT);
        service.update(o.id(), OrderEvent.START_PREPARING, Role.RESTAURANT);
        service.update(o.id(), OrderEvent.PICK_UP, Role.COURIER);
        service.update(o.id(), OrderEvent.DELIVER, Role.COURIER);
        assertEquals(List.of(OrderStatus.PLACED, OrderStatus.ACCEPTED, OrderStatus.PREPARING, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED), o.history());
    }

    @Test
    void customerMayCancelOnlyBeforePreparationAndGetsARefund() {
        Order o = order("c", 1);
        service.update(o.id(), OrderEvent.ACCEPT, Role.RESTAURANT);
        assertThrows(OrderException.class, () -> service.update(o.id(), OrderEvent.CANCEL, Role.RESTAURANT));
        service.update(o.id(), OrderEvent.CANCEL, Role.CUSTOMER);
        assertEquals(List.of(o.paymentRef()), payments.refunds());
        assertThrows(OrderException.class, () -> service.update(o.id(), OrderEvent.ACCEPT, Role.RESTAURANT));
    }

    @Test
    void unavailableItemFailsCheckoutAndKeepsTheCart() {
        service.cart("c").add(r1, "a", 1);
        r1.setAvailable("a", false);
        assertThrows(OrderException.class, () -> service.placeOrder("c", "addr", "card"));
        assertEquals(1, service.cart("c").quantities().size());
    }

    @Test
    void placedOrderKeepsItsSnapshotPrice() {
        Order o = order("c", 2);
        r1.addItem(new MenuItem("a", "Item A", 999, true));          // price change after ordering
        assertEquals(200, o.bill().subtotal());
    }
}
```

## Concurrency

- **Order transitions** are `synchronized` on the order. If the restaurant rejects while the customer cancels, the two are serialised: whichever runs first wins, and the other is refused because the order is no longer `PLACED`. The refund listener therefore fires once.
- **Cart edits vs checkout:** checkout copies the cart under its lock, so a concurrent `add` lands either before (in the order) or after (left in the cart for next time).
- **Listener ordering:** events are published after the lock is released, so two quick transitions could reach listeners out of order. If that matters, publish from a single-threaded per-order queue, or include the new status's position in the history with each event.
- **Charging twice:** if `placeOrder` is retried after a timeout, the payment's idempotency key (the order ID) must come from the client's request rather than a fresh ID — see the follow-up.

## Common mistakes and alternatives

- **Pricing from the live menu at delivery time** — prices move under the customer's feet.
- **Status as a string set by any caller** — no rules, no audit.
- **Notifications and refunds inside `Order`** — the domain object now depends on SMS and payments.
- **Charging before validating items** — refund churn for an order that never existed.
- **Alternative:** the State pattern (one class per status) if statuses gain behaviour of their own, such as different cancellation fees per status.

## Follow-up questions

````reveal title="Make placeOrder safe to retry"
The client sends a `checkoutId` (generated when the checkout screen opens). The service stores `checkoutId → orderId`; a retried request with the same ID returns the existing order instead of charging again. Use the same ID as the payment idempotency key.
````

````reveal title="Coupons and discounts"
Add a `DiscountPolicy` (Strategy) consulted by `PriceCalculator`: percentage off, flat off above a minimum, free delivery. Keep the applied discount in the `Bill` snapshot so refunds return what was actually paid.
````

````reveal title="Assign a courier"
A `CourierAssigner` listener reacts to `ACCEPTED`: it finds a nearby free courier (see [Ride-Sharing Matching](problem:ride-sharing)) and records the assignment. Only the assigned courier may `PICK_UP` and `DELIVER`, so the role check becomes "role and identity".
````

## Complexity

- `placeOrder`: O(L) for L distinct items in the cart.
- `update`: O(1) plus O(K) for K listeners.

## Interviewer checklist

- [ ] Order lifecycle drawn with roles per transition
- [ ] Cart limited to one restaurant
- [ ] Re-validation and price snapshot at checkout
- [ ] Separate classes for cart, pricing, lifecycle, orchestration
- [ ] Observers for notifications and refunds
- [ ] Payment idempotency and concurrent transitions discussed
