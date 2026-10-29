## The collections you'll actually use

LLD solutions use a small set of collections over and over. The skill is choosing based on the **operations your requirements need**, then naming the complexity out loud.

| Need | Use | Key operations (typical cost) |
|---|---|---|
| Ordered list, index access | `ArrayList` | get(i) O(1), add at end amortised O(1), remove(i) O(n) |
| Fast membership, no duplicates | `HashSet` | add/contains/remove O(1) average |
| Lookup by key | `HashMap` | get/put/remove O(1) average |
| Keys in sorted order, range queries | `TreeMap` / `TreeSet` | O(log n); `floorKey`, `ceilingKey`, `subMap` |
| Insertion- or access-ordered map | `LinkedHashMap` | O(1) ops + predictable iteration (basis for LRU caches) |
| Queue / stack | `ArrayDeque` | offer/poll/push/pop O(1) |
| Always get the min/max next | `PriorityQueue` | offer/poll O(log n), peek O(1) |
| Enum keys | `EnumMap` / `EnumSet` | Array-backed, very fast |

> [!TIP] Say it out loud
> *"Free spots per size live in a `TreeSet` ordered by distance, so the nearest free spot is `first()` in O(log n)."* Data structure choices with stated complexity are a strong signal. [Choosing Data Structures](lesson:data-structure-selection) goes deeper.

## Program to the collection interface

Declare fields and parameters by **interface** (`List`, `Map`, `Deque`) and choose the implementation in one place:

```java
private final Map<String, Ticket> activeTickets = new HashMap<>();   // switchable later
private final Deque<Request> pending = new ArrayDeque<>();
```

## Exposing collections safely

Returning an internal collection lets callers bypass your rules. Choose deliberately:

| Return | Caller can modify? | Sees later changes? | Cost |
|---|---|---|---|
| The field itself | Yes ❌ | Yes | O(1) |
| `Collections.unmodifiableList(field)` | No | Yes (live view) | O(1) |
| `List.copyOf(field)` | No | No (snapshot) | O(n) |

Prefer **snapshots** when callers might hold the result while the object changes (especially across threads), and **views** for cheap read access inside one thread.

## Generics: type-safe reusable code

Generics let you write a class or method once and use it with many types, with the compiler checking types for you.

```java title="A small generic repository" file="GenericsDemo.java"
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;

public class GenericsDemo {
    public static void main(String[] args) {
        InMemoryRepository<Book, String> books = new InMemoryRepository<>(Book::isbn);
        books.save(new Book("978-1", "Clean Code", 464));
        books.save(new Book("978-2", "Refactoring", 448));
        System.out.println(books.findById("978-2").map(Book::title).orElse("missing"));

        Book longest = maxBy(books.findAll(), Comparator.comparingInt(Book::pages));
        System.out.println("Longest: " + longest.title());

        List<Number> sink = new ArrayList<>();
        copyInto(List.of(1, 2, 3), sink);           // Integers into a List<Number>
        System.out.println(sink);
    }

    /** Generic method: works for any T given a comparator. */
    static <T> T maxBy(Collection<? extends T> items, Comparator<? super T> cmp) {
        if (items.isEmpty()) throw new IllegalArgumentException("empty");
        T best = null;
        for (T item : items) if (best == null || cmp.compare(item, best) > 0) best = item;
        return best;
    }

    /** PECS: Producer Extends, Consumer Super. */
    static <T> void copyInto(Collection<? extends T> source, Collection<? super T> target) {
        target.addAll(source);
    }
}

record Book(String isbn, String title, int pages) {}

/** T = entity type, ID = key type. */
interface Repository<T, ID> {
    void save(T entity);
    Optional<T> findById(ID id);
    List<T> findAll();
}

class InMemoryRepository<T, ID> implements Repository<T, ID> {
    private final Map<ID, T> store = new HashMap<>();
    private final Function<T, ID> idOf;

    InMemoryRepository(Function<T, ID> idOf) { this.idOf = idOf; }

    public void save(T entity) { store.put(idOf.apply(entity), entity); }
    public Optional<T> findById(ID id) { return Optional.ofNullable(store.get(id)); }
    public List<T> findAll() { return List.copyOf(store.values()); }
}
```

Key ideas:

- **Type parameters** (`<T, ID>`) are placeholders filled in at use sites: `InMemoryRepository<Book, String>`.
- **Bounded types** restrict them: `<T extends Comparable<T>>` means "any T that can compare itself".
- **Wildcards** make APIs flexible. **PECS** — *Producer `extends`, Consumer `super`*: read from `? extends T`, write into `? super T`.
- Java generics are **erased** at runtime: you can't do `new T()` or `instanceof List<String>`. Pass a `Class<T>` or a factory function when you need one.

## equals and hashCode for keys

Any object used as a `HashMap` key or `HashSet` element **must** implement `equals` and `hashCode` consistently, and its key fields **must not change** while it's in the collection. Records and enums handle this for you, which is another reason to use them for keys.

```java
record SeatId(int row, int number) {}                 // safe key: immutable, value equality
Map<SeatId, SeatStatus> seats = new HashMap<>();
```

## Real-world example

A scheduling service stored upcoming jobs in an `ArrayList` and scanned it every second for due jobs — O(n) per tick. With 200k jobs, CPU usage spiked. Switching to a `PriorityQueue<Job>` ordered by next run time made the check O(1) (`peek()`), with O(log n) inserts. The design didn't change; only the data structure did. See [Task Scheduler](problem:task-scheduler).

## Common mistakes

- `List.contains()` inside a loop (O(n²)) where a `Set` was needed.
- Mutating an object's key fields after putting it in a `HashSet`, so it can never be found again.
- Exposing internal collections directly.
- Raw types (`List` instead of `List<String>`), which disable compile-time checks.
- Using `Stack` and `Vector` (legacy, synchronized). Use `ArrayDeque`.
- `ConcurrentModificationException` from removing while iterating — use `iterator.remove()` or `removeIf`.

## In the interview

> [!INTERVIEW] Connect structure to requirement
> Each important collection should map to a requirement: *"Requirement 3 needs nearest free spot → `TreeSet` by distance. Requirement 5 needs ticket lookup on exit → `HashMap<ticketId, Ticket>`."*

## Key takeaways

- Choose collections from the **operations required**, and state their complexity.
- Declare by **interface**, construct the implementation in one place.
- Expose collections as **unmodifiable views or snapshots**.
- Generics make reusable, type-safe APIs; remember **PECS** and **type erasure**.
- Keys must have consistent `equals`/`hashCode` and must not change — use records or enums.

## Knowledge check

```quiz
? You need "the earliest-ending meeting among those currently running" frequently. Which structure fits?
- ArrayList scanned each time
+ PriorityQueue ordered by end time
- HashSet
> A min-heap gives O(1) peek and O(log n) updates for the earliest end time.

? A booking system must answer "which booking starts just before 10:30?" Which structure helps most?
- HashMap<LocalTime, Booking>
+ TreeMap<LocalTime, Booking> with floorEntry()
- ArrayDeque<Booking>
> TreeMap keeps keys sorted and supports floor/ceiling queries in O(log n).

? Which signature lets `addAll(List<Integer>)` add into a `List<Number>`?
- `void addAll(List<T> src, List<T> dst)`
+ `<T> void addAll(Collection<? extends T> src, Collection<? super T> dst)`
- `void addAll(List<Object> src, List<Object> dst)`
> Producer extends, consumer super.
```

## Exercise

Implement a generic `TopK<T>` class that keeps the **k largest** items seen so far according to a `Comparator<T>`. It should support `add(T item)` in O(log k) and `items()` returning the current top items, largest first.

````hint title="Hint 1"
Keep a min-heap of size k. The smallest of the top-k is at the root, so it's the one to evict.
````

````hint title="Hint 2"
`PriorityQueue` accepts a comparator. When the size exceeds k, `poll()` removes the smallest.
````

````solution title="Reference solution"
```java file="TopKDemo.java"
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.PriorityQueue;

public class TopKDemo {
    public static void main(String[] args) {
        TopK<Integer> top3 = new TopK<>(3, Comparator.naturalOrder());
        for (int n : new int[]{5, 1, 9, 3, 7, 8}) top3.add(n);
        System.out.println(top3.items());   // [9, 8, 7]
    }
}

class TopK<T> {
    private final int k;
    private final Comparator<? super T> order;
    private final PriorityQueue<T> minHeap;

    TopK(int k, Comparator<? super T> order) {
        if (k <= 0) throw new IllegalArgumentException("k must be positive");
        this.k = k;
        this.order = order;
        this.minHeap = new PriorityQueue<>(order);
    }

    void add(T item) {
        minHeap.offer(item);                       // O(log k)
        if (minHeap.size() > k) minHeap.poll();    // evict the smallest
    }

    List<T> items() {
        List<T> result = new ArrayList<>(minHeap);
        result.sort(order.reversed());             // largest first
        return result;
    }
}
```
````
