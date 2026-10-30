## Concept explanation

### Bytecode: the JVM's instruction set

`javac` doesn't produce machine code. It produces **bytecode**: compact, one-byte opcodes for an abstract **stack machine**. Each method frame has:
- an array of **local variable slots**: `this` in slot 0 for instance methods, then the parameters, then the locals; `long` and `double` take two slots;
- an **operand stack**: instructions pop their inputs from it and push their results onto it.

`a + b` for two `int` parameters of a static method becomes:

```text
iload_0      // push local 0 (a)
iload_1      // push local 1 (b)
iadd         // pop two ints, push their sum
ireturn      // pop and return it
```

Instruction families you'll recognise in `javap -c` output:

| Family | Examples |
|---|---|
| load / store locals | `iload`, `aload`, `istore`, `astore` (the prefix is the type: `i` int, `l` long, `d` double, `a` reference) |
| constants | `iconst_1`, `bipush 100`, `sipush 1024`, `ldc "text"` |
| arithmetic / compare | `iadd`, `imul`, `iinc`, `if_icmpgt`, `goto` |
| objects and fields | `new`, `dup`, `getfield`, `putfield`, `getstatic`, `newarray`, `checkcast`, `instanceof` |
| **method calls** | `invokestatic` (static), `invokevirtual` (class methods, virtual dispatch), `invokeinterface` (interface methods), `invokespecial` (constructors, `private`, `super.`), **`invokedynamic`** (lambdas, string concatenation, records, pattern switches) |

Types appear as **descriptors**: `(II)I` is `int f(int, int)`; `(Ljava/lang/String;)V` is `void f(String)`; `[B` is `byte[]`.

Read bytecode with **`javap -c -p MyClass`**, adding `-v` for the constant pool, or use your IDE's bytecode viewer.

### The interpreter and the JIT

The JVM begins by **interpreting** bytecode. HotSpot's template interpreter is fast for an interpreter, but still far slower than native code. While interpreting, it **profiles**: invocation counts, loop back-edge counts, which branches are taken, which receiver types appear at each call site.

Hot code is compiled **just in time** with **tiered compilation**:

| Tier | Executed by | Purpose |
|---|---|---|
| 0 | interpreter | start immediately, collect basic counts |
| 1–3 | **C1** (client compiler) | compile quickly. Tier 3 adds profiling code; tiers 1–2 are used for trivial methods or when C2 is busy |
| 4 | **C2** (server compiler) | heavy, profile-guided optimisation for peak performance |

**On-stack replacement (OSR)** compiles a long-running *loop* and switches to the compiled version **in the middle of the method**, so a `main` with one huge loop doesn't stay interpreted forever.

### What the JIT does with your code

- **Inlining**: copies small or hot callees into the caller, which removes call overhead and, more importantly, exposes further optimisations. Getters and setters cost nothing after inlining.
- **Devirtualisation**: if a call site has only ever seen one receiver class (*monomorphic*) or two (*bimorphic*), C2 inlines those directly behind a cheap type check. Many types (*megamorphic*) means a real virtual call.
- **Escape analysis**: if an object never escapes a method (not stored in a field, not returned, not passed to non-inlined code), C2 can **scalar-replace** it, keeping its fields in registers with no heap allocation at all, and remove locks on it.
- **Loop optimisations**: unrolling, range-check elimination, vectorisation (SIMD).
- **Intrinsics**: hand-written machine code for `System.arraycopy`, `Math` functions, `String.equals`, CRC32, AES…
- **Speculation + deoptimisation**: C2 optimises for what it has *seen*, such as "this branch never runs" or "only one subclass exists". If the assumption breaks (a new subclass is loaded, or the cold branch finally runs), the compiled code is **deoptimised**: marked *not entrant*, and execution falls back to the interpreter until it's recompiled.

This is why Java code gets faster after **warm-up**, and why naive micro-benchmarks lie: they measure the interpreter, or code the JIT removed. Use **JMH**.

## Internal working

- **Class files** contain a constant pool (strings, class names, method references), field and method tables, and a `Code` attribute per method holding the bytecode, `max_stack`, `max_locals` and the exception table. The verifier proves stack and type safety once, at link time, so the interpreter doesn't check types on every instruction.
- **`invokedynamic`** call sites are linked once by a **bootstrap method**:
  - `LambdaMetafactory` for lambdas;
  - `StringConcatFactory.makeConcatWithConstants` for `+` on strings (Java 9+), which generates an optimised concatenation strategy at run time;
  - `ObjectMethods` for records;
  - `SwitchBootstraps` for pattern switches.

  The result is a `CallSite` the JIT can inline like an ordinary call.
- **Compilation policy**:
  - Counters on methods and loop back-edges trigger compilation.
  - Thresholds are in the thousands, scaled by load (`Tier3InvocationThreshold`, `Tier4InvocationThreshold`).
  - Compilation normally happens on **background compiler threads** while the interpreter keeps running; `-Xbatch` makes callers wait, which is useful for reproducible experiments.
- **The code cache** stores compiled methods (*nmethods*). It's segmented into non-method code, profiled code (C1) and non-profiled code (C2). If it fills up, the JVM logs "CodeCache is full. Compiler has been disabled" and performance collapses. Size it with `-XX:ReservedCodeCacheSize`.
- **Deoptimisation** happens through **uncommon traps** compiled into the speculative code: reaching one rebuilds interpreter frames from the compiled frame's state. "Made not entrant" means new calls won't enter that code version; "made zombie" means it can be freed.
- **Diagnostic flags**:
  - `-XX:+PrintCompilation`: one line per compile (columns: time, id, flags such as `%` for OSR and `b` for blocking, tier, method, and "made not entrant");
  - `-XX:+UnlockDiagnosticVMOptions -XX:+PrintInlining`: inlining decisions;
  - `-Xint`: interpreter only;
  - `-XX:TieredStopAtLevel=1`: C1 only, for fast start-up;
  - JFR's compilation events.
- **Beyond HotSpot's JITs**:
  - **Graal** is a JIT written in Java;
  - **GraalVM native image** compiles ahead of time;
  - **Project Leyden** (AOT class loading in 24, AOT method profiling in 25) caches start-up and profiling work between runs.

## Visual representation

```text title="From source to machine code"
  int sumTo(int n) {               javac            bytecode (javap -c)                    JIT
    int total = 0;              ----------->    0: iconst_0                         interpreted (tier 0),
    for (int i = 1; i <= n; i++)                1: istore_1      // total            counting calls and
      total += i;                               2: iconst_1                          loop back-edges
    return total;                               3: istore_2      // i                       |
  }                                             4: iload_2                                  v
                                                5: iload_0       // n               C1 tier 3 (with profiling)
                                                6: if_icmpgt 19                             |
  operand stack while executing iadd:           9: iload_1                                  v
     | i     |  <- top                         10: iload_2                          C2 tier 4: inlined, unrolled,
     | total |                                 11: iadd                             registers only
     +-------+  -> iadd -> | total+i |         12: istore_1                                 |
                                               13: iinc 2, 1     // i++              assumption broken?
                                               16: goto 4                           -> deoptimise ("made not
                                               19: iload_1                              entrant") -> interpreter
                                               20: ireturn
```

## Java code example

The program disassembles a small class with the JDK's `javap` tool, called in-process through `ToolProvider`. It then starts child JVMs to watch the JIT at work: tier transitions with `-XX:+PrintCompilation`, and escape analysis measured as bytes allocated per call.

```java title="BytecodeDemo.java" file="BytecodeDemo.java"
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.lang.management.ManagementFactory;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.spi.ToolProvider;

public class BytecodeDemo {
    static class Calc {
        static int add(int a, int b) {
            return a + b;
        }

        static int sumTo(int n) {
            int total = 0;
            for (int i = 1; i <= n; i++) {
                total += i;
            }
            return total;
        }

        static String greet(String name, List<String> tags) {
            return "Hi " + name.trim() + " (" + tags.size() + " tags)";
        }
    }

    static class Hot {
        static int work(int x) {
            return x * 31 + (x >>> 3);
        }

        static long loop() {
            long sum = 0;
            for (int i = 0; i < 2_000_000; i++) {
                sum += work(i);
            }
            return sum;
        }
    }

    record Point(int x, int y) { }

    static Point escaped;

    static int noEscape(int i) {
        Point p = new Point(i, i + 1);        // never leaves this method
        return p.x() + p.y();
    }

    static int escapes(int i) {
        Point p = new Point(i, i + 1);
        escaped = p;                          // stored in a static field: escapes
        return p.x() + p.y();
    }

    public static void main(String[] args) throws Exception {
        if (args.length == 1 && args[0].equals("hot")) {
            System.out.println(Hot.loop());
            return;
        }
        if (args.length == 1 && args[0].equals("alloc")) {
            measureAllocation();
            return;
        }

        System.out.println("=== javap -c BytecodeDemo$Calc ===");
        StringWriter out = new StringWriter();
        ToolProvider javap = ToolProvider.findFirst("javap").orElseThrow();
        javap.run(new PrintWriter(out), new PrintWriter(System.err), "-c", "-cp", System.getProperty("java.class.path"), "BytecodeDemo$Calc");
        System.out.print(out);

        System.out.println("=== JIT tiers for Hot (-Xbatch -XX:+PrintCompilation) ===");
        for (String line : runChild(List.of("-Xbatch", "-XX:+PrintCompilation"), "hot")) {
            String event = describeCompilation(line);
            if (event != null) {
                System.out.println(event);
            }
        }

        System.out.println("=== escape analysis: bytes allocated per call ===");
        for (List<String> flags : List.of(List.of("-Xbatch"), List.of("-Xbatch", "-XX:-DoEscapeAnalysis"), List.of("-Xint"))) {
            System.out.printf("%-32s %s%n", String.join(" ", flags), runChild(flags, "alloc").get(0));
        }
    }

    // Turns "  63   79    b  4    BytecodeDemo$Hot::work (9 bytes)" into a readable event.
    static String describeCompilation(String line) {
        if (!line.contains("BytecodeDemo$Hot::")) {
            return null;
        }
        String[] tokens = line.trim().split("\\s+");
        boolean osr = false;
        int i = 2;                                         // skip timestamp and compile id
        while (!tokens[i].matches("[0-4]")) {
            osr |= tokens[i].equals("%");
            i++;
        }
        String tier = tokens[i];
        String method = tokens[i + 1].replace("BytecodeDemo$", "");
        String kind = tier.equals("4") ? "C2" : "C1";
        String what = osr ? "OSR compile of the loop in " + method : "compile " + method;
        return line.contains("made not entrant")
                ? "  tier " + tier + " (" + kind + ") code for " + method + (osr ? " [OSR]" : "") + " made not entrant"
                : "  tier " + tier + " (" + kind + ") " + what;
    }

    static void measureAllocation() {
        com.sun.management.ThreadMXBean threads = (com.sun.management.ThreadMXBean) ManagementFactory.getThreadMXBean();
        for (int round = 0; round < 3; round++) {             // warm up both methods
            for (int i = 0; i < 200_000; i++) {
                noEscape(i);
                escapes(i);
            }
        }
        int n = 1_000_000;
        long sum = 0;
        long start = threads.getCurrentThreadAllocatedBytes();
        for (int i = 0; i < n; i++) {
            sum += noEscape(i);
        }
        long middle = threads.getCurrentThreadAllocatedBytes();
        for (int i = 0; i < n; i++) {
            sum += escapes(i);
        }
        long end = threads.getCurrentThreadAllocatedBytes();
        System.out.println("noEscape " + Math.round((middle - start) / (double) n) + " B/call, escapes "
                + Math.round((end - middle) / (double) n) + " B/call" + (sum == 0 ? "!" : ""));
    }

    static List<String> runChild(List<String> flags, String mode) throws IOException, InterruptedException {
        List<String> command = new ArrayList<>();
        command.add(Path.of(System.getProperty("java.home"), "bin", "java").toString());
        command.addAll(flags);
        command.addAll(List.of("-cp", System.getProperty("java.class.path"), "BytecodeDemo", mode));
        Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
        List<String> lines = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            for (String line = reader.readLine(); line != null; line = reader.readLine()) {
                lines.add(line);
            }
        }
        process.waitFor();
        return lines;
    }
}
```

## Output

```text title="Output" output="BytecodeDemo.java"
=== javap -c BytecodeDemo$Calc ===
Compiled from "BytecodeDemo.java"
class BytecodeDemo$Calc {
  BytecodeDemo$Calc();
    Code:
       0: aload_0
       1: invokespecial #1                  // Method java/lang/Object."<init>":()V
       4: return

  static int add(int, int);
    Code:
       0: iload_0
       1: iload_1
       2: iadd
       3: ireturn

  static int sumTo(int);
    Code:
       0: iconst_0
       1: istore_1
       2: iconst_1
       3: istore_2
       4: iload_2
       5: iload_0
       6: if_icmpgt     19
       9: iload_1
      10: iload_2
      11: iadd
      12: istore_1
      13: iinc          2, 1
      16: goto          4
      19: iload_1
      20: ireturn

  static java.lang.String greet(java.lang.String, java.util.List<java.lang.String>);
    Code:
       0: aload_0
       1: invokevirtual #7                  // Method java/lang/String.trim:()Ljava/lang/String;
       4: aload_1
       5: invokeinterface #13,  1           // InterfaceMethod java/util/List.size:()I
      10: invokedynamic #19,  0             // InvokeDynamic #0:makeConcatWithConstants:(Ljava/lang/String;I)Ljava/lang/String;
      15: areturn
}
=== JIT tiers for Hot (-Xbatch -XX:+PrintCompilation) ===
  tier 3 (C1) compile Hot::work
  tier 4 (C2) compile Hot::work
  tier 3 (C1) code for Hot::work made not entrant
  tier 3 (C1) OSR compile of the loop in Hot::loop
  tier 3 (C1) compile Hot::loop
  tier 4 (C2) OSR compile of the loop in Hot::loop
  tier 3 (C1) code for Hot::loop [OSR] made not entrant
  tier 4 (C2) code for Hot::loop [OSR] made not entrant
=== escape analysis: bytes allocated per call ===
-Xbatch                          noEscape 0 B/call, escapes 24 B/call
-Xbatch -XX:-DoEscapeAnalysis    noEscape 24 B/call, escapes 24 B/call
-Xint                            noEscape 24 B/call, escapes 24 B/call
```

- `add` is four instructions on the operand stack. `sumTo`'s loop is `iload`/`if_icmpgt`/`iinc`/`goto`.
- `greet` shows three call kinds: `invokevirtual` for `String.trim`, `invokeinterface` for `List.size`, and `invokedynamic` for the whole string concatenation (`makeConcatWithConstants`).
- `Hot::work` was compiled by C1 (tier 3, with profiling), then by C2 (tier 4), and the tier 3 version was retired (*made not entrant*). The long loop in `loop` got **OSR** compilations, so it switched to compiled code mid-loop.
- The final "made not entrant" lines are **deoptimisations**: once the loop finished, the compiled loop code hit a path it had never seen (the exit) and was discarded.
- Escape analysis removed the `Point` allocation entirely in `noEscape` (0 bytes per call). With escape analysis disabled, or in the interpreter (`-Xint`), every call allocated a 24-byte object.

## Real-world application

- **Benchmarking correctly**: use JMH, which handles warm-up, dead-code elimination (`Blackhole`), forking and statistics. A `System.nanoTime()` loop around 1,000 calls mostly measures the interpreter.
- **Start-up vs peak performance**:
  - CLIs and serverless functions care about start-up: use `-XX:TieredStopAtLevel=1`, CDS/AOT caches, or GraalVM native image.
  - Long-running services care about peak throughput after C2 warm-up. Kubernetes readiness probes and warm-up traffic exist partly for this.
- **Performance cliffs**:
  - a megamorphic call site (an interface with many implementations in a hot loop) can't be inlined;
  - methods too large to inline (over ~325 bytes of bytecode when hot) block optimisation;
  - a full code cache stops compilation entirely.
- **Reading bytecode** answers language questions definitively: what `+=` on strings compiles to, how `switch` on strings works, how lambdas capture variables, whether autoboxing happens.
- **Bytecode tooling**: ASM, ByteBuddy, Javassist, the Class-File API (Java 24), agents for APM and code coverage (JaCoCo) all read and write this instruction set.

## Common mistakes

- **Micro-benchmarking without warm-up or JMH**, then concluding "X is faster".
- **Manual "optimisations" the JIT already does**: caching getter results, avoiding small methods, unrolling loops. They make code worse and gain nothing.
- **Assuming every `new` allocates on the heap.** Escape analysis can eliminate it, so measure.
- **Assuming the JIT is always on**: debugging with `-Xint` or attaching certain agents changes performance completely.
- **Huge methods**: HotSpot doesn't JIT-compile methods over 8,000 bytes of bytecode at all (`HugeMethodLimit`, enforced by `DontCompileHugeMethods`, on by default), and big methods inline badly. Keep hot methods small and focused.
- **Reading `javap` output without `-p`** and wondering where the private methods went.

## Interview questions

**Q1. What is bytecode, and why does Java use it?**

````reveal title="Answer"
Bytecode is the instruction set of the JVM's abstract stack machine, stored in `.class` files. Each method has local variable slots and an operand stack, and instructions push and pop values. It makes compiled Java portable ("write once, run anywhere"), compact, and verifiable before execution. Each JVM translates it to machine code for its own platform by interpreting and JIT-compiling it.
````

**Q2. How does JIT compilation work in HotSpot?**

````reveal title="Answer"
1. Methods start in the interpreter, which counts invocations and loop back-edges and records profiles (branch frequencies, receiver types).
2. With tiered compilation, hot methods are compiled by C1 (fast, tier 3 adds profiling).
3. Still-hot methods are recompiled by C2 (tier 4) with aggressive, profile-guided optimisations: inlining, devirtualisation, escape analysis, loop optimisations and intrinsics.
4. Long loops are switched to compiled code mid-execution via on-stack replacement.
5. If a speculative assumption breaks, the code is deoptimised back to the interpreter and possibly recompiled.
````

**Q3. What are `invokevirtual`, `invokeinterface`, `invokespecial`, `invokestatic` and `invokedynamic`?**

````reveal title="Answer"
- `invokestatic` calls static methods.
- `invokevirtual` calls instance methods declared in classes, with virtual dispatch through the vtable.
- `invokeinterface` calls methods through an interface type (itable dispatch).
- `invokespecial` calls without virtual dispatch: constructors (`<init>`), private methods and `super.method()`.
- `invokedynamic` defers linkage to a bootstrap method at run time. It's used for lambdas, string concatenation, records' `equals`/`hashCode`/`toString`, and pattern switches.
````

**Q4. What is escape analysis?**

````reveal title="Answer"
A C2 analysis that determines whether an object can be observed outside the method (or thread) that created it. If it doesn't escape, the JIT can:
- scalar-replace it, keeping its fields in registers with no heap allocation;
- remove synchronisation on it (lock elision);
- allocate it on the stack conceptually.

It relies on inlining: passing the object to a non-inlined method counts as escaping.
````

**Q5. What is deoptimisation, and when does it happen?**

````reveal title="Answer"
C2 compiles speculatively, based on profiles and class-hierarchy assumptions: "this branch is never taken", "only one implementation of this interface is loaded", "this call site always sees `ArrayList`". When a speculation fails, for example a new subclass is loaded or a cold branch executes, the JVM hits an uncommon trap, reconstructs interpreter frames, marks the compiled code *not entrant*, and continues in the interpreter. The method may be recompiled later with updated profiles.
````

## Hands-on exercise

Use `javap` (through `ToolProvider`) to settle a classic question. Write two methods that join a `List<String>`:
- `joinWithPlus`: `result += s` in a loop;
- `joinWithBuilder`: a `StringBuilder` with `append`.

Disassemble the class and print, for each method:
- how many `invokedynamic` instructions it contains;
- how many `new` instructions;
- how many method calls (`invokevirtual` + `invokeinterface`).

Then explain why the first is O(n²) for large lists.

````hint title="Hint"
Run `javap -c -cp <class path> ConcatBytecode` into a `StringWriter`. Split the output into methods: a new section starts at each line that begins with two spaces, contains `(` and ends with `;`. Count lines containing `invokedynamic`, `: new` and `invoke(virtual|interface)` within each section.
````

````solution title="Solution"
```java title="ConcatBytecode.java" file="ConcatBytecode.java"
import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.spi.ToolProvider;

public class ConcatBytecode {
    static String joinWithPlus(List<String> parts) {
        String result = "";
        for (String s : parts) {
            result += s;                    // a brand-new String every iteration
        }
        return result;
    }

    static String joinWithBuilder(List<String> parts) {
        StringBuilder result = new StringBuilder();
        for (String s : parts) {
            result.append(s);               // amortised O(1) append into one buffer
        }
        return result.toString();
    }

    public static void main(String[] args) {
        StringWriter out = new StringWriter();
        ToolProvider.findFirst("javap").orElseThrow()
                .run(new PrintWriter(out), new PrintWriter(System.err), "-c", "-cp", System.getProperty("java.class.path"), "ConcatBytecode");

        Map<String, int[]> counts = new LinkedHashMap<>();   // method -> {indy, new, calls}
        String current = null;
        for (String line : out.toString().split("\\R")) {
            if (line.startsWith("  ") && !line.startsWith("   ") && line.contains("(") && line.endsWith(";")) {
                current = line.trim();
                counts.put(current, new int[3]);
            } else if (current != null) {
                int[] c = counts.get(current);
                if (line.contains("invokedynamic")) c[0]++;
                if (line.contains(": new ")) c[1]++;
                if (line.matches(".*invoke(virtual|interface).*")) c[2]++;
            }
        }
        counts.forEach((method, c) -> {
            if (method.contains("join")) {
                System.out.printf("%-58s invokedynamic=%d new=%d calls=%d%n", method, c[0], c[1], c[2]);
            }
        });
        System.out.println(joinWithPlus(List.of("a", "b", "c")).equals(joinWithBuilder(List.of("a", "b", "c"))));
    }
}
```

```text title="Output" output="ConcatBytecode.java"
static java.lang.String joinWithPlus(java.util.List<java.lang.String>); invokedynamic=1 new=0 calls=3
static java.lang.String joinWithBuilder(java.util.List<java.lang.String>); invokedynamic=0 new=1 calls=5
true
```

- `joinWithPlus` contains an `invokedynamic` (string concatenation) **inside the loop**, so every iteration builds a brand-new `String` and copies everything accumulated so far: O(n²) characters copied in total.
- `joinWithBuilder` allocates one `StringBuilder` (`new`) before the loop and calls `append` on it. The buffer grows geometrically, giving O(n) overall.
- The Java 9+ `invokedynamic` concatenation is fast for a single expression like `"Hi " + name`; the problem is only the loop.
````

## Knowledge check

```quiz
? What does `iadd` do?
+ Pops two ints from the operand stack and pushes their sum
- Adds 1 to a local variable
- Adds two longs
> iinc increments a local; ladd adds longs.

? Which instruction calls a constructor?
+ invokespecial
- invokevirtual
- invokedynamic
> Constructors, private methods and super calls use invokespecial.

? In HotSpot tiered compilation, which tier is C2?
+ Tier 4
- Tier 1
- Tier 0
> Tier 0 is the interpreter; tiers 1-3 are C1.

? What is on-stack replacement (OSR)?
+ Switching a long-running loop to compiled code in the middle of the method
- Replacing the thread stack with a bigger one
- Moving objects from the stack to the heap
> It lets a single long loop benefit from the JIT without the method being called again.

? Why can a micro-benchmark that times a loop 1,000 times be misleading?
+ The code may still be interpreted, or the JIT may remove the measured work
- System.nanoTime is inaccurate
- The garbage collector can't run during loops
> Warm-up, dead-code elimination and OSR distort naive timings; use JMH.
```

## Key takeaways

- **Bytecode** is a stack machine: local slots + an operand stack. Read it with **`javap -c -p`**. Know the five **invoke** instructions; `invokedynamic` powers lambdas, string concatenation, records and pattern switches.
- HotSpot **interprets first, profiles, then JIT-compiles**: C1 (tiers 1–3) then **C2** (tier 4), with **OSR** for long loops.
- The JIT inlines, devirtualises, **eliminates allocations via escape analysis**, unrolls loops and uses intrinsics, all **speculatively**, with **deoptimisation** when assumptions break.
- Performance depends on **warm-up**; benchmark with **JMH**; keep hot methods small and call sites monomorphic where it matters.
