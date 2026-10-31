## Concept explanation

### What the rounds actually test

Java back-end interviews for **SDE-2 and senior** roles follow a fairly standard loop. Each round looks for a different signal:

| Round | What they test | What a strong candidate shows |
|---|---|---|
| **Coding / DSA** (45-60 min) | problem solving, correctness, complexity, clean code | clarifies the problem, states an approach with its complexity before coding, writes idiomatic Java (right collections, no overflow), tests with edge cases out loud |
| **Java deep-dive** | language and platform depth: collections internals, concurrency, JVM/GC, modern Java | explains **mechanisms**, not definitions ("why" and "how", not just "what"), and connects them to production consequences |
| **Machine coding / LLD** (60-120 min) | object-oriented design, extensibility, code quality, concurrency | clear interfaces, small classes, patterns where they absorb change, thread safety, a runnable demo or tests |
| **System design / HLD** (senior) | scaling, data modelling, consistency, failure handling | requirements → estimates → design → trade-offs → bottlenecks, with sound numbers |
| **Project deep-dive / behavioural** | ownership, impact, collaboration, judgment | concrete stories with **your** decisions, metrics and lessons learned |

**SDE-2 vs senior**:
- **SDE-2** must be solid on fundamentals and internals, write clean, tested code without hand-holding, and debug methodically.
- **Senior** adds **trade-off reasoning** (when *not* to use something), production war stories, designing for failure and scale, and raising the bar for others. The same question ("How does `ConcurrentHashMap` work?") is asked at both levels; the senior answer goes further into consequences and alternatives.

### The answer structure: definition → mechanism → trade-off → example

Most deep-dive answers fail in one of two ways: they're a one-line definition, or a rambling brain dump. Use four beats:

1. **Definition** (one sentence): what it is and what problem it solves.
2. **Mechanism**: how it works inside, the part that separates candidates.
3. **Trade-off**: costs, limits, alternatives, when not to use it.
4. **Example**: a concrete case from code or production, or a 10-line experiment that proves the claim.

Example, "What is `volatile`?":
> **Definition**: `volatile` makes a field's reads and writes visible across threads and orders them.
> **Mechanism**: under the Java Memory Model, a write to a volatile field *happens-before* every later read of it, so everything written before the volatile write is visible after the read. The JIT may not cache the field in a register or reorder accesses across it, and it emits the necessary memory barriers.
> **Trade-off**: it gives visibility and ordering, **not atomicity**: `count++` on a volatile is still a race. Use atomics or locks for read-modify-write, and accept that volatile accesses are slightly slower.
> **Example**: a `volatile boolean running` stop flag for a worker thread. Without `volatile`, the JIT can hoist the read out of the loop and the thread never stops.

That takes about 60-90 seconds, and it invites exactly the follow-ups you're prepared for.

### Preparing with this notebook

| Tool | How to use it |
|---|---|
| **Lessons** (the roadmap on the [Java home page](#java)) | learn each topic once properly: the *Internal working* and *Common mistakes* sections are the interview material |
| **[Question bank](#java/interview)** | filter by topic, level and kind. Answer **out loud or in the draft box first**, then reveal hints one at a time, then the answer |
| **[Tricky questions](#java/interview/tricky)** | output-prediction and "gotcha" questions, the ones that sink otherwise strong candidates |
| **Rating your answers** | mark *Missed* honestly. Missed questions go to the revision list |
| **[Revision notebook](#java/notebook)** | bookmarks, notes and the revision list: re-answer missed questions after 1, 3 and 7 days (spaced repetition) |
| **[Coding exercises](#java/problems)** | timed practice in Java: write, test and explain |
| **[Progress dashboard](#java/progress)** | spot weak topics (low accuracy) and focus there |

A realistic plan for experienced developers, around 6 weeks at 1-2 hours a day:

| Week | Focus |
|---|---|
| 1 | Core Java, OOP, strings, `equals`/`hashCode`, exceptions. Tricky questions for those topics |
| 2 | Collections and `HashMap`/`ConcurrentHashMap` internals, generics, streams. Daily coding problems |
| 3 | Concurrency: JMM, locks, executors, `CompletableFuture`, virtual threads. Write the classic programs (producer-consumer, odd-even) from memory |
| 4 | JVM, GC, memory, performance. Prepare two debugging stories (a leak, a latency problem) |
| 5 | LLD: two machine-coding problems per week, timed. Patterns, SOLID, testing |
| 6 | Mock interviews, the revision list, weak topics from the dashboard. Stop learning new material and consolidate |

## Internal working

How interviewers actually evaluate you:

- **Structured rubrics**: most companies score each round on fixed dimensions (for example problem solving, coding, technical depth, communication), each from "strong no hire" to "strong hire", with written evidence. Interviewers need **evidence they can write down**: "explained resize and treeification unprompted; reasoned correctly about the cost of a bad `hashCode`". Thinking out loud creates that evidence. Silent correct code creates less.
- **Peeling the onion**: deep-dive questions are a ladder. Each answer is followed by a "why?" or "what if?" one level deeper, until you reach your limit. The interviewer is mapping **where** your knowledge ends, not checking whether you know everything. Climb as far as you honestly can, then reason aloud from principles ("I haven't seen that implementation, but given that it must be thread-safe without a global lock, I'd expect…").
- **Calibration by level**: the same answer can be a "hire" at SDE-2 and a "lean no" at senior if it lacks trade-offs and production context. Senior answers volunteer the consequences: "…so under high contention we'd prefer `LongAdder`, and we saw this in our metrics service."
- **Red flags that weigh heavily**:
  - confidently wrong statements (worse than "I'm not sure");
  - code that doesn't compile in obvious ways, or ignores edge cases;
  - blaming others in behavioural stories;
  - jumping into code before clarifying;
  - pattern-dropping without reasons.
- **Coding rounds** are scored on a sequence: understanding (clarifying questions, examples), approach (a brute-force baseline, then optimisation, with complexity), implementation (correct, readable, idiomatic), and verification (dry-run with an example, edge cases, complexity re-check). Missing the verification step is the most common avoidable loss.
- **Machine coding** reviewers run your code and read it:
  - Does it meet the requirements? Is it extensible (could a new vehicle type or payment method be added without editing five classes)?
  - Is shared state thread-safe? Are names and boundaries clear? Is there a demo or a test?
  - A smaller, working, well-structured solution beats an ambitious broken one.

## Visual representation

```text title="Peeling the onion: one question, five levels"
 L1  "How does HashMap work?"                      array of buckets, hash -> index, equals for collisions
 L2  "What happens on collision?"                   linked list, treeified to a red-black tree at 8 (table >= 64)
 L3  "When does it resize, and what does it cost?"  size > 0.75 * capacity, O(n) rehash, split lo/hi buckets
 L4  "Why is it not thread-safe? What breaks?"      lost updates, lost entries during resize (and cycles in Java 7)
 L5  "So how does ConcurrentHashMap avoid that?"    CAS on empty bins, synchronized per bin head, cooperative resize
      ^ SDE-2 is expected to reach about L4 comfortably; senior candidates reach L5 and discuss trade-offs

 Answer shape for every level:  definition -> mechanism -> trade-off -> example
```

## Java code example

Machine-coding rounds often ask for a small, real component, such as **"Implement an in-memory key-value store where entries expire after a TTL."** Here is what a strong 45-minute submission looks like:
- an interface;
- an implementation with an **injected clock**, so expiry is testable;
- **atomic check-then-act** with `ConcurrentHashMap.compute`;
- **lazy expiry** on read plus a purge method;
- input validation;
- a self-checking demo, including a concurrency check.

```java title="TtlStoreRound.java" file="TtlStoreRound.java"
import java.time.Duration;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;

public class TtlStoreRound {
    /** A key-value store whose entries disappear after their time-to-live. */
    interface KeyValueStore<K, V> {
        void put(K key, V value, Duration ttl);
        Optional<V> get(K key);
        boolean putIfAbsent(K key, V value, Duration ttl);   // atomic: true if this call stored the value
        int purgeExpired();
        int size();
    }

    static final class InMemoryTtlStore<K, V> implements KeyValueStore<K, V> {
        private record Entry<V>(V value, long expiresAtNanos) { }

        private final ConcurrentHashMap<K, Entry<V>> entries = new ConcurrentHashMap<>();
        private final LongSupplier nanoClock;                // injected: production passes System::nanoTime

        InMemoryTtlStore(LongSupplier nanoClock) {
            this.nanoClock = nanoClock;
        }

        private static boolean expired(Entry<?> e, long now) {
            return now - e.expiresAtNanos() >= 0;             // subtraction: safe even if nanoTime wraps
        }

        private Entry<V> newEntry(K key, V value, Duration ttl) {
            Objects.requireNonNull(key, "key");
            Objects.requireNonNull(value, "value");
            if (ttl.isZero() || ttl.isNegative()) {
                throw new IllegalArgumentException("ttl must be positive");
            }
            return new Entry<>(value, nanoClock.getAsLong() + ttl.toNanos());
        }

        @Override
        public void put(K key, V value, Duration ttl) {
            entries.put(key, newEntry(key, value, ttl));
        }

        @Override
        public Optional<V> get(K key) {
            Entry<V> e = entries.get(key);
            if (e == null) {
                return Optional.empty();
            }
            if (expired(e, nanoClock.getAsLong())) {
                entries.remove(key, e);                      // conditional: never deletes a newer value
                return Optional.empty();
            }
            return Optional.of(e.value());
        }

        @Override
        public boolean putIfAbsent(K key, V value, Duration ttl) {
            Entry<V> candidate = newEntry(key, value, ttl);
            long now = nanoClock.getAsLong();
            Entry<V> result = entries.compute(key, (k, old) -> old != null && !expired(old, now) ? old : candidate);
            return result == candidate;                      // check-then-act done atomically inside compute
        }

        @Override
        public int purgeExpired() {
            long now = nanoClock.getAsLong();
            AtomicInteger removed = new AtomicInteger();
            entries.values().removeIf(e -> expired(e, now) && removed.incrementAndGet() > 0);
            return removed.get();
        }

        @Override
        public int size() {
            return entries.size();
        }
    }

    public static void main(String[] args) throws InterruptedException {
        AtomicLong fakeNanos = new AtomicLong();             // the test controls time
        KeyValueStore<String, String> store = new InMemoryTtlStore<>(fakeNanos::get);

        store.put("session:ada", "cart=3 items", Duration.ofSeconds(30));
        System.out.println("t=0s   get session:ada -> " + store.get("session:ada"));
        fakeNanos.addAndGet(Duration.ofSeconds(29).toNanos());
        System.out.println("t=29s  get session:ada -> " + store.get("session:ada"));
        fakeNanos.addAndGet(Duration.ofSeconds(1).toNanos());
        System.out.println("t=30s  get session:ada -> " + store.get("session:ada") + " (expired, removed lazily; size " + store.size() + ")");

        System.out.println("putIfAbsent on a live key:     " + store.putIfAbsent("lock:job", "worker-1", Duration.ofSeconds(5))
                + ", then again: " + store.putIfAbsent("lock:job", "worker-2", Duration.ofSeconds(5)));
        fakeNanos.addAndGet(Duration.ofSeconds(5).toNanos());
        System.out.println("putIfAbsent after the lock expired: " + store.putIfAbsent("lock:job", "worker-2", Duration.ofSeconds(5))
                + " -> holder " + store.get("lock:job").orElse("-"));

        store.put("otp:1", "111111", Duration.ofSeconds(10));
        store.put("otp:2", "222222", Duration.ofSeconds(20));
        store.put("otp:3", "333333", Duration.ofSeconds(60));
        fakeNanos.addAndGet(Duration.ofSeconds(25).toNanos());
        System.out.println("purgeExpired() after 25s removed " + store.purgeExpired() + ", size now " + store.size());

        // Concurrency check: 8 threads race to take the same lock key -> exactly one wins
        KeyValueStore<String, String> shared = new InMemoryTtlStore<>(() -> 0L);
        AtomicInteger winners = new AtomicInteger();
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(8);
        for (int t = 0; t < 8; t++) {
            String worker = "worker-" + t;
            pool.submit(() -> {
                start.await();
                if (shared.putIfAbsent("lock:order-42", worker, Duration.ofSeconds(10))) {
                    winners.incrementAndGet();
                }
                return null;
            });
        }
        start.countDown();
        pool.shutdown();
        pool.awaitTermination(10, TimeUnit.SECONDS);
        System.out.println("8 threads racing for lock:order-42 -> winners: " + winners.get());

        try {
            store.put("k", "v", Duration.ZERO);
        } catch (IllegalArgumentException e) {
            System.out.println("invalid ttl rejected: " + e.getMessage());
        }
        try {
            store.put(null, "v", Duration.ofSeconds(1));
        } catch (NullPointerException e) {
            System.out.println("null key rejected: " + e.getMessage());
        }
    }
}
```

## Output

```text title="Output" output="TtlStoreRound.java"
t=0s   get session:ada -> Optional[cart=3 items]
t=29s  get session:ada -> Optional[cart=3 items]
t=30s  get session:ada -> Optional.empty (expired, removed lazily; size 0)
putIfAbsent on a live key:     true, then again: false
putIfAbsent after the lock expired: true -> holder worker-2
purgeExpired() after 25s removed 3, size now 1
8 threads racing for lock:order-42 -> winners: 1
invalid ttl rejected: ttl must be positive
null key rejected: key
```

What the reviewer sees in this output:
- Expiry is exact and testable. The session was alive at 29 s, gone at exactly 30 s, and removed from the map on that read.
- `putIfAbsent` behaves like a lease: it refused a second holder while the first was alive, and handed the key over once the first expired.
- The purge removed exactly the three expired entries: two one-time passwords and the old `lock:job` lease. The 60-second password survived.
- The concurrency check proves the check-then-act is atomic: exactly one of eight racing threads won.
- Bad input is rejected with clear messages.

In the round, narrate the decisions as you write them:
- "I'm injecting the clock so I can test expiry without sleeping."
- "`compute` makes 'check if absent or expired, then store' a single atomic step. `get` followed by `put` would let two threads both win."
- "The conditional `remove(key, entry)` won't delete a fresh value that another thread wrote after I read the expired one."
- "I compare `nanoTime` values by subtraction, which is correct even if the counter wraps."
- "Expired entries are removed lazily on read and by `purgeExpired`, which a scheduled executor would call every few seconds. In a cluster I'd use Redis `SET key value NX PX ttl` instead."

## Real-world application

- **Coding rounds** use online editors (CoderPad, HackerRank) with Java. Know the standard library by heart, because there's no IDE auto-complete or documentation to lean on. The [coding-round toolkit](#java/learn/coding-round-toolkit) lesson covers the idioms.
- **Deep-dive rounds** pull directly from the material in this notebook:
  - `HashMap`/`ConcurrentHashMap` internals, `equals`/`hashCode`, immutability;
  - the JMM and `volatile`, thread pools and `CompletableFuture`, virtual threads;
  - GC choices and memory leaks;
  - "what's new since Java 8".
  
  The interview topics in the [question bank](#java/interview) map one-to-one onto these rounds.
- **Machine coding** problems recur: parking lot, rate limiter, LRU cache, elevator, splitwise, a logger, a task scheduler, a URL shortener (in-memory). The skills are interfaces, enums for states, strategies, thread-safe collections, and a runnable demo.
- **Project deep-dives** probe production experience: prepare two or three stories with **numbers** ("p99 from 800 ms to 120 ms", "heap from 6 GB to 2 GB") using the debugging method from the performance lessons: symptom → evidence → hypothesis → fix → prevention.
- **Offer calibration**: the same loop can result in an SDE-2 or a senior offer. Trade-off reasoning and ownership in your stories are what move you up a level.

## Common mistakes

- **Reciting definitions** without mechanisms. "HashMap stores key-value pairs" earns nothing at SDE-2.
- **Brain-dumping**: five minutes on everything you know about GC when asked one specific question. Answer in four beats, then pause and let the interviewer steer.
- **Bluffing**: a confidently wrong answer destroys trust in everything else you said. "I'm not certain; here's how I'd reason about it…" is a strong answer.
- **Coding before clarifying**: input sizes, constraints, null and empty cases, expected output format.
- **No verification**: not dry-running the code with an example, and not stating edge cases or complexity at the end.
- **Over-engineering machine coding** (seven patterns, no working demo), or under-engineering it (one 300-line class).
- **Stories without "I"**: "we migrated to Kafka" doesn't tell them what *you* decided or built.
- **Preparing only by reading.** Retrieval practice (answering out loud, then checking) and spaced repetition are what make answers fluent under pressure.

## Interview questions

**Q1. "Walk me through what happens when you run `java Main`." How would you structure the answer?**

````reveal title="Answer"
Go top-down in stages, offering depth on demand:
1. **Launcher**: the `java` launcher parses options, loads the JVM library (`libjvm`), and creates the VM: heap reserved, GC chosen by ergonomics, JIT and GC threads started.
2. **Class loading**: the bootstrap loader loads core classes from the runtime image; the application class loader finds `Main` on the class path (parent delegation).
3. **Linking**: verification, preparation (static fields get default values), resolution of symbolic references (lazily).
4. **Initialisation**: `<clinit>` runs static initialisers on first active use.
5. **Execution**: the launcher calls `public static void main(String[])` on the main thread. Bytecode is interpreted, and hot methods are JIT-compiled by C1, then C2. Objects are allocated in TLABs, and the GC reclaims them.
6. **Shutdown**: when the last non-daemon thread ends (or on `System.exit`), shutdown hooks run and the VM exits.

Then pause: "Should I go deeper into class loading or JIT?"
````

**Q2. You're asked something you don't know. What do you do?**

````reveal title="Answer"
Say so briefly, then show how you'd reason or find out: "I haven't used `StampedLock` in production. From the name and the problem it solves, I'd expect an optimistic read that's validated afterwards, which is cheaper than a read lock when writes are rare…" Relate it to what you do know, state your assumptions, and ask a clarifying question if useful. Interviewers mostly score reasoning and honesty here. Never bluff: a confident wrong answer makes the interviewer doubt your correct ones.
````

**Q3. How should you tell a production-debugging story?**

````reveal title="Answer"
Use situation → task → action → result, with technical depth in the *action*:
- the **symptom** with numbers ("p99 jumped from 120 ms to 900 ms after the 3.2 release");
- the **evidence** you gathered (GC logs, JFR, thread dumps, metrics);
- the **hypotheses** you ruled in and out;
- the **root cause** ("a `synchronized` LRU cache on every request");
- the **fix** and its measured impact;
- the **prevention** (a load test in CI, an alert, a design review rule).

Use "I" for your decisions. Keep it to 2-3 minutes and let the interviewer dig in.
````

**Q4. Answer "`synchronized` vs `ReentrantLock`" in the four-beat structure.**

````reveal title="Answer"
- **Definition**: both are reentrant mutual-exclusion locks with the same memory-visibility guarantees.
- **Mechanism**: `synchronized` is built into the JVM (monitor enter/exit on an object header, automatic release, even on exceptions). `ReentrantLock` is a library lock built on `AbstractQueuedSynchronizer` (CAS on a state field plus a queue of parked threads), released explicitly in `finally`.
- **Trade-off**: `ReentrantLock` adds `tryLock` with a timeout, interruptible acquisition, fairness and multiple `Condition`s, at the cost of verbosity and the risk of forgetting `unlock`. `synchronized` is simpler, and since JDK 24 it no longer pins virtual threads.
- **Example**: a transfer between two accounts using `tryLock` with a timeout to avoid deadlock. For simple guarded state, `synchronized` is enough.
````

**Q5. "What's new in Java 21 that you'd actually use?" What makes a strong answer?**

````reveal title="Answer"
Judgment, not a list. Pick 3-4 features with a real use and a caveat:
- **virtual threads** for blocking I/O-heavy services (but bound access to downstream resources, and watch pinning on older JDKs and `ThreadLocal` abuse);
- **record patterns and pattern-matching `switch` over sealed types**, for exhaustive domain modelling such as payment results or events;
- **sequenced collections** (`getFirst`/`getLast`/`reversed`);
- `Math.clamp`, `StringBuilder.repeat`, and generational ZGC for low-latency heaps.

Mention what you've migrated or measured. That's what distinguishes experience from release-note reading.
````

## Hands-on exercise

Practise the **"answer + proof"** habit on a classic deep-dive question: *"Why must `equals` and `hashCode` be overridden together?"*

1. Write a four-beat answer (definition, mechanism, trade-off, example) in 6-8 sentences.
2. Write a short program that **proves** it:
   - a `Point` class overriding only `equals`: show that a `HashSet` contains "duplicates" and `contains` fails for an equal point;
   - a `FixedPoint` that also overrides `hashCode` consistently: show the problem disappears;
   - a deliberately bad `hashCode` (a constant) that is *correct* but degrades the map to collisions: show it still works and explain the cost.

````hint title="Hint"
`HashSet.add` uses `hashCode()` to choose the bucket **before** calling `equals`. With the default identity `hashCode`, two equal points almost always land in different buckets, so `equals` is never consulted. Use `Objects.hash(x, y)` for the fix. For the constant hash, `HashMap` treeifies big bins only for `Comparable` keys or by tie-breaking, so lookups degrade towards O(log n) or O(n). Correctness is preserved, performance isn't.
````

````solution title="Solution"
**Four-beat answer**:
- **Definition**: hash-based collections require that equal objects have equal hash codes: that's the `hashCode` contract in `Object`.
- **Mechanism**: `HashMap`/`HashSet` first use `hashCode()` to pick a bucket and compare stored hashes, and only then call `equals` within that bucket. If `equals` is overridden but `hashCode` isn't, two equal objects get different identity hash codes, land in different buckets, and are never compared, so the set holds "duplicates" and lookups miss.
- **Trade-off**: the reverse direction isn't required (unequal objects may share a hash), but every collision costs `equals` calls. A constant `hashCode` is legal yet turns the map into a list or tree. Mutable fields used in `hashCode` break lookups after mutation.
- **Example**: in production I'd use records or IDE/`Objects.hash`-generated pairs, and immutable keys.

```java title="EqualsHashCodeProof.java" file="EqualsHashCodeProof.java"
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public class EqualsHashCodeProof {
    @SuppressWarnings("overrides")                  // javac -Xlint:overrides warns about exactly this bug
    static final class Point {                       // equals only: broken
        final int x, y;
        Point(int x, int y) { this.x = x; this.y = y; }

        @Override
        public boolean equals(Object o) {
            return o instanceof Point p && p.x == x && p.y == y;
        }
    }

    static final class FixedPoint {                  // equals + consistent hashCode
        final int x, y;
        FixedPoint(int x, int y) { this.x = x; this.y = y; }

        @Override
        public boolean equals(Object o) {
            return o instanceof FixedPoint p && p.x == x && p.y == y;
        }

        @Override
        public int hashCode() {
            return Objects.hash(x, y);
        }
    }

    static final class ConstantHashPoint {           // legal but slow: every key collides
        static long equalsCalls;
        final int x, y;
        ConstantHashPoint(int x, int y) { this.x = x; this.y = y; }

        @Override
        public boolean equals(Object o) {
            equalsCalls++;
            return o instanceof ConstantHashPoint p && p.x == x && p.y == y;
        }

        @Override
        public int hashCode() {
            return 42;
        }
    }

    public static void main(String[] args) {
        Set<Point> broken = new HashSet<>();
        broken.add(new Point(1, 2));
        broken.add(new Point(1, 2));
        System.out.println("equals only: equal objects " + new Point(1, 2).equals(new Point(1, 2))
                + ", set size " + broken.size() + ", contains(new Point(1,2)) " + broken.contains(new Point(1, 2)));

        Set<FixedPoint> fixed = new HashSet<>();
        fixed.add(new FixedPoint(1, 2));
        fixed.add(new FixedPoint(1, 2));
        System.out.println("equals + hashCode: set size " + fixed.size() + ", contains " + fixed.contains(new FixedPoint(1, 2)));

        Map<ConstantHashPoint, String> slow = new HashMap<>();
        for (int i = 0; i < 1_000; i++) {
            slow.put(new ConstantHashPoint(i, i), "p" + i);
        }
        ConstantHashPoint.equalsCalls = 0;
        String found = slow.get(new ConstantHashPoint(999, 999));
        System.out.println("constant hashCode: lookup still correct (" + found + "), but it compared against many"
                + " colliding keys (more than 50 equals calls: " + (ConstantHashPoint.equalsCalls > 50) + ")");
    }
}
```

```text title="Output" output="EqualsHashCodeProof.java"
equals only: equal objects true, set size 2, contains(new Point(1,2)) false
equals + hashCode: set size 1, contains true
constant hashCode: lookup still correct (p999), but it compared against many colliding keys (more than 50 equals calls: true)
```

The proof turns a memorised rule into evidence you can produce in two minutes. Interviewers remember candidates who say "let me show you" and then do. The constant-hash case shows the deeper point: the contract protects **correctness**, and a good distribution protects **performance**.
````

## Knowledge check

```quiz
? Which answer structure works best for a Java deep-dive question?
+ Definition, then mechanism, then trade-off, then a concrete example
- A complete brain dump of everything related to the topic
- A one-line definition, then waiting for follow-ups
> Four beats, then pause and let the interviewer steer.

? Why do interviewers keep asking "why?" after each of your answers?
+ To find where your knowledge ends and how you reason beyond it
- Because the first answer was wrong
- To fill the time
> Deep-dive rounds are a ladder of follow-ups.

? What is usually the most avoidable point loss in a coding round?
+ Skipping verification: dry runs, edge cases and complexity
- Using Java instead of Python
- Not writing comments
> Test your code out loud before saying "done".

? What best separates a senior answer from an SDE-2 answer to the same question?
+ Trade-offs, production consequences and alternatives
- Using more technical terms
- Answering faster
> Senior answers volunteer when not to use something.

? How should you use the question bank for retention?
+ Answer first, reveal hints gradually, mark misses, and revisit them on a spaced schedule
- Read all the answers once
- Only study questions marked as beginner
> Retrieval practice plus spaced repetition.
```

## Key takeaways

- Each round tests a different signal: **coding** (problem solving and clean Java), **deep-dive** (mechanisms), **machine coding** (design, extensibility, thread safety), **system design** (senior), and **project stories** (ownership with numbers).
- Answer in four beats: **definition → mechanism → trade-off → example**, then pause. Back claims with small experiments.
- Interviewers peel the onion to find your limit. Reason from principles when you reach it; never bluff.
- In coding and machine-coding rounds, **clarify, plan, implement, verify**. A working, well-structured solution beats an ambitious broken one.
- Prepare with retrieval and spaced repetition: question bank → mark misses → revision list → dashboard for weak topics, plus timed exercises.
