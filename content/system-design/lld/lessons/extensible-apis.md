## The tension

Interviewers love extensibility follow-ups: *"Now add a new notification channel / vehicle type / rule / log destination."* A good design absorbs these with a **small, local change**. But designing for every imaginable future produces frameworks nobody needs (see [YAGNI](lesson:dry-kiss-yagni)). This lesson is about building **extension points where change is likely, and nowhere else** — and about the mechanics of plugin-style architectures in plain Java.

## Step 1: Identify the axes of change

An **axis of change** is a dimension along which new variants keep arriving. Look for them in:

- **Requirements wording:** "supports email and SMS *for now*", "pricing rules *will* change", "different cities have different rules".
- **Domain knowledge:** payment providers, notification channels, file formats, matching algorithms and eviction policies always grow.
- **Interviewer hints:** a follow-up question is an axis of change announcing itself.

Things that **rarely** vary — the parking lot has spots; a booking has a time slot — need no extension point.

## Step 2: Design the extension point

A good extension point has:

1. **A small, stable interface** expressed in domain terms (`NotificationChannel.send(Message)`), with no vendor types.
2. **A discovery or registration mechanism** so the core can find implementations without naming them.
3. **Clear capabilities**, so the core can ask what an implementation supports rather than `instanceof`-checking (`supports(MessageType)`, `maxLength()`).
4. **Isolation**: one plugin's failure shouldn't take down the core.

## A registry-based plugin architecture

```java title="Pluggable exporters discovered by key" file="PluginRegistryDemo.java"
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

public class PluginRegistryDemo {
    public static void main(String[] args) {
        ExporterRegistry registry = new ExporterRegistry();
        registry.register(new CsvExporter());
        registry.register(new JsonExporter());
        // A team adds a new format without touching ReportService or the registry:
        registry.register(new MarkdownExporter());

        ReportService service = new ReportService(registry);
        List<Row> rows = List.of(new Row("asha", 42), new Row("ravi", 37));
        for (String format : List.of("csv", "json", "md", "pdf")) {
            try {
                System.out.println(format + " -> " + service.export(rows, format));
            } catch (IllegalArgumentException e) {
                System.out.println(format + " -> " + e.getMessage());
            }
        }
        System.out.println("Formats offered in UI: " + registry.formats());
    }
}

record Row(String name, int score) {}

/** The extension point: small, domain-shaped, with a capability method. */
interface Exporter {
    String format();                          // key used for discovery
    String export(List<Row> rows);
    default Set<String> features() { return Set.of(); }
}

final class ExporterRegistry {
    private final Map<String, Exporter> byFormat = new LinkedHashMap<>();

    void register(Exporter e) {
        if (byFormat.putIfAbsent(e.format(), e) != null) throw new IllegalStateException("duplicate exporter " + e.format());
    }

    Optional<Exporter> find(String format) { return Optional.ofNullable(byFormat.get(format)); }
    Set<String> formats() { return byFormat.keySet(); }
}

/** Core code: never names a concrete exporter. */
final class ReportService {
    private final ExporterRegistry registry;
    ReportService(ExporterRegistry registry) { this.registry = registry; }

    String export(List<Row> rows, String format) {
        Exporter exporter = registry.find(format)
                .orElseThrow(() -> new IllegalArgumentException("unsupported format " + format + "; try " + registry.formats()));
        try {
            return exporter.export(rows);
        } catch (RuntimeException e) {
            // Isolation: a broken plugin produces a clear error, not a corrupted report.
            throw new IllegalStateException("exporter '" + format + "' failed", e);
        }
    }
}

final class CsvExporter implements Exporter {
    public String format() { return "csv"; }
    public String export(List<Row> rows) {
        StringBuilder sb = new StringBuilder("name,score");
        rows.forEach(r -> sb.append(" | ").append(r.name()).append(',').append(r.score()));
        return sb.toString();
    }
}

final class JsonExporter implements Exporter {
    public String format() { return "json"; }
    public String export(List<Row> rows) {
        return rows.stream().map(r -> "{\"name\":\"" + r.name() + "\",\"score\":" + r.score() + "}")
                .reduce((a, b) -> a + "," + b).map(s -> "[" + s + "]").orElse("[]");
    }
}

final class MarkdownExporter implements Exporter {
    public String format() { return "md"; }
    public String export(List<Row> rows) {
        StringBuilder sb = new StringBuilder("| name | score |");
        rows.forEach(r -> sb.append(" | ").append(r.name()).append(" | ").append(r.score()).append(" |"));
        return sb.toString();
    }
}
```

The `pdf` request fails with a helpful message listing the supported formats. That's an extensible API **failing well**.

### Discovery options in Java

| Mechanism | How | When |
|---|---|---|
| **Manual registration** in a composition root | `registry.register(new X())` | Default for interviews and most apps |
| **DI container** collecting all beans of a type | Spring injects `List<Exporter>` | Spring-based applications |
| **`java.util.ServiceLoader`** | Implementations listed in `META-INF/services/…`, loaded at runtime | True plugins in separate JARs |
| **Configuration-driven** | Map config keys to factories (`"razorpay" → RazorpayGateway::new`) | Choosing implementations per environment or tenant |

## Extensibility without speculative abstractions

A practical decision process:

1. **Is the variation stated or obvious from the domain?** If not, write the simple version. A well-factored class can gain an interface later in minutes.
2. **If yes, introduce exactly one seam** — an interface plus the implementations you need *today*.
3. **Make the seam narrow.** Start with one or two methods; add capabilities when a second implementation needs them.
4. **Keep the "switch" in one place** — a registry or factory — so adding a variant touches one file.
5. **Test the seam with a fake implementation**, which proves it's genuinely pluggable.

> [!WARNING] Signs of speculative generality
> Interfaces with one implementation and no stated variation; parameters nobody passes; "engine" or "framework" classes for a feature with two cases; configuration options with only one valid value.

## Versioning and evolving an extension point

Once others implement your interface, changing it breaks them. Techniques:

- **Add methods with `default` implementations** to evolve without breaking implementers.
- **Pass a parameter object** (`ExportRequest`) instead of growing parameter lists.
- **Capability negotiation** (`features()` above) instead of new abstract methods.
- **Deprecate before removing.**

## Real-world example

A logistics company's rate-shopping service integrated 4 carriers with `if (carrier == …)` branches in 9 places. Adding carrier #5 took three weeks and broke carrier #2's label printing. They introduced a `CarrierPlugin` interface (`quote`, `book`, `label`, `track`, plus `capabilities()`), a registry built from configuration, and a contract test suite that every plugin had to pass. Carriers #5 to #12 took two to four days each, and none touched the core.

## Common mistakes

- **Vendor-shaped extension points** (`createStripePaymentIntent`), which every other plugin has to fake.
- **`instanceof` checks in the core** instead of capability methods.
- **Registration scattered** across the codebase.
- **No failure isolation**: a plugin exception corrupts core state.
- **Extension points for everything**, the speculative-generality trap.

## In the interview

> [!INTERVIEW] Show the seam, justify it, stop there
> *"Channels will grow, so `NotificationChannel` is the extension point, registered by name. Templates are just strings for now — no template engine until a requirement needs one."* Then, when the follow-up comes ("add WhatsApp"): *"One new class implementing `NotificationChannel`, plus one registration line."*

## Key takeaways

- Put extension points on **likely axes of change**, identified from requirements, domain and hints.
- Good extension points are **small, domain-shaped, discoverable, capability-aware and isolated**.
- Use a **registry** (manual, DI, ServiceLoader or config) so the core never names implementations.
- Avoid **speculative generality**; evolve interfaces with defaults and parameter objects.

## Knowledge check

```quiz
? Which is the best signal that an extension point is justified?
+ The requirements say "SMS and email for now; WhatsApp next quarter"
- The class is longer than 100 lines
- Every class should have an interface
> Stated, likely variation justifies a seam.

? A core service checks `if (exporter instanceof PdfExporter) addFonts()`. What's a better design?
- Add more instanceof checks for each new exporter
+ Expose a capability (such as a `features()` set or a hook method) on the Exporter interface and let implementations declare what they need
- Merge all exporters into one class
> Capabilities keep the core ignorant of concrete plugins.

? How can you add a method to a published plugin interface without breaking existing implementations?
+ Add it as a default method with a sensible default behaviour
- Make it abstract
- Rename the interface
> Default methods allow evolution without breaking implementers.
```

## Exercise

Design an extensible **discount engine** for checkout. Today: a flat discount and a percentage discount. Expected soon: buy-X-get-Y and category-specific discounts. Requirements: discounts are configured per campaign by marketing (by name and parameters); the engine must report which discount was applied; an invalid campaign configuration must not crash checkout. Sketch the interfaces, the registry or factory, and how a new discount type is added.

````hint title="Hint"
Separate the **discount type** (code: a factory that builds a discount from parameters) from the **campaign** (data: which type, with which parameters). Wrap evaluation so one bad campaign is skipped and logged.
````

````solution title="Sample design"
```java
interface Discount {                                   // extension point
    String name();
    long amountOff(Cart cart);                          // 0 if not applicable
}

interface DiscountFactory {                             // one per discount TYPE
    String type();                                      // "flat", "percent", "bxgy", ...
    Discount create(Map<String, String> params);        // validates params, throws if invalid
}

final class DiscountRegistry {
    private final Map<String, DiscountFactory> factories = new HashMap<>();
    void register(DiscountFactory f) { factories.put(f.type(), f); }
    Discount build(Campaign c) {
        DiscountFactory f = factories.get(c.type());
        if (f == null) throw new IllegalArgumentException("unknown type " + c.type());
        return f.create(c.params());
    }
}

record Campaign(String id, String type, Map<String, String> params) {}

final class DiscountEngine {
    AppliedDiscount best(Cart cart, List<Campaign> campaigns) {
        AppliedDiscount best = AppliedDiscount.none();
        for (Campaign c : campaigns) {
            try {
                Discount d = registry.build(c);
                long off = d.amountOff(cart);
                if (off > best.amount()) best = new AppliedDiscount(c.id(), d.name(), off);
            } catch (RuntimeException e) {
                log.warn("skipping campaign " + c.id(), e);   // isolation: checkout continues
            }
        }
        return best;
    }
}
```

**Adding buy-X-get-Y:** write `BuyXGetYDiscount` and its `BuyXGetYFactory`, then register the factory. The engine, checkout and the other discounts don't change, and marketing configures campaigns as data. See [Rule Engine](problem:rule-engine).
````
