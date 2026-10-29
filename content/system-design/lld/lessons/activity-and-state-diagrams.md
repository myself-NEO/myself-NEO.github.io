## Two more behavioural views

- An **activity diagram** is a flowchart of a **process**: steps, decisions, parallel branches. Use it for workflows that cross several objects, such as order fulfilment or an approval process.
- A **state diagram** (state machine) shows the **lifecycle of one object**: the states it can be in, the events that move it between states, and the conditions (guards) on those moves. Use it for anything with a status field.

State diagrams matter most in LLD interviews, because so many problems are secretly state machines: vending machines, elevators, orders, bookings, payments.

## Activity diagrams

```text
        ● start
        │
   [Receive order]
        │
        ◇ in stock? ─── no ──▶ [Notify customer] ──▶ ◉ end
        │ yes
   ═════╪═════  fork (parallel)
   │          │
[Charge     [Reserve
 payment]    stock]
   │          │
   ═════╪═════  join
        │
        ◇ payment ok? ── no ──▶ [Release stock] ──▶ ◉ end
        │ yes
   [Ship order]
        │
        ◉ end
```

| Symbol | Meaning |
|---|---|
| `●` / `◉` | Start / end |
| `[Action]` | A step |
| `◇` | Decision (guards in brackets on outgoing edges) |
| `═══` | Fork / join — parallel branches |

Activity diagrams answer "what are the steps and in what order?" They're useful for spotting **compensating actions** (release stock if payment fails) and **parallelism**.

## State diagrams

```states title="Order lifecycle"
[*] --> PLACED
PLACED --> PAID : paymentCaptured
PLACED --> CANCELLED : cancel()
PAID --> SHIPPED : ship() [address verified]
PAID --> CANCELLED : cancel() / refund
SHIPPED --> DELIVERED : deliveryConfirmed
DELIVERED --> [*]
CANCELLED --> [*]
```

Elements:

- **States** — conditions the object can be in (`PAID`).
- **Initial state** (`[*] →`) and **final states** (`→ [*]`).
- **Transitions** — labelled `event [guard] / action`:
  - *event*: what triggers it (`ship()`).
  - *guard*: a condition that must hold (`[address verified]`).
  - *action*: side effect on transition (`/ refund`).
- **Anything not drawn is illegal.** You can't ship a `PLACED` order or cancel a `DELIVERED` one.

That last point is the whole value: the diagram is a **specification of legal behaviour**.

## From state diagram to Java

The simplest faithful implementation is a **transition table**: an enum of states, an enum of events, and a map of legal moves. Illegal moves throw.

```java title="Transition table implementation" file="OrderStateDemo.java"
import java.util.EnumMap;
import java.util.Map;

public class OrderStateDemo {
    public static void main(String[] args) {
        Order order = new Order("ORD-7", true);
        order.handle(OrderEvent.PAYMENT_CAPTURED);
        order.handle(OrderEvent.SHIP);
        System.out.println(order.id() + " is " + order.status());

        Order other = new Order("ORD-8", false);
        try {
            other.handle(OrderEvent.SHIP);   // illegal from PLACED
        } catch (IllegalStateException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
        other.handle(OrderEvent.PAYMENT_CAPTURED);
        try {
            other.handle(OrderEvent.SHIP);   // guard fails: address not verified
        } catch (IllegalStateException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
        other.handle(OrderEvent.CANCEL);
        System.out.println(other.id() + " is " + other.status());
    }
}

enum OrderStatus { PLACED, PAID, SHIPPED, DELIVERED, CANCELLED }
enum OrderEvent { PAYMENT_CAPTURED, SHIP, DELIVERY_CONFIRMED, CANCEL }

class Order {
    // The diagram, as data: (state, event) -> next state.
    private static final Map<OrderStatus, Map<OrderEvent, OrderStatus>> TRANSITIONS = new EnumMap<>(OrderStatus.class);
    static {
        TRANSITIONS.put(OrderStatus.PLACED, Map.of(
                OrderEvent.PAYMENT_CAPTURED, OrderStatus.PAID,
                OrderEvent.CANCEL, OrderStatus.CANCELLED));
        TRANSITIONS.put(OrderStatus.PAID, Map.of(
                OrderEvent.SHIP, OrderStatus.SHIPPED,
                OrderEvent.CANCEL, OrderStatus.CANCELLED));
        TRANSITIONS.put(OrderStatus.SHIPPED, Map.of(
                OrderEvent.DELIVERY_CONFIRMED, OrderStatus.DELIVERED));
        TRANSITIONS.put(OrderStatus.DELIVERED, Map.of());
        TRANSITIONS.put(OrderStatus.CANCELLED, Map.of());
    }

    private final String id;
    private final boolean addressVerified;
    private OrderStatus status = OrderStatus.PLACED;

    Order(String id, boolean addressVerified) {
        this.id = id;
        this.addressVerified = addressVerified;
    }

    void handle(OrderEvent event) {
        OrderStatus next = TRANSITIONS.get(status).get(event);
        if (next == null) throw new IllegalStateException("Cannot " + event + " when " + status);
        if (event == OrderEvent.SHIP && !addressVerified) throw new IllegalStateException("Guard failed: address not verified");
        if (status == OrderStatus.PAID && next == OrderStatus.CANCELLED) refund();   // transition action
        status = next;
    }

    private void refund() { System.out.println("Refunding " + id); }

    String id() { return id; }
    OrderStatus status() { return status; }
}
```

The table is the diagram. Reviewers can compare them line by line, and adding a state means adding a row. When individual states carry a lot of **behaviour** (not just transitions), the [State pattern](lesson:state-pattern) is the next step; [State Machines & Lifecycle Management](lesson:state-machines) compares the approaches.

## Choosing the right diagram

| Question | Diagram |
|---|---|
| What are the steps of this business process? | Activity |
| What statuses can this object be in, and what moves it between them? | State |
| Which objects call which, in what order, for this scenario? | Sequence |
| What classes exist and how are they related? | Class |

## Real-world example

A payments team had nine boolean flags on `Payment` — `isAuthorised`, `isCaptured`, `isRefunded`, `isPartiallyRefunded`… That's 512 combinations, most of them meaningless, and bugs kept producing impossible ones ("refunded but never captured"). Drawing the state diagram revealed just seven legal states. Replacing the flags with one `PaymentStatus` enum and a transition table removed a whole class of bugs. See [Payment Workflow](problem:payment-workflow).

## Common mistakes

- **Boolean flags instead of states** (`isPaid`, `isShipped`, `isCancelled`).
- **Missing transitions**: forgetting cancellation or timeout paths.
- **States that are really data** (`HAS_3_ITEMS`). States should change *behaviour*.
- **Guards hidden in callers** instead of in the object that owns the state.

## In the interview

> [!INTERVIEW] Draw the lifecycle early
> For any entity with a status, sketch the state diagram in under a minute: *"A booking goes HELD → CONFIRMED, or HELD → EXPIRED after ten minutes; CONFIRMED → CANCELLED with a refund."* It shows you've thought about edge cases, and it gives you the exact checks to write in code.

## Key takeaways

- **Activity diagrams** describe processes (steps, decisions, parallelism).
- **State diagrams** describe one object's lifecycle: states, events, guards, actions.
- What isn't drawn is **illegal**: enforce it in code with a transition table.
- Replace combinations of boolean flags with an **explicit state enum**.

## Knowledge check

```quiz
? Which is the best use of a state diagram?
- Showing which classes inherit from which
+ Modelling the lifecycle of a Booking: HELD, CONFIRMED, EXPIRED, CANCELLED
- Showing the order of calls between five services
> State diagrams model one object's lifecycle.

? In the transition `PAID → SHIPPED : ship() [address verified]`, what is `[address verified]`?
- An action
+ A guard condition that must be true for the transition to happen
- A new state
> Guards in square brackets constrain when a transition is allowed.

? Why replace `isPaid`, `isShipped` and `isCancelled` booleans with one status enum?
+ Flags allow impossible combinations (like shipped and cancelled); an enum allows exactly one legal state
- Enums use less memory than booleans
- Booleans can't be persisted
> One explicit state removes impossible combinations.
```

## Exercise

Draw the state diagram for a **vending machine** with these events: `insertCoin`, `selectProduct`, `cancel`, `dispenseComplete`, and an operator `enterMaintenance`/`exitMaintenance`. Include at least one guard. Then write the transition table as a `Map<State, Map<Event, State>>`.

````hint title="Hint"
States might be IDLE, HAS_MONEY, DISPENSING, MAINTENANCE. Which transitions need a guard (enough money? product in stock?)
````

````solution title="Sample answer"
```states title="Vending machine"
[*] --> IDLE
IDLE --> HAS_MONEY : insertCoin
HAS_MONEY --> HAS_MONEY : insertCoin
HAS_MONEY --> DISPENSING : selectProduct [paid >= price and in stock]
HAS_MONEY --> IDLE : cancel / refund
DISPENSING --> IDLE : dispenseComplete / return change
IDLE --> MAINTENANCE : enterMaintenance
MAINTENANCE --> IDLE : exitMaintenance
```

```java
Map<State, Map<Event, State>> t = new EnumMap<>(State.class);
t.put(IDLE, Map.of(INSERT_COIN, HAS_MONEY, ENTER_MAINTENANCE, MAINTENANCE));
t.put(HAS_MONEY, Map.of(INSERT_COIN, HAS_MONEY, SELECT_PRODUCT, DISPENSING, CANCEL, IDLE));
t.put(DISPENSING, Map.of(DISPENSE_COMPLETE, IDLE));
t.put(MAINTENANCE, Map.of(EXIT_MAINTENANCE, IDLE));
```

Guards (`paid >= price`, `in stock`) are checked in code before applying `SELECT_PRODUCT`. Maintenance is only allowed from `IDLE`, so the operator can't interrupt a customer mid-purchase. See [Vending Machine](problem:vending-machine).
````
