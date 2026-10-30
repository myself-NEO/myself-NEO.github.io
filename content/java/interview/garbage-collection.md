# Garbage Collection

### How does the garbage collector decide which objects to free?
`id: gc-reachability-roots` `level: beginner` `kind: concept` `lessons: garbage-collection-basics`

#### Hints
1. Where does the collector start looking?
2. What happens to two objects that only reference each other?

#### Answer
By **reachability**. The collector starts from **GC roots** and traces every reference, marking what it reaches:
- local variables and operand stacks in the frames of every live thread;
- static fields of loaded classes;
- live `Thread` objects;
- monitors held by `synchronized`;
- JNI references;
- JVM-internal references.

Everything not marked is **garbage**, including cycles of objects that only point to each other. HotSpot doesn't use reference counting.

#### Why other answers fall short
- **"When its reference count drops to zero."** That's reference counting, which leaks cycles; Java uses tracing.
- **"When you set the variable to null."** That only removes one reference; the object is freed if, and when, it's unreachable at a later GC.

#### Follow-up
**In a heap dump, how do you find why an object is still alive?** Use "path to GC roots" (MAT, VisualVM): it shows the chain of references from a root (often a static field or a thread) to the object.

### What does this print with `-XX:+UseSerialGC`, and is it guaranteed?
`id: cycle-weakref-output` `level: intermediate` `kind: output` `tricky` `lessons: garbage-collection-basics,references-and-memory-leaks`

```java
class Node { Node next; }

Node a = new Node();
Node b = new Node();
a.next = b;
b.next = a;
WeakReference<Node> ref = new WeakReference<>(a);
a = null;
b = null;
System.gc();
System.out.println(ref.get() == null);
```

#### Hints
1. Is the cycle reachable from any root once `a` and `b` are null?
2. What does `System.gc()` promise?

#### Answer
It prints **`true`** in practice: the two nodes reference each other but nothing reaches them from a root, so tracing GC treats the whole cycle as garbage, and the weak reference is cleared. With Serial (and G1), `System.gc()` runs a full collection, and `WeakReference.get()` returns `null` immediately after clearing.

It isn't strictly *guaranteed* by the specification: `System.gc()` is only a **hint**. It's ignored with `-XX:+DisableExplicitGC`, and it may start a concurrent cycle instead with `-XX:+ExplicitGCInvokesConcurrent`. Tests that depend on GC should loop and retry rather than assume one call suffices.

#### Why other answers fall short
- **"false, because the nodes still reference each other."** That's reference-counting thinking.
- **"Always true, by the specification."** `System.gc()` only *suggests* a collection.

#### Follow-up
**What would happen with a `SoftReference` instead?** It would very likely survive (`false`): soft references are cleared only under memory pressure, and always before an `OutOfMemoryError`.

### What is the generational hypothesis, and how does the young generation work?
`id: generational-young-gen` `level: intermediate` `kind: concept` `lessons: garbage-collection-basics`

#### Hints
1. How long do most objects in a typical program live?
2. Why are there two survivor spaces?

#### Answer
The **weak generational hypothesis**: most objects die young. So collectors split the heap:
- **Young generation**: **eden** plus two **survivor** spaces.
  - New objects go into eden, allocated by bump pointer in TLABs.
  - A **minor GC** copies the live objects from eden and the occupied survivor into the empty survivor, incrementing each one's **age**, then treats eden as empty.
  - Because most objects are dead, the cost is proportional to the few survivors.
- **Old generation**: objects older than the **tenuring threshold** (≤ 15), or that don't fit in a survivor space, are **promoted** here. It's collected less often by major or full (or, in G1, mixed) collections.
- A **card table** (written by a barrier on reference stores) records old→young pointers, so minor GCs don't scan the whole old generation.

#### Why other answers fall short
- **"Young GC is concurrent and pause-free."** In Serial, Parallel and G1, young collections are stop-the-world, just short.
- **"Objects move to the old generation after one GC."** They age through survivors first, unless survivors overflow (premature promotion).

#### Follow-up
**Why are medium-lived objects bad for generational GC?** They survive several young GCs (expensive copying), get promoted, then die in the old generation, filling it with garbage that only expensive old collections can reclaim.

### Minor GC vs major GC vs full GC?
`id: minor-major-full` `level: beginner` `kind: concept` `lessons: garbage-collection-basics,modern-garbage-collectors`

#### Hints
1. Which part of the heap does each one collect?
2. Which one should you rarely see in a healthy G1 application?

#### Answer
- **Minor (young) GC**: collects only the young generation. It's frequent, short and stop-the-world in most collectors.
- **Major GC**: collects the old generation. The term is loose: in G1 old regions are cleaned by **concurrent marking** followed by **mixed** collections.
- **Full GC**: collects the **entire heap** (young + old, and unloads classes), usually stop-the-world with compaction. Triggers include `System.gc()`, failing to promote, G1 evacuation failure, and Metaspace thresholds.

In G1 and ZGC logs, a `Pause Full` is a warning sign: the concurrent machinery couldn't keep up.

#### Why other answers fall short
- **"Major and full are the same."** In concurrent collectors, old-generation collection happens without a full GC.
- **"Full GCs are normal maintenance."** With G1, ZGC or Shenandoah they indicate a problem: heap too small, a leak, humongous allocations.

#### Follow-up
**How do you see which GCs happen?** Unified GC logging (`-Xlog:gc*`), `jstat -gcutil <pid> 1s`, the `GarbageCollectorMXBean` counts, or JFR's `GarbageCollection` events.

### How does G1 work?
`id: g1-internals` `level: advanced` `kind: internals` `lessons: modern-garbage-collectors`

#### Hints
1. How is the heap divided?
2. What does "garbage first" refer to?

#### Answer
- **Regions**: the heap is ~2,048 equal regions (1–32 MB). Each acts as eden, survivor, old or **humongous** (for objects ≥ half a region). Generations are logical sets of regions.
- **Young pauses**: stop-the-world, parallel evacuation of all eden and survivor regions into free regions.
- **Concurrent marking**: when old occupancy crosses the adaptive **IHOP**, G1 marks live objects concurrently (SATB write barriers), with short *remark* and *cleanup* pauses.
- **Mixed collections**: G1 then evacuates young regions **plus the old regions with the most garbage** ("garbage first"), choosing as many as its pause model predicts will fit the **`MaxGCPauseMillis`** goal (default 200 ms).
- **Remembered sets** per region (maintained by post-write barriers and refinement threads) track incoming references, so regions can be evacuated independently.
- **Full GC** is the fallback when evacuation fails.

#### Why other answers fall short
- **"G1 guarantees 200 ms pauses."** It's a soft goal driven by predictions.
- **"G1 has no generations."** It's generational, but over regions rather than contiguous spaces.

#### Follow-up
**Why can many large arrays hurt G1?** Humongous objects take whole contiguous regions, waste space, can trigger early concurrent cycles and fragment the heap. Increase `G1HeapRegionSize` or avoid huge temporary arrays.

### How does ZGC achieve sub-millisecond pauses on multi-terabyte heaps?
`id: zgc-low-pause` `level: advanced` `kind: internals` `lessons: modern-garbage-collectors`

#### Hints
1. Which expensive phases does ZGC do concurrently?
2. How can the application keep using objects that are being moved?

#### Answer
ZGC does **marking, relocation (compaction) and reference updating concurrently** with the application. Its pauses only handle thread roots, so they don't grow with the heap or the live set. Correctness during concurrent relocation comes from:
- **Coloured pointers**: metadata bits stored *in* each 64-bit reference that describe its state (marked, remapped…).
- **Load barriers**: a check executed whenever the application loads a reference from the heap. If the colour is "bad", the barrier looks up the object's new location (relocating it if necessary) and **heals** the field, so later loads take the fast path.

Since Java 21 ZGC is **generational** (the only mode from 24), collecting young objects frequently and cheaply. The costs: barrier overhead on the application, CPU for concurrent GC threads, and **headroom**. If allocation outpaces collection, threads hit "allocation stalls".

#### Why other answers fall short
- **"ZGC doesn't compact."** It does, concurrently.
- **"ZGC has no pauses."** It has very short ones, for roots.

#### Follow-up
**How does Shenandoah differ?** It also compacts concurrently, but uses load-reference barriers with forwarding information stored in moved objects instead of coloured pointers. Its generational mode became a product feature in Java 25.

### Which garbage collector would you choose for: a nightly batch job, a payments API with a p99.9 < 10 ms target, and a CLI tool in a 1-CPU container?
`id: choose-collector` `level: intermediate` `kind: scenario` `lessons: modern-garbage-collectors,jvm-tuning`

#### Hints
1. What matters for each: total time, tail latency, or footprint and start-up?
2. What does ergonomics choose with one CPU?

#### Answer
- **Nightly batch job** → **Parallel GC**. Total runtime (throughput) matters and long pauses don't. It uses all cores during stop-the-world collections, with minimal barrier overhead.
- **Payments API with strict tail latency** → **ZGC** (or Shenandoah), for sub-millisecond pauses independent of heap size. Give it heap headroom and spare CPU, and verify p99.9 under load. G1 with a tuned pause target may also suffice, if measurements say so.
- **CLI tool in a 1-CPU container** → **Serial**, which ergonomics selects automatically below 2 CPUs. It has the lowest overhead and footprint, and there's nothing to parallelise anyway.

Default for everything else: **G1**. Always confirm with GC logs and latency percentiles; a one-flag experiment is cheap.

#### Why other answers fall short
- **"ZGC everywhere because it's newest."** Concurrent collectors cost throughput, CPU and memory.
- **"Tune G1 to 1 ms pauses."** Very low targets shrink the young generation, multiply GCs and still can't guarantee it.

#### Follow-up
**What else reduces GC pauses, whichever collector you use?** Allocate less (avoid boxing and temporary copies), avoid medium-lived objects, keep the live set small, and size the heap sensibly (about 3–4× the live set).

### When are soft, weak and phantom references cleared?
`id: reference-strengths` `level: intermediate` `kind: concept` `tricky` `lessons: references-and-memory-leaks`

#### Hints
1. Which one waits for memory pressure?
2. What does `PhantomReference.get()` return?

#### Answer
- **`SoftReference`**: cleared at the GC's discretion when memory is needed (HotSpot uses an LRU-style policy based on free heap), and **guaranteed** to be cleared before `OutOfMemoryError`.
- **`WeakReference`**: cleared at the **next GC** once the object is only weakly reachable. Used by `WeakHashMap` keys, canonicalising maps, and metadata attached to objects.
- **`PhantomReference`**: `get()` **always returns `null`**. It's enqueued after the object has been finalised and is about to be reclaimed. Used for post-mortem cleanup of native resources, and it's what `java.lang.ref.Cleaner` is built on.

All of them can be registered with a **`ReferenceQueue`** to be notified when they're cleared. The Reference Handler thread enqueues them asynchronously after the GC.

#### Why other answers fall short
- **"Weak references are cleared when memory is low."** That's soft references.
- **"Soft references are a good cache."** Clearing is unpredictable, depends on heap size, and can cause GC thrashing near OOM. Prefer size- or time-bounded caches.

#### Follow-up
**Why does a `WeakHashMap` entry sometimes never disappear?** Values are held strongly. If the value references its own key (directly or indirectly), the key stays strongly reachable. Interned or literal string keys never become unreachable either.

### How can a Java program leak memory if it has a garbage collector?
`id: java-memory-leaks` `level: intermediate` `kind: scenario` `lessons: references-and-memory-leaks,profiling-and-diagnostics`

#### Hints
1. What can the GC never free?
2. Which long-lived objects tend to accumulate references?

#### Answer
The GC frees only **unreachable** objects, so a leak is **unintended reachability**: objects you'll never use again are still referenced from somewhere long-lived. Common sources:
- growing **static collections** or caches without eviction;
- **listeners and callbacks** that are never unregistered;
- **`ThreadLocal`s** in pooled threads that are never removed;
- **mutable keys** in `HashMap`/`HashSet` (lost after their hash changes);
- inner classes or lambdas **capturing** large outer objects;
- **class-loader leaks** across redeploys;
- unbounded queues and sessions.

There are also native leaks from unclosed streams, connections and direct buffers.

Diagnose with:
1. old-gen-after-GC trends in GC logs;
2. two class histograms or heap dumps;
3. Eclipse MAT's dominator tree and **path to GC roots**.

#### Why other answers fall short
- **"Java can't leak memory."** It can't leak *unreachable* memory, but reachable garbage is a leak in every practical sense.
- **"Call `System.gc()` to fix it."** The GC can't free referenced objects.

#### Follow-up
**What's the quickest first check on a live service?** Run `jcmd <pid> GC.class_histogram` twice, minutes apart, and compare which classes' instance counts keep growing.

### Why is `finalize()` deprecated, and what replaces it?
`id: finalize-vs-cleaner` `level: intermediate` `kind: concept` `lessons: references-and-memory-leaks,garbage-collection-basics`

#### Hints
1. When, and on which thread, does a finaliser run?
2. What can a finaliser do to the object being collected?

#### Answer
Finalisation is fundamentally unreliable:
- it may run late or never;
- it delays reclamation by at least one extra GC cycle;
- it runs on a single `Finalizer` thread that a slow finaliser can back up;
- exceptions thrown in it are silently ignored;
- objects can be **resurrected** by storing `this` somewhere;
- it costs performance for every finalisable object.

It's been deprecated since 9 and deprecated for removal since 18. You can turn it off with `--finalization=disabled`.

Replacements:
- **`AutoCloseable` + try-with-resources** for deterministic cleanup;
- **`java.lang.ref.Cleaner`**, phantom-reference based, as a safety net for native resources if `close()` is forgotten. Its cleanup action must not reference the object being cleaned.

#### Why other answers fall short
- **"`finalize()` is like a C++ destructor."** Destructors run deterministically; finalisers don't.
- **"Cleaner replaces close()."** It's a backstop, not the primary mechanism.

#### Follow-up
**Why must a `Cleaner` action not capture the object being cleaned?** The cleaner holds the action strongly. If the action references the object, the object stays reachable and is never cleaned.

### Does `System.gc()` force a garbage collection?
`id: system-gc-hint` `level: intermediate` `kind: concept` `tricky` `lessons: garbage-collection-basics,jvm-tuning`

#### Hints
1. What does the Javadoc promise?
2. Which JVM flags change what it does?

#### Answer
No, it **suggests** one; the specification allows the JVM to ignore it. In HotSpot by default it triggers a **full, stop-the-world collection** with Serial, Parallel and G1, which is often the most expensive pause you'll ever see. Flags change it:
- `-XX:+DisableExplicitGC` ignores it entirely;
- `-XX:+ExplicitGCInvokesConcurrent` starts a concurrent cycle instead (G1);
- ZGC and Shenandoah run a concurrent cycle anyway.

Application code shouldn't call it. One legitimate internal use: NIO direct-buffer reservation calls it to free unreachable buffers before failing, which is why disabling explicit GC can cause `OutOfMemoryError` for direct memory in NIO-heavy apps.

#### Why other answers fall short
- **"It forces an immediate GC."** It doesn't guarantee one.
- **"It's harmless."** It typically causes a full pause and defeats the collector's own heuristics.

#### Follow-up
**How would you spot hidden `System.gc()` calls?** GC logs show the cause: `Pause Full (System.gc())`. JFR's `GarbageCollection` events include the cause too.

### What is a safepoint, and why do some pauses take longer than the GC log says?
`id: safepoints-ttsp` `level: advanced` `kind: internals` `lessons: garbage-collection-basics,profiling-and-diagnostics`

#### Hints
1. Can the JVM stop a thread at any instruction?
2. What if a thread is in a long loop with no safepoint polls?

#### Answer
A **safepoint** is a point where a thread's state is fully described for the JVM: which stack slots and registers contain object references. Compiled code polls for safepoint requests at method returns and loop back-edges. Threads in native code count as already safe. Stop-the-world operations (GC phases, deoptimisation, class redefinition, some `jcmd` commands, thread dumps) bring **all** threads to a safepoint first.

The **time to safepoint** (TTSP), waiting for the slowest thread to reach a poll, adds to the pause but may not appear in the GC's own pause figure. Historically, long **counted loops** (int-indexed loops that C2 compiled without polls) could delay everyone. Modern JDKs use loop strip mining to bound this. Diagnose with `-Xlog:safepoint`, which shows reaching time vs operation time per pause.

#### Why other answers fall short
- **"The JVM stops threads instantly with OS signals."** It needs them at well-defined points so it can find all references.
- **"Concurrent collectors don't use safepoints."** They still have short safepoint pauses for roots.

#### Follow-up
**How do safepoints bias profilers?** Samplers that collect stacks only at safepoints attribute time to the nearest poll, not to the hot code. JFR and async-profiler sample asynchronously to avoid this.

### Map each message to its cause: `Java heap space`, `Metaspace`, `Cannot reserve … direct buffer memory`, `unable to create native thread`, and a pod `OOMKilled` (exit 137).
`id: oome-messages` `level: intermediate` `kind: debugging` `lessons: outofmemory-and-stackoverflow`

#### Hints
1. Each message names a different memory area.
2. One of them isn't a Java error at all.

#### Answer
| Message | Exhausted resource | Usual cause |
|---|---|---|
| `Java heap space` | the heap, after a full GC | a leak, a too-small heap, or a spike (loading too much at once) |
| `Metaspace` | class metadata (`MaxMetaspaceSize`) | class-loader leaks on redeploy, unbounded class generation |
| `Cannot reserve … direct buffer memory` | NIO direct memory (`MaxDirectMemorySize`) | Netty or NIO buffers not released, too many large direct buffers |
| `unable to create native thread` | OS threads / process limits | thread leaks (executors per request), `ulimit -u`, container pid limits |
| `OOMKilled` / exit 137 | the **container's** memory limit | heap + native memory exceeded the cgroup limit; the kernel killed the process, so there's no Java error |

Evidence to collect: `-XX:+HeapDumpOnOutOfMemoryError`, GC logs, thread dumps (for thread exhaustion), Native Memory Tracking (for native or container issues). Add `-XX:+ExitOnOutOfMemoryError` so the orchestrator restarts a clean process.

#### Why other answers fall short
- **"Increase `-Xmx` for all of them."** Only heap-space errors relate to `-Xmx`, and raising it inside a fixed container limit makes `OOMKilled` *more* likely.
- **"They're all memory leaks."** Spikes, limits and thread leaks are different problems.

#### Follow-up
**What does `Requested array size exceeds VM limit` mean?** Code tried to allocate an array close to `Integer.MAX_VALUE` elements, usually a size-calculation bug, regardless of how much heap is free.
