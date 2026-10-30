## Concept explanation

A **conversion** changes a value from one type to another. Java performs some conversions automatically and requires an explicit **cast** for the risky ones.

### Widening primitive conversion (automatic)

Moving to a type that can represent every value of the source:

```text
byte -> short -> int -> long -> float -> double
          char -> int
```

`int x = 'A';` and `double d = 42L;` need no cast. Widening never loses magnitude, but `int → float`, `long → float` and `long → double` **can lose precision** (a `float` has only 24 bits of mantissa).

### Narrowing primitive conversion (explicit cast)

Moving to a smaller type requires `(type)`:

- **Integer to smaller integer** keeps the low-order bits: `(byte) 200 == -56`, `(int) 3_000_000_000L == -1294967296`.
- **Floating to integer** truncates toward zero and **saturates** at the target range: `(int) 3.99 == 3`, `(int) -3.99 == -3`, `(int) 1e20 == Integer.MAX_VALUE`, `(int) Double.NaN == 0`.

### Numeric promotion in expressions

Arithmetic operators never work on `byte`, `short` or `char` directly. **Binary numeric promotion** converts both operands:

1. If either is `double`, both become `double`;
2. else if either is `float`, both become `float`;
3. else if either is `long`, both become `long`;
4. otherwise **both become `int`**.

So `byte a = 1, b = 2; byte c = a + b;` does **not** compile: `a + b` is an `int`.

### Compound assignment hides a cast

`x += y` means `x = (T) (x + y)` where `T` is the type of `x`. So `byte b = 10; b += 300;` compiles and silently narrows. The same applies to `++`, `--`, `*=`, etc.

### Compile-time constants get a pass

`byte b = 10;` compiles even though `10` is an `int`, because the value is a constant that fits. `final int k = 10; byte b = k;` also compiles; a non-final `int k` does not.

### String conversion

`+` with a `String` operand converts the other operand with `String.valueOf`. Evaluation is **left to right**: `1 + 2 + "x"` is `"3x"`, `"x" + 1 + 2` is `"x12"`.

### Reference conversions

- **Upcasting** (subclass → superclass/interface) is automatic and always safe: `Object o = "hi";`.
- **Downcasting** requires a cast and is checked at run time: `(String) o` throws `ClassCastException` if `o` isn't a `String`.
- Check first with `instanceof`. Since **Java 16** a *pattern* binds a typed variable in one step: `if (o instanceof String s) { s.length(); }`.

## Internal working

- Primitive conversions compile to dedicated bytecodes: `i2l`, `l2i`, `i2b`, `d2i`, `i2c` and so on. `i2b` literally keeps the low 8 bits and sign-extends them; `d2i` implements the truncate-and-saturate rules defined by the JVM spec.
- `byte`/`short`/`char` values already live as `int`s on the operand stack, which is why the language promotes them to `int` for arithmetic.
- A **reference cast** compiles to `checkcast`, which tests the object's actual class against the target type at run time and throws `ClassCastException` on failure. `instanceof` compiles to the `instanceof` bytecode, returning 0 or 1 (and `false` for `null`).
- Casts between **unrelated** class types (e.g. `(Integer) "x"`) are rejected at **compile time** when the compiler can prove they can never succeed.

## Visual representation

```text title="Narrowing int 300 to byte: keep the low 8 bits"
  int 300  = 0000 0000 0000 0000 0000 0001 0010 1100
                                          ^^^^^^^^^ low 8 bits
  (byte)   =                               0010 1100  = 44

  int 200  = 0000 0000 0000 0000 0000 0000 1100 1000
  (byte)   =                               1100 1000  = -56  (top bit set -> negative)
```

## Java code example

```java title="ConversionDemo.java" file="ConversionDemo.java"
public class ConversionDemo {
    public static void main(String[] args) {
        // Widening: automatic
        int i = 'A';
        long big = i;
        double d = big;
        System.out.println("char->int " + i + ", int->long " + big + ", long->double " + d);

        // Widening can lose precision
        int precise = 16_777_217;                 // 2^24 + 1
        float f = precise;
        System.out.println("int " + precise + " as float = " + (long) f);

        // Narrowing keeps low-order bits
        System.out.println("(byte) 300 = " + (byte) 300 + ", (byte) 200 = " + (byte) 200);
        System.out.println("(int) 3_000_000_000L = " + (int) 3_000_000_000L);

        // Floating -> integer: truncate toward zero, saturate, NaN -> 0
        System.out.println("(int) 3.99 = " + (int) 3.99 + ", (int) -3.99 = " + (int) -3.99);
        System.out.println("(int) 1e20 = " + (int) 1e20 + ", (int) NaN = " + (int) Double.NaN);
        System.out.println("Math.round(2.5) = " + Math.round(2.5) + ", Math.round(-2.5) = " + Math.round(-2.5));

        // Promotion: byte + byte is int
        byte a = 10, b = 20;
        int sum = a + b;                          // byte c = a + b; would not compile
        System.out.println("byte + byte = " + sum);

        // Compound assignment hides a narrowing cast
        byte counter = 10;
        counter += 300;                           // counter = (byte) (counter + 300)
        System.out.println("counter after += 300: " + counter);

        // Integer division happens before widening
        double ratio = 7 / 2;
        double ratioOk = 7 / 2.0;
        System.out.println("7 / 2 -> " + ratio + ", 7 / 2.0 -> " + ratioOk);

        // String concatenation is left to right
        System.out.println(1 + 2 + "x" + 1 + 2);

        // Reference casts
        Object o = "pattern";
        if (o instanceof String s && s.length() > 3) {     // Java 16+ pattern
            System.out.println("String of length " + s.length());
        }
        Object n = 42;
        try {
            String bad = (String) n;
            System.out.println(bad);
        } catch (ClassCastException e) {
            System.out.println("ClassCastException: " + e.getMessage());
        }
    }
}
```

## Output

```text title="Output" output="ConversionDemo.java"
char->int 65, int->long 65, long->double 65.0
int 16777217 as float = 16777216
(byte) 300 = 44, (byte) 200 = -56
(int) 3_000_000_000L = -1294967296
(int) 3.99 = 3, (int) -3.99 = -3
(int) 1e20 = 2147483647, (int) NaN = 0
Math.round(2.5) = 3, Math.round(-2.5) = -2
byte + byte = 30
counter after += 300: 54
7 / 2 -> 3.0, 7 / 2.0 -> 3.5
3x12
String of length 7
ClassCastException: class java.lang.Integer cannot be cast to class java.lang.String (java.lang.Integer and java.lang.String are in module java.base of loader 'bootstrap')
```

- `16777217` can't be represented as a `float`; it rounds to `16777216`.
- `counter += 300` computes `310`, then narrows: `310 - 256 = 54`.
- `7 / 2` is integer division (`3`) **before** it is widened to `double`.
- `1 + 2 + "x" + 1 + 2`: `1 + 2` is `3`, then string concatenation takes over: `"3x12"`.
- `Math.round` rounds half **up** (toward positive infinity): `-2.5` rounds to `-2`.

## Real-world application

- **Parsing and protocol code** works with bytes: reading an unsigned byte requires `b & 0xFF` to undo sign extension when widening to `int`.
- **Percentages and averages** are classic integer-division bugs: `successCount / total * 100` is `0` for most inputs; write `100.0 * successCount / total`.
- **Timeouts**: `int timeoutMs = (int) duration.toMillis();` silently wraps for long durations; use `Math.toIntExact` to fail loudly.
- **Polymorphic code** downcasts after `instanceof` checks; with sealed types and pattern matching (Java 17/21) most of those casts disappear.

## Common mistakes

- `double avg = sum / count;` with `int`s: integer division first.
- `long total = a * b;` with `int`s: multiplication overflows before widening.
- `byte b = 0; b = b + 1;` doesn't compile, but `b += 1` does and may silently wrap.
- Casting a `double` to `int` to "round": it truncates. Use `Math.round` (and know it rounds half up).
- Downcasting without checking, or with a check against the wrong type.
- Forgetting that `(int) someLong` doesn't throw on overflow; use `Math.toIntExact`.

## Interview questions

**Q1. Why does `byte c = a + b;` fail to compile when `a` and `b` are bytes?**

````reveal title="Answer"
Binary numeric promotion converts `byte`, `short` and `char` operands to `int` before arithmetic, so `a + b` has type `int`. Assigning an `int` to a `byte` is a narrowing conversion that needs an explicit cast. Constant expressions that fit are the only exception (`byte c = 10 + 20;` compiles).
````

**Q2. Does `short s = 1; s += 1;` compile? What about `s = s + 1;`?**

````reveal title="Answer"
`s += 1` compiles: compound assignment includes an implicit cast back to `short`. `s = s + 1` doesn't: `s + 1` is an `int`. The hidden cast in compound assignment can silently overflow.
````

**Q3. What is `(int) 3.7`, `(int) -3.7` and `Math.round(-3.5)`?**

````reveal title="Answer"
`3`, `-3` and `-3`. Casting truncates toward zero. `Math.round(x)` is `floor(x + 0.5)`, so `-3.5` rounds to `-3`. For banker's rounding or explicit modes use `BigDecimal.setScale(0, RoundingMode.HALF_EVEN)`.
````

**Q4. When does a reference cast fail at compile time versus at run time?**

````reveal title="Answer"
At compile time when the types are provably incompatible, e.g. casting a `String` to `Integer` (two unrelated final classes). At run time (`ClassCastException` from `checkcast`) when the cast is plausible to the compiler — e.g. `Object` to `String` — but the actual object isn't an instance of the target.
````

## Hands-on exercise

Write `Percent.java` with `static String percent(int part, int whole)` that returns the percentage with one decimal place (e.g. `"33.3%"`), returns `"n/a"` when `whole` is 0, and never suffers from integer division. Also write `static int unsignedByte(byte b)` that returns 0–255.

````hint title="Hint"
Promote to `double` before dividing (`100.0 * part / whole`), then format with `String.format("%.1f%%", value)`. For the byte, mask with `0xFF` after promotion to `int`.
````

````solution title="Solution"
```java title="Percent.java" file="Percent.java"
import java.util.Locale;

public class Percent {
    static String percent(int part, int whole) {
        if (whole == 0) {
            return "n/a";
        }
        double value = 100.0 * part / whole;            // 100.0 forces double arithmetic
        return String.format(Locale.ROOT, "%.1f%%", value);
    }

    static int unsignedByte(byte b) {
        return b & 0xFF;                               // undo sign extension
    }

    public static void main(String[] args) {
        System.out.println(percent(1, 3));
        System.out.println(percent(2, 3));
        System.out.println(percent(5, 0));
        System.out.println(unsignedByte((byte) 200) + " " + unsignedByte((byte) -1));
    }
}
```

```text title="Output" output="Percent.java"
33.3%
66.7%
n/a
200 255
```

`Locale.ROOT` keeps the decimal point a `.` regardless of the machine's locale.
````

## Knowledge check

```quiz
? What is the value of `(byte) 130`?
- 130
+ -126
- 127
> Low 8 bits of 130 are 1000 0010, which is -126 as a signed byte.

? `double x = 5 / 2;` What is x?
+ 2.0
- 2.5
- Compile error
> Integer division happens first; the int result 2 is widened.

? Which line compiles?
- `byte b = 1; b = b * 2;`
+ `byte b = 1; b *= 2;`
- `char c = 'a'; c = c + 1;`
> Compound assignment casts back to the variable's type.

? What does `"A" + 1 + 2` evaluate to?
+ "A12"
- "A3"
- 68
> Once the left operand is a String, + concatenates, left to right.

? `Object o = 42; String s = (String) o;` fails how?
- Compile error
+ ClassCastException at run time
- s becomes "42"
> Object to String is a legal cast for the compiler; the checkcast fails at run time.
```

## Key takeaways

- **Widening** is automatic (but `long`/`int` → `float`/`double` can lose precision); **narrowing** needs a cast and keeps low-order bits.
- Arithmetic promotes `byte`, `short`, `char` to **`int`** (or wider); integer division truncates **before** any widening.
- **Compound assignment** (`+=`, `++`) contains a hidden narrowing cast.
- Floating → integer casts **truncate** and **saturate**; `NaN` becomes `0`.
- Downcasts are checked at run time; prefer `instanceof` **patterns** (Java 16+).
