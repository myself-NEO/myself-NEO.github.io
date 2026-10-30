## Problem statement

Design a generic in-memory cache: `get(key)` and `put(key, value)` with a fixed capacity. When the cache is full, an **eviction policy** decides which entry to drop — least recently used (LRU) or least frequently used (LFU), with more policies possible later. Entries may have a **time-to-live**. Every operation should be O(1), and the cache must be usable from many threads.

> [!TIP] Try it first
> Write down the exact operations each policy needs — "mark as used", "add", "remove", "pick a victim" — and find a data structure that does **all of them** in O(1). For LFU, that's the hard part.

## Clarifying questions

1. Which policies? Will more be added?
2. What exactly does "used" mean — `get` only, or `put` on an existing key too?
3. LFU ties: which of two equally-used keys goes?
4. TTL per entry, or per cache? Must expired entries be removed immediately?
5. Thread safety? Read-heavy?
6. Null keys or values?

````reveal title="Answers we'll assume"
- **LRU and LFU** behind one interface; FIFO, random or size-aware policies may come later.
- A `get` hit and a `put` overwrite both count as a use.
- LFU ties are broken by **recency**: among equally-used keys, the one that reached that count first is evicted.
- **Optional TTL per entry.** Expired entries are removed **lazily** when touched (a background sweep is a follow-up).
- Thread-safe, provided **without** touching the policy code.
- No nulls (they'd make `get` ambiguous).
````

## Requirements

**Functional**

1. `get`, `put` (with optional TTL), `remove`, `size`, `stats` (hits, misses, evictions, expirations).
2. When full, `put` of a new key evicts exactly one victim chosen by the policy.
3. Expired entries behave as absent.

**Non-functional**

4. O(1) for every operation, for both policies.
5. Generic in key and value types; policies pluggable.
6. Thread-safe wrapper; tests use a controllable clock.

## Step 1 — O(1) data structures

````reveal title="LRU: hash map + doubly linked list"
A `HashMap<K, Node>` finds a key's node in O(1); the nodes form a **doubly linked list** ordered from most to least recently used. "Mark as used" unlinks the node and relinks it at the front (O(1) because each node knows its neighbours). The victim is the node at the back.

```text
front (most recent)  [d] <-> [a] <-> [c]  back (least recent) -> victim c
get(c): unlink c, link at front -> [c] <-> [d] <-> [a]
```

(`LinkedHashMap` with access order does exactly this; building it yourself is the interview question.)
````

````reveal title="LFU: a list of frequency buckets"
Keep a doubly linked list of **buckets**, one per frequency currently in use, in increasing order. Each bucket holds a `LinkedHashSet` of keys (insertion order = recency within that frequency). A map gives each key's bucket.

- **Use(key):** move the key from bucket `f` to bucket `f + 1` — the very next bucket, or a new one inserted right after `f`. Delete bucket `f` if it became empty. O(1).
- **Add(key):** into bucket 1 at the front (create it if needed). O(1).
- **Victim:** the first key of the first bucket — lowest frequency, oldest among ties. O(1).
- **Remove(key)** (explicit or expired): drop it from its bucket; delete the bucket if empty. O(1), and the "minimum frequency" stays correct because the first bucket *is* the minimum.

```text
buckets:  [1: d] <-> [2: b] <-> [3: a]
get(d):   [2: b, d] <-> [3: a]        victim now: b (freq 2, older than d)
```

The common "min-frequency integer" version breaks when keys can be removed from the middle; the bucket list doesn't.
````

## Step 2 — Class design

```uml title="Cache with eviction policies"
interface Cache<K, V>
  + get(key: K): Optional<V>
  + put(key: K, value: V, ttl: Duration): void
  + remove(key: K): boolean
  + size(): int
  + stats(): CacheStats
class PolicyCache<K, V>
  - entries: HashMap<K, Entry<V>>
  - capacity: int
  - policy: EvictionPolicy<K>
  - clock: Clock
class SynchronizedCache<K, V>
  - target: Cache<K, V>
  - lock: ReentrantLock
interface EvictionPolicy<K>
  + onPut(key: K): void
  + onAccess(key: K): void
  + onRemove(key: K): void
  + victim(): K
class LruPolicy<K>
  - nodes: HashMap<K, Node<K>>
  - head: Node<K>
class LfuPolicy<K>
  - bucketOf: HashMap<K, Bucket<K>>
  - head: Bucket<K>
record CacheStats
  + hits: long
  + misses: long
  + evictions: long
  + expirations: long
PolicyCache ..|> Cache
SynchronizedCache ..|> Cache
SynchronizedCache --> Cache : delegates
PolicyCache --> EvictionPolicy
LruPolicy ..|> EvictionPolicy
LfuPolicy ..|> EvictionPolicy
```

## Step 3 — Implementation

````hint title="Hint — the cache and the policy each own half"
`PolicyCache` owns **values and expiry** (`HashMap<K, Entry>`); the policy owns **ordering** and never sees values. The cache tells the policy what happened (`onPut`, `onAccess`, `onRemove`) and asks it one question (`victim()`). Keeping both in sync is the cache's job, so every path that removes an entry must also call `onRemove`.
````

````solution title="Complete Java solution"
```java title="CacheDemo.java" file="CacheDemo.java"
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;

public class CacheDemo {
    public static void main(String[] args) throws InterruptedException {
        MutableClock clock = new MutableClock(Instant.parse("2026-05-01T12:00:00Z"));

        Cache<String, Integer> lru = Caches.lru(3, clock);
        lru.put("a", 1);
        lru.put("b", 2);
        lru.put("c", 3);
        lru.get("a");                                          // order (recent first): a, c, b
        lru.put("d", 4);                                       // evicts b
        System.out.println("LRU after put d: a=" + lru.get("a") + " b=" + lru.get("b") + " c=" + lru.get("c") + " d=" + lru.get("d"));

        Cache<String, Integer> lfu = Caches.lfu(3, clock);
        for (String k : List.of("a", "b", "c")) lfu.put(k, 0);
        for (String k : List.of("a", "a", "b")) lfu.get(k);    // a=3 uses, b=2, c=1
        lfu.put("d", 0);                                       // evicts c
        lfu.put("e", 0);                                       // d and e tie at 1; d is older -> evicts d
        System.out.println("LFU after put d, e: a=" + lfu.get("a") + " b=" + lfu.get("b") + " c=" + lfu.get("c")
                + " d=" + lfu.get("d") + " e=" + lfu.get("e"));

        Cache<String, String> sessions = Caches.lru(10, clock);
        sessions.put("otp:asha", "4821", Duration.ofSeconds(30));
        sessions.put("profile:asha", "Asha");
        clock.advance(Duration.ofSeconds(31));
        System.out.println("after 31s: otp=" + sessions.get("otp:asha") + " profile=" + sessions.get("profile:asha")
                + " size=" + sessions.size());
        System.out.println("stats: " + sessions.stats());

        Cache<Integer, Integer> shared = Caches.lru(100, Clock.systemUTC());
        ExecutorService pool = Executors.newFixedThreadPool(8);
        CountDownLatch go = new CountDownLatch(1);
        for (int t = 0; t < 8; t++) {
            pool.submit(() -> {
                go.await();
                for (int i = 0; i < 10_000; i++) {
                    int key = ThreadLocalRandom.current().nextInt(1_000);
                    if (shared.get(key).isEmpty()) shared.put(key, key * key);
                }
                return null;
            });
        }
        go.countDown();
        pool.shutdown();
        pool.awaitTermination(30, TimeUnit.SECONDS);
        CacheStats s = shared.stats();
        System.out.println("concurrent: " + (s.hits() + s.misses()) + " lookups, size " + shared.size() + " (capacity 100)");
    }
}

// ---------- API ----------

interface Cache<K, V> {
    Optional<V> get(K key);
    default void put(K key, V value) { put(key, value, null); }
    /** {@code ttl == null} means the entry never expires. */
    void put(K key, V value, Duration ttl);
    boolean remove(K key);
    int size();
    CacheStats stats();
}

record CacheStats(long hits, long misses, long evictions, long expirations) {}

interface EvictionPolicy<K> {
    void onPut(K key);       // a new key was inserted
    void onAccess(K key);    // an existing key was read or overwritten
    void onRemove(K key);    // a key left for any reason other than eviction
    K victim();              // choose a key to evict and forget it
}

final class Caches {
    private Caches() { }

    static <K, V> Cache<K, V> lru(int capacity, Clock clock) {
        return new SynchronizedCache<>(new PolicyCache<>(capacity, new LruPolicy<>(), clock));
    }

    static <K, V> Cache<K, V> lfu(int capacity, Clock clock) {
        return new SynchronizedCache<>(new PolicyCache<>(capacity, new LfuPolicy<>(), clock));
    }
}

// ---------- Policies ----------

/** Hash map + circular doubly linked list with a sentinel: head.next is most recent, head.prev least recent. */
final class LruPolicy<K> implements EvictionPolicy<K> {
    private static final class Node<K> {
        final K key;
        Node<K> prev;
        Node<K> next;
        Node(K key) { this.key = key; }
    }

    private final Node<K> head = new Node<>(null);
    private final Map<K, Node<K>> nodes = new HashMap<>();

    LruPolicy() {
        head.next = head;
        head.prev = head;
    }

    public void onPut(K key) {
        Node<K> n = new Node<>(key);
        nodes.put(key, n);
        linkFirst(n);
    }

    public void onAccess(K key) {
        Node<K> n = nodes.get(key);
        unlink(n);
        linkFirst(n);
    }

    public void onRemove(K key) {
        Node<K> n = nodes.remove(key);
        if (n != null) unlink(n);
    }

    public K victim() {
        Node<K> last = head.prev;
        if (last == head) throw new IllegalStateException("nothing to evict");
        onRemove(last.key);
        return last.key;
    }

    private void linkFirst(Node<K> n) {
        n.prev = head;
        n.next = head.next;
        head.next.prev = n;
        head.next = n;
    }

    private void unlink(Node<K> n) {
        n.prev.next = n.next;
        n.next.prev = n.prev;
    }
}

/** Frequency buckets in a circular list, lowest frequency first; keys in a bucket are oldest first. */
final class LfuPolicy<K> implements EvictionPolicy<K> {
    private static final class Bucket<K> {
        final int freq;
        final LinkedHashSet<K> keys = new LinkedHashSet<>();
        Bucket<K> prev;
        Bucket<K> next;
        Bucket(int freq) { this.freq = freq; }
    }

    private final Bucket<K> head = new Bucket<>(0);
    private final Map<K, Bucket<K>> bucketOf = new HashMap<>();

    LfuPolicy() {
        head.next = head;
        head.prev = head;
    }

    public void onPut(K key) {
        Bucket<K> first = head.next;
        if (first == head || first.freq != 1) first = insertAfter(head, 1);
        first.keys.add(key);
        bucketOf.put(key, first);
    }

    public void onAccess(K key) {
        Bucket<K> b = bucketOf.get(key);
        Bucket<K> next = b.next;
        if (next == head || next.freq != b.freq + 1) next = insertAfter(b, b.freq + 1);
        next.keys.add(key);
        bucketOf.put(key, next);
        removeFrom(b, key);
    }

    public void onRemove(K key) {
        Bucket<K> b = bucketOf.remove(key);
        if (b != null) removeFrom(b, key);
    }

    public K victim() {
        Bucket<K> lowest = head.next;
        if (lowest == head) throw new IllegalStateException("nothing to evict");
        K key = lowest.keys.iterator().next();
        onRemove(key);
        return key;
    }

    private Bucket<K> insertAfter(Bucket<K> b, int freq) {
        Bucket<K> n = new Bucket<>(freq);
        n.prev = b;
        n.next = b.next;
        b.next.prev = n;
        b.next = n;
        return n;
    }

    private void removeFrom(Bucket<K> b, K key) {
        b.keys.remove(key);
        if (b.keys.isEmpty()) {
            b.prev.next = b.next;
            b.next.prev = b.prev;
        }
    }
}

// ---------- Cache ----------

/** Not thread-safe on its own; wrap it in SynchronizedCache. */
final class PolicyCache<K, V> implements Cache<K, V> {
    private record Entry<V>(V value, Instant expiresAt) {}

    private final Map<K, Entry<V>> entries = new HashMap<>();
    private final int capacity;
    private final EvictionPolicy<K> policy;
    private final Clock clock;
    private long hits, misses, evictions, expirations;

    PolicyCache(int capacity, EvictionPolicy<K> policy, Clock clock) {
        if (capacity <= 0) throw new IllegalArgumentException("capacity must be positive");
        this.capacity = capacity;
        this.policy = policy;
        this.clock = clock;
    }

    public Optional<V> get(K key) {
        Entry<V> e = entries.get(Objects.requireNonNull(key));
        if (e == null) {
            misses++;
            return Optional.empty();
        }
        if (e.expiresAt() != null && !clock.instant().isBefore(e.expiresAt())) {   // lazy expiry
            entries.remove(key);
            policy.onRemove(key);
            expirations++;
            misses++;
            return Optional.empty();
        }
        policy.onAccess(key);
        hits++;
        return Optional.of(e.value());
    }

    public void put(K key, V value, Duration ttl) {
        Objects.requireNonNull(key);
        Objects.requireNonNull(value);
        Entry<V> entry = new Entry<>(value, ttl == null ? null : clock.instant().plus(ttl));
        if (entries.containsKey(key)) {
            entries.put(key, entry);
            policy.onAccess(key);
            return;
        }
        if (entries.size() >= capacity) {
            entries.remove(policy.victim());
            evictions++;
        }
        entries.put(key, entry);
        policy.onPut(key);
    }

    public boolean remove(K key) {
        if (entries.remove(key) == null) return false;
        policy.onRemove(key);
        return true;
    }

    public int size() { return entries.size(); }
    public CacheStats stats() { return new CacheStats(hits, misses, evictions, expirations); }
}

/** Proxy: same interface, adds mutual exclusion around any Cache. */
final class SynchronizedCache<K, V> implements Cache<K, V> {
    private final Cache<K, V> target;
    private final ReentrantLock lock = new ReentrantLock();

    SynchronizedCache(Cache<K, V> target) { this.target = target; }

    // get() reorders the policy's list, so it is a write too: a read-write lock would not help.
    public Optional<V> get(K key) { lock.lock(); try { return target.get(key); } finally { lock.unlock(); } }
    public void put(K key, V value, Duration ttl) { lock.lock(); try { target.put(key, value, ttl); } finally { lock.unlock(); } }
    public boolean remove(K key) { lock.lock(); try { return target.remove(key); } finally { lock.unlock(); } }
    public int size() { lock.lock(); try { return target.size(); } finally { lock.unlock(); } }
    public CacheStats stats() { lock.lock(); try { return target.stats(); } finally { lock.unlock(); } }
}

final class MutableClock extends Clock {
    private volatile Instant now;
    MutableClock(Instant start) { now = start; }
    void advance(Duration d) { now = now.plus(d); }
    @Override public Instant instant() { return now; }
    @Override public ZoneId getZone() { return ZoneOffset.UTC; }
    @Override public Clock withZone(ZoneId zone) { return this; }
}
```
````

## Design decisions

- **Policy as a strategy that only sees keys.** `EvictionPolicy<K>` has four callbacks and no access to values; LRU, LFU, FIFO or "random" are each one class (see [Strategy](lesson:strategy)).
- **O(1) everywhere.** LRU is a hash map plus a doubly linked list; LFU is a hash map plus a linked list of frequency buckets, which also stays correct when keys are removed from the middle (see [Choosing data structures](lesson:data-structure-selection)).
- **Thread safety as a proxy.** `SynchronizedCache` wraps any `Cache` and adds a lock; the policies stay simple single-threaded code and can be tested without threads (see [Proxy](lesson:proxy)).
- **A plain lock, not a read-write lock.** In LRU and LFU **every `get` mutates** the ordering, so there are no pure reads to share (see [Locks and atomics](lesson:locks-and-atomics)).
- **Generics end to end.** `Cache<K, V>`, `EvictionPolicy<K>`, and factory methods that infer types (`Caches.lru(3, clock)`) (see [Collections and generics](lesson:collections-and-generics)).
- **Lazy TTL.** Expiry is checked on `get`, using an injected clock; no background thread is needed for correctness.

## Patterns and principles

[Strategy](lesson:strategy) (`EvictionPolicy`), [Proxy](lesson:proxy) (`SynchronizedCache`), factory methods (`Caches`), [generics](lesson:collections-and-generics), and [data-structure selection](lesson:data-structure-selection) for O(1) LRU and LFU.

## Example execution flow

```text
LRU cap 3: put a, b, c        list: c, b, a
get(a)                        list: a, c, b
put(d) (full)                 victim = back = b -> list: d, a, c
LFU cap 3: put a, b, c        buckets [1: a, b, c]
get a, a, b                   [1: c] [2: b] [3: a]
put(d) (full)                 victim = first of lowest bucket = c -> [1: d] [2: b] [3: a]
put(e) (full)                 victim = d -> [1: e] [2: b] [3: a]
otp with ttl 30s; +31s        get(otp): expired -> removed, counted as expiration and miss
```

```text title="Program output"
LRU after put d: a=Optional[1] b=Optional.empty c=Optional[3] d=Optional[4]
LFU after put d, e: a=Optional[0] b=Optional[0] c=Optional.empty d=Optional.empty e=Optional[0]
after 31s: otp=Optional.empty profile=Optional[Asha] size=1
stats: CacheStats[hits=1, misses=1, evictions=0, expirations=1]
concurrent: 80000 lookups, size 100 (capacity 100)
```

## Edge cases

- **Overwriting an existing key** → counts as a use; never evicts.
- **Capacity 1** → each new key evicts the previous one.
- **Explicit `remove`, or expiry, of a key in the middle of the LRU list or an LFU bucket** → O(1) unlink; ordering stays consistent.
- **Expired entries still occupying space** → they're removed when touched; a full cache may evict a live entry while a dead one lingers (see the follow-up on sweeping).
- **Null key or value** → rejected.
- **Capacity 0 or negative** → rejected at construction.

## Tests

```java title="CacheTest.java" file="CacheTest.java" test="CacheDemo.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

class CacheTest {
    private final MutableClock clock = new MutableClock(Instant.parse("2026-01-01T00:00:00Z"));

    @Test
    void lruEvictsTheLeastRecentlyUsedAndOverwriteCountsAsUse() {
        Cache<String, Integer> c = Caches.lru(2, clock);
        c.put("a", 1);
        c.put("b", 2);
        c.put("a", 10);                          // a is now most recent
        c.put("c", 3);                           // evicts b
        assertEquals(Optional.empty(), c.get("b"));
        assertEquals(Optional.of(10), c.get("a"));
    }

    @Test
    void lfuBreaksTiesByRecency() {
        Cache<String, Integer> c = Caches.lfu(3, clock);
        c.put("a", 1);
        c.put("b", 2);
        c.put("c", 3);
        c.get("b");
        c.get("c");                              // a=1, b=2, c=2 (b reached 2 first)
        c.put("d", 4);                           // evicts a
        c.put("e", 5);                           // evicts d (freq 1)
        c.get("e");                              // e=2, now b, c, e tie at 2; b is oldest
        c.put("f", 6);                           // victim is b
        assertEquals(Optional.empty(), c.get("a"));
        assertEquals(Optional.empty(), c.get("b"));
        assertTrue(c.get("c").isPresent() && c.get("e").isPresent() && c.get("f").isPresent());
    }

    @Test
    void removingTheLowestLfuBucketKeepsEvictionCorrect() {
        Cache<String, Integer> c = Caches.lfu(2, clock);
        c.put("a", 1);
        c.put("b", 2);
        c.get("b");
        c.remove("a");                           // the frequency-1 bucket disappears
        c.put("c", 3);
        c.put("d", 4);                           // must evict c (freq 1), not b (freq 2)
        assertEquals(Optional.of(2), c.get("b"));
        assertEquals(Optional.empty(), c.get("c"));
    }

    @Test
    void ttlExpiresLazily() {
        Cache<String, String> c = Caches.lru(5, clock);
        c.put("k", "v", Duration.ofSeconds(10));
        clock.advance(Duration.ofSeconds(9));
        assertEquals(Optional.of("v"), c.get("k"));
        clock.advance(Duration.ofSeconds(1));
        assertEquals(Optional.empty(), c.get("k"));
        assertEquals(0, c.size());
        assertEquals(1, c.stats().expirations());
    }

    @Test
    void concurrentUseKeepsCacheAndPolicyInSync() throws InterruptedException {
        for (Cache<Integer, Integer> c : List.of(Caches.<Integer, Integer>lru(50, Clock.systemUTC()), Caches.<Integer, Integer>lfu(50, Clock.systemUTC()))) {
            ExecutorService pool = Executors.newFixedThreadPool(8);
            CountDownLatch go = new CountDownLatch(1);
            for (int t = 0; t < 8; t++) {
                pool.submit(() -> {
                    go.await();
                    for (int i = 0; i < 20_000; i++) {
                        int k = ThreadLocalRandom.current().nextInt(200);
                        switch (i % 3) {
                            case 0 -> c.put(k, k);
                            case 1 -> c.get(k);
                            default -> c.remove(k);
                        }
                    }
                    return null;
                });
            }
            go.countDown();
            pool.shutdown();
            pool.awaitTermination(30, TimeUnit.SECONDS);
            assertTrue(c.size() <= 50);
            for (int k = 0; k < 200; k++) c.remove(k);
            for (int k = 1_000; k < 1_100; k++) c.put(k, k);    // a policy out of sync with the map would mis-evict here
            assertEquals(50, c.size());
            for (int k = 1_000; k < 1_050; k++) assertEquals(Optional.empty(), c.get(k));
            for (int k = 1_050; k < 1_100; k++) assertEquals(Optional.of(k), c.get(k));
        }
    }
}
```

## Concurrency

- **One lock per cache** via the proxy is simple and correct. Its limit is throughput on a hot cache with many cores.
- **Scaling up:** shard the cache — N independent `PolicyCache`s, each with its own lock, chosen by `hash(key) % N`. Eviction becomes "least recently used within the shard", which is a fine approximation.
- **Further:** production caches (Caffeine) record accesses in lock-free per-thread buffers and apply them to the policy in batches, so `get` almost never takes a lock. Eviction order becomes slightly approximate in exchange for near-linear scaling.
- **Loading on a miss:** if 100 threads miss the same key at once, they all call the database. A loading proxy should keep one in-flight load per key (a `ConcurrentHashMap<K, CompletableFuture<V>>`) — see the follow-up.

## Common mistakes and alternatives

- **LRU with an `ArrayList` or a queue** — moving an element is O(n).
- **LFU with a single `minFreq` integer** — breaks when keys are removed or expire.
- **LFU with a heap** — O(log n), and updating a key's priority in a heap is awkward.
- **Forgetting `onRemove` on expiry** — the policy later picks a victim that is no longer in the map.
- **A read-write lock "because `get` is a read"** — in LRU/LFU it's a write.
- **Alternative:** `LinkedHashMap(capacity, 0.75f, true)` with `removeEldestEntry` is a correct LRU in ten lines — mention it, then build it.

## Follow-up questions

````reveal title="Read-through loading without a thundering herd"
A `LoadingCache` proxy takes a `Function<K, V>` loader. On a miss it puts a `CompletableFuture` for the key into a concurrent map with `putIfAbsent`; the thread that wins runs the loader, everyone else waits on the same future. When it completes, the value goes into the underlying cache and the future is removed.
````

````reveal title="Sweep expired entries proactively"
Keep a second structure ordered by expiry (a `TreeMap<Instant, Set<K>>`, or a timing wheel). A periodic task — or each `put` — removes entries whose time has passed, calling `onRemove` for each. Then a full cache evicts dead entries before live ones.
````

````reveal title="Evict by size instead of count"
Give each entry a weight (bytes). Replace `size >= capacity` with a loop: while `totalWeight + newWeight > maxWeight`, evict a victim. One large entry may evict several small ones; reject entries heavier than the whole cache.
````

## Complexity

- `get`, `put`, `remove`: O(1) average for both LRU and LFU.
- Memory: O(capacity) entries plus one list node (LRU) or one bucket reference (LFU) per key.

## Interviewer checklist

- [ ] O(1) LRU: hash map + doubly linked list
- [ ] O(1) LFU: frequency buckets with recency tie-break, correct under removal
- [ ] Policy as a strategy; cache keeps policy and map in sync on every path
- [ ] Generic API; TTL with an injected clock
- [ ] Thread safety via a proxy; why not a read-write lock; sharding for scale
- [ ] Thundering herd on misses discussed
