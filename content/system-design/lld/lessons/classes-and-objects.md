## Class vs object

A **class** is a blueprint: it declares what data an object holds (**fields**) and what it can do (**methods**). An **object** is one concrete instance built from that blueprint, with its own copy of the instance fields.

```java
BankAccount alice = new BankAccount("ACC-1", 1_000); // one object
BankAccount bob   = new BankAccount("ACC-2", 50);    // another, independent object
```

Changing Alice's balance does not change Bob's. Both share the same *behaviour* (the methods), but each has its own *state*.

## Anatomy of a well-designed class

```java title="BankAccount.java — every part has a purpose" file="BankAccountDemo.java"
import java.util.Objects;

public class BankAccountDemo {
    public static void main(String[] args) {
        BankAccount account = new BankAccount("ACC-1", 1_000);
        account.deposit(250);
        account.withdraw(400);
        System.out.println(account);                 // uses toString()
        System.out.println(BankAccount.isValidId("ACC-9"));

        try {
            account.withdraw(10_000);
        } catch (IllegalStateException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
    }
}

class BankAccount {
    // 1. Constants: shared, immutable, named.
    private static final long MAX_SINGLE_WITHDRAWAL = 5_000;

    // 2. Instance fields: private; final where they never change.
    private final String id;
    private long balance;

    // 3. Constructor: the ONLY way to create an account, so it validates everything.
    BankAccount(String id, long openingBalance) {
        if (!isValidId(id)) throw new IllegalArgumentException("Bad account id: " + id);
        if (openingBalance < 0) throw new IllegalArgumentException("Opening balance must be >= 0");
        this.id = id;
        this.balance = openingBalance;
    }

    // 4. Behaviour: methods that change state while protecting invariants.
    void deposit(long amount) {
        requirePositive(amount);
        balance += amount;
    }

    void withdraw(long amount) {
        requirePositive(amount);
        if (amount > MAX_SINGLE_WITHDRAWAL) throw new IllegalStateException("Above single-withdrawal limit");
        if (amount > balance) throw new IllegalStateException("Insufficient funds");
        balance -= amount;
    }

    // 5. Queries: read-only access to what callers legitimately need.
    long balance() { return balance; }
    String id() { return id; }

    // 6. Static members: belong to the class, not to any one account.
    static boolean isValidId(String id) {
        return id != null && id.matches("ACC-\\d+");
    }

    private static void requirePositive(long amount) {
        if (amount <= 0) throw new IllegalArgumentException("Amount must be positive");
    }

    // 7. Identity: entities are equal when their IDs are equal.
    @Override public boolean equals(Object o) {
        return o instanceof BankAccount other && id.equals(other.id);
    }
    @Override public int hashCode() { return Objects.hash(id); }
    @Override public String toString() { return "BankAccount[" + id + ", balance=" + balance + "]"; }
}
```

Walk through the numbered parts:

1. **Constants** replace magic numbers and document intent.
2. **Fields are private.** Nothing outside the class can set `balance` to −500. `id` is `final` because an account never changes its ID.
3. **Constructors guarantee a valid starting state.** If construction succeeds, the object is valid. This is the cheapest place to enforce invariants.
4. **Methods change state through rules.** There is no `setBalance()`: the only ways to change the balance are the domain operations `deposit` and `withdraw`.
5. **Queries expose only what is needed.** Read-only accessors, no setters.
6. **Static members** belong to the class. `isValidId` doesn't need any particular account.
7. **`equals`/`hashCode`** define identity. For entities, compare IDs; for value objects, compare all fields (records do this automatically).

> [!TIP] Constructors vs static factories
> When a constructor needs a descriptive name or might return a cached instance, use a static factory: `Money.ofRupees(500)`, `Duration.ofMinutes(5)`. You'll see more of this in [Factory Method](lesson:factory-method).

## Constructor overloading and chaining

Provide convenient constructors, but funnel them into one that does all the validation:

```java
class Meeting {
    private final String title;
    private final int durationMinutes;

    Meeting(String title) { this(title, 30); }          // default duration

    Meeting(String title, int durationMinutes) {          // the one true constructor
        if (title == null || title.isBlank()) throw new IllegalArgumentException("title required");
        if (durationMinutes <= 0) throw new IllegalArgumentException("duration must be > 0");
        this.title = title;
        this.durationMinutes = durationMinutes;
    }
}
```

When there are many optional parameters, constructors become unreadable (`new Pizza(true, false, true, 2, null)`). That is the problem the [Builder](lesson:builder) pattern solves.

## Instance vs static: a quick guide

| Use **instance** members when… | Use **static** members when… |
|---|---|
| The data differs per object (`balance`) | The value is shared by all objects (`MAX_SINGLE_WITHDRAWAL`) |
| Behaviour depends on the object's state | It is a pure helper (`isValidId`) or a factory |
| You might want polymorphism later | No polymorphism needed |

> [!WARNING] Static state is global state
> A `static Map<String, Account> ALL_ACCOUNTS` is a global variable. It makes testing hard (tests share state) and causes concurrency bugs. In LLD interviews, prefer an instance field on an object that is passed around.

## Real-world example

A ride-hailing app had a `Trip` class with public setters for `status`, `driverId` and `fare`. Different services set them in different orders, producing trips with `status = COMPLETED` but `fare = null`. The fix was to remove the setters and add domain methods — `trip.assignDriver(d)`, `trip.start()`, `trip.complete(fare)` — that validate the current status before changing anything. The class grew by a few lines and a whole category of bugs disappeared.

## Common mistakes

- **Public fields or a setter for every field.** These destroy encapsulation; any code can put the object into an invalid state.
- **Constructors that don't validate.** Objects that can be "half-constructed" push null checks into every caller.
- **Doing heavy work in constructors.** Network calls or file I/O in a constructor make objects hard to create in tests. Pass collaborators in instead.
- **Overusing `static`.** Static utility classes for domain logic (`AccountUtils.withdraw(account, 50)`) hide behaviour from the object that owns the data.
- **Wrong equality.** Using `==` on objects, or forgetting `hashCode` when overriding `equals` (breaks `HashMap`/`HashSet`).

## In the interview

> [!INTERVIEW] Signals to send
> Make fields `private` (and `final` where possible) by default, validate in constructors, and expose domain operations (`withdraw`) rather than setters (`setBalance`). Interviewers notice these instantly, and they cost nothing to write.

## Key takeaways

- A class bundles **state** and **behaviour**; each object has its own state.
- Constructors are your first line of defence: **an object should be valid from birth**.
- Prefer **domain methods** over setters; expose only the queries callers need.
- Use `static` for shared constants, pure helpers and factories — not for domain state.
- Entities compare by **ID**; value objects compare by **value**.

## Knowledge check

```quiz
? Why does BankAccount have no `setBalance(long)` method?
- Java does not allow setters on long fields
+ So the balance can only change through operations that enforce the rules (deposit/withdraw)
- Setters are slower than methods
> Removing the setter forces all changes through validated domain operations.

? Which member should be `static`?
- The account's balance
- The account holder's name
+ A method that checks whether a string is a valid account ID format
- A method that withdraws money
> Format validation doesn't depend on any particular account instance.

? You override `equals` in a class used as a HashMap key but forget `hashCode`. What happens?
- Compilation fails
+ Equal objects may land in different buckets, so lookups can fail
- Nothing — hashCode is only used for printing
> The equals/hashCode contract requires equal objects to have equal hash codes; otherwise hash-based collections misbehave.
```

## Exercise

Design a `LibraryCard` class with these rules:

- Has a card number (format `LIB-` followed by 6 digits) and the holder's name.
- Can borrow at most 5 items at a time; `borrow()` and `returnItem()` change the count.
- A card can be suspended; a suspended card cannot borrow.
- It's impossible to have a negative borrowed count.

Write the full class with constructor validation and no public setters.

````hint title="Hint"
Which fields can be `final`? Which operations need a guard clause before they change state? Is `suspended` set via a setter, or via domain methods like `suspend()` and `reinstate()`?
````

````solution title="Reference solution"
```java file="LibraryCardDemo.java"
public class LibraryCardDemo {
    public static void main(String[] args) {
        LibraryCard card = new LibraryCard("LIB-123456", "Asha");
        card.borrow();
        card.borrow();
        card.returnItem();
        card.suspend();
        try {
            card.borrow();
        } catch (IllegalStateException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
        System.out.println(card.number() + " has " + card.borrowedCount() + " item(s) out");
    }
}

class LibraryCard {
    private static final int MAX_ITEMS = 5;

    private final String number;
    private final String holderName;
    private int borrowedCount;
    private boolean suspended;

    LibraryCard(String number, String holderName) {
        if (number == null || !number.matches("LIB-\\d{6}")) throw new IllegalArgumentException("Bad card number");
        if (holderName == null || holderName.isBlank()) throw new IllegalArgumentException("Holder name required");
        this.number = number;
        this.holderName = holderName;
    }

    void borrow() {
        if (suspended) throw new IllegalStateException("Card " + number + " is suspended");
        if (borrowedCount >= MAX_ITEMS) throw new IllegalStateException("Limit of " + MAX_ITEMS + " reached");
        borrowedCount++;
    }

    void returnItem() {
        if (borrowedCount == 0) throw new IllegalStateException("Nothing to return");
        borrowedCount--;
    }

    void suspend() { suspended = true; }
    void reinstate() { suspended = false; }

    String number() { return number; }
    String holderName() { return holderName; }
    int borrowedCount() { return borrowedCount; }
    boolean isSuspended() { return suspended; }
}
```
````
