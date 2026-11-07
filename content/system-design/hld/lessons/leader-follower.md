In leader–follower replication, one node — the leader, or primary — accepts all writes and streams them to followers (replicas), which
apply them in the same order and can serve reads. It's the replication model behind PostgreSQL, MySQL, MongoDB replica sets, Redis and
most relational databases, and its two hard parts are lag and failover.

## Why it matters

Replication gives you durability (copies survive a machine's loss), read scaling (followers serve reads) and availability (a follower can
take over). Interviewers probe the details: synchronous or asynchronous? What happens to recent writes when the leader dies? How do you avoid
two leaders? A design that says "primary with replicas" without answering these is incomplete.

## How it works

### The replication stream

The leader writes each change to its log — PostgreSQL's write-ahead log (WAL), MySQL's binary log — and ships it to followers, which replay
it. Variants:

- **Physical (WAL/block) replication**: byte-level changes; followers are exact copies (same major version). PostgreSQL streaming
  replication.
- **Logical replication**: row-level change events; followers can differ in version or schema, and the stream can feed other systems
  (this is what [change data capture](lesson:outbox-cdc) reads).

### Synchronous, asynchronous, semi-synchronous

| Mode | The leader acknowledges a write when… | Data loss on leader failure | Write latency | Availability |
|---|---|---|---|---|
| **Asynchronous** | It is durable on the leader only | Writes not yet shipped are lost | Lowest | High — followers can be slow or down |
| **Synchronous** (all followers) | Every follower has it | None | Highest — slowest follower | Low — any follower outage blocks writes |
| **Semi-synchronous / quorum** | At least one (or a quorum of) follower(s) has it | None, if a synced follower is promoted | Moderate — one extra round trip | Good |

The common production choice: one synchronous (or quorum) standby, preferably in another availability zone, plus asynchronous replicas for
reads. PostgreSQL configures this with `synchronous_standby_names` (including `ANY n (...)` quorum syntax); MySQL with semi-synchronous
replication.

### Replication lag

Asynchronous followers trail the leader by milliseconds normally, and by seconds or minutes during heavy writes, long-running queries on
the follower, or network trouble. Consequences and fixes are covered in [scaling reads](lesson:scaling-reads) and
[consistency models](lesson:consistency-models): read-your-writes (route the writer's reads to the leader, or wait for the follower to reach
the write's log position) and monotonic reads (pin sessions to one follower). Monitor lag and pull lagging followers out of rotation.

### Failover

When the leader fails, a follower must take over:

1. **Detect** the failure — usually missed heartbeats for some seconds. Too quick and you fail over on a hiccup; too slow and writes are
   down longer.
2. **Choose** the most up-to-date follower (ideally the synchronous one, so nothing acknowledged is lost).
3. **Promote** it and **reconfigure** clients and other followers to use it (DNS or a virtual IP change, a proxy update, or a
   coordination service telling clients the new leader).
4. **Fence the old leader**, so if it was only slow — not dead — it can't keep accepting writes.

Managed databases and tools such as Patroni (PostgreSQL) or Orchestrator (MySQL) automate this, typically using a consensus store (etcd,
ZooKeeper, Consul) to decide who the leader is.

### Split brain

If the old leader is alive but cut off, and a new leader is promoted, both may accept writes: **split brain**. Their histories diverge,
and merging them later means losing or hand-reconciling writes. Prevention:

- **Elect leaders through consensus** (a majority must agree), so a minority partition can't elect its own leader
  (see [consensus](lesson:consensus)).
- **Fence**: revoke the old leader's access — a lease it must renew, storage that rejects its writes, or forcibly shutting it down
  ("shoot the other node in the head", STONITH).
- **Leader leases**: a leader steps down if it can't renew its lease with a majority.

## Architecture

```mermaid title="Primary with a synchronous standby and async read replicas"
flowchart LR
  APP[Application]:::svc -->|"writes"| P[("Primary<br/>zone A")]:::db
  P -->|"synchronous: ack waits"| S[("Standby<br/>zone B")]:::db
  P -.->|"asynchronous"| R1[(Read replica 1)]:::db
  P -.->|"asynchronous"| R2[(Read replica 2)]:::db
  APP -->|"stale-tolerant reads"| R1
  APP -->|"stale-tolerant reads"| R2
  HA["Failover manager<br/>(consensus-backed)"]:::svc -.->|"health, promote, fence"| P
  HA -.-> S
```

If the primary fails, the standby — which has every acknowledged write — is promoted; read replicas re-point to it.

## Failure scenarios

- **Async failover loses writes.** The leader acknowledged writes the follower never received; after promotion, those writes are gone, and
  IDs may be reused — a known cause of real incidents where reused auto-increment IDs leaked data between records. Use a synchronous
  standby, or reconcile carefully.
- **Split brain.** Two leaders accept writes. Consensus-based election plus fencing.
- **Flapping failover.** A network blip triggers failover, then another. Tune detection, require confirmation from several observers.
- **Synchronous follower down.** With strict synchronous replication, writes block. Use quorum/semi-sync with fallback, and alert.
- **Lag hidden by averages.** One replica is ten minutes behind while the dashboard shows average lag of one second.

## Trade-offs

- **Durability vs write latency**: synchronous replication guarantees no acknowledged write is lost on failover, at the cost of a round
  trip on every write (and the follower's speed).
- **Fast vs safe failover**: aggressive detection shortens outages and risks needless failovers or split brain.
- **Read scaling vs freshness**: more async replicas, more read capacity, more staleness to handle.
- **Single leader vs multi-leader**: one leader keeps writes simple and ordered; multiple leaders (e.g. per region) cut write latency but
  bring conflicts to resolve.

## In real systems

- PostgreSQL streaming replication supports synchronous and quorum commit; HA stacks like Patroni use etcd or Consul for leader election.
- MySQL supports semi-synchronous replication and Group Replication (consensus-based).
- MongoDB replica sets elect a primary by majority vote; writes with `w: "majority"` survive failover.
- Amazon Aurora replicates storage six ways across three zones and fails over to a replica, typically within tens of seconds.
- Redis replication is asynchronous; Sentinel or Redis Cluster promotes replicas, so acknowledged writes can be lost on failover.

## Common mistakes

- **"Add replicas" without saying sync or async** — and what that means on failover.
- **Forgetting split brain** and fencing.
- **Reading critical state from async replicas.**
- **Manual failover only**, for a design that promises high availability.
- **Treating replicas as backups** — they replicate deletes and corruption too.

## In the interview

````question title="Your database primary fails. What happens, and could any data be lost?"
Health checks miss the primary's heartbeats for a configured window; the failover manager, which uses a consensus store to make the decision,
promotes the most up-to-date standby, fences the old primary so it can't accept writes if it's merely partitioned, and repoints clients and
replicas to the new primary — typically tens of seconds of write unavailability. Whether data is lost depends on replication mode: with a
synchronous or quorum standby, every acknowledged write is on the promoted node, so nothing is lost; with only asynchronous replicas,
writes acknowledged in the last moments before the crash may be missing.
````

````question title="What is split brain, and how do you prevent it?"
Split brain is two nodes both believing they are the leader and both accepting writes, usually because the old leader was partitioned
rather than dead when a new one was elected. Their data diverges and conflicts have to be resolved or lost. Prevent it by electing leaders
through a majority (consensus), so a minority can't elect its own; by leader leases the leader must keep renewing from a majority; and by
fencing — making storage or the network reject the old leader's writes, for example with fencing tokens or by forcibly stopping it.
````

## Key takeaways

- One leader takes writes and **streams its log** to followers, which serve reads and stand by for failover.
- **Async** is fast but can lose recent writes on failover; **sync/quorum** to one standby in another zone loses nothing at a latency cost.
- Handle **lag** with read-your-writes and monotonic reads.
- Failover = **detect, choose, promote, reconfigure, fence** — and prevent **split brain** with consensus and fencing.

## Knowledge check

```quiz
? A primary acknowledges writes before shipping them to its only (asynchronous) replica, then crashes. The replica is promoted. What can happen?
- Nothing is lost; replicas always have everything
! Async replicas can trail the primary.
+ The last acknowledged writes that hadn't reached the replica are lost
- The replica refuses to be promoted
! Promotion succeeds; the missing writes are the problem.
- Writes are replayed automatically from the client
! Clients already received success responses.
> Asynchronous replication trades durability on failover for write latency.

? Which configuration avoids losing acknowledged writes on failover while keeping write latency moderate?
- Fully synchronous replication to every replica
! Every write waits for the slowest replica, and any outage blocks writes.
+ One synchronous (or quorum) standby in another zone plus async read replicas, promoting the synced standby
- Asynchronous replication only
! Recent writes can be lost.
- Nightly backups
! Backups lose up to a day.
> Semi-synchronous replication bounds both loss and latency.

? The old primary was partitioned, not dead, and a new primary was promoted. What prevents split brain?
- Faster heartbeats
! Detection speed doesn't stop the old leader writing.
+ Fencing the old primary (lease expiry, storage rejecting its writes) and electing leaders by majority
- Adding more replicas
! More replicas don't stop two leaders.
- Read-your-writes routing
! That addresses stale reads, not dual leaders.
> A leader must lose the ability to write when it loses its majority.

? Why can logical replication feed other systems when physical replication cannot easily?
+ It emits row-level change events that other consumers (search, caches, analytics) can interpret
- It is always faster
! Speed isn't the distinguishing feature.
- It uses less disk on the leader
! Not necessarily.
- It works without a leader
! It still streams from a leader.
> Logical change streams are the basis of change data capture.
```
