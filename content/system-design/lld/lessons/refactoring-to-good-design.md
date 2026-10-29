## Refactoring is how good designs actually happen

Few designs are right the first time — in interviews or at work. **Refactoring** means improving the structure of code **without changing its behaviour**, in small, safe steps. In an interview, follow-up questions often amount to "refactor this to handle X". At work, it's how you keep a codebase healthy.

The discipline:

1. Make sure behaviour is **pinned down** — tests, or at least a runnable example with known output.
2. Make **one small structural change**.
3. Check that behaviour is unchanged.
4. Repeat. Stop when the code is clear enough for the current requirements.

## Common smells in LLD code

| Smell | Symptom | Usual refactoring |
|---|---|---|
| **Long method** | 50+ lines doing several things | Extract method |
| **Type switch** | `switch`/`if` on a type code, often repeated | Replace conditional with polymorphism / Strategy |
| **Primitive obsession** | `String` IDs, `double` money, `int[]` coordinates everywhere | Introduce value object (`record`) |
| **Data class + manager** | Entities with only getters/setters; logic in `XManager` | Move method to the data's owner |
| **Feature envy** | A method uses another object's data more than its own | Move method |
| **Shotgun surgery** | One change requires edits in many classes | Consolidate the knowledge in one place |
| **Flag arguments** | `process(order, true, false)` | Split into named methods, or a parameter object |
| **Hidden dependencies** | `new`, statics or `now()` inside logic | Inject dependencies |

## A worked refactoring

Starting point: a working but tangled vending machine method.

```java title="Step 0 — works, but hard to change"
class VendingMachine {
    Map<String, Integer> stock = new HashMap<>();
    Map<String, Integer> prices = new HashMap<>();
    int inserted = 0;
    String state = "IDLE";

    String handle(String action, String arg) {
        if (action.equals("COIN")) {
            if (state.equals("DISPENSING")) return "busy";
            inserted += Integer.parseInt(arg);
            state = "HAS_MONEY";
            return "ok";
        } else if (action.equals("SELECT")) {
            if (!state.equals("HAS_MONEY")) return "insert coins first";
            if (stock.getOrDefault(arg, 0) == 0) return "sold out";
            if (inserted < prices.get(arg)) return "need more";
            stock.put(arg, stock.get(arg) - 1);
            int change = inserted - prices.get(arg);
            inserted = 0;
            state = "IDLE";
            return "dispensed " + arg + ", change " + change;
        } else if (action.equals("CANCEL")) {
            int refund = inserted; inserted = 0; state = "IDLE";
            return "refund " + refund;
        }
        return "unknown";
    }
}
```

**Step 1 — Replace string codes with types.** `action` strings become methods; `state` becomes an enum. Typos become compile errors.

**Step 2 — Introduce value objects / small classes.** Stock and price per product belong together in a `Slot`.

**Step 3 — Move rules to their owners.** "Sold out" is the slot's rule. "Enough money" is the machine's, because it holds the inserted amount.

**Step 4 — Replace error strings with exceptions** for invalid operations, so callers can't ignore them.

**Step 5 — Stop.** A full [State pattern](lesson:state-pattern) is *not* needed for three states with simple transitions. An enum is enough until the states grow behaviour.

```java title="After — clear, and no more abstract than it needs to be" file="VendingRefactorDemo.java"
import java.util.HashMap;
import java.util.Map;

public class VendingRefactorDemo {
    public static void main(String[] args) {
        VendingMachine vm = new VendingMachine();
        vm.addSlot("A1", "Chips", 20, 2);
        vm.insert(10);
        vm.insert(20);
        System.out.println(vm.select("A1"));       // Dispensed Chips, change 10
        try {
            vm.select("A1");
        } catch (IllegalStateException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
        vm.insert(5);
        System.out.println("Refund: " + vm.cancel());
    }
}

enum MachineState { IDLE, HAS_MONEY }

class Slot {
    private final String product;
    private final int price;
    private int quantity;

    Slot(String product, int price, int quantity) {
        if (price <= 0 || quantity < 0) throw new IllegalArgumentException("bad slot config");
        this.product = product;
        this.price = price;
        this.quantity = quantity;
    }

    int price() { return price; }
    String product() { return product; }

    String takeOne() {
        if (quantity == 0) throw new IllegalStateException(product + " is sold out");
        quantity--;
        return product;
    }
}

class VendingMachine {
    private final Map<String, Slot> slots = new HashMap<>();
    private MachineState state = MachineState.IDLE;
    private int inserted = 0;

    void addSlot(String code, String product, int price, int quantity) {
        slots.put(code, new Slot(product, price, quantity));
    }

    void insert(int amount) {
        if (amount <= 0) throw new IllegalArgumentException("amount must be positive");
        inserted += amount;
        state = MachineState.HAS_MONEY;
    }

    String select(String code) {
        if (state != MachineState.HAS_MONEY) throw new IllegalStateException("Insert money first");
        Slot slot = slots.get(code);
        if (slot == null) throw new IllegalArgumentException("No slot " + code);
        if (inserted < slot.price()) throw new IllegalStateException("Need " + (slot.price() - inserted) + " more");
        String item = slot.takeOne();          // may throw "sold out" before any state changes
        int change = inserted - slot.price();
        reset();
        return "Dispensed " + item + ", change " + change;
    }

    int cancel() {
        int refund = inserted;
        reset();
        return refund;
    }

    private void reset() {
        inserted = 0;
        state = MachineState.IDLE;
    }
}
```

What changed, and what deliberately **didn't**:

- ✅ String actions → typed methods; string state → enum.
- ✅ Slot owns stock and price; "sold out" moved into `Slot.takeOne()`.
- ✅ Errors are exceptions; state changes happen only after all checks pass.
- ❌ No State pattern, no factory, no observer — nothing in the requirements needs them **yet**. If the interviewer adds "maintenance mode" and "card payments", the next refactor has a clean starting point. See the full [Vending Machine](problem:vending-machine) problem.

## Knowing when to stop

Stop refactoring when:

- Each class has a clear responsibility you can state in a sentence.
- The **next likely change** has an obvious, local place to go.
- Further abstraction would only serve **hypothetical** requirements ([YAGNI](lesson:dry-kiss-yagni)).

Signs you've gone too far: you need a diagram to follow a simple call; classes have one trivial method; the same concept has three names across layers.

## Real-world example

A team inherited a 3,000-line `BillingManager`. Rather than a rewrite, they added characterisation tests around the main entry points, then extracted one concept per week — `TaxCalculator`, then `InvoiceNumbering`, then `DunningPolicy` — shipping each step to production. Six weeks later the manager was a 200-line coordinator, and there had been no big-bang release.

## Common mistakes

- **Refactoring and changing behaviour in the same step**, so you can't tell which caused a bug.
- **Big-bang rewrites** instead of incremental steps.
- **Refactoring toward patterns** for their own sake ("this should be a Visitor").
- **No safety net** — no tests or known outputs to compare against.

## In the interview

> [!INTERVIEW] Evolve, don't rewrite
> When a follow-up arrives, narrate a small refactor: *"Right now pricing is a method on `ParkingLot`. With weekend rates I'll extract a `PricingStrategy` interface, move the current logic into `HourlyPricing`, and inject it. The lot's code changes by one line."* This shows you can evolve a design safely, which is exactly what the follow-up is testing.

## Key takeaways

- Refactoring = **behaviour-preserving** structural change in **small steps** with a safety net.
- Learn the common smells and their standard refactorings.
- Move rules to the data's owner, replace codes with types, and replace type switches with polymorphism *when variation is real*.
- **Stop** when the code is clear and the next likely change has a home.

## Knowledge check

```quiz
? What distinguishes refactoring from rewriting?
+ Refactoring changes structure in small steps while preserving behaviour
- Refactoring always adds design patterns
- Refactoring is done only without tests
> Small, behaviour-preserving steps are the defining feature.

? `createUser(name, email, true, false, true)` shows which smell?
- Feature envy
+ Flag arguments (boolean parameters with hidden meaning)
- Shotgun surgery
> Boolean flags hide intent; use named methods or a parameter object.

? After refactoring the vending machine, why wasn't the State pattern introduced?
- The State pattern doesn't work in Java
+ With only two simple states, an enum was sufficient; the pattern would add classes without solving a current problem
- Enums can't represent states
> Patterns should be introduced when complexity justifies them, not by default.
```

## Exercise

Refactor this method step by step. Write down each step (one line each), then the final code. Don't add abstractions the requirements don't need.

```java
double calc(String type, double amount, int years, boolean vip) {
    double r;
    if (type.equals("SAVINGS")) r = 0.04;
    else if (type.equals("FD")) r = years > 3 ? 0.07 : 0.065;
    else r = 0;
    double interest = amount * r * years;
    if (vip) interest = interest * 1.1;
    return Math.round(interest * 100) / 100.0;
}
```

````hint title="Hint"
Smells: string type codes, `double` money, a flag argument, magic numbers. Which of these deserve a type, and which just a name?
````

````solution title="Sample answer"
Steps:

1. Replace the `type` string with an enum `AccountType`, giving each constant its rate rule.
2. Replace `double` money with `long` paise (or `BigDecimal`).
3. Replace the `vip` flag with a `CustomerTier` enum carrying a bonus multiplier.
4. Name the magic numbers inside the enums.

```java file="InterestRefactorDemo.java"
public class InterestRefactorDemo {
    public static void main(String[] args) {
        System.out.println(Interest.simple(AccountType.FIXED_DEPOSIT, 100_000_00L, 5, CustomerTier.VIP)); // in paise
    }
}

enum AccountType {
    SAVINGS { int basisPoints(int years) { return 400; } },
    FIXED_DEPOSIT { int basisPoints(int years) { return years > 3 ? 700 : 650; } },
    CURRENT { int basisPoints(int years) { return 0; } };

    abstract int basisPoints(int years);   // 1 basis point = 0.01%
}

enum CustomerTier {
    REGULAR(100), VIP(110);
    final int bonusPercent;
    CustomerTier(int bonusPercent) { this.bonusPercent = bonusPercent; }
}

final class Interest {
    private Interest() {}

    static long simple(AccountType type, long principalPaise, int years, CustomerTier tier) {
        if (principalPaise < 0 || years < 0) throw new IllegalArgumentException("negative input");
        long base = principalPaise * type.basisPoints(years) * years / 10_000;
        return base * tier.bonusPercent / 100;
    }
}
```

No Strategy interface was introduced: account types are a closed, stable set, so an enum with behaviour is enough.
````
