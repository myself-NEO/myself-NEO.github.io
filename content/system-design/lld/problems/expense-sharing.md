## Problem statement

Design the core of an expense-sharing app like Splitwise. Friends in a group record expenses: who paid, how much, and how it's split — equally, by exact amounts, or by percentages. The app shows each person's balance (how much they owe or are owed) and suggests a small set of payments that settles everyone up. People record those payments when they make them.

> [!TIP] Try it first
> Split 1000.00 equally between three people. What exactly does each person owe, and where does the extra cent go? Decide how you'll represent money before anything else.

## Clarifying questions

1. Which split types?
2. How is money represented? What about amounts that don't divide evenly?
3. Is the payer always one of the people sharing the cost?
4. Do we need pairwise debts ("Ravi owes Asha 200") or net balances?
5. Should we minimise the number of settlement payments?
6. Can expenses be edited or deleted?
7. One currency?

````reveal title="Answers we'll assume"
- **Equal, exact and percentage** splits; more may come (shares, adjustments).
- Money is a `long` number of **cents**. Never `double`. Leftover cents from equal and percentage splits go to the first participants in a fixed order, so results are deterministic and always add up.
- The payer may or may not share the cost (a cab paid by Meera for the other two).
- We keep a **net balance per person** (positive: is owed; negative: owes) and compute settlement transfers from it.
- Settlement suggests **at most n − 1 payments**; the exact minimum is NP-hard, so a greedy plan is fine.
- Expenses are immutable once recorded; a correction is a new, opposite expense (a follow-up).
- One currency.
````

## Requirements

**Functional**

1. Create a group with members.
2. Add an expense with a payer, an amount and a split; validate that it's well-formed.
3. Show net balances for everyone.
4. Suggest settlement transfers.
5. Record a settlement payment.

**Non-functional**

6. Balances always sum to exactly zero.
7. New split types plug in without touching the group logic.
8. Recorded expenses can't be changed by accident (immutable).

## Step 1 — Entities

````reveal title="Entities and responsibilities"
| Entity | Responsibility |
|---|---|
| `Split` | Strategy: turns an amount into shares per person; validates its own input |
| `EqualSplit`, `ExactSplit`, `PercentSplit` | The three split rules |
| `Expense` | Immutable record: payer, amount, shares. Invariant: shares add up to the amount |
| `Group` | Members, expenses, **net balances**; adds expenses and payments; plans settlement |
| `Transfer` | A suggested or recorded payment: from, to, amount |
| `Money` | Parsing and formatting cents |

**Key insight:** you don't need a debt graph. Each expense adds the amount to the payer's balance and subtracts each share from that person's balance. Net balances are enough to settle up.
````

## Step 2 — Settling up

````reveal title="Greedy settlement in at most n − 1 transfers"
Put everyone owed money in a max-heap of creditors and everyone who owes in a max-heap of debtors. Repeatedly match the largest debtor with the largest creditor, transfer the smaller of the two amounts, and push back whoever still has a balance.

Each step brings at least one person to zero, so with n people there are at most n − 1 transfers. Finding the true minimum means finding subsets of people whose balances cancel, which is NP-hard; greedy is what real apps ship.

```text
balances: asha +4866.66, ravi -1533.33, meera -3333.33
step 1: meera (largest debtor) -> asha 3333.33   asha now +1533.33
step 2: ravi -> asha 1533.33                      everyone at 0
```
````

## Step 3 — Class design

```uml title="Expense sharing"
class Group
  - members: Set<String>
  - expenses: List<Expense>
  - balances: Map<String, Long>
  + addExpense(desc: String, paidBy: String, amount: long, split: Split): Expense
  + settle(from: String, to: String, amount: long): void
  + balances(): Map<String, Long>
  + suggestTransfers(): List<Transfer>
interface Split
  + shares(amount: long): Map<String, Long>
  + equal(people: List<String>): Split
  + exact(amounts: Map<String, Long>): Split
  + percent(percentages: Map<String, Integer>): Split
class EqualSplit
class ExactSplit
class PercentSplit
record Expense
  + id: String
  + paidBy: String
  + amount: long
  + shares: Map<String, Long>
record Transfer
  + from: String
  + to: String
  + amount: long
Group *-- "0..*" Expense
Group ..> Split
Group ..> Transfer
EqualSplit ..|> Split
ExactSplit ..|> Split
PercentSplit ..|> Split
```

## Step 4 — Implementation

````hint title="Hint — splitting cents fairly"
For an equal split: `base = amount / n`, `extra = amount % n`; the first `extra` people pay `base + 1`. For percentages: compute each floor share, then hand out the leftover cents one at a time in a fixed order. Either way the shares add up to the amount exactly.
````

````solution title="Complete Java solution"
```java title="ExpenseSharingDemo.java" file="ExpenseSharingDemo.java"
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.Set;
import java.util.TreeMap;

public class ExpenseSharingDemo {
    public static void main(String[] args) {
        List<String> all = List.of("asha", "ravi", "meera");
        Group trip = new Group("Goa trip", all);

        print(trip.addExpense("Hotel", "asha", Money.parse("9000.00"), Split.equal(all)));
        print(trip.addExpense("Dinner", "ravi", Money.parse("1000.00"), Split.equal(all)));
        print(trip.addExpense("Cab", "meera", Money.parse("600.00"),
                Split.exact(Map.of("asha", Money.parse("200.00"), "ravi", Money.parse("400.00")))));
        print(trip.addExpense("Drinks", "ravi", Money.parse("1200.00"), Split.percent(Map.of("asha", 50, "meera", 50))));
        attempt(() -> trip.addExpense("Taxi", "asha", Money.parse("500.00"),
                Split.exact(Map.of("ravi", Money.parse("200.00"), "meera", Money.parse("200.00")))));
        attempt(() -> trip.addExpense("Snacks", "asha", Money.parse("90.00"), Split.percent(Map.of("ravi", 60, "meera", 30))));
        attempt(() -> trip.addExpense("Tickets", "dev", Money.parse("300.00"), Split.equal(all)));

        System.out.println("balances: " + Money.format(trip.balances()));
        List<Transfer> plan = trip.suggestTransfers();
        System.out.println("settle up: " + plan);
        trip.settle("ravi", "asha", Money.parse("1533.33"));
        System.out.println("after ravi pays: " + Money.format(trip.balances()));
        System.out.println("settle up: " + trip.suggestTransfers());
    }

    static void print(Expense e) {
        System.out.println(e.description() + " " + Money.format(e.amount()) + " paid by " + e.paidBy() + " -> " + Money.format(e.shares()));
    }

    static void attempt(Runnable action) {
        try {
            action.run();
        } catch (ExpenseException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
    }
}

class ExpenseException extends RuntimeException {
    ExpenseException(String message) { super(message); }
}

/** Money is a long number of cents; this class only parses and prints it. */
final class Money {
    private Money() { }

    static long parse(String amount) { return new BigDecimal(amount).movePointRight(2).longValueExact(); }

    static String format(long cents) {
        String sign = cents < 0 ? "-" : "";
        long abs = Math.abs(cents);
        return sign + (abs / 100) + "." + String.format("%02d", abs % 100);
    }

    static String format(Map<String, Long> amounts) {
        Map<String, String> out = new LinkedHashMap<>();
        amounts.forEach((k, v) -> out.put(k, format(v)));
        return out.toString();
    }
}

// ---------- Split strategies ----------

interface Split {
    /** Shares per person; must add up to exactly {@code amount}. */
    Map<String, Long> shares(long amount);

    static Split equal(List<String> people) { return new EqualSplit(people); }
    static Split exact(Map<String, Long> amounts) { return new ExactSplit(amounts); }
    static Split percent(Map<String, Integer> percentages) { return new PercentSplit(percentages); }
}

final class EqualSplit implements Split {
    private final List<String> people;

    EqualSplit(List<String> people) {
        if (people.isEmpty() || new LinkedHashSet<>(people).size() != people.size()) throw new ExpenseException("need distinct participants");
        this.people = List.copyOf(people);
    }

    public Map<String, Long> shares(long amount) {
        long base = amount / people.size();
        long extra = amount % people.size();                     // leftover cents go to the first participants
        Map<String, Long> shares = new LinkedHashMap<>();
        for (int i = 0; i < people.size(); i++) shares.put(people.get(i), base + (i < extra ? 1 : 0));
        return shares;
    }
}

final class ExactSplit implements Split {
    private final Map<String, Long> amounts;

    ExactSplit(Map<String, Long> amounts) {
        if (amounts.isEmpty() || amounts.values().stream().anyMatch(a -> a < 0)) throw new ExpenseException("exact amounts must be non-negative");
        this.amounts = new TreeMap<>(amounts);
    }

    public Map<String, Long> shares(long amount) {
        long sum = amounts.values().stream().mapToLong(Long::longValue).sum();
        if (sum != amount) throw new ExpenseException("exact shares add up to " + Money.format(sum) + ", not " + Money.format(amount));
        return amounts;
    }
}

final class PercentSplit implements Split {
    private final Map<String, Integer> percentages;

    PercentSplit(Map<String, Integer> percentages) {
        int total = percentages.values().stream().mapToInt(Integer::intValue).sum();
        if (total != 100 || percentages.values().stream().anyMatch(p -> p < 0)) throw new ExpenseException("percentages add up to " + total + ", not 100");
        this.percentages = new TreeMap<>(percentages);
    }

    public Map<String, Long> shares(long amount) {
        Map<String, Long> shares = new TreeMap<>();
        long assigned = 0;
        for (Map.Entry<String, Integer> e : percentages.entrySet()) {
            long share = amount * e.getValue() / 100;           // floor
            shares.put(e.getKey(), share);
            assigned += share;
        }
        for (String person : percentages.keySet()) {            // hand out leftover cents in a fixed order
            if (assigned == amount) break;
            if (percentages.get(person) > 0) {
                shares.merge(person, 1L, Long::sum);
                assigned++;
            }
        }
        return shares;
    }
}

// ---------- Domain ----------

record Expense(String id, String description, String paidBy, long amount, Map<String, Long> shares) {
    Expense {
        shares = Collections.unmodifiableMap(new TreeMap<>(shares));   // defensive, immutable copy
        long sum = shares.values().stream().mapToLong(Long::longValue).sum();
        if (amount <= 0 || sum != amount) throw new ExpenseException("shares must add up to the amount");
    }
}

record Transfer(String from, String to, long amount) {
    @Override public String toString() { return from + " pays " + to + " " + Money.format(amount); }
}

final class Group {
    private final String name;
    private final Set<String> members;
    private final List<Expense> expenses = new ArrayList<>();
    private final List<Transfer> payments = new ArrayList<>();
    private final Map<String, Long> balances = new TreeMap<>();   // + is owed money, - owes money
    private long nextId;

    Group(String name, List<String> members) {
        this.name = name;
        this.members = new LinkedHashSet<>(members);
        members.forEach(m -> balances.put(m, 0L));
    }

    String name() { return name; }

    synchronized Expense addExpense(String description, String paidBy, long amount, Split split) {
        requireMember(paidBy);
        if (amount <= 0) throw new ExpenseException("amount must be positive");
        Map<String, Long> shares = split.shares(amount);
        shares.keySet().forEach(this::requireMember);
        Expense e = new Expense("E" + (++nextId), description, paidBy, amount, shares);
        expenses.add(e);
        balances.merge(paidBy, amount, Long::sum);                 // the payer is owed the whole amount...
        e.shares().forEach((person, share) -> balances.merge(person, -share, Long::sum));   // ...minus their own share
        return e;
    }

    synchronized void settle(String from, String to, long amount) {
        requireMember(from);
        requireMember(to);
        if (amount <= 0 || from.equals(to)) throw new ExpenseException("invalid payment");
        payments.add(new Transfer(from, to, amount));
        balances.merge(from, amount, Long::sum);
        balances.merge(to, -amount, Long::sum);
    }

    synchronized Map<String, Long> balances() { return Collections.unmodifiableMap(new TreeMap<>(balances)); }

    /** Greedy: largest debtor pays largest creditor; at most n - 1 transfers. */
    synchronized List<Transfer> suggestTransfers() {
        record Party(String name, long amount) {}
        Comparator<Party> largestFirst = Comparator.comparingLong(Party::amount).reversed().thenComparing(Party::name);
        PriorityQueue<Party> creditors = new PriorityQueue<>(largestFirst);
        PriorityQueue<Party> debtors = new PriorityQueue<>(largestFirst);
        balances.forEach((person, b) -> {
            if (b > 0) creditors.add(new Party(person, b));
            if (b < 0) debtors.add(new Party(person, -b));
        });
        List<Transfer> transfers = new ArrayList<>();
        while (!creditors.isEmpty() && !debtors.isEmpty()) {
            Party c = creditors.poll();
            Party d = debtors.poll();
            long x = Math.min(c.amount(), d.amount());
            transfers.add(new Transfer(d.name(), c.name(), x));
            if (c.amount() > x) creditors.add(new Party(c.name(), c.amount() - x));
            if (d.amount() > x) debtors.add(new Party(d.name(), d.amount() - x));
        }
        return transfers;
    }

    private void requireMember(String person) {
        if (!members.contains(person)) throw new ExpenseException(person + " is not in the group");
    }
}
```
````

## Design decisions

- **Cents in a `long`.** `0.1 + 0.2 != 0.3` in floating point; a money app that drifts by a cent is a bug report. Parsing goes through `BigDecimal` once, at the edge.
- **Splits are strategies.** `Group` calls `split.shares(amount)` and never asks which kind it is. Adding a "by shares" split (2:1:1) is one class and one static factory method (see [Strategy](lesson:strategy)).
- **Static factory methods** (`Split.equal`, `Split.exact`, `Split.percent`) read well at the call site and hide the concrete classes (see [Factory Method](lesson:factory-method)).
- **Invariants in two places.** Each split validates its own input (percentages add up to 100); `Expense` re-checks that shares add up to the amount, so no buggy future split can corrupt balances (see [Domain invariants](lesson:domain-invariants)).
- **Immutable expenses.** `Expense` copies the shares into an unmodifiable sorted map; callers can't change a recorded expense through a map they still hold (see [Immutability](lesson:immutability)).
- **Net balances only.** Every expense updates balances in O(participants); the settlement plan is derived on demand.

## Patterns and principles

[Strategy](lesson:strategy) (`Split`), [Factory Method](lesson:factory-method) (static factories), [immutability](lesson:immutability) (`Expense`, `Transfer`), [domain invariants](lesson:domain-invariants) (shares add up; balances sum to zero), and [testable design](lesson:testing-lld) (pure functions for splits and settlement).

## Example execution flow

```text
Hotel 9000.00 by asha, equal/3         asha +9000 -3000; ravi -3000; meera -3000
Dinner 1000.00 by ravi, equal/3        100000 cents / 3 = 33333 r 1 -> asha 333.34, ravi 333.33, meera 333.33
Cab 600.00 by meera, exact             asha 200, ravi 400; meera isn't sharing
Drinks 1200.00 by ravi, 50/50          asha 600, meera 600
Taxi exact 200+200 for 500.00          rejected: shares don't add up
balances  asha +4866.66, meera -3333.33, ravi -1533.33   (sum 0)
transfers meera -> asha 3333.33, ravi -> asha 1533.33
```

```text title="Program output"
Hotel 9000.00 paid by asha -> {asha=3000.00, meera=3000.00, ravi=3000.00}
Dinner 1000.00 paid by ravi -> {asha=333.34, meera=333.33, ravi=333.33}
Cab 600.00 paid by meera -> {asha=200.00, ravi=400.00}
Drinks 1200.00 paid by ravi -> {asha=600.00, meera=600.00}
Rejected: exact shares add up to 400.00, not 500.00
Rejected: percentages add up to 90, not 100
Rejected: dev is not in the group
balances: {asha=4866.66, meera=-3333.33, ravi=-1533.33}
settle up: [meera pays asha 3333.33, ravi pays asha 1533.33]
after ravi pays: {asha=3333.33, meera=-3333.33, ravi=0.00}
settle up: [meera pays asha 3333.33]
```

## Edge cases

- **Amounts that don't divide evenly** → leftover cents assigned deterministically; shares still add up.
- **Payer not sharing the cost** → the payer's balance goes up by the full amount.
- **Exact shares or percentages that don't add up** → rejected before anything changes.
- **Non-member as payer or participant** → rejected.
- **Duplicate participants in an equal split** → rejected.
- **Everyone already settled** → no transfers suggested.

## Tests

```java title="ExpenseSharingTest.java" file="ExpenseSharingTest.java" test="ExpenseSharingDemo.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import org.junit.jupiter.api.Test;

class ExpenseSharingTest {
    private final List<String> abc = List.of("a", "b", "c");

    @Test
    void equalSplitGivesLeftoverCentsToTheFirstParticipants() {
        assertEquals(Map.of("a", 34L, "b", 33L, "c", 33L), Split.equal(abc).shares(100));
    }

    @Test
    void percentSplitAddsUpExactly() {
        Map<String, Long> shares = Split.percent(Map.of("a", 33, "b", 33, "c", 34)).shares(1001);
        assertEquals(1001, shares.values().stream().mapToLong(Long::longValue).sum());
    }

    @Test
    void invalidSplitsAreRejected() {
        assertThrows(ExpenseException.class, () -> Split.percent(Map.of("a", 50, "b", 40)));
        assertThrows(ExpenseException.class, () -> Split.exact(Map.of("a", 10L)).shares(11));
        assertThrows(ExpenseException.class, () -> Split.equal(List.of("a", "a")));
    }

    @Test
    void recordedExpensesCannotBeChangedThroughTheInputMap() {
        Group g = new Group("g", abc);
        Map<String, Long> input = new HashMap<>(Map.of("a", 50L, "b", 50L));
        Expense e = g.addExpense("x", "c", 100, Split.exact(input));
        input.put("a", 0L);
        assertEquals(50L, e.shares().get("a"));
        assertThrows(UnsupportedOperationException.class, () -> e.shares().put("a", 1L));
    }

    @Test
    void balancesAlwaysSumToZeroAndTransfersSettleEveryone() {
        List<String> people = List.of("p1", "p2", "p3", "p4", "p5");
        Group g = new Group("g", people);
        Random rnd = new Random(42);
        for (int i = 0; i < 200; i++) {
            String payer = people.get(rnd.nextInt(people.size()));
            g.addExpense("e" + i, payer, 1 + rnd.nextInt(100_000), Split.equal(people.subList(0, 1 + rnd.nextInt(people.size()))));
            assertEquals(0, g.balances().values().stream().mapToLong(Long::longValue).sum());
        }
        List<Transfer> plan = g.suggestTransfers();
        assertTrue(plan.size() <= people.size() - 1);
        plan.forEach(t -> g.settle(t.from(), t.to(), t.amount()));
        assertTrue(g.balances().values().stream().allMatch(b -> b == 0));
    }

    @Test
    void moneyParsesAndFormatsCents() {
        assertEquals(123456, Money.parse("1234.56"));
        assertEquals("-0.05", Money.format(-5));
    }
}
```

## Concurrency

- A group is a small aggregate: its methods are `synchronized`, so two expenses added at the same time both update balances correctly. Different groups don't contend.
- If balances are stored in a database, update them in the **same transaction** as inserting the expense — or don't store them at all and compute them from expenses (they're a pure function of the history).

## Common mistakes and alternatives

- **`double` for money** — rounding drift; balances stop summing to zero.
- **Rounding each share independently** — 3 × 333.33 = 999.99; a cent disappears.
- **Pairwise debt matrices** updated on every expense — O(n²) state where net balances need O(n).
- **`if (type == EQUAL) ... else if (type == PERCENT)`** in the group — every new split type edits it.
- **Alternative:** event sourcing — store only expenses and payments, compute balances on read. Edits and deletions become new events, and the audit trail comes for free.

## Follow-up questions

````reveal title="Edit or delete an expense"
Never mutate the recorded one. Deleting records a **reversal**: the same shares with opposite signs. Editing is a reversal plus a new expense. Balances stay correct and the history explains every number.
````

````reveal title="Multiple currencies"
Store each expense in its own currency (`Money(amount, currency)`) and keep balances **per currency**. Settlement either happens per currency or converts at a rate captured at settlement time — never at the time of each expense, or balances change when rates move.
````

````reveal title="Pairwise view: 'what do I owe Ravi?'"
Keep a second structure updated by each expense: for each participant, `owes[participant][payer] += share`, then net the pair (`a→b` minus `b→a`). It's O(n²) memory per group, which is fine for groups of friends.
````

## Complexity

- `addExpense`: O(p) for p participants.
- `suggestTransfers`: O(n log n) for n members.
- Memory: O(n) balances plus the expense history.

## Interviewer checklist

- [ ] Money as integer cents; deterministic handling of leftover cents
- [ ] Split strategies with validation; factory methods
- [ ] Net balances; balances sum to zero as an invariant
- [ ] Greedy settlement with the n − 1 bound (and why not minimal)
- [ ] Immutable expenses; edits as reversals
- [ ] Property-style test over random expenses
