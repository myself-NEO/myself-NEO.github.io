## Exceptions are part of your API

When a method can't do what was asked — the book is already lent, the balance is too low, the slot is empty — it has to tell the caller. In Java the main mechanism is the **exception**. The exceptions a method can throw are as much a part of its contract as its parameters and return type, so they deserve design attention.

## Checked vs unchecked

```text
Throwable
├── Error                      (JVM problems: OutOfMemoryError — don't catch)
└── Exception                  (checked: caller must catch or declare)
    ├── IOException, SQLException, ...
    └── RuntimeException       (unchecked: no compile-time obligation)
        ├── IllegalArgumentException
        ├── IllegalStateException
        └── your domain exceptions (usually)
```

| | Checked (`extends Exception`) | Unchecked (`extends RuntimeException`) |
|---|---|---|
| Compiler forces handling | Yes | No |
| Good for | Recoverable conditions the caller **must** consider (I/O failure) | Programming errors and business-rule violations |
| Downside | Pollutes signatures and lambdas | Easy to forget to handle |

Modern Java design (and most frameworks) favour **unchecked exceptions for domain errors**, with clear names and documentation. Reserve checked exceptions for cases where the caller genuinely can and should recover at the call site.

## The two workhorses

- **`IllegalArgumentException`** — the *caller passed bad input*: negative amount, null name, end before start.
- **`IllegalStateException`** — the input is fine, but the *object's current state* doesn't allow the operation: withdrawing from a closed account, dispensing before payment.

```java
void withdraw(long amount) {
    if (amount <= 0) throw new IllegalArgumentException("amount must be positive: " + amount);
    if (closed) throw new IllegalStateException("account " + id + " is closed");
    ...
}
```

## Fail fast

Validate **at the boundary**, as early as possible, so errors surface close to their cause:

- Constructors reject invalid state, so no invalid object ever exists.
- Public methods check arguments first (guard clauses), before changing any state.
- `Objects.requireNonNull(x, "x")` for mandatory references.

A method that changes half its state and then throws leaves the object **corrupted**. Do all checks first, then mutate.

## Domain exceptions

When callers need to react **differently** to different failures, give those failures names:

```java title="A small domain exception hierarchy" file="LendingExceptionsDemo.java"
import java.util.HashMap;
import java.util.Map;

public class LendingExceptionsDemo {
    public static void main(String[] args) {
        Library library = new Library();
        library.addCopy("C1");
        library.lend("C1", "M1");

        try {
            library.lend("C1", "M2");
        } catch (CopyUnavailableException e) {
            System.out.println("Show 'join waitlist' button: " + e.getMessage());
        } catch (LendingException e) {
            System.out.println("Generic lending error: " + e.getMessage());
        }

        try {
            library.lend("C9", "M2");
        } catch (LendingException e) {     // catches any lending failure
            System.out.println(e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }
}

/** Base type: lets callers catch all lending failures in one place if they want. */
class LendingException extends RuntimeException {
    LendingException(String message) { super(message); }
}

class CopyNotFoundException extends LendingException {
    CopyNotFoundException(String copyId) { super("No copy with id " + copyId); }
}

class CopyUnavailableException extends LendingException {
    private final String copyId;
    CopyUnavailableException(String copyId, String heldBy) {
        super("Copy " + copyId + " is on loan to " + heldBy);
        this.copyId = copyId;
    }
    String copyId() { return copyId; }   // structured data for callers
}

class Library {
    private final Map<String, String> loans = new HashMap<>();   // copyId -> memberId (null = available)

    void addCopy(String copyId) { loans.put(copyId, null); }

    void lend(String copyId, String memberId) {
        if (!loans.containsKey(copyId)) throw new CopyNotFoundException(copyId);
        String holder = loans.get(copyId);
        if (holder != null) throw new CopyUnavailableException(copyId, holder);
        loans.put(copyId, memberId);
    }
}
```

Guidelines:

- **Name exceptions after the problem**, not the location: `InsufficientFundsException`, not `AccountServiceException`.
- **Include context** in messages: IDs and values, so a log line is enough to debug.
- **Carry structured data** (fields) when callers need it programmatically.
- **Keep the hierarchy shallow**: a base exception per bounded area, plus a handful of specific ones.

[Error Handling & Domain Exceptions](lesson:domain-exceptions) covers result types and layered error handling.

## Catching well

```java title="Anti-patterns"
try { doWork(); } catch (Exception e) { }                       // swallowed: bug disappears silently
try { doWork(); } catch (Exception e) { e.printStackTrace(); }  // logged, then continues in a bad state
catch (Exception e) { throw new RuntimeException("failed"); }   // loses the cause
```

```java title="Better"
try {
    gateway.charge(card, amount);
} catch (GatewayTimeoutException e) {
    // Translate to the caller's vocabulary and KEEP THE CAUSE.
    throw new PaymentFailedException("charge timed out for order " + orderId, e);
}
```

Rules of thumb:

- **Catch only what you can handle.** Otherwise let it propagate.
- **Catch specific types**, not `Exception` or `Throwable`.
- **Translate at layer boundaries** (an infrastructure `SQLException` becomes a domain `PersistenceException`), always chaining the cause.
- **Clean up with try-with-resources**, not `finally` blocks you might get wrong. See [Resource Lifecycle](lesson:resource-lifecycle).

## Exceptions vs return values

Not every "no" is exceptional:

- *Lookup that may find nothing* → return `Optional<T>`. `findBook(isbn)` returning empty is normal.
- *Validation with several possible errors to show the user* → return a result object listing them.
- *A rule violation the caller should have prevented, or a truly unexpected failure* → throw.

## Real-world example

A checkout service caught `Exception` around the payment call and logged it, then continued to mark the order as paid. A network timeout charged customers without confirming orders and, worse, sometimes confirmed orders without charging. Replacing the catch-all with specific handling — `PaymentDeclinedException` cancels the order, `GatewayTimeoutException` marks it `PAYMENT_PENDING` for reconciliation — fixed both problems. (Retries also need [idempotency](lesson:idempotency).)

## Common mistakes

- Swallowing exceptions or catching `Exception` broadly.
- Using exceptions for normal control flow (looping until an exception occurs).
- Throwing after partially mutating state.
- Vague messages: `"Error"`, `"Invalid input"`.
- Losing the cause when wrapping.

## In the interview

> [!INTERVIEW] Show the unhappy path
> After writing the happy path of a core method, add guard clauses and say: *"If the slot is empty I throw `ProductSoldOutException`; the vending machine catches it and refunds. Bad input like a negative quantity is an `IllegalArgumentException` — a programming error."* Two or three well-named exceptions demonstrate you thought about failure without derailing the interview.

## Key takeaways

- Prefer **unchecked** exceptions for domain errors; use checked only when callers must recover locally.
- `IllegalArgumentException` = bad input; `IllegalStateException` = wrong state.
- **Fail fast**: validate before mutating.
- Design a **small, named** domain exception hierarchy with contextual messages.
- Catch narrowly, translate at boundaries, and **always keep the cause**.

## Knowledge check

```quiz
? `vendingMachine.dispense()` is called before any coin is inserted. Which exception fits best?
- IllegalArgumentException
+ IllegalStateException
- NullPointerException
- IOException
> The arguments are fine; the machine's current state doesn't allow the operation.

? What's wrong with `catch (SQLException e) { throw new RepositoryException("save failed"); }`?
+ The original cause is lost, which makes debugging much harder
- RepositoryException must be checked
- You can't throw inside catch
> Always pass the cause: `new RepositoryException("save failed for " + id, e)`.

? A method should look up a member who may legitimately not exist. What should it return?
- null
+ Optional<Member>
- Throw MemberNotFoundException every time
> Absence is a normal outcome here, so Optional expresses it explicitly. Callers that require the member can use orElseThrow.
```

## Exercise

Add proper error handling to this ATM withdrawal. Requirements: reject non-positive amounts; reject amounts not divisible by 100; reject if the account is blocked; reject if the balance is insufficient (callers need the shortfall); and never leave the balance changed when a check fails.

```java
class AtmAccount {
    long balance; boolean blocked;
    void withdraw(long amount) { balance -= amount; }
}
```

````hint title="Hint"
Which checks are about the argument and which are about state? Which failure needs structured data?
````

````solution title="Reference solution"
```java file="AtmAccountDemo.java"
public class AtmAccountDemo {
    public static void main(String[] args) {
        AtmAccount account = new AtmAccount(1_000);
        account.withdraw(300);
        try {
            account.withdraw(900);
        } catch (InsufficientFundsException e) {
            System.out.println(e.getMessage() + " (short by " + e.shortfall() + ")");
        }
        System.out.println("Balance still " + account.balance());
    }
}

class InsufficientFundsException extends RuntimeException {
    private final long shortfall;
    InsufficientFundsException(long requested, long available) {
        super("Requested " + requested + " but only " + available + " available");
        this.shortfall = requested - available;
    }
    long shortfall() { return shortfall; }
}

class AtmAccount {
    private long balance;
    private boolean blocked;

    AtmAccount(long openingBalance) {
        if (openingBalance < 0) throw new IllegalArgumentException("negative opening balance");
        this.balance = openingBalance;
    }

    void withdraw(long amount) {
        // 1. Argument checks
        if (amount <= 0) throw new IllegalArgumentException("amount must be positive: " + amount);
        if (amount % 100 != 0) throw new IllegalArgumentException("amount must be a multiple of 100: " + amount);
        // 2. State checks
        if (blocked) throw new IllegalStateException("account is blocked");
        if (amount > balance) throw new InsufficientFundsException(amount, balance);
        // 3. Mutate only after every check has passed
        balance -= amount;
    }

    void block() { blocked = true; }
    long balance() { return balance; }
}
```
````
