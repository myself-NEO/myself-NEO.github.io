## Two kinds of abstraction

Java gives you two ways to define a supertype that can't be instantiated directly:

- An **interface** declares a **contract** — *what* implementers can do. Since Java 8 it can include `default` and `static` methods; since Java 9, `private` helper methods. It **cannot hold instance state**.
- An **abstract class** is a **partial implementation** — it can hold fields, constructors and concrete methods, and leaves some methods `abstract` for subclasses to fill in.

## Side by side

| | Interface | Abstract class |
|---|---|---|
| Instance fields (state) | No (only `static final` constants) | Yes |
| Constructors | No | Yes |
| Multiple inheritance | A class can implement **many** | A class can extend **one** |
| Method bodies | `default`, `static`, `private` methods | Any |
| Access modifiers on methods | Implicitly `public` (or `private` helpers) | Any |
| Typical meaning | "can do X" — a capability or role | "is a kind of X" — shared identity and state |
| Evolution | Add methods with `default` bodies | Add concrete methods freely |

## Rule of thumb

1. **Start with an interface** for any type that collaborators depend on. It's the most flexible: any class can implement it, including classes that already extend something else, test doubles and lambdas (if it has a single abstract method).
2. **Add an abstract class** only when several implementations share **state or a fixed algorithm skeleton** that you'd otherwise duplicate. Often the abstract class *implements* the interface, so callers still depend on the interface.

```java title="Interface for callers, abstract class for implementers" file="ReportDemo.java"
import java.util.List;

public class ReportDemo {
    public static void main(String[] args) {
        List<ReportExporter> exporters = List.of(new CsvExporter(), new JsonExporter());
        List<String[]> rows = List.of(new String[]{"Asha", "42"}, new String[]{"Ravi", "37"});
        for (ReportExporter e : exporters) {
            System.out.println(e.export("Scores", rows));
        }
    }
}

/** What callers depend on. */
interface ReportExporter {
    String export(String title, List<String[]> rows);
}

/** Shared skeleton and state for implementers (see Template Method). */
abstract class AbstractExporter implements ReportExporter {
    private int exportCount = 0;   // shared state: impossible in an interface

    @Override
    public final String export(String title, List<String[]> rows) {
        exportCount++;
        StringBuilder out = new StringBuilder(header(title));
        for (String[] row : rows) out.append(formatRow(row));
        return out.append(footer()).toString();
    }

    protected abstract String header(String title);
    protected abstract String formatRow(String[] row);
    protected String footer() { return ""; }   // optional hook

    int exportCount() { return exportCount; }
}

class CsvExporter extends AbstractExporter {
    protected String header(String title) { return "# " + title + "\n"; }
    protected String formatRow(String[] row) { return String.join(",", row) + "\n"; }
}

class JsonExporter extends AbstractExporter {
    private boolean first = true;
    protected String header(String title) { first = true; return "{\"title\":\"" + title + "\",\"rows\":["; }
    protected String formatRow(String[] row) {
        String prefix = first ? "" : ",";
        first = false;
        return prefix + "[\"" + String.join("\",\"", row) + "\"]";
    }
    @Override protected String footer() { return "]}"; }
}
```

Callers only know about `ReportExporter`. A completely different exporter (say, one that delegates to a PDF library) can implement the interface directly without inheriting the skeleton.

## Default methods: useful, but don't build base classes out of them

Default methods let you **evolve** an interface without breaking implementers, or provide small conveniences:

```java
interface Shape {
    double area();
    default boolean isLargerThan(Shape other) { return area() > other.area(); }
}
```

Keep defaults **stateless and derived from the abstract methods**. If you find yourself wanting fields inside an interface, you want an abstract class (or composition).

> [!WARNING] Diamond defaults
> If a class implements two interfaces with the same default method, it must override it and choose explicitly (`A.super.method()`). This is rare, but it's a reason to keep default methods small.

## Sealed interfaces (Java 17): closed sets of types

Sometimes the set of implementations is **closed by design**: a payment is a card, UPI or wallet payment, and nothing else. A `sealed` interface lists its permitted implementations, and the compiler enforces that list:

```java title="A closed hierarchy with records" file="SealedDemo.java"
public class SealedDemo {
    public static void main(String[] args) {
        Payment[] payments = { new Card("4111", 500), new Upi("asha@okbank", 250), new Wallet("W-9", 120) };
        long total = 0;
        for (Payment p : payments) {
            System.out.println(describe(p));
            total += p.amount();
        }
        System.out.println("Total: " + total);
    }

    // instanceof pattern matching is final in Java 16+.
    static String describe(Payment p) {
        if (p instanceof Card c) return "Card ending " + c.number().substring(c.number().length() - 4);
        if (p instanceof Upi u) return "UPI " + u.vpa();
        if (p instanceof Wallet w) return "Wallet " + w.walletId();
        throw new AssertionError("unreachable: sealed hierarchy");
    }
}

sealed interface Payment permits Card, Upi, Wallet {
    long amount();
}

record Card(String number, long amount) implements Payment {}
record Upi(String vpa, long amount) implements Payment {}
record Wallet(String walletId, long amount) implements Payment {}
```

Use sealed types for **data-like variants** that rarely change. Use open interfaces plus polymorphism for **behavioural variants** that plug in over time (new notification channels, new pricing rules).

## Real-world example

A logging library exposes `interface Appender { void append(LogEvent e); }`. Most built-in appenders (console, file, rolling file) share buffering, formatting and error-handling logic, so they extend `AbstractAppender`. A team writing a Kafka appender implements `Appender` directly because their batching works differently. Both coexist because callers only see the interface. See the [Logging Framework](problem:logging-framework) problem.

## Common mistakes

- **Abstract class as the public type** of a dependency, forcing every implementation (and test fake) into that hierarchy.
- **Interfaces with one method per class** — interface explosion. Group methods by client need (see [Interface Segregation](lesson:interface-segregation)).
- **Default methods that hide state** in static maps keyed by `this`. That's an abstract class in disguise, and a memory leak.
- **Marker interfaces with logic attached elsewhere.** Prefer polymorphic methods.

## In the interview

> [!INTERVIEW] A crisp justification
> *"`PricingStrategy` is an interface because pricing varies and I want any implementation — even a lambda in tests. `Vehicle` is a sealed interface with records because the set of vehicle types is fixed for this problem."*

## Key takeaways

- **Interface** = contract (what); **abstract class** = shared state and skeleton (how).
- Depend on **interfaces**; use abstract classes as **implementation helpers** behind them.
- Keep default methods small and derived from abstract methods.
- Use **sealed interfaces** for closed sets of variants; open interfaces for plug-in behaviour.

## Knowledge check

```quiz
? Several exporters need a shared counter field and the same export algorithm with different formatting steps. What fits best?
- Put the counter in a static field of the interface
+ An abstract class that implements the interface and holds the shared state and skeleton
- Copy the counter into each exporter
> Interfaces cannot hold instance state; an abstract base class behind the interface removes the duplication.

? Why should collaborators depend on the interface rather than the abstract class?
+ So any implementation — including test doubles and classes with a different superclass — can be used
- Interfaces are faster at runtime
- Abstract classes cannot have public methods
> Depending on the interface keeps the dependency as narrow and flexible as possible.

? When is a sealed interface a good choice?
- When third parties should add implementations
+ When the set of variants is fixed by the domain, such as card, UPI or wallet payments
- Whenever an interface has more than three methods
> Sealed types model closed sets; the compiler rejects unexpected implementations.
```

## Exercise

You're modelling chess pieces. Every piece has a colour and a current position (shared state), and each kind computes its moves differently. Some code also needs to treat "things that can be captured" uniformly — pieces now, perhaps power-ups in a variant later. Decide what should be an interface and what should be an abstract class, and sketch the types.

````hint title="Hint"
Which concept carries shared state? Which is a capability that unrelated types may share?
````

````solution title="Sample design"
```java
interface Capturable {               // capability: pieces now, power-ups later
    boolean canBeCapturedBy(Colour attacker);
}

abstract class Piece implements Capturable {   // shared state + identity
    protected final Colour colour;
    protected Position position;

    protected Piece(Colour colour, Position position) {
        this.colour = colour;
        this.position = position;
    }

    public boolean canBeCapturedBy(Colour attacker) { return attacker != colour; }

    abstract List<Position> candidateMoves(Board board);   // varies per piece
}

final class Knight extends Piece { /* candidateMoves: L-shapes */ }
final class Rook extends Piece   { /* candidateMoves: ranks and files */ }
```

`Piece` is abstract because pieces share state and identity. `Capturable` is an interface because it's a role that unrelated types can play. The full design is in the [Chess](problem:chess) problem.
````
