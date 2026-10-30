## Concept explanation

### What it is

- **`equals(Object o)`** answers "do these two objects represent the same value?" `Object`'s default is identity (`this == o`).
- **`hashCode()`** returns an `int` used by hash-based collections (`HashMap`, `HashSet`, `ConcurrentHashMap`) to decide **which bucket** an object goes in.

### The `equals` contract (for non-null references)

1. **Reflexive:** `x.equals(x)` is true.
2. **Symmetric:** `x.equals(y)` ⇔ `y.equals(x)`.
3. **Transitive:** `x.equals(y)` and `y.equals(z)` ⇒ `x.equals(z)`.
4. **Consistent:** repeated calls return the same result while the objects don't change.
5. **Non-null:** `x.equals(null)` is false (and must not throw).

### The `hashCode` contract

1. **Equal objects must have equal hash codes**: `a.equals(b)` ⇒ `a.hashCode() == b.hashCode()`.
2. Consistent while the object doesn't change (within one run; it may differ between runs).
3. Unequal objects **may** collide — but good hash functions spread values to keep collisions rare.

### Why they must be overridden together

`HashMap.get(key)` first uses `key.hashCode()` to pick a bucket, **then** compares candidates with `equals`. If you override `equals` but not `hashCode`, two equal keys get different identity hashes, land in different buckets, and the lookup never even calls your `equals`. The map "loses" entries and a `HashSet` happily stores duplicates.

### Writing them correctly

```java
@Override
public boolean equals(Object o) {
    if (this == o) return true;                       // fast path
    if (!(o instanceof Money other)) return false;   // type check (pattern: Java 16+); handles null
    return amountCents == other.amountCents && currency.equals(other.currency);
}

@Override
public int hashCode() {
    return Objects.hash(amountCents, currency);      // or 31 * h + field, by hand
}
```

- Compare exactly the fields that define the value — the **same fields** in both methods.
- Use `==` for primitives (except `float`/`double`: use `Float.compare`/`Double.compare` to handle `NaN` and `-0.0`), `Objects.equals` for nullable references, `Arrays.equals` for arrays.
- Prefer `final` classes or **records** (which generate both methods from their components). For non-final classes choose deliberately between `getClass()` checks (strict, exact type) and `instanceof` (allows subclasses; risky if a subclass adds state).

### When to override them

For **value objects** whose identity doesn't matter: `Money`, `Email`, `Coordinate`, IDs, DTOs, keys of maps. **Don't** override them for entities whose identity *is* the point (a `Thread`, a connection, a mutable session), or base equality on a database ID that's `null` before the object is saved.

## Internal working

How `HashMap` uses the two methods (details in [HashMap internals](lesson:hashmap-internals)):

1. `h = key.hashCode()`, then **spread**: `h ^ (h >>> 16)` so high bits influence the index.
2. **Bucket index** = `(table.length - 1) & h` (the table length is a power of two).
3. Walk the bucket: for each node, compare the **stored hash first** (cheap int comparison), then `==`, then `equals`.

Consequences:

- A wrong `hashCode` breaks lookups **before** `equals` is ever called.
- A constant `hashCode` (`return 1;`) is *legal* but puts every key in one bucket: O(n) lookups (O(log n) after treeification if keys are `Comparable`).
- **Mutating a key** after insertion changes its hash; the entry stays in the bucket for the **old** hash, so neither `get` nor `remove` can find it — a memory leak.
- `String` caches its hash; your classes can too if they're immutable and hashing is expensive.

`Objects.hash(a, b, c)` allocates a varargs array and boxes primitives; for hot paths write `31 * Long.hashCode(amount) + currency.hashCode()` by hand. `31` is used because it's an odd prime, and `31 * h` compiles to `(h << 5) - h`.

## Visual representation

```text title="Why a missing hashCode breaks HashSet"
  set.add(new Point(1, 2))        identity hash 0x1a2b -> bucket 3
  set.contains(new Point(1, 2))   identity hash 0x7f00 -> bucket 9   (different object!)

  buckets:  0 [ ]  1 [ ]  2 [ ]  3 [Point(1,2)]  ...  9 [ ]  ...
                                       ^                   ^
                                stored here         searched here -> not found
  equals() is never called: the search is in the wrong bucket.

  With hashCode() = 31*x + y = 33:  both land in bucket (n-1) & spread(33)  -> found via equals()
```

## Java code example

```java title="EqualsHashCodeDemo.java" file="EqualsHashCodeDemo.java"
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public class EqualsHashCodeDemo {
    public static void main(String[] args) {
        // 1. equals without hashCode: duplicates in a HashSet
        Set<EqualsOnly> broken = new HashSet<>();
        broken.add(new EqualsOnly("ada"));
        broken.add(new EqualsOnly("ada"));
        System.out.println("equals only    -> set size " + broken.size() + ", contains: " + broken.contains(new EqualsOnly("ada")));

        // 2. both overridden correctly
        Set<Money> wallet = new HashSet<>();
        wallet.add(new Money(500, "EUR"));
        wallet.add(new Money(500, "EUR"));
        System.out.println("both overridden -> set size " + wallet.size() + ", contains: " + wallet.contains(new Money(500, "EUR")));

        // 3. a mutable key is lost after mutation
        Map<MutableKey, String> map = new HashMap<>();
        MutableKey key = new MutableKey("v1");
        map.put(key, "value");
        key.name = "v2";                                         // hash changes
        System.out.println("mutated key    -> get: " + map.get(key) + ", size still " + map.size()
                + ", found by scanning: " + map.containsValue("value"));

        // 4. symmetry broken by a subclass that adds state and uses instanceof
        ColoredPoint red = new ColoredPoint(1, 2, "red");
        Point plain = new Point(1, 2);
        System.out.println("symmetry       -> plain.equals(red) = " + plain.equals(red) + ", red.equals(plain) = " + red.equals(plain));

        // 5. records do it for you
        record Sku(String code, int size) { }
        System.out.println("record         -> " + new Sku("TSHIRT", 42).equals(new Sku("TSHIRT", 42))
                + ", same hash: " + (new Sku("TSHIRT", 42).hashCode() == new Sku("TSHIRT", 42).hashCode()));

        // 6. legal but terrible: constant hash
        System.out.println("constant hash  -> all keys share one bucket: " + (new Lazy(1).hashCode() == new Lazy(2).hashCode()));
    }
}

final class EqualsOnly {
    private final String name;

    EqualsOnly(String name) {
        this.name = name;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof EqualsOnly && ((EqualsOnly) o).name.equals(name);
    }
    // hashCode NOT overridden: identity hash differs per object
}

final class Money {
    private final long amountCents;
    private final String currency;

    Money(long amountCents, String currency) {
        this.amountCents = amountCents;
        this.currency = Objects.requireNonNull(currency);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof Money)) {
            return false;
        }
        Money other = (Money) o;
        return amountCents == other.amountCents && currency.equals(other.currency);
    }

    @Override
    public int hashCode() {
        return 31 * Long.hashCode(amountCents) + currency.hashCode();
    }
}

final class MutableKey {
    String name;

    MutableKey(String name) {
        this.name = name;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof MutableKey && ((MutableKey) o).name.equals(name);
    }

    @Override
    public int hashCode() {
        return name.hashCode();
    }
}

class Point {
    final int x;
    final int y;

    Point(int x, int y) {
        this.x = x;
        this.y = y;
    }

    @Override
    public boolean equals(Object o) {
        if (!(o instanceof Point)) {
            return false;
        }
        Point p = (Point) o;
        return x == p.x && y == p.y;
    }

    @Override
    public int hashCode() {
        return 31 * x + y;
    }
}

class ColoredPoint extends Point {
    final String color;

    ColoredPoint(int x, int y, String color) {
        super(x, y);
        this.color = color;
    }

    @Override
    public boolean equals(Object o) {                          // adds state -> breaks symmetry
        if (!(o instanceof ColoredPoint)) {
            return false;
        }
        return super.equals(o) && color.equals(((ColoredPoint) o).color);
    }

    @Override
    public int hashCode() {
        return 31 * super.hashCode() + color.hashCode();
    }
}

final class Lazy {
    private final int id;

    Lazy(int id) {
        this.id = id;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof Lazy && ((Lazy) o).id == id;
    }

    @Override
    public int hashCode() {
        return 1;                                              // satisfies the contract, ruins performance
    }
}
```

## Output

```text title="Output" output="EqualsHashCodeDemo.java"
equals only    -> set size 2, contains: false
both overridden -> set size 1, contains: true
mutated key    -> get: null, size still 1, found by scanning: true
symmetry       -> plain.equals(red) = true, red.equals(plain) = false
record         -> true, same hash: true
constant hash  -> all keys share one bucket: true
```

- With only `equals`, the set kept two "equal" objects and couldn't find a third: the identity hashes sent each to a different bucket. The compiler can catch this: `javac -Xlint:overrides` warns *"Class EqualsOnly overrides equals, but neither it nor any superclass overrides hashCode method"* — enable `-Xlint:all` in your builds.
- The mutated key is still in the map (`size` 1, the value is there) but unreachable by key — a leak.
- `ColoredPoint` broke **symmetry**: a plain point says it equals the coloured one, but not vice versa. Sets and maps can then behave inconsistently depending on insertion order. Fixes: make value classes `final`, use composition instead of extending (a `ColoredPoint` *has* a `Point`), or use `getClass()` checks.

## Real-world application

- **Map keys and set elements** everywhere: caches keyed by request parameters, de-duplication of events, grouping with `Collectors.groupingBy`.
- **JPA entities**: equality based on a generated ID breaks before the entity is persisted (ID is `null`) and changes after; common guidance is to use a natural business key or a UUID assigned at creation.
- **Testing**: `assertEquals(expected, actual)` uses `equals`; value classes with proper `equals` make assertions readable.
- **Lombok `@EqualsAndHashCode`, IDE generators and records** exist because hand-written versions are error-prone.

## Common mistakes

- Overriding `equals` **without** `hashCode` (or using different fields in each).
- **`equals(MyType o)`** — an overload, not an override; always use `@Override` and `Object` as the parameter type.
- **Mutable fields in `hashCode`** for objects stored in hash collections.
- `==` on `double` fields (NaN, -0.0) or on `String` fields.
- **Subclasses adding state** to a class that uses `instanceof` in `equals` (symmetry/transitivity break).
- `equals` that throws on `null` or on a different type instead of returning `false`.
- Including **lazy/derived or circular references** in `hashCode` (expensive or infinite recursion).

## Interview questions

**Q1. Why must `equals` and `hashCode` be overridden together?**

````reveal title="Answer"
Because of the contract: equal objects must have equal hash codes. Hash-based collections first use `hashCode` to choose a bucket and only then call `equals` on the entries in that bucket. If `equals` says two objects are equal but their hash codes differ (default identity hashes), they land in different buckets, so lookups fail and sets store duplicates. Overriding `hashCode` alone is harmless but pointless; overriding `equals` alone is a bug.
````

**Q2. Can two unequal objects have the same hash code? What happens in a `HashMap`?**

````reveal title="Answer"
Yes — that's a collision, and it's allowed (there are only 2³² hash values). The map stores both entries in the same bucket (a linked list, or a red-black tree once a bucket reaches 8 entries and the table has at least 64 buckets) and uses `equals` to tell them apart. Many collisions degrade performance, not correctness.
````

**Q3. What happens if you mutate an object after using it as a `HashMap` key?**

````reveal title="Answer"
If the mutation changes fields used by `hashCode`, the entry remains in the bucket for the old hash. `get`, `containsKey` and `remove` compute the new hash, search the wrong bucket, and fail — the entry is effectively lost but still occupies memory. Keys should be immutable (strings, records, value objects).
````

**Q4. `getClass()` or `instanceof` in `equals`?**

````reveal title="Answer"
`instanceof` is right for final classes and records, and for class hierarchies where subclasses don't add state relevant to equality (it also works with proxies/subclasses that add behaviour only). `getClass()` gives strict symmetry when subclasses may add state, at the cost of never equating a subclass instance with its parent (violating Liskov substitution for equality). Best answer: make value classes final, and prefer composition over extending value classes.
````

**Q5. Is `return 42;` a valid `hashCode`?**

````reveal title="Answer"
Valid per the contract (equal objects get equal hashes), but it sends every key to one bucket, turning `HashMap` operations into O(n) (or O(log n) after treeification for `Comparable` keys). A good hash spreads distinct values uniformly.
````

## Hands-on exercise

Write an immutable `GeoPoint(double lat, double lon)` value class (not a record) with a correct `equals`/`hashCode`:

- equal when both coordinates are equal using `Double.compare` semantics,
- `0.0` and `-0.0` considered different (as `Double.equals` does),
- usable as a `HashMap` key — test that `map.get(new GeoPoint(...))` finds an entry,
- and show that two `NaN` points are equal to each other (unlike `NaN == NaN`).

````hint title="Hint"
`Double.compare(a, b) == 0` treats `NaN` as equal to itself and distinguishes `0.0` from `-0.0`. For the hash, `Double.hashCode(lat)` is consistent with that definition.
````

````solution title="Solution"
```java title="GeoPointDemo.java" file="GeoPointDemo.java"
import java.util.HashMap;
import java.util.Map;

public class GeoPointDemo {
    public static void main(String[] args) {
        Map<GeoPoint, String> places = new HashMap<>();
        places.put(new GeoPoint(48.8584, 2.2945), "Eiffel Tower");
        System.out.println(places.get(new GeoPoint(48.8584, 2.2945)));
        System.out.println("0.0 vs -0.0 equal? " + new GeoPoint(0.0, 0.0).equals(new GeoPoint(-0.0, 0.0)));
        System.out.println("NaN points equal? " + new GeoPoint(Double.NaN, 1).equals(new GeoPoint(Double.NaN, 1))
                + " (while NaN == NaN is " + (Double.NaN == Double.NaN) + ")");
        System.out.println("equal to null? " + new GeoPoint(1, 1).equals(null));
    }
}

final class GeoPoint {
    private final double lat;
    private final double lon;

    GeoPoint(double lat, double lon) {
        this.lat = lat;
        this.lon = lon;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof GeoPoint)) {
            return false;                                   // also handles null
        }
        GeoPoint p = (GeoPoint) o;
        return Double.compare(lat, p.lat) == 0 && Double.compare(lon, p.lon) == 0;
    }

    @Override
    public int hashCode() {
        return 31 * Double.hashCode(lat) + Double.hashCode(lon);
    }

    @Override
    public String toString() {
        return "(" + lat + ", " + lon + ")";
    }
}
```

```text title="Output" output="GeoPointDemo.java"
Eiffel Tower
0.0 vs -0.0 equal? false
NaN points equal? true (while NaN == NaN is false)
equal to null? false
```
````

## Knowledge check

```quiz
? A class overrides equals but not hashCode. Two equal instances are added to a HashSet. Size?
- 1
+ Usually 2
- Compile error
> Different identity hashes put them in different buckets, so equals is never consulted.

? Which is required by the hashCode contract?
+ Equal objects must have equal hash codes
- Unequal objects must have different hash codes
- hashCode must be the same across JVM runs
> Collisions between unequal objects are allowed.

? `public boolean equals(Money other)` — what's wrong?
+ It overloads instead of overriding equals(Object)
- Nothing
- It must be static
> Collections call equals(Object); use @Override to catch this.

? A HashMap key's field (used in hashCode) is changed after put(). What does get(key) return?
+ Usually null
- The value
- It throws ConcurrentModificationException
> The entry sits in the bucket for the old hash.

? Which choice best avoids equals symmetry problems in a value class hierarchy?
+ Make value classes final and use composition instead of extending them
- Always call super.equals first
- Use == for all fields
> Subclasses that add state can't keep equals symmetric and transitive with instanceof.
```

## Key takeaways

- `equals`: reflexive, symmetric, transitive, consistent, `false` for `null`. `hashCode`: **equal ⇒ equal hashes**.
- Override **both, using the same fields**; use `@Override` with an `Object` parameter.
- Hash collections pick the **bucket by `hashCode`, then compare with `equals`** — a bad hash breaks or slows everything.
- Keys must be **immutable**; mutating a key loses the entry.
- Prefer **final classes or records** for value types; subclasses that add state break symmetry.
