## Concept explanation

### What it is

A **custom exception** is your own subclass of `Exception` or `RuntimeException` that names a failure in your domain's language and carries the context needed to handle or diagnose it:

```java
public class InsufficientFundsException extends RuntimeException {
    private final String accountId;
    private final long shortfallCents;

    public InsufficientFundsException(String accountId, long shortfallCents) {
        super("account " + accountId + " is short by " + shortfallCents + " cents");
        this.accountId = accountId;
        this.shortfallCents = shortfallCents;
    }
    public String accountId() { return accountId; }
    public long shortfallCents() { return shortfallCents; }
}
```

### Exception chaining

When you catch a low-level exception and throw a higher-level one, pass the original as the **cause**: `new RepositoryException("could not save order 42", sqlException)`. The stack trace then shows `Caused by: …` sections, and `getCause()` lets code walk the chain to the root. Losing the cause (`new X(e.getMessage())`) throws away the original stack trace — the single most valuable debugging artefact.

### Exception translation

Each layer should throw exceptions that make sense **at its level of abstraction**. A service caller shouldn't need to know you use JDBC, so the repository translates `SQLException` → `OrderRepositoryException` (keeping the cause), and the API layer translates domain exceptions → HTTP responses.

### Why it exists

- **Precise handling**: callers can catch `PaymentDeclinedException` without catching every `RuntimeException`.
- **Context**: fields such as an order id, an error code or a retry-after time let handlers act and logs explain.
- **Stable contracts**: translation hides implementation details that may change (database, HTTP client).

### When to create one — and when not to

Create a custom type when callers will **handle it differently** from other failures, or when it carries **data** they need. Otherwise reuse the standard ones:

| Situation | Standard exception |
|---|---|
| bad argument value | `IllegalArgumentException` |
| null where not allowed | `NullPointerException` (`Objects.requireNonNull`) |
| object in the wrong state for this call | `IllegalStateException` |
| index out of range | `IndexOutOfBoundsException` |
| operation not supported | `UnsupportedOperationException` |
| missing element | `NoSuchElementException` |
| wrapping an `IOException` in unchecked code | `UncheckedIOException` |

### Design guidelines

- **Checked or unchecked?** Most custom exceptions in modern services are **unchecked** (extend `RuntimeException`), documented with `@throws`. Use checked only for recoverable conditions that every caller genuinely must consider.
- **A small hierarchy**: one base per module (`OrderException`) with a few meaningful subtypes, so callers can catch broadly or narrowly.
- **Name it after the problem**, ending in `Exception`: `OrderNotFoundException`, not `OrderError` or `MyException`.
- **Provide the usual constructors**: `(message)`, `(message, cause)`, plus domain-specific ones.
- **Immutable fields**, a clear message (what failed, with which id, why), **no secrets** in the message.
- Exceptions are `Serializable`; long-lived ones should declare `serialVersionUID` and only hold serialisable fields.

## Internal working

- `Throwable` stores the cause in a field; `getCause()` returns it; `initCause(c)` can set it **once** for exceptions whose constructors don't accept a cause (otherwise `IllegalStateException`).
- `printStackTrace()` prints the exception's own frames, then each cause as `Caused by:`, eliding frames shared with the enclosing trace as `... n more`.
- The **message** is built in the constructor (`super(message)`); you can also override `getMessage()` to compute it lazily from fields.
- Stack-trace capture happens in `Throwable`'s constructor via `fillInStackTrace()`. The protected constructor `Throwable(String message, Throwable cause, boolean enableSuppression, boolean writableStackTrace)` lets a subclass **skip** capture (`writableStackTrace = false`) — useful for preallocated, very frequent "expected" exceptions, at the cost of losing diagnostics.
- Exception **identity in `catch`** is by type, using the same assignability rules as `instanceof`, so a hierarchy lets one `catch (OrderException e)` cover every subtype.

## Visual representation

```text title="Translation across layers, with the cause chain preserved"
  HTTP layer      catch (OrderNotFoundException e) -> 404 {"error":"ORDER_NOT_FOUND","orderId":"42"}
       ^          catch (OrderException e)         -> 409 / 422 ...
       |
  Service         throws OrderNotFoundException("order 42 not found")      (domain language)
       ^
       |  translate: catch (RepositoryException e) -> throw new OrderUnavailableException(..., e)
  Repository      throws RepositoryException("could not load order 42", sqlEx)
       ^
       |  translate: catch (SQLException sqlEx) -> throw new RepositoryException(..., sqlEx)
  JDBC driver     throws SQLException("connection reset")

  OrderUnavailableException: order 42 temporarily unavailable
  Caused by: RepositoryException: could not load order 42
  Caused by: java.sql.SQLException: connection reset            <- root cause
```

## Java code example

```java title="CustomExceptionsDemo.java" file="CustomExceptionsDemo.java"
import java.sql.SQLException;
import java.util.Map;

public class CustomExceptionsDemo {
    public static void main(String[] args) {
        OrderService service = new OrderService(new OrderRepository());
        for (String id : new String[] {"42", "missing", "flaky"}) {
            System.out.println(id + " -> " + ApiLayer.handle(() -> service.describe(id)));
        }

        // Walking the cause chain to the root
        try {
            service.describe("flaky");
        } catch (OrderException e) {
            Throwable root = e;
            int depth = 0;
            while (root.getCause() != null) {
                root = root.getCause();
                depth++;
            }
            System.out.println("root cause after " + depth + " hops: " + root);
        }

        // Losing the cause destroys the evidence
        RuntimeException lost = new RuntimeException(new SQLException("deadlock").getMessage());
        System.out.println("message-only wrap keeps the cause? " + (lost.getCause() != null));

        // initCause can be set once
        IllegalStateException ise = new IllegalStateException("late cause");
        ise.initCause(new SQLException("x"));
        try {
            ise.initCause(new SQLException("y"));
        } catch (IllegalStateException e) {
            System.out.println("second initCause: " + e.getMessage());
        }
    }
}

// ---- Exception hierarchy for the order module (unchecked) ----
class OrderException extends RuntimeException {
    private final String orderId;
    private final String code;

    OrderException(String code, String orderId, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
        this.orderId = orderId;
    }

    String code() {
        return code;
    }

    String orderId() {
        return orderId;
    }
}

class OrderNotFoundException extends OrderException {
    OrderNotFoundException(String orderId) {
        super("ORDER_NOT_FOUND", orderId, "order " + orderId + " not found", null);
    }
}

class OrderUnavailableException extends OrderException {
    OrderUnavailableException(String orderId, Throwable cause) {
        super("ORDER_UNAVAILABLE", orderId, "order " + orderId + " temporarily unavailable", cause);
    }
}

// ---- Infrastructure-level exception ----
class RepositoryException extends RuntimeException {
    RepositoryException(String message, Throwable cause) {
        super(message, cause);
    }
}

class OrderRepository {
    private final Map<String, String> rows = Map.of("42", "2 x keyboard");

    String load(String id) {
        try {
            if (id.equals("flaky")) {
                throw new SQLException("connection reset", "08S01");     // simulated driver failure
            }
            return rows.get(id);
        } catch (SQLException e) {
            throw new RepositoryException("could not load order " + id, e);   // translate, keep the cause
        }
    }
}

class OrderService {
    private final OrderRepository repository;

    OrderService(OrderRepository repository) {
        this.repository = repository;
    }

    String describe(String id) {
        String row;
        try {
            row = repository.load(id);
        } catch (RepositoryException e) {
            throw new OrderUnavailableException(id, e);                   // domain language for callers
        }
        if (row == null) {
            throw new OrderNotFoundException(id);
        }
        return "order " + id + ": " + row;
    }
}

final class ApiLayer {
    interface Action {
        String run();
    }

    /** Maps exceptions to responses in ONE place, like a @ControllerAdvice. */
    static String handle(Action action) {
        try {
            return "200 " + action.run();
        } catch (OrderNotFoundException e) {
            return "404 {code=" + e.code() + ", orderId=" + e.orderId() + "}";
        } catch (OrderException e) {
            return "503 {code=" + e.code() + ", retry=true}";              // details logged, not exposed
        }
    }
}
```

## Output

```text title="Output" output="CustomExceptionsDemo.java"
42 -> 200 order 42: 2 x keyboard
missing -> 404 {code=ORDER_NOT_FOUND, orderId=missing}
flaky -> 503 {code=ORDER_UNAVAILABLE, retry=true}
root cause after 2 hops: java.sql.SQLException: connection reset
message-only wrap keeps the cause? false
second initCause: Can't overwrite cause with java.sql.SQLException: y
```

- Each layer threw an exception in its own language; the API layer mapped them to responses in one place, catching the specific subtype first.
- The chain `OrderUnavailableException → RepositoryException → SQLException` survived, so the root cause was two hops away.
- Wrapping with only `e.getMessage()` threw away the cause and its stack trace.
- `initCause` can be called only once (and only if no cause was set in the constructor).

## Real-world application

- **Spring**: `DataAccessException` (unchecked) hierarchy translates vendor-specific `SQLException`s into `DuplicateKeyException`, `DeadlockLoserDataAccessException`, …; `@ControllerAdvice`/`@ExceptionHandler` map exceptions to HTTP responses centrally.
- **Payment and booking domains** use exceptions like `PaymentDeclinedException(reasonCode)` or `SeatUnavailableException(seatId)` that handlers turn into user-facing messages and metrics.
- **Error codes** in exceptions (`ORDER_NOT_FOUND`) give clients stable, machine-readable errors while messages stay human-oriented and internal details stay in logs.
- **gRPC/REST clients** map transport failures into a small set of exceptions (`ServiceUnavailableException` with retry-after) so callers can decide whether to retry.

## Common mistakes

- **Dropping the cause** when wrapping.
- **Exception hierarchies that mirror every error case** (dozens of types nobody catches separately).
- **Generic custom exceptions** (`BusinessException("error")`) with no context.
- **Leaking internals**: SQL, stack traces or file paths in messages returned to API clients.
- **Checked custom exceptions everywhere**, forcing `throws` clauses up every call chain.
- **Catching and wrapping at every layer** even when nothing new is added.
- **Mutable exception fields** or heavy objects (whole entities, connections) stored in exceptions.

## Interview questions

**Q1. When should you create a custom exception rather than use a standard one?**

````reveal title="Answer"
When callers need to distinguish the failure and handle it differently, or the failure needs to carry domain data (ids, codes, amounts, retry hints). For generic contract violations, standard exceptions (`IllegalArgumentException`, `IllegalStateException`, `UnsupportedOperationException`, `NoSuchElementException`) communicate better because every Java developer knows them.
````

**Q2. Should custom exceptions be checked or unchecked?**

````reveal title="Answer"
Prefer unchecked (extend `RuntimeException`) for most domain and infrastructure failures: they don't pollute every signature, work with lambdas and streams, and are usually handled at a boundary. Use checked exceptions only when the condition is expected and recoverable and you want the compiler to force every caller to deal with it. Document unchecked exceptions with `@throws`.
````

**Q3. What is exception chaining and why does it matter?**

````reveal title="Answer"
Passing the original exception as the `cause` of a new one (`new ServiceException("…", e)`). It preserves the original type, message and stack trace in a `Caused by:` chain, so you can translate exceptions to the right abstraction level without losing diagnostic information. `getCause()` walks the chain programmatically.
````

**Q4. What is exception translation?**

````reveal title="Answer"
Catching a lower-level exception at a layer boundary and throwing one that matches the layer's abstraction — e.g. a repository turning `SQLException` into `OrderRepositoryException`, a service turning that into `OrderUnavailableException` — always with the cause attached. It keeps upper layers independent of implementation details.
````

## Hands-on exercise

Design exceptions for a ticket-booking service:

- base `BookingException` (unchecked) with an error `code`;
- `SeatUnavailableException(String seatId)`;
- `PaymentFailedException(String reason, Throwable cause)` — wraps a gateway's checked `GatewayException`;
- a `book(seat, card)` method that translates gateway failures, and a `respond(Runnable)` method that returns `409` for unavailable seats, `402` for payment failures, `500` otherwise.

````hint title="Hint"
Let both subtypes call a `BookingException(code, message, cause)` constructor. In `book`, catch `GatewayException` and throw `new PaymentFailedException(e.getMessage(), e)`. Order the `catch` clauses in `respond` from specific to general.
````

````solution title="Solution"
```java title="BookingErrors.java" file="BookingErrors.java"
import java.util.Set;

public class BookingErrors {
    static final Set<String> TAKEN = Set.of("A1");

    public static void main(String[] args) {
        System.out.println(respond(() -> book("B2", "4111")));
        System.out.println(respond(() -> book("A1", "4111")));
        System.out.println(respond(() -> book("C3", "0000")));
        System.out.println(respond(() -> { throw new IllegalStateException("bug"); }));
    }

    static void book(String seat, String card) {
        if (TAKEN.contains(seat)) {
            throw new SeatUnavailableException(seat);
        }
        try {
            Gateway.charge(card);
        } catch (GatewayException e) {
            throw new PaymentFailedException("card declined", e);
        }
    }

    static String respond(Runnable action) {
        try {
            action.run();
            return "201 booked";
        } catch (SeatUnavailableException e) {
            return "409 " + e.code();
        } catch (PaymentFailedException e) {
            return "402 " + e.code() + " (cause: " + e.getCause().getMessage() + ")";
        } catch (RuntimeException e) {
            return "500 internal error";
        }
    }
}

class GatewayException extends Exception {
    GatewayException(String message) {
        super(message);
    }
}

final class Gateway {
    static void charge(String card) throws GatewayException {
        if (card.startsWith("0")) {
            throw new GatewayException("issuer refused (code 05)");
        }
    }
}

class BookingException extends RuntimeException {
    private final String code;

    BookingException(String code, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
    }

    String code() {
        return code;
    }
}

class SeatUnavailableException extends BookingException {
    SeatUnavailableException(String seatId) {
        super("SEAT_UNAVAILABLE", "seat " + seatId + " is taken", null);
    }
}

class PaymentFailedException extends BookingException {
    PaymentFailedException(String reason, Throwable cause) {
        super("PAYMENT_FAILED", reason, cause);
    }
}
```

```text title="Output" output="BookingErrors.java"
201 booked
409 SEAT_UNAVAILABLE
402 PAYMENT_FAILED (cause: issuer refused (code 05))
500 internal error
```
````

## Knowledge check

```quiz
? Which constructor call preserves the original exception?
+ new ServiceException("save failed", e)
- new ServiceException(e.getMessage())
- new ServiceException("save failed")
> Pass the cause to keep its type and stack trace.

? A caller passes a negative quantity. Which exception fits best?
+ IllegalArgumentException
- a new NegativeQuantityCheckedException
- RuntimeException
> Standard exceptions communicate contract violations clearly.

? What does exception translation mean?
+ Catching a lower-level exception and throwing one at the current layer's abstraction, with the cause
- Converting checked exceptions to strings
- Translating messages to another language
> Upper layers stay independent of implementation details.

? What happens if you call initCause on an exception constructed with a cause?
+ IllegalStateException
- The cause is replaced
- Nothing
> A cause can be set only once.
```

## Key takeaways

- Create custom exceptions when callers **handle them differently** or need **domain data**; otherwise use standard ones.
- Prefer **unchecked** custom exceptions; keep a **small hierarchy** per module with useful fields and error codes.
- **Always chain the cause** when wrapping; walk `getCause()` to the root.
- **Translate** exceptions at layer boundaries; map them to responses in **one** place.
- Keep messages informative but free of secrets and internals.
