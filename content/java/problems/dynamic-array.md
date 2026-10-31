## Problem statement

Implement `DynamicArray<E>`, a simplified `ArrayList`: a growable list backed by an `Object[]`, with a **fail-fast iterator**.

| Member | Contract |
|---|---|
| `DynamicArray()` / `DynamicArray(int initialCapacity)` | default capacity 10; a negative capacity throws `IllegalArgumentException` |
| `void add(E e)` | append in **amortised O(1)**. When full, grow to `old + old / 2` (at least `old + 1`) |
| `void add(int index, E e)` | insert, shifting later elements right. `0 ≤ index ≤ size`, otherwise `IndexOutOfBoundsException` |
| `E get(int index)`, `E set(int index, E e)` | `0 ≤ index < size`; `set` returns the old value |
| `E remove(int index)` | remove and return the element, shifting later elements left. **Clear the freed slot** |
| `boolean remove(Object o)` | remove the first element equal to `o` (`null`-safe); report whether one was removed |
| `int indexOf(Object o)`, `int size()`, `boolean isEmpty()`, `int capacity()` | `capacity()` exposes the array length, for testing growth |
| `Iterator<E> iterator()` | in index order; `next()` past the end throws `NoSuchElementException`; supports `remove()` (once per `next()`, otherwise `IllegalStateException`); **any structural change not made through the iterator makes its next call throw `ConcurrentModificationException`** |
| `String toString()` | `[a, b, c]` |

`null` elements are allowed. Don't use `java.util` collections inside the implementation: use arrays and `System.arraycopy`/`Arrays.copyOf`.

## Starter code

```java title="DynamicArray.java" starter="true"
import java.util.ConcurrentModificationException;
import java.util.Iterator;
import java.util.List;

public class DynamicArray<E> implements Iterable<E> {
    private static final int DEFAULT_CAPACITY = 10;
    private Object[] elements;
    private int size;
    private int modCount;          // structural modifications, checked by iterators

    public DynamicArray() {
        this(DEFAULT_CAPACITY);
    }

    public DynamicArray(int initialCapacity) {
        elements = new Object[initialCapacity];   // TODO: validate
    }

    public void add(E e) { throw new UnsupportedOperationException("TODO"); }
    public void add(int index, E e) { throw new UnsupportedOperationException("TODO"); }
    public E get(int index) { throw new UnsupportedOperationException("TODO"); }
    public E set(int index, E e) { throw new UnsupportedOperationException("TODO"); }
    public E remove(int index) { throw new UnsupportedOperationException("TODO"); }
    public boolean remove(Object o) { throw new UnsupportedOperationException("TODO"); }
    public int indexOf(Object o) { throw new UnsupportedOperationException("TODO"); }
    public int size() { return size; }
    public boolean isEmpty() { return size == 0; }
    public int capacity() { return elements.length; }

    @Override
    public Iterator<E> iterator() { throw new UnsupportedOperationException("TODO"); }

    public static void main(String[] args) {
        DynamicArray<Integer> numbers = new DynamicArray<>();
        StringBuilder growth = new StringBuilder("capacity " + numbers.capacity());
        for (int i = 1; i <= 25; i++) {
            int before = numbers.capacity();
            numbers.add(i);
            if (numbers.capacity() != before) growth.append(" -> ").append(numbers.capacity()).append(" (at add #").append(i).append(')');
        }
        System.out.println(growth);

        DynamicArray<String> list = new DynamicArray<>(2);
        for (String s : List.of("b", "d", "e")) list.add(s);
        list.add(0, "a");
        list.add(2, "c");
        System.out.println("after inserts: " + list + " size " + list.size());
        System.out.println("set(4, \"E\") returned " + list.set(4, "E") + " -> " + list);
        System.out.println("remove(1) returned " + list.remove(1) + " -> " + list);
        System.out.println("remove(\"d\") " + list.remove("d") + ", remove(\"zzz\") " + list.remove("zzz") + " -> " + list);
        list.add(null);
        System.out.println("with null: " + list + ", indexOf(null) " + list.indexOf(null));

        DynamicArray<Integer> evens = new DynamicArray<>();
        for (int i = 1; i <= 10; i++) evens.add(i);
        for (Iterator<Integer> it = evens.iterator(); it.hasNext(); ) {
            if (it.next() % 2 != 0) it.remove();
        }
        System.out.println("iterator.remove() of odd numbers -> " + evens);

        try {
            for (Integer n : evens) {
                if (n == 4) evens.add(99);
            }
        } catch (java.util.ConcurrentModificationException e) {
            System.out.println("add during for-each -> ConcurrentModificationException");
        }
        try {
            evens.get(evens.size());
        } catch (IndexOutOfBoundsException e) {
            System.out.println("get(size) -> IndexOutOfBoundsException: " + e.getMessage());
        }

        DynamicArray<Integer> big = new DynamicArray<>();
        int resizes = 0;
        long copied = 0;
        for (int i = 0; i < 1_000_000; i++) {
            int before = big.capacity();
            big.add(i);
            if (big.capacity() != before) {
                resizes++;
                copied += before;        // a resize copies every element of the full array
            }
        }
        System.out.printf("1,000,000 adds: %d resizes, %,d elements copied (%.2f copies per add)%n",
                resizes, copied, copied / 1_000_000.0);
    }
}
```

## Hints

````hint title="Hint 1: growth"
Before adding, call `ensureCapacity(size + 1)`. If the array is full, allocate `Math.max(old + (old >> 1), minCapacity)` and copy with `Arrays.copyOf`. Growing by a **factor** (not by a constant) is what makes `add` amortised O(1): the total copying over n adds is a geometric series bounded by a constant times n.
````

````hint title="Hint 2: shifting"
- Insert at `index`: `System.arraycopy(elements, index, elements, index + 1, size - index)`, then store.
- Remove at `index`: copy `index + 1 .. size` one slot left, then set `elements[--size] = null`. Without that last step, the array keeps a reference to the removed object ("loitering"), and the GC can never free it.
- Validate indexes with `Objects.checkIndex(index, size)`, or `checkIndex(index, size + 1)` for insertion.
````

````hint title="Hint 3: fail-fast iteration"
Increment `modCount` on every structural change (add, insert, remove), but not on `set`. The iterator:
- records `expectedModCount = modCount` when it's created;
- checks the two are still equal at the start of `next()` and `remove()`, and throws `ConcurrentModificationException` if not;
- in `remove()`, calls the list's `remove(lastReturned)`, then moves the cursor back and **resynchronises** `expectedModCount`.

Track `lastReturned = -1` to reject a second `remove()`.
````

## Test cases

| Scenario | Expected |
|---|---|
| Add 1..25 to a default list | capacity 10 → 15 (at add #11) → 22 (at add #16) → 33 (at add #23) |
| `[b, d, e]`, then `add(0, a)` and `add(2, c)` | `[a, b, c, d, e]` |
| `set(4, "E")` | returns `e`, list `[a, b, c, d, E]` |
| `remove(1)`, then `remove("d")`, then `remove("zzz")` | returns `b`, `true`, `false`, list `[a, c, E]` |
| `add(null)`, `indexOf(null)` | `[a, c, E, null]`, `3` |
| Iterator removes the odd numbers from 1..10 | `[2, 4, 6, 8, 10]` |
| `add` inside a for-each loop | `ConcurrentModificationException` |
| `get(size())` | `IndexOutOfBoundsException` |
| 1,000,000 adds | 29 resizes, about 2.4 element copies per add (amortised O(1)) |

## Expected output

```text title="Expected output" output="DynamicArray.java"
capacity 10 -> 15 (at add #11) -> 22 (at add #16) -> 33 (at add #23)
after inserts: [a, b, c, d, e] size 5
set(4, "E") returned e -> [a, b, c, d, E]
remove(1) returned b -> [a, c, d, E]
remove("d") true, remove("zzz") false -> [a, c, E]
with null: [a, c, E, null], indexOf(null) 3
iterator.remove() of odd numbers -> [2, 4, 6, 8, 10]
add during for-each -> ConcurrentModificationException
get(size) -> IndexOutOfBoundsException: Index 6 out of bounds for length 6
1,000,000 adds: 29 resizes, 2,430,972 elements copied (2.43 copies per add)
```

## Reference solution

````solution title="Reference solution (DynamicArray.java)"
```java title="DynamicArray.java" file="DynamicArray.java"
import java.util.Arrays;
import java.util.ConcurrentModificationException;
import java.util.Iterator;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Objects;

public class DynamicArray<E> implements Iterable<E> {
    private static final int DEFAULT_CAPACITY = 10;
    private Object[] elements;
    private int size;
    private int modCount;          // structural modifications, checked by iterators

    public DynamicArray() {
        this(DEFAULT_CAPACITY);
    }

    public DynamicArray(int initialCapacity) {
        if (initialCapacity < 0) {
            throw new IllegalArgumentException("negative capacity: " + initialCapacity);
        }
        elements = new Object[initialCapacity];
    }

    private void ensureCapacity(int minCapacity) {
        if (minCapacity > elements.length) {
            int old = elements.length;
            int grown = Math.max(old + (old >> 1), minCapacity);   // 1.5x, and at least what is needed
            elements = Arrays.copyOf(elements, grown);
        }
    }

    @SuppressWarnings("unchecked")
    private E elementAt(int index) {
        return (E) elements[index];                                // safe: only E values are ever stored
    }

    public void add(E e) {
        ensureCapacity(size + 1);
        elements[size++] = e;
        modCount++;
    }

    public void add(int index, E e) {
        Objects.checkIndex(index, size + 1);                       // inserting at size == appending
        ensureCapacity(size + 1);
        System.arraycopy(elements, index, elements, index + 1, size - index);
        elements[index] = e;
        size++;
        modCount++;
    }

    public E get(int index) {
        Objects.checkIndex(index, size);
        return elementAt(index);
    }

    public E set(int index, E e) {                                  // not structural: modCount unchanged
        Objects.checkIndex(index, size);
        E old = elementAt(index);
        elements[index] = e;
        return old;
    }

    public E remove(int index) {
        Objects.checkIndex(index, size);
        E old = elementAt(index);
        int moved = size - index - 1;
        if (moved > 0) {
            System.arraycopy(elements, index + 1, elements, index, moved);
        }
        elements[--size] = null;                                    // no loitering reference for the GC
        modCount++;
        return old;
    }

    public boolean remove(Object o) {
        int index = indexOf(o);
        if (index < 0) {
            return false;
        }
        remove(index);
        return true;
    }

    public int indexOf(Object o) {
        for (int i = 0; i < size; i++) {
            if (Objects.equals(o, elements[i])) {                   // null-safe
                return i;
            }
        }
        return -1;
    }

    public int size() { return size; }
    public boolean isEmpty() { return size == 0; }
    public int capacity() { return elements.length; }

    @Override
    public Iterator<E> iterator() {
        return new Iterator<>() {
            private int cursor;                      // index of the next element to return
            private int lastReturned = -1;           // -1: remove() not allowed
            private int expectedModCount = modCount;

            private void checkForComodification() {
                if (modCount != expectedModCount) {
                    throw new ConcurrentModificationException();
                }
            }

            @Override
            public boolean hasNext() {
                return cursor < size;
            }

            @Override
            public E next() {
                checkForComodification();
                if (cursor >= size) {
                    throw new NoSuchElementException();
                }
                lastReturned = cursor++;
                return elementAt(lastReturned);
            }

            @Override
            public void remove() {
                if (lastReturned < 0) {
                    throw new IllegalStateException("next() not called, or remove() already called");
                }
                checkForComodification();
                DynamicArray.this.remove(lastReturned);
                cursor = lastReturned;               // the next element shifted into this slot
                lastReturned = -1;
                expectedModCount = modCount;         // our own modification is legal
            }
        };
    }

    @Override
    public String toString() {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < size; i++) {
            if (i > 0) sb.append(", ");
            sb.append(elements[i]);
        }
        return sb.append(']').toString();
    }

    public static void main(String[] args) {
        DynamicArray<Integer> numbers = new DynamicArray<>();
        StringBuilder growth = new StringBuilder("capacity " + numbers.capacity());
        for (int i = 1; i <= 25; i++) {
            int before = numbers.capacity();
            numbers.add(i);
            if (numbers.capacity() != before) growth.append(" -> ").append(numbers.capacity()).append(" (at add #").append(i).append(')');
        }
        System.out.println(growth);

        DynamicArray<String> list = new DynamicArray<>(2);
        for (String s : List.of("b", "d", "e")) list.add(s);
        list.add(0, "a");
        list.add(2, "c");
        System.out.println("after inserts: " + list + " size " + list.size());
        System.out.println("set(4, \"E\") returned " + list.set(4, "E") + " -> " + list);
        System.out.println("remove(1) returned " + list.remove(1) + " -> " + list);
        System.out.println("remove(\"d\") " + list.remove("d") + ", remove(\"zzz\") " + list.remove("zzz") + " -> " + list);
        list.add(null);
        System.out.println("with null: " + list + ", indexOf(null) " + list.indexOf(null));

        DynamicArray<Integer> evens = new DynamicArray<>();
        for (int i = 1; i <= 10; i++) evens.add(i);
        for (Iterator<Integer> it = evens.iterator(); it.hasNext(); ) {
            if (it.next() % 2 != 0) it.remove();
        }
        System.out.println("iterator.remove() of odd numbers -> " + evens);

        try {
            for (Integer n : evens) {
                if (n == 4) evens.add(99);
            }
        } catch (ConcurrentModificationException e) {
            System.out.println("add during for-each -> ConcurrentModificationException");
        }
        try {
            evens.get(evens.size());
        } catch (IndexOutOfBoundsException e) {
            System.out.println("get(size) -> IndexOutOfBoundsException: " + e.getMessage());
        }

        DynamicArray<Integer> big = new DynamicArray<>();
        int resizes = 0;
        long copied = 0;
        for (int i = 0; i < 1_000_000; i++) {
            int before = big.capacity();
            big.add(i);
            if (big.capacity() != before) {
                resizes++;
                copied += before;        // a resize copies every element of the full array
            }
        }
        System.out.printf("1,000,000 adds: %d resizes, %,d elements copied (%.2f copies per add)%n",
                resizes, copied, copied / 1_000_000.0);
    }
}
```
````

## Step-by-step explanation

````solution title="Step-by-step explanation"
1. **Storage**: an `Object[]` plus a `size` counter. Generic arrays (`new E[]`) can't be created because of erasure, so elements are stored as `Object` and cast back in one place (`elementAt`, with `@SuppressWarnings` and a comment explaining why it's safe). That's the same trick `ArrayList` uses.
2. **Growth**: `ensureCapacity` grows by 1.5x (`old + (old >> 1)`), or to `minCapacity` if that's larger, which covers capacities 0 and 1, where 1.5x adds nothing. Copying costs O(size), but it happens at sizes 10, 15, 22, 33… so the total copying for n adds is at most about `n / (1 - 1/1.5) = 3n`: 2.4n in the demo. That's **amortised O(1)** per add. Growing by a constant (+10) would make it O(n) per add on average, O(n²) in total.
3. **Indexes**: `Objects.checkIndex(i, size)` gives standard `IndexOutOfBoundsException` messages. Insertion allows `index == size` (append), so it checks against `size + 1`.
4. **Shifting**: `System.arraycopy` handles overlapping ranges correctly (it behaves as if copying through a temporary array) and is an intrinsic, much faster than a loop.
5. **No loitering**: after a removal, the last slot still references the old last element. Setting it to `null` lets the GC reclaim it. That's a classic memory leak in hand-written collections (Effective Java's stack example).
6. **Fail-fast iterator**:
   - `modCount` counts structural changes; `set` doesn't change the structure, so it doesn't count;
   - the iterator snapshots it, and any mismatch on `next`/`remove` means someone else changed the list, so it throws `ConcurrentModificationException` instead of returning wrong elements;
   - `Iterator.remove` changes the list itself, so it moves the cursor back by one (the next element shifted into this slot) and resynchronises its expected count;
   - `lastReturned = -1` enforces "at most one `remove()` per `next()`".
7. **Fail-fast is best effort.** The check runs in `next()`, so a modification right before the loop ends can go unnoticed. And it isn't thread-safe: it detects bugs, it doesn't synchronise anything.
````

## Edge cases

- **Initial capacity 0 or 1**: `old + (old >> 1)` doesn't grow, so the `Math.max(…, minCapacity)` guard is essential.
- **Integer overflow** when growing near `Integer.MAX_VALUE`: production code (`ArraysSupport.newLength` in the JDK) caps the length and throws `OutOfMemoryError("Required array length too large")`.
- **`remove(Object)` with an `Integer` list**: `list.remove(1)` calls `remove(int index)` (the exact primitive match). Use `remove(Integer.valueOf(1))` for the value, just like `ArrayList`.
- **`null` elements** are handled by `Objects.equals` in `indexOf`.
- **Iterator `remove()` twice, or before `next()`**: `IllegalStateException`.
- **Modification while iterating** through the list's own methods, including from inside a for-each loop: `ConcurrentModificationException` on the next `next()`.
- **Shrinking**: this implementation never shrinks. Add `trimToSize()` if a long-lived list's peak size is much larger than its steady-state size.

## JUnit tests

```java title="DynamicArrayTest.java" file="DynamicArrayTest.java" test="DynamicArray.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.ConcurrentModificationException;
import java.util.Iterator;
import java.util.List;
import java.util.NoSuchElementException;
import org.junit.jupiter.api.Test;

class DynamicArrayTest {
    private static DynamicArray<String> of(String... values) {
        DynamicArray<String> list = new DynamicArray<>(1);
        for (String v : values) list.add(v);
        return list;
    }

    private static List<String> contents(DynamicArray<String> list) {
        List<String> out = new ArrayList<>();
        for (String s : list) out.add(s);
        return out;
    }

    @Test
    void addAndGetAcrossManyResizes() {
        DynamicArray<Integer> list = new DynamicArray<>(0);
        for (int i = 0; i < 1000; i++) list.add(i);
        assertEquals(1000, list.size());
        for (int i = 0; i < 1000; i++) assertEquals(i, list.get(i));
    }

    @Test
    void growsByHalfItsCapacity() {
        DynamicArray<Integer> list = new DynamicArray<>();
        for (int i = 0; i < 10; i++) list.add(i);
        assertEquals(10, list.capacity());
        list.add(10);
        assertEquals(15, list.capacity());
    }

    @Test
    void rejectsNegativeCapacity() {
        assertThrows(IllegalArgumentException.class, () -> new DynamicArray<String>(-1));
    }

    @Test
    void insertsAtFrontMiddleAndEnd() {
        DynamicArray<String> list = of("b", "d");
        list.add(0, "a");
        list.add(2, "c");
        list.add(4, "e");
        assertEquals(List.of("a", "b", "c", "d", "e"), contents(list));
        assertThrows(IndexOutOfBoundsException.class, () -> list.add(6, "x"));
        assertThrows(IndexOutOfBoundsException.class, () -> list.add(-1, "x"));
    }

    @Test
    void getAndSetCheckBounds() {
        DynamicArray<String> list = of("a", "b");
        assertEquals("b", list.set(1, "B"));
        assertEquals("B", list.get(1));
        assertThrows(IndexOutOfBoundsException.class, () -> list.get(2));
        assertThrows(IndexOutOfBoundsException.class, () -> list.set(-1, "x"));
    }

    @Test
    void removeByIndexShiftsAndReturns() {
        DynamicArray<String> list = of("a", "b", "c");
        assertEquals("b", list.remove(1));
        assertEquals(List.of("a", "c"), contents(list));
        assertEquals("c", list.remove(1));
        assertEquals("a", list.remove(0));
        assertTrue(list.isEmpty());
        assertThrows(IndexOutOfBoundsException.class, () -> list.remove(0));
    }

    @Test
    void removeByValueIsNullSafe() {
        DynamicArray<String> list = of("a", null, "b", "a");
        assertTrue(list.remove("a"));
        assertEquals("[null, b, a]", list.toString());
        assertEquals(2, list.indexOf("a"));
        assertTrue(list.remove(null));
        assertFalse(list.remove("zzz"));
        assertEquals(-1, list.indexOf(null));
        assertEquals("[b, a]", list.toString());
    }

    @Test
    void iteratorVisitsInOrderAndEnds() {
        Iterator<String> it = of("x", "y").iterator();
        assertEquals("x", it.next());
        assertEquals("y", it.next());
        assertFalse(it.hasNext());
        assertThrows(NoSuchElementException.class, it::next);
    }

    @Test
    void iteratorRemove() {
        DynamicArray<String> list = of("a", "b", "c", "d");
        for (Iterator<String> it = list.iterator(); it.hasNext(); ) {
            String s = it.next();
            if (s.equals("b") || s.equals("c")) it.remove();
        }
        assertEquals(List.of("a", "d"), contents(list));
    }

    @Test
    void iteratorRemoveRules() {
        Iterator<String> it = of("a", "b").iterator();
        assertThrows(IllegalStateException.class, it::remove);
        it.next();
        it.remove();
        assertThrows(IllegalStateException.class, it::remove);
    }

    @Test
    void failsFastOnOutsideModification() {
        DynamicArray<String> list = of("a", "b", "c");
        Iterator<String> it = list.iterator();
        it.next();
        list.add("d");
        assertThrows(ConcurrentModificationException.class, it::next);

        Iterator<String> it2 = list.iterator();
        it2.next();
        list.remove(0);
        assertThrows(ConcurrentModificationException.class, it2::next);
    }

    @Test
    void setIsNotAStructuralModification() {
        DynamicArray<String> list = of("a", "b");
        Iterator<String> it = list.iterator();
        it.next();
        list.set(1, "B");
        assertEquals("B", it.next());
    }

    @Test
    void removedSlotsDoNotKeepReferences() throws Exception {
        DynamicArray<String> list = of("a", "b", "c");
        list.remove(2);
        java.lang.reflect.Field f = DynamicArray.class.getDeclaredField("elements");
        f.setAccessible(true);
        Object[] array = (Object[]) f.get(list);
        assertNull(array[2]);
    }
}
```
