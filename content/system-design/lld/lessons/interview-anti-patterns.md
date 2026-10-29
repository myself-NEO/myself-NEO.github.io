## Why study failure modes?

Most LLD rejections aren't caused by a missing pattern or a forgotten class. They're caused by a handful of **recurring behaviours** that hide an otherwise capable engineer. Each one below has a **symptom** (how it shows up), a **fix**, and **what to say instead**.

## 1. Coding before understanding the requirements

**Symptom:** within two minutes, the candidate is writing `class ParkingLot {`. Later, the interviewer mentions multiple levels, and half the code is wrong.

**Fix:** spend the first ~5 minutes on [requirements](lesson:requirements-gathering). Write a numbered list and an out-of-scope list.

**Say instead:** *"Before I design anything, let me clarify scope so I build the right thing."*

## 2. Creating too many classes too early

**Symptom:** 15 boxes in the first five minutes — `EntryGate`, `ExitGate`, `DisplayBoard`, `Attendant`, `ParkingFloorManager`… Most never get a method.

**Fix:** start with 4–7 core entities. Add a class only when a **requirement** needs its state or behaviour.

**Say instead:** *"These five entities cover the requirements. I'll add more if a requirement needs them — gates, for example, don't have behaviour of their own yet."*

## 3. Using inheritance when composition is better

**Symptom:** `HourlyCarParkingSpot extends CarParkingSpot extends ParkingSpot`; `AdminUser extends User` even though users get promoted.

**Fix:** use inheritance only for true, stable, single-axis is-a relationships. Compose varying behaviour. See [Composition vs Inheritance](lesson:composition-vs-inheritance).

**Say instead:** *"Pricing varies independently of spot type, so I'll compose a `PricingStrategy` instead of multiplying subclasses."*

## 4. God objects and giant conditionals

**Symptom:** a `ParkingLotManager` with 30 methods and every rule, while `Spot` and `Ticket` are getter/setter bags. A 50-line `switch` on vehicle type.

**Fix:** move each rule to the [information expert](lesson:entities-and-responsibilities); replace type switches with [polymorphism](lesson:four-pillars).

```java
// BAD
if (spot.getType() == LARGE || (spot.getType() == MEDIUM && v.getType() != TRUCK) || ...) { ... }
// GOOD
if (spot.fits(vehicle)) { ... }
```

**Say instead:** *"The manager is accumulating rules. Fitting belongs to `Spot`, and fees to `PricingStrategy`."*

## 5. Overusing design patterns

**Symptom:** *"I'll use Singleton for the lot, a Factory for vehicles, Observer for the display, Strategy for pricing, and a Builder for tickets"* — announced before the requirements are clear.

**Fix:** name the **problem** first; use a pattern only when it solves a stated one. See [How to Use Patterns](lesson:patterns-overview).

**Say instead:** *"Pricing will change, so it's a strategy. Everything else is simple enough without patterns for now."*

## 6. Ignoring invariants and invalid states

**Symptom:** public setters everywhere; a `Booking` can be `CONFIRMED` with no payment; a `Spot` can hold two cars; `unpark` works on an already-closed ticket.

**Fix:** list invariants explicitly; enforce them in constructors and domain methods; use [state machines](lesson:state-machines) and [value objects](lesson:domain-invariants).

**Say instead:** *"Invariant: a spot holds at most one vehicle. `Spot.occupy()` enforces it, and there's no public setter for the occupant."*

## 7. Writing tightly coupled code

**Symptom:** `new MySqlRepository()` and `new StripeClient()` inside services; `Instant.now()` in business logic; static singletons everywhere. The design can't be tested without infrastructure.

**Fix:** [inject dependencies](lesson:dependency-injection) through constructors, behind domain-owned interfaces ([DIP](lesson:dependency-inversion)).

**Say instead:** *"The service takes a `PaymentGateway` and a `Clock` in its constructor, so tests can pass fakes."*

## 8. Ignoring edge cases and concurrency

**Symptom:** only the happy path is coded. When asked "what if two people book the last seat?", the answer is "synchronized everything" or "the database handles it".

**Fix:** after the happy path, add **guard clauses** for the 3–4 most important edge cases, then identify the **critical section** (the check-then-act) and protect exactly that. See [Thread Safety](lesson:thread-safety) and [Race Conditions](lesson:concurrent-state-transitions).

**Say instead:** *"The race is between checking that the seat is free and marking it held. I make that one step atomic per show, so different shows don't contend."*

## 9. Spending the whole interview on implementation details

**Symptom:** twenty minutes writing input parsing, getters, `toString` and a console menu. The core logic is half-done when time runs out, and extensibility never comes up.

**Fix:** implement the **2–3 methods that carry the design**; stub or skip the rest out loud. Keep an eye on the clock (see the [framework's time budget](lesson:delivery-framework)).

**Say instead:** *"I'll skip getters and the CLI and focus on `park` and `unpark`, which contain the interesting logic."*

## Bonus anti-patterns

- **Silent thinking** — five minutes of silence gives the interviewer nothing to evaluate. Think out loud.
- **Ignoring hints** — when the interviewer asks a question, it's usually a requirement in disguise.
- **Defensiveness** — arguing instead of exploring alternatives when challenged.
- **HLD drift** — talking about Kafka, sharding and load balancers in an object-design round.

## A self-review checklist

Use this in the last few minutes of practice sessions:

```text
□ Requirements written, confirmed, out-of-scope listed
□ 4–7 core entities, each with a one-sentence responsibility
□ Invariants listed and enforced inside the owning objects
□ No public setters on entities; value objects are immutable
□ No switch on type codes in business logic
□ Every pattern is tied to a stated requirement
□ Dependencies injected (repositories, gateways, clock)
□ Core 2–3 methods implemented with guard clauses
□ A scenario traced end to end
□ Concurrency: critical section identified and protected at the right granularity
□ Two follow-up extensions discussed as local changes
```

## Real-world example

An interviewer at a large tech company described their most common "no hire" for strong engineers: *"They designed a beautiful hierarchy of twelve classes, then spent 25 minutes writing a menu-driven console app. At the end they hadn't implemented allocation, which was the only interesting part."* The engineer was capable; the delivery was the problem.

## Key takeaways

- Most LLD failures are **delivery** failures, not knowledge gaps.
- Requirements first; few classes; composition over inheritance; rules with their data.
- Patterns only for stated problems; invariants enforced; dependencies injected.
- Handle edge cases and concurrency explicitly; spend implementation time on the core logic.

## Knowledge check

```quiz
? You notice you've created 14 classes and 6 of them have no methods. What's the best correction?
+ Collapse or remove classes that don't carry behaviour required by the requirements
- Add getters and setters so they have methods
- Make them interfaces
> Classes should earn their place through state or behaviour that a requirement needs.

? The interviewer asks "what if two users book the same seat?" Which answer is strongest?
- "The database will handle it."
- "I'll add synchronized to every method."
+ "The race is the check-then-hold step; I'll make it atomic per show so unrelated bookings don't contend."
> Identify the precise critical section and protect it at the right granularity.

? Twenty minutes in, you're writing a console input parser. What should you do?
+ Stop, say you'll skip I/O, and implement the core domain methods
- Finish the parser; it shows completeness
- Ask the interviewer to write it
> Spend implementation time on the logic that demonstrates design skill.
```

## Exercise

Here is a candidate's design summary for **"Design a food ordering system"**. Identify at least five anti-patterns and rewrite the summary.

> "I'll make `FoodApp` a singleton with methods `addRestaurant`, `addMenuItem`, `placeOrder`, `cancelOrder`, `assignDeliveryAgent`, `calculateBill`, `applyCoupon`, `sendSms` and `generateInvoicePdf`. `Order` has public fields `status`, `items` and `total`. Bill calculation switches on coupon type. `VegOrder` and `NonVegOrder` extend `Order`. I'll start by writing the console menu."

````hint title="Hint"
Look for: singleton, god object, public mutable state, type switches, inheritance misuse, and time spent on I/O.
````

````solution title="Sample answer"
**Anti-patterns:** (1) singleton god object `FoodApp`; (2) unrelated responsibilities (SMS, PDF, pricing, dispatch) in one class; (3) public mutable fields on `Order` with no invariants; (4) a switch on coupon type instead of strategies; (5) `VegOrder`/`NonVegOrder` — an attribute modelled as subclasses; (6) starting with the console menu; (7) no requirements clarification mentioned.

**Rewrite:** "After clarifying scope (single city, card payments only, delivery assignment in scope), core entities are `Restaurant` (menu), `Cart`, `Order` (state machine PLACED → ACCEPTED → PREPARING → PICKED_UP → DELIVERED / CANCELLED, enforcing transitions), `DeliveryAgent` and a `Coupon` strategy interface. `OrderService` orchestrates placement; `DeliveryAssigner` picks agents via a strategy; notifications are observers of order events. I'll implement `placeOrder` and `Order.advance()` with guards, then discuss concurrency for agent assignment." See [Food Ordering](problem:food-ordering).
````
