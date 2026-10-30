# Core Java

### Why is the `main` method `static`?
`id: main-static` `level: beginner` `kind: concept` `tricky` `lessons: program-execution-lifecycle,static-keyword`

#### Hints
1. What would the JVM need in order to call an *instance* method?
2. Think about constructors: which one would it call, and with what arguments?

#### Answer
The launcher must start the program **before any object exists**. A `static` method belongs to the class, so after the class is loaded and initialised the JVM can call `main` directly. If `main` were an instance method, the JVM would first have to construct an object — but which constructor, with which arguments, and what if construction has side effects or throws? Making the entry point static avoids all of that.

`public` lets the launcher (outside your class) call it, `void` because the exit status comes from `System.exit`, and `String[]` carries the command-line arguments.

Java 25 (JEP 512) added *instance main methods*: the launcher instantiates the class through its no-argument constructor and calls `void main()`. That's a newer, explicitly defined rule — not a contradiction of the reasoning above.

#### Why other answers fall short
- **"So it can be called without an object" — and stopping there.** True, but the interviewer wants *why* that matters: no constructor choice, no arguments, no side effects before entry.
- **"Because static methods are faster."** Performance is irrelevant for a method called once.
- **"Because the JVM requires all entry points to be static."** That was the convention until Java 25; the reason is the design above, not an arbitrary rule.

#### Follow-up
**Can you overload or override `main`?** You can overload it (only `main(String[])` is the entry point). You can't override a static method — a subclass's `main` *hides* the parent's. `java Child` runs `Child.main` if it declares one, otherwise the inherited `Parent.main`.

### Is Java pass-by-value or pass-by-reference?
`id: pass-by-value` `level: beginner` `kind: concept` `tricky` `lessons: reference-types,methods`

```java
static void reset(StringBuilder sb) { sb.append("!"); sb = new StringBuilder("new"); }

StringBuilder b = new StringBuilder("hi");
reset(b);
System.out.println(b);   // ?
```

#### Hints
1. What exactly is copied into the parameter `sb`?
2. Which of the two statements in `reset` affects the object the caller sees?

#### Answer
**Always pass-by-value.** For object types the value copied into the parameter is the **reference**. So the method can mutate the shared object, but reassigning the parameter only redirects its local copy. The snippet prints `hi!`: `append` changed the shared builder, while `sb = new StringBuilder("new")` had no effect on `b`.

A pass-by-reference language would let the callee rebind the caller's variable (C++ `&`, C# `ref`); Java can't do that, which is why a `swap(a, b)` method that reassigns parameters never works.

#### Why other answers fall short
- **"Primitives by value, objects by reference."** The common half-truth. Objects are never passed at all; references are, and they are copied.
- **"Pass-by-reference, because changes inside the method are visible."** Mutations are visible because both references point to the same object, not because the variable was passed by reference.

#### Follow-up
**How would you return two values from a method?** Return a small record (`record MinMax(int min, int max)`), not a mutable "holder" array — clearer and immutable.

### What does this print?
`id: integer-division-promotion` `level: beginner` `kind: output` `lessons: type-conversion,operators`

```java
double a = 7 / 2;
double b = 7 / 2.0;
int c = (int) 3.99 + (int) -3.99;
System.out.println(a + " " + b + " " + c + " " + (1 + 2 + "3" + 4 + 5));
```

#### Hints
1. When is the division in `a` performed, and with which type?
2. Casting a double to int: rounding or truncation? Toward which direction?
3. String concatenation is evaluated left to right.

#### Answer
`3.0 3.5 0 3345`

- `7 / 2` is integer division (`3`) **before** being widened to `3.0`.
- `7 / 2.0` promotes to `double`: `3.5`.
- Casts truncate toward zero: `3 + (-3) = 0`.
- `1 + 2` is numeric (`3`); once a `String` appears, the rest concatenates: `"3" + "3" + "4" + "5"` → `"3345"`.

#### Why other answers fall short
- **`3.5` for `a`**: the widening to `double` happens after the integer division.
- **`1` for `c`** (thinking `-3.99` rounds to `-4`): casts truncate toward zero, they don't floor.
- **`"12345"` or `"3345"` confusion**: precedence doesn't apply — evaluation is strictly left to right.

#### Follow-up
**What is `Math.round(-2.5)`?** `-2`. `Math.round` rounds half up (toward positive infinity): it computes `floor(x + 0.5)`.

### Why does `Integer.MAX_VALUE + 1` not throw an exception?
`id: int-overflow` `level: beginner` `kind: concept` `lessons: primitive-types`

#### Hints
1. How are `int`s represented in binary?
2. Does the JVM's `iadd` instruction check anything?

#### Answer
Java's integer arithmetic is defined as **two's-complement with silent wrap-around**: the result keeps the low 32 bits. `MAX_VALUE + 1` becomes `Integer.MIN_VALUE` (`-2147483648`). The JLS chose this for speed and predictability — it matches what CPUs do natively, and the result is identical on every platform.

When overflow must be detected, use `Math.addExact`, `multiplyExact`, `toIntExact` (throw `ArithmeticException`), or widen to `long`/`BigInteger`. Floating point is different again: it overflows to `Infinity`.

#### Why other answers fall short
- **"It throws ArithmeticException."** Only integer division/remainder by zero and the `*Exact` methods throw.
- **"The JVM promotes it to long automatically."** No implicit promotion happens; the expression type is `int`.

#### Follow-up
**Find the bug:** `int mid = (low + high) / 2;` in a binary search over a huge array. `low + high` can overflow; use `low + (high - low) / 2` or `(low + high) >>> 1`.

### What's wrong with `long micros = 24 * 60 * 60 * 1000 * 1000;`?
`id: overflow-before-widening` `level: intermediate` `kind: debugging` `tricky` `lessons: primitive-types,type-conversion`

#### Hints
1. What is the type of the right-hand side expression?
2. When does the conversion to `long` happen?

#### Answer
Every literal is an `int`, so the multiplication is done in **`int` arithmetic** and overflows (86,400,000,000 > 2³¹−1) **before** the result is widened for assignment to `long`. The variable ends up holding `500654080`.

Fix: make the first operand a `long` so every multiplication is `long`: `24L * 60 * 60 * 1000 * 1000`. Better still, use the time API: `TimeUnit.DAYS.toMicros(1)` or `Duration.ofDays(1).toNanos() / 1000`.

#### Why other answers fall short
- **"`long` can't hold that number."** It can easily; the problem is the `int` arithmetic before assignment.
- **Putting `L` on the last literal** (`… * 1000L`): the earlier products are still `int` and may already have overflowed. The first operand decides.

#### Follow-up
**Would `Math.multiplyExact(24 * 60 * 60 * 1000, 1000)` help?** It would throw instead of silently wrapping — useful to *detect* the bug — but the fix is still `long` arithmetic.

### What does `int i = 5; i = i++ + ++i;` leave in `i`?
`id: increment-puzzle` `level: intermediate` `kind: output` `tricky` `lessons: operators`

#### Hints
1. Operands are evaluated left to right, completely, before `+` is applied.
2. `i++` yields the old value; `++i` yields the new value.

#### Answer
`12`.

1. `i++` yields `5`; `i` becomes `6`.
2. `++i` makes `i` `7` and yields `7`.
3. `5 + 7 = 12` is assigned to `i`, overwriting the `7`.

The general rule: Java evaluates operands **left to right** (JLS 15.7), applies side effects immediately, and the assignment happens last. Unlike C/C++, this is fully defined behaviour — but it's still unreadable, and code reviews should reject it.

#### Why other answers fall short
- **`11`** (treating both as 5 and 6 or applying increments after): ignores that side effects take effect as each operand is evaluated.
- **"Undefined behaviour."** True in C/C++, false in Java.

#### Follow-up
**What does `i = i++;` do?** Nothing: the old value is saved, `i` is incremented, then the saved old value is assigned back.

### Why does `Math.abs(hash) % buckets` sometimes produce a negative index?
`id: abs-min-value` `level: intermediate` `kind: debugging` `lessons: operators,primitive-types`

#### Hints
1. Is there an `int` whose absolute value doesn't fit in an `int`?
2. What sign does `%` produce for a negative left operand?

#### Answer
`Math.abs(Integer.MIN_VALUE)` overflows and returns `Integer.MIN_VALUE` itself (negative), because +2,147,483,648 isn't representable. Then `%` keeps the sign of the dividend, so the "index" is negative (or zero, depending on `buckets`) and array access throws.

Use `Math.floorMod(hash, buckets)`, which always returns `0 .. buckets-1` for positive `buckets`, or mask the sign bit: `(hash & 0x7fffffff) % buckets`. `HashMap` avoids the issue entirely with a power-of-two table and `(n - 1) & hash`.

#### Why other answers fall short
- **"`Math.abs` never returns negative values."** It does for `MIN_VALUE` (and `Math.absExact` throws instead).
- **"`hashCode` is always positive."** Hash codes are any `int`; `"polygenelubricants".hashCode()` is `Integer.MIN_VALUE`.

#### Follow-up
**Why is `-7 % 3` equal to `-1`?** The remainder takes the sign of the dividend so that `(a / b) * b + a % b == a` holds with truncating division.

### When does a `static final` constant change NOT show up after you redeploy a library?
`id: constant-inlining` `level: advanced` `kind: scenario` `tricky` `lessons: variables-and-constants,program-execution-lifecycle`

A shared library defines `public static final int MAX_RETRIES = 3;`. The library is updated to `5` and redeployed, but services that use it still retry 3 times. Why?

#### Hints
1. What does `javac` do with compile-time constants?
2. Which class file actually contains the value 3?

#### Answer
`MAX_RETRIES` is a **compile-time constant** (a `static final` primitive or `String` initialised with a constant expression). `javac` **inlines** its value into every class that uses it, so the services' own `.class` files contain the literal `3`. Replacing the library JAR doesn't change them; only recompiling the services does. The library's class may never even be loaded for that use.

Fixes: recompile dependants; or make the value not a compile-time constant (e.g. `public static final int MAX_RETRIES = Integer.valueOf(5);` or read it from configuration / an accessor method), so it is read at run time.

#### Why other answers fall short
- **"Class-loader caching."** Nothing is cached; the value was never loaded from the library.
- **"The old JAR is still on the class path."** Possible in general, but here the value lives in the caller's bytecode.

#### Follow-up
**Does reading such a constant trigger the library class's static initialiser?** No — reading an inlined constant is not an active use, so the class isn't initialised.

### Swap two `int` variables in a method — can you?
`id: swap-method` `level: beginner` `kind: coding` `lessons: reference-types,methods`

Write `swap(int a, int b)` so that after `swap(x, y)` the caller's `x` and `y` are exchanged. If that's impossible, show what you'd do instead.

#### Hints
1. What does the method receive: the variables or their values?
2. What *can* a method change that the caller will see?

#### Answer
It's impossible: Java passes copies of the values, so the method can only swap its own parameters. Options that work:

```java
// 1. Swap elements of an array the caller owns
static void swap(int[] arr, int i, int j) {
    int tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
}

// 2. Return the swapped pair and let the caller reassign
record Pair(int first, int second) {
    Pair swapped() { return new Pair(second, first); }
}
```

In real code the second style — return a new value — is usually clearer than mutating arguments.

#### Why other answers fall short
- **Using `Integer` parameters**: wrappers are immutable references passed by value; reassigning them changes nothing for the caller.
- **XOR swap tricks** inside the method: they still only swap the local copies.

#### Follow-up
**Can a method change which object the caller's variable refers to in any way?** Not directly. It can only mutate objects reachable through references it was given, or return a value the caller chooses to assign.

### What is the difference between `==` and `equals()`?
`id: equals-vs-identity` `level: beginner` `kind: concept` `lessons: reference-types,wrapper-classes-autoboxing`

#### Hints
1. What does `==` compare for two references?
2. What does `Object.equals` do if a class doesn't override it?

#### Answer
For primitives, `==` compares values. For references, `==` compares **identity**: do both references point to the same object? `equals()` compares **logical equality** as the class defines it. `Object.equals` defaults to identity; `String`, the wrapper classes, collections, records and `java.time` types override it to compare content.

Practical rules: use `equals` (or `Objects.equals(a, b)` for nullable values) for strings, wrappers and value objects; use `==` for primitives, enums (each constant is a singleton) and deliberate identity checks.

#### Why other answers fall short
- **"`==` compares addresses, `equals` compares values" — for all classes.** Only if the class overrides `equals`; otherwise `equals` is identity too.
- **"`==` works for small Integers so it's fine."** It works only because of the −128..127 cache.

#### Follow-up
**If you override `equals`, what else must you override, and why?** `hashCode`, so that equal objects have equal hash codes; otherwise hash-based collections break (see the HashMap topic).

### Find the bug: `int count = counts.get(word);`
`id: unboxing-npe` `level: intermediate` `kind: debugging` `lessons: wrapper-classes-autoboxing`

```java
Map<String, Integer> counts = new HashMap<>();
for (String word : words) {
    int count = counts.get(word);
    counts.put(word, count + 1);
}
```

#### Hints
1. What does `get` return for a word seen for the first time?
2. What hidden method call does the compiler insert on the first line of the loop?

#### Answer
For an unseen word `counts.get(word)` returns `null`, and assigning it to an `int` **unboxes** it with `.intValue()` → `NullPointerException` on the very first word.

Idiomatic fix: `counts.merge(word, 1, Integer::sum);` — atomic per call, no null handling. Alternatives: `counts.put(word, counts.getOrDefault(word, 0) + 1);` or, for large workloads, a `Map<String, int[]>`/primitive map to avoid boxing.

#### Why other answers fall short
- **"`HashMap` doesn't allow `get` on missing keys."** It does; it returns `null`.
- **Wrapping in try/catch**: hides the design problem and costs an exception per new word.

#### Follow-up
**Is `merge` thread-safe on a `HashMap`?** No. On a `ConcurrentHashMap`, `merge` is atomic per key, which makes this exact idiom safe for concurrent counting.
