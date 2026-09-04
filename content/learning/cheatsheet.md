# The Complete DSA Guide for L4 (Java Edition)

> Written for a true beginner going from zero → interview-ready. Every section has: the concept, when to reach for it, the Java code, and the "gotchas" that trip people up in real interviews.

---

## TABLE OF CONTENTS

- **[Part 0](#part-0--how-google-l4-interviews-actually-work)** — How Google L4 interviews actually work
- **[Part 1](#part-1--big-o-and-how-to-think-about-complexity)** — Big-O and how to think about complexity
- **[Part 2](#part-2--java-syntax-cheat-sheet-for-interviews)** — Java syntax cheat-sheet for interviews
- **[Part 3](#part-3--arrays--strings)** — Arrays & Strings (+ two pointers, sliding window, prefix sums)
- **[Part 4](#part-4--hashing)** — Hashing
- **[Part 5](#part-5--linked-lists)** — Linked Lists
- **[Part 6](#part-6--stacks--queues)** — Stacks & Queues (+ monotonic stack)
- **[Part 7](#part-7--recursion--backtracking)** — Recursion & Backtracking
- **[Part 8](#part-8--sorting-algorithms)** — Sorting algorithms
- **[Part 9](#part-9--binary-search)** — Binary Search (+ binary search on the answer)
- **[Part 10](#part-10--trees)** — Trees (traversal, BST, LCA, balanced trees)
- **[Part 11](#part-11--heaps--priority-queues)** — Heaps / Priority Queues
- **[Part 12](#part-12--graphs)** — Graphs (BFS, DFS, topo sort, union-find, Dijkstra, MST)
- **[Part 13](#part-13--tries-prefix-trees)** — Tries
- **[Part 14](#part-14--dynamic-programming)** — Dynamic Programming (the part everyone fears)
- **[Part 15](#part-15--greedy-algorithms)** — Greedy Algorithms
- **[Part 16](#part-16--bit-manipulation)** — Bit Manipulation
- **[Part 17](#part-17--advanced--rare-but-useful-topics)** — Advanced/rare-but-useful topics (Segment Tree, Fenwick Tree, KMP)
- **[Part 18](#part-18--the-15-patterns-cheat-sheet)** — The 15 Patterns Cheat-Sheet
- **[Part 19](#part-19--10-week-study-plan-beginner--l4-ready)** — 10-Week Study Plan
- **[Part 20](#part-20--interview-day-framework--communication-script)** — Interview-Day Framework & Communication Script
- **[Part 21](#part-21--common-mistakes-that-cost-people-l4-offers)** — Common Mistakes That Cost People L4 Offers

---

# PART 0 — How Google L4 Interviews Actually Work

L4 (SWE II, mid-level, roughly 2-5 YOE) at Google typically means:
- **4-5 rounds**: usually 2-3 pure coding/algorithms rounds, 1 "Googleyness & Leadership" behavioral round, sometimes 1 system design round (more common as you approach L5, but can appear at L4).
- Each coding round is **45 minutes**, in a shared doc or Google's internal code editor (no auto-complete, no syntax highlighting help beyond basics).
- You get **1-2 problems per round** — usually a medium, sometimes a medium followed by a harder follow-up/optimization.
- Interviewers are grading against a **rubric**, not vibes. The four pillars are roughly:
    1. **Problem solving** — did you get to a correct, reasonably optimal solution?
    2. **Coding** — is the code clean, correct, and would it actually compile/run?
    3. **Communication** — did you think out loud, clarify requirements, and collaborate?
    4. **Verification/testing** — did you trace through examples and catch your own bugs?

**Key insight for a beginner:** Google does NOT expect you to instantly know the trick. They expect you to have a *process*: clarify → brute force → identify the bottleneck → optimize → code → test. A person who talks through a mediocre solution clearly often scores better than a silent person who blurts out the optimal answer without explanation.

**What "L4-level" actually means in practice:**
- You're expected to solve **most Medium** LeetCode-style problems independently within 20-25 minutes, leaving time to code and test.
- You're expected to know your Java standard library well enough not to hesitate (e.g., not fumbling with `HashMap` syntax).
- You're expected to state time/space complexity without being asked.
- You are usually NOT expected to independently derive advanced things like segment trees from scratch — but you should recognize *when* a hard technique is needed, even if you need a hint to implement it.

---

# PART 1 — Big-O and How to Think About Complexity

This is the language you'll use to talk about every solution, so it has to be automatic.

## The core idea
Big-O describes how runtime/memory **grows** as input size `n` grows — not exact operations. We care about the dominant term and drop constants.

| Notation | Name | Example |
|---|---|---|
| O(1) | Constant | array index access, HashMap get/put (average) |
| O(log n) | Logarithmic | binary search |
| O(n) | Linear | single loop through array |
| O(n log n) | Linearithmic | efficient sorting (merge sort, heap sort) |
| O(n²) | Quadratic | nested loops, bubble sort |
| O(2ⁿ) | Exponential | brute-force subsets, naive recursion (fib) |
| O(n!) | Factorial | brute-force permutations |

## How to derive it fast in an interview
1. **Count nested loops.** Two nested loops over `n` → usually O(n²), unless the inner loop's range shrinks (still might be O(n²) even so — check carefully, e.g. two-pointer is O(n) even though it "looks" nested).
2. **Recursion → draw the recursion tree.** Branching factor `b`, depth `d` → roughly O(b^d) unless there's memoization.
3. **Memoization changes everything.** A recursive solution with `k` unique subproblems, each done in O(1) extra work, is O(k) — not exponential.
4. **HashMap/HashSet operations are O(1) average**, O(n) worst case (hash collisions) — say "amortized O(1)" if asked.
5. **TreeMap/TreeSet (Java's balanced BST) operations are O(log n).**
6. **Sorting is O(n log n)** unless you use counting/radix/bucket sort (O(n) under constraints).

## Space complexity
Don't forget: **recursion uses stack space.** A recursive function with depth `n` uses O(n) space even if it allocates no data structures. This is a very common thing beginners forget to mention.

## Practical tip
Always state complexity **out loud**, unprompted: *"This is O(n) time because we do a single pass, and O(1) extra space since we're not using any auxiliary data structures beyond a few pointers."* Interviewers are listening for this even when they don't explicitly ask.

---

# PART 2 — Java Syntax Cheat-Sheet for Interviews

You should be able to write these without thinking. Fumbling with syntax burns your 45 minutes.

```java
// ---------- ARRAYS ----------
int[] arr = new int[10];              // fixed size, all zeros
int[] arr2 = {1, 2, 3};               // literal
int[][] grid = new int[rows][cols];   // 2D array
Arrays.sort(arr);                     // in-place sort, O(n log n)
Arrays.fill(arr, -1);                 // fill with value
int[] copy = Arrays.copyOf(arr, arr.length);
Arrays.toString(arr);                 // for printing/debugging

// ---------- LISTS ----------
List<Integer> list = new ArrayList<>();
list.add(5);
list.get(0);
list.set(0, 10);
list.remove(Integer.valueOf(5));      // remove BY VALUE (careful: remove(int) removes by INDEX)
Collections.sort(list);
Collections.reverse(list);

// ---------- HASHMAP / HASHSET ----------
Map<String, Integer> map = new HashMap<>();
map.put("a", 1);
map.getOrDefault("a", 0);             // avoids null checks
map.containsKey("a");
for (Map.Entry<String, Integer> entry : map.entrySet()) { ... }

Set<Integer> set = new HashSet<>();
set.add(5); set.contains(5); set.remove(5);

// ---------- STACK / QUEUE / DEQUE ----------
Deque<Integer> stack = new ArrayDeque<>();   // preferred over java.util.Stack
stack.push(1); stack.pop(); stack.peek();

Deque<Integer> queue = new ArrayDeque<>();
queue.offer(1); queue.poll(); queue.peek();

// ---------- PRIORITY QUEUE (heap) ----------
PriorityQueue<Integer> minHeap = new PriorityQueue<>();                     // min-heap by default
PriorityQueue<Integer> maxHeap = new PriorityQueue<>(Collections.reverseOrder());
PriorityQueue<int[]> customHeap = new PriorityQueue<>((a, b) -> a[0] - b[0]); // custom comparator

// ---------- STRINGBUILDER (mutable strings) ----------
StringBuilder sb = new StringBuilder();
sb.append("hi");
sb.reverse();
sb.toString();
sb.deleteCharAt(sb.length() - 1);

// ---------- STRING BASICS ----------
String s = "hello";
s.charAt(0);
s.length();
s.substring(1, 3);       // [1,3) — end exclusive
s.toCharArray();
String.valueOf(charArray);
s.split(",");
Character.isDigit(c); Character.isLetter(c); Character.toLowerCase(c);

// ---------- LINKEDLIST NODE (you'll usually define this yourself) ----------
class ListNode {
    int val;
    ListNode next;
    ListNode(int val) { this.val = val; }
}

// ---------- TREE NODE ----------
class TreeNode {
    int val;
    TreeNode left, right;
    TreeNode(int val) { this.val = val; }
}
```

**Gotcha:** `list.remove(5)` on a `List<Integer>` removes the element **at index 5**, not the value 5, because of autoboxing ambiguity. Use `list.remove(Integer.valueOf(5))` to remove by value. This trips up almost every beginner at least once — get it wrong now, not in the interview.

---

# PART 3 — Arrays & Strings

This is 40%+ of easy/medium interview questions in disguise. Master these four patterns and you'll recognize half the problems you see instantly.

## 3.1 Two Pointers

**When to use:** sorted array, or you need to compare elements from two ends / two positions moving toward each other.

```java
// Example: Two Sum on a SORTED array — find two numbers that add to target
public int[] twoSumSorted(int[] nums, int target) {
    int left = 0, right = nums.length - 1;
    while (left < right) {
        int sum = nums[left] + nums[right];
        if (sum == target) return new int[]{left, right};
        else if (sum < target) left++;   // need a bigger sum
        else right--;                     // need a smaller sum
    }
    return new int[]{-1, -1};
}
// Time: O(n)  Space: O(1)
```

**Tip:** If the array ISN'T sorted, either sort it first (O(n log n)) if order doesn't matter for the answer, or use a HashMap instead (see Part 4).

## 3.2 Sliding Window

**When to use:** "contiguous subarray/substring" + some condition (max/min length, sum, distinct chars, etc). This converts an O(n²) brute force into O(n).

```java
// Example: Longest substring without repeating characters
public int lengthOfLongestSubstring(String s) {
    Set<Character> window = new HashSet<>();
    int left = 0, maxLen = 0;
    for (int right = 0; right < s.length(); right++) {
        char c = s.charAt(right);
        // shrink window from left until no duplicate
        while (window.contains(c)) {
            window.remove(s.charAt(left));
            left++;
        }
        window.add(c);
        maxLen = Math.max(maxLen, right - left + 1);
    }
    return maxLen;
}
// Time: O(n) — each char added/removed at most once. Space: O(min(n, charset))
```

**The template to memorize:**
```java
int left = 0;
for (int right = 0; right < n; right++) {
    // 1. add nums[right] into window state
    while (/* window is invalid */) {
        // 2. remove nums[left] from window state
        left++;
    }
    // 3. update answer using current window [left, right]
}
```
This ONE template solves: longest substring without repeats, minimum window substring, longest subarray with at most K distinct, max sum subarray of size K, fruit into baskets, etc.

## 3.3 Prefix Sums

**When to use:** repeated "sum of subarray from i to j" queries, or "find subarray with sum == k".

```java
// Precompute prefix sums for O(1) range-sum queries
int[] prefix = new int[nums.length + 1];
for (int i = 0; i < nums.length; i++) {
    prefix[i + 1] = prefix[i] + nums[i];
}
// sum of nums[i..j] inclusive = prefix[j+1] - prefix[i]

// Example: Subarray sum equals K (count subarrays)
public int subarraySum(int[] nums, int k) {
    Map<Integer, Integer> prefixCount = new HashMap<>();
    prefixCount.put(0, 1);       // empty prefix
    int sum = 0, count = 0;
    for (int num : nums) {
        sum += num;
        // if (sum - k) has occurred before, those subarrays sum to k
        count += prefixCount.getOrDefault(sum - k, 0);
        prefixCount.merge(sum, 1, Integer::sum);
    }
    return count;
}
// Time: O(n)  Space: O(n)
```

## 3.4 Kadane's Algorithm (Max Subarray Sum)

```java
public int maxSubArray(int[] nums) {
    int currentSum = nums[0], maxSum = nums[0];
    for (int i = 1; i < nums.length; i++) {
        // either extend the previous subarray, or start fresh at i
        currentSum = Math.max(nums[i], currentSum + nums[i]);
        maxSum = Math.max(maxSum, currentSum);
    }
    return maxSum;
}
// Time: O(n)  Space: O(1)
```
This is secretly a 1D DP problem — you'll see this pattern again in Part 14.

## 3.5 String-specific tricks
- **Anagram check**: sort both strings and compare, OR use a 26-length frequency array (faster, O(n) vs O(n log n)).
- **Palindrome check**: two pointers from outside in.
- **In-place reversal**: swap with two pointers, `left++`, `right--`.
- **StringBuilder for building strings in a loop** — never do `str += c` in a loop, that's O(n²) because Strings are immutable in Java and each `+=` creates a new String.

```java
// Anagram check via frequency array — O(n) time, O(1) space (26 letters)
public boolean isAnagram(String s, String t) {
    if (s.length() != t.length()) return false;
    int[] freq = new int[26];
    for (char c : s.toCharArray()) freq[c - 'a']++;
    for (char c : t.toCharArray()) freq[c - 'a']--;
    for (int f : freq) if (f != 0) return false;
    return true;
}
```

**Common beginner mistakes:**
- Off-by-one errors on window boundaries (`right - left + 1` vs `right - left`) — always trace a tiny example by hand.
- Forgetting substring's end index is EXCLUSIVE in Java (`s.substring(1,3)` gives indices 1,2 only).
- Using `==` to compare Strings instead of `.equals()` (works sometimes due to String pooling, fails unpredictably otherwise — always use `.equals()`).


# PART 4 — Hashing

**The single most valuable trick in interviews:** whenever you catch yourself thinking "I need to check if I've seen this before" or "I need to count occurrences" or "I need O(1) lookup," reach for a `HashMap`/`HashSet`. It converts an O(n²) nested-loop brute force into O(n).

```java
// Classic Two Sum (unsorted array, return indices)
public int[] twoSum(int[] nums, int target) {
    Map<Integer, Integer> seen = new HashMap<>();  // value -> index
    for (int i = 0; i < nums.length; i++) {
        int complement = target - nums[i];
        if (seen.containsKey(complement)) {
            return new int[]{seen.get(complement), i};
        }
        seen.put(nums[i], i);
    }
    return new int[]{-1, -1};
}
// Time: O(n)  Space: O(n)
```

**Grouping pattern** (e.g., group anagrams): use a computed "key" (sorted string, or frequency signature) mapped to a list of items.

```java
public List<List<String>> groupAnagrams(String[] strs) {
    Map<String, List<String>> groups = new HashMap<>();
    for (String s : strs) {
        char[] chars = s.toCharArray();
        Arrays.sort(chars);
        String key = new String(chars);
        groups.computeIfAbsent(key, k -> new ArrayList<>()).add(s);
    }
    return new ArrayList<>(groups.values());
}
// Time: O(n * k log k) where k = avg string length
```

**Design tip:** `computeIfAbsent`, `merge`, and `getOrDefault` are your best friends — they eliminate null-check boilerplate and are exactly what a strong Java interview solution looks like.

**HashMap vs TreeMap:** use `HashMap` for O(1) average lookups when order doesn't matter. Use `TreeMap` (O(log n) operations) when you need sorted keys, ceiling/floor queries, or range queries.

---

# PART 5 — Linked Lists

## Core setup
```java
class ListNode {
    int val;
    ListNode next;
    ListNode(int val) { this.val = val; }
}
```

## 5.1 The Dummy Node Trick
Whenever you're building/modifying a list and the head might change, create a `dummy` node pointing to the real head. This eliminates annoying "is this the first node?" edge cases.

```java
public ListNode removeElements(ListNode head, int val) {
    ListNode dummy = new ListNode(-1);
    dummy.next = head;
    ListNode curr = dummy;
    while (curr.next != null) {
        if (curr.next.val == val) curr.next = curr.next.next;
        else curr = curr.next;
    }
    return dummy.next;
}
```

## 5.2 Fast & Slow Pointers (Floyd's algorithm)
**When to use:** find the middle, detect a cycle, find cycle start.

```java
// Find middle node
public ListNode middleNode(ListNode head) {
    ListNode slow = head, fast = head;
    while (fast != null && fast.next != null) {
        slow = slow.next;
        fast = fast.next.next;
    }
    return slow;   // when fast hits the end, slow is at the middle
}

// Detect cycle
public boolean hasCycle(ListNode head) {
    ListNode slow = head, fast = head;
    while (fast != null && fast.next != null) {
        slow = slow.next;
        fast = fast.next.next;
        if (slow == fast) return true;
    }
    return false;
}
```

## 5.3 Reversing a Linked List (in-place, iterative)
This shows up constantly, both standalone and as a sub-step in harder problems (e.g., reverse in groups of k, palindrome check).

```java
public ListNode reverseList(ListNode head) {
    ListNode prev = null, curr = head;
    while (curr != null) {
        ListNode next = curr.next;  // save next before overwriting
        curr.next = prev;           // reverse the link
        prev = curr;
        curr = next;
    }
    return prev;   // prev is now the new head
}
// Time: O(n)  Space: O(1)
```

**Tip:** Draw the pointers on paper (`prev`, `curr`, `next`) for a 3-node list before coding. Nearly everyone messes up the order of reassignment the first few times — it's normal, just practice until it's muscle memory.

## 5.4 Merging Two Sorted Lists
```java
public ListNode mergeTwoLists(ListNode l1, ListNode l2) {
    ListNode dummy = new ListNode(-1);
    ListNode curr = dummy;
    while (l1 != null && l2 != null) {
        if (l1.val <= l2.val) { curr.next = l1; l1 = l1.next; }
        else { curr.next = l2; l2 = l2.next; }
        curr = curr.next;
    }
    curr.next = (l1 != null) ? l1 : l2;   // attach remaining list
    return dummy.next;
}
```

**Common beginner mistakes:**
- Losing the reference to `next` before reassigning `curr.next` (always save `next` first when reversing).
- Not handling `null` head or single-node lists as edge cases — always mention you're checking these.
- Forgetting to actually advance the dummy/curr pointer, causing infinite loops.


# PART 6 — Stacks & Queues

## 6.1 Stack basics
**When to use:** anything with nesting/matching (parentheses, undo operations), or "find the nearest previous/next greater/smaller element."

```java
// Valid Parentheses
public boolean isValid(String s) {
    Deque<Character> stack = new ArrayDeque<>();
    Map<Character, Character> pairs = Map.of(')', '(', ']', '[', '}', '{');
    for (char c : s.toCharArray()) {
        if (pairs.containsKey(c)) {
            if (stack.isEmpty() || stack.pop() != pairs.get(c)) return false;
        } else {
            stack.push(c);
        }
    }
    return stack.isEmpty();
}
```

## 6.2 Monotonic Stack
**When to use:** "next greater element," "daily temperatures," "largest rectangle in histogram." The stack maintains elements in increasing or decreasing order; you pop elements when they violate the monotonic property.

```java
// Daily Temperatures: for each day, how many days until a warmer temp?
public int[] dailyTemperatures(int[] temps) {
    int[] answer = new int[temps.length];
    Deque<Integer> stack = new ArrayDeque<>();  // stores INDICES, decreasing temps
    for (int i = 0; i < temps.length; i++) {
        while (!stack.isEmpty() && temps[i] > temps[stack.peek()]) {
            int prevIndex = stack.pop();
            answer[prevIndex] = i - prevIndex;
        }
        stack.push(i);
    }
    return answer;
}
// Time: O(n) — each index pushed/popped at most once, even though there's a nested while loop
```
**Key insight to say out loud:** "Even though there's a while loop inside a for loop, each element is pushed and popped at most once, so total work is O(n), not O(n²)." Interviewers love hearing this because it shows you understand amortized analysis, not just pattern matching.

## 6.3 Queue & BFS setup
```java
Deque<Integer> queue = new ArrayDeque<>();
queue.offer(x);      // enqueue
queue.poll();         // dequeue
```
You'll use this heavily in Part 12 (Graphs) for BFS.

## 6.4 Queue via two stacks (classic interview warm-up)
```java
class MyQueue {
    Deque<Integer> inStack = new ArrayDeque<>();
    Deque<Integer> outStack = new ArrayDeque<>();

    public void push(int x) { inStack.push(x); }

    public int pop() {
        if (outStack.isEmpty()) {
            while (!inStack.isEmpty()) outStack.push(inStack.pop());
        }
        return outStack.pop();
    }
}
// Amortized O(1) per operation
```

---

# PART 7 — Recursion & Backtracking

Recursion is the single biggest conceptual hurdle for beginners. Here's the mental model that actually works:

## The mental model
1. **Trust the recursion.** Assume the function already correctly solves smaller versions of the problem. You only need to figure out how to combine those smaller answers.
2. Every recursive function needs: **(a) a base case** (when to stop) and **(b) a recursive case** that makes progress toward the base case.
3. **Don't trace the whole call stack in your head** for anything beyond depth 3 — trust the pattern instead.

```java
// Factorial — the "hello world" of recursion
public int factorial(int n) {
    if (n <= 1) return 1;              // base case
    return n * factorial(n - 1);       // recursive case, makes progress (n-1)
}
```

## 7.1 Backtracking
**Backtracking = recursion + undo.** You try a choice, recurse, and if it doesn't pan out, you UNDO the choice and try the next one. This is how you generate all subsets, permutations, combinations, and solve constraint problems (N-Queens, Sudoku).

**The universal backtracking template:**
```java
void backtrack(/* state */) {
    if (/* base case: found a valid complete solution */) {
        result.add(new ArrayList<>(currentPath));  // must COPY the path
        return;
    }
    for (/* each choice available */) {
        currentPath.add(choice);       // 1. make the choice
        backtrack(/* updated state */); // 2. recurse
        currentPath.remove(currentPath.size() - 1);  // 3. undo the choice
    }
}
```

```java
// Subsets: generate all possible subsets of a set of distinct integers
public List<List<Integer>> subsets(int[] nums) {
    List<List<Integer>> result = new ArrayList<>();
    backtrack(nums, 0, new ArrayList<>(), result);
    return result;
}

private void backtrack(int[] nums, int start, List<Integer> path, List<List<Integer>> result) {
    result.add(new ArrayList<>(path));           // every path is a valid subset
    for (int i = start; i < nums.length; i++) {
        path.add(nums[i]);
        backtrack(nums, i + 1, path, result);     // move forward, never revisit earlier indices
        path.remove(path.size() - 1);             // undo
    }
}
// Time: O(2^n) — there are 2^n subsets, this is inherent to the problem, not a flaw
```

```java
// Permutations: all orderings of distinct integers
public List<List<Integer>> permute(int[] nums) {
    List<List<Integer>> result = new ArrayList<>();
    backtrack(nums, new ArrayList<>(), new boolean[nums.length], result);
    return result;
}

private void backtrack(int[] nums, List<Integer> path, boolean[] used, List<List<Integer>> result) {
    if (path.size() == nums.length) {
        result.add(new ArrayList<>(path));
        return;
    }
    for (int i = 0; i < nums.length; i++) {
        if (used[i]) continue;
        used[i] = true;
        path.add(nums[i]);
        backtrack(nums, path, used, result);
        path.remove(path.size() - 1);   // undo
        used[i] = false;                 // undo
    }
}
// Time: O(n!)
```

**Handling duplicates (a common follow-up question):** sort the array first, then skip a candidate if it equals the previous candidate AND the previous one hasn't been "used" in this branch — this is the standard dedup trick:
```java
if (i > start && nums[i] == nums[i - 1]) continue;  // skip duplicates at the same recursion depth
```

**Common beginner mistakes:**
- Forgetting to COPY the path when adding to results (`new ArrayList<>(path)`) — otherwise all your results point to the same mutated list and you'll see empty/wrong output at the end.
- Forgetting the "undo" step — this silently corrupts later branches.
- Not identifying the base case clearly, leading to infinite recursion / StackOverflowError.


# PART 8 — Sorting Algorithms

You won't be asked to implement bubble sort from scratch in an L4 interview, but you MUST know:
1. Which sort to reach for and why.
2. How merge sort / quicksort work, because their **techniques** (divide & conquer, partitioning) reappear in other problems.

| Algorithm | Time (avg) | Time (worst) | Space | Stable? | Notes |
|---|---|---|---|---|---|
| Bubble/Selection/Insertion | O(n²) | O(n²) | O(1) | varies | Only mention conceptually; insertion sort is good for nearly-sorted data |
| Merge Sort | O(n log n) | O(n log n) | O(n) | Yes | Predictable, good for linked lists, external sorting |
| Quick Sort | O(n log n) | O(n²) | O(log n) | No | Fast in practice, in-place, worst case with bad pivots |
| Heap Sort | O(n log n) | O(n log n) | O(1) | No | In-place, but poor cache locality |
| Counting/Radix/Bucket Sort | O(n + k) | O(n + k) | O(n + k) | Yes | Only works for integers / bounded ranges — huge speedup when applicable |

```java
// Merge Sort — the divide & conquer template you should be able to write cold
public void mergeSort(int[] arr, int left, int right) {
    if (left >= right) return;                      // base case: 0 or 1 elements
    int mid = left + (right - left) / 2;             // avoids overflow vs (left+right)/2
    mergeSort(arr, left, mid);
    mergeSort(arr, mid + 1, right);
    merge(arr, left, mid, right);
}

private void merge(int[] arr, int left, int mid, int right) {
    int[] temp = new int[right - left + 1];
    int i = left, j = mid + 1, k = 0;
    while (i <= mid && j <= right) {
        temp[k++] = (arr[i] <= arr[j]) ? arr[i++] : arr[j++];
    }
    while (i <= mid) temp[k++] = arr[i++];
    while (j <= right) temp[k++] = arr[j++];
    System.arraycopy(temp, 0, arr, left, temp.length);
}
```

```java
// Quick Sort — Lomuto partition scheme
public void quickSort(int[] arr, int low, int high) {
    if (low >= high) return;
    int pivotIndex = partition(arr, low, high);
    quickSort(arr, low, pivotIndex - 1);
    quickSort(arr, pivotIndex + 1, high);
}

private int partition(int[] arr, int low, int high) {
    int pivot = arr[high];       // choose last element as pivot
    int i = low - 1;             // boundary of "smaller than pivot" region
    for (int j = low; j < high; j++) {
        if (arr[j] < pivot) {
            i++;
            swap(arr, i, j);
        }
    }
    swap(arr, i + 1, high);      // put pivot in its correct place
    return i + 1;
}

private void swap(int[] arr, int i, int j) {
    int temp = arr[i]; arr[i] = arr[j]; arr[j] = temp;
}
```

**In practice, just call `Arrays.sort()`.** For primitives it's a tuned dual-pivot quicksort (O(n log n) avg); for objects it's a stable merge sort (Timsort) variant. Know this so you can answer "what's the complexity of `Arrays.sort()`?" instantly.

**A very common trick: "sort first" simplifies many problems** — merge intervals, meeting rooms, three sum, closest pair — because sorting exposes structure (adjacency, monotonicity) you can exploit with two pointers afterward.

---

# PART 9 — Binary Search

Binary search is not just "search a sorted array" — it's a general technique for **eliminating half the search space** whenever you can answer "is the answer to the left or right of this midpoint?"

## 9.1 The classic template (memorize exactly this)
```java
public int binarySearch(int[] nums, int target) {
    int left = 0, right = nums.length - 1;
    while (left <= right) {
        int mid = left + (right - left) / 2;   // prevents integer overflow
        if (nums[mid] == target) return mid;
        else if (nums[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    return -1;   // not found
}
// Time: O(log n)  Space: O(1)
```

**Gotcha:** always write `left + (right - left) / 2`, not `(left + right) / 2` — the latter can overflow for very large arrays in other languages, and stating this out loud signals experience even though Java ints rarely actually overflow in practice interview sizes.

## 9.2 Binary search on rotated / modified arrays
Ask yourself at each `mid`: "which half is guaranteed sorted?" then check if target lies in that sorted half.

```java
public int searchRotated(int[] nums, int target) {
    int left = 0, right = nums.length - 1;
    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (nums[mid] == target) return mid;
        if (nums[left] <= nums[mid]) {              // left half is sorted
            if (nums[left] <= target && target < nums[mid]) right = mid - 1;
            else left = mid + 1;
        } else {                                      // right half is sorted
            if (nums[mid] < target && target <= nums[right]) left = mid + 1;
            else right = mid - 1;
        }
    }
    return -1;
}
```

## 9.3 Binary search on the ANSWER (very common at medium/hard difficulty)
**When to use:** the problem asks to "minimize the maximum X" or "find the smallest/largest value satisfying a condition," and you can write a `boolean isFeasible(candidate)` check.

```java
// Example pattern: "Find minimum capacity to ship packages within D days"
public int shipWithinDays(int[] weights, int days) {
    int left = Arrays.stream(weights).max().getAsInt();   // min possible capacity
    int right = Arrays.stream(weights).sum();               // max possible capacity
    while (left < right) {
        int mid = left + (right - left) / 2;
        if (canShip(weights, days, mid)) right = mid;   // mid works, try smaller
        else left = mid + 1;                              // mid too small, need bigger
    }
    return left;
}

private boolean canShip(int[] weights, int days, int capacity) {
    int daysNeeded = 1, currentLoad = 0;
    for (int w : weights) {
        if (currentLoad + w > capacity) { daysNeeded++; currentLoad = 0; }
        currentLoad += w;
    }
    return daysNeeded <= days;
}
```
**This pattern is huge at L4.** Any time you see "minimize the maximum" / "maximize the minimum" and the search space is monotonic (if X works, everything larger than X also works), think binary search on the answer.

**Common beginner mistakes:**
- Infinite loops from using `mid` instead of `mid ± 1` when narrowing the range.
- Off-by-one on `<=` vs `<` in the while condition — decide up front whether you're searching `[left, right]` inclusive or `[left, right)` and stay consistent.


# PART 10 — Trees

## Core setup
```java
class TreeNode {
    int val;
    TreeNode left, right;
    TreeNode(int val) { this.val = val; }
}
```

## 10.1 The three DFS traversals
```java
// Preorder: Root -> Left -> Right (good for copying/serializing a tree)
void preorder(TreeNode root, List<Integer> result) {
    if (root == null) return;
    result.add(root.val);
    preorder(root.left, result);
    preorder(root.right, result);
}

// Inorder: Left -> Root -> Right (gives SORTED order for a BST — very important fact)
void inorder(TreeNode root, List<Integer> result) {
    if (root == null) return;
    inorder(root.left, result);
    result.add(root.val);
    inorder(root.right, result);
}

// Postorder: Left -> Right -> Root (good when children must be processed before parent, e.g. deleting a tree, computing subtree sizes)
void postorder(TreeNode root, List<Integer> result) {
    if (root == null) return;
    postorder(root.left, result);
    postorder(root.right, result);
    result.add(root.val);
}
```
**Key fact to remember:** inorder traversal of a BST gives values in **sorted ascending order**. This single fact solves a huge number of "is this a valid BST" / "kth smallest element" style problems.

## 10.2 Level-order traversal (BFS on a tree)
```java
public List<List<Integer>> levelOrder(TreeNode root) {
    List<List<Integer>> result = new ArrayList<>();
    if (root == null) return result;
    Deque<TreeNode> queue = new ArrayDeque<>();
    queue.offer(root);
    while (!queue.isEmpty()) {
        int levelSize = queue.size();          // snapshot the size BEFORE the inner loop
        List<Integer> level = new ArrayList<>();
        for (int i = 0; i < levelSize; i++) {
            TreeNode node = queue.poll();
            level.add(node.val);
            if (node.left != null) queue.offer(node.left);
            if (node.right != null) queue.offer(node.right);
        }
        result.add(level);
    }
    return result;
}
// Time: O(n)  Space: O(n) worst case (last level of a wide tree)
```
**The `levelSize` snapshot trick** is the key insight — it's how you separate levels in a single queue without a second data structure.

## 10.3 Recursive tree patterns (the "combine children's answers" template)
Most tree problems fit this shape:
```java
ReturnType solve(TreeNode node) {
    if (node == null) return /* base case value */;
    ReturnType left = solve(node.left);
    ReturnType right = solve(node.right);
    return /* combine left, right, and node.val somehow */;
}
```

```java
// Max depth
public int maxDepth(TreeNode root) {
    if (root == null) return 0;
    return 1 + Math.max(maxDepth(root.left), maxDepth(root.right));
}

// Diameter of binary tree (longest path between any two nodes)
int diameter = 0;
public int diameterOfBinaryTree(TreeNode root) {
    height(root);
    return diameter;
}
private int height(TreeNode node) {
    if (node == null) return 0;
    int leftHeight = height(node.left);
    int rightHeight = height(node.right);
    diameter = Math.max(diameter, leftHeight + rightHeight);  // update global answer
    return 1 + Math.max(leftHeight, rightHeight);              // return height to parent
}
```
**Pattern to notice:** the answer (`diameter`) and the return value (`height`) are DIFFERENT things. This distinction — "what do I return to my parent" vs "what do I use to update the global best answer" — is the #1 conceptual unlock for tree DP problems.

## 10.4 Binary Search Tree (BST) operations
```java
public TreeNode insertIntoBST(TreeNode root, int val) {
    if (root == null) return new TreeNode(val);
    if (val < root.val) root.left = insertIntoBST(root.left, val);
    else root.right = insertIntoBST(root.right, val);
    return root;
}

public boolean isValidBST(TreeNode root) {
    return validate(root, Long.MIN_VALUE, Long.MAX_VALUE);
}
private boolean validate(TreeNode node, long min, long max) {
    if (node == null) return true;
    if (node.val <= min || node.val >= max) return false;
    return validate(node.left, min, node.val) && validate(node.right, node.val, max);
}
// Common bug: only checking node.left.val < node.val and node.right.val > node.val
// locally — this misses violations from GRANDPARENTS. Must pass bounds down.
```

## 10.5 Lowest Common Ancestor (LCA)
```java
public TreeNode lowestCommonAncestor(TreeNode root, TreeNode p, TreeNode q) {
    if (root == null || root == p || root == q) return root;
    TreeNode left = lowestCommonAncestor(root.left, p, q);
    TreeNode right = lowestCommonAncestor(root.right, p, q);
    if (left != null && right != null) return root;   // p and q found in different subtrees
    return (left != null) ? left : right;               // both in one subtree, or not found
}
```

## 10.6 Balanced trees — what you need to know conceptually
You will almost never implement an AVL tree or Red-Black tree from scratch at L4. But you SHOULD know:
- A **balanced BST** keeps height O(log n) via rotations, guaranteeing O(log n) insert/delete/search.
- Java's `TreeMap`/`TreeSet` are backed by a Red-Black tree — this is why they give O(log n) operations with sorted iteration.
- An unbalanced BST (e.g., inserting sorted data in order) degenerates to a linked list — O(n) operations. If asked "what could go wrong with a BST," this is the answer.

**Common beginner mistakes:**
- Confusing what to `return` vs what to use to update a global/instance variable in tree DP.
- For "valid BST," checking only immediate children instead of passing min/max bounds down the recursion.
- Forgetting the null check at the very top of every tree recursive function — always the first line.

---

# PART 11 — Heaps / Priority Queues

**When to use:** "top K," "kth largest/smallest," "merge K sorted things," "median of a stream," scheduling problems.

```java
PriorityQueue<Integer> minHeap = new PriorityQueue<>();                      // smallest on top
PriorityQueue<Integer> maxHeap = new PriorityQueue<>(Collections.reverseOrder());

// Kth Largest Element — maintain a min-heap of size K
public int findKthLargest(int[] nums, int k) {
    PriorityQueue<Integer> minHeap = new PriorityQueue<>();
    for (int num : nums) {
        minHeap.offer(num);
        if (minHeap.size() > k) minHeap.poll();   // remove smallest, keep K largest
    }
    return minHeap.peek();
}
// Time: O(n log k)  Space: O(k)  — much better than sorting (O(n log n)) when k << n
```

```java
// Top K Frequent Elements — combine HashMap (counting) + heap (top K)
public int[] topKFrequent(int[] nums, int k) {
    Map<Integer, Integer> freq = new HashMap<>();
    for (int num : nums) freq.merge(num, 1, Integer::sum);

    PriorityQueue<int[]> minHeap = new PriorityQueue<>((a, b) -> a[1] - b[1]); // sort by count
    for (Map.Entry<Integer, Integer> entry : freq.entrySet()) {
        minHeap.offer(new int[]{entry.getKey(), entry.getValue()});
        if (minHeap.size() > k) minHeap.poll();
    }
    int[] result = new int[k];
    for (int i = k - 1; i >= 0; i--) result[i] = minHeap.poll()[0];
    return result;
}
```

## Two Heaps pattern (running median)
```java
class MedianFinder {
    PriorityQueue<Integer> small = new PriorityQueue<>(Collections.reverseOrder()); // max-heap, lower half
    PriorityQueue<Integer> large = new PriorityQueue<>();                            // min-heap, upper half

    public void addNum(int num) {
        small.offer(num);
        large.offer(small.poll());                 // balance: move max of "small" into "large"
        if (small.size() < large.size()) small.offer(large.poll());
    }

    public double findMedian() {
        if (small.size() > large.size()) return small.peek();
        return (small.peek() + large.peek()) / 2.0;
    }
}
// addNum: O(log n)  findMedian: O(1)
```

**Complexity reminders:** `offer`/`poll` are O(log n); `peek` is O(1); building a heap from an array all at once (`new PriorityQueue<>(list)`) is O(n), not O(n log n) — a nice fact to mention if relevant.


# PART 12 — Graphs

Graphs are where most beginners plateau — but the toolkit is smaller than it looks. Master representation + BFS + DFS + Union-Find and you cover the majority of graph questions.

## 12.1 Representation
```java
// Adjacency list — the standard representation for interviews (sparse graphs)
Map<Integer, List<Integer>> graph = new HashMap<>();
graph.computeIfAbsent(u, k -> new ArrayList<>()).add(v);
graph.computeIfAbsent(v, k -> new ArrayList<>()).add(u);  // only if undirected

// Or, if nodes are 0..n-1, use an array of lists:
List<List<Integer>> adj = new ArrayList<>();
for (int i = 0; i < n; i++) adj.add(new ArrayList<>());
```

## 12.2 DFS (recursive)
```java
public void dfs(int node, Map<Integer, List<Integer>> graph, Set<Integer> visited) {
    if (visited.contains(node)) return;
    visited.add(node);
    for (int neighbor : graph.getOrDefault(node, new ArrayList<>())) {
        dfs(neighbor, graph, visited);
    }
}
// Time: O(V + E)  Space: O(V) for visited set + recursion stack
```

## 12.3 BFS (iterative, uses a queue) — finds SHORTEST PATH in unweighted graphs
```java
public int bfs(int start, int target, Map<Integer, List<Integer>> graph) {
    Set<Integer> visited = new HashSet<>();
    Deque<Integer> queue = new ArrayDeque<>();
    queue.offer(start);
    visited.add(start);
    int steps = 0;
    while (!queue.isEmpty()) {
        int size = queue.size();
        for (int i = 0; i < size; i++) {
            int node = queue.poll();
            if (node == target) return steps;
            for (int neighbor : graph.getOrDefault(node, new ArrayList<>())) {
                if (!visited.contains(neighbor)) {
                    visited.add(neighbor);
                    queue.offer(neighbor);
                }
            }
        }
        steps++;
    }
    return -1;   // unreachable
}
```
**Critical rule: BFS = shortest path only when all edges have equal weight (or no weight).** For weighted graphs, use Dijkstra instead.

## 12.4 Grid problems (implicit graphs — extremely common)
Grids ARE graphs where each cell is a node connected to its up/down/left/right neighbors.
```java
int[][] directions = {{0,1},{0,-1},{1,0},{-1,0}};

public int numIslands(char[][] grid) {
    int islands = 0;
    boolean[][] visited = new boolean[grid.length][grid[0].length];
    for (int r = 0; r < grid.length; r++) {
        for (int c = 0; c < grid[0].length; c++) {
            if (grid[r][c] == '1' && !visited[r][c]) {
                dfsGrid(grid, r, c, visited);
                islands++;
            }
        }
    }
    return islands;
}

private void dfsGrid(char[][] grid, int r, int c, boolean[][] visited) {
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return;
    if (visited[r][c] || grid[r][c] == '0') return;
    visited[r][c] = true;
    for (int[] dir : directions) {
        dfsGrid(grid, r + dir[0], c + dir[1], visited);
    }
}
```
**Tip:** always define a `directions` array — it makes the 4 (or 8, for diagonals) neighbor checks a clean loop instead of 4 copy-pasted if-blocks.

## 12.5 Topological Sort (ordering with dependencies — "Course Schedule" style problems)
Two ways: DFS-based (postorder, then reverse) or **Kahn's algorithm** (BFS-based, using in-degrees) — Kahn's is usually easier to explain and also detects cycles naturally.

```java
public int[] topologicalSort(int numNodes, int[][] edges) {
    List<List<Integer>> graph = new ArrayList<>();
    int[] inDegree = new int[numNodes];
    for (int i = 0; i < numNodes; i++) graph.add(new ArrayList<>());
    for (int[] edge : edges) {                    // edge = [from, to]
        graph.get(edge[0]).add(edge[1]);
        inDegree[edge[1]]++;
    }

    Deque<Integer> queue = new ArrayDeque<>();
    for (int i = 0; i < numNodes; i++) {
        if (inDegree[i] == 0) queue.offer(i);       // start with nodes that have no prerequisites
    }

    int[] order = new int[numNodes];
    int index = 0;
    while (!queue.isEmpty()) {
        int node = queue.poll();
        order[index++] = node;
        for (int neighbor : graph.get(node)) {
            inDegree[neighbor]--;
            if (inDegree[neighbor] == 0) queue.offer(neighbor);
        }
    }
    return (index == numNodes) ? order : new int[0];  // empty array = cycle detected, no valid order
}
// Time: O(V + E)
```
**Key insight:** if you process fewer than `numNodes` nodes, there's a cycle (a cyclic dependency can never be topologically sorted) — this is the standard way to detect cycles in a directed graph too.

## 12.6 Union-Find (Disjoint Set Union) — for connectivity problems
**When to use:** "are these two nodes connected," "count connected components," "will adding this edge create a cycle" (Kruskal's MST uses exactly this).

```java
class UnionFind {
    int[] parent, rank;

    UnionFind(int n) {
        parent = new int[n];
        rank = new int[n];
        for (int i = 0; i < n; i++) parent[i] = i;  // each node is its own root initially
    }

    int find(int x) {
        if (parent[x] != x) {
            parent[x] = find(parent[x]);   // path compression — flattens the tree
        }
        return parent[x];
    }

    boolean union(int x, int y) {
        int rootX = find(x), rootY = find(y);
        if (rootX == rootY) return false;   // already connected — this edge would create a cycle
        // union by rank — attach smaller tree under larger tree, keeps trees shallow
        if (rank[rootX] < rank[rootY]) { int temp = rootX; rootX = rootY; rootY = temp; }
        parent[rootY] = rootX;
        if (rank[rootX] == rank[rootY]) rank[rootX]++;
        return true;
    }
}
// With both path compression + union by rank: nearly O(1) amortized per operation (technically O(α(n)), inverse Ackermann — effectively constant)
```
This is one of the highest-leverage things to memorize — it's short, shows up constantly, and the "nearly O(1)" complexity fact impresses interviewers when stated correctly.

## 12.7 Dijkstra's Algorithm — shortest path in a WEIGHTED graph (non-negative weights)
```java
public int[] dijkstra(int n, List<int[]>[] graph, int src) {
    // graph[u] contains int[]{v, weight} for each edge u -> v
    int[] dist = new int[n];
    Arrays.fill(dist, Integer.MAX_VALUE);
    dist[src] = 0;
    PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> a[1] - b[1]);  // {node, distance}
    pq.offer(new int[]{src, 0});

    while (!pq.isEmpty()) {
        int[] curr = pq.poll();
        int node = curr[0], d = curr[1];
        if (d > dist[node]) continue;   // stale entry, skip (we found a better path already)
        for (int[] edge : graph[node]) {
            int next = edge[0], weight = edge[1];
            if (dist[node] + weight < dist[next]) {
                dist[next] = dist[node] + weight;
                pq.offer(new int[]{next, dist[next]});
            }
        }
    }
    return dist;
}
// Time: O((V + E) log V) with a binary heap
```
**Note:** Dijkstra does NOT work with negative edge weights (Bellman-Ford handles those, O(VE), rarely needed at L4 but good to mention if asked "what if weights can be negative?").

## 12.8 Minimum Spanning Tree — Kruskal's (uses Union-Find directly)
```java
public int minCostToConnectAllPoints(int[][] edges, int n) {
    // edges = {u, v, weight}, sorted by weight ascending
    Arrays.sort(edges, (a, b) -> a[2] - b[2]);
    UnionFind uf = new UnionFind(n);
    int totalCost = 0, edgesUsed = 0;
    for (int[] edge : edges) {
        if (uf.union(edge[0], edge[1])) {   // only add edge if it connects two different components
            totalCost += edge[2];
            edgesUsed++;
            if (edgesUsed == n - 1) break;   // MST always has exactly n-1 edges
        }
    }
    return totalCost;
}
// Time: O(E log E) for sorting, plus near-O(E) for union-find operations
```

**Common beginner mistakes in graphs:**
- Forgetting to mark nodes visited BEFORE adding to the BFS queue (adding without marking causes duplicate processing / infinite loops in cyclic graphs).
- Using DFS for shortest path in an unweighted graph — only BFS guarantees shortest path there.
- Forgetting path compression / union by rank in Union-Find, degrading it to O(n) per operation.
- Not handling disconnected graphs — always loop over ALL nodes to catch every component, not just node 0.


# PART 13 — Tries (Prefix Trees)

**When to use:** anything involving prefixes of strings — autocomplete, spell-checkers, "word search II," longest common prefix among many words.

```java
class TrieNode {
    TrieNode[] children = new TrieNode[26];   // for lowercase a-z; use a HashMap for wider alphabets
    boolean isEndOfWord = false;
}

class Trie {
    TrieNode root = new TrieNode();

    public void insert(String word) {
        TrieNode node = root;
        for (char c : word.toCharArray()) {
            int idx = c - 'a';
            if (node.children[idx] == null) node.children[idx] = new TrieNode();
            node = node.children[idx];
        }
        node.isEndOfWord = true;
    }

    public boolean search(String word) {
        TrieNode node = findNode(word);
        return node != null && node.isEndOfWord;
    }

    public boolean startsWith(String prefix) {
        return findNode(prefix) != null;
    }

    private TrieNode findNode(String s) {
        TrieNode node = root;
        for (char c : s.toCharArray()) {
            int idx = c - 'a';
            if (node.children[idx] == null) return null;
            node = node.children[idx];
        }
        return node;
    }
}
// insert/search/startsWith: O(L) where L = length of word — independent of how many words are stored!
```
**Why a Trie beats a HashSet for prefix problems:** checking "does any word start with 'ab'" in a HashSet of words is O(n·L) (scan every word). In a Trie it's O(L) — you just walk 2 nodes down. This complexity difference is exactly what interviewers want to hear you articulate.

---

# PART 14 — Dynamic Programming

This is the topic beginners fear most, but it's really just **"recursion + don't redo work you've already done."** Every DP problem follows the same discovery process.

## 14.1 The 5-step process (use this EVERY time)
1. **Define the state.** What does `dp[i]` (or `dp[i][j]`) represent, in plain English? e.g., "the minimum cost to reach position i."
2. **Write the recurrence.** How does `dp[i]` relate to smaller subproblems? e.g., `dp[i] = min(dp[i-1], dp[i-2]) + cost[i]`.
3. **Identify the base case(s).** The smallest subproblems you can answer directly.
4. **Decide the order of computation.** Usually smallest to largest (bottom-up), OR write it top-down with memoization first (often easier to derive), then convert if needed.
5. **Identify the final answer.** Often `dp[n]`, but sometimes `max(dp[])` or similar.

## 14.2 Top-down (memoization) vs Bottom-up (tabulation)
```java
// TOP-DOWN: Fibonacci with memoization — write the natural recursion, cache results
Map<Integer, Integer> memo = new HashMap<>();
public int fib(int n) {
    if (n <= 1) return n;
    if (memo.containsKey(n)) return memo.get(n);
    int result = fib(n - 1) + fib(n - 2);
    memo.put(n, result);
    return result;
}
// Time: O(n) instead of O(2^n) — memoization is the entire trick

// BOTTOM-UP: same problem, iterative
public int fibBottomUp(int n) {
    if (n <= 1) return n;
    int[] dp = new int[n + 1];
    dp[0] = 0; dp[1] = 1;
    for (int i = 2; i <= n; i++) dp[i] = dp[i - 1] + dp[i - 2];
    return dp[n];
}
```
**Recommendation for interviews:** derive top-down first (it mirrors how you naturally think through the recursion), get it accepted, THEN offer to convert to bottom-up if asked about further optimizing space. Top-down is usually faster to arrive at correctly under time pressure.

## 14.3 1D DP examples

```java
// Climbing Stairs (1 or 2 steps at a time — how many distinct ways to reach the top?)
public int climbStairs(int n) {
    if (n <= 2) return n;
    int prev2 = 1, prev1 = 2;
    for (int i = 3; i <= n; i++) {
        int curr = prev1 + prev2;
        prev2 = prev1;
        prev1 = curr;
    }
    return prev1;
}
// This is literally Fibonacci in disguise — recognizing this pattern is a huge time-saver

// House Robber (can't rob two adjacent houses, maximize total)
public int rob(int[] nums) {
    int prev2 = 0, prev1 = 0;
    for (int num : nums) {
        int curr = Math.max(prev1, prev2 + num);   // skip this house, or rob it (+ best from 2 back)
        prev2 = prev1;
        prev1 = curr;
    }
    return prev1;
}
```
**Space optimization trick:** if `dp[i]` only depends on `dp[i-1]` and `dp[i-2]`, you don't need a whole array — just track the last two values (`prev1`, `prev2`). This turns O(n) space into O(1). Mention this even if you don't implement it — it shows depth.

## 14.4 2D DP — Grid problems
```java
// Unique Paths: robot moves only right/down in an m x n grid, count paths from top-left to bottom-right
public int uniquePaths(int m, int n) {
    int[][] dp = new int[m][n];
    for (int i = 0; i < m; i++) dp[i][0] = 1;   // only 1 way to reach any cell in first column (all downs)
    for (int j = 0; j < n; j++) dp[0][j] = 1;   // only 1 way to reach any cell in first row (all rights)
    for (int i = 1; i < m; i++) {
        for (int j = 1; j < n; j++) {
            dp[i][j] = dp[i - 1][j] + dp[i][j - 1];   // came from above OR from the left
        }
    }
    return dp[m - 1][n - 1];
}
```

## 14.5 The Knapsack family (huge category — most "combination/selection" DP maps to this)
```java
// 0/1 Knapsack: each item used at most once, maximize value within weight capacity
public int knapsack(int[] weights, int[] values, int capacity) {
    int n = weights.length;
    int[][] dp = new int[n + 1][capacity + 1];
    for (int i = 1; i <= n; i++) {
        for (int w = 0; w <= capacity; w++) {
            dp[i][w] = dp[i - 1][w];                          // don't take item i-1
            if (weights[i - 1] <= w) {
                dp[i][w] = Math.max(dp[i][w],
                    dp[i - 1][w - weights[i - 1]] + values[i - 1]); // take item i-1
            }
        }
    }
    return dp[n][capacity];
}
// Time: O(n * capacity)  Space: O(n * capacity), can be optimized to O(capacity) with a 1D array
```
**Recognizing knapsack in disguise:** "Partition Equal Subset Sum," "Target Sum," "Coin Change" (unbounded variant — items can repeat) are ALL knapsack variants. If you see "subset that sums to X" or "select items under a constraint to maximize/count something," think knapsack immediately.

```java
// Coin Change (unbounded knapsack — coins can be reused): min coins to make amount
public int coinChange(int[] coins, int amount) {
    int[] dp = new int[amount + 1];
    Arrays.fill(dp, amount + 1);   // "infinity" sentinel
    dp[0] = 0;
    for (int i = 1; i <= amount; i++) {
        for (int coin : coins) {
            if (coin <= i) {
                dp[i] = Math.min(dp[i], dp[i - coin] + 1);
            }
        }
    }
    return dp[amount] > amount ? -1 : dp[amount];
}
```

## 14.6 Longest Increasing Subsequence (LIS) — classic O(n²) → O(n log n) upgrade
```java
// O(n^2) DP version — always derive this first, it's easier to explain
public int lengthOfLIS(int[] nums) {
    int[] dp = new int[nums.length];
    Arrays.fill(dp, 1);   // every element is an LIS of length 1 by itself
    int maxLen = 1;
    for (int i = 1; i < nums.length; i++) {
        for (int j = 0; j < i; j++) {
            if (nums[j] < nums[i]) {
                dp[i] = Math.max(dp[i], dp[j] + 1);
            }
        }
        maxLen = Math.max(maxLen, dp[i]);
    }
    return maxLen;
}
// O(n log n) version — maintain a "tails" array + binary search (mention if asked to optimize)
public int lengthOfLISOptimized(int[] nums) {
    List<Integer> tails = new ArrayList<>();
    for (int num : nums) {
        int idx = Collections.binarySearch(tails, num);
        if (idx < 0) idx = -(idx + 1);           // insertion point
        if (idx == tails.size()) tails.add(num);
        else tails.set(idx, num);
    }
    return tails.size();
}
```

## 14.7 Longest Common Subsequence (LCS) — the template for ALL two-string DP problems
```java
public int longestCommonSubsequence(String text1, String text2) {
    int m = text1.length(), n = text2.length();
    int[][] dp = new int[m + 1][n + 1];
    for (int i = 1; i <= m; i++) {
        for (int j = 1; j <= n; j++) {
            if (text1.charAt(i - 1) == text2.charAt(j - 1)) {
                dp[i][j] = dp[i - 1][j - 1] + 1;             // chars match, extend diagonal
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);  // skip one char from either string
            }
        }
    }
    return dp[m][n];
}
```
**This exact grid pattern (with small tweaks) also solves:** Edit Distance, Longest Common Substring, Shortest Common Supersequence — learn this one grid deeply rather than memorizing five "different" problems.

## 14.8 Interval DP (harder, occasionally shows up)
**When to use:** problems about merging/splitting a sequence into intervals, e.g. "Burst Balloons," "Matrix Chain Multiplication."
```java
// Template shape — dp[i][j] represents the best answer for the interval [i, j]
// for (length = 2 to n)
//   for (i = 0; i + length - 1 < n; i++)
//     j = i + length - 1
//     for (k = i to j-1)   // try every split point k
//       dp[i][j] = best(dp[i][j], dp[i][k] + dp[k+1][j] + cost(i, k, j))
```
This is a good one to *recognize by name* rather than have fully memorized — it's rarer at L4, but knowing it exists (and that it iterates by increasing interval length) shows breadth.

**Common beginner mistakes in DP:**
- Trying to jump straight to bottom-up without first getting the recurrence right via top-down/recursion.
- Off-by-one errors with 1-indexed `dp` arrays representing 0-indexed input (the `dp[i-1]` pattern in LCS/knapsack above is intentional — it avoids negative-index checks).
- Forgetting base cases for empty input (`dp[0][...]` and `dp[...][0]` rows/columns).
- Not stating the state definition out loud — interviewers can't follow your DP if you don't say what `dp[i]` *means* before writing code.


# PART 15 — Greedy Algorithms

**When to use:** the problem can be solved by making the locally optimal choice at each step, and that choice never needs to be undone. The hard part isn't the code — it's **proving greedy is even valid**, which is often the actual interview discussion.

**How to sanity-check if greedy will work:** try to think of a counter-example. If you can't find one after genuinely trying, and the problem has an "exchange argument" flavor (swapping any two choices can't improve the answer), greedy is likely correct. If you're not sure, mention this uncertainty out loud and consider whether DP is safer.

```java
// Merge Intervals — sort by start time, then greedily merge overlapping ones
public int[][] merge(int[][] intervals) {
    Arrays.sort(intervals, (a, b) -> a[0] - b[0]);
    List<int[]> result = new ArrayList<>();
    for (int[] interval : intervals) {
        if (result.isEmpty() || result.get(result.size() - 1)[1] < interval[0]) {
            result.add(interval);                                  // no overlap, add as new interval
        } else {
            result.get(result.size() - 1)[1] =
                Math.max(result.get(result.size() - 1)[1], interval[1]);  // overlap, extend the end
        }
    }
    return result.toArray(new int[result.size()][]);
}
// Time: O(n log n) — dominated by the sort
```

```java
// Jump Game — can you reach the last index?
public boolean canJump(int[] nums) {
    int maxReach = 0;
    for (int i = 0; i < nums.length; i++) {
        if (i > maxReach) return false;             // this index is unreachable
        maxReach = Math.max(maxReach, i + nums[i]);  // greedily track farthest reachable index
    }
    return true;
}
```

```java
// Activity Selection / Non-overlapping Intervals — sort by END time (classic greedy proof example)
public int eraseOverlapIntervals(int[][] intervals) {
    if (intervals.length == 0) return 0;
    Arrays.sort(intervals, (a, b) -> a[1] - b[1]);    // sort by END, not start — this is the key insight
    int count = 0, prevEnd = intervals[0][1];
    for (int i = 1; i < intervals.length; i++) {
        if (intervals[i][0] < prevEnd) {
            count++;    // overlap — remove this interval
        } else {
            prevEnd = intervals[i][1];   // keep this interval, update the boundary
        }
    }
    return count;
}
```
**Greedy vs DP — the real distinction to articulate in an interview:** Greedy makes ONE choice per step and never reconsiders it. DP considers multiple choices and keeps the best. If you can't prove a locally optimal choice never hurts you globally, default to DP — it's always correct if the recurrence is right, just possibly slower.

---

# PART 16 — Bit Manipulation

Rare as a whole-problem topic at L4, but bit tricks show up as O(1)-space optimizations and occasionally as standalone questions.

```java
// Core operators
a & b     // AND
a | b     // OR
a ^ b     // XOR
~a        // NOT
a << 1    // left shift (multiply by 2)
a >> 1    // right shift (divide by 2)
a >>> 1   // unsigned right shift (fills with 0, ignores sign)

// Check if bit i is set
boolean isSet = (n & (1 << i)) != 0;

// Set bit i
n = n | (1 << i);

// Clear bit i
n = n & ~(1 << i);

// Toggle bit i
n = n ^ (1 << i);

// Check if a number is a power of 2 — classic interview one-liner
boolean isPowerOfTwo = n > 0 && (n & (n - 1)) == 0;
// why it works: a power of 2 has exactly one bit set; n-1 flips that bit and all bits below it,
// so ANDing them together gives 0 only for powers of 2.

// Count set bits (Brian Kernighan's algorithm)
public int countSetBits(int n) {
    int count = 0;
    while (n != 0) {
        n = n & (n - 1);   // clears the lowest set bit each iteration
        count++;
    }
    return count;
}
// Time: O(number of set bits), better than O(32) naive loop

// XOR trick: find the single number that appears once while all others appear twice
public int singleNumber(int[] nums) {
    int result = 0;
    for (int num : nums) result ^= num;   // a ^ a = 0, and 0 ^ b = b — pairs cancel out
    return result;
}
```
**Why XOR tricks impress interviewers:** they demonstrate you can find an O(n) time, O(1) space solution to a problem that looks like it needs a HashSet (O(n) space). Worth having 2-3 of these memorized (single number, missing number via XOR of range) as "wow" answers to follow-up "can you do this in O(1) space?" questions.

---

# PART 17 — Advanced / Rare-but-Useful Topics

You are unlikely to need to implement these from scratch at L4, but recognizing *when* they're relevant (even if you need a hint to code them) separates strong candidates from average ones.

## 17.1 Segment Tree — range queries + range updates in O(log n)
**When to use:** "range sum/min/max query" with updates in between queries — a prefix sum array is O(1) query but O(n) update; a segment tree gives O(log n) for both.
```java
// Conceptual skeleton — build a binary tree over the array, each node stores
// an aggregate (sum/min/max) of its range. Query and update walk O(log n) nodes.
class SegmentTree {
    int[] tree;
    int n;

    SegmentTree(int[] nums) {
        n = nums.length;
        tree = new int[4 * n];   // 4n is a safe upper bound for array-based segment tree storage
        build(nums, 1, 0, n - 1);
    }

    void build(int[] nums, int node, int start, int end) {
        if (start == end) { tree[node] = nums[start]; return; }
        int mid = (start + end) / 2;
        build(nums, 2 * node, start, mid);
        build(nums, 2 * node + 1, mid + 1, end);
        tree[node] = tree[2 * node] + tree[2 * node + 1];   // sum aggregate example
    }

    int query(int node, int start, int end, int l, int r) {
        if (r < start || end < l) return 0;                  // no overlap
        if (l <= start && end <= r) return tree[node];        // full overlap
        int mid = (start + end) / 2;
        return query(2 * node, start, mid, l, r) + query(2 * node + 1, mid + 1, end, l, r);
    }
}
```
**What to say if this comes up and you're unsure of exact implementation:** "This needs range updates and range queries repeatedly, which suggests a segment tree or Fenwick tree for O(log n) per operation instead of O(n) — let me think through the structure." Naming it correctly matters more than flawless implementation from memory.

## 17.2 Fenwick Tree / Binary Indexed Tree (BIT) — simpler alternative for range SUM queries
```java
class FenwickTree {
    int[] tree;
    int n;

    FenwickTree(int n) { this.n = n; tree = new int[n + 1]; }

    void update(int i, int delta) {
        for (; i <= n; i += i & (-i)) tree[i] += delta;   // i & (-i) isolates the lowest set bit
    }

    int query(int i) {   // prefix sum [1, i]
        int sum = 0;
        for (; i > 0; i -= i & (-i)) sum += tree[i];
        return sum;
    }

    int rangeQuery(int l, int r) { return query(r) - query(l - 1); }
}
// update and query are both O(log n); much shorter code than a full segment tree
```

## 17.3 String matching — KMP (Knuth-Morris-Pratt)
**When it's relevant:** "find all occurrences of pattern in text" faster than the naive O(n*m). Java's `String.indexOf` is fine for interviews unless explicitly asked to implement matching yourself or discuss the complexity.
- Naive substring search: O(n*m).
- KMP: O(n + m) using a precomputed "failure function" (longest proper prefix that's also a suffix) to avoid re-checking characters.
- **You're unlikely to need to write KMP from scratch at L4** — knowing it exists and why it's O(n+m) (it never backtracks the text pointer) is usually sufficient.

## 17.4 When you'll actually need Part 17
Interviewers at L4 rarely require these outright, but they DO reward you for recognizing "this smells like a segment tree problem" even if you then say "I don't have the exact implementation memorized, can I sketch the idea and pseudocode instead?" That's a completely acceptable, honest, and well-received answer.


# PART 18 — The 15 Patterns Cheat-Sheet

Once you've learned the data structures above, interview prep becomes about **pattern recognition** — most Medium problems are a known pattern wearing a costume. Use this table to triage a new problem in the first 30 seconds.

| # | Pattern | Recognize by these phrases | Go to |
|---|---|---|---|
| 1 | Sliding Window | "contiguous subarray/substring", "longest/shortest/max sum with condition" | Part 3.2 |
| 2 | Two Pointers | "sorted array", "pair/triplet that sums to X", "palindrome" | Part 3.1 |
| 3 | Fast & Slow Pointers | "cycle", "middle of list", "happy number" | Part 5.2 |
| 4 | Merge Intervals | "overlapping", "schedule", "meetings/intervals" | Part 15 |
| 5 | Cyclic Sort | "array contains numbers 1..n", "find missing/duplicate number" | (place each num at index num-1, then scan for mismatches) |
| 6 | In-place LinkedList Reversal | "reverse a linked list", "reverse in groups of k" | Part 5.3 |
| 7 | Tree BFS | "level order", "minimum depth", "connect siblings" | Part 10.2 |
| 8 | Tree DFS | "root to leaf paths", "path sum", "diameter" | Part 10.3 |
| 9 | Two Heaps | "median of a stream", "schedule with two constraints" | Part 11 |
| 10 | Subsets/Backtracking | "all combinations/permutations/subsets", "generate all valid..." | Part 7.1 |
| 11 | Modified Binary Search | "sorted/rotated array", "find minimum X such that...", "search space" | Part 9 |
| 12 | Top K Elements | "K largest/smallest/frequent/closest" | Part 11 |
| 13 | K-way Merge | "merge K sorted lists/arrays" | (use a min-heap of size K, Part 11) |
| 14 | Topological Sort | "prerequisites", "dependencies", "build order", "course schedule" | Part 12.5 |
| 15 | Union-Find | "connected components", "will this edge create a cycle", "redundant connection" | Part 12.6 |

**Bonus patterns that don't fit neatly above:**
- **"Minimize the maximum" / "maximize the minimum"** → Binary search on the answer (Part 9.3).
- **"Count ways to..." / "minimum cost to..." with choices at each step** → Dynamic Programming (Part 14).
- **"Can you do it in O(1) extra space?"** → think bit manipulation (XOR tricks) or in-place array marking (negate values as visited-markers).

**How to use this table in a real interview:** in the first minute, silently ask "what does this problem's phrasing remind me of?" State your hypothesis out loud ("this looks like a sliding window problem because we want the longest substring satisfying a condition") — even if you're wrong, it shows structured thinking, and your interviewer will often nudge you if you're off track.

---

# PART 19 — 10-Week Study Plan (Beginner → L4-Ready)

Assumes ~10-12 hours/week. Adjust the pace to your actual timeline — the ORDER matters more than the exact week numbers, because later topics build on earlier ones.

| Week | Focus | Goal |
|---|---|---|
| 1 | Big-O (Part 1), Java syntax (Part 2), Arrays/Strings (Part 3) | Comfortable with two pointers & sliding window; can code without syntax hesitation |
| 2 | Hashing (Part 4), Linked Lists (Part 5) | Solve Two Sum variants instantly; reverse/merge lists without hints |
| 3 | Stacks/Queues (Part 6), Recursion basics (Part 7.0) | Comfortable with monotonic stack; recursion "trust the base case" mental model solid |
| 4 | Backtracking (Part 7.1), Sorting (Part 8) | Can write subsets/permutations template from memory |
| 5 | Binary Search (Part 9), Trees intro + traversals (Part 10.1-10.3) | Binary search template automatic; comfortable with recursive tree "combine children" pattern |
| 6 | Trees deep dive (Part 10.4-10.6), Heaps (Part 11) | BST validation, LCA, top-K problems solved independently |
| 7 | Graphs part 1: BFS/DFS/grids (Part 12.1-12.4) | Number of islands, shortest path in maze solved without hints |
| 8 | Graphs part 2: Topo sort, Union-Find, Dijkstra (Part 12.5-12.8), Tries (Part 13) | Course schedule, redundant connection, word search solved |
| 9 | Dynamic Programming (Part 14) — the biggest single investment | 1D DP automatic; 2D DP (knapsack/LCS) solvable with the 5-step process |
| 10 | Greedy (Part 15), Bit manipulation (Part 16), mixed timed mock interviews | Full 45-min mocks, mixing patterns without being told the category |

**After week 10:** keep doing 3-5 timed mixed-topic problems per week (not sorted by tag — mixed, like the real interview) until your interviews. This is more valuable than learning new topics at this point — pattern recognition under time pressure is the actual skill being tested.

**Suggested problem volume:** roughly 150-200 problems total is a reasonable bar for L4 readiness, weighted toward Medium difficulty (a strong majority), some Easy early on for confidence/speed, and a handful of Hard once you're comfortable, mainly in DP and Graphs.

---

# PART 20 — Interview-Day Framework & Communication Script

Use this structure in EVERY mock and real interview until it's automatic. This is worth as much as knowing the algorithms — Google explicitly grades communication as its own pillar.

## The framework: Clarify → Plan → Code → Test

**1. Clarify (1-2 minutes)**
- Restate the problem in your own words.
- Ask about edge cases: empty input? duplicates? negative numbers? can the array be unsorted? what's the expected size of n (affects what complexity is acceptable)?
- Confirm the output format.

*Script: "So to confirm, I need to return the indices of the two numbers that add up to target, and I can assume exactly one solution exists — is that right? Can the array contain duplicates?"*

**2. Plan (3-5 minutes) — do this OUT LOUD before writing code**
- State a brute force first, even if obviously suboptimal — it proves you understand the problem and gives you a fallback.
- State its complexity.
- Identify the bottleneck, then propose the optimization (which pattern from Part 18 applies?).
- Get a nod from the interviewer before coding — this is your checkpoint to avoid coding the wrong thing for 20 minutes.

*Script: "Brute force would be checking every pair, O(n²). But since we need O(1) lookups for 'have I seen the complement,' I can use a HashMap and do this in one pass, O(n) time, O(n) space."*

**3. Code (15-20 minutes)**
- Talk while you type, but don't narrate every keystroke — explain decisions ("I'm using a dummy node here to avoid null-checking the head").
- Write clean variable names even under pressure (`left`/`right`, not `l`/`r` if it saves confusion — though single letters are fine once declared clearly).
- If you get stuck, say so out loud and think through it rather than going silent — silence is worse than "thinking out loud while stuck."

**4. Test (5 minutes, always do this even if not asked)**
- Trace through a small example by hand, line by line.
- Explicitly check edge cases you identified in step 1 (empty input, single element, all duplicates).
- If you find a bug, that's GOOD — fixing your own bug in front of the interviewer is a strong signal, not a weak one. Panicking about it is the actual mistake.

## What to say when you're stuck
- "Let me think about a simpler version of this problem first." (Reduce to a smaller case.)
- "Let me re-examine my brute force — is there redundant work I'm repeating?" (This often leads directly to memoization/DP.)
- It's fine to ask for a hint. Candidates who ask a good, specific question ("am I on the right track thinking this needs a heap?") do better than candidates who stay silently stuck for 5 minutes.

---

# PART 21 — Common Mistakes That Cost People L4 Offers

1. **Jumping straight to code without stating a plan.** Even a correct final solution scores lower if the interviewer couldn't follow your reasoning getting there.
2. **Not stating time/space complexity unprompted.** Always say it after finishing a solution, without being asked.
3. **Silence when stuck.** Think out loud, even half-formed thoughts — it's the only way the interviewer can help or evaluate your process.
4. **Skipping the test/trace step because you're confident.** Confidence isn't the same as correctness; tracing catches real bugs and demonstrates rigor either way.
5. **Memorizing solutions instead of patterns.** Interviewers can tell when you've seen the exact problem before vs. when you're actually deriving it — and they'll often modify the problem slightly to check.
6. **Over-optimizing prematurely.** Get a correct brute force stated (even if not fully coded) before chasing the optimal solution — a correct O(n²) beats a broken attempt at O(n log n).
7. **Weak Java fundamentals slowing you down.** Fumbling `HashMap` syntax or forgetting `Collections.reverseOrder()` burns minutes you don't have. This is exactly why Part 2 exists — drill it until automatic.
8. **Not asking clarifying questions.** Google wants to see how you handle ambiguity, which is a big part of the actual job — silently assuming things is a missed signal, not neutral.
9. **Poor variable naming and messy structure under pressure.** Code quality is graded, not just correctness — take the extra 10 seconds for a clear name.
10. **Neglecting the behavioral/Googleyness round.** This is a full pass/fail round, not a formality — prepare STAR-format stories (Situation, Task, Action, Result) about conflict resolution, ambiguity, leadership, and failure just as seriously as the coding prep.

---

## Where to go from here

This guide covers the full breadth of what L4 interviews test. Two honest next steps:
1. **Practice > reading.** Re-reading this won't build pattern recognition — solving timed problems will. Treat Part 18 and Part 19 as your map, and this document as the reference you come back to when stuck, not the thing you study in isolation.
2. **Go deep on any part.** If you want, I can turn any single Part above into a much longer deep-dive with 10-15 practice problems each, walk through mock interviews problem-by-problem, or quiz you Socratically on a topic instead of just explaining it — just tell me which.