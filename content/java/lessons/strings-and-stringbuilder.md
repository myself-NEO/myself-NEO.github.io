## Concept explanation

`String` is an immutable sequence of characters (UTF-16 code units). It is the most used class in Java, with special language support: literals (`"text"`), the `+` operator, and `switch`.

### The methods you use every day

| Task | Method(s) |
|---|---|
| Length, char access | `length()`, `charAt(i)`, `isEmpty()`, `isBlank()` (11) |
| Compare | `equals`, `equalsIgnoreCase`, `compareTo` (lexicographic by UTF-16 unit), `compareToIgnoreCase` |
| Search | `indexOf`, `lastIndexOf`, `contains`, `startsWith`, `endsWith` |
| Extract | `substring(begin)`, `substring(begin, end)` — end is **exclusive** |
| Transform | `toUpperCase`, `toLowerCase` (pass a `Locale`!), `trim`, `strip` (11, Unicode-aware), `replace`, `replaceAll` (regex), `repeat` (11) |
| Split and join | `split(regex)`, `String.join(", ", parts)`, `lines()` (11) |
| Convert | `String.valueOf(x)`, `Integer.parseInt(s)`, `toCharArray()`, `chars()`, `codePoints()` |
| Format | `String.format("%-10s|%5.2f", name, price)`, `"…".formatted(args)` (15) |

Every "modifying" method returns a **new** `String`; the original never changes. `s.toUpperCase();` on its own does nothing useful — you must use the result.

### Comparing strings

- `equals` for content, never `==` (identity; see [string immutability](lesson:string-immutability) for why `==` sometimes "works").
- `"literal".equals(variable)` avoids a `NullPointerException` when `variable` is null; `Objects.equals(a, b)` handles both.
- `compareTo` returns negative, zero or positive; it compares UTF-16 values, so `"Z" < "a"` and it's not locale-aware. Use `java.text.Collator` to sort human-readable text.

### `StringBuilder` and `StringBuffer`

`StringBuilder` is a **mutable** character buffer: `append`, `insert`, `delete`, `reverse`, `setCharAt`, then `toString()` once at the end. Methods return `this`, so calls chain.

`StringBuffer` is the Java 1.0 version with every method `synchronized`. Prefer `StringBuilder`; a builder used by one thread at a time needs no locking.

### When does `+` cost you?

`a + b + c` in one expression is efficient: the compiler generates a single concatenation. Concatenating **in a loop** creates a new `String` every iteration and copies everything accumulated so far: O(n²) characters copied in total. Use a `StringBuilder` (or `String.join`, `Collectors.joining`) in loops.

## Internal working

- **Storage (Java 9+, compact strings):** a `String` holds a `byte[] value` and a `byte coder`. If every character fits in Latin-1, each takes **1 byte** (`coder = LATIN1`); otherwise the array stores UTF-16 at **2 bytes per char**. Before Java 9 it was always a `char[]`. The public API is unchanged: `charAt` still returns UTF-16 units.
- **Hash caching:** `hashCode()` is computed on first use (`s[0]*31^(n-1) + … + s[n-1]`) and cached in a field, which makes strings cheap `HashMap` keys.
- **`+` compilation:** since Java 9, `javac` compiles concatenation to an `invokedynamic` call to `StringConcatFactory`, which builds an optimised concatenation strategy at run time (JEP 280). Before Java 9 it compiled to `new StringBuilder().append(a).append(b).toString()`.
- **`StringBuilder` growth:** it starts with capacity 16 (or `initial + 16`) and when full grows to roughly `2 × old + 2`, copying the buffer. Amortised appends are O(1). Pass an initial capacity when you know the final size.
- **`substring`** copies the selected characters into a new string (since Java 7u6); older versions shared the parent's array and could leak memory.
- **`split`** has a fast path for single-character, non-regex-metacharacter delimiters; otherwise it compiles a regex each call — precompile a `Pattern` in hot loops.

## Visual representation

```text title="Concatenation in a loop versus StringBuilder"
  String s = "";  for 4 iterations: s = s + "ab";
    iteration 1: ""        + "ab" -> new "ab"            copies 2 chars
    iteration 2: "ab"      + "ab" -> new "abab"          copies 4
    iteration 3: "abab"    + "ab" -> new "ababab"        copies 6
    iteration 4: "ababab"  + "ab" -> new "abababab"      copies 8     total O(n^2)

  StringBuilder sb (capacity 16): append "ab" x4
    [a b a b a b a b . . . . . . . .]   one buffer, grows only when full   total O(n)
    sb.toString() -> one final String
```

## Java code example

```java title="StringsDemo.java" file="StringsDemo.java"
import java.util.Arrays;
import java.util.Locale;
import java.util.Objects;

public class StringsDemo {
    public static void main(String[] args) {
        String raw = "  Java, Streams , Records,  ,Generics  ";
        String trimmed = raw.strip();
        String[] parts = trimmed.split("\\s*,\\s*");           // regex: comma with optional spaces
        System.out.println("parts = " + Arrays.toString(parts) + " (" + parts.length + ")");
        System.out.println("joined = " + String.join(" | ", parts));

        String title = "concurrency in practice";
        System.out.println("upper = " + title.toUpperCase(Locale.ROOT));
        System.out.println("substring(0, 11) = '" + title.substring(0, 11) + "'");
        System.out.println("indexOf(\"in\") = " + title.indexOf("in") + ", lastIndexOf = " + title.lastIndexOf("in"));
        System.out.println("replace = " + title.replace(' ', '_'));
        System.out.println("repeat = " + "-".repeat(10) + ", isBlank(\"  \") = " + "  ".isBlank());

        // Strings are immutable: the result must be used
        String name = "duke";
        name.toUpperCase(Locale.ROOT);
        System.out.println("after ignoring the result: " + name);
        name = name.toUpperCase(Locale.ROOT);
        System.out.println("after assigning the result: " + name);

        // Comparison
        String input = null;
        System.out.println("\"yes\".equals(null input) = " + "yes".equals(input) + ", Objects.equals = " + Objects.equals(input, null));
        System.out.println("\"apple\".compareTo(\"banana\") = " + "apple".compareTo("banana"));
        System.out.println("\"Zebra\".compareTo(\"apple\") < 0 ? " + ("Zebra".compareTo("apple") < 0));
        System.out.println("equalsIgnoreCase = " + "JAVA".equalsIgnoreCase("java"));

        // StringBuilder: mutable, chainable
        StringBuilder sb = new StringBuilder(32);
        sb.append("level").append('-').append(42).insert(0, "[").append("]");
        System.out.println("builder = " + sb + ", reversed = " + new StringBuilder("stressed").reverse());
        sb.setLength(0);
        for (int i = 1; i <= 5; i++) {
            if (sb.length() > 0) {
                sb.append(", ");
            }
            sb.append(i * i);
        }
        System.out.println("squares = " + sb);

        // Formatting
        System.out.println(String.format(Locale.ROOT, "%-8s|%6.2f|%05d", "price", 3.14159, 42));
        System.out.println("%s has %d chars".formatted("Java", "Java".length()));
    }
}
```

## Output

```text title="Output" output="StringsDemo.java"
parts = [Java, Streams, Records, , Generics] (5)
joined = Java | Streams | Records |  | Generics
upper = CONCURRENCY IN PRACTICE
substring(0, 11) = 'concurrency'
indexOf("in") = 12, lastIndexOf = 12
replace = concurrency_in_practice
repeat = ----------, isBlank("  ") = true
after ignoring the result: duke
after assigning the result: DUKE
"yes".equals(null input) = false, Objects.equals = true
"apple".compareTo("banana") = -1
"Zebra".compareTo("apple") < 0 ? true
equalsIgnoreCase = true
builder = [level-42], reversed = desserts
squares = 1, 4, 9, 16, 25
price   |  3.14|00042
Java has 4 chars
```

- `split` kept an **empty** element where the input had `,  ,`; trailing empty strings are removed by `split`, but interior ones are not.
- `name.toUpperCase(...)` alone left `name` unchanged: strings are immutable.
- `compareTo` returns the difference of the first differing chars (`'a' - 'b' = -1`). Uppercase letters sort before lowercase ones because their UTF-16 values are smaller.
- `%-8s` left-aligns in 8 columns, `%6.2f` right-aligns with 2 decimals, `%05d` zero-pads.

## Real-world application

- **Log and message building** uses `StringBuilder` or logging frameworks' parameterised messages (`log.info("user {} logged in", id)`) so strings are only built when the level is enabled.
- **CSV/HTTP parsing** uses `split`, `indexOf` and `substring`; high-volume parsers avoid regex `split` in hot paths.
- **Case-insensitive keys** (HTTP headers, usernames) normalise with `toLowerCase(Locale.ROOT)` — never the default locale, which in Turkish turns `"TITLE".toLowerCase()` into `"tıtle"` with a dotless i.
- **Report and SQL generation** uses `String.join`, `Collectors.joining` and text blocks (Java 15).

## Common mistakes

- **Calling a String method and ignoring the result** (`s.trim();`).
- **`==` instead of `equals`**.
- **Concatenation inside loops** producing quadratic time and garbage.
- **Locale-sensitive case conversion** without `Locale.ROOT`.
- **`split(".")` or `split("|")`**: the argument is a regex; `.` matches everything, giving an empty array. Use `split("\\.")` or `Pattern.quote(".")`.
- **Assuming `length()` counts user-visible characters**: emoji are 2 chars, and combining accents add more.
- **`substring(begin, end)` with `end` inclusive in your head** — it's exclusive.

## Interview questions

**Q1. What is the difference between `String`, `StringBuilder` and `StringBuffer`?**

````reveal title="Answer"
`String` is immutable: every change creates a new object, which makes it thread-safe, cacheable and safe as a map key. `StringBuilder` is a mutable buffer for building strings efficiently in one thread. `StringBuffer` is the same but with synchronized methods — legacy; uncontended locking is cheap but rarely needed, and sharing a builder between threads is a design smell.
````

**Q2. Is `s = s + x` in a loop really slow? Doesn't the compiler optimise it?**

````reveal title="Answer"
The compiler optimises concatenation **within one expression** (with `StringConcatFactory` since Java 9). It does not merge concatenations across loop iterations: each iteration produces a new `String` and copies all previous characters, so building an n-character result costs O(n²) copying. Use a `StringBuilder` created outside the loop.
````

**Q3. What does `"a,b,,c,,".split(",")` return?**

````reveal title="Answer"
`["a", "b", "", "c"]` — 4 elements. Interior empty strings are kept, trailing empty strings are removed. Use `split(",", -1)` to keep trailing empties too.
````

**Q4. How are Strings stored in memory since Java 9?**

````reveal title="Answer"
Compact strings (JEP 254): a `byte[]` plus a `coder` flag. Latin-1-only strings use 1 byte per character; others use UTF-16 with 2 bytes per char. This roughly halves memory for typical English/ASCII-heavy data, with no API change.
````

## Hands-on exercise

Write `TextStats.java` with:

1. `static String capitalizeWords(String s)` — `"hello  wide world"` → `"Hello  Wide World"` (preserve spacing),
2. `static boolean isPalindrome(String s)` ignoring case and non-letters/digits (`"A man, a plan, a canal: Panama"` → true),
3. `static String compress(String s)` — run-length encoding (`"aaabccdddd"` → `"a3b1c2d4"`), returning the original if the encoding isn't shorter.

Use `StringBuilder` and avoid regexes in the loops.

````hint title="Hint 1"
For capitalisation, walk the chars and upper-case a letter when the previous char is a space (or at index 0).
````

````hint title="Hint 2"
For the palindrome, use two indexes moving inwards and skip non-alphanumeric characters with `Character.isLetterOrDigit`.
````

````solution title="Solution"
```java title="TextStats.java" file="TextStats.java"
public class TextStats {
    static String capitalizeWords(String s) {
        StringBuilder out = new StringBuilder(s.length());
        boolean startOfWord = true;
        for (char c : s.toCharArray()) {
            out.append(startOfWord ? Character.toUpperCase(c) : c);
            startOfWord = c == ' ';
        }
        return out.toString();
    }

    static boolean isPalindrome(String s) {
        int i = 0;
        int j = s.length() - 1;
        while (i < j) {
            char a = s.charAt(i);
            char b = s.charAt(j);
            if (!Character.isLetterOrDigit(a)) {
                i++;
            } else if (!Character.isLetterOrDigit(b)) {
                j--;
            } else if (Character.toLowerCase(a) != Character.toLowerCase(b)) {
                return false;
            } else {
                i++;
                j--;
            }
        }
        return true;
    }

    static String compress(String s) {
        StringBuilder out = new StringBuilder();
        int i = 0;
        while (i < s.length()) {
            char c = s.charAt(i);
            int run = 0;
            while (i < s.length() && s.charAt(i) == c) {
                i++;
                run++;
            }
            out.append(c).append(run);
        }
        return out.length() < s.length() ? out.toString() : s;
    }

    public static void main(String[] args) {
        System.out.println(capitalizeWords("hello  wide world"));
        System.out.println(isPalindrome("A man, a plan, a canal: Panama") + " " + isPalindrome("race a car"));
        System.out.println(compress("aaabccdddd") + " " + compress("abc"));
    }
}
```

```text title="Output" output="TextStats.java"
Hello  Wide World
true false
a3b1c2d4 abc
```

Each method is O(n) time. `compress("abc")` returns the input because `"a1b1c1"` would be longer.
````

## Knowledge check

```quiz
? What does `String s = "java"; s.concat("17"); System.out.println(s);` print?
+ java
- java17
- Compile error
> concat returns a new String; s still refers to the original.

? Which is the best way to build a long string inside a loop?
- `result += piece;`
+ A StringBuilder created before the loop
- StringBuffer, because it is thread-safe
> One growing buffer avoids O(n^2) copying; synchronization adds nothing for one thread.

? What does `"1.2.3".split(".")` return?
- ["1", "2", "3"]
+ An empty array
- ["1.2.3"]
> "." is a regex matching any char; every piece is empty and trailing empties are dropped.

? Why should you write `"ok".equals(status)` rather than `status.equals("ok")`?
+ It returns false instead of throwing NullPointerException when status is null
- It is faster
- equals is only defined on literals
> Calling a method on the literal is null-safe for the argument.

? How many bytes per character does a Java 17 String use for "hello"?
+ 1 (compact strings, Latin-1)
- 2 (always UTF-16)
- 4
> Since Java 9, Latin-1 strings use one byte per char.
```

## Key takeaways

- Strings are **immutable**: every "modifying" method returns a new string — use the result.
- Compare with **`equals`**; use `Locale.ROOT` for case conversion of identifiers.
- Concatenating within one expression is fine; **in loops use `StringBuilder`**. `StringBuffer` is legacy.
- `split` takes a **regex** and drops trailing empty strings.
- Since Java 9 strings are **compact** (Latin-1 bytes when possible) and `+` uses **`StringConcatFactory`**.
