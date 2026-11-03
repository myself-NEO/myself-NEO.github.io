Eleven questions and five numeric drills across Stage 4: conversions, traffic, storage, bandwidth, memory, servers and — most
importantly — what each number means for the design. Drills are graded on order of magnitude, as an interviewer would.

## How to use this checkpoint

- **No calculator.** Round to one or two significant figures and say your assumptions out loud.
- For the drills, an answer within the stated tolerance counts; the worked answer shows the fastest route.
- Wrong first answers go to your [revision notebook](#system-design/hld/notebook) as mistakes, with the explanation.
- If two or more questions on one resource go wrong, reread that lesson before Stage 5.

## Questions

```quiz
? Which estimate is usually NOT worth computing in an interview?
- Peak requests per second for a read-heavy service
! It decides servers and caching.
- Storage over five years for a media product
! It decides object storage and archival.
+ The exact number of bytes in an HTTP header
- The load on the hottest key
! Hot keys often decide where a design breaks.
> Estimate what changes a decision; header bytes rarely do.

? 80 million requests per day. Using the ÷ 100,000 shortcut, roughly how many per second?
- 80
! That divides by a million.
+ 800
- 8,000
! That divides by ten thousand.
- 80,000
! That divides by a thousand.
> 80 × 10⁶ ÷ 10⁵ = 800/s (exactly about 926/s).

? A product has 60M MAU and a DAU/MAU ratio of 20%. How many daily active users should you assume?
+ 12 million
- 60 million
! That treats monthly users as daily users.
- 2 million
! That divides by 30, which isn't how stickiness works.
- 300 million
! That multiplies instead of taking a share.
> 60M × 0.2 = 12M DAU.

? Total traffic is 20,000 requests/s at 4:1 read:write. Which design emphasis follows?
- Writes dominate; shard the write path first
! Writes are only 4,000/s of 20,000.
+ Reads dominate; caching and replicas come first, with 4,000 writes/s still checked against the primary
- Neither matters at this scale
! 20,000 requests/s needs a plan for both.
- Use a CDN for writes
! CDNs serve reads.
> 1 in 5 requests is a write: 4,000/s — significant, but reads are 16,000/s.

? Find the flaw: "Images are 1 MB, 10M uploads a day; we'll store them in PostgreSQL BLOB columns with two replicas."
- Two replicas are too few
! Replica count isn't the main flaw.
+ ~10 TB a day of blobs belongs in object storage; the database should hold metadata only
- PostgreSQL can't store binary data
! It can; it just shouldn't hold terabytes per day of it.
- Images should be stored in Redis
! Memory is far too expensive for this volume.
> 10M × 1 MB = 10 TB/day — object storage plus a CDN.

? Average egress is 2.5 GB/s. Which statement is right?
- It's 2.5 Gbit/s, easily one server
! Bytes, not bits: multiply by 8.
+ It's about 20 Gbit/s — beyond one or two servers' NICs, so a CDN is the natural choice for shared content
- It's 312 Mbit/s
! That divides by 8 instead of multiplying.
- Egress doesn't matter if storage is cheap
! Bandwidth is often the dominant cost for media.
> 2.5 GB/s × 8 = 20 Gbit/s.

? A cache serves 95% of 40,000 reads/s. The team proposes doubling it to reach 97%. What is the database-side effect?
+ Misses fall from 2,000/s to 1,200/s — worthwhile only if the database is struggling at 2,000/s
- Database reads fall by 2%
! Misses fall by 40%, not 2%.
- Nothing changes
! 800 fewer reads per second is a real change.
- The database must now serve 97% of reads
! The cache serves 97%.
> Evaluate caches by the misses that remain.

? 25M concurrent sessions × 1.5 KB each, in Redis. Which conclusion is sound?
- 37.5 MB — trivial
! That's off by a factor of 1,000.
+ About 37.5 GB of data plus per-key overhead and headroom — a small cluster or one large node, with replicas
- 37.5 TB — impossible in memory
! That's off by a factor of 1,000 the other way.
- Sessions should go in the database instead
! Redis is a common, sensible session store at this size.
> 25 × 10⁶ × 1.5 × 10³ B = 3.75 × 10¹⁰ B ≈ 37.5 GB.

? Peak is 18,000 requests/s; each instance sustains 1,500/s at the latency target; target utilisation 60%; three zones must survive losing one. How many instances?
- 12
! That's peak ÷ raw capacity, with no headroom or redundancy.
- 20
! That covers utilisation but not zone loss.
+ 30
- 60
! That doubles twice.
> 1,500 × 0.6 = 900 usable; 18,000 ÷ 900 = 20; × 3/2 = 30.

? A thread-pool service handles 3,000 requests/s at 40 ms per request. A dependency's latency jumps and requests now take 400 ms. What happens?
- Throughput is unchanged
! Threads are held ten times longer.
+ Throughput falls to ~300/s, requests queue and time out — protect it with timeouts and bulkheads
- Throughput rises
! Waiting threads do no extra work.
- Only the dependency is affected
! The caller's threads are tied up waiting for it.
> Little's law: throughput = concurrency ÷ latency.

? Latency budget: p99 200 ms, of which 120 ms is the client's network. Inside the system, a service makes three sequential calls with p99s of 30 ms each. Is that acceptable?
- Yes, because 3 × 30 ms is under 200 ms
! The client's 120 ms must also fit; 80 ms remains for everything inside.
+ No — 90 ms of sequential calls exceeds the ~80 ms left; parallelise, cache or remove a call
- Yes, p99s don't add
! Sequential latencies add up.
- It depends only on server count
! More servers don't shorten one request's path.
> Budgets are spent by every hop; sequential calls spend the sum.
```

Five numeric drills — answer with a unit where one applies:

```drill
? 300 million requests a day. Average requests per second?
= 3472
~ 1.5
> 300M ÷ 86,400 ≈ 3,500/s (shortcut: ÷ 10⁵ = 3,000/s).

? 40M users each upload 3 photos a day at 400 KB. Storage per day?
= 48 TB
~ 1.3
> 40 × 10⁶ × 3 × 4 × 10⁵ B = 4.8 × 10¹³ B = 48 TB.

? 1,500 video segment downloads per second at 4 MB each. Egress in Gbit/s?
= 48
~ 1.25
> 1,500 × 4 MB = 6 GB/s × 8 = 48 Gbit/s.

? 10M daily users, 2 sessions each of 30 minutes. Average concurrent users?
= 416667
~ 1.3
> 10M × 2 × 1,800 s ÷ 86,400 ≈ 417,000.

? A hot set of 8M items at 3 KB each, with 1.25× headroom. Cache memory needed?
= 30 GB
~ 1.25
> 8 × 10⁶ × 3 KB = 24 GB; × 1.25 = 30 GB.
```

## Where to review

| If you missed questions about… | Reread |
|---|---|
| When to estimate, rounding, hot keys | [Why, when & how to estimate](lesson:estimation-basics) |
| Latency and capacity anchors, bits vs bytes | [Numbers to know](lesson:numbers-to-know) |
| DAU/MAU, peaks, read/write splits, concurrency | [Traffic estimation](lesson:traffic-estimation) |
| Record sizes, retention, growth, bandwidth | [Storage, bandwidth, retention & growth](lesson:storage-estimation) |
| Hot sets, per-key overhead, working sets | [Memory, cache & database sizing](lesson:memory-estimation) |
| Server counts, zone redundancy, latency budgets | [Server counts & latency budgets](lesson:servers-latency) |
| Turning numbers into decisions | [Estimation workshop](lesson:estimation-workshop) |

Next, Stage 5 turns all of this into an interview method: [the 9-step framework](lesson:interview-framework).
