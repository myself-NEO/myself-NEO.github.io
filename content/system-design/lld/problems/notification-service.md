## Problem statement

Design a notification service that other parts of a product call to tell users things: "your order shipped", "your OTP is 4821", "20% off today". A notification is rendered from a template and delivered over the channels the user has opted into — email, SMS, push. Providers fail now and then, so transient failures are retried. Adding a new channel (WhatsApp, Slack) must not mean rewriting the service.

> [!TIP] Try it first
> Separate **what** to say (template + variables), **to whom and where** (user preferences), and **how** to deliver it (channel providers). Each answer is a different class.

## Clarifying questions

1. Which channels? Are more coming?
2. Do users choose channels? Per type of message?
3. Templates: who writes them, and what if a variable is missing?
4. What counts as a retryable failure? How many retries?
5. Can callers send the same request twice (retries on their side)?
6. Does anyone need to know about deliveries (audit, metrics)?
7. Synchronous or queued?

````reveal title="Answers we'll assume"
- **Email, SMS and push** now; new channels must be pluggable.
- Users choose channels **per category**: `TRANSACTIONAL` (order updates, OTPs) and `MARKETING` (sales). Opting out of marketing entirely is allowed.
- Templates have `{{variable}}` placeholders; `{{name}}` is filled from the user. A **missing variable rejects the request before anything is sent**.
- Provider timeouts, throttling (429) and 5xx are **transient**: retry up to 3 attempts with exponential backoff. Bad numbers or invalid tokens are **permanent**: don't retry.
- Each request carries an **ID**; a repeated ID is ignored (idempotency).
- Audit and metrics subscribe to **delivery events**.
- We design the synchronous core; queueing is discussed under concurrency.
- The SMS vendor's SDK has its own interface (status codes, no exceptions) that we can't change.
````

## Requirements

**Functional**

1. Register templates and users (with contact details and preferences).
2. `send(request)`: render the template, pick channels from the user's preferences for that category, deliver on each.
3. Retry transient failures with backoff; stop on permanent failures.
4. Ignore duplicate request IDs.
5. Publish delivery events (sent, retrying, failed) to listeners.

**Non-functional**

6. New channels and providers plug in without changing `NotificationService` ([open/closed](lesson:open-closed)).
7. Providers are behind interfaces; tests don't send real messages or sleep.

## Step 1 — Entities

````reveal title="Entities and responsibilities"
| Entity | Responsibility |
|---|---|
| `Template` | Subject and body with placeholders; renders with variables, rejects missing ones |
| `User` | Contact details and channel preferences per category |
| `NotificationRequest` | ID, user, template, category, variables |
| `ChannelSender` | One delivery channel: formats its own message and sends it |
| `SmsSender` | **Adapter** from the vendor's `LegacySmsGateway` to `ChannelSender` |
| `RetryPolicy` + `Sleeper` | How many attempts, how long to wait; waiting is injectable |
| `DeliveryListener` | Observer of delivery events (audit, metrics) |
| `NotificationService` | Orchestrates: idempotency → render → per-channel delivery with retries → events |
````

## Step 2 — Class design

```uml title="Notification service"
class NotificationService
  - senders: Map<Channel, ChannelSender>
  - templates: Map<String, Template>
  - users: Map<String, User>
  - listeners: List<DeliveryListener>
  - processed: Set<String>
  - retry: RetryPolicy
  + send(req: NotificationRequest): List<DeliveryResult>
  + addListener(l: DeliveryListener): void
interface ChannelSender
  + channel(): Channel
  + format(content: Rendered): Message
  + send(user: User, message: Message): void
class OutboxSender
class SmsSender
  - gateway: LegacySmsGateway
class LegacySmsGateway
  + sendText(msisdn: String, text: String): int
record Template
  + id: String
  + subject: String
  + body: String
  + render(vars: Map<String, String>): Rendered
record User
  + id: String
  + name: String
  + preferences: Map<Category, Set<Channel>>
interface DeliveryListener
  + onEvent(e: DeliveryEvent): void
class MetricsListener
record RetryPolicy
  + maxAttempts: int
  + initialBackoff: Duration
  + multiplier: int
NotificationService o-- "1..*" ChannelSender
NotificationService o-- "0..*" DeliveryListener
NotificationService --> RetryPolicy
NotificationService ..> Template
OutboxSender ..|> ChannelSender
SmsSender ..|> ChannelSender
SmsSender --> LegacySmsGateway : adapts
MetricsListener ..|> DeliveryListener
```

## Step 3 — Implementation

````hint title="Hint — two kinds of failure"
Model failures as two exception types: `TransientDeliveryException` (retry with backoff) and `PermanentDeliveryException` (give up now). The SMS adapter is where vendor status codes become one or the other — the rest of the service never sees a status code.
````

````solution title="Complete Java solution"
```java title="NotificationDemo.java" file="NotificationDemo.java"
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Deque;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class NotificationDemo {
    public static void main(String[] args) {
        LegacySmsGateway smsApi = new LegacySmsGateway();
        OutboxSender email = new OutboxSender(Channel.EMAIL);
        OutboxSender push = new OutboxSender(Channel.PUSH);
        FakeSleeper sleeper = new FakeSleeper();
        NotificationService service = new NotificationService(
                List.of(email, new SmsSender(smsApi), push), new RetryPolicy(3, Duration.ofMillis(200), 2), sleeper);
        MetricsListener metrics = new MetricsListener();
        service.addListener(e -> System.out.println("  " + e));
        service.addListener(metrics);

        service.addTemplate(new Template("ORDER_SHIPPED", "Order {{orderId}} shipped", "Hi {{name}}, your order {{orderId}} is on its way."));
        service.addTemplate(new Template("SALE", "Sale today", "Hi {{name}}, everything is {{discount}}% off today."));
        service.addUser(new User("u1", "Asha", "asha@example.com", "+919800000001", "device-1",
                Map.of(Category.TRANSACTIONAL, EnumSet.allOf(Channel.class), Category.MARKETING, EnumSet.of(Channel.EMAIL))));
        service.addUser(new User("u2", "Ravi", "ravi@example.com", null, null,
                Map.of(Category.TRANSACTIONAL, EnumSet.of(Channel.EMAIL, Channel.SMS), Category.MARKETING, EnumSet.noneOf(Channel.class))));

        NotificationRequest n1 = new NotificationRequest("N1", "u1", "ORDER_SHIPPED", Category.TRANSACTIONAL, Map.of("orderId", "A-17"));
        smsApi.failNext(503);                                          // first SMS attempt hits a provider hiccup
        System.out.println("N1 order shipped -> Asha");
        service.send(n1);
        System.out.println("N1 sent again -> " + service.send(n1));
        System.out.println("N2 sale -> Ravi (opted out) -> "
                + service.send(new NotificationRequest("N2", "u2", "SALE", Category.MARKETING, Map.of("discount", "20"))));
        System.out.println("N3 order shipped -> Ravi");
        service.send(new NotificationRequest("N3", "u2", "ORDER_SHIPPED", Category.TRANSACTIONAL, Map.of("orderId", "B-9")));
        try {
            service.send(new NotificationRequest("N4", "u1", "ORDER_SHIPPED", Category.TRANSACTIONAL, Map.of()));
        } catch (NotificationException e) {
            System.out.println("N4 rejected: " + e.getMessage());
        }
        smsApi.failNext(503, 503, 503);
        System.out.println("N5 order shipped -> Asha, SMS provider down");
        service.send(new NotificationRequest("N5", "u1", "ORDER_SHIPPED", Category.TRANSACTIONAL, Map.of("orderId", "A-18")));

        System.out.println("backoff waits (ms): " + sleeper.waits());
        System.out.println("email outbox: " + email.outbox());
        System.out.println("sms delivered: " + smsApi.delivered());
        System.out.println("metrics: " + metrics);
    }
}

// ---------- Model ----------

enum Channel { EMAIL, SMS, PUSH }
enum Category { TRANSACTIONAL, MARKETING }
enum DeliveryStatus { SENT, RETRYING, FAILED }

record User(String id, String name, String email, String phone, String deviceToken, Map<Category, Set<Channel>> preferences) {
    Set<Channel> channelsFor(Category c) { return preferences.getOrDefault(c, Set.of()); }
}

record NotificationRequest(String id, String userId, String templateId, Category category, Map<String, String> vars) {}
record Rendered(String subject, String body) {}
record Message(String title, String body) {}
record DeliveryResult(Channel channel, DeliveryStatus status, int attempts) {}

record DeliveryEvent(String notificationId, Channel channel, DeliveryStatus status, int attempt, String detail) {
    @Override public String toString() {
        return "[" + notificationId + "] " + channel + " " + status + " attempt " + attempt + (detail.isEmpty() ? "" : " (" + detail + ")");
    }
}

class NotificationException extends RuntimeException {
    NotificationException(String message) { super(message); }
}

/** Worth retrying: timeouts, throttling, 5xx. */
class TransientDeliveryException extends RuntimeException {
    TransientDeliveryException(String message) { super(message); }
}

/** Retrying won't help: bad address, invalid token, rejected content. */
class PermanentDeliveryException extends RuntimeException {
    PermanentDeliveryException(String message) { super(message); }
}

record Template(String id, String subject, String body) {
    private static final Pattern VAR = Pattern.compile("\\{\\{(\\w+)\\}\\}");

    Rendered render(Map<String, String> vars) { return new Rendered(fill(subject, vars), fill(body, vars)); }

    private static String fill(String text, Map<String, String> vars) {
        Matcher m = VAR.matcher(text);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            String value = vars.get(m.group(1));
            if (value == null) throw new NotificationException("missing template variable '" + m.group(1) + "'");
            m.appendReplacement(out, Matcher.quoteReplacement(value));
        }
        m.appendTail(out);
        return out.toString();
    }
}

// ---------- Channels ----------

interface ChannelSender {
    Channel channel();

    /** Factory method: each channel decides what its message looks like. */
    default Message format(Rendered content) { return new Message(content.subject(), content.body()); }

    void send(User user, Message message);
}

/** Stands in for an SMTP or push provider: records what would have been sent. */
final class OutboxSender implements ChannelSender {
    private final Channel channel;
    private final List<String> outbox = new CopyOnWriteArrayList<>();

    OutboxSender(Channel channel) { this.channel = channel; }

    public Channel channel() { return channel; }

    public void send(User user, Message message) {
        String address = channel == Channel.EMAIL ? user.email() : user.deviceToken();
        if (address == null) throw new PermanentDeliveryException("no " + channel.name().toLowerCase() + " address");
        outbox.add(address + ": " + message.title());
    }

    List<String> outbox() { return List.copyOf(outbox); }
}

/** A vendor SDK we can't change: its own method names, number format, and status codes instead of exceptions. */
class LegacySmsGateway {
    private final Deque<Integer> scriptedFailures = new ArrayDeque<>();
    private final List<String> delivered = new ArrayList<>();

    synchronized int sendText(String msisdn, String text) {
        Integer failure = scriptedFailures.poll();
        if (failure != null) return failure;
        delivered.add(msisdn);
        return 200;
    }

    synchronized void failNext(Integer... codes) { scriptedFailures.addAll(List.of(codes)); }
    synchronized List<String> delivered() { return List.copyOf(delivered); }
}

/** Adapter: makes the vendor gateway look like any other ChannelSender. */
final class SmsSender implements ChannelSender {
    private static final int MAX_LENGTH = 160;
    private final LegacySmsGateway gateway;

    SmsSender(LegacySmsGateway gateway) { this.gateway = gateway; }

    public Channel channel() { return Channel.SMS; }

    @Override public Message format(Rendered content) {
        String text = content.body();                                // SMS has no subject and a length limit
        return new Message(null, text.length() <= MAX_LENGTH ? text : text.substring(0, MAX_LENGTH - 3) + "...");
    }

    public void send(User user, Message message) {
        if (user.phone() == null) throw new PermanentDeliveryException("no phone number");
        int code = gateway.sendText(user.phone().replace("+", ""), message.body());
        if (code == 200) return;
        if (code == 429 || code >= 500) throw new TransientDeliveryException("gateway returned " + code);
        throw new PermanentDeliveryException("gateway rejected the message (" + code + ")");
    }
}

// ---------- Retries ----------

record RetryPolicy(int maxAttempts, Duration initialBackoff, int multiplier) {
    /** Wait before attempt n+1, after attempt n failed: initial, initial*m, initial*m^2, ... */
    Duration backoffAfter(int attempt) {
        long factor = 1;
        for (int i = 1; i < attempt; i++) factor *= multiplier;
        return initialBackoff.multipliedBy(factor);
    }
}

interface Sleeper { void sleep(Duration d); }

final class FakeSleeper implements Sleeper {
    private final List<Long> waits = new CopyOnWriteArrayList<>();
    public void sleep(Duration d) { waits.add(d.toMillis()); }
    List<Long> waits() { return List.copyOf(waits); }
}

// ---------- Observers ----------

interface DeliveryListener { void onEvent(DeliveryEvent event); }

final class MetricsListener implements DeliveryListener {
    private final Map<DeliveryStatus, Integer> counts = new EnumMap<>(DeliveryStatus.class);
    public synchronized void onEvent(DeliveryEvent e) { counts.merge(e.status(), 1, Integer::sum); }
    @Override public synchronized String toString() { return counts.toString(); }
}

// ---------- Service ----------

final class NotificationService {
    private final Map<Channel, ChannelSender> senders = new EnumMap<>(Channel.class);
    private final Map<String, Template> templates = new HashMap<>();
    private final Map<String, User> users = new HashMap<>();
    private final List<DeliveryListener> listeners = new CopyOnWriteArrayList<>();
    private final Set<String> processed = ConcurrentHashMap.newKeySet();
    private final RetryPolicy retry;
    private final Sleeper sleeper;

    NotificationService(Collection<ChannelSender> senders, RetryPolicy retry, Sleeper sleeper) {
        senders.forEach(s -> this.senders.put(s.channel(), s));
        this.retry = retry;
        this.sleeper = sleeper;
    }

    void addTemplate(Template t) { templates.put(t.id(), t); }
    void addUser(User u) { users.put(u.id(), u); }
    void addListener(DeliveryListener l) { listeners.add(l); }

    List<DeliveryResult> send(NotificationRequest req) {
        User user = users.get(req.userId());
        Template template = templates.get(req.templateId());
        if (user == null || template == null) throw new NotificationException("unknown user or template");
        Map<String, String> vars = new HashMap<>(req.vars());
        vars.putIfAbsent("name", user.name());
        Rendered content = template.render(vars);                  // fail fast, before anything is sent
        if (!processed.add(req.id())) return List.of();            // duplicate request: already handled

        Set<Channel> wanted = user.channelsFor(req.category());
        List<DeliveryResult> results = new ArrayList<>();
        for (Channel channel : Channel.values()) {                 // fixed order: EMAIL, SMS, PUSH
            ChannelSender sender = senders.get(channel);
            if (wanted.contains(channel) && sender != null) results.add(deliver(req.id(), user, sender, content));
        }
        return results;
    }

    private DeliveryResult deliver(String id, User user, ChannelSender sender, Rendered content) {
        Message message = sender.format(content);
        for (int attempt = 1; ; attempt++) {
            try {
                sender.send(user, message);
                return finish(id, sender.channel(), DeliveryStatus.SENT, attempt, "");
            } catch (PermanentDeliveryException e) {
                return finish(id, sender.channel(), DeliveryStatus.FAILED, attempt, e.getMessage());
            } catch (TransientDeliveryException e) {
                if (attempt == retry.maxAttempts()) return finish(id, sender.channel(), DeliveryStatus.FAILED, attempt, e.getMessage());
                publish(new DeliveryEvent(id, sender.channel(), DeliveryStatus.RETRYING, attempt, e.getMessage()));
                sleeper.sleep(retry.backoffAfter(attempt));
            }
        }
    }

    private DeliveryResult finish(String id, Channel channel, DeliveryStatus status, int attempt, String detail) {
        publish(new DeliveryEvent(id, channel, status, attempt, detail));
        return new DeliveryResult(channel, status, attempt);
    }

    private void publish(DeliveryEvent event) {
        for (DeliveryListener l : listeners) {
            try {
                l.onEvent(event);
            } catch (RuntimeException ignored) {
                // a broken listener must not break delivery
            }
        }
    }
}
```
````

## Design decisions

- **One interface per channel.** `NotificationService` loops over `ChannelSender`s and never mentions email or SMS. Adding WhatsApp is a new class registered at start-up (see [Dependency inversion](lesson:dependency-inversion)).
- **Adapter at the vendor boundary.** `SmsSender` converts the SDK's phone format and status codes into our exceptions. If we switch SMS vendors, only the adapter changes (see [Adapter](lesson:adapter)).
- **Factory method for message shape.** Each sender's `format` builds its own `Message`: email and push keep the subject; SMS drops it and truncates to 160 characters.
- **Render before claiming the ID.** A request with a missing variable is rejected without being marked processed, so the caller can fix it and resend with the same ID.
- **Observers for side concerns.** Audit logs, metrics and alerting subscribe to `DeliveryEvent`s; the delivery loop doesn't know they exist, and a failing listener can't break delivery (see [Observer](lesson:observer)).
- **Injectable sleeping.** Backoff goes through a `Sleeper`, so the demo and tests run instantly while still checking the wait times.

## Patterns and principles

[Strategy](lesson:strategy) (channels), [Adapter](lesson:adapter) (`SmsSender`), [Observer](lesson:observer) (`DeliveryListener`), [Factory Method](lesson:factory-method) (`ChannelSender.format`), [open/closed](lesson:open-closed), [dependency inversion](lesson:dependency-inversion), and [idempotency](lesson:idempotency) by request ID.

## Example execution flow

```text
send(N1 -> Asha, TRANSACTIONAL)   render "Order A-17 shipped"; claim N1
  EMAIL   format(subject+body) -> send OK
  SMS     format(body only) -> gateway 503 -> transient -> RETRYING, wait 200ms -> 200 -> SENT
  PUSH    send OK
send(N1) again                     N1 already processed -> []
send(N2 -> Ravi, MARKETING)        Ravi's MARKETING channels: none -> []
send(N3 -> Ravi)                   EMAIL OK; SMS: no phone -> permanent -> FAILED (no retry)
send(N4, no orderId)               render fails -> rejected, N4 not claimed
send(N5 -> Asha), SMS down         503, wait 200ms, 503, wait 400ms, 503 -> FAILED after 3 attempts
```

```text title="Program output"
N1 order shipped -> Asha
  [N1] EMAIL SENT attempt 1
  [N1] SMS RETRYING attempt 1 (gateway returned 503)
  [N1] SMS SENT attempt 2
  [N1] PUSH SENT attempt 1
N1 sent again -> []
N2 sale -> Ravi (opted out) -> []
N3 order shipped -> Ravi
  [N3] EMAIL SENT attempt 1
  [N3] SMS FAILED attempt 1 (no phone number)
N4 rejected: missing template variable 'orderId'
N5 order shipped -> Asha, SMS provider down
  [N5] EMAIL SENT attempt 1
  [N5] SMS RETRYING attempt 1 (gateway returned 503)
  [N5] SMS RETRYING attempt 2 (gateway returned 503)
  [N5] SMS FAILED attempt 3 (gateway returned 503)
  [N5] PUSH SENT attempt 1
backoff waits (ms): [200, 200, 400]
email outbox: [asha@example.com: Order A-17 shipped, ravi@example.com: Order B-9 shipped, asha@example.com: Order A-18 shipped]
sms delivered: [919800000001]
metrics: {SENT=6, RETRYING=3, FAILED=2}
```

## Edge cases

- **Duplicate request ID** → ignored, nothing is sent twice.
- **Missing template variable** → rejected before any channel is touched; the ID stays usable.
- **User opted out of a category** → nothing is sent; that's success, not an error.
- **Missing contact detail** (no phone) → permanent failure for that channel only; other channels still deliver.
- **Provider throttling or outage** → bounded retries with exponential backoff, then `FAILED`.
- **A listener throws** → swallowed; delivery continues.
- **Very long SMS** → truncated by the SMS sender's `format`.

## Tests

```java title="NotificationTest.java" file="NotificationTest.java" test="NotificationDemo.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class NotificationTest {
    private LegacySmsGateway smsApi;
    private OutboxSender email;
    private FakeSleeper sleeper;
    private NotificationService service;

    @BeforeEach
    void setUp() {
        smsApi = new LegacySmsGateway();
        email = new OutboxSender(Channel.EMAIL);
        sleeper = new FakeSleeper();
        service = new NotificationService(List.of(email, new SmsSender(smsApi)), new RetryPolicy(3, Duration.ofMillis(100), 3), sleeper);
        service.addTemplate(new Template("T", "Hello {{name}}", "Code {{code}}"));
        service.addUser(new User("u", "Asha", "a@x.com", "+1555", null,
                Map.of(Category.TRANSACTIONAL, EnumSet.of(Channel.EMAIL, Channel.SMS), Category.MARKETING, EnumSet.noneOf(Channel.class))));
    }

    private NotificationRequest req(String id, Category c) {
        return new NotificationRequest(id, "u", "T", c, Map.of("code", "42"));
    }

    @Test
    void deliversOnEveryPreferredChannel() {
        List<DeliveryResult> results = service.send(req("1", Category.TRANSACTIONAL));
        assertEquals(List.of(new DeliveryResult(Channel.EMAIL, DeliveryStatus.SENT, 1), new DeliveryResult(Channel.SMS, DeliveryStatus.SENT, 1)), results);
        assertEquals(List.of("a@x.com: Hello Asha"), email.outbox());
    }

    @Test
    void duplicateIdIsIgnored() {
        service.send(req("1", Category.TRANSACTIONAL));
        assertEquals(List.of(), service.send(req("1", Category.TRANSACTIONAL)));
        assertEquals(1, email.outbox().size());
    }

    @Test
    void optedOutCategorySendsNothing() {
        assertEquals(List.of(), service.send(req("1", Category.MARKETING)));
    }

    @Test
    void transientFailuresRetryWithExponentialBackoff() {
        smsApi.failNext(503, 429);
        List<DeliveryResult> results = service.send(req("1", Category.TRANSACTIONAL));
        assertEquals(new DeliveryResult(Channel.SMS, DeliveryStatus.SENT, 3), results.get(1));
        assertEquals(List.of(100L, 300L), sleeper.waits());
    }

    @Test
    void permanentFailureIsNotRetried() {
        smsApi.failNext(400);
        assertEquals(new DeliveryResult(Channel.SMS, DeliveryStatus.FAILED, 1), service.send(req("1", Category.TRANSACTIONAL)).get(1));
        assertTrue(sleeper.waits().isEmpty());
    }

    @Test
    void missingVariableRejectsWithoutClaimingTheId() {
        assertThrows(NotificationException.class, () -> service.send(new NotificationRequest("1", "u", "T", Category.TRANSACTIONAL, Map.of())));
        assertEquals(2, service.send(req("1", Category.TRANSACTIONAL)).size());
    }

    @Test
    void smsIsTruncatedTo160Characters() {
        Message m = new SmsSender(smsApi).format(new Rendered("s", "x".repeat(200)));
        assertEquals(160, m.body().length());
    }
}
```

## Concurrency

- **Idempotency under races:** `processed` is a concurrent set and `add` is atomic, so two simultaneous sends of the same ID deliver once.
- **Don't send on the caller's thread in production.** `send` would enqueue the request (a durable queue), and a pool of workers would deliver. Retries with backoff then don't block the caller.
- **Bulkheads per channel:** give each channel its own worker pool or queue, so an SMS outage (lots of retries) can't starve email delivery (see [Scarcity](lesson:scarcity)).
- **Listeners** are stored in a `CopyOnWriteArrayList`: registering a listener while events are being published is safe.

## Common mistakes and alternatives

- **`if (channel == EMAIL) ... else if (channel == SMS)`** inside the service — every new channel edits it.
- **Retrying everything** — retrying a bad phone number just burns money and quota.
- **Retrying without backoff** — hammers a provider that is already struggling.
- **Marking the ID processed before validation** — a fixable bad request becomes unfixable.
- **Leaking vendor status codes** into the service — the next vendor uses different ones.
- **Alternative:** a decorator `RetryingSender` that wraps any `ChannelSender` with retry logic; nice if different channels need different retry policies.

## Follow-up questions

````reveal title="Fallback channels"
If push fails permanently (the device token is gone), send by SMS instead. Model it as a per-category **fallback chain** in preferences (`[PUSH, SMS]` meaning "try in order until one succeeds") versus **fan-out** (`{EMAIL, SMS}` meaning "send on all"). The delivery loop picks the mode from the preference.
````

````reveal title="Quiet hours and rate limits per user"
Before delivery, a chain of **filters** decides whether to send now, delay or drop: quiet hours (delay marketing until 9am in the user's time zone), frequency caps (at most 3 marketing messages a day), and global kill switches. Each filter is a small class; they run in order.
````

````reveal title="Templates per language"
Key templates by `(templateId, locale)` with a fallback to the default locale. The user's locale is part of `User`; rendering picks the best match. The rest of the flow is unchanged.
````

## Complexity

- `send`: O(C × A) channel calls for C channels and A attempts at most, plus O(length) template rendering.
- Idempotency check: O(1).

## Interviewer checklist

- [ ] Channel abstraction; service closed to modification
- [ ] Adapter around a third-party SDK
- [ ] Templates with validation of variables
- [ ] Preferences per category, opt-outs respected
- [ ] Transient vs permanent failures; bounded exponential backoff
- [ ] Idempotency by request ID
- [ ] Observer for audit and metrics; async delivery discussed
