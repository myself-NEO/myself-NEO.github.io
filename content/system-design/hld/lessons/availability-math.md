"Four nines" sounds like a target you can simply choose. It isn't: a system's availability follows from the availability of everything on
its critical path, how much redundancy each part has, and how quickly failures are repaired. A little arithmetic tells you which nines are
realistic, which dependency is capping you, and whether redundancy or faster recovery is the better investment.

## The question it answers

- **What availability can this design achieve**, given its components and dependencies?
- **Which component limits it** — and is it one we control?
- **What does a target mean in practice**: how many minutes of downtime per month?
- **Is redundancy or faster recovery the cheaper way** to the next nine?

Availability is the fraction of time (or of requests) a system works correctly. It's usually written as a number of nines:

| Availability | Downtime per year | Downtime per month (30.4 days) |
|---|---|---|
| 99% | 3.65 days | 7.3 hours |
| 99.5% | 43.8 hours | 3.65 hours |
| 99.9% ("three nines") | 8.77 hours | 43.8 minutes |
| 99.95% | 4.38 hours | 21.9 minutes |
| 99.99% ("four nines") | 52.6 minutes | 4.4 minutes |
| 99.999% ("five nines") | 5.3 minutes | 26 seconds |

Four nines leaves **4.4 minutes a month** — less time than it takes most teams to notice and roll back a bad deploy
([availability and reliability](lesson:availability-reliability)).

## Formula

```text title="Availability formulas"
Series (every component must work):      A = A1 x A2 x ... x An
Parallel (any one of n copies suffices):  A = 1 - (1 - A1) x (1 - A2) x ... x (1 - An)
From failure and repair times:            A = MTBF / (MTBF + MTTR)

MTBF = mean time between failures, MTTR = mean time to recovery (detect + decide + repair)
Parallel assumes independent failures; shared causes (same zone, same bad deploy) break it.
```

```mermaid title="Series multiplies availability down; parallel multiplies unavailability down"
flowchart TB
  subgraph S["Series: 99.9% x 99.9% x 99.9% = 99.7%"]
    direction LR
    A1["Gateway 99.9%"]:::lb --> A2["Service 99.9%"]:::svc --> A3["Database 99.9%"]:::db
  end
  subgraph P["Parallel: 1 - 0.1% x 0.1% = 99.9999%"]
    direction LR
    B1["Zone A copy 99.9%"]:::svc ~~~ B2["Zone B copy 99.9%"]:::svc
  end
  S ~~~ P
```

Three consequences fall straight out of the formulas:

- **Dependencies cap you.** Five critical dependencies at 99.9% each give 99.5% — about 3.6 hours of downtime a month — even if your own
  code never fails.
- **Redundancy multiplies the unavailability down**, but only for independent failures. Two zones at 99.9% give 99.9999% on paper; a bad
  config pushed to both zones at once gives 99.9%.
- **Recovery time is as powerful as failure frequency.** With one failure a month, recovering in 5 minutes instead of 30 lifts
  availability from 99.93% to 99.99%.

## Worked example

A checkout request passes through a load balancer (99.99%), three stateless API instances (each 99.5%, any one can serve), a database with
automatic failover (99.95%), and an external payment provider (99.9%).

```text title="Checkout availability"
API tier (3 in parallel):  1 - 0.005^3                    = 99.99999%
Checkout path (series):    0.9999 x 0.9999999 x 0.9995 x 0.999
                         = 99.84%   -> about 70 minutes of downtime per month

The payment provider alone contributes 43.8 of those minutes.
```

The weakest link is the dependency we don't control. Two designs improve it:

- **Take it off the critical path**: accept the order, authorise payment asynchronously and retry, so a provider outage delays capture
  instead of failing checkout. The path becomes 0.9999 × 0.9999999 × 0.9995 = **99.94%** (~26 minutes a month), now limited by the
  database ([sync vs async](lesson:sync-vs-async)).
- **Add a second provider** with automatic fallback: two independent providers at 99.9% give 99.9999% for the payment step, and the path
  again lands at **~99.94%**.

Either way, the next nine requires work on the database's failover time — which is where the MTTR formula comes in
([failover](lesson:failover)).

## Try it

```drill
? A request depends on four services in series, each 99.95% available. What is the availability of the request path, in percent?
= 99.8
~ 1.0005
> 0.9995⁴ ≈ 0.9980 → 99.80%, about 88 minutes of downtime a month.

? Two independent copies of a service, each 99% available, sit behind a load balancer that routes around a failed copy. What is the availability of the pair, in percent?
= 99.99
~ 1.0001
> 1 − 0.01 × 0.01 = 0.9999 → 99.99%.

? A service fails about once every 30 days and takes 30 minutes to recover. What is its availability, in percent?
= 99.93
~ 1.0003
> MTBF = 43,200 min; 43,200 ÷ (43,200 + 30) ≈ 0.99931 → 99.93%. Cutting recovery to 5 minutes gives 99.99%.

? Your SLA promises 99.95% monthly availability. How many minutes of downtime does that allow in a 30-day month?
= 21.6
~ 1.05
> 30 × 24 × 60 = 43,200 minutes × 0.0005 = 21.6 minutes.
```

## How it changes the design

- **Shorten the critical path**: every synchronous dependency multiplies in. Move non-essential calls off the request path, behind caches,
  queues or fallbacks ([graceful degradation](lesson:graceful-degradation)).
- **Make redundancy independent**: spread copies across zones or regions, and roll out changes to one copy at a time, so a single cause
  can't take out all of them ([fault isolation](lesson:fault-isolation)).
- **Invest in MTTR**: fast detection (good alerts), fast decisions (runbooks, automated rollback), fast repair (failover, feature flags).
  For many teams this is cheaper than preventing failures ([health, alerting and incidents](lesson:health-alerting-incidents)).
- **Set targets you can support**: a service can't credibly promise more nines than its weakest hard dependency; choose SLOs accordingly
  ([SLOs and error budgets](lesson:slos-error-budgets)).
- **Count failover time**: a "redundant" database whose failover takes 2 minutes spends half of a four-nines month on one event.

## Common mistakes

- **Adding nines without a dependency analysis** — claiming 99.99% on top of a 99.9% dependency.
- **Treating redundant copies as independent** when they share a zone, a deploy, a config or a database.
- **Forgetting failover time**: redundancy turns long outages into short ones, not into zero.
- **Measuring uptime of servers instead of success of requests** — a server can be "up" while every request fails.
- **Ignoring planned maintenance** that counts against the user-facing target.

## Key takeaways

- **Series** multiplies availabilities (dependencies cap you); **parallel** multiplies unavailabilities (redundancy helps) — if failures
  are independent.
- **A = MTBF / (MTBF + MTTR)**: faster recovery is as valuable as rarer failure.
- Know the budget: 99.9% ≈ **43.8 min/month**, 99.99% ≈ **4.4 min/month**.
- Raise availability by **removing hard dependencies**, **independent redundancy** and **faster recovery**.

## Knowledge check

```quiz
? A service with no bugs of its own depends synchronously on three services at 99.9% each. What is the best availability it can achieve?
- 99.9%
! That ignores the multiplication.
+ About 99.7%
- 99.99%
! Can't exceed its weakest dependency.
- 100%
! Dependencies' failures become its failures.
> 0.999³ ≈ 99.7%.

? Two database replicas in the same rack, each 99.9% available. Why is "99.9999%" an overestimate for the pair?
+ Their failures aren't independent: a rack power or network failure takes both down
- Replicas never fail
! They do.
- Parallel availability is computed by adding
! It's computed by multiplying unavailability.
- Replication makes availability lower
! It helps when failures are independent.
> Redundancy needs independent failure domains.

? A service fails twice a month. Which change most improves availability?
- Doubling the server count in the same zone
! Doesn't address the cause or the recovery time.
+ Cutting recovery from 40 minutes to 5 with better alerting and automated rollback
- Writing a longer SLA
! Contracts don't change availability.
- Adding a second payment provider
! Unrelated to this service's own failures.
> MTTR is a lever as strong as MTBF.

? A team targets 99.99% for checkout, which synchronously calls a 99.9% fraud-scoring API. What should change?
- Nothing; retries will fix it
! Retries don't help a dependency that's down.
- Lower the target to 99.9% permanently
! Possible, but there's a design fix.
+ Make fraud scoring non-blocking or provide a fallback (e.g. accept low-risk orders, review later)
- Call the fraud API twice in parallel
! Same dependency, same outages.
> Take the weak dependency off the critical path.
```
