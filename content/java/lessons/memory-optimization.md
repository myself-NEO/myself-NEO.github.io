## Concept explanation

### Know what your data costs

On a 64-bit JVM with **compressed oops** (heaps under ~32 GB, the default):
- **every object has a 12-byte header** (mark word + compressed class pointer);
- objects are **8-byte aligned**;
- **references take 4 bytes**.

So "small" objects aren't small (the JVM stage has the details):

| Data | Approximate footprint |
|---|---|
| `int` in an `int[]` | **4 bytes** |
| `Integer` (outside the -128..127 cache) + its reference in a list | **16 + 4 = 20 bytes** |
| `HashSet<Integer>` per element | node 32 + `Integer` 16 + table slots ~10 ≈ **58 bytes** |
| `boolean` in a `boolean[]` | 1 byte; in a **`BitSet`**: **1 bit** |
| `String` of n Latin-1 chars | 24 (String) + 16 + n (byte[]) bytes (**compact strings**, Java 9+) |
| `String` with any non-Latin-1 char | 24 + 16 + **2n** bytes (UTF-16) |
| object with `long`, `int`, `double` fields | 12 + 8 + 4 + 8 = 32 bytes, + 4 for each reference to it |

A collection of 10 million boxed values easily costs **10x** the raw data. Memory optimisation is mostly about **representation**: fewer objects, fewer references, primitive storage, sharing, and bounding what you keep.

### Techniques that pay off

| Technique | Example |
|---|---|
| **Primitive collections/arrays** instead of boxing | `int[]`, `long[]`; fastutil/Eclipse Collections/HPPC (`IntArrayList`, `Long2ObjectOpenHashMap`) |
| **Bit sets and enums** | `BitSet` for flags or membership of dense ids; `EnumSet` (a single `long` bit mask) and `EnumMap` (an array) |
| **Canonicalise repeated values** | enums for statuses; a map from string to a shared instance for repeated values; `-XX:+UseStringDeduplication` (G1) deduplicates `String` arrays |
| **Presize collections** | `new ArrayList<>(n)`, `HashMap.newHashMap(n)` (Java 19): no growth copies, no wasted capacity |
| **Struct of arrays** | `long[] ids; int[] qty; double[] price` instead of `Order[]`: no headers and better cache locality (columnar layout) |
| **Stream, don't load** | process files and query results row by row (`BufferedReader.lines()`, JDBC fetch size, pagination) instead of `readAllLines`/`findAll` |
| **Bound caches** | size or weight limits plus expiry (Caffeine, `LinkedHashMap` LRU); never an unbounded static `HashMap` |
| **Trim and release** | `trimToSize()` for long-lived lists, clearing references from long-lived structures, closing resources |
| **Off-heap** for huge buffers | direct `ByteBuffer`s, memory-mapped files, the Foreign Function & Memory API (`MemorySegment`, Java 22) |

## Internal working

- **Shallow vs retained size**:
  - **shallow** size is the object itself;
  - **retained** size is everything that would be freed if the object were collected (its exclusively referenced graph).
  
  Heap analysers (Eclipse MAT, IntelliJ, VisualVM) compute the retained size from a **heap dump** via the dominator tree. That's how you find "this `ConcurrentHashMap` retains 1.2 GB".
- **Measuring**:
  - `jcmd <pid> GC.class_histogram` (instance counts and shallow bytes per class, cheap);
  - `jcmd <pid> GC.heap_dump file.hprof` (full graph; triggers a full GC and pauses the app);
  - JOL (`ClassLayout.parseClass(X.class).toPrintable()`) for exact field layouts;
  - JFR's `ObjectAllocationSample`, or async-profiler `-e alloc`, for where allocations happen;
  - `ThreadMXBean.getThreadAllocatedBytes` for bytes allocated by a thread (used below).
- **Collection internals**:
  - **`ArrayList`** grows by 50%, copying into a new array, so the old arrays become garbage. A list built from 10 elements to 1 million has allocated about three times its final array size.
  - **`HashMap`**: a power-of-two table resized (rehashing everything) when `size > 0.75 × capacity`, plus a 32-byte `Node` per entry (`TreeNode` is bigger).
  - **`HashMap.newHashMap(n)`** computes the capacity so that n entries don't trigger a resize. `new HashMap<>(n)` treats n as the capacity, so it resizes at 0.75n, which is a common mistake.
- **Compact strings** (JEP 254): `String` stores a `byte[]` plus a `coder` flag. Latin-1 text uses 1 byte per char, and anything else switches the **whole string** to UTF-16 (2 bytes per char). **String deduplication** (G1, Shenandoah, ZGC since Java 18) makes equal strings share one `byte[]` in the background, though the `String` objects remain separate.
- **GC impact**:
  - fewer, larger, primitive-filled objects mean less marking work (the GC traces references; a `long[]` has none);
  - smaller live sets mean shorter old-generation collections and a smaller heap;
  - pointer-heavy structures (`LinkedList`, `TreeMap`, object graphs) also hurt **CPU cache locality**: every hop is a potential cache miss.
- **Project Valhalla** (in preview) will add **value classes**: objects without identity that the JVM can flatten into arrays and fields, giving `Order[]` the layout of a struct array. Until then, flattening is manual.

## Visual representation

```text title="One million order quantities, three ways"
 List<Integer>  [ref][ref][ref]...      each ref -> Integer object (12 header + 4 value)
                 4 MB refs + 16 MB objects  ~= 20 MB, 1,000,001 objects for the GC to trace

 int[]          [ 7 | 2 | 9 | 1 | ... ]       4 MB, one object, no pointers

 Order[] (objects)                   struct of arrays
 [ref]->{hdr12|id8|qty4|price8}       long[]   ids    [........]
 [ref]->{hdr12|id8|qty4|price8}       int[]    qty    [....]
  36 bytes per order                  double[] price  [........]   20 bytes per order, sequential in memory
```

## Java code example

Footprints are measured as **bytes allocated by this thread** while building each structure. Collections are presized (except in the growth comparison), so the allocated bytes equal what the structure retains.

```java title="MemoryDemo.java" file="MemoryDemo.java" run="-XX:+UseSerialGC -Xmx512m"
import java.lang.management.ManagementFactory;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.BitSet;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.function.Supplier;

public class MemoryDemo {
    static final com.sun.management.ThreadMXBean THREADS =
            (com.sun.management.ThreadMXBean) ManagementFactory.getThreadMXBean();
    static final int N = 100_000;
    static Object keep;                                         // keeps the measured structure reachable

    static long measure(String label, Supplier<Object> build) {
        build.get();                                            // warm-up: load classes, first-time costs
        long before = THREADS.getThreadAllocatedBytes(Thread.currentThread().getId());
        keep = build.get();
        long bytes = THREADS.getThreadAllocatedBytes(Thread.currentThread().getId()) - before;
        System.out.printf("%-46s %,11d bytes  (%5.1f bytes/element)%n", label, bytes, (double) bytes / N);
        return bytes;
    }

    enum Status { NEW, PAID, SHIPPED, DELIVERED, CANCELLED }

    static final class Order {
        long id;
        int quantity;
        double price;
    }

    public static void main(String[] args) {
        System.out.println("Storing " + String.format("%,d", N) + " ids (values 1000.." + (1000 + N - 1) + "):");
        measure("ArrayList<Integer> (presized)", () -> {
            List<Integer> list = new ArrayList<>(N);
            for (int i = 0; i < N; i++) list.add(1000 + i);
            return list;
        });
        measure("int[]", () -> {
            int[] a = new int[N];
            for (int i = 0; i < N; i++) a[i] = 1000 + i;
            return a;
        });
        measure("HashSet<Integer> (presized)", () -> {
            Set<Integer> set = new HashSet<>((int) (N / 0.75f) + 1);
            for (int i = 0; i < N; i++) set.add(1000 + i);
            return set;
        });
        measure("BitSet (membership of dense ids)", () -> {
            BitSet bits = new BitSet(1000 + N);
            for (int i = 0; i < N; i++) bits.set(1000 + i);
            return bits;
        });

        System.out.println("Growth vs presizing (same final contents):");
        long grown = measure("ArrayList<Integer> grown from default capacity", () -> {
            List<Integer> list = new ArrayList<>();
            for (int i = 0; i < N; i++) list.add(1000 + i);
            return list;
        });
        System.out.println("  of which garbage from growth copies is roughly " + String.format("%,d", grown - (16L * N + 16 + 4L * N)) + " bytes");

        System.out.println("Objects vs struct of arrays for orders (id, quantity, price):");
        measure("Order[] of objects", () -> {
            Order[] orders = new Order[N];
            for (int i = 0; i < N; i++) {
                Order o = new Order();
                o.id = i;
                o.quantity = i % 5 + 1;
                o.price = 9.99;
                orders[i] = o;
            }
            return orders;
        });
        measure("long[] + int[] + double[] (struct of arrays)", () -> {
            long[] ids = new long[N];
            int[] qty = new int[N];
            double[] price = new double[N];
            for (int i = 0; i < N; i++) {
                ids[i] = i;
                qty[i] = i % 5 + 1;
                price[i] = 9.99;
            }
            return new Object[] { ids, qty, price };
        });

        System.out.println("Repeated status values:");
        byte[] raw = "DELIVERED".getBytes(StandardCharsets.US_ASCII);
        measure("List<String> with a fresh String per row", () -> {
            List<String> statuses = new ArrayList<>(N);
            for (int i = 0; i < N; i++) statuses.add(new String(raw, StandardCharsets.US_ASCII));   // as if parsed from a file
            return statuses;
        });
        measure("List<Status> sharing enum constants", () -> {
            List<Status> statuses = new ArrayList<>(N);
            for (int i = 0; i < N; i++) statuses.add(Status.DELIVERED);
            return statuses;
        });
        long enumSet = measureOnce(() -> EnumSet.of(Status.PAID, Status.SHIPPED));
        System.out.println("  an EnumSet of statuses is one small object (a long bit mask): " + enumSet + " bytes");

        String eAcute = String.valueOf((char) 0xE9);                 // fits Latin-1
        String omega = String.valueOf((char) 0x3A9);                 // needs UTF-16
        System.out.println("Compact strings, 1,000 chars: Latin-1 text " + measureOnce(() -> eAcute.repeat(1_000))
                + " bytes, non-Latin-1 text " + measureOnce(() -> omega.repeat(1_000)) + " bytes");
    }

    static long measureOnce(Supplier<Object> build) {
        build.get();
        long before = THREADS.getThreadAllocatedBytes(Thread.currentThread().getId());
        keep = build.get();
        return THREADS.getThreadAllocatedBytes(Thread.currentThread().getId()) - before;
    }
}
```

## Output

```text title="Output" output="MemoryDemo.java"
Storing 100,000 ids (values 1000..100999):
ArrayList<Integer> (presized)                    2,001,360 bytes  ( 20.0 bytes/element)
int[]                                              400,016 bytes  (  4.0 bytes/element)
HashSet<Integer> (presized)                      5,848,656 bytes  ( 58.5 bytes/element)
BitSet (membership of dense ids)                    12,672 bytes  (  0.1 bytes/element)
Growth vs presizing (same final contents):
ArrayList<Integer> grown from default capacity   2,880,952 bytes  ( 28.8 bytes/element)
  of which garbage from growth copies is roughly 880,936 bytes
Objects vs struct of arrays for orders (id, quantity, price):
Order[] of objects                               3,600,016 bytes  ( 36.0 bytes/element)
long[] + int[] + double[] (struct of arrays)     2,000,080 bytes  ( 20.0 bytes/element)
Repeated status values:
List<String> with a fresh String per row         6,000,040 bytes  ( 60.0 bytes/element)
List<Status> sharing enum constants                400,040 bytes  (  4.0 bytes/element)
  an EnumSet of statuses is one small object (a long bit mask): 32 bytes
Compact strings, 1,000 chars: Latin-1 text 1040 bytes, non-Latin-1 text 2040 bytes
```

- **Boxing** costs about **20 bytes per value** in an `ArrayList<Integer>` (a 16-byte `Integer` plus a 4-byte reference) against 4 in an `int[]`. A `HashSet<Integer>` is almost **60 bytes per element**. For dense integer ids, a **`BitSet`** answers the same membership question in about **1 bit per possible id**, more than 400 times smaller than the set.
- **Growth**: the list grown from the default capacity allocated noticeably more than the presized one. The difference is the arrays discarded at each 1.5x growth step: garbage the GC must clean up.
- **Struct of arrays** saved the per-object header and the reference (36 → 20 bytes per order). The arrays are also contiguous, so scanning them is cache-friendly.
- **Repeated strings**: 100,000 separate `"DELIVERED"` strings cost about 60 bytes each. Enum constants are shared, so each row costs only its 4-byte reference. `EnumSet` stores a set of enum values as bits in one `long`.
- **Compact strings**: Latin-1 text uses one byte per character. A single character outside Latin-1 switches the whole string to two bytes per character.

## Real-world application

- **Caches**: the most common memory problem in services is an unbounded cache map. Use **Caffeine** with `maximumSize`/`maximumWeight` and `expireAfterWrite`, record hit rates, and size it from measured entry sizes (heap dump or JOL).
- **Large in-memory datasets** (pricing grids, routing tables, analytics):
  - primitive collections (fastutil, Eclipse Collections);
  - columnar/struct-of-arrays layouts;
  - `BitSet`/RoaringBitmap for sets of ids;
  - memory-mapped files or off-heap storage (Chronicle Map, Apache Arrow).
- **Batch jobs**: stream rows (JDBC fetch size, `Files.lines`, Jackson's streaming parser) instead of materialising whole files or tables. Process in chunks (Spring Batch) to keep heap usage flat.
- **Container sizing**: lower memory per request means more requests per pod and fewer OOM kills. Measure the live set after a full GC under load, then size `-Xmx` (or `MaxRAMPercentage`) with headroom.
- **Incident response** for `OutOfMemoryError` or growing heaps:
  - run with `-XX:+HeapDumpOnOutOfMemoryError`;
  - open the dump in MAT, use "Leak Suspects" and the dominator tree;
  - the culprit is usually a collection retained by a static field, a cache, a `ThreadLocal`, or listeners that were never removed (JVM stage).

## Common mistakes

- **Optimising memory without measuring**: a heap histogram or dump shows the 2-3 classes that actually dominate.
- **Boxed collections for large numeric data** (`Map<Long, Double>` with millions of entries): use primitive maps or arrays.
- **`new HashMap<>(expectedSize)`**, which still resizes at 75% full. Use `HashMap.newHashMap(n)` (Java 19+) or `(int) (n / 0.75f) + 1`.
- **Loading everything** (`findAll()`, `readAllBytes()` on large files, `collect(toList())` of a huge stream) when streaming would keep memory flat.
- **Unbounded caches and static collections** that only ever grow.
- **Interning everything with `String.intern()`**: the JVM string table has its own costs. Prefer enums or a bounded canonicalising map, or G1 string deduplication.
- **Object pooling of small objects** "to save memory": modern GCs make short-lived allocation cheap, while pools retain memory forever and add contention.
- **`LinkedList`** for large lists: 24 bytes of node overhead per element plus poor locality. `ArrayList`/`ArrayDeque` are almost always better.

## Interview questions

**Q1. How much memory does an `ArrayList<Integer>` with a million elements use, compared with `int[]`?**

````reveal title="Answer"
With compressed oops, each `Integer` (outside the cache) is 16 bytes (12-byte header + 4-byte int, already 8-aligned), and the backing `Object[]` holds a 4-byte reference per element. That's about **20 MB** plus any unused capacity, and a million objects for the GC to trace. An `int[]` of a million is **4 MB** in one object with no references. Primitive arrays or primitive collections (fastutil `IntArrayList`) are 5x smaller and much more cache-friendly.
````

**Q2. What is the difference between shallow and retained size?**

````reveal title="Answer"
The shallow size is the memory of the object itself: header, fields and array elements, but not the objects it references. The retained size is the total memory that would be freed if the object became unreachable: itself plus every object reachable **only** through it. Heap analysers compute it with the dominator tree. A `HashMap` has a small shallow size but can retain gigabytes through its table, nodes, keys and values. Leak hunting looks at retained size.
````

**Q3. How would you reduce memory usage of a service holding a large lookup table?**

````reveal title="Answer"
1. Measure first: a heap histogram or dump to see which classes dominate and their retained sizes.
2. Change the representation: primitive keys and values (fastutil or Eclipse Collections maps), enums instead of repeated strings, `BitSet` or RoaringBitmap for id sets, struct-of-arrays layouts, compact encodings (an `int` for cents instead of `BigDecimal`).
3. Presize to avoid growth garbage.
4. Share immutable data.
5. If it's still too big, move it off-heap (memory-mapped files, Chronicle Map), or load only the hot part with a bounded cache.

Re-measure after each change.
````

**Q4. What are compact strings?**

````reveal title="Answer"
Since Java 9 (JEP 254), `String` stores its characters in a `byte[]` with a `coder` field. If all characters fit in Latin-1, it uses 1 byte per char; otherwise the whole string uses UTF-16 at 2 bytes per char. Most strings in typical applications (identifiers, JSON keys, ASCII text) are therefore about half the size they were with `char[]`. Indexing and other operations remain O(1) thanks to the fixed width per coder. It's on by default (`-XX:-CompactStrings` disables it).
````

**Q5. Why prefer `HashMap.newHashMap(n)` over `new HashMap<>(n)`?**

````reveal title="Answer"
The constructor argument is the initial **capacity** (rounded up to a power of two), and the map resizes when its size exceeds `capacity × 0.75`. `new HashMap<>(1000)` gets capacity 1024, which resizes after 768 entries. `HashMap.newHashMap(1000)` (Java 19) computes a capacity large enough for 1000 **mappings** without resizing. The same factory methods exist for `HashSet`, `LinkedHashMap` and `LinkedHashSet`.
````

## Hands-on exercise

Build a **bounded LRU cache** so memory stays flat no matter how many keys are requested:
- `LruCache<K, V>` extends `LinkedHashMap` with **access order** and a maximum size, overriding `removeEldestEntry` to evict and count evictions;
- `V get(K key, Function<K, V> loader)` returns a cached value or loads it, tracking **hits and misses**;
- simulate 100,000 lookups of product ids, where 80% of requests go to 200 "hot" products and 20% to 50,000 "cold" ones (use a deterministic pseudo-random sequence, such as `new Random(42)`);
- compare a capacity-1,000 LRU with an unbounded `HashMap`: print final sizes, the hit rate and the evictions;
- show that **accessing** an entry protects it from eviction.

````hint title="Hint"
`super(16, 0.75f, true)` turns on access order: `get` moves the entry to the end. `removeEldestEntry(Map.Entry<K, V> eldest)` is called after every `put`; return `size() > maxSize`. For the loader, check `containsKey` (or `get` returning null) and `put` on a miss.
````

````solution title="Solution"
```java title="LruCache.java" file="LruCache.java"
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Random;
import java.util.function.Function;

public class LruCache<K, V> extends LinkedHashMap<K, V> {
    private static final long serialVersionUID = 1L;
    private final int maxSize;
    long hits, misses, evictions;

    LruCache(int maxSize) {
        super(16, 0.75f, true);                      // true = access order (LRU), false = insertion order
        this.maxSize = maxSize;
    }

    @Override
    protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
        boolean evict = size() > maxSize;
        if (evict) {
            evictions++;
        }
        return evict;
    }

    V get(K key, Function<K, V> loader) {
        V value = get(key);                          // counts as an access: moves the entry to the end
        if (value != null) {
            hits++;
            return value;
        }
        misses++;
        value = loader.apply(key);
        put(key, value);
        return value;
    }

    static int nextProductId(Random random) {
        return random.nextInt(100) < 80 ? random.nextInt(200) : 1_000 + random.nextInt(50_000);
    }

    public static void main(String[] args) {
        Function<Integer, String> loadFromDb = id -> "product-" + id;

        LruCache<Integer, String> lru = new LruCache<>(1_000);
        Map<Integer, String> unbounded = new HashMap<>();
        Random random = new Random(42);
        for (int i = 0; i < 100_000; i++) {
            int id = nextProductId(random);
            lru.get(id, loadFromDb);
            unbounded.computeIfAbsent(id, loadFromDb);
        }
        System.out.printf("LRU(1000): size %,d, hit rate %.1f%%, evictions %,d%n",
                lru.size(), 100.0 * lru.hits / (lru.hits + lru.misses), lru.evictions);
        System.out.printf("unbounded HashMap: size %,d (keeps every cold product forever)%n", unbounded.size());

        LruCache<String, Integer> small = new LruCache<>(3);
        small.put("a", 1);
        small.put("b", 2);
        small.put("c", 3);
        small.get("a");                              // touch a: now most recently used
        small.put("d", 4);                           // evicts the least recently used: b
        System.out.println("after touching a and adding d: " + small.keySet() + ", evictions " + small.evictions);
    }
}
```

```text title="Output" output="LruCache.java"
LRU(1000): size 1,000, hit rate 80.1%, evictions 18,922
unbounded HashMap: size 16,641 (keeps every cold product forever)
after touching a and adding d: [c, a, d], evictions 1
```

The bounded cache stayed at exactly 1,000 entries while serving most requests from memory, because the hot products are accessed constantly and stay at the recently-used end. The unbounded map grew with every distinct key: a slow memory leak in a long-running service. For production use, Caffeine adds concurrency, size and weight limits, expiry, statistics and a smarter admission policy (W-TinyLFU) that beats plain LRU on hit rate.
````

## Knowledge check

```quiz
? Approximately how many bytes does one Integer (outside the cache) plus its reference in an ArrayList take with compressed oops?
+ About 20 bytes
- 4 bytes
- 8 bytes
> A 16-byte Integer object plus a 4-byte reference.

? You need membership checks for dense integer ids 0..10,000,000. Which structure is smallest?
+ BitSet
- HashSet<Integer>
- ArrayList<Integer>
> About 1.25 MB of bits versus hundreds of MB of objects.

? What does new HashMap<>(1000) do when 800 entries are added?
+ It resizes, because the threshold is 0.75 x 1024 = 768
- Nothing, it has room for 1000 entries
- It throws an exception
> Use HashMap.newHashMap(1000) to size for mappings.

? Which metric identifies what is keeping a large amount of memory alive?
+ Retained size (dominator tree in a heap dump)
- Shallow size
- Allocation rate
> Retained size includes everything reachable only through the object.

? A string has 999 ASCII characters and one Chinese character. How many bytes per character does its array use?
+ 2, the whole string switches to UTF-16
- 1, except for the Chinese character
- 4
> Compact strings choose one encoding per string.
```

## Key takeaways

- Objects have overhead: 12-byte headers, 8-byte alignment, 4-byte references. **Boxed values and node-based collections cost 5-15x the raw data.**
- Choose representations: **primitive arrays and collections, `BitSet`, `EnumSet`/`EnumMap`, enums for repeated values, struct-of-arrays layouts**. Presize collections (`HashMap.newHashMap`).
- **Stream** large data instead of loading it, and **bound every cache** (Caffeine, LRU).
- Measure with class histograms, heap dumps (retained size, dominator tree), JOL and allocation profiling, and re-measure after each change.
- Smaller live sets mean faster GCs, better cache locality and cheaper containers.
