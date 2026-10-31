## Problem statement

Implement `SimpleHashMap<K, V>`, a hash table with **separate chaining** that follows the same design as `java.util.HashMap` (without tree bins):

| Member | Contract |
|---|---|
| `SimpleHashMap()` | capacity 16, load factor 0.75 |
| `SimpleHashMap(int initialCapacity, float loadFactor)` | capacity **rounded up to a power of two**; capacity < 1 or load factor ≤ 0 (or `NaN`) → `IllegalArgumentException` |
| `V put(K key, V value)` | insert or replace; returns the previous value or `null` |
| `V get(Object key)`, `V getOrDefault(Object key, V def)`, `boolean containsKey(Object key)` | lookups. `containsKey` distinguishes "absent" from "mapped to `null`" |
| `V remove(Object key)` | removes and returns the value, or `null` |
| `int size()`, `int capacity()`, `int maxBucketLength()` | the last two expose the table for tests and diagnostics |
| `void forEach(BiConsumer<? super K, ? super V> action)` | visits every entry |

**Design requirements**:
1. **Hash spreading**: `h ^ (h >>> 16)`, so high bits influence the bucket.
2. **Power-of-two indexing**: `index = hash & (capacity - 1)`.
3. **A `null` key** is allowed (hash 0), and so are **`null` values**.
4. **Resize** by doubling when `size > capacity × loadFactor`, re-distributing every node.
5. Each node stores its **hash**, so lookups compare hashes before calling `equals`, and resizing doesn't recompute `hashCode()`.

Don't use `java.util` maps or lists inside the implementation.

## Starter code

```java title="SimpleHashMap.java" starter="true"
import java.util.function.BiConsumer;

public class SimpleHashMap<K, V> {
    private static final class Node<K, V> {
        final int hash;
        final K key;
        V value;
        Node<K, V> next;

        Node(int hash, K key, V value, Node<K, V> next) {
            this.hash = hash;
            this.key = key;
            this.value = value;
            this.next = next;
        }
    }

    private Node<K, V>[] table;
    private int size;
    private final float loadFactor;

    public SimpleHashMap() {
        this(16, 0.75f);
    }

    @SuppressWarnings("unchecked")
    public SimpleHashMap(int initialCapacity, float loadFactor) {
        this.loadFactor = loadFactor;                                   // TODO: validate
        this.table = (Node<K, V>[]) new Node<?, ?>[initialCapacity];          // TODO: round up to a power of two
    }

    public V put(K key, V value) { throw new UnsupportedOperationException("TODO"); }
    public V get(Object key) { throw new UnsupportedOperationException("TODO"); }
    public V getOrDefault(Object key, V defaultValue) { throw new UnsupportedOperationException("TODO"); }
    public boolean containsKey(Object key) { throw new UnsupportedOperationException("TODO"); }
    public V remove(Object key) { throw new UnsupportedOperationException("TODO"); }
    public int size() { return size; }
    public int capacity() { return table.length; }
    public int maxBucketLength() { throw new UnsupportedOperationException("TODO"); }
    public void forEach(BiConsumer<? super K, ? super V> action) { throw new UnsupportedOperationException("TODO"); }

    public static void main(String[] args) {
        SimpleHashMap<String, Integer> ages = new SimpleHashMap<>();
        System.out.println("put(ada, 36) -> " + ages.put("ada", 36) + ", put(ada, 37) -> " + ages.put("ada", 37) + ", get -> " + ages.get("ada"));
        ages.put(null, 0);
        ages.put("ghost", null);
        System.out.println("null key -> " + ages.get(null) + "; ghost -> get " + ages.get("ghost") + ", containsKey " + ages.containsKey("ghost")
                + "; missing -> containsKey " + ages.containsKey("missing") + ", getOrDefault " + ages.getOrDefault("missing", -1));
        System.out.println("\"Aa\" and \"BB\" share hashCode " + "Aa".hashCode() + ": " + ("Aa".hashCode() == "BB".hashCode()));
        ages.put("Aa", 1);
        ages.put("BB", 2);
        System.out.println("colliding keys -> Aa=" + ages.get("Aa") + ", BB=" + ages.get("BB") + ", remove(Aa) -> " + ages.remove("Aa") + ", BB still " + ages.get("BB"));

        SimpleHashMap<Integer, Integer> growing = new SimpleHashMap<>();
        StringBuilder resizes = new StringBuilder("capacity " + growing.capacity());
        for (int i = 1; i <= 100; i++) {
            int before = growing.capacity();
            growing.put(i, i * i);
            if (growing.capacity() != before) resizes.append(" -> ").append(growing.capacity()).append(" (at entry ").append(i).append(')');
        }
        boolean allThere = true;
        for (int i = 1; i <= 100; i++) allThere &= growing.get(i) == i * i;
        System.out.println(resizes + "; all 100 entries found after resizing: " + allThere);

        SimpleHashMap<Integer, Integer> highBits = new SimpleHashMap<>(128, 0.75f);
        for (int i = 0; i < 64; i++) highBits.put(i << 16, i);           // keys that differ only above bit 16
        System.out.println("64 keys differing only in high bits: max bucket length " + highBits.maxBucketLength()
                + " with spreading (without it, (i << 16) & 127 == 0 puts all 64 in bucket 0)");
        System.out.println("new SimpleHashMap(10, 0.75f).capacity() = " + new SimpleHashMap<String, String>(10, 0.75f).capacity());
    }
}
```

## Hints

````hint title="Hint 1: hashing and indexing"
```java
static int hash(Object key) {
    if (key == null) return 0;
    int h = key.hashCode();
    return h ^ (h >>> 16);            // mix the high half into the low half
}
int index = hash & (table.length - 1);   // == hash mod length, for power-of-two lengths
```

Round the capacity up with `Integer.highestOneBit(n - 1) << 1` (special-case `n == 1`).
````

````hint title="Hint 2: chains"
- To find a key, walk the bucket's chain comparing `node.hash == hash && Objects.equals(node.key, key)`. The cheap `int` comparison filters almost every non-match before `equals` runs.
- `put` updates the value if the key is found, otherwise links a new node (at the head or the tail of the chain).
- `remove` keeps a `prev` pointer to unlink the node from the middle of a chain.
````

````hint title="Hint 3: resizing"
After inserting, if `size > table.length * loadFactor`, allocate a table twice as large and move every node. With power-of-two tables, each node either stays at index `i` or moves to `i + oldLength`, depending on the bit `hash & oldLength`. That's how `HashMap` splits a chain into a "lo" and a "hi" list, preserving relative order and never calling `hashCode()` again.
````

## Test cases

| Scenario | Expected |
|---|---|
| `put(ada, 36)`, `put(ada, 37)`, `get(ada)` | `null`, `36`, `37` |
| `null` key, `null` value | `get(null)` works; `containsKey("ghost")` is `true` even though its value is `null` |
| `"Aa"` and `"BB"` (same `hashCode`) | both retrievable; removing one keeps the other |
| Insert 1..100 with defaults | capacity 16 → 32 (entry 13) → 64 (entry 25) → 128 (entry 49) → 256 (entry 97); all found |
| 64 keys `i << 16` in a capacity-128 map | max bucket length 1 (spreading works) |
| `new SimpleHashMap(10, 0.75f).capacity()` | `16` |
| 20,000 random put/get/remove operations | same results as `java.util.HashMap` |

## Expected output

```text title="Expected output" output="SimpleHashMap.java"
put(ada, 36) -> null, put(ada, 37) -> 36, get -> 37
null key -> 0; ghost -> get null, containsKey true; missing -> containsKey false, getOrDefault -1
"Aa" and "BB" share hashCode 2112: true
colliding keys -> Aa=1, BB=2, remove(Aa) -> 1, BB still 2
capacity 16 -> 32 (at entry 13) -> 64 (at entry 25) -> 128 (at entry 49) -> 256 (at entry 97); all 100 entries found after resizing: true
64 keys differing only in high bits: max bucket length 1 with spreading (without it, (i << 16) & 127 == 0 puts all 64 in bucket 0)
new SimpleHashMap(10, 0.75f).capacity() = 16
```

## Reference solution

````solution title="Reference solution (SimpleHashMap.java)"
```java title="SimpleHashMap.java" file="SimpleHashMap.java"
import java.util.Objects;
import java.util.function.BiConsumer;

public class SimpleHashMap<K, V> {
    private static final class Node<K, V> {
        final int hash;
        final K key;
        V value;
        Node<K, V> next;

        Node(int hash, K key, V value, Node<K, V> next) {
            this.hash = hash;
            this.key = key;
            this.value = value;
            this.next = next;
        }
    }

    private static final int MAX_CAPACITY = 1 << 30;

    private Node<K, V>[] table;
    private int size;
    private final float loadFactor;

    public SimpleHashMap() {
        this(16, 0.75f);
    }

    public SimpleHashMap(int initialCapacity, float loadFactor) {
        if (initialCapacity < 1) {
            throw new IllegalArgumentException("capacity must be positive: " + initialCapacity);
        }
        if (!(loadFactor > 0)) {                                     // also rejects NaN
            throw new IllegalArgumentException("load factor must be positive: " + loadFactor);
        }
        this.loadFactor = loadFactor;
        this.table = newTable(powerOfTwoAtLeast(initialCapacity));
    }

    static int powerOfTwoAtLeast(int n) {
        if (n >= MAX_CAPACITY) return MAX_CAPACITY;
        return n == 1 ? 1 : Integer.highestOneBit(n - 1) << 1;
    }

    @SuppressWarnings("unchecked")
    private static <K, V> Node<K, V>[] newTable(int length) {
        return (Node<K, V>[]) new Node<?, ?>[length];                     // generic array creation needs a cast
    }

    static int hash(Object key) {
        if (key == null) {
            return 0;
        }
        int h = key.hashCode();
        return h ^ (h >>> 16);                                      // spread high bits into the low bits
    }

    private Node<K, V> findNode(Object key) {
        int h = hash(key);
        for (Node<K, V> n = table[h & (table.length - 1)]; n != null; n = n.next) {
            if (n.hash == h && Objects.equals(n.key, key)) {        // cheap int check first
                return n;
            }
        }
        return null;
    }

    public V put(K key, V value) {
        int h = hash(key);
        int i = h & (table.length - 1);
        for (Node<K, V> n = table[i]; n != null; n = n.next) {
            if (n.hash == h && Objects.equals(n.key, key)) {
                V old = n.value;
                n.value = value;                                    // replace: size unchanged
                return old;
            }
        }
        table[i] = new Node<>(h, key, value, table[i]);             // link at the head of the chain
        if (++size > table.length * loadFactor && table.length < MAX_CAPACITY) {
            resize();
        }
        return null;
    }

    private void resize() {
        Node<K, V>[] old = table;
        int oldLength = old.length;
        Node<K, V>[] grown = newTable(oldLength * 2);
        for (int i = 0; i < oldLength; i++) {
            Node<K, V> loHead = null, loTail = null, hiHead = null, hiTail = null;
            for (Node<K, V> n = old[i]; n != null; ) {
                Node<K, V> next = n.next;
                n.next = null;
                if ((n.hash & oldLength) == 0) {                    // stays at index i
                    if (loTail == null) loHead = n; else loTail.next = n;
                    loTail = n;
                } else {                                            // moves to i + oldLength
                    if (hiTail == null) hiHead = n; else hiTail.next = n;
                    hiTail = n;
                }
                n = next;
            }
            grown[i] = loHead;
            grown[i + oldLength] = hiHead;
        }
        table = grown;
    }

    public V get(Object key) {
        Node<K, V> n = findNode(key);
        return n == null ? null : n.value;
    }

    public V getOrDefault(Object key, V defaultValue) {
        Node<K, V> n = findNode(key);
        return n == null ? defaultValue : n.value;                  // a mapping to null returns null, not the default
    }

    public boolean containsKey(Object key) {
        return findNode(key) != null;
    }

    public V remove(Object key) {
        int h = hash(key);
        int i = h & (table.length - 1);
        Node<K, V> prev = null;
        for (Node<K, V> n = table[i]; n != null; prev = n, n = n.next) {
            if (n.hash == h && Objects.equals(n.key, key)) {
                if (prev == null) table[i] = n.next; else prev.next = n.next;
                size--;
                return n.value;
            }
        }
        return null;
    }

    public int size() { return size; }
    public int capacity() { return table.length; }

    public int maxBucketLength() {
        int max = 0;
        for (Node<K, V> head : table) {
            int length = 0;
            for (Node<K, V> n = head; n != null; n = n.next) length++;
            max = Math.max(max, length);
        }
        return max;
    }

    public void forEach(BiConsumer<? super K, ? super V> action) {
        for (Node<K, V> head : table) {
            for (Node<K, V> n = head; n != null; n = n.next) {
                action.accept(n.key, n.value);
            }
        }
    }

    public static void main(String[] args) {
        SimpleHashMap<String, Integer> ages = new SimpleHashMap<>();
        System.out.println("put(ada, 36) -> " + ages.put("ada", 36) + ", put(ada, 37) -> " + ages.put("ada", 37) + ", get -> " + ages.get("ada"));
        ages.put(null, 0);
        ages.put("ghost", null);
        System.out.println("null key -> " + ages.get(null) + "; ghost -> get " + ages.get("ghost") + ", containsKey " + ages.containsKey("ghost")
                + "; missing -> containsKey " + ages.containsKey("missing") + ", getOrDefault " + ages.getOrDefault("missing", -1));
        System.out.println("\"Aa\" and \"BB\" share hashCode " + "Aa".hashCode() + ": " + ("Aa".hashCode() == "BB".hashCode()));
        ages.put("Aa", 1);
        ages.put("BB", 2);
        System.out.println("colliding keys -> Aa=" + ages.get("Aa") + ", BB=" + ages.get("BB") + ", remove(Aa) -> " + ages.remove("Aa") + ", BB still " + ages.get("BB"));

        SimpleHashMap<Integer, Integer> growing = new SimpleHashMap<>();
        StringBuilder resizes = new StringBuilder("capacity " + growing.capacity());
        for (int i = 1; i <= 100; i++) {
            int before = growing.capacity();
            growing.put(i, i * i);
            if (growing.capacity() != before) resizes.append(" -> ").append(growing.capacity()).append(" (at entry ").append(i).append(')');
        }
        boolean allThere = true;
        for (int i = 1; i <= 100; i++) allThere &= growing.get(i) == i * i;
        System.out.println(resizes + "; all 100 entries found after resizing: " + allThere);

        SimpleHashMap<Integer, Integer> highBits = new SimpleHashMap<>(128, 0.75f);
        for (int i = 0; i < 64; i++) highBits.put(i << 16, i);           // keys that differ only above bit 16
        System.out.println("64 keys differing only in high bits: max bucket length " + highBits.maxBucketLength()
                + " with spreading (without it, (i << 16) & 127 == 0 puts all 64 in bucket 0)");
        System.out.println("new SimpleHashMap(10, 0.75f).capacity() = " + new SimpleHashMap<String, String>(10, 0.75f).capacity());
    }
}
```
````

## Step-by-step explanation

````solution title="Step-by-step explanation"
1. **Table and nodes**: an array of chain heads. Each node stores `hash`, `key`, `value` and `next`. Storing the spread hash avoids recomputing `hashCode()` (which may be expensive, as with long strings) during lookups and resizes, and lets the code reject most non-matching nodes with an `int` comparison.
2. **Spreading**: `h ^ (h >>> 16)` folds the upper 16 bits into the lower 16. With a power-of-two table, only the low bits choose the bucket, so without spreading, keys that differ only in high bits (like `i << 16`, or poorly distributed hash codes) all collide. The demo shows 64 such keys landing in 64 different buckets.
3. **Power-of-two capacity**: `hash & (n - 1)` is a single AND instead of a `%`, and it's never negative, so no `Math.abs` trap. The constructor rounds requests up (10 → 16).
4. **Lookups** walk one chain: O(1 + chain length). With a decent hash and a 0.75 load factor, chains average under one node. A `null` key works naturally because `hash(null) == 0` and `Objects.equals` handles `null`.
5. **`put`** replaces in place when the key exists (returning the old value, with the size unchanged), otherwise links a new head node. Linking at the head is O(1); `HashMap` links at the tail because it walks the chain anyway, and to keep chain order stable across resizes.
6. **Resizing** happens when `size > capacity × loadFactor`. Doubling keeps `put` **amortised O(1)**, just like `ArrayList` growth. Because the new length is `2 × oldLength`, the new index is either `i` or `i + oldLength`, decided by one bit (`hash & oldLength`). Each chain splits into a lo and a hi list in one pass, with no rehashing.
7. **`remove`** keeps a `prev` pointer to unlink from the middle. `getOrDefault` and `containsKey` use `findNode`, so a key mapped to `null` is distinguishable from a missing key.
8. **What `java.util.HashMap` adds**:
   - **treeification**: chains longer than 8 in a table of at least 64 become red-black trees, giving O(log n) worst case against hash flooding;
   - lazy table allocation;
   - `modCount` for fail-fast iterators;
   - key, value and entry views.
````

## Edge cases

- **Keys with a terrible `hashCode`** (constant): every key shares one chain, so operations degrade to O(n). Java 8+ trees mitigate this for `Comparable` keys, but this simple map doesn't.
- **Mutable keys**: changing a field used by `hashCode` after insertion strands the entry in the wrong bucket, just as with the real `HashMap`.
- **`null` value vs absent**: `get` returns `null` for both; `containsKey` and `getOrDefault` tell them apart.
- **Maximum capacity**: doubling stops at 2³⁰. Beyond that, chains just get longer.
- **Load factor > 1** is legal: fewer resizes, longer chains. Below 0.75, there are fewer collisions but more memory.
- **`Integer.MIN_VALUE` hash codes and negative hashes**: `&` with `n - 1` is always non-negative, whereas `hash % n` could be negative.
- **Concurrent modification**: not thread-safe. Concurrent puts can lose entries during a resize (`ConcurrentHashMap` exists for that).

## JUnit tests

```java title="SimpleHashMapTest.java" file="SimpleHashMapTest.java" test="SimpleHashMap.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashMap;
import java.util.Map;
import java.util.Random;
import org.junit.jupiter.api.Test;

class SimpleHashMapTest {
    @Test
    void putGetReplace() {
        SimpleHashMap<String, Integer> m = new SimpleHashMap<>();
        assertNull(m.put("a", 1));
        assertEquals(1, m.put("a", 2));
        assertEquals(2, m.get("a"));
        assertEquals(1, m.size());
        assertNull(m.get("missing"));
    }

    @Test
    void nullKeyAndNullValues() {
        SimpleHashMap<String, Integer> m = new SimpleHashMap<>();
        m.put(null, 7);
        m.put("n", null);
        assertEquals(7, m.get(null));
        assertTrue(m.containsKey("n"));
        assertNull(m.get("n"));
        assertNull(m.getOrDefault("n", 5));
        assertEquals(5, m.getOrDefault("x", 5));
        assertEquals(7, m.remove(null));
        assertFalse(m.containsKey(null));
    }

    @Test
    void collidingKeysAndRemovalFromChains() {
        SimpleHashMap<String, Integer> m = new SimpleHashMap<>();
        // "Aa", "BB" and "AaAa"/"BBBB"/"AaBB"/"BBAa" are classic equal-hashCode strings
        String[] keys = { "AaAa", "BBBB", "AaBB", "BBAa" };
        for (int i = 0; i < keys.length; i++) m.put(keys[i], i);
        assertEquals(4, m.maxBucketLength());
        assertEquals(1, m.remove("BBBB"));                       // middle of the chain
        assertEquals(0, m.remove("AaAa"));
        assertEquals(3, m.remove("BBAa"));
        assertEquals(2, m.get("AaBB"));
        assertEquals(1, m.size());
        assertNull(m.remove("AaAa"));
    }

    @Test
    void resizesAtTheLoadFactorAndKeepsEntries() {
        SimpleHashMap<Integer, String> m = new SimpleHashMap<>(4, 0.75f);
        m.put(1, "a");
        m.put(2, "b");
        m.put(3, "c");
        assertEquals(4, m.capacity());
        m.put(4, "d");
        assertEquals(8, m.capacity());
        for (int i = 5; i <= 1000; i++) m.put(i, "v" + i);
        assertEquals(1000, m.size());
        assertEquals(2048, m.capacity());
        assertEquals("v1000", m.get(1000));
        assertEquals("a", m.get(1));
    }

    @Test
    void capacityIsRoundedToPowerOfTwo() {
        assertEquals(16, new SimpleHashMap<String, String>(10, 0.75f).capacity());
        assertEquals(1, new SimpleHashMap<String, String>(1, 0.75f).capacity());
        assertEquals(64, new SimpleHashMap<String, String>(64, 0.75f).capacity());
    }

    @Test
    void rejectsBadArguments() {
        assertThrows(IllegalArgumentException.class, () -> new SimpleHashMap<String, String>(0, 0.75f));
        assertThrows(IllegalArgumentException.class, () -> new SimpleHashMap<String, String>(16, 0f));
        assertThrows(IllegalArgumentException.class, () -> new SimpleHashMap<String, String>(16, Float.NaN));
    }

    @Test
    void spreadingSeparatesKeysThatDifferInHighBits() {
        SimpleHashMap<Integer, Integer> m = new SimpleHashMap<>(128, 0.75f);
        for (int i = 0; i < 64; i++) m.put(i << 16, i);
        assertEquals(1, m.maxBucketLength());
    }

    @Test
    void forEachVisitsEveryEntry() {
        SimpleHashMap<Integer, Integer> m = new SimpleHashMap<>();
        for (int i = 0; i < 50; i++) m.put(i, i * 2);
        Map<Integer, Integer> seen = new HashMap<>();
        m.forEach(seen::put);
        assertEquals(50, seen.size());
        assertEquals(98, seen.get(49));
    }

    @Test
    void behavesLikeJavaUtilHashMap() {
        SimpleHashMap<Integer, Integer> mine = new SimpleHashMap<>(2, 0.75f);
        Map<Integer, Integer> real = new HashMap<>();
        Random random = new Random(3);
        for (int i = 0; i < 20_000; i++) {
            int key = random.nextInt(2_000) - 1_000;
            switch (random.nextInt(3)) {
                case 0 -> assertEquals(real.put(key, i), mine.put(key, i));
                case 1 -> assertEquals(real.get(key), mine.get(key));
                default -> assertEquals(real.remove(key), mine.remove(key));
            }
            assertEquals(real.size(), mine.size());
        }
    }
}
```
