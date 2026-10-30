## Concept explanation

Java has exactly **eight primitive types**. They hold values directly (not references), have fixed sizes on every platform, and are not objects.

| Type | Size | Range / values | Default | Literal examples |
|---|---|---|---|---|
| `byte` | 8 bits | −128 to 127 | `0` | `(byte) 10` |
| `short` | 16 bits | −32,768 to 32,767 | `0` | `(short) 1000` |
| `int` | 32 bits | −2³¹ to 2³¹−1 (about ±2.1 billion) | `0` | `42`, `0x2A`, `0b101010`, `1_000_000` |
| `long` | 64 bits | −2⁶³ to 2⁶³−1 (about ±9.2 × 10¹⁸) | `0L` | `42L`, `3_000_000_000L` |
| `float` | 32 bits | IEEE 754 single precision, ~7 decimal digits | `0.0f` | `3.14f`, `1e-3f` |
| `double` | 64 bits | IEEE 754 double precision, ~15–16 digits | `0.0` | `3.14`, `6.022e23` |
| `char` | 16 bits | `'\u0000'` to `'\uffff'` (unsigned UTF-16 code unit) | `'\u0000'` | `'A'`, `'\n'`, `'\u00e9'` |
| `boolean` | not specified | `true`, `false` | `false` | `true` |

Integer types are **signed two's-complement** (except `char`, which is unsigned). `boolean` is not a number: you can't cast between `boolean` and `int`.

### Choosing a type

- **`int`** for counts and indexes; **`long`** for anything that can exceed ~2 billion (IDs, timestamps in milliseconds, byte counts, sums of many `int`s).
- **`double`** for scientific or approximate values; **`float`** only for large arrays where memory matters (graphics, ML).
- **Never use `float`/`double` for money.** Use `long` cents or `java.math.BigDecimal`.
- **`byte`** for raw binary data; `short` rarely.
- **`char`** is a UTF-16 *code unit*, not a full Unicode character: emoji and some CJK characters need two `char`s (a surrogate pair).

## Internal working

### Two's complement and overflow

An `int` stores numbers in 32 bits where the top bit has weight −2³¹. Adding 1 to `0111…1` (`Integer.MAX_VALUE`) produces `1000…0` (`Integer.MIN_VALUE`). Integer arithmetic **silently wraps**; it never throws. To detect overflow use `Math.addExact`, `Math.multiplyExact` and friends, which throw `ArithmeticException`.

Integer division by zero throws `ArithmeticException`; floating-point division by zero does not (it gives `Infinity`, `-Infinity` or `NaN`).

### Floating point (IEEE 754)

A `double` stores a sign bit, an 11-bit exponent and a 52-bit fraction. Numbers like `0.1` have no exact binary representation, so `0.1 + 0.2` is `0.30000000000000004`. Special values:

- `Double.NaN` — "not a number" (`0.0 / 0.0`). **`NaN != NaN`**; test with `Double.isNaN(x)`.
- `Double.POSITIVE_INFINITY` (`1.0 / 0`).
- `-0.0` exists and `0.0 == -0.0` is `true`, but `Double.compare(0.0, -0.0)` is positive.

Since Java 17 all floating-point arithmetic is strict IEEE 754 everywhere (JEP 306 made `strictfp` the default), so results are bit-identical across platforms.

### How primitives are stored

- In fields and arrays, `byte`/`short`/`char` take their declared size (an object field of type `byte` uses 1 byte, though objects are padded to 8-byte multiples). A `boolean[]` uses one byte per element in HotSpot.
- On the operand stack and in local variables, the JVM works with **32-bit `int` slots**: `byte`, `short`, `char` and `boolean` are widened to `int`, and `long`/`double` take two slots. That's why `byte + byte` produces an `int` (see [type conversion](lesson:type-conversion)).

## Visual representation

```text title="int overflow on a 32-bit two's-complement number line"
  Integer.MAX_VALUE  0111 1111 1111 1111 1111 1111 1111 1111   =  2147483647
                 + 1
                   ----------------------------------------
  Integer.MIN_VALUE  1000 0000 0000 0000 0000 0000 0000 0000   = -2147483648

            MIN ... -2  -1   0   1   2 ... MAX
             ^                               |
             +--------- wraps around --------+
```

## Java code example

```java title="PrimitivesDemo.java" file="PrimitivesDemo.java"
import java.math.BigDecimal;

public class PrimitivesDemo {
    public static void main(String[] args) {
        // Ranges
        System.out.println("byte  " + Byte.MIN_VALUE + " .. " + Byte.MAX_VALUE);
        System.out.println("int   " + Integer.MIN_VALUE + " .. " + Integer.MAX_VALUE);
        System.out.println("long  max " + Long.MAX_VALUE);

        // Silent overflow vs checked arithmetic
        int millisPerDay = 24 * 60 * 60 * 1000;
        int micros = millisPerDay * 1000;                 // overflows: int * int stays int
        long microsOk = millisPerDay * 1000L;             // one long operand -> long arithmetic
        System.out.println("micros (int)  = " + micros);
        System.out.println("micros (long) = " + microsOk);
        try {
            Math.multiplyExact(millisPerDay, 1000);
        } catch (ArithmeticException e) {
            System.out.println("multiplyExact: " + e.getMessage());
        }

        // Floating point surprises
        System.out.println("0.1 + 0.2 = " + (0.1 + 0.2));
        System.out.println("1.0 / 0  = " + (1.0 / 0));
        double nan = 0.0 / 0.0;
        System.out.println("NaN == NaN ? " + (nan == nan) + ", isNaN ? " + Double.isNaN(nan));
        System.out.println("(float) 0.1 = " + (double) 0.1f);

        // Money: BigDecimal from a String, not from a double
        BigDecimal price = new BigDecimal("0.10");
        System.out.println("0.10 * 3 = " + price.multiply(BigDecimal.valueOf(3)));
        System.out.println("new BigDecimal(0.1) = " + new BigDecimal(0.1));

        // char is a UTF-16 code unit
        char c = 'A';
        System.out.println("'A' + 1 = " + (c + 1) + ", as char: " + (char) (c + 1));
        String rocket = "\uD83D\uDE80";                   // one emoji, two chars
        System.out.println("emoji length = " + rocket.length() + ", code points = " + rocket.codePointCount(0, rocket.length()));

        // Literals
        System.out.println("hex 0xFF = " + 0xFF + ", binary 0b1010 = " + 0b1010 + ", 1_000_000 = " + 1_000_000);
    }
}
```

## Output

```text title="Output" output="PrimitivesDemo.java"
byte  -128 .. 127
int   -2147483648 .. 2147483647
long  max 9223372036854775807
micros (int)  = 500654080
micros (long) = 86400000000
multiplyExact: integer overflow
0.1 + 0.2 = 0.30000000000000004
1.0 / 0  = Infinity
NaN == NaN ? false, isNaN ? true
(float) 0.1 = 0.10000000149011612
0.10 * 3 = 0.30
new BigDecimal(0.1) = 0.1000000000000000055511151231257827021181583404541015625
'A' + 1 = 66, as char: B
emoji length = 2, code points = 1
hex 0xFF = 255, binary 0b1010 = 10, 1_000_000 = 1000000
```

- `micros (int)` is wrong: 86,400,000,000 doesn't fit in an `int`, so it wrapped. Making one operand `long` (`1000L`) fixes it; `Math.multiplyExact` detects it.
- `0.1 + 0.2` shows binary rounding error. `new BigDecimal(0.1)` exposes the exact binary value of the `double` 0.1 — which is why money uses `new BigDecimal("0.10")` or `BigDecimal.valueOf(...)`.
- `'A' + 1` is an `int` (66); casting back gives `'B'`.
- The rocket emoji is one code point but two `char`s.
- Hex, binary and underscore literals are just different spellings of `int` values: `0xFF` is 255, `0b1010` is 10, and `1_000_000` is one million. Underscores are only for readability.

## Real-world application

- **Timestamps and IDs** are `long`: `System.currentTimeMillis()`, database `BIGINT` keys, Snowflake IDs.
- **Payment systems** store amounts as `long` minor units (cents) or `BigDecimal`, never `double`. Rounding bugs in money are compliance incidents.
- **Overflow bugs** have real consequences: a famous binary-search bug computed `(low + high) / 2` and overflowed for arrays over a billion elements; the fix is `low + (high - low) / 2` or `(low + high) >>> 1`.
- **Memory-heavy code** (caches, analytics) uses primitive arrays (`int[]`, `long[]`) instead of `List<Integer>` to avoid boxing overhead.

## Common mistakes

- **`int * int` overflowing before being widened**: `long x = a * b;` multiplies as `int` first. Make an operand `long`.
- **Comparing doubles with `==`**: use a tolerance (`Math.abs(a - b) < 1e-9`) or `BigDecimal`.
- **`new BigDecimal(0.1)`** instead of `new BigDecimal("0.1")`.
- **Using `float` "to save memory"** for a handful of values and losing precision.
- **Assuming `char` is a character**: use `codePoints()` for text containing emoji or rare scripts.
- **Forgetting the `L` suffix**: `long big = 3000000000;` doesn't compile (the literal is an `int`).

## Interview questions

**Q1. What is printed by `System.out.println(Integer.MAX_VALUE + 1)` and why?**

````reveal title="Answer"
`-2147483648`. `int` arithmetic is two's-complement and wraps silently; adding 1 to the largest `int` produces the smallest. Use `Math.addExact` to get an `ArithmeticException` instead, or `long` if the range is needed.
````

**Q2. Why is `0.1 + 0.2 != 0.3` in Java?**

````reveal title="Answer"
`double` is binary floating point (IEEE 754). Decimal fractions like 0.1 and 0.2 have no finite binary representation, so each is stored as the nearest representable value; their sum is `0.30000000000000004`, not the `double` closest to 0.3. Compare with a tolerance or use `BigDecimal` for exact decimal arithmetic.
````

**Q3. How would you represent money in Java?**

````reveal title="Answer"
Either as a `long` count of the smallest unit (cents) — fast and exact — or as `BigDecimal` created from strings or `BigDecimal.valueOf(long, scale)`, with an explicit `RoundingMode` on division. Never `double`. Libraries such as Joda-Money or JSR 354 (`javax.money`) add a currency type.
````

**Q4. What is the size of a `boolean`?**

````reveal title="Answer"
The JVM specification does not define it. Booleans are represented as `int` (0/1) on the operand stack and in local variables; HotSpot uses one byte per element in `boolean[]` and one byte for a `boolean` field (plus object padding). "1 bit" is wrong in practice.
````

**Q5. Is `char` signed?**

````reveal title="Answer"
No. `char` is the only unsigned integral type: 16 bits, 0 to 65,535, representing a UTF-16 code unit. Characters outside the Basic Multilingual Plane need two `char`s.
````

## Hands-on exercise

Write `SafeAverage.java` with a method `static int average(int a, int b)` that never overflows, and a method `static long sumAll(int[] values)` that can't overflow for any `int[]` of reasonable length. Test with `Integer.MAX_VALUE` inputs.

````hint title="Hint"
`(a + b) / 2` overflows when both are large. Widen to `long` before adding, or compute `a + (b - a) / 2` when signs are known. For the sum, accumulate in a `long`.
````

````solution title="Solution"
```java title="SafeAverage.java" file="SafeAverage.java"
public class SafeAverage {
    static int average(int a, int b) {
        return (int) (((long) a + b) / 2);       // widen first, then divide
    }

    static long sumAll(int[] values) {
        long total = 0;                           // long accumulator
        for (int v : values) {
            total += v;
        }
        return total;
    }

    public static void main(String[] args) {
        int big = Integer.MAX_VALUE;
        System.out.println("naive average: " + (big + big) / 2);
        System.out.println("safe average:  " + average(big, big));
        System.out.println("average(-7, 2) = " + average(-7, 2));
        System.out.println("sum: " + sumAll(new int[] {big, big, big}));
    }
}
```

```text title="Output" output="SafeAverage.java"
naive average: -1
safe average:  2147483647
average(-7, 2) = -2
sum: 6442450941
```

`(big + big) / 2` overflowed to `-2` before the division. Integer division truncates toward zero, so `-5 / 2` is `-2`.
````

## Knowledge check

```quiz
? What is `(byte) 200`?
- 200
+ -56
- Compile error
> Narrowing keeps the low 8 bits: 200 - 256 = -56.

? Which expression detects int overflow by throwing?
- `a + b`
+ `Math.addExact(a, b)`
- `(long) (a + b)`
> The *Exact methods throw ArithmeticException on overflow; casting after the addition is too late.

? What does `0.0 / 0.0` evaluate to?
- ArithmeticException
+ NaN
- 0.0
> Floating-point division never throws; 0/0 is NaN.

? How many `char` values does the string "🚀" (one emoji) contain?
- 1
+ 2
- 4
> Characters outside the BMP are surrogate pairs: two UTF-16 code units.

? Which is the correct way to create the decimal 0.10?
- `new BigDecimal(0.10)`
+ `new BigDecimal("0.10")`
- `(BigDecimal) 0.10`
> The double 0.10 is already inexact; the String constructor is exact.
```

## Key takeaways

- Eight primitives with **fixed sizes**; integers are two's-complement and **wrap silently** on overflow.
- Use `long` for large counts and timestamps, `Math.*Exact` to detect overflow.
- `double` is **binary** floating point: no exact decimals, `NaN != NaN`, division by zero gives infinities.
- Money is `long` cents or `BigDecimal` built from strings.
- `char` is an unsigned 16-bit **UTF-16 code unit**, not a full character.
