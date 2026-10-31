## Concept explanation

"What does this print?" questions aren't about memorising puzzles. They test whether you can **execute Java in your head** following the language rules exactly. Strong candidates work through the same checklist every time, instead of guessing from intuition.

### The ten-step checklist

| # | Ask yourself | Typical trap |
|---|---|---|
| 1 | **Does it compile?** | unreachable code, an uninitialised local, an unhandled checked exception, an ambiguous overload, `byte b = b + 1` |
| 2 | **Which overload?** Chosen at **compile time** from the **static** argument types | `f(null)` picks the most specific type; widening beats boxing beats varargs |
| 3 | **Which override?** Chosen at **run time** from the **object's** class | fields and `static` methods are **not** polymorphic: they're resolved by the reference type (hiding) |
| 4 | **Evaluation order**: operands left to right, then precedence; `&&`/`||` short-circuit | `i = i++ + ++i`, side effects in arguments, `x++` in conditions |
| 5 | **Types of expressions**: int arithmetic, promotion, the type of a ternary | integer division, overflow before widening, `char + int`, a ternary unboxing `null` |
| 6 | **Identity vs equality** | `==` on strings (pool and compile-time constants) and on wrappers (the -128..127 cache) |
| 7 | **Initialisation order** | static initialisers in textual order on first use, constants inlined, a superclass constructor calling an override that sees default field values |
| 8 | **Exceptions and `finally`** | `finally` runs after the `return` value is computed; a `return` in `finally` wins and swallows exceptions |
| 9 | **Collections semantics** | `remove(int)` vs `remove(Object)`, fail-fast iteration (and its quirk), fixed-size and immutable lists |
| 10 | **Immutability and threads** | ignoring the result of `toUpperCase()`/`concat()`, `run()` vs `start()`, genuinely nondeterministic output (say so!) |

Two habits make the checklist work:
- **Trace on paper**: write a small table of variables and their values after each step, and the output buffer.
- **Say what's fixed by the specification vs implementation-dependent**: `HashSet` iteration order, thread interleavings and `Object.toString()` hash codes aren't predictable. The right answer is "it depends, because…", not a guess.

## Internal working

The rules behind the checklist come from the **Java Language Specification (JLS)**:

- **Evaluation order (JLS 15.7)**:
  - the left operand is fully evaluated before the right, and all arguments are evaluated left to right before the call;
  - precedence decides *grouping*, not *evaluation order*: in `a() + b() * c()`, `a()` runs first, even though the multiplication happens first;
  - compound assignment `x += e` saves the value of `x`, evaluates `e`, then stores `(T) (x + e)`, with an **implicit narrowing cast**. That's why `byte b += 1` compiles while `b = b + 1` doesn't.
- **Postfix and prefix**: `i++` yields the old value and increments immediately; `++i` increments, then yields the new value. In `i = i++`, the assignment stores the old value last, so `i` is unchanged.
- **Method invocation (JLS 15.12)**: the compiler finds the applicable methods in three phases and stops at the first phase that finds any:
  1. without boxing or varargs (identity and **widening** only);
  2. with **boxing**/unboxing;
  3. with **varargs**.
  
  Then it picks the **most specific** method, or fails as ambiguous. Only then, at run time, does virtual dispatch pick the override for instance methods.
- **Conditional expression typing (JLS 15.25)**: `cond ? int : Integer` is of type `int`, so a `null` `Integer` is unboxed, causing an NPE. Mixed numeric operands are promoted: `true ? 1 : 2.0` is `1.0`.
- **Constant expressions (JLS 15.29)**:
  - literals and `final` variables of primitive or `String` type initialised with constants are computed at **compile time**;
  - `"ja" + "va"` is the same pooled literal as `"java"`, and so is `final String p = "ja"; p + "va"`;
  - a non-final variable makes the concatenation happen at run time, creating a new `String`;
  - `static final` constants are **inlined** into using classes, so reading one doesn't initialise its class.
- **Boxing cache (JLS 5.1.7)**: `Integer.valueOf` (used by autoboxing) must cache -128..127 (the upper bound is configurable with `-XX:AutoBoxCacheMax`). The same applies to `Short`, `Long`, `Character` (0..127) and `Boolean`; `Float` and `Double` have no cache.
- **Class initialisation (JLS 12.4)**: triggered on first instantiation, static method call, or assignment or read of a non-constant static field. Initialisers run in **textual order**.
- **Object construction (JLS 12.5)**:
  1. allocation with default values;
  2. the constructor chain to `Object`;
  3. on the way back, each class runs its field initialisers and instance blocks, then its constructor body.
  
  An overridden method called from a superclass constructor therefore sees the subclass fields still at their defaults.
- **try/finally (JLS 14.20.2)**:
  - `return x;` evaluates `x`, stashes the value, runs `finally`, then returns the stashed value;
  - mutating an object in `finally` is visible, but reassigning a primitive or reference isn't;
  - if `finally` itself completes abruptly (`return`, `throw`), that replaces the pending result or exception.

## Visual representation

```text title="Tracing i = i++ + ++i with i = 5"
 step                         i     operand stack      note
 read i++  (yields 5)         6     [5]                postfix: old value, then increment
 read ++i  (yields 7)         7     [5, 7]             prefix: increment, then value
 add                          7     [12]
 assign i = 12                12                       the assignment happens last
 result: 12

 Overload phases for g(5) with g(long), g(Integer), g(Object), g(int...):
   phase 1 (widening only)  -> g(long)   applicable -> STOP: g(long) chosen
   phase 2 (boxing)         -> g(Integer), g(Object)  (never reached)
   phase 3 (varargs)        -> g(int...)              (never reached)
```

## Java code example

Cover the outputs, predict each line using the checklist, then compare. Every puzzle here is deterministic.

```java title="OutputPuzzles.java" file="OutputPuzzles.java"
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class OutputPuzzles {
    // ---- overloads (compile time) and overrides (run time)
    static String f(Object o) { return "f(Object)"; }
    static String f(String s) { return "f(String)"; }

    static String g(long x) { return "g(long)"; }
    static String g(Integer x) { return "g(Integer)"; }
    static String g(Object x) { return "g(Object)"; }
    static String g(int... x) { return "g(int...)"; }

    static String h(Integer x) { return "h(Integer)"; }
    static String h(long... x) { return "h(long...)"; }

    static class Animal {
        String name = "animal";
        static String kind() { return "Animal.kind"; }
        String sound() { return "..."; }
        String describe() { return name + " says " + sound(); }
    }

    static class Dog extends Animal {
        String name = "dog";
        static String kind() { return "Dog.kind"; }
        @Override String sound() { return "woof"; }
    }

    // ---- initialisation order
    static class Base {
        Base() {
            System.out.print("Base() -> ");
            init();
        }
        void init() { }
    }

    static class Derived extends Base {
        int x = 10;
        String s = "set";
        Derived() { System.out.println("Derived() x=" + x + " s=" + s); }
        @Override void init() { System.out.print("init() x=" + x + " s=" + s + " -> "); }
    }

    static class Config {
        static final int CONST = 42;                 // compile-time constant: inlined, no initialisation
        static int a = trace("a = 1", 1);
        static { trace("static block", 0); }
        static int b = trace("b = a + 1", a + 1);

        static int trace(String what, int value) {
            System.out.print("[" + what + "] ");
            return value;
        }
    }

    // ---- finally
    static int returnPrimitive() {
        int x = 1;
        try {
            return x;
        } finally {
            x = 2;                                   // too late: the return value was already saved
        }
    }

    static StringBuilder returnObject() {
        StringBuilder sb = new StringBuilder("a");
        try {
            return sb;
        } finally {
            sb.append("b");                          // mutates the object that is being returned
        }
    }

    @SuppressWarnings("finally")
    static int finallyWins() {
        try {
            throw new IllegalStateException("boom");
        } finally {
            return 3;                                // replaces the exception: it is silently lost
        }
    }

    static int counter;
    static int next() { return ++counter; }

    @SuppressWarnings({ "static", "fallthrough" })
    public static void main(String[] args) {
        System.out.println("-- evaluation order and expression types --");
        String concat = 1 + 2 + "3" + 4 + 5;
        System.out.println("P1  1 + 2 + \"3\" + 4 + 5        -> " + concat);
        char c = 'a';
        System.out.println("P2  c + 1, (char) (c + 1), \"\" + c + 1 -> " + (c + 1) + ", " + (char) (c + 1) + ", " + ("" + c + 1));
        int i = 5;
        i = i++ + ++i;
        int j = 1;
        j = j++;
        System.out.println("P3  i = i++ + ++i (i=5); j = j++ (j=1) -> i=" + i + ", j=" + j);
        System.out.println("P4  next() + next() * next()   -> " + (next() + next() * next()));
        int k = 0;
        boolean shortCircuit = (k++ > 0) && (k++ > 0);
        int m = 0;
        boolean both = (m++ > 0) & (m++ > 0);
        System.out.println("P5  && evaluates " + k + " operand(s), & evaluates " + m + " (both false: " + (!shortCircuit && !both) + ")");
        Object ternary = true ? 1 : 2.0;
        System.out.println("P6  Object o = true ? 1 : 2.0  -> " + ternary + " (" + ternary.getClass().getSimpleName() + ")");
        Integer nothing = null;
        try {
            Integer r = false ? 0 : nothing;         // type is int: nothing is unboxed
            System.out.println("P7  " + r);
        } catch (NullPointerException e) {
            System.out.println("P7  Integer r = false ? 0 : nullInteger -> NullPointerException");
        }

        System.out.println("-- arithmetic --");
        System.out.println("P8  5 / 2 * 2.0 = " + (5 / 2 * 2.0) + ", -7 % 3 = " + (-7 % 3) + ", Math.floorMod(-7, 3) = " + Math.floorMod(-7, 3));
        long millisPerMonth = 30 * 24 * 60 * 60 * 1000;   // int overflow BEFORE widening to long
        System.out.println("P9  30 * 24 * 60 * 60 * 1000 as long -> " + millisPerMonth + " (30L * ... -> " + 30L * 24 * 60 * 60 * 1000 + ")");
        System.out.println("P10 Math.abs(Integer.MIN_VALUE) = " + Math.abs(Integer.MIN_VALUE) + ", (byte) 200 = " + (byte) 200
                + ", 0.1 + 0.2 = " + (0.1 + 0.2));

        System.out.println("-- identity vs equality --");
        Integer a1 = 127, a2 = 127, b1 = 128, b2 = 128;
        System.out.println("P11 127 == 127: " + (a1 == a2) + ", 128 == 128: " + (b1 == b2) + ", 128 equals 128: " + b1.equals(b2)
                + ", Long.valueOf(1).equals(1): " + Long.valueOf(1).equals(1));
        String s1 = "java";
        String s2 = "ja" + "va";
        final String constantPart = "ja";
        String s3 = constantPart + "va";
        String variablePart = "ja";
        String s4 = variablePart + "va";
        System.out.println("P12 literal==\"ja\"+\"va\": " + (s1 == s2) + ", ==final+\"va\": " + (s1 == s3)
                + ", ==variable+\"va\": " + (s1 == s4) + ", ==intern(): " + (s1 == s4.intern()));

        System.out.println("-- overloads, overrides, hiding --");
        System.out.println("P13 f(null) -> " + f(null) + ", g(5) -> " + g(5) + ", h(5) -> " + h(5));
        Animal pet = new Dog();
        System.out.println("P14 pet.name=" + pet.name + ", pet.sound()=" + pet.sound() + ", pet.kind()=" + pet.kind()
                + ", pet.describe()=" + pet.describe());

        System.out.println("-- initialisation order --");
        System.out.print("P15 ");
        new Derived();
        System.out.println("P16 Config.CONST -> " + Config.CONST + " (no initialisation yet)");
        System.out.print("P17 Config.b -> ");
        System.out.println(Config.b);

        System.out.println("-- finally --");
        System.out.println("P18 returnPrimitive() = " + returnPrimitive() + ", returnObject() = " + returnObject()
                + ", finallyWins() = " + finallyWins());

        System.out.println("-- collections and immutability --");
        List<Integer> numbers = new ArrayList<>(List.of(10, 20, 30, 40));
        numbers.remove(1);                            // remove(int index)
        numbers.remove(Integer.valueOf(30));          // remove(Object)
        System.out.println("P19 remove(1) then remove(Integer.valueOf(30)) -> " + numbers);
        List<String> names = new ArrayList<>(List.of("a", "b", "c"));
        for (String n : names) {
            if (n.equals("b")) {
                names.remove(n);                      // removing the second-to-last element: no exception!
            }
        }
        System.out.println("P20 remove \"b\" during for-each -> " + names + " (no ConcurrentModificationException; \"c\" never visited)");
        int[] primitives = { 3, 1, 2 };
        System.out.println("P21 Arrays.asList(int[]).size() = " + Arrays.asList(primitives).size()
                + ", Arrays.asList(3, 1, 2).size() = " + Arrays.asList(3, 1, 2).size());
        String lang = "java";
        lang.toUpperCase();
        lang.concat("!");
        System.out.println("P22 after toUpperCase() and concat(\"!\") -> " + lang);

        System.out.print("P23 switch fall-through from case 2 -> ");
        int option = 2;
        switch (option) {
            case 1: System.out.print("one ");
            case 2: System.out.print("two ");
            case 3: System.out.print("three ");
                break;
            default: System.out.print("default ");
        }
        System.out.println();
        Thread worker = new Thread(() -> System.out.println("P24 run() executes on thread: " + Thread.currentThread().getName()));
        worker.run();                                 // a plain method call: no new thread
    }
}
```

## Output

```text title="Output" output="OutputPuzzles.java"
-- evaluation order and expression types --
P1  1 + 2 + "3" + 4 + 5        -> 3345
P2  c + 1, (char) (c + 1), "" + c + 1 -> 98, b, a1
P3  i = i++ + ++i (i=5); j = j++ (j=1) -> i=12, j=1
P4  next() + next() * next()   -> 7
P5  && evaluates 1 operand(s), & evaluates 2 (both false: true)
P6  Object o = true ? 1 : 2.0  -> 1.0 (Double)
P7  Integer r = false ? 0 : nullInteger -> NullPointerException
-- arithmetic --
P8  5 / 2 * 2.0 = 4.0, -7 % 3 = -1, Math.floorMod(-7, 3) = 2
P9  30 * 24 * 60 * 60 * 1000 as long -> -1702967296 (30L * ... -> 2592000000)
P10 Math.abs(Integer.MIN_VALUE) = -2147483648, (byte) 200 = -56, 0.1 + 0.2 = 0.30000000000000004
-- identity vs equality --
P11 127 == 127: true, 128 == 128: false, 128 equals 128: true, Long.valueOf(1).equals(1): false
P12 literal=="ja"+"va": true, ==final+"va": true, ==variable+"va": false, ==intern(): true
-- overloads, overrides, hiding --
P13 f(null) -> f(String), g(5) -> g(long), h(5) -> h(Integer)
P14 pet.name=animal, pet.sound()=woof, pet.kind()=Animal.kind, pet.describe()=animal says woof
-- initialisation order --
P15 Base() -> init() x=0 s=null -> Derived() x=10 s=set
P16 Config.CONST -> 42 (no initialisation yet)
P17 Config.b -> [a = 1] [static block] [b = a + 1] 2
-- finally --
P18 returnPrimitive() = 1, returnObject() = ab, finallyWins() = 3
-- collections and immutability --
P19 remove(1) then remove(Integer.valueOf(30)) -> [10, 40]
P20 remove "b" during for-each -> [a, c] (no ConcurrentModificationException; "c" never visited)
P21 Arrays.asList(int[]).size() = 1, Arrays.asList(3, 1, 2).size() = 3
P22 after toUpperCase() and concat("!") -> java
P23 switch fall-through from case 2 -> two three 
P24 run() executes on thread: main
```

How the checklist explains each group:
- **Evaluation order and expression types**:
  - **P1**: `+` is left-associative: `1 + 2` is `3`, then string concatenation takes over.
  - **P2**: `char + int` is `int` (98), and `"" + c` switches to string concatenation.
  - **P3**: the trace table above. `j = j++` stores the saved old value last.
  - **P4**: calls run left to right (1, 2, 3), and precedence only groups them: `1 + 2 * 3`.
  - **P5**: `&&` skipped its right side; `&` evaluated both.
  - **P6/P7**: ternary typing. Numeric promotion to `double`, and unboxing of `null` in an `int`-typed conditional.
- **Arithmetic**:
  - **P8**: `5 / 2` is integer division (2), and `%` keeps the sign of the dividend.
  - **P9**: the product overflowed as an `int` before being widened. Make the first operand `long`.
  - **P10**: `abs(MIN_VALUE)` overflows back to itself, `(byte) 200` wraps to -56, and binary floating point can't represent 0.1 exactly.
- **Identity vs equality**:
  - **P11**: the `Integer` cache covers -128..127. `Long.equals(Integer)` is `false` because the types differ.
  - **P12**: compile-time constant concatenation yields the pooled literal; run-time concatenation creates a new object; `intern()` returns the pooled instance.
- **Overloads, overrides, hiding**:
  - **P13**: `f(null)` picks the most specific type (`String`). Widening beats boxing beats varargs.
  - **P14**: methods dispatch on the object (`woof`), while fields and static methods resolve on the reference type (`animal`, `Animal.kind`). `describe()` reads `Animal`'s own `name` field.
- **Initialisation order**:
  - **P15**: the superclass constructor called the override before `Derived`'s field initialisers ran (`x=0`, `s=null`).
  - **P16/P17**: the constant was inlined, so no initialisation happened. Reading `b` initialised `Config` in textual order.
- **finally**:
  - **P18**: the saved primitive return value was unaffected, the returned object was mutated, and `return` in `finally` swallowed the exception.
- **Collections and immutability**:
  - **P19**: `remove(1)` removed index 1; `remove(Integer.valueOf(30))` removed the value.
  - **P20**: after the removal, `size()` equalled the cursor, so `hasNext()` returned `false` and the fail-fast check never ran.
  - **P21**: `Arrays.asList(int[])` is a `List<int[]>` with a single element.
  - **P22**: strings are immutable, and the results were discarded.
  - **P23**: without `break`, execution falls through until one is met.
  - **P24**: `run()` is an ordinary call on the current thread.

## Real-world application

- **Interview screens**: online assessments and phone screens use exactly these puzzles. They're quick to grade and reveal whether you understand the rules or only the happy path.
- **Code review**: the same traps cause real bugs:
  - `==` on `Integer` ids from a map works in tests with small ids and fails in production with large ones;
  - `int` overflow in time calculations (`days * 24 * 60 * 60 * 1000`);
  - ignored results of `String` methods or `BigDecimal.add`;
  - `list.remove(i)` on a `List<Integer>`;
  - calling overridable methods from constructors.
- **Static analysis catches many of them**:
  - `javac -Xlint:all` flags fall-through, `finally` that can't complete normally, static access via instances, and `equals` without `hashCode`;
  - Error Prone, SpotBugs, SonarQube and IntelliJ inspections cover reference comparison of boxed types, ignored return values (`@CheckReturnValue`), integer multiplication overflow, and `Arrays.asList` with primitive arrays.
- **Debugging**: when a production value "can't be", walk the same checklist. Most "impossible" outputs are an overload chosen at compile time, a hidden field, an initialisation-order surprise, or an overflow.

## Common mistakes

- **Guessing from intuition** instead of applying the rules step by step. Write a trace table.
- **Assuming precedence means evaluation order**: operands are still evaluated left to right.
- **Forgetting the compile step**: many puzzle answers are "compile error" (an ambiguous `f(null)` with two unrelated reference types, an unreachable statement after `return`, an uninitialised local).
- **Treating fields like methods**: field access is never polymorphic.
- **Believing `finally` can change a returned primitive**, or forgetting that `return` in `finally` swallows exceptions.
- **Over-trusting the `Integer` cache**: the bound can be raised with `-XX:AutoBoxCacheMax`, so `==` on 128 *may* be `true` there. The only robust answer is to use `equals`.
- **Predicting `HashMap` iteration order, thread interleavings or default `toString()` hashes**: say "unspecified" and explain why.
- **Missing implicit conversions**: compound assignment narrowing, integer division, `char` promotion, autoboxing in ternaries.

## Interview questions

**Q1. What does this print, and why?**

```java
int x = 10;
x += x++ + ++x;
System.out.println(x);
```

````reveal title="Answer"
**32**. `x += e` saves the current value of `x` (10) first, then evaluates `e` left to right: `x++` yields 10 (x becomes 11), `++x` makes x 12 and yields 12, so `e = 22`. The store is `x = 10 + 22 = 32`. The intermediate increments are overwritten by the final assignment.
````

**Q2. Which overload runs for `print(5)` given `print(double)`, `print(Integer)` and `print(int...)`? And for `print('a')`?**

````reveal title="Answer"
`print(5)` → **`print(double)`**: phase 1 allows widening `int → double` without boxing, so the boxing and varargs candidates are never considered. `print('a')` → **`print(double)`** as well: `char` widens to `double` in phase 1. (`char` would need boxing to `Character`, not `Integer`, so `print(Integer)` isn't applicable to `'a'` at all.)
````

**Q3. Why does a `HashSet<Integer>`'s iteration order look sorted for small numbers, and should you rely on it?**

````reveal title="Answer"
`Integer.hashCode()` is the value itself, and the bucket index is `hash & (capacity - 1)` (after the spreading step `h ^ (h >>> 16)`, which doesn't change small values). So small non-negative integers below the capacity land in buckets in ascending order, and iteration looks sorted. Add values larger than the table capacity, or negatives, and the order breaks. It's an implementation detail, so the correct interview answer is "iteration order is unspecified". Use `TreeSet` or `LinkedHashSet` when order matters.
````

**Q4. What is printed?**

```java
static String s;
static { s = "static"; }
{ s = "instance"; }
public static void main(String[] args) {
    System.out.println(s);
    new Main();
    System.out.println(s);
}
```

````reveal title="Answer"
`static`, then `instance`. The static initialiser runs once when the class is initialised (before `main`). The instance initialiser block runs on each `new Main()`, before the constructor body, and assigns the static field. Instance blocks can write static fields; they just don't run until an object is created.
````

**Q5. Is the output of this program predictable?**

```java
Thread t = new Thread(() -> System.out.print("A"));
t.start();
System.out.print("B");
```

````reveal title="Answer"
No: `AB` and `BA` are both legal, and you should say so. `start()` makes the thread runnable, but scheduling is up to the OS. There's no happens-before relation between the two prints. Calling `t.join()` before printing `B` makes it `AB`; calling `t.run()` instead of `start()` runs the lambda on the main thread, which also gives `AB`. The interview point is to recognise genuine nondeterminism rather than guess.
````

## Hands-on exercise

Predict the output of each snippet **before** running anything, writing down which checklist step decides it:

```java
// E1
System.out.println('a' + 'b' + "c");

// E2
List<Integer> nums = new ArrayList<>(List.of(1, 2, 3));
for (int i = 0; i < nums.size(); i++) nums.remove(i);
System.out.println(nums);

// E3
static String test(Object o) { return "Object"; }
static String test(String s) { return "String"; }
Object o = "hi";
System.out.println(test(o));

// E4
Map<String, Integer> m = new HashMap<>();
m.put("a", 1000); m.put("b", 1000);
System.out.println(m.get("a") == m.get("b"));

// E5
static int count = 0;
static int inc() { try { return ++count; } finally { count += 10; } }
System.out.println(inc() + " " + count);

// E6
System.out.println(1.0 / 0 + " " + (0.0 / 0 == 0.0 / 0));

// E7
String s = null;
System.out.println(s + "x");

// E8
System.out.println(new StringBuilder("a").equals(new StringBuilder("a")));
```

Then write a program that verifies your predictions.

````hint title="Hint"
- E1: what is `char + char`?
- E2: indexes shift after each removal.
- E3: overloads use the static type.
- E4: is 1000 cached?
- E5: when exactly is the return value fixed, and when is `count` read for the concatenation?
- E6: floating-point division by zero doesn't throw, and `NaN` is not equal to itself.
- E7: string conversion of `null`.
- E8: does `StringBuilder` override `equals`?
````

````solution title="Solution"
```java title="PredictionDrill.java" file="PredictionDrill.java"
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class PredictionDrill {
    static String test(Object o) { return "Object"; }
    static String test(String s) { return "String"; }

    static int count = 0;

    static int inc() {
        try {
            return ++count;
        } finally {
            count += 10;
        }
    }

    public static void main(String[] args) {
        System.out.println("E1 " + ('a' + 'b' + "c"));

        List<Integer> nums = new ArrayList<>(List.of(1, 2, 3));
        for (int i = 0; i < nums.size(); i++) {
            nums.remove(i);
        }
        System.out.println("E2 " + nums);

        Object o = "hi";
        System.out.println("E3 " + test(o));

        Map<String, Integer> m = new HashMap<>();
        m.put("a", 1000);
        m.put("b", 1000);
        System.out.println("E4 " + (m.get("a") == m.get("b")) + " (equals: " + m.get("a").equals(m.get("b")) + ")");

        System.out.println("E5 " + inc() + " " + count);

        System.out.println("E6 " + (1.0 / 0 + " " + (0.0 / 0 == 0.0 / 0)));

        String s = null;
        System.out.println("E7 " + (s + "x"));

        System.out.println("E8 " + new StringBuilder("a").equals(new StringBuilder("a"))
                + " (contentEquals: " + "a".contentEquals(new StringBuilder("a")) + ")");
    }
}
```

```text title="Output" output="PredictionDrill.java"
E1 195c
E2 [2]
E3 Object
E4 false (equals: true)
E5 1 11
E6 Infinity false
E7 nullx
E8 false (contentEquals: true)
```

Explanations:
- **E1**, *expression types*: `'a' + 'b'` is `int` arithmetic, 97 + 98 = 195, and only then does concatenation with `"c"` start.
- **E2**, *collections*: removing index 0 shifts `[2, 3]` left. `i` becomes 1 and removes `3`, leaving `[2]`. Then `i` is 2, which isn't less than `size()` (1).
- **E3**, *overloads at compile time*: the static type of `o` is `Object`, so `test(Object)` is chosen, even though the object is a `String`.
- **E4**, *identity*: 1000 is outside the `Integer` cache, so the two boxed values are different objects. Always use `equals`.
- **E5**, *finally and evaluation order*: `inc()` fixes its return value at 1 before `finally` adds 10. Then `count` is read after the call, left to right, so it's 11.
- **E6**, *floating point*: `1.0 / 0` is `Infinity` (only integer division by zero throws), and `NaN == NaN` is `false`. Use `Double.isNaN`.
- **E7**, *string conversion*: `null` becomes `"null"` in concatenation, giving `nullx`. Calling `s.length()` would throw an NPE.
- **E8**, *identity*: `StringBuilder` doesn't override `equals`, so it compares references. Use `contentEquals`, or compare `toString()` values.
````

## Knowledge check

```quiz
? What does int i = 5; i = i++; leave in i?
+ 5
- 6
- It doesn't compile
> The old value is saved, the increment happens, then the assignment stores the old value.

? f(null) with overloads f(Object) and f(String). Which runs?
+ f(String), the most specific applicable method
- f(Object)
- A compile error (ambiguous)
> It would be ambiguous only with two unrelated types, such as f(String) and f(Integer).

? Animal a = new Dog(); both classes declare a field name. What does a.name read?
+ Animal's field, because fields are resolved by the reference type
- Dog's field, because of dynamic dispatch
- A compile error
> Only instance methods are dispatched dynamically.

? A method returns a local int x from try, and finally sets x = 2. What is returned?
+ The value x had when the return statement was evaluated
- 2
- It depends on the JIT
> The return value is saved before finally runs.

? Which expression is a compile-time constant that refers to the same pooled String as "java"?
+ "ja" + "va"
- new String("java")
- s + "va" where s is a non-final variable
> Constant expressions are folded at compile time.
```

## Key takeaways

- Predict output with a **fixed checklist**: compiles? → overload (static types) → override (runtime type; fields and statics aren't polymorphic) → evaluation order → expression types → identity → initialisation → `finally` → collections → immutability and threads.
- Operands evaluate **left to right**; precedence only groups. Compound assignment saves the left value first and narrows implicitly.
- Know the **specification rules** behind the classics: the `Integer` cache (-128..127), compile-time constant folding and inlining, ternary typing, construction order, and `finally` saving the return value.
- **Trace on paper**, and say "unspecified" for hash iteration order, thread interleavings and identity hash codes.
- The same traps are real bugs: use `equals`, `long` arithmetic, `Math.floorMod`, `-Xlint` and static analysis.
