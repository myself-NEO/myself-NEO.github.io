## Problem statement

Write a small generic utility library, `GenericUtils`, whose signatures are **as flexible as possible while staying type-safe**. Getting the signatures right is the exercise. The starter's naive signatures compile, but they reject perfectly valid calls.

1. **`max(Collection<…> items)`** returns the largest element by natural ordering. It must accept a `List<LocalDate>` (where `LocalDate` implements `Comparable<ChronoLocalDate>`, not `Comparable<LocalDate>`) and a `Set<Integer>`.
   - Empty collection → `NoSuchElementException`.
2. **`max(Collection<…> items, Comparator<…> order)`** works with a comparator written for a **supertype**, for example a `Comparator<Number>` for a list of `Integer`s.
3. **`copyAll(List<…> dest, List<…> src)`** appends every element of `src` to `dest`. It must allow copying `Integer`s into a `List<Number>` or a `List<Object>`.
4. **`countMatches(Iterable<…> items, Predicate<…> test)`** counts the elements matching the predicate. It must accept a `Predicate<Object>` for a list of `String`s.
5. **`record Pair<A, B>(A first, B second)`**:
   - immutable;
   - `null` components rejected;
   - `static of(a, b)`;
   - `Pair<B, A> swap()`;
   - `<C> Pair<A, C> withSecond(C c)`.
6. **`TypedRegistry`**, a *type-safe heterogeneous container*:
   - `<T> void put(Class<T> type, T value)` and `<T> Optional<T> get(Class<T> type)` store one value per class, with no casts at call sites;
   - raw-type abuse (putting a `String` under `Integer.class`) must fail **at insertion** with `ClassCastException`;
   - primitive classes (`int.class`) are rejected with `IllegalArgumentException`, and `null` values with `NullPointerException`.

> [!NOTE] The JUnit tests won't compile until your signatures accept `LocalDate`, supertype comparators and supertype destinations. The compiler is your first test.

## Starter code

```java title="GenericUtils.java" starter="true"
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.function.Predicate;

public final class GenericUtils {
    private GenericUtils() { }

    // TODO: these signatures are too strict (see the problem statement)
    static <T extends Comparable<T>> T max(Collection<T> items) {
        throw new UnsupportedOperationException("TODO");
    }

    static <T> T max(Collection<T> items, Comparator<T> order) {
        throw new UnsupportedOperationException("TODO");
    }

    static <T> void copyAll(List<T> dest, List<T> src) {
        throw new UnsupportedOperationException("TODO");
    }

    static <T> int countMatches(Iterable<T> items, Predicate<T> test) {
        throw new UnsupportedOperationException("TODO");
    }

    record Pair<A, B>(A first, B second) {
        // TODO: reject nulls; add of(), swap(), withSecond()
    }

    static final class TypedRegistry {
        // TODO: put(Class<T>, T) and Optional<T> get(Class<T>)
    }

    public static void main(String[] args) {
        System.out.println("max(Set.of(3, 9, 4)) = " + max(Set.of(3, 9, 4)));
        // Uncomment once max accepts Comparable<? super T> types:
        // System.out.println("max of LocalDates = " + max(List.of(java.time.LocalDate.of(2024, 5, 1), java.time.LocalDate.of(2025, 1, 31))));
        List<Integer> ints = List.of(5, -12, 7);
        System.out.println("max by absolute value = " + max(ints, Comparator.comparingInt(Math::abs)));
        List<Integer> dest = new ArrayList<>(List.of(1));
        copyAll(dest, ints);
        System.out.println("copyAll -> " + dest);
    }
}
```

## Hints

````hint title="Hint 1: PECS"
**P**roducer **E**xtends, **C**onsumer **S**uper:
- a parameter you only **read** `T`s from is `? extends T` (a producer);
- a parameter you only **write** `T`s into, or **pass** `T`s to (comparators, predicates), is `? super T` (a consumer).

`src` is a producer and `dest` a consumer. A `Comparator<? super T>` consumes `T`s, and so does a `Predicate<? super T>`.
````

````hint title="Hint 2: recursive bounds"
`LocalDate implements Comparable<ChronoLocalDate>`, so `T extends Comparable<T>` fails for `T = LocalDate`. The JDK's own `Collections.max` is declared as:

```java
<T extends Object & Comparable<? super T>> T max(Collection<? extends T> coll)
```

`Comparable<? super T>` means "comparable to T or to one of its supertypes". Implement the natural-order `max` by delegating to the comparator version with `Comparator.naturalOrder()`.
````

````hint title="Hint 3: the heterogeneous container"
- Store values in a `Map<Class<?>, Object>`.
- In `put`, call `type.cast(value)` **before** storing. `Class.cast` is a checked cast at run time, so a raw-typed caller who passes a `String` under `Integer.class` fails immediately rather than poisoning the map.
- In `get`, `Optional.ofNullable(map.get(type)).map(type::cast)` restores the static type without an unchecked cast.
- Reject `type.isPrimitive()`: `int.class.cast(5)` throws, because `int.class` has no instances.
````

## Test cases

| Call | Expected |
|---|---|
| `max(Set.of(3, 9, 4))` | `9` |
| `max(List.of(LocalDate 2024-05-01, 2025-01-31))` | `2025-01-31` (must compile) |
| `max(List.of(), ...)` | `NoSuchElementException` |
| `max(List.of(5, -12, 7), comparingInt(Math::abs))` | `-12` |
| `max(List<Integer>, Comparator<Number>)` | compiles, returns the largest |
| `copyAll(List<Number>, List<Integer>)`, `copyAll(List<Object>, List<Double>)` | compiles, appends in order |
| `countMatches(List<String>, Predicate<Object>)` | compiles, counts correctly |
| `Pair.of("a", 1).swap()` | `Pair[first=1, second=a]` |
| `Pair.of(null, 1)` | `NullPointerException` |
| `registry.put(String.class, "hi"); registry.get(String.class)` | `Optional[hi]`, with no cast needed |
| Raw `put(Integer.class, "oops")` | `ClassCastException` at `put` |
| `put(int.class, 5)` | `IllegalArgumentException` |

## Expected output

```text title="Expected output" output="GenericUtils.java"
max(Set.of(3, 9, 4)) = 9
max of LocalDates = 2025-01-31
max by absolute value = -12
max with a Comparator<Number> = 7
max(empty) -> NoSuchElementException: max of an empty collection
copyAll into List<Number> -> [0.5, 5, -12, 7], into List<Object> -> [1.5, 2.5]
countMatches with Predicate<Object> = 3, with Predicate<CharSequence> = 2
pair Pair[first=ada, second=36], swap Pair[first=36, second=ada], withSecond Pair[first=ada, second=1815-12-10]
Pair.of(null, 1) -> NullPointerException: first
registry: hello 42 2025-03-01, missing Double -> Optional.empty
raw put(Integer.class, String) -> ClassCastException at insertion
put(int.class, 5) -> IllegalArgumentException: use the wrapper class instead of int
```

## Reference solution

````solution title="Reference solution (GenericUtils.java)"
```java title="GenericUtils.java" file="GenericUtils.java"
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.Predicate;

public final class GenericUtils {
    private GenericUtils() { }

    static <T extends Comparable<? super T>> T max(Collection<? extends T> items) {
        return max(items, Comparator.<T>naturalOrder());
    }

    static <T> T max(Collection<? extends T> items, Comparator<? super T> order) {
        Iterator<? extends T> it = items.iterator();
        if (!it.hasNext()) {
            throw new NoSuchElementException("max of an empty collection");
        }
        T best = it.next();
        while (it.hasNext()) {
            T next = it.next();
            if (order.compare(next, best) > 0) {
                best = next;
            }
        }
        return best;
    }

    static <T> void copyAll(List<? super T> dest, List<? extends T> src) {
        for (T item : src) {                     // read as T from the producer
            dest.add(item);                      // write a T into the consumer
        }
    }

    static <T> int countMatches(Iterable<? extends T> items, Predicate<? super T> test) {
        int count = 0;
        for (T item : items) {
            if (test.test(item)) {
                count++;
            }
        }
        return count;
    }

    record Pair<A, B>(A first, B second) {
        Pair {
            Objects.requireNonNull(first, "first");
            Objects.requireNonNull(second, "second");
        }

        static <A, B> Pair<A, B> of(A first, B second) {
            return new Pair<>(first, second);
        }

        Pair<B, A> swap() {
            return new Pair<>(second, first);
        }

        <C> Pair<A, C> withSecond(C newSecond) {
            return new Pair<>(first, newSecond);
        }
    }

    static final class TypedRegistry {
        private final Map<Class<?>, Object> values = new HashMap<>();

        <T> void put(Class<T> type, T value) {
            Objects.requireNonNull(type, "type");
            Objects.requireNonNull(value, "value");
            if (type.isPrimitive()) {
                throw new IllegalArgumentException("use the wrapper class instead of " + type);
            }
            values.put(type, type.cast(value));  // dynamic check: raw-typed callers fail here
        }

        <T> Optional<T> get(Class<T> type) {
            return Optional.ofNullable(values.get(type)).map(type::cast);
        }
    }

    @SuppressWarnings({ "unchecked", "rawtypes" })
    private static void rawPut(TypedRegistry registry) {
        registry.put((Class) Integer.class, "not an integer");   // what a raw-typed legacy caller could do
    }

    public static void main(String[] args) {
        System.out.println("max(Set.of(3, 9, 4)) = " + max(Set.of(3, 9, 4)));
        System.out.println("max of LocalDates = " + max(List.of(LocalDate.of(2024, 5, 1), LocalDate.of(2025, 1, 31))));
        List<Integer> ints = List.of(5, -12, 7);
        System.out.println("max by absolute value = " + max(ints, Comparator.comparingInt(Math::abs)));
        Comparator<Number> byDouble = Comparator.comparingDouble(Number::doubleValue);
        System.out.println("max with a Comparator<Number> = " + max(ints, byDouble));
        try {
            max(List.<String>of());
        } catch (NoSuchElementException e) {
            System.out.println("max(empty) -> NoSuchElementException: " + e.getMessage());
        }

        List<Number> numbers = new ArrayList<>(List.of(0.5));
        copyAll(numbers, ints);
        List<Object> objects = new ArrayList<>();
        copyAll(objects, List.of(1.5, 2.5));
        System.out.println("copyAll into List<Number> -> " + numbers + ", into List<Object> -> " + objects);

        Predicate<Object> notNull = Objects::nonNull;
        Predicate<CharSequence> longText = s -> s.length() > 3;
        List<String> words = List.of("java", "go", "kotlin");
        System.out.println("countMatches with Predicate<Object> = " + countMatches(words, notNull)
                + ", with Predicate<CharSequence> = " + countMatches(words, longText));

        Pair<String, Integer> pair = Pair.of("ada", 36);
        System.out.println("pair " + pair + ", swap " + pair.swap() + ", withSecond " + pair.withSecond(LocalDate.of(1815, 12, 10)));
        try {
            Pair.of(null, 1);
        } catch (NullPointerException e) {
            System.out.println("Pair.of(null, 1) -> NullPointerException: " + e.getMessage());
        }

        TypedRegistry registry = new TypedRegistry();
        registry.put(String.class, "hello");
        registry.put(Integer.class, 42);
        registry.put(LocalDate.class, LocalDate.of(2025, 3, 1));
        String s = registry.get(String.class).orElseThrow();        // no cast at the call site
        int n = registry.get(Integer.class).orElseThrow();
        System.out.println("registry: " + s + " " + n + " " + registry.get(LocalDate.class).orElseThrow()
                + ", missing Double -> " + registry.get(Double.class));
        try {
            rawPut(registry);
        } catch (ClassCastException e) {
            System.out.println("raw put(Integer.class, String) -> ClassCastException at insertion");
        }
        try {
            registry.put(int.class, 5);
        } catch (IllegalArgumentException e) {
            System.out.println("put(int.class, 5) -> IllegalArgumentException: " + e.getMessage());
        }
    }
}
```
````

## Step-by-step explanation

````solution title="Step-by-step explanation"
1. **`max` with a recursive bound.** `T extends Comparable<? super T>` means "T can be compared with T or with some supertype of T". `LocalDate` inherits `compareTo(ChronoLocalDate)`, so it satisfies `Comparable<? super LocalDate>` but not `Comparable<LocalDate>`. The parameter is `Collection<? extends T>` because the method only *reads* elements. The JDK's `Collections.max` additionally has `T extends Object & …`, so its erased return type is `Object`, for binary compatibility with pre-generics code.
2. **Delegate the natural order.** The natural-order version calls the comparator version with `Comparator.<T>naturalOrder()`, so there's one loop to test. An empty collection throws `NoSuchElementException`, matching the JDK's contract; returning `null` would push the problem to the caller.
3. **Comparators and predicates are consumers.** They *accept* `T`s, so `Comparator<? super T>` lets a `Comparator<Number>` order `Integer`s, and `Predicate<? super T>` lets a `Predicate<Object>` test `String`s. Without `? super`, perfectly reusable functions would be rejected.
4. **`copyAll` is PECS in its purest form.** `src` produces `T`s (`? extends T`); `dest` consumes them (`? super T`). Inside the loop, the element has the concrete type `T`: the compiler infers `T = Integer` for `copyAll(List<Number>, List<Integer>)`.
5. **`Pair`** is a generic record: immutable components, generated `equals`, `hashCode` and `toString`. The compact constructor validates, and `swap` and `withSecond` show how generic methods introduce **new type parameters** (`<C>`) that differ from the class's.
6. **`TypedRegistry` uses `Class<T>` as a type token.** The key's static type links `put` and `get`: `get(Integer.class)` returns `Optional<Integer>`. Erasure means a raw caller can bypass the compiler, so `put` checks with `type.cast(value)` at run time and fails fast **at the faulty call**, not later at an unrelated read. `get` uses `type::cast` instead of an unchecked `(T)` cast, so no warning needs suppressing.
7. **Primitive class objects** (`int.class`) have no instances, so `cast` would always fail. Rejecting them with a clear message beats a confusing `ClassCastException`.
````

## Edge cases

- **`max` with `null` elements**: natural ordering throws `NullPointerException`. Pass `Comparator.nullsFirst(...)` if nulls are expected.
- **Several equal maxima**: the first one wins, because the loop replaces only on a strictly greater element. Document it if callers care which object they get.
- **`copyAll(list, list)`**: iterating `src` while adding to the same list would throw `ConcurrentModificationException`. Copy `src` first if aliasing is possible.
- **Generic types as keys**: `TypedRegistry` can't distinguish `List<String>` from `List<Integer>` (one `List.class`). Super type tokens (`new TypeToken<List<String>>() {}`) work around erasure via `getGenericSuperclass()`.
- **Subclass lookups**: `put(Number.class, 1)` followed by `get(Integer.class)` finds nothing. Keys are exact classes.
- **Thread safety**: the registry isn't thread-safe. Use a `ConcurrentHashMap` if it's shared.

## JUnit tests

```java title="GenericUtilsTest.java" file="GenericUtilsTest.java" test="GenericUtils.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.Set;
import java.util.function.Predicate;
import org.junit.jupiter.api.Test;

class GenericUtilsTest {
    @Test
    void naturalMaxAcceptsComparableToSupertype() {
        assertEquals(9, GenericUtils.max(Set.of(3, 9, 4)));
        assertEquals(LocalDate.of(2025, 1, 31), GenericUtils.max(List.of(LocalDate.of(2024, 5, 1), LocalDate.of(2025, 1, 31))));
    }

    @Test
    void maxOfEmptyThrows() {
        assertThrows(NoSuchElementException.class, () -> GenericUtils.max(List.<Integer>of()));
        assertThrows(NoSuchElementException.class, () -> GenericUtils.max(List.<Integer>of(), Comparator.naturalOrder()));
    }

    @Test
    void maxWithSupertypeComparator() {
        Comparator<Number> byDouble = Comparator.comparingDouble(Number::doubleValue);
        assertEquals(7, GenericUtils.max(List.of(5, -12, 7), byDouble));
        assertEquals(-12, GenericUtils.max(List.of(5, -12, 7), Comparator.comparingInt(Math::abs)));
    }

    @Test
    void firstOfEqualMaximaWins() {
        String a = new String("x");
        String b = new String("x");
        assertSame(a, GenericUtils.max(List.of(a, b)));
    }

    @Test
    void copyAllIntoSupertypeLists() {
        List<Number> numbers = new ArrayList<>(List.of(0.5));
        GenericUtils.copyAll(numbers, List.of(1, 2));
        assertEquals(List.of(0.5, 1, 2), numbers);
        List<Object> objects = new ArrayList<>();
        GenericUtils.copyAll(objects, List.of("a", "b"));
        assertEquals(List.of("a", "b"), objects);
    }

    @Test
    void countMatchesWithSupertypePredicate() {
        Predicate<Object> any = o -> true;
        Predicate<CharSequence> longText = s -> s.length() > 3;
        List<String> words = List.of("java", "go", "kotlin");
        assertEquals(3, GenericUtils.countMatches(words, any));
        assertEquals(2, GenericUtils.countMatches(words, longText));
    }

    @Test
    void pairOperations() {
        GenericUtils.Pair<String, Integer> p = GenericUtils.Pair.of("a", 1);
        assertEquals(GenericUtils.Pair.of(1, "a"), p.swap());
        assertEquals(GenericUtils.Pair.of("a", 2.5), p.withSecond(2.5));
        assertThrows(NullPointerException.class, () -> GenericUtils.Pair.of(null, 1));
        assertThrows(NullPointerException.class, () -> GenericUtils.Pair.of(1, null));
    }

    @Test
    void registryIsTypeSafe() {
        GenericUtils.TypedRegistry r = new GenericUtils.TypedRegistry();
        r.put(String.class, "hello");
        r.put(Integer.class, 42);
        String s = r.get(String.class).orElseThrow();
        Integer i = r.get(Integer.class).orElseThrow();
        assertEquals("hello", s);
        assertEquals(42, i);
        assertEquals(Optional.empty(), r.get(Double.class));
        r.put(String.class, "replaced");
        assertEquals("replaced", r.get(String.class).orElseThrow());
    }

    @Test
    @SuppressWarnings({ "unchecked", "rawtypes" })
    void registryRejectsAbuse() {
        GenericUtils.TypedRegistry r = new GenericUtils.TypedRegistry();
        assertThrows(ClassCastException.class, () -> r.put((Class) Integer.class, "oops"));
        assertEquals(Optional.empty(), r.get(Integer.class));
        assertThrows(IllegalArgumentException.class, () -> r.put(int.class, 5));
        assertThrows(NullPointerException.class, () -> r.put(String.class, null));
    }
}
```
