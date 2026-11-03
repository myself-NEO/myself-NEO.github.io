Normalisation stores each fact once, so it can't disagree with itself. Denormalisation deliberately stores some facts more
than once, so reads don't have to assemble them. Good designs normalise the system of record and denormalise selectively for hot
read paths — and always say how the copies stay in sync.

## Why it matters

Read-heavy systems — feeds, product pages, dashboards — often can't afford to join five tables or aggregate millions of rows on every
request. Interviewers expect you to precompute: store a review count on the course, keep a materialised timeline, copy the author's name
onto a post. But every copy is a consistency problem. The skill being tested is choosing **what** to duplicate and **how** to keep it
correct.

## How it works

### Anomalies: why normalise

Imagine one wide table holding everything about enrolments:

| user_email | user_name | course_title | instructor_name | instructor_email | enrolled_at |
|---|---|---|---|---|---|
| ravi@example.com | Ravi | Databases 101 | Asha | asha@example.com | 2026-02-01 |
| mei@example.com | Mei | Databases 101 | Asha | asha@example.com | 2026-02-03 |
| mei@example.com | Mei | Distributed Systems | Asha | asha@example.com | 2026-02-09 |

- **Update anomaly:** Asha changes her email; it must be changed in every row, and missing one leaves the data contradicting itself.
- **Insertion anomaly:** a new course with no enrolments can't be recorded without inventing a fake enrolment.
- **Deletion anomaly:** if the last student leaves "Distributed Systems", deleting the row erases the fact that the course exists.

### The normal forms in one paragraph each

- **First normal form (1NF):** each column holds one atomic value — no comma-separated lists or repeating groups (`course_ids =
  '1,5,9'`). Lists become rows in a child table.
- **Second normal form (2NF):** in a table with a composite key, every non-key column depends on the **whole** key. In
  `enrollments(user_id, course_id, course_title)`, `course_title` depends only on `course_id`, so it belongs in `courses`.
- **Third normal form (3NF):** non-key columns depend on the key and **nothing else** — no column determined by another non-key column.
  `courses(id, instructor_id, instructor_email)` violates it because `instructor_email` depends on `instructor_id`.

The memorable summary: every non-key column depends on **the key, the whole key and nothing but the key**. Boyce–Codd normal form (BCNF)
tightens 3NF for some multi-key edge cases; in interviews, "normalised to 3NF" is the expected level.

The normalised version is the schema from [relational modeling](lesson:relational-modeling): `users`, `courses`, `lessons`,
`enrollments`, each fact in one place.

### Denormalisation: buying read speed

Denormalising means storing derived or duplicated data to avoid work at read time:

| Technique | Example | Kept in sync by |
|---|---|---|
| Precomputed aggregate | `courses.review_count`, `rating_sum` | Updating in the same transaction as the review insert |
| Duplicated column | `posts.author_name` copied from `users` | An event when the user renames (or accept staleness) |
| Materialised view | Per-course rating summary | `REFRESH MATERIALIZED VIEW` on a schedule |
| Read model / projection | A per-user "my courses" document with titles and progress | Consuming change events (CQRS) |
| Fan-out on write | Each follower's timeline stores post IDs | Workers writing on every post (see [fan-out](lesson:fan-out)) |

### Keeping copies correct

Ordered from strongest to weakest consistency:

1. **Same transaction.** Update the copy in the transaction that changes the source. Always consistent; only possible when both live in the
   same database, and it adds write work and contention on hot rows.
2. **Database triggers.** The database updates the copy automatically. Consistent, but logic hides in the database and can surprise
   developers.
3. **Events or change data capture.** The source change emits an event; a consumer updates the copy. Scales across services and stores;
   the copy is **eventually consistent** and needs idempotent, ordered (per key) processing. See [outbox and CDC](lesson:outbox-cdc).
4. **Periodic recomputation.** A job rebuilds the copy every few minutes or nightly. Simple and self-healing; stale between runs.

A robust pattern combines them: update incrementally for freshness, and **recompute periodically** to correct any drift.

### A worked example

Course pages show "4.6 ★ from 12,408 reviews". Computing that with `AVG` over every review on each page view is wasteful. Store the count
and sum on the course, updated in the review's transaction:

```sql
CREATE TABLE courses (
  id            bigint PRIMARY KEY,
  title         text NOT NULL,
  review_count  integer NOT NULL DEFAULT 0,
  rating_sum    integer NOT NULL DEFAULT 0
);
CREATE TABLE reviews (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id  bigint NOT NULL REFERENCES courses (id),
  user_id    bigint NOT NULL,
  rating     smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  UNIQUE (course_id, user_id)
);
INSERT INTO courses (id, title) VALUES (42, 'Databases 101');
```

```sql
-- Insert the review and update the denormalised totals atomically.
BEGIN;
INSERT INTO reviews (course_id, user_id, rating) VALUES (42, 7, 5);
UPDATE courses
SET review_count = review_count + 1,
    rating_sum   = rating_sum + 5
WHERE id = 42;
COMMIT;

-- The page reads one row: no aggregation over reviews.
SELECT title, review_count, round(rating_sum::numeric / NULLIF(review_count, 0), 1) AS avg_rating
FROM courses WHERE id = 42;
```

Storing the **sum and count** rather than the average lets you add or remove one review without rereading the others. On a very popular
course every review now updates the same row, which can become a contention hotspot; batching the counter updates asynchronously (or
sharding the counter) trades a little freshness for throughput.

For reporting views that may lag, a materialised view keeps the logic declarative:

```sql
CREATE MATERIALIZED VIEW course_rating_summary AS
SELECT course_id, count(*) AS reviews, round(avg(rating), 2) AS avg_rating
FROM reviews
GROUP BY course_id;

CREATE UNIQUE INDEX ON course_rating_summary (course_id);

-- Rebuild without blocking readers (requires the unique index above).
REFRESH MATERIALIZED VIEW CONCURRENTLY course_rating_summary;
```

## Architecture

```mermaid title="A normalised source of truth with denormalised read paths"
flowchart TB
  W[Write API]:::svc -->|"transaction: review + counters"| PG[("PostgreSQL<br/>normalised tables + counters")]:::db
  PG -->|"change data capture"| BUS[(Event stream)]:::queue
  BUS --> P1["Projector: my-courses documents"]:::svc
  BUS --> P2["Projector: search index"]:::svc
  P1 --> RM[(Read model store)]:::db
  P2 --> SI[(Search index)]:::store
  J["Nightly job:<br/>recompute counters"]:::svc -.->|"fix drift"| PG
  R[Read API]:::svc --> PG
  R --> RM
  R --> SI
```

## Failure scenarios

- **Drift.** A bug or a failed event leaves `review_count` wrong forever unless something recomputes it. Schedule reconciliation.
- **Lost or reordered events** update read models incorrectly; consumers need idempotency and per-key ordering, and the ability to rebuild
  from the source.
- **Hot rows.** Denormalised counters on popular entities serialise writes on one row; batch or shard them.
- **Write amplification.** Copying an author's name into 10 million posts means a rename touches 10 million rows. Duplicate only data that
  rarely changes, or tolerate staleness.
- **Stale reads after writes.** A user writes a review and the page (served from an asynchronously updated read model) doesn't show it yet;
  read the user's own writes from the source.

## Trade-offs

| | Normalised | Denormalised |
|---|---|---|
| Correctness | Each fact once; no contradictions | Copies can drift |
| Writes | One place to update | Several places; more write work |
| Reads | Joins and aggregates at read time | Single lookups; fast |
| Flexibility | New queries without new structures | Each read path designed in advance |
| Storage | Minimal | Duplicated data |

Normalise by default; denormalise where a measured or estimated read path demands it; document the sync mechanism and the staleness it
allows.

## In real systems

- Social feeds store precomputed timelines (fan-out on write) rather than joining follows and posts per request.
- E-commerce product pages show precomputed rating summaries and stock indicators, refreshed incrementally.
- Data warehouses deliberately denormalise into star schemas (wide fact tables plus dimension tables) because analytical reads dominate.
- CQRS architectures maintain separate read models projected from the write side's events.

## Common mistakes

- **Denormalising everything up front** "for performance" without a read path that needs it.
- **No sync story** — duplicated data with no update mechanism.
- **Storing averages instead of sums and counts**, making incremental updates impossible.
- **Duplicating frequently changing data** into many rows.
- **Forgetting reconciliation** for eventually consistent copies.

## In the interview

````question title="The course page needs the average rating and review count on every view. How do you make that fast?"
Precompute it. I'd keep review_count and rating_sum columns on the course and update them in the same transaction that inserts or deletes
a review, so the page reads a single row and the average is sum divided by count. If a very popular course makes that row a write
hotspot, I'd buffer increments and apply them in batches, accepting a few seconds of staleness, and run a periodic job that recomputes
the totals from the reviews table to correct any drift. The page can also be cached, since a slightly stale rating is fine.
````

````question title="When would you denormalise, and how do you keep the copies consistent?"
When a hot read path would otherwise need expensive joins or aggregates, and the duplicated data changes rarely or can tolerate brief
staleness. To keep copies consistent: update them in the same transaction when they live in the same database; otherwise publish change
events through an outbox or CDC and update them with idempotent consumers, accepting eventual consistency; and always run periodic
reconciliation that recomputes from the source of truth. Users should read their own recent writes from the source so they don't see
their change missing.
````

## Key takeaways

- **Normalise** (to 3NF) so each fact lives once: no update, insertion or deletion anomalies.
- **Denormalise deliberately** for hot reads: counters, duplicated columns, materialised views, read models, fan-out.
- Every copy needs a **sync mechanism** — same transaction, trigger, events/CDC or periodic recompute — and usually **reconciliation**.
- Store **sums and counts**, not averages; beware **hot rows** and **write amplification**.

## Knowledge check

```quiz
? An `enrollments` table includes `course_title`. Which normal form does this violate, and why?
- 1NF, because titles contain spaces
! Spaces don't make a value non-atomic.
+ 2NF, because `course_title` depends only on `course_id`, part of the composite key
- 3NF, because titles are text
! Data type is irrelevant to normal forms.
- None; it is fully normalised
! The title would be repeated for every enrolment and could disagree.
> A non-key column must depend on the whole key; the title belongs in `courses`.

? Why store `rating_sum` and `review_count` instead of `avg_rating` on the course?
+ A new or deleted review can update sum and count directly; an average alone can't be adjusted without recounting
- Averages can't be stored in databases
! They can; they just can't be maintained incrementally.
- It uses less storage
! It uses slightly more.
- It avoids needing a reviews table
! The reviews table is still the source of truth.
> Sums and counts are incrementally maintainable; the average is derived at read time.

? A "my courses" read model is updated from change events and sometimes lacks a course the user just enrolled in. What is the best fix?
- Delete the read model
! It exists for read performance.
+ Serve the user's own just-written data from the source of truth (or wait for the event), and keep the read model eventually consistent
- Make the event consumer non-idempotent
! That causes duplicates without fixing the delay.
- Refresh the read model once a day
! That makes staleness worse.
> Read-your-writes for the author; eventual consistency is acceptable for everyone else.

? Copying `author_name` into every post makes reads fast. What is the main cost?
- Posts can no longer be indexed
! Indexing is unaffected.
+ A rename must update every post by that author (or posts show a stale name)
- Joins become impossible
! You can still join if needed.
- Posts become larger than the database page size
! A name is tiny.
> Duplicated data trades read speed for write amplification and staleness.
```
