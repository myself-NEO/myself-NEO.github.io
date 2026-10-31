## Concept explanation

### Code is read far more than it's written

**Clean code** is code a teammate can understand, change and test with confidence. The habits that matter most:

| Habit | Instead of |
|---|---|
| **Intention-revealing names**: `overdueInvoices`, `calculateShippingCost` | `list2`, `doStuff`, `data`, `mgr` |
| **Small functions doing one thing** at one level of abstraction | 200-line methods mixing SQL, rules and formatting |
| **Domain types** (`Money`, `EmailAddress`, `enum Tier`) | primitives and strings everywhere ("primitive obsession", "stringly typed") |
| **Guard clauses** that return early | deeply nested `if/else` pyramids |
| **No boolean flag parameters**: `sendNow()`/`schedule()` | `send(true, false)` |
| **Named constants** (`FREE_SHIPPING_THRESHOLD`) | magic numbers (`if (total > 100)`) |
| **Immutability by default**: records, `final` fields, unmodifiable collections | shared mutable state |
| **Comments explain *why*** (decisions, constraints) | comments restating *what* the code does, or commented-out code |
| **Fail fast** with precise exceptions; don't swallow them | `catch (Exception e) {}` or returning `null` everywhere |

Supporting principles:
- **DRY**: don't repeat *knowledge*, though similar-looking code may legitimately differ.
- **KISS** and **YAGNI**: don't build for hypothetical futures.
- The **Law of Demeter** (`order.customer().address().city()` chains couple you to structure).
- **Tell, don't ask**: put behaviour next to the data.
- **Composition over inheritance.**

### SOLID

| Principle | Meaning | Java smell → fix |
|---|---|---|
| **S**ingle Responsibility | a class has **one reason to change** (one actor it serves) | `InvoiceService` computes prices, formats PDFs and sends emails → split into calculator, formatter, notifier |
| **O**pen/Closed | open for extension, closed for modification | `if (type.equals("GOLD")) … else if …` edited for every new type → polymorphism or strategy objects |
| **L**iskov Substitution | subtypes must honour the base type's contract (preconditions no stronger, postconditions no weaker) | `Square extends Rectangle` breaks `setWidth`; read-only lists throwing `UnsupportedOperationException` |
| **I**nterface Segregation | clients shouldn't depend on methods they don't use | a fat `Repository` with 30 methods → small role interfaces (`OrderReader`, `OrderWriter`) |
| **D**ependency Inversion | high-level policy depends on **abstractions**, and details implement them | `new SmtpClient()` inside business logic → inject a `Notifier` interface |

SOLID principles are **heuristics for managing change**, not laws. Applying them everywhere creates needless layers ("interface for every class" with one implementation). Apply them where change actually happens.

## Internal working

How the principles play out mechanically in Java:
- **Open/Closed through dispatch**: a call on an interface (`rule.apply(amount)`) is resolved at run time (virtual dispatch, `invokeinterface`), so new implementations plug in without editing the caller. The JIT makes this cheap: monomorphic and bimorphic call sites are inlined.
  - **Sealed types plus pattern-matching `switch`** are the deliberate opposite trade-off. The set of types is closed, and adding an *operation* is easy (a new `switch`), while adding a *type* forces every `switch` to be updated, and the compiler reports each one. Choose by which axis changes more often (the "expression problem").
- **Dependency inversion through constructor injection**: dependencies arrive as constructor parameters typed by interfaces, and a **composition root** (`main`, or a DI container like Spring) creates and wires them (next lessons). Tests pass fakes instead.
- **Liskov substitution is about contracts**, not syntax. The compiler checks signatures, return-type covariance and checked exceptions, but not behaviour. Contracts live in Javadoc ("this method never returns null"), in assertions and tests, and in types (`Optional`, records, sealed hierarchies).
- **Small functions are free**: the JIT inlines small methods (`MaxInlineSize` 35 bytes of bytecode, more for hot ones), so extracting a method for readability costs nothing at run time.
- **Refactoring safely**:
  1. pin current behaviour with **characterisation tests**;
  2. make small, behaviour-preserving steps (IDE refactorings: extract method or class, introduce parameter object, replace conditional with polymorphism);
  3. run the tests after each step.

## Visual representation

```text title="From one god method to collaborating parts"
 BEFORE                                         AFTER
 LegacyInvoiceService.process(type, email,      InvoiceService(PriceRule promo, TaxPolicy tax,
       double[] prices, int[] qty)                             InvoiceFormatter fmt, Notifier notifier)
   - sums with double                             bill(Customer, List<Line>)
   - if/else on "GOLD"/"SILVER"/"STAFF"             subtotal: Line.total() in Money (cents)
   - magic promo "> 100 then -5"                    tier.rule().then(promo)        <- Open/Closed
   - 18% tax inline                                 tax.taxOn(net)                 <- SRP
   - String.format output                           fmt.format(invoice)            <- SRP
   - "sends" email inline                           notifier.send(...)             <- DIP (interface)
 one reason to change? no: 5                     each class: one reason to change
```

## Java code example

The first program refactors a legacy method, then uses **characterisation tests** (old and new code run side by side on the same inputs) to check that behaviour is preserved:

```java title="RefactoringDemo.java" file="RefactoringDemo.java"
import java.util.ArrayList;
import java.util.List;

public class RefactoringDemo {
    // ===================== BEFORE =====================
    static class LegacyInvoiceService {
        final List<String> sent = new ArrayList<>();

        String process(String customerType, String email, double[] prices, int[] qty) {
            double total = 0;
            for (int i = 0; i < prices.length; i++) total += prices[i] * qty[i];
            if (customerType.equals("GOLD")) total = total * 0.9;
            else if (customerType.equals("SILVER")) total = total * 0.95;
            else if (customerType.equals("STAFF")) total = total * 0.7;
            if (total > 100) total = total - 5;   // promo
            double tax = total * 0.18;
            String text = "Invoice for " + email + ": net " + String.format("%.2f", total)
                    + ", tax " + String.format("%.2f", tax) + ", total " + String.format("%.2f", total + tax);
            sent.add(email);                      // pretend to send an email
            return text;
        }
    }

    // ===================== AFTER =====================
    /** Money in whole cents: exact arithmetic, explicit rounding. */
    record Money(long cents) {
        static Money of(String amount) {
            return new Money(new java.math.BigDecimal(amount).movePointRight(2).longValueExact());
        }

        Money plus(Money other) { return new Money(cents + other.cents); }
        Money minus(Money other) { return new Money(cents - other.cents); }
        Money times(int factor) { return new Money(cents * factor); }
        Money percent(int pct) { return new Money(Math.round(cents * pct / 100.0)); }
        boolean greaterThan(Money other) { return cents > other.cents; }

        @Override
        public String toString() {
            return String.format("%d.%02d", cents / 100, cents % 100);
        }
    }

    record Line(String sku, Money unitPrice, int quantity) {
        Money total() { return unitPrice.times(quantity); }
    }

    /** A pricing step; rules compose, so new promotions need no changes elsewhere (Open/Closed). */
    @FunctionalInterface
    interface PriceRule {
        Money apply(Money amount);

        default PriceRule then(PriceRule next) {
            return amount -> next.apply(apply(amount));
        }

        static PriceRule percentOff(int pct) {
            return amount -> amount.minus(amount.percent(pct));
        }

        static PriceRule amountOffAbove(Money threshold, Money discount) {
            return amount -> amount.greaterThan(threshold) ? amount.minus(discount) : amount;
        }
    }

    enum Tier {
        REGULAR(0), SILVER(5), GOLD(10), STAFF(30);

        private final PriceRule rule;

        Tier(int discountPercent) {
            this.rule = PriceRule.percentOff(discountPercent);
        }

        PriceRule rule() { return rule; }
    }

    record Customer(String email, Tier tier) { }

    record Invoice(Customer customer, Money net, Money tax) {
        Money total() { return net.plus(tax); }
    }

    interface TaxPolicy { Money taxOn(Money net); }
    interface InvoiceFormatter { String format(Invoice invoice); }
    interface Notifier { void send(String to, String body); }   // Dependency Inversion: SMTP lives elsewhere

    static final class InvoiceService {
        private final PriceRule promotion;
        private final TaxPolicy tax;
        private final InvoiceFormatter formatter;
        private final Notifier notifier;

        InvoiceService(PriceRule promotion, TaxPolicy tax, InvoiceFormatter formatter, Notifier notifier) {
            this.promotion = promotion;
            this.tax = tax;
            this.formatter = formatter;
            this.notifier = notifier;
        }

        String bill(Customer customer, List<Line> lines) {
            Money subtotal = lines.stream().map(Line::total).reduce(new Money(0), Money::plus);
            Money net = customer.tier().rule().then(promotion).apply(subtotal);
            Invoice invoice = new Invoice(customer, net, tax.taxOn(net));
            String text = formatter.format(invoice);
            notifier.send(customer.email(), text);
            return text;
        }
    }

    static final Money PROMO_THRESHOLD = Money.of("100.00");
    static final Money PROMO_DISCOUNT = Money.of("5.00");
    static final int GST_PERCENT = 18;

    public static void main(String[] args) {
        // Composition root: choose implementations here, not inside the business logic
        List<String> outbox = new ArrayList<>();
        InvoiceService service = new InvoiceService(
                PriceRule.amountOffAbove(PROMO_THRESHOLD, PROMO_DISCOUNT),
                net -> net.percent(GST_PERCENT),
                inv -> "Invoice for " + inv.customer().email() + ": net " + inv.net() + ", tax " + inv.tax() + ", total " + inv.total(),
                (to, body) -> outbox.add(to));
        LegacyInvoiceService legacy = new LegacyInvoiceService();

        // Characterisation tests: same inputs through old and new code
        record Case(Tier tier, String email, String[] prices, int[] qty) { }
        List<Case> cases = List.of(
                new Case(Tier.GOLD, "ada@example.com", new String[] { "19.99", "45.50" }, new int[] { 3, 1 }),
                new Case(Tier.REGULAR, "bob@example.com", new String[] { "8.00" }, new int[] { 4 }),
                new Case(Tier.STAFF, "cy@example.com", new String[] { "120.00", "0.99" }, new int[] { 1, 10 }),
                new Case(Tier.SILVER, "di@example.com", new String[] { "12.50" }, new int[] { 2 }));
        for (Case c : cases) {
            double[] prices = new double[c.prices().length];
            List<Line> lines = new ArrayList<>();
            for (int i = 0; i < prices.length; i++) {
                prices[i] = Double.parseDouble(c.prices()[i]);
                lines.add(new Line("sku" + i, Money.of(c.prices()[i]), c.qty()[i]));
            }
            String before = legacy.process(c.tier().name(), c.email(), prices, c.qty());
            String after = service.bill(new Customer(c.email(), c.tier()), lines);
            System.out.println(before.equals(after) ? "SAME   " + after : "DIFFER legacy: " + before + "\n       new:    " + after);
        }
        System.out.println("notifications sent: legacy " + legacy.sent.size() + ", new " + outbox.size());

        // Open/Closed: a seasonal promotion is a new rule, with no edits to InvoiceService or Tier
        InvoiceService blackFriday = new InvoiceService(
                PriceRule.percentOff(20).then(PriceRule.amountOffAbove(PROMO_THRESHOLD, PROMO_DISCOUNT)),
                net -> net.percent(GST_PERCENT),
                inv -> "Black Friday invoice: total " + inv.total(),
                (to, body) -> { });
        System.out.println(blackFriday.bill(new Customer("ada@example.com", Tier.GOLD),
                List.of(new Line("tv", Money.of("499.00"), 1))));
    }
}
```

The second program shows **Liskov substitution** failures, including one inside the JDK, and a substitutable design:

```java title="LiskovDemo.java" file="LiskovDemo.java"
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class LiskovDemo {
    static class Rectangle {
        protected int width, height;

        void setWidth(int w) { width = w; }
        void setHeight(int h) { height = h; }
        int area() { return width * height; }
    }

    static class Square extends Rectangle {   // "a square IS-A rectangle"... mathematically
        @Override void setWidth(int w) { width = w; height = w; }
        @Override void setHeight(int h) { width = h; height = h; }
    }

    // Client code written against Rectangle's contract: width and height are independent
    static String stretch(Rectangle r) {
        r.setWidth(5);
        r.setHeight(10);
        return r.getClass().getSimpleName() + " area " + r.area() + (r.area() == 50 ? " (as expected)" : " (contract broken!)");
    }

    // Substitutable design: immutable shapes, no setters to violate
    sealed interface Shape permits Rect, Sq {
        int area();
    }

    record Rect(int width, int height) implements Shape {
        public int area() { return width * height; }
        Rect withWidth(int w) { return new Rect(w, height); }
    }

    record Sq(int side) implements Shape {
        public int area() { return side * side; }
    }

    static int totalArea(List<? extends Shape> shapes) {
        return shapes.stream().mapToInt(Shape::area).sum();   // works for every Shape
    }

    static void addDefaults(List<String> tags) {
        tags.add("new");                                       // the List contract says add is "optional"
    }

    public static void main(String[] args) {
        System.out.println(stretch(new Rectangle()));
        System.out.println(stretch(new Square()));

        System.out.println("immutable shapes: total area " + totalArea(List.of(new Rect(5, 10), new Sq(4), new Rect(2, 3).withWidth(3))));

        List<String> mutable = new ArrayList<>(List.of("sale"));
        addDefaults(mutable);
        System.out.println("ArrayList after addDefaults: " + mutable);
        try {
            addDefaults(Collections.unmodifiableList(mutable));
        } catch (UnsupportedOperationException e) {
            System.out.println("unmodifiable view: UnsupportedOperationException (a List that can't do what List promises)");
        }
    }
}
```

## Output

```text title="Output" output="RefactoringDemo.java"
SAME   Invoice for ada@example.com: net 94.92, tax 17.09, total 112.01
SAME   Invoice for bob@example.com: net 32.00, tax 5.76, total 37.76
SAME   Invoice for cy@example.com: net 90.93, tax 16.37, total 107.30
DIFFER legacy: Invoice for di@example.com: net 23.75, tax 4.27, total 28.03
       new:    Invoice for di@example.com: net 23.75, tax 4.28, total 28.03
notifications sent: legacy 4, new 4
Black Friday invoice: total 418.05
```

```text title="Output" output="LiskovDemo.java"
Rectangle area 50 (as expected)
Square area 100 (contract broken!)
immutable shapes: total area 75
ArrayList after addDefaults: [sale, new]
unmodifiable view: UnsupportedOperationException (a List that can't do what List promises)
```

**Refactoring**:
- The characterisation tests matched in three cases and **exposed a bug** in the fourth. In legacy SILVER the tax was `23.75 × 0.18 = 4.275`, which as a `double` is slightly *below* 4.275, so it printed `4.27`. The total was rounded separately, so the legacy invoice didn't even add up: 23.75 + 4.27 ≠ 28.03. Exact cents arithmetic with explicit rounding gives a consistent `4.28`.
- This is what characterisation tests are for: they reveal every behaviour change, so you decide *consciously* whether it's a fix (here, yes: the business wants correct rounding) or a regression.
- Every notification still went out, through the `Notifier` interface, which a test can replace with a list.
- **Black Friday** was added by **composing rules**, with no change to `InvoiceService` or `Tier`. That's Open/Closed in practice.

**Liskov**:
- `stretch` was written against `Rectangle`'s contract (width and height are independent). `Square` compiles fine but silently breaks that contract.
- The immutable `Shape` records have no such trap: each is just a shape with an area.
- The JDK's own `List` makes `add` "optional", so an unmodifiable view can't stand in where mutation is expected. Accept read-only types (`Collection<? extends T>`, or just iterate) when you only read, and document mutability.

## Real-world application

- **Code review checklists** in most teams encode these habits:
  - names, method size, duplication, magic numbers;
  - tests for new behaviour, null handling, exception handling;
  - no business logic in controllers, and dependencies injected rather than created with `new`.
- **Spring applications** naturally follow SRP and DIP:
  - controllers handle HTTP only, services hold business rules, repositories persistence;
  - beans depend on interfaces such as `PaymentGateway` or `Clock`, wired by the container;
  - tests swap in mocks or fakes.
- **Legacy modernisation**:
  - wrap untested code in characterisation tests (or approval/golden-master tests);
  - extract classes along responsibilities, and replace type codes with enums or polymorphism;
  - introduce interfaces at seams (database, email, clock, random) to make code testable;
  - use the **strangler fig** pattern to move functionality gradually.
- **Static analysis** enforces part of this automatically: SonarQube (cognitive complexity, duplication, code smells), Checkstyle, PMD, Error Prone, and ArchUnit (architecture rules such as "controllers must not access repositories").
- **Domain modelling**: value objects (`Money`, `Email`), enums with behaviour, and records make illegal states unrepresentable, removing whole classes of bugs.

## Common mistakes

- **Over-engineering in the name of SOLID**: an interface plus a factory plus a strategy for logic that never varies. Wait for the second or third variation (YAGNI, the rule of three).
- **"Manager"/"Helper"/"Util" classes** that accumulate unrelated responsibilities.
- **Primitive obsession**: money as `double`, ids as `String`, statuses as magic strings, causing rounding bugs and mixed-up arguments.
- **Inheritance for code reuse** (`Square extends Rectangle`, `Stack extends Vector`), which breaks substitutability. Prefer composition.
- **Refactoring without tests**, or mixing refactoring with behaviour changes in one commit.
- **Comments that lie**: outdated comments are worse than none. Make the code express the *what*, and keep the *why* in comments.
- **Swallowed exceptions and `null` returns** that push errors far from their cause. Fail fast and use `Optional` for absent results.
- **Deep inheritance hierarchies** and long parameter lists (introduce a parameter object or builder).

## Interview questions

**Q1. Explain the Single Responsibility Principle with an example.**

````reveal title="Answer"
A class should have one reason to change, meaning it serves one actor or concern. An `InvoiceService` that computes totals, formats the invoice text and sends emails changes when finance changes tax rules, when design changes the layout, and when ops changes the mail provider. Splitting it into `InvoiceCalculator`, `InvoiceFormatter` and `Notifier` isolates those changes, makes each part testable alone (fake notifier, pure calculator), and reduces merge conflicts. SRP is about cohesion around change, not "one method per class".
````

**Q2. How do you apply the Open/Closed Principle in Java?**

````reveal title="Answer"
Identify the axis that varies (pricing rules, payment methods, export formats) and put it behind an abstraction: an interface or functional interface whose implementations are selected by configuration or composition (strategy, decorator, chain of responsibility). New behaviour then means a new class or lambda, and the core flow isn't edited or retested. Plugins via `ServiceLoader` and Spring's injection of `List<Strategy>` are common mechanisms. Don't abstract axes that don't change. Sealed types with switches are the deliberate opposite trade-off when the set of types is fixed and operations vary.
````

**Q3. Why does `Square extends Rectangle` violate Liskov Substitution?**

````reveal title="Answer"
`Rectangle`'s contract implies that `setWidth` doesn't change the height. Code relying on that (set width 5, height 10, expect area 50) breaks when given a `Square`, whose setters keep the sides equal (area 100). The subclass strengthens the invariants and weakens the postconditions of its parent, so it isn't substitutable even though it compiles. Fixes: immutable value types (no setters to break), separate types under a common `Shape` interface, or modelling "square" as a property (`isSquare()`).
````

**Q4. What is Dependency Inversion, and how is it different from dependency injection?**

````reveal title="Answer"
**Dependency Inversion** is a design principle: high-level modules (business rules) shouldn't depend on low-level details (SMTP, a JDBC driver, an HTTP client). Both depend on abstractions owned by the high-level side (`Notifier`, `OrderRepository`), and the details implement them. **Dependency injection** is a technique for supplying those implementations from outside (constructor parameters), done manually in a composition root or by a container like Spring. DI is how you usually achieve DIP, but you can inject concrete classes too.
````

**Q5. How would you refactor a 300-line method safely?**

````reveal title="Answer"
1. Write characterisation tests that pin current behaviour, including edge cases and odd outputs.
2. Make small automated refactorings: extract methods for each step (validation, calculation, persistence, notification), introduce well-named variables and constants, replace conditionals on type codes with polymorphism or a strategy, and introduce value objects.
3. Inject the dependencies (database, clock, mailer) to make the parts unit-testable.
4. Run the tests after every step, and commit refactorings separately from behaviour changes.
5. Treat any test that changes as a decision to review, not an accident.
````

## Hands-on exercise

Refactor this fee calculator **without changing its behaviour**:

```java
static long fee(String method, long cents, boolean international) {
    if (method.equals("CARD")) {
        long f = 30 + cents * 29 / 1000;
        if (international) f += cents / 100;
        return f;
    } else if (method.equals("UPI")) {
        return 0;
    } else if (method.equals("WALLET")) {
        return Math.min(cents / 50, 1000);
    } else {
        throw new IllegalArgumentException("unknown method " + method);
    }
}
```

1. Introduce a `FeeRule` functional interface and an `enum PaymentMethod` whose constants carry their rule.
2. Make the international surcharge a **decorator** rule that wraps any base rule, and apply it for cards only, as before.
3. Write a characterisation test comparing old and new for every method × amounts {0, 99, 1000, 54321, 1000000} × {domestic, international}.
4. Add a new method, `BNPL` (2.5% plus 50 cents, plus the same international surcharge), without editing the existing rules.

````hint title="Hint"
`enum PaymentMethod { CARD(...), UPI(...), WALLET(...); final FeeRule domestic; final boolean surchargeAbroad; }`. A static `FeeRule withSurcharge(FeeRule base)` returns `cents -> base.fee(cents) + cents / 100`. Iterate `PaymentMethod.values()` minus `BNPL` for the comparison, since the legacy code doesn't know BNPL.
````

````solution title="Solution"
```java title="FeeRefactoring.java" file="FeeRefactoring.java"
import java.util.EnumSet;

public class FeeRefactoring {
    // ----- legacy, kept only for the characterisation test
    static long legacyFee(String method, long cents, boolean international) {
        if (method.equals("CARD")) {
            long f = 30 + cents * 29 / 1000;
            if (international) f += cents / 100;
            return f;
        } else if (method.equals("UPI")) {
            return 0;
        } else if (method.equals("WALLET")) {
            return Math.min(cents / 50, 1000);
        } else {
            throw new IllegalArgumentException("unknown method " + method);
        }
    }

    // ----- refactored
    @FunctionalInterface
    interface FeeRule {
        long fee(long cents);

        static FeeRule withInternationalSurcharge(FeeRule base) {   // decorator
            return cents -> base.fee(cents) + cents / 100;
        }
    }

    enum PaymentMethod {
        CARD(cents -> 30 + cents * 29 / 1000, true),
        UPI(cents -> 0, false),
        WALLET(cents -> Math.min(cents / 50, 1000), false),
        BNPL(cents -> 50 + cents * 25 / 1000, true);               // new: no existing rule edited

        private final FeeRule domestic;
        private final FeeRule international;

        PaymentMethod(FeeRule domestic, boolean surchargeAbroad) {
            this.domestic = domestic;
            this.international = surchargeAbroad ? FeeRule.withInternationalSurcharge(domestic) : domestic;
        }

        long fee(long cents, boolean isInternational) {
            return (isInternational ? international : domestic).fee(cents);
        }
    }

    public static void main(String[] args) {
        long[] amounts = { 0, 99, 1_000, 54_321, 1_000_000 };
        int cases = 0, mismatches = 0;
        for (PaymentMethod m : EnumSet.complementOf(EnumSet.of(PaymentMethod.BNPL))) {
            for (long cents : amounts) {
                for (boolean intl : new boolean[] { false, true }) {
                    cases++;
                    long before = legacyFee(m.name(), cents, intl);
                    long after = m.fee(cents, intl);
                    if (before != after) {
                        mismatches++;
                        System.out.println("MISMATCH " + m + " " + cents + " intl=" + intl + ": " + before + " vs " + after);
                    }
                }
            }
        }
        System.out.println("characterisation test: " + cases + " cases, " + mismatches + " mismatches");
        System.out.println("CARD 54321 international: " + PaymentMethod.CARD.fee(54_321, true) + " cents");
        System.out.println("BNPL 54321 domestic: " + PaymentMethod.BNPL.fee(54_321, false)
                + ", international: " + PaymentMethod.BNPL.fee(54_321, true) + " cents");
        try {
            PaymentMethod.valueOf("CRYPTO");
        } catch (IllegalArgumentException e) {
            System.out.println("unknown method still rejected: " + e.getMessage());
        }
    }
}
```

```text title="Output" output="FeeRefactoring.java"
characterisation test: 30 cases, 0 mismatches
CARD 54321 international: 2148 cents
BNPL 54321 domestic: 1408, international: 1951 cents
unknown method still rejected: No enum constant FeeRefactoring.PaymentMethod.CRYPTO
```

Thirty cases matched, so the refactoring is behaviour-preserving. Adding `BNPL` touched one line, and the surcharge logic is written once and reused. The stringly typed `method` became an enum, so typos are now compile errors or explicit `valueOf` failures. The compiler, instead of an `else` branch at run time, tracks the full set of methods.
````

## Knowledge check

```quiz
? A class computes taxes, renders PDFs and uploads files to S3. Which principle does it violate most directly?
+ Single Responsibility
- Liskov Substitution
- Interface Segregation
> It has three unrelated reasons to change.

? Adding a new payment type requires editing a long if/else chain in five places. Which principle is violated?
+ Open/Closed
- Dependency Inversion
- Liskov Substitution
> Encapsulate the varying behaviour behind an abstraction.

? Why are characterisation tests written before refactoring legacy code?
+ To pin current behaviour, so any change is detected
- To improve performance
- To document the new design
> They turn accidental behaviour changes into visible test failures.

? Business logic calls new SmtpEmailClient() directly. Which change follows Dependency Inversion?
+ Depend on a Notifier interface and inject an implementation
- Make SmtpEmailClient a singleton
- Extend SmtpEmailClient
> High-level policy depends on abstractions.

? Which design avoids the Square/Rectangle problem?
+ Immutable shape types implementing a common Shape interface
- Overriding setWidth in Square
- Making Rectangle abstract
> Without setters, there is no contract to break.
```

## Key takeaways

- Clean code means **clear names, small focused functions, domain types instead of primitives, guard clauses, constants, immutability, and comments that explain why**.
- **SOLID**:
  - **S**: one reason to change;
  - **O**: extend via abstractions, not edits;
  - **L**: subtypes honour contracts;
  - **I**: small client-specific interfaces;
  - **D**: depend on abstractions, inject the details.
- Apply the principles where change actually happens. Avoid speculative layers (YAGNI, the rule of three).
- **Refactor safely**: characterisation tests first, then small behaviour-preserving steps, and separate commits for behaviour changes.
- Money in cents or `BigDecimal`, enums instead of strings, and records for value objects remove whole classes of bugs.
