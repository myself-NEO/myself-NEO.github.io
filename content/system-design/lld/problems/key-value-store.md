## Problem statement

Design an in-memory key-value store with `get`, `put`, `delete`, optional **time-to-live** per key, and **nested transactions**: `begin` starts a transaction (possibly inside another), `commit` makes its changes visible, `rollback` discards them. Many clients use the store at once; one client's uncommitted changes must be invisible to the others, and two transactions must not silently overwrite each other's work.

> [!TIP] Try it first
> Model a transaction as a **layer of pending changes** on top of the committed data. What does `get` do when the key was deleted in the current layer but exists underneath? What happens to an inner layer on commit?

## Clarifying questions

1. Keys and values: strings?
2. Without `begin`, does each write commit immediately?
3. Nested transactions: does committing an inner one make it visible to other clients?
4. What isolation is needed? What if two transactions change the same key?
5. TTL: is it set at write time or commit time? Is expiry exact or lazy?
6. One transaction per client, or shared between threads?

````reveal title="Answers we'll assume"
- String keys and values.
- Outside a transaction, every write **auto-commits**.
- Committing an **inner** transaction merges its changes into the **enclosing** one; only the **outermost** commit publishes to the store. Rolling back discards only the innermost layer.
- Other clients never see uncommitted changes (read committed). Conflicts are detected **optimistically**: if a key that the transaction read or wrote was changed by someone else before it commits, the commit fails and the client retries.
- TTL is fixed **when the write happens**; expired keys read as absent and are purged lazily (plus an explicit `purgeExpired()`).
- A `Session` belongs to one client thread; the store is shared and thread-safe.
````

## Requirements

**Functional**

1. `get`, `put(key, value[, ttl])`, `delete` on a session.
2. `begin`, `commit`, `rollback` with arbitrary nesting; errors when there's no transaction.
3. Reads inside a transaction see its own pending changes, innermost first.
4. Outermost commit applies all changes atomically; conflicting commits fail.

**Non-functional**

5. Thread-safe store; concurrent readers don't block each other.
6. Transactions are cheap: no copy of the whole store.
7. Time is injectable for TTL tests.

## Step 1 — Layers and mutations

````reveal title="A stack of change layers"
Each `begin` pushes an empty map of **mutations** (`key → Put(value, expiresAt)` or `key → Delete`). A delete must be recorded explicitly (a *tombstone*) — otherwise a read would fall through to the committed value underneath.

```text
committed:      a=10, b=1
layer 1 (outer): a -> Put(20)
layer 2 (inner): a -> Delete, c -> Put(7)

get(a): layer 2 says Delete -> absent
get(b): no layer mentions b -> committed 1
rollback: drop layer 2      -> get(a) = 20 again
commit (inner): layer 2 merged into layer 1 (later changes win)
commit (outer): every mutation applied to the store under one write lock
```

Each mutation is a small **command** with `applyTo(key, data)`; committing is "apply every command in order".
````

````reveal title="Optimistic conflict detection"
Every committed change bumps a global version, recorded per key (kept even after a delete). When a transaction first touches a key — read or write — the session remembers the version it saw. At the outermost commit, under the write lock, the store checks that each remembered key still has that version. If not, someone else committed in between: the commit is refused, and the client retries the whole transaction.

That turns the classic lost update ("both read 5, both write 6") into a conflict that one of them retries.
````

## Step 2 — Class design

```uml title="Key-value store with transactions"
class KeyValueStore
  - data: Map<String, Entry>
  - versions: Map<String, Long>
  - lock: ReentrantReadWriteLock
  - clock: Clock
  + session(): Session
  + read(key: String): Optional<String>
  + versionOf(key: String): long
  + commit(writes: Map<String, Mutation>, seen: Map<String, Long>): void
  + purgeExpired(): int
class Session
  - layers: Deque<Map<String, Mutation>>
  - seen: Map<String, Long>
  + get(key: String): Optional<String>
  + put(key: String, value: String, ttl: Duration): void
  + delete(key: String): void
  + begin(): void
  + commit(): void
  + rollback(): void
interface Mutation
  + applyTo(key: String, data: Map<String, Entry>): void
record Put
  + value: String
  + expiresAt: Instant
record Delete
record Entry
  + value: String
  + expiresAt: Instant
KeyValueStore *-- "0..*" Entry
KeyValueStore ..> Session : creates
Session --> KeyValueStore
Session o-- "0..*" Mutation
Put ..|> Mutation
Delete ..|> Mutation
```

## Step 3 — Implementation

````hint title="Hint — commit of an inner layer is just a merge"
Pop the top layer. If another layer remains, `parent.putAll(top)` — the inner changes simply override the parent's for the same keys. Only when the stack becomes empty do you call the store. Rollback is even simpler: pop and forget.
````

````solution title="Complete Java solution"
```java title="KeyValueStoreDemo.java" file="KeyValueStoreDemo.java"
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.locks.ReentrantReadWriteLock;

public class KeyValueStoreDemo {
    public static void main(String[] args) throws InterruptedException {
        MutableClock clock = new MutableClock(Instant.parse("2026-05-01T12:00:00Z"));
        KeyValueStore store = new KeyValueStore(clock);
        Session s1 = store.session();
        Session s2 = store.session();

        s1.put("a", "10");                                        // no transaction: auto-commit
        s1.begin();
        s1.put("a", "20");
        System.out.println("s1 sees a=" + show(s1.get("a")) + ", s2 sees a=" + show(s2.get("a")));
        s1.begin();
        s1.delete("a");
        s1.put("b", "5");
        System.out.println("inner: a=" + show(s1.get("a")) + ", b=" + show(s1.get("b")) + ", depth " + s1.depth());
        s1.rollback();
        System.out.println("after inner rollback: a=" + show(s1.get("a")) + ", b=" + show(s1.get("b")));
        s1.begin();
        s1.put("b", "6");
        s1.commit();                                              // merges into the outer transaction only
        System.out.println("inner committed: s1 b=" + show(s1.get("b")) + ", s2 b=" + show(s2.get("b")));
        s1.commit();
        System.out.println("outer committed: s2 a=" + show(s2.get("a")) + ", b=" + show(s2.get("b")));
        attempt(s1::rollback);

        s2.put("otp", "4821", Duration.ofSeconds(30));
        clock.advance(Duration.ofSeconds(31));
        System.out.println("otp after 31s: " + show(s2.get("otp")) + ", purged " + store.purgeExpired());

        s1.put("stock", "5");
        s1.begin();
        int seen = Integer.parseInt(s1.get("stock").orElseThrow());
        s2.begin();
        s2.put("stock", "4");
        s2.commit();                                              // s2 commits first
        s1.put("stock", String.valueOf(seen - 2));
        attempt(s1::commit);                                      // s1 read a value that has since changed
        System.out.println("stock=" + show(s2.get("stock")) + ", s1 depth after failed commit " + s1.depth());

        store.session().put("counter", "0");
        List<Thread> threads = new ArrayList<>();
        for (int t = 0; t < 8; t++) {
            threads.add(new Thread(() -> {
                Session s = store.session();
                for (int i = 0; i < 1_000; i++) {
                    while (true) {                                // optimistic: retry the whole transaction on conflict
                        s.begin();
                        int v = Integer.parseInt(s.get("counter").orElseThrow());
                        s.put("counter", String.valueOf(v + 1));
                        try {
                            s.commit();
                            break;
                        } catch (ConflictException retry) {
                            // someone else committed first; read again
                        }
                    }
                }
            }));
        }
        threads.forEach(Thread::start);
        for (Thread th : threads) th.join();
        System.out.println("counter after 8 x 1000 transactional increments: " + show(s1.get("counter")));
    }

    static String show(Optional<String> v) { return v.orElse("(none)"); }

    static void attempt(Runnable action) {
        try {
            action.run();
        } catch (KvException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
    }
}

class KvException extends RuntimeException {
    KvException(String message) { super(message); }
}

final class ConflictException extends KvException {
    ConflictException(String key) { super("conflict on '" + key + "': it changed after this transaction read it"); }
}

record Entry(String value, Instant expiresAt) {
    boolean isLive(Instant now) { return expiresAt == null || now.isBefore(expiresAt); }
}

/** A pending change: a command applied to the committed data at commit time. */
sealed interface Mutation permits Put, Delete {
    void applyTo(String key, Map<String, Entry> data);
}

record Put(String value, Instant expiresAt) implements Mutation {
    public void applyTo(String key, Map<String, Entry> data) { data.put(key, new Entry(value, expiresAt)); }
}

/** A tombstone: hides the committed value from reads inside the transaction. */
record Delete() implements Mutation {
    public void applyTo(String key, Map<String, Entry> data) { data.remove(key); }
}

final class KeyValueStore {
    private final Map<String, Entry> data = new HashMap<>();
    private final Map<String, Long> versions = new HashMap<>();   // last committed change per key, kept after deletes
    private final ReentrantReadWriteLock lock = new ReentrantReadWriteLock();
    private final Clock clock;
    private long version;

    KeyValueStore(Clock clock) { this.clock = clock; }

    Session session() { return new Session(this); }

    Instant now() { return clock.instant(); }

    Optional<String> read(String key) {
        lock.readLock().lock();
        try {
            Entry e = data.get(key);
            return e != null && e.isLive(now()) ? Optional.of(e.value()) : Optional.empty();
        } finally {
            lock.readLock().unlock();
        }
    }

    long versionOf(String key) {
        lock.readLock().lock();
        try {
            return versions.getOrDefault(key, 0L);
        } finally {
            lock.readLock().unlock();
        }
    }

    /** Atomic: validate everything the transaction depended on, then apply every mutation. */
    void commit(Map<String, Mutation> writes, Map<String, Long> seen) {
        lock.writeLock().lock();
        try {
            for (Map.Entry<String, Long> s : seen.entrySet()) {
                if (versions.getOrDefault(s.getKey(), 0L) != s.getValue().longValue()) throw new ConflictException(s.getKey());
            }
            for (Map.Entry<String, Mutation> w : writes.entrySet()) {
                w.getValue().applyTo(w.getKey(), data);
                versions.put(w.getKey(), ++version);
            }
        } finally {
            lock.writeLock().unlock();
        }
    }

    int purgeExpired() {
        lock.writeLock().lock();
        try {
            int before = data.size();
            Instant now = now();
            data.values().removeIf(e -> !e.isLive(now));
            return before - data.size();
        } finally {
            lock.writeLock().unlock();
        }
    }
}

/** One client's view: not thread-safe, use one per thread. */
final class Session {
    private final KeyValueStore store;
    private final Deque<Map<String, Mutation>> layers = new ArrayDeque<>();   // head = innermost transaction
    private final Map<String, Long> seen = new HashMap<>();                   // versions observed by the outermost transaction

    Session(KeyValueStore store) { this.store = store; }

    Optional<String> get(String key) {
        track(key);
        for (Map<String, Mutation> layer : layers) {                         // innermost first
            Mutation m = layer.get(key);
            if (m instanceof Put p) return p.expiresAt() == null || store.now().isBefore(p.expiresAt()) ? Optional.of(p.value()) : Optional.empty();
            if (m instanceof Delete) return Optional.empty();
        }
        return store.read(key);
    }

    void put(String key, String value) { put(key, value, null); }

    void put(String key, String value, Duration ttl) {
        write(key, new Put(value, ttl == null ? null : store.now().plus(ttl)));   // expiry fixed at write time
    }

    void delete(String key) { write(key, new Delete()); }

    void begin() { layers.push(new LinkedHashMap<>()); }

    void commit() {
        Map<String, Mutation> top = pop();
        if (!layers.isEmpty()) {
            layers.peek().putAll(top);                                        // inner commit: merge into the parent
            return;
        }
        try {
            store.commit(top, seen);
        } finally {
            seen.clear();                                                     // committed or conflicted: the transaction is over
        }
    }

    void rollback() {
        pop();
        if (layers.isEmpty()) seen.clear();
    }

    int depth() { return layers.size(); }

    private void write(String key, Mutation m) {
        if (layers.isEmpty()) {
            store.commit(Map.of(key, m), Map.of());                           // auto-commit
            return;
        }
        track(key);
        layers.peek().put(key, m);
    }

    private void track(String key) {
        if (!layers.isEmpty()) seen.computeIfAbsent(key, store::versionOf);
    }

    private Map<String, Mutation> pop() {
        if (layers.isEmpty()) throw new KvException("no transaction in progress");
        return layers.pop();
    }
}

final class MutableClock extends Clock {
    private volatile Instant now;
    MutableClock(Instant start) { now = start; }
    void advance(Duration d) { now = now.plus(d); }
    @Override public Instant instant() { return now; }
    @Override public ZoneId getZone() { return ZoneOffset.UTC; }
    @Override public Clock withZone(ZoneId zone) { return this; }
}
```
````

## Design decisions

- **Layers of mutations, not copies.** `begin` costs one empty map; a transaction stores only what it changed. Reads check layers innermost-first and fall through to committed data (see [Choosing data structures](lesson:data-structure-selection)).
- **Mutations are commands.** `Put` and `Delete` know how to apply themselves; commit is "run the commands under the lock". The layer stack doubles as a memento: rollback restores the previous state by dropping the top layer (see [Command](lesson:command)).
- **Immutable values everywhere.** `Entry`, `Put` and `Delete` are records; a committed `Entry` is never changed in place, only replaced, so a reader can never see a half-updated value (see [Immutability](lesson:immutability)).
- **Optimistic concurrency.** Versions per key let transactions run without holding locks; conflicts surface at commit as `ConflictException`, and callers retry. Under low contention this is much cheaper than locking keys for the whole transaction (see [Thread safety](lesson:thread-safety)).
- **Read-write lock on the store.** Many concurrent `get`s share the read lock; commits are short critical sections under the write lock.
- **Expiry fixed at write time.** A TTL set inside a long transaction still counts from when the client wrote it — the least surprising rule.

## Patterns and principles

[Command](lesson:command) (`Mutation`), memento-style snapshots (the layer stack), [immutability](lesson:immutability) (records for values and mutations), [optimistic concurrency](lesson:concurrent-state-transitions) with versions, [thread safety](lesson:thread-safety) via a read-write lock, and [data-structure selection](lesson:data-structure-selection).

## Example execution flow

```text
s1.put(a, 10)          no layers -> commit {a: Put(10)} at once; version(a)=1
s1.begin; put(a, 20)   layer1 {a: Put(20)}; s1 sees 20, s2 reads committed 10
s1.begin; delete(a); put(b, 5)   layer2 {a: Delete, b: Put(5)} -> a absent, b=5
s1.rollback            layer2 dropped -> a=20, b absent
s1.begin; put(b, 6); commit      layer2 merged into layer1 -> layer1 {a: 20, b: 6}; s2 still sees no b
s1.commit              outermost: check versions of a, b unchanged -> apply both
stock: s1 reads 5 (version v); s2 commits 4 (version v+1)
       s1 commits -> version mismatch -> ConflictException
8 threads x 1000 increments, each retried on conflict -> 8000, no lost updates
```

```text title="Program output"
s1 sees a=20, s2 sees a=10
inner: a=(none), b=5, depth 2
after inner rollback: a=20, b=(none)
inner committed: s1 b=6, s2 b=(none)
outer committed: s2 a=20, b=6
Rejected: no transaction in progress
otp after 31s: (none), purged 1
Rejected: conflict on 'stock': it changed after this transaction read it
stock=4, s1 depth after failed commit 0
counter after 8 x 1000 transactional increments: 8000
```

## Edge cases

- **Delete inside a transaction of a committed key** → the tombstone hides it until commit or rollback.
- **Put then delete then put in nested layers** → the innermost mutation wins.
- **Commit or rollback with no transaction** → `KvException`.
- **Inner commit** → invisible to other sessions until the outermost commit.
- **Conflict** → the whole transaction is discarded; depth returns to 0.
- **Expired key inside a transaction's own writes** → reads as absent too.

## Tests

```java title="KeyValueStoreTest.java" file="KeyValueStoreTest.java" test="KeyValueStoreDemo.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class KeyValueStoreTest {
    private MutableClock clock;
    private KeyValueStore store;
    private Session s;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(Instant.parse("2026-01-01T00:00:00Z"));
        store = new KeyValueStore(clock);
        s = store.session();
    }

    @Test
    void writesOutsideTransactionsCommitImmediately() {
        s.put("k", "v");
        assertEquals(Optional.of("v"), store.session().get("k"));
        s.delete("k");
        assertEquals(Optional.empty(), store.session().get("k"));
    }

    @Test
    void nestedRollbackDiscardsOnlyTheInnermostLayer() {
        s.begin();
        s.put("x", "1");
        s.begin();
        s.put("x", "2");
        s.put("y", "2");
        s.rollback();
        assertEquals(Optional.of("1"), s.get("x"));
        assertEquals(Optional.empty(), s.get("y"));
        s.commit();
        assertEquals(Optional.of("1"), store.session().get("x"));
    }

    @Test
    void uncommittedChangesAreInvisibleToOtherSessions() {
        s.put("k", "old");
        s.begin();
        s.delete("k");
        s.begin();
        s.put("n", "new");
        s.commit();                                              // inner commit only
        Session other = store.session();
        assertEquals(Optional.of("old"), other.get("k"));
        assertEquals(Optional.empty(), other.get("n"));
        s.commit();
        assertEquals(Optional.empty(), other.get("k"));
        assertEquals(Optional.of("new"), other.get("n"));
    }

    @Test
    void ttlCountsFromTheWriteNotTheCommit() {
        s.begin();
        s.put("t", "v", Duration.ofSeconds(10));
        clock.advance(Duration.ofSeconds(8));
        s.commit();
        clock.advance(Duration.ofSeconds(2));
        assertEquals(Optional.empty(), s.get("t"));
    }

    @Test
    void lostUpdateBecomesAConflict() {
        s.put("n", "1");
        Session other = store.session();
        s.begin();
        other.begin();
        s.get("n");
        other.get("n");
        other.put("n", "2");
        other.commit();
        s.put("n", "3");
        assertThrows(ConflictException.class, s::commit);
        assertEquals(0, s.depth());
        assertEquals(Optional.of("2"), s.get("n"));
    }

    @Test
    void misuseIsRejected() {
        assertThrows(KvException.class, s::commit);
        assertThrows(KvException.class, s::rollback);
    }

    @Test
    void concurrentTransactionalIncrementsLoseNothing() throws InterruptedException {
        s.put("c", "0");
        List<Thread> threads = new ArrayList<>();
        for (int t = 0; t < 6; t++) {
            threads.add(new Thread(() -> {
                Session mine = store.session();
                for (int i = 0; i < 500; i++) {
                    while (true) {
                        mine.begin();
                        int v = Integer.parseInt(mine.get("c").orElseThrow());
                        mine.put("c", String.valueOf(v + 1));
                        try { mine.commit(); break; } catch (ConflictException retry) { }
                    }
                }
            }));
        }
        threads.forEach(Thread::start);
        for (Thread th : threads) th.join();
        assertEquals(Optional.of("3000"), s.get("c"));
    }
}
```

## Concurrency

- **Readers in parallel, commits serialised:** `read`/`versionOf` take the read lock; `commit` and `purgeExpired` take the write lock for a short, bounded time (validate + apply).
- **No locks held during a transaction.** That's the point of optimistic concurrency: a slow client can't block others; it can only lose its own commit.
- **Validation and apply are one atomic step** under the write lock — checking versions, releasing the lock, then applying would reintroduce the race.
- **Sessions are single-threaded objects.** Sharing a session between threads would mix their transaction stacks; give each thread its own.
- **Under high contention on one key** (a hot counter), optimistic retries waste work. Offer an atomic `increment(key)` that runs under the write lock, or use pessimistic locks for that key.

## Common mistakes and alternatives

- **Deleting by removing the key from the layer** — the read falls through to the committed value; you need a tombstone.
- **Copying the whole map on `begin`** — O(n) per transaction and O(n) memory per nesting level.
- **Applying inner commits to the store** — other clients see changes that the outer transaction may still roll back.
- **Locking keys on first read and holding them until commit** — correct (pessimistic), but deadlock-prone without ordering and slow with chatty clients.
- **Alternative:** MVCC — keep several versions per key with commit timestamps so each transaction reads a consistent snapshot (snapshot isolation). It's what databases do; the version map here is the first step towards it.

## Follow-up questions

````reveal title="Snapshot reads"
Today a transaction may read `a` before and `b` after another client's commit (read committed). For a consistent snapshot, record the global version at `begin` and keep old versions of each key (a small list per key, newest first); a read returns the newest version not newer than the snapshot. Old versions are garbage-collected when no open transaction can still see them.
````

````reveal title="Durability"
Append each outermost commit's mutations to a write-ahead log (one record per commit, fsynced) before applying them. On restart, replay the log; periodically write a snapshot of `data` and truncate the log. Mutations being commands makes the log format obvious.
````

````reveal title="Count values in a transaction (the classic interview twist)"
`count(value)` must reflect pending changes: keep a committed `Map<String, Integer> valueCounts`, and on read compute committed count + the effect of each layer's mutations on keys it touched (a Put of that value adds one unless the key already had it; a Delete or overwrite removes one). Caching the delta per layer makes it O(layers).
````

## Complexity

- `get`: O(L) for L nested layers + O(1) map lookup.
- `put`/`delete` in a transaction: O(1). Inner `commit`: O(size of the layer). Outermost `commit`: O(keys touched).
- `begin`/`rollback`: O(1).

## Interviewer checklist

- [ ] Layered mutations with tombstones; reads innermost-first
- [ ] Inner commit merges into the parent; rollback drops one layer
- [ ] Isolation: other sessions see only outermost commits
- [ ] TTL with injected time
- [ ] Conflict handling (optimistic versions or locking) and retry
- [ ] Thread-safe store with an atomic validate-and-apply
