# Graphs — Complete DSA Interview Guide
*Continuing your DSA prep series — Java throughout.*

### How this document is organized
Every algorithm below follows the same four-part structure so you can scan quickly:
- **Approach** — the idea, in plain English, before any code
- **Code** — clean, interview-ready Java
- **Why it works** — the reasoning an interviewer will probe
- **Interview angle** — what problems this actually shows up in, and what follow-up questions to expect

Read it top to bottom once. Then use the Table of Contents to jump back to whatever you need to drill.

---

## Table of Contents
1. [What Is a Graph & Why It's Everywhere](#1-what-is-a-graph--why-its-everywhere)
2. [Core Terminology](#2-core-terminology)
3. [Representing a Graph in Code](#3-representing-a-graph-in-code)
4. [BFS — Breadth-First Search](#4-bfs--breadth-first-search)
5. [DFS — Depth-First Search](#5-dfs--depth-first-search)
6. [Grids as Graphs](#6-grids-as-graphs)
7. [Connected Components](#7-connected-components)
8. [Cycle Detection](#8-cycle-detection)
9. [Topological Sort](#9-topological-sort)
10. [Union-Find (Disjoint Set Union)](#10-union-find-disjoint-set-union--dsu)
11. [Shortest Path Algorithms](#11-shortest-path-algorithms)
12. [Minimum Spanning Tree](#12-minimum-spanning-tree-mst)
13. [Bipartite Graph Check](#13-bipartite-graph-check)
14. [Strongly Connected Components](#14-strongly-connected-components-scc)
15. [Bridges & Articulation Points](#15-bridges--articulation-points)
16. [Other Patterns Worth Knowing](#16-other-patterns-worth-knowing)
17. [How to Recognize a Graph Problem](#17-how-to-recognize-a-graph-problem)
18. [Step-by-Step Framework for Any Graph Question](#18-step-by-step-framework-for-any-graph-question)
19. [Complexity Cheat Sheet](#19-complexity-cheat-sheet)
20. [Common Mistakes That Cost Marks](#20-common-mistakes-that-cost-marks)
21. [Practice Problems by Pattern](#21-practice-problems-by-pattern)
22. [Copy-Paste Templates](#22-copy-paste-templates)

---

## 1. What Is a Graph & Why It's Everywhere

A graph is just `G = (V, E)` — a set of **vertices** (nodes) and a set of **edges** (connections between them). That's it. Everything else in this document is "what can you compute once you have that structure."

Graphs matter so much in interviews because they model *relationships*, and almost every real system is relationships: web pages linking to each other, people following people, cities connected by roads, tasks depending on other tasks, servers talking to servers. If your problem involves "things" and "connections between things," it's a graph problem — whether or not the word "graph" appears anywhere in the statement.

That last point is the single biggest reason people get stuck: **most graph problems don't announce themselves.** A 2D grid is a graph (cells = nodes, adjacency = edges). A list of word transformations is a graph. A build dependency list is a graph. A big part of "solving any graph question" is training yourself to *notice* the graph hiding inside a problem — Section 17 is built entirely around this skill, so treat everything before it as building the vocabulary you need to get there.

---

## 2. Core Terminology

| Term | Meaning |
|---|---|
| Vertex / Node | A single entity in the graph |
| Edge | A connection between two vertices |
| Directed edge | One-way: `u → v` does not imply `v → u` |
| Undirected edge | Two-way: `u — v` implies both directions |
| Weighted edge | Carries a cost/distance/value |
| Unweighted edge | All edges treated as cost 1 |
| Degree | Number of edges touching a vertex |
| In-degree / Out-degree | (Directed only) edges coming in / going out of a vertex |
| Path | A sequence of vertices connected by edges |
| Simple path | A path that doesn't repeat any vertex |
| Cycle | A path that starts and ends at the same vertex |
| Connected graph | Every vertex is reachable from every other vertex (undirected) |
| Connected component | A maximal group of vertices all reachable from each other |
| DAG | Directed Acyclic Graph — directed, no cycles |
| Strongly connected | (Directed only) every vertex can reach every other vertex *in both directions* |
| Dense graph | E is close to V² (lots of edges relative to vertices) |
| Sparse graph | E is close to V (few edges relative to vertices) |
| Tree | A connected, acyclic, undirected graph with exactly V−1 edges — a graph with no "extra" connections |

One thing worth internalizing early: **a tree is just a special graph.** Every tree algorithm you already know (DFS traversal, level-order/BFS, recursion) is a graph algorithm you're already comfortable with. Graphs generalize trees by allowing cycles, multiple parents, and disconnection — which is exactly why you need a `visited` set that trees usually don't (no cycles to worry about there).

Two smaller terms you'll see mentioned but rarely need to handle specially: a **self-loop** is an edge from a node to itself, and a **multigraph** allows more than one edge between the same pair of nodes. Most interview problems explicitly rule these out, but it's worth asking the interviewer if the input could contain either — it's a legitimate clarifying question that signals you're thinking about edge cases.

---

## 3. Representing a Graph in Code

How you store the graph affects everything downstream, so get this reflexive.

**Adjacency Matrix** — a `V × V` grid where `matrix[i][j]` is 1 (or the weight) if an edge exists.

```java
int[][] adjMatrix = new int[V][V];
// adjMatrix[u][v] = 1;       // unweighted edge u -> v
// adjMatrix[u][v] = weight;  // weighted edge u -> v
```
**Why it works / trade-off:** O(1) edge lookup — great when you constantly ask "does an edge exist between u and v?" But it costs O(V²) space *no matter how many edges actually exist*, which is wasteful for sparse graphs (most interview graphs are sparse).

**Adjacency List** — for each node, a list of its neighbors. This is your default 90% of the time.

```java
// Unweighted
List<List<Integer>> adjList = new ArrayList<>();
for (int i = 0; i < V; i++) adjList.add(new ArrayList<>());
adjList.get(u).add(v);
adjList.get(v).add(u); // omit this line if the graph is directed

// Weighted — pair each neighbor with its edge weight
List<List<int[]>> weightedAdj = new ArrayList<>();   // int[]{neighbor, weight}

// Built directly from a raw edges array (the most common interview input format)
Map<Integer, List<Integer>> graph = new HashMap<>();
for (int[] edge : edges) {
    graph.computeIfAbsent(edge[0], k -> new ArrayList<>()).add(edge[1]);
    graph.computeIfAbsent(edge[1], k -> new ArrayList<>()).add(edge[0]); // omit for directed
}
```
**Why it works / trade-off:** O(V+E) space — you only pay for edges that actually exist. Edge lookup is O(degree) instead of O(1), but you almost never need that in interview problems; what you need is "give me all neighbors of this node," which adjacency lists do perfectly.

**Edge List** — just the raw `int[][] edges` array, unprocessed.

```java
int[][] edges; // edges[i] = {u, v, weight}
```
**Interview angle:** you rarely traverse an edge list directly — but Kruskal's MST (needs to *sort* all edges) and Bellman-Ford (needs to *relax* all edges every round) both work directly off this format, no adjacency list required.

**Decision guide:** default to adjacency list. Reach for a matrix only when the graph is small and dense and you need O(1) edge-existence checks. Reach for edge list only when the specific algorithm calls for it (Kruskal's, Bellman-Ford).

**How graphs actually show up as input:** an explicit `edges` array (build the adjacency list yourself as your first coding step — always), a 2D grid (Section 6), or a set of relationships you have to derive yourself from strings/rules (e.g., word ladder). Rarely will you be handed an adjacency list ready-made — building it is part of the problem, and it's worth doing as a clean, separate first step rather than improvising it mid-traversal.

---

## 4. BFS — Breadth-First Search

**Approach:** explore level by level, like ripples spreading in a pond. Use a queue (FIFO): visit a node, then enqueue all its unvisited neighbors before going any deeper. Because you fully exhaust distance-1 nodes before touching distance-2 nodes, BFS **guarantees the shortest path by edge count** in an unweighted graph — this is the single most important fact about BFS.

**Code:**
```java
public List<Integer> bfs(int start, Map<Integer, List<Integer>> graph) {
    List<Integer> order = new ArrayList<>();
    Set<Integer> visited = new HashSet<>();
    Queue<Integer> queue = new LinkedList<>();

    queue.offer(start);
    visited.add(start);

    while (!queue.isEmpty()) {
        int node = queue.poll();
        order.add(node);

        for (int neighbor : graph.getOrDefault(node, new ArrayList<>())) {
            if (!visited.contains(neighbor)) {
                visited.add(neighbor);   // mark visited at ENQUEUE time, not dequeue
                queue.offer(neighbor);
            }
        }
    }
    return order;
}
```

**Why it works:** the queue's FIFO order is what forces level-by-level exploration. The critical, easy-to-miss detail is **marking visited when you enqueue, not when you dequeue** — if you wait until dequeue, the same node can be pushed onto the queue multiple times (once per neighbor that discovers it) before it's ever processed, wasting work and, in shortest-path variants, potentially recording the wrong distance.

**Interview angle:** any phrase like "minimum steps," "minimum moves," "shortest path" on an *unweighted* graph is a BFS flag. To get the actual distance (not just visit order), track it level by level:

```java
public int shortestPath(int start, int target, Map<Integer, List<Integer>> graph) {
    if (start == target) return 0;
    Set<Integer> visited = new HashSet<>();
    Queue<Integer> queue = new LinkedList<>();
    queue.offer(start);
    visited.add(start);
    int distance = 0;

    while (!queue.isEmpty()) {
        int size = queue.size();
        distance++;
        for (int i = 0; i < size; i++) {
            int node = queue.poll();
            for (int neighbor : graph.getOrDefault(node, new ArrayList<>())) {
                if (neighbor == target) return distance;
                if (!visited.contains(neighbor)) {
                    visited.add(neighbor);
                    queue.offer(neighbor);
                }
            }
        }
    }
    return -1; // target unreachable
}
```
The `int size = queue.size()` trick — snapshot the queue's current size, then process exactly that many nodes before incrementing `distance` — is how you process "one level at a time" explicitly. This pattern is extremely common; it's worth being able to write it without thinking.

---

## 5. DFS — Depth-First Search

**Approach:** go as deep as possible before backtracking. It's the natural fit for recursion (the call stack does the bookkeeping for you), though it can also be written iteratively with an explicit stack.

**Code (recursive — write this version by default):**
```java
public void dfs(int node, Map<Integer, List<Integer>> graph, Set<Integer> visited, List<Integer> order) {
    visited.add(node);
    order.add(node);

    for (int neighbor : graph.getOrDefault(node, new ArrayList<>())) {
        if (!visited.contains(neighbor)) {
            dfs(neighbor, graph, visited, order);
        }
    }
}
```

**Code (iterative, explicit stack):**
```java
public List<Integer> dfsIterative(int start, Map<Integer, List<Integer>> graph) {
    List<Integer> order = new ArrayList<>();
    Set<Integer> visited = new HashSet<>();
    Deque<Integer> stack = new ArrayDeque<>();
    stack.push(start);

    while (!stack.isEmpty()) {
        int node = stack.pop();
        if (visited.contains(node)) continue; // note: check/mark visited on POP here
        visited.add(node);
        order.add(node);

        for (int neighbor : graph.getOrDefault(node, new ArrayList<>())) {
            if (!visited.contains(neighbor)) {
                stack.push(neighbor);
            }
        }
    }
    return order;
}
```

**Why it works:** notice the visited-marking convention *flips* between BFS and iterative DFS — BFS marks on enqueue, this DFS marks on pop. That's intentional: with a plain stack, the same unvisited neighbor can get pushed by more than one earlier node before it's processed, so duplicates can sit in the stack; checking "already visited?" at pop time cheaply discards those duplicates instead of preventing them. (You *can* mark-on-push instead if you prefer, it just requires slightly different bookkeeping — pick one convention and be consistent so you don't blend the two mid-interview.)

**A worked trace, so this isn't just abstract.** Take this small graph:
```
        1
       / \
      2   3
      |   |
      4   5
       \ /
        6
```
Adjacency list: `1: [2,3]`, `2: [1,4]`, `3: [1,5]`, `4: [2,6]`, `5: [3,6]`, `6: [4,5]`

- **BFS from 1:** visit 1 → enqueue 2,3 → visit 2,3 → enqueue 4,5 → visit 4,5 → enqueue 6 → visit 6. Order: **1, 2, 3, 4, 5, 6**.
- **DFS from 1** (recursive, visiting neighbors in list order): 1 → 2 (first neighbor) → 4 (2's first unvisited neighbor) → 6 (4's only unvisited neighbor) → 5 (6's unvisited neighbor) → 3 (5's unvisited neighbor, since 6 is visited) → back to 1, done. Order: **1, 2, 4, 6, 5, 3**.

Notice BFS fans out level by level while DFS commits to one branch all the way down before backtracking — same graph, same starting node, structurally different orders. Being able to trace this by hand is what lets you sanity-check your code on a whiteboard before you trust it.

**Complexity (both BFS and DFS):** O(V+E) time — every vertex is processed once, every edge examined once. O(V) space for the visited set/queue/recursion stack.

**Interview angle:** DFS is your default for connected components, cycle detection, topological sort, and any problem with a "backtracking" flavor layered on a graph. **Recursion depth warning:** on a large, skewed graph (e.g., V > ~10⁴ in a near-linear chain), recursive DFS can stack-overflow in Java — the default thread stack is small. Know the iterative version exists and mention it as a fallback even if you write the recursive one; it's a good sign of seniority to flag this unprompted.

---

## 6. Grids as Graphs

This is the most common disguise a graph wears in interviews. A 2D matrix is a graph where each cell `(r, c)` is a node, and edges connect it to its neighbors — usually the 4 orthogonal directions, sometimes 8 with diagonals.

**Approach:** treat cell visits exactly like node visits in a normal graph — you just compute neighbors with `(r±1, c)` / `(r, c±1)` instead of looking them up in an adjacency list, and use a `visited[][]` array (or mutate the grid in place) instead of a `Set`.

**Code (generic template):**
```java
int[][] directions = {{0,1},{0,-1},{1,0},{-1,0}}; // right, left, down, up

public void dfsGrid(int[][] grid, int r, int c, boolean[][] visited) {
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return;
    if (visited[r][c] || grid[r][c] == 0) return; // adapt the "blocked" condition to the problem
    visited[r][c] = true;

    for (int[] dir : directions) {
        dfsGrid(grid, r + dir[0], c + dir[1], visited);
    }
}
```

**Interview angle — Number of Islands**, the canonical version of this pattern:
```java
public int numIslands(char[][] grid) {
    int count = 0;
    int rows = grid.length, cols = grid[0].length;
    boolean[][] visited = new boolean[rows][cols];

    for (int r = 0; r < rows; r++) {
        for (int c = 0; c < cols; c++) {
            if (grid[r][c] == '1' && !visited[r][c]) {
                count++;
                dfsIsland(grid, r, c, visited);
            }
        }
    }
    return count;
}

private void dfsIsland(char[][] grid, int r, int c, boolean[][] visited) {
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return;
    if (visited[r][c] || grid[r][c] == '0') return;
    visited[r][c] = true;
    dfsIsland(grid, r + 1, c, visited);
    dfsIsland(grid, r - 1, c, visited);
    dfsIsland(grid, r, c + 1, visited);
    dfsIsland(grid, r, c - 1, visited);
}
```
This is structurally identical to "count connected components" (Section 7) — the grid is just the graph's disguise.

**Interview angle — Multi-source BFS**, e.g. Rotting Oranges: instead of starting BFS from *one* node, seed the queue with *every* starting source at once, then run standard level-by-level BFS. The level count naturally becomes "time elapsed for the effect to spread everywhere."
```java
public int orangesRotting(int[][] grid) {
    int rows = grid.length, cols = grid[0].length;
    Queue<int[]> queue = new LinkedList<>();
    int fresh = 0;

    for (int r = 0; r < rows; r++) {
        for (int c = 0; c < cols; c++) {
            if (grid[r][c] == 2) queue.offer(new int[]{r, c});
            else if (grid[r][c] == 1) fresh++;
        }
    }

    int[][] dirs = {{0,1},{0,-1},{1,0},{-1,0}};
    int minutes = 0;

    while (!queue.isEmpty() && fresh > 0) {
        int size = queue.size();
        minutes++;
        for (int i = 0; i < size; i++) {
            int[] cell = queue.poll();
            for (int[] d : dirs) {
                int nr = cell[0] + d[0], nc = cell[1] + d[1];
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] == 1) {
                    grid[nr][nc] = 2;
                    fresh--;
                    queue.offer(new int[]{nr, nc});
                }
            }
        }
    }
    return fresh == 0 ? minutes : -1;
}
```
**Why it works:** seeding the queue with all sources up front means the first "level" processed is simultaneously one step out from every source — exactly modeling something spreading from many points at once, rather than running BFS N times from N sources separately (which would be correct but far slower).

---

## 7. Connected Components

**Approach:** loop over every vertex. Whenever you hit one that's unvisited, it must belong to a component you haven't counted yet — run DFS/BFS from it to mark the entire component, then increment your counter and move on.

**Code:**
```java
public int countComponents(int n, int[][] edges) {
    Map<Integer, List<Integer>> graph = new HashMap<>();
    for (int i = 0; i < n; i++) graph.put(i, new ArrayList<>());
    for (int[] edge : edges) {
        graph.get(edge[0]).add(edge[1]);
        graph.get(edge[1]).add(edge[0]);
    }

    boolean[] visited = new boolean[n];
    int count = 0;

    for (int i = 0; i < n; i++) {
        if (!visited[i]) {
            count++;
            dfsMark(i, graph, visited);
        }
    }
    return count;
}

private void dfsMark(int node, Map<Integer, List<Integer>> graph, boolean[] visited) {
    visited[node] = true;
    for (int neighbor : graph.get(node)) {
        if (!visited[neighbor]) dfsMark(neighbor, graph, visited);
    }
}
```

**Why it works:** DFS/BFS from any node visits *exactly* the set of nodes reachable from it — which, in an undirected graph, is by definition the whole component. The outer loop's only job is making sure you don't stop after the first component just because the graph might be disconnected.

**Interview angle:** Number of Provinces, Number of Connected Components, Friend Circles. This is also solvable with Union-Find (Section 10) — knowing both is worth it, because "can you solve it a different way?" is a common follow-up once you finish the DFS version.

---

## 8. Cycle Detection

The technique **depends entirely on whether the graph is directed or undirected** — using the wrong one is the single most common mistake here, so understand *why* they differ, not just the two recipes.

### Undirected graphs — parent-tracking

**Approach:** run DFS while remembering which node you *arrived from*. If you ever reach an already-visited node that **isn't** your immediate parent, you've found a cycle — you reached a node through a second, different path.

**Code:**
```java
public boolean hasCycleUndirected(int n, Map<Integer, List<Integer>> graph) {
    boolean[] visited = new boolean[n];
    for (int i = 0; i < n; i++) {
        if (!visited[i]) {
            if (dfsCycle(i, -1, graph, visited)) return true;
        }
    }
    return false;
}

private boolean dfsCycle(int node, int parent, Map<Integer, List<Integer>> graph, boolean[] visited) {
    visited[node] = true;
    for (int neighbor : graph.get(node)) {
        if (!visited[neighbor]) {
            if (dfsCycle(neighbor, node, graph, visited)) return true;
        } else if (neighbor != parent) {
            return true; // back edge to a non-parent, already-visited node
        }
    }
    return false;
}
```
*(Alternative: Union-Find — see Section 10 — often cleaner when the question asks you to identify the specific redundant edge.)*

### Directed graphs — 3-state coloring

**Approach:** parent-tracking breaks here, because in a directed graph reaching an already-visited node through a *different* path is completely normal (think of a diamond: A→B, A→C, B→D, C→D — D is reached twice with zero cycles). Instead, track three states per node: **white** (untouched), **gray** (currently on the DFS recursion stack — an ancestor of where you are right now), **black** (fully finished, safe forever). A cycle exists **if and only if** you reach a gray node.

**Code:**
```java
public boolean hasCycleDirected(int n, Map<Integer, List<Integer>> graph) {
    int[] state = new int[n]; // 0 = white, 1 = gray, 2 = black
    for (int i = 0; i < n; i++) {
        if (state[i] == 0) {
            if (dfsDirectedCycle(i, graph, state)) return true;
        }
    }
    return false;
}

private boolean dfsDirectedCycle(int node, Map<Integer, List<Integer>> graph, int[] state) {
    state[node] = 1; // gray: currently in this DFS path
    for (int neighbor : graph.getOrDefault(node, new ArrayList<>())) {
        if (state[neighbor] == 1) return true; // hit a gray node = back edge = cycle
        if (state[neighbor] == 0 && dfsDirectedCycle(neighbor, graph, state)) return true;
    }
    state[node] = 2; // black: fully explored, can never be part of a new cycle
    return false;
}
```

**Why it works — and be ready to explain this out loud:** gray specifically means "an ancestor of the node I'm currently exploring." Reaching a gray node means there's a path from that ancestor down to here, *and* an edge from here back up to it — that's the definition of a cycle. Reaching a black node means "fully explored, dead end for cycle purposes," which is exactly the diamond-shaped case above — not a cycle, just two legitimate paths converging.

**Interview angle:** Course Schedule I (directed — prerequisites are directed edges), Redundant Connection (undirected), any deadlock/circular-dependency framing.

---

## 9. Topological Sort

Only valid on a **DAG** (directed, acyclic). Produces a linear order where, for every edge `u → v`, `u` appears before `v`. Think "task scheduling with prerequisites."

### Kahn's Algorithm (BFS-based, via in-degree) — usually the cleanest to write and narrate

**Approach:** a node with in-degree 0 has no unmet prerequisites, so it's safe to output right now. Output it, then "remove" it by decrementing the in-degree of everything it points to — any neighbor that drops to in-degree 0 just became safe too.

**Code:**
```java
public int[] topologicalSort(int n, int[][] edges) {
    Map<Integer, List<Integer>> graph = new HashMap<>();
    int[] inDegree = new int[n];
    for (int i = 0; i < n; i++) graph.put(i, new ArrayList<>());

    for (int[] edge : edges) {
        graph.get(edge[0]).add(edge[1]);
        inDegree[edge[1]]++;
    }

    Queue<Integer> queue = new LinkedList<>();
    for (int i = 0; i < n; i++) {
        if (inDegree[i] == 0) queue.offer(i);
    }

    int[] result = new int[n];
    int idx = 0;

    while (!queue.isEmpty()) {
        int node = queue.poll();
        result[idx++] = node;
        for (int neighbor : graph.get(node)) {
            inDegree[neighbor]--;
            if (inDegree[neighbor] == 0) queue.offer(neighbor);
        }
    }

    return idx == n ? result : new int[0]; // fewer than n placed => a cycle exists
}
```
**Why it works:** you get cycle detection *for free* — if any node is stuck in a cycle, its in-degree never reaches 0, so `idx` ends up less than `n`. That single check (`idx == n`) is how Course Schedule I and II share almost identical code.

### DFS-based topological sort (finish-time stack)

**Approach:** run DFS; push each node onto a stack *after* all of its descendants have already been fully explored ("on finish"). Popping the stack at the end gives the topological order.

**Code:**
```java
public int[] topologicalSortDFS(int n, Map<Integer, List<Integer>> graph) {
    boolean[] visited = new boolean[n];
    Deque<Integer> stack = new ArrayDeque<>();

    for (int i = 0; i < n; i++) {
        if (!visited[i]) dfsTopo(i, graph, visited, stack);
    }

    int[] result = new int[n];
    for (int i = 0; i < n; i++) result[i] = stack.pop();
    return result;
}

private void dfsTopo(int node, Map<Integer, List<Integer>> graph, boolean[] visited, Deque<Integer> stack) {
    visited[node] = true;
    for (int neighbor : graph.getOrDefault(node, new ArrayList<>())) {
        if (!visited[neighbor]) dfsTopo(neighbor, graph, visited, stack);
    }
    stack.push(node); // pushed only after every descendant is already pushed
}
```
**Why it works:** a node can only be pushed once everything reachable from it is already on the stack (i.e., lower down). So when you pop from the top, you always get a node before anything it depends on — that's exactly the topological property.

**Interview angle:** Course Schedule II, Alien Dictionary (build the graph from letter-ordering constraints first — that's the hard part, the sort itself is standard), general build-order/task-scheduling questions.

---

## 10. Union-Find (Disjoint Set Union / DSU)

**Approach:** maintain groups of connected nodes so you can answer "are these two in the same group?" and "merge these two groups" in near-constant time, without re-traversing the graph on every query. Every node starts as its own parent (its own group of one); `union` merges two groups by pointing one root at the other.

**Code (optimized — path compression + union by rank):**
```java
class UnionFind {
    int[] parent;
    int[] rank;

    public UnionFind(int n) {
        parent = new int[n];
        rank = new int[n];
        for (int i = 0; i < n; i++) parent[i] = i;
    }

    public int find(int x) {
        if (parent[x] != x) {
            parent[x] = find(parent[x]); // path compression: point straight at the root
        }
        return parent[x];
    }

    public boolean union(int x, int y) {
        int rootX = find(x), rootY = find(y);
        if (rootX == rootY) return false; // already connected -> this edge would form a cycle

        if (rank[rootX] < rank[rootY]) {
            parent[rootX] = rootY;
        } else if (rank[rootX] > rank[rootY]) {
            parent[rootY] = rootX;
        } else {
            parent[rootY] = rootX;
            rank[rootX]++;
        }
        return true;
    }
}
```

**Why it works:** `find` walks up to the root and, on the way back out of the recursion, re-points every node it passed *directly* at the root (path compression) — so the next `find` on any of those nodes is nearly instant. `union` always attaches the shorter tree under the taller one (union by rank) so trees stay flat instead of degenerating into a long chain. Together these two tricks give amortized **O(α(n))** per operation, where α is the inverse Ackermann function — for any n you will ever encounter, α(n) ≤ 4, so this is effectively O(1).

**Interview angle — cycle detection for free.** `union` returning `false` means the two nodes were already connected, so this new edge is redundant:
```java
public int[] findRedundantConnection(int[][] edges) {
    UnionFind uf = new UnionFind(edges.length + 1);
    for (int[] edge : edges) {
        if (!uf.union(edge[0], edge[1])) {
            return edge; // the edge that closes a cycle
        }
    }
    return new int[0];
}
```
Also shows up in: Number of Provinces (alternative to DFS), Accounts Merge, Number of Islands II (dynamic/online connectivity), and as the cycle-check inside Kruskal's MST (Section 12).

---

## 11. Shortest Path Algorithms

BFS (Section 4) already solves shortest path for **unweighted** graphs. Once weights enter the picture, you need one of the algorithms below — and picking the right one is as much about the problem's *constraints* as its *structure*.

### Dijkstra's Algorithm — weighted, non-negative weights only

**Approach:** greedy. Always expand the closest not-yet-finalized node next, using a min-heap to track "current best known distance" for every node. Every time you find a shorter route to a neighbor, push an updated entry.

**Code:**
```java
public int[] dijkstra(int n, List<List<int[]>> graph, int src) {
    // graph.get(u) contains int[]{neighbor, weight}
    int[] dist = new int[n];
    Arrays.fill(dist, Integer.MAX_VALUE);
    dist[src] = 0;

    PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> a[1] - b[1]); // {node, distance}
    pq.offer(new int[]{src, 0});

    while (!pq.isEmpty()) {
        int[] curr = pq.poll();
        int node = curr[0], d = curr[1];

        if (d > dist[node]) continue; // stale entry — a shorter path was already processed

        for (int[] edge : graph.get(node)) {
            int neighbor = edge[0], weight = edge[1];
            if (dist[node] + weight < dist[neighbor]) {
                dist[neighbor] = dist[node] + weight;
                pq.offer(new int[]{neighbor, dist[neighbor]});
            }
        }
    }
    return dist;
}
```

**Why it works:** once a node is popped from the heap, its distance is *final* — any other route to it would have to pass through a node that's farther away (otherwise the heap would have offered it first), so it can never be improved later. That guarantee is exactly what **negative weights would break**: a "farther" node now could turn out cheaper later via a negative edge, so the greedy finalize-and-never-revisit logic silently gives wrong answers with no error thrown. Java's `PriorityQueue` also has no efficient decrease-key operation, so the standard interview-friendly workaround is **lazy deletion**: push a new entry every time you improve a distance, and skip stale ones on pop via `if (d > dist[node]) continue;` — memorize this line, it's the detail people forget under pressure.

**Complexity:** O((V+E) log V) with a binary heap.

**Interview angle:** Network Delay Time (textbook Dijkstra), Path With Minimum Effort (same shell, different relaxation condition — "cost" becomes max-edge-on-path instead of sum), Cheapest Flights Within K Stops (needs a stops-count dimension added to the state — a good example of "know the base algorithm well enough to adapt it").

### Bellman-Ford — handles negative weights, detects negative cycles

**Approach:** relax *every* edge, `V−1` times. Since any shortest path uses at most `V−1` edges, `V−1` full rounds guarantees you've converged. A `V`-th round that still finds an improvement means a negative cycle exists (distances would shrink forever).

**Code:**
```java
public int[] bellmanFord(int n, int[][] edges, int src) {
    int[] dist = new int[n];
    Arrays.fill(dist, Integer.MAX_VALUE);
    dist[src] = 0;

    for (int i = 0; i < n - 1; i++) {
        for (int[] edge : edges) {
            int u = edge[0], v = edge[1], w = edge[2];
            if (dist[u] != Integer.MAX_VALUE && dist[u] + w < dist[v]) {
                dist[v] = dist[u] + w;
            }
        }
    }

    // one extra pass: if anything still improves, a negative cycle exists
    for (int[] edge : edges) {
        int u = edge[0], v = edge[1], w = edge[2];
        if (dist[u] != Integer.MAX_VALUE && dist[u] + w < dist[v]) {
            // negative cycle detected
        }
    }
    return dist;
}
```
**Complexity:** O(V·E) — much slower than Dijkstra, so only reach for it when the problem explicitly allows negative weights or asks you to detect a cycle that could shrink cost indefinitely (e.g., arbitrage-style questions).

### Floyd-Warshall — all-pairs shortest path

**Approach:** DP over "which intermediate nodes am I allowed to route through?" `dist[i][j]` improves whenever routing through some node `k` is cheaper than the direct-so-far route.

**Code:**
```java
public int[][] floydWarshall(int n, int[][] dist) {
    // dist[i][j] pre-filled with edge weight if it exists, 0 if i == j, a large sentinel otherwise
    for (int k = 0; k < n; k++) {       // intermediate node — MUST be the outermost loop
        for (int i = 0; i < n; i++) {   // source
            for (int j = 0; j < n; j++) { // destination
                if (dist[i][k] + dist[k][j] < dist[i][j]) {
                    dist[i][j] = dist[i][k] + dist[k][j];
                }
            }
        }
    }
    return dist;
}
```
**Why it works:** by the time the `k` loop reaches value `k`, `dist[i][j]` already holds the shortest path using only intermediates `{0, ..., k-1}`. Allowing `k` itself as an extra option is a valid DP transition — but only if `k` is the *outer* loop, otherwise later iterations wouldn't have `dist[i][k]` and `dist[k][j]` fully finalized yet. **Watch the sentinel value:** initialize "no edge" to something like `Integer.MAX_VALUE / 2`, not the full `MAX_VALUE` — adding two `MAX_VALUE`s overflows and wraps to a negative number, silently corrupting the DP.

**Complexity:** O(V³) — only practical for smaller graphs (roughly V ≤ 400–500). Bonus: after running it, if any `dist[i][i] < 0`, that's a negative cycle.

**Bonus — DAG shortest path.** If you know the graph is a DAG, you can beat Dijkstra: topologically sort it (Section 9), then relax edges in that order in a single O(V+E) pass — no heap needed, since topological order already guarantees you process every node's predecessors before the node itself.

**Which one, when?**

| Situation | Algorithm |
|---|---|
| Unweighted | BFS |
| Weighted, non-negative, single source | Dijkstra |
| Weighted, negative edges possible | Bellman-Ford |
| Need all-pairs, graph is small | Floyd-Warshall |
| Known DAG | Topological sort + O(V+E) relaxation |

---

## 12. Minimum Spanning Tree (MST)

**What it is:** the subset of edges that connects every vertex with the minimum possible total weight, using exactly `V−1` edges and no cycles.

### Prim's Algorithm — grows the tree one node at a time

**Approach:** almost identical machinery to Dijkstra, but the priority queue tracks a different quantity: not "distance from the source," but **"cheapest single edge connecting this node to the tree so far."**

**Code:**
```java
public int primMST(int n, List<List<int[]>> graph) {
    boolean[] inMST = new boolean[n];
    PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> a[1] - b[1]); // {node, edge weight}
    pq.offer(new int[]{0, 0});
    int totalWeight = 0;
    int edgesUsed = 0;

    while (!pq.isEmpty() && edgesUsed < n) {
        int[] curr = pq.poll();
        int node = curr[0], weight = curr[1];
        if (inMST[node]) continue;

        inMST[node] = true;
        totalWeight += weight;
        edgesUsed++;

        for (int[] edge : graph.get(node)) {
            int neighbor = edge[0], w = edge[1];
            if (!inMST[neighbor]) {
                pq.offer(new int[]{neighbor, w});
            }
        }
    }
    return totalWeight;
}
```
**Why it works — and where it's easy to confuse with Dijkstra:** Dijkstra's heap key is "total distance from source so far." Prim's heap key is "weight of the one edge that would connect this specific node to the tree." That's the whole difference in code, but it's a completely different guarantee (shortest paths vs. minimum total connection cost) — say this distinction out loud if asked, it's a common interview probe.

### Kruskal's Algorithm — sort edges, add greedily if no cycle

**Approach:** sort all edges by weight ascending; walk through them, adding an edge only if its two endpoints aren't already connected (checked via Union-Find — Section 10).

**Code:**
```java
public int kruskalMST(int n, int[][] edges) {
    Arrays.sort(edges, (a, b) -> a[2] - b[2]); // sort by weight
    UnionFind uf = new UnionFind(n);
    int totalWeight = 0;
    int edgesUsed = 0;

    for (int[] edge : edges) {
        int u = edge[0], v = edge[1], w = edge[2];
        if (uf.union(u, v)) { // true only if they weren't already connected
            totalWeight += w;
            edgesUsed++;
            if (edgesUsed == n - 1) break;
        }
    }
    return totalWeight;
}
```

**Prim's vs. Kruskal's — which to reach for:** Prim's suits dense graphs and adjacency-list input (it grows outward like Dijkstra). Kruskal's suits sparse graphs and edge-list input (it needs to sort edges globally anyway). In an interview, let the *input format* decide: handed an edge list → Kruskal's is less code. Handed an adjacency list → Prim's fits more naturally.

**Interview angle:** Min Cost to Connect All Points, Connecting Cities With Minimum Cost, Optimize Water Distribution in a Village (a nice trick problem: model a "virtual node 0" connected to every house with the cost of building a well there, turning it into a pure MST problem).

---

## 13. Bipartite Graph Check

**What it means:** can you split all vertices into two groups such that every edge connects vertices from *different* groups (no edge stays within a group)? Equivalent framings: "can this graph be 2-colored so no adjacent nodes share a color," and "does this graph contain no odd-length cycle."

**Approach:** BFS (or DFS) while assigning alternating colors. Any time you find an edge to a node that's already the *same* color as the current node, the graph isn't bipartite.

**Code:**
```java
public boolean isBipartite(int[][] graph) {
    int n = graph.length;
    int[] color = new int[n]; // 0 = uncolored, 1 = color A, -1 = color B

    for (int i = 0; i < n; i++) {
        if (color[i] == 0) {
            if (!bfsColor(i, graph, color)) return false;
        }
    }
    return true;
}

private boolean bfsColor(int start, int[][] graph, int[] color) {
    Queue<Integer> queue = new LinkedList<>();
    queue.offer(start);
    color[start] = 1;

    while (!queue.isEmpty()) {
        int node = queue.poll();
        for (int neighbor : graph[node]) {
            if (color[neighbor] == 0) {
                color[neighbor] = -color[node]; // opposite color
                queue.offer(neighbor);
            } else if (color[neighbor] == color[node]) {
                return false; // same color as its own neighbor -> contradiction
            }
        }
    }
    return true;
}
```
**Why it works:** flipping the color at every edge is exactly trying to 2-color the graph; if that ever produces a contradiction (a node forced to be both colors relative to a neighbor), no valid bipartition exists. Looping over all `n` start points, same as Section 7, handles disconnected graphs — each component must be checked independently.

**Interview angle:** Is Graph Bipartite (direct), Possible Bipartition (same idea, dressed up as "split people into two groups given a list of enemy pairs").

---

## 14. Strongly Connected Components (SCC)

Only meaningful for **directed** graphs. An SCC is a maximal set of nodes where every node can reach every other node in the set, following edge directions.

### Kosaraju's Algorithm — two-pass DFS, easier to explain live

**Approach, in three steps:**
1. DFS the original graph, pushing each node onto a stack **on finish** (same finish-time idea as DFS topological sort).
2. Reverse every edge in the graph.
3. Pop nodes off the stack one at a time; for each unvisited one, DFS on the **reversed** graph — each resulting DFS tree is exactly one SCC.

**Code:**
```java
public List<List<Integer>> kosaraju(int n, Map<Integer, List<Integer>> graph) {
    Deque<Integer> stack = new ArrayDeque<>();
    boolean[] visited = new boolean[n];

    for (int i = 0; i < n; i++) {
        if (!visited[i]) fillOrder(i, graph, visited, stack);
    }

    Map<Integer, List<Integer>> reversed = reverseGraph(n, graph);

    Arrays.fill(visited, false);
    List<List<Integer>> sccs = new ArrayList<>();
    while (!stack.isEmpty()) {
        int node = stack.pop();
        if (!visited[node]) {
            List<Integer> component = new ArrayList<>();
            dfsCollect(node, reversed, visited, component);
            sccs.add(component);
        }
    }
    return sccs;
}

private void fillOrder(int node, Map<Integer, List<Integer>> graph, boolean[] visited, Deque<Integer> stack) {
    visited[node] = true;
    for (int neighbor : graph.getOrDefault(node, new ArrayList<>())) {
        if (!visited[neighbor]) fillOrder(neighbor, graph, visited, stack);
    }
    stack.push(node);
}

private Map<Integer, List<Integer>> reverseGraph(int n, Map<Integer, List<Integer>> graph) {
    Map<Integer, List<Integer>> reversed = new HashMap<>();
    for (int i = 0; i < n; i++) reversed.put(i, new ArrayList<>());
    for (int u : graph.keySet()) {
        for (int v : graph.get(u)) {
            reversed.get(v).add(u); // flip the direction
        }
    }
    return reversed;
}

private void dfsCollect(int node, Map<Integer, List<Integer>> graph, boolean[] visited, List<Integer> component) {
    visited[node] = true;
    component.add(node);
    for (int neighbor : graph.getOrDefault(node, new ArrayList<>())) {
        if (!visited[neighbor]) dfsCollect(neighbor, graph, visited, component);
    }
}
```
**Why it works:** processing nodes in *decreasing finish-time order* on the reversed graph guarantees you always start a new DFS from a node that cannot be reached from any not-yet-visited node in the original graph's SCC-condensation order — so each DFS on the reversed graph can never accidentally spill from one SCC into another. (This is genuinely one of the more subtle correctness arguments in this document — the mechanical steps are simple, the proof of why they work is the part worth just trusting and being able to state, rather than re-deriving live.)

**Complexity:** O(V+E) — three linear passes.

### Tarjan's Algorithm — single-pass, using discovery time + "low-link" values

**Approach:** track `disc[node]` (the order it was first visited) and `low[node]` (the *lowest* discovery time reachable from this node's subtree, including via one back-edge to an ancestor still being processed). A node is the **root of an SCC** exactly when `low[node] == disc[node]` — meaning nothing in its subtree can reach further back than itself.

**Code:**
```java
private int timer = 0;

public List<List<Integer>> tarjanSCC(int n, Map<Integer, List<Integer>> graph) {
    int[] disc = new int[n];
    int[] low = new int[n];
    boolean[] onStack = new boolean[n];
    Arrays.fill(disc, -1);
    Deque<Integer> stack = new ArrayDeque<>();
    List<List<Integer>> sccs = new ArrayList<>();

    for (int i = 0; i < n; i++) {
        if (disc[i] == -1) {
            tarjanDFS(i, graph, disc, low, onStack, stack, sccs);
        }
    }
    return sccs;
}

private void tarjanDFS(int node, Map<Integer, List<Integer>> graph, int[] disc, int[] low,
                        boolean[] onStack, Deque<Integer> stack, List<List<Integer>> sccs) {
    disc[node] = low[node] = timer++;
    stack.push(node);
    onStack[node] = true;

    for (int neighbor : graph.getOrDefault(node, new ArrayList<>())) {
        if (disc[neighbor] == -1) {
            tarjanDFS(neighbor, graph, disc, low, onStack, stack, sccs);
            low[node] = Math.min(low[node], low[neighbor]);
        } else if (onStack[neighbor]) {
            low[node] = Math.min(low[node], disc[neighbor]); // back edge to a node still being processed
        }
    }

    if (low[node] == disc[node]) { // root of an SCC
        List<Integer> component = new ArrayList<>();
        int w;
        do {
            w = stack.pop();
            onStack[w] = false;
            component.add(w);
        } while (w != node);
        sccs.add(component);
    }
}
```

**Interview angle:** SCC questions are less common at a typical L4/SDE3 bar than the earlier topics, but they *do* show up in "critical dependency" and compiler/cycle-collapsing framings, and bringing one up unprompted (when relevant) reads well in a bar-raiser round. Practically: be able to write Kosaraju's from memory (it's easier to narrate step by step), and understand Tarjan's conceptually well enough to recognize when a problem wants it — the low-link idea reappears identically in the next section.

---

## 15. Bridges & Articulation Points

This reuses the *exact same* low-link technique from Tarjan's SCC — worth noticing explicitly, because it means you're not learning a new algorithm here, just a new question to ask of the same machinery.

- **Bridge:** an edge whose removal increases the number of connected components.
- **Articulation point (cut vertex):** a node whose removal increases the number of connected components.

**Approach:** DFS while tracking `disc`/`low` as in Tarjan's. Edge `(u, v)` (where `v` is discovered via `u`) is a bridge exactly when `low[v] > disc[u]` — meaning nothing in `v`'s subtree has any way back to `u` or anything before `u` *except through this specific edge*.

**Code:**
```java
private int timer = 0;

public List<List<Integer>> findBridges(int n, Map<Integer, List<Integer>> graph) {
    int[] disc = new int[n];
    int[] low = new int[n];
    Arrays.fill(disc, -1);
    List<List<Integer>> bridges = new ArrayList<>();

    for (int i = 0; i < n; i++) {
        if (disc[i] == -1) {
            bridgeDFS(i, -1, graph, disc, low, bridges);
        }
    }
    return bridges;
}

private void bridgeDFS(int node, int parent, Map<Integer, List<Integer>> graph,
                        int[] disc, int[] low, List<List<Integer>> bridges) {
    disc[node] = low[node] = timer++;

    for (int neighbor : graph.getOrDefault(node, new ArrayList<>())) {
        if (neighbor == parent) continue; // skip the edge straight back to where we came from

        if (disc[neighbor] == -1) {
            bridgeDFS(neighbor, node, graph, disc, low, bridges);
            low[node] = Math.min(low[node], low[neighbor]);

            if (low[neighbor] > disc[node]) {
                bridges.add(Arrays.asList(node, neighbor));
            }
        } else {
            low[node] = Math.min(low[node], disc[neighbor]);
        }
    }
}
```
**A subtlety worth knowing even if you never hit it:** this code skips the parent edge *by node id*, which is correct for simple graphs (no repeated edges between the same pair). If the graph could have multiple parallel edges between the same two nodes, you'd need to skip by a specific *edge id* instead — otherwise a genuine second edge back to the parent gets wrongly treated as "the edge we arrived on." Interview graphs are simple graphs unless stated otherwise, but naming this edge case if asked shows real understanding of the algorithm rather than memorized code.

**Interview angle:** Critical Connections in a Network (LeetCode Hard) is essentially this algorithm end to end — a strong one to have fully ready for advanced rounds.

---

## 16. Other Patterns Worth Knowing

- **Clone Graph:** DFS or BFS while keeping a `HashMap<Node, Node>` from original nodes to their clones. The map is what lets you handle cycles safely — before recursing into a neighbor, check whether it's already been cloned, and if so just reuse that clone instead of recursing again (otherwise a cyclic graph recurses forever).
- **Word Ladder:** BFS where each "node" is a word, and an edge connects two words differing by exactly one letter. The graph is never built up front — you generate neighbors on the fly (try swapping each position through all 26 letters and check if the result is a valid word). A common optimization is bucketing words by a wildcard pattern (e.g., `h*t` for "hot", "hat") so you can find neighbors in roughly O(word length) instead of comparing every pair of words.
- **Course Schedule I vs. II:** the same in-degree/topological machinery (Section 9) — "does a valid order exist" (I) is a boolean, "produce the order" (II) returns the array. Recognize these as one algorithm with two return types, not two algorithms.
- **Graph coloring (general m-coloring):** NP-hard in general. Interview versions are almost always either the 2-coloring/bipartite special case (Section 13) or a small-k backtracking search — see your recursion/backtracking guide for the general backtracking template, since this is really a backtracking problem wearing a graph's clothes.
- **Eulerian Path/Circuit:** visits every *edge* exactly once (contrast with Hamiltonian, which visits every *node* once — much harder, NP-complete in general). An Eulerian circuit exists iff every vertex has even degree; an Eulerian path (not necessarily a circuit) exists iff exactly 0 or 2 vertices have odd degree. Rare in interviews, but "Reconstruct Itinerary" is built on exactly this idea.

---

## 17. How to Recognize a Graph Problem

This is the actual meta-skill — everything above is vocabulary, this is how you retrieve it under pressure.

| Signal in the problem statement | Likely concept |
|---|---|
| "connections," "network," "friends," "provinces" | Connected components / Union-Find |
| "minimum steps/moves," "shortest path" (no weights mentioned) | BFS |
| "minimum cost path," "cheapest," explicit weighted edges | Dijkstra (or Bellman-Ford if negatives are possible) |
| "prerequisite," "must complete X before Y," "build order" | Topological sort |
| "islands," "regions," any 2D grid with adjacency | Grid DFS/BFS |
| "connect all," "minimum cost to connect everything" | MST |
| "two groups," "can be divided," "enemies/rivals" | Bipartite check |
| "critical," "cannot be removed without disconnecting" | Bridges / articulation points |
| step-by-step transformation (words, states, board positions) | Implicit graph + BFS |

And the harder-to-spot case: **hidden graphs.** A tree is a graph. A grid is a graph. A game board or state machine is a graph (states = nodes, legal moves = edges). A dependency chain in a build system is a graph. If your problem is fundamentally about "things" and "relationships between things" — even if it's phrased as strings, numbers, or a matrix — model it as a graph and the rest of this document applies.

---

## 18. Step-by-Step Framework for Any Graph Question

1. **Confirm it's a graph problem**, even (especially) if it's disguised as a grid, a set of strings, or a list of dependencies.
2. **Pin down the properties**: directed or undirected? weighted or unweighted? could it contain cycles? is it guaranteed connected, or do you need to handle multiple components?
3. **Choose a representation** — default to adjacency list — and build it explicitly as your *first* coding step, from whatever raw format you're given.
4. **Match the ask to an algorithm** using the table in Section 17.
5. **Handle edge cases up front, out loud**: empty graph, a single node, a disconnected graph, self-loops, duplicate edges. Naming these before you code is a strong signal of experience.
6. **Code in a fixed order**: build the graph → initialize `visited`/`dist`/state arrays → run the traversal or algorithm → extract and format the final answer. Keeping these as separate, visible steps (rather than interleaving them) makes your code far easier to debug live.
7. **Dry-run on a tiny example** (3–5 nodes) before trusting the code. Almost all graph bugs live in visited-marking or the "did I loop over every component" step — not in the core algorithm — so this is exactly where a hand-trace catches the most.
8. **State the complexity out loud**, in terms of V and E, and *why* — interviewers are listening for the reasoning, not just the final Big-O.

---

## 19. Complexity Cheat Sheet

| Algorithm | Time | Space | Notes |
|---|---|---|---|
| BFS | O(V+E) | O(V) | Shortest path, unweighted |
| DFS | O(V+E) | O(V) | Recursion stack depth up to V |
| Union-Find (optimized) | ~O(α(n)) per op | O(V) | Practically O(1) |
| Topological Sort | O(V+E) | O(V) | DAG only |
| Dijkstra (binary heap) | O((V+E) log V) | O(V) | Non-negative weights only |
| Bellman-Ford | O(V·E) | O(V) | Handles negative weights |
| Floyd-Warshall | O(V³) | O(V²) | All-pairs, small graphs only |
| Prim's (heap) | O(E log V) | O(V) | MST, suits dense graphs |
| Kruskal's | O(E log E) | O(V) | MST, suits sparse/edge-list input |
| Bipartite check | O(V+E) | O(V) | 2-coloring via BFS/DFS |
| Kosaraju's SCC | O(V+E) | O(V) | Two-pass DFS |
| Tarjan's SCC / Bridges | O(V+E) | O(V) | Single-pass, low-link values |

---

## 20. Common Mistakes That Cost Marks

- **No visited set at all** → infinite loop the moment the graph has a cycle.
- **Only traversing from node 0** and assuming that covers everything → silently misses disconnected components. Always loop over *all* nodes and skip the ones already visited.
- **Using parent-tracking cycle detection on a directed graph.** It doesn't work — you need 3-state coloring (Section 8) instead, and being able to explain *why* is what separates memorized code from understanding.
- **Marking visited on dequeue in BFS** instead of on enqueue → the same node can be queued multiple times, wasting work and sometimes recording the wrong distance.
- **Forgetting the stale-entry check in Dijkstra** (`if (d > dist[node]) continue;`), or trying to mutate an existing heap entry in place — Java's `PriorityQueue` has no efficient decrease-key, so always push fresh and skip stale.
- **Deep recursion on a large, skewed graph** without acknowledging the stack-overflow risk or the iterative fallback.
- **Mixing up in-degree and out-degree** in topological sort — double-check which one you're decrementing.
- **Assuming Dijkstra tolerates negative weights.** It doesn't, and it fails silently — no exception, just a wrong answer.
- **Assuming no self-loops or duplicate edges** unless the problem says so explicitly — worth a 5-second clarifying question.

---

## 21. Practice Problems by Pattern

Work through these roughly top to bottom — each row builds on the previous section's algorithm.

- **Traversal basics:** Number of Islands, Flood Fill, Max Area of Island, Surrounded Regions
- **Connected components:** Number of Provinces, Number of Connected Components in an Undirected Graph, Friend Circles
- **Cycle detection:** Course Schedule, Redundant Connection, Graph Valid Tree
- **Topological sort:** Course Schedule II, Alien Dictionary, Minimum Height Trees
- **Union-Find:** Redundant Connection, Accounts Merge, Number of Islands II, Satisfiability of Equality Equations
- **BFS shortest path:** Rotting Oranges, Word Ladder, 01 Matrix, Shortest Path in Binary Matrix
- **Dijkstra / weighted shortest path:** Network Delay Time, Path With Minimum Effort, Cheapest Flights Within K Stops, Swim in Rising Water
- **MST:** Min Cost to Connect All Points, Connecting Cities With Minimum Cost
- **Bipartite:** Is Graph Bipartite, Possible Bipartition
- **SCC / Bridges (advanced):** Critical Connections in a Network
- **Clone / state-space:** Clone Graph, Word Ladder II

---

## 22. Copy-Paste Templates

If you remember nothing else before walking into an interview, be able to reproduce these four from memory — nearly everything above is a variation on one of them.

```java
// BFS
Queue<Integer> queue = new LinkedList<>();
Set<Integer> visited = new HashSet<>();
queue.offer(start);
visited.add(start);
while (!queue.isEmpty()) {
    int node = queue.poll();
    for (int neighbor : graph.getOrDefault(node, new ArrayList<>())) {
        if (!visited.contains(neighbor)) {
            visited.add(neighbor);
            queue.offer(neighbor);
        }
    }
}
```

```java
// DFS (recursive)
void dfs(int node, Map<Integer, List<Integer>> graph, Set<Integer> visited) {
    visited.add(node);
    for (int neighbor : graph.getOrDefault(node, new ArrayList<>())) {
        if (!visited.contains(neighbor)) dfs(neighbor, graph, visited);
    }
}
```

```java
// Union-Find core
int find(int x) {
    if (parent[x] != x) parent[x] = find(parent[x]);
    return parent[x];
}
boolean union(int x, int y) {
    int rx = find(x), ry = find(y);
    if (rx == ry) return false;
    parent[rx] = ry;
    return true;
}
```

```java
// Dijkstra core loop
PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> a[1] - b[1]);
pq.offer(new int[]{src, 0});
while (!pq.isEmpty()) {
    int[] curr = pq.poll();
    if (curr[1] > dist[curr[0]]) continue;
    for (int[] edge : graph.get(curr[0])) {
        int nd = dist[curr[0]] + edge[1];
        if (nd < dist[edge[0]]) {
            dist[edge[0]] = nd;
            pq.offer(new int[]{edge[0], nd});
        }
    }
}
```

---

*That's the full picture, from "what is a vertex" to bridges and SCCs. The fastest way to make it stick: pick 2–3 problems from Section 21 per pattern, solve them without looking back at the code above, and only check your work against these templates afterward.*