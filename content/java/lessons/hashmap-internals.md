## Concept explanation

### What it is

`HashMap<K, V>` stores key–value pairs in an **array of buckets**. A key's **hash code** decides which bucket it goes in, so `get`, `put` and `remove` usually touch one bucket: **O(1) on average**.

- One `null` key and any number of `null` values are allowed.
- No ordering guarantee (iteration follows bucket order, which changes when the table resizes).
- Not thread-safe.
- Keys must implement `equals` and `hashCode` consistently (see [equals and hashCode](lesson:equals-and-hashcode)) and must not change while in the map.

### Why it exists

Searching a list for a key is O(n). Hashing turns a key into an array index directly, so lookup cost doesn't grow with the number of entries — the foundation of caches, indexes, de-duplication, counting and nearly every "lookup by id" in software.

### The key numbers (JDK 8 and later)

| Constant | Value | Meaning |
|---|---|---|
| default initial capacity | **16** | buckets in the table (always a power of two) |
| default load factor | **0.75** | resize when `size > capacity × 0.75` |
| initial threshold | **12** | 16 × 0.75 |
| `TREEIFY_THRESHOLD` | **8** | a bucket with this many nodes becomes a red-black tree… |
| `MIN_TREEIFY_CAPACITY` | **64** | …but only if the table has at least 64 buckets; otherwise the table is resized instead |
| `UNTREEIFY_THRESHOLD` | **6** | a tree bucket shrunk to this size (during resize) turns back into a list |

### Complexity

| Operation | Average | Worst case (all keys collide) |
|---|---|---|
| `get` / `put` / `remove` / `containsKey` | **O(1)** | O(log n) with treeified buckets of `Comparable` keys; O(n) otherwise |
| `containsValue` | O(n) | O(n) |
| iteration | O(capacity + size) | |

### When to use it

Any time you look things up by a key and don't need ordering. Use `LinkedHashMap` for insertion or access order, `TreeMap` for sorted keys and range queries, `EnumMap` for enum keys, and `ConcurrentHashMap` when threads share the map.

## Internal working

### Architecture

```java
transient Node<K,V>[] table;      // the buckets; allocated lazily on the first put
transient int size;               // number of mappings
int threshold;                    // resize when size exceeds this (capacity * loadFactor)
transient int modCount;           // for fail-fast iterators

static class Node<K,V> {          // one entry in a bucket's linked list
    final int hash;               // spread hash, cached so it's never recomputed
    final K key;
    V value;
    Node<K,V> next;
}
// TreeNode<K,V> (extends LinkedHashMap.Entry -> Node) is used once a bucket is treeified
```

### Step 1 — hash spreading

```java
static final int hash(Object key) {
    int h;
    return (key == null) ? 0 : (h = key.hashCode()) ^ (h >>> 16);
}
```

The table index uses only the **low bits** of the hash. XOR-ing the high 16 bits into the low 16 lets keys whose hash codes differ only in high bits (common for floats, `Long`s, some objects) land in different buckets. `null` always hashes to 0.

### Step 2 — bucket index

`index = (n - 1) & hash`, where `n` is the table length. Because `n` is a power of two, `n - 1` is a mask of ones (`15` = `0b1111`), so this equals `hash % n` for non-negative values but is a single AND instruction. That's why capacities are always rounded up to a power of two (`new HashMap<>(100)` gets 128 buckets).

### Step 3 — `put(key, value)` (insertion)

1. If the table is `null`, `resize()` allocates it (16 buckets by default).
2. Compute `hash` and `i = (n - 1) & hash`.
3. **Empty bucket** → store a new `Node` there.
4. **Occupied** → compare with the first node: same `hash` **and** (`==` or `equals`) → **replace the value** and return the old one.
5. If the bucket is a **tree** → `putTreeVal` (red-black tree insert).
6. Otherwise **walk the list**; if a matching key is found, replace its value; if not, **append** a new node at the **tail** (Java 7 inserted at the head).
7. If the list now has **8** nodes → `treeifyBin`: if the table has fewer than 64 buckets, **resize** instead; otherwise convert the bucket into a red-black tree.
8. `modCount++`; if `++size > threshold` → **resize**.

Comparing the cached `hash` first avoids calling `equals` on most non-matching nodes.

### Step 4 — `get(key)` (retrieval)

Compute the hash and index; check the first node; if it's a tree, search the tree (`getTreeNode`), else walk the list comparing `hash`, then `==`, then `equals`. Return the value or `null`. (A `null` result is ambiguous when null values are stored — use `containsKey` or `getOrDefault`.)

### Step 5 — collisions

Two keys **collide** when they map to the same bucket — either equal hash codes or different hashes with the same low bits. Java uses **separate chaining**: the bucket holds a linked list of nodes. Lookups in a long chain degrade toward O(n).

### Step 6 — resizing

When `size` exceeds `threshold`, `resize()` **doubles** the table and moves every node. Because capacity doubles, a node at index `j` either **stays at `j`** or **moves to `j + oldCap`**, decided by one bit: `(hash & oldCap) == 0`. Each bucket is split into a "lo" and a "hi" list **preserving relative order** — no rehashing (`hashCode` isn't called again: the hash is cached in the node). Resizing is O(n), but happens rarely enough that `put` stays amortised O(1). Pre-size maps whose final size you know: `new HashMap<>((int) (expected / 0.75f) + 1)` (Java 19 added `HashMap.newHashMap(expected)`).

### Step 7 — treeification

Since Java 8 (JEP 180), a bucket with ≥ 8 nodes in a table of ≥ 64 buckets becomes a **red-black tree** of `TreeNode`s ordered by hash, then by `compareTo` if the keys are mutually `Comparable`, then by a tie-break on class name and identity hash. Lookups in that bucket become O(log n). This protects against **hash-flooding** attacks (an attacker sending many keys with colliding hash codes, e.g. crafted `String`s in HTTP parameters). For non-`Comparable` keys with identical hashes, the tree can't order them by key, so searches may still visit many nodes.

### Thread safety

`HashMap` has no synchronisation. Concurrent writers can **lose updates** (two `put`s into the same empty bucket — one node is overwritten), lose entries during a resize, leave `size` wrong, or expose partially constructed nodes to readers. In **Java 7**, concurrent resizes with head insertion could even create a **cycle** in a bucket's list, making a later `get` loop forever at 100 % CPU — Java 8's order-preserving tail insertion removed that particular failure, but not the others. Use `ConcurrentHashMap` (see [ConcurrentHashMap internals](lesson:concurrenthashmap-internals)).

### Memory

On a 64-bit JVM with compressed references, a `Node` is ~32 bytes (12-byte header + `hash` + three references, padded); a `TreeNode` ~56 bytes; plus 4 bytes per table slot. A map with a million entries costs ~36 MB **before** counting the keys and values themselves. The table never shrinks when entries are removed.

## Visual representation

```text title="put: hash spreading, index, collision, treeify"
  key "cat"   hashCode() = 98262             = 0x00017FD6
              h >>> 16                        = 0x00000001
              hash = h ^ (h >>> 16)           = 0x00017FD7
              index = (16 - 1) & hash = 0x7   -> bucket 7

  table (capacity 16)
   0 [ ]
   1 [ 1 ] -> [ 17 ] -> [ 33 ]          <- collision chain (Integer keys 1, 17, 33: same low 4 bits)
   ...
   7 [ "cat" ]
   ...
  15 [ ]

  a chain reaching 8 nodes:
     table < 64 buckets  -> resize() instead (the chain usually splits)
     table >= 64 buckets -> red-black tree (TreeNodes), O(log n) lookups in that bucket
```

```text title="resize 16 -> 32: each node stays at j or moves to j + 16"
  old bucket 1:  [1] -> [17] -> [33] -> [49]
  hash & 16:      0      16      0      16
                  lo     hi      lo     hi

  new bucket 1  (lo):  [1] -> [33]           relative order preserved
  new bucket 17 (hi):  [17] -> [49]          no hashCode() calls: hash is cached in each node
```

```text title="get(key)"
  hash(key) -> index -> first node:  hash equal? key == or equals?  -> found
                         |  no
                         v
             TreeNode? -> tree search O(log n)       else walk .next comparing hash, then equals
```

## Java code example

```java title="HashMapInternals.java" file="HashMapInternals.java"
import java.util.HashMap;
import java.util.Map;

public class HashMapInternals {
    // The JDK's spread function and index computation, reproduced
    static int spread(Object key) {
        int h;
        return key == null ? 0 : (h = key.hashCode()) ^ (h >>> 16);
    }

    static int index(Object key, int capacity) {
        return (capacity - 1) & spread(key);
    }

    public static void main(String[] args) {
        // 1. Where keys land
        for (Object key : new Object[] {"cat", "dog", 1, 17, 33, null}) {
            System.out.printf("%-5s hashCode=%-8d spread=%-8d bucket(16)=%d%n",
                    key, key == null ? 0 : key.hashCode(), spread(key), index(key, 16));
        }

        // 2. Iteration follows bucket order; a resize reorders it
        Map<Integer, String> map = new HashMap<>();
        for (int k : new int[] {33, 17, 16, 1}) {
            map.put(k, "v" + k);
        }
        System.out.println("16 buckets: " + map.keySet());          // bucket 0: 16; bucket 1: 33, 17, 1
        for (int k = 2; k <= 10; k++) {
            map.put(k, "v" + k);                                      // 13th entry > threshold 12 -> resize to 32
        }
        System.out.println("32 buckets: " + map.keySet());

        // 3. put returns the previous value; null key is allowed (bucket 0)
        Map<String, Integer> stock = new HashMap<>();
        System.out.println("put new -> " + stock.put("pen", 1) + ", put again -> " + stock.put("pen", 2) + ", null key -> " + stock.put(null, 0));
        System.out.println("get missing -> " + stock.get("ink") + ", getOrDefault -> " + stock.getOrDefault("ink", 0) + ", containsKey(null) -> " + stock.containsKey(null));

        // 4. Collisions: all keys share ONE hash code
        System.out.println("equals/compareTo calls for one get() among 1000 colliding keys:");
        System.out.println("  Comparable keys (treeified bucket): " + collide(true));
        System.out.println("  non-Comparable keys:                " + collide(false));
    }

    /** Inserts 1000 keys with the same hashCode, then counts the comparisons one lookup needs. */
    static String collide(boolean comparable) {
        Map<Object, Integer> m = new HashMap<>();
        for (int i = 0; i < 1000; i++) {
            m.put(comparable ? new CmpKey(i) : new PlainKey(i), i);
        }
        Counters.reset();
        Integer v = m.get(comparable ? new CmpKey(777) : new PlainKey(777));
        return "value " + v + ", equals " + Counters.equalsCalls + ", compareTo " + Counters.compareCalls;
    }
}

final class Counters {
    static int equalsCalls;
    static int compareCalls;

    static void reset() {
        equalsCalls = 0;
        compareCalls = 0;
    }
}

final class PlainKey {
    final int id;

    PlainKey(int id) {
        this.id = id;
    }

    @Override
    public int hashCode() {
        return 42;                                   // every key collides
    }

    @Override
    public boolean equals(Object o) {
        Counters.equalsCalls++;
        return o instanceof PlainKey && ((PlainKey) o).id == id;
    }
}

final class CmpKey implements Comparable<CmpKey> {
    final int id;

    CmpKey(int id) {
        this.id = id;
    }

    @Override
    public int hashCode() {
        return 42;                                   // every key collides
    }

    @Override
    public boolean equals(Object o) {
        Counters.equalsCalls++;
        return o instanceof CmpKey && ((CmpKey) o).id == id;
    }

    @Override
    public int compareTo(CmpKey other) {
        Counters.compareCalls++;
        return Integer.compare(id, other.id);
    }
}
```

## Output

```text title="Output" output="HashMapInternals.java"
cat   hashCode=98262    spread=98263    bucket(16)=7
dog   hashCode=99644    spread=99645    bucket(16)=13
1     hashCode=1        spread=1        bucket(16)=1
17    hashCode=17       spread=17       bucket(16)=1
33    hashCode=33       spread=33       bucket(16)=1
null  hashCode=0        spread=0        bucket(16)=0
16 buckets: [16, 33, 17, 1]
32 buckets: [33, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 16, 17]
put new -> null, put again -> 1, null key -> null
get missing -> null, getOrDefault -> 0, containsKey(null) -> true
equals/compareTo calls for one get() among 1000 colliding keys:
  Comparable keys (treeified bucket): value 777, equals 11, compareTo 9
  non-Comparable keys:                value 777, equals 466, compareTo 0
```

How to read it:

- `1`, `17` and `33` collide in bucket 1 of a 16-bucket table (same low four bits). Iteration printed bucket 0 (`16`) first, then bucket 1's chain in **insertion order** (`33, 17, 1`).
- The 13th entry exceeded the threshold (12): the table doubled to 32. `hash & 16` was `0` for `33` and `1` (they stayed in bucket 1, keeping their relative order) and `16` for `17` (moved to bucket 17) — so the iteration order changed. Never rely on `HashMap` order.
- With 1,000 colliding **`Comparable`** keys the bucket was a red-black tree: one lookup needed **9 `compareTo` calls** (about log2 1000) plus an `equals` check at each of the ~11 nodes on the path. That's O(log n).
- With **non-`Comparable`** keys the tree can't order keys whose hashes are equal, so the search has to explore both subtrees: **466 `equals` calls** for one `get` — essentially a linear scan. Treeification only rescues you if the keys are `Comparable`; a good `hashCode` is the real fix.

## Real-world application

- **Caches, indexes and counters** in every service (`Map<UserId, Session>`, `Map<String, Integer>` word counts, `Map<Sku, List<Order>>` groupings via `Collectors.groupingBy`).
- **Hash-flooding defence**: before Java 8, attackers could post thousands of form fields whose names had colliding `String` hash codes and make a server spend minutes in one request (CVE-2011-4858 and friends). Treeified buckets cap the damage at O(log n).
- **Performance tuning**: pre-sizing maps in hot paths avoids repeated resizes; good `hashCode` implementations (all significant fields) avoid long chains; immutable keys avoid lost entries.
- **Production incidents**: a `HashMap` shared between threads in a Java 7 service pinning a CPU at 100 % (the resize cycle) is a well-known war story; on Java 8+ the same bug shows up as silently missing data instead.

## Common mistakes

- **Mutable keys** whose `hashCode` changes after insertion — the entry becomes unreachable.
- **Overriding `equals` without `hashCode`** (or vice versa inconsistently).
- **Poor `hashCode`** (constant, or only using a field with few distinct values) → long chains.
- **Relying on iteration order** (it changes with capacity and Java version).
- **Sharing a `HashMap` across threads**, even "read-mostly" ones with occasional writes.
- **`get(k) == null` to test presence** when null values are possible — use `containsKey`.
- **Iterating `keySet()` and then calling `get(k)`** for each key — iterate `entrySet()` instead (one lookup fewer per entry).
- **Huge initial capacities** that waste memory (iteration cost is proportional to capacity).

## Interview questions

**Q1. Explain how `HashMap.put` works internally.**

````reveal title="Answer"
Compute `hash = h ^ (h >>> 16)` from `key.hashCode()` (0 for a null key); index = `(n - 1) & hash` with a power-of-two table (allocated lazily, 16 by default). If the bucket is empty, store a new node. Otherwise compare against the nodes in the bucket — cached hash first, then `==`/`equals`: a match replaces the value (returning the old one); a tree bucket uses a red-black-tree insert; a list bucket gets the new node appended at the tail. A list reaching 8 nodes is treeified if the table has ≥ 64 buckets, otherwise the table resizes. Finally `modCount++`, and if `size` exceeds `capacity × loadFactor` (12 initially), the table doubles and nodes are split between index `j` and `j + oldCap`.
````

**Q2. Why is the table size always a power of two?**

````reveal title="Answer"
So the index can be computed as `(n - 1) & hash` — a single AND instead of a modulo — and so resizing can split each bucket using one bit (`hash & oldCap`) without rehashing. The cost is that only low bits pick the bucket, which is why `HashMap` spreads high bits into low bits with `h ^ (h >>> 16)`.
````

**Q3. What changed in `HashMap` in Java 8?**

````reveal title="Answer"
Treeification of long buckets into red-black trees (≥ 8 nodes, table ≥ 64) giving O(log n) worst-case lookups for `Comparable` keys and hash-flooding resistance; a simpler hash spreading function (one XOR-shift instead of several); tail insertion in bucket lists and order-preserving resize splitting (no more resize cycles); and new default methods (`getOrDefault`, `putIfAbsent`, `compute`, `merge`, `forEach`, `replaceAll`).
````

**Q4. What is the load factor and how does it affect performance?**

````reveal title="Answer"
The maximum ratio of entries to buckets before the table doubles (0.75 by default). Lower values mean fewer collisions but more memory and more frequent resizes; higher values save memory but lengthen chains. 0.75 balances the two: with a decent hash function, the expected chain length stays well below 1.
````

**Q5. Why is `HashMap` not thread-safe? What can go wrong?**

````reveal title="Answer"
None of its fields are protected by locks or volatile semantics. Concurrent puts into the same empty bucket can overwrite each other's node (lost entry); concurrent resizes can drop entries; `size` and `modCount` updates race; readers may see partially initialised nodes. In Java 7, concurrent resizing could create a cyclic bucket list and make `get` spin forever. Use `ConcurrentHashMap` or external synchronisation.
````

**Q6. How many buckets does `new HashMap<>(100)` create, and when does it first resize?**

````reveal title="Answer"
The capacity is rounded up to the next power of two: 128 buckets (allocated on the first `put`). The threshold is 128 × 0.75 = 96, so it resizes to 256 when the 97th entry is added. To hold 100 entries without resizing you need capacity ≥ 100 / 0.75 ≈ 134 → 256 buckets; `HashMap.newHashMap(100)` (Java 19) computes that for you.
````

## Hands-on exercise

Answer by reasoning, then verify with code:

1. In a 16-bucket `HashMap`, which bucket do the `Integer` keys `5`, `21`, `37` and `48` use? Which collide?
2. Starting from an empty default `HashMap`, after which `put` does the first resize happen, and to what capacity?
3. After that resize, which of the keys from (1) move, and to which bucket?

Write a small program using the `spread`/`index` functions from the example to print the answers.

````hint title="Hint"
For small non-negative `Integer`s, `hashCode()` is the value and `h >>> 16` is 0, so the bucket is just `value & 15` (16 buckets) or `value & 31` (32 buckets). A key moves if `hash & 16` is non-zero.
````

````solution title="Solution"
```java title="BucketQuiz.java" file="BucketQuiz.java"
public class BucketQuiz {
    static int spread(Object key) {
        int h;
        return key == null ? 0 : (h = key.hashCode()) ^ (h >>> 16);
    }

    public static void main(String[] args) {
        int[] keys = {5, 21, 37, 48};
        for (int k : keys) {
            int hash = spread(k);
            int before = 15 & hash;
            int after = 31 & hash;
            System.out.println(k + ": bucket " + before + " of 16 -> bucket " + after + " of 32"
                    + ((hash & 16) != 0 ? "  (moves by +16)" : "  (stays)"));
        }
        int capacity = 16;
        int threshold = (int) (capacity * 0.75f);
        System.out.println("first resize when size exceeds " + threshold + ", i.e. on put #" + (threshold + 1) + ", to capacity " + capacity * 2);
    }
}
```

```text title="Output" output="BucketQuiz.java"
5: bucket 5 of 16 -> bucket 5 of 32  (stays)
21: bucket 5 of 16 -> bucket 21 of 32  (moves by +16)
37: bucket 5 of 16 -> bucket 5 of 32  (stays)
48: bucket 0 of 16 -> bucket 16 of 32  (moves by +16)
first resize when size exceeds 12, i.e. on put #13, to capacity 32
```

`5`, `21` and `37` collide in bucket 5 of 16. The 13th `put` triggers the first resize to 32 buckets; `21` and `48` move by +16, the others stay.
````

## Knowledge check

```quiz
? How does HashMap compute the bucket index?
+ (table.length - 1) & spread(hashCode)
- hashCode % 10
- hashCode >>> 16
> Power-of-two tables allow a bit mask instead of a modulo.

? When does a default HashMap first resize?
- When it has 16 entries
+ When the 13th entry is added (size exceeds 12 = 16 x 0.75)
- When a bucket has 8 entries
> threshold = capacity x load factor.

? A bucket list reaches 8 nodes but the table has only 32 buckets. What happens?
- It becomes a red-black tree
+ The table is resized instead
- An exception is thrown
> Treeification requires at least 64 buckets (MIN_TREEIFY_CAPACITY).

? During a resize from 16 to 32, a node in bucket 3 ends up in...
+ bucket 3 or bucket 19, depending on (hash & 16)
- any bucket; it is rehashed from scratch
- bucket 6
> Each node stays at j or moves to j + oldCap.

? What does map.put(k, v) return when k was already present?
+ The previous value
- true
- null always
> put returns the old value (or null if there was none or it was null).
```

## Key takeaways

- **Array of buckets** + **separate chaining**; index = `(n - 1) & (h ^ (h >>> 16))` with power-of-two capacity.
- **put**: empty bucket → new node; match by cached hash then `equals` → replace; else append at tail; **≥ 8** nodes → tree (if **≥ 64** buckets) else resize.
- Colliding keys are O(log n) only when they're `Comparable`; otherwise a treeified bucket can still be scanned linearly.
- **Resize** at `size > capacity × 0.75`: double, split each bucket into `j` / `j + oldCap` without rehashing.
- Average **O(1)**, worst **O(log n)** for comparable colliding keys; iteration order is unspecified and changes.
- **Not thread-safe**; keys must be immutable with consistent `equals`/`hashCode`.
