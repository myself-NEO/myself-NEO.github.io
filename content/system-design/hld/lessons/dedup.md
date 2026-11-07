In a distributed system, duplicates are not a bug to eliminate but a fact to absorb. Clients retry after timeouts, queues redeliver
after crashes, producers resend after lost acknowledgements, and webhooks arrive twice. "Exactly once" is achieved not by delivering once
but by **processing idempotently**: making the second, third and tenth copy of a message harmless.

## Why it matters

Any design with retries or at-least-once messaging — which is nearly every design — must answer "what if this message arrives twice?" For
payments, counters, inventory and notifications the answer decides correctness. Interviewers listen for where duplicates come from, how a
consumer recognises them, how long it remembers, and how dedup scales to billions of items (Bloom filters, content hashes).

## How it works

### Where duplicates come from

| Source | Why it duplicates | Defence |
|---|---|---|
| Client retry after timeout | The first request may have succeeded | Idempotency keys at the API ([idempotent APIs](lesson:idempotent-apis)) |
| Producer retry to a broker | The broker stored the message but the ack was lost | Idempotent producer (sequence numbers per producer) |
| Consumer crash before committing its position | Messages since the last commit are redelivered | Idempotent consumer |
| Visibility timeout expiry (SQS-style) | A slow consumer's message reappears for another consumer | Idempotent consumer; extend the timeout while working |
| Upstream systems | Webhooks, partner feeds and crawlers send repeats | Dedup by event ID or content hash |

### The idempotent consumer

Give every message a stable **dedup key** — an event ID chosen by the producer, or a natural key such as `(order_id, event_type)`.
Then, in the consumer:

1. Check whether the key has been processed.
2. If not, perform the effect **and record the key — in the same transaction** if both live in one database.
3. If yes, skip (and acknowledge).

Recording the key in the same transaction as the effect is what makes it airtight; recording it separately reopens a window where a crash
between the two causes a duplicate effect or a lost one.

Often you don't need a separate table: make the effect itself idempotent with a **natural key and an upsert** — `INSERT … ON CONFLICT DO
NOTHING` on `(order_id, event_type)`, or "set status to shipped" rather than "advance status by one".

### How long to remember

A dedup store can't keep every key forever. Choose a **window** longer than the longest realistic redelivery delay — minutes for a broker
redelivery, hours or days for webhooks and client retries — and expire keys after it (a TTL in Redis, a partitioned table dropped by day).
Amazon SQS FIFO queues, for example, deduplicate messages with the same deduplication ID within a **5-minute** interval.

### Dedup at very large scale

When the key space is huge — billions of URLs for a crawler, event IDs across a whole platform — storing every key exactly becomes
expensive:

- **Bloom filters** answer "definitely not seen" or "probably seen" using a few bits per item; false positives are possible (an unseen item
  reported as seen), false negatives are not. Use them as a fast first check, confirming "probably seen" against the exact store when a
  false positive would matter, or accept a small, known rate of skipped items when it doesn't (a crawler re-crawling a page later is fine).
- **Content hashes** (SHA-256 of a normalised document) detect the *same content* under different IDs or URLs. Near-duplicate detection
  uses similarity hashes such as SimHash or MinHash.
- **Partitioned dedup**: route each key to the shard that owns it (by hash) so each shard dedups its own keys.

### Exactly-once is a property of the pipeline

Brokers advertise "exactly-once", and within their own boundaries they can deliver it — Kafka's idempotent producer and transactions make
consume-transform-produce pipelines inside Kafka exactly-once. The moment an effect leaves the boundary (a database write, an email, a
payment API call), you're back to at-least-once delivery plus idempotent processing. See
[delivery guarantees](lesson:delivery-semantics).

## Architecture

```mermaid title="An idempotent consumer: effect and dedup record in one transaction"
flowchart LR
  Q[["Queue / topic<br/>at-least-once"]]:::queue -->|"order-91 paid (event e-7f3)"| C[Consumer]:::svc
  C -->|"BEGIN"| DB[("Orders DB")]:::db
  C -->|"INSERT processed_events(e-7f3)<br/>ON CONFLICT DO NOTHING"| DB
  C -->|"if inserted: UPDATE orders SET status='paid'"| DB
  C -->|"COMMIT, then ack"| Q
  Q -.->|"redelivery of e-7f3"| C
  C -.->|"key exists: skip, ack"| Q
```

## Java and Spring Boot example

A Bloom filter remembering one million crawled URLs in 1.2 MB, then tested against a million URLs that were never added — compared with the
formula for the expected false-positive rate, `(1 − e^(−kn/m))^k`:

```java file="BloomFilterDemo.java"
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.BitSet;

// A Bloom filter answers "definitely not seen" or "probably seen" using a few bits per item.
// Here: remember 1 million crawled URLs in 1.2 MB, then test 1 million URLs never added.
public class BloomFilterDemo {

    private final BitSet bits;
    private final int m; // number of bits
    private final int k; // number of hash functions

    BloomFilterDemo(int m, int k) {
        this.bits = new BitSet(m);
        this.m = m;
        this.k = k;
    }

    void add(String item) {
        long[] h = hashes(item);
        for (int i = 0; i < k; i++) {
            bits.set(index(h, i));
        }
    }

    boolean mightContain(String item) {
        long[] h = hashes(item);
        for (int i = 0; i < k; i++) {
            if (!bits.get(index(h, i))) {
                return false; // one unset bit proves the item was never added
            }
        }
        return true;
    }

    // Double hashing: the i-th index is h1 + i * h2, from two halves of one MD5 digest.
    private int index(long[] h, int i) {
        return (int) Math.floorMod(h[0] + i * h[1], (long) m);
    }

    private static long[] hashes(String s) {
        try {
            byte[] d = MessageDigest.getInstance("MD5").digest(s.getBytes(StandardCharsets.UTF_8));
            long a = 0;
            long b = 0;
            for (int i = 0; i < 8; i++) {
                a = (a << 8) | (d[i] & 0xff);
                b = (b << 8) | (d[i + 8] & 0xff);
            }
            return new long[] {a, b | 1}; // odd step so indexes don't repeat early
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public static void main(String[] args) {
        int n = 1_000_000;
        int m = 9_600_000; // 9.6 bits per item = 1.2 MB
        int k = 7;          // close to the optimum (m/n) * ln 2 = 6.65
        BloomFilterDemo filter = new BloomFilterDemo(m, k);
        for (int i = 0; i < n; i++) {
            filter.add("https://example.com/page/" + i);
        }
        int missed = 0;
        for (int i = 0; i < n; i++) {
            if (!filter.mightContain("https://example.com/page/" + i)) {
                missed++;
            }
        }
        int falsePositives = 0;
        for (int i = 0; i < n; i++) {
            if (filter.mightContain("https://example.org/other/" + i)) {
                falsePositives++;
            }
        }
        double theory = Math.pow(1 - Math.exp(-(double) k * n / m), k);
        System.out.printf("filter size:            %.1f MB (%.1f bits per URL, %d hashes)%n",
                m / 8 / 1e6, (double) m / n, k);
        System.out.printf("added URLs reported new: %d (false negatives are impossible)%n", missed);
        System.out.printf("false positive rate:     %.2f%% measured, %.2f%% predicted%n",
                100.0 * falsePositives / n, 100 * theory);
    }
}
```

```text title="Output" output="BloomFilterDemo.java"
filter size:            1.2 MB (9.6 bits per URL, 7 hashes)
added URLs reported new: 0 (false negatives are impossible)
false positive rate:     0.99% measured, 1.00% predicted
```

A `HashSet` of the same million URLs would take tens of megabytes; the filter takes 1.2 MB, never misses a URL it has seen, and wrongly
reports about 1 in 100 new URLs as seen — the measured rate matches the prediction.

## Failure scenarios

- **Dedup record written separately from the effect**: crash between them → duplicate effect (record after) or lost effect (record before).
- **Dedup window too short**: a webhook retried after two days slips past a one-day window and double-processes.
- **Dedup key not stable**: the producer generates a new ID on each retry, so every retry looks new. IDs must be assigned once per logical
  event.
- **Bloom filter false positive on something important**: a payment wrongly skipped. Never let a Bloom filter be the only check where
  skipping is harmful.
- **Unbounded dedup table**: grows forever and slows every check. Expire by window.

## Trade-offs

- **Exact vs probabilistic**: exact stores never err but cost memory per key; Bloom filters are tiny but have false positives (and plain
  Bloom filters can't delete — counting variants can).
- **Window length vs storage**: longer windows catch later duplicates and cost more.
- **Natural idempotency vs dedup tables**: designing effects as upserts or "set" operations needs no extra storage; dedup tables work for any
  effect but add a write per message.

## In real systems

- Kafka's idempotent producer (on by default in current clients) stops broker-side duplicates from producer retries; transactions extend
  exactly-once to read-process-write pipelines within Kafka.
- Amazon SQS FIFO queues deduplicate by message deduplication ID within a 5-minute interval.
- Web crawlers keep "seen URL" sets as Bloom filters or sharded exact stores, and use content hashes to skip duplicate pages.
- Payment providers deduplicate by idempotency key for at least a day.

## Common mistakes

- **Claiming exactly-once delivery end to end.**
- **Recording the dedup key outside the effect's transaction.**
- **Generating a new dedup key per retry.**
- **No expiry** on dedup state.
- **Bloom filters for correctness-critical decisions.**

## In the interview

````question title="A consumer must not double-apply a 'payment received' event. How do you guarantee that?"
Delivery is at least once, so I make processing idempotent. Each event carries a stable event ID assigned by the producer when the payment
happened. The consumer, in a single database transaction, inserts that ID into a processed-events table with a unique constraint and applies
the effect — marking the order paid and recording the ledger entry — only if the insert succeeded; then it commits and acknowledges the
message. A redelivered event hits the unique constraint and is skipped. Processed IDs expire after a window longer than any realistic
redelivery, and where possible the effect itself is an upsert keyed by the payment ID, so even without the table a duplicate is harmless.
````

````question title="How would a web crawler avoid re-crawling billions of URLs it has already seen?"
Normalise each URL (scheme, host case, trailing slashes, tracking parameters) and check it against a "seen" set before enqueueing. At billions
of URLs, keep a Bloom filter per shard (shards chosen by hashing the host or URL) as a fast check — about 10 bits per URL gives roughly a 1%
false-positive rate, meaning a few pages are skipped this cycle, which is acceptable for a crawler — backed by an exact store where it
matters. Separately, hash fetched page content to detect the same content at different URLs, and use a similarity hash for near-duplicates.
````

## Key takeaways

- Duplicates come from **client retries, producer retries, consumer redelivery and upstream systems** — absorb them.
- An **idempotent consumer** records a stable dedup key **in the same transaction** as the effect, or makes the effect a natural upsert.
- Keep dedup state for a **window** longer than realistic redelivery delays, then expire it.
- At scale, **Bloom filters** (no false negatives, some false positives) and **content hashes**; end-to-end "exactly once" is idempotent
  processing.

## Knowledge check

```quiz
? A consumer applies an effect, then records the event ID in a separate store, then acknowledges. It crashes after the effect. What happens on redelivery?
- The event is skipped
! The ID was never recorded.
+ The effect is applied twice
- The event is lost
! It's redelivered because it wasn't acknowledged.
- The broker deduplicates it
! Brokers redeliver unacknowledged messages.
> Record the key and apply the effect in one transaction.

? What can a Bloom filter tell you?
- "Definitely seen" or "definitely not seen"
! It can be wrong about "seen".
+ "Definitely not seen" or "probably seen"
- The exact number of items stored
! It doesn't store items or counts.
- Which items were added most recently
! Order isn't recorded.
> No false negatives, some false positives.

? A producer generates a fresh event ID each time it retries a send. What breaks?
+ Consumers can't recognise retries as duplicates, so they process them again
- Ordering within a partition
! Ordering is a separate concern.
- The consumer's throughput
! Throughput isn't the main issue.
- Nothing, if the consumer is idempotent
! Idempotency depends on a stable key per logical event.
> Dedup keys must be assigned once per logical event.

? How long should a webhook receiver remember processed event IDs?
- One second
! Retries can arrive hours or days later.
+ Longer than the sender's retry period (for example several days for a sender that retries for three days)
- Forever, with no expiry
! An unbounded table grows forever.
- Until the next deploy
! Deploys don't relate to retry windows.
> The window must exceed the longest realistic redelivery delay.
```
