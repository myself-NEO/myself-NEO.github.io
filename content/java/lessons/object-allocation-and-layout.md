## Concept explanation

### How fast is `new`?

In HotSpot, allocating a small object usually takes **a handful of machine instructions**. Each thread owns a **thread-local allocation buffer (TLAB)**, a chunk of eden that only it allocates from. Allocation is **bump-the-pointer**: check that `top + size <= end`, return `top`, advance `top`. There's no lock, no free-list search and no contention between threads.

If the TLAB is full, the thread takes a slower path: it retires the TLAB and gets a new one from eden, or allocates large objects directly outside any TLAB. If eden itself is full, a **young GC** runs. That cheap path is why Java favours many short-lived objects: allocating them is nearly free, and dead objects cost nothing to collect in a copying young generation.

### Anatomy of an object

Every heap object starts with a **header**, followed by its fields, padded to a multiple of 8 bytes:

| Part | Size (64-bit HotSpot, default flags) | Contents |
|---|---|---|
| **Mark word** | 8 bytes | identity hash code (once computed), GC age, lock state |
| **Class pointer** ("klass") | 4 bytes with compressed class pointers (default), 8 without | points to the class metadata in Metaspace |
| **Array length** | 4 bytes (arrays only) | `length` |
| **Fields** | per type: `long`/`double` 8, `int`/`float` 4, `short`/`char` 2, `byte`/`boolean` 1, references 4 (compressed oops) or 8 | instance fields, including inherited ones |
| **Padding** | up to 7 bytes | object size rounded up to 8 |

So with default flags the header is **12 bytes** (16 for arrays), and:

| Object | Size |
|---|---|
| `new Object()` | 12 → **16** bytes |
| `class A { int x; }` | 12 + 4 = **16** |
| `class B { int x, y; }` / `record Point(int x, int y)` | 12 + 8 = 20 → **24** |
| `Integer` / `Long` | **16** / **24** |
| `new int[10]` | 16 + 40 = **56** |
| `new byte[5]` | 16 + 5 = 21 → **24** |
| a 5-character Latin-1 `String` | 24 (String) + 24 (its `byte[]`) = **48** |

### Compressed oops

A 64-bit JVM could use 8-byte references, but HotSpot stores references ("oops") as **32-bit offsets scaled by 8**, which can address **32 GB**. With heaps under about 32 GB, every reference costs 4 bytes instead of 8. That shrinks reference-heavy data structures by up to a third and improves cache usage. Above the limit, compressed oops switch off. A **31 GB heap can hold more objects than a 33 GB heap**, which is why tuning guides say "stay below 32 GB".

### Compact object headers (Java 25)

`-XX:+UseCompactObjectHeaders` (experimental in Java 24, a product option in Java 25) packs the class pointer *into* the mark word, giving an **8-byte header**. Small objects shrink: `new Object()` takes 8 bytes and a two-`int` record 16 instead of 24. Real applications typically see 10–20% smaller heaps and less GC work. It isn't the default in 25, so you opt in.

### Why layout matters

- **Boxed collections are expensive**: a `List<Integer>` of a million numbers uses about 16 MB for the `Integer` objects plus 4 MB for the references, while an `int[]` uses 4 MB.
- **Small objects carry a big tax**: a 12-byte header on a 4-byte payload is 75% overhead.
- **Layout affects speed**: arrays of primitives are contiguous and cache-friendly; object graphs mean pointer chasing.

## Internal working

- **`new` in bytecode** is `new` (allocate and zero the memory, set the header), then `dup`, then `invokespecial <init>` to run the constructor. Zeroing is why fields start as `0`/`null`/`false`. The JIT can sometimes skip zeroing fields the constructor overwrites immediately.
- **The TLAB fast path** is inlined into compiled code. TLAB sizes adapt per thread to its allocation rate (`-XX:+ResizeTLAB`). The waste at the end of a retired TLAB is filled with a dummy object so the heap stays parseable.
- **Large objects**:
  - **Serial and Parallel** may allocate big arrays directly in the old generation.
  - **G1** treats objects of at least half a region as **humongous**: they get contiguous regions of their own, can fragment the heap and trigger early collections. Watch `G1HeapRegionSize` if you allocate many large arrays.
- **Field layout**:
  - HotSpot reorders fields: larger primitives first, then smaller ones, references grouped together.
  - Since JDK 15 a new layout algorithm also fills gaps, including the 4-byte hole after a 12-byte header.
  - Superclass fields come first. Source order doesn't matter, so `@Contended` (internal) exists to *add* padding against false sharing.
- **Mark word states**:
  - *unlocked*: hash and age;
  - *lightweight-locked*: a pointer to the lock record, or a lock-stack bit in newer JVMs;
  - *inflated monitor*: a pointer to an `ObjectMonitor`;
  - *marked*: during GC.

  Biased locking was deprecated in 15 and removed in 18. Computing `System.identityHashCode` stores the hash in the header permanently.
- **Compressed oops modes**: *zero-based* (heap below 32 GB placed low in the address space, so decoding is just a shift) or *heap-based* (base + shift). `-XX:ObjectAlignmentInBytes=16` raises the limit to 64 GB at the cost of more padding.
- **Measuring**: use **JOL** (Java Object Layout, `org.openjdk.jol`) to print exact field offsets, or `jcmd <pid> GC.class_histogram` for counts and sizes per class in a running JVM. The example below measures sizes by reading the thread's allocated-bytes counter (`com.sun.management.ThreadMXBean`), which counts TLAB bytes exactly.

## Visual representation

```text title="Layout of record Point(int x, int y), 64-bit HotSpot"
  default (compressed class pointers)            Java 25 -XX:+UseCompactObjectHeaders
  offset                                         offset
   0  +---------------------------+               0  +---------------------------------+
      | mark word (8)             |                  | mark word with class pointer (8)|
   8  +---------------------------+               8  +---------------------------------+
      | klass pointer (4)         |                  | int x (4)                       |
  12  +---------------------------+              12  +---------------------------------+
      | int x (4)                 |                  | int y (4)                       |
  16  +---------------------------+              16  +---------------------------------+  = 16 bytes
      | int y (4)                 |
  20  +---------------------------+
      | padding (4)               |
  24  +---------------------------+  = 24 bytes

  TLAB bump-pointer allocation (per thread, inside eden):
  [ used objects ......... | top -> free ..................... | end ]
     new Point()  ->  obj = top; top += 24; if (top > end) slow path (new TLAB / young GC)
```

## Java code example

The program measures allocation sizes in two child JVMs, one with compressed oops (the default below 32 GB) and one without, and prints them side by side. Each measurement allocates 100,000 instances, keeps them reachable, and divides the thread's allocated-byte delta by the count.

```java title="ObjectSizes.java" file="ObjectSizes.java"
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.lang.management.ManagementFactory;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.IntFunction;

public class ObjectSizes {
    static class Empty { }
    static class OneInt { int a; }
    static class TwoInts { int a; int b; }
    static class OneLong { long a; }
    static class Mixed { byte b; boolean flag; Object ref; }
    static class ThreeRefs { Object a; Object b; Object c; }
    record Point(int x, int y) { }

    static final Map<String, IntFunction<Object>> SHAPES = new LinkedHashMap<>();

    static {
        SHAPES.put("new Object()", i -> new Object());
        SHAPES.put("class Empty {}", i -> new Empty());
        SHAPES.put("{ int }", i -> new OneInt());
        SHAPES.put("{ int, int }", i -> new TwoInts());
        SHAPES.put("{ long }", i -> new OneLong());
        SHAPES.put("{ byte, boolean, Object }", i -> new Mixed());
        SHAPES.put("{ Object x3 }", i -> new ThreeRefs());
        SHAPES.put("record Point(int, int)", i -> new Point(i, i));
        SHAPES.put("Integer (not cached)", i -> Integer.valueOf(1_000 + i));
        SHAPES.put("Long", i -> Long.valueOf(1_000L + i));
        SHAPES.put("int[0]", i -> new int[0]);
        SHAPES.put("int[10]", i -> new int[10]);
        SHAPES.put("byte[5]", i -> new byte[5]);
        SHAPES.put("Object[4]", i -> new Object[4]);
        SHAPES.put("\"xxxxx\" String + byte[]", i -> "x".repeat(5));
    }

    static long bytesPerInstance(IntFunction<Object> factory) {
        com.sun.management.ThreadMXBean threads = (com.sun.management.ThreadMXBean) ManagementFactory.getThreadMXBean();
        int n = 100_000;
        Object[] keep = new Object[n];                  // keeps objects reachable (they escape)
        for (int i = 0; i < 1_000; i++) {
            factory.apply(i);                           // warm-up
        }
        long before = threads.getCurrentThreadAllocatedBytes();
        for (int i = 0; i < n; i++) {
            keep[i] = factory.apply(i);
        }
        long after = threads.getCurrentThreadAllocatedBytes();
        return Math.round((after - before) / (double) n);
    }

    public static void main(String[] args) throws Exception {
        if (args.length == 1 && args[0].equals("measure")) {
            for (Map.Entry<String, IntFunction<Object>> e : SHAPES.entrySet()) {
                System.out.println(bytesPerInstance(e.getValue()));
            }
            return;
        }
        List<String> compressed = child("-XX:+UseCompressedOops");
        List<String> uncompressed = child("-XX:-UseCompressedOops");
        System.out.printf("%-26s %10s %12s%n", "allocation", "4-byte refs", "8-byte refs");
        int i = 0;
        for (String shape : SHAPES.keySet()) {
            System.out.printf("%-26s %8s B %10s B%n", shape, compressed.get(i), uncompressed.get(i));
            i++;
        }
    }

    static List<String> child(String flag) throws Exception {
        List<String> command = List.of(Path.of(System.getProperty("java.home"), "bin", "java").toString(),
                "-Xmx256m", flag, "-cp", System.getProperty("java.class.path"), "ObjectSizes", "measure");
        Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
        List<String> lines = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            for (String line = reader.readLine(); line != null; line = reader.readLine()) {
                lines.add(line);
            }
        }
        process.waitFor();
        return lines;
    }
}
```

The same measurement on Java 25, with and without compact object headers:

```java title="CompactHeaders.java" file="CompactHeaders.java" java="25"
import java.lang.management.ManagementFactory;
import java.util.function.IntFunction;

public class CompactHeaders {
    record Point(int x, int y) { }

    static long bytesPer(IntFunction<Object> factory) {
        var threads = (com.sun.management.ThreadMXBean) ManagementFactory.getThreadMXBean();
        Object[] keep = new Object[100_000];
        for (int i = 0; i < 1_000; i++) {
            factory.apply(i);
        }
        long before = threads.getCurrentThreadAllocatedBytes();
        for (int i = 0; i < keep.length; i++) {
            keep[i] = factory.apply(i);
        }
        return Math.round((threads.getCurrentThreadAllocatedBytes() - before) / (double) keep.length);
    }

    public static void main(String[] args) throws Exception {
        if (args.length == 1) {
            System.out.println(bytesPer(i -> new Object()) + " " + bytesPer(i -> new Point(i, i)) + " " + bytesPer(i -> Integer.valueOf(1_000 + i)));
            return;
        }
        for (String flag : new String[] {"-XX:-UseCompactObjectHeaders", "-XX:+UseCompactObjectHeaders"}) {
            Process p = new ProcessBuilder(ProcessHandle.current().info().command().orElseThrow(), "-Xmx256m", flag,
                    "-cp", System.getProperty("java.class.path"), "CompactHeaders", "child").redirectErrorStream(true).start();
            String[] sizes = new String(p.getInputStream().readAllBytes()).trim().split(" ");
            p.waitFor();
            System.out.printf("%-30s Object %2s B, Point %2s B, Integer %2s B%n", flag, sizes[0], sizes[1], sizes[2]);
        }
    }
}
```

## Output

`ObjectSizes.java`:

```text title="Output" output="ObjectSizes.java"
allocation                 4-byte refs  8-byte refs
new Object()                     16 B         16 B
class Empty {}                   16 B         16 B
{ int }                          16 B         16 B
{ int, int }                     24 B         24 B
{ long }                         24 B         24 B
{ byte, boolean, Object }        24 B         24 B
{ Object x3 }                    24 B         40 B
record Point(int, int)           24 B         24 B
Integer (not cached)             16 B         16 B
Long                             24 B         24 B
int[0]                           16 B         16 B
int[10]                          56 B         56 B
byte[5]                          24 B         24 B
Object[4]                        32 B         48 B
"xxxxx" String + byte[]          48 B         56 B
```

`CompactHeaders.java` (Java 25):

```text title="Output" output="CompactHeaders.java"
-XX:-UseCompactObjectHeaders   Object 16 B, Point 24 B, Integer 16 B
-XX:+UseCompactObjectHeaders   Object  8 B, Point 16 B, Integer 16 B
```

- The minimum object is **16 bytes**: a 12-byte header padded to 8. A single `int` fits in the padding for free; a second `int` pushes the object to 24.
- `{ long }` is 24, not 20: the `long` needs 8-byte alignment, so it starts at offset 16. `{ byte, boolean, Object }` packs three fields after the header into 24 bytes.
- An `Integer` costs 16 bytes to hold 4 bytes of data, which is why `List<Integer>` is about four times bigger than `int[]`.
- Arrays have a 16-byte header (with the length): `int[10]` = 16 + 40 = 56.
- Without compressed oops, only objects with **reference** fields and reference arrays grew (`{ Object x3 }` 24 → 40, `Object[4]` 32 → 48, and `String`, which references its `byte[]`). Since Java 15 the class pointer stays compressed independently, so plain headers didn't change.
- With Java 25 compact headers, `new Object()` dropped to 8 bytes, and `Point` and `Integer` to 16 and 16. The `Integer` keeps 4 bytes of padding.

## Real-world application

- **Capacity planning**: estimating that 10 million cached `Order` objects at about 80 bytes each, plus maps, need about 1.5 GB tells you whether a cache fits in the heap.
- **Choosing data structures**:
  - primitive arrays or primitive collections (Eclipse Collections, fastutil, HPPC) for big numeric data;
  - `BitSet` instead of `Set<Integer>`;
  - `EnumMap` instead of `HashMap<Enum, …>`;
  - records with primitive components instead of boxed fields.
- **JVM sizing**: keep heaps below ~32 GB to keep compressed oops (or go well above, to 48 GB+, if you truly need more), and consider compact object headers on Java 25+ for small-object-heavy services.
- **Allocation profiling**: JFR's `ObjectAllocationSample` events and async-profiler's allocation mode find the code paths allocating the most bytes. Reducing allocation reduces GC frequency.
- **High-performance libraries** (Netty, Disruptor, Chronicle) design their layouts deliberately: padding to avoid false sharing, flyweights over off-heap memory.

## Common mistakes

- **Assuming an object costs the sum of its fields.** Headers, alignment and the separate objects behind reference fields often double or triple it.
- **Boxed numbers in hot or large structures**: `Map<Long, Double>` with millions of entries costs 80+ bytes per entry.
- **Heaps of 32–40 GB**, which lose compressed oops and end up holding *fewer* objects than a 31 GB heap.
- **Calculating shallow size and forgetting the referenced objects**: a `String` is two objects; an `ArrayList` is the list plus its `Object[]` plus every element.
- **Premature "object pooling"** to avoid allocation. TLAB allocation and young GC make short-lived objects cheap; pools add synchronisation, leaks and old-generation pressure. Pool only expensive resources (connections, threads, big buffers).
- **Relying on field order in source code**: the JVM reorders fields.

## Interview questions

**Q1. How does the JVM allocate a new object so quickly?**

````reveal title="Answer"
Each thread allocates from its own thread-local allocation buffer (TLAB) inside eden, using bump-the-pointer: if the object fits between `top` and `end`, return `top` and advance it. No locking or free-list search is needed, and the fast path is inlined into JIT-compiled code. When the TLAB is exhausted, the thread gets a new one from eden (slow path). When eden is full, a young GC runs. Large objects may bypass TLABs, and in G1 humongous objects get their own regions.
````

**Q2. What does an object header contain?**

````reveal title="Answer"
In 64-bit HotSpot:
- an 8-byte **mark word**, holding the identity hash (once computed), the GC age bits and the lock state (or a pointer to a lock record or monitor);
- a **class pointer** to the class metadata: 4 bytes with compressed class pointers (the default), 8 without;
- for arrays, a 4-byte **length** as well.

That makes 12 bytes for ordinary objects and 16 for arrays by default. Java 25's compact object headers fold the class pointer into the mark word, giving an 8-byte header.
````

**Q3. What are compressed oops, and why does the 32 GB heap limit matter?**

````reveal title="Answer"
Compressed ordinary object pointers store references as 32-bit values that the JVM shifts left by 3 (8-byte alignment) and adds to a heap base. 2³² × 8 bytes = 32 GB is addressable. Below that, references cost 4 bytes instead of 8, saving memory and cache bandwidth. Above about 32 GB the JVM must use full 64-bit references, so every reference field and array slot doubles. A 33 GB heap can hold fewer objects than a 31 GB one.
````

**Q4. How big is `new Integer(5)`, and an `int[10]`?**

````reveal title="Answer"
`Integer`: a 12-byte header plus a 4-byte `int` = 16 bytes. `int[10]`: a 16-byte array header (including the length) plus 10 × 4 = 56 bytes. (With compact headers on Java 25: 16 and 48.) A `List<Integer>` with 10 elements is about 16 bytes × 10 for the Integers (unless cached) + 56 for the backing `Object[10]` (compressed refs) + 24 for the `ArrayList` itself, roughly 240 bytes for 40 bytes of data.
````

**Q5. Can the JVM allocate objects on the stack?**

````reveal title="Answer"
Not literally, but the effect exists. C2's escape analysis can prove that an object never escapes a compiled method (after inlining) and **scalar-replace** it: its fields become local values in registers or stack slots, and no heap object is created. It only works for non-escaping objects in hot, compiled code. The interpreter and C1 always allocate on the heap.
````

## Hands-on exercise

A trading system keeps millions of these in memory:

```java
class Trade {
    long id;
    boolean active;
    byte side;
    Integer quantity;     // boxed
    Double price;         // boxed
    String symbol;        // shared, interned symbols
}
```

1. Measure the **deep** allocation per trade: the `Trade` object plus its new `Integer` and `Double`. The symbol is shared, so don't count it.
2. Redesign as `LeanTrade` with primitive `int quantity` and `double price`, and measure again.
3. Print the saving for 5 million trades in MB.

Use the allocated-bytes counter, as in the example.

````hint title="Hint"
Allocate inside the measured loop exactly what a real trade creation allocates: `new Trade(i, true, (byte) 1, Integer.valueOf(1_000 + i % 50_000), Double.valueOf(i * 0.5), SYMBOL)`. Values ≥ 128 aren't cached, so every `Integer` is a new object. Expected maths: header 12 + `long` 8 + `boolean` 1 + `byte` 1 + 3 refs × 4 = 34 → 40 bytes, plus 16 for the `Integer` (12 + 4) and 24 for the `Double` (12 + 8, padded).
````

````solution title="Solution"
```java title="TradeLayout.java" file="TradeLayout.java" run="-Xmx512m"
import java.lang.management.ManagementFactory;
import java.util.function.IntFunction;

public class TradeLayout {
    static final String SYMBOL = "ACME";

    static final class Trade {
        final long id;
        final boolean active;
        final byte side;
        final Integer quantity;
        final Double price;
        final String symbol;

        Trade(long id, boolean active, byte side, Integer quantity, Double price, String symbol) {
            this.id = id;
            this.active = active;
            this.side = side;
            this.quantity = quantity;
            this.price = price;
            this.symbol = symbol;
        }
    }

    record LeanTrade(long id, boolean active, byte side, int quantity, double price, String symbol) { }

    static long bytesPer(IntFunction<Object> factory) {
        var threads = (com.sun.management.ThreadMXBean) ManagementFactory.getThreadMXBean();
        Object[] keep = new Object[200_000];
        for (int i = 0; i < 1_000; i++) {
            factory.apply(i);
        }
        long before = threads.getCurrentThreadAllocatedBytes();
        for (int i = 0; i < keep.length; i++) {
            keep[i] = factory.apply(i);
        }
        return Math.round((threads.getCurrentThreadAllocatedBytes() - before) / (double) keep.length);
    }

    public static void main(String[] args) {
        long boxed = bytesPer(i -> new Trade(i, true, (byte) 1, Integer.valueOf(1_000 + i % 50_000), Double.valueOf(i * 0.5), SYMBOL));
        long lean = bytesPer(i -> new LeanTrade(i, true, (byte) 1, 1_000 + i % 50_000, i * 0.5, SYMBOL));
        long trades = 5_000_000L;
        System.out.println("Trade with boxed fields: " + boxed + " bytes per trade (40 object + 16 Integer + 24 Double)");
        System.out.println("LeanTrade (primitives):  " + lean + " bytes per trade");
        System.out.printf("saving for %,d trades: %.1f MB (%d%%)%n", trades, (boxed - lean) * trades / (1024.0 * 1024),
                Math.round(100.0 * (boxed - lean) / boxed));
    }
}
```

```text title="Output" output="TradeLayout.java"
Trade with boxed fields: 80 bytes per trade (40 object + 16 Integer + 24 Double)
LeanTrade (primitives):  40 bytes per trade
saving for 5,000,000 trades: 190.7 MB (50%)
```

The two boxed fields cost as much as the `Trade` object itself. Switching to primitives removes two allocations per trade, almost halves the memory, and also cuts pointer chasing and GC work. The `LeanTrade` record is 12 + 8 + 4 + 8 + 1 + 1 + 4 = 38 → 40 bytes, the same size as `Trade` alone.
````

## Knowledge check

```quiz
? How big is new Object() on 64-bit HotSpot with default flags?
+ 16 bytes
- 8 bytes
- 12 bytes
> A 12-byte header (8 mark word + 4 compressed class pointer) padded to 8-byte alignment.

? What does a TLAB give each thread?
+ A private chunk of eden for lock-free bump-pointer allocation
- A private garbage collector
- Its own copy of the heap
> Threads allocate from their TLAB without synchronising with each other.

? Why can a 33 GB heap hold fewer objects than a 31 GB heap?
+ Above ~32 GB compressed oops are disabled and references become 8 bytes
- Larger heaps reserve memory for the GC
- The JVM can't address more than 32 GB
> 32-bit references scaled by 8 bytes reach exactly 32 GB.

? What does -XX:+UseCompactObjectHeaders (Java 25) change?
+ The object header shrinks to 8 bytes
- Field order follows the source code
- References become 2 bytes
> The class pointer is folded into the mark word.

? Roughly how much heap does a List<Integer> of one million distinct large values use, compared with an int[]?
+ About 20 MB vs 4 MB
- About the same
- 4 MB vs 20 MB
> 16-byte Integer objects plus 4-byte references, vs 4 bytes per int.
```

## Key takeaways

- Allocation is **bump-the-pointer in a per-thread TLAB**: a few instructions, no locks. Young GC makes short-lived objects nearly free.
- Object = **header** (8-byte mark word + 4-byte compressed class pointer; +4 length for arrays) + fields + **padding to 8 bytes**. Minimum 16 bytes; `Integer` 16; `int[10]` 56.
- **Compressed oops** give 4-byte references up to ~32 GB of heap; stay below it. **Compact object headers** (Java 25, opt-in) cut headers to 8 bytes.
- Boxed fields and collections multiply memory. Prefer primitives, primitive arrays and specialised collections for big data.
- Measure with JOL, class histograms, JFR allocation events or allocated-bytes counters, not by adding up field sizes in your head.
