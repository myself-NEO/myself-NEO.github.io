## Three families of concurrency problems

"Make it thread-safe" is too vague to design with. Almost every concurrency issue you'll meet in an LLD problem belongs to one of **three families**, and each family has its own symptoms and its own tools. Name the family first, and the right tool usually follows.

| Family | The question it asks | What goes wrong | Typical LLD example | Main tools |
|---|---|---|---|---|
| **Correctness** | Can concurrent operations corrupt shared state? | Lost updates, double booking, overselling, broken invariants | Two users both see seat A7 free and both book it | `synchronized`, locks, atomics/CAS, atomic map operations, immutability, versioning, idempotency |
| **Coordination** | Do threads need to hand off work or wait for each other? | CPU burned by busy-waiting, missed wake-ups, unbounded queues, lost work at shutdown | Producers add tasks to a queue; consumers must wait efficiently when it's empty, producers must slow down when it's full | `BlockingQueue`, `wait`/`notifyAll`, `Condition`, `CountDownLatch`, `CompletableFuture`, executors |
| **Scarcity** | Are there fewer resources than requesters? | Exhaustion, unbounded waiting, starvation, one slow dependency taking everything down | 10 database connections, 100 concurrent requests — some must wait, time out, or be turned away | `Semaphore`, object pools, bounded thread pools with rejection policies, timeouts, bulkheads, rate limits |

Where each is taught in this track:

- **Correctness:** [Thread Safety](lesson:thread-safety) → [Locks, Atomics & Concurrent Collections](lesson:locks-and-atomics) → [Race Conditions in State Transitions](lesson:concurrent-state-transitions) → [Idempotency](lesson:idempotency)
- **Coordination:** [Producer–Consumer, Waiting & Backpressure](lesson:coordination)
- **Scarcity:** [Limited Resources, Semaphores & Pools](lesson:scarcity)

## Correctness in one paragraph

Correctness problems come from **shared mutable state** accessed without enough atomicity or visibility. The classic shape is **check-then-act**: two threads both check "is the seat available?", both see *yes*, and both book it. The fix is always to identify the **invariant** ("a seat has at most one booking"), find the smallest piece of code that reads and changes the state it covers (the **critical section**), and make that piece atomic — with a lock, a compare-and-set, an atomic map operation, or by not sharing mutable state at all.

## Coordination in one paragraph

Coordination problems come from threads that **depend on each other's progress**. A consumer can't process a task that hasn't been produced; a producer shouldn't keep adding tasks to a queue nobody is draining. Done badly, threads **spin** (`while (queue.isEmpty()) {}` burns a CPU core), **sleep-poll** (slow and still racy), miss a wake-up and wait forever, or fill an **unbounded** queue until memory runs out. Done well, waiting threads **block** — using no CPU — until another thread **signals** them, queues are **bounded** so slow consumers push back on producers (**backpressure**), and shutdown drains or stops workers deliberately.

## Scarcity in one paragraph

Scarcity problems come from **finite resources**: connections, threads, parking spots, API quota, licences, stock. When demand exceeds supply, you must decide **who gets the resource** and **what everyone else does**: wait, wait up to a timeout, or be rejected immediately. You must also make sure resources always come back (release in `finally`), that nobody starves, and that one misbehaving consumer can't take everything (bulkheads).

## The three families overlap — that's normal

Real components usually involve all three. Pick out the **dominant** question, but check the others:

- **A connection pool** is scarcity (only N connections), coordination (callers wait for a free one), *and* correctness (the pool's own bookkeeping must be thread-safe).
- **A parking lot** is scarcity (spots run out), correctness (no spot assigned twice), and possibly coordination (a gate that *waits* for a spot instead of turning cars away).
- **An async logger** is coordination (a log queue drained by a background thread) plus scarcity (the queue is bounded: block, or drop debug logs?).

## One example, three lenses

A print shop with **2 printers**, a **bounded job queue** and **3 worker threads** shows all three families in about 60 lines:

```java title="PrintShop: correctness, coordination and scarcity together" file="PrintShopDemo.java"
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.LongAdder;

public class PrintShopDemo {
    public static void main(String[] args) throws InterruptedException {
        PrintShop shop = new PrintShop(2, 4);          // 2 printers, room for 4 waiting jobs
        shop.start(3);                                  // 3 workers compete for 2 printers
        for (int i = 1; i <= 10; i++) shop.submit(new PrintJob("job-" + i, i));   // blocks while the queue is full
        shop.shutdownAndWait();
        System.out.println("pages printed: " + shop.pagesPrinted());                       // 1 + 2 + ... + 10 = 55
        System.out.println("never more than 2 printers busy: " + (shop.maxPrintersBusy() <= 2));
    }
}

record PrintJob(String name, int pages) {
    static final PrintJob POISON = new PrintJob("<stop>", 0);
}

final class PrintShop {
    private final BlockingQueue<PrintJob> queue;                 // COORDINATION: hand-off + backpressure
    private final Semaphore printers;                            // SCARCITY: only N printers
    private final LongAdder pages = new LongAdder();             // CORRECTNESS: safe concurrent counting
    private final AtomicInteger busy = new AtomicInteger();
    private final AtomicInteger maxBusy = new AtomicInteger();
    private Thread[] workers = new Thread[0];

    PrintShop(int printerCount, int queueCapacity) {
        this.queue = new ArrayBlockingQueue<>(queueCapacity);
        this.printers = new Semaphore(printerCount, true);
    }

    void start(int workerCount) {
        workers = new Thread[workerCount];
        for (int i = 0; i < workerCount; i++) {
            workers[i] = new Thread(this::work, "worker-" + i);
            workers[i].start();
        }
    }

    /** Producers block (instead of failing or growing memory) when the queue is full. */
    void submit(PrintJob job) throws InterruptedException { queue.put(job); }

    private void work() {
        try {
            while (true) {
                PrintJob job = queue.take();                     // waits without burning CPU
                if (job == PrintJob.POISON) return;              // clean shutdown signal
                printers.acquire();                              // wait for a free printer
                try {
                    maxBusy.accumulateAndGet(busy.incrementAndGet(), Math::max);
                    Thread.sleep(2);                             // "printing"
                    pages.add(job.pages());
                } finally {
                    busy.decrementAndGet();
                    printers.release();                          // always give the printer back
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();                  // never swallow interruption
        }
    }

    void shutdownAndWait() throws InterruptedException {
        for (int i = 0; i < workers.length; i++) queue.put(PrintJob.POISON);   // one pill per worker
        for (Thread w : workers) w.join();
    }

    long pagesPrinted() { return pages.sum(); }
    int maxPrintersBusy() { return maxBusy.get(); }
}
```

Each line has a job in exactly one family:

- **Coordination:** `queue.put` blocks producers when 4 jobs are waiting (backpressure); `queue.take` parks idle workers without spinning; poison pills shut workers down after the queue drains.
- **Scarcity:** 3 workers but only 2 permits, so the third worker *waits* for a printer. The `finally` guarantees the permit returns even if printing fails.
- **Correctness:** pages are counted with a `LongAdder` and peak usage with atomics — no lost updates, even though three threads update them.

## Recognising them in a prompt

| Phrases in the prompt or follow-up | Family |
|---|---|
| "at the same time", "two users", "never oversell", "no double booking", "exactly once", "consistent" | Correctness |
| "queue", "background", "async", "worker", "pipeline", "wait until", "notify when done", "retry later", "batch" | Coordination |
| "limited", "at most N", "pool", "quota", "capacity", "only 10…", "throttle", "too many requests" | Scarcity |

## In the interview

> [!INTERVIEW] The three-question check
> When concurrency comes up, walk through all three out loud:
> 1. **Correctness:** *"What state is shared, what invariant protects it, and what's the critical section?"*
> 2. **Coordination:** *"Does anyone wait for anyone else? Is there a queue — is it bounded, and how do we shut down?"*
> 3. **Scarcity:** *"What's limited, and when it runs out, do we wait, time out, or reject?"*
>
> Even if only one family matters for the problem, showing that you checked all three is a strong senior-level signal.

## Common mistakes

- **Answering every concurrency question with `synchronized`.** Locks solve correctness, not waiting or capacity.
- **Spinning or `Thread.sleep` polling** instead of blocking coordination.
- **Unbounded queues and pools**, which turn a scarcity problem into an out-of-memory crash.
- **Waiting forever** for a scarce resource on a user-facing path.
- **Missing the overlap**: a pool whose bookkeeping isn't itself thread-safe.

## Key takeaways

- Concurrency problems come in three families: **correctness** (corrupted state), **coordination** (waiting and hand-off), **scarcity** (limited resources).
- Each family has distinct tools: **locks and atomics**; **blocking queues, conditions and latches**; **semaphores, pools and bounded executors**.
- Real components mix the families; identify the dominant one and check the others.
- In interviews, run the **three-question check** whenever concurrency appears.

## Knowledge check

```quiz
? Workers poll `while (queue.isEmpty()) { }` until a task appears. Which family of problem is this, and what's the fix?
- Correctness: wrap the loop in synchronized
+ Coordination: block on a BlockingQueue's take() so idle workers use no CPU
- Scarcity: add more worker threads
> Waiting efficiently for another thread's work is a coordination problem.

? A service has 20 database connections and receives 300 concurrent requests. Which family is the main concern?
- Correctness
- Coordination
+ Scarcity
> Demand exceeds a finite resource; decide who waits, for how long, and who is rejected.

? Two threads both read a stock count of 1 and both sell the item. Which family, and which tool?
+ Correctness: make check-and-decrement atomic, for example with compareAndSet or a lock
- Coordination: use a CountDownLatch
- Scarcity: use a fair semaphore
> It's a check-then-act race on shared state.
```

## Exercise

For **"Design a food delivery dispatch system"** (orders arrive constantly; a dispatcher assigns each order to a free delivery partner; partners are limited; customers get status notifications), list at least two concerns in **each** of the three families, and name the tool you'd use for each.

````hint title="Hint"
What shared state could two dispatchers corrupt? Where does work get handed between threads? What is in short supply at peak hour?
````

````solution title="Sample answer"
**Correctness**
- Two dispatcher threads assign the same partner to two orders → atomic claim of the partner (`compareAndSet` on partner status, or a lock per partner).
- An order is cancelled while it's being assigned → state machine transitions under the order's lock (see [Race Conditions](lesson:concurrent-state-transitions)).

**Coordination**
- Incoming orders are handed to dispatcher workers → a bounded `BlockingQueue<Order>` with worker threads (or an executor).
- Notifications are sent asynchronously so dispatch isn't slowed down → a separate notification queue and worker, with retries.
- Clean shutdown during a deploy → stop accepting orders, drain the queue, poison-pill the workers.

**Scarcity**
- More orders than free partners at peak → orders wait in the queue with a **timeout** (then "no partner available"), not forever.
- The notification provider allows 50 concurrent calls → a `Semaphore(50)` bulkhead around the provider, so a slow SMS vendor can't exhaust the dispatcher's threads.
````
