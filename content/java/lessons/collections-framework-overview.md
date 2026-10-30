## Concept explanation

### What it is

The **Java Collections Framework** (`java.util`, Java 1.2+) is a set of **interfaces** describing kinds of containers, **implementations** of them, and **algorithms** (`Collections.sort`, `binarySearch`, `shuffle`) that work on any implementation.

Two separate hierarchies:

- **`Collection<E>`** — a group of elements: `List`, `Set`, `Queue`/`Deque` (and their sorted/navigable/sequenced variants).
- **`Map<K, V>`** — key → value associations. A `Map` is **not** a `Collection` (it doesn't hold single elements), but it offers collection *views*: `keySet()`, `values()`, `entrySet()`.

### What each interface promises

| Interface | Order | Duplicates | Access | Typical implementations |
|---|---|---|---|---|
| `List` | insertion/index order | allowed | by index, `get(i)` | `ArrayList`, `LinkedList` |
| `Set` | none (unless sorted/linked) | **no** (by `equals`) | membership, `contains` | `HashSet`, `LinkedHashSet`, `TreeSet`, `EnumSet` |
| `SortedSet` / `NavigableSet` | sorted by comparator | no | `first`, `floor`, `subSet` | `TreeSet`, `ConcurrentSkipListSet` |
| `Queue` | FIFO or priority | allowed | head: `offer`/`poll`/`peek` | `ArrayDeque`, `PriorityQueue`, `LinkedList` |
| `Deque` | both ends | allowed | `addFirst`/`pollLast`/`push`/`pop` | `ArrayDeque`, `LinkedList` |
| `Map` | none (unless sorted/linked) | keys unique | by key, `get(k)` | `HashMap`, `LinkedHashMap`, `TreeMap`, `EnumMap` |
| `SortedMap` / `NavigableMap` | sorted keys | keys unique | `floorKey`, `headMap` | `TreeMap`, `ConcurrentSkipListMap` |

Java 21 added **`SequencedCollection`**, **`SequencedSet`** and **`SequencedMap`** above the ordered types, with uniform `getFirst()`, `getLast()`, `reversed()` (see [Java 21 → 25 features](lesson:java-21-to-25-features)).

### `Iterable` and `Iterator`

`Collection` extends **`Iterable<E>`**, whose single method `iterator()` returns an **`Iterator<E>`** (`hasNext()`, `next()`, optional `remove()`). Anything `Iterable` works in an enhanced `for` loop and has `forEach`. Iteration details are in [iterators](lesson:iterators-and-fail-fast).

### Why it exists

Before Java 1.2 there were only `Vector`, `Hashtable` and arrays, each with its own API. A common set of interfaces means:

- **Program to the interface**: `List<Order> orders = new ArrayList<>();` — swap the implementation later without touching callers.
- **Reusable algorithms**: `Collections.sort(list)` works on every `List`.
- **Interoperability**: libraries exchange `List`, `Map`, `Collection`, not custom containers.

### Optional operations, unmodifiable and immutable collections

Some methods are **optional**: an implementation may throw `UnsupportedOperationException` (`add` on `List.of(...)`, on `Arrays.asList(...)`, or on an unmodifiable view). Three flavours of "read-only":

| Kind | Example | Can it change? |
|---|---|---|
| unmodifiable **view** | `Collections.unmodifiableList(list)` | yes, if the underlying list changes |
| unmodifiable **copy** (immutable) | `List.of(...)`, `List.copyOf(...)`, `stream.toList()` | never; rejects `null` (except `toList`) |
| fixed-size | `Arrays.asList(array)` | `set` allowed, `add`/`remove` not |

### When to use which (quick guide)

Need order + index → `ArrayList`. Uniqueness → `HashSet` (or `LinkedHashSet` to keep insertion order, `TreeSet` for sorted). Key lookup → `HashMap` (`LinkedHashMap`/`TreeMap` for ordering). FIFO/LIFO → `ArrayDeque`. "Smallest first" → `PriorityQueue`. Threads → `ConcurrentHashMap`, `BlockingQueue`. The full decision guide is in [choosing the right collection](lesson:choosing-the-right-collection).

## Internal working

- **Skeletal implementations**: `AbstractCollection`, `AbstractList`, `AbstractSet`, `AbstractMap` implement most methods in terms of a few abstract ones (`iterator()` and `size()` for a collection; `get` and `size` for a random-access list). The concrete classes override what they can do faster.
- **Generics are erased**: a `List<String>` and a `List<Integer>` are the same `ArrayList` class at run time; the compiler inserts casts on reads. Collections hold **references only** — primitives are boxed (`List<Integer>`), which costs memory (see [wrapper classes](lesson:wrapper-classes-autoboxing)).
- **Marker interfaces** guide algorithms: `RandomAccess` (implemented by `ArrayList`, not `LinkedList`) tells `Collections.binarySearch` and others to use index loops instead of iterators.
- **Equality** is defined by interface, not implementation: any two `List`s with equal elements in the same order are `equals`; any two `Set`s with the same elements are equal; `Map`s with the same mappings are equal. Hash-based types rely on elements' `equals`/`hashCode`; sorted types rely on `compareTo`/`Comparator` (see [Comparable vs Comparator](lesson:comparable-vs-comparator)).
- **Thread safety**: the general-purpose implementations (`ArrayList`, `HashMap`, `TreeMap`…) are **not thread-safe**. Options: confinement, `Collections.synchronizedX` wrappers, or `java.util.concurrent` collections.
- **Views** (`subList`, `keySet`, `entrySet`, `values`, `headMap`) are backed by the original: changes go both ways.

## Visual representation

```text title="The two hierarchies (main types)"
                     Iterable<E>
                         |
                   Collection<E>                                   Map<K,V>
        +----------------+------------------+                 +------+--------------+
        |                |                  |                 |                     |
     List<E>           Set<E>            Queue<E>          HashMap          SortedMap
   (Sequenced)           |                  |                 |                 |
     |    |        +-----+------+       Deque<E>       LinkedHashMap      NavigableMap
 ArrayList |    HashSet    SortedSet      |     \       (Sequenced)            |
   LinkedList   |          |         ArrayDeque  PriorityQueue              TreeMap
           LinkedHashSet NavigableSet LinkedList
           (Sequenced)     |
                        TreeSet          EnumSet, EnumMap, WeakHashMap, IdentityHashMap,
                                         ConcurrentHashMap, CopyOnWriteArrayList, BlockingQueue ...
```

## Java code example

```java title="CollectionsOverview.java" file="CollectionsOverview.java"
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.Queue;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

public class CollectionsOverview {
    public static void main(String[] args) {
        // Program to interfaces: implementations are interchangeable
        List<String> tags = new ArrayList<>(List.of("java", "jvm", "java", "gc"));
        Set<String> unique = new LinkedHashSet<>(tags);              // keeps first-seen order
        Set<String> sorted = new TreeSet<>(tags);
        System.out.println("list " + tags + " | set " + unique + " | sorted " + sorted);

        Queue<Integer> fifo = new ArrayDeque<>(List.of(3, 1, 2));
        Queue<Integer> byPriority = new PriorityQueue<>(List.of(3, 1, 2));
        Deque<Integer> stack = new ArrayDeque<>();
        stack.push(1);
        stack.push(2);
        stack.push(3);
        System.out.println("fifo poll " + fifo.poll() + ", priority poll " + byPriority.poll() + ", stack pop " + stack.pop());

        Map<String, Integer> counts = new HashMap<>();
        for (String t : tags) {
            counts.merge(t, 1, Integer::sum);
        }
        System.out.println("counts (sorted view) " + new TreeMap<>(counts));

        // Equality is defined by the interface, not the implementation
        System.out.println("ArrayList equals LinkedList with same elements: " + new ArrayList<>(tags).equals(new LinkedList<>(tags)));
        System.out.println("HashSet equals TreeSet with same elements: " + new java.util.HashSet<>(tags).equals(sorted));

        // One algorithm for every Collection
        System.out.println("frequency of java: " + Collections.frequency(tags, "java") + ", max: " + Collections.max(tags));
        printAll(unique);
        printAll(fifo);

        // Unmodifiable view vs immutable copy vs fixed-size
        List<String> backing = new ArrayList<>(List.of("a"));
        List<String> view = Collections.unmodifiableList(backing);
        List<String> copy = List.copyOf(backing);
        List<String> fixed = Arrays.asList("x", "y");
        backing.add("b");
        fixed.set(0, "z");
        System.out.println("view " + view + ", copy " + copy + ", fixed " + fixed);
        for (Runnable attempt : List.<Runnable>of(() -> view.add("c"), () -> copy.add("c"), () -> fixed.add("c"))) {
            try {
                attempt.run();
            } catch (UnsupportedOperationException e) {
                System.out.print("UOE ");
            }
        }
        System.out.println();
        try {
            List.of("a", null);
        } catch (NullPointerException e) {
            System.out.println("List.of rejects null elements");
        }

        // Map is not a Collection, but offers collection views backed by the map
        Map<String, Integer> stock = new HashMap<>(Map.of("pen", 3, "ink", 0));
        stock.values().removeIf(q -> q == 0);                          // removes the mapping through the view
        System.out.println("stock after removing zero quantities via values(): " + stock);
    }

    static void printAll(Collection<?> items) {                        // works for any Collection
        System.out.println(items.getClass().getSimpleName() + " has " + items.size() + " items: " + items);
    }
}
```

## Output

```text title="Output" output="CollectionsOverview.java"
list [java, jvm, java, gc] | set [java, jvm, gc] | sorted [gc, java, jvm]
fifo poll 3, priority poll 1, stack pop 3
counts (sorted view) {gc=1, java=2, jvm=1}
ArrayList equals LinkedList with same elements: true
HashSet equals TreeSet with same elements: true
frequency of java: 2, max: jvm
LinkedHashSet has 3 items: [java, jvm, gc]
ArrayDeque has 2 items: [1, 2]
view [a, b], copy [a], fixed [z, y]
UOE UOE UOE 
List.of rejects null elements
stock after removing zero quantities via values(): {pen=3}
```

- The same four tags behave differently in a `List` (keeps duplicates), `LinkedHashSet` (unique, insertion order) and `TreeSet` (unique, sorted).
- `ArrayDeque` used as a queue polled `3` (first in); `PriorityQueue` polled the smallest; as a stack it popped the last pushed.
- Lists are equal across implementations, as are sets — equality is part of the interface contract.
- The view reflected the later `add("b")`; the copy didn't; `Arrays.asList` allowed `set` but not `add`.
- Removing through `values()` removed the whole mapping: views write through to the map.

## Real-world application

- **Service code** passes `List`, `Set` and `Map` interfaces across layers; DTOs expose `List.copyOf(...)` so callers can't mutate them.
- **Caches** are `Map`s (`ConcurrentHashMap`, `LinkedHashMap` for LRU, Caffeine underneath); **de-duplication** uses `Set`s; **work queues** use `Queue`/`BlockingQueue`.
- **Frameworks** return collections from repositories (Spring Data returns `List`/`Page`), and serialise them to JSON arrays and objects.
- **Coding interviews** expect instant recall of which collection gives O(1) lookup, ordering, or uniqueness — see [the coding-round toolkit](lesson:coding-round-toolkit).

## Common mistakes

- **Declaring concrete types** everywhere (`ArrayList<String> list = …` in signatures), making changes ripple.
- **Assuming `HashSet`/`HashMap` iteration order** is stable or meaningful.
- **Modifying a collection while iterating** it with a for-each loop (`ConcurrentModificationException`).
- **Mutating "read-only" results** from `List.of`, `Arrays.asList`, `Collections.unmodifiable*`, `stream.toList()`.
- **Forgetting views are live**: `subList`, `keySet`, `values`.
- **Using `Vector`, `Hashtable` or `Stack`** in new code.
- **Primitive-heavy data in `List<Integer>`** when an `int[]` would use a fraction of the memory.

## Interview questions

**Q1. Why doesn't `Map` extend `Collection`?**

````reveal title="Answer"
A `Collection` is a group of single elements with methods like `add(E)`; a `Map` holds key–value pairs and is accessed by key. Forcing `Map` into `Collection` would make `add` ambiguous (add a key? a pair?). Instead, `Map` exposes three collection views — `keySet()`, `values()`, `entrySet()` — which are backed by the map.
````

**Q2. What is the difference between `Collection` and `Collections`?**

````reveal title="Answer"
`Collection` is the root interface of the element-holding hierarchy. `Collections` is a utility class of static methods: algorithms (`sort`, `binarySearch`, `shuffle`, `frequency`, `max`), wrappers (`unmodifiableList`, `synchronizedMap`, `checkedList`) and factories (`emptyList`, `singletonList`, `nCopies`).
````

**Q3. What's the difference between `Collections.unmodifiableList(list)` and `List.copyOf(list)`?**

````reveal title="Answer"
`unmodifiableList` is a read-only **view** of the original: if the original changes, the view shows it. `List.copyOf` returns an **immutable snapshot** independent of the source (and rejects `null`s). Use `copyOf` for defensive copies; use the view when you deliberately want to expose live state read-only.
````

**Q4. Which collections allow `null`?**

````reveal title="Answer"
`ArrayList`, `LinkedList`, `HashSet`, `LinkedHashSet` and `HashMap`/`LinkedHashMap` (one null key, many null values) do. `TreeMap`/`TreeSet` reject null keys with natural ordering (`compareTo` on null). `ArrayDeque`, `PriorityQueue`, `ConcurrentHashMap`, `Hashtable`, `EnumSet`/`EnumMap` keys and the immutable factories (`List.of`, `Map.of`) reject nulls — often because `null` is used as a "not found / empty" signal by their APIs (`poll()`, `get()`).
````

## Hands-on exercise

Given a list of page visits `List<String> visits` such as `["home", "cart", "home", "search", "cart", "home"]`, write one method per question, each using the most appropriate collection:

1. The distinct pages in first-visit order.
2. The distinct pages in alphabetical order.
3. Visit counts per page, printed alphabetically.
4. The last three visits, most recent first (use a `Deque`).

````hint title="Hint"
`LinkedHashSet` keeps insertion order, `TreeSet` sorts, `TreeMap` + `merge` counts in sorted key order, and `ArrayDeque.addFirst` with a size cap keeps the latest N.
````

````solution title="Solution"
```java title="VisitStats.java" file="VisitStats.java"
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

public class VisitStats {
    public static void main(String[] args) {
        List<String> visits = List.of("home", "cart", "home", "search", "cart", "home");
        System.out.println("first-visit order: " + new LinkedHashSet<>(visits));
        System.out.println("alphabetical:      " + new TreeSet<>(visits));
        System.out.println("counts:            " + counts(visits));
        System.out.println("last three:        " + lastN(visits, 3));
    }

    static Map<String, Integer> counts(List<String> visits) {
        Map<String, Integer> counts = new TreeMap<>();
        for (String v : visits) {
            counts.merge(v, 1, Integer::sum);
        }
        return counts;
    }

    static Deque<String> lastN(List<String> visits, int n) {
        Deque<String> recent = new ArrayDeque<>();
        for (String v : visits) {
            recent.addFirst(v);
            if (recent.size() > n) {
                recent.removeLast();                 // drop the oldest
            }
        }
        return recent;
    }
}
```

```text title="Output" output="VisitStats.java"
first-visit order: [home, cart, search]
alphabetical:      [cart, home, search]
counts:            {cart=2, home=3, search=1}
last three:        [home, cart, search]
```
````

## Knowledge check

```quiz
? Which interface does Map extend?
- Collection
- Iterable
+ None of these
> Map is a separate hierarchy; it provides Collection views.

? A List and a LinkedList contain the same elements in the same order. Are they equal?
+ Yes, List.equals is defined by elements and order
- No, they're different classes
> Equality is specified by the interface.

? `List<String> l = Arrays.asList("a", "b"); l.add("c");` — result?
- ["a", "b", "c"]
+ UnsupportedOperationException
- Compile error
> Arrays.asList is fixed-size.

? Which collection keeps unique elements in insertion order?
- HashSet
+ LinkedHashSet
- TreeSet
> LinkedHashSet adds a linked list through its entries.

? `map.values().removeIf(v -> v == 0)` does what to the map?
+ Removes those mappings from the map
- Nothing; values() is a copy
- Throws UnsupportedOperationException
> Map views are backed by the map.
```

## Key takeaways

- Two hierarchies: **`Collection`** (`List`, `Set`, `Queue`/`Deque`) and **`Map`**; `Map` gives `keySet`/`values`/`entrySet` views.
- Each interface promises an **order, duplicate and access contract**; equality is defined by the interface.
- **Program to interfaces**; choose implementations by access pattern.
- Know the three read-only flavours: **view**, **immutable copy**, **fixed-size**.
- General-purpose collections aren't thread-safe; views are live.
