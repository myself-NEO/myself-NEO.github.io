## Concept explanation

### Why modules (JPMS, Java 9)

Before Java 9, an application was a flat **class path**: a list of JARs where any public class could be used by anyone. Missing JARs were discovered only when a class failed to load at run time, and two versions of a library silently shadowed each other ("JAR hell"). The **Java Platform Module System** adds a level above packages:

- **Reliable configuration**: each module declares what it **requires**. Missing modules are detected **at start-up**, as are duplicate modules and split packages.
- **Strong encapsulation**: only packages a module **exports** are accessible to other modules. `public` no longer means "public to the world"; internal packages stay internal, even to reflection unless **opened**.
- **A modular JDK**: the JDK itself is about 70 modules (`java.base`, `java.sql`, `java.net.http`…). `jlink` builds a **custom runtime image** containing only the modules you need.

```java
// src/shop.card/module-info.java
module shop.card {
    requires shop.api;                       // compile- and run-time dependency
    requires transitive java.sql;            // modules reading shop.card also read java.sql
    requires static lombok;                  // compile-time only (optional at run time)
    exports com.shop.card;                   // public types here are usable by other modules
    exports com.shop.card.spi to shop.app;   // qualified export
    opens com.shop.card.model;               // deep reflection allowed (Jackson, Hibernate)
    provides com.shop.api.PaymentProvider with com.shop.card.CardPayments;
    uses com.shop.api.FeePolicy;             // this module looks up services of that type
}
```

| Directive | Meaning |
|---|---|
| `requires M` | this module reads M |
| `requires transitive M` | and anyone reading this module also reads M (API types from M appear in our API) |
| `requires static M` | needed at compile time, optional at run time |
| `exports p` / `exports p to M` | public types of package p are accessible (to everyone / only to M) |
| `opens p` / `open module` | allow **deep reflection** (private members) on p at run time; doesn't export it at compile time |
| `uses S` / `provides S with Impl` | consume / supply a **service** via `ServiceLoader` |

### Class path vs module path

- JARs on the **class path** all belong to the **unnamed module**, which reads every module and exports everything. Most applications still run this way, and it works fine.
- JARs on the **module path** without a `module-info` become **automatic modules**:
  - their name comes from `Automatic-Module-Name` in the manifest, or from the file name;
  - they export everything and read everything.
  
  They're the migration bridge.
- **Split packages** (the same package in two modules) are forbidden on the module path.
- Escape hatches for legacy code:
  - `--add-opens`, `--add-exports`, `--add-reads`;
  - `--add-modules` (for example `ALL-MODULE-PATH`, or `java.se`).

### Services: the provider pattern

A **service** is an interface (or abstract class), and **providers** are implementations discovered at run time with **`ServiceLoader`**. The consumer depends only on the interface module, never on the implementations. You add a provider by putting another JAR on the path.
- **Class path**: providers are listed in `META-INF/services/<fully.qualified.Interface>`, one implementation class per line.
- **Module path**: `provides … with …` in the provider's `module-info`; the consumer needs `uses …`.
- A provider is either a public no-arg constructor or a **`public static provider()`** method (modules only).
- `ServiceLoader.load(S.class)` is **lazy**: providers are instantiated while iterating. `stream()` yields `Provider` objects whose `type()` can be inspected **without instantiating** them.

JDK examples of services:
- JDBC drivers (`java.sql.Driver`), which is why `Class.forName("com.mysql…Driver")` is no longer needed;
- `java.nio.file.spi.FileSystemProvider` (zip file systems), `javax.annotation.processing.Processor`;
- `System.LoggerFinder`, `java.time.chrono` calendars, charset providers.

## Internal working

- `module-info.java` compiles to **`module-info.class`**, a `ModuleDescriptor` with name, requires, exports, opens, uses, provides and an optional version.
- **Resolution at start-up**: the JVM's boot layer resolves the **root modules** (`--module`, `--add-modules`) against the module path and the system image, transitively following `requires`. It fails fast with `FindException` (module not found) or `ResolutionException` (cycles, split packages, two versions). **Service binding** then adds modules that `provide` a service some resolved module `uses`. The result is a `Configuration`, instantiated as a **`ModuleLayer`** that maps modules to class loaders.
- **Readability and accessibility** are checked by the JVM on every access: code in module A can use a type in module B only if A **reads** B and B **exports** the package to A. Deep reflection (`setAccessible`) additionally requires B to **open** the package.
- **Layers** can be stacked: application servers and plugin systems create child layers at run time (with `ModuleLayer.defineModulesWithOneLoader`) to load plugins with their own versions of dependencies. The example below builds one.
- **`jlink`** links modules into a runtime image: `jlink --add-modules shop.app --output build/runtime --strip-debug --no-header-files`. The resulting image contains only the required JDK modules (often 40-60 MB instead of 300+ MB), which suits containers. **`jdeps --print-module-deps app.jar`** tells you which JDK modules a class-path app uses.
- **`ServiceLoader` on the class path** reads every `META-INF/services/<name>` resource visible to the class loader, in class-path order, and instantiates the listed classes reflectively. Errors such as "not a subtype" or "no public constructor" surface as **`ServiceConfigurationError`** during iteration.

## Visual representation

```text title="Modules in a layer, wired by a service"
 module shop.api        exports com.shop.api       (PaymentProvider interface)
     ^          ^          ^
     | requires |          | requires
 module shop.card      module shop.wallet          module shop.app
   provides PaymentProvider   provides PaymentProvider   uses PaymentProvider
   with CardPayments          with WalletPayments.provider()  exports com.shop.app
   com.shop.card.internal (NOT exported)

 shop.app reads shop.api only; it never reads shop.card or shop.wallet.
 resolveAndBind(..., roots = {shop.app}) pulls in shop.api (requires)
                                          and shop.card + shop.wallet (service binding)
 ServiceLoader.load(layer, PaymentProvider.class) -> [CardPayments, WalletPayments]
```

## Java code example

This program writes four module sources to a temporary directory, compiles them with the `javax.tools` compiler API (the same as `javac --module-source-path src -d out --module ...`), loads them into a new **module layer**, and explores services, readability and encapsulation:

```java title="ModulesDemo.java" file="ModulesDemo.java"
import java.io.IOException;
import java.lang.module.Configuration;
import java.lang.module.FindException;
import java.lang.module.ModuleDescriptor;
import java.lang.module.ModuleFinder;
import java.lang.reflect.InaccessibleObjectException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.ServiceLoader;
import java.util.Set;
import java.util.stream.Stream;
import javax.tools.ToolProvider;

public class ModulesDemo {
    static void write(Path root, String file, String code) throws IOException {
        Path path = root.resolve(file);
        Files.createDirectories(path.getParent());
        Files.writeString(path, code);
    }

    static void writeSources(Path src) throws IOException {
        write(src, "shop.api/module-info.java", "module shop.api { exports com.shop.api; }");
        write(src, "shop.api/com/shop/api/PaymentProvider.java", """
                package com.shop.api;
                public interface PaymentProvider {
                    String name();
                    String pay(long cents);
                }
                """);
        write(src, "shop.card/module-info.java", """
                module shop.card {
                    requires shop.api;
                    provides com.shop.api.PaymentProvider with com.shop.card.CardPayments;
                }
                """);
        write(src, "shop.card/com/shop/card/CardPayments.java", """
                package com.shop.card;
                public class CardPayments implements com.shop.api.PaymentProvider {
                    public String name() { return "card"; }
                    public String pay(long cents) {
                        return "card charged " + (cents + com.shop.card.internal.Fees.of(cents)) + " incl. fee";
                    }
                }
                """);
        write(src, "shop.card/com/shop/card/internal/Fees.java", """
                package com.shop.card.internal;
                public class Fees {
                    public static long of(long cents) { return 30 + cents * 29 / 1000; }
                }
                """);
        write(src, "shop.wallet/module-info.java", """
                module shop.wallet {
                    requires shop.api;
                    provides com.shop.api.PaymentProvider with com.shop.wallet.WalletPayments;
                }
                """);
        write(src, "shop.wallet/com/shop/wallet/WalletPayments.java", """
                package com.shop.wallet;
                public class WalletPayments implements com.shop.api.PaymentProvider {
                    private final String version;
                    private WalletPayments(String version) { this.version = version; }
                    public static WalletPayments provider() { return new WalletPayments("v2"); }  // provider method
                    public String name() { return "wallet-" + version; }
                    public String pay(long cents) { return "wallet debited " + cents; }
                }
                """);
        write(src, "shop.app/module-info.java", """
                module shop.app {
                    requires shop.api;
                    exports com.shop.app;
                    uses com.shop.api.PaymentProvider;
                }
                """);
        write(src, "shop.app/com/shop/app/Checkout.java", """
                package com.shop.app;
                import com.shop.api.PaymentProvider;
                import java.util.Comparator;
                import java.util.ServiceLoader;
                public class Checkout {
                    public static String run(long cents) {
                        StringBuilder out = new StringBuilder();
                        ServiceLoader.load(Checkout.class.getModule().getLayer(), PaymentProvider.class).stream()
                                .map(ServiceLoader.Provider::get)
                                .sorted(Comparator.comparing(PaymentProvider::name))
                                .forEach(p -> out.append("\\n    ").append(p.name()).append(": ").append(p.pay(cents)));
                        return out.toString();
                    }
                }
                """);
    }

    static void deleteTree(Path root) throws IOException {
        try (Stream<Path> paths = Files.walk(root)) {
            for (Path p : paths.sorted(Comparator.reverseOrder()).toList()) {
                Files.delete(p);
            }
        }
    }

    public static void main(String[] args) throws Exception {
        Module base = String.class.getModule();
        System.out.println("String lives in " + base + ": exports java.lang " + base.isExported("java.lang")
                + ", opens java.lang " + base.isOpen("java.lang") + ", exports jdk.internal.misc " + base.isExported("jdk.internal.misc"));
        System.out.println("this class is in a named module: " + ModulesDemo.class.getModule().isNamed() + " (class path = unnamed module)");

        Path src = Files.createTempDirectory("modules-src");
        Path out = Files.createTempDirectory("modules-out");
        try {
            writeSources(src);
            int exit = ToolProvider.getSystemJavaCompiler().run(null, null, null,
                    "--module-source-path", src.toString(), "-d", out.toString(),
                    "--module", "shop.api,shop.card,shop.wallet,shop.app");
            System.out.println("javac exit code " + exit);

            // Reliable configuration: resolution fails up front when a required module is missing
            try {
                ModuleLayer.boot().configuration().resolve(ModuleFinder.of(out.resolve("shop.app")), ModuleFinder.of(), Set.of("shop.app"));
            } catch (FindException e) {
                System.out.println("resolve without shop.api: FindException: " + e.getMessage());
            }

            // Resolve shop.app plus service providers (binding), then create a layer
            Configuration config = ModuleLayer.boot().configuration()
                    .resolveAndBind(ModuleFinder.of(out), ModuleFinder.of(), Set.of("shop.app"));
            ModuleLayer layer = ModuleLayer.boot().defineModulesWithOneLoader(config, ClassLoader.getSystemClassLoader());
            System.out.println("layer modules: " + layer.modules().stream().map(Module::getName).sorted().toList());

            ModuleDescriptor card = layer.findModule("shop.card").orElseThrow().getDescriptor();
            System.out.println("shop.card requires " + card.requires().stream().map(ModuleDescriptor.Requires::name).sorted().toList()
                    + ", exports " + card.exports() + ", provides " + card.provides().stream().map(p -> p.service() + " with " + p.providers()).toList());

            Class<?> api = layer.findLoader("shop.api").loadClass("com.shop.api.PaymentProvider");
            System.out.println("provider types found without instantiating: "
                    + ServiceLoader.load(layer, api).stream().map(p -> p.type().getName()).sorted().toList());

            Class<?> checkout = layer.findLoader("shop.app").loadClass("com.shop.app.Checkout");
            System.out.println("Checkout.run(1000):" + checkout.getMethod("run", long.class).invoke(null, 1_000L));

            Module app = layer.findModule("shop.app").orElseThrow();
            Module cardModule = layer.findModule("shop.card").orElseThrow();
            System.out.println("shop.app reads shop.api: " + app.canRead(layer.findModule("shop.api").orElseThrow())
                    + ", reads shop.card: " + app.canRead(cardModule));

            Class<?> fees = layer.findLoader("shop.card").loadClass("com.shop.card.internal.Fees");
            Method of = fees.getMethod("of", long.class);
            System.out.println("shop.card exports internal package: " + cardModule.isExported("com.shop.card.internal"));
            try {
                of.invoke(null, 1_000L);
            } catch (IllegalAccessException e) {
                System.out.println("public method in a non-exported package: IllegalAccessException");
            }
            try {
                of.setAccessible(true);
            } catch (InaccessibleObjectException e) {
                System.out.println("setAccessible: InaccessibleObjectException (package not opened)");
            }
        } finally {
            deleteTree(src);
            deleteTree(out);
        }
        System.out.println("temporary directories removed: " + (Files.notExists(src) && Files.notExists(out)));
    }
}
```

## Output

```text title="Output" output="ModulesDemo.java"
String lives in module java.base: exports java.lang true, opens java.lang false, exports jdk.internal.misc false
this class is in a named module: false (class path = unnamed module)
javac exit code 0
resolve without shop.api: FindException: Module shop.api not found, required by shop.app
layer modules: [shop.api, shop.app, shop.card, shop.wallet]
shop.card requires [java.base, shop.api], exports [], provides [com.shop.api.PaymentProvider with [com.shop.card.CardPayments]]
provider types found without instantiating: [com.shop.card.CardPayments, com.shop.wallet.WalletPayments]
Checkout.run(1000):
    card: card charged 1059 incl. fee
    wallet-v2: wallet debited 1000
shop.app reads shop.api: true, reads shop.card: false
shop.card exports internal package: false
public method in a non-exported package: IllegalAccessException
setAccessible: InaccessibleObjectException (package not opened)
temporary directories removed: true
```

- **`java.base`** exports `java.lang` but doesn't **open** it (no deep reflection), and doesn't export its internal `jdk.internal.misc` at all. Our demo class sits in the **unnamed module** of the class path.
- **Reliable configuration**: resolving `shop.app` without `shop.api` failed immediately with `FindException`, before any class was loaded.
- **`resolveAndBind`** started from `shop.app`:
  - **`requires`** pulled in `shop.api`;
  - **service binding** pulled in `shop.card` and `shop.wallet`, because they provide a service that `shop.app` uses.
- `shop.app` **does not read** either provider module, yet `Checkout` used both through the interface. `WalletPayments` was created by its static `provider()` method, despite the private constructor. `stream().map(p -> p.type())` listed the providers without instantiating them.
- **Strong encapsulation**: `Fees` and its `of` method are `public`, but its package isn't exported, so reflective invocation failed. `setAccessible` also failed because the package isn't opened. Before modules, any public class was usable by anyone.

## Real-world application

- **Library authors** add `module-info.java` (or at least `Automatic-Module-Name`) so users can put the library on the module path. Many popular libraries ship real modules (Jackson, SLF4J 2, Log4j 2, JUnit 5).
- **Applications** mostly stay on the class path. Strong encapsulation of the JDK still applies to them, which is why Java 17 upgrades surface `InaccessibleObjectException`, fixed with library upgrades or `--add-opens`.
- **Container images**: use `jdeps --print-module-deps` and `jlink` to ship a trimmed runtime with the app (smaller images, smaller attack surface).
- **Plugin architectures with `ServiceLoader`**:
  - JDBC drivers, logging back-ends (SLF4J 2 finds its provider via `ServiceLoader`);
  - `java.net.spi.InetAddressResolverProvider` (Java 18);
  - Spring Boot's auto-configuration list (a similar idea with its own `META-INF/spring/...imports` file);
  - IDE and build-tool plugins, and the payment, export or storage providers of a modular monolith.
- **Module layers**: application servers and plugin hosts (e.g. Layrry, some IDEs) load plugins in child layers, isolating their dependencies.

## Common mistakes

- **Expecting `public` to mean accessible**: across modules it also needs `exports`. Frameworks that reflect on private fields need `opens`.
- **Exporting packages just to let a framework reflect**: use `opens` (optionally `opens p to framework.module`), which doesn't expose the package as API.
- **Split packages**: two modules containing the same package fail resolution. This is common with old libraries such as `javax.annotation` duplicates.
- **Forgetting `uses`** in the consuming module. `ServiceLoader` throws `ServiceConfigurationError` in a named module that doesn't declare `uses`.
- **Typos in `META-INF/services` files**: the file name must be the interface's **binary name** (`com.x.Outer$Inner` for nested types). Errors appear only when iterating.
- **Instantiating every provider just to choose one**: use `stream()` and `Provider.type()`, possibly with annotations on the type, before calling `get()`.
- **Assuming you must modularise an application**: the class path remains fully supported. Modularise libraries and keep things pragmatic.

## Interview questions

**Q1. What problems does JPMS solve?**

````reveal title="Answer"
- **Reliable configuration**: declared dependencies checked at start-up instead of `NoClassDefFoundError` at run time; no split packages or duplicate modules.
- **Strong encapsulation**: only exported packages are accessible, so internals (including the JDK's own) stay hidden.
- **A modular, scalable platform**: `jlink` custom runtimes and smaller images.

It also improves security, because the JDK's internals can't be called, and performance, because start-up knows which modules exist.
````

**Q2. `exports` vs `opens`?**

````reveal title="Answer"
`exports p` makes p's public types accessible at **compile time and run time** to other modules, but not their private members via reflection. `opens p` allows **deep reflection** at run time (including `setAccessible(true)` on private members) without making p part of the compile-time API. Frameworks like Hibernate and Jackson need `opens` on model packages. An `open module` opens all its packages. Both can be qualified (`to some.module`).
````

**Q3. How does `ServiceLoader` work, and why is it useful?**

````reveal title="Answer"
The consumer asks `ServiceLoader.load(Service.class)` for implementations. On the class path, providers are listed in `META-INF/services/<binary name of the interface>`. On the module path, they're declared with `provides … with …`, and the consumer declares `uses`. Loading is lazy: providers are instantiated during iteration, and `stream()` exposes `Provider.type()` without instantiating. It decouples consumers from implementations: adding a JAR adds a provider (JDBC drivers, logging back-ends, charsets, file systems) with no code changes.
````

**Q4. What are the unnamed module and automatic modules?**

````reveal title="Answer"
All class-path code belongs to the **unnamed module**. It reads every module, exports all its packages, and named modules can't `require` it. A JAR **without** `module-info` placed on the **module path** becomes an **automatic module**: its name comes from `Automatic-Module-Name` or the file name, and it exports and opens all its packages and reads all modules. Automatic modules let modular code depend on not-yet-modular libraries during migration.
````

**Q5. What does `requires transitive` do?**

````reveal title="Answer"
It provides **implied readability**: if module A `requires transitive B`, every module that reads A also reads B automatically. Use it when A's exported API exposes B's types (for example a method returning `java.sql.Connection` requires `transitive java.sql`); otherwise every client would have to add `requires B` itself. `requires static` is different: B is needed at compile time but is optional at run time.
````

## Hands-on exercise

Build a **class-path plugin system** with `ServiceLoader`:
- an interface `Codec { String name(); String encode(String s); }` and two providers, `ReverseCodec` and `Rot13Codec` (public nested classes with public no-arg constructors);
- at run time, create a temporary directory with the provider-configuration file `META-INF/services/<binary name of Codec>` listing both providers, plus a third line naming a class that **doesn't implement** `Codec`;
- load the providers with `ServiceLoader.load(Codec.class, new URLClassLoader(new URL[] { dir.toUri().toURL() }))`. Iterate, collecting codecs by name; catch the `ServiceConfigurationError` for the bad line and report it;
- encode `"Hello"` with every codec found, sorted by name, then delete the directory.

````hint title="Hint"
The binary name of a nested class uses `$`: `Codec.class.getName()` gives it, so use that for both the file name and the class lines. Put the bad entry last, because iteration after an error is only "best effort". Pass `ClassLoader.getSystemClassLoader()` as the parent so the listed classes resolve to the ones already on the class path.
````

````solution title="Solution"
```java title="CodecPlugins.java" file="CodecPlugins.java"
import java.io.IOException;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.Iterator;
import java.util.List;
import java.util.ServiceConfigurationError;
import java.util.ServiceLoader;
import java.util.TreeMap;
import java.util.stream.Stream;

public class CodecPlugins {
    public interface Codec {
        String name();
        String encode(String s);
    }

    public static class ReverseCodec implements Codec {
        public String name() { return "reverse"; }
        public String encode(String s) { return new StringBuilder(s).reverse().toString(); }
    }

    public static class Rot13Codec implements Codec {
        public String name() { return "rot13"; }
        public String encode(String s) {
            StringBuilder out = new StringBuilder();
            for (char c : s.toCharArray()) {
                if (Character.isUpperCase(c)) {
                    out.append((char) ('A' + (c - 'A' + 13) % 26));
                } else if (Character.isLowerCase(c)) {
                    out.append((char) ('a' + (c - 'a' + 13) % 26));
                } else {
                    out.append(c);
                }
            }
            return out.toString();
        }
    }

    public static class NotACodec { }

    static void deleteTree(Path root) throws IOException {
        try (Stream<Path> paths = Files.walk(root)) {
            for (Path p : paths.sorted(Comparator.reverseOrder()).toList()) {
                Files.delete(p);
            }
        }
    }

    public static void main(String[] args) throws IOException {
        Path dir = Files.createTempDirectory("plugins");
        try {
            Path config = dir.resolve("META-INF/services/" + Codec.class.getName());
            Files.createDirectories(config.getParent());
            Files.write(config, List.of(
                    "# provider-configuration file: one class per line",
                    ReverseCodec.class.getName(),
                    Rot13Codec.class.getName(),
                    NotACodec.class.getName()));
            System.out.println("config file: META-INF/services/" + Codec.class.getName());

            TreeMap<String, Codec> codecs = new TreeMap<>();
            try (URLClassLoader loader = new URLClassLoader(new URL[] { dir.toUri().toURL() }, ClassLoader.getSystemClassLoader())) {
                Iterator<Codec> it = ServiceLoader.load(Codec.class, loader).iterator();
                while (true) {
                    try {
                        if (!it.hasNext()) {
                            break;
                        }
                        Codec codec = it.next();
                        codecs.put(codec.name(), codec);
                    } catch (ServiceConfigurationError e) {
                        System.out.println("skipped bad provider: " + e.getMessage());
                        break;
                    }
                }
            }
            codecs.forEach((name, codec) -> System.out.println(name + ": Hello -> " + codec.encode("Hello")));
        } finally {
            deleteTree(dir);
        }
    }
}
```

```text title="Output" output="CodecPlugins.java"
config file: META-INF/services/CodecPlugins$Codec
skipped bad provider: CodecPlugins$Codec: CodecPlugins$NotACodec not a subtype
reverse: Hello -> olleH
rot13: Hello -> Uryyb
```

Adding a codec now means adding a class and a line in a `META-INF/services` file, typically in a separate JAR, with no change to the code that uses codecs. The bad entry surfaced only during iteration, as a `ServiceConfigurationError` with a precise message, which is why plugin hosts guard the iteration.
````

## Knowledge check

```quiz
? Module A has a public class in package com.a.internal, which it doesn't export. Can module B use it?
+ No, a package must be exported for its public types to be accessible
- Yes, public means accessible everywhere
- Only if B requires A
> Exports control accessibility across modules.

? A framework needs to reflect on private fields of your model package. Which directive is most appropriate?
+ opens com.app.model (optionally to the framework module)
- exports com.app.model
- requires transitive com.app.model
> opens allows deep reflection without exporting the package as API.

? Where are class-path service providers declared?
+ In META-INF/services/<binary name of the service interface>
- In module-info.java with uses
- In MANIFEST.MF
> Modules use provides ... with ... instead.

? What does resolveAndBind add beyond resolve?
+ Modules that provide services used by the resolved modules
- Automatic modules from the class path
- Opens for all packages
> Service binding.

? What is a JAR without module-info placed on the module path?
+ An automatic module that exports all its packages
- Part of the unnamed module
- Rejected at start-up
> Its name comes from Automatic-Module-Name or the file name.
```

## Key takeaways

- **JPMS** adds modules above packages: `requires` gives reliable configuration (missing modules fail at start-up), `exports` gives strong encapsulation, and `jlink` builds trimmed runtimes.
- **`exports`** = API access, **`opens`** = deep reflection, **`requires transitive`** = implied readability, **`requires static`** = optional at run time.
- The class path is the **unnamed module**; JARs on the module path without descriptors are **automatic modules**; the JDK's internals are encapsulated either way.
- **`ServiceLoader`** decouples consumers from implementations: `META-INF/services` on the class path, `provides`/`uses` with modules, lazy instantiation, `Provider.type()` for inspection.
- Layers (`ModuleLayer`) let plugin hosts load modules dynamically with isolated class loaders.
