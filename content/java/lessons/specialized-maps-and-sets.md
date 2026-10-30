## Concept explanation

Beyond the general-purpose collections, `java.util` has specialised implementations that are dramatically better — or necessary — in specific situations.

### `EnumSet` and `EnumMap`

For **enum** elements/keys:

- **`EnumSet<E>`** is a set of enum constants stored as a **bit vector**: one bit per constant. `EnumSet.of(...)`, `noneOf`, `allOf`, `range(a, b)`, `complementOf(set)`, `copyOf(...)`.
- **`EnumMap<K, V>`** is a map stored as an **array indexed by `ordinal()`**.

Both iterate in **declaration order**, reject `null` keys/elements, and are far faster and smaller than `HashSet`/`HashMap` with enum keys. They're the type-safe replacement for `int` bit flags.

### `WeakHashMap`

A map whose **keys are held by weak references**: when a key is no longer strongly reachable anywhere else, the garbage collector may clear it and the map **drops the entry** automatically (on its next operation). Uses `equals`/`hashCode` like `HashMap`.

Useful for **attaching metadata to objects you don't own** without keeping them alive (a canonicalisation cache, per-`Class` or per-`Thread` data in frameworks). Caveats:

- Values are held **strongly**: if a value refers to its key, the key never becomes weakly reachable — a leak.
- Keys that are **interned or cached** (string literals, small `Integer`s, enum constants) are strongly reachable forever, so their entries never go away.
- Removal timing depends on the GC — never use it for correctness, only for memory.
- Not thread-safe.

### `IdentityHashMap`

A map that compares keys with **`==` instead of `equals`** and uses `System.identityHashCode` instead of `hashCode`. It deliberately violates the `Map` contract. Use cases: graph algorithms that must track **object identity** (serialization, deep copy, proxies — "have I already visited *this* object?"), even when objects are `equals` to each other. Implemented with **linear probing** in a single array (keys and values interleaved), no `Node` objects.

### `Hashtable`

The Java 1.0 hash map: every method `synchronized`, **no `null` keys or values**, legacy `Enumeration` methods. Replaced by `HashMap` (single-threaded) and `ConcurrentHashMap` (concurrent). `Properties` still extends it, which is why you see it in old code.

### Summary

| Class | Keys compared by | Thread-safe | Nulls | Special power |
|---|---|---|---|---|
| `EnumSet` / `EnumMap` | ordinal | no | no (keys) | bit vector / array: tiny and fast |
| `WeakHashMap` | `equals` | no | yes | entries vanish when keys become unreachable |
| `IdentityHashMap` | `==` | no | yes | identity semantics |
| `Hashtable` | `equals` | yes (coarse lock) | no | legacy |

## Internal working

- **`EnumSet`**: an abstract class with two implementations — `RegularEnumSet` (≤ 64 constants, one `long` field; `add` is `elements |= 1L << ordinal`, `contains` is a mask test) and `JumboEnumSet` (a `long[]`). Set operations (`addAll`, `retainAll`, `complementOf`) are bitwise OR/AND/NOT — a handful of instructions.
- **`EnumMap`**: `Object[] vals` of length `universe.length`; `put(k, v)` is `vals[k.ordinal()] = v` (with a sentinel for `null` values). No hashing, no nodes.
- **`WeakHashMap`**: each entry *is* a `WeakReference` to its key, registered with a `ReferenceQueue`. When the GC clears a key, the reference is enqueued; every public method first calls `expungeStaleEntries()`, which polls the queue and unlinks those entries. See [references and memory leaks](lesson:references-and-memory-leaks).
- **`IdentityHashMap`**: one `Object[]` with key at even index, value at odd index; collisions resolved by **linear probing** to the next pair; default expected size 32, table length a power of two; `null` keys stored as a sentinel.
- **`Hashtable`**: an array of `Entry` chains like pre-Java-8 `HashMap`, index computed as `(hash & 0x7FFFFFFF) % table.length` (it doesn't need power-of-two sizes), every public method `synchronized` on the map; grows to `2n + 1`.

## Visual representation

```text title="EnumSet bit vector and EnumMap array"
  enum Day { MON, TUE, WED, THU, FRI, SAT, SUN }        ordinals 0..6

  EnumSet.of(SAT, SUN)          bits:  SUN SAT FRI THU WED TUE MON
                                        1   1   0   0   0   0   0    = 0b1100000 (one long)
  contains(SAT):  (bits & (1L << 5)) != 0

  EnumMap<Day, Shift>           vals:  [MON][TUE][WED][THU][FRI][SAT][SUN]
                                         ^ put(MON, EARLY) writes vals[0]

  WeakHashMap entry:  WeakReference(key) --(GC clears)--> ReferenceQueue --> expunged on next call
  IdentityHashMap:    [k0][v0][k1][v1][k2][v2]...   linear probing, == comparison
```

## Java code example

```java title="SpecializedCollections.java" file="SpecializedCollections.java"
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.Hashtable;
import java.util.IdentityHashMap;
import java.util.Map;
import java.util.Set;
import java.util.WeakHashMap;

public class SpecializedCollections {
    enum Permission { READ, WRITE, DELETE, ADMIN }

    enum Day { MON, TUE, WED, THU, FRI, SAT, SUN }

    public static void main(String[] args) throws InterruptedException {
        // EnumSet: type-safe flags with set algebra
        Set<Permission> editor = EnumSet.of(Permission.READ, Permission.WRITE);
        Set<Permission> admin = EnumSet.allOf(Permission.class);
        Set<Permission> missing = EnumSet.complementOf(EnumSet.copyOf(editor));
        System.out.println("editor " + editor + ", missing " + missing + ", admin has DELETE: " + admin.contains(Permission.DELETE));
        System.out.println("weekdays " + EnumSet.range(Day.MON, Day.FRI));

        // EnumMap: array indexed by ordinal, iterates in declaration order
        Map<Day, Integer> hours = new EnumMap<>(Day.class);
        hours.put(Day.WED, 6);
        hours.put(Day.MON, 8);
        hours.put(Day.FRI, 4);
        System.out.println("EnumMap order: " + hours);

        // IdentityHashMap: == instead of equals
        String a = new String("key");
        String b = new String("key");
        Map<String, Integer> byEquals = new HashMap<>();
        Map<String, Integer> byIdentity = new IdentityHashMap<>();
        for (String k : new String[] {a, b}) {
            byEquals.merge(k, 1, Integer::sum);
            byIdentity.merge(k, 1, Integer::sum);
        }
        System.out.println("HashMap entries " + byEquals.size() + ", IdentityHashMap entries " + byIdentity.size());

        // WeakHashMap: entry disappears once the key is unreachable
        Map<Object, String> metadata = new WeakHashMap<>();
        Object session = new Object();
        metadata.put(session, "user=ada");
        metadata.put("literal", "never collected");      // interned literal: always strongly reachable
        System.out.println("before: " + metadata.size() + " entries");
        session = null;                                  // drop the only strong reference
        boolean cleared = false;
        for (int attempt = 0; attempt < 20 && !cleared; attempt++) {
            System.gc();
            Thread.sleep(50);
            cleared = metadata.size() == 1;
        }
        System.out.println("after GC: " + metadata.size() + " entry left, session entry cleared: " + cleared + ", remaining: " + metadata);

        // Hashtable: legacy, synchronized, no nulls
        Map<String, String> legacy = new Hashtable<>();
        try {
            legacy.put("k", null);
        } catch (NullPointerException e) {
            System.out.println("Hashtable rejects null values (and keys)");
        }
        try {
            new EnumMap<Day, String>(Day.class).put(null, "x");
        } catch (NullPointerException e) {
            System.out.println("EnumMap rejects null keys");
        }
    }
}
```

## Output

```text title="Output" output="SpecializedCollections.java"
editor [READ, WRITE], missing [DELETE, ADMIN], admin has DELETE: true
weekdays [MON, TUE, WED, THU, FRI]
EnumMap order: {MON=8, WED=6, FRI=4}
HashMap entries 1, IdentityHashMap entries 2
before: 2 entries
after GC: 1 entry left, session entry cleared: true, remaining: {literal=never collected}
Hashtable rejects null values (and keys)
EnumMap rejects null keys
```

- `EnumSet` gave set algebra over permissions with no strings or bit-twiddling in your code.
- `EnumMap` iterated in declaration order even though `WED` was inserted first.
- Two equal-but-distinct strings were one key for `HashMap` and two for `IdentityHashMap`.
- After the last strong reference to `session` was dropped and a GC ran, `WeakHashMap` removed its entry. The literal key stayed: string literals are interned and always reachable. (`System.gc()` is only a request; the loop retries a few times.)

## Real-world application

- **Permissions, feature flags, days of the week, states**: `EnumSet` stored in a single `long` — also serialisable and printable, unlike `int` masks. Many JDK APIs take `EnumSet`s (`Files.walk` options use `Set<FileVisitOption>`, `StandardOpenOption`s are passed as varargs of enums).
- **Per-state or per-type configuration**: `EnumMap<OrderStatus, Handler>` instead of a `switch`.
- **Frameworks and serialisers**: `IdentityHashMap` tracks visited objects (Java serialization, Jackson's object identity handling, deep-clone utilities, cycle detection).
- **Metadata caches keyed by classes or class loaders** use weak keys so redeployed applications can unload (`ClassValue` is often the better tool for per-class data).
- **Legacy code**: `Hashtable`, `Properties` and `Vector` appear in older APIs; replace them in new code.

## Common mistakes

- **Using `HashSet<MyEnum>`/`HashMap<MyEnum, V>`** where `EnumSet`/`EnumMap` is smaller and faster.
- **`WeakHashMap` with values that reference their keys** (entries never expire) or with literal/cached keys.
- **`WeakHashMap` as a cache** — entries vanish at the next GC, not by size or age; use `SoftReference`-based or library caches.
- **`IdentityHashMap` where value equality was intended** (duplicate "equal" keys).
- **Treating `Hashtable` as the thread-safe map** — compound actions still race and it's slower than `ConcurrentHashMap`.
- **Persisting `ordinal()`-based data** from `EnumMap` internals.

## Interview questions

**Q1. Why are `EnumSet` and `EnumMap` so fast?**

````reveal title="Answer"
The universe of keys is known and small, and each constant has a dense `ordinal()`. `EnumSet` stores membership as bits in a `long` (or `long[]`), so add/contains/remove and set operations are single bitwise instructions; `EnumMap` stores values in an array indexed by ordinal. No hashing, no node objects, no collisions, and iteration in declaration order.
````

**Q2. How does `WeakHashMap` work, and when would you use it?**

````reveal title="Answer"
Each entry holds its key through a `WeakReference` registered with a `ReferenceQueue`. When the key is no longer strongly reachable, the GC clears the reference and enqueues it; the map removes enqueued entries at the start of its next operation. Use it to associate data with objects whose lifecycle you don't control, without preventing their collection. Values are strong, so a value referencing its key prevents removal.
````

**Q3. When would you use `IdentityHashMap`?**

````reveal title="Answer"
When the question is "is this the same object?", not "is this an equal object?": tracking visited nodes while traversing an object graph (serialization, deep copying, proxies, cycle detection), or keying by objects whose `equals`/`hashCode` are expensive, mutable or misleading. It compares with `==` and uses identity hash codes, violating the general `Map` contract on purpose.
````

**Q4. `Hashtable` vs `HashMap` vs `ConcurrentHashMap`?**

````reveal title="Answer"
`Hashtable`: legacy, every method synchronised on one lock, no nulls. `HashMap`: unsynchronised, allows one null key and null values, fastest single-threaded. `ConcurrentHashMap`: thread-safe with fine-grained locking/CAS, lock-free reads, atomic compound operations (`compute`, `merge`), no nulls, weakly consistent iterators. Use `HashMap` or `ConcurrentHashMap`; `Hashtable` only for legacy APIs.
````

## Hands-on exercise

Model a role-based access check:

- `enum Permission { READ, WRITE, DELETE, SHARE, ADMIN }` and `enum Role { VIEWER, EDITOR, OWNER }`.
- An `EnumMap<Role, EnumSet<Permission>>` defining each role's permissions (OWNER has all).
- `boolean can(Set<Role> roles, Permission p)` and `EnumSet<Permission> effective(Set<Role> roles)` (union of the roles' permissions).

````hint title="Hint"
Start `effective` with `EnumSet.noneOf(Permission.class)` and `addAll` each role's set. `EnumSet.allOf(Permission.class)` gives the owner's permissions.
````

````solution title="Solution"
```java title="AccessControl.java" file="AccessControl.java"
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

public class AccessControl {
    enum Permission { READ, WRITE, DELETE, SHARE, ADMIN }

    enum Role { VIEWER, EDITOR, OWNER }

    private static final Map<Role, EnumSet<Permission>> GRANTS = new EnumMap<>(Role.class);

    static {
        GRANTS.put(Role.VIEWER, EnumSet.of(Permission.READ));
        GRANTS.put(Role.EDITOR, EnumSet.of(Permission.READ, Permission.WRITE, Permission.SHARE));
        GRANTS.put(Role.OWNER, EnumSet.allOf(Permission.class));
    }

    static EnumSet<Permission> effective(Set<Role> roles) {
        EnumSet<Permission> result = EnumSet.noneOf(Permission.class);
        for (Role r : roles) {
            result.addAll(GRANTS.get(r));                 // bitwise OR under the hood
        }
        return result;
    }

    static boolean can(Set<Role> roles, Permission p) {
        return effective(roles).contains(p);
    }

    public static void main(String[] args) {
        Set<Role> alice = EnumSet.of(Role.VIEWER, Role.EDITOR);
        System.out.println("alice: " + effective(alice));
        System.out.println("alice can DELETE? " + can(alice, Permission.DELETE) + ", owner can ADMIN? " + can(EnumSet.of(Role.OWNER), Permission.ADMIN));
    }
}
```

```text title="Output" output="AccessControl.java"
alice: [READ, WRITE, SHARE]
alice can DELETE? false, owner can ADMIN? true
```
````

## Knowledge check

```quiz
? How does a RegularEnumSet store its elements?
+ As bits in a single long
- In a hash table
- In a sorted array of names
> One bit per constant (up to 64 constants).

? In which order does an EnumMap iterate?
+ Enum declaration (ordinal) order
- Insertion order
- Unspecified
> It's an array indexed by ordinal.

? Why might a WeakHashMap entry never be removed?
+ Its value holds a strong reference to its key (or the key is interned/cached)
- WeakHashMap never removes entries
- The map is too small
> Values are strongly referenced by the map.

? IdentityHashMap compares keys using...
+ ==
- equals
- compareTo
> It uses reference equality and identity hash codes.

? Which map allows neither null keys nor null values?
+ Hashtable
- HashMap
- WeakHashMap
> ConcurrentHashMap also rejects nulls.
```

## Key takeaways

- **`EnumSet`** = bit vector, **`EnumMap`** = ordinal-indexed array: the fastest, smallest choice for enum keys; declaration-order iteration; no nulls.
- **`WeakHashMap`** drops entries whose keys become unreachable; values are strong; GC timing decides when.
- **`IdentityHashMap`** uses `==` and identity hashes — for object-graph bookkeeping, not normal lookups.
- **`Hashtable`** is legacy (synchronised, no nulls): use `HashMap` or `ConcurrentHashMap`.
