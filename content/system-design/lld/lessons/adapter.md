## The problem

Your design defines the interface it needs: `PaymentGateway.charge(orderId, amount)`. The provider's SDK offers something different: `createOrder(OrderRequest)` followed by `capture(String paymentId, int amountInPaise, String currency)`, with its own exception types. You can't change the SDK, and you shouldn't contaminate your domain with its vocabulary.

**Adapter** converts the interface of an existing class into the interface clients expect. It's a translator between two APIs.

## When to use it — and when not

**Use when:**

- Integrating **third-party libraries, legacy code or external services** whose API doesn't match yours.
- Supporting **multiple providers** behind one interface (each gets its own adapter).
- Keeping your domain free of vendor types, as [Dependency Inversion](lesson:dependency-inversion) requires.

**Don't use when:**

- You own both sides and can simply change one of them.
- The "adaptation" is a one-line delegation with no translation. An interface plus a direct implementation is enough.

## Core idea

- **Target** — the interface your code depends on (`PaymentGateway`).
- **Adaptee** — the existing class with the incompatible API (the vendor SDK).
- **Adapter** — implements the target and **wraps** the adaptee, translating calls, parameters, return values and exceptions.

(The *class adapter* variant uses inheritance from the adaptee; in Java, prefer the **object adapter** via composition.)

## UML

```uml title="Object Adapter"
interface PaymentGateway
  + charge(orderId: String, amount: Money): PaymentResult
class CheckoutService
class LegacyPayClient
  + createOrder(ref: String, paise: int, currency: String): String
  + capture(lpOrderId: String, paise: int, currency: String): int
class LegacyPayAdapter
  - client: LegacyPayClient
  + charge(orderId: String, amount: Money): PaymentResult
CheckoutService --> PaymentGateway
LegacyPayAdapter ..|> PaymentGateway
LegacyPayAdapter --> LegacyPayClient : wraps
```

## Java implementation

```java title="Wrapping an incompatible SDK" file="AdapterDemo.java"
public class AdapterDemo {
    public static void main(String[] args) {
        PaymentGateway gateway = new LegacyPayAdapter(new LegacyPayClient());
        CheckoutService checkout = new CheckoutService(gateway);

        System.out.println(checkout.checkout("ORD-1", new Money(49_900)));
        System.out.println(checkout.checkout("ORD-2", new Money(9_999_999)));   // SDK rejects large amounts
    }
}

// -- Our domain's vocabulary --
record Money(long paise) {}
record PaymentResult(boolean success, String reference, String failureReason) {
    static PaymentResult ok(String ref) { return new PaymentResult(true, ref, null); }
    static PaymentResult failed(String reason) { return new PaymentResult(false, null, reason); }
}

/** Target: the interface our code wants. */
interface PaymentGateway {
    PaymentResult charge(String orderId, Money amount);
}

class CheckoutService {
    private final PaymentGateway gateway;
    CheckoutService(PaymentGateway gateway) { this.gateway = gateway; }

    String checkout(String orderId, Money amount) {
        PaymentResult r = gateway.charge(orderId, amount);
        return r.success() ? orderId + " paid (" + r.reference() + ")" : orderId + " failed: " + r.failureReason();
    }
}

// -- Adaptee: a third-party SDK we cannot change --
class LegacyPayException extends Exception {
    final int code;
    LegacyPayException(int code, String msg) { super(msg); this.code = code; }
}

class LegacyPayClient {
    String createOrder(String merchantRef, int amountPaise, String currency) { return "lp_order_" + merchantRef; }

    int capture(String lpOrderId, int amountPaise, String currency) throws LegacyPayException {
        if (amountPaise > 5_000_000) throw new LegacyPayException(402, "AMOUNT_LIMIT_EXCEEDED");
        return 1;   // 1 = captured
    }
}

// -- Adapter: translates calls, types and errors --
class LegacyPayAdapter implements PaymentGateway {
    private static final String CURRENCY = "INR";
    private final LegacyPayClient client;

    LegacyPayAdapter(LegacyPayClient client) { this.client = client; }

    @Override
    public PaymentResult charge(String orderId, Money amount) {
        int paise = Math.toIntExact(amount.paise());                    // type translation
        try {
            String lpOrder = client.createOrder(orderId, paise, CURRENCY);  // two-step protocol hidden
            int status = client.capture(lpOrder, paise, CURRENCY);
            return status == 1 ? PaymentResult.ok(lpOrder) : PaymentResult.failed("status " + status);
        } catch (LegacyPayException e) {
            return PaymentResult.failed(translate(e));                   // error translation
        }
    }

    private String translate(LegacyPayException e) {
        return e.code == 402 ? "amount exceeds provider limit" : "provider error " + e.code;
    }
}
```

The domain never imports `LegacyPayClient`, never sees `LegacyPayException`, and never knows payment is a two-step protocol. Adding Stripe means writing a `StripeAdapter implements PaymentGateway`.

## Realistic use case

- Payment, SMS, email and maps providers — one adapter per vendor behind your interface ([Notification Service](problem:notification-service), [Payment Workflow](problem:payment-workflow)).
- Wrapping a legacy SOAP inventory service behind a modern `InventoryClient` interface.
- JDK examples: `Arrays.asList` (array → `List`), `InputStreamReader` (byte stream → character reader).

## Trade-offs and alternatives

- **Pros:** isolates vendor churn; a clean domain; easy testing (fake the target interface); several providers coexist.
- **Cons:** an extra layer; translation can lose information (map errors carefully); leaky abstractions if the target is shaped around one vendor.
- **Compared with similar patterns:**
  - **[Facade](lesson:facade)** *simplifies* a complex subsystem into an easier interface. An adapter *converts* one interface into another.
  - **[Decorator](lesson:decorator)** keeps the *same* interface and adds behaviour.
  - **[Proxy](lesson:proxy)** keeps the same interface and controls access.

## Recognising it in an interview

"Integrate with provider X", "support multiple SMS vendors", "the legacy system exposes…". Say: *"I'll define the interface my domain needs and write an adapter per provider."*

## Common mistakes

- **Target interfaces shaped like the vendor**, which defeats the purpose.
- **Leaking vendor exceptions** or types through the adapter.
- **Business logic inside adapters**. Adapters translate; rules belong in the domain.
- **Silently dropping information**, such as mapping every error to "failed".

## Key takeaways

- Adapter **converts** an existing interface into the one your code expects.
- Prefer **object adapters** (composition).
- Translate **calls, types and errors**; keep vendor details out of the domain.
- Each external provider gets its own adapter behind a domain-owned interface.

## Knowledge check

```quiz
? What distinguishes an Adapter from a Facade?
+ An Adapter makes an existing interface match a different expected interface; a Facade provides a simpler interface over a complex subsystem
- They are identical
- A Facade always uses inheritance
> Adapters convert; facades simplify.

? An adapter catches the vendor's `LegacyPayException`. What should it do?
- Rethrow it unchanged so callers can handle it
+ Translate it into the domain's own result or exception type, preserving useful detail
- Ignore it
> The domain shouldn't depend on vendor exception types.

? Where should the rule "orders above 1 lakh need OTP verification" live?
- In LegacyPayAdapter
+ In the domain or application layer, not the adapter
- In the vendor SDK
> Adapters should only translate; business rules belong in the domain.
```

## Exercise

Your notification service depends on `interface SmsSender { void send(PhoneNumber to, String text); }`. Two vendors are available:

- `TwilioClient.messages().create(String from, String to, String body)` returns a `MessageResource` with `getStatus()`, which is `"failed"` or `"queued"`.
- `Msg91Api.sendSms(Map<String, String> params)` returns an HTTP-like status code `int` (200 = OK).

Write both adapters (stub the vendor classes), and make failures throw a domain `SmsDeliveryException`.

````hint title="Hint"
Each adapter holds its vendor client and a configured sender ID, translates `PhoneNumber` to the vendor's string format, and maps the vendor's failure signal to the domain exception.
````

````solution title="Sample answer"
```java
record PhoneNumber(String e164) {}
class SmsDeliveryException extends RuntimeException { SmsDeliveryException(String m) { super(m); } }

class TwilioSmsAdapter implements SmsSender {
    private final TwilioClient client; private final String fromNumber;
    TwilioSmsAdapter(TwilioClient client, String fromNumber) { this.client = client; this.fromNumber = fromNumber; }
    public void send(PhoneNumber to, String text) {
        MessageResource r = client.messages().create(fromNumber, to.e164(), text);
        if ("failed".equals(r.getStatus())) throw new SmsDeliveryException("Twilio failed for " + to.e164());
    }
}

class Msg91SmsAdapter implements SmsSender {
    private final Msg91Api api; private final String senderId;
    Msg91SmsAdapter(Msg91Api api, String senderId) { this.api = api; this.senderId = senderId; }
    public void send(PhoneNumber to, String text) {
        int status = api.sendSms(Map.of("sender", senderId, "mobiles", to.e164().replace("+", ""), "message", text));
        if (status != 200) throw new SmsDeliveryException("MSG91 returned " + status);
    }
}
```

Choosing a provider (or failing over between them) is now a matter of which `SmsSender` you inject.
````
