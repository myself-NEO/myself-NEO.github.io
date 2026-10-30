## Concept explanation

A **method** is a named block of code with parameters and an optional return value.

```java
public static double area(double width, double height) {   // modifiers, return type, name, parameters
    return width * height;                                  // body
}
```

- The **signature** is the name plus parameter *types* (`area(double, double)`). Return type, parameter names and `throws` clauses are **not** part of the signature.
- `void` methods return nothing; others must `return` a value on every path.
- **Instance methods** run on an object (`account.deposit(10)`) and can use `this`; **static methods** belong to the class (`Math.max(a, b)`).

### Parameters are passed by value

Each call copies the argument values into fresh parameter variables. For references the copy is the reference, so a method can mutate the object but can't rebind the caller's variable (see [reference types](lesson:reference-types)).

### Varargs

`static int sum(int... values)` accepts zero or more `int`s; inside, `values` is an `int[]`. A varargs parameter must be last, and only one is allowed. Callers may pass an array directly.

### Overloading

Several methods may share a name if their **parameter lists differ** (number, types or order). The compiler picks one **at compile time** using the static types of the arguments, in three phases (JLS 15.12.2):

1. **Exact match or widening** primitive/reference conversions only — no boxing, no varargs.
2. Allow **boxing and unboxing**.
3. Allow **varargs**.

Within a phase, the **most specific** applicable method wins; if none is more specific, the call is **ambiguous** (compile error). Widening beats boxing, and boxing beats varargs:

```java
void f(long x)    { }   // phase 1: int -> long widening
void f(Integer x) { }   // phase 2: boxing
void f(int... x)  { }   // phase 3: varargs
f(5);                   // calls f(long)
```

### Recursion

A method may call itself. Every call pushes a new **stack frame**; a recursion that never reaches its base case ends in `StackOverflowError`. Java does **not** eliminate tail calls, so deep recursion (hundreds of thousands of levels) should be rewritten as a loop.

## Internal working

- Each thread has a **JVM stack** of **frames**. A frame holds the method's local variables (parameters first; for instance methods slot 0 is `this`) and an **operand stack** for intermediate values.
- **Calling** pushes a frame and copies the arguments into its local slots; **returning** pops it and pushes the return value onto the caller's operand stack.
- Calls compile to `invokestatic` (static methods), `invokevirtual` (instance methods, dispatched on the runtime class), `invokeinterface`, and `invokespecial` (constructors, `private` methods, `super.` calls). Overload resolution has already been done by `javac`: the bytecode names one exact signature, e.g. `f:(J)V` for `f(long)`.
- The JIT **inlines** small, hot methods, so short helper methods cost nothing in steady state — never avoid extracting a method "for performance".
- The default thread stack size is typically 512 KB–1 MB (`-Xss` changes it); each frame's size depends on the method's locals and operand stack depth.

## Visual representation

```text title="Call stack during factorial(3)"
  time -->
  push main        push fact(3)      push fact(2)     push fact(1)    returns 1
  +----------+     +----------+      +----------+     +----------+
  | main     |     | fact n=3 |      | fact n=2 |     | fact n=1 |  -> return 1
  +----------+     | main     |      | fact n=3 |     | fact n=2 |  -> return 2*1
                   +----------+      | main     |     | fact n=3 |  -> return 3*2
                                     +----------+     | main     |
                                                      +----------+
```

## Java code example

```java title="MethodsDemo.java" file="MethodsDemo.java"
import java.util.Arrays;

public class MethodsDemo {
    // Overloads: resolved at compile time by argument types
    static String describe(long x)    { return "long " + x; }
    static String describe(Integer x) { return "Integer " + x; }
    static String describe(int... xs) { return "varargs " + Arrays.toString(xs); }
    static String describe(Object o)  { return "Object " + o; }

    static int sum(int... values) {
        int total = 0;
        for (int v : values) {
            total += v;
        }
        return total;
    }

    static long factorial(int n) {
        if (n < 0) {
            throw new IllegalArgumentException("n must be >= 0");
        }
        return n <= 1 ? 1 : n * factorial(n - 1);
    }

    static int depth = 0;

    static void recurseForever() {
        depth++;
        recurseForever();
    }

    static void tryToReassign(int[] array) {
        array[0] = 100;                  // visible to the caller
        array = new int[] {-1};          // not visible
    }

    public static void main(String[] args) {
        System.out.println(describe(5));           // widening int -> long beats boxing
        System.out.println(describe(5L));
        System.out.println(describe(Integer.valueOf(5)));
        System.out.println(describe());            // only varargs accepts no arguments
        System.out.println(describe(1, 2));
        System.out.println(describe("text"));      // String -> Object (widening reference)

        System.out.println("sum() = " + sum() + ", sum(1,2,3) = " + sum(1, 2, 3) + ", sum(array) = " + sum(new int[] {4, 5}));
        System.out.println("10! = " + factorial(10));

        int[] data = {1, 2, 3};
        tryToReassign(data);
        System.out.println("data = " + Arrays.toString(data));

        try {
            recurseForever();
        } catch (StackOverflowError e) {
            System.out.println("StackOverflowError after more than 1000 frames: " + (depth > 1000));
        }
    }
}
```

## Output

```text title="Output" output="MethodsDemo.java"
long 5
long 5
Integer 5
varargs []
varargs [1, 2]
Object text
sum() = 0, sum(1,2,3) = 6, sum(array) = 9
10! = 3628800
data = [100, 2, 3]
StackOverflowError after more than 1000 frames: true
```

- `describe(5)` chose `describe(long)`: phase 1 (widening) found a match, so boxing (`Integer`) and varargs were never considered.
- `describe(Integer.valueOf(5))` matched `Integer` exactly in phase 1 (`Object` was also applicable, but `Integer` is more specific).
- The array's first element changed but the caller's variable still points at the original array.
- The exact recursion depth before `StackOverflowError` depends on the stack size and frame size, so the program prints only a range check.

## Real-world application

- **Small, well-named methods** are how readable code is built; the JIT inlines them.
- **Overloads** make APIs convenient: `List.of(e1)`, `List.of(e1, e2)`, …, `List.of(E...)` exist so that common calls avoid allocating a varargs array.
- **Varargs** power `String.format`, `Arrays.asList`, logging APIs (`log.info("{} {}", a, b)`).
- **Recursion** suits tree-shaped data (file trees, JSON, ASTs). For unbounded depth (linked structures from user input) use an explicit stack to avoid `StackOverflowError` in production.

## Common mistakes

- **Overloading with `null` arguments**: `describe(null)` with `describe(String)` and `describe(Integer)` is ambiguous.
- **Overloads that differ only by boxing** (`f(int)` vs `f(Integer)`): confusing, especially with `List.remove(int index)` vs `List.remove(Object o)` — `list.remove(1)` removes the element **at index 1**.
- **Expecting overload selection at run time**: overloads use the *static* type. `Object o = "s"; describe(o)` calls `describe(Object)`.
- **Changing only the return type** to overload: not allowed.
- **Recursion without a base case or with input-dependent depth.**
- **Methods with many boolean parameters** (`send(true, false, true)`): unreadable; use enums or parameter objects.

## Interview questions

**Q1. Can two methods differ only by return type?**

````reveal title="Answer"
No. The method signature is the name plus parameter types; return type isn't part of it, so `int f()` and `long f()` in the same class is a compile error. (The JVM itself distinguishes methods by descriptor including the return type, which the compiler uses for bridge methods, but the language forbids it.)
````

**Q2. Which overload is called: `print(Object)`, `print(String)` — with `print(null)`?**

````reveal title="Answer"
`print(String)`. Both are applicable; `String` is more specific than `Object`, so it wins. If there were also `print(Integer)`, the call would be ambiguous because neither `String` nor `Integer` is more specific than the other.
````

**Q3. What is the order of preference in overload resolution?**

````reveal title="Answer"
Phase 1: exact match or widening (no boxing, no varargs). Phase 2: boxing/unboxing allowed. Phase 3: varargs allowed. The first phase with an applicable method decides, choosing the most specific method in that phase. So widening beats boxing, which beats varargs.
````

**Q4. Why can deep recursion fail in Java even when the algorithm is correct?**

````reveal title="Answer"
Every call consumes a stack frame on a fixed-size thread stack, and Java doesn't perform tail-call elimination. Recursion depth in the tens of thousands (depending on frame size and `-Xss`) throws `StackOverflowError`. Convert to iteration with an explicit stack/deque, or increase the stack size for a dedicated thread.
````

## Hands-on exercise

Write `Calculator.java` with overloaded `max` methods:

- `max(int a, int b)`, `max(double a, double b)`, and `max(int first, int... rest)`.

Predict which one each call uses: `max(3, 7)`, `max(3, 7.5)`, `max(3)`, `max(1, 9, 4)`. Add a recursive `power(long base, int exp)` using fast exponentiation (square-and-multiply).

````hint title="Hint"
`max(3, 7.5)` can't use the `int` version; widening `3` to `double` makes `max(double, double)` applicable in phase 1. `max(3)` needs varargs. For fast exponentiation, `power(b, e) = power(b*b, e/2)` times `b` if `e` is odd.
````

````solution title="Solution"
```java title="Calculator.java" file="Calculator.java"
public class Calculator {
    static String max(int a, int b) {
        return "max(int,int) = " + Math.max(a, b);
    }

    static String max(double a, double b) {
        return "max(double,double) = " + Math.max(a, b);
    }

    static String max(int first, int... rest) {
        int best = first;
        for (int r : rest) {
            best = Math.max(best, r);
        }
        return "max(int,int...) = " + best;
    }

    static long power(long base, int exp) {
        if (exp == 0) {
            return 1;
        }
        long half = power(base * base, exp / 2);
        return exp % 2 == 0 ? half : base * half;
    }

    public static void main(String[] args) {
        System.out.println(max(3, 7));
        System.out.println(max(3, 7.5));
        System.out.println(max(3));
        System.out.println(max(1, 9, 4));
        System.out.println("2^10 = " + power(2, 10) + ", 3^13 = " + power(3, 13));
    }
}
```

```text title="Output" output="Calculator.java"
max(int,int) = 7
max(double,double) = 7.5
max(int,int...) = 3
max(int,int...) = 9
2^10 = 1024, 3^13 = 1594323
```

`power` makes O(log exp) recursive calls, so stack depth is never an issue.
````

## Knowledge check

```quiz
? Given `f(long)` and `f(Integer)`, which runs for `f(10)`?
+ f(long)
- f(Integer)
- Compile error: ambiguous
> Widening is tried before boxing.

? `List<Integer> list = new ArrayList<>(List.of(5, 6, 7)); list.remove(1);` — what is removed?
- The element 1
+ The element at index 1 (the value 6)
- Nothing
> remove(int) is an exact match for an int argument; remove(Object) would need boxing.

? Which is part of a method's signature?
- The return type
+ The parameter types
- The throws clause
> Signature = name + parameter types.

? What happens when a recursive method never reaches its base case?
- The JVM optimises it into a loop
+ StackOverflowError when the thread stack is exhausted
- OutOfMemoryError from the heap
> Each call pushes a frame; Java has no tail-call elimination.
```

## Key takeaways

- A method signature is **name + parameter types**; return types don't overload.
- Arguments are **copied** into parameters (pass-by-value).
- Overloads are chosen **at compile time** from static types: **widening → boxing → varargs**, most specific wins.
- Every call pushes a **stack frame**; deep recursion causes `StackOverflowError` (no tail-call elimination).
- Small methods are free after JIT inlining — optimise for readability.
