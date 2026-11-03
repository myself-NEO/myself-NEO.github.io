Twelve questions across every Stage 1 lesson: true-or-false checks, scenarios, a small estimate, bottleneck hunting and two designs
with a flaw to find. Each answer explains why the other options are wrong.

## How to use this checkpoint

- Answer each question **before** looking at the options when you can — say your answer out loud as you would in an interview.
- A wrong first answer is recorded as a mistake in your [revision notebook](#system-design/hld/notebook), with the explanation, so
  you can revisit it later.
- If you miss two or more questions on the same topic, reread that lesson before moving on — the links are under *Where to review*.

## Questions

```quiz
? True or false: a system that is highly available is also highly durable.
- True
! Availability is about answering requests; a cache cluster can answer every request and still lose its data on restart.
+ False
> Availability and durability are separate promises with separate mechanisms — redundancy and failover versus replication across failure domains and backups.

? True or false: adding read replicas can cause a user to not see their own update immediately.
+ True
- False
! Asynchronous replicas apply the primary's changes slightly later, so a read routed to one can miss a write that just committed.
> This is a read-your-writes violation; route a user's reads of their own recent writes to the primary to avoid it.

? A service must be 99.99% available. Which recovery approach fits that target?
- An engineer is paged and restores service manually
! About 4 minutes of downtime a month leaves no time for a human to wake up, diagnose and act.
+ Automated health checks and failover to redundant instances in another zone
- Nightly backups restored after an outage
! Restores take hours; that protects durability, not availability.
- A larger single server with better hardware
! One machine is one failure domain, however reliable.
> Four nines allows about 52 minutes a year; recovery has to be automatic.

? Scenario: a page calls 50 backend services in parallel. Each has a p99 of 100 ms and a median of 10 ms. What will the page's latency look like?
- Close to 10 ms for almost every page view
! That ignores that the page waits for the slowest of 50 calls.
+ Many page views wait about 100 ms or more, because at least one of 50 calls often lands in its slow 1%
- Exactly 50 × 10 ms = 500 ms
! The calls run in parallel, so latencies don't add up.
- Always 100 ms
! Sometimes no call is slow; it is a probability, not a constant.
> 1 − 0.99⁵⁰ ≈ 40% of page views include at least one call at or beyond its p99.

? Estimation: 3,000 requests per second, average latency 80 ms. Roughly how many requests are in flight?
- About 38
! That divides 3,000 by 80 instead of multiplying by 0.08 seconds.
+ About 240
- About 3,000
! That ignores the latency term.
- About 240,000
! That uses milliseconds as if they were seconds.
> Little's law: L = λ × W = 3,000/s × 0.08 s = 240.

? Find the flaw: "Our API servers are stateless; each stores uploaded profile photos on its local disk and serves them back."
+ Photos stored on one server's disk are missing on others and lost when that server is replaced
- Local disks are too slow to store photos
! Speed isn't the problem; placement is.
- Stateless servers can't accept uploads
! They can, as long as the data goes to shared storage.
- Photos should be stored in the session
! Sessions are for small per-user state, not binary files.
> Local files are state. Uploads belong in object storage so any server can serve them.

? Find the flaw: "We have two load balancers for redundancy. Both point at a database primary that has no replica."
- Two load balancers are too many
! A redundant pair is the right call for load balancers.
+ The database primary is still a single point of failure
- Load balancers can't connect to databases
! Load balancers usually sit in front of app servers, but that isn't the flaw described.
- The system needs a CDN first
! A CDN doesn't address losing the only database.
> Redundancy has to cover every component on the critical path — especially the one that holds the data.

? Bottleneck: a stateless API tier scaled from 4 to 40 instances, yet throughput barely changed and database CPU is at 100%. What is happening?
- The load balancer can't route to 40 instances
! Throughput is capped by the database, as its CPU shows.
+ The shared database is the bottleneck; more app servers just add more connections to it
- The servers became stateful
! Scaling out doesn't add state by itself.
- Auto-scaling is too slow
! The instances are already running; capacity isn't the issue.
> Scaling one tier moves the bottleneck to the next shared dependency.

? Architecture selection: a small team is building a new product with unclear domain boundaries. Which architecture should they start with?
+ A modular monolith with clear internal boundaries and one database
- Twenty microservices, one per domain noun
! Premature splitting adds network failure modes and operational load before the boundaries are known.
- Microservices sharing one database
! That is a distributed monolith: distribution costs without independence.
- A monolith with no internal structure
! It will be hard to split later; module boundaries keep that option open.
> Start simple with boundaries that make later extraction cheap.

? Trade-off: which statement about vertical scaling is accurate?
- It needs significant code changes
! It needs none — the same software runs on a bigger machine.
+ It avoids distribution problems but has a ceiling and leaves one failure domain
- It is always cheaper than horizontal scaling
! Prices rise steeply near the top of the instance range.
- It improves availability by itself
! A single larger machine is still a single point of failure.
> Vertical scaling is simple and limited; pair it with a standby for availability.

? A client's "transfer money" request times out. What should the system design ensure?
- The client never retries
! Then transient failures leave transfers undone with no recovery.
+ Retries carry an idempotency key so the server performs the transfer at most once
- The timeout is set to five minutes
! A longer timeout narrows the window but doesn't remove the ambiguity.
- The server always rejects retries
! Then a lost first request can never succeed.
> A timeout doesn't say whether the work happened; idempotency makes retrying safe.

? Which requirement is best handled with eventual consistency?
- Preventing two customers from buying the last item
! That needs an atomic, consistent write.
- An account balance shown right after a transfer
! Users expect to see their own transfer immediately.
+ The follower count shown on a public profile
- Ensuring a username is unique at sign-up
! Uniqueness needs a strongly consistent check.
> A follower count that lags by seconds harms no one; the others involve scarce resources or a user's own action.
```

## Where to review

| If you missed questions about… | Reread |
|---|---|
| Availability vs durability, nines, recovery | [Availability, reliability, fault tolerance & durability](lesson:availability-reliability) |
| Replica staleness, read-your-writes, choosing consistency per feature | [Consistency: what users actually see](lesson:consistency-intro) |
| Fan-out, percentiles, Little's law | [Scalability, performance, latency & throughput](lesson:scalability-performance) |
| Local files, sessions, statelessness | [Stateless vs stateful services](lesson:stateless-vs-stateful) |
| Redundancy gaps, SPOFs | [Single points of failure, redundancy & replication](lesson:spof-redundancy) |
| Shared bottlenecks, vertical vs horizontal | [Vertical vs horizontal scaling](lesson:scaling-up-vs-out) |
| Choosing an architecture style | [Monolith vs microservices](lesson:monolith-vs-microservices) |
| Timeouts, retries, idempotency | [Distributed systems: what changes over a network](lesson:distributed-systems-intro) |

When you're comfortable with these, continue to [Stage 2: Networking & Communication](lesson:network-layers) — or, if you want to see
the fundamentals applied, read the [URL shortener](problem:url-shortener) breakdown now.
