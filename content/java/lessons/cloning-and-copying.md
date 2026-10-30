## Concept explanation

### What it is

**Copying** an object means creating a new object with the same state. The question is how deep the copy goes:

- **Shallow copy:** a new outer object whose fields hold the **same values** — for reference fields, the same referenced objects. Both copies share their mutable parts.
- **Deep copy:** a new outer object **and** new copies of every mutable object it owns, recursively, so the two copies are fully independent.

Java offers three ways:

1. **`Object.clone()` + `Cloneable`** — the original mechanism.
2. **Copy constructors** — `new Order(otherOrder)`.
3. **Copy (static factory) methods** — `Order.copyOf(otherOrder)`, `List.copyOf(list)`.

### How `clone()` works

- `Object.clone()` is `protected` and **native**: it allocates a new object of the same run-time class and copies every field bit-for-bit (a shallow copy) **without running any constructor**.
- It only works if the class implements the **marker interface `Cloneable`**; otherwise it throws `CloneNotSupportedException` (a checked exception).
- To make cloning public you override `clone()`, widen it to `public`, call `super.clone()`, cast, and then **deep-copy** mutable fields yourself.

### Why `Cloneable` is considered broken

- `Cloneable` has **no methods**; it changes the behaviour of a protected method in `Object`. You can't call `clone()` through the `Cloneable` type.
- It **bypasses constructors**, so invariants and validation in the constructor are skipped.
- It's incompatible with **`final` fields** that need deep copying (you can't reassign them after `super.clone()`).
- It throws a **checked exception** that's almost never meaningful.
- Subclasses inherit a shallow `clone` that silently shares mutable state.

*Effective Java* summarises it: don't implement `Cloneable` in new classes; provide a copy constructor or copy factory instead. (Arrays are the exception: `array.clone()` is public, typed, and fine for primitive arrays.)

### When to copy at all

- **Defensive copies** in constructors and getters of classes that store mutable inputs (see [encapsulation](lesson:access-modifiers-encapsulation)).
- **Snapshots** before mutation (undo, audit, optimistic concurrency).
- Prototype-based creation (the *Prototype* pattern) for objects that are expensive to set up.
- Best of all: make objects **immutable**, so they can be shared and never need copying.

## Internal working

- `super.clone()` → `Object.clone()` → a JVM intrinsic that checks `Cloneable`, allocates an object of exactly `getClass()`, and does a raw memory copy of the fields. The object header gets a fresh identity hash and lock state.
- Because no constructor runs, **`final` fields are copied as-is** and can't be fixed up afterwards (Java forbids assignment to final fields outside constructors), which is why deep cloning a class with final mutable fields needs reflection hacks — another reason to prefer copy constructors.
- **Array `clone()`** allocates a new array of the same type and length and copies the elements: deep for primitives, shallow for references (a 2D array's rows are shared).
- **Collections**: `new ArrayList<>(other)` copies the list structure (a new backing array) but shares the elements; `List.copyOf` returns an unmodifiable copy (or the same instance if the argument is already an immutable list).
- **Serialization round trips** (write + read an object graph) produce deep copies but are slow, fragile and a security risk; avoid them for copying.

## Visual representation

```text title="Shallow vs deep copy of an Order with a mutable list of lines"
   original                     shallow copy                  deep copy
   +------------+               +------------+                +------------+
   | Order      |               | Order      |                | Order      |
   | id "A1"    |               | id "A1"    |                | id "A1"    |
   | lines -----+--+    +-------+- lines     |                | lines --+  |
   +------------+  |    |       +------------+                +---------|--+
                   v    v                                               v
             +-----------------+                            +-----------------+
             | ArrayList       |  <- SHARED: adding a line  | ArrayList (new) |
             | [Line1, Line2]  |     to one shows in both   | [Line1', Line2']|
             +-----------------+                            +-----------------+
   (String "A1" can be shared safely: it's immutable)
```

## Java code example

```java title="CopyingDemo.java" file="CopyingDemo.java"
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class CopyingDemo {
    public static void main(String[] args) throws CloneNotSupportedException {
        // 1. Shallow clone shares mutable state
        ShallowOrder original = new ShallowOrder("A1");
        original.lines.add(new Line("pen", 2));
        ShallowOrder shallow = original.clone();
        shallow.lines.add(new Line("ink", 1));
        System.out.println("shallow: original sees " + original.lines.size() + " lines (shared list: " + (original.lines == shallow.lines) + ")");

        // 2. clone() skips the constructor
        int before = ShallowOrder.constructed;
        original.clone();
        System.out.println("constructor calls during clone(): " + (ShallowOrder.constructed - before));

        // 3. Copy constructor: deep, explicit, runs validation
        Order order = new Order("B7", List.of(new Line("book", 1)));
        Order copy = new Order(order);
        copy.addLine(new Line("bookmark", 3));
        System.out.println("copy constructor: original " + order + ", copy " + copy);

        // 4. Mutable elements need copying too
        MutableLine ml = new MutableLine("cable", 1);
        List<MutableLine> sharedElements = new ArrayList<>(List.of(ml));
        List<MutableLine> listCopy = new ArrayList<>(sharedElements);       // new list, same elements
        listCopy.get(0).qty = 99;
        System.out.println("new ArrayList<>(list) shares elements: original qty = " + sharedElements.get(0).qty);

        // 5. Arrays: clone() is fine for primitives, shallow for 2D
        int[] scores = {90, 80};
        int[] scoresCopy = scores.clone();
        scoresCopy[0] = 0;
        int[][] grid = {{1, 2}, {3, 4}};
        int[][] gridShallow = grid.clone();
        gridShallow[0][0] = 100;
        int[][] gridDeep = new int[grid.length][];
        for (int i = 0; i < grid.length; i++) {
            gridDeep[i] = grid[i].clone();
        }
        gridDeep[1][1] = -1;
        System.out.println("int[] clone independent: " + Arrays.toString(scores)
                + ", 2D shallow clone shares rows: " + Arrays.deepToString(grid));
    }
}

record Line(String sku, int qty) {                    // immutable: safe to share between copies
}

class MutableLine {
    final String sku;
    int qty;

    MutableLine(String sku, int qty) {
        this.sku = sku;
        this.qty = qty;
    }
}

class ShallowOrder implements Cloneable {
    static int constructed;
    final String id;
    List<Line> lines = new ArrayList<>();

    ShallowOrder(String id) {
        this.id = id;
        constructed++;
    }

    @Override
    public ShallowOrder clone() throws CloneNotSupportedException {
        return (ShallowOrder) super.clone();           // field-by-field copy: lines is shared
    }
}

final class Order {
    private final String id;
    private final List<Line> lines;

    Order(String id, List<Line> lines) {
        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException("id required");
        }
        this.id = id;
        this.lines = new ArrayList<>(lines);
    }

    /** Copy constructor: a new, independent list; Line is immutable so elements can be shared. */
    Order(Order other) {
        this(other.id, other.lines);
    }

    void addLine(Line line) {
        lines.add(line);
    }

    @Override
    public String toString() {
        return id + lines.stream().map(Line::sku).toList();
    }
}
```

## Output

```text title="Output" output="CopyingDemo.java"
shallow: original sees 2 lines (shared list: true)
constructor calls during clone(): 0
copy constructor: original B7[book], copy B7[book, bookmark]
new ArrayList<>(list) shares elements: original qty = 99
int[] clone independent: [90, 80], 2D shallow clone shares rows: [[100, 2], [3, 4]]
```

- The shallow clone and the original share one `lines` list.
- `clone()` created an object without running the constructor (and without its validation).
- The copy constructor delegates to the main constructor, so validation runs and the list is copied.
- Copying a list doesn't copy **mutable elements**: either copy them too or make them immutable (as `Line` is).
- The `int[]` clone is independent; the 2D clone shared its rows, so `grid[0][0]` became 100. The row-by-row deep copy (`gridDeep`) left `grid[1][1]` untouched.

## Real-world application

- **Defensive copying** in APIs: `java.time` types are immutable precisely so nobody needs to copy them, unlike the old `java.util.Date`, which every careful class had to copy on the way in and out.
- **Undo/redo and snapshots** in editors and workflow engines copy state before changes.
- **Copying DTOs to entities** is done with mappers (MapStruct) or explicit copy constructors, not `clone`.
- **The JDK** itself avoids `Cloneable` in new APIs; `ArrayList.clone()` exists for compatibility, while `new ArrayList<>(list)` and `List.copyOf` are the idioms.

## Common mistakes

- **Assuming `clone()` is deep.**
- **Forgetting to copy nested mutable objects** in a "deep" copy.
- **Implementing `Cloneable` in new code** instead of a copy constructor.
- **Copying immutable objects** (`new String(s)`, copying a `LocalDate`) — wasted work.
- **Copying with serialization** (slow, needs `Serializable` everywhere, security risk).
- **2D array `clone()`** treated as a full copy.

## Interview questions

**Q1. What is the difference between a shallow and a deep copy?**

````reveal title="Answer"
A shallow copy creates a new object whose reference fields point to the same objects as the original, so mutable sub-objects are shared. A deep copy also copies every mutable object reachable from the original (recursively), producing a fully independent graph. Immutable sub-objects (strings, records of immutables, `java.time` types) can safely be shared in both.
````

**Q2. Why is `Cloneable` considered a broken interface?**

````reveal title="Answer"
It declares no methods; it only changes the behaviour of `Object`'s protected `clone()`. Cloning bypasses constructors (skipping validation), produces shallow copies by default, conflicts with `final` fields, forces a checked `CloneNotSupportedException`, and can't be invoked through the interface type. Copy constructors or static copy factories are clearer and safer.
````

**Q3. Does `clone()` call the constructor?**

````reveal title="Answer"
No. `Object.clone()` allocates an object of the same class and copies its fields directly. No constructor or instance initialiser runs, which is why invariants enforced in constructors aren't re-checked for clones.
````

**Q4. How do you deep-copy an object graph that contains cycles?**

````reveal title="Answer"
Keep an identity map from original to copy (`IdentityHashMap<Object, Object>`): before copying a node, check whether it has already been copied and reuse that copy. This preserves sharing and terminates on cycles. Serialization does the same internally, but is too heavy for routine copying.
````

## Hands-on exercise

`Playlist` has a `String name`, a `List<Song>` and a `Map<String, Integer>` of play counts. `Song` is mutable (`title`, `rating`).

Write a **deep** copy constructor and prove with output that changing a song's rating, adding a song, or bumping a play count in the copy doesn't affect the original.

````hint title="Hint"
Copy the list by creating `new Song(s)` for every element (give `Song` its own copy constructor). Copy the map with `new HashMap<>(other.playCounts)` — `String` keys and `Integer` values are immutable, so a new map is enough.
````

````solution title="Solution"
```java title="PlaylistDemo.java" file="PlaylistDemo.java"
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class PlaylistDemo {
    public static void main(String[] args) {
        Playlist original = new Playlist("Focus");
        original.add(new Song("Weightless", 4));
        original.play("Weightless");

        Playlist copy = new Playlist(original);
        copy.songs().get(0).rating = 1;
        copy.add(new Song("Clair de Lune", 5));
        copy.play("Weightless");

        System.out.println("original: " + original);
        System.out.println("copy:     " + copy);
    }
}

class Song {
    final String title;
    int rating;

    Song(String title, int rating) {
        this.title = title;
        this.rating = rating;
    }

    Song(Song other) {                                   // copy constructor
        this(other.title, other.rating);
    }

    @Override
    public String toString() {
        return title + "*" + rating;
    }
}

final class Playlist {
    private final String name;
    private final List<Song> songs = new ArrayList<>();
    private final Map<String, Integer> playCounts = new HashMap<>();

    Playlist(String name) {
        this.name = name;
    }

    Playlist(Playlist other) {
        this.name = other.name;                          // immutable: share
        for (Song s : other.songs) {
            songs.add(new Song(s));                      // mutable: copy each element
        }
        playCounts.putAll(other.playCounts);             // immutable keys and values: new map is enough
    }

    void add(Song s) {
        songs.add(s);
    }

    void play(String title) {
        playCounts.merge(title, 1, Integer::sum);
    }

    List<Song> songs() {
        return songs;                                    // exposed for the demo only
    }

    @Override
    public String toString() {
        return name + " " + songs + " plays=" + playCounts;
    }
}
```

```text title="Output" output="PlaylistDemo.java"
original: Focus [Weightless*4] plays={Weightless=1}
copy:     Focus [Weightless*1, Clair de Lune*5] plays={Weightless=2}
```
````

## Knowledge check

```quiz
? What does Object.clone() produce by default?
+ A shallow, field-by-field copy, without running a constructor
- A deep copy
- A copy made by calling the no-arg constructor
> clone copies fields directly; references are shared.

? A class doesn't implement Cloneable and calls super.clone(). What happens?
+ CloneNotSupportedException
- A shallow copy is returned anyway
- Compile error
> Cloneable is a marker checked at run time.

? `int[][] b = a.clone();` then `b[0][0] = 9;` — does `a[0][0]` change?
+ Yes, rows are shared
- No
> Array clone is shallow for reference elements (the row arrays).

? Which is the recommended way to copy objects in new code?
+ A copy constructor or static copy factory
- Implementing Cloneable
- Serializing and deserializing
> Explicit, constructor-based copying keeps validation and is easy to make deep.
```

## Key takeaways

- **Shallow** copies share mutable sub-objects; **deep** copies duplicate them.
- `Object.clone()` is shallow, skips constructors and needs `Cloneable` — avoid it in new code (array `clone()` is fine).
- Prefer **copy constructors / copy factories**; copy every **mutable** part, share immutable ones.
- `new ArrayList<>(list)` copies the list, not its elements.
- The best copy is no copy: **make objects immutable**.
