## The problem

Clients need to **walk through** the elements of a collection — a playlist, a file tree, a paginated API, a seat map — without knowing **how it's stored** (array, linked list, tree, remote pages). If clients reach into the internal structure, every storage change breaks them, and every client re-implements traversal logic.

**Iterator** provides a way to access the elements of an aggregate **sequentially without exposing its underlying representation**.

## When to use it — and when not

**Use when:**

- Your class holds elements in a structure clients shouldn't depend on.
- There are **several traversal orders** (depth-first, breadth-first, sorted, filtered).
- Elements are produced **lazily** (pages from an API, lines from a file, an infinite sequence).

**Don't use when:**

- Returning an unmodifiable `List` view or a `Stream` is enough — very often it is.

## Core idea

Java builds this pattern into the language:

- `Iterator<T>`: `hasNext()`, `next()` (and optionally `remove()`).
- `Iterable<T>`: `iterator()` — anything `Iterable` works in an enhanced `for` loop.
- Streams: `stream()` gives functional traversal with laziness.

Your job is usually to **implement `Iterable`** on your aggregate, or to expose a custom iterator for special traversals.

## UML

```uml title="Iterator"
interface Iterable<T>
  + iterator(): Iterator<T>
interface Iterator<T>
  + hasNext(): boolean
  + next(): T
class Playlist
  - songs: Song[]
  + iterator(): Iterator<Song>
  + shuffled(seed: long): Iterable<Song>
class PlaylistIterator
  - index: int
Playlist ..|> Iterable
PlaylistIterator ..|> Iterator
Playlist ..> PlaylistIterator : creates
```

## Java implementation

```java title="Custom iterators: array-backed, tree traversal and lazy paging" file="IteratorDemo.java"
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.Iterator;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Random;
import java.util.function.IntFunction;

public class IteratorDemo {
    public static void main(String[] args) {
        Playlist playlist = new Playlist(List.of("Intro", "Theme", "Finale"));
        for (String song : playlist) System.out.print(song + " | ");          // enhanced for works
        System.out.println();
        for (String song : playlist.shuffled(42)) System.out.print(song + " | ");
        System.out.println();

        Folder root = new Folder("root", List.of(
                new Folder("docs", List.of(new Folder("cv.pdf", List.of()))),
                new Folder("img", List.of())));
        root.depthFirst().forEachRemaining(f -> System.out.print(f.name() + " "));
        System.out.println();

        // Lazy paging: pages are fetched only as the loop advances.
        PagedResults<String> orders = new PagedResults<>(page -> {
            System.out.print("[fetch page " + page + "] ");
            return page < 3 ? List.of("ORD-" + page + "a", "ORD-" + page + "b") : List.of();
        });
        for (String order : orders) {
            System.out.print(order + " ");
            if (order.equals("ORD-1a")) break;      // pages 2+ never fetched
        }
        System.out.println();
    }
}

/** Array-backed aggregate that hides its storage. */
class Playlist implements Iterable<String> {
    private final String[] songs;

    Playlist(List<String> songs) { this.songs = songs.toArray(new String[0]); }

    @Override public Iterator<String> iterator() {
        return new Iterator<>() {
            private int index = 0;
            public boolean hasNext() { return index < songs.length; }
            public String next() {
                if (!hasNext()) throw new NoSuchElementException();
                return songs[index++];
            }
        };
    }

    /** An alternative traversal order, without changing the playlist. */
    Iterable<String> shuffled(long seed) {
        List<String> copy = new ArrayList<>(List.of(songs));
        Collections.shuffle(copy, new Random(seed));
        return copy::iterator;   // Iterable is a functional interface in practice
    }
}

/** Tree with a depth-first iterator that uses an explicit stack (no recursion). */
record Folder(String name, List<Folder> children) {
    Iterator<Folder> depthFirst() {
        Deque<Folder> stack = new ArrayDeque<>();
        stack.push(this);
        return new Iterator<>() {
            public boolean hasNext() { return !stack.isEmpty(); }
            public Folder next() {
                if (stack.isEmpty()) throw new NoSuchElementException();
                Folder current = stack.pop();
                for (int i = current.children().size() - 1; i >= 0; i--) stack.push(current.children().get(i));
                return current;
            }
        };
    }
}

/** Lazily walks a paginated source until an empty page. */
class PagedResults<T> implements Iterable<T> {
    private final IntFunction<List<T>> fetchPage;
    PagedResults(IntFunction<List<T>> fetchPage) { this.fetchPage = fetchPage; }

    @Override public Iterator<T> iterator() {
        return new Iterator<>() {
            private int page = 1;
            private Iterator<T> current = fetchPage.apply(page).iterator();

            public boolean hasNext() {
                while (!current.hasNext()) {
                    List<T> nextPage = fetchPage.apply(++page);
                    if (nextPage.isEmpty()) return false;
                    current = nextPage.iterator();
                }
                return true;
            }

            public T next() {
                if (!hasNext()) throw new NoSuchElementException();
                return current.next();
            }
        };
    }
}
```

Three different "collections", one client-facing abstraction: `for (x : thing)`.

## Realistic use case

- **File systems**: depth-first or breadth-first iteration over a [Composite](lesson:composite) tree ([File System](problem:file-system)).
- **APIs**: iterating paginated results from a remote service without loading everything.
- **Games**: iterating board squares in a direction (a chess bishop's diagonal) until blocked.
- **JDK**: every collection, `Scanner`, `BufferedReader.lines()`, `Files.walk()`.

## Trade-offs and alternatives

- **Pros:** hides representation; multiple traversals; lazy evaluation; works with language constructs.
- **Cons:** stateful iterators aren't thread-safe; **concurrent modification** during iteration needs a policy (fail-fast, snapshot or weakly consistent).
- **Alternatives:**
  - **Return an unmodifiable view or copy** (`List.copyOf`) when collections are small.
  - **`Stream<T>`** for functional pipelines (`filter`, `map`, `limit`) with laziness.
  - **Internal iteration** (`forEach(Consumer)`) when clients don't need control over stepping.

## Recognising it in an interview

Usually Iterator shows up **inside** another design rather than as the main pattern: "list all files recursively", "iterate seats row by row", "page through results". Implementing `Iterable` (or returning a `Stream`) instead of exposing internal collections is the signal.

## Common mistakes

- `next()` that returns null instead of throwing `NoSuchElementException` when exhausted.
- `hasNext()` with **side effects** that advance the iterator (calling it twice skips elements). Make it idempotent; the paging example only fetches when the current page is exhausted.
- Exposing mutable internal collections "so clients can iterate".
- Modifying the collection while iterating it, without a defined policy.

## Key takeaways

- Iterator gives **sequential access** without exposing representation; Java bakes it in (`Iterator`, `Iterable`, streams).
- Implement `Iterable` for custom aggregates; add alternate traversals as methods that return iterables.
- Iterators enable **lazy** traversal of large or remote data.
- Respect the contract: idempotent `hasNext()`, `NoSuchElementException` from `next()`.

## Knowledge check

```quiz
? What should `next()` do when there are no more elements?
- Return null
+ Throw NoSuchElementException
- Restart from the beginning
> That's the Iterator contract in Java.

? Why might calling `hasNext()` twice in a row skip an element in a buggy iterator?
+ Its hasNext() advances internal state instead of being a pure check
- Java caches iterators
- Because of garbage collection
> hasNext() must be idempotent.

? A class stores bookings in a private TreeMap. What's the best way to let clients loop over bookings?
- Make the TreeMap public
+ Implement Iterable<Booking> (or return an unmodifiable view or stream of the values)
- Copy the TreeMap's internal nodes into an array
> Expose traversal, not representation.
```

## Exercise

Implement `Range implements Iterable<Integer>` with `start`, `endExclusive` and `step` (positive or negative, never zero), so that `for (int i : new Range(10, 0, -3))` prints `10 7 4 1`. Validate the arguments, and make the iterator respect the contract.

````hint title="Hint"
`hasNext()` depends on the sign of `step`: for a positive step, `current < end`; for a negative step, `current > end`.
````

````solution title="Reference solution"
```java file="RangeDemo.java"
import java.util.Iterator;
import java.util.NoSuchElementException;

public class RangeDemo {
    public static void main(String[] args) {
        for (int i : new Range(10, 0, -3)) System.out.print(i + " ");
        System.out.println();
        for (int i : new Range(0, 10, 4)) System.out.print(i + " ");
        System.out.println();
    }
}

record Range(int start, int endExclusive, int step) implements Iterable<Integer> {
    Range {
        if (step == 0) throw new IllegalArgumentException("step must not be zero");
    }

    @Override public Iterator<Integer> iterator() {
        return new Iterator<>() {
            private int current = start;
            public boolean hasNext() { return step > 0 ? current < endExclusive : current > endExclusive; }
            public Integer next() {
                if (!hasNext()) throw new NoSuchElementException();
                int value = current;
                current += step;
                return value;
            }
        };
    }
}
```
````
