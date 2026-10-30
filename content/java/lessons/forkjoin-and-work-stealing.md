## Concept explanation

### Divide and conquer, in parallel

Many problems split naturally: sum an array by summing each half; sort by sorting halves and merging; search a tree by searching subtrees. The **fork/join framework** (Java 7) runs such recursive decompositions in parallel:

```java
protected Long compute() {
    if (size <= THRESHOLD) {
        return computeDirectly();          // small enough: plain sequential loop
    }
    SumTask left = new SumTask(lo, mid);
    SumTask right = new SumTask(mid, hi);
    left.fork();                           // push the left half: someone may steal it
    long rightResult = right.compute();    // work on the right half in THIS thread
    return left.join() + rightResult;      // wait for (or help with) the left half
}
```

| Class | Returns | Method to implement |
|---|---|---|
| `RecursiveTask<V>` | a value | `V compute()` |
| `RecursiveAction` | nothing (in-place work) | `void compute()` |
| `CountedCompleter<T>` | advanced: completion counting, no blocking joins | used by parallel streams |

Submit to a `ForkJoinPool`:
- `pool.invoke(task)` waits for the result;
- `pool.submit(task)` returns a future;
- `ForkJoinPool.commonPool()` is the shared default.

### Work stealing

Each worker thread owns a **double-ended queue (deque)** of tasks:
- a worker **pushes and pops its own tasks at the head** (LIFO), which is good for cache locality, because it keeps working on the most recently split, smallest pieces;
- an **idle worker steals from the tail** of another worker's deque (FIFO), taking the *oldest*, largest pieces, which it then splits further itself.

Load balances automatically without a central queue, and stealing (the expensive, contended operation) is rare because thieves take big chunks.

### Rules for good fork/join code

- **A sensible threshold**: leaf tasks should do roughly 10,000–100,000 basic operations. Too small, and task overhead dominates; too large, and there's not enough parallelism to balance.
- **The `fork()` one, `compute()` the other, then `join()` pattern.** Don't `fork` both halves and then `join` both: the current thread would sit idle.
- **No blocking I/O or locks inside tasks.** The pool has about as many threads as cores; a blocked worker is lost capacity, and blocking the common pool hurts every parallel stream and `CompletableFuture` in the JVM. For unavoidable blocking, use `ForkJoinPool.managedBlock` so the pool can add a compensating thread.
- **Tasks should be pure and independent**, combining results only via return values.

### The common pool

`ForkJoinPool.commonPool()`:
- has parallelism of **CPUs − 1** by default (the caller helps);
- is shared by **parallel streams**, **`CompletableFuture.*Async` without an executor**, and anything else that doesn't specify a pool;
- can be configured with `-Djava.util.concurrent.ForkJoinPool.common.parallelism=N`.

For isolation, create a dedicated `ForkJoinPool`.

## Internal working

- **`fork()`** pushes the task onto the current worker's deque (the `WorkQueue` array) with a cheap, owner-only operation. Thieves `poll` the other end using CAS.
- **`join()`** doesn't just block. If the task is still in the current worker's deque, it pops and runs it directly. Otherwise it **helps**: it runs other tasks (including stealing back from the thief: "helpJoin"), and only blocks as a last resort, possibly letting the pool activate a spare thread. That's why `join` inside fork/join tasks doesn't cause thread-starvation deadlocks the way `Future.get()` inside a thread pool does.
- **Workers park when there's no work** and are signalled when tasks are pushed. `getStealCount()` reports how many tasks were stolen, and `getQueuedTaskCount()` reports the backlog.
- **Exceptions** thrown in `compute()` are captured in the task and rethrown on `join()`/`invoke()`, cross-thread and with the original stack trace.
- **Parallel streams** split the source with its `Spliterator` and run the pieces as `CountedCompleter`s on the common pool (or on the pool that calls the terminal operation). The pool's threads are `ForkJoinWorkerThread`s, named `ForkJoinPool.commonPool-worker-N`.
- **Async mode** (`new ForkJoinPool(n, factory, handler, true)`) makes workers process their own tasks FIFO, which suits event-style tasks that are never joined.

## Visual representation

```text title="Splitting, deques and stealing"
  sum[0..8M)                                      worker 1 deque (head = most recent)
     /        \                                   head [0..1M) [1..2M) [2..4M) tail  <- worker 2 steals [2..4M)
  [0..4M)   [4..8M)  <- forked by worker 1          ^ worker 1 pops its own newest, smallest piece (LIFO)
   /   \                                          worker 2 deque
 [0..2M) [2..4M)                                  head [2..3M) [3..4M) tail  <- it split the stolen chunk itself
 ...                                              
 leaves <= threshold: sequential loops            join(): if the task is still ours, run it; else help/steal;
                                                          block only as a last resort
```

## Java code example

```java title="ForkJoinDemo.java" file="ForkJoinDemo.java" run="-Djava.util.concurrent.ForkJoinPool.common.parallelism=3"
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ForkJoinPool;
import java.util.concurrent.RecursiveAction;
import java.util.concurrent.RecursiveTask;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.LongStream;

public class ForkJoinDemo {
    static final int THRESHOLD = 10_000;

    static final class SumTask extends RecursiveTask<Long> {
        static final AtomicInteger LEAVES = new AtomicInteger();
        private final long[] data;
        private final int lo;
        private final int hi;

        SumTask(long[] data, int lo, int hi) {
            this.data = data;
            this.lo = lo;
            this.hi = hi;
        }

        @Override
        protected Long compute() {
            if (hi - lo <= THRESHOLD) {
                LEAVES.incrementAndGet();
                long sum = 0;
                for (int i = lo; i < hi; i++) {
                    sum += data[i];
                }
                return sum;
            }
            int mid = (lo + hi) >>> 1;
            SumTask left = new SumTask(data, lo, mid);
            SumTask right = new SumTask(data, mid, hi);
            left.fork();                                   // may be stolen by an idle worker
            long rightSum = right.compute();               // keep this thread busy
            return left.join() + rightSum;
        }
    }

    static final class SquareAll extends RecursiveAction {
        private final long[] data;
        private final int lo;
        private final int hi;

        SquareAll(long[] data, int lo, int hi) {
            this.data = data;
            this.lo = lo;
            this.hi = hi;
        }

        @Override
        protected void compute() {
            if (hi - lo <= THRESHOLD) {
                for (int i = lo; i < hi; i++) {
                    data[i] = data[i] * data[i];
                }
                return;
            }
            int mid = (lo + hi) >>> 1;
            invokeAll(new SquareAll(data, lo, mid), new SquareAll(data, mid, hi));   // fork + compute + join
        }
    }

    static final class FailingTask extends RecursiveTask<Integer> {
        @Override
        protected Integer compute() {
            throw new IllegalArgumentException("bad partition");
        }
    }

    public static void main(String[] args) {
        long[] data = LongStream.rangeClosed(1, 10_000_000).toArray();

        // 1. RecursiveTask on a dedicated pool
        ForkJoinPool pool = new ForkJoinPool(4);
        long parallel = pool.invoke(new SumTask(data, 0, data.length));
        long sequential = LongStream.of(data).sum();
        System.out.println("fork/join sum " + parallel + " equals sequential: " + (parallel == sequential)
                + "; leaf tasks: " + SumTask.LEAVES.get() + " (10,000,000 split down to <= " + THRESHOLD + ")");
        System.out.println("pool parallelism " + pool.getParallelism() + ", work was stolen between workers: " + (pool.getStealCount() > 0));

        // 2. RecursiveAction: in-place parallel update
        long[] small = LongStream.rangeClosed(1, 100_000).toArray();
        pool.invoke(new SquareAll(small, 0, small.length));
        System.out.println("RecursiveAction squared in place: small[9] = " + small[9] + ", small[99999] = " + small[99_999]);

        // 3. Exceptions travel to join()/invoke()
        try {
            pool.invoke(new FailingTask());
        } catch (IllegalArgumentException e) {
            System.out.println("exception from a fork/join task rethrown by invoke(): " + e.getMessage());
        }
        pool.shutdown();

        // 4. The common pool runs parallel streams (parallelism set to 3 by a JVM flag)
        Set<String> threads = ConcurrentHashMap.newKeySet();
        long evens = LongStream.rangeClosed(1, 2_000_000).parallel()
                .filter(n -> {
                    threads.add(Thread.currentThread().getName());
                    return n % 2 == 0;
                })
                .count();
        boolean commonPoolWorkers = threads.stream().filter(t -> !t.equals("main"))
                .allMatch(t -> t.startsWith("ForkJoinPool.commonPool-worker"));
        System.out.println("common pool parallelism " + ForkJoinPool.getCommonPoolParallelism() + "; parallel stream counted " + evens
                + " evens on main + common-pool workers only: " + commonPoolWorkers);
    }
}
```

## Output

```text title="Output" output="ForkJoinDemo.java"
fork/join sum 50000005000000 equals sequential: true; leaf tasks: 1024 (10,000,000 split down to <= 10000)
pool parallelism 4, work was stolen between workers: true
RecursiveAction squared in place: small[9] = 100, small[99999] = 10000000000
exception from a fork/join task rethrown by invoke(): java.lang.IllegalArgumentException: bad partition
common pool parallelism 3; parallel stream counted 1000000 evens on main + common-pool workers only: true
```

- The array was split recursively into **1,024 leaf tasks** of ≤ 10,000 elements (10,000,000 ÷ 2¹⁰ ≈ 9,766). The fork/join sum matched the sequential one, and workers stole tasks from each other to balance the load.
- `invokeAll(left, right)` is shorthand for the fork-one, compute-other, join pattern; the `RecursiveAction` squared the array in place.
- An exception thrown inside a task reached the caller of `invoke()`. Fork/join rethrows a fresh exception of the same type, with the original as its cause (hence the message repeating the original `toString()`), so the stack trace shows both the caller and the worker.
- The parallel stream ran on `main` plus `ForkJoinPool.commonPool-worker` threads, the same shared pool configured to parallelism 3 by the JVM flag.

## Real-world application

- **Parallel streams** and `Arrays.parallelSort`/`parallelPrefix` are fork/join underneath.
- **CPU-heavy recursive algorithms**: image tiling and filters, matrix multiplication, parallel merge sort and quicksort, tree and graph traversals over in-memory data, Monte Carlo simulations.
- **Frameworks**: Akka/Pekko and some reactive libraries use `ForkJoinPool` as an executor for short, non-blocking tasks; Java 21's virtual-thread scheduler is a `ForkJoinPool` in async (FIFO) mode.
- **Isolation**: a dedicated `ForkJoinPool` for heavy parallel computations keeps them from starving request-handling code that also uses the common pool through `CompletableFuture` or parallel streams.

## Common mistakes

- **Blocking (I/O, `sleep`, locks) inside fork/join tasks or parallel streams**, which stalls the small, shared pool.
- **A tiny threshold**, creating millions of tasks where overhead exceeds the work.
- **`left.fork(); right.fork(); left.join(); right.join();`**, which wastes the current thread. Fork one and compute the other, or use `invokeAll`.
- **Joining in the wrong order** (`right.join()` before `left.join()` after forking left), which reduces the chance of popping your own task locally.
- **Sharing mutable state between subtasks** instead of combining return values.
- **Using fork/join for small inputs**, where sequential code is faster.

## Interview questions

**Q1. What is the fork/join framework, and when is it useful?**

````reveal title="Answer"
A framework (Java 7) for parallel divide-and-conquer. A `RecursiveTask`/`RecursiveAction` splits its problem until pieces are below a threshold, forks subtasks, computes some directly, and joins the results. It runs on a `ForkJoinPool` whose workers use work stealing. It suits CPU-bound, recursively decomposable work on in-memory data (sums, sorts, transforms, searches) with independent subtasks and no blocking.
````

**Q2. Explain work stealing.**

````reveal title="Answer"
Each worker thread has its own deque of tasks. It pushes forked subtasks and pops its own work from one end (LIFO: newest and smallest, cache-friendly). An idle worker steals from the *other* end of a busy worker's deque (FIFO: oldest and largest), then subdivides that chunk itself. Load balances without a central queue, contention happens only on rare steals, and big chunks travel to idle threads.
````

**Q3. Why shouldn't fork/join tasks block?**

````reveal title="Answer"
The pool is sized to the CPU count (the common pool to CPUs − 1). A task that blocks on I/O or a lock occupies a worker without using a CPU, reducing parallelism. If many block, the pool stalls, and with the common pool, so do parallel streams and `CompletableFuture`s across the JVM. Use separate executors (or virtual threads) for blocking work, or `ForkJoinPool.managedBlock`, which lets the pool add a compensating thread.
````

**Q4. How does `join()` in a `ForkJoinTask` differ from `Future.get()` in a thread pool?**

````reveal title="Answer"
`ForkJoinTask.join()` tries to make progress instead of just blocking. If the joined task is still in the current worker's deque, it runs it directly; otherwise it helps by executing other pending tasks, including ones stolen from the thief, and only parks as a last resort. `Future.get()` in a `ThreadPoolExecutor` simply blocks the worker, which can cause thread-starvation deadlocks when tasks wait for other tasks of the same pool.
````

**Q5. What uses the common `ForkJoinPool`?**

````reveal title="Answer"
Parallel streams, `CompletableFuture.*Async` methods called without an executor, `Arrays.parallelSort` and other parallel array operations, and any `ForkJoinTask.fork()` called outside a pool. Its parallelism defaults to the number of CPUs − 1 (configurable with `-Djava.util.concurrent.ForkJoinPool.common.parallelism`). Because it's shared, blocking or long-running work submitted to it degrades all of these.
````

## Hands-on exercise

Count the primes up to 2,000,000 with a `RecursiveTask<Integer>`:
- split the range `[lo, hi]` in half until it's at most 50,000 numbers;
- count primes in leaves with trial division up to `√n`;
- run it on a `ForkJoinPool` with parallelism 4, verify the result against a sequential count, and report the number of leaf tasks.

````hint title="Hint"
`isPrime(n)`: `n >= 2` and no divisor `d` with `d * d <= n` divides it (check 2, then odd numbers). In `compute()`: `if (hi - lo + 1 <= 50_000) count directly; else { int mid = (lo + hi) >>> 1; PrimeCount left = new PrimeCount(lo, mid); left.fork(); int right = new PrimeCount(mid + 1, hi).compute(); return left.join() + right; }`. There are 148,933 primes below 2,000,000.
````

````solution title="Solution"
```java title="ParallelPrimes.java" file="ParallelPrimes.java"
import java.util.concurrent.ForkJoinPool;
import java.util.concurrent.RecursiveTask;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.IntStream;

public class ParallelPrimes {
    static final int THRESHOLD = 50_000;
    static final AtomicInteger LEAVES = new AtomicInteger();

    static boolean isPrime(int n) {
        if (n < 2) {
            return false;
        }
        if (n % 2 == 0) {
            return n == 2;
        }
        for (int d = 3; (long) d * d <= n; d += 2) {
            if (n % d == 0) {
                return false;
            }
        }
        return true;
    }

    static final class PrimeCount extends RecursiveTask<Integer> {
        private final int lo;
        private final int hi;

        PrimeCount(int lo, int hi) {
            this.lo = lo;
            this.hi = hi;
        }

        @Override
        protected Integer compute() {
            if (hi - lo + 1 <= THRESHOLD) {
                LEAVES.incrementAndGet();
                int count = 0;
                for (int n = lo; n <= hi; n++) {
                    if (isPrime(n)) {
                        count++;
                    }
                }
                return count;
            }
            int mid = (lo + hi) >>> 1;
            PrimeCount left = new PrimeCount(lo, mid);
            left.fork();
            int right = new PrimeCount(mid + 1, hi).compute();
            return left.join() + right;
        }
    }

    public static void main(String[] args) {
        ForkJoinPool pool = new ForkJoinPool(4);
        int parallel = pool.invoke(new PrimeCount(1, 2_000_000));
        pool.shutdown();
        long sequential = IntStream.rangeClosed(1, 2_000_000).filter(ParallelPrimes::isPrime).count();
        System.out.println("primes <= 2,000,000: " + parallel + " (sequential agrees: " + (parallel == sequential) + ")");
        System.out.println("leaf tasks: " + LEAVES.get());
    }
}
```

```text title="Output" output="ParallelPrimes.java"
primes <= 2,000,000: 148933 (sequential agrees: true)
leaf tasks: 64
```

The work isn't uniform: testing large numbers costs more than testing small ones. That's exactly where work stealing pays off, because workers that finish cheap leaves early steal the remaining expensive chunks instead of sitting idle.
````

## Knowledge check

```quiz
? In a RecursiveTask, what's the recommended pattern after splitting into left and right?
+ left.fork(); compute right directly; then left.join()
- left.fork(); right.fork(); left.join(); right.join()
- Run both sequentially
> Keep the current thread busy instead of idling while both run elsewhere.

? Where does an idle worker steal tasks from?
+ The opposite end of another worker's deque, taking the oldest, largest tasks
- A single shared central queue
- The head of its own deque
> Owners work LIFO at the head; thieves take FIFO from the tail.

? Why is blocking I/O inside a common-pool task harmful?
+ It ties up one of a few shared threads used by parallel streams and CompletableFutures across the JVM
- It throws an exception
- Fork/join tasks can't call I/O methods
> Use a separate executor or ManagedBlocker.

? What does join() do if the joined task hasn't been stolen?
+ The current thread runs it directly
- It blocks until another thread runs it
- It throws IllegalStateException
> join() helps rather than just waiting.

? Which class should you extend for a fork/join computation that returns a value?
+ RecursiveTask<V>
- RecursiveAction
- ForkJoinWorkerThread
> RecursiveAction is for tasks without a result.
```

## Key takeaways

- **Fork/join** = parallel divide-and-conquer: split until a **threshold**, `fork()` one half, `compute()` the other, `join()`; or use `invokeAll`.
- **Work stealing**: per-worker deques, LIFO for the owner, FIFO for thieves. Load balances itself with little contention. `join()` **helps** instead of just blocking.
- Use **`RecursiveTask`** (with a result) or **`RecursiveAction`** (in place), with pure, independent subtasks and no blocking.
- The **common pool** (CPUs − 1) runs parallel streams and default async `CompletableFuture`s. Isolate heavy or blocking work in its own pool or executor.
- Choose thresholds that make leaves meaningful (thousands of operations), and use fork/join only for big, CPU-bound inputs.
