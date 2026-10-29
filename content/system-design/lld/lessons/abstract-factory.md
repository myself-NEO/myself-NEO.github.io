## The problem

Sometimes you don't create *one* object; you create a **family** of related objects that must be **used together**. A payment integration needs a gateway client, a webhook verifier and a refund client for the *same* provider. A UI toolkit needs buttons, checkboxes and dialogs in the *same* theme. Mixing a Razorpay webhook verifier with a Stripe gateway client is a bug waiting to happen.

**Abstract Factory** provides an interface for creating **families of related objects** without specifying their concrete classes, and guarantees the products are **consistent with each other**.

## When to use it — and when not

**Use when:**

- There are several related products, and there are several **families** (providers, themes, platforms).
- Products from different families **must not be mixed**.
- The family is chosen once (by configuration or environment) and used throughout.

**Don't use when:**

- There's only **one** product type: use [Factory Method](lesson:factory-method).
- There's only **one** family and no variation planned: just construct the objects.

## Core idea

An interface (`PaymentProviderFactory`) declares one creation method per product (`gateway()`, `webhookVerifier()`, `refunds()`). Each **concrete factory** (`RazorpayFactory`, `StripeFactory`) creates the matching products. Client code receives one factory and creates everything it needs through it.

## UML

```uml title="Abstract Factory"
interface PaymentProviderFactory
  + gateway(): PaymentGateway
  + webhookVerifier(): WebhookVerifier
interface PaymentGateway
  + charge(amount: long): String
interface WebhookVerifier
  + isAuthentic(payload: String, signature: String): boolean
class RazorpayFactory
class StripeFactory
class RazorpayGateway
class RazorpayWebhookVerifier
class StripeGateway
class StripeWebhookVerifier
class CheckoutService
RazorpayFactory ..|> PaymentProviderFactory
StripeFactory ..|> PaymentProviderFactory
RazorpayFactory ..> RazorpayGateway : creates
RazorpayFactory ..> RazorpayWebhookVerifier : creates
StripeFactory ..> StripeGateway : creates
StripeFactory ..> StripeWebhookVerifier : creates
CheckoutService --> PaymentProviderFactory
```

## Java implementation

```java title="A provider family per country" file="AbstractFactoryDemo.java"
import java.util.Map;

public class AbstractFactoryDemo {
    public static void main(String[] args) {
        Map<String, PaymentProviderFactory> byCountry = Map.of(
                "IN", new RazorpayFactory("rzp_test_key", "rzp_secret"),
                "US", new StripeFactory("sk_test_key", "whsec_123"));

        for (String country : new String[]{"IN", "US"}) {
            CheckoutService checkout = new CheckoutService(byCountry.get(country));
            System.out.println(country + ": " + checkout.pay(2_500));
            System.out.println(country + " webhook ok? " + checkout.handleWebhook("{\"paid\":true}", "sig:" + country));
        }
    }
}

// -- Abstract products --
interface PaymentGateway { String charge(long amountMinor); }
interface WebhookVerifier { boolean isAuthentic(String payload, String signature); }

// -- Abstract factory --
interface PaymentProviderFactory {
    PaymentGateway gateway();
    WebhookVerifier webhookVerifier();
}

// -- Family 1: Razorpay --
class RazorpayFactory implements PaymentProviderFactory {
    private final String keyId, secret;
    RazorpayFactory(String keyId, String secret) { this.keyId = keyId; this.secret = secret; }

    public PaymentGateway gateway() { return amount -> "rzp_pay_" + amount + "_" + keyId.hashCode(); }
    public WebhookVerifier webhookVerifier() {
        // Both products share the same credentials: consistency guaranteed by the factory.
        return (payload, signature) -> signature.equals("sig:IN") && !secret.isEmpty();
    }
}

// -- Family 2: Stripe --
class StripeFactory implements PaymentProviderFactory {
    private final String apiKey, webhookSecret;
    StripeFactory(String apiKey, String webhookSecret) { this.apiKey = apiKey; this.webhookSecret = webhookSecret; }

    public PaymentGateway gateway() { return amount -> "pi_" + amount + "_" + apiKey.length(); }
    public WebhookVerifier webhookVerifier() {
        return (payload, signature) -> signature.equals("sig:US") && webhookSecret.startsWith("whsec_");
    }
}

// -- Client: never names a concrete provider --
class CheckoutService {
    private final PaymentGateway gateway;
    private final WebhookVerifier verifier;

    CheckoutService(PaymentProviderFactory provider) {
        this.gateway = provider.gateway();               // always a matching pair
        this.verifier = provider.webhookVerifier();
    }

    String pay(long amountMinor) { return gateway.charge(amountMinor); }
    boolean handleWebhook(String payload, String signature) { return verifier.isAuthentic(payload, signature); }
}
```

(The lambdas stand in for real API clients; in production each product would be a full class wrapping the vendor SDK, typically an [Adapter](lesson:adapter).)

## Realistic use case

A cross-platform app has `UiFactory` with `button()`, `textField()` and `dialog()`. `MaterialUiFactory` and `CupertinoUiFactory` produce consistent widgets. Screens are written once against `UiFactory` and never mix an iOS dialog with an Android button. The same structure appears with database drivers (connection, statement and result set from the same vendor) and cloud SDKs (storage, queue and key management from the same provider and region).

## Trade-offs and alternatives

- **Pros:** consistency across a family; swapping families is one line; clients are fully decoupled from vendors.
- **Cons:** adding a **new product type** (say, `RefundClient`) means changing the interface *and every* concrete factory. It's easy to add families, harder to add products.
- **Alternatives:**
  - **DI configuration** that wires a consistent set of beans per environment (Spring profiles) — often what large apps actually do.
  - **Several factory methods** when consistency isn't critical.
  - **[Bridge](lesson:bridge)** when two dimensions vary independently rather than in lockstep.

## Recognising it in an interview

The cue is **"families" plus "must match"**: multiple providers, each needing several cooperating components; themes; platform-specific implementations. In most LLD problems you need at most a single factory method, so mention Abstract Factory only when the family constraint is real (for example, in [Payment Workflow](problem:payment-workflow) with multiple providers).

## Common mistakes

- Using Abstract Factory when there's only one product type.
- Concrete factories that return products from **different** families (defeating the purpose).
- Fat factory interfaces that create unrelated objects.
- Forgetting that every new product type touches every factory.

## Key takeaways

- Abstract Factory creates **families of related products** that must be used together.
- Clients depend on the **abstract factory and product interfaces** only.
- Adding a family is easy; adding a product type is harder.
- Often realised in practice by **DI configuration per environment or provider**.

## Knowledge check

```quiz
? Which situation calls for Abstract Factory rather than Factory Method?
- Creating a Vehicle from a type string
+ Creating a matching gateway client, webhook verifier and refund client for whichever payment provider is configured
- Creating a single Logger
> Several related products that must come from the same family is the defining cue.

? What is the main drawback of Abstract Factory?
+ Adding a new product type requires changing the interface and every concrete factory
- It can't create more than two products
- It forces products to be singletons
> Families are easy to add; new product types ripple through every factory.

? In the example, what guarantees that CheckoutService's gateway and verifier belong to the same provider?
- A runtime instanceof check
+ Both come from the single PaymentProviderFactory passed to its constructor
- They are both lambdas
> Creating both products through one factory enforces consistency.
```

## Exercise

A reporting module must export reports as either **PDF** or **HTML**. Each format needs a `HeaderRenderer`, a `TableRenderer` and a `PageAssembler`, and mixing formats produces garbage. Design the abstract factory and its two concrete factories, and show a `ReportExporter` client that never names a format.

````hint title="Hint"
One factory interface with three creation methods; one concrete factory per format.
````

````solution title="Sample answer"
```java
interface ReportFormatFactory {
    HeaderRenderer header();
    TableRenderer table();
    PageAssembler assembler();
}
class PdfFormatFactory implements ReportFormatFactory { /* returns Pdf* renderers */ }
class HtmlFormatFactory implements ReportFormatFactory { /* returns Html* renderers */ }

class ReportExporter {
    private final ReportFormatFactory format;
    ReportExporter(ReportFormatFactory format) { this.format = format; }

    byte[] export(Report r) {
        String head = format.header().render(r.title());
        String body = format.table().render(r.rows());
        return format.assembler().assemble(head, body);
    }
}
```

Choosing the format is a single decision: `new ReportExporter(userWantsPdf ? new PdfFormatFactory() : new HtmlFormatFactory())`.
````
