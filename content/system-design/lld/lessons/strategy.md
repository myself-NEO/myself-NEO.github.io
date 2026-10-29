## The problem

An object needs to perform a task that can be done in **several interchangeable ways**: compute a fare, pick a driver, evict a cache entry, split an expense, choose a parking spot. Hard-coding the choice with `if/else` or `switch` means every new algorithm edits the class, and the class mixes **what it does** with **how one particular variant does it**.

**Strategy** defines a family of algorithms, encapsulates each one behind a **common interface**, and makes them **interchangeable**. The object using the algorithm (the *context*) delegates to whichever strategy it was given.

## When to use it — and when not

**Use when:**

- There are (or will predictably be) **multiple variants** of an algorithm or policy.
- The variant is chosen by **configuration, input, or at runtime**.
- You want each variant **independently testable**.

**Don't use when:**

- There's exactly one algorithm and no stated variation ([YAGNI](lesson:dry-kiss-yagni)).
- The "variants" differ by a single number (a rate): make it a parameter, not a class.

## Core idea

- **Strategy interface** — one method for the varying behaviour (`fee(ticket, exitTime)`).
- **Concrete strategies** — one class (or lambda) per algorithm.
- **Context** — holds a strategy (usually injected) and delegates to it. It doesn't know which concrete strategy it has.

## UML

```uml title="Strategy"
class ParkingLot
  - pricing: PricingStrategy
  + exit(ticket: Ticket, at: Instant): long
interface PricingStrategy
  + fee(ticket: Ticket, exitTime: Instant): long
class HourlyPricing
class FlatRatePricing
class TieredPricing
ParkingLot --> PricingStrategy : delegates
HourlyPricing ..|> PricingStrategy
FlatRatePricing ..|> PricingStrategy
TieredPricing ..|> PricingStrategy
```

## Java implementation

```java title="Pluggable pricing and spot selection" file="StrategyDemo.java"
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

public class StrategyDemo {
    public static void main(String[] args) {
        Instant in = Instant.parse("2026-01-01T08:00:00Z");
        Instant out = Instant.parse("2026-01-01T13:20:00Z");     // 5h20m
        Ticket ticket = new Ticket("T1", in);

        List<PricingStrategy> strategies = List.of(
                new HourlyPricing(40),
                new FlatRatePricing(150),
                new TieredPricing(List.of(new Tier(2, 30), new Tier(4, 50)), 80));
        for (PricingStrategy s : strategies) {
            System.out.println(s.getClass().getSimpleName() + ": " + s.fee(ticket, out));
        }

        // A second strategy axis in the same design: which spot to allocate.
        List<Spot> free = List.of(new Spot("L2-07", 2, 7), new Spot("L1-15", 1, 15), new Spot("L1-03", 1, 3));
        SpotSelector nearestToEntrance = spots -> spots.stream().min(Comparator.comparingInt(Spot::level).thenComparingInt(Spot::number));
        SpotSelector fillTopFirst = spots -> spots.stream().max(Comparator.comparingInt(Spot::level));
        System.out.println("Nearest: " + nearestToEntrance.choose(free).orElseThrow().id());
        System.out.println("Top-first: " + fillTopFirst.choose(free).orElseThrow().id());
    }
}

record Ticket(String id, Instant entryTime) {}
record Tier(int uptoHours, long ratePerHour) {}
record Spot(String id, int level, int number) {}

interface PricingStrategy {
    long fee(Ticket ticket, Instant exitTime);

    /** Shared helper: billable hours rounded up, minimum 1. */
    static long billableHours(Ticket t, Instant exit) {
        long minutes = Duration.between(t.entryTime(), exit).toMinutes();
        return Math.max(1, (minutes + 59) / 60);
    }
}

class HourlyPricing implements PricingStrategy {
    private final long perHour;
    HourlyPricing(long perHour) { this.perHour = perHour; }
    public long fee(Ticket t, Instant exit) { return PricingStrategy.billableHours(t, exit) * perHour; }
}

class FlatRatePricing implements PricingStrategy {
    private final long flat;
    FlatRatePricing(long flat) { this.flat = flat; }
    public long fee(Ticket t, Instant exit) { return flat; }
}

/** First 2h at 30/h, hours 3-4 at 50/h, then 80/h. */
class TieredPricing implements PricingStrategy {
    private final List<Tier> tiers;
    private final long beyondRate;
    TieredPricing(List<Tier> tiers, long beyondRate) { this.tiers = List.copyOf(tiers); this.beyondRate = beyondRate; }

    public long fee(Ticket t, Instant exit) {
        long hours = PricingStrategy.billableHours(t, exit), total = 0, counted = 0;
        for (Tier tier : tiers) {
            long inTier = Math.max(0, Math.min(hours, tier.uptoHours()) - counted);
            total += inTier * tier.ratePerHour();
            counted += inTier;
        }
        return total + Math.max(0, hours - counted) * beyondRate;
    }
}

@FunctionalInterface
interface SpotSelector {
    Optional<Spot> choose(List<Spot> freeSpots);
}
```

For 5h20m (6 billable hours): hourly = 240; flat = 150; tiered = 2×30 + 2×50 + 2×80 = 320.

> [!TIP] Class or lambda?
> Simple, stateless strategies such as spot selectors work well as lambdas. Strategies with **configuration** (rates, tiers) or **dependencies** (a holiday calendar service) deserve named classes.

## Choosing the strategy

The context shouldn't decide which strategy to use with a `switch` — that brings the conditional back. Options:

- **Inject it** via the constructor (decided in the composition root or by configuration).
- **Look it up** from a registry: `Map<VehicleType, PricingStrategy>`.
- **Let it be changed at runtime** with a setter or method parameter, if the business requires it (for example, surge pricing toggled on).

## Realistic use case

Strategy is everywhere in LLD problems:

| Problem | Strategy |
|---|---|
| [Parking Lot](problem:parking-lot) | Pricing; spot allocation |
| [Rate Limiter](problem:rate-limiter) | Token bucket vs sliding window |
| [Cache](problem:cache-eviction) | LRU vs LFU vs FIFO eviction |
| [Expense Sharing](problem:expense-sharing) | Equal vs exact vs percentage split |
| [Ride-Sharing](problem:ride-sharing) | Nearest driver vs best-rated vs batched matching |
| [Elevator](problem:elevator) | Scheduling policy |

In the JDK, `Comparator` is the canonical strategy: `list.sort(byPrice)`.

## Trade-offs and alternatives

- **Pros:** open/closed; isolated, testable algorithms; runtime flexibility; no conditionals in the context.
- **Cons:** more types; clients or configuration must know which strategy to pick; strategies may need data the context must expose.
- **Alternatives:**
  - **Enum with behaviour** — for a closed, stable set of algorithms without dependencies.
  - **[State](lesson:state-pattern)** — same structure, but the *object itself* switches implementations as its state changes. With Strategy, the *client* chooses.
  - **[Template Method](lesson:template-method)** — varies *steps* of an algorithm via inheritance rather than swapping the whole algorithm via composition.

## Recognising it in an interview

- "Fees/rates/discounts depend on…", "different algorithms for…", "configurable policy".
- A follow-up: *"Now support surge pricing / LFU eviction / exact splits."* The answer should be "add a strategy".

## Common mistakes

- A strategy interface that takes a type code (`fee(ticket, "HOURLY")`).
- Context code that `instanceof`-checks the strategy.
- Strategies that reach into the context's internals instead of receiving what they need as parameters.
- A strategy per tiny variation that should be a parameter (`FortyPerHourPricing`, `FiftyPerHourPricing`).

## Key takeaways

- Strategy encapsulates **interchangeable algorithms** behind one interface; the context delegates.
- Choose strategies by **injection or registry**, not by a switch inside the context.
- Use lambdas for simple strategies and classes for configured ones.
- It's the most frequently useful pattern in LLD interviews.

## Knowledge check

```quiz
? What's the key difference between Strategy and State?
+ With Strategy, the client chooses the algorithm; with State, the object switches its own behaviour as its state changes
- Strategy uses inheritance; State uses composition
- They are unrelated
> Same structure, different driver of the change.

? Hourly pricing at 40/hour and at 60/hour are needed. What's the best design?
- Two classes: FortyPerHourPricing and SixtyPerHourPricing
+ One HourlyPricing class with the rate as a constructor parameter
- A switch on the rate inside ParkingLot
> Variation in data is a parameter; variation in algorithm is a strategy.

? Which JDK interface is a classic Strategy?
+ Comparator
- Iterable
- AutoCloseable
> Sorting delegates the comparison algorithm to a Comparator.
```

## Exercise

Implement expense-splitting strategies for a Splitwise-style app. Given a total amount in paise, the payer and a list of participants:

- `EqualSplit` — divide equally; distribute the leftover paise one by one to the first participants.
- `ExactSplit` — use given amounts per person; they must sum to the total.
- `PercentSplit` — use given percentages; they must sum to 100.

Each returns a `Map<String, Long>` of how much each participant owes.

````hint title="Hint"
Define `interface SplitStrategy { Map<String, Long> split(long total, List<String> participants); }`. Exact and percent strategies get their inputs through their constructors. Validate in `split()`.
````

````solution title="Reference solution"
```java file="SplitStrategyDemo.java"
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class SplitStrategyDemo {
    public static void main(String[] args) {
        List<String> people = List.of("asha", "ravi", "meera");
        System.out.println(new EqualSplit().split(1000, people));                                       // {asha=334, ravi=333, meera=333}
        System.out.println(new ExactSplit(Map.of("asha", 500L, "ravi", 300L, "meera", 200L)).split(1000, people));
        System.out.println(new PercentSplit(Map.of("asha", 50, "ravi", 25, "meera", 25)).split(1000, people));
    }
}

interface SplitStrategy {
    Map<String, Long> split(long total, List<String> participants);
}

class EqualSplit implements SplitStrategy {
    public Map<String, Long> split(long total, List<String> participants) {
        if (participants.isEmpty()) throw new IllegalArgumentException("no participants");
        long base = total / participants.size(), remainder = total % participants.size();
        Map<String, Long> shares = new LinkedHashMap<>();
        for (int i = 0; i < participants.size(); i++) shares.put(participants.get(i), base + (i < remainder ? 1 : 0));
        return shares;
    }
}

class ExactSplit implements SplitStrategy {
    private final Map<String, Long> amounts;
    ExactSplit(Map<String, Long> amounts) { this.amounts = Map.copyOf(amounts); }

    public Map<String, Long> split(long total, List<String> participants) {
        long sum = 0;
        Map<String, Long> shares = new LinkedHashMap<>();
        for (String p : participants) {
            Long a = amounts.get(p);
            if (a == null || a < 0) throw new IllegalArgumentException("missing or negative amount for " + p);
            shares.put(p, a);
            sum += a;
        }
        if (sum != total) throw new IllegalArgumentException("exact amounts sum to " + sum + ", expected " + total);
        return shares;
    }
}

class PercentSplit implements SplitStrategy {
    private final Map<String, Integer> percents;
    PercentSplit(Map<String, Integer> percents) { this.percents = Map.copyOf(percents); }

    public Map<String, Long> split(long total, List<String> participants) {
        int sumPct = participants.stream().mapToInt(p -> percents.getOrDefault(p, 0)).sum();
        if (sumPct != 100) throw new IllegalArgumentException("percentages sum to " + sumPct);
        Map<String, Long> shares = new LinkedHashMap<>();
        long assigned = 0;
        for (String p : participants) {
            long share = total * percents.getOrDefault(p, 0) / 100;
            shares.put(p, share);
            assigned += share;
        }
        String first = participants.get(0);
        shares.put(first, shares.get(first) + (total - assigned));   // rounding remainder to the first person
        return shares;
    }
}
```

The full problem, including balances and debt simplification, is [Expense Sharing](problem:expense-sharing).
````
