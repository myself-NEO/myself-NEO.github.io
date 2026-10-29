## The problem: retries happen

Networks time out. A client sends "charge ₹500", the server charges the card, but the response is lost. The client doesn't know whether the charge happened, so it **retries**, and the customer is charged twice. Message brokers redeliver messages. Users double-click "Pay". Schedulers re-run jobs after a crash.

An operation is **idempotent** if performing it **once or many times has the same effect**. Idempotency is what makes retries safe — and retries are what make systems reliable.

## Naturally idempotent vs not

| Operation | Idempotent? |
|---|---|
| `setStatus(SHIPPED)` | ✅ Setting the same value twice changes nothing |
| `DELETE /orders/42` | ✅ After the first call it's gone; later calls are no-ops |
| `PUT /profile` (full replacement) | ✅ |
| `balance += 500` | ❌ Each call adds again |
| `POST /payments` (charge) | ❌ Each call charges again |
| `sendEmail()` | ❌ Each call sends again |
| `cancelBooking()` in a state machine | ✅ if "already cancelled" returns success; ❌ if it refunds again |

The non-idempotent ones need a design.

## Technique 1: Idempotency keys

The client generates a **unique key per logical operation** (a UUID, created once and reused for every retry of *that* operation). The server stores the key with the result of the first execution. A retry with the same key **returns the stored result instead of re-executing**.

```java title="An idempotency layer for payments" file="IdempotencyDemo.java"
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public class IdempotencyDemo {
    public static void main(String[] args) throws InterruptedException {
        FakeCardNetwork network = new FakeCardNetwork();
        PaymentService payments = new PaymentService(network);

        PaymentRequest req = new PaymentRequest("order-77", 50_000);
        String key = "8f14e45f-ceea-467a-9a2b-1c9d2f1e0b77";       // generated once by the client

        System.out.println(payments.charge(key, req));
        System.out.println(payments.charge(key, req));             // retry: same result, no new charge

        // 20 concurrent duplicate submissions (a double-click storm)
        ExecutorService pool = Executors.newFixedThreadPool(8);
        CountDownLatch go = new CountDownLatch(1);
        for (int i = 0; i < 20; i++) {
            pool.submit(() -> { go.await(); return payments.charge("dup-key", new PaymentRequest("order-78", 1_000)); });
        }
        go.countDown();
        pool.shutdown();
        pool.awaitTermination(10, TimeUnit.SECONDS);
        System.out.println("network charges made: " + network.charges.get());   // 2: one per key

        try {
            payments.charge(key, new PaymentRequest("order-77", 99_999));       // same key, different body
        } catch (IllegalArgumentException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
    }
}

record PaymentRequest(String orderId, long amountPaise) {}
record PaymentResult(String paymentId, String status, long amountPaise) {}

class FakeCardNetwork {
    final AtomicInteger charges = new AtomicInteger();
    PaymentResult charge(PaymentRequest r) {
        int n = charges.incrementAndGet();
        return new PaymentResult("pay_" + n, "CAPTURED", r.amountPaise());
    }
}

final class PaymentService {
    /** One record per key: the request fingerprint plus the eventual result. */
    private static final class Entry {
        final PaymentRequest request;
        PaymentResult result;                       // guarded by this entry's monitor
        Entry(PaymentRequest request) { this.request = request; }
    }

    private final Map<String, Entry> byKey = new ConcurrentHashMap<>();
    private final FakeCardNetwork network;

    PaymentService(FakeCardNetwork network) { this.network = network; }

    PaymentResult charge(String idempotencyKey, PaymentRequest request) {
        Objects.requireNonNull(idempotencyKey, "idempotency key required");
        Entry entry = byKey.computeIfAbsent(idempotencyKey, k -> new Entry(request));   // atomic claim of the key
        if (!entry.request.equals(request)) {
            throw new IllegalArgumentException("idempotency key reused with a different request");
        }
        synchronized (entry) {                     // concurrent duplicates wait for the first execution
            if (entry.result == null) {
                entry.result = network.charge(request);   // executed at most once per key
            }
            return entry.result;
        }
    }
}
```

Key design points:

- **Atomic claim** of the key (`computeIfAbsent`), so concurrent duplicates can't both execute.
- **Request fingerprinting**: reusing a key with a *different* request is a client bug; reject it.
- **Store the result**, so retries get the same response (same payment ID).
- In production the key store is durable (a database table with a unique constraint), entries **expire** after a retention window (often 24 hours), and an "in progress" marker plus a timeout handles crashes mid-execution.

## Technique 2: Natural keys and unique constraints

Often the domain already has a unique identity for the operation: one payment per order, one booking per (show, seat), one message per message ID. Enforce **uniqueness at the storage layer** (a unique index, or `putIfAbsent`), and treat a duplicate as "already done":

```java
// Message consumer: process each message ID once.
if (processedIds.add(message.id())) {   // Set.add returns false if already present
    handle(message);
}
```

## Technique 3: State machines make transitions idempotent

A transition to a state you're **already in** can be treated as success, without repeating side effects:

```java
synchronized void cancel() {
    if (status == CANCELLED) return;                 // idempotent: no second refund
    if (status != CONFIRMED) throw new IllegalStateException("cannot cancel " + status);
    status = CANCELLED;
    refundOnce();                                    // side effect tied to the transition
}
```

Tie each side effect to a **specific transition**, which happens only once, rather than to the method call, which may be repeated. See [State Machines](lesson:state-machines).

## Exactly-once is (mostly) an illusion

Across a network, you can't guarantee a message is *delivered* exactly once. What you *can* build is **at-least-once delivery plus idempotent processing**, which gives *effectively-once* outcomes. That's the design behind payment APIs (Stripe-style idempotency keys), Kafka consumers with deduplication, and outbox patterns. See [Pub/Sub](problem:pub-sub) and [Payment Workflow](problem:payment-workflow).

## Real-world example

A food delivery app's "Place order" button was sometimes tapped twice on slow networks, creating duplicate orders and duplicate charges. The fix had three layers: the client generated an idempotency key when the checkout screen opened; the API stored key → order ID with a unique constraint; and the payment call reused the order ID as *its* idempotency key with the payment provider. Duplicate orders dropped to zero.

## Common mistakes

- **Generating a new key on every retry** — that defeats the purpose. The key identifies the *logical* operation.
- **Check-then-insert** for keys without atomicity (a race between duplicates).
- **Not storing the result**, so retries get a different response.
- **Side effects outside the idempotent boundary** (sending a confirmation email on every retry).
- **Keys that never expire** (unbounded storage).

## In the interview

> [!INTERVIEW] Where retries meet money
> *"The client sends an idempotency key with each payment request. The service atomically claims the key, executes the charge once, and stores the result. Retries return the stored result. The capture itself is a state transition, AUTHORISED → CAPTURED, so a duplicate capture is a no-op."*

## Key takeaways

- Retries are inevitable; **idempotency** makes them safe.
- Use **idempotency keys** (atomic claim, stored result, request fingerprint, expiry).
- Use **natural keys and uniqueness** where the domain provides them.
- Tie side effects to **state transitions**, so repeating a call doesn't repeat effects.
- Aim for **at-least-once delivery + idempotent processing**.

## Knowledge check

```quiz
? A client retries a payment after a timeout. Which design prevents a double charge?
+ The client reuses the same idempotency key; the server returns the stored result instead of charging again
- The client generates a new UUID for each retry
- The server charges and then refunds duplicates every night
> One key per logical operation, executed at most once.

? Which operation is naturally idempotent?
+ Setting an order's status to SHIPPED when it is already SHIPPED
- Incrementing a counter
- Appending to a log
> Setting a value is idempotent; incrementing and appending are not.

? Why does the server store a fingerprint of the original request with the key?
+ To detect a client reusing a key for a different operation, which is a bug that must be rejected
- To make lookups faster
- To encrypt the payment
> The same key must always mean the same request.
```

## Exercise

A **notification consumer** receives `OrderShipped(orderId, eventId)` messages from a broker with at-least-once delivery. It must send exactly one SMS per order shipment, even if a message is delivered three times, and even if two consumer threads receive the same message concurrently. Design and implement `ShipmentNotifier.handle(event)`. What happens if the process crashes after sending the SMS but before recording it?

````hint title="Hint"
Atomically claim the event ID before sending. Think about the order of "send" and "record" and what each order costs on a crash.
````

````solution title="Sample answer"
```java
final class ShipmentNotifier {
    private final Set<String> claimed = ConcurrentHashMap.newKeySet();   // durable store in production
    private final SmsSender sms;

    void handle(OrderShipped e) {
        if (!claimed.add(e.eventId())) return;            // atomic claim: duplicates are dropped
        try {
            sms.send(e.customerPhone(), "Order " + e.orderId() + " has shipped");
        } catch (RuntimeException ex) {
            claimed.remove(e.eventId());                  // release the claim so redelivery can retry
            throw ex;
        }
    }
}
```

**Crash trade-off:** claim-then-send (above) means a crash *after claiming but before sending* loses the SMS (at-most-once), unless claims are marked "in progress" with a timeout and later re-tried. Send-then-record means a crash between the two sends a duplicate on redelivery (at-least-once). For SMS, an occasional duplicate is usually more acceptable than a missing notification, so many teams choose send-then-record and pass the event ID as an idempotency key to the SMS provider, if it supports one. Stating this trade-off explicitly is the point of the exercise.
````
