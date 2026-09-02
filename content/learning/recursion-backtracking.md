# Recursion & Backtracking — From Scratch to Interview-Ready

This is meant to be read once slowly, then kept as a reference. Part 1 builds the mental model for recursion itself. Part 2 builds backtracking on top of it as a specific, disciplined *way of using* recursion. The goal isn't to memorize the worked examples — it's to internalize the **framework** in 1.3 and 2.3, so that a new, unfamiliar problem stops looking scary and starts looking like "oh, this is just the framework, applied here."

---

## Part 1 — Recursion

### 1.1 The mental model: trust and delegate

The instinct beginners have is to try to trace through *every single call* in their head — "first this happens, then this calls that, then that returns, then..." This works for tiny examples and completely breaks down for anything real. It's also not how experienced people think about recursion.

The actual mental model is closer to **mathematical induction**: assume the function already works correctly for a *smaller* version of the problem, and figure out how to build the answer to the *current* problem using that assumed-correct smaller answer. You don't trace the whole call chain — you trust one level down and stop thinking about it.

This is sometimes called the "recursive leap of faith." Concretely: if you're writing `sum(arr, i)` — the sum of `arr` from index `i` to the end — don't think about what happens for every `i`. Think about exactly one step: *"If `sum(arr, i+1)` already correctly gives me the sum of everything after index `i`, how do I get the sum from index `i` onward?"* Answer: `arr[i] + sum(arr, i+1)`. That's it. You never had to think about `i+2`, `i+3`, etc. — the leap of faith handles all of that for you, recursively, the same way.

### 1.2 How recursion actually executes: the call stack

Under the hood, every function call — recursive or not — pushes a **stack frame** onto the call stack. The frame holds that call's parameters, local variables, and "where to resume" when it returns. A recursive function just pushes a *new* frame for itself before the current one has been popped.

`factorial(4)` grows the stack like this, then unwinds:

```
call:                         return:
factorial(4)                  24  <- 4 * 6
  factorial(3)                 6  <- 3 * 2
    factorial(2)                2  <- 2 * 1
      factorial(1)              1  <- base case
```

Each indent level is a live stack frame, holding its own copy of `n`. `factorial(1)` hits the base case and returns `1` *without pushing further* — that return value then flows back up, each frame multiplying it by its own `n`, until the outermost call resolves.

Two direct consequences of this that matter a lot in practice:

- **Stack depth = space cost.** A recursive call chain `n` deep uses O(n) stack frames, i.e., O(n) space, even if the function itself uses no extra data structures. This is easy to forget when you're only counting "extra variables I declared."
- **Stack overflow is a real failure mode.** If the base case is wrong, missing, or unreachable, the stack keeps growing until it runs out — `StackOverflowError` in Java. This is usually *the* first thing to suspect when recursive code crashes instead of returning a wrong answer.
- **Java does not do tail-call optimization.** Some languages (Scheme, some functional languages) detect when a recursive call is the very last thing a function does and reuse the current stack frame instead of pushing a new one, making "tail recursive" code run in O(1) space. The JVM does **not** do this. So writing Java recursion in a "tail-recursive style" does not save you from stack depth — if you need to handle very deep recursion in Java, you either convert to an explicit loop with your own stack (a `Deque`), or you accept the recursion depth is bounded by the problem.

### 1.3 The recursion design framework

This is the process, every time, for any recursive function:

1. **Write the contract in plain English first**, before any code: what does this function take, and what does it promise to return? ("Given a sorted array and a target, return the index of target, or -1.") If you can't state this precisely, you're not ready to write the base case yet.
2. **Find the base case(s)** — the smallest/simplest input(s) you can answer directly, with no recursion. Ask: "what's the input so trivial I can just return the answer immediately?"
3. **Assume the recursive call already works** for a smaller/simpler input (the leap of faith). Don't verify this by tracing — just assume it, the same way you assume `P(n-1)` when proving `P(n)` by induction.
4. **Use that assumed-correct answer to build the current answer.** This is almost always "do a small amount of work, then combine it with the recursive result."
5. **Confirm every recursive call moves strictly closer to a base case.** This is what guarantees termination — if some path never shrinks the problem, you've written infinite recursion regardless of how correct the logic looks otherwise.

### 1.4 Worked examples

**Factorial** (linear recursion — one recursive call per invocation):

```java
static long factorial(int n) {
    if (n <= 1) return 1;              // base case
    return n * factorial(n - 1);       // trust factorial(n-1), use it
}
```

**Sum of an array:**

```java
static int sum(int[] arr, int i) {
    if (i == arr.length) return 0;             // base case: nothing left
    return arr[i] + sum(arr, i + 1);            // trust the rest, add my piece
}
```

**Fibonacci** (tree recursion — *multiple* recursive calls per invocation). This is the example that makes complexity visible, so it's worth sitting with:

```java
static int fib(int n) {
    if (n <= 1) return n;                        // base cases: fib(0)=0, fib(1)=1
    return fib(n - 1) + fib(n - 2);
}
```

The call tree for `fib(4)` looks like this:

```
fib(4)
├── fib(3)
│   ├── fib(2)
│   │   ├── fib(1) -> 1
│   │   └── fib(0) -> 0
│   └── fib(1) -> 1
└── fib(2)
    ├── fib(1) -> 1
    └── fib(0) -> 0
```

Notice `fib(2)` gets computed twice, from scratch, in two different branches. At larger `n` this redundancy compounds badly — that's exactly why naive recursive Fibonacci is exponential (more on this in 1.5). This tree is also the single most useful picture to have in your head for *any* recursion complexity question: draw the tree, count the nodes, that's your time complexity.

**Power function** (a nice "trick" — halving the problem instead of shrinking by one):

```java
static double power(double x, int n) {
    if (n == 0) return 1;
    double half = power(x, n / 2);
    return (n % 2 == 0) ? half * half : half * half * x;
}
```

Instead of `power(x, n-1)` (which needs `n` calls), this halves `n` each time, needing only O(log n) calls. Same idea as binary search — recognizing "can I cut the problem in half instead of by one?" is a pattern worth having on hand.

### 1.5 Analyzing recursive complexity

The reliable method: **draw the call tree, then count total work across all nodes.**

- **Linear recursion** (factorial, array sum, power-by-halving-adjacent): one call per level.
  - Factorial / sum: `T(n) = T(n-1) + O(1)` → the tree is a single chain of depth n → **O(n) time, O(n) space** (stack depth).
  - Power-by-halving: `T(n) = T(n/2) + O(1)` → depth is log n → **O(log n) time, O(log n) space**.
- **Tree recursion** (naive Fibonacci): two calls per level.
  - `T(n) = T(n-1) + T(n-2) + O(1)`. The tree roughly doubles in size each time n grows by 1 → **O(2ⁿ) time**. Space is still only **O(n)** though — the space cost is the *depth* of the tree (how far down one single path goes), not the total number of nodes, because only the frames on the *current* path are on the stack at any one moment; siblings that already returned are already popped.

That last point — time tracks *total nodes*, space tracks *depth* — is the one beginners most often get backwards, so it's worth restating: a tree with a million nodes but depth 20 is O(1,000,000) time but only O(20) space.

### 1.6 Common pitfalls

- **Missing or wrong base case** → the recursion never stops → stack overflow. Always write the base case *first*, before the recursive case, and double check it's actually reachable.
- **Not shrinking the problem on every recursive path.** It's easy to shrink on the "happy path" and forget a branch. If a function has multiple recursive calls (like tree recursion), check *all* of them move toward a base case, not just the first one you wrote.
- **Redundant recomputation.** The Fibonacci tree above recomputes the same subproblem repeatedly. When you notice a call tree has *repeated* subtrees (same parameters appearing more than once), that's the signal to cache results — that's memoization / DP, a separate topic, but recognizing the signal starts here.
- **Assuming Java optimizes tail calls.** It doesn't (see 1.2). Deep "tail-recursive-looking" Java code can still blow the stack.

---

## Part 2 — Backtracking

### 2.1 What backtracking actually is

Backtracking is recursion used in a specific, disciplined way: to explore *every* candidate in a space of possible configurations, building each candidate one decision at a time, and abandoning ("pruning") a partial candidate the moment you can prove it can't lead anywhere valid.

The whole technique compresses into three words: **choose → explore → un-choose.**

- **Choose** — commit to one option at the current step (add it to your in-progress state).
- **Explore** — recurse, now one decision deeper.
- **Un-choose** — before trying the *next* sibling option, undo exactly what you just did, so the state is clean for the next attempt.

That "un-choose" step is where the name comes from, and it's the piece that's easy to forget when you're translating the idea into code for the first time.

### 2.2 The universal backtracking template

Every backtracking solution — no matter how different the problems look on the surface — is a variation of this shape:

```java
void backtrack(List<Integer> currentState /* + whatever else you're tracking */) {
    if (isCompleteSolution(currentState)) {
        result.add(new ArrayList<>(currentState));  // COPY — see 2.6, this is the #1 bug
        return;
    }
    for (Choice choice : choicesAvailableRightNow()) {
        if (!isValid(choice, currentState)) continue;   // pruning: skip dead ends early

        currentState.add(choice);        // choose
        backtrack(currentState);         // explore
        currentState.remove(currentState.size() - 1);  // un-choose
    }
}
```

Four moving parts, and every backtracking problem is just these four filled in differently:

1. **Base case** — `isCompleteSolution(...)`: when is the state a finished, valid answer?
2. **The choice loop** — `choicesAvailableRightNow()`: what are the options at this exact point?
3. **Pruning** — `isValid(...)`: what disqualifies a choice before you waste time recursing into it?
4. **Choose / un-choose** — how you mutate the state, and its exact inverse.

### 2.3 The universal approach — four questions for *any* backtracking problem

This is the actual payoff of this whole document. When you see a new backtracking problem, don't look for which "pattern" (subsets? permutations? N-Queens?) it resembles first. Answer these four questions in order — the code falls out of the answers almost mechanically:

> 1. **What does a complete, valid solution look like?** → this is your base case.
> 2. **At any partial state, what are the possible next choices?** → this is what you loop over.
> 3. **What makes a choice invalid right now?** → this is your pruning condition, checked *before* recursing.
> 4. **How do I make a choice, and exactly how do I undo it?** → this is your state mutation and its inverse.

Every worked example below is explicitly answered against these four questions, on purpose — the point is to see the *same four questions*, answered differently, produce completely different-looking solutions.

### 2.4 Worked examples

#### Subsets (the power set)

*Given `[1,2,3]`, return all possible subsets, including `[]` and the full array.*

Four questions:
1. Complete solution? — Every state is valid, at every step (a subset can stop growing at any point). So there's no single "base case" check — instead, you record the current state *every time you enter the function*, not just at the end.
2. Choices? — At each step, choose the next number to *include*, from the remaining numbers after the last one you used (this ordering, `start` onward, is what prevents generating `[2,1]` as a separate subset from `[1,2]`).
3. Invalid? — Nothing to check here; every remaining number is a valid next choice.
4. Choose/un-choose? — Add `nums[i]` to `current`; after recursing, remove the last element.

```java
static void subsets(int[] nums, int start, List<Integer> current, List<List<Integer>> result) {
    result.add(new ArrayList<>(current));           // record at every node, not just leaves
    for (int i = start; i < nums.length; i++) {
        current.add(nums[i]);                       // choose
        subsets(nums, i + 1, current, result);       // explore (i+1, not i or 0 — no reuse, no going back)
        current.remove(current.size() - 1);          // un-choose
    }
}
```

Verified output for `[1,2,3]`: `[[], [1], [1,2], [1,2,3], [1,3], [2], [2,3], [3]]` — 8 subsets, matching 2³.

#### Permutations

*Given `[1,2,3]`, return all orderings.*

Four questions:
1. Complete solution? — `current.size() == nums.length`.
2. Choices? — Any number *not yet used* in this branch (order matters here, unlike subsets, so we can't just move a `start` pointer forward — we need to track which specific elements are already placed).
3. Invalid? — A number that's already in `current` for this branch (tracked with a `used[]` array).
4. Choose/un-choose? — Mark `used[i] = true`, add to `current`; after recursing, remove and mark `used[i] = false`.

```java
static void permute(int[] nums, List<Integer> current, boolean[] used, List<List<Integer>> result) {
    if (current.size() == nums.length) {
        result.add(new ArrayList<>(current));
        return;
    }
    for (int i = 0; i < nums.length; i++) {
        if (used[i]) continue;                       // pruning
        used[i] = true;
        current.add(nums[i]);                        // choose
        permute(nums, current, used, result);         // explore
        current.remove(current.size() - 1);           // un-choose
        used[i] = false;
    }
}
```

Verified output for `[1,2,3]`: 6 permutations, matching 3!.

#### Combination Sum

*Given `[2,3,6,7]` and target `7`, return all combinations that sum to the target — the same number can be reused unlimited times.*

Four questions:
1. Complete solution? — `remaining == 0`. (And `remaining < 0` is a dead branch — prune it.)
2. Choices? — Any candidate from `start` onward.
3. Invalid? — Anything that would push `remaining` below 0 — handled by checking at the top of the next call rather than before choosing, which keeps the code simpler here.
4. Choose/un-choose? — Add the candidate; recurse **with the same `start` index** (not `start + 1`) because reuse is allowed; then remove it.

```java
static void combinationSum(int[] candidates, int remaining, int start, List<Integer> current, List<List<Integer>> result) {
    if (remaining == 0) {
        result.add(new ArrayList<>(current));
        return;
    }
    if (remaining < 0) return;                        // pruning
    for (int i = start; i < candidates.length; i++) {
        current.add(candidates[i]);                    // choose
        combinationSum(candidates, remaining - candidates[i], i, current, result);  // i, not i+1: reuse allowed
        current.remove(current.size() - 1);             // un-choose
    }
}
```

Verified output for `[2,3,6,7]`, target `7`: `[[2,2,3], [7]]`.

The one line that decides "reuse allowed or not" across all three examples so far is worth noticing explicitly: **subsets/permutations move the index forward (`i+1`) or track `used[]`; combination-sum-with-reuse passes `i` again.** That single choice is almost the entire difference between these problem variants.

#### N-Queens

*Place `n` queens on an `n×n` board so none attack each other (no shared row, column, or diagonal). Return all solutions.*

This one looks intimidating but is the same four questions, just with a fancier validity check.

1. Complete solution? — A queen has been successfully placed in every row (`row == n`).
2. Choices? — For the current row, which column to place a queen in.
3. Invalid? — The column is already used, or the placement lands on a diagonal already occupied. (Two queens share a diagonal when `row - col` is equal, or `row + col` is equal — that's the whole diagonal-attack check, tracked with two boolean arrays instead of recomputing it by scanning the board each time.)
4. Choose/un-choose? — Place `'Q'`, mark column/diagonals used; after recursing, clear the cell and unmark.

```java
static void solveNQueens(char[][] board, int row, boolean[] cols, boolean[] diag1, boolean[] diag2,
                          List<List<String>> result, int n) {
    if (row == n) {
        List<String> snapshot = new ArrayList<>();
        for (char[] r : board) snapshot.add(new String(r));
        result.add(snapshot);
        return;
    }
    for (int col = 0; col < n; col++) {
        int d1 = row + col, d2 = row - col + n;         // shift d2 by +n so it's never negative (array index)
        if (cols[col] || diag1[d1] || diag2[d2]) continue;   // pruning

        board[row][col] = 'Q';                                    // choose
        cols[col] = diag1[d1] = diag2[d2] = true;
        solveNQueens(board, row + 1, cols, diag1, diag2, result, n);  // explore

        board[row][col] = '.';                                    // un-choose
        cols[col] = diag1[d1] = diag2[d2] = false;
    }
}
```

Verified: n=4 gives exactly 2 solutions, n=8 gives exactly 92 — matching the known values for this classic problem.

### 2.5 Complexity of backtracking

The general shape is **(branching factor) ^ (depth)** — but the *actual* runtime is usually much better than the worst case suggests, because pruning cuts off huge chunks of the tree before they're ever explored. Still, for a rough Big-O to state out loud in an interview, count leaves × cost-per-leaf:

| Problem | # of results (leaves) | Extra cost per result | Rough total |
|---|---|---|---|
| Subsets | 2ⁿ | O(n) to copy | O(n · 2ⁿ) |
| Permutations | n! | O(n) to copy | O(n · n!) |
| Combination Sum | problem-dependent | O(n) to copy | bounded by branching, hard to state cleanly — say "exponential, bounded by pruning on `remaining < 0`" |
| N-Queens | varies (92 for n=8) | O(n) per placement check | exponential in n, heavily reduced by the column/diagonal pruning |

**Space** is generally O(depth) for the recursion stack, plus O(depth) for the `current` state you're building (often the same thing), plus whatever space the accumulated `result` itself takes.

### 2.6 Common pitfalls (the first one is *the* classic Java bug)

**Forgetting to copy state before saving it — the #1 mistake.** `current` is one mutable object that gets reused and mutated throughout the entire recursion. If you do `result.add(current)` instead of `result.add(new ArrayList<>(current))`, every entry in `result` is a *reference to the same list* — not a snapshot. By the time the recursion finishes unwinding and `current` is back to empty, every single entry you "saved" now shows empty too, because they were never separate objects.

Here's the actual side-by-side, run for real:

```
Correct (with copy):     [[], [1], [1, 2], [1, 2, 3], [1, 3], [2], [2, 3], [3]]
Buggy (no copy):          [[], [], [], [], [], [], [], []]
```

Both versions run the identical logic and even produce a `result` of the correct *size* (8 entries) — which is exactly what makes this bug so sneaky. It doesn't crash, and a quick glance at `result.size()` looks fine. It just silently corrupts every entry to look like whatever `current` happened to be at the very end. Whenever you're accumulating `List`/`Set`/array state into a results collection during backtracking, this is the first thing to check.

**Forgetting to un-choose.** If you skip `current.remove(...)` (or fail to reset a `used[]`/visited flag) after the recursive call returns, the state leaks into sibling branches — the next iteration of the loop starts from a state that still has the previous choice baked in. This usually shows up as *wrong* results rather than a crash, which makes it slower to notice.

**Wrong loop start index.** Using `i = 0` instead of `i = start` (or `i = start` instead of `i = 0`) is the difference between "combinations" (order doesn't matter, no repeats of the same set) and "permutations" (order matters). Getting this backwards silently produces duplicate combinations in different orders, or misses valid orderings — always ask explicitly: *does this problem care about order?*

**Not pruning early enough.** Code that's logically correct but checks validity too late (after already recursing several levels deep into a dead branch) still gets the right answer — it just times out on larger inputs. Push the `isValid` check as early as possible, ideally right in the loop before you even make the choice.

### 2.7 Backtracking vs. recursion vs. DFS

These terms get used loosely, so it's worth being precise once:

- **All backtracking is recursion. Not all recursion is backtracking.** Factorial is recursion; it isn't backtracking (there's no "undo," no choice being explored and abandoned).
- **Backtracking is DFS over an implicit tree of choices**, where each node is a partial state and each edge is a decision. "Go deep, then back up and try the next branch" *is* depth-first search — backtracking is just what we call DFS specifically when it's being used to construct and search through candidate solutions, with pruning added to skip branches that can't work.
- In practice, when someone asks you to do DFS on a grid or graph *and build up a path/state as you go* (like Word Search), you are writing backtracking, even if nobody calls it that in the problem statement.

### 2.8 Interview approach checklist

When a new backtracking problem shows up, work through this in order:

1. Restate out loud: what counts as one complete, valid solution?
2. Identify the choice being made at each recursive step — what is a single "node" in the decision tree?
3. Identify pruning conditions, and put that check as early as possible (ideally before recursing, not after).
4. Write the base case first, before anything else.
5. Write the loop: choose → recurse → un-choose. Say the "un-choose" line out loud as you write it — it's the one that gets skipped under pressure.
6. Before declaring done: confirm you're copying state into results (2.6), and confirm the un-choose exactly reverses the choose.
7. For complexity: count the leaves of the decision tree (that's roughly your solution count) and multiply by the cost of handling one leaf.

### 2.9 Practice problems (same framework, on your own)

Each of these is a direct application of 2.3 — try answering the four questions before writing any code:

- **Word Search** — choices are the four grid directions; pruning is the boundary/visited/letter-mismatch check; the "un-choose" is un-marking the cell as visited.
- **Palindrome Partitioning** — choices are "where does the next substring end"; pruning is "is this substring a palindrome."
- **Generate Parentheses** — choices are "add `(` or add `)`"; pruning is the open/close count constraints.
- **Letter Combinations of a Phone Number** — choices are the letters mapped to the current digit; base case is "used all digits."
- **Sudoku Solver** — choices are digits 1–9 for the next empty cell; pruning is the row/column/box constraint (you already reasoned about this exact constraint shape in the Valid Sudoku complexity discussion).
- **Combination Sum II / Permutations II** (with duplicate numbers allowed in the input) — same templates as above, plus one extra pruning rule to skip duplicate choices *at the same recursion level* so you don't generate the same result twice.

---

# Backtracking Decision Framework: `visited[]` vs. `start` vs. `i = 0`

A quick-reference for picking the right loop shape in a backtracking problem, plus one fully worked example (Word Search) showing the framework applied to a grid instead of a flat array.

## The two questions

It comes down to two yes/no questions, not four things to memorize:

1. **Does the output care about order?** Is `[1,2]` a different result from `[2,1]`, or the same one?
2. **Can the same element be reused later in the same result?**

Those two questions combine into four combinations, and each one maps to exactly one loop shape.

## The decision table

| Order matters? | Reuse allowed? | Problem | Loop starts at | Needs `visited[]`? |
|---|---|---|---|---|
| No | No | Subsets, Combination Sum II | `start`, recurse `i+1` | No |
| No | Yes | Combination Sum I | `start`, recurse `i` | No |
| Yes | No | Permutations | `0`, every call | Yes |
| Yes | Yes | All length-k strings from an alphabet (rare) | `0`, every call | No |

## The code for each row

```java
// order doesn't matter, no reuse — Subsets / Combination Sum II
void bt(int[] nums, int start, List<Integer> curr) {
    for (int i = start; i < nums.length; i++) {
        curr.add(nums[i]);
        bt(nums, i + 1, curr);   // i+1: this index is gone for good
        curr.remove(curr.size() - 1);
    }
}
```

```java
// order doesn't matter, reuse allowed — Combination Sum I
void bt(int[] nums, int start, List<Integer> curr) {
    for (int i = start; i < nums.length; i++) {
        curr.add(nums[i]);
        bt(nums, i, curr);       // i, not i+1: this index can come up again
        curr.remove(curr.size() - 1);
    }
}
```

```java
// order matters, no reuse — Permutations
void bt(int[] nums, boolean[] visited, List<Integer> curr) {
    for (int i = 0; i < nums.length; i++) {   // always 0: any unused index qualifies
        if (visited[i]) continue;
        visited[i] = true;
        curr.add(nums[i]);
        bt(nums, visited, curr);
        curr.remove(curr.size() - 1);
        visited[i] = false;
    }
}
```

```java
// order matters, reuse allowed — e.g. all length-k strings from a fixed alphabet
void bt(char[] alphabet, int k, StringBuilder curr) {
    if (curr.length() == k) { /* record */ return; }
    for (int i = 0; i < alphabet.length; i++) {  // always 0, no visited[] needed either
        curr.append(alphabet[i]);
        bt(alphabet, k, curr);
        curr.deleteCharAt(curr.length() - 1);
    }
}
```

## Why `start` physically can't produce permutations

This is the mechanical reason, not just a rule to remember. `start`-based traversal only ever moves forward: once you pass index 0 without picking it, `start` becomes 1 or higher, and index 0 is unreachable for the rest of that path, permanently. But a valid permutation like `[2,1,3]` needs index 1's value placed *before* index 0's value — meaning after already being "past" index 1, you still need to come back for index 0. `start` can never do that; only a full `i=0` scan with `visited[]` can, because it re-examines every index every single call and just filters out the ones already committed.

That's also exactly why `visited[]` is dead weight in a Combination Sum II-style solution — `start`-based traversal never needs to ask "have I used this before," because the index itself already guarantees it can't be revisited. `visited[]` only earns its keep when the loop has to start from `0` every time.

## Reuse is independent of order

That's what the fourth row of the table is for. Reuse allowed means nothing is ever excluded, so you don't need `visited[]` regardless of whether order matters: with reuse, `i` in the combination-style loop lets you pick the same index again; with reuse *and* order mattering, scanning from `0` every time already lets you pick anything, reuse or not, so there's nothing to track at all.

## For interview purposes

- Read the problem statement for the tell: "permutations," "arrangements," "orderings," "all sequences" → order matters. "Subsets," "combinations," "subsequences" → order doesn't matter, use `start`.
- If you catch yourself reaching for `visited[]` on a combinations/subsets problem, that's usually a sign you're overcomplicating it — `start` alone is simpler and does the same job.
- If you try to solve a permutations problem with `start`, you won't crash — you'll just silently produce *fewer* permutations than expected (only the ones where indices happen to stay in increasing order), which is a nasty bug to catch by eye since the output looks plausible, just incomplete.
- There's a second way to do permutations without `visited[]` at all: swap `nums[start]` with `nums[i]` before recursing on `start+1`, then swap back after. Everything before `start` is "fixed/used," everything from `start` onward is "available" — same idea as the `start` pointer, just applied to permutations by physically reordering the array instead of tracking a boolean array. Worth knowing as an alternative if an interviewer asks for O(1) extra space instead of the O(n) `visited[]` array.

---

## Worked example: Word Search

Word Search is a good stress-test for the framework because it adds one wrinkle the table doesn't cover on its own: the search space is a grid, not a flat array.

**Mapped onto the framework:** Word Search is "order matters, no reuse" — the same row as Permutations — except the *choices* at each step aren't "any unused index," they're "the up-to-4 grid neighbors of where I currently am." That's the one wrinkle a grid adds. And since the word can start at any cell, the whole search is wrapped in a loop trying every `(r, c)` as a starting point.

**The fix:**

```java
class Solution {
    public boolean exist(char[][] board, String word) {
        int rows = board.length, cols = board[0].length;
        boolean[][] visited = new boolean[rows][cols];
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                if (dfs(board, word, r, c, 0, visited)) return true;
            }
        }
        return false;
    }

    private boolean dfs(char[][] board, String word, int r, int c, int idx, boolean[][] visited) {
        if (idx == word.length()) return true;                                   // matched the whole word
        if (r < 0 || r >= board.length || c < 0 || c >= board[0].length) return false;
        if (visited[r][c] || board[r][c] != word.charAt(idx)) return false;       // pruning

        visited[r][c] = true;                                                     // choose
        boolean found = dfs(board, word, r + 1, c, idx + 1, visited)
                      || dfs(board, word, r - 1, c, idx + 1, visited)
                      || dfs(board, word, r, c + 1, idx + 1, visited)
                      || dfs(board, word, r, c - 1, idx + 1, visited);            // explore all 4 directions
        visited[r][c] = false;                                                    // un-choose
        return found;
    }
}
```

Verified against the classic example (`board` with `"ABCCED"` → true, `"SEE"` → true, `"ABCB"` → false since it'd need to reuse a cell) and a small diagonal case (`"AD"` on a 2×2 board → correctly false).

**For interview purposes:**

- A common follow-up optimization: skip the separate `visited[][]` array. Temporarily overwrite `board[r][c]` with a sentinel like `'#'` before recursing (it can't match any real letter), then restore it afterward — same choose/un-choose idea, reusing the board itself instead of allocating extra space. Brings space down from O(rows·cols) to O(word.length()) for the call stack.
- The four-direction pattern (a `dx/dy` array looped, instead of hand-unrolled `||` calls) is worth having ready — it's the standard skeleton for almost every grid-DFS problem: islands, flood fill, rotting oranges.
- Complexity: O(rows · cols · 4^L), where L is `word.length()` — one DFS attempt from every cell, branching up to 4 ways at each of the L steps. Exponential in word length, but the `board[r][c] != word.charAt(idx)` check prunes almost every branch immediately in practice.

---

## Quick-reference cheat sheet

**Recursion, in one line:** base case + trust the smaller call + combine.

**Recursion complexity:** draw the call tree. Time = total nodes. Space = depth of the deepest path (not total nodes).

**Backtracking, in one line:** choose → explore → un-choose, with pruning to skip dead branches early.

**The four questions for any backtracking problem:**
1. What's a complete solution?
2. What are the choices at each step?
3. What makes a choice invalid?
4. How do you choose, and how do you exactly undo it?

**Before you call it done:** did you copy state before adding to results? Did you undo every choice, on every path, including early returns?

**Ordering matters vs. doesn't:**
- Combinations/subsets → move the start index forward (`i+1`), never revisit earlier indices.
- Permutations → track a `used[]` set instead, since any unused element can go next regardless of position.
- Reuse allowed (unlimited use of the same element) → recurse with the same index (`i`, not `i+1`).