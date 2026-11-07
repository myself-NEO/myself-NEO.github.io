Twelve architecture-selection questions across Stage 9: relational internals, the NoSQL families, DynamoDB, Cassandra, MongoDB, Redis as a
store, search, geospatial indexes and object storage. Most describe a requirement and ask which store fits; several describe a design with a
storage flaw to find. Each answer explains why the others are wrong.

## How to use this checkpoint

- Name your choice **and the access pattern it serves** before reading the options.
- Wrong first answers are saved to your [revision notebook](#system-design/hld/notebook).
- Missed two or more on one topic? Reread the lesson in *Where to review* before Stage 10.

## Questions

```quiz
? Bank transfers move money between accounts and must never lose a cent or double-spend. Which store is the natural system of record?
+ PostgreSQL or MySQL, with transactions and constraints
- Redis with AOF every second
! Up to a second of acknowledged writes can be lost on a crash or failover.
- Elasticsearch
! It isn't transactional and isn't a system of record.
- Cassandra at consistency ONE
! No multi-row transactions, and ONE allows stale reads.
> Relational ACID transactions fit money movement.

? Find the flaw: "We keep 2 years of click events in one PostgreSQL table and delete expired rows nightly with DELETE ... WHERE created_at < now() - interval '2 years'."
- PostgreSQL can't store 2 years of data
! It can, especially partitioned.
+ Mass deletes create dead tuples, vacuum load and bloat; partition by time and drop old partitions instead
- The index on created_at makes deletes impossible
! It makes them findable, not cheap.
- Nightly jobs should run hourly
! Smaller deletes still create the same garbage.
> Retention by DROP PARTITION is a metadata operation.

? An IoT platform ingests 400,000 sensor readings per second and reads "latest readings for sensor X today". Which design fits best?
- One PostgreSQL primary with an index on sensor_id
! Far beyond one primary's write capacity.
+ Cassandra (or ScyllaDB) with partition (sensor_id, day) and clustering reading_at DESC, TTL and time-window compaction
- MongoDB with all readings embedded in one document per sensor
! Unbounded arrays hit the 16 MB document limit.
- Elasticsearch as the only store
! Not a system of record; expensive for this write rate.
> Write-optimised wide-column store, bounded partitions.

? A DynamoDB table keys click counters by `campaign_id`. One viral campaign gets 8,000 writes per second and throttles. Why, and what is the fix?
- On-demand mode has a global write cap of 8,000
! The cap is per partition, not global.
+ One key lives on one partition, capped at 1,000 write units per second; shard the key (campaign#0..#15) and sum on read, or aggregate before writing
- DynamoDB doesn't support counters
! Atomic ADD updates work fine.
- Use eventually consistent reads
! Reads aren't the problem.
> Spread hot writes across keys.

? Cassandra with RF = 3 in one region. The team reads and writes at ONE and sees stale reads after updates. What is the minimal change?
- Increase RF to 5
! Still stale at ONE.
+ Read and write at LOCAL_QUORUM (2 + 2 > 3)
- Disable hinted handoff
! That makes divergence worse.
- Use ALL for writes only
! Works, but any replica outage then blocks writes.
> R + W > RF.

? A product catalogue has category-specific attributes, and each product is always shown with its variants. Which store and model fit naturally?
+ A document store (MongoDB) with variants embedded in the product document
- Cassandra with one table per attribute
! Overly fragmented; not an access-pattern fit.
- A key-value store with each variant as a separate key and joins in the app
! Extra round trips for data always read together.
- A graph database
! No multi-hop traversal requirement.
> Embed bounded data that is read together.

? A game shows a live global top-100 and each player's rank for 30 million players. Which store serves the read path best?
- PostgreSQL ORDER BY score LIMIT 100 on every request
! Rank lookups for arbitrary players are expensive at this rate.
+ A Redis sorted set (ZINCRBY, ZRANGE ... REV, ZREVRANK), with scores also persisted durably for rebuilds
- Elasticsearch sorted by score
! Possible but heavier, and near-real-time only.
- DynamoDB Scan sorted in the application
! Scans read the whole table.
> Sorted sets give O(log N) updates and ranks.

? Find the flaw: "Product search uses `WHERE description ILIKE '%' || :q || '%'` on 30 million rows."
- ILIKE is case-sensitive
! ILIKE is case-insensitive.
+ A leading wildcard can't use a B-tree, so every search scans the table, and results have no relevance ranking
- PostgreSQL can't store 30 million rows
! It can easily.
- The query is vulnerable to SQL injection
! It uses a bind parameter.
> Use an inverted index (Elasticsearch, or PostgreSQL full-text / pg_trgm for modest scale).

? A service writes to PostgreSQL and then directly to Elasticsearch. After an Elasticsearch outage, some products never reappear in search. What should the design be?
- Retry the Elasticsearch write forever inside the request
! Requests time out and crash; the dual-write problem remains.
+ Stream changes from PostgreSQL via CDC into Kafka, and index them with versioned bulk writes
- Make Elasticsearch the system of record
! It isn't transactional.
- Rebuild the index every night
! Leaves up to a day of missing products.
> The database log becomes the single source of changes.

? "Show coffee shops within 500 m" works on most streets but misses shops just across the road from some users. What is the likely bug?
+ The query searches only the user's geohash cell, not its neighbours
- The haversine formula is inaccurate at 500 m
! It's accurate at that scale.
- Geohash precision is too short
! A larger cell reduces, not causes, edge misses.
- Coffee shops need an R-tree
! Points work with geohashes; the issue is the neighbour search.
> Search the cell and its eight neighbours, then filter by exact distance.

? A photo app stores 5 MB images as BYTEA columns in PostgreSQL. Backups take hours and replicas lag. What is better?
- Compress the images inside the database
! Still bloats the database and its WAL.
+ Store images in object storage, keep metadata and keys in PostgreSQL, serve through a CDN
- Move images to Redis
! RAM is the wrong place for terabytes of blobs.
- Shard PostgreSQL by user
! Spreads the problem without fixing it.
> Blobs in object storage, metadata in the database.

? Clients upload large files by streaming them through the API servers, and abandoned uploads leave partial data. Which combination fixes both?
- Single PUTs from the API servers with longer timeouts
! Still routes bytes through servers and restarts on failure.
+ Presigned multipart uploads directly from clients, plus a lifecycle rule that aborts incomplete multipart uploads
- Store partial uploads in a database table
! Moves the mess elsewhere.
- Disable uploads above 100 MB
! Avoids the requirement rather than meeting it.
> Direct transfer, resumable parts, automatic cleanup.
```

## Where to review

| If you missed questions about… | Reread |
|---|---|
| Relational internals, partitioning, retention | [PostgreSQL & MySQL in depth](lesson:postgres-mysql) |
| Choosing a NoSQL family, query-first modelling | [Key-value, document, wide-column & graph](lesson:nosql-families) |
| Partition limits, hot keys, conditional writes | [DynamoDB](lesson:dynamodb) |
| Write path, consistency levels, tombstones | [Cassandra](lesson:cassandra) |
| Embedding, write concern, shard keys | [MongoDB](lesson:mongodb) |
| Sorted sets, HyperLogLog, Lua, durability | [Redis as a primary data store](lesson:redis-beyond-cache) |
| Inverted indexes, BM25, typos | [Inverted indexes & full-text search](lesson:search-fundamentals) |
| Shards, refresh, indexing pipelines | [Elasticsearch & indexing pipelines](lesson:elasticsearch) |
| Geohash, quadtrees, S2, H3 | [Geospatial indexes](lesson:geospatial-indexes) |
| Presigned URLs, multipart, metadata | [S3 & object storage](lesson:object-storage) |

Next, Stage 10 turns these building blocks into the recurring **patterns** of interview problems — starting with
[read-heavy systems](lesson:read-heavy).
