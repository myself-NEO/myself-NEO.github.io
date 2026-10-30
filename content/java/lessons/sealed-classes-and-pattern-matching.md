## Concept explanation

### Sealed classes and interfaces (Java 17)

Normally a class is either open to *any* subclass, or `final` and allows none. A **sealed** type allows a **fixed, known list** of subtypes:

```java
public sealed interface Shape permits Circle, Rectangle, Polygon { }
```

Every permitted subtype must say how it continues the hierarchy:

| Modifier | Meaning |
|---|---|
| `final` | no further subclasses (records and enums are implicitly final) |
| `sealed … permits …` | another closed level |
| `non-sealed` | re-opens the hierarchy: anyone may extend this branch |

Rules:
- Permitted subtypes must be in the **same module**, or in the **same package** if you don't use modules.
- They must directly extend or implement the sealed type.
- The `permits` clause can be omitted when all subtypes are declared in the **same source file**.

Why seal? A sealed type says "these are *all* the cases". That's documentation, a guard against unexpected implementations, and, most importantly, it lets the compiler check that a `switch` handles every case.

**Sealed interfaces + records = algebraic data types.** Records are *product types* ("a `Rectangle` has a width **and** a height") and a sealed interface is a *sum type* ("a `Shape` is a `Circle` **or** a `Rectangle` **or** …"). Functional languages have long modelled domains this way: results, events, commands, expression trees, protocol messages.

### Pattern matching for `instanceof` (Java 16)

```java
if (obj instanceof String s && s.length() > 3) {   // test + cast + bind in one step
    System.out.println(s.toUpperCase());
}
```

The **binding variable** `s` is in scope only where the match is certain (*flow scoping*). After `if (!(obj instanceof String s)) return;`, `s` is usable for the rest of the method.

### Pattern matching for `switch` (Java 21)

`switch` accepts **any reference type** and **patterns** as case labels:

```java
String describe(Object o) {
    return switch (o) {
        case null -> "null";                                   // explicit null handling
        case Integer i when i > 1000 -> "big " + i;             // guard
        case Integer i -> "int " + i;
        case String s -> "text of length " + s.length();
        default -> "other";
    };
}
```

- **Type patterns** `case Circle c` test the type and bind a variable.
- **Guards** `when condition` add a boolean test. A guarded case doesn't count towards exhaustiveness.
- **`case null`** (alone, or as `case null, default ->`). Without it, a null selector still throws `NullPointerException`.
- **Dominance**: a more general pattern can't come before a more specific one. `case Polygon p` before `case Triangle t` is a compile error ("this case label is dominated by a preceding case label"). Unguarded cases go after the guarded ones for the same type.
- **Exhaustiveness**: a pattern `switch` must cover all possible values. Over a **sealed** type, listing every permitted subtype is enough, with **no `default`**. Add a new subtype and every non-exhaustive switch becomes a **compile error** that points to the code you must update.

### Record patterns (Java 21)

A record pattern **deconstructs** a record into its components, and patterns can nest:

```java
case Rectangle(double w, double h) when w == h -> "square " + w;
case Add(Num(var a), Num(var b)) -> String.valueOf(a + b);           // nested, with var
if (shape instanceof Circle(double r) && r > 10) { ... }              // works with instanceof too
```

`var` in a pattern infers the component type. Java 22 added **unnamed patterns** `_` for components you don't need, such as `case Add(Num(var a), _)` (next lesson).

## Internal working

- **Sealed types** are recorded in the class file's **`PermittedSubclasses`** attribute. The **JVM enforces it at class-loading time**: a class that isn't listed but tries to extend the sealed type fails with `IncompatibleClassChangeError`, even if you bypass `javac`. Reflection: `Class.isSealed()`, `getPermittedSubclasses()`.
- **Pattern `switch`** compiles to an `invokedynamic` call to **`SwitchBootstraps.typeSwitch`** (or `enumSwitch`). It returns the index of the first case whose type matches, starting from a given index, followed by an ordinary `tableswitch` on that index. When a **guard fails**, the generated code calls the bootstrap again with the *next* index ("restart index"), so later cases are tried in order. The JDK can optimise the type tests (for example with type-profile caching) without recompiling user code.
- **Exhaustive switches still get a hidden default.** If a new subtype appears at run time that the compiled switch didn't know about (because of separate compilation), it throws **`MatchException`** rather than silently doing nothing.
- **Record patterns** call the record's **accessor methods** to extract components, then match nested patterns against the results. A `null` component never matches a nested type pattern, so `Add(Num n, …)` doesn't match if `left` is `null`. If an accessor throws, the exception is wrapped in a `MatchException`.
- **Generic record patterns** infer type arguments: with `Box<String> b`, `case Box(var s)` gives `s` the type `String`.
- **`instanceof` patterns** compile to an `instanceof` check plus `checkcast` into a fresh local, which is exactly the code you used to write by hand.

## Visual representation

```text title="A sealed hierarchy and an exhaustive switch"
                       sealed interface Shape permits Circle, Rectangle, Polygon
                     /                    |                          \
        record Circle (final)   record Rectangle (final)     non-sealed class Polygon
                                                               /            \
                                                    final Triangle      (anyone else may extend)

  switch (shape) {                                    compiler checks:
      case Circle c when c.radius() == 0 -> ...       guarded: doesn't count toward exhaustiveness
      case Circle c                    -> ...         covers Circle
      case Rectangle(double w, double h) -> ...       record pattern, covers Rectangle
      case Triangle t                  -> ...         must come BEFORE Polygon (dominance)
      case Polygon p                   -> ...         covers Polygon and every unknown subclass
  }                                                   all permitted subtypes covered: no default needed

  bytecode: invokedynamic typeSwitch(shape, restartIndex) -> case index -> tableswitch
            guard false -> typeSwitch(shape, index + 1) ... ; unknown type at run time -> MatchException
```

## Java code example

```java title="PatternMatching.java" file="PatternMatching.java" java="21"
import java.util.Arrays;
import java.util.List;

public class PatternMatching {
    // An expression tree: a sealed interface (sum type) of records (product types)
    sealed interface Expr permits Num, Add, Mul, Neg { }
    record Num(int value) implements Expr { }
    record Add(Expr left, Expr right) implements Expr { }
    record Mul(Expr left, Expr right) implements Expr { }
    record Neg(Expr operand) implements Expr { }

    // final, sealed and non-sealed branches
    sealed interface Shape permits Circle, Rectangle, Polygon { }
    record Circle(double radius) implements Shape { }
    record Rectangle(double width, double height) implements Shape { }

    static non-sealed class Polygon implements Shape {         // re-opened: anyone may extend
        final int sides;

        Polygon(int sides) {
            this.sides = sides;
        }
    }

    static final class Triangle extends Polygon {
        Triangle() {
            super(3);
        }
    }

    // Type patterns + exhaustiveness over a sealed type: no default
    static int eval(Expr e) {
        return switch (e) {
            case Num n -> n.value();
            case Add a -> eval(a.left()) + eval(a.right());
            case Mul m -> eval(m.left()) * eval(m.right());
            case Neg n -> -eval(n.operand());
        };
    }

    // Record patterns deconstruct the components
    static String show(Expr e) {
        return switch (e) {
            case Num(int v) when v < 0 -> "(" + v + ")";
            case Num(int v) -> String.valueOf(v);
            case Add(Expr l, Expr r) -> "(" + show(l) + " + " + show(r) + ")";
            case Mul(Expr l, Expr r) -> show(l) + " * " + show(r);
            case Neg(Expr inner) -> "-" + show(inner);
        };
    }

    // Nested record patterns + guards: algebraic simplification
    static Expr simplify(Expr e) {
        return switch (e) {
            case Mul(Num(var v), var other) when v == 0 -> new Num(0);
            case Mul(var other, Num(var v)) when v == 0 -> new Num(0);
            case Mul(Num(var v), var other) when v == 1 -> simplify(other);
            case Mul(var other, Num(var v)) when v == 1 -> simplify(other);
            case Add(Num(var v), var other) when v == 0 -> simplify(other);
            case Add(var other, Num(var v)) when v == 0 -> simplify(other);
            case Neg(Neg(var inner)) -> simplify(inner);
            case Add(var l, var r) -> new Add(simplify(l), simplify(r));
            case Mul(var l, var r) -> new Mul(simplify(l), simplify(r));
            case Neg(var inner) -> new Neg(simplify(inner));
            case Num n -> n;
        };
    }

    // Guards, dominance and the non-sealed branch
    static String describe(Shape s) {
        return switch (s) {
            case Circle c when c.radius() == 0 -> "a point";
            case Circle c -> "circle r=" + c.radius();
            case Rectangle(double w, double h) when w == h -> "square " + w;
            case Rectangle(double w, double h) -> "rectangle " + w + "x" + h;
            case Triangle t -> "triangle";                      // must precede Polygon
            case Polygon p -> p.sides + "-sided polygon";       // also covers unknown subclasses
        };
    }

    // Patterns over Object, with case null and default
    static String format(Object o) {
        return switch (o) {
            case null -> "null, handled explicitly";
            case Integer i when i > 1_000 -> "big int " + i;
            case Integer i -> "int " + i;
            case String s when s.isBlank() -> "blank string";
            case String s -> "string \"" + s + "\"";
            case int[] arr -> "int[] of length " + arr.length;
            case List<?> list -> "list of " + list.size();
            case Expr e -> "expression worth " + eval(e);
            default -> "other: " + o.getClass().getSimpleName();
        };
    }

    // instanceof patterns and flow scoping
    static String classic(Object o) {
        if (o instanceof String s && s.length() > 3) {
            return "long string " + s;
        }
        if (!(o instanceof Integer n)) {
            return "not an integer";
        }
        return "integer squared " + (n * n);                    // n is in scope: the other path returned
    }

    public static void main(String[] args) {
        Expr expr = new Add(new Num(2), new Mul(new Num(3), new Neg(new Num(-4))));
        System.out.println(show(expr) + " = " + eval(expr));
        Expr messy = new Add(new Num(0), new Mul(new Num(1), new Neg(new Neg(new Num(7)))));
        System.out.println(show(messy) + "  simplifies to  " + show(simplify(messy)));

        for (Shape s : List.of(new Circle(0), new Circle(1.5), new Rectangle(2, 2), new Rectangle(2, 3), new Triangle(), new Polygon(6))) {
            System.out.println("describe: " + describe(s));
        }
        for (Object o : Arrays.asList(null, 42, 5_000, "  ", "hi", new int[3], List.of(1, 2), new Num(9), 3.14)) {
            System.out.println("format: " + format(o));
        }
        System.out.println(classic("pattern") + " | " + classic("abc") + " | " + classic(12));

        if (expr instanceof Add(Num(int first), var rest)) {    // record pattern in instanceof
            System.out.println("starts with " + first + ", then " + show(rest));
        }
        System.out.println("Expr sealed: " + Expr.class.isSealed() + ", permits "
                + Arrays.stream(Expr.class.getPermittedSubclasses()).map(Class::getSimpleName).toList());
    }
}
```

## Output

```text title="Output" output="PatternMatching.java"
(2 + 3 * -(-4)) = 14
(0 + 1 * --7)  simplifies to  7
describe: a point
describe: circle r=1.5
describe: square 2.0
describe: rectangle 2.0x3.0
describe: triangle
describe: 6-sided polygon
format: null, handled explicitly
format: int 42
format: big int 5000
format: blank string
format: string "hi"
format: int[] of length 3
format: list of 2
format: expression worth 9
format: other: Double
long string pattern | not an integer | integer squared 144
starts with 2, then 3 * -(-4)
Expr sealed: true, permits [Num, Add, Mul, Neg]
```

- `eval` and `show` have **no `default`**. If someone adds `record Div(...) implements Expr`, both stop compiling until they handle `Div`. That's the payoff of sealing.
- `simplify` matched *shapes of trees*: `0 + (1 * --7)` became `7` through nested record patterns and guards. The final unguarded cases make the switch exhaustive.
- `describe` needed `Triangle` before `Polygon`. Swapping them is a dominance compile error. `Polygon(6)`, a direct instance of the non-sealed class, was still covered by `case Polygon p`.
- `format(null)` reached `case null` instead of throwing.
- The `instanceof` record pattern extracted `first` from a nested `Num` in one expression.

## Real-world application

- **Domain results without exceptions**: `sealed interface PaymentResult permits Approved, Declined, Pending`. Callers must handle every outcome, and the compiler enforces it.
- **Events and commands**: `sealed interface OrderEvent permits Placed, Paid, Shipped, Cancelled`, handled in event-sourced aggregates and Kafka consumers with exhaustive switches.
- **API response modelling**: `sealed interface ApiResponse<T> permits Ok, NotFound, Invalid`, mapped to HTTP status codes in one switch.
- **Parsers, compilers and rule engines**: ASTs like the `Expr` example. Interpreters and optimisers become pattern matches.
- **State machines**: `sealed interface ConnectionState`, with records carrying per-state data.
- **Replacing the Visitor pattern**: an exhaustive switch over a sealed hierarchy does the same job with far less boilerplate, and new operations don't need changes to the classes.

## Common mistakes

- **Adding `default` to a switch over a sealed type.** It silences the compile error you want when a new subtype is added.
- **Wrong case order**: a general type before a specific one (dominance error), or an unguarded case before a guarded case of the same type.
- **Forgetting `case null`.** A pattern switch still throws `NullPointerException` on `null` unless it has `case null`.
- **Putting permitted subclasses in another package** without modules (not allowed), or forgetting `final`/`sealed`/`non-sealed` on a subclass.
- **Using `non-sealed` casually.** It re-opens the hierarchy and weakens exhaustiveness: you'll need a case for the non-sealed parent.
- **Deeply nested record patterns** that are hard to read. Extract helper methods or match in stages.
- **Guards with side effects.** Guards may be evaluated in order as cases are tried, so keep them pure.

## Interview questions

**Q1. What are sealed classes, and why use them?**

````reveal title="Answer"
A sealed class or interface restricts which classes may directly extend or implement it: `sealed interface Shape permits Circle, Square`. Each permitted subtype must be `final`, `sealed` or `non-sealed`, and must live in the same module (or package). Benefits:
- the closed set of cases is explicit;
- the hierarchy is protected from unknown implementations (the JVM enforces it at load time);
- the compiler can check pattern-matching switches for exhaustiveness without a `default`.

Combined with records, sealed interfaces model algebraic data types.
````

**Q2. What does exhaustiveness checking give you, and what happens at run time if a new subtype appears anyway?**

````reveal title="Answer"
A pattern switch over a sealed type that lists every permitted subtype needs no `default`. When a subtype is added, every such switch fails to compile, which points to every place that must handle the new case. If code compiled against the old hierarchy runs with a newer, separately compiled hierarchy, the compiler's hidden default branch throws `MatchException` (Java 21) instead of silently skipping the value.
````

**Q3. What is a guard, and how does it interact with exhaustiveness?**

````reveal title="Answer"
A guard is a `when` clause on a pattern case: `case Circle c when c.radius() > 10 ->`. The case matches only if the pattern matches and the guard is true. Because a guard can be false, the compiler doesn't count guarded cases when checking exhaustiveness. You still need an unguarded `case Circle c` (or a broader pattern) after it.
````

**Q4. What is pattern dominance?**

````reveal title="Answer"
A case label dominates a later one if every value matching the later label would already match the earlier one. For example, `case Object o` dominates everything after it, and `case Polygon p` dominates `case Triangle t` when `Triangle extends Polygon`. A dominated label is unreachable, so the compiler reports an error. Order cases from specific to general, and put guarded cases before the unguarded case of the same type.
````

**Q5. What are record patterns?**

````reveal title="Answer"
Patterns that match a record type and deconstruct its components in one step: `case Point(int x, int y)`. They can nest (`case Line(Point(var x1, var y1), Point p2)`), use `var` for inference, and appear in `switch` and `instanceof`. Matching calls the accessors, and a `null` component doesn't match nested type patterns. Java 22 adds `_` to ignore components.
````

## Hands-on exercise

Model a payment gateway's results as a sealed interface of records:

- `Approved(String transactionId, long cents)`, `Declined(String reason, boolean retryable)`, `Pending(Duration retryAfter)`.
- `charge(String card, long cents)` simulates the gateway:
  - card `4000-0002` → declined, "insufficient funds", retryable;
  - `4000-0069` → declined, "expired card", not retryable;
  - `4000-0119` → pending, 30 seconds;
  - anything else → approved with id `"tx-" + cents`.
- `message(PaymentResult)`: one exhaustive switch with record patterns and guards. Flag approvals of 1,000.00 or more for review, and suggest a retry only for retryable declines. No `default`.

Print the messages for five charges.

````hint title="Hint"
`case Approved(var id, var cents) when cents >= 100_000 -> ...` must come before `case Approved(var id, var cents) -> ...`. Do the same for `Declined` with a `when retryable` guard. Format money with `String.format("%.2f", cents / 100.0)`.
````

````solution title="Solution"
```java title="Payments.java" file="Payments.java" java="21"
import java.time.Duration;
import java.util.List;

public class Payments {
    sealed interface PaymentResult permits Approved, Declined, Pending { }
    record Approved(String transactionId, long cents) implements PaymentResult { }
    record Declined(String reason, boolean retryable) implements PaymentResult { }
    record Pending(Duration retryAfter) implements PaymentResult { }

    static PaymentResult charge(String card, long cents) {
        return switch (card) {
            case "4000-0002" -> new Declined("insufficient funds", true);
            case "4000-0069" -> new Declined("expired card", false);
            case "4000-0119" -> new Pending(Duration.ofSeconds(30));
            default -> new Approved("tx-" + cents, cents);
        };
    }

    static String message(PaymentResult result) {
        return switch (result) {
            case Approved(var id, var cents) when cents >= 100_000 ->
                    "approved " + id + " for " + money(cents) + " - flagged for manual review";
            case Approved(var id, var cents) -> "approved " + id + " for " + money(cents);
            case Declined(var reason, var retryable) when retryable -> "declined (" + reason + "), please try again";
            case Declined(var reason, var retryable) -> "declined: " + reason + ", use another card";
            case Pending(var after) -> "pending, check again in " + after.toSeconds() + "s";
        };
    }

    static String money(long cents) {
        return String.format("%.2f", cents / 100.0);
    }

    public static void main(String[] args) {
        List<String> cards = List.of("4242-4242", "4000-0002", "4000-0069", "4000-0119", "5555-4444");
        List<Long> amounts = List.of(2_599L, 4_000L, 1_000L, 7_500L, 250_000L);
        for (int i = 0; i < cards.size(); i++) {
            PaymentResult result = charge(cards.get(i), amounts.get(i));
            System.out.printf("%-10s %-50s <- %s%n", cards.get(i), message(result), result);
        }
    }
}
```

```text title="Output" output="Payments.java"
4242-4242  approved tx-2599 for 25.99                         <- Approved[transactionId=tx-2599, cents=2599]
4000-0002  declined (insufficient funds), please try again    <- Declined[reason=insufficient funds, retryable=true]
4000-0069  declined: expired card, use another card           <- Declined[reason=expired card, retryable=false]
4000-0119  pending, check again in 30s                        <- Pending[retryAfter=PT30S]
5555-4444  approved tx-250000 for 2500.00 - flagged for manual review <- Approved[transactionId=tx-250000, cents=250000]
```

Adding a fourth outcome, say `record Refused(String fraudScore)`, makes `message` fail to compile until it handles that outcome. With a `default` branch, the new case would slip through silently.
````

## Knowledge check

```quiz
? A permitted subclass of a sealed class must be declared as...
+ final, sealed or non-sealed
- abstract
- public and in a different package
> Every permitted subtype states how the hierarchy continues. Records and enums are implicitly final.

? A switch over a sealed interface lists every permitted record and has no default. A new record is added to permits. What happens?
+ The switch no longer compiles until the new case is handled
- The new record silently falls through
- The new record matches the first case
> Exhaustiveness is checked at compile time; that's the main reason to omit default.

? Why must `case Triangle t` come before `case Polygon p` when Triangle extends Polygon?
+ Otherwise Polygon dominates Triangle and the compiler reports an error
- Cases are checked in alphabetical order
- It's only a style rule
> A dominated case label could never be reached.

? Without a `case null`, what does a pattern switch do with a null selector?
+ It throws NullPointerException
- It goes to default
- It matches the first type pattern
> Only an explicit case null handles null.

? Which compiles in Java 21?
+ if (o instanceof Point(int x, int y) && x > y) { ... }
- if (o instanceof Point(x, y)) { ... }
- case Point(0, var y) -> ...
> Record patterns need types or var for components; constants aren't patterns, so use a guard instead.
```

## Key takeaways

- **Sealed** types fix their direct subtypes (`permits`). Each subtype is `final`, `sealed` or `non-sealed`. The JVM enforces the list.
- **`instanceof` patterns** (16) test, cast and bind in one step, with flow-sensitive scope.
- **Pattern switches** (21) support type patterns, **record patterns** (nested, with `var`), **guards** (`when`) and **`case null`**. Order cases by **dominance**.
- **Exhaustiveness** over sealed hierarchies removes `default`: adding a subtype breaks every switch that must handle it, and stale binaries throw `MatchException`.
- Sealed interfaces + records = **algebraic data types** for results, events, commands and trees, a lighter alternative to the Visitor pattern.
