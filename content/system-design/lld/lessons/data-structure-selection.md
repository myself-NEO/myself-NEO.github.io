## Why data structures matter in LLD

LLD isn't only about classes. The collections **inside** your classes decide whether `findNearestFreeSpot()` is O(1) or O(n), whether a cache can evict in constant time, and whether an overlap check scans every booking. Interviewers listen for **data structure choices justified by access patterns**, and for awareness of when performance doesn't matter at all.

## Derive the structure from the operations

1. List the **operations** the requirement needs (insert, lookup by key, min/max, range query, ordered iteration, remove arbitrary element).
2. Estimate **sizes and frequencies** (50 rooms? 1M cache entries? 10k requests/sec?).
3. Pick the structure whose **cost profile** matches the hot operations.
4. **Say the complexity out loud**, and what you'd change at larger scale.

## The LLD cheat sheet

| Requirement shape | Structure | Hot operations |
|---|---|---|
| Lookup by ID | `HashMap<Id, T>` | O(1) get/put |
| "Next free" with priority (nearest spot, earliest job) | `PriorityQueue` / `TreeSet` | O(log n) poll/insert; `TreeSet` also supports O(log n) arbitrary removal |
| Interval/overlap checks, "what's just before/after time T" | `TreeMap<Instant, …>` | `floorEntry`/`ceilingEntry` O(log n) |
| LRU ordering | `LinkedHashMap` (access order) or `HashMap` + doubly linked list | O(1) get/put/evict |
| LFU | `HashMap` + frequency → `LinkedHashSet` buckets + min-frequency pointer | O(1) |
| FIFO queue, sliding window of timestamps | `ArrayDeque` | O(1) at both ends |
| Membership, de-duplication | `HashSet` | O(1) contains |
| Small fixed key set (enums) | `EnumMap` / `EnumSet` | Array-fast |
| Counters per key, concurrently | `ConcurrentHashMap<K, LongAdder>` | Lock-free-ish increments |
| Leaderboard / top-K | `TreeMap<Score, Set<Id>>` or a heap of size K | O(log n) updates |
| Prefix search (autocomplete) | Trie | O(length of key) |
| Grid / board | 2D array | O(1) cell access |

## Worked example 1: O(1) free-spot allocation

Naive: scan all spots for a free one that fits — O(n) per park. Better: keep a **free pool per spot size**, ordered by preference (distance from entrance).

```java title="Free-spot pools: O(log n) allocate and release" file="SpotPoolDemo.java"
import java.util.Comparator;
import java.util.EnumMap;
import java.util.Map;
import java.util.Optional;
import java.util.TreeSet;

public class SpotPoolDemo {
    public static void main(String[] args) {
        SpotPool pool = new SpotPool();
        pool.add(new Spot("L1-05", SpotSize.MEDIUM, 5));
        pool.add(new Spot("L1-02", SpotSize.MEDIUM, 2));
        pool.add(new Spot("L2-01", SpotSize.LARGE, 101));

        Spot first = pool.allocate(SpotSize.MEDIUM).orElseThrow();   // nearest medium: L1-02
        System.out.println("Allocated " + first.id());
        System.out.println("Next medium: " + pool.allocate(SpotSize.MEDIUM).map(Spot::id).orElse("none"));
        System.out.println("Another medium? " + pool.allocate(SpotSize.MEDIUM).map(Spot::id).orElse("none -> try LARGE"));
        pool.release(first);
        System.out.println("After release: " + pool.allocate(SpotSize.MEDIUM).map(Spot::id).orElse("none"));
    }
}

enum SpotSize { SMALL, MEDIUM, LARGE }
record Spot(String id, SpotSize size, int distance) {}

final class SpotPool {
    private static final Comparator<Spot> NEAREST_FIRST = Comparator.comparingInt(Spot::distance).thenComparing(Spot::id);
    private final Map<SpotSize, TreeSet<Spot>> free = new EnumMap<>(SpotSize.class);

    SpotPool() {
        for (SpotSize s : SpotSize.values()) free.put(s, new TreeSet<>(NEAREST_FIRST));
    }

    void add(Spot s) { free.get(s.size()).add(s); }                            // O(log n)

    Optional<Spot> allocate(SpotSize size) { return Optional.ofNullable(free.get(size).pollFirst()); }   // O(log n)

    void release(Spot s) { free.get(s.size()).add(s); }                        // O(log n)
}
```

A `TreeSet` (rather than a `PriorityQueue`) also supports removing an *arbitrary* spot in O(log n), for example when a spot goes out of service.

## Worked example 2: O(1) LRU cache in a few lines

```java title="LinkedHashMap in access order" file="LruDemo.java"
import java.util.LinkedHashMap;
import java.util.Map;

public class LruDemo {
    public static void main(String[] args) {
        LruCache<String, Integer> cache = new LruCache<>(2);
        cache.put("a", 1);
        cache.put("b", 2);
        cache.get("a");          // a becomes most recently used
        cache.put("c", 3);       // evicts b (least recently used)
        System.out.println(cache.keySet());   // [a, c]
    }
}

final class LruCache<K, V> extends LinkedHashMap<K, V> {
    private final int capacity;

    LruCache(int capacity) {
        super(16, 0.75f, true);          // accessOrder = true
        this.capacity = capacity;
    }

    @Override protected boolean removeEldestEntry(Map.Entry<K, V> eldest) { return size() > capacity; }
}
```

In an interview, mention this as the quick version, then be ready to build the hash map plus doubly linked list yourself, and to make it thread-safe. See [Cache with Eviction](problem:cache-eviction).

## Performance considerations in object-oriented designs

- **Big-O first, constants second.** At interview scale, an O(n) scan over 50 rooms is fine; say so. At 10M entries, choose the right structure.
- **Allocation churn.** Creating many short-lived objects (a new `Money` per addition) is usually fine on the modern JVM, whose young-generation GC is cheap. Don't contort designs to avoid small objects — but avoid allocations in very hot loops when profiling shows a problem.
- **Boxing.** `Map<Integer, Integer>` boxes every value. For huge numeric maps, primitive arrays or specialised collections help. Rarely needed in interviews.
- **Indirection cost.** Interfaces and virtual calls are effectively free after JIT inlining in most cases. Design clarity wins.
- **Hot locks.** One global lock around a shared structure is often the real bottleneck under concurrency; prefer `ConcurrentHashMap`, lock striping or per-aggregate locks. See [Locks & Atomics](lesson:locks-and-atomics).
- **Memory.** A `HashMap` entry costs ~32–48 bytes plus key and value objects. Estimate when the requirements mention millions of entries.
- **Measure** (JMH, a profiler) before micro-optimising in real systems.

## Real-world example

A notification scheduler stored pending reminders in a `List` and, every second, scanned it for due items. With 2M reminders, each tick took ~200ms of CPU. Switching to a `PriorityQueue` keyed by due time made each tick O(k log n) for the k due items, and CPU dropped to near zero. Nothing about the class design changed; only the inner collection did. See [Task Scheduler](problem:task-scheduler).

## Common mistakes

- `list.contains()` / `list.remove(obj)` inside loops (accidental O(n²)).
- `PriorityQueue` when arbitrary removal or updating priorities is needed (O(n) remove). Use `TreeSet` or lazy deletion.
- Mutable objects as keys in hash or tree collections.
- Premature optimisation that obscures the design (bit-packing a parking lot).
- Forgetting **ordering guarantees**: `HashMap` iteration order is unspecified; use `LinkedHashMap` or `TreeMap` when order matters.

## In the interview

> [!INTERVIEW] Tie structure to requirement and scale
> *"Free spots per size are kept in a `TreeSet` ordered by distance, so allocation is O(log n). Active tickets are in a `ConcurrentHashMap` by ticket ID. For a single lot of a few thousand spots this is plenty; at city scale I'd shard by lot."*

## Key takeaways

- Choose data structures from **operations, sizes and frequencies**; say the complexity.
- Know the LLD staples: `HashMap`, `TreeMap`/`TreeSet`, `PriorityQueue`, `ArrayDeque`, `LinkedHashMap`, `EnumMap`.
- Performance is mostly about **algorithms and contention**, rarely about object counts or virtual calls.
- At small scale, simple wins; at large scale, the right structure is the design.

## Knowledge check

```quiz
? A booking system must quickly find the booking that starts just before a given time. Which structure fits?
+ TreeMap with floorEntry()
- HashMap
- ArrayDeque
> TreeMap supports ordered floor and ceiling queries in O(log n).

? Why might TreeSet be preferable to PriorityQueue for free parking spots?
+ It supports O(log n) removal of arbitrary elements (a spot going out of service), not just the minimum
- PriorityQueue can't hold objects
- TreeSet is always faster for everything
> PriorityQueue.remove(Object) is O(n); TreeSet removal is O(log n).

? What's the simplest correct way to get an LRU cache in Java?
+ A LinkedHashMap with accessOrder=true that overrides removeEldestEntry
- An ArrayList with linear search
- A HashSet
> LinkedHashMap maintains access order and supports eviction of the eldest entry.
```

## Exercise

Design the data structures for a **leaderboard** service: `addScore(player, points)` (adds to the player's total), `top(k)` returning the top k players with ties broken by name, and `rank(player)`. Expect 1M players and frequent updates. State the complexity of each operation.

````hint title="Hint"
You need lookup by player (to find their current score) and ordering by score. Two structures kept in sync.
````

````solution title="Sample answer"
- `Map<String, Long> scoreByPlayer` (`HashMap`) — O(1) lookup of a player's current total.
- `TreeSet<Entry>` ordered by score descending, then name — `Entry(name, score)` as an immutable record.

**addScore(p, pts):** look up the old score in O(1); remove `Entry(p, old)` from the tree in O(log n); insert `Entry(p, old + pts)` in O(log n); update the map. Total **O(log n)**.

**top(k):** iterate the first k entries of the tree — **O(k)** after an O(log n) start.

**rank(player):** a `TreeSet` doesn't support rank in O(log n) (`headSet(e).size()` is O(n)). Options: accept O(n) for occasional calls; use an **order-statistic tree** (a balanced BST with subtree sizes) for O(log n); or bucket by score with prefix counts in a Fenwick tree if scores are bounded integers.

Mention concurrency: guard the two structures with one lock (they must stay in sync), or use a single-writer design with a queue of updates.
````
