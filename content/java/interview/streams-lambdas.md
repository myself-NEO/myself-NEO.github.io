# Streams & Lambdas

### Is `Comparator` a functional interface, even though it declares two abstract methods?
`id: comparator-functional` `level: intermediate` `kind: concept` `tricky` `lessons: lambdas-and-functional-interfaces,built-in-functional-interfaces`

#### Hints
1. Which two abstract methods does `Comparator` declare?
2. Does every implementation already have one of them?

#### Answer
Yes. A functional interface has exactly **one abstract method**, and the count excludes:
- `default` and `static` methods;
- abstract methods that match a **public method of `Object`**.

`Comparator` declares `int compare(T, T)` and `boolean equals(Object)`. Every class inherits `equals` from `Object`, so it doesn't count. Only `compare` remains, and `Comparator` is annotated `@FunctionalInterface`. The same rule lets an interface redeclare `toString()` or `hashCode()` for documentation purposes.

#### Why other answers fall short
- **"No, two abstract methods means it isn't functional."** That ignores the `Object`-method exemption in the language specification.
- **"Yes, because of `@FunctionalInterface`."** The annotation only asks the compiler to *check*; being functional depends on the methods, not the annotation.

#### Follow-up
**Can a functional interface extend another interface?** Yes, as long as the total number of abstract methods (excluding `Object` ones) is still one. For example, `UnaryOperator<T>` extends `Function<T, T>` and adds no abstract methods.

### Why must local variables used inside a lambda be effectively final?
`id: effectively-final-capture` `level: beginner` `kind: concept` `lessons: lambdas-and-functional-interfaces`

#### Hints
1. When might the lambda run, relative to the method that created it?
2. Where do local variables live, and what happens to them when the method returns?

#### Answer
A lambda can outlive its method: it may be stored, returned, or run later on another thread. Local variables live in the method's stack frame, which disappears when the method returns, so the lambda **captures a copy of the value**. If the variable could still change, the copy and the variable would silently diverge, and two threads could race on one stack variable. Requiring **effectively final** variables (assigned once, never changed, `final` keyword optional) makes the copy indistinguishable from the variable.

Fields aren't restricted, because the lambda captures `this` (or nothing, for statics) and reads the field when it runs.

#### Why other answers fall short
- **"It's a performance optimisation."** It's about semantics: copying a value that may change is ambiguous.
- **"So the lambda is thread-safe."** Captured *objects* can still be mutated: `list.add(x)` inside a lambda is allowed. Only the variable binding is fixed.

#### Follow-up
**How do people work around it, and what should they do instead?** Common hacks are one-element arrays (`int[] count = {0}`) or `AtomicInteger`. Usually the right answer is to compute the result with a stream reduction (`count()`, `sum()`, `collect`) instead of mutating captured state.

### How are lambdas implemented, and how do they differ from anonymous inner classes?
`id: lambda-implementation` `level: advanced` `kind: internals` `lessons: lambdas-and-functional-interfaces,method-references`

#### Hints
1. Does `javac` produce a `.class` file per lambda?
2. Which bytecode instruction appears where the lambda is created?

#### Answer
**Lambdas:**
- **Compilation**: `javac` moves the body into a private synthetic method (`lambda$main$0`) and emits an **`invokedynamic`** instruction whose bootstrap method is `LambdaMetafactory.metafactory`.
- **First execution**: the bootstrap generates a **hidden class** implementing the functional interface and links the call site.
- **Later evaluations**: they return an instance, which in current HotSpot is a cached singleton for non-capturing lambdas, or a new object holding the captured values.

**Anonymous classes:**
- Each one is a real `Outer$1.class` compiled to disk and instantiated with `new` every time.
- It has its own `this`, can declare fields and several methods, and can shadow local names.
- In instance contexts it always keeps a reference to the outer object, a classic source of memory leaks.

**Lambdas** have no state, `this` refers to the enclosing instance, and they capture only what they use.

#### Why other answers fall short
- **"Lambdas are syntactic sugar for anonymous classes."** They're compiled differently (`invokedynamic` and hidden classes), with different `this` semantics and identity behaviour.
- **"Lambdas are always faster."** After warm-up, both are usually inlined by the JIT. The real gains are fewer classes, lazy linkage and less captured state.

#### Follow-up
**Can you rely on `lambda1 == lambda2` or on lambda `equals`?** No. Identity and caching are unspecified implementation details; never use lambdas as map keys or locks.

### What does this print?
`id: method-ref-null-receiver` `level: intermediate` `kind: output` `tricky` `lessons: method-references`

```java
String s = null;
Supplier<Integer> lambda = () -> s.length();
System.out.println("lambda created");
Supplier<Integer> ref = s::length;
System.out.println("method ref created");
```

#### Hints
1. When is `s` dereferenced in the lambda?
2. When is the receiver of a *bound* method reference evaluated?

#### Answer
```text
lambda created
Exception in thread "main" java.lang.NullPointerException
```

The lambda only *captures* `s`; it would fail only when `get()` is called, which never happens here. For a bound method reference `expr::method`, the receiver expression is **evaluated and null-checked when the reference is created** (`javac` emits `Objects.requireNonNull`). So the fourth line throws, and "method ref created" is never printed.

#### Why other answers fall short
- **"Both lines print; nothing is called."** That treats method references as fully lazy, but their receiver is eager.
- **"The lambda line throws."** Creating a lambda never runs its body.

#### Follow-up
**Does the receiver variable of a method reference need to be effectively final?** No. Its *value* is captured once at creation time, so reassigning the variable later is allowed and has no effect on the reference.

### In what order do these statements print?
`id: stream-vertical-order` `level: beginner` `kind: output` `tricky` `lessons: stream-fundamentals`

```java
Stream.of("a", "bb", "ccc", "dddd")
      .filter(s -> { System.out.println("filter " + s); return s.length() > 1; })
      .map(s -> { System.out.println("map " + s); return s.toUpperCase(); })
      .findFirst()
      .ifPresent(System.out::println);
```

#### Hints
1. Does `filter` run over all four elements before `map` starts?
2. What does `findFirst` do once it has an element?

#### Answer
```text
filter a
filter bb
map bb
BB
```

Streams evaluate **vertically**: each element passes through the whole pipeline before the next one is read. `a` fails the filter; `bb` passes the filter and the map, `findFirst` receives it and **short-circuits**, and `ccc` and `dddd` are never touched.

#### Why other answers fall short
- **"filter a, filter bb, filter ccc, filter dddd, map bb, map ccc, map dddd, BB."** That's horizontal, collection-style evaluation; streams fuse the stages into one pass.
- **"Nothing, streams are lazy."** `findFirst` is a terminal operation, so the pipeline runs.

#### Follow-up
**What changes if you add `.sorted()` before `map`?** `sorted` is a stateful barrier: every element passes `filter` first and is buffered, then they flow on in sorted order. You'd see all four `filter` lines before the first `map`.

### What does this print on Java 17?
`id: peek-count-skipped` `level: intermediate` `kind: output` `tricky` `lessons: stream-fundamentals`

```java
long n = List.of(1, 2, 3).stream().peek(System.out::println).count();
System.out.println(n);
```

#### Hints
1. Does `count()` need to see the elements if the size is already known?
2. Can any stage in this pipeline change the number of elements?

#### Answer
Only `3`. Since Java 9, `count()` checks the stream flags. The source is `SIZED` and no stage can change the element count, so it returns the spliterator's size **without traversing the pipeline**, and `peek` never runs. Add a `filter(x -> true)` and the elements are traversed again, printing 1, 2 and 3 first.

This is why the Javadoc calls `peek` a debugging aid. The library may skip it.

#### Why other answers fall short
- **"1, 2, 3, 3."** True on Java 8, but not on modern Java.
- **"Nothing at all."** `n` is still printed.

#### Follow-up
**What else can the library skip based on flags?** `sorted()` on an already `SORTED` stream (for example from a `TreeSet`), and `distinct()` on a `DISTINCT` source such as a `Set`.

### What is the difference between `map` and `flatMap`?
`id: map-vs-flatmap` `level: beginner` `kind: concept` `lessons: stream-operations,optional`

#### Hints
1. What type do you get from `orders.stream().map(Order::lines)` if `lines()` returns a `List`?
2. How do you get one stream of all the lines?

#### Answer
`map` transforms each element into **exactly one** result: `Stream<Order>` → `map(Order::lines)` → `Stream<List<Line>>`. `flatMap` takes a function that returns a **stream** for each element and **concatenates** those streams: `flatMap(o -> o.lines().stream())` → `Stream<Line>`. Use `flatMap` for one-to-many relationships (lines per order, roles per user, words per sentence). `mapMulti` (Java 16) does the same without creating inner streams.

The same idea applies to `Optional`: `map` with a function returning `Optional` gives `Optional<Optional<T>>`, while `flatMap` flattens it.

#### Why other answers fall short
- **"flatMap is for nested lists only."** It works for anything that can produce a stream: `Optional::stream`, `String::lines`, `Map::values`.
- **"flatMap flattens recursively."** It removes exactly one level.

#### Follow-up
**How do you drop empty optionals from a `Stream<Optional<T>>`?** `.flatMap(Optional::stream)` (Java 9).

### This grouping works in tests but throws in production. Why?
`id: tomap-duplicates-nulls` `level: intermediate` `kind: debugging` `tricky` `lessons: collectors`

```java
Map<String, String> emailByName = users.stream()
        .collect(Collectors.toMap(User::name, User::email));
```

Production logs show `IllegalStateException: Duplicate key Ann Lee (attempted merging values ann@a.com and ann.lee@b.com)` and, on another day, a `NullPointerException`.

#### Hints
1. What does `toMap` do when two elements produce the same key?
2. What does it do when the value function returns `null`?

#### Answer
- **Duplicate keys**: by default `toMap` throws `IllegalStateException` when two elements map to the same key. The test data simply had unique names. Supply a merge function that encodes the business rule: `toMap(User::name, User::email, (first, second) -> first)`, or collect all values with `groupingBy(User::name, mapping(User::email, toList()))`.
- **Null values**: `toMap` builds the map with `Map.merge`, which rejects `null` values. A user without an e-mail breaks it. Filter those users out, map to a default value, or use `groupingBy`/`toCollection` instead.

Names are also a poor key. Prefer a real identifier: `toMap(User::id, Function.identity())`.

#### Why other answers fall short
- **"Use a `HashMap` supplier to fix it."** The map type doesn't change duplicate or null handling.
- **"Catch the exception."** That hides data problems instead of deciding how duplicates should be resolved.

#### Follow-up
**Which map type does `toMap` return, and how do you control it?** It's unspecified (a `HashMap` today). Use the four-argument form: `toMap(k, v, merge, LinkedHashMap::new)` or `TreeMap::new`.

### `Stream.toList()` vs `Collectors.toList()` vs `Collectors.toUnmodifiableList()`
`id: tolist-variants` `level: intermediate` `kind: concept` `tricky` `lessons: collectors`

#### Hints
1. Which ones can you `add` to?
2. Which one rejects `null` elements?

#### Answer
| | Modifiable? | Nulls | Notes |
|---|---|---|---|
| `stream.toList()` (16) | **no** | allowed | shortest; no copy beyond the internal array |
| `collect(Collectors.toList())` | unspecified (an `ArrayList` today) | allowed | don't rely on mutability |
| `collect(Collectors.toUnmodifiableList())` (10) | no | **`NullPointerException`** | like `List.copyOf` |

Code that did `stream.collect(toList()).add(x)` and was "modernised" to `stream.toList().add(x)` starts throwing `UnsupportedOperationException`. If you need a mutable list, say so: `collect(Collectors.toCollection(ArrayList::new))`.

#### Why other answers fall short
- **"They're all the same."** They differ in mutability and null handling.
- **"`Collectors.toList()` guarantees an `ArrayList`."** The Javadoc explicitly makes no guarantee about type or mutability.

#### Follow-up
**Is `stream.toList()` thread-safe to share?** It's unmodifiable, so it's safe to publish and read. The elements themselves must be safe too.

### What does this print?
`id: orelse-vs-orelseget` `level: beginner` `kind: output` `tricky` `lessons: optional`

```java
static String load() {
    System.out.println("loading");
    return "default";
}

String a = Optional.of("cached").orElse(load());
String b = Optional.of("cached").orElseGet(() -> load());
System.out.println(a + " " + b);
```

#### Hints
1. When does Java evaluate a method argument?
2. What does `orElseGet` receive instead of a value?

#### Answer
```text
loading
cached cached
```

`orElse(load())` is a normal method call: its argument `load()` is evaluated **before** `orElse` runs, even though the `Optional` has a value. `orElseGet` receives a `Supplier` and calls it only when the `Optional` is empty. If `load()` queried a database or created objects, `orElse` would do that work on every call.

#### Why other answers fall short
- **"Nothing extra is printed; both are lazy."** Only `orElseGet` is lazy.
- **"loading is printed twice."** The supplier is never invoked because a value is present.

#### Follow-up
**When is `orElse` the right choice?** For constants or already computed values: `orElse("")`, `orElse(DEFAULT_TIMEOUT)`.

### Why does this parallel sum return 50 instead of 20?
`id: reduce-identity-parallel` `level: intermediate` `kind: debugging` `tricky` `lessons: stream-operations,primitive-and-parallel-streams`

```java
int total = Stream.of(1, 2, 3, 4).parallel().reduce(10, Integer::sum);   // "start counting from 10"
```

#### Hints
1. How many times is the identity used in a parallel reduction?
2. What property must the first argument of `reduce` have?

#### Answer
In a parallel reduction **each chunk starts from the identity**. The stream of four elements was split into four chunks, each computing `10 + element`, and the partial results were combined: 11 + 12 + 13 + 14 = 50. The first argument must be a true **identity** for the operation (`0` for sum), so that `identity + x == x`. Sequentially, the bug is invisible (10 + 1 + 2 + 3 + 4 = 20). Fix: `reduce(0, Integer::sum) + 10`, or `mapToInt(Integer::intValue).sum() + 10`.

#### Why other answers fall short
- **"A race condition in `Integer::sum`."** There's no shared state; the bug is deterministic for a given split.
- **"Parallel streams are unreliable."** They're correct when the contract (associativity, true identity) is respected.

#### Follow-up
**What other property must the accumulator have?** It must be **associative**, so that `(a op b) op c == a op (b op c)`. Subtraction isn't, so `reduce(0, (a, b) -> a - b)` gives split-dependent results.

### A teammate added `.parallelStream()` to a REST endpoint and latency got worse. Why?
`id: parallel-stream-server` `level: advanced` `kind: scenario` `lessons: primitive-and-parallel-streams`

#### Hints
1. Which thread pool runs parallel streams, and who else uses it?
2. What is the server already doing with its CPU cores?

#### Answer
- **The cores are already busy.** A web server handles many requests concurrently, so splitting each request's work across threads adds overhead (splitting, task scheduling, merging) without adding capacity.
- **One shared, JVM-wide pool.** Every parallel stream uses the **common `ForkJoinPool`** (CPUs − 1 threads), which `CompletableFuture.*Async` also uses by default. Concurrent requests queue behind each other's tasks.
- **Blocking work.** If the pipeline does I/O (database lookups, HTTP calls), it blocks the few common-pool threads and starves everything else.
- **Small data.** The collections in a request are often small, so N × Q is far below where parallelism pays off.

Fix: remove `.parallel()` for request-sized work. Use an executor sized for I/O, or virtual threads, for concurrent remote calls. Keep parallel streams for large, CPU-bound batch jobs, verified with JMH.

#### Why other answers fall short
- **"Parallel streams are always faster with more cores."** Only when there's enough independent CPU work and idle cores.
- **"Increase the common pool size."** That increases contention and doesn't fix blocking or overhead.

#### Follow-up
**Which sources split well for parallel processing?** `ArrayList`, arrays and `IntStream.range` split evenly in O(1). `LinkedList`, `Stream.iterate` and I/O-backed streams don't.

### Find the first non-repeating character in a string using streams.
`id: first-non-repeating-char` `level: intermediate` `kind: coding` `lessons: collectors,stream-operations`

#### Hints
1. You need counts *and* the original order of first appearance.
2. Which map keeps insertion order?

#### Answer
```java
static Optional<Character> firstUnique(String s) {
    return s.chars()
            .mapToObj(c -> (char) c)
            .collect(Collectors.groupingBy(Function.identity(), LinkedHashMap::new, Collectors.counting()))
            .entrySet().stream()
            .filter(e -> e.getValue() == 1)
            .map(Map.Entry::getKey)
            .findFirst();
}
// firstUnique("swiss") -> Optional[w], firstUnique("stress") -> Optional[t], firstUnique("aabb") -> Optional.empty
```

`groupingBy` with a **`LinkedHashMap`** counts each character while preserving first-appearance order. The second pass finds the first entry with count 1. It's O(n) time and O(k) space for k distinct characters. Returning `Optional` covers strings in which every character repeats.

#### Why other answers fall short
- **Using the default `groupingBy`** (a `HashMap`) loses the order, so the "first" result is arbitrary.
- **`s.indexOf(c) == s.lastIndexOf(c)` for each character** is O(n²).

#### Follow-up
**How would you make it case-insensitive or Unicode-safe?** Lower-case first, and use `s.codePoints()` with `Character.toString(cp)`, so that characters outside the Basic Multilingual Plane (emoji) aren't split into surrogate pairs.

### Find the second-highest distinct salary in each department.
`id: second-highest-salary-by-dept` `level: intermediate` `kind: coding` `lessons: collectors`

#### Hints
1. Group by department first. What should each group's downstream collector produce?
2. How do you handle duplicates and departments with only one distinct salary?

#### Answer
```java
Map<String, Optional<Integer>> secondHighest = staff.stream()
        .collect(Collectors.groupingBy(Employee::dept, TreeMap::new,
                Collectors.mapping(Employee::salary,
                        Collectors.collectingAndThen(
                                Collectors.toCollection(TreeSet::new),          // distinct + sorted
                                set -> set.descendingSet().stream().skip(1).findFirst()))));
// {eng=Optional[120], ops=Optional.empty, sales=Optional.empty}
// eng: 135, 120, 110 -> 120; ops has one person; sales has two people both earning 90
```

- `mapping` extracts the salaries.
- A `TreeSet` removes duplicates and sorts them.
- `collectingAndThen` turns each set into "the second element from the top", as an `Optional`, so departments without a second distinct salary are explicit rather than failing.

#### Why other answers fall short
- **`sorted(reverseOrder()).skip(1).findFirst()` without `distinct()`** returns 90 for sales: the second *row*, not the second distinct salary.
- **Throwing on small departments** (`get()`, `orElseThrow()`) turns normal data into errors.

#### Follow-up
**How would you get the employee names, not just the salary?** Group to `TreeMap<Integer, List<String>>` per department (`groupingBy(Employee::salary, TreeMap::new, mapping(Employee::name, toList()))`), then take the second-highest key's list with `descendingMap().values().stream().skip(1).findFirst()`.
