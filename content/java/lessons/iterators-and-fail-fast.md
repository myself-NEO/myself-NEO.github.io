## Concept explanation

### What it is

An **`Iterator<E>`** walks a collection one element at a time:

```java
Iterator<String> it = list.iterator();
while (it.hasNext()) {
    String s = it.next();
    if (s.isBlank()) it.remove();          // the only safe way to remove while iterating
}
```

| Method | Meaning |
|---|---|
| `hasNext()` | is there another element? |
| `next()` | return it and advance (`NoSuchElementException` at the end) |
| `remove()` | remove the element last returned by `next()` (optional; once per `next`) |
| `forEachRemaining(action)` | consume the rest |

The enhanced `for` loop is compiled into exactly this pattern for any `Iterable`.

**`ListIterator<E>`** (from `list.listIterator()`) adds bidirectional movement and modification: `hasPrevious()`/`previous()`, `nextIndex()`/`previousIndex()`, `set(e)` (replace the last returned element) and `add(e)` (insert at the cursor).

### Fail-fast, weakly consistent and snapshot iterators

What happens if the collection changes while you iterate depends on the implementation:

| Kind | Collections | Behaviour when modified during iteration |
|---|---|---|
| **Fail-fast** | `ArrayList`, `LinkedList`, `HashMap`, `HashSet`, `TreeMap`, … | throws **`ConcurrentModificationException`** on the next `next()` (best effort) |
| **Weakly consistent** | `ConcurrentHashMap`, `ConcurrentLinkedQueue`, `ConcurrentSkipListMap` | never throws; may or may not reflect changes made after the iterator was created |
| **Snapshot** | `CopyOnWriteArrayList`, `CopyOnWriteArraySet` | never throws; iterates the array as it was at creation; `remove()` unsupported |

"**Fail-safe**" is an informal (non-JDK) term people use for the last two; in interviews, explain the difference between *weakly consistent* and *snapshot* rather than just saying "fail-safe".

The name `ConcurrentModificationException` is misleading: it's thrown **in a single thread** too, whenever a collection is structurally modified other than through the iterator itself.

### Safe ways to remove or modify during iteration

- `iterator.remove()` / `listIterator.set/add`.
- `collection.removeIf(predicate)` (Java 8) — clearest and often faster.
- Collect the changes and apply them after the loop.
- Iterate over a copy (`new ArrayList<>(list)`).
- For maps: `map.entrySet().removeIf(...)`, `map.replaceAll(...)`, or `entry.setValue(...)` during iteration (allowed: it's not a structural change).

## Internal working

- Fail-fast collections keep an `int modCount` field, incremented on every **structural modification** (add, remove, clear, resize — not `set` on an `ArrayList` or `setValue` on a map entry).
- When an iterator is created it records `expectedModCount = modCount`. Each `next()` (and `remove()`) checks `modCount != expectedModCount` and throws `ConcurrentModificationException` if they differ.
- `iterator.remove()` removes through the collection **and** updates `expectedModCount`, so it stays valid.
- The check is **best effort**: it isn't synchronised, and in `ArrayList`'s iterator `hasNext()` only compares `cursor != size`. Removing the **second-to-last** element in a for-each loop makes `hasNext()` return `false` and the loop ends silently, skipping the last element — no exception. Never rely on CME for correctness; it's a bug detector.
- `ConcurrentHashMap` iterators traverse the bin array as it is when they reach each bin; `CopyOnWriteArrayList` iterators hold a reference to the array at creation (every write copies the array, so readers never see changes).
- Iterators over `HashMap` walk the bucket array in index order, which is why `HashMap` iteration order looks arbitrary and can change after a resize.

## Visual representation

```text title="modCount check in a fail-fast iterator"
  list = [a, b, c]   modCount = 3
  it = list.iterator()          expectedModCount = 3, cursor = 0

  it.next() -> a                check 3 == 3 ok, cursor = 1
  list.add("d")                 modCount = 4          (structural change NOT via iterator)
  it.next()                     check 4 != 3  -> ConcurrentModificationException

  it.remove() instead:          list.remove(...) ; expectedModCount = modCount  -> stays valid

  CopyOnWriteArrayList:   it ----> [a, b, c] (old array)     list now ----> [a, b, c, d] (new array)
```

## Java code example

```java title="IterationDemo.java" file="IterationDemo.java"
import java.util.ArrayList;
import java.util.ConcurrentModificationException;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.ListIterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

public class IterationDemo {
    public static void main(String[] args) {
        // 1. Fail-fast: modifying during for-each
        List<String> names = new ArrayList<>(List.of("ana", "", "bob", "cy"));
        try {
            for (String n : names) {
                if (n.isEmpty()) {
                    names.remove(n);
                }
            }
        } catch (ConcurrentModificationException e) {
            System.out.println("for-each + remove: ConcurrentModificationException");
        }

        // 2. The silent case: removing the second-to-last element skips the last one
        List<String> letters = new ArrayList<>(List.of("a", "b", "c"));
        StringBuilder seen = new StringBuilder();
        for (String s : letters) {
            seen.append(s);
            if (s.equals("b")) {
                letters.remove(s);                               // no exception, "c" never visited
            }
        }
        System.out.println("visited " + seen + ", list now " + letters);

        // 3. Safe removal: Iterator.remove and removeIf
        List<String> safe = new ArrayList<>(List.of("ana", "", "bob", " ", "cy"));
        Iterator<String> it = safe.iterator();
        while (it.hasNext()) {
            if (it.next().isEmpty()) {
                it.remove();
            }
        }
        safe.removeIf(String::isBlank);
        System.out.println("after iterator.remove + removeIf: " + safe);

        // 4. ListIterator: modify and insert while iterating
        List<Integer> prices = new ArrayList<>(List.of(10, 20, 30));
        ListIterator<Integer> li = prices.listIterator();
        while (li.hasNext()) {
            int p = li.next();
            li.set(p * 2);                                        // replace current
            if (p == 20) {
                li.add(99);                                       // insert after it
            }
        }
        System.out.print("ListIterator result: " + prices + ", backwards:");
        while (li.hasPrevious()) {
            System.out.print(" " + li.previous());
        }
        System.out.println();

        // 5. Maps: setValue is fine, put during iteration is not
        Map<String, Integer> stock = new HashMap<>(Map.of("pen", 1, "ink", 0, "pad", 5));
        for (Map.Entry<String, Integer> e : stock.entrySet()) {
            e.setValue(e.getValue() * 10);                        // not a structural change
        }
        stock.entrySet().removeIf(e -> e.getValue() == 0);
        System.out.println("map after setValue and removeIf: " + new java.util.TreeMap<>(stock));

        // 6. Weakly consistent: ConcurrentHashMap never throws
        Map<String, Integer> chm = new ConcurrentHashMap<>(Map.of("a", 1, "b", 2));
        for (String k : chm.keySet()) {
            chm.put(k + "!", 0);                                  // allowed; may or may not be visited
            if (chm.size() > 10) {
                break;
            }
        }
        System.out.println("ConcurrentHashMap: no exception, size now >= 4: " + (chm.size() >= 4));

        // 7. Snapshot: CopyOnWriteArrayList iterates the array as it was
        List<String> cow = new CopyOnWriteArrayList<>(List.of("x", "y"));
        StringBuilder cowSeen = new StringBuilder();
        for (String s : cow) {
            cowSeen.append(s);
            cow.add(s + "2");                                     // writes go to a new array
        }
        System.out.println("COW iteration saw " + cowSeen + ", list now " + cow);
        try {
            cow.iterator().remove();
        } catch (UnsupportedOperationException | IllegalStateException e) {
            System.out.println("COW iterator.remove(): " + e.getClass().getSimpleName());
        }
    }
}
```

## Output

```text title="Output" output="IterationDemo.java"
for-each + remove: ConcurrentModificationException
visited ab, list now [a, c]
after iterator.remove + removeIf: [ana, bob, cy]
ListIterator result: [20, 40, 99, 60], backwards: 60 99 40 20
map after setValue and removeIf: {pad=50, pen=10}
ConcurrentHashMap: no exception, size now >= 4: true
COW iteration saw xy, list now [x, y, x2, y2]
COW iterator.remove(): UnsupportedOperationException
```

- Case 2 is the dangerous one: removing `"b"` shrank the list to size 2 with the cursor at 2, so `hasNext()` returned false — `"c"` was silently skipped.
- `ListIterator.set` replaced elements and `add` inserted `99` after `40`; the iterator then continued with `30`.
- `setValue` isn't structural, so it's allowed during iteration; `removeIf` on the entry set removed the zero-stock item.
- The `ConcurrentHashMap` loop never threw; whether new keys were visited is unspecified (weakly consistent).
- The copy-on-write iterator saw only the original two elements.

## Real-world application

- **Cleaning collections** (expired sessions, completed jobs) with `removeIf` or `entrySet().removeIf` instead of manual loops.
- **CME in production** usually means a collection is shared between threads without synchronisation, or a callback modifies the collection being iterated (an event listener unsubscribing itself during dispatch). `CopyOnWriteArrayList` is the standard listener list for exactly this reason.
- **Caches and registries** on `ConcurrentHashMap` can be iterated for metrics or eviction while requests keep writing.
- **Custom iterators** for paged API results or lazy file reading follow the same `hasNext`/`next` contract — see the [custom iterators exercise](problem:custom-iterators).

## Common mistakes

- **Calling `list.remove` inside a for-each loop.**
- **Index-based removal in a forward loop** (`for (i = 0; i < size; i++) if (...) list.remove(i);`) skips the element after each removal — iterate backwards or use `removeIf`.
- **Calling `it.remove()` twice** or before `next()` → `IllegalStateException`.
- **Treating CME as thread-safety protection** — it's best effort and can miss races.
- **Using a fail-fast collection across threads** and "fixing" CME with try/catch.
- **Assuming a weakly consistent iterator shows a consistent snapshot.**

## Interview questions

**Q1. What causes `ConcurrentModificationException`? Is it only about threads?**

````reveal title="Answer"
A fail-fast iterator throws it when the collection's `modCount` no longer matches the value the iterator recorded — i.e. the collection was structurally modified by something other than the iterator itself. It happens in a single thread just as easily (removing inside a for-each loop). It's a best-effort bug detector, not a concurrency guarantee.
````

**Q2. What's the difference between fail-fast and fail-safe iterators?**

````reveal title="Answer"
Fail-fast iterators (`ArrayList`, `HashMap`) detect concurrent structural modification via `modCount` and throw CME. "Fail-safe" is an informal term for iterators that don't throw: **weakly consistent** ones (`ConcurrentHashMap`) traverse live data and may or may not reflect changes made during iteration; **snapshot** ones (`CopyOnWriteArrayList`) iterate a copy of the data as of creation and don't support `remove`.
````

**Q3. How do you safely remove elements from a list while iterating?**

````reveal title="Answer"
Use `Iterator.remove()` (or `ListIterator`), or better `collection.removeIf(predicate)`. Alternatives: iterate backwards by index, collect elements to remove and call `removeAll` afterwards, or iterate over a copy. For maps, `entrySet().removeIf(...)`.
````

**Q4. Iterator vs ListIterator?**

````reveal title="Answer"
`Iterator` works on any `Collection`, moves forward only and can `remove`. `ListIterator` works only on `List`s, moves in both directions, knows indices (`nextIndex`/`previousIndex`), and can also `set` the last returned element and `add` at the cursor position.
````

## Hands-on exercise

Write `static void dedupeAdjacent(List<String> list)` that removes consecutive duplicates **in place** (`[a, a, b, b, b, a]` → `[a, b, a]`) using a `ListIterator`, and `static Map<String, Integer> pruneLow(Map<String, Integer> scores, int min)` that removes entries below `min` and caps the rest at 100, without creating a new map.

````hint title="Hint"
Remember the previous value; when `next()` equals it, call `remove()`. For the map, iterate `entrySet()`: use `iterator.remove()` for low scores and `entry.setValue(Math.min(100, v))` for the rest.
````

````solution title="Solution"
```java title="InPlaceEdits.java" file="InPlaceEdits.java"
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.ListIterator;
import java.util.Map;
import java.util.Objects;

public class InPlaceEdits {
    public static void main(String[] args) {
        List<String> runs = new ArrayList<>(List.of("a", "a", "b", "b", "b", "a"));
        dedupeAdjacent(runs);
        System.out.println(runs);

        Map<String, Integer> scores = new LinkedHashMap<>();
        scores.put("ana", 120);
        scores.put("bob", 40);
        scores.put("cy", 75);
        System.out.println(pruneLow(scores, 50));
    }

    static void dedupeAdjacent(List<String> list) {
        ListIterator<String> it = list.listIterator();
        String previous = null;
        boolean first = true;
        while (it.hasNext()) {
            String current = it.next();
            if (!first && Objects.equals(current, previous)) {
                it.remove();
            } else {
                previous = current;
                first = false;
            }
        }
    }

    static Map<String, Integer> pruneLow(Map<String, Integer> scores, int min) {
        Iterator<Map.Entry<String, Integer>> it = scores.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<String, Integer> e = it.next();
            if (e.getValue() < min) {
                it.remove();                          // structural change through the iterator
            } else {
                e.setValue(Math.min(100, e.getValue()));   // non-structural: allowed
            }
        }
        return scores;
    }
}
```

```text title="Output" output="InPlaceEdits.java"
[a, b, a]
{ana=100, cy=75}
```
````

## Knowledge check

```quiz
? Which change during iteration does NOT cause a ConcurrentModificationException on an ArrayList?
+ list.set(i, value)
- list.add(value)
- list.remove(value)
> set doesn't change the structure, so modCount isn't incremented.

? Which iterator never throws CME and iterates a snapshot?
- HashMap's
- ConcurrentHashMap's
+ CopyOnWriteArrayList's
> ConcurrentHashMap's is weakly consistent (live), CopyOnWrite's is a snapshot.

? What does it.remove() throw if called twice in a row without next()?
+ IllegalStateException
- ConcurrentModificationException
- Nothing
> remove applies to the element last returned by next, once.

? Which is the clearest way to delete all negative numbers from a List<Integer>?
+ list.removeIf(x -> x < 0)
- A for-each loop calling list.remove
- A forward index loop calling remove(i)
> removeIf is safe and concise.
```

## Key takeaways

- `Iterator` = `hasNext`/`next`/`remove`; `ListIterator` adds backwards movement, indices, `set` and `add`.
- **Fail-fast** iterators compare `modCount` and throw CME on structural changes not made through the iterator — even in one thread, and only best effort.
- **Weakly consistent** (`ConcurrentHashMap`) and **snapshot** (`CopyOnWriteArrayList`) iterators never throw.
- Remove with **`iterator.remove()` or `removeIf`**; `set`/`setValue` are not structural.
- Never use CME as a concurrency safeguard.
