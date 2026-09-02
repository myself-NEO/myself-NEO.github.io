# 🌳 Trees — The Complete Guide (From Scratch to Advanced)

*A single, self-contained reference for mastering tree-based data structures — built for a Java backend engineer prepping for interviews. Work through it top to bottom once, then use it as a lookup reference.*

---

## Table of Contents

1. [What Is a Tree?](#1-what-is-a-tree)
2. [Core Terminology](#2-core-terminology)
3. [Types of Trees — The Big Picture](#3-types-of-trees--the-big-picture)
4. [Binary Tree Basics](#4-binary-tree-basics)
5. [Tree Traversals](#5-tree-traversals)
6. [The Recursive Mental Model](#6-the-recursive-mental-model)
7. [Basic Properties & Operations](#7-basic-properties--operations)
8. [Path Problems](#8-path-problems)
9. [Binary Search Trees (BST)](#9-binary-search-trees-bst)
10. [Lowest Common Ancestor (LCA)](#10-lowest-common-ancestor-lca)
11. [Tree Construction Problems](#11-tree-construction-problems)
12. [Level-Order Pattern Problems](#12-level-order-pattern-problems)
13. [AVL Trees (Self-Balancing)](#13-avl-trees-self-balancing)
14. [Red-Black Trees (Concept Level)](#14-red-black-trees-concept-level)
15. [Heaps](#15-heaps)
16. [Tries (Prefix Trees)](#16-tries-prefix-trees)
17. [Segment Trees](#17-segment-trees)
18. [Fenwick Tree / Binary Indexed Tree](#18-fenwick-tree--binary-indexed-tree)
19. [Bonus: Sparse Table & Sqrt Decomposition](#19-bonus-sparse-table--sqrt-decomposition)
20. [N-ary Trees](#20-n-ary-trees)
21. [Complexity Cheat Sheet](#21-complexity-cheat-sheet)
22. [How to Approach ANY Tree Problem](#22-how-to-approach-any-tree-problem)
23. [Curated Practice List](#23-curated-practice-list)
24. [Common Mistakes & Interview Tips](#24-common-mistakes--interview-tips)

---

## 1. What Is a Tree?

A **tree** is a hierarchical, non-linear data structure made of **nodes** connected by **edges**, where:
- There's exactly **one root** node (the top).
- Every node except the root has exactly **one parent**.
- There are **no cycles** — you can't follow edges and come back to where you started.

In graph terms: **a tree is a connected, acyclic graph.** Every tree is a graph, but not every graph is a tree (graphs can have cycles, multiple components, or nodes with multiple parents).

**Real-world analogies:**
- A file system — folders contain files/folders, each file has exactly one parent folder.
- An org chart — each employee has one manager, a manager has multiple reports.
- The HTML DOM — every element has one parent, can have many children.
- A family tree — genealogical descent.

**Why trees matter for interviews:** Trees are the single most common non-array/string topic in coding interviews, because they force you to practice **recursion**, **divide-and-conquer thinking**, and **choosing the right traversal order** — skills that transfer directly to graphs, dynamic programming, and real system design (indexes, file systems, routing tables, ASTs in compilers).

---

## 2. Core Terminology

```
                 1              <- Root (Level 0)
               /   \
              2     3           <- Level 1
             / \      \
            4   5      6        <- Level 2 (all leaves)
```

| Term | Meaning |
|---|---|
| **Node** | A single element holding data (e.g., `1`, `2`, `3`...) |
| **Root** | The topmost node with no parent (`1`) |
| **Edge** | The connection between a parent and child |
| **Parent** | A node with at least one child (e.g., `2` is the parent of `4` and `5`) |
| **Child** | A node directly connected below another (e.g., `4` is a child of `2`) |
| **Sibling** | Nodes sharing the same parent (`4` and `5`) |
| **Leaf** | A node with no children (`4`, `5`, `6`) |
| **Internal node** | Any node with at least one child (`1`, `2`, `3`) |
| **Ancestor** | Any node on the path from the root to a given node (`1` and `2` are ancestors of `4`) |
| **Descendant** | Any node reachable going downward from a given node |
| **Subtree** | A node plus everything below it, treated as its own tree |
| **Depth of a node** | Number of edges from the **root** to that node (depth of `1` = 0, depth of `4` = 2) |
| **Height of a node** | Number of edges on the **longest path from that node down to a leaf** (height of `1` = 2, height of a leaf = 0) |
| **Height of the tree** | Height of the root |
| **Degree of a node** | Number of children it has |

**The #1 source of confusion: depth vs. height.**
- **Depth** is measured **top-down** (root → node).
- **Height** is measured **bottom-up** (node → deepest leaf).
- Depth of the root is always 0. Height of a leaf is always 0.
- Some textbooks count **nodes** instead of **edges** (making a single-node tree have height 1, not 0). **Always clarify the convention with your interviewer** — it rarely changes the algorithm, just the +1/-1 in your base case.

---

## 3. Types of Trees — The Big Picture

Before diving deep, here's the map of everything this guide covers and where each structure is actually used:

| Tree Type | What it optimizes for | Real usage |
|---|---|---|
| **Binary Tree** | General hierarchical data | Expression trees, decision trees |
| **Binary Search Tree (BST)** | Ordered data, fast search | In-memory ordered maps |
| **AVL Tree** | Guaranteed O(log n) with strict balance | Databases needing frequent lookups |
| **Red-Black Tree** | O(log n) with cheaper rebalancing than AVL | `TreeMap`/`TreeSet` in Java, `std::map` in C++ |
| **Heap** | Fast access to min/max element | Priority queues, scheduling, Dijkstra's algorithm |
| **Trie** | Fast prefix search over strings | Autocomplete, spell-checkers, IP routing |
| **Segment Tree** | Range queries + range updates | Competitive programming, interval problems |
| **Fenwick Tree (BIT)** | Prefix sums with updates, less memory than segment tree | Same as above, simpler use cases |
| **N-ary Tree** | Nodes with more than 2 children | File systems, DOM trees, category hierarchies |

We'll build up from the simplest (binary trees) to the specialized ones, in that order.

---

## 4. Binary Tree Basics

A **binary tree** restricts every node to **at most 2 children**, conventionally called `left` and `right`.

**Java node definition** (you'll reuse this everywhere):

```java
class TreeNode {
    int val;
    TreeNode left;
    TreeNode right;

    TreeNode(int val) {
        this.val = val;
    }
}
```

### Types of binary trees (by shape)

```
Full Binary Tree                Complete Binary Tree
(every node has 0 or 2          (every level full except
 children -- never exactly 1)    last, filled left to right)

        1                              1
       / \                            / \
      2   3                          2   3
     / \                            / \  /
    4   5                          4  5 6


Perfect Binary Tree              Degenerate / Skewed Tree
(all internal nodes have 2       (each node has only 1 child --
 children, all leaves same       behaves like a linked list,
 depth)                           worst case for BSTs)

        1                              1
       / \                              \
      2   3                              2
     / \  / \                             \
    4  5 6   7                             3
                                             \
                                              4
```

Why this matters: a **skewed tree** degrades every "should be O(log n)" operation to **O(n)** — this is the entire motivation for AVL/Red-Black trees later in this guide.

### Representations

1. **Linked representation** (what we use 95% of the time): each node holds pointers to its children, as in `TreeNode` above.
2. **Array representation** (used for **complete** binary trees, especially heaps): for a node at index `i` (0-indexed),
   - left child → `2*i + 1`
   - right child → `2*i + 2`
   - parent → `(i - 1) / 2`

   This works *only* because a complete tree has no "gaps" — every level is filled left to right, so index arithmetic alone tells you the shape. We'll use this directly in the Heaps section.

---

## 5. Tree Traversals

Traversal = the order in which you visit every node. This is the single most important skill in this guide — nearly every tree problem is "pick the right traversal, then add logic."

There are two families:
- **DFS (Depth-First)**: go as deep as possible before backtracking. Three orders: **preorder, inorder, postorder** — they differ only in *when* you visit the current node relative to its children.
- **BFS (Breadth-First)**: visit level by level, using a queue.

```
        1
       / \
      2   3
     / \
    4   5
```

- **Preorder** (Root → Left → Right): `1, 2, 4, 5, 3`
- **Inorder** (Left → Root → Right): `4, 2, 5, 1, 3`
- **Postorder** (Left → Right → Root): `4, 5, 2, 3, 1`
- **Level order** (BFS): `1, 2, 3, 4, 5`

### 5.1 Preorder

**When to use it:** when you need to process a node *before* its children — e.g., copying a tree, serializing a tree, evaluating a prefix expression.

**Recursive:**
```java
void preorder(TreeNode root, List<Integer> result) {
    if (root == null) return;
    result.add(root.val);
    preorder(root.left, result);
    preorder(root.right, result);
}
```

**Iterative (explicit stack):**
```java
List<Integer> preorderIterative(TreeNode root) {
    List<Integer> result = new ArrayList<>();
    if (root == null) return result;
    Deque<TreeNode> stack = new ArrayDeque<>();
    stack.push(root);
    while (!stack.isEmpty()) {
        TreeNode node = stack.pop();
        result.add(node.val);
        if (node.right != null) stack.push(node.right); // push right FIRST
        if (node.left != null) stack.push(node.left);   // so left pops first
    }
    return result;
}
```
**Why push right before left?** A stack is LIFO — whatever you push last comes out first. We want `left` processed before `right`, so `left` must be on *top*, meaning it must go in *last*.

### 5.2 Inorder

**When to use it:** on a **BST**, inorder traversal visits nodes in **sorted order** — this is the single most useful fact about BSTs in this whole guide.

**Recursive:**
```java
void inorder(TreeNode root, List<Integer> result) {
    if (root == null) return;
    inorder(root.left, result);
    result.add(root.val);
    inorder(root.right, result);
}
```

**Iterative:**
```java
List<Integer> inorderIterative(TreeNode root) {
    List<Integer> result = new ArrayList<>();
    Deque<TreeNode> stack = new ArrayDeque<>();
    TreeNode curr = root;
    while (curr != null || !stack.isEmpty()) {
        while (curr != null) {        // walk all the way left, stacking as you go
            stack.push(curr);
            curr = curr.left;
        }
        curr = stack.pop();           // backtrack to the last unvisited parent
        result.add(curr.val);
        curr = curr.right;            // then explore its right subtree
    }
    return result;
}
```

### 5.3 Postorder

**When to use it:** when children must be processed *before* the parent — e.g., deleting a tree (free children before the node itself), computing height/diameter bottom-up, evaluating a postfix expression.

**Recursive:**
```java
void postorder(TreeNode root, List<Integer> result) {
    if (root == null) return;
    postorder(root.left, result);
    postorder(root.right, result);
    result.add(root.val);
}
```

**Iterative (the elegant trick):**
```java
List<Integer> postorderIterative(TreeNode root) {
    LinkedList<Integer> result = new LinkedList<>();
    if (root == null) return result;
    Deque<TreeNode> stack = new ArrayDeque<>();
    stack.push(root);
    while (!stack.isEmpty()) {
        TreeNode node = stack.pop();
        result.addFirst(node.val);                      // build the answer backwards
        if (node.left != null) stack.push(node.left);
        if (node.right != null) stack.push(node.right);
    }
    return result;
}
```
**The trick:** this is a modified preorder that visits **Root → Right → Left**, and inserting each value at the *front* of the result reverses that order into **Left → Right → Root** — exactly postorder. No need to remember a trickier two-stack algorithm.

### 5.4 Level Order (BFS)

**When to use it:** anything level-by-level — printing level by level, zigzag traversal, right-side view, finding the minimum depth, connecting siblings.

```java
List<List<Integer>> levelOrder(TreeNode root) {
    List<List<Integer>> result = new ArrayList<>();
    if (root == null) return result;
    Queue<TreeNode> queue = new LinkedList<>();
    queue.offer(root);
    while (!queue.isEmpty()) {
        int size = queue.size();          // snapshot: exactly how many nodes are in THIS level
        List<Integer> level = new ArrayList<>();
        for (int i = 0; i < size; i++) {
            TreeNode node = queue.poll();
            level.add(node.val);
            if (node.left != null) queue.offer(node.left);
            if (node.right != null) queue.offer(node.right);
        }
        result.add(level);
    }
    return result;
}
```
**The key line is `int size = queue.size()` taken *before* the inner loop.** This freezes the boundary of the current level even as you enqueue next-level children inside the loop. Forgetting this is the #1 bug in level-order code.

### 5.5 Morris Traversal — O(1) Space (Advanced)

All the traversals above use O(h) space — either the recursion call stack or an explicit stack (h = height of tree). **Morris traversal** achieves inorder traversal in **O(1) extra space** by temporarily turning the tree into a linked structure using unused `right` pointers ("threading"), then undoing it.

```java
List<Integer> morrisInorder(TreeNode root) {
    List<Integer> result = new ArrayList<>();
    TreeNode curr = root;
    while (curr != null) {
        if (curr.left == null) {
            result.add(curr.val);
            curr = curr.right;
        } else {
            // find the inorder predecessor: rightmost node in the left subtree
            TreeNode pred = curr.left;
            while (pred.right != null && pred.right != curr) {
                pred = pred.right;
            }
            if (pred.right == null) {
                pred.right = curr;   // create a temporary thread back to curr
                curr = curr.left;
            } else {
                pred.right = null;   // thread already exists -- remove it (restore tree)
                result.add(curr.val);
                curr = curr.right;
            }
        }
    }
    return result;
}
```
**Interview note:** Morris traversal is a "senior/advanced" topic — it's asked far more often as a follow-up ("can you do this in O(1) space?") than as an opening question. Know that it exists and the core idea (thread the predecessor's right pointer), but don't panic if you can't reproduce it from memory under pressure — the recursive/iterative versions solve 95% of problems.

### 5.6 Which traversal should I use? — Decision Guide

| Need | Traversal |
|---|---|
| Sorted output from a BST | Inorder |
| Copy / serialize a tree, prefix expression | Preorder |
| Delete a tree, compute bottom-up values (height, diameter) | Postorder |
| Anything "level by level" | Level order (BFS) |
| Same as inorder but can't afford O(h) space | Morris |

---

## 6. The Recursive Mental Model

This is the idea that unlocks almost every tree problem. Most tree algorithms follow one shape:

```java
ReturnType solve(TreeNode node) {
    if (node == null) return /* base case value */;

    ReturnType leftResult = solve(node.left);
    ReturnType rightResult = solve(node.right);

    return /* combine leftResult, rightResult, and node.val */;
}
```

**"Trust the recursion."** Don't try to trace through every recursive call in your head — that's how you get stuck. Instead, ask two questions:

1. **What does this function promise to return, for ANY node I call it on?** (e.g., "the height of the subtree rooted at this node")
2. **If I already had correct answers for `node.left` and `node.right`, how would I combine them to get the answer for `node`?**

That's it. If you can answer those two questions, you can write the function — you don't need to simulate the whole recursion.

**Two flavors of information flow:**
- **Bottom-up (postorder-style):** children compute something and hand it up to the parent. Examples: height, diameter, "is balanced", sum of subtree.
- **Top-down (preorder-style):** the parent hands *context* down to children — e.g., "the min/max bound this node must satisfy" (BST validation), "the remaining sum needed" (path sum), "the depth so far."

A large fraction of tree problems are just: *"Is this bottom-up or top-down? What's the base case? What do I combine or pass down?"* — everything from here on is that question applied to a specific goal.

---

## 7. Basic Properties & Operations

These are the "warm-up" problems — every one of them follows the postorder/bottom-up pattern from Section 6, and interviewers use them to check you understand recursion before moving to harder problems.

### 7.1 Height / Maximum Depth

```java
int height(TreeNode root) {
    if (root == null) return 0;
    return 1 + Math.max(height(root.left), height(root.right));
}
```
*(This counts nodes on the longest path, so a single-node tree has height 1. If your interviewer wants edge-count, return `-1` for `null` instead of `0`.)*

### 7.2 Minimum Depth

Careful — this is **not** just "the opposite of max depth." A node with only one child shouldn't count as a leaf for minimum depth purposes:

```java
int minDepth(TreeNode root) {
    if (root == null) return 0;
    if (root.left == null) return 1 + minDepth(root.right);
    if (root.right == null) return 1 + minDepth(root.left);
    return 1 + Math.min(minDepth(root.left), minDepth(root.right));
}
```

### 7.3 Count Total Nodes

```java
int countNodes(TreeNode root) {
    if (root == null) return 0;
    return 1 + countNodes(root.left) + countNodes(root.right);
}
```

### 7.4 Count Leaf Nodes

```java
int countLeaves(TreeNode root) {
    if (root == null) return 0;
    if (root.left == null && root.right == null) return 1;
    return countLeaves(root.left) + countLeaves(root.right);
}
```

### 7.5 Diameter of a Binary Tree

**The problem:** find the length (in edges) of the longest path between *any* two nodes — the path doesn't need to pass through the root.

**The trap:** the diameter at any node is `leftHeight + rightHeight`, but the *overall* answer might come from deep inside the tree, not at the root. The fix: compute height recursively, and update a running maximum *as a side effect* on the way.

```java
class Solution {
    int diameter = 0;

    public int diameterOfBinaryTree(TreeNode root) {
        height(root);
        return diameter;
    }

    private int height(TreeNode node) {
        if (node == null) return 0;
        int leftHeight = height(node.left);
        int rightHeight = height(node.right);
        diameter = Math.max(diameter, leftHeight + rightHeight);   // update global answer
        return 1 + Math.max(leftHeight, rightHeight);              // return height, as promised
    }
}
```
**Interview note:** this "compute one thing, but update a separate global/instance answer along the way" pattern reappears in Section 8.4 (Maximum Path Sum) — it's one of the highest-value patterns in this whole guide.

### 7.6 Check if a Tree Is Height-Balanced

A tree is balanced if, for every node, the heights of its left and right subtrees differ by at most 1.

**Naive approach:** call `height()` at every node → O(n²) worst case (skewed tree).
**Better approach:** compute height and balance simultaneously, short-circuiting with a sentinel value:

```java
class Solution {
    public boolean isBalanced(TreeNode root) {
        return checkHeight(root) != -1;
    }

    private int checkHeight(TreeNode node) {
        if (node == null) return 0;
        int leftHeight = checkHeight(node.left);
        if (leftHeight == -1) return -1;                 // left subtree already unbalanced -- bail out
        int rightHeight = checkHeight(node.right);
        if (rightHeight == -1) return -1;
        if (Math.abs(leftHeight - rightHeight) > 1) return -1;
        return 1 + Math.max(leftHeight, rightHeight);
    }
}
```
This is O(n) — each node is visited once, and `-1` propagates up immediately once imbalance is found anywhere.

### 7.7 Same Tree / Identical Trees

```java
boolean isSameTree(TreeNode p, TreeNode q) {
    if (p == null && q == null) return true;
    if (p == null || q == null) return false;
    return p.val == q.val
        && isSameTree(p.left, q.left)
        && isSameTree(p.right, q.right);
}
```

### 7.8 Symmetric Tree

A tree is symmetric if it's a mirror of itself. This is "same tree" but comparing a subtree against its **mirror**:

```java
boolean isSymmetric(TreeNode root) {
    if (root == null) return true;
    return isMirror(root.left, root.right);
}

boolean isMirror(TreeNode t1, TreeNode t2) {
    if (t1 == null && t2 == null) return true;
    if (t1 == null || t2 == null) return false;
    return t1.val == t2.val
        && isMirror(t1.left, t2.right)   // outer pair
        && isMirror(t1.right, t2.left);  // inner pair
}
```

### 7.9 Invert / Mirror a Binary Tree

```java
TreeNode invertTree(TreeNode root) {
    if (root == null) return null;
    TreeNode temp = root.left;
    root.left = invertTree(root.right);
    root.right = invertTree(temp);
    return root;
}
```

### 7.10 Max / Min Value & Sum of All Nodes

```java
int maxValue(TreeNode root) {
    if (root == null) return Integer.MIN_VALUE;
    return Math.max(root.val, Math.max(maxValue(root.left), maxValue(root.right)));
}

int sumOfNodes(TreeNode root) {
    if (root == null) return 0;
    return root.val + sumOfNodes(root.left) + sumOfNodes(root.right);
}
```

---

## 8. Path Problems

"Path" problems are a distinct category worth grouping together — they all involve tracking a running value (sum, or the path itself) as you move from node to node.

### 8.1 Root-to-Leaf Path Sum (Does one exist?)

```java
boolean hasPathSum(TreeNode root, int targetSum) {
    if (root == null) return false;
    if (root.left == null && root.right == null) {           // leaf check
        return root.val == targetSum;
    }
    return hasPathSum(root.left, targetSum - root.val)
        || hasPathSum(root.right, targetSum - root.val);
}
```

### 8.2 Path Sum II (Return ALL root-to-leaf paths matching the sum)

This introduces **backtracking on a tree** — build a path as you descend, record it at a valid leaf, then undo the last step as you return (so siblings don't see stale state):

```java
List<List<Integer>> pathSum(TreeNode root, int targetSum) {
    List<List<Integer>> result = new ArrayList<>();
    dfs(root, targetSum, new ArrayList<>(), result);
    return result;
}

void dfs(TreeNode node, int remaining, List<Integer> path, List<List<Integer>> result) {
    if (node == null) return;
    path.add(node.val);
    if (node.left == null && node.right == null && remaining == node.val) {
        result.add(new ArrayList<>(path));   // copy -- path will keep changing
    } else {
        dfs(node.left, remaining - node.val, path, result);
        dfs(node.right, remaining - node.val, path, result);
    }
    path.remove(path.size() - 1);            // backtrack
}
```

### 8.3 Path Sum III (ANY path, not necessarily root-to-leaf)

The path can start and end anywhere, as long as it goes downward. Brute force is O(n²) (try every starting node). The **prefix-sum trick** brings it to O(n):

```java
public int pathSum(TreeNode root, int targetSum) {
    Map<Long, Integer> prefixCount = new HashMap<>();
    prefixCount.put(0L, 1);                              // empty prefix
    return dfs(root, 0L, targetSum, prefixCount);
}

private int dfs(TreeNode node, long currSum, int target, Map<Long, Integer> prefixCount) {
    if (node == null) return 0;
    currSum += node.val;
    int count = prefixCount.getOrDefault(currSum - target, 0);  // how many prefixes make a valid path ending here?
    prefixCount.merge(currSum, 1, Integer::sum);
    count += dfs(node.left, currSum, target, prefixCount);
    count += dfs(node.right, currSum, target, prefixCount);
    prefixCount.merge(currSum, -1, Integer::sum);        // backtrack -- this prefix no longer exists once we leave this branch
    return count;
}
```
**Why this works:** if `currSum - target` has appeared before as a prefix sum on this root-to-node path, then the nodes between that earlier point and now sum to exactly `target`. Same idea as the "subarray sum equals K" array problem, just walked over a tree instead of a list.

### 8.4 Binary Tree Maximum Path Sum (Hard)

The path can start and end at *any* nodes, doesn't need to pass through the root, and doesn't need to go through a leaf. This combines the "diameter" trick (Section 7.5) with path sums:

```java
class Solution {
    int maxSum = Integer.MIN_VALUE;

    public int maxPathSum(TreeNode root) {
        maxGain(root);
        return maxSum;
    }

    private int maxGain(TreeNode node) {
        if (node == null) return 0;
        int leftGain = Math.max(maxGain(node.left), 0);   // ignore negative contributions
        int rightGain = Math.max(maxGain(node.right), 0);
        maxSum = Math.max(maxSum, node.val + leftGain + rightGain);  // best path THROUGH this node
        return node.val + Math.max(leftGain, rightGain);  // best path a PARENT can extend (only one branch!)
    }
}
```
**The subtlety:** a path can only continue through a node into **one** child (a path can't branch), so the *returned* value only adds the better of left/right. But the node itself can be a "peak" where both branches meet — that's why `maxSum` considers `left + right + node.val` even though the return value doesn't.

---

## 9. Binary Search Trees (BST)

A **BST** adds one ordering rule to a binary tree: for every node, **everything in the left subtree is smaller, everything in the right subtree is larger** (no duplicates, in the classic definition).

```
          8
        /   \
       3     10
      / \      \
     1   6      14
        / \    /
       4   7  13
```

Inorder traversal of this tree gives `1, 3, 4, 6, 7, 8, 10, 13, 14` — sorted. **This one fact drives almost every BST algorithm.**

### 9.1 Search

```java
TreeNode searchBST(TreeNode root, int val) {
    if (root == null || root.val == val) return root;
    return val < root.val ? searchBST(root.left, val) : searchBST(root.right, val);
}
```
O(h) — O(log n) if balanced, O(n) if skewed. Same complexity story applies to insert and delete below.

### 9.2 Insert

```java
TreeNode insertIntoBST(TreeNode root, int val) {
    if (root == null) return new TreeNode(val);
    if (val < root.val) root.left = insertIntoBST(root.left, val);
    else root.right = insertIntoBST(root.right, val);
    return root;
}
```

### 9.3 Delete — the trickiest of the three

Three cases once you find the node to delete:
1. **Leaf** — just remove it.
2. **One child** — replace the node with its child.
3. **Two children** — replace the node's value with its **inorder successor** (smallest value in the right subtree), then delete that successor from the right subtree.

```java
TreeNode deleteNode(TreeNode root, int key) {
    if (root == null) return null;
    if (key < root.val) {
        root.left = deleteNode(root.left, key);
    } else if (key > root.val) {
        root.right = deleteNode(root.right, key);
    } else {
        // found the node to delete
        if (root.left == null) return root.right;
        if (root.right == null) return root.left;
        TreeNode successor = findMin(root.right);   // smallest in right subtree
        root.val = successor.val;
        root.right = deleteNode(root.right, successor.val);  // remove the duplicate
    }
    return root;
}

TreeNode findMin(TreeNode node) {
    while (node.left != null) node = node.left;
    return node;
}
```
*(You could equally use the inorder **predecessor** — largest value in the left subtree. Either works; successor is the more common convention.)*

### 9.4 Validate BST — the classic trap

**Wrong approach (very common mistake):** only checking `node.val > node.left.val && node.val < node.right.val`. This misses violations from **grandchildren** — a right-left grandchild could be smaller than the root but still bigger than its immediate parent.

**Correct approach:** carry a valid `(lower, upper)` range down through the recursion:

```java
boolean isValidBST(TreeNode root) {
    return validate(root, null, null);
}

boolean validate(TreeNode node, Long lower, Long upper) {
    if (node == null) return true;
    if (lower != null && node.val <= lower) return false;
    if (upper != null && node.val >= upper) return false;
    return validate(node.left, lower, (long) node.val)
        && validate(node.right, (long) node.val, upper);
}
```
Using boxed `Long` (not `int`) for the bounds avoids overflow edge cases when node values sit at `Integer.MIN_VALUE`/`MAX_VALUE`.

**Alternative:** do an inorder traversal and check the output is strictly increasing — simpler to reason about, same O(n) complexity.

### 9.5 Kth Smallest Element in a BST

Inorder traversal visits nodes in sorted order — stop as soon as you've counted `k` nodes:

```java
int kthSmallest(TreeNode root, int k) {
    Deque<TreeNode> stack = new ArrayDeque<>();
    TreeNode curr = root;
    while (curr != null || !stack.isEmpty()) {
        while (curr != null) {
            stack.push(curr);
            curr = curr.left;
        }
        curr = stack.pop();
        if (--k == 0) return curr.val;
        curr = curr.right;
    }
    return -1;  // k was out of range
}
```

### 9.6 Convert Sorted Array to a Balanced BST

Pick the middle element as root — this guarantees balance automatically:

```java
TreeNode sortedArrayToBST(int[] nums) {
    return build(nums, 0, nums.length - 1);
}

TreeNode build(int[] nums, int left, int right) {
    if (left > right) return null;
    int mid = left + (right - left) / 2;
    TreeNode node = new TreeNode(nums[mid]);
    node.left = build(nums, left, mid - 1);
    node.right = build(nums, mid + 1, right);
    return node;
}
```

---

## 10. Lowest Common Ancestor (LCA)

The LCA of two nodes `p` and `q` is the deepest node that has both `p` and `q` as descendants (a node counts as its own ancestor).

### 10.1 LCA in a General Binary Tree (no ordering to exploit)

```java
TreeNode lowestCommonAncestor(TreeNode root, TreeNode p, TreeNode q) {
    if (root == null || root == p || root == q) return root;
    TreeNode left = lowestCommonAncestor(root.left, p, q);
    TreeNode right = lowestCommonAncestor(root.right, p, q);
    if (left != null && right != null) return root;   // p and q found on different sides -- root is the LCA
    return left != null ? left : right;                // otherwise bubble up whichever side found something
}
```

### 10.2 LCA in a BST (use the ordering — much faster, no extra space)

```java
TreeNode lowestCommonAncestorBST(TreeNode root, TreeNode p, TreeNode q) {
    TreeNode curr = root;
    while (curr != null) {
        if (p.val < curr.val && q.val < curr.val) curr = curr.left;
        else if (p.val > curr.val && q.val > curr.val) curr = curr.right;
        else return curr;   // p and q split here (or one equals curr) -- found it
    }
    return null;
}
```
Notice this is **iterative and O(1) extra space** — a nice follow-up to mention even if you first write it recursively. Always ask "is this a BST?" before choosing an LCA approach — using the general algorithm on a BST works but wastes the ordering information.

---

## 11. Tree Construction Problems

### 11.1 Build a Tree from Preorder + Inorder

**The insight:** preorder's first element is always the root. Find that value's position in inorder — everything to its left is the left subtree, everything to its right is the right subtree. Recurse.

```java
class Solution {
    Map<Integer, Integer> inorderIndex = new HashMap<>();
    int preIdx = 0;

    public TreeNode buildTree(int[] preorder, int[] inorder) {
        for (int i = 0; i < inorder.length; i++) inorderIndex.put(inorder[i], i);
        return build(preorder, 0, inorder.length - 1);
    }

    TreeNode build(int[] preorder, int inLeft, int inRight) {
        if (inLeft > inRight) return null;
        int rootVal = preorder[preIdx++];
        TreeNode root = new TreeNode(rootVal);
        int mid = inorderIndex.get(rootVal);
        root.left = build(preorder, inLeft, mid - 1);    // must build left before right --
        root.right = build(preorder, mid + 1, inRight);  // preIdx is shared, order matters!
        return root;
    }
}
```
The `HashMap` turns "find rootVal's index in inorder" from O(n) into O(1), taking the whole algorithm from O(n²) to O(n). Building **left before right** is required — `preIdx` is mutated as a side effect, and preorder always lists a node's left subtree before its right subtree.

*(Postorder + Inorder works the same way, except you consume `postorder` from the **end** backwards, and build the **right** subtree before the left.)*

### 11.2 Serialize and Deserialize a Binary Tree

**The idea:** preorder traversal, explicitly recording `null`s as placeholders — that's enough information to reconstruct the exact tree shape (not just any tree with those values).

```java
public class Codec {

    public String serialize(TreeNode root) {
        StringBuilder sb = new StringBuilder();
        serializeHelper(root, sb);
        return sb.toString();
    }

    private void serializeHelper(TreeNode node, StringBuilder sb) {
        if (node == null) {
            sb.append("null,");
            return;
        }
        sb.append(node.val).append(",");
        serializeHelper(node.left, sb);
        serializeHelper(node.right, sb);
    }

    public TreeNode deserialize(String data) {
        Queue<String> queue = new LinkedList<>(Arrays.asList(data.split(",")));
        return deserializeHelper(queue);
    }

    private TreeNode deserializeHelper(Queue<String> queue) {
        String val = queue.poll();
        if (val.equals("null")) return null;
        TreeNode node = new TreeNode(Integer.parseInt(val));
        node.left = deserializeHelper(queue);
        node.right = deserializeHelper(queue);
        return node;
    }
}
```
**Why preorder (not inorder) works alone here:** preorder + explicit nulls uniquely encodes the tree's *shape*, not just node ordering. Plain inorder without nulls is ambiguous — many different shapes can produce the same inorder sequence.

---

## 12. Level-Order Pattern Problems

All of these start from the same level-order BFS skeleton (Section 5.4) with small twists.

### 12.1 Zigzag Level Order Traversal

Alternate direction each level — use a `LinkedList` as a deque so you can add to either end:

```java
List<List<Integer>> zigzagLevelOrder(TreeNode root) {
    List<List<Integer>> result = new ArrayList<>();
    if (root == null) return result;
    Queue<TreeNode> queue = new LinkedList<>();
    queue.offer(root);
    boolean leftToRight = true;
    while (!queue.isEmpty()) {
        int size = queue.size();
        LinkedList<Integer> level = new LinkedList<>();
        for (int i = 0; i < size; i++) {
            TreeNode node = queue.poll();
            if (leftToRight) level.addLast(node.val);
            else level.addFirst(node.val);
            if (node.left != null) queue.offer(node.left);
            if (node.right != null) queue.offer(node.right);
        }
        result.add(level);
        leftToRight = !leftToRight;
    }
    return result;
}
```

### 12.2 Right Side View (what you'd see standing to the right of the tree)

The last node processed in each level is the one visible from the right:

```java
List<Integer> rightSideView(TreeNode root) {
    List<Integer> result = new ArrayList<>();
    if (root == null) return result;
    Queue<TreeNode> queue = new LinkedList<>();
    queue.offer(root);
    while (!queue.isEmpty()) {
        int size = queue.size();
        for (int i = 0; i < size; i++) {
            TreeNode node = queue.poll();
            if (i == size - 1) result.add(node.val);   // last node at this level
            if (node.left != null) queue.offer(node.left);
            if (node.right != null) queue.offer(node.right);
        }
    }
    return result;
}
```

### 12.3 Vertical Order Traversal

Track each node's horizontal **column** (root = 0, left child = col - 1, right child = col + 1), group by column, and use a `TreeMap` so columns come out sorted left-to-right:

```java
List<List<Integer>> verticalOrder(TreeNode root) {
    List<List<Integer>> result = new ArrayList<>();
    if (root == null) return result;
    TreeMap<Integer, List<Integer>> columnMap = new TreeMap<>();
    Queue<TreeNode> nodeQueue = new LinkedList<>();
    Queue<Integer> colQueue = new LinkedList<>();
    nodeQueue.offer(root);
    colQueue.offer(0);
    while (!nodeQueue.isEmpty()) {
        TreeNode node = nodeQueue.poll();
        int col = colQueue.poll();
        columnMap.computeIfAbsent(col, k -> new ArrayList<>()).add(node.val);
        if (node.left != null) {
            nodeQueue.offer(node.left);
            colQueue.offer(col - 1);
        }
        if (node.right != null) {
            nodeQueue.offer(node.right);
            colQueue.offer(col + 1);
        }
    }
    for (List<Integer> col : columnMap.values()) result.add(col);
    return result;
}
```
*(Running two parallel queues avoids needing a `Pair` class — a small trick worth remembering under interview time pressure.)*

### 12.4 Populate Next Right Pointers (connect same-level siblings)

```java
class Node {
    int val;
    Node left, right, next;
}

Node connect(Node root) {
    if (root == null) return root;
    Queue<Node> queue = new LinkedList<>();
    queue.offer(root);
    while (!queue.isEmpty()) {
        int size = queue.size();
        Node prev = null;
        for (int i = 0; i < size; i++) {
            Node node = queue.poll();
            if (prev != null) prev.next = node;
            prev = node;
            if (node.left != null) queue.offer(node.left);
            if (node.right != null) queue.offer(node.right);
        }
    }
    return root;
}
```
**Follow-up you'll likely get:** "can you do this in O(1) extra space (no queue)?" — Yes, if it's a **perfect** binary tree: since level `i` is already fully connected via `.next`, you can walk level `i` using those pointers to connect level `i+1`, without any queue. Worth knowing the idea exists even if you write the queue version first.

---

## 13. AVL Trees (Self-Balancing)

**The motivation:** a plain BST degrades to O(n) if you insert sorted data (Section 4's "skewed tree"). An **AVL tree** fixes this by keeping itself balanced after every insert/delete, guaranteeing O(log n) for every operation.

**Balance factor** of a node = `height(left subtree) - height(right subtree)`. AVL requires this to stay in `{-1, 0, 1}` for every node, always.

### 13.1 The Four Rotation Cases

When an insert pushes a node's balance factor to `±2`, one rotation (or two) restores balance:

```
LL Case (left-left heavy) -- single RIGHT rotation:

      z                       y
     / \                    /   \
    y   T4      ==>        x     z
   / \                    / \   / \
  x   T3                T1  T2 T3 T4
 / \
T1 T2

RR Case is the mirror image -- single LEFT rotation.

LR Case (left-right heavy) -- LEFT rotate the left child, then RIGHT rotate the node.
RL Case (right-left heavy) -- RIGHT rotate the right child, then LEFT rotate the node.
```

### 13.2 Rotation Code

```java
class AVLNode {
    int val, height;
    AVLNode left, right;
    AVLNode(int val) {
        this.val = val;
        this.height = 1;
    }
}

int height(AVLNode node) {
    return node == null ? 0 : node.height;
}

int getBalance(AVLNode node) {
    return node == null ? 0 : height(node.left) - height(node.right);
}

AVLNode rightRotate(AVLNode y) {
    AVLNode x = y.left;
    AVLNode T2 = x.right;
    x.right = y;
    y.left = T2;
    y.height = 1 + Math.max(height(y.left), height(y.right));   // update y FIRST -- it's now lower in the tree
    x.height = 1 + Math.max(height(x.left), height(x.right));
    return x;   // x is the new subtree root
}

AVLNode leftRotate(AVLNode x) {
    AVLNode y = x.right;
    AVLNode T2 = y.left;
    y.left = x;
    x.right = T2;
    x.height = 1 + Math.max(height(x.left), height(x.right));
    y.height = 1 + Math.max(height(y.left), height(y.right));
    return y;
}
```

### 13.3 Insert with Rebalancing

```java
AVLNode insert(AVLNode node, int val) {
    if (node == null) return new AVLNode(val);
    if (val < node.val) node.left = insert(node.left, val);
    else if (val > node.val) node.right = insert(node.right, val);
    else return node;   // no duplicates

    node.height = 1 + Math.max(height(node.left), height(node.right));
    int balance = getBalance(node);

    if (balance > 1 && val < node.left.val) return rightRotate(node);              // LL
    if (balance < -1 && val > node.right.val) return leftRotate(node);             // RR
    if (balance > 1 && val > node.left.val) {                                      // LR
        node.left = leftRotate(node.left);
        return rightRotate(node);
    }
    if (balance < -1 && val < node.right.val) {                                    // RL
        node.right = rightRotate(node.right);
        return leftRotate(node);
    }
    return node;
}
```

**Interview reality check:** you're very rarely asked to code a full AVL tree from scratch under time pressure. What's actually tested: (1) explaining *why* balance matters, (2) recognizing which rotation case applies given a picture, (3) the balance-factor formula. Know the rotation *concept* solidly; treat memorizing this exact code as a bonus, not a requirement.

---

## 14. Red-Black Trees (Concept Level)

Red-Black trees solve the same problem as AVL (keep a BST balanced) with a looser balance guarantee, which means **cheaper rebalancing** — fewer rotations per insert/delete on average. This is why **Java's `TreeMap`/`TreeSet`** and C++'s `std::map` use Red-Black trees internally rather than AVL.

**The five rules:**
1. Every node is colored **red** or **black**.
2. The root is always black.
3. Every leaf (conceptually, the `null` children) is black.
4. A red node cannot have a red child (**no two reds in a row**).
5. Every path from a node to any descendant `null` leaf passes through the **same number of black nodes**.

These rules together guarantee the longest root-to-leaf path is never more than **2×** the shortest one — looser than AVL's strict height balance, but still enough to bound every operation at **O(log n)**.

**Rebalancing after insert/delete** uses rotations (same left/right rotations as AVL) plus **recoloring** — flipping a node's color instead of rotating, when possible, which is cheaper. The exact case analysis (uncle's color, etc.) is a rabbit hole rarely worth memorizing for interviews.

**What you actually need for interviews:**
- Know it exists and **why**: guaranteed O(log n) operations, used in `TreeMap`, `TreeSet`, and Linux's process scheduler.
- Be able to say, if asked "AVL vs Red-Black?": *AVL is more strictly balanced → faster lookups, slower inserts/deletes. Red-Black is more loosely balanced → slightly slower lookups, faster inserts/deletes. Red-Black is preferred when writes are frequent (e.g., general-purpose ordered maps); AVL is preferred when reads dominate.*
- You will almost never be asked to implement one from scratch. Coding a full Red-Black tree in a 45-minute interview essentially never happens.

---

## 15. Heaps

A heap is a **complete binary tree** (Section 4) satisfying the **heap property**: every parent is ≤ (min-heap) or ≥ (max-heap) both its children. Note this is a *weaker* ordering than a BST — a heap only guarantees parent-vs-child, not left-vs-right, which is exactly what makes insert/extract O(log n) while still being fast to build.

Because a heap is always a **complete** tree, it's stored as a flat **array** (Section 4's array representation) — no pointers needed:

```
Array: [1, 3, 6, 5, 9, 8]
Index:  0  1  2  3  4  5

              1(0)
           /        \
        3(1)          6(2)
       /    \         /
    5(3)   9(4)     8(5)

parent(i) = (i - 1) / 2
left(i)   = 2*i + 1
right(i)  = 2*i + 2
```

### 15.1 Manual Min-Heap (so you understand what `PriorityQueue` does internally)

```java
class MinHeap {
    List<Integer> heap = new ArrayList<>();

    void insert(int val) {
        heap.add(val);
        int i = heap.size() - 1;
        while (i > 0) {                              // bubble up
            int parent = (i - 1) / 2;
            if (heap.get(parent) <= heap.get(i)) break;
            Collections.swap(heap, parent, i);
            i = parent;
        }
    }

    int extractMin() {
        int min = heap.get(0);
        int last = heap.remove(heap.size() - 1);
        if (!heap.isEmpty()) {
            heap.set(0, last);
            bubbleDown(0);
        }
        return min;
    }

    void bubbleDown(int i) {
        int n = heap.size();
        while (true) {
            int left = 2 * i + 1, right = 2 * i + 2, smallest = i;
            if (left < n && heap.get(left) < heap.get(smallest)) smallest = left;
            if (right < n && heap.get(right) < heap.get(smallest)) smallest = right;
            if (smallest == i) break;
            Collections.swap(heap, i, smallest);
            i = smallest;
        }
    }
}
```
Both `insert` and `extractMin` are **O(log n)** — you only ever walk up or down one root-to-leaf path.

### 15.2 In Practice: `PriorityQueue`

```java
PriorityQueue<Integer> minHeap = new PriorityQueue<>();                        // min-heap (default)
PriorityQueue<Integer> maxHeap = new PriorityQueue<>(Collections.reverseOrder()); // max-heap
```

### 15.3 Classic Problem: Kth Largest Element

Keep a min-heap of size `k` — the smallest element in that heap is always the `k`th largest overall:

```java
int findKthLargest(int[] nums, int k) {
    PriorityQueue<Integer> minHeap = new PriorityQueue<>();
    for (int num : nums) {
        minHeap.offer(num);
        if (minHeap.size() > k) minHeap.poll();   // evict the smallest once we exceed size k
    }
    return minHeap.peek();
}
```
O(n log k) — better than sorting the whole array (O(n log n)) when `k` is small.

---

## 16. Tries (Prefix Trees)

A **Trie** stores strings so that every path from the root spells out a prefix — nodes with a shared prefix share the same path, which makes prefix-based lookups extremely fast (O(length of the word), independent of how many words are stored).

```
Words inserted: "cat", "car", "card"

root
 |-- c
      |-- a
           |-- t*    (end of "cat")
           |-- r*    (end of "car")
                |-- d*   (end of "card")
```

```java
class TrieNode {
    TrieNode[] children = new TrieNode[26];
    boolean isEndOfWord;
}

class Trie {
    TrieNode root = new TrieNode();

    void insert(String word) {
        TrieNode curr = root;
        for (char c : word.toCharArray()) {
            int idx = c - 'a';
            if (curr.children[idx] == null) curr.children[idx] = new TrieNode();
            curr = curr.children[idx];
        }
        curr.isEndOfWord = true;
    }

    boolean search(String word) {
        TrieNode node = findNode(word);
        return node != null && node.isEndOfWord;
    }

    boolean startsWith(String prefix) {
        return findNode(prefix) != null;
    }

    private TrieNode findNode(String s) {
        TrieNode curr = root;
        for (char c : s.toCharArray()) {
            int idx = c - 'a';
            if (curr.children[idx] == null) return null;
            curr = curr.children[idx];
        }
        return curr;
    }
}
```
All three operations are **O(m)** where `m` is the length of the word — not O(n) in the number of stored words. That's the entire point of a trie.

**Where it's used:** autocomplete, spell-checkers, IP routing tables (longest prefix match), word search puzzles (backtracking + trie pruning), and predictive text.

---

## 17. Segment Trees

**The problem this solves:** you have an array and need to answer **range queries** (sum, min, max, gcd over `[left, right]`) *and* support **point updates** — both efficiently. A prefix-sum array answers range-sum queries in O(1) but breaks the moment you need to update a value (an update would force recomputing every prefix after it, O(n)). A segment tree answers **both in O(log n)**.

**The idea:** each node represents a range of the array. Leaves represent single elements; internal nodes represent the union of their children's ranges (e.g., the sum, min, or max of that range).

```
Array: [1, 3, 5, 7, 9, 11]     (range sum example)

                    [0,5]=36
                   /          \
             [0,2]=9         [3,5]=27
             /     \          /     \
        [0,1]=4  [2,2]=5  [3,4]=16 [5,5]=11
        /   \               /   \
    [0,0]=1 [1,1]=3     [3,3]=7 [4,4]=9
```

### 17.1 Build, Update, Query (range sum)

```java
class SegmentTree {
    int[] tree;
    int n;

    SegmentTree(int[] nums) {
        n = nums.length;
        tree = new int[4 * n];     // 4n is a safe upper bound on nodes needed
        build(nums, 0, 0, n - 1);
    }

    void build(int[] nums, int node, int start, int end) {
        if (start == end) {
            tree[node] = nums[start];
            return;
        }
        int mid = (start + end) / 2;
        build(nums, 2 * node + 1, start, mid);
        build(nums, 2 * node + 2, mid + 1, end);
        tree[node] = tree[2 * node + 1] + tree[2 * node + 2];
    }

    void update(int idx, int val) {
        update(0, 0, n - 1, idx, val);
    }

    private void update(int node, int start, int end, int idx, int val) {
        if (start == end) {
            tree[node] = val;
            return;
        }
        int mid = (start + end) / 2;
        if (idx <= mid) update(2 * node + 1, start, mid, idx, val);
        else update(2 * node + 2, mid + 1, end, idx, val);
        tree[node] = tree[2 * node + 1] + tree[2 * node + 2];   // recompute on the way back up
    }

    int query(int left, int right) {
        return query(0, 0, n - 1, left, right);
    }

    private int query(int node, int start, int end, int left, int right) {
        if (right < start || end < left) return 0;             // no overlap
        if (left <= start && end <= right) return tree[node];  // total overlap -- done
        int mid = (start + end) / 2;                            // partial overlap -- recurse both sides
        return query(2 * node + 1, start, mid, left, right)
             + query(2 * node + 2, mid + 1, end, left, right);
    }
}
```

**Why the three query cases matter:** every range query touches **O(log n)** nodes total, because at each level, a query range can only be "partially overlapping" for at most 2 nodes — everything else is either fully in or fully out and gets resolved in O(1).

**Swap `+` for `Math.min`/`Math.max`/`gcd`** and this same structure answers range-min, range-max, or range-gcd queries — the skeleton doesn't change, only the combine step.

**Complexity:** Build O(n), Update O(log n), Query O(log n), Space O(n) (specifically up to 4n).

---

## 18. Fenwick Tree / Binary Indexed Tree (BIT)

A **Fenwick Tree** answers the same core question as a segment tree — prefix sums with point updates — but with **less code and less memory** (O(n) instead of O(4n)). The tradeoff: it's naturally suited to **prefix sums / range sums only** (not min/max, since those aren't invertible — you can't "subtract" a max the way you subtract a sum).

**The core trick** is bit manipulation: `i & (-i)` isolates the **lowest set bit** of `i`, which tells you exactly how far to jump.

```java
class FenwickTree {
    int[] tree;   // 1-indexed
    int n;

    FenwickTree(int n) {
        this.n = n;
        tree = new int[n + 1];
    }

    void update(int i, int delta) {
        for (; i <= n; i += i & (-i)) {    // move to the next index this position affects
            tree[i] += delta;
        }
    }

    int query(int i) {                      // prefix sum of [1, i]
        int sum = 0;
        for (; i > 0; i -= i & (-i)) {      // move to the previous index that contributes
            sum += tree[i];
        }
        return sum;
    }

    int rangeQuery(int left, int right) {   // sum of [left, right], 1-indexed
        return query(right) - query(left - 1);
    }
}
```

**Mental model:** each index `i` in the Fenwick array is "responsible for" a range of the original array, sized by `i`'s lowest set bit. `update` walks *up* the implicit tree by repeatedly adding the lowest set bit; `query` walks *down* by repeatedly removing it. Both are **O(log n)**.

**Segment Tree vs. Fenwick Tree — when to reach for which:**

| | Segment Tree | Fenwick Tree |
|---|---|---|
| Code complexity | More | Less (~15 lines) |
| Memory | O(4n) | O(n) |
| Supports min/max/gcd range queries | Yes | No (sum/XOR only -- invertible operations) |
| Supports range updates (not just point) | Yes, with lazy propagation | Possible, but awkward |
| When to use | Need min/max, or range updates | Need prefix/range sums only, want less code |

---

## 19. Bonus: Sparse Table & Sqrt Decomposition

These aren't trees, but they solve the *same category* of range-query problem as Segment/Fenwick trees above, and interviewers (especially at companies that lean competitive-programming-flavored, and in follow-up questions) expect you to know when each is the right tool — so it's worth having them side by side rather than scattered across different notes.

### 19.1 Sparse Table — O(1) queries, but the array must be **immutable**

Best for: range min/max/gcd queries on an array that **never changes** after being built. Uses the fact that min/max/gcd are **idempotent** (`min(x, x) = x`), so overlapping ranges don't cause double-counting.

```java
class SparseTable {
    int[][] table;   // table[i][j] = min of the range starting at i, length 2^j
    int[] log;

    SparseTable(int[] arr) {
        int n = arr.length;
        int k = (int) (Math.log(n) / Math.log(2)) + 1;
        table = new int[n][k];
        log = new int[n + 1];
        for (int i = 2; i <= n; i++) log[i] = log[i / 2] + 1;

        for (int i = 0; i < n; i++) table[i][0] = arr[i];
        for (int j = 1; (1 << j) <= n; j++) {
            for (int i = 0; i + (1 << j) - 1 < n; i++) {
                table[i][j] = Math.min(table[i][j - 1], table[i + (1 << (j - 1))][j - 1]);
            }
        }
    }

    int queryMin(int left, int right) {                 // O(1) !
        int j = log[right - left + 1];
        return Math.min(table[left][j], table[right - (1 << j) + 1][j]);
    }
}
```
Build: O(n log n). Query: **O(1)**. The catch: **no updates** — any change to the array requires rebuilding the whole table. Use this only when the data is static and you need to answer *many* range-min/max queries.

### 19.2 Sqrt Decomposition — the simple, flexible middle ground

Split the array into blocks of size `~sqrt(n)`. Precompute an aggregate per block; queries combine full blocks in O(1) each plus at most two partial blocks element-by-element.

```java
class SqrtDecomposition {
    int[] arr, blocks;
    int blockSize;

    SqrtDecomposition(int[] arr) {
        this.arr = arr;
        int n = arr.length;
        blockSize = (int) Math.sqrt(n) + 1;
        blocks = new int[blockSize];
        for (int i = 0; i < n; i++) blocks[i / blockSize] += arr[i];
    }

    void update(int idx, int val) {
        blocks[idx / blockSize] += val - arr[idx];
        arr[idx] = val;
    }

    int query(int left, int right) {   // range sum
        int sum = 0;
        int startBlock = left / blockSize, endBlock = right / blockSize;
        if (startBlock == endBlock) {
            for (int i = left; i <= right; i++) sum += arr[i];
        } else {
            for (int i = left; i < (startBlock + 1) * blockSize; i++) sum += arr[i];
            for (int i = startBlock + 1; i < endBlock; i++) sum += blocks[i];
            for (int i = endBlock * blockSize; i <= right; i++) sum += arr[i];
        }
        return sum;
    }
}
```
Update and Query are both **O(sqrt n)** — worse than a Fenwick tree's O(log n), but the code is simpler and it generalizes more easily to operations a Fenwick tree can't handle (e.g., range assignment, "most frequent element in range" with extra bookkeeping).

### 19.3 Picking the right range-query tool

| Need | Best tool |
|---|---|
| Static array, range min/max/gcd, many queries | Sparse Table (O(1) query) |
| Range sum, point updates | Fenwick Tree (least code) |
| Range min/max, point updates | Segment Tree |
| Range updates too (not just point) | Segment Tree + lazy propagation |
| Something non-standard (range mode, range assignment) | Sqrt Decomposition (most flexible) |

---

## 20. N-ary Trees

An **N-ary tree** allows any number of children per node (not just 2) — think file systems, org charts, category trees, or the DOM.

```java
class Node {
    int val;
    List<Node> children;

    Node(int val) {
        this.val = val;
        children = new ArrayList<>();
    }
}
```

Traversals generalize directly — swap "recurse on left, then right" for "recurse on each child in order":

```java
void preorderNary(Node root, List<Integer> result) {
    if (root == null) return;
    result.add(root.val);
    for (Node child : root.children) {
        preorderNary(child, result);
    }
}

List<List<Integer>> levelOrderNary(Node root) {
    List<List<Integer>> result = new ArrayList<>();
    if (root == null) return result;
    Queue<Node> queue = new LinkedList<>();
    queue.offer(root);
    while (!queue.isEmpty()) {
        int size = queue.size();
        List<Integer> level = new ArrayList<>();
        for (int i = 0; i < size; i++) {
            Node node = queue.poll();
            level.add(node.val);
            for (Node child : node.children) queue.offer(child);
        }
        result.add(level);
    }
    return result;
}
```
*(There's no natural "inorder" for an N-ary tree — inorder specifically relies on there being exactly 2 children to split "before" and "after". Postorder generalizes too: recurse on all children first, then visit the node.)*

**Note:** a binary tree is the special case of an N-ary tree limited to 2 children — every pattern from Sections 5-12 (traversals, height, path sums, level order) applies here with the same "recurse on children, combine" mental model from Section 6.

---

## 21. Complexity Cheat Sheet

**Traversals** (all tree types): Time is always **O(n)** — you touch every node once. Space:

| Traversal | Space (typical) | Space (skewed tree) |
|---|---|---|
| Recursive (any DFS order) | O(h) call stack | O(n) |
| Iterative DFS (explicit stack) | O(h) | O(n) |
| Level order (BFS) | O(w), w = max width | up to O(n/2) ~ O(n) |
| Morris | O(1) | O(1) |

**Operations by structure:**

| Operation | BST (avg) | BST (worst, skewed) | AVL / Red-Black | Min/Max Heap | Trie | Segment Tree | Fenwick Tree |
|---|---|---|---|---|---|---|---|
| Search | O(log n) | O(n) | O(log n) | O(n) | O(m)* | -- | -- |
| Insert | O(log n) | O(n) | O(log n) | O(log n) | O(m) | O(log n) build | O(log n) |
| Delete | O(log n) | O(n) | O(log n) | O(log n) | O(m) | -- | -- |
| Find Min/Max | O(log n) | O(n) | O(log n) | O(1) | -- | -- | -- |
| Range Query | -- | -- | -- | -- | -- | O(log n) | O(log n) |

*\* m = length of the key/word being searched, not the number of stored words.*

**Why this table matters in interviews:** stating the Big-O of your solution *and* comparing it to the naive alternative (e.g., "a plain BST would be O(n) worst case here since the input might arrive sorted, so I'd want to mention AVL/Red-Black balancing if that's a concern") is exactly the kind of proactive complexity discussion that separates L4/SDE3-level answers from junior ones.

---

## 22. How to Approach ANY Tree Problem

A repeatable checklist — walk through this in order, out loud, in an actual interview:

**1. Clarify the tree type.**
Binary tree or BST? Balanced or could it be skewed? Can values repeat? Can the tree be empty? Is it a binary tree or does it allow N children? These change which techniques are even valid (e.g., BST gives you ordering + LCA shortcuts; a plain binary tree doesn't).

**2. Identify what kind of information you need.**
- Do you need **sorted order**? -> inorder (BST).
- Do you need to process **before** recursing? -> preorder (top-down, pass context down).
- Do you need children resolved **before** the parent? -> postorder (bottom-up, combine results).
- Do you need **level-by-level** structure? -> BFS.

**3. Default to recursive first, then consider the iterative/space-optimized follow-up.**
Recursive is almost always the fastest to write correctly. Once it works, be ready for "can you do this iteratively?" or "can you avoid the O(h) stack space?" (-> Morris traversal for inorder specifically).

**4. Identify the pattern family** (most tree problems are one of these):
- **Property/comparison** (height, count, same tree, symmetric, balanced) -> postorder, combine children's results.
- **Path-based** (path sum, root-to-leaf, max path sum) -> carry a running value down, backtrack after.
- **Construction** (build from traversals, serialize/deserialize) -> use a shared, mutating index/queue; recurse in the right order.
- **Level-based** (zigzag, right view, vertical order) -> BFS with the `size = queue.size()` snapshot trick.
- **LCA-based** -> check if it's a BST first (changes the whole approach).
- **Range query** (sum/min over a subrange, with or without updates) -> segment tree / Fenwick tree / sparse table, per Section 19.3's table.

**5. Nail the base case before writing anything else.**
For almost every recursive tree function: what do you return for `null`? Get this right and the rest tends to follow.

**6. Decide what flows down vs. what flows up** (Section 6):
- Flowing **down**: bounds for BST validation, remaining sum for path problems, accumulated depth.
- Flowing **up**: height, counts, booleans like "is balanced," anything you're computing bottom-up.

**7. Test against edge cases out loud:**
- Empty tree (`root == null`)
- Single node
- Fully skewed tree (stress-tests any O(h) assumption)
- Tree with duplicate values (if the problem allows them -- BST algorithms especially need to state how duplicates are handled)

---

## 23. Curated Practice List

Organized by difficulty and mapped to the sections above — work top to bottom within each tier.

**Easy** (Sections 5-7)
- Maximum Depth of Binary Tree
- Same Tree
- Symmetric Tree
- Invert Binary Tree
- Minimum Depth of Binary Tree
- Path Sum
- Diameter of Binary Tree
- Convert Sorted Array to Binary Search Tree
- Two Sum IV - Input is a BST
- Range Sum of BST

**Medium** (Sections 8-13, 16-17)
- Binary Tree Level Order Traversal
- Zigzag Level Order Traversal
- Validate Binary Search Tree
- Kth Smallest Element in a BST
- Lowest Common Ancestor of a Binary Tree
- Lowest Common Ancestor of a BST
- Construct Binary Tree from Preorder and Inorder Traversal
- Path Sum II
- Path Sum III
- Right Side View of Binary Tree
- Populating Next Right Pointers in Each Node
- Delete Node in a BST
- Vertical Order Traversal of a Binary Tree
- Flatten Binary Tree to Linked List
- Unique Binary Search Trees
- Implement Trie (Prefix Tree)
- Kth Largest Element in an Array

**Hard** (Sections 8.4, 11.2, 17-19)
- Binary Tree Maximum Path Sum
- Serialize and Deserialize Binary Tree
- Recover Binary Search Tree
- Binary Tree Cameras
- Count of Smaller Numbers After Self
- Range Sum Query - Mutable
- Word Search II (Trie + backtracking)

---

## 24. Common Mistakes & Interview Tips

- **Forgetting the null check at the top of a recursive function.** This is the single most common cause of an NPE mid-interview. Make it reflex.
- **Miscounting level-order boundaries** — always snapshot `queue.size()` *before* the inner loop, never check it mid-loop (it changes as you enqueue).
- **Validating a BST by only comparing a node to its immediate children** instead of carrying a range — this passes on small examples and fails on a grandchild violation, which makes it a favorite interviewer trap.
- **Confusing height and depth conventions.** State your convention out loud before coding ("I'll treat a leaf as height 0") so you and the interviewer are aligned.
- **Not stating time/space complexity unprompted.** At L4/SDE3 level, you're expected to narrate this without being asked, and to compare against the naive alternative.
- **Jumping to code before confirming the tree type.** Thirty seconds of "is this a BST, can it be unbalanced, can values repeat?" saves a wrong-approach restart halfway through.
- **For path/backtracking problems: forgetting to backtrack** (removing the last element after recursing) — this silently corrupts every sibling path's result.
- **Assuming a balanced tree when the problem never said so.** If the interviewer doesn't specify, ask — your Big-O answer usually depends on it.

---

*That's the full map. If you work through Sections 1-12 first (binary trees, traversals, BST, paths, LCA -- the highest-frequency interview material) and treat 13-19 (AVL, Red-Black, Heaps, Tries, Segment/Fenwick/Sparse Table) as the "go deeper" layer, you'll have both breadth and the depth L4/SDE3 interviews probe for.*