Twelve scenario questions across Stage 8: when to go asynchronous, queues versus topics, Kafka's model, delivery and ordering guarantees,
retries and dead letters, backpressure, the outbox, event sourcing and choosing a broker. Several describe an event-driven design with a
flaw to find. Each answer explains why the others are wrong.

## How to use this checkpoint

- Answer before reading the options when you can, and explain your reasoning aloud.
- Wrong first answers are saved to your [revision notebook](#system-design/hld/notebook).
- Missed two or more on one topic? Reread the lesson in *Where to review* before Stage 9.

## Questions

```quiz
? Find the flaw: "Checkout synchronously calls payment, inventory, email, loyalty and analytics before responding."
- Payments shouldn't be synchronous
! The response depends on payment authorisation.
+ Email, loyalty and analytics don't affect the response; they should react to an event asynchronously
- Inventory should be asynchronous
! "Order placed" must not be a lie; reserve stock first.
- Checkout should use UDP
! Unrelated.
> Keep only what the response needs on the synchronous path.

? Three services each need every OrderPlaced event. The design uses one SQS queue they all consume. What goes wrong?
+ The services compete for messages, so each sees only some of the events
- Messages are duplicated three times
! The opposite: they're split.
- Ordering is guaranteed
! Not on a standard queue, and that isn't the problem.
- Nothing
! Each service misses most events.
> Use a topic with a subscription (or consumer group) per service.

? A Kafka topic has 4 partitions; the consumer group has 10 instances. What happens?
- All 10 consume in parallel
! Only one consumer per partition in a classic group.
+ 4 consume; 6 sit idle
- Kafka adds 6 partitions automatically
! Partitions aren't added automatically.
- Messages are duplicated to all 10
! Within a group, each partition goes to one consumer.
> Parallelism is capped by partition count.

? Events for each payment must be processed in order, at high throughput. How?
- One partition for the whole topic
! Correct order but no parallelism.
+ Key events by payment ID so each payment's events share a partition; process partitions sequentially
- Random keys and a thread pool per partition
! That loses per-payment order.
- Order by timestamp in the consumer
! Clock skew and redelivery make that unreliable.
> Per-key ordering with per-partition sequential processing.

? A consumer auto-commits offsets every 5 seconds while processing asynchronously. It crashes. What can happen?
- Only duplicates
! Records committed but not yet processed are skipped.
+ Records whose offsets were committed before processing finished are lost (at-most-once for those)
- Nothing; auto-commit is exactly-once
! It isn't.
- The broker replays everything from the start
! It resumes from the committed offset.
> Commit after processing.

? A consumer calls an external email API, then records the event ID. Which guarantee does the system actually provide for emails?
- Exactly-once
! A crash between sending and recording resends the email on redelivery.
+ At-least-once: a rare duplicate email is possible unless the provider supports idempotency keys
- At-most-once
! Redelivery would resend, not drop.
- None
! Delivery is at least once.
> Exactly-once stops at the boundary of your transaction.

? A message fails because its payload is malformed. The consumer retries it every second forever. What should change?
- Retry with longer delays forever
! It will never succeed.
+ Classify it as permanent and dead-letter it immediately, with an alert
- Delete it silently
! Silent drops are data loss.
- Restart the consumer
! The message would fail again.
> Poison messages go to a DLQ.

? Failed messages move to a retry topic while the consumer continues. What property is lost?
- Durability
! Messages are still stored.
+ Per-key ordering: later events for the same key can be processed before the retried one
- At-least-once delivery
! Retried messages are still delivered.
- Throughput
! Throughput is preserved; that's the point.
> Non-blocking retries trade ordering for throughput.

? Producers send 5,000 msgs/s; consumers handle 4,000/s; the backlog is 3.6M. Producers drop to 2,000/s. How long to drain?
- 15 minutes
! 3.6M ÷ 4,000 ignores ongoing production.
+ 30 minutes (3.6M ÷ (4,000 − 2,000) = 1,800 s)
- 3 hours
! Off by a factor of six.
- It never drains
! Processing now exceeds arrivals.
> Drain time = backlog ÷ (processing − arrival).

? Find the flaw: "We commit the order, then publish OrderPlaced to Kafka in the same request handler."
- Kafka can't receive order events
! It can.
+ A crash between commit and publish loses the event; use a transactional outbox
- Publishing should happen before the commit
! Then a rollback leaves a phantom event.
- The handler should retry the commit
! The commit succeeded; the event is what's lost.
> Write the event to an outbox table in the same transaction.

? Which requirement most justifies event sourcing?
- A blog with occasional edits
! CRUD is enough.
+ A ledger where every change must be auditable and state at any past time must be reconstructable
- High read throughput for product pages
! That's caching and read models, not event sourcing.
- Storing user avatars
! Object storage.
> Event sourcing earns its complexity when history is a requirement.

? Email jobs need per-message retries, delays and a DLQ; order events need replay by many consumers. What is a sensible combination?
+ Kafka for order events; a managed queue (SQS or RabbitMQ) for email jobs
- SQS for both
! No replay or independent consumer groups for order events.
- Kafka for both, with hand-built delays and DLQs
! Possible, but more work than a queue for jobs.
- A database table for both at high volume
! Polling at volume loads the primary.
> Use a log for shared, replayable events and a queue for work.
```

## Where to review

| If you missed questions about… | Reread |
|---|---|
| Synchronous vs asynchronous steps | [Synchronous vs asynchronous](lesson:sync-vs-async) |
| Queues vs topics, competing consumers | [Message queues & pub/sub](lesson:queues-pubsub) |
| Partitions, consumer groups, durability | [Kafka architecture](lesson:kafka) |
| At-least-once, exactly-once, ordering | [Ordering & delivery guarantees](lesson:delivery-semantics) |
| Backoff, poison messages, DLQs | [Retries, backoff & DLQs](lesson:retries-dlq) |
| Lag, bounded buffers, shedding | [Backpressure & load levelling](lesson:backpressure) |
| Dual writes, outbox, CDC | [The outbox pattern & CDC](lesson:outbox-cdc) |
| Event stores, projections | [Event sourcing & CQRS](lesson:event-sourcing-cqrs) |
| Picking a broker | [Kafka vs RabbitMQ vs SQS](lesson:choosing-messaging) |

You now have the foundations for the intermediate problems on real-time and event-driven systems — try
[group chat](problem:chat-application) or [live comments](problem:live-comments) as mock interviews.
