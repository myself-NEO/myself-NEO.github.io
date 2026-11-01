# Linked Lists — From Scratch to Advanced

A complete, self-contained deep dive for Java interviews.

**How to use this file:** read Part 0 and Part 1 once, then work through Part 2 technique by
technique. Each technique goes *trigger → idea → template → problems*. Linked-list questions
are rarely about cleverness. They test whether you can move pointers **without losing a node,
creating a cycle, or dereferencing null**, under interview pressure. The eight techniques in
Part 2 cover almost every question you will see. Part 3 covers the design problems built on
lists (LRU, LFU, skip lists). Part 4 is the framework, the practice ladder and the mistakes to avoid.

Every solution below compiles and passes randomised tests against a simple array-based
reference. Problem numbers like **LC 206** refer to LeetCode.

---

## Table of Contents

**[Part 0 — The mental model](#part-0--the-mental-model)**

**[Part 1 — Foundations](#part-1--foundations)**
1. [The node, and two helpers to write first](#11-the-node-and-two-helpers-to-write-first)
2. [Traversal templates — which loop condition?](#12-traversal-templates--which-loop-condition)
3. [Java's `LinkedList` — and why you rarely want it](#13-javas-linkedlist--and-why-you-rarely-want-it)
4. [Build a singly linked list from scratch](#14-build-a-singly-linked-list-from-scratch)
5. [Doubly linked lists and sentinels](#15-doubly-linked-lists-and-sentinels)
6. [Circular lists](#16-circular-lists)
7. [Recursion on lists — and the stack-depth trap](#17-recursion-on-lists--and-the-stack-depth-trap)

**[Part 2 — The core techniques](#part-2--the-core-techniques)**
1. [The dummy node](#21-technique-1--the-dummy-node)
2. [In-place reversal](#22-technique-2--in-place-reversal-)
3. [Fast and slow pointers](#23-technique-3--fast-and-slow-pointers-)
4. [The fixed gap](#24-technique-4--the-fixed-gap)
5. [Merge and split](#25-technique-5--merge-and-split)
6. [Middle, reverse, weave](#26-technique-6--middle-reverse-weave-)
7. [Two lists at once](#27-technique-7--two-lists-at-once)
8. [Hashing and cloning](#28-technique-8--hashing-and-cloning)

**[Part 3 — Design problems](#part-3--design-problems)**
1. [LRU Cache](#31-lru-cache-)
2. [LFU Cache](#32-lfu-cache)
3. [Browser History](#33-browser-history)
4. [Flatten a Multilevel Doubly Linked List](#34-flatten-a-multilevel-doubly-linked-list)
5. [Skip lists](#35-skip-lists--linked-lists-with-express-lanes)
6. [Linked lists inside the JDK](#36-linked-lists-inside-the-jdk)

**[Part 4 — Solving any linked-list question](#part-4--solving-any-linked-list-question)**

---

# Part 0 — The Mental Model

An array is **one block of memory**: element `i` lives at `base + i × size`, so you can jump
anywhere in O(1). A linked list is **a chain of separate objects**, each holding a value and the
address of the next one. The only way to reach the 500th node is to follow 499 links.

```text
array:        [ 7 | 3 | 9 | 4 ]          one contiguous block, index = arithmetic

linked list:  head
               |
              [7|*]--->[3|*]--->[9|*]--->[4|null]     nodes anywhere in the heap
```

That one difference produces the whole trade-off table:

| Operation | Array / `ArrayList` | Singly linked list | Doubly linked list |
|---|---|---|---|
| Access element `i` | **O(1)** | O(n) | O(n) |
| Search by value | O(n) | O(n) | O(n) |
| Insert/delete at the front | O(n) (shift everything) | **O(1)** | **O(1)** |
| Insert/delete at the back | amortised O(1) | O(1) with a tail pointer (delete: O(n)) | **O(1)** |
| Insert after a node you hold | O(n) | **O(1)** | **O(1)** |
| Delete a node you hold | O(n) | O(n) (you need its predecessor) | **O(1)** |
| Memory per element | value only | value + 1 pointer + object header | value + 2 pointers + header |
| CPU-cache friendliness | excellent | poor (pointer chasing) | poor |

**When a linked list actually wins:**
- you hold a **reference to a node** and need O(1) insert/remove *there*: LRU caches, schedulers, undo lists;
- you need to **splice** whole chains in O(1): merging, concatenating, moving a block;
- elements must **never move** in memory (references stay valid, no resize pauses);
- the structure is **persistent**: functional languages share list tails between versions.

For "just store a sequence", an `ArrayList`/`ArrayDeque` wins almost every time in Java,
because contiguous memory is so much faster to traverse.

**Why interviewers love linked lists anyway:** the problems are short, need O(1) extra space,
and expose sloppiness instantly. There are only a few moving parts, and every
pointer write can break the structure. Almost every question is a combination of these
eight techniques:

| # | Technique | One-line idea | Typical triggers |
|---|---|---|---|
| 1 | Dummy node | a fake node before the head removes every "is this the first node?" case | remove, insert, partition, "head may change" |
| 2 | Reversal | `prev / cur / next`, flip one link per step | reverse, palindrome, k-group, "from the end" |
| 3 | Fast & slow | one pointer at speed 2, one at speed 1 | middle, cycle, "is there a loop", duplicate number |
| 4 | Fixed gap | two pointers k apart, moved together | n-th from the end, rotate |
| 5 | Merge & split | relink nodes from two sorted runs; cut at the middle | merge, sort, k sorted lists |
| 6 | Middle + reverse + weave | combine 3 and 2, then interleave | reorder, palindrome, twin sum |
| 7 | Two lists at once | walk both, keep a carry or switch lists | add numbers, intersection |
| 8 | Hashing | trade O(n) space for simplicity | copy with random pointer, dedupe unsorted |

The sentence to say when the interviewer asks "why a linked list?":

> *I need O(1) insertion and removal at positions I already hold a reference to, and I never
> need random access by index.*

---

# Part 1 — Foundations

## 1.1 The node, and two helpers to write first

LeetCode's node class, used throughout this guide:

```java
class ListNode {
    int val;
    ListNode next;

    ListNode() { }
    ListNode(int val) { this.val = val; }
    ListNode(int val, ListNode next) { this.val = val; this.next = next; }
}
```

Before solving anything, write these two helpers. In an interview they take 30 seconds and let
you **test on the spot**: build the input in one line, print the output in one line. `show`
also refuses to loop forever, so a bug that creates a cycle doesn't hang your test run.

```java
static ListNode build(int... values) {          // build(1, 2, 3) -> 1 -> 2 -> 3
    ListNode dummy = new ListNode();
    ListNode tail = dummy;
    for (int v : values) {
        tail.next = new ListNode(v);
        tail = tail.next;
    }
    return dummy.next;
}

static String show(ListNode head) {              // "[1 -> 2 -> 3]", and it survives cycles
    StringBuilder sb = new StringBuilder("[");
    int steps = 0;
    for (ListNode n = head; n != null; n = n.next) {
        if (steps++ == 1_000) return sb.append(" ... (cycle?)]").toString();
        if (sb.length() > 1) sb.append(" -> ");
        sb.append(n.val);
    }
    return sb.append("]").toString();
}
```

```java
ListNode head = build(1, 2, 3, 4);
System.out.println(show(reverseList(head)));   // [4 -> 3 -> 2 -> 1]
```

## 1.2 Traversal templates — which loop condition?

Nearly every off-by-one bug in list code comes from the loop condition. Pick it deliberately:

| Condition | Where `cur` ends | Use it when… |
|---|---|---|
| `while (cur != null)` | `null`, after visiting **every** node | you need to see each node (count, sum, search, print) |
| `while (cur.next != null)` | **on the last node** | you need the tail, or you modify `cur.next` (deletions!) |
| `while (fast != null && fast.next != null)` | — | two-step pointers (Part 2.3); check both before `fast.next.next` |

```java
int length(ListNode head) {
    int n = 0;
    for (ListNode cur = head; cur != null; cur = cur.next) n++;
    return n;
}

ListNode nodeAt(ListNode head, int index) {      // 0-based; null if the list is shorter
    ListNode cur = head;
    for (int i = 0; i < index && cur != null; i++) cur = cur.next;
    return cur;
}

ListNode lastNode(ListNode head) {                // stops ON the last node, not after it
    if (head == null) return null;
    ListNode cur = head;
    while (cur.next != null) cur = cur.next;
    return cur;
}
```

**Rule of thumb:** to *delete* a node in a singly linked list you must stand on the node
**before** it, because you need to rewrite `prev.next`. That's why deletion loops look at
`cur.next`, not at `cur`, and why they start from a dummy node (Part 2.1).

## 1.3 Java's `LinkedList` — and why you rarely want it

`java.util.LinkedList` is a **doubly linked list** that implements both `List` and `Deque`.

| Call | Cost | Note |
|---|---|---|
| `addFirst/addLast/removeFirst/removeLast/peekFirst/peekLast` | O(1) | fine, but `ArrayDeque` does the same faster |
| `get(i)`, `set(i, x)`, `add(i, x)`, `remove(i)` | **O(n)** | walks from the nearer end |
| `contains`, `indexOf`, `remove(Object)` | O(n) | |
| `iterator().remove()`, `listIterator().add(x)` | **O(1)** | the only place it beats `ArrayList` |

Why you rarely want it:
1. **Memory**: each element costs a `Node` object: a 12-byte header and three 4-byte
   references, so 24 bytes, plus the boxed `Integer` (16 bytes). That's about **40 bytes per int**, versus
   about 20 in an `ArrayList<Integer>` and 4 in an `int[]`.
2. **Speed**: traversal chases pointers all over the heap, missing the CPU cache, so even an
   O(n) scan is several times slower than over an `ArrayList`.
3. **The O(n²) trap**: `for (int i = 0; i < list.size(); i++) list.get(i)` is quadratic on a `LinkedList`.

The one real use is editing **while iterating**:

```java
// ListIterator: O(1) removal and insertion at the iterator's position. The one thing LinkedList is good at.
static List<Integer> editWhileIterating() {
    LinkedList<Integer> list = new LinkedList<>(List.of(1, 2, 3, 4, 5, 6));
    ListIterator<Integer> it = list.listIterator();
    while (it.hasNext()) {
        int x = it.next();
        if (x % 2 == 0) it.remove();      // unlink the node we are standing on
        else it.add(x * 10);              // splice a new node right after it
    }
    return list;                          // [1, 10, 3, 30, 5, 50]
}
```

In interviews, linked-list questions use a hand-written `ListNode`, never `java.util.LinkedList`.
For stacks and queues use `ArrayDeque` (see the *Stacks, Queues & Heaps* guide).

## 1.4 Build a singly linked list from scratch

**LC 707 Design Linked List**:
- `get(index)`;
- `addAtHead`, `addAtTail`;
- `addAtIndex(index, val)`, which appends if `index == size` and does nothing if it's larger;
- `deleteAtIndex(index)`.

**Approach.** Three invariants make the code short:
- a **sentinel** node sits before the first element, so inserting or deleting at index 0
  is the same code as anywhere else;
- `tail` always points at the last node (or the sentinel when the list is empty), so
  appending is O(1);
- `size` is kept up to date, so bounds checks are O(1).

```java
// LC 707 "Design Linked List": a sentinel plus a tail pointer, so appends are O(1).
class MyLinkedList {
    private final ListNode sentinel = new ListNode();   // sentinel.next is the first real node
    private ListNode tail = sentinel;                   // last node (the sentinel when empty)
    private int size;

    public int get(int index) {
        if (index < 0 || index >= size) return -1;
        return nodeBefore(index).next.val;
    }

    public void addAtHead(int val) { addAtIndex(0, val); }

    public void addAtTail(int val) {
        tail.next = new ListNode(val);
        tail = tail.next;
        size++;
    }

    public void addAtIndex(int index, int val) {
        if (index < 0 || index > size) return;
        if (index == size) {                            // appending also moves the tail
            addAtTail(val);
            return;
        }
        ListNode prev = nodeBefore(index);
        prev.next = new ListNode(val, prev.next);
        size++;
    }

    public void deleteAtIndex(int index) {
        if (index < 0 || index >= size) return;
        ListNode prev = nodeBefore(index);
        if (prev.next == tail) tail = prev;             // deleting the last node moves the tail back
        prev.next = prev.next.next;
        size--;
    }

    private ListNode nodeBefore(int index) {            // index steps from the sentinel
        ListNode cur = sentinel;
        for (int i = 0; i < index; i++) cur = cur.next;
        return cur;
    }
}
```

**The non-obvious parts:**
- `nodeBefore(index)` walks `index` steps **from the sentinel**, so it returns the node
  *before* position `index`. Every operation needs exactly that node.
- Deleting the last node must move `tail` back, or the next `addAtTail` would append to a node
  that's no longer in the list. **Forgetting to maintain the tail is the most common bug.**
- Appending goes through `addAtTail` so the tail is updated in one place.

**Complexity:** `addAtHead`, `addAtTail`: O(1). The index-based operations: O(index). Space: O(n).

## 1.5 Doubly linked lists and sentinels

A doubly linked node knows both neighbours. Two consequences:
- **Deleting a node you hold is O(1)**: `n.prev.next = n.next; n.next.prev = n.prev`. No
  walk to find the predecessor.
- Every insert or delete must update **four** pointers instead of two. Writing them in the
  wrong order is the classic bug.

**Two sentinels** (`head` and `tail` dummy nodes that are never removed) make every real node
have non-null neighbours, so there are no special cases at either end:

```text
   head <-> [ 7 ] <-> [ 3 ] <-> [ 9 ] <-> tail        empty list:  head <-> tail
 (sentinel)                              (sentinel)
```

```java
class DoublyLinkedList {
    static final class Node {
        int val;
        Node prev, next;

        Node(int val) { this.val = val; }
    }

    private final Node head = new Node(0);   // sentinels: never removed, so never null neighbours
    private final Node tail = new Node(0);
    private int size;

    DoublyLinkedList() {
        head.next = tail;
        tail.prev = head;
    }

    Node addFirst(int val) { return insertAfter(head, val); }
    Node addLast(int val)  { return insertAfter(tail.prev, val); }

    Node insertAfter(Node node, int val) {   // O(1): four pointer writes, no special cases
        Node n = new Node(val);
        n.prev = node;
        n.next = node.next;
        node.next.prev = n;
        node.next = n;
        size++;
        return n;
    }

    void remove(Node n) {                    // O(1) given the node: no hunt for the previous node
        n.prev.next = n.next;
        n.next.prev = n.prev;
        n.prev = n.next = null;              // catch accidental reuse early
        size--;
    }

    Integer removeFirst() {
        if (size == 0) return null;
        Node n = head.next;
        remove(n);
        return n.val;
    }

    Integer removeLast() {
        if (size == 0) return null;
        Node n = tail.prev;
        remove(n);
        return n.val;
    }

    int size() { return size; }
}
```

**Write the four pointer updates in this order** when inserting `n` after `node`:
1. `n.prev = node;`
2. `n.next = node.next;` (the new node points outward first: nothing is lost yet);
3. `node.next.prev = n;`
4. `node.next = n;` (overwrite the old link **last**, after it has been used).

This class is the backbone of the LRU and LFU caches in Part 3: there, a hash map stores
`key → Node`, which is exactly the "delete a node you hold, in O(1)" case.

## 1.6 Circular lists

In a circular list the last node points back to the first. There's no `null` to stop at, so
traversal needs a different end condition: stop when you're back at the start.

```java
if (head != null) {
    ListNode cur = head;
    do {
        System.out.println(cur.val);
        cur = cur.next;
    } while (cur != head);           // do-while: visit head once, stop when we return to it
}
```

Where they appear:
- round-robin scheduling;
- ring buffers drawn as lists;
- the Josephus problem;
- the internals of some queues (a single `tail` pointer suffices, because `tail.next` is the head).

**LC 1823 Find the Winner of the Circular Game (Josephus).** `n` friends sit in a circle;
counting starts at friend 1, and every `k`-th friend leaves. Who's last?

```java
// LC 1823: n friends in a circle, every k-th one leaves; who is left? Simulated on a circular list.
public int findTheWinner(int n, int k) {
    ListNode tail = new ListNode(n);
    ListNode head = tail;
    for (int i = n - 1; i >= 1; i--) head = new ListNode(i, head);   // 1 -> 2 -> ... -> n
    tail.next = head;                                                 // close the ring
    ListNode prev = tail;                       // the node BEFORE the one we start counting from
    while (prev.next != prev) {                 // more than one friend left
        for (int i = 1; i < k; i++) prev = prev.next;
        prev.next = prev.next.next;             // the k-th friend leaves
    }
    return prev.val;
}

// Same answer from the recurrence J(1) = 0, J(n) = (J(n - 1) + k) % n: O(n) time, O(1) space.
public int findTheWinnerMath(int n, int k) {
    int winner = 0;
    for (int size = 2; size <= n; size++) winner = (winner + k) % size;
    return winner + 1;
}
```

**Why keep `prev` instead of `cur`?** Removing a node from a singly linked circle needs its
predecessor, so the loop always stands one node behind the one being counted. The simulation is
O(n·k). The recurrence gives O(n) and is worth mentioning as the follow-up: after the first
removal, the remaining `n - 1` friends form the same game, shifted by `k`.

## 1.7 Recursion on lists — and the stack-depth trap

A list is a recursive structure: *a list is empty, or a node followed by a list*. So many list
algorithms have three-line recursive forms:

```java
// Reverse recursively: reverse everything after head, then hook head on at the end.
public ListNode reverseListRecursive(ListNode head) {
    if (head == null || head.next == null) return head;   // empty or last node: the new head
    ListNode newHead = reverseListRecursive(head.next);   // the rest, already reversed
    head.next.next = head;                                 // the node after head now points back to it
    head.next = null;                                      // head becomes the tail
    return newHead;
}

// Visit values in reverse without modifying the list: the call stack does the reversing.
void collectReversed(ListNode node, List<Integer> out) {
    if (node == null) return;
    collectReversed(node.next, out);
    out.add(node.val);
}
```

**How the recursive reversal works**, for `1 -> 2 -> 3`:
1. The call on `1` recurses on `2`, which recurses on `3`.
2. `3` has no next, so it's returned as `newHead`.
3. Back in the call on `2`: `head.next.next = head` makes `3 -> 2`, and `head.next = null` cuts `2 -> 3`.
4. Back in the call on `1`: `2 -> 1`, and `1 -> null`.

Every frame returns the same `newHead`.

**The trap:** recursion uses one stack frame per node. Java's default thread stack (typically
512 KB–1 MB) holds somewhere around 10,000–20,000 such frames, depending on frame size and
platform. Lists of 10⁵ nodes, which are common in test data, throw `StackOverflowError`. Say so in an
interview: *"recursive is O(n) space for the call stack; I'll write the iterative version for
production."* The recursive forms are still great for explaining an idea quickly.

---

# Part 2 — The Core Techniques

## 2.1 Technique 1 — The dummy node

**Trigger:** the head itself might be removed or replaced, or you're *building* a new list.

**Core idea:** create `dummy = new ListNode(0, head)` and work from it. Now every real node has
a predecessor, so "delete the first node" and "delete a middle node" are the same code. Return
`dummy.next` at the end, because the real head may have changed.

### Remove Linked List Elements (LC 203)

```java
public ListNode removeElements(ListNode head, int val) {
    ListNode dummy = new ListNode(0, head);
    ListNode cur = dummy;
    while (cur.next != null) {
        if (cur.next.val == val) cur.next = cur.next.next;   // unlink, and DON'T advance:
        else cur = cur.next;                                 // the new cur.next may match too
    }
    return dummy.next;
}
```

**The detail people get wrong:** after unlinking, **don't advance**. The node that just moved
into `cur.next` hasn't been checked yet. With `[6, 6, 6]` and `val = 6`, advancing would skip
every other node.

### Remove Duplicates from Sorted List I and II (LC 83, LC 82)

```java
// LC 83: sorted list, keep one copy of each value. The head never changes: no dummy needed.
public ListNode deleteDuplicates(ListNode head) {
    ListNode cur = head;
    while (cur != null && cur.next != null) {
        if (cur.next.val == cur.val) cur.next = cur.next.next;
        else cur = cur.next;
    }
    return head;
}

// LC 82: sorted list, delete EVERY value that appears more than once. The head may go: dummy.
public ListNode deleteAllDuplicates(ListNode head) {
    ListNode dummy = new ListNode(0, head);
    ListNode prev = dummy;                        // last node we know we keep
    while (prev.next != null) {
        ListNode cur = prev.next;
        if (cur.next != null && cur.next.val == cur.val) {
            int dup = cur.val;
            while (cur != null && cur.val == dup) cur = cur.next;   // skip the whole run
            prev.next = cur;                                         // and don't advance prev
        } else {
            prev = cur;
        }
    }
    return dummy.next;
}
```

**Why the second one needs a dummy and the first doesn't:** in LC 83 the first node of every
run survives, so the head never changes. In LC 82, `[1, 1, 2]` loses its head, and `prev`
must start somewhere *before* it.

### Partition List (LC 86) — two dummies, two lists

**Approach.** Walk once and append each node to one of two lists (`< x` and `≥ x`), each with
its own dummy, then glue them. Appending preserves the relative order inside each group.

```java
// LC 86: nodes < x first, then the rest, both groups keeping their original order.
public ListNode partition(ListNode head, int x) {
    ListNode lessDummy = new ListNode(), moreDummy = new ListNode();
    ListNode less = lessDummy, more = moreDummy;
    for (ListNode cur = head; cur != null; cur = cur.next) {
        if (cur.val < x) { less.next = cur; less = cur; }
        else             { more.next = cur; more = cur; }
    }
    more.next = null;               // essential: the old next pointer could close a cycle
    less.next = moreDummy.next;     // glue the two lists
    return lessDummy.next;
}
```

**`more.next = null` is not optional.** The last node appended to `more` still points to
whatever followed it in the original list, possibly a node that's now in `less`. That
creates a **cycle**. Whenever you rebuild lists out of existing nodes, terminate the last one.

### Odd Even Linked List (LC 328)

The same "build two lists" idea without dummies: the odd and even lists already have natural heads.

```java
// LC 328: nodes at odd positions first, then even positions. O(1) extra space.
public ListNode oddEvenList(ListNode head) {
    if (head == null) return null;
    ListNode odd = head, even = head.next, evenHead = even;
    while (even != null && even.next != null) {
        odd.next = even.next;     // link the next odd node
        odd = odd.next;
        even.next = odd.next;     // link the next even node
        even = even.next;
    }
    odd.next = evenHead;          // odd list, then even list
    return head;
}
```

**Loop condition:** `even != null && even.next != null` covers both even and odd lengths: we
stop when there's no next odd node to link.

---

## 2.2 Technique 2 — In-place reversal ⭐

**Trigger:** reverse, "read from the end", palindrome, k-group, "reverse between".

**Core idea:** walk once with three pointers and flip one link per step.

```java
public ListNode reverseList(ListNode head) {
    ListNode prev = null, cur = head;
    while (cur != null) {
        ListNode next = cur.next;     // 1. save the rest of the list
        cur.next = prev;              // 2. flip this one link
        prev = cur;                   // 3. step prev ...
        cur = next;                   //    ... and cur forward
    }
    return prev;                      // cur fell off the end; prev is the old tail = new head
}
```

**Trace it on paper once, then never again:**

```text
start:   prev = null   cur = 1          1 -> 2 -> 3 -> null
step 1:  next = 2;  1.next = null;  prev = 1;  cur = 2      null <- 1    2 -> 3 -> null
step 2:  next = 3;  2.next = 1;     prev = 2;  cur = 3      null <- 1 <- 2    3 -> null
step 3:  next = null; 3.next = 2;   prev = 3;  cur = null   null <- 1 <- 2 <- 3
return prev = 3
```

The order inside the loop is forced: you must **save `next` before overwriting `cur.next`**, or
the rest of the list is lost. **Complexity:** O(n) time, O(1) space. The recursive version is in 1.7.

### Reverse Linked List II (LC 92) — reverse positions left..right in one pass

**Approach: front insertion.**
1. Walk `before` to the node just before position `left`.
2. `first = before.next` is the block's first node, and it will end up as the block's **last**.
3. Repeat `right - left` times: take the node right after `first` and move it to the front of the block (right after `before`).

```text
left = 2, right = 4:       1 -> [2 -> 3 -> 4] -> 5
move 3 to the front:       1 -> [3 -> 2 -> 4] -> 5
move 4 to the front:       1 -> [4 -> 3 -> 2] -> 5          'first' (2) stays and slides back
```

```java
// LC 92: reverse positions left..right (1-based) in one pass.
public ListNode reverseBetween(ListNode head, int left, int right) {
    ListNode dummy = new ListNode(0, head);
    ListNode before = dummy;
    for (int i = 1; i < left; i++) before = before.next;   // the node just before position 'left'
    ListNode first = before.next;                          // ends up LAST in the reversed block
    for (int i = 0; i < right - left; i++) {
        ListNode moved = first.next;                       // take the node after 'first' ...
        first.next = moved.next;
        moved.next = before.next;                          // ... and insert it right after 'before'
        before.next = moved;
    }
    return dummy.next;
}
```

The dummy handles `left = 1`, where the head changes.

### Swap Nodes in Pairs (LC 24)

```java
// LC 24: swap every two adjacent nodes (the nodes themselves, not their values).
public ListNode swapPairs(ListNode head) {
    ListNode dummy = new ListNode(0, head);
    ListNode prev = dummy;
    while (prev.next != null && prev.next.next != null) {
        ListNode a = prev.next, b = a.next;
        a.next = b.next;          // a -> rest
        b.next = a;               // b -> a
        prev.next = b;            // prev -> b
        prev = a;                 // a is now second in the pair: the next pair hangs off it
    }
    return dummy.next;
}
```

**Write the three link updates from the far end inward:** `a.next` first (it holds the
link to the rest of the list), then `b.next`, then `prev.next`. Then `a`, now second in its pair,
becomes the `prev` for the next pair.

### Reverse Nodes in k-Group (LC 25) ⭐ — the hard one

**Approach.** For each group:
1. find its k-th node (if there aren't k nodes left, stop);
2. reverse the group with the standard loop, but start `prev` at `groupNext`, so the
   group's new tail automatically points at the next group;
3. reconnect the previous part (`groupPrev.next = kth`) and move `groupPrev` to the group's
   new tail (the old first node).

```java
// LC 25: reverse each group of k nodes; a final group shorter than k stays as it is. O(1) space.
public ListNode reverseKGroup(ListNode head, int k) {
    ListNode dummy = new ListNode(0, head);
    ListNode groupPrev = dummy;
    while (true) {
        ListNode kth = groupPrev;
        for (int i = 0; i < k && kth != null; i++) kth = kth.next;   // last node of this group
        if (kth == null) break;                                      // fewer than k nodes left
        ListNode groupNext = kth.next;
        ListNode prev = groupNext, cur = groupPrev.next;   // reverse the group, pointing its new
        while (cur != groupNext) {                         // tail straight at the next group
            ListNode next = cur.next;
            cur.next = prev;
            prev = cur;
            cur = next;
        }
        ListNode oldFirst = groupPrev.next;                // now the group's tail
        groupPrev.next = kth;                              // kth is the group's new head
        groupPrev = oldFirst;
    }
    return dummy.next;
}
```

**Complexity:** O(n) time, since every node is visited twice (count, reverse), and **O(1)
space**. The recursive version is shorter but uses O(n/k) stack. If the interviewer asks for constant
space, this is the answer.

---

## 2.3 Technique 3 — Fast and slow pointers ⭐

**Trigger:** middle of the list, cycle detection, cycle entrance, "is it a loop", and implicit
sequences where `x → f(x)` must eventually repeat.

**Core idea:** `slow` moves one step and `fast` moves two. When `fast` reaches the end, `slow` is at
the middle. If there's a cycle, `fast` can never reach the end and laps `slow` instead.

### Middle of the list (LC 876) — and which middle you want

```java
// LC 876: the SECOND middle for even lengths: [1, 2, 3, 4] -> 3.
public ListNode middleNode(ListNode head) {
    ListNode slow = head, fast = head;
    while (fast != null && fast.next != null) {
        slow = slow.next;
        fast = fast.next.next;
    }
    return slow;
}

// The FIRST middle for even lengths: [1, 2, 3, 4] -> 2. The one you want before cutting in half.
public ListNode middleNodeFirst(ListNode head) {
    if (head == null) return null;
    ListNode slow = head, fast = head;
    while (fast.next != null && fast.next.next != null) {
        slow = slow.next;
        fast = fast.next.next;
    }
    return slow;
}
```

| Length | `middleNode` (second middle) | `middleNodeFirst` (first middle) |
|---|---|---|
| 5: `1 2 3 4 5` | 3 | 3 |
| 4: `1 2 3 4` | **3** | **2** |

**Which one to use:** to **cut a list into two halves** (merge sort, reorder, palindrome), use
the *first* middle and cut after it. With the second middle, a 2-node list "splits" into 2 + 0, and
merge sort recurses forever.

### Linked List Cycle I and II (LC 141, LC 142)

```java
// LC 141
public boolean hasCycle(ListNode head) {
    ListNode slow = head, fast = head;
    while (fast != null && fast.next != null) {
        slow = slow.next;
        fast = fast.next.next;
        if (slow == fast) return true;    // compare nodes (==), never values
    }
    return false;                         // fast reached the end: there is an end, so no cycle
}

// LC 142: the node where the cycle begins, or null.
public ListNode detectCycle(ListNode head) {
    ListNode slow = head, fast = head;
    while (fast != null && fast.next != null) {
        slow = slow.next;
        fast = fast.next.next;
        if (slow == fast) {                          // phase 1: they met inside the cycle
            ListNode finder = head;
            while (finder != slow) {                 // phase 2: both at speed 1
                finder = finder.next;
                slow = slow.next;
            }
            return finder;                           // they meet exactly at the entrance
        }
    }
    return null;
}

public int cycleLength(ListNode head) {
    ListNode slow = head, fast = head;
    while (fast != null && fast.next != null) {
        slow = slow.next;
        fast = fast.next.next;
        if (slow == fast) {                          // inside the cycle: walk once around it
            int length = 1;
            for (ListNode p = slow.next; p != slow; p = p.next) length++;
            return length;
        }
    }
    return 0;
}
```

**Why phase 2 finds the entrance:**

```text
head ----- a ----- E ----- b ----- M        E = cycle entrance, M = meeting point
                   \_______________/        c = cycle length
                    (cycle continues back to E)
```

- When they meet, `slow` has walked `a + b` steps (it can't complete a lap first: once both
  are inside the cycle, the gap closes by one per step, so they meet within one lap).
- `fast` has walked twice as far: `2(a + b) = a + b + k·c` for some whole number of laps `k`.
- So `a + b = k·c`, which means `a = (k - 1)·c + (c - b)`.
- Walking `a` steps from `M` therefore goes `c - b` steps to reach `E`, plus some full laps, and ends **at `E`**.
- Walking `a` steps from `head` also ends at `E`. Two pointers at speed 1, one from each place, meet exactly there.

**Why compare nodes, not values:** two different nodes may hold equal values. `slow == fast`
compares references, which is what "the same node" means.

**Complexity:** O(n) time, O(1) space. The alternative, a `HashSet<ListNode>` of visited nodes, is
O(n) space but perfectly acceptable as a first answer.

### Delete the Middle Node (LC 2095)

```java
// LC 2095: delete node floor(n / 2) (0-based). Start fast one step further so slow stops BEFORE it.
public ListNode deleteMiddle(ListNode head) {
    if (head == null || head.next == null) return null;
    ListNode slow = head, fast = head.next.next;
    while (fast != null && fast.next != null) {
        slow = slow.next;
        fast = fast.next.next;
    }
    slow.next = slow.next.next;
    return head;
}
```

To delete a node, `slow` must stop one node **before** it. Starting `fast` two steps ahead
does exactly that, with no extra `prev` pointer.

### Implicit lists — Happy Number (LC 202) and Find the Duplicate Number (LC 287)

Floyd's algorithm works on any sequence `x, f(x), f(f(x)), …` over a finite set. Such a sequence
must eventually repeat, which means it has a cycle, even though no `ListNode` exists.

```java
// LC 202: the "list" is n -> digitSquareSum(n) -> ...; it either reaches 1 or loops forever.
public boolean isHappy(int n) {
    int slow = n, fast = digitSquareSum(n);
    while (fast != 1 && slow != fast) {
        slow = digitSquareSum(slow);
        fast = digitSquareSum(digitSquareSum(fast));
    }
    return fast == 1;
}

private int digitSquareSum(int n) {
    int sum = 0;
    while (n > 0) {
        int d = n % 10;
        sum += d * d;
        n /= 10;
    }
    return sum;
}
```

```java
// LC 287: n + 1 values in [1, n], exactly one repeated. Read-only array, O(1) space.
// Treat i -> nums[i] as a next pointer: the repeated value is where two pointers merge = a cycle entrance.
public int findDuplicate(int[] nums) {
    int slow = nums[0], fast = nums[0];
    do {                                   // phase 1: meet inside the cycle
        slow = nums[slow];
        fast = nums[nums[fast]];
    } while (slow != fast);
    slow = nums[0];                        // phase 2: same speed from the start
    while (slow != fast) {
        slow = nums[slow];
        fast = nums[fast];
    }
    return slow;                           // the cycle entrance = the duplicate value
}
```

**Why the duplicate is the cycle entrance:** index `i` "points to" `nums[i]`. Values are in
`[1, n]`, so nobody points at index 0, which makes 0 the head of the chain, never part of a cycle. The
repeated value is pointed to by **two** different indexes. That's exactly the node where the
tail joins the cycle: the entrance. It runs in O(n) time, O(1) space, and never modifies the array, which is
why it beats sorting or marking the array in place when the problem forbids those.

---

## 2.4 Technique 4 — The fixed gap

**Trigger:** "n-th from the end", "k-th last", "last k nodes", without knowing the length.

**Core idea:** move `lead` k steps ahead, then move `lead` and `lag` together. When `lead` falls
off the end, `lag` is exactly k nodes from the end. It takes one pass and needs no length.

### Remove Nth Node From End of List (LC 19) and k-th from the end

```java
// LC 19: remove the n-th node from the end (1 <= n <= length) in one pass.
public ListNode removeNthFromEnd(ListNode head, int n) {
    ListNode dummy = new ListNode(0, head);
    ListNode lead = dummy, lag = dummy;
    for (int i = 0; i <= n; i++) lead = lead.next;          // a gap of n + 1 nodes
    while (lead != null) {
        lead = lead.next;
        lag = lag.next;
    }
    lag.next = lag.next.next;                               // lag stopped just BEFORE the target
    return dummy.next;
}

// k-th node from the end (k >= 1), or null if the list is shorter than k.
public ListNode kthFromEnd(ListNode head, int k) {
    ListNode lead = head;
    for (int i = 0; i < k; i++) {
        if (lead == null) return null;
        lead = lead.next;
    }
    ListNode lag = head;
    while (lead != null) {
        lead = lead.next;
        lag = lag.next;
    }
    return lag;
}
```

**Why a gap of `n + 1` from the dummy:** to delete the target we need the node **before** it.
Starting both pointers at the dummy and leading by `n + 1` makes `lag` stop on that
predecessor. The dummy also covers removing the head (`n == length`).

### Rotate List (LC 61)

**Approach.** Rotation is "cut and re-attach":
1. One pass to get the length and the tail.
2. `k %= n`, because rotating by `n` is a no-op, and `k` may be 2·10⁹.
3. The new tail is the `(n - k)`-th node: cut after it, and join the old tail to the old head.

```java
// LC 61: rotate right by k: the last k nodes move to the front.
public ListNode rotateRight(ListNode head, int k) {
    if (head == null || head.next == null) return head;
    int n = 1;
    ListNode tail = head;
    while (tail.next != null) {          // one pass for the length and the tail
        tail = tail.next;
        n++;
    }
    k %= n;                              // k can be far larger than n
    if (k == 0) return head;
    ListNode newTail = head;
    for (int i = 1; i < n - k; i++) newTail = newTail.next;   // the (n - k)-th node
    ListNode newHead = newTail.next;
    newTail.next = null;                 // cut ...
    tail.next = head;                    // ... and re-attach the old front behind the old tail
    return newHead;
}
```

A two-pointer gap would also find the new tail, but you need the length for `k %= n` anyway.
One counting pass plus one walk is the simplest correct solution.

---

## 2.5 Technique 5 — Merge and split

**Trigger:** two (or k) sorted lists, "sort a linked list", "in O(n log n) and O(1) memory".

### Merge Two Sorted Lists (LC 21)

```java
// LC 21: splice the nodes together; no new nodes are created.
public ListNode mergeTwoLists(ListNode a, ListNode b) {
    ListNode dummy = new ListNode(), tail = dummy;
    while (a != null && b != null) {
        if (a.val <= b.val) { tail.next = a; a = a.next; }   // <= keeps equal keys in order (stable)
        else                { tail.next = b; b = b.next; }
        tail = tail.next;
    }
    tail.next = (a != null) ? a : b;                         // attach the leftover run in one step
    return dummy.next;
}

public ListNode mergeTwoListsRecursive(ListNode a, ListNode b) {
    if (a == null) return b;
    if (b == null) return a;
    if (a.val <= b.val) {
        a.next = mergeTwoListsRecursive(a.next, b);
        return a;
    }
    b.next = mergeTwoListsRecursive(a, b.next);
    return b;
}
```

**Points to state:**
- **No new nodes**: merging relinks existing nodes, so it needs O(1) extra space.
  Arrays can't do that, which is why merge sort is *the* sort for linked lists.
- **The leftover run is attached in one step**, not node by node.
- **`<=` makes it stable**: equal keys keep their original order, which matters when nodes carry more than a key.
- The recursive version is elegant, but uses O(n + m) stack.

### Merge k Sorted Lists (LC 23)

With `N` total nodes across `k` lists, there are two standard O(N log k) answers:

```java
// LC 23: N nodes in total across k lists. Heap of the k current heads: O(N log k).
public ListNode mergeKLists(ListNode[] lists) {
    PriorityQueue<ListNode> heap = new PriorityQueue<>((x, y) -> Integer.compare(x.val, y.val));
    for (ListNode head : lists) if (head != null) heap.offer(head);
    ListNode dummy = new ListNode(), tail = dummy;
    while (!heap.isEmpty()) {
        ListNode smallest = heap.poll();
        tail.next = smallest;
        tail = smallest;
        if (smallest.next != null) heap.offer(smallest.next);   // its successor joins the frontier
    }
    return dummy.next;
}

// Divide and conquer: merge neighbours, then neighbours of neighbours. Also O(N log k), no heap.
// Note: it reuses the 'lists' array as scratch space.
public ListNode mergeKListsPairwise(ListNode[] lists) {
    if (lists.length == 0) return null;
    for (int step = 1; step < lists.length; step *= 2) {
        for (int i = 0; i + step < lists.length; i += 2 * step) {
            lists[i] = mergeTwoLists(lists[i], lists[i + step]);
        }
    }
    return lists[0];
}
```

| Approach | Time | Extra space | Notes |
|---|---|---|---|
| Merge lists one by one into a result | O(N·k) | O(1) | the naive answer: the early nodes are re-walked k times |
| Heap of the k heads | O(N log k) | O(k) | streams well (lists can be iterators) |
| Pairwise (divide and conquer) | O(N log k) | O(1) | every node is merged log k times |

The heap comparator uses `Integer.compare`, never `x.val - y.val`, which overflows for large
negative and positive values.

### Sort List (LC 148) — merge sort, top-down and bottom-up

**Approach.** Split at the **first** middle, sort both halves, merge.

```java
// LC 148: merge sort, O(n log n) time, O(log n) stack.
public ListNode sortList(ListNode head) {
    if (head == null || head.next == null) return head;
    ListNode mid = middleNodeFirst(head);   // FIRST middle: with 2 nodes the halves are 1 + 1
    ListNode right = mid.next;
    mid.next = null;                        // cut the list in two
    return mergeTwoLists(sortList(head), sortList(right));
}
```

The top-down version uses O(log n) recursion stack. When the problem insists on **O(1) extra
space**, sort bottom-up: merge runs of size 1, then 2, then 4…, relinking in place. It uses
`length` from 1.2:

```java
// Bottom-up merge sort: merge runs of size 1, 2, 4, ... in place. O(n log n) time, O(1) space.
public ListNode sortListBottomUp(ListNode head) {
    int n = length(head);
    ListNode dummy = new ListNode(0, head);
    for (int size = 1; size < n; size *= 2) {
        ListNode tail = dummy, cur = dummy.next;
        while (cur != null) {
            ListNode left = cur;
            ListNode right = split(left, size);     // left = the first 'size' nodes
            cur = split(right, size);               // right = the next 'size', cur = the rest
            tail.next = mergeTwoLists(left, right);
            while (tail.next != null) tail = tail.next;
        }
    }
    return dummy.next;
}

// Cut the list after 'size' nodes and return the head of the remainder (or null).
private ListNode split(ListNode head, int size) {
    for (int i = 1; head != null && i < size; i++) head = head.next;
    if (head == null) return null;
    ListNode rest = head.next;
    head.next = null;
    return rest;
}
```

**Why not quicksort?** Quicksort needs random access to pick good pivots and swap elements, and on
a list a bad pivot gives O(n²). It's also unstable. Merge sort on a list is O(n log n) worst case,
stable, and needs no extra array, because the merge just relinks nodes.

### Insertion Sort List (LC 147)

```java
// LC 147: O(n^2), but stable, in place, and great on nearly sorted input.
public ListNode insertionSortList(ListNode head) {
    ListNode dummy = new ListNode();                 // the sorted list grows behind this
    ListNode cur = head;
    while (cur != null) {
        ListNode next = cur.next;
        ListNode prev = dummy;
        while (prev.next != null && prev.next.val <= cur.val) prev = prev.next;   // <= : stable
        cur.next = prev.next;
        prev.next = cur;
        cur = next;
    }
    return dummy.next;
}
```

It's O(n²), but in place, stable and adaptive: nearly sorted input is fast. That's also why
`Arrays.sort`/TimSort uses insertion sort for tiny runs. Prefer merge sort for anything large.

---

## 2.6 Technique 6 — Middle, reverse, weave ⭐

**Trigger:** the problem pairs the i-th node from the front with the i-th node from the back
(`L0 Ln L1 Ln-1`, palindrome, twin sums), with O(1) space required.

**Core idea:** a singly linked list can't walk backwards, so **make the back half walk
forwards**:
1. find the first middle;
2. reverse the half after it;
3. walk both halves together.

### Reorder List (LC 143)

```java
// LC 143: L0 -> Ln -> L1 -> Ln-1 -> ...  = find middle + reverse back half + weave.
public void reorderList(ListNode head) {
    if (head == null || head.next == null) return;
    ListNode mid = middleNodeFirst(head);
    ListNode second = reverseList(mid.next);    // reverse the back half ...
    mid.next = null;                            // ... and cut it off
    ListNode first = head;
    while (second != null) {                    // weave: first, second, first, second ...
        ListNode n1 = first.next, n2 = second.next;
        first.next = second;
        second.next = n1;
        first = n1;
        second = n2;
    }
}
```

```text
1 -> 2 -> 3 -> 4 -> 5
first half: 1 -> 2 -> 3      second half reversed: 5 -> 4
weave:      1 -> 5 -> 2 -> 4 -> 3
```

### Palindrome Linked List (LC 234) and Maximum Twin Sum (LC 2130)

```java
// LC 234 in O(1) space, leaving the caller's list exactly as it was.
public boolean isPalindrome(ListNode head) {
    if (head == null || head.next == null) return true;
    ListNode mid = middleNodeFirst(head);
    ListNode secondHalf = reverseList(mid.next);
    boolean palindrome = true;
    for (ListNode p = head, q = secondHalf; q != null; p = p.next, q = q.next) {
        if (p.val != q.val) {
            palindrome = false;
            break;
        }
    }
    mid.next = reverseList(secondHalf);   // restore: never leave an input half-reversed
    return palindrome;
}

// LC 2130: even length n; twin of node i is node n - 1 - i. Maximum twin sum.
public int pairSum(ListNode head) {
    ListNode mid = middleNodeFirst(head);
    ListNode second = reverseList(mid.next);
    int best = Integer.MIN_VALUE;
    for (ListNode p = head, q = second; q != null; p = p.next, q = q.next) {
        best = Math.max(best, p.val + q.val);
    }
    mid.next = reverseList(second);
    return best;
}
```

**Restore the input.** Both functions reverse the second half back before returning. The caller
passed you *their* list, and returning it half-reversed is a silent bug that interviewers notice.
It costs one extra O(n) pass. Stating "I'll restore the list" earns points even if you're short on time.

**Complexity:** O(n) time, O(1) space. The simpler O(n)-space alternatives are to copy the values into an
`ArrayList` and use two pointers, or to push them on a stack. Mention them first, then optimise.

---

## 2.7 Technique 7 — Two lists at once

### Add Two Numbers (LC 2)

**Approach.** Digits are stored least significant first, the same order you add by hand. So
walk both lists together with a carry, and keep going while **either list or the carry** remains.

```java
// LC 2: digits stored least significant first; return the sum in the same form.
public ListNode addTwoNumbers(ListNode l1, ListNode l2) {
    ListNode dummy = new ListNode(), tail = dummy;
    int carry = 0;
    while (l1 != null || l2 != null || carry != 0) {   // 'carry != 0' handles 5 + 5 = 10
        int sum = carry;
        if (l1 != null) { sum += l1.val; l1 = l1.next; }
        if (l2 != null) { sum += l2.val; l2 = l2.next; }
        tail.next = new ListNode(sum % 10);
        tail = tail.next;
        carry = sum / 10;
    }
    return dummy.next;
}
```

**The `carry != 0` in the loop condition** handles the final carry: `5 + 5` must produce
`0 -> 1`. Lists of different lengths need no special code: a missing digit is a 0.

### Add Two Numbers II (LC 445) — most significant digit first

**Approach.** You can't add from the left. Either reverse both lists (and restore them), or push
the digits onto stacks so they pop least significant first. Build the result by **prepending**,
since the digits come out in reverse.

```java
// LC 445: most significant digit first, inputs must not be modified. Stacks reverse the order.
public ListNode addTwoNumbersII(ListNode l1, ListNode l2) {
    Deque<Integer> s1 = new ArrayDeque<>(), s2 = new ArrayDeque<>();
    for (ListNode p = l1; p != null; p = p.next) s1.push(p.val);
    for (ListNode p = l2; p != null; p = p.next) s2.push(p.val);
    ListNode head = null;
    int carry = 0;
    while (!s1.isEmpty() || !s2.isEmpty() || carry != 0) {
        int sum = carry + (s1.isEmpty() ? 0 : s1.pop()) + (s2.isEmpty() ? 0 : s2.pop());
        head = new ListNode(sum % 10, head);   // PREPEND: digits come out least significant first
        carry = sum / 10;
    }
    return head;
}
```

### Intersection of Two Linked Lists (LC 160)

**Approach.** Two pointers walk their own list, then **switch to the other list's head**. Both end
up walking `lenA + lenB` nodes, which lines them up at the shared part.

```java
// LC 160: the first shared node, or null. O(n + m) time, O(1) space, no length counting.
public ListNode getIntersectionNode(ListNode headA, ListNode headB) {
    ListNode a = headA, b = headB;
    while (a != b) {
        a = (a == null) ? headB : a.next;   // at the end of A, continue at the start of B
        b = (b == null) ? headA : b.next;   // and vice versa
    }
    return a;                               // the meeting node, or null (both ended together)
}
```

**Why it works:** say list A has `a` unique nodes, B has `b`, and they share a tail of `c` nodes.
- Pointer A walks `a + c`, switches, then walks `b` more: it reaches the first shared node after `a + c + b` steps.
- Pointer B walks `b + c + a`: the same number of steps.
- If there's no shared tail (`c = 0`), both become `null` after `a + b` steps, at the same time, and the loop ends with `null`.

**Complexity:** O(a + b + c) time, O(1) space. The "compute both lengths, advance the longer one by
the difference" approach is equally good, and easier to explain if you blank on this one.

---

## 2.8 Technique 8 — Hashing and cloning

Not every linked-list problem must be O(1) space. A hash map often turns a fiddly pointer
problem into two simple passes. Give that answer first, then improve it if asked.

### Remove duplicates from an unsorted list

```java
// Remove later duplicates from an UNSORTED list: a set of seen values, O(n) time and space.
public ListNode removeDuplicatesUnsorted(ListNode head) {
    Set<Integer> seen = new HashSet<>();
    ListNode dummy = new ListNode(0, head), prev = dummy;
    while (prev.next != null) {
        if (seen.add(prev.next.val)) prev = prev.next;   // first time: keep it
        else prev.next = prev.next.next;                 // seen before: unlink it
    }
    return dummy.next;
}
```

**Follow-up:** with no extra memory, use two loops (for each node, delete later equal
nodes), which is O(n²). Or sort first (2.5) and then remove adjacent duplicates, but that changes the order.

### Copy List with Random Pointer (LC 138)

Each node has a `next` and a `random` pointer (to any node, or `null`). Return a deep copy in
which no pointer refers to an original node.

```java
class Node {
    int val;
    Node next, random;

    Node(int val) { this.val = val; }
}

// LC 138, version 1: a map from original node to its copy. O(n) time, O(n) space.
public Node copyRandomList(Node head) {
    Map<Node, Node> copyOf = new HashMap<>();
    for (Node cur = head; cur != null; cur = cur.next) copyOf.put(cur, new Node(cur.val));
    for (Node cur = head; cur != null; cur = cur.next) {
        copyOf.get(cur).next = copyOf.get(cur.next);       // get(null) is null: tails just work
        copyOf.get(cur).random = copyOf.get(cur.random);
    }
    return copyOf.get(head);
}

// Version 2: interleave the copies into the original list. O(n) time, O(1) extra space.
public Node copyRandomListInterleaved(Node head) {
    if (head == null) return null;
    for (Node cur = head; cur != null; cur = cur.next.next) {   // 1. A -> A' -> B -> B' -> ...
        Node copy = new Node(cur.val);
        copy.next = cur.next;
        cur.next = copy;
    }
    for (Node cur = head; cur != null; cur = cur.next.next) {   // 2. A'.random = A.random's copy
        if (cur.random != null) cur.next.random = cur.random.next;
    }
    Node copyHead = head.next;
    for (Node cur = head; cur != null; cur = cur.next) {        // 3. unweave the two lists
        Node copy = cur.next;
        cur.next = copy.next;
        copy.next = (copy.next != null) ? copy.next.next : null;
    }
    return copyHead;
}
```

**Version 1** is the one to derive live: pass 1 creates every copy, so pass 2 can wire any
pointer, forwards or backwards, with a map lookup.

**Version 2** removes the map by storing each copy **right after its original**, so the
original's `random.next` *is* the copy of `random`:

```text
original:        A -> B -> C          A.random = C
interleaved:     A -> A' -> B -> B' -> C -> C'
A'.random = A.random.next = C'
unweave:         A -> B -> C          A' -> B' -> C'
```

Step 3 must restore the original list completely, because callers own it.

---

# Part 3 — Design Problems

## 3.1 LRU Cache ⭐⭐

**LC 146.** `get(key)` and `put(key, value)` in O(1); when full, evict the **least recently
used** key. This is one of the most asked design questions at every level.

**Approach.** You need two things at once:
- **find a key in O(1)**, which means a `HashMap<Integer, Node>`;
- **order keys by recency and move any key to the front in O(1)**, which means a doubly linked list.

The map points *into* the list. That's precisely the "delete a node you hold" case where a doubly
linked list is O(1).

```text
map:  { 1 -> n1, 3 -> n3, 7 -> n7 }

head <-> [7] <-> [1] <-> [3] <-> tail
 (most recently used)        (least recently used: evicted next)
```

```java
// LC 146: HashMap for O(1) lookup + doubly linked list for O(1) "move to front" and "evict oldest".
class LRUCache {
    private static final class Node {
        int key, value;
        Node prev, next;

        Node(int key, int value) { this.key = key; this.value = value; }
    }

    private final int capacity;
    private final Map<Integer, Node> map = new HashMap<>();
    private final Node head = new Node(0, 0);   // sentinel on the most-recently-used side
    private final Node tail = new Node(0, 0);   // sentinel on the least-recently-used side

    public LRUCache(int capacity) {
        this.capacity = capacity;
        head.next = tail;
        tail.prev = head;
    }

    public int get(int key) {
        Node node = map.get(key);
        if (node == null) return -1;
        moveToFront(node);                      // a read counts as a use
        return node.value;
    }

    public void put(int key, int value) {
        Node node = map.get(key);
        if (node != null) {                     // update: never evicts
            node.value = value;
            moveToFront(node);
            return;
        }
        if (map.size() == capacity) {
            Node lru = tail.prev;
            unlink(lru);
            map.remove(lru.key);                // this is why the node stores its key
        }
        node = new Node(key, value);
        map.put(key, node);
        addFront(node);
    }

    private void addFront(Node n) {
        n.prev = head;
        n.next = head.next;
        head.next.prev = n;
        head.next = n;
    }

    private void unlink(Node n) {
        n.prev.next = n.next;
        n.next.prev = n.prev;
    }

    private void moveToFront(Node n) {
        unlink(n);
        addFront(n);
    }
}
```

**The details interviewers check:**
- `get` also counts as a use, so it moves the node to the front;
- `put` on an existing key **updates** the value and moves the node, and never evicts;
- the node stores its **key**, because eviction finds the node via the list but must also remove
  it from the map;
- sentinels remove every null check.

**In real Java code:** `LinkedHashMap` with `accessOrder = true` and an overridden
`removeEldestEntry` is an LRU cache in about five lines: it's the same HashMap-plus-doubly-linked-list
design, built in. Mention it after writing the manual version. For production caches, use
Caffeine.

## 3.2 LFU Cache

**LC 460.** Evict the **least frequently used** key; ties go to the **least recently used** among
them. Everything O(1).

**Approach.**
- Each frequency gets its own LRU list (`freq → NodeList`).
- `minFreq` tracks the lowest frequency currently present.
- A hit moves the node from list `f` to list `f + 1`. If list `f` was the minimum and is now empty, `minFreq` becomes `f + 1`.
- A new key always starts at frequency 1, so `minFreq = 1`.

```text
minFreq = 1
freq 1:  head <-> [9] <-> [4] <-> tail       <- evict from here, oldest first (4)
freq 3:  head <-> [2] <-> tail
nodes: { 9 -> ..., 4 -> ..., 2 -> ... }
```

```java
// LC 460: evict the least FREQUENTLY used key; ties go to the least recently used. Everything O(1).
class LFUCache {
    private static final class Node {
        int key, value, freq = 1;
        Node prev, next;

        Node(int key, int value) { this.key = key; this.value = value; }
    }

    private static final class NodeList {                 // sentinel-based list; most recent at the front
        final Node head = new Node(0, 0), tail = new Node(0, 0);
        int size;

        NodeList() {
            head.next = tail;
            tail.prev = head;
        }

        void addFront(Node n) {
            n.prev = head;
            n.next = head.next;
            head.next.prev = n;
            head.next = n;
            size++;
        }

        void remove(Node n) {
            n.prev.next = n.next;
            n.next.prev = n.prev;
            size--;
        }

        Node removeLast() {
            Node n = tail.prev;
            remove(n);
            return n;
        }
    }

    private final int capacity;
    private final Map<Integer, Node> nodes = new HashMap<>();
    private final Map<Integer, NodeList> byFreq = new HashMap<>();   // frequency -> its own LRU list
    private int minFreq;

    public LFUCache(int capacity) { this.capacity = capacity; }

    public int get(int key) {
        Node node = nodes.get(key);
        if (node == null) return -1;
        touch(node);
        return node.value;
    }

    public void put(int key, int value) {
        if (capacity == 0) return;
        Node node = nodes.get(key);
        if (node != null) {
            node.value = value;
            touch(node);
            return;
        }
        if (nodes.size() == capacity) {
            Node evicted = byFreq.get(minFreq).removeLast();   // lowest frequency, oldest among ties
            nodes.remove(evicted.key);
        }
        node = new Node(key, value);
        nodes.put(key, node);
        byFreq.computeIfAbsent(1, f -> new NodeList()).addFront(node);
        minFreq = 1;                                           // a new key always has the lowest count
    }

    private void touch(Node node) {                            // move from list freq to list freq + 1
        NodeList list = byFreq.get(node.freq);
        list.remove(node);
        if (node.freq == minFreq && list.size == 0) minFreq++;
        node.freq++;
        byFreq.computeIfAbsent(node.freq, f -> new NodeList()).addFront(node);
    }
}
```

**Why `minFreq` never needs a search:** it can only change in two ways.
- `touch` raises one node's frequency by exactly one, so the minimum rises by at most one, and only if its list emptied.
- `put` of a new key sets the minimum to 1.

Eviction happens only right before inserting a new key, so after an eviction `minFreq` is
reset to 1 anyway.

## 3.3 Browser History

**LC 1472.** `visit(url)` clears the forward history, and `back(steps)`/`forward(steps)` move at most
that far. It's a doubly linked list with a cursor.

```java
// LC 1472: a doubly linked list of pages; visiting a new page drops the forward history in O(1).
class BrowserHistory {
    private static final class Page {
        final String url;
        Page prev, next;

        Page(String url) { this.url = url; }
    }

    private Page current;

    public BrowserHistory(String homepage) { current = new Page(homepage); }

    public void visit(String url) {
        Page page = new Page(url);
        current.next = page;           // the old forward chain becomes unreachable: GC'd
        page.prev = current;
        current = page;
    }

    public String back(int steps) {
        while (steps-- > 0 && current.prev != null) current = current.prev;
        return current.url;
    }

    public String forward(int steps) {
        while (steps-- > 0 && current.next != null) current = current.next;
        return current.url;
    }
}
```

`visit` simply overwrites `current.next`: the whole forward chain becomes unreachable and
is garbage-collected. That's O(1) "clear forward history". An `ArrayList` plus an index plus a "logical end"
is an equally good answer, with O(1) per step for `back`/`forward` instead of O(steps).

## 3.4 Flatten a Multilevel Doubly Linked List

**LC 430.** Nodes may have a `child` list, recursively. Flatten everything into one level, in
depth-first order: a child list comes right after its parent, before the parent's `next`.

```java
class Node {
    int val;
    Node prev, next, child;

    Node(int val) { this.val = val; }
}

// LC 430: depth-first flattening; a stack remembers where to resume after each child list.
public Node flatten(Node head) {
    Deque<Node> resume = new ArrayDeque<>();
    for (Node cur = head; cur != null; cur = cur.next) {
        if (cur.child != null) {
            if (cur.next != null) resume.push(cur.next);   // come back here later
            cur.next = cur.child;
            cur.child.prev = cur;
            cur.child = null;
        } else if (cur.next == null && !resume.isEmpty()) {
            Node back = resume.pop();                      // end of a child list: resume the parent
            cur.next = back;
            back.prev = cur;
        }
    }
    return head;
}
```

**Approach.** Walk the list. On a node with a child:
1. remember its `next` on a stack;
2. splice the child list in, fixing `prev` pointers and clearing `child`.

When you reach the end of any list and the stack isn't empty, splice the remembered node back in. The stack
replaces recursion, so deep nesting can't overflow the call stack.

## 3.5 Skip lists — linked lists with express lanes

A sorted linked list has O(n) search. A **skip list** adds "express lanes":
- every node is on level 0;
- about half are also on level 1, a quarter on level 2, and so on (decided by coin flips);
- search starts at the top level, runs right while the next value is smaller, and drops down one level when it would overshoot.

```text
level 2:  head ---------------------------> 30 ----------------------> null
level 1:  head ----------> 12 ------------> 30 ----------> 47 -------> null
level 0:  head --> 5 ----> 12 --> 19 -----> 30 --> 41 ---> 47 --> 52 -> null
search 41: level 2 to 30, level 1 (47 is too big) drop, level 0: 41
```

**LC 1206 Design Skiplist**:

```java
// LC 1206: a sorted linked list with "express lanes". Expected O(log n) search, add and erase.
class Skiplist {
    private static final int MAX_LEVEL = 16;

    private static final class Node {
        final int val;
        final Node[] next;                      // next[i] = successor on level i

        Node(int val, int levels) {
            this.val = val;
            this.next = new Node[levels];
        }
    }

    private final Node head = new Node(Integer.MIN_VALUE, MAX_LEVEL);   // sentinel on every level
    private final Random random;
    private int levels = 1;                     // levels currently in use

    public Skiplist() { this(new Random()); }

    Skiplist(Random random) { this.random = random; }   // inject a seeded Random in tests

    public boolean search(int target) {
        Node cur = head;
        for (int lv = levels - 1; lv >= 0; lv--) {       // run right while the next value is
            while (cur.next[lv] != null && cur.next[lv].val < target) cur = cur.next[lv];
        }                                                // smaller, then drop a level
        cur = cur.next[0];
        return cur != null && cur.val == target;
    }

    public void add(int num) {
        Node[] update = predecessors(num);
        int height = randomHeight();
        if (height > levels) {
            for (int lv = levels; lv < height; lv++) update[lv] = head;
            levels = height;
        }
        Node node = new Node(num, height);
        for (int lv = 0; lv < height; lv++) {            // splice into each of its levels
            node.next[lv] = update[lv].next[lv];
            update[lv].next[lv] = node;
        }
    }

    public boolean erase(int num) {
        Node[] update = predecessors(num);
        Node target = update[0].next[0];
        if (target == null || target.val != num) return false;
        for (int lv = 0; lv < levels && update[lv].next[lv] == target; lv++) {
            update[lv].next[lv] = target.next[lv];       // unlink from every level it is on
        }
        while (levels > 1 && head.next[levels - 1] == null) levels--;
        return true;
    }

    private Node[] predecessors(int num) {               // last node < num on every level
        Node[] update = new Node[MAX_LEVEL];
        Node cur = head;
        for (int lv = levels - 1; lv >= 0; lv--) {
            while (cur.next[lv] != null && cur.next[lv].val < num) cur = cur.next[lv];
            update[lv] = cur;
        }
        return update;
    }

    private int randomHeight() {                         // height h with probability 1 / 2^h
        int h = 1;
        while (h < MAX_LEVEL && random.nextBoolean()) h++;
        return h;
    }
}
```

**Complexity:** expected O(log n) for search, add and erase, and expected O(n) space (about 2n
pointers with p = 1/2). There's no rebalancing, unlike AVL or red-black trees: randomness keeps it
balanced in expectation.

**Where you meet them:**
- Redis sorted sets (`ZADD`/`ZRANGE`);
- LevelDB/RocksDB memtables;
- Java's **`ConcurrentSkipListMap`**/`ConcurrentSkipListSet`: a sorted concurrent map, because skip lists can be updated with CAS on individual links, which is far easier than a lock-free balanced tree.

## 3.6 Linked lists inside the JDK

Knowing where the standard library uses lists makes for strong follow-up answers:

| Class | How it uses linked nodes |
|---|---|
| `HashMap` | each bucket is a singly linked chain of entries. A chain of 8+ entries (once the table has 64+ buckets) becomes a red-black tree, and turns back into a chain when a resize leaves it with 6 or fewer |
| `LinkedHashMap` | a `HashMap` plus a **doubly linked list** through all entries: insertion or access order, and LRU via `removeEldestEntry` |
| `LinkedList` | a doubly linked list (1.3) |
| `LinkedBlockingQueue` | linked nodes with two locks (one for put, one for take), so producers and consumers don't contend |
| `ConcurrentLinkedQueue` | the Michael–Scott **lock-free** linked queue: links are updated with CAS |
| `AbstractQueuedSynchronizer` | waiting threads form a doubly linked (CLH-style) queue. That's what `ReentrantLock`, `Semaphore` and `CountDownLatch` park on |
| `ConcurrentSkipListMap` | a skip list (3.5) |

The Java notebook covers several of these in depth: [HashMap internals](#java/learn/hashmap-internals),
[LinkedHashMap](#java/learn/hashset-and-linkedhashmap) and
[LinkedList vs ArrayDeque](#java/learn/linkedlist-vector-stack).

---

# Part 4 — Solving Any Linked List Question

## 4.1 The decision procedure

**Step 1: map the wording to a technique.**

| The problem says… | Reach for |
|---|---|
| remove / insert / partition; "the head may change" | **dummy node** (2.1) |
| reverse, "in groups of k", "between positions" | **reversal** (2.2) |
| middle, cycle, loop, "where does it start", repeated value in `[1, n]` | **fast & slow** (2.3) |
| "n-th from the end", "last k", rotate | **fixed gap** (2.4) |
| sorted lists, merge, "sort in O(n log n)" | **merge & split** (2.5) |
| pair the front with the back: reorder, palindrome, twin | **middle + reverse + weave** (2.6) |
| numbers as digits, two lists meeting | **two lists at once** (2.7) |
| random/arbitrary pointers, unsorted duplicates | **hash map**, then optimise (2.8) |
| O(1) get/put with eviction order | **HashMap + doubly linked list** (3.1) |

**Step 2: state the constraints out loud.** Can I modify the list? Do I have to restore it?
Is O(n) extra space allowed? Can values repeat? Can the list be empty, or have a cycle?

**Step 3: draw it.** Three or four boxes, the pointers you'll keep (`prev`, `cur`, `next`,
`dummy`, `slow`, `fast`), and the state *after one iteration*. Linked-list bugs are visible on
paper and invisible in your head.

**Step 4: write the invariant as a comment before the loop**:

```java
// prev is the last node of the finished (reversed) part; cur is the first unprocessed node
// less/more are the tails of the two lists being built; both lists end in null at the end
// lag is exactly n + 1 nodes behind lead
```

**Step 5: walk the code on 0, 1 and 2 nodes**, then on one normal case.

## 4.2 The pointer-safety checklist

Before you say "done", check every line that writes a `.next`:
1. **Saved before overwritten?** If `x.next` is about to change, is the old value saved if you still need it?
2. **Null-safe?** Every `a.b.c` needs `a != null && a.b != null`. Two-step pointers check `fast != null && fast.next != null`.
3. **Terminated?** When you rebuild lists from existing nodes, the last node's `next` must be set to `null` (partition, odd-even, split). Otherwise you get cycles.
4. **Head returned correctly?** If the head can change, return `dummy.next` or the new head, not the old `head`.
5. **Input restored?** If you reversed part of the caller's list just to inspect it, reverse it back.
6. **Nodes vs values?** Compare nodes with `==` (cycles, intersections), values with `==` on `int` (or `equals` on objects).
7. **Termination of loops?** Each iteration must move some pointer forward, or make the list shorter.

## 4.3 Edge cases to test every time

| Case | Why it breaks code |
|---|---|
| empty list (`null`) | `head.next` throws |
| one node | the head is also the tail, the middle and the n-th from the end |
| two nodes | the middle choice matters, and swaps or reversals touch both ends |
| even and odd lengths | middle, reorder, palindrome and odd-even all differ |
| the operation hits the head | needs a dummy or special handling |
| the operation hits the tail | the tail pointer must move, and `next` must become `null` |
| all values equal / duplicates | `<` vs `<=`, and "don't advance after deleting" |
| `k` = 1, `k` = length, `k` > length | k-group, rotate, n-th from the end |
| a cycle in the input (if allowed) | any `while (cur != null)` loop never ends |

## 4.4 Practice ladder

Do these in order. **Rule: implement each one before looking at a solution, and re-solve
anything you needed help with three days later.**

**Foundation**
- Design Linked List (707)
- Reverse Linked List (206), iteratively *and* recursively
- Middle of the Linked List (876)
- Merge Two Sorted Lists (21)
- Remove Linked List Elements (203)
- Remove Duplicates from Sorted List (83)
- Linked List Cycle (141)
- Convert Binary Number in a Linked List to Integer (1290)

**Core techniques — do all of these**
- Remove Nth Node From End of List (19)
- Linked List Cycle II (142) ⭐
- Palindrome Linked List (234) ⭐
- Intersection of Two Linked Lists (160)
- Add Two Numbers (2)
- Odd Even Linked List (328)
- Partition List (86)
- Remove Duplicates from Sorted List II (82)
- Swap Nodes in Pairs (24)
- Rotate List (61)
- Delete the Middle Node (2095)
- Maximum Twin Sum (2130)

**Harder**
- Reverse Linked List II (92) ⭐
- Reorder List (143) ⭐
- Sort List (148) ⭐, top-down then bottom-up
- Add Two Numbers II (445)
- Copy List with Random Pointer (138) ⭐, both versions
- Find the Duplicate Number (287) ⭐
- Happy Number (202)
- Insertion Sort List (147)
- Flatten a Multilevel Doubly Linked List (430)
- Split Linked List in Parts (725)
- Next Greater Node in Linked List (1019) (monotonic stack on a list)
- Remove Zero Sum Consecutive Nodes (1171) (prefix sums + a hash map)

**Hard**
- Reverse Nodes in k-Group (25) ⭐⭐
- Merge k Sorted Lists (23) ⭐⭐
- LRU Cache (146) ⭐⭐
- LFU Cache (460) ⭐
- Design Skiplist (1206)
- All O`one Data Structure (432) (doubly linked list of count buckets)

## 4.5 Suggested study sequence

**Day 1: mechanics.** Write `ListNode`, `build`, `show`, `MyLinkedList` and the doubly linked
list with sentinels from memory, twice. Reverse a list iteratively until you can do it without
thinking, then recursively.

**Days 2–3: the techniques.** Dummy node, fast & slow, fixed gap, merge. Do the Foundation and
Core lists. After each problem, write one line in a notebook: *trigger → technique*.

**Days 4–5: combinations.** Reorder, palindrome, sort, k-group, copy with random pointer. These
are the problems that combine two or three techniques, and they're the ones that get asked at SDE-2 level.

**Day 6: design.** LRU from scratch in under 15 minutes, then LFU. Explain why each needs a
doubly linked list.

**Before every interview:** re-read the one-page summary (4.7) and the pointer-safety checklist (4.2).

## 4.6 The mistakes that cost people offers

1. **Losing the rest of the list**: overwriting `cur.next` before saving it.
2. **No dummy node** when the head can change, leading to special-case spaghetti and a missed `head == null` case.
3. **Advancing after a deletion**, which skips the node that just moved up.
4. **Not terminating rebuilt lists** (`tail.next = null`), which creates cycles your tests then loop on forever.
5. **The wrong middle** for splitting: the second middle makes 2-node lists split 2 + 0, and merge sort never terminates.
6. **`fast.next.next` without checking `fast.next`**: a `NullPointerException` on even lengths.
7. **Comparing values instead of nodes** in cycle or intersection problems.
8. **Forgetting the final carry** in Add Two Numbers.
9. **Not maintaining the tail pointer** when deleting the last node (707), or not updating `prev`
   pointers in doubly linked code.
10. **Leaving the caller's list modified** (palindrome, twin sum) without saying so, or without restoring it.
11. **Recursion on 10⁵ nodes**, causing a `StackOverflowError`. Know the iterative version.
12. **Using `java.util.LinkedList` with `get(i)` in a loop**: O(n²).
13. **Coding before drawing.** Three boxes on paper prevent most of the above.

## 4.7 The one-page summary

```text
NODE          class ListNode { int val; ListNode next; }  + build(...) and show(...) helpers for testing
LOOPS         cur != null        -> visit every node
              cur.next != null   -> stop ON the last node / delete cur.next
              fast != null && fast.next != null -> two-step pointers

DUMMY         dummy = new ListNode(0, head) ... return dummy.next      head may change? use it
              delete: stand on the node BEFORE; after unlinking, don't advance
              rebuilding lists from old nodes: terminate with tail.next = null

REVERSE       next = cur.next; cur.next = prev; prev = cur; cur = next;   return prev
              between: front insertion after 'before';  k-group: reverse with prev = groupNext

FAST/SLOW     middle: second = (fast != null && fast.next != null); first = (fast.next && fast.next.next)
              split for sorting: FIRST middle
              cycle: meet -> restart one pointer at head, both speed 1 -> entrance
              implicit lists: x -> f(x) (happy number, find duplicate)

GAP           lead n + 1 ahead of lag (both from dummy) -> lag before the n-th from the end

MERGE         dummy + tail, attach leftover in one step, <= for stability
              k lists: heap of heads or pairwise, O(N log k)
              sort: first middle, cut, sort halves, merge (bottom-up for O(1) space)

WEAVE         first middle -> reverse second half -> walk both -> RESTORE the input

TWO LISTS     add: loop while l1 || l2 || carry;  intersection: switch heads at the end

DESIGN        LRU = HashMap<key, Node> + doubly linked list with sentinels; node stores its key
              LFU = per-frequency LRU lists + minFreq
              skip list = sorted list + random express lanes, expected O(log n)

ALWAYS        draw 3 boxes; test null, 1, 2 nodes, even/odd; check every .next write
```

Print that block. Read it before every mock interview.
