Fourteen scenario questions across Stage 6: scaling tiers, sharding, hashing, hot keys, consistency, replication, consensus,
transactions, locks, clocks, deduplication and failure detection. Several describe a design and ask you to find the flaw — the form these
topics take in interviews. Each answer explains why the others are wrong.

## How to use this checkpoint

- Answer before reading the options when you can, and say your reasoning out loud.
- Wrong first answers are saved to your [revision notebook](#system-design/hld/notebook) with the explanation.
- If you miss two or more questions on one topic, reread the lesson in *Where to review* before Stage 7.

## Questions

```quiz
? An I/O-bound service is auto-scaled on CPU (target 70%). At peak its threads are saturated at 30% CPU. What is the fix?
- Lower the CPU target to 50%
! CPU still won't reach the target.
+ Scale on concurrency or requests per instance instead of CPU
- Add more threads per instance
! That may help briefly, but the scaling signal remains wrong.
- Disable auto-scaling
! The service still needs to scale.
> Scale on the resource that saturates first.

? Reads have tripled and the primary is at 90% CPU on SELECTs. What should you reach for first?
+ Fix expensive queries, then cache hot reads and add read replicas
- Shard by user ID
! Sharding addresses write volume and data size at a high cost.
- Switch to synchronous replication
! That adds write latency without read capacity.
- Move to a document database
! A migration is a last resort.
> Climb the read-scaling ladder from the cheapest rung.

? Find the flaw: "Events are written one row per transaction at 30,000/s into PostgreSQL."
- PostgreSQL can't store events
! It can; the write pattern is the problem.
+ Per-row commits multiply fixed costs; batch, coalesce or buffer through a log and write in bulk
- The table needs more indexes
! More indexes slow writes further.
- Events should be updated in place
! Appending is cheaper than updating.
> Batching amortises round trips, parsing and commit flushes.

? A table is sharded by `hash(user_id) mod 8`. You add a ninth shard. What happens?
- About 1/9 of rows move
! That's consistent hashing; modulo is far worse.
+ Most rows map to a different shard and must move
- Nothing moves until rows are updated
! Placement is computed from the key.
- The new shard stays empty
! The modulo changes for most keys.
> Use many logical partitions or consistent hashing so growth moves few keys.

? One viral post's like counter gets 25,000 increments/s and one cache node serves 300,000 reads/s of the post. Which pair of fixes is right?
- Shard more for both
! A single key stays on one shard.
+ Salt or buffer the counter writes; replicate the post across cache nodes and cache it in-process
- Replicate the counter; salt the reads
! Replication helps reads; salting helps writes.
- Increase the TTL for both
! TTLs don't fix the write hotspot.
> Hot writes and hot reads need different treatments.

? During a partition, the minority side receives a "transfer funds" request. A CP choice means:
+ Rejecting the request until the majority side is reachable
- Accepting it and reconciling later
! That's AP; for transfers, it risks double spending.
- Accepting it on both sides
! That duplicates the transfer.
- Forwarding it to a cache
! Caches can't authorise transfers.
> Consistency for money: refuse when uncertain.

? Users occasionally see a comment, then refresh and it's gone. Which guarantee is missing, and the cheapest fix?
- Linearizability; route all reads to the primary
! It works but costs far more than needed.
+ Monotonic reads; pin each session to one replica
- Causal consistency; add vector clocks
! Unnecessary for this symptom.
- Durability; enable synchronous replication
! The data isn't lost — reads go backwards.
> Session stickiness prevents time-travel between replicas.

? Find the flaw: "Our primary replicates asynchronously; on failure we promote any replica. No acknowledged write is ever lost."
- Promotion is impossible with async replicas
! Promotion works; the claim about loss is the flaw.
+ Writes acknowledged before reaching the promoted replica are lost
- Async replication blocks writes
! It doesn't block.
- Replicas can't serve reads
! They can.
> Only synchronous/quorum replication to the promoted node avoids loss.

? With N = 3 replicas in a Dynamo-style store, which W and R give read/write overlap and survive one replica failure?
- W = 1, R = 1
! 1 + 1 ≤ 3: no overlap guarantee.
- W = 3, R = 1
! Writes fail with one replica down.
+ W = 2, R = 2
- W = 1, R = 3
! Reads fail with one replica down.
> R + W > N with each ≤ N − 1.

? A team elects a scheduler leader with a 3-node etcd cluster spread over three zones. One zone fails. What happens?
+ The remaining two nodes form a majority and keep electing and committing
- Writes stop until the zone returns
! Two of three is still a majority.
- Both remaining nodes become leaders
! Raft allows one leader per term.
- Committed data is lost
! It's on a majority.
> 2F + 1 nodes tolerate F failures.

? Find the flaw: "Checkout uses 2PC across the order, inventory and payment microservices."
- 2PC can't involve three participants
! It can involve many.
+ 2PC blocks if the coordinator fails, needs every service up and XA support; a saga with compensations fits better
- Microservices can't have databases
! They do.
- Sagas are only for read operations
! Sagas coordinate writes.
> Between services, prefer sagas or redesigned boundaries.

? A lock holder pauses for 40 seconds; its 30-second Redis lease expires and another client takes the lock. Both then write. What was missing?
- A longer lease
! Any lease can be outlived by a pause.
+ Fencing tokens checked by the resource
- Redlock across five Redis nodes
! Redlock doesn't provide fencing tokens.
- A faster Redis instance
! Speed doesn't fix the pause.
> The resource must reject stale lock holders.

? Two replicas accept writes to the same key milliseconds apart and resolve conflicts by timestamp. One node's clock runs 50 ms fast. What is the risk?
- None, NTP makes clocks identical
! NTP keeps clocks close, not identical.
+ The earlier write can carry the later timestamp and silently overwrite the newer one
- Both writes are kept
! Last-write-wins keeps one.
- The store detects the conflict automatically
! Timestamps alone can't detect concurrency.
> Use version vectors, CRDTs or a single sequencer where losing writes matters.

? A consumer applies an effect, acknowledges the message, then records the event ID. It crashes before recording the ID. Is anything wrong?
- No — the message was acknowledged, so it won't come back
! It won't be redelivered by the broker, but an upstream retry with the same ID would be applied twice.
+ Yes: the dedup record isn't atomic with the effect, so a resend of the same event (from a producer or client retry) is applied again
- No — brokers deduplicate everything
! Most brokers deliver at least once.
- Yes: the message is lost
! The effect was applied.
> Record the dedup key in the same transaction as the effect.
```

## Where to review

| If you missed questions about… | Reread |
|---|---|
| Auto-scaling signals and headroom | [Load balancing & auto-scaling](lesson:scaling-app-tier) |
| The read-scaling ladder, replica lag | [Scaling database reads](lesson:scaling-reads) |
| Batching, queues, LSM trees | [Scaling database writes](lesson:scaling-writes) |
| Shard keys, resharding | [Sharding & partitioning strategies](lesson:sharding) |
| Rings, virtual nodes, slots | [Consistent & rendezvous hashing](lesson:consistent-hashing) |
| Hot reads and hot writes | [Hot keys & hot partitions](lesson:hot-keys) |
| CP vs AP per operation | [CAP and PACELC](lesson:cap-pacelc) |
| Session guarantees, causal, linearizable | [Consistency models](lesson:consistency-models) |
| Sync vs async replication, failover, split brain | [Leader–follower replication](lesson:leader-follower) |
| N, R, W, repair, conflicts | [Leaderless replication & quorums](lesson:leaderless-quorums) |
| Majorities, Raft | [Leader election & consensus](lesson:consensus) |
| 2PC vs sagas | [Distributed transactions](lesson:distributed-transactions) |
| Leases and fencing | [Distributed locks](lesson:distributed-locks) |
| Skew, Lamport and vector clocks | [Clock synchronization & logical clocks](lesson:clocks) |
| Idempotent consumers, Bloom filters | [Idempotency & deduplication](lesson:dedup) |
| Timeouts, gossip, gray failures | [Partitions & failure detection](lesson:partitions-failure-detection) |

Next, Stage 7 makes reads cheap: [Why cache, and where caches live](lesson:caching-basics).
