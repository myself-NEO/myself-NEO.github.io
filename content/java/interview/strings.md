# Strings

### Why is `String` immutable in Java?
`id: string-immutable` `level: beginner` `kind: concept` `tricky` `lessons: string-immutability`

#### Hints
1. Strings are used as file paths, URLs, class names and map keys. What could go wrong if one changed after it was checked?
2. What does the JVM share between all occurrences of the same literal?
3. What does `String` cache after the first call to one of its methods?

#### Answer
Immutability makes four things safe at once:

1. **Security / integrity** — strings carry paths, URLs, hostnames, SQL and class names. If a string could change between validation and use (time-of-check/time-of-use), security checks would be meaningless; class loading by name relies on it too.
2. **The string pool** — literals are shared across the whole JVM. Sharing is only safe if nobody can modify the shared object.
3. **Hash caching** — `hashCode()` is computed once and cached, making strings fast and reliable `HashMap` keys. A key whose content could change would end up in the wrong bucket.
4. **Thread safety** — immutable objects can be shared between threads with no synchronisation.

The implementation enforces it: the class is `final`, the backing array is `private final` and never exposed (`toCharArray`/`getBytes` return copies), and every "modifying" method returns a new string. The cost is allocation, which `StringBuilder` addresses.

#### Why other answers fall short
- **"For performance."** Immutability *costs* allocations; the performance benefits (pooling, hash caching) are consequences, not the whole story.
- **"Because it's `final`."** `final` on the class only prevents subclassing; immutability also requires private, never-exposed, never-modified state.
- **Listing only the string pool.** Interviewers expect security, hashing and thread safety too.

#### Follow-up
**Can you break String's immutability?** With deep reflection on `value` — which strong encapsulation blocks since Java 16 (`InaccessibleObjectException` unless `--add-opens java.base/java.lang=ALL-UNNAMED`). Doing it would corrupt pooled literals everywhere.

### What does this print?
`id: string-pool-equality` `level: beginner` `kind: output` `tricky` `lessons: string-immutability`

```java
String a = "java";
String b = "ja" + "va";
String c = "ja";
String d = c + "va";
String e = new String("java");
System.out.println((a == b) + " " + (a == d) + " " + (a == e) + " " + (a == d.intern()) + " " + a.equals(e));
```

#### Hints
1. Which of these expressions can `javac` evaluate at compile time?
2. Does `new` ever return a pooled object?

#### Answer
`true false false true true`

- `"ja" + "va"` is a constant expression, folded by `javac` into the literal `"java"` — the same pooled object as `a`.
- `c + "va"` involves a non-`final` variable, so it's concatenated at run time into a new object.
- `new String("java")` always creates a new object.
- `intern()` returns the pooled instance with equal content — which is `a`.
- `equals` compares characters: `true`.

If `c` were declared `final String c = "ja";`, then `c + "va"` would also be a constant expression and `a == d` would be `true`.

#### Why other answers fall short
- **"All true because strings with the same value share memory."** Only pooled strings do; run-time results and `new` create distinct objects.
- **"`a == b` is false because `+` creates a new string."** Not for compile-time constants.

#### Follow-up
**Where is the string pool in modern HotSpot?** Since JDK 7 interned strings are ordinary heap objects referenced from a native string table (they used to live in PermGen) and can be garbage-collected when unreferenced.

### `String`, `StringBuilder` or `StringBuffer`?
`id: builder-vs-buffer` `level: beginner` `kind: concept` `lessons: strings-and-stringbuilder`

#### Hints
1. Which of the three is mutable?
2. What is the only difference between the two mutable ones?

#### Answer
- **`String`** — immutable; use it for values, keys and anything shared.
- **`StringBuilder`** — mutable buffer for building text, not synchronised; the default choice for building strings in a loop or method.
- **`StringBuffer`** — the same API with every method `synchronized` (Java 1.0). Legacy: a builder should be confined to one thread, and synchronising individual `append` calls doesn't make multi-step building atomic anyway.

Within a single expression, plain `+` is fine (compiled to an optimised `StringConcatFactory` call since Java 9). In loops, `+=` copies the accumulated text every iteration — O(n²) — so use a `StringBuilder` created before the loop, or `String.join`/`Collectors.joining`.

#### Why other answers fall short
- **"Use StringBuffer when thread safety matters."** Per-call synchronisation doesn't give you atomic multi-call operations; share an immutable result or use proper synchronisation instead.
- **"Always avoid `+`."** One-expression concatenation is optimised by the compiler and is the most readable option.

#### Follow-up
**How does `StringBuilder` grow?** Default capacity is 16 (or the initial string's length + 16); when full it grows to about `2 × capacity + 2`, copying the buffer. Pre-size it when you know the final length.

### Find the bug in this string-building code
`id: concat-in-loop` `level: intermediate` `kind: debugging` `lessons: strings-and-stringbuilder`

```java
String csv = "";
for (Order order : orders) {          // 200,000 orders
    csv += order.id() + "," + order.total() + "\n";
}
```

#### Hints
1. How many characters are copied in iteration *k*?
2. What does each `+=` produce?

#### Answer
Each `csv += …` creates a **new** `String` containing all previous text plus the new line, copying everything accumulated so far. Over *n* lines that's 1 + 2 + … + n line-lengths ≈ O(n²) characters copied and n large garbage objects — seconds of CPU and heavy GC for 200,000 rows.

Fix:

```java
StringBuilder csv = new StringBuilder(orders.size() * 32);
for (Order order : orders) {
    csv.append(order.id()).append(',').append(order.total()).append('\n');
}
String result = csv.toString();
```

or `orders.stream().map(o -> o.id() + "," + o.total()).collect(Collectors.joining("\n"))`. For truly large outputs, write directly to a `Writer` instead of building one huge string.

#### Why other answers fall short
- **"The JIT optimises it away."** The compiler optimises concatenation within one expression, not across iterations.
- **"Use `concat()` instead of `+`."** Same allocation pattern.

#### Follow-up
**Is the line inside the `append` version still concatenating?** No — each value is appended directly; `','` as a `char` avoids even a one-character string.

### Why is `"Hello".toUpperCase()` locale-sensitive, and when does it matter?
`id: locale-case` `level: intermediate` `kind: scenario` `lessons: strings-and-stringbuilder`

A login service lower-cases usernames with `username.toLowerCase()` before looking them up. Users in Turkey report that `TITLE` and `title` are treated as different accounts.

#### Hints
1. What does the no-argument `toLowerCase()` use to decide case mappings?
2. Turkish has two different letter i's.

#### Answer
`toLowerCase()`/`toUpperCase()` without arguments use the **JVM's default locale**. In Turkish (`tr`), uppercase `I` lowercases to dotless `ı` and lowercase `i` uppercases to dotted `İ`. So on a server whose default locale is Turkish, `"TITLE".toLowerCase()` is `"tıtle"`, which doesn't match `"title"`.

For identifiers, keys, protocol tokens and anything machine-readable, use `toLowerCase(Locale.ROOT)` (or `equalsIgnoreCase`, which is locale-independent). Use a specific locale only for text shown to humans.

#### Why other answers fall short
- **"Use `equalsIgnoreCase` everywhere."** Fine for comparison, but normalised keys still need a locale-independent conversion.
- **"Set the server locale to English."** Fragile: one container with a different default reintroduces the bug.

#### Follow-up
**Are there other locale-sensitive defaults to watch?** `String.format` with `%f` (decimal comma in many locales), `NumberFormat`, `DateTimeFormatter` patterns with text, and (before Java 18) the default charset.

### How many objects are created by `new String("hello")`?
`id: new-string-objects` `level: intermediate` `kind: internals` `tricky` `lessons: string-immutability`

#### Hints
1. When is the literal `"hello"` interned?
2. What does `new` always do?

#### Answer
At most two, and only one per execution:

- The literal `"hello"` is resolved and interned **once** (the first time that constant is used), unless an equal string is already in the pool. It's shared by every use of the literal.
- `new String(...)` creates **one new `String` object every time** the statement runs. In current JDKs the new object shares the literal's internal `byte[]` instead of copying it.

So the first execution may create 2 objects (pooled literal + new instance); each later execution creates 1. That's also why `new String("...")` is almost never useful.

#### Why other answers fall short
- **"Always two."** The literal is pooled once, not per execution.
- **"One, because the literal is compiled into the class."** The class file stores a constant-pool entry; the `String` object for it is created when the constant is resolved at run time.

#### Follow-up
**When would you call `intern()` deliberately?** For a small set of heavily repeated values parsed at run time (e.g. status codes from JSON) to save memory — usually better served by enums or G1 string deduplication.

### Reverse the words in a sentence
`id: reverse-words` `level: beginner` `kind: coding` `lessons: strings-and-stringbuilder,arrays`

Write `reverseWords(String s)`: `"  the sky   is blue "` → `"blue is sky the"` (single spaces, no leading/trailing spaces).

#### Hints
1. `strip()` removes the outer spaces; what regex splits on one or more spaces?
2. Build the result from the last word to the first with a `StringBuilder` or `String.join`.

#### Answer
```java
static String reverseWords(String s) {
    String[] words = s.strip().split("\\s+");
    StringBuilder out = new StringBuilder(s.length());
    for (int i = words.length - 1; i >= 0; i--) {
        if (out.length() > 0) out.append(' ');
        out.append(words[i]);
    }
    return out.toString();
}
```

O(n) time and space. Edge cases: an all-space input — `"   ".strip()` is `""`, and `"".split("\\s+")` returns `[""]`, so the method returns `""` correctly. Alternative one-liner: `List<String> w = Arrays.asList(s.strip().split("\\s+")); Collections.reverse(w); return String.join(" ", w);`.

#### Why other answers fall short
- **`split(" ")`** keeps empty strings for repeated spaces, producing double spaces.
- **Concatenating with `+=` in the loop** is O(n²).
- **Reversing the whole string's characters** reverses letters inside words too.

#### Follow-up
**Can you do it in place on a `char[]` with O(1) extra space?** Reverse the whole array, then reverse each word (and compact spaces in a separate pass).

### Why are passwords often handled as `char[]` instead of `String`?
`id: password-char-array` `level: intermediate` `kind: scenario` `lessons: string-immutability`

#### Hints
1. Can you erase the contents of a `String` once you're done with it?
2. Where else can string contents end up?

#### Answer
A `String` is immutable, so you can't wipe it; it stays in the heap until garbage-collected (and may be interned, copied by deduplication, captured in heap dumps, or accidentally logged via `toString`). A `char[]` can be overwritten with `Arrays.fill(pw, '\0')` as soon as it has been used, shortening the window in which the secret is in memory. That's why `Console.readPassword()`, `KeyStore` and `PBEKeySpec` use `char[]`.

It's defence in depth, not a guarantee (the GC may have copied the array; frameworks may have created strings already). Production systems also hash passwords immediately (bcrypt/scrypt/Argon2/PBKDF2) and never log credentials.

#### Why other answers fall short
- **"`char[]` is encrypted."** It isn't; it's just erasable.
- **"Strings can't contain special characters."** Irrelevant.

#### Follow-up
**How should you compare a provided password with a stored one?** Hash the attempt with the stored salt and compare hashes in constant time (`MessageDigest.isEqual`), never compare plaintext.
