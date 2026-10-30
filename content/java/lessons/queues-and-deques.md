## Concept explanation

### What it is

- **`Queue<E>`**: elements wait in line; you work at the **head**. Usually FIFO, but the ordering is the implementation's choice (priority queues order by priority).
- **`Deque<E>`** ("deck", double-ended queue): add and remove at **both ends** — usable as a FIFO queue *and* a LIFO stack.

### Two method families

Every operation comes in a throwing and a special-value form:

| | Throws on failure | Returns special value |
|---|---|---|
| insert at tail | `add(e)` → `IllegalStateException` if full | `offer(e)` → `false` |
| remove head | `remove()` → `NoSuchElementException` | `poll()` → `null` |
| examine head | `element()` → `NoSuchElementException` | `peek()` → `null` |

`Deque` adds `addFirst/offerFirst`, `addLast/offerLast`, `removeFirst/pollFirst`, `removeLast/pollLast`, `getFirst/peekFirst`, `getLast/peekLast`, and stack methods `push` (= `addFirst`), `pop` (= `removeFirst`).

Because `poll` and `peek` use `null` to mean "empty", **`ArrayDeque` and `PriorityQueue` reject `null` elements**.

### The implementations

| Class | Structure | Order | Operations | Notes |
|---|---|---|---|---|
| **`ArrayDeque`** | circular array | FIFO / LIFO | O(1) amortised at both ends | the default queue *and* stack; no nulls; not thread-safe |
| **`PriorityQueue`** | binary min-heap in an array | smallest first (natural or comparator) | `offer`/`poll` O(log n), `peek` O(1) | iteration order is **not** sorted; no nulls |
| **`LinkedList`** | doubly linked nodes | FIFO / LIFO | O(1) at ends | allows nulls, slower and heavier than `ArrayDeque` |

### When to use which

- FIFO work queue, BFS, sliding windows, undo/redo, a stack → **`ArrayDeque`**.
- "Always process the most urgent/cheapest next": schedulers, Dijkstra, top-K, merging sorted streams → **`PriorityQueue`**.
- Producer/consumer between threads → a **`BlockingQueue`** (next lesson).

## Internal working

### `ArrayDeque` — circular buffer

```java
transient Object[] elements;   // length is the capacity
transient int head;            // index of the first element
transient int tail;            // index where the next addLast goes
```

- `addLast(e)`: `elements[tail] = e; tail = inc(tail)`; `addFirst(e)`: `head = dec(head); elements[head] = e` — indices **wrap around** the array end, so neither end ever shifts elements.
- When `head == tail` after an insert the array is full: `grow()` allocates a bigger array (doubling while small, then +50 %) and re-arranges the wrapped segment.
- `pollFirst()`/`pollLast()` null the vacated slot (for GC) and move the index. All O(1).
- **Memory**: one reference per slot plus spare capacity; no node objects — much leaner than `LinkedList`.

### `PriorityQueue` — binary heap

The heap is a **complete binary tree stored in an array**: the children of index `i` are `2i + 1` and `2i + 2`, the parent is `(i - 1) / 2`. **Heap property**: every parent ≤ its children, so the **minimum is at index 0**.

- **`offer(e)`** (insertion): put `e` at the end, then **sift up** — swap with the parent while smaller. O(log n).
- **`poll()`** (removal): take `queue[0]`, move the last element to the root, then **sift down** — swap with the smaller child while larger. O(log n).
- **`peek()`**: `queue[0]`, O(1).
- **`remove(Object)` / `contains`**: linear search O(n) (then O(log n) to fix the heap).
- Building from a collection uses **heapify** in O(n).
- Iteration walks the array in **heap order, not sorted order**; to get sorted output, `poll` repeatedly.
- Growth: doubles while small (< 64), then +50 %.

Neither class is thread-safe; `PriorityBlockingQueue` and `ConcurrentLinkedDeque` are the concurrent counterparts.

## Visual representation

```text title="ArrayDeque wrap-around and a PriorityQueue heap"
  ArrayDeque (capacity 8):  addLast A, B, C, then addFirst Z
     index:  0   1   2   3   4   5   6   7
            [A] [B] [C] [ ] [ ] [ ] [ ] [Z]
                         ^tail           ^head      order: Z A B C   (head wrapped to 7)

  PriorityQueue after offer 5, 3, 8, 1, 4:
     array:  [1] [3] [8] [5] [4]                    tree:        1
     index:   0   1   2   3   4                              /     \
                                                            3       8
                                                           / \
                                                          5   4
  poll(): take 1, move 4 to the root, sift down: 4 vs children 3,8 -> swap with 3
     array:  [3] [4] [8] [5]
```

## Java code example

```java title="QueuesDemo.java" file="QueuesDemo.java"
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.PriorityQueue;
import java.util.Queue;

public class QueuesDemo {
    record Task(String name, int priority, long createdAt) { }

    public static void main(String[] args) {
        // ArrayDeque as a FIFO queue and as a stack
        Queue<String> queue = new ArrayDeque<>();
        queue.offer("first");
        queue.offer("second");
        System.out.println("queue poll: " + queue.poll() + ", then " + queue.poll() + ", then " + queue.poll());
        try {
            queue.remove();
        } catch (NoSuchElementException e) {
            System.out.println("remove() on empty: NoSuchElementException (poll() returned null)");
        }

        Deque<Integer> deque = new ArrayDeque<>();
        deque.offerLast(2);
        deque.offerFirst(1);
        deque.offerLast(3);
        deque.push(0);                                         // push = addFirst
        System.out.println("deque " + deque + ", pop " + deque.pop() + ", pollLast " + deque.pollLast() + " -> " + deque);

        // PriorityQueue: smallest first, iteration order is NOT sorted
        PriorityQueue<Integer> heap = new PriorityQueue<>(List.of(5, 3, 8, 1, 4));
        System.out.println("heap array order " + heap + ", peek " + heap.peek());
        List<Integer> drained = new ArrayList<>();
        while (!heap.isEmpty()) {
            drained.add(heap.poll());
        }
        System.out.println("polled in order: " + drained);

        // Max-heap and priority + FIFO tie-break
        PriorityQueue<Integer> maxHeap = new PriorityQueue<>(Comparator.reverseOrder());
        maxHeap.addAll(List.of(5, 3, 8, 1));
        System.out.println("max-heap poll: " + maxHeap.poll());

        PriorityQueue<Task> tasks = new PriorityQueue<>(
                Comparator.comparingInt(Task::priority).thenComparingLong(Task::createdAt));
        tasks.offer(new Task("send-email", 2, 1));
        tasks.offer(new Task("charge-card", 1, 2));
        tasks.offer(new Task("write-audit", 2, 3));
        tasks.offer(new Task("refund", 1, 4));
        StringBuilder order = new StringBuilder();
        while (!tasks.isEmpty()) {
            order.append(tasks.poll().name()).append(' ');
        }
        System.out.println("tasks by priority, then FIFO: " + order.toString().trim());

        // Top-3 largest with a size-bounded MIN-heap: O(n log k)
        int[] stream = {42, 7, 99, 15, 63, 88, 21};
        PriorityQueue<Integer> top = new PriorityQueue<>();
        for (int x : stream) {
            top.offer(x);
            if (top.size() > 3) {
                top.poll();                                    // drop the smallest of the current top-4
            }
        }
        List<Integer> best = new ArrayList<>(top);
        best.sort(Comparator.reverseOrder());
        System.out.println("top 3: " + best);

        // nulls are rejected because null means "empty" for poll/peek
        try {
            new ArrayDeque<String>().offer(null);
        } catch (NullPointerException e) {
            System.out.println("ArrayDeque rejects null");
        }
    }
}
```

## Output

```text title="Output" output="QueuesDemo.java"
queue poll: first, then second, then null
remove() on empty: NoSuchElementException (poll() returned null)
deque [0, 1, 2, 3], pop 0, pollLast 3 -> [1, 2]
heap array order [1, 3, 8, 5, 4], peek 1
polled in order: [1, 3, 4, 5, 8]
max-heap poll: 8
tasks by priority, then FIFO: charge-card refund send-email write-audit
top 3: [99, 88, 63]
ArrayDeque rejects null
```

- Printing a `PriorityQueue` shows its **array** (heap order), not sorted order; only repeated `poll` yields sorted output.
- The task comparator broke priority ties by creation time, giving FIFO behaviour within a priority (a `PriorityQueue` is **not** stable on its own).
- The top-K trick keeps only K elements in a min-heap, so the cost is O(n log k) instead of sorting everything.

## Real-world application

- **BFS and level-order traversal**, sliding-window maximums (monotonic deque), undo stacks, browser history — `ArrayDeque`.
- **Schedulers and timers**: `ScheduledThreadPoolExecutor` keeps tasks in a heap ordered by next run time; `java.util.Timer` too.
- **Dijkstra/A\***, merging K sorted files or Kafka partitions, top-K leaderboards, rate-limited job dispatch by priority — `PriorityQueue`.
- **Event processing** with deadlines: a priority queue ordered by deadline, polled when the head is due.

## Common mistakes

- **Iterating or printing a `PriorityQueue` and expecting sorted order.**
- **Mutating an element's priority while it's in the heap** — the heap property breaks; remove, change, re-insert.
- **Using `LinkedList` as a queue** instead of `ArrayDeque`; using `Stack` instead of `ArrayDeque`.
- **Mixing method families**: `remove()`/`element()` throw on empty, `poll()`/`peek()` return `null`.
- **Expecting FIFO among equal priorities** without a tie-breaker.
- **`contains`/`remove(Object)` on a big `PriorityQueue`** in a loop — O(n) each.
- **Top-K with a max-heap of all elements** (O(n log n) and O(n) memory) instead of a bounded min-heap.

## Interview questions

**Q1. How does `PriorityQueue` work internally, and what are its complexities?**

````reveal title="Answer"
It's a binary min-heap stored in an array: children of `i` at `2i+1`/`2i+2`, parent at `(i-1)/2`, each parent ≤ its children (by natural order or comparator), so the minimum is at index 0. `offer` appends and sifts up (O(log n)); `poll` removes the root, moves the last element to the root and sifts down (O(log n)); `peek` is O(1); `contains`/`remove(Object)` are O(n); building from a collection is O(n) heapify. Iteration order is heap order, not sorted.
````

**Q2. Why is `ArrayDeque` preferred over `Stack` and `LinkedList`?**

````reveal title="Answer"
It's a circular array: O(1) amortised operations at both ends, no per-element node objects, contiguous memory (cache-friendly), no synchronisation overhead (unlike `Stack`/`Vector`), and it rejects nulls (catching bugs). `LinkedList` allocates a node per element and chases pointers; `Stack` is synchronised and exposes `Vector`'s index methods.
````

**Q3. How do you find the K largest elements of a huge stream?**

````reveal title="Answer"
Keep a **min-heap of size K**: offer each element; when the size exceeds K, `poll` (removing the smallest). At the end the heap contains the K largest. Time O(n log k), memory O(k) — works for streams that don't fit in memory. (For K smallest, use a max-heap.)
````

**Q4. `offer` vs `add`, `poll` vs `remove`, `peek` vs `element`?**

````reveal title="Answer"
Same operations, different failure behaviour. `add`/`remove()`/`element()` throw (`IllegalStateException` when a capacity-bounded queue is full, `NoSuchElementException` when empty); `offer`/`poll`/`peek` return `false`/`null`. Prefer the special-value forms when emptiness/fullness is a normal condition, especially with bounded queues.
````

## Hands-on exercise

Implement `static int[] slidingWindowMax(int[] nums, int k)` in O(n) using an `ArrayDeque<Integer>` of **indices** whose values are kept in decreasing order (a *monotonic deque*). For `[1, 3, -1, -3, 5, 3, 6, 7]` and `k = 3` the answer is `[3, 3, 5, 5, 6, 7]`.

````hint title="Hint 1"
Before adding index `i`, pop from the back while the value at the back is ≤ `nums[i]` — those can never be a maximum again.
````

````hint title="Hint 2"
Pop from the front when its index has left the window (`front <= i - k`). From `i >= k - 1` on, the front holds the window maximum.
````

````solution title="Solution"
```java title="SlidingWindowMax.java" file="SlidingWindowMax.java"
import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.Deque;

public class SlidingWindowMax {
    static int[] slidingWindowMax(int[] nums, int k) {
        int[] result = new int[nums.length - k + 1];
        Deque<Integer> window = new ArrayDeque<>();          // indices, values decreasing front->back
        for (int i = 0; i < nums.length; i++) {
            while (!window.isEmpty() && window.peekFirst() <= i - k) {
                window.pollFirst();                          // left the window
            }
            while (!window.isEmpty() && nums[window.peekLast()] <= nums[i]) {
                window.pollLast();                           // dominated by nums[i]
            }
            window.offerLast(i);
            if (i >= k - 1) {
                result[i - k + 1] = nums[window.peekFirst()];
            }
        }
        return result;
    }

    public static void main(String[] args) {
        System.out.println(Arrays.toString(slidingWindowMax(new int[] {1, 3, -1, -3, 5, 3, 6, 7}, 3)));
        System.out.println(Arrays.toString(slidingWindowMax(new int[] {9, 8, 7, 6}, 2)));
    }
}
```

```text title="Output" output="SlidingWindowMax.java"
[3, 3, 5, 5, 6, 7]
[9, 8, 7]
```

Every index is added once and removed at most once: O(n) overall, O(k) extra space.
````

## Knowledge check

```quiz
? What does poll() return on an empty ArrayDeque?
+ null
- It throws NoSuchElementException
- 0
> remove() throws; poll() returns null.

? Where is the smallest element in a PriorityQueue's internal array?
+ Index 0
- The last index
- Unspecified
> The root of the min-heap.

? What is the complexity of PriorityQueue.poll()?
- O(1)
+ O(log n)
- O(n)
> Sift down after moving the last element to the root.

? You print a PriorityQueue holding 5, 3, 8, 1. The output is...
- always [1, 3, 5, 8]
+ heap order, e.g. [1, 3, 8, 5]
> toString iterates the array, which is not sorted.

? Which is the recommended stack implementation?
+ ArrayDeque with push/pop
- Stack
- LinkedList
> Deque<E> stack = new ArrayDeque<>();
```

## Key takeaways

- `Queue` works at the head; `Deque` at both ends (and is the modern stack).
- Throwing (`add`/`remove`/`element`) vs special-value (`offer`/`poll`/`peek`) methods; `ArrayDeque` and `PriorityQueue` reject `null`.
- **`ArrayDeque`** = circular array, O(1) at both ends — the default queue and stack.
- **`PriorityQueue`** = array-backed binary heap: `offer`/`poll` O(log n), `peek` O(1), iteration **not** sorted, not stable.
- Bounded min-heap for top-K; monotonic deque for sliding-window extremes.
