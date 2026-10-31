## Concept explanation

In a coding round you have 45 minutes, no IDE help, and an interviewer watching. Java's verbosity costs time unless the standard idioms come **automatically**. This lesson is the toolkit: the right structure for each algorithm pattern, the one-liners worth memorising, and the Java-specific bugs that quietly cost points.

### Pick the structure from the pattern

| Pattern | Java structure | Key calls |
|---|---|---|
| Counting, frequency, two-sum lookups | `HashMap<K, Integer>` / `int[26]` / `int[128]` | `merge(k, 1, Integer::sum)`, `getOrDefault`, `count[c - 'a']++` |
| Grouping | `HashMap<K, List<V>>` | `computeIfAbsent(k, x -> new ArrayList<>()).add(v)` |
| Seen-before, deduplication | `HashSet` | `add` returns `false` if already present |
| Stack (brackets, monotonic stack, DFS) | **`ArrayDeque`** (not `Stack`) | `push`, `pop`, `peek`, `isEmpty` |
| Queue (BFS) | **`ArrayDeque`** | `offer`, `poll`, `peek` |
| Top-k, k-th largest, merge k lists, Dijkstra | `PriorityQueue` | min-heap by default; `new PriorityQueue<>(Comparator.reverseOrder())` for a max-heap |
| Ordered keys: floor/ceiling, ranges, calendars | `TreeMap` / `TreeSet` | `floorKey`, `ceilingKey`, `firstKey`, `pollFirstEntry`, `headMap`, `subSet` |
| LRU / insertion order | `LinkedHashMap` (access order) | `removeEldestEntry` |
| Sorting pairs and intervals | `int[][]` or records | `Arrays.sort(a, (x, y) -> Integer.compare(x[0], y[0]))` |
| Prefix sums, DP | `long[]`, `int[][]` | size `n + 1` to avoid edge cases |
| Bitmasks, dense boolean sets | `int`/`long` masks, `BitSet`, `boolean[]` | `1 << i`, `Integer.bitCount` |

### One-liners worth having in muscle memory

```java
int[] count = new int[26];  for (char ch : s.toCharArray()) count[ch - 'a']++;
Map<Integer, Integer> freq = new HashMap<>();  for (int x : nums) freq.merge(x, 1, Integer::sum);
Map<String, List<String>> groups = new HashMap<>();  groups.computeIfAbsent(key, k -> new ArrayList<>()).add(word);
Deque<Integer> stack = new ArrayDeque<>();      Deque<int[]> queue = new ArrayDeque<>();
PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> Integer.compare(a[1], b[1]));
Arrays.sort(intervals, Comparator.comparingInt(a -> a[0]));
list.sort(Comparator.comparingInt(String::length).thenComparing(Comparator.naturalOrder()));
int[] arr = list.stream().mapToInt(Integer::intValue).toArray();    List<Integer> boxed = Arrays.stream(arr).boxed().toList();
int mid = lo + (hi - lo) / 2;    long sum = 0L;    int mod = Math.floorMod(x, m);    char c = (char) ('a' + i);
String joined = String.join(",", parts);   String rev = new StringBuilder(s).reverse().toString();
int[][] dirs = { {1, 0}, {-1, 0}, {0, 1}, {0, -1} };
```

### The Java pitfalls that cost points

- **`==` on boxed values**: `map.get(a) == map.get(b)` works up to 127 and fails above. Use `equals`, or unbox with `intValue()`.
- **Overflow**:
  - `int` sums and products: use `long` accumulators, and `1L * a * b`;
  - midpoints: `(lo + hi) / 2` overflows, `lo + (hi - lo) / 2` doesn't;
  - **comparators written as `a - b`**: overflow gives the wrong sign. Use `Integer.compare`.
- **`List<Integer>.remove(i)`** removes by index. Use `remove(Integer.valueOf(x))` to remove by value.
- **Modifying a collection while iterating it**: use `Iterator.remove`, `removeIf`, or collect, then modify.
- **`Arrays.asList(int[])`** is a `List<int[]>`. **`Arrays.sort(int[])` can't take a comparator**: sort `Integer[]`, or sort and then reverse.
- **`PriorityQueue` iteration isn't sorted**: only `poll()` returns elements in order.
- **Strings**: `s1 == s2` vs `equals`; `substring` copies (O(n)); `+=` in loops is O(n²), so use `StringBuilder`; `split` takes a **regex** (`split(".")` returns an empty array; use `split("\\.")`).
- **Deep recursion**: around 10⁴-10⁵ frames overflow the default stack. Convert DFS on a long path to an explicit stack.
- **Integer division and `char` arithmetic**: `count[c - 'a']`, and `(char) (c + 1)` for the next letter.

## Internal working

Know the costs behind the calls. The interviewer will ask for complexity.

| Operation | Cost | Why |
|---|---|---|
| `ArrayList.get/set`, add at the end | O(1), amortised for add | array; grows by 1.5x with a copy |
| `ArrayList.add(0, x)`/`remove(0)` | **O(n)** | shifts elements. Use `ArrayDeque` for both ends |
| `HashMap`/`HashSet` get/put/contains | O(1) average, O(log n) worst per bucket (treeified) | depends on a good `hashCode`; records and `String` are fine |
| `TreeMap`/`TreeSet` operations | O(log n) | red-black tree |
| `PriorityQueue` offer/poll, peek | O(log n), O(1) | binary heap in an array. `remove(Object)` and `contains` are O(n) |
| `ArrayDeque` push/pop/offer/poll | O(1) amortised | circular array; no `null` elements allowed |
| `Arrays.sort(int[])` | O(n log n), not stable (doesn't matter for primitives) | dual-pivot quicksort |
| `Arrays.sort(Object[])`, `List.sort` | O(n log n), **stable** | TimSort: fast on partially sorted data |
| `String.substring`, `toCharArray`, `+` | O(length) | strings are immutable: every result is a copy |
| `StringBuilder.append`, `sb.setCharAt` | O(1) amortised | growable buffer |

More details that matter in a coding round:
- **Boxing costs** in hot loops (`Map<Integer, Integer>`, `List<Integer>`) are fine at interview sizes (≤ 10⁵-10⁶), but primitive arrays (`int[]` counts) are faster and avoid `==` traps.
- **Recursion depth**: the default thread stack (512 KB-1 MB) holds roughly 10⁴-10⁵ simple frames. Online judges sometimes run with bigger stacks, interview environments usually don't.
- **I/O on judges**:
  - `Scanner` is slow (regex-based); for 10⁵+ tokens use `BufferedReader` with `StringTokenizer`, or a `DataInputStream` parser;
  - for output, build one `StringBuilder` (or a `PrintWriter` with a buffer) and print once, since `System.out.println` per line flushes and is slow in loops.
- **Stability and comparators**: `Comparator.comparing(...).thenComparing(...)` builds a lexicographic comparator. `reversed()` applies to **everything built so far**, which is a common bug when it's chained in the middle of a comparator.

## Visual representation

```text title="Recognise the pattern, reach for the structure"
 "count / frequency / anagram"     -> int[26] or HashMap.merge
 "group by key"                    -> computeIfAbsent(key, k -> new ArrayList<>())
 "k largest / k closest"           -> PriorityQueue min-heap of size k (poll when size > k)
 "matching brackets / next greater" -> ArrayDeque as a stack (monotonic stack)
 "shortest path in grid / levels"  -> ArrayDeque queue + visited + dirs[][]  (BFS)
 "intervals / meeting rooms"       -> sort by start; TreeMap for floor/ceiling lookups
 "longest substring with ..."      -> sliding window: left/right pointers + counts
 "sorted array, find position"     -> binary search, lo + (hi - lo) / 2

 PriorityQueue<Integer> minHeap (k = 3) over [5, 1, 9, 3, 7, 8]:
   offer 5 [5]  offer 1 [1,5]  offer 9 [1,5,9]  offer 3 -> poll 1 [3,5,9]
   offer 7 -> poll 3 [5,7,9]   offer 8 -> poll 5 [7,8,9]   => 3 largest: 7, 8, 9
```

## Java code example

Each section is a classic interview pattern written the idiomatic way. The final section demonstrates the pitfalls.

```java title="CodingToolkit.java" file="CodingToolkit.java"
import java.io.BufferedReader;
import java.io.IOException;
import java.io.StringReader;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.StringTokenizer;
import java.util.TreeMap;

public class CodingToolkit {
    // ---- counting and grouping
    static boolean isAnagram(String a, String b) {
        if (a.length() != b.length()) return false;
        int[] count = new int[26];
        for (int i = 0; i < a.length(); i++) {
            count[a.charAt(i) - 'a']++;
            count[b.charAt(i) - 'a']--;
        }
        for (int c : count) if (c != 0) return false;
        return true;
    }

    static Map<Integer, List<Integer>> adjacencyList(int[][] edges) {
        Map<Integer, List<Integer>> graph = new TreeMap<>();     // TreeMap only to print in a stable order
        for (int[] e : edges) {
            graph.computeIfAbsent(e[0], k -> new ArrayList<>()).add(e[1]);   // undirected: both directions
            graph.computeIfAbsent(e[1], k -> new ArrayList<>()).add(e[0]);
        }
        return graph;
    }

    // ---- heaps
    static List<Integer> kLargest(int[] nums, int k) {
        PriorityQueue<Integer> minHeap = new PriorityQueue<>();
        for (int x : nums) {
            minHeap.offer(x);
            if (minHeap.size() > k) minHeap.poll();                // drop the smallest: heap keeps the k largest
        }
        List<Integer> result = new ArrayList<>();
        while (!minHeap.isEmpty()) result.add(minHeap.poll());     // poll() gives sorted order, iteration doesn't
        return result;
    }

    static List<String> kClosest(int[][] points, int k) {
        PriorityQueue<int[]> maxHeap = new PriorityQueue<>(
                Comparator.comparingInt((int[] p) -> p[0] * p[0] + p[1] * p[1]).reversed());
        for (int[] p : points) {
            maxHeap.offer(p);
            if (maxHeap.size() > k) maxHeap.poll();
        }
        List<String> result = new ArrayList<>();
        for (int[] p : maxHeap) result.add(Arrays.toString(p));
        result.sort(Comparator.naturalOrder());
        return result;
    }

    // ---- stacks
    static boolean balanced(String s) {
        Deque<Character> stack = new ArrayDeque<>();
        for (char c : s.toCharArray()) {
            switch (c) {
                case '(' -> stack.push(')');
                case '[' -> stack.push(']');
                case '{' -> stack.push('}');
                default -> {
                    if (stack.isEmpty() || stack.pop() != c) return false;
                }
            }
        }
        return stack.isEmpty();
    }

    static int[] nextGreater(int[] nums) {
        int[] answer = new int[nums.length];
        Arrays.fill(answer, -1);
        Deque<Integer> stack = new ArrayDeque<>();                 // indices with decreasing values
        for (int i = 0; i < nums.length; i++) {
            while (!stack.isEmpty() && nums[stack.peek()] < nums[i]) answer[stack.pop()] = nums[i];
            stack.push(i);
        }
        return answer;
    }

    // ---- BFS on a grid
    static int shortestPath(String[] grid) {
        int rows = grid.length, cols = grid[0].length();
        int[][] dirs = { { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } };
        boolean[][] seen = new boolean[rows][cols];
        Deque<int[]> queue = new ArrayDeque<>();
        queue.offer(new int[] { 0, 0, 0 });                         // row, col, distance
        seen[0][0] = true;
        while (!queue.isEmpty()) {
            int[] cur = queue.poll();
            if (cur[0] == rows - 1 && cur[1] == cols - 1) return cur[2];
            for (int[] d : dirs) {
                int r = cur[0] + d[0], c = cur[1] + d[1];
                if (r >= 0 && r < rows && c >= 0 && c < cols && !seen[r][c] && grid[r].charAt(c) == '.') {
                    seen[r][c] = true;                              // mark when enqueued, not when polled
                    queue.offer(new int[] { r, c, cur[2] + 1 });
                }
            }
        }
        return -1;
    }

    // ---- intervals and ordered maps
    static List<String> mergeIntervals(int[][] intervals) {
        int[][] sorted = intervals.clone();
        Arrays.sort(sorted, Comparator.comparingInt(a -> a[0]));
        List<int[]> merged = new ArrayList<>();
        for (int[] iv : sorted) {
            if (!merged.isEmpty() && merged.get(merged.size() - 1)[1] >= iv[0]) {
                merged.get(merged.size() - 1)[1] = Math.max(merged.get(merged.size() - 1)[1], iv[1]);
            } else {
                merged.add(new int[] { iv[0], iv[1] });
            }
        }
        return merged.stream().map(Arrays::toString).toList();
    }

    // ---- sliding window
    static int longestUniqueSubstring(String s) {
        int[] lastSeen = new int[128];
        Arrays.fill(lastSeen, -1);
        int best = 0;
        for (int left = 0, right = 0; right < s.length(); right++) {
            char c = s.charAt(right);
            left = Math.max(left, lastSeen[c] + 1);                 // jump past the previous occurrence
            lastSeen[c] = right;
            best = Math.max(best, right - left + 1);
        }
        return best;
    }

    // ---- binary search (lower bound)
    static int lowerBound(int[] sorted, int target) {
        int lo = 0, hi = sorted.length;
        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;                           // no overflow
            if (sorted[mid] < target) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }

    public static void main(String[] args) throws IOException {
        Map<Character, Integer> freq = new TreeMap<>();
        for (char c : "mississippi".toCharArray()) freq.merge(c, 1, Integer::sum);
        System.out.println("merge counting: " + freq);
        System.out.println("isAnagram(listen, silent): " + isAnagram("listen", "silent") + ", (rat, car): " + isAnagram("rat", "car"));
        System.out.println("adjacency list from edges: " + adjacencyList(new int[][] { { 1, 2 }, { 1, 3 }, { 2, 4 }, { 3, 4 }, { 4, 5 } }));

        System.out.println("3 largest of [5,1,9,3,7,8]: " + kLargest(new int[] { 5, 1, 9, 3, 7, 8 }, 3));
        System.out.println("2 closest to origin: " + kClosest(new int[][] { { 3, 3 }, { 5, -1 }, { -2, 4 }, { 1, 1 } }, 2));

        System.out.println("balanced: {[()]} " + balanced("{[()]}") + ", ([)] " + balanced("([)]") + ", (( " + balanced("(("));
        System.out.println("next greater of [2,1,2,4,3]: " + Arrays.toString(nextGreater(new int[] { 2, 1, 2, 4, 3 })));

        String[] grid = { "..#.", ".##.", "....", "#.#." };
        System.out.println("BFS shortest path through grid: " + shortestPath(grid) + " steps");

        System.out.println("merge intervals: " + mergeIntervals(new int[][] { { 8, 10 }, { 1, 3 }, { 2, 6 }, { 15, 18 }, { 17, 20 } }));
        TreeMap<Integer, String> taxBrackets = new TreeMap<>(Map.of(0, "0%", 300_000, "5%", 700_000, "10%", 1_000_000, "15%"));
        System.out.println("TreeMap.floorEntry(850000): " + taxBrackets.floorEntry(850_000) + ", ceilingKey(850000): " + taxBrackets.ceilingKey(850_000));

        System.out.println("longest substring without repeats in abcabcbb: " + longestUniqueSubstring("abcabcbb"));
        int[] sorted = { 1, 3, 3, 5, 8 };
        System.out.println("lowerBound(3) = " + lowerBound(sorted, 3) + ", lowerBound(4) = " + lowerBound(sorted, 4)
                + ", Arrays.binarySearch(4) = " + Arrays.binarySearch(sorted, 4) + " (= -(insertion point) - 1)");

        List<String> words = new ArrayList<>(List.of("pear", "fig", "banana", "kiwi", "apple"));
        words.sort(Comparator.comparingInt(String::length).thenComparing(Comparator.naturalOrder()));
        System.out.println("sort by length, then alphabetically: " + words);
        Integer[] boxed = { 5, 2, 9 };
        Arrays.sort(boxed, Comparator.reverseOrder());               // descending needs boxed (or sort + reverse)
        System.out.println("descending: " + Arrays.toString(boxed));

        // ---- fast input parsing (stdin simulated with a string)
        BufferedReader in = new BufferedReader(new StringReader("5\n3 1 4 1 5\n"));
        int n = Integer.parseInt(in.readLine().trim());
        StringTokenizer st = new StringTokenizer(in.readLine());
        long total = 0;
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < n; i++) {
            int value = Integer.parseInt(st.nextToken());
            total += value;
            out.append(value * 2).append(i + 1 < n ? ' ' : '\n');
        }
        System.out.print("fast I/O: doubled -> " + out);
        System.out.println("fast I/O: sum -> " + total);

        // ---- pitfalls
        System.out.println("-- pitfalls --");
        Integer[] values = { Integer.MIN_VALUE, 1, -1 };
        Integer[] copy = values.clone();
        Arrays.sort(values, (a, b) -> a - b);                        // overflow in the comparator
        Arrays.sort(copy, Integer::compare);
        System.out.println("comparator a - b: " + Arrays.toString(values) + "  vs Integer::compare: " + Arrays.toString(copy));
        Map<String, Integer> scores = new HashMap<>(Map.of("ada", 1_000, "bob", 1_000));
        System.out.println("scores.get(ada) == scores.get(bob): " + (scores.get("ada") == scores.get("bob"))
                + ", equals: " + scores.get("ada").equals(scores.get("bob")));
        int intSum = 0;
        long longSum = 0;
        for (int x : new int[] { 2_000_000_000, 2_000_000_000 }) {
            intSum += x;
            longSum += x;
        }
        System.out.println("int sum " + intSum + " vs long sum " + longSum);
        int lo = 2_000_000_000, hi = 2_100_000_000;
        System.out.println("(lo + hi) / 2 = " + (lo + hi) / 2 + " vs lo + (hi - lo) / 2 = " + (lo + (hi - lo) / 2));
        System.out.println("\"a.b.c\".split(\".\").length = " + "a.b.c".split(".").length + ", split(\"\\\\.\").length = " + "a.b.c".split("\\.").length);
        PriorityQueue<Integer> heap = new PriorityQueue<>(List.of(5, 1, 4, 2, 3));
        List<Integer> polled = new ArrayList<>();
        while (!heap.isEmpty()) polled.add(heap.poll());
        System.out.println("PriorityQueue.toString() " + new PriorityQueue<>(List.of(5, 1, 4, 2, 3)) + " is heap order; poll() order " + polled);
    }
}
```

## Output

```text title="Output" output="CodingToolkit.java"
merge counting: {i=4, m=1, p=2, s=4}
isAnagram(listen, silent): true, (rat, car): false
adjacency list from edges: {1=[2, 3], 2=[1, 4], 3=[1, 4], 4=[2, 3, 5], 5=[4]}
3 largest of [5,1,9,3,7,8]: [7, 8, 9]
2 closest to origin: [[1, 1], [3, 3]]
balanced: {[()]} true, ([)] false, (( false
next greater of [2,1,2,4,3]: [4, 2, 4, -1, -1]
BFS shortest path through grid: 6 steps
merge intervals: [[1, 6], [8, 10], [15, 20]]
TreeMap.floorEntry(850000): 700000=10%, ceilingKey(850000): 1000000
longest substring without repeats in abcabcbb: 3
lowerBound(3) = 1, lowerBound(4) = 3, Arrays.binarySearch(4) = -4 (= -(insertion point) - 1)
sort by length, then alphabetically: [fig, kiwi, pear, apple, banana]
descending: [9, 5, 2]
fast I/O: doubled -> 6 2 8 2 10
fast I/O: sum -> 14
-- pitfalls --
comparator a - b: [-1, 1, -2147483648]  vs Integer::compare: [-2147483648, -1, 1]
scores.get(ada) == scores.get(bob): false, equals: true
int sum -294967296 vs long sum 4000000000
(lo + hi) / 2 = -97483648 vs lo + (hi - lo) / 2 = 2050000000
"a.b.c".split(".").length = 0, split("\\.").length = 3
PriorityQueue.toString() [1, 2, 4, 5, 3] is heap order; poll() order [1, 2, 3, 4, 5]
```

- **Counting and grouping**: `merge` handled "missing → 1" and "present → +1" in one call. The `int[26]` anagram check is O(n) with no hashing. `computeIfAbsent` built a graph's adjacency list with one line per edge direction, the usual first step of BFS/DFS problems.
- **Heaps**: a **min-heap of size k** kept the k largest (anything smaller is evicted), and a **max-heap by distance** kept the k closest points.
- **Stacks**:
  - pushing the *expected* closing bracket makes the matching check a single comparison;
  - the **monotonic stack** resolved each "next greater" in amortised O(n).
- **BFS**: it found the shortest path in steps. Marking cells as seen **when enqueued** prevents the same cell from being queued twice.
- **Intervals**: sorted by start, then extended the last merged interval while they overlap. `TreeMap.floorEntry` answered "which bracket applies to 850,000?" in O(log n).
- **Sliding window and binary search**: the window jumped `left` past repeated characters. `lowerBound` gives the first index ≥ target, and `Arrays.binarySearch` encodes a missing key as `-(insertion point) - 1`.
- **Sorting**: comparators compose (length, then alphabetical). Descending order needs boxed arrays or a reverse step.
- **Fast I/O**: one reader, a tokenizer, and a single buffered output.
- **Pitfalls**:
  - the subtraction comparator mis-sorted `MIN_VALUE` because `MIN_VALUE - 1` overflows;
  - `==` on two boxed 1000s was `false`;
  - the `int` sum and the naive midpoint overflowed;
  - `split(".")` treated `.` as "any character" and produced no tokens;
  - a `PriorityQueue`'s `toString()` shows heap order, not sorted order.

## Real-world application

- **Online assessments** (HackerRank, Codility, LeetCode-style) and **live coding** (CoderPad, a shared document) at most product companies. Knowing these idioms saves 5-10 minutes per problem, which you can spend on edge cases and testing.
- **Machine-coding rounds** reuse the same structures: `ArrayDeque` for queues of tasks, `PriorityQueue` for schedulers (next job by time), `TreeMap` for time-based lookups (rate windows, bookings), `LinkedHashMap` for LRU caches, and `ConcurrentHashMap.merge` for thread-safe counters.
- **Production code** uses the same idioms, with the pitfalls mattering even more:
  - comparator overflow in sorting by `long` timestamps (use `Comparator.comparingLong`);
  - `==` on boxed ids from maps;
  - `int` overflow in byte or time arithmetic;
  - `String.split` regex surprises in parsers.
- **Communicating in Java**: naming the structure and its complexity as you write ("a min-heap of size k, so O(n log k)") is part of the score. It shows you chose the structure deliberately.

## Common mistakes

- **Using `Stack`/`Vector`/`LinkedList`** where `ArrayDeque` is the idiomatic, faster choice (no synchronisation, cache-friendly). Note that `ArrayDeque` rejects `null`.
- **Comparators as subtraction** (`(a, b) -> a - b`, or `b[1] - a[1]` on large values): use `Integer.compare` or `Comparator.comparingInt`.
- **Comparing boxed values with `==`**, including `map.get(x) == map.get(y)` and `list.get(i) == list.get(j)`.
- **Forgetting `long`** for sums, products, factorials, and modular arithmetic with `1_000_000_007` (multiply in `long`, then take `% MOD`).
- **Marking BFS nodes as visited when polled** instead of when enqueued: duplicates explode the queue.
- **Iterating a `PriorityQueue`** expecting sorted order, or calling `remove(Object)`/`contains` in a loop (O(n) each).
- **Recursion that's too deep** for large inputs: use an explicit stack.
- **`Scanner` for large inputs**, and `System.out.println` inside loops on judges.
- **Silent mutation**: sorting the caller's array in place, or reusing `int[]` objects in a result list and then modifying them.

## Interview questions

**Q1. Why `ArrayDeque` over `Stack` and `LinkedList` for stacks and queues?**

````reveal title="Answer"
- `Stack` extends `Vector`: every method is `synchronized` (needless overhead), it exposes index-based methods that break the stack abstraction, and its iteration order is bottom to top.
- `LinkedList` allocates a node per element (24+ bytes of overhead), has poor cache locality, and permits `null`, which makes `poll()`'s null ambiguous.
- `ArrayDeque` is a resizable circular array: O(1) amortised at both ends, compact, and fast. It's the recommended `Deque` for both stack (`push`/`pop`) and queue (`offer`/`poll`) use. It rejects `null`.
````

**Q2. How do you get the k largest elements efficiently, and what's the complexity?**

````reveal title="Answer"
Use a **min-heap of size k**: offer each element and poll whenever the size exceeds k. The heap always holds the k largest seen so far, and its root is the k-th largest. That's O(n log k) time and O(k) space, better than sorting (O(n log n)) when k ≪ n. Alternatives: quickselect, O(n) average and in place, but O(n²) worst case and it mutates the input; or, for small value ranges, counting or bucket sort in O(n).
````

**Q3. What's wrong with `(a, b) -> a[1] - b[1]` as a comparator?**

````reveal title="Answer"
Subtraction can overflow: with values near `Integer.MIN_VALUE`/`MAX_VALUE` (or large timestamps in `long`s cast to `int`), the difference wraps and has the wrong sign. The sort is then incorrect, and TimSort may even throw "Comparison method violates its general contract". Use `Integer.compare(a[1], b[1])` or `Comparator.comparingInt(a -> a[1])`, and `Long.compare` for `long`s.
````

**Q4. `Scanner` vs `BufferedReader` for reading 10⁶ numbers?**

````reveal title="Answer"
`Scanner` tokenises with regular expressions and does locale-aware parsing, which is slow for large inputs (it can take seconds for 10⁶ tokens). `BufferedReader.readLine` with `StringTokenizer` (or `split` on simple delimiters), plus `Integer.parseInt`, is several times faster. A custom `DataInputStream` byte parser is fastest. For output, accumulate in a `StringBuilder` or a buffered `PrintWriter` and flush once.
````

**Q5. How do you sort an `int[]` in descending order?**

````reveal title="Answer"
`Arrays.sort(int[])` takes no comparator (it's for primitives). Options:
- sort ascending and reverse in place with two pointers: O(n log n), no boxing;
- box it: `Integer[] b = Arrays.stream(a).boxed().toArray(Integer[]::new); Arrays.sort(b, Comparator.reverseOrder());`, which costs allocation;
- `Arrays.stream(a).boxed().sorted(Comparator.reverseOrder()).mapToInt(Integer::intValue).toArray()`;
- for non-negative values, sort the negated values and negate back (careful with `Integer.MIN_VALUE`).

In interviews, sort plus reverse is the cleanest answer.
````

## Hands-on exercise

Find and fix the bugs in this "leaderboard" solution. The spec:
- transactions are `{userId, amountCents}` strings, and amounts can be **negative (refunds) and up to 3 billion**;
- users whose total is exactly zero are dropped;
- the result is sorted by total, **highest first**, with **ties broken by user id**;
- `topTwoTied` reports whether the first two users have equal totals.

```java
static List<String> leaderboard(List<String[]> txns, Map<String, Integer> totals) {
    for (String[] t : txns) {
        totals.put(t[0], totals.getOrDefault(t[0], 0) + Integer.parseInt(t[1]));
    }
    for (String user : totals.keySet()) {
        if (totals.get(user) == 0) totals.remove(user);
    }
    List<String> users = new ArrayList<>(totals.keySet());
    users.sort((a, b) -> totals.get(b) - totals.get(a));
    return users;
}

static boolean topTwoTied(List<String> board, Map<String, Integer> totals) {
    return totals.get(board.get(0)) == totals.get(board.get(1));
}
```

There are at least five bugs. Write a fixed version, then run both against these test cases:
- refunds that cancel out;
- totals above `Integer.MAX_VALUE`;
- ties at 1000;
- a large positive versus a large negative total.

````hint title="Hint"
Check:
- parsing (`Integer.parseInt("3000000000")`);
- accumulation type;
- removal during `keySet()` iteration;
- the subtraction comparator;
- `==` on `Integer`;
- the missing tie-break;
- a board with fewer than two users.

A record `Standing(String user, long totalCents)` plus `Map.merge` with `Long::sum`, `values().removeIf(v -> v == 0)`, and `Comparator.comparingLong(Standing::totalCents).reversed().thenComparing(Standing::user)` fixes most of them.
````

````solution title="Solution"
```java title="LeaderboardFix.java" file="LeaderboardFix.java"
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class LeaderboardFix {
    // ---------------- the buggy version, kept to show each failure ----------------
    static List<String> buggyLeaderboard(List<String[]> txns, Map<String, Integer> totals) {
        for (String[] t : txns) {
            totals.put(t[0], totals.getOrDefault(t[0], 0) + Integer.parseInt(t[1]));
        }
        for (String user : totals.keySet()) {
            if (totals.get(user) == 0) totals.remove(user);
        }
        List<String> users = new ArrayList<>(totals.keySet());
        users.sort((a, b) -> totals.get(b) - totals.get(a));
        return users;
    }

    static boolean buggyTopTwoTied(List<String> board, Map<String, Integer> totals) {
        return totals.get(board.get(0)) == totals.get(board.get(1));
    }

    // ---------------- the fixed version ----------------
    record Standing(String user, long totalCents) { }

    static List<Standing> leaderboard(List<String[]> txns) {
        Map<String, Long> totals = new HashMap<>();
        for (String[] t : txns) {
            totals.merge(t[0], Long.parseLong(t[1]), Long::sum);           // long: no parse failure, no overflow
        }
        totals.values().removeIf(total -> total == 0);                       // safe removal while iterating
        return totals.entrySet().stream()
                .map(e -> new Standing(e.getKey(), e.getValue()))
                .sorted(Comparator.comparingLong(Standing::totalCents).reversed()   // no subtraction
                        .thenComparing(Standing::user))                       // deterministic tie-break
                .toList();
    }

    static boolean topTwoTied(List<Standing> board) {
        return board.size() >= 2 && board.get(0).totalCents() == board.get(1).totalCents();   // primitive compare
    }

    static void run(String name, List<String[]> txns) {
        System.out.println(name);
        try {
            Map<String, Integer> totals = new HashMap<>();
            List<String> board = buggyLeaderboard(txns, totals);
            String tied = board.size() >= 2 ? String.valueOf(buggyTopTwoTied(board, totals)) : "(fewer than 2 users)";
            System.out.println("  buggy: " + board + " totals " + totals + " tied=" + tied);
        } catch (RuntimeException e) {
            System.out.println("  buggy: " + e.getClass().getSimpleName() + (e.getMessage() == null ? "" : ": " + e.getMessage()));
        }
        List<Standing> fixed = leaderboard(txns);
        System.out.println("  fixed: " + fixed + " tied=" + topTwoTied(fixed));
    }

    static String[] t(String user, String cents) {
        return new String[] { user, cents };
    }

    public static void main(String[] args) {
        run("refunds that cancel out", List.of(t("ada", "500"), t("zed", "700"), t("zed", "-700"), t("bob", "300")));
        run("totals above Integer.MAX_VALUE", List.of(t("whale", "1500000000"), t("whale", "1500000000"), t("amy", "10")));
        run("an amount of 3 billion", List.of(t("whale", "3000000000"), t("amy", "10")));
        run("ties at 1000", List.of(t("eve", "1000"), t("dan", "1000"), t("cy", "5")));
        run("large positive vs large negative", List.of(t("rich", "2000000000"), t("debtor", "-2000000000"), t("mid", "1")));
    }
}
```

```text title="Output" output="LeaderboardFix.java"
refunds that cancel out
  buggy: ConcurrentModificationException
  fixed: [Standing[user=ada, totalCents=500], Standing[user=bob, totalCents=300]] tied=false
totals above Integer.MAX_VALUE
  buggy: [amy, whale] totals {whale=-1294967296, amy=10} tied=false
  fixed: [Standing[user=whale, totalCents=3000000000], Standing[user=amy, totalCents=10]] tied=false
an amount of 3 billion
  buggy: NumberFormatException: For input string: "3000000000"
  fixed: [Standing[user=whale, totalCents=3000000000], Standing[user=amy, totalCents=10]] tied=false
ties at 1000
  buggy: [dan, eve, cy] totals {dan=1000, eve=1000, cy=5} tied=false
  fixed: [Standing[user=dan, totalCents=1000], Standing[user=eve, totalCents=1000], Standing[user=cy, totalCents=5]] tied=true
large positive vs large negative
  buggy: [debtor, rich, mid] totals {debtor=-2000000000, rich=2000000000, mid=1} tied=false
  fixed: [Standing[user=rich, totalCents=2000000000], Standing[user=mid, totalCents=1], Standing[user=debtor, totalCents=-2000000000]] tied=false
```

The bugs, and what each fix does:
1. **`Integer.parseInt` on 3 billion** throws `NumberFormatException`. **Fix**: `Long.parseLong`.
2. **`int` accumulation** wraps when totals pass `Integer.MAX_VALUE`, turning the whale's total negative. **Fix**: `long` totals with `merge(…, Long::sum)`.
3. **Removing from a map while iterating its `keySet()`** throws `ConcurrentModificationException`, unless the removed key happens to be the last one iterated, so the bug hides in some test data. **Fix**: `values().removeIf(...)`.
4. **The subtraction comparator** overflows for large totals of opposite sign (2,000,000,000 − (−2,000,000,000)), producing a wrong order. **Fix**: `Comparator.comparingLong(...)`.
5. **`==` on `Integer`** compared object identity: two totals of 1000 aren't the same cached object. **Fix**: compare primitive `long` values, or use `equals`.
6. **No tie-break**: equal totals came out in `HashMap` order. **Fix**: `.thenComparing(Standing::user)` for a deterministic, specified order.
7. **No size check**: the buggy `topTwoTied` would throw on a board with fewer than two users. **Fix**: `board.size() >= 2 && …`.

Each bug passes small happy-path tests, which is exactly why interviewers (and production) find them. State the edge cases (big values, negatives, ties, empty and size-1 inputs) before you finish.
````

## Knowledge check

```quiz
? Which structure should you use for a stack in interview Java code?
+ ArrayDeque with push/pop/peek
- java.util.Stack
- LinkedList with add/remove(0)
> ArrayDeque is unsynchronised, compact and O(1) at both ends.

? You need the k largest of n numbers. Which approach is O(n log k)?
+ A min-heap of size k, evicting the smallest when the size exceeds k
- A max-heap holding all n elements, polled k times
- Sorting the whole array
> The heap root is the k-th largest so far.

? Which comparator is safe for any int values?
+ Integer.compare(a, b)
- (a, b) -> a - b
- (a, b) -> a > b ? 1 : 0
> Subtraction overflows; the last one never returns -1.

? When should a BFS mark a grid cell as visited?
+ When it is enqueued
- When it is polled
- After the whole level is processed
> Marking at enqueue time prevents duplicate entries in the queue.

? "a.b.c".split(".") returns an array of length?
+ 0, because "." is a regex matching every character
- 3
- 1
> Use split("\\.") or Pattern.quote(".").
```

## Key takeaways

- Map the **pattern to the structure**: `HashMap.merge`/`int[26]` for counting, `computeIfAbsent` for grouping, `ArrayDeque` for stacks, queues and BFS, `PriorityQueue` (size-k heaps) for top-k, `TreeMap` for floor/ceiling, sorting and sliding windows for intervals and substrings.
- Memorise the **idioms**: comparators with `comparingInt`/`thenComparing`, `lo + (hi - lo) / 2`, `long` accumulators, `Math.floorMod`, `StringBuilder`, and fast I/O with `BufferedReader` + `StringTokenizer`.
- Know the **complexities**: `ArrayList` front operations are O(n); hash operations are O(1) on average; tree and heap operations are O(log n); heap `contains`/`remove(Object)` is O(n); strings copy.
- Avoid the classic **Java bugs**: `==` on boxed values, overflow (sums, midpoints, subtraction comparators), `remove(int)` vs `remove(Object)`, modification during iteration, `split` regexes, `PriorityQueue` iteration order, deep recursion.
- **Verify out loud**: run an example, then the edge cases (empty, one element, duplicates, negatives, extremes), and restate the complexity.
