## Beyond "throw an exception"

[Exception Handling](lesson:exception-handling) covered the Java mechanics. This lesson is about **designing** error handling for a domain:

- Which failures are **business outcomes** (seat taken, insufficient funds) and which are **bugs or infrastructure problems** (null pointer, database down)?
- Should a failure be an **exception**, an **`Optional`**, or a **result object**?
- Which **layer** catches, translates or reports each failure?

Good answers make your API honest about what can go wrong, and let callers react appropriately: retry, show a message, compensate, or crash loudly.

## Three categories of failure

| Category | Examples | Typical handling |
|---|---|---|
| **Domain rejection** (expected) | Seat unavailable, limit exceeded, invalid state transition, coupon expired | Domain exception or result type; shown to the user; **not** retried |
| **Programming error** (bug) | Null where forbidden, negative quantity passed internally, illegal argument | `IllegalArgumentException`/`IllegalStateException`; fail fast; fix the code |
| **Infrastructure failure** (transient or external) | Timeout, DB unavailable, provider 503 | Translate at the boundary; maybe **retry** (with [idempotency](lesson:idempotency)); alert |

Mixing these up causes real damage: retrying a domain rejection ("insufficient funds") pointlessly, or showing a stack trace for a timeout.

## A domain exception hierarchy

```java title="A small hierarchy with codes and context" file="DomainExceptionsDemo.java"
import java.util.HashMap;
import java.util.Map;

public class DomainExceptionsDemo {
    public static void main(String[] args) {
        WalletService wallets = new WalletService(new FlakyLedger());
        wallets.open("W1", 500);

        for (long amount : new long[]{200, 1_000, 100, 50}) {   // the 3rd ledger write times out
            System.out.println("pay " + amount + " -> " + ApiLayer.handle(() -> wallets.pay("W1", amount)));
        }
        System.out.println("unknown -> " + ApiLayer.handle(() -> wallets.pay("W9", 10)));
    }
}

/** Base class: every expected business failure. Carries a stable code for clients. */
abstract class DomainException extends RuntimeException {
    private final String code;
    protected DomainException(String code, String message) { super(message); this.code = code; }
    String code() { return code; }
}

final class InsufficientBalanceException extends DomainException {
    private final long shortfall;
    InsufficientBalanceException(String walletId, long shortfall) {
        super("INSUFFICIENT_BALANCE", "wallet " + walletId + " is short by " + shortfall);
        this.shortfall = shortfall;
    }
    long shortfall() { return shortfall; }
}

final class WalletNotFoundException extends DomainException {
    WalletNotFoundException(String walletId) { super("WALLET_NOT_FOUND", "no wallet " + walletId); }
}

/** Infrastructure failure, translated at the boundary. Not a DomainException. */
final class LedgerUnavailableException extends RuntimeException {
    LedgerUnavailableException(String message, Throwable cause) { super(message, cause); }
}

interface Ledger { void record(String walletId, long amount); }

/** Simulates an external store that times out on every third call. */
class FlakyLedger implements Ledger {
    private int calls;
    public void record(String walletId, long amount) {
        if (++calls % 3 == 0) throw new IllegalStateException("socket timeout");   // "vendor" exception
    }
}

class WalletService {
    private final Map<String, Long> balances = new HashMap<>();
    private final Ledger ledger;

    WalletService(Ledger ledger) { this.ledger = ledger; }

    void open(String id, long initial) { balances.put(id, initial); }

    long pay(String walletId, long amount) {
        if (amount <= 0) throw new IllegalArgumentException("amount must be positive");   // programming error
        Long balance = balances.get(walletId);
        if (balance == null) throw new WalletNotFoundException(walletId);                   // domain rejection
        if (balance < amount) throw new InsufficientBalanceException(walletId, amount - balance);
        try {
            ledger.record(walletId, -amount);
        } catch (RuntimeException e) {                                                      // infrastructure
            throw new LedgerUnavailableException("ledger write failed for " + walletId, e);
        }
        balances.put(walletId, balance - amount);   // mutate only after the external write succeeded
        return balance - amount;
    }
}

/** The outermost layer maps each category to a response. */
final class ApiLayer {
    static String handle(java.util.function.LongSupplier action) {
        try {
            return "200 OK balance=" + action.getAsLong();
        } catch (InsufficientBalanceException e) {
            return "422 " + e.code() + " (short by " + e.shortfall() + ")";
        } catch (DomainException e) {
            return "422 " + e.code() + ": " + e.getMessage();
        } catch (LedgerUnavailableException e) {
            return "503 try again later (" + e.getCause().getMessage() + ")";
        } catch (IllegalArgumentException e) {
            return "400 bad request: " + e.getMessage();
        }
    }
}
```

Design choices worth noting:

- **Stable error codes** (`INSUFFICIENT_BALANCE`) for clients and dashboards; messages are for humans.
- **Structured fields** (`shortfall`) so callers don't parse messages.
- **Infrastructure failures are translated** into one exception type that keeps the cause.
- **State changes happen after** the external call succeeds, so a failure leaves no partial update.
- **One place** (the API layer) maps categories to responses; the domain doesn't know about HTTP.

## Exceptions, Optional or result types?

| Situation | Prefer |
|---|---|
| Lookup that may legitimately find nothing | `Optional<T>` (`findById`) |
| Business rule rejection that callers often handle inline, or multiple possible errors | A **result type** (sealed interface of success and failure records) |
| Rule violation that callers usually can't handle locally; broken invariants; bugs | **Exception** |
| Validating a form with several errors to report at once | A result containing a **list of errors** |

A small result type with Java 17 sealed interfaces:

```java title="Result type for expected outcomes" file="ResultTypeDemo.java"
public class ResultTypeDemo {
    public static void main(String[] args) {
        for (String code : new String[]{"WELCOME10", "EXPIRED5", "NOPE"}) {
            CouponResult r = CouponService.apply(code, 1_000);
            // Callers must consider every outcome; there's no exception to forget to catch.
            String msg;
            if (r instanceof CouponResult.Applied a) msg = "new total " + a.newTotal();
            else if (r instanceof CouponResult.Expired e) msg = "coupon expired on " + e.expiredOn();
            else if (r instanceof CouponResult.NotFound) msg = "no such coupon";
            else throw new AssertionError(r);
            System.out.println(code + ": " + msg);
        }
    }
}

sealed interface CouponResult {
    record Applied(long newTotal) implements CouponResult {}
    record Expired(String expiredOn) implements CouponResult {}
    record NotFound() implements CouponResult {}
}

final class CouponService {
    static CouponResult apply(String code, long total) {
        return switch (code) {
            case "WELCOME10" -> new CouponResult.Applied(total - total / 10);
            case "EXPIRED5" -> new CouponResult.Expired("2025-12-31");
            default -> new CouponResult.NotFound();
        };
    }
}
```

Result types make expected outcomes **explicit in the signature**. Exceptions keep the happy path clean when failures are rare and handled far away. Choose per API; don't mix both styles for the same kind of failure.

## Where to handle errors

- **Domain layer:** *detects* rule violations and throws or returns them. Doesn't log, doesn't format messages for HTTP.
- **Application layer:** *coordinates* — compensates (release a seat if payment fails), decides retries, wraps calls in transactions.
- **Infrastructure adapters:** *translate* vendor exceptions into your own types ([Adapter](lesson:adapter)).
- **Edge (API/CLI):** *maps* errors to responses and logs unexpected ones with context.

## Real-world example

An e-commerce API returned HTTP 500 for "out of stock", so the mobile app retried automatically — three times per tap — and the alerting system paged engineers for a perfectly normal business event. Introducing `DomainException` with codes (mapped to 409/422) and reserving 5xx for infrastructure failures fixed both the retry storm and the alert fatigue.

## Common mistakes

- **One generic `BusinessException("error")`** for everything, so callers can't distinguish cases.
- **Retrying domain rejections**, or **not retrying** transient infrastructure failures.
- **Leaking infrastructure exceptions** (`SQLException`, vendor types) into the domain or the client.
- **Logging and rethrowing at every layer**, which produces duplicate stack traces.
- **Mutating state before a call that can fail**, with no compensation.

## In the interview

> [!INTERVIEW] Name your failures
> When you finish the happy path, say: *"Expected failures are domain exceptions — `SeatUnavailableException`, `HoldExpiredException` — which the API maps to 409. Gateway timeouts become `PaymentUnavailableException`; the service releases the hold and the client may retry, with an idempotency key."* That one sentence covers categories, layering, compensation and retries.

## Key takeaways

- Separate **domain rejections**, **programming errors** and **infrastructure failures**; handle each differently.
- Design a **small domain exception hierarchy** with stable codes and structured data.
- Use **`Optional`** for absence, **result types** for expected multi-outcome operations, **exceptions** for violations and rare failures.
- Detect in the domain, coordinate in the application layer, translate in adapters, map at the edge.

## Knowledge check

```quiz
? A payment provider times out. What category of failure is this, and what's a reasonable handling?
+ Infrastructure failure: translate it, compensate or keep state consistent, and allow a safe (idempotent) retry
- Domain rejection: tell the user their card is invalid
- Programming error: crash the process
> Timeouts are transient infrastructure problems, not business rejections.

? Why give domain exceptions stable error codes?
+ So clients, dashboards and translations can react reliably without parsing messages
- Codes make exceptions faster
- Java requires it
> Codes are a stable contract; messages are for humans.

? When is a sealed result type preferable to throwing?
- When the failure is a programming bug
+ When several expected outcomes exist and callers should handle each explicitly
- Never
> Result types make expected outcomes part of the signature.
```

## Exercise

Design the error handling for a **movie seat booking** `book(showId, seats, userId, card)` operation. List every failure you can think of, classify each one (domain / programming / infrastructure), choose exception vs result type, and say which layer handles it and how (including compensation).

````hint title="Hint"
Think about: unknown show, show already started, seat doesn't exist, seat taken, too many seats, hold expired during payment, card declined, gateway timeout, database write failure after payment.
````

````solution title="Sample answer"
| Failure | Category | Mechanism | Handling |
|---|---|---|---|
| Unknown show / seat ID | Domain (or client bug) | `ShowNotFoundException`, `SeatNotFoundException` | 404/422 |
| Show already started | Domain | `BookingClosedException` | 422 |
| Seat taken | Domain | `SeatUnavailableException(seats)` | 409, suggest alternatives |
| More than 10 seats | Domain | `SeatLimitExceededException` | 422 |
| Null userId passed internally | Programming | `NullPointerException` via `requireNonNull` | 500, fix the code |
| Hold expired before payment completed | Domain | `HoldExpiredException` | Release, 409, ask to retry selection |
| Card declined | Domain (payment outcome) | `PaymentResult.Declined` (result type from gateway adapter) | Release seats, 402 |
| Gateway timeout | Infrastructure | `PaymentUnavailableException` | Keep hold until TTL, mark payment PENDING, reconcile or retry with an idempotency key |
| DB save fails after successful charge | Infrastructure | `PersistenceException` | Compensate: refund (idempotent), release seats, alert |

The domain (`Show`/`ShowSeat`) throws seat and hold exceptions; `BookingService` coordinates holds, payment and compensation; the gateway adapter translates vendor errors; the API layer maps to status codes. See [Movie Ticket Booking](problem:movie-ticket-booking).
````
