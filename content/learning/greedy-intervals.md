# Greedy & Intervals — From Scratch to Advanced

A complete, self-contained deep dive for Java interviews.

**How to use this file:** Part 0 explains what a greedy algorithm is, when it's allowed, and why
interval problems are its home ground. Part 1 covers greedy: how to prove one (and how to break one), then
the handful of shapes that cover most interview problems, including greedy with a heap and the
classic cases where greedy fails. Part 2 covers intervals: merging, selecting, sweeping, difference
arrays and online bookings. Part 3 has the recognition table, the "greedy or DP?" checklist, the
practice ladder and the one-page summary.

Every solution below compiles and passes randomised tests against brute-force references.
Problem numbers like **LC 56** refer to LeetCode.

---

## Table of Contents

**[Part 0 — The mental model](#part-0--the-mental-model)**

**[Part 1 — Greedy](#part-1--greedy)**
1. [How to prove a greedy](#11-how-to-prove-a-greedy-and-how-to-break-one)
2. [Reachability: jump games](#12-reachability-jump-games)
3. [Running balance: gas station](#13-running-balance-gas-station)
4. [Sort and match](#14-sort-and-match)
5. [Greedy with a heap: regret](#15-greedy-with-a-heap-regret)
6. [Two passes: candy](#16-two-passes-candy)
7. [Last occurrence: partition labels](#17-last-occurrence-partition-labels)
8. [Count, don't simulate: task scheduler](#18-count-dont-simulate-task-scheduler)
9. [When greedy fails](#19-when-greedy-fails-coins-and-knapsacks)

**[Part 2 — Intervals](#part-2--intervals)**
1. [Interval vocabulary](#21-interval-vocabulary)
2. [Merge and insert](#22-merge-and-insert)
3. [Maximum non-overlapping: sort by end](#23-maximum-non-overlapping-sort-by-end-)
4. [Meeting rooms: the sweep line](#24-meeting-rooms-the-sweep-line)
5. [Difference arrays](#25-difference-arrays-many-range-updates-at-once)
6. [Intersections of two lists](#26-intersections-of-two-interval-lists)
7. [Free time across schedules](#27-free-time-across-many-schedules)
8. [Covered intervals](#28-covered-intervals)
9. [Online bookings with a TreeMap](#29-intervals-that-keep-arriving-treemap)

**[Part 3 — Solving any greedy or interval question](#part-3--solving-any-greedy-or-interval-question)**

---

# Part 0 — The Mental Model

**A greedy algorithm builds the answer one irrevocable choice at a time, always taking the option that
looks best right now.** No backtracking, no table of subproblems. That makes greedy code short and fast
(usually a sort plus one pass, O(n log n)). It also makes greedy the easiest kind of solution to get
*wrong*: a greedy that looks obviously right can fail on an input you didn't think of.

Greedy works when two things hold:
1. **Greedy-choice property:** some optimal solution starts with the greedy choice.
2. **Optimal substructure:** after making that choice, what remains is a smaller instance of the same problem.

Dynamic programming needs only the second: it tries every choice and keeps the best. Greedy commits
to one. So **greedy is DP where you can prove only one choice ever matters.**

```text
              DP                                         Greedy
  state --+-- choice 1 --> subproblem        state ---- best-looking choice ---> subproblem
          +-- choice 2 --> subproblem                   (the other branches are provably
          +-- choice 3 --> subproblem                    never better, so skip them)
  keep the best of all branches              one path, no table
```

**Intervals are greedy's home ground.** Almost every interval problem is "sort, then sweep once", and the
real decision is *what to sort by*:

| Goal | Sort by | Why |
|---|---|---|
| combine overlapping intervals (merge, insert, total coverage) | start | everything that can join the current group comes right after it |
| keep as many non-overlapping intervals as possible | end | the earliest finish leaves the most room for the rest |
| count how many overlap at once (rooms, platforms) | events: starts and ends separately | a sweep line sees every change in time order |

The whole guide in three sentences: prove a greedy before you trust it (1.1), recognise the handful of
greedy shapes (Part 1), and pick the right sort key for intervals (Part 2).

---

# Part 1 — Greedy

## 1.1 How to prove a greedy (and how to break one)

Interviewers often ask "why does this work?" You have three tools.

**1. Exchange argument.** Take any optimal solution that differs from the greedy one. Show you can swap one
of its choices for the greedy choice without making it worse. Repeat until it *is* the greedy solution,
so greedy is optimal too.

> *Activity selection (2.3):* let X be the first interval in an optimal solution, and G the interval
> that ends earliest overall. G ends no later than X, so replacing X with G can't overlap anything that X
> didn't. The count is the same, and now the optimal solution starts like greedy.

**2. Greedy stays ahead.** Show that after every step, greedy is at least as far along as any other
solution: it has covered more, reached further or finished earlier. Then it can't finish behind.

> *Jump Game II (1.2):* after k jumps, the greedy layer reaches the farthest index that any k-jump path
> can reach.

**3. Hunt for a counterexample first.** Before proving anything, spend a minute on small inputs that would
fool the greedy: ties, a big item that blocks two smaller ones, a cheap first step that leads somewhere
expensive. If you find one, the problem needs DP (or search). Coin change with coins {1, 3, 4} and amount 6
is the classic (1.9).

| Signs that greedy is **safe** | Signs that greedy is **unsafe** |
|---|---|
| items can be split (fractional), or every item has the same "size" | 0/1 choices with different weights and values |
| a choice only affects what's *left*, not the price of later choices | an early choice changes the cost of later ones |
| the exchange argument fits in one sentence | you can't say why the local best is globally best |
| "max number of …" / "min number of …" with intervals or deadlines | "number of ways", or minimum cost over arbitrary weights |

## 1.2 Reachability: jump games

**Trigger:** "can you reach the end?", "minimum number of jumps".
**Core idea:** don't enumerate paths. Track the farthest index reachable so far.

```java
// LC 55 Jump Game: can you reach the last index? Track the farthest reachable index.
public boolean canJump(int[] nums) {
    int reach = 0;
    for (int i = 0; i < nums.length; i++) {
        if (i > reach) return false;            // i can't be reached: neither can anything after it
        reach = Math.max(reach, i + nums[i]);
    }
    return true;
}

// LC 45 Jump Game II: the fewest jumps (the end is always reachable). BFS by layers, in O(1) space.
public int jump(int[] nums) {
    int jumps = 0, layerEnd = 0, farthest = 0;     // [.., layerEnd] is reachable with 'jumps' jumps
    for (int i = 0; i < nums.length - 1; i++) {
        farthest = Math.max(farthest, i + nums[i]);
        if (i == layerEnd) {                       // this layer is used up: one more jump
            jumps++;
            layerEnd = farthest;
        }
    }
    return jumps;
}
```

- `canJump`: if index `i` is beyond `reach`, nothing at or after `i` can be reached. O(n) time, O(1) space.
- `jump` is BFS without a queue. The indexes reachable with exactly `jumps` jumps form a contiguous window
  ending at `layerEnd`. While scanning that window, `farthest` collects the end of the next window. The loop
  stops at `n - 2` because standing on the last index needs no further jump.
- The same "farthest reach" idea solves Video Stitching (1024) and Minimum Number of Taps to Open to Water a
  Garden (1326): they are Jump Game II on intervals.

```text
nums       2   3   1   1   4
index      0   1   2   3   4
layer 0   [0]
layer 1       [1   2]           farthest from layer 0: 0 + 2 = 2
layer 2               [3   4]   farthest from layer 1: 1 + 3 = 4, the end -> 2 jumps
```

## 1.3 Running balance: gas station

**Trigger:** a circular route, a running total that must never go negative, "find the starting point".
**Core idea:** two facts.
1. If the **total** gain is negative, no start works. If it's non-negative, a valid start exists.
2. If you start at `s` and run dry before reaching `i + 1`, then *no* station in `s..i` works as a start.
   You arrived at each of them with a non-negative tank, so starting there with an empty tank only does
   worse. Jump straight to `i + 1`.

```java
// LC 134 Gas Station: the start index that completes the circuit, or -1.
public int canCompleteCircuit(int[] gas, int[] cost) {
    int total = 0, tank = 0, start = 0;
    for (int i = 0; i < gas.length; i++) {
        int gain = gas[i] - cost[i];
        total += gain;
        tank += gain;
        if (tank < 0) {                  // can't get from 'start' to i + 1, and neither can
            start = i + 1;               // any station between them: try i + 1
            tank = 0;
        }
    }
    return total >= 0 ? start : -1;     // enough gas in total => the surviving start works
}
```

One pass, O(1) space. The same "reset when the running sum goes negative" shape is Kadane's algorithm for
the maximum subarray (*Arrays & Strings* guide): a greedy that is often presented as DP.

## 1.4 Sort and match

**Trigger:** two groups to pair up (children and cookies, people and boats, workers and jobs), or items
split between two bins.
**Core idea:** sort, then match the extremes with two pointers. The exchange argument is usually: "if an
optimal pairing does it differently, swap two partners, and nothing gets worse."

```java
// LC 455 Assign Cookies: the most children content (cookie size >= greed).
public int findContentChildren(int[] greed, int[] cookies) {
    int[] g = greed.clone(), s = cookies.clone();
    Arrays.sort(g);
    Arrays.sort(s);
    int child = 0;
    for (int cookie = 0; cookie < s.length && child < g.length; cookie++) {
        // the smallest cookie that satisfies the least greedy child
        if (s[cookie] >= g[child]) child++;
    }
    return child;
}

// LC 881 Boats to Save People: each boat carries at most 2 people and at most 'limit' weight.
public int numRescueBoats(int[] people, int limit) {
    int[] p = people.clone();
    Arrays.sort(p);
    int boats = 0;
    // Each boat takes the heaviest person left, plus the lightest one if they fit too.
    for (int light = 0, heavy = p.length - 1; light <= heavy; heavy--) {
        if (p[light] + p[heavy] <= limit) light++;
        boats++;
    }
    return boats;
}

// LC 1029 Two City Scheduling: send n people to A and n to B at minimum total cost.
public int twoCitySchedCost(int[][] costs) {
    int[][] c = costs.clone();
    // how much cheaper A is (costs are small)
    Arrays.sort(c, Comparator.comparingInt(x -> x[0] - x[1]));
    int n = c.length / 2, total = 0;
    for (int i = 0; i < c.length; i++) total += (i < n) ? c[i][0] : c[i][1];
    return total;
}
```

- **Cookies:** give each child the *smallest* cookie that satisfies them. A bigger cookie is never more
  useful to a less greedy child.
- **Boats:** the heaviest person must go in *some* boat. If anyone fits with them, the lightest person does,
  and pairing them uses up the person who is least useful to anyone else.
- **Two City Scheduling:** what matters is the *difference* `a - b`. Send the n people with the most negative
  differences (the biggest savings from going to A) to A, and everyone else to B. Sorting by a difference is
  the general trick for "each item goes to one of two bins, n each".

`comparingInt(x -> x[0] - x[1])` is safe here because the costs are small (at most 1000), so the key
can't overflow. Never compare with `(a, b) -> a[0] - b[0]` when values can be large or negative.

## 1.5 Greedy with a heap: regret

**Trigger:** you must process items in a forced order (by deadline, by position, by required capital), and
an earlier choice may turn out to be a mistake once you know more.
**Core idea:** commit tentatively and keep the past choices (or the skipped options) in a heap. When you hit
a wall, swap out the worst choice or pull in the best skipped one. The heap makes "the best decision in
hindsight" cost O(log n).

```java
// LC 630 Course Schedule III: courses [duration, lastDay]; take as many as possible.
public int scheduleCourse(int[][] courses) {
    int[][] c = courses.clone();
    Arrays.sort(c, Comparator.comparingInt(x -> x[1]));          // earliest deadline first
    // longest on top
    PriorityQueue<Integer> taken = new PriorityQueue<>(Comparator.reverseOrder());
    int time = 0;
    for (int[] course : c) {
        taken.offer(course[0]);
        time += course[0];
        // over the deadline: drop the LONGEST course so far
        if (time > course[1]) time -= taken.poll();
    }
    return taken.size();
}

// LC 871 Minimum Number of Refueling Stops: decide on stops only when you run out.
public int minRefuelStops(int target, int startFuel, int[][] stations) {
    // fuel at stations passed
    PriorityQueue<Integer> passed = new PriorityQueue<>(Comparator.reverseOrder());
    long reach = startFuel;                          // the farthest position we can get to
    int stops = 0, i = 0;
    while (reach < target) {
        while (i < stations.length && stations[i][0] <= reach) passed.offer(stations[i++][1]);
        if (passed.isEmpty()) return -1;        // stuck, with nothing left to refuel from
        reach += passed.poll();                 // "retroactively" stop at the biggest one we passed
        stops++;
    }
    return stops;
}

// LC 502 IPO: at most k projects; a project needs capital[i] and adds profits[i].
public int findMaximizedCapital(int k, int w, int[] profits, int[] capital) {
    int n = profits.length;
    Integer[] byCapital = new Integer[n];
    for (int i = 0; i < n; i++) byCapital[i] = i;
    Arrays.sort(byCapital, Comparator.comparingInt(i -> capital[i]));
    PriorityQueue<Integer> affordable = new PriorityQueue<>(Comparator.reverseOrder());
    int next = 0;
    for (int round = 0; round < k; round++) {
        while (next < n && capital[byCapital[next]] <= w) {      // everything affordable so far
            affordable.offer(profits[byCapital[next++]]);
        }
        if (affordable.isEmpty()) break;          // nothing affordable: capital can't grow any more
        w += affordable.poll();                   // the most profitable project we can afford now
    }
    return w;
}
```

| Problem | Forced order | The heap holds | When the heap is used |
|---|---|---|---|
| Course Schedule III (630) | by deadline | durations taken (max-heap) | over the deadline: drop the longest course |
| Refueling Stops (871) | by position | fuel at stations passed (max-heap) | out of fuel: refuel at the biggest station passed |
| IPO (502) | by required capital | profits now affordable (max-heap) | each round: take the most profitable |
| Furthest Building (1642) | building by building | climbs paid with ladders (min-heap) | more climbs than ladders: pay the smallest with bricks |

**Why dropping the longest course is safe:** before adding the current course, the courses taken fit by
the previous deadline, which is no later than the current one. Adding the current course and dropping the
longest (which is at least as long) leaves the same count as before with `time` no larger, so it still
fits, and a smaller `time` can only help the courses that come later.

**Why refuelling "in hindsight" is legal:** only *which* stations you stop at matters, not when you decide.
So keep driving, and when the tank runs out, pretend you stopped at the biggest station you passed.

## 1.6 Two passes: candy

**Trigger:** each element has a constraint with *both* neighbours.
**Core idea:** one direction at a time is easy. Satisfy the left-neighbour rule in a left-to-right pass, then
the right-neighbour rule in a right-to-left pass, taking the `max` so the first pass stays satisfied.

```java
// LC 135 Candy: everyone gets >= 1, and a higher
// rating than a neighbour means more candy. Minimise.
public int candy(int[] ratings) {
    int n = ratings.length;
    int[] c = new int[n];
    Arrays.fill(c, 1);
    for (int i = 1; i < n; i++) {           // pass 1: beat a lower left neighbour
        if (ratings[i] > ratings[i - 1]) c[i] = c[i - 1] + 1;
    }
    for (int i = n - 2; i >= 0; i--) {      // pass 2: beat a lower right neighbour too
        if (ratings[i] > ratings[i + 1]) c[i] = Math.max(c[i], c[i + 1] + 1);
    }
    return Arrays.stream(c).sum();
}
```

```text
ratings      1   2   87  87  87   2   1
left pass    1   2   3   1   1    1   1     rising from the left
right pass   1   2   3   1   3    2   1     rising from the right; max keeps the left result
total = 13   equal neighbours have no constraint, so the middle 87 gets 1
```

The same two-pass shape appears in Trapping Rain Water (highest bar on the left and on the right), Product of
Array Except Self, and Shortest Distance to a Character (821).

## 1.7 Last occurrence: partition labels

**Trigger:** "split into as many parts as possible such that…", where each item constrains a range.
**Core idea:** record where every letter appears last. Scan, stretching the current part to the last
occurrence of each letter you see. When the scan reaches the stretched end, nothing inside the part appears
later, so cut.

```java
// LC 763: split s into as many parts as possible so each letter appears in only one part.
public List<Integer> partitionLabels(String s) {
    int[] last = new int[26];
    for (int i = 0; i < s.length(); i++) last[s.charAt(i) - 'a'] = i;
    List<Integer> sizes = new ArrayList<>();
    int start = 0, end = 0;
    for (int i = 0; i < s.length(); i++) {
        // the part must reach every copy of its letters
        end = Math.max(end, last[s.charAt(i) - 'a']);
        if (i == end) {                                 // nothing in this part appears later: cut
            sizes.add(end - start + 1);
            start = i + 1;
        }
    }
    return sizes;
}
```

This is interval merging in disguise: each letter is the interval [first, last], and the parts are the
merged groups (the randomised test checks exactly that). Similar problems: Max Chunks to Make Sorted (769)
and Merge Triplets to Form Target Triplet (1899).

## 1.8 Count, don't simulate: task scheduler

**Trigger:** arrange items with a cooldown or spacing rule, and minimise the total length.
**Core idea:** the most frequent task decides the shape. With `max` copies of it, you need `max - 1` full
frames of `n + 1` slots, plus a last row holding every task tied for the maximum:

```text
tasks A A A B B B, n = 2       max = 3, tied = 2 (A and B)
A B _ | A B _ | A B            (3 - 1) * (2 + 1) + 2 = 8
```

If there are so many different tasks that they overflow the frames, there is no idle time at all and the
answer is simply `tasks.length`. That's what the final `max` handles.

```java
// LC 621 Task Scheduler: the same task needs n idle slots
// between runs. Count frames instead of simulating.
public int leastInterval(char[] tasks, int n) {
    int[] count = new int[26];
    for (char t : tasks) count[t - 'A']++;
    int max = Arrays.stream(count).max().getAsInt();
    int tiedForMax = (int) Arrays.stream(count).filter(c -> c == max).count();
    int framed = (max - 1) * (n + 1) + tiedForMax;   // (max - 1) full frames, then the last row
    return Math.max(framed, tasks.length);           // with enough variety there is no idle time
}
```

Simulating with a max-heap of counts plus a cooldown queue also works, and it generalises to Reorganize
String (767) and Rearrange String k Distance Apart (358): always place the most frequent item that's allowed.

## 1.9 When greedy fails: coins and knapsacks

The same "biggest first" idea is optimal in one problem and wrong in its neighbour:

```java
// "Take the largest coin that fits": optimal for 1, 5, 10, 25 ... but NOT for every coin system.
public int coinChangeGreedy(int[] coins, int amount) {
    int[] c = coins.clone();
    Arrays.sort(c);
    int count = 0;
    for (int i = c.length - 1; i >= 0 && amount > 0; i--) {
        count += amount / c[i];
        amount %= c[i];
    }
    return amount == 0 ? count : -1;
}

// LC 322: the DP that is always right. dp[a] = the fewest coins that make amount a.
public int coinChange(int[] coins, int amount) {
    int[] dp = new int[amount + 1];
    Arrays.fill(dp, Integer.MAX_VALUE);
    dp[0] = 0;
    for (int a = 1; a <= amount; a++) {
        for (int coin : coins) {
            if (coin <= a && dp[a - coin] != Integer.MAX_VALUE) {
                dp[a] = Math.min(dp[a], dp[a - coin] + 1);
            }
        }
    }
    return dp[amount] == Integer.MAX_VALUE ? -1 : dp[amount];
}
// coinChangeGreedy({1, 3, 4}, 6) = 3 (4 + 1 + 1), but coinChange({1, 3, 4}, 6) = 2 (3 + 3)
```

US coins (1, 5, 10, 25) happen to be *canonical*: greedy is optimal for them. Arbitrary coin systems
aren't, which is why LC 322 is a DP problem. Rule of thumb: **if the interviewer lets the coin values vary,
use DP.**

Knapsack is the same story:

```java
// Fractional knapsack: items may be split, so take
// the best value per weight first. Greedy IS optimal.
public double fractionalKnapsack(int[] weights, int[] values, int capacity) {
    Integer[] order = new Integer[weights.length];
    for (int i = 0; i < order.length; i++) order[i] = i;
    // Best value per weight first. Compare the ratios by cross-multiplying, so nothing is rounded.
    Arrays.sort(order, (a, b) ->
            Long.compare((long) values[b] * weights[a], (long) values[a] * weights[b]));
    double total = 0;
    int left = capacity;
    for (int i : order) {
        if (left == 0) break;
        int take = Math.min(left, weights[i]);
        total += (double) values[i] * take / weights[i];
        left -= take;
    }
    return total;
}
```

| | Fractional knapsack | 0/1 knapsack |
|---|---|---|
| items | can be split | all or nothing |
| greedy by value per weight | **optimal**: the last item is cut to fit exactly | **wrong**: a high-ratio item can waste capacity |
| solution | sort, O(n log n) | DP over capacity, O(n · W) (*Dynamic Programming* guide) |

The counterexample for 0/1: capacity 50, items (10 kg, 60), (20 kg, 100), (30 kg, 120). Greedy by ratio
takes the first two for 160, but the last two give 220. With splitting allowed, greedy gets
60 + 100 + ⅔ · 120 = 240, which is optimal (the test checks this example).

Other greedy classics that come up by name:
- **Huffman coding:** repeatedly merge the two smallest frequencies with a min-heap. Minimum Cost to Connect
  Sticks (1167) is the same algorithm.
- **Dijkstra, Prim and Kruskal** are greedy algorithms on graphs (*Graphs* guide).

---

# Part 2 — Intervals

## 2.1 Interval vocabulary

**Closed or half-open?** Read the problem carefully: the answer changes `<` versus `<=` in every comparison.

| Convention | Example problems | `[1, 2]` and `[2, 3]` | Overlap test for a and b |
|---|---|---|---|
| closed `[s, e]` | Merge (56), Insert (57), Arrows (452), Intersections (986) | overlap at 2 | `a.s <= b.e && b.s <= a.e` |
| half-open `[s, e)` | Meetings (252, 253), Non-overlapping (435), My Calendar (729), Car Pooling (1094) | touch, no overlap | `a.s < b.e && b.s < a.e` |

Rules worth memorising:
- Two intervals **don't** overlap exactly when one ends before the other starts. Negate that to get the
  overlap test.
- The **intersection** of two intervals is `[max(starts), min(ends)]`. For closed intervals it is non-empty
  when `max(starts) <= min(ends)`.
- The **union** of two overlapping intervals is `[min(starts), max(ends)]`.
- Sort with `Comparator.comparingInt(a -> a[0])` or `Integer.compare`. `(a, b) -> a[0] - b[0]` overflows on
  LC 452, whose coordinates span the whole `int` range.

```text
a:   |-------|                    a.e < b.s: no overlap (a is entirely before b)
b:              |------|

a:   |------------|               a.s <= b.e && b.s <= a.e: overlap
b:          |----------|          intersection = [b.s, a.e]
```

## 2.2 Merge and insert

**Trigger:** "merge overlapping intervals", "insert into a sorted list of intervals", total covered length.
**Core idea:** sort by start. Then everything that can join the current group comes right after it: if the
next interval starts before the group ends, extend the group; otherwise start a new one.

```java
// LC 56 Merge Intervals (closed intervals: [1, 2] and [2, 3] overlap at 2).
public int[][] merge(int[][] intervals) {
    int[][] sorted = intervals.clone();
    Arrays.sort(sorted, Comparator.comparingInt(a -> a[0]));           // by start
    List<int[]> merged = new ArrayList<>();
    for (int[] iv : sorted) {
        int[] last = merged.isEmpty() ? null : merged.get(merged.size() - 1);
        if (last != null && iv[0] <= last[1]) {
            last[1] = Math.max(last[1], iv[1]);          // overlap: extend the group
        } else {
            merged.add(new int[] { iv[0], iv[1] });      // a gap: start a new group
        }
    }
    return merged.toArray(new int[0][]);
}

// LC 57 Insert Interval: the input is sorted and disjoint. Three phases, O(n), no sorting.
public int[][] insert(int[][] intervals, int[] newInterval) {
    List<int[]> out = new ArrayList<>();
    int i = 0, n = intervals.length;
    int start = newInterval[0], end = newInterval[1];
    while (i < n && intervals[i][1] < start) out.add(intervals[i++]);     // 1. entirely before it
    // 2. overlapping: absorb them
    while (i < n && intervals[i][0] <= end) {
        start = Math.min(start, intervals[i][0]);
        end = Math.max(end, intervals[i][1]);
        i++;
    }
    out.add(new int[] { start, end });
    while (i < n) out.add(intervals[i++]);                                // 3. entirely after it
    return out.toArray(new int[0][]);
}
```

- `merge` is O(n log n) for the sort plus one O(n) pass. It extends its own copies (`new int[] { ... }`),
  never the caller's arrays.
- Extend with `Math.max(last[1], iv[1])`, not `iv[1]`: an interval contained in the group would shrink it.
- `insert` is O(n) because the input is already sorted and disjoint: copy what comes before, absorb what
  overlaps, copy what comes after. Appending and re-merging also works but costs O(n log n) and misses the
  point of the question (the test uses it as the reference).
- **Total covered length** = merge, then sum `end - start`.

## 2.3 Maximum non-overlapping: sort by end ⭐

**Trigger:** "remove the fewest intervals so the rest don't overlap", "most meetings in one room", "fewest
points (arrows) that hit every interval".
**Core idea (activity selection):** sort by **end**. Keep the interval that finishes first, skip everything
that overlaps it, and repeat. The earliest finish leaves the most room for everything else (the exchange
argument is in 1.1).

```java
// LC 435: remove the fewest intervals so the rest don't overlap (touching at an endpoint is fine).
public int eraseOverlapIntervals(int[][] intervals) {
    int[][] sorted = intervals.clone();
    Arrays.sort(sorted, Comparator.comparingInt(a -> a[1]));  // by END: finish as early as possible
    int kept = 0;
    long lastEnd = Long.MIN_VALUE;
    for (int[] iv : sorted) {
        if (iv[0] >= lastEnd) {                               // starts after the last kept one ends
            kept++;
            lastEnd = iv[1];
        }
    }
    return intervals.length - kept;
}

// LC 452: the fewest arrows; an arrow at x bursts every balloon with start <= x <= end.
public int findMinArrowShots(int[][] points) {
    int[][] sorted = points.clone();
    Arrays.sort(sorted, Comparator.comparingInt(a -> a[1]));
    int arrows = 0;
    long arrowAt = Long.MIN_VALUE;
    for (int[] p : sorted) {
        if (p[0] > arrowAt) {              // not burst yet: shoot at its END (the latest safe spot)
            arrows++;
            arrowAt = p[1];
        }
    }
    return arrows;
}
```

```text
sorted by end:   [1,3]  [2,4]  [3,5]  [1,6]  [5,7]
[1,3]                    keep, lastEnd = 3
[2,4]  starts 2 < 3      skip
[3,5]  starts 3 >= 3     keep, lastEnd = 5      (half-open: touching is fine)
[1,6]  starts 1 < 5      skip
[5,7]  starts 5 >= 5     keep, lastEnd = 7
kept 3, removed 2
```

- **Arrows (452) is the same problem in its dual form:** the fewest points that hit every interval equals
  the most pairwise-disjoint intervals. Shoot each arrow at the *end* of the first unburst balloon: that's
  the latest position that still hits it, so it hits as many later balloons as possible. The intervals are
  closed, so the test is `p[0] > arrowAt`.
- **Why not sort by start?** A long interval that starts first would block many short ones. **By length?**
  A short interval can still overlap two intervals that are compatible with each other. Both fail the
  60-second counterexample hunt from 1.1.
- Starting `lastEnd` at `Long.MIN_VALUE` avoids a special case for the first interval and works with
  `Integer.MIN_VALUE` coordinates.

Maximum Length of Pair Chain (646) is the same algorithm. **Weighted** interval scheduling, where each
interval has a profit (LC 1235), is *not* greedy: it's DP plus binary search.

## 2.4 Meeting rooms: the sweep line

**Trigger:** "minimum number of rooms / platforms / servers", "maximum overlap", "how many at once".
**Core idea:** the answer is the largest number of intervals alive at one moment. Treat each interval as two
events, a start (+1) and an end (−1), process the events in time order, and track the running count.

```java
// LC 252: can one person attend every meeting? Meetings are [start, end): back-to-back is fine.
public boolean canAttendMeetings(int[][] intervals) {
    int[][] sorted = intervals.clone();
    Arrays.sort(sorted, Comparator.comparingInt(a -> a[0]));
    for (int i = 1; i < sorted.length; i++) {
        if (sorted[i][0] < sorted[i - 1][1]) return false;
    }
    return true;
}

// LC 253: the fewest rooms = the most meetings in progress at once. Sweep sorted starts and ends.
public int minMeetingRooms(int[][] intervals) {
    int n = intervals.length;
    int[] starts = new int[n], ends = new int[n];
    for (int i = 0; i < n; i++) {
        starts[i] = intervals[i][0];
        ends[i] = intervals[i][1];
    }
    Arrays.sort(starts);
    Arrays.sort(ends);
    int inUse = 0, best = 0;
    for (int s = 0, e = 0; s < n; s++) {
        while (e < n && ends[e] <= starts[s]) {     // meetings that ended by now free their rooms
            e++;
            inUse--;
        }
        inUse++;
        best = Math.max(best, inUse);
    }
    return best;
}
```

Sorting `starts` and `ends` separately works because you only need *how many* meetings are running, not
*which* ones. When an end and a start happen at the same time, the `<=` in `ends[e] <= starts[s]` processes
the end first, so a room freed at 10:00 can host a meeting that starts at 10:00 (half-open intervals).

Three equivalent formulations to know:

| Method | How | When to prefer it |
|---|---|---|
| two sorted arrays (above) | sort starts and ends separately, sweep both | the simplest code |
| min-heap of end times | sort by start; pop while the heap's top ≤ the start; push the end; answer = largest heap size | you need to know *which* room (Meeting Rooms III, 2402) |
| event map `TreeMap<time, delta>` | +1 at each start, −1 at each end, add up in key order | intervals arrive one at a time (My Calendar III, 732) |

## 2.5 Difference arrays: many range updates at once

**Trigger:** "add x to every position in [l, r]" many times, then read every position (car pooling, flight
bookings, "how many lamps light this point").
**Core idea:** record each range update as `+x` at `l` and `−x` just past the end. A prefix sum at the end
recovers every value. Each update costs O(1) instead of O(length).

```java
// LC 1094 Car Pooling: trips [passengers, from, to], locations 0..1000. Never exceed capacity?
public boolean carPooling(int[][] trips, int capacity) {
    int[] delta = new int[1001];
    for (int[] t : trips) {
        delta[t[1]] += t[0];                         // they board at 'from' ...
        delta[t[2]] -= t[0];                         // ... and are gone at 'to'
    }
    int onboard = 0;
    for (int d : delta) {
        onboard += d;
        if (onboard > capacity) return false;
    }
    return true;
}

// LC 1109: bookings [first, last, seats] on flights
// 1..n. One +, one - per booking, then prefix sums.
public int[] corpFlightBookings(int[][] bookings, int n) {
    int[] diff = new int[n + 1];
    for (int[] b : bookings) {
        diff[b[0] - 1] += b[2];
        diff[b[1]] -= b[2];
    }
    int[] seats = new int[n];
    int running = 0;
    for (int i = 0; i < n; i++) {
        running += diff[i];
        seats[i] = running;
    }
    return seats;
}
```

```text
bookings   [1,2,+10]  [2,3,+20]  [2,5,+25]      flights 1..5 are indexes 0..4
diff        10   45  -10  -20    0  | -25        +x at (first - 1), -x at last
prefix      10   55   45   25   25
```

A difference array is the offline cousin of the sweep line. The sweep sorts the events, while the difference
array buckets them by coordinate, which works when the coordinate range is small (Car Pooling's locations
are 0..1000). For large coordinates, use a `TreeMap<Integer, Integer>` of deltas. When updates and queries
are *interleaved*, use a Fenwick tree or a segment tree.

## 2.6 Intersections of two interval lists

**Trigger:** two sorted lists of disjoint intervals; "common free time of two people"; "intersection".
**Core idea:** two pointers. The intersection of the current pair is `[max(starts), min(ends)]`. Then advance
whichever interval **ends first**: it can't intersect anything further along the other list.

```java
// LC 986: the intersections of two sorted, disjoint lists of closed intervals.
public int[][] intervalIntersection(int[][] a, int[][] b) {
    List<int[]> out = new ArrayList<>();
    int i = 0, j = 0;
    while (i < a.length && j < b.length) {
        int lo = Math.max(a[i][0], b[j][0]);
        int hi = Math.min(a[i][1], b[j][1]);
        if (lo <= hi) out.add(new int[] { lo, hi });     // a single shared point counts
        // the one ending first can't meet anything else
        if (a[i][1] < b[j][1]) i++;
        else j++;
    }
    return out.toArray(new int[0][]);
}
```

O(m + n). The same "advance the one that ends first" move also merges two sorted interval lists, or subtracts
one from the other.

## 2.7 Free time across many schedules

**Trigger:** "when is everyone free?", the gaps in the union of many intervals.
**Core idea:** free time is the set of gaps in the **union** of all busy intervals. Collect everything, sort by
start, and sweep with the latest end seen so far. A start beyond that end opens a gap.

```java
// LC 759 Employee Free Time: the finite gaps when every employee is free.
public List<int[]> employeeFreeTime(List<List<int[]>> schedule) {
    List<int[]> all = new ArrayList<>();
    for (List<int[]> person : schedule) all.addAll(person);
    all.sort(Comparator.comparingInt(iv -> iv[0]));
    List<int[]> free = new ArrayList<>();
    int busyUntil = all.get(0)[1];
    for (int[] iv : all) {
        // nobody is busy in this gap
        if (iv[0] > busyUntil) free.add(new int[] { busyUntil, iv[0] });
        busyUntil = Math.max(busyUntil, iv[1]);
    }
    return free;
}
```

This is O(N log N) for N intervals in total. Each person's list is already sorted, so a k-way merge with a
heap (the same technique as Merge k Sorted Lists) brings it down to O(N log k). LC 759 uses an `Interval`
class with `start` and `end` fields; the code is identical with `iv.start` in place of `iv[0]`.

## 2.8 Covered intervals

**Trigger:** "remove intervals covered by another", nesting, "count the intervals not contained in another".
**Core idea:** sort by start ascending and, for equal starts, by end **descending**, so a container always
comes before the intervals it contains. Then an interval is covered exactly when its end is ≤ the largest end
seen so far.

```java
// LC 1288: count the intervals not covered by another ([a, b] covers [c, d] if a <= c and d <= b).
public int removeCoveredIntervals(int[][] intervals) {
    int[][] sorted = intervals.clone();
    Arrays.sort(sorted, (a, b) -> a[0] != b[0]
            ? Integer.compare(a[0], b[0])          // start ascending
            : Integer.compare(b[1], a[1]));        // equal starts: the longest first
    int remaining = 0, maxEnd = Integer.MIN_VALUE;
    for (int[] iv : sorted) {
        if (iv[1] > maxEnd) {                      // reaches past everything before it: not covered
            remaining++;
            maxEnd = iv[1];
        }
    }
    return remaining;
}
```

The tie-break is the whole problem: with `[1,2]` sorted before `[1,4]`, `[1,2]` would look uncovered. The same
two-key sort solves Russian Doll Envelopes (354): width ascending, height **descending**, then the longest
increasing subsequence of heights.

## 2.9 Intervals that keep arriving: TreeMap

**Trigger:** bookings arrive one at a time and each must be answered immediately ("online").
**Core idea:** keep the accepted intervals in a `TreeMap<start, end>`. A new interval can only clash with its two
neighbours by start: the last one starting at or before it (`floorEntry`) and the first one starting at or
after it (`ceilingEntry`).

```java
// LC 729 My Calendar I: book [start, end) only if it
// overlaps no existing booking. O(log n) per call.
class MyCalendar {
    private final TreeMap<Integer, Integer> bookings = new TreeMap<>();   // start -> end, disjoint

    public boolean book(int start, int end) {
        Map.Entry<Integer, Integer> before = bookings.floorEntry(start);    // latest start <= start
        Map.Entry<Integer, Integer> after = bookings.ceilingEntry(start);   // first start >= start
        if (before != null && before.getValue() > start) return false;      // not over by start
        if (after != null && after.getKey() < end) return false;            // starts before we end
        bookings.put(start, end);
        return true;
    }
}
```

That's O(log n) per booking, against O(n) for scanning a list. Related problems:
- **My Calendar II (731)**, no triple bookings, and **My Calendar III (732)**, the maximum overlap: keep a
  `TreeMap<time, delta>` (+1 at the start, −1 at the end) and sweep it on each booking, O(n) per booking. That's the
  sweep line (2.4) made dynamic.
- **Range Module (715)** and **Data Stream as Disjoint Intervals (352)**: a `TreeMap` of disjoint intervals that
  merges neighbours on every insert.

---

# Part 3 — Solving Any Greedy or Interval Question

## 3.1 The decision procedure

| The problem says… | Reach for |
|---|---|
| "can you reach…", "minimum jumps", covering a line with ranges | farthest reach / BFS layers (1.2) |
| circular route, a running total that must stay ≥ 0 | running balance with reset (1.3) |
| pair up two groups; each item goes to one of two bins | sort + two pointers, or sort by difference (1.4) |
| deadlines, "maximum number of tasks", fuel stops, capital | forced order + heap of regrets (1.5) |
| constraints with both neighbours | two passes (1.6) |
| "split into as many parts as possible" | last occurrence (1.7) |
| a cooldown between equal items | count frames, or most frequent first (1.8) |
| merge, insert, union, total covered length | sort by start (2.2) |
| remove the fewest / keep the most non-overlapping / fewest points to hit all | sort by end (2.3) |
| minimum rooms, maximum overlap at once | sweep line (2.4) |
| many range additions, then read every value | difference array (2.5) |
| two sorted interval lists | two pointers, advance the one that ends first (2.6) |
| bookings that arrive one at a time | `TreeMap` floor/ceiling (2.9) |
| arbitrary weights, "number of ways", min cost with no exchange argument | **not greedy**: DP |

**Constraint hints:** n up to 10⁵ with a "maximum/minimum number of…" question usually means sort + greedy,
O(n log n). If n ≤ 1000 and you can't prove the greedy, an O(n²) DP is probably intended.

## 3.2 Greedy or DP?

Run this before you write any code:
1. **State the greedy choice in one sentence.** ("Always keep the interval that ends first.")
2. **Try to break it on 3–4 tiny inputs**, in about a minute: ties, one big item against two small ones,
   a cheap first step that leads somewhere expensive.
3. **Find the exchange argument.** If you can say "swapping the optimal solution's choice for mine never
   makes it worse" and explain why, code the greedy.
4. **If you can't, it's probably DP**, or a greedy that needs a heap to change its mind (1.5). Saying "I
   considered greedy, here's the counterexample, so DP" scores well in an interview.
5. **When unsure, compare with brute force on small inputs.** That's how every solution in this guide was
   tested.

## 3.3 Edge cases to test every time

| Input | What it breaks |
|---|---|
| empty list, single interval | `intervals[0]` access, `merged.get(size - 1)` |
| intervals touching at one point (`[1,2]`, `[2,3]`) | `<` vs `<=`: decide closed or half-open first |
| identical intervals | the covered-interval tie-break; duplicates in merge |
| one interval containing all the others | merge must take `max(end)`, not the latest interval's end |
| `Integer.MIN_VALUE` / `MAX_VALUE` coordinates | `a[0] - b[0]` comparators; sentinel values |
| unsorted input | assuming sorted input when only Insert Interval (57) promises it |
| zeros (a jump of 0, gas equal to cost) | `canJump` stuck on a zero; `tank < 0` vs `tank <= 0` |
| all tasks the same / all tasks different | the task scheduler's two regimes |

## 3.4 Practice ladder

**Greedy: warm-up**
- Assign Cookies (455)
- Lemonade Change (860)
- Best Time to Buy and Sell Stock II (122)
- Maximum Subarray (53): Kadane's as a greedy
- Boats to Save People (881)

**Greedy: core**
- Jump Game (55) ⭐ and Jump Game II (45) ⭐
- Gas Station (134) ⭐
- Partition Labels (763) ⭐
- Two City Scheduling (1029)
- Task Scheduler (621) ⭐
- Reorganize String (767)
- Hand of Straights (846)
- Valid Parenthesis String (678)
- Candy (135)
- Video Stitching (1024)

**Greedy with a heap**
- Furthest Building You Can Reach (1642)
- Course Schedule III (630) ⭐
- Minimum Number of Refueling Stops (871)
- IPO (502)
- Minimum Cost to Connect Sticks (1167)

**Intervals**
- Meeting Rooms (252)
- Merge Intervals (56) ⭐
- Insert Interval (57) ⭐
- Non-overlapping Intervals (435) ⭐
- Minimum Number of Arrows to Burst Balloons (452)
- Meeting Rooms II (253) ⭐
- Interval List Intersections (986)
- Remove Covered Intervals (1288)
- Car Pooling (1094) and Corporate Flight Bookings (1109)
- My Calendar I (729) and My Calendar II (731)
- Employee Free Time (759)

**Hard**
- Minimum Number of Taps to Open to Water a Garden (1326)
- Data Stream as Disjoint Intervals (352)
- Range Module (715)
- My Calendar III (732)
- Maximum Profit in Job Scheduling (1235): the "not greedy" contrast, DP + binary search
- Patching Array (330)

## 3.5 The mistakes that cost people offers

1. **Coding a greedy without trying to break it.** Look for a counterexample before you write code.
2. **Sorting intervals by the wrong key:** start for merging, end for selecting.
3. **Mixing up closed and half-open intervals**, which means `<` vs `<=` at every comparison.
4. **`(a, b) -> a[0] - b[0]` comparators** with large or negative coordinates.
5. **In merge, writing `last[1] = iv[1]`** instead of `Math.max(last[1], iv[1])`: a contained interval
   shrinks the group.
6. **Changing the caller's arrays** while merging, when the caller still needs them.
7. **Simulating step by step** when counting works (task scheduler, difference arrays).
8. **Using greedy for 0/1 knapsack or arbitrary coin change.**
9. **Missing the heap fix:** when a greedy almost works but needs to change its mind, keep the past
   choices in a heap (1.5).
10. **Not explaining *why*.** "It's greedy" isn't an answer; one sentence of exchange argument is.

## 3.6 The one-page summary

```text
GREEDY        one irrevocable choice per step; valid only with a proof
PROVE IT      exchange argument  (swap OPT's choice for mine: no worse)
              stays ahead        (after each step, greedy is at least as far along)
              but first: try to break it on 3-4 tiny inputs
NOT GREEDY    0/1 knapsack, arbitrary coin change, weighted intervals -> DP

SHAPES
  reach       track farthest; Jump II = BFS layers (layerEnd, farthest)
  balance     running sum; reset the start when it goes negative; total >= 0 => answer
  match       sort both, two pointers from the extremes; two bins: sort by a - b
  regret      forced order + heap of past choices; drop the worst / take the best in hindsight
  two passes  left rule, then right rule with max
  last index  stretch end to the last occurrence; cut when i == end
  frames      (max - 1) * (n + 1) + tied, but at least tasks.length

INTERVALS     closed [s,e] vs half-open [s,e): decide first
  overlap     a.s <= b.e && b.s <= a.e      (strict < for half-open)
  merge       sort by START; extend with max(end)
  insert      before / absorb overlapping / after, O(n)
  select      sort by END; keep if start >= lastEnd (removals, arrows, pair chains)
  rooms       sort starts and ends separately (or a min-heap of ends); the most alive at once
  ranges      difference array: +x at l, -x past r, prefix sum
  two lists   intersection [max s, min e]; advance the one that ends first
  covered     start asc, end DESC; covered if end <= maxEnd
  online      TreeMap floorEntry / ceilingEntry
COMPARATORS   comparingInt / Integer.compare, never a[0] - b[0]
```

Print that block. Read it before every mock interview.
