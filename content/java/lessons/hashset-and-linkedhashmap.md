## Concept explanation

### `HashSet` — a `HashMap` in disguise

`HashSet<E>` stores unique elements with O(1) average `add`, `remove` and `contains`. It **is implemented with a `HashMap`**: each element is a **key**, and every value is the same dummy object (`PRESENT`). Everything you learned in [HashMap internals](lesson:hashmap-internals) applies: hashing, buckets, resizing, treeification, `equals`/`hashCode` requirements, one `null` allowed, no ordering, not thread-safe.

`add(e)` returns `true` if the element was new and `false` if an equal element was already present — handy for de-duplication logic.

### `LinkedHashSet` and `LinkedHashMap` — hash tables with order

`LinkedHashMap<K, V>` extends `HashMap` and threads a **doubly linked list** through all its entries, so iteration has a predictable order:

- **Insertion order** (default): the order keys were first inserted. Re-inserting an existing key doesn't change its position.
- **Access order** (`new LinkedHashMap<>(capacity, loadFactor, true)`): every `get`, `put` or `getOrDefault` of a key moves it to the **end** — the least recently used entry is always first.

`LinkedHashSet<E>` is a `HashSet` backed by a `LinkedHashMap` (insertion order only).

Bonus: **`removeEldestEntry(Map.Entry eldest)`** is a hook called after every `put`; return `true` to evict the eldest entry. Combined with access order, that's an **LRU cache in a few lines**.

### Complexity

| Operation | `HashSet` / `HashMap` | `LinkedHashSet` / `LinkedHashMap` |
|---|---|---|
| add / put / contains / get / remove | O(1) average | O(1) average (slightly more work: link/unlink) |
| iteration | O(capacity + size), unspecified order | **O(size)**, predictable order |
| memory per entry | ~32 B `Node` | ~40 B `Entry` (two extra links) |

### When to use which

- `HashSet` — uniqueness, membership tests, de-duplication when order doesn't matter.
- `LinkedHashSet` — de-duplicate **while preserving first-seen order** (very common for user-visible lists).
- `LinkedHashMap` (insertion order) — maps whose iteration order must be stable: JSON output, configuration, test expectations.
- `LinkedHashMap` (access order) — small LRU caches. For production caches with size/time eviction, statistics and concurrency, use a library like Caffeine.

## Internal working

### `HashSet`

```java
private transient HashMap<E,Object> map;
private static final Object PRESENT = new Object();

public boolean add(E e)       { return map.put(e, PRESENT) == null; }
public boolean contains(Object o) { return map.containsKey(o); }
public boolean remove(Object o)   { return map.remove(o) == PRESENT; }
```

So insertion, lookup and removal are exactly `HashMap`'s algorithms on the key. `new HashSet<>(collection)` sizes the map to hold the collection without resizing.

### `LinkedHashMap`

- `LinkedHashMap.Entry<K,V> extends HashMap.Node<K,V>` and adds `before` and `after` pointers; the map keeps `head` and `tail`.
- `HashMap` calls three **hooks** that `LinkedHashMap` overrides: `afterNodeInsertion` (may call `removeEldestEntry`), `afterNodeAccess` (in access-order mode, move the node to the tail), `afterNodeRemoval` (unlink).
- **Insertion**: the bucket insert is `HashMap`'s; the new entry is also linked at the `tail`.
- **Retrieval**: `get` is `HashMap`'s bucket lookup, plus (access order) relinking to the tail — which is a **structural modification** for iterators: iterating an access-ordered map while calling `get` throws `ConcurrentModificationException`.
- **Iteration** follows `head → tail` links, not buckets, so it's O(size) regardless of capacity and stable across resizes.
- **Thread safety**: none. An access-ordered map mutates on *reads*, so even "read-only" concurrent use is unsafe. Wrap with `Collections.synchronizedMap` or use a concurrent cache.

## Visual representation

```text title="LinkedHashMap: buckets for lookup, a linked list for order"
   buckets (HashMap part)                  insertion/access order (linked part)
   0 [ ]                                   head
   1 [ "a" ] -> [ "q" ]                     |
   2 [ ]                                    v
   3 [ "m" ]                               "m" <-> "a" <-> "q" <-> "z"
   4 [ "z" ]                                                        ^
                                                                   tail

   access order, get("a"):   "m" <-> "q" <-> "z" <-> "a"     ("a" moved to the tail)
   put("new") with capacity 4 + removeEldestEntry -> evict head ("m")
```

## Java code example

```java title="LinkedStructures.java" file="LinkedStructures.java"
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class LinkedStructures {
    public static void main(String[] args) {
        // HashSet: add returns false for duplicates; order unspecified
        Set<String> seen = new HashSet<>();
        for (String email : List.of("ada@x.io", "bob@x.io", "ADA@x.io".toLowerCase(), "cy@x.io")) {
            if (!seen.add(email)) {
                System.out.println("duplicate: " + email);
            }
        }
        System.out.println("HashSet size " + seen.size());

        // LinkedHashSet: de-duplicate preserving first-seen order
        List<String> clicks = List.of("home", "search", "home", "cart", "search", "checkout");
        System.out.println("journey: " + new LinkedHashSet<>(clicks));

        // LinkedHashMap insertion order: re-putting a key keeps its position
        Map<String, Integer> config = new LinkedHashMap<>();
        config.put("timeout", 30);
        config.put("retries", 3);
        config.put("timeout", 60);                                  // updates value, same position
        config.put("region", 1);
        System.out.println("insertion order: " + config);

        // Access order: get() moves the key to the end
        Map<String, Integer> access = new LinkedHashMap<>(16, 0.75f, true);
        access.put("a", 1);
        access.put("b", 2);
        access.put("c", 3);
        access.get("a");
        System.out.println("access order after get(a): " + access.keySet());

        // An LRU cache in a few lines
        LruCache<Integer, String> cache = new LruCache<>(3);
        cache.put(1, "one");
        cache.put(2, "two");
        cache.put(3, "three");
        cache.get(1);                                               // 1 is now most recently used
        cache.put(4, "four");                                       // evicts the LRU entry: 2
        System.out.println("LRU cache: " + cache.keySet() + ", evicted: " + cache.evicted());
    }
}

final class LruCache<K, V> extends LinkedHashMap<K, V> {
    private final int capacity;
    private final StringBuilder evicted = new StringBuilder();

    LruCache(int capacity) {
        super(16, 0.75f, true);                                     // access order
        this.capacity = capacity;
    }

    @Override
    protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
        boolean evict = size() > capacity;
        if (evict) {
            evicted.append(eldest.getKey()).append(' ');
        }
        return evict;
    }

    String evicted() {
        return evicted.toString().trim();
    }
}
```

## Output

```text title="Output" output="LinkedStructures.java"
duplicate: ada@x.io
HashSet size 3
journey: [home, search, cart, checkout]
insertion order: {timeout=60, retries=3, region=1}
access order after get(a): [b, c, a]
LRU cache: [3, 1, 4], evicted: 2
```

- `HashSet.add` returned `false` for the normalised duplicate.
- The `LinkedHashSet` kept the first occurrence of each page, in order.
- Updating `timeout` changed its value but not its position (insertion-order mode).
- In access-order mode `get("a")` moved `a` to the end; the LRU cache evicted `2`, the least recently used key, when the fourth entry arrived.

> [!NOTE] Java 21 sequenced collections
> Since Java 21, `LinkedHashMap` and `LinkedHashSet` implement `SequencedMap`/`SequencedSet`: `firstEntry()`, `lastEntry()`, `pollFirstEntry()`, `putFirst()`, `putLast()` and `reversed()` work directly. In Java 17 you get the first entry with `map.entrySet().iterator().next()`.

## Real-world application

- **De-duplication**: event IDs already processed (`Set<String>`), unique visitors, removing duplicate rows while keeping order for display.
- **Deterministic output**: building JSON objects or HTTP headers with `LinkedHashMap` so responses and snapshots are stable (Jackson preserves `LinkedHashMap` order).
- **LRU caches**: small in-process caches (compiled regexes, templates, parsed configs) with `LinkedHashMap` access order + `removeEldestEntry`, wrapped in `Collections.synchronizedMap` if shared.
- **`Collectors.toMap(…, LinkedHashMap::new)`** and `groupingBy(…, LinkedHashMap::new, …)` keep stream results in encounter order.

## Common mistakes

- **Expecting `HashSet` to keep insertion order** (or sorted order).
- **Mutating elements of a `HashSet`** in a way that changes their hash code.
- **Using an access-ordered `LinkedHashMap` from several threads** — reads modify it.
- **Iterating an access-ordered map and calling `get`** inside the loop (CME).
- **Thinking `put` on an existing key moves it** in insertion-order mode (it doesn't; remove and re-put to move it).
- **Building big caches on `LinkedHashMap`** without eviction by time, metrics or concurrency — reach for Caffeine.

## Interview questions

**Q1. How is `HashSet` implemented?**

````reveal title="Answer"
As a wrapper around a `HashMap<E, Object>`: elements are stored as keys, all mapped to a shared dummy value. `add` is `map.put(e, PRESENT) == null`, `contains` is `containsKey`, `remove` is `map.remove`. So its performance, null handling, ordering (none) and `equals`/`hashCode` requirements are exactly `HashMap`'s.
````

**Q2. How does `LinkedHashMap` maintain order, and what's access order?**

````reveal title="Answer"
Each entry has `before`/`after` pointers forming a doubly linked list alongside the hash buckets; new entries are appended at the tail. In access-order mode (constructor flag `true`), every access moves the entry to the tail, so the head is the least recently used entry. Iteration walks the linked list, giving predictable order in O(size).
````

**Q3. Implement an LRU cache in Java.**

````reveal title="Answer"
Simplest: extend `LinkedHashMap` with access order and override `removeEldestEntry` to return `size() > capacity` — O(1) `get`/`put` with eviction of the least recently used entry. In an interview that forbids it, implement it with a `HashMap<K, Node>` plus your own doubly linked list (move-to-front on access, evict from the tail). For concurrency, wrap with `Collections.synchronizedMap` or use a concurrent cache library.
````

**Q4. `HashSet` vs `TreeSet` vs `LinkedHashSet`?**

````reveal title="Answer"
`HashSet`: O(1) operations, no order, uses `hashCode`/`equals`. `LinkedHashSet`: O(1) with insertion order, slightly more memory. `TreeSet`: O(log n), sorted by `compareTo`/comparator (which then defines equality), supports range queries (`floor`, `subSet`). Choose by ordering needs.
````

## Hands-on exercise

Write `static <T> List<T> firstOccurrences(List<T> items, int limit)` that returns the distinct items in first-seen order, but at most `limit` of them, and a `RecentSearches` class that keeps the **5 most recently used** search terms, where repeating a search moves it to the front, and `recent()` returns them most-recent-first.

````hint title="Hint"
`LinkedHashSet` + stop at `limit`. For recent searches, an access-ordered `LinkedHashMap<String, Boolean>` with `removeEldestEntry` evicts the oldest; reverse its key order for most-recent-first output (or use `put` after `remove` in insertion-order mode).
````

````solution title="Solution"
```java title="RecentDemo.java" file="RecentDemo.java"
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class RecentDemo {
    public static void main(String[] args) {
        System.out.println(firstOccurrences(List.of(3, 1, 3, 2, 1, 5, 4), 3));
        RecentSearches searches = new RecentSearches();
        for (String q : List.of("java", "jvm", "gc", "java", "jit", "jmm", "streams")) {
            searches.search(q);
        }
        System.out.println(searches.recent());
    }

    static <T> List<T> firstOccurrences(List<T> items, int limit) {
        Set<T> seen = new LinkedHashSet<>();
        for (T item : items) {
            if (seen.size() == limit) {
                break;
            }
            seen.add(item);
        }
        return new ArrayList<>(seen);
    }
}

final class RecentSearches {
    private static final int MAX = 5;
    private final Map<String, Boolean> terms = new LinkedHashMap<>(16, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Boolean> eldest) {
            return size() > MAX;
        }
    };

    void search(String term) {
        terms.put(term, Boolean.TRUE);                    // put also counts as an access
    }

    List<String> recent() {
        List<String> list = new ArrayList<>(terms.keySet());
        Collections.reverse(list);                        // most recent first
        return list;
    }
}
```

```text title="Output" output="RecentDemo.java"
[3, 1, 2]
[streams, jmm, jit, java, gc]
```

`java` was searched again before `jit`, so it stayed in the window while `jvm` (least recently used) was evicted.
````

## Knowledge check

```quiz
? What does HashSet use internally?
+ A HashMap whose keys are the elements
- A sorted array
- A linked list
> Every element is a key mapped to a shared dummy value.

? `set.add(x)` returns false. What does that mean?
+ An element equal to x was already in the set
- The set is full
- x is null
> add reports whether the set changed.

? In an insertion-ordered LinkedHashMap, `put("k", newValue)` for an existing key...
+ updates the value and keeps the key's original position
- moves the key to the end
- throws an exception
> Only access-order mode reorders on put/get.

? Why is an access-ordered LinkedHashMap unsafe even for concurrent reads?
+ get() relinks entries, so reads modify the structure
- It isn't; reads are always safe
- Because it uses a tree
> Access order turns reads into writes.
```

## Key takeaways

- `HashSet` = `HashMap` keys with a dummy value; same O(1) behaviour and requirements.
- `LinkedHashMap`/`LinkedHashSet` add a **doubly linked list** for **predictable iteration order**.
- **Access order** + **`removeEldestEntry`** = an O(1) **LRU cache**.
- Re-putting a key doesn't move it in insertion-order mode; reads move it in access-order mode.
- None are thread-safe; access order makes reads mutating.
