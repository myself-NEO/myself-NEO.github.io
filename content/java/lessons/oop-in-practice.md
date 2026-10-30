## Concept explanation

### What it is

This lesson designs one small system — **subscription billing** for a SaaS product — and shows how the OOP ideas from this stage reinforce each other. Requirements:

1. A customer subscribes to a **plan** (Basic, Pro, Enterprise), each with a monthly price and a set of features.
2. A subscription can be **upgraded**, **paused**, **resumed** and **cancelled**, but only through legal transitions.
3. Each month the subscription produces an **invoice**; **discounts** vary (none, a percentage, first month free) and new kinds will be added.
4. Money must never be negative, and invoices must never change once issued.

### Which concept solves which problem

| Requirement | Concept | Design element |
|---|---|---|
| Fixed set of plans with data and features | **enum** with fields, `EnumSet` | `Plan`, `Feature` |
| Fixed set of states with rules | **enum** state machine | `Status.canMoveTo` |
| Money can't be invalid; invoices can't change | **immutability**, value objects, **records** | `Money`, `Invoice` |
| Only legal operations change a subscription | **encapsulation** | private fields, intention-revealing methods |
| Discount rules vary and grow | **abstraction + polymorphism** | `DiscountPolicy` interface, several implementations |
| Subscription *has* a policy, swappable | **composition** (strategy) over inheritance | `Subscription` holds a `DiscountPolicy` |
| Identity of a subscription matters, of money doesn't | **equals/hashCode** only on value objects | records for values, default identity for the entity |

### Why it matters

Each concept alone is easy; interviews and real code test whether you **combine them deliberately**. A good design reads like the requirements: `subscription.upgrade(Plan.PRO)`, `subscription.invoiceFor(month)`, `new PercentOff(20)`. The common smells this avoids:

- **Anemic model**: a `Subscription` with public getters/setters and all rules in a `SubscriptionService` full of `if` statements.
- **Primitive obsession**: `long amount` and `String currency` passed around separately, `String status = "ACTIVE"`.
- **Switch on type**: `if (discountType.equals("PERCENT")) … else if …` repeated wherever discounts are applied.
- **Inheritance for variation**: `class DiscountedSubscription extends Subscription` — which breaks the moment a subscription needs a different discount next month.

### When to apply this thinking

Every LLD interview and most service code: identify **values** (immutable, records), **entities** (identity, encapsulated lifecycle), **closed sets** (enums), and **variation points** (interfaces + composition).

## Internal working

How the pieces behave at run time:

- **Enums** `Plan` and `Status` are created once, during class initialisation; comparing with `==` is a pointer comparison. `EnumSet<Feature>` is a single `long` bit mask, so `plan.includes(Feature.SSO)` is one bitwise AND.
- **Records** `Money` and `Invoice` are final classes with final fields; their compact constructors validate before any instance can exist, and the generated `equals`/`hashCode` make them good map keys.
- **`DiscountPolicy.apply(...)`** is an interface call (`invokeinterface`). Each `Subscription` holds one policy; at a busy call site the JIT sees one or two implementations and inlines them.
- **`Subscription`** is a mutable entity: its fields are private and only its methods change them, so the state machine's rules can't be bypassed. It uses `Object`'s identity `equals` — two subscriptions with the same plan are still different subscriptions.
- **Invoices** are added to a private list and exposed as `List.copyOf(...)`, so callers can't rewrite billing history.

## Visual representation

```uml title="Subscription billing: class diagram"
enum Plan
  BASIC
  PRO
  ENTERPRISE
  - monthly: Money
  - features: EnumSet<Feature>
  + includes(f: Feature): boolean
enum Status
  ACTIVE
  PAUSED
  CANCELLED
  + canMoveTo(next: Status): boolean
record Money
  - cents: long
  - currency: String
  + plus(other: Money): Money
  + percent(p: int): Money
interface DiscountPolicy
  + apply(price: Money, cycle: int): Money
class PercentOff
  - pct: int
class FirstMonthFree
class Subscription
  - id: String
  - plan: Plan
  - status: Status
  - discount: DiscountPolicy
  - invoices: List<Invoice>
  + upgrade(to: Plan): void
  + pause(): void
  + cancel(): void
  + invoiceFor(cycle: int): Invoice
record Invoice
  - subscriptionId: String
  - cycle: int
  - amount: Money
PercentOff ..|> DiscountPolicy
FirstMonthFree ..|> DiscountPolicy
Subscription --> Plan : on
Subscription --> Status : state
Subscription o-- DiscountPolicy : strategy
Subscription *-- "0..*" Invoice : issues
```

## Java code example

```java title="BillingDemo.java" file="BillingDemo.java"
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

public class BillingDemo {
    public static void main(String[] args) {
        Subscription sub = new Subscription("SUB-1", Plan.BASIC, new FirstMonthFree());
        System.out.println(sub.invoiceFor(1));                       // first month free
        System.out.println(sub.invoiceFor(2));

        sub.upgrade(Plan.PRO);
        sub.changeDiscount(new PercentOff(20));                     // composition: swap the strategy
        System.out.println(sub.invoiceFor(3));
        System.out.println("PRO includes SSO? " + Plan.PRO.includes(Feature.SSO)
                + ", ENTERPRISE includes SSO? " + Plan.ENTERPRISE.includes(Feature.SSO));

        sub.pause();
        try {
            sub.invoiceFor(4);
        } catch (IllegalStateException e) {
            System.out.println("rejected: " + e.getMessage());
        }
        try {
            sub.upgrade(Plan.BASIC);
        } catch (IllegalStateException | IllegalArgumentException e) {   // state rule or downgrade rule
            System.out.println("rejected: " + e.getMessage());
        }
        sub.resume();
        sub.cancel();
        try {
            sub.resume();
        } catch (IllegalStateException e) {
            System.out.println("rejected: " + e.getMessage());
        }

        List<Invoice> history = sub.invoices();
        System.out.println("billed " + history.size() + " invoices, total " + total(history));
        try {
            history.clear();
        } catch (UnsupportedOperationException e) {
            System.out.println("invoice history is read-only");
        }
        try {
            new Money(-5, "EUR");
        } catch (IllegalArgumentException e) {
            System.out.println("rejected: " + e.getMessage());
        }
    }

    static Money total(List<Invoice> invoices) {
        Money sum = Money.zero("EUR");
        for (Invoice i : invoices) {
            sum = sum.plus(i.amount());
        }
        return sum;
    }
}

// ---- Value objects: immutable, validated, equality by value ----
record Money(long cents, String currency) {
    Money {
        if (cents < 0) {
            throw new IllegalArgumentException("money can't be negative: " + cents);
        }
        Objects.requireNonNull(currency);
    }

    static Money zero(String currency) {
        return new Money(0, currency);
    }

    Money plus(Money other) {
        if (!currency.equals(other.currency)) {
            throw new IllegalArgumentException("currency mismatch");
        }
        return new Money(cents + other.cents, currency);
    }

    Money percent(int pct) {
        return new Money(cents * pct / 100, currency);
    }

    @Override
    public String toString() {
        return String.format("%d.%02d %s", cents / 100, cents % 100, currency);
    }
}

record Invoice(String subscriptionId, int cycle, Plan plan, Money amount) {
    @Override
    public String toString() {
        return "Invoice{" + subscriptionId + " #" + cycle + " " + plan + " " + amount + "}";
    }
}

// ---- Closed sets: enums with data and rules ----
enum Feature { REPORTS, API, SSO, AUDIT_LOG }

enum Plan {
    BASIC(new Money(1_000, "EUR"), EnumSet.of(Feature.REPORTS)),
    PRO(new Money(3_000, "EUR"), EnumSet.of(Feature.REPORTS, Feature.API)),
    ENTERPRISE(new Money(9_000, "EUR"), EnumSet.allOf(Feature.class));

    private final Money monthly;
    private final Set<Feature> features;

    Plan(Money monthly, Set<Feature> features) {
        this.monthly = monthly;
        this.features = features;
    }

    Money monthly() {
        return monthly;
    }

    boolean includes(Feature f) {
        return features.contains(f);
    }
}

enum Status {
    ACTIVE, PAUSED, CANCELLED;

    boolean canMoveTo(Status next) {
        switch (this) {
            case ACTIVE:
                return next == PAUSED || next == CANCELLED;
            case PAUSED:
                return next == ACTIVE || next == CANCELLED;
            default:
                return false;
        }
    }
}

// ---- Variation point: abstraction + polymorphism ----
interface DiscountPolicy {
    Money apply(Money price, int cycle);
}

final class NoDiscount implements DiscountPolicy {
    @Override
    public Money apply(Money price, int cycle) {
        return price;
    }
}

final class PercentOff implements DiscountPolicy {
    private final int pct;

    PercentOff(int pct) {
        if (pct < 0 || pct > 100) {
            throw new IllegalArgumentException("pct must be 0..100");
        }
        this.pct = pct;
    }

    @Override
    public Money apply(Money price, int cycle) {
        return price.percent(100 - pct);
    }
}

final class FirstMonthFree implements DiscountPolicy {
    @Override
    public Money apply(Money price, int cycle) {
        return cycle == 1 ? Money.zero(price.currency()) : price;
    }
}

// ---- Entity: identity + encapsulated lifecycle; composed with a policy ----
final class Subscription {
    private final String id;
    private Plan plan;
    private Status status = Status.ACTIVE;
    private DiscountPolicy discount;
    private final List<Invoice> invoices = new ArrayList<>();

    Subscription(String id, Plan plan, DiscountPolicy discount) {
        this.id = Objects.requireNonNull(id);
        this.plan = Objects.requireNonNull(plan);
        this.discount = discount == null ? new NoDiscount() : discount;
    }

    void upgrade(Plan to) {
        requireStatus(Status.ACTIVE, "upgrade");
        if (to.compareTo(plan) <= 0) {
            throw new IllegalArgumentException("can only upgrade from " + plan + ", not to " + to);
        }
        plan = to;
    }

    void changeDiscount(DiscountPolicy policy) {
        discount = Objects.requireNonNull(policy);
    }

    void pause() {
        moveTo(Status.PAUSED);
    }

    void resume() {
        moveTo(Status.ACTIVE);
    }

    void cancel() {
        moveTo(Status.CANCELLED);
    }

    Invoice invoiceFor(int cycle) {
        requireStatus(Status.ACTIVE, "invoice");
        Invoice invoice = new Invoice(id, cycle, plan, discount.apply(plan.monthly(), cycle));
        invoices.add(invoice);
        return invoice;
    }

    List<Invoice> invoices() {
        return List.copyOf(invoices);
    }

    private void moveTo(Status next) {
        if (!status.canMoveTo(next)) {
            throw new IllegalStateException("cannot move " + id + " from " + status + " to " + next);
        }
        status = next;
    }

    private void requireStatus(Status required, String action) {
        if (status != required) {
            throw new IllegalStateException("cannot " + action + " while " + status);
        }
    }
}
```

## Output

```text title="Output" output="BillingDemo.java"
Invoice{SUB-1 #1 BASIC 0.00 EUR}
Invoice{SUB-1 #2 BASIC 10.00 EUR}
Invoice{SUB-1 #3 PRO 24.00 EUR}
PRO includes SSO? false, ENTERPRISE includes SSO? true
rejected: cannot invoice while PAUSED
rejected: cannot upgrade while PAUSED
rejected: cannot move SUB-1 from CANCELLED to ACTIVE
billed 3 invoices, total 34.00 EUR
invoice history is read-only
rejected: money can't be negative: -5
```

Trace the design decisions in the output:

- Month 1 was free and month 3 was 20 % off — **different `DiscountPolicy` objects**, swapped at run time, with no `if` on discount types anywhere.
- Upgrading while paused and invoicing while paused were refused by the **entity's own rules**; the illegal `CANCELLED → ACTIVE` transition by the **enum state machine**.
- Feature checks used the **enum's data** (`EnumSet`).
- The history couldn't be modified and negative money couldn't be created — **immutability and validation** at construction.

## Real-world application

- This structure — **value objects, entities with lifecycles, enums for closed sets, interfaces for variation** — is how billing, ordering, booking and workflow services are modelled in practice (and the essence of domain-driven design's tactical patterns).
- It's also what LLD interviewers look for in problems like parking lots, vending machines and payment workflows — see the [System Design practice problems](#system-design/lld/problems).
- Frameworks fit around it: JPA maps the entity, Jackson serialises records, Spring injects `DiscountPolicy` implementations.

## Common mistakes

- **Anemic entities** with setters and logic in services.
- **Primitive obsession** (`long amount, String currency` everywhere instead of `Money`).
- **Strings for states** (`"ACTIVE"`), allowing typos and illegal transitions.
- **Inheritance for variation** (`DiscountedSubscription extends Subscription`).
- **Exposing mutable collections** (invoice history).
- **Over-engineering**: an interface plus a factory plus a builder for something that has one implementation and no expected variation.
- **Value equality on entities** (two subscriptions with the same fields aren't the same subscription).

## Interview questions

**Q1. How do you decide between an enum and an interface with implementations for a varying behaviour?**

````reveal title="Answer"
If the set of variants is **closed and known at compile time**, and each carries a little data or behaviour, an enum (with constant-specific methods) is compact and exhaustive. If variants are **open-ended**, have their own state or dependencies, come from configuration or plug-ins, or are added by other teams, use an interface with implementations (strategy). Discount policies above are an interface because new kinds keep appearing and some have parameters; plans are an enum because the set is fixed.
````

**Q2. Which objects should override `equals`/`hashCode` in this design and why?**

````reveal title="Answer"
The value objects — `Money` and `Invoice` (records generate them) — because two equal amounts or invoices are interchangeable. `Subscription` is an entity whose identity matters: two subscriptions with the same plan and status are still distinct, so it keeps `Object`'s identity semantics (or equality on its id only, if needed for persistence).
````

**Q3. Why not `class DiscountedSubscription extends Subscription`?**

````reveal title="Answer"
Inheritance would fix the discount at construction and multiply classes for every combination (discounted + trial + annual …). A subscription's discount changes over time; composition lets one `Subscription` object hold whichever `DiscountPolicy` currently applies, and new policies don't touch `Subscription` at all (open–closed principle).
````

**Q4. What makes `Subscription` well encapsulated?**

````reveal title="Answer"
Its state is private; the only ways to change it are intention-revealing methods (`upgrade`, `pause`, `cancel`, `invoiceFor`) that check the state machine and business rules; it validates inputs; it never exposes its mutable invoice list; and illegal transitions are impossible from outside. Callers can't put it in an invalid state.
````

## Hands-on exercise

Extend the billing design without modifying `Subscription`'s existing methods:

1. Add a `LoyaltyDiscount` policy: 5 % off per full year subscribed (cycle 13+ gets 5 %, 25+ gets 10 %), capped at 15 %.
2. Add an `ANNUAL` billing option as a **new `DiscountPolicy`** that bills 12 months at 85 % on cycle 1, 13, 25… and **zero** in between.
3. Show invoices for cycles 1, 2, 13 and 25 with each policy on a PRO plan.

````hint title="Hint"
Both are new classes implementing `DiscountPolicy` — that's the point: the variation point absorbs new requirements. For loyalty: `int years = (cycle - 1) / 12; pct = Math.min(15, years * 5)`. For annual: `(cycle - 1) % 12 == 0 ? price × 12 × 85 % : zero`.
````

````solution title="Solution"
```java title="LoyaltyDemo.java" file="LoyaltyDemo.java"
public class LoyaltyDemo {
    public static void main(String[] args) {
        long monthly = 3_000;                                    // PRO plan in cents
        DiscountRule loyalty = new LoyaltyDiscount();
        DiscountRule annual = new AnnualBilling();
        for (int cycle : new int[] {1, 2, 13, 25}) {
            System.out.printf("cycle %2d  loyalty=%5d  annual=%6d%n",
                    cycle, loyalty.apply(monthly, cycle), annual.apply(monthly, cycle));
        }
    }
}

/** Same shape as DiscountPolicy, using cents to keep the exercise self-contained. */
interface DiscountRule {
    long apply(long priceCents, int cycle);
}

final class LoyaltyDiscount implements DiscountRule {
    @Override
    public long apply(long priceCents, int cycle) {
        int years = (cycle - 1) / 12;
        int pct = Math.min(15, years * 5);
        return priceCents * (100 - pct) / 100;
    }
}

final class AnnualBilling implements DiscountRule {
    @Override
    public long apply(long priceCents, int cycle) {
        boolean billingMonth = (cycle - 1) % 12 == 0;
        return billingMonth ? priceCents * 12 * 85 / 100 : 0;
    }
}
```

```text title="Output" output="LoyaltyDemo.java"
cycle  1  loyalty= 3000  annual= 30600
cycle  2  loyalty= 3000  annual=     0
cycle 13  loyalty= 2850  annual= 30600
cycle 25  loyalty= 2700  annual= 30600
```

Neither requirement needed a change to existing classes — new behaviour arrived as new implementations of the abstraction.
````

## Knowledge check

```quiz
? Which element should be an enum in a billing system?
+ The fixed set of subscription statuses
- Discount rules that marketing adds every quarter
- Customer records
> Closed, compile-time sets fit enums; open-ended variation fits interfaces or data.

? Why is Money a record (value object) rather than two fields on Subscription?
+ It bundles amount and currency, validates once, is immutable and compares by value
- Records are faster than longs
- Subscription can't have long fields
> Avoids primitive obsession and invalid money.

? How does the design add a new discount type?
+ A new class implementing DiscountPolicy; Subscription doesn't change
- A new case in a switch inside Subscription
- A new subclass of Subscription
> The interface is the variation point (open-closed).

? Should two Subscription objects with the same plan, status and discount be equal?
- Yes, override equals on all fields
+ No, a subscription is an entity whose identity matters
> Value equality is for value objects.
```

## Key takeaways

- Identify **values** (immutable records), **entities** (encapsulated lifecycle, identity), **closed sets** (enums) and **variation points** (interfaces + composition).
- Put rules **inside** the objects that own the data; expose intention-revealing operations.
- Use **polymorphism through composition** for behaviour that varies over time.
- Avoid the classic smells: anemic models, primitive obsession, string states, switch-on-type, inheritance for variation.
- Good OOP design reads like the requirements — and absorbs new requirements by **adding** classes, not editing them.
