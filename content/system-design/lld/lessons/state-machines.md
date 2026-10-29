## Why lifecycles deserve explicit modelling

Most interesting entities in LLD problems have a **lifecycle**: orders, bookings, payments, tickets, elevator cars, approval requests. Bugs cluster around lifecycles — cancelling something already shipped, refunding something never captured, two threads moving the same booking in different directions. The fix is to make the lifecycle **explicit**: a finite set of states, a finite set of events, and a definition of which transitions are legal. Anything else is rejected.

This lesson covers the engineering side: representing the machine in Java, guards and actions, timeouts, history, and how to choose between an enum machine and the [State pattern](lesson:state-pattern). Concurrency is covered in [Race Conditions in State Transitions](lesson:concurrent-state-transitions).

## The vocabulary

| Term | Meaning | Example (seat hold) |
|---|---|---|
| **State** | A condition with distinct allowed behaviour | `AVAILABLE`, `HELD`, `BOOKED` |
| **Event** | Something that may cause a transition | `hold`, `confirm`, `release`, `expire` |
| **Guard** | A condition that must hold for the transition | `[same user]`, `[before expiry]` |
| **Action** | A side effect performed on the transition | `/ record holder`, `/ emit SeatBooked` |
| **Terminal state** | No outgoing transitions | `BOOKED` (for this show) |

```states title="A seat for one show"
[*] --> AVAILABLE
AVAILABLE --> HELD : hold(user) / start 10-min timer
HELD --> BOOKED : confirm(user) [same user, not expired]
HELD --> AVAILABLE : release(user) [same user]
HELD --> AVAILABLE : expire [now >= holdUntil]
BOOKED --> [*]
```

## A reusable, table-driven state machine

Encode the diagram as **data** and keep the entity's code small. A generic machine is about 30 lines:

```java title="A small generic state machine, used by an entity" file="StateMachineDemo.java"
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;

public class StateMachineDemo {
    public static void main(String[] args) {
        Instant t0 = Instant.parse("2026-04-01T18:00:00Z");
        Seat seat = new Seat("A7");

        seat.hold("asha", t0);
        try {
            seat.confirm("ravi", t0.plusSeconds(30));                // guard: wrong user
        } catch (IllegalStateException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
        seat.confirm("asha", t0.plusSeconds(60));
        System.out.println(seat.state() + " " + seat.history());

        Seat other = new Seat("A8");
        other.hold("meera", t0);
        System.out.println("Before expiry check: " + other.state());
        other.expireIfDue(t0.plus(Duration.ofMinutes(11)));          // timeout transition
        System.out.println("After 11 minutes: " + other.state());
        try {
            other.confirm("meera", t0.plus(Duration.ofMinutes(11)));
        } catch (IllegalStateException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
    }
}

/** Generic, reusable: (state, event) -> next state, plus an optional guard per transition. */
final class StateMachine<S extends Enum<S>, E extends Enum<E>, C> {
    private record Transition<S, C>(S target, Predicate<C> guard, String guardName) {}

    private final Map<S, Map<E, Transition<S, C>>> table;

    StateMachine(Class<S> stateType) { this.table = new EnumMap<>(stateType); }

    StateMachine<S, E, C> allow(S from, E event, S to) { return allow(from, event, to, c -> true, "always"); }

    StateMachine<S, E, C> allow(S from, E event, S to, Predicate<C> guard, String guardName) {
        table.computeIfAbsent(from, k -> new java.util.HashMap<>()).put(event, new Transition<>(to, guard, guardName));
        return this;
    }

    /** Returns the next state or throws if the move is illegal or the guard fails. */
    S next(S current, E event, C context) {
        Transition<S, C> t = table.getOrDefault(current, Map.of()).get(event);
        if (t == null) throw new IllegalStateException("illegal: " + event + " in " + current);
        if (!t.guard().test(context)) throw new IllegalStateException("guard failed (" + t.guardName() + ") for " + event);
        return t.target();
    }
}

enum SeatState { AVAILABLE, HELD, BOOKED }
enum SeatEvent { HOLD, CONFIRM, RELEASE, EXPIRE }

/** Context passed to guards: who is acting, and when. */
record SeatCommand(String user, Instant now) {}

final class Seat {
    private static final Duration HOLD_TTL = Duration.ofMinutes(10);

    private final String id;
    private SeatState state = SeatState.AVAILABLE;
    private String holder;
    private Instant holdUntil;
    private final List<String> history = new ArrayList<>();

    // The whole lifecycle in one readable block.
    private final StateMachine<SeatState, SeatEvent, SeatCommand> machine = new StateMachine<SeatState, SeatEvent, SeatCommand>(SeatState.class)
            .allow(SeatState.AVAILABLE, SeatEvent.HOLD, SeatState.HELD)
            .allow(SeatState.HELD, SeatEvent.CONFIRM, SeatState.BOOKED,
                    c -> c.user().equals(holder) && c.now().isBefore(holdUntil), "same user, not expired")
            .allow(SeatState.HELD, SeatEvent.RELEASE, SeatState.AVAILABLE, c -> c.user().equals(holder), "same user")
            .allow(SeatState.HELD, SeatEvent.EXPIRE, SeatState.AVAILABLE, c -> !c.now().isBefore(holdUntil), "hold expired");

    Seat(String id) { this.id = id; }

    void hold(String user, Instant now) {
        apply(SeatEvent.HOLD, new SeatCommand(user, now));
        holder = user;                                    // transition actions
        holdUntil = now.plus(HOLD_TTL);
    }

    void confirm(String user, Instant now) { apply(SeatEvent.CONFIRM, new SeatCommand(user, now)); }

    void release(String user, Instant now) {
        apply(SeatEvent.RELEASE, new SeatCommand(user, now));
        clearHold();
    }

    /** Timeouts are just events, triggered by a scheduler or lazily on access. */
    void expireIfDue(Instant now) {
        if (state == SeatState.HELD && !now.isBefore(holdUntil)) {
            apply(SeatEvent.EXPIRE, new SeatCommand("system", now));
            clearHold();
        }
    }

    private void apply(SeatEvent event, SeatCommand cmd) {
        SeatState next = machine.next(state, event, cmd);   // throws if illegal
        history.add(state + " -" + event + "-> " + next + " by " + cmd.user());
        state = next;
    }

    private void clearHold() { holder = null; holdUntil = null; }

    SeatState state() { return state; }
    List<String> history() { return List.copyOf(history); }
}
```

What this buys you:

- **The legal lifecycle is visible in one place** and matches the diagram line for line.
- **Illegal transitions fail loudly**, with a message naming the event and state.
- **Guards** encode rules like "only the holder can confirm".
- **History** gives you an audit trail for free.

## Designing good state machines

1. **States should change behaviour.** `PAID` and `SHIPPED` are states. `HAS_3_ITEMS` is data.
2. **Replace boolean flags.** `isPaid`, `isShipped` and `isCancelled` allow 8 combinations, most of them nonsense. One enum allows exactly the legal ones.
3. **Model timeouts as events.** Holds expire, payments time out, invitations lapse. Trigger the event from a scheduler, or **lazily** when the entity is next accessed (`expireIfDue(now)` above). Lazy expiry is simpler and needs no background thread.
4. **Keep terminal states terminal.** `DELIVERED`, `REFUNDED` and `CANCELLED` should have no outgoing transitions. If the business needs "reopen", model it as an explicit transition.
5. **Separate the decision from side effects.** First decide the next state (pure), then perform actions (emit events, notify). If an action fails, you know exactly which state you're in.
6. **Record history** when auditability matters (payments, approvals).

## Enum machine vs State pattern

| Use an **enum + transition table** when… | Use the **State pattern** when… |
|---|---|
| States mostly **gate** which operations are allowed | Each state has **substantially different behaviour** for many operations |
| You want the whole lifecycle visible in one table | Per-state logic is large and benefits from its own class |
| Transitions may be **configured** (loaded from data) | The machine is fixed in code |

Many designs **combine** them: an enum for status plus a table for legality, with a little per-state logic in enum constant bodies.

## Real-world example

A payments service had `Payment` objects with eight boolean flags and status strings set from five services. Reconciliation found payments that were "refunded" without ever being "captured". The team drew the state diagram — `CREATED → AUTHORISED → CAPTURED → PARTIALLY_REFUNDED / REFUNDED`, plus `FAILED` and `VOIDED` — encoded it as a transition table, and routed every change through `payment.apply(event)`. Illegal transitions became exceptions in staging instead of financial discrepancies in production. See [Payment Workflow](problem:payment-workflow).

## Common mistakes

- **Setters for status** (`setStatus(SHIPPED)`) that bypass the machine.
- **Transition rules scattered** across services instead of one table.
- **Forgetting timeouts and cancellations** — the "unhappy" edges of the diagram.
- **Side effects before the transition is validated** (sending "Your order shipped!" and then failing the transition).
- **No concurrency story**: two threads applying events to the same entity at once. See [Race Conditions](lesson:concurrent-state-transitions).

## In the interview

> [!INTERVIEW] Draw it, then encode it
> *"Here's the booking lifecycle: HELD → CONFIRMED, HELD → EXPIRED after 10 minutes, CONFIRMED → CANCELLED with a refund. I'll encode it as an enum with a transition table, so illegal moves throw, and expiry is checked lazily when the booking is accessed."* This takes two minutes and answers half the edge-case questions before they're asked.

## Key takeaways

- Make lifecycles **explicit**: states, events, guards, actions; everything else is illegal.
- A **transition table** keeps the machine readable and verifiable against the diagram.
- Model **timeouts as events**; lazy expiry is often simplest.
- Decide the transition first, then perform side effects; record history when it matters.
- Choose enum machines for gating and the State pattern for rich per-state behaviour.

## Knowledge check

```quiz
? An Order has booleans isPaid, isShipped and isCancelled. What's the main design problem?
+ They allow impossible combinations, such as shipped and cancelled; one status enum with legal transitions prevents that
- Booleans use too much memory
- The class needs more booleans
> Explicit states remove impossible combinations.

? How should a 10-minute seat-hold expiry be modelled?
- By deleting the seat
+ As an EXPIRE event that moves HELD back to AVAILABLE, triggered by a scheduler or checked lazily on access
- By never expiring holds
> Timeouts are just events in the state machine.

? Why decide the next state before performing side effects like sending notifications?
+ If the transition is illegal, no misleading side effect happens, and you always know which state you're in
- It's faster
- Java requires it
> Validate, then act: that keeps state and side effects consistent.
```

## Exercise

Model a **cab ride** lifecycle: `REQUESTED → DRIVER_ASSIGNED → DRIVER_ARRIVED → IN_PROGRESS → COMPLETED`, with cancellations allowed by the rider before `IN_PROGRESS` (free before `DRIVER_ARRIVED`, with a fee after), and by the driver before `DRIVER_ARRIVED`. Rides without a driver are cancelled automatically after 5 minutes. Write the transition table (states × events → next state), list the guards and actions, and identify the terminal states.

````hint title="Hint"
Use separate events for `RIDER_CANCEL`, `DRIVER_CANCEL` and `TIMEOUT`, so the guards and actions (fees, re-matching) differ cleanly. What should happen when a *driver* cancels — is the ride over, or does it go back to waiting for a driver?
````

````solution title="Sample answer"
| From | Event | Guard | To | Action |
|---|---|---|---|---|
| REQUESTED | ASSIGN_DRIVER | driver available | DRIVER_ASSIGNED | notify rider |
| REQUESTED | TIMEOUT | now ≥ requestedAt + 5 min | CANCELLED | notify "no drivers" |
| REQUESTED | RIDER_CANCEL | — | CANCELLED | no fee |
| DRIVER_ASSIGNED | DRIVER_ARRIVED | — | DRIVER_ARRIVED | notify rider |
| DRIVER_ASSIGNED | RIDER_CANCEL | — | CANCELLED | no fee |
| DRIVER_ASSIGNED | DRIVER_CANCEL | — | REQUESTED | re-enter matching; penalise driver |
| DRIVER_ARRIVED | START_TRIP | OTP matches | IN_PROGRESS | start meter |
| DRIVER_ARRIVED | RIDER_CANCEL | — | CANCELLED | charge cancellation fee |
| IN_PROGRESS | END_TRIP | — | COMPLETED | compute fare, charge |

**Terminal states:** `COMPLETED`, `CANCELLED`. Note that a driver cancel goes **back** to `REQUESTED` (the ride isn't over; it needs a new driver). That's a decision worth stating in an interview. See [Ride-Sharing](problem:ride-sharing).
````
