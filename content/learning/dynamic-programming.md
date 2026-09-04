# Dynamic Programming — Part 1: One-Dimensional (1-D) DP

This is the first file in a short series on Dynamic Programming. This one covers **1-D DP** end to end — what it actually is, how to *recognize* it, a repeatable framework for *deriving* a solution yourself (not memorizing one), and a curated progression of problems from easy to hard. Part 2 (grids, two-string DP, knapsack) and anything left over after that will follow as separate files.

**How to use this guide:** Read Sections 1–5 once, carefully — that's the reusable engine. Then, for every problem in Section 6, stop before looking at the code. Try to fill in the state, the recurrence, and the base case yourself using the 5-step framework. Then check your answer against mine. This active-recall loop is what actually builds pattern recognition. Passively reading solved code makes *that* problem feel familiar — it does nothing for the next, unseen problem, which is the actual goal.

All code is Java, written LeetCode-style (assume it sits inside `class Solution { ... }`, with `import java.util.*;` available). Every solution in this file was compiled and run against the stated examples before being written down — not just hand-traced.

**Contents**
1. [What Is Dynamic Programming, Really?](#1-what-is-dynamic-programming-really)
2. [Recursion Refresher — Why Naive Recursion Explodes](#2-recursion-refresher--why-naive-recursion-explodes)
3. [The Universal 5-Step DP Framework](#3-the-universal-5-step-dp-framework)
4. [Top-Down vs Bottom-Up (and Space Optimization)](#4-top-down-vs-bottom-up-and-space-optimization)
5. [What Makes a Problem "1-D"?](#5-what-makes-a-problem-1-d)
6. [Worked Problems, Easy → Hard](#6-worked-problems-easy--hard)
7. [The Three Combinators — Your Pattern-Recognition Shortcut](#7-the-three-combinators--your-pattern-recognition-shortcut)
8. [Signal-Words Cheat Sheet](#8-signal-words-cheat-sheet)
9. [Common Mistakes & Pitfalls](#9-common-mistakes--pitfalls)
10. [Quick-Reference Table](#10-quick-reference-table)
11. [Practice List — More Problems to Try Solo](#11-practice-list--more-problems-to-try-solo)
12. [What's Next](#12-whats-next)

---

## 1. What Is Dynamic Programming, Really?

Strip away the mystique and DP is just this: **recursion, plus a memory.**

You already know how to solve problems recursively — break a problem into smaller versions of itself, solve those, combine the answers. DP starts exactly there. The only new idea is: *if you're about to solve a smaller subproblem you've already solved before, don't — just look up the answer.*

That's it. That's the whole trick. The hard part is never "what is DP" — it's recognizing *when* a problem qualifies, and *how* to define the subproblems cleanly. This guide is mostly about that.

For a problem to be a genuine DP problem, it needs two properties:

**Optimal substructure** — the optimal answer to the full problem can be built directly from optimal answers to its subproblems. If the best way to rob a street of houses depends on the best way to rob a shorter street, that's optimal substructure. Most recursive problems have this; it's necessary but not sufficient.

**Overlapping subproblems** — a plain recursive solution ends up solving the *exact same* subproblem many times over. This is the property that actually makes memoization pay off. Contrast this with merge sort: it's recursive, and it has optimal substructure, but the left half and right half of an array never overlap — there's nothing to cache, so "memoizing" merge sort buys you nothing. That's why merge sort is divide-and-conquer, not DP. DP is the special case of divide-and-conquer where the pieces you're dividing into keep colliding with each other.

Fibonacci is the cleanest possible illustration, so it's worth burning into memory: computing `fib(5)` recursively needs `fib(4)` and `fib(3)`. Computing `fib(4)` needs `fib(3)` and `fib(2)` — and there's `fib(3)` again. Keep expanding and `fib(3)` gets recomputed, `fib(2)` gets recomputed even more, and so on. Optimal substructure (`fib(n) = fib(n-1) + fib(n-2)`, clearly built from smaller optimal answers) plus overlapping subproblems (`fib(3)`, `fib(2)`, `fib(1)` all get solved repeatedly) — a textbook DP problem, and the one nearly every course starts with, for good reason.

One more contrast worth having ready: **greedy algorithms** also make a sequence of choices, but they commit to the locally-best choice at each step and never look back. That's fast, but it's only *correct* when the problem has a special structure (the "greedy-choice property") that guarantees local optimality leads to global optimality. DP doesn't take that risk — it effectively considers every choice, it just avoids redoing work through caching. That's why DP is the safer default, and greedy is the optimization you reach for once you've proven (or strongly suspect) it applies. You'll see this exact tension later in Jump Game.

---

## 2. Recursion Refresher — Why Naive Recursion Explodes

Skip this section if recursion already feels natural — but if DP has felt shaky, it's usually because this part was shaky first.

Every recursive function has two parts:
- A **base case**: an input small/simple enough to answer directly, no further recursion needed.
- A **recursive case**: expresses the answer in terms of the same function called on a *smaller* input, guaranteed to eventually hit the base case.

```java
static int fib(int n) {
    if (n <= 1) return n;              // base case
    return fib(n - 1) + fib(n - 2);    // recursive case
}
```

Trace `fib(5)` by hand and draw the call tree: `fib(5)` calls `fib(4)` and `fib(3)`. `fib(4)` calls `fib(3)` and `fib(2)` — notice `fib(3)` has now been requested twice, as a *completely separate* subtree that gets fully recomputed from scratch. Keep expanding and `fib(2)` gets requested 3 times, `fib(1)` five times, each recomputed independently. The tree roughly doubles in size with each unit increase in `n`, giving **O(2ⁿ)** time — for `fib(40)` that's over a trillion calls, for a value you could compute in 40 additions.

The fix is obvious once you see the picture: the tree is wide because it's a tree — the *same* `fib(3)` subtree is drawn out twice, as if it were unknown territory both times. If the first time you compute `fib(3)` you write the answer down, the second request becomes a lookup instead of a recomputation. That single idea — **store, then look up before recomputing** — is 90% of dynamic programming. The other 10% is figuring out exactly what to store and how to index it, which is what the framework in Section 3 gives you a repeatable way to do.

---

## 3. The Universal 5-Step DP Framework

Use these five steps, in order, on every DP problem you meet. Say them out loud in an interview — it signals you're not pattern-matching from memory, you're deriving.

**Step 1 — Recognize.** Ask: does the problem ask for an optimal value (min/max), a count (number of ways), or a yes/no reachability ("can you achieve X")? And does the natural recursive breakdown revisit the same subproblems? If both hold, it's DP.

**Step 2 — Define the state.** This is the step people rush and regret. Ask: *what is the minimum set of variables that, once fixed, fully determines the answer to a subproblem?* For 1-D DP, that's usually a single index — "the first `i` elements," "up to position `i`," or "for target value `i`." Write it as a sentence before writing any code: *"`dp[i]` = the [min cost / max value / number of ways / can-I-do-it] for [precise description involving i]."* If you can't write that sentence precisely, you're not ready to write the recurrence.

**Step 3 — Find the recurrence.** Ask: *if I already knew the answer to every smaller subproblem, how would I combine them to answer `dp[i]`?* This almost always comes from asking "what's the *last* decision made to arrive at state `i`?" — last step climbed (1 or 2?), last house robbed or skipped, last coin used, last word matched. Enumerate the choices at that last step, and combine their outcomes (more on exactly how to combine in Section 7).

**Step 4 — Base case(s).** What's the smallest, self-evidently-correct instance — `dp[0]` or `dp[1]` — that doesn't rely on the recurrence? Get this wrong and every other value silently inherits the error.

**Step 5 — Order of computation, then implement.** Decide top-down (memoized recursion) or bottom-up (iterative table-filling) — Section 4 covers the trade-off — then write it. Once it works, ask whether you actually need the *entire* table in memory, or just the last few entries (space optimization, also in Section 4).

Internalize these five and "how do I even start" stops being the hard part of a new DP problem — the hard part becomes correctly executing Steps 2 and 3, which is exactly what practice across varied problems builds.

---

## 4. Top-Down vs Bottom-Up (and Space Optimization)

Both approaches implement the *same* recurrence — they only differ in which direction they fill in the table.

**Top-down (memoization):** write the natural recursive solution first, then add a cache. Before doing real work, check whether this exact input has been solved before; if so, return the cached answer instead of recursing further.

```java
static int fibMemo(int n, int[] memo) {
    if (n <= 1) return n;
    if (memo[n] != -1) return memo[n];          // already solved — just look it up
    memo[n] = fibMemo(n - 1, memo) + fibMemo(n - 2, memo);
    return memo[n];
}
```

**Bottom-up (tabulation):** skip recursion entirely. Start from the base case(s) and iteratively fill a table in the order that guarantees every value you need has already been computed.

```java
static int fibTab(int n) {
    if (n <= 1) return n;
    int[] dp = new int[n + 1];
    dp[0] = 0; dp[1] = 1;
    for (int i = 2; i <= n; i++) dp[i] = dp[i - 1] + dp[i - 2];
    return dp[n];
}
```

Both run in O(n) time — the cache guarantees each subproblem is solved exactly once either way. So which do you reach for?

- **Top-down** mirrors how you *think* about the recursive breakdown, so it's often the fastest path from "I understand the recurrence" to "I have working code" — especially when the recursion isn't a clean straight line (Word Break and Decode Ways read very naturally top-down). The cost: real recursion, so real call-stack depth, which risks a `StackOverflowError` in Java on large inputs (tens of thousands of levels deep) — a genuinely common way to fail an otherwise-correct interview solution on a large test case.
- **Bottom-up** avoids recursion overhead and stack-depth risk entirely, and makes the next optimization — space reduction — much more mechanical to see and apply. Most interviewers consider bottom-up the "complete" answer for 1-D DP; many will ask you to convert a memoized solution to tabulation as a follow-up.

**Space optimization.** Look at the recurrence and ask: to compute `dp[i]`, how far back do I ever look? Fibonacci only ever looks at `dp[i-1]` and `dp[i-2]` — the entire rest of the array, `dp[0]` through `dp[i-3]`, is dead weight the moment `dp[i]` is computed. So don't keep an array at all — keep two rolling variables:

```java
static int fibOpt(int n) {
    if (n <= 1) return n;
    int prev2 = 0, prev1 = 1;
    for (int i = 2; i <= n; i++) {
        int curr = prev1 + prev2;
        prev2 = prev1;
        prev1 = curr;
    }
    return prev1;
}
```

This drops space from O(n) to O(1) without changing the logic at all — same recurrence, same base cases, just a smaller memory footprint. Whenever `dp[i]` only depends on the last `k` states, you only ever need `k` variables. You'll see this pattern in almost every problem below.

---

## 5. What Makes a Problem "1-D"?

A DP problem is "1-D" when its state can be fully captured by **one** changing quantity — most often a position/index into an array or string (`dp[i]` = "considering elements up to index `i`"), sometimes a target numeric value instead (`dp[amount]`, `dp[n]`). Visually: the DP table is a single row of boxes, and each box's value depends on a small, fixed set of boxes to its left.

That's the whole test. If you can answer "what does `dp[i]` mean?" with a sentence that only ever mentions **one** varying index, you're in 1-D-land, and everything in this file applies directly.

(Quick preview of what changes later: **2-D DP**, the next file in this series, is what you need the moment the state needs *two* independent varying quantities at once — two pointers into two different strings for Longest Common Subsequence or Edit Distance, or "index so far" *and* "remaining budget" for Knapsack-style problems. The table becomes a grid, `dp[i][j]`, instead of a row. Everything you learn here — the 5-step framework, top-down/bottom-up, space optimization — carries over unchanged; only the *shape* of the table grows by one dimension.)

---

## 6. Worked Problems, Easy → Hard

Structure for each problem: **Approach** (state → recurrence → base case, i.e., the framework applied), **Code**, a short **Walkthrough**, and **Interview notes**.

### 6.1 Climbing Stairs (LeetCode 70) — and the Fibonacci connection

You're climbing `n` stairs; each step you take 1 or 2 stairs at a time. How many distinct ways to reach the top?

**Approach.**
- *State:* `dp[i]` = number of distinct ways to reach step `i`.
- *Recurrence:* the last move to reach step `i` was either a single step from `i-1`, or a double step from `i-2` — so `dp[i] = dp[i-1] + dp[i-2]`. (Notice: this is exactly the Fibonacci recurrence. Climbing Stairs *is* Fibonacci wearing a word problem as a disguise — seeing that instantly is the single highest-value pattern-match in this entire section.)
- *Base case:* `dp[0] = 1` (one way to "be" at the ground: do nothing), `dp[1] = 1` (one way to reach step 1: a single step).

**Code** (progression: brute force → memoized → tabulated → space-optimized, shown once here since every later problem follows the same transformation without repeating all four versions):

```java
// Brute force — O(2^n) time, mirrors the recurrence directly
static int climbStairsBrute(int n) {
    if (n <= 1) return 1;
    return climbStairsBrute(n - 1) + climbStairsBrute(n - 2);
}

// Top-down memoization — O(n) time, O(n) space (+ recursion stack)
static int climbStairsMemo(int n, int[] memo) {
    if (n <= 1) return 1;
    if (memo[n] != -1) return memo[n];
    memo[n] = climbStairsMemo(n - 1, memo) + climbStairsMemo(n - 2, memo);
    return memo[n];
}

// Bottom-up tabulation — O(n) time, O(n) space, no recursion
static int climbStairsTab(int n) {
    if (n <= 1) return 1;
    int[] dp = new int[n + 1];
    dp[0] = 1; dp[1] = 1;
    for (int i = 2; i <= n; i++) dp[i] = dp[i - 1] + dp[i - 2];
    return dp[n];
}

// Space-optimized — O(n) time, O(1) space
static int climbStairsOpt(int n) {
    if (n <= 1) return 1;
    int prev2 = 1, prev1 = 1;
    for (int i = 2; i <= n; i++) {
        int curr = prev1 + prev2;
        prev2 = prev1;
        prev1 = curr;
    }
    return prev1;
}
```

**Walkthrough.** `n = 5`: `dp = [1, 1, 2, 3, 5, 8]`. `dp[5] = dp[4] + dp[3] = 5 + 3 = 8` — matches: 1+1+1+1+1, 2+1+1+1 (in every arrangement), 2+2+1 (in every arrangement), all correctly counted as 8 distinct sequences.

**Interview notes.** Time/space: O(n) / O(1) optimized. Common follow-up: "what if you can climb 1, 2, *or* 3 steps at a time?" — the framework extends immediately: `dp[i] = dp[i-1] + dp[i-2] + dp[i-3]`, same base-case logic, just one more rolling variable.

---

### 6.2 Min Cost Climbing Stairs (LeetCode 746)

Array `cost[]`; you may start at index 0 or index 1 for free, and from step `i` you may climb 1 or 2 steps, paying `cost[i]` whenever you land on step `i`. Find the minimum cost to reach just past the last step.

**Approach.**
- *State:* `dp[i]` = min cost to *reach* step `i` (arrive there — not counting whatever `cost[i]` would additionally cost to leave from it). Being precise about "reach" vs. "leave from" here is exactly the kind of ambiguity that trips people up — say your definition out loud before coding.
- *Recurrence:* to reach step `i`, you arrived either from `i-1` (paying `cost[i-1]`) or from `i-2` (paying `cost[i-2]`) — take the cheaper: `dp[i] = min(dp[i-1] + cost[i-1], dp[i-2] + cost[i-2])`.
- *Base case:* `dp[0] = 0`, `dp[1] = 0` — both starting points are free, by problem statement.

**Code** (space-optimized directly — by now the tabulation step is routine):

```java
static int minCostClimbingStairs(int[] cost) {
    int n = cost.length;
    int prev2 = 0, prev1 = 0;              // dp[0], dp[1]
    for (int i = 2; i <= n; i++) {
        int curr = Math.min(prev1 + cost[i - 1], prev2 + cost[i - 2]);
        prev2 = prev1;
        prev1 = curr;
    }
    return prev1;                           // dp[n] = cost to reach just past the top
}
```

**Walkthrough.** `cost = [10, 15, 20]`: `dp[0]=0, dp[1]=0`. `dp[2] = min(dp[1]+cost[1], dp[0]+cost[0]) = min(15, 10) = 10`... wait — let's be exact: `dp[2] = min(0+15, 0+10) = 10`? No — check both options: from step 1 costs `dp[1]+cost[1]=0+15=15`; from step 0 costs `dp[0]+cost[0]=0+10=10`. So `dp[2]=10`. `dp[3] = min(dp[2]+cost[2], dp[1]+cost[1]) = min(10+20, 0+15) = 15`. Answer: 15 — matches the known expected output (start at step 1 for free, pay 15, jump straight to the top).

**Interview notes.** O(n) time, O(1) space. The recurring trap on this exact problem: candidates often index off-by-one on `cost[i-1]` vs `cost[i]`, because "cost to reach `i`" and "cost of `i` itself" get mentally merged. Writing the state sentence explicitly (as above) heads this off.

---

### 6.3 House Robber (LeetCode 198)

Array of non-negative integers = money in each house, houses in a row. You can't rob two adjacent houses. Maximize total money robbed.

**Approach.**
- *State:* `dp[i]` = max money robbable considering the first `i` houses.
- *Recurrence:* for house `i` (1-indexed into the state, `nums[i-1]` in the array), you either skip it (`dp[i-1]`) or rob it — in which case you *must* have skipped house `i-1`, so you add to `dp[i-2]`: `dp[i] = max(dp[i-1], dp[i-2] + nums[i-1])`.
- *Base case:* `dp[0] = 0` (no houses, nothing to rob), `dp[1] = nums[0]` (only one house — rob it).

**Code:**

```java
static int rob(int[] nums) {
    int prev2 = 0, prev1 = 0;               // dp[0], dp[1] before seeing any house
    for (int num : nums) {
        int curr = Math.max(prev1, prev2 + num);
        prev2 = prev1;
        prev1 = curr;
    }
    return prev1;
}
```

**Walkthrough.** `nums = [2,7,9,3,1]`. Rolling through: after 2 → best is 2; after 7 → best is max(2,7)=7; after 9 → max(7, 2+9)=11; after 3 → max(11, 7+3)=11; after 1 → max(11, 11+1)=12. Answer 12 — matches (rob houses worth 2, 9, and 1: 2+9+1=12).

**Interview notes.** O(n) time, O(1) space. This "take it and skip the neighbor, or leave it" shape is one of the most-recycled DP shapes in interviews — you'll meet it again, lightly disguised, in Delete and Earn (practice list, Section 11). Recognizing the disguise is worth more than memorizing this exact code.

---

### 6.4 House Robber II (LeetCode 213)

Same as above, but the houses are arranged in a **circle** — the first and last houses are now adjacent too.

**Approach.** The one new idea here isn't a new recurrence — it's a *reduction*: since house 0 and house n-1 can't both be robbed, the answer is the better of two linear House-Robber subproblems: rob houses `[0, n-2]` (excluding the last house), or rob houses `[1, n-1]` (excluding the first house). Whichever of those two you pick, the "circle" constraint is automatically satisfied, because each candidate answer physically excludes one of the two houses that made it circular in the first place.

**Code:**

```java
static int robCircular(int[] nums) {
    int n = nums.length;
    if (n == 1) return nums[0];             // a single house has no neighbor conflict at all
    return Math.max(robLinear(nums, 0, n - 2), robLinear(nums, 1, n - 1));
}

static int robLinear(int[] nums, int start, int end) {
    int prev2 = 0, prev1 = 0;
    for (int i = start; i <= end; i++) {
        int curr = Math.max(prev1, prev2 + nums[i]);
        prev2 = prev1;
        prev1 = curr;
    }
    return prev1;
}
```

**Walkthrough.** `nums = [2,3,2]`: option A = rob(indices 0..1) = rob([2,3]) = 3; option B = rob(indices 1..2) = rob([3,2]) = 3. Max = 3 — matches (robbing just house index 1, worth 3, since robbing both 0 and 2 isn't allowed — they're adjacent in the circle).

**Interview notes.** The `n == 1` special case matters — without it, both `robLinear` calls degrade to empty ranges and silently return 0 instead of `nums[0]`. More generally: **the reduction technique itself is the reusable interview move.** Whenever a problem adds a circular/wraparound constraint on top of something you already know how to solve linearly, ask "can I break the circle at one point and reduce to (one or two) linear subproblems?" — it works here, and it works again in Maximum Sum Circular Subarray (Section 11).

---

### 6.5 Maximum Subarray — Kadane's Algorithm (LeetCode 53)

Find the contiguous subarray with the largest sum.

**Approach.**
- *State:* `dp[i]` = max sum of a contiguous subarray that **ends exactly at index `i`** (not "the best subarray somewhere in the first `i` elements" — specifically one that ends at `i`; this precision matters for the recurrence to work).
- *Recurrence:* a subarray ending at `i` either extends the best subarray ending at `i-1` (`dp[i-1] + nums[i]`), or abandons everything before it and starts fresh at `i` (`nums[i]` alone) — whichever is bigger: `dp[i] = max(nums[i], dp[i-1] + nums[i])`. The final answer is the max over *all* `dp[i]`, not just `dp[n-1]`, since the best subarray might end anywhere.
- *Base case:* `dp[0] = nums[0]`.

**Code** (already O(1) space — each `dp[i]` only ever needs `dp[i-1]`):

```java
static int maxSubArray(int[] nums) {
    int currMax = nums[0], globalMax = nums[0];
    for (int i = 1; i < nums.length; i++) {
        currMax = Math.max(nums[i], currMax + nums[i]);
        globalMax = Math.max(globalMax, currMax);
    }
    return globalMax;
}
```

**Walkthrough.** `nums = [-2,1,-3,4,-1,2,1,-5,4]`. `currMax` walks: -2, 1, -2, 4, 3, 5, 6, 1, 5. `globalMax` peaks at 6 (subarray `[4,-1,2,1]`) — matches the known answer.

**Interview notes.** O(n) time, O(1) space — Kadane's is a nice proof that not every DP solution needs a visible array; the recurrence is still DP even when you never materialize `dp[]` at all. Frequent follow-up: return the *subarray itself*, not just its sum — track a running start index that resets whenever you restart at `nums[i]`, and a saved `(start, end)` pair whenever `globalMax` updates.

**Bonus connection — Best Time to Buy and Sell Stock I (LeetCode 121):** given daily prices, maximize profit from one buy and one sell. The standard solution tracks a running minimum price and the best profit against it:

```java
static int maxProfit(int[] prices) {
    int minSoFar = prices[0], best = 0;
    for (int i = 1; i < prices.length; i++) {
        best = Math.max(best, prices[i] - minSoFar);
        minSoFar = Math.min(minSoFar, prices[i]);
    }
    return best;
}
```

Here's the connection worth having in your back pocket: if you build an array of **day-over-day price changes** (`diffs[i] = prices[i] - prices[i-1]`), then the best single buy-sell profit is *exactly* the maximum subarray sum of `diffs` (clamped at 0, since you can always choose not to trade). Buying low and selling high later is the same thing as capturing the biggest run of positive daily changes in a row — which is precisely what Kadane's algorithm finds. Verified: both formulations give profit 5 on `prices = [7,1,5,3,6,4]`. Interviewers like this connection specifically because it tests whether you can *transfer* a pattern to a differently-worded problem, not just recall code.

---

### 6.6 Maximum Product Subarray (LeetCode 152)

Find the contiguous subarray with the largest **product**.

**Approach.** Addition is monotonic — adding a bigger number always helps. Multiplication isn't: multiplying by a negative number *flips* the ranking, turning your best-so-far into your worst-so-far and vice versa. So one running value isn't enough.
- *State:* two parallel values ending at index `i` — `maxProd[i]` (largest product of a subarray ending at `i`) and `minProd[i]` (smallest / most negative). The state is still governed by a single index `i`, so this is still 1-D DP — it just tracks two numbers per index instead of one.
- *Recurrence:* at each step, the new max/min could come from three places: `nums[i]` alone (restart), `maxProd[i-1] * nums[i]`, or `minProd[i-1] * nums[i]` (this last one is the one that matters when `nums[i]` is negative, since multiplying the *previous minimum* by a negative number can produce the new maximum). Take the max and min across all three candidates.
- *Base case:* `maxProd[0] = minProd[0] = nums[0]`.

**Code:**

```java
static int maxProduct(int[] nums) {
    int maxProd = nums[0], minProd = nums[0], result = nums[0];
    for (int i = 1; i < nums.length; i++) {
        int curr = nums[i];
        int candMax = Math.max(curr, Math.max(maxProd * curr, minProd * curr));
        int candMin = Math.min(curr, Math.min(maxProd * curr, minProd * curr));
        maxProd = candMax;
        minProd = candMin;
        result = Math.max(result, maxProd);
    }
    return result;
}
```

**Walkthrough.** `nums = [-2,3,-4]`. Start: maxProd=minProd=result=-2. `i=1 (3)`: candidates from `{3, -2*3=-6, -2*3=-6}` → max=3, min=-6; result=3. `i=2 (-4)`: candidates from `{-4, 3*-4=-12, -6*-4=24}` → max=24, min=-12; result=24. Final answer 24 — matches (the whole array: `-2 × 3 × -4 = 24`; the double negative is exactly why tracking the running *minimum* mattered).

**Interview notes.** O(n) time, O(1) space. The generalizable lesson here matters more than this specific problem: **whenever an operation you're folding over isn't monotonic, ask whether "best so far" is enough, or whether "worst so far" might flip into "best so far" one step later.** That question recurs anywhere signs, parities, or other flips are in play.

---

### 6.7 Longest Increasing Subsequence (LeetCode 300)

Find the length of the longest strictly increasing subsequence (not necessarily contiguous).

**Approach.**
- *State:* `dp[i]` = length of the longest increasing subsequence that **ends exactly at index `i`**.
- *Recurrence:* look at every earlier index `j < i`. If `nums[j] < nums[i]`, then `nums[i]` could extend whatever subsequence ends at `j`: `dp[i] = max(dp[i], dp[j] + 1)` for every valid `j`. This is the one problem in this section where `dp[i]` depends on *all* earlier states, not just the last one or two — that's what pushes the recurrence itself into an inner loop, and the whole algorithm to O(n²).
- *Base case:* every `dp[i]` starts at 1 (a single element is trivially an increasing subsequence of length 1).

**Code:**

```java
static int lengthOfLIS(int[] nums) {
    int n = nums.length;
    int[] dp = new int[n];
    Arrays.fill(dp, 1);
    int maxLen = 1;
    for (int i = 1; i < n; i++) {
        for (int j = 0; j < i; j++) {
            if (nums[j] < nums[i]) dp[i] = Math.max(dp[i], dp[j] + 1);
        }
        maxLen = Math.max(maxLen, dp[i]);
    }
    return maxLen;
}
```

**Walkthrough.** `nums = [10,9,2,5,3,7,101,18]`. Final `dp = [1,1,1,2,2,3,4,4]` — e.g. `dp[5]=3` for `[2,5,7]` (or `[2,3,7]`); `dp[6]=4` for `[2,5,7,101]`. `maxLen = 4` — matches the known answer (`[2,3,7,101]` or `[2,3,7,18]`, both length 4).

**Interview notes.** O(n²) time, O(n) space — this is "the version you should be able to derive from first principles," and most interviewers are satisfied here. If asked "can you do better?", that's your cue for the classic **O(n log n)** technique (patience sorting): maintain an array `tails` where `tails[k]` is the smallest possible tail value among all increasing subsequences of length `k+1` found so far; for each new number, binary-search for where it belongs in `tails` and overwrite that slot (keeping every prefix as "loose" as possible, maximizing room for future growth), extending `tails` only when the number is bigger than everything seen. The final size of `tails` is the answer.

```java
static int lengthOfLIS_NLogN(int[] nums) {
    int[] tails = new int[nums.length];
    int size = 0;
    for (int num : nums) {
        int lo = 0, hi = size;
        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (tails[mid] < num) lo = mid + 1; else hi = mid;
        }
        tails[lo] = num;
        if (lo == size) size++;
    }
    return size;
}
```

Be honest with yourself (and an interviewer) about what this is: a greedy-plus-binary-search technique that happens to solve the same problem, not a direct optimization of the DP recurrence above — `tails` doesn't mean "the LIS ending at position `i`" the way `dp[i]` did. Know that it exists and roughly why it works; lead with the O(n²) DP as your primary, provably-correct answer.

---

### 6.8 Word Break (LeetCode 139)

Given a string `s` and a dictionary of words, can `s` be segmented into a space-separated sequence of one or more dictionary words?

**Approach.**
- *State:* `dp[i]` = true if the prefix `s[0..i)` (the first `i` characters) can be fully segmented into dictionary words.
- *Recurrence:* `dp[i]` is true if there's *some* earlier cut point `j < i` where `dp[j]` is already true, *and* the remaining piece `s[j..i)` is itself a dictionary word.
- *Base case:* `dp[0] = true` — the empty prefix is trivially "segmented" (zero words needed).

**Code:**

```java
static boolean wordBreak(String s, List<String> wordDict) {
    Set<String> dict = new HashSet<>(wordDict);
    int n = s.length();
    boolean[] dp = new boolean[n + 1];
    dp[0] = true;
    for (int i = 1; i <= n; i++) {
        for (int j = 0; j < i; j++) {
            if (dp[j] && dict.contains(s.substring(j, i))) {
                dp[i] = true;
                break;
            }
        }
    }
    return dp[n];
}
```

**Walkthrough.** `s = "leetcode"`, `dict = {"leet","code"}`. `dp[4]` becomes true via `j=0`: `dp[0]` true and `s[0..4)="leet"` is in the dictionary. `dp[8]` becomes true via `j=4`: `dp[4]` true and `s[4..8)="code"` is in the dictionary. `dp[8] = true` — correctly segmentable as "leet code".

**Interview notes.** The DP loop itself is O(n²), but don't stop there under questioning: `s.substring(j, i)` allocates and copies a new string (O(length) in Java), and the `HashSet` lookup hashes it (also O(length)) — so the honest worst-case is closer to **O(n³)** (or O(n² · L) if you instead check membership against dictionary words directly, where L is the longest word). Mentioning this unprompted is a strong signal of depth. Common follow-up: return *every* valid segmentation, not just whether one exists — that's Word Break II, which layers backtracking on top, using this exact `dp` array to prune branches that can't possibly lead anywhere (no point trying to segment further from position `i` if `dp[i]` is false).

---

### 6.9 Decode Ways (LeetCode 91)

A string of digits encodes a message where `'A'`→1, `'B'`→2, ..., `'Z'`→26. Count the number of ways to decode it.

**Approach.**
- *State:* `dp[i]` = number of ways to decode the prefix `s[0..i)`.
- *Recurrence:* the last decoded "letter" ending at position `i` was either a single digit or two digits. If `s[i-1]` (the single last digit) is non-zero, it's a valid single-letter decode, contributing `dp[i-1]`. If the two-digit number formed by `s[i-2..i)` falls in `[10, 26]`, that's a valid two-letter decode, contributing `dp[i-2]`. Both can be valid at once (add both).
- *Base case:* `dp[0] = 1` (empty prefix, one trivial way), `dp[1] = 1` if `s[0] != '0'` else the whole string is undecodable.

**Code:**

```java
static int numDecodings(String s) {
    int n = s.length();
    if (s.charAt(0) == '0') return 0;
    int[] dp = new int[n + 1];
    dp[0] = 1; dp[1] = 1;
    for (int i = 2; i <= n; i++) {
        char first = s.charAt(i - 2), second = s.charAt(i - 1);
        if (second != '0') dp[i] += dp[i - 1];
        int twoDigit = (first - '0') * 10 + (second - '0');
        if (twoDigit >= 10 && twoDigit <= 26) dp[i] += dp[i - 2];
    }
    return dp[n];
}
```

**Walkthrough.** `s = "226"`. `dp[0]=1, dp[1]=1`. `i=2` ("22"): second='2'≠'0' → `dp[2]+=dp[1]=1`; twoDigit=22 valid → `dp[2]+=dp[0]=1`; `dp[2]=2`. `i=3` ("226", looking at last two chars "26"): second='6'≠'0' → `dp[3]+=dp[2]=2`; twoDigit=26 valid → `dp[3]+=dp[1]=1`; `dp[3]=3`. Matches: "2-2-6", "22-6", "2-26" are the three valid decodings.

**Interview notes.** This problem is almost entirely edge cases, not algorithm design — that's exactly why it's popular. `'0'` is the recurring trap: it's not a valid single-digit decode on its own (there's no letter for 0), but it *is* a valid second digit of a two-digit decode (10 and 20 are valid). Say your two conditions out loud before coding, exactly as stated above — "second digit nonzero" and "two-digit value between 10 and 26" — because silently getting either backwards is the single most common way candidates fail this one.

---

### 6.10 Coin Change (LeetCode 322)

Given coin denominations (unlimited supply of each) and a target `amount`, find the fewest coins that sum to `amount`, or `-1` if impossible.

**Approach.**
- *State:* `dp[a]` = minimum number of coins to make amount `a`.
- *Recurrence:* for each coin denomination `≤ a`, using one of that coin means the rest must be made from `a - coin`: `dp[a] = min over all usable coins of (dp[a - coin] + 1)`.
- *Base case:* `dp[0] = 0` (zero coins needed to make amount 0).

**Code:**

```java
static int coinChange(int[] coins, int amount) {
    int[] dp = new int[amount + 1];
    Arrays.fill(dp, amount + 1);           // sentinel standing in for "infinity" / unreachable
    dp[0] = 0;
    for (int a = 1; a <= amount; a++) {
        for (int coin : coins) {
            if (coin <= a) dp[a] = Math.min(dp[a], dp[a - coin] + 1);
        }
    }
    return dp[amount] > amount ? -1 : dp[amount];
}
```

**Walkthrough.** `coins = [1,2,5]`, `amount = 11`. `dp[11] = 3` (5+5+1) — matches. The sentinel value `amount + 1` works as "infinity" because no valid answer can ever legitimately reach that high (the worst case, using only 1-coins, is exactly `amount` coins) — so anything still sitting at the sentinel after the loop is genuinely unreachable.

**Interview notes.** O(amount × number of coins) time, O(amount) space. Notice the shape: each coin can be reused without limit — this is **unbounded knapsack**, wearing 1-D clothing (state is just the remaining amount; the "which coins are left to consider" dimension collapses away because reuse is unlimited). Keep this shape in mind for the very next problem.

---

### 6.11 Coin Change II (LeetCode 518)

Same coins and amount, but now count the **number of distinct combinations** that make up `amount` (order doesn't matter — `[1,2]` and `[2,1]` are the same combination, counted once).

**Approach.**
- *State:* `dp[a]` = number of combinations of coins (processed so far) that sum to `a`.
- *Recurrence:* `dp[a] += dp[a - coin]` for the coin currently being processed.
- *Base case:* `dp[0] = 1` (exactly one way to make amount 0: use no coins).

**Code — and the detail that makes or breaks this problem:**

```java
static int change(int amount, int[] coins) {
    int[] dp = new int[amount + 1];
    dp[0] = 1;
    for (int coin : coins) {                     // COIN is the OUTER loop
        for (int a = coin; a <= amount; a++) {    // amount is the inner loop
            dp[a] += dp[a - coin];
        }
    }
    return dp[amount];
}
```

**Walkthrough.** `amount = 5`, `coins = [1,2,5]`. After processing coin `1`: `dp = [1,1,1,1,1,1]` (only one way to make any amount using just 1s). After processing coin `2`: `dp = [1,1,2,2,3,3]` (now `2` can also contribute — e.g. `dp[4]` becomes 2: `{1,1,1,1}` and `{1,1,2}` — order doesn't matter, so `{1,2,1}` isn't counted again). After processing coin `5`: `dp[5] = 3 + dp[0] = 4`. Final answer 4 — matches: `{5}`, `{1,2,2}`, `{1,1,1,2}`, `{1,1,1,1,1}`.

**Interview notes.** This is **the** classic iteration-order trap in all of counting DP, so it earns its own callout. Compare against Combination Sum IV (LeetCode 377) — same array shape, same-looking recurrence, but it counts *permutations* (order matters — `[1,2]` and `[2,1]` are counted separately), and the fix is to simply **swap the loop order**: amount outer, coin inner.

```java
// Combination Sum IV shape — counts permutations, not combinations, on the same inputs
static int combinationSum4(int[] nums, int target) {
    int[] dp = new int[target + 1];
    dp[0] = 1;
    for (int a = 1; a <= target; a++) {          // amount is the OUTER loop this time
        for (int num : nums) {                    // coin/num is the inner loop
            if (num <= a) dp[a] += dp[a - num];
        }
    }
    return dp[target];
}
```

Run both against `amount=5, coins=[1,2,5]` and you get *different, both-correct-for-their-own-question* answers (4 combinations vs. more permutations) — same code shape, no compiler error, no crash, just a silently wrong answer to whichever question you actually meant to answer. The rule to internalize: **outer loop = coin (item), inner loop = amount → combinations. Outer loop = amount, inner loop = coin → permutations.** Always sanity-check a counting DP against a small hand-traceable example before trusting it — this exact bug produces no symptom except a wrong final number.

---

### 6.12 Perfect Squares (LeetCode 279)

Given `n`, find the least number of perfect square numbers (1, 4, 9, 16, ...) that sum to `n`.

**Approach.**
- *State:* `dp[i]` = minimum number of perfect squares summing to `i`.
- *Recurrence:* for every perfect square `j*j ≤ i`, using one of it means the rest must sum from `i - j*j`: `dp[i] = min over valid j of (dp[i - j*j] + 1)`.
- *Base case:* `dp[0] = 0`.

**Code:**

```java
static int numSquares(int n) {
    int[] dp = new int[n + 1];
    Arrays.fill(dp, Integer.MAX_VALUE);
    dp[0] = 0;
    for (int i = 1; i <= n; i++) {
        for (int j = 1; j * j <= i; j++) {
            dp[i] = Math.min(dp[i], dp[i - j * j] + 1);
        }
    }
    return dp[n];
}
```

**Walkthrough.** `n = 12`. `dp[8] = 2` (4+4), `dp[9] = 1` (9 itself), `dp[12] = min(dp[11]+1, dp[8]+1, dp[3]+1) = min(4, 3, 4) = 3` (4+4+4) — matches the known answer.

**Interview notes.** O(n·√n) time, O(n) space. Notice this is **structurally identical** to Coin Change — the "coins" here are simply the perfect squares up to `n`, and the combinator is the same MIN. If you can see that equivalence within a few seconds of reading the problem, you've genuinely internalized the unbounded-knapsack-shaped 1-D pattern, which is exactly the goal of grouping these two problems together.

---

### 6.13 Jump Game I & II (LeetCode 55 & 45)

**Jump Game I:** `nums[i]` is the max jump length from index `i`. Starting at index 0, can you reach the last index?
**Jump Game II:** same setup (guaranteed reachable) — find the *minimum* number of jumps to reach the last index.

**Approach (Jump Game I).**
- *State:* `dp[i]` = true if index `i` is reachable from the start.
- *Recurrence:* `dp[i]` is true if there's some earlier reachable index `j` whose jump range reaches at least to `i`: `dp[i] = true` if `∃ j < i` with `dp[j]` true and `j + nums[j] ≥ i`.
- *Base case:* `dp[0] = true`.

```java
static boolean canJump(int[] nums) {
    int n = nums.length;
    boolean[] dp = new boolean[n];
    dp[0] = true;
    for (int i = 1; i < n; i++) {
        for (int j = 0; j < i; j++) {
            if (dp[j] && j + nums[j] >= i) { dp[i] = true; break; }
        }
    }
    return dp[n - 1];
}
```

**Approach (Jump Game II).** Same reachability idea, but now minimizing jump count instead of asking yes/no:
- *State:* `dp[i]` = minimum jumps to reach index `i`.
- *Recurrence:* `dp[i] = min over all reachable j < i of (dp[j] + 1)`.
- *Base case:* `dp[0] = 0`.

```java
static int jump(int[] nums) {
    int n = nums.length;
    int[] dp = new int[n];
    Arrays.fill(dp, Integer.MAX_VALUE);
    dp[0] = 0;
    for (int i = 1; i < n; i++) {
        for (int j = 0; j < i; j++) {
            if (dp[j] != Integer.MAX_VALUE && j + nums[j] >= i) {
                dp[i] = Math.min(dp[i], dp[j] + 1);
            }
        }
    }
    return dp[n - 1];
}
```

**Walkthrough.** `nums = [2,3,1,1,4]`. Jump Game I: `dp = [T,T,T,T,T]` → true (reachable). Jump Game II: `dp = [0,1,1,2,2]` → `dp[4] = 2` (jump index 0→1, then 1→4) — both match known answers.

**Interview notes.** Both of these have an **O(n) greedy solution** that beats the O(n²) DP shown here — for Jump Game I, track the farthest index reachable so far as you scan left to right; the moment your current index exceeds that farthest reach, it's unreachable, otherwise extend it:

```java
static boolean canJumpGreedy(int[] nums) {
    int maxReach = 0;
    for (int i = 0; i < nums.length; i++) {
        if (i > maxReach) return false;
        maxReach = Math.max(maxReach, i + nums[i]);
    }
    return true;
}
```

Most interviewers want to see the DP *first* — it's the version whose correctness is easy to argue for from first principles — and the greedy optimization *second*, as a "can you do better?" follow-up. Leading with the greedy trick unprompted can actually read as having memorized the answer rather than derived it; show the reasoning, then optimize.

---

## 7. The Three Combinators — Your Pattern-Recognition Shortcut

Look back across every recurrence in Section 6 and a shape repeats: `dp[i]` is always some earlier `dp[j]` value(s), **combined** by one of exactly three operators, depending on what the question is actually asking:

| Question is asking for... | Combinator | Seen in |
|---|---|---|
| "Can you reach / form / partition / segment...?" | **OR** (boolean) | Word Break, Jump Game I |
| "What's the minimum / maximum...?" | **MIN** / **MAX** | House Robber, Min Cost Climbing Stairs, Coin Change, Perfect Squares, LIS, Jump Game II, Max Subarray, Max Product Subarray |
| "How many ways / how many combinations...?" | **SUM** (counting) | Climbing Stairs, Decode Ways, Coin Change II |

This is worth internalizing as close to a reflex as possible, because it collapses "derive the recurrence" into two much smaller questions: *(1) which of these three does the wording of the problem want, and (2) which earlier states actually feed into `dp[i]`?* Question (2) is usually just "what was the last decision?", answered by re-reading the problem's constraints (adjacent-house rule, coin denominations, valid jump range, valid digit range). Get the combinator right and the rest is bookkeeping.

---

## 8. Signal-Words Cheat Sheet

Fast lookup for "I've just read the problem — what shape am I probably looking at?"

| Phrase in the problem | Likely pattern |
|---|---|
| "number of ways to..." / "how many ways..." / "count the..." | Counting DP (SUM combinator) |
| "minimum cost / steps / coins to..." | Min-optimization DP |
| "maximum sum / product / value / profit..." | Max-optimization DP |
| "can you reach / form / partition / segment...?" | Boolean reachability DP (OR combinator) |
| "longest / shortest subsequence / substring with property X" | Optimization DP with an explicit length tracked in the state |
| "you can't pick two adjacent..." | House-Robber-shaped include/exclude choice |
| Houses/seats/elements arranged in a **circle** | Break the circle at one point → reduce to (one or two) linear subproblems |
| Coins/items reusable an unlimited number of times | Unbounded-knapsack shape, collapses to 1-D (Coin Change, Perfect Squares) |
| A running value can flip sign / parity as you extend it | Track more than just "best so far" (Max Product Subarray) |

---

## 9. Common Mistakes & Pitfalls

- **Off-by-one on array size.** If `dp[0]` is meant to represent "zero elements considered" (as in House Robber, Word Break, Decode Ways), you need an array of size `n + 1`, not `n` — otherwise you either can't express the base case or you index negative.
- **Ambiguous state definition.** "Cost to reach step `i`" and "cost to reach step `i`, already including the cost of standing on it" are two different, both-reasonable definitions that lead to off-by-one bugs against each other. Write the state as a full sentence before coding (Section 3, Step 2) — it forces the ambiguity into the open where you can resolve it once, instead of accidentally resolving it inconsistently across the base case and the recurrence.
- **Wrong loop order in counting DP.** Coin Change II vs. Combination Sum IV (Section 6.12) is the canonical example: swapping which loop is outer silently switches you between counting combinations and counting permutations. No crash, no warning — just a wrong number. Always hand-trace a tiny example.
- **Confusing the three combinators.** Skimming a problem and assuming it wants MAX when it actually wants a count (or vice versa) produces code that *runs* and *looks* plausible but answers the wrong question entirely. Re-read the exact phrase being asked for before choosing.
- **Integer overflow on counting problems.** Less common in typical interview-sized constraints, but real: if the count of ways could plausibly exceed ~2 billion, use `long` instead of `int` for the `dp` array. Java won't warn you — it'll just silently wrap around.
- **Deep recursion + memoization on large `n`.** A memoized top-down solution that's perfectly correct can still throw `StackOverflowError` in Java on inputs with tens of thousands of elements, because each recursive call consumes real stack frames. If `n` could be large, prefer bottom-up tabulation, which uses no recursion at all.

---

## 10. Quick-Reference Table

| Problem | State | Core Recurrence | Time | Space (optimized) |
|---|---|---|---|---|
| Climbing Stairs | `dp[i]` = ways to reach step `i` | `dp[i-1] + dp[i-2]` | O(n) | O(1) |
| Min Cost Climbing Stairs | `dp[i]` = cost to reach step `i` | `min(dp[i-1]+cost[i-1], dp[i-2]+cost[i-2])` | O(n) | O(1) |
| House Robber | `dp[i]` = max money, first `i` houses | `max(dp[i-1], dp[i-2]+nums[i-1])` | O(n) | O(1) |
| House Robber II | two linear House Robber calls | (reduction, not a new recurrence) | O(n) | O(1) |
| Maximum Subarray | `dp[i]` = max sum ending at `i` | `max(nums[i], dp[i-1]+nums[i])` | O(n) | O(1) |
| Maximum Product Subarray | `maxProd[i]`, `minProd[i]` ending at `i` | max/min of 3 candidates each | O(n) | O(1) |
| Longest Increasing Subsequence | `dp[i]` = LIS length ending at `i` | `max(dp[i], dp[j]+1)` ∀ `j<i`, `nums[j]<nums[i]` | O(n²) (O(n log n) alt.) | O(n) |
| Word Break | `dp[i]` = can segment `s[0..i)` | `∃ j<i: dp[j] ∧ s[j..i) ∈ dict` | O(n²)–O(n³) | O(n) |
| Decode Ways | `dp[i]` = ways to decode `s[0..i)` | `dp[i-1]` (if valid 1-digit) + `dp[i-2]` (if valid 2-digit) | O(n) | O(1) |
| Coin Change | `dp[a]` = min coins for amount `a` | `min(dp[a-coin]+1)` | O(amount·coins) | O(amount) |
| Coin Change II | `dp[a]` = combinations summing to `a` | `dp[a] += dp[a-coin]` (coin outer!) | O(amount·coins) | O(amount) |
| Perfect Squares | `dp[i]` = min squares summing to `i` | `min(dp[i-j²]+1)` | O(n√n) | O(n) |
| Jump Game I | `dp[i]` = is `i` reachable | `∃ j<i: dp[j] ∧ j+nums[j]≥i` | O(n²) (O(n) greedy alt.) | O(n) |
| Jump Game II | `dp[i]` = min jumps to reach `i` | `min(dp[j]+1)` over reachable `j<i` | O(n²) (O(n) greedy alt.) | O(n) |

---

## 11. Practice List — More Problems to Try Solo

Deliberately given **without** the state/recurrence — deriving that yourself with the Section 3 framework is the actual practice. All are genuinely 1-D (single varying index) at their core.

**Easy**
- **Fibonacci Number** (LC 509) — the original, if you want to start at the very beginning.
- **N-th Tribonacci Number** (LC 1137) — Fibonacci's three-term cousin.
- **Counting Bits** (LC 338) — `dp[i]` relates to `dp[i >> 1]`; a nice change of texture from array/string problems into bit manipulation.
- **Divisor Game** (LC 1025) — small game-theory flavor, same "reachability" combinator as Jump Game.

**Medium**
- **Delete and Earn** (LC 740) — reduces to House Robber after a preprocessing step (group by value, sum points per value, then treat adjacent *values* the way House Robber treats adjacent *houses*).
- **Domino and Tromino Tiling** (LC 790) — `dp[i]` depends on more than just the previous two states; good test of whether you can extend the framework past the simplest case.
- **Minimum Cost For Tickets** (LC 983) — state over "day index within the travel plan," three choices (1/7/30-day pass) feeding each state.
- **Partition Array for Maximum Sum** (LC 1043) — a max-optimization DP where the recurrence looks back a *variable* number of steps (up to `k`), not a fixed 1 or 2.
- **Longest Turbulent Subarray** (LC 978) — Kadane's-style running state, but the state needs to track "which direction was the last comparison."
- **Best Time to Buy and Sell Stock II** (LC 122) — unlimited transactions allowed; ask yourself whether this needs DP at all, or whether it collapses to something simpler.
- **Maximum Sum Circular Subarray** (LC 918) — combines the Kadane's-style running-max idea (Section 6.5) with the circular-reduction trick (Section 6.4). Good synthesis problem.

**Hard**
- **Best Time to Buy and Sell Stock with Cooldown** (LC 309) and **...with Transaction Fee** (LC 714) — a small preview of "state-machine DP," where each index carries a *few* parallel states (holding a share vs. not) instead of just one number, the same way Maximum Product Subarray carried two (max and min) instead of one. Try defining `hold[i]` and `sold[i]` explicitly before looking anything up.

---

## 12. What's Next

Part 2 will cover **2-D DP**: grid problems (Unique Paths, Minimum Path Sum), two-string problems (Longest Common Subsequence, Edit Distance, Longest Palindromic Subsequence), and 0/1 Knapsack / Subset-Sum-family problems (Partition Equal Subset Sum, Target Sum) — everywhere the state needs `dp[i][j]` instead of `dp[i]`. Same five-step framework throughout; only the table grows a dimension.

Whatever's left after that — interval DP, bitmask DP, digit DP, tree DP — gets its own file once we get there, per the plan.

---

# Dynamic Programming — Part 2: Two-Dimensional (2-D) DP

Part 2 of the DP series. Part 1 covered 1-D DP — the 5-step framework, top-down vs. bottom-up, space optimization, and 14 worked problems where the state was a single index. This file assumes all of that and builds on it directly; it does not re-derive it. If any of "state," "recurrence," "base case," "combinator," or "why does memoization help" feels shaky, that's Part 1's job, not this one's.

**How to use this guide:** same discipline as Part 1. For every problem in Sections 4–6, write the state sentence and the recurrence yourself before reading mine. The only genuinely new skill in this file is thinking in two indices at once — everything else (the 5-step framework, the combinators, top-down/bottom-up, space optimization) transfers unchanged from Part 1.

All code is Java, LeetCode-style, and every solution below was compiled and run against the stated examples before being written down.

**Contents**
1. [What's Actually New: From One Index to Two](#1-whats-actually-new-from-one-index-to-two)
2. [The Three Families of 2-D DP](#2-the-three-families-of-2-d-dp)
3. [Filling the Table: Order Matters More Now](#3-filling-the-table-order-matters-more-now)
4. [Grid DP — Worked Problems](#4-grid-dp--worked-problems)
5. [Two-String DP — Worked Problems](#5-two-string-dp--worked-problems)
6. [Knapsack & Subset-Sum DP — Worked Problems](#6-knapsack--subset-sum-dp--worked-problems)
7. [Common Mistakes & Pitfalls](#7-common-mistakes--pitfalls)
8. [Signal-Words Cheat Sheet](#8-signal-words-cheat-sheet-1)
9. [Quick-Reference Table](#9-quick-reference-table)
10. [Practice List — More Problems to Try Solo](#10-practice-list--more-problems-to-try-solo)
11. [What's Next](#11-whats-next)

---

## 1. What's Actually New: From One Index to Two

In Part 1, every state was pinned down by a single number. That was enough because, in each of those problems, once you knew *where* you were, everything relevant about *how you got there* was already folded into that one number.

2-D DP shows up exactly when that stops being true — when a subproblem genuinely needs **two independent** pieces of information before it's fully specified. Almost every 2-D DP problem you'll meet falls into one of three shapes, covered in order below:

1. **Grid DP** — a physical position genuinely needs two numbers: which row, which column.
2. **Two-String DP** — comparing two sequences needs two independent progress-markers: how far into string A, how far into string B.
3. **Knapsack / Subset-Sum DP** — needs how many items you've considered so far, *and* how much capacity or target value you have left.

Here's the question that actually makes "why 2-D, and why now" click, so it's worth sitting with before diving in: **why did Coin Change (Part 1, Section 6.10) get away with a single index `dp[amount]`, while 0/1 Knapsack — coming up in Section 6 below — needs two, `dp[item][capacity]`?**

The answer is reuse. Coin Change's coins are unlimited — you never need to track *which* coins you've already used, only how much amount is left to make, because any coin is always still available. The "have I already spent this coin" question simply never needs answering, so it never needed a dimension. 0/1 Knapsack's items can each be used **at most once** — so the answer to "what's the best value with capacity `w`" genuinely depends on *which* items are still eligible, and the only clean way to track that is to also index by *how many items you've decided about so far*. That's the second dimension, and it exists for a reason, not by convention. Keep this question in your back pocket — "does going from unlimited-use to single-use turn a 1-D problem into a 2-D one?" — and you'll correctly predict the shape of a lot of problems before you've derived anything.

---

## 2. The Three Families of 2-D DP

An orientation map before diving into worked problems — knowing which family you're in tells you what `i` and `j` are even supposed to *mean*, which is most of the battle.

| Family | What `i` means | What `j` means | Canonical example |
|---|---|---|---|
| **Grid DP** | row position | column position | Unique Paths |
| **Two-String DP** | progress through string A (prefix length considered) | progress through string B (prefix length considered) | Longest Common Subsequence |
| **Knapsack / Subset-Sum DP** | how many items considered so far | remaining capacity / target value | 0/1 Knapsack |

The recurrence-deriving process (Part 1, Section 3, Step 3) is identical across all three: ask "what was the last decision?" For grid DP that's "did I just move down or right?" For two-string DP it's "did the two current characters match, and if not, which string's pointer do I advance?" For knapsack DP it's "did I include this item or not?" Same question, three different vocabularies.

---

## 3. Filling the Table: Order Matters More Now

In Part 1, fill order was simple: left to right, since `dp[i]` only ever needed earlier indices. In 2-D, you now have to make sure *both* dimensions are filled in a safe order — and while the default is still simple, there's a real exception worth knowing before you meet it in the wild.

**The default (row-by-row, like reading a page):** for grid DP and prefix-based two-string DP, `dp[i][j]` only ever depends on `dp[i-1][j]`, `dp[i][j-1]`, and/or `dp[i-1][j-1]` — all strictly "earlier" if you fill row by row, left to right within each row. This covers the large majority of 2-D DP problems, including every Grid and Two-String problem below except one.

**The exception (range/interval style):** when both indices `i, j` describe two ends of a range within the *same* sequence (rather than positions in two different sequences), the recurrence instead depends on *shorter* ranges nested inside the current one — `dp[i+1][j-1]`, `dp[i+1][j]`, `dp[i][j-1]` — none of which is simply "the previous row." The safe fill order becomes **increasing range length**, not row-by-row. You'll see this in Longest Palindromic Subsequence (Section 5.3) — it's a preview of interval DP, which gets its own full treatment in a later file.

**The rare, deeper exception (fill backward):** occasionally the recurrence for `dp[i][j]` depends on what happens *after* position `(i,j)`, not before it — because the quantity being tracked (like "minimum health needed to survive the rest of the journey") only makes sense read from the destination back to the start. Dungeon Game (Section 4.5) is the clearest possible example, and it's included specifically to make sure this case doesn't ambush you the first time you meet it for real.

The general principle, same as Part 1: **before coding, identify exactly what `dp[i][j]` depends on, then choose a fill order that guarantees those values already exist.** Row-by-row is the default because it's usually right — not because it's guaranteed.

---

## 4. Grid DP — Worked Problems

State shape throughout this section: `dp[i][j]` = the answer restricted to the sub-grid ending at row `i`, column `j`.

### 4.1 Unique Paths (LeetCode 62)

An `m x n` grid; a robot starts at the top-left, can only move right or down, and stops at the bottom-right. Count the distinct paths.

**Approach.**
- *State:* `dp[i][j]` = number of distinct paths from `(0,0)` to `(i,j)`.
- *Recurrence:* the last move into `(i,j)` was either from directly above or directly to the left: `dp[i][j] = dp[i-1][j] + dp[i][j-1]`.
- *Base case:* the entire top row and entire left column are all `1` — there's exactly one way to reach any of those cells (keep moving in the only direction available).

**Code:**

```java
static int uniquePaths(int m, int n) {
    int[][] dp = new int[m][n];
    for (int i = 0; i < m; i++) dp[i][0] = 1;
    for (int j = 0; j < n; j++) dp[0][j] = 1;
    for (int i = 1; i < m; i++) {
        for (int j = 1; j < n; j++) {
            dp[i][j] = dp[i-1][j] + dp[i][j-1];
        }
    }
    return dp[m-1][n-1];
}
```

**Walkthrough.** `m=3, n=7`: filling row by row, `dp[2][6] = 28` — matches the known answer.

**Interview notes.** O(m·n) time and, as written, O(m·n) space — but notice `dp[i][j]` only ever needs the row directly above and the current row so far, so this space-optimizes to a single rolling row, O(n):

```java
static int uniquePathsOpt(int m, int n) {
    int[] dp = new int[n];
    Arrays.fill(dp, 1);
    for (int i = 1; i < m; i++) {
        for (int j = 1; j < n; j++) {
            dp[j] = dp[j] + dp[j-1];   // dp[j] is still last row's value; dp[j-1] is already this row's
        }
    }
    return dp[n-1];
}
```

Read that carefully: before the assignment, `dp[j]` still holds the value from row `i-1` (nobody's touched it yet this pass), while `dp[j-1]` already holds row `i`'s value (computed earlier in this same left-to-right pass). Adding them together correctly reproduces `dp[i-1][j] + dp[i][j-1]` using one array. This works specifically because we're iterating `j` **forward** — hold that thought, it becomes the crux of a much bigger lesson in Section 6.

---

### 4.2 Unique Paths II (LeetCode 63) — the obstacles variant

Same grid, same movement rules, but some cells are obstacles (marked `1` in `obstacleGrid`) and cannot be entered.

**Approach.** Same state and recurrence — with one added rule: any obstacle cell has exactly zero paths through it, full stop, overriding the recurrence entirely at that cell (and correctly starving anything downstream that would otherwise route through it).

```java
static int uniquePathsWithObstacles(int[][] obstacleGrid) {
    int m = obstacleGrid.length, n = obstacleGrid[0].length;
    int[][] dp = new int[m][n];
    dp[0][0] = obstacleGrid[0][0] == 1 ? 0 : 1;
    for (int j = 1; j < n; j++) dp[0][j] = (obstacleGrid[0][j] == 1) ? 0 : dp[0][j-1];
    for (int i = 1; i < m; i++) dp[i][0] = (obstacleGrid[i][0] == 1) ? 0 : dp[i-1][0];
    for (int i = 1; i < m; i++) {
        for (int j = 1; j < n; j++) {
            dp[i][j] = (obstacleGrid[i][j] == 1) ? 0 : dp[i-1][j] + dp[i][j-1];
        }
    }
    return dp[m-1][n-1];
}
```

**Walkthrough.** `obstacleGrid = [[0,0,0],[0,1,0],[0,0,0]]` → 2 (the obstacle at the center forces both surviving paths around it) — matches.

**Interview notes.** The lesson here isn't really about this specific problem — it's that a genuinely new *constraint* (obstacles) often needs **zero** change to the state definition, just one extra `if` layered onto an existing recurrence. Recognizing "I already have the right state, I just need to special-case an override" is faster than re-deriving from scratch, and it's a strong interview signal when you say it out loud.

---

### 4.3 Minimum Path Sum (LeetCode 64)

Same grid shape; each cell has a non-negative cost. Find the minimum-cost path from top-left to bottom-right (right/down moves only).

**Approach.**
- *State:* `dp[i][j]` = minimum cost to reach `(i,j)` from `(0,0)`.
- *Recurrence:* `dp[i][j] = grid[i][j] + min(dp[i-1][j], dp[i][j-1])`.
- *Base case:* first row and first column each have only one possible path in (straight across, or straight down), so each is just a running sum of `grid` values along that edge.

```java
static int minPathSum(int[][] grid) {
    int m = grid.length, n = grid[0].length;
    int[][] dp = new int[m][n];
    dp[0][0] = grid[0][0];
    for (int j = 1; j < n; j++) dp[0][j] = dp[0][j-1] + grid[0][j];
    for (int i = 1; i < m; i++) dp[i][0] = dp[i-1][0] + grid[i][0];
    for (int i = 1; i < m; i++) {
        for (int j = 1; j < n; j++) {
            dp[i][j] = grid[i][j] + Math.min(dp[i-1][j], dp[i][j-1]);
        }
    }
    return dp[m-1][n-1];
}
```

**Walkthrough.** `grid = [[1,3,1],[1,5,1],[4,2,1]]` → 7, via `1→3→1→1→1` down the shape that avoids the `5` — matches.

**Interview notes.** O(m·n) time, space-optimizable to O(n) with the identical rolling-row trick as 4.1 — same reasoning, just `min` instead of `+`. This is functionally Unique Paths with a MIN combinator standing in for the SUM combinator — worth explicitly noticing, since it's the Three-Combinators idea (Part 1, Section 7) showing up again, unchanged, in the second dimension.

---

### 4.4 Maximal Square (LeetCode 221)

A binary matrix of `'0'`/`'1'` characters. Find the largest square containing only `'1'`s and return its **area**.

**Approach.**
- *State:* `dp[i][j]` = the side length of the largest all-`'1'` square whose **bottom-right corner** is exactly at `(i,j)` (and `dp[i][j] = 0` if `matrix[i][j]` is `'0'`).
- *Recurrence:* a square of side `s` ending at `(i,j)` requires a square of side at least `s-1` ending at *each* of the cell above, the cell to the left, *and* the cell diagonally above-left — the new square is only as strong as its weakest supporting neighbor: `dp[i][j] = 1 + min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])`, when `matrix[i][j] == '1'`.
- *Base case:* the first row and first column can only ever support a square of side 1 (there's no room for a bigger one), so `dp[i][j] = 1` there whenever `matrix[i][j] == '1'`.

**Code:**

```java
static int maximalSquare(char[][] matrix) {
    int m = matrix.length, n = matrix[0].length;
    int[][] dp = new int[m][n];
    int maxSide = 0;
    for (int i = 0; i < m; i++) {
        for (int j = 0; j < n; j++) {
            if (matrix[i][j] == '1') {
                dp[i][j] = (i == 0 || j == 0) ? 1
                        : 1 + Math.min(dp[i-1][j], Math.min(dp[i][j-1], dp[i-1][j-1]));
                maxSide = Math.max(maxSide, dp[i][j]);
            }
        }
    }
    return maxSide * maxSide;
}
```

**Walkthrough.** On the classic 4×5 example (rows `10100`, `10111`, `11111`, `10010`), the largest all-`1` square has side 2, so the answer is area `4` — matches.

**Interview notes.** O(m·n) time and space; space-optimizes to O(n) with a rolling row, though you have to be slightly more careful here than in 4.1/4.3 — you need the diagonal (`dp[i-1][j-1]`) as well, so you must stash it in a temp variable before overwriting that slot in the rolling array. Common follow-up: return the square's *location*, not just its area — track the `(i,j)` that produced `maxSide` alongside it.

---

### 4.5 Dungeon Game (LeetCode 174)

A knight must cross a dungeon grid (right/down moves only) to rescue a princess in the bottom-right cell. Each cell adds or subtracts health (negative = demon, positive = potion). The knight's health must never drop to 0 or below at any point, including mid-cell. Find the **minimum starting health** in the top-left cell that guarantees survival all the way to the bottom-right.

**Approach.** This is the one where forward-filling genuinely doesn't work, and it's worth understanding *why*, not just memorizing the fix. If you try to track "maximum health achievable upon arrival at `(i,j)`" moving forward from the start, you run into a real problem: the path with the *most* health accumulated so far isn't necessarily the path that leaves you best-positioned for what's still ahead — a huge potion early, followed by a brutal demon later, can leave you worse off than a more modest path that avoids that demon. The quantity that actually composes correctly is defined from the *far end*: "the minimum health I need **upon entering** this cell such that I can survive everything from here to the destination." That's naturally computed **backward**, starting from the destination.
- *State:* `dp[i][j]` = minimum health required upon entering `(i,j)` to survive from there to the destination.
- *Recurrence:* from `(i,j)` the knight will next go right or down, needing `dp[i][j+1]` or `dp[i+1][j]` health upon arrival there, respectively — take whichever is smaller (the easier continuation). The health needed *upon entering* `(i,j)` itself must cover this cell's own effect and still leave that much: `dp[i][j] = max(1, min(dp[i][j+1], dp[i+1][j]) - dungeon[i][j])` — floored at 1, since health can never legally be reduced to zero or below.
- *Base case:* pad the table with one extra row and column beyond the real grid, all initialized to "infinity," except the two cells diagonally adjacent to the true destination, which get seeded to `1`. This lets the *actual* destination cell fall out of the same general recurrence instead of needing its own special case.

**Code:**

```java
static int calculateMinimumHP(int[][] dungeon) {
    int m = dungeon.length, n = dungeon[0].length;
    int[][] dp = new int[m + 1][n + 1];
    for (int[] row : dp) Arrays.fill(row, Integer.MAX_VALUE);
    dp[m][n - 1] = 1;
    dp[m - 1][n] = 1;
    for (int i = m - 1; i >= 0; i--) {
        for (int j = n - 1; j >= 0; j--) {
            int need = Math.min(dp[i + 1][j], dp[i][j + 1]) - dungeon[i][j];
            dp[i][j] = Math.max(1, need);
        }
    }
    return dp[0][0];
}
```

**Walkthrough.** `dungeon = [[-2,-3,3],[-5,-10,1],[10,30,-5]]` → `7`. Tracing backward from the bottom-right: `dp[2][2]=6`, `dp[2][1]=1`, `dp[1][1]=11`, ..., converging on `dp[0][0]=7` — matches the known answer. (The path this represents starts with just enough health to survive the early `-2, -3` before recovering via the `+3, +10, +30` later — exactly the kind of path a forward-greedy "maximize health so far" approach would undervalue.)

**Interview notes.** O(m·n) time and space. The transferable lesson matters far more than this specific problem: **whenever "the best choice right now" depends on information that only becomes available later in the path**, forward-filling breaks down, and you need to ask whether the problem reads more naturally backward, from a known endpoint toward the start. This is a real, recurring pattern — not just a one-off trick for this problem.

---

## 5. Two-String DP — Worked Problems

State shape throughout this section: `dp[i][j]` = the answer considering the first `i` characters of one string and the first `j` characters of the other (with two exceptions noted below, where both indices instead describe a range within a *single* string).

### 5.1 Longest Common Subsequence (LeetCode 1143)

Given two strings, find the length of their longest common subsequence (not necessarily contiguous in either string).

**Approach.**
- *State:* `dp[i][j]` = LCS length between the first `i` characters of `text1` and the first `j` characters of `text2`.
- *Recurrence:* if the two characters currently under consideration match (`text1.charAt(i-1) == text2.charAt(j-1)`), they must both belong to the LCS — extend the best answer from one character earlier in *both* strings: `dp[i][j] = dp[i-1][j-1] + 1`. If they don't match, at least one of the two characters is useless for this particular alignment — drop whichever gives the better result: `dp[i][j] = max(dp[i-1][j], dp[i][j-1])`.
- *Base case:* `dp[0][j] = dp[i][0] = 0` — an empty string shares no subsequence with anything.

**Code:**

```java
static int longestCommonSubsequence(String text1, String text2) {
    int m = text1.length(), n = text2.length();
    int[][] dp = new int[m + 1][n + 1];
    for (int i = 1; i <= m; i++) {
        for (int j = 1; j <= n; j++) {
            if (text1.charAt(i - 1) == text2.charAt(j - 1)) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    return dp[m][n];
}
```

**Walkthrough.** `text1="abcde"`, `text2="ace"` → 3 (the subsequence `"ace"`) — matches.

**Interview notes.** O(m·n) time and space; space-optimizes to O(min(m,n)) with a rolling row (choose the shorter string to size the array, for the smaller footprint). This is the foundation problem of the whole two-string family — Edit Distance, Longest Palindromic Subsequence, and Distinct Subsequences below are all recognizable variations of this exact table shape with a different recurrence layered on. Common follow-up: reconstruct the actual subsequence, not just its length — walk backward from `dp[m][n]`, stepping diagonally whenever characters matched, and toward whichever neighbor was larger when they didn't.

---

### 5.2 Edit Distance (LeetCode 72)

Given two words, find the minimum number of single-character insertions, deletions, or substitutions to turn one into the other.

**Approach.**
- *State:* `dp[i][j]` = minimum operations to convert the first `i` characters of `word1` into the first `j` characters of `word2`.
- *Recurrence:* if the current characters already match, no operation is needed here — inherit the answer for one character back in both: `dp[i][j] = dp[i-1][j-1]`. Otherwise, one operation is unavoidable, and you get to choose the cheapest: **substitute** (`dp[i-1][j-1]`, fix this one character and move both pointers), **delete** from `word1` (`dp[i-1][j]`, move only `word1`'s pointer), or **insert** into `word1` (`dp[i][j-1]`, move only `word2`'s pointer) — take the minimum of the three and add 1 for the operation just performed.
- *Base case:* `dp[i][0] = i` (delete all `i` characters down to nothing), `dp[0][j] = j` (insert all `j` characters from nothing).

**Code:**

```java
static int minDistance(String word1, String word2) {
    int m = word1.length(), n = word2.length();
    int[][] dp = new int[m + 1][n + 1];
    for (int i = 0; i <= m; i++) dp[i][0] = i;
    for (int j = 0; j <= n; j++) dp[0][j] = j;
    for (int i = 1; i <= m; i++) {
        for (int j = 1; j <= n; j++) {
            if (word1.charAt(i - 1) == word2.charAt(j - 1)) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = 1 + Math.min(dp[i - 1][j - 1], Math.min(dp[i - 1][j], dp[i][j - 1]));
            }
        }
    }
    return dp[m][n];
}
```

**Walkthrough.** `word1="horse"`, `word2="ros"` → 3 (`horse → rorse` [substitute h→r] `→ rose` [delete r] `→ ros` [delete e]) — matches.

**Interview notes.** O(m·n) time and space, O(min(m,n)) with rolling-row optimization. This is one of the most-asked hard-flavored DP problems in the entire interview canon precisely because the three-way choice at each mismatched cell (substitute / delete / insert) has to be derived cleanly, not memorized — be ready to justify out loud why each of the three options corresponds to exactly one edit operation and exactly one pointer movement.

---

### 5.3 Longest Palindromic Subsequence (LeetCode 516)

Given a single string, find the length of its longest palindromic subsequence.

**Approach.** This is the section's one genuine departure: `i` and `j` are now two ends of a range within the **same** string, not prefixes of two different ones — so this previews the interval-DP fill order flagged in Section 3.
- *State:* `dp[i][j]` = length of the longest palindromic subsequence within `s[i..j]` (inclusive range).
- *Recurrence:* if the two end characters match, they can both anchor the palindrome — wrap them around whatever's palindromic strictly inside: `dp[i][j] = dp[i+1][j-1] + 2`. If they don't match, at least one end is useless for this range — drop whichever end gives the better result: `dp[i][j] = max(dp[i+1][j], dp[i][j-1])`.
- *Base case:* `dp[i][i] = 1` (a single character is trivially a palindrome of length 1).
- *Fill order:* by increasing range length — concretely, iterate the start index `i` from the end of the string backward to the beginning, and for each `i`, the end index `j` forward from `i+1` to the end. This guarantees `dp[i+1][*]` (shorter ranges starting one later) and `dp[i][j-1]` (shorter ranges ending one earlier) are always already computed by the time they're needed.

**Code:**

```java
static int longestPalindromeSubseq(String s) {
    int n = s.length();
    int[][] dp = new int[n][n];
    for (int i = 0; i < n; i++) dp[i][i] = 1;
    for (int i = n - 2; i >= 0; i--) {
        for (int j = i + 1; j < n; j++) {
            if (s.charAt(i) == s.charAt(j)) {
                dp[i][j] = (i + 1 <= j - 1 ? dp[i + 1][j - 1] : 0) + 2;
            } else {
                dp[i][j] = Math.max(dp[i + 1][j], dp[i][j - 1]);
            }
        }
    }
    return dp[0][n - 1];
}
```

**Walkthrough.** `s = "bbbab"` → 4 (`"bbbb"`, skipping the `a`) — matches.

**Interview notes.** O(n²) time and space. A neat alternate framing worth knowing for a follow-up: the longest palindromic subsequence of `s` is exactly the **longest common subsequence** of `s` and `reverse(s)` — so this problem also reduces directly to Section 5.1's LCS if you'd rather reuse that code than derive a fresh recurrence. Don't confuse this with **Longest Palindromic *Substring*** (LC 5) — a different, also-common problem asking for a *contiguous* palindrome, which changes the recurrence to a boolean "is `s[i..j]` a palindrome" check rather than a length.

---

### 5.4 Distinct Subsequences (LeetCode 115)

Given strings `s` and `t`, count the number of distinct ways `t` appears as a subsequence of `s`.

**Approach.**
- *State:* `dp[i][j]` = number of ways the first `i` characters of `s` can form the first `j` characters of `t` as a subsequence.
- *Recurrence:* if the current characters match, there are two ways to make progress: use this character of `s` to match this character of `t` (`dp[i-1][j-1]`), *or* skip this character of `s` and still try to match the same amount of `t` using fewer characters of `s` (`dp[i-1][j]`) — both are valid, independent ways of building up to the same target, so add them: `dp[i][j] = dp[i-1][j-1] + dp[i-1][j]`. If the characters don't match, this character of `s` can't help at all — it can only be skipped: `dp[i][j] = dp[i-1][j]`.
- *Base case:* `dp[i][0] = 1` for every `i` — there's always exactly one way to form an empty target: choose nothing, regardless of how much of `s` is available.

**Code:**

```java
static int numDistinct(String s, String t) {
    int m = s.length(), n = t.length();
    int[][] dp = new int[m + 1][n + 1];
    for (int i = 0; i <= m; i++) dp[i][0] = 1;
    for (int i = 1; i <= m; i++) {
        for (int j = 1; j <= n; j++) {
            if (s.charAt(i - 1) == t.charAt(j - 1)) {
                dp[i][j] = dp[i - 1][j - 1] + dp[i - 1][j];
            } else {
                dp[i][j] = dp[i - 1][j];
            }
        }
    }
    return dp[m][n];
}
```

**Walkthrough.** `s="rabbbit"`, `t="rabbit"` → 3 (three distinct ways to pick out which of the three middle `b`s to keep two of) — matches.

**Interview notes.** O(m·n) time and space, O(n) with a rolling row. This is the two-string family's counting example — same table shape as LCS and Edit Distance, just SUM instead of MAX/MIN as the combinator, which is the Three-Combinators idea (Part 1, Section 7) turning up for the third time in this file. LC's own constraints keep the answer within `int` range, but if you were extending this problem, remember Part 1's overflow warning: counts can grow fast.

---

### 5.5 Interleaving String (LeetCode 97)

Given `s1`, `s2`, and `s3`, determine whether `s3` can be formed by interleaving `s1` and `s2` while preserving each string's internal character order.

**Approach.**
- *State:* `dp[i][j]` = true if the first `i` characters of `s1` and first `j` characters of `s2` can interleave to form exactly the first `i+j` characters of `s3`.
- *Recurrence:* `dp[i][j]` is true if *either* the most recent character of `s3` (`s3.charAt(i+j-1)`) was just contributed by `s1` (requires `s1.charAt(i-1)` to match it, and `dp[i-1][j]` to already be true) *or* it was just contributed by `s2` (requires `s2.charAt(j-1)` to match it, and `dp[i][j-1]` to already be true).
- *Base case:* `dp[0][0] = true` (two empty strings trivially interleave into an empty string); the first row and first column each degrade to a simple direct-match check against a single source string, since only one of `s1`/`s2` is available at all.

**Code:**

```java
static boolean isInterleave(String s1, String s2, String s3) {
    int m = s1.length(), n = s2.length();
    if (m + n != s3.length()) return false;
    boolean[][] dp = new boolean[m + 1][n + 1];
    dp[0][0] = true;
    for (int i = 1; i <= m; i++) dp[i][0] = dp[i - 1][0] && s1.charAt(i - 1) == s3.charAt(i - 1);
    for (int j = 1; j <= n; j++) dp[0][j] = dp[0][j - 1] && s2.charAt(j - 1) == s3.charAt(j - 1);
    for (int i = 1; i <= m; i++) {
        for (int j = 1; j <= n; j++) {
            dp[i][j] = (dp[i - 1][j] && s1.charAt(i - 1) == s3.charAt(i + j - 1))
                    || (dp[i][j - 1] && s2.charAt(j - 1) == s3.charAt(i + j - 1));
        }
    }
    return dp[m][n];
}
```

**Walkthrough.** `s1="aabcc"`, `s2="dbbca"`, `s3="aadbbcbcac"` → true — matches.

**Interview notes.** O(m·n) time and space. The length check (`m + n != s3.length()`) up front is a cheap, easy-to-forget early exit — say it out loud, don't just rely on the DP to eventually return false. This is the two-string family's OR / reachability example — rounding out MAX (LCS), MIN (Edit Distance), SUM (Distinct Subsequences), and now OR, all on the exact same `dp[i][j]` table shape.

---

## 6. Knapsack & Subset-Sum DP — Worked Problems

### 6.1 0/1 Knapsack — the template

Not itself a LeetCode problem, but the template that Sections 6.2 and 6.3 (and a large share of "subset" problems generally) are variations of — worth learning in this raw form first. Given `n` items, each with a `weight` and a `value`, and a knapsack of capacity `W`, maximize total value without exceeding capacity. Each item may be used **at most once**.

**Approach.**
- *State:* `dp[i][w]` = maximum value achievable using only the first `i` items, with capacity `w`.
- *Recurrence:* for item `i`, either leave it out (`dp[i][w] = dp[i-1][w]`) or, if it fits (`weights[i-1] <= w`), take it and add its value to the best answer for the *remaining* capacity using only the *previous* items: `dp[i][w] = max(dp[i-1][w], dp[i-1][w - weights[i-1]] + values[i-1])`.
- *Base case:* `dp[0][w] = 0` for all `w` (no items available, no value possible), `dp[i][0] = 0` for all `i` (no capacity, nothing fits).

**Code:**

```java
static int knapsack01(int[] weights, int[] values, int capacity) {
    int n = weights.length;
    int[][] dp = new int[n + 1][capacity + 1];
    for (int i = 1; i <= n; i++) {
        for (int w = 0; w <= capacity; w++) {
            dp[i][w] = dp[i - 1][w];
            if (weights[i - 1] <= w) {
                dp[i][w] = Math.max(dp[i][w], dp[i - 1][w - weights[i - 1]] + values[i - 1]);
            }
        }
    }
    return dp[n][capacity];
}
```

**Walkthrough.** `weights=[1,3,4,5]`, `values=[1,4,5,7]`, `capacity=7` → 9, via items of weight 3 and 4 (values 4+5) exactly filling the capacity — matches.

**Interview notes — the single most important space-optimization subtlety in this whole file.** `dp[i][w]` only ever reads from row `i-1`, so it space-optimizes to a single rolling 1-D array — but *only* if you iterate capacity **in reverse**, high to low:

```java
static int knapsack01Opt(int[] weights, int[] values, int capacity) {
    int n = weights.length;
    int[] dp = new int[capacity + 1];
    for (int i = 0; i < n; i++) {
        for (int w = capacity; w >= weights[i]; w--) {   // REVERSE — high to low
            dp[w] = Math.max(dp[w], dp[w - weights[i]] + values[i]);
        }
    }
    return dp[capacity];
}
```

Reverse iteration guarantees that when you compute `dp[w]` using `dp[w - weights[i]]`, that lower-indexed slot hasn't been touched yet *this pass* — so it still holds last item's value, correctly matching `dp[i-1][w-weights[i-1]]` from the 2-D version. **Iterate forward instead and it silently breaks:** `dp[w - weights[i]]` would already reflect item `i` having been added earlier in the same pass, letting the same item be counted more than once — you've accidentally solved *unbounded* knapsack (unlimited reuse, exactly Part 1's Coin Change) instead of *0/1* knapsack (single use). Concretely, verified: a single item of weight 2 and value 3 with capacity 6 gives the correct answer **3** with reverse iteration (the item can only be used once, leftover capacity is simply wasted) but **9** with forward iteration (the item silently gets reused three times to fill all 6 units of capacity). Same handful of lines of code, opposite direction, completely different — and completely silent — bug. This is the exact mirror image of the Coin-Change-II-vs-Combination-Sum-IV lesson from Part 1, Section 6.11: there, forward iteration was *correct* because reuse was *wanted*; here, forward iteration is *wrong* because reuse is *not* wanted. **Whether an item can be reused is what decides which direction is safe** — internalizing that single sentence resolves both cases and everything shaped like them.

---

### 6.2 Partition Equal Subset Sum (LeetCode 416)

Given an array of positive integers, determine whether it can be partitioned into two subsets with equal sums.

**Approach.** First, a reduction: if the total sum is odd, it's immediately impossible — two equal integer halves can't sum to an odd total. Otherwise the question becomes "can some subset sum to exactly `total / 2`?" — which is 0/1 Knapsack wearing a disguise: each number is simultaneously its own "weight" *and* its own "value," capacity is `total/2`, and instead of maximizing value, the question is a plain reachability check (does some combination hit the target *exactly*).
- *State:* `dp[s]` = true if some subset of the numbers processed so far sums to exactly `s`.
- *Recurrence:* `dp[s] = dp[s] || dp[s - num]` for the number currently being processed — the OR combinator standing in for knapsack's usual MAX, on the identical reverse-iteration template from 6.1.
- *Base case:* `dp[0] = true` (the empty subset always sums to 0).

**Code:**

```java
static boolean canPartition(int[] nums) {
    int total = 0;
    for (int num : nums) total += num;
    if (total % 2 != 0) return false;
    int target = total / 2;
    boolean[] dp = new boolean[target + 1];
    dp[0] = true;
    for (int num : nums) {
        for (int s = target; s >= num; s--) {     // reverse — same reason as 6.1
            dp[s] = dp[s] || dp[s - num];
        }
    }
    return dp[target];
}
```

**Walkthrough.** `nums = [1,5,11,5]` → true (`{11}` and `{1,5,5}` both sum to 11) — matches.

**Interview notes.** O(n · total) time, O(total) space. This problem is a good test of whether the knapsack template actually generalized in your head or just got memorized for the MAX case — the moment you see "partition into two groups with equal/target sum," the reflex should be "0/1 Knapsack, OR combinator, target = total/2," not a fresh derivation from nothing.

---

### 6.3 Target Sum (LeetCode 494)

Given an array of non-negative integers and a target `S`, assign a `+` or `-` sign to each number so the resulting expression evaluates to exactly `S`. Count the number of ways to do this.

**Approach.** The problem doesn't look like subset-sum at first glance — the algebra is what reveals it. Split the numbers into a "positive" group (sum `P`) and a "negative" group (sum `N`). We need `P - N = S`. We also know `P + N = total` (the sum of all the numbers, regardless of sign). Adding these two equations: `2P = S + total`, so `P = (S + total) / 2`. The problem is now exactly: **count the subsets that sum to exactly `P`** — 0/1 Knapsack again, this time with the COUNT combinator instead of OR or MAX.
- *Edge cases:* if `S + total` is odd, `P` isn't an integer — 0 ways. If `|S| > total`, no assignment of signs can possibly reach it — 0 ways.
- *State:* `dp[s]` = number of subsets (equivalently, number of sign-assignments) summing to exactly `s`.
- *Recurrence:* `dp[s] += dp[s - num]`, same reverse-iteration knapsack template again.
- *Base case:* `dp[0] = 1` (exactly one way to reach a sum of 0: the empty subset).

**Code:**

```java
static int findTargetSumWays(int[] nums, int target) {
    int total = 0;
    for (int num : nums) total += num;
    if (Math.abs(target) > total || (total + target) % 2 != 0) return 0;
    int P = (total + target) / 2;
    int[] dp = new int[P + 1];
    dp[0] = 1;
    for (int num : nums) {
        for (int s = P; s >= num; s--) {           // reverse — same reason as 6.1
            dp[s] += dp[s - num];
        }
    }
    return dp[P];
}
```

**Walkthrough.** `nums=[1,1,1,1,1]`, `target=3`. `total=5`, `P=(5+3)/2=4` — count subsets of five 1's summing to 4, i.e. choose any 4 of the 5: `C(5,4)=5` — matches the known answer of 5.

**Interview notes.** O(n · P) time, O(P) space. This is the pattern-recognition payoff of the whole section: three LeetCode problems that read as completely different stories on the surface (fitting items in a bag, splitting an array into equal halves, assigning plus/minus signs) are the *exact same* recurrence underneath, differing only in which combinator the wording calls for. Spotting "this is knapsack in disguise" — usually by noticing a hidden reduction to "does some subset hit a target sum" — is worth far more than memorizing any one of the three individually.

---

## 7. Common Mistakes & Pitfalls

- **Off-by-one, now in two dimensions at once.** If `dp[0][*]` and `dp[*][0]` are meant to represent "zero characters/items considered," your table needs to be `(m+1) x (n+1)`, not `m x n` — get this wrong on either dimension and you either can't express a base case or you index negative. Twice the dimensions means twice the chances to get this wrong, so check both explicitly.
- **Swapping which index is which.** Mixing up `i`/row with `j`/column produces code that can still accidentally *look* correct on square inputs (`m == n`) and then fail the moment a test case is rectangular. If a solution passes every hand-traced example but you used a square example for all of them, trace one rectangular case before trusting it.
- **Assuming row-by-row fill order always works.** It's the default, not a law — Longest Palindromic Subsequence (5.3) needs increasing-range-length order, and Dungeon Game (4.5) needs to fill backward from the destination. Before coding, check what `dp[i][j]` actually depends on; don't assume.
- **Forward-iterating a 0/1 knapsack-shaped space optimization.** Covered at length in Section 6.1, and worth repeating as its own bullet because it's the costliest mistake in this file: it produces no crash, no exception, just a plausible-looking wrong number, because it silently solves the *unbounded* version instead. Ask explicitly: "can this item/coin be reused?" — reusable → forward iteration is correct (Part 1's Coin Change, Coin Change II); single-use → reverse iteration is required (0/1 Knapsack and everything built on it).
- **Missing an available reduction.** Target Sum doesn't look like subset-sum until you do the `P = (S + total) / 2` algebra; Partition Equal Subset Sum doesn't look like knapsack until you see `target = total / 2`. When a 2-D-feeling problem's *direct* recurrence seems unusually awkward to write down, it's worth spending a minute asking whether some algebraic reduction turns it into a shape you already know cold.

---

## 8. Signal-Words Cheat Sheet

| Phrase in the problem | Likely family |
|---|---|
| "grid," "matrix," "robot," "paths from top-left to bottom-right" | Grid DP |
| "two strings," "convert word1 to word2," "common subsequence/substring," "interleaving" | Two-String DP |
| A single string, asking about palindromes over a **range** of it | Two-String-shaped table, but *interval* fill order (Section 5.3) |
| "items with weight and value," maximize value under a capacity | 0/1 Knapsack (Section 6.1) |
| "partition into two subsets," "split into two groups with equal/minimal-difference sum" | Subset-Sum reduction → 0/1 Knapsack, target = total/2 |
| "assign + or − to each number," reach an exact target | Target-Sum-style algebraic reduction → 0/1 Knapsack |
| Items/coins reusable an **unlimited** number of times | Often collapses back down to 1-D (Part 1's Coin Change) — check whether the second dimension is even needed before adding one |
| Items usable **at most once** | Genuinely needs two dimensions (or 1-D with reverse-iteration space optimization) |

---

## 9. Quick-Reference Table

| Problem | State | Core Recurrence | Time | Space (optimized) |
|---|---|---|---|---|
| Unique Paths | `dp[i][j]` = paths to `(i,j)` | `dp[i-1][j] + dp[i][j-1]` | O(mn) | O(n) |
| Unique Paths II | same, with obstacle override | `0` if obstacle, else as above | O(mn) | O(n) |
| Minimum Path Sum | `dp[i][j]` = min cost to `(i,j)` | `grid[i][j] + min(dp[i-1][j], dp[i][j-1])` | O(mn) | O(n) |
| Maximal Square | `dp[i][j]` = side of square ending at `(i,j)` | `1 + min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])` | O(mn) | O(n) |
| Dungeon Game | `dp[i][j]` = min health entering `(i,j)` | `max(1, min(dp[i+1][j], dp[i][j+1]) - dungeon[i][j])`, filled backward | O(mn) | O(n) |
| Longest Common Subsequence | `dp[i][j]` = LCS length, prefixes `i`,`j` | match → `dp[i-1][j-1]+1`, else `max(dp[i-1][j], dp[i][j-1])` | O(mn) | O(min(m,n)) |
| Edit Distance | `dp[i][j]` = min ops, prefixes `i`,`j` | match → `dp[i-1][j-1]`, else `1+min(3 neighbors)` | O(mn) | O(min(m,n)) |
| Longest Palindromic Subsequence | `dp[i][j]` = LPS length in `s[i..j]` | match → `dp[i+1][j-1]+2`, else `max(dp[i+1][j], dp[i][j-1])` | O(n²) | O(n²) |
| Distinct Subsequences | `dp[i][j]` = ways to form `t[0..j)` from `s[0..i)` | match → `dp[i-1][j-1]+dp[i-1][j]`, else `dp[i-1][j]` | O(mn) | O(n) |
| Interleaving String | `dp[i][j]` = can interleave to `s3[0..i+j)` | `(dp[i-1][j] ∧ match) ∨ (dp[i][j-1] ∧ match)` | O(mn) | O(n) |
| 0/1 Knapsack | `dp[i][w]` = max value, first `i` items, capacity `w` | `max(dp[i-1][w], dp[i-1][w-wt]+val)` | O(n·W) | O(W), reverse iteration |
| Partition Equal Subset Sum | `dp[s]` = subset sums to `s`? | `dp[s] ∨ dp[s-num]` | O(n·total) | O(total), reverse iteration |
| Target Sum | `dp[s]` = ways to sum to `s` | `dp[s] += dp[s-num]` | O(n·P) | O(P), reverse iteration |

---

## 10. Practice List — More Problems to Try Solo

Same rule as Part 1: no state/recurrence given — deriving it yourself is the actual exercise.

**Grid family**
- **Triangle** (LC 120) — a triangular grid instead of a rectangular one; `dp[i][j]` still means "best path sum reaching row `i`, position `j`," but figure out which two cells in the row *below* (or above, depending on which direction you fill) actually neighbor `(i,j)`.

**Two-string family**
- **Minimum ASCII Delete Sum for Two Strings** (LC 712) — structurally Edit-Distance-shaped, but each deletion costs the ASCII value of the character removed rather than a flat 1. Ask what changes and what doesn't.
- **Maximum Length of Repeated Subarray** (LC 718) — looks like LCS, but the match must be **contiguous** in both arrays. A deceptively small wording difference that changes the recurrence more than it first appears — a good test of whether you're pattern-matching on "two sequences" alone or actually reading the constraint.

**Knapsack family**
- **Last Stone Weight II** (LC 1049) — doesn't mention subsets or partitions anywhere in the problem statement. Ask: if you split the stones into two groups, what are you actually trying to minimize about their two sums? (The reduction lands you back on Partition-Equal-Subset-Sum-shaped thinking, just minimizing a difference instead of hitting equality exactly.)

---

## 11. What's Next

Whatever's left after 1-D and 2-D gets its own file, per the original plan. Likely contents:

- **Interval DP**, going beyond the preview in Section 5.3 — Burst Balloons (LC 312), Matrix Chain Multiplication (the classic, not on LeetCode by that name) — problems where `dp[i][j]` is a range in a single sequence and the recurrence adds a third loop over a split point `k` between `i` and `j`.
- **Bitmask DP** — problems where "which subset of items/cities has been used" is itself part of the state, encoded as an integer bitmask.
- **Digit DP** — counting how many numbers up to `N` satisfy some digit-level property.
- **Tree DP** — House Robber III (LC 337), Binary Tree Maximum Path Sum (LC 124), where the "state" is defined recursively over a tree's structure instead of an array index.
- **DP on graphs/DAGs** — Longest Increasing Path in a Matrix (LC 329), where the transitions form a directed acyclic graph rather than a simple index progression.

Same five-step framework throughout all of it. Only the shape of what counts as "a subproblem" keeps changing.

---

# Dynamic Programming — Part 3: Interval, Bitmask, Digit, Tree & Graph DP

The last file in the series — everything that didn't fit Part 1 (1-D) or Part 2 (2-D grid / two-string / knapsack). Same assumption as before: this builds directly on Parts 1 and 2 and doesn't re-teach the 5-step framework, the combinators, or space optimization. If a recurrence here feels like it came from nowhere, the derivation habit from Part 1, Section 3 still applies — it's the tool that gets you there, on every problem below exactly as it did on every problem before.

**How to use this guide:** same as always — write the state and recurrence yourself before reading mine. This file covers more ground than Parts 1 or 2 (five distinct families instead of one or three), so it leans a little more on *recognizing which family you're in* before you can even start applying the framework. Section 1 is entirely about that recognition step.

All code is Java, LeetCode-style, and every solution below — all twelve of them, across all five families — was compiled and run against verified examples before being written down. The digit-DP solution was additionally cross-checked against a brute-force count across 8 different values of N and 21 different target sums (168 comparisons, all agreeing).

**Contents**
1. [Why These Five Don't Fit the Earlier Molds](#1-why-these-five-dont-fit-the-earlier-molds)
2. [Interval DP — Worked Problems](#2-interval-dp--worked-problems)
3. [Bitmask DP — Worked Problems](#3-bitmask-dp--worked-problems)
4. [Digit DP — The Template](#4-digit-dp--the-template)
5. [Tree DP — Worked Problems](#5-tree-dp--worked-problems)
6. [DP on Graphs & DAGs — Worked Problems](#6-dp-on-graphs--dags--worked-problems)
7. [Common Mistakes & Pitfalls](#7-common-mistakes--pitfalls-1)
8. [Signal-Words Cheat Sheet](#8-signal-words-cheat-sheet-2)
9. [Quick-Reference Table](#9-quick-reference-table-1)
10. [Practice List — More Problems to Try Solo](#10-practice-list--more-problems-to-try-solo-1)
11. [Closing — The Whole Toolkit, End to End](#11-closing--the-whole-toolkit-end-to-end)

---

## 1. Why These Five Don't Fit the Earlier Molds

Part 1 was organized around one new idea (a single index is enough). Part 2 was organized around one new idea (sometimes you need two independent indices, and they always meant "how far into something"). Part 3 doesn't have one unifying new idea — instead, each of these five families breaks a *different* assumption that Parts 1 and 2 quietly relied on the whole time:

- **Interval DP** breaks the assumption that `dp[i][j]` means "two independent prefixes." Here, `i` and `j` are the two *ends of one range*, and the recurrence needs a genuinely new ingredient: a third loop over a split point `k`, trying every way to break the range in two.
- **Bitmask DP** breaks the assumption that the state fits in a small, fixed number of plain integers. Here, part of the state *is* an entire subset — "which of these items have I already used" — represented as the bits of an integer, which only stays tractable when the item count is small (roughly ≤ 20).
- **Digit DP** breaks the assumption that you're indexing into the *input* at all. The input is a number; the state comes from decomposing that number into digits and walking through them, carrying a "tight" flag that has no equivalent anywhere in Parts 1–2.
- **Tree DP** breaks the assumption that there's an obvious linear (or grid) fill order. The "index" is a node in a tree; the fill order comes for free from recursion (children before parents) rather than from a for-loop.
- **DP on Graphs/DAGs** breaks the assumption that the dependency structure is obvious from the indices themselves. Before memoizing anything, you have to convince yourself the transitions actually form a DAG — no cycles — and sometimes the state needs an extra "budget" dimension (edges used, stops remaining) layered on top of the graph's own nodes.

Five different assumptions, five different fixes. The throughline across all of them, and across the whole series: identify exactly what a subproblem needs to be fully specified, then let that — not habit, not the previous problem's shape — dictate the state.

---

## 2. Interval DP — Worked Problems

The shared shape across this section: `dp[i][j]` describes a **range** within a single sequence, and the recurrence asks *"where's the best point to split this range?"* — trying every split point `k` and combining `dp[i][k]` with `dp[k][j]` (or `dp[k+1][j]`), usually plus some cost tied to the split itself. That third loop over `k` is the one genuinely new mechanical piece here; the rest (state over a range, fill by increasing length) is exactly Part 2 Section 5.3's Longest Palindromic Subsequence, generalized.

### 2.1 Matrix Chain Multiplication — the classic template

Not a LeetCode problem by this name, but foundational enough that it's worth learning in raw form first, the same way Part 2 used 0/1 Knapsack as a template before its LeetCode variations. Given a chain of matrices to multiply (matrix `i` has dimensions `dims[i-1] x dims[i]`), and knowing matrix multiplication is associative, find the minimum number of scalar multiplications needed — the total cost depends entirely on how the chain gets parenthesized.

**Approach.**
- *State:* `dp[i][j]` = minimum cost to compute the product of matrices `i` through `j`.
- *Recurrence:* try every split point: `dp[i][j] = min over k in [i, j) of dp[i][k] + dp[k+1][j] + dims[i-1]*dims[k]*dims[j]` — the first two terms are the cost of computing each half, the last term is the cost of the one multiplication that combines them.
- *Base case:* `dp[i][i] = 0` (a single matrix needs no multiplication).
- *Fill order:* by increasing chain length.

**Code:**

```java
static int matrixChainOrder(int[] dims) {
    int n = dims.length - 1;              // number of matrices
    int[][] dp = new int[n + 1][n + 1];    // 1-indexed
    for (int len = 2; len <= n; len++) {
        for (int i = 1; i <= n - len + 1; i++) {
            int j = i + len - 1;
            dp[i][j] = Integer.MAX_VALUE;
            for (int k = i; k < j; k++) {
                int cost = dp[i][k] + dp[k + 1][j] + dims[i - 1] * dims[k] * dims[j];
                dp[i][j] = Math.min(dp[i][j], cost);
            }
        }
    }
    return dp[1][n];
}
```

**Walkthrough.** `dims = [40, 20, 30, 10, 30]` (four matrices: 40×20, 20×30, 30×10, 10×30) → 26000 — matches the textbook answer.

**Interview notes.** O(n³) time (O(n²) states, O(n) work each), O(n²) space. If you can derive this cleanly from the framework, the split-point pattern transfers directly to Burst Balloons next — same shape, different cost function at the split.

---

### 2.2 Burst Balloons (LeetCode 312)

`n` balloons in a row, each with a number. Bursting balloon `i` earns `nums[left] * nums[i] * nums[right]` coins, where `left`/`right` are balloon `i`'s *current* neighbors at the moment it's burst (missing neighbors off either end count as value 1). Maximize total coins from bursting every balloon.

**Approach.** The natural first instinct — think about which balloon to burst *first* — doesn't decompose cleanly: whichever balloon you burst first changes what its own neighbors are worth on *their* turns, tangling the subproblems together. The fix is to reframe: think about which balloon is burst **last** within a given range. Whichever balloon that is, at the moment it's burst, everything else inside the range is already gone — so its neighbors at that exact moment are guaranteed to be the range's fixed outer boundary, not some subproblem-dependent value. That's what makes the subproblems independent.
- *State:* `dp[i][j]` = max coins from bursting every balloon strictly *between* (padded) indices `i` and `j`, leaving `i` and `j` themselves standing as fixed walls.
- *Recurrence:* `dp[i][j] = max over k strictly between i and j of dp[i][k] + dp[k][j] + balloons[i]*balloons[k]*balloons[j]` — `k` is the balloon burst *last* in this range, so its neighbors at that moment are exactly the still-standing walls `i` and `j`.
- *Base case:* `dp[i][i+1] = 0` (no balloons strictly between adjacent indices).
- *Setup:* pad the array with a `1` at each end, matching the problem's rule that a missing neighbor counts as 1.

**Code:**

```java
static int maxCoins(int[] nums) {
    int n = nums.length;
    int[] balloons = new int[n + 2];
    balloons[0] = 1; balloons[n + 1] = 1;
    for (int i = 0; i < n; i++) balloons[i + 1] = nums[i];
    int[][] dp = new int[n + 2][n + 2];
    for (int len = 2; len <= n + 1; len++) {
        for (int i = 0; i + len <= n + 1; i++) {
            int j = i + len;
            for (int k = i + 1; k < j; k++) {
                int coins = dp[i][k] + dp[k][j] + balloons[i] * balloons[k] * balloons[j];
                dp[i][j] = Math.max(dp[i][j], coins);
            }
        }
    }
    return dp[0][n + 1];
}
```

**Walkthrough.** `nums = [3,1,5,8]` → 167 (burst order `1, 5, 3, 8`: `3·1·5 + 3·5·8 + 1·3·8 + 1·8·1 = 15+120+24+8 = 167`) — matches.

**Interview notes.** O(n³) time, O(n²) space. The transferable lesson matters more than this specific problem: **whenever a "remove/burst/merge one at a time" problem's subproblems refuse to decouple in the direction you first tried, try reasoning about the *last* decision in a range instead of the *first*.** This single reframing move — not any specific code — is what makes this problem tractable at all.

---

### 2.3 Palindrome Partitioning II (LeetCode 132)

Given a string, partition it into palindromic substrings using the minimum number of cuts.

**Approach.** Two layers, stacked. First, an interval-DP precomputation; then a 1-D DP built on top of it.
- *Layer 1 — precompute `isPalin[i][j]`:* true if `s[i..j]` is a palindrome. `isPalin[i][j] = (s[i] == s[j]) && (length ≤ 2 || isPalin[i+1][j-1])`, filled by increasing length. This is exactly Part 2 Section 5.3's shape, just answering a boolean instead of a length.
- *Layer 2 — `cuts[i]`* = minimum cuts needed to partition `s[0..i]` into palindromes. If `s[0..i]` is itself a palindrome (an O(1) lookup into layer 1), zero cuts are needed. Otherwise, try every possible *last* cut point `j < i` where `s[j+1..i]` is a palindrome, and take the best: `cuts[i] = min over valid j of cuts[j] + 1`.

**Code:**

```java
static int minCut(String s) {
    int n = s.length();
    boolean[][] isPalin = new boolean[n][n];
    for (int len = 1; len <= n; len++) {
        for (int i = 0; i + len - 1 < n; i++) {
            int j = i + len - 1;
            if (s.charAt(i) == s.charAt(j) && (len <= 2 || isPalin[i + 1][j - 1])) {
                isPalin[i][j] = true;
            }
        }
    }
    int[] cuts = new int[n];
    for (int i = 0; i < n; i++) {
        if (isPalin[0][i]) {
            cuts[i] = 0;
        } else {
            cuts[i] = Integer.MAX_VALUE;
            for (int j = 0; j < i; j++) {
                if (isPalin[j + 1][i]) cuts[i] = Math.min(cuts[i], cuts[j] + 1);
            }
        }
    }
    return cuts[n - 1];
}
```

**Walkthrough.** `s = "aab"` → 1 (cut into `"aa" | "b"`) — matches.

**Interview notes.** O(n²) time and space overall (both layers are O(n²)). Included specifically to make a point the other two problems in this section don't: these families **combine**. This isn't "pure" interval DP — it's an interval-DP precomputation feeding a different, 1-D DP layered on top. Using one DP's finished table as an O(1) lookup helper inside a second DP is an extremely common real pattern, not a special trick unique to this problem.

---

## 3. Bitmask DP — Worked Problems

Shared shape: part of the state is *"which items, out of a small fixed set, have already been used"* — and the cleanest way to represent an arbitrary subset of up to ~20 items is as the bits of an integer, where bit `i` is 1 exactly when item `i` has been used. This only stays computationally reasonable because `2ⁿ` is small when `n` is small. Bitmask DP is recognizable from the input constraints as much as from the wording: **`n ≤ 15–20`** is a strong, near-unmistakable hint.

### 3.1 Traveling Salesman Problem — the classic template

`n` cities, `cost[i][j]` = cost to travel from city `i` to city `j`. Starting and ending at city 0, visit every city exactly once, minimizing total cost.

**Approach.**
- *State:* `dp[mask][i]` = minimum cost to have visited exactly the cities in `mask`, currently standing at city `i` (which must itself be a member of `mask`).
- *Recurrence:* to have just arrived at `i` having visited exactly `mask`, you must have come from some other city `j` that was *already* visited — i.e., `j ∈ mask \ {i}` — paying the edge cost from `j` to `i`: `dp[mask][i] = min over j in mask, j≠i, of dp[mask without i][j] + cost[j][i]`.
- *Base case:* `dp[{0}][0] = 0` — visited only the starting city, standing there, cost 0 so far.
- *Answer:* `min over i≠0 of dp[full mask][i] + cost[i][0]` — close the loop back to the start.

**Code:**

```java
static int tsp(int[][] cost) {
    int n = cost.length;
    int FULL = 1 << n;
    int INF = Integer.MAX_VALUE / 2;
    int[][] dp = new int[FULL][n];
    for (int[] row : dp) Arrays.fill(row, INF);
    dp[1][0] = 0;
    for (int mask = 1; mask < FULL; mask++) {
        for (int i = 0; i < n; i++) {
            if ((mask & (1 << i)) == 0 || dp[mask][i] == INF) continue;
            for (int j = 0; j < n; j++) {
                if ((mask & (1 << j)) != 0) continue;           // already visited
                int newMask = mask | (1 << j);
                dp[newMask][j] = Math.min(dp[newMask][j], dp[mask][i] + cost[i][j]);
            }
        }
    }
    int best = INF;
    for (int i = 1; i < n; i++) {
        if (dp[FULL - 1][i] != INF) best = Math.min(best, dp[FULL - 1][i] + cost[i][0]);
    }
    return best;
}
```

**Walkthrough.** The classic 4-city example (`cost = {{0,10,15,20},{10,0,35,25},{15,35,0,30},{20,25,30,0}}`) → 80 (route `0→1→3→2→0`: `10+25+30+15=80`) — matches.

**Interview notes.** O(2ⁿ · n²) time, O(2ⁿ · n) space — this is *why* `n` gets capped small in practice: `n=20` already means `2²⁰ · 400 ≈ 4×10⁸`, pushing the limit. Brute-force permutation checking would be O(n!), so this is a genuine, large improvement — just not a polynomial-time one. Say that explicitly if asked: TSP is NP-hard, and this DP is the standard "exact but exponential, far better than brute force" answer, not a polynomial algorithm in disguise.

---

### 3.2 Partition to K Equal Sum Subsets (LeetCode 698)

Given an array and an integer `k`, determine whether the array can be partitioned into `k` subsets with equal sums.

**Approach.** First, a reduction: the total sum must be divisible by `k` (otherwise immediately impossible); `target = total / k`.
- *State:* `dp[mask]` = true if the elements in `mask` can be validly grouped into complete buckets of size *exactly* `target` — not merely "`sum(mask)` happens to be a multiple of `target`," which is necessary but nowhere near sufficient; the DP's job is to confirm a valid bucket-respecting *order* actually exists.
- *Recurrence:* from a reachable `mask`, for any unused element `i`, adding it is legal exactly when it doesn't overflow the *current*, partially-filled bucket: `(sum(mask) mod target) + nums[i] ≤ target`. If legal, `mask | (1<<i)` becomes reachable too.
- *Base case:* `dp[0] = true` (nothing placed yet).

**Code:**

```java
static boolean canPartitionKSubsets(int[] nums, int k) {
    int total = 0;
    for (int num : nums) total += num;
    if (total % k != 0) return false;
    int target = total / k;
    int n = nums.length;
    for (int num : nums) if (num > target) return false;

    int[] maskSum = new int[1 << n];
    boolean[] dp = new boolean[1 << n];
    dp[0] = true;
    for (int mask = 0; mask < (1 << n); mask++) {
        if (!dp[mask]) continue;
        int used = maskSum[mask] % target;
        for (int i = 0; i < n; i++) {
            if ((mask & (1 << i)) != 0) continue;
            if (used + nums[i] > target) continue;
            int newMask = mask | (1 << i);
            if (!dp[newMask]) {
                dp[newMask] = true;
                maskSum[newMask] = maskSum[mask] + nums[i];
            }
        }
    }
    return dp[(1 << n) - 1];
}
```

**Walkthrough.** `nums = [4,3,2,3,5,2,1]`, `k = 4` → true (`target=5`; buckets `{4,1}`, `{3,2}`, `{3,2}`, `{5}`) — matches.

**Interview notes.** O(2ⁿ · n) time. The subtlety worth saying out loud: filtering masks by "is `sum(mask)` divisible by `target`" is *not* the same claim as "is `mask` actually reachable through a valid sequence of legal bucket-respecting moves" — the transition-based reachability check is what the recurrence is really verifying, and it's a strictly stronger, correct condition.

---

### 3.3 Shortest Path Visiting All Nodes (LeetCode 847)

An undirected, connected graph. Find the length of the shortest walk that visits every node (revisiting nodes/edges is allowed).

**Approach.** Included specifically to make a point the other two bitmask problems don't: bitmask DP is really about defining a **state space**, `(mask, node)`, and the algorithm you run *over* that space can vary. Here, every edge has the same weight (1), so BFS over states is the right tool — it's equivalent to a DP recurrence for `dp[mask][node]` = minimum steps, just computed via BFS layers instead of an explicit loop, because BFS naturally processes states in exactly the order — increasing distance — that this state space needs.
- *States:* `(mask, node)` = "which nodes visited so far, currently standing at `node`."
- *Transitions:* from `(mask, node)`, for each neighbor `next` of `node`, move to `(mask | (1<<next), next)` at one more step.
- *Start states:* `(1<<i, i)` for every node `i`, at distance 0 — you may start anywhere.
- *Answer:* the first time BFS reaches *any* state where `mask` is full.

**Code:**

```java
static int shortestPathLength(int[][] graph) {
    int n = graph.length;
    int FULL = (1 << n) - 1;
    Queue<int[]> queue = new LinkedList<>();
    boolean[][] visited = new boolean[1 << n][n];
    for (int i = 0; i < n; i++) {
        queue.offer(new int[]{1 << i, i});
        visited[1 << i][i] = true;
    }
    int steps = 0;
    while (!queue.isEmpty()) {
        int size = queue.size();
        for (int s = 0; s < size; s++) {
            int[] curr = queue.poll();
            int mask = curr[0], node = curr[1];
            if (mask == FULL) return steps;
            for (int next : graph[node]) {
                int newMask = mask | (1 << next);
                if (!visited[newMask][next]) {
                    visited[newMask][next] = true;
                    queue.offer(new int[]{newMask, next});
                }
            }
        }
        steps++;
    }
    return -1;
}
```

**Walkthrough.** Star graph `[[1,2,3],[0],[0],[0]]` (node 0 connects to 1, 2, 3; nothing else connects) → 4 (must shuttle out from the hub and back for each leaf: e.g. `1→0→2→0→3`) — matches.

**Interview notes.** O(2ⁿ · n) states, each explored once thanks to the `visited` array. Efficient specifically because uniform edge weights let plain BFS substitute for a full Dijkstra. **If edges had different weights, you'd run Dijkstra over this exact same `(mask, node)` state space instead** — same state space, different traversal algorithm layered on top. That substitution — state space stays fixed, algorithm on top adapts to the edge-weight structure — is the generalizable idea.

---

## 4. Digit DP — The Template

A genuinely different flavor from everything so far: the input isn't an array, string, or tree to index into — it's a **number**, and the question is almost always "how many integers in `[0, N]` (or some range) satisfy some digit-level property?" The state decomposes `N` into its digit string and walks through positions left to right, carrying one new idea that has no analog anywhere in Parts 1–2: a **`tight`** flag. `tight = true` means every digit chosen so far exactly matches `N`'s digits at those positions, so the *next* digit is capped at `N`'s digit there (going higher would exceed `N`). The moment a digit is placed strictly less than `N`'s digit at some position, `tight` becomes `false` — and stays false — because every remaining digit is now free to be anything 0–9; the number's already guaranteed to land below `N` regardless of what comes next.

### 4.1 Count Numbers With a Given Digit Sum — the classic template

Self-contained, standard formulation: given `N` and a target `S`, count integers in `[0, N]` whose digits sum to exactly `S`. This exact recursion shape — position, tight, plus one piece of problem-specific extra state — is the backbone of essentially every digit-DP problem; LeetCode's own examples (Numbers With Repeated Digits, Numbers At Most N Given Digit Set — both in the practice list) are this same template tracking a different piece of extra state instead of a running digit sum.

**Approach.**
- *State:* `solve(pos, tight, remainingSum)` = number of ways to fill in digits from position `pos` onward so the *complete* number's digit sum ends up exactly `S`, given `remainingSum = S - (sum of digits already chosen)`.
- *Recurrence:* try every legal digit `d` at this position — capped at `N`'s digit here if `tight`, otherwise free (0–9). Recurse to `pos+1` with `remainingSum - d`, and `tight` becomes `tight && (d equals the cap)`.
- *Base case:* `pos` reaches the end of `N`'s digit string — return 1 if `remainingSum` has been driven to exactly 0, else 0.
- *Memoization:* cache only on `(pos, remainingSum)`, and **only when `tight` is false**. There's exactly one tight path through the whole recursion at any given position — it's forced and deterministic — so memoizing it buys nothing (and would need tight as a third memo dimension for zero payoff). The non-tight states are the ones that genuinely recur across different earlier choices, and that's where memoization actually pays for itself.

**Code:**

```java
static int countWithDigitSum(int N, int targetSum) {
    String digits = Integer.toString(N);
    Integer[][] memo = new Integer[digits.length()][targetSum + 1];
    return dfs(digits, 0, targetSum, true, memo);
}

static int dfs(String digits, int pos, int remainingSum, boolean tight, Integer[][] memo) {
    if (remainingSum < 0) return 0;
    if (pos == digits.length()) return remainingSum == 0 ? 1 : 0;
    if (!tight && memo[pos][remainingSum] != null) return memo[pos][remainingSum];
    int limit = tight ? (digits.charAt(pos) - '0') : 9;
    int count = 0;
    for (int d = 0; d <= limit; d++) {
        count += dfs(digits, pos + 1, remainingSum - d, tight && (d == limit), memo);
    }
    if (!tight) memo[pos][remainingSum] = count;
    return count;
}
```

**Walkthrough.** Verified against a brute-force loop (compute each number's digit sum directly and count matches) across `N ∈ {0, 1, 9, 10, 23, 50, 99, 137}` and every `targetSum` from 0 to 20 — 168 total comparisons, all agreeing. That programmatic cross-check is deliberately used here instead of one hand-traced example, because digit DP's edge cases (the exact moment `tight` flips, the boundary digit itself) are exactly the kind of thing a single worked-by-hand example can miss.

**Interview notes.** O(digits × S) states after memoization, each O(10) to fill — dramatically better than enumerating every number up to `N` directly when `N` is large (the brute-force loop above is only viable for verification on small `N`, never as the real solution). The genuinely hard part of *any* digit-DP problem is almost never the recursion shape above — it's correctly identifying what problem-specific piece of extra state you need beyond `(pos, tight)`: a running sum (as here), a count of some particular digit, a "have I placed a nonzero digit yet" flag for leading-zero handling, or a small bitmask of digits used so far.

---

## 5. Tree DP — Worked Problems

The "index" in this section is a node in a tree, not an integer — so there's no simple for-loop fill order the way grid or interval DP had one. The fill order comes for free from recursion instead: children get resolved before their parent, exactly because that's how a post-order traversal works. Every problem below shares one shape: a recursive function returns something about the subtree rooted at the current node, built from what the recursive calls on its children returned — and, in the harder two, also updates a separate answer along the way for a quantity that doesn't cleanly "return" upward at all.

### 5.1 Diameter of Binary Tree (LeetCode 543)

The longest path (in edges) between *any* two nodes in a binary tree — not necessarily through the root.

**Approach.**
- *What each call returns:* the height of the subtree rooted here — the longest downward path from this node, in edges.
- *What each call also does along the way:* updates a running global maximum with `leftHeight + rightHeight` — the longest path that *bends* at this exact node, using both children at once. That bend candidate is deliberately **not** what gets returned upward; only one direction can be handed to the parent, since a path can't fork twice.
- *Base case:* a null node has height 0.

**Code:**

```java
static int diameterMax = 0;
static int diameterOfBinaryTree(TreeNode root) {
    diameterMax = 0;
    height(root);
    return diameterMax;
}
static int height(TreeNode node) {
    if (node == null) return 0;
    int l = height(node.left), r = height(node.right);
    diameterMax = Math.max(diameterMax, l + r);
    return 1 + Math.max(l, r);
}
```

**Walkthrough.** Tree `[1,2,3,4,5]` (1 root; 2 and 3 its children; 4 and 5 children of 2) → diameter 3 (path `4-2-1-3`, three edges) — matches.

**Interview notes.** O(n) time, single pass. This — "the value returned upward is a smaller, simpler thing than the answer actually being computed, which lives in a side variable instead" — is the single biggest idea to internalize before the two harder problems below, both of which use this exact shape.

---

### 5.2 House Robber III (LeetCode 337)

Part 1's House Robber (Section 6.3), now on a binary tree: can't rob a node and its direct parent/child on the same night; maximize total.

**Approach.** Each call returns a **pair** — `{best if this node is robbed, best if it isn't}`.
- `robThis = node.val + skip(left) + skip(right)` — robbing this node forces both children to be skipped.
- `skipThis = max(rob(left), skip(left)) + max(rob(right), skip(right))` — skipping this node lets each child independently pick whichever of *its* two options is better.
- *Base case:* a null node returns `{0, 0}`.
- *Final answer:* the max of the two values returned at the root.

**Code:**

```java
static int rob(TreeNode root) {
    int[] result = robHelper(root);
    return Math.max(result[0], result[1]);
}
static int[] robHelper(TreeNode node) {
    if (node == null) return new int[]{0, 0};
    int[] left = robHelper(node.left);
    int[] right = robHelper(node.right);
    int robThis = node.val + left[1] + right[1];
    int skipThis = Math.max(left[0], left[1]) + Math.max(right[0], right[1]);
    return new int[]{robThis, skipThis};
}
```

**Walkthrough.** `[3,2,3,null,3,null,1]` → 7 (rob the two `3`s at the bottom and the `1`) — matches.

**Interview notes.** O(n) time. This is Part 1's House Robber recurrence — rob it and skip the neighbor, or skip it — transplanted onto a tree, where "neighbor" becomes "children." Because a tree node can have up to *two* children (rather than Part 1's single linear predecessor), the return value grows from a single rolling number into a pair. Spotting "this is House Robber on a different structure" gets you to the recurrence far faster than deriving it from nothing.

---

### 5.3 Binary Tree Maximum Path Sum (LeetCode 124)

A path is any sequence of nodes connected by edges (each node used at most once); it doesn't need to include the root, and it doesn't need to run straight down — it can bend once, at any single node. Find the maximum path sum.

**Approach.** The key distinction from Diameter (5.1), and the single most common source of bugs on this exact problem: what gets **returned upward** and what gets used to **update the global answer** are genuinely different quantities here, more so than in 5.1.
- *Returned upward:* the best downward path sum starting at this node and extending into **at most one** child — since whatever the parent does with this value, it can only chain it onward in a single direction. Negative contributions are clamped to 0 (better to not extend into a child at all than to subtract from the total).
- *Used only for the global answer, never returned:* the best path that **bends** at this node, using both children at once: `node.val + max(0, leftGain) + max(0, rightGain)`.
- *Base case:* a null node contributes 0.

**Code:**

```java
static int maxSum;
static int maxPathSum(TreeNode root) {
    maxSum = Integer.MIN_VALUE;
    maxGain(root);
    return maxSum;
}
static int maxGain(TreeNode node) {
    if (node == null) return 0;
    int leftGain = Math.max(maxGain(node.left), 0);
    int rightGain = Math.max(maxGain(node.right), 0);
    int priceNewPath = node.val + leftGain + rightGain;
    maxSum = Math.max(maxSum, priceNewPath);
    return node.val + Math.max(leftGain, rightGain);
}
```

**Walkthrough.** `[1,2,3]` → 6 (path `2-1-3`). `[-10,9,20,null,null,15,7]` → 42 (path `15-20-7`, entirely skipping the negative root) — both match.

**Interview notes.** O(n) time. The most common bug here is returning the *bend* value (both children) instead of the single-direction value — code that compiles, often even passes a couple of simple hand-picked test cases, and then fails silently the moment the true best path doesn't happen to pass through the root. Say out loud, before writing a line of code: *"what I return and what I use to update my answer are two different numbers"* — that sentence alone prevents most of the bugs this problem is famous for.

---

## 6. DP on Graphs & DAGs — Worked Problems

Two ways this family typically shows up. First: the input already looks like a graph — a grid with constrained movement, a literal edge list — and the real first task is convincing yourself the transitions form a genuine DAG (no cycles), because that's the entire reason memoization is safe to use at all. Second: the DP state has an extra dimension layered directly onto graph nodes — "how many edges/stops have I used" — turning an ordinary shortest-path question into a real DP.

### 6.1 Longest Increasing Path in a Matrix (LeetCode 329)

Find the longest strictly increasing path in a grid, moving up/down/left/right.

**Approach.** The DAG insight comes first, before any DP: draw a directed edge from each cell to every neighbor with a *strictly greater* value. Could that graph ever contain a cycle? No — a cycle would require a sequence of strictly increasing values that loops back to its own starting value, which is impossible. So despite the grid superficially looking like an undirected, cycle-prone graph, the transitions this problem actually cares about form a genuine DAG — which is exactly what makes memoized DFS safe here.
- *State:* `dp[i][j]` = length of the longest strictly increasing path *starting* at `(i,j)`.
- *Recurrence:* `dp[i][j] = 1 + max over neighbors (ni,nj) with matrix[ni][nj] > matrix[i][j] of dp[ni][nj]`, or just 1 if no neighbor qualifies.
- No separate base case in the usual sense — the recursion bottoms out naturally at local maxima (cells with no larger neighbor), which correctly return 1.

**Code:**

```java
static int[][] memo;
static int[][] matrix;
static int rows, cols;
static int[] dr = {-1,1,0,0}, dc = {0,0,-1,1};

static int longestIncreasingPath(int[][] inputMatrix) {
    matrix = inputMatrix;
    rows = matrix.length; cols = matrix[0].length;
    memo = new int[rows][cols];
    int best = 0;
    for (int i = 0; i < rows; i++)
        for (int j = 0; j < cols; j++)
            best = Math.max(best, dfs(i, j));
    return best;
}
static int dfs(int i, int j) {
    if (memo[i][j] != 0) return memo[i][j];
    int best = 1;
    for (int d = 0; d < 4; d++) {
        int ni = i + dr[d], nj = j + dc[d];
        if (ni >= 0 && ni < rows && nj >= 0 && nj < cols && matrix[ni][nj] > matrix[i][j]) {
            best = Math.max(best, 1 + dfs(ni, nj));
        }
    }
    memo[i][j] = best;
    return best;
}
```

**Walkthrough.** `[[9,9,4],[6,6,8],[2,1,1]]` → 4 (path `1 → 2 → 6 → 9`) — matches.

**Interview notes.** O(m·n) time — each cell computed exactly once thanks to memoization, O(1) neighbor work each — despite superficially resembling something that could blow up combinatorially (a naive, unmemoized DFS from every starting cell would revisit enormous amounts of overlapping work, precisely Part 1 Section 2's Fibonacci-tree explosion, just spread across a grid instead of a line). Confirming the "no cycles" property is the entire ballgame on this problem — say it out loud before writing any code, because it's the fact that justifies the whole approach.

---

### 6.2 Cheapest Flights Within K Stops (LeetCode 787)

`n` cities, weighted directed flights. Find the cheapest price from `src` to `dst` using at most `K` stops (i.e., at most `K+1` edges).

**Approach.** This is Bellman-Ford's edge-relaxation process, which is itself a DP recurrence wearing graph-algorithm clothing — each "round" of relaxation is exactly one more allowed edge.
- *State:* `dp[v]` after `r` rounds = minimum cost to reach `v` using at most `r` edges.
- *Recurrence per round:* for every directed edge `(u, v, weight)`: `newDp[v] = min(newDp[v], dp[u] + weight)` — reading `dp[u]` from the **previous round's snapshot**, never from a value already updated earlier in the *same* round.
- *Base case:* `dp[src] = 0`, everything else infinity, before any rounds.
- Run exactly `K+1` rounds.

**Code:**

```java
static int findCheapestPrice(int n, int[][] flights, int src, int dst, int k) {
    int[] dp = new int[n];
    Arrays.fill(dp, Integer.MAX_VALUE);
    dp[src] = 0;
    for (int iter = 0; iter <= k; iter++) {
        int[] newDp = dp.clone();
        for (int[] flight : flights) {
            int u = flight[0], v = flight[1], w = flight[2];
            if (dp[u] != Integer.MAX_VALUE) newDp[v] = Math.min(newDp[v], dp[u] + w);
        }
        dp = newDp;
    }
    return dp[dst] == Integer.MAX_VALUE ? -1 : dp[dst];
}
```

**Walkthrough.** 4 cities, edges `[[0,1,100],[1,2,100],[2,0,100],[1,3,600],[2,3,200]]`, `src=0, dst=3`. With `k=1` (≤2 edges) → 700 (`0→1→3`, since the cheaper 3-edge route isn't reachable in time). With `k=2` (≤3 edges) → 400 (`0→1→2→3`, `100+100+200`, now reachable) — both verified.

**Interview notes.** O(K · edges) time. The subtlety worth flagging explicitly, because it directly echoes Part 2 Section 6.1's knapsack lesson: within a single round, you must read from the **previous** round's snapshot, never from values already updated earlier in the *same* round — reading from an in-progress array would let one round silently chain multiple edges together, letting a path use more hops than that round should allow. Same underlying bug family as 0/1 Knapsack's forward-iteration mistake — **"which snapshot of the array am I reading from"** — showing up a third time, in a completely different problem shape. That question has now mattered in Part 2's knapsack space optimization and twice in this file; it's worth having as a standing reflex any time a DP updates an array in place.

---

## 7. Common Mistakes & Pitfalls

- **Wrong fill order in interval DP.** The split-point loop needs `dp[i][k]` and `dp[k+1][j]` (or `dp[k][j]`) already computed — which only holds if you fill by increasing range length, not row-by-row. Get this backward and Java won't crash; it'll silently read zeros from not-yet-computed cells, producing a plausible-looking wrong answer.
- **Off-by-one on which bit is which, in bitmask DP.** `mask` ranges over `0` to `2ⁿ - 1` (that's `2ⁿ` total values, not `2ⁿ - 1`) — a very easy array-sizing slip. Double-check whichever loop bound or array size touches `1 << n`.
- **Reaching for bitmask DP on inputs too large for it.** It's correctness-irrelevant but performance-fatal: `n` around 20 is already near the practical ceiling for `O(2ⁿ · n)`-ish solutions. If a problem's constraints allow `n` in the hundreds, a bitmask approach is the wrong tool even if the recurrence you'd write is technically correct.
- **Over-memoizing in digit DP.** Caching `tight = true` states wastes effort for zero benefit (there's only ever one such path per position — nothing to reuse) and, done carelessly, can introduce real correctness bugs since a tight state's validity is inherently tied to context a simple `(pos, sum)` cache key doesn't capture. Memoize only the non-tight states.
- **Confusing "returned upward" with "the answer" in tree DP.** Binary Tree Maximum Path Sum's signature trap: the value handed to a node's parent (one direction only) and the value used to update the global best (both directions, a bend) are genuinely different numbers. Conflating them is the single most common way to fail that problem.
- **Memoizing over a cyclic transition structure.** Memoized DFS is only safe when the transitions form a DAG. If there's any risk of a cycle, confirm it's actually acyclic first (as in Longest Increasing Path's "strictly greater" argument) — otherwise you need a fundamentally different tool (Bellman-Ford-style relaxation, Dijkstra, explicit cycle detection), not a tweak to the memoized version.
- **"Which array snapshot am I reading from," across the whole series.** This exact bug shape has now appeared three times: Part 1's Coin Change II (forward iteration was *correct* because coin reuse was wanted), Part 2's 0/1 Knapsack (reverse iteration was *required* because item reuse was *not* wanted), and this file's Cheapest Flights (must read the previous round's snapshot, not the in-progress one). Different problems, identical underlying question — worth a standing reflex any time a DP updates a shared array in place.

---

## 8. Signal-Words Cheat Sheet

| Phrase in the problem | Family |
|---|---|
| Optimal way to parenthesize/order/merge a **sequence**, cost depends on the grouping | Interval DP |
| "Burst/remove/merge one at a time," reward depends on current neighbors | Interval DP (reason about the *last* removal, not the first) |
| Small `n` (roughly ≤ 20), "visit every X exactly once," permutation-flavored | Bitmask DP |
| "Partition into `k` groups," small `n` | Bitmask DP |
| Counting integers up to `N` with a digit-level property | Digit DP |
| Binary tree, "maximum/minimum ... path/sum ... in a tree" | Tree DP |
| A grid or graph where a strict ordering constrains movement (increasing values, one-way edges) | DP on a DAG |
| "At most `K` edges/stops/steps" layered onto a shortest-path question | DP on a graph with a budget dimension |

---

## 9. Quick-Reference Table

| Problem | State | Core Recurrence | Time |
|---|---|---|---|
| Matrix Chain Multiplication | `dp[i][j]` = cost to multiply matrices `i..j` | `min over k of dp[i][k]+dp[k+1][j]+dims[i-1]·dims[k]·dims[j]` | O(n³) |
| Burst Balloons | `dp[i][j]` = coins from balloons strictly between `i,j` | `max over k of dp[i][k]+dp[k][j]+balloons[i]·[k]·[j]` | O(n³) |
| Palindrome Partitioning II | `isPalin[i][j]` then `cuts[i]` | interval bool, then `min over j of cuts[j]+1` | O(n²) |
| TSP | `dp[mask][i]` = min cost, visited `mask`, at `i` | `min over j in mask of dp[mask\i][j]+cost[j][i]` | O(2ⁿ·n²) |
| Partition to K Equal Subsets | `dp[mask]` reachable? | `dp[mask] → dp[mask\|(1<<i)]` if bucket not overflowed | O(2ⁿ·n) |
| Shortest Path Visiting All Nodes | `(mask, node)` state space, BFS | BFS layer = +1 step | O(2ⁿ·n) |
| Digit sum count | `solve(pos, tight, remainingSum)` | branch on digit `d ≤ limit`, recurse | O(digits·S·10) |
| Diameter of Binary Tree | `height(node)` returned; global max on the side | `diameterMax = max(diameterMax, l+r)` | O(n) |
| House Robber III | `{robThis, skipThis}` pair returned | `robThis=val+skip(l)+skip(r)`; `skipThis=max(...)+max(...)` | O(n) |
| Binary Tree Maximum Path Sum | single-direction gain returned; global max on the side | `maxSum=max(maxSum, val+leftGain+rightGain)` | O(n) |
| Longest Increasing Path in Matrix | `dp[i][j]` = longest path starting at `(i,j)` | `1+max over greater neighbors of dp[ni][nj]` | O(m·n) |
| Cheapest Flights Within K Stops | `dp[v]` after `r` rounds | `newDp[v]=min(newDp[v], dp[u]+w)`, read prev-round snapshot | O(K·edges) |

---

## 10. Practice List — More Problems to Try Solo

Same rule as Parts 1 and 2: no state or recurrence given.

- **Minimum Cost Tree From Leaf Values** (LC 1130, interval family) — the split-point idea from Matrix Chain Multiplication, with a cost function built from range maximums instead of matrix dimensions.
- **Smallest Sufficient Team** (LC 1125, bitmask family) — the mask this time represents a set of *skills* covered, not cities visited; `dp[mask]` tracks the smallest team of people covering that skill set.
- **Numbers With Repeated Digits** (LC 1012, digit family) — apply Section 4's template directly, tracking a bitmask of digits used so far as the problem-specific extra state (a nice combination of digit DP *and* bitmask DP in one problem).
- **Numbers At Most N Given Digit Set** (LC 902, digit family) — same template, different extra state again; a good test of whether the `(pos, tight)` skeleton actually generalized for you.
- **Binary Tree Cameras** (LC 968, tree family) — harder than the three in Section 5: each node's return value needs *three* states (uncovered / covered without a camera / has a camera), not two.
- **Number of Ways to Arrive at Destination** (LC 1976, graph family) — Dijkstra with an extra "count the number of shortest paths, not just their length" layer alongside the distances — ask what additional piece of state that counting needs.

---

## 11. Closing — The Whole Toolkit, End to End

Three files, one method, applied to eight different shapes of state:

- **Part 1:** `dp[i]` — one index.
- **Part 2:** `dp[i][j]` — two independent indices (grid position, two-string prefixes, or item-count-and-capacity).
- **Part 3:** `dp[i][j]` over a *range* (interval), `dp[mask][...]` over a *subset* (bitmask), `dp[pos][tight][...]` over a *number's digits* (digit), a value returned through *recursive tree structure* (tree), and `dp` over *graph nodes with an extra budget dimension* (graph/DAG).

Every single one of those was reached the same way: name what a subproblem needs to be fully specified (Part 1, Section 3, Step 2), find the recurrence by asking what the last decision was (Step 3), pin down the base case (Step 4), and choose a fill order that respects what depends on what (Step 5) — row-by-row, by increasing length, by BFS layer, or by post-order recursion, whichever the state shape actually calls for. The combinators from Part 1 Section 7 — OR, MIN/MAX, SUM — kept showing up unchanged in every single family across all three files, because they were never about arrays in the first place; they're about what kind of question is being asked. And the "which snapshot of the array am I reading from" caution turned up three separate times, in three unrecognizable disguises, because in-place updates create the same hazard everywhere they appear.

That's the whole method. Everything else — new problems, new state shapes, whatever LeetCode adds next year — is a new instance of the same five steps, not a new thing to learn from scratch.

---