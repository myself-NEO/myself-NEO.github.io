A transaction groups several reads and writes into one unit that either happens completely or not at all, and that behaves
sensibly when other transactions run at the same time. "Sensibly" turns out to have several levels — and the anomalies each level
allows are behind many real bugs: double bookings, lost updates, overdrawn balances.

## Why it matters

Any design involving scarce resources or money — seats, inventory, balances, unique usernames — depends on getting concurrency right.
Interviewers probe it with questions like "two users click Book on the last seat at the same moment; what happens?" You need to explain
what the database guarantees, which isolation level or locking strategy you would use, and what it costs.

## How it works

### ACID, precisely

- **Atomicity:** all of a transaction's changes commit, or none do. A crash halfway through leaves nothing half-applied.
- **Consistency:** the transaction moves the database from one valid state to another — valid meaning *your* constraints (keys, foreign
  keys, checks) hold. The database enforces declared constraints; the rest is the application's job.
- **Isolation:** concurrent transactions don't see each other's partial work, to a degree set by the **isolation level**.
- **Durability:** once committed, changes survive crashes — typically because the commit is written to a write-ahead log on disk (and
  often to replicas) before it is acknowledged.

### The anomalies

| Anomaly | What happens | Example |
|---|---|---|
| **Dirty read** | Reading another transaction's uncommitted changes | Seeing a transfer that later rolls back |
| **Non-repeatable read** | Reading the same row twice gives different values | Balance changes between two reads in one report |
| **Phantom read** | Re-running a query returns new rows | A count of bookings changes mid-transaction |
| **Lost update** | Two read-modify-write cycles overwrite each other | Two clerks both read stock = 5, both write 4 |
| **Write skew** | Two transactions read overlapping data, write different rows, and together break a rule | Two on-call doctors each see the other on call and both go off call |

### Isolation levels

The SQL standard defines four levels by which anomalies they forbid. PostgreSQL's documentation summarises its behaviour:

| Level | Dirty read | Non-repeatable read | Phantom read | Serialization anomaly |
|---|---|---|---|---|
| Read uncommitted | Allowed, but not in PostgreSQL | Possible | Possible | Possible |
| Read committed (PostgreSQL default) | Not possible | Possible | Possible | Possible |
| Repeatable read | Not possible | Not possible | Allowed, but not in PostgreSQL | Possible |
| Serializable | Not possible | Not possible | Not possible | Not possible |

Defaults differ: PostgreSQL uses **read committed**; MySQL's InnoDB uses **repeatable read**. Under PostgreSQL's serializable level,
transactions that would produce an anomaly fail with SQLSTATE `40001` (serialization failure), and the application must **retry the whole
transaction**.

### How databases implement isolation

- **Locking:** readers and writers take locks; conflicting transactions wait. Simple to reason about, but contention and deadlocks grow
  with concurrency.
- **MVCC (multi-version concurrency control):** each write creates a new row version; each transaction reads a consistent **snapshot**, so
  readers never block writers and writers never block readers. PostgreSQL, MySQL InnoDB and Oracle all use MVCC; write–write conflicts
  still need locks or conflict detection.

### Concurrency control for a contended row

Example: a workshop with limited seats.

```sql
CREATE TABLE workshops (
  id           bigint PRIMARY KEY,
  capacity     integer NOT NULL,
  seats_taken  integer NOT NULL DEFAULT 0 CHECK (seats_taken <= capacity),
  version      integer NOT NULL DEFAULT 1
);
CREATE TABLE bookings (
  workshop_id  bigint NOT NULL REFERENCES workshops (id),
  user_id      bigint NOT NULL,
  PRIMARY KEY (workshop_id, user_id)
);
INSERT INTO workshops (id, capacity, seats_taken) VALUES (1, 30, 28);   -- two seats left
```

**Option 1 — atomic conditional update.** Let one statement check and change the row; the database serialises concurrent updates on that
row, and the condition is re-evaluated for the second one:

```sql
BEGIN;
UPDATE workshops SET seats_taken = seats_taken + 1
WHERE id = 1 AND seats_taken < capacity;     -- 1 row updated = seat reserved; 0 rows = sold out
INSERT INTO bookings (workshop_id, user_id) VALUES (1, 7);
COMMIT;
```

Simple, fast and correct for counters. The `CHECK` constraint is a second safety net.

**Option 2 — pessimistic locking.** Lock the row while deciding, when the decision needs more logic than one statement can express:

```sql
BEGIN;
SELECT capacity, seats_taken FROM workshops WHERE id = 1 FOR UPDATE;   -- others wait here
-- application checks waitlists, promotions, user eligibility...
UPDATE workshops SET seats_taken = seats_taken + 1 WHERE id = 1;
INSERT INTO bookings (workshop_id, user_id) VALUES (1, 8);
COMMIT;
```

Correct and easy to reason about; under heavy contention, transactions queue on the lock, so keep the locked section short and never make
network calls inside it.

**Option 3 — optimistic concurrency.** Read without locking, then write only if nothing changed, detected by a version column:

```sql
-- Read: SELECT seats_taken, version FROM workshops WHERE id = 1;  (say version = 1)
UPDATE workshops
SET seats_taken = seats_taken + 1, version = version + 1
WHERE id = $1 AND version = $2;    -- 0 rows updated: someone else won; re-read and retry
```

No waiting, great when conflicts are rare (editing a profile, updating a document with [ETags](lesson:idempotent-apis)); wasteful when
conflicts are common, because losers retry repeatedly.

**Option 4 — serializable isolation.** Let the database detect any anomaly, including write skew, and retry on `40001`. The most general
protection; costs some throughput and requires retry logic everywhere.

### Write skew, and why row locks miss it

Two doctors are on call; the rule is "at least one must remain on call". Each transaction checks "is anyone else on call?" (yes), then sets
*its own* row to off call. They write **different rows**, so no row conflict is detected under read committed or repeatable read — and both
go off call. Fixes: `SERIALIZABLE`, explicitly locking the rows read (`SELECT … FOR UPDATE` on all on-call rows), or materialising the
rule into a single row both must update (a counter of on-call doctors with a `CHECK`).

## Architecture

```mermaid title="Lost update without protection vs atomic conditional update"
sequenceDiagram
  participant A as Request A
  participant DB as Database
  participant B as Request B
  Note over A,B: Read-modify-write in the application (unsafe)
  A->>DB: SELECT seats_taken (29)
  B->>DB: SELECT seats_taken (29)
  A->>DB: UPDATE seats_taken = 30
  B->>DB: UPDATE seats_taken = 30
  Note over A,B: Two bookings, one seat counted: oversold
  Note over A,B: Conditional update (safe)
  A->>DB: UPDATE ... WHERE seats_taken < capacity (1 row)
  B->>DB: UPDATE ... WHERE seats_taken < capacity
  DB->>B: waits for A, re-checks: 0 rows, sold out
```

## Failure scenarios

- **Check-then-act in application code** under read committed: two requests both see availability and both book.
- **Long transactions holding locks** while calling an external service; everything behind them queues, connection pools exhaust, latency
  explodes.
- **Deadlocks:** two transactions lock rows in opposite orders; the database aborts one. Lock in a consistent order and retry on deadlock
  errors.
- **Unretried serialization failures** surface as user-facing errors at serializable or repeatable read; wrap transactions in retry logic.
- **Assuming the default is serializable.** Most databases default to weaker levels; check before relying on stronger guarantees.

## Trade-offs

| Approach | Best when | Cost |
|---|---|---|
| Atomic conditional update | The rule fits in one statement (counters, state transitions) | Limited expressiveness |
| Pessimistic `SELECT … FOR UPDATE` | High contention, complex decision logic | Waiting, deadlock risk, lower throughput |
| Optimistic version check | Low contention (edits, settings) | Retries and wasted work under contention |
| Serializable isolation | Complex invariants spanning rows; write skew risk | Serialization failures to retry; some overhead |

Transactions are also scoped to **one database**. Across services or shards you need different tools — sagas, outboxes and idempotency —
covered in [distributed transactions](lesson:distributed-transactions).

## In real systems

- PostgreSQL implements serializable isolation with Serializable Snapshot Isolation (SSI), which detects dangerous patterns of
  read/write dependencies and aborts one transaction.
- MySQL InnoDB's repeatable read uses next-key locks to prevent many phantoms for locking reads.
- JPA/Hibernate supports optimistic locking with a `@Version` field and pessimistic locking with lock modes; Spring's `@Transactional`
  sets isolation and propagation per method.
- Ticketing and booking systems commonly combine short seat holds (with expiry) with atomic conditional updates — see
  [contention](lesson:contention).

## Common mistakes

- **Read-modify-write in the application** without locks, versions or conditional updates.
- **Calling external services inside a transaction.**
- **Not retrying** serialization failures and deadlocks.
- **Believing row locks prevent write skew.**
- **Using one huge transaction** for a batch job, holding locks for minutes.

## In the interview

````question title="Two users try to book the last seat at the same moment. How do you prevent overbooking?"
Make the check and the change one atomic operation in the database. The simplest is a conditional update — UPDATE workshops SET
seats_taken = seats_taken + 1 WHERE id = ? AND seats_taken < capacity — and treat zero rows updated as sold out; the database serialises
the two updates on the row and re-checks the condition for the second. A CHECK constraint backs it up, and a unique key on bookings stops
duplicates. If the decision needs more logic, I'd lock the row with SELECT … FOR UPDATE in a short transaction with no network calls
inside. For very high contention, such as a big on-sale event, I'd add a queue or short-lived seat holds in front, but the database
condition remains the final guard.
````

````question title="What isolation level would you use, and what is write skew?"
I'd keep the database default, read committed in PostgreSQL, for most work and protect specific invariants explicitly with conditional
updates, row locks or version checks. Write skew is when two transactions read the same data, make decisions based on it, and write
different rows, together violating a rule — like two doctors each seeing the other on call and both going off call. Row-level conflict
detection misses it because the written rows differ. Serializable isolation catches it and aborts one transaction, which the application
retries; alternatively, lock all the rows the rule depends on or move the rule into a single row both transactions must update.
````

## Key takeaways

- **ACID**: all-or-nothing, constraints hold, isolation between concurrent work, durable commits.
- Weaker isolation levels allow **non-repeatable reads, phantoms, lost updates and write skew**; PostgreSQL defaults to **read committed**.
- Protect contended rows with **atomic conditional updates**, **pessimistic locks** or **optimistic versions**; use **serializable** for
  multi-row invariants — and **retry** on serialization failures.
- Keep transactions **short**; never hold locks across network calls.

## Knowledge check

```quiz
? Under PostgreSQL's default isolation level, which anomaly can still occur?
- Dirty reads
! PostgreSQL never allows dirty reads.
+ Non-repeatable reads
- Reading data from a transaction that later rolls back
! That is a dirty read, which PostgreSQL prevents.
- Losing committed data after a crash
! That is about durability, not isolation.
> Read committed gives each statement a fresh snapshot, so a value can change between two reads.

? Two requests read `stock = 5`, each computes 4 in the application and writes it back. What is this anomaly, and the simplest fix?
+ A lost update; use `UPDATE … SET stock = stock - 1 WHERE stock > 0` so the database does the arithmetic atomically
- A dirty read; switch to read uncommitted
! Read uncommitted is weaker, and this isn't a dirty read.
- A phantom read; add an index
! No new rows appear; indexes don't fix races.
- Write skew; nothing can fix it
! It's a lost update, and it is easily fixed.
> Moving the read-modify-write into one atomic statement removes the race.

? Which approach is best for user profile edits, where two people rarely edit the same profile at once?
- `SELECT … FOR UPDATE` held while the user edits in the browser
! Holding database locks during human think-time blocks others and leaks locks.
+ Optimistic concurrency with a version column (or ETag) and a conflict response
- Serializable isolation for every request
! Overkill for rare conflicts.
- No protection
! Silent lost updates would still occur occasionally.
> Optimistic checks cost nothing when conflicts are rare and detect them when they happen.

? A transaction at SERIALIZABLE fails with SQLSTATE 40001. What should the application do?
- Show an error to the user immediately
! The failure is expected under concurrency and usually succeeds on retry.
+ Roll back and retry the whole transaction, with a limit and backoff
- Retry only the last statement
! The whole transaction's reads may be stale; it must restart.
- Lower the isolation level for that transaction permanently
! That may reintroduce the anomaly the level prevents.
> Serialization failures are part of the contract: retry the entire transaction.
```
