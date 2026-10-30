## Concept explanation

### What "the JVM" is

The **Java Virtual Machine** is an abstract computer defined by **The Java Virtual Machine Specification** (JVMS). The specification says:
- what a `.class` file looks like;
- what every bytecode instruction does;
- how classes are loaded, linked and initialised;
- which run-time memory areas exist;
- which errors are thrown and when.

It deliberately **doesn't** say how to implement any of that: no particular garbage-collection algorithm, object layout or JIT compiler.

Any program that follows the specification is a JVM:

| Implementation | Notes |
|---|---|
| **HotSpot** | the OpenJDK JVM inside almost every distribution (Temurin, Corretto, Oracle JDK, Zulu…) and the one this notebook describes |
| **Eclipse OpenJ9** | IBM's JVM: different GCs, shared class cache, low footprint |
| **GraalVM** | HotSpot with the Graal JIT compiler; *native image* compiles ahead of time and doesn't run a JVM at all |
| **Azul Prime (Zing)** | HotSpot-derived with the Falcon JIT and the pauseless C4 collector |

(Android's ART runs Java-language code compiled to DEX, but it isn't a JVM.)

### The three big parts

1. **Class loader subsystem**: finds class bytes (in the JDK's module image, JARs, directories, the network…), then **loads**, **links** (verifies, prepares, resolves) and **initialises** classes. It's covered in depth in the next lesson.
2. **Runtime data areas**: the memory the running program uses.
   - **Shared by all threads**: the **heap** (objects and arrays) and the **method area** (class metadata, the run-time constant pool, method code).
   - **One per thread**: a **program counter**, a **JVM stack** of frames, and a **native method stack**.
3. **Execution engine**: runs bytecode.
   - An **interpreter** starts executing immediately.
   - **JIT compilers** turn hot methods into machine code.
   - The **garbage collector** reclaims unreachable objects.

Around them sit the **Java Native Interface (JNI)** and, since Java 22, the **Foreign Function & Memory API**, used to call native libraries.

### Specification vs HotSpot

Knowing which side of the line a fact falls on prevents a lot of confusion in interviews:

| The specification requires | HotSpot's implementation choice |
|---|---|
| a heap with automatic storage management | generational and region-based collectors: Serial, Parallel, G1, ZGC, Shenandoah |
| a method area | **Metaspace** (native memory, since Java 8) plus `java.lang.Class` mirrors in the heap |
| JVM stacks with frames | frames on the native thread stack, sized by `-Xss` |
| bytecode semantics | a template interpreter + **C1** and **C2** JIT compilers (tiered) |
| — | object headers, compressed oops, TLABs, the code cache, safepoints |
| the Java Memory Model (JLS §17) | memory barriers emitted per CPU architecture |

## Internal working

What happens between `java -cp app.jar com.shop.Main` and your first line of `main`:

1. **The launcher** (`java`/`java.exe`) parses options, finds the JVM library (`libjvm.so` / `jvm.dll`) and calls `JNI_CreateJavaVM`.
2. **VM start-up**:
   - parse the `-XX` flags;
   - choose a GC and size the heap (**ergonomics**: CPU count, RAM and container limits drive the defaults);
   - reserve memory;
   - start internal threads: the VM thread, GC and JIT compiler threads, and the Java-visible daemon threads *Reference Handler*, *Finalizer*, *Signal Dispatcher* and *Common-Cleaner*.
3. **Bootstrap**: the **bootstrap class loader** (native code, shown as `null` in Java) loads `java.base` classes from the JDK's module image (`lib/modules`). The **Class Data Sharing** archive maps hundreds of pre-parsed core classes straight into memory to speed start-up. Then `System` is initialised and the platform and application class loaders are created.
4. **Main class**: the application class loader loads `com.shop.Main`, links and initialises it, and the launcher calls `main` on the **main** thread.
5. **Execution**:
   - The interpreter runs bytecode while counting method invocations and loop iterations.
   - Hot code is compiled by C1, then by C2, into the **code cache**.
   - Allocation happens in the heap, and the GC runs when needed. It stops threads at **safepoints** when it needs a consistent view.
6. **Exit**:
   - When the last **non-daemon** thread ends, or `System.exit` is called, the JVM runs shutdown hooks and tears down.
   - An uncaught exception in `main` ends only the main thread.

HotSpot names you'll meet in logs and tools:
- `oop` (an object pointer);
- `Klass` (class metadata in Metaspace);
- the **code cache** (`CodeHeap 'profiled nmethods'`…);
- **TLAB** (thread-local allocation buffer);
- **safepoint**;
- **nmethod** (compiled method).

## Visual representation

```text title="JVM architecture (HotSpot names in brackets)"
   java -cp app.jar com.shop.Main
            |
   +--------v-------------------------------------------------------------------+
   | CLASS LOADER SUBSYSTEM   bootstrap -> platform -> application -> custom    |
   |   load  ->  link (verify, prepare, resolve)  ->  initialise (<clinit>)     |
   +--------+-------------------------------------------------------------------+
            v
   +----------------------------------------------------------------------------+
   | RUNTIME DATA AREAS                                                         |
   |  shared:      HEAP (objects, arrays, Class mirrors, interned strings)      |
   |               METHOD AREA [Metaspace: Klass, methods, constant pools]      |
   |               [code cache: JIT-compiled machine code]                      |
   |  per thread:  PC register | JVM stack (frames: locals + operand stack)     |
   |               native method stack                                          |
   +--------+-------------------------------------------------------------------+
            v
   +----------------------------------------------------------------------------+
   | EXECUTION ENGINE   interpreter  ->  JIT [C1 -> C2]   |  garbage collector  |
   +--------+-------------------------------------------------------------------+
            v
     JNI / FFM API  <->  native libraries (OS, libc, your .so/.dll)
```

## Java code example

The `java.lang.management` API exposes many of these components at run time. The example is run with `-XX:+UseSerialGC -Xms64m -Xmx64m`, so the collector and heap sizes are fixed and the output is reproducible.

```java title="JvmTour.java" file="JvmTour.java" run="-XX:+UseSerialGC -Xms64m -Xmx64m"
import java.lang.management.GarbageCollectorMXBean;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryPoolMXBean;
import java.lang.management.MemoryUsage;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

public class JvmTour {
    public static void main(String[] args) {
        // 1. Specification vs implementation
        System.out.println("spec:  " + System.getProperty("java.vm.specification.name") + " " + System.getProperty("java.vm.specification.version"));
        System.out.println("JIT:   " + ManagementFactory.getCompilationMXBean().getName());

        // 2. Class loader subsystem: who loaded what
        for (Class<?> type : List.of(String.class, java.sql.Connection.class, JvmTour.class)) {
            ClassLoader loader = type.getClassLoader();
            System.out.printf("loader %-20s -> %-9s (module %s)%n", type.getSimpleName(),
                    loader == null ? "bootstrap" : loader.getName(), type.getModule().isNamed() ? type.getModule().getName() : "unnamed");
        }

        // 3. Runtime data areas as the JVM reports them
        ManagementFactory.getMemoryPoolMXBeans().stream()
                .sorted(Comparator.comparing((MemoryPoolMXBean p) -> p.getType().toString()).thenComparing(MemoryPoolMXBean::getName))
                .forEach(p -> System.out.printf("pool   %-16s %s%n", p.getType(), p.getName()));
        MemoryUsage heap = ManagementFactory.getMemoryMXBean().getHeapMemoryUsage();
        System.out.println("heap max " + heap.getMax() / 1024 + " KB = 64 MB minus one survivor space");

        // 4. Execution engine: the collectors behind those pools
        for (GarbageCollectorMXBean gc : ManagementFactory.getGarbageCollectorMXBeans()) {
            System.out.println("gc     " + gc.getName() + " manages " + List.of(gc.getMemoryPoolNames()));
        }

        // 5. JVM-internal Java threads that exist before your code creates any
        Set<String> threads = new TreeSet<>();
        for (Thread t : Thread.getAllStackTraces().keySet()) {
            threads.add(t.getName());
        }
        for (String name : List.of("main", "Reference Handler", "Finalizer", "Signal Dispatcher", "Common-Cleaner")) {
            System.out.println("thread " + name + ": " + (threads.contains(name) ? "running" : "absent"));
        }
    }
}
```

## Output

```text title="Output" output="JvmTour.java"
spec:  Java Virtual Machine Specification 17
JIT:   HotSpot 64-Bit Tiered Compilers
loader String               -> bootstrap (module java.base)
loader Connection           -> platform  (module java.sql)
loader JvmTour              -> app       (module unnamed)
pool   Heap memory      Eden Space
pool   Heap memory      Survivor Space
pool   Heap memory      Tenured Gen
pool   Non-heap memory  CodeHeap 'non-nmethods'
pool   Non-heap memory  CodeHeap 'non-profiled nmethods'
pool   Non-heap memory  CodeHeap 'profiled nmethods'
pool   Non-heap memory  Compressed Class Space
pool   Non-heap memory  Metaspace
heap max 63360 KB = 64 MB minus one survivor space
gc     Copy manages [Eden Space, Survivor Space]
gc     MarkSweepCompact manages [Eden Space, Survivor Space, Tenured Gen]
thread main: running
thread Reference Handler: running
thread Finalizer: running
thread Signal Dispatcher: running
thread Common-Cleaner: running
```

- `String` came from the **bootstrap** loader (reported as `null`), `java.sql.Connection` from the **platform** loader, and your class from the **application** loader.
- The heap pools (Eden, Survivor, Tenured) belong to the Serial collector: a different `-XX:+Use…GC` flag gives different pool names. The non-heap pools are **Metaspace** (the method area), **Compressed Class Space**, and the three **CodeHeap** segments of the JIT's code cache.
- The max heap is 64 MB minus one survivor space: in a copying young generation, one survivor is always empty, so the JVM doesn't count it as usable.
- The JVM had already started its housekeeping threads before `main` ran.

## Real-world application

- **Reading production signals**: GC logs, `OutOfMemoryError: Metaspace`, JIT warnings ("CodeCache is full"), and thread dumps full of JVM-internal threads all make sense once you know the components.
- **Monitoring**: Micrometer, Prometheus JMX exporters and APM agents read exactly these MXBeans: memory pools, GC counts and times, threads, class loading.
- **Choosing a runtime**:
  - HotSpot with G1 is the default everywhere;
  - OpenJ9 for low footprint;
  - Azul Prime for low latency;
  - GraalVM native image for fast start-up (serverless, CLIs), at the cost of a closed world and peak-performance trade-offs.
- **Containers**: ergonomics read the container's CPU and memory limits at start-up, which is why the same image behaves differently with different Kubernetes limits.

## Common mistakes

- **Treating HotSpot behaviour as Java behaviour**: "Java has a young generation", "objects have 12-byte headers", "strings live in PermGen". Those are implementation details, and some are outdated.
- **Saying "the stack holds primitives and the heap holds objects"** too simply. Primitive *fields* live inside heap objects; local variables live in frames; the JIT may keep objects out of the heap entirely (escape analysis).
- **Confusing the JVM with the JDK or JRE**: the JVM runs bytecode; the JDK adds `javac`, `jcmd` and other tools (see JDK, JRE & JVM).
- **Assuming one JVM per machine.** Each `java` process is its own JVM, with its own heap and flags.
- **Ignoring daemon vs non-daemon threads**: the JVM stays alive until every non-daemon thread finishes.

## Interview questions

**Q1. Describe the JVM architecture.**

````reveal title="Answer"
- **Class loader subsystem**: loads class bytes through the bootstrap, platform and application loaders using parent delegation, then links (verify, prepare, resolve) and initialises them.
- **Runtime data areas**:
  - shared: the heap for objects and the method area for class metadata, run-time constant pools and code (HotSpot: Metaspace);
  - per thread: a PC register, a JVM stack of frames (local variables and an operand stack) and a native method stack.
- **Execution engine**: an interpreter, JIT compilers (C1/C2 in HotSpot) and the garbage collector.
- **Native interface**: JNI/FFM to call native libraries.
````

**Q2. What is the difference between the JVM specification and HotSpot?**

````reveal title="Answer"
The specification defines behaviour: the class-file format, bytecode semantics, loading/linking/initialisation rules, verification, run-time data areas in abstract terms, and exceptions. HotSpot is one implementation that chooses concrete mechanisms: Metaspace for the method area, tiered C1/C2 compilation, specific GC algorithms, object headers and compressed oops, TLAB allocation, safepoints. Other JVMs (OpenJ9, Azul) make different choices while running the same bytecode.
````

**Q3. What happens when you run `java Main`?**

````reveal title="Answer"
1. The launcher starts the JVM: it parses flags, applies ergonomics (GC and heap size from CPUs, RAM and the container), creates the heap and internal threads.
2. The bootstrap loader loads core `java.base` classes, assisted by the CDS archive, and system initialisation creates the platform and application loaders.
3. The application loader loads, links and initialises `Main`, and the launcher invokes `main` on the main thread.
4. Bytecode is interpreted, hot methods are JIT-compiled, and the GC reclaims memory.
5. When all non-daemon threads finish (or `System.exit` is called), shutdown hooks run and the JVM exits.
````

**Q4. Which memory areas are shared between threads and which are per thread?**

````reveal title="Answer"
Shared: the heap (objects, arrays, `Class` mirrors, interned strings) and the method area (class metadata, run-time constant pools, bytecode; plus HotSpot's code cache). Per thread: the program counter register, the JVM stack of frames holding local variables and operand stacks, and the native method stack. That's why local variables are thread-confined, while objects reachable from several threads need synchronisation.
````

**Q5. Is Java interpreted or compiled?**

````reveal title="Answer"
Both. `javac` compiles source to platform-independent bytecode ahead of time. At run time HotSpot starts by interpreting bytecode, profiles it, and JIT-compiles hot methods to optimised machine code (C1 quickly, C2 aggressively, using the profile). Long-running Java therefore runs mostly as compiled machine code. GraalVM native image goes further, compiling everything ahead of time.
````

## Hands-on exercise

Write `ClassOrigins`, which reports for several JDK and application classes:
- the module;
- the class loader (`bootstrap` for `null`);
- where the class file came from: the protocol of `type.getResource(simpleName + ".class")`, `jrt` for the JDK's module image or `file` for your class path.

Use `String`, `java.util.logging.Logger`, `java.sql.Connection`, `java.net.http.HttpClient` and your own class. Then print the full parent chain of the application class loader.

````hint title="Hint"
`type.getResource(type.getSimpleName() + ".class").getProtocol()`. Walk the loaders with `for (ClassLoader l = ClassOrigins.class.getClassLoader(); l != null; l = l.getParent())`, and print `bootstrap` when you reach `null`.
````

````solution title="Solution"
```java title="ClassOrigins.java" file="ClassOrigins.java"
import java.net.URL;
import java.util.List;

public class ClassOrigins {
    public static void main(String[] args) {
        List<Class<?>> types = List.of(String.class, java.util.logging.Logger.class, java.sql.Connection.class,
                java.net.http.HttpClient.class, ClassOrigins.class);
        for (Class<?> type : types) {
            ClassLoader loader = type.getClassLoader();
            URL source = type.getResource(type.getSimpleName() + ".class");
            System.out.printf("%-12s module %-14s loader %-10s from %s%n", type.getSimpleName(),
                    type.getModule().isNamed() ? type.getModule().getName() : "(unnamed)",
                    loader == null ? "bootstrap" : loader.getName(),
                    source.getProtocol());
        }

        StringBuilder chain = new StringBuilder();
        for (ClassLoader l = ClassOrigins.class.getClassLoader(); l != null; l = l.getParent()) {
            chain.append(l.getName()).append(" -> ");
        }
        System.out.println("delegation chain: " + chain + "bootstrap");
    }
}
```

```text title="Output" output="ClassOrigins.java"
String       module java.base      loader bootstrap  from jrt
Logger       module java.logging   loader bootstrap  from jrt
Connection   module java.sql       loader platform   from jrt
HttpClient   module java.net.http  loader platform   from jrt
ClassOrigins module (unnamed)      loader app        from file
delegation chain: app -> platform -> bootstrap
```

JDK classes come from the `jrt:` module image and are split between the bootstrap loader (core modules such as `java.base` and `java.logging`) and the platform loader (`java.sql`, `java.net.http`). Your class comes from a `file:` location on the class path, through the application loader, whose parents end at the bootstrap loader.
````

## Knowledge check

```quiz
? Which document defines bytecode semantics and the class-file format?
+ The Java Virtual Machine Specification
- The HotSpot source code
- The javac manual
> HotSpot is one implementation of the specification.

? Which runtime area is shared by all threads?
+ The heap
- The JVM stack
- The program counter register
> Stacks and PC registers are per thread; the heap and method area are shared.

? In HotSpot since Java 8, where is class metadata stored?
+ Metaspace, in native memory
- PermGen, inside the heap
- The thread stacks
> PermGen was removed in Java 8.

? What does String.class.getClassLoader() return?
+ null, meaning the bootstrap loader
- The application class loader
- The platform class loader
> The bootstrap loader is implemented natively and represented as null.

? When does the JVM exit normally?
+ When the last non-daemon thread ends, or System.exit is called
- As soon as main returns
- When the garbage collector has nothing left to collect
> Daemon threads don't keep the JVM alive; non-daemon threads do.
```

## Key takeaways

- The JVM is a **specification**; **HotSpot** is the common implementation. Know which facts are which.
- Three subsystems: the **class loader subsystem** (load, link, initialise), the **runtime data areas** (shared heap and method area; per-thread PC, stack and native stack), and the **execution engine** (interpreter, JIT, GC).
- HotSpot specifics: **Metaspace**, the **code cache**, **tiered C1/C2**, pluggable **GCs**, **safepoints**, **ergonomics**.
- Start-up runs: launcher → VM creation → bootstrap loader + CDS → application loader → `main`. Exit happens when non-daemon threads finish.
- MXBeans (`java.lang.management`) expose pools, collectors, threads and class loading. Monitoring tools are built on them.
