## Concept explanation

This lesson is a tour of the operations you'll use daily. The examples use an `Order` with a list of `Line`s.

### Intermediate operations

| Operation | What it does | Notes |
|---|---|---|
| `filter(Predicate)` | keeps matching elements | stateless |
| `map(Function)` | transforms each element 1 → 1 | `mapToInt`/`mapToLong`/`mapToDouble` give primitive streams |
| `flatMap(Function<T, Stream<R>>)` | transforms each element into **0..n** elements and flattens them | "a stream of streams" becomes one stream |
| `mapMulti(BiConsumer<T, Consumer<R>>)` (Java 16) | pushes 0..n results per element | no inner stream object; good for small or conditional expansions |
| `distinct()` | removes duplicates using `equals`/`hashCode` | stateful; keeps the **first** occurrence in ordered streams |
| `sorted()` / `sorted(Comparator)` | sorts | stateful barrier; **stable** for ordered streams |
| `limit(n)` / `skip(n)` | first n / all but the first n | `limit` short-circuits; together they give pagination |
| `takeWhile(p)` / `dropWhile(p)` (Java 9) | take or skip the **prefix** that matches | stops at the first failing element, unlike `filter` |
| `peek(Consumer)` | sees each element as it passes | for debugging only; may be skipped |
| `boxed()` | `IntStream` → `Stream<Integer>` | |

**`map` vs `flatMap`.** With `orders.stream().map(Order::lines)` you get a `Stream<List<Line>>`, one list per order. With `flatMap(o -> o.lines().stream())` you get a `Stream<Line>`: every line of every order in a single stream. Use `flatMap` whenever each element *contains* a collection you want to process as part of the whole.

### Terminal operations

| Operation | Result | Short-circuits? |
|---|---|---|
| `forEach(Consumer)` / `forEachOrdered` | side effect | no |
| `toList()` (Java 16), `collect(...)`, `toArray(...)` | a container | no |
| `reduce(...)` | a single combined value | no |
| `count()`, `min(Comparator)`, `max(Comparator)` | long / `Optional` | no |
| `findFirst()` / `findAny()` | `Optional` | **yes** |
| `anyMatch` / `allMatch` / `noneMatch` | boolean | **yes** |

### `reduce` in three forms

```java
T reduce(T identity, BinaryOperator<T> accumulator)                 // sum: reduce(0, Integer::sum)
Optional<T> reduce(BinaryOperator<T> accumulator)                   // no identity: empty stream -> Optional.empty()
<U> U reduce(U identity, BiFunction<U, ? super T, U> accumulator,   // result type differs from element type
             BinaryOperator<U> combiner)                            // combiner merges partial results (parallel)
```

The rules:
- **Associative accumulator**: `(a + b) + c == a + (b + c)`, so that chunks can be reduced independently.
- **True identity**: `combine(identity, x) == x`. That means 0 for sum, 1 for product, `""` for concatenation. A "starting value" such as 10 is *not* an identity. It works sequentially by accident, but in parallel it is added once per chunk.

For mutable containers (lists, maps, `StringBuilder`) use **`collect`**, not `reduce`; that's the next lesson.

### Find and match

- **`findFirst()`** respects encounter order. **`findAny()`** may return any element, which is cheaper in parallel. Both return `Optional`.
- **`anyMatch`** stops at the first `true`; **`allMatch`** and **`noneMatch`** stop at the first counter-example.
- On an **empty stream**: `anyMatch` is `false`, `allMatch` is `true` and `noneMatch` is `true`. This is *vacuous truth*: no element breaks the rule.

## Internal working

- **`filter`/`map`** become `StatelessOp` stages whose sinks call `downstream.accept(...)` conditionally or with a mapped value. They do no buffering.
- **`flatMap`** opens the inner stream for each element and pushes its elements downstream. Since Java 10 it also honours cancellation inside inner streams, so `flatMap(...).findFirst()` no longer drains a whole inner stream. `mapMulti` avoids creating that inner `Stream` object at all.
- **`distinct`** keeps a `HashSet` of seen elements (a `LinkedHashSet` when it must preserve order in parallel). **`sorted`** buffers into an array and sorts it with `Arrays.sort`/TimSort, which is stable, then pushes elements in `end()`.
- **`limit`** decrements a counter and requests cancellation when it reaches zero. In **parallel ordered** streams, `limit`/`skip` must coordinate across chunks to respect order, which can be expensive. `unordered()` lifts that constraint.
- **`reduce`** sequentially is a plain loop: `result = acc.apply(result, element)`. In parallel, each chunk starts from `identity`, and the chunk results are merged with the combiner. That's why a fake identity adds itself once per chunk.
- **`takeWhile`** on an ordered parallel stream must buffer to find the correct prefix, so it is costly in parallel.
- **Ordering**: `forEach` doesn't guarantee encounter order in parallel streams; `forEachOrdered` does, at the cost of some parallelism. `sorted` makes the stream `ORDERED`; `HashSet.stream()` has no defined order.

## Visual representation

```text title="map vs flatMap, and reduce with a combiner"
  orders:  o1[pen, desk]   o2[mouse]   o3[pen, lamp]   o4[]

  map(Order::lines)                      flatMap(o -> o.lines().stream())
  Stream<List<Line>>                     Stream<Line>
  [ [pen, desk], [mouse], [pen, lamp], [] ]   [ pen, desk, mouse, pen, lamp ]

  parallel reduce(0, accumulator, combiner) over 1..8:
      chunk A: 0+1+2+3+4 = 10        chunk B: 0+5+6+7+8 = 26
                    \                     /
                     combiner(10, 26) = 36
  with a fake identity of 10: chunk A = 20, chunk B = 36 -> 56, not 46  (one extra 10 per chunk)
```

## Java code example

```java title="StreamOps.java" file="StreamOps.java"
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.stream.IntStream;
import java.util.stream.Stream;

public class StreamOps {
    record Line(String product, int qty, int priceCents) {
        int total() {
            return qty * priceCents;
        }
    }

    record Order(String id, String customer, List<Line> lines, boolean paid) {
        int total() {
            return lines.stream().mapToInt(Line::total).sum();
        }
    }

    public static void main(String[] args) {
        List<Order> orders = List.of(
                new Order("o1", "ada", List.of(new Line("pen", 3, 150), new Line("desk", 1, 30_000)), true),
                new Order("o2", "linus", List.of(new Line("mouse", 2, 2_500)), false),
                new Order("o3", "ada", List.of(new Line("pen", 10, 150), new Line("lamp", 1, 4_000)), true),
                new Order("o4", "grace", List.of(), true));

        // filter + map
        System.out.println("paid ids          " + orders.stream().filter(Order::paid).map(Order::id).toList());

        // map vs flatMap
        List<List<Line>> nested = orders.stream().map(Order::lines).toList();
        List<String> products = orders.stream().flatMap(o -> o.lines().stream()).map(Line::product).toList();
        System.out.println("map gives         " + nested.size() + " lists");
        System.out.println("flatMap gives     " + products);

        // distinct, sorted, skip + limit
        System.out.println("distinct sorted   " + products.stream().distinct().sorted().toList());
        System.out.println("longest first     " + products.stream().distinct()
                .sorted(Comparator.comparingInt(String::length).reversed().thenComparing(Comparator.naturalOrder()))
                .toList());
        System.out.println("page 2, size 2    " + IntStream.rangeClosed(1, 7).boxed().skip(2).limit(2).toList());

        // takeWhile / dropWhile work on the prefix; filter looks at everything
        List<Integer> temps = List.of(12, 14, 17, 21, 19, 23, 16);
        System.out.println("takeWhile < 20    " + temps.stream().takeWhile(t -> t < 20).toList());
        System.out.println("dropWhile < 20    " + temps.stream().dropWhile(t -> t < 20).toList());
        System.out.println("filter < 20       " + temps.stream().filter(t -> t < 20).toList());

        // mapMulti (Java 16): zero or more results per element, no inner stream
        List<String> bulk = orders.stream().<String>mapMulti((order, downstream) -> {
            for (Line line : order.lines()) {
                if (line.qty() > 1) {
                    downstream.accept(order.id() + ":" + line.product() + "x" + line.qty());
                }
            }
        }).toList();
        System.out.println("mapMulti          " + bulk);

        // reduce, three forms
        int revenue = orders.stream().flatMap(o -> o.lines().stream()).map(Line::total).reduce(0, Integer::sum);
        Optional<Line> priciest = orders.stream().flatMap(o -> o.lines().stream())
                .reduce((a, b) -> a.total() >= b.total() ? a : b);
        int lineCount = orders.stream().reduce(0, (count, o) -> count + o.lines().size(), Integer::sum);
        System.out.println("revenue (cents)   " + revenue);
        System.out.println("priciest line     " + priciest.orElseThrow());
        System.out.println("line count        " + lineCount);
        System.out.println("reduce of empty   " + Stream.<Integer>empty().reduce(Integer::sum));

        // A starting value is not an identity
        System.out.println("reduce(10) seq    " + Stream.of(1, 2, 3, 4).reduce(10, Integer::sum));
        System.out.println("reduce(10) par    " + Stream.of(1, 2, 3, 4).parallel().reduce(10, Integer::sum));

        // min / max / count
        System.out.println("largest order     " + orders.stream().max(Comparator.comparingInt(Order::total)).map(Order::id).orElse("-"));
        System.out.println("paid count        " + orders.stream().filter(Order::paid).count());

        // find and match (short-circuiting)
        System.out.println("first unpaid      " + orders.stream().filter(o -> !o.paid()).findFirst().map(Order::id).orElse("none"));
        System.out.println("any empty order   " + orders.stream().anyMatch(o -> o.lines().isEmpty()));
        System.out.println("all ids start o   " + orders.stream().allMatch(o -> o.id().startsWith("o")));
        System.out.println("no negative qty   " + orders.stream().flatMap(o -> o.lines().stream()).noneMatch(l -> l.qty() < 0));
        System.out.println("empty: all/any    " + Stream.<Order>empty().allMatch(o -> false) + " / " + Stream.<Order>empty().anyMatch(o -> true));

        // toArray with a generator, and peek for debugging
        String[] ids = orders.stream().map(Order::id).toArray(String[]::new);
        System.out.println("toArray           " + ids.length + " ids");
        List<String> adas = orders.stream()
                .peek(o -> System.out.println("  peek " + o.id()))
                .filter(o -> o.customer().equals("ada"))
                .map(Order::id)
                .toList();
        System.out.println("ada's orders      " + adas);
    }
}
```

## Output

```text title="Output" output="StreamOps.java"
paid ids          [o1, o3, o4]
map gives         4 lists
flatMap gives     [pen, desk, mouse, pen, lamp]
distinct sorted   [desk, lamp, mouse, pen]
longest first     [mouse, desk, lamp, pen]
page 2, size 2    [3, 4]
takeWhile < 20    [12, 14, 17]
dropWhile < 20    [21, 19, 23, 16]
filter < 20       [12, 14, 17, 19, 16]
mapMulti          [o1:penx3, o2:mousex2, o3:penx10]
revenue (cents)   40950
priciest line     Line[product=desk, qty=1, priceCents=30000]
line count        5
reduce of empty   Optional.empty
reduce(10) seq    20
reduce(10) par    50
largest order     o1
paid count        3
first unpaid      o2
any empty order   true
all ids start o   true
no negative qty   true
empty: all/any    true / false
toArray           4 ids
  peek o1
  peek o2
  peek o3
  peek o4
ada's orders      [o1, o3]
```

- `map(Order::lines)` produced four lists (one is empty). `flatMap` produced five `Line`s; the empty order contributed nothing.
- `distinct` kept the first `pen`. The custom comparator sorted by length, longest first, breaking ties alphabetically.
- `takeWhile` stopped at 21, the first value ≥ 20, while `filter` also kept 19 and 16 from later in the list. `dropWhile` returned everything from 21 onwards.
- The three-argument `reduce` changed the type, folding `Order`s into an `int`, so it needed a combiner.
- With 10 as a fake identity, the sequential reduce gave 20 (10 + 1 + 2 + 3 + 4). The parallel one gave 50: each of the four chunks started from 10. The exact wrong number depends on how the stream was split.
- On empty streams, `allMatch` returned `true` and `anyMatch` returned `false`.

## Real-world application

- **flatMap**: order lines across orders, permissions across a user's roles, files across directories (`dirs.stream().flatMap(d -> list(d))`), and unwrapping `Optional`s with `flatMap(Optional::stream)`.
- **sorted + limit**: "top 10 products by revenue", leaderboards, the latest N events.
- **skip + limit**: simple in-memory pagination of an already-loaded list. Paginate in the database for large data.
- **anyMatch / allMatch**: validation ("all lines have positive quantity"), permission checks ("any role grants ADMIN"), with early exit.
- **takeWhile / dropWhile**: sorted time series ("events until the cutoff"), skipping a file's header lines.
- **reduce**: combining immutable values such as `BigDecimal::add` totals, merging configuration objects, or composing functions.

## Common mistakes

- **Using `map` when you need `flatMap`**, which leaves you with `Stream<List<X>>` or `Stream<Stream<X>>`.
- **A wrong identity in `reduce`**, such as `reduce(10, Integer::sum)` or `reduce(1, Integer::sum)`. Add the starting value after the reduction instead.
- **Using `reduce` to build collections** (`reduce(new ArrayList<>(), ...)` that mutates the list). It's wrong in parallel and wasteful sequentially. Use `collect`.
- **Using `findAny` and expecting the first element.** In parallel it can differ.
- **Using `takeWhile` on unordered data** (for example `HashSet.stream()`). The "prefix" is then meaningless.
- **Sorting the whole stream to get the minimum**: `sorted().findFirst()` is O(n log n), while `min(comparator)` is O(n).
- **Computing `count()` or `size()` only to test emptiness.** `anyMatch`/`findAny().isPresent()` stop at the first match.
- **Expecting `distinct` to use a comparator.** It uses `equals`/`hashCode`. For "distinct by key", use `Collectors.toMap` with a merge function, or a seen-keys set (sequential only).

## Interview questions

**Q1. What's the difference between `map` and `flatMap`?**

````reveal title="Answer"
`map` transforms each element into exactly one result, so a function returning a list gives you a `Stream<List<T>>`. `flatMap` expects a function returning a `Stream` and concatenates those streams into one, turning one-to-many into a flat stream. Example: `orders.stream().flatMap(o -> o.lines().stream())` gives every line of every order. `Optional.flatMap` applies the same idea to optionals.
````

**Q2. What are the requirements on the identity and the accumulator of `reduce`?**

````reveal title="Answer"
The accumulator (and combiner) must be associative, non-interfering and stateless. The identity must be a true identity for the combiner: `combiner.apply(identity, x).equals(x)`. In a parallel stream every chunk starts from the identity, so a non-identity seed is applied once per chunk. `Stream.of(1, 2, 3, 4).parallel().reduce(10, Integer::sum)` can give 50 instead of 20. With a type-changing reduce, the combiner must also be compatible with the accumulator.
````

**Q3. `takeWhile` vs `filter`?**

````reveal title="Answer"
`filter` tests every element and keeps all matches, wherever they appear. `takeWhile` keeps elements only while the predicate holds and stops at the first failure; it's short-circuiting and works on infinite streams. For `[12, 14, 21, 19]` with `< 20`, `filter` gives `[12, 14, 19]` and `takeWhile` gives `[12, 14]`. `takeWhile` only makes sense on ordered streams.
````

**Q4. What do `allMatch`, `anyMatch` and `noneMatch` return on an empty stream?**

````reveal title="Answer"
`allMatch` → `true` and `noneMatch` → `true` (no element violates the condition: vacuous truth). `anyMatch` → `false` (no element satisfies it). Validation code like `items.stream().allMatch(Item::isValid)` therefore passes for an empty list, so check emptiness separately if that matters.
````

**Q5. `findFirst` vs `findAny`?**

````reveal title="Answer"
`findFirst` returns the first element in encounter order. In a parallel stream it must wait for earlier chunks, which limits parallelism. `findAny` may return any matching element, so in parallel it returns whichever chunk finds one first. Sequentially both usually return the first element, but only `findFirst` guarantees it. Use `findAny` when you don't care which element you get.
````

## Hands-on exercise

Given a few sentences, write a `words(sentences)` helper that returns a fresh `Stream<String>` of lower-case words: split on anything that isn't a letter or apostrophe, and drop empty strings. Then print:

1. the total word count and the number of distinct words;
2. the five longest distinct words with more than three letters, longest first, ties alphabetical;
3. the longest word using `reduce`, keeping the first one on ties;
4. the first word starting with `q` (`findFirst`), and whether all words are lower-case (`allMatch`);
5. the total number of letters (`mapToInt` + `sum`).

````hint title="Hint"
`sentences.stream().flatMap(s -> Arrays.stream(s.toLowerCase().split("[^a-z']+"))).filter(w -> !w.isEmpty())`. Each question consumes a stream, so call `words(...)` again each time. For ties in `reduce`, return the accumulator unless the new word is strictly longer.
````

````solution title="Solution"
```java title="WordStats.java" file="WordStats.java"
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

public class WordStats {
    static Stream<String> words(List<String> sentences) {
        return sentences.stream()
                .flatMap(s -> Arrays.stream(s.toLowerCase().split("[^a-z']+")))
                .filter(w -> !w.isEmpty());
    }

    public static void main(String[] args) {
        List<String> sentences = List.of(
                "Streams make bulk operations declarative.",
                "Lambdas make streams concise; streams make code readable!",
                "Quick reviews keep code quality high.");

        System.out.println("words: " + words(sentences).count() + ", distinct: " + words(sentences).distinct().count());

        List<String> longest = words(sentences)
                .filter(w -> w.length() > 3)
                .distinct()
                .sorted(Comparator.comparingInt(String::length).reversed().thenComparing(Comparator.naturalOrder()))
                .limit(5)
                .toList();
        System.out.println("five longest: " + longest);

        String champion = words(sentences).reduce((a, b) -> b.length() > a.length() ? b : a).orElse("-");
        System.out.println("longest via reduce: " + champion);

        System.out.println("first q-word: " + words(sentences).filter(w -> w.startsWith("q")).findFirst().orElse("none"));
        System.out.println("all lower-case: " + words(sentences).allMatch(w -> w.equals(w.toLowerCase())));
        System.out.println("letters: " + words(sentences).mapToInt(String::length).sum());
    }
}
```

```text title="Output" output="WordStats.java"
words: 19, distinct: 14
five longest: [declarative, operations, readable, concise, lambdas]
longest via reduce: declarative
first q-word: quick
all lower-case: true
letters: 115
```

Every statistic rebuilds the stream from `words(...)`, which is cheap because nothing runs until a terminal operation. Reading from a file instead, you'd collect the words to a list once and stream that list, rather than re-reading the file.
````

## Knowledge check

```quiz
? orders.stream().map(o -> o.lines()) has which type, if lines() returns List<Line>?
+ Stream<List<Line>>
- Stream<Line>
- List<Line>
> Use flatMap(o -> o.lines().stream()) to get Stream<Line>.

? What does Stream.of(5, 1, 7, 2).takeWhile(n -> n > 3).toList() return?
+ [5]
- [5, 7]
- [1, 2]
> takeWhile stops at the first element that fails: 1.

? Which reduce call is safe in parallel for summing?
+ reduce(0, Integer::sum)
- reduce(1, Integer::sum)
- reduce(10, Integer::sum)
> Only 0 is an identity for addition.

? What does Stream.empty().allMatch(x -> false) return?
+ true
- false
- It throws NoSuchElementException
> No element violates the predicate, so allMatch is vacuously true.

? Which is the cheapest way to get the smallest element?
+ min(comparator)
- sorted(comparator).findFirst()
- sorted(comparator).toList().get(0)
> min is a single O(n) pass; sorting is O(n log n) and buffers everything.
```

## Key takeaways

- **filter / map / flatMap** form the core. `flatMap` (or `mapMulti`) flattens one-to-many relations.
- **distinct** uses `equals`/`hashCode` and keeps the first occurrence; **sorted** is a stable barrier; **skip + limit** paginates; **takeWhile / dropWhile** act on the prefix.
- **reduce** needs an associative function and a **true identity**. A seed value breaks parallel results. Use the three-argument form when the result type differs, and use `collect` for mutable containers.
- **findFirst / findAny / anyMatch / allMatch / noneMatch** short-circuit. On an empty stream, `allMatch` and `noneMatch` are `true`.
- `peek` is for debugging; `min`/`max` beat sorting; `findAny` doesn't promise the first element.
