// Topics of the DSA "Coding questions" list. Kept apart from the problem list itself so the
// router can validate #dsa/problems/<topic> without loading every problem.

export interface PracticeTopic {
  id: string;
  title: string;
  /** DSA guide (lesson slug) that teaches this topic */
  guide: string;
}

export const PRACTICE_TOPICS: PracticeTopic[] = [
  { id: 'arrays-hashing', title: 'Arrays & Hashing', guide: 'arrays-strings' },
  { id: 'two-pointers', title: 'Two Pointers', guide: 'arrays-strings' },
  { id: 'sliding-window', title: 'Sliding Window', guide: 'arrays-strings' },
  { id: 'linked-list', title: 'Linked List', guide: 'linked-list' },
  { id: 'stack', title: 'Stacks & Monotonic Stacks', guide: 'stacks-queues' },
  { id: 'heap', title: 'Heaps & Priority Queues', guide: 'stacks-queues' },
  { id: 'binary-search', title: 'Binary Search & Sorting', guide: 'sorting-binary-search' },
  { id: 'backtracking', title: 'Backtracking', guide: 'recursion-backtracking' },
  { id: 'trees', title: 'Trees & BSTs', guide: 'trees' },
  { id: 'tries', title: 'Tries', guide: 'tries' },
  { id: 'graphs', title: 'Graphs', guide: 'graphs' },
  { id: 'dp', title: 'Dynamic Programming', guide: 'dynamic-programming' },
  { id: 'greedy-intervals', title: 'Greedy & Intervals', guide: 'greedy-intervals' },
  { id: 'strings', title: 'String Algorithms', guide: 'string-algorithms' },
  { id: 'math', title: 'Math & Randomized', guide: 'math-number-theory' },
  { id: 'bits', title: 'Bit Manipulation', guide: 'bit-manipulation' },
];

export const practiceTopic = (id: string) => PRACTICE_TOPICS.find((t) => t.id === id);
