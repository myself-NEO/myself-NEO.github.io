## Concept explanation

### What reflection is

**Reflection** lets a program examine and use classes, fields, methods and constructors **at run time**, by name, without knowing them at compile time. Everything starts from a **`Class<?>`** object:

```java
Class<?> a = Account.class;                       // a literal
Class<?> b = account.getClass();                  // from an instance
Class<?> c = Class.forName("com.shop.Account");   // by name (loads and initialises it)
```

From a `Class` you can discover and use everything about the type:

| Want | API |
|---|---|
| name, package, modifiers, superclass, interfaces | `getName`, `getPackageName`, `getModifiers`, `getSuperclass`, `getInterfaces` |
| fields | `getFields()` (public, including inherited), `getDeclaredFields()` (all declared here, including private) |
| methods | `getMethods()`, `getDeclaredMethods()`, `getMethod(name, paramTypes…)` |
| constructors | `getConstructors()`, `getDeclaredConstructor(types…).newInstance(args…)` |
| generics (from declarations) | `field.getGenericType()`, `method.getGenericReturnType()` |
| records, enums, sealed types | `isRecord`, `getRecordComponents`, `isEnum`, `getEnumConstants`, `getPermittedSubclasses` |
| annotations | `getAnnotation(type)`, `isAnnotationPresent` (next lesson) |
| arrays | `java.lang.reflect.Array.newInstance`, `get`, `set` |

Using members:
- `method.invoke(target, args…)`; `field.get(target)`/`set(target, value)`; `constructor.newInstance(args…)`.
- Exceptions thrown by the invoked code arrive wrapped in **`InvocationTargetException`** (`getCause()` has the real one).
- Private members require **`setAccessible(true)`**.

### Strong encapsulation (Java 16+)

`setAccessible(true)` used to open any private member anywhere, including JDK internals. Since **Java 16 (JEP 396) and 17 (JEP 403)**, the module system forbids **deep reflection** into packages a module doesn't **`open`**. Trying to make `String.value` accessible now throws **`InaccessibleObjectException`**. Your own classes on the class path (the unnamed module) remain fully accessible to themselves and to frameworks. A library that needs to reach into the JDK must be fixed, or run with `--add-opens java.base/java.lang=ALL-UNNAMED` as a temporary workaround.

### Costs and alternatives

| Concern | Detail |
|---|---|
| Safety | no compile-time checking: typos and wrong types fail at run time |
| Encapsulation | bypasses `private`, makes refactoring dangerous, and breaks with modules |
| Performance | a reflective call has lookup, access-check, boxing and varargs overhead. Modern JDKs (18+) implement `Method.invoke` with method handles, so cached `Method` objects in hot code get JIT-compiled reasonably well, but they're still slower than direct calls |
| Native images | GraalVM needs reflection configuration up front |

**Alternatives**:
- **`MethodHandle`** (`java.lang.invoke`): access checked once at lookup; can be JIT-compiled like a direct call; used by lambdas and records;
- **`VarHandle`** for fields;
- **code generation** at compile time (annotation processors: MapStruct, Dagger, Lombok);
- **plain interfaces**.

## Internal working

- **`Class` objects** are the JVM's `java.lang.Class` "mirrors" of the internal class metadata (`Klass`) in Metaspace. `getDeclaredMethods()` builds `Method` objects from the class's metadata. The JDK caches them per class (in a soft reference) and returns **copies**, so the arrays you get are yours to modify. **The order of members is unspecified**: sort if you need stability.
- **Access checks**: each `invoke`/`get` checks whether the caller may access the member, unless `setAccessible(true)` succeeded. Since Java 9, `setAccessible` itself consults the module system: it succeeds only if the target package is **open** to the caller's module (code on the class path is open to itself; `java.base`'s internals aren't open to anyone).
- **Implementation of `Method.invoke`**:
  - Older JDKs used a native accessor for the first ~15 calls, then generated a bytecode accessor class ("inflation").
  - JDK 18 (JEP 416) reimplemented core reflection on **method handles**, so it's simpler and JIT-friendly.
- **Generic information** comes from the class file's `Signature` attributes. That's why `getGenericType()` returns `List<String>` even though instances are erased (Generics stage).
- **`MethodHandles.Lookup`** encodes the caller's access rights:
  - `findVirtual`, `findStatic` and `findGetter` check access **once** at lookup;
  - `privateLookupIn(target, lookup)` gives private access only where the module system allows it;
  - a `MethodHandle` stored in a `static final` field is treated as a constant by the JIT and inlined.

## Visual representation

```text title="From a name to a call"
  "com.shop.Account" --Class.forName--> Class<Account> (mirror of metadata in Metaspace)
                                            |
           getDeclaredFields()  getDeclaredMethods()  getDeclaredConstructor(String, long)
                 |                     |                         |
             Field balance          Method deposit(long)      Constructor
             setAccessible(true)    invoke(acct, 500L)         newInstance("ada", 1000L)
             get/set(acct)          -> InvocationTargetException wraps anything deposit throws

  module check (Java 9+, enforced since 16/17):
     setAccessible on your own class (unnamed module)   -> OK
     setAccessible on java.lang.String.value            -> InaccessibleObjectException (java.base doesn't open java.lang)

  MethodHandle: lookup.findVirtual(Account.class, "balance", methodType(long.class))   access checked once, JIT-inlinable
```

## Java code example

```java title="ReflectionDemo.java" file="ReflectionDemo.java"
import java.lang.invoke.MethodHandle;
import java.lang.invoke.MethodHandles;
import java.lang.invoke.MethodType;
import java.lang.reflect.Array;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.InaccessibleObjectException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.lang.reflect.RecordComponent;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

public class ReflectionDemo {
    static class Account {
        public static final String BANK = "Example Bank";
        private final String owner;
        private long balanceCents;
        private List<String> tags = new ArrayList<>();

        public Account(String owner, long balanceCents) {
            this.owner = owner;
            this.balanceCents = balanceCents;
        }

        public void deposit(long cents) {
            if (cents <= 0) {
                throw new IllegalArgumentException("deposit must be positive");
            }
            balanceCents += cents;
        }

        public long balance() {
            return balanceCents;
        }

        private String secret() {
            return "pin for " + owner;
        }
    }

    record Point(int x, int y) { }

    public static void main(String[] args) throws Throwable {
        // 1. Getting Class objects
        Class<?> byName = Class.forName("java.util.ArrayList");
        System.out.println("forName: " + byName.getSimpleName() + ", superclass " + byName.getSuperclass().getSimpleName()
                + ", array class name " + String[].class.getName() + ", primitive " + int.class);

        // 2. Inspecting members (sorted: reflection order is unspecified)
        Class<Account> type = Account.class;
        Arrays.stream(type.getDeclaredFields())
                .sorted(Comparator.comparing(Field::getName))
                .forEach(f -> System.out.println("  field  " + Modifier.toString(f.getModifiers()) + " " + f.getGenericType().getTypeName() + " " + f.getName()));
        Arrays.stream(type.getDeclaredMethods())
                .sorted(Comparator.comparing(Method::getName))
                .forEach(m -> System.out.println("  method " + Modifier.toString(m.getModifiers()) + " " + m.getName() + Arrays.toString(m.getParameterTypes())));

        // 3. Creating and invoking
        Constructor<Account> ctor = type.getConstructor(String.class, long.class);
        Account acct = ctor.newInstance("ada", 1_000L);
        Method deposit = type.getMethod("deposit", long.class);
        deposit.invoke(acct, 500L);
        System.out.println("after reflective deposit: " + type.getMethod("balance").invoke(acct));
        try {
            deposit.invoke(acct, -1L);
        } catch (InvocationTargetException e) {
            System.out.println("InvocationTargetException wraps: " + e.getCause());
        }

        // 4. Private members on your own classes: setAccessible works
        Method secret = type.getDeclaredMethod("secret");
        secret.setAccessible(true);
        Field balance = type.getDeclaredField("balanceCents");
        balance.setAccessible(true);
        balance.setLong(acct, 42L);
        System.out.println("private method: " + secret.invoke(acct) + ", private field forced to " + acct.balance());

        // 5. Strong encapsulation: the JDK's internals are closed (Java 16+)
        try {
            String.class.getDeclaredField("value").setAccessible(true);
        } catch (InaccessibleObjectException e) {
            System.out.println("InaccessibleObjectException: " + e.getMessage().replaceAll(" @[0-9a-f]+", ""));
        }

        // 6. Records, arrays
        for (RecordComponent rc : Point.class.getRecordComponents()) {
            System.out.println("record component " + rc.getType() + " " + rc.getName() + " = " + rc.getAccessor().invoke(new Point(3, 4)));
        }
        Object ints = Array.newInstance(int.class, 3);
        Array.setInt(ints, 2, 99);
        System.out.println("Array.newInstance: " + Arrays.toString((int[]) ints));

        // 7. MethodHandles: access checked once, then a JIT-friendly call
        MethodHandles.Lookup lookup = MethodHandles.lookup();
        MethodHandle balanceHandle = lookup.findVirtual(Account.class, "balance", MethodType.methodType(long.class));
        long viaHandle = (long) balanceHandle.invokeExact(acct);
        MethodHandle secretHandle = MethodHandles.privateLookupIn(Account.class, lookup)
                .findVirtual(Account.class, "secret", MethodType.methodType(String.class));
        System.out.println("MethodHandle balance " + viaHandle + ", private via privateLookupIn: " + (String) secretHandle.invokeExact(acct));
    }
}
```

## Output

```text title="Output" output="ReflectionDemo.java"
forName: ArrayList, superclass AbstractList, array class name [Ljava.lang.String;, primitive int
  field  public static final java.lang.String BANK
  field  private long balanceCents
  field  private final java.lang.String owner
  field  private java.util.List<java.lang.String> tags
  method public balance[]
  method public deposit[long]
  method private secret[]
after reflective deposit: 1500
InvocationTargetException wraps: java.lang.IllegalArgumentException: deposit must be positive
private method: pin for ada, private field forced to 42
InaccessibleObjectException: Unable to make field private final byte[] java.lang.String.value accessible: module java.base does not "opens java.lang" to unnamed module
record component int x = 3
record component int y = 4
Array.newInstance: [0, 0, 99]
MethodHandle balance 42, private via privateLookupIn: pin for ada
```

- `getDeclaredFields`/`getDeclaredMethods` listed everything declared in `Account`, private members included. `getGenericType` showed `List<String>`: declarations keep their generic signatures.
- The constructor, `deposit` and `balance` ran by name. The exception thrown by `deposit` arrived wrapped in `InvocationTargetException`.
- `setAccessible(true)` opened `secret()` and the private `balanceCents` of **our own** class. The same call on `String.value` failed: `java.base` doesn't open `java.lang`, so JDK internals are off limits since Java 16/17.
- Record components and arrays are reflectable too.
- Method handles did the same calls with access checked once at lookup. `privateLookupIn` reached the private method because our own class is open to us.

## Real-world application

- **Frameworks are built on it**:
  - Spring (dependency injection, `@Autowired` fields, bean properties, `@RequestMapping` handler methods);
  - Hibernate/JPA (entity fields);
  - Jackson (JSON ↔ object properties);
  - JUnit (discovering `@Test` methods);
  - Mockito (with ByteBuddy-generated subclasses).
- **Plugin systems**: load a class by name from configuration (`Class.forName(className).getDeclaredConstructor().newInstance()`), usually behind an interface.
- **Tooling**: debuggers, serializers, ORMs, test utilities (`ReflectionTestUtils` for private fields, used sparingly), dependency analysis.
- **Migration issues**: upgrading to Java 17 breaks old libraries that reflected into JDK internals (`InaccessibleObjectException`). Upgrade them, or temporarily use `--add-opens`.
- **Performance-sensitive frameworks** move from reflection to method handles, generated bytecode (ByteBuddy, LambdaMetafactory) or compile-time code generation (Micronaut, Quarkus, MapStruct) for speed and GraalVM native image support.

## Common mistakes

- **Using reflection when an interface or lambda would do**: you lose type safety, IDE refactoring support and performance.
- **Relying on the order of `getDeclaredMethods()`/`getDeclaredFields()`.** It's unspecified.
- **Looking members up repeatedly in hot loops** instead of caching the `Method`/`MethodHandle`.
- **Swallowing `InvocationTargetException`** without unwrapping `getCause()`, which hides the real error.
- **`setAccessible(true)` into JDK or library internals**, which breaks on upgrades (`InaccessibleObjectException`) and violates encapsulation.
- **Modifying `final` fields reflectively**: it may "work" yet be invisible to optimised code, and it's being restricted (JEP 500 warns about it).
- **`Class.forName` with user-controlled names**: arbitrary class loading and initialisation is a security risk.

## Interview questions

**Q1. What is reflection, and what are its drawbacks?**

````reveal title="Answer"
Runtime inspection and use of types and members through `Class`, `Field`, `Method` and `Constructor`: listing members, invoking methods, reading and writing fields, creating instances, reading annotations and generic signatures. Drawbacks:
- no compile-time type safety, so errors surface at run time;
- it breaks encapsulation, which makes refactoring risky;
- overhead (lookup, access checks, boxing);
- restrictions from the module system (strong encapsulation);
- it complicates AOT compilation (GraalVM native image) and obscures code flow.

Prefer interfaces, lambdas and method handles where possible.
````

**Q2. `getMethods()` vs `getDeclaredMethods()`?**

````reveal title="Answer"
`getMethods()` returns all **public** methods, including inherited ones (from superclasses and interfaces). `getDeclaredMethods()` returns all methods **declared in this class** (any access level, private included) but no inherited ones. The same distinction applies to fields and constructors. Neither guarantees an order.
````

**Q3. What is `InvocationTargetException`?**

````reveal title="Answer"
A checked exception thrown by `Method.invoke` (and `Constructor.newInstance`) when the invoked method itself throws. The original exception is its cause (`getCause()`/`getTargetException()`). It distinguishes "the call couldn't be made" (`IllegalAccessException`, `IllegalArgumentException`) from "the call was made and the method failed". Always unwrap it when logging or rethrowing.
````

**Q4. Why does `setAccessible(true)` fail on JDK classes in Java 17?**

````reveal title="Answer"
Java 9 introduced modules, and Java 16/17 (JEPs 396 and 403) turned on strong encapsulation by default: deep reflection into a package is allowed only if its module **opens** that package to the caller. `java.base` doesn't open internals like `java.lang` (for `String.value`), so `setAccessible` throws `InaccessibleObjectException`. Your own class-path code is unaffected. Fix it by using public APIs or upgrading the library; `--add-opens module/package=target` is a temporary escape hatch.
````

**Q5. What is a `MethodHandle`, and how does it differ from `Method`?**

````reveal title="Answer"
A typed, directly executable reference to a method, constructor or field (`java.lang.invoke`). Access is checked when the handle is created by a `Lookup` (which carries the caller's rights), not on every call. Handles can be adapted (bound, curried, filtered), and calls via `invokeExact` with constant handles are JIT-compiled and inlined almost like direct calls. Lambdas, string concatenation and records' generated methods are built on them, and since JDK 18 core reflection itself is implemented with method handles.
````

## Hands-on exercise

Write a reflective **property binder** that fills a configuration object from a `Map<String, String>`:
- `static <T> T bind(Class<T> type, Map<String, String> props)` creates an instance with the public no-arg constructor;
- for each entry, find the **declared field** with that name, make it accessible, and convert the string to the field's type: `String`, `int`/`Integer`, `long`, `boolean`, or any **enum** (`Enum.valueOf`);
- unknown keys throw `IllegalArgumentException("unknown property: x")`, and fields not mentioned keep their defaults.

Bind `ServerConfig { String host = "localhost"; int port = 8080; boolean tls; Mode mode = Mode.DEV; long timeoutMs = 1000; }` from `{port=9443, tls=true, mode=PROD}`, then show the error for `{prot=1}`.

````hint title="Hint"
`Field f = type.getDeclaredField(key)` (catch `NoSuchFieldException`). Branch on `Class<?> t = f.getType()`: `t == int.class || t == Integer.class` → `Integer.parseInt`, `t.isEnum()` → use a small generic helper `<E extends Enum<E>> E enumValue(Class<?> t, String v)` with an unchecked cast, `t == boolean.class` → `Boolean.parseBoolean`. Iterate the map in sorted order for deterministic behaviour.
````

````solution title="Solution"
```java title="PropertyBinder.java" file="PropertyBinder.java"
import java.lang.reflect.Field;
import java.util.Map;
import java.util.TreeMap;

public class PropertyBinder {
    enum Mode { DEV, PROD }

    public static class ServerConfig {
        String host = "localhost";
        int port = 8080;
        boolean tls;
        Mode mode = Mode.DEV;
        long timeoutMs = 1_000;

        public ServerConfig() { }

        @Override
        public String toString() {
            return "ServerConfig[host=" + host + ", port=" + port + ", tls=" + tls + ", mode=" + mode + ", timeoutMs=" + timeoutMs + "]";
        }
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    static Object convert(Class<?> t, String value) {
        if (t == String.class) {
            return value;
        } else if (t == int.class || t == Integer.class) {
            return Integer.parseInt(value);
        } else if (t == long.class || t == Long.class) {
            return Long.parseLong(value);
        } else if (t == boolean.class || t == Boolean.class) {
            return Boolean.parseBoolean(value);
        } else if (t.isEnum()) {
            return Enum.valueOf((Class) t, value);
        }
        throw new IllegalArgumentException("unsupported type " + t.getSimpleName());
    }

    static <T> T bind(Class<T> type, Map<String, String> props) throws ReflectiveOperationException {
        T target = type.getDeclaredConstructor().newInstance();
        for (Map.Entry<String, String> e : new TreeMap<>(props).entrySet()) {   // deterministic order
            Field field;
            try {
                field = type.getDeclaredField(e.getKey());
            } catch (NoSuchFieldException ex) {
                throw new IllegalArgumentException("unknown property: " + e.getKey());
            }
            field.setAccessible(true);
            field.set(target, convert(field.getType(), e.getValue()));
        }
        return target;
    }

    public static void main(String[] args) throws ReflectiveOperationException {
        System.out.println(bind(ServerConfig.class, Map.of("port", "9443", "tls", "true", "mode", "PROD")));
        try {
            bind(ServerConfig.class, Map.of("prot", "1"));
        } catch (IllegalArgumentException e) {
            System.out.println("error: " + e.getMessage());
        }
    }
}
```

```text title="Output" output="PropertyBinder.java"
ServerConfig[host=localhost, port=9443, tls=true, mode=PROD, timeoutMs=1000]
error: unknown property: prot
```

This is the core of what Spring's `@ConfigurationProperties` and many configuration libraries do: match keys to members, convert the strings to the member types, and set the values reflectively. They add relaxed names (`server-port`), nested objects, validation and better error messages on top.
````

## Knowledge check

```quiz
? Which method returns private methods declared in a class?
+ getDeclaredMethods()
- getMethods()
- getPublicMethods()
> getMethods() returns public methods, including inherited ones.

? Method.invoke calls a method that throws IllegalStateException. What does invoke throw?
+ InvocationTargetException, with the IllegalStateException as its cause
- IllegalStateException directly
- IllegalAccessException
> Unwrap it with getCause().

? Why does String.class.getDeclaredField("value").setAccessible(true) fail on Java 17?
+ java.base doesn't open java.lang for deep reflection (strong encapsulation)
- Strings are immutable
- The field doesn't exist
> InaccessibleObjectException since Java 16/17.

? Is the order of getDeclaredFields() guaranteed?
+ No, it's unspecified
- Yes, declaration order
- Yes, alphabetical
> Sort if your code depends on order.

? What is an advantage of MethodHandle over Method?
+ Access is checked once at lookup, and calls can be JIT-optimised like direct calls
- It can bypass module encapsulation
- It doesn't need a target object for instance methods
> Lambdas and records are built on method handles.
```

## Key takeaways

- Reflection starts from `Class` (`.class`, `getClass()`, `Class.forName`): inspect and use **fields, methods, constructors, generics, records, annotations** at run time.
- `getXxx()` = public, including inherited; `getDeclaredXxx()` = everything declared here. **Order is unspecified.** `invoke` wraps thrown exceptions in **`InvocationTargetException`**.
- `setAccessible(true)` works on your own code but **not on JDK internals** since Java 16/17 (`InaccessibleObjectException`, `--add-opens` as an escape hatch).
- It's powerful for frameworks (DI, ORM, JSON, testing) but unsafe and slower for application logic. Prefer interfaces, **method handles** or compile-time code generation.
- Cache lookups, unwrap exceptions, and never reflect on untrusted class names.
