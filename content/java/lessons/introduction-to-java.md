## Concept explanation

Java is a **statically typed, class-based, object-oriented language** that compiles to a portable instruction format called **bytecode** and runs on a **Java Virtual Machine (JVM)**. Memory is managed by a **garbage collector**, and threads, networking and a large standard library are part of the platform.

It was created at Sun Microsystems by James Gosling's team and released in 1996. Oracle acquired Sun in 2010. Today the reference implementation is **OpenJDK**, an open-source project; most "Java" you download (Eclipse Temurin, Amazon Corretto, Oracle JDK, Microsoft Build of OpenJDK, Azul Zulu) is built from it.

### Three things people mean by "Java"

| Term | What it is | Example |
|---|---|---|
| **The Java language** | The syntax and rules, defined by the *Java Language Specification* (JLS) | `record Point(int x, int y) {}` is legal since Java 16 |
| **The Java platform (Java SE)** | The language plus the standard library (`java.lang`, `java.util`, `java.time`, `java.net`, …) and tools | `java.util.HashMap`, `javac`, `jshell` |
| **The JVM** | The abstract machine that loads and runs bytecode, defined by the *JVM Specification* (JVMS) | HotSpot, the JVM inside OpenJDK |

Other languages (Kotlin, Scala, Groovy, Clojure) also compile to bytecode and run on the JVM. That is why the JVM spec and the language spec are separate documents.

### Why "write once, run anywhere" works

A C program is compiled to machine code for one CPU and one operating system. A Java program is compiled **once** to bytecode, an instruction set for an *imaginary* stack machine. Every operating system gets its own JVM that understands that same bytecode. Ship the `.class` or `.jar` files, and any compatible JVM can run them.

The trade: the JVM must translate bytecode to native code at run time. Modern JVMs do this with a **JIT (just-in-time) compiler** that compiles hot code to optimised machine code, so long-running Java is fast.

### Java's design goals in practice

- **Safety:** no pointer arithmetic, array bounds are checked, bytecode is verified before it runs, memory is freed by the GC.
- **Portability:** primitive sizes are fixed (`int` is always 32 bits), and the library hides OS differences.
- **Readability over cleverness:** explicit types (with `var` for locals since Java 10), checked exceptions, no operator overloading.
- **Backwards compatibility:** code compiled for Java 8 generally runs unchanged on Java 25.

### The release train

Since 2018, a new Java version ships **every six months** (March and September). Every two years one release is a **Long-Term Support (LTS)** release that vendors patch for many years.

| LTS | Released | Headline features |
|---|---|---|
| Java 8 | 2014 | Lambdas, streams, `java.time`, default methods |
| Java 11 | 2018 | `var` in lambdas, HTTP client, single-file `java Foo.java` |
| Java 17 | 2021 | Sealed classes, records, text blocks, switch expressions |
| Java 21 | 2023 | Virtual threads, pattern matching for `switch`, record patterns, sequenced collections |
| Java 25 | 2025 | Compact source files, scoped values, flexible constructor bodies, module imports |

**This notebook uses Java 17 as its baseline**: it is still the most widely deployed modern LTS, Spring Boot 3 requires it, and it has records, sealed classes and switch expressions. Features from Java 21 and 25 are taught separately, and every example that needs them is labelled with its version.

## Internal working

What happens between typing code and seeing output (each step has its own lesson later):

1. **`javac` compiles** `Hello.java` into `Hello.class`. The class file contains bytecode, a constant pool (names, strings, numbers) and metadata. It does **not** contain machine code.
2. **The JVM starts** (`java Hello`). Its class loaders find `Hello.class` on the class path and load it.
3. **The verifier checks** the bytecode is type-safe and well-formed, so a corrupted or hostile class file can't crash the VM.
4. **The interpreter executes** bytecode one instruction at a time at first.
5. **The JIT compiles hot methods** to native machine code for *this* CPU, using profile data gathered while interpreting.
6. **The garbage collector** reclaims objects that are no longer reachable.

What is **not** platform independent:

- The JVM itself: there is a different JDK download per OS and CPU.
- Native code called through JNI or the Foreign Function & Memory API.
- OS conventions your code observes: line separators (`\r\n` on Windows, `\n` elsewhere), path separators, file-name case sensitivity, default character sets before Java 18.
- Thread scheduling details and timing.

> [!NOTE] Specification vs implementation
> "The JVM" in an interview usually means **HotSpot**, OpenJDK's JVM. The JVM *specification* says what bytecode means; it does not mandate a JIT, a particular garbage collector, or object layout. Those are HotSpot implementation details, and this notebook labels them as such.

## Visual representation

```text title="Compile once, run on any JVM"
            Hello.java  (source code, written once)
                 |
                 |  javac  (compile time)
                 v
            Hello.class  (bytecode: same file for every OS)
                 |
     +-----------+------------+-----------------+
     |                        |                 |
     v                        v                 v
 JVM for Windows x64    JVM for Linux arm64    JVM for macOS arm64
 (interpreter + JIT)    (interpreter + JIT)    (interpreter + JIT)
     |                        |                 |
     v                        v                 v
 native x64 code        native ARM code        native ARM code
```

## Java code example

A first program that prints facts which are identical everywhere, plus one that depends on the operating system:

```java title="PlatformFacts.java" file="PlatformFacts.java"
public class PlatformFacts {
    public static void main(String[] args) {
        // Fixed by the language specification on every platform:
        System.out.println("int is " + Integer.SIZE + " bits, max " + Integer.MAX_VALUE);
        System.out.println("long is " + Long.SIZE + " bits");
        System.out.println("char is " + Character.SIZE + " bits (a UTF-16 code unit)");

        // Integer arithmetic overflows the same way everywhere:
        int big = Integer.MAX_VALUE;
        System.out.println("MAX_VALUE + 1 = " + (big + 1));

        // Depends on the operating system the JVM runs on:
        String separator = System.lineSeparator().equals("\r\n") ? "CRLF (Windows)" : "LF (Linux/macOS)";
        System.out.println("line separator: " + separator);

        // Depends on which JDK runs the program:
        System.out.println("running on Java " + Runtime.version().feature());
    }
}
```

Run it without a separate compile step (Java 11+):

```bash
java PlatformFacts.java
```

## Output

```text title="Output" output="PlatformFacts.java"
int is 32 bits, max 2147483647
long is 64 bits
char is 16 bits (a UTF-16 code unit)
MAX_VALUE + 1 = -2147483648
line separator: CRLF (Windows)
running on Java 17
```

- The first four lines are the same on every JVM: primitive sizes and overflow behaviour are part of the language specification. `MAX_VALUE + 1` wraps around to `MIN_VALUE` because `int` arithmetic is two's-complement and never throws.
- The line separator was produced on Windows; on Linux or macOS the same `.class` file prints `LF (Linux/macOS)`. Portable code uses `System.lineSeparator()` or `%n` in `printf` instead of hard-coding `\n`.
- The last line reports the JDK that ran the program, not the one that compiled it.

## Real-world application

- **Back-end services** at banks, e-commerce companies, ad-tech and cloud providers run on the JVM: Spring Boot, Quarkus, Micronaut, Netflix's and Amazon's internal services.
- **Big-data systems** are JVM-based: Kafka, Cassandra, Elasticsearch, Hadoop, Spark (Scala on the JVM), Flink.
- **Android** apps are written in Java or Kotlin and compiled from JVM bytecode to Android's own DEX format.
- **Developer tools**: IntelliJ IDEA, Maven, Gradle and Jenkins are Java applications.

Portability matters in practice when the same artifact (a JAR or container image with a JDK inside) moves unchanged from a developer's Mac to a Linux CI server to production.

## Common mistakes

- **Saying "Java is interpreted."** Modern JVMs interpret only at first; hot code is JIT-compiled to native code. Java is compiled twice: to bytecode ahead of time, to machine code at run time.
- **Saying "Java is 100% platform independent."** The bytecode is; the JVM, native libraries and OS conventions are not.
- **Confusing the language version with the runtime version.** Code compiled with `--release 21` will not run on a Java 17 JVM (`UnsupportedClassVersionError`); code compiled for 17 runs on 21.
- **Thinking OpenJDK and "Oracle Java" are different languages.** They are builds of the same codebase; differences are licensing and support.
- **Hard-coding `"\n"` or `"/"`** in code that writes files or builds paths on several operating systems.

## Interview questions

**Q1. What makes Java platform independent?**

````reveal title="Answer"
`javac` compiles source to **bytecode**, a platform-neutral instruction set defined by the JVM specification, instead of native machine code. Each platform has its own JVM that verifies and executes that bytecode, interpreting it at first and JIT-compiling hot code to native instructions. The `.class` files are portable; the JVM is the platform-specific piece. Strictly, Java is "compile once, run on any compatible JVM".
````

**Q2. Is Java compiled or interpreted?**

````reveal title="Answer"
Both. Source is compiled ahead of time to bytecode by `javac`. At run time HotSpot starts by **interpreting** bytecode, collects profiling information, and **JIT-compiles** frequently executed methods to optimised native code (C1, then C2, with tiered compilation). Long-running programs therefore spend most of their time in compiled native code.
````

**Q3. Why might a class compiled on JDK 21 fail on a JDK 17 runtime?**

````reveal title="Answer"
Every class file records a **major version** (61 for Java 17, 65 for Java 21, 69 for Java 25). A JVM refuses class files newer than itself and throws `UnsupportedClassVersionError`. Compile with `javac --release 17` to target the older runtime; `--release` also checks you only use Java 17 APIs.
````

**Q4. Why do many companies stay on LTS releases?**

````reveal title="Answer"
LTS versions receive security and bug-fix updates for years, so they are a stable target for frameworks, tooling and operations. Non-LTS releases are supported only until the next release six months later. Teams typically upgrade LTS to LTS (11 → 17 → 21 → 25) and test against the next release early.
````

## Hands-on exercise

Write `Portability.java` that prints:

1. The value of `Long.MAX_VALUE + 1`.
2. The result of `7 / 2` and `7.0 / 2`.
3. A two-line message written with `printf` and `%n`, so it uses the right line ending on every OS.

Then predict the output before running it.

````hint title="Hint"
`Long.MAX_VALUE + 1` overflows exactly like `int`. Integer division truncates toward zero. `%n` in a format string becomes the platform line separator.
````

````solution title="Solution"
```java title="Portability.java" file="Portability.java"
public class Portability {
    public static void main(String[] args) {
        System.out.println(Long.MAX_VALUE + 1);       // wraps to Long.MIN_VALUE
        System.out.println(7 / 2);                    // int division truncates: 3
        System.out.println(7.0 / 2);                  // double division: 3.5
        System.out.printf("first line%nsecond line%n");
    }
}
```

```text title="Output" output="Portability.java"
-9223372036854775808
3
3.5
first line
second line
```
````

## Knowledge check

```quiz
? What does `javac` produce?
- Native machine code for the current CPU
+ Platform-neutral bytecode in .class files
- A Windows .exe that bundles a JVM
> javac targets the JVM's instruction set; the JVM turns bytecode into native code at run time.

? Which of these is NOT platform independent?
- The size of an `int`
- The bytecode in a `.class` file
+ The JVM executable itself
> There is a separate JVM build for each OS and CPU; that is what makes the bytecode portable.

? A class compiled with `--release 21` is run on a Java 17 JVM. What happens?
+ `UnsupportedClassVersionError` at class loading
- It runs, ignoring features it doesn't understand
- It is recompiled automatically
> A JVM rejects class files with a newer major version than it supports.

? Which statement about HotSpot's execution is accurate?
- It always interprets bytecode
- It compiles the whole program to native code before starting
+ It interprets first, then JIT-compiles hot methods using runtime profiles
> Tiered compilation balances fast startup with peak performance.
```

## Key takeaways

- Java = **language** (JLS) + **platform** (standard library and tools) + **JVM** (JVMS); other languages share the JVM.
- Portability comes from **bytecode**: compile once, run on any compatible JVM. The JVM itself is platform-specific.
- HotSpot **interprets, then JIT-compiles** hot code; Java is neither "just interpreted" nor compiled ahead of time to native code by default.
- New releases every six months; **LTS** releases are 8, 11, 17, 21 and 25. This notebook targets **Java 17** and labels newer features.
- OS conventions (line and path separators, native code) still leak through; portable code uses the platform APIs.
