import { Stage, Track } from '../shared/types';

// DSA curriculum. The guides themselves are the markdown files in this folder
// (loaded lazily by content/shared/loaders.ts); this file only describes them.

const FOUNDATIONS: Stage = {
  id: 'foundations',
  number: 1,
  title: 'Foundations',
  levelLabel: 'Beginner',
  description: 'Start with the complete guide, then master the linear data structures every interview builds on.',
  modules: [
    {
      id: 'start-here',
      title: 'Start here',
      lessons: [
        {
          slug: 'cheatsheet',
          title: 'Cheatsheet',
          summary:
            'The complete DSA guide in one pass: complexity, arrays, linked lists, stacks, recursion, binary search, trees, heaps, graphs, DP and more — each with a Java template and its gotchas.',
          minutes: 60,
          level: 'beginner',
          essential: true,
          objectives: [
            'Build a mental map of every topic that appears in coding interviews',
            'Learn a reusable Java template for each core pattern',
            'Know the gotchas that cost points in each topic',
          ],
          prerequisites: [],
          related: ['core-cheatsheet', 'arrays-strings', 'graphs-cheatsheet'],
          problems: [],
          tags: ['overview', 'templates', 'big-o', 'java'],
        },
      ],
    },
    {
      id: 'linear',
      title: 'Linear data structures',
      lessons: [
        {
          slug: 'arrays-strings',
          title: 'Arrays & Strings',
          summary:
            'Two pointers, sliding window, prefix sums, range queries, Kadane, monotonic stacks, binary search, hashing, string and matrix techniques.',
          minutes: 55,
          level: 'beginner',
          essential: true,
          objectives: [
            'Recognise when to use two pointers, a sliding window or prefix sums',
            'Apply Kadane, monotonic stacks and binary search on arrays',
            'Use hashing and string-specific techniques idiomatically in Java',
            'Follow a problem-solving framework from brute force to optimal',
          ],
          prerequisites: [],
          related: ['stacks-queues', 'bit-manipulation', 'dynamic-programming'],
          problems: [],
          tags: ['two pointers', 'sliding window', 'prefix sum', 'kadane', 'binary search', 'hashing', 'strings', 'matrix'],
        },
        {
          slug: 'linked-list',
          title: 'Linked List',
          summary:
            'Pointer manipulation, the dummy-node trick, fast and slow pointers, reversal and merging. Full notes are on the way.',
          minutes: 0,
          level: 'beginner',
          essential: true,
          comingSoon: true,
          objectives: [
            'Manipulate pointers safely with the dummy-node trick',
            'Use fast and slow pointers for cycles and middles',
            'Reverse and merge lists in place',
          ],
          prerequisites: [],
          related: ['cheatsheet', 'core-cheatsheet'],
          problems: [],
          tags: ['linked list', 'pointers', 'floyd', 'reversal'],
        },
        {
          slug: 'stacks-queues',
          title: 'Stacks, Queues & Heaps',
          summary:
            "Build each structure yourself, then the high-value patterns: monotonic stacks, BFS, monotonic deques, Kahn's algorithm, top-K, k-way merge and two heaps.",
          minutes: 80,
          level: 'intermediate',
          essential: true,
          objectives: [
            'Implement a stack, a circular-buffer queue and a binary heap from scratch',
            'Apply the monotonic stack and monotonic deque patterns',
            "Use BFS, multi-source BFS, 0-1 BFS and Kahn's algorithm",
            'Solve top-K, k-way merge and two-heap problems with PriorityQueue',
          ],
          prerequisites: ['arrays-strings'],
          related: ['arrays-strings', 'graphs', 'trees'],
          problems: [],
          tags: ['stack', 'queue', 'heap', 'priority queue', 'monotonic stack', 'bfs', 'deque', 'top-k'],
        },
      ],
    },
  ],
};

const RECURSION_AND_TREES: Stage = {
  id: 'recursion-trees',
  number: 2,
  title: 'Recursion & Trees',
  levelLabel: 'Intermediate',
  description: 'Think recursively, backtrack systematically, and handle every family of tree problems.',
  modules: [
    {
      id: 'recursion',
      title: 'Recursion',
      lessons: [
        {
          slug: 'recursion-backtracking',
          title: 'Recursion & Backtracking',
          summary:
            'A solid mental model of recursion, then backtracking on top: subsets, combinations and permutations from one decision table, with Word Search worked end to end.',
          minutes: 30,
          level: 'intermediate',
          essential: true,
          objectives: [
            'Trace recursion with a clear mental model of the call stack',
            'Derive subsets, combinations and permutations from one decision table',
            'Apply choose, explore, un-choose to grid and string problems',
          ],
          prerequisites: ['arrays-strings'],
          related: ['trees', 'dynamic-programming', 'graphs'],
          problems: [],
          tags: ['recursion', 'backtracking', 'subsets', 'permutations', 'combinations'],
        },
      ],
    },
    {
      id: 'trees',
      title: 'Trees',
      lessons: [
        {
          slug: 'trees',
          title: 'Trees',
          summary:
            'Binary trees to segment trees: traversals, the recursive mental model, BSTs, LCA, construction, level-order patterns, balanced trees, heaps, tries and Fenwick trees.',
          minutes: 50,
          level: 'intermediate',
          essential: true,
          objectives: [
            'Choose the right traversal and recursive template for a tree problem',
            'Work through BST, LCA and tree-construction problems',
            'Understand balanced trees, heaps and tries conceptually and in code',
            'Use segment trees and Fenwick trees for range queries',
          ],
          prerequisites: ['recursion-backtracking'],
          related: ['recursion-backtracking', 'graphs', 'stacks-queues'],
          problems: [],
          tags: ['binary tree', 'bst', 'traversal', 'lca', 'trie', 'segment tree', 'fenwick', 'avl'],
        },
      ],
    },
  ],
};

const ADVANCED: Stage = {
  id: 'advanced',
  number: 3,
  title: 'Graphs, DP & Bits',
  levelLabel: 'Advanced',
  description: 'The topics that separate medium from hard problems: graph algorithms, dynamic programming and bit tricks.',
  modules: [
    {
      id: 'graphs',
      title: 'Graphs',
      lessons: [
        {
          slug: 'graphs',
          title: 'Graphs',
          summary:
            'Representations, BFS and DFS, grids, components, cycle detection, topological sort, union-find, shortest paths, MSTs, bipartite checks, SCCs and bridges — plus a framework for any graph question.',
          minutes: 45,
          level: 'advanced',
          essential: true,
          objectives: [
            'Represent graphs and grids in Java and traverse them with BFS and DFS',
            'Apply topological sort, union-find and shortest-path algorithms',
            'Recognise graph problems hidden behind other wording',
            'Follow a step-by-step framework for any graph question',
          ],
          prerequisites: ['trees', 'stacks-queues'],
          related: ['trees', 'dynamic-programming', 'graphs-cheatsheet'],
          problems: [],
          tags: ['graph', 'bfs', 'dfs', 'topological sort', 'union find', 'dijkstra', 'mst', 'grid'],
        },
      ],
    },
    {
      id: 'dynamic-programming',
      title: 'Dynamic programming',
      lessons: [
        {
          slug: 'dynamic-programming',
          title: 'Dynamic Programming',
          summary:
            'Three parts: 1-D DP; 2-D DP (grids, two strings, knapsack); then interval, bitmask, digit, tree and graph DP — all built on one 5-step framework.',
          minutes: 115,
          level: 'advanced',
          essential: true,
          objectives: [
            'Recognise DP problems and apply the universal 5-step framework',
            'Move between top-down, bottom-up and space-optimised solutions',
            'Solve grid, two-string and knapsack-style 2-D DP',
            'Tackle interval, bitmask, digit, tree and graph DP',
          ],
          prerequisites: ['recursion-backtracking'],
          related: ['recursion-backtracking', 'graphs', 'graphs-cheatsheet'],
          problems: [],
          tags: ['dynamic programming', 'memoization', 'tabulation', 'knapsack', 'lcs', 'interval dp', 'bitmask dp'],
        },
      ],
    },
    {
      id: 'bits',
      title: 'Bits',
      lessons: [
        {
          slug: 'bit-manipulation',
          title: 'Bit Manipulation',
          summary:
            'How numbers live in memory, every operator, the core bit tricks, Java-specific gotchas and the patterns that keep showing up in interviews.',
          minutes: 25,
          level: 'intermediate',
          essential: true,
          objectives: [
            "Explain two's complement and how Java stores integers",
            'Use the core tricks: set, clear, toggle and check bits, and isolate the lowest set bit',
            'Avoid Java pitfalls such as sign extension and >> vs >>>',
            'Recognise bit-manipulation patterns in interview problems',
          ],
          prerequisites: [],
          related: ['arrays-strings', 'dynamic-programming', 'graphs-cheatsheet'],
          problems: [],
          tags: ['bits', 'xor', 'bitmask', 'twos complement'],
        },
      ],
    },
  ],
};

const DEEP_DIVES: Stage = {
  id: 'deep-dives',
  number: 4,
  title: 'Deep Dives & Revision',
  levelLabel: 'Intermediate → Advanced',
  description:
    'Companion deep-dives to the Cheatsheet: internals, harder variants and self-checked practice problems. Revisit them after the main guides.',
  modules: [
    {
      id: 'companions',
      title: 'Deep-dive companions',
      lessons: [
        {
          slug: 'core-cheatsheet',
          title: 'Core Cheatsheet',
          summary:
            'Parts 1–11 in depth: Big-O formally, Java internals, arrays, hashing, linked lists, stacks, recursion, sorting, binary search, trees and heaps — with practice problems and hidden solutions.',
          minutes: 75,
          level: 'intermediate',
          essential: false,
          objectives: [
            'Go deeper on complexity, including amortised analysis and the Master theorem',
            'Understand Java collection internals such as HashMap and the equals/hashCode contract',
            'Practise harder variants of the core patterns with self-checked solutions',
          ],
          prerequisites: ['cheatsheet'],
          related: ['cheatsheet', 'graphs-cheatsheet', 'arrays-strings'],
          problems: [],
          tags: ['deep dive', 'practice', 'java internals', 'complexity', 'hashing', 'sorting'],
        },
        {
          slug: 'graphs-cheatsheet',
          title: 'Graphs Cheatsheet',
          summary:
            'Parts 12–21 in depth: advanced graphs, tries, DP, greedy, bits, string algorithms and advanced structures, then interview triage drills.',
          minutes: 60,
          level: 'advanced',
          essential: false,
          objectives: [
            'Handle advanced graph variants: iterative DFS, multi-source BFS, Bellman-Ford and Prim',
            'Use tries, greedy exchange arguments and string algorithms such as KMP and Rabin-Karp',
            'Practise pattern recognition with interview triage drills',
          ],
          prerequisites: ['cheatsheet', 'core-cheatsheet'],
          related: ['graphs', 'dynamic-programming', 'core-cheatsheet'],
          problems: [],
          tags: ['deep dive', 'practice', 'tries', 'greedy', 'kmp', 'segment tree', 'interview drills'],
        },
      ],
    },
  ],
};

export const DSA_TRACK: Track = {
  id: 'dsa',
  title: 'Data Structures & Algorithms',
  shortTitle: 'DSA',
  status: 'active',
  tagline: 'Interview-ready DSA in Java',
  description:
    'Patterns, templates and worked problems for every major data structure and algorithm, written for Java engineers preparing for coding interviews.',
  stages: [FOUNDATIONS, RECURSION_AND_TREES, ADVANCED, DEEP_DIVES],
  problems: [],
  basePath: '#dsa',
  home: { label: 'DSA', href: '#dsa' },
  language: 'Java',
  hasKnowledgeChecks: false,
};
