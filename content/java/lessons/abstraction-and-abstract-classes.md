## Concept explanation

### What it is

**Abstraction** means exposing *what* something does while hiding *how* it does it. A caller of `PaymentGateway.charge(amount)` doesn't need to know whether the money moves through Stripe, a bank API or a test stub.

Java offers two tools for abstraction: **interfaces** (next lessons) and **abstract classes**:

- An **abstract class** is declared `abstract` and **can't be instantiated**. It may contain fields, constructors, concrete methods — and **abstract methods**, which have no body and must be implemented by concrete subclasses.
- A class with any abstract method must itself be abstract. A concrete subclass must implement every inherited abstract method (or be abstract too).

```java
public abstract class Shape {
    private final String name;
    protected Shape(String name) { this.name = name; }   // constructors are allowed
    public abstract double area();                         // no body: subclasses decide
    public String describe() { return name + " with area " + area(); }   // concrete method
}
```

### Abstraction versus encapsulation

| | Encapsulation | Abstraction |
|---|---|---|
| Question | *Who may touch the data?* | *What does the caller need to know?* |
| Mechanism | access modifiers, private state | interfaces, abstract types, well-named operations |
| Hides | the representation | the implementation and its variations |

They work together: encapsulation protects one object's state; abstraction lets callers depend on a concept instead of a concrete class.

### Why abstract classes exist

To share **code and state** among closely related classes while forcing each to supply the parts that differ. The classic shape is the **template method**: the abstract class defines an algorithm's skeleton as a (usually `final`) method and calls abstract "hook" methods for the varying steps.

### When to use an abstract class

- Several subclasses share **state** (fields) and **implementation**, and there is a true *is-a* relationship.
- You want to **control the algorithm** and let subclasses fill in steps (template method).
- You need **constructors** or non-public members in the shared part.

Prefer an **interface** when you only need a contract, when unrelated classes should be able to implement it, or when a class needs several such contracts — a class can extend only one class. Many designs combine both: an interface for the contract plus an abstract base class with shared plumbing (`List` + `AbstractList`).

## Internal working

- `abstract` sets the `ACC_ABSTRACT` flag on the class and its abstract methods. Abstract methods have **no `Code` attribute** in the class file.
- `new Shape()` is rejected by `javac`; even via bytecode, the JVM throws `InstantiationError` for an abstract class.
- An abstract class still has constructors (`<init>`), which run as part of constructing every concrete subclass — that's how shared fields get initialised.
- Calls to an abstract method compile to `invokevirtual` on the abstract type; at run time **dynamic dispatch** finds the subclass's implementation via its vtable (see [polymorphism](lesson:polymorphism-and-overriding)).
- If a class file is out of date and a subclass is missing an implementation, calling the method throws `AbstractMethodError` at run time.

## Visual representation

```text title="Template method in an abstract class"
                 abstract class ReportExporter
          +--------------------------------------------+
          | final byte[] export(Report r) {            |   fixed skeleton
          |    validate(r);          (concrete)        |
          |    String body = render(r);   <-- abstract |   varies per format
          |    return compress(header() + body);       |
          | }                                          |
          | protected abstract String render(Report r);|
          | protected String header() { return ""; }   |   optional hook
          +--------------------------------------------+
                 ^                          ^
       class CsvExporter               class JsonExporter
         render(): "a,b\n1,2"            render(): {"a":1,"b":2}
         header(): "a,b\n"
```

## Java code example

```java title="AbstractionDemo.java" file="AbstractionDemo.java"
import java.util.List;
import java.util.Locale;

public class AbstractionDemo {
    public static void main(String[] args) {
        List<Shape> shapes = List.of(new Circle(1), new Rectangle(2, 3), new Square(2));
        double total = 0;
        for (Shape s : shapes) {                       // the caller only knows "Shape"
            System.out.println(s.describe());
            total += s.area();
        }
        System.out.printf(Locale.ROOT, "total area = %.2f%n", total);

        // Template method: the skeleton is fixed, the steps vary
        Report report = new Report("Q3 sales", List.of(new String[] {"north", "120"}, new String[] {"south", "95"}));
        System.out.println(new CsvExporter().export(report));
        System.out.println(new MarkdownExporter().export(report));
        try {
            new CsvExporter().export(new Report("", List.of()));
        } catch (IllegalArgumentException e) {
            System.out.println("rejected: " + e.getMessage());
        }
    }
}

abstract class Shape {
    private final String name;

    protected Shape(String name) {                     // runs for every concrete subclass
        this.name = name;
    }

    abstract double area();

    String describe() {                                // concrete method calling an abstract one
        return String.format(Locale.ROOT, "%-9s area=%6.2f", name, area());
    }
}

class Circle extends Shape {
    private final double radius;

    Circle(double radius) {
        super("circle");
        this.radius = radius;
    }

    @Override
    double area() {
        return Math.PI * radius * radius;
    }
}

class Rectangle extends Shape {
    private final double width;
    private final double height;

    Rectangle(double width, double height) {
        this("rectangle", width, height);
    }

    protected Rectangle(String name, double width, double height) {
        super(name);
        this.width = width;
        this.height = height;
    }

    @Override
    double area() {
        return width * height;
    }
}

class Square extends Rectangle {
    Square(double side) {
        super("square", side, side);
    }
}

record Report(String title, List<String[]> rows) {
}

abstract class ReportExporter {
    /** The algorithm skeleton: final so subclasses can't reorder or skip steps. */
    final String export(Report report) {
        if (report.title().isBlank()) {
            throw new IllegalArgumentException("report needs a title");
        }
        StringBuilder out = new StringBuilder(header(report));
        for (String[] row : report.rows()) {
            out.append(renderRow(row)).append('\n');
        }
        return out.toString().stripTrailing();
    }

    protected abstract String renderRow(String[] row);   // required step

    protected String header(Report report) {             // optional hook with a default
        return "";
    }
}

class CsvExporter extends ReportExporter {
    @Override
    protected String renderRow(String[] row) {
        return String.join(",", row);
    }
}

class MarkdownExporter extends ReportExporter {
    @Override
    protected String header(Report report) {
        return "## " + report.title() + "\n| region | sales |\n|---|---|\n";
    }

    @Override
    protected String renderRow(String[] row) {
        return "| " + String.join(" | ", row) + " |";
    }
}
```

## Output

```text title="Output" output="AbstractionDemo.java"
circle    area=  3.14
rectangle area=  6.00
square    area=  4.00
total area = 13.14
north,120
south,95
## Q3 sales
| region | sales |
|---|---|
| north | 120 |
| south | 95 |
rejected: report needs a title
```

- The loop works with any `Shape`; adding a `Triangle` requires no change to it.
- `describe()` is written once in `Shape`; it calls whichever `area()` the actual object provides.
- `export` is `final`: both exporters share validation and assembly, and differ only in the steps they override.

## Real-world application

- **JDK skeletal implementations**: `AbstractList`, `AbstractMap`, `AbstractQueue` implement most of their interface on top of a few abstract methods (`get`, `size`, …), so writing a custom collection takes a dozen lines.
- **`java.io.InputStream`** is an abstract class: subclasses implement `read()`; buffering, `readAllBytes` and `transferTo` are inherited.
- **Frameworks**: Spring's `OncePerRequestFilter`, JUnit extensions and many "Abstract…Handler" classes are template methods with hooks.
- **Payment, notification or export pipelines** with fixed steps (validate → transform → send → audit) and per-provider variations.

## Common mistakes

- **Abstract classes for pure contracts** — an interface is more flexible (multiple implementation, lambdas for single-method ones).
- **Deep hierarchies of abstract classes**, where behaviour is scattered across five levels.
- **Calling abstract methods from the constructor**: the subclass's implementation runs before the subclass's fields are initialised.
- **Making the template method non-final**, so subclasses override the skeleton and skip validation.
- **Protected mutable fields** in the base class that subclasses modify freely, breaking the base class's invariants.
- **Thinking abstract classes can't have constructors** — they can, and usually should if they hold state.

## Interview questions

**Q1. Can an abstract class have a constructor? Why, if it can't be instantiated?**

````reveal title="Answer"
Yes. It can't be instantiated directly, but every concrete subclass's constructor calls it (explicitly or via `super()`), so it initialises the fields the abstract class declares and enforces their invariants. It's typically `protected`.
````

**Q2. Can an abstract class have no abstract methods?**

````reveal title="Answer"
Yes. Declaring a class `abstract` just prevents instantiation; it's used for base classes that are only meaningful when extended (e.g. a template class whose hooks all have defaults). The reverse isn't allowed: a class with an abstract method must be abstract.
````

**Q3. What is the difference between abstraction and encapsulation?**

````reveal title="Answer"
Encapsulation hides an object's *representation* and protects its invariants (private fields, validated operations). Abstraction hides *implementation details and variations* behind a simpler concept (an interface or abstract type), so callers depend on "what" rather than "how". A `PaymentGateway` interface is abstraction; the `private` balance inside `Account` is encapsulation.
````

**Q4. Abstract class or interface for a family of notification senders?**

````reveal title="Answer"
Define a `NotificationSender` **interface** as the contract (callers, DI and tests depend on it). If the senders share real plumbing — retries, rate limiting, metrics around a `doSend` step — add an abstract `AbstractNotificationSender implements NotificationSender` with a final template method. Unrelated implementations (a test fake, a lambda) can still implement the interface directly.
````

## Hands-on exercise

Create an abstract `Employee` with a name and a `final` method `payslip()` that prints `name: amount`. Subclasses:

- `SalariedEmployee(annualSalary)` — pays `annual / 12` per month;
- `HourlyEmployee(rate, hours)` — pays `rate * hours`, with hours above 160 paid at 1.5×.

Use `BigDecimal` with two decimals and `RoundingMode.HALF_EVEN`, and compute the monthly payroll total for a mixed list.

````hint title="Hint"
Put `abstract BigDecimal monthlyPay();` in `Employee` and implement the formatting once in `payslip()`. For overtime: `regular = min(hours, 160)`, `overtime = max(0, hours - 160)`.
````

````solution title="Solution"
```java title="PayrollDemo.java" file="PayrollDemo.java"
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

public class PayrollDemo {
    public static void main(String[] args) {
        List<Employee> staff = List.of(
                new SalariedEmployee("Ada", new BigDecimal("96000")),
                new HourlyEmployee("Linus", new BigDecimal("40.00"), 170),
                new HourlyEmployee("Grace", new BigDecimal("55.50"), 120));
        BigDecimal total = BigDecimal.ZERO;
        for (Employee e : staff) {
            System.out.println(e.payslip());
            total = total.add(e.monthlyPay());
        }
        System.out.println("payroll total: " + total);
    }
}

abstract class Employee {
    private final String name;

    protected Employee(String name) {
        this.name = name;
    }

    abstract BigDecimal monthlyPay();

    final String payslip() {
        return name + ": " + monthlyPay();
    }
}

class SalariedEmployee extends Employee {
    private final BigDecimal annual;

    SalariedEmployee(String name, BigDecimal annual) {
        super(name);
        this.annual = annual;
    }

    @Override
    BigDecimal monthlyPay() {
        return annual.divide(BigDecimal.valueOf(12), 2, RoundingMode.HALF_EVEN);
    }
}

class HourlyEmployee extends Employee {
    private static final int REGULAR_HOURS = 160;
    private final BigDecimal rate;
    private final int hours;

    HourlyEmployee(String name, BigDecimal rate, int hours) {
        super(name);
        this.rate = rate;
        this.hours = hours;
    }

    @Override
    BigDecimal monthlyPay() {
        int regular = Math.min(hours, REGULAR_HOURS);
        int overtime = Math.max(0, hours - REGULAR_HOURS);
        BigDecimal pay = rate.multiply(BigDecimal.valueOf(regular))
                .add(rate.multiply(new BigDecimal("1.5")).multiply(BigDecimal.valueOf(overtime)));
        return pay.setScale(2, RoundingMode.HALF_EVEN);
    }
}
```

```text title="Output" output="PayrollDemo.java"
Ada: 8000.00
Linus: 7000.00
Grace: 6660.00
payroll total: 21660.00
```

Linus: 160 × 40 + 10 × 60 = 7000. The formatting and the "name: amount" layout live in one `final` method.
````

## Knowledge check

```quiz
? Which statement about abstract classes is true?
- They can't have constructors
+ They can't be instantiated, but can have constructors, fields and concrete methods
- All their methods must be abstract
> Abstract classes can hold state and shared implementation.

? A concrete class extends an abstract class but doesn't implement one abstract method. What happens?
+ Compile error unless the class is also declared abstract
- The method returns null at run time
- It inherits an empty implementation
> Every abstract method must be implemented by a concrete class.

? Why is the template method often declared `final`?
+ So subclasses can customise the steps but not change the algorithm's order or skip validation
- final methods are faster
- Abstract classes require it
> final protects the skeleton.

? When is an interface usually a better choice than an abstract class?
- When subclasses share fields
+ When unrelated classes need to fulfil the same contract, possibly alongside other contracts
- When you need a constructor
> A class can implement many interfaces but extend only one class.
```

## Key takeaways

- **Abstraction** hides *how*; callers depend on *what*. **Encapsulation** hides *representation*.
- **Abstract classes** can't be instantiated but can hold state, constructors and concrete methods; abstract methods must be implemented by concrete subclasses.
- The **template method** (a `final` skeleton calling abstract/hook steps) is the main reason to use one.
- Prefer **interfaces** for contracts; add an abstract base class only for genuinely shared state and code.
- Don't call abstract or overridable methods from constructors.
