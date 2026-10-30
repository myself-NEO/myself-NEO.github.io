## Concept explanation

### What it is

Choosing a collection is answering four questions in order:

1. **What's the shape of the data?** A sequence (`List`), unique items (`Set`), key → value (`Map`), work waiting to be processed (`Queue`/`Deque`)?
2. **What operations dominate?** Index access, membership tests, lookup by key, insert/remove at the ends, range queries, "smallest next"?
3. **What ordering do you need?** None, insertion order, sorted order, access order (LRU), priority?
4. **Who touches it?** One thread, many readers and rare writers, many writers?

### The decision table

| Need | Choose | Why |
|---|---|---|
| ordered sequence, index access, appends | `ArrayList` | O(1) `get`, amortised O(1) append, cache-friendly |
| stack or FIFO queue | `ArrayDeque` | O(1) at both ends, no nodes |
| membership / de-duplication, no order | `HashSet` | O(1) `contains` |
| unique items in first-seen order | `LinkedHashSet` | O(1) + insertion order |
| sorted unique items, nearest/range queries | `TreeSet` | O(log n), `floor`/`ceiling`/`subSet` |
| lookup by key, no order | `HashMap` | O(1) average |
| map with stable insertion order / LRU | `LinkedHashMap` | insertion or access order |
| sorted keys, range or nearest-key queries | `TreeMap` | O(log n), `NavigableMap` API |
| enum keys / enum flags | `EnumMap` / `EnumSet` | array / bit vector |
| "process smallest/most urgent next", top-K | `PriorityQueue` | O(log n) heap |
| shared map | `ConcurrentHashMap` | lock-free reads, atomic compute |
| shared, read-mostly list (listeners) | `CopyOnWriteArrayList` | snapshot iteration, no locks for readers |
| shared sorted map | `ConcurrentSkipListMap` | concurrent, O(log n) |
| producer → consumer handoff | `ArrayBlockingQueue` / `LinkedBlockingQueue` (bounded) | blocking + backpressure |
| fixed constant data | `List.of`, `Set.of`, `Map.of` | immutable, compact, null-hostile |

### Big-O cheat sheet

| | get / index | contains / key lookup | insert | remove | ordered? |
|---|---|---|---|---|---|
| `ArrayList` | O(1) | O(n) | O(1)* end, O(n) middle | O(n) (O(1) at end) | insertion |
| `LinkedList` | O(n) | O(n) | O(1) ends / at iterator | O(1) ends / at iterator | insertion |
| `ArrayDeque` | — | O(n) | O(1)* ends | O(1) ends | insertion |
| `HashSet`/`HashMap` | — | O(1)† | O(1)*† | O(1)† | no |
| `LinkedHashSet/Map` | — | O(1)† | O(1)*† | O(1)† | insertion/access |
| `TreeSet`/`TreeMap` | — | O(log n) | O(log n) | O(log n) | sorted |
| `PriorityQueue` | O(1) peek | O(n) | O(log n) | O(log n) poll, O(n) arbitrary | heap |
| `EnumSet`/`EnumMap` | — | O(1) | O(1) | O(1) | declaration |

\* amortised † average, assuming a good `hashCode`

### Immutable collections (Java 9+)

- **`List.of(...)`, `Set.of(...)`, `Map.of(k1, v1, …)`** (up to 10 pairs) and **`Map.ofEntries(Map.entry(k, v), …)`**: truly unmodifiable, compact (specialised classes for small sizes), **reject `null`**, `Set.of`/`Map.of` reject **duplicates** with `IllegalArgumentException`, and their iteration order is **deliberately randomised per JVM run** for sets and maps (so code can't depend on it).
- **`List.copyOf`, `Set.copyOf`, `Map.copyOf`** (Java 10): immutable snapshots; return the argument unchanged if it's already immutable.
- **`stream.toList()`** (Java 16): unmodifiable list that **allows nulls**; `Collectors.toUnmodifiableList()` rejects them; `Collectors.toList()` returns a mutable `ArrayList` (unspecified, but in practice).

### Sequenced collections (Java 21)

Java 21 added `SequencedCollection`/`SequencedSet`/`SequencedMap`, implemented by `List`, `Deque`, `LinkedHashSet`, `SortedSet`, `LinkedHashMap`, `SortedMap`: uniform `getFirst()`, `getLast()`, `addFirst`, `addLast`, `removeFirst`, `removeLast`, `reversed()` (and `firstEntry`/`pollFirstEntry`/`putFirst` for maps). In Java 17 use the type-specific equivalents (`list.get(0)`, `deque.peekFirst()`, `treeMap.firstEntry()`, `linkedHashMap.entrySet().iterator().next()`).

## Internal working

The choice matters because of **memory layout** as much as big-O:

| Structure | Per-element overhead (64-bit, compressed oops) | Locality |
|---|---|---|
| `int[]` | 4 bytes | contiguous values |
| `ArrayList<Integer>` | 4-byte reference + 16-byte `Integer` | references contiguous, objects scattered |
| `LinkedList` | ~24-byte node + reference to element | scattered |
| `HashMap` entry | ~32-byte node + table slot + key + value | scattered chains |
| `TreeMap` entry | ~40-byte entry + key + value | scattered tree |
| `EnumSet` | 1 bit | one `long` |

- **Constant factors**: O(1) hash lookups still compute a hash and compare with `equals`; for 10 elements, an `ArrayList` scan can beat a `HashSet`. Big-O matters as data grows; measure for small sizes.
- **Boxing**: every `Integer`/`Long` key or element is an object. For millions of numbers, primitive arrays or primitive collection libraries (fastutil, Eclipse Collections, HPPC) use 4–8× less memory.
- **Capacity planning**: `new ArrayList<>(n)`, `new HashMap<>((int) (n / 0.75f) + 1)` (or `HashMap.newHashMap(n)` in Java 19+) avoid regrowth.
- **Immutable factories** use field-based classes (`List12`, `Set12`, `MapN` with open addressing) that are smaller than their mutable counterparts.
- **Thread safety** is a property of the implementation, not the interface; changing `HashMap` to `ConcurrentHashMap` changes null handling and iteration semantics too.

## Visual representation

```text title="Decision flow"
                        what is it?
      +------------------+------------------+--------------------+
      | sequence         | unique items     | key -> value       | work to process
      v                  v                  v                    v
  index access?      order needed?       order needed?         priority?
   yes: ArrayList     none: HashSet       none: HashMap          yes: PriorityQueue
   ends only:         insertion:          insertion/LRU:         no:  ArrayDeque
     ArrayDeque         LinkedHashSet       LinkedHashMap        between threads:
                      sorted/ranges:      sorted/ranges:           BlockingQueue (bounded)
                        TreeSet             TreeMap
  enum elements/keys -> EnumSet / EnumMap        shared map -> ConcurrentHashMap
  constants -> List.of / Set.of / Map.of        read-mostly shared list -> CopyOnWriteArrayList
```

## Java code example

```java title="CollectionChoices.java" file="CollectionChoices.java"
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import java.util.stream.Stream;

public class CollectionChoices {
    public static void main(String[] args) {
        // 1. contains() on a List vs a Set: count equals() work for 2,000 lookups in 20,000 items
        List<Integer> ids = IntStream.range(0, 20_000).boxed().collect(Collectors.toCollection(ArrayList::new));
        Set<Integer> idSet = new HashSet<>(ids);
        long listComparisons = 0;
        for (int q = 0; q < 2_000; q++) {
            int target = q * 10;
            listComparisons += ids.indexOf(target) + 1;      // a linear scan inspects indexOf + 1 elements
        }
        System.out.println("List.contains: ~" + listComparisons + " element comparisons; HashSet: ~2000 (one bucket each)");
        System.out.println("same answers: " + IntStream.range(0, 2_000).allMatch(q -> ids.contains(q * 10) == idSet.contains(q * 10)));

        // 2. Immutable factories: nulls and duplicates are rejected
        try {
            Set.of("a", "a");
        } catch (IllegalArgumentException e) {
            System.out.println("Set.of duplicates: IllegalArgumentException");
        }
        try {
            Map.of("k", null);
        } catch (NullPointerException e) {
            System.out.println("Map.of null value: NullPointerException");
        }
        Map<String, Integer> limits = Map.ofEntries(Map.entry("free", 10), Map.entry("pro", 100), Map.entry("team", 1_000));
        System.out.println("Map.ofEntries sorted view: " + new TreeMap<>(limits));

        // 3. toList() vs Collectors.toList() vs toUnmodifiableList()
        List<String> viaToList = Stream.of("x", null).toList();               // unmodifiable, allows null
        List<String> viaCollector = Stream.of("x").collect(Collectors.toList()); // mutable in practice
        viaCollector.add("y");
        System.out.println("stream.toList() allows null: " + viaToList + ", Collectors.toList() is mutable: " + viaCollector);
        try {
            viaToList.add("z");
        } catch (UnsupportedOperationException e) {
            System.out.println("stream.toList() is unmodifiable");
        }
        try {
            Stream.of("x", null).collect(Collectors.toUnmodifiableList());
        } catch (NullPointerException e) {
            System.out.println("toUnmodifiableList rejects null");
        }

        // 4. copyOf returns the same instance when the input is already immutable
        List<String> immutable = List.of("a", "b");
        System.out.println("List.copyOf(immutable) == immutable: " + (List.copyOf(immutable) == immutable));

        // 5. Pre-sizing a HashMap for an expected number of entries
        int expected = 1_000;
        int initialCapacity = (int) (expected / 0.75f) + 1;
        System.out.println("to hold " + expected + " entries without resizing, request capacity " + initialCapacity
                + " (rounded up to " + Integer.highestOneBit(initialCapacity - 1) * 2 + " buckets)");
    }
}
```

## Output

```text title="Output" output="CollectionChoices.java"
List.contains: ~19992000 element comparisons; HashSet: ~2000 (one bucket each)
same answers: true
Set.of duplicates: IllegalArgumentException
Map.of null value: NullPointerException
Map.ofEntries sorted view: {free=10, pro=100, team=1000}
stream.toList() allows null: [x, null], Collectors.toList() is mutable: [x, y]
stream.toList() is unmodifiable
toUnmodifiableList rejects null
List.copyOf(immutable) == immutable: true
to hold 1000 entries without resizing, request capacity 1334 (rounded up to 2048 buckets)
```

- 2,000 `contains` checks on a 20,000-element list inspected about 20 million elements; the `HashSet` touched about one bucket per lookup. Same answers, wildly different cost — the classic O(n²) → O(n) fix.
- The immutable factories rejected duplicates and nulls up front.
- `stream.toList()` (unmodifiable, null-tolerant), `Collectors.toList()` (mutable `ArrayList`) and `toUnmodifiableList()` (null-hostile) differ in subtle ways.
- `List.copyOf` didn't copy an already-immutable list.

## Real-world application

- **Performance reviews** regularly find `List.contains` inside loops, `LinkedList` queues and unbounded maps; swapping the collection is often the cheapest big win.
- **API design**: return `List`/`Set`/`Map` interfaces, immutable where possible (`List.copyOf`, `toList()`), so callers can't corrupt internal state.
- **Memory-constrained services** (large in-memory indexes) move from `Map<Long, Long>` to primitive maps or arrays, cutting heap by gigabytes.
- **Interview problems** are frequently "choose the right structure" in disguise: sliding window (deque), top-K (heap), LRU (`LinkedHashMap`), intervals (`TreeMap`), frequencies (`HashMap`). See the [coding-round toolkit](lesson:coding-round-toolkit).

## Common mistakes

- **`List.contains`/`indexOf` in a loop** over large lists — use a `HashSet`.
- **Defaulting to `LinkedList`** for queues or "frequent inserts".
- **`TreeMap` where `HashMap` would do** (paying O(log n) for order you never use).
- **Relying on `HashMap`/`Set.of`/`Map.of` iteration order.**
- **Boxed collections of millions of numbers.**
- **Assuming `Collectors.toList()` is immutable** or that `toList()` rejects nulls.
- **Swapping in a concurrent collection without revisiting compound actions** (check-then-act).

## Interview questions

**Q1. How would you choose between `HashMap`, `LinkedHashMap` and `TreeMap`?**

````reveal title="Answer"
All map keys to values. `HashMap`: fastest (O(1) average), no ordering. `LinkedHashMap`: O(1) plus predictable insertion order (or access order for LRU caches), slightly more memory. `TreeMap`: O(log n), keys sorted by a comparator, with navigation and range queries. Pick the cheapest one that provides the ordering you actually need; add `ConcurrentHashMap`/`ConcurrentSkipListMap` if threads share it.
````

**Q2. What's the difference between `Collections.unmodifiableList`, `List.copyOf` and `List.of`?**

````reveal title="Answer"
`unmodifiableList` is a read-only **view** of a list that can still change underneath. `List.copyOf(c)` makes an immutable **snapshot** of an existing collection (rejecting nulls, and returning the argument if it's already immutable). `List.of(...)` creates an immutable list from explicit elements (rejecting nulls). The last two are truly immutable; the first only prevents writes through that reference.
````

**Q3. You need to check membership of 10 million user IDs quickly with little memory. What do you use?**

````reveal title="Answer"
A `HashSet<Long>` would need roughly 500+ MB (nodes plus boxed `Long`s). Better: a sorted `long[]` with `Arrays.binarySearch` (80 MB, O(log n)), a primitive hash set from a library like fastutil (`LongOpenHashSet`, ~80–160 MB, O(1)), or — if false positives are acceptable — a Bloom filter (tens of MB). The answer shows awareness of boxing and per-entry overhead, not just big-O.
````

**Q4. Why is the iteration order of `Set.of`/`Map.of` different between runs?**

````reveal title="Answer"
The JDK deliberately randomises it (with a per-JVM salt) so that code can't accidentally depend on an unspecified order — a lesson learned from code that broke whenever `HashMap`'s implementation changed. If you need order, use `List.of`, `LinkedHashMap`, or a sorted collection.
````

## Hands-on exercise

For each scenario, pick a collection and justify it in one comment line, then implement the core operation:

1. Keep the last 100 log lines and print them oldest-first.
2. Return the 3 most frequent error codes from a list.
3. Given meeting start times, find the first meeting at or after a given time.
4. Record which feature flags (an enum) are enabled for a user.

````hint title="Hint"
1: `ArrayDeque` with a size cap. 2: `HashMap` counts + a size-3 min-heap (or sort entries). 3: `TreeSet.ceiling`. 4: `EnumSet`.
````

````solution title="Solution"
```java title="ScenarioPicks.java" file="ScenarioPicks.java"
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.Set;
import java.util.TreeSet;

public class ScenarioPicks {
    enum Flag { DARK_MODE, BETA_SEARCH, NEW_CHECKOUT }

    public static void main(String[] args) {
        // 1. ArrayDeque: O(1) append and O(1) drop-oldest; iteration is oldest-first
        Deque<String> lastLines = new ArrayDeque<>();
        for (int i = 1; i <= 105; i++) {
            lastLines.addLast("line " + i);
            if (lastLines.size() > 100) {
                lastLines.removeFirst();
            }
        }
        System.out.println("kept " + lastLines.size() + ", oldest " + lastLines.peekFirst() + ", newest " + lastLines.peekLast());

        // 2. HashMap for counts + bounded min-heap for top 3: O(n log 3)
        List<String> errors = List.of("E42", "E7", "E42", "E3", "E7", "E42", "E9", "E7", "E3", "E42");
        Map<String, Integer> counts = new HashMap<>();
        errors.forEach(e -> counts.merge(e, 1, Integer::sum));
        PriorityQueue<Map.Entry<String, Integer>> heap = new PriorityQueue<>(Map.Entry.comparingByValue());
        for (Map.Entry<String, Integer> e : counts.entrySet()) {
            heap.offer(e);
            if (heap.size() > 3) {
                heap.poll();
            }
        }
        List<String> top = new ArrayList<>();
        while (!heap.isEmpty()) {
            top.add(0, heap.poll().getKey());          // smallest polled first; prepend for descending
        }
        System.out.println("top 3 errors: " + top);

        // 3. TreeSet: sorted, O(log n) ceiling
        TreeSet<Integer> meetings = new TreeSet<>(List.of(900, 1030, 1400, 1600));
        System.out.println("first meeting at or after 1100: " + meetings.ceiling(1100));

        // 4. EnumSet: one long, type-safe
        Set<Flag> flags = EnumSet.of(Flag.DARK_MODE, Flag.NEW_CHECKOUT);
        System.out.println("beta search enabled? " + flags.contains(Flag.BETA_SEARCH) + ", flags " + flags);
    }
}
```

```text title="Output" output="ScenarioPicks.java"
kept 100, oldest line 6, newest line 105
top 3 errors: [E42, E7, E3]
first meeting at or after 1100: 1400
beta search enabled? false, flags [DARK_MODE, NEW_CHECKOUT]
```
````

## Knowledge check

```quiz
? You need fast membership checks and don't care about order. Which collection?
+ HashSet
- ArrayList
- TreeSet
> O(1) average contains.

? Which collection answers "smallest key greater than or equal to x" in O(log n)?
+ TreeMap / TreeSet
- HashMap
- LinkedHashMap
> NavigableMap/NavigableSet provide ceiling/floor.

? What does `Set.of("a", "a")` do?
+ Throws IllegalArgumentException
- Returns a set with one element
- Returns a set with two elements
> Immutable factories reject duplicates.

? Which allows null elements?
+ stream.toList()
- List.of
- Collectors.toUnmodifiableList()
> toList() is unmodifiable but null-tolerant.

? Why can a List<Integer> of a million numbers use ~5x the memory of an int[]?
+ Each element is a separate boxed Integer object plus a reference
- Lists store each number twice
- ArrayList always doubles its capacity
> Boxing adds object headers and indirection.
```

## Key takeaways

- Decide by **shape → dominant operations → ordering → concurrency**.
- Defaults: **`ArrayList`**, **`ArrayDeque`**, **`HashMap`/`HashSet`**; add **Linked*** for insertion order, **Tree*** for sorted/range queries, **Enum*** for enums, **`PriorityQueue`** for priorities.
- For threads: **`ConcurrentHashMap`**, **`CopyOnWriteArrayList`**, **bounded `BlockingQueue`s**.
- **`List.of`/`Set.of`/`Map.of`/`copyOf`** are immutable and null-hostile; `toList()` is unmodifiable but allows nulls.
- Big-O plus **memory layout and boxing** decide real-world performance.
