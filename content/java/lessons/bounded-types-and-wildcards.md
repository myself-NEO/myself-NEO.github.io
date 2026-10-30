## Concept explanation

### Bounded type parameters

A **bound** restricts which types a type parameter accepts — and in return lets you call the bound's methods:

```java
static <T extends Number> double sum(List<T> values) {     // T must be Number or a subclass
    double total = 0;
    for (T v : values) total += v.doubleValue();          // allowed: T is a Number
    return total;
}

static <T extends Comparable<? super T>> T max(List<T> items) { ... }   // T must be comparable
```

**Multiple bounds**: `<T extends Number & Comparable<T> & Serializable>` — at most **one class**, which must come **first**, then any number of interfaces.

### Generics are invariant

`Integer` is a subtype of `Number`, but **`List<Integer>` is not a subtype of `List<Number>`**. If it were, this would compile and corrupt the list:

```java
List<Integer> ints = new ArrayList<>();
List<Number> nums = ints;          // not allowed - imagine it were...
nums.add(3.14);                    // a Double inside a List<Integer>
Integer i = ints.get(0);           // ClassCastException
```

Arrays made exactly this mistake (they're **covariant**: `Integer[]` *is* a `Number[]`), which is why the JVM must check every array store and throw `ArrayStoreException` (see [arrays](lesson:arrays)). Generics catch it at compile time instead.

Subtyping still works on the **class** part: `ArrayList<String>` is a `List<String>` is a `Collection<String>`.

### Wildcards restore flexibility

| Wildcard | Reads as | Can add | Name | Use for |
|---|---|---|---|---|
| `List<?>` | `Object` | only `null` | unbounded | code that doesn't care about the element type (`size`, `clear`, printing) |
| `List<? extends Number>` | `Number` | only `null` | upper-bounded (covariant) | a **producer** you read `Number`s from |
| `List<? super Integer>` | `Object` | `Integer` (and subtypes) | lower-bounded (contravariant) | a **consumer** you write `Integer`s into |

`List<? extends Number>` accepts `List<Integer>`, `List<Double>`, `List<Number>`. `List<? super Integer>` accepts `List<Integer>`, `List<Number>`, `List<Object>`.

### PECS: Producer `extends`, Consumer `super`

From *Effective Java*: if a parameter **produces** values your method reads, use `? extends T`; if it **consumes** values your method writes, use `? super T`; if it does both, use exactly `T`.

```java
// Collections.copy: src produces T, dest consumes T
public static <T> void copy(List<? super T> dest, List<? extends T> src)

// Collections.max: the collection produces T; T's comparator consumes T (or a supertype)
public static <T extends Object & Comparable<? super T>> T max(Collection<? extends T> coll)
```

`Comparable<? super T>` matters when a class inherits its `compareTo` from a superclass: `class Apple extends Fruit implements Comparable<Fruit>` — `Apple` isn't `Comparable<Apple>`, but it is `Comparable<? super Apple>`.

### Wildcard or type parameter?

- If a type appears **once** in the signature (only in one parameter), a wildcard is simpler: `void printAll(Collection<?> c)`.
- If it links **several** parameters or the return type, use a type parameter: `<T> void swap(List<T> l, int i, int j)`, `<T> T first(List<T> l)`.
- **Don't return wildcard types** (`List<? extends Number> get()`): callers then have to deal with them.

### Generic inheritance

- `class IntBox extends Box<Integer>` fixes the type argument.
- `class SortedBox<T extends Comparable<T>> extends Box<T>` passes it through (with a tighter bound).
- `interface Repository<T, ID>` / `class OrderRepository implements Repository<Order, Long>`.

## Internal working

- **Bounds become the erasure**: `<T extends Number>` erases to `Number`, so `sum` compiles to code that calls `Number.doubleValue()` directly — no cast. `<T extends Number & Comparable<T>>` erases to the **first** bound (`Number`); calls to `compareTo` get a cast to `Comparable` inserted. That's why the class bound must come first, and why bound order can affect the erased signature.
- **Wildcards exist only at compile time.** `List<? extends Number>` and `List<Integer>` are both just `List` at run time.
- **Why you can't add to `? extends`**: the compiler only knows the list holds *some unknown subtype* of `Number` (it "captures" the wildcard as a fresh type `CAP#1 extends Number`). Adding a `Double` might violate a `List<Integer>`, so only `null` is allowed. Reading is safe: any `CAP#1` is a `Number`.
- **Why you can add to `? super`**: the list holds *some unknown supertype* of `Integer`; an `Integer` fits in any of them. Reading only guarantees `Object`.
- **Wildcard capture**: a helper method with a type parameter can name the captured type: `static void swap(List<?> l, int i, int j) { swapHelper(l, i, j); }` with `private static <T> void swapHelper(List<T> l, …)`.

## Visual representation

```text title="Subtyping with and without wildcards"
                     Object
                       |
                     Number
                   /       \
               Integer     Double

  Arrays (covariant):     Integer[]  is a  Number[]            (unsafe: checked at run time)
  Generics (invariant):   List<Integer> is NOT a List<Number>  (safe: checked at compile time)

  List<? extends Number>  <-- List<Integer>, List<Double>, List<Number>     read Number, add nothing
  List<? super Integer>   <-- List<Integer>, List<Number>, List<Object>     add Integer, read Object
  List<?>                 <-- any List                                       read Object, add nothing

  PECS:   copy(List<? super T> dest,  List<? extends T> src)
                    consumer               producer
```

## Java code example

```java title="WildcardsDemo.java" file="WildcardsDemo.java"
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

public class WildcardsDemo {
    // Upper bound on a type parameter: can call Number methods
    static <T extends Number> double sum(Collection<T> values) {
        double total = 0;
        for (T v : values) {
            total += v.doubleValue();
        }
        return total;
    }

    // Producer: read Numbers from any List of a Number subtype
    static double average(List<? extends Number> values) {
        return values.isEmpty() ? 0 : sum(new ArrayList<Number>(values)) / values.size();
    }

    // Consumer: write Integers into any List that can hold them
    static void addRange(List<? super Integer> target, int from, int to) {
        for (int i = from; i <= to; i++) {
            target.add(i);
        }
    }

    // PECS in one signature (same shape as Collections.copy)
    static <T> void copyInto(List<? super T> dest, List<? extends T> src) {
        for (T item : src) {
            dest.add(item);
        }
    }

    // Comparable<? super T>: works for classes that inherit compareTo from a superclass
    static <T extends Comparable<? super T>> T max(List<? extends T> items) {
        T best = items.get(0);
        for (T item : items) {
            if (item.compareTo(best) > 0) {
                best = item;
            }
        }
        return best;
    }

    // Multiple bounds: a class first, then interfaces
    static <T extends Number & Comparable<T>> T clampToMax(T value, T max) {
        return value.compareTo(max) > 0 ? max : value;
    }

    // Unbounded wildcard: we don't care about the element type
    static int countNulls(Collection<?> items) {
        int n = 0;
        for (Object o : items) {
            if (o == null) {
                n++;
            }
        }
        return n;
    }

    // Wildcard capture via a private generic helper
    static void swap(List<?> list, int i, int j) {
        swapHelper(list, i, j);
    }

    private static <T> void swapHelper(List<T> list, int i, int j) {
        T tmp = list.get(i);
        list.set(i, list.get(j));
        list.set(j, tmp);
    }

    public static void main(String[] args) {
        List<Integer> ints = List.of(1, 2, 3, 4);
        List<Double> doubles = List.of(1.5, 2.5);
        System.out.println("sum ints " + sum(ints) + ", average doubles " + average(doubles));

        List<Number> numbers = new ArrayList<>();
        List<Object> objects = new ArrayList<>();
        addRange(numbers, 1, 3);                     // List<Number> consumes Integers
        addRange(objects, 7, 8);                     // so does List<Object>
        copyInto(objects, doubles);                  // dest consumes, src produces
        System.out.println("numbers " + numbers + ", objects " + objects);

        List<Apple> apples = List.of(new Apple(120), new Apple(180), new Apple(150));
        System.out.println("heaviest apple: " + max(apples) + " (Apple is Comparable<Fruit>, not Comparable<Apple>)");
        System.out.println("clamp: " + clampToMax(15, 10) + ", " + clampToMax(2.5, 9.0));

        List<String> withNulls = new ArrayList<>(java.util.Arrays.asList("a", null, "b", null));
        System.out.println("nulls: " + countNulls(withNulls));
        swap(withNulls, 0, 2);
        System.out.println("after swap via wildcard capture: " + withNulls);

        // Invariance in action (these lines would not compile):
        // List<Number> bad = ints;                  // List<Integer> is not a List<Number>
        // List<? extends Number> ro = ints; ro.add(1);   // can't add to a producer
        List<? extends Number> readOnly = ints;
        Number first = readOnly.get(0);              // reading is fine
        System.out.println("read through ? extends: " + first);
    }
}

class Fruit implements Comparable<Fruit> {
    final int grams;

    Fruit(int grams) {
        this.grams = grams;
    }

    @Override
    public int compareTo(Fruit other) {
        return Integer.compare(grams, other.grams);
    }
}

class Apple extends Fruit {
    Apple(int grams) {
        super(grams);
    }

    @Override
    public String toString() {
        return "Apple(" + grams + "g)";
    }
}
```

## Output

```text title="Output" output="WildcardsDemo.java"
sum ints 10.0, average doubles 2.0
numbers [1, 2, 3], objects [7, 8, 1.5, 2.5]
heaviest apple: Apple(180g) (Apple is Comparable<Fruit>, not Comparable<Apple>)
clamp: 10, 2.5
nulls: 2
after swap via wildcard capture: [b, null, a, null]
read through ? extends: 1
```

- `average` accepted a `List<Double>` because its parameter is a producer (`? extends Number`).
- `addRange` wrote `Integer`s into both a `List<Number>` and a `List<Object>` because its parameter is a consumer (`? super Integer`).
- `max(apples)` compiled only because of `Comparable<? super T>`: `Apple` inherits `compareTo(Fruit)`. With `<T extends Comparable<T>>` it would be rejected.
- `clampToMax` worked for `Integer` and `Double`, both `Number & Comparable<self>`.
- `swap(List<?>)` couldn't call `set` directly on a `List<?>`, but the generic helper captured the unknown type.

## Real-world application

- **JDK signatures** read like PECS tutorials: `Collections.copy`, `Collections.max/min/sort`, `List.sort(Comparator<? super E>)`, `Stream.map(Function<? super T, ? extends R>)`, `Collectors.groupingBy`, `addAll(Collection<? extends E>)`, `forEach(Consumer<? super T>)`.
- **Library and framework APIs**: accepting `Collection<? extends Event>` lets callers pass `List<OrderEvent>`; event buses register `Handler<? super E>` so a handler for `DomainEvent` receives every subtype.
- **Comparators for class hierarchies**: `Comparator<? super T>` lets one `Comparator<Animal>` sort a `List<Dog>`.
- **Numeric utilities** (statistics, money, matrices) use `<T extends Number>` or `<T extends Comparable<? super T>>` bounds.

## Common mistakes

- **Expecting `List<Integer>` to be a `List<Number>`** (or `List<Object>`).
- **Trying to add to `List<? extends T>`** — it's read-only (except `null`).
- **Using `? super` and then expecting to read `T`** — you only get `Object`.
- **`<T extends Comparable<T>>`** where `Comparable<? super T>` is needed for subclasses.
- **Returning wildcard types** from APIs.
- **Using a wildcard where a type parameter is needed** to relate input and output (`List<?> reverse(List<?>)` loses the element type).
- **Putting an interface first in multiple bounds** (`<T extends Comparable<T> & Number>` doesn't compile).

## Interview questions

**Q1. Why is `List<Integer>` not a subtype of `List<Number>`?**

````reveal title="Answer"
Because generics are invariant to keep the heap safe. If it were a subtype, code holding a `List<Number>` reference could add a `Double` into what is really a `List<Integer>`, and a later `Integer i = ints.get(0)` would throw `ClassCastException`. Arrays allow this (they're covariant) and pay with run-time `ArrayStoreException` checks; generics reject it at compile time. Use `List<? extends Number>` to accept any list of numbers for reading.
````

**Q2. Explain PECS with an example.**

````reveal title="Answer"
Producer Extends, Consumer Super: a parameter you only read `T`s from should be `? extends T`; one you only write `T`s into should be `? super T`. `Collections.copy(List<? super T> dest, List<? extends T> src)` lets you copy a `List<Integer>` into a `List<Number>` — the source produces Integers (which are Numbers), the destination consumes them. If a parameter is both read and written, use plain `T`.
````

**Q3. Why does `Collections.max` declare `<T extends Object & Comparable<? super T>>`?**

````reveal title="Answer"
`Comparable<? super T>` allows types that inherit `compareTo` from a supertype (e.g. `java.sql.Timestamp` extends `Date`, which is `Comparable<Date>`). The `Object &` part is a backward-compatibility trick: the erasure of `T` is its first bound, so `max` erases to `Object max(Collection)` — the same signature it had before generics — instead of `Comparable max(Collection)`.
````

**Q4. What can you do with a `List<?>`?**

````reveal title="Answer"
Anything that doesn't depend on the element type: `size`, `isEmpty`, `clear`, `remove(Object)`, `contains`, iterate as `Object`, and `add(null)`. You can't add other elements because the compiler doesn't know the element type. `List<?>` differs from `List<Object>`: `List<String>` is assignable to `List<?>` but not to `List<Object>`.
````

**Q5. When would you use a bounded type parameter instead of a wildcard?**

````reveal title="Answer"
When the type must be referred to more than once — to relate parameters to each other or to the return type (`<T extends Comparable<? super T>> T max(List<? extends T>)` returns the same `T`), or to declare local variables of that type. Use a wildcard when the type appears only once and the method doesn't need to name it.
````

## Hands-on exercise

Write three utilities with the most flexible correct signatures:

1. `transferAll(source, target)` that moves every element from one collection to another (e.g. from a `List<Integer>` into a `Set<Number>`), returning how many were moved.
2. `firstGreaterThan(list, threshold)` returning the first element greater than `threshold`, working for a `List<Apple>` with an `Apple` threshold where `Apple` is `Comparable<Fruit>`.
3. `sumAll(collections)` that sums a `List` of collections of any numeric type, e.g. `List.of(List.of(1, 2), Set.of(2.5))`.

````hint title="Hint"
1: `<T> int transferAll(Collection<? extends T> source, Collection<? super T> target)`. 2: `<T extends Comparable<? super T>> Optional<T> firstGreaterThan(List<? extends T> list, T threshold)`. 3: `double sumAll(Collection<? extends Collection<? extends Number>> collections)`.
````

````solution title="Solution"
```java title="FlexibleSignatures.java" file="FlexibleSignatures.java"
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

public class FlexibleSignatures {
    static <T> int transferAll(Collection<? extends T> source, Collection<? super T> target) {
        int moved = 0;
        for (T item : source) {
            if (target.add(item)) {
                moved++;
            }
        }
        return moved;
    }

    static <T extends Comparable<? super T>> Optional<T> firstGreaterThan(List<? extends T> list, T threshold) {
        for (T item : list) {
            if (item.compareTo(threshold) > 0) {
                return Optional.of(item);
            }
        }
        return Optional.empty();
    }

    static double sumAll(Collection<? extends Collection<? extends Number>> collections) {
        double total = 0;
        for (Collection<? extends Number> c : collections) {
            for (Number n : c) {
                total += n.doubleValue();
            }
        }
        return total;
    }

    public static void main(String[] args) {
        Set<Number> numbers = new HashSet<>();
        System.out.println("moved " + transferAll(List.of(1, 2, 2, 3), numbers) + " -> " + new ArrayList<>(numbers));

        List<Apple> apples = List.of(new Apple(90), new Apple(140), new Apple(200));
        System.out.println("first heavier than 120g: " + firstGreaterThan(apples, new Apple(120)).orElse(null));

        List<Collection<? extends Number>> mixed = List.of(List.of(1, 2), Set.of(2.5));
        System.out.println("sum of all: " + sumAll(mixed));
    }
}

class Fruit implements Comparable<Fruit> {
    final int grams;

    Fruit(int grams) {
        this.grams = grams;
    }

    @Override
    public int compareTo(Fruit other) {
        return Integer.compare(grams, other.grams);
    }
}

class Apple extends Fruit {
    Apple(int grams) {
        super(grams);
    }

    @Override
    public String toString() {
        return "Apple(" + grams + "g)";
    }
}
```

```text title="Output" output="FlexibleSignatures.java"
moved 3 -> [1, 2, 3]
first heavier than 120g: Apple(140g)
sum of all: 5.5
```

`transferAll` counted 3, not 4: the target is a `Set`, so the duplicate `2` wasn't added.
````

## Knowledge check

```quiz
? Which can you pass to `void m(List<? extends Number> l)`?
+ List<Integer>, List<Double> or List<Number>
- Only List<Number>
- List<Object>
> ? extends Number accepts any list of a Number subtype.

? What can you add to a `List<? super Integer>`?
+ Integers (and null)
- Any Number
- Nothing
> Any supertype list of Integer can hold an Integer.

? According to PECS, a parameter you only read elements from should be declared as...
+ ? extends T
- ? super T
- T
> Producer extends, consumer super.

? Which multiple bound compiles?
+ <T extends Number & Comparable<T>>
- <T extends Comparable<T> & Number>
- <T extends Number, Comparable<T>>
> The class bound must come first, joined with &.

? Why is `Integer[]` assignable to `Number[]` but `List<Integer>` not to `List<Number>`?
+ Arrays are covariant (checked at run time); generics are invariant (checked at compile time)
- Arrays are faster
- Lists can't hold Integers
> Covariant arrays need ArrayStoreException checks.
```

## Key takeaways

- **Bounds** (`<T extends X>`) restrict type arguments and let you use the bound's methods; multiple bounds: **class first**, then interfaces.
- Generics are **invariant**: `List<Integer>` is not a `List<Number>` — unlike covariant arrays.
- **`? extends T`** = read-only producer; **`? super T`** = write-only consumer; **`?`** = don't care.
- **PECS**; use `Comparable<? super T>` / `Comparator<? super T>` for class hierarchies.
- Use **type parameters** to relate types across a signature, **wildcards** when a type appears once; don't return wildcards.
