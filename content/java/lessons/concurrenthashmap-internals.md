## Concept explanation

### What it is

`ConcurrentHashMap<K, V>` (`java.util.concurrent`) is a hash map that many threads can read and write **at the same time** without external locking and without corrupting it. Highlights:

- **Reads never block** (`get`, `containsKey`, iteration).
- **Writes lock only one bucket** (or use a lock-free CAS for an empty bucket), so writers to different buckets proceed in parallel.
- **Atomic per-key compound operations**: `putIfAbsent`, `computeIfAbsent`, `computeIfPresent`, `compute`, `merge`, `replace(k, old, new)`, `remove(k, v)`.
- **No `null` keys or values.**
- **Weakly consistent iterators** — never throw `ConcurrentModificationException`.
- Bulk parallel operations (`forEach`, `reduce`, `search` with a parallelism threshold) and `mappingCount()`.

### Synchronized vs concurrent collections

| | `Hashtable` | `Collections.synchronizedMap(m)` | `ConcurrentHashMap` |
|---|---|---|---|
| Locking | every method locks the whole map | every method locks one mutex | CAS for empty bins, `synchronized` on a single bin head; reads lock-free |
| Concurrent writers | serialised | serialised | parallel (different bins) |
| Compound actions (check-then-act) | **not atomic** | **not atomic** | atomic methods built in |
| Iteration while others write | must lock manually or CME | must hold the mutex manually | safe, weakly consistent |
| Nulls | no | as the wrapped map | no |

`Collections.synchronizedList/Map/Set` wrappers make individual calls thread-safe, but **sequences of calls** (`if (!m.containsKey(k)) m.put(k, v)`) and **iteration** still need `synchronized (m) { ... }` around them.

### Why there are no nulls

With concurrency, `get(k)` returning `null` must unambiguously mean "absent": you can't follow up with `containsKey(k)` because another thread may have changed the map in between. Forbidding null values (and keys) removes the ambiguity.

### When to use it

Any map shared between threads: caches, registries, counters, de-duplication, session stores, rate-limiter buckets. For read-mostly lists use `CopyOnWriteArrayList`; for sorted concurrent maps `ConcurrentSkipListMap`; for queues the `BlockingQueue`s (see [concurrent collections in practice](lesson:concurrent-collections-in-practice)).

## Internal working

This describes the Java 8+ implementation (Java 7 used 16 `Segment`s, each a separately locked mini-hash-table).

### Architecture

```java
transient volatile Node<K,V>[] table;     // power-of-two bins, read with acquire semantics
private transient volatile Node<K,V>[] nextTable;   // non-null only while resizing
private transient volatile int sizeCtl;   // init/resize control: -1 initialising, <-1 resizing, else next threshold
private transient volatile long baseCount;           // size counter...
private transient volatile CounterCell[] counterCells;  // ...striped under contention, like LongAdder
```

Hashes are spread like `HashMap`'s and then masked to be **non-negative**, because negative hashes mark special nodes: `MOVED` (-1, a `ForwardingNode` left in a bin already moved during a resize), `TREEBIN` (-2, a treeified bin), `RESERVED` (-3, a placeholder during `computeIfAbsent`).

### Insertion (`putVal`)

1. If the table isn't allocated, initialise it (one thread wins a CAS on `sizeCtl`; others yield).
2. Find the bin: `f = tabAt(table, i)` (a volatile read).
3. **Empty bin** → `casTabAt(table, i, null, newNode)`: a **lock-free CAS**. If it fails, another thread got there first — loop and retry.
4. **Bin is a `ForwardingNode`** → a resize is in progress: **help** move bins (`helpTransfer`), then retry in the new table.
5. Otherwise **`synchronized (f)`** — lock only this bin's head node — and walk the list or tree to replace or append. Bins reaching 8 nodes are treeified (`TreeBin`, if the table has ≥ 64 bins).
6. `addCount(1)`: increment `baseCount` with CAS; if contended, increment a random `CounterCell` instead. If the new size exceeds `sizeCtl`, start (or join) a resize.

### Retrieval (`get`)

No locks at all: read the bin with acquire semantics, compare the first node, follow `next` links (fields `val` and `next` are `volatile`), or delegate to the `TreeBin`/`ForwardingNode`'s `find`. A reader always sees a consistent node chain because nodes are published with release semantics.

### Resizing — cooperatively

The table doubles. Each thread that participates claims a **stride** of bins (at least 16), locks each bin, splits it into lo/hi lists in `nextTable` (like `HashMap`), and installs a `ForwardingNode` in the old bin. Readers hitting a forwarding node are redirected to the new table; writers help with the transfer. No global stop-the-world.

### Size

`size()`/`mappingCount()` sum `baseCount` and all `CounterCell`s — an **estimate** under concurrent updates (accurate when quiescent). `mappingCount()` returns a `long`.

### Atomic compute methods

`compute`, `computeIfAbsent` and `merge` run your function **while holding the bin lock** (or after reserving the slot with a `ReservationNode`), so the read–compute–write is atomic per key. Keep those functions **short**, side-effect-free, and never modify **other** keys of the same map inside them (it can deadlock or throw `IllegalStateException: Recursive update`).

### Memory

Similar to `HashMap` (~32-byte nodes), plus counter cells under contention. Because the table never shrinks, a map that briefly held millions of entries keeps its large table.

## Visual representation

```text title="Writers lock one bin; readers never lock"
  table:
   0 [ ]                      <- thread A: put("x") -> empty bin -> CAS(null -> node)   (no lock)
   1 [k1] -> [k9]             <- thread B: put("k9", ..) -> synchronized(k1 head)        (locks bin 1)
   2 [k2]                     <- thread C: put("k2", ..) -> synchronized(k2 head)        (parallel with B)
   3 [FWD] ---> nextTable     <- resize in progress: readers redirected, writers help transfer
   4 [TreeBin]                <- treeified bin with its own lock
       ^
   thread D: get("k9") -> volatile reads only, never blocks

  size:  baseCount (CAS)  +  CounterCell[0..n] (striped increments under contention)
```

## Java code example

```java title="ConcurrentMapDemo.java" file="ConcurrentMapDemo.java"
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public class ConcurrentMapDemo {
    static final int THREADS = 4;
    static final int INCREMENTS = 200_000;

    public static void main(String[] args) throws Exception {
        // 1. Read-modify-write on a HashMap from several threads loses updates
        boolean lost = false;
        for (int attempt = 0; attempt < 5 && !lost; attempt++) {
            Map<String, Integer> unsafe = new HashMap<>();
            unsafe.put("hits", 0);
            run(() -> unsafe.put("hits", unsafe.get("hits") + 1));
            lost = unsafe.get("hits") < THREADS * INCREMENTS;
        }
        System.out.println("HashMap get+put from " + THREADS + " threads lost updates: " + lost);

        // 2. The same counter with an atomic merge is exact
        Map<String, Integer> safe = new ConcurrentHashMap<>();
        run(() -> safe.merge("hits", 1, Integer::sum));
        System.out.println("ConcurrentHashMap.merge total: " + safe.get("hits") + " (expected " + THREADS * INCREMENTS + ")");

        // 3. A thread-safe map does NOT make check-then-act atomic; putIfAbsent does
        ConcurrentHashMap<String, String> owners = new ConcurrentHashMap<>();
        AtomicInteger winners = new AtomicInteger();
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(8);
        for (int i = 0; i < 8; i++) {
            String me = "worker-" + i;
            pool.submit(() -> {
                start.await();
                if (owners.putIfAbsent("lock", me) == null) {    // exactly one thread can win
                    winners.incrementAndGet();
                }
                return null;
            });
        }
        start.countDown();
        pool.shutdown();
        pool.awaitTermination(10, TimeUnit.SECONDS);
        System.out.println("putIfAbsent winners: " + winners.get());

        // 4. computeIfAbsent builds each value once per key
        ConcurrentHashMap<Integer, String> cache = new ConcurrentHashMap<>();
        AtomicInteger computations = new AtomicInteger();
        run(() -> cache.computeIfAbsent(42, k -> {
            computations.incrementAndGet();
            return "expensive-" + k;
        }));
        System.out.println("computeIfAbsent ran " + computations.get() + " time(s) for " + THREADS * INCREMENTS + " calls");

        // 5. No nulls
        try {
            safe.put("k", null);
        } catch (NullPointerException e) {
            System.out.println("ConcurrentHashMap rejects null values");
        }

        // 6. synchronizedMap: single calls are safe, iteration needs the lock
        Map<String, Integer> syncMap = Collections.synchronizedMap(new HashMap<>(Map.of("a", 1, "b", 2)));
        int sum = 0;
        synchronized (syncMap) {                                 // required while iterating
            for (int v : syncMap.values()) {
                sum += v;
            }
        }
        System.out.println("synchronizedMap sum (iterated under its lock): " + sum);

        // 7. Bulk operations and size
        ConcurrentHashMap<String, Integer> stock = new ConcurrentHashMap<>(Map.of("pen", 3, "ink", 7, "pad", 5));
        long totalUnits = stock.reduceValuesToLong(1, Integer::longValue, 0L, Long::sum);
        System.out.println("total units " + totalUnits + ", mappingCount " + stock.mappingCount());
    }

    /** Runs the action THREADS x INCREMENTS times across THREADS threads that start together. */
    static void run(Runnable action) throws InterruptedException {
        CountDownLatch start = new CountDownLatch(1);
        Thread[] threads = new Thread[THREADS];
        for (int t = 0; t < THREADS; t++) {
            threads[t] = new Thread(() -> {
                try {
                    start.await();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return;
                }
                for (int i = 0; i < INCREMENTS; i++) {
                    action.run();
                }
            });
            threads[t].start();
        }
        start.countDown();
        for (Thread t : threads) {
            t.join();
        }
    }
}
```

## Output

```text title="Output" output="ConcurrentMapDemo.java"
HashMap get+put from 4 threads lost updates: true
ConcurrentHashMap.merge total: 800000 (expected 800000)
putIfAbsent winners: 1
computeIfAbsent ran 1 time(s) for 800000 calls
ConcurrentHashMap rejects null values
synchronizedMap sum (iterated under its lock): 3
total units 15, mappingCount 3
```

- The `HashMap` counter came up short: two threads read the same value, both add one, and one write overwrites the other. (Races are nondeterministic; the program retries a few times, but in practice the very first attempt loses thousands of updates.)
- `merge` performed the read-add-write atomically per key: the total is exact.
- Eight threads raced for one key; `putIfAbsent` let exactly one win. A `containsKey` check followed by `put` would let several "win".
- `computeIfAbsent` ran the expensive function once, even with 800,000 concurrent calls.

## Real-world application

- **Caches and memoisation**: `cache.computeIfAbsent(key, this::load)` — the canonical lazy, thread-safe cache (for size limits and expiry, Caffeine is built on the same ideas).
- **Counters and metrics**: `map.merge(key, 1L, Long::sum)`, or `ConcurrentHashMap<String, LongAdder>` with `computeIfAbsent(k, x -> new LongAdder()).increment()` for very hot keys.
- **Registries and connection tracking**: active sessions, WebSocket connections, per-client rate-limiter buckets (see the [concurrent rate limiter exercise](problem:concurrent-rate-limiter)).
- **Idempotency and de-duplication**: `putIfAbsent(requestId, …)` decides which request processes a payment.
- **Frameworks**: Spring's bean registries, Jackson's serializer caches and Netty internals all lean on `ConcurrentHashMap`.

## Common mistakes

- **Check-then-act with separate calls** (`containsKey` + `put`, `get` + `put`) on a concurrent map — still a race; use the atomic methods.
- **Slow or blocking work inside `compute`/`computeIfAbsent`** (holding a bin lock), or modifying other keys of the same map inside them.
- **Expecting `size()` to be exact under load**, or iteration to be a snapshot.
- **Storing `null`** as "unknown" — use `Optional` or a sentinel value.
- **Mutable values** (`ConcurrentHashMap<String, List<X>>`) updated outside `compute` — the map is thread-safe, the lists aren't.
- **Iterating a `synchronizedMap` without holding its lock.**
- **Choosing `Hashtable`** for thread safety.

## Interview questions

**Q1. How does `ConcurrentHashMap` achieve thread safety without locking the whole map?**

````reveal title="Answer"
(Java 8+) Reads are lock-free: the table and node links are volatile, so `get` just reads. Writes to an empty bin use a CAS on the table slot; writes to a non-empty bin `synchronize` on that bin's head node only, so different bins are updated in parallel. Resizing is cooperative: threads claim ranges of bins, move them to the new table and leave `ForwardingNode`s that redirect readers. Size is tracked with a `LongAdder`-style striped counter. (Java 7 used 16 independently locked segments.)
````

**Q2. Why doesn't `ConcurrentHashMap` allow null keys or values?**

````reveal title="Answer"
In a concurrent map, `get(k) == null` must mean "absent": with nulls allowed you'd need a follow-up `containsKey(k)`, but another thread could change the map between the two calls, so the answer would be unreliable. Banning nulls keeps `get`, `putIfAbsent`, `compute` and friends unambiguous.
````

**Q3. Is `map.put(k, map.get(k) + 1)` safe on a `ConcurrentHashMap`?**

````reveal title="Answer"
No. Each call is thread-safe, but the sequence isn't atomic: two threads can read the same value and both write value + 1, losing an update. Use `map.merge(k, 1, Integer::sum)` or `map.compute(k, (key, v) -> v == null ? 1 : v + 1)`, which run atomically per key — or `LongAdder` values for very hot counters.
````

**Q4. `ConcurrentHashMap` vs `Collections.synchronizedMap` vs `Hashtable`?**

````reveal title="Answer"
`Hashtable` and `synchronizedMap` serialise every operation on one lock; compound actions and iteration still need manual `synchronized (map)` blocks; `Hashtable` rejects nulls. `ConcurrentHashMap` allows parallel writes to different bins and lock-free reads, has atomic compound operations, weakly consistent iterators that never throw CME, and scales far better under contention.
````

**Q5. Is `ConcurrentHashMap.size()` accurate?**

````reveal title="Answer"
Only when no updates are in flight. It sums a base counter and striped counter cells without locking, so under concurrent modification it's an estimate. Use `mappingCount()` (returns `long`) and don't base correctness on either.
````

## Hands-on exercise

Write a thread-safe `WordIndex` that maps each word to the **set of document ids** containing it:

- `void add(int docId, String text)` — called concurrently from many threads;
- `Set<Integer> docsFor(String word)`.

Use `ConcurrentHashMap<String, Set<Integer>>` so that no update is ever lost, and test it with 8 threads indexing 1,000 documents each.

````hint title="Hint"
`index.computeIfAbsent(word, w -> ConcurrentHashMap.newKeySet()).add(docId)` — `computeIfAbsent` atomically creates the set once, and `newKeySet()` returns a thread-safe set for the concurrent `add`s.
````

````solution title="Solution"
```java title="WordIndexDemo.java" file="WordIndexDemo.java"
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class WordIndexDemo {
    public static void main(String[] args) throws InterruptedException {
        WordIndex index = new WordIndex();
        ExecutorService pool = Executors.newFixedThreadPool(8);
        for (int t = 0; t < 8; t++) {
            int base = t * 1_000;
            pool.submit(() -> {
                for (int doc = base; doc < base + 1_000; doc++) {
                    index.add(doc, doc % 2 == 0 ? "java even" : "java odd");
                }
            });
        }
        pool.shutdown();
        pool.awaitTermination(30, TimeUnit.SECONDS);
        System.out.println("java: " + index.docsFor("java").size() + " docs, even: " + index.docsFor("even").size()
                + ", odd: " + index.docsFor("odd").size() + ", missing: " + index.docsFor("kotlin").size());
    }
}

final class WordIndex {
    private final ConcurrentHashMap<String, Set<Integer>> index = new ConcurrentHashMap<>();

    void add(int docId, String text) {
        for (String word : text.split("\\s+")) {
            index.computeIfAbsent(word, w -> ConcurrentHashMap.newKeySet()).add(docId);
        }
    }

    Set<Integer> docsFor(String word) {
        return index.getOrDefault(word, Set.of());
    }
}
```

```text title="Output" output="WordIndexDemo.java"
java: 8000 docs, even: 4000, odd: 4000, missing: 0
```

With a plain `HashMap` + `HashSet` (or even `ConcurrentHashMap` with `HashSet` values), some document ids would be lost or the sets corrupted.
````

## Knowledge check

```quiz
? What does ConcurrentHashMap lock when you put into a non-empty bin (Java 8+)?
- The whole map
- One of 16 segments
+ The head node of that bin only
> Empty bins use CAS; non-empty bins synchronize on their first node.

? Does ConcurrentHashMap.get() acquire a lock?
+ No; it uses volatile reads
- Yes, a read lock
- Yes, the bin lock
> Reads are lock-free.

? Which is atomic on a ConcurrentHashMap?
+ map.merge(key, 1, Integer::sum)
- if (!map.containsKey(k)) map.put(k, v)
- map.put(k, map.get(k) + 1)
> Compound actions must use the built-in atomic methods.

? What happens when iterating a ConcurrentHashMap while another thread adds entries?
+ No exception; changes may or may not be visible (weakly consistent)
- ConcurrentModificationException
- The iterator blocks until the writer finishes
> Iterators are weakly consistent.

? Why must you hold the lock while iterating a Collections.synchronizedMap?
+ Each call is synchronized, but iteration is many calls; another thread could modify the map between them
- Iteration is not allowed otherwise
- For performance
> Without the lock you get CME or inconsistent results.
```

## Key takeaways

- **Lock-free reads**, **CAS for empty bins**, **`synchronized` on one bin** for other writes, **cooperative resizing** with forwarding nodes, **striped size counters**.
- Use the **atomic methods** (`merge`, `compute*`, `putIfAbsent`, conditional `replace`/`remove`) — separate calls are still races.
- **No nulls**; iterators are **weakly consistent**; `size()` is an estimate under load.
- `Hashtable`/`synchronizedMap` serialise everything and need manual locking for compound actions and iteration.
- Keep `compute` functions short and never touch other keys inside them.
