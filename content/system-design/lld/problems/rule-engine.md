## Problem statement

Design a small rule engine for an e-commerce checkout. Business teams want to express rules like *"Gold customers with a basket of 5000 or more get 15% off"* or *"Flag cash-on-delivery orders above 20,000 for manual review"*, add and change them without touching the checkout code, and see **why** a rule fired. Rules are evaluated against a "fact" (the order). Some rule sets pick one winner (discounts); others collect every match (fraud flags).

> [!TIP] Try it first
> A condition like `tier = GOLD AND (total >= 5000 OR items >= 10)` is a tree. What's the smallest set of building blocks that can express any such tree — and describe itself in plain words?

## Clarifying questions

1. What are the facts? One type (orders) or anything?
2. How are conditions combined — AND, OR, NOT, nesting?
3. When several rules match, what happens? Priority? All of them? The best one for the customer?
4. Can rules be added or replaced while the system is running?
5. Do we need an explanation of why a rule fired?
6. What if one rule is broken (throws)?

````reveal title="Answers we'll assume"
- The engine is **generic over the fact type**; the example uses `Order`.
- Conditions combine with **AND / OR / NOT** to any depth.
- Each rule set has a **firing policy**: first match by priority, all matches, or the best match by a domain measure (largest saving for discounts).
- Rules can be **added, replaced (same name) and removed at runtime**; evaluations in flight are unaffected.
- Every fired rule carries a **human-readable explanation** of its condition.
- A rule that throws is **skipped and reported**; the others still run.
````

## Requirements

**Functional**

1. Build conditions from named leaf predicates with `and`, `or`, `not`.
2. Define rules with a name, priority, condition and outcome (discount, flat amount off, flag).
3. Evaluate a rule set against a fact using its firing policy; return fired rules with explanations, plus errors.
4. Add, replace and remove rules at runtime.

**Non-functional**

5. New condition types, outcomes and policies without changing the engine ([open/closed](lesson:open-closed)).
6. Thread-safe: many evaluations in parallel with occasional rule changes.

## Step 1 — Conditions as composable specifications

````reveal title="Specification + Composite"
A **specification** is an object that answers `isSatisfiedBy(fact)` and can `describe()` itself. Leaves wrap a predicate and a description (`total >= 5000`). Composites combine other specifications: `AndSpec`, `OrSpec`, `NotSpec`. Because composites are specifications too, they nest to any depth.

```text
AndSpec
+- Leaf "tier = GOLD"
+- OrSpec
   +- Leaf "total >= 5000"
   +- Leaf "items >= 10"

describe() -> "(tier = GOLD AND (total >= 5000 OR items >= 10))"
```

Default methods `and`, `or`, `not` on the interface give a fluent way to build these trees.
````

## Step 2 — Class design

```uml title="Rule engine"
interface Spec<T>
  + isSatisfiedBy(fact: T): boolean
  + describe(): String
  + and(other: Spec<T>): Spec<T>
  + or(other: Spec<T>): Spec<T>
  + not(): Spec<T>
record LeafSpec<T>
  + describe: String
  + test: Predicate<T>
record AndSpec<T>
  + parts: List<Spec<T>>
record OrSpec<T>
  + parts: List<Spec<T>>
record NotSpec<T>
  + inner: Spec<T>
record Rule<T>
  + name: String
  + priority: int
  + condition: Spec<T>
  + action: Function<T, Outcome>
class RuleBook<T>
  - rules: List<Rule<T>>
  - policy: FiringPolicy<T>
  + add(rule: Rule<T>): void
  + remove(name: String): boolean
  + evaluate(fact: T): Evaluation
interface FiringPolicy<T>
  + select(matches: List<Fired>, fact: T): List<Fired>
interface Outcome
record PercentOff
record FlatOff
record Flag
LeafSpec ..|> Spec
AndSpec ..|> Spec
OrSpec ..|> Spec
NotSpec ..|> Spec
AndSpec o-- "2..*" Spec
OrSpec o-- "2..*" Spec
NotSpec o-- "1" Spec
RuleBook o-- "0..*" Rule
RuleBook --> FiringPolicy
Rule --> Spec
PercentOff ..|> Outcome
FlatOff ..|> Outcome
Flag ..|> Outcome
```

## Step 3 — Implementation

````hint title="Hint — evaluate, then resolve"
Separate two steps: (1) find every rule whose condition matches (in priority order), (2) let the **firing policy** choose which matches count. "First match", "all matches" and "best saving" are then three tiny strategies over the same list.
````

````solution title="Complete Java solution"
```java title="RuleEngineDemo.java" file="RuleEngineDemo.java"
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.function.ToLongFunction;
import java.util.stream.Collectors;

public class RuleEngineDemo {
    public static void main(String[] args) {
        RuleBook<Order> discounts = new RuleBook<>(FiringPolicy.bestBy(f -> Pricing.saving(f.outcome(), f.fact())));
        discounts.add(Rule.named("gold-big-basket").priority(10)
                .when(OrderSpecs.tierIs(Tier.GOLD).and(OrderSpecs.totalAtLeast(5_000))).then(new PercentOff(15)));
        discounts.add(Rule.named("first-order").priority(20).when(OrderSpecs.firstOrder()).then(new FlatOff(200)));
        discounts.add(Rule.named("bulk").priority(30)
                .when(OrderSpecs.itemsAtLeast(10).or(OrderSpecs.totalAtLeast(10_000))).then(new PercentOff(5)));

        RuleBook<Order> fraud = new RuleBook<>(FiringPolicy.allMatches());
        fraud.add(Rule.named("high-value-cod").when(OrderSpecs.paidWith("COD").and(OrderSpecs.totalAtLeast(20_000))).then(new Flag("manual review")));
        fraud.add(Rule.named("new-account-big-order").when(OrderSpecs.firstOrder().and(OrderSpecs.totalAtLeast(15_000))).then(new Flag("verify phone")));
        fraud.add(Rule.named("ships-abroad").when(OrderSpecs.shipsTo("IN").not()).then(o -> new Flag("export check for " + o.country())));

        List<Order> orders = List.of(
                new Order("A", Tier.GOLD, 6_000, 3, "IN", false, "CARD"),
                new Order("B", Tier.SILVER, 25_000, 12, "IN", true, "COD"),
                new Order("C", Tier.SILVER, 800, 1, "US", false, "CARD"));
        orders.forEach(o -> report(o, discounts, fraud));

        discounts.add(Rule.named("silver-loyalty").priority(5).when(OrderSpecs.tierIs(Tier.SILVER)).then(new PercentOff(3)));
        discounts.add(Rule.named("coupon-vip").priority(1).when(Spec.<Order>of("coupon starts with VIP", o -> {
            throw new IllegalStateException("coupon service down");
        })).then(new PercentOff(50)));
        System.out.println("-- after adding silver-loyalty and a broken coupon rule --");
        report(orders.get(2), discounts, fraud);
    }

    static void report(Order o, RuleBook<Order> discounts, RuleBook<Order> fraud) {
        Evaluation d = discounts.evaluate(o);
        String discount = d.fired().isEmpty() ? "no discount" : d.fired().stream()
                .map(f -> f.rule() + " (" + f.outcome() + ") because " + f.because()).collect(Collectors.joining(", "));
        long pay = o.total() - d.fired().stream().mapToLong(f -> Pricing.saving(f.outcome(), o)).sum();
        System.out.println(o.id() + ": " + discount + " -> pay " + pay);
        System.out.println("   flags " + fraud.evaluate(o).fired().stream().map(f -> f.rule() + ": " + f.outcome()).toList()
                + (d.errors().isEmpty() ? "" : ", rule errors " + d.errors()));
    }
}

// ---------- Facts (example domain) ----------

enum Tier { BRONZE, SILVER, GOLD }

record Order(String id, Tier tier, long total, int items, String country, boolean firstOrder, String payment) {}

final class OrderSpecs {
    private OrderSpecs() { }
    static Spec<Order> tierIs(Tier t) { return Spec.of("tier = " + t, o -> o.tier() == t); }
    static Spec<Order> totalAtLeast(long amount) { return Spec.of("total >= " + amount, o -> o.total() >= amount); }
    static Spec<Order> itemsAtLeast(int n) { return Spec.of("items >= " + n, o -> o.items() >= n); }
    static Spec<Order> firstOrder() { return Spec.of("first order", Order::firstOrder); }
    static Spec<Order> paidWith(String method) { return Spec.of("payment = " + method, o -> o.payment().equals(method)); }
    static Spec<Order> shipsTo(String country) { return Spec.of("ships to " + country, o -> o.country().equals(country)); }
}

// ---------- Specifications (composite) ----------

interface Spec<T> {
    boolean isSatisfiedBy(T fact);
    String describe();

    default Spec<T> and(Spec<T> other) { return new AndSpec<>(List.of(this, other)); }
    default Spec<T> or(Spec<T> other) { return new OrSpec<>(List.of(this, other)); }
    default Spec<T> not() { return new NotSpec<>(this); }

    static <T> Spec<T> of(String description, Predicate<T> test) { return new LeafSpec<>(description, test); }
}

record LeafSpec<T>(String describe, Predicate<T> test) implements Spec<T> {
    public boolean isSatisfiedBy(T fact) { return test.test(fact); }
}

record AndSpec<T>(List<Spec<T>> parts) implements Spec<T> {
    public boolean isSatisfiedBy(T fact) { return parts.stream().allMatch(p -> p.isSatisfiedBy(fact)); }
    public String describe() { return parts.stream().map(Spec::describe).collect(Collectors.joining(" AND ", "(", ")")); }
}

record OrSpec<T>(List<Spec<T>> parts) implements Spec<T> {
    public boolean isSatisfiedBy(T fact) { return parts.stream().anyMatch(p -> p.isSatisfiedBy(fact)); }
    public String describe() { return parts.stream().map(Spec::describe).collect(Collectors.joining(" OR ", "(", ")")); }
}

record NotSpec<T>(Spec<T> inner) implements Spec<T> {
    public boolean isSatisfiedBy(T fact) { return !inner.isSatisfiedBy(fact); }
    public String describe() { return "NOT " + inner.describe(); }
}

// ---------- Outcomes ----------

sealed interface Outcome permits PercentOff, FlatOff, Flag {}

record PercentOff(int percent) implements Outcome {
    @Override public String toString() { return percent + "% off"; }
}

record FlatOff(long amount) implements Outcome {
    @Override public String toString() { return amount + " off"; }
}

record Flag(String reason) implements Outcome {
    @Override public String toString() { return reason; }
}

final class Pricing {
    private Pricing() { }

    static long saving(Outcome outcome, Order o) {
        if (outcome instanceof PercentOff p) return o.total() * p.percent() / 100;
        if (outcome instanceof FlatOff f) return Math.min(f.amount(), o.total());
        return 0;
    }
}

// ---------- Rules ----------

record Rule<T>(String name, int priority, Spec<T> condition, Function<T, Outcome> action) {
    static Draft named(String name) { return new Draft(name, 100); }

    /** Fluent builder: named(..).priority(..).when(..).then(..). The fact type is inferred at when(). */
    record Draft(String name, int priority) {
        Draft priority(int p) { return new Draft(name, p); }
        <T> Conditioned<T> when(Spec<T> condition) { return new Conditioned<>(name, priority, condition); }
    }

    record Conditioned<T>(String name, int priority, Spec<T> condition) {
        Rule<T> then(Outcome outcome) { return new Rule<>(name, priority, condition, fact -> outcome); }
        Rule<T> then(Function<T, Outcome> action) { return new Rule<>(name, priority, condition, action); }
    }
}

record Fired(String rule, Outcome outcome, String because) {}

record Evaluation(List<Fired> fired, List<String> errors) {}

@FunctionalInterface
interface FiringPolicy<T> {
    /** Chooses which of the matching rules (already in priority order) take effect. */
    List<Fired> select(List<Fired> matches, T fact);

    static <T> FiringPolicy<T> firstMatch() { return (m, f) -> m.isEmpty() ? List.of() : List.of(m.get(0)); }
    static <T> FiringPolicy<T> allMatches() { return (m, f) -> m; }

    /** The single match that scores highest; a later rule replaces the best only if strictly better, so ties keep priority. */
    static <T> FiringPolicy<T> bestBy(ToLongFunction<FiredFact<T>> score) {
        return (m, f) -> m.stream()
                .reduce((best, x) -> score.applyAsLong(new FiredFact<>(x.outcome(), f)) > score.applyAsLong(new FiredFact<>(best.outcome(), f)) ? x : best)
                .map(List::of).orElse(List.of());
    }

    record FiredFact<T>(Outcome outcome, T fact) {}
}

final class RuleBook<T> {
    private final FiringPolicy<T> policy;
    private volatile List<Rule<T>> rules = List.of();              // immutable snapshot, sorted by priority

    RuleBook(FiringPolicy<T> policy) { this.policy = policy; }

    /** Adds or replaces (same name). Copy-on-write: running evaluations keep their snapshot. */
    synchronized void add(Rule<T> rule) {
        List<Rule<T>> next = new ArrayList<>(rules);
        next.removeIf(r -> r.name().equals(rule.name()));
        next.add(rule);
        next.sort(Comparator.comparingInt((Rule<T> r) -> r.priority()).thenComparing(Rule::name));
        rules = List.copyOf(next);
    }

    synchronized boolean remove(String name) {
        List<Rule<T>> next = new ArrayList<>(rules);
        boolean removed = next.removeIf(r -> r.name().equals(name));
        rules = List.copyOf(next);
        return removed;
    }

    Evaluation evaluate(T fact) {
        List<Fired> matches = new ArrayList<>();
        List<String> errors = new ArrayList<>();
        for (Rule<T> r : rules) {                                    // one volatile read: a consistent rule set
            try {
                if (r.condition().isSatisfiedBy(fact)) matches.add(new Fired(r.name(), r.action().apply(fact), r.condition().describe()));
            } catch (RuntimeException e) {
                errors.add(r.name() + ": " + e.getMessage());        // a broken rule must not break checkout
            }
        }
        return new Evaluation(policy.select(matches, fact), errors);
    }
}
```
````

## Design decisions

- **Specification pattern for conditions.** Each condition is an object with `isSatisfiedBy` and `describe`, so rules are data that can be built, combined, logged and explained — not `if` statements scattered through checkout code (see [Specification](lesson:specification)).
- **Composite for nesting.** `AndSpec`, `OrSpec` and `NotSpec` hold other specs; arbitrarily deep conditions need no extra code, and `describe()` recurses to produce the explanation (see [Composite](lesson:composite)).
- **Firing policy as a strategy.** The engine always finds all matches in priority order; `firstMatch`, `allMatches` and `bestBy(saving)` decide what counts. Discounts use "best for the customer", fraud uses "all" (see [Strategy](lesson:strategy)).
- **A fluent, typed builder.** `Rule.named(..).priority(..).when(..).then(..)` reads like the business sentence; the fact type is inferred from the condition, so no type witnesses are needed (see [Extensible APIs](lesson:extensible-apis)).
- **Sealed outcomes.** `PercentOff`, `FlatOff`, `Flag` are records in a sealed hierarchy; adding a new outcome type is a deliberate change that the compiler helps you follow through.
- **Isolation of broken rules.** Exceptions from a rule are caught per rule and reported; one bad rule can't take down checkout.

## Patterns and principles

[Specification](lesson:specification) (`Spec`), [Composite](lesson:composite) (`AndSpec`, `OrSpec`, `NotSpec`), [Strategy](lesson:strategy) (`FiringPolicy`), fluent builders for an [extensible API](lesson:extensible-apis), and [open/closed](lesson:open-closed): new leaves, outcomes and policies without touching `RuleBook`.

## Example execution flow

```text
Order A (GOLD, 6000, 3 items, CARD, IN)
  discounts: gold-big-basket matches ((tier = GOLD AND total >= 5000)); bulk doesn't
             bestBy(saving): 15% of 6000 = 900 -> pay 5100
  fraud:     nothing
Order B (SILVER, 25000, 12 items, COD, first order)
  discounts: first-order (200) and bulk (5% = 1250) match -> best saving: bulk -> pay 23750
  fraud:     all matches: high-value-cod, new-account-big-order
Order C (SILVER, 800, US)       no discount; fraud: ships-abroad (NOT ships to IN)
add silver-loyalty (3%) and a rule that throws
Order C again                   coupon-vip throws -> recorded in errors; silver-loyalty fires -> pay 776
```

```text title="Program output"
A: gold-big-basket (15% off) because (tier = GOLD AND total >= 5000) -> pay 5100
   flags []
B: bulk (5% off) because (items >= 10 OR total >= 10000) -> pay 23750
   flags [high-value-cod: manual review, new-account-big-order: verify phone]
C: no discount -> pay 800
   flags [ships-abroad: export check for US]
-- after adding silver-loyalty and a broken coupon rule --
C: silver-loyalty (3% off) because tier = SILVER -> pay 776
   flags [ships-abroad: export check for US], rule errors [coupon-vip: coupon service down]
```

## Edge cases

- **No rule matches** → empty result; checkout proceeds at full price.
- **Two discounts with equal saving** → the higher-priority rule wins (stable tie-break).
- **Adding a rule with an existing name** → it replaces the old one.
- **A rule throws** → skipped, reported in `errors`, other rules still evaluated.
- **Flat discount larger than the order** → capped at the order total.
- **Rule changes during evaluation** → the running evaluation keeps the snapshot it started with.

## Tests

```java title="RuleEngineTest.java" file="RuleEngineTest.java" test="RuleEngineDemo.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class RuleEngineTest {
    private final Order gold = new Order("g", Tier.GOLD, 6_000, 2, "IN", false, "CARD");
    private final Order silver = new Order("s", Tier.SILVER, 12_000, 1, "IN", true, "COD");

    @Test
    void compositeSpecsEvaluateAndDescribeThemselves() {
        Spec<Order> spec = OrderSpecs.tierIs(Tier.GOLD).and(OrderSpecs.totalAtLeast(5_000).or(OrderSpecs.itemsAtLeast(10))).and(OrderSpecs.firstOrder().not());
        assertTrue(spec.isSatisfiedBy(gold));
        assertFalse(spec.isSatisfiedBy(silver));
        assertEquals("((tier = GOLD AND (total >= 5000 OR items >= 10)) AND NOT first order)", spec.describe());
    }

    @Test
    void firstMatchFollowsPriority() {
        RuleBook<Order> book = new RuleBook<>(FiringPolicy.firstMatch());
        book.add(Rule.named("low").priority(50).when(OrderSpecs.totalAtLeast(1)).then(new PercentOff(1)));
        book.add(Rule.named("high").priority(10).when(OrderSpecs.totalAtLeast(1)).then(new PercentOff(2)));
        assertEquals("high", book.evaluate(gold).fired().get(0).rule());
    }

    @Test
    void bestByPicksTheLargestSaving() {
        RuleBook<Order> book = new RuleBook<>(FiringPolicy.bestBy(f -> Pricing.saving(f.outcome(), f.fact())));
        book.add(Rule.named("flat").priority(1).when(OrderSpecs.totalAtLeast(1)).then(new FlatOff(500)));
        book.add(Rule.named("pct").priority(2).when(OrderSpecs.totalAtLeast(1)).then(new PercentOff(10)));
        assertEquals("pct", book.evaluate(silver).fired().get(0).rule());     // 1200 > 500
        assertEquals("flat", book.evaluate(new Order("x", Tier.BRONZE, 1_000, 1, "IN", false, "CARD")).fired().get(0).rule());
    }

    @Test
    void allMatchesCollectsEveryFlagAndReplacingByNameWorks() {
        RuleBook<Order> book = new RuleBook<>(FiringPolicy.allMatches());
        book.add(Rule.named("cod").when(OrderSpecs.paidWith("COD")).then(new Flag("cod")));
        book.add(Rule.named("first").when(OrderSpecs.firstOrder()).then(new Flag("first")));
        assertEquals(2, book.evaluate(silver).fired().size());
        book.add(Rule.named("cod").when(OrderSpecs.paidWith("CARD")).then(new Flag("card now")));
        assertEquals(List.of("first"), book.evaluate(silver).fired().stream().map(Fired::rule).toList());
        assertTrue(book.remove("first"));
        assertTrue(book.evaluate(silver).fired().isEmpty());
    }

    @Test
    void brokenRuleIsIsolated() {
        RuleBook<Order> book = new RuleBook<>(FiringPolicy.allMatches());
        book.add(Rule.named("boom").when(Spec.<Order>of("explodes", o -> { throw new IllegalStateException("bad data"); })).then(new Flag("x")));
        book.add(Rule.named("ok").when(OrderSpecs.totalAtLeast(1)).then(new Flag("ok")));
        Evaluation e = book.evaluate(gold);
        assertEquals(List.of("ok"), e.fired().stream().map(Fired::rule).toList());
        assertEquals(List.of("boom: bad data"), e.errors());
    }

    @Test
    void evaluationsRunSafelyWhileRulesChange() throws InterruptedException {
        RuleBook<Order> book = new RuleBook<>(FiringPolicy.allMatches());
        book.add(Rule.named("base").when(OrderSpecs.totalAtLeast(1)).then(new Flag("base")));
        AtomicInteger failures = new AtomicInteger();
        List<Thread> threads = new ArrayList<>();
        for (int t = 0; t < 4; t++) {
            threads.add(new Thread(() -> {
                for (int i = 0; i < 5_000; i++) {
                    try {
                        if (book.evaluate(gold).fired().stream().noneMatch(f -> f.rule().equals("base"))) failures.incrementAndGet();
                    } catch (RuntimeException e) {
                        failures.incrementAndGet();
                    }
                }
            }));
        }
        threads.add(new Thread(() -> {
            for (int i = 0; i < 2_000; i++) {
                book.add(Rule.named("tmp" + (i % 10)).when(OrderSpecs.tierIs(Tier.GOLD)).then(new Flag("t")));
                book.remove("tmp" + ((i + 5) % 10));
            }
        }));
        threads.forEach(Thread::start);
        for (Thread th : threads) th.join();
        assertEquals(0, failures.get());
    }
}
```

## Concurrency

- **Copy-on-write rule list.** `add`/`remove` build a new sorted list and publish it through a `volatile` field; `evaluate` reads that field once and iterates an immutable list. Evaluations never lock and never see a half-updated rule set.
- **Writers are serialised** with `synchronized` so two concurrent `add`s don't lose each other's changes.
- **Rules must be side-effect free.** Conditions and actions run on many threads at once; if an action needs to do something (send an email), have it return an outcome and let the caller act on it.

## Common mistakes and alternatives

- **Hard-coded `if` chains** in checkout — every promotion is a deployment and nobody can answer "why did this order get 15%?".
- **Conditions as strings parsed on every evaluation** — slow and error-prone; parse once into a spec tree.
- **Evaluating with a lock held** — rules can be slow; copy-on-write keeps reads lock-free.
- **Letting rules mutate the fact** — order of evaluation starts to matter and results become irreproducible.
- **Alternative:** a forward-chaining engine (Rete, Drools) where rules derive new facts that trigger other rules. Powerful, but much harder to reason about; most business rules are single-pass like this one.

## Follow-up questions

````reveal title="Rules from configuration"
Represent rules as JSON: `{"name": "gold-big-basket", "priority": 10, "when": {"and": [{"tierIs": "GOLD"}, {"totalAtLeast": 5000}]}, "then": {"percentOff": 15}}`. A parser maps each key to a factory (`"tierIs" -> OrderSpecs::tierIs`) and builds the same `Spec` tree. Validate on load and reject unknown keys, so a typo can't silently disable a rule.
````

````reveal title="Stacking rules and limits"
Some discounts stack (free shipping + 10%), some are exclusive. Give outcomes a `group`; the firing policy picks the best per group and applies a global cap (never more than 30% off). That's a new `FiringPolicy`, not an engine change.
````

````reveal title="Testing rule changes safely"
Run a new rule set in **shadow mode**: evaluate both the live and candidate books for each order, apply only the live result, and log differences. Once the diff looks right, swap the books atomically.
````

## Complexity

- `evaluate`: O(R × C) for R rules with conditions of C nodes each.
- `add`/`remove`: O(R log R) to rebuild the sorted snapshot (rare).

## Interviewer checklist

- [ ] Conditions as composable specifications (AND/OR/NOT)
- [ ] Rules with priority, condition, outcome; fluent builder
- [ ] Conflict resolution as a strategy (first, all, best)
- [ ] Explanations for fired rules
- [ ] Runtime changes via copy-on-write; broken rules isolated
- [ ] Config-driven rules and stacking discussed
