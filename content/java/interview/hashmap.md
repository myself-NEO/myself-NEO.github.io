# HashMap Internals

### How does `HashMap` work internally?
`id: hashmap-how-it-works` `level: intermediate` `kind: internals` `tricky` `lessons: hashmap-internals`

#### Hints
1. Start from `key.hashCode()`: how does it become an array index?
2. What happens when two keys land in the same bucket, and when the map gets full?

#### Answer
`HashMap` is an **array of buckets** (a power-of-two `Node[] table`, lazily allocated, 16 by default).

- **Hashing**: `hash = h ^ (h >>> 16)` where `h = key.hashCode()` (0 for a null key) — the XOR mixes high bits into the low bits used for indexing.
- **Index**: `(table.length - 1) & hash`.
- **put**: empty bucket → new node. Otherwise compare nodes by cached `hash`, then `==`/`equals`: a match replaces the value (returning the old one); else the node is **appended to the bucket's linked list**. When a list reaches **8** nodes it becomes a **red-black tree** (if the table has ≥ **64** buckets; otherwise the table resizes instead). Then if `size > capacity × 0.75` (threshold 12 initially) the table **doubles**: each node stays at index `j` or moves to `j + oldCap` depending on `hash & oldCap`, preserving order, with no rehashing.
- **get**: same hash and index, then compare the first node, search the tree, or walk the list.

Average O(1); worst O(log n) for colliding `Comparable` keys (tree buckets), O(n) otherwise. Not thread-safe; iteration order follows buckets and changes on resize.

#### Why other answers fall short
- **"It stores key-value pairs in an array using the hash code"** — misses collisions, `equals`, load factor and resizing.
- **"Collisions are resolved by open addressing."** `HashMap` uses separate chaining (`IdentityHashMap` uses linear probing).
- **"It always rehashes keys on resize."** The hash is cached in each node; resizing only checks one bit.

#### Follow-up
**Why does `HashMap` XOR the high 16 bits into the hash?** Because the index uses only the low bits; without spreading, keys whose hash codes differ only in high bits (common for `Float`s, some `Long`s and objects) would all collide in small tables.

### Why is `HashMap` not thread-safe?
`id: hashmap-not-thread-safe` `level: intermediate` `kind: internals` `tricky` `lessons: hashmap-internals,race-conditions-and-thread-safety`

#### Hints
1. Is any field volatile or guarded by a lock?
2. What happens if two threads `put` into the same empty bucket at the same moment? What about during a resize?

#### Answer
None of its state is synchronised or volatile, and its operations are multi-step read–modify–write sequences:

- **Lost entries**: two threads see the same empty bucket and both write a new node — one overwrites the other. Two threads appending to the same list can lose a link.
- **Lost updates**: `map.put(k, map.get(k) + 1)` from two threads drops increments (check-then-act across two calls).
- **Resize races**: concurrent resizes can drop entries or leave some threads using the old table; `size` and `modCount` updates race.
- **Visibility**: without happens-before, readers may see stale tables or partially constructed nodes.
- **Java 7 only**: concurrent resizing with head insertion could create a **cycle** in a bucket list; a later `get` then looped forever at 100 % CPU. Java 8's order-preserving split removed the cycle, but not the other failures.

Use `ConcurrentHashMap` (and its atomic `merge`/`compute`), or confine the map to one thread, or synchronise externally.

#### Why other answers fall short
- **"It throws `ConcurrentModificationException` when shared."** CME is a best-effort iterator check, not a thread-safety mechanism; most races corrupt silently.
- **"Only writes are a problem; concurrent reads during writes are fine."** Readers can see inconsistent state without synchronisation.

#### Follow-up
**Is a `HashMap` that's fully built before being shared, and never modified again, safe to read from many threads?** Yes, if it is **safely published** (e.g. assigned to a `final` field during construction of the sharing object, or through a `volatile`/concurrent handoff). Even better: `Map.copyOf(map)` and publish the immutable copy.

### Load factor, threshold and capacity
`id: hashmap-load-factor` `level: beginner` `kind: concept` `lessons: hashmap-internals`

`new HashMap<>(100)` — how many buckets does it have, and when does it first resize?

#### Hints
1. Capacities are always powers of two.
2. threshold = capacity × load factor.

#### Answer
The requested 100 is rounded up to the next power of two: **128 buckets** (allocated on the first `put`). The threshold is 128 × 0.75 = **96**, so adding the **97th** entry doubles the table to 256.

The load factor (0.75) trades memory for collision probability: lower → fewer collisions, more memory and more resizes; higher → denser table, longer chains. To hold *n* entries without resizing, request `n / 0.75 + 1` (Java 19+: `HashMap.newHashMap(n)`).

#### Why other answers fall short
- **"100 buckets."** Capacities are powers of two.
- **"It resizes when it has 100 entries."** It resizes at the threshold, not at the capacity.

#### Follow-up
**Does `HashMap` ever shrink?** No — removing entries never shrinks the table; iteration cost stays proportional to capacity. Create a new map to release it.

### When does a bucket become a tree?
`id: hashmap-treeify` `level: advanced` `kind: internals` `tricky` `lessons: hashmap-internals`

#### Hints
1. There are two conditions, one about the bucket and one about the table.
2. What does a tree need in order to order keys whose hashes are equal?

#### Answer
When a bucket's list reaches **8 nodes** (`TREEIFY_THRESHOLD`) **and** the table has at least **64 buckets** (`MIN_TREEIFY_CAPACITY`). If the table is smaller, `HashMap` **resizes** instead, because long chains in a small table usually mean the table is too small, not that hashing is bad. A tree bucket shrinks back to a list at **6** nodes (`UNTREEIFY_THRESHOLD`) during a resize split.

Tree nodes are ordered by hash, then by `compareTo` if the keys are mutually `Comparable`, then by a tie-break (class name, identity hash). So colliding **`Comparable`** keys get O(log n) lookups; colliding non-comparable keys with identical hashes may still need a near-linear search.

This exists mainly to defeat **hash-flooding** attacks (many crafted keys with the same hash).

#### Why other answers fall short
- **"At 8 entries in the map."** It's per bucket.
- **"Treeification makes all lookups O(log n)."** Only within treeified buckets, and only well for `Comparable` keys.

#### Follow-up
**Why 8?** With a good hash and load factor 0.75, bucket sizes follow roughly a Poisson distribution with mean 0.5; the probability of a bucket reaching 8 is about 6 in 100 million — so trees only appear with pathological hashes.

### A key "disappears" from a `HashMap`
`id: hashmap-mutable-key` `level: intermediate` `kind: debugging` `lessons: hashmap-internals,equals-and-hashcode`

```java
Map<List<String>, String> m = new HashMap<>();
List<String> key = new ArrayList<>(List.of("a"));
m.put(key, "value");
key.add("b");
System.out.println(m.get(key) + " " + m.size() + " " + m.containsValue("value"));
```

#### Hints
1. Where was the entry stored, and with which hash?
2. Which hash does `get` compute now?

#### Answer
It prints `null 1 true`. The entry was stored in the bucket for the hash of `["a"]` (and that hash is cached in the node). After `key.add("b")`, `key.hashCode()` changed, so `get` looks in a different bucket (or compares against the stale cached hash) and finds nothing — while the entry still sits in the map, unreachable by key: a memory leak.

Keys must be **immutable** (or at least never change the fields used by `equals`/`hashCode` while in a map). Use `List.copyOf(...)`, records, strings, or value objects.

#### Why other answers fall short
- **`value 1 true`** — assumes `HashMap` tracks the object identity; it uses the hash and `equals`.
- **`ConcurrentModificationException`** — nothing iterates.

#### Follow-up
**Would an `IdentityHashMap` find it?** Yes — it uses identity hash codes and `==`, which don't change when the list's contents change.

### Why are `HashMap` capacities powers of two?
`id: hashmap-power-of-two` `level: intermediate` `kind: internals` `lessons: hashmap-internals,operators`

#### Hints
1. What is `x % 16` in binary terms for non-negative x?
2. What happens to a node's index when the capacity doubles?

#### Answer
Two reasons:

1. **Cheap indexing**: with `n = 2^k`, `hash % n` equals `hash & (n - 1)` for non-negative values — a single AND instead of a division, and it also works for negative hashes (the mask drops the sign bit).
2. **Cheap resizing**: when capacity doubles, a node's new index is either the same `j` or `j + oldCap`, decided by one bit (`hash & oldCap`). Buckets split into two lists without recomputing hash codes.

The downside is that only the low bits select the bucket, so `HashMap` spreads high bits downward with `h ^ (h >>> 16)`.

#### Why other answers fall short
- **"Prime sizes would be better."** Primes spread poor hashes better (that's `Hashtable`'s approach: `% length` with `2n+1` growth) but cost a division per lookup; Java chose fast masking plus spreading.
- **"For memory alignment."** Unrelated.

#### Follow-up
**What does `new HashMap<>(17)` allocate?** 32 buckets (next power of two).

### What does this print?
`id: hashmap-iteration-order-resize` `level: advanced` `kind: output` `tricky` `lessons: hashmap-internals`

```java
Map<Integer, String> map = new HashMap<>();
for (int k : new int[] {33, 17, 16, 1}) map.put(k, "v");
System.out.println(map.keySet());
for (int k = 2; k <= 10; k++) map.put(k, "v");
System.out.println(map.keySet());
```

#### Hints
1. For small `Integer`s the hash is the value. With 16 buckets, which bucket does each key use?
2. The 13th entry triggers a resize to 32 buckets. Which keys move?

#### Answer
```text
[16, 33, 17, 1]
[33, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 16, 17]
```

With 16 buckets: `16` → bucket 0; `33`, `17`, `1` → bucket 1 (same low 4 bits), chained in insertion order. Iteration walks buckets in index order. Adding 2..10 makes 13 entries > threshold 12 → resize to 32: in bucket 1, `33` and `1` have `hash & 16 == 0` and stay (order preserved), `17` moves to bucket 17; `16` moves to bucket 16; 2..10 sit in their own buckets. Hence the second order.

The lesson: `HashMap` order is an artefact of bucket layout and changes with capacity — never depend on it. (Verified on JDK 17.)

#### Why other answers fall short
- **Insertion order** — that's `LinkedHashMap`.
- **Sorted order** — that's `TreeMap`; small integers *often* look sorted in a `HashMap` only because they land in consecutive buckets.

#### Follow-up
**How do you get insertion order?** `LinkedHashMap`. Sorted order: `TreeMap`.

### `HashMap` vs `Hashtable` vs `ConcurrentHashMap` — nulls and safety
`id: hashmap-nulls` `level: beginner` `kind: concept` `lessons: hashmap-internals,concurrenthashmap-internals,specialized-maps-and-sets`

#### Hints
1. Where does `HashMap` put a `null` key?
2. Why would a concurrent map forbid `null` values?

#### Answer
- **`HashMap`**: one `null` key (hash 0, bucket 0) and any number of `null` values; not thread-safe.
- **`Hashtable`**: no `null` keys or values (`NullPointerException`); every method synchronised; legacy.
- **`ConcurrentHashMap`**: no `null` keys or values; thread-safe with fine-grained locking.

`ConcurrentHashMap` bans nulls because `get(k) == null` must mean "absent": with nulls you'd need a separate `containsKey(k)`, which another thread could invalidate between the two calls. With a `HashMap` that stores null values, use `containsKey` or `getOrDefault` to tell "absent" from "mapped to null".

#### Why other answers fall short
- **"`HashMap` allows multiple null keys."** Keys are unique; there can be only one.
- **"`ConcurrentHashMap` forbids nulls for performance."** It's about unambiguous results under concurrency.

#### Follow-up
**What does `map.merge(k, v, f)` do if `f` returns `null`?** It removes the mapping — a convenient way to delete counters that reach zero.
