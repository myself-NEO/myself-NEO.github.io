## Concept explanation

Both are subclasses of **`VirtualMachineError`**: the JVM can't continue what it was doing because a resource ran out. They're `Error`s, not `Exception`s, because ordinary code can't usually recover from them.

### OutOfMemoryError: read the message

`OutOfMemoryError` means "some memory area is exhausted". **The message tells you which one**, and each has different causes and fixes:

| Message | Exhausted resource | Typical causes | First steps |
|---|---|---|---|
| `Java heap space` | the heap, after a full GC | a leak; heap too small for the live data; a spike (a huge query result, a file read fully into memory) | heap dump + GC log; check old-gen-after-GC trend; raise `-Xmx` only if the live set is legitimately larger |
| `GC overhead limit exceeded` | heap (Parallel GC policy) | the JVM spent >98% of time in GC recovering <2% of the heap: it's thrashing just before running out | same as heap space |
| `Requested array size exceeds VM limit` | the maximum array length | trying to allocate an array of about `Integer.MAX_VALUE` elements | a bug in size calculation; chunk the data |
| `Metaspace` | class metadata (`-XX:MaxMetaspaceSize`) | class-loader leaks on redeploy; unbounded dynamic class generation (proxies, scripting, lambdas in generated code) | `jcmd VM.metaspace`, class histograms; find what pins old loaders |
| `Compressed class space` | the class-pointer area (1 GB default) | very many classes | same as Metaspace; `-XX:CompressedClassSpaceSize` |
| `Cannot reserve N bytes of direct buffer memory` (older: `Direct buffer memory`) | direct NIO buffers (`-XX:MaxDirectMemorySize`, default ≈ `-Xmx`) | Netty or NIO buffer leaks, too many large direct buffers | check buffer pools (`BufferPoolMXBean`), close and release buffers |
| `unable to create native thread` | OS threads (process limits, memory for stacks) | thread leaks (executors never shut down, a thread per request), `ulimit -u` or container pid limits | thread dump: who created thousands of threads? |
| (process killed, exit code 137, `OOMKilled`) | **container memory**, not a Java error at all | heap + non-heap exceeded the cgroup limit | size the heap to a fraction of the limit; check native memory |

### StackOverflowError

Thrown when a thread's stack has no room for another frame. Causes:
- **Infinite recursion**: a missing or wrong base case, or **accidental mutual recursion**:
  - `toString()`/`equals()`/`hashCode()` cycling through bidirectional relationships (JPA entities with Lombok `@ToString`/`@EqualsAndHashCode`);
  - JSON serialisation of cyclic object graphs;
  - a setter calling itself.
- **Legitimately deep recursion**: DFS on a long chain, recursive parsing of deeply nested input, recursion over a million-node linked list.

Fixes: correct the base case; break cycles (exclude back-references from `toString`, use `@JsonManagedReference`/`@JsonBackReference`); **convert recursion to iteration** with an explicit stack; or, as a last resort, run that work on a thread created with a larger stack. Raising `-Xss` affects *every* thread.

### Should you catch them?

Almost never. After an `OutOfMemoryError`, any data structure that was being modified may be half-updated, and other threads may fail randomly. The safest response is usually to **fail fast**: `-XX:+ExitOnOutOfMemoryError` lets the orchestrator restart a clean process, with `-XX:+HeapDumpOnOutOfMemoryError` capturing evidence first.

A narrow exception is an isolated, optional, big allocation ("try to build the preview image; skip it if memory is short"). Catching `StackOverflowError` around a recursive parser to turn it into a clear "input too deeply nested" error is reasonable.

## Internal working

- **Heap OOME** is thrown after the allocation slow path fails *and* the GC (including a full collection, and clearing all soft references) couldn't free enough. With G1, a humongous allocation can fail on contiguity even with free space in total.
- **The thread that gets the error isn't necessarily the culprit.** Whichever thread happens to allocate when the heap is full receives the OOME; the leak may be elsewhere. That's why the heap dump is better evidence than the stack trace.
- **Metaspace OOME** occurs when class metadata can't grow past `MaxMetaspaceSize` even after a GC tried to unload classes. Without a cap, metaspace keeps growing until the OS or container kills the process.
- **Direct memory** is reserved through `java.nio.Bits.reserveMemory`. When the cap is reached it first triggers `System.gc()` (to run `Cleaner`s of unreachable buffers) and retries before failing. That's one reason `-XX:+DisableExplicitGC` can backfire with NIO-heavy apps.
- **Stack overflow detection** uses **guard pages** (yellow/red/reserved zones) at the end of each thread stack. Touching the yellow zone raises `StackOverflowError` in Java code. The JVM keeps enough room to unwind and run handlers, and the red zone protects the JVM itself.
- **Stack traces are truncated** to `-XX:MaxJavaStackTraceDepth` (1,024 frames by default). For an overflow you'll see a repeating pattern, and the *first* frames of the cycle tell you where the recursion started.
- **Fatal errors** in native code (out of native memory, segfaults) produce an `hs_err_pid<pid>.log` crash file with the cause, the threads and the memory map. Look for it next to the process's working directory.
- **Useful flags**:
  - `-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/dumps`;
  - `-XX:+ExitOnOutOfMemoryError` or `-XX:+CrashOnOutOfMemoryError`;
  - `-XX:OnOutOfMemoryError="cmd %p"`;
  - `-Xlog:gc*`;
  - `-XX:NativeMemoryTracking=summary` for native footprint.

## Visual representation

```text title="Which OutOfMemoryError? Follow the message"
  java.lang.OutOfMemoryError: ...
     |
     +-- "Java heap space" / "GC overhead limit exceeded" -> HEAP:   leak? spike? undersized?  -> heap dump, GC log
     +-- "Requested array size exceeds VM limit"          -> ARRAY LENGTH: size-calculation bug
     +-- "Metaspace" / "Compressed class space"           -> CLASS METADATA: loader leak, class generation
     +-- "Cannot reserve ... direct buffer memory"        -> DIRECT MEMORY: NIO/Netty buffers
     +-- "unable to create native thread"                 -> OS THREADS: thread leak, ulimit, pids limit
  (no Java error, exit 137 / OOMKilled)                    -> CONTAINER LIMIT: heap + native > cgroup memory

  StackOverflowError
     thread stack [ main | a | b | a | b | a | b | ... | a | b |#guard page#]  -> repeated frames = recursion cycle
```

## Java code example

Each failure is triggered in a **separate child JVM** with small limits, so the demo can show the real messages without crashing itself. The stack-overflow part runs in-process.

```java title="FailureGallery.java" file="FailureGallery.java"
import java.lang.invoke.MethodHandles;
import java.nio.ByteBuffer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

public class FailureGallery {
    static int depth;

    static void recurse() {
        depth++;
        recurse();                                     // no base case
    }

    public static void main(String[] args) throws Exception {
        if (args.length == 1) {
            trigger(args[0]);
            return;
        }
        Path dumps = Files.createTempDirectory("dumps");
        String[][] scenarios = {
                {"heap", "-Xmx16m"},
                {"array", "-Xmx16m"},
                {"metaspace", "-XX:MaxMetaspaceSize=16m"},
                {"direct", "-XX:MaxDirectMemorySize=1m"},
                {"heap", "-Xmx16m", "-XX:+ExitOnOutOfMemoryError"},
                {"heap", "-Xmx16m", "-XX:+HeapDumpOnOutOfMemoryError", "-XX:HeapDumpPath=" + dumps},
        };
        for (String[] scenario : scenarios) {
            List<String> command = new ArrayList<>(List.of(Path.of(System.getProperty("java.home"), "bin", "java").toString(), "-XX:+UseSerialGC"));
            command.addAll(List.of(scenario).subList(1, scenario.length));
            command.addAll(List.of("-cp", System.getProperty("java.class.path"), "FailureGallery", scenario[0]));
            Process p = new ProcessBuilder(command).redirectErrorStream(true).start();
            List<String> lines = new String(p.getInputStream().readAllBytes()).lines()
                    .filter(l -> l.contains("Error") || l.startsWith("Terminating")).toList();
            int exit = p.waitFor();
            String flags = String.join(" ", command.subList(2, command.size() - 4)).replace(dumps.toString(), "<dir>");
            System.out.println(scenario[0] + " [" + flags + "] exit=" + exit);
            System.out.println("   " + (lines.isEmpty() ? "(no error line)" : lines.get(0)));
        }
        List<Path> written;
        try (var files = Files.list(dumps)) {
            written = files.toList();
        }
        System.out.println("heap dump written: " + written.stream().anyMatch(f -> f.toString().endsWith(".hprof")));
        for (Path f : written) {
            Files.delete(f);                               // dumps can be as large as the heap: clean up
        }
        Files.delete(dumps);

        try {
            recurse();
        } catch (StackOverflowError e) {
            StackTraceElement[] trace = e.getStackTrace();
            System.out.println("StackOverflowError after more than 1,000 frames: " + (depth > 1_000)
                    + "; stack trace truncated to " + trace.length + " frames, all in " + trace[0].getMethodName());
        }
        System.out.println("the program continues after catching it");
    }

    static void trigger(String kind) throws Exception {
        switch (kind) {
            case "heap" -> {
                List<long[]> hoard = new ArrayList<>();
                while (true) {
                    hoard.add(new long[1024 * 1024]);   // 8 MB at a time, all kept reachable
                }
            }
            case "array" -> System.out.println(new long[Integer.MAX_VALUE].length);
            case "metaspace" -> {
                byte[] bytes = FailureGallery.class.getResourceAsStream("FailureGallery.class").readAllBytes();
                List<Class<?>> classes = new ArrayList<>();
                while (true) {
                    classes.add(MethodHandles.lookup().defineHiddenClass(bytes, false).lookupClass());
                }
            }
            case "direct" -> System.out.println(ByteBuffer.allocateDirect(4 * 1024 * 1024).capacity());
            default -> throw new IllegalArgumentException(kind);
        }
    }
}
```

## Output

```text title="Output" output="FailureGallery.java"
heap [-Xmx16m] exit=1
   Exception in thread "main" java.lang.OutOfMemoryError: Java heap space
array [-Xmx16m] exit=1
   Exception in thread "main" java.lang.OutOfMemoryError: Requested array size exceeds VM limit
metaspace [-XX:MaxMetaspaceSize=16m] exit=1
   Exception in thread "main" java.lang.OutOfMemoryError: Metaspace
direct [-XX:MaxDirectMemorySize=1m] exit=1
   Exception in thread "main" java.lang.OutOfMemoryError: Cannot reserve 4194304 bytes of direct buffer memory (allocated: 0, limit: 1048576)
heap [-Xmx16m -XX:+ExitOnOutOfMemoryError] exit=3
   Terminating due to java.lang.OutOfMemoryError: Java heap space
heap [-Xmx16m -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=<dir>] exit=1
   java.lang.OutOfMemoryError: Java heap space
heap dump written: true
StackOverflowError after more than 1,000 frames: true; stack trace truncated to 1024 frames, all in recurse
the program continues after catching it
```

- Each scenario failed with a **different message** identifying the exhausted area: heap, array length limit, Metaspace, and direct memory (whose message even states the 1 MB limit).
- With `-XX:+ExitOnOutOfMemoryError`, the JVM printed "Terminating due to …" and **exited with code 3** instead of limping on. That's what you want under Kubernetes or systemd, which restart the process.
- `-XX:+HeapDumpOnOutOfMemoryError` wrote an `.hprof` file before dying: the evidence for the leak hunt.
- The stack overflow was caught after thousands of frames, but the stack trace kept only the most recent **1,024**, all in `recurse`. Read the *pattern*, not the length.

## Real-world application

- **Production defaults for services**:
  - `-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/var/dumps`, on a volume that survives restarts;
  - `-XX:+ExitOnOutOfMemoryError`;
  - GC logging;
  - an explicit `-XX:MaxMetaspaceSize` and heap percentage.
- **Spiky heap OOMs** usually come from loading too much at once: unpaginated `findAll()`, reading a whole upload with `readAllBytes()`, building a giant JSON or Excel file in memory. Stream, paginate or cap them.
- **Netty and gRPC services** watch direct memory. Leaked `ByteBuf`s produce direct-memory OOMs, and Netty's leak detector (`-Dio.netty.leakDetection.level`) finds them.
- **"unable to create native thread"** in services often means a new `ExecutorService` per request, or threads blocked forever and never reused. A thread dump shows thousands of similar threads.
- **StackOverflowError** in web apps is typically an entity graph serialised to JSON with back-references, or a `toString()` loop between parent and child entities.

## Common mistakes

- **"Fixing" every OOME by increasing `-Xmx`.** A leak just takes longer to crash, with bigger dumps and longer GCs.
- **Catching `OutOfMemoryError` or `Throwable`** and continuing as if nothing happened, leaving corrupted state.
- **Reading only the stack trace of the OOME.** The allocating thread is often a victim; the heap dump shows the real retainer.
- **Not capturing evidence**: no heap-dump flags, no GC logs, a dump path inside an ephemeral container filesystem.
- **Raising `-Xss` globally** for one deep recursion, which multiplies memory for every thread.
- **Confusing Kubernetes `OOMKilled` with a Java OOME.** The fix is the heap-to-limit ratio and native memory, not heap analysis.
- **Recursion over user-controlled depth** (nested JSON, XML, expressions) without a limit, which is also a denial-of-service vector.

## Interview questions

**Q1. What are the different kinds of `OutOfMemoryError`?**

````reveal title="Answer"
The message identifies the resource:
- `Java heap space` (and `GC overhead limit exceeded`, from the Parallel collector's thrash detection): the heap;
- `Metaspace` and `Compressed class space`: class metadata;
- `Requested array size exceeds VM limit`: the maximum array length;
- `Cannot reserve … direct buffer memory`: NIO direct buffers capped by `MaxDirectMemorySize`;
- `unable to create native thread`: the OS couldn't create another thread.

A container `OOMKilled` (exit 137) is not a Java error: the whole process exceeded its cgroup limit.
````

**Q2. Your service throws `OutOfMemoryError: Java heap space` once a day. How do you investigate?**

````reveal title="Answer"
1. Enable evidence: `-XX:+HeapDumpOnOutOfMemoryError` with a persistent `HeapDumpPath`, GC logging, and `-XX:+ExitOnOutOfMemoryError` so it restarts cleanly.
2. Check the GC log or metrics for old-gen occupancy after full GCs. A steady upward trend means a leak; a sudden jump means a spike.
3. Open the dump in Eclipse MAT: the dominator tree and leak suspects, then the biggest retainers and their paths to GC roots.
4. Correlate with the code: caches, static collections, listeners, unbounded queries or uploads.
5. Fix the cause and load-test.

Only raise `-Xmx` if the live set is legitimately larger than the heap.
````

**Q3. What causes `StackOverflowError`, and how do you fix it?**

````reveal title="Answer"
A thread's stack ran out of space for new frames, almost always because of recursion: infinite recursion from a missing base case, unintended mutual recursion (`toString`/`hashCode`/JSON serialisation cycles between bidirectional objects), or legitimately deep recursion over large inputs. Fixes:
- correct the base case or break the cycle;
- convert the algorithm to iteration with an explicit stack or queue;
- limit nesting depth for untrusted input;
- if unavoidable, run that task in a thread created with a larger `stackSize`, rather than raising `-Xss` for all threads.
````

**Q4. Should you catch `OutOfMemoryError`?**

````reveal title="Answer"
Generally no. It can be thrown in any thread at any allocation, possibly in the middle of updating shared data structures, so the application state may be inconsistent afterwards. The robust approach is to fail fast (`-XX:+ExitOnOutOfMemoryError`), capture a heap dump, and let a supervisor restart the process. Catching is acceptable only around an isolated, optional allocation whose failure leaves no shared state modified, such as skipping an optional large thumbnail.
````

**Q5. What is the difference between `-Xmx` and the container memory limit, and what does exit code 137 mean?**

````reveal title="Answer"
`-Xmx` limits only the Java heap. The container limit applies to the whole process: heap + Metaspace + code cache + thread stacks + direct buffers + GC/JIT internals + native libraries. If the total exceeds the limit, the kernel's OOM killer sends SIGKILL, so the process exits with 128 + 9 = 137 and Kubernetes reports `OOMKilled`, with no Java exception or heap dump. Fix it by keeping the heap well below the limit (for example `-XX:MaxRAMPercentage=70`) and by checking native memory with NMT.
````

## Hands-on exercise

A linked list of a million nodes breaks a recursive algorithm:

```java
record Node(int value, Node next) { }

static long sumRecursive(Node node) {
    return node == null ? 0 : node.value() + sumRecursive(node.next());
}
```

1. Build the list (values 1 to 1,000,000) and show that `sumRecursive` throws `StackOverflowError` (the program runs with `-Xss512k`).
2. Write `sumIterative` with a loop and show it returns 500000500000.
3. A deeply nested tree (each node has one child, depth 1,000,000) breaks a recursive `depth(Tree)` the same way. Write an iterative `maxDepth` for general trees (`record Tree(List<Tree> children)`) using an explicit `ArrayDeque` of (node, depth) pairs.

````hint title="Hint"
Iterating a list: `for (Node n = head; n != null; n = n.next()) sum += n.value();`. For the tree, push `new Entry(root, 1)`. Then while the deque isn't empty, pop, update the maximum, and push each child with `depth + 1`. Build the deep tree bottom-up in a loop, so building it doesn't recurse either.
````

````solution title="Solution"
```java title="DeepStructures.java" file="DeepStructures.java" run="-Xss512k"
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;

public class DeepStructures {
    record Node(int value, Node next) { }

    record Tree(List<Tree> children) { }

    record Entry(Tree tree, int depth) { }

    static long sumRecursive(Node node) {
        return node == null ? 0 : node.value() + sumRecursive(node.next());
    }

    static long sumIterative(Node head) {
        long sum = 0;
        for (Node n = head; n != null; n = n.next()) {
            sum += n.value();
        }
        return sum;
    }

    static int depthRecursive(Tree tree) {
        int max = 0;
        for (Tree child : tree.children()) {
            max = Math.max(max, depthRecursive(child));
        }
        return max + 1;
    }

    static int maxDepth(Tree root) {
        int max = 0;
        Deque<Entry> stack = new ArrayDeque<>();
        stack.push(new Entry(root, 1));
        while (!stack.isEmpty()) {
            Entry e = stack.pop();
            max = Math.max(max, e.depth());
            for (Tree child : e.tree().children()) {
                stack.push(new Entry(child, e.depth() + 1));
            }
        }
        return max;
    }

    public static void main(String[] args) {
        Node head = null;
        for (int v = 1_000_000; v >= 1; v--) {
            head = new Node(v, head);                     // built iteratively, front to back
        }
        try {
            System.out.println(sumRecursive(head));
        } catch (StackOverflowError e) {
            System.out.println("sumRecursive: StackOverflowError");
        }
        System.out.println("sumIterative: " + sumIterative(head));

        Tree deep = new Tree(List.of());
        for (int i = 1; i < 1_000_000; i++) {
            deep = new Tree(List.of(deep));               // one long chain, depth 1,000,000
        }
        Tree bushy = new Tree(List.of(new Tree(List.of()), new Tree(List.of(new Tree(List.of()), new Tree(List.of())))));
        try {
            System.out.println(depthRecursive(deep));
        } catch (StackOverflowError e) {
            System.out.println("depthRecursive: StackOverflowError");
        }
        System.out.println("maxDepth(deep) = " + maxDepth(deep) + ", maxDepth(bushy) = " + maxDepth(bushy)
                + ", recursive on bushy = " + depthRecursive(bushy));
    }
}
```

```text title="Output" output="DeepStructures.java"
sumRecursive: StackOverflowError
sumIterative: 500000500000
depthRecursive: StackOverflowError
maxDepth(deep) = 1000000, maxDepth(bushy) = 3, recursive on bushy = 3
```

The data was fine and the heap had plenty of room. Only the *call stack* was too small for a million nested calls. The iterative versions move the "stack" into a heap-allocated `ArrayDeque` (or a single loop variable), which is limited only by heap size. For small, bounded inputs like `bushy`, recursion remains perfectly fine and often clearer.
````

## Knowledge check

```quiz
? Which message points to a class-loader leak or unbounded class generation?
+ OutOfMemoryError: Metaspace
- OutOfMemoryError: Java heap space
- OutOfMemoryError: Requested array size exceeds VM limit
> Class metadata lives in Metaspace.

? A Kubernetes pod shows OOMKilled with exit code 137 and no Java stack trace. What happened?
+ The whole process exceeded the container memory limit and the kernel killed it
- The heap exceeded -Xmx
- The JVM ran out of threads
> Heap + native memory crossed the cgroup limit; it isn't a Java OutOfMemoryError.

? What does -XX:+ExitOnOutOfMemoryError do?
+ Terminates the JVM at the first OutOfMemoryError so a supervisor can restart it
- Prevents OutOfMemoryError from occurring
- Writes a heap dump
> Combine it with -XX:+HeapDumpOnOutOfMemoryError to keep evidence.

? Why does the stack trace of a StackOverflowError show only 1,024 frames?
+ The JVM truncates stack traces to MaxJavaStackTraceDepth
- The recursion was exactly 1,024 deep
- The stack size is 1,024 KB
> Look for the repeating pattern; the real depth was larger.

? What is the best general fix for StackOverflowError from deep but legitimate recursion over large data?
+ Convert the recursion to iteration with an explicit stack
- Raise -Xss for the whole JVM
- Catch the error and retry
> An explicit stack lives in the heap and scales with the data.
```

## Key takeaways

- **`OutOfMemoryError`'s message names the exhausted resource**: heap space, GC overhead, array size limit, Metaspace, compressed class space, direct buffer memory, native threads. Exit code 137 / `OOMKilled` is the *container* limit, not a Java error.
- Capture evidence by default: **`-XX:+HeapDumpOnOutOfMemoryError`**, GC logs, and **`-XX:+ExitOnOutOfMemoryError`** for clean restarts. Diagnose with the heap dump, not the victim thread's stack trace.
- Don't catch OOME and carry on. Fix leaks and spikes, and size the heap and non-heap areas deliberately.
- **`StackOverflowError`** = recursion too deep: fix base cases and object-graph cycles, convert to **iteration with an explicit stack**, cap nesting for untrusted input. Traces show at most 1,024 frames.
