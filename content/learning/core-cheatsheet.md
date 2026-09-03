# DSA Deep-Dive: Parts 1-11 (Foundations & Core Data Structures)

> **Companion to your main guide.** This document goes much deeper into Parts 1-11 of *The Complete DSA Guide for Google L4* — more internals, more variants, more "why does this actually work," and 5 practice problems per topic with full solutions. Read a Part here only after you've gone through the same Part in the main guide once; this is the second pass, not the first.

**How to use this:** for each topic, work the practice problems yourself BEFORE reading the given solution — even a failed attempt for 10 minutes builds more pattern recognition than reading a solution cold. Cover the code with your hand/scroll if you have to.

---

# PART 1 DEEP-DIVE — Big-O, Formally

## 1.1 The three notations (know the difference, use O casually)
- **Big-O (O)** — upper bound. "This algorithm takes *at most* this long."
- **Big-Omega (Ω)** — lower bound. "This algorithm takes *at least* this long."
- **Big-Theta (Θ)** — tight bound, when upper and lower bound match. This is what you usually *mean* when you casually say "O(n)" in conversation.

In interviews you'll say "O(n)" 95% of the time and that's fine — but if asked directly "what's the best case of quicksort vs the worst case," that's really asking you to distinguish Ω(n log n) from O(n²), so know the vocabulary exists.

## 1.2 Analyzing more complex code — worked examples

**Sequential (not nested) loops add, they don't multiply:**
```java
for (int i = 0; i < n; i++) { ... }   // O(n)
for (int j = 0; j < m; j++) { ... }   // O(m)
// Total: O(n + m) -- NOT O(n * m). This trips up beginners constantly.
```

**A shrinking nested loop is still quadratic:**
```java
for (int i = 0; i < n; i++) {
    for (int j = i; j < n; j++) { ... }
}
// Total iterations: n + (n-1) + ... + 1 = n(n+1)/2 = O(n^2)
// Dropping the "shrinks over time" detail is correct -- lower-order terms and constants vanish in Big-O.
```

**A multiplicative step gives logarithmic time:**
```java
for (int i = 1; i < n; i *= 2) { ... }   // O(log n) -- i doubles each iteration
```

**Recursion — draw the tree, don't just guess:**
```java
int fib(int n) {
    if (n <= 1) return n;
    return fib(n - 1) + fib(n - 2);
}
// Branches into 2 calls each time, depth n -> the recursion tree has roughly 2^n nodes -> O(2^n)
```

## 1.3 Amortized Analysis — the idea beginners skip over

**Concrete example: why is `ArrayList.add()` "amortized O(1)"?**
When a Java `ArrayList` fills up, it allocates a NEW backing array (double the size) and copies every element over — that single operation is O(n). But it only happens occasionally (after n, then after another n/2, then n/4...). Summed across n total insertions, the total copying work is `n + n/2 + n/4 + ... ≈ 2n`. Spread that 2n total cost evenly across n insertions, and each insertion "costs" O(1) on average — even though a few individual insertions are secretly O(n).

**The general rule:** if an expensive operation (cost O(n)) happens only once every O(n) cheap operations, the amortized cost per operation is O(1). This exact reasoning also applies to Java's `HashMap` resizing (Part 4) and to a monotonic stack (Part 6) where each element is pushed/popped at most once total, even inside a nested loop.

## 1.4 Master Theorem — quick intuition for recursive complexity
For `T(n) = a·T(n/b) + O(n^d)`, compare `a` to `b^d`:
- `a < b^d` → **O(n^d)** (work dominated by the combine step, e.g., the merge in merge sort... wait, actually merge sort is the equal case, see below)
- `a == b^d` → **O(n^d · log n)** (equal work at every level, and there are log n levels)
- `a > b^d` → **O(n^(log_b a))** (work dominated by the sheer number of leaf calls)

**Sanity check with merge sort:** `T(n) = 2T(n/2) + O(n)` → a=2, b=2, d=1 → `b^d = 2 = a` → case 2 → `O(n log n)`. ✓ matches what we already know.

**Sanity check with binary search:** `T(n) = T(n/2) + O(1)` → a=1, b=2, d=0 → `b^d = 1 = a` → case 2 → `O(log n)`. ✓

You won't often need to invoke this by name in an interview, but it's a fast sanity check when you derive a new recursive algorithm and want to double-check your complexity claim.

## 1.5 Complexity traps that silently ruin an "optimal" solution
- **String concatenation in a loop** (`result += x`) — each `+=` allocates a new String (Strings are immutable in Java), turning an intended O(n) loop into O(n²). Use `StringBuilder`.
- **`.contains()` on an `ArrayList` inside a loop** — O(n) per call, O(n²) total. Swap for a `HashSet`, O(1) average per call.
- **Forgetting recursion's stack space.** A recursive function with depth n uses O(n) space even if it allocates zero data structures — this is the #1 thing beginners forget to mention when asked "what's the space complexity?"

## Practice Problems — Part 1 ("What's the complexity?")

**1.P1**
```java
void mystery(int[] arr) {
    for (int i = 0; i < arr.length; i++)
        for (int j = 0; j < arr.length; j++)
            System.out.println(arr[i] + arr[j]);
}
```
<details><summary>Answer</summary>O(n²) time, O(1) extra space — classic nested loop, both bounded by n independently.</details>

**1.P2**
```java
void mystery2(int[] arr) {
    int n = arr.length;
    for (int i = 0; i < n; i++) System.out.println(arr[i]);
    for (int i = 0; i < n; i++)
        for (int j = 0; j < n; j++)
            System.out.println(arr[i]);
}
```
<details><summary>Answer</summary>First loop: O(n). Second (nested): O(n²). They're sequential, so total is O(n) + O(n²) = O(n²) — the dominant term wins.</details>

**1.P3**
```java
Map<Integer,Integer> memo = new HashMap<>();
int f(int n) {
    if (n <= 1) return n;
    if (memo.containsKey(n)) return memo.get(n);
    int result = f(n - 1) + f(n - 2);
    memo.put(n, result);
    return result;
}
```
<details><summary>Answer</summary>O(n) time — each of the n unique subproblems is computed exactly once (O(1) work besides the recursive calls, which are cache hits after the first time). O(n) space for the memo map plus the recursion stack.</details>

**1.P4**
```java
boolean isPrime(int n) {
    for (int i = 2; i * i <= n; i++)
        if (n % i == 0) return false;
    return true;
}
```
<details><summary>Answer</summary>O(√n) — the loop runs while i ≤ √n, since that's the condition `i*i <= n` describes.</details>

**1.P5**
```java
void mystery3(int n) {
    while (n > 1) {
        System.out.println(n);
        n = n / 2;
    }
}
```
<details><summary>Answer</summary>O(log n) — n halves each iteration, same growth pattern as binary search.</details>


---

# PART 2 DEEP-DIVE — Java Internals & Gotchas

## 2.1 Collections you'll actually reach for

| Collection | Backing structure | Ordering | Key ops |
|---|---|---|---|
| `ArrayList` | dynamic array | insertion order | O(1) get, amortized O(1) append, O(n) insert/remove in middle |
| `LinkedList` (java.util) | doubly linked list | insertion order | O(1) add/remove at ends, O(n) random access — rarely the right interview choice; you'll usually define your own `ListNode` instead |
| `HashMap`/`HashSet` | array of buckets (hash table) | none (arbitrary) | O(1) average get/put/contains |
| `LinkedHashMap` | hash table + doubly linked list | insertion (or access) order | O(1) average, PLUS predictable iteration order — this is what powers a quick LRU cache |
| `TreeMap`/`TreeSet` | red-black tree | sorted by key | O(log n) get/put, plus `floorKey`/`ceilingKey`/`higherKey`/`lowerKey`/`firstKey`/`lastKey` |
| `ArrayDeque` | resizable array (circular buffer) | insertion order | O(1) add/remove at BOTH ends — use this for stacks, queues, AND deques |

**`TreeMap`'s bonus methods are underused by beginners but very powerful:**
```java
TreeMap<Integer, String> map = new TreeMap<>();
map.put(10, "a"); map.put(20, "b"); map.put(30, "c");
map.floorKey(25);    // 20 -- largest key <= 25
map.ceilingKey(25);  // 30 -- smallest key >= 25
map.higherKey(20);   // 30 -- smallest key > 20
map.lowerKey(20);    // 10 -- largest key < 20
```
This is exactly what you want for "find the closest value currently stored" style problems (e.g., calendar/booking conflict problems, "exam room" seat assignment problems) — O(log n) instead of scanning.

**Safe removal while iterating (avoids `ConcurrentModificationException`):**
```java
Iterator<Integer> it = list.iterator();
while (it.hasNext()) {
    int val = it.next();
    if (val == target) it.remove();   // safe -- a for-each loop calling list.remove() here would throw
}
```

## 2.2 The equals()/hashCode() contract

**The rule:** if `a.equals(b)` is `true`, then `a.hashCode()` MUST equal `b.hashCode()`. Break this and your object behaves unpredictably inside `HashMap`/`HashSet` — lookups will "randomly" fail even for logically-equal objects.

```java
class Point {
    int x, y;
    Point(int x, int y) { this.x = x; this.y = y; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Point)) return false;
        Point p = (Point) o;
        return x == p.x && y == p.y;
    }

    @Override
    public int hashCode() {
        return Objects.hash(x, y);   // combines both fields into a single consistent hash
    }
}
```
**Without overriding both:** `new HashSet<Point>().add(new Point(1,2))` followed by `.contains(new Point(1,2))` returns **false** — because default `Object.equals()`/`hashCode()` compare by memory reference, not by value. This is a very common silent-bug source with custom objects as map keys or set elements.

## 2.3 Comparable vs Comparator

- **`Comparable<T>`** — the class defines ITS OWN natural ordering via `compareTo()`. Enables `Collections.sort(list)` with no second argument.
- **`Comparator<T>`** — an external, swappable ordering. Enables multiple different orderings of the same class without modifying it.

```java
class Employee implements Comparable<Employee> {
    String name; int salary;
    public int compareTo(Employee other) { return Integer.compare(this.salary, other.salary); }
}

// External comparator: sort by name instead, no changes to the class needed
employees.sort((a, b) -> a.name.compareTo(b.name));

// Multi-key sort: department first, then salary descending within each department
employees.sort(Comparator.comparing((Employee e) -> e.dept).thenComparing(e -> -e.salary));
```
**Gotcha:** `a.salary - b.salary` can silently overflow for extreme int values. Prefer `Integer.compare(a.salary, b.salary)` — safer and reads just as clearly.

## 2.4 Autoboxing & the Integer cache trap
```java
Integer a = 127, b = 127;
System.out.println(a == b);        // true  -- Java caches Integer objects in range [-128, 127]

Integer c = 200, d = 200;
System.out.println(c == d);        // false -- outside the cache range, these are DIFFERENT objects
System.out.println(c.equals(d));   // true  -- .equals() always compares by value
```
**Rule of thumb: NEVER use `==` to compare boxed types (`Integer`, `Long`, `Character`, etc.) — always `.equals()`.** This is a classic quiz question precisely because the bug is invisible for small numbers (which is exactly what most people test with) and only appears for larger values.

## 2.5 String immutability & StringBuilder
Every `String` operation that "modifies" a string actually creates a brand-new `String` object — the original is untouched. This is why looping with `str += c` is O(n²): each `+=` copies the entire string so far into a new, larger object.

`StringBuilder` maintains a mutable internal `char[]` that resizes like an `ArrayList` (amortized O(1) append) — always use it for string-building loops.

```java
StringBuilder sb = new StringBuilder();
for (int i = 0; i < n; i++) sb.append(i);   // O(n) total, not O(n^2)
String result = sb.toString();
```

## Practice Problems — Part 2

**2.P1 — Predict the output:**
```java
List<Integer> list = new ArrayList<>(Arrays.asList(3, 5, 5, 7));
System.out.println(list.remove(1));
System.out.println(list);
System.out.println(list.remove(Integer.valueOf(5)));
System.out.println(list);
```
<details><summary>Answer</summary>
`list.remove(1)` removes by INDEX (int overload) → removes the element at index 1 (value 5) → prints `5`. List is now `[3, 5, 7]`.
`list.remove(Integer.valueOf(5))` removes by VALUE (Object overload) → removes the first `5` → prints `true` (boolean return). List is now `[3, 7]`.
</details>

**2.P2 — Fix the bug:**
```java
class Person {
    String name;
    Person(String name) { this.name = name; }
}
Set<Person> set = new HashSet<>();
set.add(new Person("Alice"));
System.out.println(set.contains(new Person("Alice")));   // prints false -- why? fix it.
```
<details><summary>Answer</summary>
`Person` doesn't override `equals()`/`hashCode()`, so it falls back to reference-identity comparison — two different `Person` instances are never "equal" even with the same name. Fix: override both methods consistently, as shown in section 2.2.
</details>

**2.P3 — Write a comparator** that sorts a list of `int[]` intervals by start ascending; for ties, by end DESCENDING.
<details><summary>Answer</summary>

```java
intervals.sort((a, b) -> a[0] != b[0] ? a[0] - b[0] : b[1] - a[1]);
```
</details>

**2.P4 — What's the performance bug, and how do you fix it?**
```java
String result = "";
for (int i = 0; i < n; i++) result += i + ",";
```
<details><summary>Answer</summary>
O(n²) due to String immutability — each `+=` copies the whole accumulated string. Fix: use `StringBuilder` and call `.append()` in the loop, then `.toString()` once at the end — O(n) total.
</details>

**2.P5 — Predict the output:**
```java
Integer x = 100, y = 100;
Integer p = 200, q = 200;
System.out.println(x == y);
System.out.println(p == q);
```
<details><summary>Answer</summary>`true`, then `false` — the Integer cache covers -128 to 127; 100 is inside that range, 200 is not.</details>


---

# PART 3 DEEP-DIVE — Arrays & Strings

## 3.1 Two pointers — the full taxonomy
There are actually three distinct flavors, and confusing them is a common source of "why isn't my two-pointer solution working":

1. **Opposite-direction (converging)** — start at both ends, move inward. Used for: sorted-array pair sums, palindrome checks, reversing in place, container-with-most-water, trapping rain water.
2. **Same-direction (fast-slow within an array)** — both pointers move forward, fast one scans ahead. Used for: removing duplicates in place, partitioning (Dutch flag), merging sorted arrays from the back.
3. **Two separate arrays** — one pointer per array, advance whichever is "behind." Used for: merge step of merge sort, intersection of two sorted arrays.

```java
// Flavor 2: Remove duplicates from sorted array, in place
public int removeDuplicates(int[] nums) {
    if (nums.length == 0) return 0;
    int slow = 0;
    for (int fast = 1; fast < nums.length; fast++) {
        if (nums[fast] != nums[slow]) {
            slow++;
            nums[slow] = nums[fast];
        }
    }
    return slow + 1;   // new length
}
```

```java
// Flavor 1: Container With Most Water -- a great example of a NON-OBVIOUS greedy two-pointer proof
public int maxArea(int[] height) {
    int left = 0, right = height.length - 1, maxArea = 0;
    while (left < right) {
        int area = Math.min(height[left], height[right]) * (right - left);
        maxArea = Math.max(maxArea, area);
        if (height[left] < height[right]) left++;   // always move the SHORTER pointer
        else right--;
    }
    return maxArea;
}
```
**Why moving the shorter pointer is provably correct (interviewers love hearing this):** width only ever shrinks as pointers converge, and area is capped by the shorter wall. Keeping the taller wall fixed preserves your best chance of finding an even taller wall later; moving it can only ever match or worsen the current shorter-side constraint.

## 3.2 Sliding window — fixed vs. variable, and the two shrink conditions

**Fixed-size window** (size k is given):
```java
public double findMaxAverage(int[] nums, int k) {
    double sum = 0;
    for (int i = 0; i < k; i++) sum += nums[i];
    double maxSum = sum;
    for (int i = k; i < nums.length; i++) {
        sum += nums[i] - nums[i - k];   // slide: add new right element, remove element leaving the window
        maxSum = Math.max(maxSum, sum);
    }
    return maxSum / k;
}
```

**Variable-size window — the CRITICAL distinction beginners miss:** there are two opposite shrink conditions, and picking the wrong one silently breaks your solution.
- **"Shrink while INVALID"** (looking for the max window before a constraint breaks) — this is the Part 3 "longest substring without repeats" template from the main guide.
- **"Shrink while VALID"** (looking for the min window that still satisfies a constraint) — this is Minimum Window Substring, below.

```java
// Minimum Window Substring -- shrink WHILE VALID, the mirror image of the "longest substring" template
public String minWindow(String s, String t) {
    if (s.isEmpty() || t.isEmpty()) return "";
    Map<Character, Integer> need = new HashMap<>();
    for (char c : t.toCharArray()) need.merge(c, 1, Integer::sum);

    Map<Character, Integer> window = new HashMap<>();
    int left = 0, valid = 0, startIndex = 0, minLen = Integer.MAX_VALUE;

    for (int right = 0; right < s.length(); right++) {
        char c = s.charAt(right);
        if (need.containsKey(c)) {
            window.merge(c, 1, Integer::sum);
            if (window.get(c).intValue() == need.get(c).intValue()) valid++;
        }
        while (valid == need.size()) {                 // window currently satisfies the full requirement
            if (right - left + 1 < minLen) {
                minLen = right - left + 1;
                startIndex = left;
            }
            char d = s.charAt(left);
            if (need.containsKey(d)) {
                if (window.get(d).intValue() == need.get(d).intValue()) valid--;
                window.merge(d, -1, Integer::sum);
            }
            left++;
        }
    }
    return minLen == Integer.MAX_VALUE ? "" : s.substring(startIndex, startIndex + minLen);
}
```
**The one question that tells you which shrink-condition to use:** "am I trying to find the LONGEST window before something breaks, or the SHORTEST window that still works?" Longest → shrink while invalid. Shortest → shrink while valid.

## 3.3 Prefix sums — 2D extension (matrix range-sum queries)
```java
class NumMatrix {
    int[][] prefix;

    NumMatrix(int[][] matrix) {
        int rows = matrix.length, cols = matrix[0].length;
        prefix = new int[rows + 1][cols + 1];
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                // inclusion-exclusion: current cell + rect-above + rect-left - double-counted top-left corner
                prefix[r+1][c+1] = matrix[r][c] + prefix[r][c+1] + prefix[r+1][c] - prefix[r][c];
            }
        }
    }

    int sumRegion(int row1, int col1, int row2, int col2) {
        // inclusion-exclusion again, this time to EXTRACT just the target rectangle
        return prefix[row2+1][col2+1] - prefix[row1][col2+1] - prefix[row2+1][col1] + prefix[row1][col1];
    }
}
// O(rows*cols) preprocessing, O(1) per query -- huge win if there are many queries on a static matrix
```

## 3.4 Kadane's variant: Maximum Product Subarray
```java
// Needs BOTH running max AND running min, because a negative * negative flips back to positive
public int maxProduct(int[] nums) {
    int maxSoFar = nums[0], minSoFar = nums[0], result = nums[0];
    for (int i = 1; i < nums.length; i++) {
        int curr = nums[i];
        if (curr < 0) {                                  // a negative number SWAPS the roles of max and min
            int temp = maxSoFar; maxSoFar = minSoFar; minSoFar = temp;
        }
        maxSoFar = Math.max(curr, maxSoFar * curr);
        minSoFar = Math.min(curr, minSoFar * curr);
        result = Math.max(result, maxSoFar);
    }
    return result;
}
```
**Why you can't just track one running value here (the classic trap):** a very negative running product can become the BEST answer if multiplied by another negative later. Tracking only the max, like in plain Kadane's, silently loses this case.

## 3.5 Dutch National Flag (3-way partition, single pass)
```java
// Sort an array of only 0s, 1s, 2s in ONE pass, in place
public void sortColors(int[] nums) {
    int low = 0, mid = 0, high = nums.length - 1;
    while (mid <= high) {
        if (nums[mid] == 0) swap(nums, low++, mid++);
        else if (nums[mid] == 1) mid++;
        else swap(nums, mid, high--);   // do NOT increment mid here -- the swapped-in value needs rechecking
    }
}
private void swap(int[] a, int i, int j) { int t = a[i]; a[i] = a[j]; a[j] = t; }
// O(n) time, O(1) space -- beats a generic O(n log n) sort by exploiting the "only 3 possible values" constraint
```

## 3.6 In-place array-as-hashset tricks
```java
// Find all duplicates in an array where values are guaranteed in range [1, n]
public List<Integer> findDuplicates(int[] nums) {
    List<Integer> result = new ArrayList<>();
    for (int num : nums) {
        int idx = Math.abs(num) - 1;
        if (nums[idx] < 0) result.add(idx + 1);    // already negated once -- this is a duplicate
        else nums[idx] = -nums[idx];                 // first time seeing it -- mark by negating
    }
    return result;
}
// O(n) time, O(1) EXTRA space -- the array itself doubles as a "seen" hash set via its own sign bits
```

## Practice Problems — Part 3

**3.P1 — 3Sum:** find all unique triplets that sum to 0.
<details><summary>Solution</summary>

```java
public List<List<Integer>> threeSum(int[] nums) {
    Arrays.sort(nums);
    List<List<Integer>> result = new ArrayList<>();
    for (int i = 0; i < nums.length - 2; i++) {
        if (i > 0 && nums[i] == nums[i - 1]) continue;       // skip duplicate anchors
        int left = i + 1, right = nums.length - 1;
        while (left < right) {
            int sum = nums[i] + nums[left] + nums[right];
            if (sum == 0) {
                result.add(Arrays.asList(nums[i], nums[left], nums[right]));
                while (left < right && nums[left] == nums[left + 1]) left++;
                while (left < right && nums[right] == nums[right - 1]) right--;
                left++; right--;
            } else if (sum < 0) left++;
            else right--;
        }
    }
    return result;
}
// O(n^2) time, O(1) extra space beyond the sort and output
```
</details>

**3.P2 — Longest substring with at most K distinct characters.**
<details><summary>Solution</summary>

```java
public int lengthOfLongestSubstringKDistinct(String s, int k) {
    Map<Character, Integer> window = new HashMap<>();
    int left = 0, maxLen = 0;
    for (int right = 0; right < s.length(); right++) {
        window.merge(s.charAt(right), 1, Integer::sum);
        while (window.size() > k) {                 // shrink while INVALID -- looking for the longest window
            char d = s.charAt(left);
            window.put(d, window.get(d) - 1);
            if (window.get(d) == 0) window.remove(d);
            left++;
        }
        maxLen = Math.max(maxLen, right - left + 1);
    }
    return maxLen;
}
```
</details>

**3.P3 — Product of Array Except Self** (no division allowed).
<details><summary>Solution</summary>

```java
public int[] productExceptSelf(int[] nums) {
    int n = nums.length;
    int[] result = new int[n];
    result[0] = 1;
    for (int i = 1; i < n; i++) result[i] = result[i - 1] * nums[i - 1];   // prefix products
    int suffix = 1;
    for (int i = n - 1; i >= 0; i--) {
        result[i] *= suffix;
        suffix *= nums[i];
    }
    return result;
}
// O(n) time, O(1) extra space excluding the output array
```
</details>

**3.P4 — Trapping Rain Water** (two-pointer version).
<details><summary>Solution</summary>

```java
public int trap(int[] height) {
    int left = 0, right = height.length - 1, leftMax = 0, rightMax = 0, water = 0;
    while (left < right) {
        if (height[left] < height[right]) {
            leftMax = Math.max(leftMax, height[left]);
            water += leftMax - height[left];
            left++;
        } else {
            rightMax = Math.max(rightMax, height[right]);
            water += rightMax - height[right];
            right--;
        }
    }
    return water;
}
```
</details>

**3.P5 — Longest Palindromic Substring** (expand around center).
<details><summary>Solution</summary>

```java
public String longestPalindrome(String s) {
    if (s == null || s.length() < 1) return "";
    int start = 0, end = 0;
    for (int i = 0; i < s.length(); i++) {
        int len1 = expand(s, i, i);        // odd length, center on i
        int len2 = expand(s, i, i + 1);    // even length, center between i and i+1
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
// O(n^2) time, O(1) space
```
</details>


---

# PART 4 DEEP-DIVE — Hashing

## 4.1 How HashMap actually works internally
A `HashMap` is an array of "buckets" (default capacity 16). To store a key: Java calls `key.hashCode()`, runs it through a supplemental hash function (spreads the bits around to reduce clustering), then takes it modulo the array size to pick a bucket index.

- **Collisions** (two keys landing in the same bucket) are handled by chaining — each bucket holds a linked list of entries. Since Java 8, if a single bucket accumulates 8+ entries, that bucket converts to a red-black tree (O(log n) worst case for that bucket instead of O(n)).
- **Load factor** (default 0.75): once the map is 75% full, it RESIZES — doubles the array and rehashes every entry into new buckets. This resize is O(n), but happens rarely — same amortized-O(1) reasoning as Part 1.3's `ArrayList` example.
- **Bottom line:** O(1) average case, technically O(n) worst case (everything collides into one bucket) or O(log n) worst case with Java 8's treeification — say "O(1) average, amortized" if you want to be precise.

## 4.2 Custom objects as HashMap keys
Directly inherited from Part 2.2: if you use a custom class as a key, override `equals()`/`hashCode()` consistently, or lookups will silently fail even for "logically identical" keys. This is worth re-stating here because it's the #1 hashing-related bug people hit in practice — not the algorithm, the object contract.

## 4.3 HashMap vs LinkedHashMap vs TreeMap — decision table

| | Ordering | Complexity | Reach for it when... |
|---|---|---|---|
| `HashMap` | none | O(1) avg | default choice — fastest, use unless you need ordering |
| `LinkedHashMap` | insertion (or access) order | O(1) avg | you need predictable iteration order (e.g., building an LRU cache the "easy" way via `removeEldestEntry`) |
| `TreeMap` | sorted by key | O(log n) | you need sorted keys, or floor/ceiling/range queries |

## 4.4 The pattern catalog, extended
- **Counting** — word frequency, anagram grouping, majority element.
- **Seen-before** — two sum, contains duplicate, first non-repeating character.
- **Prefix-sum + hashmap** — subarray sum equals k (main guide, Part 3.3).
- **Sliding window + hashmap** — longest substring with constraints (this doc, Part 3.2).
- **Complement lookup** — two sum, 4Sum II (below).
- **Grouping by computed key** — group anagrams (main guide, Part 4).

## Practice Problems — Part 4

**4.P1 — Contains Duplicate II:** are there two equal elements within index distance k?
<details><summary>Solution</summary>

```java
public boolean containsNearbyDuplicate(int[] nums, int k) {
    Map<Integer, Integer> lastSeen = new HashMap<>();
    for (int i = 0; i < nums.length; i++) {
        if (lastSeen.containsKey(nums[i]) && i - lastSeen.get(nums[i]) <= k) return true;
        lastSeen.put(nums[i], i);
    }
    return false;
}
```
</details>

**4.P2 — Longest Consecutive Sequence,** O(n) (a sort-based approach is O(n log n) and will NOT be considered fully optimal here).
<details><summary>Solution</summary>

```java
public int longestConsecutive(int[] nums) {
    Set<Integer> set = new HashSet<>();
    for (int num : nums) set.add(num);
    int longest = 0;
    for (int num : set) {
        if (!set.contains(num - 1)) {          // only start counting from the BEGINNING of a run
            int length = 1;
            while (set.contains(num + length)) length++;
            longest = Math.max(longest, length);
        }
    }
    return longest;
}
// O(n) -- the inner while loop only ever runs for true "run starts," so total work across
// the whole outer loop is still bounded by n, not n^2.
```
</details>

**4.P3 — 4Sum II:** given 4 arrays A, B, C, D, count tuples (i,j,k,l) where `A[i]+B[j]+C[k]+D[l] == 0`.
<details><summary>Solution</summary>

```java
public int fourSumCount(int[] A, int[] B, int[] C, int[] D) {
    Map<Integer, Integer> sumAB = new HashMap<>();
    for (int a : A) for (int b : B) sumAB.merge(a + b, 1, Integer::sum);
    int count = 0;
    for (int c : C) for (int d : D) count += sumAB.getOrDefault(-(c + d), 0);
    return count;
}
// O(n^2) via splitting into two pairs, instead of the naive O(n^4) checking every 4-tuple directly
```
</details>

**4.P4 — Group Anagrams using a frequency signature** instead of sorting (faster: O(n·k) vs O(n·k log k)).
<details><summary>Solution</summary>

```java
public List<List<String>> groupAnagrams(String[] strs) {
    Map<String, List<String>> groups = new HashMap<>();
    for (String s : strs) {
        int[] count = new int[26];
        for (char c : s.toCharArray()) count[c - 'a']++;
        String key = Arrays.toString(count);         // frequency signature as the key, no sorting needed
        groups.computeIfAbsent(key, k -> new ArrayList<>()).add(s);
    }
    return new ArrayList<>(groups.values());
}
```
</details>

**4.P5 — Design a HashSet from scratch** (no built-in `HashMap`/`HashSet` allowed) — forces real understanding of hashing internals.
<details><summary>Solution</summary>

```java
class MyHashSet {
    private final List<Integer>[] buckets;
    private static final int SIZE = 1000;

    @SuppressWarnings("unchecked")
    public MyHashSet() {
        buckets = new List[SIZE];
        for (int i = 0; i < SIZE; i++) buckets[i] = new LinkedList<>();
    }

    private int hash(int key) { return key % SIZE; }

    public void add(int key) { if (!contains(key)) buckets[hash(key)].add(key); }
    public void remove(int key) { buckets[hash(key)].remove(Integer.valueOf(key)); }
    public boolean contains(int key) { return buckets[hash(key)].contains(key); }
}
// Average O(1) per op if SIZE is reasonably large relative to n; degrades toward O(n/SIZE) per bucket
// as more keys collide -- this IS the collision-chaining mechanism Part 4.1 described, made explicit.
```
</details>


---

# PART 5 DEEP-DIVE — Linked Lists

## 5.1 Singly vs. doubly — when the extra pointer earns its keep
- **Singly linked** (`next` only): simpler, less memory, but O(n) to find "the node before X," and can't traverse backward.
- **Doubly linked** (`next` AND `prev`): more memory per node, but O(1) removal given just a node reference (no need to hunt for the previous node), and backward traversal is free. This is exactly why the classic LRU Cache (5.7 below) is built on a doubly linked list.

## 5.2 Reversal variants beyond the basic case

**Reverse in groups of k:**
```java
public ListNode reverseKGroup(ListNode head, int k) {
    ListNode node = head;
    int count = 0;
    while (node != null && count < k) { node = node.next; count++; }
    if (count < k) return head;                     // fewer than k nodes remain -- leave this tail as-is

    ListNode newHead = reverseFirstK(head, k);
    head.next = reverseKGroup(node, k);              // head is now this group's TAIL; recurse on the rest
    return newHead;
}
private ListNode reverseFirstK(ListNode head, int k) {
    ListNode prev = null, curr = head;
    for (int i = 0; i < k; i++) {
        ListNode next = curr.next;
        curr.next = prev;
        prev = curr;
        curr = next;
    }
    return prev;
}
// O(n) time, O(n/k) space for the recursion stack
```

**Reverse between positions m and n (the "insert at front" splice trick):**
```java
public ListNode reverseBetween(ListNode head, int m, int n) {
    ListNode dummy = new ListNode(-1);
    dummy.next = head;
    ListNode prev = dummy;
    for (int i = 0; i < m - 1; i++) prev = prev.next;      // walk to just before position m

    ListNode curr = prev.next;
    for (int i = 0; i < n - m; i++) {
        ListNode next = curr.next;
        curr.next = next.next;
        next.next = prev.next;
        prev.next = next;                                    // repeatedly move the next node to the FRONT of the sublist
    }
    return dummy.next;
}
```

## 5.3 Floyd's algorithm — finding WHERE the cycle starts, not just detecting it
```java
public ListNode detectCycle(ListNode head) {
    ListNode slow = head, fast = head;
    while (fast != null && fast.next != null) {
        slow = slow.next;
        fast = fast.next.next;
        if (slow == fast) {
            ListNode ptr1 = head, ptr2 = slow;
            while (ptr1 != ptr2) { ptr1 = ptr1.next; ptr2 = ptr2.next; }   // both move 1 step now
            return ptr1;   // this is the cycle's start node
        }
    }
    return null;
}
```
**The math, briefly (you don't need to derive this live, just trust and apply it):** let `a` = distance from head to cycle start, `c` = cycle length, `b` = distance from cycle start to the meeting point. It can be shown that `a ≡ c - b (mod c)`. That means walking `a` steps from BOTH the head and the meeting point lands on the same node — the cycle's start. Two synchronized pointers moving at equal speed from those two starting points will always meet exactly there.

## 5.4 Palindrome Linked List — a "combine 3 things you already know" problem
```java
public boolean isPalindrome(ListNode head) {
    if (head == null || head.next == null) return true;
    ListNode slow = head, fast = head;
    while (fast.next != null && fast.next.next != null) { slow = slow.next; fast = fast.next.next; }  // find middle

    ListNode secondHalf = reverseList(slow.next);            // reverse second half

    ListNode p1 = head, p2 = secondHalf;
    boolean result = true;
    while (p2 != null) {
        if (p1.val != p2.val) { result = false; break; }
        p1 = p1.next; p2 = p2.next;
    }
    slow.next = reverseList(secondHalf);   // good practice: restore original structure before returning
    return result;
}
// O(n) time, O(1) space
```

## 5.5 Intersection of Two Linked Lists — the elegant O(1)-space trick
```java
public ListNode getIntersectionNode(ListNode headA, ListNode headB) {
    ListNode a = headA, b = headB;
    while (a != b) {
        a = (a == null) ? headB : a.next;   // redirect to the OTHER list's head once you hit the end
        b = (b == null) ? headA : b.next;
    }
    return a;   // intersection node, or null if the lists never meet
}
```
**Why this works:** both pointers travel the exact same TOTAL distance (`lenA + lenB`) before potentially meeting — this synchronizes them at the intersection point regardless of the two lists' individual length difference, no length pre-computation needed.

## 5.6 Copy List with Random Pointer
```java
public Node copyRandomList(Node head) {
    if (head == null) return null;
    Map<Node, Node> map = new HashMap<>();
    Node curr = head;
    while (curr != null) { map.put(curr, new Node(curr.val)); curr = curr.next; }   // pass 1: clone nodes

    curr = head;
    while (curr != null) {                                                          // pass 2: wire up pointers
        map.get(curr).next = map.get(curr.next);
        map.get(curr).random = map.get(curr.random);
        curr = curr.next;
    }
    return map.get(head);
}
// O(n) time, O(n) space -- an O(1)-space version exists (interweave clones into the original list,
// then unweave) but the hashmap version is what you should default to deriving live.
```

## 5.7 LRU Cache — full implementation (the best Part 4 + Part 5 crossover problem)
```java
class LRUCache {
    class Node { int key, value; Node prev, next; Node(int k, int v) { key = k; value = v; } }

    private final Map<Integer, Node> map = new HashMap<>();
    private final int capacity;
    private final Node head = new Node(-1, -1);   // dummy head = most-recently-used side
    private final Node tail = new Node(-1, -1);   // dummy tail = least-recently-used side

    public LRUCache(int capacity) {
        this.capacity = capacity;
        head.next = tail;
        tail.prev = head;
    }

    public int get(int key) {
        if (!map.containsKey(key)) return -1;
        Node node = map.get(key);
        remove(node);
        insertAtFront(node);        // touching a key marks it as most recently used
        return node.value;
    }

    public void put(int key, int value) {
        if (map.containsKey(key)) remove(map.get(key));
        if (map.size() == capacity) remove(tail.prev);   // evict least recently used
        Node node = new Node(key, value);
        insertAtFront(node);
    }

    private void remove(Node node) {
        map.remove(node.key);
        node.prev.next = node.next;
        node.next.prev = node.prev;
    }
    private void insertAtFront(Node node) {
        map.put(node.key, node);
        node.next = head.next; node.prev = head;
        head.next.prev = node; head.next = node;
    }
}
// get AND put are both O(1) -- the entire point: HashMap gives O(1) lookup, the doubly linked list
// gives O(1) reordering and O(1) eviction from the tail without shifting any elements.
```
**Why this is one of the best interview problems to have fully internalized:** no single built-in Java collection gives you O(1) for BOTH "find by key" and "reorder / evict from one end." Combining two data structures, each doing what it's uniquely good at, is a design instinct that generalizes far beyond this one problem.

## Practice Problems — Part 5

**5.P1 — Remove Nth Node From End of List**, in one pass.
<details><summary>Solution</summary>

```java
public ListNode removeNthFromEnd(ListNode head, int n) {
    ListNode dummy = new ListNode(-1);
    dummy.next = head;
    ListNode fast = dummy, slow = dummy;
    for (int i = 0; i <= n; i++) fast = fast.next;         // open a gap of n+1 nodes
    while (fast != null) { fast = fast.next; slow = slow.next; }
    slow.next = slow.next.next;
    return dummy.next;
}
```
</details>

**5.P2 — Add Two Numbers** (digits stored in reverse order as linked lists).
<details><summary>Solution</summary>

```java
public ListNode addTwoNumbers(ListNode l1, ListNode l2) {
    ListNode dummy = new ListNode(-1);
    ListNode curr = dummy;
    int carry = 0;
    while (l1 != null || l2 != null || carry != 0) {
        int sum = carry + (l1 != null ? l1.val : 0) + (l2 != null ? l2.val : 0);
        carry = sum / 10;
        curr.next = new ListNode(sum % 10);
        curr = curr.next;
        if (l1 != null) l1 = l1.next;
        if (l2 != null) l2 = l2.next;
    }
    return dummy.next;
}
```
</details>

**5.P3 — Flatten a Multilevel Doubly Linked List** (nodes may have a `child` pointer to a separate sub-list).
<details><summary>Hint + Solution</summary>
Hint: DFS. When you hit a node with a `child`, recursively flatten that child list first, then splice it in between the current node and its original `next`, and don't forget to null out the `child` pointer afterward.

```java
public Node flatten(Node head) {
    Node curr = head;
    while (curr != null) {
        if (curr.child != null) {
            Node next = curr.next;
            Node childHead = flatten(curr.child);   // recursively flatten the child first
            curr.next = childHead;
            childHead.prev = curr;
            curr.child = null;
            Node tail = childHead;
            while (tail.next != null) tail = tail.next;   // find the end of the now-flattened child
            tail.next = next;
            if (next != null) next.prev = tail;
        }
        curr = curr.next;
    }
    return head;
}
```
</details>

**5.P4 — Merge K Sorted Lists** via divide & conquer (pairwise merging), reusing `mergeTwoLists` as a building block.
<details><summary>Solution</summary>

```java
public ListNode mergeKLists(ListNode[] lists) {
    if (lists.length == 0) return null;
    while (lists.length > 1) {
        List<ListNode> merged = new ArrayList<>();
        for (int i = 0; i < lists.length; i += 2) {
            ListNode l1 = lists[i];
            ListNode l2 = (i + 1 < lists.length) ? lists[i + 1] : null;
            merged.add(mergeTwoLists(l1, l2));
        }
        lists = merged.toArray(new ListNode[0]);
    }
    return lists[0];
}
// O(N log k) -- N total nodes, log k "rounds" of pairwise merging. See Part 11 for the heap-based alternative.
```
</details>

**5.P5 — Reorder List:** `L0 → L1 → ... → Ln` becomes `L0 → Ln → L1 → Ln-1 → ...` — another "combine 3 things" consolidation problem.
<details><summary>Hint + Solution</summary>
Hint: find the middle (5.2), reverse the second half (5.2/5.4), then merge the two halves by alternating nodes.

```java
public void reorderList(ListNode head) {
    if (head == null || head.next == null) return;
    ListNode slow = head, fast = head;
    while (fast.next != null && fast.next.next != null) { slow = slow.next; fast = fast.next.next; }

    ListNode second = reverseList(slow.next);
    slow.next = null;

    ListNode first = head;
    while (second != null) {
        ListNode t1 = first.next, t2 = second.next;
        first.next = second;
        second.next = t1;
        first = t1;
        second = t2;
    }
}
```
</details>


---

# PART 6 DEEP-DIVE — Stacks & Queues

## 6.1 Min Stack — O(1) get-minimum, a classic "design" question
```java
class MinStack {
    private Deque<Integer> stack = new ArrayDeque<>();
    private Deque<Integer> minStack = new ArrayDeque<>();   // parallel stack: "min so far at this depth"

    public void push(int val) {
        stack.push(val);
        int currentMin = minStack.isEmpty() ? val : Math.min(val, minStack.peek());
        minStack.push(currentMin);
    }
    public void pop() { stack.pop(); minStack.pop(); }
    public int top() { return stack.peek(); }
    public int getMin() { return minStack.peek(); }
}
// Every operation O(1) -- the trick is a SECOND stack that mirrors the first, always recording the
// running minimum, so popping never "loses" the previous minimum the way one stack alone would.
```

## 6.2 Evaluating expressions

**Reverse Polish Notation:**
```java
public int evalRPN(String[] tokens) {
    Deque<Integer> stack = new ArrayDeque<>();
    Set<String> ops = Set.of("+", "-", "*", "/");
    for (String token : tokens) {
        if (ops.contains(token)) {
            int b = stack.pop(), a = stack.pop();      // note the order -- a was pushed BEFORE b
            switch (token) {
                case "+": stack.push(a + b); break;
                case "-": stack.push(a - b); break;
                case "*": stack.push(a * b); break;
                case "/": stack.push(a / b); break;
            }
        } else {
            stack.push(Integer.parseInt(token));
        }
    }
    return stack.pop();
}
```

**Basic Calculator (handles `+`, `-`, and nested parentheses):**
```java
public int calculate(String s) {
    Deque<Integer> stack = new ArrayDeque<>();
    int result = 0, number = 0, sign = 1;
    for (char c : s.toCharArray()) {
        if (Character.isDigit(c)) {
            number = number * 10 + (c - '0');
        } else if (c == '+') { result += sign * number; number = 0; sign = 1; }
        else if (c == '-') { result += sign * number; number = 0; sign = -1; }
        else if (c == '(') {
            stack.push(result); stack.push(sign);    // checkpoint state before entering the parens
            result = 0; sign = 1;
        } else if (c == ')') {
            result += sign * number; number = 0;
            result = result * stack.pop() + stack.pop();   // pop sign first, then pop the outer result
        }
    }
    return result + sign * number;
}
```

## 6.3 Monotonic stack, boss level: Largest Rectangle in Histogram
```java
public int largestRectangleArea(int[] heights) {
    Deque<Integer> stack = new ArrayDeque<>();    // indices, heights strictly increasing bottom to top
    int maxArea = 0;
    for (int i = 0; i <= heights.length; i++) {
        int h = (i == heights.length) ? 0 : heights[i];    // sentinel 0 flushes whatever's left on the stack
        while (!stack.isEmpty() && heights[stack.peek()] > h) {
            int height = heights[stack.pop()];
            int width = stack.isEmpty() ? i : i - stack.peek() - 1;
            maxArea = Math.max(maxArea, height * width);
        }
        stack.push(i);
    }
    return maxArea;
}
// O(n) -- same "each index pushed and popped at most once" amortized argument from Part 1.3 and Part 6 (main guide)
```
**How to think about this one:** for every bar, you want to know "how far can a rectangle of THIS height extend left and right before hitting something shorter?" The monotonic stack answers that in amortized O(1) per bar by popping everything taller than the current bar and computing the width it could have spanned.

## 6.4 Monotonic Deque — Sliding Window Maximum
```java
public int[] maxSlidingWindow(int[] nums, int k) {
    Deque<Integer> deque = new ArrayDeque<>();     // indices, values DECREASING left to right
    int[] result = new int[nums.length - k + 1];
    for (int i = 0; i < nums.length; i++) {
        while (!deque.isEmpty() && deque.peekFirst() < i - k + 1) deque.pollFirst();     // drop out-of-window
        while (!deque.isEmpty() && nums[deque.peekLast()] < nums[i]) deque.pollLast();   // drop dominated values
        deque.offerLast(i);
        if (i >= k - 1) result[i - k + 1] = nums[deque.peekFirst()];
    }
    return result;
}
// O(n) -- see Part 11.5 for a direct comparison against the O(n log k) heap-based alternative
```

## Practice Problems — Part 6

**6.P1 — Implement Stack using Queues** (the flip side of the main guide's "Queue using Stacks").
<details><summary>Solution</summary>

```java
class MyStack {
    Queue<Integer> queue = new LinkedList<>();
    public void push(int x) {
        queue.offer(x);
        for (int i = 0; i < queue.size() - 1; i++) queue.offer(queue.poll());   // rotate so the new element is at the front
    }
    public int pop() { return queue.poll(); }
    public int top() { return queue.peek(); }
}
// push: O(n), pop/top: O(1) -- the inverse tradeoff of the Queue-via-two-Stacks approach
```
</details>

**6.P2 — Next Greater Element II** (circular array).
<details><summary>Hint + Solution</summary>
Hint: iterate `2n` times using `i % n` to simulate wraparound, monotonic stack as usual.

```java
public int[] nextGreaterElements(int[] nums) {
    int n = nums.length;
    int[] result = new int[n];
    Arrays.fill(result, -1);
    Deque<Integer> stack = new ArrayDeque<>();
    for (int i = 0; i < 2 * n; i++) {
        int num = nums[i % n];
        while (!stack.isEmpty() && nums[stack.peek()] < num) {
            result[stack.pop()] = num;
        }
        if (i < n) stack.push(i);    // only push real indices once, not during the second "wraparound" pass
    }
    return result;
}
```
</details>

**6.P3 — Decode String** (e.g., `"3[a2[c]]"` → `"accaccacc"`).
<details><summary>Hint + Solution</summary>
Hint: use two stacks — one for pending repeat counts, one for pending partial strings — push both whenever you hit `[`, pop and combine whenever you hit `]`.

```java
public String decodeString(String s) {
    Deque<Integer> countStack = new ArrayDeque<>();
    Deque<StringBuilder> stringStack = new ArrayDeque<>();
    StringBuilder curr = new StringBuilder();
    int count = 0;
    for (char c : s.toCharArray()) {
        if (Character.isDigit(c)) {
            count = count * 10 + (c - '0');
        } else if (c == '[') {
            countStack.push(count);
            stringStack.push(curr);
            count = 0;
            curr = new StringBuilder();
        } else if (c == ']') {
            StringBuilder temp = curr;
            curr = stringStack.pop();
            int repeat = countStack.pop();
            for (int i = 0; i < repeat; i++) curr.append(temp);
        } else {
            curr.append(c);
        }
    }
    return curr.toString();
}
```
</details>

**6.P4 — Asteroid Collision.**
<details><summary>Hint + Solution</summary>
Hint: simulate with a stack. A collision only happens when a right-moving asteroid (positive) is on the stack and a left-moving one (negative) arrives.

```java
public int[] asteroidCollision(int[] asteroids) {
    Deque<Integer> stack = new ArrayDeque<>();
    for (int a : asteroids) {
        boolean alive = true;
        while (alive && a < 0 && !stack.isEmpty() && stack.peek() > 0) {
            if (stack.peek() < -a) stack.pop();          // top asteroid destroyed, keep checking further down
            else if (stack.peek() == -a) { stack.pop(); alive = false; }  // both destroyed
            else alive = false;                            // current asteroid destroyed
        }
        if (alive) stack.push(a);
    }
    int[] result = new int[stack.size()];
    for (int i = result.length - 1; i >= 0; i--) result[i] = stack.pop();
    return result;
}
```
</details>

**6.P5 — Max Stack** (like Min Stack, section 6.1, but tracking the maximum instead).
<details><summary>Solution</summary>
Identical idea to Min Stack, mirrored — maintain a parallel stack of "max so far":

```java
class MaxStack {
    private Deque<Integer> stack = new ArrayDeque<>();
    private Deque<Integer> maxStack = new ArrayDeque<>();
    public void push(int val) {
        stack.push(val);
        maxStack.push(maxStack.isEmpty() ? val : Math.max(val, maxStack.peek()));
    }
    public int pop() { maxStack.pop(); return stack.pop(); }
    public int top() { return stack.peek(); }
    public int peekMax() { return maxStack.peek(); }
}
```
</details>


---

# PART 7 DEEP-DIVE — Recursion & Backtracking

## 7.1 Recursion tree, and a Java-specific gotcha
**Visualize backtracking as DFS on a decision tree** — not the input's structure, but a tree of "partial states," where each node's children are the choices available from that state. What backtracking literally does is a DFS traversal of this imagined tree.

**Java-specific gotcha: no tail-call optimization.** Some languages optimize a "tail recursive" function (where the recursive call is the very last thing that happens) into a loop internally, using O(1) stack space no matter how deep the recursion goes. **Java does not do this.** A deeply recursive function (depth > ~10,000, roughly) can `StackOverflowError` in Java even if it's tail-recursive in shape. If you anticipate very deep recursion, mention converting to an iterative approach with an explicit stack.

## 7.2 N-Queens — the definitive backtracking problem
```java
public List<List<String>> solveNQueens(int n) {
    List<List<String>> result = new ArrayList<>();
    int[] queens = new int[n];               // queens[row] = column of the queen placed in that row
    backtrack(result, queens, 0, n);
    return result;
}
private void backtrack(List<List<String>> result, int[] queens, int row, int n) {
    if (row == n) { result.add(buildBoard(queens, n)); return; }
    for (int col = 0; col < n; col++) {
        if (isValid(queens, row, col)) {
            queens[row] = col;                // place -- gets overwritten next iteration, no explicit undo needed
            backtrack(result, queens, row + 1, n);
        }
    }
}
private boolean isValid(int[] queens, int row, int col) {
    for (int prevRow = 0; prevRow < row; prevRow++) {
        int prevCol = queens[prevRow];
        if (prevCol == col) return false;
        if (Math.abs(prevCol - col) == Math.abs(prevRow - row)) return false;   // same diagonal
    }
    return true;
}
private List<String> buildBoard(int[] queens, int n) {
    List<String> board = new ArrayList<>();
    for (int col : queens) {
        StringBuilder row = new StringBuilder();
        for (int c = 0; c < n; c++) row.append(c == col ? 'Q' : '.');
        board.add(row.toString());
    }
    return board;
}
```
**A subtle but important teaching point:** unlike the Subsets/Permutations template, this DOESN'T need an explicit "undo" line — because `queens[row]` simply gets overwritten by the next loop iteration, rather than being appended to a shared mutable list that needs popping. Recognizing WHEN you need explicit undo (mutable shared state like a `List<Integer> path`) vs. when overwriting naturally handles it (a fixed-size array indexed by depth) shows real understanding, not template-matching.

## 7.3 Sudoku Solver
```java
public void solveSudoku(char[][] board) { solve(board); }

private boolean solve(char[][] board) {
    for (int r = 0; r < 9; r++) {
        for (int c = 0; c < 9; c++) {
            if (board[r][c] == '.') {
                for (char digit = '1'; digit <= '9'; digit++) {
                    if (isValidPlacement(board, r, c, digit)) {
                        board[r][c] = digit;
                        if (solve(board)) return true;     // this placement led to a full solution -- propagate success
                        board[r][c] = '.';                  // undo -- this digit was a dead end
                    }
                }
                return false;    // no digit works here -- signal failure up to the caller
            }
        }
    }
    return true;    // no empty cells remain -- solved
}
private boolean isValidPlacement(char[][] board, int row, int col, char digit) {
    for (int i = 0; i < 9; i++) {
        if (board[row][i] == digit) return false;
        if (board[i][col] == digit) return false;
        if (board[3*(row/3) + i/3][3*(col/3) + i%3] == digit) return false;
    }
    return true;
}
```

## 7.4 Word Search — in-place marking instead of a visited array
```java
public boolean exist(char[][] board, String word) {
    for (int r = 0; r < board.length; r++)
        for (int c = 0; c < board[0].length; c++)
            if (dfs(board, word, r, c, 0)) return true;
    return false;
}
private boolean dfs(char[][] board, String word, int r, int c, int idx) {
    if (idx == word.length()) return true;
    if (r < 0 || r >= board.length || c < 0 || c >= board[0].length || board[r][c] != word.charAt(idx)) return false;

    char temp = board[r][c];
    board[r][c] = '#';    // mark visited IN-PLACE -- no separate visited[][] array needed
    boolean found = dfs(board, word, r+1, c, idx+1) || dfs(board, word, r-1, c, idx+1) ||
                     dfs(board, word, r, c+1, idx+1) || dfs(board, word, r, c-1, idx+1);
    board[r][c] = temp;   // undo -- critical, or sibling search paths will wrongly see this cell as blocked
    return found;
}
```

## 7.5 The Combination Sum family — distinguishing the 3 variants
This is one of the most confused topics for beginners because the three variants LOOK nearly identical but need different recursion parameters:

| Variant | Reuse allowed? | Duplicates in input? | Key code difference |
|---|---|---|---|
| Combination Sum I | Yes, unlimited | No | recurse with `i` (same index stays eligible) |
| Combination Sum II | No | Yes | recurse with `i+1`, AND skip `if (i > start && candidates[i] == candidates[i-1])` |
| Combination Sum III | No | N/A (digits 1-9 only) | add a `path.size() == k` check to the base case |

```java
// Combination Sum I -- reference implementation
public List<List<Integer>> combinationSum(int[] candidates, int target) {
    List<List<Integer>> result = new ArrayList<>();
    Arrays.sort(candidates);
    backtrack(candidates, target, 0, new ArrayList<>(), result);
    return result;
}
private void backtrack(int[] candidates, int remaining, int start, List<Integer> path, List<List<Integer>> result) {
    if (remaining == 0) { result.add(new ArrayList<>(path)); return; }
    for (int i = start; i < candidates.length; i++) {
        if (candidates[i] > remaining) break;      // pruning -- sorted array means everything after is also too big
        path.add(candidates[i]);
        backtrack(candidates, remaining - candidates[i], i, path, result);   // i, NOT i+1 -- allows reuse
        path.remove(path.size() - 1);
    }
}
```

## 7.6 Palindrome Partitioning
```java
public List<List<String>> partition(String s) {
    List<List<String>> result = new ArrayList<>();
    backtrack(s, 0, new ArrayList<>(), result);
    return result;
}
private void backtrack(String s, int start, List<String> path, List<List<String>> result) {
    if (start == s.length()) { result.add(new ArrayList<>(path)); return; }
    for (int end = start + 1; end <= s.length(); end++) {
        String sub = s.substring(start, end);
        if (isPalindrome(sub)) {
            path.add(sub);
            backtrack(s, end, path, result);
            path.remove(path.size() - 1);
        }
    }
}
private boolean isPalindrome(String s) {
    int l = 0, r = s.length() - 1;
    while (l < r) if (s.charAt(l++) != s.charAt(r--)) return false;
    return true;
}
```

## 7.7 Pruning — how to make backtracking fast enough to pass
- **Sort input first when order doesn't matter for correctness** — enables early `break` (not just `continue`) once you know later choices can't work either (see 7.5's `if (candidates[i] > remaining) break`).
- **Check constraints as early as possible**, not only at the base case — fail fast instead of building an entire invalid path before noticing.
- **Memoize if the same subproblem recurs** — this is literally the bridge from backtracking into Dynamic Programming (Part 14 in the main guide).
- **Precompute expensive checks once.** In Palindrome Partitioning above, `isPalindrome` gets recomputed from scratch on every call — a DP table of `isPalindrome[i][j]` computed once up front turns this from O(n) per check into O(1) per check, a common "how would you optimize this" follow-up.

## Practice Problems — Part 7

**7.P1 — Generate Parentheses** (n pairs, all balanced combinations).
<details><summary>Solution</summary>

```java
public List<String> generateParenthesis(int n) {
    List<String> result = new ArrayList<>();
    backtrack(result, new StringBuilder(), 0, 0, n);
    return result;
}
private void backtrack(List<String> result, StringBuilder curr, int open, int close, int n) {
    if (curr.length() == 2 * n) { result.add(curr.toString()); return; }
    if (open < n) {
        curr.append('(');
        backtrack(result, curr, open + 1, close, n);
        curr.deleteCharAt(curr.length() - 1);
    }
    if (close < open) {                 // can only close a paren if there's an unmatched open one
        curr.append(')');
        backtrack(result, curr, open, close + 1, n);
        curr.deleteCharAt(curr.length() - 1);
    }
}
```
</details>

**7.P2 — Letter Combinations of a Phone Number.**
<details><summary>Solution</summary>

```java
public List<String> letterCombinations(String digits) {
    if (digits.isEmpty()) return new ArrayList<>();
    String[] map = {"", "", "abc", "def", "ghi", "jkl", "mno", "pqrs", "tuv", "wxyz"};
    List<String> result = new ArrayList<>();
    backtrack(digits, 0, new StringBuilder(), map, result);
    return result;
}
private void backtrack(String digits, int idx, StringBuilder path, String[] map, List<String> result) {
    if (idx == digits.length()) { result.add(path.toString()); return; }
    String letters = map[digits.charAt(idx) - '0'];
    for (char c : letters.toCharArray()) {
        path.append(c);
        backtrack(digits, idx + 1, path, map, result);
        path.deleteCharAt(path.length() - 1);
    }
}
```
</details>

**7.P3 — Restore IP Addresses.**
<details><summary>Hint + Solution</summary>
Hint: backtrack trying 1-3 digit segments at each step; prune segments that exceed 255 or have an invalid leading zero (e.g., "01" is never valid).

```java
public List<String> restoreIpAddresses(String s) {
    List<String> result = new ArrayList<>();
    backtrack(s, 0, new ArrayList<>(), result);
    return result;
}
private void backtrack(String s, int start, List<String> path, List<String> result) {
    if (path.size() == 4) {
        if (start == s.length()) result.add(String.join(".", path));
        return;
    }
    for (int len = 1; len <= 3 && start + len <= s.length(); len++) {
        String segment = s.substring(start, start + len);
        if (segment.length() > 1 && segment.charAt(0) == '0') continue;   // no leading zeros
        if (Integer.parseInt(segment) > 255) continue;
        path.add(segment);
        backtrack(s, start + len, path, result);
        path.remove(path.size() - 1);
    }
}
```
</details>

**7.P4 — Permutations II** (input has duplicates, no duplicate permutations in output).
<details><summary>Solution</summary>

```java
public List<List<Integer>> permuteUnique(int[] nums) {
    Arrays.sort(nums);
    List<List<Integer>> result = new ArrayList<>();
    backtrack(nums, new ArrayList<>(), new boolean[nums.length], result);
    return result;
}
private void backtrack(int[] nums, List<Integer> path, boolean[] used, List<List<Integer>> result) {
    if (path.size() == nums.length) { result.add(new ArrayList<>(path)); return; }
    for (int i = 0; i < nums.length; i++) {
        if (used[i]) continue;
        if (i > 0 && nums[i] == nums[i - 1] && !used[i - 1]) continue;   // dedup: skip an unused duplicate
        used[i] = true;
        path.add(nums[i]);
        backtrack(nums, path, used, result);
        path.remove(path.size() - 1);
        used[i] = false;
    }
}
```
</details>

**7.P5 — Subsets II** (input has duplicates, no duplicate subsets in output).
<details><summary>Solution</summary>

```java
public List<List<Integer>> subsetsWithDup(int[] nums) {
    Arrays.sort(nums);
    List<List<Integer>> result = new ArrayList<>();
    backtrack(nums, 0, new ArrayList<>(), result);
    return result;
}
private void backtrack(int[] nums, int start, List<Integer> path, List<List<Integer>> result) {
    result.add(new ArrayList<>(path));
    for (int i = start; i < nums.length; i++) {
        if (i > start && nums[i] == nums[i - 1]) continue;   // dedup at THIS recursion depth
        path.add(nums[i]);
        backtrack(nums, i + 1, path, result);
        path.remove(path.size() - 1);
    }
}
```
</details>


---

# PART 8 DEEP-DIVE — Sorting

## 8.1 Quicksort's worst case, and how to avoid it
Worst case O(n²) happens when the pivot is consistently the smallest or largest remaining element — e.g., already-sorted input combined with an "always pick the last element" pivot strategy, where every partition splits into a 0-size piece and an (n-1)-size piece.

**Fix: randomize the pivot** before partitioning — makes an adversarial worst-case input astronomically unlikely:
```java
private int partition(int[] arr, int low, int high) {
    int randomIndex = low + new Random().nextInt(high - low + 1);
    swap(arr, randomIndex, high);          // randomize BEFORE the usual Lomuto partition logic
    int pivot = arr[high];
    int i = low - 1;
    for (int j = low; j < high; j++) {
        if (arr[j] < pivot) { i++; swap(arr, i, j); }
    }
    swap(arr, i + 1, high);
    return i + 1;
}
```
An alternative fix is **median-of-three** (pick the median of the first, middle, and last elements as pivot) — also guards against common worst-case input patterns without needing true randomness.

## 8.2 Heap Sort — the only O(n log n) sort that's also truly in-place
```java
public void heapSort(int[] arr) {
    int n = arr.length;
    for (int i = n / 2 - 1; i >= 0; i--) heapify(arr, n, i);    // build max heap bottom-up, O(n) total (see Part 11.2)
    for (int i = n - 1; i > 0; i--) {
        swap(arr, 0, i);           // move current max to its final sorted position at the end
        heapify(arr, i, 0);         // restore the heap property on the now-shrunken heap
    }
}
private void heapify(int[] arr, int n, int i) {
    int largest = i, left = 2*i + 1, right = 2*i + 2;
    if (left < n && arr[left] > arr[largest]) largest = left;
    if (right < n && arr[right] > arr[largest]) largest = right;
    if (largest != i) { swap(arr, i, largest); heapify(arr, n, largest); }
}
```

## 8.3 Counting Sort — O(n + k) when values are bounded
```java
public void countingSort(int[] arr, int maxVal) {
    int[] count = new int[maxVal + 1];
    for (int num : arr) count[num]++;
    int idx = 0;
    for (int val = 0; val <= maxVal; val++) {
        while (count[val] > 0) { arr[idx++] = val; count[val]--; }
    }
}
```
**When this actually wins in an interview:** if told values are bounded (e.g., "scores 0-100," "ages 0-120"), and asked to beat O(n log n) — say "since the values are bounded to a known small range, I can use counting sort for O(n + k)." This is a strong, non-obvious answer that shows you're not just reaching for `Arrays.sort()` reflexively.

## 8.4 Custom comparators for multi-key sorting (ties back to Part 2.3)
```java
// Sort meetings by start time; break ties by shorter duration first
meetings.sort((a, b) -> a[0] != b[0] ? a[0] - b[0] : (a[1] - a[0]) - (b[1] - b[0]));

// Same thing, more readable with a Comparator chain
meetings.sort(Comparator.<int[]>comparingInt(m -> m[0]).thenComparingInt(m -> m[1] - m[0]));
```

## Practice Problems — Part 8

**8.P1 — Sort a k-sorted (nearly sorted) array**, where each element is at most k positions from its final sorted position.
<details><summary>Hint + Solution</summary>
Hint: a min-heap of size k+1 is enough — this previews Part 11's heap material, a good cross-topic link.

```java
public int[] sortKSortedArray(int[] arr, int k) {
    PriorityQueue<Integer> minHeap = new PriorityQueue<>();
    List<Integer> result = new ArrayList<>();
    for (int i = 0; i < arr.length; i++) {
        minHeap.offer(arr[i]);
        if (minHeap.size() > k) result.add(minHeap.poll());
    }
    while (!minHeap.isEmpty()) result.add(minHeap.poll());
    return result.stream().mapToInt(Integer::intValue).toArray();
}
// O(n log k) -- much better than a full O(n log n) sort when k << n
```
</details>

**8.P2 — Merge Intervals**, implemented purely as a "sort first, then linear scan" exercise (do it from memory without checking the main guide).
<details><summary>Solution</summary>

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
</details>

**8.P3 — Kth Largest Element in an Array**, solved via Quickselect (average O(n), reusing quicksort's partition logic for a different purpose).
<details><summary>Solution</summary>

```java
public int findKthLargest(int[] nums, int k) {
    return quickSelect(nums, 0, nums.length - 1, nums.length - k);   // kth largest = (n-k)th smallest, 0-indexed
}
private int quickSelect(int[] nums, int low, int high, int targetIdx) {
    int pivotIdx = partition(nums, low, high);
    if (pivotIdx == targetIdx) return nums[pivotIdx];
    else if (pivotIdx < targetIdx) return quickSelect(nums, pivotIdx + 1, high, targetIdx);
    else return quickSelect(nums, low, pivotIdx - 1, targetIdx);
}
// Average O(n) -- unlike quicksort, only ONE side of the partition is ever explored, not both
```
This is a great problem because it demonstrates the SAME partition logic from Part 8.1 solving a different problem (selection, not sorting) in better average complexity than sorting the whole array first.
</details>

**8.P4 — Sort a Linked List in O(n log n)** using merge sort (find middle via fast/slow, recursively sort each half, merge). A direct Part 5 + Part 8 crossover.
<details><summary>Solution</summary>

```java
public ListNode sortList(ListNode head) {
    if (head == null || head.next == null) return head;
    ListNode slow = head, fast = head, prev = null;
    while (fast != null && fast.next != null) { prev = slow; slow = slow.next; fast = fast.next.next; }
    prev.next = null;   // split into two halves

    ListNode left = sortList(head);
    ListNode right = sortList(slow);
    return merge(left, right);
}
private ListNode merge(ListNode l1, ListNode l2) {
    ListNode dummy = new ListNode(-1), curr = dummy;
    while (l1 != null && l2 != null) {
        if (l1.val <= l2.val) { curr.next = l1; l1 = l1.next; }
        else { curr.next = l2; l2 = l2.next; }
        curr = curr.next;
    }
    curr.next = (l1 != null) ? l1 : l2;
    return dummy.next;
}
```
</details>

**8.P5 — Custom-sort log lines:** letter-logs sorted lexicographically by (content, then identifier), digit-logs kept in their original relative order and placed after all letter-logs.
<details><summary>Hint + Solution</summary>
Hint: a real "design a comparator" question — classify each log first, then use a custom `Comparator` that treats digit-logs as always "greater than" letter-logs (so they sort to the end while preserving relative order via a stable sort).

```java
public String[] reorderLogFiles(String[] logs) {
    Arrays.sort(logs, (log1, log2) -> {
        String[] split1 = log1.split(" ", 2);
        String[] split2 = log2.split(" ", 2);
        boolean isDigit1 = Character.isDigit(split1[1].charAt(0));
        boolean isDigit2 = Character.isDigit(split2[1].charAt(0));
        if (!isDigit1 && !isDigit2) {                          // both letter-logs
            int cmp = split1[1].compareTo(split2[1]);
            if (cmp != 0) return cmp;
            return split1[0].compareTo(split2[0]);              // tie-break by identifier
        }
        if (isDigit1 && isDigit2) return 0;                     // both digit-logs -- Arrays.sort is stable, order preserved
        return isDigit1 ? 1 : -1;                                 // digit-logs always sort after letter-logs
    });
    return logs;
}
// Relies on Arrays.sort() for Object[] being a stable sort (Timsort) -- this is exactly why that
// stability guarantee from Part 8 (main guide) matters here.
```
</details>


---

# PART 9 DEEP-DIVE — Binary Search

## 9.1 Find first/last occurrence — the most important variant beyond the basic template
```java
public int[] searchRange(int[] nums, int target) {
    return new int[]{findBound(nums, target, true), findBound(nums, target, false)};
}
private int findBound(int[] nums, int target, boolean findFirst) {
    int left = 0, right = nums.length - 1, result = -1;
    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (nums[mid] == target) {
            result = mid;
            if (findFirst) right = mid - 1;    // found a match -- keep searching LEFT for an earlier one
            else left = mid + 1;                 // found a match -- keep searching RIGHT for a later one
        } else if (nums[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    return result;
}
```
**Why this matters more than the basic template:** "don't stop at the first match — keep narrowing toward the boundary you actually want" is the core idea behind almost every boundary-finding binary search problem, including several of the practice problems below.

## 9.2 Binary search in a 2D matrix
```java
// Works when the matrix is sorted "as if flattened row by row" -- every row's last element
// is smaller than the next row's first element.
public boolean searchMatrix(int[][] matrix, int target) {
    int rows = matrix.length, cols = matrix[0].length;
    int left = 0, right = rows * cols - 1;
    while (left <= right) {
        int mid = left + (right - left) / 2;
        int val = matrix[mid / cols][mid % cols];    // convert the 1D index back to 2D coordinates
        if (val == target) return true;
        else if (val < target) left = mid + 1;
        else right = mid - 1;
    }
    return false;
}
// O(log(rows*cols))
```
**If rows/columns are only sorted independently (not globally)** — a different matrix shape — use a "staircase search" instead: start at the top-right corner, move left if the current value is too big, move down if too small. That's O(rows + cols), a different but equally valid approach worth naming if the matrix property differs.

## 9.3 Binary search on floating-point answers
```java
public double mySqrt(double x) {
    double left = 0, right = Math.max(1, x);
    double epsilon = 1e-6;
    while (right - left > epsilon) {
        double mid = left + (right - left) / 2;
        if (mid * mid < x) left = mid; else right = mid;
    }
    return left;
}
```
**Key difference from integer binary search:** the loop condition is `right - left > epsilon`, not `left <= right` — floating-point values don't have a clean "next" value the way integers do, so you converge to within a tolerance rather than to exact equality.

## 9.4 More "search on the answer" problems

```java
// Split Array Largest Sum -- minimize the largest subarray sum when splitting nums into m subarrays
public int splitArray(int[] nums, int m) {
    int left = Arrays.stream(nums).max().getAsInt();
    int right = Arrays.stream(nums).sum();
    while (left < right) {
        int mid = left + (right - left) / 2;
        if (canSplit(nums, m, mid)) right = mid; else left = mid + 1;
    }
    return left;
}
private boolean canSplit(int[] nums, int m, int maxSum) {
    int subarrays = 1, currentSum = 0;
    for (int num : nums) {
        if (currentSum + num > maxSum) { subarrays++; currentSum = 0; }
        currentSum += num;
    }
    return subarrays <= m;
}
```
**Notice this is structurally IDENTICAL** to "Ship Packages Within D Days" from the main guide (Part 9.3) — same exact template, different cover story. Spotting this kind of equivalence between "different" problems is precisely the pattern-recognition skill the main guide's Part 18 cheat-sheet is built around.

## Practice Problems — Part 9

**9.P1 — Search Insert Position** (index where target should be inserted to keep the array sorted) — a clean, minimal leftmost-bound variant.
<details><summary>Solution</summary>

```java
public int searchInsert(int[] nums, int target) {
    int left = 0, right = nums.length - 1;
    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (nums[mid] == target) return mid;
        else if (nums[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    return left;   // when the loop ends, `left` IS the correct insertion index
}
```
</details>

**9.P2 — Find Peak Element** (adjacent elements are guaranteed different; find any local peak).
<details><summary>Hint + Solution</summary>
Hint: compare `nums[mid]` to `nums[mid+1]`. If ascending, a peak must exist to the right; otherwise, one exists at `mid` or to the left. Works even on fully unsorted arrays because of the "no two adjacent equal" guarantee plus boundary conditions (treat both ends as `-infinity`).

```java
public int findPeakElement(int[] nums) {
    int left = 0, right = nums.length - 1;
    while (left < right) {
        int mid = left + (right - left) / 2;
        if (nums[mid] < nums[mid + 1]) left = mid + 1;   // peak is to the right
        else right = mid;                                  // peak is at mid or to the left
    }
    return left;
}
```
</details>

**9.P3 — Koko Eating Bananas** (minimize eating speed to finish all piles within h hours) — same "search on the answer" shape as 9.4's Split Array.
<details><summary>Solution</summary>

```java
public int minEatingSpeed(int[] piles, int h) {
    int left = 1, right = Arrays.stream(piles).max().getAsInt();
    while (left < right) {
        int mid = left + (right - left) / 2;
        if (canFinish(piles, h, mid)) right = mid; else left = mid + 1;
    }
    return left;
}
private boolean canFinish(int[] piles, int h, int speed) {
    long hours = 0;
    for (int pile : piles) hours += (pile + speed - 1) / speed;   // ceiling division
    return hours <= h;
}
```
</details>

**9.P4 — Median of Two Sorted Arrays** (the classic "hard" binary search problem).
<details><summary>Hint + Solution</summary>
Hint: binary search on the PARTITION POINT within the smaller array — not on values. You're looking for a split where everything on the left half (across both arrays combined) is ≤ everything on the right half.

```java
public double findMedianSortedArrays(int[] nums1, int[] nums2) {
    if (nums1.length > nums2.length) return findMedianSortedArrays(nums2, nums1);   // ensure nums1 is smaller
    int m = nums1.length, n = nums2.length;
    int left = 0, right = m;
    while (left <= right) {
        int partition1 = left + (right - left) / 2;
        int partition2 = (m + n + 1) / 2 - partition1;

        int maxLeft1 = (partition1 == 0) ? Integer.MIN_VALUE : nums1[partition1 - 1];
        int minRight1 = (partition1 == m) ? Integer.MAX_VALUE : nums1[partition1];
        int maxLeft2 = (partition2 == 0) ? Integer.MIN_VALUE : nums2[partition2 - 1];
        int minRight2 = (partition2 == n) ? Integer.MAX_VALUE : nums2[partition2];

        if (maxLeft1 <= minRight2 && maxLeft2 <= minRight1) {
            if ((m + n) % 2 == 0) {
                return (Math.max(maxLeft1, maxLeft2) + Math.min(minRight1, minRight2)) / 2.0;
            } else {
                return Math.max(maxLeft1, maxLeft2);
            }
        } else if (maxLeft1 > minRight2) {
            right = partition1 - 1;
        } else {
            left = partition1 + 1;
        }
    }
    throw new IllegalArgumentException("Input arrays are not sorted");
}
// O(log(min(m, n))) -- binary searching over the smaller array's possible partition points
```
This is genuinely one of the hardest "standard" interview problems — if you can talk through the partition idea even without flawless implementation, that's a strong showing.
</details>

**9.P5 — Find Minimum in Rotated Sorted Array.**
<details><summary>Hint + Solution</summary>
Hint: compare `nums[mid]` to `nums[right]` (not `nums[left]`) to determine which half is guaranteed unrotated/sorted.

```java
public int findMin(int[] nums) {
    int left = 0, right = nums.length - 1;
    while (left < right) {
        int mid = left + (right - left) / 2;
        if (nums[mid] > nums[right]) left = mid + 1;    // minimum must be to the right of mid
        else right = mid;                                  // minimum is at mid or to the left
    }
    return nums[left];
}
```
</details>


---

# PART 10 DEEP-DIVE — Trees

## 10.1 Iterative traversals — proving recursion is "just an implicit stack"
```java
// Iterative Preorder -- push right before left so left comes off the stack (and gets processed) first
public List<Integer> preorderIterative(TreeNode root) {
    List<Integer> result = new ArrayList<>();
    if (root == null) return result;
    Deque<TreeNode> stack = new ArrayDeque<>();
    stack.push(root);
    while (!stack.isEmpty()) {
        TreeNode node = stack.pop();
        result.add(node.val);
        if (node.right != null) stack.push(node.right);
        if (node.left != null) stack.push(node.left);
    }
    return result;
}

// Iterative Inorder -- trickier: must fully descend left before processing anything
public List<Integer> inorderIterative(TreeNode root) {
    List<Integer> result = new ArrayList<>();
    Deque<TreeNode> stack = new ArrayDeque<>();
    TreeNode curr = root;
    while (curr != null || !stack.isEmpty()) {
        while (curr != null) { stack.push(curr); curr = curr.left; }   // go as far left as possible
        curr = stack.pop();                                             // backtrack to last unprocessed node
        result.add(curr.val);
        curr = curr.right;                                               // then explore its right subtree
    }
    return result;
}
```
**Why interviewers sometimes explicitly ask for the iterative version:** it tests whether you understand that recursion is really just the call stack doing this same push/pop bookkeeping automatically — writing it out by hand proves you're not just pattern-matching a recursive template.

## 10.2 Morris Traversal — true O(1) space, no stack, no recursion
```java
public List<Integer> morrisInorder(TreeNode root) {
    List<Integer> result = new ArrayList<>();
    TreeNode curr = root;
    while (curr != null) {
        if (curr.left == null) {
            result.add(curr.val);
            curr = curr.right;
        } else {
            TreeNode predecessor = curr.left;
            while (predecessor.right != null && predecessor.right != curr) predecessor = predecessor.right;

            if (predecessor.right == null) {
                predecessor.right = curr;    // create a temporary "thread" pointing back up to curr
                curr = curr.left;
            } else {
                predecessor.right = null;    // thread already exists -- remove it, restoring the tree
                result.add(curr.val);
                curr = curr.right;
            }
        }
    }
    return result;
}
// O(n) time, O(1) EXTRA space -- temporarily repurposes null right-pointers as "threads" back up the tree
```
**When to bring this up:** if asked "can you avoid the O(h) stack/recursion space," this is the answer. You're not expected to derive this cold under time pressure, but recognizing the name "Morris Traversal" and the rough threading idea is a strong "I know more than the minimum" signal.

## 10.3 Construct Binary Tree from Preorder + Inorder Traversal
```java
private int preIdx = 0;
public TreeNode buildTree(int[] preorder, int[] inorder) {
    Map<Integer, Integer> inorderIndex = new HashMap<>();
    for (int i = 0; i < inorder.length; i++) inorderIndex.put(inorder[i], i);
    return build(preorder, inorder, 0, inorder.length - 1, inorderIndex);
}
private TreeNode build(int[] preorder, int[] inorder, int inStart, int inEnd, Map<Integer, Integer> inorderIndex) {
    if (inStart > inEnd) return null;
    int rootVal = preorder[preIdx++];
    TreeNode root = new TreeNode(rootVal);
    int rootIdx = inorderIndex.get(rootVal);
    root.left = build(preorder, inorder, inStart, rootIdx - 1, inorderIndex);
    root.right = build(preorder, inorder, rootIdx + 1, inEnd, inorderIndex);
    return root;
}
```
**Key insight:** preorder's FIRST remaining element is always the current subtree's root. Inorder tells you exactly how many nodes belong in the left subtree (everything appearing before the root's position). Combine both facts recursively.

## 10.4 Serialize / Deserialize Binary Tree
```java
public String serialize(TreeNode root) {
    StringBuilder sb = new StringBuilder();
    serializeHelper(root, sb);
    return sb.toString();
}
private void serializeHelper(TreeNode node, StringBuilder sb) {
    if (node == null) { sb.append("null,"); return; }
    sb.append(node.val).append(",");
    serializeHelper(node.left, sb);
    serializeHelper(node.right, sb);
}
public TreeNode deserialize(String data) {
    Deque<String> nodes = new ArrayDeque<>(Arrays.asList(data.split(",")));
    return deserializeHelper(nodes);
}
private TreeNode deserializeHelper(Deque<String> nodes) {
    String val = nodes.poll();
    if (val.equals("null")) return null;
    TreeNode node = new TreeNode(Integer.parseInt(val));
    node.left = deserializeHelper(nodes);
    node.right = deserializeHelper(nodes);
    return node;
}
// Both O(n) time and space -- preorder WITH explicit null markers is enough to reconstruct the tree uniquely
```

## 10.5 Symmetric / Invert / Same Tree — quick drills for the "combine children" template
```java
public boolean isSymmetric(TreeNode root) {
    return root == null || isMirror(root.left, root.right);
}
private boolean isMirror(TreeNode a, TreeNode b) {
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    return a.val == b.val && isMirror(a.left, b.right) && isMirror(a.right, b.left);
}

public TreeNode invertTree(TreeNode root) {
    if (root == null) return null;
    TreeNode temp = root.left;
    root.left = invertTree(root.right);
    root.right = invertTree(temp);
    return root;
}
```

## Practice Problems — Part 10

**10.P1 — Binary Tree Maximum Path Sum** (path can start/end anywhere, not necessarily through the root).
<details><summary>Hint + Solution</summary>
Hint: same "return-to-parent vs. update-global-answer" split as Diameter of Binary Tree from the main guide — but with sums, and negative contributions should be clipped to 0 before use.

```java
private int maxSum = Integer.MIN_VALUE;
public int maxPathSum(TreeNode root) {
    maxGain(root);
    return maxSum;
}
private int maxGain(TreeNode node) {
    if (node == null) return 0;
    int leftGain = Math.max(maxGain(node.left), 0);     // ignore a negative contribution entirely
    int rightGain = Math.max(maxGain(node.right), 0);
    maxSum = Math.max(maxSum, node.val + leftGain + rightGain);   // path THROUGH this node -- candidate global answer
    return node.val + Math.max(leftGain, rightGain);               // path continuing UP -- what the parent can use
}
```
</details>

**10.P2 — Kth Smallest Element in a BST.**
<details><summary>Hint + Solution</summary>
Hint: inorder traversal of a BST yields sorted order (Part 10.1 in the main guide) — stop as soon as you hit the kth visited node.

```java
public int kthSmallest(TreeNode root, int k) {
    Deque<TreeNode> stack = new ArrayDeque<>();
    TreeNode curr = root;
    while (curr != null || !stack.isEmpty()) {
        while (curr != null) { stack.push(curr); curr = curr.left; }
        curr = stack.pop();
        if (--k == 0) return curr.val;
        curr = curr.right;
    }
    throw new IllegalArgumentException("k is larger than the number of nodes");
}
// O(h + k) -- can stop early instead of building the full inorder list, better than the naive full-traversal approach
```
</details>

**10.P3 — Path Sum II** (return all root-to-leaf paths that sum to a target) — a direct Part 7 (backtracking) + Part 10 (tree DFS) crossover.
<details><summary>Solution</summary>

```java
public List<List<Integer>> pathSum(TreeNode root, int targetSum) {
    List<List<Integer>> result = new ArrayList<>();
    backtrack(root, targetSum, new ArrayList<>(), result);
    return result;
}
private void backtrack(TreeNode node, int remaining, List<Integer> path, List<List<Integer>> result) {
    if (node == null) return;
    path.add(node.val);
    if (node.left == null && node.right == null && remaining == node.val) {
        result.add(new ArrayList<>(path));
    } else {
        backtrack(node.left, remaining - node.val, path, result);
        backtrack(node.right, remaining - node.val, path, result);
    }
    path.remove(path.size() - 1);    // undo -- same backtracking discipline as Part 7
}
```
</details>

**10.P4 — Convert Sorted Array to Balanced BST.**
<details><summary>Hint + Solution</summary>
Hint: always pick the middle element as root, recurse on left/right halves — binary search's "always split at the middle" idea, applied to tree construction instead of search.

```java
public TreeNode sortedArrayToBST(int[] nums) {
    return build(nums, 0, nums.length - 1);
}
private TreeNode build(int[] nums, int left, int right) {
    if (left > right) return null;
    int mid = left + (right - left) / 2;
    TreeNode root = new TreeNode(nums[mid]);
    root.left = build(nums, left, mid - 1);
    root.right = build(nums, mid + 1, right);
    return root;
}
```
</details>

**10.P5 — Vertical Order Traversal.**
<details><summary>Hint + Solution</summary>
Hint: BFS (or DFS) while tracking each node's `(column, row)` coordinates in a `TreeMap<Integer, List<...>>` keyed by column — using a `TreeMap` means columns come out already sorted, no extra sort step needed.

```java
public List<List<Integer>> verticalTraversal(TreeNode root) {
    TreeMap<Integer, List<int[]>> columns = new TreeMap<>();   // column -> list of {row, val}
    Deque<TreeNode> queue = new ArrayDeque<>();
    Deque<int[]> coords = new ArrayDeque<>();                   // parallel queue of {row, col}
    queue.offer(root);
    coords.offer(new int[]{0, 0});

    while (!queue.isEmpty()) {
        TreeNode node = queue.poll();
        int[] rc = coords.poll();
        columns.computeIfAbsent(rc[1], k -> new ArrayList<>()).add(new int[]{rc[0], node.val});
        if (node.left != null) { queue.offer(node.left); coords.offer(new int[]{rc[0]+1, rc[1]-1}); }
        if (node.right != null) { queue.offer(node.right); coords.offer(new int[]{rc[0]+1, rc[1]+1}); }
    }

    List<List<Integer>> result = new ArrayList<>();
    for (List<int[]> col : columns.values()) {
        col.sort((a, b) -> a[0] != b[0] ? a[0] - b[0] : a[1] - b[1]);   // same column: sort by row, then by value
        List<Integer> vals = new ArrayList<>();
        for (int[] pair : col) vals.add(pair[1]);
        result.add(vals);
    }
    return result;
}
```
</details>


---

# PART 11 DEEP-DIVE — Heaps / Priority Queues

## 11.1 Array-based heap internals — implementing one by hand
A binary heap is stored as a plain ARRAY, not a pointer-based tree. For a node at index `i`: parent is at `(i-1)/2`, left child at `2i+1`, right child at `2i+2`. This is why heaps are so memory-efficient compared to a pointer-based tree structure.

```java
class MinHeap {
    private int[] heap;
    private int size;

    MinHeap(int capacity) { heap = new int[capacity]; size = 0; }

    private int parent(int i) { return (i - 1) / 2; }
    private int left(int i) { return 2 * i + 1; }
    private int right(int i) { return 2 * i + 2; }

    public void insert(int val) {
        heap[size] = val;
        int i = size++;
        while (i > 0 && heap[parent(i)] > heap[i]) {   // bubble UP while smaller than parent
            swap(i, parent(i));
            i = parent(i);
        }
    }

    public int extractMin() {
        int min = heap[0];
        heap[0] = heap[--size];
        sinkDown(0);                                     // bubble DOWN to restore the heap property
        return min;
    }

    private void sinkDown(int i) {
        int smallest = i, l = left(i), r = right(i);
        if (l < size && heap[l] < heap[smallest]) smallest = l;
        if (r < size && heap[r] < heap[smallest]) smallest = r;
        if (smallest != i) { swap(i, smallest); sinkDown(smallest); }
    }
    private void swap(int i, int j) { int t = heap[i]; heap[i] = heap[j]; heap[j] = t; }
}
// insert: O(log n) (bubble up at most tree height). extractMin: O(log n) (sink down at most tree height)
```
**Why bother knowing this when `PriorityQueue` already exists?** Interviewers occasionally ask you to implement a heap from scratch specifically to check you understand what's happening "under the hood" — the index math (`2i+1`, `2i+2`) is also what lets you reason confidently about heap-based problems even when using the built-in class.

## 11.2 Heapify — O(n), not O(n log n)
```java
public void buildHeap(int[] arr) {
    for (int i = arr.length / 2 - 1; i >= 0; i--) sinkDown(arr, arr.length, i);   // start from last non-leaf, go backward
}
```
**Why this is O(n), and NOT O(n log n) (a genuinely common interview "gotcha" fact):** most nodes in a heap live near the BOTTOM, where sink-down does almost no work — leaf nodes (roughly half the tree) need zero sink operations, nodes one level up need at most one swap, and so on. Summing "(number of nodes at each level) × (max sink cost at that level)" across all levels converges to O(n) total, not O(n log n). Compare this to calling `insert()` n separate times (each O(log n)) — THAT gives O(n log n). This exact distinction is why `new PriorityQueue<>(collection)` (O(n), uses heapify) beats adding n elements one at a time via `offer()` (O(n log n)) — worth mentioning if you're optimizing a heap-heavy solution's construction step.

## 11.3 Merge K Sorted Lists — the canonical heap application
```java
public ListNode mergeKLists(ListNode[] lists) {
    PriorityQueue<ListNode> pq = new PriorityQueue<>((a, b) -> a.val - b.val);
    for (ListNode node : lists) if (node != null) pq.offer(node);

    ListNode dummy = new ListNode(-1), curr = dummy;
    while (!pq.isEmpty()) {
        ListNode smallest = pq.poll();
        curr.next = smallest;
        curr = curr.next;
        if (smallest.next != null) pq.offer(smallest.next);
    }
    return dummy.next;
}
// O(N log k) -- N total nodes, heap never holds more than k nodes at once
```
**Compare to the divide-and-conquer approach from this doc's Part 5.P4:** identical complexity, O(N log k), but this heap version is usually more intuitive to derive live under time pressure ("always take the smallest currently-available head"). Default to this unless specifically asked to optimize away the heap's constant-factor overhead.

## 11.4 Task Scheduler — a less obvious heap application
```java
public int leastInterval(char[] tasks, int n) {
    int[] freq = new int[26];
    for (char t : tasks) freq[t - 'A']++;
    PriorityQueue<Integer> maxHeap = new PriorityQueue<>(Collections.reverseOrder());
    for (int f : freq) if (f > 0) maxHeap.offer(f);

    int time = 0;
    Queue<int[]> cooldown = new LinkedList<>();   // {remaining count, time it becomes available again}
    while (!maxHeap.isEmpty() || !cooldown.isEmpty()) {
        time++;
        if (!maxHeap.isEmpty()) {
            int count = maxHeap.poll() - 1;
            if (count > 0) cooldown.offer(new int[]{count, time + n});
        }
        if (!cooldown.isEmpty() && cooldown.peek()[1] == time) {
            maxHeap.offer(cooldown.poll()[0]);    // cooldown expired -- this task type is eligible again
        }
    }
    return time;
}
```

## 11.5 Sliding Window Maximum, revisited — heap vs. deque, head to head
- **Deque approach** (this doc's Part 6.4): O(n) — you can lazily discard stale/dominated indices from BOTH ends in O(1) amortized per element.
- **Heap approach**: O(n log k) — removing a specific "expired" index from a heap isn't O(1), so you need LAZY deletion (check on peek whether the top is stale; if so, poll and check again) rather than true removal.
```java
public int[] maxSlidingWindowHeap(int[] nums, int k) {
    PriorityQueue<int[]> maxHeap = new PriorityQueue<>((a, b) -> b[0] - a[0]);   // {value, index}, largest value first
    int[] result = new int[nums.length - k + 1];
    for (int i = 0; i < nums.length; i++) {
        maxHeap.offer(new int[]{nums[i], i});
        while (maxHeap.peek()[1] <= i - k) maxHeap.poll();    // lazy deletion of out-of-window entries
        if (i >= k - 1) result[i - k + 1] = maxHeap.peek()[0];
    }
    return result;
}
```
**Always mention BOTH approaches and their tradeoff if you can**, even if you only implement one — showing you know a slower-but-more-obvious approach AND a faster-but-cleverer one (and why the second is better) is a strong signal on its own.

## Practice Problems — Part 11

**11.P1 — K Closest Points to Origin.**
<details><summary>Hint + Solution</summary>
Hint: same "keep the heap bounded to size k" idea as Kth Largest Element (Part 8.P3) — but a MAX-heap this time, so you can evict the currently-farthest point once the heap exceeds size k.

```java
public int[][] kClosest(int[][] points, int k) {
    PriorityQueue<int[]> maxHeap = new PriorityQueue<>(
        (a, b) -> (b[0]*b[0] + b[1]*b[1]) - (a[0]*a[0] + a[1]*a[1])
    );
    for (int[] point : points) {
        maxHeap.offer(point);
        if (maxHeap.size() > k) maxHeap.poll();
    }
    return maxHeap.toArray(new int[k][]);
}
// O(n log k)
```
</details>

**11.P2 — Find Median from Data Stream** (two-heap pattern — shown in the main guide, implement it here from scratch as a checkpoint).
<details><summary>Solution</summary>

```java
class MedianFinder {
    PriorityQueue<Integer> small = new PriorityQueue<>(Collections.reverseOrder());   // max-heap, lower half
    PriorityQueue<Integer> large = new PriorityQueue<>();                              // min-heap, upper half

    public void addNum(int num) {
        small.offer(num);
        large.offer(small.poll());                     // balance step: push the max of "small" over to "large"
        if (small.size() < large.size()) small.offer(large.poll());
    }
    public double findMedian() {
        if (small.size() > large.size()) return small.peek();
        return (small.peek() + large.peek()) / 2.0;
    }
}
```
</details>

**11.P3 — Reorganize String** (rearrange so no two adjacent characters repeat).
<details><summary>Hint + Solution</summary>
Hint: max-heap by frequency, greedily place the currently most-frequent remaining character, but hold the just-placed character back for exactly one round so it can't be placed adjacent to itself.

```java
public String reorganizeString(String s) {
    int[] freq = new int[26];
    for (char c : s.toCharArray()) freq[c - 'a']++;

    PriorityQueue<int[]> maxHeap = new PriorityQueue<>((a, b) -> b[1] - a[1]);   // {char, count}
    for (int i = 0; i < 26; i++) if (freq[i] > 0) maxHeap.offer(new int[]{i, freq[i]});

    StringBuilder result = new StringBuilder();
    int[] prev = null;
    while (!maxHeap.isEmpty()) {
        int[] curr = maxHeap.poll();
        result.append((char) ('a' + curr[0]));
        curr[1]--;
        if (prev != null && prev[1] > 0) maxHeap.offer(prev);   // release the held-back character
        prev = curr;
    }
    return result.length() == s.length() ? result.toString() : "";
}
```
</details>

**11.P4 — Ugly Numbers II** (the nth number whose only prime factors are 2, 3, and 5).
<details><summary>Hint + Solution</summary>
Hint: min-heap seeded with 1; pop the smallest, push its ×2, ×3, ×5 multiples, dedupe with a `HashSet` so you don't process the same value twice.

```java
public int nthUglyNumber(int n) {
    PriorityQueue<Long> minHeap = new PriorityQueue<>();
    Set<Long> seen = new HashSet<>();
    int[] factors = {2, 3, 5};
    minHeap.offer(1L);
    seen.add(1L);
    long ugly = 1;
    for (int i = 0; i < n; i++) {
        ugly = minHeap.poll();
        for (int factor : factors) {
            long next = ugly * factor;
            if (seen.add(next)) minHeap.offer(next);   // Set.add returns false if already present -- neat dedup one-liner
        }
    }
    return (int) ugly;
}
```
</details>

**11.P5 — Meeting Rooms II** (minimum number of meeting rooms needed for a set of intervals).
<details><summary>Solution</summary>

```java
public int minMeetingRooms(int[][] intervals) {
    Arrays.sort(intervals, (a, b) -> a[0] - b[0]);
    PriorityQueue<Integer> endTimes = new PriorityQueue<>();     // min-heap of end times of currently ongoing meetings
    for (int[] interval : intervals) {
        if (!endTimes.isEmpty() && endTimes.peek() <= interval[0]) {
            endTimes.poll();       // the earliest-ending room has freed up in time -- reuse it
        }
        endTimes.offer(interval[1]);
    }
    return endTimes.size();        // rooms still "in use" at the end = rooms needed at peak
}
// O(n log n) -- dominated by the initial sort
```
</details>

---

## Closing notes

That's Parts 1-11 at full depth — foundations through heaps, roughly 55 additional practice problems on top of what the main guide already covers. A few honest notes:

- **Don't binge this in one sitting.** Pair each Part here with the corresponding week in the main guide's 10-week study plan (Part 19) — read the deep-dive AFTER you've already struggled with the main guide's version and its problems once.
- **The "combine 2-3 things you already know" problems are the real test.** LRU Cache (5.7), Palindrome Linked List (5.4), Binary Tree Maximum Path Sum (10.P1) — these aren't new concepts, they're old concepts layered together. That layering is exactly what separates L4-ready from "knows the topics in isolation."
- **Want Parts 12-21 (Graphs through the interview framework) at this same depth, in another separate document?** Just say so — same structure, same problem density.