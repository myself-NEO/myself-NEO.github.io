## The big idea

Every non-trivial program has a *shape*: which pieces of code exist, what each piece is responsible for, and how the pieces talk to each other. **Low-Level Design (LLD)** is the deliberate act of choosing that shape *before* (and while) you write the code.

In object-oriented languages like Java, that shape is expressed with:

- **Classes and objects** — the things in your system (`Ticket`, `ParkingSpot`, `Payment`).
- **Fields** — the data each object owns.
- **Methods** — the behaviour each object offers.
- **Interfaces and relationships** — how objects depend on and collaborate with each other.

A low-level design answers questions like *"Who decides whether a spot is free?"*, *"Where does the pricing rule live?"*, and *"What do I change when a new vehicle type arrives?"*.

> [!NOTE] Terminology
> You will also hear LLD called **object-oriented design (OOD)**, **object modelling** or **machine coding** (a hands-on variant where you write a running program in 60–90 minutes). They overlap heavily; this track covers all three.

## LLD vs HLD

**High-Level Design (HLD)** zooms out. It decides which *services*, *databases*, *caches* and *queues* a system needs and how data flows between them. LLD zooms in on **one** of those boxes and designs its internals.

| | Low-Level Design | High-Level Design |
|---|---|---|
| Unit of design | Classes, interfaces, methods | Services, data stores, networks |
| Typical prompt | "Design a parking lot" | "Design a URL shortener for 100M users" |
| Main risks | Tangled code, rigid classes, bugs | Bottlenecks, outages, data loss |
| Output | Class diagram + core Java code | Architecture diagram + APIs + data model |

Think of a city. HLD plans the roads, neighbourhoods and power grid. LLD designs the floor plan of one building — where the walls, doors and wiring go so the people inside can work without tripping over each other.

```text
HLD view                              LLD view of "Booking Service"
┌──────────┐    ┌─────────────────┐   ┌──────────────┐   ┌──────────┐
│  Client  │───▶│ Booking Service │   │ BookingFacade│──▶│ SeatHold │
└──────────┘    └───────┬─────────┘   └──────┬───────┘   └──────────┘
                        │                    │uses
                  ┌─────▼─────┐        ┌─────▼────────┐   ┌──────────┐
                  │ Database  │        │ShowRepository│   │ Pricing  │
                  └───────────┘        └──────────────┘   │ Strategy │
                                                          └──────────┘
```

## LLD in real-world software development

You practise LLD every day, even if nobody calls it that:

- **Adding a feature.** Do you add another `if` branch to an existing method, or introduce a new class that plugs into an existing interface?
- **Code review.** Comments like *"this class is doing too much"* or *"can we inject this instead of `new`-ing it?"* are LLD feedback.
- **Fixing a bug.** Many bugs exist because an object's rules (its *invariants*) are enforced in five places instead of one.
- **Writing tests.** If a class is hard to test, that is usually a design smell — it creates its own dependencies or mixes concerns.

Good LLD pays off in **change**. Code is read and modified far more often than it is written, so the goal is not clever code; it is code that is easy to understand and safe to change.

## What makes a design "good"?

There is no single correct design, but strong designs share a few properties. We will spend whole lessons on each:

1. **Clear responsibilities** — each class has one job, and you can describe it in a sentence. See [coupling and cohesion](lesson:coupling-and-cohesion).
2. **Encapsulation** — objects protect their own data and rules instead of exposing them for others to manipulate. See [the four pillars](lesson:four-pillars).
3. **Low coupling** — classes depend on small, stable abstractions, so changing one does not ripple through the rest.
4. **Extensibility where it matters** — the likely changes (new vehicle type, new payment method) can be added without rewriting existing code. See [Open/Closed](lesson:open-closed).
5. **Correctness under real conditions** — invalid states are impossible, edge cases are handled, and concurrent access is safe when required.
6. **Simplicity** — no abstractions that the requirements do not justify. See [DRY, KISS, YAGNI](lesson:dry-kiss-yagni).

## A first example

Here is a "script-style" implementation of a tiny coffee shop. It works, but everything lives in one method and all rules are tangled together:

```java title="Before: one method does everything"
import java.util.Map;

public class CoffeeShopScript {
    public static void main(String[] args) {
        Map<String, Integer> prices = Map.of("ESPRESSO", 150, "LATTE", 220);
        String drink = "LATTE";
        boolean extraShot = true;
        int balanceInCents = 300;

        int price = prices.get(drink);
        if (extraShot) price += 50;
        if (balanceInCents < price) {
            System.out.println("Insufficient balance");
            return;
        }
        balanceInCents -= price;
        System.out.println("Served " + drink + ", remaining " + balanceInCents);
    }
}
```

Now the same behaviour with a small low-level design. Each concept has an owner, and each rule lives in exactly one place:

```java title="After: responsibilities have owners" file="CoffeeShopDemo.java"
import java.util.EnumMap;
import java.util.Map;

public class CoffeeShopDemo {
    public static void main(String[] args) {
        Menu menu = new Menu(Map.of(Drink.ESPRESSO, 150, Drink.LATTE, 220));
        Wallet wallet = new Wallet(300);
        Order order = new Order(Drink.LATTE, true);

        int price = menu.priceOf(order);
        wallet.pay(price);
        System.out.println("Served " + order.drink() + ", remaining " + wallet.balance());
    }
}

enum Drink { ESPRESSO, LATTE }

/** A value object: what the customer asked for. */
record Order(Drink drink, boolean extraShot) {}

/** Owns pricing rules. */
class Menu {
    private static final int EXTRA_SHOT_CENTS = 50;
    private final Map<Drink, Integer> basePrices;

    Menu(Map<Drink, Integer> basePrices) {
        this.basePrices = new EnumMap<>(basePrices);
    }

    int priceOf(Order order) {
        Integer base = basePrices.get(order.drink());
        if (base == null) throw new IllegalArgumentException("Not on the menu: " + order.drink());
        return order.extraShot() ? base + EXTRA_SHOT_CENTS : base;
    }
}

/** Owns the balance and the rule "you cannot overspend". */
class Wallet {
    private int balanceInCents;

    Wallet(int initialCents) {
        if (initialCents < 0) throw new IllegalArgumentException("Negative balance");
        this.balanceInCents = initialCents;
    }

    void pay(int cents) {
        if (cents > balanceInCents) throw new IllegalStateException("Insufficient balance");
        balanceInCents -= cents;
    }

    int balance() { return balanceInCents; }
}
```

The second version is longer, but notice what changed:

- The pricing rule (extra shot costs 50) lives in `Menu` and nowhere else.
- The "no overspending" rule lives in `Wallet`; no caller can push the balance negative.
- Adding a new drink means adding an enum constant and a price — no `if` statements to hunt down.

```uml title="Class diagram for the coffee shop"
class Menu
  - basePrices: Map<Drink, Integer>
  + priceOf(order: Order): int
class Wallet
  - balanceInCents: int
  + pay(cents: int): void
  + balance(): int
record Order
  + drink: Drink
  + extraShot: boolean
enum Drink
  ESPRESSO
  LATTE
Menu ..> Order : prices
Order --> Drink
```

> [!TIP]
> Do not judge a design by line count. Judge it by asking: *"When the next requirement arrives, how many places do I have to touch, and how likely am I to break something?"*

## Real-world example

A payments team at an e-commerce company stores card payments in a `PaymentService` with a 600-line `process()` method. Product asks for UPI and wallet payments. Every change to `process()` risks breaking card payments, and the tests take minutes to run because the method talks to the real database.

A low-level redesign introduces a `PaymentMethod` interface with `CardPayment`, `UpiPayment` and `WalletPayment` implementations, moves persistence behind a `PaymentRepository` interface, and leaves `PaymentService` as a thin coordinator. New payment methods become new classes; the card code is not touched. That is LLD paying for itself.

## Common mistakes

- **Treating LLD as drawing UML.** Diagrams are a communication tool. The design lives in the responsibilities and the code.
- **Starting with patterns.** "I'll use a Factory and an Observer" before understanding the problem leads to overengineering.
- **Confusing LLD with HLD in interviews.** Talking about load balancers and sharding when asked to design a parking lot wastes your limited time.
- **Anaemic objects.** Classes that are just bags of getters and setters, with all logic in a giant "manager", are procedural code in disguise.

## In the interview

> [!INTERVIEW] What the interviewer is checking
> An LLD round checks whether you can turn vague requirements into a small set of well-named classes with clear responsibilities, then write working code for the core flows — and adapt that code when the requirements change.

Two practical consequences:

1. **Stay at the right zoom level.** If the prompt is "design a parking lot", you are designing classes, not data centres.
2. **Code is part of the answer.** Most companies expect real (or near-real) code for the core methods, not just diagrams. Practise writing Java quickly and cleanly.

## Key takeaways

- LLD designs the **inside** of a component: classes, interfaces, relationships and behaviour. HLD designs the system **around** it.
- The purpose of LLD is code that is **easy to understand and safe to change**.
- Good designs give every rule a single owner, hide internal state, depend on small abstractions and avoid unnecessary complexity.
- In interviews, LLD means clarifying requirements, modelling classes, writing the core code, and handling follow-up changes.

## Knowledge check

```quiz
? Which question is primarily a Low-Level Design concern?
- How many database replicas do we need for 99.99% availability?
- Should the API gateway or the service handle authentication?
+ Which class should own the rule that a parking spot can hold only one vehicle?
- Which CDN should serve static assets?
> LLD is about responsibilities inside a component. Replicas, gateways and CDNs are HLD decisions.

? In the refactored coffee shop, why does `Wallet.pay()` throw instead of letting the caller check the balance first?
- Exceptions are faster than if-statements
+ So the "no overspending" rule is enforced in one place and no caller can bypass it
- Because Java requires methods to throw exceptions
> Keeping the rule inside the object that owns the balance means it is enforced everywhere, not just where someone remembered to check.

? What is the best way to judge a low-level design?
- Fewer lines of code is always better
- It should use as many design patterns as possible
+ How easily and safely it absorbs the likely changes
> Designs are judged by how they handle change and how easy they are to understand, not by size or pattern count.
```

## Exercise

You are given this method from a library application. Identify **at least three responsibilities** it mixes, and propose which class should own each one. No code required — a list of classes and one-line responsibilities is enough.

```java
public void borrow(String memberId, String isbn) {
    Member m = db.findMember(memberId);
    if (m.getBorrowedCount() >= 5) throw new RuntimeException("Limit reached");
    Book b = db.findBook(isbn);
    if (!b.isAvailable()) throw new RuntimeException("Not available");
    b.setAvailable(false);
    m.setBorrowedCount(m.getBorrowedCount() + 1);
    db.save(m); db.save(b);
    emailClient.send(m.getEmail(), "You borrowed " + b.getTitle());
}
```

````hint title="Hint 1 — look for the nouns"
Each rule is about some *thing*: the member's borrowing limit, the book's availability, persistence, and notification. Who naturally owns each piece of state?
````

````hint title="Hint 2 — tell, don't ask"
The method *asks* objects for their data (`getBorrowedCount`, `isAvailable`) and then makes decisions for them. What if it *told* them what to do instead — `member.borrow(copy)`?
````

````solution title="Suggested answer"
Responsibilities mixed together:

1. **Borrowing limit rule** → belongs to `Member` (it owns the count): `member.checkCanBorrow()` or inside `member.borrow(...)`.
2. **Availability rule and state change** → belongs to `BookCopy` (a physical copy, not the abstract book): `copy.checkOut()`.
3. **Persistence** → belongs to repositories (`MemberRepository`, `BookCopyRepository`) behind interfaces.
4. **Notification** → belongs to a `Notifier` interface (email today, SMS tomorrow).
5. **Orchestration** → a thin `LendingService.borrow(memberId, copyId)` that loads objects, calls `member.borrow(copy)`, saves, and notifies.

Bonus: `RuntimeException` hides intent. Domain exceptions like `BorrowLimitExceededException` and `CopyUnavailableException` make the rules explicit (see [Domain Exceptions](lesson:domain-exceptions)).
````

Ready to see how interviews score all of this? Continue to [What LLD Interviews Evaluate](lesson:interview-expectations), or try the [Vending Machine](problem:vending-machine) problem once you finish Stage 1.
