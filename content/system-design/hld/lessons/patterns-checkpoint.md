Fourteen scenario and flaw-finding questions across Stage 10: read- and write-heavy designs, fan-out, real-time delivery, contention,
workflows, jobs, scheduling, blobs, proximity, rate limiting, aggregation and the resilience patterns. Each question describes an interview
prompt or a design; pick the pattern it needs, or the flaw it has. Each answer explains why the others are wrong.

## How to use this checkpoint

- Name the pattern before reading the options; then check whether the options agree.
- Wrong first answers are saved to your [revision notebook](#system-design/hld/notebook).
- Missed two or more on one topic? Reread the lesson in *Where to review* before Stage 11.

## Questions

```quiz
? A short-link service serves 300,000 redirects/s and receives 2,000 new links/s. Which pattern dominates the design?
+ Read-heavy layering: CDN or edge cache, in-memory and distributed caches, replicas behind them
- Write-heavy ingestion with Kafka and pre-aggregation
! Writes are only 2,000/s.
- Fan-out on write
! There are no followers to deliver to.
- Distributed scheduling
! Nothing is time-triggered.
> A 150:1 read ratio with a hot subset is the classic read-heavy shape.

? Find the flaw: "Every ad click does UPDATE ad_stats SET clicks = clicks + 1 WHERE ad_id = ? in PostgreSQL. Peak is 1.5 million clicks per second."
- PostgreSQL can't increment integers
! It can.
+ One write per event far exceeds a primary's capacity, and hot ads become single-row bottlenecks; log events and pre-aggregate per window
- The query needs an index on clicks
! The index should be on ad_id; that's not the main problem.
- Clicks should be stored in Redis only
! Loses durability and still has hot keys.
> Absorb, partition, pre-aggregate.

? An account with 40 million followers posts. In a hybrid fan-out design, what happens?
- The post ID is pushed to 40 million inboxes
! That's pure fan-out on write.
+ The post goes to the author's outbox and is merged into followers' feeds at read time
- Followers are notified to refresh their feeds
! Notification isn't the feed mechanism.
- The post is rejected until fan-out capacity is available
! Posting should never block on fan-out.
> Pull for celebrities, push for everyone else.

? A chat client reconnects after 30 seconds offline. How does it get exactly the messages it missed?
- The server re-sends the last 100 messages
! Might be too few or too many.
+ It sends its last sequence number per conversation and the server replays everything after it from the durable store
- The pub/sub layer buffers messages for disconnected clients
! Many pub/sub systems don't, and buffering isn't the source of truth.
- It reloads the full history
! Wasteful.
> Persist first, push second, catch up by sequence number.

? Two users try to book the last appointment slot at the same moment. Which is the simplest correct approach?
+ A single conditional UPDATE ... WHERE slot_id = ? AND status = 'free', treating zero updated rows as "taken"
- Read the slot, check it's free in code, then update it
! Classic check-then-act race.
- A Redis distributed lock around every booking
! Works but adds a dependency for no benefit here.
- Process bookings with eventual consistency and apologise later
! Unacceptable for appointments.
> Put the check inside the write.

? An order flow reserves stock, charges the card, then creates a shipment. The charge is declined. What should a well-designed workflow do?
- Retry the charge until it succeeds
! A decline is a permanent failure.
+ Run the compensation for completed steps — release the reserved stock — and cancel the order
- Roll back with a distributed transaction
! The steps span services; there's no global transaction.
- Leave the stock reserved for manual cleanup
! Leaks inventory.
> Sagas compensate completed steps.

? Users request PDF exports that take 2–10 minutes. Which design is right?
- Generate the PDF in the request with a 15-minute timeout
! Ties up threads and fails on restarts and proxy timeouts.
+ Return 202 with a job ID, enqueue the job, process in a worker pool, and let the client poll or receive a notification with a download link
- Generate PDFs nightly for everyone
! Wasteful and stale.
- Stream the PDF while generating it over WebSocket
! Possible in rare cases, but doesn't solve crashes and retries.
> Accept now, process later.

? Find the flaw: "Ten scheduler nodes each run SELECT * FROM jobs WHERE run_at <= now() every second and execute what they find."
- The query needs ORDER BY
! Ordering isn't the core problem.
+ Every node finds and runs the same due jobs; claims need leases (FOR UPDATE SKIP LOCKED or conditional updates) plus idempotent execution
- Ten nodes are too many
! The count isn't the issue; coordination is.
- now() is unreliable
! Database time is the right single clock.
> Claim, then run once by run ID.

? Mobile users upload 4 GB videos that often fail at 90%. What is the core fix?
+ Presigned multipart (or resumable) uploads directly to object storage, retrying only failed parts
- A larger API server instance
! Bytes shouldn't pass through it at all.
- Compressing videos on the server before storing
! The upload still has to reach the server.
- Reducing the maximum video size to 100 MB
! Avoids the requirement.
> Direct, chunked, resumable transfers.

? 800,000 drivers send locations every 4 seconds. Where should live positions be indexed?
- A PostGIS table updated on every ping
! 200,000 updates/s is a lot of random writes for a disk-based spatial index.
+ An in-memory geo index (Redis GEO or a cell grid) sharded by region, with TTLs and a stream for history
- Elasticsearch with a 1-second refresh
! Near-real-time indexing of constant updates is expensive.
- The drivers' own phones, queried on demand
! Not queryable by riders.
> Moving objects are write-heavy; keep them in memory.

? A rate limiter gives each of 20 gateway instances 1/20 of a key's limit. What problem appears?
- Limits become exact
! Only with perfectly even traffic.
+ Uneven routing rejects traffic early on busy instances, and the effective limit changes whenever instances scale
- Redis is overloaded
! No Redis is involved in this design.
- Clients get higher limits than allowed
! Usually lower, on busy instances.
> Use shared state or leased tokens.

? A home screen calls 30 services in parallel; each is slow 1% of the time. Roughly what fraction of home screens are slow?
- 1%
! Ignores fan-out.
+ About 26%
- 30%
! That would be adding probabilities.
- 99%
! Far too high.
> 1 − 0.99³⁰ ≈ 26%; use deadlines, partial responses and fewer calls.

? Three layers each retry failed calls 3 times. The database at the bottom is overloaded. How much load can one user request generate on it?
- 3 calls
! Ignores layering.
- 9 calls
! That's two layers.
+ 27 calls
- 1 call
! Ignores retries.
> Retry at one layer, with budgets and jitter.

? Two regions run active-active at 65% utilisation each. What happens if one fails?
- The other runs at 65%
! It must take all the traffic.
+ The survivor needs 130% of its capacity: it overloads unless load is shed or capacity is added very quickly
- DNS spreads the traffic back across both
! One region is down.
- Nothing, because active-active doubles capacity
! Total capacity halves when a region fails.
> Two-region active-active needs ≤ 50% steady utilisation.
```

## Where to review

| If you missed questions about… | Reread |
|---|---|
| Caching layers and hit ratios | [Read-heavy systems](lesson:read-heavy) |
| Ingestion, batching, pre-aggregation | [Write-heavy systems](lesson:write-heavy) |
| Push vs pull, celebrities | [Fan-out](lesson:fan-out) |
| Gateways, pub/sub, catch-up | [Real-time updates at scale](lesson:realtime-at-scale) |
| Double booking, holds, hot rows | [Dealing with contention](lesson:contention) |
| Sagas, orchestration, compensation | [Multi-step workflows](lesson:multi-step-workflows) |
| Job queues, workers, leases | [Async processing & long-running jobs](lesson:long-running-jobs) |
| Due jobs, claiming, misfires | [Distributed scheduling](lesson:distributed-scheduling) |
| Uploads, processing, delivery | [Large blobs & content delivery](lesson:large-blobs) |
| Static vs moving locations | [Proximity-based services](lesson:proximity-services) |
| Shared limits, token leasing | [Distributed rate limiting](lesson:distributed-rate-limiting) |
| BFFs, discovery, fan-out tails | [API aggregation & service discovery](lesson:aggregation-discovery) |
| Deadlines, retries, jitter | [Timeouts, retries & backoff](lesson:timeouts-retries) |
| Breakers, bulkheads | [Circuit breakers & bulkheads](lesson:circuit-breakers-bulkheads) |
| Fallbacks, shedding, brownouts | [Graceful degradation & load shedding](lesson:graceful-degradation) |
| RPO/RTO, active-active, split brain | [Failover](lesson:failover) |

With the patterns in place, the remaining intermediate problems — [Instagram](problem:instagram), [YouTube](problem:youtube),
[Dropbox](problem:dropbox), [search autocomplete](problem:search-autocomplete), [API gateway](problem:api-gateway) and
[online judge](problem:online-judge) — are good mock interviews.
