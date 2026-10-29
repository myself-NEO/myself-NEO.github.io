## The problem

Several classes run **the same algorithm skeleton** with a few steps that differ. Every payment provider follows *validate → authorise → capture → record*; every data import follows *open → parse rows → validate → save → close*; every report does *fetch → format header → format rows → footer*. Copying the skeleton into each class duplicates the sequencing, error handling and logging — and the copies drift apart.

**Template Method** defines the **skeleton of an algorithm** in a base-class method (the *template method*) and defers specific steps to subclasses. The order of steps is fixed; the steps themselves vary.

## When to use it — and when not

**Use when:**

- Several variants share a **fixed sequence** with a few **varying steps**.
- The invariant parts (ordering, logging, error handling, transaction boundaries) must be **enforced**, not merely recommended.

**Don't use when:**

- The *whole* algorithm varies: use [Strategy](lesson:strategy).
- Variants differ along **several independent axes**: inheritance will tangle. Compose strategies instead.
- You'd need a deep inheritance hierarchy. Template Method works best with **one** abstract base and flat subclasses.

## Core idea

- An **abstract class** with a **`final` template method** that calls steps in order.
- **Abstract steps** (subclasses must implement) and **hooks** (optional overrides with a default, often no-op).
- Subclasses **fill in steps**, not the algorithm. This is the "Hollywood principle": *don't call us, we'll call you*.

## UML

```uml title="Template Method"
abstract class DataImporter<T>
  + importLines(lines: List<String>): ImportReport
  # parse(line: String): T
  # validate(record: T): List<String>
  # save(record: T): void
  # skipHeader(): boolean
  # afterImport(report: ImportReport): void
class CustomerCsvImporter
class OrderPipeImporter
CustomerCsvImporter --|> DataImporter
OrderPipeImporter --|> DataImporter
```

## Java implementation

```java title="A fixed import pipeline with pluggable steps" file="TemplateMethodDemo.java"
import java.util.ArrayList;
import java.util.List;

public class TemplateMethodDemo {
    public static void main(String[] args) {
        List<String> csv = List.of("name,email", "Asha,asha@x.com", "Ravi,", "Meera,meera@x.com");
        ImportReport report = new CustomerCsvImporter().importLines(csv);
        System.out.println(report);

        List<String> orders = List.of("ORD-1|250", "ORD-2|-5", "ORD-3|100");
        System.out.println(new OrderPipeImporter().importLines(orders));
    }
}

record ImportReport(String source, int imported, List<String> errors) {}

abstract class DataImporter<T> {

    /** The template method: final, so the sequence can't be broken by subclasses. */
    public final ImportReport importLines(List<String> lines) {
        List<String> errors = new ArrayList<>();
        int imported = 0;
        List<String> body = skipHeader() ? lines.subList(1, lines.size()) : lines;
        for (int i = 0; i < body.size(); i++) {
            int lineNo = i + 1 + (skipHeader() ? 1 : 0);
            try {
                T record = parse(body.get(i));                     // step (abstract)
                List<String> problems = validate(record);          // step (abstract)
                if (!problems.isEmpty()) {
                    errors.add("line " + lineNo + ": " + String.join(", ", problems));
                    continue;
                }
                save(record);                                      // step (abstract)
                imported++;
            } catch (RuntimeException e) {
                errors.add("line " + lineNo + ": unparseable (" + e.getMessage() + ")");
            }
        }
        ImportReport report = new ImportReport(sourceName(), imported, List.copyOf(errors));
        afterImport(report);                                       // hook (optional)
        return report;
    }

    protected abstract String sourceName();
    protected abstract T parse(String line);
    protected abstract List<String> validate(T record);
    protected abstract void save(T record);

    /** Hooks: sensible defaults that subclasses may override. */
    protected boolean skipHeader() { return false; }
    protected void afterImport(ImportReport report) {}
}

record Customer(String name, String email) {}

class CustomerCsvImporter extends DataImporter<Customer> {
    private final List<Customer> db = new ArrayList<>();

    protected String sourceName() { return "customers.csv"; }
    @Override protected boolean skipHeader() { return true; }

    protected Customer parse(String line) {
        String[] parts = line.split(",", -1);
        return new Customer(parts[0].trim(), parts[1].trim());
    }

    protected List<String> validate(Customer c) {
        List<String> problems = new ArrayList<>();
        if (c.name().isEmpty()) problems.add("name missing");
        if (!c.email().contains("@")) problems.add("invalid email");
        return problems;
    }

    protected void save(Customer c) { db.add(c); }

    @Override protected void afterImport(ImportReport r) { System.out.println("Customers now: " + db.size()); }
}

record OrderLine(String id, long amount) {}

class OrderPipeImporter extends DataImporter<OrderLine> {
    protected String sourceName() { return "orders.psv"; }
    protected OrderLine parse(String line) {
        String[] p = line.split("\\|");
        return new OrderLine(p[0], Long.parseLong(p[1]));
    }
    protected List<String> validate(OrderLine o) { return o.amount() > 0 ? List.of() : List.of("amount must be positive"); }
    protected void save(OrderLine o) { /* persist */ }
}
```

Every importer gets the same error collection, line numbering and reporting for free, and no subclass can forget to validate before saving: the `final` template method guarantees the order.

## Template Method vs Strategy

| | Template Method | Strategy |
|---|---|---|
| Mechanism | Inheritance | Composition |
| What varies | **Steps** inside a fixed algorithm | The **whole** algorithm |
| Binding | Compile time (subclass) | Runtime (inject or swap) |
| Combining variations | Hard (one superclass) | Easy (several strategies) |

Modern Java often achieves Template Method with **composition**: a final class runs the skeleton and takes the varying steps as **lambdas or small interfaces** — a parser, a validator, a sink. That avoids inheritance while keeping the fixed sequence.

## Realistic use case

- **Payment providers**: `AbstractPaymentProcessor.process()` = validate → `authorise()` → `capture()` → record → publish event; providers implement authorise/capture ([Payment Workflow](problem:payment-workflow)).
- **Logging**: `AbstractAppender.append()` = filter → `format()` → `write()` → flush policy ([Logging Framework](problem:logging-framework)).
- **JDK**: `AbstractList` (implement `get` and `size`; iteration and `contains` come free), `HttpServlet.service()` dispatching to `doGet`/`doPost`.

## Trade-offs and alternatives

- **Pros:** removes duplicated sequencing; enforces invariants and ordering; easy to add a variant.
- **Cons:** inheritance coupling (fragile base class); hard to vary two things independently; the flow is split across classes ("yo-yo" reading).
- **Alternatives:** Strategy or lambdas for steps (composition), or a pipeline of [Chain of Responsibility](lesson:chain-of-responsibility) handlers.

## Recognising it in an interview

"Different providers or formats follow the same steps", "every X must always do A, then B, then C, but B differs". Say: *"The flow is fixed and must be enforced, so a `final` template method in an abstract base, with providers implementing the varying steps."*

## Common mistakes

- **Non-final template methods**, which let subclasses override the skeleton and break the invariants.
- **Too many abstract steps**, so subclasses implement ten methods to change one behaviour. Use hooks with defaults.
- **Subclasses calling `super` in odd orders** (a sign the sequencing isn't really fixed).
- **Deep hierarchies** layering templates on templates.

## Key takeaways

- Template Method fixes an **algorithm skeleton** in a base class and lets subclasses supply **steps**.
- Make the template method **`final`**; offer **hooks** for optional customisation.
- Prefer **Strategy/composition** when whole algorithms vary or variations combine.
- It's great for enforcing sequences: validate → act → record.

## Knowledge check

```quiz
? Why is the template method usually declared `final`?
+ So subclasses can't change the sequence of steps and break the invariants
- final methods run faster
- Abstract classes require final methods
> The point is to fix the skeleton; only the steps should vary.

? What's a hook in the Template Method pattern?
- An abstract method every subclass must implement
+ An optional step with a default implementation that subclasses may override
- A static helper method
> Hooks give optional extension points without forcing every subclass to implement them.

? Payment providers differ in how they authorise and capture, AND you need to vary retry policy independently. What's better?
- Template Method with a subclass per provider-and-retry-policy combination
+ Template Method (or composition) for the provider steps, plus an injected RetryPolicy strategy
- Copy the algorithm into each provider
> Independent axes of variation are best composed, not multiplied through inheritance.
```

## Exercise

Write an abstract `PaymentProcessor` with a final `process(PaymentRequest)` that: validates the amount (> 0); calls `authorise()`; if authorised, calls `capture()`; records the result in a list; and returns a `PaymentOutcome`. Provide a hook `requiresThreeDS(amount)` defaulting to false; when true, call `verifyThreeDS()` before authorising. Implement `CardProcessor` (3-D Secure above 5,000) and `UpiProcessor`.

````hint title="Hint"
Validation, the 3DS check, authorise → capture and recording are fixed. The authorise/capture steps and the hook vary.
````

````solution title="Reference solution"
```java file="PaymentTemplateDemo.java"
import java.util.ArrayList;
import java.util.List;

public class PaymentTemplateDemo {
    public static void main(String[] args) {
        PaymentProcessor card = new CardProcessor();
        System.out.println(card.process(new PaymentRequest("P1", 2_000)));
        System.out.println(card.process(new PaymentRequest("P2", 9_000)));   // triggers 3DS
        System.out.println(new UpiProcessor().process(new PaymentRequest("P3", 9_000)));
        System.out.println("Card ledger: " + card.ledger());
    }
}

record PaymentRequest(String id, long amount) {}
record PaymentOutcome(String id, boolean success, String detail) {}

abstract class PaymentProcessor {
    private final List<PaymentOutcome> ledger = new ArrayList<>();

    public final PaymentOutcome process(PaymentRequest req) {
        if (req.amount() <= 0) return record(new PaymentOutcome(req.id(), false, "invalid amount"));
        if (requiresThreeDS(req.amount()) && !verifyThreeDS(req)) {
            return record(new PaymentOutcome(req.id(), false, "3DS failed"));
        }
        String auth = authorise(req);
        if (auth == null) return record(new PaymentOutcome(req.id(), false, "declined"));
        return record(new PaymentOutcome(req.id(), true, capture(req, auth)));
    }

    protected abstract String authorise(PaymentRequest req);              // returns auth code or null
    protected abstract String capture(PaymentRequest req, String authCode);

    protected boolean requiresThreeDS(long amount) { return false; }        // hook
    protected boolean verifyThreeDS(PaymentRequest req) { return true; }    // hook

    private PaymentOutcome record(PaymentOutcome o) { ledger.add(o); return o; }
    List<PaymentOutcome> ledger() { return List.copyOf(ledger); }
}

class CardProcessor extends PaymentProcessor {
    protected String authorise(PaymentRequest req) { return "AUTH-" + req.id(); }
    protected String capture(PaymentRequest req, String auth) { return "captured " + auth; }
    @Override protected boolean requiresThreeDS(long amount) { return amount > 5_000; }
    @Override protected boolean verifyThreeDS(PaymentRequest req) { System.out.println("  3DS challenge for " + req.id()); return true; }
}

class UpiProcessor extends PaymentProcessor {
    protected String authorise(PaymentRequest req) { return "UPI-" + req.id(); }
    protected String capture(PaymentRequest req, String auth) { return "collected via " + auth; }
}
```
````
