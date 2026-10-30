## Concept explanation

### Anatomy of a source file

```java
package com.example.billing;          // 1. optional package declaration (first statement)

import java.time.LocalDate;            // 2. imports
import java.util.List;

public class InvoiceApp {              // 3. at most one public top-level class, named like the file
    private static final int DAYS = 30;     //    fields

    public static void main(String[] args) {    // 4. entry point
        LocalDate due = LocalDate.of(2026, 1, 1).plusDays(DAYS);
        System.out.println(List.of("due", due));
    }
}

class Helper { }                       // 5. other non-public top-level types are allowed
```

Rules the compiler enforces:

- A file may contain **at most one `public` top-level type**, and the file must be named after it (`InvoiceApp.java`).
- `package` must come first, then `import`s, then type declarations.
- Everything executable lives inside a type (until Java 25's compact source files, covered later).

### The `main` method

`public static void main(String[] args)` is the conventional entry point. Each keyword has a reason:

| Part | Why |
|---|---|
| `public` | The launcher, outside your class, must be able to call it |
| `static` | It runs before any object exists, so the JVM can call it on the class without constructing an instance (which would need to know which constructor and arguments to use) |
| `void` | The exit status is set with `System.exit(int)`, not a return value |
| `String[] args` | Command-line arguments; `String... args` is equally valid |

Valid variations: `final` parameters, `String... args`, `static public` order, `synchronized`. A class may also have overloaded `main` methods; only the `(String[])` one is the entry point.

> [!NOTE] Java 21–25 relax this
> JEP 445/463/477 previewed, and **Java 25 finalised (JEP 512)**, *instance main methods* and *compact source files*: `void main() { IO.println("hi"); }` is a complete program in Java 25. This notebook's Java 17 examples use the classic form; the new form is covered in [Java 21 → 25 features](lesson:java-21-to-25-features).

### The lifecycle in one sentence

**Edit → compile (`javac`) → load → link (verify, prepare, resolve) → initialise → execute (interpret, then JIT) → exit.**

## Internal working

1. **Compilation.** `javac InvoiceApp.java` parses the source, checks types, and writes one `.class` file **per type**, including nested ones (`InvoiceApp.class`, `Helper.class`, `Outer$Inner.class`). Constant expressions such as `30 * 24` are folded at compile time.
2. **Launch.** `java -cp out com.example.billing.InvoiceApp` starts the JVM and asks the **application class loader** to load the main class by its fully qualified name.
3. **Loading.** The loader reads the bytes and creates the runtime representation of the class in **metaspace**.
4. **Linking.**
   - *Verification* checks the bytecode is type-safe (no stack underflow, correct types for each instruction, no jumping into the middle of an instruction).
   - *Preparation* allocates static fields and sets them to default values (`0`, `null`, `false`).
   - *Resolution* turns symbolic references (`java/util/List.of`) into direct references, usually lazily on first use.
5. **Initialisation.** The class's static initialiser (`<clinit>`: static field initialisers and `static {}` blocks, in source order) runs **once**, before first active use.
6. **Execution.** The JVM invokes `main`. HotSpot interprets bytecode, counts invocations and loop iterations, and JIT-compiles hot methods. Other classes are loaded and initialised as code first touches them.
7. **Exit.** The JVM exits when the last **non-daemon** thread finishes, when `System.exit` is called, or when the process is killed. Shutdown hooks run on normal exit.

Since Java 11, `java InvoiceApp.java` (a source file, not a class) compiles in memory and runs it in one step — handy for scripts and for this notebook's examples.

## Visual representation

```text title="From source file to running code"
 InvoiceApp.java
      |  javac (parse, type-check, constant-fold)
      v
 InvoiceApp.class  ----------------------------------+
      |  java -cp out InvoiceApp                     |
      v                                              |
 +-----------------  JVM process  -----------------+ |
 | Class loading:   load -> verify -> prepare ->   | |
 |                  resolve -> initialise (<clinit>)| |
 |                                                  | |
 | main thread: main(String[] args)                | |
 |    interpreter --(hot method)--> JIT --> native  | |
 |                                                  | |
 | Exit when the last non-daemon thread ends        | |
 +--------------------------------------------------+ |
```

## Java code example

This program shows the order in which things happen: static initialisation before `main`, lazy loading of a helper class only when first used, and exit after `main` returns.

```java title="Lifecycle.java" file="Lifecycle.java"
import java.util.Arrays;

public class Lifecycle {
    static {
        System.out.println("1. Lifecycle class initialised (static block)");
    }

    private static final String GREETING = greeting();

    private static String greeting() {
        System.out.println("2. static field initialiser runs, in source order");
        return "hello";
    }

    public static void main(String[] args) {
        System.out.println("3. main starts with args " + Arrays.toString(args));
        System.out.println("4. GREETING = " + GREETING);
        System.out.println("5. Helper not loaded yet; touching it now...");
        System.out.println("7. Helper.VALUE = " + Helper.value());
        System.out.println("8. main ends; JVM exits after the last non-daemon thread");
    }
}

class Helper {
    static {
        System.out.println("6. Helper initialised on first use");
    }

    static int value() {
        return 42;
    }
}
```

```bash
java Lifecycle.java alpha beta
```

## Output

```text title="Output" output="Lifecycle.java"
1. Lifecycle class initialised (static block)
2. static field initialiser runs, in source order
3. main starts with args []
4. GREETING = hello
5. Helper not loaded yet; touching it now...
6. Helper initialised on first use
7. Helper.VALUE = 42
8. main ends; JVM exits after the last non-daemon thread
```

- Lines 1 and 2 print **before `main`**: the JVM initialises the main class first, running static blocks and static field initialisers in the order they appear in the source.
- The arguments are empty here because the notebook's runner passes none; with `java Lifecycle.java alpha beta` line 3 prints `[alpha, beta]`.
- `Helper` is initialised **lazily**, between lines 5 and 7, on its first active use (a static method call). Classes that are never used are never initialised.

## Real-world application

- **Startup time** of large services is dominated by class loading and initialisation. Frameworks reduce it with Class Data Sharing (CDS/AppCDS), lazy initialisation, and (in Java 24–25) ahead-of-time class loading and linking (JEP 483).
- **Fail-fast configuration**: putting validation in a static initialiser means a bad configuration fails at startup rather than on the first request — but an exception there becomes `ExceptionInInitializerError` and then `NoClassDefFoundError` on later access, which confuses on-call engineers.
- **Command-line tools and scripts** written as single-file programs run with `java Tool.java` (Java 11+) or, with a shebang line, directly as `./tool`.
- **Graceful shutdown**: servers register `Runtime.getRuntime().addShutdownHook(...)` to drain requests when the container receives SIGTERM.

## Common mistakes

- **File and public class names differ** (`public class Main` in `App.java`): compile error.
- **Running `java Main.class`** or `java out/Main`: the launcher takes a **class name** (`java -cp out Main`), not a file path — except for the single-source launcher, which takes a `.java` file.
- **Expecting `main` to be called on an object**: there is no `this` in a static method; create an instance explicitly.
- **Assuming the JVM exits when `main` returns**: a running non-daemon thread (for example an executor you forgot to shut down) keeps it alive.
- **Heavy work in static initialisers**: it runs on whichever thread first touches the class and is hard to retry if it fails.

## Interview questions

**Q1. Why is the `main` method static?**

````reveal title="Answer"
So the JVM can invoke it **without creating an instance**. If `main` were an instance method, the launcher would need to construct the class, but it couldn't know which constructor to call or with what arguments, and construction could have side effects. A static method belongs to the class, which is loaded and initialised first. (Java 25's instance main methods work by having the launcher instantiate the class with its no-arg constructor — a deliberate, well-defined rule added later.)
````

**Q2. Can you overload `main`? Can it be `final` or `synchronized`?**

````reveal title="Answer"
Yes to all. Overloads such as `main(int x)` are ordinary methods; the launcher only calls `main(String[])`. `final`, `synchronized` and `strictfp` modifiers don't change its role, and `String... args` is equivalent to `String[] args`.
````

**Q3. What happens, step by step, when you run `java -cp out com.acme.App`?**

````reveal title="Answer"
The launcher starts the JVM, which boots core classes. The application class loader loads `com/acme/App.class` from `out`, delegating to its parents first. The class is linked (verified, statics prepared with defaults, references resolved lazily) and initialised (`<clinit>` runs). The JVM then calls `main(String[])` on the main thread, interpreting bytecode and JIT-compiling hot methods. The process ends when the last non-daemon thread finishes or `System.exit` is called.
````

**Q4. What is the difference between `ClassNotFoundException` and `NoClassDefFoundError` in the context of startup?**

````reveal title="Answer"
`ClassNotFoundException` is a checked exception thrown when code asks for a class **by name** (`Class.forName`, a class loader) and it can't be found. `NoClassDefFoundError` is thrown when a class that **was present at compile time** can't be found or initialised at run time — for example a missing JAR, or a class whose static initialiser previously failed.
````

## Hands-on exercise

Predict the output of the program below, then run it. Which lines print, and in what order? Does `Config` get initialised?

```java
public class Order {
    static { System.out.println("A"); }
    public static void main(String[] args) {
        System.out.println("B");
        System.out.println(Config.NAME);   // a compile-time constant
        System.out.println(Config.started());
    }
}
class Config {
    static final String NAME = "orders";   // constant: inlined by javac
    static { System.out.println("C"); }
    static String started() { return "D"; }
}
```

````hint title="Hint"
A `static final` field initialised with a compile-time constant is copied into the *using* class by `javac`. Reading it does not trigger initialisation of `Config`. Calling a static method does.
````

````solution title="Solution"
```java title="InitOrder.java" file="InitOrder.java"
public class InitOrder {
    static {
        System.out.println("A");
    }

    public static void main(String[] args) {
        System.out.println("B");
        System.out.println(Config.NAME);     // inlined constant: Config is NOT initialised here
        System.out.println(Config.started()); // static call: triggers Config initialisation first
    }
}

class Config {
    static final String NAME = "orders";

    static {
        System.out.println("C");
    }

    static String started() {
        return "D";
    }
}
```

```text title="Output" output="InitOrder.java"
A
B
orders
C
D
```

`C` prints only when `started()` is called. Reading the compile-time constant `NAME` doesn't count as an active use, because its value was copied into `InitOrder.class` at compile time.
````

## Knowledge check

```quiz
? What does `javac` produce for a file containing `class Outer { class Inner {} }`?
- One file: Outer.class
+ Two files: Outer.class and Outer$Inner.class
- One JAR file
> Every class, including nested ones, gets its own class file.

? When does a class's static initialiser run?
- When the JVM starts, for every class on the class path
+ Once, just before the class's first active use (e.g. a static method call or `new`)
- Every time a static method is called
> Classes are initialised lazily, exactly once.

? A program's `main` returns while an executor thread is still running. What happens?
- The JVM exits immediately
+ The JVM keeps running until all non-daemon threads finish
- The JVM throws IllegalStateException
> Only daemon threads are abandoned at exit.

? Which `main` signature is NOT a valid entry point in Java 17?
- `public static void main(String... args)`
- `static public void main(final String[] a)`
+ `public void main(String[] args)`
> Before Java 25's instance main methods, the entry point must be static.
```

## Key takeaways

- A source file holds at most one **public** top-level type named like the file; `javac` emits one `.class` per type.
- `main` is **public static void** with a `String[]`: callable from outside, without an instance, with arguments.
- The JVM **loads → links (verify, prepare, resolve) → initialises** a class lazily, then runs `main`.
- Static initialisers run **once, in source order**, on first active use; reading a compile-time constant doesn't count.
- The JVM exits when the last **non-daemon** thread ends or `System.exit` is called.
