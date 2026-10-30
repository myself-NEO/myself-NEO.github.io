## Concept explanation

### What is garbage?

Java has no `free()`. An object becomes garbage when the program can no longer reach it, and the **garbage collector** (GC) reclaims its memory.

"Can't reach" has a precise meaning: there's no chain of references from any **GC root** to the object. Roots are references the JVM knows are live without looking at other objects:
- local variables and operand-stack entries in the **frames of every live thread**;
- **static fields** of loaded classes;
- **active `Thread` objects**;
- objects used as **monitors** by `synchronized` blocks currently held;
- **JNI references** held by native code;
- references held by the JVM itself: system classes, class loaders, and constants embedded in JIT code.

Everything reachable from a root is **live**; everything else is garbage, however many references point to it *from other garbage*.

### Why not reference counting?

Reference counting (CPython, Swift's ARC, C++ `shared_ptr`) frees an object when its count drops to zero. It has three problems:
- **Cycles leak**: A ↔ B keep each other at count 1 forever.
- **Every pointer write must update counts**, which is slow and needs atomics across threads.
- **Freeing a big structure cascades** unpredictably.

All HotSpot collectors use **tracing**: start from the roots, mark what's reachable, and reclaim the rest. Cycles are collected naturally.

### The basic algorithms

| Algorithm | How | Pros | Cons |
|---|---|---|---|
| **Mark-sweep** | mark live objects, then sweep dead ones into free lists | no copying | **fragmentation**; allocation needs free-list search |
| **Mark-compact** | mark, then slide live objects together and update all references | no fragmentation, bump-pointer allocation afterwards | compaction is expensive (touches the whole heap) |
| **Copying** (semi-space / evacuation) | copy live objects from *from-space* to an empty *to-space*; everything left behind is garbage | cost ∝ **live** objects, not heap size; compacts automatically | needs spare space; copying big, long-lived objects repeatedly is wasteful |

### Generational collection

The **weak generational hypothesis**: *most objects die young*. Temporary strings, iterators, DTOs and lambdas live for microseconds; a few objects (caches, sessions, configuration) live for hours. HotSpot's Serial, Parallel and G1 collectors (and generational ZGC and Shenandoah) split the heap:

- **Young generation**: **eden** (new objects) plus two **survivor** spaces. A **minor (young) GC** copies live objects from eden and one survivor into the other survivor, incrementing their **age**. Since most of eden is dead, this is fast: the cost is proportional to the few survivors.
- **Old (tenured) generation**: objects that survive enough young GCs (the tenuring threshold, up to 15) are **promoted** here. It's collected less often by a **major / full GC**, using mark-compact or, in G1/ZGC/Shenandoah, mostly concurrent marking.

### Stop-the-world and safepoints

Moving objects and scanning roots needs a consistent view, so collectors **pause application threads**: *stop-the-world* (STW). Threads stop at **safepoints**, positions where the JVM knows exactly which stack slots hold references (method returns, loop back-edges, allocation points). Modern collectors do most of the marking (and even compaction) **concurrently** with the application, leaving only short pauses.

The three GC goals trade off against each other:
- **throughput**: the share of time spent running your code rather than collecting;
- **latency**: pause length;
- **footprint**: extra memory.

## Internal working

- **Marking** uses the *tri-colour* abstraction:
  - white: not yet seen;
  - grey: seen, but children not yet scanned;
  - black: object and children scanned.

  Concurrent marking must handle the application mutating references while marking runs. **Write barriers** record changes, either snapshot-at-the-beginning (G1, Shenandoah) or incremental update, so that no live object is missed.
- **The card table** answers "which old objects point into the young generation?" without scanning the whole old generation on every minor GC:
  - The heap is divided into 512-byte **cards**.
  - A write barrier on every reference store marks the card **dirty**.
  - Minor GCs scan dirty cards as extra roots.

  G1 extends this with per-region **remembered sets**.
- **Promotion details**:
  - Survivors that don't fit in the to-space are promoted early (*premature promotion*).
  - Very large objects may go straight to old.
  - The JVM adapts the tenuring threshold to keep survivors about half full.
  - `-Xlog:gc+age=trace` shows age histograms.
- **GC triggers**:
  - an allocation that doesn't fit ("Allocation Failure" / "G1 Evacuation Pause");
  - `System.gc()` ("System.gc()", which you can disable with `-XX:+DisableExplicitGC`);
  - Metaspace growth ("Metadata GC Threshold");
  - G1 humongous allocations;
  - the old generation crossing a threshold (G1 concurrent cycle start, the IHOP).
- **Liveness is determined by the JIT too**: in compiled code, a local variable that's never used again is **not** a root, even before the method returns. An object can be collected while its method is still running. `Reference.reachabilityFence(obj)` keeps it alive up to a point (needed with `Cleaner` and native resources).
- **Finalization** (`finalize()`) delayed reclamation by at least one extra GC cycle, could resurrect objects, and ran on a single thread. It was deprecated in 9 and deprecated for removal in 18. Use `try-with-resources` and `Cleaner`.
- **GC logs**: `-Xlog:gc*:file=gc.log:time,uptime,level,tags` prints every pause with its cause, sizes before and after, and duration. That's the primary evidence for any GC investigation (see JVM Tuning).

## Visual representation

```text title="Reachability and a young-generation collection"
  ROOTS                     HEAP
  [main frame: order] ----> Order --> Customer          live (reachable)
  [static CACHE]      ----> Map --> Entry --> Product   live
                            A <--> B                    garbage: a cycle with no path from any root
                            tmp1, tmp2, iterator        garbage: nothing points to them

  young GC (copying):
   before:  EDEN [ live1 . dead . dead . live2 . dead . dead ]   S0 [ old-survivor(age 3) ]   S1 [ empty ]
   after:   EDEN [ empty ................................... ]   S0 [ empty ]   S1 [ live1(age 1) live2(age 1) old-survivor(age 4) ]
            objects older than the tenuring threshold are copied to OLD instead (promotion)

  card table: old object writes a reference to a young object -> card marked dirty -> scanned at the next young GC
```

## Java code example

Run with `-XX:+UseSerialGC -Xmx64m -Xmn16m`: the simple generational collector with a fixed 16 MB young generation, so the behaviour is easy to observe.

```java title="GcBasics.java" file="GcBasics.java" run="-XX:+UseSerialGC -Xmx64m -Xmn16m"
import java.lang.management.GarbageCollectorMXBean;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryPoolMXBean;
import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.List;

public class GcBasics {
    static class Node {
        Node next;
        final byte[] payload = new byte[1024];
    }

    static final List<Object> ROOTED_BY_STATIC = new ArrayList<>();     // a GC root: static field

    static long collections(String name) {
        for (GarbageCollectorMXBean gc : ManagementFactory.getGarbageCollectorMXBeans()) {
            if (gc.getName().equals(name)) {
                return gc.getCollectionCount();
            }
        }
        throw new IllegalArgumentException(name);
    }

    static long oldGenUsed() {
        for (MemoryPoolMXBean pool : ManagementFactory.getMemoryPoolMXBeans()) {
            if (pool.getName().equals("Tenured Gen")) {
                return pool.getUsage().getUsed();
            }
        }
        throw new IllegalStateException();
    }

    public static void main(String[] args) {
        System.out.println("collectors: young = Copy, full = MarkSweepCompact");

        // 1. Reachability: roots keep objects alive; cycles without a root are garbage
        Object local = new Object();
        ROOTED_BY_STATIC.add(new Object());
        Node a = new Node();
        Node b = new Node();
        a.next = b;
        b.next = a;                                         // a cycle: refcounts would never reach zero
        WeakReference<Object> viaLocal = new WeakReference<>(local);
        WeakReference<Object> viaStatic = new WeakReference<>(ROOTED_BY_STATIC.get(0));
        WeakReference<Node> cycle = new WeakReference<>(a);
        a = null;
        b = null;
        System.gc();
        System.out.println("reachable from a local variable survives: " + (viaLocal.get() != null));
        System.out.println("reachable from a static field survives:   " + (viaStatic.get() != null));
        System.out.println("unreachable cycle collected:              " + (cycle.get() == null));
        java.lang.ref.Reference.reachabilityFence(local);  // keep 'local' a root until here

        // 2. Short-lived garbage: many cheap young GCs, no full GC
        long young0 = collections("Copy");
        long full0 = collections("MarkSweepCompact");
        long checksum = 0;
        for (int i = 0; i < 300_000; i++) {
            byte[] temporary = new byte[1024];             // dies immediately
            checksum += temporary.length;
        }
        System.out.println("300,000 x 1 KB temporaries: young GCs ran: " + (collections("Copy") > young0)
                + ", full GCs: " + (collections("MarkSweepCompact") - full0) + " (checksum " + checksum / 1024 / 1024 + " MB)");

        // 3. Long-lived data survives young GCs and is promoted to the old generation
        long oldBefore = oldGenUsed();
        List<byte[]> longLived = new ArrayList<>();
        for (int i = 0; i < 300_000; i++) {
            byte[] chunk = new byte[1024];
            if (i % 50 == 0) {
                longLived.add(chunk);                      // keep 2% of the chunks: about 6 MB
            }
        }
        System.out.println("kept " + longLived.size() + " chunks; old generation grew by >= 4 MB: " + (oldGenUsed() - oldBefore >= 4 * 1024 * 1024));

        // 4. An explicit System.gc() is a full collection with the Serial collector
        long fullBefore = collections("MarkSweepCompact");
        System.gc();
        System.out.println("System.gc() triggered full GCs: " + (collections("MarkSweepCompact") - fullBefore));
        System.out.println("long-lived data still reachable: " + longLived.size());
    }
}
```

## Output

```text title="Output" output="GcBasics.java"
collectors: young = Copy, full = MarkSweepCompact
reachable from a local variable survives: true
reachable from a static field survives:   true
unreachable cycle collected:              true
300,000 x 1 KB temporaries: young GCs ran: true, full GCs: 0 (checksum 292 MB)
kept 6000 chunks; old generation grew by >= 4 MB: true
System.gc() triggered full GCs: 1
long-lived data still reachable: 6000
```

- Objects reachable from a **local variable** and a **static field** survived. The `Node` cycle was collected despite its two internal references: tracing collectors don't care about references *between* garbage objects.
- About 300 MB of short-lived arrays went through a 16 MB young generation with many cheap young collections and **no** full GC. Almost everything in eden was dead each time.
- Keeping one chunk in fifty made those objects survive repeated young GCs until they were promoted, and the old generation grew.
- `System.gc()` ran a full mark-compact collection. In production, explicit GC calls are usually a mistake.

## Real-world application

- **Allocation rate and object lifetime** decide GC cost. Services that create lots of short-lived objects are fine. Problems come from objects that live *medium* long (request caches, batch buffers), survive several young GCs, get promoted, and then die in the old generation, forcing expensive old collections.
- **Leaks in a GC'd language** are always *unwanted reachability*: a static map, a listener, a `ThreadLocal`, a cache without eviction. The GC can't free what you still reference (see the references lesson).
- **Pause-sensitive systems** (trading, gaming, real-time bidding, user-facing APIs with tight p99 targets) pick concurrent collectors (G1 with a pause target, ZGC, Shenandoah) and reduce allocation.
- **GC logs in production** (`-Xlog:gc*` to a rotating file) are cheap to keep on and invaluable when latency spikes.
- **`System.gc()`** in application code (or libraries) causes unexpected full pauses. Some teams disable it with `-XX:+DisableExplicitGC`, though NIO direct-buffer cleanup can depend on it.

## Common mistakes

- **Thinking setting a variable to `null` frees memory.** It only removes one reference; collection happens later, if the object is unreachable. In modern JVMs nulling locals is rarely needed.
- **Believing Java uses reference counting**, or that cycles leak.
- **Relying on `finalize()` or on GC timing** to release files, sockets or locks. Use try-with-resources.
- **Calling `System.gc()` to "help"** the JVM. It causes full pauses and defeats ergonomics.
- **Confusing "minor GC" with "no pause"**: young collections are stop-the-world too, just short.
- **Ignoring medium-lived objects and premature promotion**, which fill the old generation and lead to long pauses.

## Interview questions

**Q1. How does the JVM decide that an object is garbage?**

````reveal title="Answer"
By reachability, not reference counting. Starting from GC roots, the collector traces references and marks everything reachable. Roots include:
- local variables and operand stacks of active frames in all threads;
- static fields of loaded classes;
- live threads;
- monitors held by `synchronized` blocks;
- JNI references and JVM-internal references.

Anything not marked is unreachable and its memory can be reclaimed, including cycles of objects referring to each other.
````

**Q2. What are GC roots?**

````reveal title="Answer"
References that are live by definition and form the starting points of tracing:
- references in the frames (locals and operand stacks) of every live thread;
- static fields of loaded classes;
- `Thread` objects of running threads;
- objects locked by `synchronized` (monitors in use);
- JNI global and local references;
- references held by the JVM itself: system class loader and classes, JIT-embedded constants, JVMTI.

In heap-dump analysers, "paths to GC roots" shows why a leaked object is still alive.
````

**Q3. Explain the generational hypothesis and how young collection works.**

````reveal title="Answer"
Most objects die young, so the heap is split into a young generation (eden + two survivor spaces) and an old generation.
1. New objects are allocated in eden.
2. When eden fills, a minor GC copies live objects from eden and the occupied survivor into the empty survivor, incrementing their age. Everything else is discarded wholesale.
3. Objects that survive enough cycles (the tenuring threshold, up to 15) are promoted to the old generation, which is collected less often by a major or full GC.

Copying cost is proportional to the live objects, so young GCs are cheap when most objects are dead.
````

**Q4. Compare mark-sweep, mark-compact and copying collection.**

````reveal title="Answer"
- **Mark-sweep** marks live objects and frees the dead ones into free lists. It's fast but fragments memory, and allocation needs free-list search.
- **Mark-compact** also slides live objects together and updates references. There's no fragmentation, but compaction is expensive.
- **Copying** evacuates live objects to an empty space. Its cost is proportional to live data and it compacts as a side effect, but it needs spare space and wastes effort on long-lived objects.

Generational collectors use copying for the young generation and mark-compact (or region evacuation) for the old.
````

**Q5. What is a safepoint, and what is a stop-the-world pause?**

````reveal title="Answer"
A safepoint is a point in execution where a thread's state is fully known to the JVM: which stack slots and registers hold object references. Compiled code polls for safepoint requests at method returns and loop back-edges. A stop-the-world pause brings all application threads to safepoints so the JVM can perform an operation that needs a consistent heap, such as root scanning, moving objects or class redefinition. Pause time includes the time to reach the safepoint, which a long counted loop without polls can delay.
````

## Hands-on exercise

Build a **toy tracing collector** over a simulated heap, and compare it with reference counting:

- `class Obj { String name; List<Obj> refs; }` with a `heap` list and a `roots` set.
- `markAndSweep()`: mark everything reachable from the roots with an **iterative** depth-first search (an explicit `Deque`, not recursion), then sweep, removing unmarked objects from `heap`. Return the names collected.
- `referenceCounts()`: compute each object's incoming-reference count and report which objects reference counting would free (count 0).

Heap: root `app` → `config`, `app` → `cache` → `entry1`; a cycle `orphanA` ↔ `orphanB`; a lone `tmp`. Show that tracing frees `orphanA`, `orphanB` and `tmp`, while reference counting frees only `tmp`.

````hint title="Hint"
Mark: `Deque<Obj> stack = new ArrayDeque<>(roots); while (!stack.isEmpty()) { Obj o = stack.pop(); if (marked.add(o)) o.refs.forEach(stack::push); }`. Sweep with `heap.removeIf(o -> !marked.contains(o))`. For counts, loop over every object's `refs` and increment a `Map<Obj, Integer>`. Don't treat roots specially in reference counting: real roots hold a reference, so give roots +1.
````

````solution title="Solution"
```java title="ToyCollector.java" file="ToyCollector.java"
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class ToyCollector {
    static final class Obj {
        final String name;
        final List<Obj> refs = new ArrayList<>();

        Obj(String name) {
            this.name = name;
        }

        Obj points(Obj... targets) {
            refs.addAll(List.of(targets));
            return this;
        }

        @Override
        public String toString() {
            return name;
        }
    }

    final List<Obj> heap = new ArrayList<>();
    final Set<Obj> roots = new LinkedHashSet<>();

    Obj alloc(String name) {
        Obj o = new Obj(name);
        heap.add(o);
        return o;
    }

    List<Obj> markAndSweep() {
        Set<Obj> marked = new HashSet<>();
        Deque<Obj> stack = new ArrayDeque<>(roots);       // iterative: no StackOverflowError on deep graphs
        while (!stack.isEmpty()) {
            Obj o = stack.pop();
            if (marked.add(o)) {
                o.refs.forEach(stack::push);
            }
        }
        List<Obj> collected = new ArrayList<>();
        heap.removeIf(o -> {
            boolean dead = !marked.contains(o);
            if (dead) {
                collected.add(o);
            }
            return dead;
        });
        return collected;
    }

    List<Obj> freedByReferenceCounting() {
        Map<Obj, Integer> counts = new HashMap<>();
        heap.forEach(o -> counts.put(o, roots.contains(o) ? 1 : 0));   // a root holds one reference
        for (Obj o : heap) {
            for (Obj target : o.refs) {
                counts.merge(target, 1, Integer::sum);
            }
        }
        return heap.stream().filter(o -> counts.get(o) == 0).toList();
    }

    public static void main(String[] args) {
        ToyCollector gc = new ToyCollector();
        Obj config = gc.alloc("config");
        Obj entry1 = gc.alloc("entry1");
        Obj cache = gc.alloc("cache").points(entry1);
        Obj app = gc.alloc("app").points(config, cache);
        Obj orphanA = gc.alloc("orphanA");
        Obj orphanB = gc.alloc("orphanB");
        orphanA.points(orphanB);
        orphanB.points(orphanA);                          // a cycle with no root
        gc.alloc("tmp");
        gc.roots.add(app);

        System.out.println("heap before:                 " + gc.heap);
        System.out.println("reference counting frees:    " + gc.freedByReferenceCounting());
        System.out.println("mark-and-sweep collects:     " + gc.markAndSweep());
        System.out.println("heap after:                  " + gc.heap);

        cache.refs.clear();                               // the cache drops its entry
        System.out.println("after cache.clear, collects: " + gc.markAndSweep());
    }
}
```

```text title="Output" output="ToyCollector.java"
heap before:                 [config, entry1, cache, app, orphanA, orphanB, tmp]
reference counting frees:    [tmp]
mark-and-sweep collects:     [orphanA, orphanB, tmp]
heap after:                  [config, entry1, cache, app]
after cache.clear, collects: [entry1]
```

Reference counting would leak `orphanA` and `orphanB` forever, because each holds the other's count at 1. Tracing never visits them from a root, so they're collected along with `tmp`. When the cache drops its entry, `entry1` becomes unreachable and the next collection frees it: in Java that's how "removing from a collection" frees memory.
````

## Knowledge check

```quiz
? Which is NOT a GC root?
+ An object referenced only by another unreachable object
- A local variable in an active method frame
- A static field of a loaded class
> References from garbage don't make anything live.

? Why don't HotSpot collectors use reference counting?
+ Cycles would leak and every reference write would need count updates
- Reference counting can't run on 64-bit machines
- Java objects don't have headers to store counts
> Tracing handles cycles naturally and has no per-write counting overhead.

? A young GC's cost is mostly proportional to...
+ The number of live objects it copies
- The size of eden
- The number of dead objects
> Copying collectors never touch dead objects.

? What happens to an object that survives many young collections?
+ It is promoted to the old generation
- It is moved to Metaspace
- It is finalised
> Promotion happens after the tenuring threshold, or early if survivor space overflows.

? What is the card table used for?
+ Finding old-to-young references without scanning the whole old generation
- Tracking which classes are loaded
- Storing object hash codes
> A write barrier dirties cards; minor GCs scan dirty cards as extra roots.
```

## Key takeaways

- Garbage = **unreachable from GC roots** (thread frames, statics, live threads, monitors, JNI, JVM internals). **Tracing**, not reference counting, so cycles are collected.
- Algorithms: **mark-sweep** (fragments), **mark-compact** (no fragmentation, costly), **copying** (cost ∝ live objects, needs spare space).
- **Generational GC**: most objects die young. Eden + survivors are collected by cheap copying **minor GCs**; survivors age and are **promoted**; old is collected by **major/full GCs**. A **card table** tracks old→young pointers.
- Pauses happen at **safepoints**; modern collectors do most work concurrently. Balance **throughput, latency and footprint**.
- Release resources explicitly (try-with-resources, `Cleaner`); never rely on `finalize()` or `System.gc()`.
