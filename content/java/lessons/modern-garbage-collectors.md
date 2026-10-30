## Concept explanation

HotSpot ships several collectors. They share the ideas from the previous lesson (roots, tracing, generations) but make very different trade-offs between **throughput**, **pause time (latency)** and **footprint**. Select one with a flag, or let **ergonomics** choose.

### Serial: `-XX:+UseSerialGC`

- **One GC thread**; everything is **stop-the-world**: young collections copy, old collections mark-compact.
- Minimal overhead and footprint. Good for **small heaps** (up to a few hundred MB), **single-CPU containers**, CLIs and tests.
- Chosen automatically on machines that aren't "server class" (fewer than 2 CPUs or less than about 1.8 GB of RAM).

### Parallel: `-XX:+UseParallelGC` (the "throughput collector")

- The same algorithms as Serial, with **many GC threads**: still fully stop-the-world, but pauses are shorter on multi-core machines.
- Maximises **throughput** (the fraction of time running your code). Pauses grow with the heap and the live data.
- For **batch jobs**, ETL and offline analytics: anything where total runtime matters and occasional long pauses don't. It was the default up to Java 8.

### G1: `-XX:+UseG1GC` (the default since Java 9)

**Garbage-First** divides the heap into ~2,048 equal **regions** (1–32 MB). Each region plays a role (eden, survivor, old, or **humongous** for objects of at least half a region), so generations are just sets of regions, not fixed areas.

- **Young collections**: stop-the-world, parallel evacuation of the eden and survivor regions.
- **Concurrent marking**: when old occupancy crosses the *Initiating Heap Occupancy Percent* (IHOP, adaptive), G1 marks the old regions **concurrently** while the application runs, with short pauses to start and finish (*remark*, *cleanup*).
- **Mixed collections**: G1 then evacuates young regions **plus the old regions with the most garbage**. That's where the name comes from: garbage first, as much as fits in the **pause-time goal** (`-XX:MaxGCPauseMillis`, default 200 ms).
- **Remembered sets** per region record incoming references, so a region can be evacuated without scanning the whole heap.
- **Full GC** is the fallback when evacuation can't keep up: a parallel mark-compact of the entire heap, and a sign of trouble.

It's a balanced default: good throughput, mostly predictable pauses of tens of milliseconds, and heaps from about 1 GB to hundreds of GB.

### ZGC: `-XX:+UseZGC`

- **Almost everything is concurrent**: marking, **relocation (compaction)**, reference processing. Pauses are typically **under a millisecond** and **don't grow with heap size**, from 8 MB to 16 TB.
- Uses **coloured pointers**: metadata bits stored *inside references*. **Load barriers** run whenever a reference is loaded from the heap: if the pointer's colour shows the object may have moved, the barrier fixes ("heals") the reference before the application uses it.
- **Generational** since Java 21 (default in 23, the only mode from 24), which sharply improved throughput and allocation rates.
- Costs: some CPU for concurrent GC threads, barrier overhead on reference loads, and **headroom**. If the application allocates faster than ZGC can reclaim, threads stall ("Allocation Stall").
- For **latency-critical** services with large heaps: trading, ad bidding, interactive APIs with strict p99/p999 goals.

### Shenandoah: `-XX:+UseShenandoahGC`

- Red Hat's concurrent compacting collector, with goals similar to ZGC: pause times independent of heap size.
- Uses **load-reference barriers** to resolve forwarded objects instead of coloured pointers.
- Included in most OpenJDK builds (Temurin, Corretto, Red Hat) but not Oracle's.
- A **generational mode** became a product feature in Java 25 (`-XX:ShenandoahGCMode=generational`).

### Epsilon: `-XX:+UnlockExperimentalVMOptions -XX:+UseEpsilonGC`

A no-op collector: it allocates and never frees, and the JVM dies with `OutOfMemoryError` when the heap is full. Useful for performance testing (measuring GC overhead) and very short-lived jobs.

### Choosing

| Priority | Start with |
|---|---|
| small heap, 1 CPU, minimal overhead | Serial |
| total throughput, pauses don't matter (batch) | Parallel |
| balanced, general-purpose services | **G1** (the default) |
| low, predictable latency; big heaps | **ZGC** (or Shenandoah) |

Then **measure** with GC logs and latency percentiles under realistic load. Switching collectors is a one-flag experiment.

## Internal working

- **G1 in detail**:
  - **Collection set (CSet)**: the regions chosen for evacuation in a pause. G1's pause-time model predicts the cost per region from past pauses and picks a set that fits `MaxGCPauseMillis`.
  - **Remembered sets** are maintained by post-write barriers that enqueue changed cards. Refinement threads process those queues concurrently.
  - **SATB marking**: a pre-write barrier records the *old* value of overwritten references during concurrent marking, so the snapshot of live objects stays consistent.
  - **Humongous objects** occupy contiguous regions and are reclaimed eagerly when dead. Many short-lived humongous allocations (big arrays, large JSON buffers) are a classic G1 problem: raise `G1HeapRegionSize` or reduce the allocation sizes.
  - **Pause types in logs**: `Pause Young (Normal)`, `Pause Young (Concurrent Start)`, `Pause Remark`, `Pause Cleanup`, `Pause Young (Mixed)`, and the unwelcome `Pause Full`.
- **ZGC in detail**:
  - The heap is split into small, medium and large pages.
  - A cycle has three very short pauses (mark start, mark end, relocate start) that only handle roots. Everything else is concurrent.
  - Colours (*marked*, *remapped*… bits in the 64-bit pointer) let the load barrier test for a "bad" colour with one instruction plus a branch.
  - Relocated objects are found through forwarding tables. The first thread to touch a moved reference relocates or remaps it ("self-healing").
  - Generational ZGC adds store barriers and remembered sets to collect young objects often and cheaply.
- **Shenandoah in detail**: concurrent mark, concurrent evacuation and concurrent update-references phases, with the forwarding information stored in the mark word of moved objects. The load-reference barrier ensures the application only ever sees to-space copies.
- **The cost of concurrency**: barriers execute on application threads (a few percent of throughput), GC threads compete for CPU (`ConcGCThreads`), and floating garbage plus headroom need extra memory. A concurrent collector on an overloaded 2-CPU container can perform *worse* than Parallel.
- **Ergonomics** set defaults from the detected CPUs and memory (container-aware since Java 10):
  - the collector itself (Serial if not server class, otherwise G1);
  - the heap: 1/4 of RAM max, 1/64 initial;
  - `ParallelGCThreads`: the CPU count up to 8, then 8 + 5/8 of the rest;
  - `ConcGCThreads`: about a quarter of that;
  - G1's region size, from the heap size.

## Visual representation

```text title="Heap layouts"
  Serial / Parallel (contiguous generations)
  [ EDEN ............ | S0 | S1 ][ OLD ............................................ ]

  G1 (regions; roles assigned dynamically)
  [E][E][O][S][ ][O][H][H][E][O][ ][E][O][O][ ][S][E][O][ ][ ]
   E eden  S survivor  O old  H humongous (one object, contiguous)  [ ] free
   young pause: evacuate all E+S -> free regions
   mixed pause: evacuate E+S + the O regions with the most garbage (fits the pause goal)

  ZGC (concurrent relocation with coloured pointers + load barriers)
   app thread:  obj = field.load()  ->  barrier: pointer colour "bad"? -> remap/relocate, heal field -> continue
   GC threads:  concurrent mark -> concurrent relocate -> concurrent remap      (pauses: roots only, < 1 ms)

  pause time vs heap size (typical shape)
   Serial/Parallel  ......../////////   grows with live data
   G1               ......__/~~~~~~~   bounded by the target, mostly
   ZGC/Shenandoah   ________________    flat, sub-millisecond
```

## Java code example

The program starts a child JVM for each collector with the same pinned settings (`-Xmx256m -XX:ActiveProcessorCount=4`) and reports what each one sets up: its MXBeans, heap pools, GC thread counts and pause target. It finishes with what ergonomics picks for a single-CPU machine.

```java title="GcCatalog.java" file="GcCatalog.java"
import com.sun.management.HotSpotDiagnosticMXBean;
import java.lang.management.GarbageCollectorMXBean;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryPoolMXBean;
import java.lang.management.MemoryType;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

public class GcCatalog {
    public static void main(String[] args) throws Exception {
        if (args.length == 1 && args[0].equals("report")) {
            report();
            return;
        }
        for (String collector : List.of("-XX:+UseSerialGC", "-XX:+UseParallelGC", "-XX:+UseG1GC", "-XX:+UseZGC", "-XX:+UseShenandoahGC")) {
            System.out.println(collector);
            child("-Xmx256m", "-XX:ActiveProcessorCount=4", collector).forEach(line -> System.out.println("   " + line));
        }
        System.out.println("no GC flag, 1 CPU (not a server-class machine)");
        child("-Xmx256m", "-XX:ActiveProcessorCount=1").forEach(line -> System.out.println("   " + line));
    }

    static void report() {
        List<String> beans = new ArrayList<>();
        for (GarbageCollectorMXBean gc : ManagementFactory.getGarbageCollectorMXBeans()) {
            beans.add(gc.getName());
        }
        List<String> pools = new ArrayList<>();
        for (MemoryPoolMXBean pool : ManagementFactory.getMemoryPoolMXBeans()) {
            if (pool.getType() == MemoryType.HEAP) {
                pools.add(pool.getName());
            }
        }
        HotSpotDiagnosticMXBean hotspot = ManagementFactory.getPlatformMXBean(HotSpotDiagnosticMXBean.class);
        String pause = hotspot.getVMOption("MaxGCPauseMillis").getValue();
        System.out.println("MXBeans:    " + beans);
        System.out.println("heap pools: " + pools);
        System.out.println("threads:    ParallelGCThreads=" + hotspot.getVMOption("ParallelGCThreads").getValue()
                + " ConcGCThreads=" + hotspot.getVMOption("ConcGCThreads").getValue()
                + (pause.startsWith("-") ? "" : "  MaxGCPauseMillis=" + pause));
    }

    static List<String> child(String... flags) throws Exception {
        List<String> command = new ArrayList<>();
        command.add(Path.of(System.getProperty("java.home"), "bin", "java").toString());
        command.addAll(List.of(flags));
        command.addAll(List.of("-cp", System.getProperty("java.class.path"), "GcCatalog", "report"));
        Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
        List<String> lines = new String(process.getInputStream().readAllBytes()).lines().toList();
        process.waitFor();
        return lines;
    }
}
```

The same report on Java 25 for the collectors that changed since 17: G1 gained a concurrent-cycle MXBean, ZGC is generational only, and Shenandoah has a generational mode.

```java title="Collectors25.java" file="Collectors25.java" java="25"
import java.lang.management.GarbageCollectorMXBean;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryPoolMXBean;
import java.lang.management.MemoryType;
import java.util.List;

public class Collectors25 {
    public static void main(String[] args) throws Exception {
        if (args.length == 1) {
            List<String> beans = ManagementFactory.getGarbageCollectorMXBeans().stream().map(GarbageCollectorMXBean::getName).toList();
            List<String> pools = ManagementFactory.getMemoryPoolMXBeans().stream()
                    .filter(p -> p.getType() == MemoryType.HEAP).map(MemoryPoolMXBean::getName).toList();
            System.out.println("   " + beans + "\n   " + pools);
            return;
        }
        String java = ProcessHandle.current().info().command().orElseThrow();
        for (List<String> flags : List.of(List.of("-XX:+UseG1GC"), List.of("-XX:+UseZGC"),
                List.of("-XX:+UseShenandoahGC", "-XX:ShenandoahGCMode=generational"))) {
            var command = new java.util.ArrayList<>(List.of(java, "-Xmx256m"));
            command.addAll(flags);
            command.addAll(List.of("-cp", System.getProperty("java.class.path"), "Collectors25", "child"));
            Process p = new ProcessBuilder(command).redirectErrorStream(true).start();
            System.out.println(String.join(" ", flags) + "\n" + new String(p.getInputStream().readAllBytes()).stripTrailing());
            p.waitFor();
        }
    }
}
```

## Output

`GcCatalog.java` (Java 17):

```text title="Output" output="GcCatalog.java"
-XX:+UseSerialGC
   MXBeans:    [Copy, MarkSweepCompact]
   heap pools: [Tenured Gen, Eden Space, Survivor Space]
   threads:    ParallelGCThreads=0 ConcGCThreads=0
-XX:+UseParallelGC
   MXBeans:    [PS MarkSweep, PS Scavenge]
   heap pools: [PS Old Gen, PS Survivor Space, PS Eden Space]
   threads:    ParallelGCThreads=4 ConcGCThreads=0
-XX:+UseG1GC
   MXBeans:    [G1 Young Generation, G1 Old Generation]
   heap pools: [G1 Eden Space, G1 Old Gen, G1 Survivor Space]
   threads:    ParallelGCThreads=4 ConcGCThreads=1  MaxGCPauseMillis=200
-XX:+UseZGC
   MXBeans:    [ZGC Cycles, ZGC Pauses]
   heap pools: [ZHeap]
   threads:    ParallelGCThreads=2 ConcGCThreads=1
-XX:+UseShenandoahGC
   MXBeans:    [Shenandoah Pauses, Shenandoah Cycles]
   heap pools: [Shenandoah]
   threads:    ParallelGCThreads=2 ConcGCThreads=1
no GC flag, 1 CPU (not a server-class machine)
   MXBeans:    [Copy, MarkSweepCompact]
   heap pools: [Tenured Gen, Eden Space, Survivor Space]
   threads:    ParallelGCThreads=0 ConcGCThreads=0
```

`Collectors25.java` (Java 25):

```text title="Output" output="Collectors25.java"
-XX:+UseG1GC
   [G1 Young Generation, G1 Concurrent GC, G1 Old Generation]
   [G1 Eden Space, G1 Old Gen, G1 Survivor Space]
-XX:+UseZGC
   [ZGC Minor Cycles, ZGC Minor Pauses, ZGC Major Cycles, ZGC Major Pauses]
   [ZGC Old Generation, ZGC Young Generation]
-XX:+UseShenandoahGC -XX:ShenandoahGCMode=generational
   [Shenandoah Pauses, Shenandoah Cycles]
   [Shenandoah Young Gen, Shenandoah Old Gen]
```

- Serial and Parallel expose the classic young and old pools. Serial runs no parallel GC threads; Parallel uses all four CPUs.
- G1 shows generation *pools*, but they're sets of regions underneath. It's the only collector with a pause-time goal (200 ms).
- ZGC and Shenandoah on Java 17 report a single heap pool and separate "Pauses" and "Cycles" beans, because most of their work happens concurrently, outside pauses.
- On a single CPU, ergonomics chose **Serial** without being asked.
- On Java 25, ZGC reports young and old generations with minor and major cycles. G1 adds a "Concurrent GC" bean, and Shenandoah's generational mode splits its heap into young and old.

## Real-world application

- **Web services**: G1 (the default) with a sensible heap is right for most. Tune `MaxGCPauseMillis` only if logs show pauses above your budget.
- **Latency-sensitive systems** (payments, trading, real-time bidding, game backends): ZGC or Shenandoah to keep p99.9 pauses under a millisecond, with 20–30% heap headroom and spare CPU.
- **Batch and data processing** (Spark executors, nightly jobs): Parallel GC often finishes fastest.
- **Small containers and functions**: Serial (selected automatically below 2 CPUs) avoids wasting a tiny CPU quota on GC threads.
- **Large in-memory caches or search** (Elasticsearch, Cassandra): G1 or ZGC, chosen by benchmarking with production-like data. Region sizes and humongous objects matter here.
- **Kubernetes**: CPU limits change ergonomics (GC threads, even the collector). Check the effective collector in logs or with `jcmd <pid> VM.flags`, not by assumption.

## Common mistakes

- **Choosing a collector without measuring** ("ZGC is newer, so it's better"). Concurrent collectors trade throughput and CPU for latency.
- **Setting `MaxGCPauseMillis` very low** (for example 10 ms) with G1. It shrinks the young generation, causes more frequent GCs and lowers throughput. The target is a goal, not a guarantee.
- **Running concurrent collectors without headroom**, which leads to allocation stalls (ZGC) or degenerated and full GCs (Shenandoah, G1).
- **Ignoring humongous allocations in G1**: many arrays of at least half a region cause premature concurrent cycles and fragmentation.
- **Copying flags from old blog posts**: `-XX:+UseConcMarkSweepGC` (CMS, removed in 14), `-XX:+UseParNewGC`, `-XX:PermSize`, or `-XX:+ZGenerational` (removed in 24). Unknown flags stop the JVM from starting.
- **Treating `Pause Full` in G1 logs as normal.** It means the concurrent cycle lost the race: investigate the heap size, live data, leaks or humongous objects.

## Interview questions

**Q1. Which garbage collectors does HotSpot provide, and when would you use each?**

````reveal title="Answer"
- **Serial**: single-threaded stop-the-world, for small heaps and single CPUs.
- **Parallel**: multi-threaded stop-the-world for maximum throughput, for batch jobs.
- **G1**: the default; region-based, generational, with concurrent marking and incremental mixed collections that aim for a pause-time goal. For general services.
- **ZGC**: concurrent marking and relocation with coloured pointers and load barriers, sub-millisecond pauses at any heap size, generational since 21. For latency-critical workloads.
- **Shenandoah**: concurrent compaction with load-reference barriers, similar goals to ZGC.
- **Epsilon**: no-op, for testing.

CMS was removed in Java 14.
````

**Q2. How does G1 work?**

````reveal title="Answer"
The heap is split into equal regions, each acting as eden, survivor, old or humongous.
- **Young pauses** evacuate eden and survivor regions in parallel.
- When old occupancy exceeds the adaptive IHOP, a **concurrent marking** cycle (SATB) finds live data in old regions.
- **Mixed collections** then evacuate young regions plus the old regions with the most reclaimable garbage, chosen by a pause-prediction model to meet `MaxGCPauseMillis`.
- Per-region **remembered sets** track incoming references, so regions can be evacuated independently.
- A **full GC** is the fallback if evacuation fails.
````

**Q3. How can ZGC keep pauses under a millisecond on huge heaps?**

````reveal title="Answer"
It does marking, relocation (compaction) and reference updating concurrently with the application. Pauses only handle thread roots, so they don't scale with the heap or the live data. Correctness during concurrent relocation comes from **coloured pointers**, which store metadata bits in each reference, and **load barriers**. Whenever the application loads a reference whose colour shows it may be stale, the barrier remaps it to the object's new location (relocating the object if needed) and heals the field. The costs are barrier overhead, concurrent GC CPU, and the need for heap headroom to avoid allocation stalls.
````

**Q4. What is a humongous object in G1, and why can it be a problem?**

````reveal title="Answer"
An object whose size is at least half a G1 region. It's allocated directly into one or more contiguous humongous regions, bypassing eden. Many short-lived humongous objects:
- waste region space and fragment the heap;
- can trigger concurrent cycles early;
- can force evacuation failures or full GCs.

Mitigations: increase `-XX:G1HeapRegionSize`, avoid giant temporary arrays (stream or chunk the data), and reuse large buffers.
````

**Q5. What does the JVM choose when you don't specify a collector?**

````reveal title="Answer"
Ergonomics decide at start-up from the CPUs and memory visible to the JVM (container-aware). On a "server-class" machine (at least 2 CPUs and about 1.8 GB of memory) the default is G1. Otherwise it's Serial. Ergonomics also set:
- the max heap (25% of RAM by default, adjustable with `-XX:MaxRAMPercentage`) and the initial heap (1/64);
- `ParallelGCThreads` and `ConcGCThreads`;
- the G1 region size.

A container limited to one CPU therefore runs Serial GC unless told otherwise.
````

## Hands-on exercise

Write an **ergonomics explorer**. Start child JVMs that simulate different machines with `-XX:ActiveProcessorCount=N -XX:MaxRAM=M` and no GC or heap flags, and print for each:
- the collector chosen;
- `MaxHeapSize` in MB;
- `ParallelGCThreads` and `ConcGCThreads`;
- `G1HeapRegionSize` in MB (when G1 is chosen).

Simulate 1 CPU / 1 GB, 2 CPUs / 2 GB, 4 CPUs / 8 GB, 16 CPUs / 32 GB, and 4 CPUs / 8 GB with `-XX:MaxRAMPercentage=75`.

````hint title="Hint"
In the child, read the options with `HotSpotDiagnosticMXBean.getVMOption(name).getValue()`; `UseSerialGC`, `UseG1GC` and `UseParallelGC` tell you the collector. `MaxRAM` makes the JVM size the heap as if the machine had that much memory, and `ActiveProcessorCount` overrides the detected CPUs, so the results don't depend on your real machine.
````

````solution title="Solution"
```java title="Ergonomics.java" file="Ergonomics.java"
import com.sun.management.HotSpotDiagnosticMXBean;
import java.lang.management.ManagementFactory;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

public class Ergonomics {
    public static void main(String[] args) throws Exception {
        if (args.length == 1) {
            HotSpotDiagnosticMXBean vm = ManagementFactory.getPlatformMXBean(HotSpotDiagnosticMXBean.class);
            String gc = Boolean.parseBoolean(vm.getVMOption("UseSerialGC").getValue()) ? "Serial"
                    : Boolean.parseBoolean(vm.getVMOption("UseG1GC").getValue()) ? "G1"
                    : Boolean.parseBoolean(vm.getVMOption("UseParallelGC").getValue()) ? "Parallel" : "other";
            long heapMb = Long.parseLong(vm.getVMOption("MaxHeapSize").getValue()) / (1024 * 1024);
            long regionMb = Long.parseLong(vm.getVMOption("G1HeapRegionSize").getValue()) / (1024 * 1024);
            System.out.printf("%-6s heap %5d MB  ParallelGCThreads %2s  ConcGCThreads %s%s%n", gc, heapMb,
                    vm.getVMOption("ParallelGCThreads").getValue(), vm.getVMOption("ConcGCThreads").getValue(),
                    gc.equals("G1") ? "  region " + regionMb + " MB" : "");
            return;
        }
        List<List<String>> machines = List.of(
                List.of("-XX:ActiveProcessorCount=1", "-XX:MaxRAM=1g"),
                List.of("-XX:ActiveProcessorCount=2", "-XX:MaxRAM=2g"),
                List.of("-XX:ActiveProcessorCount=4", "-XX:MaxRAM=8g"),
                List.of("-XX:ActiveProcessorCount=16", "-XX:MaxRAM=32g"),
                List.of("-XX:ActiveProcessorCount=4", "-XX:MaxRAM=8g", "-XX:MaxRAMPercentage=75"));
        for (List<String> machine : machines) {
            List<String> command = new ArrayList<>();
            command.add(Path.of(System.getProperty("java.home"), "bin", "java").toString());
            command.addAll(machine);
            command.addAll(List.of("-cp", System.getProperty("java.class.path"), "Ergonomics", "child"));
            Process p = new ProcessBuilder(command).redirectErrorStream(true).start();
            String result = new String(p.getInputStream().readAllBytes()).strip();
            p.waitFor();
            String label = String.join(" ", machine).replace("-XX:ActiveProcessorCount=", "cpus=").replace("-XX:MaxRAM=", "ram=")
                    .replace("-XX:MaxRAMPercentage=", "pct=");
            System.out.printf("%-20s -> %s%n", label, result);
        }
    }
}
```

```text title="Output" output="Ergonomics.java"
cpus=1 ram=1g        -> Serial heap   256 MB  ParallelGCThreads  0  ConcGCThreads 0
cpus=2 ram=2g        -> G1     heap   512 MB  ParallelGCThreads  2  ConcGCThreads 1  region 1 MB
cpus=4 ram=8g        -> G1     heap  2048 MB  ParallelGCThreads  4  ConcGCThreads 1  region 1 MB
cpus=16 ram=32g      -> G1     heap  8192 MB  ParallelGCThreads 13  ConcGCThreads 3  region 4 MB
cpus=4 ram=8g pct=75 -> G1     heap  6144 MB  ParallelGCThreads  4  ConcGCThreads 1  region 4 MB
```

- With one CPU, ergonomics chose **Serial**.
- The heap was a quarter of the simulated RAM unless `MaxRAMPercentage` said otherwise.
- `ParallelGCThreads` equalled the CPU count up to 8, then grew more slowly (16 CPUs → 13).
- G1's region size grew with the heap (1 MB → 4 MB).

This is exactly what happens when the same container image runs with different Kubernetes CPU and memory limits.
````

## Knowledge check

```quiz
? Which collector is the default on a server-class machine since Java 9?
+ G1
- Parallel
- ZGC
> Parallel was the default up to Java 8; ZGC must be selected explicitly.

? Which collector maximises throughput with stop-the-world multi-threaded collections?
+ Parallel
- ZGC
- Shenandoah
> The throughput collector accepts longer pauses for less total GC time.

? How does ZGC let the application keep running while objects move?
+ Coloured pointers and load barriers that remap stale references when they are loaded
- It never moves objects
- It copies the heap to disk during relocation
> The first thread to load a stale reference heals it.

? In G1, what is a mixed collection?
+ A pause that evacuates young regions plus selected old regions with the most garbage
- A full GC of the whole heap
- A collection that mixes Serial and Parallel algorithms
> Mixed collections follow a concurrent marking cycle.

? A container gets 1 CPU and no GC flags. Which collector runs?
+ Serial
- G1
- Parallel
> Below 2 CPUs (or ~1.8 GB) the machine isn't server-class.
```

## Key takeaways

- **Serial** (small, single CPU), **Parallel** (throughput, stop-the-world), **G1** (default: regions, concurrent marking, pause target, mixed collections), **ZGC** (concurrent relocation, coloured pointers + load barriers, sub-ms pauses, generational since 21), **Shenandoah** (concurrent compaction, load-reference barriers), **Epsilon** (no-op).
- G1 essentials: regions, **remembered sets**, **SATB** marking, **IHOP**, mixed collections, **humongous** objects, full GC as the fallback.
- Concurrent collectors buy latency with **CPU, barrier overhead and headroom**.
- **Ergonomics** pick the collector, heap and thread counts from the CPUs and memory visible to the JVM. Verify the effective settings, then tune with GC logs under real load.
