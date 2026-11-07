Twelve scenario questions across Stage 7. Most describe a symptom — a latency spike, stale data, a database flood — and ask for the cause
or the fix, which is how caching usually comes up in interviews. Each answer explains why the other options are wrong.

## How to use this checkpoint

- Diagnose from the symptom before reading the options.
- Wrong first answers go to your [revision notebook](#system-design/hld/notebook) with the explanation.
- Missed two or more on one topic? Reread the lesson in *Where to review* before Stage 8.

## Questions

```quiz
? Reads are 200,000/s. The cache hit ratio drops from 99% to 95%. What happens to database reads?
- They rise by 4%
! The miss ratio goes from 1% to 5%.
+ They rise fivefold, from 2,000/s to 10,000/s
- They halve
! Fewer hits means more database reads.
- Nothing changes
! Misses are what the database sees.
> Think in misses: backend load = reads × (1 − hit ratio).

? Find the flaw: "On a product update we write the new value into Redis, then update the database."
- Redis should be updated twice
! The order and method are the problem.
+ Concurrent writers can leave an older value in the cache; write the database first, then delete the key
- The database should be skipped
! The database is the source of truth.
- Products shouldn't be cached
! They're ideal cache data.
> Delete-on-write after the database commit avoids ordering races.

? Which pattern can lose writes that users were told were saved?
- Write-through
! The database is written synchronously.
+ Write-back
- Cache-aside
! Writes go to the database.
- Write-around
! Writes go to the database.
> Write-back acknowledges before persisting.

? Users occasionally see an old price for up to 30 minutes after an update, despite delete-on-write. Which mechanism most directly fixes it?
- A longer TTL
! That lengthens the stale window.
+ CDC-driven invalidation after commit (plus a shorter TTL), catching late cache fills and missed write paths
- Write-back caching
! Unrelated to stale fills.
- LFU eviction
! Eviction policy doesn't address staleness.
> The read-fill race and forgotten write paths are caught by invalidation tied to the change stream.

? Redis used as a cache starts rejecting writes with out-of-memory errors. The cause?
+ maxmemory reached with the default noeviction policy
- allkeys-lru evicting too much
! It would evict rather than reject.
- Keys without TTLs
! allkeys-* policies evict them anyway.
- Replication lag
! Lag doesn't cause OOM rejections.
> Set a policy such as allkeys-lru for caches.

? A nightly batch job reads every product once through the cache; morning hit ratios are poor. Best fix?
- Raise TTLs
! The hot keys were evicted, not expired.
+ Use LFU/TinyLFU eviction or have the batch job bypass the cache
- Add more cache replicas
! Replicas don't change eviction.
- Switch to write-through
! Unrelated to scan pollution.
> Frequency-aware eviction resists scans.

? After every deploy, Redis CPU spikes for two minutes while instances warm their in-process caches. What helps?
- Remove the in-process cache
! That loses its benefit permanently.
+ Preload hot keys before readiness, roll gradually with slow start, and jitter the preload
- Restart Redis after each deploy
! That makes everything colder.
- Use a single larger app instance
! It reduces resilience and doesn't fix warming.
> Warm L1 deliberately; don't let 40 instances fill at once.

? A celebrity's profile key expires and 20,000 concurrent requests hit the database. What is this and the fix?
- Penetration; add a Bloom filter
! The key exists.
+ A stampede; coalesce loads (single-flight/lease) and refresh before expiry (stale-while-revalidate)
- An avalanche; add TTL jitter
! Jitter helps many keys expiring together, not one hot key.
- Eviction; switch to LFU
! It expired; it wasn't evicted.
> One loader per key turns 20,000 queries into one.

? Requests for random, non-existent IDs flood the database. Which pair of fixes fits?
+ Negative caching with a short TTL, and a Bloom filter of existing IDs
- Longer TTLs and write-back
! Missing keys are never cached at all.
- More replicas and LRU
! That pays for garbage instead of stopping it.
- Single-flight and jitter
! These address stampedes and avalanches.
> Cache penetration needs missing keys to be cached or filtered.

? Which data should be served from an in-process cache only?
- A user's cart
! Shared across instances and mutable.
+ Feature flags and plan definitions, refreshed on change
- Stock levels at checkout
! Must be exact.
- Session state
! Must be shared.
> Small, rarely changing reference data fits local caches.

? One Redis node is at 100% CPU while others idle; one key gets 40% of traffic. Adding nodes doesn't help. Why, and what does?
- The ring is unbalanced; add virtual nodes
! Key counts may be balanced; the traffic isn't.
+ It's a hot key; cache it in-process (L1) and/or replicate it across nodes
- Redis is single-threaded; switch to Memcached
! The hot key would still sit on one node.
- Lower its TTL
! That increases misses.
> Hot keys need copies spread across nodes or instances.

? The database is sized for a 97% hit ratio. What is the main risk?
- Too much memory used by the cache
! Memory isn't the risk here.
+ A cache failure, cold start or mass invalidation sends many times the planned load to the database
- Writes become slower
! Reads are the issue.
- Eviction stops working
! Unrelated.
> Size the miss path for a degraded hit ratio and protect it with limits and shedding.
```

## Where to review

| If you missed questions about… | Reread |
|---|---|
| Hit ratio arithmetic, cache layers | [Why cache, and where caches live](lesson:caching-basics) |
| Cache-aside, write-through, write-back, write-around | [Cache patterns](lesson:cache-patterns) |
| TTLs, delete-on-write, races, CDC | [Invalidation, TTLs & consistency](lesson:cache-invalidation) |
| LRU, LFU, Redis policies | [Eviction](lesson:eviction) |
| Redis internals, Cluster, persistence | [Redis fundamentals & architecture](lesson:redis) |
| L1/L2 caching | [Local vs distributed caching](lesson:local-vs-distributed-cache) |
| Stampede, penetration, avalanche, hot keys | [Cache failure modes](lesson:cache-failure-modes) |
| Warming and measuring caches | [Cache warming & a read-heavy design](lesson:cache-warming) |

Next, Stage 8 decouples services in time: [synchronous vs asynchronous communication](lesson:sync-vs-async).
