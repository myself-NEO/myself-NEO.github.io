# Sorting & Binary Search — From Scratch to Advanced

A complete, self-contained deep dive for Java interviews.

**How to use this file:** Part 0 explains why these two topics belong together: sorting
*creates* order, and binary search *exploits* it. Part 1 covers sorting: Java's own sorts, the
algorithms you're expected to write (merge sort, quicksort, quickselect, counting/radix/bucket),
and custom orders. Part 2 covers binary search: **one** template, then every variant interviews use,
including binary search *on the answer*. Part 3 has the recognition table, the checklist, the
practice ladder and the one-page summary.

Every solution below compiles and passes randomised tests against brute-force references.
Problem numbers like **LC 34** refer to LeetCode.

---

## Table of Contents

**[Part 0 — The mental model](#part-0--the-mental-model)**

**[Part 1 — Sorting](#part-1--sorting)**
1. [Java's sorting API](#11-javas-sorting-api)
2. [Stability](#12-stability--and-why-it-matters)
3. [Merge sort](#13-merge-sort)
4. [Merge sort as a counting tool](#14-merge-sort-as-a-counting-tool)
5. [Quicksort with 3-way partitioning](#15-quicksort-with-3-way-partitioning)
6. [Dutch national flag](#16-dutch-national-flag)
7. [Quickselect](#17-quickselect--the-k-th-element-in-on)
8. [Linear-time sorts](#18-linear-time-sorts--counting-radix-buckets)
9. [Custom orders](#19-custom-orders)
10. [Sorting as preprocessing](#110-sorting-as-preprocessing)
11. [Algorithm comparison](#111-sorting-algorithms-compared)

**[Part 2 — Binary search](#part-2--binary-search)**
1. [The one template](#21-the-one-template--lower-bound)
2. [Java's built-in searches](#22-javas-built-in-searches)
3. [Binary search on a predicate](#23-binary-search-on-a-predicate)
4. [Rotated sorted arrays](#24-rotated-sorted-arrays)
5. [Peaks](#25-peaks-and-unimodal-arrays)
6. [Binary search on the answer](#26-binary-search-on-the-answer-)
7. [2D matrices](#27-2d-matrices)
8. [Roots, integer and real](#28-roots-integer-and-real)
9. [Median of two sorted arrays](#29-median-of-two-sorted-arrays-)
10. [Binary search inside data structures](#210-binary-search-inside-data-structures)

**[Part 3 — Solving any sorting or searching question](#part-3--solving-any-sorting-or-searching-question)**

---

# Part 0 — The Mental Model

**Sorting buys structure.** Once data is sorted:
- equal items sit next to each other: grouping, deduplication, counting runs;
- every "pair that sums to x" question becomes **two pointers**;
- every "where would x go?" question becomes **binary search**;
- interval and scheduling problems become a single **sweep** (*Greedy & Intervals* guide);
- the k-th smallest is just index `k - 1`.

The price is O(n log n), and for comparison sorts that's a hard floor: there are `n!` possible
orders, and each comparison gives one bit of information, so you need `log₂(n!) ≈ n log n`
comparisons. Beating it requires *not comparing*: counting, radix and bucket sorts (1.8), which exploit the
value range.

**Binary search exploits monotonic structure.** It doesn't really need a sorted *array*. It needs a
question whose answers look like

```text
index / value:   0     1     2     3     4     5     6
predicate:      false false false true  true  true  true
                                  ^ binary search finds this boundary in O(log n)
```

Every probe in the middle eliminates half of the candidates. Sorted arrays, rotated arrays, "is
speed k fast enough?", "can we split into ≤ m groups with max sum ≤ x?": all are the same
search for the first `true`.

The sentences to say in an interview:

> *Sorting costs O(n log n) once, and turns this into a linear scan or two pointers.*
> *The feasibility check is monotonic, so I can binary search on the answer: O(log range) checks of O(n) each.*

---

# Part 1 — Sorting

## 1.1 Java's sorting API

```java
static void javaSortingApi() {
    int[] nums = { 5, 2, 9, 1 };
    Arrays.sort(nums);                             // [1, 2, 5, 9]  primitives: dual-pivot quicksort

    Integer[] boxed = { 5, 2, 9, 1 };
    Arrays.sort(boxed, Collections.reverseOrder());        // [9, 5, 2, 1]  objects: TimSort, stable

    int[][] intervals = { { 3, 5 }, { 1, 4 }, { 1, 2 } };
    Arrays.sort(intervals, (a, b) -> a[0] != b[0]
            ? Integer.compare(a[0], b[0])
            : Integer.compare(a[1], b[1]));
    // [[1, 2], [1, 4], [3, 5]]  by start, then by end

    List<String> words = new ArrayList<>(List.of("pear", "fig", "apple", "kiwi"));
    words.sort(Comparator.comparingInt(String::length).thenComparing(Comparator.reverseOrder()));
    // [fig, pear, kiwi, apple]  by length, then reverse alphabetical

    int[] descending = Arrays.stream(nums).boxed()
            .sorted(Comparator.reverseOrder())
            .mapToInt(Integer::intValue)
            .toArray();
    // [9, 5, 2, 1]  int[] has no comparator overload:
    // box it, or sort ascending and reverse in place
}
```

| Call | Algorithm | Stable? | Complexity |
|---|---|---|---|
| `Arrays.sort(int[])` (any primitive array) | dual-pivot quicksort, with insertion sort for tiny ranges | no (irrelevant for primitives) | O(n log n); modern JDKs fall back to heapsort, so the worst case is too |
| `Arrays.sort(T[])`, `Arrays.sort(T[], cmp)` | **TimSort** (adaptive merge sort) | **yes** | O(n log n) worst, **O(n)** on already sorted input |
| `Collections.sort(list)`, `list.sort(cmp)` | TimSort (copies into an array) | yes | same |
| `Arrays.parallelSort` | parallel merge sort (Fork/Join) | yes for objects | helps beyond roughly 10⁵–10⁶ elements |

**Comparator rules that cost people points:**
1. **Never `(a, b) -> a - b`.** It overflows for large or negative values and returns the wrong sign. Use
   `Integer.compare(a, b)`, `Comparator.comparingInt(...)` or `Long.compare`.
2. **`reversed()` applies to the whole chain built so far.** `comparing(A).thenComparing(B).reversed()`
   reverses both keys. To reverse only one, pass a reversed comparator to that step.
3. **A comparator must be consistent**: transitive, and `compare(a, b) == -compare(b, a)`. TimSort detects
   violations and throws `IllegalArgumentException: Comparison method violates its general contract!`.
4. **`int[]` has no comparator overload.** Either box it (as above), or sort ascending and reverse
   in place with two pointers, which avoids boxing.

## 1.2 Stability — and why it matters

A sort is **stable** if equal keys keep their original relative order. That matters whenever records carry
more than the key: sort employees by department, and within a department they stay in the order
they were in (for example, by hire date, if they were sorted by that first).

That gives the classic trick: **sorting by several keys = stable sorts from the least significant
key to the most significant**. Radix sort (1.8) is exactly this idea applied to digits. In Java you'd normally just
write one comparator with `thenComparing`. Stability still matters for the objects you pass to
`Arrays.sort`, which is why Java uses TimSort there.

## 1.3 Merge sort

**Idea:** split in half, sort each half recursively, merge the two sorted halves in linear time.

```java
public void mergeSort(int[] a) {
    int[] tmp = new int[a.length];               // one buffer for the whole sort
    mergeSort(a, tmp, 0, a.length - 1);
}

private void mergeSort(int[] a, int[] tmp, int lo, int hi) {
    if (lo >= hi) return;
    int mid = lo + (hi - lo) / 2;
    mergeSort(a, tmp, lo, mid);
    mergeSort(a, tmp, mid + 1, hi);
    if (a[mid] <= a[mid + 1]) return;            // halves already in order: skip the merge
    merge(a, tmp, lo, mid, hi);
}

private void merge(int[] a, int[] tmp, int lo, int mid, int hi) {
    System.arraycopy(a, lo, tmp, lo, hi - lo + 1);
    int i = lo, j = mid + 1;
    for (int k = lo; k <= hi; k++) {
        if (i > mid) a[k] = tmp[j++];            // left run used up
        else if (j > hi) a[k] = tmp[i++];        // right run used up
        // strict '<': equal keys keep their order (stable)
        else if (tmp[j] < tmp[i]) a[k] = tmp[j++];
        else a[k] = tmp[i++];
    }
}
```

**Properties to state:**
- O(n log n) **always**: log n levels, O(n) merging per level.
- **Stable**, because ties take from the left run first.
- O(n) extra memory for the buffer. Allocate it **once**, not in every call.
- The `a[mid] <= a[mid + 1]` shortcut makes already sorted input O(n). TimSort generalises this
  by detecting natural runs.
- It's the natural sort for **linked lists**, where merging needs no buffer (*Linked Lists* guide),
  and for **external sorting** (data bigger than memory: sort chunks, then k-way merge them).

## 1.4 Merge sort as a counting tool

During a merge, both halves are sorted, so when an element from the right half is placed before
the remaining left elements, it's smaller than **all of them at once**. That turns O(n²) pair
counting into O(n log n):

```java
// Pairs i < j with a[i] > a[j]: count them while merging. O(n log n) instead of O(n^2).
public long countInversions(int[] a) {
    return sortAndCount(a.clone(), new int[a.length], 0, a.length - 1);
}

private long sortAndCount(int[] a, int[] tmp, int lo, int hi) {
    if (lo >= hi) return 0;
    int mid = lo + (hi - lo) / 2;
    long count = sortAndCount(a, tmp, lo, mid) + sortAndCount(a, tmp, mid + 1, hi);
    System.arraycopy(a, lo, tmp, lo, hi - lo + 1);
    int i = lo, j = mid + 1;
    for (int k = lo; k <= hi; k++) {
        if (i > mid) a[k] = tmp[j++];
        else if (j > hi) a[k] = tmp[i++];
        else if (tmp[j] < tmp[i]) {
            count += mid - i + 1;       // tmp[j] is smaller than EVERY element left in the left run
            a[k] = tmp[j++];
        } else a[k] = tmp[i++];
    }
    return count;
}

// LC 493: pairs i < j with nums[i] > 2 * nums[j]. Count with two pointers, then merge.
public int reversePairs(int[] nums) {
    return (int) reversePairs(nums.clone(), new int[nums.length], 0, nums.length - 1);
}

private long reversePairs(int[] a, int[] tmp, int lo, int hi) {
    if (lo >= hi) return 0;
    int mid = lo + (hi - lo) / 2;
    long count = reversePairs(a, tmp, lo, mid) + reversePairs(a, tmp, mid + 1, hi);
    for (int i = lo, j = mid + 1; i <= mid; i++) {          // both halves are sorted now
        while (j <= hi && (long) a[i] > 2L * a[j]) j++;     // long: 2 * a[j] can overflow int
        count += j - (mid + 1);
    }
    merge(a, tmp, lo, mid, hi);
    return count;
}
```

The **inversion count** measures how unsorted an array is (it equals the number of swaps bubble sort
would do). The same "count across the two halves, then merge" structure solves:
- LC 493 Reverse Pairs (above);
- LC 315 Count of Smaller Numbers After Self (track the original indexes);
- LC 327 Count of Range Sum (on prefix sums).

## 1.5 Quicksort with 3-way partitioning

**Idea:** pick a pivot, partition into `< pivot`, `= pivot`, `> pivot`, and recurse on the outer
parts. **3-way** partitioning (Dijkstra's) keeps the equal block out of the recursion, which fixes
the classic O(n²) behaviour on arrays with many duplicates.

```java
public void quickSort(int[] a) {
    quickSort(a, 0, a.length - 1);
}

private void quickSort(int[] a, int lo, int hi) {
    if (lo >= hi) return;
    // random: no adversarial O(n^2)
    int pivot = a[lo + ThreadLocalRandom.current().nextInt(hi - lo + 1)];
    int lt = lo, i = lo, gt = hi;      // a[lo..lt) < pivot, a[lt..i) == pivot, a(gt..hi] > pivot
    while (i <= gt) {
        if (a[i] < pivot) swap(a, lt++, i++);
        // don't advance i: the swapped-in value is unchecked
        else if (a[i] > pivot) swap(a, i, gt--);
        else i++;
    }
    quickSort(a, lo, lt - 1);          // the block equal to the pivot is final: never recursed on
    quickSort(a, gt + 1, hi);
}

private void swap(int[] a, int i, int j) {
    int t = a[i];
    a[i] = a[j];
    a[j] = t;
}
```

**Properties to state:**
- Expected O(n log n); worst case O(n²). A **random pivot** makes the worst case astronomically
  unlikely for any input. A fixed pivot (first or last element) is O(n²) on already sorted input, a classic bug.
- In place: O(log n) expected stack. For a guaranteed O(log n) stack, recurse into the smaller
  side and loop on the larger.
- **Not stable.**
- Fast in practice: sequential memory access, and no buffer to copy.

**Why the `i` pointer doesn't advance after swapping with `gt`:** the value that comes back from the right
end hasn't been examined yet. This is the single most common bug in 3-way partitioning.

## 1.6 Dutch national flag

**LC 75 Sort Colors:** sort an array of 0s, 1s and 2s in one pass with O(1) space. It's the 3-way
partition with the pivot fixed at 1:

```java
// LC 75 Sort Colors (Dutch national flag): one pass, O(1) space. The same 3-way partition, pivot 1.
public void sortColors(int[] nums) {
    int lt = 0, i = 0, gt = nums.length - 1;     // [0, lt) = 0s, [lt, i) = 1s, (gt, end] = 2s
    while (i <= gt) {
        if (nums[i] == 0) swap(nums, lt++, i++);
        else if (nums[i] == 2) swap(nums, i, gt--);
        else i++;
    }
}
```

The comment on the first line of the method is the **invariant**. Write it before the loop, and
the three branches follow from it.

## 1.7 Quickselect — the k-th element in O(n)

You don't need to sort everything to find the k-th largest. Partition once, and **keep only the side that
contains the answer**:

```java
// LC 215: the k-th largest element in expected O(n):
// partition, then keep only the side with the answer.
public int findKthLargest(int[] nums, int k) {
    int[] a = nums.clone();
    int target = a.length - k;                   // its index in ascending order
    int lo = 0, hi = a.length - 1;
    while (true) {
        int pivot = a[lo + ThreadLocalRandom.current().nextInt(hi - lo + 1)];
        int lt = lo, i = lo, gt = hi;
        while (i <= gt) {                        // 3-way partition, exactly as in quicksort
            if (a[i] < pivot) swap(a, lt++, i++);
            else if (a[i] > pivot) swap(a, i, gt--);
            else i++;
        }
        if (target < lt) hi = lt - 1;            // the answer is among the smaller values
        else if (target > gt) lo = gt + 1;       // ... among the larger values
        else return pivot;                       // ... or inside the block equal to the pivot
    }
}
```

**Expected O(n):** the work is `n + n/2 + n/4 + …` ≈ 2n with good pivots. The worst case is O(n²) (the
median-of-medians algorithm guarantees O(n), but nobody codes it in interviews).

| Method for the k-th largest | Time | Extra space | Notes |
|---|---|---|---|
| Sort, index | O(n log n) | O(1)–O(n) | simplest; fine for most inputs |
| Min-heap of size k | O(n log k) | O(k) | streams; best when k is small (*Stacks, Queues & Heaps* guide) |
| Quickselect | **O(n)** expected | O(1) in place | reorders the array (here: a copy) |

## 1.8 Linear-time sorts — counting, radix, buckets

When values are integers in a known range, you can sort **without comparisons**.

**Counting sort:** values in `[0, k]`, O(n + k).

```java
// Values in [0, maxValue]: O(n + maxValue), no comparisons at all.
public int[] countingSort(int[] a, int maxValue) {
    int[] count = new int[maxValue + 1];
    for (int x : a) count[x]++;
    int[] out = new int[a.length];
    int k = 0;
    for (int v = 0; v <= maxValue; v++) {
        for (int c = 0; c < count[v]; c++) out[k++] = v;
    }
    return out;
}
```

**Radix sort (LSD):** sort by the least significant digit first, then the next, using a **stable**
counting sort for each digit. With base 256, 32-bit ints take 4 passes: O(4(n + 256)), linear in n.

```java
// LSD radix sort for any ints: 4 stable counting passes, one per byte. O(4 * (n + 256)).
public void radixSort(int[] a) {
    int[] buf = new int[a.length];
    for (int shift = 0; shift < 32; shift += 8) {
        int[] start = new int[257];
        for (int x : a) start[byteAt(x, shift) + 1]++;
        // start[d] = first slot for digit d
        for (int d = 0; d < 256; d++) start[d + 1] += start[d];
        // stable: keeps the previous pass's order
        for (int x : a) buf[start[byteAt(x, shift)]++] = x;
        System.arraycopy(buf, 0, a, 0, a.length);
    }
}

private int byteAt(int x, int shift) {
    // flipping the sign bit sorts negatives first
    return ((x ^ Integer.MIN_VALUE) >>> shift) & 0xFF;
}
```

**Why flip the sign bit:** in two's complement, negatives have the top bit set, so sorted as unsigned bytes
they'd come *after* the positives. XOR-ing with `Integer.MIN_VALUE` maps signed order onto unsigned
order.

**Bucket sort / pigeonhole:** spread values into buckets by range. **LC 164 Maximum Gap** needs
the largest gap between neighbours in sorted order, in O(n):

```java
// LC 164: the largest gap between neighbours in sorted order, in O(n) with buckets.
public int maximumGap(int[] nums) {
    int n = nums.length;
    if (n < 2) return 0;
    int min = Arrays.stream(nums).min().getAsInt(), max = Arrays.stream(nums).max().getAsInt();
    if (min == max) return 0;
    int size = Math.max(1, (max - min) / (n - 1));   // the answer is at least this, so it never
    // lies inside one bucket: only bucket edges matter
    int buckets = (max - min) / size + 1;
    int[] lo = new int[buckets], hi = new int[buckets];
    Arrays.fill(lo, Integer.MAX_VALUE);
    Arrays.fill(hi, Integer.MIN_VALUE);
    for (int x : nums) {
        int b = (x - min) / size;
        lo[b] = Math.min(lo[b], x);
        hi[b] = Math.max(hi[b], x);
    }
    int best = 0, prevMax = min;
    for (int b = 0; b < buckets; b++) {
        if (lo[b] == Integer.MAX_VALUE) continue;    // empty bucket
        best = Math.max(best, lo[b] - prevMax);      // the gap from the previous non-empty bucket
        prevMax = hi[b];
    }
    return best;
}
```

**Why only bucket edges matter:** n values in `[min, max]` have n − 1 gaps summing to `max − min`,
so the largest gap is at least `(max − min) / (n − 1)`. With buckets of that width, two values in
the same bucket are closer than the answer, so the answer is always between the max of one non-empty
bucket and the min of the next.

## 1.9 Custom orders

**LC 179 Largest Number:** arrange numbers to form the largest concatenation. Neither numeric
order nor string order works (`[3, 30]` must give `"330"`). Compare by **which concatenation is
bigger**:

```java
// LC 179: arrange numbers to form the largest number. Order a before b if a+b > b+a as strings.
public String largestNumber(int[] nums) {
    String[] s = Arrays.stream(nums).mapToObj(String::valueOf).toArray(String[]::new);
    Arrays.sort(s, (a, b) -> (b + a).compareTo(a + b));
    if (s[0].equals("0")) return "0";                // all zeros: "000" -> "0"
    return String.join("", s);
}
```

This comparator is transitive, which can be proved by treating the strings as numbers in base 10, so it's
a valid sort order. Mention the all-zeros case: `[0, 0]` must return `"0"`, not `"00"`.

**LC 791 Custom Sort String:** order characters by a given ranking. With a small alphabet, counting
beats a comparator, at O(n):

```java
// LC 791: reorder s so that characters follow 'order'; others anywhere. Counting, O(n).
public String customSortString(String order, String s) {
    int[] count = new int[26];
    for (char ch : s.toCharArray()) count[ch - 'a']++;
    StringBuilder out = new StringBuilder();
    for (char ch : order.toCharArray()) {            // the custom order first ...
        for (; count[ch - 'a'] > 0; count[ch - 'a']--) out.append(ch);
    }
    for (int c = 0; c < 26; c++) {                   // ... then everything else
        for (; count[c] > 0; count[c]--) out.append((char) ('a' + c));
    }
    return out.toString();
}
```

## 1.10 Sorting as preprocessing

Many "hard-looking" problems are easy once the input is sorted. **LC 274 H-Index:** the largest `h` such that `h`
papers have at least `h` citations each. Sort descending and scan, or, since `h ≤ n`, use counting sort
for O(n):

```java
// LC 274: the largest h such that h papers have at least h citations. Counting sort, O(n).
public int hIndex(int[] citations) {
    int n = citations.length;
    int[] count = new int[n + 1];                    // counts above n are capped: h can't exceed n
    for (int c : citations) count[Math.min(c, n)]++;
    int papers = 0;
    for (int h = n; h >= 0; h--) {
        papers += count[h];                          // papers with at least h citations
        if (papers >= h) return h;
    }
    return 0;
}
```

Recognise these "sort first" signals:
- **pairs, triplets, closest sum** → sort, then two pointers (3Sum, 3Sum Closest);
- **intervals, meetings, overlaps** → sort by start or end, then sweep (*Greedy & Intervals* guide);
- **anagrams, grouping by canonical form** → sort each word as its key;
- **minimise the maximum difference / assign in order** → sort both sides, then match greedily;
- **dedupe without extra memory** → sort, then skip equal neighbours.

## 1.11 Sorting algorithms compared

| Algorithm | Best | Average | Worst | Extra space | Stable | Notes |
|---|---|---|---|---|---|---|
| Insertion sort | O(n) | O(n²) | O(n²) | O(1) | yes | fast for tiny or nearly sorted arrays; used inside TimSort |
| Selection sort | O(n²) | O(n²) | O(n²) | O(1) | no | the fewest writes (n swaps) |
| Bubble sort | O(n) | O(n²) | O(n²) | O(1) | yes | only for teaching |
| **Merge sort** | O(n log n) | O(n log n) | O(n log n) | O(n) | **yes** | linked lists, external sorting |
| **Quicksort** (random pivot) | O(n log n) | O(n log n) | O(n²) | O(log n) | no | fastest in practice for arrays |
| Heapsort | O(n log n) | O(n log n) | O(n log n) | O(1) | no | in place *and* guaranteed (*Stacks, Queues & Heaps*) |
| TimSort | O(n) | O(n log n) | O(n log n) | O(n) | yes | Java (objects), Python |
| Counting sort | O(n + k) | O(n + k) | O(n + k) | O(n + k) | yes* | small integer range k |
| Radix sort (LSD) | O(d(n + b)) | O(d(n + b)) | O(d(n + b)) | O(n + b) | yes | d digits in base b |

\* when written with prefix sums, as in the radix version.

---

# Part 2 — Binary Search

## 2.1 The one template — lower bound

Most binary-search bugs come from mixing conventions: `<=` versus `<`, `hi = mid` versus `hi = mid - 1`. Learn
**one** template, and derive every variant from it:

```java
// The first index i in [0, n] with a[i] >= target (n if there is none). The template to memorise.
public int lowerBound(int[] a, int target) {
    int lo = 0, hi = a.length;               // the answer always stays inside [lo, hi]
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;        // not (lo + hi) / 2: that can overflow
        if (a[mid] < target) lo = mid + 1;   // mid is too small: the answer is to its right
        else hi = mid;                       // mid could be the answer: keep it in range
    }
    return lo;                               // lo == hi
}

// The first index with a[i] > target: the same loop with '<=' in place of '<'.
public int upperBound(int[] a, int target) {
    int lo = 0, hi = a.length;
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] <= target) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

// LC 34: first and last position of target.
public int[] searchRange(int[] nums, int target) {
    int first = lowerBound(nums, target);
    if (first == nums.length || nums[first] != target) return new int[] { -1, -1 };
    return new int[] { first, upperBound(nums, target) - 1 };
}

// LC 35: the insertion position IS the lower bound.
public int searchInsert(int[] nums, int target) {
    return lowerBound(nums, target);
}
```

**Why it's correct:**
- **The invariant:** everything left of `lo` is `< target`; everything at or right of `hi` is `≥ target`.
  So the answer is always in `[lo, hi]`, and when `lo == hi` it *is* the answer.
- **`hi = a.length`** (not `length - 1`) lets "insert at the end" be a valid answer.
- **Termination:** `mid < hi` always holds, so `hi = mid` shrinks the range, and so does `lo = mid + 1`. It can't
  loop forever.
- **`lo + (hi - lo) / 2`** avoids the overflow of `(lo + hi)` when both are near `Integer.MAX_VALUE`.
  `(lo + hi) >>> 1` is an equivalent trick.

The family, all from this one loop:

| Want | Use |
|---|---|
| first index with `a[i] ≥ x` (insertion point) | `lowerBound(x)` |
| first index with `a[i] > x` | `upperBound(x)` |
| does `x` exist? | `lb < n && a[lb] == x` |
| first / last occurrence of `x` | `lowerBound(x)` / `upperBound(x) - 1` |
| how many times `x` occurs | `upperBound(x) - lowerBound(x)` |
| largest element `< x` | index `lowerBound(x) - 1` (if ≥ 0) |
| largest element `≤ x` (floor) | index `upperBound(x) - 1` (if ≥ 0) |

## 2.2 Java's built-in searches

```java
static void javaSearchApi() {
    int[] sorted = { 1, 3, 3, 5, 8 };
    int found = Arrays.binarySearch(sorted, 5);              // 3
    int missing = Arrays.binarySearch(sorted, 4);            // -4 = -(insertion point 3) - 1
    int insertAt = -missing - 1;                             // 3
    // With duplicates, binarySearch returns ANY matching
    // index: use a lower bound (2.1) for the first.

    TreeSet<Integer> set = new TreeSet<>(List.of(1, 3, 5, 8));
    Integer floor = set.floor(4);                            // 3   largest <= 4
    Integer ceiling = set.ceiling(4);                        // 5   smallest >= 4
    Integer higher = set.higher(8);                          // null: nothing > 8
}
```

Use the built-ins when they fit, but know their limits: `Arrays.binarySearch` returns *some*
matching index (not the first) when there are duplicates, and it needs the exact array type.
Write your own lower bound in interviews anyway: it shows you understand the invariant.

## 2.3 Binary search on a predicate

Abstract the template once more: search for the **first `x` where a monotonic predicate becomes
true**. Every problem in the rest of Part 2 is this function plus a predicate:

```java
// The general form: the smallest x in [lo, hi] with ok(x) == true, for a predicate shaped like
// false false ... false true true ... true. Returns hi + 1 if ok is never true.
public long firstTrue(long lo, long hi, LongPredicate ok) {
    long left = lo, right = hi + 1;          // search [left, right); right means "none found yet"
    while (left < right) {
        long mid = left + (right - left) / 2;
        if (ok.test(mid)) right = mid;       // mid works: the first true is mid or before it
        else left = mid + 1;                 // mid fails: the first true is after it
    }
    return left;
}
```

- **The last `true`** of a `true … true false … false` predicate is `firstTrue(not predicate) - 1` (used in 2.6).
- `long` everywhere, because answer ranges like `[1, 10^9]` and sums of weights overflow `int` fast.
- **The hard part isn't the loop; it's proving the predicate is monotonic.** Say it out loud: "if speed
  k works, any faster speed also works".

## 2.4 Rotated sorted arrays

A sorted array rotated at an unknown point (`[4, 5, 6, 7, 0, 1, 2]`). **The key fact:** split it
anywhere, and at least one half is still sorted. Check the target against the sorted half's range,
then discard a half.

```java
// LC 33: search in a rotated sorted array (distinct values).
public int searchRotated(int[] nums, int target) {
    int lo = 0, hi = nums.length - 1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (nums[mid] == target) return mid;
        if (nums[lo] <= nums[mid]) {                         // the left half [lo, mid] is sorted
            if (nums[lo] <= target && target < nums[mid]) hi = mid - 1;
            else lo = mid + 1;
        } else {                                             // the right half [mid, hi] is sorted
            if (nums[mid] < target && target <= nums[hi]) lo = mid + 1;
            else hi = mid - 1;
        }
    }
    return -1;
}

// LC 153: the minimum of a rotated sorted array (distinct values).
public int findMin(int[] nums) {
    int lo = 0, hi = nums.length - 1;
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (nums[mid] > nums[hi]) lo = mid + 1;          // the drop is to the right of mid
        else hi = mid;                                   // mid is in the low run: it may be the min
    }
    return nums[lo];
}

// LC 81: duplicates allowed. If nums[lo] == nums[mid] == nums[hi] we can't tell which half is
// sorted: shrink both ends by one. That makes the worst case O(n), e.g. [1, 1, 1, 1, 0, 1].
public boolean searchRotatedWithDuplicates(int[] nums, int target) {
    int lo = 0, hi = nums.length - 1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (nums[mid] == target) return true;
        if (nums[lo] == nums[mid] && nums[mid] == nums[hi]) {
            lo++;
            hi--;
        } else if (nums[lo] <= nums[mid]) {
            if (nums[lo] <= target && target < nums[mid]) hi = mid - 1;
            else lo = mid + 1;
        } else {
            if (nums[mid] < target && target <= nums[hi]) lo = mid + 1;
            else hi = mid - 1;
        }
    }
    return false;
}
```

**`findMin` compares with `nums[hi]`, not `nums[lo]`.** Comparing with `nums[lo]` can't tell an unrotated
array from a rotated one. With duplicates (LC 81/154), the case `nums[lo] == nums[mid] == nums[hi]` gives
no information at all, so the worst case degrades to O(n). Say so; interviewers ask.

## 2.5 Peaks and unimodal arrays

Binary search works without a sorted array: you only need to know **which side is guaranteed to
contain an answer**.

```java
// LC 162: any index whose value is bigger than both neighbours (outside the array = -infinity).
public int findPeakElement(int[] nums) {
    int lo = 0, hi = nums.length - 1;
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (nums[mid] < nums[mid + 1]) lo = mid + 1;   // uphill to the right: a peak exists there
        // downhill: mid or something left of it is a peak
        else hi = mid;
    }
    return lo;
}
```

**Why it's correct:** if `nums[mid] < nums[mid + 1]`, walking right from `mid` goes uphill. Since the array
ends at `-∞`, the climb must turn into a peak somewhere to the right. The same reasoning finds the
top of a mountain array (LC 852). For unimodal *functions* with plateaus, use **ternary search**,
or binary search on the slope.

## 2.6 Binary search on the answer ⭐

**The most important variant at medium/hard level.** The problem asks for the minimum (or maximum)
value of something, and checking whether a *given* value works is easy. Recipe:
1. **Range:** the smallest and largest possible answers. Use real bounds, not `[0, Integer.MAX_VALUE]`.
2. **Check:** a function `feasible(x)`, usually a greedy O(n) pass.
3. **Monotonic?** If `x` works, does every bigger `x` work too? Then search for the first `true`.

```java
// LC 875 Koko Eating Bananas: the smallest speed that finishes within h hours.
public int minEatingSpeed(int[] piles, int h) {
    int max = Arrays.stream(piles).max().getAsInt();
    return (int) firstTrue(1, max, k -> hoursNeeded(piles, k) <= h);   // faster is never worse
}

private long hoursNeeded(int[] piles, long k) {
    long hours = 0;
    for (int p : piles) hours += (p + k - 1) / k;      // ceil(p / k) without floating point
    return hours;
}

// LC 1011: the least ship capacity that ships every package, in order, within 'days'.
public int shipWithinDays(int[] weights, int days) {
    long lo = Arrays.stream(weights).max().getAsInt();       // it must carry the heaviest package
    long hi = Arrays.stream(weights).asLongStream().sum();   // everything in one day
    return (int) firstTrue(lo, hi, cap -> daysNeeded(weights, cap) <= days);
}

private int daysNeeded(int[] weights, long capacity) {   // greedy: fill each day as far as possible
    int needed = 1;
    long load = 0;
    for (int w : weights) {
        if (load + w > capacity) {
            needed++;
            load = 0;
        }
        load += w;
    }
    return needed;
}

// LC 410 Split Array Largest Sum: exactly the same check with k pieces.
public int splitArray(int[] nums, int k) {
    long lo = Arrays.stream(nums).max().getAsInt();
    long hi = Arrays.stream(nums).asLongStream().sum();
    return (int) firstTrue(lo, hi, cap -> daysNeeded(nums, cap) <= k);
}

// LC 1552: place m balls to MAXIMISE the minimum distance: the last value where the check passes.
public int maxDistance(int[] position, int m) {
    int[] pos = position.clone();
    Arrays.sort(pos);
    long span = pos[pos.length - 1] - pos[0];
    long firstFail = firstTrue(1, span + 1, d -> !canPlace(pos, m, d));
    return (int) (firstFail - 1);                           // the largest distance that still works
}

// greedy: place each ball as early as allowed
private boolean canPlace(int[] pos, int m, long minGap) {
    int placed = 1;
    long last = pos[0];
    for (int i = 1; i < pos.length && placed < m; i++) {
        if (pos[i] - last >= minGap) {
            placed++;
            last = pos[i];
        }
    }
    return placed >= m;
}
```

| Problem | Answer range | Feasibility check (greedy) |
|---|---|---|
| Koko (875) | speed `[1, max pile]` | hours = Σ ⌈pile / k⌉ ≤ h |
| Ship packages (1011) | capacity `[max weight, total]` | fill each day greedily; days ≤ D |
| Split array (410) | largest sum `[max, total]` | the same greedy; pieces ≤ k |
| Magnetic balls (1552) | min gap `[1, span]` | place greedily from the left; count ≥ m (find the *last* true) |
| Bouquets (1482) | day `[min, max]` | count runs of bloomed flowers |
| Smallest divisor (1283) | divisor `[1, max]` | Σ ⌈x / d⌉ ≤ threshold |

**Why the greedy checks are optimal:** for "ship within D days", putting each package on the current day
whenever it fits never hurts. Delaying a package can only increase the number of days needed. Say
that sentence: interviewers want the justification, not just the code.

## 2.7 2D matrices

```java
// LC 74: each row sorted, and each row starts after the previous one ends = one sorted array.
public boolean searchMatrix(int[][] matrix, int target) {
    int m = matrix.length, n = matrix[0].length;
    int lo = 0, hi = m * n - 1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        int v = matrix[mid / n][mid % n];                    // flat index -> (row, column)
        if (v == target) return true;
        if (v < target) lo = mid + 1;
        else hi = mid - 1;
    }
    return false;
}

// LC 240: rows and columns sorted independently. From the top-right corner every step
// discards a whole row or a whole column: O(m + n).
public boolean searchMatrixII(int[][] matrix, int target) {
    int r = 0, c = matrix[0].length - 1;
    while (r < matrix.length && c >= 0) {
        int v = matrix[r][c];
        if (v == target) return true;
        if (v > target) c--;                            // everything below in this column is bigger
        else r++;                                       // everything left in this row is smaller
    }
    return false;
}

// LC 378: k-th smallest in an n x n matrix with sorted
// rows and columns: binary search on the VALUE.
public int kthSmallest(int[][] matrix, int k) {
    int n = matrix.length;
    return (int) firstTrue(matrix[0][0], matrix[n - 1][n - 1], v -> countAtMost(matrix, v) >= k);
}

private int countAtMost(int[][] matrix, long v) {           // staircase from the bottom-left: O(n)
    int n = matrix.length, count = 0, r = n - 1, c = 0;
    while (r >= 0 && c < n) {
        if (matrix[r][c] <= v) {
            count += r + 1;                                  // this column, rows 0..r, are all <= v
            c++;
        } else {
            r--;
        }
    }
    return count;
}
```

**Three different matrix searches:**
- **LC 74:** the rows chain into one sorted list, so it's a 1-D binary search over flat indexes: O(log(mn)).
- **LC 240:** rows and columns are sorted separately. Binary search per row is O(m log n), but the **staircase** from a
  corner is O(m + n). Start at a corner where one direction increases and the other decreases
  (top-right or bottom-left).
- **LC 378:** the k-th smallest. Binary search on the **value**, counting the elements `≤ v` with the staircase:
  O(n log(range)). The first `v` with count ≥ k is always an element of the matrix.

## 2.8 Roots, integer and real

```java
// LC 69: floor(sqrt(x)) with integers only: the first r whose square exceeds x, minus one.
public int mySqrt(int x) {
    long first = firstTrue(0, (long) x + 1, r -> r * r > x);
    return (int) (first - 1);
}

// On doubles, don't loop "until equal": run a fixed number of halvings instead.
public double cubeRoot(double x) {
    double lo = Math.min(-1, x), hi = Math.max(1, x);     // the root lies in here, even for |x| < 1
    for (int iter = 0; iter < 100; iter++) {             // 100 halvings: far below double precision
        double mid = (lo + hi) / 2;
        if (mid * mid * mid < x) lo = mid;
        else hi = mid;
    }
    return (lo + hi) / 2;
}
```

**Integer roots:** search for the first `r` with `r² > x` using `long` arithmetic (`r * r` overflows
`int` from about 46,341). Avoid `Math.sqrt` in interviews unless it's allowed. Floating point
also has edge cases near perfect squares.

**Real-valued search:** never loop `while (hi - lo > eps)` with an absolute epsilon. On large
values it can spin forever, because doubles can't represent the midpoint. A fixed number of
iterations (about 60–100) always terminates, and each halving gains one bit of precision.

## 2.9 Median of two sorted arrays ⭐⭐

**LC 4:** the median of two sorted arrays in O(log(min(m, n))). A famous hard problem that is pure binary
search once you see the trick.

**Idea.** The median splits the combined data into a left half and a right half of equal size.
Choose `i` elements from the shorter array `a` for the left half. Then `j = half − i` must come from
`b`. The split is valid when everything on the left is ≤ everything on the right:
`a[i−1] ≤ b[j]` and `b[j−1] ≤ a[i]`. If `a[i−1] > b[j]`, you took too many from `a`, so move left;
otherwise move right. Binary search on `i`.

```text
a:  1  3 | 8  9            i = 2 elements from a
b:  2  4  5 | 7 10 11      j = 3 elements from b      (half = (4 + 6 + 1) / 2 = 5)
left = {1, 3, 2, 4, 5}  max = 5      right = {8, 9, 7, 10, 11}  min = 7
valid (3 <= 7 and 5 <= 8); even total -> median = (5 + 7) / 2 = 6.0
```

```java
// LC 4: the median of two sorted arrays in O(log(min(m, n))) by binary-searching a partition.
public double findMedianSortedArrays(int[] a, int[] b) {
    if (a.length > b.length) return findMedianSortedArrays(b, a);   // search the SHORTER array
    int m = a.length, n = b.length, half = (m + n + 1) / 2;
    int lo = 0, hi = m;
    while (lo <= hi) {
        int i = (lo + hi) / 2;                   // take i elements from a ...
        int j = half - i;                        // ... and the rest of the left half from b
        int aLeft = (i == 0) ? Integer.MIN_VALUE : a[i - 1];
        int aRight = (i == m) ? Integer.MAX_VALUE : a[i];
        int bLeft = (j == 0) ? Integer.MIN_VALUE : b[j - 1];
        int bRight = (j == n) ? Integer.MAX_VALUE : b[j];
        if (aLeft <= bRight && bLeft <= aRight) {           // every left element <= every right one
            if ((m + n) % 2 == 1) return Math.max(aLeft, bLeft);
            return (Math.max(aLeft, bLeft) + (double) Math.min(aRight, bRight)) / 2;
        }
        if (aLeft > bRight) hi = i - 1;          // took too many from a
        else lo = i + 1;                         // took too few from a
    }
    throw new IllegalArgumentException("inputs must be sorted");
}
```

**The details:** search the shorter array, so `j` never goes negative. Use `±∞` sentinels for empty
sides. For an odd total, the left half holds one extra element, so the median is the max of the left side.

## 2.10 Binary search inside data structures

**LC 981 Time Based Key-Value Store:** `get(key, t)` returns the value set at the latest time ≤ `t`.
Timestamps arrive in increasing order, so each key's list is already sorted: binary search it.

```java
// LC 981: set(key, value, timestamp) with increasing
// timestamps; get = the latest value at or before t.
class TimeMap {
    private final Map<String, List<Integer>> times = new HashMap<>();
    private final Map<String, List<String>> values = new HashMap<>();

    public void set(String key, String value, int timestamp) {
        // appended in sorted order
        times.computeIfAbsent(key, k -> new ArrayList<>()).add(timestamp);
        values.computeIfAbsent(key, k -> new ArrayList<>()).add(value);
    }

    public String get(String key, int timestamp) {
        List<Integer> ts = times.get(key);
        if (ts == null) return "";
        int lo = 0, hi = ts.size();                  // first index with time > timestamp
        while (lo < hi) {
            int mid = (lo + hi) >>> 1;
            if (ts.get(mid) <= timestamp) lo = mid + 1;
            else hi = mid;
        }
        return (lo == 0) ? "" : values.get(key).get(lo - 1);   // the one just before it
    }
}
```

The `TreeMap` version is shorter, using `TreeMap<Integer, String>` per key with
`floorEntry(t)`, and works even when timestamps arrive out of order, at O(log n) per insert.
Mention both. The list version shows you can write the search yourself, while the
`TreeMap` version is what you'd ship.

Other structures that are "sorted + binary search" inside:
- `TreeMap`/`TreeSet` (red-black trees: `floor`, `ceiling`, `subMap`);
- Patience sorting for **Longest Increasing Subsequence** in O(n log n): binary search the tails array (*Dynamic Programming* guide);
- databases' B-tree indexes.

---

# Part 3 — Solving Any Sorting or Searching Question

## 3.1 The decision procedure

| The problem says… | Reach for |
|---|---|
| sorted input; "find", "first/last position", "insert" | lower/upper bound (2.1) |
| "minimum X such that…" / "maximum X such that…" | binary search on the answer (2.6) |
| sorted but rotated; "minimum in rotated" | rotated search (2.4) |
| "peak", "mountain", local maximum | slope binary search (2.5) |
| sorted matrix | flat index / staircase / value search (2.7) |
| k-th smallest/largest, median of unsorted data | quickselect, heap, or sort (1.7) |
| pairs/triplets with a target sum | sort + two pointers (1.10) |
| count pairs with an order condition (inversions) | merge sort counting (1.4) |
| small integer range, or "sort in O(n)" | counting / radix / buckets (1.8) |
| "arrange to form the largest/smallest" | custom comparator (1.9) |

**Constraint hints:** n up to 10⁵–10⁶ with values up to 10⁹ and an O(n) check → binary search on
the answer, O(n log 10⁹) ≈ 30n. A sorted array plus 10⁵ queries → O(log n) per query.

## 3.2 The binary-search checklist

Before you write the loop, answer these out loud:
1. **What is the search space?** Indexes `[0, n]`, or values `[lo, hi]`? Is "not found" inside it?
2. **What's the predicate, and is it monotonic?** False → true, once.
3. **Which boundary do I want?** The first true (default) or the last true (= first false − 1)?
4. **Updates:** `ok(mid)` → `hi = mid`; not ok → `lo = mid + 1`. Loop `while (lo < hi)`.
5. **Overflow:** `mid = lo + (hi − lo) / 2`, and `long` for products and sums.
6. **Test on 1 element, 2 elements, target smaller than everything, larger than everything, and duplicates.**

## 3.3 Edge cases to test every time

| Case | What breaks |
|---|---|
| empty array | `a[0]`, `nums.length - 1 = -1` |
| one element | `mid + 1` out of bounds (peaks, rotated) |
| target below all / above all | insertion at 0 / at n |
| all elements equal | rotated search with duplicates; quicksort without 3-way partitioning |
| `Integer.MIN_VALUE` / `MAX_VALUE` | `a - b` comparators, `(lo + hi) / 2`, `-x` |
| already sorted / reverse sorted input | a fixed-pivot quicksort is O(n²) |
| huge answer ranges | `int` overflow in sums inside feasibility checks |

## 3.4 Practice ladder

**Sorting**
- Sort an Array (912): write merge sort and quicksort by hand
- Sort Colors (75) ⭐
- Kth Largest Element in an Array (215) ⭐: quickselect *and* heap
- Largest Number (179)
- Custom Sort String (791)
- H-Index (274)
- Relative Sort Array (1122)
- Maximum Gap (164)
- Wiggle Sort II (324) (quickselect + virtual indexing, hard)
- Count of Smaller Numbers After Self (315) ⭐: merge sort counting
- Reverse Pairs (493)
- Count of Range Sum (327)

**Binary search: the template**
- Binary Search (704)
- Search Insert Position (35)
- Find First and Last Position of Element in Sorted Array (34) ⭐
- First Bad Version (278)
- Sqrt(x) (69)
- Valid Perfect Square (367)

**Binary search: variants**
- Search in Rotated Sorted Array (33) ⭐
- Find Minimum in Rotated Sorted Array (153)
- Search in Rotated Sorted Array II (81)
- Find Peak Element (162)
- Peak Index in a Mountain Array (852)
- Search a 2D Matrix (74) and Search a 2D Matrix II (240)
- Kth Smallest Element in a Sorted Matrix (378)
- Time Based Key-Value Store (981)
- Single Element in a Sorted Array (540)

**Binary search on the answer ⭐**
- Koko Eating Bananas (875)
- Capacity To Ship Packages Within D Days (1011)
- Find the Smallest Divisor Given a Threshold (1283)
- Minimum Number of Days to Make m Bouquets (1482)
- Magnetic Force Between Two Balls (1552)
- Split Array Largest Sum (410) ⭐
- Minimize Max Distance to Gas Station (774) (real-valued)
- Find K-th Smallest Pair Distance (719)

**Hard**
- Median of Two Sorted Arrays (4) ⭐⭐
- Kth Smallest Number in Multiplication Table (668)
- Russian Doll Envelopes (354) (sort + LIS with binary search)

## 3.5 The mistakes that cost people offers

1. **Mixing template conventions:** `while (lo <= hi)` with `hi = mid` loops forever. Pick one template.
2. **`(lo + hi) / 2` overflow**, and `int` overflow inside feasibility sums.
3. **Comparators written as `a - b`**, or `reversed()` applied to the wrong part of a chain.
4. **Searching for "equal" when the question needs a boundary.** Duplicates break `==`-style searches.
5. **Not proving monotonicity** before binary searching on the answer, or using a wrong search range.
6. **A fixed pivot in quicksort**, which is O(n²) on sorted input. And advancing `i` after swapping with `gt`.
7. **Allocating the merge buffer inside the recursion**, which costs O(n log n) allocations.
8. **Real-valued search with an epsilon loop** that never terminates.
9. **Sorting when the problem needs the original indexes**: sort an index array or pairs instead.
10. **Forgetting that `Arrays.sort(int[])` isn't stable** when you're relying on stability (only an issue for objects).

## 3.6 The one-page summary

```text
SORT API     Arrays.sort(int[]) dual-pivot quicksort; objects: TimSort (stable, O(n) if sorted)
             comparators: Integer.compare / comparingInt / thenComparing; NEVER a - b
MERGE SORT   split, sort halves, merge with ONE buffer; stable; O(n log n) always
             counting while merging -> inversions, reverse pairs, smaller-after-self
QUICKSORT    random pivot + 3-way partition (lt / i / gt); don't advance i after swap with gt
QUICKSELECT  partition, keep the side with index n - k; expected O(n)
LINEAR       counting (small range), radix (bytes, stable passes), buckets (max gap)
CUSTOM       largest number: (b + a).compareTo(a + b); handle all zeros

BINARY SEARCH (first true):
             lo = first candidate, hi = last + 1
             while (lo < hi) { mid = lo + (hi - lo) / 2; if (ok(mid)) hi = mid; else lo = mid + 1; }
             return lo   (== hi + 1 sentinel when nothing is true)
BOUNDS       lowerBound: a[mid] < x ? go right   upperBound: a[mid] <= x ? go right
ROTATED      one half is always sorted; findMin compares with nums[hi]; duplicates -> O(n)
PEAK         nums[mid] < nums[mid+1] -> go right
ON ANSWER    range + greedy feasibility + monotonic -> first true (min) / first false - 1 (max)
MATRIX       flat index (74), staircase O(m+n) (240), value search + count (378)
REAL         fixed iteration count, not epsilon
MEDIAN       binary search the split of the shorter array; sentinels for empty sides
```

Print that block. Read it before every mock interview.
