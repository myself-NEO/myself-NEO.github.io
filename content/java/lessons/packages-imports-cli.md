## Concept explanation

### Packages

A **package** is a namespace for related types, declared on the first line of a source file:

```java
package com.acme.billing.invoice;
```

Packages give you:

- **Unique names**: `com.acme.billing.Invoice` and `org.other.Invoice` can coexist. By convention the prefix is your organisation's reversed domain name.
- **Organisation**: one package per feature or layer (`…invoice`, `…payment`).
- **Access control**: members with no modifier are **package-private**, visible only inside the same package (see [access modifiers](lesson:access-modifiers-encapsulation)).

Rules: the directory structure mirrors the package (`com/acme/billing/invoice/Invoice.java`), and a class's **fully qualified name** is `package + "." + simpleName`. Code without a `package` line is in the **unnamed (default) package**, which can't be imported from named packages — fine for scripts, not for real projects.

Packages are **not hierarchical** for access: `com.acme.billing` and `com.acme.billing.invoice` are unrelated as far as package-private access is concerned.

### Imports

Imports are purely a **compile-time shorthand**; they don't load or include anything.

| Form | Example | Notes |
|---|---|---|
| Single-type | `import java.util.List;` | preferred; explicit |
| On-demand | `import java.util.*;` | all public types of one package (not sub-packages) |
| Static single | `import static java.lang.Math.max;` | use a static member without its class |
| Static on-demand | `import static org.junit.jupiter.api.Assertions.*;` | common in tests |

`java.lang.*` is imported automatically. If two on-demand imports provide the same simple name (`java.util.List` and `java.awt.List`), using `List` is a compile error until you add a single-type import or use the fully qualified name. Java 25 adds **module imports** (`import module java.base;`), covered in [Java 21 → 25 features](lesson:java-21-to-25-features).

### The class path

The **class path** tells `javac` and `java` where to find compiled classes and JARs: `-cp` / `--class-path` (or the `CLASSPATH` environment variable, which is best left unset). Entries are directories (roots of package trees) or JAR files, separated by `:` on Linux/macOS and `;` on Windows.

```bash
javac -d out src/com/acme/app/Main.java src/com/acme/app/util/Text.java
java -cp out com.acme.app.Main --name=Ada
java -cp "out:lib/*" com.acme.app.Main        # lib/* = every JAR in lib (Linux/macOS)
```

Since Java 9 there is also a **module path** (`-p`) for modular JARs; see [modules and SPI](lesson:modules-and-spi). Build tools (Maven, Gradle) compute both for you.

### Command-line arguments

Everything after the class name is passed to `main` as `String[] args`: split on whitespace by the **shell**, quotes group words, and nothing is parsed for you.

```bash
java -cp out com.acme.app.Main --name="Ada Lovelace" -v 3
# args = ["--name=Ada Lovelace", "-v", "3"]
```

Options *before* the class name (`-Xmx512m`, `-Dkey=value`) go to the JVM, not to your program. Read `-D` system properties with `System.getProperty("key")`, and environment variables with `System.getenv("NAME")`.

## Internal working

- `javac` resolves every simple name to a fully qualified one using the imports, then writes **only fully qualified names** into the class file. A class file has no record of your import statements.
- At run time the **application class loader** turns a class name such as `com.acme.app.util.Text` into the path `com/acme/app/util/Text.class` and looks it up in each class-path entry, in order. The first match wins, which is why two versions of a library on the class path ("JAR hell") cause unpredictable behaviour.
- If a class used by your code is missing at run time, you get `NoClassDefFoundError` the first time code that needs it runs — not at startup.
- `java -jar app.jar` **ignores `-cp`** and uses the `Main-Class` and `Class-Path` entries of the JAR's manifest.
- The launcher passes `args` exactly as the OS gave them; the `String[]` is never `null` (empty when there are no arguments).

## Visual representation

```text title="Package layout, compile and run"
  project/
  +-- src/
  |   +-- com/acme/app/
  |       +-- Main.java              package com.acme.app;   import com.acme.app.util.Text;
  |       +-- util/
  |           +-- Text.java          package com.acme.app.util;
  +-- out/                           (javac -d out ...)
      +-- com/acme/app/
          +-- Main.class
          +-- util/Text.class

  java -cp out com.acme.app.Main a b
        |            |              |
        |            |              +--> args = ["a", "b"]
        |            +--> fully qualified name -> out/com/acme/app/Main.class
        +--> class path root(s)
```

## Java code example

A single-file tool (runnable with `java ArgsDemo.java …`) that uses static imports and parses `--key=value`, `--flag value` and positional arguments by hand:

```java title="ArgsDemo.java" file="ArgsDemo.java" args="--name=Ada --repeat 2 -v report.txt"
import static java.lang.Math.max;
import static java.util.stream.Collectors.joining;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class ArgsDemo {
    public static void main(String[] args) {
        System.out.println("raw args (" + args.length + "): " + String.join(" | ", args));

        Map<String, String> options = new LinkedHashMap<>();
        List<String> positional = new ArrayList<>();
        for (int i = 0; i < args.length; i++) {
            String arg = args[i];
            if (arg.startsWith("--") && arg.contains("=")) {           // --key=value
                int eq = arg.indexOf('=');
                options.put(arg.substring(2, eq), arg.substring(eq + 1));
            } else if (arg.startsWith("--") && i + 1 < args.length) {  // --key value
                options.put(arg.substring(2), args[++i]);
            } else if (arg.startsWith("-") && arg.length() == 2) {      // -v style flag
                options.put(arg.substring(1), "true");
            } else {
                positional.add(arg);
            }
        }

        String name = options.getOrDefault("name", "world");
        int repeat = max(1, Integer.parseInt(options.getOrDefault("repeat", "1")));
        boolean verbose = Boolean.parseBoolean(options.getOrDefault("v", "false"));

        for (int i = 0; i < repeat; i++) {
            System.out.println("Hello, " + name + "!");
        }
        System.out.println("options = " + options);
        System.out.println("positional = " + positional.stream().collect(joining(", ", "[", "]")));
        System.out.println("verbose = " + verbose + ", user.home set: " + (System.getProperty("user.home") != null));
        System.out.println("my class lives in package: '" + ArgsDemo.class.getPackageName() + "'");
    }
}
```

```bash
java ArgsDemo.java --name=Ada --repeat 2 -v report.txt
```

## Output

```text title="Output" output="ArgsDemo.java"
raw args (5): --name=Ada | --repeat | 2 | -v | report.txt
Hello, Ada!
Hello, Ada!
options = {name=Ada, repeat=2, v=true}
positional = [report.txt]
verbose = true, user.home set: true
my class lives in package: ''
```

- The shell split the command line into five strings; parsing them into options is the program's job.
- `max` and `joining` are used without their class names thanks to static imports.
- The class is in the unnamed package, so `getPackageName()` is the empty string. In a real project it would be `com.acme.app`.

## Real-world application

- **Every Java project** uses the reversed-domain package convention, organised by feature (`com.shop.order`, `com.shop.payment`) rather than only by layer — which also lets package-private types hide implementation details.
- **CLI tools** use libraries such as picocli or JCommander instead of hand-written parsing: they generate help text, validate types and handle `--` and quoting edge cases.
- **Configuration**: services read `-Dspring.profiles.active=prod`, environment variables (twelve-factor apps) and arguments; frameworks merge them with a clear precedence.
- **Dependency conflicts**: diagnosing `NoSuchMethodError`/`NoClassDefFoundError` in production usually means two versions of a library on the class path; `mvn dependency:tree` and `java -verbose:class` show what was loaded from where.

## Common mistakes

- **Package and directory don't match**: `javac` may compile it, but `java` can't find the class.
- **Running with a path instead of a class name**: `java out/com/acme/app/Main` instead of `java -cp out com.acme.app.Main`.
- **Using `;` vs `:` in the class path on the wrong OS.**
- **Combining `-jar` with `-cp`** and wondering why the class path is ignored.
- **Assuming `import com.acme.*;` imports `com.acme.util` classes**: on-demand imports don't include sub-packages.
- **Putting real code in the default package**: it can't be imported by named packages.
- **Indexing `args[0]` without checking `args.length`** → `ArrayIndexOutOfBoundsException`.

## Interview questions

**Q1. Do imports affect performance or the size of the class file?**

````reveal title="Answer"
No. Imports are a compile-time naming convenience. `javac` resolves names and writes fully qualified references into the class file; unused or wildcard imports leave no trace in the bytecode and don't load classes. The only risks of wildcards are name ambiguity and readability.
````

**Q2. What is the difference between the class path and the module path?**

````reveal title="Answer"
The class path is a flat list of directories/JARs searched in order; everything on it is in the unnamed module and can see every public type. The module path (Java 9+) holds modules with `module-info` descriptors that declare dependencies (`requires`) and exported packages (`exports`); the JVM checks them at startup and enforces strong encapsulation. Most applications still run on the class path.
````

**Q3. Can two classes have the same name?**

````reveal title="Answer"
Yes, if they're in different packages — their fully qualified names differ. At run time a class's identity is actually *(fully qualified name, defining class loader)*, so even the same name loaded by two class loaders yields two distinct classes (a source of `ClassCastException: X cannot be cast to X` in app servers).
````

**Q4. How do you pass configuration to a Java program?**

````reveal title="Answer"
Command-line arguments (`String[] args`, after the class name), system properties (`-Dkey=value` before the class name, read with `System.getProperty`), environment variables (`System.getenv`), and configuration files. Production services usually layer them with a defined precedence (framework config, env vars overriding files).
````

## Hands-on exercise

Write `Calc.java`, a command-line calculator invoked as `java Calc.java add 5 7` or `java Calc.java max 3 9 4`. Supported operations: `add`, `mul`, `max`. Print a usage message (and don't throw) when arguments are missing, the operation is unknown, or a number is malformed.

````hint title="Hint"
`args[0]` is the operation; parse `args[1..]` with `Integer.parseInt` inside a `try`. Use a `switch` on the operation and validate `args.length` first.
````

````solution title="Solution"
```java title="Calc.java" file="Calc.java" args="max 3 9 4"
import java.util.Arrays;

public class Calc {
    static final String USAGE = "usage: java Calc.java <add|mul|max> <int> [<int>...]";

    public static void main(String[] args) {
        System.out.println(run(args));
        System.out.println(run(new String[] {"add", "5", "7"}));
        System.out.println(run(new String[] {"mul", "2", "x"}));
        System.out.println(run(new String[] {"pow", "2", "3"}));
        System.out.println(run(new String[0]));
    }

    static String run(String[] args) {
        if (args.length < 2) {
            return USAGE;
        }
        int[] numbers;
        try {
            numbers = Arrays.stream(args, 1, args.length).mapToInt(Integer::parseInt).toArray();
        } catch (NumberFormatException e) {
            return "not a number: " + e.getMessage() + "\n" + USAGE;
        }
        switch (args[0]) {
            case "add":
                return "add = " + Arrays.stream(numbers).sum();
            case "mul":
                return "mul = " + Arrays.stream(numbers).reduce(1, (a, b) -> a * b);
            case "max":
                return "max = " + Arrays.stream(numbers).max().getAsInt();
            default:
                return "unknown operation '" + args[0] + "'\n" + USAGE;
        }
    }
}
```

```text title="Output" output="Calc.java"
max = 9
add = 12
not a number: For input string: "x"
usage: java Calc.java <add|mul|max> <int> [<int>...]
unknown operation 'pow'
usage: java Calc.java <add|mul|max> <int> [<int>...]
usage: java Calc.java <add|mul|max> <int> [<int>...]
```

The first line comes from the real command-line arguments (`max 3 9 4`); the others call `run` directly to show each error path.
````

## Knowledge check

```quiz
? What does `import java.util.*;` give you access to?
- java.util and all its sub-packages, such as java.util.concurrent
+ Public types directly in java.util only
- Nothing at run time unless the classes are used
> On-demand imports cover one package, not sub-packages.

? Where must `com.acme.app.Main` be found when running `java -cp out com.acme.app.Main`?
+ out/com/acme/app/Main.class
- out/Main.class
- com/acme/app/Main.java
> The package maps to a directory path under a class-path root.

? In `java -Xmx512m -Denv=prod App start now`, what is `args`?
- ["-Xmx512m", "-Denv=prod", "start", "now"]
+ ["start", "now"]
- ["App", "start", "now"]
> Options before the class name go to the JVM.

? What does `java -jar app.jar` do with a `-cp` option?
- Appends it to the JAR's class path
+ Ignores it; the manifest decides the class path
- Fails with an error
> With -jar, the JAR manifest is the only class-path source.
```

## Key takeaways

- Packages are **namespaces** that mirror directories; fully qualified name = package + class name.
- Imports are **compile-time shorthand** only; `java.lang` is implicit; static imports bring in static members.
- The **class path** lists roots and JARs searched in order (`:` vs `;`); `-jar` uses the manifest instead.
- `args` holds the words **after the class name**; JVM options and `-D` properties come before it.
- Missing classes surface as `NoClassDefFoundError` at first use; duplicate libraries cause "JAR hell".
