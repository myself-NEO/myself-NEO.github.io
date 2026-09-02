# Arrays & Strings — The Complete Guide (Foundations → Advanced)

A single reference for every major array/string pattern you'll meet in interviews: two pointers, sliding window, prefix sums, range query structures (Fenwick tree, segment tree, sparse table, sqrt decomposition), Kadane's, monotonic stack/deque, binary search, and the string-specific techniques (KMP, Rabin-Karp, palindromes). Code is in Java throughout.

---

## Table of Contents

1. [How to Use This Guide](#1-how-to-use-this-guide)
2. [Foundations](#2-foundations)
3. [The Problem-Solving Framework](#3-the-problem-solving-framework)
4. [Two Pointers](#4-two-pointers)
5. [Sliding Window](#5-sliding-window)
6. [Prefix Sum & Prefix Arrays](#6-prefix-sum--prefix-arrays)
7. [Range Queries — Fenwick, Segment Tree, Sparse Table, Sqrt Decomposition](#7-range-queries)
8. [Kadane's Algorithm](#8-kadanes-algorithm)
9. [Monotonic Stack & Monotonic Deque](#9-monotonic-stack--monotonic-deque)
10. [Binary Search on Arrays](#10-binary-search-on-arrays)
11. [Sorting-Based Techniques](#11-sorting-based-techniques)
12. [Hashing Techniques](#12-hashing-techniques)
13. [String-Specific Techniques](#13-string-specific-techniques)
14. [2D Arrays / Matrix Techniques](#14-2d-arrays--matrix-techniques)
15. [Bit Manipulation Tricks](#15-bit-manipulation-tricks)
16. [Java Gotchas & Complexity Cheat Sheet](#16-java-gotchas--complexity-cheat-sheet)
17. [Practice Roadmap](#17-practice-roadmap)
18. [Final Interview Tips](#18-final-interview-tips)
19. [What's Deliberately Not Covered Here](#19-whats-deliberately-not-covered-here)

---

## 1. How to Use This Guide

Don't read this linearly in one sitting. Do this instead:

1. Read **Foundations** and **The Problem-Solving Framework** once, carefully. That's the mental model everything else hangs on.
2. For each technique section: read the concept, read the template, **close the file and try the worked example yourself** before looking at the given solution. Then read the pitfalls and do 2-3 practice problems on your own (LeetCode/equivalent).
3. Come back to the **Master Cheat Sheet** (end of Section 3) the week before your interview and quiz yourself: given only the "signal," can you name the technique without looking?
4. Treat Section 7 (Range Queries) as its own mini-project — it's the densest section and the one most people skip, which is exactly why knowing it well is a differentiator.

This guide is scoped to **arrays and strings and the techniques used to manipulate them**. It assumes you know basic loops, recursion, and what Big-O means. It does not re-derive Big-O from scratch — if that's shaky, spend 30 minutes elsewhere first.

---

## 2. Foundations

### 2.1 Arrays — what they actually are

An array is a **contiguous block of memory**. That single fact explains almost every property you rely on:

- **Random access is O(1)** — to get `arr[i]`, the computer computes `base_address + i * element_size` directly. No traversal needed.
- **Insertion/deletion in the middle is O(n)** — every element after the insertion point has to physically shift to keep the block contiguous.
- **Size is fixed at creation in Java** — `int[] arr = new int[10];` reserves exactly 10 slots. This is why `ArrayList` (backed by an array that gets reallocated and copied — amortized O(1) `add`, but a real O(n) copy under the hood whenever it resizes) exists as a dynamic alternative.

Java specifics worth internalizing:

```java
int[] arr = new int[5];              // primitive array, all zeros by default
int[] arr2 = {1, 2, 3, 4, 5};        // literal initialization
int[][] grid = new int[rows][cols];  // 2D array — actually an array of arrays in Java

Arrays.sort(arr);                     // in-place sort, ascending
Arrays.fill(arr, 0);                  // fill all slots with a value
int[] copy = Arrays.copyOf(arr, arr.length);
boolean same = Arrays.equals(arr, arr2); // element-wise equality (== only checks reference)
```

`Integer[]` (boxed) vs `int[]` (primitive) matters for interviews: primitives are faster and use less memory (no object overhead, no autoboxing), but you need `Integer[]` if you want to use a `Comparator` with `Arrays.sort` (primitive arrays can only sort ascending — no custom comparator overload exists for `int[]`).

### 2.2 Strings — what they actually are, in Java specifically

A `String` in Java is **immutable** — once created, it can never change. `s = s + "a"` doesn't modify `s`; it creates an entirely new `String` object and reassigns the reference. This single fact drives most string-technique design decisions:

- Concatenating in a loop (`result += c`) is **O(n) per operation**, so a loop of n concatenations is **O(n²)** total. This is a real interview red flag if you write it without comment.
- **`StringBuilder`** is the mutable counterpart — it maintains a resizable internal `char[]` buffer, so appends are amortized O(1), making a loop of n appends O(n) total.

```java
StringBuilder sb = new StringBuilder();
for (char c : someChars) {
    sb.append(c);           // O(1) amortized
}
String result = sb.toString(); // O(n), one-time conversion at the end
```

Other things you'll actually use:

```java
char[] chars = s.toCharArray();      // convert to mutable char array
String s2 = new String(chars);       // back to String
s.charAt(i);                          // O(1) — String is backed by a char[] internally
s.substring(i, j);                    // returns a NEW String (Java 7+: this is an O(n) copy, not O(1))
s.equals(other);                      // content comparison — ALWAYS use this, never ==
s == other;                           // reference comparison — compares object identity, not content
```

The `==` vs `.equals()` trap: string literals get interned (cached) in Java's string pool, so `"abc" == "abc"` can be `true` by coincidence, but `new String("abc") == "abc"` is `false`. Never rely on `==` for string content comparison — always use `.equals()`.

For interview problems, you'll frequently need a fixed-size frequency array instead of a `HashMap<Character, Integer>` when the alphabet is known and small (lowercase English letters → `int[26]`), because it's faster and avoids boxing:

```java
int[] freq = new int[26];
freq[c - 'a']++;   // works because 'a'..'z' are contiguous in ASCII
```

---

## 3. The Problem-Solving Framework

This is the meta-skill. Most array/string interview problems are solved by running through this sequence:

**Step 1 — Read the constraints before you think about the algorithm.**
`n ≤ 20` tolerates exponential/backtracking. `n ≤ 1000` tolerates O(n²). `n ≤ 10⁵` or `10⁶` demands O(n) or O(n log n). This alone eliminates most wrong turns before you write a line of code.

**Step 2 — Identify the signal.** Certain phrases in a problem statement point at specific techniques almost every time (full table below).

**Step 3 — State the brute force out loud**, even if you never write it. It establishes correctness and gives you something to optimize away from. Interviewers explicitly want to hear this.

**Step 4 — Ask what's being recomputed.** If you're re-summing a range you've already summed → prefix sum. If you're re-scanning a window you've already scanned → sliding window. If you're re-comparing pairs you've already ruled out → two pointers (usually after sorting).

**Step 5 — Handle edge cases before you're asked to.** Empty array, single element, all duplicates, all negative numbers, integer overflow (Java `int` maxes out at ~2.1 billion — a sum of a million elements near `Integer.MAX_VALUE` overflows silently; use `long` for accumulating sums).

**Step 6 — Dry-run on the example** the interviewer gave you, out loud, before declaring you're done.

### Master Pattern-Recognition Cheat Sheet

| Signal in the problem | Likely technique | Typical complexity |
|---|---|---|
| Contiguous subarray/substring + sum, max, or min | Sliding window, Prefix sum, or Kadane's | O(n) |
| Sorted array + find a pair/triplet matching a target | Two pointers | O(n) or O(n log n) |
| "Number of subarrays with sum == k" | Prefix sum + HashMap | O(n) |
| Range sum queries, array **never changes** | Prefix sum array | O(1)/query after O(n) build |
| Range queries, array has **point updates** | Fenwick Tree (BIT) or Segment Tree | O(log n) update & query |
| **Range updates** + range queries | Segment tree w/ lazy propagation, or dual-BIT Fenwick | O(log n) |
| Range min/max, array is **static** | Sparse Table | O(1)/query after O(n log n) build |
| "Next greater/smaller element" | Monotonic stack | O(n) |
| "Maximum/minimum in every window of size k" | Monotonic deque | O(n) |
| Numbers confined to range [1, n], find missing/duplicate | Cyclic sort or XOR trick | O(n) time, O(1) space |
| "Kth largest/smallest" | Heap, or Quickselect | O(n log k) or avg O(n) |
| "Minimize the maximum" / "maximize the minimum" | Binary search on the answer | O(n log(range)) |
| Anagram / permutation-of-a-string check | Frequency array + fixed sliding window | O(n) |
| Longest palindromic substring | Expand-around-center (or DP) | O(n²) |
| Find a pattern's occurrences in text | KMP or Rabin-Karp | O(n + m) |
| "Longest consecutive sequence" in an unsorted array | HashSet | O(n) |
| Rotate/transpose a matrix in place | Layer-by-layer swaps | O(n²), O(1) extra space |

---

## 4. Two Pointers

**Concept:** use two indices moving through the array (or string) instead of nested loops, exploiting some structure — usually sortedness — to eliminate one loop entirely.

There are two distinct sub-patterns; don't conflate them.

### 4.1 Opposite-direction (converging) pointers

Start one pointer at each end, move them toward each other based on a comparison. Requires a sorted array (or sortable-without-losing-info) for most uses.

```java
public int[] twoSumSorted(int[] arr, int target) {
    int left = 0, right = arr.length - 1;
    while (left < right) {
        int sum = arr[left] + arr[right];
        if (sum == target) return new int[]{left, right};
        else if (sum < target) left++;   // need a bigger sum → move left up
        else right--;                     // need a smaller sum → move right down
    }
    return new int[]{-1, -1};
}
```

**Worked example — Container With Most Water (LC 11).** Given heights, find two lines that + the x-distance between them form the container holding the most water.

*Approach:* Start with the widest possible container (both ends). At each step, the water level is capped by the **shorter** line. Moving the taller pointer inward can only decrease width without any chance of increasing height (still capped by the same short line) — so it's always correct to move the shorter pointer inward, since that's the only move that could possibly improve the result.

```java
public int maxArea(int[] height) {
    int left = 0, right = height.length - 1, best = 0;
    while (left < right) {
        int width = right - left;
        int h = Math.min(height[left], height[right]);
        best = Math.max(best, width * h);
        if (height[left] < height[right]) left++;
        else right--;
    }
    return best;
}
```
Complexity: O(n) time, O(1) space — down from the O(n²) brute force of checking every pair.

### 4.2 Same-direction (fast-slow) pointers

Both pointers move forward; the "slow" pointer marks a boundary (e.g., the end of a processed region) while "fast" scans ahead.

```java
public int removeDuplicates(int[] nums) {   // sorted array, LC 26
    if (nums.length == 0) return 0;
    int slow = 0;
    for (int fast = 1; fast < nums.length; fast++) {
        if (nums[fast] != nums[slow]) {
            slow++;
            nums[slow] = nums[fast];
        }
    }
    return slow + 1; // new length
}
```
`slow` always points at the last confirmed-unique element; `fast` explores ahead and only "commits" a new value when it differs from what `slow` is holding.

Fast-slow is also the basis of Floyd's cycle detection (tortoise and hare) — same idea, one pointer moves 2x speed — though that's used more on linked lists than raw arrays.

**Common pitfalls:**
- Forgetting the array must be sorted for opposite-direction two pointers to be valid (it relies on monotonicity).
- Off-by-one on `while (left < right)` vs `while (left <= right)` — for pair-finding you almost always want strict `<` (a pointer shouldn't pair with itself).
- Not handling duplicates when the problem wants *unique* pairs/triplets (3Sum needs explicit `while (left < right && nums[left] == nums[left-1]) left++;`-style skipping).

**Practice:** Two Sum II (LC 167), 3Sum (LC 15), 3Sum Closest (LC 16), Trapping Rain Water (LC 42 — also solvable with two pointers, not just a monotonic stack), Valid Palindrome (LC 125), Sort Colors (LC 75, see §11).

---

## 5. Sliding Window

**Concept:** maintain a "window" `[left, right]` over the array/string and slide it forward, expanding and shrinking based on a condition — instead of recomputing a fresh subarray sum/count from scratch at every starting index (which is what makes the brute force O(n²) or worse).

### 5.1 Fixed-size window

The window size `k` is given directly.

```java
public int maxSumSubarray(int[] arr, int k) {
    int windowSum = 0;
    for (int i = 0; i < k; i++) windowSum += arr[i];   // build first window
    int best = windowSum;
    for (int i = k; i < arr.length; i++) {
        windowSum += arr[i] - arr[i - k];   // slide: add new, remove old
        best = Math.max(best, windowSum);
    }
    return best;
}
```
O(n) instead of the brute-force O(n·k).

### 5.2 Variable-size window

The window grows and shrinks based on a validity condition — this is the pattern most people mean when they say "sliding window."

**Generic template:**
```java
int left = 0;
for (int right = 0; right < n; right++) {
    // 1. add arr[right] into the window's running state
    while (/* window state violates the condition */) {
        // 2. remove arr[left] from the window's state
        left++;
    }
    // 3. window [left, right] is now valid — update the answer here
}
```
Each element is added once and removed at most once, so this is O(n) even though it looks like nested loops — `left` only ever moves forward, never resets, across the whole outer loop.

**Worked example — Longest Substring Without Repeating Characters (LC 3).**

*Approach:* Expand `right` one character at a time. If the new character is already in the window, shrink from `left` until it isn't. Track the max window size seen.

```java
public int lengthOfLongestSubstring(String s) {
    Set<Character> window = new HashSet<>();
    int left = 0, maxLen = 0;
    for (int right = 0; right < s.length(); right++) {
        char c = s.charAt(right);
        while (window.contains(c)) {
            window.remove(s.charAt(left));
            left++;
        }
        window.add(c);
        maxLen = Math.max(maxLen, right - left + 1);
    }
    return maxLen;
}
```
Complexity: O(n) time (each char enters/leaves the set at most once), O(min(n, alphabet size)) space.

**Worked example — Minimum Window Substring (LC 76)**, the canonical "hard" variable-window problem — needed because it introduces the "shrink while still valid, not just while invalid" idea (you're minimizing the window, so you shrink as much as possible *while the condition still holds*, which is the mirror image of the template above):

```java
public String minWindow(String s, String t) {
    if (s.length() < t.length()) return "";
    Map<Character, Integer> need = new HashMap<>();
    for (char c : t.toCharArray()) need.merge(c, 1, Integer::sum);

    Map<Character, Integer> window = new HashMap<>();
    int left = 0, required = need.size(), formed = 0;
    int bestLen = Integer.MAX_VALUE, bestLeft = 0;

    for (int right = 0; right < s.length(); right++) {
        char c = s.charAt(right);
        window.merge(c, 1, Integer::sum);
        if (need.containsKey(c) && window.get(c).intValue() == need.get(c).intValue()) formed++;

        while (formed == required) {                 // window is currently valid — try to shrink
            if (right - left + 1 < bestLen) {
                bestLen = right - left + 1;
                bestLeft = left;
            }
            char lc = s.charAt(left);
            window.put(lc, window.get(lc) - 1);
            if (need.containsKey(lc) && window.get(lc) < need.get(lc)) formed--;
            left++;
        }
    }
    return bestLen == Integer.MAX_VALUE ? "" : s.substring(bestLeft, bestLeft + bestLen);
}
```

**Common pitfalls:**
- Writing `while (condition invalid)` when you actually need `while (condition valid)` (or vice versa) — decide up front whether you're **minimizing** (shrink while still valid) or **finding max valid window** (shrink until valid again).
- Forgetting to update the answer at the right place — usually *after* the inner while loop for "longest," and *inside* the inner while loop for "shortest."
- Using a `HashMap` when a fixed `int[26]` array would be simpler and faster (lowercase-letter-only problems).

**Practice:** Longest Substring Without Repeating Characters (LC 3), Minimum Size Subarray Sum (LC 209), Longest Repeating Character Replacement (LC 424), Permutation in String (LC 567, see §13), Find All Anagrams in a String (LC 438), Fruit Into Baskets (at-most-2-distinct variant), Max Consecutive Ones III.

---

## 6. Prefix Sum & Prefix Arrays

**Concept:** precompute cumulative sums once, so any range-sum query afterward is O(1) instead of re-summing the range every time.

### 6.1 The 1D prefix sum

```java
int[] prefix = new int[arr.length + 1];   // prefix[0] = 0 by convention (sum of zero elements)
for (int i = 0; i < arr.length; i++) {
    prefix[i + 1] = prefix[i] + arr[i];
}
// sum of arr[l..r] inclusive:
int rangeSum = prefix[r + 1] - prefix[l];
```
Why the `+1` offset: it lets `rangeSum(0, r)` be `prefix[r+1] - prefix[0]` without a special case for `l == 0`. This is the single most common off-by-one source in prefix-sum code — get comfortable with it.

**Worked example — Subarray Sum Equals K (LC 560).** Count subarrays whose sum equals `k`. This is the highest-value prefix-sum problem to actually understand, because the trick (prefix sum + hashmap of counts) reappears constantly.

*Approach:* If `prefixSum[r+1] - prefixSum[l] == k`, then a valid subarray ends at `r`. Rearranged: `prefixSum[l] == prefixSum[r+1] - k`. So as you scan and build the running sum, for each position you ask "how many earlier prefix sums equal `currentSum - k`?" — and a hashmap answers that in O(1).

```java
public int subarraySum(int[] nums, int k) {
    Map<Integer, Integer> prefixCount = new HashMap<>();
    prefixCount.put(0, 1);  // empty prefix (sum 0) occurs once, before the array starts
    int sum = 0, count = 0;
    for (int num : nums) {
        sum += num;
        count += prefixCount.getOrDefault(sum - k, 0);
        prefixCount.merge(sum, 1, Integer::sum);
    }
    return count;
}
```
O(n) time, O(n) space — versus the O(n²) brute force of summing every subarray.

### 6.2 2D prefix sum (submatrix sums)

Same idea, extended via inclusion-exclusion:

```java
// prefix[i][j] = sum of the rectangle from (0,0) to (i-1,j-1)
int[][] prefix = new int[rows + 1][cols + 1];
for (int i = 1; i <= rows; i++) {
    for (int j = 1; j <= cols; j++) {
        prefix[i][j] = matrix[i-1][j-1] + prefix[i-1][j] + prefix[i][j-1] - prefix[i-1][j-1];
    }
}
// sum of submatrix (r1,c1) to (r2,c2) inclusive:
int sum = prefix[r2+1][c2+1] - prefix[r1][c2+1] - prefix[r2+1][c1] + prefix[r1][c1];
```
The `- prefix[i-1][j-1]` term corrects for double-counting the top-left overlap when you add the top strip and left strip. Draw this on paper once with a 3×3 grid — it clicks immediately and is hard to forget after that.

### 6.3 Prefix XOR

Identical idea, XOR instead of sum — works because XOR is its own inverse:
```java
int[] prefixXor = new int[arr.length + 1];
for (int i = 0; i < arr.length; i++) prefixXor[i + 1] = prefixXor[i] ^ arr[i];
int rangeXor = prefixXor[r + 1] ^ prefixXor[l];
```

### 6.4 Difference array (the "reverse" of prefix sum)

Use when you have **many range-*update* operations** ("add `val` to every element in `[l, r]`") and only need to read the final array once, at the end — not query mid-stream.

```java
int[] diff = new int[n + 1];
// add val to every index in [l, r] inclusive:
diff[l] += val;
diff[r + 1] -= val;     // cancels the effect beyond r
// after ALL updates are applied, reconstruct the actual array with a running prefix sum:
int[] result = new int[n];
result[0] = diff[0];
for (int i = 1; i < n; i++) result[i] = result[i-1] + diff[i];
```
Each update is O(1) regardless of range size; reconstruction is one O(n) pass at the end. This only works when updates all happen *before* you need to read values — if you need to interleave updates and range queries, you need Section 7.

**Common pitfalls:**
- Off-by-one on the `+1` offset convention — pick one convention (`prefix[0] = 0`, prefix array is `length+1`) and stay consistent; mixing conventions mid-problem is the #1 source of bugs here.
- Using prefix sum when the array actually **changes** between queries — prefix sum requires an O(n) rebuild per update, which is often too slow. That's the entire reason Section 7 exists.
- Integer overflow on large arrays with large values — accumulate in `long`, not `int`.

**Practice:** Range Sum Query - Immutable (LC 303), Range Sum Query 2D - Immutable (LC 304), Subarray Sum Equals K (LC 560), Product of Array Except Self (LC 238 — prefix × suffix product, same idea applied to multiplication), Continuous Subarray Sum (LC 523).

---

## 7. Range Queries

This is the section worth slowing down for — it's the one candidates most often know only shallowly (just prefix sum), and interviewers at this level occasionally probe past that on purpose. The organizing question for the whole section is always:

> **Does the array change between queries? And if so, do updates hit a single point or a whole range?**

| Access pattern | Best structure | Update | Query |
|---|---|---|---|
| Array never changes | Prefix sum array | — | O(1) |
| Array is static, need range **min/max/gcd** (not sum) | Sparse Table | — | O(1) |
| Point updates, range sum queries | Fenwick Tree (BIT) | O(log n) | O(log n) |
| Point updates, range min/max queries | Segment Tree | O(log n) | O(log n) |
| Range updates, point queries | Difference array + Fenwick tree | O(log n) | O(log n) |
| Range updates, **range** queries | Segment tree + lazy propagation, or dual-BIT Fenwick trick | O(log n) | O(log n) |
| Medium n, want something simpler to implement than a segment tree | Sqrt Decomposition | O(1) or O(√n) | O(√n) |

### 7.1 Fenwick Tree / Binary Indexed Tree (BIT) — point update, range query

**Concept:** a Fenwick tree stores partial sums at cleverly chosen indices so that both "add to one element" and "sum of a prefix" take O(log n), using nothing but the low-bit trick `i & (-i)` (isolates the lowest set bit of `i` in two's-complement representation).

```java
class FenwickTree {
    private final int[] tree;
    private final int n;

    public FenwickTree(int n) {
        this.n = n;
        this.tree = new int[n + 1];   // 1-indexed
    }

    public void update(int i, int val) {          // add val at index i
        for (; i <= n; i += i & (-i)) tree[i] += val;
    }

    public int query(int i) {                      // prefix sum [1, i]
        int sum = 0;
        for (; i > 0; i -= i & (-i)) sum += tree[i];
        return sum;
    }

    public int rangeQuery(int l, int r) {           // sum [l, r], 1-indexed inclusive
        return query(r) - query(l - 1);
    }
}
```
`update` walks **up** the implicit tree toward the root, touching O(log n) nodes. `query` walks **down/left**, also touching O(log n) nodes. This is the direct upgrade path from a plain prefix-sum array the moment your array needs to support updates: it's ~15 lines, and it converts an O(n)-per-update situation into O(log n).

This is literally LeetCode 307 (Range Sum Query - Mutable) — worth solving once with this exact structure.

### 7.2 The Fenwick "trick": range update, range query (dual-BIT)

This is the piece most guides skip, and it's exactly what makes Fenwick trees genuinely competitive with segment trees for range-update-range-query workloads.

**Derivation (worth understanding, not just memorizing):** Let `d[]` be the difference array of `a[]` (so `a[i] = d[1] + d[2] + ... + d[i]`). A range update `add val to [l, r]` is just the usual difference-array trick: `d[l] += val`, `d[r+1] -= val`. Now expand the prefix sum of `a[]` in terms of `d[]`:

```
S(i) = Σ a[k] for k=1..i = Σ Σ d[j] for j=1..k, k=1..i = Σ d[j] * (i - j + 1) for j=1..i
     = (i + 1) * Σd[j] - Σ(d[j] * j)
```

So if you maintain **two** Fenwick trees — one (`B1`) storing `d[j]`, one (`B2`) storing `d[j] * j` — you can compute `S(i)` in O(log n), and any range sum is `S(r) - S(l-1)`.

```java
class RangeFenwickTree {
    private final long[] B1, B2;
    private final int n;

    public RangeFenwickTree(int n) {
        this.n = n;
        B1 = new long[n + 1];
        B2 = new long[n + 1];
    }

    private void updateBIT(long[] bit, int i, long val) {
        for (; i <= n; i += i & (-i)) bit[i] += val;
    }

    private long queryBIT(long[] bit, int i) {
        long sum = 0;
        for (; i > 0; i -= i & (-i)) sum += bit[i];
        return sum;
    }

    public void rangeUpdate(int l, int r, long val) {     // add val to every element in [l, r]
        updateBIT(B1, l, val);
        updateBIT(B1, r + 1, -val);
        updateBIT(B2, l, val * l);
        updateBIT(B2, r + 1, -val * (r + 1));
    }

    private long prefixSum(int i) {
        return (i + 1) * queryBIT(B1, i) - queryBIT(B2, i);
    }

    public long rangeQuery(int l, int r) {                 // sum of [l, r]
        return prefixSum(r) - prefixSum(l - 1);
    }
}
```
Sanity check it yourself with a tiny example (e.g., `n=3`, `rangeUpdate(1,3,5)` should make every element 5, and `rangeQuery(2,3)` should return 10) before trusting it under interview pressure.

### 7.3 Segment Tree — point update, range query (the general-purpose version)

**Concept:** a binary tree over the array where each node stores an aggregate (sum, min, max — anything associative) of a contiguous range. Any range query decomposes into at most O(log n) node ranges.

```java
class SegmentTree {
    private final int[] tree;
    private final int n;

    public SegmentTree(int[] arr) {
        n = arr.length;
        tree = new int[4 * n];      // 4n is a safe standard upper bound on nodes needed
        build(arr, 1, 0, n - 1);
    }

    private void build(int[] arr, int node, int start, int end) {
        if (start == end) { tree[node] = arr[start]; return; }
        int mid = (start + end) / 2;
        build(arr, 2 * node, start, mid);
        build(arr, 2 * node + 1, mid + 1, end);
        tree[node] = tree[2 * node] + tree[2 * node + 1];   // swap + for Math.min/max as needed
    }

    public void update(int idx, int val) { update(1, 0, n - 1, idx, val); }

    private void update(int node, int start, int end, int idx, int val) {
        if (start == end) { tree[node] = val; return; }
        int mid = (start + end) / 2;
        if (idx <= mid) update(2 * node, start, mid, idx, val);
        else update(2 * node + 1, mid + 1, end, idx, val);
        tree[node] = tree[2 * node] + tree[2 * node + 1];
    }

    public int query(int l, int r) { return query(1, 0, n - 1, l, r); }

    private int query(int node, int start, int end, int l, int r) {
        if (r < start || end < l) return 0;                 // no overlap
        if (l <= start && end <= r) return tree[node];        // total overlap
        int mid = (start + end) / 2;                          // partial overlap
        return query(2 * node, start, mid, l, r) + query(2 * node + 1, mid + 1, end, l, r);
    }
}
```
Build is O(n), update and query are both O(log n). Unlike a Fenwick tree, this generalizes trivially to min/max/gcd — just change the merge operation (`tree[node] = ...`) — which a plain Fenwick tree cannot do (Fenwick relies on the operation being invertible, so min/max don't work with the vanilla BIT).

### 7.4 Segment Tree with Lazy Propagation — range update, range query

This is the general-purpose answer to "range update + range query" when you don't want to reach for the dual-BIT trick (or need min/max instead of sum, where the dual-BIT trick doesn't apply at all).

**Concept:** when a range update fully covers a node's range, don't recurse into its children immediately — mark the node "lazy" (pending update) and stop. Only push the pending update down to children the next time you actually need to visit them. This keeps both updates and queries at O(log n) instead of degrading to O(n) per range update.

```java
class LazySegmentTree {
    private final long[] tree, lazy;
    private final int n;

    public LazySegmentTree(int[] arr) {
        n = arr.length;
        tree = new long[4 * n];
        lazy = new long[4 * n];
        build(arr, 1, 0, n - 1);
    }

    private void build(int[] arr, int node, int start, int end) {
        if (start == end) { tree[node] = arr[start]; return; }
        int mid = (start + end) / 2;
        build(arr, 2 * node, start, mid);
        build(arr, 2 * node + 1, mid + 1, end);
        tree[node] = tree[2 * node] + tree[2 * node + 1];
    }

    public void rangeUpdate(int l, int r, long val) { rangeUpdate(1, 0, n - 1, l, r, val); }

    private void rangeUpdate(int node, int start, int end, int l, int r, long val) {
        if (lazy[node] != 0) {                                  // apply any pending update first
            tree[node] += (end - start + 1) * lazy[node];
            if (start != end) {
                lazy[2 * node] += lazy[node];
                lazy[2 * node + 1] += lazy[node];
            }
            lazy[node] = 0;
        }
        if (end < l || r < start) return;                       // no overlap
        if (l <= start && end <= r) {                            // total overlap — stop here, mark lazy
            tree[node] += (end - start + 1) * val;
            if (start != end) {
                lazy[2 * node] += val;
                lazy[2 * node + 1] += val;
            }
            return;
        }
        int mid = (start + end) / 2;                             // partial overlap — recurse
        rangeUpdate(2 * node, start, mid, l, r, val);
        rangeUpdate(2 * node + 1, mid + 1, end, l, r, val);
        tree[node] = tree[2 * node] + tree[2 * node + 1];
    }

    public long rangeQuery(int l, int r) { return rangeQuery(1, 0, n - 1, l, r); }

    private long rangeQuery(int node, int start, int end, int l, int r) {
        if (end < l || r < start) return 0;
        if (lazy[node] != 0) {                                   // push pending update down before reading
            tree[node] += (end - start + 1) * lazy[node];
            if (start != end) {
                lazy[2 * node] += lazy[node];
                lazy[2 * node + 1] += lazy[node];
            }
            lazy[node] = 0;
        }
        if (l <= start && end <= r) return tree[node];
        int mid = (start + end) / 2;
        return rangeQuery(2 * node, start, mid, l, r) + rangeQuery(2 * node + 1, mid + 1, end, l, r);
    }
}
```
This is genuinely one of the more fiddly things to write correctly under pressure. If it comes up, be honest that you're reconstructing it from the underlying idea (lazy = "promise to apply this later, to whichever child actually gets visited") rather than pretending to have it memorized verbatim — interviewers care more that you understand *why* the lazy-push happens at the top of both `update` and `query` than that you type it without pausing.

### 7.5 Sparse Table — static array, O(1) range min/max/gcd

**Concept:** for an array that **never changes**, precompute the min (or max, gcd, and, or — anything *idempotent*, meaning `f(x,x) = x`) over every range whose length is a power of 2. Any range `[l, r]` can then be covered by **two** (possibly overlapping) power-of-2 ranges — overlap is fine for idempotent operations, unlike sum.

```java
class SparseTable {
    private final int[][] table;
    private final int[] log;

    public SparseTable(int[] arr) {
        int n = arr.length;
        log = new int[n + 1];
        for (int i = 2; i <= n; i++) log[i] = log[i / 2] + 1;

        int maxK = log[n] + 1;
        table = new int[maxK][n];
        table[0] = arr.clone();
        for (int k = 1; k < maxK; k++) {
            for (int i = 0; i + (1 << k) <= n; i++) {
                table[k][i] = Math.min(table[k-1][i], table[k-1][i + (1 << (k-1))]);
            }
        }
    }

    public int queryMin(int l, int r) {           // inclusive, O(1)
        int k = log[r - l + 1];
        return Math.min(table[k][l], table[k][r - (1 << k) + 1]);
    }
}
```
Build is O(n log n), every query after that is O(1) — genuinely unbeatable for a static array, which is exactly why it's worth knowing separately from "just use a segment tree for everything." The catch: it does **not** support updates (rebuilding is O(n log n)) and does **not** work for sum (double-counting the overlap region would corrupt the answer — that's the idempotency requirement).

### 7.6 Square Root Decomposition — the "good enough, simpler to write" option

**Concept:** split the array into blocks of size ≈√n. Maintain one running aggregate per block. A range query touches at most two partial blocks (brute-forced element-by-element) plus some number of whole blocks (read directly) — O(√n) total. A point update adjusts one element and its block's aggregate in O(1).

```java
class SqrtDecomposition {
    private final int[] arr, blockSum;
    private final int blockSize;

    public SqrtDecomposition(int[] arr) {
        this.arr = arr.clone();
        int n = arr.length;
        blockSize = (int) Math.sqrt(n) + 1;
        blockSum = new int[blockSize + 1];
        for (int i = 0; i < n; i++) blockSum[i / blockSize] += arr[i];
    }

    public void update(int idx, int val) {
        blockSum[idx / blockSize] += val - arr[idx];
        arr[idx] = val;
    }

    public int query(int l, int r) {               // sum [l, r] inclusive
        int startBlock = l / blockSize, endBlock = r / blockSize, sum = 0;
        if (startBlock == endBlock) {
            for (int i = l; i <= r; i++) sum += arr[i];
        } else {
            for (int i = l; i < (startBlock + 1) * blockSize; i++) sum += arr[i];
            for (int b = startBlock + 1; b < endBlock; b++) sum += blockSum[b];
            for (int i = endBlock * blockSize; i <= r; i++) sum += arr[i];
        }
        return sum;
    }
}
```
O(√n) per query, O(1) per point update. It's asymptotically worse than a Fenwick tree or segment tree, but it's dramatically easier to get right from memory under interview time pressure, and for many practical `n` the constant factor difference doesn't matter. Range updates are also possible (add a "pending" lazy value per block, same spirit as segment-tree lazy propagation, just coarser-grained) — worth knowing the idea exists even if you don't memorize the code.

### 7.7 Decision table, restated as a decision process

1. Does the array ever change? **No** → prefix sum (sum queries) or sparse table (min/max/gcd queries).
2. Does it change, but only via **point** updates, and you only need **range sum**? → Fenwick tree.
3. Point updates, need range **min/max**? → Segment tree (Fenwick can't do this — it depends on invertibility, and min/max aren't invertible).
4. **Range** updates and range queries, sum? → Dual-BIT Fenwick trick, or lazy segment tree — either is correct; dual-BIT is less code, lazy segment tree generalizes better to min/max.
5. **Range** updates and range queries, min/max? → Lazy segment tree only (the dual-BIT trick is sum-specific).
6. Short on time to implement correctly, `n` is moderate (≤ ~10⁵–10⁶), simplicity matters more than the last factor of `log n`? → Sqrt decomposition.

**Interview-frequency note:** for Google-L4/Amazon-SDE3-style loops, plain prefix sums and Fenwick trees (point update/range query) show up with real frequency — "Range Sum Query - Mutable" (LC 307) is a well-known, fair-game question. Segment trees with lazy propagation and sparse tables are less commonly asked to be *implemented from scratch* live, but knowing they exist, what they're for, and being able to sketch the idea if asked "how would you support range updates too?" is exactly the kind of depth that separates a strong answer from a merely correct one.

**Practice:** Range Sum Query - Mutable (LC 307), Range Sum Query - Immutable (LC 303), Range Sum Query 2D - Immutable (LC 304), Count of Range Sum (LC 327 — harder, typically solved via merge-sort-with-counting or a BIT over compressed values), Range Addition (LC 370 — a clean difference-array problem).

---

## 8. Kadane's Algorithm

**Concept:** the classic O(n) solution to "maximum sum contiguous subarray." At each index, you have exactly two choices: extend the previous subarray, or start fresh at the current element. Keep a running "best sum ending here" and a global best.

```java
public int maxSubArray(int[] nums) {          // LC 53
    int maxSoFar = nums[0], maxEndingHere = nums[0];
    for (int i = 1; i < nums.length; i++) {
        maxEndingHere = Math.max(nums[i], maxEndingHere + nums[i]);
        maxSoFar = Math.max(maxSoFar, maxEndingHere);
    }
    return maxSoFar;
}
```
This is a 1D dynamic programming recurrence in disguise (`dp[i] = max(nums[i], dp[i-1] + nums[i])`), compressed to O(1) space since you only ever need the previous value.

**Variation — Maximum Product Subarray (LC 152).** Products flip sign with negative numbers, so a single running max isn't enough — track running min *and* max, since a very negative running product can become the new max if multiplied by another negative:

```java
public int maxProduct(int[] nums) {
    int maxSoFar = nums[0], maxHere = nums[0], minHere = nums[0];
    for (int i = 1; i < nums.length; i++) {
        int num = nums[i];
        if (num < 0) { int t = maxHere; maxHere = minHere; minHere = t; }  // swap on sign flip
        maxHere = Math.max(num, maxHere * num);
        minHere = Math.min(num, minHere * num);
        maxSoFar = Math.max(maxSoFar, maxHere);
    }
    return maxSoFar;
}
```

**Variation — Maximum Circular Subarray Sum (LC 918).** Either the answer is a normal (non-wrapping) subarray (plain Kadane), or it wraps around the end — in which case it equals `totalSum - minSubarraySum` (the elements *not* in the min subarray, taken from the wrap side). Compute both and take the max, handling the edge case where every element is negative (then the "wrap" answer would incorrectly be empty — fall back to plain Kadane's result in that case).

**Practice:** Maximum Subarray (LC 53), Maximum Product Subarray (LC 152), Maximum Circular Subarray Sum (LC 918), Best Time to Buy and Sell Stock (LC 121 — same "track a running minimum" spirit).

---

## 9. Monotonic Stack & Monotonic Deque

**Concept:** a stack (or deque) that you keep strictly increasing or decreasing by popping elements that violate the order before pushing the new one. The payoff: for "next greater/smaller element" style problems, this gets you from O(n²) (brute-force scanning outward from every index) down to O(n), because each element is pushed and popped **at most once** across the whole run.

### 9.1 Monotonic Stack

**Worked example — Next Greater Element (LC 496 style).** For every index, find the next element to its right that's strictly greater; -1 if none exists.

*Approach:* Keep a stack of indices whose "next greater" isn't known yet, kept in decreasing order of value. When the current element is bigger than the stack's top, that top finally found its answer — pop and record it. Repeat until the stack top is bigger (or empty), then push the current index.

```java
public int[] nextGreaterElement(int[] nums) {
    int n = nums.length;
    int[] result = new int[n];
    Arrays.fill(result, -1);
    Deque<Integer> stack = new ArrayDeque<>();   // holds indices, values strictly decreasing bottom-to-top... 
                                                   // actually top-to-bottom decreasing as you push
    for (int i = 0; i < n; i++) {
        while (!stack.isEmpty() && nums[stack.peek()] < nums[i]) {
            result[stack.pop()] = nums[i];
        }
        stack.push(i);
    }
    return result;
}
```
Why O(n) despite the nested loop: the `while` only ever pops elements that get permanently resolved — total pops across the entire algorithm can't exceed total pushes (n).

Other classic monotonic-stack problems worth recognizing by shape: **Daily Temperatures** (LC 739 — literally the same template, "next warmer day"), **Largest Rectangle in Histogram** (LC 84 — for each bar, find how far left/right you can extend before hitting a shorter bar, both directions via monotonic stack), **Trapping Rain Water** (LC 42 — can be solved with a monotonic stack tracking potential "walls," though the two-pointer solution in §4 is usually cleaner).

### 9.2 Monotonic Deque

Same idea, but you need to drop elements from **both** ends: the back (to maintain monotonicity when pushing) and the front (when the window slides past an index that's still in the deque).

**Worked example — Sliding Window Maximum (LC 239).** Find the max in every window of size `k`.

```java
public int[] maxSlidingWindow(int[] nums, int k) {
    Deque<Integer> deque = new ArrayDeque<>();     // indices, values strictly decreasing front-to-back
    int n = nums.length;
    int[] result = new int[n - k + 1];
    for (int i = 0; i < n; i++) {
        while (!deque.isEmpty() && deque.peekFirst() <= i - k) deque.pollFirst();   // out of window
        while (!deque.isEmpty() && nums[deque.peekLast()] < nums[i]) deque.pollLast(); // useless now
        deque.offerLast(i);
        if (i >= k - 1) result[i - k + 1] = nums[deque.peekFirst()];
    }
    return result;
}
```
The front of the deque is always the max of the current window — anything smaller that came before it can never become the answer while a bigger, more-recent element is still in range, which is exactly why it's safe to discard them permanently.

**Common pitfalls:**
- Mixing up whether you're storing values or indices on the stack/deque — you almost always want **indices** (so you can check position for window-boundary conditions and still look up the value via `nums[idx]`).
- Getting the strict vs. non-strict comparison wrong (`<` vs `<=`) — this determines how you handle duplicate values, and problems differ on which they want.

**Practice:** Next Greater Element I & II (LC 496, 503), Daily Temperatures (LC 739), Largest Rectangle in Histogram (LC 84), Sliding Window Maximum (LC 239), Remove K Digits (LC 402 — monotonic stack on digits).

---

## 10. Binary Search on Arrays

### 10.1 The classic form

```java
public int binarySearch(int[] arr, int target) {
    int lo = 0, hi = arr.length - 1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;     // NOT (lo+hi)/2 — avoids int overflow on large arrays
        if (arr[mid] == target) return mid;
        else if (arr[mid] < target) lo = mid + 1;
        else hi = mid - 1;
    }
    return -1;
}
```
`lo + (hi - lo) / 2` instead of `(lo + hi) / 2` matters in languages with fixed-width integers: if `lo` and `hi` are both close to `Integer.MAX_VALUE`, their sum overflows before the division happens. It's a small habit worth having automatically.

### 10.2 Search in Rotated Sorted Array (LC 33)

*Approach:* at every step, at least one half (`[lo, mid]` or `[mid, hi]`) is guaranteed to be normally sorted, even though the whole array isn't. Figure out which half is sorted, check if the target falls in that half's range, and recurse into the appropriate side.

```java
public int search(int[] nums, int target) {
    int lo = 0, hi = nums.length - 1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (nums[mid] == target) return mid;
        if (nums[lo] <= nums[mid]) {                          // left half is sorted
            if (nums[lo] <= target && target < nums[mid]) hi = mid - 1;
            else lo = mid + 1;
        } else {                                              // right half is sorted
            if (nums[mid] < target && target <= nums[hi]) lo = mid + 1;
            else hi = mid - 1;
        }
    }
    return -1;
}
```

### 10.3 Binary search on the answer

This is the pattern that trips up people who only think of binary search as "find a value in a sorted array." Here, you're not searching an array at all — you're searching a **range of possible answers**, using a monotonic feasibility check (`isFeasible(x)` is false, false, ..., false, true, true, true, ... — find the boundary).

**Generic template (minimizing the feasible value):**
```java
int lo = minPossibleAnswer, hi = maxPossibleAnswer;
while (lo < hi) {
    int mid = lo + (hi - lo) / 2;
    if (isFeasible(mid)) hi = mid;        // mid works — try to do even better
    else lo = mid + 1;                     // mid doesn't work — need a bigger value
}
return lo;
```

**Worked example — Koko Eating Bananas (LC 875).** Find the minimum eating speed so Koko finishes all banana piles within `h` hours.

```java
public int minEatingSpeed(int[] piles, int h) {
    int lo = 1, hi = Arrays.stream(piles).max().getAsInt();
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (canFinish(piles, h, mid)) hi = mid;
        else lo = mid + 1;
    }
    return lo;
}

private boolean canFinish(int[] piles, int h, int speed) {
    int hours = 0;
    for (int pile : piles) hours += (pile + speed - 1) / speed;   // ceiling division
    return hours <= h;
}
```
The recognition signal for this whole pattern is almost always phrased as "minimize the maximum X" or "maximize the minimum X" or "find the smallest/largest value such that [some condition] holds" — the moment you see that shape, ask "is the feasibility of a candidate answer monotonic?" If yes, binary search on it.

**Practice:** Search in Rotated Sorted Array (LC 33), Find Minimum in Rotated Sorted Array (LC 153), Koko Eating Bananas (LC 875), Capacity To Ship Packages Within D Days (LC 1011), Split Array Largest Sum (LC 410), Find Peak Element (LC 162), Search a 2D Matrix (LC 74).

---

## 11. Sorting-Based Techniques

Sometimes the fastest path to a solution is "sort first, then the remaining problem gets much easier" — this shows up often enough to deserve its own section.

**Merge Intervals (LC 56).** Sort by start time; then a linear scan merges any interval whose start is ≤ the current merged interval's end.

```java
public int[][] merge(int[][] intervals) {
    Arrays.sort(intervals, (a, b) -> a[0] - b[0]);
    List<int[]> result = new ArrayList<>();
    for (int[] interval : intervals) {
        if (result.isEmpty() || result.get(result.size() - 1)[1] < interval[0]) {
            result.add(interval);
        } else {
            result.get(result.size() - 1)[1] = Math.max(result.get(result.size() - 1)[1], interval[1]);
        }
    }
    return result.toArray(new int[result.size()][]);
}
```

**Dutch National Flag / 3-way partition — Sort Colors (LC 75).** Sort an array of only 0s, 1s, 2s in one O(n) pass, O(1) space, without counting-sort's need for a second pass.

```java
public void sortColors(int[] nums) {
    int low = 0, mid = 0, high = nums.length - 1;
    while (mid <= high) {
        if (nums[mid] == 0) swap(nums, low++, mid++);
        else if (nums[mid] == 1) mid++;
        else swap(nums, mid, high--);       // note: don't increment mid here — need to re-examine the swapped-in value
    }
}
private void swap(int[] nums, int i, int j) { int t = nums[i]; nums[i] = nums[j]; nums[j] = t; }
```

**Quickselect — Kth Largest Element (LC 215).** Same partition idea as quicksort, but you only ever recurse into the one side that contains the target index — average O(n) instead of O(n log n) for a full sort, because the work halves (roughly) each round instead of both halves being fully processed.

```java
public int findKthLargest(int[] nums, int k) {
    int targetIndex = nums.length - k;
    int lo = 0, hi = nums.length - 1;
    while (lo < hi) {
        int p = partition(nums, lo, hi);
        if (p == targetIndex) break;
        else if (p < targetIndex) lo = p + 1;
        else hi = p - 1;
    }
    return nums[targetIndex];
}
private int partition(int[] nums, int lo, int hi) {
    int pivot = nums[hi], i = lo;
    for (int j = lo; j < hi; j++) {
        if (nums[j] < pivot) swap(nums, i++, j);
    }
    swap(nums, i, hi);
    return i;
}
```
Worst case is O(n²) (already-sorted input with a naive last-element pivot) — mention this if asked, and that randomizing the pivot choice fixes it in expectation.

**Practice:** Merge Intervals (LC 56), Insert Interval (LC 57), Non-overlapping Intervals (LC 435), Sort Colors (LC 75), Kth Largest Element in an Array (LC 215).

---

## 12. Hashing Techniques

The core idea across this whole category: trade O(n) or O(n log n) extra space for O(1) average-case lookups, turning an O(n²) "does this exist elsewhere in the array" check into O(n) overall.

**Frequency map pattern** — already used throughout §5 and §13; the default tool whenever a problem talks about counts of elements.

**HashSet for O(1) existence — Longest Consecutive Sequence (LC 128).** The trick that makes this O(n) instead of O(n log n) (sorting) is only starting a sequence-count from a number that has **no predecessor** in the set — that guarantees each number is visited as part of exactly one sequence-walk across the entire algorithm.

```java
public int longestConsecutive(int[] nums) {
    Set<Integer> set = new HashSet<>();
    for (int num : nums) set.add(num);
    int longest = 0;
    for (int num : set) {
        if (!set.contains(num - 1)) {          // only start counting at the beginning of a run
            int length = 1;
            while (set.contains(num + length)) length++;
            longest = Math.max(longest, length);
        }
    }
    return longest;
}
```

**Grouping by a computed key — Group Anagrams (LC 49).** Sort each word's characters to get a canonical key; words with the same key are anagrams of each other.

```java
public List<List<String>> groupAnagrams(String[] strs) {
    Map<String, List<String>> map = new HashMap<>();
    for (String s : strs) {
        char[] chars = s.toCharArray();
        Arrays.sort(chars);
        map.computeIfAbsent(new String(chars), k -> new ArrayList<>()).add(s);
    }
    return new ArrayList<>(map.values());
}
```

**Practice:** Two Sum (LC 1), Longest Consecutive Sequence (LC 128), Group Anagrams (LC 49), Contains Duplicate II (LC 219), Isomorphic Strings (LC 205).

---

## 13. String-Specific Techniques

### 13.1 Palindromes — expand around center

**Worked example — Longest Palindromic Substring (LC 5).**

*Approach:* every palindrome has a center (a single character for odd-length, a gap between two characters for even-length). Try all 2n-1 possible centers, expand outward from each while both sides match, and track the longest expansion.

```java
public String longestPalindrome(String s) {
    if (s == null || s.length() < 1) return "";
    int start = 0, end = 0;
    for (int i = 0; i < s.length(); i++) {
        int len1 = expand(s, i, i);       // odd length, center on i
        int len2 = expand(s, i, i + 1);   // even length, center between i and i+1
        int len = Math.max(len1, len2);
        if (len > end - start + 1) {
            start = i - (len - 1) / 2;
            end = i + len / 2;
        }
    }
    return s.substring(start, end + 1);
}
private int expand(String s, int left, int right) {
    while (left >= 0 && right < s.length() && s.charAt(left) == s.charAt(right)) { left--; right++; }
    return right - left - 1;
}
```
O(n²) time, O(1) space. (There's an O(n) algorithm — **Manacher's algorithm** — for this exact problem; it's rarely expected to be written from scratch in an interview, but knowing it exists and roughly why it works — it reuses palindrome-radius information from previously computed centers via mirroring — is worth being able to say if asked "can you do better than O(n²)?")

### 13.2 Pattern matching

**Naive:** try every starting position, compare character by character — O(n·m) worst case.

**KMP (Knuth-Morris-Pratt) — O(n + m).** The key insight: when a match fails partway through, you already know something about the text you just matched (it equals a prefix of the pattern) — so instead of restarting the text pointer from scratch, use a precomputed "longest proper prefix that's also a suffix" array (LPS) to know exactly how far back in the *pattern* to resume, without ever moving the text pointer backward.

```java
public int strStr(String haystack, String needle) {          // LC 28
    if (needle.isEmpty()) return 0;
    int[] lps = buildLPS(needle);
    int i = 0, j = 0;
    while (i < haystack.length()) {
        if (haystack.charAt(i) == needle.charAt(j)) {
            i++; j++;
            if (j == needle.length()) return i - j;           // full match found
        } else if (j > 0) {
            j = lps[j - 1];                                    // fall back using the LPS table
        } else {
            i++;
        }
    }
    return -1;
}
private int[] buildLPS(String pattern) {
    int[] lps = new int[pattern.length()];
    int len = 0, i = 1;
    while (i < pattern.length()) {
        if (pattern.charAt(i) == pattern.charAt(len)) {
            lps[i++] = ++len;
        } else if (len > 0) {
            len = lps[len - 1];
        } else {
            lps[i++] = 0;
        }
    }
    return lps;
}
```

**Rabin-Karp — expected O(n + m).** Hash the pattern and every window of the text; only do an expensive full comparison when hashes match (a "hash collision" candidate). The hash is computed incrementally (a **rolling hash**) so sliding the window by one character is O(1).

```java
public boolean rabinKarp(String text, String pattern) {
    int n = text.length(), m = pattern.length();
    if (m > n) return false;
    long base = 256, mod = 1_000_000_007L;
    long patternHash = 0, textHash = 0, h = 1;
    for (int i = 0; i < m - 1; i++) h = (h * base) % mod;

    for (int i = 0; i < m; i++) {
        patternHash = (patternHash * base + pattern.charAt(i)) % mod;
        textHash = (textHash * base + text.charAt(i)) % mod;
    }
    for (int i = 0; i <= n - m; i++) {
        if (patternHash == textHash && text.substring(i, i + m).equals(pattern)) return true;
        if (i < n - m) {
            textHash = (base * (textHash - text.charAt(i) * h) + text.charAt(i + m)) % mod;
            if (textHash < 0) textHash += mod;    // Java's % can return negative — correct for that
        }
    }
    return false;
}
```
KMP is the one worth being able to actually reproduce; Rabin-Karp is worth understanding conceptually (rolling hash shows up elsewhere too, e.g., in some substring-dedup problems).

### 13.3 Anagram / permutation-in-string via fixed sliding window

**Worked example — Permutation in String (LC 567).** Does `s2` contain a permutation of `s1` as a contiguous substring?

```java
public boolean checkInclusion(String s1, String s2) {
    if (s1.length() > s2.length()) return false;
    int[] need = new int[26], window = new int[26];
    for (char c : s1.toCharArray()) need[c - 'a']++;

    int left = 0;
    for (int right = 0; right < s2.length(); right++) {
        window[s2.charAt(right) - 'a']++;
        if (right - left + 1 > s1.length()) window[s2.charAt(left++) - 'a']--;
        if (Arrays.equals(need, window)) return true;
    }
    return false;
}
```
This is §5's fixed-size window combined with §2's frequency-array trick — recognizing that combination is often the whole battle.

### 13.4 Tries — worth knowing exists, not covered in depth here

A trie (prefix tree) is the standard structure when a problem is about **prefixes** specifically — autocomplete, word search on a grid with a dictionary, longest common prefix across many words. It's really its own data structure topic rather than an "arrays/strings technique," so it's flagged here as related rather than expanded — build a dedicated pass on trees/tries separately if that's a gap.

**Practice:** Implement strStr() (LC 28), Longest Palindromic Substring (LC 5), Valid Palindrome (LC 125), Palindromic Substrings (LC 647), Permutation in String (LC 567), Find All Anagrams in a String (LC 438), Group Anagrams (LC 49, see §12), Longest Common Prefix (LC 14).

---

## 14. 2D Arrays / Matrix Techniques

**Spiral traversal (LC 54).** Maintain four shrinking boundaries (`top`, `bottom`, `left`, `right`); traverse top row left→right, right column top→bottom, bottom row right→left, left column bottom→top, then shrink all four boundaries inward and repeat.

```java
public List<Integer> spiralOrder(int[][] matrix) {
    List<Integer> result = new ArrayList<>();
    if (matrix.length == 0) return result;
    int top = 0, bottom = matrix.length - 1, left = 0, right = matrix[0].length - 1;
    while (top <= bottom && left <= right) {
        for (int j = left; j <= right; j++) result.add(matrix[top][j]);
        top++;
        for (int i = top; i <= bottom; i++) result.add(matrix[i][right]);
        right--;
        if (top <= bottom) {
            for (int j = right; j >= left; j--) result.add(matrix[bottom][j]);
            bottom--;
        }
        if (left <= right) {
            for (int i = bottom; i >= top; i--) result.add(matrix[i][left]);
            left++;
        }
    }
    return result;
}
```
The two `if` guards (before the bottom-row and left-column passes) matter for non-square matrices and odd/even dimensions — without them you can double-count a row or column when the spiral collapses to a single line.

**In-place 90° rotation (LC 48).** Transpose (swap across the diagonal), then reverse each row — two clean O(n²) passes, O(1) extra space.

```java
public void rotate(int[][] matrix) {
    int n = matrix.length;
    for (int i = 0; i < n; i++)
        for (int j = i + 1; j < n; j++) {
            int t = matrix[i][j]; matrix[i][j] = matrix[j][i]; matrix[j][i] = t;
        }
    for (int[] row : matrix)
        for (int l = 0, r = n - 1; l < r; l++, r--) {
            int t = row[l]; row[l] = row[r]; row[r] = t;
        }
}
```

Row/column prefix sums for 2D range queries are already covered in §6.2 — the same section applies here.

**Practice:** Spiral Matrix (LC 54), Rotate Image (LC 48), Set Matrix Zeroes (LC 73), Search a 2D Matrix (LC 74), Word Search (LC 79 — backtracking on a grid, related but a different technique family).

---

## 15. Bit Manipulation Tricks

Two array-adjacent bit tricks come up often enough to know cold:

**XOR trick — Single Number (LC 136).** Every element appears twice except one; find it. `x ^ x = 0` and `x ^ 0 = x`, so XOR-ing the entire array cancels every pair, leaving only the singleton.

```java
public int singleNumber(int[] nums) {
    int result = 0;
    for (int num : nums) result ^= num;
    return result;
}
```
O(n) time, O(1) space — no hashset needed, which is exactly the follow-up ("can you do it without extra space?") this problem is fishing for.

**Cyclic sort — Missing Number / First Missing Positive.** When values are confined to a known range like `[1, n]`, you can place each value at its "home" index (`nums[i]` belongs at index `nums[i]-1`) in a single O(n) pass with no extra space, then scan once to find the first index that doesn't hold its home value.

```java
public int firstMissingPositive(int[] nums) {       // LC 41
    int n = nums.length;
    for (int i = 0; i < n; i++) {
        while (nums[i] > 0 && nums[i] <= n && nums[nums[i] - 1] != nums[i]) {
            int t = nums[nums[i] - 1];
            nums[nums[i] - 1] = nums[i];
            nums[i] = t;
        }
    }
    for (int i = 0; i < n; i++) if (nums[i] != i + 1) return i + 1;
    return n + 1;
}
```

**Practice:** Single Number (LC 136), Single Number II/III (LC 137, 260), Missing Number (LC 268), Find the Duplicate Number (LC 287), First Missing Positive (LC 41).

---

## 16. Java Gotchas & Complexity Cheat Sheet

| Operation | Time | Notes |
|---|---|---|
| Array random access `arr[i]` | O(1) | contiguous memory |
| Array insert/delete at arbitrary index | O(n) | must shift elements |
| `ArrayList.get/set` | O(1) | `ArrayList.add` at end is amortized O(1), O(n) for a resize |
| `String` concatenation in a loop | O(n) **per op** → O(n²) total | use `StringBuilder` |
| `StringBuilder.append` | O(1) amortized | O(n) total for n appends |
| `HashMap`/`HashSet` get/put/contains | O(1) average | O(n) worst case (pathological hash collisions — essentially never hit in practice) |
| `TreeMap`/`TreeSet` get/put/contains | O(log n) | kept sorted, backed by a red-black tree |
| `Arrays.sort(int[] ...)` | O(n log n) avg | **dual-pivot quicksort** — O(n²) is theoretically possible on adversarial input |
| `Arrays.sort(Object[] ...)` | O(n log n) guaranteed | **TimSort** — stable, no quicksort worst case |
| `PriorityQueue` offer/poll | O(log n) | peek is O(1) |

Other things worth having internalized:

- **Integer overflow**: `int` maxes out at `2,147,483,647`. Summing ~2.2 million elements of value 1000 each already overflows. Accumulate sums in `long` whenever the problem's constraints make this plausible — say so out loud even if you don't hit it in the given example.
- **`Integer` caching**: `Integer a = 100, b = 100; a == b` is `true` (cached, -128 to 127), but `Integer a = 200, b = 200; a == b` is `false` (not cached — two distinct objects). This is a classic "gotcha" question; the fix is always `.equals()`.
- **`Arrays.asList(arr)`** on a primitive `int[]` doesn't do what people expect — it produces a `List<int[]>` with one element (the whole array), not a `List<Integer>`, because generics don't work with primitives. Need `Integer[]` or a stream (`Arrays.stream(arr).boxed().collect(...)`) to get a real `List<Integer>`.
- **`Arrays.asList(...)` returns a fixed-size list** backed directly by the array — `.add()`/`.remove()` throw `UnsupportedOperationException`. Wrap in `new ArrayList<>(Arrays.asList(...))` if you need a mutable copy.

---

## 17. Practice Roadmap

Given where you're starting from, a reasonable order — each stage assumes the previous one is comfortable, not perfect:

**Stage 1 — the load-bearing four (most interview mileage per hour spent):** Two Pointers → Sliding Window → Prefix Sum → Hashing. These four cover a large fraction of "medium"-difficulty array/string questions on their own.

**Stage 2 — the ones that separate "solid" from "just okay":** Kadane's → Monotonic Stack/Deque → Binary Search on the Answer. Fast to learn once Stage 1 is solid, and each has a very recognizable "signal" (see the cheat sheet in §3) once you've seen it a few times.

**Stage 3 — strings in depth:** Palindrome techniques → KMP → sliding-window-on-strings (anagram/permutation problems). Somewhat separate from the numeric-array techniques, worth a dedicated pass.

**Stage 4 — range queries, treated as its own project:** Prefix sum (already have it) → Difference array → Fenwick tree (point update) → Fenwick range trick → Segment tree → Lazy segment tree → Sparse table → Sqrt decomposition. Don't rush this — implement each one from memory at least twice, a day apart, before moving to the next.

**Stage 5 — the rest:** Sorting-based techniques, 2D matrix traversal, bit tricks. Mostly quick to pick up once Stages 1-2 are solid, since they mostly recombine ideas you already have.

At each stage: read the section, attempt 2-3 practice problems **without** looking at the solution first, then check. If you can't get started within ~10 minutes, that's useful information — go re-read the "when to use it" signal for that technique, not the solution code.

---

## 18. Final Interview Tips

- **Say the brute force out loud first**, even trivially ("the obvious approach is checking every pair, which is O(n²) — I think we can do better"). It shows structured thinking and gives the interviewer a checkpoint.
- **Name the technique before you code it**: "this looks like a sliding window problem because we're asked for a contiguous substring satisfying a condition" — narrating the pattern-match is exactly the skill this whole guide is trying to build.
- **State complexity without being asked**, for both your brute force and your final solution — it's expected, not optional, at this level.
- **Handle edge cases explicitly**: empty input, single element, all-duplicate values, all-negative values (relevant for Kadane's-family problems specifically). Mention them even if the interviewer's example doesn't include them.
- **Dry-run your final code on the given example**, out loud, before saying you're done. This catches a large fraction of off-by-one bugs (prefix-sum offsets and sliding-window boundary conditions especially) before the interviewer has to point them out.
- If you only half-remember a structure (segment tree with lazy propagation is the most likely candidate), **say so directly** rather than faking confidence — "I don't have the lazy-propagation code memorized exactly, but the idea is X, let me reconstruct it" reads as far stronger than confidently writing something subtly wrong.

---

## 19. What's Deliberately Not Covered Here

This guide is scoped to arrays, strings, and the techniques that operate directly on them. It does **not** cover (each is its own topic, worth a dedicated pass the same way this one was):

- Dynamic programming beyond the array-adjacent cases mentioned in passing (Kadane's, max product subarray)
- Trees, tries, and graphs (adjacency-list/matrix traversal, BFS/DFS, shortest paths)
- Heaps/priority queues as a standalone topic (mentioned only in passing for Kth-largest-style problems)
- Linked lists
- Backtracking/recursion as a standalone framework

If any of those come up short in your prep, they're natural candidates for their own dedicated file, the same way this one was.