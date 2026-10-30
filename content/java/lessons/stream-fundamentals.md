## Concept explanation

### What a stream is

A **stream** (`java.util.stream.Stream<T>`) is a sequence of elements that you process with a chain of aggregate operations: *filter these, transform those, collect the result*. You describe **what** you want, and the library decides **how** to loop.

```java
// imperative: how to loop
List<String> result = new ArrayList<>();
for (String w : words) {
    if (w.length() > 4) {
        result.add(w.toUpperCase());
    }
}

// declarative: what you want
List<String> result = words.stream()
        .filter(w -> w.length() > 4)
        .map(String::toUpperCase)
        .toList();
```

A stream is **not a collection**:

| Collection | Stream |
|---|---|
| stores elements | stores nothing; elements flow through from a source |
| can be iterated many times | **single use**: consumed by one terminal operation |
| eager: elements exist up front | **lazy**: elements are pulled only when needed, so it can be infinite |
| you modify it (`add`, `remove`) | operations never modify the source; they produce new results |

Don't confuse these with `java.io.InputStream`/`OutputStream`: same word, unrelated concept.

### The pipeline

Every stream pipeline has three parts:

1. **A source**: a collection, an array, a range, a generator, a file, a regex…
2. **Zero or more intermediate operations** (`filter`, `map`, `sorted`, `limit`…). Each returns a new `Stream` and does no work yet.
3. **Exactly one terminal operation** (`toList`, `collect`, `forEach`, `count`, `findFirst`, `reduce`…). It triggers the processing and produces a result or a side effect.

### Creating streams

| Source | Example |
|---|---|
| a collection | `list.stream()`, `set.stream()`, `map.entrySet().stream()` |
| values | `Stream.of("a", "b")`, `Stream.ofNullable(maybe)` (Java 9) |
| an array | `Arrays.stream(array)`, `Arrays.stream(array, from, to)` |
| numeric ranges | `IntStream.range(0, 10)` (0–9), `IntStream.rangeClosed(1, 10)` (1–10) |
| infinite generators | `Stream.iterate(1, n -> n * 2)`, `Stream.generate(Math::random)` |
| a bounded iterate (Java 9) | `Stream.iterate(1, n -> n < 100, n -> n * 3)`, like a `for` loop |
| strings and text | `"abc".chars()`, `text.lines()` (Java 11), `Pattern.compile(",").splitAsStream(csv)` |
| files and I/O | `Files.lines(path)`, `bufferedReader.lines()`, `Files.list(dir)` (close these!) |
| combining and building | `Stream.concat(a, b)`, `Stream.builder()` |

### Laziness, vertical evaluation and short-circuiting

- **Lazy.** Intermediate operations only *describe* the work. Without a terminal operation, nothing runs: a pipeline with a `println` in `filter` prints nothing.
- **Vertical (element by element).** The stream does not run `filter` over all elements and then `map` over the survivors. Each element travels down the whole pipeline before the next one starts. The operations are *fused* into a single pass with no intermediate collections.
- **Short-circuiting.** Some operations can finish early: `limit`, `takeWhile`, `findFirst`, `findAny`, `anyMatch`, `allMatch` and `noneMatch`. Combined with laziness, this lets you process **infinite streams** and skip unnecessary work.
- **Stateless vs stateful.**
  - **Stateless** operations (`filter`, `map`, `peek`) handle each element on its own.
  - **Stateful** operations need to remember elements: `distinct` keeps a set of everything it has seen, and `sorted` is a **barrier** that must buffer the whole input before passing anything on.

### Rules for well-behaved pipelines

- **Single use.** Calling a second terminal operation, or even another intermediate one, on a consumed stream throws `IllegalStateException`. To process the data again, create a new stream from the source.
- **Non-interference.** Don't modify the source collection while the pipeline runs (`ConcurrentModificationException`, or undefined results).
- **Stateless, side-effect-free lambdas.** Behaviour passed to `filter` and `map` shouldn't depend on or change mutable state. Results must come from the terminal operation (`collect`, `reduce`), not from lambdas adding to an outside list.
- **Close I/O streams.** `Stream` is `AutoCloseable`. Streams backed by files (`Files.lines`, `Files.list`, `Files.walk`) hold OS handles, so use try-with-resources.

## Internal working

How `list.stream().filter(f).map(m).findFirst()` actually runs:

1. **Building the pipeline.** `stream()` creates a `ReferencePipeline.Head` wrapping the list's `Spliterator`. Each intermediate call appends a stage object (`StatelessOp` for `filter`/`map`, `StatefulOp` for `sorted`/`distinct`) linked to the previous one. No elements are touched.
2. **Flags.** Each stage records **stream flags**: `SIZED`, `ORDERED`, `DISTINCT`, `SORTED`, `SHORT_CIRCUIT`. The source contributes some (an `ArrayList` is `SIZED` and `ORDERED`; a `HashSet` is `DISTINCT`), and operations set or clear them (`filter` clears `SIZED`; `sorted` sets `SORTED`).
3. **The terminal operation** calls `wrapSink`, which builds a chain of **`Sink`** objects from the end backwards. Each sink's `accept(element)` does its operation's work and forwards to the next: filter's sink calls `downstream.accept` only if the predicate passes. This chain *is* the fused loop.
4. **Driving the source.**
   - **Without short-circuiting**: `spliterator.forEachRemaining(sink)`.
   - **With a short-circuiting stage**: a loop of `tryAdvance` that checks `sink.cancellationRequested()` before each element. `findFirst` sets it after the first element, so the loop stops.
5. **Stateful barriers.** `sorted`'s sink buffers everything in `accept` and only pushes the sorted elements downstream in `end()`. That's why every element passes the stages *before* `sorted` before any reaches the stages after it.
6. **Flag-based shortcuts.** The library skips work when flags allow it:
   - `sorted()` on an already `SORTED` stream is a no-op;
   - `distinct()` on a `DISTINCT` source does nothing;
   - since **Java 9**, `count()` on a `SIZED` pipeline returns the spliterator's size **without running the pipeline**, so a `peek` or `map` before it never executes.
7. **Single use** is enforced by a `linkedOrConsumed` flag on each stage: "stream has already been operated upon or closed".

## Visual representation

```text title="Horizontal (what people imagine) vs vertical (what streams do)"
  words: [java, var, stream, lambda, record]      filter(len > 4) -> map(upper) -> findFirst()

  horizontal (NOT how streams work)            vertical, fused, short-circuiting (actual)
  ------------------------------------         --------------------------------------------
  filter java    -> x                          java    -> filter x
  filter var     -> x                          var     -> filter x
  filter stream  -> ok                         stream  -> filter ok -> map STREAM -> findFirst: DONE
  filter lambda  -> ok                         lambda, record: never touched
  filter record  -> ok
  map stream, map lambda, map record
  findFirst -> STREAM

  sink chain built by the terminal op:
  spliterator --tryAdvance--> [filter sink] --accept--> [map sink] --accept--> [findFirst sink]
                     ^                                                              |
                     +-------------- cancellationRequested() == true ---------------+
```

## Java code example

```java title="StreamBasics.java" file="StreamBasics.java"
import java.util.ArrayList;
import java.util.Arrays;
import java.util.ConcurrentModificationException;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import java.util.stream.Stream;

public class StreamBasics {
    public static void main(String[] args) {
        List<String> words = List.of("java", "var", "stream", "lambda", "record", "switch");

        // 1. Imperative loop vs declarative pipeline: same result
        List<String> viaLoop = new ArrayList<>();
        for (String w : words) {
            if (w.length() > 4) {
                viaLoop.add(w.toUpperCase());
            }
        }
        List<String> viaStream = words.stream().filter(w -> w.length() > 4).map(String::toUpperCase).toList();
        System.out.println(viaStream + " equal to loop result: " + viaLoop.equals(viaStream));

        // 2. Sources
        String missing = null;
        System.out.println("Stream.of     " + Stream.of("a", "b", "c").toList());
        System.out.println("array sum     " + Arrays.stream(new int[] {3, 1, 2}).sum());
        System.out.println("range         " + IntStream.range(0, 5).boxed().toList());
        System.out.println("iterate       " + Stream.iterate(1, n -> n * 2).limit(8).toList());
        System.out.println("iterate(3)    " + Stream.iterate(1, n -> n < 100, n -> n * 3).toList());
        System.out.println("generate      " + Stream.generate(() -> "ab").limit(3).collect(Collectors.joining()));
        System.out.println("chars         " + "hello".chars().filter(c -> c == 'l').count());
        System.out.println("splitAsStream " + Pattern.compile(",\\s*").splitAsStream("a, b,c").toList());
        System.out.println("ofNullable    " + Stream.ofNullable(missing).count());
        System.out.println("concat        " + Stream.concat(Stream.of(1), Stream.of(2, 3)).toList());

        // 3. Laziness: building a pipeline runs nothing
        Stream<String> pipeline = words.stream().filter(w -> {
            System.out.println("  filter " + w);
            return w.length() > 4;
        });
        System.out.println("pipeline built, nothing filtered yet");

        // 4. Vertical evaluation and short-circuiting
        String first = pipeline.map(w -> {
            System.out.println("  map    " + w);
            return w.toUpperCase();
        }).findFirst().orElse("none");
        System.out.println("findFirst -> " + first + " (lambda, record, switch never examined)");

        // 5. An infinite stream made finite by a short-circuiting operation
        System.out.println("first 5 squares > 50: "
                + IntStream.iterate(1, i -> i + 1).map(i -> i * i).filter(sq -> sq > 50).limit(5).boxed().toList());

        // 6. sorted() is a barrier: everything passes the stages before it first
        Stream.of("c", "a", "b")
                .peek(s -> System.out.println("  before sorted " + s))
                .sorted()
                .peek(s -> System.out.println("  after sorted  " + s))
                .findFirst();

        // 7. Single use
        Stream<String> once = words.stream();
        System.out.println("count = " + once.count());
        try {
            once.count();
        } catch (IllegalStateException e) {
            System.out.println("second use: " + e.getMessage());
        }

        // 8. count() on a SIZED pipeline skips the stages (Java 9+)
        long n = words.stream().peek(w -> System.out.println("  peek " + w)).count();
        System.out.println("count with peek = " + n + ", peek printed nothing");

        // 9. Non-interference: never modify the source during the pipeline
        List<Integer> source = new ArrayList<>(List.of(1, 2, 3));
        try {
            source.stream().forEach(x -> {
                if (x == 1) {
                    source.add(99);
                }
            });
        } catch (ConcurrentModificationException e) {
            System.out.println("modifying the source: ConcurrentModificationException");
        }
    }
}
```

## Output

```text title="Output" output="StreamBasics.java"
[STREAM, LAMBDA, RECORD, SWITCH] equal to loop result: true
Stream.of     [a, b, c]
array sum     6
range         [0, 1, 2, 3, 4]
iterate       [1, 2, 4, 8, 16, 32, 64, 128]
iterate(3)    [1, 3, 9, 27, 81]
generate      ababab
chars         2
splitAsStream [a, b, c]
ofNullable    0
concat        [1, 2, 3]
pipeline built, nothing filtered yet
  filter java
  filter var
  filter stream
  map    stream
findFirst -> STREAM (lambda, record, switch never examined)
first 5 squares > 50: [64, 81, 100, 121, 144]
  before sorted c
  before sorted a
  before sorted b
  after sorted  a
count = 6
second use: stream has already been operated upon or closed
count with peek = 6, peek printed nothing
modifying the source: ConcurrentModificationException
```

- Section 3 printed nothing from `filter`: the pipeline was only a description until `findFirst` ran.
- In section 4, `java` and `var` were filtered out, `stream` passed `filter` **and** `map` before any later word was looked at, and then `findFirst` stopped the loop.
- The infinite `IntStream.iterate` was safe because `limit(5)` short-circuited it.
- All three elements passed "before sorted" before any reached "after sorted", and only one came out, because `findFirst` cancelled after it.
- `count()` returned 6 without running `peek`: the list knows its size, and the pipeline had no `filter` that could change it. Never put logic you rely on into `peek`.

## Real-world application

- **Data transformation in services**: entities to DTOs, filtering by permissions, computing totals for a response.
- **Reading files lazily**: `try (Stream<String> lines = Files.lines(log)) { lines.filter(l -> l.contains("ERROR")).limit(100)... }` processes gigabyte files without loading them, and stops early.
- **Search with early exit**: `orders.stream().anyMatch(o -> o.isOverdue())`, `findFirst()` over a lazily generated sequence of candidate IDs.
- **Generated data**: `Stream.iterate(start, d -> d.plusDays(1)).limit(30)` for calendar days, or `IntStream.range` for batch indexes.
- **Libraries built on the same model**: Spring Data repositories can return `Stream<T>` for large result sets, and JDBC wrappers such as jOOQ expose lazy streams (again, close them).

## Common mistakes

- **Forgetting the terminal operation.** `list.stream().map(this::save);` does nothing.
- **Reusing a stream** stored in a variable or field. Create a new one from the source instead, or keep a `Supplier<Stream<T>>`.
- **Side effects in intermediate operations** (adding to an outside list inside `map`, counting in `filter`). Results become wrong or non-deterministic, especially in parallel. Use `collect`, `count`, `reduce`.
- **Relying on `peek`** for real work: the library may skip it (as `count()` showed). Treat it as a debugging aid only.
- **Infinite streams without a short-circuit**: `Stream.iterate(1, n -> n + 1).filter(n -> n < 10).toList()` never ends, because `filter` can't know no more matches will come. Use `takeWhile` or bounded `iterate`.
- **Not closing file-backed streams**: file handle leaks.
- **Turning every loop into a stream.** Loops with `break`, checked exceptions or several mutable accumulators are often clearer as loops.

## Interview questions

**Q1. What's the difference between intermediate and terminal operations?**

````reveal title="Answer"
Intermediate operations (`filter`, `map`, `sorted`, `limit`…) return a new stream and are lazy: they only add a stage to the pipeline. A terminal operation (`collect`, `forEach`, `reduce`, `count`, `findFirst`…) triggers execution of the whole pipeline, produces a result or side effect, and consumes the stream. Exactly one terminal operation runs per stream.
````

**Q2. In what order do `filter` and `map` run for a list of five elements?**

````reveal title="Answer"
Element by element, not stage by stage. Element 1 goes through filter (and map, if it passes), then element 2, and so on: the operations are fused into one pass via a chain of sinks. Stateful operations like `sorted` are the exception: they buffer everything first. Short-circuiting terminals like `findFirst` stop the loop early, so later elements may never be processed.
````

**Q3. What does "streams are lazy" buy you?**

````reveal title="Answer"
- **No wasted work**: elements beyond what the terminal operation needs are never processed (`findFirst`, `anyMatch`, `limit`).
- **Infinite sources** become usable (`Stream.iterate`, `generate`).
- **Fusion**: several operations become one pass with no intermediate collections.
- **Optimisation from flags**: skipping `sorted` on sorted input, or computing `count()` from a known size.
````

**Q4. Can you reuse a stream?**

````reveal title="Answer"
No. Once a terminal (or another intermediate) operation has been applied, the stream is linked or consumed, and further use throws `IllegalStateException: stream has already been operated upon or closed`. Create a new stream from the source each time, or pass a `Supplier<Stream<T>>`.
````

**Q5. Will `List.of(1, 2, 3).stream().peek(System.out::println).count()` print anything?**

````reveal title="Answer"
On Java 9+, no. The source is `SIZED` and nothing in the pipeline can change the number of elements, so `count()` returns the spliterator's size without traversing the elements. On Java 8 it printed 1, 2, 3. Add a `filter` and the elements are traversed again. This is why `peek` must not carry logic.
````

## Hands-on exercise

Use lazy, short-circuiting streams for two small problems:

1. **Collatz sequence.** Starting from `n`, repeat `n → n / 2` if even, `n → 3n + 1` if odd, until you reach 1. Use the three-argument `Stream.iterate` to produce the sequence for 27 (excluding the final 1). Print how many steps it takes to reach 1, the highest value reached, and the first 10 values.
2. **First five primes above 1000.** Use an infinite `IntStream.iterate(1001, i -> i + 1)`, filter with an `isPrime` helper built on `noneMatch`, and take five with `limit`. Use `peek` with an `AtomicInteger` to show how many candidates were actually examined. This is purely to observe laziness.

````hint title="Hint"
`LongStream.iterate(27, x -> x != 1, x -> x % 2 == 0 ? x / 2 : 3 * x + 1)` stops before 1, so its `count()` equals the number of steps. A fresh stream is needed for each of count, max and the first 10 values. For `isPrime`, `IntStream.rangeClosed(2, (int) Math.sqrt(n)).noneMatch(d -> n % d == 0)` also short-circuits.
````

````solution title="Solution"
```java title="LazyStreams.java" file="LazyStreams.java"
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.LongUnaryOperator;
import java.util.stream.IntStream;
import java.util.stream.LongStream;

public class LazyStreams {
    static final LongUnaryOperator COLLATZ = x -> x % 2 == 0 ? x / 2 : 3 * x + 1;

    static LongStream collatz(long start) {
        return LongStream.iterate(start, x -> x != 1, COLLATZ);   // a fresh stream on every call
    }

    static boolean isPrime(int n) {
        return n > 1 && IntStream.rangeClosed(2, (int) Math.sqrt(n)).noneMatch(d -> n % d == 0);
    }

    public static void main(String[] args) {
        long steps = collatz(27).count();
        long peak = collatz(27).max().orElse(1);
        List<Long> head = collatz(27).limit(10).boxed().toList();
        System.out.println("27 reaches 1 after " + steps + " steps, peak " + peak);
        System.out.println("first values " + head);

        AtomicInteger examined = new AtomicInteger();
        List<Integer> primes = IntStream.iterate(1001, i -> i + 1)
                .peek(i -> examined.incrementAndGet())          // only to observe laziness
                .filter(LazyStreams::isPrime)
                .limit(5)
                .boxed()
                .toList();
        System.out.println("primes " + primes + " after examining " + examined.get() + " candidates");
    }
}
```

```text title="Output" output="LazyStreams.java"
27 reaches 1 after 111 steps, peak 9232
first values [27, 82, 41, 124, 62, 31, 94, 47, 142, 71]
primes [1009, 1013, 1019, 1021, 1031] after examining 31 candidates
```

The infinite stream examined exactly the 31 numbers from 1001 to 1031, and no more, because `limit(5)` cancelled the pipeline once it had five primes. `collatz` returns a new stream on every call because each terminal operation consumes its stream.
````

## Knowledge check

```quiz
? What happens if a pipeline has no terminal operation?
+ Nothing: intermediate operations are lazy
- The stream processes its elements when garbage collected
- It throws IllegalStateException
> Only a terminal operation triggers processing.

? With filter then map then findFirst on [a, b, c], which is processed first?
+ a goes through filter (and map, if it passes) before b is looked at
- filter runs on a, b and c, then map runs on the survivors
- map runs first because it is cheaper
> Streams evaluate vertically, element by element.

? Which operation is a stateful barrier?
+ sorted()
- map()
- filter()
> sorted must see every element before emitting the first.

? What does calling count() twice on the same Stream object do?
+ The second call throws IllegalStateException
- It returns the same value twice
- The second call returns 0
> A stream can be consumed only once.

? Which pipeline terminates?
+ Stream.iterate(1, n -> n + 1).takeWhile(n -> n < 10).toList()
- Stream.iterate(1, n -> n + 1).filter(n -> n < 10).toList()
- Stream.generate(() -> 1).sorted().findFirst()
> takeWhile stops at the first failure; filter keeps searching forever, and sorted needs the infinite input first.
```

## Key takeaways

- A stream is a **lazy, single-use pipeline** over a source: **source → intermediate operations → one terminal operation**. It stores nothing and never modifies its source.
- Processing is **vertical and fused**: each element flows through all stages before the next one starts.
- **Short-circuiting** operations (`limit`, `findFirst`, `anyMatch`, `takeWhile`) stop early and make infinite streams usable. **`sorted` and `distinct` are stateful**.
- Under the hood: pipeline stages, **flags** (`SIZED`, `SORTED`, `DISTINCT`) and a **chain of sinks** driven by a spliterator. Flags let the library skip work, even `peek` before `count()`.
- Keep lambdas side-effect-free, don't touch the source, don't reuse streams, and close file-backed streams.
