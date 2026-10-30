## Concept explanation

Java 21 and Java 25 are consecutive LTS releases. This lesson covers the language and library features in between that you'll actually write: what each one is for, the release where it became **final**, and which features are still **previews** in Java 25. Virtual threads, structured concurrency and the JVM-level changes have their own lessons in the concurrency and JVM stages.

### Status at Java 25

| Feature | Final in | What it gives you |
|---|---|---|
| **Sequenced collections** | 21 | `getFirst/getLast/addFirst/addLast/removeFirst/removeLast/reversed` on lists, deques, ordered sets and maps |
| Record patterns, pattern matching for `switch` | 21 | previous lesson |
| Virtual threads | 21 | concurrency stage |
| Small APIs: `Math.clamp`, `StringBuilder.repeat`, `String.splitWithDelimiters`, `Character.isEmoji` | 21 | |
| **Unnamed variables & patterns `_`** | 22 | ignore what you don't use: `catch (Exception _)`, `(_, v) -> v`, `case Point(var x, _)` |
| Foreign Function & Memory API | 22 | call native code and manage off-heap memory without JNI |
| Launch multi-file source programs | 22 | `java Main.java` compiles referenced source files too |
| Markdown documentation comments `///` | 23 | Javadoc written in Markdown |
| **Stream gatherers** | 24 | custom intermediate operations: windows, scans, folds, `mapConcurrent` |
| Class-File API | 24 | a standard API for reading and writing bytecode |
| **Compact source files & instance `main`** | 25 | `void main() { IO.println("hi"); }` is a complete program |
| **Module import declarations** | 25 | `import module java.base;` imports every package a module exports |
| **Flexible constructor bodies** | 25 | statements (validation, field assignments) **before** `super(...)` |
| **Scoped values** | 25 | an immutable, bounded alternative to `ThreadLocal` |
| Key Derivation Function API | 25 | security |
| *Primitive types in patterns* | **preview** (3rd) in 25 | `case int i`, `x instanceof byte b` |
| *Structured concurrency* | **preview** (5th) in 25 | concurrency stage |
| *Stable values*, *PEM encodings* | **preview** in 25 | lazily initialised constants; PEM text ↔ keys |
| *Vector API* | **incubator** in 25 | SIMD computations |
| ~~String templates~~ | withdrawn after 22 | previewed in 21–22, then removed for redesign |

### Sequenced collections (21)

Before Java 21, "first" and "last" were spelled differently everywhere:
- lists: `list.get(0)` and `list.get(list.size() - 1)`;
- deques: `deque.peekFirst()`;
- `LinkedHashSet`: an iterator, or nothing at all for the last element.

Three new interfaces unify them:
- **`SequencedCollection<E>`**, implemented by `List`, `Deque`, `LinkedHashSet` and `SortedSet`, adds `getFirst()`, `getLast()`, `addFirst(e)`, `addLast(e)`, `removeFirst()`, `removeLast()` and `reversed()`.
- **`SequencedSet<E>`** has a `reversed()` that returns a set.
- **`SequencedMap<K, V>`**, implemented by `LinkedHashMap` and `SortedMap`, adds `firstEntry()`, `lastEntry()`, `pollFirstEntry()`, `pollLastEntry()`, `putFirst(k, v)`, `putLast(k, v)`, `reversed()`, `sequencedKeySet()`, `sequencedValues()` and `sequencedEntrySet()`.

Behaviour details:
- **`reversed()` returns a live view**, not a copy: changes go both ways.
- `getFirst()` on an empty list throws `NoSuchElementException`.
- `LinkedHashSet.addFirst` / `LinkedHashMap.putLast` **move** an existing element to that end, which makes LRU-style ordering easy.
- Sorted collections throw `UnsupportedOperationException` for `addFirst`/`addLast`, because the comparator defines the order.

### Unnamed variables and patterns (22)

`_` marks a variable or pattern component you must declare but won't use. That documents intent and avoids "unused" warnings:

```java
catch (NumberFormatException _) { ... }
map.forEach((_, value) -> total += value);
for (var _ : items) count++;
case Point(var x, _) -> x;                   // ignore a record component
case Circle _, Square _ -> "round or square"; // several patterns, no bindings
```

### Stream gatherers (24)

Collectors let you write custom **terminal** operations; until Java 24 you couldn't write custom **intermediate** operations. **`stream.gather(gatherer)`** fills that gap. The built-in **`Gatherers`** are:
- `windowFixed(n)`: chunks of n;
- `windowSliding(n)`: overlapping windows;
- `scan(init, op)`: running totals;
- `fold(init, op)`: a single result, emitted downstream;
- `mapConcurrent(n, fn)`: concurrent mapping on virtual threads, keeping order.

You can also build your own with `Gatherer.ofSequential(initializer, integrator, finisher)`.

### Compact source files and instance main methods (25)

```java
// Hello.java - the whole file
void main() {
    IO.println("Hello, " + IO.readln("Name? "));
}
```

- A source file with methods and fields but **no class declaration** declares an **implicit class**, named after the file.
- `main` can be an **instance** method, with **no `String[]` parameter** and **no `static`/`public`**.
- The new **`java.lang.IO`** class offers `println`, `print` and `readln`.
- Compact files **automatically import the `java.base` module**, so `List`, `Map` and `Stream` need no imports.

It's aimed at learning and small scripts (`java Hello.java`). Grow the file into a normal class when it becomes a real program.

### Module import declarations (25)

`import module java.base;` imports all public top-level types of every package that module exports, roughly 50 packages at once. It works in any source file, with or without modules. If two imported modules export the same simple name (`java.util.List` and `java.awt.List` with `java.desktop`), resolve the clash with an ordinary single-type import, which takes precedence.

### Flexible constructor bodies (25)

Before Java 25, `super(...)` or `this(...)` had to be the **first statement**, which forced validation into static helper methods. Now a constructor may have a **prologue** before the call. In the prologue you may:
- validate arguments and compute values;
- assign the class's **own fields**.

You may not read `this`, call instance methods, or use the half-built object.

Assigning fields first fixes a classic bug: a superclass constructor that calls an overridden method no longer sees the subclass's fields as `0`/`null`.

### Scoped values (25)

`ScopedValue<T>` passes **immutable** context (the current user, a request ID, a transaction) to code deep in the call stack without adding parameters:

```java
static final ScopedValue<User> CURRENT_USER = ScopedValue.newInstance();
ScopedValue.where(CURRENT_USER, user).run(() -> handleRequest());   // bound only inside run()
User u = CURRENT_USER.get();                                        // anywhere below
```

Compared with `ThreadLocal`:
- **no `set()`**: values can't be mutated;
- **automatic cleanup** when `run` returns, so nothing leaks into pooled threads;
- **cheap inheritance** by child tasks in structured concurrency.

This matters with millions of virtual threads.

## Internal working

- **Sequenced collections** were retrofitted by inserting `SequencedCollection` into the hierarchy *above* `List` and `Deque`, with **default methods**, so every existing implementation gained the methods without changes.
  - `reversed()` returns a lightweight view class (for example `ReverseOrderDequeView`) that maps operations onto the original.
  - A few third-party classes that already had a conflicting `reversed()` or `getFirst()` broke when compiled against 21. That's the rare cost of adding interface methods.
- **Gatherers** are to `gather` what collectors are to `collect`. A `Gatherer<T, A, R>` has four parts:
  - an **initializer** that creates the per-stream state;
  - an **integrator** that receives `(state, element, downstream)`, pushes zero or more results, and can return `false` to short-circuit;
  - an optional **combiner**, which makes it parallel-capable;
  - an optional **finisher** that flushes state at the end.

  `gather` slots into the existing sink chain like any built-in stage.
- **`_`** has been a reserved keyword since Java 9 (using it as an identifier was an error), which made this feature possible. The compiler doesn't create a named local for it.
- **Implicit classes** are `final` top-level classes in the unnamed package. Other code can't refer to them by name.
  - The **launch protocol** picks the first `main` it finds in this order: `static main(String[])`, `static main()`, instance `main(String[])`, instance `main()`. For an instance `main`, the launcher first creates the object with the no-arg constructor.
  - The protocol is the same for ordinary classes, so instance `main` works there too.
- **Flexible constructor bodies** need no JVM change. The verifier always allowed field stores to `this` before the `super` call ("early construction context"), and `javac` now permits it in the language. Reads of `this` in the prologue remain compile errors.
- **Scoped values** are stored in a per-thread chain of immutable bindings ("snapshots"), established on entry to `run`/`call` and discarded on exit.
  - Lookups are cached, so repeated `get()` calls are fast.
  - Because bindings can't change, child threads in a `StructuredTaskScope` can share the parent's snapshot without copying, unlike `InheritableThreadLocal`.

## Visual representation

```text title="Sequenced collections: one vocabulary for ordered collections"
                        SequencedCollection<E>  getFirst getLast addFirst addLast removeFirst removeLast reversed
                         /           |                  \
                     List<E>      Deque<E>          SequencedSet<E>
                                                     /          \
                                            LinkedHashSet    SortedSet -> NavigableSet -> TreeSet

                        SequencedMap<K,V>  firstEntry lastEntry pollFirstEntry putFirst putLast reversed
                         /             \
                 LinkedHashMap      SortedMap -> NavigableMap -> TreeMap

  gather pipeline:  source -> filter -> gather(windowSliding(3)) -> map -> toList
                                        [3,5,8] [5,8,6] [8,6,9] ...

  constructor (Java 25):   prologue: validate, this.rate = rate   |   super(id)   |   epilogue
                           (no reads of this)                     |               |   normal code
```

## Java code example

Sequenced collections and the other Java 21 additions:

```java title="Sequenced.java" file="Sequenced.java" java="21"
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.SequencedMap;
import java.util.SortedSet;
import java.util.TreeSet;

public class Sequenced {
    public static void main(String[] args) {
        List<String> list = new ArrayList<>(List.of("b", "c"));
        list.addFirst("a");                                    // was: list.add(0, "a")
        list.addLast("d");
        System.out.println(list + " first=" + list.getFirst() + " last=" + list.getLast());

        List<String> backwards = list.reversed();              // a live view, not a copy
        list.add("e");
        backwards.addFirst("z");                               // writes through to the END of list
        System.out.println("list " + list + " view " + backwards);

        Deque<Integer> deque = new ArrayDeque<>(List.of(1, 2, 3));
        System.out.println("deque reversed " + deque.reversed());

        LinkedHashSet<String> set = new LinkedHashSet<>(List.of("x", "y", "z"));
        set.addFirst("z");                                     // moves an existing element to the front
        System.out.println("set " + set + " reversed " + set.reversed());

        SequencedMap<String, Integer> map = new LinkedHashMap<>();
        map.put("one", 1);
        map.put("two", 2);
        map.putFirst("zero", 0);
        map.putLast("one", 11);                                // re-inserting moves the key to the end
        System.out.println("map " + map + " first=" + map.firstEntry() + " last=" + map.lastEntry());
        System.out.println("pollLastEntry " + map.pollLastEntry() + " -> " + map + ", keys reversed " + map.sequencedKeySet().reversed());

        SortedSet<Integer> sorted = new TreeSet<>(List.of(5, 1, 3));
        System.out.println("TreeSet first=" + sorted.getFirst() + " last=" + sorted.getLast() + " reversed " + sorted.reversed());
        try {
            sorted.addFirst(0);
        } catch (UnsupportedOperationException e) {
            System.out.println("TreeSet.addFirst: UnsupportedOperationException (the comparator decides order)");
        }
        try {
            new ArrayList<String>().getFirst();
        } catch (NoSuchElementException e) {
            System.out.println("getFirst on an empty list: NoSuchElementException");
        }

        // Other small Java 21 APIs
        System.out.println("Math.clamp " + Math.clamp(150, 0, 100)
                + ", StringBuilder.repeat " + new StringBuilder().repeat("ab", 3)
                + ", splitWithDelimiters " + Arrays.toString("a,b;c".splitWithDelimiters("[,;]", 0)));
    }
}
```

Java 22–25 features in one ordinary class (it compiles only on Java 25):

```java title="Modern25.java" file="Modern25.java" java="25"
import module java.base;                                       // Java 25: every package java.base exports

public class Modern25 {
    // Flexible constructor bodies (25)
    static class Account {
        private final String id;

        Account(String id) {
            this.id = id;
            IO.println("  Account() calls describe(): " + describe());
        }

        String describe() {
            return "account " + id;
        }
    }

    static class SavingsAccount extends Account {
        private final double rate;

        SavingsAccount(String id, double rate) {
            if (rate < 0 || rate > 0.2) {                       // validation BEFORE super(...)
                throw new IllegalArgumentException("rate out of range: " + rate);
            }
            this.rate = rate;                                  // assigned before super(...) runs
            super(id.strip().toUpperCase());
        }

        @Override
        String describe() {
            return "savings at " + rate;                       // Java 21 would print 0.0 here
        }
    }

    // Scoped values (25)
    static final ScopedValue<String> REQUEST_USER = ScopedValue.newInstance();

    static String handle(String path) {
        return REQUEST_USER.get() + " requested " + path;     // no parameter threaded through
    }

    record Point(int x, int y) { }

    public static void main(String[] args) {
        // Unnamed variables and patterns (22)
        int valid = 0;
        for (String line : List.of("ada,36", "linus,x", "grace,45")) {
            try {
                Integer.parseInt(line.split(",")[1]);
                valid++;
            } catch (NumberFormatException _) {
                IO.println("skipping bad line: " + line);
            }
        }
        Map<String, Integer> stock = new TreeMap<>(Map.of("pen", 10, "ink", 4));
        int[] units = {0};
        stock.forEach((_, qty) -> units[0] += qty);
        Object shape = new Point(3, 4);
        if (shape instanceof Point(int x, _)) {
            IO.println("valid lines " + valid + ", units " + units[0] + ", x only: " + x);
        }

        // Stream gatherers (24)
        List<Integer> readings = List.of(3, 5, 8, 6, 9, 12, 10, 4);
        IO.println("windowFixed(3)   " + readings.stream().gather(Gatherers.windowFixed(3)).toList());
        IO.println("moving avg (3)   " + readings.stream().gather(Gatherers.windowSliding(3))
                .map(w -> String.format("%.1f", w.stream().mapToInt(Integer::intValue).average().orElse(0)))
                .toList());
        IO.println("running max      " + readings.stream().gather(Gatherers.scan(() -> Integer.MIN_VALUE, Math::max)).toList());
        Gatherer<Integer, int[], Integer> newHighs = Gatherer.ofSequential(
                () -> new int[] {Integer.MIN_VALUE},               // state: highest value so far
                Gatherer.Integrator.ofGreedy((best, value, downstream) -> {
                    if (value > best[0]) {
                        best[0] = value;
                        return downstream.push(value);
                    }
                    return true;
                }));
        IO.println("custom newHighs  " + readings.stream().gather(newHighs).toList());

        // Flexible constructor bodies (25)
        IO.println(new SavingsAccount(" s-1 ", 0.03).describe());
        try {
            new SavingsAccount("s-2", 0.5);
        } catch (IllegalArgumentException e) {
            IO.println("rejected before super(): " + e.getMessage());
        }

        // Scoped values (25)
        String result = ScopedValue.where(REQUEST_USER, "ada").call(() -> handle("/orders"));
        IO.println(result + "; bound after call: " + REQUEST_USER.isBound());
    }
}
```

A compact source file: this is the entire `Hello.java`, run with `java Hello.java`.

```java title="Hello.java" file="Hello.java" java="25"
void main() {
    IO.println("Hello from a compact source file");
    var languages = List.of("Java", "Kotlin", "Scala");      // java.base is imported automatically
    for (var language : languages.reversed()) {
        IO.println(" - " + shout(language));
    }
}

String shout(String text) {                                   // a method of the implicit class
    return text.toUpperCase() + "!";
}
```

A preview feature for comparison: primitive types in patterns (third preview in Java 25), compiled and run with `--enable-preview`.

```java title="PrimitivePatterns.java" file="PrimitivePatterns.java" java="25" preview="true"
public class PrimitivePatterns {
    static String classify(int value) {
        return switch (value) {
            case byte b -> "fits in a byte: " + b;             // matches only if no information is lost
            case int i when i > 0 -> "positive int: " + i;
            case int i -> "negative int: " + i;
        };
    }

    public static void main(String[] args) {
        for (int value : new int[] {42, 300, -1_000}) {
            System.out.println(classify(value));
        }
        double whole = 3.0;
        double half = 2.5;
        if (whole instanceof int exact) {
            System.out.println("3.0 converts exactly to int " + exact);
        }
        System.out.println("2.5 instanceof int: " + (half instanceof int));
    }
}
```

## Output

`Sequenced.java` (Java 21):

```text title="Output" output="Sequenced.java"
[a, b, c, d] first=a last=d
list [a, b, c, d, e, z] view [z, e, d, c, b, a]
deque reversed [3, 2, 1]
set [z, x, y] reversed [y, x, z]
map {zero=0, two=2, one=11} first=zero=0 last=one=11
pollLastEntry one=11 -> {zero=0, two=2}, keys reversed [two, zero]
TreeSet first=1 last=5 reversed [5, 3, 1]
TreeSet.addFirst: UnsupportedOperationException (the comparator decides order)
getFirst on an empty list: NoSuchElementException
Math.clamp 100, StringBuilder.repeat ababab, splitWithDelimiters [a, ,, b, ;, c]
```

`Modern25.java` (Java 25):

```text title="Output" output="Modern25.java"
skipping bad line: linus,x
valid lines 2, units 14, x only: 3
windowFixed(3)   [[3, 5, 8], [6, 9, 12], [10, 4]]
moving avg (3)   [5.3, 6.3, 7.7, 9.0, 10.3, 8.7]
running max      [3, 5, 8, 8, 9, 12, 12, 12]
custom newHighs  [3, 5, 8, 9, 12]
  Account() calls describe(): savings at 0.03
savings at 0.03
rejected before super(): rate out of range: 0.5
ada requested /orders; bound after call: false
```

`Hello.java` (Java 25, compact source file):

```text title="Output" output="Hello.java"
Hello from a compact source file
 - SCALA!
 - KOTLIN!
 - JAVA!
```

`PrimitivePatterns.java` (Java 25 with `--enable-preview`):

```text title="Output" output="PrimitivePatterns.java"
fits in a byte: 42
positive int: 300
negative int: -1000
3.0 converts exactly to int 3
2.5 instanceof int: false
```

- `reversed()` is a view: `backwards.addFirst("z")` appended `z` to the **end** of the original list.
- `putLast("one", 11)` and `set.addFirst("z")` **moved** existing entries. `TreeSet` refused `addFirst`, because its comparator decides positions.
- In `Modern25`, `SavingsAccount` assigned `rate` *before* `super(...)`, so the superclass constructor's call to the overridden `describe()` saw `0.03` instead of the classic `0.0`. Invalid rates were rejected before any superclass code ran.
- The scoped value was visible inside `handle` only during `call(...)`, and unbound afterwards.
- `Hello.java` has no class, no `static`, no `String[] args` and no imports.
- The preview example matched `300` as `int` because it doesn't fit in a `byte`, and `2.5` isn't an exact `int`.

## Real-world application

- **Sequenced collections**:
  - `recentItems.getLast()` and `history.reversed()` for "newest first" views;
  - an LRU cache via `LinkedHashMap.putLast` + `pollFirstEntry`;
  - simpler `TreeMap` boundary queries.
- **`_`**: lambdas that ignore keys (`map.forEach((_, v) -> ...)`), catch blocks that only log, and switch cases over sealed types that don't need the components.
- **Gatherers**:
  - batching inserts with `windowFixed(500)`;
  - moving averages and anomaly detection on metrics with `windowSliding`;
  - running totals with `scan`;
  - calling an HTTP API for each element with bounded concurrency on virtual threads with `mapConcurrent(16, ...)`.
- **Compact source files**: teaching, scratch experiments, small ops scripts run with `java script.java` instead of shell or Python.
- **Flexible constructors**: validate arguments before invoking expensive or side-effecting superclass constructors, and prepare values for `super(...)` without static helpers.
- **Scoped values**: request context in web frameworks running on virtual threads (user, tenant, trace ID), replacing `ThreadLocal`s that leak across pooled threads.

## Common mistakes

- **Treating `reversed()` as a copy.** It's a live view, and modifying it modifies the original. Use `new ArrayList<>(list.reversed())` for a snapshot.
- **Calling `getFirst()` without handling the empty case**, which throws `NoSuchElementException` instead of returning `null` like `peekFirst()`.
- **Assuming every feature in a JDK release is final.** Check the JEP status, and keep preview features (primitive patterns, structured concurrency, stable values) out of production.
- **Using `import module` in libraries** where explicit imports document dependencies better, or hitting ambiguous simple names when importing several modules.
- **Reading `this` (or calling instance methods) before `super(...)`.** The prologue may only *assign* the class's own fields.
- **Trying to `set` a scoped value**, or calling `get()` outside a binding (`NoSuchElementException`). Check with `isBound()` or use `orElse`.
- **Using `mapConcurrent` for CPU-bound work.** It's designed for blocking I/O on virtual threads.

## Interview questions

**Q1. What problem do sequenced collections solve?**

````reveal title="Answer"
Ordered collections had inconsistent or missing ways to access both ends:
- `list.get(list.size() - 1)`;
- `deque.getLast()`;
- for a `LinkedHashSet`, iterate to the end;
- `sortedSet.last()`;
- for a `LinkedHashMap`, iterate the entry set.

Java 21 adds `SequencedCollection`, `SequencedSet` and `SequencedMap` with uniform `getFirst/getLast/addFirst/addLast/removeFirst/removeLast` (`firstEntry/putFirst/pollLastEntry` for maps) and `reversed()`, which returns a live reverse-ordered view. They were added as default methods, so all existing implementations gained them.
````

**Q2. What are stream gatherers, and how do they relate to collectors?**

````reveal title="Answer"
A gatherer (final in Java 24) defines a custom **intermediate** operation, used with `stream.gather(...)`, just as a collector defines a custom **terminal** operation. It has an initializer (state), an integrator that may push zero or more elements downstream and can short-circuit, an optional combiner for parallel use, and an optional finisher. `Gatherers` provides `windowFixed`, `windowSliding`, `scan`, `fold` and `mapConcurrent`.
````

**Q3. What changed for `main` in Java 25?**

````reveal title="Answer"
JEP 512 finalised compact source files and instance main methods:
- a source file may contain just methods and fields, which declares an implicit class named after the file;
- `main` may be a non-static instance method with no parameters;
- `java.lang.IO` provides `println`/`readln`;
- compact files implicitly import the `java.base` module.

The launcher prefers `static main(String[])`, then `static main()`, then instance versions, creating an instance with the no-arg constructor when needed. The goal is a gentler on-ramp and smaller scripts; the language is otherwise unchanged.
````

**Q4. What can a constructor do before `super(...)` since Java 25, and what can't it do?**

````reveal title="Answer"
In the prologue before `super(...)`/`this(...)` it can run ordinary statements: validate parameters, compute local values, throw exceptions, and **assign fields declared in its own class**. It can't read fields, call instance methods, pass `this` anywhere, or otherwise use the object under construction. Assigning fields first means a superclass constructor that calls an overridden method sees the subclass's values instead of `0`/`null`.
````

**Q5. Why use `ScopedValue` instead of `ThreadLocal`?**

````reveal title="Answer"
- **Immutable**: no `set`, so a callee can't change the context under the caller.
- **Bounded lifetime**: the binding exists only during `where(...).run/call` and disappears afterwards, so there are no leaks into reused pool threads and no forgotten `remove()`.
- **Cheap sharing** with child threads in structured concurrency, without copying.

These properties matter at virtual-thread scale. `ThreadLocal` remains for mutable per-thread caches.
````

## Hands-on exercise

Build a small **recent-activity tracker** using Java 21–25 features:

1. Read events `"user action"` (for example `"ada login"`). Keep a `SequencedMap<String, String>` of each user's latest action, using `putLast` so the most recently active user moves to the end. Print the users most recent first (`reversed()`) and the least recently active user (`firstEntry()`).
2. Write a custom gatherer `dropRepeats()` that removes **consecutive** duplicate events (like Unix `uniq`), and use `Gatherers.windowFixed(3)` to batch the remaining events for a bulk insert. Print the batches.
3. Use `_` wherever a variable is required but unused.

````hint title="Hint"
`Gatherer.ofSequential(() -> new String[1], Gatherer.Integrator.ofGreedy((last, event, downstream) -> { if (event.equals(last[0])) return true; last[0] = event; return downstream.push(event); }))`. The parsing loop can destructure with `var parts = event.split(" ", 2)`.
````

````solution title="Solution"
```java title="ActivityTracker.java" file="ActivityTracker.java" java="25"
import java.util.LinkedHashMap;
import java.util.List;
import java.util.SequencedMap;
import java.util.stream.Gatherer;
import java.util.stream.Gatherers;

public class ActivityTracker {
    static Gatherer<String, ?, String> dropRepeats() {
        return Gatherer.ofSequential(
                () -> new String[1],                              // state: the previous event
                Gatherer.Integrator.ofGreedy((last, event, downstream) -> {
                    if (event.equals(last[0])) {
                        return true;                              // skip, keep going
                    }
                    last[0] = event;
                    return downstream.push(event);
                }));
    }

    public static void main(String[] args) {
        List<String> events = List.of(
                "ada login", "ada login", "linus open-pr", "grace deploy",
                "ada comment", "linus open-pr", "linus merge", "grace deploy", "grace deploy");

        SequencedMap<String, String> latest = new LinkedHashMap<>();
        for (String event : events) {
            var parts = event.split(" ", 2);
            latest.putLast(parts[0], parts[1]);                   // moves the user to the end
        }
        System.out.println("most recent first: " + latest.reversed());
        System.out.println("least recently active: " + latest.firstEntry());

        int[] deploying = {0};
        latest.forEach((_, action) -> {                           // the key isn't needed
            if (action.equals("deploy")) {
                deploying[0]++;
            }
        });
        System.out.println("users whose latest action is deploy: " + deploying[0]);

        List<String> deduplicated = events.stream().gather(dropRepeats()).toList();
        System.out.println("after dropRepeats: " + deduplicated.size() + " of " + events.size() + " events");
        events.stream()
                .gather(dropRepeats())
                .gather(Gatherers.windowFixed(3))
                .forEach(batch -> System.out.println("insert batch " + batch));
    }
}
```

```text title="Output" output="ActivityTracker.java"
most recent first: {grace=deploy, linus=merge, ada=comment}
least recently active: ada=comment
users whose latest action is deploy: 1
after dropRepeats: 7 of 9 events
insert batch [ada login, linus open-pr, grace deploy]
insert batch [ada comment, linus open-pr, linus merge]
insert batch [grace deploy]
```

`putLast` turned the map into a recency list at no extra cost, and gatherers chain like any other stream stage. `dropRepeats` only removes *consecutive* repeats: `linus open-pr` appears twice in the output because other events came between the two.
````

## Knowledge check

```quiz
? What does list.reversed() return in Java 21?
+ A live reverse-ordered view of the list
- A reversed copy
- Nothing; it reverses the list in place
> Changes through the view write through to the original list.

? Which feature is still a preview in Java 25?
+ Primitive types in patterns
- Stream gatherers
- Flexible constructor bodies
> Gatherers were finalised in 24, and flexible constructor bodies in 25.

? In a Java 25 constructor, which statement is allowed before super(...)?
+ this.rate = rate;
- System.out.println(this.rate);
- describe();
> The prologue may assign the class's own fields but not read this or call instance methods.

? Which line is a complete Java 25 program in Hello.java?
+ void main() { IO.println("hi"); }
- main() { print("hi") }
- public static void main() { println("hi"); }
> An implicit class with an instance main method; IO is java.lang.IO.

? How is a ScopedValue different from a ThreadLocal?
+ It is immutable and bound only for the duration of where(...).run/call
- It is shared by all threads in the JVM
- It can be changed with set() by any callee
> Bounded, immutable bindings prevent leaks and are cheap for virtual threads.
```

## Key takeaways

- **Java 21**: sequenced collections (`getFirst/getLast/addFirst/reversed`, live views), plus record and switch patterns, virtual threads and small API additions.
- **Java 22–24**: `_` for unused variables and patterns, the FFM API, Markdown Javadoc, **stream gatherers** (`windowFixed`, `windowSliding`, `scan`, `fold`, `mapConcurrent`, custom `Gatherer.ofSequential`).
- **Java 25 (LTS)**: **compact source files + instance `main` + `IO`**, **`import module`**, **flexible constructor bodies** (validate and assign before `super`), **scoped values**.
- **Previews in 25**: primitive types in patterns, structured concurrency, stable values. Use `--enable-preview`, and keep them out of production.
