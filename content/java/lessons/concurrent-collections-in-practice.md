## Concept explanation

The Collections stage explained *how* `ConcurrentHashMap` and the blocking queues work inside. This lesson is about *using* the concurrent collections well: the patterns, the atomic methods, and which collection fits which read/write mix.

### The menu

| Need | Use | Notes |
|---|---|---|
| hand work between threads, with back-pressure | **`ArrayBlockingQueue`** / **`LinkedBlockingQueue`** (bounded!) | `put` blocks when full, `take` blocks when empty |
| hand work over with no buffering | `SynchronousQueue` | each `put` waits for a `take` |
| prioritised or delayed work | `PriorityBlockingQueue`, `DelayQueue` | unbounded, so watch memory |
| non-blocking FIFO between threads | **`ConcurrentLinkedQueue`** / `ConcurrentLinkedDeque` | lock-free; `size()` is O(n) and approximate |
| concurrent map | **`ConcurrentHashMap`** | atomic `compute`, `merge`, `computeIfAbsent`, `putIfAbsent` |
| concurrent **sorted** map or set | **`ConcurrentSkipListMap`** / `ConcurrentSkipListSet` | O(log n), lock-free, range queries |
| read-mostly list or set, rare writes | **`CopyOnWriteArrayList`** / `CopyOnWriteArraySet` | every write copies the array; iteration never throws |

Avoid `Hashtable`, `Vector` and `Collections.synchronizedXxx` in new code: one lock for everything, and compound actions still need external locking.

### Pattern 1: producer–consumer with a bounded queue

Producers `put` and consumers `take`. The **bounded** queue gives **back-pressure**: fast producers block instead of exhausting memory. To shut down cleanly, send one **poison pill** (a sentinel object) per consumer after the last real item. Each consumer stops when it takes one, after the queue has drained in order.

### Pattern 2: atomic updates on ConcurrentHashMap

Never `get` → modify → `put`. Use the atomic methods:

```java
counts.merge(word, 1L, Long::sum);                                     // counting
index.computeIfAbsent(key, k -> ConcurrentHashMap.newKeySet()).add(v);  // multimap
cache.computeIfAbsent(key, this::load);                                 // load once per key
balances.compute(account, (k, v) -> v == null ? amount : v + amount);   // arbitrary update
```

The function runs **atomically for that key**, so keep it **short and side-effect-free**. It must not update other keys of the same map: recursive updates can deadlock or throw `IllegalStateException`.

### Pattern 3: iteration while others modify

Concurrent collections have **weakly consistent** iterators:
- they never throw `ConcurrentModificationException`;
- they reflect the state at some point at or after the iterator's creation;
- they may or may not show concurrent changes.

`CopyOnWriteArrayList` iterators are **snapshots**: they show exactly the contents at creation. Aggregate methods like `size()` or `isEmpty()` are **estimates** while updates are in flight. Don't base control flow on them.

## Internal working

- **`ArrayBlockingQueue`**: one array, **one `ReentrantLock`**, two `Condition`s (`notEmpty`, `notFull`). Simple, with predictable memory; producers and consumers contend on the same lock.
- **`LinkedBlockingQueue`**: linked nodes with **separate put and take locks**, so a producer and a consumer can proceed in parallel. It's unbounded by default (`Integer.MAX_VALUE`), so always pass a capacity.
- **`ConcurrentLinkedQueue`**: the Michael–Scott lock-free queue, with CAS on the head and tail nodes. `size()` walks the list.
- **`ConcurrentHashMap`** (Java 8+):
  - CAS for inserting into empty bins, and a `synchronized` lock on the bin's first node for the rest, so updates to different bins proceed in parallel;
  - reads are lock-free (volatile reads);
  - resizing is cooperative (threads help transfer bins);
  - `compute`/`merge` lock just one bin while the function runs;
  - counting uses `LongAdder`-style cells, so `size()` is a sum over them.
- **`ConcurrentSkipListMap`**: a probabilistic multi-level linked structure, lock-free with CAS, giving O(log n) search and insert plus sorted iteration and range views.
- **`CopyOnWriteArrayList`**: a `volatile Object[]`. Writes take a lock, copy the array, modify the copy and publish it; reads and iterations work on whatever array they saw. It's ideal for listener lists (read on every event, written on (un)subscribe) and terrible for frequent writes.

## Visual representation

```text title="A pipeline with back-pressure and poison pills"
  producer-1 --put--+                                      +--take--> consumer-1 -> results (ConcurrentHashMap.merge)
                    +--> [ bounded ArrayBlockingQueue(10) ] +--take--> consumer-2 ->
  producer-2 --put--+     full? put() blocks (back-pressure) +--take--> consumer-3 ->

  shutdown: after producers finish -> put(POISON) x 3 -> each consumer takes one POISON and exits

  ConcurrentHashMap.merge("fox", 1, Long::sum)        bin for "fox": [lock bin] read 3 -> write 4 [unlock]
     other keys in other bins update in parallel; readers never block
```

## Java code example

```java title="ConcurrentCollectionsDemo.java" file="ConcurrentCollectionsDemo.java"
import java.util.ArrayList;
import java.util.ConcurrentModificationException;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentSkipListMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;

public class ConcurrentCollectionsDemo {
    static final Integer POISON = Integer.MIN_VALUE;          // sentinel: "no more work"

    static void runAll(List<Thread> threads) throws InterruptedException {
        threads.forEach(Thread::start);
        for (Thread t : threads) {
            t.join();
        }
    }

    public static void main(String[] args) throws Exception {
        // 1. Producer-consumer with a bounded queue and poison pills
        BlockingQueue<Integer> queue = new ArrayBlockingQueue<>(10);
        AtomicLong consumedSum = new AtomicLong();
        AtomicLong consumedCount = new AtomicLong();
        List<Thread> producers = new ArrayList<>();
        for (int p = 0; p < 2; p++) {
            int base = p * 1_000;
            producers.add(new Thread(() -> {
                try {
                    for (int i = 1; i <= 500; i++) {
                        queue.put(base + i);                     // blocks while the queue is full
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }));
        }
        List<Thread> consumers = new ArrayList<>();
        for (int c = 0; c < 3; c++) {
            consumers.add(new Thread(() -> {
                try {
                    while (true) {
                        Integer item = queue.take();
                        if (item.equals(POISON)) {
                            return;                              // clean, ordered shutdown
                        }
                        consumedSum.addAndGet(item);
                        consumedCount.incrementAndGet();
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }));
        }
        consumers.forEach(Thread::start);
        runAll(producers);
        for (int c = 0; c < consumers.size(); c++) {
            queue.put(POISON);                                   // one pill per consumer
        }
        for (Thread t : consumers) {
            t.join();
        }
        long expected = 0;
        for (int p = 0; p < 2; p++) {
            for (int i = 1; i <= 500; i++) {
                expected += p * 1_000 + i;
            }
        }
        System.out.println("pipeline: consumed " + consumedCount.get() + " items, sum correct: " + (consumedSum.get() == expected)
                + ", queue empty: " + queue.isEmpty());

        // 2. ConcurrentHashMap: merge for counting, computeIfAbsent for a multimap
        String[] lines = {"the fox jumps", "the dog sleeps", "a fox runs", "the end"};
        Map<String, Long> counts = new ConcurrentHashMap<>();
        Map<Character, Set<String>> byInitial = new ConcurrentHashMap<>();
        List<Thread> counters = new ArrayList<>();
        for (int t = 0; t < 4; t++) {
            counters.add(new Thread(() -> {
                for (int round = 0; round < 1_000; round++) {
                    for (String line : lines) {
                        for (String word : line.split(" ")) {
                            counts.merge(word, 1L, Long::sum);  // atomic per key
                            byInitial.computeIfAbsent(word.charAt(0), k -> ConcurrentHashMap.newKeySet()).add(word);
                        }
                    }
                }
            }));
        }
        runAll(counters);
        System.out.println("word counts: " + new TreeMap<>(counts));
        Map<Character, Set<String>> sortedIndex = new TreeMap<>();
        byInitial.forEach((k, v) -> sortedIndex.put(k, new java.util.TreeSet<>(v)));
        System.out.println("multimap by initial: " + sortedIndex);

        // 3. Iterating while modifying: concurrent vs plain collections
        List<String> plain = new ArrayList<>(List.of("a", "b", "c"));
        try {
            for (String s : plain) {
                if (s.equals("a")) {
                    plain.add("d");
                }
            }
        } catch (ConcurrentModificationException e) {
            System.out.println("ArrayList: ConcurrentModificationException");
        }
        List<String> cow = new CopyOnWriteArrayList<>(List.of("a", "b", "c"));
        int iterated = 0;
        for (String s : cow) {                                   // iterates a snapshot
            iterated++;
            cow.add(s + "!");                                    // writes copy the array
        }
        System.out.println("CopyOnWriteArrayList: iterated " + iterated + " (snapshot), list now " + cow);
        Map<Integer, Integer> chm = new ConcurrentHashMap<>(Map.of(1, 1, 2, 2, 3, 3));
        for (Integer k : chm.keySet()) {
            chm.put(k, k * 10);                                  // weakly consistent: no exception
        }
        System.out.println("ConcurrentHashMap: updated during iteration without exception: " + new TreeMap<>(chm));

        // 4. ConcurrentSkipListMap: a sorted, concurrent leaderboard
        ConcurrentSkipListMap<Integer, String> leaderboard = new ConcurrentSkipListMap<>(java.util.Comparator.reverseOrder());
        List<Thread> players = new ArrayList<>();
        String[] names = {"ada", "linus", "grace", "ken"};
        for (int i = 0; i < names.length; i++) {
            int id = i;
            players.add(new Thread(() -> leaderboard.put(900 + id * 37 % 100, names[id])));
        }
        runAll(players);
        System.out.println("leaderboard (highest first): " + leaderboard + ", top: " + leaderboard.firstEntry()
                + ", scores >= 950: " + leaderboard.headMap(950, true).values());
    }
}
```

## Output

```text title="Output" output="ConcurrentCollectionsDemo.java"
pipeline: consumed 1000 items, sum correct: true, queue empty: true
word counts: {a=4000, dog=4000, end=4000, fox=8000, jumps=4000, runs=4000, sleeps=4000, the=12000}
multimap by initial: {a=[a], d=[dog], e=[end], f=[fox], j=[jumps], r=[runs], s=[sleeps], t=[the]}
ArrayList: ConcurrentModificationException
CopyOnWriteArrayList: iterated 3 (snapshot), list now [a, b, c, a!, b!, c!]
ConcurrentHashMap: updated during iteration without exception: {1=10, 2=20, 3=30}
leaderboard (highest first): {974=grace, 937=linus, 911=ken, 900=ada}, top: 974=grace, scores >= 950: [grace]
```

- 1,000 items flowed from 2 producers to 3 consumers through a 10-slot queue. The producers were throttled by `put` whenever it filled, and three poison pills shut the consumers down after everything was consumed.
- Four threads counted 44,000 words (1,000 rounds of 11 words each) with `merge` and built a multimap with `computeIfAbsent` + `newKeySet()`. Every count is exactly 4,000 × occurrences, with no locks in user code.
- The `ArrayList` threw `ConcurrentModificationException`. The `CopyOnWriteArrayList` iterated its 3-element snapshot while 3 new elements were added. The `ConcurrentHashMap` simply allowed the updates.
- The skip-list map stayed sorted under concurrent inserts and answered range queries (`headMap`) directly.

## Real-world application

- **Work queues inside a service**: an `ArrayBlockingQueue` between an HTTP thread that accepts uploads and a worker pool that processes them. When the queue is full, return 429 or `503 Retry-After` instead of buffering forever.
- **In-memory aggregation**: per-tenant request counts with `ConcurrentHashMap.merge`, or `ConcurrentHashMap<String, LongAdder>` with `computeIfAbsent(k, x -> new LongAdder()).increment()` for hot keys.
- **Listener and subscriber lists**: `CopyOnWriteArrayList`, as used by Spring's event multicaster and many UI toolkits, because events are dispatched far more often than listeners change.
- **Order books, rankings and time-indexed data**: `ConcurrentSkipListMap` for sorted keys with concurrent updates (price levels, scheduled jobs by time).
- **Lock-free hand-off queues**: `ConcurrentLinkedQueue` for metrics or log events where producers must never block.

## Common mistakes

- **Unbounded `LinkedBlockingQueue`** (the default constructor) or `Executors.newFixedThreadPool` (whose queue is unbounded): a slow consumer becomes an `OutOfMemoryError`.
- **`get` + `put` on `ConcurrentHashMap`** instead of `merge`/`compute`, which loses updates.
- **Long or blocking functions inside `compute`/`computeIfAbsent`**: they lock the bin and stall other keys. Recursive updates of the same map can deadlock or throw.
- **`CopyOnWriteArrayList` for write-heavy lists**: every add copies the whole array.
- **Relying on `size()` or `isEmpty()` of concurrent collections for decisions** while other threads modify them.
- **Forgetting the poison pill** (consumers block forever), or sending one pill for several consumers.
- **`null` keys or values**: `ConcurrentHashMap` and the concurrent queues reject `null`, because `null` means "absent".

## Interview questions

**Q1. How do you implement a producer–consumer pipeline in Java?**

````reveal title="Answer"
With a bounded `BlockingQueue` (`ArrayBlockingQueue` or `LinkedBlockingQueue` with a capacity). Producers call `put` (blocking when full gives back-pressure) and consumers call `take` (blocking when empty). For shutdown, after producers finish, put one poison-pill object per consumer; consumers exit when they take it, so all real items are processed first. Alternatively, interrupt the consumers via an executor's `shutdownNow`. With executors, the queue is often the executor's own work queue.
````

**Q2. Why prefer `ConcurrentHashMap` over `Collections.synchronizedMap` or `Hashtable`?**

````reveal title="Answer"
The synchronised wrappers use one lock for every operation, so all threads serialise, and iteration needs manual locking to avoid `ConcurrentModificationException`. `ConcurrentHashMap` has lock-free reads, per-bin locking for writes (different keys update in parallel), cooperative resizing, weakly consistent iterators that never throw, and atomic compound operations (`computeIfAbsent`, `merge`, `compute`, `putIfAbsent`) that replace error-prone get-then-put code.
````

**Q3. When is `CopyOnWriteArrayList` a good choice?**

````reveal title="Answer"
When reads and iterations vastly outnumber writes, and the list is small to medium: listener and observer lists, configuration lists, routing tables. Every write copies the underlying array, which is expensive, but reads take no lock and iterators work on an immutable snapshot that never throws `ConcurrentModificationException`. It's a poor choice for frequently modified or large lists.
````

**Q4. What does "weakly consistent iterator" mean?**

````reveal title="Answer"
The iterator of a concurrent collection (`ConcurrentHashMap`, `ConcurrentLinkedQueue`, the skip-list collections) never throws `ConcurrentModificationException`. It's guaranteed to traverse elements as they existed at construction, and may (but needn't) reflect modifications made after. It never returns the same element twice. It's safe to use while other threads modify the collection, but it isn't a consistent snapshot.
````

**Q5. How would you count word frequencies from many threads?**

````reveal title="Answer"
Use a shared `ConcurrentHashMap<String, Long>` with `counts.merge(word, 1L, Long::sum)`, which is atomic per key. For very hot keys, use `ConcurrentHashMap<String, LongAdder>` with `computeIfAbsent(word, k -> new LongAdder()).increment()`. Alternatively, avoid sharing entirely: each thread counts into its own `HashMap` (thread confinement), and you merge the maps at the end, which is often the fastest. Never use get-then-put.
````

## Hands-on exercise

Build a two-stage **order pipeline**:
- **Stage 1**: one producer reads raw lines like `"books,12.50"` and puts them on `rawQueue` (`ArrayBlockingQueue(5)`).
- **Stage 2**: two parser threads take raw lines, parse them into `record Order(String category, double amount)`, and put them on `orderQueue` (`ArrayBlockingQueue(5)`). Skip malformed lines, counting them.
- **Stage 3**: two aggregator threads take orders and add the amounts into a `ConcurrentHashMap<String, Double>` with `merge`.

Shut down in order with poison pills (one per thread of the next stage), then print the per-category totals (sorted), the number of orders and the number of rejected lines.

````hint title="Hint"
Use a sentinel per queue type: `String RAW_POISON = "<eof>"` and `Order ORDER_POISON = new Order("<eof>", 0)`, compared by identity (`==`). The producer sends 2 raw pills (one per parser). Each parser forwards nothing on its pill, so the **main** thread, after joining both parsers, sends 2 order pills (one per aggregator). Join the aggregators, then print.
````

````solution title="Solution"
```java title="OrderPipeline.java" file="OrderPipeline.java"
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

public class OrderPipeline {
    record Order(String category, double amount) { }

    static final String RAW_POISON = new String("<eof>");          // unique objects, compared with ==
    static final Order ORDER_POISON = new Order("<eof>", 0);

    interface Body {
        void run() throws InterruptedException;
    }

    static Thread thread(String name, Body body) {
        return new Thread(() -> {
            try {
                body.run();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }, name);
    }

    public static void main(String[] args) throws InterruptedException {
        List<String> input = List.of("books,12.50", "games,40.00", "books,7.50", "oops", "music,9.99",
                "games,20.00", "books,30.00", "music,abc", "music,0.01", "games,15.00");
        BlockingQueue<String> rawQueue = new ArrayBlockingQueue<>(5);
        BlockingQueue<Order> orderQueue = new ArrayBlockingQueue<>(5);
        Map<String, Double> totals = new ConcurrentHashMap<>();
        AtomicInteger orders = new AtomicInteger();
        AtomicInteger rejected = new AtomicInteger();

        Thread producer = thread("producer", () -> {
            for (String line : input) {
                rawQueue.put(line);
            }
            rawQueue.put(RAW_POISON);
            rawQueue.put(RAW_POISON);                              // one per parser
        });

        List<Thread> parsers = new ArrayList<>();
        for (int i = 0; i < 2; i++) {
            parsers.add(thread("parser-" + i, () -> {
                for (String line = rawQueue.take(); line != RAW_POISON; line = rawQueue.take()) {
                    String[] parts = line.split(",");
                    try {
                        orderQueue.put(new Order(parts[0], Double.parseDouble(parts[1])));
                    } catch (ArrayIndexOutOfBoundsException | NumberFormatException e) {
                        rejected.incrementAndGet();               // malformed line: count and skip
                    }
                }
            }));
        }

        List<Thread> aggregators = new ArrayList<>();
        for (int i = 0; i < 2; i++) {
            aggregators.add(thread("aggregator-" + i, () -> {
                for (Order o = orderQueue.take(); o != ORDER_POISON; o = orderQueue.take()) {
                    totals.merge(o.category(), o.amount(), Double::sum);
                    orders.incrementAndGet();
                }
            }));
        }

        producer.start();
        parsers.forEach(Thread::start);
        aggregators.forEach(Thread::start);
        producer.join();
        for (Thread p : parsers) {
            p.join();
        }
        orderQueue.put(ORDER_POISON);                              // parsers are done: stop aggregators
        orderQueue.put(ORDER_POISON);
        for (Thread a : aggregators) {
            a.join();
        }

        Map<String, String> rounded = new TreeMap<>();
        totals.forEach((k, v) -> rounded.put(k, String.format("%.2f", v)));
        System.out.println("totals: " + rounded);
        System.out.println("orders: " + orders.get() + ", rejected lines: " + rejected.get());
    }
}
```

```text title="Output" output="OrderPipeline.java"
totals: {books=50.00, games=75.00, music=10.00}
orders: 8, rejected lines: 2
```

Each stage shuts down only after the previous one has drained, so no order is lost however the threads interleave. The bounded queues (capacity 5) throttle a fast stage, so a burst of input can't fill memory. `merge` makes the per-category sums atomic without any explicit lock.
````

## Knowledge check

```quiz
? Why should a work queue be bounded?
+ So producers block (back-pressure) instead of exhausting memory when consumers fall behind
- Bounded queues are faster to iterate
- Unbounded queues aren't thread-safe
> A full queue is a signal, not a failure.

? What is the correct way to increment a per-key counter in a ConcurrentHashMap?
+ map.merge(key, 1L, Long::sum)
- map.put(key, map.get(key) + 1)
- synchronized (map) { map.put(key, map.get(key) + 1); }
> merge is atomic per key; the synchronized version doesn't lock the map's internals.

? A thread iterates a CopyOnWriteArrayList while another adds elements. What does the iterator see?
+ A snapshot of the list at the moment the iterator was created
- A ConcurrentModificationException
- The added elements immediately
> Writes create a new array; iterators keep the old one.

? Three consumers read from one queue. How many poison pills are needed to stop them all?
+ Three, one per consumer
- One
- None; they stop when the queue is empty
> Each consumer exits when it takes a pill.

? Which collection gives sorted keys and concurrent updates?
+ ConcurrentSkipListMap
- ConcurrentHashMap
- CopyOnWriteArrayList
> It supports range views like headMap and tailMap.
```

## Key takeaways

- **Bounded `BlockingQueue`** + `put`/`take` = producer–consumer with back-pressure. Stop consumers with **one poison pill each**.
- **`ConcurrentHashMap`**: use **`merge`, `compute`, `computeIfAbsent`, `putIfAbsent`**, never get-then-put. Keep the functions short and pure. No `null`s.
- Concurrent iterators are **weakly consistent** (no CME); `CopyOnWriteArrayList` iterators are **snapshots**; `size()` is an estimate under concurrency.
- Pick by access pattern: **CHM** (general map), **skip-list** (sorted), **CopyOnWrite** (read-mostly), **ConcurrentLinkedQueue** (lock-free FIFO), **ArrayBlockingQueue/LinkedBlockingQueue** (hand-off).
- Avoid legacy synchronised collections; avoid unbounded queues.
