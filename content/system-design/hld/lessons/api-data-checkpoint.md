Thirteen questions across every Stage 3 lesson: API semantics, retries, versioning, security, store choice, schema flaws, indexes,
transactions and partitioning. Several give you a design and ask you to find the flaw — the most common form these topics take in an
interview. Each answer explains why the other options are wrong.

## How to use this checkpoint

- Answer each question **before** looking at the options when you can, and say your reasoning out loud.
- A wrong first answer is recorded as a mistake in your [revision notebook](#system-design/hld/notebook), with the explanation.
- If you miss two or more questions on the same topic, reread the lesson listed under *Where to review* before Stage 4.

## Questions

```quiz
? True or false: retrying a `PUT /courses/42` with the same body after a timeout is safe.
+ True
- False
! PUT replaces the resource with the given representation; repeating it leaves the same state.
> PUT and DELETE are idempotent by definition; POST is not.

? Find the flaw: "`POST /payments` creates a payment. If the client times out, it retries with a freshly generated Idempotency-Key."
- POST should be PUT
! POST is fine for creating payments when paired with idempotency keys.
+ A new key per retry makes each attempt look like a new payment; the key must be generated once per logical payment
- Idempotency keys only work with GET
! They're designed for non-idempotent methods like POST.
- The server should return 500 on retries
! Retries are legitimate and must be handled.
> The key identifies the operation, so every attempt must reuse it.

? A mobile app's infinite feed uses `?offset=` and users report duplicate posts while scrolling. What should change?
- Increase the page size
! Duplicates come from shifting offsets, not page size.
+ Switch to cursor (keyset) pagination on (created_at, id)
- Add `COUNT(*)` to every response
! Counting doesn't stop rows shifting.
- Cache each page for an hour
! Users would see stale feeds and still get shifts between cache entries.
> Keyset cursors are stable when new rows arrive at the top.

? Which change is breaking for existing API clients?
- Adding a new endpoint
! Existing clients don't call it.
- Adding a response field
! Tolerant readers ignore unknown fields.
+ Changing `amount` from an integer in paise to a decimal string in rupees
- Adding an optional query parameter
! Existing requests remain valid.
> Type, unit and meaning changes break clients even when the name stays the same.

? Find the flaw: "Our services trust the `X-User-Id` header for authorization because only the gateway sets it."
+ Any compromised or misconfigured internal caller can set the header and impersonate users; propagate a signed token or use mTLS
- Headers can't carry user IDs
! They can; the issue is trust.
- The gateway should not authenticate users
! Authenticating at the gateway is good practice.
- Authorization should happen in the CDN
! CDNs don't know resource permissions.
> Internal identity must be verifiable, not just asserted.

? A webhook receiver occasionally applies the same `invoice.paid` event twice. What should it do?
- Ask the sender for exactly-once delivery
! Webhook delivery is at least once by design.
+ Record processed event IDs and skip events already handled
- Return 500 for every second delivery
! That triggers more retries.
- Process events synchronously before responding
! That makes timeouts — and duplicates — more likely.
> Idempotent receivers turn at-least-once delivery into effectively-once processing.

? Store choice: a feature needs atomic transfers of credits between users plus unique usernames, at 2,000 writes per second. What fits best?
+ PostgreSQL (or another relational database) with transactions and unique constraints
- A key-value cache only
! Caches aren't a durable system of record and lack multi-row transactions.
- A search engine
! Search engines aren't transactional stores.
- A wide-column store with eventual consistency
! Atomic transfers and uniqueness are much harder there, and the write rate doesn't require it.
> The requirements are transactional and the scale fits one primary.

? Find the flaw in this schema: `enrollments(user_id, course_id, course_title, enrolled_at)` with primary key `(user_id, course_id)`.
- The primary key should be a UUID
! A composite key is right for a join table.
+ `course_title` depends only on `course_id`, so it is duplicated per enrolment and can drift (a 2NF violation)
- `enrolled_at` should be in the courses table
! It describes the enrolment, so it belongs here.
- There should be no primary key
! Without one, duplicate enrolments are possible.
> Store each fact once; denormalise deliberately with a sync plan, not by accident.

? An index exists on `(course_id, created_at)`. Which query cannot use it efficiently (ignoring PostgreSQL 18's skip scan)?
- `WHERE course_id = 5 ORDER BY created_at DESC LIMIT 20`
! That is exactly the shape the index serves.
- `WHERE course_id = 5 AND created_at > now() - interval '7 days'`
! Equality then range on the next column — ideal.
+ `WHERE created_at > now() - interval '7 days'`
- `WHERE course_id = 5`
! The leading column alone is served.
> Composite indexes follow the leftmost-prefix rule.

? Bottleneck: a product page runs 1 query for 40 products, then 40 queries for their sellers. Latency is high, database CPU is moderate. What is the fix?
- Add read replicas
! The issue is round trips and query count, not capacity.
+ Batch the seller lookups into one query (a join or `WHERE id = ANY(...)`)
- Increase the connection pool size
! More connections don't remove 40 sequential round trips.
- Shard the sellers table
! Sharding adds complexity without fixing the N+1 pattern.
> N+1 patterns multiply round trips; batch them.

? Two requests run `SELECT seats_taken` (29 of 30), then each writes `seats_taken = 30` and inserts a booking. What prevents the oversell?
- Switching to read uncommitted
! That is weaker isolation, not stronger.
+ An atomic `UPDATE … SET seats_taken = seats_taken + 1 WHERE seats_taken < capacity`, treating 0 rows as sold out
- Adding an index on seats_taken
! Indexes don't serialise concurrent updates.
- Retrying both requests
! Both would succeed again.
> Let the database check and change the row in one atomic step.

? A table receives every write under today's date because it is partitioned by `date`. What is the best redesign?
- Partition by `status`
! Low cardinality and uneven load.
+ Partition by a high-cardinality key such as `device_id` (with a time bucket), keeping time as the sort key
- Remove partitioning entirely
! The table still needs to scale and expire data.
- Partition by `year`
! Even worse: one partition for the whole year's writes.
> Spread writes across many keys; use time for ordering and bucketing.

? Retention: you must keep 30 days of events in a large PostgreSQL table. What is the cheapest way to remove old data daily?
- `DELETE FROM events WHERE occurred_at < now() - interval '30 days'` every night
! Mass deletes cause heavy I/O, bloat and replica lag on large tables.
+ Range-partition by day and detach/drop the oldest partition each day
- Truncate the whole table monthly
! That deletes recent data too.
- Keep everything and filter in queries
! The table grows without bound.
> Dropping a partition is a metadata operation.
```

## Where to review

| If you missed questions about… | Reread |
|---|---|
| Methods, status codes, resource design | [REST API design](lesson:rest-api-design) |
| Offset vs cursor pagination | [Pagination, filtering & sorting](lesson:pagination) |
| Breaking changes, deprecation | [API versioning & backward compatibility](lesson:api-evolution) |
| Idempotency keys, ETags | [Idempotency & safe retries](lesson:idempotent-apis) |
| Tokens, sessions, internal identity | [Authentication & authorization](lesson:auth) |
| Error formats, layered validation | [Request validation & error responses](lesson:validation-errors) |
| Signing, retries, idempotent receivers | [Webhook design](lesson:webhooks) |
| Choosing a store | [Relational vs NoSQL](lesson:sql-vs-nosql) |
| Keys, relationships, joins | [Relational modeling](lesson:relational-modeling) |
| Normal forms, denormalisation | [Normalization & denormalization](lesson:normalization) |
| Composite and covering indexes | [Database indexing](lesson:indexing) |
| Plans, N+1, sargable predicates | [Query optimization](lesson:query-optimization) |
| Isolation, lost updates, locking | [Transactions, ACID & isolation levels](lesson:transactions) |
| Replicas, partitioning vs sharding | [Pools, replicas, partitions & shards](lesson:scaling-data-overview) |
| Hot partitions, retention | [Partition keys, hot partitions & retention](lesson:partition-keys-retention) |

When you're comfortable with these, continue to Stage 4, [Capacity Estimation](lesson:estimation-basics) — or apply Stages 1–3 now in the
[URL shortener](problem:url-shortener) breakdown and mock interview.
