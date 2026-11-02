// LeetCode practice list for the DSA section's "Coding questions" tab. Problems link out to
// LeetCode; status, notes and the revisit flag live in the learner's browser, keyed by
// problemRef (track 'dsa'). Topics map to the guide that teaches the technique.

export { PRACTICE_TOPICS, practiceTopic } from './practiceTopics';
export type { PracticeTopic } from './practiceTopics';

export type LeetCodeDifficulty = 'Easy' | 'Medium' | 'Hard';

export interface LeetCodeProblem {
  /** LeetCode problem number */
  id: number;
  /** exactly as on LeetCode */
  title: string;
  /** URL slug: leetcode.com/problems/<slug>/ */
  slug: string;
  difficulty: LeetCodeDifficulty;
  /** PracticeTopic id */
  topic: string;
  patterns: string[];
  /** needs LeetCode Premium */
  premium?: boolean;
}

export const LEETCODE_DIFFICULTIES: LeetCodeDifficulty[] = ['Easy', 'Medium', 'Hard'];

const p = (
  id: number,
  title: string,
  slug: string,
  difficulty: LeetCodeDifficulty,
  topic: string,
  patterns: string[],
  premium?: boolean,
): LeetCodeProblem => ({ id, title, slug, difficulty, topic, patterns, ...(premium ? { premium } : {}) });

// Each topic is a ladder: Easy, then Medium, then Hard.
export const LEETCODE_PROBLEMS: LeetCodeProblem[] = [
  // Arrays & Hashing
  p(1, 'Two Sum', 'two-sum', 'Easy', 'arrays-hashing', ['Hash map']),
  p(217, 'Contains Duplicate', 'contains-duplicate', 'Easy', 'arrays-hashing', ['Hash set']),
  p(242, 'Valid Anagram', 'valid-anagram', 'Easy', 'arrays-hashing', ['Counting']),
  p(121, 'Best Time to Buy and Sell Stock', 'best-time-to-buy-and-sell-stock', 'Easy', 'arrays-hashing', ['Running minimum']),
  p(49, 'Group Anagrams', 'group-anagrams', 'Medium', 'arrays-hashing', ['Hash map', 'Canonical key']),
  p(238, 'Product of Array Except Self', 'product-of-array-except-self', 'Medium', 'arrays-hashing', ['Prefix & suffix products']),
  p(128, 'Longest Consecutive Sequence', 'longest-consecutive-sequence', 'Medium', 'arrays-hashing', ['Hash set']),
  p(560, 'Subarray Sum Equals K', 'subarray-sum-equals-k', 'Medium', 'arrays-hashing', ['Prefix sum', 'Hash map']),
  p(53, 'Maximum Subarray', 'maximum-subarray', 'Medium', 'arrays-hashing', ['Kadane']),
  p(54, 'Spiral Matrix', 'spiral-matrix', 'Medium', 'arrays-hashing', ['Matrix traversal']),
  p(48, 'Rotate Image', 'rotate-image', 'Medium', 'arrays-hashing', ['Matrix', 'Transpose']),
  p(41, 'First Missing Positive', 'first-missing-positive', 'Hard', 'arrays-hashing', ['Index as hash']),

  // Two Pointers
  p(125, 'Valid Palindrome', 'valid-palindrome', 'Easy', 'two-pointers', ['Opposite ends']),
  p(283, 'Move Zeroes', 'move-zeroes', 'Easy', 'two-pointers', ['Read/write pointers']),
  p(26, 'Remove Duplicates from Sorted Array', 'remove-duplicates-from-sorted-array', 'Easy', 'two-pointers', ['Read/write pointers']),
  p(977, 'Squares of a Sorted Array', 'squares-of-a-sorted-array', 'Easy', 'two-pointers', ['Opposite ends']),
  p(167, 'Two Sum II - Input Array Is Sorted', 'two-sum-ii-input-array-is-sorted', 'Medium', 'two-pointers', ['Opposite ends']),
  p(15, '3Sum', '3sum', 'Medium', 'two-pointers', ['Sort + two pointers']),
  p(11, 'Container With Most Water', 'container-with-most-water', 'Medium', 'two-pointers', ['Opposite ends', 'Greedy']),
  p(42, 'Trapping Rain Water', 'trapping-rain-water', 'Hard', 'two-pointers', ['Opposite ends', 'Running max']),

  // Sliding Window
  p(643, 'Maximum Average Subarray I', 'maximum-average-subarray-i', 'Easy', 'sliding-window', ['Fixed window']),
  p(3, 'Longest Substring Without Repeating Characters', 'longest-substring-without-repeating-characters', 'Medium', 'sliding-window', ['Variable window', 'Hash set']),
  p(424, 'Longest Repeating Character Replacement', 'longest-repeating-character-replacement', 'Medium', 'sliding-window', ['Variable window', 'Counting']),
  p(567, 'Permutation in String', 'permutation-in-string', 'Medium', 'sliding-window', ['Fixed window', 'Counting']),
  p(438, 'Find All Anagrams in a String', 'find-all-anagrams-in-a-string', 'Medium', 'sliding-window', ['Fixed window', 'Counting']),
  p(209, 'Minimum Size Subarray Sum', 'minimum-size-subarray-sum', 'Medium', 'sliding-window', ['Variable window']),
  p(76, 'Minimum Window Substring', 'minimum-window-substring', 'Hard', 'sliding-window', ['Variable window', 'Counting']),
  p(239, 'Sliding Window Maximum', 'sliding-window-maximum', 'Hard', 'sliding-window', ['Monotonic deque']),

  // Linked List
  p(206, 'Reverse Linked List', 'reverse-linked-list', 'Easy', 'linked-list', ['In-place reversal']),
  p(21, 'Merge Two Sorted Lists', 'merge-two-sorted-lists', 'Easy', 'linked-list', ['Dummy node', 'Merge']),
  p(141, 'Linked List Cycle', 'linked-list-cycle', 'Easy', 'linked-list', ['Fast & slow pointers']),
  p(876, 'Middle of the Linked List', 'middle-of-the-linked-list', 'Easy', 'linked-list', ['Fast & slow pointers']),
  p(19, 'Remove Nth Node From End of List', 'remove-nth-node-from-end-of-list', 'Medium', 'linked-list', ['Fixed gap', 'Dummy node']),
  p(143, 'Reorder List', 'reorder-list', 'Medium', 'linked-list', ['Middle, reverse, weave']),
  p(142, 'Linked List Cycle II', 'linked-list-cycle-ii', 'Medium', 'linked-list', ['Floyd cycle entrance']),
  p(2, 'Add Two Numbers', 'add-two-numbers', 'Medium', 'linked-list', ['Dummy node', 'Carry']),
  p(146, 'LRU Cache', 'lru-cache', 'Medium', 'linked-list', ['Hash map + doubly linked list']),
  p(25, 'Reverse Nodes in k-Group', 'reverse-nodes-in-k-group', 'Hard', 'linked-list', ['In-place reversal']),

  // Stacks & Monotonic Stacks
  p(20, 'Valid Parentheses', 'valid-parentheses', 'Easy', 'stack', ['Stack matching']),
  p(232, 'Implement Queue using Stacks', 'implement-queue-using-stacks', 'Easy', 'stack', ['Two stacks']),
  p(155, 'Min Stack', 'min-stack', 'Medium', 'stack', ['Auxiliary stack']),
  p(150, 'Evaluate Reverse Polish Notation', 'evaluate-reverse-polish-notation', 'Medium', 'stack', ['Operand stack']),
  p(739, 'Daily Temperatures', 'daily-temperatures', 'Medium', 'stack', ['Monotonic stack']),
  p(853, 'Car Fleet', 'car-fleet', 'Medium', 'stack', ['Sorting', 'Monotonic stack']),
  p(394, 'Decode String', 'decode-string', 'Medium', 'stack', ['Stack of frames']),
  p(84, 'Largest Rectangle in Histogram', 'largest-rectangle-in-histogram', 'Hard', 'stack', ['Monotonic stack']),
  p(224, 'Basic Calculator', 'basic-calculator', 'Hard', 'stack', ['Stack of signs']),

  // Heaps & Priority Queues
  p(703, 'Kth Largest Element in a Stream', 'kth-largest-element-in-a-stream', 'Easy', 'heap', ['Size-k min-heap']),
  p(1046, 'Last Stone Weight', 'last-stone-weight', 'Easy', 'heap', ['Max-heap']),
  p(215, 'Kth Largest Element in an Array', 'kth-largest-element-in-an-array', 'Medium', 'heap', ['Size-k min-heap', 'Quickselect']),
  p(347, 'Top K Frequent Elements', 'top-k-frequent-elements', 'Medium', 'heap', ['Counting', 'Heap or buckets']),
  p(973, 'K Closest Points to Origin', 'k-closest-points-to-origin', 'Medium', 'heap', ['Size-k max-heap']),
  p(23, 'Merge k Sorted Lists', 'merge-k-sorted-lists', 'Hard', 'heap', ['K-way merge']),
  p(295, 'Find Median from Data Stream', 'find-median-from-data-stream', 'Hard', 'heap', ['Two heaps']),

  // Binary Search & Sorting
  p(704, 'Binary Search', 'binary-search', 'Easy', 'binary-search', ['Binary search template']),
  p(35, 'Search Insert Position', 'search-insert-position', 'Easy', 'binary-search', ['Lower bound']),
  p(74, 'Search a 2D Matrix', 'search-a-2d-matrix', 'Medium', 'binary-search', ['Flattened index']),
  p(34, 'Find First and Last Position of Element in Sorted Array', 'find-first-and-last-position-of-element-in-sorted-array', 'Medium', 'binary-search', ['Lower & upper bound']),
  p(33, 'Search in Rotated Sorted Array', 'search-in-rotated-sorted-array', 'Medium', 'binary-search', ['Rotated array']),
  p(153, 'Find Minimum in Rotated Sorted Array', 'find-minimum-in-rotated-sorted-array', 'Medium', 'binary-search', ['Rotated array']),
  p(162, 'Find Peak Element', 'find-peak-element', 'Medium', 'binary-search', ['Slope search']),
  p(875, 'Koko Eating Bananas', 'koko-eating-bananas', 'Medium', 'binary-search', ['Search on the answer']),
  p(75, 'Sort Colors', 'sort-colors', 'Medium', 'binary-search', ['Dutch national flag']),
  p(981, 'Time Based Key-Value Store', 'time-based-key-value-store', 'Medium', 'binary-search', ['Upper bound', 'Hash map']),
  p(4, 'Median of Two Sorted Arrays', 'median-of-two-sorted-arrays', 'Hard', 'binary-search', ['Partition search']),

  // Backtracking
  p(78, 'Subsets', 'subsets', 'Medium', 'backtracking', ['Include / exclude']),
  p(90, 'Subsets II', 'subsets-ii', 'Medium', 'backtracking', ['Skip duplicates']),
  p(39, 'Combination Sum', 'combination-sum', 'Medium', 'backtracking', ['Choose with reuse']),
  p(46, 'Permutations', 'permutations', 'Medium', 'backtracking', ['Used set']),
  p(22, 'Generate Parentheses', 'generate-parentheses', 'Medium', 'backtracking', ['Constrained choices']),
  p(17, 'Letter Combinations of a Phone Number', 'letter-combinations-of-a-phone-number', 'Medium', 'backtracking', ['Cartesian product']),
  p(79, 'Word Search', 'word-search', 'Medium', 'backtracking', ['Grid DFS', 'Choose / un-choose']),
  p(131, 'Palindrome Partitioning', 'palindrome-partitioning', 'Medium', 'backtracking', ['Partition search']),
  p(51, 'N-Queens', 'n-queens', 'Hard', 'backtracking', ['Constraint sets']),

  // Trees & BSTs
  p(104, 'Maximum Depth of Binary Tree', 'maximum-depth-of-binary-tree', 'Easy', 'trees', ['DFS']),
  p(226, 'Invert Binary Tree', 'invert-binary-tree', 'Easy', 'trees', ['DFS']),
  p(100, 'Same Tree', 'same-tree', 'Easy', 'trees', ['Parallel DFS']),
  p(572, 'Subtree of Another Tree', 'subtree-of-another-tree', 'Easy', 'trees', ['Parallel DFS']),
  p(543, 'Diameter of Binary Tree', 'diameter-of-binary-tree', 'Easy', 'trees', ['Height with global answer']),
  p(110, 'Balanced Binary Tree', 'balanced-binary-tree', 'Easy', 'trees', ['Height with sentinel']),
  p(102, 'Binary Tree Level Order Traversal', 'binary-tree-level-order-traversal', 'Medium', 'trees', ['BFS by level']),
  p(199, 'Binary Tree Right Side View', 'binary-tree-right-side-view', 'Medium', 'trees', ['BFS by level']),
  p(98, 'Validate Binary Search Tree', 'validate-binary-search-tree', 'Medium', 'trees', ['Bounds DFS']),
  p(230, 'Kth Smallest Element in a BST', 'kth-smallest-element-in-a-bst', 'Medium', 'trees', ['In-order traversal']),
  p(235, 'Lowest Common Ancestor of a Binary Search Tree', 'lowest-common-ancestor-of-a-binary-search-tree', 'Medium', 'trees', ['BST walk']),
  p(236, 'Lowest Common Ancestor of a Binary Tree', 'lowest-common-ancestor-of-a-binary-tree', 'Medium', 'trees', ['Post-order DFS']),
  p(105, 'Construct Binary Tree from Preorder and Inorder Traversal', 'construct-binary-tree-from-preorder-and-inorder-traversal', 'Medium', 'trees', ['Divide & conquer']),
  p(124, 'Binary Tree Maximum Path Sum', 'binary-tree-maximum-path-sum', 'Hard', 'trees', ['Gain with global answer']),
  p(297, 'Serialize and Deserialize Binary Tree', 'serialize-and-deserialize-binary-tree', 'Hard', 'trees', ['Pre-order with nulls']),

  // Tries
  p(208, 'Implement Trie (Prefix Tree)', 'implement-trie-prefix-tree', 'Medium', 'tries', ['Trie']),
  p(211, 'Design Add and Search Words Data Structure', 'design-add-and-search-words-data-structure', 'Medium', 'tries', ['Trie', 'Wildcard DFS']),
  p(1268, 'Search Suggestions System', 'search-suggestions-system', 'Medium', 'tries', ['Trie', 'Sorted prefix search']),
  p(212, 'Word Search II', 'word-search-ii', 'Hard', 'tries', ['Trie + grid backtracking']),

  // Graphs
  p(733, 'Flood Fill', 'flood-fill', 'Easy', 'graphs', ['Grid DFS']),
  p(200, 'Number of Islands', 'number-of-islands', 'Medium', 'graphs', ['Grid DFS / BFS']),
  p(695, 'Max Area of Island', 'max-area-of-island', 'Medium', 'graphs', ['Grid DFS']),
  p(133, 'Clone Graph', 'clone-graph', 'Medium', 'graphs', ['DFS + hash map']),
  p(994, 'Rotting Oranges', 'rotting-oranges', 'Medium', 'graphs', ['Multi-source BFS']),
  p(417, 'Pacific Atlantic Water Flow', 'pacific-atlantic-water-flow', 'Medium', 'graphs', ['Reverse reachability']),
  p(130, 'Surrounded Regions', 'surrounded-regions', 'Medium', 'graphs', ['Border DFS']),
  p(207, 'Course Schedule', 'course-schedule', 'Medium', 'graphs', ['Topological sort', 'Cycle detection']),
  p(210, 'Course Schedule II', 'course-schedule-ii', 'Medium', 'graphs', ["Kahn's algorithm"]),
  p(547, 'Number of Provinces', 'number-of-provinces', 'Medium', 'graphs', ['Union-find', 'Components']),
  p(684, 'Redundant Connection', 'redundant-connection', 'Medium', 'graphs', ['Union-find']),
  p(743, 'Network Delay Time', 'network-delay-time', 'Medium', 'graphs', ['Dijkstra']),
  p(1584, 'Min Cost to Connect All Points', 'min-cost-to-connect-all-points', 'Medium', 'graphs', ['Minimum spanning tree']),
  p(127, 'Word Ladder', 'word-ladder', 'Hard', 'graphs', ['BFS shortest path']),

  // Dynamic Programming
  p(70, 'Climbing Stairs', 'climbing-stairs', 'Easy', 'dp', ['1-D DP']),
  p(746, 'Min Cost Climbing Stairs', 'min-cost-climbing-stairs', 'Easy', 'dp', ['1-D DP']),
  p(198, 'House Robber', 'house-robber', 'Medium', 'dp', ['1-D DP', 'Take / skip']),
  p(213, 'House Robber II', 'house-robber-ii', 'Medium', 'dp', ['1-D DP', 'Circular split']),
  p(322, 'Coin Change', 'coin-change', 'Medium', 'dp', ['Unbounded knapsack']),
  p(300, 'Longest Increasing Subsequence', 'longest-increasing-subsequence', 'Medium', 'dp', ['LIS', 'Patience sorting']),
  p(139, 'Word Break', 'word-break', 'Medium', 'dp', ['Prefix DP']),
  p(91, 'Decode Ways', 'decode-ways', 'Medium', 'dp', ['1-D DP']),
  p(152, 'Maximum Product Subarray', 'maximum-product-subarray', 'Medium', 'dp', ['Track max & min']),
  p(416, 'Partition Equal Subset Sum', 'partition-equal-subset-sum', 'Medium', 'dp', ['0/1 knapsack']),
  p(62, 'Unique Paths', 'unique-paths', 'Medium', 'dp', ['Grid DP']),
  p(1143, 'Longest Common Subsequence', 'longest-common-subsequence', 'Medium', 'dp', ['Two-string DP']),
  p(518, 'Coin Change II', 'coin-change-ii', 'Medium', 'dp', ['Counting knapsack']),
  p(309, 'Best Time to Buy and Sell Stock with Cooldown', 'best-time-to-buy-and-sell-stock-with-cooldown', 'Medium', 'dp', ['State machine DP']),
  p(494, 'Target Sum', 'target-sum', 'Medium', 'dp', ['Subset-sum counting']),
  p(72, 'Edit Distance', 'edit-distance', 'Medium', 'dp', ['Two-string DP']),
  p(312, 'Burst Balloons', 'burst-balloons', 'Hard', 'dp', ['Interval DP']),
  p(10, 'Regular Expression Matching', 'regular-expression-matching', 'Hard', 'dp', ['Two-string DP']),

  // Greedy & Intervals
  p(455, 'Assign Cookies', 'assign-cookies', 'Easy', 'greedy-intervals', ['Sort and match']),
  p(252, 'Meeting Rooms', 'meeting-rooms', 'Easy', 'greedy-intervals', ['Sort by start'], true),
  p(55, 'Jump Game', 'jump-game', 'Medium', 'greedy-intervals', ['Farthest reach']),
  p(45, 'Jump Game II', 'jump-game-ii', 'Medium', 'greedy-intervals', ['BFS layers']),
  p(134, 'Gas Station', 'gas-station', 'Medium', 'greedy-intervals', ['Running balance']),
  p(763, 'Partition Labels', 'partition-labels', 'Medium', 'greedy-intervals', ['Last occurrence']),
  p(621, 'Task Scheduler', 'task-scheduler', 'Medium', 'greedy-intervals', ['Counting frames']),
  p(56, 'Merge Intervals', 'merge-intervals', 'Medium', 'greedy-intervals', ['Sort by start']),
  p(57, 'Insert Interval', 'insert-interval', 'Medium', 'greedy-intervals', ['Before / overlap / after']),
  p(435, 'Non-overlapping Intervals', 'non-overlapping-intervals', 'Medium', 'greedy-intervals', ['Sort by end']),
  p(253, 'Meeting Rooms II', 'meeting-rooms-ii', 'Medium', 'greedy-intervals', ['Sweep line'], true),
  p(135, 'Candy', 'candy', 'Hard', 'greedy-intervals', ['Two passes']),

  // String Algorithms
  p(28, 'Find the Index of the First Occurrence in a String', 'find-the-index-of-the-first-occurrence-in-a-string', 'Easy', 'strings', ['KMP']),
  p(459, 'Repeated Substring Pattern', 'repeated-substring-pattern', 'Easy', 'strings', ['Prefix function']),
  p(5, 'Longest Palindromic Substring', 'longest-palindromic-substring', 'Medium', 'strings', ['Expand around center']),
  p(647, 'Palindromic Substrings', 'palindromic-substrings', 'Medium', 'strings', ['Expand around center']),
  p(214, 'Shortest Palindrome', 'shortest-palindrome', 'Hard', 'strings', ['Prefix function']),
  p(1044, 'Longest Duplicate Substring', 'longest-duplicate-substring', 'Hard', 'strings', ['Binary search + rolling hash']),

  // Math & Randomized
  p(9, 'Palindrome Number', 'palindrome-number', 'Easy', 'math', ['Digit manipulation']),
  p(7, 'Reverse Integer', 'reverse-integer', 'Medium', 'math', ['Overflow checks']),
  p(50, 'Pow(x, n)', 'powx-n', 'Medium', 'math', ['Fast exponentiation']),
  p(204, 'Count Primes', 'count-primes', 'Medium', 'math', ['Sieve of Eratosthenes']),
  p(43, 'Multiply Strings', 'multiply-strings', 'Medium', 'math', ['Big-number arithmetic']),
  p(528, 'Random Pick with Weight', 'random-pick-with-weight', 'Medium', 'math', ['Prefix sums + binary search']),
  p(380, 'Insert Delete GetRandom O(1)', 'insert-delete-getrandom-o1', 'Medium', 'math', ['List + hash map']),

  // Bit Manipulation
  p(136, 'Single Number', 'single-number', 'Easy', 'bits', ['XOR']),
  p(191, 'Number of 1 Bits', 'number-of-1-bits', 'Easy', 'bits', ['n & (n - 1)']),
  p(338, 'Counting Bits', 'counting-bits', 'Easy', 'bits', ['Bit DP']),
  p(190, 'Reverse Bits', 'reverse-bits', 'Easy', 'bits', ['Shifting']),
  p(268, 'Missing Number', 'missing-number', 'Easy', 'bits', ['XOR']),
  p(371, 'Sum of Two Integers', 'sum-of-two-integers', 'Medium', 'bits', ['Carry with AND / XOR']),
];

export const leetCodeUrl = (problem: LeetCodeProblem) => `https://leetcode.com/problems/${problem.slug}/`;

/** Key used for the problem's status, note and revisit flag in the learner's stores. */
export const problemRef = (problem: LeetCodeProblem) => `lc-${problem.id}`;
