## The principles that keep SOLID honest

SOLID tells you how to make code flexible. Applied without judgement, it produces factories of factories and interfaces with one implementation. These pragmatic principles are the counterweight. Interviewers watch for **both** failure modes: rigid code *and* overengineered code.

## DRY — Don't Repeat Yourself

> *"Every piece of knowledge must have a single, unambiguous, authoritative representation within a system."* — The Pragmatic Programmer

DRY is about **knowledge**, not text. Two identical-looking lines may represent different knowledge; two different-looking pieces of code may encode the same rule.

```java title="❌ The same rule in three places"
// CheckoutController
if (cart.total() > 500) shipping = 0;
// InvoiceService
long shipping = order.total() > 500 ? 0 : 40;
// CartBanner
String msg = cart.total() > 500 ? "Free shipping!" : "Add more for free shipping";
```

When the threshold changes to 999, someone will miss one. Give the rule one home:

```java title="✅ One authoritative representation"
final class ShippingPolicy {
    static final long FREE_SHIPPING_THRESHOLD = 500;
    static final long STANDARD_FEE = 40;

    static boolean qualifiesForFreeShipping(long total) { return total > FREE_SHIPPING_THRESHOLD; }
    static long feeFor(long total) { return qualifiesForFreeShipping(total) ? 0 : STANDARD_FEE; }
}
```

> [!WARNING] Coincidental duplication
> Two pieces of code that *look* the same but change for **different reasons** are not duplication. Merging them couples unrelated concerns, as in the payroll/HR example in [SRP](lesson:single-responsibility). Ask: *"If one changes, must the other change too?"* If not, leave them separate.

## KISS — Keep It Simple

Prefer the simplest design that meets the **current** requirements. Simple doesn't mean naive; it means no unnecessary moving parts.

```java title="❌ Pattern-heavy for a fixed 3-option menu"
interface CoffeeFactory { Coffee create(); }
class EspressoFactory implements CoffeeFactory { ... }
class LatteFactory implements CoffeeFactory { ... }
class CoffeeFactoryRegistry { private final Map<String, CoffeeFactory> factories; ... }
```

```java title="✅ An enum is enough"
enum Coffee {
    ESPRESSO(150), LATTE(220), CAPPUCCINO(200);
    final int price;
    Coffee(int price) { this.price = price; }
}
```

If the menu becomes dynamic (loaded from a database, with recipes), *then* introduce richer types.

## YAGNI — You Aren't Gonna Need It

Don't build features or extension points for requirements you **imagine** might arrive. Speculative generality:

- Costs time now (in an interview, minutes you don't have).
- Usually guesses the future **wrong**, so the abstraction doesn't fit when the real requirement arrives.
- Makes the code harder to read for everyone in the meantime.

YAGNI vs OCP: OCP says make **likely** changes cheap. YAGNI says don't pay for **unlikely** ones. The skill is telling them apart, using the requirements, the domain and the interviewer's hints. A reasonable default: **design seams where the requirements mention variation; implement only what's asked.**

```java title="YAGNI in practice"
// Requirement: "fees are hourly; weekend pricing may come later"
interface PricingStrategy { long fee(Ticket t, Instant exit); }  // GOOD: variation is mentioned -> seam
class HourlyPricing implements PricingStrategy { ... }          // GOOD: the only implementation built today

// Not built: WeekendPricing, HolidayPricing, PricingRuleEngine, DSL parser   <- YAGNI
```

## Separation of Concerns

Different concerns — **domain rules, persistence, presentation, transport, configuration** — should live in different places. It's the architectural cousin of SRP:

```text
Controller / CLI   →   Application service   →   Domain model
(parse input,          (orchestrate a use        (rules, invariants,
 format output)         case, transactions)       state transitions)
                                 ↓
                        Infrastructure (DB, HTTP, queues) behind interfaces
```

In an LLD interview you rarely build every layer, but **not mixing** them — no `System.out.println` or SQL inside `ParkingSpot` — is a visible quality signal. See [Domain vs Infrastructure](lesson:repository-pattern).

## Law of Demeter and "Tell, Don't Ask"

- **Law of Demeter**: a method should only call methods on itself, its fields, its parameters and objects it creates. Avoid `a.getB().getC().doThing()`.
- **Tell, don't ask**: tell objects to do things rather than pulling their data out to make decisions for them.

```java
// BAD: ask
if (account.getBalance() >= amount && !account.isFrozen()) account.setBalance(account.getBalance() - amount);
// GOOD: tell
account.withdraw(amount);
```

Both push behaviour to where the data lives, which raises cohesion and lowers coupling.

## A worked balance

```java title="Simple, but with one justified seam" file="PragmaticDemo.java"
import java.util.List;

public class PragmaticDemo {
    public static void main(String[] args) {
        Cart cart = new Cart(List.of(new Item("Book", 350), new Item("Pen", 200)));
        Checkout checkout = new Checkout(new NoDiscount());
        System.out.println("Total: " + checkout.total(cart));

        Checkout festive = new Checkout(new PercentOff(10));   // the requirement said "festive sales are coming"
        System.out.println("Festive total: " + festive.total(cart));
    }
}

record Item(String name, long price) {}

record Cart(List<Item> items) {
    long subtotal() { return items.stream().mapToLong(Item::price).sum(); }
}

/** One authoritative home for the shipping rule (DRY). */
final class ShippingPolicy {
    private static final long FREE_ABOVE = 500, FEE = 40;
    private ShippingPolicy() {}
    static long feeFor(long subtotal) { return subtotal > FREE_ABOVE ? 0 : FEE; }
}

/** Seam justified by a stated requirement (OCP); only two tiny implementations (YAGNI). */
interface Discount { long apply(long subtotal); }
class NoDiscount implements Discount { public long apply(long subtotal) { return subtotal; } }
class PercentOff implements Discount {
    private final int percent;
    PercentOff(int percent) { this.percent = percent; }
    public long apply(long subtotal) { return subtotal - subtotal * percent / 100; }
}

class Checkout {
    private final Discount discount;
    Checkout(Discount discount) { this.discount = discount; }

    long total(Cart cart) {
        long discounted = discount.apply(cart.subtotal());
        return discounted + ShippingPolicy.feeFor(discounted);   // KISS: a static helper is enough here
    }
}
```

## Real-world example

A startup built a "generic workflow engine" for their first customer's two-step approval process — XML definitions, a plugin system and a visual editor. Six months later the actual second requirement (parallel approvals with deadlines) didn't fit the engine's model, and they rewrote it. An `ApprovalRequest` class with an explicit state machine would have taken two days and adapted easily. See the [Approval Workflow](problem:approval-workflow) problem for a right-sized design.

## Common mistakes

- **DRYing coincidental duplication** into a shared helper that two unrelated features now depend on.
- **Interfaces with one implementation** and no stated variation.
- **"Enterprise" layering** in a 45-minute interview: `ParkingLotServiceFactoryProvider`.
- **Confusing simple with sloppy.** KISS still means private fields, validation and good names.

## In the interview

> [!INTERVIEW] Say the trade-off
> *"I'll keep fee calculation behind a `PricingStrategy` because you mentioned pricing changes; I'm **not** adding abstractions for gates or displays since nothing suggests they'll vary — easy to add later."* Explicitly declining an abstraction shows as much judgement as adding one.

## Key takeaways

- **DRY** is about single sources of *knowledge*; don't merge coincidental duplication.
- **KISS**: the simplest design that meets current requirements.
- **YAGNI**: no speculative features or abstractions; add seams only where variation is stated or very likely.
- **Separation of concerns**, **Law of Demeter** and **tell-don't-ask** keep logic where it belongs.

## Knowledge check

```quiz
? Two methods both compute `price * 18 / 100`: one for GST on invoices, one for a loyalty-points promotion that happens to use 18%. Should you merge them?
- Yes — DRY says never repeat code
+ No — they represent different knowledge that will change independently
- Yes, but make it static
> Coincidental duplication isn't a DRY violation; merging would couple unrelated rules.

? The requirements mention only card payments, and the interviewer says "we may add UPI next quarter". What's the pragmatic design?
+ A PaymentMethod interface with one CardPayment implementation
- A PaymentMethod interface plus Card, UPI, Wallet, Crypto and BNPL implementations
- Hard-code card payments with no seam
> Add the seam where variation is stated; implement only what's needed now.

? Which line violates the Law of Demeter?
- `order.ship()`
+ `order.getCustomer().getWallet().debit(amount)`
- `wallet.debit(amount)` inside Wallet's own methods
> Reaching through several objects couples the caller to the whole chain.
```

## Exercise

Review this design for a **tic-tac-toe** interview answer and list which parts are over-engineered and which are fine. Propose a simplified class list.

> `GameFactory`, `AbstractGame`, `TicTacToeGame extends AbstractGame`, `BoardFactory`, `Board`, `Cell`, `CellState` (enum), `Player` (interface), `HumanPlayer`, `AiPlayer`, `MoveValidatorChain` (Chain of Responsibility with 3 validators), `WinStrategy` (interface) with `RowWin`, `ColumnWin`, `DiagonalWin`, `GameEventBus`, `ConsoleRenderer`.

````hint title="Hint"
Which of these were requested? Which vary? Which could be a method instead of a class?
````

````solution title="Sample review"
**Over-engineered (unless the interviewer asked):** `GameFactory`, `BoardFactory` and `AbstractGame` (one game type), `MoveValidatorChain` (three `if` checks in `Board.place()`), the `WinStrategy` hierarchy (one O(1) counter-based check), `GameEventBus`.

**Reasonable:** `Board`, `CellState` or `Symbol` enum, `Player` (an interface is justified *if* AI players are in scope), `HumanPlayer`, `Game` (turn order and status), a `Move` record, and an optional renderer kept separate from game logic.

**Simplified:** `Game`, `Board`, `Player` (+ `HumanPlayer`, `AiPlayer` if requested), `Move`, `Symbol`, `GameStatus`. Mention the removed abstractions as easy follow-ups. Full solution: [Tic-Tac-Toe](problem:tic-tac-toe).
````
