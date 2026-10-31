# Performance & Memory

### A service's p99 latency doubled after a release. How do you find the cause?
`id: perf-slow-service-approach` `level: intermediate` `kind: scenario` `lessons: performance-and-benchmarking,profiling-and-diagnostics`

#### Hints
1. What changed, and which metric moved first: CPU, GC, database time, or threads waiting?
2. Which tool shows where the time goes in a running JVM without restarting it?

#### Answer
Work from evidence, narrowing step by step:
1. **Scope it**: which endpoints, which percentiles, since which deploy, at what load? Compare against the previous version (canary or rollback data).
2. **Check the golden signals and JVM metrics**:
   - CPU and GC (pause time, frequency, **allocation rate**);
   - thread pool and connection pool utilisation (queueing!);
   - downstream latency (database, HTTP);
   - error and retry rates.
   
   Rising latency with idle CPU usually means **waiting**: locks, pools, I/O.
3. **Profile in production or under a load test**:
   - **JFR** (`jcmd <pid> JFR.start duration=60s filename=rec.jfr`) or **async-profiler** (CPU, `alloc`, `lock` and `wall` modes);
   - thread dumps (`jcmd <pid> Thread.print`) show blocked threads;
   - the flame graph's widest new stack is the suspect.
4. **Diff the release** for the suspect: a new query (N+1, a missing index), a regex or JSON mapper created per call, logging of large payloads, a synchronized hot path, a smaller pool, a changed timeout or retry setting.
5. **Fix one thing, then verify** with the same load test and percentiles. Add a regression guard: an SLO alert, or a benchmark for library code.

#### Why other answers fall short
- **"Increase the heap / add instances."** Treats symptoms, may hide a leak or contention, and costs money without explaining anything.
- **"Look at average latency and CPU."** Averages hide tails, and CPU is often flat when the problem is waiting.
- **"Rewrite the hot loop."** Guessing without a profile usually optimises the wrong code.

#### Follow-up
**CPU is low but latency is high. Where do you look?** At waiting: async-profiler `wall`/`lock` mode or JFR's monitor and park events, thread dumps (many threads `BLOCKED` or `WAITING` on the same lock, pool or connection), database lock waits and slow queries, and downstream calls. Usually a pool or lock is saturated (queueing), or an external dependency slowed down.

### Why report p99 latency instead of the average?
`id: p99-vs-average` `level: beginner` `kind: concept` `lessons: performance-and-benchmarking`

#### Hints
1. What does the shape of a latency distribution usually look like?
2. A page makes 50 backend calls. How likely is it that at least one of them is slow?

#### Answer
Latency distributions are **long-tailed**: most requests are fast, and a few hit GC pauses, cache misses, lock contention, retries or slow dependencies. The **average** mixes them into a number that describes no actual request and hides the tail. **Percentiles** describe what users feel: p50 is typical, p99 is "1 in 100 requests is at least this slow".

With fan-out, tails dominate. If a page needs 50 calls, each with a 1% chance of being slow, about 40% of page loads (1 − 0.99⁵⁰) hit at least one slow call. SLOs are therefore defined on high percentiles (p95, p99, p99.9) plus error rates.

Measure them with **histograms** (HdrHistogram, Micrometer timers with percentile histograms), not by averaging per-instance percentiles, which is mathematically invalid. Also beware **coordinated omission**: load generators that wait for responses send fewer requests during stalls and under-report the tail.

#### Why other answers fall short
- **"The average is fine if the variance is small."** Latency variance is rarely small, and the outliers are exactly what users complain about.
- **"Use the maximum."** A single outlier is noisy. High percentiles are stable and still capture the tail.

#### Follow-up
**Can you average the p99 of ten instances to get the cluster p99?** No. Percentiles don't compose. Merge the histograms (or raw bucket counts) and compute the percentile from the combined distribution.

### What does this "benchmark" really measure?
`id: naive-benchmark-dce` `level: advanced` `kind: output` `tricky` `lessons: performance-and-benchmarking,bytecode-and-jit`

```java
long start = System.nanoTime();
for (int i = 0; i < 100_000_000; i++) {
    Math.sqrt(i);
}
long elapsed = System.nanoTime() - start;
System.out.println(elapsed / 100_000_000.0 + " ns per sqrt");
```

#### Hints
1. Is the result of `Math.sqrt(i)` used anywhere?
2. What does C2 do with a side-effect-free computation whose result is discarded?

#### Answer
It prints an implausibly small number, often a few hundredths of a nanosecond per "sqrt", or a time that barely changes when you change the iteration count. It measures **the JIT, not `sqrt`**:
- The loop starts **interpreted**, then **on-stack replacement** swaps in compiled code mid-loop, so the timing mixes execution modes.
- `Math.sqrt` is an intrinsic with no side effects, and its result is unused, so C2 **eliminates it as dead code**. The loop body becomes empty, and the empty loop may be removed or reduced to a counter update.

Correct measurement uses **JMH**:
- the `@Benchmark` method returns the result (or consumes it with a `Blackhole`);
- inputs come from `@State` fields, not constants (to avoid constant folding);
- warm-up iterations and forked JVMs.

Then you measure real `sqrt` throughput, roughly a nanosecond or less per call, pipelined.

#### Why other answers fall short
- **"It prints the real cost of sqrt (very fast because of hardware)."** Hardware sqrt isn't free; the work was deleted.
- **"`nanoTime` resolution is too low."** Resolution matters for single calls, not for 100 million iterations. The problem is what the JIT does to the loop.

#### Follow-up
**Would summing the results into a local variable fix it?** Only partially. If the sum is never used, it's dead too. If you print it, the JIT must compute it, but you still face OSR, warm-up and loop optimisations (vectorisation, unrolling) that don't reflect real call sites. JMH exists to handle all of these.

### How much memory does an `ArrayList<Integer>` of one million values take?
`id: boxed-collection-footprint` `level: intermediate` `kind: concept` `tricky` `lessons: memory-optimization,object-allocation-and-layout,wrapper-classes-autoboxing`

#### Hints
1. What does each element of the list actually hold?
2. Does it matter *which* million values are stored?

#### Answer
With compressed oops (the default on heaps under ~32 GB):
- each **`Integer` object** is 16 bytes (12-byte header + 4-byte `int`, already 8-aligned);
- the backing **`Object[]`** holds a **4-byte reference** per element, plus up to 50% spare capacity from growth.

For a million **distinct** values outside the cache, that's about **20 MB** (16 MB of objects + 4 MB of references), plus slack. An **`int[]`** holds the same data in **4 MB** with one object and no pointers for the GC to trace.

The tricky part is that **the values matter**: `Integer.valueOf` (used by autoboxing) returns **cached instances for -128..127**. A list of a million zeros holds a million references to the *same* `Integer`, so it costs only ~4 MB for the array.

For large numeric data, use primitive arrays or primitive collections (fastutil `IntArrayList`, Eclipse Collections), or `IntStream` without boxing.

#### Why other answers fall short
- **"4 MB, an int is 4 bytes."** It ignores the object header and the reference per element.
- **"About 16 MB."** It forgets the array of references (and growth slack).
- **"Always ~20 MB."** It misses the `Integer` cache effect for small values.

#### Follow-up
**And a `HashMap<Integer, Integer>` with a million entries?** Each entry needs a 32-byte `Node`, key and value `Integer`s (16 bytes each, unless cached), and a table slot (4 bytes, often with 2x capacity headroom). That's roughly 70-80 MB, about 10x the raw 8 MB of data, which is why primitive maps (`Int2IntOpenHashMap`) exist.

### How many times does this map resize?
`id: newhashmap-sizing` `level: intermediate` `kind: output` `tricky` `lessons: memory-optimization,hashmap-internals`

```java
Map<String, Integer> m = new HashMap<>(1000);
for (int i = 0; i < 1000; i++) {
    m.put("k" + i, i);
}
```

#### Hints
1. Is the constructor argument the number of entries or the table capacity?
2. When does a `HashMap` resize relative to its capacity?

#### Answer
**Once**, despite the "presizing". The argument is the initial **capacity**, rounded up to a power of two: 1024. The map resizes when `size > capacity × loadFactor` = 1024 × 0.75 = **768**. On the 769th insertion, the table doubles to 2048 and every entry is rehashed into the new table. The initial table allocation happens lazily on the first `put` and isn't a resize.

To size for **1000 mappings** without a resize:
- `HashMap.newHashMap(1000)` (Java 19+) computes the needed capacity (⌈1000 / 0.75⌉ = 1334, so 2048);
- before Java 19: `new HashMap<>((int) (1000 / 0.75f) + 1)`, or Guava's `Maps.newHashMapWithExpectedSize`.

The same applies to `HashSet` and `LinkedHashMap` (`HashSet.newHashSet(n)`).

#### Why other answers fall short
- **"Zero, it was created with room for 1000."** It confuses capacity with expected size.
- **"Several times, every time it fills up."** Presizing to 1024 prevents the early resizes at 12, 24, 48…, leaving exactly one.

#### Follow-up
**Does `new ArrayList<>(1000)` have the same problem?** No. `ArrayList`'s argument is the exact array capacity, and it grows only when `size == capacity`, so 1000 adds fit without copying.

### A flame graph shows `Pattern.compile` in a hot request path, but the code never calls it. Why?
`id: string-split-regex-cost` `level: intermediate` `kind: debugging` `tricky` `lessons: performance-and-benchmarking,strings-and-stringbuilder`

```java
String[] parts = line.split("\\s*,\\s*");
String clean = input.replaceAll("[^a-z0-9]", "");
boolean ok = email.matches("[^@]+@[^@]+");
```

#### Hints
1. What do `split`, `replaceAll` and `matches` take as their argument?
2. Where could a compiled `Pattern` be kept so it's reused?

#### Answer
`String.split(regex)`, `replaceAll`, `replaceFirst` and `matches` are **regex convenience methods**. Each call runs `Pattern.compile(regex)` internally, then builds a `Matcher`. In a per-request or per-line loop, that compiles the same pattern millions of times: CPU in the regex compiler plus heavy allocation.

**The exception**: `split` has a **fast path without regex** when the argument is a single character that isn't a regex metacharacter (`","`, `";"`), or a backslash plus a non-alphanumeric character (`"\\|"`). That's why `split(",")` is cheap but `split("\\s*,\\s*")` isn't.

Fix:
- precompile once: `private static final Pattern COMMA = Pattern.compile("\\s*,\\s*");` and call `COMMA.split(line)`, `PATTERN.matcher(s).replaceAll("")`, `PATTERN.matcher(s).matches()`;
- for literal replacements, use `String.replace(CharSequence, CharSequence)`, which doesn't use regex since Java 9.

#### Why other answers fall short
- **"The JIT caches regex patterns."** It doesn't. Compiling a pattern is ordinary library work, repeated on every call.
- **"Regex is always slow, avoid it."** A precompiled `Pattern` is fine. The waste is recompiling it.

#### Follow-up
**Is `Pattern` thread-safe to share in a static field?** Yes: `Pattern` is immutable and thread-safe. `Matcher` is stateful and not thread-safe, so create a new matcher per use (which is cheap).

### Production logs show `java.lang.NullPointerException` with no stack trace and no message. Why?
`id: omit-stacktrace-fast-throw` `level: advanced` `kind: debugging` `tricky` `lessons: performance-and-benchmarking,bytecode-and-jit,exception-best-practices`

#### Hints
1. The first occurrences, hours earlier, had full stack traces.
2. What can the JIT do to an exception thrown very frequently from the same place?

#### Answer
HotSpot's C2 has an optimisation, **`-XX:+OmitStackTraceInFastThrow`**, which is **on by default**:
- when an **implicit** exception (`NullPointerException`, `ArithmeticException`, `ArrayIndexOutOfBoundsException`, `ClassCastException`, `ArrayStoreException`) is thrown many times from the same compiled code, C2 recompiles that code to throw a **preallocated exception object**;
- that object has **no stack trace and no message**, which also hides the helpful NPE message ("Cannot invoke … because … is null");
- capturing stack traces is expensive (`fillInStackTrace` walks the stack), so this keeps hot failure paths fast.

To diagnose:
- **search older logs** for the first occurrences, which have full traces;
- or restart with **`-XX:-OmitStackTraceInFastThrow`** to always get traces.

Then fix the real bug: an NPE thrown thousands of times is a control-flow problem.

#### Why other answers fall short
- **"The logger truncates stack traces."** Possible in principle, but here the exception object itself has an empty stack trace.
- **"The exception came from native code."** Native code still produces Java frames up to the JNI boundary.

#### Follow-up
**Why are exceptions expensive as control flow in general?** Creating a `Throwable` captures the stack trace (cost proportional to stack depth), and throwing across frames unwinds them and can force deoptimisation. If an exception is truly used for flow, a preallocated exception without a stack trace avoids most of the cost: override `fillInStackTrace`, or pass `writableStackTrace = false` to the protected constructor. A return value (`Optional`, result types) is usually clearer.

### Allocation in a TLAB is just a pointer bump. Why reduce allocation at all?
`id: allocation-rate-gc-pressure` `level: intermediate` `kind: internals` `lessons: memory-optimization,object-allocation-and-layout,garbage-collection-basics`

#### Hints
1. What triggers a young collection?
2. What happens to objects that live just a little too long?

#### Answer
The allocation itself is cheap: a thread-local bump of a pointer, a handful of instructions. The **consequences** aren't:
- **GC frequency**: the young generation fills at the allocation rate. At 1 GB/s with a 500 MB young generation, that's two young GCs per second, each with pause and safepoint overhead (concurrent collectors burn CPU instead).
- **Premature promotion**: under high allocation, objects that live just a bit longer (requests in flight, caches, buffers) survive several young GCs and are **promoted** to the old generation. That makes old-generation collections more frequent and expensive.
- **Memory bandwidth and caches**: new memory must be zeroed and touched, evicting useful data from CPU caches.
- **Scaling**: allocation-heavy code shares memory bandwidth across cores.

So reducing allocation in hot paths often improves both throughput and tail latency: avoid boxing, reuse `StringBuilder`s or buffers within a request, prefer primitive streams, cache `Pattern`/`ObjectMapper` instances, and don't build log strings that are thrown away. Measure with JFR allocation profiling, async-profiler `-e alloc`, or JMH `-prof gc` (bytes per operation).

#### Why other answers fall short
- **"Allocation is free with modern GCs, ignore it."** It ignores GC frequency, promotion and cache effects.
- **"Pool all objects."** Pooling small objects usually makes things worse: pooled objects become long-lived, adding old-generation pressure, contention and bugs.

#### Follow-up
**Can the JIT remove allocations by itself?** Yes. **Escape analysis** with scalar replacement removes allocations of objects that don't escape a compiled method (after inlining), such as a temporary `Point` or iterator. It depends on inlining decisions, so it isn't guaranteed. Measure rather than assume.

### The heap keeps growing over days until an OOM. How do you find what retains the memory?
`id: heap-dump-retained-size` `level: intermediate` `kind: debugging` `lessons: memory-optimization,profiling-and-diagnostics,references-and-memory-leaks`

#### Hints
1. Which artefact contains every live object and every reference?
2. A `HashMap` object is tiny. What size number reveals that it holds gigabytes?

#### Answer
1. **Confirm a leak**: the heap *after full GCs* (the live set) keeps rising over time. A sawtooth with a stable floor is normal.
2. **Capture evidence**:
   - run with `-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=...`;
   - or take dumps on demand (`jcmd <pid> GC.heap_dump /tmp/h.hprof`; it pauses the app, so use a drained instance), ideally two dumps some hours apart;
   - `jcmd <pid> GC.class_histogram` is a cheap first look at which classes grow.
3. **Analyse** in Eclipse MAT, IntelliJ or VisualVM:
   - the **dominator tree** sorted by **retained size**: the memory freed if that object disappeared, including everything reachable only through it;
   - **path to GC roots** for the big retainers, to see *who* holds them.
4. **Typical culprits**:
   - unbounded caches or static maps;
   - collections in long-lived singletons;
   - `ThreadLocal`s on pooled threads;
   - listeners never removed;
   - sessions kept too long;
   - per-request data stored in a static queue.
5. **Fix** with bounds (size, expiry), removal on lifecycle events, or weak references where the semantics fit. Verify that the live set stabilises.

#### Why other answers fall short
- **"Increase `-Xmx`."** It postpones the crash and makes the eventual heap dump bigger.
- **"Look at the classes with the most instances."** Instance counts and **shallow** size point at `byte[]`, `String` and `Node`, but not at the owner that retains them. Retained size and paths to GC roots do.

#### Follow-up
**The heap is fine but the container is OOM-killed. Now what?** Look at **native memory**: thread stacks (too many threads), direct `ByteBuffer`s, Metaspace (class loader leaks), the code cache, and native libraries. Use `-XX:NativeMemoryTracking=summary` with `jcmd VM.native_memory`, and size `-Xmx` (or `MaxRAMPercentage`) to leave headroom below the container limit.

### A `static Map` cache made a service fast, then it started crashing weekly. How should it be fixed?
`id: cache-eviction-sizing` `level: intermediate` `kind: scenario` `lessons: memory-optimization,references-and-memory-leaks`

#### Hints
1. What limits the number of entries in that map?
2. Is entry count the right limit if values vary greatly in size?

#### Answer
An unbounded cache is a **memory leak with good intentions**: every distinct key (product id, user, query string) stays forever. Replace it with a **bounded cache** and design its policy:
- **Size or weight limit**: `maximumSize(10_000)`, or `maximumWeight` with a weigher when values vary in size (bytes of a response). Derive the limit from the measured entry size and the heap budget.
- **Eviction policy**: LRU (`LinkedHashMap` with access order and `removeEldestEntry` for simple single-threaded cases). For production, **Caffeine**: thread-safe, W-TinyLFU admission (high hit rate under scans), async loading, statistics.
- **Expiry**: `expireAfterWrite` for staleness bounds, `expireAfterAccess` for idle entries, or explicit invalidation on updates.
- **Observability**: record hit rate, evictions and size. A low hit rate means the cache isn't worth its memory.
- **Load stampedes**: use `get(key, loader)` / `computeIfAbsent`-style loading, so concurrent misses for the same key load once.

Avoid `WeakHashMap` as a "cache": its **keys** are weak, which is wrong for value caches keyed by strings or ids (the entries vanish at once, or never if the keys are interned). `SoftReference` caches make GC behaviour unpredictable under pressure.

#### Why other answers fall short
- **"Restart weekly" / "add memory."** The growth is unbounded, so no memory size is enough.
- **"Use `ConcurrentHashMap` instead."** It fixes thread safety, not growth.

#### Follow-up
**How do you choose the cache size?** Measure the average retained size per entry (heap dump or JOL), multiply by candidate sizes, and simulate or observe hit rates. The hit-rate curve usually flattens: choose the knee, where more memory adds little, within the heap budget left after the live set and GC headroom.

### Adding more threads made throughput *drop*. What are the likely causes?
`id: contention-throughput-collapse` `level: advanced` `kind: scenario` `lessons: performance-and-benchmarking,lock-free-and-false-sharing,explicit-locks,executors-and-thread-pools`

#### Hints
1. What happens when many threads compete for one lock or one cache line?
2. What does Amdahl's law say about the serial part of the work?

#### Answer
Scaling stops, then reverses, when threads spend more time coordinating than working:
- **Lock contention**: a hot `synchronized` method or lock (a shared cache, logger, connection pool, `SimpleDateFormat` wrapper) serialises the work, and contended locks add parking and wake-up overhead. Use JFR monitor events or async-profiler `-e lock` to see it.
- **Cache-line contention / false sharing**: threads updating the same atomic counter or neighbouring fields bounce a cache line between cores. Use `LongAdder`, padding (`@Contended`), or per-thread accumulation.
- **Oversubscription**: far more runnable threads than cores means context switches, cache thrashing and larger memory use (stacks).
- **Downstream saturation**: a database or connection pool with a fixed capacity. More threads just queue, and latency rises while throughput stays flat or falls (with timeouts and retries adding load).
- **Amdahl's law**: with a 10% serial fraction, the maximum speed-up is 10x, whatever the thread count.

Fixes:
- reduce shared mutable state (partition, per-thread buffers, immutable data);
- use concurrent structures;
- shrink critical sections;
- size pools to the bottleneck resource (cores for CPU-bound work, the downstream limit for I/O-bound work);
- use **virtual threads** for blocking I/O, together with bounded concurrency towards the downstream resource.

#### Why other answers fall short
- **"The JVM can't handle that many threads."** Thousands of platform threads are possible. The problem is what they contend on.
- **"GC is the problem."** It's possible (allocation scales with threads), but it should be confirmed by GC logs, not assumed.

#### Follow-up
**How do you prove it's contention?** Look for many threads `BLOCKED` on the same monitor, or `WAITING` on the same lock or condition in repeated thread dumps. Check JFR `JavaMonitorEnter` and `ThreadPark` events with long durations, async-profiler lock profiles, and CPU utilisation well below 100% while throughput is capped.

### How many database connections does a service handling 400 requests/s need?
`id: pool-sizing-littles-law` `level: intermediate` `kind: scenario` `lessons: performance-and-benchmarking,jdbc-fundamentals,executors-and-thread-pools`

Each request holds a connection for about 25 ms on average (queries plus transaction time).

#### Hints
1. Little's law: L = λ × W.
2. What happens to latency when utilisation approaches 100%?

#### Answer
By **Little's law**, the average number of connections in use is L = λ × W = 400 requests/s × 0.025 s = **10 connections**. A pool must cover that average plus variance, so a size of **~15-20** gives headroom without saturation. Queueing theory says waiting time explodes as utilisation approaches 100%, so don't size to the average.

Check the other side too:
- the database's capacity: total connections across **all instances** (20 × 12 pods = 240) must stay below its limit and its sweet spot, often a small multiple of its cores;
- more connections beyond that point only add contention inside the database.

Reduce W instead of increasing L: hold connections only during database work (not during remote calls), shorten transactions, add indexes, batch queries. Monitor pool wait time (`hikaricp_connections_pending`) and usage.

#### Why other answers fall short
- **"400, one per request."** It ignores that each request holds a connection for only 25 ms of each second.
- **"As many as possible, connections are cheap."** Database-side contention and memory per connection make oversizing harmful. HikariCP's guidance favours small pools.

#### Follow-up
**And the thread pool for those requests, if each request takes 120 ms in total, mostly waiting on I/O?** L = 400 × 0.12 = 48 requests in flight on average, so a platform thread pool of roughly 60-100 threads, or virtual threads with the connection pool (or a semaphore) limiting the concurrency that reaches the database.

### The first minutes after each deployment are slow, then latency settles. Why, and what can you do?
`id: jit-warmup-latency` `level: intermediate` `kind: scenario` `lessons: bytecode-and-jit,jvm-tuning,performance-and-benchmarking`

#### Hints
1. In what form does code run before it becomes hot?
2. What else happens lazily on first use: classes, caches, connections?

#### Answer
A fresh JVM is **cold**:
- code runs in the **interpreter**, then C1, then C2 (tiered compilation), and the compiler threads compete for CPU with the requests;
- classes are **loaded, linked and initialised lazily** on first use (Spring proxies, Jackson serializers, regex patterns);
- connection pools, caches and JIT profiles are still empty.

The first requests pay all of this, so tail latency spikes after each deploy or autoscaling event.

Mitigations:
- **Warm-up before taking traffic**: replay representative requests, then flip the readiness probe; or ramp traffic gradually (slow start in the load balancer).
- **Start-up optimisations**:
  - **CDS/AppCDS** archives for pre-parsed classes;
  - JDK 24+ **AOT cache** (JEP 483: ahead-of-time class loading and linking; JDK 25 adds method profiles with JEP 515);
  - eager initialisation of known-heavy components;
  - GraalVM native image or CRaC checkpoint/restore for instant start-up, at some cost to peak performance or with constraints.
- **Enough CPU at start-up**: limiting a container to 1 CPU starves the JIT compiler threads. Consider a higher CPU limit or burst.

#### Why other answers fall short
- **"GC is slow at start-up."** The heap is nearly empty then. GC is rarely the warm-up problem.
- **"Use `-Xcomp` to compile everything up front."** It compiles without profiles: slower start-up and usually worse code.

#### Follow-up
**How would you verify that warm-up is the cause?** Check that latency is elevated only on new instances, correlated with JIT activity (JFR compilation events, `-Xlog:jit+compilation`, CPU used by compiler threads) and class loading counts, and that it disappears after warm-up traffic or with an AOT/CDS archive.

### Is this logging line a performance problem when DEBUG is disabled?
`id: logging-hot-path-cost` `level: beginner` `kind: debugging` `lessons: logging-and-assertions,performance-and-benchmarking`

```java
for (Order order : orders) {                       // millions per minute
    log.debug("Processing " + order + " with items " + order.items());
    process(order);
}
```

#### Hints
1. When is the message string built: before or inside `debug(...)`?
2. What do `order.toString()` and `order.items()` cost?

#### Answer
Yes. Java evaluates arguments **before** the call, so every iteration concatenates the message, calling `order.toString()` and the list's `toString()` (iterating and formatting every item), only for the logger to discard it because DEBUG is off. On a hot path, that's wasted CPU and **allocation**, which shows up as GC pressure.

Fixes:
- **parameterised messages**: `log.debug("Processing {} with items {}", order, order.items())`. The arguments are just references; formatting happens only if DEBUG is enabled. `order.items()` itself is still called, which is cheap if it's a getter;
- **lazy suppliers** for expensive arguments: `log.atDebug().addArgument(() -> expensiveSummary(order)).log("Processing {}")` (SLF4J 2), or `if (log.isDebugEnabled()) { … }`.

Also check whether the information belongs in the logs at all (volume, PII). Metrics or sampling are often better for per-item events.

#### Why other answers fall short
- **"No, the logger checks the level first."** It does, but only after Java has already evaluated the argument expression.
- **"The JIT will remove it."** It can't remove calls with potential side effects (`toString()`) just because the result is later ignored inside another method.

#### Follow-up
**Does `log.debug("x={}", computeX())` avoid calling `computeX()`?** No. `computeX()` is still evaluated, because it's an argument. Only the *formatting* is deferred. Use a supplier or a level guard for expensive computations.

### How many bytes do the character arrays of these two strings use?
`id: compact-strings-output` `level: advanced` `kind: output` `tricky` `lessons: memory-optimization,strings-and-stringbuilder`

```java
String a = "x".repeat(1000);
String b = "x".repeat(999) + (char) 0x3A9;   // one Greek capital omega at the end
```

#### Hints
1. Since Java 9, what does a `String` store internally, and in which encodings?
2. Can one string mix encodings internally?

#### Answer
- `a`: **1,000 bytes**. With **compact strings** (JEP 254, Java 9), a `String` stores a `byte[]` plus a `coder` flag. All characters of `a` fit in Latin-1, so each takes one byte.
- `b`: **2,000 bytes**. Omega (U+03A9) is outside Latin-1, so the **whole string** uses UTF-16, two bytes per `char`. Encodings aren't mixed within one string.

Each also has the `String` object (24 bytes) and the array header (16 bytes). So text that is mostly ASCII with a single emoji, accented character outside Latin-1, or CJK character doubles in size. That matters for large in-memory text, such as caches of JSON documents.

#### Why other answers fall short
- **"2,000 bytes for both; Java strings are UTF-16."** That was true before Java 9.
- **"1,002 bytes for `b`; only the omega takes two bytes."** The coder applies to the whole array. Per-character variable width would break O(1) `charAt`.

#### Follow-up
**Does `String.length()` of a string with one emoji count the emoji as 1?** No. An emoji outside the Basic Multilingual Plane is a **surrogate pair**: two `char`s, so `length()` counts 2. `codePointCount(0, s.length())` counts code points, and user-perceived characters (grapheme clusters) need `BreakIterator` or a regex with `\X`.
