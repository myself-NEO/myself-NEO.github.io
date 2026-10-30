## Concept explanation

### What it is

Java implements generics by **type erasure**: type arguments are checked by the compiler and then **removed**. At run time a `List<String>` and a `List<Integer>` are the same `ArrayList` class with the same bytecode; the JVM has no idea what `T` was.

The compiler's erasure rules:

1. Replace each type parameter with its **leftmost bound** (`T` → `Object`; `T extends Number & Comparable<T>` → `Number`).
2. Replace parameterised types with their **raw** type (`List<String>` → `List`).
3. **Insert casts** where erased values flow into specific types.
4. Generate **bridge methods** to keep overriding working after erasure.

### Why erasure?

**Migration compatibility.** Generics arrived in Java 5 when billions of lines of non-generic code and compiled libraries existed. With erasure, generic `List` is the same class as the old `List`: old binaries run unchanged, generic and raw code interoperate, and the JVM didn't need to change. (C# chose reified generics and created new collection classes instead.)

### What erasure costs you — the restrictions

| You can't… | Because… | Workaround |
|---|---|---|
| `new T()` | `T` is unknown at run time | pass a `Supplier<T>` or a `Class<T>` token |
| `new T[n]` / `new List<String>[n]` | arrays must know their exact element type at run time | `List<T>`, `Array.newInstance(type, n)`, or `(T[]) new Object[n]` internally |
| `x instanceof List<String>` | the type argument doesn't exist at run time | `instanceof List<?>` (Java 16 patterns allow `instanceof List<String> l` only when the static type already guarantees it) |
| `List<int>` | erasure targets `Object` | wrappers, primitive arrays/streams |
| `static T field` in `class Box<T>` | one static per class, shared by every `Box<X>` | a generic static method or an instance field |
| overload `f(List<String>)` and `f(List<Integer>)` | both erase to `f(List)` — a *name clash* | different method names |
| `class Pair implements Comparable<A>, Comparable<B>` | both erase to `Comparable` | one ordering, plus `Comparator`s |
| `class MyEx<T> extends Exception` / `catch (T e)` | the JVM's exception table matches erased classes | non-generic exception types carrying typed fields |
| reliably cast `(T) obj` | it's unchecked — no cast happens at that point | `Class<T>.cast(obj)` |

**Reifiable types** — types fully available at run time — are primitives, non-generic types, raw types, unbounded wildcards (`List<?>`) and arrays of those. Only reifiable types can be used with `instanceof` and as array element types.

### Heap pollution

**Heap pollution** happens when a variable of a parameterised type refers to an object that isn't of that type — usually after an unchecked cast, raw-type use, or generic varargs. The failure surfaces later, as a `ClassCastException` at an innocent-looking line with **no cast in the source**. Unchecked warnings are the compiler telling you heap pollution is possible.

**Generic varargs** (`static <T> List<T> listOf(T... items)`) create a `T[]` — really an `Object[]` — which can leak. If your method only reads the array, annotate it **`@SafeVarargs`** (allowed on `static`, `final` and `private` methods, and constructors) to promise safety and silence the warning. `List.of`, `Arrays.asList` and `EnumSet.of` do this.

### Bridge methods

```java
class Node<T> { void set(T value) { ... } }            // erases to set(Object)
class IntNode extends Node<Integer> {
    @Override void set(Integer value) { ... }           // erases to set(Integer): a DIFFERENT signature
}
```

To keep `node.set(...)` polymorphic through a `Node` reference, `javac` adds a **synthetic bridge** to `IntNode`: `void set(Object v) { set((Integer) v); }`. Bridges also implement **covariant return types**.

## Internal working

- **Signature attribute**: although instances forget their type arguments, **declarations** keep them as metadata. `Field.getGenericType()`, `Method.getGenericReturnType()` and `Class.getGenericSuperclass()` return `ParameterizedType`s. That's how frameworks recover types: Jackson's `new TypeReference<List<Order>>() {}` creates an anonymous **subclass** whose generic superclass records `List<Order>` (the "super type token" pattern), and Spring/Guice inspect field and constructor signatures for injection.
- **Casts**: `javac` inserts `checkcast` at the point where a generic value is assigned to a concrete type — **not** inside the generic code. That's why heap pollution blows up far from its cause.
- **Unchecked casts** like `(T) value` compile to nothing (or a cast to the erased bound); `(List<String>) obj` compiles to a cast to `List` only.
- **Bridge methods** are marked `ACC_BRIDGE | ACC_SYNTHETIC` in the class file; reflection exposes them via `Method.isBridge()`.
- **`ArrayList`** stores elements in an `Object[]`; `toArray(T[] a)` uses the array you pass to learn the run-time component type — exactly the `Class`/array-token workaround.
- **Project Valhalla** (future Java) aims to allow generics over primitive and value classes ("specialised generics") while keeping erasure for reference types.

## Visual representation

```text title="Erasure, cast insertion and a bridge method"
  source                                     bytecode (conceptually)
  ------------------------------------       ------------------------------------------
  class Node<T> {                            class Node {
      T value;                                   Object value;
      void set(T v) { value = v; }               void set(Object v) { value = v; }
      T get() { return value; }                  Object get() { return value; }
  }                                          }

  class IntNode extends Node<Integer> {      class IntNode extends Node {
      void set(Integer v) { ... }                void set(Integer v) { ... }
  }                                              /* bridge, synthetic */
                                                 void set(Object v) { set((Integer) v); }
                                             }

  Integer x = intNode.get();                 Integer x = (Integer) intNode.get();   <- checkcast here

  new ArrayList<String>().getClass() == new ArrayList<Integer>().getClass()   -> true
```

## Java code example

```java title="ErasureDemo.java" file="ErasureDemo.java"
import java.lang.reflect.Array;
import java.lang.reflect.Method;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.function.Supplier;

public class ErasureDemo {
    public static void main(String[] args) throws Exception {
        // 1. One class at run time
        System.out.println("same class: " + (new ArrayList<String>().getClass() == new ArrayList<Integer>().getClass()));

        // 2. instanceof works only with reifiable types
        Object o = List.of("a");
        System.out.println("instanceof List<?>: " + (o instanceof List<?>));

        // 3. Heap pollution: a raw view lets an Integer into a List<String>
        List<String> names = new ArrayList<>(List.of("ada"));
        pollute(names);
        System.out.println("size after pollution: " + names.size() + " (no error yet)");
        try {
            String second = names.get(1);                 // the inserted checkcast fails HERE
            System.out.println(second);
        } catch (ClassCastException e) {
            System.out.println("ClassCastException far from the cause: " + e.getMessage().split(" \\(")[0]);
        }

        // 4. Creating instances and arrays of T: pass a token or a factory
        StringBuilder sb = create(StringBuilder.class);
        sb.append("made reflectively");
        System.out.println(sb + " / " + createWith(ArrayList::new).getClass().getSimpleName());
        String[] typed = newArray(String.class, 3);
        System.out.println("typed array: " + typed.getClass().getSimpleName() + " length " + typed.length);

        // 5. Bridge methods generated by javac
        Method[] methods = IntNode.class.getDeclaredMethods();
        Arrays.sort(methods, java.util.Comparator.comparing(Method::isBridge));   // reflection order is unspecified
        for (Method m : methods) {
            System.out.println("IntNode." + m.getName() + "(" + m.getParameterTypes()[0].getSimpleName() + ") bridge=" + m.isBridge());
        }
        Node<Integer> node = new IntNode();
        node.set(5);                                      // calls the bridge set(Object), which calls set(Integer)
        System.out.println("through Node<Integer>: " + node.get());

        // 6. Declarations keep generic signatures: the super type token trick
        TypeToken<List<Integer>> token = new TypeToken<List<Integer>>() { };
        System.out.println("captured type: " + token.type());

        // 7. @SafeVarargs generic varargs
        System.out.println("listOf: " + listOf("x", "y") + ", unsafe toArray leaks: " + leaksArray());
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    static void pollute(List<String> list) {
        List raw = list;                                  // raw type: the compiler can't protect us
        raw.add(42);
    }

    static <T> T create(Class<T> type) throws Exception {
        return type.getDeclaredConstructor().newInstance();     // Class<T> token instead of new T()
    }

    static <T> T createWith(Supplier<T> factory) {
        return factory.get();                                   // usually the better option
    }

    @SuppressWarnings("unchecked")
    static <T> T[] newArray(Class<T> component, int length) {
        return (T[]) Array.newInstance(component, length);      // a real String[], not Object[]
    }

    @SafeVarargs
    static <T> List<T> listOf(T... items) {                     // only reads the array: safe
        List<T> result = new ArrayList<>(items.length);
        for (T item : items) {
            result.add(item);
        }
        return List.copyOf(result);
    }

    @SafeVarargs
    @SuppressWarnings("varargs")
    static <T> T[] unsafeToArray(T... items) {
        return items;                                           // leaks the T[] (really an Object[] at some call sites)
    }

    static <T> T[] pickTwo(T a, T b) {
        return unsafeToArray(a, b);                             // here T[] is created as Object[]
    }

    static String leaksArray() {
        try {
            String[] pair = pickTwo("a", "b");                  // checkcast Object[] -> String[] fails
            return "no error " + pair.length;
        } catch (ClassCastException e) {
            return "ClassCastException (Object[] is not String[])";
        }
    }
}

class Node<T> {
    private T value;

    void set(T value) {
        this.value = value;
    }

    T get() {
        return value;
    }
}

class IntNode extends Node<Integer> {
    @Override
    void set(Integer value) {
        super.set(value * 10);
    }
}

abstract class TypeToken<T> {
    Type type() {
        return ((ParameterizedType) getClass().getGenericSuperclass()).getActualTypeArguments()[0];
    }
}
```

## Output

```text title="Output" output="ErasureDemo.java"
same class: true
instanceof List<?>: true
size after pollution: 2 (no error yet)
ClassCastException far from the cause: class java.lang.Integer cannot be cast to class java.lang.String
made reflectively / ArrayList
typed array: String[] length 3
IntNode.set(Integer) bridge=false
IntNode.set(Object) bridge=true
through Node<Integer>: 50
captured type: java.util.List<java.lang.Integer>
listOf: [x, y], unsafe toArray leaks: ClassCastException (Object[] is not String[])
```

- `ArrayList<String>` and `ArrayList<Integer>` share one `Class` object.
- The raw view let an `Integer` into a `List<String>` without any error; the failure appeared later at `names.get(1)`, where `javac` had inserted a cast — classic heap pollution.
- `Class<T>` tokens, `Supplier<T>` factories and `Array.newInstance` replace the impossible `new T()` and `new T[n]`.
- `IntNode` contains a compiler-generated bridge `set(Object)`; calling through `Node<Integer>` reached the override (5 × 10 = 50). (Reflection returns methods in no particular order, so the demo sorts them.)
- The anonymous `TypeToken` subclass recorded `List<Integer>` in its generic superclass — erasure removes types from **instances**, not from **declarations**.
- `pickTwo` created its varargs array as `Object[]` (it only knew `T`), so returning it as `String[]` failed — why generic varargs that expose their array are unsafe.

## Real-world application

- **JSON and HTTP libraries** need run-time types for generic targets: Jackson `TypeReference<List<Order>>`, Gson `TypeToken`, Spring `ParameterizedTypeReference`, Retrofit return types — all built on the super-type-token trick.
- **DI containers** read generic field/constructor signatures to inject `Repository<Order>` vs `Repository<User>`.
- **Collections** internals use `Object[]` and unchecked casts (`ArrayList`, `HashMap`), and `toArray(new String[0])` to create correctly typed arrays.
- **API design**: methods accepting `Class<T>` (`entityManager.find(Order.class, id)`, `objectMapper.readValue(json, Order.class)`) exist because of erasure.

## Common mistakes

- **Ignoring unchecked warnings** and raw types, causing heap pollution.
- **Expecting `instanceof List<String>`** or `catch (T e)` to work.
- **Trying `new T()` or `new T[]`** instead of passing a `Class<T>` or `Supplier<T>`.
- **Overloads that differ only in type arguments** (`process(List<String>)` vs `process(List<Integer>)` — name clash).
- **`@SafeVarargs` on methods that store or return the varargs array.**
- **Assuming the JVM checks generic types at run time** (it only checks the erased types, at inserted casts).

## Interview questions

**Q1. What is type erasure and why did Java choose it?**

````reveal title="Answer"
The compiler type-checks generic code and then removes type arguments: type parameters become their leftmost bound (usually `Object`), parameterised types become raw types, casts are inserted where needed and bridge methods are generated. Java chose it for migration compatibility: generic and pre-generic code and binaries interoperate, existing collection classes became generic in place, and the JVM didn't need changes.
````

**Q2. Why can't you create a generic array like `new T[10]` or `new List<String>[10]`?**

````reveal title="Answer"
Arrays are reified and covariant: each array object knows its exact component type at run time and checks every store. With erasure, the JVM doesn't know `T` or `String` in `List<String>`, so it couldn't create the right array or perform correct store checks — allowing heap pollution. Use `List<T>`, `Array.newInstance(Class<T>, n)`, or (inside a class that never exposes it) `(T[]) new Object[n]`.
````

**Q3. What is a bridge method?**

````reveal title="Answer"
A synthetic method `javac` generates so that overriding still works after erasure. If `Node<T>` has `set(T)` (erased to `set(Object)`) and `IntNode extends Node<Integer>` overrides `set(Integer)`, their erased signatures differ, so the compiler adds `set(Object)` in `IntNode` that casts and calls `set(Integer)`. Bridges are also used for covariant return types. `Method.isBridge()` identifies them.
````

**Q4. What is heap pollution?**

````reveal title="Answer"
When a variable of a parameterised type refers to an object of a different parameterisation — e.g. a `List<String>` that contains an `Integer` after a raw-type or unchecked operation. Nothing fails at the polluting operation; a `ClassCastException` appears later where `javac` inserted a cast. Unchecked and rawtype warnings, and generic varargs warnings, signal the risk; `@SafeVarargs` asserts a varargs method doesn't cause it.
````

**Q5. If types are erased, how does Jackson deserialize JSON into `List<Order>`?**

````reveal title="Answer"
Erasure removes type arguments from objects, not from declarations. `new TypeReference<List<Order>>() {}` creates an anonymous subclass whose `getGenericSuperclass()` is the `ParameterizedType` `TypeReference<List<Order>>`; Jackson reads `List<Order>` from it via reflection. Field and method signatures can be read the same way.
````

## Hands-on exercise

Write a tiny type-safe heterogeneous container, `Settings`, that stores values of different types under typed keys:

- `<T> void put(Key<T> key, T value)` and `<T> T get(Key<T> key)`;
- `Key<T>` holds a name and a `Class<T>`;
- `get` must use `Class.cast` (no unchecked casts) so a polluted entry fails at `get`, not later.

Store a `Key<Integer>("timeout")` and a `Key<String>("region")`, read them back without casts at the call site, and show that putting a wrong type through a raw `Key` is detected at `get`.

````hint title="Hint"
Back it with `Map<Key<?>, Object>`. In `get`, `return key.type().cast(values.get(key));`. Make `Key` a record so it has value equality. To simulate misuse, cast the key to a raw `Key` and put the wrong value type.
````

````solution title="Solution"
```java title="SettingsDemo.java" file="SettingsDemo.java"
import java.util.HashMap;
import java.util.Map;

public class SettingsDemo {
    record Key<T>(String name, Class<T> type) { }

    static final class Settings {
        private final Map<Key<?>, Object> values = new HashMap<>();

        <T> void put(Key<T> key, T value) {
            values.put(key, key.type().cast(value));          // checks even raw callers
        }

        <T> T get(Key<T> key) {
            return key.type().cast(values.get(key));          // checked cast: no heap pollution
        }

        @SuppressWarnings({"rawtypes", "unchecked"})
        void sneakyPut(Key key, Object value) {
            values.put(key, value);                            // bypasses the typed API
        }
    }

    static final Key<Integer> TIMEOUT = new Key<>("timeout", Integer.class);
    static final Key<String> REGION = new Key<>("region", String.class);

    public static void main(String[] args) {
        Settings settings = new Settings();
        settings.put(TIMEOUT, 30);
        settings.put(REGION, "eu-west-1");
        int timeout = settings.get(TIMEOUT);                   // no cast at the call site
        String region = settings.get(REGION);
        System.out.println("timeout=" + timeout + ", region=" + region);

        settings.sneakyPut(TIMEOUT, "thirty");
        try {
            settings.get(TIMEOUT);
        } catch (ClassCastException e) {
            System.out.println("detected at get(): " + e.getMessage());
        }
    }
}
```

```text title="Output" output="SettingsDemo.java"
timeout=30, region=eu-west-1
detected at get(): Cannot cast java.lang.String to java.lang.Integer
```

`Class.cast` performs a real run-time check, unlike `(T) value`, which is erased and would let the wrong type escape further.
````

## Knowledge check

```quiz
? What does `T extends Number & Comparable<T>` erase to?
+ Number
- Comparable
- Object
> Type parameters erase to their leftmost bound.

? Which expression compiles?
+ obj instanceof List<?>
- obj instanceof List<String>
- new T()
> Only reifiable types work with instanceof.

? Why do `void f(List<String> l)` and `void f(List<Integer> l)` clash?
+ Both erase to f(List)
- Lists can't be overloaded
- String and Integer are both final
> Methods can't differ only in type arguments.

? Where does a ClassCastException from heap pollution usually appear?
+ Later, at a cast javac inserted where the value is used
- At the unchecked operation that caused it
- At class loading
> That's why unchecked warnings matter.

? What does javac generate so that an override with a more specific parameter type still overrides after erasure?
+ A synthetic bridge method
- A second class file
- A run-time type check of every call
> Method.isBridge() returns true for it.
```

## Key takeaways

- **Erasure**: type parameters → leftmost bound, parameterised types → raw types, **casts inserted**, **bridge methods** generated; one class at run time.
- Chosen for **compatibility** with pre-generics code and the JVM.
- Restrictions follow from it: no `new T()`, no generic arrays, no `instanceof List<String>`, no primitives, no generic exceptions, no erasure-clashing overloads.
- Workarounds: **`Class<T>` tokens**, **`Supplier<T>`**, `Array.newInstance`, **super type tokens** (declarations keep generic signatures).
- **Heap pollution** fails far from its cause — respect unchecked warnings; `@SafeVarargs` only for methods that don't leak the array.
