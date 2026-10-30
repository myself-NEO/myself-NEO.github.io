## Concept explanation

### How Java is released today

- **Before Java 9:** big releases every few years, each waiting on its headline feature (Java 9 slipped for years waiting for modules).
- **Since Java 10 (March 2018):** a **time-based release train**. A new **feature release every six months**, in **March and September**, ships with whatever is ready. Features that aren't ready catch the next train.

| Term | Meaning |
|---|---|
| **Feature release** | Java 22, 23, 24… Updates (security and bug fixes) for about 6 months, until the next release. |
| **LTS (long-term support)** | Certain releases that vendors support for years: **8, 11, 17, 21, 25**. LTS used to come every 3 years (8 → 11 → 17); since 17 it's **every 2 years**, so 21, 25, and next 29. Most companies run LTS releases in production. |
| **JEP** | JDK Enhancement Proposal: the design document behind each feature (for example JEP 444, Virtual Threads). |
| **Preview feature** | A complete language or VM feature that isn't permanent yet. It must be enabled with `--enable-preview` together with `--release N`, and class files using it run only on that exact release. Previews usually become final after one to four rounds, sometimes with changes. String templates were previewed in 21–22 and then **withdrawn**. |
| **Incubator module** | An experimental *API* in a `jdk.incubator.*` module, enabled with `--add-modules`. Example: the Vector API, still incubating in 25. |
| **Experimental VM feature** | Enabled with `-XX:+UnlockExperimentalVMOptions`, for example early ZGC. |

**OpenJDK** is the open-source reference implementation. "Java" in production is usually a vendor build of it, with the same code but different support terms: Eclipse Temurin, Amazon Corretto, Azul Zulu, Microsoft Build of OpenJDK, Red Hat, Oracle JDK, BellSoft Liberica. **GraalVM** adds a different JIT and native-image compilation.

Version strings since Java 9 (JEP 223/322) are `FEATURE.INTERIM.UPDATE.PATCH+BUILD`, for example `21.0.5+11`. Java 8 and older used `1.8.0_402`. `Runtime.version()` parses the modern form.

### What each release added

Bold marks the features you're most likely to use or be asked about.

| Version | Date | | Headline changes |
|---|---|---|---|
| **8** | Mar 2014 | LTS | **lambdas & method references**, **Stream API**, **Optional**, **default/static interface methods**, **java.time**, **CompletableFuture**, Metaspace replaces PermGen, Nashorn JavaScript engine, `String.join`, `Base64` |
| **9** | Sep 2017 | | **module system (JPMS)**, **JShell**, **`List.of`/`Set.of`/`Map.of`**, private interface methods, `takeWhile`/`dropWhile`/`Stream.ofNullable`, `Optional.or/ifPresentOrElse/stream`, **compact strings**, **G1 default GC**, Flow API, `VarHandle`, `StackWalker`, multi-release JARs |
| **10** | Mar 2018 | | **`var`**, `List.copyOf`, `Collectors.toUnmodifiableList`, `Optional.orElseThrow()`, **container awareness**, application class-data sharing; the first six-month release |
| **11** | Sep 2018 | LTS | **standard `HttpClient`**, `String.isBlank/lines/strip/repeat`, `Files.readString/writeString`, `var` in lambda parameters, **`java Hello.java`** source launch, `Predicate.not`, `Optional.isEmpty`, ZGC (experimental), Epsilon GC, Flight Recorder open-sourced; **Java EE & CORBA modules removed**, JavaFX unbundled |
| 12 | Mar 2019 | | `Collectors.teeing`, `String.indent/transform`, compact number formatting, Shenandoah (experimental); switch expressions (preview) |
| 13 | Sep 2019 | | dynamic CDS archives, reimplemented legacy socket API; text blocks (preview) |
| **14** | Mar 2020 | | **switch expressions**, **helpful NullPointerExceptions**, JFR event streaming; records and `instanceof` patterns (preview) |
| **15** | Sep 2020 | | **text blocks**, hidden classes, ZGC and Shenandoah production-ready, Nashorn removed, biased locking disabled; sealed classes (preview) |
| **16** | Mar 2021 | | **records**, **pattern matching for `instanceof`**, **`Stream.toList()`**, `mapMulti`, **JDK internals strongly encapsulated by default**, `jpackage`, elastic metaspace; Vector API (incubator) |
| **17** | Sep 2021 | LTS | **sealed classes**, internals encapsulated for good (`--illegal-access` gone), new random-generator API, always-strict floating point, macOS/AArch64 port, Security Manager deprecated for removal; switch patterns (preview) |
| 18 | Mar 2022 | | **UTF-8 by default**, `jwebserver`, `@snippet` in Javadoc, finalization deprecated for removal |
| 19 | Sep 2022 | | previews of virtual threads, record patterns and the FFM API; structured concurrency (incubator) |
| 20 | Mar 2023 | | further previews; scoped values (incubator) |
| **21** | Sep 2023 | LTS | **virtual threads**, **sequenced collections**, **record patterns**, **pattern matching for `switch`**, generational ZGC, KEM API; previews: unnamed classes and instance main, unnamed patterns, structured concurrency, scoped values, string templates (later withdrawn) |
| 22 | Mar 2024 | | **Foreign Function & Memory API**, **unnamed variables & patterns (`_`)**, multi-file source launch; previews: statements before `super()`, stream gatherers, Class-File API |
| 23 | Sep 2024 | | Markdown doc comments (`///`), ZGC generational by default, `sun.misc.Unsafe` memory-access methods deprecated for removal; previews: primitive types in patterns, module imports |
| 24 | Mar 2025 | | **stream gatherers**, Class-File API, **virtual threads no longer pinned by `synchronized`**, AOT class loading & linking, Security Manager permanently disabled, quantum-resistant ML-KEM/ML-DSA, compact object headers (experimental) |
| **25** | Sep 2025 | LTS | **compact source files & instance `main`**, **module import declarations**, **flexible constructor bodies**, **scoped values**, Key Derivation Function API, compact object headers and generational Shenandoah as product features, AOT ergonomics and method profiling, 32-bit x86 port removed; previews: primitive types in patterns, structured concurrency, stable values, PEM encodings |

The train keeps running after 25: Java 26 (March 2026) and later releases continue the six-month cadence, and under the two-year rule the next LTS after 25 is planned to be **Java 29** (September 2027). This notebook targets **17** as its baseline and marks examples that need 21 or 25.

### Upgrading between LTS releases

| Hop | Typical breakages | Fixes |
|---|---|---|
| **8 → 11** | JAXB, JAX-WS, `javax.annotation` and CORBA removed from the JDK; `sun.*` internals (`BASE64Encoder`) gone; the system class loader is no longer a `URLClassLoader`; old bytecode libraries (ASM, cglib, Lombok) fail on new class files | add the Jakarta/Glassfish artefacts as dependencies; use `java.util.Base64`; upgrade libraries and build plugins |
| **11 → 17** | **strong encapsulation**: reflection into JDK internals throws `InaccessibleObjectException`; Nashorn removed | upgrade frameworks (Spring, Hibernate, Mockito, Lombok); targeted `--add-opens` as a temporary measure; GraalJS instead of Nashorn |
| **17 → 21** | mostly smooth; UTF-8 default (18) can change file and console behaviour on Windows; warnings for dynamically loaded agents (Mockito inline) | set `-Dfile.encoding` explicitly if needed, or fix the code; `-XX:+EnableDynamicAgentLoading` or a `-javaagent` for tests |
| **21 → 25** | Security Manager APIs no longer work; `Unsafe` memory-access warnings; JNI restriction warnings; 32-bit x86 builds gone | remove `SecurityManager` usage; upgrade libraries using `Unsafe` (many now use FFM/`VarHandle`) |

**Tools:**
- `jdeps --jdk-internals` lists uses of internal APIs; `jdeprscan` finds deprecated APIs.
- Compile with **`--release N`** (it checks both the language level and the API).
- Run your test suite on the new JDK *before* switching the target release.
- OpenRewrite has automated migration recipes.

**Ecosystem gates:** Spring Boot 3 / Spring Framework 6 require **Java 17+** and the `jakarta.*` namespace, which pushed much of the industry to 17.

## Internal working

- **What preview means technically.** `javac --release 25 --enable-preview` marks the class file with a special minor version (`0xFFFF`), and the JVM refuses to load it unless started with `--enable-preview` on the **same** feature release. That stops preview code from leaking into production by accident, and allows the feature to change incompatibly before it's final.
- **Class-file versions.** Each feature release bumps the class-file major version: 52 = Java 8, 55 = 11, 61 = 17, 65 = 21, 69 = 25. An older JVM refuses newer class files with `UnsupportedClassVersionError: … class file version 65.0, this version of the Java Runtime only recognizes class file versions up to 61.0`. That message means the code was compiled for a newer Java than the one running it.
- **`--release` vs `-source/-target`.** `--release 17` compiles against the *Java 17 API signatures* as well as the language level, so using a Java 21 method fails at compile time instead of throwing `NoSuchMethodError` in production.
- **Multi-release JARs (9).** `META-INF/versions/21/...` can hold classes that replace the base versions on Java 21+, so a library can use new APIs while still supporting old runtimes.
- **The deprecation process.** Features are first deprecated (`@Deprecated(forRemoval = true)`, with warnings), then removed in a later release: Applets, Nashorn, RMI activation, the Security Manager, and soon finalization. `jdeprscan` reports them.
- **Many big features arrive as previews over several releases.**
  - **Pattern matching:** `instanceof` (14–16), switch (17–21), record patterns (19–21), primitives (23–25+).
  - **Virtual threads:** previews in 19 and 20, final in 21.
  - **Compact source files:** previews in 21–24, final in 25.

  Understanding the timeline explains why tutorials show different syntax.

## Visual representation

```text title="The release train since 2018 (LTS in brackets)"
  2014   2017  2018        2019        2020        2021        2022        2023        2024        2025      2026
  [8] .. 9 ... 10 -- [11] -- 12 -- 13 -- 14 -- 15 -- 16 -- [17] -- 18 -- 19 -- 20 -- [21] -- 22 -- 23 -- 24 -- [25] -- 26 ..
               Mar   Sep     Mar   Sep   Mar   Sep   Mar   Sep     Mar   Sep   Mar   Sep     Mar   Sep   Mar   Sep     Mar

  LTS gap: 3 years (8 -> 11 -> 17), then 2 years (17 -> 21 -> 25 -> 29 ...)

  a feature's path, e.g. pattern matching for switch:
    17 preview -> 18 2nd preview -> 19 3rd -> 20 4th -> 21 FINAL
  class file:  compiled with --enable-preview  ->  minor version 0xFFFF  ->  runs only on that JDK with --enable-preview
```

## Java code example

This tour uses one feature from each release from 8 to 17, so it runs on the notebook's Java 17 baseline. Later lessons in this stage cover 21 and 25 in depth.

```java title="VersionTour.java" file="VersionTour.java"
import java.net.http.HttpClient;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Predicate;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class VersionTour {
    sealed interface Shape permits Circle, Square { }               // 17
    record Circle(double radius) implements Shape { }               // 16
    record Square(double side) implements Shape { }

    public static void main(String[] args) {
        // Java 8: lambdas, streams, Optional, java.time
        List<String> langs = Stream.of("java", "kotlin", "scala").filter(s -> s.length() > 4).collect(Collectors.toList());
        say(8, "streams + lambdas " + langs + ", Optional " + Optional.of("x").map(String::toUpperCase).orElse("?"));
        say(8, "java.time: Java 8 shipped on a " + LocalDate.of(2014, 3, 18).getDayOfWeek());

        // Java 9: collection factories, takeWhile
        say(9, "List.of " + List.of(1, 2) + ", Map.of " + Map.of("k", "v")
                + ", takeWhile " + Stream.of(1, 2, 5, 1).takeWhile(i -> i < 3).collect(Collectors.toList()));

        // Java 10: var, copyOf
        var copy = List.copyOf(langs);
        say(10, "var + List.copyOf " + copy);

        // Java 11: String helpers, Predicate.not, HttpClient
        say(11, "strip [" + "  hi  ".strip() + "], isBlank " + "   ".isBlank() + ", repeat " + "ab".repeat(3) + ", lines " + "a\nb".lines().count());
        say(11, "Predicate.not " + Stream.of("a", " ", "b").filter(Predicate.not(String::isBlank)).collect(Collectors.toList()));
        say(11, "HttpClient prefers " + HttpClient.newHttpClient().version());

        // Java 12: teeing
        say(12, "teeing " + Stream.of(3, 9, 4).collect(Collectors.teeing(
                Collectors.counting(), Collectors.summingInt(i -> i), (count, sum) -> count + " items, sum " + sum)));

        // Java 14: switch expressions
        int day = 6;
        String kind = switch (day) {
            case 6, 7 -> "weekend";
            default -> "weekday";
        };
        say(14, "switch expression -> " + kind);

        // Java 15: text blocks
        String json = """
                {"since": 15}""";
        say(15, "text block " + json);

        // Java 16: records, instanceof patterns, Stream.toList
        Object shape = new Circle(2);
        if (shape instanceof Circle c && c.radius() > 1) {
            say(16, "pattern + record " + c);
        }
        say(16, "Stream.toList " + Stream.of(1, 2).toList());

        // Java 17: sealed classes
        say(17, "sealed hierarchy, square area " + area(new Square(3)));
        say(17, "this program runs on Java " + Runtime.version().feature());
    }

    static double area(Shape shape) {
        if (shape instanceof Circle c) {
            return Math.PI * c.radius() * c.radius();
        }
        if (shape instanceof Square s) {
            return s.side() * s.side();
        }
        throw new IllegalStateException("unknown shape");        // Java 21 switch patterns make this unnecessary
    }

    static void say(int version, String message) {
        System.out.printf("Java %-2d %s%n", version, message);
    }
}
```

## Output

```text title="Output" output="VersionTour.java"
Java 8  streams + lambdas [kotlin, scala], Optional X
Java 8  java.time: Java 8 shipped on a TUESDAY
Java 9  List.of [1, 2], Map.of {k=v}, takeWhile [1, 2]
Java 10 var + List.copyOf [kotlin, scala]
Java 11 strip [hi], isBlank true, repeat ababab, lines 2
Java 11 Predicate.not [a, b]
Java 11 HttpClient prefers HTTP_2
Java 12 teeing 3 items, sum 16
Java 14 switch expression -> weekend
Java 15 text block {"since": 15}
Java 16 pattern + record Circle[radius=2.0]
Java 16 Stream.toList [1, 2]
Java 17 sealed hierarchy, square area 9.0
Java 17 this program runs on Java 17
```

- Every line uses an API or syntax that didn't exist before the release shown. Compiling with `--release 11` reports an error for each feature marked 12 or later: `teeing`, the switch expression, the text block, records and `sealed`.
- The last line reports the runtime's feature number. It printed 17 here because the notebook runs examples on JDK 17; on a newer JDK it prints that version.
- The `throw` at the end of `area` is what Java 21's exhaustive `switch` over a sealed type removes (see the pattern-matching lesson).

## Real-world application

- **Choosing a version for a new service**: start on the latest **LTS** your frameworks support (21 or 25 today). Non-LTS releases are fine when you can upgrade every six months, but most teams can't.
- **Library authors** compile with `--release` set to the oldest version they support (often 8, 11 or 17) and use multi-release JARs to adopt newer APIs.
- **Platform upgrades** are planned projects: run `jdeps`, upgrade frameworks first, run CI on both JDKs, then switch the runtime, and later the language level.
- **Interviews** often ask "what did Java 8/11/17/21 bring?" and how releases work. Know the headline features of each LTS.
- **Reading tutorials**: knowing when a feature arrived tells you whether example code (records, `var`, text blocks) will compile on your project's version.

## Common mistakes

- **Running preview features in production.** They need flags, tie the class files to one JDK version, and may change or vanish (string templates did).
- **Skipping LTS releases without reading the removals**: Java EE modules (11), Nashorn (15), strong encapsulation (16/17), Security Manager (24).
- **Compiling with `-source/-target` instead of `--release`**, which lets newer APIs slip in and fail at run time.
- **Confusing "JDK version" with "language level"**: a JDK 21 compiler with `--release 17` produces Java 17 code without 21 features.
- **Assuming every vendor's LTS timeline is identical.** Support lengths differ between vendors; check yours.
- **Mistaking `UnsupportedClassVersionError` for a code bug.** It means the runtime is older than the compile target.

## Interview questions

**Q1. How does the Java release cadence work, and what is an LTS release?**

````reveal title="Answer"
Since Java 10 (2018), OpenJDK ships a feature release every six months, in March and September. Most releases are supported for about six months. Selected releases are **LTS**: 8, 11, 17, 21 and 25 so far, now every two years (previously three). Vendors provide years of updates for them, so production systems usually run LTS releases and upgrade from one LTS to the next.
````

**Q2. What is a preview feature?**

````reveal title="Answer"
A fully specified and implemented language or JVM feature released to gather feedback before it becomes permanent. It must be enabled at compile time (`javac --release N --enable-preview`) and at run time (`java --enable-preview`). The class file is marked so it only runs on that exact feature release. Previews can change or be withdrawn: string templates were previewed in 21 and 22, then removed. Not for production code.
````

**Q3. What were the key features of Java 8, 11, 17 and 21?**

````reveal title="Answer"
- **8**: lambdas, method references, streams, `Optional`, default methods, `java.time`, `CompletableFuture`, Metaspace.
- **11**: `HttpClient`, new `String` methods, `var` in lambdas, single-file source launch, `Files.readString`, ZGC (experimental), and removal of the Java EE and CORBA modules. It sits on top of 9–10: modules, `List.of`, `var`.
- **17**: sealed classes, strong encapsulation of internals. It sits on top of 12–16: switch expressions, text blocks, records, `instanceof` patterns, helpful NPEs, `Stream.toList`.
- **21**: virtual threads, sequenced collections, record patterns, pattern matching for `switch`, generational ZGC.
- **25**, as a bonus: compact source files with instance main, module imports, flexible constructor bodies, scoped values.
````

**Q4. What typically breaks when moving from Java 8 to 17?**

````reveal title="Answer"
- **Removed Java EE modules** (JAXB, JAX-WS, `javax.annotation`): add them as dependencies.
- **Internal APIs gone or inaccessible**: `sun.misc.BASE64Encoder`, and reflective access to JDK internals now throws `InaccessibleObjectException` because of strong encapsulation.
- **Outdated libraries**: old Lombok, Mockito, ASM, Spring 4 or Hibernate 5.2 can't handle the new class files or encapsulation.
- **Nashorn removal.**
- **Build plugin versions.**

Mitigation: `jdeps --jdk-internals`, upgrade the frameworks first, use temporary `--add-opens` flags, and compile with `--release`.
````

**Q5. What does `UnsupportedClassVersionError: class file version 65.0 … up to 61.0` mean?**

````reveal title="Answer"
The class was compiled for Java 21 (class-file major version 65) but is being run on a Java 17 JVM (which supports up to 61). Either run it on a newer JVM, or recompile with `--release 17` if the code doesn't need Java 21 features.
````

## Hands-on exercise

Write `VersionInfo` that classifies Java version strings:

- `feature(String)` returns the feature release number. It handles the legacy `1.8.0_402` form (the second number) and otherwise uses `Runtime.Version.parse(v).feature()`.
- `isLts(int)`: 8 and 11, then every fourth release from 17 (17, 21, 25, 29, …).
- `features(int)` lists which of these are available: lambdas (8), `var` (10), records (16), sealed (17), virtual threads (21), compact source files (25). Model each as a `record Milestone(String name, int since)` and filter with a stream.

Classify `1.8.0_402`, `11.0.22+7`, `17.0.10`, `21.0.5+11-LTS`, `24.0.2`, `25.0.1` and `26`, then print the running JVM's own version.

````hint title="Hint"
`Runtime.Version.parse` rejects `1.8.0_402` because of the underscore, so check `startsWith("1.")` first. For LTS: `f == 8 || f == 11 || (f >= 17 && (f - 17) % 4 == 0)`. Then `MILESTONES.stream().filter(m -> f >= m.since()).map(Milestone::name).collect(joining(", "))`.
````

````solution title="Solution"
```java title="VersionInfo.java" file="VersionInfo.java"
import java.util.List;
import java.util.stream.Collectors;

public class VersionInfo {
    record Milestone(String name, int since) { }

    static final List<Milestone> MILESTONES = List.of(
            new Milestone("lambdas", 8),
            new Milestone("var", 10),
            new Milestone("records", 16),
            new Milestone("sealed", 17),
            new Milestone("virtual threads", 21),
            new Milestone("compact source", 25));

    static int feature(String version) {
        if (version.startsWith("1.")) {                          // legacy scheme: 1.8.0_402 is Java 8
            return Integer.parseInt(version.split("\\.")[1]);
        }
        return Runtime.Version.parse(version).feature();
    }

    static boolean isLts(int feature) {
        return feature == 8 || feature == 11 || (feature >= 17 && (feature - 17) % 4 == 0);
    }

    static String features(int feature) {
        return MILESTONES.stream()
                .filter(m -> feature >= m.since())
                .map(Milestone::name)
                .collect(Collectors.joining(", "));
    }

    public static void main(String[] args) {
        for (String v : List.of("1.8.0_402", "11.0.22+7", "17.0.10", "21.0.5+11-LTS", "24.0.2", "25.0.1", "26")) {
            int f = feature(v);
            System.out.printf("%-14s Java %-2d %-7s %s%n", v, f, isLts(f) ? "LTS" : "non-LTS", features(f));
        }
        int running = Runtime.version().feature();
        System.out.println("this JVM: Java " + running + (isLts(running) ? " (LTS)" : ""));
    }
}
```

```text title="Output" output="VersionInfo.java"
1.8.0_402      Java 8  LTS     lambdas
11.0.22+7      Java 11 LTS     lambdas, var
17.0.10        Java 17 LTS     lambdas, var, records, sealed
21.0.5+11-LTS  Java 21 LTS     lambdas, var, records, sealed, virtual threads
24.0.2         Java 24 non-LTS lambdas, var, records, sealed, virtual threads
25.0.1         Java 25 LTS     lambdas, var, records, sealed, virtual threads, compact source
26             Java 26 non-LTS lambdas, var, records, sealed, virtual threads, compact source
this JVM: Java 17 (LTS)
```

`Runtime.Version` understands build numbers (`+11`) and optional suffixes (`-LTS`) without manual parsing. The LTS rule reflects the published plan; check your vendor's support policy for real support dates.
````

## Knowledge check

```quiz
? How often does OpenJDK ship a feature release?
+ Every six months, in March and September
- Once a year
- Whenever a major feature is ready
> The time-based train started with Java 10 in March 2018.

? Which of these is NOT an LTS release?
+ Java 23
- Java 17
- Java 25
> LTS so far: 8, 11, 17, 21, 25.

? What happens when a class compiled with --enable-preview on JDK 25 runs on JDK 26?
+ The JVM refuses to load it
- It runs normally
- It runs with warnings
> Preview class files are tied to the exact feature release that compiled them.

? In which release did records become a final feature?
+ Java 16
- Java 14
- Java 17
> Previewed in 14 and 15, final in 16; sealed classes followed in 17.

? Why prefer javac --release 17 over -source 17 -target 17?
+ It also checks API usage against the Java 17 library signatures
- It produces faster bytecode
- It enables preview features
> -source/-target let newer JDK APIs slip in, failing later with NoSuchMethodError.
```

## Key takeaways

- **Six-month feature releases** since Java 10; **LTS** releases are **8, 11, 17, 21, 25** (every 2 years now; next planned: 29).
- **Preview** features need `--enable-preview` and are tied to one release. **Incubator** APIs live in `jdk.incubator.*`.
- Headlines:
  - **8**: lambdas, streams, `Optional`, `java.time`.
  - **9–11**: modules, `List.of`, `var`, `HttpClient`.
  - **14–17**: switch expressions, text blocks, records, patterns, sealed.
  - **21**: virtual threads, sequenced collections, switch and record patterns.
  - **22–25**: FFM, `_`, gatherers, compact source files, module imports, flexible constructors, scoped values.
- Upgrades break on **removed modules, strong encapsulation and old libraries**. Use `jdeps`, `--release` and framework upgrades first.
