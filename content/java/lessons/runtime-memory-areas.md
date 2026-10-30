## Concept explanation

The JVM specification defines **run-time data areas**. Some exist once per JVM and are shared by all threads; others are created per thread.

### Per-thread areas

| Area | Holds | Errors |
|---|---|---|
| **Program counter (PC) register** | the address of the bytecode instruction being executed (undefined while running a native method) | none |
| **JVM stack** | one **frame** per active method call | `StackOverflowError` when the depth limit is hit; `OutOfMemoryError` if a new thread's stack can't be allocated |
| **Native method stack** | frames of native (C/C++) code called via JNI/FFM | same as above |

A **frame** is created on every method call and destroyed when it returns (normally or by exception). It contains:
- **local variables**: parameters, local primitives and local **references**, in numbered slots (slot 0 is `this` for instance methods);
- the **operand stack**: the scratch space bytecode instructions work on;
- **frame data**: a reference to the run-time constant pool of the method's class, the return address, and exception-handling information.

Stack memory is managed automatically and very cheaply (push and pop). It's **private to its thread**, so local variables are inherently thread-safe. The *objects* they point to are not.

### Shared areas

| Area | Holds | HotSpot implementation |
|---|---|---|
| **Heap** | every object and array, including `Class` mirrors, static fields (stored with the mirror since Java 8), and **interned strings** (since Java 7) | managed by the GC: young/old generations or regions, sized by `-Xms`/`-Xmx` |
| **Method area** | per-class structures: field and method data, bytecode, the **run-time constant pool** | **Metaspace**: native memory, grows on demand, capped by `-XX:MaxMetaspaceSize` |
| *(HotSpot only)* **Code cache** | JIT-compiled machine code | native memory, `-XX:ReservedCodeCacheSize` |
| *(outside the JVM model)* **Direct / native memory** | `ByteBuffer.allocateDirect`, FFM `Arena` allocations, memory-mapped files, JNI mallocs, thread stacks, GC data structures | native memory, partly capped by `-XX:MaxDirectMemorySize` |

### Where does each thing live?

```java
class Order {
    static int created;          // static field: in the heap, alongside Order's Class mirror
    int quantity;                // primitive FIELD: inside each Order object, in the heap
    String sku;                  // reference field: in the object; the String it points to is also in the heap

    int total(int price) {       // price: local slot in this call's stack frame
        int sum = quantity * price;               // sum: local slot (stack)
        List<Integer> parts = new ArrayList<>();  // the reference is on the stack; the ArrayList is in the heap
        return sum;
    }
}
// Order's methods, bytecode and constant pool: method area (Metaspace)
// total() after JIT compilation: code cache
```

"Primitives on the stack, objects on the heap" is a **simplification**. Primitive *fields* live inside heap objects. What lives on the stack is *local variables*, whether primitives or references. And the JIT may keep a non-escaping object off the heap entirely.

### PermGen → Metaspace (Java 8)

Before Java 8, class metadata lived in **PermGen**, a fixed-size part of the heap. Applications that loaded many classes (app servers, frameworks generating proxies) hit `OutOfMemoryError: PermGen space` and had to guess `-XX:MaxPermSize`. Java 8 moved class metadata to **Metaspace** in native memory:
- it **grows automatically**;
- it's freed when class loaders are collected;
- it's **unlimited by default**, so set `-XX:MaxMetaspaceSize` to turn a class-loader leak into a clear error rather than a slowly growing process.

Interned strings and static fields had already moved to the heap in Java 7–8.

## Internal working

- **HotSpot stacks are native thread stacks.** Java frames are laid out on the OS thread's stack, with a size fixed at thread creation (`-Xss`, or the `stackSize` constructor argument): typically 1 MB on 64-bit Linux, macOS and Windows. Guard pages at the end detect overflow and raise `StackOverflowError` instead of crashing. Interpreted frames are larger than compiled ones, so the maximum recursion depth even varies with JIT activity.
- **Frames hold references, not objects.** During GC, the collector scans every thread's frames (and registers) for references. These are **GC roots** (next lessons). The JIT records which slots hold live references at each safepoint (*oop maps*).
- **Heap layout depends on the collector**: Serial and Parallel use contiguous young (eden + two survivors) and old generations; G1, ZGC and Shenandoah use many equal-sized **regions**. Objects are allocated by bump pointer in **thread-local allocation buffers** (TLABs; see the next lesson).
- **Metaspace**:
  - It allocates per class loader in chunks, so it can free a loader's metadata in bulk when the loader dies.
  - With compressed class pointers, `Klass` structures go into a separate **Compressed Class Space** (1 GB by default) addressable with 32-bit offsets.
  - Its growth triggers GCs (`Metadata GC Threshold`) so that dead loaders can be unloaded.
- **The run-time constant pool** is created from the class file's constant pool. Its symbolic references are resolved lazily and cached, and string literals in it are resolved to interned `String` objects in the heap.
- **Total process memory ≈** heap + Metaspace + code cache + (threads × stack size) + direct buffers + GC and JIT internal structures + libc and native libraries. This is why a container with a 1 GB limit can't run with `-Xmx1g`: the **non-heap** part (often 100–300 MB) needs room too. **Native Memory Tracking** (`-XX:NativeMemoryTracking=summary`, then `jcmd <pid> VM.native_memory`) breaks it down.

## Visual representation

```text title="Runtime data areas"
  +-------------------------------- one JVM process ---------------------------------+
  |  thread "main"           thread "worker-1"         SHARED                         |
  |  +--------------+        +--------------+          +----------------------------+ |
  |  | PC register  |        | PC register  |          | HEAP  (GC-managed)         | |
  |  | JVM stack    |        | JVM stack    |          |  objects, arrays           | |
  |  |  frame c()   |        |  frame run() |          |  Class mirrors + statics   | |
  |  |  frame b()   |---ref--------------------------->|  interned strings          | |
  |  |  frame a()   |        |              |          +----------------------------+ |
  |  |  frame main  |        |              |          | METASPACE (native)         | |
  |  |  [locals | operand stack | frame data]          |  Klass, methods, bytecode, | |
  |  | native stack |        | native stack |          |  run-time constant pools   | |
  |  +--------------+        +--------------+          +----------------------------+ |
  |                                                    | CODE CACHE (native): JIT   | |
  |  native memory: direct buffers, thread stacks,     +----------------------------+ |
  |  GC/JIT bookkeeping, JNI/FFM allocations                                          |
  +-----------------------------------------------------------------------------------+
```

## Java code example

```java title="MemoryAreas.java" file="MemoryAreas.java" run="-XX:+UseSerialGC -Xms64m -Xmx64m"
import java.lang.invoke.MethodHandles;
import java.lang.management.BufferPoolMXBean;
import java.lang.management.ClassLoadingMXBean;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryPoolMXBean;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;

public class MemoryAreas {
    static int depth;

    // 1. Frames: each call pushes one onto the current thread's stack
    static void a() {
        b();
    }

    static void b() {
        c();
    }

    static void c() {
        List<String> frames = StackWalker.getInstance().walk(s -> s.map(StackWalker.StackFrame::getMethodName).toList());
        System.out.println("stack frames, top first: " + frames);
    }

    static void thin(int d) {
        depth = d;
        thin(d + 1);
    }

    static long fat(int d) {                       // eight long locals: a much bigger frame
        long p = d, q = p + 1, r = q + 1, s = r + 1, t = s + 1, u = t + 1, v = u + 1, w = v + 1;
        depth = d;
        return fat(d + 1) + p + q + r + s + t + u + v + w;
    }

    static int maxDepth(long stackSize, boolean fatFrames) throws InterruptedException {
        int[] result = new int[1];
        Thread thread = new Thread(null, () -> {
            try {
                if (fatFrames) {
                    fat(0);
                } else {
                    thin(0);
                }
            } catch (StackOverflowError e) {
                result[0] = depth;
            }
        }, "probe", stackSize);
        thread.start();
        thread.join();
        return result[0];
    }

    static MemoryPoolMXBean pool(String name) {
        return ManagementFactory.getMemoryPoolMXBeans().stream().filter(p -> p.getName().equals(name)).findFirst().orElseThrow();
    }

    public static void main(String[] args) throws Exception {
        a();

        // 2. Each thread has its own stack; its size limits recursion depth
        int small = maxDepth(256 * 1024, false);
        int big = maxDepth(2 * 1024 * 1024, false);
        int fat = maxDepth(256 * 1024, true);
        System.out.println("2 MB stack recurses deeper than 256 KB: " + (big > small));
        System.out.println("bigger frames overflow sooner: " + (fat < small));

        // 3. Heap: objects outlive the frame that created them
        long before = ManagementFactory.getMemoryMXBean().getHeapMemoryUsage().getUsed();
        byte[] kept = allocate(8 * 1024 * 1024);
        long after = ManagementFactory.getMemoryMXBean().getHeapMemoryUsage().getUsed();
        System.out.println("8 MB array still reachable after allocate() returned: " + (kept.length == 8 * 1024 * 1024)
                + ", heap grew by >= 8 MB: " + (after - before >= 8 * 1024 * 1024));

        // 4. Interned strings live in the heap's string table
        String built = new StringBuilder("ja").append("va").toString();     // created at run time
        String literal = "java";                                              // from the string table
        System.out.println("built \"" + built + "\" is a separate object: " + (built != literal)
                + ", intern() returns the literal: " + (built.intern() == literal));

        // 5. Metaspace: class metadata grows as classes are defined
        ClassLoadingMXBean classes = ManagementFactory.getClassLoadingMXBean();
        byte[] bytes = MemoryAreas.class.getResourceAsStream("MemoryAreas.class").readAllBytes();
        long metaBefore = pool("Metaspace").getUsage().getUsed();
        int loadedBefore = classes.getLoadedClassCount();
        List<Class<?>> hidden = new ArrayList<>();
        for (int i = 0; i < 200; i++) {
            hidden.add(MethodHandles.lookup().defineHiddenClass(bytes, false).lookupClass());
        }
        System.out.println("defined " + (classes.getLoadedClassCount() - loadedBefore) + " classes, Metaspace grew: "
                + (pool("Metaspace").getUsage().getUsed() > metaBefore));

        // 6. Code cache: JIT output lives outside the heap
        long codeCache = ManagementFactory.getMemoryPoolMXBeans().stream()
                .filter(p -> p.getName().startsWith("CodeHeap")).mapToLong(p -> p.getUsage().getUsed()).sum();
        System.out.println("code cache in use: " + (codeCache > 0));

        // 7. Direct buffers: native memory, tracked separately from the heap
        BufferPoolMXBean direct = ManagementFactory.getPlatformMXBeans(BufferPoolMXBean.class).stream()
                .filter(b -> b.getName().equals("direct")).findFirst().orElseThrow();
        long directBefore = direct.getMemoryUsed();
        ByteBuffer buffer = ByteBuffer.allocateDirect(1024 * 1024);
        System.out.println("direct memory +" + (direct.getMemoryUsed() - directBefore) + " bytes for a " + buffer.capacity() + "-byte buffer");
    }

    static byte[] allocate(int size) {
        return new byte[size];              // the reference leaves the frame; the array stays in the heap
    }
}
```

## Output

```text title="Output" output="MemoryAreas.java"
stack frames, top first: [c, b, a, main]
2 MB stack recurses deeper than 256 KB: true
bigger frames overflow sooner: true
8 MB array still reachable after allocate() returned: true, heap grew by >= 8 MB: true
built "java" is a separate object: true, intern() returns the literal: true
defined 200 classes, Metaspace grew: true
code cache in use: true
direct memory +1048576 bytes for a 1048576-byte buffer
```

- `StackWalker` listed the live frames of the main thread, top first: `c` was called by `b`, called by `a`, called by `main`.
- A thread with a 2 MB stack recursed far deeper than one with 256 KB, and a method with eight `long` locals overflowed sooner than a method with none: depth = stack size ÷ frame size. Exact depths vary from run to run because interpreted and compiled frames differ in size.
- The array allocated inside `allocate()` survived the method's return: the frame held only the reference, while the object lived in the heap.
- The string built at run time was a different object from the literal until `intern()` returned the canonical copy from the string table (in the heap).
- Defining 200 classes grew Metaspace. The JIT's code cache and the direct buffer pool are both native memory, outside `-Xmx`.

## Real-world application

- **Container sizing**: a pod's memory limit must cover heap **plus** Metaspace, code cache, thread stacks (200 threads × 1 MB = 200 MB of reserved stack), direct buffers (Netty, NIO) and GC overhead. A common rule is to set the heap to 50–75% of the limit (`-XX:MaxRAMPercentage`).
- **Thread-per-request servers**: thousands of platform threads cost stack memory and kernel resources. Virtual threads (Java 21) store their stacks in the heap as small, growable chunks, which is a big reason they scale.
- **Recursion limits**: deep recursive algorithms (DFS on big graphs, recursive descent parsers, naive tree traversal) hit `StackOverflowError`. Convert them to iteration with an explicit stack, or run them in a thread created with a larger `stackSize`.
- **Metaspace monitoring**: steady Metaspace growth after redeploys signals a class-loader leak. Cap it with `-XX:MaxMetaspaceSize` and alert on it.
- **Off-heap data**: caches (Ehcache off-heap, Chronicle Map), Netty buffers and Lucene's memory-mapped indexes keep data out of the heap to reduce GC load. They need native memory headroom.

## Common mistakes

- **"Primitives live on the stack."** Only local variables do. Fields of objects, including primitive fields, are in the heap.
- **Thinking static fields live in Metaspace or PermGen.** Since Java 8 they're stored with the `Class` mirror in the heap.
- **Setting `-Xmx` equal to the container memory limit**, which gets the process OOM-killed by the kernel when non-heap memory pushes it over.
- **Raising `-Xss` globally to fix one deep recursion.** It multiplies by every thread. Fix the algorithm, or give one thread a bigger stack.
- **Leaving Metaspace unbounded** in environments that generate classes dynamically, so a leak grows silently until the host runs out of memory.
- **Ignoring direct-memory limits**: `OutOfMemoryError: Cannot reserve … bytes of direct buffer memory` comes from `-XX:MaxDirectMemorySize` (default ≈ `-Xmx`), not from the heap.

## Interview questions

**Q1. What is the difference between stack and heap memory in Java?**

````reveal title="Answer"
- **Stacks** are per thread and hold frames with local variables (primitives and references) and operand stacks. They're allocated and freed automatically by calls and returns, and are thread-confined. Too much depth throws `StackOverflowError`.
- **The heap** is shared by all threads, holds all objects and arrays (including their primitive fields), and is reclaimed by the garbage collector. Running out throws `OutOfMemoryError: Java heap space`.

A local reference lives on the stack; the object it refers to lives in the heap.
````

**Q2. What is a stack frame?**

````reveal title="Answer"
The per-invocation record pushed on a thread's JVM stack when a method is called and popped when it returns or throws. It contains:
- the local variable array: `this`, the parameters and the locals, with `long`/`double` taking two slots;
- the operand stack used by bytecode instructions;
- frame data: a link to the class's run-time constant pool, the return address and exception-handling information.

Its size is known at compile time (`max_locals`, `max_stack`).
````

**Q3. Why was PermGen replaced by Metaspace?**

````reveal title="Answer"
PermGen was a fixed-size region inside the heap for class metadata. Its size was hard to predict, which led to `OutOfMemoryError: PermGen space` in apps that load or generate many classes, and it complicated GC. Java 8 moved class metadata to Metaspace in native memory, which grows on demand, is freed per class loader, and is only bounded if you set `-XX:MaxMetaspaceSize`. Interned strings and static fields had moved to the heap.
````

**Q4. Where are static variables and string literals stored?**

````reveal title="Answer"
In HotSpot since Java 8, static fields are stored in the heap as part of the class's `java.lang.Class` mirror object, and the class metadata describing them is in Metaspace. String literals are resolved to `String` objects interned in the string table, which also lives in the heap (since Java 7). That's why they're garbage-collectable once their class is unloaded.
````

**Q5. A container has a 1 GB memory limit and runs with `-Xmx1g`. Why does it get killed?**

````reveal title="Answer"
`-Xmx` caps only the Java heap. The JVM also uses native memory for Metaspace, the code cache, thread stacks, direct and NIO buffers, GC and JIT data structures, and native libraries, typically 100–300 MB or more. Heap plus non-heap exceeds the cgroup limit, and the kernel's OOM killer terminates the process, with no Java `OutOfMemoryError`. Size the heap at a fraction of the limit (for example `-XX:MaxRAMPercentage=70`) and check native usage with Native Memory Tracking.
````

## Hands-on exercise

Write a **memory budget** report for a JVM started with:

`-XX:+UseSerialGC -Xms32m -Xmx32m -XX:MaxMetaspaceSize=64m -XX:ReservedCodeCacheSize=48m -Xss512k -XX:MaxDirectMemorySize=16m`

Print:
- the **max** of each heap pool and the heap total;
- the max of Metaspace (which already includes the Compressed Class Space) and of the code cache;
- the direct-memory cap, read with `HotSpotDiagnosticMXBean.getVMOption("MaxDirectMemorySize")`;
- the stack reserve for 100 threads (`ThreadStackSize` is in KB).

Then print the worst-case total. It's the minimum container size this configuration needs before counting GC and native-library overhead.

````hint title="Hint"
Collect pools with `ManagementFactory.getMemoryPoolMXBeans()`. Group them by `getType()`, and skip `Compressed Class Space` when summing, because `MaxMetaspaceSize` already covers it. `ManagementFactory.getPlatformMXBean(HotSpotDiagnosticMXBean.class).getVMOption("ThreadStackSize").getValue()` returns `"512"` (KB).
````

````solution title="Solution"
```java title="MemoryBudget.java" file="MemoryBudget.java" run="-XX:+UseSerialGC -Xms32m -Xmx32m -XX:MaxMetaspaceSize=64m -XX:ReservedCodeCacheSize=48m -Xss512k -XX:MaxDirectMemorySize=16m"
import com.sun.management.HotSpotDiagnosticMXBean;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryPoolMXBean;
import java.lang.management.MemoryType;

public class MemoryBudget {
    static final double MB = 1024 * 1024;

    public static void main(String[] args) {
        long heap = 0;
        long nonHeap = 0;
        for (MemoryPoolMXBean p : ManagementFactory.getMemoryPoolMXBeans()) {
            long max = p.getUsage().getMax();
            boolean counted = !p.getName().equals("Compressed Class Space");   // already inside MaxMetaspaceSize
            System.out.printf("%-9s %-24s max %6.2f MB%s%n", p.getType() == MemoryType.HEAP ? "heap" : "non-heap",
                    p.getName(), max / MB, counted ? "" : "  (part of Metaspace)");
            if (p.getType() == MemoryType.HEAP) {
                heap += max;
            } else if (counted) {
                nonHeap += max;
            }
        }
        HotSpotDiagnosticMXBean hotspot = ManagementFactory.getPlatformMXBean(HotSpotDiagnosticMXBean.class);
        long direct = Long.parseLong(hotspot.getVMOption("MaxDirectMemorySize").getValue());
        long stackKb = Long.parseLong(hotspot.getVMOption("ThreadStackSize").getValue());
        long stacks = 100 * stackKb * 1024;

        System.out.printf("heap pools total             %6.2f MB  (eden + one survivor + tenured)%n", heap / MB);
        System.out.printf("metaspace + code cache       %6.2f MB%n", nonHeap / MB);
        System.out.printf("direct buffers (cap)         %6.2f MB%n", direct / MB);
        System.out.printf("100 thread stacks x %d KB   %6.2f MB%n", stackKb, stacks / MB);
        System.out.printf("worst case before overheads  %6.2f MB%n", (heap + nonHeap + direct + stacks) / MB);
    }
}
```

```text title="Output" output="MemoryBudget.java"
non-heap  Metaspace                max  64.00 MB
heap      Tenured Gen              max  21.38 MB
heap      Eden Space               max   8.50 MB
heap      Survivor Space           max   1.06 MB
non-heap  Compressed Class Space   max  64.00 MB  (part of Metaspace)
non-heap  CodeCache                max  48.00 MB
heap pools total              30.94 MB  (eden + one survivor + tenured)
metaspace + code cache       112.00 MB
direct buffers (cap)          16.00 MB
100 thread stacks x 512 KB    50.00 MB
worst case before overheads  208.94 MB
```

A JVM with a "32 MB heap" can legitimately use over 200 MB before counting GC structures, symbol tables and native libraries. Every non-heap limit you *don't* set (Metaspace, direct memory) is effectively unbounded. That's why container-sized JVMs need an explicit budget, not just `-Xmx`.
````

## Knowledge check

```quiz
? Where does a primitive field `int quantity` of an Order object live?
+ In the heap, inside the Order object
- On the stack of the method that created the Order
- In Metaspace
> Only local variables live in stack frames.

? Which area is private to each thread?
+ The JVM stack
- The heap
- Metaspace
> Stacks and PC registers are per thread.

? Since Java 8, where does HotSpot keep class metadata?
+ Metaspace, in native memory
- PermGen, in the heap
- The code cache
> PermGen was removed in Java 8.

? What makes a thread overflow its stack sooner?
+ Larger frames, or a smaller stack size
- A larger heap
- More interned strings
> Maximum depth is roughly the stack size divided by the frame size.

? Why does -Xmx not bound a JVM's total memory?
+ Metaspace, code cache, thread stacks and direct buffers live outside the heap
- The heap can grow beyond -Xmx when needed
- -Xmx only applies to the young generation
> Total footprint = heap + many native areas.
```

## Key takeaways

- **Per thread**: PC register, **JVM stack** of frames (locals + operand stack + frame data), native stack. **Shared**: **heap** and **method area**.
- The heap holds **all objects, arrays, static fields (via `Class` mirrors) and interned strings**. Local *references* are on the stack; objects never are, except when escape analysis removes them.
- HotSpot's method area is **Metaspace** (native, unbounded unless capped). JIT output lives in the **code cache**. Direct buffers and thread stacks are native memory.
- Recursion depth = stack size ÷ frame size: `StackOverflowError` is about depth, not heap.
- Real footprint = heap + Metaspace + code cache + stacks + direct memory + GC/JIT overhead. Budget all of it, especially in containers.
