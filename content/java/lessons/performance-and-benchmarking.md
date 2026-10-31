## Concept explanation

### Measure, don't guess

Performance work follows a loop:
1. **Define the goal**: a number for the metric that matters (p99 latency < 200 ms at 500 requests/s, a batch job under 10 min, heap under 2 GB).
2. **Measure** the real system under realistic load.
3. **Profile** to find where the time or memory actually goes.
4. **Change one thing.**
5. **Measure again** and compare against the baseline.

Intuition is wrong most of the time. The bottleneck is usually **I/O, the database, locking, allocation or an algorithm**, rarely the micro-optimisation you'd guess.

| Metric | Meaning |
|---|---|
| **Latency** | time per operation. Report **percentiles** (p50, p95, p99, max), never only the average: one slow call in 100 is the p99 users feel |
| **Throughput** | operations per second at a given concurrency |
| **Resource use** | CPU, allocation rate (MB/s), GC pause time, heap, threads, connections |
| **Scalability** | how throughput and latency change as load or cores increase (Amdahl's law, contention) |

### Where the big wins are (in order)

1. **Algorithm and data structure**: an O(n²) `list.contains` in a loop becomes O(n) with a `HashSet`. This beats any JIT trick.
2. **I/O and round trips**: batch database calls, kill N+1 queries, add caching, reuse connections, use async/parallel I/O.
3. **Contention**: shrink lock scope, use concurrent structures, partition work (Concurrency stage).
4. **Allocation**: avoid needless temporary objects, boxing and string building in hot loops. Allocation is cheap, but GC pressure isn't free.
5. **JVM and GC tuning** (JVM stage), and only then micro-optimisations.

### Microbenchmarks need JMH

A naive `System.nanoTime()` loop around a method measures the wrong thing:
- **JIT warm-up**: the first iterations run interpreted;
- **On-stack replacement** turns the loop into a weird compiled form;
- **Dead-code elimination**: the result is unused, so the work is deleted;
- **Constant folding**: inputs known at compile time;
- **Loop optimisations**: unrolling, hoisting work out of the loop;
- GC pauses landing randomly, CPU frequency scaling, and **profile pollution** from other benchmarks in the same JVM.

**JMH** (Java Microbenchmark Harness, by the OpenJDK team) handles all of these: forks fresh JVMs, runs warm-up iterations, uses `Blackhole` to consume results, and reports error margins.

```java
@BenchmarkMode(Mode.AverageTime) @OutputTimeUnit(TimeUnit.NANOSECONDS)
@Warmup(iterations = 5, time = 1) @Measurement(iterations = 5, time = 1) @Fork(2)
@State(Scope.Benchmark)
public class ConcatBenchmark {
    @Param({"10", "1000"}) int n;
    String[] parts;

    @Setup public void setup() { parts = new String[n]; Arrays.fill(parts, "abc"); }

    @Benchmark public String plusInLoop() {          // returning the result prevents dead-code elimination
        String s = "";
        for (String p : parts) s += p;
        return s;
    }

    @Benchmark public void builder(Blackhole bh) {   // or consume explicitly
        StringBuilder sb = new StringBuilder();
        for (String p : parts) sb.append(p);
        bh.consume(sb.toString());
    }
}
// mvn archetype: org.openjdk.jmh:jmh-java-benchmark-archetype ; run: java -jar target/benchmarks.jar -prof gc
```

Even with JMH, microbenchmarks answer narrow questions. Confirm wins in the **real application** with load tests (Gatling, k6, JMeter) and production profiling (async-profiler, JFR).

## Internal working

- **Why warm-up matters** (JVM stage): code starts **interpreted**, is compiled by **C1** after a few thousand invocations, then by **C2** with profile-guided optimisations (inlining, escape analysis, loop unrolling, vectorisation). A benchmark's first seconds measure the compilers, not your code. Deoptimisation can happen when the profile changes, for example a new subtype appears at a call site that was monomorphic.
- **Dead-code elimination**: if C2 proves a result unused and the computation side-effect-free, it deletes the computation. A naive benchmark then reports impossibly fast times. JMH's `Blackhole.consume` defeats that by acting as an opaque sink.
- **Escape analysis** can remove allocations entirely (scalar replacement) when an object doesn't escape a compiled method. Allocation counts in compiled code can therefore be lower than the source suggests, and change with inlining decisions.
- **Allocation cost**: a TLAB bump-pointer allocation is just a few instructions. The cost appears later as **GC work proportional to live objects and promotion**, plus the cache misses of touching new memory. The **allocation rate** (MB/s) drives young-GC frequency.
- **Measuring allocation**: `com.sun.management.ThreadMXBean.getThreadAllocatedBytes(threadId)` reports bytes allocated by a thread, which JMH's `-prof gc` uses. Unlike time, it's nearly deterministic for a given JVM, so it makes a good teaching metric (the example below uses it). JFR's allocation sampling and async-profiler's `-e alloc` show **where** allocations happen.
- **Percentiles need histograms**: averaging hides tail latency, and so does "coordinated omission" (a load generator that waits for slow responses sends fewer requests during stalls). HdrHistogram and wrk2/Gatling handle it properly.
- **The usual hot spots** in Java services:
  - JSON (de)serialisation, logging, regex compilation in loops (`String.split`/`replaceAll` with regex);
  - boxing in collections and streams;
  - exceptions used for control flow (stack-trace capture is expensive);
  - synchronized hot paths;
  - database round trips.

## Visual representation

```text title="Performance work as a loop"
   goal (p99 < 200 ms @ 500 rps)
        |
   measure (load test, prod metrics) --> profile (JFR, async-profiler: CPU, alloc, lock, wall)
        ^                                         |
        |                                hypothesis: "70% CPU in JSON + regex"
        |                                         |
   compare to baseline <---- change ONE thing (cache Pattern, batch query, better algorithm)

 naive microbenchmark                  JMH
 ---------------------                 ---
 1 JVM, no warm-up                     forks, warm-up iterations
 result unused -> DCE                  Blackhole / return values
 constants -> folded                   @State fields, @Param
 single number                         mean +- error, percentiles, -prof gc
```

## Java code example

Timing results vary from machine to machine, and so would this page's output. This example therefore measures two things that **don't** vary: **work done** (comparisons, operations counted by the code itself) and **bytes allocated** (from `ThreadMXBean`). Together they show the algorithmic and allocation differences that timing would reflect. Timings are taken too, but printed only as a pass/fail claim.

```java title="PerfDemo.java" file="PerfDemo.java" run="-XX:+UseSerialGC -Xmx256m"
import java.lang.management.ManagementFactory;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.IntStream;

public class PerfDemo {
    static final com.sun.management.ThreadMXBean THREADS =
            (com.sun.management.ThreadMXBean) ManagementFactory.getThreadMXBean();

    static long allocatedBytes() {
        return THREADS.getThreadAllocatedBytes(Thread.currentThread().getId());
    }

    // An id type that counts equals() calls: a proxy for "work done" by contains()
    static final class Sku {
        static long equalsCalls;
        final int value;

        Sku(int value) {
            this.value = value;
        }

        @Override
        public boolean equals(Object o) {
            equalsCalls++;
            return o instanceof Sku other && other.value == value;
        }

        @Override
        public int hashCode() {
            return Integer.hashCode(value);
        }
    }

    static int countKnown(List<Sku> orders, java.util.Collection<Sku> catalog) {
        int known = 0;
        for (Sku s : orders) {
            if (catalog.contains(s)) {
                known++;
            }
        }
        return known;
    }

    static String concatWithPlus(int n) {
        String s = "";
        for (int i = 0; i < n; i++) {
            s += "item" + i + ",";
        }
        return s;
    }

    static String concatWithBuilder(int n) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < n; i++) {
            sb.append("item").append(i).append(',');
        }
        return sb.toString();
    }

    public static void main(String[] args) {
        // 1. Algorithm: list.contains is O(n), set.contains is O(1)
        List<Sku> catalogList = IntStream.range(0, 5_000).mapToObj(Sku::new).toList();
        Set<Sku> catalogSet = new HashSet<>(catalogList);
        List<Sku> orders = IntStream.range(0, 2_000).map(i -> i * 7 % 10_000).mapToObj(Sku::new).toList();

        Sku.equalsCalls = 0;
        long t0 = System.nanoTime();
        int a = countKnown(orders, catalogList);
        long listNanos = System.nanoTime() - t0;
        long listEquals = Sku.equalsCalls;

        Sku.equalsCalls = 0;
        t0 = System.nanoTime();
        int b = countKnown(orders, catalogSet);
        long setNanos = System.nanoTime() - t0;
        long setEquals = Sku.equalsCalls;
        System.out.println("known SKUs: list " + a + ", set " + b);
        System.out.printf("equals() calls: ArrayList.contains %,d vs HashSet.contains %,d (%.0fx less work)%n",
                listEquals, setEquals, (double) listEquals / setEquals);
        System.out.println("HashSet version was faster in wall-clock time too: " + (setNanos < listNanos));

        // 2. Allocation: += in a loop copies the whole string every iteration
        concatWithPlus(100);
        concatWithBuilder(100);                                    // load classes before measuring
        for (int n : new int[] { 1_000, 4_000 }) {
            long before = allocatedBytes();
            String plus = concatWithPlus(n);
            long plusBytes = allocatedBytes() - before;
            before = allocatedBytes();
            String built = concatWithBuilder(n);
            long builderBytes = allocatedBytes() - before;
            System.out.printf("n=%,d: result %,d chars; += allocated ~%.1f MB, StringBuilder ~%,d KB (same result: %b)%n",
                    n, plus.length(), plusBytes / (1024.0 * 1024), builderBytes / 1024, plus.equals(built));
        }

        // 3. Boxing: a List<Integer> sum vs an int[] sum
        List<Integer> boxed = new ArrayList<>();
        long before = allocatedBytes();
        for (int i = 0; i < 100_000; i++) {
            boxed.add(i + 1_000);                                   // values above the Integer cache (-128..127)
        }
        long boxedBytes = allocatedBytes() - before;
        before = allocatedBytes();
        int[] primitives = new int[100_000];
        for (int i = 0; i < primitives.length; i++) {
            primitives[i] = i + 1_000;
        }
        long primitiveBytes = allocatedBytes() - before;
        System.out.printf("100,000 ints: ArrayList<Integer> allocated ~%,d KB, int[] ~%,d KB%n", boxedBytes / 1024, primitiveBytes / 1024);

        // 4. Hidden regex cost: String.split with a multi-character regex compiles a Pattern each call
        String csv = "a1,b2,c3,d4";
        before = allocatedBytes();
        for (int i = 0; i < 10_000; i++) {
            csv.split(",\\s*");
        }
        long splitBytes = allocatedBytes() - before;
        Pattern commaSpaces = Pattern.compile(",\\s*");
        before = allocatedBytes();
        for (int i = 0; i < 10_000; i++) {
            commaSpaces.split(csv);
        }
        long patternBytes = allocatedBytes() - before;
        System.out.println("10,000 splits: String.split(regex) allocated more than a precompiled Pattern: " + (splitBytes > patternBytes));
    }
}
```

## Output

```text title="Output" output="PerfDemo.java"
known SKUs: list 1286, set 1286
equals() calls: ArrayList.contains 6,498,929 vs HashSet.contains 1,286 (5054x less work)
HashSet version was faster in wall-clock time too: true
n=1,000: result 7,890 chars; += allocated ~3.8 MB, StringBuilder ~25 KB (same result: true)
n=4,000: result 34,890 chars; += allocated ~65.1 MB, StringBuilder ~106 KB (same result: true)
100,000 ints: ArrayList<Integer> allocated ~2,813 KB, int[] ~390 KB
10,000 splits: String.split(regex) allocated more than a precompiled Pattern: true
```

- **Algorithm**: `ArrayList.contains` compares element by element, millions of `equals` calls in total. `HashSet` jumps to a bucket and compares about once. That gap grows with the data size and dwarfs any micro-tuning.
- **String concatenation**: `+=` in a loop allocates a new, longer string on every iteration, so total allocation grows **quadratically**. At four times `n`, it allocated roughly 16 times more. `StringBuilder` grows its buffer geometrically, so allocation is linear. (Since Java 9, a **single** `a + b + c` expression is compiled efficiently with `invokedynamic`; only repeated concatenation across loop iterations is the problem.)
- **Boxing**: each `Integer` outside the small cache is a separate 16-byte object plus a 4- or 8-byte reference in the list's array. `int[]` stores 4 bytes per value.
- **Regex**: `String.split` with a real regex compiles a `Pattern` on every call; precompiling it in a `static final` field avoids that. (One-character, non-regex delimiters like `","` take a fast path without regex.)

To time these properly, write a JMH benchmark like the one above and run it with `-prof gc` to see `gc.alloc.rate.norm` (bytes per operation).

## Real-world application

- **Before optimising**, capture a production profile:
  - **JFR** (`jcmd <pid> JFR.start duration=60s filename=rec.jfr`, opened in JDK Mission Control);
  - or **async-profiler** flame graphs (`-e cpu`, `-e alloc`, `-e lock`, `-e wall` for blocked time).
  
  The flame graph usually points at one or two dominant stacks.
- **Typical wins found that way**:
  - N+1 queries (fix with joins or batches);
  - JSON mappers created per request (make them singletons);
  - `Pattern.compile`/`String.format` in hot loops;
  - logging with eager string building;
  - excessive boxing in streams;
  - lock contention on a synchronized cache (use `ConcurrentHashMap`/Caffeine);
  - missing database indexes;
  - oversized thread pools causing context switching.
- **Load testing**: Gatling, k6 or JMeter with production-like data, measuring p95/p99 and error rates while scaling up the arrival rate until latency breaks. That point is your capacity.
- **Regression protection**:
  - JMH benchmarks for performance-critical libraries (serializers, collections), run in CI on dedicated hardware;
  - SLO dashboards and alerts on latency percentiles for services.
- **Capacity reasoning**: Little's law (`concurrency = throughput × latency`) sizes thread pools and connection pools. At 200 requests/s with 50 ms of database time each, you need about 10 connections busy on average.

## Common mistakes

- **Optimising without a profile**, or optimising code that runs once.
- **Hand-written timing loops** without warm-up, with unused results (dead-code elimination) or with constant inputs. They're misleading by orders of magnitude.
- **Reporting averages** instead of percentiles, and ignoring variance (run-to-run noise, JIT, GC).
- **Benchmarking on a laptop** with turbo boost and background apps, and then trusting a 3% difference.
- **Micro-optimising the JVM's job**: manual inlining, avoiding getters, object pooling of small objects (usually slower than allocation with modern GCs).
- **Ignoring allocation**: high allocation rates mean frequent GCs and cache misses, even if each allocation is cheap.
- **Using exceptions for control flow** in hot paths: stack-trace capture is expensive. Use return values or preallocated exceptions without stack traces.
- **Changing several things at once**, so you can't tell which change helped or hurt.

## Interview questions

**Q1. Why are hand-written benchmarks with `System.nanoTime()` unreliable?**

````reveal title="Answer"
The JIT changes the code while you measure it. Early iterations are interpreted, then C1- and C2-compiled, sometimes deoptimised. Unused results are removed as dead code, constant inputs are folded, loops are unrolled or hoisted, and GC pauses and CPU frequency changes add noise. Previous benchmarks in the same JVM also pollute the type profiles. JMH addresses these: forked JVMs, warm-up, `Blackhole`, `@State` inputs, multiple iterations with confidence intervals, and profilers like `-prof gc`.
````

**Q2. Why report p99 latency rather than the average?**

````reveal title="Answer"
Latency distributions are skewed: most requests are fast, while a few hit GC pauses, cache misses, lock contention or slow downstream calls. The average hides that tail. With many calls per user session (or fan-out to many services), nearly every user experiences the p99 or worse. SLOs therefore target percentiles (p95, p99, p99.9). Measure them with histograms, and beware of coordinated omission in load generators.
````

**Q3. Your service is slow. How do you approach it?**

````reveal title="Answer"
1. Define the symptom and goal (which endpoint, which percentile, under what load).
2. Check the metrics: CPU, GC (pause time and frequency, allocation rate), thread pools, connection pools, database latency, downstream calls.
3. Profile under load: JFR or async-profiler for CPU, allocation, locks and wall-clock time. Thread dumps show blocked threads.
4. Form a hypothesis from the dominant stack: a query, serialisation, a lock, an algorithm.
5. Fix one thing.
6. Verify with the same load test, and add monitoring so it doesn't regress.

The usual culprits are I/O round trips, missing indexes, contention, and algorithmic or allocation problems.
````

**Q4. Is `s += x` in a loop really a problem in modern Java?**

````reveal title="Answer"
Yes. Since Java 9, a single concatenation expression compiles to an efficient `invokedynamic` call (`StringConcatFactory`), but each `+=` iteration still creates a **new string containing everything so far**. The work and allocation are therefore O(n²) in the total length. A `StringBuilder` outside the loop (or `String.join`/`Collectors.joining`) appends into a growing buffer for O(n) work. For a few iterations it doesn't matter; for thousands it dominates.
````

**Q5. What does JMH's `Blackhole` do?**

````reveal title="Answer"
It "consumes" values in a way the JIT can't see through. The benchmark's results are therefore considered used, and the computation can't be removed as dead code. Returning the value from a `@Benchmark` method has the same effect for a single result. Without either, C2 may delete the measured work entirely and report near-zero times. JMH also takes care to avoid constant folding: inputs should come from `@State` fields, not literals.
````

## Hands-on exercise

A report job finds **duplicate customer emails**, ignoring case, in a list. The current code is:

```java
List<String> dups = new ArrayList<>();
for (int i = 0; i < emails.size(); i++)
    for (int j = i + 1; j < emails.size(); j++)
        if (emails.get(i).toLowerCase().equals(emails.get(j).toLowerCase()) && !dups.contains(emails.get(i).toLowerCase()))
            dups.add(emails.get(i).toLowerCase());
```

1. Count its work: instrument the number of `toLowerCase` calls for n = 1,000 and n = 2,000 to show the quadratic growth.
2. Rewrite it in O(n) with a `HashSet` (`seen`) and a `LinkedHashSet` (`dups`, keeps first-seen order), lowering each email once.
3. Check that both versions give the same result, and print the work counts.

````hint title="Hint"
Wrap lowering in a `static String lower(String s) { lowerCalls++; return s.toLowerCase(Locale.ROOT); }`. The quadratic version calls it about n² times; the linear version exactly n times. `Set.add` returns false when the element is already present, which detects a duplicate in one call.
````

````solution title="Solution"
```java title="DuplicateFinder.java" file="DuplicateFinder.java"
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public class DuplicateFinder {
    static long lowerCalls;

    static String lower(String s) {
        lowerCalls++;
        return s.toLowerCase(Locale.ROOT);
    }

    static List<String> quadratic(List<String> emails) {
        List<String> dups = new ArrayList<>();
        for (int i = 0; i < emails.size(); i++) {
            for (int j = i + 1; j < emails.size(); j++) {
                if (lower(emails.get(i)).equals(lower(emails.get(j))) && !dups.contains(lower(emails.get(i)))) {
                    dups.add(lower(emails.get(i)));
                }
            }
        }
        return dups;
    }

    static List<String> linear(List<String> emails) {
        Set<String> seen = new HashSet<>();
        Set<String> dups = new LinkedHashSet<>();
        for (String email : emails) {
            String key = lower(email);
            if (!seen.add(key)) {
                dups.add(key);
            }
        }
        return new ArrayList<>(dups);
    }

    static List<String> sample(int n) {
        List<String> emails = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            int user = i % (n - n / 20);                    // the last 5% repeat earlier users
            emails.add((i % 2 == 0 ? "User" : "user") + user + "@Example.com");
        }
        return emails;
    }

    public static void main(String[] args) {
        for (int n : new int[] { 1_000, 2_000 }) {
            List<String> emails = sample(n);
            lowerCalls = 0;
            List<String> slow = quadratic(emails);
            long slowWork = lowerCalls;
            lowerCalls = 0;
            List<String> fast = linear(emails);
            long fastWork = lowerCalls;
            System.out.printf("n=%,d: %d duplicates, same result %b, toLowerCase calls quadratic %,d vs linear %,d%n",
                    n, fast.size(), slow.equals(fast), slowWork, fastWork);
        }
        System.out.println("first duplicates: " + linear(sample(1_000)).subList(0, 3));
    }
}
```

```text title="Output" output="DuplicateFinder.java"
n=1,000: 50 duplicates, same result true, toLowerCase calls quadratic 999,100 vs linear 1,000
n=2,000: 100 duplicates, same result true, toLowerCase calls quadratic 3,998,200 vs linear 2,000
first duplicates: [user0@example.com, user1@example.com, user2@example.com]
```

Doubling `n` roughly quadrupled the quadratic version's work but only doubled the linear version's. At a million emails, that's the difference between seconds and days. Fixing the algorithm made every micro-optimisation (caching the lower-cased value, faster string comparison) irrelevant.
````

## Knowledge check

```quiz
? What is the first step before optimising a slow service?
+ Measure and profile to find where the time actually goes
- Rewrite hot loops with arrays
- Tune GC flags
> Optimise the bottleneck the profile shows, not the one you guess.

? A naive benchmark reports 0.3 ns per call for a complex computation. What is the likely cause?
+ The JIT eliminated the computation because the result was unused
- The CPU is very fast
- The method was inlined into the timing call
> Return the result or use JMH's Blackhole.

? Why does s += x in a loop over n items allocate O(n^2) bytes?
+ Each iteration copies the whole string built so far into a new String
- invokedynamic concatenation is slow
- Strings are interned
> Use a StringBuilder outside the loop.

? Which statistic best describes user-visible latency for an SLO?
+ A high percentile such as p99
- The average
- The minimum
> Tails dominate user experience.

? What does JMH's -prof gc report that is useful for optimisation?
+ Bytes allocated per operation (allocation rate)
- The number of classes loaded
- Heap dump contents
> gc.alloc.rate.norm shows allocation per benchmark operation.
```

## Key takeaways

- Performance work is a loop: **goal, measure, profile, change one thing, re-measure**. The bottleneck is usually I/O, database round trips, contention, algorithms or allocation.
- Report **percentiles** and throughput, not averages. Use load tests for systems and **JMH** for microbenchmarks (warm-up, forks, `Blackhole`, `-prof gc`).
- The biggest wins come from **algorithms and data structures** (O(n²) → O(n)), then round trips, contention and allocation, and only then JVM tuning and micro-optimisations.
- Watch the hidden costs: repeated `+=`, boxing, regex in `split`/`replaceAll`, exceptions as control flow, eager log messages.
- JFR and async-profiler (CPU, alloc, lock, wall) show where to look. Verify every change against a baseline.
