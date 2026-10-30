## Concept explanation

Three acronyms describe three nested layers:

- **JVM (Java Virtual Machine):** the engine that loads `.class` files, verifies them, executes bytecode (interpreter + JIT compiler), manages memory with a garbage collector, and runs threads. It knows nothing about source code.
- **JRE (Java Runtime Environment):** a JVM **plus the standard class library** (`java.base`, `java.sql`, `java.net.http`, …) and supporting files. Everything needed to *run* Java programs.
- **JDK (Java Development Kit):** a JRE **plus development tools**: `javac` (compiler), `jshell` (REPL), `jar`, `javadoc`, `jlink`, `jpackage`, and diagnostic tools such as `jcmd`, `jstack`, `jmap`, `jfr` and `jconsole`. Everything needed to *build* Java programs.

```text
JDK  = JRE + development tools (javac, jshell, jar, jlink, jcmd, ...)
JRE  = JVM + standard class library
JVM  = class loader + bytecode verifier + interpreter/JIT + GC + runtime
```

### What changed after Java 8

Up to Java 8 you could download a separate JRE. Since **Java 11** vendors ship only the **JDK**. To deploy a small runtime, you build one yourself with **`jlink`**, which assembles a custom runtime image containing only the modules your application needs (often 40–60 MB instead of ~300 MB). Container images such as `eclipse-temurin:17-jre` are pre-built `jlink` runtimes.

### Distributions

All mainstream distributions are builds of OpenJDK and pass the same compatibility test kit (TCK):

| Distribution | Notes |
|---|---|
| Eclipse Temurin (Adoptium) | Free, community-built, a common default |
| Amazon Corretto | Free, Amazon-supported, used on AWS |
| Microsoft Build of OpenJDK | Free, used on Azure |
| Azul Zulu | Free builds, paid support, many platforms |
| Oracle JDK | Free under Oracle's NFTC licence for current releases; paid support |
| GraalVM | OpenJDK plus the Graal JIT and `native-image` ahead-of-time compilation |

## Internal working

### How the `java` launcher finds a JVM

1. You run `java -version` or `java Main`. The shell finds the first `java` executable on your **`PATH`**.
2. The launcher reads its own installation directory, loads the JVM shared library (`jvm.dll` / `libjvm.so`) and creates the VM.
3. The JVM loads core classes from the runtime image (`lib/modules`, a compact module store that replaced `rt.jar` in Java 9).
4. Your classes are loaded from the **class path** (`-cp`) or **module path** (`-p`).

`JAVA_HOME` is a convention used by build tools (Maven, Gradle) and IDEs to find a JDK; the `java` command itself uses `PATH`. When `java -version` and Maven disagree about the version, `PATH` and `JAVA_HOME` point at different installations.

### Setting up a working environment

1. **Install a JDK 17 (or 21/25) build**, for example Temurin. On Windows use the MSI (it can set `JAVA_HOME`), on macOS `brew install --cask temurin@17`, on Linux your package manager or SDKMAN (`sdk install java 17.0.x-tem`).
2. **Set `JAVA_HOME`** to the JDK directory and put `$JAVA_HOME/bin` on `PATH`.
3. **Verify**: `java -version` and `javac -version` should print the same release.
4. **Pick an editor**: IntelliJ IDEA (Community is free), VS Code with the Extension Pack for Java, or Eclipse.
5. **Experiment in `jshell`**: type `jshell`, then `1 + 2` or `"hi".repeat(3)` and press Enter. Great for checking API behaviour quickly.

## Visual representation

```text title="What each layer contains"
+------------------------------------------------------------+
| JDK                                                        |
|  javac  jshell  jar  javadoc  jlink  jpackage              |
|  jcmd  jstack  jmap  jstat  jfr  jconsole  keytool         |
|  +------------------------------------------------------+  |
|  | Runtime (what a JRE used to be)                      |  |
|  |   standard library modules: java.base, java.sql,     |  |
|  |   java.net.http, java.xml, java.logging, ...         |  |
|  |  +------------------------------------------------+  |  |
|  |  | JVM (HotSpot)                                  |  |  |
|  |  |  class loaders | verifier | interpreter | JIT  |  |  |
|  |  |  garbage collectors | threads | JNI           |  |  |
|  |  +------------------------------------------------+  |  |
|  +------------------------------------------------------+  |
+------------------------------------------------------------+
```

## Java code example

A small program that reports which runtime is executing it, using standard system properties and the `Runtime.Version` API (Java 9+):

```java title="WhichJava.java" file="WhichJava.java"
public class WhichJava {
    public static void main(String[] args) {
        Runtime.Version version = Runtime.version();
        System.out.println("feature release : " + version.feature());
        System.out.println("is LTS-numbered : " + isLts(version.feature()));
        System.out.println("vm name contains HotSpot or OpenJDK: "
                + (System.getProperty("java.vm.name").contains("HotSpot")
                   || System.getProperty("java.vm.name").contains("OpenJDK")));
        System.out.println("class file major version: " + classFileVersion(version.feature()));
        System.out.println("available processors > 0: " + (Runtime.getRuntime().availableProcessors() > 0));
    }

    /** LTS releases: 8, 11, then every fourth feature release from 17 (17, 21, 25, ...). */
    static boolean isLts(int feature) {
        return feature == 8 || feature == 11 || (feature >= 17 && (feature - 17) % 4 == 0);
    }

    /** Java N writes class files with major version N + 44 (Java 17 -> 61). */
    static int classFileVersion(int feature) {
        return feature + 44;
    }
}
```

Run it with:

```bash
java -version
java WhichJava.java
```

## Output

```text title="Output" output="WhichJava.java"
feature release : 17
is LTS-numbered : true
vm name contains HotSpot or OpenJDK: true
class file major version: 61
available processors > 0: true
```

- `feature` is the major version of the JVM running the code.
- The LTS check encodes the current rule: 11, then every two years (17, 21, 25).
- Class files record `major = feature + 44`. A JVM rejects class files whose major version is higher than its own with `UnsupportedClassVersionError`.

## Real-world application

- **CI pipelines** pin a JDK (`actions/setup-java` with `distribution: temurin`, `java-version: 17`) so builds are reproducible.
- **Container images** use a JDK image to build and a slimmer runtime image (or a `jlink` output) to run, shrinking image size and attack surface.
- **Multi-version development**: tools such as SDKMAN, `jenv` or IntelliJ's per-project SDK setting let you work on a Java 17 service and a Java 21 service on the same machine.
- **Production diagnostics** rely on JDK tools (`jcmd <pid> Thread.print`, `jcmd <pid> GC.heap_dump`). A runtime image without them is smaller but harder to debug; many teams keep `jcmd` in production images for that reason.

## Common mistakes

- **Installing a JRE and wondering why `javac` is missing.** You need the JDK to compile.
- **`JAVA_HOME` pointing at a different version from `java` on `PATH`.** Maven builds with one JDK and you run with another.
- **Compiling with a newer JDK without `--release`.** `javac` from JDK 21 without `--release 17` produces class files that a Java 17 server can't load.
- **Believing Oracle JDK is "more official".** Feature-wise it is OpenJDK; choose a distribution by licence and support needs.
- **Shipping a full JDK in every production container** when a `jlink` runtime would be a fraction of the size.

## Interview questions

**Q1. What is the difference between the JDK, the JRE and the JVM?**

````reveal title="Answer"
The **JVM** executes bytecode: class loading, verification, interpretation and JIT compilation, garbage collection, threads. The **JRE** is the JVM plus the standard library — enough to run programs. The **JDK** is the JRE plus development and diagnostic tools: `javac`, `jar`, `jshell`, `jlink`, `jcmd`, `jfr`. Since Java 11 vendors ship only JDKs; a minimal runtime is built with `jlink`.
````

**Q2. Is the JVM platform independent?**

````reveal title="Answer"
No. Bytecode is platform independent; the JVM is a native program built separately for each OS and CPU. That is exactly what lets the same `.class` file run everywhere.
````

**Q3. What does `javac --release 17` do that `-source 17 -target 17` didn't fully do?**

````reveal title="Answer"
`--release 17` sets the language level and class-file version **and** compiles against the Java 17 API signatures. With only `-source/-target` on a newer JDK, you could accidentally call a Java 21 method (e.g. `List.reversed()`); the code compiles but fails at run time on Java 17 with `NoSuchMethodError`.
````

**Q4. Why was the separate JRE download dropped?**

````reveal title="Answer"
With modules (Java 9) applications can ship a tailored runtime built by `jlink`, and desktop browser plugins/Web Start that needed a system-wide JRE were removed. A shared system JRE also made upgrades risky for every app on the machine. Bundling a runtime per application is now the norm.
````

## Hands-on exercise

1. Install a JDK 17+ build and verify `java -version` and `javac -version` match.
2. Open `jshell` and evaluate: `Runtime.version()`, `"java".toUpperCase()`, `Integer.MAX_VALUE + 1`, `/exit`.
3. Write `ToolCheck.java` that prints whether the program is running on at least Java 17, and the value of the `java.specification.version` system property.

````hint title="Hint"
`Runtime.version().feature()` returns an `int`. `System.getProperty("java.specification.version")` returns the spec version as a String, such as `"17"`.
````

````solution title="Solution"
```java title="ToolCheck.java" file="ToolCheck.java"
public class ToolCheck {
    public static void main(String[] args) {
        int feature = Runtime.version().feature();
        System.out.println("Java 17 or newer: " + (feature >= 17));
        System.out.println("spec version matches runtime: "
                + System.getProperty("java.specification.version").equals(String.valueOf(feature)));
    }
}
```

```text title="Output" output="ToolCheck.java"
Java 17 or newer: true
spec version matches runtime: true
```
````

## Knowledge check

```quiz
? Which tool is part of the JDK but was never part of a JRE?
- The garbage collector
+ javac
- java.util.HashMap
> The JRE runs programs; compiling needs javac, which only ships with the JDK.

? `java -version` prints 21 but Maven compiles with 17. What is the likely cause?
+ PATH and JAVA_HOME point at different JDK installations
- Maven always uses Java 17
- The JVM downgrades itself
> The java command comes from PATH; Maven uses JAVA_HOME.

? What is jlink used for?
- Linking native C libraries into Java code
+ Building a custom, minimal runtime image containing only the modules an app needs
- Merging JAR files
> jlink assembles a runtime from modules, replacing the old idea of a separate JRE download.

? Which statement is true?
- Oracle JDK and OpenJDK builds implement different Java languages
+ Mainstream distributions are builds of OpenJDK that pass the same compatibility tests
- Only Oracle JDK can run Spring Boot
> Choose a distribution for licensing, support and platform coverage, not language features.
```

## Key takeaways

- **JVM** runs bytecode; **JRE** = JVM + class library; **JDK** = JRE + tools. You develop with a JDK.
- Since Java 11 there is no separate JRE download; build small runtimes with **`jlink`** or use vendor runtime images.
- `java` is found via **`PATH`**; build tools use **`JAVA_HOME`**. Keep them consistent.
- Compile for older runtimes with **`--release N`**.
- All mainstream distributions are OpenJDK builds; pick by licence and support.
