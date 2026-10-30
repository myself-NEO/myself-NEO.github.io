## Concept explanation

### What it is

**Access modifiers** control which code can see a class or member. **Encapsulation** is the design practice of using them to **hide an object's representation** and expose only operations that keep it valid.

| Modifier | Same class | Same package | Subclass in another package | Anywhere |
|---|:-:|:-:|:-:|:-:|
| `private` | ✓ | | | |
| *(none)* package-private | ✓ | ✓ | | |
| `protected` | ✓ | ✓ | ✓ (through inheritance) | |
| `public` | ✓ | ✓ | ✓ | ✓ |

- Top-level classes can only be `public` or package-private. Nested types can use all four.
- `protected` **includes package access**, and the subclass access is limited: in another package, a subclass may use a protected member **only through references of its own type** (or subtypes), not through an arbitrary instance of the parent.
- `private` is per **class**, not per object: an object can read another object's private fields if both are of the same class — that's how `equals` compares fields.
- Since Java 9, modules add a layer above this: a `public` class in a package the module doesn't `export` is invisible outside the module.

### Why it exists

Encapsulation lets a class **guarantee its invariants** ("balance never negative", "end date after start date") because no outside code can bypass its methods. It also lets you **change the representation** later — swap an `int` for a `long`, a `List` for a `Map`, add caching — without breaking callers, because they never depended on it.

### When to use what

- **Fields: `private`**, nearly always. (Constants can be `public static final` if they're immutable.)
- **Methods:** `public` for the API, `private` for helpers, package-private for collaborators in the same package and for tests in the same package.
- **`protected`** only for deliberate extension points in classes designed for inheritance.
- **Classes:** package-private unless other packages genuinely need them — a smaller public surface is easier to evolve.

### Encapsulation is more than getters and setters

A class with private fields and a public getter **and setter** for each one is barely encapsulated: callers can still set any value at any time. Better:

- Expose **behaviour** that names the business operation (`account.withdraw(amount)`, not `setBalance(getBalance() - amount)`) — *"tell, don't ask"*.
- Validate in constructors and mutators.
- **Defensive copies** of mutable inputs and outputs (`List`, `Date`, arrays), or return unmodifiable views.
- Omit setters entirely where state shouldn't change.

## Internal working

- Access modifiers are recorded as **flags in the class file** (`ACC_PUBLIC`, `ACC_PRIVATE`, `ACC_PROTECTED`). `javac` checks access at compile time; the **JVM checks again** when resolving a field or method reference, throwing `IllegalAccessError` if a class was recompiled and the access became illegal.
- **Packages at run time** are defined by *(package name, class loader)*: two classes in `com.acme` loaded by different class loaders are **not** in the same run-time package and can't use package-private members of each other.
- **Nested classes** can access each other's private members. Before Java 11 `javac` generated synthetic `access$000` bridge methods for this; since Java 11 (JEP 181, *nest-based access control*) the JVM understands "nestmates" directly.
- **Reflection** can bypass access checks with `setAccessible(true)`, but since Java 16 the JDK's own internals are **strongly encapsulated**: deep reflection into `java.*` packages throws `InaccessibleObjectException` unless the module is explicitly opened.
- Encapsulation has no run-time cost: the JIT inlines trivial getters completely.

## Visual representation

```text title="What each caller can see in com.bank.Account"
  package com.bank                                package com.audit
  +-----------------------------------------+     +-------------------------------+
  | public class Account                    |     | class Auditor                 |
  |   private long balance       [A]        |     |   can use: [D]                |
  |   long overdraftLimit        [A][B]     |     +-------------------------------+
  |   protected void onChange()  [A][B][C]  |     | class PremiumAccount extends  |
  |   public void withdraw(..)   [A][B][C][D]     |   Account                     |
  +-----------------------------------------+     |   can use: [C][D]             |
  | class Ledger (same package)             |     |   (onChange only on itself or |
  |   can use: [B][C][D]                    |     |    other PremiumAccounts)     |
  +-----------------------------------------+     +-------------------------------+
  [A] the class itself  [B] same package  [C] subclasses  [D] everyone
```

## Java code example

```java title="EncapsulationDemo.java" file="EncapsulationDemo.java"
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

public class EncapsulationDemo {
    public static void main(String[] args) {
        // Leaky: public mutable state, no rules
        LeakyAccount leaky = new LeakyAccount();
        leaky.balance = -500;                          // nothing stops this
        leaky.history.clear();                         // or this
        System.out.println("leaky balance = " + leaky.balance);

        // Encapsulated: behaviour + validation + defensive copies
        Account account = new Account("ACC-7", 100);
        account.deposit(50);
        try {
            account.withdraw(1_000);
        } catch (IllegalStateException e) {
            System.out.println("rejected: " + e.getMessage());
        }
        account.withdraw(30);
        List<String> view = account.history();
        try {
            view.add("forged entry");
        } catch (UnsupportedOperationException e) {
            System.out.println("history is read-only for callers");
        }
        System.out.println(account.id() + " balance = " + account.balance() + ", history = " + account.history());

        // Same class => can read another instance's private fields
        System.out.println("same balance as a copy? " + account.sameBalanceAs(new Account("ACC-8", 120)));

        // Defensive copy of a mutable input (LocalDate is immutable; a List is not)
        List<String> owners = new ArrayList<>(List.of("Ada"));
        JointAccount joint = new JointAccount(owners);
        owners.add("Mallory");                         // caller mutates its own list later
        System.out.println("joint owners = " + joint.owners());
    }
}

class LeakyAccount {
    public long balance;
    public List<String> history = new ArrayList<>();
}

class Account {
    private final String id;
    private long balance;                              // invariant: never negative
    private final List<String> history = new ArrayList<>();

    Account(String id, long opening) {
        if (opening < 0) {
            throw new IllegalArgumentException("opening balance must be >= 0");
        }
        this.id = id;
        this.balance = opening;
        record("open " + opening);
    }

    void deposit(long amount) {
        requirePositive(amount);
        balance += amount;
        record("deposit " + amount);
    }

    void withdraw(long amount) {
        requirePositive(amount);
        if (amount > balance) {
            throw new IllegalStateException("insufficient funds in " + id);
        }
        balance -= amount;
        record("withdraw " + amount);
    }

    long balance() {
        return balance;                                // getter, but deliberately no setter
    }

    String id() {
        return id;
    }

    List<String> history() {
        return List.copyOf(history);                   // callers get a snapshot, not our list
    }

    boolean sameBalanceAs(Account other) {
        return this.balance == other.balance;          // private access is per class, not per object
    }

    private void requirePositive(long amount) {
        if (amount <= 0) {
            throw new IllegalArgumentException("amount must be positive");
        }
    }

    private void record(String entry) {
        history.add(LocalDate.of(2026, 1, 15) + " " + entry);
    }
}

final class JointAccount {
    private final List<String> owners;

    JointAccount(List<String> owners) {
        this.owners = List.copyOf(owners);             // copy in: later changes by the caller don't leak in
    }

    List<String> owners() {
        return owners;                                 // already unmodifiable: safe to return
    }
}
```

## Output

```text title="Output" output="EncapsulationDemo.java"
leaky balance = -500
rejected: insufficient funds in ACC-7
history is read-only for callers
ACC-7 balance = 120, history = [2026-01-15 open 100, 2026-01-15 deposit 50, 2026-01-15 withdraw 30]
same balance as a copy? true
joint owners = [Ada]
```

- The leaky class let callers break its rules directly.
- `Account` exposes operations, validates them, and hands out copies of its history, so its invariant can't be broken from outside.
- `sameBalanceAs` read `other.balance` directly: `private` restricts by class, not by instance.
- `JointAccount` copied its input, so the caller's later `add("Mallory")` had no effect.

## Real-world application

- **Domain models** expose business operations (`order.ship()`, `subscription.cancel()`), and keep state transitions inside the object — the backbone of clean LLD designs.
- **Libraries** keep implementation classes package-private (or in non-exported module packages) so they can be changed in minor releases; the JDK's `java.util.ImmutableCollections` is package-private for exactly this reason.
- **Security-sensitive classes** copy mutable inputs: a `Date` or `byte[]` passed in can otherwise be changed after validation (a time-of-check/time-of-use bug).
- **Testing**: tests in the same package can call package-private methods without making them public.

## Common mistakes

- **Public fields** or getters+setters for everything ("encapsulation by ritual").
- **Returning internal mutable collections** (`return items;`) so callers can modify them.
- **Storing mutable arguments without copying** (`this.dates = dates;`).
- **Using `protected` for fields**: any subclass, anywhere, can break the invariant — prefer private fields with protected methods.
- **Misunderstanding `protected`**: thinking it's "subclasses only" (it also grants package access) or "subclasses can use it on any parent instance".
- **Making everything `public`** "in case someone needs it" — every public member is a promise you must keep.

## Interview questions

**Q1. What is encapsulation and why does it matter?**

````reveal title="Answer"
Bundling data with the operations that act on it and hiding the representation behind those operations. It lets the object enforce its invariants (nobody can set a negative balance), and lets the implementation change without breaking callers. In Java it's implemented with `private` state, a minimal public API of meaningful operations, validation, and defensive copies of mutable data.
````

**Q2. What exactly does `protected` allow?**

````reveal title="Answer"
Access from the same package (it includes package-private access) plus access from subclasses in other packages — but in those subclasses only through references whose type is the subclass itself (or its subclasses). A `PremiumAccount` in another package can call `this.onChange()` or `otherPremium.onChange()`, but not `someAccount.onChange()` on a plain `Account` reference.
````

**Q3. Can an object access private fields of another object?**

````reveal title="Answer"
Yes, if the code is in the same class (or the same nest of nested classes): access control is per class, not per instance. That's how `equals`, `compareTo` and copy constructors read the other object's private fields.
````

**Q4. Is a class with private fields and public getters/setters encapsulated?**

````reveal title="Answer"
Only nominally. If every field has an unrestricted setter, outside code still controls the state and the class can't protect invariants. Real encapsulation exposes intention-revealing operations, validates them, avoids setters where state shouldn't change, and doesn't leak mutable internals through getters.
````

## Hands-on exercise

Encapsulate a `DateRange` class used by a hotel booking system:

- It holds a `start` and `end` (`LocalDate`), with `end` strictly after `start`.
- `nights()` returns the number of nights; `overlaps(DateRange other)` checks overlap (half-open: a stay ending on the 10th doesn't overlap one starting on the 10th).
- `extendBy(int nights)` returns a **new** range rather than mutating.
- No setters; no way for callers to create an invalid range.

````hint title="Hint"
Validate in the constructor with `end.isAfter(start)`. `ChronoUnit.DAYS.between(start, end)` counts nights. Two half-open ranges overlap when `a.start < b.end && b.start < a.end`.
````

````solution title="Solution"
```java title="DateRangeDemo.java" file="DateRangeDemo.java"
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

public class DateRangeDemo {
    public static void main(String[] args) {
        DateRange first = new DateRange(LocalDate.of(2026, 3, 1), LocalDate.of(2026, 3, 10));
        DateRange second = new DateRange(LocalDate.of(2026, 3, 10), LocalDate.of(2026, 3, 12));
        DateRange third = new DateRange(LocalDate.of(2026, 3, 9), LocalDate.of(2026, 3, 11));
        System.out.println(first + " nights=" + first.nights());
        System.out.println("first overlaps second? " + first.overlaps(second));
        System.out.println("first overlaps third?  " + first.overlaps(third));
        System.out.println("extended: " + first.extendBy(2) + ", original unchanged: " + first);
        try {
            new DateRange(LocalDate.of(2026, 3, 5), LocalDate.of(2026, 3, 5));
        } catch (IllegalArgumentException e) {
            System.out.println("rejected: " + e.getMessage());
        }
    }
}

final class DateRange {
    private final LocalDate start;
    private final LocalDate end;

    DateRange(LocalDate start, LocalDate end) {
        if (start == null || end == null || !end.isAfter(start)) {
            throw new IllegalArgumentException("end must be after start: " + start + " .. " + end);
        }
        this.start = start;                           // LocalDate is immutable: no copy needed
        this.end = end;
    }

    long nights() {
        return ChronoUnit.DAYS.between(start, end);
    }

    boolean overlaps(DateRange other) {
        return start.isBefore(other.end) && other.start.isBefore(end);
    }

    DateRange extendBy(int extraNights) {
        return new DateRange(start, end.plusDays(extraNights));
    }

    @Override
    public String toString() {
        return "[" + start + " .. " + end + ")";
    }
}
```

```text title="Output" output="DateRangeDemo.java"
[2026-03-01 .. 2026-03-10) nights=9
first overlaps second? false
first overlaps third?  true
extended: [2026-03-01 .. 2026-03-12), original unchanged: [2026-03-01 .. 2026-03-10)
rejected: end must be after start: 2026-03-05 .. 2026-03-05
```
````

## Knowledge check

```quiz
? Which modifier allows access from the same package but NOT from subclasses in other packages?
- private
+ package-private (no modifier)
- protected
> protected adds subclass access on top of package access.

? A getter returns `this.items` (an ArrayList field). What's the problem?
+ Callers can modify the object's internal list and bypass its rules
- Nothing, getters are always safe
- It doesn't compile
> Return a copy or an unmodifiable view.

? Can `a.equals(b)` read `b`'s private fields when both are instances of the same class?
+ Yes, access control is per class
- No, private is per object
> Private means private to the class's code.

? Why is a private field with an unrestricted public setter weak encapsulation?
- Setters are slow
+ Any caller can still set any value, so invariants can't be enforced
- The field becomes public
> Encapsulation is about protecting invariants, not about the keyword.
```

## Key takeaways

- Four access levels: **private < package-private < protected < public**; `protected` includes package access.
- Encapsulation = **private state + meaningful operations + validation + defensive copies**.
- Prefer **behaviour over getters/setters**; omit setters where state shouldn't change.
- Never return or store **mutable internals** without copying.
- Smaller public surfaces are easier to change; access is checked by `javac` **and** the JVM.
