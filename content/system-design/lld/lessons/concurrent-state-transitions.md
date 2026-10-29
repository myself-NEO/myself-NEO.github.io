## The most common concurrency bug in LLD problems

[State machines](lesson:state-machines) define which transitions are legal. Concurrency asks a harder question: **what if two transitions are attempted at the same time?**

- Two users hold the same seat → **double booking**.
- Two withdrawals pass the balance check → **double spending**.
- A payment is captured *and* refunded concurrently → **inconsistent state**.
- Two admins edit the same record and the second save silently overwrites the first → **lost update**.

All of these are **check-then-act** races on state: each thread checks "is the transition legal?" against state that another thread changes before it acts.

## Strategy 1: Pessimistic locking

**Lock first, then check and act.** Nobody else can touch the entity while you hold the lock.

```java
synchronized boolean tryHold(String user, Instant now) {
    if (status != AVAILABLE) return false;   // check
    status = HELD;                           // act - atomic with the check
    holder = user;
    return true;
}
```

- **In-memory:** `synchronized` or a `ReentrantLock` per entity (per seat, or per show if a booking spans several seats).
- **Database:** `SELECT ... FOR UPDATE` inside a transaction.
- **Best when:** contention is high (hot seats at sale start), and the critical section is short.

## Strategy 2: Optimistic concurrency (versioning / CAS)

**Don't lock. Read the state with a version, compute the change, then commit only if the version hasn't changed.** If it changed, someone else won: retry or fail.

```text
read  seat (status=AVAILABLE, version=7)
write seat SET status=HELD, version=8 WHERE id=... AND version=7
        → 1 row updated: you won     0 rows updated: conflict → retry / reject
```

In memory, the equivalent is `AtomicReference.compareAndSet` on an **immutable state snapshot**:

```java title="Optimistic transitions with CAS on immutable snapshots" file="OptimisticSeatDemo.java"
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

public class OptimisticSeatDemo {
    public static void main(String[] args) throws InterruptedException {
        OptimisticSeat seat = new OptimisticSeat("A1");
        AtomicInteger winners = new AtomicInteger();
        ExecutorService pool = Executors.newFixedThreadPool(32);
        CountDownLatch go = new CountDownLatch(1);

        for (int i = 0; i < 200; i++) {
            String user = "user-" + i;
            pool.submit(() -> {
                go.await();
                if (seat.tryHold(user)) winners.incrementAndGet();
                return null;
            });
        }
        go.countDown();
        pool.shutdown();
        pool.awaitTermination(30, TimeUnit.SECONDS);

        System.out.println("winners=" + winners.get() + " final=" + seat.snapshot());
        System.out.println("confirm by holder: " + seat.tryConfirm(seat.snapshot().holder()));
        System.out.println("release after booked: " + seat.tryRelease(seat.snapshot().holder()));
    }
}

enum SeatStatus { AVAILABLE, HELD, BOOKED }

/** Immutable snapshot: status, holder and version change together, atomically. */
record SeatState(SeatStatus status, String holder, long version) {
    SeatState next(SeatStatus s, String h) { return new SeatState(s, h, version + 1); }
}

final class OptimisticSeat {
    private final String id;
    private final AtomicReference<SeatState> state = new AtomicReference<>(new SeatState(SeatStatus.AVAILABLE, null, 0));

    OptimisticSeat(String id) { this.id = id; }

    SeatState snapshot() { return state.get(); }

    boolean tryHold(String user) {
        return transition(s -> s.status() == SeatStatus.AVAILABLE, s -> s.next(SeatStatus.HELD, user));
    }

    boolean tryConfirm(String user) {
        return transition(s -> s.status() == SeatStatus.HELD && user.equals(s.holder()), s -> s.next(SeatStatus.BOOKED, user));
    }

    boolean tryRelease(String user) {
        return transition(s -> s.status() == SeatStatus.HELD && user.equals(s.holder()), s -> s.next(SeatStatus.AVAILABLE, null));
    }

    /** Generic optimistic transition: re-check the guard against the latest state on every attempt. */
    private boolean transition(java.util.function.Predicate<SeatState> guard,
                               java.util.function.UnaryOperator<SeatState> change) {
        while (true) {
            SeatState current = state.get();
            if (!guard.test(current)) return false;                         // illegal now: give up
            if (state.compareAndSet(current, change.apply(current))) return true;
            // someone else changed the state between our read and our write: retry with fresh state
        }
    }
}
```

Exactly one of the 200 threads wins, every time, without any locks.

- **Best when:** contention is low to moderate, reads dominate, or you can't hold locks (across a network round trip, or a user "think time").
- **Watch out for:** retry storms under heavy contention; it only works if *all* state that the guard depends on is in the compared snapshot.

## Strategy 3: Serialise per entity (single writer)

Route every command for an entity to **one thread** (or one queue partition) that applies them in order. No locks are needed inside the entity. This is how actor systems and many high-throughput booking engines work; [Pub/Sub](problem:pub-sub)-style partitioning by key is the distributed version.

## Multi-entity transitions

Booking **seats A1, A2 and A3 together** must be all-or-nothing. Options:

1. **Lock at the aggregate** — one lock per show covers all its seats. Simple, and contention is limited to one show.
2. **Lock each seat in a global order** (sorted by seat ID) to avoid deadlocks, then check all, then change all.
3. **Optimistic per seat with compensation** — hold seats one by one; if any fails, release those already held.

```java
synchronized List<SeatId> holdAll(List<SeatId> wanted, String user) {      // lock: the Show
    for (SeatId id : wanted) if (!seats.get(id).isAvailable()) throw new SeatUnavailableException(id);
    for (SeatId id : wanted) seats.get(id).hold(user);                      // all or nothing
    return wanted;
}
```

## Expiry races

Holds expire. What if a hold expires at the same moment the user confirms? Make **expiry a transition like any other**, guarded by the same lock or CAS, and make the guard time-aware: confirm succeeds only if `now < holdUntil` *at the moment of the atomic check*. Then exactly one of "confirm" and "expire" wins, deterministically.

## Lost updates in read-modify-write APIs

A classic web bug: client A reads profile v7, client B reads v7, A saves, B saves and overwrites A's change. The fix is **optimistic concurrency at the API level**: clients send the version they read (`If-Match: "7"`), and the server rejects stale writes with a 409 or 412 status.

## Choosing a strategy

| Situation | Choose |
|---|---|
| Short critical section, in-memory, moderate contention | Pessimistic lock per aggregate |
| Single-field or snapshot state, high read ratio | Optimistic CAS / versioning |
| State held across user think time or a network call | Optimistic version check at commit |
| Extreme throughput, strict per-entity ordering | Single writer per entity or partition |
| Multiple entities in one transition | Aggregate-level lock, or ordered locks |

## Real-world example

A ride-hailing service let several drivers "accept" the same ride request. Each acceptance checked `ride.status == REQUESTED` and then set `DRIVER_ASSIGNED`. Under load, two drivers occasionally drove to the same rider. The fix was a single conditional update — `UPDATE rides SET status='ASSIGNED', driver=? WHERE id=? AND status='REQUESTED'` — and treating "0 rows updated" as "someone else got it". That's an optimistic transition. See [Ride-Sharing](problem:ride-sharing).

## Common mistakes

- **Guard checked outside the lock**, or against a stale snapshot.
- **CAS on one field while the guard reads another** (the status is CAS'd, but the holder is a separate field).
- **Lock per seat for multi-seat bookings without ordering** → deadlocks.
- **Ignoring expiry** as a concurrent transition.
- **Retrying forever** under heavy contention. Bound the retries, or switch to a pessimistic lock for hot entities.

## In the interview

> [!INTERVIEW] Show you know both options
> *"Seat holds need check-then-act to be atomic. In memory, I'll lock per show, because a booking spans multiple seats of one show. If seats lived in a database, I'd use a conditional update — `WHERE status='AVAILABLE'` — and treat zero rows updated as a lost race. Expiry is just another transition under the same lock, so confirm-versus-expire can't both win."*

## Key takeaways

- Concurrent transitions are **check-then-act** races; make check and act **atomic**.
- **Pessimistic** (lock, then check), **optimistic** (version or CAS, then retry) and **single-writer** are the three strategies.
- Keep all guard-relevant state in **one atomic unit** (one lock or one snapshot).
- Multi-entity transitions need **aggregate locks** or **ordered locking**; treat **expiry** as a transition.

## Knowledge check

```quiz
? 200 threads try to hold the same available seat using a CAS loop on an immutable state snapshot. How many succeed?
+ Exactly one
- Up to 200
- Zero, because CAS fails under contention
> Only one compareAndSet from AVAILABLE can succeed; the others re-check the guard and see HELD.

? A user's hold expires at the same moment they click "confirm". How do you avoid both succeeding?
+ Model expiry as a transition guarded by the same lock or CAS, with a time-aware guard on confirm
- Use a longer timeout
- Run the expiry job more often
> One atomic decision point means exactly one transition wins.

? When is optimistic concurrency a better fit than pessimistic locking?
+ When contention is low or state is held across user think time, so you can't keep a lock open
- When contention on a single hot item is extreme
- Never
> Optimistic checks at commit avoid holding locks for long periods.
```

## Exercise

A **wallet** supports `debit(amount)` and `credit(amount)`, and a **transfer** between two wallets must be atomic. Implement it twice:

1. With pessimistic locks — avoid deadlock when A→B and B→A transfers happen concurrently.
2. With optimistic CAS on an immutable `WalletState(balance, version)` for a single wallet's debit, retrying on conflict.

Then explain why the optimistic approach is harder for transfers.

````hint title="Hint"
For (1), lock the two wallets in a consistent order, such as by wallet ID. For (2), a transfer touches two independent atomic references. What happens if the debit succeeds and then the credit's CAS keeps failing — or the process crashes in between?
````

````solution title="Sample answer"
```java
// 1. Pessimistic with lock ordering
void transfer(Wallet from, Wallet to, long amount) {
    Wallet first = from.id().compareTo(to.id()) < 0 ? from : to;
    Wallet second = first == from ? to : from;
    synchronized (first) {
        synchronized (second) {
            if (from.balance < amount) throw new InsufficientFundsException();
            from.balance -= amount;
            to.balance += amount;
        }
    }
}

// 2. Optimistic debit on one wallet
record WalletState(long balance, long version) {}
boolean tryDebit(AtomicReference<WalletState> ref, long amount) {
    while (true) {
        WalletState s = ref.get();
        if (s.balance() < amount) return false;
        if (ref.compareAndSet(s, new WalletState(s.balance() - amount, s.version() + 1))) return true;
    }
}
```

**Why optimistic transfers are harder:** a transfer is an invariant across two objects (total money conserved). Two independent CAS operations aren't atomic together. Between the debit and the credit, another thread (or a crash) can observe or leave money "in flight". You'd need a combined snapshot of both wallets under one reference, a transaction log with compensation, or a ledger design where a transfer is a single immutable entry. Pessimistic locking of both wallets in a consistent order is the simplest correct in-memory answer.
````
