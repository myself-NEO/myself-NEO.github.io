## Problem statement

A product-detail service caches the most recently viewed products in memory. Implement a **least-recently-used (LRU) cache** with a fixed capacity, **twice**, behind one interface:

```java
interface Cache<K, V> {
    Optional<V> get(K key);       // a hit makes the key the most recently used
    void put(K key, V value);     // insert or update; makes the key most recently used;
                                  // if over capacity, evict the least recently used key
    int size();
    List<K> keysLruFirst();       // current keys from least to most recently used (for tests and debugging)
}
```

1. **`LinkedHashMapLru<K, V>`**: built on `LinkedHashMap` in **access order**, with `removeEldestEntry`.
2. **`ManualLru<K, V>`**: built from a `HashMap<K, Node>` plus your own **doubly linked list** with sentinel nodes. This is the version interviewers expect you to write from scratch.

**Requirements**:
- `get` and `put` are **O(1)**;
- capacity < 1 → `IllegalArgumentException`;
- `null` keys or values → `NullPointerException`;
- updating an existing key changes its value and recency, but never evicts;
- a miss doesn't change any recency.

## Starter code

```java title="LruCache.java" starter="true"
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public final class LruCache {
    interface Cache<K, V> {
        Optional<V> get(K key);
        void put(K key, V value);
        int size();
        List<K> keysLruFirst();
    }

    static final class LinkedHashMapLru<K, V> implements Cache<K, V> {
        LinkedHashMapLru(int capacity) {
            // TODO: a LinkedHashMap in access order that removes its eldest entry
        }
        public Optional<V> get(K key) { throw new UnsupportedOperationException("TODO"); }
        public void put(K key, V value) { throw new UnsupportedOperationException("TODO"); }
        public int size() { throw new UnsupportedOperationException("TODO"); }
        public List<K> keysLruFirst() { throw new UnsupportedOperationException("TODO"); }
    }

    static final class ManualLru<K, V> implements Cache<K, V> {
        private static final class Node<K, V> {
            K key;
            V value;
            Node<K, V> prev, next;
        }

        private final Map<K, Node<K, V>> index = new HashMap<>();
        // TODO: sentinel head (most recent side) and tail (least recent side), capacity

        ManualLru(int capacity) {
            // TODO
        }
        public Optional<V> get(K key) { throw new UnsupportedOperationException("TODO"); }
        public void put(K key, V value) { throw new UnsupportedOperationException("TODO"); }
        public int size() { return index.size(); }
        public List<K> keysLruFirst() { throw new UnsupportedOperationException("TODO"); }
    }

    static void scenario(String name, Cache<Integer, String> cache) {
        System.out.println(name + ":");
        cache.put(1, "one");
        cache.put(2, "two");
        System.out.println("  get(1) -> " + cache.get(1) + ", order " + cache.keysLruFirst());
        cache.put(3, "three");
        System.out.println("  put(3) evicts 2 -> get(2) " + cache.get(2) + ", order " + cache.keysLruFirst());
        cache.put(1, "ONE");
        System.out.println("  update 1 (no eviction) -> " + cache.get(1) + ", order " + cache.keysLruFirst());
        cache.put(4, "four");
        System.out.println("  put(4) evicts 3 -> get(3) " + cache.get(3) + ", get(4) " + cache.get(4)
                + ", order " + cache.keysLruFirst() + ", size " + cache.size());
    }

    public static void main(String[] args) {
        scenario("LinkedHashMapLru(capacity 2)", new LinkedHashMapLru<>(2));
        scenario("ManualLru(capacity 2)", new ManualLru<>(2));
    }
}
```

## Hints

````hint title="Hint 1: LinkedHashMap does the hard part"
`new LinkedHashMap<>(16, 0.75f, true)` (the `true` means *access order*) moves an entry to the end on every `get` and `put`. Subclass it anonymously and override `removeEldestEntry(Map.Entry<K, V> eldest)` to return `size() > capacity`. The map calls it after every insertion. `keySet()` then iterates from the least to the most recently used.
````

````hint title="Hint 2: the data structure for the manual version"
- A `HashMap` gives O(1) lookup **of a node**.
- A doubly linked list gives O(1) **reordering**: unlink a node and re-link it at the front, given only the node itself.
- Two **sentinel** nodes, `head` and `tail`, that are never removed, eliminate every `null` check at the ends: the list is empty when `head.next == tail`.
````

````hint title="Hint 3: four small helpers"
Write `unlink(node)`, `addFirst(node)` (right after `head`), `moveToFront(node)` (unlink plus addFirst) and `removeLast()` (the node before `tail`). Then:
- **`get`**: on a hit, `moveToFront`, then return the value.
- **`put`** on an existing key: update the value and `moveToFront`.
- **`put`** on a new key: create a node, `addFirst`, add it to the map, and if the size exceeds capacity, `removeLast` and remove that node's **key** from the map. That's why nodes store their key.
````

## Test cases

| Operations (capacity 2) | Expected |
|---|---|
| `put(1)`, `put(2)`, `get(1)` | `Optional[one]`, order `[2, 1]` |
| `put(3)` | evicts `2`: `get(2)` is empty, order `[1, 3]` |
| `put(1, "ONE")` | value updated, no eviction, order `[3, 1]` |
| `put(4)` | evicts `3`: order `[1, 4]`, size 2 |
| A miss (`get(99)`) | order unchanged |
| Capacity 1 | each new key evicts the previous one |
| Capacity 0 / `null` key | `IllegalArgumentException` / `NullPointerException` |
| 10,000 random operations | both implementations match a reference model |

## Expected output

```text title="Expected output" output="LruCache.java"
LinkedHashMapLru(capacity 2):
  get(1) -> Optional[one], order [2, 1]
  put(3) evicts 2 -> get(2) Optional.empty, order [1, 3]
  update 1 (no eviction) -> Optional[ONE], order [3, 1]
  put(4) evicts 3 -> get(3) Optional.empty, get(4) Optional[four], order [1, 4], size 2
ManualLru(capacity 2):
  get(1) -> Optional[one], order [2, 1]
  put(3) evicts 2 -> get(2) Optional.empty, order [1, 3]
  update 1 (no eviction) -> Optional[ONE], order [3, 1]
  put(4) evicts 3 -> get(3) Optional.empty, get(4) Optional[four], order [1, 4], size 2
```

## Reference solution

````solution title="Reference solution (LruCache.java)"
```java title="LruCache.java" file="LruCache.java"
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

public final class LruCache {
    interface Cache<K, V> {
        Optional<V> get(K key);
        void put(K key, V value);
        int size();
        List<K> keysLruFirst();
    }

    static int checkCapacity(int capacity) {
        if (capacity < 1) {
            throw new IllegalArgumentException("capacity must be at least 1: " + capacity);
        }
        return capacity;
    }

    static final class LinkedHashMapLru<K, V> implements Cache<K, V> {
        private final Map<K, V> map;

        LinkedHashMapLru(int capacity) {
            int max = checkCapacity(capacity);
            this.map = new LinkedHashMap<>(16, 0.75f, true) {          // true = access order
                private static final long serialVersionUID = 1L;

                @Override
                protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
                    return size() > max;                                // called after each insertion
                }
            };
        }

        public Optional<V> get(K key) {
            return Optional.ofNullable(map.get(Objects.requireNonNull(key, "key")));  // a hit moves the entry to the end
        }

        public void put(K key, V value) {
            map.put(Objects.requireNonNull(key, "key"), Objects.requireNonNull(value, "value"));
        }

        public int size() {
            return map.size();
        }

        public List<K> keysLruFirst() {
            return new ArrayList<>(map.keySet());                       // iteration order: least -> most recent
        }
    }

    static final class ManualLru<K, V> implements Cache<K, V> {
        private static final class Node<K, V> {
            K key;
            V value;
            Node<K, V> prev, next;
        }

        private final Map<K, Node<K, V>> index = new HashMap<>();
        private final Node<K, V> head = new Node<>();                  // sentinel: most recent side
        private final Node<K, V> tail = new Node<>();                  // sentinel: least recent side
        private final int capacity;

        ManualLru(int capacity) {
            this.capacity = checkCapacity(capacity);
            head.next = tail;
            tail.prev = head;
        }

        private void unlink(Node<K, V> n) {
            n.prev.next = n.next;
            n.next.prev = n.prev;
        }

        private void addFirst(Node<K, V> n) {
            n.prev = head;
            n.next = head.next;
            head.next.prev = n;
            head.next = n;
        }

        private void moveToFront(Node<K, V> n) {
            unlink(n);
            addFirst(n);
        }

        public Optional<V> get(K key) {
            Node<K, V> n = index.get(Objects.requireNonNull(key, "key"));
            if (n == null) {
                return Optional.empty();                                // a miss changes nothing
            }
            moveToFront(n);
            return Optional.of(n.value);
        }

        public void put(K key, V value) {
            Objects.requireNonNull(key, "key");
            Objects.requireNonNull(value, "value");
            Node<K, V> n = index.get(key);
            if (n != null) {                                            // update: never evicts
                n.value = value;
                moveToFront(n);
                return;
            }
            n = new Node<>();
            n.key = key;
            n.value = value;
            addFirst(n);
            index.put(key, n);
            if (index.size() > capacity) {
                Node<K, V> lru = tail.prev;
                unlink(lru);
                index.remove(lru.key);                                  // the node knows its key
            }
        }

        public int size() {
            return index.size();
        }

        public List<K> keysLruFirst() {
            List<K> keys = new ArrayList<>(index.size());
            for (Node<K, V> n = tail.prev; n != head; n = n.prev) {
                keys.add(n.key);
            }
            return keys;
        }
    }

    static void scenario(String name, Cache<Integer, String> cache) {
        System.out.println(name + ":");
        cache.put(1, "one");
        cache.put(2, "two");
        System.out.println("  get(1) -> " + cache.get(1) + ", order " + cache.keysLruFirst());
        cache.put(3, "three");
        System.out.println("  put(3) evicts 2 -> get(2) " + cache.get(2) + ", order " + cache.keysLruFirst());
        cache.put(1, "ONE");
        System.out.println("  update 1 (no eviction) -> " + cache.get(1) + ", order " + cache.keysLruFirst());
        cache.put(4, "four");
        System.out.println("  put(4) evicts 3 -> get(3) " + cache.get(3) + ", get(4) " + cache.get(4)
                + ", order " + cache.keysLruFirst() + ", size " + cache.size());
    }

    public static void main(String[] args) {
        scenario("LinkedHashMapLru(capacity 2)", new LinkedHashMapLru<>(2));
        scenario("ManualLru(capacity 2)", new ManualLru<>(2));
    }
}
```
````

## Step-by-step explanation

````solution title="Step-by-step explanation"
**Why two structures?** A hash map alone finds values in O(1) but has no notion of recency. A list alone keeps recency but needs O(n) to find a key. Together, with the map pointing at **list nodes**, every operation is O(1).

**`LinkedHashMap` version**
1. The third constructor argument `true` selects **access order**: `get`, `put` and `putIfAbsent` move the entry to the tail of the map's internal linked list.
2. After each insertion, `LinkedHashMap` calls `removeEldestEntry`, and returning `true` removes the head entry, i.e. the least recently used one. Using `size() > max` keeps exactly `max` entries.
3. `keySet()` iterates in that internal order, oldest first. Careful: in access order, even `get` is a **structural modification** for iterators, so don't call `get` while iterating.

**Manual version**
1. **Sentinels**: `head` and `tail` are dummy nodes, so `addFirst` and `unlink` never deal with `null` neighbours. An empty list is `head ⇄ tail`.
2. **`get`**: map lookup (O(1)); on a hit, unlink the node and re-insert it after `head` (four pointer updates each). A miss returns empty and touches nothing.
3. **`put`**:
   - an existing key updates the value in place and moves the node to the front, with no eviction possible because the size is unchanged;
   - a new key adds a node at the front and registers it in the map;
   - if that exceeded capacity, the least recently used node is `tail.prev`: unlink it and remove its **key** from the map. That's why the node stores its key: the list knows *which* node to evict, and the key tells the map what to delete.
4. **`keysLruFirst`** walks backwards from `tail`. It's O(n), so it's for tests and debugging only.
5. **Validation** is shared (`checkCapacity`), and `null` keys or values are rejected up front. With `Optional` results, a stored `null` would otherwise be indistinguishable from a miss.

**Interview follow-ups**:
- **Thread safety**: wrap with a lock (a `ReentrantLock` around get and put), because even reads mutate the order.
- **TTL expiry**: also store a timestamp per node.
- **Production**: Caffeine (concurrent, with W-TinyLFU admission, which gives better hit rates than LRU).
````

## Edge cases

- **Capacity 1**: every new key evicts the previous one, and updates of the only key never evict.
- **Updating the LRU key** when the cache is full: it becomes most recent, and nothing is evicted.
- **A miss** must not reorder anything, and must not insert a placeholder.
- **`null` values**: rejected, so `Optional.empty()` unambiguously means "absent".
- **Concurrent use**: neither version is thread-safe. `LinkedHashMap` in access order corrupts its internal list under concurrent `get`s, because `get` writes. Use `Collections.synchronizedMap`, an explicit lock, or Caffeine.
- **Iteration during access**: calling `get` while iterating `keySet()` of an access-ordered `LinkedHashMap` throws `ConcurrentModificationException`.
- **Memory**: each manual node costs about 32 bytes plus the map entry. For millions of entries, consider primitive-keyed or off-heap caches.

## JUnit tests

```java title="LruCacheTest.java" file="LruCacheTest.java" test="LruCache.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.function.IntFunction;
import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class LruCacheTest {
    static Stream<Arguments> implementations() {
        IntFunction<LruCache.Cache<Integer, String>> linked = LruCache.LinkedHashMapLru::new;
        IntFunction<LruCache.Cache<Integer, String>> manual = LruCache.ManualLru::new;
        return Stream.of(Arguments.of("LinkedHashMapLru", linked), Arguments.of("ManualLru", manual));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("implementations")
    void classicSequence(String name, IntFunction<LruCache.Cache<Integer, String>> factory) {
        LruCache.Cache<Integer, String> c = factory.apply(2);
        c.put(1, "one");
        c.put(2, "two");
        assertEquals(Optional.of("one"), c.get(1));
        c.put(3, "three");
        assertEquals(Optional.empty(), c.get(2));
        assertEquals(List.of(1, 3), c.keysLruFirst());
        c.put(4, "four");
        assertEquals(Optional.empty(), c.get(1));
        assertEquals(Optional.of("three"), c.get(3));
        assertEquals(Optional.of("four"), c.get(4));
        assertEquals(2, c.size());
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("implementations")
    void updateRefreshesWithoutEvicting(String name, IntFunction<LruCache.Cache<Integer, String>> factory) {
        LruCache.Cache<Integer, String> c = factory.apply(2);
        c.put(1, "one");
        c.put(2, "two");
        c.put(1, "ONE");
        assertEquals(2, c.size());
        assertEquals(List.of(2, 1), c.keysLruFirst());
        c.put(3, "three");
        assertEquals(List.of(1, 3), c.keysLruFirst());
        assertEquals(Optional.of("ONE"), c.get(1));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("implementations")
    void missDoesNotChangeOrder(String name, IntFunction<LruCache.Cache<Integer, String>> factory) {
        LruCache.Cache<Integer, String> c = factory.apply(3);
        c.put(1, "a");
        c.put(2, "b");
        c.get(99);
        assertEquals(List.of(1, 2), c.keysLruFirst());
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("implementations")
    void capacityOne(String name, IntFunction<LruCache.Cache<Integer, String>> factory) {
        LruCache.Cache<Integer, String> c = factory.apply(1);
        c.put(1, "a");
        c.put(2, "b");
        assertEquals(List.of(2), c.keysLruFirst());
        c.put(2, "B");
        assertEquals(Optional.of("B"), c.get(2));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("implementations")
    void validation(String name, IntFunction<LruCache.Cache<Integer, String>> factory) {
        assertThrows(IllegalArgumentException.class, () -> factory.apply(0));
        LruCache.Cache<Integer, String> c = factory.apply(2);
        assertThrows(NullPointerException.class, () -> c.put(null, "x"));
        assertThrows(NullPointerException.class, () -> c.put(1, null));
        assertThrows(NullPointerException.class, () -> c.get(null));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("implementations")
    void matchesReferenceModelOnRandomOperations(String name, IntFunction<LruCache.Cache<Integer, String>> factory) {
        int capacity = 50;
        LruCache.Cache<Integer, String> cache = factory.apply(capacity);
        List<Integer> model = new ArrayList<>();                 // least recent first
        Map<Integer, String> values = new LinkedHashMap<>();
        Random random = new Random(7);
        for (int i = 0; i < 10_000; i++) {
            int key = random.nextInt(120);
            if (random.nextBoolean()) {
                String v = "v" + i;
                cache.put(key, v);
                model.remove(Integer.valueOf(key));
                model.add(key);
                values.put(key, v);
                if (model.size() > capacity) values.remove(model.remove(0));
            } else {
                Optional<String> expected = Optional.ofNullable(values.get(key));
                if (expected.isPresent()) {
                    model.remove(Integer.valueOf(key));
                    model.add(key);
                }
                assertEquals(expected, cache.get(key), "op " + i);
            }
            assertEquals(model.size(), cache.size());
        }
        assertEquals(model, cache.keysLruFirst());
    }
}
```
