## Concept explanation

### What it is

`TreeMap<K, V>` keeps its keys **sorted** — by their natural ordering (`Comparable`) or by a `Comparator` given to the constructor. `TreeSet<E>` is a sorted set backed by a `TreeMap` (elements are keys). Both are implemented as a **red-black tree**: a self-balancing binary search tree.

They implement `SortedMap`/`NavigableMap` and `SortedSet`/`NavigableSet`, which add queries a hash table can't answer:

| Method | Returns |
|---|---|
| `firstKey()` / `lastKey()` | smallest / largest key |
| `floorKey(k)` | greatest key **≤ k** |
| `ceilingKey(k)` | least key **≥ k** |
| `lowerKey(k)` / `higherKey(k)` | strictly **< k** / **> k** |
| `headMap(k)` / `tailMap(k)` / `subMap(a, b)` | range **views** (live, backed by the map) |
| `descendingMap()` | reverse-ordered view |
| `pollFirstEntry()` / `pollLastEntry()` | remove and return the smallest / largest |

(`TreeSet` has the same with `floor`, `ceiling`, `lower`, `higher`, `headSet`, `subSet`, `pollFirst`…)

### Why it exists

Hash tables answer "is X present?" in O(1) but know nothing about order. Many problems need **order-aware lookups**: the price bracket for an income, the next scheduled job after now, the nearest available seat, a leaderboard's top N, time-series data in a range. A balanced tree does each in **O(log n)**.

### Complexity

| Operation | Cost |
|---|---|
| `get`, `put`, `remove`, `containsKey` | O(log n) |
| `floor`/`ceiling`/`higher`/`lower`, `first`/`last` | O(log n) |
| range view creation | O(1) (iterating it costs O(log n + k)) |
| full iteration (sorted) | O(n) |

### When to use it

When you need **sorted iteration**, **nearest-key queries** or **range queries**. If you only need lookups, `HashMap` is faster (O(1) and better constant factors). For concurrent sorted maps, use `ConcurrentSkipListMap`.

### Ordering defines equality

`TreeMap` never calls `equals` or `hashCode`: two keys are "the same key" when `compare(a, b) == 0`. A comparator that's **inconsistent with equals** therefore merges distinct keys — see [Comparable vs Comparator](lesson:comparable-vs-comparator). Keys must also be mutually comparable: inserting a non-`Comparable` key without a comparator throws `ClassCastException`, and `null` keys throw `NullPointerException` with natural ordering.

## Internal working

### Architecture

```java
private final Comparator<? super K> comparator;   // null = natural ordering
private transient Entry<K,V> root;
private transient int size, modCount;

static final class Entry<K,V> {
    K key; V value;
    Entry<K,V> left, right, parent;
    boolean color = BLACK;
}
```

A **red-black tree** keeps balance with five rules: every node is red or black; the root is black; red nodes have black children; every path from a node to its leaves has the same number of black nodes. Consequence: the longest root-to-leaf path is at most **twice** the shortest, so height ≤ 2·log₂(n + 1) and every operation is O(log n).

### Insertion (`put`)

1. Starting at the root, compare the key with each node (`compare(key, node.key)`): go left if negative, right if positive; if zero, **replace the value** and stop.
2. Attach a new **red** node as a leaf.
3. **Rebalance** (`fixAfterInsertion`): while the parent is red, either recolour (if the uncle is red) or perform one or two **rotations** (if the uncle is black). At most two rotations per insert.

### Retrieval (`get`, `floorKey` …)

A binary search down the tree: O(log n) comparisons. `floorKey(k)` remembers the last node smaller than `k` on the way down.

### Removal

Find the node; if it has two children, swap with its in-order successor; unlink; then `fixAfterDeletion` with recolouring and at most three rotations.

### Thread safety and memory

Not thread-safe (rotations touch several nodes). Each `Entry` is an object with key, value, three child/parent links and a colour: ~40 bytes per mapping, more than a `HashMap` node, and with worse cache locality. `TreeSet` adds no per-element overhead beyond its `TreeMap`.

## Visual representation

```text title="A red-black tree and a floor query"
  keys inserted: 10, 20, 30, 15, 25, 5         (R = red, B = black)

                  20(B)
                 /     \
             10(B)      30(B)
             /   \       /
          5(R)  15(R)  25(R)

  inserting 10, 20, 30 in order would make a "stick"; a rotation at 10 lifted 20 to the root.

  floorKey(27):  20 <= 27 -> remember 20, go right
                 30 >  27 -> go left
                 25 <= 27 -> remember 25, go right (null)       answer 25, 3 comparisons
```

## Java code example

```java title="TreeMapDemo.java" file="TreeMapDemo.java"
import java.time.LocalTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.NavigableMap;
import java.util.NavigableSet;
import java.util.TreeMap;
import java.util.TreeSet;

public class TreeMapDemo {
    public static void main(String[] args) {
        // 1. Tax brackets: floorEntry finds the bracket for any income
        NavigableMap<Integer, Integer> brackets = new TreeMap<>(Map.of(0, 0, 10_000, 10, 40_000, 20, 90_000, 30));
        for (int income : new int[] {5_000, 10_000, 55_000, 250_000}) {
            System.out.println("income " + income + " -> rate " + brackets.floorEntry(income).getValue() + "%");
        }

        // 2. Scheduling: next job at or after a time, and a time window
        NavigableMap<LocalTime, String> jobs = new TreeMap<>();
        jobs.put(LocalTime.of(9, 0), "backup");
        jobs.put(LocalTime.of(12, 30), "report");
        jobs.put(LocalTime.of(18, 0), "cleanup");
        LocalTime now = LocalTime.of(10, 15);
        System.out.println("next job after " + now + ": " + jobs.ceilingEntry(now));
        System.out.println("jobs between 09:00 and 13:00: " + jobs.subMap(LocalTime.of(9, 0), true, LocalTime.of(13, 0), true).values());

        // 3. Range views are live
        NavigableMap<Integer, String> scores = new TreeMap<>(Map.of(55, "Ana", 72, "Raj", 88, "Kim", 91, "Bea"));
        NavigableMap<Integer, String> passing = scores.tailMap(60, true);
        scores.put(65, "Lee");
        System.out.println("passing (view sees later put): " + passing + ", top: " + scores.lastEntry() + ", descending: " + scores.descendingMap().keySet());

        // 4. TreeSet navigation
        NavigableSet<Integer> seats = new TreeSet<>(List.of(3, 7, 8, 12, 20));
        System.out.println("nearest free seat >= 9: " + seats.ceiling(9) + ", <= 9: " + seats.floor(9)
                + ", strictly above 12: " + seats.higher(12) + ", headSet(8): " + seats.headSet(8));
        System.out.println("pollFirst " + seats.pollFirst() + ", remaining " + seats);

        // 5. Custom comparator: case-insensitive keys MERGE (ordering defines equality)
        TreeMap<String, Integer> ci = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        ci.put("Java", 1);
        ci.put("JAVA", 2);
        ci.put("kotlin", 3);
        System.out.println("case-insensitive map: " + ci + " (size " + ci.size() + ")");

        // 6. Natural ordering requires Comparable keys and rejects null
        TreeMap<Object, String> bad = new TreeMap<>();
        try {
            bad.put(new Object(), "x");
        } catch (ClassCastException e) {
            System.out.println("non-Comparable key: ClassCastException");
        }
        try {
            new TreeMap<String, Integer>().put(null, 1);
        } catch (NullPointerException e) {
            System.out.println("null key with natural ordering: NullPointerException");
        }

        // 7. Comparator for a domain type
        TreeSet<String> byLength = new TreeSet<>(Comparator.comparingInt(String::length).thenComparing(Comparator.naturalOrder()));
        byLength.addAll(List.of("kiwi", "fig", "banana", "apple", "pear"));
        System.out.println("by length then alpha: " + byLength);
    }
}
```

## Output

```text title="Output" output="TreeMapDemo.java"
income 5000 -> rate 0%
income 10000 -> rate 10%
income 55000 -> rate 20%
income 250000 -> rate 30%
next job after 10:15: 12:30=report
jobs between 09:00 and 13:00: [backup, report]
passing (view sees later put): {65=Lee, 72=Raj, 88=Kim, 91=Bea}, top: 91=Bea, descending: [91, 88, 72, 65, 55]
nearest free seat >= 9: 12, <= 9: 8, strictly above 12: 20, headSet(8): [3, 7]
pollFirst 3, remaining [7, 8, 12, 20]
case-insensitive map: {Java=2, kotlin=3} (size 2)
non-Comparable key: ClassCastException
null key with natural ordering: NullPointerException
by length then alpha: [fig, kiwi, pear, apple, banana]
```

- `floorEntry` turned a bracket table into a one-line lookup: the greatest threshold ≤ income.
- `ceilingEntry` found the next job; `subMap` returned a time window.
- The `tailMap` view showed `Lee`, added after the view was created.
- With a case-insensitive comparator, `"JAVA"` was the same key as `"Java"`: the value was replaced and the first-inserted spelling of the key kept.
- The `byLength` comparator needed a tie-breaker; without `thenComparing`, `"kiwi"` and `"pear"` (both length 4) would have merged.

## Real-world application

- **Pricing and tax tables**, rate limits by tier, shipping cost by weight: `floorEntry`.
- **Schedulers and calendars**: next event, overlapping bookings (check `floorEntry`/`ceilingEntry` around a new booking — see the meeting-room problem in [System Design](#system-design/lld/problems/meeting-room-booking)).
- **Order books** in trading systems: bids and asks in sorted maps by price (`ConcurrentSkipListMap` when concurrent).
- **Consistent hashing**: a `TreeMap<Integer, Node>` ring where `ceilingEntry(hash(key))` (wrapping to `firstEntry`) picks the node.
- **Time-series and leaderboards**: ranges by timestamp, top-N with `descendingMap`.

## Common mistakes

- **Comparators inconsistent with equals**, silently merging keys.
- **Mutating fields used for ordering** while the object is a key — the tree becomes corrupt.
- **Using `TreeMap` for plain lookups** where `HashMap` is faster.
- **Forgetting views are live** (and throw `IllegalArgumentException` when you insert outside their range).
- **Natural ordering on non-`Comparable` keys** (`ClassCastException` at the first `put`).
- **Assuming `subMap(a, b)` includes `b`** — the two-argument form is half-open `[a, b)`.

## Interview questions

**Q1. How does `TreeMap` keep its operations O(log n)?**

````reveal title="Answer"
It's a red-black tree: a binary search tree with colouring rules that guarantee the longest path is at most twice the shortest, so the height stays O(log n). Inserts and deletes restore the rules with recolouring and at most a few rotations. Every lookup, insert, delete and navigation query is a walk from the root, so O(log n).
````

**Q2. `HashMap` vs `TreeMap`?**

````reveal title="Answer"
`HashMap`: O(1) average, unordered, uses `hashCode`/`equals`, allows a null key. `TreeMap`: O(log n), keys sorted by `compareTo`/comparator (which also defines key equality), supports navigation and range queries, no null keys with natural ordering, more memory per entry. Choose `TreeMap` only when ordering or range queries matter.
````

**Q3. How would you find the price tier for a given quantity in O(log n)?**

````reveal title="Answer"
Store tiers in a `TreeMap<Integer, Price>` keyed by the minimum quantity of each tier and call `floorEntry(quantity)` — the greatest tier threshold ≤ the quantity. Add a tier at 0 (or handle `null` for quantities below the first tier).
````

**Q4. Why might a `TreeSet` contain fewer elements than you added, all distinct by `equals`?**

````reveal title="Answer"
Its comparator considers some of them equal (`compare == 0`) — e.g. a comparator on a single field like length or department. `TreeSet` uses the comparator, not `equals`, to detect duplicates. Add tie-breakers so the comparator is consistent with equals.
````

## Hands-on exercise

Build a `MeetingCalendar` for one room that stores bookings as half-open intervals `[start, end)` in minutes and supports:

- `boolean book(int start, int end)` — rejects overlaps in O(log n),
- `Integer nextFreeSlotAfter(int time, int duration)` — earliest start ≥ `time` where a meeting of `duration` fits (scan gaps from `time`).

````hint title="Hint"
Use `TreeMap<Integer, Integer>` start → end. A new interval overlaps if the previous booking (`floorEntry(start)`) ends after `start`, or the next one (`ceilingEntry(start)`) starts before `end`. For free slots, walk `tailMap(floorKey(time))` entries comparing gaps.
````

````solution title="Solution"
```java title="MeetingCalendar.java" file="MeetingCalendar.java"
import java.util.Map;
import java.util.TreeMap;

public class MeetingCalendar {
    private final TreeMap<Integer, Integer> bookings = new TreeMap<>();   // start -> end

    boolean book(int start, int end) {
        if (end <= start) {
            throw new IllegalArgumentException("empty interval");
        }
        Map.Entry<Integer, Integer> before = bookings.floorEntry(start);
        Map.Entry<Integer, Integer> after = bookings.ceilingEntry(start);
        if (before != null && before.getValue() > start) {
            return false;                                     // previous meeting still running
        }
        if (after != null && after.getKey() < end) {
            return false;                                     // next meeting starts too early
        }
        bookings.put(start, end);
        return true;
    }

    Integer nextFreeSlotAfter(int time, int duration) {
        int candidate = time;
        Map.Entry<Integer, Integer> running = bookings.floorEntry(time);
        if (running != null && running.getValue() > candidate) {
            candidate = running.getValue();                   // wait for the current meeting to end
        }
        for (Map.Entry<Integer, Integer> e : bookings.tailMap(candidate, true).entrySet()) {
            if (e.getKey() - candidate >= duration) {
                return candidate;                             // the gap before this meeting fits
            }
            candidate = Math.max(candidate, e.getValue());
        }
        return candidate;                                     // after the last meeting
    }

    public static void main(String[] args) {
        MeetingCalendar room = new MeetingCalendar();
        System.out.println(room.book(540, 600) + " " + room.book(600, 660) + " " + room.book(630, 700) + " " + room.book(720, 780));
        System.out.println("30-min slot after 09:00 (540): " + room.nextFreeSlotAfter(540, 30));
        System.out.println("90-min slot after 09:00 (540): " + room.nextFreeSlotAfter(540, 90));
    }
}
```

```text title="Output" output="MeetingCalendar.java"
true true false true
30-min slot after 09:00 (540): 660
90-min slot after 09:00 (540): 780
```

`[600, 660)` starts exactly when `[540, 600)` ends — no overlap with half-open intervals. A 30-minute slot fits at 660 (before 720); 90 minutes only fits after the 720–780 meeting.
````

## Knowledge check

```quiz
? What data structure backs TreeMap?
+ A red-black tree
- A hash table with sorted buckets
- A skip list
> ConcurrentSkipListMap is the skip-list one.

? `floorKey(k)` returns...
+ the greatest key less than or equal to k
- the smallest key greater than k
- k if present, else null
> ceilingKey is the least key >= k.

? A TreeMap uses String.CASE_INSENSITIVE_ORDER. You put "A"=1 then "a"=2. What's the size?
+ 1
- 2
> compare("A", "a") == 0, so they're the same key.

? What does `new TreeMap<String,Integer>().put(null, 1)` do?
- Stores a null key
+ Throws NullPointerException
> Natural ordering calls compareTo on the key.

? Which is O(1) on a TreeMap?
- get
+ creating a headMap view
- floorKey
> Views are created in constant time; operations on them are O(log n).
```

## Key takeaways

- `TreeMap`/`TreeSet` are **red-black trees**: sorted, **O(log n)** for everything, height ≤ 2·log₂ n.
- **NavigableMap** queries: `floor`/`ceiling`/`higher`/`lower`, `first`/`last`, `headMap`/`tailMap`/`subMap` (live views), `descendingMap`, `pollFirst`.
- The **comparator defines key equality**; keep it consistent with equals.
- Use them for **ranges and nearest-key lookups**; use `HashMap` for plain lookups.
- Not thread-safe; use `ConcurrentSkipListMap` for concurrent sorted maps.
