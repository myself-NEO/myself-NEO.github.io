## Concept explanation

### A data carrier in one line

Before Java 16, an immutable value class needed:
- private final fields;
- a constructor;
- getters;
- `equals`, `hashCode` and `toString`;

roughly 40 lines that all had to be kept consistent. A **record** declares the same thing in one line:

```java
public record Point(int x, int y) { }
```

The **record header** `(int x, int y)` lists the **components**. From it, the compiler generates:

| Generated member | Details |
|---|---|
| `private final int x, y` | one field per component; records can't declare other instance fields |
| a **canonical constructor** `Point(int x, int y)` | assigns every field |
| **accessors** `x()` and `y()` | named after the component, **not** `getX()` |
| `equals(Object)` | same record class and equal components (see the details below) |
| `hashCode()` | combines all components |
| `toString()` | `Point[x=3, y=4]` |

A record is **implicitly `final`**, extends **`java.lang.Record`** and can't extend anything else. Nested records are implicitly `static`. Records model **transparent, shallowly immutable data**: the state is exactly the components, all of them public through accessors.

### What you can add

- **A compact canonical constructor** for validation and normalisation. You don't list the parameters or assign fields; the assignment happens automatically at the end, using the (possibly reassigned) parameters:

  ```java
  record Range(int low, int high) {
      Range {
          if (low > high) throw new IllegalArgumentException(low + " > " + high);
      }
  }
  ```

- **Extra constructors**, which must call another constructor first (`this(...)`).
- **Instance methods** (`distanceTo`, "withers" like `withX(int)` that return modified copies), **static fields, methods and factories**, and **nested types**.
- **Interfaces**: `record Money(...) implements Comparable<Money>`. Records work very well with **sealed interfaces** (next lesson).
- **Overridden accessors, `equals`, `hashCode` or `toString`**, for example to hide a secret in `toString`. An overridden accessor must be `public` with the same return type.
- **Generic records** (`record Pair<A, B>(A first, B second)`) and **local records** declared inside a method for intermediate results. Local records are implicitly static, so they can't capture local variables.
- **Annotations on components**, which propagate to the field, accessor and constructor parameter where the annotation's target allows.

### What records can't do

- extend another class (they already extend `Record`);
- declare instance fields beyond the components, or instance initialisers;
- be abstract, or have non-final component fields: there are no setters;
- be **deeply** immutable automatically. A `List` component is still a mutable list unless you copy it (`List.copyOf`) in the compact constructor.

### Record or class?

Use a **record** for values whose identity *is* their data: DTOs, API requests and responses, events, query results, map keys, configuration, coordinates, money. Use a **class** when you need encapsulated mutable state, hidden fields, inheritance, lazy or derived caches, or framework requirements (JPA entities need a no-arg constructor, mutable fields and non-final classes for proxies).

## Internal working

- The class file contains a **`Record` attribute** listing the components (names, types, annotations). Reflection exposes it via `Class.isRecord()` and `getRecordComponents()`, and serialization frameworks use it.
- **`equals`, `hashCode` and `toString` are generated with `invokedynamic`**, bootstrapped by `java.lang.runtime.ObjectMethods`, with method handles for the **fields**. Two consequences:
  - the bytecode stays small;
  - the generated methods read the **fields directly, not your overridden accessors**. An accessor that rounds or upper-cases doesn't change `equals` or `toString`.
- **Component comparison in `equals`:**
  - **Reference components** are compared with `Objects.equals`. **Arrays** therefore compare by identity, so two records holding equal arrays are *not* equal.
  - **Primitive components** are compared with the wrapper's `compare` method, so `0.0` and `-0.0` differ and `NaN` equals `NaN`. That's different from `==` on doubles.
- The **hashCode** combination is unspecified: it's consistent with `equals`, but don't depend on its exact value.
- **The compact constructor** compiles to the canonical constructor. Your code runs first, then the fields are assigned from the parameter variables. Reassigning `members = List.copyOf(members)` therefore changes what gets stored. Assigning `this.members` yourself is a compile error.
- **Serialization**: records are deserialised **through the canonical constructor**, so validation runs, unlike ordinary classes, whose fields are restored without a constructor. This makes serialized records much safer.
- **Frameworks**:
  - **Jackson** (2.12+) maps JSON to records via the canonical constructor;
  - **Spring** binds `@ConfigurationProperties` to records;
  - **Spring Data** and **Hibernate** can project query results into records;
  - **JPA *entities*** can't be records, although `@Embeddable` records are supported in recent Hibernate versions.

## Visual representation

```text title="What a record with a compact constructor compiles to"
  final class Point extends java.lang.Record {
      private final int x;                         <- component fields
      private final int y;

      Point(int x, int y) {                        <- canonical constructor
          /* compact constructor body: validate / normalise the PARAMETERS */
          this.x = x;  this.y = y;                 <- assigned automatically at the end
      }
      public int x() { return x; }                 <- accessors (no "get")
      public int y() { return y; }
      public boolean equals(Object o)  -> invokedynamic ObjectMethods: same class && fields equal
      public int hashCode()            -> invokedynamic ObjectMethods: combine fields
      public String toString()         -> invokedynamic ObjectMethods: "Point[x=3, y=4]"
  }
  Record attribute in the class file: [int x, int y]   -> isRecord(), getRecordComponents()
```

## Java code example

```java title="RecordsDemo.java" file="RecordsDemo.java"
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class RecordsDemo {
    // 1. Validation, extra constructor, methods, static members
    record Point(int x, int y) {
        static final Point ORIGIN = new Point(0, 0);

        Point {                                                  // compact canonical constructor
            if (x < 0 || y < 0) {
                throw new IllegalArgumentException("negative coordinate (" + x + ", " + y + ")");
            }
        }

        Point(int both) {                                        // extra constructors delegate
            this(both, both);
        }

        double distanceTo(Point other) {
            return Math.hypot(x - other.x, y - other.y);
        }

        Point withX(int newX) {                                  // copy instead of mutating
            return new Point(newX, y);
        }
    }

    // 2. Normalising parameters and defensive copies
    record Team(String name, List<String> members) {
        Team {
            name = name.strip();                                 // reassign the parameter...
            members = List.copyOf(members);                      // ...and its value is what gets stored
        }
    }

    // 3. Customising generated members
    record Password(String value) {
        @Override
        public String toString() {
            return "Password[***]";                               // don't leak secrets into logs
        }
    }

    record Temperature(double celsius) {
        @Override
        public double celsius() {                                // accessor override: must stay public
            return Math.round(celsius * 10) / 10.0;
        }
    }

    // 4. Interfaces and generics
    record Money(long cents, String currency) implements Comparable<Money> {
        @Override
        public int compareTo(Money other) {
            return Long.compare(cents, other.cents);
        }
    }

    record Pair<A, B>(A first, B second) { }

    // 5. Pitfalls
    record Samples(int[] values) { }

    record Reading(double value) { }

    public static void main(String[] args) {
        Point p = new Point(3, 4);
        System.out.println(p + "  x()=" + p.x() + "  y()=" + p.y());
        System.out.println("equal to new Point(3, 4): " + p.equals(new Point(3, 4)) + ", same hashCode: " + (p.hashCode() == new Point(3, 4).hashCode()));
        System.out.println("distance " + p.distanceTo(Point.ORIGIN) + ", withX " + p.withX(10) + ", Point(7) " + new Point(7));
        try {
            new Point(-1, 2);
        } catch (IllegalArgumentException e) {
            System.out.println("compact constructor rejected: " + e.getMessage());
        }

        List<String> source = new ArrayList<>(List.of("ada", "linus"));
        Team team = new Team("  core  ", source);
        source.add("intruder");
        System.out.println(team + "  <- unaffected by later changes to the source list");
        try {
            team.members().add("x");
        } catch (UnsupportedOperationException e) {
            System.out.println("members() is unmodifiable");
        }

        System.out.println(new Password("hunter2") + ", but value().length() = " + new Password("hunter2").value().length());
        Temperature t = new Temperature(21.4567);
        System.out.println("accessor " + t.celsius() + " vs toString " + t + "  <- generated methods read the field");

        List<Money> prices = new ArrayList<>(List.of(new Money(999, "EUR"), new Money(250, "EUR"), new Money(1_500, "EUR")));
        prices.sort(Comparator.naturalOrder());
        System.out.println("sorted money " + prices.stream().map(Money::cents).toList());
        Pair<String, Integer> pair = new Pair<>("answer", 42);
        System.out.println(pair + " -> typed access: " + pair.first().toUpperCase() + ", " + (pair.second() + 1));

        // A local record for an intermediate result
        record CityCount(String city, long count) { }
        List<CityCount> ranking = Stream.of("Oslo", "Lima", "Oslo", "Pune", "Oslo", "Lima")
                .collect(Collectors.groupingBy(c -> c, Collectors.counting()))
                .entrySet().stream()
                .map(e -> new CityCount(e.getKey(), e.getValue()))
                .sorted(Comparator.comparingLong(CityCount::count).reversed().thenComparing(CityCount::city))
                .toList();
        System.out.println("local record " + ranking);

        // Records as map keys: value equality just works
        Map<Point, String> labels = Map.of(new Point(1, 1), "home");
        System.out.println("lookup by equal key: " + labels.get(new Point(1, 1)));

        // Pitfalls
        System.out.println("records with equal arrays equal? " + new Samples(new int[] {1, 2}).equals(new Samples(new int[] {1, 2})));
        System.out.println("0.0 vs -0.0 equal? " + new Reading(0.0).equals(new Reading(-0.0)) + " (yet 0.0 == -0.0 is " + (0.0 == -0.0) + ")");
        System.out.println("NaN equals NaN? " + new Reading(Double.NaN).equals(new Reading(Double.NaN)));

        // Reflection sees the record structure
        String components = Arrays.stream(Point.class.getRecordComponents())
                .map(c -> c.getType() + " " + c.getName())
                .collect(Collectors.joining(", "));
        System.out.println("isRecord " + Point.class.isRecord() + ", components [" + components + "], superclass "
                + Point.class.getSuperclass().getSimpleName() + ", final " + Modifier.isFinal(Point.class.getModifiers()));
    }
}
```

## Output

```text title="Output" output="RecordsDemo.java"
Point[x=3, y=4]  x()=3  y()=4
equal to new Point(3, 4): true, same hashCode: true
distance 5.0, withX Point[x=10, y=4], Point(7) Point[x=7, y=7]
compact constructor rejected: negative coordinate (-1, 2)
Team[name=core, members=[ada, linus]]  <- unaffected by later changes to the source list
members() is unmodifiable
Password[***], but value().length() = 7
accessor 21.5 vs toString Temperature[celsius=21.4567]  <- generated methods read the field
sorted money [250, 999, 1500]
Pair[first=answer, second=42] -> typed access: ANSWER, 43
local record [CityCount[city=Oslo, count=3], CityCount[city=Lima, count=2], CityCount[city=Pune, count=1]]
lookup by equal key: home
records with equal arrays equal? false
0.0 vs -0.0 equal? false (yet 0.0 == -0.0 is true)
NaN equals NaN? true
isRecord true, components [int x, int y], superclass Record, final true
```

- One line of header produced the constructor, accessors, `equals`, `hashCode` and `toString`, which is why `Point` worked as a `Map` key immediately.
- The compact constructor validated the parameters. `Team`'s constructor stripped the name and stored an unmodifiable copy, so later changes to `source` didn't leak in.
- `Temperature.celsius()` returned the rounded value, but `toString` still showed `21.4567`: generated members use the fields, not your accessor.
- `Samples` records with equal arrays weren't equal (arrays compare by identity). `Reading` followed `Double.compare`: `0.0` and `-0.0` differ and `NaN` equals itself.
- Reflection reports the components, the `Record` superclass and the implicit `final`.

## Real-world application

- **DTOs and API models**: `record CreateOrderRequest(String customerId, List<LineDto> lines)` with validation in the compact constructor. Jackson, Spring MVC and Bean Validation (`@NotNull` on components) all support records.
- **Query projections**: `select new com.shop.OrderSummary(o.id, o.total) from Order o` in JPA, Spring Data interface or record projections, jOOQ `into(Record.class)`.
- **Events and messages**: `record OrderPlaced(UUID orderId, Instant at)` on Kafka, with immutable payloads that are safe to share between threads.
- **Value objects in domain models**: `Money`, `EmailAddress`, `DateRange`, using validation to make invalid values unrepresentable.
- **Composite map keys and multi-value returns**: `record Key(String tenant, String sku)`, `record MinMax(int min, int max)`, instead of `Map<String, Map<…>>` or `Object[]`.
- **Configuration**: `@ConfigurationProperties("app.mail") record MailProps(String host, int port)`.

## Common mistakes

- **Assuming deep immutability**: copy mutable components (`List.copyOf`, `Map.copyOf`, array clones) in the compact constructor, and don't expose internal arrays.
- **Array components**: `equals` and `hashCode` use identity, and `toString` prints `[I@1b6d3586`. Prefer `List<Integer>`, or override all three.
- **Assigning fields in a compact constructor** (`this.x = x`), which doesn't compile. Reassign the *parameter* instead.
- **Expecting an overridden accessor to affect `equals` or `toString`.** It doesn't, so normalise in the constructor instead.
- **Calling accessors `getX()`**: the accessor is `x()`. Some older libraries expect JavaBeans getters; check that your framework supports records.
- **Using records as JPA entities**, or anywhere a framework needs a no-arg constructor and setters.
- **Putting expensive computation in accessors** or relying on `hashCode` values in tests.

## Interview questions

**Q1. What does the compiler generate for a record?**

````reveal title="Answer"
- a `private final` field per component;
- a canonical constructor;
- public accessor methods named after the components (`x()`, not `getX()`);
- `equals` and `hashCode` based on all components;
- `toString` in the form `Name[a=1, b=2]`.

The class is implicitly `final` and extends `java.lang.Record`. `equals`, `hashCode` and `toString` are implemented via `invokedynamic` with `ObjectMethods`.
````

**Q2. Are records immutable?**

````reveal title="Answer"
Shallowly. Component fields are `final` and there are no setters, but if a component is a mutable object (a `List`, an array, a `Date`), its contents can still change. For true immutability, make defensive copies in the compact constructor (`List.copyOf`) and use immutable component types.
````

**Q3. What is a compact constructor, and how is it different from writing the canonical constructor?**

````reveal title="Answer"
A compact constructor omits the parameter list and field assignments: `Point { if (x < 0) throw ...; }`. Its body runs first, then the compiler assigns every field from the corresponding parameter. You can reassign the parameters to normalise values (`name = name.strip()`), but you can't assign `this.x` yourself. A full canonical constructor declares the parameters and must assign all fields explicitly. Use the compact form for validation and normalisation.
````

**Q4. Can a record extend a class or have extra instance fields?**

````reveal title="Answer"
No to both. A record implicitly extends `java.lang.Record` (and Java has single inheritance), and its state is exactly its components: only static fields may be added. A record can implement interfaces, declare methods, static members, nested types and extra constructors that delegate to the canonical one.
````

**Q5. Two records each hold `new int[]{1, 2}`. Are they `equals`?**

````reveal title="Answer"
No. Generated `equals` compares reference components with `Objects.equals`, and arrays don't override `equals`, so arrays compare by identity. Use a `List<Integer>` component, or override `equals`, `hashCode` and `toString` using `Arrays.equals`/`Arrays.hashCode`/`Arrays.toString`, and clone the array defensively.
````

## Hands-on exercise

Model a small order domain with records only:

- `Email(String value)`: strip and lower-case it in the compact constructor. Reject values without exactly one `@` or without a `.` after it.
- `LineItem(String sku, int quantity, long unitCents)`: quantity must be positive; add `long totalCents()`.
- `Order(String id, Email customer, List<LineItem> items)`: copy `items` defensively; add `long totalCents()` and `Order withItem(LineItem item)`, which returns a *new* order.

Show that two orders built from equal data are `equals`, that `withItem` leaves the original unchanged, that `items()` can't be modified, and that invalid e-mails and quantities are rejected.

````hint title="Hint"
In `Email`'s compact constructor: `value = value.strip().toLowerCase();` then `int at = value.indexOf('@');` and check `at > 0 && at == value.lastIndexOf('@') && value.indexOf('.', at) > at + 1`. For `withItem`: `var copy = new ArrayList<>(items); copy.add(item); return new Order(id, customer, copy);`.
````

````solution title="Solution"
```java title="OrderRecords.java" file="OrderRecords.java"
import java.util.ArrayList;
import java.util.List;

public class OrderRecords {
    record Email(String value) {
        Email {
            value = value.strip().toLowerCase();
            int at = value.indexOf('@');
            boolean valid = at > 0 && at == value.lastIndexOf('@') && value.indexOf('.', at) > at + 1;
            if (!valid) {
                throw new IllegalArgumentException("invalid e-mail: " + value);
            }
        }
    }

    record LineItem(String sku, int quantity, long unitCents) {
        LineItem {
            if (quantity <= 0) {
                throw new IllegalArgumentException("quantity must be positive for " + sku + ": " + quantity);
            }
        }

        long totalCents() {
            return quantity * unitCents;
        }
    }

    record Order(String id, Email customer, List<LineItem> items) {
        Order {
            items = List.copyOf(items);                         // unmodifiable, decoupled from the caller
        }

        long totalCents() {
            return items.stream().mapToLong(LineItem::totalCents).sum();
        }

        Order withItem(LineItem item) {
            var copy = new ArrayList<>(items);
            copy.add(item);
            return new Order(id, customer, copy);
        }
    }

    public static void main(String[] args) {
        Email ada = new Email("  Ada@Example.COM ");
        Order first = new Order("A-1", ada, List.of(new LineItem("pen", 3, 150)));
        Order twin = new Order("A-1", new Email("ada@example.com"), List.of(new LineItem("pen", 3, 150)));
        System.out.println(first);
        System.out.println("equal to an order built separately: " + first.equals(twin));

        Order bigger = first.withItem(new LineItem("desk", 1, 30_000));
        System.out.println("original total " + first.totalCents() + ", new total " + bigger.totalCents() + ", items " + first.items().size() + " vs " + bigger.items().size());

        try {
            first.items().add(new LineItem("lamp", 1, 4_000));
        } catch (UnsupportedOperationException e) {
            System.out.println("items() cannot be modified");
        }
        for (String candidate : List.of("no-at-sign.com", "a@b@c.com", "x@nodot")) {
            try {
                new Email(candidate);
            } catch (IllegalArgumentException e) {
                System.out.println(e.getMessage());
            }
        }
        try {
            new LineItem("pen", 0, 150);
        } catch (IllegalArgumentException e) {
            System.out.println(e.getMessage());
        }
    }
}
```

```text title="Output" output="OrderRecords.java"
Order[id=A-1, customer=Email[value=ada@example.com], items=[LineItem[sku=pen, quantity=3, unitCents=150]]]
equal to an order built separately: true
original total 450, new total 30450, items 1 vs 2
items() cannot be modified
invalid e-mail: no-at-sign.com
invalid e-mail: a@b@c.com
invalid e-mail: x@nodot
quantity must be positive for pen: 0
```

Invalid values can't be constructed, valid ones compare by value, and changes produce new objects. That's a value object in under 50 lines. The normalised e-mail is what's stored, so two differently typed addresses compare equal.
````

## Knowledge check

```quiz
? What is the accessor for the component `name` in `record User(String name)`?
+ name()
- getName()
- the public field name
> Records use the component name, without a get prefix.

? Which can a record declare?
+ A static field
- An extra instance field
- A superclass via extends
> State is exactly the components; records already extend java.lang.Record.

? In a compact constructor, how do you normalise a component?
+ Reassign the parameter, e.g. name = name.strip();
- Assign this.name = name.strip();
- Call a setter
> Fields are assigned from the parameters automatically after the body.

? `record R(double d)`: what is new R(0.0).equals(new R(-0.0))?
+ false
- true
- It throws ArithmeticException
> Primitive components are compared with Double.compare, not ==.

? You override a record's accessor to return a rounded value. What does the generated toString print?
+ The raw field value
- The rounded accessor value
- It fails to compile
> The generated equals, hashCode and toString read the fields directly.
```

## Key takeaways

- A **record** is a final, shallowly immutable **data carrier**: one header gives fields, a canonical constructor, accessors (`x()`), `equals`, `hashCode` and `toString`.
- **Compact constructors** validate and normalise by **reassigning parameters**. Make defensive copies of mutable components.
- Records can add methods, static members, extra delegating constructors, implement interfaces and be generic or local. They **can't** extend classes or add instance fields.
- The generated members use **fields**, not accessors. **Arrays** compare by identity; primitives compare via the wrapper's `compare` method.
- Use records for DTOs, events, value objects, keys and projections; use classes for entities and encapsulated mutable state.
