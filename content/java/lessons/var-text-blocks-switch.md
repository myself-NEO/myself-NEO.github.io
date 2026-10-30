## Concept explanation

Four small features from Java 10 to 15 that change how everyday code looks.

### `var`: local-variable type inference (Java 10)

```java
var orders = new HashMap<String, List<Order>>();   // instead of repeating the type
for (var entry : orders.entrySet()) { ... }
try (var in = Files.newBufferedReader(path)) { ... }
```

`var` tells the compiler to infer the **static type of the initializer**. The variable is still **statically typed**: `var count = 1;` is an `int` forever, and `count = "x"` doesn't compile. Java hasn't become dynamically typed.

**Allowed:** local variables *with an initializer*, enhanced-for and classic-for variables, try-with-resources, and lambda parameters (Java 11, `(var x, var y) -> ...`, useful for annotations).

**Not allowed:**

| Code | Why |
|---|---|
| `var x;` | no initializer to infer from |
| `var x = null;` | `null` has no usable type |
| `var arr = {1, 2};` | array initialisers need an explicit type |
| `var f = () -> 42;` | a lambda needs a target type |
| `var a = 1, b = 2;` | no compound declarations |
| fields, method parameters, return types | `var` is for *locals* only, so APIs stay explicit |

Traps:
- **`var list = new ArrayList<>();`** infers `ArrayList<Object>`: the diamond has nothing to infer from. Write `new ArrayList<String>()`.
- **`var n = 1;`** is `int`, not `long`; `var f = 1.0f` is `float`. Literals decide.
- **`var x = someCall();`** hides the type from readers. Use `var` when the right-hand side makes the type obvious (`new`, factory methods with telling names), and spell the type out otherwise.

`var` is a **reserved type name**, not a keyword: `int var = 5;` still compiles, but you can't name a *class* `var`.

### Switch expressions (Java 14)

The classic `switch` *statement* falls through without `break` and can't produce a value. The new form fixes both:

```java
String label = switch (status) {
    case NEW, PAID -> "open";                   // several labels, no fall-through
    case SHIPPED -> "done";
    case CANCELLED -> {
        log.info("cancelled");
        yield "closed";                         // yield returns a value from a block
    }
};                                              // no default: every enum constant is covered
```

- **Arrow labels (`case X ->`)** never fall through. They work in switch *statements* too.
- **Several constants per label**: `case SATURDAY, SUNDAY ->`.
- **`yield`** returns a value from a block body. `return` would leave the enclosing method.
- **Exhaustiveness**: a switch *expression* must cover every possible value. For enums (and, from Java 21, sealed types) listing every constant is enough. For `int` or `String` you need `default`.
- **`default -> throw ...`**: a branch may throw instead of producing a value.
- Selector types: integral primitives and their wrappers, `String`, enums. Java 21 adds any type with patterns (next lessons).
- **`null`**: a selector that's `null` throws `NullPointerException`, unless Java 21's `case null` is present.

### Text blocks (Java 15)

```java
String json = """
    {
      "name": "%s",
      "tags": ["java"]
    }
    """.formatted(name);
```

- The opening `"""` must be followed by a **line break**; the content starts on the next line.
- **Incidental indentation is removed.** The compiler finds the smallest indentation among the content lines *and the closing delimiter's line*, and strips that much from every line. Move the closing `"""` left to keep indentation; put it at the end of the last line to avoid a trailing newline.
- **Trailing spaces are stripped.** Use `\s` to keep a space.
- **Escapes**: `\n`, `\t`, `\"` work as usual. You only need to escape `"""` (as `\"""`), not single quotes. A `\` at the end of a line **joins it with the next** (no newline).
- **Line endings** are normalised to `\n`, whatever the source file uses.
- Useful methods: `formatted(...)` (Java 15), `stripIndent()`, `translateEscapes()`.

### Helpful NullPointerExceptions (Java 14)

Before Java 14, `a.b().c().d()` failing gave just `NullPointerException` at a line number. Now the message says **what** was null:

```text
Cannot invoke "String.toUpperCase()" because the return value of "Address.city()" is null
Cannot invoke "java.lang.Integer.intValue()" because the return value of "java.util.Map.get(Object)" is null
Cannot store to int array because "grid[1]" is null
```

The feature has been on by default since Java 15.

## Internal working

- **`var` is pure compile-time sugar.** The class file records the inferred type exactly as if you had written it, so the bytecode is identical and there's no run-time cost. The inferred type can be **non-denotable**: an anonymous class type (so you can access the anonymous class's extra fields), an intersection type, or a captured wildcard type.
- **Switch on `String`** compiles to a `lookupswitch` on `hashCode()` followed by `equals` checks to rule out collisions, and then a second switch on the matched index.
- **Switch on an enum**:
  - Before pattern matching, it compiled through a synthetic `$SwitchMap$...` array that maps each constant's `ordinal()` to a case number at run time, so reordering the enum's constants doesn't break already compiled switches.
  - Java 21 can use `invokedynamic`-based `SwitchBootstraps`.
- **Exhaustive switch expressions without `default`**: `javac` still adds a hidden default branch. If a *new* constant appears at run time, because the enum was recompiled separately, that branch throws `MatchException` (Java 21+); code compiled for Java 14–20 throws `IncompatibleClassChangeError`.
- **Text blocks are processed entirely by `javac`**: normalise line endings, strip incidental and trailing whitespace, then interpret escapes. The result is an ordinary **string constant** in the constant pool, interned like any literal. A text block and a literal with the same content are the *same* object (`==` is `true`).
- **Helpful NPE messages** are computed **lazily** by the JVM when `getMessage()` is first called. It analyses the bytecode around the failing instruction to describe the null expression, so exceptions that are never printed cost nothing extra.
  - **Local variable names** appear only if the class was compiled with `-g` (debug info). Otherwise you see `"<local4>"`.
  - The flag is `-XX:+ShowCodeDetailsInExceptionMessages`, on by default since 15.

## Visual representation

```text title="How a text block's indentation is computed"
  source (dots = spaces)                         result
  ----------------------------------------      ------------------------
  String a = """                                 "<p>\n  hi\n</p>\n"
  ........<p>                                    the smallest indent is 8,
  ..........hi                                   so 8 spaces are stripped from each line
  ........</p>
  ........""";       <- closing delimiter line, also indent 8

  String b = """                                 "....<p>\n......hi\n....</p>\n"
  ........<p>                                    the closing delimiter at indent 4
  ..........hi                                   lowers the minimum to 4:
  ........</p>                                   4 spaces are kept on every line
  ....""";

  old switch (fall-through)                      switch expression
  case 2: r += "two";        -- no break -->     case 2 -> "two";   (never falls through)
  case 3: r += "three"; break;                   case 3 -> "three";
```

## Java code example

```java title="ModernSyntax.java" file="ModernSyntax.java"
import java.time.DayOfWeek;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class ModernSyntax {
    enum Status { NEW, PAID, SHIPPED, CANCELLED }

    record Address(String city) { }

    record Customer(String name, Address address) { }

    public static void main(String[] args) {
        // ---- var (Java 10) ----
        var names = new ArrayList<String>();                    // ArrayList<String>
        names.add("ada");
        var index = new HashMap<String, List<Integer>>();       // a long type written once
        index.computeIfAbsent("ada", k -> new ArrayList<>()).add(1);
        for (var entry : index.entrySet()) {
            System.out.println("var in for: " + entry.getKey() + "=" + entry.getValue());
        }
        var anything = new ArrayList<>();                       // ArrayList<Object>
        anything.add(42);
        anything.add("text");
        System.out.println("diamond + var accepts anything: " + anything);
        var small = 1;
        var single = 1.0f;
        System.out.println("inferred from literals: " + box(small).getClass().getSimpleName() + ", " + box(single).getClass().getSimpleName());
        var point = new Object() {                              // an anonymous, non-denotable type
            int x = 3;
            int y = 4;
        };
        System.out.println("anonymous fields through var: " + (point.x + point.y));
        int var = 5;                                            // var is a reserved type name, not a keyword
        System.out.println("a variable called var: " + var);

        // ---- switch expressions (Java 14) ----
        for (Status s : Status.values()) {
            String label = switch (s) {                         // exhaustive: no default needed
                case NEW, PAID -> "open";
                case SHIPPED -> "done";
                case CANCELLED -> {
                    String note = "refund issued";
                    yield "closed, " + note;                    // yield gives the block's value
                }
            };
            System.out.println(s + " -> " + label);
        }
        System.out.println("old switch(2): " + oldStyle(2) + " | new switch(2): " + newStyle(2));
        System.out.println("weekend: " + isWeekend(DayOfWeek.SATURDAY) + " " + isWeekend(DayOfWeek.MONDAY));
        System.out.println("404 -> " + category(404) + ", 503 -> " + category(503));
        try {
            category(99);
        } catch (IllegalArgumentException e) {
            System.out.println("default branch threw: " + e.getMessage());
        }

        // ---- text blocks (Java 15) ----
        String json = """
            {
              "name": "%s",
              "tags": ["java", "text-blocks"]
            }
            """.formatted("Ada");
        System.out.print(json);
        String sql = """
            SELECT id, name \
            FROM users \
            WHERE active = true""";
        System.out.println("joined lines: " + sql);
        String indented = """
                <p>hi</p>
            """;                                                // closing delimiter 4 columns further left
        System.out.print("kept indentation: " + indented.replace(' ', '.'));
        String escapes = """
            trailing space kept:\s
            triple quote: \"""
            """;
        System.out.print(escapes.replace(' ', '.'));
        String literal = "hello";
        String block = """
            hello""";
        System.out.println("same interned constant: " + (literal == block) + ", lines in json: " + json.lines().count());

        // ---- helpful NullPointerExceptions (Java 14) ----
        Customer customer = new Customer("Ada", new Address(null));
        try {
            System.out.println(customer.address().city().toUpperCase());
        } catch (NullPointerException e) {
            System.out.println("NPE: " + e.getMessage());
        }
        Map<String, Integer> stock = new HashMap<>();
        try {
            int left = stock.get("pen");                        // unboxing a missing value
            System.out.println(left);
        } catch (NullPointerException e) {
            System.out.println("NPE: " + e.getMessage());
        }
    }

    static Object box(Object value) {
        return value;
    }

    @SuppressWarnings("fallthrough")                           // deliberately buggy legacy code
    static String oldStyle(int n) {
        String result = "";
        switch (n) {
            case 1:
                result += "one ";
            case 2:
                result += "two ";                               // missing break: falls into case 3
            case 3:
                result += "three ";
                break;
            default:
                result += "other";
        }
        return result.trim();
    }

    static String newStyle(int n) {
        return switch (n) {
            case 1 -> "one";
            case 2 -> "two";
            case 3 -> "three";
            default -> "other";
        };
    }

    static boolean isWeekend(DayOfWeek day) {
        return switch (day) {
            case SATURDAY, SUNDAY -> true;
            default -> false;
        };
    }

    static String category(int status) {
        return switch (status / 100) {
            case 2 -> "success";
            case 3 -> "redirect";
            case 4 -> "client error";
            case 5 -> "server error";
            default -> throw new IllegalArgumentException("not an HTTP status: " + status);
        };
    }
}
```

## Output

```text title="Output" output="ModernSyntax.java"
var in for: ada=[1]
diamond + var accepts anything: [42, text]
inferred from literals: Integer, Float
anonymous fields through var: 7
a variable called var: 5
NEW -> open
PAID -> open
SHIPPED -> done
CANCELLED -> closed, refund issued
old switch(2): two three | new switch(2): two
weekend: true false
404 -> client error, 503 -> server error
default branch threw: not an HTTP status: 99
{
  "name": "Ada",
  "tags": ["java", "text-blocks"]
}
joined lines: SELECT id, name FROM users WHERE active = true
kept indentation: ....<p>hi</p>
trailing.space.kept:.
triple.quote:."""
same interned constant: true, lines in json: 4
NPE: Cannot invoke "String.toUpperCase()" because the return value of "ModernSyntax$Address.city()" is null
NPE: Cannot invoke "java.lang.Integer.intValue()" because the return value of "java.util.Map.get(Object)" is null
```

- `var anything = new ArrayList<>()` silently became `ArrayList<Object>` and accepted both an `Integer` and a `String`.
- `var` held the anonymous class's type, so `point.x` compiled. With `Object point` it wouldn't.
- The legacy switch fell from `case 2` into `case 3` and returned "two three"; the arrow form can't.
- `.replace(' ', '.')` makes whitespace visible: four spaces were kept because the closing `"""` sat further left, and `\s` survived trailing-space stripping.
- The text block and the literal `"hello"` were the same interned object.
- The NPE messages named the exact null expression: the return value of `Address.city()`, and the `Integer` from `Map.get` that was unboxed.

## Real-world application

- **`var`** shortens test code, stream-heavy methods and long generic types (`var grouped = new TreeMap<String, List<Order>>()`). Many teams' style guides allow it only when the type is obvious from the right-hand side.
- **Switch expressions** map enums to labels, HTTP statuses to categories, state machines to next states, and command names to handlers. The exhaustiveness check catches missing cases when an enum grows.
- **Text blocks** hold SQL, JSON test fixtures, GraphQL queries, HTML templates and multi-line log or error messages, with no `+ "\n" +` concatenation and no escaped quotes.
- **Helpful NPEs** let production logs say *which* link of `order.getCustomer().getAddress().getCity()` was null. That's one reason to compile with debug info (`-g`, which Maven and Gradle use by default).

## Common mistakes

- **`var` with the diamond** (`var map = new HashMap<>()`), which gives `HashMap<Object, Object>`.
- **`var` hiding important types**, as in `var result = service.process(x);`. Readers lose information that the IDE shows but code reviews don't.
- **Expecting `var` to make a variable dynamically typed**, or using it for fields.
- **Using `return` instead of `yield`** inside a switch-expression block. `return` is a compile error there.
- **Adding `default` to enum switch expressions.** It disables the "missing case" compile error when a new constant is added. Leave it out so the compiler checks exhaustiveness.
- **Text block pitfalls:**
  - content on the opening line (a compile error);
  - unintended trailing newlines (put the closing `"""` on the last content line);
  - indentation lost or kept by accident (watch the closing delimiter);
  - relying on trailing spaces (use `\s`).
- **Using `formatted` with user input in SQL text blocks.** Text blocks are just strings, so use bind parameters to avoid SQL injection.

## Interview questions

**Q1. Does `var` make Java dynamically typed?**

````reveal title="Answer"
No. `var` asks the compiler to infer the variable's static type from its initializer at compile time. The type is fixed: assigning a value of another type is a compile error, and the bytecode is identical to writing the type explicitly. It works only for local variables with initializers, loop variables, try-with-resources and lambda parameters; never for fields, parameters or return types.
````

**Q2. What does `var list = new ArrayList<>();` infer?**

````reveal title="Answer"
`ArrayList<Object>`. The diamond normally infers type arguments from the declared target type, but with `var` there's no target, so inference falls back to `Object`. The list then accepts anything. Write `var list = new ArrayList<String>();` or declare `List<String> list = new ArrayList<>();`.
````

**Q3. What's the difference between a switch statement with arrows and a switch expression? What is `yield`?**

````reveal title="Answer"
Arrow labels (`case X ->`) never fall through and can be used in both statements and expressions. A switch **expression** produces a value, so it must be exhaustive: every enum constant, every permitted sealed subtype, or a `default`. A block body uses `yield value;` to produce its result (`return` would exit the method). A switch *statement* with arrows doesn't need to be exhaustive (except with patterns, Java 21+) and produces no value.
````

**Q4. How does a text block decide how much indentation to strip?**

````reveal title="Answer"
After normalising line endings, `javac` computes the minimum leading whitespace over all non-blank content lines **and** the line containing the closing delimiter. That amount is removed from every line, along with trailing spaces. Moving the closing `"""` left keeps more indentation; placing it right after the last content line means no trailing newline. Escapes are interpreted afterwards, so `\s` and `\<newline>` aren't affected by stripping.
````

**Q5. What do helpful NullPointerException messages show, and when do they show local variable names?**

````reveal title="Answer"
They describe the failed action and the null expression, for example `Cannot invoke "String.length()" because the return value of "User.name()" is null`, or `because "orders[2]" is null`. The JVM computes the message lazily from the bytecode when `getMessage()` is called, so there's no cost otherwise. Local variable names appear only when the class was compiled with debug information (`-g`); otherwise placeholders like `<local3>` appear. On by default since Java 15.
````

## Hands-on exercise

Modernise some legacy helpers:

1. `daysIn(Month month, int year)`: a switch **expression** over `java.time.Month` with grouped labels (`APRIL, JUNE, SEPTEMBER, NOVEMBER -> 30`) and a block with `yield` for `FEBRUARY` (leap years: divisible by 4 and not by 100, or divisible by 400). No `default`.
2. `priority(String severity)`: map `"blocker"`/`"critical"` → 1, `"major"` → 2, `"minor"`/`"trivial"` → 3, and throw `IllegalArgumentException` for anything else, all in one switch expression.
3. `invoice(String customer, List<String[]> lines)`: build a plain-text invoice with a text block template and `formatted`, using `var` for the loop and the `StringBuilder`.

Print the days in February 1900, 2000 and 2024 and in April 2025, the priorities for a few severities, and an invoice.

````hint title="Hint"
`case FEBRUARY -> { boolean leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0; yield leap ? 29 : 28; }`. Switch on `severity.toLowerCase()`. Build the item lines in a loop with `String.format("%-10s %8.2f\n", ...)`, then insert them with `"""...""".formatted(customer, items, total)`.
````

````solution title="Solution"
```java title="LegacyMakeover.java" file="LegacyMakeover.java"
import java.time.Month;
import java.util.List;

public class LegacyMakeover {
    static int daysIn(Month month, int year) {
        return switch (month) {
            case APRIL, JUNE, SEPTEMBER, NOVEMBER -> 30;
            case FEBRUARY -> {
                boolean leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
                yield leap ? 29 : 28;
            }
            case JANUARY, MARCH, MAY, JULY, AUGUST, OCTOBER, DECEMBER -> 31;
        };
    }

    static int priority(String severity) {
        return switch (severity.toLowerCase()) {
            case "blocker", "critical" -> 1;
            case "major" -> 2;
            case "minor", "trivial" -> 3;
            default -> throw new IllegalArgumentException("unknown severity: " + severity);
        };
    }

    static String invoice(String customer, List<String[]> lines) {
        var items = new StringBuilder();
        var totalCents = 0;
        for (var line : lines) {
            int cents = Integer.parseInt(line[1]);
            totalCents += cents;
            items.append(String.format("  %-10s %8.2f\n", line[0], cents / 100.0));   // \n like the text block
        }
        return """
            INVOICE for %s
            ---------------------
            %s---------------------
              TOTAL      %8.2f
            """.formatted(customer, items, totalCents / 100.0);
    }

    public static void main(String[] args) {
        System.out.println("Feb 1900: " + daysIn(Month.FEBRUARY, 1900) + ", Feb 2000: " + daysIn(Month.FEBRUARY, 2000)
                + ", Feb 2024: " + daysIn(Month.FEBRUARY, 2024) + ", Apr 2025: " + daysIn(Month.APRIL, 2025));
        for (var severity : List.of("Blocker", "major", "TRIVIAL", "cosmetic")) {
            try {
                System.out.println(severity + " -> P" + priority(severity));
            } catch (IllegalArgumentException e) {
                System.out.println(severity + " -> " + e.getMessage());
            }
        }
        System.out.print(invoice("Ada", List.of(new String[] {"keyboard", "4999"}, new String[] {"cable", "799"})));
    }
}
```

```text title="Output" output="LegacyMakeover.java"
Feb 1900: 28, Feb 2000: 29, Feb 2024: 29, Apr 2025: 30
Blocker -> P1
major -> P2
TRIVIAL -> P3
cosmetic -> unknown severity: cosmetic
INVOICE for Ada
---------------------
  keyboard      49.99
  cable          7.99
---------------------
  TOTAL         57.98
```

Because `daysIn` has no `default`, deleting any month from the labels makes it fail to compile: the compiler checks exhaustiveness for you. 1900 isn't a leap year (divisible by 100 but not by 400), while 2000 is.
````

## Knowledge check

```quiz
? Which declaration compiles?
+ var names = new ArrayList<String>();
- var x;
- var nothing = null;
> var needs an initializer with a usable type.

? What type is v in `var v = new ArrayList<>();`?
+ ArrayList<Object>
- ArrayList<String>
- List<?>
> With var there is no target type for the diamond to use.

? Inside a switch expression's block, how do you produce the value?
+ yield value;
- return value;
- break value;
> return would exit the enclosing method.

? A switch expression over an enum lists every constant and has no default. What does it gain?
+ A compile error if a new constant is added later and not handled
- Faster execution
- Automatic handling of null
> Leaving out default keeps the exhaustiveness check useful.

? How do you keep a trailing space at the end of a text block line?
+ Use the \s escape
- Add two spaces
- Text blocks keep trailing spaces automatically
> Trailing whitespace is stripped; \s is translated after stripping.
```

## Key takeaways

- **`var`** infers a local variable's **static** type at compile time. Use it when the type is obvious; beware `var x = new ArrayList<>()` (→ `Object`) and literal types.
- **Switch expressions**: arrow labels (no fall-through), several labels per case, **`yield`** for blocks, **exhaustiveness** (skip `default` for enums so the compiler checks them).
- **Text blocks**: indentation stripped relative to the least-indented line and the closing delimiter; trailing spaces removed (`\s` keeps one); `\` joins lines; the result is an interned constant.
- **Helpful NPEs** name the null expression; compile with `-g` to get local variable names.
