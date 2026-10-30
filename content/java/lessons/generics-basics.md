## Concept explanation

### What it is

**Generics** (Java 5) let classes, interfaces and methods take **type parameters**, so one implementation works for many types while the compiler still checks types:

```java
List<String> names = new ArrayList<>();     // a List of Strings - checked at compile time
names.add("Ada");
String first = names.get(0);                 // no cast needed
// names.add(42);                            // compile error, not a run-time surprise
```

Three places type parameters appear:

| Where | Syntax | Example |
|---|---|---|
| **Generic class / record** | `class Box<T> { T value; }` | `Box<Integer>`, `record Pair<A, B>(A first, B second)` |
| **Generic interface** | `interface Repository<T, ID> { Optional<T> findById(ID id); }` | `Repository<Order, Long>` |
| **Generic method** | `static <T> List<T> repeat(T item, int n)` — the `<T>` goes **before the return type** | `repeat("x", 3)` |

Conventional names: `T` (type), `E` (element), `K`/`V` (key/value), `R` (result), `S`, `U` (more types), `ID`.

### Why it exists

Before Java 5, collections held `Object`:

```java
List list = new ArrayList();           // raw type
list.add("Ada");
list.add(42);                           // compiles
String s = (String) list.get(1);        // ClassCastException - at run time, far from the bug
```

Generics move that error to **compile time**, remove casts from client code, and document intent in signatures (`Map<CustomerId, List<Order>>` says far more than `Map`). They also let you write **reusable, type-safe algorithms** — `Collections.sort`, `Optional.map`, `Stream.collect` — once.

### Type inference

The compiler infers type arguments wherever it can:

- **Diamond** `<>` (Java 7): `Map<String, List<Integer>> m = new HashMap<>();`
- **Generic method calls**: `List<String> l = Collections.emptyList();` infers `T = String` from the target type; `repeat("x", 3)` infers `T = String` from the argument.
- **Explicit type arguments** when inference can't decide: `Collections.<String>emptyList()`, `List.<Number>of(1, 2.5)`.
- Careful with **`var` + diamond**: `var list = new ArrayList<>();` infers `ArrayList<Object>`.

### Rules worth knowing now

- Type arguments must be **reference types**: `List<int>` is illegal; use `List<Integer>` (boxing) or primitive arrays/streams.
- A generic class's type parameters can't be used in `static` members (statics are shared by all parameterisations).
- **Raw types** (`List` without `<…>`) still compile for backward compatibility, with warnings — don't use them in new code.
- `List<Object>` is not a supertype of `List<String>` — the subject of the [next lesson](lesson:bounded-types-and-wildcards).

### When to use generics

- **Containers and data structures** (`Box<T>`, `Cache<K, V>`, `Tree<T>`).
- **Algorithms** independent of the element type (`max`, `swap`, `groupBy`).
- **Abstractions over types** in frameworks: repositories, event handlers (`Handler<E extends Event>`), result wrappers (`Result<T>`), DTO mappers (`Mapper<S, T>`).

If a class only ever works with one type, don't make it generic "just in case".

## Internal working

- Generics are a **compile-time feature**. `javac` type-checks with the type arguments, then **erases** them: `List<String>` and `List<Integer>` become the same raw `List` in bytecode, and `T` becomes its bound (`Object` by default). Full details in [type erasure](lesson:type-erasure-and-restrictions).
- Where a generic value flows into a specific type, `javac` **inserts a `checkcast`**: `String s = names.get(0);` compiles to `invokeinterface List.get` + `checkcast String`. With correct, warning-free generic code those casts can never fail.
- **Signatures survive** as metadata (the `Signature` attribute), which is why reflection can report `List<String>` for a field's declared type even though instances don't know their type argument.
- **No run-time cost**: there's one class per generic type, no code duplication (unlike C++ templates), and the inserted casts are nearly free.
- **Boxing is the hidden cost**: `List<Integer>` stores `Integer` objects, not `int`s.
- **Inference** is performed by `javac` with constraint solving over argument types and the target type; since Java 8 it considers the assignment context (target typing), which made the diamond and lambdas much more useful.

## Visual representation

```text title="What you write vs what runs"
  source                                  after erasure (bytecode, conceptually)
  ---------------------------------       ----------------------------------------
  class Box<T> {                          class Box {
      private T value;                        private Object value;
      T get() { return value; }               Object get() { return value; }
      void set(T v) { value = v; }            void set(Object v) { value = v; }
  }                                       }

  Box<String> b = new Box<>();            Box b = new Box();
  b.set("hi");                            b.set("hi");
  String s = b.get();                     String s = (String) b.get();   <- cast inserted by javac
  b.set(42);  // compile error            (never reaches bytecode)
```

## Java code example

```java title="GenericsBasics.java" file="GenericsBasics.java"
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public class GenericsBasics {
    public static void main(String[] args) {
        // 1. The problem generics solve
        System.out.println("raw list: " + rawTypeBug());

        // 2. A generic class used with two type arguments
        Box<String> label = new Box<>("fragile");
        Box<Integer> weight = new Box<>(12);
        String text = label.get().toUpperCase();          // no cast
        int kilos = weight.get() + 3;                     // auto-unboxing
        System.out.println(text + ", " + kilos + " kg, " + label.map(String::length));

        // 3. Generic record and generic methods (types inferred from arguments)
        Pair<String, Integer> pair = Pair.of("answer", 42);
        System.out.println(pair + " swapped " + pair.swap());
        System.out.println("repeat: " + repeat("ab", 3) + ", firstOrDefault: " + firstOrDefault(List.of(), "none"));
        Map<String, Integer> stock = Map.of("pen", 3, "ink", 7);
        System.out.println("inverted: " + new java.util.TreeMap<>(invert(stock)));

        // 4. A generic interface with two type parameters
        Repository<Customer, Long> customers = new InMemoryRepository<>(Customer::id);
        customers.save(new Customer(1L, "Ada"));
        customers.save(new Customer(2L, "Linus"));
        System.out.println("found: " + customers.findById(2L).map(Customer::name).orElse("?")
                + ", missing: " + customers.findById(9L).isPresent());

        // 5. Inference details
        List<String> empty = Collections.emptyList();     // T inferred from the target type
        List<Number> mixed = List.<Number>of(1, 2.5);      // explicit type argument
        var oops = new ArrayList<>();                      // var + diamond -> ArrayList<Object>
        oops.add("anything");
        oops.add(3.14);
        System.out.println(empty.size() + " " + mixed + " " + oops);
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    static String rawTypeBug() {
        List list = new ArrayList();                       // raw type: no checking
        list.add("Ada");
        list.add(42);                                      // compiles!
        try {
            for (Object o : list) {
                String s = (String) o;                     // fails at run time, far from the add()
                s.length();
            }
            return "no error";
        } catch (ClassCastException e) {
            return "ClassCastException at run time";
        }
    }

    static <T> List<T> repeat(T item, int times) {         // <T> declared before the return type
        List<T> result = new ArrayList<>(times);
        for (int i = 0; i < times; i++) {
            result.add(item);
        }
        return result;
    }

    static <T> T firstOrDefault(List<T> list, T fallback) {
        return list.isEmpty() ? fallback : list.get(0);
    }

    static <K, V> Map<V, K> invert(Map<K, V> map) {
        Map<V, K> result = new HashMap<>();
        map.forEach((k, v) -> result.put(v, k));
        return result;
    }
}

final class Box<T> {
    private final T value;

    Box(T value) {
        this.value = value;
    }

    T get() {
        return value;
    }

    <R> Box<R> map(java.util.function.Function<? super T, ? extends R> f) {   // generic method in a generic class
        return new Box<>(f.apply(value));
    }

    @Override
    public String toString() {
        return "Box(" + value + ")";
    }
}

record Pair<A, B>(A first, B second) {
    static <A, B> Pair<A, B> of(A first, B second) {
        return new Pair<>(first, second);
    }

    Pair<B, A> swap() {
        return new Pair<>(second, first);
    }
}

record Customer(Long id, String name) {
}

interface Repository<T, ID> {
    void save(T entity);

    Optional<T> findById(ID id);
}

final class InMemoryRepository<T, ID> implements Repository<T, ID> {
    private final Map<ID, T> rows = new HashMap<>();
    private final java.util.function.Function<T, ID> idOf;

    InMemoryRepository(java.util.function.Function<T, ID> idOf) {
        this.idOf = idOf;
    }

    @Override
    public void save(T entity) {
        rows.put(idOf.apply(entity), entity);
    }

    @Override
    public Optional<T> findById(ID id) {
        return Optional.ofNullable(rows.get(id));
    }
}
```

## Output

```text title="Output" output="GenericsBasics.java"
raw list: ClassCastException at run time
FRAGILE, 15 kg, Box(7)
Pair[first=answer, second=42] swapped Pair[first=42, second=answer]
repeat: [ab, ab, ab], firstOrDefault: none
inverted: {3=pen, 7=ink}
found: Linus, missing: false
0 [1, 2.5] [anything, 3.14]
```

- The raw list accepted an `Integer` and only failed when the element was cast — exactly the class of bug generics prevent at compile time.
- `Box<String>` and `Box<Integer>` are the same class at run time, but the compiler tracked each element type and inserted the casts.
- Generic methods inferred their type arguments from the arguments (`repeat("ab", 3)` → `T = String`).
- `InMemoryRepository<Customer, Long>` worked for any entity and id type.
- `var oops = new ArrayList<>()` silently became an `ArrayList<Object>`.

## Real-world application

- **Collections and streams**: every `List<T>`, `Map<K, V>`, `Optional<T>`, `Stream<T>`, `CompletableFuture<T>` is generic.
- **Spring Data**: `interface OrderRepository extends JpaRepository<Order, Long>` — the framework generates the implementation from the type arguments.
- **API wrappers**: `ApiResponse<T>`, `Page<T>`, `Result<T, E>` give typed payloads to clients and handlers.
- **Event and messaging systems**: `EventHandler<E extends DomainEvent>`, `MessageConverter<T>`, `Serializer<T>` (Kafka) — one interface, many typed implementations.
- **Testing**: `assertThat(list).containsExactly(...)` and `ArgumentCaptor<T>` are generic so assertions stay type-checked.

## Common mistakes

- **Raw types** in new code (`List list = new ArrayList();`) and ignoring "unchecked" warnings.
- **`var` with the diamond**, producing `ArrayList<Object>`.
- **Primitive type arguments** (`List<int>` — not allowed).
- **Putting `<T>` in the wrong place** for a generic method (`static List<T> repeat(...)` without declaring `<T>`).
- **Over-generifying** classes that only ever handle one type.
- **Using `Object` parameters** instead of a type parameter, losing type safety (`static Object first(List<?>)` vs `static <T> T first(List<T>)`).
- **Shadowing**: a generic method `<T>` inside a generic class `<T>` declares a **new** `T` unrelated to the class's.

## Interview questions

**Q1. Why were generics added to Java?**

````reveal title="Answer"
To catch type errors at compile time instead of as `ClassCastException`s at run time, to eliminate explicit casts in client code, and to let libraries express type relationships in their APIs (a `Map<String, List<Order>>` documents itself). They were added in Java 5 with type erasure so that generic code stays binary-compatible with pre-generics libraries and JVMs.
````

**Q2. What's the difference between a generic class and a generic method?**

````reveal title="Answer"
A generic class declares type parameters after its name (`class Box<T>`), and every instance is used with specific type arguments (`Box<String>`). A generic method declares its own type parameters before the return type (`static <T> List<T> repeat(T item, int n)`), independent of any class parameters; they're inferred per call. Static methods can't use the class's type parameters, so static utilities are generic methods.
````

**Q3. What is the diamond operator?**

````reveal title="Answer"
`<>` on a constructor call (Java 7) asks the compiler to infer the type arguments from the context: `Map<String, List<Integer>> m = new HashMap<>();`. Since Java 9 it also works with anonymous classes when the inferred types are denotable. With `var` there's no target type, so `var m = new HashMap<>()` infers `HashMap<Object, Object>`.
````

**Q4. Why can't you write `List<int>`?**

````reveal title="Answer"
Type arguments must be reference types because generics are implemented by erasure to `Object` (or a bound); an `int` isn't an `Object`. Use the wrapper (`List<Integer>`, with boxing costs), primitive arrays, primitive streams (`IntStream`), or primitive collection libraries. (Project Valhalla aims to lift this restriction in a future Java.)
````

## Hands-on exercise

Write a generic `Result<T>` type that holds either a value or an error message:

- static factories `Result.ok(T value)` and `Result.error(String message)`;
- `boolean isOk()`, `T getOrElse(T fallback)`;
- `<R> Result<R> map(Function<? super T, ? extends R> f)` that transforms a successful value and passes errors through unchanged.

Use it to parse `"42"` and `"x"` into integers and then double them.

````hint title="Hint"
Store `T value` and `String error` (one of them null), with a private constructor. `map` returns `ok(f.apply(value))` when ok, otherwise `error(error)` — note the type parameter changes from `T` to `R`, so you need a new `Result<R>`, not `this`.
````

````solution title="Solution"
```java title="ResultDemo.java" file="ResultDemo.java"
import java.util.function.Function;

public class ResultDemo {
    static Result<Integer> parse(String raw) {
        try {
            return Result.ok(Integer.parseInt(raw));
        } catch (NumberFormatException e) {
            return Result.error("not a number: " + raw);
        }
    }

    public static void main(String[] args) {
        Result<Integer> good = parse("42").map(n -> n * 2);
        Result<Integer> bad = parse("x").map(n -> n * 2);
        Result<String> described = good.map(n -> "value=" + n);
        System.out.println(good + " " + bad + " " + described);
        System.out.println(good.getOrElse(-1) + " " + bad.getOrElse(-1));
    }
}

final class Result<T> {
    private final T value;
    private final String error;

    private Result(T value, String error) {
        this.value = value;
        this.error = error;
    }

    static <T> Result<T> ok(T value) {
        return new Result<>(value, null);
    }

    static <T> Result<T> error(String message) {
        return new Result<>(null, message);
    }

    boolean isOk() {
        return error == null;
    }

    T getOrElse(T fallback) {
        return isOk() ? value : fallback;
    }

    <R> Result<R> map(Function<? super T, ? extends R> f) {
        return isOk() ? Result.ok(f.apply(value)) : Result.error(error);
    }

    @Override
    public String toString() {
        return isOk() ? "Ok(" + value + ")" : "Error(" + error + ")";
    }
}
```

```text title="Output" output="ResultDemo.java"
Ok(84) Error(not a number: x) Ok(value=84)
84 -1
```
````

## Knowledge check

```quiz
? Where does the type parameter of a generic method go?
+ Before the return type: `static <T> T first(List<T> l)`
- After the method name: `static T first<T>(List<T> l)`
- In the class declaration only
> Method type parameters are declared between modifiers and the return type.

? `var list = new ArrayList<>();` — what is the type of list?
+ ArrayList<Object>
- ArrayList<String>
- Compile error
> With var there's no target type for the diamond to use.

? What does javac insert when you read from a List<String> into a String variable?
+ A checkcast to String
- A run-time type check of every element
- Nothing
> Erasure turns get() into an Object return; javac adds the cast.

? Which is legal?
- List<int> nums
+ List<Integer> nums
- List<?> nums = new ArrayList<?>()
> Type arguments must be reference types; you can't instantiate with a wildcard.

? Can a static method use the type parameter T of its generic class?
+ No; static members are shared by all parameterisations
- Yes, always
> Make the static method generic itself.
```

## Key takeaways

- Generics add **type parameters** to classes, interfaces, records and methods, catching type errors **at compile time** and removing casts.
- Generic methods declare `<T>` **before the return type**; type arguments are usually **inferred** (diamond, arguments, target type).
- Avoid **raw types** and heed unchecked warnings; beware `var` + `<>`.
- Type arguments must be **reference types**; generics are erased, with casts inserted by `javac`.
- Use generics for containers, algorithms and framework abstractions — not for classes that only ever use one type.
