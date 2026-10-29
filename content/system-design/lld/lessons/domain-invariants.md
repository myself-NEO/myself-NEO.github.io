## What an invariant is

An **invariant** is a rule that must be **true at all times** for an object (or a group of objects) to be valid:

- A bank account balance is never negative (unless it has an overdraft facility, up to its limit).
- A hotel room has no two overlapping confirmed reservations.
- In a group expense, the participants' shares sum exactly to the expense amount.
- A chess position has exactly one king per side.

Invariants are the heart of **domain modelling**. If you can name them, you know which object must enforce what, and where your tests and concurrency effort should go.

## Where invariants live

The guiding rule: **an invariant is enforced by the object that owns all the data it constrains.**

| Invariant | Data involved | Owner / enforcer |
|---|---|---|
| Balance ≥ 0 | `balance` | `Account` |
| No overlapping reservations for a room | All reservations of one room | `RoomSchedule` (per room) |
| Shares sum to the amount | The expense's amount and shares | `Expense` |
| Member has ≤ 5 active loans | The member's loans | `Member` (or a loan aggregate) |

When an invariant spans **several** objects, you either (a) make one object the **aggregate root** that owns them all and funnels every change through itself, or (b) accept that it's enforced by an application service with coordination such as locks or transactions (and admit it's weaker). Domain-Driven Design calls an **aggregate** a cluster of objects treated as one unit for changes, with one **root** entity as the only entry point.

## Techniques for making invalid states unrepresentable

### 1. Validate in constructors and factories

```java
record Percentage(int value) {
    Percentage {
        if (value < 0 || value > 100) throw new IllegalArgumentException("percentage out of range: " + value);
    }
}
```

Once a `Percentage` exists, it's valid, so code receiving one never re-checks.

### 2. Use value objects instead of primitives

`long amountInPaise` can't stop you from adding paise to cents or passing a negative fee. `Money` can. `String email` accepts `"hello"`; `EmailAddress` can't. Primitive obsession pushes validation into every caller. Value objects validate once. See [Immutability](lesson:immutability).

### 3. No setters on invariant-carrying fields

Changes happen only through **intention-revealing methods** that check the rules: `account.withdraw(amount)`, `reservation.extendTo(newCheckout)`, never `setBalance` or `setCheckout`.

### 4. Expose read-only views

Don't hand out internal collections. A caller adding to `expense.getShares()` would bypass the sum-to-total check.

### 5. Funnel changes through the aggregate root

Callers can't modify a `Share` directly; they ask the `Expense` to `reallocate(...)`, which re-validates the whole.

## A worked example: a group expense aggregate

```java title="Expense: invariants enforced by the aggregate root" file="ExpenseInvariantsDemo.java"
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

public class ExpenseInvariantsDemo {
    public static void main(String[] args) {
        Expense dinner = Expense.splitEqually("E1", "asha", Money.ofPaise(1_000_00), java.util.List.of("asha", "ravi", "meera"));
        System.out.println(dinner);

        dinner.reallocate(Map.of("asha", Money.ofPaise(500_00), "ravi", Money.ofPaise(300_00), "meera", Money.ofPaise(200_00)));
        System.out.println(dinner);

        try {
            dinner.reallocate(Map.of("asha", Money.ofPaise(500_00), "ravi", Money.ofPaise(300_00)));   // sums to 800
        } catch (IllegalArgumentException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
        System.out.println("Still valid: " + dinner);

        try {
            dinner.shares().put("kabir", Money.ofPaise(1));              // read-only view
        } catch (UnsupportedOperationException e) {
            System.out.println("Shares can't be modified directly");
        }
    }
}

/** Value object: non-negative money in paise. */
record Money(long paise) implements Comparable<Money> {
    Money {
        if (paise < 0) throw new IllegalArgumentException("negative money");
    }
    static Money ofPaise(long p) { return new Money(p); }
    Money plus(Money o) { return new Money(Math.addExact(paise, o.paise)); }
    public int compareTo(Money o) { return Long.compare(paise, o.paise); }
    @Override public String toString() { return String.format("Rs %d.%02d", paise / 100, paise % 100); }
}

/** Aggregate root. Invariants:
 *  I1. amount > 0
 *  I2. payer is a participant
 *  I3. shares cover exactly the participants, and sum exactly to amount */
final class Expense {
    private final String id;
    private final String paidBy;
    private final Money amount;
    private Map<String, Money> shares;   // replaced wholesale, never mutated piecemeal

    private Expense(String id, String paidBy, Money amount, Map<String, Money> shares) {
        this.id = Objects.requireNonNull(id);
        this.paidBy = Objects.requireNonNull(paidBy);
        this.amount = Objects.requireNonNull(amount);
        if (amount.paise() == 0) throw new IllegalArgumentException("I1: amount must be positive");
        this.shares = validated(shares);
        if (!this.shares.containsKey(paidBy)) throw new IllegalArgumentException("I2: payer must be a participant");
    }

    static Expense splitEqually(String id, String paidBy, Money amount, java.util.List<String> participants) {
        if (participants.isEmpty()) throw new IllegalArgumentException("no participants");
        long base = amount.paise() / participants.size(), rem = amount.paise() % participants.size();
        Map<String, Money> shares = new LinkedHashMap<>();
        for (int i = 0; i < participants.size(); i++) shares.put(participants.get(i), Money.ofPaise(base + (i < rem ? 1 : 0)));
        return new Expense(id, paidBy, amount, shares);
    }

    /** The only way to change shares: the whole new allocation is validated before it replaces the old one. */
    void reallocate(Map<String, Money> newShares) {
        Map<String, Money> candidate = validated(newShares);
        if (!candidate.keySet().equals(shares.keySet())) throw new IllegalArgumentException("I3: participants must not change here");
        this.shares = candidate;
    }

    private Map<String, Money> validated(Map<String, Money> proposed) {
        if (proposed.isEmpty()) throw new IllegalArgumentException("I3: no shares");
        Money total = proposed.values().stream().reduce(Money.ofPaise(0), Money::plus);
        if (total.compareTo(amount) != 0) throw new IllegalArgumentException("I3: shares sum to " + total + ", expected " + amount);
        return Collections.unmodifiableMap(new LinkedHashMap<>(proposed));
    }

    Map<String, Money> shares() { return shares; }   // unmodifiable

    @Override public String toString() { return id + " paid by " + paidBy + " " + amount + " -> " + shares; }
}
```

Notice the pattern in `reallocate`: **build the candidate state, validate it completely, then swap it in.** The object is never observed in a half-updated state — not even if validation throws halfway.

## Invariants and concurrency

An invariant that holds in single-threaded code can break under concurrency: two withdrawals each check `balance >= amount` and both succeed. **The invariant defines the critical section.** Every operation that reads and changes the data an invariant covers must be atomic with respect to the others — a lock on the aggregate, an atomic compare-and-set, or an optimistic version check. Aggregates make this tractable: one aggregate, one lock. See [Race Conditions](lesson:concurrent-state-transitions).

## Real-world example

A hotel platform stored "rooms available per night" as a counter updated by several services. Overbookings happened weekly. Modelling a `RoomTypeInventory` aggregate per hotel, room type and night — with the invariant `booked ≤ capacity` enforced inside `reserve()`, and all reservation changes funnelled through it — removed the overbookings. The fix wasn't a smarter query; it was giving the invariant a single owner. See [Hotel Reservation](problem:hotel-reservation).

## Common mistakes

- **Validating in the service layer only**, while the entity remains settable to anything.
- **Primitive obsession**: raw `long`, `String` and `int` for money, emails and percentages.
- **Mutating in place, then validating**, which leaves the object invalid if validation fails.
- **Aggregates that are too big** (a `Hotel` aggregate containing every reservation ever) — slow and highly contended.
- **Unnamed invariants** — if you can't state the rule, nobody can test it.

## In the interview

> [!INTERVIEW] State invariants explicitly
> After listing entities, say: *"Invariants: a room can't have overlapping confirmed reservations; a reservation's check-out is after check-in. `RoomSchedule` enforces the first, the `DateRange` value object the second."* Then, when concurrency comes up, you already know where the lock goes.

## Key takeaways

- **Invariants** are rules that must always hold; name them early.
- The object owning all the involved data **enforces** them — usually an **aggregate root**.
- Make invalid states unrepresentable: **validated constructors, value objects, no setters, read-only views**.
- Validate a whole candidate state, then **swap** it in.
- Invariants define your **critical sections** under concurrency.

## Knowledge check

```quiz
? Where should "shares must sum to the expense amount" be enforced?
+ In the Expense aggregate, which owns both the amount and the shares
- In each Share object independently
- In the UI form
> Only the object holding all the involved data can enforce the rule reliably.

? What's the safest way to update several fields that together must satisfy an invariant?
- Update each field with setters, then call validate()
+ Build the complete candidate state, validate it, then replace the old state in one step
- Update in place and catch exceptions
> Validate-then-swap prevents half-updated invalid states.

? Why do value objects like EmailAddress or Money help with invariants?
+ They validate once at construction, so every holder of one can rely on it being valid
- They're faster than Strings
- They can be serialised more easily
> Validation moves from every call site to one constructor.
```

## Exercise

A `Classroom` has a capacity and a set of enrolled students. Invariants: enrolment never exceeds capacity; a student appears at most once; capacity can be reduced only if the current enrolment still fits. Write the class with `enroll`, `withdraw`, `changeCapacity` and a read-only `students()`, and make it safe for concurrent use.

````hint title="Hint"
All three invariants involve the same data, so one lock (`synchronized` methods) on the classroom covers them. Use a `Set` for uniqueness.
````

````solution title="Reference solution"
```java file="ClassroomDemo.java"
import java.util.LinkedHashSet;
import java.util.Set;

public class ClassroomDemo {
    public static void main(String[] args) {
        Classroom c = new Classroom(2);
        c.enroll("asha");
        c.enroll("ravi");
        try { c.enroll("meera"); } catch (IllegalStateException e) { System.out.println("Rejected: " + e.getMessage()); }
        try { c.changeCapacity(1); } catch (IllegalStateException e) { System.out.println("Rejected: " + e.getMessage()); }
        c.withdraw("ravi");
        c.changeCapacity(1);
        System.out.println(c.students() + " capacity " + c.capacity());
    }
}

final class Classroom {
    private int capacity;
    private final Set<String> students = new LinkedHashSet<>();

    Classroom(int capacity) {
        if (capacity <= 0) throw new IllegalArgumentException("capacity must be positive");
        this.capacity = capacity;
    }

    synchronized void enroll(String student) {
        if (students.contains(student)) throw new IllegalStateException(student + " already enrolled");
        if (students.size() >= capacity) throw new IllegalStateException("class is full");
        students.add(student);
    }

    synchronized void withdraw(String student) {
        if (!students.remove(student)) throw new IllegalStateException(student + " not enrolled");
    }

    synchronized void changeCapacity(int newCapacity) {
        if (newCapacity <= 0) throw new IllegalArgumentException("capacity must be positive");
        if (newCapacity < students.size()) throw new IllegalStateException("cannot shrink below " + students.size() + " enrolled");
        capacity = newCapacity;
    }

    synchronized Set<String> students() { return Set.copyOf(students); }   // snapshot
    synchronized int capacity() { return capacity; }
}
```
````
