## Problem statement

Design the payment workflow of a checkout service. A payment is **authorized** (funds reserved on the card), later **captured** (money actually taken — possibly less than authorized), may be **voided** before capture, and can be **refunded** in part or in full after capture. Two external payment providers with different SDKs are available; requests are routed between them. Clients and networks retry, so every operation must be **idempotent**: a retried request must never charge or refund twice.

> [!TIP] Try it first
> Draw the payment state machine and mark which transitions call the provider. Then ask, for each one: "the network dropped the response — what happens when the client retries?"

## Clarifying questions

1. Which operations: authorize, capture, void, refund? Partial capture? Partial refunds?
2. How are providers chosen? What if one is down?
3. How do clients make retries safe?
4. What if a key is reused with a different amount?
5. Money: currencies, precision?
6. Can two operations on the same payment run at the same time?

````reveal title="Answers we'll assume"
- Authorize → capture (up to the authorized amount, once) → refunds (any number, total ≤ captured). Void is allowed only before capture.
- **Routing by currency** (INR prefers provider Acme, then Globex; USD uses Globex). If the first provider **refuses the connection**, fail over to the next. A **decline** is final — never "try another provider" for a declined card.
- Every mutating call carries an **idempotency key**. The same key with the same request returns the **stored result** without calling the provider again.
- Same key with a **different** request → rejected (it's a client bug).
- Money is an integer number of minor units plus a currency.
- Operations on one payment are serialised; different payments run in parallel.
````

## Requirements

**Functional**

1. `authorize(key, card, amount)`, `capture(key, paymentId, amount)`, `voidPayment(paymentId)`, `refund(key, paymentId, amount)`.
2. Strict state machine; illegal transitions rejected with clear errors.
3. Amount rules: capture ≤ authorized; total refunds ≤ captured; same currency.
4. Provider routing with failover for unavailability only.
5. Idempotency per key with request fingerprinting.

**Non-functional**

6. Providers plug in through adapters; their SDK types never leak into the service.
7. Concurrent duplicate requests produce one provider call.
8. A full status history per payment for audit.

## Step 1 — Payment lifecycle

```states title="Payment"
[*] --> CREATED
CREATED --> AUTHORIZED : authorize [provider approves]
CREATED --> DECLINED : authorize [provider declines]
AUTHORIZED --> CAPTURED : capture [amount <= authorized]
AUTHORIZED --> VOIDED : void
CAPTURED --> PARTIALLY_REFUNDED : refund [total < captured]
CAPTURED --> REFUNDED : refund [total == captured]
PARTIALLY_REFUNDED --> PARTIALLY_REFUNDED : refund [total < captured]
PARTIALLY_REFUNDED --> REFUNDED : refund [total == captured]
DECLINED --> [*]
VOIDED --> [*]
REFUNDED --> [*]
```

## Step 2 — Providers: adapters plus a template

````reveal title="Two SDKs, one interface"
The providers' SDKs look nothing alike: Acme takes **decimal strings** and returns status words; Globex takes **integer cents** and returns numeric codes. Each gets an **adapter** implementing our `PaymentProvider` interface.

The adapters share a fixed sequence for every call: check the currency is supported → count the call → invoke the vendor → **translate vendor errors** into ours (`ProviderDeclinedException`, `ProviderUnavailableException`). That sequence lives once in an abstract `ProviderAdapter` (**Template Method**); subclasses fill in `doAuthorize`, `doCapture`, … and `translate`.
````

````reveal title="Idempotency: key + fingerprint + stored result"
```text
authorize(key=k1, card, 1500 INR)   -> no record for k1: run, store {fingerprint, result}
authorize(key=k1, card, 1500 INR)   -> record found, same fingerprint:
                                       return stored result (no provider call)
authorize(key=k1, card, 9999 INR)   -> record found, different fingerprint: reject
```

The check-run-store sequence holds a **per-key lock**, so two simultaneous requests with the same key can't both reach the provider. Failures are not stored: a request that failed (say, every provider was down) can be retried with the same key.
````

## Step 3 — Class design

```uml title="Payment workflow"
class PaymentService
  - payments: Map<String, Payment>
  - routing: RoutingStrategy
  - idempotency: IdempotencyStore
  + authorize(key: String, card: String, amount: Money): Payment
  + capture(key: String, paymentId: String, amount: Money): Payment
  + voidPayment(paymentId: String): Payment
  + refund(key: String, paymentId: String, amount: Money): Payment
class Payment
  - status: PaymentStatus
  - authorized: Money
  - captured: Money
  - refunded: Money
  - provider: PaymentProvider
  - history: List<PaymentStatus>
interface PaymentProvider
  + authorize(card: String, amount: Money): String
  + capture(ref: String, amount: Money): void
  + voidAuthorization(ref: String): void
  + refund(ref: String, amount: Money): void
abstract class ProviderAdapter
  # doAuthorize(card: String, amount: Money): String
  # translate(vendorError: RuntimeException): PaymentException
class AcmePayAdapter
class GlobexAdapter
interface RoutingStrategy
  + candidates(amount: Money): List<PaymentProvider>
class CurrencyRouting
class IdempotencyStore
  + run(key: String, fingerprint: String, action: Supplier): T
record Money
  + minor: long
  + currency: String
PaymentService o-- "0..*" Payment
PaymentService --> RoutingStrategy
PaymentService --> IdempotencyStore
Payment --> PaymentProvider
ProviderAdapter ..|> PaymentProvider
AcmePayAdapter --|> ProviderAdapter
GlobexAdapter --|> ProviderAdapter
CurrencyRouting ..|> RoutingStrategy
```

## Step 4 — Implementation

````hint title="Hint — failover only when it's provably safe"
Fail over to another provider only if the first one **did not accept** the request (connection refused, provider in maintenance). A **timeout** is ambiguous — the card may already be authorized — so retrying elsewhere could reserve the customer's money twice. Treat timeouts as "unknown" and reconcile instead (see the follow-ups).
````

````solution title="Complete Java solution"
```java title="PaymentDemo.java" file="PaymentDemo.java"
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;

public class PaymentDemo {
    public static void main(String[] args) {
        AcmePayClient acmeSdk = new AcmePayClient();
        AcmePayAdapter acme = new AcmePayAdapter(acmeSdk);
        GlobexAdapter globex = new GlobexAdapter(new GlobexGateway());
        PaymentService service = new PaymentService(new CurrencyRouting(Map.of("INR", List.of(acme, globex), "USD", List.of(globex))));

        Payment p1 = service.authorize("k1", "4111-1111", Money.of("1500.00", "INR"));
        System.out.println(p1);
        System.out.println("retry with key k1 -> " + service.authorize("k1", "4111-1111", Money.of("1500.00", "INR")).id()
                + " (acme calls so far: " + acme.calls() + ")");
        attempt(() -> service.authorize("k1", "4111-1111", Money.of("9999.00", "INR")));
        System.out.println("capture 1000.00 -> " + service.capture("c1", p1.id(), Money.of("1000.00", "INR")).status());
        System.out.println("refund 300.00 -> " + service.refund("r1", p1.id(), Money.of("300.00", "INR")).status());
        System.out.println("retry refund r1 -> refunded " + service.refund("r1", p1.id(), Money.of("300.00", "INR")).refunded());
        attempt(() -> service.refund("r2", p1.id(), Money.of("800.00", "INR")));
        System.out.println("refund 700.00 -> " + service.refund("r3", p1.id(), Money.of("700.00", "INR")).status());
        attempt(() -> service.voidPayment(p1.id()));

        acmeSdk.setDown(true);
        Payment p2 = service.authorize("k2", "4111-1111", Money.of("250.00", "INR"));
        acmeSdk.setDown(false);
        System.out.println("acme down -> " + p2 + " (failover)");
        System.out.println(service.authorize("k3", "4000-0002", Money.of("80.00", "INR")));
        System.out.println("void " + p2.id() + " -> " + service.voidPayment(p2.id()).status());
        System.out.println(p1.id() + " history: " + p1.history());
        System.out.println("provider calls: acme " + acme.calls() + ", globex " + globex.calls());
    }

    static void attempt(Runnable action) {
        try {
            action.run();
        } catch (PaymentException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
    }
}

// ---------- Money and errors ----------

record Money(long minor, String currency) {
    static Money of(String amount, String currency) { return new Money(new BigDecimal(amount).movePointRight(2).longValueExact(), currency); }
    static Money zero(String currency) { return new Money(0, currency); }

    Money plus(Money o) { same(o); return new Money(minor + o.minor, currency); }
    Money minus(Money o) { same(o); return new Money(minor - o.minor, currency); }
    boolean greaterThan(Money o) { same(o); return minor > o.minor; }
    String decimal() { return BigDecimal.valueOf(minor, 2).toPlainString(); }

    private void same(Money o) {
        if (!currency.equals(o.currency)) throw new PaymentException("currency mismatch: " + currency + " vs " + o.currency);
    }

    @Override public String toString() { return decimal() + " " + currency; }
}

class PaymentException extends RuntimeException {
    PaymentException(String message) { super(message); }
}

/** The card was declined: final, never retried elsewhere. */
final class ProviderDeclinedException extends PaymentException {
    ProviderDeclinedException(String reason) { super(reason); }
}

/** The provider did not accept the request at all: safe to try another provider. */
final class ProviderUnavailableException extends PaymentException {
    ProviderUnavailableException(String message) { super(message); }
}

// ---------- Vendor SDKs (we can't change these) ----------

record AcmeResponse(String status, String id, String reason) {}

class AcmeConnectionRefused extends RuntimeException {}

/** Acme: decimal strings in, status words out. */
class AcmePayClient {
    private final AtomicLong seq = new AtomicLong();
    private volatile boolean down;

    void setDown(boolean down) { this.down = down; }

    AcmeResponse charge(String cardToken, String amount, String currency, boolean captureLater) {
        if (down) throw new AcmeConnectionRefused();
        if (cardToken.endsWith("0002")) return new AcmeResponse("declined", null, "insufficient_funds");
        return new AcmeResponse("approved", "acme_" + seq.incrementAndGet(), null);
    }

    AcmeResponse settle(String chargeId, String amount) { return ok(); }
    AcmeResponse cancel(String chargeId) { return ok(); }
    AcmeResponse refund(String chargeId, String amount) { return ok(); }

    private AcmeResponse ok() {
        if (down) throw new AcmeConnectionRefused();
        return new AcmeResponse("approved", null, null);
    }
}

class GlobexError extends RuntimeException {
    final int code;
    GlobexError(int code) { super("globex error " + code); this.code = code; }
}

/** Globex: integer cents in, numeric codes out (negative = declined). */
class GlobexGateway {
    private final AtomicInteger seq = new AtomicInteger(1000);

    int auth(String pan, long cents, String currency) { return pan.endsWith("0002") ? -51 : seq.incrementAndGet(); }
    int capture(int authId, long cents) { return 0; }
    int reverse(int authId) { return 0; }
    int credit(int authId, long cents) { return 0; }
}

// ---------- Our provider port, a template, and two adapters ----------

interface PaymentProvider {
    String name();
    String authorize(String card, Money amount);
    void capture(String ref, Money amount);
    void voidAuthorization(String ref);
    void refund(String ref, Money amount);
}

/** Template method: every call checks the currency, counts, invokes the vendor and translates its errors. */
abstract class ProviderAdapter implements PaymentProvider {
    private final String name;
    private final Set<String> currencies;
    private final AtomicInteger calls = new AtomicInteger();

    ProviderAdapter(String name, Set<String> currencies) {
        this.name = name;
        this.currencies = currencies;
    }

    public final String name() { return name; }
    final int calls() { return calls.get(); }

    public final String authorize(String card, Money amount) { return call(amount, () -> doAuthorize(card, amount)); }
    public final void capture(String ref, Money amount) { call(amount, () -> { doCapture(ref, amount); return null; }); }
    public final void voidAuthorization(String ref) { call(null, () -> { doVoid(ref); return null; }); }
    public final void refund(String ref, Money amount) { call(amount, () -> { doRefund(ref, amount); return null; }); }

    private <T> T call(Money amount, Supplier<T> vendorCall) {
        if (amount != null && !currencies.contains(amount.currency())) throw new PaymentException(name + " does not support " + amount.currency());
        calls.incrementAndGet();
        try {
            return vendorCall.get();
        } catch (PaymentException e) {
            throw e;
        } catch (RuntimeException vendorError) {
            throw translate(vendorError);
        }
    }

    protected abstract String doAuthorize(String card, Money amount);
    protected abstract void doCapture(String ref, Money amount);
    protected abstract void doVoid(String ref);
    protected abstract void doRefund(String ref, Money amount);
    protected abstract PaymentException translate(RuntimeException vendorError);
}

final class AcmePayAdapter extends ProviderAdapter {
    private final AcmePayClient client;

    AcmePayAdapter(AcmePayClient client) {
        super("acme", Set.of("INR"));
        this.client = client;
    }

    protected String doAuthorize(String card, Money amount) {
        AcmeResponse r = client.charge(card, amount.decimal(), amount.currency(), true);
        if (!"approved".equals(r.status())) throw new ProviderDeclinedException(r.reason());
        return r.id();
    }

    protected void doCapture(String ref, Money amount) { client.settle(ref, amount.decimal()); }
    protected void doVoid(String ref) { client.cancel(ref); }
    protected void doRefund(String ref, Money amount) { client.refund(ref, amount.decimal()); }

    protected PaymentException translate(RuntimeException e) {
        return e instanceof AcmeConnectionRefused ? new ProviderUnavailableException("acme refused the connection") : new PaymentException("acme: " + e);
    }
}

final class GlobexAdapter extends ProviderAdapter {
    private final GlobexGateway gateway;

    GlobexAdapter(GlobexGateway gateway) {
        super("globex", Set.of("INR", "USD"));
        this.gateway = gateway;
    }

    protected String doAuthorize(String card, Money amount) {
        int result = gateway.auth(card, amount.minor(), amount.currency());
        if (result < 0) throw new ProviderDeclinedException("declined (code " + (-result) + ")");
        return String.valueOf(result);
    }

    protected void doCapture(String ref, Money amount) { check(gateway.capture(Integer.parseInt(ref), amount.minor())); }
    protected void doVoid(String ref) { check(gateway.reverse(Integer.parseInt(ref))); }
    protected void doRefund(String ref, Money amount) { check(gateway.credit(Integer.parseInt(ref), amount.minor())); }

    private static void check(int code) {
        if (code != 0) throw new GlobexError(code);
    }

    protected PaymentException translate(RuntimeException e) {
        return e instanceof GlobexError g && g.code == 503 ? new ProviderUnavailableException("globex unavailable") : new PaymentException("globex: " + e.getMessage());
    }
}

// ---------- Routing strategy ----------

interface RoutingStrategy { List<PaymentProvider> candidates(Money amount); }

final class CurrencyRouting implements RoutingStrategy {
    private final Map<String, List<PaymentProvider>> byCurrency;
    CurrencyRouting(Map<String, List<PaymentProvider>> byCurrency) { this.byCurrency = Map.copyOf(byCurrency); }
    public List<PaymentProvider> candidates(Money amount) { return byCurrency.getOrDefault(amount.currency(), List.of()); }
}

// ---------- State machine ----------

enum PaymentStatus {
    CREATED, AUTHORIZED, DECLINED, CAPTURED, VOIDED, PARTIALLY_REFUNDED, REFUNDED;

    boolean canMoveTo(PaymentStatus next) {
        return switch (this) {
            case CREATED -> next == AUTHORIZED || next == DECLINED;
            case AUTHORIZED -> next == CAPTURED || next == VOIDED;
            case CAPTURED, PARTIALLY_REFUNDED -> next == PARTIALLY_REFUNDED || next == REFUNDED;
            case DECLINED, VOIDED, REFUNDED -> false;
        };
    }
}

final class Payment {
    private final String id;
    private final Money authorized;
    private final List<PaymentStatus> history = new ArrayList<>(List.of(PaymentStatus.CREATED));
    private PaymentStatus status = PaymentStatus.CREATED;
    private Money captured;
    private Money refunded;
    private PaymentProvider provider;
    private String providerRef;
    private String declineReason;

    Payment(String id, Money authorized) {
        this.id = id;
        this.authorized = authorized;
        this.captured = Money.zero(authorized.currency());
        this.refunded = Money.zero(authorized.currency());
    }

    String id() { return id; }
    Money authorized() { return authorized; }
    synchronized PaymentStatus status() { return status; }
    synchronized Money captured() { return captured; }
    synchronized Money refunded() { return refunded; }
    synchronized List<PaymentStatus> history() { return List.copyOf(history); }
    PaymentProvider provider() { return provider; }
    String providerRef() { return providerRef; }

    synchronized void require(String operation, PaymentStatus... allowed) {
        for (PaymentStatus s : allowed) if (s == status) return;
        throw new PaymentException("cannot " + operation + " " + id + " in status " + status);
    }

    synchronized void authorizedBy(PaymentProvider p, String ref) { provider = p; providerRef = ref; moveTo(PaymentStatus.AUTHORIZED); }
    synchronized void declined(String reason) { declineReason = reason; moveTo(PaymentStatus.DECLINED); }
    synchronized void captured(Money amount) { captured = amount; moveTo(PaymentStatus.CAPTURED); }
    synchronized void voided() { moveTo(PaymentStatus.VOIDED); }

    synchronized void refunded(Money amount) {
        refunded = refunded.plus(amount);
        moveTo(refunded.minor() == captured.minor() ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED);
    }

    private void moveTo(PaymentStatus next) {
        if (!status.canMoveTo(next)) throw new IllegalStateException(status + " -> " + next);
        status = next;
        history.add(next);
    }

    @Override public synchronized String toString() {
        return id + " " + status + " " + authorized + (provider == null ? "" : " via " + provider.name())
                + (declineReason == null ? "" : " (" + declineReason + ")");
    }
}

// ---------- Idempotency ----------

final class IdempotencyStore {
    private record Stored(String fingerprint, Object result) {}

    private final Map<String, Stored> results = new ConcurrentHashMap<>();
    private final Map<String, Object> locks = new ConcurrentHashMap<>();

    /** Runs the action at most once per key; failures are not stored, so they may be retried. */
    @SuppressWarnings("unchecked")
    <T> T run(String key, String fingerprint, Supplier<T> action) {
        synchronized (locks.computeIfAbsent(key, k -> new Object())) {
            Stored s = results.get(key);
            if (s != null) {
                if (!s.fingerprint().equals(fingerprint)) throw new PaymentException("idempotency key " + key + " was used for a different request");
                return (T) s.result();
            }
            T result = action.get();
            results.put(key, new Stored(fingerprint, result));
            return result;
        }
    }
}

// ---------- Service ----------

final class PaymentService {
    private final Map<String, Payment> payments = new ConcurrentHashMap<>();
    private final IdempotencyStore idempotency = new IdempotencyStore();
    private final RoutingStrategy routing;
    private final AtomicLong ids = new AtomicLong();

    PaymentService(RoutingStrategy routing) { this.routing = routing; }

    Payment authorize(String key, String card, Money amount) {
        return idempotency.run(key, "authorize|" + card + "|" + amount, () -> {
            if (amount.minor() <= 0) throw new PaymentException("amount must be positive");
            Payment p = new Payment("pay_" + ids.incrementAndGet(), amount);
            payments.put(p.id(), p);
            for (PaymentProvider provider : routing.candidates(amount)) {
                try {
                    p.authorizedBy(provider, provider.authorize(card, amount));
                    return p;
                } catch (ProviderDeclinedException e) {
                    p.declined(e.getMessage());                    // final: a decline is not a reason to try elsewhere
                    return p;
                } catch (ProviderUnavailableException e) {
                    // the provider never accepted the request: safe to fail over
                }
            }
            payments.remove(p.id());                               // nothing happened anywhere: don't keep a CREATED orphan
            throw new PaymentException("no provider available for " + amount.currency());
        });
    }

    Payment capture(String key, String paymentId, Money amount) {
        return idempotency.run(key, "capture|" + paymentId + "|" + amount, () -> {
            Payment p = find(paymentId);
            synchronized (p) {                                     // one operation per payment at a time
                p.require("capture", PaymentStatus.AUTHORIZED);
                if (amount.minor() <= 0 || amount.greaterThan(p.authorized())) throw new PaymentException("capture must be 0 < amount <= " + p.authorized());
                p.provider().capture(p.providerRef(), amount);
                p.captured(amount);
            }
            return p;
        });
    }

    /** Idempotent by state: voiding a voided payment is a no-op. */
    Payment voidPayment(String paymentId) {
        Payment p = find(paymentId);
        synchronized (p) {
            if (p.status() == PaymentStatus.VOIDED) return p;
            p.require("void", PaymentStatus.AUTHORIZED);
            p.provider().voidAuthorization(p.providerRef());
            p.voided();
        }
        return p;
    }

    Payment refund(String key, String paymentId, Money amount) {
        return idempotency.run(key, "refund|" + paymentId + "|" + amount, () -> {
            Payment p = find(paymentId);
            synchronized (p) {
                p.require("refund", PaymentStatus.CAPTURED, PaymentStatus.PARTIALLY_REFUNDED);
                Money refundable = p.captured().minus(p.refunded());
                if (amount.minor() <= 0 || amount.greaterThan(refundable)) throw new PaymentException("refund " + amount + " exceeds refundable " + refundable);
                p.provider().refund(p.providerRef(), amount);
                p.refunded(amount);
            }
            return p;
        });
    }

    private Payment find(String id) {
        Payment p = payments.get(id);
        if (p == null) throw new PaymentException("no payment " + id);
        return p;
    }
}
```
````

## Design decisions

- **A strict state machine.** `PaymentStatus.canMoveTo` lists every legal transition; `Payment` refuses anything else. Business checks (`require`, amount limits) run **before** calling the provider, so an illegal request never moves money (see [State machines](lesson:state-machines)).
- **Adapters at the edge.** Each SDK's types (decimal strings, numeric codes, its exceptions) stop at its adapter. Adding a provider is one adapter class and a routing entry (see [Adapter](lesson:adapter)).
- **Template Method for the shared steps.** Currency check, metrics and error translation are written once in `ProviderAdapter`; adapters fill in only the vendor-specific calls (see [Template Method](lesson:template-method)).
- **Routing is a strategy.** By currency today; by cost, success rate or card network tomorrow — without touching the service (see [Strategy](lesson:strategy)).
- **Idempotency with fingerprints.** The key identifies the request; the fingerprint catches clients that reuse a key for something else. Stored results make retries cheap and provider-free (see [Idempotency](lesson:idempotency)).
- **Typed failures.** `ProviderDeclinedException` (final), `ProviderUnavailableException` (fail over), plain `PaymentException` (bad request) — the service reacts differently to each (see [Domain exceptions](lesson:domain-exceptions)).

## Patterns and principles

[State](lesson:state-machines) (payment lifecycle), [Strategy](lesson:strategy) (`RoutingStrategy`), [Adapter](lesson:adapter) (`AcmePayAdapter`, `GlobexAdapter`), [Template Method](lesson:template-method) (`ProviderAdapter`), [idempotency](lesson:idempotency), and [domain exceptions](lesson:domain-exceptions).

## Example execution flow

```text
authorize(k1, 1500 INR)   no record for k1 -> route INR: [acme, globex]
                          acme approves -> pay_1 AUTHORIZED; store result
authorize(k1, same)       record found, same fingerprint -> pay_1, no provider call
authorize(k1, 9999 INR)   record found, different fingerprint -> rejected
capture(c1, 1000)         AUTHORIZED, 1000 <= 1500 -> acme.settle -> CAPTURED
refund(r1, 300)           refundable 1000 -> acme.refund -> PARTIALLY_REFUNDED; retry r1 -> stored result
refund(r2, 800)           refundable 700 -> rejected before calling acme
refund(r3, 700)           -> REFUNDED; void -> not AUTHORIZED -> rejected
acme down: authorize(k2)  acme refuses the connection -> fail over -> globex approves
authorize(k3, card ...0002) acme declines -> DECLINED, no failover
```

```text title="Program output"
pay_1 AUTHORIZED 1500.00 INR via acme
retry with key k1 -> pay_1 (acme calls so far: 1)
Rejected: idempotency key k1 was used for a different request
capture 1000.00 -> CAPTURED
refund 300.00 -> PARTIALLY_REFUNDED
retry refund r1 -> refunded 300.00 INR
Rejected: refund 800.00 INR exceeds refundable 700.00 INR
refund 700.00 -> REFUNDED
Rejected: cannot void pay_1 in status REFUNDED
acme down -> pay_2 AUTHORIZED 250.00 INR via globex (failover)
pay_3 DECLINED 80.00 INR (insufficient_funds)
void pay_2 -> VOIDED
pay_1 history: [CREATED, AUTHORIZED, CAPTURED, PARTIALLY_REFUNDED, REFUNDED]
provider calls: acme 6, globex 2
```

## Edge cases

- **Retry after a lost response** → same key, same request → stored result, no second charge or refund.
- **Key reused for a different request** → rejected.
- **Capture more than authorized, or twice** → rejected (amount check, then state).
- **Refunds adding up past the captured amount** → rejected before calling the provider.
- **Void after capture / refund before capture** → illegal transition.
- **Every provider unavailable** → error, nothing stored under the key; the client may retry later with the same key.
- **Currency mismatch** → rejected by `Money`.

## Tests

```java title="PaymentTest.java" file="PaymentTest.java" test="PaymentDemo.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class PaymentTest {
    private AcmePayClient acmeSdk;
    private AcmePayAdapter acme;
    private GlobexAdapter globex;
    private PaymentService service;

    private static Money inr(String amount) { return Money.of(amount, "INR"); }

    @BeforeEach
    void setUp() {
        acmeSdk = new AcmePayClient();
        acme = new AcmePayAdapter(acmeSdk);
        globex = new GlobexAdapter(new GlobexGateway());
        service = new PaymentService(new CurrencyRouting(Map.of("INR", List.of(acme, globex), "USD", List.of(globex))));
    }

    @Test
    void fullLifecycleWithPartialRefunds() {
        Payment p = service.authorize("a", "4111", inr("100.00"));
        service.capture("c", p.id(), inr("80.00"));
        service.refund("r1", p.id(), inr("30.00"));
        service.refund("r2", p.id(), inr("50.00"));
        assertEquals(PaymentStatus.REFUNDED, p.status());
        assertEquals(List.of(PaymentStatus.CREATED, PaymentStatus.AUTHORIZED, PaymentStatus.CAPTURED,
                PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED), p.history());
    }

    @Test
    void retriesWithTheSameKeyDoNotCallTheProviderAgain() {
        Payment p = service.authorize("a", "4111", inr("100.00"));
        service.capture("c", p.id(), inr("100.00"));
        assertSame(p, service.authorize("a", "4111", inr("100.00")));
        service.capture("c", p.id(), inr("100.00"));
        assertEquals(2, acme.calls());
        assertThrows(PaymentException.class, () -> service.capture("c", p.id(), inr("50.00")));
    }

    @Test
    void concurrentDuplicatesCreateOnePayment() throws InterruptedException {
        List<Payment> results = Collections.synchronizedList(new ArrayList<>());
        ExecutorService pool = Executors.newFixedThreadPool(8);
        CountDownLatch go = new CountDownLatch(1);
        for (int i = 0; i < 50; i++) pool.submit(() -> { go.await(); results.add(service.authorize("same", "4111", inr("10.00"))); return null; });
        go.countDown();
        pool.shutdown();
        pool.awaitTermination(10, TimeUnit.SECONDS);
        assertEquals(50, results.size());
        assertEquals(1, results.stream().distinct().count());
        assertEquals(1, acme.calls());
    }

    @Test
    void amountsAndTransitionsAreEnforced() {
        Payment p = service.authorize("a", "4111", inr("100.00"));
        assertThrows(PaymentException.class, () -> service.refund("r", p.id(), inr("1.00")));
        assertThrows(PaymentException.class, () -> service.capture("c1", p.id(), inr("100.01")));
        service.voidPayment(p.id());
        service.voidPayment(p.id());                                           // idempotent
        assertThrows(PaymentException.class, () -> service.capture("c2", p.id(), inr("10.00")));
        assertThrows(PaymentException.class, () -> service.capture("c3", p.id(), Money.of("10.00", "USD")));
    }

    @Test
    void failoverOnUnavailabilityButNotOnDecline() {
        acmeSdk.setDown(true);
        assertEquals("globex", service.authorize("a", "4111", inr("10.00")).provider().name());
        acmeSdk.setDown(false);
        Payment declined = service.authorize("b", "4000-0002", inr("10.00"));
        assertEquals(PaymentStatus.DECLINED, declined.status());
        assertEquals(1, globex.calls());
    }

    @Test
    void failedRequestsCanBeRetriedWithTheSameKey() {
        PaymentService acmeOnly = new PaymentService(new CurrencyRouting(Map.of("INR", List.of(acme))));
        acmeSdk.setDown(true);
        assertThrows(PaymentException.class, () -> acmeOnly.authorize("k", "4111", inr("10.00")));
        acmeSdk.setDown(false);
        assertEquals(PaymentStatus.AUTHORIZED, acmeOnly.authorize("k", "4111", inr("10.00")).status());
    }
}
```

## Concurrency

- **Same key, same moment:** the per-key lock in `IdempotencyStore` lets one request run; the others wait and then receive its stored result.
- **Same payment, different operations** (a capture and a void racing): both run inside `synchronized (payment)`, and each re-checks the state first, so only one wins.
- **Holding the payment lock during the provider call** serialises operations on that payment — acceptable, since they must be ordered anyway, and other payments are unaffected. A large system would instead persist an intermediate state (`CAPTURING`) and release the lock.
- **In a database:** the idempotency table has a unique key on `idempotency_key`; insert a "pending" row first (the insert is the lock), call the provider, then store the response on that row.

## Common mistakes and alternatives

- **No idempotency keys** — a double-click or a retry after a timeout charges twice.
- **Failing over after a timeout** — the first provider may have authorized; now the customer has two holds.
- **Retrying a decline on another provider** — looks like card testing to fraud systems, and annoys the bank.
- **`double` for amounts** — rounding errors in refunds.
- **Leaking SDK classes** (Acme's response objects) into the service — switching providers means rewriting business logic.
- **Alternative:** the State pattern with a class per status — useful if statuses get rich behaviour; for a transition table plus guards, an enum is clearer.

## Follow-up questions

````reveal title="Timeouts and reconciliation"
Model an `UNKNOWN` outcome: the provider timed out, so the payment moves to `PENDING_CONFIRMATION`. A reconciliation job queries the provider by our idempotency key (most providers support lookup by it) and moves the payment to `AUTHORIZED` or `DECLINED`. Until then, the client sees "processing".
````

````reveal title="Webhooks from providers"
Providers notify asynchronous events (chargebacks, delayed captures) via webhooks. Verify the signature, look up the payment by provider reference, and apply the transition through the same state machine — idempotently, because webhooks are delivered at least once (dedupe by the provider's event ID).
````

````reveal title="Smarter routing"
`RoutingStrategy` can rank providers by recent success rate and fees, kept in a sliding window per provider. Add a circuit breaker per provider: after N consecutive "unavailable" errors, skip it for a cool-down period instead of paying the connection timeout on every request.
````

## Complexity

- Every operation: O(1) plus the provider call; idempotency lookups are O(1).
- Memory: one stored result per idempotency key (expire them after the retry window, e.g. 24 hours).

## Interviewer checklist

- [ ] State machine with authorize/capture/void/refund and amount rules
- [ ] Idempotency keys with fingerprinting; concurrent duplicates handled
- [ ] Adapters per provider; template for shared steps; error translation
- [ ] Routing strategy; failover only when safe; declines are final
- [ ] Integer money; currency checks
- [ ] Timeouts, reconciliation and webhooks discussed
