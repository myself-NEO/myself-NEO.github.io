MongoDB is the most widely used document database: JSON-like documents, rich secondary indexes and queries, replica sets for
availability and sharding for scale. It suits data that naturally forms self-contained aggregates. Most of its design decisions come down
to two choices — **what to embed** and **which shard key** — and interviews probe both.

## What it is for

- **Aggregates read and written as a unit**: a product with its variants, an order with its line items, a user profile with settings, a
  content page with its blocks.
- **Varied or evolving schemas**: records of one collection can carry different fields — catalogues with category-specific attributes,
  event payloads, integrations.
- **Rich queries on one collection**: filters on nested fields and arrays, sorting, aggregation pipelines, text and geospatial queries.
- **Horizontal scale** for large collections through built-in sharding.

## Data model

**Documents** (stored as BSON, up to 16 MB each) live in **collections**. A document can nest objects and arrays, so one read returns a
whole aggregate. The central modelling decision:

- **Embed** data that is read with its parent, owned by it, and **bounded** in size (variants of a product, addresses of a user).
- **Reference** data that is shared, large, updated independently, or **unbounded** (reviews of a product, orders of a customer).
- **Subset pattern**: embed a small, frequently needed slice (the 5 newest reviews) and reference the rest.

```json title="A product document: embedded variants, a subset of reviews"
{
  "_id": "prod_8812",
  "name": "Trail running shoe",
  "category": "footwear",
  "attributes": { "drop_mm": 6, "weight_g": 280, "waterproof": false },
  "variants": [
    { "sku": "8812-42-blue", "size": 42, "colour": "blue", "stock": 14 },
    { "sku": "8812-43-blue", "size": 43, "colour": "blue", "stock": 0 }
  ],
  "rating": { "average": 4.4, "count": 1873 },
  "recent_reviews": [
    { "review_id": "rev_99031", "stars": 5, "title": "Great grip", "at": "2026-11-06" }
  ]
}
```

Reviews themselves live in a `reviews` collection with `product_id` and an index on `{ product_id: 1, at: -1 }` — they're unbounded, so
embedding them all would eventually hit the 16 MB limit and make every product read heavier.

```javascript title="mongosh: indexes and queries"
db.products.createIndex({ category: 1, "rating.average": -1 })
db.products.find(
  { category: "footwear", "variants.size": 43, "variants.stock": { $gt: 0 } },
  { name: 1, rating: 1 }
).sort({ "rating.average": -1 }).limit(20)

// Atomic update of one embedded element: decrement stock only if available.
db.products.updateOne(
  { _id: "prod_8812", variants: { $elemMatch: { sku: "8812-42-blue", stock: { $gte: 1 } } } },
  { $inc: { "variants.$.stock": -1 } }
)
```

A single-document update is atomic, which is why embedding is also a concurrency tool: the stock decrement above can't oversell, because the
condition and the change apply to one document atomically. **Multi-document transactions** exist (since 4.0 for replica sets, 4.2 for
sharded clusters) but cost more; designs that need them constantly are often better served by a relational database.

Indexes are B-trees (in the WiredTiger storage engine): compound, **multikey** (one entry per array element), text, `2dsphere` geospatial,
**TTL** (expire documents automatically), partial and wildcard indexes. The **aggregation pipeline** (`$match`, `$group`, `$lookup`, ...)
handles reporting-style queries, including limited joins.

## How it works inside

### Replica sets

```mermaid title="Sharded cluster: routers, config servers, replica-set shards"
flowchart TB
  APP["Application<br/>driver"]:::client --> R1["mongos router"]:::lb
  APP --> R2["mongos router"]:::lb
  R1 & R2 -.->|"chunk map"| CFG[("Config server<br/>replica set")]:::store
  R1 -->|"targeted: shard key in query"| S1P
  R1 -->|"scatter-gather: no shard key"| S2P
  subgraph SH1["Shard 1 (replica set)"]
    S1P["Primary"]:::db --> S1A[("Secondary")]:::db
    S1P --> S1B[("Secondary")]:::db
  end
  subgraph SH2["Shard 2 (replica set)"]
    S2P["Primary"]:::db --> S2A[("Secondary")]:::db
    S2P --> S2B[("Secondary")]:::db
  end
```

A **replica set** is a primary plus secondaries (typically three members) that replicate the primary's operation log (**oplog**). If the
primary fails, the members **elect** a new one (a Raft-like protocol), usually within seconds; drivers retry writes automatically.

- **Write concern** says how many members must acknowledge: `w: 1` (primary only) or `w: "majority"` (the default since MongoDB 5.0).
  Majority-acknowledged writes survive a failover; `w: 1` writes can be rolled back if the primary dies before replicating them.
- **Read preference** says where reads go: `primary` (default, fresh), `secondary` / `nearest` (more capacity, possibly stale).
- **Read concern** says what a read may see: `local`, `majority` (only majority-committed data), `linearizable`, or `snapshot` in
  transactions.

### Sharding

A sharded cluster splits a collection by a **shard key** into ranges called **chunks** (128 MB by default in current versions), spread
across shards. **mongos** routers hold the chunk map (from config servers) and route each query; a **balancer** moves chunks to even out
data.

- **Targeted queries** include the shard key (or its prefix) and hit one shard.
- **Scatter-gather (broadcast) queries** don't, so every shard runs them and the router merges results.
- **Ranged** shard keys keep nearby values together (good for range queries); **hashed** shard keys spread monotonically increasing values.
- **Jumbo chunks**: if too many documents share one shard-key value, their chunk can't be split or moved. Choose high-cardinality keys.
- Since 5.0, collections can be **resharded** online to a new key, but it's an expensive operation — choose well up front.

## Strengths and weaknesses

| Strengths | Weaknesses |
|---|---|
| Natural fit for aggregate-shaped data; one read per aggregate | Cross-document invariants and joins are weaker and costlier than SQL |
| Flexible schema with optional validation | Schema drift without discipline (use JSON Schema validation) |
| Rich secondary indexes, aggregation, text and geo queries | 16 MB document limit; unbounded arrays are a design bug |
| Built-in replication, failover and sharding | Shard key mistakes (monotonic, low cardinality) are expensive to fix |
| Change streams for CDC-style integration | Scatter-gather queries limit scaling of non-shard-key queries |

## Scaling characteristics

- **Vertical first, then shard**: a replica set handles a lot; shard when one primary can't hold the data or the writes.
- **Reads** scale with secondaries if the application accepts staleness; otherwise with sharding.
- **Writes** scale only with sharding, and only if the shard key spreads them: `{ created_at: 1 }` sends every insert to the last chunk on
  one shard, while `{ customer_id: "hashed" }` spreads them.
- **Good shard key**: high cardinality, even frequency, included in most queries, not monotonic (or hashed if it is).
- **Zones** pin key ranges to shards in specific regions, useful for data residency.

## When to use it

- Data is **document-shaped** and mostly accessed by aggregate, with schemas that vary or evolve.
- You need **rich queries and indexes** on a large, sharded collection and few multi-entity transactions.
- **Prefer PostgreSQL** (perhaps with JSONB) when relationships and transactions across entities dominate; **prefer DynamoDB or
  Cassandra** for very high-throughput key-based access with simple queries.

## Alternatives

| Alternative | Prefer it when |
|---|---|
| PostgreSQL with JSONB | Mostly relational data with some flexible attributes; strong cross-table transactions |
| DynamoDB | Known key-based access patterns, fully managed, AWS-native |
| Couchbase | Document model with a built-in memory-first cache layer |
| Firestore | Mobile/web apps needing real-time sync and offline support |
| Elasticsearch | The main need is full-text relevance search, not a system of record |

## Interview trade-offs

- **Embed vs reference**: embed bounded, co-read data (atomic single-document updates for free); reference unbounded or shared data.
- **Write concern vs latency**: `majority` survives failover at the cost of a replication round trip; `w: 1` is faster but can roll back.
- **Secondary reads vs freshness**: more read capacity, but stale reads unless you use causal sessions.
- **Shard key**: name it, show which queries are targeted and which scatter, and how you avoid monotonic hot spots and jumbo chunks.

## Key takeaways

- Model **aggregates**: embed what's read together and bounded, reference what's unbounded or shared, embed a subset when helpful.
- **Single-document updates are atomic**; multi-document transactions exist but cost more.
- Replica sets elect a new primary on failure; **`w: "majority"`** writes survive failover.
- Sharding by a **high-cardinality, query-aligned, non-monotonic key** keeps queries targeted and writes spread.

## Knowledge check

```quiz
? A blog post document embeds all its comments. Popular posts are getting slow and one failed to save. What is the fix?
- Increase the document size limit
! The 16 MB limit is fixed.
+ Move comments to their own collection referencing the post; optionally embed the newest few
- Shard the posts collection by post ID
! Sharding doesn't shrink a document.
- Add an index on comments
! Indexing doesn't solve unbounded growth.
> Unbounded arrays should be referenced, not embedded.

? Orders are sharded by `{ created_at: 1 }`. What problem appears under heavy write load?
+ All new orders go to the chunk holding the newest timestamps, so one shard takes every insert
- Queries by order ID become targeted
! Without the shard key they scatter.
- Jumbo chunks form immediately
! Not inherently; the problem is the hot insert point.
- Writes are rejected
! They're accepted, but one shard is the bottleneck.
> Monotonic shard keys concentrate inserts; hash them or choose another key.

? A write with `w: 1` is acknowledged, then the primary crashes before replicating it. What happens after failover?
- The write is preserved by the new primary
! It never reached the new primary.
+ The write can be rolled back; with `w: "majority"` it would have survived
- The cluster stops until the old primary returns
! A new primary is elected.
- The driver replays it automatically from its own log
! Drivers retry failed writes, not acknowledged ones.
> Majority write concern makes acknowledged writes durable across failover.

? Why can decrementing stock inside an embedded variant avoid overselling without a transaction?
- MongoDB locks the whole collection
! It uses document-level concurrency.
+ A single updateOne with a condition on stock and the $inc applies atomically to one document
- Variants are stored in a separate table
! They're embedded in the same document.
- Secondary reads are disabled
! Read preference is unrelated.
> Single-document atomicity is a key reason to embed.
```
