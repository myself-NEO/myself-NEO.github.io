## Concept explanation

### Primitive streams

`Stream<Integer>` holds `Integer` *objects*. For numeric work, Java provides three specialised streams that hold primitives directly:

| Stream | Element | Created by |
|---|---|---|
| `IntStream` | `int` | `IntStream.range/rangeClosed/of`, `"text".chars()`, `mapToInt` |
| `LongStream` | `long` | `LongStream.rangeClosed`, `mapToLong`, `asLongStream()` |
| `DoubleStream` | `double` | `mapToDouble`, `random.doubles()` |

They add numeric terminal operations that `Stream<T>` lacks:
- `sum()`;
- `average()`, which returns an `OptionalDouble` (empty for an empty stream);
- `min()`/`max()`, which return `OptionalInt` etc.;
- `summaryStatistics()`, giving count, sum, min, average and max in a single pass.

Converting between object and primitive streams:

```text title="Converting between stream types"
Stream<String> → IntStream     words.mapToInt(String::length)
IntStream → Stream<Integer>    ints.boxed()
IntStream → Stream<String>     ints.mapToObj(i -> "#" + i)
IntStream → LongStream         ints.asLongStream()      // widen before summing big values
```

**Watch the overflow.** `IntStream.sum()` returns an `int` and wraps silently. The sum of 1..100,000 (5,000,050,000) doesn't fit. Use `asLongStream().sum()` or `mapToLong`.

**Why bother?** `Stream<Integer>.reduce(0, Integer::sum)` unboxes two values and boxes a result for every element, and each boxed value above 127 is a new heap object. Primitive streams do no boxing, store contiguous primitive values in their buffers, and give the JIT simple loops to optimise.

### Parallel streams

`collection.parallelStream()` or `stream.parallel()` asks the library to split the work across threads. The pipeline code doesn't change:

```java
long count = hugeList.parallelStream().filter(this::isValid).count();
```

How it works, in one line: the source's **`Spliterator`** splits the data into chunks, the chunks run as **fork/join tasks** on the **common `ForkJoinPool`**, and the partial results are combined.

### When parallel helps, and when it hurts

Parallelism has fixed costs: splitting, scheduling tasks, merging results, and coordinating order. It pays off only when there is enough work per element times elements. A rough heuristic, the **NQ model**: N (elements) × Q (cost per element) should exceed about **10,000** before you even try, and then you **measure**.

| Helps | Hurts |
|---|---|
| large N, CPU-heavy Q (parsing, crypto, math) | small collections, cheap operations |
| sources that split evenly: `ArrayList`, arrays, `IntStream.range`, `HashMap` key sets | `LinkedList`, `Stream.iterate`, `BufferedReader.lines()`, I/O sources |
| stateless, independent operations | `sorted`, `distinct`, `limit`/`skip`/`findFirst` on **ordered** streams |
| reductions that combine cheaply (`sum`, `count`, `toList`) | merging large maps (`groupingBy`); use `groupingByConcurrent` |
| a batch job with idle cores | web servers where every core is already busy with requests |
| | **blocking I/O** in the pipeline: it starves the shared common pool |

**Correctness rules get stricter in parallel:**
- No shared mutable state: no adding to an outside `ArrayList`, no `total[0] += x`.
- Associative reductions with true identities.
- `forEach` runs in **any order**; use `forEachOrdered` if the order matters.
- `findAny` may return any match; `findFirst` keeps order, at a cost.

## Internal working

- **`Spliterator`** ("splittable iterator") is the interface behind every stream source. It provides:
  - `tryAdvance` and `forEachRemaining` to traverse the elements;
  - `trySplit()`, which hands off a prefix of the remaining elements as a new spliterator (or returns `null` if it can't split);
  - `estimateSize()`;
  - `characteristics()` such as `SIZED`, `SUBSIZED`, `ORDERED` and `IMMUTABLE`.
- **How well sources split:**
  - **`ArrayList`, arrays and `IntStream.range`** split in half in O(1), into exactly sized pieces: ideal.
  - **`LinkedList`** can't jump to the middle, so `trySplit` copies a *batch* of elements (starting at 1,024 and growing) into an array. A list of 1,000 elements "splits" into 1,000 + 0, and no parallelism happens.
  - **`Stream.iterate` and I/O sources** have unknown size and must be consumed sequentially to split. They are poor parallel sources.
- **Execution**: the terminal operation creates a root `AbstractTask`, a `CountedCompleter`, which is a kind of `ForkJoinTask`. It splits recursively while chunks are larger than `size / (4 × parallelism)`, forks one half and computes the other, and at the leaves runs the normal sequential sink chain. Results are combined on the way back up: the combiner for `collect`, the operator for `reduce`, concatenation for `toList`.
- **The common pool** is shared by the whole JVM: every parallel stream and `CompletableFuture.*Async` call without an executor uses it.
  - Its parallelism defaults to **number of CPUs − 1**, because the **calling thread also works**.
  - It's configurable with `-Djava.util.concurrent.ForkJoinPool.common.parallelism=N`, and in containers it follows the CPU limit.
  - Idle workers **steal** queued tasks from busy ones (work stealing).
  - Running a parallel stream inside your own `ForkJoinPool` (`pool.submit(() -> list.parallelStream()...).get()`) makes it use that pool. This is a well-known *implementation behaviour*, not a documented guarantee.
- **Order-sensitive operations in parallel**:
  - `limit(n)` on an ordered parallel stream must keep each chunk's results until it knows which ones come first.
  - `findFirst` must wait for earlier chunks.
  - `unordered()` drops that constraint when order doesn't matter.

## Visual representation

```text title="A parallel sum over IntStream.range(0, 8) with 2 workers + the caller"
                       [0..8)  root task (caller thread)
                      /       \
                 [0..4)        [4..8)        trySplit() halves SIZED sources in O(1)
                 /    \        /    \
             [0,2)  [2,4)  [4,6)  [6,8)      leaves run the normal sequential sink chain
               1      5      9     13        (worker-1, caller, worker-2 ... + work stealing)
                \    /        \    /
                  6             22            combine partial results on the way up
                    \         /
                        28

  LinkedList(1000).spliterator().trySplit()  ->  copies a batch of up to 1024 into an array
                                              ->  prefix 1000 elements, remainder 0: nothing to share
```

## Java code example

```java title="PrimitiveParallel.java" file="PrimitiveParallel.java" run="-Djava.util.concurrent.ForkJoinPool.common.parallelism=3"
import java.util.ArrayList;
import java.util.IntSummaryStatistics;
import java.util.LinkedList;
import java.util.List;
import java.util.Set;
import java.util.Spliterator;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ForkJoinPool;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import java.util.stream.LongStream;
import java.util.stream.Stream;

public class PrimitiveParallel {
    public static void main(String[] args) {
        // 1. Primitive streams: numeric terminal operations, no boxing
        IntSummaryStatistics stats = IntStream.of(4, 8, 15, 16, 23, 42).summaryStatistics();
        System.out.println("stats            " + stats);
        System.out.println("empty average    " + IntStream.empty().average());
        System.out.println("chars            " + "Java".chars().mapToObj(c -> String.valueOf((char) c)).collect(Collectors.joining("-")));
        System.out.println("boxed / mapToObj " + IntStream.rangeClosed(1, 3).boxed().toList() + " " + IntStream.rangeClosed(1, 3).mapToObj(i -> "#" + i).toList());
        System.out.println("mapToInt sum     " + Stream.of("a", "bb", "ccc").mapToInt(String::length).sum());

        // 2. IntStream.sum() overflows silently
        System.out.println("int sum          " + IntStream.rangeClosed(1, 100_000).sum());
        System.out.println("long sum         " + IntStream.rangeClosed(1, 100_000).asLongStream().sum());

        // 3. Same answer, very different work: boxed vs primitive
        long boxed = Stream.iterate(1L, n -> n + 1).limit(1_000).reduce(0L, Long::sum);
        long primitive = LongStream.rangeClosed(1, 1_000).sum();
        System.out.println("boxed == prim    " + (boxed == primitive) + " (" + primitive + ")");

        // 4. Parallel streams run on the common ForkJoinPool (set to 3 by the JVM flag)
        System.out.println("pool parallelism " + ForkJoinPool.getCommonPoolParallelism());
        Set<String> threads = ConcurrentHashMap.newKeySet();
        long sum = LongStream.rangeClosed(1, 2_000_000).parallel()
                .peek(n -> threads.add(Thread.currentThread().getName()))
                .sum();
        long workers = threads.stream().filter(t -> t.startsWith("ForkJoinPool.commonPool-worker")).count();
        System.out.println("parallel sum     " + sum + ", caller helped: " + threads.contains("main") + ", workers <= 3: " + (workers <= 3));

        // 5. Ordering guarantees
        List<Integer> seen = new ArrayList<>();
        IntStream.range(0, 20).parallel().boxed().forEachOrdered(seen::add);   // ordered, one at a time
        System.out.println("forEachOrdered   in order: " + seen.equals(IntStream.range(0, 20).boxed().toList()));
        System.out.println("toList           " + IntStream.range(0, 10).parallel().map(i -> i * i).boxed().toList());
        System.out.println("findFirst        " + IntStream.range(0, 1_000).parallel().filter(i -> i % 2 == 0 && i > 10).findFirst().getAsInt());

        // 6. Shared mutable state breaks; collect does not
        boolean broken = false;
        for (int attempt = 0; attempt < 50 && !broken; attempt++) {
            List<Integer> unsafe = new ArrayList<>();
            try {
                IntStream.range(0, 100_000).parallel().forEach(unsafe::add);
                broken = unsafe.size() != 100_000;
            } catch (RuntimeException e) {          // ArrayIndexOutOfBoundsException is also possible
                broken = true;
            }
        }
        System.out.println("shared ArrayList lost or corrupted elements: " + broken);
        System.out.println("collect size     " + IntStream.range(0, 100_000).parallel().boxed().collect(Collectors.toList()).size());

        // 7. Why the source matters: how a first trySplit divides 1000 elements
        List<Integer> data = IntStream.range(0, 1_000).boxed().toList();
        report("ArrayList ", new ArrayList<>(data));
        report("LinkedList", new LinkedList<>(data));
        Spliterator<Integer> iterate = Stream.iterate(0, i -> i + 1).spliterator();
        System.out.println("Stream.iterate   estimateSize " + iterate.estimateSize() + ", SIZED " + iterate.hasCharacteristics(Spliterator.SIZED));
    }

    static void report(String name, List<Integer> list) {
        Spliterator<Integer> rest = list.spliterator();
        Spliterator<Integer> prefix = rest.trySplit();
        System.out.println(name + "       split -> " + (prefix == null ? 0 : prefix.estimateSize()) + " + " + rest.estimateSize());
    }
}
```

## Output

```text title="Output" output="PrimitiveParallel.java"
stats            IntSummaryStatistics{count=6, sum=108, min=4, average=18.000000, max=42}
empty average    OptionalDouble.empty
chars            J-a-v-a
boxed / mapToObj [1, 2, 3] [#1, #2, #3]
mapToInt sum     6
int sum          705082704
long sum         5000050000
boxed == prim    true (500500)
pool parallelism 3
parallel sum     2000001000000, caller helped: true, workers <= 3: true
forEachOrdered   in order: true
toList           [0, 1, 4, 9, 16, 25, 36, 49, 64, 81]
findFirst        12
shared ArrayList lost or corrupted elements: true
collect size     100000
ArrayList        split -> 500 + 500
LinkedList       split -> 1000 + 0
Stream.iterate   estimateSize 9223372036854775807, SIZED false
```

- `IntStream.sum()` overflowed to 705082704. The `long` version gives the real 5,000,050,000.
- The boxed and primitive pipelines agree, but the boxed one created over a thousand `Long` objects along the way.
- With parallelism 3, the parallel sum ran on the `main` thread **plus** at most three pool workers.
- `forEachOrdered`, `toList` and `findFirst` kept encounter order even in parallel. That costs some parallelism; `forEach`, `findAny` and `unordered()` don't keep it.
- Adding to a plain `ArrayList` from a parallel `forEach` lost elements or threw, while `collect` returned all 100,000.
- `ArrayList` split 500 + 500; `LinkedList` "split" by copying all 1,000 elements into the prefix, leaving nothing to share; `Stream.iterate` doesn't know its size at all.

## Real-world application

- **Primitive streams everywhere numbers appear**: totals, `summaryStatistics()` for monitoring dashboards, `IntStream.range` instead of index loops, `chars()` for text processing.
- **Parallel streams for CPU-bound batch work**: recomputing risk scores for millions of in-memory positions, image or matrix processing, building a large in-memory index at start-up. Benchmark with JMH, not with `System.currentTimeMillis`.
- **Not in request handlers.** A web server already uses all cores for concurrent requests. Parallel streams there compete for the same CPUs and share one JVM-wide pool with every other request.
- **Not for I/O.** Calling remote services or databases inside `parallelStream()` blocks common-pool threads. Use an executor sized for I/O, `CompletableFuture` with a dedicated executor, or virtual threads (Java 21).

## Common mistakes

- **Summing large values with `IntStream.sum()`**, which overflows silently.
- **`Stream<Integer>` for numeric pipelines**: use `mapToInt` and friends.
- **Calling `average()`, `max()` or `getAsInt()` without handling the empty case.**
- **Adding `.parallel()` "for speed" without measuring.** On small data or cheap operations it's slower.
- **Shared mutable state** from `forEach`, such as `list::add` or `map.put`. Use `collect`, `toList` or `groupingByConcurrent`.
- **Parallel streams over `LinkedList`, `Stream.iterate` or file lines.**
- **Blocking calls inside parallel pipelines**, which starve the common pool that `CompletableFuture` also uses.
- **Relying on `forEach` order or `findAny` results** in parallel.
- **Calling `.parallel()` and `.sequential()` in the same pipeline expecting per-stage control.** The *last* call wins for the whole pipeline.

## Interview questions

**Q1. Why do `IntStream`, `LongStream` and `DoubleStream` exist?**

````reveal title="Answer"
To process primitives without boxing. A `Stream<Integer>` stores `Integer` objects, and reductions unbox and rebox on every step, which costs allocations, GC pressure and pointer chasing. Primitive streams operate on `int`, `long` and `double` directly and add numeric terminals: `sum`, `average` (returning `OptionalDouble`), `min`/`max`, `summaryStatistics`. Convert with `mapToInt`, `boxed` and `mapToObj`, and widen with `asLongStream` to avoid overflow.
````

**Q2. How does a parallel stream work internally?**

````reveal title="Answer"
The source's `Spliterator` is split recursively with `trySplit()` into chunks. A tree of fork/join tasks (`CountedCompleter`s) runs on the common `ForkJoinPool`, which has CPUs − 1 workers by default plus the calling thread, and idle workers steal tasks. Each leaf runs the ordinary sequential pipeline on its chunk. Partial results are combined up the tree using the reduction's combiner or merge step. Order-sensitive operations add buffering and coordination.
````

**Q3. When would you avoid a parallel stream?**

````reveal title="Answer"
- **Too little work**: small data or cheap per-element work (N × Q well under ~10,000).
- **Sources that split badly**: `LinkedList`, `Stream.iterate`, I/O.
- **Order-dependent operations**: `limit`, `findFirst`, `sorted` on large ordered data.
- **Blocking I/O** in the pipeline, which starves the shared common pool.
- **Shared mutable state** or non-associative reductions.
- **Server code** where the cores are already busy with concurrent requests.

Always benchmark (JMH) before and after.
````

**Q4. Which thread pool do parallel streams use, and how can you change it?**

````reveal title="Answer"
The JVM-wide `ForkJoinPool.commonPool()`, whose parallelism is the number of available processors − 1 (the caller participates). It can be changed globally with `-Djava.util.concurrent.ForkJoinPool.common.parallelism=N`. To isolate a workload, a common trick is `customPool.submit(() -> list.parallelStream()...collect(...)).get()`: tasks forked from inside a ForkJoinPool run in that pool. This works in practice but isn't a documented guarantee. For I/O-bound work, use an executor instead of parallel streams.
````

**Q5. What's wrong with `list.parallelStream().forEach(result::add)` where `result` is an `ArrayList`?**

````reveal title="Answer"
`ArrayList` isn't thread-safe. Concurrent `add` calls race on its `size` field and backing array, so elements get lost or overwritten, and `ArrayIndexOutOfBoundsException` can occur during a resize. Even with a synchronised list, the order would be arbitrary and contention would kill the speed-up. Use `collect(Collectors.toList())` or `toList()`: each chunk fills its own list and the lists are concatenated in order.
````

## Hands-on exercise

The method below is meant to return the sum of squares of all multiples of 7 up to `n`, using a parallel stream. It's broken:

```java
static long brokenSum(int n) {
    long[] total = {0};
    IntStream.rangeClosed(1, n).parallel()
            .filter(i -> i % 7 == 0)
            .forEach(i -> total[0] += (long) i * i);   // read-modify-write race
    return total[0];
}
```

1. Rewrite it as `fixedSum(n)` using only stream operations (`asLongStream`, `map`, `sum`), with no shared state.
2. Compute the expected value sequentially with `LongStream` for `n = 1_000_000`, and check that `fixedSum` matches. Show that `brokenSum` gives a wrong answer at least once in 20 attempts.
3. Write `smallSquares(n)`: the squares under 1,000 of those multiples, in increasing order, computed in parallel.

````hint title="Hint"
`IntStream.rangeClosed(1, n).parallel().filter(i -> i % 7 == 0).asLongStream().map(i -> i * i).sum()`. Widening to `long` *before* squaring avoids `int` overflow (1,000,000² doesn't fit in an `int`). `toList()` keeps encounter order even when the stream is parallel.
````

````solution title="Solution"
```java title="ParallelFix.java" file="ParallelFix.java"
import java.util.List;
import java.util.stream.IntStream;
import java.util.stream.LongStream;

public class ParallelFix {
    static long brokenSum(int n) {
        long[] total = {0};
        IntStream.rangeClosed(1, n).parallel()
                .filter(i -> i % 7 == 0)
                .forEach(i -> total[0] += (long) i * i);          // races: lost updates
        return total[0];
    }

    static long fixedSum(int n) {
        return IntStream.rangeClosed(1, n).parallel()
                .filter(i -> i % 7 == 0)
                .asLongStream()                                    // widen first: no int overflow
                .map(i -> i * i)
                .sum();                                            // per-chunk sums, then combined
    }

    static List<Integer> smallSquares(int n) {
        return IntStream.rangeClosed(1, n).parallel()
                .filter(i -> i % 7 == 0)
                .map(i -> i * i)
                .takeWhile(sq -> sq < 1_000)                       // input is increasing, so a prefix
                .boxed()
                .toList();                                         // keeps encounter order
    }

    public static void main(String[] args) {
        int n = 1_000_000;
        long expected = LongStream.rangeClosed(1, n).filter(i -> i % 7 == 0).map(i -> i * i).sum();
        System.out.println("sequential   " + expected);
        System.out.println("fixed equal  " + (fixedSum(n) == expected));

        boolean wrong = false;
        for (int attempt = 0; attempt < 20 && !wrong; attempt++) {
            wrong = brokenSum(n) != expected;
        }
        System.out.println("broken wrong at least once: " + wrong);
        System.out.println("small squares " + smallSquares(n));
    }
}
```

```text title="Output" output="ParallelFix.java"
sequential   47619404762214285
fixed equal  true
broken wrong at least once: true
small squares [49, 196, 441, 784]
```

`total[0] += x` is a read-modify-write: two threads read the same old total, and one update is lost. The fixed version has no shared state: each chunk sums privately, and the partial sums are added together.

`takeWhile` is correct here because the squares are increasing, but on a parallel ordered stream it has to buffer. `filter(sq -> sq < 1_000)` would give the same list here, but it would scan all million numbers.
````

## Knowledge check

```quiz
? What does IntStream.rangeClosed(1, 100_000).sum() return?
+ A wrong, overflowed int
- 5000050000
- It throws ArithmeticException
> int arithmetic wraps silently; use asLongStream().sum().

? What does IntStream.empty().average() return?
+ OptionalDouble.empty
- 0.0
- NaN
> average() returns an OptionalDouble because an empty stream has no average.

? Which source is the best fit for a parallel stream?
+ An ArrayList with a million elements
- A LinkedList with a million elements
- BufferedReader.lines()
> ArrayList splits in half in O(1); the others must be traversed sequentially to split.

? By default, which threads execute a parallel stream?
+ The common ForkJoinPool workers plus the calling thread
- A new thread per element
- A fixed pool of 10 threads created per stream
> Parallelism defaults to the number of CPUs minus 1, because the caller participates.

? Which terminal operation keeps encounter order in a parallel stream?
+ forEachOrdered
- forEach
- findAny
> forEach and findAny trade order for speed.
```

## Key takeaways

- **`IntStream`/`LongStream`/`DoubleStream`** avoid boxing and add `sum`, `average`, `summaryStatistics`. **Mind `int` overflow**, and handle empty `Optional*` results.
- **Parallel streams** split the source with a **`Spliterator`**, run fork/join tasks on the **common `ForkJoinPool`** (CPUs − 1 workers + the caller) and combine the partial results.
- They help only for **large N × costly Q** on **well-splitting sources** with stateless operations and cheap combines. **Measure.**
- Avoid shared mutable state, blocking I/O, `LinkedList`/`iterate` sources and order-heavy operations in parallel. Use `collect`/`toList` and `forEachOrdered` when order matters.
