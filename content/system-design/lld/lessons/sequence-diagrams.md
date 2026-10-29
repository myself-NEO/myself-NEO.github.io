## Structure vs behaviour

A class diagram shows **what exists**. A **sequence diagram** shows **what happens**: which objects talk to each other, in what order, for **one scenario**. It's the best tool for **validating** a class design. Walking a real scenario through your classes quickly exposes missing methods, misplaced responsibilities and awkward call chains.

## The notation

```text
 Customer        :Atm          :CardReader        :Bank         :CashDispenser
    │              │                │               │                 │
    │ insertCard() │                │               │                 │
    │─────────────▶│  readCard()    │               │                 │
    │              │───────────────▶│               │                 │
    │              │◀─ ─ ─ cardNo ─ ┤               │                 │
    │ enterPin(pin)│                │               │                 │
    │─────────────▶│  verify(cardNo, pin)           │                 │
    │              │───────────────────────────────▶│                 │
    │              │◀─ ─ ─ ─ ─ ─ ─ ─ ─ session ─ ─ ─┤                 │
    │ withdraw(500)│                                │                 │
    │─────────────▶│  debit(session, 500)           │                 │
    │              │───────────────────────────────▶│                 │
    │              │◀─ ─ ─ ─ ─ ─ ─ ─ ─ ─ approved ─ ┤                 │
    │              │  dispense(500)                                   │
    │              │─────────────────────────────────────────────────▶│
    │◀─ ─ cash ─ ─ ┤                                                  │
```

| Element | Meaning |
|---|---|
| **Lifeline** — `:Atm` with a vertical line | An object participating over time (`name:Type`, or just `:Type`) |
| **Solid arrow** | A message (method call), labelled with the method and its arguments |
| **Dashed arrow** | A return value |
| **Activation bar** (thin rectangle on a lifeline) | The object is busy executing |
| **Fragment** (box labelled `alt`, `opt`, `loop`) | Conditional, optional or repeated sections |

```text
    ┌─ alt ─────────────────────────────────────────────┐
    │ [approved]                                         │
    │   :Atm ──dispense(500)──▶ :CashDispenser           │
    ├────────────────────────────────────────────────────┤
    │ [declined]                                         │
    │   :Atm ──showError("insufficient funds")──▶ screen │
    └────────────────────────────────────────────────────┘
```

## Using a sequence diagram to find design problems

Draw the scenario against your current classes and look for:

- **Missing methods.** You need `bank.debit(...)` but `Bank` only has `balance()`.
- **Wrong ownership.** `Atm` asks `CashDispenser` for its note counts and computes the denominations itself — feature envy. The dispenser should do that: `dispenser.dispense(amount)`.
- **Long chains.** A message hops through four objects to reach the one that does the work. Is there a missing direct collaboration?
- **God lifelines.** One lifeline sends every message and does all the work. Responsibilities aren't distributed.
- **Ordering bugs.** Debiting the bank *before* checking the machine has enough cash means a reversal is needed when dispensing fails.

The last point is a real design decision the diagram surfaces: check `dispenser.canDispense(amount)` **before** `bank.debit(...)`.

## From diagram to code

Each arrow from `:Atm` becomes a line inside one of its methods:

```java title="The withdraw scenario in code" file="AtmSequenceDemo.java"
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.Map;

public class AtmSequenceDemo {
    public static void main(String[] args) {
        CashDispenser dispenser = new CashDispenser(Map.of(Note.FIVE_HUNDRED, 2, Note.HUNDRED, 5));
        Bank bank = new FakeBank(1_200);
        Atm atm = new Atm(bank, dispenser);

        atm.start("CARD-9", "4321");
        System.out.println("Dispensed " + atm.withdraw(700));
        try {
            atm.withdraw(800);   // notes are available, but bank balance is now 500 -> declined
        } catch (IllegalStateException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
    }
}

enum Note {
    FIVE_HUNDRED(500), HUNDRED(100);
    final int value;
    Note(int value) { this.value = value; }
}

interface Bank {
    String verify(String card, String pin);           // returns a session id
    boolean debit(String session, long amount);
}

class FakeBank implements Bank {
    private long balance;
    FakeBank(long balance) { this.balance = balance; }
    public String verify(String card, String pin) { return "S-" + card; }
    public boolean debit(String session, long amount) {
        if (amount > balance) return false;
        balance -= amount;
        return true;
    }
}

class CashDispenser {
    private final Map<Note, Integer> notes = new EnumMap<>(Note.class);
    CashDispenser(Map<Note, Integer> initial) { notes.putAll(initial); }

    /** Greedy plan; empty map if the amount can't be made. */
    Map<Note, Integer> plan(long amount) {
        Map<Note, Integer> plan = new LinkedHashMap<>();
        long remaining = amount;
        for (Note n : Note.values()) {
            int use = (int) Math.min(remaining / n.value, notes.getOrDefault(n, 0));
            if (use > 0) { plan.put(n, use); remaining -= (long) use * n.value; }
        }
        return remaining == 0 ? plan : Map.of();
    }

    void dispense(Map<Note, Integer> plan) {
        plan.forEach((n, count) -> notes.merge(n, -count, Integer::sum));
    }
}

class Atm {
    private final Bank bank;
    private final CashDispenser dispenser;
    private String session;

    Atm(Bank bank, CashDispenser dispenser) { this.bank = bank; this.dispenser = dispenser; }

    void start(String card, String pin) { session = bank.verify(card, pin); }   // arrow: verify(cardNo, pin)

    Map<Note, Integer> withdraw(long amount) {
        if (session == null) throw new IllegalStateException("no session");
        Map<Note, Integer> plan = dispenser.plan(amount);                          // check cash FIRST
        if (plan.isEmpty()) throw new IllegalStateException("cannot dispense " + amount);
        if (!bank.debit(session, amount)) throw new IllegalStateException("insufficient funds");  // arrow: debit()
        dispenser.dispense(plan);                                                  // arrow: dispense()
        return plan;
    }
}
```

The order of operations in `withdraw` — plan, then debit, then dispense — came straight from reasoning about the diagram.

## How much detail?

- Draw **one or two key scenarios** — usually the main success path of the core use case, plus the trickiest alternative.
- Show only **important** objects; skip trivial getters.
- Plain text arrows on a whiteboard (`Atm -> Bank: debit(500)`) are perfectly acceptable.

## Real-world example

A team's checkout occasionally charged customers for out-of-stock items. A sequence diagram of the checkout flow showed `PaymentService.charge()` happening *before* `Inventory.reserve()`. Swapping the order — reserve, then charge, then confirm, with a release on payment failure — fixed it. Nobody had spotted it in the code, which was spread across three services.

## Common mistakes

- Trying to draw **every** scenario.
- Mixing **multiple scenarios** in one diagram without fragments, which gets confusing.
- Messages that **don't exist** as methods in your class design (or vice versa) — keep them consistent.
- Drawing the **implementation** of trivial methods instead of collaborations.

## In the interview

> [!INTERVIEW] Walk a scenario
> After the class design, say: *"Let me walk through a withdrawal to validate this."* Then trace calls aloud or sketch arrows. Interviewers love this step because it checks your design actually works, and it often reveals a fix you can make before coding.

## Key takeaways

- Sequence diagrams show **collaboration over time** for one scenario.
- Use them to **validate** designs: missing methods, wrong ownership, bad ordering.
- Each outgoing arrow becomes a line in the sender's method.
- Draw one or two key scenarios, in lightweight notation.

## Knowledge check

```quiz
? A sequence diagram shows Atm calling bank.debit() before checking the dispenser has enough notes. What's the problem?
+ If dispensing fails, the customer was debited and a compensating reversal is needed; check cash first
- Nothing; the order doesn't matter
- Sequence diagrams can't show ordering
> Ordering side effects carefully avoids compensating actions.

? What does a dashed arrow usually represent?
- An asynchronous error
+ A return value
- Inheritance
> Solid arrows are calls; dashed arrows are returns.

? Which observation suggests feature envy in a sequence diagram?
- One object calls another once
+ Atm repeatedly asks CashDispenser for note counts and computes the plan itself
- A lifeline has an activation bar
> The logic belongs with the data; CashDispenser should compute its own plan.
```

## Exercise

Draw a sequence diagram for **"User books two seats for a movie show"**, with lifelines `User`, `BookingService`, `Show`, `ShowSeat`, `PaymentGateway` and `BookingRepository`. Include an `alt` fragment for payment failure. Then list the methods each class needs.

````hint title="Hint"
Seats should be held before payment and released if payment fails. Which object owns the hold rule?
````

````solution title="Sample answer"
```text
User → BookingService: book(showId, [A1, A2], card)
BookingService → Show: holdSeats([A1, A2], user, ttl)
  Show → ShowSeat(A1): hold(user, until)
  Show → ShowSeat(A2): hold(user, until)      (if any hold fails → release the others, throw SeatUnavailable)
BookingService → PaymentGateway: charge(card, amount)
alt [payment ok]
  BookingService → Show: confirmSeats([A1, A2], user)
  BookingService → BookingRepository: save(booking)
  BookingService → User: booking
else [payment failed]
  BookingService → Show: releaseSeats([A1, A2], user)
  BookingService → User: PaymentFailedException
```

**Methods:** `BookingService.book`; `Show.holdSeats/confirmSeats/releaseSeats`; `ShowSeat.hold/confirm/release`; `PaymentGateway.charge`; `BookingRepository.save`. The full design, including concurrency, is in [Movie Ticket Booking](problem:movie-ticket-booking).
````
