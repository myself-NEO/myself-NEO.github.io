## Concept explanation

### Arithmetic: `+ - * / %`

- Integer `/` **truncates toward zero**: `7 / 2 == 3`, `-7 / 2 == -3`.
- `%` is the **remainder**, and its sign follows the **dividend**: `-7 % 3 == -1`, `7 % -3 == 1`. For a true (always non-negative) modulus use `Math.floorMod(-7, 3) == 2`.
- Integer `/ 0` and `% 0` throw `ArithmeticException`; floating-point ones return `Infinity`/`NaN`.

### Increment and decrement: `++ --`

- **Prefix** `++i` increments, then yields the **new** value.
- **Postfix** `i++` yields the **old** value, then increments.
- `i = i++;` leaves `i` unchanged: the old value is saved, `i` is incremented, then the saved old value is assigned back.

### Relational and equality: `< <= > >= == !=`

Numeric comparisons promote like arithmetic. `==` on references compares identity (see [reference types](lesson:reference-types)).

### Logical: `&& || !` versus `& | ^`

- `&&` and `||` **short-circuit**: the right operand is evaluated only if needed. `if (s != null && s.isEmpty())` is safe because of this.
- `&`, `|` and `^` on booleans evaluate **both** sides (non-short-circuit AND, OR, XOR).

### Bitwise and shift: `& | ^ ~ << >> >>>`

| Operator | Meaning | Example (`int`) |
|---|---|---|
| `a & b` | bits set in both | `0b1100 & 0b1010 == 0b1000` |
| `a \| b` | bits set in either | `0b1100 \| 0b1010 == 0b1110` |
| `a ^ b` | bits set in exactly one | `0b1100 ^ 0b1010 == 0b0110` |
| `~a` | flip every bit | `~0 == -1` |
| `a << n` | shift left, fill with 0 | `1 << 4 == 16` |
| `a >> n` | arithmetic shift right, **copies the sign bit** | `-16 >> 2 == -4` |
| `a >>> n` | logical shift right, **fills with 0** | `-16 >>> 28 == 15` |

Shift distances are masked: for `int` only the low 5 bits are used, so `1 << 32 == 1` and `1 << 33 == 2`. For `long`, the low 6 bits.

### Assignment and compound assignment

`= += -= *= /= %= &= |= ^= <<= >>= >>>=`. Compound forms include an implicit cast to the left operand's type (see [type conversion](lesson:type-conversion)). Assignment is an expression whose value is the assigned value: `a = b = 0;` assigns right to left.

### Ternary: `condition ? a : b`

An expression, not a statement. If one branch is a boxed `Integer` and the other an `int`, the result is unboxed — a `null` branch then throws `NullPointerException`.

### Precedence (high to low, abbreviated)

```text
postfix  x++ x--
unary    ++x --x + - ~ !  (cast)
multiplicative  * / %
additive        + -
shift           << >> >>>
relational      < > <= >= instanceof
equality        == !=
bitwise AND     &
bitwise XOR     ^
bitwise OR      |
logical AND     &&
logical OR      ||
ternary         ? :
assignment      = += -= ...
```

When in doubt, add parentheses. Readers aren't parsers.

## Internal working

- **Operands are evaluated left to right**, fully, before the operator is applied (JLS 15.7). In `a() + b() * c()`, `a()` runs first even though `*` binds tighter. Precedence decides grouping, not evaluation order.
- **`&&` and `||`** compile to conditional jumps (`ifeq`, `ifne`), which is why the right side may never run.
- **`i++`** on a local `int` compiles to a single `iinc` instruction; `x = x++` compiles to load-x, `iinc`, store-loaded-value — the store overwrites the increment.
- **Shift masking** comes straight from the JVM instructions `ishl`/`ishr`/`iushr`, which use only the low 5 bits of the distance.
- **Bitwise tricks the JDK uses**: `HashMap` computes a bucket index with `(n - 1) & hash` instead of `%` (valid because `n` is a power of two), and spreads hashes with `h ^ (h >>> 16)`.

## Visual representation

```text title="-16 >> 2 versus -16 >>> 2 (32-bit int)"
  -16        = 1111 1111 1111 1111 1111 1111 1111 0000
  -16 >> 2   = 1111 1111 1111 1111 1111 1111 1111 1100  = -4         (sign bit copied in)
  -16 >>> 2  = 0011 1111 1111 1111 1111 1111 1111 1100  = 1073741820 (zeros shifted in)

  Evaluation of  a() + b() * c()
     1. call a()      2. call b()      3. call c()
     4. b * c         5. a + (b*c)     -- operands left to right, then operators by precedence
```

## Java code example

```java title="OperatorsDemo.java" file="OperatorsDemo.java"
public class OperatorsDemo {
    static int trace(String label, int value) {
        System.out.print(label + " ");
        return value;
    }

    public static void main(String[] args) {
        // Division and remainder
        System.out.println("7/2=" + 7 / 2 + " -7/2=" + -7 / 2 + " -7%3=" + -7 % 3 + " floorMod(-7,3)=" + Math.floorMod(-7, 3));

        // Prefix vs postfix
        int i = 5;
        int a = i++;        // a = 5, i = 6
        int b = ++i;        // i = 7, b = 7
        System.out.println("a=" + a + " b=" + b + " i=" + i);
        int j = 5;
        j = j++;            // j stays 5
        System.out.println("j = j++ leaves j = " + j);
        int k = 1;
        k = k++ + ++k;      // 1 + 3
        System.out.println("k++ + ++k = " + k);

        // Short-circuit vs non-short-circuit
        String s = null;
        System.out.println("safe check: " + (s != null && s.isEmpty()));
        int calls = 0;
        boolean r1 = false && (++calls > 0);
        boolean r2 = false & (++calls > 0);
        System.out.println("&& skipped, & evaluated: calls=" + calls + " " + r1 + " " + r2);

        // Bitwise and shifts
        int flags = 0b1100;
        System.out.println("& " + (flags & 0b1010) + ", | " + (flags | 0b1010) + ", ^ " + (flags ^ 0b1010) + ", ~0 " + ~0);
        System.out.println("-16>>2=" + (-16 >> 2) + " -16>>>2=" + (-16 >>> 2) + " 1<<32=" + (1 << 32));
        System.out.println("isEven(10)=" + ((10 & 1) == 0) + " powerOfTwo(64)=" + ((64 & (64 - 1)) == 0));

        // Evaluation order: operands left to right, then precedence
        int result = trace("a", 1) + trace("b", 2) * trace("c", 3);
        System.out.println("= " + result);

        // Ternary with mixed boxing
        Integer maybe = null;
        try {
            int value = true ? maybe : 0;     // unboxes maybe -> NPE
            System.out.println(value);
        } catch (NullPointerException e) {
            System.out.println("ternary unboxing threw NPE");
        }

        // Chained assignment
        int x, y;
        x = y = 10;
        System.out.println("x=" + x + " y=" + y);
    }
}
```

## Output

```text title="Output" output="OperatorsDemo.java"
7/2=3 -7/2=-3 -7%3=-1 floorMod(-7,3)=2
a=5 b=7 i=7
j = j++ leaves j = 5
k++ + ++k = 4
safe check: false
&& skipped, & evaluated: calls=1 false false
& 8, | 14, ^ 6, ~0 -1
-16>>2=-4 -16>>>2=1073741820 1<<32=1
isEven(10)=true powerOfTwo(64)=true
a b c = 7
ternary unboxing threw NPE
x=10 y=10
```

- `k = k++ + ++k`: left operand `k++` yields 1 (k becomes 2), right operand `++k` makes k 3 and yields 3; the sum 4 is assigned.
- `&&` didn't evaluate its right side; `&` did, so `calls` is 1.
- `trace` printed `a b c` in that order even though `b * c` is computed before the addition.
- `true ? maybe : 0` has type `int` (one operand is `int`), so `maybe` is unboxed and throws.

## Real-world application

- **Feature flags and permissions** packed into an `int` or `long` with bit masks (`perms & WRITE != 0`); `EnumSet` is the type-safe way to do the same.
- **Hashing and data structures**: `HashMap`'s `(n - 1) & hash`, `Integer.highestOneBit`, `Long.numberOfTrailingZeros` in bitsets and allocators.
- **Unsigned arithmetic** for network protocols and hashing uses `>>>`, `& 0xFF`, and `Integer.toUnsignedLong`.
- **Null-safe conditions** rely on short-circuiting: `if (user != null && user.isActive())`.
- **Modular arithmetic** for ring buffers and sharding must use `Math.floorMod` when values can be negative (`hashCode()` can be).

## Common mistakes

- Using `%` with possibly negative numbers to pick a shard: `hash % 8` can be negative → `ArrayIndexOutOfBoundsException`. Use `Math.floorMod(hash, 8)`.
- `i = i++` (does nothing) and other side-effect puzzles in production code.
- `&` instead of `&&` in null checks: `if (s != null & s.isEmpty())` still throws.
- `>>` instead of `>>>` when you need an unsigned shift.
- Relying on precedence of `&`/`|` vs `==`: `flags & MASK == 0` parses as `flags & (MASK == 0)` and fails to compile for ints — write `(flags & MASK) == 0`.
- `Math.abs(Integer.MIN_VALUE)` is still negative (it overflows).

## Interview questions

**Q1. What is the difference between `&&` and `&`?**

````reveal title="Answer"
Both are logical AND on booleans, but `&&` short-circuits: if the left side is `false` the right side is not evaluated. `&` always evaluates both sides (and is also the bitwise AND on integers). Use `&&` for conditions whose right side depends on the left (null checks, bounds checks).
````

**Q2. What does `int i = 0; i = i++ + i++;` leave in `i`?**

````reveal title="Answer"
`1`. The first `i++` yields 0 and sets i to 1; the second yields 1 and sets i to 2; the sum `0 + 1 = 1` is then assigned to `i`, overwriting 2. Operands are evaluated left to right, and the assignment happens last.
````

**Q3. What is the difference between `>>` and `>>>`?**

````reveal title="Answer"
`>>` is an arithmetic shift: it fills from the left with copies of the sign bit, preserving the sign (`-16 >> 2 == -4`). `>>>` is a logical shift: it fills with zeros, treating the value as unsigned (`-1 >>> 28 == 15`). For non-negative values they are identical.
````

**Q4. Why does `Math.abs(Integer.MIN_VALUE)` return a negative number?**

````reveal title="Answer"
The range of `int` is asymmetric: −2,147,483,648 to 2,147,483,647. The positive value 2,147,483,648 doesn't exist, so negation overflows back to `MIN_VALUE`. `Math.absExact` (Java 15+) throws instead. This bites code like `Math.abs(hashCode()) % n`.
````

## Hands-on exercise

Implement `Bits.java` with:

1. `static boolean isPowerOfTwo(int n)` without loops,
2. `static int countSetBits(int n)` without `Integer.bitCount` (then compare with it),
3. `static int shard(String key, int shards)` that always returns `0 .. shards-1`, even for negative hash codes.

````hint title="Hint"
A power of two has exactly one set bit, so `n & (n - 1)` clears it to zero (watch `n <= 0`). For counting, repeatedly clear the lowest set bit. For the shard, use `Math.floorMod`.
````

````solution title="Solution"
```java title="Bits.java" file="Bits.java"
public class Bits {
    static boolean isPowerOfTwo(int n) {
        return n > 0 && (n & (n - 1)) == 0;
    }

    static int countSetBits(int n) {
        int count = 0;
        while (n != 0) {
            n &= n - 1;          // clears the lowest set bit
            count++;
        }
        return count;
    }

    static int shard(String key, int shards) {
        return Math.floorMod(key.hashCode(), shards);
    }

    public static void main(String[] args) {
        System.out.println(isPowerOfTwo(64) + " " + isPowerOfTwo(96) + " " + isPowerOfTwo(0));
        System.out.println(countSetBits(255) + " " + countSetBits(-1) + " " + Integer.bitCount(-1));
        String key = "polygenelubricants";    // a string whose hashCode is Integer.MIN_VALUE
        System.out.println("hashCode " + key.hashCode() + " -> % gives " + (key.hashCode() % 8) + ", shard " + shard(key, 8));
        System.out.println("abs(MIN) = " + Math.abs(key.hashCode()));
    }
}
```

```text title="Output" output="Bits.java"
true false false
8 32 32
hashCode -2147483648 -> % gives 0, shard 0
abs(MIN) = -2147483648
```

Even when `%` happens to give 0, `Math.abs(hashCode()) % n` patterns break for `MIN_VALUE`; `floorMod` is always safe.
````

## Knowledge check

```quiz
? What is `-7 % 3` in Java?
+ -1
- 2
- 1
> The remainder takes the sign of the dividend; use Math.floorMod for a non-negative result.

? `int x = 5; int y = x++ * 2;` — values of x and y?
- x=6, y=12
+ x=6, y=10
- x=5, y=10
> Postfix yields the old value (5), then increments.

? Which expression is safe when `s` may be null?
+ `s != null && s.length() > 0`
- `s != null & s.length() > 0`
- `s.length() > 0 && s != null`
> Only && skips the right side when the left is false.

? What is `1 << 33` for an int?
- 0
+ 2
- 8589934592
> Shift distances for int are masked to 5 bits: 33 & 31 == 1.

? In `f() + g() * h()`, which function runs first?
+ f()
- g()
- h()
> Operands are evaluated left to right; precedence only decides grouping.
```

## Key takeaways

- Integer division **truncates toward zero**; `%` takes the **dividend's sign**; use `Math.floorMod` for safe indexes.
- Postfix yields the old value, prefix the new one; avoid multiple side effects in one expression.
- `&&`/`||` **short-circuit**; `&`/`|` don't.
- `>>` preserves the sign, `>>>` shifts in zeros; shift distances are masked.
- **Operands evaluate left to right**; precedence only groups. Parenthesise for readers.
