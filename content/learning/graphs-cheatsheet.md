# DSA Deep-Dive: Parts 12-21 (Graphs Through Interview Mastery)

> **Companion to your main guide, continuing from the Parts 1-11 deep-dive.** Parts 12-17 below get the same treatment as before: internals, harder variants, and 5-6 practice problems each with full Java solutions behind spoilers. Parts 18-21 are different in kind — a pattern-recognition table, a study plan, a communication framework, and a mistakes list aren't algorithms with code solutions, so they're deepened in the way that actually helps: recognition drills, a full mock-interview transcript, and diagnostic scenarios instead of forced code problems.

**How to use this:** same as before — attempt each practice problem yourself before opening the solution. For Part 18's triage drills, genuinely commit to an answer before revealing it; the value is in the guess, not the reveal.

---

# PART 12 DEEP-DIVE — Graphs

## 12.1 Representations, compared properly

| Representation | Space | Edge lookup | Iterate neighbors | Best for |
|---|---|---|---|---|
| Adjacency List | O(V + E) | O(degree) | O(degree) | Sparse graphs (most interview problems) |
| Adjacency Matrix | O(V²) | O(1) | O(V) | Dense graphs, or when you need instant "are u,v connected" checks |
| Edge List | O(E) | O(E) | O(E) | Algorithms that process ALL edges at once (Kruskal's needs to sort them, Bellman-Ford needs to relax them all repeatedly) |

Default to adjacency list unless the problem specifically hands you a matrix or needs O(1) edge lookups.

## 12.2 Iterative DFS — avoiding stack overflow on deep/large graphs
Recursive DFS uses the call stack implicitly; on a graph with a very long path (or an adversarially deep tree), this can `StackOverflowError` in Java (no tail-call optimization — see Part 7 deep-dive). An explicit stack sidesteps this:
```java
public void dfsIterative(int start, Map<Integer, List<Integer>> graph) {
    Set<Integer> visited = new HashSet<>();
    Deque<Integer> stack = new ArrayDeque<>();
    stack.push(start);
    while (!stack.isEmpty()) {
        int node = stack.pop();
        if (visited.contains(node)) continue;   // check on POP, not just on push
        visited.add(node);
        // process node here
        for (int neighbor : graph.getOrDefault(node, new ArrayList<>())) {
            if (!visited.contains(neighbor)) stack.push(neighbor);
        }
    }
}
```
**Note:** this may visit neighbors in a different order than the recursive version (stack is LIFO, so the last-pushed neighbor gets explored first) — if a problem depends on visiting order, be explicit about which order you need.

## 12.3 Multi-source BFS — starting from MANY nodes simultaneously
When multiple starting points all begin "spreading" at the same time (rotting oranges spreading to neighbors, multiple fire sources spreading through a grid), seed the BFS queue with ALL starting nodes before the first level, rather than running single-source BFS from each one separately (which would give the wrong "simultaneous spread" semantics and be slower).

```java
// Rotting Oranges: every rotten orange (2) rots ALL adjacent fresh oranges (1) simultaneously, each minute
public int orangesRotting(int[][] grid) {
    int rows = grid.length, cols = grid[0].length;
    Deque<int[]> queue = new ArrayDeque<>();
    int fresh = 0;
    for (int r = 0; r < rows; r++) {
        for (int c = 0; c < cols; c++) {
            if (grid[r][c] == 2) queue.offer(new int[]{r, c});   // seed with EVERY rotten orange at once
            else if (grid[r][c] == 1) fresh++;
        }
    }
    int[][] dirs = {{0,1},{0,-1},{1,0},{-1,0}};
    int minutes = 0;
    while (!queue.isEmpty() && fresh > 0) {
        int size = queue.size();
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
        minutes++;
    }
    return fresh == 0 ? minutes : -1;
}
// The "levelSize snapshot" trick from Part 10's tree BFS is exactly what tracks MINUTES here too
```

## 12.4 Grid problems — 8-directional variant and boundary discipline
Some grid problems allow diagonal moves too — just extend the `directions` array:
```java
int[][] dirs8 = {{-1,-1},{-1,0},{-1,1},{0,-1},{0,1},{1,-1},{1,0},{1,1}};
```
Always bounds-check with the SAME pattern every time (`nr >= 0 && nr < rows && nc >= 0 && nc < cols`) — writing this slightly differently each time is a common source of off-by-one bugs under interview pressure. Consider extracting it into a small helper if you're doing several grid problems in one session.

## 12.5 Topological Sort — the DFS-based approach + proper cycle detection
The main guide covers Kahn's algorithm (BFS-based). The DFS-based alternative uses **3-state coloring**, and is worth knowing because the "why" behind it teaches something Kahn's doesn't make explicit:

```java
// 0 = unvisited (white), 1 = in progress / on the CURRENT DFS path (gray), 2 = fully explored (black)
public boolean canFinish(int numCourses, int[][] prerequisites) {
    List<List<Integer>> graph = new ArrayList<>();
    for (int i = 0; i < numCourses; i++) graph.add(new ArrayList<>());
    for (int[] p : prerequisites) graph.get(p[1]).add(p[0]);   // p[1] must be taken before p[0]

    int[] state = new int[numCourses];
    for (int i = 0; i < numCourses; i++) {
        if (state[i] == 0 && hasCycle(i, graph, state)) return false;
    }
    return true;
}
private boolean hasCycle(int node, List<List<Integer>> graph, int[] state) {
    state[node] = 1;                              // mark as currently "in progress"
    for (int neighbor : graph.get(node)) {
        if (state[neighbor] == 1) return true;      // hit a GRAY node -- a back-edge to our own current path = cycle
        if (state[neighbor] == 0 && hasCycle(neighbor, graph, state)) return true;
    }
    state[node] = 2;                               // fully explored, provably cycle-free from here
    return false;
}
```
**Why you need 3 states, not just a boolean `visited`:** a plain `visited` set can't distinguish "this node is an ancestor of mine on the current path" (gray — a cycle) from "this node was already fully explored via a totally different path" (black — perfectly fine, not a cycle). Collapsing these into one boolean is a common source of false-positive cycle detection.

**Getting the actual order (not just yes/no):** do a postorder DFS (add each node to a list AFTER exploring all its neighbors), then REVERSE that list — that reversed postorder is a valid topological order.

## 12.6 Union-Find — deeper: alternative optimizations
Union by SIZE (attach the smaller tree under the larger one, tracking subtree size instead of rank) is equally valid to union by rank and arguably more intuitive:
```java
class UnionFind {
    int[] parent, size;
    UnionFind(int n) {
        parent = new int[n]; size = new int[n];
        for (int i = 0; i < n; i++) { parent[i] = i; size[i] = 1; }
    }
    int find(int x) {
        while (parent[x] != x) {
            parent[x] = parent[parent[x]];   // path HALVING -- point to grandparent, iterative, no recursion needed
            x = parent[x];
        }
        return x;
    }
    boolean union(int x, int y) {
        int rootX = find(x), rootY = find(y);
        if (rootX == rootY) return false;
        if (size[rootX] < size[rootY]) { int t = rootX; rootX = rootY; rootY = t; }
        parent[rootY] = rootX;
        size[rootX] += size[rootY];
        return true;
    }
}
```
**Path halving vs. the recursive path compression from the main guide:** both achieve the same near-O(1) amortized complexity; path halving is iterative (no recursion call overhead, marginally faster in practice), while recursive path compression fully flattens the tree in one pass. Either is a completely acceptable interview answer — pick whichever you find easier to write correctly under pressure.

## 12.7 Beyond Dijkstra: negative weights and all-pairs shortest paths

**Why Dijkstra breaks with negative edge weights:** once Dijkstra pops a node off the priority queue, it treats that node's shortest distance as FINAL and never revisits it. But a negative edge discovered later could still offer a shorter path to an already-"finalized" node — violating the greedy assumption the whole algorithm rests on.

**Bellman-Ford — handles negative weights, and detects negative cycles:**
```java
public int[] bellmanFord(int n, int[][] edges, int src) {
    int[] dist = new int[n];
    Arrays.fill(dist, Integer.MAX_VALUE);
    dist[src] = 0;
    for (int i = 0; i < n - 1; i++) {                 // relax every edge, n-1 times
        for (int[] edge : edges) {
            int u = edge[0], v = edge[1], w = edge[2];
            if (dist[u] != Integer.MAX_VALUE && dist[u] + w < dist[v]) {
                dist[v] = dist[u] + w;
            }
        }
    }
    for (int[] edge : edges) {                          // one more pass: if anything STILL improves, there's a negative cycle
        int u = edge[0], v = edge[1], w = edge[2];
        if (dist[u] != Integer.MAX_VALUE && dist[u] + w < dist[v]) {
            throw new IllegalStateException("Graph contains a negative weight cycle");
        }
    }
    return dist;
}
// O(V*E) -- much slower than Dijkstra's O((V+E) log V), but the price you pay for handling negative weights
```
**Why "n-1 relaxations" is enough:** the shortest path between any two nodes in a graph with no negative cycle visits at most n-1 edges (a simple path can't revisit a node). After n-1 full relaxation passes, every shortest path has been "found," so a change on pass n proves a negative cycle exists.

**Floyd-Warshall — all-pairs shortest paths, O(V³), a DP formulation worth recognizing:**
```java
// dist[i][j] initialized to the direct edge weight (or infinity if no direct edge, 0 if i==j)
for (int k = 0; k < n; k++) {
    for (int i = 0; i < n; i++) {
        for (int j = 0; j < n; j++) {
            if (dist[i][k] + dist[k][j] < dist[i][j]) {
                dist[i][j] = dist[i][k] + dist[k][j];      // "is it shorter to route through k?"
            }
        }
    }
}
```
Use this when you need shortest paths between EVERY pair of nodes (not just from one source), and the graph is small/dense enough that O(V³) is acceptable.

## 12.8 Prim's Algorithm — the other MST algorithm
```java
public int primMST(int n, List<int[]>[] graph) {
    boolean[] inMST = new boolean[n];
    PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> a[1] - b[1]);   // {node, edge weight to reach it}
    pq.offer(new int[]{0, 0});
    int totalWeight = 0, edgesUsed = 0;
    while (!pq.isEmpty() && edgesUsed < n) {
        int[] curr = pq.poll();
        int node = curr[0], weight = curr[1];
        if (inMST[node]) continue;
        inMST[node] = true;
        totalWeight += weight;
        edgesUsed++;
        for (int[] edge : graph[node]) {
            if (!inMST[edge[0]]) pq.offer(new int[]{edge[0], edge[1]});
        }
    }
    return totalWeight;
}
```
**Kruskal's vs. Prim's:** Kruskal's is edge-centric ("grow a forest, always add the globally cheapest edge that doesn't create a cycle," uses Union-Find) — usually the shorter, easier-to-write choice for interviews. Prim's is node-centric ("grow one tree outward, always add the cheapest edge connecting the tree to something new," uses a heap, structurally similar to Dijkstra) — better suited when the graph is dense or given as an adjacency matrix. Default to Kruskal's unless there's a specific reason to prefer Prim's.

## 12.9 Bipartite Graph Check (2-coloring via BFS)
```java
public boolean isBipartite(int[][] graph) {
    int n = graph.length;
    int[] color = new int[n];    // 0 = uncolored, 1 / -1 = the two colors
    for (int i = 0; i < n; i++) {
        if (color[i] != 0) continue;
        color[i] = 1;
        Deque<Integer> queue = new ArrayDeque<>();
        queue.offer(i);
        while (!queue.isEmpty()) {
            int node = queue.poll();
            for (int neighbor : graph[node]) {
                if (color[neighbor] == 0) {
                    color[neighbor] = -color[node];         // must be the OPPOSITE color
                    queue.offer(neighbor);
                } else if (color[neighbor] == color[node]) {
                    return false;                              // same color as a neighbor -- odd cycle, not bipartite
                }
            }
        }
    }
    return true;
}
```

## Practice Problems — Part 12

**12.P1 — Number of Provinces** (count connected components from an adjacency matrix).
<details><summary>Solution</summary>

```java
public int findCircleNum(int[][] isConnected) {
    int n = isConnected.length;
    UnionFind uf = new UnionFind(n);
    int provinces = n;
    for (int i = 0; i < n; i++) {
        for (int j = i + 1; j < n; j++) {
            if (isConnected[i][j] == 1 && uf.union(i, j)) provinces--;   // union() returns false if already connected
        }
    }
    return provinces;
}
// reuse the UnionFind class from 12.6 above
```
</details>

**12.P2 — Course Schedule II** (return an actual valid course order, or empty if impossible).
<details><summary>Solution</summary>

```java
public int[] findOrder(int numCourses, int[][] prerequisites) {
    List<List<Integer>> graph = new ArrayList<>();
    int[] inDegree = new int[numCourses];
    for (int i = 0; i < numCourses; i++) graph.add(new ArrayList<>());
    for (int[] p : prerequisites) { graph.get(p[1]).add(p[0]); inDegree[p[0]]++; }

    Deque<Integer> queue = new ArrayDeque<>();
    for (int i = 0; i < numCourses; i++) if (inDegree[i] == 0) queue.offer(i);

    int[] order = new int[numCourses];
    int idx = 0;
    while (!queue.isEmpty()) {
        int node = queue.poll();
        order[idx++] = node;
        for (int next : graph.get(node)) {
            if (--inDegree[next] == 0) queue.offer(next);
        }
    }
    return idx == numCourses ? order : new int[0];
}
```
</details>

**12.P3 — Network Delay Time** (Dijkstra application: time for a signal to reach all nodes from node k).
<details><summary>Solution</summary>

```java
public int networkDelayTime(int[][] times, int n, int k) {
    List<int[]>[] graph = new List[n + 1];
    for (int i = 1; i <= n; i++) graph[i] = new ArrayList<>();
    for (int[] t : times) graph[t[0]].add(new int[]{t[1], t[2]});

    int[] dist = new int[n + 1];
    Arrays.fill(dist, Integer.MAX_VALUE);
    dist[k] = 0;
    PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> a[1] - b[1]);
    pq.offer(new int[]{k, 0});
    while (!pq.isEmpty()) {
        int[] curr = pq.poll();
        int node = curr[0], d = curr[1];
        if (d > dist[node]) continue;
        for (int[] edge : graph[node]) {
            int next = edge[0], w = edge[1];
            if (dist[node] + w < dist[next]) {
                dist[next] = dist[node] + w;
                pq.offer(new int[]{next, dist[next]});
            }
        }
    }
    int maxDist = 0;
    for (int i = 1; i <= n; i++) {
        if (dist[i] == Integer.MAX_VALUE) return -1;
        maxDist = Math.max(maxDist, dist[i]);
    }
    return maxDist;
}
```
</details>

**12.P4 — Redundant Connection** (find the one edge that, if removed, turns the graph back into a tree).
<details><summary>Solution</summary>

```java
public int[] findRedundantConnection(int[][] edges) {
    UnionFind uf = new UnionFind(edges.length + 1);
    for (int[] edge : edges) {
        if (!uf.union(edge[0], edge[1])) return edge;   // this edge connects two ALREADY-connected nodes -- it's the culprit
    }
    return new int[0];
}
```
</details>

**12.P5 — Word Ladder** (shortest transformation sequence between two words, one letter at a time, each intermediate word must be in a dictionary).
<details><summary>Solution</summary>

```java
public int ladderLength(String beginWord, String endWord, List<String> wordList) {
    Set<String> dict = new HashSet<>(wordList);
    if (!dict.contains(endWord)) return 0;
    Deque<String> queue = new ArrayDeque<>();
    queue.offer(beginWord);
    Set<String> visited = new HashSet<>();
    visited.add(beginWord);
    int steps = 1;
    while (!queue.isEmpty()) {
        int size = queue.size();
        for (int i = 0; i < size; i++) {
            char[] word = queue.poll().toCharArray();
            for (int j = 0; j < word.length; j++) {
                char original = word[j];
                for (char c = 'a'; c <= 'z'; c++) {
                    word[j] = c;
                    String next = new String(word);
                    if (next.equals(endWord)) return steps + 1;
                    if (dict.contains(next) && !visited.contains(next)) {
                        visited.add(next);
                        queue.offer(next);
                    }
                }
                word[j] = original;
            }
        }
        steps++;
    }
    return 0;
}
// O(M^2 * N) -- M = word length, N = dictionary size. Each word tries M positions * 26 letters = M*26 variations.
// This is BFS on an IMPLICIT graph -- nodes are words, edges connect words that differ by one letter, never built explicitly.
```
</details>

**12.P6 — Cheapest Flights Within K Stops** (shortest path with a hop-count LIMIT — the classic "why doesn't Dijkstra just work here" trap).
<details><summary>Solution</summary>

```java
public int findCheapestPrice(int n, int[][] flights, int src, int dst, int k) {
    int[] dist = new int[n];
    Arrays.fill(dist, Integer.MAX_VALUE);
    dist[src] = 0;
    for (int i = 0; i <= k; i++) {                    // relax edges at most k+1 times (k stops = k+1 edges)
        int[] temp = dist.clone();                      // MUST snapshot -- see explanation below
        for (int[] flight : flights) {
            int u = flight[0], v = flight[1], w = flight[2];
            if (dist[u] != Integer.MAX_VALUE && dist[u] + w < temp[v]) {
                temp[v] = dist[u] + w;
            }
        }
        dist = temp;
    }
    return dist[dst] == Integer.MAX_VALUE ? -1 : dist[dst];
}
```
**Why Dijkstra doesn't directly apply here:** Dijkstra's greedy "finalize once popped" logic has no concept of a hop-count budget — a longer-but-fewer-hops path could beat a shorter-but-more-hops one within the limit, which plain Dijkstra can't represent. This is a Bellman-Ford variant instead. **Why `temp = dist.clone()` matters:** without a snapshot, you could use a flight that was ALREADY relaxed earlier in the very same round, silently allowing more than `k+1` hops — the snapshot forces every flight in a round to read from the previous round's finalized distances only.
</details>


---

# PART 13 DEEP-DIVE — Tries

## 13.1 Array children vs. HashMap children — the real tradeoff
```java
TrieNode[] children = new TrieNode[26];              // faster (direct indexing), locked to a known alphabet
Map<Character, TrieNode> children = new HashMap<>();   // slightly slower (hashing), supports ANY character set
```
Use the array when a problem guarantees lowercase `a-z` (very common on LeetCode-style problems); use the HashMap when the alphabet is unknown, mixed-case, or includes digits/symbols — or when you need to easily check `children.isEmpty()`, which the deletion operation below relies on.

## 13.2 Deleting a word from a Trie
Deletion is more subtle than insert/search: you can only remove a node if it has no children AND isn't the end of some OTHER word.
```java
class TrieNode {
    Map<Character, TrieNode> children = new HashMap<>();
    boolean isEndOfWord = false;
}

public boolean delete(TrieNode root, String word) {
    return deleteHelper(root, word, 0);
}
// returns true if the CALLER should delete its link to this node (i.e. this node now serves no purpose)
private boolean deleteHelper(TrieNode node, String word, int depth) {
    if (depth == word.length()) {
        if (!node.isEndOfWord) return false;        // word isn't actually present
        node.isEndOfWord = false;
        return node.children.isEmpty();                // safe to unlink if this node has no other words passing through it
    }
    char c = word.charAt(depth);
    TrieNode child = node.children.get(c);
    if (child == null) return false;
    boolean shouldUnlink = deleteHelper(child, word, depth + 1);
    if (shouldUnlink) {
        node.children.remove(c);
        return node.children.isEmpty() && !node.isEndOfWord;   // propagate the same question up to OUR parent
    }
    return false;
}
```

## 13.3 Word Search II — Trie + Backtracking combined (a genuine "hard" problem)
```java
class TrieNode {
    Map<Character, TrieNode> children = new HashMap<>();
    String word = null;   // storing the full word at the terminal node (instead of a boolean) makes collection trivial
}

public List<String> findWords(char[][] board, String[] words) {
    TrieNode root = buildTrie(words);
    List<String> result = new ArrayList<>();
    for (int r = 0; r < board.length; r++) {
        for (int c = 0; c < board[0].length; c++) {
            dfs(board, r, c, root, result);
        }
    }
    return result;
}
private TrieNode buildTrie(String[] words) {
    TrieNode root = new TrieNode();
    for (String word : words) {
        TrieNode node = root;
        for (char c : word.toCharArray()) {
            node.children.putIfAbsent(c, new TrieNode());
            node = node.children.get(c);
        }
        node.word = word;
    }
    return root;
}
private void dfs(char[][] board, int r, int c, TrieNode node, List<String> result) {
    char ch = board[r][c];
    if (ch == '#' || !node.children.containsKey(ch)) return;
    TrieNode next = node.children.get(ch);
    if (next.word != null) {
        result.add(next.word);
        next.word = null;         // prevents adding the same word twice if the grid allows multiple paths to it
    }
    board[r][c] = '#';              // Part 7's in-place visited-marking trick
    int[][] dirs = {{0,1},{0,-1},{1,0},{-1,0}};
    for (int[] d : dirs) {
        int nr = r + d[0], nc = c + d[1];
        if (nr >= 0 && nr < board.length && nc >= 0 && nc < board[0].length) {
            dfs(board, nr, nc, next, result);
        }
    }
    board[r][c] = ch;               // restore
}
```
**Why this crushes running Word Search (Part 7) once per word:** with M words to search for, running single-word Word Search M separate times re-scans the grid from scratch M times. Building ONE trie of all M words first lets a SINGLE grid traversal search for all of them simultaneously, sharing the work of any common prefixes across words automatically.

## 13.4 Autocomplete — the design sketch behind it
An autocomplete system stores a trie where each node also tracks something like "top N most frequent completions from here" (either computed lazily via a DFS collecting all words below a prefix node then sorting by frequency, or maintained incrementally as words are typed). The core reason a trie is the right structure at all: an autocomplete query is always "give me things starting with THIS prefix" — which is precisely what walking down a trie by characters answers in O(prefix length), completely independent of how many total words are stored.

## 13.5 Bit Tries — a preview
Just as a normal trie branches on CHARACTERS, a "bit trie" branches on the BITS of a number's binary representation (see Part 16.2's Maximum XOR of Two Numbers problem below, and this doc's Part 13.P2) — same data structure, different alphabet (just `{0, 1}` instead of `{a...z}`).

## Practice Problems — Part 13

**13.P1 — Replace Words** (replace each word in a sentence with its shortest root from a dictionary, if one exists).
<details><summary>Solution</summary>

```java
class TrieNode {
    Map<Character, TrieNode> children = new HashMap<>();
    String word = null;
}

public String replaceWords(List<String> dictionary, String sentence) {
    TrieNode root = new TrieNode();
    for (String word : dictionary) {
        TrieNode node = root;
        for (char c : word.toCharArray()) {
            node.children.putIfAbsent(c, new TrieNode());
            node = node.children.get(c);
        }
        node.word = word;
    }
    StringBuilder result = new StringBuilder();
    for (String token : sentence.split(" ")) {
        result.append(findRoot(root, token)).append(" ");
    }
    return result.toString().trim();
}
private String findRoot(TrieNode root, String word) {
    TrieNode node = root;
    for (char c : word.toCharArray()) {
        if (!node.children.containsKey(c)) break;
        node = node.children.get(c);
        if (node.word != null) return node.word;    // shortest matching root found -- stop immediately
    }
    return word;    // no root matched, keep the original word
}
```
</details>

**13.P2 — Maximum XOR of Two Numbers in an Array** (a bit-trie application, previews Part 16).
<details><summary>Solution</summary>

```java
class TrieNode {
    TrieNode[] bitChildren = new TrieNode[2];
}

public int findMaximumXOR(int[] nums) {
    TrieNode root = new TrieNode();
    for (int num : nums) {
        TrieNode node = root;
        for (int i = 31; i >= 0; i--) {
            int bit = (num >> i) & 1;
            if (node.bitChildren[bit] == null) node.bitChildren[bit] = new TrieNode();
            node = node.bitChildren[bit];
        }
    }
    int maxXor = 0;
    for (int num : nums) {
        TrieNode node = root;
        int currXor = 0;
        for (int i = 31; i >= 0; i--) {
            int bit = (num >> i) & 1;
            int toggled = 1 - bit;
            if (node.bitChildren[toggled] != null) {     // greedily prefer the OPPOSITE bit -- maximizes XOR here
                currXor |= (1 << i);
                node = node.bitChildren[toggled];
            } else {
                node = node.bitChildren[bit];
            }
        }
        maxXor = Math.max(maxXor, currXor);
    }
    return maxXor;
}
// O(32n) = O(n) -- for each number, greedily walk the trie preferring the bit that maximizes XOR at each position
```
</details>

**13.P3 — Design Add and Search Words** (supports `.` as a wildcard matching any single character).
<details><summary>Solution</summary>

```java
class TrieNode {
    Map<Character, TrieNode> children = new HashMap<>();
    boolean isEnd = false;
}

class WordDictionary {
    TrieNode root = new TrieNode();

    public void addWord(String word) {
        TrieNode node = root;
        for (char c : word.toCharArray()) {
            node.children.putIfAbsent(c, new TrieNode());
            node = node.children.get(c);
        }
        node.isEnd = true;
    }

    public boolean search(String word) {
        return dfs(word, 0, root);
    }
    private boolean dfs(String word, int idx, TrieNode node) {
        if (idx == word.length()) return node.isEnd;
        char c = word.charAt(idx);
        if (c == '.') {
            for (TrieNode child : node.children.values()) {   // try EVERY possible character at a wildcard position
                if (dfs(word, idx + 1, child)) return true;
            }
            return false;
        }
        TrieNode child = node.children.get(c);
        return child != null && dfs(word, idx + 1, child);
    }
}
```
</details>

**13.P4 — Longest Word in Dictionary** (find the longest word that can be built one character at a time, where every prefix along the way is also a word in the dictionary).
<details><summary>Hint + Solution</summary>
Hint: a plain `HashSet` of "words built so far" is actually simpler here than a full Trie DFS — worth recognizing that not every trie-flavored problem needs an explicit trie.

```java
public String longestWord(String[] words) {
    Arrays.sort(words);                 // lexicographic order -- ensures ties resolve to the lexicographically smallest word
    Set<String> built = new HashSet<>();
    built.add("");
    String result = "";
    for (String word : words) {
        if (built.contains(word.substring(0, word.length() - 1))) {
            built.add(word);
            if (word.length() > result.length()) result = word;
        }
    }
    return result;
}
```
</details>


---

# PART 14 DEEP-DIVE — Dynamic Programming (the topic worth the most time)

## 14.1 The 5-step process, actually walked through (not just presented)
Let's derive **House Robber** completely from scratch, thinking exactly as you would live in an interview — not just reading the finished recurrence.

*"An array of house values; can't rob two adjacent houses; maximize total value robbed."*

**Step 1 — Define the state.** First instinct: let `dp[i]` = the maximum amount robbable considering only houses `0` through `i`. (This is a reasonable first guess — we'll check if it holds up.)

**Step 2 — Write the recurrence.** At house `i`, there are exactly two choices: **don't** rob it (best is whatever we already had: `dp[i-1]`), or **do** rob it (which means house `i-1` must NOT have been robbed, so it's `nums[i] + dp[i-2]`). Take the better of the two: `dp[i] = max(dp[i-1], nums[i] + dp[i-2])`.

**Step 3 — Base cases.** `dp[0] = nums[0]` (only one house — rob it, since we want the max). `dp[1] = max(nums[0], nums[1])` (two houses, can only take one).

**Step 4 — Order of computation.** Left to right — `dp[i]` only ever depends on strictly smaller indices, so a simple forward loop is a valid bottom-up order.

**Step 5 — Final answer.** `dp[n-1]`.

That's the entire process, and it directly produces the code from the main guide. **The skill to practice is steps 1-2** — everything else is mechanical once those are right. When you're stuck on a new DP problem, explicitly write out steps 1 and 2 in plain English BEFORE touching code — most stuck-ness is actually vague-state-definition, not a coding problem.

## 14.2 When your state needs MORE than one dimension
**Rule of thumb:** add a dimension whenever the recurrence needs to know something beyond "which index am I at" to make a legal decision.

```java
// Best Time to Buy/Sell Stock WITH COOLDOWN -- state = (day, currently holding or not)
public int maxProfit(int[] prices) {
    int n = prices.length;
    if (n == 0) return 0;
    int[][] dp = new int[n][2];       // dp[i][0] = max profit day i NOT holding; dp[i][1] = max profit day i HOLDING
    dp[0][0] = 0;
    dp[0][1] = -prices[0];
    for (int i = 1; i < n; i++) {
        dp[i][0] = Math.max(dp[i-1][0], dp[i-1][1] + prices[i]);         // sold today, or already wasn't holding
        int cooldownSource = (i >= 2) ? dp[i-2][0] : 0;
        dp[i][1] = Math.max(dp[i-1][1], cooldownSource - prices[i]);      // still holding, or bought today (after cooldown)
    }
    return dp[n-1][0];
}
```
**Why the second dimension is unavoidable here:** "best profit through day i" isn't fully determined by the day alone — the SAME day can have two different "best profits" depending on whether you're currently holding stock, since that determines which actions are even legal (you can't sell what you don't hold, can't buy while already holding).

## 14.3 Subsequence DP vs. Substring/Subarray DP — know which one you're in
- **Subsequence** (order preserved, gaps allowed — elements can be "skipped"): Longest Increasing Subsequence, Longest Common Subsequence. Recurrences usually include an explicit "skip this element" transition.
- **Substring/Subarray** (must be contiguous, no gaps): Maximum Subarray (Kadane's), Longest Palindromic Substring. Recurrences only ever "extend the current run" or "restart here" — never skip ahead.

Misidentifying which type you're solving leads to a recurrence that's subtly wrong in a way that's hard to debug — explicitly ask yourself "can I skip elements, or must this stay contiguous?" before writing the recurrence.

## 14.4 Space optimization: the rolling-array technique, and why direction matters
```java
// 0/1 Knapsack, compressed from O(n * capacity) space down to O(capacity)
public int knapsack(int[] weights, int[] values, int capacity) {
    int[] dp = new int[capacity + 1];
    for (int i = 0; i < weights.length; i++) {
        for (int w = capacity; w >= weights[i]; w--) {     // iterate BACKWARD -- this is the entire trick
            dp[w] = Math.max(dp[w], dp[w - weights[i]] + values[i]);
        }
    }
    return dp[capacity];
}
```
**Why backward, specifically:** `dp[w]` needs `dp[w - weight]` as it stood BEFORE the current item was considered (i.e., the previous row, in the un-compressed 2D version). Iterating forward would risk reading a `dp[w - weight]` that this SAME inner loop pass already updated for the current item — silently allowing that item to be used twice. Iterating backward guarantees every read comes from an untouched, still-"previous-row" value.

**Contrast with Coin Change (unbounded knapsack, reuse allowed)** — main guide Part 14.5 — which iterates FORWARD on purpose. That forward direction is precisely the mechanism that permits reusing the same coin multiple times. Same-looking code, opposite direction, opposite semantics — a genuinely important detail to internalize, not just memorize.

## 14.5 Edit Distance — the other classic 2D string-DP grid
```java
public int minDistance(String word1, String word2) {
    int m = word1.length(), n = word2.length();
    int[][] dp = new int[m + 1][n + 1];
    for (int i = 0; i <= m; i++) dp[i][0] = i;    // delete all of word1[0..i) to match empty word2
    for (int j = 0; j <= n; j++) dp[0][j] = j;    // insert all of word2[0..j)

    for (int i = 1; i <= m; i++) {
        for (int j = 1; j <= n; j++) {
            if (word1.charAt(i - 1) == word2.charAt(j - 1)) {
                dp[i][j] = dp[i - 1][j - 1];                          // chars match -- no operation needed
            } else {
                dp[i][j] = 1 + Math.min(dp[i-1][j-1],                  // replace
                                 Math.min(dp[i-1][j],                    // delete from word1
                                           dp[i][j-1]));                  // insert into word1
            }
        }
    }
    return dp[m][n];
}
```
This is the SAME grid shape as Longest Common Subsequence (main guide Part 14.7) — "two strings → build a 2D grid → compare characters diagonally." Recognizing this shared family (LCS, Edit Distance, Distinct Subsequences all live here, differing only in their transition rules) is more valuable than memorizing each one as a separate problem.

## 14.6 DP on Trees — generalizing "include or exclude" from a line to a tree
```java
// House Robber III -- same houses, but connected as a TREE (can't rob a node AND its direct parent/child)
public int rob(TreeNode root) {
    int[] result = robHelper(root);
    return Math.max(result[0], result[1]);
}
// returns {bestIfNotRobbingThisNode, bestIfRobbingThisNode}
private int[] robHelper(TreeNode node) {
    if (node == null) return new int[]{0, 0};
    int[] left = robHelper(node.left);
    int[] right = robHelper(node.right);
    int notRob = Math.max(left[0], left[1]) + Math.max(right[0], right[1]);   // children are free to do whatever's best
    int rob = node.val + left[0] + right[0];                                    // robbing this node forces children to NOT be robbed
    return new int[]{notRob, rob};
}
```
**The generalization to notice:** this is House Robber (14.1) with "adjacent" redefined from array-neighbors to parent-child relationships. The recursive return now carries BOTH possibilities up to the parent (instead of a single `dp[i]` value) precisely because the parent needs to know both options to make ITS OWN correct include/exclude decision — a pattern that shows up in most tree-DP problems.

## 14.7 Bitmask DP — a brief, honest introduction
When `n` is small (typically ≤ ~20), "which subset of items has been used" can be encoded as an integer bitmask and used as a DP dimension — classic for Traveling-Salesman-flavored "visit every node" problems.
```java
// Sketch: dp[mask][i] = minimum cost to have visited exactly the set `mask`, currently standing at node i
// Transition: dp[mask | (1<<next)][next] = min(dp[mask][i] + cost[i][next]) for every unvisited `next`
```
This is rare at L4 specifically (more common in "hard" rounds or above), but if you see `n ≤ 20` in the constraints alongside "visit all," "assign all," or "cover all" language, bitmask DP is the signal worth recognizing even if full implementation needs a hint.

## 14.8 State-machine DP — the mental model that unifies the whole "stock" family
Draw the "Buy/Sell Stock" problems as a literal state diagram: states = `{holding, not-holding}` (or more states for limited-transaction variants), transitions = `{buy, sell, hold, rest}`, each with an associated profit change. Once drawn, the DP recurrence for ANY variant (unlimited transactions, at-most-2, at-most-k, with cooldown, with a transaction fee) is just "for each state, what's the best way to have arrived here" — turning roughly 6 "different" problems into one template with the number of states tweaked.

## Practice Problems — Part 14

**14.P1 — Word Break** (can a string be segmented into dictionary words?).
<details><summary>Solution</summary>

```java
public boolean wordBreak(String s, List<String> wordDict) {
    Set<String> dict = new HashSet<>(wordDict);
    boolean[] dp = new boolean[s.length() + 1];
    dp[0] = true;                                    // empty prefix is trivially breakable
    for (int i = 1; i <= s.length(); i++) {
        for (int j = 0; j < i; j++) {
            if (dp[j] && dict.contains(s.substring(j, i))) { dp[i] = true; break; }
        }
    }
    return dp[s.length()];
}
```
</details>

**14.P2 — Decode Ways** (count ways to decode a digit string into letters, `'A'=1`...`'Z'=26`).
<details><summary>Solution</summary>

```java
public int numDecodings(String s) {
    if (s.isEmpty() || s.charAt(0) == '0') return 0;
    int n = s.length();
    int[] dp = new int[n + 1];
    dp[0] = 1; dp[1] = 1;
    for (int i = 2; i <= n; i++) {
        int oneDigit = Integer.parseInt(s.substring(i - 1, i));
        int twoDigit = Integer.parseInt(s.substring(i - 2, i));
        if (oneDigit >= 1) dp[i] += dp[i - 1];
        if (twoDigit >= 10 && twoDigit <= 26) dp[i] += dp[i - 2];
    }
    return dp[n];
}
```
</details>

**14.P3 — Partition Equal Subset Sum** (0/1 knapsack in disguise: can a subset sum to exactly half the total?).
<details><summary>Solution</summary>

```java
public boolean canPartition(int[] nums) {
    int sum = Arrays.stream(nums).sum();
    if (sum % 2 != 0) return false;
    int target = sum / 2;
    boolean[] dp = new boolean[target + 1];
    dp[0] = true;
    for (int num : nums) {
        for (int w = target; w >= num; w--) dp[w] = dp[w] || dp[w - num];   // same backward-iteration reasoning as 14.4
    }
    return dp[target];
}
```
</details>

**14.P4 — Delete and Earn** (pick a number to earn its value, but doing so forbids using any instance of `num-1` or `num+1`).
<details><summary>Hint + Solution</summary>
Hint: bucket total earnable points by value — this reduces the problem EXACTLY to House Robber (14.1).

```java
public int deleteAndEarn(int[] nums) {
    int maxVal = Arrays.stream(nums).max().getAsInt();
    int[] sum = new int[maxVal + 1];
    for (int num : nums) sum[num] += num;         // total points earnable if you fully commit to value `num`
    int[] dp = new int[maxVal + 1];
    dp[0] = sum[0];
    if (maxVal >= 1) dp[1] = Math.max(sum[0], sum[1]);
    for (int i = 2; i <= maxVal; i++) dp[i] = Math.max(dp[i - 1], dp[i - 2] + sum[i]);
    return dp[maxVal];
}
// Recognizing an unfamiliar problem as a DISGUISED familiar one is the single highest-leverage DP skill --
// more valuable than knowing any individual recurrence by heart.
```
</details>

**14.P5 — Longest Palindromic Subsequence.**
<details><summary>Hint + Solution</summary>
Hint: this is Longest Common Subsequence (main guide 14.7) between the string and ITS OWN REVERSE — another disguised-familiar-problem instance, though the direct 2D interval formulation below is the standard approach.

```java
public int longestPalindromeSubseq(String s) {
    int n = s.length();
    int[][] dp = new int[n][n];
    for (int i = n - 1; i >= 0; i--) {
        dp[i][i] = 1;
        for (int j = i + 1; j < n; j++) {
            if (s.charAt(i) == s.charAt(j)) dp[i][j] = dp[i + 1][j - 1] + 2;
            else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j - 1]);
        }
    }
    return dp[0][n - 1];
}
```
</details>

**14.P6 — Best Time to Buy and Sell Stock III** (at most 2 transactions — extends the state-machine model from 14.8).
<details><summary>Solution</summary>

```java
public int maxProfit(int[] prices) {
    int buy1 = Integer.MIN_VALUE, sell1 = 0, buy2 = Integer.MIN_VALUE, sell2 = 0;
    for (int price : prices) {
        buy1 = Math.max(buy1, -price);
        sell1 = Math.max(sell1, buy1 + price);
        buy2 = Math.max(buy2, sell1 - price);     // the second buy is funded by profit banked from the first sell
        sell2 = Math.max(sell2, buy2 + price);
    }
    return sell2;
}
// 4 running "states," each updated in one pass -- the state-machine mental model from 14.8, made concrete
```
</details>

**14.P7 — Coin Change II** (count the NUMBER OF WAYS to make an amount — contrast with Coin Change I's "minimum coins").
<details><summary>Solution</summary>

```java
public int change(int amount, int[] coins) {
    int[] dp = new int[amount + 1];
    dp[0] = 1;
    for (int coin : coins) {                  // coin on the OUTER loop -- this is what makes it count COMBINATIONS
        for (int i = coin; i <= amount; i++) {
            dp[i] += dp[i - coin];
        }
    }
    return dp[amount];
}
```
**The subtle, very-testable distinction:** looping coins on the OUTSIDE and amount on the INSIDE counts combinations (order doesn't matter — `{1,2}` and `{2,1}` are the same way). Swapping the loop order to put amount outside would instead count PERMUTATIONS (order matters) — a completely different problem that happens to share almost identical code. Worth tracing a tiny example by hand until this fully clicks.
</details>


---

# PART 15 DEEP-DIVE — Greedy Algorithms

## 15.1 The exchange argument, actually worked through
Take **Activity Selection**: given activities with start/end times, select the maximum number of non-overlapping ones. The greedy claim: always pick the activity that ends EARLIEST among what's still valid.

**Proof sketch (exchange argument):** suppose some optimal solution `OPT` doesn't start with the earliest-ending activity `A`, but with some other activity `B` instead. Since `A` ends no later than `B` does, we can always SWAP `B` for `A` inside `OPT` without invalidating anything else `OPT` chose — `A` frees up at least as much room as `B` did. This swap never decreases the total count, so an optimal solution exists that DOES include the greedy choice. Repeating this argument inductively shows greedy is optimal throughout.

**This is the general shape of any greedy correctness proof:** show that swapping the greedy choice into an arbitrary optimal solution never makes that solution worse. If you can't construct this argument, and especially if you can find a counter-example, greedy is probably the wrong tool.

## 15.2 Where greedy provably FAILS — a case study
Coin Change with denominations `[1, 3, 4]`, target `6`. Greedy ("always take the largest coin ≤ remaining") gives `4 + 1 + 1` = 3 coins. The true optimum is `3 + 3` = 2 coins. **Greedy fails here** because taking the locally-biggest coin doesn't guarantee the globally-fewest coins — which is exactly why Coin Change (main guide Part 14.5) is solved with DP, despite superficially "looking" like a greedy candidate.

**The real lesson:** greedy works for Activity Selection (provably, via 15.1's argument) but fails for general Coin Change (provably, via this counter-example). Being able to articulate WHY one works and the other doesn't — not just which technique to apply — is what separates genuine understanding from pattern-matching on problem titles.

## 15.3 More greedy patterns

**Gas Station (circular greedy — a genuinely clever O(n) trick):**
```java
public int canCompleteCircuit(int[] gas, int[] cost) {
    int totalTank = 0, currTank = 0, start = 0;
    for (int i = 0; i < gas.length; i++) {
        int diff = gas[i] - cost[i];
        totalTank += diff;
        currTank += diff;
        if (currTank < 0) {              // can't reach the next station starting from the current `start`
            start = i + 1;                  // every station BETWEEN old start and i is also unreachable -- skip them all at once
            currTank = 0;
        }
    }
    return totalTank >= 0 ? start : -1;    // if total gas covers total cost overall, SOME start must work
}
```
**Why skipping every station between old `start` and `i` is safe:** if you could reach some station `j` (`start < j < i`) with a non-negative running tank, but the tank still went negative by station `i`, then starting fresh AT `j` would only give you LESS initial tank than starting from `start` did — so `j` can't possibly do better either. This lets you eliminate a whole range of candidate starts in one shot, turning an O(n²) brute-force check into O(n).

**Candy (two-pass greedy — one pass genuinely isn't enough):**
```java
public int candy(int[] ratings) {
    int n = ratings.length;
    int[] candies = new int[n];
    Arrays.fill(candies, 1);
    for (int i = 1; i < n; i++) {                                       // left-to-right: enforce "higher rating than LEFT neighbor"
        if (ratings[i] > ratings[i - 1]) candies[i] = candies[i - 1] + 1;
    }
    for (int i = n - 2; i >= 0; i--) {                                    // right-to-left: enforce "higher rating than RIGHT neighbor"
        if (ratings[i] > ratings[i + 1]) candies[i] = Math.max(candies[i], candies[i + 1] + 1);
    }
    return Arrays.stream(candies).sum();
}
```
**Why one pass can't do it:** a single left-to-right pass can satisfy "higher rating than my left neighbor → more candy," but has no mechanism to simultaneously guarantee "higher rating than my right neighbor → more candy" — that requires seeing what's to the right, which hasn't been processed yet. The second, reverse pass fixes this, and taking the MAX of what each pass independently demands satisfies both constraints at once.

**Partition Labels:**
```java
public List<Integer> partitionLabels(String s) {
    int[] lastIndex = new int[26];
    for (int i = 0; i < s.length(); i++) lastIndex[s.charAt(i) - 'a'] = i;
    List<Integer> result = new ArrayList<>();
    int start = 0, end = 0;
    for (int i = 0; i < s.length(); i++) {
        end = Math.max(end, lastIndex[s.charAt(i) - 'a']);
        if (i == end) {                 // reached the farthest extent required by everything seen so far in this partition
            result.add(end - start + 1);
            start = i + 1;
        }
    }
    return result;
}
```

## Practice Problems — Part 15

**15.P1 — Minimum Number of Arrows to Burst Balloons.**
<details><summary>Solution</summary>

```java
public int findMinArrowShots(int[][] points) {
    if (points.length == 0) return 0;
    Arrays.sort(points, (a, b) -> Integer.compare(a[1], b[1]));   // sort by END -- same idea as Non-overlapping Intervals
    int arrows = 1, end = points[0][1];
    for (int[] point : points) {
        if (point[0] > end) {         // this balloon starts after our current arrow's reach -- need a new arrow
            arrows++;
            end = point[1];
        }
    }
    return arrows;
}
```
</details>

**15.P2 — Jump Game II** (minimum number of jumps to reach the last index).
<details><summary>Solution</summary>

```java
public int jump(int[] nums) {
    int jumps = 0, currEnd = 0, farthest = 0;
    for (int i = 0; i < nums.length - 1; i++) {
        farthest = Math.max(farthest, i + nums[i]);
        if (i == currEnd) {            // exhausted everything reachable within `jumps` jumps -- must jump again
            jumps++;
            currEnd = farthest;
        }
    }
    return jumps;
}
// This is secretly BFS "level counting" in disguise -- currEnd marks the boundary of the current "level"
```
</details>

**15.P3 — Task Scheduler, solved with a closed-form greedy formula** (contrast with the heap-based simulation from the Part 1-11 deep-dive, Part 11.4 — same problem, a completely different valid technique).
<details><summary>Solution</summary>

```java
public int leastInterval(char[] tasks, int n) {
    int[] freq = new int[26];
    for (char t : tasks) freq[t - 'A']++;
    Arrays.sort(freq);
    int maxFreq = freq[25];
    int idleSlots = (maxFreq - 1) * n;
    for (int i = 24; i >= 0 && freq[i] > 0; i--) {
        idleSlots -= Math.min(freq[i], maxFreq - 1);
    }
    idleSlots = Math.max(0, idleSlots);
    return tasks.length + idleSlots;
}
// O(n log n) for the sort. Worth explicitly mentioning BOTH this and the heap simulation approach if asked --
// showing you have more than one valid technique for the same problem is a strong signal on its own.
```
</details>

**15.P4 — Non-overlapping Intervals**, reimplemented from scratch, explaining in your own words WHY sorting by END (not start) is what makes the greedy proof work — tie this explicitly back to 15.1's exchange argument.
<details><summary>Solution</summary>

```java
public int eraseOverlapIntervals(int[][] intervals) {
    if (intervals.length == 0) return 0;
    Arrays.sort(intervals, (a, b) -> a[1] - b[1]);
    int count = 0, prevEnd = intervals[0][1];
    for (int i = 1; i < intervals.length; i++) {
        if (intervals[i][0] < prevEnd) count++;              // overlaps -- must remove ONE of the two; removing the later one is free (it ends latest, blocks the most)
        else prevEnd = intervals[i][1];
    }
    return count;
}
```
</details>

---

# PART 16 DEEP-DIVE — Bit Manipulation

## 16.1 Two's complement — the "why" behind negative-number bit tricks
Java `int`s are 32-bit signed, using two's complement: the most significant bit is the sign bit, and a negative number's bit pattern is "invert every bit of the positive value, then add 1." This is precisely why `n & (-n)` isolates the lowest set bit — `-n` equals `~n + 1`, and adding 1 to the inverted bits flips exactly the bits at and below the original lowest set bit in a way that, ANDed against the original `n`, leaves only that one bit standing.
```java
int lowestSetBit = n & (-n);   // e.g. n = 12 (1100) -> 4 (0100)
```
You don't need to re-derive this bit-by-bit live — just know the fact and the one-liner (it's what powers the Fenwick tree's index arithmetic in Part 17, too).

## 16.2 Subsets via bitmask — an alternative to backtracking
```java
public List<List<Integer>> subsets(int[] nums) {
    int n = nums.length;
    List<List<Integer>> result = new ArrayList<>();
    for (int mask = 0; mask < (1 << n); mask++) {          // each integer from 0 to 2^n - 1 represents exactly one subset
        List<Integer> subset = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            if ((mask & (1 << i)) != 0) subset.add(nums[i]);   // bit i set means "include nums[i]"
        }
        result.add(subset);
    }
    return result;
}
// O(2^n * n) -- identical complexity to the Part 7 backtracking version, just an iterative alternative.
// Worth having both ready -- interviewers occasionally explicitly ask for a non-recursive approach.
```

## 16.3 XOR properties, and the trickier "appears k times" family
XOR is commutative, associative, and self-inverse (`a^a=0`, `a^0=a`). Together these are why XOR-ing an entire array cancels any value appearing an EVEN number of times, leaving only values appearing an ODD number of times — the basis of the main guide's Single Number.

**Single Number II** (every element appears exactly 3 times except one — plain XOR does NOT work, it only cancels pairs):
```java
public int singleNumber(int[] nums) {
    int ones = 0, twos = 0;
    for (int num : nums) {
        ones = (ones ^ num) & ~twos;   // tracks bits seen exactly 1 (mod 3) times
        twos = (twos ^ num) & ~ones;   // tracks bits seen exactly 2 (mod 3) times
    }
    return ones;
}
// Simulates a base-3 counter per bit using O(1) extra variables. Genuinely tricky to derive cold --
// the realistic bar is recognizing the PROBLEM SHAPE ("appears k times except one outlier") on sight.
```

**Single Number III** (exactly two elements appear once, everything else appears twice):
```java
public int[] singleNumber(int[] nums) {
    int xorAll = 0;
    for (int num : nums) xorAll ^= num;             // xorAll = a ^ b, the two unique numbers XORed together
    int diffBit = xorAll & (-xorAll);                  // isolate any ONE bit where a and b differ (16.1's trick)
    int a = 0;
    for (int num : nums) {
        if ((num & diffBit) != 0) a ^= num;             // XOR-ing only the group sharing this bit isolates `a` cleanly
    }
    int b = xorAll ^ a;
    return new int[]{a, b};
}
```

## 16.4 Counting Bits — a DP recurrence hiding inside a "bit" problem
```java
public int[] countBits(int n) {
    int[] dp = new int[n + 1];
    for (int i = 1; i <= n; i++) {
        dp[i] = dp[i >> 1] + (i & 1);    // "bits in i" = "bits in i/2" + "1 more if i is odd"
    }
    return dp;
}
// O(n) total -- a nice reminder that "bit manipulation problem" and "DP problem" aren't mutually exclusive categories
```

## Practice Problems — Part 16

**16.P1 — Sum of Two Integers** without using `+` or `-`.
<details><summary>Solution</summary>

```java
public int getSum(int a, int b) {
    while (b != 0) {
        int carry = (a & b) << 1;    // positions where BOTH bits are 1 generate a carry, shifted into the next position
        a = a ^ b;                     // XOR gives the sum WITHOUT any carry
        b = carry;
    }
    return a;
}
// Simulates binary addition directly: repeat "sum without carry, then add the carry back in" until no carry remains
```
</details>

**16.P2 — Reverse Bits** (reverse the bits of a 32-bit unsigned integer).
<details><summary>Solution</summary>

```java
public int reverseBits(int n) {
    int result = 0;
    for (int i = 0; i < 32; i++) {
        result = (result << 1) | (n & 1);   // shift result left, bring in n's current lowest bit
        n >>>= 1;                             // UNSIGNED right shift -- fills with 0 regardless of sign, critical here
    }
    return result;
}
```
</details>

**16.P3 — Total Hamming Distance** (sum of Hamming distances between every pair in an array).
<details><summary>Hint + Solution</summary>
Hint: don't compare every pair directly (O(n²)) — compute each BIT POSITION's contribution across all pairs simultaneously.

```java
public int totalHammingDistance(int[] nums) {
    int total = 0;
    for (int bit = 0; bit < 32; bit++) {
        int countOnes = 0;
        for (int num : nums) if (((num >> bit) & 1) == 1) countOnes++;
        total += countOnes * (nums.length - countOnes);   // every (1,0) pair at this bit contributes exactly 1 to the total
    }
    return total;
}
// O(32n) = O(n) -- vs. the naive O(n^2) of comparing every pair directly
```
</details>

**16.P4 — Single Number II**, reimplemented from scratch without looking back at 16.3 (the best way to actually internalize the base-3-counter trick is to re-derive it under light pressure, not just read it once).


---

# PART 17 DEEP-DIVE — Advanced / Rare-but-Useful Topics

This section stays intentionally lighter on practice problems — these are genuinely rare at L4. The goal is recognition and rough implementation ability, not fluency.

## 17.1 KMP — the full implementation (main guide only described it conceptually)
```java
public int strStr(String haystack, String needle) {
    if (needle.isEmpty()) return 0;
    int[] lps = buildLPS(needle);
    int i = 0, j = 0;
    while (i < haystack.length()) {
        if (haystack.charAt(i) == needle.charAt(j)) {
            i++; j++;
            if (j == needle.length()) return i - j;      // full match
        } else if (j > 0) {
            j = lps[j - 1];                                 // DON'T restart from scratch -- reuse the failure function
        } else {
            i++;
        }
    }
    return -1;
}
private int[] buildLPS(String pattern) {
    int[] lps = new int[pattern.length()];
    int len = 0, i = 1;
    while (i < pattern.length()) {
        if (pattern.charAt(i) == pattern.charAt(len)) {
            lps[i++] = ++len;
        } else if (len > 0) {
            len = lps[len - 1];
        } else {
            lps[i++] = 0;
        }
    }
    return lps;
}
// O(n + m) total. lps[i] = length of the longest proper prefix of pattern[0..i] that's ALSO a suffix of it --
// this tells the algorithm exactly how much partial match to "keep" on a mismatch, instead of restarting
// the text pointer i from scratch every time (which is what makes the naive approach O(n*m)).
```

## 17.2 Rabin-Karp — rolling hash implementation
```java
public int strStrRabinKarp(String haystack, String needle) {
    int n = haystack.length(), m = needle.length();
    if (m > n) return -1;
    long base = 256, mod = 1_000_000_007L;
    long patternHash = 0, windowHash = 0, highOrder = 1;
    for (int i = 0; i < m - 1; i++) highOrder = (highOrder * base) % mod;

    for (int i = 0; i < m; i++) {
        patternHash = (patternHash * base + needle.charAt(i)) % mod;
        windowHash = (windowHash * base + haystack.charAt(i)) % mod;
    }
    for (int i = 0; i <= n - m; i++) {
        if (windowHash == patternHash && haystack.substring(i, i + m).equals(needle)) return i;   // verify -- guards against hash collisions
        if (i < n - m) {
            windowHash = ((windowHash - haystack.charAt(i) * highOrder) * base + haystack.charAt(i + m)) % mod;
            if (windowHash < 0) windowHash += mod;
        }
    }
    return -1;
}
// O(n + m) average. The rolling hash lets each new window's hash be computed in O(1) from the previous
// one instead of recomputing from scratch -- always verify a hash match against the real substring,
// since hash collisions (rare but real) could otherwise produce a false positive.
```

## 17.3 Segment Tree with Lazy Propagation — the conceptual extension
The main guide's segment tree handles point updates + range queries. When you need RANGE updates too (e.g., "add 5 to every element from index 3 to 7"), updating every affected leaf individually is too slow. **Lazy propagation** defers work: mark a node as "has a pending update" and only push that update down to its children when a later operation actually needs to descend past it.
```java
// Conceptual skeleton -- a full implementation is lengthy and rarely required from memory at L4
class LazySegmentTree {
    int[] tree, lazy;
    // update(node, start, end, l, r, value): if [l,r] fully covers [start,end], apply `value`
    // to tree[node] and set lazy[node] += value WITHOUT recursing further -- defer the propagation
    // any future query or update that needs to descend past this node "pushes down" lazy[node] to its
    // children FIRST, then clears lazy[node] to 0
}
```
**What to say if this comes up:** "This needs range updates as well as range queries, so I'd want a segment tree with lazy propagation to keep both at O(log n) — the core idea is deferring an update at a node until something later actually needs to descend past it." Naming the right technique and explaining the deferred-propagation idea is a realistic, well-received bar — flawless from-memory implementation is not expected.

## 17.4 2D Fenwick Tree — when your main guide's static prefix sum isn't enough
The main guide's 2D prefix sum (Part 3.3 in the Parts 1-11 deep-dive) is O(1) per query but requires the matrix to be STATIC — any update means rebuilding from scratch. A 2D Fenwick tree trades that O(1) query for O(log(rows) · log(cols)) query AND update, which wins decisively whenever the matrix changes between queries.

## Practice Problems — Part 17

**17.P1 — Implement `strStr()` using KMP.** Re-derive the failure-function construction from scratch (without looking back at 17.1), then hand-trace it against `needle = "abcabc"` to confirm `lps = [0,0,0,1,2,3]` before trusting your implementation.

**17.P2 — Range Sum Query - Mutable** (Fenwick Tree: point updates + range sum queries).
<details><summary>Solution</summary>

```java
class NumArray {
    int[] tree, nums;
    int n;

    public NumArray(int[] nums) {
        this.n = nums.length;
        this.nums = new int[n];
        tree = new int[n + 1];
        for (int i = 0; i < n; i++) update(i, nums[i]);
    }

    public void update(int index, int val) {
        int delta = val - nums[index];
        nums[index] = val;
        for (int i = index + 1; i <= n; i += i & (-i)) tree[i] += delta;
    }

    public int sumRange(int left, int right) {
        return prefixSum(right + 1) - prefixSum(left);
    }
    private int prefixSum(int i) {
        int sum = 0;
        for (; i > 0; i -= i & (-i)) sum += tree[i];
        return sum;
    }
}
// update: O(log n)  sumRange: O(log n) -- exactly why you'd reach for a Fenwick tree over a plain prefix-sum
// array whenever the underlying data can change: the plain array needs O(n) to fix ONE value after an update.
```
</details>


---

# PART 18 DEEP-DIVE — Pattern Recognition, Made Into a Drillable Skill

The main guide's Part 18 is a lookup table. This turns it into practice: recognizing the right pattern from a fresh problem description, BEFORE you've seen any solution — which is the actual skill tested in an interview's first two minutes.

## 18.1 The recognition checklist
Run through these, roughly in order, on any new problem:
1. **What's the input shape?** Array, string, tree, graph, linked list, matrix?
2. **Is it sorted, or can it be sorted without losing information the problem needs?**
3. **What's actually being asked** — a count, a boolean, an optimal value, or every possibility?
4. **Are there tell-tale words?** "Contiguous" → sliding window/subarray. "At most/at least K" → sliding window or binary search on the answer. "All combinations/subsets/permutations" → backtracking. "Shortest path" → BFS or Dijkstra. "Minimize the maximum" / "maximize the minimum" → binary search on the answer.
5. **What does the input size tell you about intended complexity?** This is the most underused signal — see 18.2.

## 18.2 Reading constraints to reverse-engineer intended complexity
Problems almost always give you a bound on `n` specifically so you can work backward to the intended time complexity — treat this as a genuine clue, not decoration.

| `n` up to... | Likely intended complexity | Suggests |
|---|---|---|
| ~10-12 | O(2ⁿ) or O(n!) | brute-force backtracking / permutations is FINE, don't over-optimize |
| ~20-22 | O(2ⁿ · n) | bitmask DP (Part 14.7) |
| ~500 | O(n³) | interval DP, Floyd-Warshall-style triple loops |
| ~5,000 | O(n²) | nested loops, naive DP |
| ~10⁵ - 10⁶ | O(n log n) | sorting, heaps, binary search, divide & conquer |
| ~10⁷ - 10⁸ | O(n) | single pass, two pointers, sliding window, hashing |
| Extremely large / streaming | O(log n) or O(1) per operation | binary search on the answer, closed-form math |

## 18.3 Triage drills
For each, decide which pattern (or combination) applies and WHY, based only on the phrasing — before revealing the answer.

**Drill 1:** *"Given a string, find the length of the longest substring where no character repeats."*
<details><summary>Answer</summary>Sliding Window — "substring" signals contiguous, and it's a length-optimization under a constraint that changes as the window grows/shrinks.</details>

**Drill 2:** *"Given the root of a binary tree, return the sum of values of its deepest leaves."*
<details><summary>Answer</summary>Tree BFS (level order) — you need to isolate the LAST level specifically, which the level-order "size snapshot" trick naturally exposes.</details>

**Drill 3:** *"You're given a list of flights as (from, to, price). Find the cheapest way to get from A to B."*
<details><summary>Answer</summary>Dijkstra — weighted graph, shortest "cost" path. (If there's also a stop/hop limit mentioned, it's the Bellman-Ford variant from Part 12.P6 instead — Dijkstra's greedy finalization doesn't respect hop limits.)</details>

**Drill 4:** *"Given an array of people's weights and a boat weight limit of 2 people per boat, find the minimum number of boats."*
<details><summary>Answer</summary>Two Pointers (opposite direction, after sorting) — the classic "sort, then greedily pair lightest with heaviest" shape.</details>

**Drill 5:** *"Given employees with (id, manager_id), find how many people report to each manager, including indirect reports."*
<details><summary>Answer</summary>Tree/Graph DFS, post-order — this is an org chart (tree-shaped), and you need each child's total BEFORE you can compute the parent's, which is exactly what postorder guarantees.</details>

**Drill 6:** *"Count the distinct ways to climb n stairs, taking 1, 2, or 3 steps at a time."*
<details><summary>Answer</summary>Dynamic Programming (1D) — "count the number of ways" is the classic DP tell, and this is the Fibonacci family generalized from 2 choices to 3.</details>

**Drill 7:** *"Given a list of busy time intervals, find the minimum number of conference rooms required."*
<details><summary>Answer</summary>Sort + Heap (Meeting Rooms II shape, Part 11.P5 in the Parts 1-11 deep-dive) — sort by start, track ongoing end-times in a min-heap.</details>

**Drill 8:** *"Given an array of integers, find the length of the longest subsequence where consecutive elements differ by exactly 1."*
<details><summary>Answer</summary>Hashing (a HashMap of value → longest chain ending at that value) — a close cousin of Longest Consecutive Sequence (Part 4.P2), but note this is asking about a SUBSEQUENCE with a value-difference constraint, not literal consecutive integers, so the transition is slightly different.</details>

**Drill 9:** *"Given a matrix of 0s and 1s, find the area of the largest square containing only 1s."*
<details><summary>Answer</summary>Dynamic Programming (2D grid) — `dp[i][j]` = side length of the largest square ENDING at `(i,j)`, taking `1 + min(top, left, top-left)`. A grid-DP relative of Unique Paths (main guide 14.4).</details>

**Drill 10:** *"A robot on an infinite 2D grid starts at (0,0). Given a sequence of moves, determine if it returns to the origin."*
<details><summary>Answer</summary>Not a "pattern" problem at all — direct O(n) simulation, tracking (x, y). Included on purpose: not every problem needs a named technique, and forcing a fancier pattern onto a problem that's just "simulate it" wastes time you don't have.</details>


---

# PART 19 DEEP-DIVE — Making the Study Plan Actually Actionable

The main guide gives you the 10-week skeleton. This is what to DO inside each week.

## 19.1 A daily structure (not just a weekly topic)
Assuming ~1.5-2 hours on a weekday, more on weekends:
- **15 min — review yesterday.** Reread notes on anything you got wrong. This step is the one people skip and the one that actually cements pattern recognition — don't cut it.
- **45-60 min — 1-2 NEW problems** in the current week's topic. Set a real 25-minute timer per problem, even if you don't finish — then check hints or the solution. Struggling productively for 25 minutes teaches more than reading a solution after 3 minutes.
- **15-20 min — re-derive, from memory,** one problem you struggled with in the last 2-3 days. No looking. This is spaced repetition, and it's what actually moves a pattern from "I recognized it once" to "I recognize it reliably."
- **Weekly — one full 45-minute mixed-topic mock**, timed exactly like the real thing (see Part 20 below).

## 19.2 How to choose WHICH problems within a topic
Prioritize **breadth before depth**: for a new pattern, solve 3-4 Easy/Medium problems that are genuinely DIFFERENT flavors of the same pattern before attempting a Hard one. For Sliding Window specifically: do "Longest Substring Without Repeating Characters," "Minimum Size Subarray Sum," and "Longest Substring with At Most K Distinct Characters" (three distinct flavors) before "Minimum Window Substring" (the hard one, and the one that inverts the shrink condition — see Part 3.2 in the Parts 1-11 deep-dive). Seeing a pattern VARY matters more than grinding one exact shape repeatedly.

## 19.3 A simple tracking method
A spreadsheet with these columns is enough:
`Problem | Pattern | First attempt date | Solved unaided? (Y/N) | Re-attempt date | Solved unaided 2nd time? (Y/N)`

Revisit anything marked "N" after **5-7 days**, not the same day. Same-day re-solving mostly tests short-term memory of the exact solution; a several-day gap is what actually tests whether the PATTERN stuck.

## 19.4 A readiness gut-check (not a strict gate)
- Can you solve a never-seen Medium in ~20-25 minutes, leaving time to code and test?
- Do you state time/space complexity immediately after finishing, unprompted?
- In a mock, do you consistently narrate your approach BEFORE coding, without needing a reminder?
- Can you debug your own code by tracing an example, rather than guessing-and-checking randomly?
- Have you done at least 2-3 full 45-minute mocks (timed strictly, ideally with another person) in the last 2 weeks?

If most of these are honestly "yes," you're in reasonable shape to start scheduling real interviews.

---

# PART 20 DEEP-DIVE — The Interview Framework, With a Full Mock Transcript

Reading "clarify, plan, code, test" as a list is easy. Recognizing what it actually SOUNDS like, in real time, is the harder skill — so here's a full transcript.

## 20.1 A worked mock — Two Sum, chosen deliberately simple so the COMMUNICATION is what stands out

> **[Interviewer]:** "Given an array of integers and a target, return the indices of the two numbers that add up to target."
>
> **[You — Clarify]:** "Got it. A couple quick questions: can I assume exactly one valid answer exists? Do the two indices need to be distinct, or could I use the same element twice? And is the array sorted, or could it be in any order?"
>
> **[Interviewer]:** "Assume exactly one solution, distinct indices, array is not sorted."
>
> **[You — Plan]:** "Okay. Brute force would be a nested loop checking every pair — O(n²) time, O(1) space. But since I really just need to check 'have I seen the complement of this number before,' I can trade some space for speed: scan once, and for each number check a HashMap for whether its complement is already stored; if not, store the current number. That's O(n) time, O(n) space. Sound good?"
>
> **[Interviewer]:** "Yep, go ahead."
>
> **[You — Code]:** *(writes the HashMap solution, narrating decisions, not keystrokes)* "I'll map each value to its index as I go... for each number, first check if `target - num` is already a key in the map..."
>
> **[You — Test]:** "Let me trace `[2,7,11,15]`, target 9. i=0, num=2, complement=7, not in the map yet, so I store `{2:0}`. i=1, num=7, complement=2, IS in the map at index 0 — return `[0,1]`. Matches what's expected. One edge case worth naming: the problem guarantees exactly one solution and at least two elements, so I don't think I need defensive null/bounds checks here — does that match your expectations, or would you like me to guard against it anyway?"
>
> **[Interviewer]:** "Fair assumption, no need."

**Why this works, line by line:** every clarifying question in step 1 heads off a real ambiguity (not a stalling question). The plan in step 2 states a brute force FIRST, then names the specific bottleneck before proposing the fix — never jumps straight to "I'll use a HashMap" without justifying why. The test in step 4 traces concrete values, states the result, and explicitly surfaces an assumption instead of silently making it. None of this required a hard problem — the difficulty was never the point of this example.

## 20.2 Scripts for the moments that actually rattle people

**"You just noticed a bug in your own code."**
> "Wait, let me trace through this again... ah, I see the issue — on this line I'm not handling the case where the window is empty. Let me fix that." Say it calmly, out loud. Catching your OWN bug is a strong positive signal, not a negative one — it demonstrates the exact testing discipline Part 0 of the main guide says is graded.

**"The interviewer asks 'can you optimize further' after you already have a working solution."**
> "Sure — right now this is O(n log n) because of the sort. Let me think about whether I actually need the full sort, or if there's a cheaper way to get just the piece of information I need..." Then actually think, out loud, about the bottleneck. Don't panic-guess a fancier-sounding data structure just to seem responsive.

**"You're genuinely stuck and time is ticking."**
> "Let me try a smaller version of this problem first — if the array only had 2 elements, what would I do?" OR, after a real attempt: "Can I get a small hint on whether I'm thinking about this the right way?" A specific, well-formed question reads far better than silence or a vague "I don't know."

**"The interviewer raises an edge case you hadn't considered."**
> "Good catch — let me think through how that changes things." Then actually reason about it — often only a small tweak is needed, not a full restart. Assuming your whole approach is wrong and panicking is usually an overreaction.

**"You realize mid-code that your approach doesn't actually work."**
> "Actually, I realize this breaks down when [specific case] — let me step back and reconsider." Catching this yourself and saying so is far better than an interviewer catching it for you, or worse, it surfacing silently in the final test trace.

## 20.3 Self-assessment rubric for your mocks
After each mock, rate yourself honestly, 1-5, on the four pillars from the main guide's Part 0:
- **Problem solving** — did you reach a correct, reasonably optimal solution with a clear derivation (not a lucky guess)?
- **Coding** — was the code clean, and would it actually compile and run?
- **Communication** — did you narrate your thinking continuously, not just at the very start?
- **Testing** — did you actually trace a concrete example, and did you do it without being asked to?


---

# PART 21 DEEP-DIVE — Common Mistakes, With Before/After Examples

The main guide lists 10 mistakes. Here's what several of the highest-impact ones actually sound like in the room — a weak version and a strong version of the same moment — plus a few additions and a short self-check.

**Jumping straight to code.**
- Weak: *(interviewer finishes the prompt; candidate starts typing immediately)*
- Strong: "Let me make sure I understand the problem — [restates it in their own words] — and before coding, my plan is [brief plan]. I'll start writing now."

**Silence when stuck.**
- Weak: *(30 seconds of typing, deleting, retyping, saying nothing)*
- Strong: "I'm stuck on what happens when the window shrinks to zero — let me think about whether that case can even occur given the constraints..." (still visibly thinking, but audibly)

**Not stating complexity unprompted.**
- Weak: *(finishes the code, sits back, waits for the interviewer to ask)*
- Strong: "This runs in O(n) time — single pass — and O(1) extra space, since I'm only tracking a couple of pointers, no auxiliary structures."

**Over-optimizing prematurely.**
- Weak: *(spends 15 of 45 minutes searching for the optimal approach before writing any code at all, runs out of time)*
- Strong: "Let me get a working brute force down first, even though I know it's not optimal — gives us something correct to build on." *(codes a correct O(n²), then optimizes if time allows)*

## Three additions worth naming explicitly

**11 — Mismanaging time across multiple problems in one round.** If a round has 2 problems and 35 of 45 minutes go to problem 1, problem 2 is doomed regardless of how good problem 1 was. If you're past the halfway mark on problem 1 and it's not yet coded, say so out loud and consider simplifying your approach rather than silently pushing forward on an increasingly ambitious plan.

**12 — Writing pseudocode-flavored "almost Java."** e.g., `for x in list` (Python-flavored) instead of `for (int x : list)`. Small syntax slips compound and read as less fluency than you likely actually have. This is purely a reps problem — fixed by writing real, syntactically correct Java by hand during practice, not in an autocomplete-assisted IDE.

**13 — Arguing with the interviewer instead of investigating.** If an interviewer flags something that seems off, the strong move is always "let me check that" — even when you turn out to be right, a moment of genuine double-checking reads better than defensiveness.

## Self-check: which mistake is happening here?

**Scenario A:** *"A candidate finishes a working solution and immediately says 'I'm done,' without tracing through any example."*
<details><summary>Answer</summary>Skipping the test/trace step (main guide mistake #4) — confidence isn't the same as verified correctness.</details>

**Scenario B:** *"A candidate spends 20 minutes silently searching for the perfect O(n) solution, writes no code at all, and has 15 minutes left when they finally start typing."*
<details><summary>Answer</summary>Over-optimizing prematurely instead of securing a working brute force first (main guide mistake #6).</details>

**Scenario C:** *"A candidate's code correctly solves the problem, but uses variable names like `a`, `b`, `x1`, `temp2`, `flag` throughout, and the interviewer has to ask what several of them represent."*
<details><summary>Answer</summary>Poor variable naming under pressure (main guide mistake #9) — code quality is graded independently of correctness.</details>

---

## Closing notes

That's Parts 12-21 at full depth. Between this document and the Parts 1-11 companion, you now have every topic in the main guide covered twice: once as a first pass, once as reinforcement with harder variants and applied practice.

A few honest notes to close out the whole series:
- **Part 14 (Dynamic Programming) deserved the most space here, and it should get the most of your time too.** If you only deep-dive one part of this document properly before your interviews, make it that one — House Robber → House Robber III → the stock family is a genuinely good sequence to re-derive from memory, repeatedly, until it's automatic.
- **Part 18's triage drills are worth repeating with problems you find yourself**, not just the ten given here. Every time you see a new problem statement anywhere — practice site, mock interview, this document — pause and guess the pattern before reading further. That guessing rep, done hundreds of times, is what pattern recognition under time pressure actually is.
- **Part 20's transcript is a template, not a script to memorize.** Run your own mocks and compare what you actually said against it — the gap between the two is usually exactly what to work on next.

Good luck — you now have the full map. The only thing left is the mileage.