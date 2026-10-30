## Problem statement

Design the software for an ATM. A customer inserts a card, enters a PIN, checks their balance and withdraws cash. The machine holds a limited number of notes of each denomination, talks to the bank to verify PINs and debit accounts, and must never give out cash without debiting the account, or debit the account without giving out cash.

> [!TIP] Try it first
> List what the customer may do **at each moment** (before inserting a card, after inserting it, after the PIN). The answer is a state machine, and it decides most of the class design.

## Clarifying questions

1. Which operations: balance, withdrawal, deposit, transfer, PIN change?
2. How many wrong PIN attempts are allowed? What happens after that?
3. Which note denominations does the machine hold? Any per-withdrawal limit?
4. Who owns the account data — the ATM or the bank?
5. What if the dispenser jams after the account was debited?
6. One customer at a time?

````reveal title="Answers we'll assume"
- **Balance enquiry and cash withdrawal**. Deposit and transfer are follow-ups.
- **3 wrong PINs** and the card is retained; the session ends.
- Notes of **2000, 500, 200 and 100**; withdrawals must be a positive multiple of 100, at most **10,000** per withdrawal.
- The **bank** owns accounts and PINs; the ATM calls it through a `BankService` port. Debits carry a **transaction ID** so a retried call is applied once.
- If dispensing fails after the debit, the ATM **reverses** the debit.
- One physical customer at a time, but the ATM object is still made thread-safe (button presses and hardware callbacks arrive on different threads).
````

## Requirements

**Functional**

1. Insert a card, enter a PIN (3 attempts), check the balance, withdraw cash, eject the card.
2. Reject any operation that doesn't make sense in the current state.
3. Dispense the requested amount using the largest notes available first.
4. Debit the account exactly once per withdrawal; reverse it if the cash can't be dispensed.

**Non-functional**

5. The bank and the cash hardware sit behind interfaces (testable, replaceable).
6. Adding a new state (for example, "out of service") doesn't touch the other states.

## Step 1 — Session states

```states title="ATM session"
[*] --> IDLE
IDLE --> CARD_INSERTED : insertCard
CARD_INSERTED --> AUTHENTICATED : enterPin [correct]
CARD_INSERTED --> CARD_INSERTED : enterPin [wrong, attempts left]
CARD_INSERTED --> IDLE : 3rd wrong PIN / retain card
CARD_INSERTED --> IDLE : eject
AUTHENTICATED --> AUTHENTICATED : balance, withdraw
AUTHENTICATED --> IDLE : eject
```

````reveal title="Why the State pattern here?"
Every operation's behaviour depends on the state: `withdraw` is an error when `IDLE`, an error when `CARD_INSERTED`, and real work when `AUTHENTICATED`. Written with `if (state == ...)` checks, every method grows a switch, and adding a state means editing all of them.

With the [State pattern](lesson:state-pattern), each state is a class that implements only the operations that make sense for it; a base class rejects everything else. The `Atm` (the context) forwards every call to its current state object.
````

## Step 2 — Dispensing notes

````reveal title="Chain of Responsibility for denominations"
Each denomination is one link in a chain: the 2000 link takes as many 2000s as it can (bounded by the notes it holds) and passes the remainder to the 500 link, and so on. If anything is left when the chain ends, the amount can't be made.

The chain only **plans**; it doesn't touch the cassette. The ATM plans first, then debits the bank, then dispenses the plan. That ordering means an amount the machine can't make is rejected before any money moves.

Greedy is the standard ATM rule and is correct for "canonical" denomination sets like 2000/500/200/100 when notes are unlimited. With **limited** notes greedy can miss a solution (600 with one 500 and three 200s) — see the follow-ups.
````

## Step 3 — Class design

```uml title="ATM"
class Atm
  - state: AtmState
  - card: String
  - failedPins: int
  + insertCard(card: String): void
  + enterPin(pin: String): void
  + balance(): long
  + withdraw(amount: long): Map<Integer, Integer>
  + ejectCard(): void
abstract class AtmState
  + insertCard(atm: Atm, card: String): void
  + enterPin(atm: Atm, pin: String): void
  + balance(atm: Atm): long
  + withdraw(atm: Atm, amount: long): Map<Integer, Integer>
  + eject(atm: Atm): void
class IdleState
class CardInsertedState
class AuthenticatedState
class CashCassette
  - notes: TreeMap<Integer, Integer>
  - chain: NoteDispenser
  + plan(amount: long): Map<Integer, Integer>
  + dispense(plan: Map<Integer, Integer>): void
class NoteDispenser
  - denomination: int
  - next: NoteDispenser
  + plan(amount: long, available: Map, out: Map): long
interface BankService
  + verifyPin(card: String, pin: String): boolean
  + balance(card: String): long
  + debit(card: String, amount: long, txnId: String): void
  + reverse(txnId: String): void
Atm --> AtmState
IdleState --|> AtmState
CardInsertedState --|> AtmState
AuthenticatedState --|> AtmState
Atm *-- "1" CashCassette
CashCassette *-- "1..*" NoteDispenser
NoteDispenser --> NoteDispenser : next
Atm --> BankService
```

## Step 4 — Implementation

````hint title="Hint — order of the withdrawal steps"
1. Validate the amount (multiple of 100, within the limit).
2. **Plan** the notes (no side effects) — fail early if the machine can't make the amount.
3. **Debit** the bank with a fresh transaction ID.
4. **Dispense** the plan. If the hardware fails, **reverse** the debit with the same transaction ID.
````

````solution title="Complete Java solution"
```java title="AtmDemo.java" file="AtmDemo.java"
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

public class AtmDemo {
    public static void main(String[] args) {
        FakeBank bank = new FakeBank();
        bank.open("4000-1111", "4321", 10_000);
        bank.open("4000-2222", "1234", 800);
        bank.open("4000-3333", "0000", 5_000);
        CashCassette cassette = new CashCassette(Map.of(2000, 2, 500, 4, 200, 5, 100, 5));
        Atm atm = new Atm(bank, cassette);

        attempt(() -> atm.withdraw(500));                      // no card yet
        atm.insertCard("4000-1111");
        attempt(() -> atm.enterPin("9999"));
        atm.enterPin("4321");
        System.out.println("balance: " + atm.balance());
        System.out.println("dispensed: " + atm.withdraw(2700));
        attempt(() -> atm.withdraw(150));
        attempt(() -> atm.withdraw(12_000));
        System.out.println("balance: " + atm.balance());
        atm.ejectCard();

        atm.insertCard("4000-2222");
        atm.enterPin("1234");
        attempt(() -> atm.withdraw(1000));                     // account holds only 800
        cassette.jam(true);
        attempt(() -> atm.withdraw(500));                      // debited, jammed, reversed
        cassette.jam(false);
        System.out.println("balance after jam: " + atm.balance());
        atm.ejectCard();

        atm.insertCard("4000-3333");
        for (int i = 0; i < 3; i++) attempt(() -> atm.enterPin("1111"));
        System.out.println("state: " + atm.state() + ", retained: " + atm.retainedCards());
        System.out.println("cash left: " + cassette.snapshot());
    }

    static void attempt(Runnable action) {
        try {
            action.run();
        } catch (AtmException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
    }
}

class AtmException extends RuntimeException {
    AtmException(String message) { super(message); }
}

/** A hardware fault, as opposed to a business rule violation. */
class HardwareException extends RuntimeException {
    HardwareException(String message) { super(message); }
}

// ---------- Bank port ----------

interface BankService {
    boolean verifyPin(String card, String pin);
    long balance(String card);
    /** Idempotent per txnId: a retried debit with the same ID is applied once. */
    void debit(String card, long amount, String txnId);
    /** Idempotent: reversing twice refunds once. */
    void reverse(String txnId);
}

final class FakeBank implements BankService {
    private static final class Account {
        final String pin;
        long balance;
        Account(String pin, long balance) { this.pin = pin; this.balance = balance; }
    }
    private record Debit(String card, long amount) {}

    private final Map<String, Account> accounts = new HashMap<>();
    private final Map<String, Debit> debits = new HashMap<>();
    private final Set<String> reversed = new HashSet<>();

    synchronized void open(String card, String pin, long balance) { accounts.put(card, new Account(pin, balance)); }

    public synchronized boolean verifyPin(String card, String pin) {
        Account a = accounts.get(card);
        return a != null && a.pin.equals(pin);
    }

    public synchronized long balance(String card) { return account(card).balance; }

    public synchronized void debit(String card, long amount, String txnId) {
        if (debits.containsKey(txnId)) return;                 // retry of a debit already applied
        Account a = account(card);
        if (a.balance < amount) throw new AtmException("insufficient funds");
        a.balance -= amount;
        debits.put(txnId, new Debit(card, amount));
    }

    public synchronized void reverse(String txnId) {
        Debit d = debits.get(txnId);
        if (d != null && reversed.add(txnId)) account(d.card()).balance += d.amount();
    }

    private Account account(String card) {
        Account a = accounts.get(card);
        if (a == null) throw new AtmException("unknown card");
        return a;
    }
}

// ---------- Cash: a chain of note dispensers ----------

/** One link per denomination: takes what it can, passes the remainder on. Plans only; never mutates. */
final class NoteDispenser {
    private final int denomination;
    private final NoteDispenser next;

    NoteDispenser(int denomination, NoteDispenser next) {
        this.denomination = denomination;
        this.next = next;
    }

    /** Adds this link's notes to {@code out} and returns what is still left to pay. */
    long plan(long amount, Map<Integer, Integer> available, Map<Integer, Integer> out) {
        int notes = (int) Math.min(amount / denomination, available.getOrDefault(denomination, 0));
        if (notes > 0) out.put(denomination, notes);
        long rest = amount - (long) notes * denomination;
        return rest == 0 || next == null ? rest : next.plan(rest, available, out);
    }
}

final class CashCassette {
    private final TreeMap<Integer, Integer> notes = new TreeMap<>(Comparator.reverseOrder());
    private final NoteDispenser chain;
    private boolean jammed;

    CashCassette(Map<Integer, Integer> initial) {
        notes.putAll(initial);
        NoteDispenser link = null;
        for (int d : notes.descendingKeySet()) link = new NoteDispenser(d, link);   // smallest first, so the head is the largest note
        chain = link;
    }

    synchronized Map<Integer, Integer> plan(long amount) {
        Map<Integer, Integer> plan = new LinkedHashMap<>();
        if (chain == null || chain.plan(amount, notes, plan) != 0) {
            throw new AtmException("cannot dispense " + amount + " with the notes available");
        }
        return plan;
    }

    synchronized void dispense(Map<Integer, Integer> plan) {
        if (jammed) throw new HardwareException("cash dispenser jammed");
        plan.forEach((d, n) -> {
            if (notes.getOrDefault(d, 0) < n) throw new HardwareException("not enough " + d + " notes");
        });
        plan.forEach((d, n) -> notes.merge(d, -n, Integer::sum));   // commit only after every check passed
    }

    synchronized void jam(boolean jammed) { this.jammed = jammed; }

    synchronized Map<Integer, Integer> snapshot() { return new LinkedHashMap<>(notes); }
}

// ---------- States ----------

abstract class AtmState {
    abstract String name();

    void insertCard(Atm atm, String card) { throw reject("insert a card"); }
    void enterPin(Atm atm, String pin) { throw reject("enter a PIN"); }
    long balance(Atm atm) { throw reject("check the balance"); }
    Map<Integer, Integer> withdraw(Atm atm, long amount) { throw reject("withdraw"); }
    void eject(Atm atm) { throw reject("eject a card"); }

    private AtmException reject(String action) { return new AtmException("cannot " + action + " while " + name()); }
}

final class IdleState extends AtmState {
    String name() { return "IDLE"; }

    @Override void insertCard(Atm atm, String card) { atm.startSession(card); }
}

final class CardInsertedState extends AtmState {
    String name() { return "CARD_INSERTED"; }

    @Override void enterPin(Atm atm, String pin) {
        if (atm.bank().verifyPin(atm.card(), pin)) {
            atm.moveTo(new AuthenticatedState());
            return;
        }
        int left = atm.recordFailedPin();
        if (left == 0) {
            atm.endSession(true);
            throw new AtmException("wrong PIN; card retained");
        }
        throw new AtmException("wrong PIN; attempts left: " + left);
    }

    @Override void eject(Atm atm) { atm.endSession(false); }
}

final class AuthenticatedState extends AtmState {
    String name() { return "AUTHENTICATED"; }

    @Override long balance(Atm atm) { return atm.bank().balance(atm.card()); }

    @Override Map<Integer, Integer> withdraw(Atm atm, long amount) {
        if (amount <= 0 || amount % 100 != 0) throw new AtmException("amount must be a positive multiple of 100");
        if (amount > Atm.MAX_WITHDRAWAL) throw new AtmException("amount exceeds the per-withdrawal limit of " + Atm.MAX_WITHDRAWAL);
        Map<Integer, Integer> plan = atm.cassette().plan(amount);   // 1. can we pay it out? (no side effects)
        String txnId = atm.nextTxnId();
        atm.bank().debit(atm.card(), amount, txnId);                 // 2. the bank approves and debits
        try {
            atm.cassette().dispense(plan);                           // 3. hardware
        } catch (HardwareException e) {
            atm.bank().reverse(txnId);                               // compensation: undo the debit
            throw new AtmException(e.getMessage() + "; debit reversed");
        }
        return plan;
    }

    @Override void eject(Atm atm) { atm.endSession(false); }
}

// ---------- Context ----------

final class Atm {
    static final long MAX_WITHDRAWAL = 10_000;
    static final int MAX_PIN_ATTEMPTS = 3;

    private final BankService bank;
    private final CashCassette cassette;
    private final List<String> retained = new ArrayList<>();
    private AtmState state = new IdleState();
    private String card;
    private int failedPins;
    private long txnSeq;

    Atm(BankService bank, CashCassette cassette) {
        this.bank = bank;
        this.cassette = cassette;
    }

    // Public API: every call is forwarded to the current state.
    synchronized void insertCard(String card) { state.insertCard(this, card); }
    synchronized void enterPin(String pin) { state.enterPin(this, pin); }
    synchronized long balance() { return state.balance(this); }
    synchronized Map<Integer, Integer> withdraw(long amount) { return state.withdraw(this, amount); }
    synchronized void ejectCard() { state.eject(this); }
    synchronized String state() { return state.name(); }
    synchronized List<String> retainedCards() { return List.copyOf(retained); }

    // Used by the states (always called while the Atm lock is held).
    BankService bank() { return bank; }
    CashCassette cassette() { return cassette; }
    String card() { return card; }
    void moveTo(AtmState next) { state = next; }
    String nextTxnId() { return "ATM-" + (++txnSeq); }

    void startSession(String card) {
        this.card = card;
        failedPins = 0;
        moveTo(new CardInsertedState());
    }

    int recordFailedPin() { return MAX_PIN_ATTEMPTS - ++failedPins; }

    void endSession(boolean retainCard) {
        if (retainCard) retained.add(card);
        card = null;
        moveTo(new IdleState());
    }
}
```
````

## Design decisions

- **State objects, not flags.** `IdleState`, `CardInsertedState` and `AuthenticatedState` each override only the operations they allow; the base class turns everything else into a clear rejection ("cannot withdraw while IDLE").
- **Plan → debit → dispense.** Planning has no side effects, so impossible amounts never reach the bank. The only step that can fail after money moved is the hardware, and that is covered by a **reversal** (a compensation).
- **Transaction IDs make bank calls idempotent.** If the network drops the reply to `debit`, the ATM can retry with the same ID without double-debiting; `reverse` is idempotent too (see [Idempotency](lesson:idempotency)).
- **Two kinds of exception.** `AtmException` is a business rejection shown to the customer; `HardwareException` is a device fault that triggers compensation (see [Domain exceptions](lesson:domain-exceptions)).
- **The bank is a port.** The ATM never stores balances or PINs; `BankService` hides the network protocol and lets tests use `FakeBank`.

## Patterns and principles

[State](lesson:state-pattern) (`AtmState` and its subclasses), [Chain of Responsibility](lesson:chain-of-responsibility) (`NoteDispenser`), [ports and adapters](lesson:dependency-inversion) (`BankService`), [domain exceptions](lesson:domain-exceptions), and an [open/closed](lesson:open-closed) state set: an `OutOfServiceState` is one new class.

## Example execution flow

```text
Customer        Atm (state)            CashCassette          BankService
insertCard  ->  IDLE -> CARD_INSERTED
enterPin    ->  verifyPin ------------------------------------> true
                CARD_INSERTED -> AUTHENTICATED
withdraw 2700-> plan(2700) ---------> {2000x1, 500x1, 200x1}
                debit(card, 2700, ATM-1) ---------------------> ok
                dispense(plan) ------> notes removed
withdraw 500 (card 2, jammed):
                plan ok -> debit ok -> dispense throws HardwareException
                reverse(ATM-3) -------------------------------> refunded
```

```text title="Program output"
Rejected: cannot withdraw while IDLE
Rejected: wrong PIN; attempts left: 2
balance: 10000
dispensed: {2000=1, 500=1, 200=1}
Rejected: amount must be a positive multiple of 100
Rejected: amount exceeds the per-withdrawal limit of 10000
balance: 7300
Rejected: insufficient funds
Rejected: cash dispenser jammed; debit reversed
balance after jam: 800
Rejected: wrong PIN; attempts left: 2
Rejected: wrong PIN; attempts left: 1
Rejected: wrong PIN; card retained
state: IDLE, retained: [4000-3333]
cash left: {2000=1, 500=3, 200=4, 100=5}
```

## Edge cases

- **Operation in the wrong state** (withdraw before the PIN, a second card) → rejected by the state.
- **Amount not a multiple of 100, zero or negative, above the limit** → rejected before planning.
- **Amount the machine can't make** with the notes it has → rejected before debiting.
- **Insufficient funds** → the bank rejects; nothing is dispensed.
- **Dispenser jams after the debit** → the debit is reversed with the same transaction ID.
- **Third wrong PIN** → card retained, session ends, the state returns to `IDLE`.

## Tests

```java title="AtmTest.java" file="AtmTest.java" test="AtmDemo.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class AtmTest {
    private FakeBank bank;
    private CashCassette cassette;
    private Atm atm;

    @BeforeEach
    void setUp() {
        bank = new FakeBank();
        bank.open("C1", "1111", 5_000);
        cassette = new CashCassette(Map.of(500, 10, 100, 10));
        atm = new Atm(bank, cassette);
    }

    private void login() {
        atm.insertCard("C1");
        atm.enterPin("1111");
    }

    @Test
    void withdrawalUsesLargestNotesFirstAndDebitsOnce() {
        login();
        assertEquals(Map.of(500, 2, 100, 3), atm.withdraw(1300));
        assertEquals(3_700, atm.balance());
        assertEquals(Map.of(500, 8, 100, 7), cassette.snapshot());
    }

    @Test
    void operationsInTheWrongStateAreRejected() {
        assertThrows(AtmException.class, () -> atm.enterPin("1111"));
        atm.insertCard("C1");
        assertThrows(AtmException.class, () -> atm.withdraw(100));
        assertThrows(AtmException.class, () -> atm.insertCard("C2"));
    }

    @Test
    void thirdWrongPinRetainsTheCard() {
        atm.insertCard("C1");
        for (int i = 0; i < 3; i++) assertThrows(AtmException.class, () -> atm.enterPin("0000"));
        assertEquals("IDLE", atm.state());
        assertEquals(List.of("C1"), atm.retainedCards());
    }

    @Test
    void amountTheCassetteCannotMakeIsRejectedBeforeDebiting() {
        Atm only500s = new Atm(bank, new CashCassette(Map.of(500, 10)));
        only500s.insertCard("C1");
        only500s.enterPin("1111");
        assertThrows(AtmException.class, () -> only500s.withdraw(300));
        assertEquals(5_000, bank.balance("C1"));
    }

    @Test
    void jammedDispenserReversesTheDebit() {
        login();
        cassette.jam(true);
        assertThrows(AtmException.class, () -> atm.withdraw(1000));
        assertEquals(5_000, atm.balance());
        assertEquals(Map.of(500, 10, 100, 10), cassette.snapshot());
    }

    @Test
    void bankCallsAreIdempotentPerTransactionId() {
        bank.debit("C1", 1000, "T1");
        bank.debit("C1", 1000, "T1");
        assertEquals(4_000, bank.balance("C1"));
        bank.reverse("T1");
        bank.reverse("T1");
        assertEquals(5_000, bank.balance("C1"));
    }
}
```

## Concurrency

- **One customer, several threads.** Key presses, card-reader events and hardware callbacks can arrive on different threads, so every public `Atm` method is `synchronized`; the states run while that lock is held.
- **The bank is shared by every ATM.** Its debit must be atomic per account (a database transaction or a conditional `UPDATE ... SET balance = balance - ? WHERE id = ? AND balance >= ?`).
- **Lost replies.** A timeout on `debit` doesn't tell you whether it happened. Retrying with the same transaction ID is safe; inventing a new ID is how customers get debited twice.

## Common mistakes and alternatives

- **A giant `switch (state)` in every method** — works, but every new state touches every method.
- **Debiting before checking the cassette** — the customer is charged for cash the machine can't produce.
- **No compensation path** — a jam after the debit silently takes the customer's money.
- **Storing balances in the ATM** — the bank owns account state; the ATM keeps no copy of it.
- **Alternative:** an enum-based state machine (a transition table) is fine when the states have no behaviour of their own; the State pattern pays off once each state has real logic.

## Follow-up questions

````reveal title="Limited notes make greedy fail — how do you fix it?"
With one 500 and three 200s, greedy takes the 500 and is stuck with 100. Replace the greedy chain's planning with a small search: a bounded DP over denominations (amount ≤ 10,000 in steps of 100 means at most 100 states), or backtracking that tries one fewer of the larger note. Keep the same `plan`/`dispense` split, so the change is local to `CashCassette`.
````

````reveal title="Add deposits"
A deposit needs new hardware (a note acceptor) and a new step: notes are counted and held in escrow; the customer confirms; only then the bank is credited and the notes move to the cassette. That's two more states (`COUNTING`, `AWAITING_CONFIRMATION`) — new classes, no edits to the existing states.
````

````reveal title="Out of service and low cash"
An `OutOfServiceState` rejects `insertCard`. The cassette publishes a "low cash" event when any denomination falls below a threshold, and the ATM moves to `OutOfServiceState` when it can no longer make the minimum withdrawal.
````

## Complexity

- Planning a withdrawal: O(d) for d denominations (one pass down the chain).
- Every other operation: O(1) plus the bank call.

## Interviewer checklist

- [ ] Session state machine drawn before classes
- [ ] State pattern (or a justified transition table)
- [ ] Note dispensing as a chain, planned before any side effects
- [ ] Bank behind an interface; idempotent debit with a transaction ID
- [ ] Compensation when hardware fails after the debit
- [ ] PIN attempt limit and card retention
