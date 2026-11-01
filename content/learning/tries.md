# Tries — From Scratch to Advanced

A complete, self-contained deep dive for Java interviews.

**How to use this file:** read Part 0 for the mental model and Part 1 to build a trie by hand.
Then work through Part 2 pattern by pattern. Tries show up in fewer problems than arrays or
graphs, but when they do, the trie is usually *the* idea, and the problems are often rated hard.
Part 3 covers the advanced uses (ranked autocomplete, Aho–Corasick multi-pattern search), and
Part 4 is the recognition table, practice ladder and one-page summary.

Every solution below compiles and passes randomised tests against brute-force references.
Problem numbers like **LC 208** refer to LeetCode.

---

## Table of Contents

**[Part 0 — The mental model](#part-0--the-mental-model)**

**[Part 1 — Building tries](#part-1--building-tries)**
1. [The array trie](#11-the-array-trie-lc-208)
2. [Children: array, HashMap or TreeMap?](#12-children-array-hashmap-or-treemap)
3. [Deleting words, with pruning](#13-deleting-words-with-pruning)
4. [Listing words by prefix](#14-listing-words-by-prefix)
5. [Counting tries](#15-counting-tries--duplicates-and-prefix-counts)
6. [Storing data on nodes](#16-storing-data-on-nodes--map-sum)
7. [Memory, and the alternatives](#17-memory-and-the-alternatives)

**[Part 2 — Patterns](#part-2--patterns)**
1. [Prefix search while typing](#21-prefix-search-while-typing)
2. [Wildcards](#22-wildcards)
3. [Trie + backtracking on a grid](#23-trie--backtracking-on-a-grid-)
4. [Trie + DP](#24-trie--dp--word-break-and-concatenated-words)
5. [Shortest and longest prefixes](#25-shortest-and-longest-prefixes)
6. [Binary tries for XOR](#26-binary-tries-for-xor-)
7. [Reversed-word tries](#27-reversed-word-tries--palindrome-pairs)
8. [Suffix tries](#28-suffix-tries--distinct-substrings)

**[Part 3 — Advanced](#part-3--advanced)**
1. [Autocomplete with ranking](#31-autocomplete-with-ranking)
2. [Aho–Corasick: many patterns, one pass](#32-ahocorasick--many-patterns-one-pass)
3. [Tries in real systems](#33-tries-in-real-systems)

**[Part 4 — Solving any trie question](#part-4--solving-any-trie-question)**

---

# Part 0 — The Mental Model

A **trie** (from re*trie*val, usually pronounced "try") is a tree in which **each edge is a character**
and **each path from the root spells a prefix**. Words that share a prefix share the path for it.

```text
words: car, cart, cat, dog

            (root)
            /    \
           c      d
           |      |
           a      o
          / \     |
         r*  t*   g*          * = a word ends here (isWord)
         |
         t*
```

Three facts explain every trie algorithm:
1. **A node = a prefix.** The node reached by following `c → a` represents the prefix `"ca"`,
   and its subtree holds exactly the words that start with `"ca"`.
2. **Lookups cost O(L), the length of the key, independent of how many words are stored.**
   With a million words, finding `"cart"` still takes 4 steps.
3. **A node's path existing ≠ a word existing.** `"ca"` is a path, but not a word. That's why every node
   needs an `isWord` flag (or a count, or the word itself).

How it compares with the structures you already know:

| Need | `HashSet<String>` | `TreeSet<String>` / sorted array | Trie |
|---|---|---|---|
| Is `w` a word? | O(L) average | O(L log n) | O(L) |
| Does any word start with `p`? | ✗ (scan everything) | O(L log n) (`ceiling(p)`) | O(L) |
| All words with prefix `p`, sorted | ✗ | O(L log n + output) | O(L + output) |
| Character-by-character typing | recompute each time | binary search each time | **keep a pointer, one step per key** |
| Wildcards (`c.t`), grid search with pruning | ✗ | awkward | **natural** |
| Max XOR, longest prefix match | ✗ | ✗ | **natural** (binary / IP tries) |
| Memory | low | low | **high** (a node per character) |

The sentence to say when the interviewer asks "why a trie?":

> *I need many prefix queries, or to extend a prefix one character at a time and know immediately
> whether any word still continues. A trie answers that in O(1) per character.*

---

# Part 1 — Building Tries

## 1.1 The array trie (LC 208)

**LC 208 Implement Trie**: `insert`, `search` (whole word), `startsWith` (prefix).

```java
// LC 208. Lowercase 'a'..'z' only, so each node has an array of 26 children.
class Trie {
    private static final class Node {
        final Node[] next = new Node[26];
        boolean isWord;                      // a word ENDS here (not just passes through)
    }

    private final Node root = new Node();

    public void insert(String word) {
        Node cur = root;
        for (int k = 0; k < word.length(); k++) {
            int c = word.charAt(k) - 'a';
            if (cur.next[c] == null) cur.next[c] = new Node();   // create the path on demand
            cur = cur.next[c];
        }
        cur.isWord = true;
    }

    public boolean search(String word) {
        Node end = walk(word);
        return end != null && end.isWord;    // the path exists AND a word ends there
    }

    public boolean startsWith(String prefix) {
        return walk(prefix) != null;         // the path exists: some word continues from here
    }

    private Node walk(String s) {            // follow s from the root; null if we fall off
        Node cur = root;
        for (int k = 0; k < s.length() && cur != null; k++) cur = cur.next[s.charAt(k) - 'a'];
        return cur;
    }
}
```

**The non-obvious parts:**
- **`search` vs `startsWith` differ only in the last check.** Both walk the path. `search` also
  needs `isWord`, because inserting `"cart"` makes the path `"car"` exist even if `"car"` was
  never inserted.
- **`walk` is the workhorse.** Almost every trie method starts with "walk the prefix, then do
  something at that node". Write it once.
- `c - 'a'` maps `'a'..'z'` to `0..25`. Anything outside that range (uppercase, digits, spaces)
  throws `ArrayIndexOutOfBoundsException`, so check the alphabet in the constraints (1.2).

**Complexity:** `insert`, `search` and `startsWith` are O(L) time. Space is O(total characters inserted)
nodes in the worst case, fewer when words share prefixes.

## 1.2 Children: array, HashMap or TreeMap?

When the alphabet isn't 26 lowercase letters, store children in a map:

```java
// Any alphabet (Unicode, URLs, file paths): a HashMap of children per node.
class MapTrie {
    private static final class Node {
        final Map<Character, Node> next = new HashMap<>();
        boolean isWord;
    }

    private final Node root = new Node();

    public void insert(String word) {
        Node cur = root;
        for (char ch : word.toCharArray()) cur = cur.next.computeIfAbsent(ch, k -> new Node());
        cur.isWord = true;
    }

    public boolean search(String word) {
        Node cur = root;
        for (char ch : word.toCharArray()) {
            cur = cur.next.get(ch);
            if (cur == null) return false;
        }
        return cur.isWord;
    }
}
```

| Children as | Lookup | Ordered iteration | Memory per node | Use when |
|---|---|---|---|---|
| `Node[26]` (or `[128]` for ASCII) | O(1), fastest | yes (index order) | fixed: ~144 bytes for 26 slots, even if empty | small fixed alphabet (LeetCode) |
| `HashMap<Character, Node>` | O(1) average | no | ~150–200 bytes for a node with 1–2 children | large or unknown alphabets (Unicode, URLs) |
| `TreeMap<Character, Node>` | O(log σ) | yes | ~40 bytes per entry | large alphabet **and** sorted output |

A HashMap is **not** automatically smaller: its own object overhead outweighs a 26-slot array
until the alphabet gets large. The real reason to use it is that a `Node[65536]` per node for
Unicode would be absurd.

## 1.3 Deleting words, with pruning

Clearing `isWord` is enough for correctness. But nodes that no longer lead to any word then waste
memory, and they make `startsWith` lie. For example, after deleting `"cart"`, `startsWith("cart")`
would still return true. Delete properly by **pruning on the way back up**. These methods go inside the `Trie` class from 1.1:

```java
// Remove a word and prune nodes that no longer lead
// to any word. Returns false if it was absent.
public boolean delete(String word) {
    if (!search(word)) return false;
    delete(root, word, 0);
    return true;
}

// returns true if 'node' can be unlinked
private boolean delete(Node node, String word, int depth) {
    if (depth == word.length()) {
        node.isWord = false;
    } else {
        int c = word.charAt(depth) - 'a';
        if (delete(node.next[c], word, depth + 1)) node.next[c] = null;
    }
    return node != root && !node.isWord && hasNoChildren(node);
}

private static boolean hasNoChildren(Node node) {
    for (Node child : node.next) if (child != null) return false;
    return true;
}
```

**How it works:**
- The recursion walks down to the word's last node and clears `isWord`.
- On the way back, each node reports whether it is now useless: not a word end, no children, and not the root.
- The parent unlinks useless children.

Deleting `"cart"` from `{car, cart}` removes only the `t` node, because `r` is still a word end.

## 1.4 Listing words by prefix

**"Return every word starting with `p`"** is a walk to the prefix's node, then a DFS of its
subtree with a `StringBuilder` path (backtracking). Again, these are methods of the `Trie` class:

```java
// Every word that starts with prefix, in sorted order: the DFS visits children 'a'..'z'.
public List<String> wordsWithPrefix(String prefix) {
    List<String> out = new ArrayList<>();
    Node start = walk(prefix);
    if (start != null) collect(start, new StringBuilder(prefix), out);
    return out;
}

private void collect(Node node, StringBuilder path, List<String> out) {
    if (node.isWord) out.add(path.toString());
    for (int c = 0; c < 26; c++) {
        if (node.next[c] == null) continue;
        path.append((char) ('a' + c));
        collect(node.next[c], path, out);
        path.deleteCharAt(path.length() - 1);   // backtrack
    }
}
```

With array children, visiting `'a'..'z'` in index order yields the words **already sorted**,
which is free lexicographic order. With HashMap children you would have to sort afterwards.

## 1.5 Counting tries — duplicates and prefix counts

**LC 1804 Implement Trie II**: duplicates are allowed. Count how many times a word was inserted, count the words
that start with a prefix, and erase one copy.

```java
// LC 1804 Trie II: duplicates allowed; count exact words and prefixes; erase one copy.
class CountingTrie {
    private static final class Node {
        final Node[] next = new Node[26];
        int passCount;                       // words that pass through or end at this node
        int endCount;                        // words that end exactly here
    }

    private final Node root = new Node();

    public void insert(String word) {
        Node cur = root;
        cur.passCount++;
        for (int k = 0; k < word.length(); k++) {
            int c = word.charAt(k) - 'a';
            if (cur.next[c] == null) cur.next[c] = new Node();
            cur = cur.next[c];
            cur.passCount++;
        }
        cur.endCount++;
    }

    public int countWordsEqualTo(String word) {
        Node end = walk(word);
        return end == null ? 0 : end.endCount;
    }

    public int countWordsStartingWith(String prefix) {
        Node end = walk(prefix);
        return end == null ? 0 : end.passCount;
    }

    public void erase(String word) {         // precondition (as in LC 1804): the word is present
        Node cur = root;
        cur.passCount--;
        for (int k = 0; k < word.length(); k++) {
            int c = word.charAt(k) - 'a';
            if (--cur.next[c].passCount == 0) {   // no other word uses this branch: drop all of it
                cur.next[c] = null;
                return;
            }
            cur = cur.next[c];
        }
        cur.endCount--;
    }

    private Node walk(String s) {
        Node cur = root;
        for (int k = 0; k < s.length() && cur != null; k++) cur = cur.next[s.charAt(k) - 'a'];
        return cur;
    }
}
```

**The idea:** two counters per node.
- **`passCount`** is incremented on every node along the path, so a prefix's node knows how many words lie below it.
- **`endCount`** counts the words that end exactly there.

Erasing decrements along the path. When a child's `passCount` drops to 0, nothing else uses that
branch, so the whole branch is cut in one assignment.

## 1.6 Storing data on nodes — Map Sum

Nodes can carry any aggregate of their subtree. **LC 677 Map Sum Pairs**: `insert(key, val)`
(re-inserting replaces the value) and `sum(prefix)` (the total of the values of keys with that prefix).

```java
// LC 677: each node stores the sum of the values of all keys below it.
class MapSum {
    private static final class Node {
        final Node[] next = new Node[26];
        int sum;
    }

    private final Node root = new Node();
    private final Map<String, Integer> values = new HashMap<>();

    public void insert(String key, int val) {
        int delta = val - values.getOrDefault(key, 0);   // re-inserting a key REPLACES its value
        values.put(key, val);
        Node cur = root;
        cur.sum += delta;
        for (char ch : key.toCharArray()) {
            int c = ch - 'a';
            if (cur.next[c] == null) cur.next[c] = new Node();
            cur = cur.next[c];
            cur.sum += delta;
        }
    }

    public int sum(String prefix) {
        Node cur = root;
        for (char ch : prefix.toCharArray()) {
            cur = cur.next[ch - 'a'];
            if (cur == null) return 0;
        }
        return cur.sum;
    }
}
```

**The trick is the `delta`:** when a key is re-inserted, every node on its path must change by
`new - old`, not by `new`. The side `HashMap` remembers the old values. The same "aggregate on the
path" idea gives prefix counts (1.5) and the top-k lists of 2.1 and 3.1.

## 1.7 Memory, and the alternatives

Tries trade memory for speed. 100,000 English words create a few hundred thousand nodes,
which at ~144 bytes each is tens of megabytes for data that's about 1 MB as plain text.
Options when that matters:
- **Compressed (radix / Patricia) trie:** merge chains of single-child nodes into one edge labelled with a whole substring. The node count drops to at most 2n. This is what routers and HTTP path matchers use.
- **Ternary search tree:** each node has `lo/eq/hi` children like a BST over characters. Memory is close to that of the strings themselves, and lookups take O(L + log n).
- **Just sort:** for static data, a sorted array plus binary search answers prefix queries in O(L log n) with zero overhead. In Java, `TreeSet.subSet(prefix, prefix + '￿')` gives every word with the prefix. Often this is the better engineering answer, so say so (2.1 shows both).
- **Arrays instead of node objects:** store the trie as `int[][] next = new int[maxNodes][26]` with node ids, which removes object headers. That's common in competitive programming.

---

# Part 2 — Patterns

## 2.1 Prefix search while typing

**LC 1268 Search Suggestions System:** after each character of `searchWord`, return up to three
lexicographically smallest products with the current prefix.

**Approach 1, a trie with a top-3 list on every node.** Insert products in **sorted order**: then
the first three products to pass through a node are its three smallest, so each node keeps the
first three it sees. Answering a keystroke is one step down the trie.

```java
// LC 1268: after each typed character, the (at most) 3 smallest products with that prefix.
public List<List<String>> suggestedProducts(String[] products, String searchWord) {
    String[] sorted = products.clone();
    Arrays.sort(sorted);                        // insert in sorted order, so at every node
    SuggestNode root = new SuggestNode();       // the first 3 words to arrive are the 3 smallest
    for (String p : sorted) {
        SuggestNode cur = root;
        for (char ch : p.toCharArray()) {
            int c = ch - 'a';
            if (cur.next[c] == null) cur.next[c] = new SuggestNode();
            cur = cur.next[c];
            if (cur.top.size() < 3) cur.top.add(p);
        }
    }
    List<List<String>> result = new ArrayList<>();
    SuggestNode cur = root;
    for (char ch : searchWord.toCharArray()) {
        cur = (cur == null) ? null : cur.next[ch - 'a'];
        result.add(cur == null ? List.of() : cur.top);
    }
    return result;
}

private static final class SuggestNode {
    final SuggestNode[] next = new SuggestNode[26];
    final List<String> top = new ArrayList<>(3);
}
```

**Approach 2, sort and binary search.** In a sorted array, all products with prefix `p` form a
contiguous run that starts at the first element `≥ p`. As the prefix grows, that start only
moves right.

```java
// The same answer without a trie: sort once, then
// binary-search each prefix. Often the better choice.
public List<List<String>> suggestedProductsSorted(String[] products, String searchWord) {
    String[] sorted = products.clone();
    Arrays.sort(sorted);
    List<List<String>> result = new ArrayList<>();
    StringBuilder prefix = new StringBuilder();
    int lo = 0;
    for (char ch : searchWord.toCharArray()) {
        prefix.append(ch);
        String p = prefix.toString();
        lo = lowerBound(sorted, lo, p);          // first product >= p; it only moves right
        List<String> top = new ArrayList<>();
        for (int i = lo; i < sorted.length && top.size() < 3 && sorted[i].startsWith(p); i++) {
            top.add(sorted[i]);
        }
        result.add(top);
    }
    return result;
}

private int lowerBound(String[] a, int lo, String key) {
    int hi = a.length;
    while (lo < hi) {
        int mid = (lo + hi) >>> 1;
        if (a[mid].compareTo(key) < 0) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}
```

**Which to present?** Both are fine. Sorting is simpler and uses no extra memory. The trie wins when
the product list is large and fixed, queries are many, and each keystroke must be O(1). This is
exactly the autocomplete setting of 3.1. Offering both, with that trade-off, is the strong answer.

## 2.2 Wildcards

**LC 211 Add and Search Words:** `search` may contain `.`, which matches any single letter.

```java
// LC 211: search where '.' matches any one letter.
class WordDictionary {
    private static final class Node {
        final Node[] next = new Node[26];
        boolean isWord;
    }

    private final Node root = new Node();

    public void addWord(String word) {
        Node cur = root;
        for (char ch : word.toCharArray()) {
            int c = ch - 'a';
            if (cur.next[c] == null) cur.next[c] = new Node();
            cur = cur.next[c];
        }
        cur.isWord = true;
    }

    public boolean search(String word) {
        return search(root, word, 0);
    }

    private boolean search(Node node, String word, int i) {
        if (i == word.length()) return node.isWord;
        char ch = word.charAt(i);
        if (ch == '.') {                                     // try every existing branch
            for (Node child : node.next) {
                if (child != null && search(child, word, i + 1)) return true;
            }
            return false;
        }
        Node child = node.next[ch - 'a'];
        return child != null && search(child, word, i + 1);
    }
}
```

**Approach.** A normal letter follows one child. A `.` **branches into every existing child**,
which is a DFS that returns as soon as any branch matches.

**Complexity:** O(L) for words without dots. With `d` dots, up to `26^d` paths in the worst case. In
practice the trie's sparsity prunes most branches. A HashSet can't do this at all without
enumerating every substitution.

## 2.3 Trie + backtracking on a grid ⭐

**LC 212 Word Search II:** given a letter grid and a list of words, return every word that can be
traced through horizontally or vertically adjacent cells, using each cell at most once per word.

**Why a trie:** running the single-word search (LC 79) once per word repeats the same grid walks
for every word that shares a prefix. With a trie, **one** DFS from each cell follows the trie
alongside the grid path. It stops the moment the path spells a prefix that no word has, and it
finds all the words sharing that prefix in the same walk.

```java
// LC 212 Word Search II: every dictionary word that can be traced on the board.
public List<String> findWords(char[][] board, String[] words) {
    WsNode root = new WsNode();
    for (String w : words) {
        WsNode cur = root;
        for (char ch : w.toCharArray()) {
            int c = ch - 'a';
            if (cur.next[c] == null) {
                cur.next[c] = new WsNode();
                cur.children++;
            }
            cur = cur.next[c];
        }
        cur.word = w;                                   // store the whole word at its last node
    }
    List<String> found = new ArrayList<>();
    for (int r = 0; r < board.length; r++) {
        for (int c = 0; c < board[0].length; c++) dfs(board, r, c, root, found);
    }
    return found;
}

private void dfs(char[][] board, int r, int c, WsNode parent, List<String> found) {
    if (r < 0 || c < 0 || r >= board.length || c >= board[0].length) return;
    char ch = board[r][c];
    // visited, or no word continues this way
    if (ch == '#' || parent.next[ch - 'a'] == null) return;
    WsNode node = parent.next[ch - 'a'];
    if (node.word != null) {
        found.add(node.word);
        node.word = null;                               // report each word once
    }
    board[r][c] = '#';                                  // mark visited, in place
    dfs(board, r + 1, c, node, found);
    dfs(board, r - 1, c, node, found);
    dfs(board, r, c + 1, node, found);
    dfs(board, r, c - 1, node, found);
    board[r][c] = ch;                                // restore
    if (node.word == null && node.children == 0) {   // nothing left to find below: prune the branch
        parent.next[ch - 'a'] = null;
        parent.children--;
    }
}

private static final class WsNode {
    final WsNode[] next = new WsNode[26];
    int children;                                       // non-null entries in next[]
    String word;
}
```

**The details that make it fast enough:**
1. **Store the word on its end node**, so you don't have to rebuild it from the path.
2. **Set `node.word = null` after reporting**, so each word is reported once, without a `Set`.
3. **Mark cells in place** (`'#'`) instead of keeping a `visited[][]` array, and restore them on the way back.
4. **Prune exhausted branches:** when a node has no word and no children left, unlink it from its
   parent. Later DFS calls then stop earlier. On grids full of the same letter, this is
   the difference between passing and timing out. The `children` counter makes the check O(1).

**Complexity:** O(R·C·4·3^(L−1)) in the worst case (the first step has 4 directions, later ones
3), where L is the longest word, plus O(total characters) to build the trie.

## 2.4 Trie + DP — Word Break and Concatenated Words

A trie turns "is `s[i..j]` a dictionary word?" checks into a **single walk** from `i`. You stop as
soon as no word continues, instead of hashing every substring.

The problems in the rest of Part 2 share this node and insert:

```java
// The bare node used by the problems below, and the usual insert.
private static final class WordNode {
    final WordNode[] next = new WordNode[26];
    boolean isWord;
}

private static void insert(WordNode root, String word) {
    WordNode cur = root;
    for (char ch : word.toCharArray()) {
        int c = ch - 'a';
        if (cur.next[c] == null) cur.next[c] = new WordNode();
        cur = cur.next[c];
    }
    cur.isWord = true;
}
```

**LC 139 Word Break:** can `s` be split into dictionary words?

```java
// LC 139: can s be split into dictionary words? Walk the trie from every reachable start.
public boolean wordBreak(String s, List<String> wordDict) {
    WordNode root = new WordNode();
    for (String w : wordDict) insert(root, w);
    int n = s.length();
    boolean[] reachable = new boolean[n + 1];      // reachable[i]: s[0, i) splits into words
    reachable[0] = true;
    for (int start = 0; start < n; start++) {
        if (!reachable[start]) continue;
        WordNode cur = root;
        for (int end = start; end < n; end++) {
            cur = cur.next[s.charAt(end) - 'a'];
            if (cur == null) break;                 // no dictionary word continues: stop early
            if (cur.isWord) reachable[end + 1] = true;
        }
    }
    return reachable[n];
}
```

`reachable[i]` means "the first `i` characters can be split into words". From every reachable `start`, walk the trie along
`s`. Each word that ends at `end` makes `end + 1` reachable. The cost is O(n · maxWordLength) instead
of O(n²) substring creations, and the walk stops early on dead prefixes.

**LC 472 Concatenated Words:** which words are concatenations of at least two other words from the list?

```java
// LC 472: words that are concatenations of at least two shorter words from the same list.
public List<String> findAllConcatenatedWordsInADict(String[] words) {
    String[] byLength = words.clone();
    Arrays.sort(byLength, Comparator.comparingInt(String::length));   // shorter words first
    WordNode root = new WordNode();
    List<String> result = new ArrayList<>();
    for (String w : byLength) {
        if (w.isEmpty()) continue;
        // the trie holds only shorter (or equal-length, different) words
        if (canBuild(w, root)) result.add(w);
        insert(root, w);
    }
    return result;
}

private boolean canBuild(String w, WordNode root) {   // the word-break DP above
    boolean[] reachable = new boolean[w.length() + 1];
    reachable[0] = true;
    for (int start = 0; start < w.length(); start++) {
        if (!reachable[start]) continue;
        WordNode cur = root;
        for (int end = start; end < w.length(); end++) {
            cur = cur.next[w.charAt(end) - 'a'];
            if (cur == null) break;
            if (cur.isWord) reachable[end + 1] = true;
        }
    }
    return reachable[w.length()];
}
```

**The trick:** process words **from shortest to longest**, checking each one against a trie that
holds only the words seen so far, then insert it. A word can only be built from strictly shorter
words, so the trie never contains the word itself. That's how the "at least two parts" rule is
satisfied without counting parts.

## 2.5 Shortest and longest prefixes

**LC 648 Replace Words:** replace each word in a sentence by the **shortest** dictionary root that
is a prefix of it.

```java
// LC 648: replace each word by the shortest dictionary root that is a prefix of it.
public String replaceWords(List<String> dictionary, String sentence) {
    WordNode root = new WordNode();
    for (String r : dictionary) insert(root, r);
    StringBuilder out = new StringBuilder();
    for (String word : sentence.split(" ")) {
        if (out.length() > 0) out.append(' ');
        out.append(shortestRoot(root, word));
    }
    return out.toString();
}

private String shortestRoot(WordNode root, String word) {
    WordNode cur = root;
    for (int i = 0; i < word.length(); i++) {
        cur = cur.next[word.charAt(i) - 'a'];
        if (cur == null) break;
        if (cur.isWord) return word.substring(0, i + 1);   // the first root we meet is the shortest
    }
    return word;
}
```

The first word-ending node met while walking down is the shortest root, so return immediately.
This is the same **longest/shortest prefix match** that IP routers do with binary tries over
address bits (3.3).

**LC 720 Longest Word in Dictionary:** the longest word that can be built one letter at a time,
with every prefix also a word. Break ties by the smallest word.

```java
// LC 720: the longest word buildable one letter at a time from other words; ties: smallest.
public String longestWord(String[] words) {
    WordNode root = new WordNode();
    for (String w : words) insert(root, w);
    String[] best = { "" };
    dfs(root, new StringBuilder(), best);
    return best[0];
}

private void dfs(WordNode node, StringBuilder path, String[] best) {
    // a..z order: first is smallest
    if (path.length() > best[0].length()) best[0] = path.toString();
    for (int c = 0; c < 26; c++) {
        WordNode child = node.next[c];
        if (child == null || !child.isWord) continue;     // every prefix must itself be a word
        path.append((char) ('a' + c));
        dfs(child, path, best);
        path.deleteCharAt(path.length() - 1);
    }
}
```

**Approach.** DFS only through children that are themselves words. Visiting `'a'..'z'` in order
means the first word found at any length is the smallest one, so a strict `>` comparison keeps
it, and no explicit tie-break is needed.

## 2.6 Binary tries for XOR ⭐

**LC 421 Maximum XOR of Two Numbers:** the maximum of `a ^ b` over all pairs, in O(n · 31) rather
than O(n²).

**Idea.** Store each number's bits, **most significant first**, in a trie with two children
(`0`/`1`). To maximise `x ^ y` for a given `x`, walk down choosing the **opposite** bit whenever
it exists. A 1 in a higher bit beats any combination of lower bits, so being greedy from the top bit is
optimal.

```text
x = 0101 (5).  At each level prefer the child with the opposite bit:
bit 3: x has 0, want 1 -> exists?  take it, result bit = 1
bit 2: x has 1, want 0 -> missing? take 1,  result bit = 0
...
```

```java
// LC 421: maximum a XOR b over all pairs. A binary trie of the numbers, top bit first.
public int findMaximumXOR(int[] nums) {
    BitNode root = new BitNode();
    int best = 0;
    for (int x : nums) {
        insertBits(root, x);
        best = Math.max(best, maxXorWith(root, x));     // x against everything inserted so far
    }
    return best;
}

private static final class BitNode {
    final BitNode[] next = new BitNode[2];
}

private void insertBits(BitNode root, int x) {          // non-negative ints: bits 30..0
    BitNode cur = root;
    for (int b = 30; b >= 0; b--) {
        int bit = (x >>> b) & 1;
        if (cur.next[bit] == null) cur.next[bit] = new BitNode();
        cur = cur.next[bit];
    }
}

private int maxXorWith(BitNode root, int x) {         // greedy: take the opposite bit when possible
    BitNode cur = root;
    int result = 0;
    for (int b = 30; b >= 0; b--) {
        int bit = (x >>> b) & 1;
        if (cur.next[1 - bit] != null) {
            result |= 1 << b;                           // this bit of the XOR can be 1
            cur = cur.next[1 - bit];
        } else {
            cur = cur.next[bit];
        }
    }
    return result;
}
```

**LC 1707 Maximum XOR With an Element From Array:** each query `(x, m)` may only use numbers ≤ `m`.

```java
// LC 1707: for each query (x, m), the max x XOR num over nums <= m, or -1. Answer queries offline:
// sort them by m, and insert numbers into the trie only once they become allowed.
public int[] maximizeXor(int[] nums, int[][] queries) {
    int[] sorted = nums.clone();
    Arrays.sort(sorted);
    Integer[] order = new Integer[queries.length];
    for (int i = 0; i < order.length; i++) order[i] = i;
    Arrays.sort(order, Comparator.comparingInt(i -> queries[i][1]));
    int[] answer = new int[queries.length];
    BitNode root = new BitNode();
    int next = 0;
    for (int qi : order) {
        int x = queries[qi][0], m = queries[qi][1];
        while (next < sorted.length && sorted[next] <= m) insertBits(root, sorted[next++]);
        answer[qi] = (next == 0) ? -1 : maxXorWith(root, x);
    }
    return answer;
}
```

**The offline-queries trick:** sort the queries by `m` and the numbers ascending. Before answering
a query, insert every number ≤ its `m`. The trie then contains exactly the allowed numbers. This
"sort queries to make the data structure grow monotonically" technique appears in many hard
problems.

## 2.7 Reversed-word tries — Palindrome Pairs

**LC 336 Palindrome Pairs:** every pair `(i, j)`, `i ≠ j`, such that `words[i] + words[j]` is a palindrome.

**Idea.** `words[i] + words[j]` is a palindrome when `words[i]` *starts with the reverse of
`words[j]`* and what's left over in the middle is itself a palindrome. Put every word into a trie **reversed**, then walk
each `words[i]` forwards through it. There are two ways to match:

1. **The partner is shorter:** while walking `words[i]`, you reach a node where a reversed word ends.
   If the remaining part of `words[i]` is a palindrome, it's a pair.
2. **The partner is longer, or the same length:** `words[i]` is used up at some node. Any reversed word passing through
   that node whose *unread part* is a palindrome is a pair. Precompute those indexes on each
   node during insertion (`restIsPalindrome`).

```java
// LC 336: all (i, j), i != j, with words[i] + words[j] a palindrome. A trie of REVERSED words.
public List<List<Integer>> palindromePairs(String[] words) {
    PalNode root = new PalNode();
    for (int i = 0; i < words.length; i++) addReversed(root, words[i], i);
    List<List<Integer>> result = new ArrayList<>();
    for (int i = 0; i < words.length; i++) findPartners(root, words, i, result);
    return result;
}

private static final class PalNode {
    final PalNode[] next = new PalNode[26];
    int wordIndex = -1;                                     // a reversed word ends here
    // words whose not-yet-inserted part is a palindrome
    final List<Integer> restIsPalindrome = new ArrayList<>();
}

private void addReversed(PalNode root, String word, int i) {
    PalNode cur = root;
    for (int j = word.length() - 1; j >= 0; j--) {
        if (isPalindrome(word, 0, j)) cur.restIsPalindrome.add(i);
        int c = word.charAt(j) - 'a';
        if (cur.next[c] == null) cur.next[c] = new PalNode();
        cur = cur.next[c];
    }
    cur.restIsPalindrome.add(i);                            // the empty rest is a palindrome
    cur.wordIndex = i;
}

private void findPartners(PalNode root, String[] words, int i, List<List<Integer>> result) {
    String word = words[i];
    PalNode cur = root;
    for (int j = 0; j < word.length(); j++) {
        // case 1: a shorter partner ended here, and the rest of words[i] is a palindrome
        if (cur.wordIndex >= 0 && cur.wordIndex != i && isPalindrome(word, j, word.length() - 1)) {
            result.add(List.of(i, cur.wordIndex));
        }
        cur = cur.next[word.charAt(j) - 'a'];
        if (cur == null) return;
    }
    for (int k : cur.restIsPalindrome) {                  // case 2: words[i] used up; the partner's
        if (k != i) result.add(List.of(i, k));            // remaining part is a palindrome
    }
}

private static boolean isPalindrome(String s, int lo, int hi) {
    while (lo < hi) {
        if (s.charAt(lo++) != s.charAt(hi--)) return false;
    }
    return true;
}
```

**Complexity:** O(n · k²) for n words of length up to k, against O(n² · k) for checking every pair. Empty
strings work naturally: `""` pairs with every palindrome, in both orders.

## 2.8 Suffix tries — distinct substrings

**Every substring is a prefix of some suffix.** Insert all suffixes of `s` into a trie, and every
node is one distinct substring:

```java
// Every substring is a prefix of some suffix: insert all suffixes, count the nodes. O(n^2).
public int countDistinctSubstrings(String s) {
    WordNode root = new WordNode();
    int nodes = 0;
    for (int i = 0; i < s.length(); i++) {
        WordNode cur = root;
        for (int j = i; j < s.length(); j++) {
            int c = s.charAt(j) - 'a';
            if (cur.next[c] == null) {
                cur.next[c] = new WordNode();
                nodes++;                              // a new node = a substring never seen before
            }
            cur = cur.next[c];
        }
    }
    return nodes;
}
```

That's O(n²) time and nodes, fine for n ≈ 10³. For larger inputs, the same idea compressed is the **suffix
tree** (O(n) nodes), and the practical alternatives are the **suffix array + LCP array**
(distinct substrings = `n(n+1)/2 − Σ LCP`) and the **suffix automaton**. Know that they exist and
what they're for. They're rarely coded in interviews.

---

# Part 3 — Advanced

## 3.1 Autocomplete with ranking

**LC 642 Design Search Autocomplete System:** as the user types, return the top three past
sentences with the current prefix, by frequency, ties broken alphabetically. `'#'` ends a
sentence and records it.

```java
// LC 642 (simplified autocomplete): after each typed character, the top 3 past sentences with that
// prefix by frequency, ties broken alphabetically. '#' ends the sentence and records it.
class AutocompleteSystem {
    private static final class Node {
        final Map<Character, Node> next = new HashMap<>();     // letters and spaces
        final Map<String, Integer> counts = new HashMap<>();   // every sentence below this node
    }

    private final Node root = new Node();
    private final StringBuilder typed = new StringBuilder();
    private Node cur = root;                                   // node for the text typed so far

    public AutocompleteSystem(String[] sentences, int[] times) {
        for (int i = 0; i < sentences.length; i++) add(sentences[i], times[i]);
    }

    public List<String> input(char c) {
        if (c == '#') {
            add(typed.toString(), 1);
            typed.setLength(0);
            cur = root;
            return List.of();
        }
        typed.append(c);
        cur = (cur == null) ? null : cur.next.get(c);          // once we fall off, stay off
        if (cur == null) return List.of();
        PriorityQueue<Map.Entry<String, Integer>> worstFirst = new PriorityQueue<>((a, b) ->
                a.getValue().equals(b.getValue())
                        ? b.getKey().compareTo(a.getKey())
                        : Integer.compare(a.getValue(), b.getValue()));
        for (Map.Entry<String, Integer> e : cur.counts.entrySet()) {
            worstFirst.offer(e);
            if (worstFirst.size() > 3) worstFirst.poll();       // keep the best 3
        }
        List<String> result = new ArrayList<>();
        while (!worstFirst.isEmpty()) result.add(worstFirst.poll().getKey());
        Collections.reverse(result);
        return result;
    }

    private void add(String sentence, int times) {
        Node node = root;
        for (char ch : sentence.toCharArray()) {
            node = node.next.computeIfAbsent(ch, k -> new Node());
            node.counts.merge(sentence, times, Integer::sum);
        }
    }
}
```

**Design choices worth saying out loud:**
- **Keep a pointer to the current node** between keystrokes. Each character costs one step, not a
  walk from the root. Once the prefix falls off the trie, it stays off until `'#'`.
- **Each node stores the counts of the sentences below it.** That costs memory, roughly every
  sentence repeated once per character, but it makes a query "scan one node's map plus a size-3
  heap" instead of a DFS over the whole subtree.
- **Top-k with a min-heap of size 3** (*Stacks, Queues & Heaps* guide). Its comparator puts the
  *worst* candidate on top (lowest count, then the alphabetically larger), so `poll` evicts it.

**At scale** (search engines), production systems precompute and store only the top k
suggestions per node, update them in offline batches rather than per keystroke, shard the trie by
prefix, cache hot prefixes, and add typo tolerance (edit distance over the trie).

## 3.2 Aho–Corasick — many patterns, one pass

**Problem:** find every occurrence of **many** patterns in a long text: banned words in chat
messages, virus signatures, keyword tagging. Running KMP once per pattern costs
O(patterns × text). **Aho–Corasick** does it in **one pass** over the text: O(text + total pattern
length + matches).

**Idea.** Build a trie of the patterns, then add a **failure link** to every node: it points to the
node for the **longest proper suffix** of that node's string that is also in the trie. It's KMP's
failure function, generalised from one pattern to a trie. While scanning the text, when the
next character has no edge, follow failure links instead of restarting. Precomputing all
transitions (the `else` branch below) turns the trie into an automaton with exactly one step per
text character.

```text
patterns: he, she, his, hers         text: ushers

trie path "she" --fail--> "he"   (the longest suffix of "she" in the trie)
scanning "ushers": at 'e' (end of "she") we also report "he" via the fail link;
at 's' after "her" we reach "hers".
matches: she@1, he@2, hers@2
```

```java
// Every occurrence of every pattern in a text, in O(text + total pattern length + matches).
class AhoCorasick {
    private static final class Node {
        final Node[] next = new Node[26];
        // longest proper suffix that is also in the trie
        Node fail;
        // patterns ending here, directly or via fail links
        final List<Integer> output = new ArrayList<>();
    }

    private final Node root = new Node();
    private final int[] lengths;

    AhoCorasick(String[] patterns) {
        lengths = new int[patterns.length];
        for (int p = 0; p < patterns.length; p++) {        // 1. an ordinary trie of the patterns
            lengths[p] = patterns[p].length();
            Node cur = root;
            for (char ch : patterns[p].toCharArray()) {
                int c = ch - 'a';
                if (cur.next[c] == null) cur.next[c] = new Node();
                cur = cur.next[c];
            }
            cur.output.add(p);
        }
        Deque<Node> queue = new ArrayDeque<>();            // 2. failure links, level by level (BFS)
        root.fail = root;
        for (int c = 0; c < 26; c++) {
            if (root.next[c] != null) {
                root.next[c].fail = root;
                queue.add(root.next[c]);
            } else {
                root.next[c] = root;                       // a missing edge at the root loops back
            }
        }
        while (!queue.isEmpty()) {
            Node node = queue.poll();
            node.output.addAll(node.fail.output);     // matches that end in our suffix end here too
            for (int c = 0; c < 26; c++) {
                Node child = node.next[c];
                if (child != null) {
                    // the fail node is shallower: already complete
                    child.fail = node.fail.next[c];
                    queue.add(child);
                } else {
                    // fill the gap: the trie becomes an automaton
                    node.next[c] = node.fail.next[c];
                }
            }
        }
    }

    // {patternIndex, startIndex} for every match, in order of where the match ends.
    List<int[]> findAll(String text) {
        List<int[]> matches = new ArrayList<>();
        Node cur = root;
        for (int i = 0; i < text.length(); i++) {
            // exactly one step per character, no backtracking
            cur = cur.next[text.charAt(i) - 'a'];
            for (int p : cur.output) matches.add(new int[] { p, i - lengths[p] + 1 });
        }
        return matches;
    }
}
```

**The details:**
- Failure links are computed **breadth-first**, because a node's link points to a shallower node,
  whose link and transitions must already be complete.
- `output` merges the fail node's patterns, so a node reports every pattern that ends at this
  position, including the shorter ones that are suffixes (`he` inside `she`).
- Missing edges are filled with the fail node's transition (`node.next[c] = node.fail.next[c]`), so
  `findAll` never loops. It moves exactly one step per character.

## 3.3 Tries in real systems

| Where | Which trie |
|---|---|
| IP routing (longest prefix match) | binary / Patricia tries over address bits |
| HTTP routers (`/users/{id}/orders`) | radix trees over path segments |
| Search boxes, IDE completion | tries with top-k per node (3.1) |
| Spell checkers | trie + edit-distance search |
| Content filtering, intrusion detection | Aho–Corasick automata (3.2) |
| Linux kernel page cache | radix tree (now "XArray") keyed by page index |
| Ethereum state | Merkle Patricia trie |

---

# Part 4 — Solving Any Trie Question

## 4.1 When is it a trie problem?

| The problem says… | Trie shape |
|---|---|
| prefix, starts with, autocomplete, "as the user types" | standard trie, maybe with data on nodes (1.6, 2.1, 3.1) |
| many words + a grid / board | trie + DFS with pruning (2.3) |
| dictionary + "can the string be split / built from words" | trie + DP (2.4) |
| shortest root / longest prefix match | walk and stop at the first or last word end (2.5) |
| `.` or `?` wildcards | trie + DFS that branches on the wildcard (2.2) |
| maximum XOR, "XOR with limits" | binary trie, MSB first, greedy opposite bit (2.6) |
| palindrome pairs, suffix matching | trie of reversed words (2.7) |
| count distinct substrings | suffix trie for small n (2.8), suffix array beyond |
| find many patterns in one text | Aho–Corasick (3.2) |

**If none of those apply, you probably don't need a trie.** A `HashSet` answers exact lookups more cheaply.

## 4.2 Design checklist

Before coding, decide:
1. **Alphabet:** a fixed small one (use an array), or unknown/large (use a map)? Is the input case-sensitive?
2. **What does a node store?** `isWord`, counts, the word itself, a value, a top-k list, an index.
3. **Do you need deletion?** If so, prune (1.3), or use counts (1.5).
4. **Do you need sorted output?** Arrays give it for free. With maps you must sort.
5. **Memory budget:** at about 10⁶ nodes, consider sorting + binary search, or a compressed trie (1.7).

## 4.3 Complexity cheat sheet

| Operation | Time | Notes |
|---|---|---|
| insert / search / startsWith | O(L) | independent of the number of words |
| list words with a prefix | O(L + total characters output) | sorted for free with array children |
| wildcard search, `d` dots | O(26^d · L) worst case | usually far less |
| Word Search II | O(R·C·4·3^(L−1)) worst case | pruning matters in practice |
| max XOR of n numbers | O(n · B) | B = number of bits (31) |
| Aho–Corasick | O(Σ patterns · σ + text + matches) | σ = alphabet size, for the automaton build |
| space | O(total characters × σ) worst case | array children cost σ slots per node |

## 4.4 Edge cases to test every time

- **The empty string:** `insert("")` marks the root as a word. Decide what `startsWith("")` means
  (here it's always `true`).
- **A word that is a prefix of another** (`car`/`cart`): this checks `isWord` versus path existence, and pruning on delete.
- **Duplicates:** use counts (1.5), and don't report a word twice (2.3).
- **Characters outside the alphabet:** uppercase, digits or spaces with a `[26]` array throw.
- **Deleting a word that isn't there**, or deleting it twice.
- **Binary tries:** negative numbers (handle the sign bit explicitly, or offset the values), and the bit width.

## 4.5 Practice ladder

**Foundation**
- Implement Trie (208)
- Longest Common Prefix (14), solved with a trie as a warm-up
- Implement Trie II (1804)
- Map Sum Pairs (677)
- Replace Words (648)
- Longest Word in Dictionary (720)

**Core patterns**
- Design Add and Search Words Data Structure (211) ⭐
- Search Suggestions System (1268) ⭐
- Word Search II (212) ⭐⭐
- Word Break (139), the trie version
- Maximum XOR of Two Numbers in an Array (421) ⭐
- Count Prefix and Suffix Pairs (3045)
- Sum of Prefix Scores of Strings (2416)

**Hard**
- Concatenated Words (472)
- Palindrome Pairs (336) ⭐
- Maximum XOR With an Element From Array (1707)
- Design Search Autocomplete System (642)
- Stream of Characters (1032): a trie of reversed words, or Aho–Corasick
- Word Squares (425)
- Count Pairs With XOR in a Range (1803)

## 4.6 The mistakes that cost people offers

1. **Confusing "the path exists" with "the word exists"**: forgetting `isWord` in `search`.
2. **Deleting by clearing `isWord` only**, which leaves dead branches, so `startsWith` lies afterwards.
3. **A `[26]` array with uppercase letters, spaces or digits**: `ArrayIndexOutOfBoundsException`.
4. **Rebuilding the word from the path** on every match instead of storing it on the end node.
5. **Reporting duplicates** in Word Search II (fix: `node.word = null`), and not pruning (timeouts).
6. **Binary trie bit order:** inserting least significant bit first makes the greedy choice wrong.
7. **Restarting from the root on every keystroke** in autocomplete instead of keeping the current node.
8. **Using a trie where a `HashSet` or a sorted array is simpler.** Say why the trie is needed.
9. **Forgetting the memory cost.** Interviewers often follow up with "what if there are 10⁸ words?"

## 4.7 The one-page summary

```text
TRIE        node = prefix; edge = character; isWord marks word ends
            insert/search/startsWith: walk the string, O(L), independent of word count
            search needs isWord; startsWith only needs the path
CHILDREN    Node[26] for a-z (fast, sorted, ~144 B/node); HashMap for big/unknown alphabets
DELETE      clear isWord, then prune childless non-word nodes on the way back up
NODE DATA   passCount/endCount (prefix counts), sums (map sum), top-k lists (suggestions)
PATTERNS    typing     -> keep the current node, one step per character
            wildcard   -> DFS into every child on '.'
            grid       -> one DFS per cell following the trie; store word at end node,
                          null it when found, mark cells in place, prune empty branches
            word break -> from each reachable i walk the trie, mark every word end
            XOR        -> binary trie MSB first, greedily take the opposite bit
            palindrome -> trie of reversed words + "rest is palindrome" lists
            substrings -> insert all suffixes; nodes = distinct substrings
ADVANCED    autocomplete = trie + counts/top-k per node + current-node pointer
            Aho-Corasick = trie + BFS failure links -> all patterns in one pass
ALTERNATIVE sorted array + binary search answers static prefix queries with no extra memory
```

Print that block. Read it before every mock interview.
