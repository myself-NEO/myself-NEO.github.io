## Concept explanation

### `collect` and the `Collector` abstraction

`reduce` combines elements into one *immutable* value. Most real results are *containers*: a list, a map of lists, a string, statistics. **`collect(Collector)`** performs a **mutable reduction**: it creates a container, accumulates elements into it, and (in parallel) merges partial containers.

A `Collector<T, A, R>` is a recipe of four functions plus some flags:

| Part | Type | Example for `toList()` |
|---|---|---|
| `supplier` | `Supplier<A>`: create an empty container | `ArrayList::new` |
| `accumulator` | `BiConsumer<A, T>`: add one element | `List::add` |
| `combiner` | `BinaryOperator<A>`: merge two partial containers (parallel) | `(a, b) -> { a.addAll(b); return a; }` |
| `finisher` | `Function<A, R>`: convert to the final result | identity (or wrap as unmodifiable) |
| `characteristics` | `IDENTITY_FINISH`, `UNORDERED`, `CONCURRENT` | `IDENTITY_FINISH` |

The **`Collectors`** class provides ready-made collectors. They're usually statically imported: `import static java.util.stream.Collectors.*;`.

### The catalogue

| Goal | Collector |
|---|---|
| a list | `Stream.toList()` (Java 16), `toList()`, `toUnmodifiableList()` (Java 10) |
| a set / a specific collection | `toSet()`, `toUnmodifiableSet()`, `toCollection(TreeSet::new)` |
| a single string | `joining()`, `joining(", ")`, `joining(", ", "[", "]")` |
| a map | `toMap(keyFn, valueFn)`, `+ mergeFn`, `+ mapSupplier` |
| groups | `groupingBy(classifier)`, `+ downstream`, `+ mapFactory` |
| two groups (true/false) | `partitioningBy(predicate)`, `+ downstream` |
| numbers | `counting()`, `summingInt`, `averagingDouble`, `summarizingInt` (count/sum/min/avg/max) |
| extremes | `minBy(comparator)`, `maxBy(comparator)` (return `Optional`) |
| adapt a downstream | `mapping(fn, downstream)`, `filtering(pred, downstream)` (Java 9), `flatMapping` (Java 9) |
| post-process | `collectingAndThen(downstream, finisher)` |
| two collectors at once | `teeing(c1, c2, merger)` (Java 12) |
| general | `reducing(...)`, `Collector.of(...)` for custom collectors |

### groupingBy with downstream collectors

`groupingBy(classifier)` returns `Map<K, List<T>>`. Its power is the **downstream** collector, which decides what each group becomes:

```java
groupingBy(Employee::dept)                                         // Map<String, List<Employee>>
groupingBy(Employee::dept, counting())                             // Map<String, Long>
groupingBy(Employee::dept, mapping(Employee::name, toList()))      // Map<String, List<String>>
groupingBy(Employee::dept, TreeMap::new, averagingInt(Employee::salary))   // sorted keys
groupingBy(Employee::dept, groupingBy(Employee::city, counting())) // multi-level
```

- **`partitioningBy`** is a `groupingBy` with a boolean key that **always contains both `true` and `false`** entries, even when one group is empty.
- **`filtering(p, downstream)`** differs from `filter(p)` before grouping: it keeps the group key even when no element passes.

### toMap rules

- **Duplicate keys** throw `IllegalStateException: Duplicate key …`. Supply a **merge function** (`(a, b) -> a`, `Integer::sum`, `BinaryOperator.maxBy(...)`) whenever keys can repeat.
- **Null values** throw `NullPointerException`, because `toMap` is built on `Map.merge`, which rejects nulls. A `null` *key* is allowed by the `HashMap`.
- The map type is unspecified (a `HashMap` today). Pass a supplier (`LinkedHashMap::new`, `TreeMap::new`) when order matters.

### Which "toList"?

| | Mutable? | Nulls? | Notes |
|---|---|---|---|
| `stream.toList()` (16) | **no** (unmodifiable) | allowed | the shortest; the default choice in modern code |
| `collect(Collectors.toList())` | in practice an `ArrayList`, but **not guaranteed** | allowed | don't rely on mutability; use `toCollection(ArrayList::new)` if you need it |
| `collect(Collectors.toUnmodifiableList())` (10) | no | **NullPointerException** | like `List.copyOf` |

## Internal working

- **Sequential `collect`**: `A container = supplier.get(); for each t: accumulator.accept(container, t); return finisher.apply(container)`. It's a plain loop that mutates one container, which is safe because only one thread touches it.
- **Parallel `collect`**: every chunk gets its own container from `supplier`. Containers are merged pairwise with `combiner`, and `finisher` runs once at the end. There's no locking, because no container is shared. That's why `collect` is the safe way to build collections from parallel streams, unlike adding to a shared list in `forEach`.
- **`groupingBy`** accumulates with `map.computeIfAbsent(classifier.apply(t), k -> downstream.supplier().get())`, then feeds `t` to that group's downstream container. If the downstream has a finisher (for example `counting` boxes to `Long`, `averagingInt` divides), all values are converted at the end with `replaceAll`. A `null` classifier result throws `NullPointerException: element cannot be mapped to a null key`.
- **`groupingByConcurrent`** and **`toConcurrentMap`** are `CONCURRENT` and `UNORDERED`: in parallel, all threads accumulate into **one** `ConcurrentHashMap` instead of merging many maps. They're faster for big parallel groupings, but lose encounter order inside groups.
- **`toMap` without a merge function** uses a special accumulator (Java 9+) that reports both conflicting values: `Duplicate key a (attempted merging values ab and ac)`.
- **`Stream.toList()`** isn't a collector. It calls `toArray()` and wraps the array in an unmodifiable list without copying, so it's typically a little faster than `collect(toList())`.

## Visual representation

```text title="groupingBy(dept, TreeMap::new, mapping(name, toList()))"
  stream:  Ada(eng)  Linus(eng)  Barbara(sales)  Grace(eng)  Ken(sales)  Margaret(ops)
              |          |             |             |           |             |
  classifier: eng       eng          sales          eng        sales          ops
              v          v             v             v           v             v
  TreeMap  eng   -> downstream container [Ada, Linus, Grace]       (mapping name -> toList)
           ops   -> downstream container [Margaret]
           sales -> downstream container [Barbara, Ken]

  parallel collect:
    chunk 1: supplier() -> {eng=[Ada, Linus]}          chunk 2: supplier() -> {sales=[Barbara], eng=[Grace]}
                          \                                   /
                           combiner: merge maps, combining lists key by key
                           -> {eng=[Ada, Linus, Grace], sales=[Barbara], ...} -> finisher
```

## Java code example

```java title="CollectorsDemo.java" file="CollectorsDemo.java"
import static java.util.stream.Collectors.averagingInt;
import static java.util.stream.Collectors.collectingAndThen;
import static java.util.stream.Collectors.counting;
import static java.util.stream.Collectors.filtering;
import static java.util.stream.Collectors.groupingBy;
import static java.util.stream.Collectors.joining;
import static java.util.stream.Collectors.mapping;
import static java.util.stream.Collectors.maxBy;
import static java.util.stream.Collectors.minBy;
import static java.util.stream.Collectors.partitioningBy;
import static java.util.stream.Collectors.summarizingInt;
import static java.util.stream.Collectors.teeing;
import static java.util.stream.Collectors.toCollection;
import static java.util.stream.Collectors.toList;
import static java.util.stream.Collectors.toMap;
import static java.util.stream.Collectors.toUnmodifiableList;

import java.util.Comparator;
import java.util.IntSummaryStatistics;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.function.Function;
import java.util.stream.Collector;
import java.util.stream.Stream;

public class CollectorsDemo {
    record Employee(String name, String dept, String city, int salary, int age) { }

    public static void main(String[] args) {
        List<Employee> staff = List.of(
                new Employee("Ada", "eng", "London", 120, 36),
                new Employee("Linus", "eng", "Helsinki", 110, 29),
                new Employee("Barbara", "sales", "London", 90, 41),
                new Employee("Grace", "eng", "London", 135, 45),
                new Employee("Ken", "sales", "Berlin", 70, 27),
                new Employee("Margaret", "ops", "Berlin", 95, 52));

        // Collections and strings
        TreeSet<String> cities = staff.stream().map(Employee::city).collect(toCollection(TreeSet::new));
        String names = staff.stream().map(Employee::name).collect(joining(", ", "[", "]"));
        System.out.println("cities " + cities + "  names " + names);

        // groupingBy with downstream collectors (TreeMap keeps the output sorted)
        Map<String, List<String>> byDept = staff.stream()
                .collect(groupingBy(Employee::dept, TreeMap::new, mapping(Employee::name, toList())));
        Map<String, Long> perCity = staff.stream().collect(groupingBy(Employee::city, TreeMap::new, counting()));
        Map<String, Double> avgSalary = staff.stream()
                .collect(groupingBy(Employee::dept, TreeMap::new, averagingInt(Employee::salary)));
        Map<String, String> topEarner = staff.stream().collect(groupingBy(Employee::dept, TreeMap::new,
                collectingAndThen(maxBy(Comparator.comparingInt(Employee::salary)), e -> e.orElseThrow().name())));
        Map<String, Map<String, Long>> deptCity = staff.stream()
                .collect(groupingBy(Employee::dept, TreeMap::new, groupingBy(Employee::city, TreeMap::new, counting())));
        Map<String, List<String>> over50 = staff.stream().collect(groupingBy(Employee::dept, TreeMap::new,
                filtering(e -> e.age() > 50, mapping(Employee::name, toList()))));
        System.out.println("byDept     " + byDept);
        System.out.println("perCity    " + perCity);
        System.out.println("avgSalary  " + avgSalary);
        System.out.println("topEarner  " + topEarner);
        System.out.println("deptCity   " + deptCity);
        System.out.println("over50     " + over50 + "  <- filtering keeps empty groups");

        // partitioningBy always has both keys
        Map<Boolean, List<String>> highPaid = staff.stream()
                .collect(partitioningBy(e -> e.salary() >= 100, mapping(Employee::name, toList())));
        Map<Boolean, Long> retired = staff.stream().collect(partitioningBy(e -> e.age() > 65, counting()));
        System.out.println("highPaid   " + highPaid);
        System.out.println("retired    " + retired);

        // toMap: merge functions and map suppliers
        Map<String, Integer> payrollByCity = staff.stream()
                .collect(toMap(Employee::city, Employee::salary, Integer::sum, TreeMap::new));
        Map<String, Employee> byName = staff.stream()
                .collect(toMap(Employee::name, Function.identity(), (a, b) -> a, LinkedHashMap::new));
        System.out.println("payroll    " + payrollByCity);
        System.out.println("byName     " + byName.keySet());
        try {
            staff.stream().collect(toMap(Employee::city, Employee::name));
        } catch (IllegalStateException e) {
            System.out.println("no merge   " + e.getMessage());
        }
        try {
            Stream.of("x").collect(toMap(s -> s, s -> (String) null));
        } catch (NullPointerException e) {
            System.out.println("null value NullPointerException from toMap");
        }

        // Statistics and teeing (Java 12)
        IntSummaryStatistics stats = staff.stream().collect(summarizingInt(Employee::salary));
        String range = staff.stream().collect(teeing(
                minBy(Comparator.comparingInt(Employee::salary)),
                maxBy(Comparator.comparingInt(Employee::salary)),
                (min, max) -> min.orElseThrow().name() + " .. " + max.orElseThrow().name()));
        System.out.println("stats      " + stats);
        System.out.println("range      " + range);

        // Which toList?
        List<String> fromCollector = staff.stream().map(Employee::name).collect(toList());
        fromCollector.add("(added)");                              // works today, but not guaranteed by the spec
        List<String> fromStream = Stream.of("a", null).toList();   // unmodifiable, nulls allowed
        System.out.println("toList()   " + fromCollector.size() + " after add; Stream.toList keeps null: " + fromStream);
        try {
            fromStream.add("b");
        } catch (UnsupportedOperationException e) {
            System.out.println("Stream.toList is unmodifiable");
        }
        try {
            Stream.of("a", null).collect(toUnmodifiableList());
        } catch (NullPointerException e) {
            System.out.println("toUnmodifiableList rejects null");
        }

        // A custom collector: supplier, accumulator, combiner, finisher
        Collector<String, StringBuilder, String> initials = Collector.of(
                StringBuilder::new,
                (sb, s) -> sb.append(s.charAt(0)),
                StringBuilder::append,
                StringBuilder::toString);
        System.out.println("initials   " + staff.stream().map(Employee::name).collect(initials));
    }
}
```

## Output

```text title="Output" output="CollectorsDemo.java"
cities [Berlin, Helsinki, London]  names [Ada, Linus, Barbara, Grace, Ken, Margaret]
byDept     {eng=[Ada, Linus, Grace], ops=[Margaret], sales=[Barbara, Ken]}
perCity    {Berlin=2, Helsinki=1, London=3}
avgSalary  {eng=121.66666666666667, ops=95.0, sales=80.0}
topEarner  {eng=Grace, ops=Margaret, sales=Barbara}
deptCity   {eng={Helsinki=1, London=2}, ops={Berlin=1}, sales={Berlin=1, London=1}}
over50     {eng=[], ops=[Margaret], sales=[]}  <- filtering keeps empty groups
highPaid   {false=[Barbara, Ken, Margaret], true=[Ada, Linus, Grace]}
retired    {false=6, true=0}
payroll    {Berlin=165, Helsinki=110, London=345}
byName     [Ada, Linus, Barbara, Grace, Ken, Margaret]
no merge   Duplicate key London (attempted merging values Ada and Barbara)
null value NullPointerException from toMap
stats      IntSummaryStatistics{count=6, sum=620, min=70, average=103.333333, max=135}
range      Ken .. Grace
toList()   7 after add; Stream.toList keeps null: [a, null]
Stream.toList is unmodifiable
toUnmodifiableList rejects null
initials   ALBGKM
```

- The downstream collector decided each group's shape: names (`mapping`), `Long` counts (`counting`), averages, a single name (`collectingAndThen` unwrapping `maxBy`'s `Optional`), or a nested map.
- `filtering` kept the `eng` and `sales` keys with empty lists even though nobody there is over 50. A `filter` before `groupingBy` would have dropped those keys entirely.
- `partitioningBy` printed `true=0`: both keys always exist.
- `toMap` without a merge function failed on the second London employee and named both values. With `Integer::sum` it built a payroll per city.
- `Collectors.toList()` happened to return a mutable list, while `Stream.toList()` was unmodifiable but accepted `null`, and `toUnmodifiableList()` rejected it.

## Real-world application

- **Reports and dashboards**: revenue per region (`groupingBy` + `summingLong`), orders per status (`counting`), top product per category (`maxBy`).
- **Indexes for fast lookup**: `users.stream().collect(toMap(User::id, Function.identity()))` before a loop, avoiding an O(n²) search.
- **API responses**: grouping line items by order, or partitioning results into valid and invalid with error messages.
- **CSV and log output**: `joining(",")`, and `joining("\n")` for multi-line text.
- **Validation summaries**: `teeing(counting(), filtering(...))` to report "12 of 40 failed" in a single pass.
- **Parallel aggregation over big data sets**: `groupingByConcurrent` for very large in-memory datasets.

## Common mistakes

- **Using `toMap` without a merge function** when keys can repeat, which causes production `IllegalStateException`s on the first duplicate.
- **Null values in `toMap`**: map them to `Optional`, a default value, or filter them out first.
- **Assuming the map or list type**: `groupingBy` returns a `HashMap` (unordered) and `toList()` an unspecified list. Pass `TreeMap::new`/`LinkedHashMap::new` or use `toCollection` when order or mutability matters.
- **Mutating the result of `Stream.toList()`**, which throws `UnsupportedOperationException`.
- **Using `filter` before `groupingBy` when the report needs every key**: use `filtering`.
- **Nesting `groupingBy` five levels deep.** Once results need a name, introduce a record such as `record Key(String dept, String city)` and group by that.
- **Collecting just to stream again** (`collect(toList()).stream()`), which allocates a list for nothing.

## Interview questions

**Q1. What are the components of a `Collector`?**

````reveal title="Answer"
- a **supplier** that creates the mutable result container;
- an **accumulator** that folds one element into a container;
- a **combiner** that merges two containers (used by parallel streams);
- a **finisher** that converts the container to the final result;
- **characteristics**: `IDENTITY_FINISH` (no finisher needed), `UNORDERED`, and `CONCURRENT` (one shared container that accepts concurrent accumulation).

`Collector.of(...)` builds a custom collector from these parts.
````

**Q2. What happens when `Collectors.toMap` meets a duplicate key, or a null value?**

````reveal title="Answer"
A duplicate key throws `IllegalStateException: Duplicate key k (attempted merging values v1 and v2)`. The fix is the three-argument form with a merge function, such as `(a, b) -> a`, `Integer::sum` or `BinaryOperator.maxBy(...)`. A null *value* throws `NullPointerException`, because the implementation uses `Map.merge`, which rejects nulls. Handle nulls before collecting, or collect with `toCollection`/`groupingBy` instead.
````

**Q3. `groupingBy` vs `partitioningBy`?**

````reveal title="Answer"
`groupingBy` classifies elements by any key and creates entries only for keys that occur. `partitioningBy` classifies by a predicate into a `Map<Boolean, …>` that always contains both `true` and `false`, even if one partition is empty. It's also slightly more efficient for the two-way case. Both accept a downstream collector.
````

**Q4. Compare `Stream.toList()`, `Collectors.toList()` and `Collectors.toUnmodifiableList()`.**

````reveal title="Answer"
`Stream.toList()` (Java 16) returns an unmodifiable list that allows nulls. `Collectors.toList()` returns a list with no guarantees about type, mutability or thread safety (an `ArrayList` in practice). `Collectors.toUnmodifiableList()` (Java 10) returns an unmodifiable list and throws `NullPointerException` on null elements. Prefer `Stream.toList()`, and use `toCollection(ArrayList::new)` if you need a mutable result.
````

**Q5. How do you count words by frequency, sorted by count descending?**

````reveal title="Answer"
```java
Map<String, Long> counts = words.stream()
        .collect(groupingBy(Function.identity(), counting()));
List<Map.Entry<String, Long>> top = counts.entrySet().stream()
        .sorted(Map.Entry.<String, Long>comparingByValue().reversed()
                .thenComparing(Map.Entry.comparingByKey()))
        .toList();
```

For encounter order instead, use `groupingBy(Function.identity(), LinkedHashMap::new, counting())`.
````

## Hands-on exercise

Write a sales report over `record Sale(String region, String product, int units, int unitPriceCents)` using one collector per question:

1. revenue in cents per region, sorted by region (`groupingBy` + `summingLong`);
2. the best-selling product (by units) per region (a nested `groupingBy` + `collectingAndThen`);
3. the number of sales worth at least 50,000 cents vs below (`partitioningBy` + `counting`);
4. product → sorted set of regions where it sold (`mapping` + `toCollection(TreeSet::new)`);
5. one summary line with total revenue and the average units per sale, computed in a single pass (`teeing`).

````hint title="Hint"
For question 2, group by region; downstream, group by product with `summingInt(Sale::units)`, then `collectingAndThen(..., m -> m.entrySet().stream().max(Map.Entry.comparingByValue()).orElseThrow().getKey())`. For question 5, `teeing(summingLong(revenue), averagingInt(Sale::units), (total, avg) -> ...)`.
````

````solution title="Solution"
```java title="SalesReport.java" file="SalesReport.java"
import static java.util.stream.Collectors.averagingInt;
import static java.util.stream.Collectors.collectingAndThen;
import static java.util.stream.Collectors.counting;
import static java.util.stream.Collectors.groupingBy;
import static java.util.stream.Collectors.mapping;
import static java.util.stream.Collectors.partitioningBy;
import static java.util.stream.Collectors.summingInt;
import static java.util.stream.Collectors.summingLong;
import static java.util.stream.Collectors.teeing;
import static java.util.stream.Collectors.toCollection;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

public class SalesReport {
    record Sale(String region, String product, int units, int unitPriceCents) {
        long revenue() {
            return (long) units * unitPriceCents;
        }
    }

    public static void main(String[] args) {
        List<Sale> sales = List.of(
                new Sale("north", "laptop", 2, 95_000),
                new Sale("north", "mouse", 40, 1_500),
                new Sale("south", "mouse", 25, 1_500),
                new Sale("south", "monitor", 3, 22_000),
                new Sale("north", "monitor", 1, 22_000),
                new Sale("south", "mouse", 10, 1_500),
                new Sale("east", "laptop", 1, 99_000));

        Map<String, Long> revenue = sales.stream()
                .collect(groupingBy(Sale::region, TreeMap::new, summingLong(Sale::revenue)));

        Map<String, String> bestSeller = sales.stream().collect(groupingBy(Sale::region, TreeMap::new,
                collectingAndThen(groupingBy(Sale::product, summingInt(Sale::units)),
                        units -> units.entrySet().stream().max(Map.Entry.comparingByValue()).orElseThrow().getKey())));

        Map<Boolean, Long> bigSales = sales.stream()
                .collect(partitioningBy(s -> s.revenue() >= 50_000, counting()));

        Map<String, Set<String>> regionsByProduct = sales.stream().collect(groupingBy(Sale::product, TreeMap::new,
                mapping(Sale::region, toCollection(TreeSet::new))));

        String summary = sales.stream().collect(teeing(
                summingLong(Sale::revenue),
                averagingInt(Sale::units),
                (total, avgUnits) -> String.format("total %d cents, %.2f units per sale", total, avgUnits)));

        System.out.println("revenue per region  " + revenue);
        System.out.println("best seller         " + bestSeller);
        System.out.println(">= 50000 cents      " + bigSales);
        System.out.println("regions by product  " + regionsByProduct);
        System.out.println("summary             " + summary);
    }
}
```

```text title="Output" output="SalesReport.java"
revenue per region  {east=99000, north=272000, south=118500}
best seller         {east=laptop, north=mouse, south=mouse}
>= 50000 cents      {false=3, true=4}
regions by product  {laptop=[east, north], monitor=[north, south], mouse=[north, south]}
summary             total 489500 cents, 11.71 units per sale
```

Each question took one pass and one collector, and no intermediate maps were built by hand. In south, the mouse wins with 35 units because its two sales were summed before choosing the maximum.
````

## Knowledge check

```quiz
? What does groupingBy(Employee::dept, counting()) return?
+ Map<String, Long>
- Map<String, Integer>
- Map<String, List<Long>>
> counting() always produces a Long.

? Which collector always contains both true and false keys?
+ partitioningBy
- groupingBy with a boolean classifier
- toMap with a boolean key
> groupingBy creates only the keys it sees.

? toMap(Employee::city, Employee::name) on two employees in London throws what?
+ IllegalStateException (duplicate key)
- It keeps the last value silently
- NullPointerException
> Provide a merge function: toMap(k, v, (a, b) -> a).

? Which list rejects null elements?
+ collect(Collectors.toUnmodifiableList())
- stream.toList()
- collect(Collectors.toList())
> Stream.toList() allows nulls even though it's unmodifiable.

? Why is collect safe with parallel streams when forEach(list::add) is not?
+ Each chunk accumulates into its own container, merged afterwards by the combiner
- collect locks the list on every add
- forEach is never run in parallel
> No container is shared between threads, so no synchronisation is needed.
```

## Key takeaways

- **`collect`** performs mutable reduction via a **Collector**: supplier, accumulator, combiner, finisher and characteristics. Parallel collection merges per-chunk containers.
- **`groupingBy`** + downstream collectors (`counting`, `mapping`, `averagingInt`, `maxBy`, `filtering`, nested `groupingBy`) cover most reports. Pass `TreeMap::new` for sorted keys.
- **`partitioningBy`** always has both keys. **`teeing`** runs two collectors in one pass.
- **`toMap`** throws on duplicate keys (add a merge function) and on null values.
- `Stream.toList()` is unmodifiable and allows nulls; `Collectors.toList()` promises nothing; `toUnmodifiableList()` rejects nulls.
