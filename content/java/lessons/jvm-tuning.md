## Concept explanation

### Tune from evidence, not folklore

The JVM's defaults (ergonomics) are good. Most "tuning" that helps in practice is a handful of decisions, made against a **goal**, with **measurements** before and after:

1. **Define the goal**: a latency SLO (p99 < 200 ms), a throughput target (records per second), a memory budget (fits in a 2 GB pod). You can't optimise "performance" in general.
2. **Measure a baseline under realistic load**: GC logs, JFR, latency percentiles, CPU, allocation rate.
3. **Change one thing**, re-measure, and keep it only if it moves the goal.
4. **Fix the application before the flags**: leaks, excessive allocation, unbounded caches and N+1 queries dwarf any GC flag.

### Heap sizing

| Flag | Meaning |
|---|---|
| `-Xmx` / `-XX:MaxHeapSize` | maximum heap |
| `-Xms` / `-XX:InitialHeapSize` | initial heap; set equal to `-Xmx` on servers to avoid resize pauses and surprises |
| `-XX:MaxRAMPercentage=75` | max heap as a percentage of available RAM; **the container-friendly way** (default 25) |
| `-XX:InitialRAMPercentage` | initial heap as a percentage (default 1.5625, i.e. 1/64) |
| `-XX:+AlwaysPreTouch` | touch every heap page at start-up: slower start, no page-fault hiccups later |

An explicit `-Xmx` beats the percentages. In **containers**, the JVM (10+, and 8u191+) reads the cgroup memory and CPU limits, so percentages adapt automatically when the pod's limits change, while a hard-coded `-Xmx` doesn't. Leave room for non-heap memory: 25–30% of the limit for typical services, more for Netty-heavy or thread-heavy ones.

How big should the heap be? Look at the **live data set**: old-generation occupancy **after** full or mixed collections in GC logs. A heap of about 3–4× the live set gives the collector room. Much smaller means frequent GCs; much bigger means longer full GCs and wasted memory.

### Collector and its few important knobs

- **Collector choice** (previous lesson) is the biggest single decision: G1 by default, ZGC for latency, Parallel for batch, Serial for tiny.
- **G1**:
  - `-XX:MaxGCPauseMillis` (default 200) is the main lever;
  - `-XX:G1HeapRegionSize` matters when many large arrays become humongous;
  - avoid fixing the young generation size (`-Xmn`, `NewRatio`), because that disables G1's pause-time adaptation.
- **ZGC**: give it headroom. `-XX:SoftMaxHeapSize` asks it to keep the heap smaller unless it really needs more.
- **Threads**: `-XX:ActiveProcessorCount`, `ParallelGCThreads` and `ConcGCThreads` matter in CPU-limited containers.

### Other memory areas

`-XX:MaxMetaspaceSize`, `-XX:ReservedCodeCacheSize`, `-XX:MaxDirectMemorySize` and `-Xss` bound the non-heap areas from the memory lessons. Setting the first three turns slow native growth into a clear error.

### GC logging (unified logging, Java 9+)

```text
-Xlog:gc*:file=/var/log/app/gc.log:time,uptime,level,tags:filecount=5,filesize=20m
```

- **What**: `gc*` selects every GC tag, which is detailed. Use `gc` for one line per GC.
- **Where**: the output, here a file.
- **Decorations**: `time,uptime,level,tags`.
- **Rotation**: 5 files of 20 MB.

It's cheap enough to leave on in production, and it's the first thing you'll want during an incident.

A typical G1 line:

```text
[12.640s][info][gc] GC(5) Pause Young (Prepare Mixed) (G1 Evacuation Pause) 160M->118M(256M) 11.870ms
      uptime                 id  pause type and cause                     before->after(heap)  duration
```

## Internal working

- **Where flag values come from**: every flag has a value and an **origin**:
  - `DEFAULT`;
  - `ERGONOMIC`, computed by the JVM from CPUs and memory;
  - command line (reported as `VM_CREATION` by the management API);
  - `MANAGEMENT`, changed at run time for manageable flags.

  Inspect them with:
  - `java -XX:+PrintFlagsFinal -version`, which lists every flag with its origin;
  - `java -XX:+PrintCommandLineFlags -version`;
  - `java -XshowSettings:vm -version`;
  - on a live process, `jcmd <pid> VM.flags`, `jcmd <pid> VM.command_line` or `jinfo -flags <pid>`.
- **Container detection** reads cgroup v1 or v2 limits at start-up (Linux, `-XX:+UseContainerSupport`, on by default). `MaxRAM` defaults to the container limit, CPU quotas become `availableProcessors()`, and all ergonomic decisions follow from these. `-XX:ActiveProcessorCount=N` overrides the CPU count, which is useful when quotas are fractional or you want a predictable thread count.
- **Ergonomic sizing**:
  - max heap = `MaxRAMPercentage` of RAM;
  - initial heap = `InitialRAMPercentage` of RAM;
  - for very small RAM (below about 250 MB) `MinRAMPercentage` applies instead, a confusingly named flag that sets the *max* heap on small machines.
- **Some flags are manageable at run time** (`jcmd <pid> VM.set_flag`, for example `HeapDumpOnOutOfMemoryError`), and **unified logging can be reconfigured live**: `jcmd <pid> VM.log output=gc.log what=gc*`. You can turn on GC logging on a running process without restarting it.
- **Start-up tuning** is a separate concern:
  - CDS archives (`-XX:ArchiveClassesAtExit`, then `-XX:SharedArchiveFile`);
  - Java 24/25's AOT cache (`-XX:AOTCache`);
  - `-XX:TieredStopAtLevel=1` for short-lived JVMs;
  - GraalVM native image.
- **The cost of over-tuning**: every non-default flag is a decision someone must revisit on the next JDK upgrade. Flags removed in newer releases (CMS, `MaxPermSize`, `ZGenerational`) make the JVM refuse to start, or print warnings. Prefer goals (`MaxGCPauseMillis`, `MaxRAMPercentage`) over mechanisms (`-Xmn`, `SurvivorRatio`, `MaxTenuringThreshold`).

## Visual representation

```text title="A measurement-first tuning loop"
     +-------------------+      +--------------------------+      +------------------------------+
     | goal: p99, thpt,  | ---> | baseline under real load | ---> | read evidence: GC log, JFR,  |
     | memory budget     |      | (same traffic, same box) |      | heap after GC, alloc rate    |
     +-------------------+      +--------------------------+      +--------------+---------------+
              ^                                                                   |
              |        +-------------------------------+        +----------------v---------------+
              +------- | keep only if the goal moved;  | <----- | change ONE thing: app code     |
                       | record why the flag exists    |        | first, then heap, collector,   |
                       +-------------------------------+        | pause target                   |
                                                                +--------------------------------+

  container memory limit (e.g. 2 GiB)
  [ heap = 70-75% via MaxRAMPercentage ][ metaspace | code cache | stacks | direct | GC/JIT | libs ]
```

## Java code example

The program starts child JVMs that simulate a 2 GB container (`-XX:MaxRAM=2g`) with different heap flags, and reports the **effective** values and where each came from. It then runs a short workload with unified GC logging to a file and reads the log back.

```java title="TuningLab.java" file="TuningLab.java"
import com.sun.management.HotSpotDiagnosticMXBean;
import java.lang.management.ManagementFactory;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

public class TuningLab {
    public static void main(String[] args) throws Exception {
        if (args.length == 1 && args[0].equals("flags")) {
            HotSpotDiagnosticMXBean vm = ManagementFactory.getPlatformMXBean(HotSpotDiagnosticMXBean.class);
            for (String name : List.of("MaxHeapSize", "InitialHeapSize")) {
                var option = vm.getVMOption(name);
                System.out.printf("   %-16s %6d MB  (%s)%n", name, Long.parseLong(option.getValue()) / (1024 * 1024),
                        option.getOrigin() == com.sun.management.VMOption.Origin.VM_CREATION ? "command line" : option.getOrigin().toString().toLowerCase());
            }
            return;
        }
        if (args.length == 1 && args[0].equals("work")) {
            long sum = 0;
            for (int i = 0; i < 100_000; i++) {
                byte[] temporary = new byte[1024];
                sum += temporary.length;
            }
            System.gc();
            System.out.println(sum);
            return;
        }

        String[][] configs = {
                {"-XX:MaxRAM=2g"},
                {"-XX:MaxRAM=2g", "-XX:MaxRAMPercentage=75", "-XX:InitialRAMPercentage=50"},
                {"-XX:MaxRAM=2g", "-Xms1g", "-Xmx1g"},
                {"-XX:MaxRAM=2g", "-Xmx3g"},
        };
        for (String[] config : configs) {
            System.out.println(String.join(" ", config));
            run(List.of(config), "flags").forEach(System.out::println);
        }

        Path dir = Files.createTempDirectory("gclogs");
        Path log = dir.resolve("gc.log");             // must not exist yet: existing files get rotated
        run(List.of("-XX:+UseSerialGC", "-Xmx32m", "-Xmn8m", "-Xlog:gc:file=" + log), "work");
        List<String> lines = Files.readAllLines(log);
        try (var files = Files.list(dir)) {
            for (Path f : files.toList()) {
                Files.delete(f);
            }
        }
        Files.delete(dir);
        long young = lines.stream().filter(l -> l.contains("Pause Young")).count();
        long full = lines.stream().filter(l -> l.contains("Pause Full")).count();
        System.out.println("GC log: " + lines.get(0).replaceAll("^\\[[^]]*]", "[<uptime>]"));
        System.out.println("   young pauses recorded: " + (young > 0) + ", full pauses: " + full + " (the explicit System.gc())");
        String sample = lines.stream().filter(l -> l.contains("Pause Young")).findFirst().orElseThrow();
        System.out.println("   line shape: " + sample.replaceAll("^\\[[^]]*]", "[<uptime>]").replaceAll("\\d+(\\.\\d+)?", "n"));
    }

    static List<String> run(List<String> flags, String mode) throws Exception {
        List<String> command = new ArrayList<>();
        command.add(Path.of(System.getProperty("java.home"), "bin", "java").toString());
        command.add("-XX:ActiveProcessorCount=2");
        command.addAll(flags);
        command.addAll(List.of("-cp", System.getProperty("java.class.path"), "TuningLab", mode));
        Process p = new ProcessBuilder(command).redirectErrorStream(true).start();
        List<String> out = new String(p.getInputStream().readAllBytes()).lines().toList();
        p.waitFor();
        return out;
    }
}
```

## Output

```text title="Output" output="TuningLab.java"
-XX:MaxRAM=2g
   MaxHeapSize         512 MB  (ergonomic)
   InitialHeapSize      32 MB  (ergonomic)
-XX:MaxRAM=2g -XX:MaxRAMPercentage=75 -XX:InitialRAMPercentage=50
   MaxHeapSize        1536 MB  (ergonomic)
   InitialHeapSize    1024 MB  (ergonomic)
-XX:MaxRAM=2g -Xms1g -Xmx1g
   MaxHeapSize        1024 MB  (command line)
   InitialHeapSize    1024 MB  (command line)
-XX:MaxRAM=2g -Xmx3g
   MaxHeapSize        3072 MB  (command line)
   InitialHeapSize      32 MB  (ergonomic)
GC log: [<uptime>][info][gc] Using Serial
   young pauses recorded: true, full pauses: 1 (the explicit System.gc())
   line shape: [<uptime>][info][gc] GC(n) Pause Young (Allocation Failure) nM->nM(nM) nms
```

- In a 2 GB "container" with no heap flags, ergonomics gave a **512 MB** max heap (25%) and a 32 MB initial heap. That's often too conservative for a dedicated service container.
- `MaxRAMPercentage=75` and `InitialRAMPercentage=50` scaled the heap with the limit: 1.5 GB max, 1 GB initial. Change the pod's memory and the heap follows.
- `-Xms1g -Xmx1g` fixed the heap regardless of the container. `-Xmx3g` *exceeded* the 2 GB container, which the JVM allowed; in a real pod, that's how you get OOMKilled.
- The unified GC log recorded the collector in use and one line per pause. Normalising the numbers shows the stable shape you can parse: id, pause type, cause, before → after (heap), duration.

## Real-world application

- **A typical modern service** sets `-XX:MaxRAMPercentage=70`, GC logging to a rotating file, `-XX:+HeapDumpOnOutOfMemoryError` and `-XX:+ExitOnOutOfMemoryError`, plus `JAVA_TOOL_OPTIONS` in the container image. Everything else stays at the defaults until evidence says otherwise.
- **Latency regressions after a deploy**: compare GC logs before and after (pause frequency, duration, after-GC occupancy). Tools such as GCeasy or GCViewer chart them. A rising after-GC baseline points to a leak, not a tuning problem.
- **Cost optimisation**: right-sizing heaps and CPU limits across hundreds of pods is real money, and the live-set measurement (after-GC occupancy) tells you how small you can go.
- **Start-up-sensitive workloads** (autoscaling, serverless, CLI tools) tune differently: CDS or AOT caches, `TieredStopAtLevel=1`, smaller heaps, Serial GC.
- **JDK upgrades** come with a flag audit: remove obsolete flags and re-measure, because defaults improve in every release.

## Common mistakes

- **Copy-pasting a "fast JVM flags" list** from a blog post: obsolete flags, conflicting settings, no measurement.
- **Setting `-Xmn`, `NewRatio` or `SurvivorRatio` with G1**, which overrides its adaptive sizing and breaks the pause target.
- **`-Xmx` equal to the container limit**, or a hard-coded `-Xmx` that doesn't follow pod resizing.
- **Tuning GC to hide a leak or excessive allocation.** Check the allocation rate (JFR) and the after-GC trend first.
- **Changing several flags at once**: you can't tell which helped or hurt.
- **No GC logs in production**: during an incident you have nothing to analyse, and turning logs on later misses the event (though `jcmd VM.log` can help).
- **Benchmarking tuning changes on a laptop** with different CPU counts, memory and load than production.

## Interview questions

**Q1. How would you size the heap for a Java service in Kubernetes?**

````reveal title="Answer"
Use percentage-based sizing so the heap follows the container limit: `-XX:MaxRAMPercentage` (often 60–75), plus an `-XX:InitialRAMPercentage` close to it to avoid resizing. Leave the rest for Metaspace, code cache, thread stacks, direct buffers and GC/JIT overhead. Then validate with GC logs: the old generation's occupancy after GC (the live set) should be a fraction of the heap, about a quarter to a third. Adjust the limit, the percentage, or the application's memory use accordingly. Avoid a hard-coded `-Xmx` that equals or exceeds the limit.
````

**Q2. What does `-Xms` equal to `-Xmx` achieve?**

````reveal title="Answer"
The heap is committed at its full size from the start, so the JVM never pauses to grow or shrink it, and capacity problems appear immediately instead of under load. It makes memory use predictable for capacity planning. The costs are higher initial footprint and, without `-XX:+AlwaysPreTouch`, page faults as the heap is first touched. It's the common choice for servers and containers; desktop apps benefit from a smaller initial heap.
````

**Q3. How do you enable and read GC logs?**

````reveal title="Answer"
Since Java 9, with unified logging: `-Xlog:gc*:file=gc.log:time,uptime,level,tags:filecount=5,filesize=20m`. You can also enable it at run time with `jcmd <pid> VM.log`. Each pause line shows the GC id, the pause type and cause (`Pause Young (Normal) (G1 Evacuation Pause)`, `Pause Full (Allocation Failure)`), heap occupancy before → after (capacity), and the duration. Analyse the frequency, the maximum and percentile pauses, the share of time spent in GC, the after-GC trend (leaks), and any full GCs. GCeasy and GCViewer visualise this.
````

**Q4. What's your approach to GC tuning?**

````reveal title="Answer"
1. Define a measurable goal: p99 latency, throughput or memory.
2. Measure a baseline under realistic load with GC logs, JFR and application metrics.
3. Fix application causes first: leaks, allocation hot spots, oversized caches, unbounded results.
4. Size the heap from the live set.
5. Choose the collector that matches the goal: G1 balanced, ZGC low latency, Parallel throughput.
6. Adjust its main goal-oriented knob (`MaxGCPauseMillis`, headroom).
7. Change one thing at a time, keep only what helps, and document why each flag exists.
````

**Q5. How can you see the JVM flags a running process is actually using?**

````reveal title="Answer"
- `jcmd <pid> VM.flags`: all non-default flags, including ergonomic ones;
- `jcmd <pid> VM.command_line` (or `jinfo -flags <pid>`);
- `-XX:+PrintFlagsFinal` at start-up for every flag and its origin;
- `-XX:+PrintCommandLineFlags`;
- `-XshowSettings:vm`;
- in code, `HotSpotDiagnosticMXBean.getVMOption(name)` gives the value and its origin (default, ergonomic, command line, management).
````

## Hands-on exercise

Write a **GC log analyser** for unified-logging G1 output. Given the log below (as a text block), report:
- the number of pauses per pause type (ignore the "Concurrent Mark Cycle" lines, which aren't pauses);
- the total, average and maximum pause time, and which GC id had the maximum;
- the share of wall-clock time spent paused (total pause ÷ the last timestamp);
- the heap occupancy **after** each young or mixed pause, to spot a rising trend;
- a warning for every `Pause Full`.

```text
[2.105s][info][gc] GC(0) Pause Young (Normal) (G1 Evacuation Pause) 24M->4M(256M) 5.211ms
[4.880s][info][gc] GC(1) Pause Young (Normal) (G1 Evacuation Pause) 52M->9M(256M) 7.940ms
[7.312s][info][gc] GC(2) Pause Young (Normal) (G1 Evacuation Pause) 61M->18M(256M) 9.105ms
[9.950s][info][gc] GC(3) Pause Young (Concurrent Start) (G1 Evacuation Pause) 140M->96M(256M) 12.402ms
[9.951s][info][gc] GC(4) Concurrent Mark Cycle
[10.120s][info][gc] GC(4) Pause Remark 104M->101M(256M) 3.044ms
[10.205s][info][gc] GC(4) Pause Cleanup 101M->101M(256M) 0.210ms
[10.230s][info][gc] GC(4) Concurrent Mark Cycle 279.112ms
[12.640s][info][gc] GC(5) Pause Young (Prepare Mixed) (G1 Evacuation Pause) 160M->118M(256M) 11.870ms
[14.002s][info][gc] GC(6) Pause Young (Mixed) (G1 Evacuation Pause) 170M->92M(256M) 18.335ms
[16.418s][info][gc] GC(7) Pause Young (Normal) (G1 Evacuation Pause) 150M->110M(256M) 10.006ms
[19.770s][info][gc] GC(8) Pause Full (G1 Compaction Pause) 250M->180M(256M) 412.551ms
```

````hint title="Hint"
One regular expression covers the pause lines: `\[(\d+\.\d+)s\].*GC\((\d+)\) (Pause [A-Za-z]+(?: \([A-Za-z ]+\))?).* (\d+)M->(\d+)M\((\d+)M\) (\d+\.\d+)ms`. Group 3 gives types like `Pause Young (Normal)` or `Pause Remark`. Use a `LinkedHashMap` for counts, and a `DoubleSummaryStatistics` for the durations.
````

````solution title="Solution"
```java title="GcLogAnalyzer.java" file="GcLogAnalyzer.java"
import java.util.ArrayList;
import java.util.DoubleSummaryStatistics;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class GcLogAnalyzer {
    static final String LOG = """
            [2.105s][info][gc] GC(0) Pause Young (Normal) (G1 Evacuation Pause) 24M->4M(256M) 5.211ms
            [4.880s][info][gc] GC(1) Pause Young (Normal) (G1 Evacuation Pause) 52M->9M(256M) 7.940ms
            [7.312s][info][gc] GC(2) Pause Young (Normal) (G1 Evacuation Pause) 61M->18M(256M) 9.105ms
            [9.950s][info][gc] GC(3) Pause Young (Concurrent Start) (G1 Evacuation Pause) 140M->96M(256M) 12.402ms
            [9.951s][info][gc] GC(4) Concurrent Mark Cycle
            [10.120s][info][gc] GC(4) Pause Remark 104M->101M(256M) 3.044ms
            [10.205s][info][gc] GC(4) Pause Cleanup 101M->101M(256M) 0.210ms
            [10.230s][info][gc] GC(4) Concurrent Mark Cycle 279.112ms
            [12.640s][info][gc] GC(5) Pause Young (Prepare Mixed) (G1 Evacuation Pause) 160M->118M(256M) 11.870ms
            [14.002s][info][gc] GC(6) Pause Young (Mixed) (G1 Evacuation Pause) 170M->92M(256M) 18.335ms
            [16.418s][info][gc] GC(7) Pause Young (Normal) (G1 Evacuation Pause) 150M->110M(256M) 10.006ms
            [19.770s][info][gc] GC(8) Pause Full (G1 Compaction Pause) 250M->180M(256M) 412.551ms
            """;

    static final Pattern PAUSE = Pattern.compile(
            "\\[(\\d+\\.\\d+)s].*GC\\((\\d+)\\) (Pause [A-Za-z]+(?: \\([A-Za-z ]+\\))?).* (\\d+)M->(\\d+)M\\((\\d+)M\\) (\\d+\\.\\d+)ms");

    public static void main(String[] args) {
        Map<String, Integer> byType = new LinkedHashMap<>();
        DoubleSummaryStatistics pauses = new DoubleSummaryStatistics();
        List<Integer> afterYoung = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        String maxId = "";
        double lastTimestamp = 0;

        for (String line : LOG.lines().toList()) {
            Matcher m = PAUSE.matcher(line);
            if (!m.matches()) {
                continue;                                         // concurrent phases are not pauses
            }
            String type = m.group(3);
            double ms = Double.parseDouble(m.group(7));
            lastTimestamp = Double.parseDouble(m.group(1));
            byType.merge(type, 1, Integer::sum);
            if (ms > pauses.getMax()) {
                maxId = "GC(" + m.group(2) + ")";
            }
            pauses.accept(ms);
            if (type.startsWith("Pause Young")) {
                afterYoung.add(Integer.parseInt(m.group(5)));
            }
            if (type.startsWith("Pause Full")) {
                warnings.add("WARNING GC(" + m.group(2) + ") full GC at " + m.group(1) + "s: " + m.group(4) + "M->" + m.group(5)
                        + "M of " + m.group(6) + "M, " + ms + " ms - the concurrent cycle could not keep up");
            }
        }

        byType.forEach((type, n) -> System.out.printf("%-30s %d%n", type, n));
        System.out.printf("pauses %d, total %.1f ms, avg %.1f ms, max %.1f ms (%s)%n",
                pauses.getCount(), pauses.getSum(), pauses.getAverage(), pauses.getMax(), maxId);
        System.out.printf("time paused: %.2f%% of %.1f s%n", 100 * pauses.getSum() / (lastTimestamp * 1000), lastTimestamp);
        System.out.println("heap after young/mixed pauses (MB): " + afterYoung);
        warnings.forEach(System.out::println);
    }
}
```

```text title="Output" output="GcLogAnalyzer.java"
Pause Young (Normal)           4
Pause Young (Concurrent Start) 1
Pause Remark                   1
Pause Cleanup                  1
Pause Young (Prepare Mixed)    1
Pause Young (Mixed)            1
Pause Full                     1
pauses 10, total 490.7 ms, avg 49.1 ms, max 412.6 ms (GC(8))
time paused: 2.48% of 19.8 s
heap after young/mixed pauses (MB): [4, 9, 18, 96, 118, 92, 110]
WARNING GC(8) full GC at 19.770s: 250M->180M of 256M, 412.551 ms - the concurrent cycle could not keep up
```

- The full GC took over 400 ms, more than all the other pauses combined, and dominates the average, which is why **maximum and percentile pauses matter more than averages**.
- The after-GC occupancy climbed from 4 MB to over 100 MB, and the mixed collection only briefly brought it down. Together with the full GC, that's the signature of a **growing live set**: a leak, or a heap too small for the workload. Investigate with a heap dump before touching GC flags.
````

## Knowledge check

```quiz
? A container has a 2 GB limit and no heap flags. What max heap does the JVM choose by default?
+ About 512 MB (25% of RAM)
- 2 GB
- 1 GB
> MaxRAMPercentage defaults to 25.

? Which flag makes the heap follow the container's memory limit?
+ -XX:MaxRAMPercentage
- -Xmn
- -XX:MaxTenuringThreshold
> Percentages adapt when the limit changes; a fixed -Xmx doesn't.

? Why avoid setting -Xmn with G1?
+ It fixes the young generation size and defeats G1's pause-time adaptation
- G1 ignores -Xmn
- It disables concurrent marking
> G1 resizes the young generation to meet MaxGCPauseMillis.

? Which command shows the flags of a running JVM?
+ jcmd <pid> VM.flags
- java -version
- javac -XX:+PrintFlagsFinal
> jcmd also offers VM.command_line and VM.log.

? In a G1 log line "160M->118M(256M) 11.870ms", what is 118M?
+ Heap occupancy after the pause
- The amount of memory freed
- The young generation size
> The format is before->after(total capacity), then the pause duration.
```

## Key takeaways

- Tuning is a loop: **goal → baseline → one change → measure → keep or revert**. Fix leaks and allocation first.
- Size the heap from the **live set** (after-GC occupancy ×3–4). In containers use **`MaxRAMPercentage`** (and `InitialRAMPercentage`); keep 25–30% for non-heap; on servers use `-Xms` = `-Xmx` (or equal percentages).
- Choose the collector to fit the goal, and prefer goal flags (`MaxGCPauseMillis`) over mechanism flags (`-Xmn`, ratios).
- Keep **unified GC logging** on (`-Xlog:gc*:file=…` with rotation). Read pause types, before→after, durations, full GCs and after-GC trends.
- Inspect effective settings with `jcmd VM.flags`, `-XX:+PrintFlagsFinal` and `-XshowSettings:vm`; audit flags on every JDK upgrade.
