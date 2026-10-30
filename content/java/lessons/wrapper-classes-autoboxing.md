## Concept explanation

Each primitive has a **wrapper class** in `java.lang`: `Byte`, `Short`, `Integer`, `Long`, `Float`, `Double`, `Character`, `Boolean`. Wrappers are immutable objects that hold one primitive value. You need them because:

- **Generics and collections only hold objects**: `List<Integer>`, not `List<int>`.
- **`null` can mean "absent"**: a nullable `Integer age` from a database column.
- **Utility methods** live there: `Integer.parseInt`, `Integer.toBinaryString`, `Character.isDigit`, `Long.compare`, `Double.isNaN`, `Integer.MAX_VALUE`.

### Autoboxing and unboxing (Java 5+)

The compiler inserts conversions automatically:

```java
Integer boxed = 42;          // boxing:   Integer.valueOf(42)
int raw = boxed;             // unboxing: boxed.intValue()
List<Integer> list = new ArrayList<>();
list.add(7);                 // boxing
int first = list.get(0);     // unboxing
```

Boxing happens on assignment, method arguments, return values and inside expressions such as `boxed + 1`, `boxed > 0` and `boxed == 1` (when one side is a primitive).

### Parsing and converting

| Need | Use |
|---|---|
| String → primitive | `Integer.parseInt("42")`, `Double.parseDouble("3.5")`, `Boolean.parseBoolean("TRUE")` |
| String → wrapper | `Integer.valueOf("42")` (uses the cache) |
| Primitive → String | `String.valueOf(42)`, `Integer.toString(42, 16)` (radix) |
| Unsigned helpers | `Integer.toUnsignedString`, `Integer.parseUnsignedInt`, `Byte.toUnsignedInt` |
| Compare numerically | `Integer.compare(a, b)` (never `a - b`, which can overflow) |

`parseInt` throws `NumberFormatException` for bad input (including `null`, `""` and `" 42"`). `Boolean.parseBoolean` never throws: anything other than `"true"` (ignoring case) is `false`.

### The traps

1. **`==` compares references** when both sides are wrappers. Small values happen to be cached, so `==` works for `127` and fails for `128`.
2. **Unboxing `null` throws `NullPointerException`**, often in an innocent-looking line: `int count = map.get(key);`.
3. **Boxing in hot loops** allocates objects and costs performance.
4. **`List.remove(int)` versus `remove(Object)`** — `list.remove(1)` removes by index.

## Internal working

- Boxing compiles to `Integer.valueOf(int)`; unboxing to `intValue()`. You can see both in `javap -c` output.
- **The Integer cache:** `Integer.valueOf` returns a cached instance for values **−128 to 127** (an `IntegerCache` array created at class initialisation). The upper bound can be raised with `-XX:AutoBoxCacheMax=<n>` (or `java.lang.Integer.IntegerCache.high`). `Short`, `Long`, `Byte` and `Character` (0–127) cache the same small range; `Boolean.valueOf` returns the two constants `TRUE`/`FALSE`; `Float` and `Double` don't cache.
- `new Integer(5)` always created a new object; the wrapper constructors have been **deprecated for removal since Java 9/16** — use `valueOf` or autoboxing.
- **Memory:** an `Integer` object is 16 bytes on a typical 64-bit HotSpot (12-byte header + 4-byte value), plus a 4-byte compressed reference to it — versus 4 bytes for an `int`. A `List<Integer>` of a million elements costs roughly 20 MB; an `int[]` costs 4 MB.
- **Escape analysis** can sometimes eliminate boxing in JIT-compiled code, but don't rely on it.
- Wrappers are **immutable** and `final`; `count++` on an `Integer` unboxes, adds, and boxes a **new** object.

## Visual representation

```text title="Integer cache: == on boxed values"
  Integer a = 127;  Integer b = 127;          Integer c = 128;  Integer d = 128;

  IntegerCache.cache[]                        Heap
  +-----+-----+ ... +-----+-----+            +---------------+   +---------------+
  |-128 |-127 | ... | 126 | 127 |            | Integer(128)  |   | Integer(128)  |
  +-----+-----+ ... +-----+--^--+            +-------^-------+   +-------^-------+
                             |                        |                   |
                          a, b                        c                   d

  a == b -> true  (same cached object)        c == d -> false (two objects)
  a.equals(b), c.equals(d) -> true            (compares values)
```

## Java code example

```java title="BoxingDemo.java" file="BoxingDemo.java"
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class BoxingDemo {
    public static void main(String[] args) {
        Integer a = 127, b = 127;
        Integer c = 128, d = 128;
        System.out.println("127 == 127: " + (a == b) + ", 128 == 128: " + (c == d) + ", equals: " + c.equals(d));
        System.out.println("boxed == primitive unboxes: " + (c == 128));

        Long big = 127L;
        System.out.println("Long.equals(Integer): " + big.equals(127) + ", Long.equals(127L): " + big.equals(127L));

        // Unboxing null
        Map<String, Integer> stock = new HashMap<>();
        stock.put("apple", 3);
        try {
            int pears = stock.get("pear");                 // get returns null -> NPE on unboxing
            System.out.println(pears);
        } catch (NullPointerException e) {
            System.out.println("NPE when unboxing a missing map value");
        }
        System.out.println("safe: " + stock.getOrDefault("pear", 0));

        // remove(int index) vs remove(Object)
        List<Integer> nums = new ArrayList<>(List.of(10, 20, 30, 1));
        nums.remove(1);                                    // index 1 -> removes 20
        nums.remove(Integer.valueOf(1));                   // object 1 -> removes the value 1
        System.out.println("after removes: " + nums);

        // Parsing
        System.out.println(Integer.parseInt("-42") + " " + Integer.parseInt("ff", 16) + " " + Integer.toBinaryString(10));
        try {
            Integer.parseInt(" 42");
        } catch (NumberFormatException e) {
            System.out.println("NumberFormatException: " + e.getMessage());
        }
        System.out.println("parseBoolean(\"yes\") = " + Boolean.parseBoolean("yes"));

        // Comparing without overflow
        int x = Integer.MIN_VALUE, y = 1;
        System.out.println("x - y > 0 ? " + (x - y > 0) + "  Integer.compare(x, y) = " + Integer.compare(x, y));

        // Boxing cost: every += on a Long unboxes, adds and boxes a NEW object
        Long boxedSum = 0L;
        Long before = boxedSum;
        for (int i = 0; i < 2_000_000; i++) {
            boxedSum += i;
        }
        long primitiveSum = 0;
        for (int i = 0; i < 2_000_000; i++) {
            primitiveSum += i;                             // no objects at all
        }
        System.out.println("sums equal: " + (boxedSum == primitiveSum) + ", boxedSum is a new object: " + (before != boxedSum));
    }
}
```

## Output

```text title="Output" output="BoxingDemo.java"
127 == 127: true, 128 == 128: false, equals: true
boxed == primitive unboxes: true
Long.equals(Integer): false, Long.equals(127L): true
NPE when unboxing a missing map value
safe: 0
after removes: [10, 30]
-42 255 1010
NumberFormatException: For input string: " 42"
parseBoolean("yes") = false
x - y > 0 ? true  Integer.compare(x, y) = -1
sums equal: true, boxedSum is a new object: true
```

- `127` comes from the cache; `128` doesn't, so two different objects compare unequal with `==`.
- `c == 128` mixes a wrapper with a primitive: the wrapper is unboxed and values are compared.
- `Long.equals(Integer)` is `false` even for the same number: `equals` requires the same wrapper type.
- `Integer.MIN_VALUE - 1` overflows to a large positive number, so subtraction-based comparison gives the wrong sign.
- `boxedSum += i` can't change the immutable `Long`; it allocates a replacement (values above 127 aren't cached), so the loop creates about two million short-lived objects while the primitive loop creates none. In a benchmark the boxed loop is typically several times slower, though the exact ratio depends on the JIT.

## Real-world application

- **JPA/Hibernate entities and DTOs** use wrapper types (`Long id`, `Integer age`) because `null` means "not set" or "no value in the database"; primitives would silently become `0`.
- **Counting with maps**: `map.merge(word, 1, Integer::sum)` boxes on every update — fine for typical sizes; specialised libraries (fastutil, Eclipse Collections, Agrona) offer primitive maps for hot paths.
- **Comparators**: `Comparator.comparingInt(Person::age)` avoids boxing that `comparing(Person::age)` would cause.
- **Production NPEs** from unboxing are common in code like `if (config.get("retries") > 3)` — validate or use `getOrDefault`.

## Common mistakes

- Comparing wrappers with `==` (passes tests with small numbers, fails in production with IDs above 127).
- Unboxing values from maps, `Optional`-less APIs or ORMs that may be `null`.
- `Long` keys looked up with `Integer` arguments: `map.get(5)` on a `Map<Long, …>` returns `null` because `Integer.valueOf(5)` isn't equal to `Long.valueOf(5)`.
- Comparators written as `return a - b;`.
- Ternaries mixing wrapper and primitive that unbox a `null` (see [operators](lesson:operators)).
- Using `new Integer(...)` (deprecated) or relying on identity of wrappers for locking.

## Interview questions

**Q1. Why does `Integer a = 127, b = 127; a == b` print true but the same with 128 prints false?**

````reveal title="Answer"
Autoboxing calls `Integer.valueOf`, which returns cached instances for −128..127. Both 127s are the same cached object, so `==` (reference comparison) is true. 128 is outside the default cache, so each boxing creates a new object and `==` is false. Always compare wrapper values with `equals` or unbox explicitly. The cache's upper bound is configurable with `-XX:AutoBoxCacheMax`.
````

**Q2. What happens in `int total = map.get("missing");`?**

````reveal title="Answer"
`map.get` returns `null`; the compiler inserted `.intValue()` to unbox it, which throws `NullPointerException` (Java 14+ reports `Cannot invoke "java.lang.Integer.intValue()" because the return value of "java.util.Map.get(Object)" is null`). Use `getOrDefault`, check for null, or use a primitive-friendly API.
````

**Q3. Is `Integer` immutable? What does `count++` do on an `Integer` variable?**

````reveal title="Answer"
Yes. `count++` unboxes the current value, adds one, boxes the result (a cached or new `Integer`) and assigns that new reference to the variable. The original object is unchanged — which is why sharing an `Integer` as a "counter" between threads or lambdas doesn't work.
````

**Q4. Why should comparators not be written as `a - b`?**

````reveal title="Answer"
Subtraction can overflow: `Integer.MIN_VALUE - 1` wraps to `Integer.MAX_VALUE`, giving the wrong sign and violating the comparator contract (sorts can then throw "Comparison method violates its general contract!"). Use `Integer.compare(a, b)` or `Comparator.comparingInt`.
````

## Hands-on exercise

Write `ScoreBoard.java` that:

1. Parses a line like `"alice=12, bob=x, carol=7, , dave=-3"` into a `Map<String, Integer>`, skipping malformed entries (report how many were skipped) without letting exceptions escape.
2. Returns the total with a primitive `int` accumulator.
3. Prints `alice`'s and `zoe`'s scores safely (zoe is missing → 0).

````hint title="Hint"
Split on `,`, `strip()` each part, skip blanks, split on `=` into exactly two pieces, and wrap `Integer.parseInt` in a `try`/`catch (NumberFormatException)`. Use `getOrDefault` for safe lookups and `mapToInt(Integer::intValue)` or a loop for the sum.
````

````solution title="Solution"
```java title="ScoreBoard.java" file="ScoreBoard.java"
import java.util.LinkedHashMap;
import java.util.Map;

public class ScoreBoard {
    private final Map<String, Integer> scores = new LinkedHashMap<>();
    private int skipped;

    ScoreBoard(String line) {
        for (String part : line.split(",")) {
            String entry = part.strip();
            if (entry.isEmpty()) {
                continue;
            }
            String[] kv = entry.split("=");
            if (kv.length != 2) {
                skipped++;
                continue;
            }
            try {
                scores.put(kv[0].strip(), Integer.parseInt(kv[1].strip()));
            } catch (NumberFormatException e) {
                skipped++;
            }
        }
    }

    int total() {
        int sum = 0;                                   // primitive accumulator: no boxing per step
        for (int value : scores.values()) {            // unboxed once per element
            sum += value;
        }
        return sum;
    }

    int scoreOf(String name) {
        return scores.getOrDefault(name, 0);           // never unboxes null
    }

    public static void main(String[] args) {
        ScoreBoard board = new ScoreBoard("alice=12, bob=x, carol=7, , dave=-3");
        System.out.println("scores = " + board.scores + ", skipped = " + board.skipped);
        System.out.println("total = " + board.total());
        System.out.println("alice = " + board.scoreOf("alice") + ", zoe = " + board.scoreOf("zoe"));
    }
}
```

```text title="Output" output="ScoreBoard.java"
scores = {alice=12, carol=7, dave=-3}, skipped = 1
total = 16
alice = 12, zoe = 0
```
````

## Knowledge check

```quiz
? Which method does the compiler call to box an int?
+ Integer.valueOf(int)
- new Integer(int)
- Integer.parseInt(String)
> valueOf uses the cache for -128..127.

? `Integer x = null; int y = x;` — what happens?
- y becomes 0
+ NullPointerException
- Compile error
> Unboxing calls x.intValue() on null.

? `Long id = 5L; id.equals(5)` returns?
- true
+ false
> 5 is boxed to an Integer; Long.equals requires a Long.

? Which range does the Integer cache cover by default?
- 0 to 255
+ -128 to 127
- All int values
> The upper bound is configurable; the lower bound is fixed.

? Why prefer `Integer.compare(a, b)` over `a - b` in a comparator?
+ Subtraction can overflow and return the wrong sign
- compare is faster
- a - b doesn't compile for Integer
> MIN_VALUE - 1 overflows.
```

## Key takeaways

- Wrappers turn primitives into immutable objects for **generics, nullability and utility methods**.
- Autoboxing calls **`valueOf`** (cached for −128..127); unboxing calls **`xxxValue()`**, which throws **NPE on `null`**.
- Compare wrappers with **`equals`**, not `==`; `Long.equals(Integer)` is false.
- Boxing costs **memory and allocation**; prefer primitives and primitive APIs in hot code.
- Parse with `parseXxx`/`valueOf` and handle `NumberFormatException`; compare with `Integer.compare`.
