## Concept explanation

A class isn't "in" the JVM until something asks for it. **Class loading** is lazy: the first time code needs a class, the JVM finds its bytes and turns them into a runtime type in three phases.

### 1. Loading

A **class loader** finds the binary representation (a `.class` file in a JAR or directory, an entry in the JDK's module image, bytes generated at run time…) and creates the internal class structure plus a `java.lang.Class` object for it.

### 2. Linking

| Step | What happens |
|---|---|
| **Verification** | the bytecode verifier checks the class is well-formed and type-safe: valid stack usage, correct types on every path, no jumps into the middle of instructions. Failures throw `VerifyError`. |
| **Preparation** | memory for **static fields** is allocated and set to **default values** (`0`, `false`, `null`). No Java code runs yet. |
| **Resolution** | symbolic references in the constant pool (`java/util/List.add:(Ljava/lang/Object;)Z`) are turned into direct references. HotSpot does this **lazily**, the first time each instruction executes. |

### 3. Initialisation

The JVM runs the class's **`<clinit>`** method: static field initialisers and `static { }` blocks, in source order. The superclass is initialised first. Initialisation happens **exactly once**, on the **first active use**:
- `new C()`;
- calling a static method of `C`;
- reading or writing a static field of `C` that is *not* a compile-time constant;
- `Class.forName("C")`, which initialises by default;
- reflection that creates instances or calls static methods;
- initialising a subclass (which initialises the superclass first);
- being the main class.

**Not** active uses, so they don't initialise `C`:
- reading a **compile-time constant** (`static final int MAX = 10`, `static final String NAME = "x"`): `javac` copied the value into the caller;
- `C.class`;
- `new C[10]`;
- `Class.forName("C", false, loader)`;
- accessing an inherited static field through a subclass (`Child.parentField` initialises only `Parent`).

Interfaces are initialised only when one of their own non-constant fields is used. Implementing an interface doesn't initialise it, unless it declares default methods.

### The class loader hierarchy (Java 9+)

| Loader | Loads | In Java |
|---|---|---|
| **Bootstrap** | core modules: `java.base`, `java.logging`… | native code; `getClassLoader()` returns `null` |
| **Platform** (formerly "extension") | other Java SE and JDK modules: `java.sql`, `java.net.http`… | `ClassLoader.getPlatformClassLoader()` |
| **Application** (system) | your class path and module path | `ClassLoader.getSystemClassLoader()` |
| **Custom** | anything: plugins, application servers, hot reload, bytecode generators | subclasses of `ClassLoader` |

### Parent delegation

`loadClass(name)` follows a simple algorithm:
1. If this loader already loaded `name`, return it.
2. Otherwise ask the **parent** to load it.
3. Only if the parent can't, call this loader's own `findClass`.

Why delegate? **Consistency and security.** `java.lang.String` always comes from the bootstrap loader, so application code can't replace core classes, and every part of the program agrees on what `String` is.

### Class identity = name + defining loader

At run time a class is identified by its **fully qualified name *and* the loader that defined it**. The same bytes loaded by two different loaders produce two **different, incompatible classes**, each with its own static fields. Casting between them fails with the famous `ClassCastException: com.x.Foo cannot be cast to com.x.Foo`.

That isolation is a feature: application servers, OSGi and plugin systems load each application or plugin in its own loader, so two plugins can use different versions of the same library.

### ClassNotFoundException vs NoClassDefFoundError

| | `ClassNotFoundException` | `NoClassDefFoundError` |
|---|---|---|
| Type | checked **exception** | **error** (`LinkageError`) |
| When | *you* asked for a class by name (`Class.forName`, `loadClass`) and no loader found it | the class was present when your code was **compiled**, but loading it **at run time** failed |
| Typical causes | typo in a name, plugin JAR missing | JAR missing from the runtime class path, version conflicts, or the class's **static initialiser failed earlier** (`Could not initialize class X`) |

## Internal working

- **`ClassLoader.loadClass`** implements delegation (`findLoadedClass` → `parent.loadClass` → `findClass`) under a per-class-name lock (`getClassLoadingLock`), so parallel-capable loaders can load different classes concurrently. Custom loaders should normally override **`findClass`**, not `loadClass`, to keep delegation intact.
- **`defineClass(name, bytes, ...)`** turns bytes into a class. Its **defining loader** becomes part of the class's identity. A loader that only delegated is the *initiating* loader.
- **Unloading**: a class can be unloaded only when its **defining loader** becomes unreachable, together with all its classes and their instances. Classes from the bootstrap, platform and application loaders are never unloaded. Leaks in application servers ("Metaspace grows on every redeploy") happen when something, such as a `ThreadLocal`, a JDBC driver registry or a static cache in a parent loader, keeps an old loader reachable.
- **Initialisation is thread-safe**: the JVM holds an initialisation lock per class, so `<clinit>` runs once even if many threads race to use the class. Other threads wait. That's why the **initialization-on-demand holder idiom** is a correct, lock-free lazy singleton. It's also why two classes whose static initialisers wait for each other on different threads can **deadlock** during class loading.
- **A failed `<clinit>`** throws **`ExceptionInInitializerError`** the first time. The class is then marked erroneous, and every later use throws **`NoClassDefFoundError: Could not initialize class X`**. Since Java 17 the error's cause carries the original exception.
- **The context class loader** (`Thread.getContextClassLoader()`) lets framework code in a parent loader load classes from the application loader below it. JDBC, JNDI and `ServiceLoader` rely on it, because strict parent delegation can't look *down*.
- **The module system (9+)** maps each module to a loader, and the loader delegates by package to the module that owns it. Split packages across modules are forbidden. Code on the class path lives in the application loader's **unnamed module**.
- **Class Data Sharing** (CDS/AppCDS) and Java 24's **AOT class loading & linking** archive classes already loaded and linked, so start-up can skip much of this work.

## Visual representation

```text title="Delegation and the three phases"
  loadClass("com.shop.Order")                         phases for a class
  ----------------------------                        ------------------------------------------
  custom loader      ---- parent? ---->                LOAD     find bytes, create Class object
  application loader ---- parent? ---->                LINK     verify  -> bytecode is type-safe
  platform loader    ---- parent? ---->                         prepare -> statics = 0 / null / false
  bootstrap loader   -> not a core class                        resolve -> symbolic -> direct refs (lazy)
  platform loader    -> not mine                       INIT     <clinit>: static initialisers, once,
  application loader -> found on the class path:                on first active use, superclass first
                        defineClass -> LOAD, LINK

  identity: (name "com.shop.Order", defining loader app)  !=  (name "com.shop.Order", defining loader plugin-1)
```

## Java code example

```java title="ClassLoadingDemo.java" file="ClassLoadingDemo.java"
import java.io.IOException;
import java.io.InputStream;

public class ClassLoadingDemo {
    static class Constants {
        static final int MAX = 10;                  // compile-time constant: inlined by javac
        static final Integer BOXED = 5;             // not a constant expression
        static {
            System.out.println("  <clinit> Constants");
        }
    }

    static class Parent {
        static int parentField = 1;
        static {
            System.out.println("  <clinit> Parent");
        }
    }

    static class Child extends Parent {
        static int childField = 2;
        static {
            System.out.println("  <clinit> Child");
        }
    }

    interface Shape {
        int SIDES = announce();                     // not a constant: needs initialisation

        static int announce() {
            System.out.println("  <clinit> Shape");
            return 4;
        }
    }

    static class Square implements Shape {
        static {
            System.out.println("  <clinit> Square");
        }
    }

    static class Lazy {
        static {
            System.out.println("  <clinit> Lazy");
        }
    }

    static class Broken {
        static int value = 1 / Integer.parseInt("0");   // the static initialiser throws
    }

    public static class Counter {                    // loaded twice below, by two loaders
        public static int count;

        public Counter() { }

        public static int increment() {
            return ++count;
        }
    }

    // Loads one chosen class itself (child-first); delegates everything else to the parent.
    static final class IsolatingLoader extends ClassLoader {
        private final String isolated;

        IsolatingLoader(String isolated, ClassLoader parent) {
            super("isolating", parent);
            this.isolated = isolated;
        }

        @Override
        protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
            if (!name.equals(isolated)) {
                return super.loadClass(name, resolve);          // normal parent delegation
            }
            synchronized (getClassLoadingLock(name)) {
                Class<?> loaded = findLoadedClass(name);
                if (loaded == null) {
                    try (InputStream in = getParent().getResourceAsStream(name.replace('.', '/') + ".class")) {
                        byte[] bytes = in.readAllBytes();
                        loaded = defineClass(name, bytes, 0, bytes.length);   // this loader defines it
                    } catch (IOException e) {
                        throw new ClassNotFoundException(name, e);
                    }
                }
                return loaded;
            }
        }
    }

    public static void main(String[] args) throws Exception {
        System.out.println("1. When does <clinit> run?");
        System.out.println("constant MAX = " + Constants.MAX);
        System.out.println("BOXED = " + Constants.BOXED);
        System.out.println("Child.parentField = " + Child.parentField);
        System.out.println("new Child[3] has " + new Child[3].length + " slots; Child.class = " + Child.class.getSimpleName());
        System.out.println("Child.childField = " + Child.childField);
        System.out.println("new Square() -> " + new Square().getClass().getSimpleName());
        System.out.println("Shape.SIDES = " + Shape.SIDES);
        Class.forName(ClassLoadingDemo.class.getName() + "$Lazy", false, ClassLoadingDemo.class.getClassLoader());
        System.out.println("forName(..., initialize = false) done");
        Class.forName(ClassLoadingDemo.class.getName() + "$Lazy");
        System.out.println("forName(...) done");

        System.out.println("2. A failing static initialiser");
        for (int attempt = 1; attempt <= 2; attempt++) {
            try {
                System.out.println(Broken.value);
            } catch (Throwable t) {
                System.out.println("attempt " + attempt + ": " + t.getClass().getSimpleName() + ": " + t.getMessage()
                        + "\n    cause: " + t.getCause());
            }
        }
        try {
            Class.forName("com.example.MissingPlugin");
        } catch (ClassNotFoundException e) {
            System.out.println("ClassNotFoundException: " + e.getMessage());
        }

        System.out.println("3. Same bytes, two loaders, two classes");
        String name = Counter.class.getName();
        ClassLoader app = ClassLoadingDemo.class.getClassLoader();
        Class<?> first = new IsolatingLoader(name, app).loadClass(name);
        Class<?> second = new IsolatingLoader(name, app).loadClass(name);
        System.out.println("same name: " + first.getName().equals(second.getName()) + ", same class: " + (first == second)
                + ", same as Counter.class: " + (first == Counter.class));
        Object a1 = first.getMethod("increment").invoke(null);
        Object a2 = first.getMethod("increment").invoke(null);
        Object b1 = second.getMethod("increment").invoke(null);
        System.out.println("separate statics: first " + a1 + "," + a2 + "  second " + b1 + "  app " + Counter.increment());
        try {
            Counter counter = (Counter) first.getConstructor().newInstance();
            System.out.println(counter);
        } catch (ClassCastException e) {
            System.out.println("ClassCastException: " + e.getMessage().split(" \\(")[0]);
        }
    }
}
```

## Output

```text title="Output" output="ClassLoadingDemo.java"
1. When does <clinit> run?
constant MAX = 10
  <clinit> Constants
BOXED = 5
  <clinit> Parent
Child.parentField = 1
new Child[3] has 3 slots; Child.class = Child
  <clinit> Child
Child.childField = 2
  <clinit> Square
new Square() -> Square
  <clinit> Shape
Shape.SIDES = 4
forName(..., initialize = false) done
  <clinit> Lazy
forName(...) done
2. A failing static initialiser
attempt 1: ExceptionInInitializerError: null
    cause: java.lang.ArithmeticException: / by zero
attempt 2: NoClassDefFoundError: Could not initialize class ClassLoadingDemo$Broken
    cause: java.lang.ExceptionInInitializerError: Exception java.lang.ArithmeticException: / by zero [in thread "main"]
ClassNotFoundException: com.example.MissingPlugin
3. Same bytes, two loaders, two classes
same name: true, same class: false, same as Counter.class: false
separate statics: first 1,2  second 1  app 1
ClassCastException: class ClassLoadingDemo$Counter cannot be cast to class ClassLoadingDemo$Counter
```

- Reading `Constants.MAX` printed no `<clinit>`: the value 10 was compiled into `main`. `BOXED` isn't a compile-time constant, so reading it initialised the class.
- `Child.parentField` initialised only `Parent`. Creating a `Child[]` array and evaluating `Child.class` initialised nothing. `Child.childField` finally initialised `Child`.
- `new Square()` didn't initialise the `Shape` interface; reading `Shape.SIDES` did.
- `forName(name, false, loader)` loaded `Lazy` without initialising it. Plain `forName` initialised it.
- The broken initialiser threw `ExceptionInInitializerError` once, then `NoClassDefFoundError: Could not initialize class …` on the next use.
- Two loaders produced two `Counter` classes with **separate static counters**, and casting between same-named classes failed.

## Real-world application

- **Application servers and plugins**: Tomcat gives each web app its own loader, which is child-first for the web app's JARs. IDEs, Jenkins, Elasticsearch and Minecraft servers load each plugin in a separate loader for isolation and unloading.
- **Frameworks**:
  - **Spring Boot**'s fat JAR launcher uses a custom loader to read nested JARs;
  - **Spring DevTools** restarts apps by throwing away a "restart" loader;
  - **Hibernate**, **Mockito** and **ByteBuddy** generate classes at run time and define them in loaders.
- **ServiceLoader and JDBC drivers** find implementations via `META-INF/services` and the context class loader.
- **Diagnosing**:
  - `NoClassDefFoundError` in production usually means a dependency missing from the runtime image, or an earlier static-initialiser failure. Find the **first** error in the log.
  - `ClassCastException: X cannot be cast to X` means two loaders.
  - `-Xlog:class+load` (or `-verbose:class`) shows which loader loaded what, and from where.
- **Lazy initialisation for free**: the holder idiom (`private static class Holder { static final Service INSTANCE = new Service(); }`) relies on lazy, thread-safe class initialisation.

## Common mistakes

- **Expecting constant fields to trigger initialisation** (or to update without recompiling dependents). `static final` primitives and `String` literals are inlined into callers at compile time.
- **Heavy work or I/O in static initialisers**: one failure makes the class unusable for the life of the JVM (`Could not initialize class`), and the root cause appears only once, early in the logs.
- **Overriding `loadClass` and breaking delegation** for JDK classes. Override `findClass`, or be selective like the example.
- **Leaking class loaders**: threads, `ThreadLocal`s, shutdown hooks, JDBC driver registrations or static caches in shared libraries that reference classes from a redeployed app keep its whole loader (and Metaspace) alive.
- **Using `Class.forName(name)` when you only need the `Class` object**: it runs static initialisers. Use `forName(name, false, loader)`.
- **Confusing the two "not found" problems**: `ClassNotFoundException` comes from your explicit lookup; `NoClassDefFoundError` comes from the JVM linking code that compiled fine.

## Interview questions

**Q1. What are the phases of class loading?**

````reveal title="Answer"
- **Loading**: a class loader finds the bytes and creates the class and its `Class` object.
- **Linking**:
  - **verification** checks the bytecode is structurally valid and type-safe;
  - **preparation** allocates static fields with default values;
  - **resolution** replaces symbolic references with direct ones, lazily in HotSpot.
- **Initialisation**: `<clinit>` runs static initialisers and static blocks in textual order, once, on the first active use, after the superclass is initialised.
````

**Q2. Explain parent delegation and why it exists.**

````reveal title="Answer"
A loader first asks its parent to load a class, recursively up to the bootstrap loader, and loads the class itself only if no ancestor can. This guarantees core classes like `java.lang.String` always come from the bootstrap loader. Applications can't replace them, and all code agrees on one definition. Custom loaders sometimes invert the order (child-first, as in web containers) for their own classes, while still delegating `java.*`.
````

**Q3. `ClassNotFoundException` vs `NoClassDefFoundError`?**

````reveal title="Answer"
`ClassNotFoundException` is a checked exception thrown when code explicitly loads a class by name (`Class.forName`, `ClassLoader.loadClass`) and it can't be found. `NoClassDefFoundError` is a `LinkageError` thrown by the JVM when a class that existed at compile time can't be loaded or initialised at run time: a JAR missing from the runtime class path, a version conflict, or a previous `ExceptionInInitializerError` (message: `Could not initialize class X`).
````

**Q4. When exactly is a class initialised?**

````reveal title="Answer"
On its first active use:
- creating an instance;
- invoking a static method;
- using a static field that isn't a compile-time constant;
- `Class.forName(name)` with initialisation;
- reflective instantiation or static invocation;
- initialising a subclass;
- being the main class.

These don't initialise the class: reading compile-time constants (inlined), `C.class`, creating `C[]` arrays, `forName(name, false, loader)`, and accessing a superclass's static field through a subclass (only the superclass initialises).
````

**Q5. Two classes have the same fully qualified name. Can they be different classes at run time?**

````reveal title="Answer"
Yes. A runtime class is identified by its name **and its defining class loader**. The same bytes defined by two loaders produce two distinct classes with separate static state, and instances of one can't be cast to the other (`ClassCastException: com.x.Foo cannot be cast to com.x.Foo`). Plugin systems and application servers use this for isolation. It's also the source of confusing bugs when a library appears both in a container's loader and in an application's loader.
````

## Hands-on exercise

Build a tiny **plugin host**:

- The host defines nothing about plugins except a shared interface: use `java.util.function.UnaryOperator<String>`, which comes from the bootstrap loader and is therefore visible to every loader.
- `public static class Shouter implements UnaryOperator<String>` counts its instances in a static field.
- Load `Shouter` twice through two separate `IsolatingLoader`s (child-first for that one class name). Call both instances **through the interface**, and show that each loader has its own static counter.
- Drop all references to one plugin and its loader, call `System.gc()` (the program runs with `-XX:+UseSerialGC`), and use a `WeakReference` to the plugin's `Class` object to show the class was **unloaded**.

````hint title="Hint"
Cast the instance to the interface, never to `Shouter`: `(UnaryOperator<String>) loader.loadClass(name).getConstructor().newInstance()`. The class can be unloaded only once nothing references the loader, its classes or their instances. Set both the plugin variable and the loader variable to `null` before the GC.
````

````solution title="Solution"
```java title="PluginHost.java" file="PluginHost.java" run="-XX:+UseSerialGC"
import java.io.IOException;
import java.io.InputStream;
import java.lang.ref.WeakReference;
import java.util.function.UnaryOperator;

public class PluginHost {
    public static class Shouter implements UnaryOperator<String> {
        static int created;

        public Shouter() {
            created++;
        }

        @Override
        public String apply(String text) {
            return text.toUpperCase() + "! (instance #" + created + " in " + getClass().getClassLoader().getName() + ")";
        }
    }

    static final class IsolatingLoader extends ClassLoader {
        private final String isolated;

        IsolatingLoader(String loaderName, String isolated, ClassLoader parent) {
            super(loaderName, parent);
            this.isolated = isolated;
        }

        @Override
        protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
            if (!name.equals(isolated)) {
                return super.loadClass(name, resolve);
            }
            synchronized (getClassLoadingLock(name)) {
                Class<?> loaded = findLoadedClass(name);
                if (loaded == null) {
                    try (InputStream in = getParent().getResourceAsStream(name.replace('.', '/') + ".class")) {
                        byte[] bytes = in.readAllBytes();
                        loaded = defineClass(name, bytes, 0, bytes.length);
                    } catch (IOException e) {
                        throw new ClassNotFoundException(name, e);
                    }
                }
                return loaded;
            }
        }
    }

    @SuppressWarnings("unchecked")
    static UnaryOperator<String> load(ClassLoader loader) throws Exception {
        return (UnaryOperator<String>) loader.loadClass(Shouter.class.getName()).getConstructor().newInstance();
    }

    public static void main(String[] args) throws Exception {
        ClassLoader app = PluginHost.class.getClassLoader();
        String name = Shouter.class.getName();
        IsolatingLoader loaderA = new IsolatingLoader("plugin-a", name, app);
        IsolatingLoader loaderB = new IsolatingLoader("plugin-b", name, app);

        UnaryOperator<String> a1 = load(loaderA);
        UnaryOperator<String> a2 = load(loaderA);
        UnaryOperator<String> b1 = load(loaderB);
        System.out.println(a1.apply("hello"));
        System.out.println(a2.apply("hello"));
        System.out.println(b1.apply("hello"));
        System.out.println("plugin classes are distinct: " + (a1.getClass() != b1.getClass()));

        WeakReference<Class<?>> pluginA = new WeakReference<>(a1.getClass());
        a1 = null;
        a2 = null;
        loaderA = null;                       // nothing references plugin-a any more
        System.gc();
        System.out.println("plugin-a class unloaded: " + (pluginA.get() == null));
        System.out.println("plugin-b still works: " + b1.apply("still here"));
    }
}
```

```text title="Output" output="PluginHost.java"
HELLO! (instance #2 in plugin-a)
HELLO! (instance #2 in plugin-a)
HELLO! (instance #1 in plugin-b)
plugin classes are distinct: true
plugin-a class unloaded: true
plugin-b still works: STILL HERE! (instance #1 in plugin-b)
```

Each loader kept its own `created` counter: plugin-a reached 2 while plugin-b started again at 1. Once plugin-a's loader and objects became unreachable, a full GC unloaded the class and its Metaspace. Applications get **redeploy without restart** this way, and they get Metaspace leaks when one stray reference keeps the old loader alive.
````

## Knowledge check

```quiz
? Which access does NOT initialise class C?
+ Reading static final int MAX = 10 declared in C
- Calling a static method of C
- new C()
> Compile-time constants are inlined into the caller by javac.

? What happens during preparation?
+ Static fields are allocated and set to default values
- Static initialisers run
- Bytecode is compiled to machine code
> Static initialisers run later, during initialisation.

? A static initialiser threw an exception. What does the second use of the class throw?
+ NoClassDefFoundError: Could not initialize class
- ExceptionInInitializerError again
- ClassNotFoundException
> The class is marked erroneous after the first failure.

? With parent delegation, which loader is asked first for java.lang.String?
+ The parent chain up to the bootstrap loader, which loads it
- The application loader, from the class path
- Whichever loader was created last
> Delegation ensures core classes always come from the bootstrap loader.

? Why does `(Foo) obj` fail with "Foo cannot be cast to Foo"?
+ obj's class Foo was defined by a different class loader
- Foo was compiled with a newer javac
- Foo is an interface
> Runtime class identity is name plus defining loader.
```

## Key takeaways

- **Load → link (verify, prepare, resolve) → initialise.** `<clinit>` runs **once**, thread-safely, on the **first active use**. Compile-time constants, `C.class`, arrays and `forName(…, false, …)` don't trigger it.
- **Loaders**: bootstrap (`null`) → platform → application → custom, with **parent delegation** so core classes can't be replaced.
- **Class identity = name + defining loader**, giving isolation (plugins, app servers) and "X cannot be cast to X" bugs. Classes unload only when their loader becomes unreachable.
- `ClassNotFoundException`: your explicit lookup failed. `NoClassDefFoundError`: compiled fine but missing at run time, or a **failed static initialiser** (`Could not initialize class`).
- Keep static initialisers small and safe; override `findClass` rather than `loadClass`; watch for loader leaks.
