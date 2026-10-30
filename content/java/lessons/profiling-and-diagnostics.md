## Concept explanation

When a Java service is slow, hot or growing, the JDK ships everything needed to find out why, usually without a restart.

### The toolbox

| Tool | Use it for |
|---|---|
| **`jcmd`** | the Swiss-army knife. `jcmd` lists JVMs; `jcmd <pid> help` lists commands. Key ones: `Thread.print`, `GC.heap_dump`, `GC.class_histogram`, `GC.heap_info`, `VM.flags`, `VM.native_memory`, `VM.log`, `JFR.start/dump/stop`, `Compiler.codecache` |
| **JDK Flight Recorder (JFR)** | continuous, low-overhead (~1%) recording of events: CPU samples, allocations, GC, locks, I/O, exceptions, class loading. Start it with `-XX:StartFlightRecording` or `jcmd <pid> JFR.start`. Analyse in **JDK Mission Control** or with `jfr print` |
| `jstack <pid>` | thread dump (same as `jcmd Thread.print`) |
| `jmap -dump` / `-histo` | heap dump / class histogram (prefer `jcmd`) |
| `jstat -gcutil <pid> 1s` | live GC statistics: generation occupancy %, GC counts and times |
| `jinfo`, `jps` | flags and properties; list JVMs |
| **VisualVM**, JConsole | GUI monitoring and quick profiling over JMX |
| **async-profiler** (external) | CPU, allocation, lock and wall-clock profiling as **flame graphs**, without safepoint bias |
| **Eclipse MAT** (external) | heap dump analysis: dominator tree, leak suspects, paths to GC roots |

### Thread dumps

A thread dump is a snapshot of every thread's **stack** and **state**:

| State | Meaning | Typical stack top |
|---|---|---|
| `RUNNABLE` | running *or* blocked in native I/O (the JVM can't tell) | your code, or `socketRead0` / `epollWait` |
| `BLOCKED` | waiting to **enter** a `synchronized` block held by another thread | `- waiting to lock <0x…>` |
| `WAITING` | waiting indefinitely: `Object.wait()`, `LockSupport.park()`, `Thread.join()` | `parking to wait for <0x…> (a …ReentrantLock$NonfairSync)` |
| `TIMED_WAITING` | the same with a timeout, or `Thread.sleep` | `sleep`, `parkNanos` |

Read thread dumps in **series**: take 3 dumps 5–10 s apart. A thread stuck in the same frame in all of them is the problem; one that moves is just busy. Look for:
- **lock chains**: many `BLOCKED` threads waiting for one lock held by a slow thread;
- **deadlocks**: the JVM detects monitor and `java.util.concurrent` lock cycles and prints `Found one Java-level deadlock`;
- **pool exhaustion**: every worker in `WAITING` inside `HikariPool.getConnection` or a queue's `take()`.

### Heap dumps and histograms

- **`GC.class_histogram`**: instances and bytes per class, cheap enough to run on a live system. It triggers a full GC first, unless you pass `-all`.
- **`GC.heap_dump`**: a full `.hprof` snapshot for MAT. It pauses the JVM, is as large as the live heap, and **contains your data**, including passwords, tokens and PII, so handle it like a production database backup.

### Three playbooks

| Symptom | Steps |
|---|---|
| **High CPU** | 1. Is it GC? Check GC logs and `jstat`; busy GC threads mean a memory problem. 2. Otherwise profile: JFR (`jdk.ExecutionSample`) or async-profiler, then read the flame graph. 3. Without a profiler: `top -H -p <pid>` shows the hottest thread id; convert it to hex and find `nid=0x…` in a thread dump. |
| **Memory growth / OOM** | 1. GC log: does old-gen occupancy after GC rise (a leak) or only spike? 2. Two class histograms or heap dumps minutes apart; diff them. 3. MAT: dominator tree → path to GC roots. 4. Process RSS growing but heap flat: native memory (`VM.native_memory`, direct buffers, thread count). |
| **Hang / slow requests** | 1. Three thread dumps. 2. Deadlock reported? Lock chains? All workers waiting on a pool? 3. JFR lock events (`JavaMonitorEnter`, `ThreadPark`) and I/O events (`SocketRead`) show where time goes. |

## Internal working

- **How the tools reach the JVM**: `jcmd`, `jstack` and friends use the **Attach API**. On Linux they create `.attach_pid<pid>` and send `SIGQUIT`; the JVM's *Attach Listener* thread then opens a Unix socket. The tools must run as the same OS user, and in containers you run them *inside* the container (`kubectl exec`). Everything is also exposed over JMX: the **`DiagnosticCommand` MBean** executes `jcmd` commands, which is how monitoring agents and the code below do it. `kill -3 <pid>` prints a thread dump to the process's stdout.
- **Thread dumps need a safepoint**, so taking one pauses the JVM briefly. Deadlock detection follows `ObjectMonitor` owners and `AbstractOwnableSynchronizer` owners.
- **JFR**:
  - Events are written to thread-local buffers, then to global buffers and chunk files on disk, with very low overhead.
  - CPU sampling uses OS signals at fixed intervals, so it isn't limited to safepoints. Java 25 adds CPU-time sampling on Linux.
  - Settings files (`default` ~1% overhead, `profile` ~2%) choose which events and thresholds to record.
  - You can define **custom events** (subclass `jdk.jfr.Event`) for business-level timings.
  - `RecordingStream` (Java 14) consumes events live, for in-process monitoring.
- **Safepoint bias**: classic profilers (including JMX-based samplers and `Thread.getAllStackTraces`) only see threads at safepoints, so tight loops look invisible and their callers get blamed. JFR and async-profiler sample asynchronously.
- **Heap dumps** are produced at a safepoint by walking the heap. `-XX:+HeapDumpOnOutOfMemoryError` writes one automatically, and `GC.heap_dump -gz=1` compresses it (Java 15+).
- **Native Memory Tracking** (`-XX:NativeMemoryTracking=summary|detail`, 5–10% overhead) breaks non-heap memory into categories: Java heap, class, thread, code, GC, internal, symbol. `jcmd VM.native_memory baseline` and `summary.diff` find native growth.

## Visual representation

```text title="From symptom to evidence"
   symptom            first look                      evidence to capture              analyse with
   ---------------    ---------------------------     -----------------------------    ---------------------------
   high CPU      ->   GC log / jstat (is it GC?)  ->  JFR or async-profiler 60 s   ->  flame graph: widest frames
   memory grows  ->   old gen after GC trend      ->  2 histograms / heap dumps    ->  MAT dominators, GC root path
   RSS grows,         heap flat                   ->  NMT baseline + diff          ->  thread / direct / metaspace
   heap flat
   hang / slow   ->   thread dump x3, 5-10 s apart -> deadlock? BLOCKED chains?    ->  lock owner's stack, pool waits
                                                     JFR lock + I/O events

   thread dump excerpt:
   "worker-7" #42 ... waiting for monitor entry
      java.lang.Thread.State: BLOCKED (on object monitor)
       at com.shop.Inventory.reserve(Inventory.java:57)
       - waiting to lock <0x00000007ff2b1c40> (a com.shop.Inventory)   <- who holds 0x...1c40?
   "worker-3" #38 ... runnable
       at java.net.SocketInputStream.socketRead0(Native Method)        <- holding the lock during slow I/O
       - locked <0x00000007ff2b1c40> (a com.shop.Inventory)
```

## Java code example

The diagnostics are driven from inside the JVM: the same data `jcmd`, `jstack` and JFR provide, through the management API.

```java title="Diagnostics.java" file="Diagnostics.java" run="-XX:+UseSerialGC"
import java.lang.management.ManagementFactory;
import java.lang.management.ThreadInfo;
import java.lang.management.ThreadMXBean;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;
import java.util.concurrent.CountDownLatch;
import javax.management.ObjectName;
import jdk.jfr.Event;
import jdk.jfr.Label;
import jdk.jfr.Name;
import jdk.jfr.Recording;
import jdk.jfr.consumer.RecordedEvent;
import jdk.jfr.consumer.RecordingFile;

public class Diagnostics {
    record Order(long id, int quantity) { }

    static final List<Order> OPEN_ORDERS = new ArrayList<>();

    @Name("shop.OrderProcessed")
    @Label("Order processed")
    static class OrderProcessed extends Event {
        @Label("Order id")
        long orderId;
    }

    // Runs a jcmd command through the DiagnosticCommand MBean
    static String jcmd(String operation, String... args) throws Exception {
        return (String) ManagementFactory.getPlatformMBeanServer().invoke(
                new ObjectName("com.sun.management:type=DiagnosticCommand"), operation,
                new Object[] {args}, new String[] {String[].class.getName()});
    }

    static Thread daemon(String name, Runnable body) {
        Thread t = new Thread(body, name);
        t.setDaemon(true);
        return t;
    }

    static void pause(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    public static void main(String[] args) throws Exception {
        ThreadMXBean threads = ManagementFactory.getThreadMXBean();

        // 1. Thread states, as a thread dump shows them
        Object monitor = new Object();
        Object contended = new Object();
        CountDownLatch ready = new CountDownLatch(3);
        Thread sleeper = daemon("sleeper", () -> { ready.countDown(); pause(60_000); });
        Thread waiter = daemon("waiter", () -> {
            synchronized (monitor) {
                ready.countDown();
                try {
                    monitor.wait();                                   // releases the monitor while waiting
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
        });
        Thread holder = daemon("holder", () -> {
            synchronized (contended) {
                ready.countDown();
                pause(60_000);                                        // holds the lock while "doing slow I/O"
            }
        });
        Thread blocked = daemon("blocked", () -> {
            synchronized (contended) {
                System.out.println("never reached");
            }
        });
        sleeper.start();
        waiter.start();
        holder.start();
        ready.await();
        blocked.start();
        while (blocked.getState() != Thread.State.BLOCKED || waiter.getState() != Thread.State.WAITING
                || holder.getState() != Thread.State.TIMED_WAITING) {
            Thread.sleep(10);
        }
        for (Thread t : List.of(sleeper, waiter, holder, blocked)) {
            ThreadInfo info = threads.getThreadInfo(new long[] {t.getId()}, true, true)[0];
            System.out.printf("%-8s %-13s top=%-14s locks held=%d%s%n", info.getThreadName(), info.getThreadState(),
                    info.getStackTrace()[0].getMethodName(), info.getLockedMonitors().length,
                    info.getLockOwnerName() == null ? "" : "  waiting for a lock held by " + info.getLockOwnerName());
        }

        // 2. Deadlock detection (what jstack prints as "Found one Java-level deadlock")
        Object accountA = new Object();
        Object accountB = new Object();
        CountDownLatch bothLocked = new CountDownLatch(2);
        daemon("transfer-A-to-B", () -> {
            synchronized (accountA) {
                bothLocked.countDown();
                awaitQuietly(bothLocked);
                synchronized (accountB) {
                    System.out.println("never reached");
                }
            }
        }).start();
        daemon("transfer-B-to-A", () -> {
            synchronized (accountB) {
                bothLocked.countDown();
                awaitQuietly(bothLocked);
                synchronized (accountA) {
                    System.out.println("never reached");
                }
            }
        }).start();
        long[] deadlocked = null;
        while (deadlocked == null) {
            Thread.sleep(20);
            deadlocked = threads.findDeadlockedThreads();
        }
        TreeSet<String> cycle = new TreeSet<>();
        for (ThreadInfo info : threads.getThreadInfo(deadlocked)) {
            cycle.add(info.getThreadName() + " waits for " + info.getLockOwnerName());
        }
        System.out.println("deadlock: " + cycle);
        System.out.println("Thread.print reports it: " + jcmd("threadPrint").contains("Found one Java-level deadlock"));

        // 3. Class histogram (jcmd GC.class_histogram)
        for (int i = 0; i < 10_000; i++) {
            OPEN_ORDERS.add(new Order(i, i % 5));
        }
        jcmd("gcClassHistogram").lines().filter(l -> l.endsWith("Diagnostics$Order")).forEach(line -> {
            String[] cols = line.trim().split("\\s+");
            System.out.println("histogram: " + cols[1] + " instances, " + cols[2] + " bytes of Diagnostics$Order");
        });

        // 4. Heap dump (jcmd GC.heap_dump)
        Path dump = Files.createTempDirectory("diag").resolve("heap.hprof");
        ManagementFactory.getPlatformMXBean(com.sun.management.HotSpotDiagnosticMXBean.class).dumpHeap(dump.toString(), true);
        System.out.println("heap dump written: " + (Files.size(dump) > 0) + " (it contains every live object, including secrets)");
        Files.delete(dump);
        Files.delete(dump.getParent());

        // 5. JDK Flight Recorder with a custom business event
        Path jfr = Files.createTempFile("orders", ".jfr");
        try (Recording recording = new Recording()) {
            recording.enable("shop.OrderProcessed");
            recording.enable("jdk.GarbageCollection");
            recording.start();
            for (Order order : OPEN_ORDERS.subList(0, 5)) {
                OrderProcessed event = new OrderProcessed();
                event.begin();
                event.orderId = order.id();
                event.commit();
            }
            System.gc();
            recording.stop();
            recording.dump(jfr);
        }
        List<Long> ids = new ArrayList<>();
        boolean sawGc = false;
        for (RecordedEvent event : RecordingFile.readAllEvents(jfr)) {
            if (event.getEventType().getName().equals("shop.OrderProcessed")) {
                ids.add(event.getLong("orderId"));
            }
            sawGc |= event.getEventType().getName().equals("jdk.GarbageCollection");
        }
        Files.delete(jfr);
        System.out.println("JFR: " + ids.size() + " OrderProcessed events " + ids + ", GC events recorded: " + sawGc);
    }

    static void awaitQuietly(CountDownLatch latch) {
        try {
            latch.await();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
```

## Output

```text title="Output" output="Diagnostics.java"
sleeper  TIMED_WAITING top=sleep          locks held=0
waiter   WAITING       top=wait           locks held=0
holder   TIMED_WAITING top=sleep          locks held=1
blocked  BLOCKED       top=lambda$main$3  locks held=0  waiting for a lock held by holder
deadlock: [transfer-A-to-B waits for transfer-B-to-A, transfer-B-to-A waits for transfer-A-to-B]
Thread.print reports it: true
histogram: 10000 instances, 240000 bytes of Diagnostics$Order
heap dump written: true (it contains every live object, including secrets)
JFR: 5 OrderProcessed events [0, 1, 2, 3, 4], GC events recorded: true
```

- The four classic states:
  - `sleeper` is `TIMED_WAITING` in `sleep`.
  - `waiter` is `WAITING` in `Object.wait()`, holding **no** lock, because `wait` releases it.
  - `holder` sleeps *while holding* a lock.
  - `blocked` is `BLOCKED` waiting for that lock, and the dump names `holder` as the owner. In production this pattern ("lock held during slow I/O") explains many latency spikes.
- The JVM found the lock cycle between the two transfer threads; `Thread.print` reports it like `jstack` does.
- The class histogram counted exactly the 10,000 live `Order` records: 24 bytes each, matching the layout lesson.
- The JFR recording captured five custom business events, alongside the JVM's own GC events, in one file you can open in JDK Mission Control.

## Real-world application

- **Always-on JFR**: many teams run `-XX:StartFlightRecording=maxage=30m,maxsize=500m,filename=/var/rec,dumponexit=true` in production. When an incident happens, `jcmd <pid> JFR.dump` captures the last 30 minutes for free.
- **Kubernetes**: `kubectl exec <pod> -- jcmd 1 Thread.print`, heap dumps written to a mounted volume, and JFR files copied out with `kubectl cp`. Profiling sidecars and agents (async-profiler, Pyroscope, Datadog) give continuous flame graphs.
- **Latency incidents**:
  - three thread dumps typically reveal "200 Tomcat threads waiting for a HikariCP connection" or "everything BLOCKED behind one synchronised cache refresh";
  - JFR's `SocketRead` events show the slow downstream call.
- **Memory incidents**: `GC.class_histogram` comparisons pinpoint the growing class within minutes; MAT on a heap dump shows who holds it.
- **Business telemetry**: custom JFR events (checkout duration, cache misses) cost almost nothing and correlate with GC and CPU on one timeline.

## Common mistakes

- **Reading one thread dump** and drawing conclusions. Take several, a few seconds apart.
- **Treating `RUNNABLE` as "using CPU"**: threads blocked in socket reads are `RUNNABLE` too. Check the top frames.
- **Taking heap dumps carelessly**: full disks, long pauses on huge heaps, and sensitive data copied to laptops. Use `GC.class_histogram` first, and secure the dumps.
- **Profiling with safepoint-biased tools**, then optimising the wrong method. Use JFR or async-profiler.
- **Attaching to the wrong process or as the wrong user** (the attach fails), or running `jcmd` on the host instead of inside the container.
- **Adding logging or `System.currentTimeMillis()` timers everywhere** instead of using JFR, which already records most of it with lower overhead.
- **Ignoring GC as a cause of high CPU**: busy GC threads mean memory pressure, not slow code.

## Interview questions

**Q1. A Java service is using 100% CPU. How do you find out why?**

````reveal title="Answer"
1. Check whether it's GC: GC logs or `jstat -gcutil` showing back-to-back collections mean memory pressure, so investigate the heap.
2. Otherwise profile it: record JFR for a minute (`jcmd <pid> JFR.start duration=60s filename=cpu.jfr`) and look at the hot methods in Mission Control, or use async-profiler for a CPU flame graph.
3. Without profilers: `top -H -p <pid>` shows the busiest native thread id; convert it to hex and match it to `nid=0x…` in a `jcmd Thread.print` output, repeated a few times to see where it spends its time.

Common culprits are infinite loops, regex backtracking, serialisation of huge objects, and spinning retries.
````

**Q2. How do you read a thread dump? What do BLOCKED, WAITING and TIMED_WAITING mean?**

````reveal title="Answer"
Each entry shows the thread's name, state and stack, plus the locks it holds (`- locked <0x…>`) and waits for (`- waiting to lock <0x…>`, `- parking to wait for <0x…>`).
- `BLOCKED`: waiting to enter a `synchronized` monitor owned by another thread.
- `WAITING`: waiting indefinitely in `Object.wait()`, `LockSupport.park()` (`java.util.concurrent` locks, queues, futures) or `join()`.
- `TIMED_WAITING`: the same with a timeout, or `sleep`.
- `RUNNABLE`: executing, or blocked in native I/O.

Take several dumps and look for deadlocks (reported automatically), chains of threads blocked on one lock owner, and pools whose threads are all waiting on the same resource.
````

**Q3. What is JDK Flight Recorder, and why is it suitable for production?**

````reveal title="Answer"
JFR is an event recorder built into the JVM. It captures CPU samples, allocation samples, GC and safepoint details, lock contention, file and socket I/O, exceptions, class loading and custom application events into a compact binary file, with about 1–2% overhead, because events go to thread-local buffers and sampling isn't tied to safepoints. It can run continuously with a rolling time window and be dumped on demand (`jcmd JFR.dump`) when an incident occurs. Analyse with JDK Mission Control, `jfr print`, or programmatically with `RecordingFile` or `RecordingStream`.
````

**Q4. How would you investigate a suspected memory leak in a running service without restarting it?**

````reveal title="Answer"
1. Confirm the trend in GC logs or metrics: old-generation occupancy after GC keeps rising.
2. Take two `jcmd <pid> GC.class_histogram` snapshots some minutes apart and compare which classes grow.
3. Take a heap dump (`jcmd <pid> GC.heap_dump /path/heap.hprof`, at a quiet moment because it pauses the JVM and needs disk space) and analyse it in Eclipse MAT: the dominator tree and leak suspects, then the path to GC roots of the growing objects, which names the static, thread or listener holding them.
4. If the heap is flat but RSS grows, look at native memory instead (NMT, direct buffers, thread count).
````

**Q5. What's safepoint bias in profiling?**

````reveal title="Answer"
Profilers that collect stacks via JVM APIs (for example `Thread.getAllStackTraces()` or JMX sampling) can only sample threads when they reach a safepoint. Hot code without safepoint polls, such as counted loops and inlined methods, never appears at the moment of sampling, so its time is attributed to the next safepoint location, usually a caller. Results point to the wrong methods. JFR's execution sampler and async-profiler sample asynchronously using OS signals and JVM internals, avoiding this bias.
````

## Hands-on exercise

Write a **thread dump analyser**. Given the `jstack`-style dump below (a text block), report:
- the number of threads per state;
- for each `BLOCKED` thread, which lock it's waiting for and which thread holds that lock;
- any **deadlock**: a cycle in the "waits for a lock held by" graph.

```text
"http-nio-8080-exec-1" #31 daemon prio=5 waiting for monitor entry
   java.lang.Thread.State: BLOCKED (on object monitor)
	at com.shop.Inventory.reserve(Inventory.java:57)
	- waiting to lock <0x01> (a com.shop.Inventory)
"http-nio-8080-exec-2" #32 daemon prio=5 waiting for monitor entry
   java.lang.Thread.State: BLOCKED (on object monitor)
	at com.shop.Inventory.reserve(Inventory.java:57)
	- waiting to lock <0x01> (a com.shop.Inventory)
"inventory-refresh" #20 daemon prio=5 runnable
   java.lang.Thread.State: RUNNABLE
	at java.net.SocketInputStream.socketRead0(Native Method)
	at com.shop.Inventory.refresh(Inventory.java:88)
	- locked <0x01> (a com.shop.Inventory)
"payments-1" #40 prio=5 waiting for monitor entry
   java.lang.Thread.State: BLOCKED (on object monitor)
	at com.shop.Ledger.transfer(Ledger.java:20)
	- waiting to lock <0x0b> (a com.shop.Account)
	- locked <0x0a> (a com.shop.Account)
"payments-2" #41 prio=5 waiting for monitor entry
   java.lang.Thread.State: BLOCKED (on object monitor)
	at com.shop.Ledger.transfer(Ledger.java:20)
	- waiting to lock <0x0a> (a com.shop.Account)
	- locked <0x0b> (a com.shop.Account)
"scheduler" #12 daemon prio=5 waiting on condition
   java.lang.Thread.State: TIMED_WAITING (parking)
	at jdk.internal.misc.Unsafe.park(Native Method)
```

````hint title="Hint"
Parse thread blocks: a line starting with `"` begins a thread (the name is between the quotes). Record its state from `java.lang.Thread.State: X`, the lock id from `- waiting to lock <id>`, and every `- locked <id>` into an owner map. Then `waitsFor.put(thread, owner.get(lockId))`. To find a deadlock, follow `waitsFor` from each thread until you either reach a thread that waits for nothing, or return to a thread already seen on this path.
````

````solution title="Solution"
```java title="ThreadDumpAnalyzer.java" file="ThreadDumpAnalyzer.java"
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

public class ThreadDumpAnalyzer {
    static final String DUMP = """
            "http-nio-8080-exec-1" #31 daemon prio=5 waiting for monitor entry
               java.lang.Thread.State: BLOCKED (on object monitor)
            	at com.shop.Inventory.reserve(Inventory.java:57)
            	- waiting to lock <0x01> (a com.shop.Inventory)
            "http-nio-8080-exec-2" #32 daemon prio=5 waiting for monitor entry
               java.lang.Thread.State: BLOCKED (on object monitor)
            	at com.shop.Inventory.reserve(Inventory.java:57)
            	- waiting to lock <0x01> (a com.shop.Inventory)
            "inventory-refresh" #20 daemon prio=5 runnable
               java.lang.Thread.State: RUNNABLE
            	at java.net.SocketInputStream.socketRead0(Native Method)
            	at com.shop.Inventory.refresh(Inventory.java:88)
            	- locked <0x01> (a com.shop.Inventory)
            "payments-1" #40 prio=5 waiting for monitor entry
               java.lang.Thread.State: BLOCKED (on object monitor)
            	at com.shop.Ledger.transfer(Ledger.java:20)
            	- waiting to lock <0x0b> (a com.shop.Account)
            	- locked <0x0a> (a com.shop.Account)
            "payments-2" #41 prio=5 waiting for monitor entry
               java.lang.Thread.State: BLOCKED (on object monitor)
            	at com.shop.Ledger.transfer(Ledger.java:20)
            	- waiting to lock <0x0a> (a com.shop.Account)
            	- locked <0x0b> (a com.shop.Account)
            "scheduler" #12 daemon prio=5 waiting on condition
               java.lang.Thread.State: TIMED_WAITING (parking)
            	at jdk.internal.misc.Unsafe.park(Native Method)
            """;

    public static void main(String[] args) {
        Map<String, String> state = new LinkedHashMap<>();
        Map<String, String> waitingFor = new LinkedHashMap<>();   // thread -> lock id
        Map<String, String> owner = new LinkedHashMap<>();        // lock id -> thread
        String current = null;
        for (String raw : DUMP.lines().toList()) {
            String line = raw.strip();
            if (line.startsWith("\"")) {
                current = line.substring(1, line.indexOf('"', 1));
            } else if (line.startsWith("java.lang.Thread.State: ")) {
                state.put(current, line.substring(24).split(" ")[0]);
            } else if (line.startsWith("- waiting to lock <")) {
                waitingFor.put(current, line.substring(19, line.indexOf('>')));
            } else if (line.startsWith("- locked <")) {
                owner.put(line.substring(10, line.indexOf('>')), current);
            }
        }

        Map<String, Integer> byState = new TreeMap<>();
        state.values().forEach(s -> byState.merge(s, 1, Integer::sum));
        System.out.println("threads by state: " + byState);

        Map<String, String> waitsFor = new LinkedHashMap<>();
        waitingFor.forEach((thread, lock) -> {
            String holder = owner.get(lock);
            waitsFor.put(thread, holder);
            System.out.println(thread + " is BLOCKED on <" + lock + "> held by " + holder + " (" + state.get(holder) + ")");
        });

        Set<Set<String>> reported = new LinkedHashSet<>();
        for (String start : waitsFor.keySet()) {
            List<String> path = new ArrayList<>();
            String t = start;
            while (t != null && !path.contains(t)) {
                path.add(t);
                t = waitsFor.get(t);
            }
            if (t != null) {                                     // came back to a thread on the path: a cycle
                List<String> cycle = path.subList(path.indexOf(t), path.size());
                if (reported.add(new java.util.TreeSet<>(cycle))) {
                    System.out.println("DEADLOCK: " + String.join(" -> ", cycle) + " -> " + t);
                }
            }
        }
    }
}
```

```text title="Output" output="ThreadDumpAnalyzer.java"
threads by state: {BLOCKED=4, RUNNABLE=1, TIMED_WAITING=1}
http-nio-8080-exec-1 is BLOCKED on <0x01> held by inventory-refresh (RUNNABLE)
http-nio-8080-exec-2 is BLOCKED on <0x01> held by inventory-refresh (RUNNABLE)
payments-1 is BLOCKED on <0x0b> held by payments-2 (BLOCKED)
payments-2 is BLOCKED on <0x0a> held by payments-1 (BLOCKED)
DEADLOCK: payments-1 -> payments-2 -> payments-1
```

- Two problems show up in one dump. Both HTTP threads are stuck behind `inventory-refresh`, which holds the `Inventory` lock while doing a **socket read**: a lock held across I/O, so request latency equals the slowest refresh. The fix is to fetch outside the lock and swap in the result.
- The two payment threads form a real **deadlock** by locking accounts in opposite order. The fix is a global lock ordering, such as locking the lower account id first. The concurrency stage covers both patterns in depth.
````

## Knowledge check

```quiz
? Which command takes a thread dump of a running JVM?
+ jcmd <pid> Thread.print
- jcmd <pid> GC.heap_info
- jstat -gcutil <pid>
> jstack <pid> and kill -3 <pid> do the same.

? A thread is BLOCKED. What is it doing?
+ Waiting to enter a synchronized block owned by another thread
- Sleeping with Thread.sleep
- Blocked in a socket read
> Socket reads usually show as RUNNABLE; sleep is TIMED_WAITING.

? Why is JFR suitable for always-on production use?
+ It records events into thread-local buffers with about 1-2% overhead
- It only runs when the JVM is idle
- It samples only at safepoints, which is cheap
> Its sampling is asynchronous, which also avoids safepoint bias.

? What should you be careful about with heap dumps in production?
+ They pause the JVM, need disk space and contain sensitive data
- They delete objects from the heap
- They require a JVM restart
> Treat them like a database backup.

? Process memory (RSS) keeps growing while the heap after GC is flat. Where do you look?
+ Native memory: NMT, direct buffers, thread count, Metaspace
- The young generation size
- The JIT compiler log
> The leak isn't in the Java heap.
```

## Key takeaways

- **`jcmd`** is the entry point: `Thread.print`, `GC.class_histogram`, `GC.heap_dump`, `VM.flags`, `VM.native_memory`, `VM.log`, `JFR.*`. The same commands are reachable over JMX via the `DiagnosticCommand` MBean.
- **Thread dumps**: know `RUNNABLE` (including native I/O), `BLOCKED` (monitor entry), `WAITING`/`TIMED_WAITING` (wait, park, sleep). Take several; find deadlocks, lock chains and exhausted pools.
- **JFR** is low-overhead, always-on, event-based profiling (CPU, allocation, GC, locks, I/O, custom events). Analyse in Mission Control. Use async-profiler for flame graphs without safepoint bias.
- Playbooks: **high CPU** → GC? then profile; **memory growth** → after-GC trend, histograms, heap dump in MAT; **hangs** → thread dumps and lock or I/O events.
- Heap dumps pause the JVM, need disk space and hold sensitive data. Start with class histograms.
