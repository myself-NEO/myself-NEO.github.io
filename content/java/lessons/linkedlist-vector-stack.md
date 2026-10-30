## Concept explanation

### `LinkedList`

`LinkedList<E>` is a **doubly linked list** that implements both `List` and `Deque`. Each element lives in its own `Node` object with `prev` and `next` pointers; the list keeps `first`, `last` and `size`.

| Operation | `LinkedList` | `ArrayList` |
|---|---|---|
| `get(i)` / `set(i)` | **O(n)** — walks from the nearer end | O(1) |
| add/remove at either **end** | **O(1)** | O(1) at the end, O(n) at the front |
| add/remove at a **known position via an iterator** | O(1) | O(n) |
| add/remove at **index i** | O(n) to find the node + O(1) to link | O(n) to shift |
| memory per element | ~24 bytes `Node` + reference | ~4 bytes reference |
| iteration speed | slow (pointer chasing, cache misses) | fast (contiguous) |

The textbook claim "LinkedList is faster for inserts in the middle" is misleading: you must first **find** the position (O(n) walking nodes), and walking nodes is slower than `ArrayList`'s `arraycopy`, which moves contiguous memory very fast. In practice `ArrayList` (or `ArrayDeque` for queue/stack use) wins almost every benchmark.

**When `LinkedList` is reasonable:** you already hold a `ListIterator` positioned where you insert/remove many times; or you need a `List` and a `Deque` in one object and the data is small. Even its author (Josh Bloch) has said he never uses it.

### `Vector`

`Vector` (Java 1.0) is an `ArrayList` whose methods are all **`synchronized`**, growing by **2×** by default. Synchronising each method individually doesn't make compound actions safe (`if (!v.contains(x)) v.add(x)` still races), and it adds locking cost even in single-threaded code. It's **legacy**: use `ArrayList`, or `Collections.synchronizedList(new ArrayList<>())`, or a concurrent collection.

### `Stack`

`Stack extends Vector` (Java 1.0) adds `push`, `pop`, `peek`, `empty`, `search`. Problems:

- It inherits all of `Vector`'s index-based methods, so callers can `add(0, x)` or `remove(i)` and break LIFO — inheritance used for reuse, a design mistake (see [composition vs inheritance](lesson:composition-and-relationships)).
- Every operation is synchronised.
- Iteration order is bottom-to-top, the opposite of `ArrayDeque`'s.

The JDK's own documentation recommends **`Deque<E> stack = new ArrayDeque<>();`** with `push`/`pop`/`peek`.

### When to use what

- List with indexes → `ArrayList`.
- Stack or queue → `ArrayDeque`.
- Thread-safe list → `CopyOnWriteArrayList` (read-mostly) or explicit synchronisation.
- Never `Vector`/`Stack` in new code (you'll meet them in old code and in APIs like `Swing`'s models).

## Internal working

### `LinkedList` architecture

```java
private static class Node<E> { E item; Node<E> next; Node<E> prev; }
transient Node<E> first, last;
transient int size;
```

- **Insertion at the end** (`add`, `addLast`, `offer`): create a node, link it after `last`, update `last`. At the front: link before `first`. O(1).
- **Insertion at index i**: `node(i)` walks from `first` if `i < size/2`, otherwise from `last`, then relinks four pointers. O(n) to walk.
- **Retrieval** `get(i)`: same walk — O(n). A loop `for (i = 0; i < list.size(); i++) list.get(i)` is therefore **O(n²)**; always iterate a `LinkedList` with an iterator or for-each.
- **Removal**: unlink by pointing neighbours at each other and nulling the node's fields (to help the GC).
- **Memory**: each `Node` is an object (12-byte header + 3 references ≈ 24 bytes with compressed oops) per element, scattered across the heap, which defeats CPU caches and prefetching.
- **Thread safety**: none.

### `Vector` and `Stack`

- `Vector` = `Object[] elementData` + `elementCount`, methods marked `synchronized` (the lock is the `Vector` itself), `capacityIncrement` 0 → doubling.
- `Stack.push(e)` = `addElement(e)`; `pop()` = `peek()` + `removeElementAt(size - 1)`; `peek()` on an empty stack throws `EmptyStackException`.
- The JIT can elide uncontended locks (lock elision via escape analysis, and biased locking until it was removed in JDK 15), so the cost is often small — but the design problems remain.

## Visual representation

```text title="LinkedList nodes vs ArrayList array"
 LinkedList (first, last, size=3)
   first                                                     last
     |                                                         |
     v                                                         v
  +------+------+------+      +------+------+------+      +------+------+------+
  | prev | "a"  | next |<---->| prev | "b"  | next |<---->| prev | "c"  | next |
  | null |      |      |      |      |      |      |      |      |      | null |
  +------+------+------+      +------+------+------+      +------+------+------+
  three separate objects, anywhere on the heap: get(1) must follow pointers

 ArrayList: [ "a" | "b" | "c" |   |   ]   one contiguous array: get(1) is one load

 Stack extends Vector:  push/pop/peek  +  add(0,x) remove(i) set(i,x) ...  <- LIFO can be broken
```

## Java code example

```java title="ListsCompared.java" file="ListsCompared.java"
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.EmptyStackException;
import java.util.LinkedList;
import java.util.List;
import java.util.ListIterator;
import java.util.Stack;
import java.util.Vector;

public class ListsCompared {
    public static void main(String[] args) {
        // LinkedList as List and Deque
        LinkedList<String> ll = new LinkedList<>(List.of("b", "c"));
        ll.addFirst("a");                      // O(1) at either end
        ll.addLast("d");
        ll.removeFirst();
        System.out.println("LinkedList: " + ll + ", peekFirst " + ll.peekFirst() + ", peekLast " + ll.peekLast());

        // Where LinkedList shines: edits at an iterator position (no shifting)
        ListIterator<String> it = ll.listIterator();
        while (it.hasNext()) {
            if (it.next().equals("c")) {
                it.add("c2");                  // O(1) relinking at the cursor
            }
        }
        System.out.println("after iterator insert: " + ll);

        // get(i) cost: count node hops for a full index loop (simulated)
        int n = 1_000;
        long hops = 0;
        for (int i = 0; i < n; i++) {
            hops += Math.min(i, n - 1 - i);    // LinkedList walks from the nearer end
        }
        System.out.println("index loop over " + n + " LinkedList elements: ~" + hops + " node hops (ArrayList: 0)");

        // Measured: indexed access is far slower on LinkedList (ratio printed, not raw times)
        List<Integer> array = new ArrayList<>();
        List<Integer> linked = new LinkedList<>();
        for (int i = 0; i < 20_000; i++) {
            array.add(i);
            linked.add(i);
        }
        long arraySum = 0;
        long linkedSum = 0;
        long t0 = System.nanoTime();
        for (int i = 0; i < array.size(); i++) {
            arraySum += array.get(i);
        }
        long t1 = System.nanoTime();
        for (int i = 0; i < linked.size(); i++) {
            linkedSum += linked.get(i);
        }
        long t2 = System.nanoTime();
        System.out.println("same sums: " + (arraySum == linkedSum) + ", LinkedList index loop at least 10x slower: " + ((t2 - t1) > 10 * (t1 - t0)));

        // Stack inherits Vector's methods: LIFO can be violated
        Stack<String> legacy = new Stack<>();
        legacy.push("first");
        legacy.push("second");
        legacy.add(0, "sneaky");               // allowed: inherited from Vector
        System.out.println("Stack contents (bottom to top): " + legacy + ", pop -> " + legacy.pop());
        legacy.clear();
        try {
            legacy.pop();
        } catch (EmptyStackException e) {
            System.out.println("pop on empty Stack: EmptyStackException");
        }

        // The modern stack: ArrayDeque
        Deque<String> stack = new ArrayDeque<>();
        stack.push("first");
        stack.push("second");
        System.out.println("ArrayDeque stack (top first): " + stack + ", pop -> " + stack.pop() + ", pop on empty -> " + new ArrayDeque<String>().poll());

        // Vector: every method synchronized, still not safe for check-then-act
        Vector<String> v = new Vector<>(List.of("x"));
        if (!v.contains("y")) {                // another thread could add "y" between these calls
            v.add("y");
        }
        System.out.println("Vector: " + v + " (capacity doubles: " + new Vector<>(4).capacity() + " -> grows to 8)");
    }
}
```

## Output

```text title="Output" output="ListsCompared.java"
LinkedList: [b, c, d], peekFirst b, peekLast d
after iterator insert: [b, c, c2, d]
index loop over 1000 LinkedList elements: ~249500 node hops (ArrayList: 0)
same sums: true, LinkedList index loop at least 10x slower: true
Stack contents (bottom to top): [sneaky, first, second], pop -> second
pop on empty Stack: EmptyStackException
ArrayDeque stack (top first): [second, first], pop -> second, pop on empty -> null
Vector: [x, y] (capacity doubles: 4 -> grows to 8)
```

- Insertion through the iterator relinked nodes without shifting anything.
- An index loop over a 1,000-element `LinkedList` walks about 250,000 nodes in total — quadratic. With 20,000 elements the measured loop is orders of magnitude slower than `ArrayList` (exact times vary; the program prints only the comparison).
- `Stack.add(0, "sneaky")` put an element under the stack's bottom — inheritance exposing methods that break the abstraction.
- `ArrayDeque.poll()` returns `null` on empty, while `Stack.pop()` throws.

## Real-world application

- **Code reviews** routinely replace `LinkedList` with `ArrayList`/`ArrayDeque` and `Stack` with `ArrayDeque` — measurable CPU and memory wins.
- **Legacy APIs**: `Vector` and `Hashtable` still appear in old code and some JDK APIs (Swing's `DefaultTableModel`, `java.util.Properties extends Hashtable`).
- **Algorithms**: depth-first search, expression evaluation, undo stacks, bracket matching — all use `Deque` as a stack in idiomatic modern Java.
- **LRU caches** need a doubly linked list plus a hash map — `LinkedHashMap` provides exactly that; hand-rolled versions use their own node class rather than `java.util.LinkedList`, because you need O(1) access to arbitrary nodes (see the [LRU cache exercise](problem:lru-cache)).

## Common mistakes

- **`for (int i = 0; i < linkedList.size(); i++) linkedList.get(i)`** — O(n²).
- **Choosing `LinkedList` "for fast inserts"** without measuring.
- **Using `Stack`/`Vector` in new code.**
- **Believing `Vector` makes compound operations thread-safe.**
- **Calling `pop()` on an empty `ArrayDeque`** (throws `NoSuchElementException`) when `poll()` (returns `null`) was intended.
- **Using `LinkedList` as a queue** where `ArrayDeque` is faster and leaner (and rejects `null`, which catches bugs).

## Interview questions

**Q1. When would you use `LinkedList` over `ArrayList`?**

````reveal title="Answer"
Rarely. `LinkedList` gives O(1) insert/remove at the ends and at an iterator's position, but O(n) indexed access, ~6× the memory per element and poor cache locality. `ArrayList` is faster for almost every real workload, including middle inserts of modest size (because `arraycopy` is very fast). Use `ArrayDeque` for queues and stacks. A defensible `LinkedList` case: frequent insertions/removals through a `ListIterator` that's already positioned, on a list too large to shift cheaply.
````

**Q2. Why is `Stack` considered a bad class? What should you use instead?**

````reveal title="Answer"
It extends `Vector`, so it inherits index-based methods that let callers break LIFO, and every method is synchronised. It's an inheritance-for-reuse mistake from Java 1.0. Use `Deque<E> stack = new ArrayDeque<>()` with `push`, `pop` and `peek` (or `offerFirst`/`pollFirst`/`peekFirst` for null-returning variants).
````

**Q3. What's the difference between `ArrayList` and `Vector`?**

````reveal title="Answer"
Both are resizable arrays. `Vector`'s methods are `synchronized` and it grows by 2× by default (or a fixed `capacityIncrement`); `ArrayList` is unsynchronised and grows by 1.5×. `Vector` is legacy; per-method locking doesn't make check-then-act sequences atomic anyway. Use `ArrayList` plus external synchronisation, or concurrent collections.
````

**Q4. What is the time complexity of `linkedList.get(n/2)`?**

````reveal title="Answer"
O(n): `LinkedList.node(i)` walks from `first` if the index is in the first half and from `last` otherwise, so the middle is the worst case at about n/2 hops.
````

## Hands-on exercise

Use a `Deque` as a stack to write `static boolean balanced(String s)` that checks whether brackets `()[]{}` are balanced, ignoring other characters, and `static int evalRpn(String expr)` that evaluates a Reverse Polish Notation expression like `"3 4 + 2 *"` (→ 14). Don't use `Stack`.

````hint title="Hint"
For brackets: push opening brackets; on a closing bracket, `pop` must be its partner; at the end the deque must be empty. For RPN: push numbers; on an operator, pop **right** first, then left, compute, push the result.
````

````solution title="Solution"
```java title="DequeStack.java" file="DequeStack.java"
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;

public class DequeStack {
    private static final Map<Character, Character> PAIRS = Map.of(')', '(', ']', '[', '}', '{');

    public static void main(String[] args) {
        System.out.println(balanced("{[a(b)c]}") + " " + balanced("([)]") + " " + balanced("((") + " " + balanced("x"));
        System.out.println(evalRpn("3 4 + 2 *") + " " + evalRpn("5 1 2 + 4 * + 3 -"));
    }

    static boolean balanced(String s) {
        Deque<Character> stack = new ArrayDeque<>();
        for (char c : s.toCharArray()) {
            if (c == '(' || c == '[' || c == '{') {
                stack.push(c);
            } else if (PAIRS.containsKey(c)) {
                if (stack.isEmpty() || !stack.pop().equals(PAIRS.get(c))) {   // equals, not == on Character
                    return false;
                }
            }
        }
        return stack.isEmpty();
    }

    static int evalRpn(String expr) {
        Deque<Integer> stack = new ArrayDeque<>();
        for (String token : expr.trim().split("\\s+")) {
            switch (token) {
                case "+", "-", "*", "/" -> {
                    int right = stack.pop();
                    int left = stack.pop();
                    stack.push(switch (token) {
                        case "+" -> left + right;
                        case "-" -> left - right;
                        case "*" -> left * right;
                        default -> left / right;
                    });
                }
                default -> stack.push(Integer.parseInt(token));
            }
        }
        return stack.pop();
    }
}
```

```text title="Output" output="DequeStack.java"
true false false true
14 14
```

`5 1 2 + 4 * + 3 -` is `5 + (1 + 2) * 4 - 3 = 14`. Popping the right operand first matters for `-` and `/`.
````

## Knowledge check

```quiz
? What is the cost of linkedList.get(i)?
- O(1)
+ O(n)
- O(log n)
> It walks nodes from the nearer end.

? Which class does the JDK recommend for a LIFO stack?
- java.util.Stack
+ java.util.ArrayDeque
- java.util.Vector
> Deque<E> stack = new ArrayDeque<>();

? Why can Stack's LIFO behaviour be broken by callers?
+ It extends Vector and inherits index-based add/remove/set
- It isn't synchronized
- It allows nulls
> Inheritance exposed the whole Vector API.

? Roughly how much memory does a LinkedList node cost compared with an ArrayList slot?
+ About 24 bytes vs about 4 bytes per element (with compressed references)
- The same
- Less, because there's no unused capacity
> Each node is a separate object with a header and three references.
```

## Key takeaways

- `LinkedList` is a **doubly linked list** (and a `Deque`): O(1) at the ends and at an iterator, **O(n) indexed access**, heavy nodes, poor cache locality.
- `ArrayList` beats it in nearly all real workloads; **`ArrayDeque`** is the queue/stack of choice.
- `Vector` = synchronised `ArrayList` (legacy); `Stack extends Vector` (legacy, breakable LIFO).
- Never index-loop a `LinkedList`; iterate it.
- Per-method synchronisation doesn't make compound actions thread-safe.
