## Concept explanation

### Conditionals

```java
if (score >= 90) {
    grade = 'A';
} else if (score >= 80) {
    grade = 'B';
} else {
    grade = 'C';
}
```

- Conditions must be `boolean` (no `if (count)` as in C).
- Always use braces: an un-braced `if` controls only the next statement.
- An `else` binds to the nearest unmatched `if` (the "dangling else").

### The classic `switch` statement

```java
switch (day) {
    case "SAT":
    case "SUN":
        System.out.println("weekend");
        break;                 // without break, execution FALLS THROUGH to the next case
    default:
        System.out.println("weekday");
}
```

`switch` works on `byte`, `short`, `char`, `int`, their wrappers, `String` (Java 7) and enums. Case labels must be compile-time constants. Since Java 14 there is also the arrow form and **switch expressions** (`case "SAT", "SUN" -> "weekend";`), which never fall through — covered in [var, text blocks & switch expressions](lesson:var-text-blocks-switch). Java 21 adds pattern matching in `switch`.

### Loops

| Loop | Use when | Notes |
|---|---|---|
| `while (cond) { … }` | repeat while a condition holds; may run zero times | condition checked first |
| `do { … } while (cond);` | must run at least once (menus, retry-then-check) | note the semicolon |
| `for (init; cond; update)` | counting with an index | variables in `init` are scoped to the loop |
| `for (T x : iterable)` | visiting every element of an array or `Iterable` | no index; can't remove elements safely |

### `break`, `continue` and labels

- `break` exits the innermost loop or `switch`.
- `continue` skips to the next iteration of the innermost loop (in a `for`, the update still runs).
- A **label** (`outer:`) lets `break outer;` or `continue outer;` target an enclosing loop — the clean way to exit nested loops.

## Internal working

- The compiler turns conditionals and loops into **conditional and unconditional jumps** (`if_icmpge`, `ifeq`, `goto`). A `while` loop is a test plus a backward `goto`.
- A `switch` on `int`-like values compiles to **`tableswitch`** (a jump table, O(1)) when the case values are dense, or **`lookupswitch`** (a sorted table, binary search) when sparse.
- A `switch` on a `String` compiles to a `switch` on `s.hashCode()` followed by `equals` checks to rule out collisions. That's why a `null` selector throws `NullPointerException`.
- A `switch` on an enum compiles to a `switch` on the constant's ordinal via a synthetic lookup array.
- The **enhanced `for`** over an array compiles to an index loop; over an `Iterable` it compiles to `iterator()`, `hasNext()`, `next()`. Removing elements from the collection inside it triggers `ConcurrentModificationException` (see [iterators](lesson:iterators-and-fail-fast)).
- **Loop back-edges are where HotSpot looks for hot code**: counting them triggers JIT compilation, including *on-stack replacement* for a long-running loop already in progress.

## Visual representation

```text title="How a for loop executes"
        for (int i = 0; i < 3; i++) { body; }

   +--> [ i = 0 ]                       (init, once)
   |        |
   |        v
   |   [ i < 3 ? ] --- false ---> exit loop
   |        | true
   |        v
   |     [ body ] --- continue ---+
   |        |                     |
   |        v                     v
   +--- [ i++ ] <-----------------+       (update, then test again)

   break: jump straight to "exit loop"
```

## Java code example

```java title="ControlFlowDemo.java" file="ControlFlowDemo.java"
import java.util.List;

public class ControlFlowDemo {
    static String grade(int score) {
        if (score < 0 || score > 100) {
            return "invalid";
        } else if (score >= 90) {
            return "A";
        } else if (score >= 75) {
            return "B";
        }
        return "C";
    }

    static String dayType(String day) {
        String type;
        switch (day) {
            case "SAT":
            case "SUN":
                type = "weekend";
                break;
            case "FRI":
                type = "almost weekend";
                break;
            default:
                type = "weekday";
        }
        return type;
    }

    @SuppressWarnings("fallthrough")      // deliberate: this method demonstrates fall-through
    static int fallThroughCount(int start) {
        int count = 0;
        switch (start) {
            case 1:
                count++;            // no break: falls through
            case 2:
                count++;
            case 3:
                count++;
                break;
            default:
                count = -1;
        }
        return count;
    }

    public static void main(String[] args) {
        System.out.println(grade(95) + " " + grade(80) + " " + grade(42) + " " + grade(101));
        System.out.println(dayType("SUN") + ", " + dayType("FRI") + ", " + dayType("TUE"));
        System.out.println("fall-through from 1: " + fallThroughCount(1) + ", from 3: " + fallThroughCount(3));

        // while: digits of a number
        int n = 9071;
        int digitSum = 0;
        while (n > 0) {
            digitSum += n % 10;
            n /= 10;
        }
        System.out.println("digit sum = " + digitSum);

        // do-while runs at least once
        int attempts = 0;
        do {
            attempts++;
        } while (attempts < 0);
        System.out.println("do-while ran " + attempts + " time(s)");

        // for with continue: skip odd numbers
        StringBuilder evens = new StringBuilder();
        for (int i = 0; i <= 10; i++) {
            if (i % 2 != 0) {
                continue;
            }
            evens.append(i).append(' ');
        }
        System.out.println("evens: " + evens.toString().trim());

        // enhanced for over a list
        int total = 0;
        for (int price : List.of(120, 80, 45)) {
            total += price;
        }
        System.out.println("total = " + total);

        // labelled break: find a pair in a grid
        int[][] grid = {{1, 3, 5}, {7, 9, 11}, {13, 15, 17}};
        int target = 9;
        String found = "not found";
        search:
        for (int r = 0; r < grid.length; r++) {
            for (int c = 0; c < grid[r].length; c++) {
                if (grid[r][c] == target) {
                    found = "found at (" + r + "," + c + ")";
                    break search;         // exits BOTH loops
                }
            }
        }
        System.out.println(found);
    }
}
```

## Output

```text title="Output" output="ControlFlowDemo.java"
A B C invalid
weekend, almost weekend, weekday
fall-through from 1: 3, from 3: 1
digit sum = 17
do-while ran 1 time(s)
evens: 0 2 4 6 8 10
total = 245
found at (1,1)
```

- `fallThroughCount(1)` enters at `case 1` and falls through cases 2 and 3 until `break`: three increments.
- The `do`/`while` body ran once even though the condition was false from the start.
- `break search` left both loops as soon as the target was found.

## Real-world application

- **Request routing and state machines** use `switch` (or, better, enums with behaviour and switch expressions) on commands, HTTP methods or states.
- **Retry loops** are `do`/`while` or `for (attempt = 1; attempt <= max; attempt++)` with a `break` on success — see the [retry exercise](problem:retry-with-backoff).
- **Polling and event loops** are `while (running)` loops with a `volatile` flag or interruption check.
- **Batch processing** uses `continue` to skip invalid records while logging them, instead of deep `if` nesting.

## Common mistakes

- **Forgetting `break`** in a statement `switch`; silent fall-through. Arrow-form switches avoid it.
- **`switch` on a `null` String or enum** → `NullPointerException`.
- **Off-by-one loops**: `i <= array.length` reads one past the end.
- **Modifying a collection inside an enhanced `for`** → `ConcurrentModificationException`; use `Iterator.remove` or `removeIf`.
- **Floating-point loop counters** (`for (double d = 0; d != 1.0; d += 0.1)`) that never hit the exact end value: infinite loop.
- **`while (cond);`** — a stray semicolon makes an empty loop body.

## Interview questions

**Q1. What types can a classic `switch` statement work on?**

````reveal title="Answer"
`byte`, `short`, `char`, `int` and their wrapper types, `String` (Java 7+), and enums. Not `long`, `float`, `double` or `boolean`. Case labels must be distinct compile-time constants. Java 21's pattern-matching `switch` also accepts any reference type with type patterns.
````

**Q2. How does `switch` on a `String` work internally?**

````reveal title="Answer"
The compiler generates a switch on `selector.hashCode()`; each hash case then compares with `equals` to handle collisions and sets a synthetic index, and a second switch on that index runs the user's code. A `null` selector throws `NullPointerException` because `hashCode()` is called on it.
````

**Q3. How do you break out of nested loops?**

````reveal title="Answer"
Use a labelled `break` (`outer: for (...) { for (...) { break outer; } }`). Alternatives: extract the nested loops into a method and `return`, or use a flag. Extracting a method is often the most readable.
````

**Q4. What is the difference between `while` and `do-while`?**

````reveal title="Answer"
`while` tests the condition before each iteration, so the body may run zero times. `do-while` tests after, so the body runs at least once. `do-while` suits "do something, then check whether to repeat" logic such as prompting until valid input.
````

## Hands-on exercise

Write `FizzBuzzPlus.java` that prints numbers 1 to 20, but:

- multiples of 3 print `Fizz`, of 5 print `Buzz`, of both print `FizzBuzz`;
- skip (print nothing for) numbers ending in 7 using `continue`;
- stop entirely at the first number greater than 15 that is a multiple of 4, using `break`.

Print everything on one line separated by spaces.

````hint title="Hint"
Check the skip rule first (`i % 10 == 7`), then the stop rule, then FizzBuzz with `i % 15 == 0` before the individual checks.
````

````solution title="Solution"
```java title="FizzBuzzPlus.java" file="FizzBuzzPlus.java"
public class FizzBuzzPlus {
    public static void main(String[] args) {
        StringBuilder out = new StringBuilder();
        for (int i = 1; i <= 20; i++) {
            if (i % 10 == 7) {
                continue;                     // skip 7 and 17
            }
            if (i > 15 && i % 4 == 0) {
                break;                        // stop at 16
            }
            String word;
            if (i % 15 == 0) {
                word = "FizzBuzz";
            } else if (i % 3 == 0) {
                word = "Fizz";
            } else if (i % 5 == 0) {
                word = "Buzz";
            } else {
                word = String.valueOf(i);
            }
            out.append(word).append(' ');
        }
        System.out.println(out.toString().trim());
    }
}
```

```text title="Output" output="FizzBuzzPlus.java"
1 2 Fizz 4 Buzz Fizz 8 Fizz Buzz 11 Fizz 13 14 FizzBuzz
```
````

## Knowledge check

```quiz
? What does `continue` do inside a `for` loop?
- Exits the loop
+ Skips the rest of the body; the update expression runs, then the condition is tested
- Restarts the loop from the initialiser
> continue jumps to the update step in a for loop.

? A switch statement case has no `break`. What happens?
+ Execution falls through into the next case's statements
- Compile error
- The switch exits automatically
> Statement switches fall through; arrow-form switches don't.

? Which loop always executes its body at least once?
- while
+ do-while
- enhanced for
> The condition is checked after the body.

? What happens with `switch (s)` when `s` is null?
- The default branch runs
+ NullPointerException
- Nothing
> The generated code calls s.hashCode() (or ordinal() for enums).

? What is the cleanest way to exit two nested loops at once?
+ A labelled break, or returning from an extracted method
- Throwing an exception
- Setting the loop variable to a large value
> Labels exist exactly for this; extraction is often even clearer.
```

## Key takeaways

- Conditions are `boolean`; always use braces.
- Classic `switch` statements **fall through** without `break`; switch on `null` throws. Prefer arrow-form switch expressions (Java 14+).
- `while` may run zero times, `do-while` at least once, `for` for counted loops, enhanced `for` for "visit every element".
- `break` exits, `continue` skips to the next iteration; **labels** target outer loops.
- Under the hood, `switch` compiles to `tableswitch`/`lookupswitch`, and `String` switches use `hashCode` plus `equals`.
