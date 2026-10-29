## Problem statement

Design the software for a vending machine. Customers insert coins, select a product, and receive the product plus change. They can cancel and get their money back. An operator restocks products and collects cash.

> [!TIP] Try it first
> Write your clarifying questions and a state diagram before revealing anything. Vending machines are the classic [state machine](lesson:state-machines) interview problem.

## Clarifying questions

1. Which coins and notes are accepted? Card payments?
2. Can the customer insert money before or after selecting?
3. Does the machine give change? What if it can't make exact change?
4. One item per transaction?
5. What happens when a product is sold out?
6. What can the operator do, and can they do it mid-transaction?

````reveal title="Answers we'll assume"
- Coins: **1, 2, 5, 10 and 20** (rupees). No cards (but card payments are a likely follow-up).
- Flow: **insert money first, then select**. Customers can insert several coins.
- The machine **gives change from its cash box**. If it **can't make exact change**, it **rejects the sale and keeps the customer's money in the transaction** so they can pick something else or cancel.
- **One item** per selection; the transaction ends after a successful dispense.
- Sold out → reject the selection; the money stays inserted.
- The operator can restock and collect cash only in **maintenance mode**, which can only be entered when no customer transaction is in progress.
````

## Requirements

**Functional**

1. Insert coins (accumulate a balance for the current transaction).
2. Select a product by slot code: dispense it and return change if the balance is sufficient, the product is in stock, and change can be made.
3. Cancel: return exactly the inserted coins.
4. Operator: enter/exit maintenance, restock a slot, collect cash.

**Non-functional**

5. Never lose or invent money: coins in = product price + change out + cash kept.
6. Change-making must succeed whenever it's possible with the coins actually in the cash box.
7. The change algorithm should be swappable.

**Out of scope:** card payments, remote telemetry, multiple machines.

## Step 1 — States and entities

Draw the lifecycle before anything else. Which operations are valid in each state?

````reveal title="State diagram"
```states title="Vending machine"
[*] --> IDLE
IDLE --> HAS_MONEY : insertCoin
HAS_MONEY --> HAS_MONEY : insertCoin
HAS_MONEY --> IDLE : select [in stock, paid >= price, change possible] / dispense + change
HAS_MONEY --> HAS_MONEY : select [any check fails] / show error, keep balance
HAS_MONEY --> IDLE : cancel / refund inserted coins
IDLE --> MAINTENANCE : enterMaintenance
MAINTENANCE --> IDLE : exitMaintenance
```

Note that **"select fails"** is a self-transition: the money stays, so the customer can choose again or cancel. Maintenance can only be entered from `IDLE`.
````

````reveal title="Entities"
| Entity | Kind | Responsibility |
|---|---|---|
| `VendingMachine` | Context / facade | State, the current transaction, the operations |
| `Slot` | Entity | Product, price and quantity; "take one" rule |
| `Product` | Value (record) | Name |
| `Coin` | Enum | Denominations and values |
| `CashBox` | Entity | Coin counts; add/remove coins atomically |
| `ChangeMaker` | Strategy interface | Computes which coins to return, given availability |
| `MachineState` | Enum | IDLE, HAS_MONEY, MAINTENANCE |
````

## Step 2 — The tricky part: making change

Try to answer this before opening: with **5 × 1 coin** and **3 × 2 coins** in the box, how do you return change of 6? What does a greedy algorithm do?

````reveal title="Why greedy is not enough"
Greedy takes the largest coin first: 5, then needs 1 more, and there are no 1s, so it **fails** — but 2 + 2 + 2 = 6 works. With **limited coin counts**, greedy can fail even for "nice" coin systems. A small **bounded dynamic program** over amounts (at most the largest possible change, which is small for a vending machine) finds the minimum-coin solution whenever one exists. We keep it behind a `ChangeMaker` interface, so a faster greedy version can be used where it's provably safe.
````

## Step 3 — Class design

```uml title="Vending machine"
class VendingMachine
  - state: MachineState
  - slots: Map<String, Slot>
  - inserted: EnumMap<Coin, Integer>
  - cashBox: CashBox
  - changeMaker: ChangeMaker
  + insert(c: Coin): void
  + select(code: String): Purchase
  + cancel(): Map<Coin, Integer>
  + enterMaintenance(): void
  + restock(code: String, p: Product, price: int, qty: int): void
class Slot
  - product: Product
  - price: int
  - quantity: int
  + isAvailable(): boolean
  + takeOne(): Product
class CashBox
  - coins: EnumMap<Coin, Integer>
  + add(coins: Map<Coin, Integer>): void
  + remove(coins: Map<Coin, Integer>): void
interface ChangeMaker
  + makeChange(amount: int, available: Map<Coin, Integer>): Optional<Map<Coin, Integer>>
class BoundedDpChangeMaker
enum MachineState
  IDLE
  HAS_MONEY
  MAINTENANCE
VendingMachine *-- "1..*" Slot
VendingMachine *-- "1" CashBox
VendingMachine --> ChangeMaker : strategy
BoundedDpChangeMaker ..|> ChangeMaker
```

**Key decision — when do inserted coins enter the cash box?** On a successful sale, the inserted coins are added to the box *before* computing change, so they can be used as change (inserting a 20 for a 15 item can be answered with the customer's own 5 if they inserted one). If no change can be made, nothing is committed.

## Step 4 — Implementation

````hint title="Hint — keep money conserved"
Write the select flow as **check everything, then commit**: (1) slot exists and is in stock; (2) balance ≥ price; (3) compute change from *box + inserted* coins; only then (4) move the inserted coins into the box, remove the change, take the product, and reset the transaction.
````

````solution title="Complete Java solution"
```java title="VendingMachineDemo.java" file="VendingMachineDemo.java"
import java.util.EnumMap;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

public class VendingMachineDemo {
    public static void main(String[] args) {
        VendingMachine vm = new VendingMachine(new BoundedDpChangeMaker());
        vm.enterMaintenance();
        vm.restock("A1", new Product("Chips"), 15, 2);
        vm.restock("B2", new Product("Soda"), 25, 1);
        vm.loadCoins(Map.of(Coin.FIVE, 1, Coin.TWO, 3));     // float for change
        vm.exitMaintenance();

        vm.insert(Coin.TWENTY);
        System.out.println(vm.select("A1"));                    // change 5

        vm.insert(Coin.TWENTY);
        vm.insert(Coin.TEN);
        try {
            vm.select("B2");                                     // needs change of 5: the box has 2,2,2 only
        } catch (VendingException e) {
            System.out.println("Rejected: " + e.getMessage() + " (balance kept: " + vm.balance() + ")");
        }
        System.out.println("Refund: " + vm.cancel());

        vm.enterMaintenance();
        vm.loadCoins(Map.of(Coin.ONE, 1));                       // operator tops up small change
        vm.exitMaintenance();
        vm.insert(Coin.TWENTY);
        System.out.println(vm.select("A1"));                    // change 5 = 2 + 2 + 1
        System.out.println("Box: " + vm.cashSnapshot());
    }
}

enum Coin {
    ONE(1), TWO(2), FIVE(5), TEN(10), TWENTY(20);
    final int value;
    Coin(int value) { this.value = value; }
}

record Product(String name) {}

record Purchase(Product product, Map<Coin, Integer> change) {
    int changeTotal() { return change.entrySet().stream().mapToInt(e -> e.getKey().value * e.getValue()).sum(); }
    @Override public String toString() { return "Dispensed " + product.name() + ", change " + changeTotal() + " " + change; }
}

enum MachineState { IDLE, HAS_MONEY, MAINTENANCE }

class VendingException extends RuntimeException {
    VendingException(String message) { super(message); }
}

final class Slot {
    private Product product;
    private int price;
    private int quantity;

    Slot(Product product, int price, int quantity) { restock(product, price, quantity); }

    void restock(Product product, int price, int quantity) {
        if (price <= 0 || quantity < 0) throw new IllegalArgumentException("invalid slot config");
        this.product = product;
        this.price = price;
        this.quantity = quantity;
    }

    boolean isAvailable() { return quantity > 0; }
    int price() { return price; }
    Product product() { return product; }

    Product takeOne() {
        if (quantity == 0) throw new IllegalStateException("sold out");
        quantity--;
        return product;
    }
}

final class CashBox {
    private final EnumMap<Coin, Integer> coins = new EnumMap<>(Coin.class);

    void add(Map<Coin, Integer> more) { more.forEach((c, n) -> coins.merge(c, n, Integer::sum)); }

    void remove(Map<Coin, Integer> out) {
        out.forEach((c, n) -> {
            int have = coins.getOrDefault(c, 0);
            if (have < n) throw new IllegalStateException("cash box short of " + c);
            if (have == n) coins.remove(c); else coins.put(c, have - n);
        });
    }

    Map<Coin, Integer> snapshot() { return new EnumMap<>(coins); }

    Map<Coin, Integer> emptyAll() {
        Map<Coin, Integer> all = snapshot();
        coins.clear();
        return all;
    }
}

interface ChangeMaker {
    /** Coins summing exactly to amount using at most the available counts, or empty if impossible. */
    Optional<Map<Coin, Integer>> makeChange(int amount, Map<Coin, Integer> available);
}

/** Bounded change-making: minimum number of coins, respecting how many of each coin exist. */
final class BoundedDpChangeMaker implements ChangeMaker {
    @Override
    public Optional<Map<Coin, Integer>> makeChange(int amount, Map<Coin, Integer> available) {
        if (amount < 0) throw new IllegalArgumentException("negative change");
        // best[a] = fewest coins to make a; using[a] = counts used for that solution
        int[] best = new int[amount + 1];
        @SuppressWarnings("unchecked")
        Map<Coin, Integer>[] using = new Map[amount + 1];
        java.util.Arrays.fill(best, Integer.MAX_VALUE);
        best[0] = 0;
        using[0] = new EnumMap<>(Coin.class);
        for (int a = 1; a <= amount; a++) {
            for (Coin c : Coin.values()) {
                int prev = a - c.value;
                if (prev < 0 || best[prev] == Integer.MAX_VALUE) continue;
                int alreadyUsed = using[prev].getOrDefault(c, 0);
                if (alreadyUsed >= available.getOrDefault(c, 0)) continue;   // no more of this coin
                if (best[prev] + 1 < best[a]) {
                    best[a] = best[prev] + 1;
                    Map<Coin, Integer> counts = new EnumMap<>(using[prev]);
                    counts.merge(c, 1, Integer::sum);
                    using[a] = counts;
                }
            }
        }
        return best[amount] == Integer.MAX_VALUE ? Optional.empty() : Optional.of(using[amount]);
    }
}

final class VendingMachine {
    private final Map<String, Slot> slots = new HashMap<>();
    private final CashBox cashBox = new CashBox();
    private final ChangeMaker changeMaker;
    private final EnumMap<Coin, Integer> inserted = new EnumMap<>(Coin.class);
    private MachineState state = MachineState.IDLE;

    VendingMachine(ChangeMaker changeMaker) { this.changeMaker = changeMaker; }

    // ---------- Customer operations ----------

    synchronized void insert(Coin coin) {
        if (state == MachineState.MAINTENANCE) throw new VendingException("machine in maintenance");
        inserted.merge(coin, 1, Integer::sum);
        state = MachineState.HAS_MONEY;
    }

    synchronized Purchase select(String code) {
        if (state != MachineState.HAS_MONEY) throw new VendingException("insert money first");
        Slot slot = slots.get(code);
        if (slot == null) throw new VendingException("no slot " + code);
        if (!slot.isAvailable()) throw new VendingException(slot.product().name() + " is sold out");
        int balance = balance();
        if (balance < slot.price()) throw new VendingException("insert " + (slot.price() - balance) + " more");

        // Change may use the customer's own coins too, so compute it from box + inserted.
        Map<Coin, Integer> pool = cashBox.snapshot();
        inserted.forEach((c, n) -> pool.merge(c, n, Integer::sum));
        Map<Coin, Integer> change = changeMaker.makeChange(balance - slot.price(), pool)
                .orElseThrow(() -> new VendingException("cannot make change of " + (balance - slot.price())));

        // Commit: every check passed.
        cashBox.add(inserted);
        cashBox.remove(change);
        Product product = slot.takeOne();
        inserted.clear();
        state = MachineState.IDLE;
        return new Purchase(product, change);
    }

    synchronized Map<Coin, Integer> cancel() {
        if (state != MachineState.HAS_MONEY) return Map.of();
        Map<Coin, Integer> refund = new EnumMap<>(inserted);   // exactly the coins inserted
        inserted.clear();
        state = MachineState.IDLE;
        return refund;
    }

    synchronized int balance() {
        return inserted.entrySet().stream().mapToInt(e -> e.getKey().value * e.getValue()).sum();
    }

    // ---------- Operator operations ----------

    synchronized void enterMaintenance() {
        if (state != MachineState.IDLE) throw new VendingException("transaction in progress");
        state = MachineState.MAINTENANCE;
    }

    synchronized void exitMaintenance() {
        requireMaintenance();
        state = MachineState.IDLE;
    }

    synchronized void restock(String code, Product product, int price, int quantity) {
        requireMaintenance();
        slots.computeIfAbsent(code, k -> new Slot(product, price, 0)).restock(product, price, quantity);
    }

    synchronized void loadCoins(Map<Coin, Integer> coins) {
        requireMaintenance();
        cashBox.add(coins);
    }

    synchronized Map<Coin, Integer> collectCash() {
        requireMaintenance();
        return cashBox.emptyAll();
    }

    synchronized Map<Coin, Integer> cashSnapshot() { return cashBox.snapshot(); }

    synchronized MachineState state() { return state; }

    private void requireMaintenance() {
        if (state != MachineState.MAINTENANCE) throw new VendingException("operator actions need maintenance mode");
    }
}
```
````

## Design decisions

- **Enum states plus guard clauses** rather than the full [State pattern](lesson:state-pattern): there are only three states, and most operations are simply allowed or not. If states gained rich behaviour (card payment states, error recovery), switching to State classes would be a local refactor.
- **Check everything, then commit** in `select`: no partial updates if change can't be made.
- **Change can use the customer's inserted coins**, which increases the chance of a sale.
- **Exact-coin refunds** on cancel: the customer gets back precisely what they inserted, which is also what real machines do.
- **`ChangeMaker` is a strategy**, so a greedy implementation can be used for canonical coin systems with plenty of each coin.

## Patterns and principles

[State machine](lesson:state-machines) (enum), [Strategy](lesson:strategy) (`ChangeMaker`), [encapsulation](lesson:four-pillars) (`Slot.takeOne`, `CashBox.remove` guard their own rules), [fail-fast validation](lesson:exception-handling), and value objects (`Purchase`, `Product`).

## Example execution flow

```text
maintenance: restock A1 Chips@15 x2, B2 Soda@25 x1; float {FIVE=1, TWO=3}
insert 20 ; select A1    change 5 from pool {5x1, 2x3, 20x1}  -> {FIVE=1}        box {TWO=3, TWENTY=1}
insert 20, 10 ; select B2 (25)  change 5 from pool {2x3, 20x2, 10x1} -> impossible -> rejected, balance 30 kept
cancel                   refund exactly {TEN=1, TWENTY=1}
maintenance: load {ONE=1}
insert 20 ; select A1    change 5 from pool {1x1, 2x3, 20x2}  -> {ONE=1, TWO=2}  (greedy would have failed: no 5 left)
```

Program output:

```text
Dispensed Chips, change 5 {FIVE=1}
Rejected: cannot make change of 5 (balance kept: 30)
Refund: {TEN=1, TWENTY=1}
Dispensed Chips, change 5 {ONE=1, TWO=2}
Box: {TWO=1, TWENTY=2}
```

## Edge cases

- **Exact payment**: change 0 → an empty change map, always possible.
- **Overpayment where only an unusual coin combination works** (6 = 2+2+2 when a 5 exists) — the DP handles it; greedy wouldn't.
- **Sold out after the money is inserted**: selection rejected, balance kept.
- **Cancel with nothing inserted**: returns an empty refund (idempotent).
- **Operator tries maintenance mid-transaction**: rejected.
- **Unknown slot code**: rejected without changing state.

## Tests

```java title="VendingMachineTest.java" file="VendingMachineTest.java" test="VendingMachineDemo.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class VendingMachineTest {
    private VendingMachine vm;

    @BeforeEach
    void setUp() {
        vm = new VendingMachine(new BoundedDpChangeMaker());
        vm.enterMaintenance();
        vm.restock("A1", new Product("Chips"), 15, 1);
        vm.loadCoins(Map.of(Coin.ONE, 1, Coin.TWO, 2));
        vm.exitMaintenance();
    }

    @Test
    void dispensesWithMinimumCoinChange() {
        vm.insert(Coin.TWENTY);
        Purchase p = vm.select("A1");
        assertEquals("Chips", p.product().name());
        assertEquals(5, p.changeTotal());
        assertEquals(Map.of(Coin.ONE, 1, Coin.TWO, 2), p.change());   // 2+2+1
        assertEquals(MachineState.IDLE, vm.state());
    }

    @Test
    void boundedDpFindsChangeThatGreedyMisses() {
        Optional<Map<Coin, Integer>> change = new BoundedDpChangeMaker().makeChange(6, Map.of(Coin.FIVE, 1, Coin.TWO, 3));
        assertEquals(Map.of(Coin.TWO, 3), change.orElseThrow());
    }

    @Test
    void rejectsWhenChangeImpossibleAndKeepsEverythingUnchanged() {
        VendingMachine noFloat = new VendingMachine(new BoundedDpChangeMaker());
        noFloat.enterMaintenance();
        noFloat.restock("A1", new Product("Chips"), 15, 1);
        noFloat.exitMaintenance();
        noFloat.insert(Coin.TWENTY);
        assertThrows(VendingException.class, () -> noFloat.select("A1"));
        assertEquals(20, noFloat.balance());
        assertEquals(Map.of(Coin.TWENTY, 1), noFloat.cancel());
        assertTrue(noFloat.cashSnapshot().isEmpty());
    }

    @Test
    void insufficientFundsKeepsBalance() {
        vm.insert(Coin.TEN);
        assertThrows(VendingException.class, () -> vm.select("A1"));
        assertEquals(10, vm.balance());
    }

    @Test
    void soldOutIsRejected() {
        vm.insert(Coin.TWENTY);
        vm.select("A1");
        vm.insert(Coin.TWENTY);
        assertThrows(VendingException.class, () -> vm.select("A1"));
    }

    @Test
    void cancelReturnsExactCoinsAndIsIdempotent() {
        vm.insert(Coin.TEN);
        vm.insert(Coin.TWO);
        assertEquals(Map.of(Coin.TEN, 1, Coin.TWO, 1), vm.cancel());
        assertEquals(Map.of(), vm.cancel());
    }

    @Test
    void maintenanceCannotStartMidTransaction() {
        vm.insert(Coin.FIVE);
        assertThrows(VendingException.class, vm::enterMaintenance);
    }

    @Test
    void moneyIsConserved() {
        vm.insert(Coin.TWENTY);
        vm.select("A1");
        int boxTotal = vm.cashSnapshot().entrySet().stream().mapToInt(e -> e.getKey().value * e.getValue()).sum();
        assertEquals(5 + 20 - 5, boxTotal);   // initial float + inserted - change
    }
}
```

## Concurrency

A physical machine has one customer at a time, so concurrency is mostly about **operator vs customer** and **sensor events**. All public methods are `synchronized` on the machine: cheap, and it makes every operation atomic. A networked fleet would add remote commands (price updates, stock queries) — still fine with one lock per machine.

## Common mistakes and alternatives

- **Greedy change-making** without considering limited coin counts.
- **Refunding a computed amount** instead of the actual coins inserted.
- **Taking the product before verifying change**, so the machine gives away items when change fails.
- **Boolean flags** (`hasMoney`, `inMaintenance`) instead of one state.
- **Alternative:** the [State pattern](lesson:state-pattern) with `IdleState`, `HasMoneyState` and `MaintenanceState` classes. Worth it if each state grows behaviour (card authorisation, error recovery, timeouts).

## Follow-up questions

````reveal title="Add card payments"
Introduce a `PaymentMethod` abstraction: the coin flow becomes `CashPayment`, and `CardPayment` authorises via a `CardTerminal` interface (an adapter over the reader's SDK). Card payments need extra states (`AUTHORISING`, `DISPENSING`) and a failure path (authorised but dispense failed → reverse authorisation). This is where the State pattern starts paying off.
````

````reveal title="Dispense failures (the motor jams)"
Add a `Dispenser` interface returning success or failure. If dispensing fails after the change was computed, **don't commit**: keep the balance (or refund), mark the slot faulty, and emit an alert event. Ordering matters — commit money only after the product is confirmed dispensed.
````

````reveal title="Remote monitoring"
Publish events (`SaleCompleted`, `LowStock`, `CashBoxLow`) through an [Observer](lesson:observer) interface. A telemetry adapter subscribes and forwards them. The machine's logic doesn't change.
````

## Complexity

- `select`: O(A × C) for the DP, where A is the change amount (≤ the highest note value) and C the number of coin types — tiny.
- `insert`, `cancel`: O(C).

## Interviewer checklist

- [ ] State diagram drawn; operations guarded by state
- [ ] Money conservation reasoned about (check-then-commit)
- [ ] Change-making correctness with limited coins (DP, or a justified greedy)
- [ ] Exact-coin refunds on cancel
- [ ] Sold out, insufficient funds and no-change paths handled
- [ ] Operator actions restricted to maintenance mode
- [ ] Change algorithm behind an interface; card payments discussed as an extension
