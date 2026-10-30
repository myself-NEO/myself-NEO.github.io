## Concept explanation

### What it is

`ArrayList<E>` is a **resizable array**: a `List` backed by an `Object[]` (`elementData`) plus an `int size`. It is the default `List` implementation and the most used collection in Java.

- Indexed access, iteration in insertion order, duplicates and `null` allowed.
- Implements `RandomAccess`: `get(i)` is O(1).
- Not synchronised.

### Why it exists

Arrays have a fixed length. `ArrayList` gives you an array's speed (contiguous memory, O(1) index access, CPU-cache-friendly scans) **without** having to know the size up front: when the array fills, it allocates a bigger one and copies.

### Complexity

| Operation | Cost | Why |
|---|---|---|
| `get(i)`, `set(i, e)` | **O(1)** | direct array index |
| `add(e)` at the end | **amortised O(1)** | occasional O(n) copy when growing |
| `add(i, e)` / `remove(i)` in the middle | **O(n)** | shifts every later element with `System.arraycopy` |
| `remove(last)` | O(1) | nothing to shift |
| `contains`, `indexOf`, `remove(Object)` | O(n) | linear scan with `equals` |
| iteration | O(n), very fast | sequential memory access |

### When to use it

Almost always, for lists: reading by index, appending, iterating. Prefer something else when you need frequent insertion/removal **at the front** (`ArrayDeque`), fast `contains` (`HashSet`), sorted order (`TreeSet`), or thread safety (`CopyOnWriteArrayList` for read-mostly lists, or synchronisation).

## Internal working

### Architecture

```java
transient Object[] elementData;   // capacity = elementData.length
private int size;                  // number of elements actually used
protected transient int modCount;  // from AbstractList, for fail-fast iterators
```

`new ArrayList<>()` starts with a shared **empty** array; the first `add` allocates **capacity 10**. `new ArrayList<>(n)` allocates exactly `n`.

### Insertion

- **`add(e)`**: if `size == elementData.length`, call `grow()`, then `elementData[size++] = e; modCount++`.
- **`grow()`** (JDK 17): `newCapacity = oldCapacity + max(minGrowth, oldCapacity >> 1)` — the array grows by **~1.5×** (10 → 15 → 22 → 33 → 49 → …), and `Arrays.copyOf` copies the old contents into the new array. The old array becomes garbage.
- **`add(i, e)`**: grow if needed, then `System.arraycopy(elementData, i, elementData, i + 1, size - i)` shifts the tail right by one.
- **Why amortised O(1)**: growing by a constant **factor** means the total copying for n appends is a geometric series — at most about **2n–3n element copies**, i.e. a constant per append on average. (Growing by a constant *amount* would make it O(n²).)

### Retrieval

- **`get(i)`**: `Objects.checkIndex(i, size)` then `elementData[i]` with a cast — the JIT compiles this to a bounds check and a load.
- **`indexOf(o)`**: a loop comparing with `equals` (or `== null`).

### Removal

`remove(i)` shifts the tail left with `arraycopy`, then **nulls out** the last slot (`elementData[--size] = null`) so the removed object can be garbage-collected. The array **never shrinks** by itself; call `trimToSize()` after bulk removals if memory matters.

### Thread safety

None. Concurrent `add`s can lose elements, leave `null` gaps, or throw `ArrayIndexOutOfBoundsException` (two threads both see room at `size`, both write, one increments past the capacity check). Use `Collections.synchronizedList`, `CopyOnWriteArrayList`, or confine the list to one thread.

### Memory

- The array holds **references** (4 bytes each with compressed oops) — elements live elsewhere on the heap. A `List<Integer>` of a million numbers is ~4 MB of references plus ~16 MB of `Integer` objects; an `int[]` is 4 MB.
- **Slack**: right after growing, up to a third of the array is unused. Pre-size (`new ArrayList<>(expected)`) when you know the count; `trimToSize()` releases slack.
- `subList`, `iterator` and stream views are small objects pointing into the same array.

## Visual representation

```text title="Appending past capacity: grow 1.5x and copy"
  capacity 10, size 10
  elementData: [a][b][c][d][e][f][g][h][i][j]
  add("k"):  newCapacity = 10 + (10 >> 1) = 15
             Arrays.copyOf -> [a][b][c][d][e][f][g][h][i][j][k][ ][ ][ ][ ]
                                                                 ^ size = 11

  add(2, "X")   shift tail right with System.arraycopy:
     before [a][b][c][d][e]          after [a][b][X][c][d][e]
                  \__\__\__ moved one slot right

  remove(0)     shift left, null the old last slot:
     before [a][b][c]                after [b][c][null]   size 2
```

## Java code example

```java title="ArrayListInternals.java" file="ArrayListInternals.java"
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

public class ArrayListInternals {
    public static void main(String[] args) {
        // 1. The JDK 17 growth policy, reproduced: capacity sequence and total copying cost
        int capacity = 0;
        long copied = 0;
        StringBuilder steps = new StringBuilder();
        int n = 1_000;
        for (int size = 0; size < n; size++) {
            if (size == capacity) {
                int newCapacity = capacity == 0 ? 10 : capacity + (capacity >> 1);
                copied += capacity;                       // Arrays.copyOf moves the old elements
                capacity = newCapacity;
                steps.append(capacity).append(' ');
            }
        }
        System.out.println("capacities: " + steps.toString().trim());
        System.out.printf(Locale.ROOT, "%d appends -> %d element copies (%.2f per append)%n", n, copied, (double) copied / n);

        // 2. Index operations shift elements
        List<String> list = new ArrayList<>(List.of("a", "b", "c", "d"));
        list.add(1, "X");                                  // shifts b, c, d right
        list.remove(0);                                    // shifts everything left
        list.set(0, "Y");                                  // O(1), not structural
        System.out.println("after add(1), remove(0), set(0): " + list);

        // 3. remove(int) vs remove(Object) on a List<Integer>
        List<Integer> nums = new ArrayList<>(List.of(5, 10, 1, 20));
        nums.remove(1);                                    // index 1 -> removes 10
        nums.remove(Integer.valueOf(1));                   // value 1
        System.out.println("nums: " + nums);

        // 4. subList is a view into the same array
        List<Integer> data = new ArrayList<>(List.of(0, 1, 2, 3, 4, 5, 6));
        data.subList(2, 5).clear();                        // removes indices 2..4 from data
        System.out.println("after subList(2,5).clear(): " + data);

        // 5. Converting to and from arrays
        String[] arr = list.toArray(new String[0]);        // typed array of the right size
        List<String> fixed = Arrays.asList(arr);           // view backed by arr (fixed size)
        List<String> independent = new ArrayList<>(fixed); // real, growable copy
        arr[0] = "changed";
        System.out.println("asList sees array change: " + fixed.get(0) + ", copy does not: " + independent.get(0));

        // 6. Pre-sizing and trimming
        ArrayList<Integer> big = new ArrayList<>(100_000);  // one allocation, no regrowth
        for (int i = 0; i < 100_000; i++) {
            big.add(i);
        }
        big.subList(10, big.size()).clear();
        big.trimToSize();                                  // shrink the backing array to size 10
        System.out.println("big size after clear + trimToSize: " + big.size() + " " + big);
    }
}
```

## Output

```text title="Output" output="ArrayListInternals.java"
capacities: 10 15 22 33 49 73 109 163 244 366 549 823 1234
1000 appends -> 2456 element copies (2.46 per append)
after add(1), remove(0), set(0): [Y, b, c, d]
nums: [5, 20]
after subList(2,5).clear(): [0, 1, 5, 6]
asList sees array change: changed, copy does not: Y
big size after clear + trimToSize: 10 [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
```

- The capacities follow `old + old/2`. A thousand appends caused about 2.5 copies per element — amortised O(1).
- `list.add(1, "X")` then `remove(0)` left `[X, b, c, d]`; `set(0, "Y")` replaced `X` without shifting.
- `nums.remove(1)` removed **index** 1 (the value 10); removing the value `1` needed `Integer.valueOf`.
- Clearing a `subList` removed the range from the backing list in one `arraycopy`.

## Real-world application

- **Response building**: services collect results into `ArrayList`s and return `List.copyOf(...)` or `stream.toList()`.
- **Batching**: pre-size buffers (`new ArrayList<>(batchSize)`) for bulk database inserts or Kafka batches, then `clear()` and reuse.
- **Performance work**: replacing `LinkedList` with `ArrayList` (or `ArrayDeque`) is one of the most common easy wins; replacing `List<Integer>` with `int[]` or a primitive list cuts memory 4–5×.
- **Memory leaks**: a long-lived list that only grows (an "event history") is a classic leak; capped structures or ring buffers avoid it.

## Common mistakes

- **Removing in a forward index loop** (skips elements) or in a for-each loop (CME).
- **`list.remove(i)` vs `remove(Object)` confusion** with `List<Integer>`.
- **Inserting at index 0 repeatedly** (O(n²) overall) — use `ArrayDeque` or build reversed and `Collections.reverse` once.
- **`contains` in a loop** over a large list (O(n²)) — use a `HashSet`.
- **Sharing an `ArrayList` across threads** without synchronisation.
- **Holding `subList` views** after structurally modifying the parent (CME on next use).
- **`toArray()` without an argument** when you need a typed array (it returns `Object[]`).

## Interview questions

**Q1. How does `ArrayList` grow, and why is `add` amortised O(1)?**

````reveal title="Answer"
When the backing array is full, `grow()` allocates a new array about 1.5× larger (`old + (old >> 1)`; the first allocation of a default list is 10) and copies the elements with `Arrays.copyOf`. Because capacity grows geometrically, the total copying over n appends is bounded by a constant multiple of n (a geometric series), so the average cost per append is O(1) even though an individual append can be O(n).
````

**Q2. `ArrayList` vs array — when would you still use an array?**

````reveal title="Answer"
Arrays are fixed-size but can hold **primitives** directly (no boxing, 4–5× less memory for numbers), have slightly lower overhead, and are required by some APIs (varargs, `byte[]` I/O). `ArrayList` is generic, resizable and has the full `List` API. Use arrays for primitive-heavy or performance-critical fixed-size data; `ArrayList` otherwise.
````

**Q3. What happens if two threads call `add` on the same `ArrayList`?**

````reveal title="Answer"
It's a data race: both threads may read the same `size`, write to the same slot (one element is lost), increment `size` unsafely, or one may write past the end before the other grows the array (`ArrayIndexOutOfBoundsException`). There's no exception guaranteed — just corrupt data. Use synchronisation, `Collections.synchronizedList`, `CopyOnWriteArrayList` (read-heavy) or a concurrent queue.
````

**Q4. Does removing elements shrink an `ArrayList`'s memory?**

````reveal title="Answer"
No. `remove` and `clear` null out slots so elements can be collected, but the backing array keeps its capacity. Call `trimToSize()` to shrink the array to `size`, or replace the list with a fresh one.
````

## Hands-on exercise

Without using `ArrayList`, implement a minimal `IntList` backed by an `int[]` with `add(int)`, `get(int)`, `removeAt(int)` and `size()`, growing by 1.5× like `ArrayList`. Count how many element copies 10,000 appends cause, and compare memory: estimate the bytes used by your `IntList` vs an `ArrayList<Integer>` holding 10,000 distinct values (16 bytes per `Integer` + 4 bytes per reference).

````hint title="Hint"
Keep `int[] data` and `int size`. On a full array, `data = Arrays.copyOf(data, data.length + (data.length >> 1))` and add the old length to a copy counter. `removeAt` uses `System.arraycopy(data, i + 1, data, i, size - i - 1)`.
````

````solution title="Solution"
```java title="IntListDemo.java" file="IntListDemo.java"
import java.util.Arrays;

public class IntListDemo {
    public static void main(String[] args) {
        IntList list = new IntList();
        for (int i = 0; i < 10_000; i++) {
            list.add(i * 3);
        }
        list.removeAt(0);
        System.out.println("size " + list.size() + ", first " + list.get(0) + ", copies during growth " + list.copies());
        long intListBytes = 4L * list.capacity();
        long boxedBytes = 10_000L * (16 + 4);
        System.out.println("approx bytes: IntList " + intListBytes + " vs ArrayList<Integer> " + boxedBytes);
    }
}

final class IntList {
    private int[] data = new int[10];
    private int size;
    private long copies;

    void add(int value) {
        if (size == data.length) {
            copies += data.length;
            data = Arrays.copyOf(data, data.length + (data.length >> 1));
        }
        data[size++] = value;
    }

    int get(int index) {
        if (index < 0 || index >= size) {
            throw new IndexOutOfBoundsException("index " + index + ", size " + size);
        }
        return data[index];
    }

    void removeAt(int index) {
        get(index);                                            // bounds check
        System.arraycopy(data, index + 1, data, index, size - index - 1);
        size--;
    }

    int size() {
        return size;
    }

    int capacity() {
        return data.length;
    }

    long copies() {
        return copies;
    }
}
```

```text title="Output" output="IntListDemo.java"
size 9999, first 3, copies during growth 28096
approx bytes: IntList 56212 vs ArrayList<Integer> 200000
```

About 3 copies per append (amortised O(1)), and roughly 4× less memory than boxed integers — before even counting the `ArrayList`'s own slack.
````

## Knowledge check

```quiz
? What is the time complexity of ArrayList.add(0, e)?
- O(1)
+ O(n)
- O(log n)
> Every existing element shifts one position right.

? What is the default capacity after the first add to `new ArrayList<>()`?
+ 10
- 16
- 0
> The empty list allocates 10 slots on the first add.

? By roughly what factor does ArrayList grow?
+ 1.5x
- 2x
- +10 elements
> newCapacity = old + (old >> 1).

? Does list.clear() release the backing array's capacity?
- Yes
+ No; it nulls the slots but keeps the array (use trimToSize or a new list)
> The array never shrinks automatically.

? Which interface signals that get(i) is O(1)?
+ RandomAccess
- Indexed
- List
> Algorithms check for RandomAccess to choose index loops.
```

## Key takeaways

- `ArrayList` = **`Object[]` + `size`**; `get`/`set` O(1), append **amortised O(1)**, middle insert/remove **O(n)** via `System.arraycopy`.
- Grows **1.5×** (first allocation 10); never shrinks unless `trimToSize()`.
- Holds **references** — boxing makes numeric lists 4–5× heavier than arrays.
- **Not thread-safe**; views (`subList`) are backed by the list.
- Default choice for lists; use `ArrayDeque` for front operations, `HashSet` for lookups.
