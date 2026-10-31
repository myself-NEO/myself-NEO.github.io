## Problem statement

Sorting 2 million prices per batch job is the bottleneck of an analytics pipeline. Implement a **parallel merge sort** with the Fork/Join framework in `ParallelMergeSort`:

- `static void sort(int[] a, int threshold, ForkJoinPool pool)` sorts `a` in place:
  - split the range in halves recursively with a `RecursiveAction`;
  - **below `threshold` elements, sort sequentially** (`Arrays.sort` on the sub-range);
  - merge the halves using **one** temporary buffer allocated once per sort, not one per merge.
- `static long countTasks(int n, int threshold)` returns how many tasks a sort of `n` elements creates (leaves plus inner nodes), so you can reason about the threshold.
- Validation: `threshold ≥ 1`, otherwise `IllegalArgumentException`. `null` arrays → `NullPointerException`.

Then **compare** with `Arrays.sort` (sequential dual-pivot quicksort) and `Arrays.parallelSort` (the JDK's own Fork/Join merge sort): the results must be identical. Explain how the threshold trades task overhead against parallelism.

## Starter code

```java title="ParallelMergeSort.java" starter="true"
import java.util.Arrays;
import java.util.Random;
import java.util.concurrent.ForkJoinPool;
import java.util.concurrent.RecursiveAction;

public final class ParallelMergeSort {
    private ParallelMergeSort() { }

    static final class SortTask extends RecursiveAction {
        private static final long serialVersionUID = 1L;
        private final int[] a;
        private final int[] tmp;
        private final int lo, hi;            // sorts a[lo, hi)
        private final int threshold;

        SortTask(int[] a, int[] tmp, int lo, int hi, int threshold) {
            this.a = a;
            this.tmp = tmp;
            this.lo = lo;
            this.hi = hi;
            this.threshold = threshold;
        }

        @Override
        protected void compute() {
            // TODO: small range -> Arrays.sort(a, lo, hi); otherwise split, invokeAll both halves, merge
        }
    }

    static void sort(int[] a, int threshold, ForkJoinPool pool) {
        // TODO: validate, allocate the buffer once, invoke the root task
    }

    static long countTasks(int n, int threshold) {
        return 0;                            // TODO
    }

    public static void main(String[] args) {
        int[] data = new Random(42).ints(2_000_000, 0, 1_000_000).toArray();
        int[] expected = data.clone();
        Arrays.sort(expected);
        ForkJoinPool pool = new ForkJoinPool(4);
        sort(data, 8_192, pool);
        System.out.println("2,000,000 random ints sorted correctly: " + Arrays.equals(data, expected));
        pool.shutdown();
    }
}
```

## Hints

````hint title="Hint 1: the recursive task"
```java
protected void compute() {
    if (hi - lo <= threshold) { Arrays.sort(a, lo, hi); return; }
    int mid = (lo + hi) >>> 1;
    invokeAll(new SortTask(a, tmp, lo, mid, threshold), new SortTask(a, tmp, mid, hi, threshold));
    merge(lo, mid, hi);
}
```

`invokeAll` forks one subtask and computes the other in the current thread, then joins. Both halves are sorted when it returns.
````

````hint title="Hint 2: merging with a shared buffer"
- Copy `a[lo, hi)` into `tmp[lo, hi)`, then merge `tmp[lo, mid)` and `tmp[mid, hi)` back into `a[lo, hi)`.
- Concurrent merges work on **disjoint** ranges of `tmp`, so one buffer of length `a.length` serves all of them safely, with no per-merge allocation.
- Shortcut: if `a[mid - 1] <= a[mid]`, the two halves are already in order, so skip the merge.
````

````hint title="Hint 3: counting tasks and choosing the threshold"
`countTasks(n, t)` mirrors the recursion: `n <= t ? 1 : 1 + countTasks(n / 2, t) + countTasks(n - n / 2, t)`.
- Too small a threshold creates thousands of tiny tasks, whose scheduling overhead dominates.
- Too large a threshold leaves cores idle.

A common rule of thumb: aim for a few times more leaf tasks than worker threads (4-16 per thread), and leaves big enough that each does at least ~10-100 µs of work. Measure with JMH to confirm.
````

## Test cases

| Input | Expected |
|---|---|
| 2,000,000 random ints (seed 42), threshold 8,192, 4 threads | identical to `Arrays.sort` and `Arrays.parallelSort` |
| `countTasks(2,000,000, t)` for t = 1,000 / 8,192 / 100,000 | 4,095 / 511 / 63 tasks |
| Empty array, one element, already sorted, reverse sorted, all equal | correctly sorted |
| Arrays smaller than the threshold | a single sequential sort (1 task) |
| `threshold = 0` | `IllegalArgumentException` |
| Negative numbers, `Integer.MIN_VALUE`/`MAX_VALUE` | correctly ordered |

## Expected output

```text title="Expected output" output="ParallelMergeSort.java"
2,000,000 random ints sorted correctly: true, same as Arrays.parallelSort: true
threshold   1,000 -> 4,095 tasks (2,048 leaves) for 2,000,000 elements on 4 worker threads
threshold   8,192 ->   511 tasks (256 leaves) for 2,000,000 elements on 4 worker threads
threshold 100,000 ->    63 tasks (32 leaves) for 2,000,000 elements on 4 worker threads
edge cases with threshold 1: [] [7] [1, 2, 3, 4, 5] [1, 2, 3, 4, 5] [2, 2, 2, 2] [-2147483648, -1, 0, 2147483647]
array smaller than the threshold: [3, 7, 9] in 1 task
threshold 0 -> IllegalArgumentException: threshold must be at least 1
```

## Reference solution

````solution title="Reference solution (ParallelMergeSort.java)"
```java title="ParallelMergeSort.java" file="ParallelMergeSort.java"
import java.util.Arrays;
import java.util.Objects;
import java.util.Random;
import java.util.concurrent.ForkJoinPool;
import java.util.concurrent.RecursiveAction;

public final class ParallelMergeSort {
    private ParallelMergeSort() { }

    static final class SortTask extends RecursiveAction {
        private static final long serialVersionUID = 1L;
        private final int[] a;
        private final int[] tmp;
        private final int lo, hi;            // sorts a[lo, hi)
        private final int threshold;

        SortTask(int[] a, int[] tmp, int lo, int hi, int threshold) {
            this.a = a;
            this.tmp = tmp;
            this.lo = lo;
            this.hi = hi;
            this.threshold = threshold;
        }

        @Override
        protected void compute() {
            if (hi - lo <= threshold) {
                Arrays.sort(a, lo, hi);                       // small enough: sequential is fastest
                return;
            }
            int mid = (lo + hi) >>> 1;                        // unsigned shift: no overflow
            invokeAll(new SortTask(a, tmp, lo, mid, threshold),
                      new SortTask(a, tmp, mid, hi, threshold));   // fork one, compute the other, join
            merge(mid);
        }

        private void merge(int mid) {
            if (a[mid - 1] <= a[mid]) {
                return;                                       // halves already in order
            }
            System.arraycopy(a, lo, tmp, lo, hi - lo);        // disjoint range of the shared buffer
            int i = lo, j = mid, k = lo;
            while (i < mid && j < hi) {
                a[k++] = tmp[i] <= tmp[j] ? tmp[i++] : tmp[j++];   // <= keeps it stable
            }
            while (i < mid) a[k++] = tmp[i++];
            while (j < hi) a[k++] = tmp[j++];
        }
    }

    static void sort(int[] a, int threshold, ForkJoinPool pool) {
        Objects.requireNonNull(a, "array");
        if (threshold < 1) {
            throw new IllegalArgumentException("threshold must be at least 1");
        }
        if (a.length < 2) {
            return;
        }
        int[] tmp = new int[a.length];                        // one buffer for the whole sort
        pool.invoke(new SortTask(a, tmp, 0, a.length, threshold));
    }

    static long countTasks(int n, int threshold) {
        if (n <= threshold) {
            return 1;
        }
        int half = n >>> 1;
        return 1 + countTasks(half, threshold) + countTasks(n - half, threshold);
    }

    public static void main(String[] args) {
        int[] data = new Random(42).ints(2_000_000, 0, 1_000_000).toArray();
        int[] expected = data.clone();
        Arrays.sort(expected);
        int[] jdkParallel = data.clone();
        Arrays.parallelSort(jdkParallel);

        ForkJoinPool pool = new ForkJoinPool(4);
        try {
            sort(data, 8_192, pool);
            System.out.println("2,000,000 random ints sorted correctly: " + Arrays.equals(data, expected)
                    + ", same as Arrays.parallelSort: " + Arrays.equals(data, jdkParallel));
            for (int t : new int[] { 1_000, 8_192, 100_000 }) {
                System.out.printf("threshold %,7d -> %,5d tasks (%,d leaves) for 2,000,000 elements on %d worker threads%n",
                        t, countTasks(2_000_000, t), (countTasks(2_000_000, t) + 1) / 2, pool.getParallelism());
            }

            int[][] edge = { {}, { 7 }, { 1, 2, 3, 4, 5 }, { 5, 4, 3, 2, 1 }, { 2, 2, 2, 2 },
                    { Integer.MAX_VALUE, -1, Integer.MIN_VALUE, 0 } };
            StringBuilder sb = new StringBuilder();
            for (int[] e : edge) {
                int[] copy = e.clone();
                sort(copy, 1, pool);                          // threshold 1: forces full recursion
                sb.append(Arrays.toString(copy)).append(' ');
            }
            System.out.println("edge cases with threshold 1: " + sb.toString().trim());

            int[] small = { 9, 3, 7 };
            sort(small, 8_192, pool);
            System.out.println("array smaller than the threshold: " + Arrays.toString(small) + " in " + countTasks(3, 8_192) + " task");
            try {
                sort(new int[10], 0, pool);
            } catch (IllegalArgumentException e) {
                System.out.println("threshold 0 -> IllegalArgumentException: " + e.getMessage());
            }
        } finally {
            pool.shutdown();
        }
    }
}
```
````

## Step-by-step explanation

````solution title="Step-by-step explanation"
1. **Divide**: `compute()` splits `[lo, hi)` at `mid = (lo + hi) >>> 1`. The unsigned shift avoids the overflow of `(lo + hi) / 2` on huge arrays.
2. **Fork and join with `invokeAll`**: the worker pushes one subtask onto its own deque (where idle workers can **steal** it) and computes the other directly, so the current thread never sits idle waiting. When `invokeAll` returns, both halves are sorted.
3. **Sequential cutoff**: below `threshold`, `Arrays.sort` (dual-pivot quicksort, extremely fast on small, cache-resident ranges) beats further splitting. Every task costs an object allocation, deque operations and possibly a steal, so the threshold is the main tuning knob.
   - With 2,000,000 elements, threshold 1,000 creates 4,095 tasks (2,048 leaves of about 977 elements): lots of overhead.
   - Threshold 100,000 creates 63 tasks (32 leaves): enough for 4 workers, but coarse, so if one leaf is slower the others idle at the end.
   - 8,192 (256 leaves, 64 per worker) is a balanced middle, which is roughly what `Arrays.parallelSort` uses (`MIN_ARRAY_SORT_GRAN = 1 << 13`).
4. **Merge with a shared buffer**:
   - each merge copies its own range into `tmp`, then merges back into `a`;
   - concurrent merges always cover disjoint ranges, so a single buffer is safe and avoids allocating O(n log n) temporary arrays;
   - the `a[mid - 1] <= a[mid]` check skips work entirely on already-sorted input.
5. **Correctness evidence**: the result equals both `Arrays.sort` and `Arrays.parallelSort` on 2 million random values, and the edge cases (empty, single, sorted, reversed, duplicates, extreme values) pass with threshold 1, which exercises every merge path.
6. **Performance comparison**: timings vary by machine, so they aren't printed here. Measure with JMH:
   - sequential `Arrays.sort`;
   - this sort at several thresholds;
   - `Arrays.parallelSort`.
   
   Typically the parallel versions win only above roughly 100,000 elements, scaling sub-linearly with cores, because merging is memory-bandwidth-bound. `Arrays.parallelSort` is usually the fastest: same idea, more tuning.
````

## Edge cases

- **Arrays below the threshold**: one task, one `Arrays.sort`. Parallelism isn't worth it for small inputs.
- **Threshold 1**: maximum recursion. It's correct but slow, useful only for testing the merge logic.
- **Recursion depth**: log2(n / threshold) levels (≈ 8 here). Fork/Join tasks don't risk `StackOverflowError` at sensible thresholds.
- **The common pool vs a dedicated pool**: `ForkJoinPool.commonPool()` is shared with parallel streams and `CompletableFuture` async tasks, so long sorts there slow everything else. Batch jobs often use a dedicated pool, as here.
- **Blocking inside tasks** (I/O, locks) starves the pool. Fork/Join is for CPU-bound divide-and-conquer.
- **Objects instead of ints**: use `Comparator`-based merges, and keep the `<=` in the merge for **stability** (the JDK's object sorts are stable).
- **Memory**: the buffer doubles memory use (n extra ints). In-place parallel sorts exist, but they're slower and more complex.

## JUnit tests

```java title="ParallelMergeSortTest.java" file="ParallelMergeSortTest.java" test="ParallelMergeSort.java"
import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.Arrays;
import java.util.Random;
import java.util.concurrent.ForkJoinPool;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class ParallelMergeSortTest {
    private static final ForkJoinPool POOL = new ForkJoinPool(4);

    @AfterAll
    static void shutdown() {
        POOL.shutdown();
    }

    @ParameterizedTest(name = "n={0}, threshold={1}")
    @CsvSource({ "0, 4", "1, 4", "2, 1", "17, 1", "1000, 7", "100000, 512", "500000, 8192", "300000, 1000000" })
    void matchesArraysSort(int n, int threshold) {
        int[] data = new Random(n).ints(n).toArray();
        int[] expected = data.clone();
        Arrays.sort(expected);
        ParallelMergeSort.sort(data, threshold, POOL);
        assertArrayEquals(expected, data);
    }

    @Test
    void edgeCases() {
        int[][] cases = { { 1, 2, 3, 4 }, { 4, 3, 2, 1 }, { 5, 5, 5 }, { Integer.MAX_VALUE, Integer.MIN_VALUE, 0, -1, 1 } };
        for (int[] c : cases) {
            int[] expected = c.clone();
            Arrays.sort(expected);
            ParallelMergeSort.sort(c, 1, POOL);
            assertArrayEquals(expected, c);
        }
    }

    @Test
    void taskCounts() {
        assertEquals(4_095, ParallelMergeSort.countTasks(2_000_000, 1_000));
        assertEquals(511, ParallelMergeSort.countTasks(2_000_000, 8_192));
        assertEquals(63, ParallelMergeSort.countTasks(2_000_000, 100_000));
        assertEquals(1, ParallelMergeSort.countTasks(10, 10));
        assertEquals(3, ParallelMergeSort.countTasks(11, 10));
    }

    @Test
    void validation() {
        assertThrows(IllegalArgumentException.class, () -> ParallelMergeSort.sort(new int[5], 0, POOL));
        assertThrows(NullPointerException.class, () -> ParallelMergeSort.sort(null, 8, POOL));
    }
}
```
