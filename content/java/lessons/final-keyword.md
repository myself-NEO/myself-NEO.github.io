## Concept explanation

### What it is

`final` means "can't be changed after it's set", applied to different things:

| Applied to | Meaning |
|---|---|
| **Local variable / parameter** | can be assigned only once |
| **Instance field** | must be assigned exactly once, by the end of every constructor |
| **Static field** | assigned exactly once, at declaration or in a static block (a constant if the value is a compile-time constant) |
| **Method** | can't be overridden by subclasses |
| **Class** | can't be subclassed (`String`, `Integer`, `LocalDate`, all records) |

A `final` variable declared without an initialiser is a **blank final**; the compiler checks it's assigned exactly once on every path.

### Why it exists

- **Intent and safety:** readers (and the compiler) know a value won't change, so there's one less thing to track.
- **Immutability building block:** immutable classes use `final` fields and `final` classes (see [immutable classes](lesson:immutable-classes)).
- **Design control:** a `final` method or class stops subclasses from breaking invariants — "design for inheritance or else prohibit it".
- **Concurrency:** the Java Memory Model gives `final` fields special visibility guarantees.

### `final` is not immutability

`final` protects the **variable**, not the **object** it refers to:

```java
final List<String> names = new ArrayList<>();
names.add("Ada");            // fine: the list object is mutable
names = new ArrayList<>();   // compile error: the variable can't be reassigned
```

To make the contents unchangeable too, store an unmodifiable copy (`List.copyOf(...)`).

### Effectively final

A local variable that is never reassigned after initialisation is **effectively final**, even without the keyword. Lambdas and anonymous/local classes may only capture effectively final locals (Java 8+):

```java
int threshold = 10;                       // effectively final
list.removeIf(x -> x < threshold);         // OK
// threshold++;                            // would make the lambda above a compile error
```

### When to use it

- Make **fields `final` by default**; drop it only when the field really changes.
- `static final` for constants.
- `final` classes for value types and utility classes; `final` methods when overriding would break an invariant (e.g. a template method's skeleton).
- `final` on parameters and locals is a style choice; many teams rely on "effectively final" and keep code short instead.

## Internal working

- **Locals:** `final` on a local leaves no trace in the bytecode; it's purely a compile-time check (definite assignment analysis).
- **Fields:** the `ACC_FINAL` flag is recorded in the class file. The compiler ensures blank finals are assigned once per constructor path; the JVM rejects `putfield` to a final field outside an initialiser of that class.
- **Compile-time constants** (`static final int MAX = 10;`, `static final String NAME = "x";`) are **inlined** into every class that uses them.
- **Methods and classes:** `ACC_FINAL` lets the JVM verify nothing overrides/extends them. HotSpot's JIT doesn't need `final` to inline methods — it uses *class hierarchy analysis* to inline any method with a single implementation and deoptimises if a subclass is loaded later — so `final` for "performance" is a myth.
- **Java Memory Model (JLS 17.5):** when a constructor finishes, the values of the object's `final` fields (and anything reachable through them, as of that moment) are guaranteed visible to every thread that later obtains a reference to the object — **even without synchronisation**, provided `this` didn't escape during construction. Non-final fields have no such guarantee when an object is published through a data race.
- **Reflection** can still modify `final` instance fields in some cases (`setAccessible`), and frameworks such as serialization do; but `static final` fields, record fields and hidden classes are protected.

## Visual representation

```text title="final reference, mutable object"
   final List<String> names  ---X--->  (can't point anywhere else)
            |
            v
   +---------------------------+
   | ArrayList: [Ada, Grace]   |   <- contents can still change: names.add("Linus")
   +---------------------------+

   final List<String> safe = List.copyOf(names)
            |
            v
   +---------------------------+
   | ImmutableList: [Ada, Grace]|  <- add() throws UnsupportedOperationException
   +---------------------------+
```

## Java code example

```java title="FinalDemo.java" file="FinalDemo.java"
import java.util.ArrayList;
import java.util.List;
import java.util.function.IntPredicate;

public class FinalDemo {
    static final int MAX_ATTEMPTS = 3;               // compile-time constant (inlined)
    static final List<String> DEFAULT_TAGS;          // blank static final

    static {
        DEFAULT_TAGS = List.of("new", "unread");
    }

    public static void main(String[] args) {
        // final reference, mutable object
        final List<String> names = new ArrayList<>();
        names.add("Ada");
        names.add("Grace");
        // names = new ArrayList<>();               // would not compile
        System.out.println("final list still mutable: " + names);

        List<String> frozen = List.copyOf(names);
        try {
            frozen.add("Linus");
        } catch (UnsupportedOperationException e) {
            System.out.println("copyOf is unmodifiable: UnsupportedOperationException");
        }

        // blank final local: assigned exactly once on every path
        final String level;
        if (names.size() > 1) {
            level = "team";
        } else {
            level = "solo";
        }
        System.out.println("level = " + level);

        // effectively final capture
        int threshold = 2;
        IntPredicate tooSmall = x -> x < threshold;
        System.out.println("tooSmall(1) = " + tooSmall.test(1) + ", MAX_ATTEMPTS = " + MAX_ATTEMPTS);

        Account account = new Account("ACC-1", List.of("gold"));
        System.out.println(account.describe());
        System.out.println(new SavingsAccount("ACC-2", DEFAULT_TAGS).describe());
    }
}

class Account {
    private final String id;                         // assigned once, in the constructor
    private final List<String> tags;

    Account(String id, List<String> tags) {
        this.id = id;
        this.tags = List.copyOf(tags);               // final field + unmodifiable copy = truly fixed
    }

    /** final: subclasses may customise label(), but not the overall format. */
    final String describe() {
        return label() + " " + id + " " + tags;
    }

    String label() {
        return "Account";
    }
}

final class SavingsAccount extends Account {         // final class: no further subclasses
    SavingsAccount(String id, List<String> tags) {
        super(id, tags);
    }

    @Override
    String label() {
        return "Savings";
    }
    // String describe() { ... }                     // would not compile: describe() is final
}
```

## Output

```text title="Output" output="FinalDemo.java"
final list still mutable: [Ada, Grace]
copyOf is unmodifiable: UnsupportedOperationException
level = team
tooSmall(1) = true, MAX_ATTEMPTS = 3
Account ACC-1 [gold]
Savings ACC-2 [new, unread]
```

- The `final` variable `names` couldn't be reassigned, but its list grew. `List.copyOf` produced a list that rejects changes.
- `level` is a blank final: the compiler verified each branch assigns it exactly once.
- `SavingsAccount` customised `label()` but couldn't override the `final` method `describe()`.

## Real-world application

- **Constructor-injected services**: `private final PaymentGateway gateway;` — the dependency is set once and can't be swapped mid-flight.
- **Value objects and DTOs** (`final` class + `final` fields, or records) are safe to share across threads and to use as map keys.
- **Framework hooks**: template methods in frameworks are often `final` so subclasses can only customise the designated hook methods.
- **Library design**: JDK value types (`String`, `Integer`, `LocalDate`, `UUID`) are `final` so nobody can create a "mutable String" subclass that breaks security or hashing assumptions.

## Common mistakes

- **Believing `final` makes an object immutable.**
- **Expecting `final` to make code faster**: HotSpot inlines non-final methods too.
- **Exposing a `final` mutable field** (`public final List<String> items`) — callers can still modify the list.
- **Overusing `final` on every parameter and local** until signatures become noisy (a team style decision).
- **Making classes `final` that frameworks need to proxy** (some Spring/Hibernate features subclass your classes at run time).
- **Forgetting that an inlined `static final` constant needs callers recompiled** when its value changes.

## Interview questions

**Q1. What is the difference between `final`, `finally` and `finalize`?**

````reveal title="Answer"
`final` is a modifier: final variables can't be reassigned, final methods can't be overridden, final classes can't be extended. `finally` is the block after `try`/`catch` that always runs (resource clean-up). `finalize()` was an `Object` method called by the GC before reclaiming an object; it's unreliable and **deprecated for removal since Java 18** — use try-with-resources or `java.lang.ref.Cleaner` instead.
````

**Q2. Can a `final` variable be modified?**

````reveal title="Answer"
The variable can't be reassigned, but if it refers to a mutable object, that object's state can change (`final List` can still `add`). For a primitive `final`, the value is fixed. Immutability requires an immutable object, not just a final reference.
````

**Q3. Why can lambdas only capture effectively final local variables?**

````reveal title="Answer"
A lambda captures a **copy** of the local's value (locals live on the stack frame, which may be gone when the lambda runs, possibly on another thread). If the variable could change after capture, the lambda and the method would silently disagree about its value. Requiring effectively final makes the copy indistinguishable from the variable. Fields aren't restricted because the lambda captures `this` and reads the field itself.
````

**Q4. What special guarantee do `final` fields have under the Java Memory Model?**

````reveal title="Answer"
After the constructor completes, any thread that sees a reference to the object is guaranteed to see the final fields' constructed values (and the state of objects reachable through them as of the end of construction), even if the reference was published without synchronisation — as long as `this` didn't escape during construction. Non-final fields could appear as default values (`0`/`null`) to another thread in that situation.
````

## Hands-on exercise

The class below claims to be "constant", but callers can change it. Fix it so that `PRIMARY_COLORS` and a `Palette`'s colours truly can't change, without changing the public method signatures.

```java
public class Palette {
    public static final String[] PRIMARY_COLORS = {"red", "green", "blue"};
    private final List<String> colors;
    public Palette(List<String> colors) { this.colors = colors; }
    public List<String> colors() { return colors; }
}
```

````hint title="Hint"
A `final` array is still mutable: `Palette.PRIMARY_COLORS[0] = "pink"` works. Store an unmodifiable `List`, or keep the array private and return a copy. For the instance field, copy on the way in.
````

````solution title="Solution"
```java title="PaletteDemo.java" file="PaletteDemo.java"
import java.util.ArrayList;
import java.util.List;

public class PaletteDemo {
    public static void main(String[] args) {
        List<String> input = new ArrayList<>(List.of("teal", "coral"));
        Palette palette = new Palette(input);
        input.add("mauve");                                // caller changes its own list
        System.out.println("palette = " + palette.colors());
        try {
            palette.colors().add("lime");
        } catch (UnsupportedOperationException e) {
            System.out.println("palette is read-only");
        }
        try {
            Palette.PRIMARY_COLORS.set(0, "pink");
        } catch (UnsupportedOperationException e) {
            System.out.println("PRIMARY_COLORS is read-only: " + Palette.PRIMARY_COLORS);
        }
    }
}

final class Palette {
    public static final List<String> PRIMARY_COLORS = List.of("red", "green", "blue");

    private final List<String> colors;

    Palette(List<String> colors) {
        this.colors = List.copyOf(colors);                 // defensive, unmodifiable copy
    }

    List<String> colors() {
        return colors;                                     // safe to return: it can't be modified
    }
}
```

```text title="Output" output="PaletteDemo.java"
palette = [teal, coral]
palette is read-only
PRIMARY_COLORS is read-only: [red, green, blue]
```

The public field changed from `String[]` to `List<String>`: a `final` array can never be made read-only, which is why "public static final arrays" are a well-known security hole.
````

## Knowledge check

```quiz
? `final StringBuilder sb = new StringBuilder("a"); sb.append("b");` — what happens?
+ It compiles and sb now contains "ab"
- Compile error: sb is final
- Runtime exception
> final prevents reassigning sb, not mutating the object.

? Which of these is true about final methods?
- They are always inlined, so they are faster
+ They can't be overridden in subclasses
- They can't be called from subclasses
> HotSpot inlines non-final methods too; final is about design.

? A lambda uses a local variable `count` that is incremented later in the method. What happens?
+ Compile error: count must be effectively final
- The lambda sees the latest value
- The lambda sees the original value
> Captured locals must be effectively final.

? Which declaration is a compile-time constant that callers inline?
+ `static final int LIMIT = 100;`
- `static final Integer LIMIT = 100;`
- `static final int LIMIT = Integer.parseInt("100");`
> Only primitives and Strings initialised with constant expressions are constants.

? What does `finalize()` do in modern Java?
- It is the recommended way to release resources
+ It is deprecated for removal; use try-with-resources or Cleaner
- It runs when a final variable is assigned
> Finalization is unpredictable and slows GC.
```

## Key takeaways

- `final` variables are assigned **once**; `final` methods can't be **overridden**; `final` classes can't be **extended**.
- `final` protects the **reference, not the object** — combine with unmodifiable copies for real immutability.
- Lambdas and inner classes capture only **effectively final** locals.
- `final` fields get a **JMM visibility guarantee** after construction; that's part of why immutable objects are thread-safe.
- `final` is a design tool, not a performance trick.
