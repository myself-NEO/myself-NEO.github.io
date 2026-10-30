# JVM & Class Loading

### Describe the architecture of the JVM.
`id: jvm-architecture-overview` `level: intermediate` `kind: concept` `lessons: jvm-architecture,runtime-memory-areas`

#### Hints
1. What has to happen before a method can run: finding, verifying and preparing the class?
2. Which memory is shared between threads, and which belongs to one thread?

#### Answer
Three subsystems:
- **Class loader subsystem**: bootstrap → platform → application (→ custom) loaders with parent delegation. They **load** class bytes, **link** them (verify, prepare statics with default values, resolve symbolic references lazily) and **initialise** them (run `<clinit>` once, on first active use).
- **Runtime data areas**:
  - shared: the **heap** (objects, arrays, `Class` mirrors, statics, interned strings) and the **method area** (class metadata, run-time constant pools, bytecode; HotSpot's *Metaspace* in native memory);
  - per thread: the **PC register**, a **JVM stack** of frames (local variables + operand stack) and a **native method stack**.
- **Execution engine**: the **interpreter**, **JIT compilers** (C1/C2, tiered) and the **garbage collector**.

Around them: **JNI / the FFM API** for native code, and HotSpot's **code cache** for compiled code.

#### Why other answers fall short
- **"Heap for objects, stack for primitives."** Primitive *fields* live in heap objects; stacks hold *local variables* (primitives and references).
- **Listing only "class loader, memory, GC".** That misses the execution engine (interpreter + JIT), which explains why Java is fast after warm-up.

#### Follow-up
**Which of these areas can throw `OutOfMemoryError`, and which `StackOverflowError`?** Heap, Metaspace, direct memory and native thread creation can throw OOME. Only stacks (JVM and native) throw `StackOverflowError`, when a thread exceeds its depth.

### "Every Java object has a 12-byte header." True?
`id: spec-vs-hotspot` `level: advanced` `kind: concept` `tricky` `lessons: jvm-architecture,object-allocation-and-layout`

#### Hints
1. Does the JVM specification say anything about object headers?
2. What changes with `-XX:-UseCompressedClassPointers` or Java 25's compact headers?

#### Answer
It's a **HotSpot implementation detail**, true only for 64-bit HotSpot with compressed class pointers (the default): an 8-byte mark word + a 4-byte class pointer. The JVM specification doesn't define object layout at all.
- Without compressed class pointers the header is 16 bytes.
- With `-XX:+UseCompactObjectHeaders` (Java 25) it's **8 bytes**.
- Arrays add a 4-byte length.
- Other JVMs (OpenJ9) use different layouts.

The same distinction applies to "the young generation", "Metaspace", "TLABs" and "C2": those are HotSpot mechanisms, not Java requirements. The specification defines behaviour (bytecode semantics, class-file format, loading rules, the memory model), not mechanisms.

#### Why other answers fall short
- **"Yes, always."** It ignores flags, newer JDKs and other JVMs.
- **"Objects have no header."** Every HotSpot object needs class and lock/GC metadata somewhere.

#### Follow-up
**Why does the minimum object take 16 bytes even with a 12-byte header?** Objects are aligned to 8 bytes (`ObjectAlignmentInBytes`), so 12 rounds up to 16. A single `int` field fits in that padding for free.

### What are the phases of class loading?
`id: class-loading-phases` `level: intermediate` `kind: concept` `lessons: class-loading`

#### Hints
1. Finding the bytes is only the first step.
2. When do static fields get their *default* values, and when do they get their *initial* values?

#### Answer
1. **Loading**: a class loader finds the bytes and creates the class and its `java.lang.Class` object.
2. **Linking**:
   - **verification**: the bytecode is well-formed and type-safe, otherwise `VerifyError`;
   - **preparation**: static fields are allocated and set to defaults (`0`, `null`, `false`);
   - **resolution**: symbolic references (`java/util/List.add`) become direct references, lazily on first use in HotSpot.
3. **Initialisation**: `<clinit>` runs static field initialisers and `static {}` blocks in textual order, **once**, thread-safely, on the **first active use**, after the superclass is initialised.

#### Why other answers fall short
- **"Static blocks run when the class is loaded."** They run at *initialisation*, which can be much later, or never (`Class.forName(name, false, loader)`).
- **Skipping verification.** It's why the interpreter can trust stack and type safety without per-instruction checks.

#### Follow-up
**What is the "initialization-on-demand holder" idiom?** A `private static class Holder { static final Service INSTANCE = new Service(); }`: `Holder` is initialised only when `getInstance()` first touches it, and class initialisation is thread-safe, giving a lazy singleton without locks.

### What does this print?
`id: clinit-trigger-order` `level: intermediate` `kind: output` `tricky` `lessons: class-loading`

```java
static class Config {
    static final int TIMEOUT = 30;
    static final String NAME = "app";
    static final Integer RETRIES = 3;
    static { System.out.println("Config init"); }
}
static class Base { static int count = 1; static { System.out.println("Base init"); } }
static class Derived extends Base { static { System.out.println("Derived init"); } }

System.out.println(Config.TIMEOUT);
System.out.println(Config.NAME);
System.out.println(Derived.count);
System.out.println(Config.RETRIES);
Derived[] arr = new Derived[2];
System.out.println("done " + arr.length);
```

#### Hints
1. Which of `Config`'s fields are compile-time constants?
2. `count` is declared in `Base`. Which class does `Derived.count` really touch?

#### Answer
```text
30
app
Base init
1
Config init
3
done 2
```

- `TIMEOUT` and `NAME` are **compile-time constants** (`static final` primitives and `String` literals): `javac` copied their values into `main`, so `Config` isn't initialised.
- `Derived.count` is a field declared in `Base`, so only **`Base`** is initialised; `Derived` never is.
- `RETRIES` is an `Integer`, not a constant expression, so reading it initialises `Config`.
- Creating `Derived[]` doesn't initialise `Derived`.

#### Why other answers fall short
- **"Config init" first.** That assumes any access to the class initialises it.
- **"Base init, Derived init."** Accessing an inherited static through a subclass initialises only the declaring class.

#### Follow-up
**What happens if you change `TIMEOUT` to 60 and recompile only `Config`?** Classes compiled against the old value still print 30, because the constant was inlined. Recompile the dependants too, or make it non-constant.

### After a few days in production a service gets slower and the log says "CodeCache is full. Compiler has been disabled." What happened?
`id: code-cache-full` `level: advanced` `kind: debugging` `tricky` `lessons: bytecode-and-jit,runtime-memory-areas`

#### Hints
1. Where does the JIT store the machine code it produces?
2. What happens to new hot methods if the JIT can't store their code?

#### Answer
The JIT stores compiled methods (*nmethods*) in the **code cache**, a fixed-size native memory area (`-XX:ReservedCodeCacheSize`, 240 MB by default with tiered compilation). When it fills up:
- the JVM **stops JIT-compiling**;
- newly hot methods and recompilations after deoptimisation stay **interpreted**, often 10–50× slower;
- performance degrades gradually and mysteriously.

Causes:
- very large code bases;
- heavy dynamic code generation (proxies, scripting engines, lambdas in generated code);
- repeated deoptimisation and recompilation cycles;
- a code cache sized too small by an old flag.

Fix:
- check usage with `jcmd <pid> Compiler.codecache` or the `CodeHeap '…'` memory pools;
- raise `-XX:ReservedCodeCacheSize`;
- make sure code cache flushing is enabled (the default);
- investigate excessive deoptimisation (`-XX:+PrintCompilation`, JFR's `Deoptimization` events).

#### Why other answers fall short
- **"It's a heap problem."** The code cache is native memory, outside `-Xmx`, and no `OutOfMemoryError` is thrown.
- **"Restart nightly."** That hides the symptom; size the cache or remove the source of code churn.

#### Follow-up
**Why is the code cache split into three segments?** Non-method code (stubs, the interpreter), profiled C1 code and non-profiled C2 code age differently. Segmenting them reduces fragmentation and lets each be swept efficiently.

### Production logs show `NoClassDefFoundError: Could not initialize class com.acme.TaxRules`, but the JAR is definitely there. What's going on?
`id: could-not-initialize-class` `level: intermediate` `kind: debugging` `tricky` `lessons: class-loading,exception-best-practices`

#### Hints
1. What happens to a class whose static initialiser throws?
2. Where in the log should you look?

#### Answer
`TaxRules`' static initialiser threw an exception the **first** time the class was used: perhaps a missing configuration file, a bad property, or a failing network call in a `static {}` block. That first failure was reported as **`ExceptionInInitializerError`**, with the real cause attached. The JVM then marks the class as **erroneous**, and every later use throws `NoClassDefFoundError: Could not initialize class …` for the life of the JVM. Since Java 17 that error carries the original exception as its cause.

Fix: find the **first** error in the logs and fix the initialiser. Better still, move fragile work (I/O, configuration parsing) out of static initialisers into explicit, retryable initialisation.

#### Why other answers fall short
- **"Redeploy the JAR."** The class file is fine.
- **"Catch NoClassDefFoundError and retry."** Initialisation is never retried in the same class loader.

#### Follow-up
**Why do static initialisers deserve special care?** They run at an unpredictable time (first use), on whatever thread gets there first, under the class initialisation lock, and their failure is permanent. They can also deadlock if two classes' initialisers wait on each other from different threads.

### `ClassCastException: com.acme.Plugin cannot be cast to com.acme.Plugin`. How?
`id: same-name-two-loaders` `level: advanced` `kind: debugging` `tricky` `lessons: class-loading`

#### Hints
1. How does the JVM identify a class at run time: by name alone?
2. Where do application servers and plugin systems load classes from?

#### Answer
At run time a class is identified by its **name *and* its defining class loader**. Two loaders defined `com.acme.Plugin` from the same (or different) bytes, giving two distinct, incompatible classes. The object came from one, and the cast target was resolved through the other. Typical causes:
- the same library both in a web app's `WEB-INF/lib` and in the server's shared lib folder;
- a plugin JAR that bundles an API that the host also provides;
- hot reload tools (Spring DevTools' restart loader) where an old instance meets a new class.

The full message includes the loaders: `(com.acme.Plugin is in unnamed module of loader 'plugin-a' @1b6d3586; com.acme.Plugin is in unnamed module of loader 'app')`.

Fixes: put shared types (APIs and interfaces) only in a common parent loader, and let plugins depend on them without bundling copies. Communicate across loaders through those shared interfaces.

#### Why other answers fall short
- **"A JVM bug."** It's correct behaviour that enables isolation.
- **"Different versions of the class."** Even byte-identical classes are different types under different loaders.

#### Follow-up
**When can a class be unloaded?** Only when its defining loader becomes unreachable, together with all of its classes and their instances. That's why one leftover reference (a `ThreadLocal`, a JDBC driver registration) leaks an entire web app's Metaspace on redeploy.

### What is parent delegation, and why does Java use it?
`id: parent-delegation` `level: beginner` `kind: concept` `lessons: class-loading,jvm-architecture`

#### Hints
1. In what order are the loaders asked for a class?
2. What would happen if an application could supply its own `java.lang.String`?

#### Answer
`ClassLoader.loadClass` first checks whether this loader already loaded the class, then asks its **parent**, recursively up to the **bootstrap** loader. It calls its own `findClass` only if no ancestor can load the class. Benefits:
- **Security**: core classes (`java.lang.*`) always come from the bootstrap loader and can't be replaced by application code.
- **Consistency**: the whole program shares one definition of each JDK class.
- **Efficiency**: each class is loaded once by the highest loader able to load it.

Java 9+ loaders: bootstrap (`null` in Java) → platform → application.

#### Why other answers fall short
- **"The child loader is always asked first."** That's the exception (child-first web-app loaders), not the default.
- **"Delegation is about performance."** It's mainly about type safety and security.

#### Follow-up
**How does JDBC's `DriverManager`, in the bootstrap or platform layer, find driver classes on the application class path?** Through the **thread context class loader** and `ServiceLoader`, which let framework code load classes *below* it in the hierarchy.

### How does HotSpot execute Java bytecode? Explain tiered compilation.
`id: tiered-jit` `level: advanced` `kind: internals` `lessons: bytecode-and-jit`

#### Hints
1. What runs first, before anything is compiled?
2. Why have two JIT compilers?

#### Answer
1. Methods start in the **interpreter** (tier 0), which also collects counters and profiles: invocation and loop counts, branch frequencies, receiver types.
2. Hot methods are compiled by **C1** (tiers 1–3): fast compilation of reasonably good code. Tier 3 inserts profiling.
3. Methods that stay hot are recompiled by **C2** (tier 4), using the profile for aggressive optimisation: inlining, devirtualisation of monomorphic and bimorphic call sites, escape analysis, loop unrolling and vectorisation, intrinsics.
4. **On-stack replacement** switches long-running loops to compiled code mid-method.
5. Optimisations are **speculative**. If an assumption breaks (a new subclass is loaded, a cold branch executes), the code is **deoptimised** back to the interpreter and possibly recompiled.

This gives fast start-up and high peak performance, at the cost of a **warm-up** period.

#### Why other answers fall short
- **"Java is interpreted."** Hot code runs as optimised machine code.
- **"The JIT compiles everything at start-up."** Only hot code is compiled, and it's compiled based on run-time behaviour.

#### Follow-up
**Why must micro-benchmarks use JMH?** Warm-up, OSR, dead-code elimination, constant folding and profile pollution make naive timing loops measure the wrong thing. JMH controls for them with forks, warm-up iterations and `Blackhole`.

### Does `new Point(x, y)` always allocate an object on the heap?
`id: escape-analysis` `level: advanced` `kind: internals` `tricky` `lessons: bytecode-and-jit,object-allocation-and-layout`

#### Hints
1. What if the object never leaves the method that created it?
2. Which compiler performs this optimisation, and when?

#### Answer
Not necessarily. In hot code compiled by C2, **escape analysis** checks whether an object can be observed outside its method or thread: stored in a field, returned, passed to a non-inlined method. If it **doesn't escape**, C2 can **scalar-replace** it: its fields become local values in registers, and **no allocation happens at all**. Locks on non-escaping objects can also be removed.

Measured in the bytecode lesson: a non-escaping `Point` cost **0 bytes per call** after JIT compilation, versus 24 bytes when it escaped, with escape analysis disabled, or in the interpreter.

#### Why other answers fall short
- **"Yes, `new` always means heap allocation."** That's the semantic model, not what optimised code does.
- **"Java allocates small objects on the stack."** HotSpot doesn't do classic stack allocation; it eliminates the object instead, and only for non-escaping objects in C2-compiled code.

#### Follow-up
**How cheap is allocation when an object *does* escape?** Very cheap: bump-pointer allocation in the thread's TLAB, a few instructions with no locking. Short-lived objects then die in eden at almost no cost.

### Where do these live: a local `int`, an `int` field, a local reference, the object it refers to, a static field, an interned string?
`id: where-data-lives` `level: beginner` `kind: concept` `tricky` `lessons: runtime-memory-areas`

#### Hints
1. What does a stack frame contain?
2. Where are static fields stored since Java 8?

#### Answer
| Data | Location |
|---|---|
| local `int` | the current thread's **stack frame** (local variable slot) |
| `int` **field** of an object | inside the object, in the **heap** |
| local reference variable | the **stack frame** |
| the object it points to | the **heap** (unless escape analysis eliminated it) |
| static field | the **heap**, stored with the class's `java.lang.Class` mirror (since Java 8); its *metadata* is in Metaspace |
| interned string / string literal | the **heap** (the string table), since Java 7 |
| class metadata and bytecode | **Metaspace** (the method area, native memory) |
| JIT-compiled code | the **code cache** (native memory) |

#### Why other answers fall short
- **"Primitives on the stack, objects on the heap."** Primitive fields live in the heap.
- **"Statics and string literals are in PermGen."** PermGen no longer exists, and they moved to the heap.

#### Follow-up
**Why are local variables thread-safe but the objects they reference not necessarily?** Each thread has its own stack, so locals are confined; but two threads can hold references to the same heap object.

### Why did Java 8 replace PermGen with Metaspace?
`id: permgen-metaspace` `level: intermediate` `kind: concept` `lessons: runtime-memory-areas`

#### Hints
1. What happened when an app server redeployed many times with PermGen?
2. Where does Metaspace live, and how big can it grow?

#### Answer
PermGen was a **fixed-size** heap region for class metadata, interned strings and static fields. Its right size was hard to predict, so apps that loaded or generated many classes (app servers, proxies, scripting) hit `OutOfMemoryError: PermGen space`. Java 7 moved interned strings out and Java 8 moved statics out (both to the heap); Java 8 replaced PermGen with **Metaspace**:
- class metadata lives in **native memory**;
- it grows on demand;
- it's allocated and freed per class loader;
- it's **unbounded by default**, so set `-XX:MaxMetaspaceSize`;
- a separate *Compressed Class Space* holds class structures addressed with 32-bit offsets.

#### Why other answers fall short
- **"Metaspace can never run out."** It can, with `OutOfMemoryError: Metaspace` (when capped), or by consuming the container's memory (when not).
- **"It fixed class-loader leaks."** Leaked loaders still pin their metadata; Metaspace just grows instead of hitting a small fixed limit.

#### Follow-up
**How do you investigate Metaspace growth?** `jcmd <pid> VM.metaspace`, class-loading counts (`jstat -class`, or `ClassLoadingMXBean`), class histograms, and heap dumps to find what keeps old class loaders reachable.

### A container with a 1 GiB limit runs a JVM with `-Xmx1g` and keeps getting `OOMKilled`. Explain and fix.
`id: container-oomkilled` `level: intermediate` `kind: scenario` `lessons: runtime-memory-areas,jvm-tuning,outofmemory-and-stackoverflow`

#### Hints
1. What does `-Xmx` limit, and what doesn't it?
2. Who kills the process: the JVM or the kernel?

#### Answer
`-Xmx` caps only the **Java heap**. The process also uses native memory for:
- Metaspace;
- the JIT code cache;
- thread stacks (about 1 MB reserved per thread);
- direct and NIO buffers;
- GC data structures and JIT compiler memory;
- symbol and string tables;
- native libraries.

That's often 150–400 MB. Heap plus non-heap exceeds the cgroup limit, and the **kernel's OOM killer** sends SIGKILL, giving exit code 137 / `OOMKilled`, with no Java exception or heap dump.

Fix:
- size the heap as a fraction of the limit: `-XX:MaxRAMPercentage=70` (follows limit changes), or `-Xmx700m`;
- bound the other areas (`MaxMetaspaceSize`, `MaxDirectMemorySize`, thread pool sizes);
- verify with Native Memory Tracking (`-XX:NativeMemoryTracking=summary`, then `jcmd VM.native_memory`).

#### Why other answers fall short
- **"Increase `-Xmx`."** That makes it worse.
- **"It's a Java heap leak."** A heap OOME would show `OutOfMemoryError: Java heap space`; here the JVM never got to throw anything.

#### Follow-up
**How does the JVM know it's in a container?** Since Java 10 (and 8u191) it reads cgroup v1/v2 limits at start-up (`UseContainerSupport`), so `availableProcessors()`, the default heap and GC threads all reflect the container's CPU and memory limits.
