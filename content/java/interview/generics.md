# Generics

### What is type erasure, and why did Java choose it?
`id: type-erasure` `level: intermediate` `kind: internals` `tricky` `lessons: type-erasure-and-restrictions,generics-basics`

#### Hints
1. Does `new ArrayList<String>().getClass()` differ from `new ArrayList<Integer>().getClass()`?
2. What existed before Java 5 that generics had to stay compatible with?

#### Answer
The compiler type-checks generic code and then **erases** type arguments: type parameters become their leftmost bound (`Object` by default), parameterised types become raw types, `javac` inserts casts where generic values are used, and generates **bridge methods** to preserve overriding. At run time `List<String>` and `List<Integer>` are the same class.

Java chose erasure for **migration compatibility**: existing collection classes became generic in place, generic code interoperates with pre-Java-5 binaries and raw types, and the JVM needed no changes.

Consequences: no `new T()`, no generic arrays, no `instanceof List<String>`, no primitive type arguments, no overloads differing only by type arguments — and possible **heap pollution** when unchecked warnings are ignored.

#### Why other answers fall short
- **"Generic type information doesn't exist at run time at all."** It's erased from *instances*, but declarations keep it in the class file's `Signature` attribute (reflection: `getGenericType()`, super type tokens).
- **"Erasure is for performance."** The motivation was compatibility; reified generics needn't be slower.

#### Follow-up
**How does Jackson know to build `List<Order>` from JSON then?** `new TypeReference<List<Order>>() {}` is an anonymous subclass; its generic superclass, readable by reflection, records `List<Order>`.

### Is `List<Integer>` a subtype of `List<Number>`?
`id: generics-invariance` `level: beginner` `kind: concept` `tricky` `lessons: bounded-types-and-wildcards`

#### Hints
1. If it were, what could you `add` through the `List<Number>` reference?
2. How do arrays behave in the same situation?

#### Answer
No. Generics are **invariant**. If `List<Integer>` were a `List<Number>`, you could do:

```java
List<Integer> ints = new ArrayList<>();
List<Number> nums = ints;    // suppose this compiled
nums.add(3.14);              // a Double inside a List<Integer>
Integer i = ints.get(0);     // ClassCastException
```

Arrays *are* covariant (`Integer[]` is a `Number[]`), so the JVM must check every array store and throws `ArrayStoreException`; generics catch the problem at compile time instead. To accept any list of numbers for reading, use `List<? extends Number>`; to write `Integer`s into any suitable list, `List<? super Integer>`.

#### Why other answers fall short
- **"Yes, because Integer extends Number."** Element subtyping doesn't carry over to the container type.
- **"No, because Lists are final."** Unrelated; `ArrayList<Integer>` *is* a `List<Integer>`.

#### Follow-up
**Is `ArrayList<Integer>` a `List<Integer>`?** Yes — subtyping of the generic *class* works when the type arguments are identical.

### `List<Object>` vs `List<?>` vs raw `List`
`id: list-object-vs-wildcard-vs-raw` `level: intermediate` `kind: concept` `tricky` `lessons: bounded-types-and-wildcards,generics-basics`

#### Hints
1. Which of the three can a `List<String>` be assigned to?
2. Which can you `add("x")` to, and with what checking?

#### Answer
| | Accepts a `List<String>`? | `add(anything)`? | Type-checked? |
|---|---|---|---|
| `List<Object>` | **no** (invariance) | yes, any object | yes |
| `List<?>` | yes | **only `null`** | yes — read as `Object` |
| raw `List` | yes | yes, anything | **no** (unchecked warnings, heap pollution risk) |

`List<?>` means "a list of some specific but unknown type" — safe for reading and for type-independent operations (`size`, `clear`, `contains`). Raw types exist only for pre-Java-5 compatibility.

#### Why other answers fall short
- **"`List<?>` is the same as `List<Object>`."** A `List<String>` is assignable to `List<?>` but not to `List<Object>`.
- **"Raw types are just shorter."** They switch off type checking for everything they touch.

#### Follow-up
**Can you write `new ArrayList<?>()`?** No — you can't instantiate with a wildcard; wildcards describe variables and parameters.

### Explain PECS with `Collections.copy`
`id: pecs` `level: intermediate` `kind: concept` `lessons: bounded-types-and-wildcards`

```java
public static <T> void copy(List<? super T> dest, List<? extends T> src)
```

#### Hints
1. Which list do you read from? Which do you write to?
2. What should be legal: copying `List<Integer>` into `List<Number>`, or the reverse?

#### Answer
**Producer Extends, Consumer Super.** `src` *produces* `T`s (you read from it) so it's `? extends T`: any list of `T` or a subtype works. `dest` *consumes* `T`s (you write into it) so it's `? super T`: any list that can hold a `T` works. That lets you copy a `List<Integer>` into a `List<Number>` or `List<Object>` — with `T = Integer`.

Rule of thumb: read-only parameter → `? extends T`; write-only → `? super T`; both → plain `T`. Comparators and consumers are consumers (`Comparator<? super T>`, `Consumer<? super T>`); functions are consumers of input and producers of output (`Function<? super T, ? extends R>`).

#### Why other answers fall short
- **"`? extends` for parameters, `? super` for return types."** It's about how the method uses the argument, and wildcards shouldn't appear in return types.
- **"Use `List<T>` for both."** Then copying `List<Integer>` into `List<Number>` wouldn't compile.

#### Follow-up
**Why is `Collections.max` declared as `<T extends Object & Comparable<? super T>> T max(Collection<? extends T> coll)`?** `? super T` admits classes that inherit `compareTo` from a superclass; `Object &` makes the erasure `Object max(Collection)`, the pre-generics signature (binary compatibility).

### Why doesn't this compile?
`id: erasure-name-clash` `level: intermediate` `kind: debugging` `tricky` `lessons: type-erasure-and-restrictions,methods`

```java
class Report {
    void export(List<String> lines) { }
    void export(List<Integer> numbers) { }
}
```

#### Hints
1. What do both parameter types erase to?
2. Can a class file contain two methods with the same name and descriptor?

#### Answer
Both methods erase to `export(List)` — the same signature in the class file — so `javac` reports *"name clash: export(List<Integer>) and export(List<String>) have the same erasure"*. Overloads must differ after erasure. Rename them (`exportLines`, `exportNumbers`), or use one generic method if the logic is the same.

#### Why other answers fall short
- **"Overloading on generic types is allowed because the types differ."** They differ only at compile time.
- **"It's ambiguous at the call site."** The error is at the declaration, even with no callers.

#### Follow-up
**Would `void export(List<String> l)` and `int export(List<Integer> l)` compile (different return types)?** No in `javac` today — the language forbids it (return types don't participate in overloading), even though the JVM descriptors would differ.

### How do you create an instance or an array of `T`?
`id: new-t-workarounds` `level: intermediate` `kind: implementation` `lessons: type-erasure-and-restrictions`

#### Hints
1. What run-time information does `new T()` need that erasure removes?
2. What can a caller pass you instead?

#### Answer
`new T()` and `new T[n]` don't compile — the JVM doesn't know `T`. Workarounds:

```java
static <T> T create(Supplier<T> factory) { return factory.get(); }                 // preferred: create(Order::new)
static <T> T create(Class<T> type) throws ReflectiveOperationException {
    return type.getDeclaredConstructor().newInstance();                            // type token
}
@SuppressWarnings("unchecked")
static <T> T[] newArray(Class<T> type, int n) { return (T[]) Array.newInstance(type, n); }
```

Inside a class that never exposes it, `ArrayList`-style `(T[]) new Object[n]` is acceptable; returning that array as `T[]` to callers causes `ClassCastException`. Usually a `List<T>` is the better choice than `T[]`.

#### Why other answers fall short
- **"Use `(T) new Object()`."** Compiles (unchecked) but the object isn't a `T` — heap pollution.
- **"Use reflection on `T`."** There is no `T` to reflect on at run time; you need a token.

#### Follow-up
**Why do APIs like `entityManager.find(Order.class, id)` take a `Class` argument?** For exactly this reason: erasure means the method can't learn `T` otherwise.

### What is a bridge method?
`id: bridge-methods` `level: advanced` `kind: internals` `lessons: type-erasure-and-restrictions,polymorphism-and-overriding`

#### Hints
1. What is the erased signature of `set(T value)` in `Node<T>`?
2. What is the signature of `set(Integer value)` in `IntNode extends Node<Integer>`?

#### Answer
A synthetic method the compiler generates so overriding keeps working after erasure. `Node<T>.set(T)` erases to `set(Object)`; `IntNode`'s override `set(Integer)` has a different erased signature, so a call through a `Node<Integer>` reference (which invokes `set(Object)`) wouldn't reach it. `javac` adds to `IntNode`:

```java
/* synthetic bridge */ void set(Object v) { set((Integer) v); }
```

Bridges are also generated for **covariant return types** (an override returning a subtype gets a bridge with the original return type). They're marked `ACC_BRIDGE`/`ACC_SYNTHETIC`; `Method.isBridge()` reveals them, and they appear in stack traces as an extra frame.

#### Why other answers fall short
- **"The JVM handles generic overriding natively."** The JVM knows nothing about type parameters; the compiler does it.
- **"Bridge methods connect inner and outer classes."** That was synthetic accessors (before Java 11 nestmates) — a different thing.

#### Follow-up
**Can a bridge method throw `ClassCastException`?** Yes — if heap pollution passes a non-`Integer` through a raw `Node`, the bridge's cast fails.

### Generic method or overloads?
`id: generic-method-vs-overloads` `level: intermediate` `kind: concept` `lessons: generics-basics,methods`

You need `firstNonNull` for `String`, `Integer` and `LocalDate`. Write three overloads or one generic method?

#### Hints
1. Does the logic depend on the type?
2. When are overloads chosen — compile time or run time?

#### Answer
If the logic is **identical** for all types, write one generic method:

```java
@SafeVarargs
static <T> T firstNonNull(T... values) {
    for (T v : values) if (v != null) return v;
    throw new NoSuchElementException("all values were null");
}
```

It works for any type, keeps one implementation, and the compiler infers `T`. Use **overloads** when behaviour genuinely differs by type (e.g. `print(int)` formatting numbers vs `print(String)` quoting) or for primitives to avoid boxing (`Math.max(int,int)`, `max(long,long)`, …). Remember both are resolved at **compile time** from static types; neither dispatches on the run-time class.

#### Why other answers fall short
- **"Overloads are faster."** Only for primitives (no boxing); for reference types a generic method costs the same.
- **"Generics choose the implementation at run time."** There's a single implementation; nothing is chosen at run time.

#### Follow-up
**What does `firstNonNull(1, "x")` infer for `T`?** An intersection type like `Serializable & Comparable<…>` — it compiles, but usually signals a bug; you can force a type with `Utils.<Object>firstNonNull(...)`.

### Write a correctly bounded `max`
`id: generic-max` `level: advanced` `kind: coding` `lessons: bounded-types-and-wildcards,comparable-vs-comparator`

Write a static `max` that returns the largest element of any non-empty collection whose elements are comparable — including `List<Apple>` where `Apple extends Fruit` and `Fruit implements Comparable<Fruit>`.

#### Hints
1. `<T extends Comparable<T>>` rejects `Apple`. Why?
2. What should the collection parameter be: `Collection<T>` or something more flexible?

#### Answer
```java
static <T extends Comparable<? super T>> T max(Collection<? extends T> items) {
    Iterator<? extends T> it = items.iterator();
    if (!it.hasNext()) throw new NoSuchElementException("empty collection");
    T best = it.next();
    while (it.hasNext()) {
        T candidate = it.next();
        if (candidate.compareTo(best) > 0) best = candidate;
    }
    return best;
}
```

`Comparable<? super T>` accepts types whose `compareTo` is inherited from a supertype (`Apple` is `Comparable<Fruit>`). `Collection<? extends T>` lets callers pass collections of subtypes. O(n), no sorting.

#### Why other answers fall short
- **`<T extends Comparable<T>>`** — `Apple` isn't `Comparable<Apple>`, so `max(apples)` fails to compile.
- **Sorting a copy and taking the last element** — O(n log n) and extra memory.
- **Returning `Object` or using raw `Comparable`** — loses type safety.

#### Follow-up
**Add an overload taking a `Comparator`.** `static <T> T max(Collection<? extends T> items, Comparator<? super T> cmp)` — the comparator is a consumer of `T`, hence `? super T`.
