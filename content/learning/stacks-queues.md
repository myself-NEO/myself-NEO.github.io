# Stacks, Queues & Heaps — From Scratch to Advanced

A complete, self-contained deep dive for Java interviews (Google L4 / Amazon SDE3 level).

**How to use this file:** Read Part 1 → Part 2 → Part 3 in order. Each part goes
*concept → internal mechanics → Java API → implement it yourself → patterns → problems*.
The patterns are the important bit. Nobody memorises 200 problems; you memorise ~15
patterns and learn the trigger phrases that map a problem onto one of them.

---

## Table of Contents

**[Part 0 — The mental model that ties all three together](#part-0--the-mental-model)**

**[Part 1 — Stacks](#part-1--stacks)**
1. [What a stack actually is](#11-what-a-stack-actually-is)
2. [Java APIs (and the one you should never use)](#12-java-apis--and-the-one-you-should-never-use)
3. [Building a stack from scratch](#13-building-a-stack-from-scratch)
4. [Pattern 1: Matching / balancing](#14-pattern-1--matching--balancing)
5. [Pattern 2: Monotonic stack (the big one)](#15-pattern-2--monotonic-stack--the-highest-value-stack-pattern)
6. [Pattern 3: Expression parsing & calculators](#16-pattern-3--expression-parsing--calculators)
7. [Pattern 4: Augmented stacks (MinStack)](#17-pattern-4--augmented-stacks)
8. [Pattern 5: Simulation / collapse](#18-pattern-5--simulation--collapse)
9. [Pattern 6: Recursion → explicit stack](#19-pattern-6--recursion--explicit-stack)
10. [Stack recognition cheat sheet](#110-stack-recognition-cheat-sheet)

**[Part 2 — Queues](#part-2--queues)**
1. [What a queue actually is](#21-what-a-queue-actually-is)
2. [Java APIs](#22-java-apis)
3. [Building a queue from scratch (circular buffer)](#23-building-a-queue-from-scratch--the-circular-buffer)
4. [Queue ↔ Stack conversions](#24-queue--stack-conversions)
5. [Pattern 1: BFS (the reason queues exist in interviews)](#25-pattern-1--bfs--the-reason-queues-exist-in-interviews)
6. [Pattern 2: Multi-source BFS](#26-pattern-2--multi-source-bfs-)
7. [Pattern 3: Monotonic deque (sliding window)](#27-pattern-3--monotonic-deque--sliding-window-maxmin)
8. [Pattern 4: Kahn's topological sort](#28-pattern-4--kahns-algorithm-topological-sort-via-queue-)
9. [Pattern 5: 0-1 BFS](#29-pattern-5--0-1-bfs-deque-as-a-cheap-dijkstra)
10. [Queue recognition cheat sheet](#210-queue-recognition-cheat-sheet)

**[Part 3 — Heaps / Priority Queues](#part-3--heaps--priority-queues)**
1. [What a heap actually is](#31-what-a-heap-actually-is)
2. [The array trick & the two sift operations](#32-the-array-trick--the-two-sift-operations)
3. [Building a heap from scratch + why build is O(n)](#33-building-a-heap-from-scratch)
4. [Java `PriorityQueue` API and its five traps](#34-java-priorityqueue--api-and-five-traps)
5. [Pattern 1: Top-K](#35-pattern-1--top-k-)
6. [Pattern 2: K-way merge](#36-pattern-2--k-way-merge-)
7. [Pattern 3: Two heaps (running median)](#37-pattern-3--two-heaps-)
8. [Pattern 4: Scheduling / intervals](#38-pattern-4--scheduling--intervals-)
9. [Pattern 5: Greedy-with-heap](#39-pattern-5--greedy-with-a-heap)
10. [Pattern 6: Heap in graph algorithms (Dijkstra / Prim)](#310-pattern-6--heaps-in-graph-algorithms)
11. [Heap vs Quickselect vs TreeMap vs sorting](#311-heap-vs-quickselect-vs-treemap-vs-sorting)
12. [Heap recognition cheat sheet](#312-heap-recognition-cheat-sheet)

**[Part 4 — A universal solving framework + problem ladder + mistakes](#part-4--solving-any-question)**

---

# Part 0 — The Mental Model

All three structures answer the same question: **"which element do I process next?"**
They differ only in the answer.

| Structure | Next element is… | Order | Core op cost |
|---|---|---|---|
| Stack | the **most recently** added | LIFO | O(1) |
| Queue | the **least recently** added | FIFO | O(1) |
| Heap | the **most extreme** (min or max) | by priority | O(log n) |

That's it. Everything else is decoration.

The deeper insight for interviews:

- A **stack** is how you remember *"I'm not done with this yet, come back to it."*
  Nesting, undo, pending work, "the last thing still open".
- A **queue** is how you process things in **waves**. That is why BFS = queue: wave 0 is
  the start node, wave 1 is everything one step away, etc. Queues give you *level* /
  *distance* structure for free.
- A **heap** is how you get the best element repeatedly **without** paying for a full sort.
  Sorting costs O(n log n) once and gives you *all* order. A heap costs O(log n) per
  extraction and gives you *just enough* order. If you only need the top 5 of a million
  items, or the data arrives in a stream, the heap wins.

Three sentences worth remembering when the interviewer asks "why this data structure?":

> - Stack: *the problem has nested/pending structure and the innermost unresolved thing must resolve first.*
> - Queue: *the problem processes items in waves and I need level/distance ordering.*
> - Heap: *I repeatedly need the extreme element from a changing set, and I don't need full sorted order.*

---

# Part 1 — Stacks

## 1.1 What a stack actually is

A stack is a linear collection with a single access point, the **top**. Three operations:

- `push(x)` — put x on top
- `pop()` — remove and return the top
- `peek()` — look at the top without removing

**LIFO**: Last In, First Out. Plate stack, browser back button, undo history, the call
stack your JVM already uses for every method invocation.

All operations are **O(1)**. Space is O(n).

The reason it matters: a stack is the natural memory for **nested** structure. When you
see `( [ { } ] )`, or nested folders, or nested function calls, or an expression like
`2 * (3 + (4 - 1))`, the innermost thing must finish first — that's exactly LIFO.

## 1.2 Java APIs — and the one you should never use

```java
// ❌ DON'T — java.util.Stack
Stack<Integer> s = new Stack<>();
```

`java.util.Stack` extends `Vector`. Three problems:
1. Every method is `synchronized` → pointless locking overhead in single-threaded code.
2. It's a `Vector`, so it exposes `get(i)`, `add(i, x)`, etc. — it isn't really a stack.
3. **Its iteration order is bottom-to-top**, i.e. the *reverse* of pop order. This has
   silently broken a lot of interview code.

```java
// ✅ DO — ArrayDeque as a stack
Deque<Integer> stack = new ArrayDeque<>();
stack.push(1);          // addFirst
stack.push(2);
int top  = stack.peek();  // 2, peekFirst, null if empty
int out  = stack.pop();   // 2, removeFirst, throws NoSuchElementException if empty
boolean empty = stack.isEmpty();
int size = stack.size();
```

`ArrayDeque` is a growable circular array. Faster than `LinkedList` (no node objects, cache
friendly) and faster than `Stack` (no locks). **Iterating an `ArrayDeque` used via `push`
goes top → bottom**, which is what you usually want.

One gotcha: **`ArrayDeque` does not permit `null` elements.** If you need nulls, use
`LinkedList`. You almost never do.

For `char`/`int` heavy problems where you care about constant factors, a plain array is fine
and often clearer:

```java
int[] stack = new int[n];
int top = 0;                 // stack[top-1] is the top element
stack[top++] = x;            // push
int v = stack[--top];        // pop
boolean empty = (top == 0);
```

Interviewers like this — it shows you know a stack is just an array plus an index.

## 1.3 Building a stack from scratch

**Approach.** Two choices of backing store: an array (fast, needs resizing) or a linked
list (no resizing, extra node allocation). Know both; array-based is asked more.

### Array-based, with amortised O(1) growth

```java
public class ArrayStack<T> {
    private Object[] data;
    private int size;

    public ArrayStack() { this(16); }

    public ArrayStack(int capacity) {
        if (capacity <= 0) capacity = 1;
        data = new Object[capacity];
    }

    public void push(T x) {
        if (size == data.length) resize(data.length * 2);
        data[size++] = x;
    }

    @SuppressWarnings("unchecked")
    public T pop() {
        if (isEmpty()) throw new java.util.NoSuchElementException("stack is empty");
        T val = (T) data[--size];
        data[size] = null;                       // avoid loitering / memory leak
        if (size > 0 && size == data.length / 4) // shrink at 1/4, not 1/2
            resize(data.length / 2);
        return val;
    }

    @SuppressWarnings("unchecked")
    public T peek() {
        if (isEmpty()) throw new java.util.NoSuchElementException("stack is empty");
        return (T) data[size - 1];
    }

    public boolean isEmpty() { return size == 0; }
    public int size()        { return size; }

    private void resize(int newCap) {
        Object[] bigger = new Object[newCap];
        System.arraycopy(data, 0, bigger, 0, size);
        data = bigger;
    }
}
```

**Explanation of the non-obvious parts:**

- `data[size] = null` on pop. Without it the array still holds a reference to a popped
  object, so the GC can't collect it. This is called *loitering*. Interviewers at Google
  specifically look for it.
- **Doubling on grow** gives *amortised* O(1) push: n pushes cost 1+2+4+...+n ≈ 2n copies
  total, so O(1) each on average. A single push can still be O(n) — say "amortised O(1),
  worst case O(n)" and you sound precise.
- **Shrink at 1/4, halve to 1/2** (not shrink at 1/2). If you shrank at half-full, a
  push-pop-push-pop sequence at the boundary would resize every single operation — O(n) per
  op. This is called *thrashing*, and avoiding it is a classic follow-up question.

### Linked-list based

```java
public class LinkedStack<T> {
    private static class Node<T> {
        T val; Node<T> next;
        Node(T val, Node<T> next) { this.val = val; this.next = next; }
    }

    private Node<T> head;   // head == top
    private int size;

    public void push(T x) { head = new Node<>(x, head); size++; }

    public T pop() {
        if (head == null) throw new java.util.NoSuchElementException();
        T val = head.val;
        head = head.next;
        size--;
        return val;
    }

    public T peek() {
        if (head == null) throw new java.util.NoSuchElementException();
        return head.val;
    }

    public boolean isEmpty() { return head == null; }
    public int size()        { return size; }
}
```

**Trade-off to state in an interview:** array-based has better cache locality and less
memory per element but has occasional O(n) resizes; linked-list gives true worst-case O(1)
per operation but allocates a node per push (≈16–32 bytes of object overhead each) and
pointer-chases badly. For interview code, array-based wins unless worst-case latency matters.

---

## 1.4 Pattern 1 — Matching / balancing

**Trigger:** brackets, tags, nesting, "valid", "balanced", "remove to make valid".

**Core idea:** push openers; on a closer, the top must be its matching opener.

### Valid Parentheses

```java
public boolean isValid(String s) {
    Deque<Character> stack = new ArrayDeque<>();
    for (char c : s.toCharArray()) {
        switch (c) {
            case '(': case '[': case '{':
                stack.push(c);
                break;
            default:
                if (stack.isEmpty()) return false;   // closer with nothing open
                char open = stack.pop();
                if ((c == ')' && open != '(')
                 || (c == ']' && open != '[')
                 || (c == '}' && open != '{')) return false;
        }
    }
    return stack.isEmpty();   // nothing left unclosed
}
```

Time O(n), space O(n).

**Two failure modes people miss** — say both out loud:
1. closer arriving on an empty stack (`")("`),
2. leftovers at the end (`"(("`). Returning `true` without the final `isEmpty()` check is
   the single most common bug here.

**Neat trick for the push side:** push the *expected closer* instead of the opener, so the
comparison becomes a single equality:

```java
for (char c : s.toCharArray()) {
    if (c == '(') stack.push(')');
    else if (c == '[') stack.push(']');
    else if (c == '{') stack.push('}');
    else if (stack.isEmpty() || stack.pop() != c) return false;
}
return stack.isEmpty();
```

### Minimum Remove to Make Valid Parentheses

**Approach:** stack holds *indices* of unmatched `(`. Anything left in the stack at the
end is unmatched; any `)` that finds an empty stack is unmatched. Mark and delete.

```java
public String minRemoveToMakeValid(String s) {
    char[] a = s.toCharArray();
    Deque<Integer> open = new ArrayDeque<>();
    for (int i = 0; i < a.length; i++) {
        if (a[i] == '(') open.push(i);
        else if (a[i] == ')') {
            if (open.isEmpty()) a[i] = '#';   // unmatched closer
            else open.pop();
        }
    }
    while (!open.isEmpty()) a[open.pop()] = '#';   // unmatched openers

    StringBuilder sb = new StringBuilder();
    for (char c : a) if (c != '#') sb.append(c);
    return sb.toString();
}
```

**Interview note:** storing *indices* rather than characters is the upgrade that turns
"validate" problems into "repair/report" problems. Learn to reach for indices by default.

---

## 1.5 Pattern 2 — Monotonic Stack ⭐ (the highest-value stack pattern)

If you learn one thing from Part 1, learn this. Monotonic stacks appear constantly at
Google/Amazon and they look like magic until you see the invariant.

**Trigger phrases:**
- "next greater / next smaller element"
- "previous greater / previous smaller element"
- "how many days until a warmer temperature"
- "largest rectangle", "maximal area", "span"
- "for each element, find the nearest element on the left/right that is bigger/smaller"

**Core idea:** keep the stack **sorted** (increasing or decreasing) at all times. Before
pushing a new element, pop everything that violates the order. **The popped element has
just found its answer** — the incoming element is its "next greater/smaller".

**The invariant that makes it click:** an element sitting in the stack is one *whose answer
is not yet known*. The moment something arrives that resolves it, it leaves. Each element
is pushed once and popped once → **O(n) total**, even though there's a nested `while`.

### The template (memorise this shape)

```java
// Next Greater Element to the right, for every index.
// res[i] = value of first element to the right of i that is > nums[i], else -1
public int[] nextGreater(int[] nums) {
    int n = nums.length;
    int[] res = new int[n];
    Arrays.fill(res, -1);
    Deque<Integer> stack = new ArrayDeque<>();   // holds INDICES, decreasing by value

    for (int i = 0; i < n; i++) {
        // current element resolves everything smaller sitting in the stack
        while (!stack.isEmpty() && nums[stack.peek()] < nums[i]) {
            res[stack.pop()] = nums[i];
        }
        stack.push(i);
    }
    return res;
}
```

**The four-way dial.** Every monotonic-stack problem is this template with two knobs:

| Want | Direction of loop | Pop condition |
|---|---|---|
| Next **greater** right | left → right | `nums[stack.peek()] < nums[i]` |
| Next **smaller** right | left → right | `nums[stack.peek()] > nums[i]` |
| Previous **greater** left | left → right, read `stack.peek()` *before* pushing | `nums[stack.peek()] <= nums[i]` |
| Previous **smaller** left | left → right, read `stack.peek()` *before* pushing | `nums[stack.peek()] >= nums[i]` |

For "previous" variants you don't assign on pop — you read the surviving top:

```java
// Previous Smaller Element for each index
public int[] previousSmaller(int[] nums) {
    int n = nums.length;
    int[] res = new int[n];
    Deque<Integer> stack = new ArrayDeque<>();   // increasing by value
    for (int i = 0; i < n; i++) {
        while (!stack.isEmpty() && nums[stack.peek()] >= nums[i]) stack.pop();
        res[i] = stack.isEmpty() ? -1 : nums[stack.peek()];
        stack.push(i);
    }
    return res;
}
```

**`<` vs `<=` matters only with duplicates.** Decide deliberately: use strict `<` when equal
elements should *not* resolve each other, `<=` when they should. For the histogram problem
below, either works for the final answer but for "count of subarrays where x is the minimum"
you must use strict on one side and non-strict on the other to avoid double counting.

### Daily Temperatures

```java
public int[] dailyTemperatures(int[] t) {
    int n = t.length;
    int[] res = new int[n];
    Deque<Integer> stack = new ArrayDeque<>();
    for (int i = 0; i < n; i++) {
        while (!stack.isEmpty() && t[stack.peek()] < t[i]) {
            int j = stack.pop();
            res[j] = i - j;            // distance, not value
        }
        stack.push(i);
    }
    return res;                        // 0 by default = no warmer day
}
```

Identical template; the only change is storing `i - j` instead of `t[i]`. That's why you
store indices — indices give you both value *and* distance.

### Next Greater Element II (circular array)

**Approach:** simulate wrap-around by looping `2n` times and using `i % n`. Only push in
the first pass (second pass exists purely to resolve leftovers).

```java
public int[] nextGreaterElements(int[] nums) {
    int n = nums.length;
    int[] res = new int[n];
    Arrays.fill(res, -1);
    Deque<Integer> stack = new ArrayDeque<>();
    for (int i = 0; i < 2 * n; i++) {
        int cur = nums[i % n];
        while (!stack.isEmpty() && nums[stack.peek()] < cur) res[stack.pop()] = cur;
        if (i < n) stack.push(i);
    }
    return res;
}
```

**The "double the array" trick for circular problems is worth generalising** — it shows up
in circular DP and circular sliding window too.

### Largest Rectangle in Histogram ⭐⭐

The single most important hard stack problem. Asked directly, and as a subroutine.

**Approach.** For each bar `i`, the largest rectangle *with height exactly `h[i]`* extends
left until a strictly shorter bar and right until a strictly shorter bar. So width =
(nextSmallerRight − prevSmallerLeft − 1). That's two monotonic stacks, but you can do it in
**one pass**: when bar `i` pops bar `j`, `i` *is* `j`'s next-smaller-right, and the new stack
top *is* `j`'s previous-smaller-left.

```java
public int largestRectangleArea(int[] h) {
    int n = h.length, best = 0;
    Deque<Integer> stack = new ArrayDeque<>();   // increasing heights

    for (int i = 0; i <= n; i++) {
        int cur = (i == n) ? 0 : h[i];           // sentinel flushes the stack
        while (!stack.isEmpty() && h[stack.peek()] >= cur) {
            int height = h[stack.pop()];
            int left   = stack.isEmpty() ? -1 : stack.peek();
            int width  = i - left - 1;
            best = Math.max(best, height * width);
        }
        stack.push(i);
    }
    return best;
}
```

**Explanation:**
- The stack holds indices of bars in increasing height. Anything still in the stack has no
  shorter bar to its right *yet*.
- When popping `j`: the right boundary is `i` (first shorter), the left boundary is the new
  top (first shorter on the left, because everything between was taller and already popped).
  Width `i - left - 1` is the count of bars strictly between the two boundaries.
- The **sentinel** `cur = 0` at `i == n` forces every remaining bar to pop, so you don't need
  a separate flush loop. Sentinels are the cleanest way to kill edge cases — use them.
- Note `stack.push(i)` happens even at `i == n`; harmless since the loop ends.

O(n) time, O(n) space.

**Follow-up that always comes:** *Maximal Rectangle* in a binary matrix. Build a histogram
per row (`heights[c] = grid[r][c]=='1' ? heights[c]+1 : 0`) and call the above for each row.
O(rows × cols).

```java
public int maximalRectangle(char[][] matrix) {
    if (matrix.length == 0) return 0;
    int cols = matrix[0].length, best = 0;
    int[] heights = new int[cols];
    for (char[] row : matrix) {
        for (int c = 0; c < cols; c++)
            heights[c] = (row[c] == '1') ? heights[c] + 1 : 0;
        best = Math.max(best, largestRectangleArea(heights));
    }
    return best;
}
```

### Trapping Rain Water (stack version)

**Approach.** Water is trapped in horizontal *layers*. A decreasing stack of bar indices;
when a taller bar arrives it closes a basin whose floor is the popped bar and whose walls
are the new bar and the new stack top.

```java
public int trap(int[] h) {
    Deque<Integer> stack = new ArrayDeque<>();   // decreasing heights
    int water = 0;
    for (int i = 0; i < h.length; i++) {
        while (!stack.isEmpty() && h[stack.peek()] < h[i]) {
            int floor = stack.pop();
            if (stack.isEmpty()) break;          // no left wall → water escapes
            int left = stack.peek();
            int width = i - left - 1;
            int depth = Math.min(h[left], h[i]) - h[floor];
            water += width * depth;
        }
        stack.push(i);
    }
    return water;
}
```

**Interview note:** the two-pointer solution is O(n) time **O(1) space** and is the better
answer here. Mention you know both and that two-pointer wins on space — that's the kind of
comparison L4/SDE3 interviewers grade on.

### Sum of Subarray Minimums (the counting variant)

**Approach.** For each element, count how many subarrays it is the minimum of:
`(i - prevSmaller) * (nextSmaller - i)`. Contribution = `nums[i] * that count`.

```java
public int sumSubarrayMins(int[] a) {
    final int MOD = 1_000_000_007;
    int n = a.length;
    long sum = 0;
    Deque<Integer> stack = new ArrayDeque<>();   // increasing
    for (int i = 0; i <= n; i++) {
        while (!stack.isEmpty() && (i == n || a[stack.peek()] >= a[i])) {
            int mid   = stack.pop();
            int left  = stack.isEmpty() ? -1 : stack.peek();
            long count = (long)(mid - left) * (i - mid);
            sum = (sum + count % MOD * a[mid]) % MOD;
        }
        stack.push(i);
    }
    return (int) sum;
}
```

**The duplicate subtlety:** the pop condition uses `>=` (non-strict on the left side) and the
right boundary is strict. If you used `>=` on both, subarrays of equal minimums get counted
twice. This "strict on one side, non-strict on the other" rule is *the* thing to remember for
all monotonic **counting** problems.

**This "contribution technique" generalises:** instead of iterating over subarrays, iterate
over elements and count how many subarrays each one dominates. It turns O(n²) into O(n).

---

## 1.6 Pattern 3 — Expression parsing & calculators

**Trigger:** evaluate an expression, infix/postfix, `"3+2*2"`, nested `"2*(5+5*2)/3"`,
decode a nested string.

### Basic Calculator II — `+ - * /`, no parentheses

**Approach.** Keep a running stack of *terms*. `+`/`-` push a new term (signed). `*`/`/`
pop the last term, combine, push back. Answer = sum of the stack. The trick is to process
the operator *that came before* the current number.

```java
public int calculate(String s) {
    Deque<Integer> stack = new ArrayDeque<>();
    int num = 0;
    char op = '+';                       // pretend a leading '+'
    for (int i = 0; i < s.length(); i++) {
        char c = s.charAt(i);
        if (Character.isDigit(c)) num = num * 10 + (c - '0');

        if ((!Character.isDigit(c) && c != ' ') || i == s.length() - 1) {
            switch (op) {
                case '+': stack.push(num); break;
                case '-': stack.push(-num); break;
                case '*': stack.push(stack.pop() * num); break;
                case '/': stack.push(stack.pop() / num); break;
            }
            op = c;
            num = 0;
        }
    }
    int sum = 0;
    while (!stack.isEmpty()) sum += stack.pop();
    return sum;
}
```

**Explanation:** precedence is handled without any precedence table — `*`/`/` fold
immediately into the top term while `+`/`-` defer by pushing. The `i == s.length()-1`
condition flushes the final number. Multi-digit numbers are handled by
`num = num*10 + digit`, the standard accumulate idiom.

### Basic Calculator I — `+ -` with parentheses

**Approach.** Different shape: track a running `result` and a `sign`. On `(`, push the
current `result` and `sign` and reset. On `)`, pop and combine.

```java
public int calculate(String s) {
    Deque<Integer> stack = new ArrayDeque<>();
    int result = 0, num = 0, sign = 1;
    for (char c : s.toCharArray()) {
        if (Character.isDigit(c)) {
            num = num * 10 + (c - '0');
        } else if (c == '+') {
            result += sign * num; num = 0; sign = 1;
        } else if (c == '-') {
            result += sign * num; num = 0; sign = -1;
        } else if (c == '(') {
            stack.push(result);          // save outer context
            stack.push(sign);
            result = 0; sign = 1;        // fresh sub-expression
        } else if (c == ')') {
            result += sign * num; num = 0;
            result *= stack.pop();       // the sign before '('
            result += stack.pop();       // the result before '('
            sign = 1;
        }
    }
    return result + sign * num;          // flush trailing number
}
```

**The general lesson:** `(` = *save context and start fresh*; `)` = *restore context and
merge*. That is exactly what a call stack does, and it's the shape of every nested-parsing
problem.

### Decode String — `"3[a2[c]]"` → `"accaccacc"`

Same save/restore shape, with two stacks:

```java
public String decodeString(String s) {
    Deque<Integer> counts = new ArrayDeque<>();
    Deque<StringBuilder> parts = new ArrayDeque<>();
    StringBuilder cur = new StringBuilder();
    int k = 0;

    for (char c : s.toCharArray()) {
        if (Character.isDigit(c)) {
            k = k * 10 + (c - '0');
        } else if (c == '[') {
            counts.push(k);
            parts.push(cur);
            k = 0;
            cur = new StringBuilder();
        } else if (c == ']') {
            StringBuilder decoded = parts.pop();
            int times = counts.pop();
            for (int i = 0; i < times; i++) decoded.append(cur);
            cur = decoded;
        } else {
            cur.append(c);
        }
    }
    return cur.toString();
}
```

### Evaluate Reverse Polish Notation

Postfix needs no parentheses and no precedence — that's why compilers convert to it.

```java
public int evalRPN(String[] tokens) {
    Deque<Integer> stack = new ArrayDeque<>();
    for (String t : tokens) {
        switch (t) {
            case "+": stack.push(stack.pop() + stack.pop()); break;
            case "*": stack.push(stack.pop() * stack.pop()); break;
            case "-": { int b = stack.pop(), a = stack.pop(); stack.push(a - b); break; }
            case "/": { int b = stack.pop(), a = stack.pop(); stack.push(a / b); break; }
            default:  stack.push(Integer.parseInt(t));
        }
    }
    return stack.pop();
}
```

**Watch the order for non-commutative operators** — `a - b`, not `b - a`. Popping gives you
the *second* operand first. This is the #1 bug in RPN questions.

### Infix → Postfix (Shunting-yard) — good to know, rarely coded

Scan left to right: operands go straight to output; operators pop higher-or-equal precedence
operators off the stack into the output, then push; `(` pushes; `)` pops until `(`. Mention
it by name if asked to "build an expression evaluator" — it signals compiler literacy.

---

## 1.7 Pattern 4 — Augmented stacks

**Trigger:** "design a stack that also supports X in O(1)".

**Core idea:** if the extra query is about a *prefix* of the stack, store the answer
alongside each element. Because the stack only ever grows/shrinks at the top, the answer for
"everything below me" never changes while I'm on the stack.

### Min Stack — O(1) `getMin()`

```java
class MinStack {
    private final Deque<int[]> stack = new ArrayDeque<>();  // {value, minSoFar}

    public void push(int val) {
        int min = stack.isEmpty() ? val : Math.min(val, stack.peek()[1]);
        stack.push(new int[]{val, min});
    }
    public void pop()      { stack.pop(); }
    public int  top()      { return stack.peek()[0]; }
    public int  getMin()   { return stack.peek()[1]; }
}
```

O(1) everything, O(n) extra space.

**Follow-up: can you do O(1) extra space?** Yes — encode the old minimum into the pushed
value using `2*val - min`. Careful with overflow (use `long`):

```java
class MinStackO1 {
    private final Deque<Long> stack = new ArrayDeque<>();
    private long min;

    public void push(int val) {
        if (stack.isEmpty()) { min = val; stack.push((long) val); return; }
        if (val < min) { stack.push(2L * val - min); min = val; }  // encoded marker
        else stack.push((long) val);
    }
    public void pop() {
        long top = stack.pop();
        if (top < min) min = 2 * min - top;   // decode previous min
    }
    public int top() {
        long top = stack.peek();
        return (int) (top < min ? min : top);
    }
    public int getMin() { return (int) min; }
}
```

**Explanation:** when a new minimum arrives we store `2*val - min`, which is strictly less
than `val` and therefore less than the new `min` — that's the flag. On pop, if the stored
value is below `min`, it's an encoded entry and the previous min is recovered as
`2*min - stored`. Show the O(n)-space version first, then offer this as the optimisation.
Leading with the clever one and getting it wrong is worse than leading with the simple one.

**Same pattern:** MaxStack, stack with O(1) sum, stack with O(1) "count of elements > k".

---

## 1.8 Pattern 5 — Simulation / collapse

**Trigger:** "adjacent elements cancel/merge/destroy each other", "remove k to make smallest",
"collapse the string".

**Core idea:** the stack holds the *result so far*. Each incoming element may collapse
backwards into it.

### Asteroid Collision

```java
public int[] asteroidCollision(int[] asteroids) {
    Deque<Integer> stack = new ArrayDeque<>();   // used as a growable result list
    for (int a : asteroids) {
        boolean alive = true;
        // only collide when stack top moves right (>0) and a moves left (<0)
        while (alive && a < 0 && !stack.isEmpty() && stack.peek() > 0) {
            if (stack.peek() < -a) { stack.pop(); continue; }   // top destroyed, keep going
            if (stack.peek() == -a) stack.pop();                // both destroyed
            alive = false;                                      // a destroyed (or mutual)
        }
        if (alive) stack.push(a);
    }
    int[] res = new int[stack.size()];
    for (int i = res.length - 1; i >= 0; i--) res[i] = stack.pop();  // stack is top-first
    return res;
}
```

**The collision condition `stack.peek() > 0 && a < 0` is the whole problem.** Two
right-movers never collide; two left-movers never collide; a left-mover then a right-mover
diverge. Only right-then-left collides.

### Remove K Digits (smallest number after removing k digits)

**Approach:** greedy + monotonic stack. To make the number small, you want the leftmost
digits small, so whenever a smaller digit arrives, pop larger digits before it (if you still
have removals left).

```java
public String removeKdigits(String num, int k) {
    Deque<Character> stack = new ArrayDeque<>();   // will hold digits, increasing-ish
    for (char c : num.toCharArray()) {
        while (k > 0 && !stack.isEmpty() && stack.peek() > c) { stack.pop(); k--; }
        stack.push(c);
    }
    while (k-- > 0) stack.pop();                  // still have removals: drop from the end

    StringBuilder sb = new StringBuilder();
    while (!stack.isEmpty()) sb.append(stack.pop());
    sb.reverse();
    while (sb.length() > 1 && sb.charAt(0) == '0') sb.deleteCharAt(0);  // strip leading zeros
    return sb.length() == 0 ? "0" : sb.toString();
}
```

**Three edge cases that are always tested:** leftover `k` (input already increasing, e.g.
`"12345"`), leading zeros (`"10200", k=1` → `"200"`), and everything removed (`"9", k=1` → `"0"`).

**Same family:** *Remove Duplicate Letters* / *Smallest Subsequence of Distinct Characters*
(monotonic stack + a "last occurrence" array + an "in stack" boolean array), *132 Pattern*,
*Remove All Adjacent Duplicates*.

### Simplify Path — `"/a/./b/../../c/"` → `"/c"`

```java
public String simplifyPath(String path) {
    Deque<String> stack = new ArrayDeque<>();    // bottom = first directory
    for (String part : path.split("/")) {
        if (part.isEmpty() || part.equals(".")) continue;
        if (part.equals("..")) { if (!stack.isEmpty()) stack.pollLast(); }
        else stack.offerLast(part);
    }
    return "/" + String.join("/", stack);        // ArrayDeque iterates first→last here
}
```

Using `offerLast`/`pollLast` keeps iteration order natural for the final join — a small
trick that avoids a reverse.

---

## 1.9 Pattern 6 — Recursion → explicit stack

**Trigger:** "solve it iteratively", "without recursion", "the tree is 10⁵ deep and you'd
blow the stack".

Every recursive function is a stack machine. Converting is mechanical: the stack holds the
*local state* you'd otherwise keep in a stack frame.

### Iterative inorder traversal

```java
public List<Integer> inorderTraversal(TreeNode root) {
    List<Integer> out = new ArrayList<>();
    Deque<TreeNode> stack = new ArrayDeque<>();
    TreeNode cur = root;
    while (cur != null || !stack.isEmpty()) {
        while (cur != null) { stack.push(cur); cur = cur.left; }  // dive left
        cur = stack.pop();
        out.add(cur.val);                                          // visit
        cur = cur.right;                                           // then right
    }
    return out;
}
```

### Iterative postorder — the "two stacks" trick

Postorder is Left-Right-Root. Do a modified preorder (Root-Right-Left) and reverse it:

```java
public List<Integer> postorderTraversal(TreeNode root) {
    LinkedList<Integer> out = new LinkedList<>();
    Deque<TreeNode> stack = new ArrayDeque<>();
    if (root != null) stack.push(root);
    while (!stack.isEmpty()) {
        TreeNode n = stack.pop();
        out.addFirst(n.val);                       // prepend == reverse
        if (n.left  != null) stack.push(n.left);
        if (n.right != null) stack.push(n.right);
    }
    return out;
}
```

### Iterative DFS on a graph

```java
void dfsIterative(int start, List<List<Integer>> adj, boolean[] visited) {
    Deque<Integer> stack = new ArrayDeque<>();
    stack.push(start);
    while (!stack.isEmpty()) {
        int node = stack.pop();
        if (visited[node]) continue;      // mark on POP, not on push
        visited[node] = true;
        // process node
        for (int nb : adj.get(node)) if (!visited[nb]) stack.push(nb);
    }
}
```

**The classic bug:** marking visited on *push* vs on *pop* gives different traversal orders,
and marking only on push can prevent a node from being reached via a shorter path in some
variants. Marking on pop with a `continue` guard is the safe default. Also note iterative DFS
visits children in *reverse* order compared to recursion (because the last child pushed pops
first) — push in reverse if order matters.

### Sort a stack using only stack operations

```java
public void sortStack(Deque<Integer> s) {
    Deque<Integer> tmp = new ArrayDeque<>();
    while (!s.isEmpty()) {
        int cur = s.pop();
        while (!tmp.isEmpty() && tmp.peek() > cur) s.push(tmp.pop());
        tmp.push(cur);
    }
    while (!tmp.isEmpty()) s.push(tmp.pop());   // back to original, now sorted
}
```

O(n²) time, O(n) space — it's insertion sort with stacks. Classic warm-up question.

---

## 1.10 Stack recognition cheat sheet

| You see… | Reach for |
|---|---|
| brackets, tags, nesting, "valid" | matching stack |
| "next/previous greater/smaller" | monotonic stack |
| "how many days/steps until…" | monotonic stack, store indices |
| histogram, rectangle, area, span | monotonic stack + width formula |
| "sum over all subarrays of min/max" | monotonic stack + contribution counting |
| infix expression, `(`, precedence | calculator stack (save/restore context) |
| "design stack with O(1) getMin/getMax" | augmented stack (pair values) |
| adjacent elements cancel/merge | collapse stack |
| "lexicographically smallest after removing k" | greedy monotonic stack |
| "do it iteratively", "no recursion" | explicit stack holding frame state |
| undo/redo, backtrack, browser history | two stacks |

**Debugging checklist for any stack solution:**
1. Did I check `isEmpty()` before every `peek()`/`pop()`?
2. Did I handle leftovers in the stack after the loop? (Sentinel or flush loop.)
3. Am I storing indices where I need distance/width?
4. Strict `<` or non-strict `<=` — did I think about duplicates?
5. Is my final output in the right order? (`ArrayDeque` iteration is top-first when used
   with `push`.)

---

# Part 2 — Queues

## 2.1 What a queue actually is

A queue has two access points: you add at the **rear** and remove from the **front**.

- `offer(x)` / `enqueue` — add at rear
- `poll()` / `dequeue` — remove from front
- `peek()` — look at the front

**FIFO**: First In, First Out. Ticket line, printer spool, message broker, task scheduler.

All operations O(1). Space O(n).

**Why queues matter in interviews:** they give you **level structure**. If you enqueue the
start of something and then enqueue its neighbours, everything at distance 1 comes out before
anything at distance 2. That property *is* BFS, and BFS *is* shortest path on unweighted
graphs. Roughly 80% of queue interview questions are BFS wearing a costume.

### The Deque — a queue that opens at both ends

A **deque** (double-ended queue) supports add/remove at both ends in O(1). It is a superset:
use one end only → stack; use both ends in FIFO fashion → queue; use both ends cleverly →
monotonic deque (Section 2.7). In Java, `ArrayDeque` is your single go-to for all three.

## 2.2 Java APIs

```java
Queue<Integer> q = new ArrayDeque<>();   // ✅ preferred
q.offer(1);        // add at rear; returns false if capacity-bounded and full
q.add(1);          // same, but throws IllegalStateException instead
int head = q.peek();  // front, null if empty
int out  = q.poll();  // remove front, null if empty
q.isEmpty(); q.size();
```

**Throwing vs returning-null — know both column names:**

| Operation | Throws exception | Returns special value |
|---|---|---|
| Insert | `add(e)` | `offer(e)` → `false` |
| Remove | `remove()` | `poll()` → `null` |
| Examine | `element()` | `peek()` → `null` |

Use `offer`/`poll`/`peek` in interview code; the null-returning versions make the empty case
explicit instead of exceptional.

**Full `Deque` surface (worth knowing by name):**

```java
Deque<Integer> d = new ArrayDeque<>();
d.offerFirst(x); d.offerLast(x);
d.pollFirst();   d.pollLast();
d.peekFirst();   d.peekLast();
// stack aliases: push == offerFirst, pop == pollFirst(throwing), peek == peekFirst
```

**Which implementation?**

| Class | Use when |
|---|---|
| `ArrayDeque` | default for stack/queue/deque; fastest, no nulls allowed |
| `LinkedList` | you need `null` elements or `List` indexing too; otherwise slower |
| `PriorityQueue` | ordering by priority, not arrival (Part 3) |
| `ArrayBlockingQueue` / `LinkedBlockingQueue` | producer-consumer across threads, blocking `put`/`take` |
| `ConcurrentLinkedQueue` | lock-free multi-producer/consumer |
| `DelayQueue` | elements become available only after a delay (schedulers) |

The concurrent ones rarely show up in DSA rounds but *do* show up in Java/system-design
rounds — for a backend engineer, being able to say "bounded `ArrayBlockingQueue` gives you
backpressure; unbounded `LinkedBlockingQueue` will OOM under load" is worth real points.

## 2.3 Building a queue from scratch — the circular buffer

**Approach.** The naive array queue removes the front by shifting everything left — O(n) per
dequeue. Fix it with a **circular buffer**: keep `head` and `tail` indices and wrap them with
modulo. Nothing ever moves.

```java
public class CircularQueue<T> {
    private Object[] data;
    private int head;      // index of the front element
    private int size;      // number of elements

    public CircularQueue(int capacity) {
        data = new Object[Math.max(1, capacity)];
    }

    public void offer(T x) {
        if (size == data.length) resize(data.length * 2);
        int tail = (head + size) % data.length;   // derive tail from head+size
        data[tail] = x;
        size++;
    }

    @SuppressWarnings("unchecked")
    public T poll() {
        if (isEmpty()) throw new java.util.NoSuchElementException();
        T val = (T) data[head];
        data[head] = null;                        // avoid loitering
        head = (head + 1) % data.length;
        size--;
        return val;
    }

    @SuppressWarnings("unchecked")
    public T peek() {
        if (isEmpty()) throw new java.util.NoSuchElementException();
        return (T) data[head];
    }

    public boolean isEmpty() { return size == 0; }
    public int size()        { return size; }

    private void resize(int newCap) {
        Object[] bigger = new Object[newCap];
        for (int i = 0; i < size; i++)
            bigger[i] = data[(head + i) % data.length];   // unroll into linear order
        data = bigger;
        head = 0;
    }
}
```

**Explanation of the design decisions:**

- **Storing `head` + `size` instead of `head` + `tail`** removes the classic ambiguity where
  `head == tail` could mean either empty or full. With a `size` field there's no ambiguity.
  (The alternative fix — leaving one slot always empty — is what you'd mention if the
  interviewer bans the extra field.)
- **`(head + i) % length`** is the whole trick. Modulo wraps the index around the end of the
  array. If you're micro-optimising, keep the capacity a power of two and use
  `& (length - 1)` instead of `%` — a good detail to drop.
- **Resizing must unroll**, not `arraycopy` — the live elements may be split across the wrap
  point, so copy them out in logical order and reset `head = 0`.

**LeetCode "Design Circular Queue"** is exactly this with a fixed capacity (no resize,
`enQueue` returns `false` when full).

### Linked-list queue

```java
public class LinkedQueue<T> {
    private static class Node<T> { T val; Node<T> next; Node(T v) { val = v; } }
    private Node<T> head, tail;
    private int size;

    public void offer(T x) {
        Node<T> n = new Node<>(x);
        if (tail == null) head = tail = n;
        else { tail.next = n; tail = n; }
        size++;
    }

    public T poll() {
        if (head == null) throw new java.util.NoSuchElementException();
        T val = head.val;
        head = head.next;
        if (head == null) tail = null;     // ← the bug everyone forgets
        size--;
        return val;
    }

    public T peek() { if (head == null) throw new java.util.NoSuchElementException(); return head.val; }
    public boolean isEmpty() { return head == null; }
    public int size() { return size; }
}
```

**The forgotten line is `tail = null` when the queue empties.** Miss it and `tail` dangles at
a removed node; the next `offer` appends to a detached node and the queue silently loses data.
Interviewers watch for this specific line.

## 2.4 Queue ↔ Stack conversions

Classic "do you understand the structures" questions.

### Queue using two stacks — amortised O(1)

**Approach.** `in` receives pushes. `out` serves pops. Only transfer `in → out` when `out`
is empty — reversing once puts the oldest element on top.

```java
class MyQueue {
    private final Deque<Integer> in  = new ArrayDeque<>();
    private final Deque<Integer> out = new ArrayDeque<>();

    public void push(int x) { in.push(x); }

    public int pop() { shift(); return out.pop(); }

    public int peek() { shift(); return out.peek(); }

    public boolean empty() { return in.isEmpty() && out.isEmpty(); }

    private void shift() {
        if (out.isEmpty())                          // ← only when empty!
            while (!in.isEmpty()) out.push(in.pop());
    }
}
```

**The amortised argument (say this, it's the point of the question):** every element is
pushed to `in` once, moved to `out` once, popped once — 3 operations over its lifetime. So n
operations cost O(n) total → **O(1) amortised**, even though one individual `pop` can be O(n).

**The critical bug:** transferring whenever `in` is non-empty (instead of only when `out` is
empty) breaks correctness *and* the amortised bound.

### Stack using two queues

Push-costly version (`push` O(n), `pop` O(1)) — usually the preferred answer:

```java
class MyStack {
    private Queue<Integer> q = new ArrayDeque<>();

    public void push(int x) {
        q.offer(x);
        for (int i = 0; i < q.size() - 1; i++) q.offer(q.poll());  // rotate x to the front
    }
    public int pop()    { return q.poll(); }
    public int top()    { return q.peek(); }
    public boolean empty() { return q.isEmpty(); }
}
```

Only one queue is needed — the rotation does the work. Mention the pop-costly alternative
(move n−1 elements to a second queue on each pop) and that you chose push-costly because
reads are usually more frequent.

---

## 2.5 Pattern 1 — BFS ⭐⭐ (the reason queues exist in interviews)

**Trigger:** "shortest path", "minimum number of steps/moves/transformations", "fewest",
"level order", "nearest", "spread/infect/rot per minute", "degrees of separation".

**Core idea:** BFS explores in expanding rings. The first time you reach a node, you have
reached it by the **fewest edges**. On an *unweighted* graph, BFS = shortest path. (On a
weighted graph you need Dijkstra — Part 3.)

### The universal BFS template

```java
int bfs(int start, int target, List<List<Integer>> adj) {
    Queue<Integer> q = new ArrayDeque<>();
    boolean[] visited = new boolean[adj.size()];
    q.offer(start);
    visited[start] = true;          // ← mark when ENQUEUING
    int steps = 0;

    while (!q.isEmpty()) {
        int levelSize = q.size();   // ← snapshot BEFORE the inner loop
        for (int i = 0; i < levelSize; i++) {
            int node = q.poll();
            if (node == target) return steps;
            for (int nb : adj.get(node)) {
                if (!visited[nb]) {
                    visited[nb] = true;
                    q.offer(nb);
                }
            }
        }
        steps++;                    // one full ring processed
    }
    return -1;                      // unreachable
}
```

**Two lines carry all the difficulty:**

1. **`int levelSize = q.size();` before the inner loop.** The queue grows while you're
   draining it. Snapshot the size first, or you'll blend levels together and your `steps`
   count will be garbage. If you don't need distances at all, drop the level loop entirely.
2. **Mark `visited` when you ENQUEUE, not when you dequeue.** If you mark on dequeue, a node
   with three neighbours pointing at it gets enqueued three times — the queue can blow up to
   O(V²) and you may process duplicates. This is the single most common BFS bug.

**Complexity:** O(V + E) time, O(V) space.

### Grid BFS (the most common concrete form)

```java
private static final int[][] DIRS = {{1,0},{-1,0},{0,1},{0,-1}};

public int shortestPathInGrid(int[][] grid, int[] start, int[] end) {
    int rows = grid.length, cols = grid[0].length;
    boolean[][] visited = new boolean[rows][cols];
    Queue<int[]> q = new ArrayDeque<>();
    q.offer(start);
    visited[start[0]][start[1]] = true;
    int steps = 0;

    while (!q.isEmpty()) {
        int levelSize = q.size();
        for (int i = 0; i < levelSize; i++) {
            int[] cell = q.poll();
            int r = cell[0], c = cell[1];
            if (r == end[0] && c == end[1]) return steps;

            for (int[] d : DIRS) {
                int nr = r + d[0], nc = c + d[1];
                if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;  // bounds
                if (visited[nr][nc] || grid[nr][nc] == 1) continue;          // seen / wall
                visited[nr][nc] = true;
                q.offer(new int[]{nr, nc});
            }
        }
        steps++;
    }
    return -1;
}
```

**Memorise the `DIRS` array idiom.** It replaces four copy-pasted blocks with one loop and
eliminates the classic "copy-pasted `r+1` but forgot to change `c`" bug. For 8-directional
movement use all `{dr, dc}` pairs where not both are zero. For knight moves, the eight
`{±1,±2}` / `{±2,±1}` pairs.

**Encoding cells:** `int[]{r,c}` is clearest. If you need a `HashSet`, encode as
`r * cols + c` (a single int) rather than a string — much faster, and it's the kind of detail
that separates a "hire" from a "lean hire".

### BFS on implicit graphs

The graph often isn't given — you *generate* neighbours. Same template.

**Word Ladder** — neighbours = words one letter different:

```java
public int ladderLength(String begin, String end, List<String> wordList) {
    Set<String> dict = new HashSet<>(wordList);
    if (!dict.contains(end)) return 0;

    Queue<String> q = new ArrayDeque<>();
    Set<String> visited = new HashSet<>();
    q.offer(begin);
    visited.add(begin);
    int level = 1;

    while (!q.isEmpty()) {
        int size = q.size();
        for (int i = 0; i < size; i++) {
            String word = q.poll();
            if (word.equals(end)) return level;
            char[] arr = word.toCharArray();
            for (int j = 0; j < arr.length; j++) {
                char original = arr[j];
                for (char c = 'a'; c <= 'z'; c++) {
                    if (c == original) continue;
                    arr[j] = c;
                    String next = new String(arr);
                    if (dict.contains(next) && visited.add(next)) q.offer(next);
                }
                arr[j] = original;          // restore before moving to next position
            }
        }
        level++;
    }
    return 0;
}
```

**`visited.add(next)` returns `false` if already present** — one call does check-and-insert.
Small idiom, cleans up a lot of BFS code.

**Complexity:** O(N × L × 26) where N = words, L = word length.

**Follow-up they love:** *bidirectional BFS* — search from both ends simultaneously, always
expanding the smaller frontier, stop when they meet. Turns O(b^d) into O(b^(d/2)). Worth
naming even if you don't code it.

**Other implicit-graph BFS problems:** Open the Lock (neighbours = rotate one wheel), Jump
Game III, Minimum Genetic Mutation, Sliding Puzzle (state = board encoded as a string).

---

## 2.6 Pattern 2 — Multi-source BFS ⭐

**Trigger:** "all X spread simultaneously", "nearest X for every cell", "minutes until
everything is Y", "distance to the closest 0/gate/water".

**Core idea:** seed the queue with **all** sources before the loop starts. BFS then expands
all of them in lockstep, so every cell is reached by its *nearest* source. This is a huge
insight — it turns "run BFS from every source" (O(V·E)) into one BFS (O(V+E)).

### Rotting Oranges

```java
public int orangesRotting(int[][] grid) {
    int rows = grid.length, cols = grid[0].length;
    Queue<int[]> q = new ArrayDeque<>();
    int fresh = 0;

    for (int r = 0; r < rows; r++)
        for (int c = 0; c < cols; c++) {
            if (grid[r][c] == 2) q.offer(new int[]{r, c});   // seed ALL rotten
            else if (grid[r][c] == 1) fresh++;
        }

    if (fresh == 0) return 0;          // ← edge case: nothing to rot
    int minutes = 0;

    while (!q.isEmpty() && fresh > 0) {
        int size = q.size();
        for (int i = 0; i < size; i++) {
            int[] cell = q.poll();
            for (int[] d : DIRS) {
                int nr = cell[0] + d[0], nc = cell[1] + d[1];
                if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
                if (grid[nr][nc] != 1) continue;
                grid[nr][nc] = 2;      // mark rotten = mark visited
                fresh--;
                q.offer(new int[]{nr, nc});
            }
        }
        minutes++;
    }
    return fresh == 0 ? minutes : -1;  // some fresh unreachable
}
```

**Note `while (!q.isEmpty() && fresh > 0)`** — without the `fresh > 0` guard you process one
extra level after the last orange rots and return `minutes + 1`. Off-by-one central.

**Mutating the grid as the visited marker** saves O(n) space. Mention that you're modifying
the input and offer to copy it if that's unacceptable — interviewers care about side effects.

### 01 Matrix — distance to nearest 0

```java
public int[][] updateMatrix(int[][] mat) {
    int rows = mat.length, cols = mat[0].length;
    int[][] dist = new int[rows][cols];
    Queue<int[]> q = new ArrayDeque<>();

    for (int r = 0; r < rows; r++)
        for (int c = 0; c < cols; c++) {
            if (mat[r][c] == 0) q.offer(new int[]{r, c});
            else dist[r][c] = -1;           // -1 = unvisited
        }

    while (!q.isEmpty()) {
        int[] cell = q.poll();
        for (int[] d : DIRS) {
            int nr = cell[0] + d[0], nc = cell[1] + d[1];
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
            if (dist[nr][nc] != -1) continue;                 // already has a distance
            dist[nr][nc] = dist[cell[0]][cell[1]] + 1;
            q.offer(new int[]{nr, nc});
        }
    }
    return dist;
}
```

Here no level loop is needed — storing the distance *in the array* is cleaner than counting
levels. **Two ways to track distance: a level-size loop, or a `dist[]` array. Pick one; using
both is redundant.**

**Same family:** Walls and Gates, Shortest Bridge (DFS to find island 1, then multi-source BFS
outward), Map of Highest Peak, As Far from Land as Possible.

---

## 2.7 Pattern 3 — Monotonic deque ⭐ (sliding window max/min)

**Trigger:** "maximum/minimum of every window of size k", "longest subarray where max − min ≤
limit", "constrained subsequence sum".

**Core idea:** a deque of *indices* whose values are monotonically decreasing (for max).
- Remove from the **front** when the index falls outside the window.
- Remove from the **back** while those values are ≤ the incoming value — they can never be
  the max again, because the newcomer is bigger *and* stays in the window longer.
- The front is always the window maximum.

This is the monotonic stack idea plus an expiry rule at the other end. Each index enters and
leaves once → **O(n)**.

### Sliding Window Maximum

```java
public int[] maxSlidingWindow(int[] nums, int k) {
    int n = nums.length;
    int[] res = new int[n - k + 1];
    Deque<Integer> dq = new ArrayDeque<>();   // indices, values decreasing

    for (int i = 0; i < n; i++) {
        // 1. evict indices that have slid out of the window
        while (!dq.isEmpty() && dq.peekFirst() <= i - k) dq.pollFirst();

        // 2. evict smaller values from the back — they're dominated
        while (!dq.isEmpty() && nums[dq.peekLast()] <= nums[i]) dq.pollLast();

        dq.offerLast(i);

        // 3. once the window is full, the front is the answer
        if (i >= k - 1) res[i - k + 1] = nums[dq.peekFirst()];
    }
    return res;
}
```

**Why indices and not values:** step 1 needs to know *when* an element entered to know if it
has expired. Values alone can't tell you that.

**Why `<=` and not `<` in step 2:** with `<=` you drop equal elements, keeping the deque
smaller; correctness is unaffected because the newer equal element expires later. Either
works, `<=` is tidier.

**Alternative with a heap:** a max-heap of `{value, index}` with lazy deletion (pop the top
while its index is expired) gives O(n log k). The deque gives O(n). Say both; the deque is
the "right" answer.

### Longest subarray with `max − min ≤ limit`

Two monotonic deques — one for max, one for min — inside a sliding window:

```java
public int longestSubarray(int[] nums, int limit) {
    Deque<Integer> maxDq = new ArrayDeque<>();   // decreasing
    Deque<Integer> minDq = new ArrayDeque<>();   // increasing
    int left = 0, best = 0;

    for (int right = 0; right < nums.length; right++) {
        while (!maxDq.isEmpty() && nums[maxDq.peekLast()] < nums[right]) maxDq.pollLast();
        maxDq.offerLast(right);
        while (!minDq.isEmpty() && nums[minDq.peekLast()] > nums[right]) minDq.pollLast();
        minDq.offerLast(right);

        while (nums[maxDq.peekFirst()] - nums[minDq.peekFirst()] > limit) {
            if (maxDq.peekFirst() == left) maxDq.pollFirst();
            if (minDq.peekFirst() == left) minDq.pollFirst();
            left++;                              // shrink from the left
        }
        best = Math.max(best, right - left + 1);
    }
    return best;
}
```

**Pattern to internalise:** *"I need the max/min of a sliding window in O(1)"* → monotonic
deque. Combine it with the two-pointer window and you can solve a whole class of hard
problems.

---

## 2.8 Pattern 4 — Kahn's algorithm (topological sort via queue) ⭐

**Trigger:** "course schedule", "build order", "dependencies", "prerequisites", "can it be
finished", "detect a cycle in a directed graph", "alien dictionary".

**Core idea:** repeatedly remove nodes with in-degree 0 (nothing depends on them being done
first). The queue holds nodes that are *ready right now*.

```java
public int[] topoSort(int n, int[][] edges) {   // edges[i] = {from, to}
    List<List<Integer>> adj = new ArrayList<>();
    for (int i = 0; i < n; i++) adj.add(new ArrayList<>());
    int[] indegree = new int[n];

    for (int[] e : edges) {
        adj.get(e[0]).add(e[1]);
        indegree[e[1]]++;
    }

    Queue<Integer> q = new ArrayDeque<>();
    for (int i = 0; i < n; i++) if (indegree[i] == 0) q.offer(i);

    int[] order = new int[n];
    int idx = 0;
    while (!q.isEmpty()) {
        int node = q.poll();
        order[idx++] = node;
        for (int next : adj.get(node)) {
            if (--indegree[next] == 0) q.offer(next);   // decrement, enqueue when free
        }
    }

    return idx == n ? order : new int[0];   // idx < n ⇒ cycle ⇒ no valid order
}
```

**Explanation:**
- `indegree[v]` = how many prerequisites `v` still has. Zero means ready.
- Decrementing on each processed predecessor and enqueuing at zero means each node enters the
  queue exactly once. O(V + E).
- **`idx == n` is the cycle detector.** If some nodes never hit in-degree 0, they're in a
  cycle. This is why Kahn's is the standard answer for "Course Schedule" — one algorithm
  answers both "give me an order" and "is there a cycle".

**Level-by-level variant:** wrap the drain in a `levelSize` loop and you get the *minimum
number of semesters* to finish all courses (Course Schedule III / Parallel Courses). Same
code, one extra loop.

**Alphabetically smallest topological order:** swap `ArrayDeque` for a `PriorityQueue`.
That's the bridge between Part 2 and Part 3 — *the queue's ordering policy is a parameter*.

---

## 2.9 Pattern 5 — 0-1 BFS (deque as a cheap Dijkstra)

**Trigger:** shortest path where every edge costs **0 or 1** — "minimum obstacles to remove",
"minimum cost to make a path", "minimum number of sign flips".

**Core idea:** use a deque. A 0-cost edge → `addFirst` (same distance layer, process now). A
1-cost edge → `addLast` (next layer). The deque stays sorted by distance automatically, so
you get Dijkstra's result in **O(V + E)** instead of O(E log V).

```java
public int minimumObstacles(int[][] grid) {
    int rows = grid.length, cols = grid[0].length;
    int[][] dist = new int[rows][cols];
    for (int[] row : dist) Arrays.fill(row, Integer.MAX_VALUE);
    dist[0][0] = grid[0][0];

    Deque<int[]> dq = new ArrayDeque<>();
    dq.offerFirst(new int[]{0, 0});

    while (!dq.isEmpty()) {
        int[] cell = dq.pollFirst();
        int r = cell[0], c = cell[1];
        if (r == rows - 1 && c == cols - 1) return dist[r][c];

        for (int[] d : DIRS) {
            int nr = r + d[0], nc = c + d[1];
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
            int cost = grid[nr][nc];                   // 0 or 1
            if (dist[r][c] + cost < dist[nr][nc]) {
                dist[nr][nc] = dist[r][c] + cost;
                if (cost == 0) dq.offerFirst(new int[]{nr, nc});
                else           dq.offerLast(new int[]{nr, nc});
            }
        }
    }
    return dist[rows - 1][cols - 1];
}
```

**Say this in the interview:** *"Since all edge weights are 0 or 1, I can replace Dijkstra's
priority queue with a deque — 0-weight edges go to the front, 1-weight to the back. That
keeps the deque monotonic in distance and drops the log factor."* That sentence alone reads
as senior.

---

## 2.10 Queue recognition cheat sheet

| You see… | Reach for |
|---|---|
| "minimum steps/moves", unweighted | BFS with level counting |
| "level order", "by depth" | BFS with `levelSize` snapshot |
| "all sources spread at once", "nearest X for every cell" | multi-source BFS |
| "max/min of every window of size k" | monotonic deque |
| "longest window where max − min ≤ limit" | two monotonic deques + two pointers |
| "prerequisites", "build order", "cycle in DAG" | Kahn's (queue + in-degree) |
| edge weights are only 0 and 1 | 0-1 BFS (deque) |
| arbitrary positive edge weights | Dijkstra (heap — Part 3) |
| "process in order received", producer/consumer | plain queue / blocking queue |

**Debugging checklist for any BFS:**
1. Did I snapshot `q.size()` before the level loop?
2. Am I marking `visited` at **enqueue** time?
3. Did I handle the start-equals-target / empty-input case?
4. Bounds check before array access, every time?
5. If I'm counting steps, does `steps++` sit **outside** the inner loop?
6. Is the "unreachable" return value correct (−1 vs 0 vs the partial answer)?

---

# Part 3 — Heaps / Priority Queues

## 3.1 What a heap actually is

A **binary heap** is a **complete binary tree** that satisfies the **heap property**:

- **Min-heap:** every node ≤ its children. The minimum is at the root.
- **Max-heap:** every node ≥ its children. The maximum is at the root.

Two words, both load-bearing:

- **Complete** — every level is full except possibly the last, which fills left to right.
  This is what lets you store the tree in a flat array with no pointers and no gaps, and it's
  what bounds the height at ⌊log₂ n⌋.
- **Heap property is local** — it constrains only parent↔child. Siblings are unordered;
  cousins are unordered. **A heap is *not* sorted.** This is the single most misunderstood
  fact about heaps. `[1, 5, 2, 8, 6, 3]` is a valid min-heap and it is obviously not sorted.

That weakness is exactly the strength: maintaining *partial* order costs O(log n) per update,
whereas maintaining full order (a sorted array) costs O(n) per insert.

**Priority Queue** is the *abstract type* (get me the highest-priority element). **Heap** is
the usual *implementation*. Interviewers use the words interchangeably; you shouldn't.

### Complexity

| Operation | Cost | Note |
|---|---|---|
| `peek` (find min/max) | **O(1)** | it's just index 0 |
| `offer` (insert) | **O(log n)** | sift up |
| `poll` (extract min/max) | **O(log n)** | swap, shrink, sift down |
| build from n elements | **O(n)** | ⭐ not O(n log n) — see 3.3 |
| search for arbitrary element | **O(n)** | no ordering to exploit |
| delete arbitrary element | **O(n)** | O(n) to find + O(log n) to fix |
| heapsort | O(n log n) | in-place, not stable |

**"Find min is O(1) but find max is O(n) in a min-heap"** — say this when asked why you'd
need two heaps for a median.

## 3.2 The array trick & the two sift operations

Store the complete tree level by level in an array. For index `i` (0-based):

```
parent(i)     = (i - 1) / 2
leftChild(i)  = 2 * i + 1
rightChild(i) = 2 * i + 2
```

```
        1(0)
       /    \
    5(1)     2(2)          array: [1, 5, 2, 8, 6, 3]
    /  \     /
  8(3) 6(4) 3(5)
```

No node objects, no pointers, perfect cache locality. This is why heaps are fast in practice.

**The two repair operations — everything else is built from these:**

### siftUp (bubble up) — used after inserting at the end

The new element may be smaller than its parent. Swap upward until the heap property holds.

```java
private void siftUp(int i) {
    while (i > 0) {
        int parent = (i - 1) / 2;
        if (heap[i] >= heap[parent]) break;   // min-heap: stop when parent is smaller
        swap(i, parent);
        i = parent;
    }
}
```

At most one swap per level → **O(log n)**.

### siftDown (bubble down) — used after removing the root

Replace the root with the last element, then push it down past its *smaller* child.

```java
private void siftDown(int i) {
    while (true) {
        int left = 2 * i + 1, right = 2 * i + 2, smallest = i;
        if (left  < size && heap[left]  < heap[smallest]) smallest = left;
        if (right < size && heap[right] < heap[smallest]) smallest = right;
        if (smallest == i) break;            // heap property restored
        swap(i, smallest);
        i = smallest;
    }
}
```

**Why the *smaller* child?** If you swapped with the larger child, the new parent would be
bigger than its remaining sibling and you'd break the property immediately. Picking the
smaller child guarantees both children end up ≥ the new parent. This is the question
interviewers ask to check you understand rather than memorised.

## 3.3 Building a heap from scratch

**Approach.** Array storage + `siftUp` on insert + `siftDown` on extract. Then add `heapify`
for O(n) bulk construction.

```java
public class MinHeap {
    private int[] heap;
    private int size;

    public MinHeap() { this(16); }

    public MinHeap(int capacity) { heap = new int[Math.max(1, capacity)]; }

    /** O(n) bulk build — NOT n inserts. */
    public MinHeap(int[] input) {
        heap = Arrays.copyOf(input, Math.max(1, input.length));
        size = input.length;
        for (int i = size / 2 - 1; i >= 0; i--) siftDown(i);   // ← the O(n) loop
    }

    public int peek() {
        if (size == 0) throw new NoSuchElementException("heap is empty");
        return heap[0];
    }

    public void offer(int val) {
        if (size == heap.length) heap = Arrays.copyOf(heap, size * 2);
        heap[size] = val;
        siftUp(size);
        size++;
    }

    public int poll() {
        if (size == 0) throw new NoSuchElementException("heap is empty");
        int min = heap[0];
        heap[0] = heap[--size];    // move last element to the root
        siftDown(0);               // restore the property
        return min;
    }

    public int size()        { return size; }
    public boolean isEmpty() { return size == 0; }

    private void siftUp(int i) {
        while (i > 0) {
            int parent = (i - 1) / 2;
            if (heap[i] >= heap[parent]) break;
            swap(i, parent);
            i = parent;
        }
    }

    private void siftDown(int i) {
        while (true) {
            int left = 2 * i + 1, right = 2 * i + 2, smallest = i;
            if (left  < size && heap[left]  < heap[smallest]) smallest = left;
            if (right < size && heap[right] < heap[smallest]) smallest = right;
            if (smallest == i) break;
            swap(i, smallest);
            i = smallest;
        }
    }

    private void swap(int a, int b) { int t = heap[a]; heap[a] = heap[b]; heap[b] = t; }
}
```

### Why `heapify` is O(n) and not O(n log n) ⭐

This is a favourite follow-up. Here's the argument in interview-length form:

- Start at index `size/2 - 1` — the last non-leaf node. **Leaves are already valid heaps of
  size 1**, so half the array needs zero work. That's the first hint the bound is better
  than it looks.
- `siftDown(i)` costs at most the **height of the subtree at i**, not the height of the whole
  tree. Nodes near the bottom (most of them) have tiny subtrees.
- At height `h` there are at most `n / 2^(h+1)` nodes, each costing O(h). Total work:

```
  Σ (h = 0 to log n)  h · n/2^(h+1)   =   (n/2) · Σ h/2^h   ≤   (n/2) · 2   =   O(n)
```

because `Σ h/2^h` converges to 2.

**One-sentence version:** *"Most nodes are near the leaves where sifting down is cheap; only
the rare nodes near the root cost log n. The sum converges to a constant times n."*

Contrast: building by n successive `offer` calls uses `siftUp`, where **most nodes are near
the leaves and sifting up is expensive** — the geometry is inverted, giving O(n log n).

### Heapsort (worth knowing, rarely required)

```java
public static void heapSort(int[] a) {
    int n = a.length;
    for (int i = n / 2 - 1; i >= 0; i--) siftDownMax(a, i, n);    // build a MAX-heap, O(n)
    for (int end = n - 1; end > 0; end--) {
        int t = a[0]; a[0] = a[end]; a[end] = t;   // largest goes to its final position
        siftDownMax(a, 0, end);                    // shrink the heap by one
    }
}

private static void siftDownMax(int[] a, int i, int n) {
    while (true) {
        int l = 2*i + 1, r = 2*i + 2, largest = i;
        if (l < n && a[l] > a[largest]) largest = l;
        if (r < n && a[r] > a[largest]) largest = r;
        if (largest == i) break;
        int t = a[i]; a[i] = a[largest]; a[largest] = t;
        i = largest;
    }
}
```

**Use a max-heap to sort ascending** — the extracted maximum is parked at the end of the
array, which shrinks the heap and grows the sorted suffix in place.

**Properties:** O(n log n) worst case *guaranteed* (unlike quicksort's O(n²) worst case),
O(1) extra space, but **not stable** and poorer cache behaviour than quicksort/mergesort in
practice. That's why library sorts use Timsort/introsort, not heapsort.

## 3.4 Java `PriorityQueue` — API and five traps

```java
// Min-heap (DEFAULT in Java — remember this, it trips people constantly)
PriorityQueue<Integer> minHeap = new PriorityQueue<>();

// Max-heap
PriorityQueue<Integer> maxHeap = new PriorityQueue<>(Comparator.reverseOrder());
PriorityQueue<Integer> maxHeap2 = new PriorityQueue<>((a, b) -> b - a);    // ⚠ overflow risk

// Custom object by field
PriorityQueue<int[]> byCost = new PriorityQueue<>((a, b) -> Integer.compare(a[1], b[1]));

// Multi-key: by frequency ascending, tie-break alphabetically
PriorityQueue<String> pq = new PriorityQueue<>(
    Comparator.<String>comparingInt(freq::get).thenComparing(Comparator.naturalOrder()));

// O(n) bulk build from a collection
PriorityQueue<Integer> h = new PriorityQueue<>(listOfNumbers);

minHeap.offer(5);      // O(log n)
minHeap.peek();        // O(1), null if empty
minHeap.poll();        // O(log n), null if empty
minHeap.size();
minHeap.remove(x);     // O(n) — scans to find x, then sifts
```

### The five traps

**1. `PriorityQueue` is a MIN-heap by default.** Java's default is the *opposite* of what
C++ `priority_queue` does. If your "top K largest" answer is wrong, check this first.

**2. `(a, b) -> b - a` overflows.** With `a = -2_000_000_000` and `b = 2_000_000_000` the
subtraction wraps and your comparator returns the wrong sign, silently corrupting the heap.
**Always use `Integer.compare(b, a)`** or `Comparator.reverseOrder()`. This is a real
interview red flag.

**3. Iteration order is unspecified.** `for (int x : pq)` and `pq.toString()` give you the
*array* order, not sorted order. To drain in order you must `poll()` repeatedly. Printing a
PQ to debug and concluding it's broken is a rite of passage.

**4. `remove(Object)` is O(n), and there's no `decreaseKey`.** Java's PQ has no handle-based
update. Two standard workarounds:
   - **Lazy deletion** — push the updated entry as a *new* element and skip stale entries when
     polling (check against a `dist[]`/`visited[]` array). This is what you do in Dijkstra.
   - **Index map** — maintain your own `HashMap<element, index>` inside a custom heap so you
     can sift a specific position. Mention this if asked to make Dijkstra O(E log V) strictly.

**5. Mutating an object after inserting it breaks the heap.** The heap ordered it by the old
value; it has no idea the field changed. Remove, mutate, re-insert.

**Bonus API note:** `PriorityQueue` is **unbounded** and **not thread-safe**. The concurrent
version is `PriorityBlockingQueue`.

### `PriorityQueue` vs `TreeMap`/`TreeSet`

| | `PriorityQueue` | `TreeMap`/`TreeSet` |
|---|---|---|
| min/max | O(1) peek min only | O(log n) `firstKey()` **and** `lastKey()` |
| insert / delete-min | O(log n) | O(log n) |
| delete arbitrary | O(n) | **O(log n)** |
| find/contains | O(n) | **O(log n)** |
| range queries (`floor`, `ceiling`) | ✗ | **✓** |
| duplicates | ✓ | `TreeSet` ✗ (use `TreeMap<K, count>`) |
| constant factor | **lower** | higher |

**Rule:** if you only ever remove the extreme, use a heap. The moment you need to remove
*arbitrary* elements or query ranges, switch to `TreeMap`. This comes up in sliding-window
median and calendar-booking problems.

---

## 3.5 Pattern 1 — Top-K ⭐⭐

**Trigger:** "k largest", "k smallest", "k most frequent", "k closest", "top k".

**The counter-intuitive rule — internalise it:**

> To find the **K largest**, use a **MIN-heap of size K**.
> To find the **K smallest**, use a **MAX-heap of size K**.

**Why:** you keep a bag of the best K seen so far. To decide whether a newcomer belongs, you
must compare it against the **worst** member of the bag and evict that one. In a bag of the K
largest, the worst is the smallest → a min-heap puts it at the root, O(1) to inspect, O(log k)
to evict.

**Complexity: O(n log k) time, O(k) space** — better than sorting's O(n log n) when k ≪ n, and
critically it works on a **stream** where n is unbounded.

### Kth Largest Element in an Array

```java
public int findKthLargest(int[] nums, int k) {
    PriorityQueue<Integer> minHeap = new PriorityQueue<>();   // size capped at k
    for (int num : nums) {
        minHeap.offer(num);
        if (minHeap.size() > k) minHeap.poll();   // evict the smallest
    }
    return minHeap.peek();                        // the kth largest
}
```

**Interview flow for this exact question (it is asked constantly):**
1. "Sorting gives O(n log n) — correct but not optimal."
2. "A min-heap of size k gives O(n log k), and works on a stream."
3. "**Quickselect** gives O(n) average, O(n²) worst — best if all data is in memory and I can
   mutate the array." Then offer to code it.

```java
// Quickselect — O(n) average
public int findKthLargestQuickselect(int[] nums, int k) {
    int target = nums.length - k;        // kth largest == index (n-k) when sorted ascending
    int lo = 0, hi = nums.length - 1;
    Random rand = new Random();
    while (lo < hi) {
        int p = lo + rand.nextInt(hi - lo + 1);   // ← randomise to dodge the O(n²) worst case
        swap(nums, p, hi);
        int pivotIdx = partition(nums, lo, hi);
        if (pivotIdx == target) return nums[pivotIdx];
        if (pivotIdx < target) lo = pivotIdx + 1;
        else hi = pivotIdx - 1;
    }
    return nums[lo];
}

private int partition(int[] a, int lo, int hi) {
    int pivot = a[hi], store = lo;
    for (int i = lo; i < hi; i++)
        if (a[i] < pivot) swap(a, i, store++);
    swap(a, store, hi);
    return store;
}

private void swap(int[] a, int i, int j) { int t = a[i]; a[i] = a[j]; a[j] = t; }
```

**The randomised pivot is the whole point.** Without it, a sorted input gives O(n²). Say
"random pivot, or median-of-medians for a deterministic O(n)" and you've covered it.

### Top K Frequent Elements

```java
public int[] topKFrequent(int[] nums, int k) {
    Map<Integer, Integer> freq = new HashMap<>();
    for (int n : nums) freq.merge(n, 1, Integer::sum);

    PriorityQueue<Map.Entry<Integer, Integer>> minHeap =
        new PriorityQueue<>(Map.Entry.comparingByValue());   // min by frequency

    for (Map.Entry<Integer, Integer> e : freq.entrySet()) {
        minHeap.offer(e);
        if (minHeap.size() > k) minHeap.poll();
    }

    int[] res = new int[k];
    for (int i = k - 1; i >= 0; i--) res[i] = minHeap.poll().getKey();  // fill backwards for desc
    return res;
}
```

O(n log k). **The O(n) follow-up: bucket sort.** Frequencies are bounded by `n`, so make
`n+1` buckets indexed by frequency and scan from the top:

```java
public int[] topKFrequentBuckets(int[] nums, int k) {
    Map<Integer, Integer> freq = new HashMap<>();
    for (int n : nums) freq.merge(n, 1, Integer::sum);

    List<Integer>[] buckets = new List[nums.length + 1];
    for (Map.Entry<Integer, Integer> e : freq.entrySet()) {
        int f = e.getValue();
        if (buckets[f] == null) buckets[f] = new ArrayList<>();
        buckets[f].add(e.getKey());
    }

    int[] res = new int[k];
    int idx = 0;
    for (int f = buckets.length - 1; f >= 1 && idx < k; f--) {
        if (buckets[f] == null) continue;
        for (int val : buckets[f]) {
            res[idx++] = val;
            if (idx == k) break;
        }
    }
    return res;
}
```

**"When the range of the key is bounded, bucket it instead of sorting it"** is a transferable
idea — it's the same reasoning behind counting sort and radix sort.

### K Closest Points to Origin

```java
public int[][] kClosest(int[][] points, int k) {
    // MAX-heap by squared distance, capped at k → we evict the farthest
    PriorityQueue<int[]> maxHeap = new PriorityQueue<>(
        (a, b) -> Long.compare(dist(b), dist(a)));

    for (int[] p : points) {
        maxHeap.offer(p);
        if (maxHeap.size() > k) maxHeap.poll();
    }
    return maxHeap.toArray(new int[0][]);
}

private long dist(int[] p) { return (long) p[0] * p[0] + (long) p[1] * p[1]; }
```

**Two details worth points:** skip `Math.sqrt` (it's monotonic, so squared distance sorts
identically and avoids floating point), and cast to `long` before squaring to avoid `int`
overflow when coordinates are large.

---

## 3.6 Pattern 2 — K-way merge ⭐

**Trigger:** "merge k sorted lists/arrays", "smallest range covering all lists", "kth smallest
in a sorted matrix", "find k pairs with smallest sums".

**Core idea:** hold **one candidate from each list** in a heap of size k. Poll the global
minimum, then push that list's *next* element. The heap always contains the frontier.

### Merge k Sorted Lists

```java
public ListNode mergeKLists(ListNode[] lists) {
    PriorityQueue<ListNode> heap =
        new PriorityQueue<>((a, b) -> Integer.compare(a.val, b.val));

    for (ListNode node : lists)
        if (node != null) heap.offer(node);      // ← seed with the head of each list

    ListNode dummy = new ListNode(0), tail = dummy;
    while (!heap.isEmpty()) {
        ListNode min = heap.poll();
        tail.next = min;
        tail = min;
        if (min.next != null) heap.offer(min.next);   // ← refill from the same list
    }
    tail.next = null;
    return dummy.next;
}
```

**Complexity:** O(N log k) where N = total nodes, k = number of lists. The heap never exceeds
k elements, which is why the log factor is `log k` and not `log N`.

**Alternative worth naming:** divide-and-conquer pairwise merging is also O(N log k) with
O(1) extra space beyond recursion. Heap is easier to write; D&C is better if k is huge.

**The dummy node** avoids special-casing the first append. Use it in every linked-list
building problem.

### Kth Smallest Element in a Sorted Matrix

```java
public int kthSmallest(int[][] matrix, int k) {
    int n = matrix.length;
    // {value, row, col}, min-heap by value
    PriorityQueue<int[]> heap = new PriorityQueue<>((a, b) -> Integer.compare(a[0], b[0]));
    for (int r = 0; r < Math.min(n, k); r++) heap.offer(new int[]{matrix[r][0], r, 0});

    int result = 0;
    for (int i = 0; i < k; i++) {
        int[] cur = heap.poll();
        result = cur[0];
        int r = cur[1], c = cur[2];
        if (c + 1 < n) heap.offer(new int[]{matrix[r][c + 1], r, c + 1});   // next in this row
    }
    return result;
}
```

O(k log k). **The better follow-up answer is binary search on the value range** — O(n log(max−min)),
counting how many elements are ≤ mid with a staircase walk from the bottom-left. Know that
this exists; "binary search on the answer" is a top-tier pattern.

### Smallest Range Covering Elements from K Lists

Same frontier idea; track the current max while polling the min:

```java
public int[] smallestRange(List<List<Integer>> nums) {
    PriorityQueue<int[]> heap = new PriorityQueue<>((a, b) -> Integer.compare(a[0], b[0]));
    int max = Integer.MIN_VALUE;
    for (int i = 0; i < nums.size(); i++) {
        int v = nums.get(i).get(0);
        heap.offer(new int[]{v, i, 0});
        max = Math.max(max, v);
    }

    int[] best = {0, Integer.MAX_VALUE};
    while (heap.size() == nums.size()) {          // must still cover every list
        int[] cur = heap.poll();
        int min = cur[0], list = cur[1], idx = cur[2];
        if (max - min < best[1] - best[0]) best = new int[]{min, max};
        if (idx + 1 < nums.get(list).size()) {
            int next = nums.get(list).get(idx + 1);
            heap.offer(new int[]{next, list, idx + 1});
            max = Math.max(max, next);
        }
    }
    return best;
}
```

**The loop condition `heap.size() == nums.size()`** encodes "the window still touches every
list". The moment one list is exhausted, no valid range remains.

---

## 3.7 Pattern 3 — Two heaps ⭐

**Trigger:** "median of a stream", "balance two halves", "schedule with a budget on both ends".

**Core idea:** split the data into a **lower half (max-heap)** and an **upper half
(min-heap)**. The two roots sit back-to-back at the boundary, so the median is O(1).

### Find Median from Data Stream

```java
class MedianFinder {
    // lower half, largest at top
    private final PriorityQueue<Integer> low  = new PriorityQueue<>(Comparator.reverseOrder());
    // upper half, smallest at top
    private final PriorityQueue<Integer> high = new PriorityQueue<>();

    public void addNum(int num) {
        low.offer(num);                 // 1. always add to low
        high.offer(low.poll());         // 2. move low's max to high (keeps order correct)
        if (high.size() > low.size())   // 3. rebalance so low.size() >= high.size()
            low.offer(high.poll());
    }

    public double findMedian() {
        if (low.size() > high.size()) return low.peek();
        return (low.peek() + high.peek()) / 2.0;
    }
}
```

**Why the three-step dance:** adding straight to whichever heap is smaller would break
ordering (a huge number could land in `low`). Routing *through* `low` and then handing its
maximum to `high` guarantees every element in `low` ≤ every element in `high`. Step 3 keeps
the sizes within 1 so the median is always at the roots.

O(log n) per insert, **O(1)** per median query.

**Invariants to state out loud:**
1. `max(low) ≤ min(high)`
2. `low.size() == high.size()` or `low.size() == high.size() + 1`

**Follow-up: median of a sliding window.** The heaps now need arbitrary deletion, which is
O(n) in a `PriorityQueue`. Two answers: **lazy deletion** (a `HashMap` of pending removals,
purged whenever an expired element surfaces at a root) or **two `TreeMap`s** (O(log n) exact
removal). Naming lazy deletion here is a strong senior signal.

**Same pattern:** IPO (max-heap of affordable profits + min-heap of capital requirements),
Sliding Window Median, Finding MK Average.

---

## 3.8 Pattern 4 — Scheduling / intervals ⭐

**Trigger:** "meeting rooms", "minimum number of platforms/servers/CPUs", "maximum
overlapping", "task scheduler", "car pooling".

**Core idea:** sort by **start** time; use a **min-heap of end times** to track what's
currently busy. Before starting a new task, free everything that has already ended.

### Meeting Rooms II — minimum rooms required

```java
public int minMeetingRooms(int[][] intervals) {
    if (intervals.length == 0) return 0;
    Arrays.sort(intervals, (a, b) -> Integer.compare(a[0], b[0]));   // by start

    PriorityQueue<Integer> endTimes = new PriorityQueue<>();          // min-heap of ends
    for (int[] meeting : intervals) {
        if (!endTimes.isEmpty() && endTimes.peek() <= meeting[0])
            endTimes.poll();                  // a room freed up before this meeting starts
        endTimes.offer(meeting[1]);           // occupy a room until this meeting's end
    }
    return endTimes.size();                   // rooms concurrently in use at the peak
}
```

O(n log n). **The heap size at the end equals the peak concurrency** — that's the insight,
and it's worth stating explicitly because it generalises to CPUs, platforms, connections.

**`<=` vs `<`:** with `endTimes.peek() <= meeting[0]`, a meeting ending at 10 and one starting
at 10 share a room. Ask the interviewer whether intervals are half-open `[start, end)`. Asking
this scores points; guessing loses them.

**Alternative — the sweep line / chronological ordering.** Often cleaner, no heap:

```java
public int minMeetingRoomsSweep(int[][] intervals) {
    int n = intervals.length;
    int[] starts = new int[n], ends = new int[n];
    for (int i = 0; i < n; i++) { starts[i] = intervals[i][0]; ends[i] = intervals[i][1]; }
    Arrays.sort(starts); Arrays.sort(ends);

    int rooms = 0, best = 0, e = 0;
    for (int s = 0; s < n; s++) {
        while (e < n && ends[e] <= starts[s]) { rooms--; e++; }   // free finished meetings
        rooms++;
        best = Math.max(best, rooms);
    }
    return best;
}
```

Present both; say the sweep line is the same O(n log n) but with a lower constant factor and
that it generalises to "how many concurrent at each moment", not just the peak.

### Task Scheduler (with cooldown) — heap + cooldown queue

```java
public int leastInterval(char[] tasks, int n) {
    int[] counts = new int[26];
    for (char t : tasks) counts[t - 'A']++;

    PriorityQueue<Integer> heap = new PriorityQueue<>(Comparator.reverseOrder());
    for (int c : counts) if (c > 0) heap.offer(c);

    Queue<int[]> cooldown = new ArrayDeque<>();   // {remainingCount, timeAvailableAgain}
    int time = 0;

    while (!heap.isEmpty() || !cooldown.isEmpty()) {
        time++;
        if (!heap.isEmpty()) {
            int remaining = heap.poll() - 1;
            if (remaining > 0) cooldown.offer(new int[]{remaining, time + n});
        }
        // release anything whose cooldown expired
        if (!cooldown.isEmpty() && cooldown.peek()[1] == time)
            heap.offer(cooldown.poll()[0]);
    }
    return time;
}
```

**A heap and a queue working together** — the heap picks the most urgent available task, the
queue holds tasks waiting out their cooldown in FIFO order (which is correct because they
were queued in time order). This "ready set + waiting set" shape is how real schedulers work,
which makes it a nice thing to reference in system design too.

**The O(1) math solution also exists:** `max((maxFreq-1)*(n+1) + countOfMaxFreq, tasks.length)`.
Give the simulation first — it's easier to justify — then mention the closed form.

---

## 3.9 Pattern 5 — Greedy with a heap

**Trigger:** "minimum cost to combine", "maximum score after k operations", "reorganise so no
two adjacent are equal".

**Core idea:** greedy needs "the current best choice" at every step, and the set changes as
you go. A heap gives you that in O(log n).

### Minimum Cost to Connect Sticks / Ropes

```java
public int connectSticks(int[] sticks) {
    PriorityQueue<Integer> heap = new PriorityQueue<>(Arrays.stream(sticks).boxed().toList());
    int cost = 0;
    while (heap.size() > 1) {
        int combined = heap.poll() + heap.poll();   // always join the two cheapest
        cost += combined;
        heap.offer(combined);
    }
    return cost;
}
```

**Why greedy is correct here:** every stick's length is counted once per merge it participates
in, so short sticks should be merged early (they'll be re-counted more times) and long ones
late. This is exactly **Huffman coding** — say that name, it's the same algorithm.

### Reorganize String (no two adjacent identical)

```java
public String reorganizeString(String s) {
    int[] counts = new int[26];
    for (char c : s.toCharArray()) counts[c - 'A']++;

    PriorityQueue<int[]> heap = new PriorityQueue<>((a, b) -> Integer.compare(b[1], a[1]));
    for (int i = 0; i < 26; i++)
        if (counts[i] > 0) {
            if (counts[i] > (s.length() + 1) / 2) return "";   // impossible
            heap.offer(new int[]{i, counts[i]});
        }

    StringBuilder sb = new StringBuilder();
    int[] prev = null;                          // held back for exactly one round
    while (!heap.isEmpty()) {
        int[] cur = heap.poll();
        sb.append((char) ('A' + cur[0]));
        cur[1]--;
        if (prev != null && prev[1] > 0) heap.offer(prev);   // now safe to reuse
        prev = cur;
    }
    return sb.length() == s.length() ? sb.toString() : "";
}
```

**The "hold back the previous character for one round" trick** is the whole problem. Since the
most frequent available character is always chosen, and the previous one is barred for exactly
one step, no two adjacent characters can match.

**The feasibility check `maxCount > (n+1)/2 → impossible`** is a nice thing to derive out loud:
the most frequent character needs a gap after each occurrence, so it can fill at most ⌈n/2⌉
positions.

**Same family:** Task Scheduler, Rearrange String k Distance Apart, Distant Barcodes.

---

## 3.10 Pattern 6 — Heaps in graph algorithms

### Dijkstra's shortest path

**Trigger:** shortest path with **arbitrary non-negative** edge weights. (Unweighted → BFS.
Weights of 0/1 → 0-1 BFS. Negative weights → Bellman-Ford.)

```java
public int[] dijkstra(int n, List<List<int[]>> adj, int src) {   // adj: {neighbour, weight}
    int[] dist = new int[n];
    Arrays.fill(dist, Integer.MAX_VALUE);
    dist[src] = 0;

    // {distance, node}, min-heap by distance
    PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> Integer.compare(a[0], b[0]));
    pq.offer(new int[]{0, src});

    while (!pq.isEmpty()) {
        int[] top = pq.poll();
        int d = top[0], u = top[1];
        if (d > dist[u]) continue;            // ← LAZY DELETION: stale entry, skip it

        for (int[] edge : adj.get(u)) {
            int v = edge[0], w = edge[1];
            if (dist[u] + w < dist[v]) {
                dist[v] = dist[u] + w;
                pq.offer(new int[]{dist[v], v});   // push a NEW entry instead of updating
            }
        }
    }
    return dist;
}
```

**The line that matters: `if (d > dist[u]) continue;`.** Java's `PriorityQueue` has no
`decreaseKey`, so instead of updating an existing entry we push a duplicate with the better
distance. The stale copies are still in the heap; this guard discards them when they surface.
Without it the algorithm is still correct but wastes time reprocessing nodes.

**Complexity:** O(E log E) ≈ O(E log V) with lazy deletion (the heap can hold up to E entries).
A true indexed heap with `decreaseKey` gives O(E log V) with at most V entries; a Fibonacci
heap gives O(E + V log V) in theory but loses in practice to the constant factors.

**Why Dijkstra needs non-negative weights:** it finalises a node the moment it's popped,
assuming no cheaper path can appear later. A negative edge could make one appear.

### Prim's minimum spanning tree

Same shape — heap of candidate edges crossing the cut:

```java
public int minimumSpanningTree(int n, List<List<int[]>> adj) {
    boolean[] inMST = new boolean[n];
    PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> Integer.compare(a[0], b[0]));
    pq.offer(new int[]{0, 0});      // {weight, node}
    int total = 0, count = 0;

    while (!pq.isEmpty() && count < n) {
        int[] top = pq.poll();
        int w = top[0], u = top[1];
        if (inMST[u]) continue;     // same lazy-deletion guard
        inMST[u] = true;
        total += w;
        count++;
        for (int[] e : adj.get(u))
            if (!inMST[e[0]]) pq.offer(new int[]{e[1], e[0]});
    }
    return count == n ? total : -1;   // -1 = graph is disconnected
}
```

**Dijkstra vs Prim in one line:** Dijkstra's key is *distance from the source* (`dist[u] + w`);
Prim's key is *the edge weight alone* (`w`). Structurally identical otherwise. Being able to
say that is a genuinely good signal.

---

## 3.11 Heap vs Quickselect vs TreeMap vs sorting

| Need | Best tool | Cost |
|---|---|---|
| Full sorted order | sort | O(n log n) |
| Kth largest, data in memory, mutable | Quickselect | O(n) avg |
| Kth largest, streaming / immutable | min-heap of size k | O(n log k) |
| Repeatedly extract min, set changes | heap | O(log n) per op |
| Extract min **and** max | two heaps, or `TreeMap` | O(log n) |
| Remove arbitrary elements | `TreeMap` / indexed heap | O(log n) |
| Keys in a small bounded range | bucket / counting sort | O(n) |
| Top k by frequency, freq ≤ n | bucket sort | O(n) |

**How to answer "why a heap?" in an interview:** *"I need the extreme element repeatedly from a
set that keeps changing, and I don't need full sorted order — so I pay O(log n) per update
instead of O(n log n) up front. And it works on a stream."*

## 3.12 Heap recognition cheat sheet

| You see… | Reach for |
|---|---|
| "top k", "k largest/smallest/closest/most frequent" | heap of size k (**inverted** type) |
| "kth ..." with a stream or unbounded input | heap of size k |
| "kth ..." with a fixed in-memory array | Quickselect (mention heap too) |
| "merge k sorted ..." | k-way merge heap |
| "median of a stream" | two heaps |
| "minimum rooms/platforms/CPUs" | sort by start + min-heap of ends |
| "combine two cheapest repeatedly" | min-heap (Huffman) |
| "no two adjacent equal", "cooldown" | max-heap by count + cooldown queue |
| shortest path, weighted, non-negative | Dijkstra (heap) |
| minimum spanning tree | Prim (heap) or Kruskal (sort + DSU) |
| "schedule to maximise/minimise X, choices change" | greedy + heap |

**Debugging checklist for any heap solution:**
1. Min-heap or max-heap? (Java defaults to **min**.)
2. If I'm capping at size k, is my heap the **inverted** type?
3. Is my comparator overflow-safe? (`Integer.compare`, never `a - b`.)
4. Did I check `isEmpty()`/null before `peek()`/`poll()`?
5. Am I mutating objects that are already inside the heap?
6. If entries can go stale, do I have a lazy-deletion guard?
7. Did I build from a collection (O(n)) rather than n inserts (O(n log n)) where possible?

---

# Part 4 — Solving Any Question

## 4.1 The decision procedure

Run this in order when a problem lands in front of you.

**Step 1 — What am I repeatedly asking for?**

| Question being asked repeatedly | Structure |
|---|---|
| "the most recent unresolved thing" | **stack** |
| "the oldest pending thing" | **queue** |
| "the best/extreme thing" | **heap** |
| "the extreme thing *within a window*" | **monotonic deque** |
| "the extreme thing, plus arbitrary removal" | **TreeMap** |

**Step 2 — Check the trigger vocabulary.**

- *nested, balanced, valid, matching, undo, backtrack* → stack
- *next/previous greater/smaller, span, histogram, warmer* → monotonic stack
- *shortest, minimum steps, level, nearest, spread* → BFS queue
- *prerequisite, dependency, build order* → Kahn's queue
- *top k, kth, median, merge k, minimum rooms, cooldown* → heap

**Step 3 — Sanity-check the target complexity against the constraints.**

| n | Expected complexity |
|---|---|
| ≤ 10 | O(n!), O(2ⁿ) — backtracking |
| ≤ 20 | O(2ⁿ) — bitmask DP |
| ≤ 500 | O(n³) |
| ≤ 5,000 | O(n²) |
| ≤ 10⁶ | O(n log n) — sort or heap |
| ≤ 10⁷+ | O(n) or O(log n) — monotonic stack/deque, two pointers, math |

If `n = 10⁵` and you're heading toward O(n²), a monotonic stack or a heap is probably the
intended escape.

**Step 4 — State the brute force, then improve it.** Always. Interviewers want to see the
baseline and the reasoning that beats it, not a memorised optimum with no derivation.

**Step 5 — Write the invariant as a comment before you write the loop.**

```java
// stack holds indices whose next-greater element is not yet known, values decreasing
// low holds the smaller half (max at top); high holds the larger half (min at top)
// q holds all cells at the current distance from the source
```

If you cannot write that sentence, you do not yet understand the solution, and the code will
come out wrong. If you can, the code usually writes itself. This one habit is worth more than
any number of extra problems.

**Step 6 — Walk your own code on a 3–5 element example, out loud, before saying "done".**

## 4.2 How to derive a monotonic stack solution on the spot

You will meet a monotonic-stack problem you've never seen. Here's the derivation, not the
memorisation:

1. Write the brute force: for each `i`, scan right until the condition holds. O(n²).
2. Ask: **"when I scan for `i`, what work am I repeating from `i-1`?"**
3. Notice that if `nums[j] < nums[i]` and `j < i`, then `j` can never be anyone's answer once
   `i` exists — `i` is both bigger *and* closer. So `j` is **dominated** and can be discarded.
4. The undominated elements form a monotonic sequence. Keep exactly those, in a stack.
5. Now decide what to record on pop: the value (next greater), the index difference (days to
   wait), or the width between boundaries (histogram).

**Steps 3 and 4 are the whole pattern.** "Element j is dominated by element i, so drop it"
is the idea; everything else is bookkeeping.

## 4.3 Practice ladder

Do these in order. Don't skip levels. **Rule: implement each one yourself before looking at a
solution, and re-solve anything you needed help with 3 days later.**

### Stacks

**Foundation**
- Valid Parentheses
- Min Stack
- Baseball Game
- Remove All Adjacent Duplicates In String
- Implement Queue using Stacks
- Implement Stack using Queues
- Backspace String Compare

**Monotonic stack — do all of these, they're the core**
- Next Greater Element I
- Next Greater Element II (circular)
- Daily Temperatures
- Online Stock Span
- Remove K Digits
- 132 Pattern
- Sum of Subarray Minimums
- Remove Duplicate Letters / Smallest Subsequence of Distinct Characters
- Largest Rectangle in Histogram ⭐
- Maximal Rectangle ⭐
- Trapping Rain Water (stack + two-pointer)

**Parsing & simulation**
- Evaluate Reverse Polish Notation
- Basic Calculator II
- Basic Calculator (parentheses)
- Decode String
- Simplify Path
- Asteroid Collision
- Exclusive Time of Functions
- Number of Atoms (hard parsing)

**Recursion → iteration**
- Binary Tree Inorder / Preorder / Postorder Traversal, iteratively
- Flatten Nested List Iterator
- BST Iterator

### Queues

**Foundation**
- Design Circular Queue
- Design Circular Deque
- Number of Recent Calls
- Moving Average from Data Stream

**BFS core**
- Binary Tree Level Order Traversal
- Binary Tree Right Side View
- Number of Islands (BFS version)
- Rotting Oranges ⭐
- 01 Matrix ⭐
- Walls and Gates
- Open the Lock
- Word Ladder ⭐
- Shortest Path in Binary Matrix
- Snakes and Ladders
- Shortest Bridge
- Minimum Knight Moves
- Sliding Puzzle (hard, state encoding)

**Topological sort**
- Course Schedule
- Course Schedule II
- Alien Dictionary ⭐
- Minimum Height Trees
- Parallel Courses

**Monotonic deque**
- Sliding Window Maximum ⭐
- Longest Continuous Subarray With Absolute Diff ≤ Limit
- Shortest Subarray with Sum at Least K (hard)
- Constrained Subsequence Sum (hard)
- Jump Game VI

**0-1 BFS**
- Minimum Obstacle Removal to Reach Corner
- Minimum Cost to Make at Least One Valid Path in a Grid

### Heaps

**Foundation**
- Kth Largest Element in a Stream
- Last Stone Weight
- Kth Largest Element in an Array ⭐ (heap + quickselect)
- Top K Frequent Elements ⭐ (heap + buckets)
- K Closest Points to Origin
- Sort Characters By Frequency
- Minimum Cost to Connect Sticks

**K-way merge**
- Merge k Sorted Lists ⭐
- Kth Smallest Element in a Sorted Matrix
- Find K Pairs with Smallest Sums
- Smallest Range Covering Elements from K Lists (hard)
- Ugly Number II

**Two heaps**
- Find Median from Data Stream ⭐
- Sliding Window Median (hard — lazy deletion)
- IPO (hard)

**Scheduling**
- Meeting Rooms II ⭐
- Task Scheduler ⭐
- Car Pooling
- Single-Threaded CPU
- Reorganize String
- Minimum Number of Refueling Stops
- Process Tasks Using Servers

**Graph + heap**
- Network Delay Time (Dijkstra)
- Path with Maximum Probability
- Cheapest Flights Within K Stops (Dijkstra variant / Bellman-Ford)
- Swim in Rising Water
- Min Cost to Connect All Points (Prim)

### Combination problems (do these last — they mix all three)

- LRU Cache (HashMap + doubly linked list)
- LFU Cache (HashMap + frequency buckets)
- Design Twitter (hash map + k-way merge heap)
- Maximum Frequency Stack (stack of stacks + frequency map)
- Design Hit Counter
- The Skyline Problem (heap + sweep line, hard)
- Basic Calculator III (stack + recursion, hard)

## 4.4 Suggested study sequence

You said you're building DSA up from the basics, so here's a realistic order rather than a
"do 200 problems" instruction.

**Week 1 — mechanics.** Implement `ArrayStack`, `LinkedStack`, `CircularQueue`, `LinkedQueue`,
and `MinHeap` from scratch, from memory, twice. Then do the Foundation lists. The goal is that
`siftUp`/`siftDown` and the BFS template come out of your fingers without thinking.

**Week 2 — the three big patterns.** Monotonic stack, BFS, top-k heap. Do every problem in
those three sections. These three alone cover most stack/queue/heap interview questions.

**Week 3 — the rest.** Parsing, topological sort, monotonic deque, two heaps, scheduling.

**Week 4 — hard + mixed.** Largest Rectangle, Word Ladder, Sliding Window Median, Alien
Dictionary, The Skyline Problem. Then the combination problems.

**Throughout:** for every problem, before coding, write down (a) the invariant, (b) the time
and space complexity you're targeting, (c) the edge cases. After coding, write one line in a
notebook: *"trigger phrase → pattern"*. That notebook is what you re-read the night before the
interview, not the problems themselves.

## 4.5 The mistakes that cost people offers

**Stacks**
1. Using `java.util.Stack` (says "I learned Java from a 2009 tutorial"). Use `ArrayDeque`.
2. `peek()`/`pop()` without an `isEmpty()` check.
3. Forgetting the leftover check after the loop (`stack.isEmpty()` at the end of bracket
   matching; the flush loop or sentinel in monotonic stacks).
4. Storing values when you needed indices — then discovering you can't compute widths.
5. Getting `<` vs `<=` wrong with duplicates and double-counting.
6. Wrong operand order in RPN subtraction/division.

**Queues**
7. Not snapshotting `q.size()` before the level loop → levels blend, distances wrong.
8. Marking `visited` on dequeue instead of enqueue → duplicates, possible O(V²) blowup.
9. Missing bounds checks in grid BFS.
10. `steps++` inside the inner loop instead of outside.
11. Using BFS for a weighted graph (should be Dijkstra) or Dijkstra where weights are 0/1
    (should be 0-1 BFS) — correct but suboptimal, and interviewers notice.
12. Forgetting `tail = null` when a linked queue empties.

**Heaps**
13. Forgetting Java's `PriorityQueue` is a **min**-heap by default.
14. Using a max-heap for "k largest" (size grows to n instead of staying at k).
15. `(a, b) -> b - a` → integer overflow.
16. Assuming a heap is sorted, or that iterating it gives sorted order.
17. Using `remove(Object)` in a loop → O(n²) without realising it.
18. Mutating an object already inside the heap.
19. Missing the lazy-deletion guard in Dijkstra.

**Universal**
20. Coding before stating the approach and complexity.
21. Not testing on an empty input, a single element, or all-equal elements.
22. Silence. Narrate. A correct solution delivered mutely scores worse than a good solution
    reasoned aloud, especially at Google.

## 4.6 The one-page summary

```
STACK   → LIFO, O(1) all ops, ArrayDeque
          nesting/pending → matching, calculators, iterative DFS
          "next/prev greater/smaller" → MONOTONIC STACK, store indices, O(n)
          invariant: stack holds elements whose answer isn't known yet

QUEUE   → FIFO, O(1) all ops, ArrayDeque
          waves/levels → BFS = shortest path on unweighted graphs
          snapshot q.size() per level; mark visited at ENQUEUE
          all sources at once → multi-source BFS
          in-degree 0 → Kahn's topological sort
          max/min per window → MONOTONIC DEQUE, O(n)
          0/1 weights → 0-1 BFS with a deque

HEAP    → partial order, peek O(1), offer/poll O(log n), build O(n)
          PriorityQueue is MIN by default; Integer.compare, never a-b
          k largest → MIN-heap of size k  (and vice versa)
          merge k sorted → heap of the k frontiers
          streaming median → two heaps, max-heap low + min-heap high
          intervals → sort by start + min-heap of ends
          weighted shortest path → Dijkstra + lazy deletion guard
```

Print that block. Read it before every mock interview.