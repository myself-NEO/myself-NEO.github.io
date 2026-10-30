# Collections

### `ArrayList` or `LinkedList`?
`id: arraylist-vs-linkedlist` `level: beginner` `kind: concept` `lessons: arraylist-internals,linkedlist-vector-stack`

#### Hints
1. What does each one do on `get(i)`?
2. Where does each one's memory live, and how does the CPU cache treat it?

#### Answer
`ArrayList` is a resizable array: O(1) `get`/`set`, amortised O(1) append, O(n) insert/remove in the middle (via a fast `System.arraycopy`), ~4 bytes per element for the reference, contiguous memory. `LinkedList` is a doubly linked list: O(n) `get(i)` (it walks nodes), O(1) insert/remove at the ends or at an iterator's position, ~24 extra bytes per element for each `Node`, and pointer chasing that defeats CPU caches.

In practice `ArrayList` wins nearly every workload, including many "middle insert" cases; for queue/stack use `ArrayDeque`, not `LinkedList`. `LinkedList` is defensible only for many insertions/removals through an already-positioned `ListIterator`.

#### Why other answers fall short
- **"LinkedList is faster for insertion."** Only once you're already at the position; finding it is O(n) and slower than shifting an array.
- **"ArrayList is slow because it resizes."** Geometric growth makes appends amortised O(1).

#### Follow-up
**What's wrong with `for (int i = 0; i < linkedList.size(); i++) linkedList.get(i)`?** Each `get(i)` walks from the nearer end, so the loop is O(n²). Iterate with for-each or an iterator.

### What does this print?
`id: list-remove-int-vs-object` `level: beginner` `kind: output` `tricky` `lessons: arraylist-internals,wrapper-classes-autoboxing`

```java
List<Integer> list = new ArrayList<>(List.of(10, 20, 30, 1));
list.remove(1);
list.remove(Integer.valueOf(1));
System.out.println(list);
```

#### Hints
1. There are two `remove` methods: `remove(int index)` and `remove(Object o)`.
2. Which one is an exact match for an `int` argument?

#### Answer
`[10, 30]`.

`list.remove(1)` calls `remove(int index)` — an exact match for the `int` literal, so overload resolution never considers boxing — removing the element at index 1 (`20`). `list.remove(Integer.valueOf(1))` calls `remove(Object)` and removes the value `1`.

#### Why other answers fall short
- **`[10, 20, 30]`** — assumes `remove(1)` removes the value 1; overload resolution prefers the exact `int` match over boxing.
- **`IndexOutOfBoundsException`** — index 1 is valid.

#### Follow-up
**How do you remove all occurrences of a value?** `list.removeIf(x -> x == 1)`. That comparison is safe because one side is an `int` literal, so `x` is unboxed; it's `Integer == Integer` (two boxed values) that compares identity and breaks above 127.

### Fail-fast vs fail-safe iterators
`id: fail-fast-vs-fail-safe` `level: intermediate` `kind: internals` `tricky` `lessons: iterators-and-fail-fast`

#### Hints
1. What field does `ArrayList` increment on every structural change?
2. What do `ConcurrentHashMap` and `CopyOnWriteArrayList` iterators traverse?

#### Answer
**Fail-fast** iterators (`ArrayList`, `HashMap`, `TreeMap`…) record the collection's `modCount` when created and compare it on every `next()`; a structural change not made through the iterator throws `ConcurrentModificationException` — even in a single thread (e.g. `list.remove(x)` inside a for-each). The check is best effort, not a guarantee.

"Fail-safe" is informal; the JDK distinguishes:

- **Weakly consistent** (`ConcurrentHashMap`, `ConcurrentLinkedQueue`): traverse live data, never throw, may or may not show concurrent changes.
- **Snapshot** (`CopyOnWriteArrayList`): iterate the array as it was at creation; never throw; `remove()` unsupported.

Safe removal during iteration: `iterator.remove()` or `removeIf`.

#### Why other answers fall short
- **"CME only happens with multiple threads."** Most CMEs are single-threaded.
- **"Fail-safe iterators work on a copy."** Only snapshot iterators do; `ConcurrentHashMap`'s don't.

#### Follow-up
**Why might removing the second-to-last element in a for-each loop *not* throw?** `ArrayList`'s `hasNext()` just compares `cursor != size`; after the removal they're equal, so the loop exits before `next()` checks `modCount` — and the last element is silently skipped.

### Why is `ConcurrentHashMap` better than `Hashtable`?
`id: chm-vs-hashtable` `level: intermediate` `kind: concept` `tricky` `lessons: concurrenthashmap-internals,specialized-maps-and-sets`

#### Hints
1. How many locks does each use, and do reads lock?
2. What about compound operations and iteration?

#### Answer
`Hashtable` synchronises **every method on one lock**, so all readers and writers are serialised; compound actions (`if (!containsKey) put`) are still races; iterating while others write needs a manual lock; it's legacy (Java 1.0).

`ConcurrentHashMap` (Java 8+): **lock-free reads** (volatile reads), **CAS** for inserts into empty bins, **`synchronized` on a single bin** for other writes (so writers to different bins run in parallel), **cooperative resizing**, striped size counters, **atomic compound methods** (`putIfAbsent`, `compute`, `merge`), and **weakly consistent iterators** that never throw CME. It scales with cores; `Hashtable` doesn't. Both reject `null`s.

#### Why other answers fall short
- **"ConcurrentHashMap uses 16 segments."** That was Java 7; Java 8 locks per bin.
- **"ConcurrentHashMap makes every sequence of operations atomic."** Only its individual methods; `get` + `put` is still a race.

#### Follow-up
**Is `Collections.synchronizedMap(new HashMap<>())` any better than `Hashtable`?** It's the same single-lock design (allowing nulls); fine for low contention, but compound actions and iteration still need `synchronized (map)`.

### How is `HashSet` implemented?
`id: hashset-internals` `level: beginner` `kind: internals` `lessons: hashset-and-linkedhashmap,hashmap-internals`

#### Hints
1. What collection gives O(1) lookup by key?
2. What would the "values" be?

#### Answer
`HashSet` wraps a `HashMap<E, Object>`: each element is a **key** and every value is a shared dummy object (`PRESENT`). `add(e)` is `map.put(e, PRESENT) == null` (true if the key was new), `contains` is `containsKey`, `remove` is `map.remove`. So it inherits `HashMap`'s O(1) average operations, single `null` element, unspecified order, `equals`/`hashCode` requirements and lack of thread safety. `LinkedHashSet` wraps a `LinkedHashMap` (insertion order); `TreeSet` wraps a `TreeMap` (sorted, uses `compareTo`).

#### Why other answers fall short
- **"It stores elements in an array and checks for duplicates by scanning."** That would be O(n) per add.
- **"It uses `equals` only."** It uses `hashCode` first to find the bucket.

#### Follow-up
**Why does `set.add(x)` sometimes return `false` for an object you never added?** Because an *equal* object (same `equals`/`hashCode`) is already present.

### A `TreeSet` lost elements. Why?
`id: treeset-comparator-equality` `level: intermediate` `kind: debugging` `lessons: treemap-and-treeset,comparable-vs-comparator`

```java
Set<Employee> byDept = new TreeSet<>(Comparator.comparing(Employee::department));
byDept.addAll(List.of(new Employee("Ana", "Ops"), new Employee("Raj", "Dev"), new Employee("Bea", "Dev")));
System.out.println(byDept.size());   // 2 — Bea is missing
```

#### Hints
1. How does a `TreeSet` decide that two elements are duplicates?
2. What does this comparator return for Raj and Bea?

#### Answer
`TreeSet` (and `TreeMap`) never call `equals`; an element is a duplicate when `compare(a, b) == 0`. This comparator only looks at the department, so `Bea` compares equal to `Raj` and is rejected. The ordering is **inconsistent with equals**.

Fix: add tie-breakers until the comparator distinguishes every distinct element, e.g. `Comparator.comparing(Employee::department).thenComparing(Employee::name)`, or a unique id last.

#### Why other answers fall short
- **"`Employee` needs `equals`/`hashCode`."** Irrelevant for `TreeSet`; it uses the comparator.
- **"Sets don't allow two employees in the same department."** Only because of this comparator.

#### Follow-up
**Name a JDK class whose natural ordering is inconsistent with equals.** `BigDecimal`: `1.0` and `1.00` compare equal but aren't `equals`, so a `HashSet` keeps both and a `TreeSet` keeps one.

### What does this print?
`id: priorityqueue-iteration-order` `level: intermediate` `kind: output` `lessons: queues-and-deques`

```java
PriorityQueue<Integer> pq = new PriorityQueue<>();
for (int x : new int[] {5, 3, 8, 1, 4}) pq.offer(x);
System.out.println(pq + " " + pq.peek());
```

#### Hints
1. How is a binary heap stored?
2. Does `toString` poll elements or iterate the array?

#### Answer
`[1, 3, 8, 5, 4] 1`.

`PriorityQueue` is a binary min-heap in an array. `toString` iterates the **array**, which is in heap order, not sorted order. Offering 5, 3, 8, 1, 4: `1` sifts up to the root, giving `[1, 3, 8, 5, 4]`. Only `peek` (the root) and repeated `poll` give elements in priority order.

#### Why other answers fall short
- **`[1, 3, 4, 5, 8] 1`** — assumes iteration is sorted.
- **`[5, 3, 8, 1, 4] 5`** — assumes insertion order.

#### Follow-up
**How do you print the elements in sorted order without destroying the queue?** Copy it (`new PriorityQueue<>(pq)`) and poll the copy, or `pq.stream().sorted()`.

### Design an LRU cache
`id: lru-cache-design` `level: intermediate` `kind: scenario` `lessons: hashset-and-linkedhashmap,hashmap-internals`

You need an in-memory cache of the 10,000 most recently used product pages with O(1) `get` and `put`. What do you build?

#### Hints
1. Which structure gives O(1) lookup? Which gives O(1) "move to most recent" and "remove least recent"?
2. Does the JDK already combine them?

#### Answer
Combine a **hash map** (key → node) with a **doubly linked list** ordered by recency: `get` finds the node in O(1) and moves it to the head; `put` inserts at the head and, when over capacity, removes the tail node and its map entry — all O(1).

The JDK provides exactly this: `LinkedHashMap` with **access order** and `removeEldestEntry`:

```java
class Lru<K, V> extends LinkedHashMap<K, V> {
    private final int capacity;
    Lru(int capacity) { super(16, 0.75f, true); this.capacity = capacity; }
    @Override protected boolean removeEldestEntry(Map.Entry<K, V> e) { return size() > capacity; }
}
```

For concurrent access, wrap it (`Collections.synchronizedMap`) — access order makes even `get` a write — or use Caffeine for a production cache (better hit rates with W-TinyLFU, expiry, stats).

#### Why other answers fall short
- **`HashMap` + timestamp scan to evict** — eviction becomes O(n).
- **`PriorityQueue` by last access** — updating a priority is O(n) to find + O(log n).
- **"Just use `ConcurrentHashMap`"** — no eviction policy.

#### Follow-up
**How would you implement it without `LinkedHashMap`?** `HashMap<K, Node>` plus your own doubly linked list with sentinel head/tail nodes; see the [LRU cache exercise](problem:lru-cache).

### Top-K frequent words
`id: top-k-frequent` `level: intermediate` `kind: coding` `lessons: queues-and-deques,collectors`

Return the `k` most frequent words, most frequent first, ties broken alphabetically.

#### Hints
1. Count first. Which map?
2. Sorting all distinct words is O(m log m). Can a heap of size `k` do better?

#### Answer
```java
static List<String> topK(List<String> words, int k) {
    Map<String, Integer> counts = new HashMap<>();
    for (String w : words) counts.merge(w, 1, Integer::sum);

    Comparator<Map.Entry<String, Integer>> worstFirst =
        Map.Entry.<String, Integer>comparingByValue()
                 .thenComparing(Map.Entry.comparingByKey(Comparator.reverseOrder()));
    PriorityQueue<Map.Entry<String, Integer>> heap = new PriorityQueue<>(worstFirst);
    for (Map.Entry<String, Integer> e : counts.entrySet()) {
        heap.offer(e);
        if (heap.size() > k) heap.poll();                 // drop the current worst
    }
    List<String> result = new ArrayList<>();
    while (!heap.isEmpty()) result.add(heap.poll().getKey());
    Collections.reverse(result);                           // best first
    return result;
}
```

Counting is O(n); the bounded heap is O(m log k) for m distinct words; memory O(m). The heap's comparator must order the **worst** candidate first (lowest count, and for equal counts the alphabetically *later* word), because that's what gets evicted.

#### Why other answers fall short
- **Sorting all entries** works (O(m log m)) but misses the heap optimisation interviewers look for when k ≪ m.
- **Forgetting the tie-break** gives nondeterministic results.
- **A max-heap of all entries** costs O(m log m) and O(m) heap memory.

#### Follow-up
**What if the words arrive as an unbounded stream and you need the top-k at any time?** Keep the count map plus a structure ordered by count (e.g. `TreeMap<Integer, Set<String>>` buckets), or approximate with a Count-Min Sketch + heap when memory is limited.
