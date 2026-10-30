## Concept explanation

### Why a standard catalogue?

You *could* declare your own functional interface for every lambda (`interface PriceRule { boolean applies(Product p); }`), but then nothing composes: a `PriceRule` isn't accepted by a method that wants a "product test". Java 8 added the **`java.util.function`** package: 43 general-purpose functional interfaces shared by the JDK (streams, `Optional`, `Map.computeIfAbsent`, `CompletableFuture`) and by your own APIs.

### The core seven

| Interface | Method | Shape | Typical use |
|---|---|---|---|
| `Supplier<T>` | `T get()` | `() -> T` | lazy values, factories (`orElseGet`, `ThreadLocal.withInitial`) |
| `Consumer<T>` | `void accept(T)` | `T -> void` | side effects (`forEach`, `ifPresent`) |
| `Function<T, R>` | `R apply(T)` | `T -> R` | transformations (`map`, `computeIfAbsent`) |
| `Predicate<T>` | `boolean test(T)` | `T -> boolean` | filters and rules (`filter`, `removeIf`) |
| `UnaryOperator<T>` | `T apply(T)` | `T -> T` | same-type transforms (`List.replaceAll`) |
| `BinaryOperator<T>` | `T apply(T, T)` | `(T, T) -> T` | combining (`reduce`, `Map.merge`) |
| `BiFunction<T, U, R>` | `R apply(T, U)` | `(T, U) -> R` | two-input transforms (`Map.compute`, `replaceAll`) |

They come with `BiConsumer<T, U>` (`Map.forEach`) and `BiPredicate<T, U>`. `UnaryOperator<T>` *extends* `Function<T, T>` and `BinaryOperator<T>` *extends* `BiFunction<T, T, T>`, so they can be passed anywhere the general form is expected.

Older interfaces still matter: `Runnable` (`() -> void`), `Callable<V>` (`() -> V`, may throw), and `Comparator<T>` (`(T, T) -> int`).

### Primitive specialisations

Generics can't use primitives, so `Function<Integer, Integer>` boxes every value. The package adds variants named by a simple scheme:

| Prefix pattern | Meaning | Examples |
|---|---|---|
| `Int…`, `Long…`, `Double…` | the input is primitive | `IntPredicate`, `IntFunction<R>`, `IntConsumer`, `IntUnaryOperator`, `IntBinaryOperator` |
| `To…Function` | the output is primitive | `ToIntFunction<T>`, `ToLongBiFunction<T, U>`, `ToDoubleFunction<T>` |
| `XToYFunction` | primitive to primitive | `IntToLongFunction`, `DoubleToIntFunction` |
| `…Supplier` | a primitive result | `IntSupplier`, `BooleanSupplier`, `DoubleSupplier` |
| `ObjXConsumer` | an object plus a primitive | `ObjIntConsumer<T>` |

Method names change too: `applyAsInt`, `getAsDouble`, `testAsLong`… so the call site shows that no boxing happens. Only `int`, `long` and `double` get full sets (plus `BooleanSupplier`). Use `IntStream` and `ToIntFunction` for `short`, `byte` and `char`.

### Composing behaviour

The interfaces have `default` methods that build new functions from old ones:

| Method | Result |
|---|---|
| `f.andThen(g)` | `x -> g(f(x))`: f first |
| `f.compose(g)` | `x -> f(g(x))`: g first |
| `Function.identity()` / `UnaryOperator.identity()` | `x -> x` |
| `p.and(q)`, `p.or(q)` | short-circuiting `&&`, `\|\|` |
| `p.negate()`, `Predicate.not(p)` (Java 11) | `!p` (`not` reads better with method references) |
| `Predicate.isEqual(v)` | `x -> Objects.equals(v, x)` |
| `consumer.andThen(other)` | run both, in order |
| `BinaryOperator.minBy(cmp)` / `maxBy(cmp)` | the smaller / larger argument |
| `biFunction.andThen(f)` | post-process a two-argument result |

`Comparator` has its own builders (`comparing`, `thenComparing`, `reversed`, `nullsFirst`), covered in the Comparator lesson.

## Internal working

- **Composition is closure-building.** `Predicate.and` is literally `return (t) -> test(t) && other.test(t);`. The new lambda captures `this` and `other`, so long chains create a small tree of objects that delegate to each other. Composition is cheap to build and costs one extra call per level when used (the JIT usually inlines it).
- **Null checks happen at composition time.** `and`, `or`, `andThen` and `compose` call `Objects.requireNonNull(other)`, so `p.and(null)` fails immediately rather than later during `test`.
- **Wildcards make composition flexible.** `compose` is declared as `<V> Function<V, R> compose(Function<? super V, ? extends T> before)`: PECS from the Generics stage. A `Function<Object, String>` can be composed after a `Function<String, Integer>`.
- **Boxing cost.** `Function<Integer, Integer> f = x -> x + 1` compiles to `Integer.valueOf(x.intValue() + 1)`. Values from −128 to 127 come from the `Integer` cache; others allocate a new object (unless the JIT's escape analysis removes it). On hot paths over large data, `IntUnaryOperator` and `IntStream` avoid this entirely.
- **Laziness through `Supplier`.** APIs that take a `Supplier` call `get()` only when needed: `Optional.orElseGet`, `Objects.requireNonNull(obj, () -> message)`, `Logger.log(Level, Supplier<String>)`, `Map.computeIfAbsent` (a `Function`). Expensive work is skipped when the value isn't required.

## Visual representation

```text title="Choosing the interface by shape"
  inputs           output        interface                 primitive variant
  ------------     ---------     ----------------------    -------------------------------
  none             T             Supplier<T>               IntSupplier, BooleanSupplier
  T                void          Consumer<T>               IntConsumer, ObjIntConsumer<T>
  T                boolean       Predicate<T>              IntPredicate
  T                R             Function<T, R>            IntFunction<R>, ToIntFunction<T>
  T                T             UnaryOperator<T>          IntUnaryOperator
  T, U             void          BiConsumer<T, U>
  T, U             boolean       BiPredicate<T, U>
  T, U             R             BiFunction<T, U, R>       ToIntBiFunction<T, U>
  T, T             T             BinaryOperator<T>         IntBinaryOperator

  f.andThen(g):   x --f--> y --g--> z         f.compose(g):   x --g--> y --f--> z
```

## Java code example

```java title="FunctionalCatalog.java" file="FunctionalCatalog.java"
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.function.BiFunction;
import java.util.function.BinaryOperator;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.function.IntBinaryOperator;
import java.util.function.IntPredicate;
import java.util.function.Predicate;
import java.util.function.Supplier;
import java.util.function.ToIntFunction;
import java.util.function.UnaryOperator;

public class FunctionalCatalog {
    record Product(String name, String category, int priceCents, boolean inStock) { }

    public static void main(String[] args) {
        List<Product> products = List.of(
                new Product("Laptop", "tech", 120_000, true),
                new Product("Mouse", "tech", 2_500, false),
                new Product("Desk", "office", 30_000, true),
                new Product("Pen", "office", 150, true));

        // Predicate<T>: T -> boolean, combined with and / or / negate / not
        Predicate<Product> inStock = p -> p.inStock();
        Predicate<Product> cheap = p -> p.priceCents() < 5_000;
        Predicate<Product> tech = p -> p.category().equals("tech");
        System.out.println("cheap and in stock: " + names(products, cheap.and(inStock)));
        System.out.println("tech or cheap:      " + names(products, tech.or(cheap)));
        System.out.println("not in stock:       " + names(products, inStock.negate()));
        System.out.println("Predicate.not(tech): " + names(products, Predicate.not(tech)));

        // Function<T, R>: T -> R, chained with andThen; compose runs the other one first
        Function<Product, Integer> price = p -> p.priceCents();
        Function<Integer, Integer> withTax = cents -> cents * 118 / 100;
        Function<Integer, String> money = cents -> String.format("%d.%02d", cents / 100, cents % 100);
        System.out.println("Desk incl. tax: " + price.andThen(withTax).andThen(money).apply(products.get(2)));

        Function<Integer, Integer> doubleIt = x -> x * 2;
        Function<Integer, Integer> addThree = x -> x + 3;
        System.out.println("doubleIt.andThen(addThree)(5) = " + doubleIt.andThen(addThree).apply(5));
        System.out.println("doubleIt.compose(addThree)(5) = " + doubleIt.compose(addThree).apply(5));

        // UnaryOperator, BinaryOperator, BiFunction
        UnaryOperator<String> shout = s -> s.toUpperCase() + "!";
        BinaryOperator<Integer> larger = BinaryOperator.maxBy(Comparator.naturalOrder());
        BiFunction<String, Integer, String> repeat = (s, n) -> s.repeat(n);
        System.out.println(shout.apply("sale") + " larger(7, 3)=" + larger.apply(7, 3)
                + " repeat-then-length=" + repeat.andThen(s -> s.length()).apply("ab", 3));

        // Consumer<T>: T -> void, chained with andThen
        List<String> audit = new ArrayList<>();
        Consumer<Product> log = p -> audit.add("log:" + p.name());
        Consumer<Product> notify = p -> audit.add("notify:" + p.name());
        log.andThen(notify).accept(products.get(0));
        System.out.println("audit " + audit);

        // Supplier<T>: () -> T, only called when the value is needed
        System.out.println("user: " + orDefault("ada", () -> expensiveDefault()));
        System.out.println("user: " + orDefault(null, () -> expensiveDefault()));

        // Primitive specialisations: no boxing
        ToIntFunction<Product> cents = p -> p.priceCents();
        IntBinaryOperator plus = (a, b) -> a + b;
        IntPredicate even = n -> n % 2 == 0;
        int total = 0;
        for (Product p : products) {
            total = plus.applyAsInt(total, cents.applyAsInt(p));
        }
        System.out.println("total cents " + total + ", even: " + even.test(total));

        // Why the specialisations exist: Function<Integer, Integer> boxes its result
        Function<Integer, Integer> same = x -> x;
        System.out.println("boxed 127 identical: " + (same.apply(127) == same.apply(127)));
        System.out.println("boxed 128 identical: " + (same.apply(128) == same.apply(128)));
    }

    static List<String> names(List<Product> products, Predicate<Product> filter) {
        List<String> result = new ArrayList<>();
        for (Product p : products) {
            if (filter.test(p)) {
                result.add(p.name());
            }
        }
        return result;
    }

    static String orDefault(String value, Supplier<String> fallback) {
        return value != null ? value : fallback.get();
    }

    static String expensiveDefault() {
        System.out.println("  (computing the default...)");
        return "guest";
    }
}
```

## Output

```text title="Output" output="FunctionalCatalog.java"
cheap and in stock: [Pen]
tech or cheap:      [Laptop, Mouse, Pen]
not in stock:       [Mouse]
Predicate.not(tech): [Desk, Pen]
Desk incl. tax: 354.00
doubleIt.andThen(addThree)(5) = 13
doubleIt.compose(addThree)(5) = 16
SALE! larger(7, 3)=7 repeat-then-length=6
audit [log:Laptop, notify:Laptop]
user: ada
  (computing the default...)
user: guest
total cents 152650, even: true
boxed 127 identical: true
boxed 128 identical: false
```

- `names` accepts *any* `Predicate<Product>`, so composed predicates plug straight in with no new types.
- `andThen` ran `doubleIt` first, giving (5 × 2) + 3 = 13; `compose` ran `addThree` first, giving (5 + 3) × 2 = 16.
- The `Supplier` ran only for the `null` case. That's the difference between `orElse(expensive())` and `orElseGet(() -> expensive())` in `Optional`.
- `127` came back as the same cached `Integer` both times, but `128` produced two different objects: every call through `Function<Integer, Integer>` boxed its result. The `Int…` variants avoid that.

## Real-world application

- **Validation and business rules** as `Predicate<Order>` values that are composed and stored in configuration, such as feature flags or eligibility checks.
- **Mapping layers**: `Function<Entity, Dto>` passed to repositories or `Page.map(...)` in Spring Data.
- **Lazy logging and messages**: `log.debug("state {}", () -> expensiveDump())` (Log4j 2), `Objects.requireNonNull(cfg, () -> "missing " + key)`.
- **Caches**: `cache.computeIfAbsent(key, k -> loadFromDb(k))`, Caffeine's `CacheLoader`, Spring's `Supplier`-based bean registration.
- **Callbacks with two inputs**: `map.forEach((key, value) -> ...)`, `map.merge(word, 1, Integer::sum)`, `CompletableFuture.thenCombine(other, (a, b) -> ...)`.

## Common mistakes

- **Defining a custom interface when a standard one fits.** It hurts interoperability. Create one only for checked exceptions, more than two parameters, or a name that clarifies a domain concept.
- **Mixing up `andThen` and `compose`.** `f.andThen(g)` means "f, then g". When in doubt, use `andThen` and order the chain the way it reads.
- **`Function<Integer, Integer>` in hot numeric loops.** Prefer `IntUnaryOperator`, `ToIntFunction` and `IntStream`.
- **Side effects inside a `Function` or `Predicate`.** Callers (and streams) may call them any number of times, in any order, or not at all.
- **Passing `orElse(compute())` instead of a `Supplier`.** The argument is evaluated eagerly; use the `Supplier` overload when the value is costly.
- **`Predicate.isEqual` vs `==`.** `isEqual` uses `equals` (null-safe), which is usually what you want.

## Interview questions

**Q1. Name the core functional interfaces in `java.util.function` and their method signatures.**

````reveal title="Answer"
`Supplier<T>`: `T get()`. `Consumer<T>`: `void accept(T)`. `Function<T, R>`: `R apply(T)`. `Predicate<T>`: `boolean test(T)`. `UnaryOperator<T>` extends `Function<T, T>`. `BinaryOperator<T>` extends `BiFunction<T, T, T>`. The two-argument forms are `BiFunction<T, U, R>`, `BiConsumer<T, U>` and `BiPredicate<T, U>`. There are also primitive specialisations such as `IntPredicate`, `ToIntFunction<T>`, `IntUnaryOperator` and `IntSupplier`.
````

**Q2. What's the difference between `f.andThen(g)` and `f.compose(g)`?**

````reveal title="Answer"
`f.andThen(g)` applies `f` first and then `g` to its result: `g(f(x))`. `f.compose(g)` applies `g` first and then `f`: `f(g(x))`. With `f = x * 2` and `g = x + 3`, `f.andThen(g).apply(5)` is 13 and `f.compose(g).apply(5)` is 16.
````

**Q3. Why do `IntPredicate`, `ToIntFunction` and friends exist?**

````reveal title="Answer"
Generics work only with reference types, so `Function<Integer, Integer>` boxes inputs and outputs. Values outside the `Integer` cache (−128..127) allocate a new object, and every call unboxes and reboxes. The primitive specialisations take and return `int`, `long` or `double` directly (`applyAsInt`, `test(int)`), so there's no allocation or indirection. This matters in tight loops and large streams.
````

**Q4. What's the difference between `Supplier` and `Callable`?**

````reveal title="Answer"
Both take nothing and return a value. `Callable<V>.call()` declares `throws Exception` and is used for tasks submitted to executors. `Supplier<T>.get()` declares no checked exceptions and is used for lazy values and factories throughout `java.util.function`, streams and `Optional`. `ExecutorService.submit` accepts `Callable`; `CompletableFuture.supplyAsync` accepts `Supplier`.
````

**Q5. When would you still declare your own functional interface?**

````reveal title="Answer"
When a standard one doesn't fit or doesn't communicate enough:
- the method must throw a checked exception (`ThrowingFunction`);
- it needs three or more parameters (`TriFunction`);
- it needs primitive types without a JDK variant (for example `char`);
- a domain name makes the API clearer (`PricingRule`, `RetryPolicy`), possibly with useful default methods.

Annotate it with `@FunctionalInterface`.
````

## Hands-on exercise

Build a small username checker from standard functional interfaces only:

1. A normalisation pipeline: a `List<UnaryOperator<String>>` (strip, lower-case, replace spaces with `_`) combined into one `Function<String, String>` with `andThen`.
2. Named rules in a `LinkedHashMap<String, Predicate<String>>`: 3–16 characters; starts with a letter; only letters, digits or `_`; not one of the reserved names `admin` or `root` (use `Predicate.not`).
3. `allRules()` combines every rule with `and`, and `failures(name)` lists the names of the rules that fail.

Check `"  Ada Lovelace "`, `"9lives"`, `"ADMIN"`, `"x"` and `"grace-hopper"`.

````hint title="Hint"
Start the pipeline from `Function.identity()` and fold each step in with `pipeline = pipeline.andThen(step)`. Start the combined rule from `s -> true` and fold with `and`. Use `Map.forEach((name, rule) -> ...)` (a `BiConsumer`) to collect failures. `s.chars().allMatch(c -> ...)` takes an `IntPredicate`.
````

````solution title="Solution"
```java title="UsernameRules.java" file="UsernameRules.java"
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.function.UnaryOperator;

public class UsernameRules {
    static final List<UnaryOperator<String>> NORMALISERS = List.of(
            s -> s.strip(),
            s -> s.toLowerCase(),
            s -> s.replace(' ', '_'));

    static final Map<String, Predicate<String>> RULES = new LinkedHashMap<>();

    static {
        RULES.put("3-16 chars", s -> s.length() >= 3 && s.length() <= 16);
        RULES.put("starts with letter", s -> !s.isEmpty() && Character.isLetter(s.charAt(0)));
        RULES.put("letters/digits/_", s -> s.chars().allMatch(c -> Character.isLetterOrDigit(c) || c == '_'));
        RULES.put("not reserved", Predicate.not(s -> s.equals("admin") || s.equals("root")));
    }

    static Function<String, String> normaliser() {
        Function<String, String> pipeline = Function.identity();
        for (UnaryOperator<String> step : NORMALISERS) {
            pipeline = pipeline.andThen(step);
        }
        return pipeline;
    }

    static Predicate<String> allRules() {
        Predicate<String> all = s -> true;
        for (Predicate<String> rule : RULES.values()) {
            all = all.and(rule);
        }
        return all;
    }

    static List<String> failures(String username) {
        List<String> failed = new ArrayList<>();
        RULES.forEach((name, rule) -> {
            if (!rule.test(username)) {
                failed.add(name);
            }
        });
        return failed;
    }

    public static void main(String[] args) {
        Function<String, String> normalise = normaliser();
        Predicate<String> valid = allRules();
        for (String raw : List.of("  Ada Lovelace ", "9lives", "ADMIN", "x", "grace-hopper")) {
            String name = normalise.apply(raw);
            System.out.printf("%-17s -> %-13s valid=%-5b failed=%s%n", "'" + raw + "'", name, valid.test(name), failures(name));
        }
    }
}
```

```text title="Output" output="UsernameRules.java"
'  Ada Lovelace ' -> ada_lovelace  valid=true  failed=[]
'9lives'          -> 9lives        valid=false failed=[starts with letter]
'ADMIN'           -> admin         valid=false failed=[not reserved]
'x'               -> x             valid=false failed=[3-16 chars]
'grace-hopper'    -> grace-hopper  valid=false failed=[letters/digits/_]
```

Rules are data: adding one is a single `RULES.put`, and the same predicates serve both the yes/no check and the detailed error report. The combined predicate stops at the first failing rule (`and` short-circuits), while `failures` tests every rule so the report is complete. `"grace-hopper"` passes normalisation unchanged because the pipeline replaces spaces, not hyphens.
````

## Knowledge check

```quiz
? Which interface matches a lambda that takes a String and returns a boolean?
+ Predicate<String>
- Function<String, Boolean>
- Supplier<Boolean>
> Function<String, Boolean> works too, but Predicate is the idiomatic type and adds and/or/negate.

? f = x -> x * 2 and g = x -> x + 3. What is f.compose(g).apply(5)?
+ 16
- 13
- 10
> compose runs g first: (5 + 3) * 2.

? Why prefer IntUnaryOperator over Function<Integer, Integer> in a hot loop?
+ It avoids boxing and unboxing on every call
- It runs on multiple threads
- Function cannot be used in loops
> Function<Integer, Integer> allocates an Integer for results outside the cache.

? Which interface is passed to Map.forEach?
+ BiConsumer<K, V>
- BiFunction<K, V, Void>
- Consumer<Map.Entry<K, V>>
> forEach on a map hands you the key and the value separately.

? Which method gives a predicate's opposite and reads best with method references?
+ Predicate.not(...)
- Predicate.isEqual(...)
- Predicate.or(...)
> For example, filter(Predicate.not(String::isBlank)). Java 11+.
```

## Key takeaways

- `java.util.function` gives a shared vocabulary: **Supplier, Consumer, Function, Predicate, UnaryOperator, BinaryOperator** and the **Bi-** forms.
- **Primitive specialisations** (`IntPredicate`, `ToIntFunction`, `IntUnaryOperator`…) avoid boxing; their method names (`applyAsInt`) show it.
- Compose with **`andThen` / `compose`**, **`and` / `or` / `negate` / `Predicate.not`** and **`Consumer.andThen`**. Composition builds new lambdas that capture the old ones.
- **`Supplier`** expresses laziness: work happens only when `get()` is called.
- Write a custom functional interface only for checked exceptions, extra parameters or a clearer domain name.
