"NoSQL" covers four quite different kinds of database. Each gives up something relational databases offer — joins, flexible queries,
multi-row transactions — in exchange for something else: horizontal scale, write throughput, schema flexibility or fast traversals. This lesson
explains the four families, the access patterns each is built for, and the habit that makes them work: **design for your queries first**.

## Why it matters

[SQL vs NoSQL](lesson:sql-vs-nosql) gave you the decision at a high level. In an interview, "I'll use NoSQL" isn't an answer: the follow-up
is always *which kind, keyed how, serving which query?* A wide-column store keyed badly is slower than PostgreSQL; a document store used
like a relational one ends up doing joins in application code. Knowing the families lets you:

- pick the family whose data model matches the access pattern;
- design partition keys and sort keys that serve your queries in one lookup;
- name the cost you're accepting — denormalised copies, limited queries, eventual consistency.

## How it works

### Key-value stores

The simplest model: `get(key)`, `put(key, value)`, `delete(key)`. The value is opaque to the database (or lightly structured), keys are
hashed across nodes, and every operation touches one partition — so it scales almost linearly.

- **Examples:** Redis, Memcached, DynamoDB used by key only, etcd and ZooKeeper (small, strongly consistent configuration data).
- **Sweet spot:** sessions, shopping carts, user profiles by ID, idempotency keys, feature flags, cached objects.
- **Can't do:** "find all users in Berlin" without a separate index you maintain yourself.

### Document stores

Values are JSON-like **documents** with nested fields and arrays. The database understands the structure, so it can index fields and query
within a collection.

- **Examples:** MongoDB, Couchbase, Firestore; PostgreSQL's `JSONB` gives you much of this inside a relational database.
- **Sweet spot:** entities read and written as a whole — a product with its variants, an order with its line items, a CMS page with blocks.
- **Modelling rule:** **embed** what is read together and bounded in size; **reference** what is shared, large or unbounded
  ([MongoDB](lesson:mongodb)).

### Wide-column stores

Data lives in **partitions** identified by a **partition key**; inside a partition, rows are **sorted by clustering (sort) keys**. A query
names a partition and reads a contiguous, sorted slice of it — one node, one sequential read.

- **Examples:** Cassandra, ScyllaDB, HBase, Google Bigtable; DynamoDB's partition key + sort key model works the same way.
- **Sweet spot:** time series, messages per conversation, activity feeds, sensor readings — very high write rates with "latest N for X"
  reads. Most use LSM-tree storage ([scaling writes](lesson:scaling-writes)).
- **Modelling rule:** **one table per query**. If you need messages by channel and by author, you write two tables.

### Graph databases

Data is **nodes** and **edges**, both with properties. Traversals follow edges directly from node to node, so multi-hop queries stay fast
regardless of total data size.

- **Examples:** Neo4j, Amazon Neptune.
- **Sweet spot:** many-hop relationship queries with variable depth — fraud rings, recommendations ("people who bought what your friends
  bought"), network and dependency analysis, knowledge graphs.
- **Not needed for:** one-hop questions like "who does Ana follow?" — an indexed adjacency table in any database answers that. Graph
  databases are also hard to shard, because traversals cross partitions.

### Access patterns first

Without joins, the shape of the data must match the shape of the questions. The process:

1. **List the queries** with their frequency and latency targets ("load the latest 50 messages in a channel", 50,000/s, p99 50 ms).
2. **Choose a partition key** that each query can name, that spreads load evenly, and that keeps partitions bounded.
3. **Choose a sort key** that returns rows in the order the query needs.
4. **Duplicate data** into another table or index for each additional access path, and decide how copies are kept in sync.

The same chat data, modelled in each family:

| Family | Layout for "latest messages in a channel" |
|---|---|
| Key-value | `channel:{id}:recent` → serialised list of the last 100 messages (rewritten on each post) |
| Document | One document per message, `{ channel_id, sent_at, author, text }`, index on `(channel_id, sent_at)` |
| Wide-column | Partition `(channel_id, month)`, clustering `message_id DESC` — one sequential read per page |
| Graph | `(:User)-[:POSTED]->(:Message)-[:IN]->(:Channel)` — works, but a poor fit for a time-ordered list |

## Architecture

```mermaid title="Wide-column layout: partition key picks the node, sort key orders the rows"
flowchart TB
  Q["Query: latest 50 messages in channel 42"]:::client --> H["hash(partition key 42, 2026-11)"]:::svc
  H --> N2["Node owning that token range"]:::db
  subgraph P["Partition (42, 2026-11), sorted by message_id DESC"]
    direction TB
    M1["msg 9183 - 'shipping today'"]:::store
    M2["msg 9182 - 'LGTM'"]:::store
    M3["msg 9181 - 'PR is up'"]:::store
    M4["... older messages"]:::store
  end
  N2 --> P
```

One hash finds the node; one contiguous read returns the page in order. Every query that can name its partition gets this shape; a query that
can't ("all messages containing 'deploy'") would have to read every partition on every node — so it belongs in a search index instead.

## Failure scenarios

- **Hot partition:** a partition key with skewed traffic (one celebrity, one global counter, today's date as the key) overloads one node
  while others idle ([hot keys](lesson:hot-keys)).
- **Unbounded partition:** keying messages by `channel_id` alone lets a busy channel grow forever; reads slow down, repairs and compaction
  struggle. Add a time bucket to the key.
- **Scatter-gather queries:** a query without the partition key fans out to every node; fine for rare admin tools, fatal on a hot path.
- **Copies drift apart:** denormalised tables updated by separate writes disagree after a partial failure. Use batched writes on one
  partition, change streams/CDC to update copies, or accept and repair.
- **Graph supernodes:** a node with millions of edges (a celebrity, a popular product) makes traversals through it expensive.

## Trade-offs

| Family | Gains | Costs |
|---|---|---|
| Key-value | Simplest, fastest, scales linearly | Only key lookups; any other query needs your own index |
| Document | Flexible schema, natural objects, secondary indexes | Cross-document invariants and joins are weak; large documents rewrite whole |
| Wide-column | Huge write throughput, sorted range reads, multi-datacentre replication | Query-specific tables, limited ad-hoc queries, eventual consistency by default |
| Graph | Fast multi-hop traversals, expressive queries | Hard to shard, niche operational skills, poor for bulk scans |

All four trade **query flexibility** for something. Relational databases keep flexibility and pay with harder horizontal write scaling.

## In real systems

- **Amazon's Dynamo paper (2007)** described a key-value store for the shopping cart that stays writable during failures, using consistent
  hashing, replication and quorums — the design that inspired Cassandra and, later, DynamoDB's partitioning ideas.
- **Google's Bigtable paper (2006)** introduced the wide-column model (rows, column families, timestamps) behind HBase and Cassandra's data
  model.
- **Discord** stores its messages in a wide-column store partitioned by channel and time bucket (Cassandra, later ScyllaDB).
- **Facebook's TAO** serves the social graph — users, posts, likes, friendships as objects and associations — from MySQL with a graph-aware
  caching layer, not a graph database: most queries are one hop.
- **Polyglot persistence** is normal: a typical product keeps users and billing in PostgreSQL, sessions in Redis, events in Cassandra or
  Kafka, search in Elasticsearch and files in object storage.

## Common mistakes

- **Choosing NoSQL "for scale"** without stating the access pattern it serves.
- **Modelling entities first** (normalised tables) and then discovering every query needs a join.
- **Partition keys without a bound** or with obvious skew.
- **Using secondary indexes as a crutch** in wide-column stores — they often become scatter-gather queries.
- **Reaching for a graph database** for one-hop relationships an adjacency table handles.
- **Forgetting how denormalised copies stay consistent.**

## In the interview

Say the access pattern, then the key design, then the cost: *"Messages are read as the latest page per channel, so Cassandra with partition
`(channel_id, month)` and clustering `message_id DESC`; search over messages goes to Elasticsearch via CDC."*

````question title="When would you choose a document database over a relational one?"
When the data is naturally a self-contained aggregate that is read and written as a unit — a product with its variants, an order with its
line items — when the schema varies between records, and when there are few invariants spanning documents. If the core workload is many
relationships queried in different ways, with constraints across entities, a relational database (possibly with JSONB columns for the
flexible parts) is the safer choice.
````

````question title="How do you design a Cassandra or DynamoDB table?"
Start from the queries, not the entities. For each query, choose a partition key the query can supply, that spreads traffic evenly and keeps
each partition bounded (add a time bucket if needed), and a sort key that returns rows in the required order. If two queries need different
keys, create two tables (or a global secondary index) and write to both, keeping them in sync with batched writes or a change stream.
Finally, check the hot-key and partition-size risks against the expected traffic.
````

````question title="Do you need a graph database for a social network?"
Usually not for the core features: "who does this user follow" and "followers of this user" are one-hop lookups that indexed adjacency
tables in a relational or wide-column store serve well at scale, and they shard by user ID. A graph database earns its place for multi-hop,
variable-depth queries — friend-of-friend recommendations, fraud rings — often as a separate analytical store fed from the primary data.
````

## Key takeaways

- **Key-value**: get/put by key, linear scale, nothing else. **Document**: self-contained aggregates with indexed fields.
  **Wide-column**: partitions sorted by clustering keys, built for writes and "latest N for X". **Graph**: multi-hop traversals.
- Design **queries first**: partition key (bounded, evenly spread), sort key (order), one table or index per access path.
- Every family trades **query flexibility** for scale, throughput or traversal speed — state the trade.
- Most real systems are **polyglot**: each store serves the access pattern it fits.

## Knowledge check

```quiz
? A chat app stores messages in a wide-column store keyed only by channel_id. A popular channel now has 400 million messages. What goes wrong?
- Nothing; wide-column stores have no partition limits
! Very large partitions slow reads, compaction and repair.
+ The partition grows without bound; add a time bucket to the partition key, e.g. (channel_id, month)
- Messages become unordered
! The clustering key still orders them.
- Writes are rejected
! They're accepted, but the partition becomes a liability.
> Bound partitions by design.

? Which query is a poor fit for a Cassandra table partitioned by user_id?
- Latest 20 orders for user 7
! That names the partition.
+ All orders over $500 placed yesterday, across all users
- User 7's orders in March
! Partition plus a clustering-key range.
- Count of user 7's orders this year
! One partition.
> Without the partition key, every node must be scanned.

? An e-commerce product has 5 variants and is always displayed with them. How should a document database model it?
+ Embed the variants inside the product document
- Store each variant as its own collection and join in the app
! That adds round trips for data always read together.
- Store variants in a graph database
! No traversal requirement.
- One document per field
! That defeats the document model.
> Embed what is read together and bounded.

? A team proposes Neo4j for "who does Ana follow?" in a 500M-user app. Best response?
- Agreed, graphs are always best for social data
! One-hop lookups don't need a graph engine.
+ An indexed follows table sharded by user handles one-hop lookups at scale; consider a graph store only for multi-hop analysis
- Use Redis pub/sub
! Pub/sub doesn't store relationships.
- Use a document per user with all followers embedded
! Unbounded arrays break document size limits.
> Facebook's TAO serves the graph from MySQL plus a cache.
```
