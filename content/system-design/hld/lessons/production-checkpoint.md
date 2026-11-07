Twelve scenario questions across Stage 11: availability maths, SLOs and error budgets, observability, health checks and incidents,
disaster recovery, fault isolation, production failures, chaos engineering, deployments and migrations. Most describe a situation an
on-call engineer or a design reviewer would face; pick the response that actually works. Each answer explains why the others are wrong.

## How to use this checkpoint

- Decide on your answer — and the number, where there is one — before reading the options.
- Wrong first answers are saved to your [revision notebook](#system-design/hld/notebook).
- Missed two or more on one topic? Reread the lesson in *Where to review* before the advanced problems.

## Questions

```quiz
? A user-facing request depends synchronously on four services, each 99.9% available. What availability can the request path reach at best?
- 99.9%
! Dependencies multiply.
+ About 99.6%
- 99.99%
! Can't exceed the dependencies.
- 96%
! That's 0.99⁴.
> 0.999⁴ ≈ 0.996 — about 2.9 hours of downtime a month.

? Two app instances in the same rack, each 99.9% available. A design document claims 99.9999% for the pair. What is wrong?
+ The calculation assumes independent failures, but a shared rack (power, switch) fails both together
- Parallel availability should be added, not multiplied
! Unavailabilities multiply for independent copies.
- Two instances can't be load-balanced
! They can.
- Nothing is wrong
! The failure domains aren't independent.
> Redundancy needs independent failure domains.

? An SLO of 99.9% over 30 days. The service currently fails 1.44% of requests. What is the burn rate, and what should happen?
- 1.44 — open a ticket
! 1.44% ÷ 0.1% is 14.4, not 1.44.
+ 14.4 — page: at this rate the 30-day budget is gone in about two days
- 0.144 — ignore it
! The error rate is far above the budget.
- 144 — the SLO is already breached for the month
! 14.4 is the burn rate; the budget isn't exhausted yet.
> Burn rate = error rate ÷ allowed error rate.

? Dashboards show average latency of 70 ms while users complain of slowness. Which change to the SLI helps most?
- Measure latency at the database instead
! That's further from the user.
+ Use a threshold or percentile SLI, e.g. "99% of requests under 400 ms", from latency histograms
- Average over a longer window
! Averages still hide the tail.
- Stop measuring latency
! Then nothing is visible.
> Averages hide the tail.

? A team adds `customer_id` (5 million values) as a label on its request-latency metric. What happens?
- More useful dashboards at no cost
! Cardinality has a cost.
+ The metric explodes into millions of time series, overloading the metrics backend
- Logs lose their trace IDs
! Unrelated.
- Traces stop sampling
! Unrelated.
> Put high-cardinality IDs on spans and logs.

? Readiness probes call the shared Redis cluster. Redis has a 20-second hiccup. What happens?
+ Every instance becomes unready at once, the load balancer has no backends, and a partial degradation becomes a full outage
- Only one instance is removed
! All instances depend on the same Redis.
- Instances restart
! That's liveness, not readiness.
- Nothing; readiness is informational
! Load balancers act on it.
> Readiness must not fail everywhere at once because of a shared dependency.

? An engineer runs an UPDATE without a WHERE clause on the orders table, which has two synchronous replicas. What restores the data?
- Failing over to a replica
! Replicas applied the update too.
+ Point-in-time recovery: a base backup plus archived WAL replayed to just before the update
- Restarting the primary
! The data is changed, not cached.
- Rebuilding indexes
! Indexes reflect the bad data.
> Replicas copy mistakes; backups preserve the past.

? A 30 TB database is restored from backup at 600 MB/s. The RTO is 2 hours. Is the RTO credible?
- Yes, restores are fast
! The throughput math says otherwise.
+ No: the restore alone takes about 14 hours; a standby or smaller restore units are needed
- Yes, if done at night
! Time of day doesn't change throughput.
- Only if RPO is zero
! RPO doesn't affect restore time.
> 30 × 10¹² ÷ 600 × 10⁶ ≈ 50,000 s ≈ 13.9 h.

? One tenant's malformed requests crash the workers that serve it, and with them every other tenant. Which design limits this most?
- Bigger workers
! They crash too.
+ Shuffle sharding (or cells), plus quarantining requests that repeatedly crash workers
- More retries
! Retries resend the poison.
- A larger load balancer
! Doesn't isolate tenants.
> Limit which tenants share fate.

? A dependency is slowed by 2 seconds in a chaos experiment, and the caller's thread pool saturates. What should the team change?
- Stop running chaos experiments
! The experiment did its job.
+ Add a short timeout, a bulkhead and a circuit breaker with a fallback for that dependency
- Increase the thread pool to 10,000
! Delays saturation; doesn't contain it.
- Retry the slow calls
! Adds load to the slow dependency.
> Contain slow dependencies.

? A bad release fails 25% of requests. A 2% canary detects it in 8 minutes and rolls back automatically. Traffic is 100,000 requests/minute. How many requests failed?
- 200,000
! That's the failure count without a canary.
+ 4,000
- 40,000
! That's a 20% canary.
- 400
! That's 0.2% exposure.
> 100,000 × 2% × 25% × 8 = 4,000.

? A migration must rename a column on a busy table while the service deploys with rolling updates. What is the safe approach?
- ALTER TABLE ... RENAME COLUMN during the deploy
! Old instances break mid-rollout.
+ Expand-contract: add the new column, dual write, backfill in batches, switch reads, stop old writes, drop later
- Take the service down for the rename
! Works, but isn't zero-downtime.
- Rename it in a replica first
! Replicas follow the primary's schema.
> Every step compatible with both versions.
```

## Where to review

| If you missed questions about… | Reread |
|---|---|
| Series, parallel, MTTR | [Availability math](lesson:availability-math) |
| SLIs, SLOs, burn rates | [SLAs, SLOs, SLIs & error budgets](lesson:slos-error-budgets) |
| Metrics, cardinality, tracing | [Metrics, logs & distributed tracing](lesson:observability) |
| Probes, alerts, incidents | [Health checks, alerting & incident management](lesson:health-alerting-incidents) |
| Backups, PITR, RPO/RTO | [Backups, disaster recovery, RPO & RTO](lesson:disaster-recovery) |
| Cells, shuffle sharding | [Fault isolation & blast radius](lesson:fault-isolation) |
| Retry storms, cascades, poison messages | [Production failure case studies](lesson:production-failures) |
| Experiments, game days | [Chaos engineering](lesson:chaos-engineering) |
| Rolling, blue-green, canary, flags | [Rolling, blue-green & canary deployments](lesson:deployment-strategies) |
| Expand-contract, backfills, cutovers | [Zero-downtime migrations](lesson:zero-downtime-migrations) |

You've now covered the whole curriculum. The advanced problems — such as [Ticketmaster](problem:ticketmaster),
[payment system](problem:payment-system) and [Uber](problem:uber) — combine every stage, and make the best mock interviews.
