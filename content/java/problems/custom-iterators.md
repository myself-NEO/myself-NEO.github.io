## Problem statement

Implement three iterators in `Iterators.java` that follow the `java.util.Iterator` contract **exactly**:
- `hasNext()` has no visible side effects and can be called any number of times;
- `next()` past the end throws `NoSuchElementException`;
- `remove()` is unsupported (the default).

1. **`PeekingIterator<E>`** wraps any `Iterator<? extends E>` and adds `E peek()`, which returns the next element **without consuming it**. `null` elements must work.
2. **`FlatteningIterator<E>`** iterates an `Iterable<? extends Iterable<? extends E>>`, a list of lists, as one sequence. It must be **lazy**: it never copies elements into a buffer, it skips empty inner lists, and it works even if the outer iterable is infinite.
3. **`DeepFlattener`** iterates a `List<?>` whose elements are `Integer`s or (recursively) further lists, in order: `[1, [2, [3, []], 4], [], 5]` → `1, 2, 3, 4, 5`. Any other element type throws `IllegalArgumentException` when it's reached.

Then use `PeekingIterator` to write **`static <T extends Comparable<? super T>> List<T> mergeSorted(Iterator<T> a, Iterator<T> b)`**, which merges two sorted iterators.

## Starter code

```java title="Iterators.java" starter="true"
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.stream.Stream;

public final class Iterators {
    private Iterators() { }

    static final class PeekingIterator<E> implements Iterator<E> {
        PeekingIterator(Iterator<? extends E> source) {
            // TODO
        }
        public E peek() { throw new UnsupportedOperationException("TODO"); }
        @Override public boolean hasNext() { throw new UnsupportedOperationException("TODO"); }
        @Override public E next() { throw new UnsupportedOperationException("TODO"); }
    }

    static final class FlatteningIterator<E> implements Iterator<E> {
        FlatteningIterator(Iterable<? extends Iterable<? extends E>> nested) {
            // TODO
        }
        @Override public boolean hasNext() { throw new UnsupportedOperationException("TODO"); }
        @Override public E next() { throw new UnsupportedOperationException("TODO"); }
    }

    static final class DeepFlattener implements Iterator<Integer> {
        DeepFlattener(List<?> nested) {
            // TODO
        }
        @Override public boolean hasNext() { throw new UnsupportedOperationException("TODO"); }
        @Override public Integer next() { throw new UnsupportedOperationException("TODO"); }
    }

    static <T extends Comparable<? super T>> List<T> mergeSorted(Iterator<T> a, Iterator<T> b) {
        throw new UnsupportedOperationException("TODO");
    }

    static <E> List<E> drain(Iterator<E> it) {
        List<E> out = new ArrayList<>();
        while (it.hasNext()) out.add(it.next());
        return out;
    }

    public static void main(String[] args) {
        PeekingIterator<String> p = new PeekingIterator<>(java.util.Arrays.asList("a", null, "c").iterator());
        System.out.println("peek " + p.peek() + ", peek " + p.peek() + ", next " + p.next() + ", peek " + p.peek()
                + ", next " + p.next() + ", hasNext " + p.hasNext() + ", next " + p.next() + ", hasNext " + p.hasNext());
        try {
            p.peek();
        } catch (NoSuchElementException e) {
            System.out.println("peek() at the end -> NoSuchElementException");
        }
        System.out.println("mergeSorted -> " + mergeSorted(List.of(1, 4, 9).iterator(), List.of(2, 3, 10, 11).iterator()));

        List<List<Integer>> lists = List.of(List.of(), List.of(1, 2), List.of(), List.of(), List.of(3), List.of());
        System.out.println("flatten [[], [1, 2], [], [], [3], []] -> " + drain(new FlatteningIterator<>(lists)));
        int[] innerListsCreated = { 0 };
        Iterable<List<Integer>> infinite = () -> Stream.iterate(0, n -> n + 1)
                .map(n -> { innerListsCreated[0]++; return List.of(n * 10, n * 10 + 1); }).iterator();
        FlatteningIterator<Integer> lazy = new FlatteningIterator<>(infinite);
        List<Integer> firstFive = new ArrayList<>();
        for (int i = 0; i < 5; i++) firstFive.add(lazy.next());
        System.out.println("first 5 of an infinite list of lists -> " + firstFive + " (inner lists created: " + innerListsCreated[0] + ")");

        List<?> nested = List.of(1, List.of(2, List.of(3, List.of()), 4), List.of(), 5);
        System.out.println("deep flatten [1, [2, [3, []], 4], [], 5] -> " + drain(new DeepFlattener(nested)));
        try {
            drain(new DeepFlattener(List.of(1, List.of("two"))));
        } catch (IllegalArgumentException e) {
            System.out.println("deep flatten with a String -> IllegalArgumentException: " + e.getMessage());
        }
    }
}
```

## Hints

````hint title="Hint 1: peeking with a flag, not a sentinel"
Keep `boolean peeked` and `E peekedValue`. `peek()` fetches from the source only if `!peeked`. `next()` returns the cached value if `peeked`, and clears the flag. `hasNext()` is `peeked || source.hasNext()`. Using `null` as "nothing peeked" breaks as soon as the data itself contains `null`.
````

````hint title="Hint 2: lazy flattening"
Hold the outer iterator and the **current inner iterator**. In `hasNext()`:

```java
while ((inner == null || !inner.hasNext()) && outer.hasNext()) {
    inner = outer.next().iterator();
}
return inner != null && inner.hasNext();
```

It advances only as far as needed to answer the question, which handles any number of empty inner lists. `next()` calls `hasNext()` first and throws `NoSuchElementException` if it returns false.
````

````hint title="Hint 3: deep flattening with a stack of iterators"
Push `nested.iterator()` onto a `Deque<Iterator<?>>`. In `hasNext()`, loop:
- if the top iterator is exhausted, pop it;
- else look at its next element: an `Integer` is buffered (with a `boolean` flag) and returned as available; a `List` means push its iterator; anything else throws `IllegalArgumentException`.

The stack replaces recursion, so very deep nesting can't overflow the call stack.
````

## Test cases

| Scenario | Expected |
|---|---|
| Peeking over `[a, null, c]` | `peek a, peek a, next a, peek null, next null, hasNext true, next c, hasNext false` |
| `peek()` / `next()` at the end | `NoSuchElementException` |
| `mergeSorted([1, 4, 9], [2, 3, 10, 11])` | `[1, 2, 3, 4, 9, 10, 11]` |
| Flatten `[[], [1, 2], [], [], [3], []]` | `[1, 2, 3]` |
| First 5 of an infinite list of lists | `[0, 1, 10, 11, 20]`, creating only 3 inner lists |
| Deep flatten `[1, [2, [3, []], 4], [], 5]` | `[1, 2, 3, 4, 5]` |
| Deep flatten containing `"two"` | `IllegalArgumentException` |
| `hasNext()` called many times | never skips or duplicates elements |

## Expected output

```text title="Expected output" output="Iterators.java"
peek a, peek a, next a, peek null, next null, hasNext true, next c, hasNext false
peek() at the end -> NoSuchElementException
mergeSorted -> [1, 2, 3, 4, 9, 10, 11]
flatten [[], [1, 2], [], [], [3], []] -> [1, 2, 3]
first 5 of an infinite list of lists -> [0, 1, 10, 11, 20] (inner lists created: 3)
deep flatten [1, [2, [3, []], 4], [], 5] -> [1, 2, 3, 4, 5]
deep flatten with a String -> IllegalArgumentException: expected Integer or List but got String
```

## Reference solution

````solution title="Reference solution (Iterators.java)"
```java title="Iterators.java" file="Iterators.java"
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.Iterator;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.stream.Stream;

public final class Iterators {
    private Iterators() { }

    static final class PeekingIterator<E> implements Iterator<E> {
        private final Iterator<? extends E> source;
        private boolean peeked;              // a flag, not a null check: null is valid data
        private E peekedValue;

        PeekingIterator(Iterator<? extends E> source) {
            this.source = source;
        }

        public E peek() {
            if (!peeked) {
                peekedValue = source.next(); // throws NoSuchElementException at the end, as required
                peeked = true;
            }
            return peekedValue;
        }

        @Override
        public boolean hasNext() {
            return peeked || source.hasNext();
        }

        @Override
        public E next() {
            if (!peeked) {
                return source.next();
            }
            E value = peekedValue;
            peeked = false;
            peekedValue = null;              // don't retain a reference we no longer need
            return value;
        }
    }

    static final class FlatteningIterator<E> implements Iterator<E> {
        private final Iterator<? extends Iterable<? extends E>> outer;
        private Iterator<? extends E> inner = Collections.emptyIterator();

        FlatteningIterator(Iterable<? extends Iterable<? extends E>> nested) {
            this.outer = nested.iterator();
        }

        @Override
        public boolean hasNext() {
            while (!inner.hasNext() && outer.hasNext()) {
                inner = outer.next().iterator();    // skip any number of empty lists, one at a time
            }
            return inner.hasNext();
        }

        @Override
        public E next() {
            if (!hasNext()) {
                throw new NoSuchElementException();
            }
            return inner.next();
        }
    }

    static final class DeepFlattener implements Iterator<Integer> {
        private final Deque<Iterator<?>> stack = new ArrayDeque<>();
        private boolean ready;
        private Integer nextValue;

        DeepFlattener(List<?> nested) {
            stack.push(nested.iterator());
        }

        @Override
        public boolean hasNext() {
            while (!ready && !stack.isEmpty()) {
                Iterator<?> top = stack.peek();
                if (!top.hasNext()) {
                    stack.pop();
                    continue;
                }
                Object element = top.next();
                if (element instanceof Integer n) {
                    nextValue = n;
                    ready = true;
                } else if (element instanceof List<?> list) {
                    stack.push(list.iterator());          // descend without recursion
                } else {
                    throw new IllegalArgumentException("expected Integer or List but got "
                            + (element == null ? "null" : element.getClass().getSimpleName()));
                }
            }
            return ready;
        }

        @Override
        public Integer next() {
            if (!hasNext()) {
                throw new NoSuchElementException();
            }
            ready = false;
            return nextValue;
        }
    }

    static <T extends Comparable<? super T>> List<T> mergeSorted(Iterator<T> a, Iterator<T> b) {
        PeekingIterator<T> left = new PeekingIterator<>(a);
        PeekingIterator<T> right = new PeekingIterator<>(b);
        List<T> merged = new ArrayList<>();
        while (left.hasNext() && right.hasNext()) {
            merged.add(left.peek().compareTo(right.peek()) <= 0 ? left.next() : right.next());   // <= keeps it stable
        }
        while (left.hasNext()) merged.add(left.next());
        while (right.hasNext()) merged.add(right.next());
        return merged;
    }

    static <E> List<E> drain(Iterator<E> it) {
        List<E> out = new ArrayList<>();
        while (it.hasNext()) out.add(it.next());
        return out;
    }

    public static void main(String[] args) {
        PeekingIterator<String> p = new PeekingIterator<>(java.util.Arrays.asList("a", null, "c").iterator());
        System.out.println("peek " + p.peek() + ", peek " + p.peek() + ", next " + p.next() + ", peek " + p.peek()
                + ", next " + p.next() + ", hasNext " + p.hasNext() + ", next " + p.next() + ", hasNext " + p.hasNext());
        try {
            p.peek();
        } catch (NoSuchElementException e) {
            System.out.println("peek() at the end -> NoSuchElementException");
        }
        System.out.println("mergeSorted -> " + mergeSorted(List.of(1, 4, 9).iterator(), List.of(2, 3, 10, 11).iterator()));

        List<List<Integer>> lists = List.of(List.of(), List.of(1, 2), List.of(), List.of(), List.of(3), List.of());
        System.out.println("flatten [[], [1, 2], [], [], [3], []] -> " + drain(new FlatteningIterator<>(lists)));
        int[] innerListsCreated = { 0 };
        Iterable<List<Integer>> infinite = () -> Stream.iterate(0, n -> n + 1)
                .map(n -> { innerListsCreated[0]++; return List.of(n * 10, n * 10 + 1); }).iterator();
        FlatteningIterator<Integer> lazy = new FlatteningIterator<>(infinite);
        List<Integer> firstFive = new ArrayList<>();
        for (int i = 0; i < 5; i++) firstFive.add(lazy.next());
        System.out.println("first 5 of an infinite list of lists -> " + firstFive + " (inner lists created: " + innerListsCreated[0] + ")");

        List<?> nested = List.of(1, List.of(2, List.of(3, List.of()), 4), List.of(), 5);
        System.out.println("deep flatten [1, [2, [3, []], 4], [], 5] -> " + drain(new DeepFlattener(nested)));
        try {
            drain(new DeepFlattener(List.of(1, List.of("two"))));
        } catch (IllegalArgumentException e) {
            System.out.println("deep flatten with a String -> IllegalArgumentException: " + e.getMessage());
        }
    }
}
```
````

## Step-by-step explanation

````solution title="Step-by-step explanation"
**PeekingIterator**
1. The iterator caches **at most one** element. `peek()` pulls it from the source the first time and returns the cache afterwards, so repeated peeks are free and consistent.
2. A separate `boolean peeked` represents "something is cached". Encoding that as `peekedValue != null` would make a `null` element look like "nothing cached" and silently skip or duplicate data. The demo's `[a, null, c]` catches that bug.
3. `hasNext()` is `peeked || source.hasNext()`, so it has no side effects and can be called repeatedly. `peek()` at the end propagates the source's `NoSuchElementException`, matching `next()`.
4. **`mergeSorted`** is the canonical use: compare the two heads with `peek()`, consume only the smaller with `next()`. Without peeking you'd have to hold "the element I took but didn't use" in extra variables. `<=` takes from the left on ties, which makes the merge stable.

**FlatteningIterator**
1. State is the outer iterator plus the current inner iterator, initially `Collections.emptyIterator()` to avoid `null` checks.
2. `hasNext()` advances the outer iterator **only while** the inner one is exhausted. A `while` (not an `if`) is essential: `if` would stop at the first empty inner list and report "no more elements" too early.
3. Laziness is visible in the demo: taking 5 elements from an *infinite* stream created only 3 inner lists. An implementation that copied everything into a list first would never terminate.
4. Repeated `hasNext()` calls are idempotent: once `inner.hasNext()` is true, the loop doesn't advance anything.

**DeepFlattener**
1. A `Deque` of iterators acts as an explicit recursion stack: descending into a list is a `push`, and finishing one is a `pop`.
2. `hasNext()` performs the search and **buffers** the next integer (`ready` plus `nextValue`), so `next()` just hands it over. That separation keeps `hasNext()` idempotent despite its internal work.
3. Unexpected element types fail with a precise message when they're reached, which is lazy validation, consistent with lazy iteration.
4. Because there's no recursion, nesting 100,000 levels deep doesn't throw `StackOverflowError`.
````

## Edge cases

- **`null` elements** for the peeking iterator: supported via the flag. For the deep flattener, `null` is rejected with a clear message.
- **All-empty input** (`[[], [], []]`): `hasNext()` is `false`, and `next()` throws `NoSuchElementException`.
- **Infinite outer iterables**: fine for `FlatteningIterator`, as long as some inner lists are non-empty. An infinite sequence of *empty* lists makes `hasNext()` loop forever, an inherent limit of lazy flattening.
- **Modifying the source lists during iteration**: the underlying iterators fail fast with `ConcurrentModificationException`, and the wrappers propagate it.
- **Peeking then modifying**: the peeked element has already been taken from the source. Supporting `remove()` after `peek()` would be ambiguous, which is why Guava's `PeekingIterator.remove` refuses it after a peek.
- **Very deep nesting** in the deep flattener: no stack overflow, thanks to the explicit stack.

## JUnit tests

```java title="IteratorsTest.java" file="IteratorsTest.java" test="Iterators.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Iterator;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

class IteratorsTest {
    @Test
    void peekDoesNotConsumeAndHandlesNull() {
        Iterators.PeekingIterator<String> it = new Iterators.PeekingIterator<>(Arrays.asList("a", null, "c").iterator());
        assertEquals("a", it.peek());
        assertEquals("a", it.peek());
        assertEquals("a", it.next());
        assertNull(it.peek());
        assertTrue(it.hasNext());
        assertNull(it.next());
        assertEquals("c", it.next());
        assertFalse(it.hasNext());
        assertThrows(NoSuchElementException.class, it::peek);
        assertThrows(NoSuchElementException.class, it::next);
    }

    @Test
    void hasNextIsIdempotentEverywhere() {
        Iterators.PeekingIterator<Integer> p = new Iterators.PeekingIterator<>(List.of(1, 2).iterator());
        Iterators.FlatteningIterator<Integer> f = new Iterators.FlatteningIterator<>(List.of(List.of(), List.of(1), List.of(), List.of(2)));
        Iterators.DeepFlattener d = new Iterators.DeepFlattener(List.of(List.of(1), List.of(List.of(2))));
        for (Iterator<Integer> it : List.<Iterator<Integer>>of(p, f, d)) {
            List<Integer> seen = new ArrayList<>();
            while (it.hasNext() && it.hasNext() && it.hasNext()) seen.add(it.next());
            assertEquals(List.of(1, 2), seen);
        }
    }

    @Test
    void mergeSortedIsStableAndComplete() {
        assertEquals(List.of(1, 2, 3, 4, 9, 10, 11), Iterators.mergeSorted(List.of(1, 4, 9).iterator(), List.of(2, 3, 10, 11).iterator()));
        assertEquals(List.of(1, 1, 2, 2), Iterators.mergeSorted(List.of(1, 2).iterator(), List.of(1, 2).iterator()));
        assertEquals(List.of(5), Iterators.mergeSorted(List.<Integer>of().iterator(), List.of(5).iterator()));
    }

    @Test
    void flattenSkipsEmptyLists() {
        List<List<String>> lists = List.of(List.of(), List.of("a", "b"), List.of(), List.of(), List.of("c"), List.of());
        assertEquals(List.of("a", "b", "c"), Iterators.drain(new Iterators.FlatteningIterator<>(lists)));
        Iterators.FlatteningIterator<String> empty = new Iterators.FlatteningIterator<>(List.of(List.of(), List.of()));
        assertFalse(empty.hasNext());
        assertThrows(NoSuchElementException.class, empty::next);
    }

    @Test
    void flattenIsLazy() {
        AtomicInteger created = new AtomicInteger();
        Iterable<List<Integer>> infinite = () -> Stream.iterate(0, n -> n + 1)
                .map(n -> { created.incrementAndGet(); return List.of(n, n); }).iterator();
        Iterators.FlatteningIterator<Integer> it = new Iterators.FlatteningIterator<>(infinite);
        assertEquals(0, it.next());
        assertEquals(0, it.next());
        assertEquals(1, it.next());
        assertEquals(2, created.get());
    }

    @Test
    void deepFlatten() {
        List<?> nested = List.of(1, List.of(2, List.of(3, List.of()), 4), List.of(), 5);
        assertEquals(List.of(1, 2, 3, 4, 5), Iterators.drain(new Iterators.DeepFlattener(nested)));
        assertEquals(List.of(), Iterators.drain(new Iterators.DeepFlattener(List.of(List.of(List.of())))));
    }

    @Test
    void deepFlattenRejectsOtherTypesAndSurvivesDeepNesting() {
        assertThrows(IllegalArgumentException.class, () -> Iterators.drain(new Iterators.DeepFlattener(List.of(1, List.of("x")))));
        List<Object> deep = List.of(42);
        for (int i = 0; i < 100_000; i++) deep = List.of(deep);
        assertEquals(List.of(42), Iterators.drain(new Iterators.DeepFlattener(deep)));
    }
}
```
