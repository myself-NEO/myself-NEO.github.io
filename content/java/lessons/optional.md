## Concept explanation

### The problem: "maybe there's a value"

A lookup can fail. Returning `null` makes that possibility invisible in the signature:

```java
Customer findById(String id);                 // may return null? The type doesn't say.
String city = findById(id).getAddress().getCity();   // NullPointerException waiting to happen
```

**`Optional<T>`** (Java 8) is a container that holds **either one non-null value or nothing**. Putting it in a return type makes absence part of the API contract, and its methods let callers handle both cases without `if (x != null)` chains:

```java
Optional<Customer> findById(String id);
String city = findById(id).flatMap(Customer::address).map(Address::city).orElse("unknown");
```

### What Optional is for

According to its designers, `Optional` is intended as a **method return type** where "no result" is a normal outcome. It is **not** a general replacement for `null` everywhere: not for fields, parameters, or collection elements.

### Creating

| Method | Behaviour |
|---|---|
| `Optional.of(value)` | value must be non-null, or `NullPointerException` |
| `Optional.ofNullable(value)` | empty if `value` is null |
| `Optional.empty()` | the empty optional |

### Using the value

| Method | Purpose | Notes |
|---|---|---|
| `map(f)` | transform the value if present | **if `f` returns null, the result is empty** |
| `flatMap(f)` | `f` itself returns an `Optional`; avoids `Optional<Optional<T>>` | `f` must not return null |
| `filter(p)` | keep the value only if it matches | |
| `or(() -> otherOptional)` (9) | fall back to another `Optional` | lazy |
| `orElse(value)` | the value or a default | **the default is always evaluated** |
| `orElseGet(() -> value)` | the value or a lazily computed default | use for anything costly |
| `orElseThrow()` (10) / `orElseThrow(() -> ex)` | the value or an exception | `orElseThrow()` is the honest name for `get()` |
| `ifPresent(consumer)` / `ifPresentOrElse(c, runnable)` (9) | side effects | |
| `isPresent()` / `isEmpty()` (11) | tests | usually a sign you could use `map`/`orElse` instead |
| `stream()` (9) | 0- or 1-element stream | `flatMap(Optional::stream)` drops empties |
| `get()` | the value or `NoSuchElementException` | avoid: it's `orElseThrow()` with a misleading name |

Primitive variants `OptionalInt`, `OptionalLong` and `OptionalDouble` (`getAsInt`, `orElse(int)`) are returned by `IntStream.max()`, `average()` and similar. They lack `map`/`filter`.

### Anti-patterns

| Don't | Why | Instead |
|---|---|---|
| `Optional` **fields** | adds an object per field; not `Serializable`; awkward for JPA and Jackson | a nullable field plus a getter that returns `Optional.ofNullable(field)` |
| `Optional` **parameters** | callers must wrap arguments and can still pass `null` | overloads, or a documented nullable parameter |
| `Optional<List<T>>`, `List<Optional<T>>` | two ways to say "nothing" | return an **empty collection** |
| `return null;` from an `Optional` method | defeats the purpose and causes NPEs downstream | `return Optional.empty();` |
| `if (opt.isPresent()) { x = opt.get(); }` | a verbose null check | `map`, `orElse`, `ifPresent` |
| `opt.get()` without checking | `NoSuchElementException` | `orElseThrow(() -> new NotFound(...))` |
| `orElse(loadDefault())` | `loadDefault()` runs even when a value exists | `orElseGet(this::loadDefault)` |
| `Optional.of(possiblyNull)` | throws on null | `ofNullable` |
| `==`, `synchronized` or identity hash on `Optional` | it's a **value-based class**; identity is meaningless | `equals` |

## Internal working

- `Optional` is a `final` class with a single field, `private final T value`. Empty is represented by `value == null`, and a shared `EMPTY` singleton is returned by `empty()`. `isPresent()` is just `value != null`.
- **`map`** is implemented as `isPresent() ? Optional.ofNullable(mapper.apply(value)) : empty()`. A mapper returning `null` therefore produces an empty `Optional` rather than an exception, which is convenient for navigating nullable getters.
- **`flatMap`** returns the mapper's `Optional` as is, after `Objects.requireNonNull`. A mapper returning `null` throws `NullPointerException`.
- **`orElse(T other)`** is an ordinary method call: Java evaluates arguments before calling, so `other` is computed whether or not it's needed. `orElseGet(Supplier)` calls the supplier only when empty.
- **Cost**: each non-empty `Optional` is one small heap object (about 16 bytes). For a return value that's used immediately, the JIT's escape analysis can often remove the allocation entirely. Stored in fields or large collections, the cost becomes real, which is part of why fields are discouraged.
- **Value-based class**: the JDK may cache or reuse instances (`empty()` is a singleton). Since Java 16, `javac` warns when you `synchronized` on such classes. Project Valhalla aims to make it a true value class without identity.
- **Not `Serializable`**, deliberately, to discourage use in fields and DTOs.

## Visual representation

```text title="An Optional chain: each step works only on the present value"
  findById("c2")         flatMap(Customer::address)    map(Address::city)     orElse("unknown city")
  Optional[Linus] ---->  Optional.empty  ---------->   Optional.empty  ---->  "unknown city"
                         (Linus has no address)        (skipped)

  findById("c1")         flatMap(Customer::address)    map(Address::city)     orElse(...)
  Optional[Ada]   ---->  Optional[Address(London)] ->  Optional["London"] --> "London"

  findById("c4")  -> Optional.empty -> every step skipped -> default

  orElse(compute())         compute() runs ALWAYS (argument evaluated before the call)
  orElseGet(() -> compute()) compute() runs only if empty
```

## Java code example

```java title="OptionalDemo.java" file="OptionalDemo.java"
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.OptionalInt;
import java.util.stream.IntStream;
import java.util.stream.Stream;

public class OptionalDemo {
    record Address(String city, String postcode) { }

    // Fields stay nullable; accessors that may be absent return Optional
    record Customer(String id, String name, Address rawAddress, String referrerId) {
        Optional<Address> address() {
            return Optional.ofNullable(rawAddress);
        }

        Optional<String> referrer() {
            return Optional.ofNullable(referrerId);
        }
    }

    static final Map<String, Customer> DB = Map.of(
            "c1", new Customer("c1", "Ada", new Address("London", "N1"), null),
            "c2", new Customer("c2", "Linus", null, "c1"),
            "c3", new Customer("c3", "Grace", new Address("Arlington", null), "c9"));

    static Optional<Customer> findById(String id) {        // a lookup: absence is normal
        return Optional.ofNullable(DB.get(id));
    }

    public static void main(String[] args) {
        // Creating
        System.out.println(Optional.of("x") + " " + Optional.ofNullable(null) + " isEmpty=" + Optional.empty().isEmpty());
        try {
            Optional.of(null);
        } catch (NullPointerException e) {
            System.out.println("Optional.of(null) -> NullPointerException");
        }

        // map / flatMap / orElse: no null checks
        for (String id : List.of("c1", "c2", "c3", "c4")) {
            String city = findById(id).flatMap(Customer::address).map(Address::city).orElse("unknown city");
            String postcode = findById(id).map(Customer::rawAddress).map(Address::postcode).orElse("-");
            System.out.println(id + ": " + city + ", postcode " + postcode);
        }

        // filter, and flatMap across two lookups
        System.out.println("c1 lives in London: " + findById("c1").flatMap(Customer::address).filter(a -> a.city().equals("London")).isPresent());
        for (String id : List.of("c2", "c3", "c1")) {
            String referrer = findById(id).flatMap(Customer::referrer).flatMap(OptionalDemo::findById).map(Customer::name).orElse("nobody");
            System.out.println(id + " was referred by " + referrer);
        }

        // orElse is eager, orElseGet is lazy
        String eager = findById("c1").map(Customer::name).orElse(fallback("orElse"));
        String lazy = findById("c1").map(Customer::name).orElseGet(() -> fallback("orElseGet"));
        System.out.println("results: " + eager + ", " + lazy);

        // Failing loudly
        try {
            findById("c4").orElseThrow(() -> new IllegalArgumentException("customer c4 not found"));
        } catch (IllegalArgumentException e) {
            System.out.println("orElseThrow: " + e.getMessage());
        }
        try {
            findById("c4").get();
        } catch (NoSuchElementException e) {
            System.out.println("get(): " + e.getMessage());
        }

        // Side effects, fallbacks and streams
        findById("c2").ifPresent(c -> System.out.println("ifPresent: " + c.name()));
        findById("c4").ifPresentOrElse(c -> System.out.println(c.name()), () -> System.out.println("ifPresentOrElse: c4 missing"));
        System.out.println("or(): " + findById("c4").or(() -> findById("c1")).map(Customer::name).orElseThrow());
        List<String> found = Stream.of("c1", "c4", "c3").map(OptionalDemo::findById).flatMap(Optional::stream).map(Customer::name).toList();
        System.out.println("flatMap(Optional::stream): " + found);

        // map treats a null result as empty; flatMap does not accept null
        System.out.println("map to null: " + Optional.of("x").map(s -> null));
        try {
            Optional.of("x").flatMap(s -> null);
        } catch (NullPointerException e) {
            System.out.println("flatMap to null -> NullPointerException");
        }

        // Primitive optionals
        OptionalInt none = IntStream.empty().max();
        System.out.println("OptionalInt: " + none + ", " + IntStream.of(3, 9).max().getAsInt() + ", orElse " + none.orElse(-1));

        // Value semantics: compare with equals, never ==
        System.out.println("equals: " + Optional.of("a").equals(Optional.of("a")));
    }

    static String fallback(String caller) {
        System.out.println("  (" + caller + " computed a fallback)");
        return "fallback";
    }
}
```

## Output

```text title="Output" output="OptionalDemo.java"
Optional[x] Optional.empty isEmpty=true
Optional.of(null) -> NullPointerException
c1: London, postcode N1
c2: unknown city, postcode -
c3: Arlington, postcode -
c4: unknown city, postcode -
c1 lives in London: true
c2 was referred by Ada
c3 was referred by nobody
c1 was referred by nobody
  (orElse computed a fallback)
results: Ada, Ada
orElseThrow: customer c4 not found
get(): No value present
ifPresent: Linus
ifPresentOrElse: c4 missing
or(): Ada
flatMap(Optional::stream): [Ada, Grace]
map to null: Optional.empty
flatMap to null -> NullPointerException
OptionalInt: OptionalInt.empty, 9, orElse -1
equals: true
```

- Linus (`c2`) has no address and `c4` doesn't exist. Both fell through to the default without a single `null` check.
- For Grace, `map(Address::postcode)` returned `null`, which `map` turned into an empty `Optional`, so the result was `-`.
- The referral chain chained two lookups with `flatMap`. `c3`'s referrer `c9` doesn't exist, so the chain ended empty.
- `orElse(fallback(...))` computed the fallback even though Ada was found; `orElseGet` didn't.
- `get()` on an empty `Optional` fails with the unhelpful "No value present". `orElseThrow(...)` says what was missing.

## Real-world application

- **Repository lookups**: Spring Data's `findById` returns `Optional<T>`. Service code does `repo.findById(id).orElseThrow(() -> new NotFoundException(id))`, and a REST layer maps that to 404.
- **Configuration**: `Optional.ofNullable(System.getenv("PORT")).map(Integer::parseInt).orElse(8080)`.
- **Navigating optional data**: `user.manager().flatMap(Employee::email).ifPresent(mailer::notify)`.
- **Stream results**: `findFirst`, `max` and `reduce` return `Optional`. Combine them with `orElse` or `orElseThrow`.
- **Filtering out missing values**: `ids.stream().map(cache::lookup).flatMap(Optional::stream)`.

## Common mistakes

- **`orElse(expensiveCall())`**: the call always runs, including database queries and object creation. Use `orElseGet`.
- **`Optional.of(x)` when `x` can be null**: use `ofNullable`.
- **Calling `get()`**, or `isPresent()` followed by `get()`.
- **Returning `null` from a method declared to return `Optional`.**
- **Optional fields, parameters and collections** (see the anti-pattern table). Jackson and JPA need extra configuration or don't support them.
- **`Optional<Boolean>` / `Optional<Integer>` for primitives in hot code**: use `OptionalInt` or a sentinel, or reconsider the design.
- **Wrapping everything**: if a value can never be absent, `Optional` only adds noise.

## Interview questions

**Q1. What problem does `Optional` solve, and where should you use it?**

````reveal title="Answer"
It makes "there may be no result" explicit in a method's return type and gives a fluent API (`map`, `flatMap`, `filter`, `orElse`, `orElseThrow`) for handling it, instead of undocumented `null` returns and scattered null checks. Use it mainly for return types of lookups and queries. Avoid it for fields, method parameters, collections (return empty ones) and serialised DTOs.
````

**Q2. What's the difference between `orElse` and `orElseGet`?**

````reveal title="Answer"
`orElse(T)` receives an already evaluated value: its argument expression runs whether or not the `Optional` is empty. `orElseGet(Supplier<T>)` calls the supplier only when empty. With `orElse(createDefault())`, `createDefault()` always runs, which is wasteful or harmful if it queries a database, has side effects, or allocates. Use `orElse` for constants and `orElseGet` for computed defaults.
````

**Q3. `map` vs `flatMap` on `Optional`?**

````reveal title="Answer"
`map(f)` applies `f` to the value and wraps the result with `ofNullable`, so a null result becomes empty. If `f` already returns an `Optional`, `map` gives you `Optional<Optional<T>>`. `flatMap(f)` expects `f` to return an `Optional` and returns it directly, flattening one level. A null result from `f` throws `NullPointerException`. Chain `flatMap` for Optional-returning getters and lookups.
````

**Q4. Why shouldn't `Optional` be used as a field or parameter type?**

````reveal title="Answer"
- **Fields**: it adds an object per field, isn't `Serializable`, and doesn't work well with JPA and other frameworks; a nullable field with an `Optional` getter gives callers the same safety.
- **Parameters**: they force callers to wrap arguments (`foo(Optional.empty())`), still allow `null` to be passed, and are better expressed with overloads.

The JDK designers intended `Optional` primarily for return types.
````

**Q5. What does `Optional.of("x").map(s -> null)` return?**

````reveal title="Answer"
`Optional.empty`. `map` wraps the mapper's result with `Optional.ofNullable`, so a `null` result means "absent" rather than an exception. In contrast, `Optional.of("x").flatMap(s -> null)` throws `NullPointerException`, because `flatMap` requires the mapper to return a non-null `Optional`.
````

## Hands-on exercise

Build a configuration resolver with three layers: command-line values, environment variables and defaults. Write:

- `Optional<String> raw(String key)`: look in the CLI map (`server.port`), then the env map (`SERVER_PORT`: upper-case with `.` → `_`), then the defaults, using `Optional.or`.
- `static Optional<Integer> parseInt(String)`: empty on `NumberFormatException`.
- `int port(String key)`: `raw → flatMap(parseInt) → filter(1..65535) → orElseThrow` with a message that includes the raw value or `<missing>`.

Resolve `server.port`, `admin.port`, `metrics.port` (env has `abc`), `debug.port` (default is 99999) and `missing.port`.

````hint title="Hint"
`Optional.ofNullable(cli.get(key)).or(() -> Optional.ofNullable(env.get(envName(key)))).or(() -> Optional.ofNullable(defaults.get(key)))`. Note that `or` falls back only when a layer is *missing*. An invalid value in a higher layer is still chosen, and it then fails validation. That's usually what you want, because a broken override should be loud.
````

````solution title="Solution"
```java title="ConfigResolver.java" file="ConfigResolver.java"
import java.util.List;
import java.util.Map;
import java.util.Optional;

public class ConfigResolver {
    private final Map<String, String> cli;
    private final Map<String, String> env;
    private final Map<String, String> defaults;

    ConfigResolver(Map<String, String> cli, Map<String, String> env, Map<String, String> defaults) {
        this.cli = cli;
        this.env = env;
        this.defaults = defaults;
    }

    static String envName(String key) {
        return key.toUpperCase().replace('.', '_');
    }

    Optional<String> raw(String key) {
        return Optional.ofNullable(cli.get(key))
                .or(() -> Optional.ofNullable(env.get(envName(key))))
                .or(() -> Optional.ofNullable(defaults.get(key)));
    }

    static Optional<Integer> parseInt(String text) {
        try {
            return Optional.of(Integer.parseInt(text.trim()));
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }

    int port(String key) {
        return raw(key)
                .flatMap(ConfigResolver::parseInt)
                .filter(p -> p >= 1 && p <= 65_535)
                .orElseThrow(() -> new IllegalStateException(
                        "no valid port for " + key + " (raw value: " + raw(key).orElse("<missing>") + ")"));
    }

    public static void main(String[] args) {
        ConfigResolver config = new ConfigResolver(
                Map.of("server.port", "9090"),
                Map.of("ADMIN_PORT", "7000", "METRICS_PORT", "abc"),
                Map.of("server.port", "8080", "admin.port", "8081", "debug.port", "99999"));

        for (String key : List.of("server.port", "admin.port", "metrics.port", "debug.port", "missing.port")) {
            try {
                System.out.println(key + " = " + config.port(key));
            } catch (IllegalStateException e) {
                System.out.println(key + " -> " + e.getMessage());
            }
        }
    }
}
```

```text title="Output" output="ConfigResolver.java"
server.port = 9090
admin.port = 7000
metrics.port -> no valid port for metrics.port (raw value: abc)
debug.port -> no valid port for debug.port (raw value: 99999)
missing.port -> no valid port for missing.port (raw value: <missing>)
```

Each failure mode produced a precise message: unparsable (`abc`), out of range (`99999`), and absent. None of this needed a single `null` check or nested `if`.
````

## Knowledge check

```quiz
? Which method should a repository lookup use to wrap a result that may be null?
+ Optional.ofNullable(value)
- Optional.of(value)
- new Optional<>(value)
> Optional.of throws NullPointerException on null, and the constructor is private.

? `opt.orElse(load())` where opt has a value. Does load() run?
+ Yes, arguments are evaluated before the call
- No, orElse is lazy
- Only on the first call
> Use orElseGet(() -> load()) for laziness.

? What does Optional.of("x").map(s -> null) return?
+ Optional.empty
- Optional[null]
- It throws NullPointerException
> map wraps the result with ofNullable.

? Which is an Optional anti-pattern?
+ A field declared as Optional<String> in an entity class
- Returning Optional<User> from findByEmail
- Calling orElseThrow with a custom exception
> Keep fields nullable; return Optional from accessors when absence is meaningful.

? You have Optional<Customer> and Customer::address returns Optional<Address>. Which call gives Optional<Address>?
+ flatMap(Customer::address)
- map(Customer::address)
- filter(Customer::address)
> map would produce Optional<Optional<Address>>.
```

## Key takeaways

- `Optional<T>` holds **one non-null value or nothing**. Use it as a **return type** where absence is normal.
- Chain **`map` / `flatMap` / `filter`** and finish with **`orElse` / `orElseGet` / `orElseThrow`**; `or` (Java 9) chains fallbacks.
- **`orElse` is eager, `orElseGet` is lazy.** `map` turns a null result into empty; `flatMap` requires an `Optional`.
- Avoid `get()`, `Optional.of(nullable)`, returning `null`, and Optional **fields, parameters and collections**.
- It's a value-based, non-serialisable wrapper: compare with `equals`, and use `OptionalInt` & co. for primitives.
