## Problem statement

Design an approval workflow engine for expense requests. Depending on the amount, a request must be approved by a chain of people: always the requester's manager, then finance above 1,000, then a director above 10,000. Approvers act in order; any of them can reject. If an approver doesn't act within the step's deadline (SLA), the step **escalates** to that approver's manager. Every action is recorded in an **audit trail** that can't be edited.

> [!TIP] Try it first
> Separate the **definition** (which steps exist, when they apply, who approves, the SLA) from the **instance** (this request, its current step, its history). Then model each thing a person or the system can do to an instance as an object.

## Clarifying questions

1. Is the chain fixed, or does it depend on the request? Who configures it?
2. Must approvals happen in order, or in parallel?
3. Who can reject, withdraw, or approve? Can someone approve their own request?
4. What exactly happens on escalation? What if there's no one to escalate to?
5. What must the audit trail contain? Can entries change?
6. Can two people act on the same request at the same time?

````reveal title="Answers we'll assume"
- The chain is built **per request** from a configured list of steps; each step decides whether it applies (amount thresholds today, category or department tomorrow).
- Steps run **in order**; parallel steps are a follow-up.
- The current step's approver may approve or reject. The requester may **withdraw** while the request is pending. **Nobody approves their own request**, even if the org chart routes it back to them.
- Escalation moves the current step to the approver's **manager** and restarts the SLA clock; if the approver has no manager, it stays put and is reported.
- The audit trail records **who, what, when, which step, and the resulting status**. It's append-only.
- Yes, concurrent actions happen (an approval racing an escalation); each request is changed by one action at a time.
````

## Requirements

**Functional**

1. Configure a workflow as an ordered list of steps (condition, approver resolver, SLA).
2. `submit` builds the request's chain; `approve`, `reject`, `withdraw` act on the current step.
3. `escalateOverdue()` escalates steps whose SLA has passed.
4. Each user can see their inbox (requests waiting for them).
5. A complete, immutable audit trail per request.

**Non-functional**

6. New steps and new actions (delegate, request changes) don't require changing the engine.
7. Safe under concurrent actions; time is injectable.

## Step 1 — Definition vs instance

````reveal title="Chain of responsibility, built per request"
The **definition** is a list of `ApprovalStep`s; each one answers "do I apply to this request?" and "who approves?". At submission the engine walks the list and keeps the steps that apply — the chain of responsibility for this request:

```text
steps:   manager (always, 2 days) -> finance (> 1000, 1 day) -> director (> 10000, 3 days)
E1 800:   [manager: ravi]
E2 15000: [manager: ravi] -> [finance: fiona] -> [director: dana]
```

The request then passes from one handler to the next as each approves; a rejection stops it anywhere along the chain.
````

````reveal title="Actions as commands"
`Approve`, `Reject`, `Withdraw` and `Escalate` are **command** objects with one method: validate against the request's current state, change it, and append an audit entry. The engine just runs commands under the request's lock. A new action — `Delegate(to)`, `RequestChanges` — is a new command class; the engine and the existing commands don't change.
````

## Step 2 — Request lifecycle

```states title="Approval request"
[*] --> PENDING : submit / chain built, step 1 starts
PENDING --> PENDING : approve [more steps] / next step starts
PENDING --> PENDING : escalate [SLA passed] / approver = their manager
PENDING --> APPROVED : approve [last step]
PENDING --> REJECTED : reject (current approver)
PENDING --> WITHDRAWN : withdraw (requester)
APPROVED --> [*]
REJECTED --> [*]
WITHDRAWN --> [*]
```

## Step 3 — Class design

```uml title="Approval workflow"
class ApprovalEngine
  - requests: Map<String, ApprovalRequest>
  - steps: List<ApprovalStep>
  - org: OrgChart
  - clock: Clock
  + submit(requester: String, amount: long, purpose: String): ApprovalRequest
  + execute(requestId: String, c: Command): void
  + escalateOverdue(): int
  + inbox(approver: String): List<String>
record ApprovalStep
  + name: String
  + appliesTo: Predicate<ApprovalRequest>
  + approver: Function<ApprovalRequest, String>
  + sla: Duration
class ApprovalRequest
  - chain: List<StepInstance>
  - current: int
  - status: RequestStatus
  - audit: List<AuditEntry>
class StepInstance
  - name: String
  - approver: String
  - startedAt: Instant
interface Command
  + actor(): String
  + execute(r: ApprovalRequest, ctx: Context): void
record Approve
record Reject
record Withdraw
record Escalate
record AuditEntry
  + at: Instant
  + actor: String
  + action: String
  + step: String
  + detail: String
  + status: RequestStatus
class OrgChart
  + managerOf(person: String): Optional<String>
ApprovalEngine o-- "0..*" ApprovalRequest
ApprovalEngine o-- "1..*" ApprovalStep
ApprovalEngine --> OrgChart
ApprovalRequest *-- "1..*" StepInstance
ApprovalRequest *-- "1..*" AuditEntry
ApprovalEngine ..> Command
Approve ..|> Command
Reject ..|> Command
Withdraw ..|> Command
Escalate ..|> Command
```

## Step 4 — Implementation

````hint title="Hint — the request guards its own invariants"
Keep the transition logic in `ApprovalRequest` (`advance`, `finish`, `reassign`), each of which also appends to the audit log. Commands decide **whether** an action is allowed (right person, right status); the request decides **how** its state changes. Then no command can change state without leaving an audit entry.
````

````solution title="Complete Java solution"
```java title="ApprovalWorkflowDemo.java" file="ApprovalWorkflowDemo.java"
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.stream.Collectors;

public class ApprovalWorkflowDemo {
    public static void main(String[] args) {
        MutableClock clock = new MutableClock(Instant.parse("2026-05-04T09:00:00Z"));
        OrgChart org = new OrgChart(Map.of("asha", "ravi", "ravi", "dana", "fiona", "frank", "frank", "dana"));
        List<ApprovalStep> expensePolicy = List.of(
                new ApprovalStep("manager", r -> true, r -> org.managerOf(r.requester()).orElseThrow(), Duration.ofDays(2)),
                new ApprovalStep("finance", r -> r.amount() > 1_000, r -> "fiona", Duration.ofDays(1)),
                new ApprovalStep("director", r -> r.amount() > 10_000, r -> "dana", Duration.ofDays(3)));
        ApprovalEngine engine = new ApprovalEngine(expensePolicy, org, clock);

        ApprovalRequest e1 = engine.submit("asha", 800, "team lunch");
        engine.execute(e1.id(), new Approve("ravi", "enjoy"));
        System.out.println(e1.id() + " (800): " + e1.status());

        ApprovalRequest e2 = engine.submit("asha", 15_000, "laptop");
        System.out.println(e2.id() + " chain: " + e2.chainDescription());
        attempt(() -> engine.execute(e2.id(), new Approve("fiona", "fine")));
        clock.advance(Duration.ofHours(3));
        engine.execute(e2.id(), new Approve("ravi", "needed for the new project"));
        System.out.println("fiona's inbox: " + engine.inbox("fiona"));
        clock.advance(Duration.ofHours(12));
        System.out.println("escalated after 12h: " + engine.escalateOverdue());
        clock.advance(Duration.ofHours(13));
        System.out.println("escalated after 25h: " + engine.escalateOverdue() + ", frank's inbox: " + engine.inbox("frank"));
        engine.execute(e2.id(), new Approve("frank", "within budget"));
        engine.execute(e2.id(), new Approve("dana", "ok"));

        ApprovalRequest e3 = engine.submit("asha", 3_000, "conference");
        engine.execute(e3.id(), new Reject("ravi", "not in this quarter's budget"));
        attempt(() -> engine.execute(e3.id(), new Withdraw("asha")));

        ApprovalRequest e4 = engine.submit("fiona", 2_000, "training");
        engine.execute(e4.id(), new Approve("frank", "go"));
        attempt(() -> engine.execute(e4.id(), new Approve("fiona", "self-approve")));
        engine.execute(e4.id(), new Withdraw("fiona"));

        for (ApprovalRequest r : List.of(e2, e3, e4)) {
            System.out.println(r.id() + " " + r.status() + ":");
            r.audit().forEach(a -> System.out.println("  " + a));
        }
    }

    static void attempt(Runnable action) {
        try {
            action.run();
        } catch (WorkflowException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
    }
}

class WorkflowException extends RuntimeException {
    WorkflowException(String message) { super(message); }
}

enum RequestStatus { PENDING, APPROVED, REJECTED, WITHDRAWN }

final class OrgChart {
    private final Map<String, String> managerOf;
    OrgChart(Map<String, String> managerOf) { this.managerOf = Map.copyOf(managerOf); }
    Optional<String> managerOf(String person) { return Optional.ofNullable(managerOf.get(person)); }
}

/** Definition: when a step applies, who approves it, and how long they have. */
record ApprovalStep(String name, Predicate<ApprovalRequest> appliesTo, Function<ApprovalRequest, String> approver, Duration sla) {}

record AuditEntry(Instant at, String actor, String action, String step, String detail, RequestStatus status) {
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("MM-dd HH:mm").withZone(ZoneOffset.UTC);

    @Override public String toString() {
        return TIME.format(at) + " " + actor + " " + action + (step == null ? "" : " [" + step + "]")
                + (detail.isEmpty() ? "" : " \"" + detail + "\"") + " -> " + status;
    }
}

final class StepInstance {
    final String name;
    final Duration sla;
    String approver;
    Instant startedAt;

    StepInstance(String name, String approver, Duration sla) {
        this.name = name;
        this.approver = approver;
        this.sla = sla;
    }
}

/** Instance: one request's chain, position, status and audit log. Mutated only while the engine holds its lock. */
final class ApprovalRequest {
    private final String id;
    private final String requester;
    private final long amount;
    private final String purpose;
    private final List<StepInstance> chain = new ArrayList<>();
    private final List<AuditEntry> audit = new ArrayList<>();
    private int current;
    private RequestStatus status = RequestStatus.PENDING;

    ApprovalRequest(String id, String requester, long amount, String purpose) {
        this.id = id; this.requester = requester; this.amount = amount; this.purpose = purpose;
    }

    String id() { return id; }
    String requester() { return requester; }
    long amount() { return amount; }
    String purpose() { return purpose; }
    synchronized RequestStatus status() { return status; }
    synchronized List<AuditEntry> audit() { return Collections.unmodifiableList(new ArrayList<>(audit)); }
    synchronized StepInstance currentStep() { return status == RequestStatus.PENDING ? chain.get(current) : null; }

    synchronized String chainDescription() {
        return chain.stream().map(s -> s.name + ":" + s.approver).collect(Collectors.joining(" -> "));
    }

    void start(List<StepInstance> steps, Instant now) {
        chain.addAll(steps);
        chain.get(0).startedAt = now;
        log(now, requester, "SUBMITTED", null, purpose + ", " + amount + "; chain " + chainDescription());
    }

    void advance(Instant now, String actor, String comment) {
        StepInstance step = chain.get(current);
        if (++current == chain.size()) status = RequestStatus.APPROVED;
        else chain.get(current).startedAt = now;                 // the next step's SLA starts now
        log(now, actor, "APPROVED", step.name, comment);
    }

    void finish(Instant now, String actor, RequestStatus end, String action, String comment) {
        StepInstance step = chain.get(current);
        status = end;
        log(now, actor, action, step.name, comment);
    }

    void reassign(Instant now, String to, String reason) {
        StepInstance step = chain.get(current);
        String from = step.approver;
        step.approver = to;
        step.startedAt = now;                                    // a fresh SLA window for the new approver
        log(now, "system", "ESCALATED", step.name, from + " -> " + to + ", " + reason);
    }

    private void log(Instant at, String actor, String action, String step, String detail) {
        audit.add(new AuditEntry(at, actor, action, step, detail, status));
    }
}

// ---------- Commands ----------

record Context(Clock clock, OrgChart org) {
    Instant now() { return clock.instant(); }
}

sealed interface Command permits Approve, Reject, Withdraw, Escalate {
    String actor();
    void execute(ApprovalRequest r, Context ctx);

    /** Shared guard for approver actions. */
    static StepInstance requireCurrentApprover(ApprovalRequest r, String actor) {
        if (r.status() != RequestStatus.PENDING) throw new WorkflowException(r.id() + " is already " + r.status());
        if (actor.equals(r.requester())) throw new WorkflowException(actor + " cannot approve their own request " + r.id());
        StepInstance step = r.currentStep();
        if (!step.approver.equals(actor)) throw new WorkflowException(r.id() + " is waiting for " + step.approver + " (" + step.name + " step), not " + actor);
        return step;
    }
}

record Approve(String actor, String comment) implements Command {
    public void execute(ApprovalRequest r, Context ctx) {
        Command.requireCurrentApprover(r, actor);
        r.advance(ctx.now(), actor, comment);
    }
}

record Reject(String actor, String reason) implements Command {
    public void execute(ApprovalRequest r, Context ctx) {
        Command.requireCurrentApprover(r, actor);
        r.finish(ctx.now(), actor, RequestStatus.REJECTED, "REJECTED", reason);
    }
}

record Withdraw(String actor) implements Command {
    public void execute(ApprovalRequest r, Context ctx) {
        if (!actor.equals(r.requester())) throw new WorkflowException("only " + r.requester() + " can withdraw " + r.id());
        if (r.status() != RequestStatus.PENDING) throw new WorkflowException(r.id() + " is already " + r.status());
        r.finish(ctx.now(), actor, RequestStatus.WITHDRAWN, "WITHDRAWN", "");
    }
}

record Escalate() implements Command {
    public String actor() { return "system"; }

    public void execute(ApprovalRequest r, Context ctx) {
        StepInstance step = r.currentStep();
        if (step == null) return;
        Duration waited = Duration.between(step.startedAt, ctx.now());
        if (waited.compareTo(step.sla) < 0) return;                       // not overdue (re-checked under the lock)
        Optional<String> manager = ctx.org().managerOf(step.approver)
                .filter(m -> !m.equals(r.requester()));                    // never escalate to the requester
        if (manager.isEmpty()) throw new WorkflowException("no one to escalate " + r.id() + " to from " + step.approver);
        r.reassign(ctx.now(), manager.get(), "SLA " + step.sla.toHours() + "h exceeded");
    }
}

// ---------- Engine ----------

final class ApprovalEngine {
    private final Map<String, ApprovalRequest> requests = new ConcurrentHashMap<>();
    private final List<ApprovalStep> steps;
    private final Context ctx;
    private final AtomicLong ids = new AtomicLong();

    ApprovalEngine(List<ApprovalStep> steps, OrgChart org, Clock clock) {
        this.steps = List.copyOf(steps);
        this.ctx = new Context(clock, org);
    }

    ApprovalRequest submit(String requester, long amount, String purpose) {
        if (amount <= 0) throw new WorkflowException("amount must be positive");
        ApprovalRequest r = new ApprovalRequest("E" + ids.incrementAndGet(), requester, amount, purpose);
        List<StepInstance> chain = new ArrayList<>();
        for (ApprovalStep s : steps) {                                      // chain of responsibility for this request
            if (s.appliesTo().test(r)) chain.add(new StepInstance(s.name(), s.approver().apply(r), s.sla()));
        }
        if (chain.isEmpty()) throw new WorkflowException("no approval step applies to this request");
        synchronized (r) {
            r.start(chain, ctx.now());
        }
        requests.put(r.id(), r);
        return r;
    }

    void execute(String requestId, Command command) {
        ApprovalRequest r = requests.get(requestId);
        if (r == null) throw new WorkflowException("no request " + requestId);
        synchronized (r) {                                                  // one action per request at a time
            command.execute(r, ctx);
        }
    }

    /** Run periodically. Returns how many steps were escalated. */
    int escalateOverdue() {
        int count = 0;
        for (ApprovalRequest r : requests.values()) {
            synchronized (r) {
                StepInstance before = r.currentStep();
                String approver = before == null ? null : before.approver;
                try {
                    new Escalate().execute(r, ctx);
                } catch (WorkflowException nobodyAbove) {
                    continue;                                               // reported to an admin in a real system
                }
                if (before != null && !before.approver.equals(approver)) count++;
            }
        }
        return count;
    }

    List<String> inbox(String approver) {
        List<String> out = new ArrayList<>();
        for (ApprovalRequest r : requests.values()) {
            StepInstance s = r.currentStep();
            if (s != null && s.approver.equals(approver)) out.add(r.id());
        }
        Collections.sort(out);
        return out;
    }
}

final class MutableClock extends Clock {
    private volatile Instant now;
    MutableClock(Instant start) { now = start; }
    void advance(Duration d) { now = now.plus(d); }
    @Override public Instant instant() { return now; }
    @Override public ZoneId getZone() { return ZoneOffset.UTC; }
    @Override public Clock withZone(ZoneId zone) { return this; }
}
```
````

## Design decisions

- **Definition separate from instance.** `ApprovalStep`s describe the policy; `ApprovalRequest` and its `StepInstance`s hold one request's progress. Changing the policy affects new requests only — requests in flight keep the chain they were submitted with.
- **Chain of responsibility.** Each step decides if it applies; the chain for a request is the sequence of steps that said yes. Adding "legal review for contracts" is one more step in the list (see [Chain of Responsibility](lesson:chain-of-responsibility)).
- **Actions as commands.** `Approve`, `Reject`, `Withdraw`, `Escalate` each validate and execute; the engine runs any command the same way. A sealed interface makes the set of actions explicit (see [Command](lesson:command)).
- **The request owns its invariants and its audit.** Commands can't change state except through `advance`, `finish` and `reassign`, each of which appends an `AuditEntry`. The audit list is only exposed as an unmodifiable copy (see [State machines](lesson:state-machines)).
- **Separation of duties.** The requester can never approve their own request, and escalation never routes to the requester.
- **Escalation re-checks under the lock.** The scheduler might see a step as overdue a moment before the approver acts; `Escalate` checks again inside the request's lock and does nothing if the step already moved on.

## Patterns and principles

[Chain of Responsibility](lesson:chain-of-responsibility) (`ApprovalStep`s), [State machine](lesson:state-machines) (request lifecycle), [Command](lesson:command) (`Approve`, `Reject`, `Withdraw`, `Escalate`), and [extensible APIs](lesson:extensible-apis): new steps and actions are new classes, not engine edits.

## Example execution flow

```text
E1 asha 800     chain [manager: ravi]; ravi approves -> last step -> APPROVED
E2 asha 15000   chain manager:ravi -> finance:fiona -> director:dana
  fiona approves first      current step is manager (ravi) -> rejected
  +3h ravi approves         finance step starts, fiona's SLA 24h
  +12h escalateOverdue      waited 12h < 24h -> nothing
  +25h escalateOverdue      waited 25h >= 24h -> fiona's manager frank takes the step
  frank approves, dana approves -> APPROVED
E3 ravi rejects  -> REJECTED; withdraw afterwards -> already REJECTED
E4 fiona 2000    manager:frank -> finance:fiona; frank approves
                 fiona can't approve her own request; she withdraws
```

```text title="Program output"
E1 (800): APPROVED
E2 chain: manager:ravi -> finance:fiona -> director:dana
Rejected: E2 is waiting for ravi (manager step), not fiona
fiona's inbox: [E2]
escalated after 12h: 0
escalated after 25h: 1, frank's inbox: [E2]
Rejected: E3 is already REJECTED
Rejected: fiona cannot approve their own request E4
E2 APPROVED:
  05-04 09:00 asha SUBMITTED "laptop, 15000; chain manager:ravi -> finance:fiona -> director:dana" -> PENDING
  05-04 12:00 ravi APPROVED [manager] "needed for the new project" -> PENDING
  05-05 13:00 system ESCALATED [finance] "fiona -> frank, SLA 24h exceeded" -> PENDING
  05-05 13:00 frank APPROVED [finance] "within budget" -> PENDING
  05-05 13:00 dana APPROVED [director] "ok" -> APPROVED
E3 REJECTED:
  05-05 13:00 asha SUBMITTED "conference, 3000; chain manager:ravi -> finance:fiona" -> PENDING
  05-05 13:00 ravi REJECTED [manager] "not in this quarter's budget" -> REJECTED
E4 WITHDRAWN:
  05-05 13:00 fiona SUBMITTED "training, 2000; chain manager:frank -> finance:fiona" -> PENDING
  05-05 13:00 frank APPROVED [manager] "go" -> PENDING
  05-05 13:00 fiona WITHDRAWN [finance] -> WITHDRAWN
```

## Edge cases

- **Approver acts out of turn** → rejected with who the request is waiting for.
- **Requester is also a step's approver** (finance staff claiming expenses) → can't approve; the step must be escalated or delegated.
- **Escalation when nobody is above** → the step stays; the engine skips it (and would alert an admin).
- **Approve and escalate at the same moment** → serialised by the request lock; the escalation re-checks and does nothing if the step already advanced.
- **Acting on a finished request** → rejected ("already APPROVED/REJECTED/WITHDRAWN").
- **No step applies** → submission rejected (a policy bug, not a silent auto-approval).

## Tests

```java title="ApprovalWorkflowTest.java" file="ApprovalWorkflowTest.java" test="ApprovalWorkflowDemo.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ApprovalWorkflowTest {
    private MutableClock clock;
    private ApprovalEngine engine;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(Instant.parse("2026-01-05T09:00:00Z"));
        OrgChart org = new OrgChart(Map.of("emp", "mgr", "mgr", "vp", "fin", "cfo"));
        engine = new ApprovalEngine(List.of(
                new ApprovalStep("manager", r -> true, r -> org.managerOf(r.requester()).orElseThrow(), Duration.ofHours(48)),
                new ApprovalStep("finance", r -> r.amount() > 1_000, r -> "fin", Duration.ofHours(24))), org, clock);
    }

    @Test
    void chainDependsOnTheAmount() {
        assertEquals("manager:mgr", engine.submit("emp", 500, "x").chainDescription());
        assertEquals("manager:mgr -> finance:fin", engine.submit("emp", 5_000, "y").chainDescription());
    }

    @Test
    void approvalsMustFollowTheChainInOrder() {
        ApprovalRequest r = engine.submit("emp", 5_000, "x");
        assertThrows(WorkflowException.class, () -> engine.execute(r.id(), new Approve("fin", "")));
        engine.execute(r.id(), new Approve("mgr", ""));
        engine.execute(r.id(), new Approve("fin", ""));
        assertEquals(RequestStatus.APPROVED, r.status());
        assertThrows(WorkflowException.class, () -> engine.execute(r.id(), new Approve("fin", "")));
    }

    @Test
    void rejectionAndWithdrawalEndTheWorkflow() {
        ApprovalRequest a = engine.submit("emp", 5_000, "a");
        engine.execute(a.id(), new Reject("mgr", "no"));
        assertEquals(RequestStatus.REJECTED, a.status());
        ApprovalRequest b = engine.submit("emp", 100, "b");
        assertThrows(WorkflowException.class, () -> engine.execute(b.id(), new Withdraw("mgr")));
        engine.execute(b.id(), new Withdraw("emp"));
        assertEquals(RequestStatus.WITHDRAWN, b.status());
    }

    @Test
    void escalationHappensOnlyAfterTheSla() {
        ApprovalRequest r = engine.submit("emp", 100, "x");
        clock.advance(Duration.ofHours(47));
        assertEquals(0, engine.escalateOverdue());
        clock.advance(Duration.ofHours(1));
        assertEquals(1, engine.escalateOverdue());
        assertEquals(List.of(r.id()), engine.inbox("vp"));
        assertThrows(WorkflowException.class, () -> engine.execute(r.id(), new Approve("mgr", "too late")));
        engine.execute(r.id(), new Approve("vp", ""));
        assertEquals(RequestStatus.APPROVED, r.status());
    }

    @Test
    void nobodyApprovesTheirOwnRequestAndAuditIsReadOnly() {
        ApprovalRequest r = engine.submit("fin", 5_000, "x");             // finance step routes back to the requester
        engine.execute(r.id(), new Approve("cfo", ""));
        assertThrows(WorkflowException.class, () -> engine.execute(r.id(), new Approve("fin", "")));
        assertThrows(UnsupportedOperationException.class, () -> r.audit().clear());
        assertEquals(List.of("SUBMITTED", "APPROVED"), r.audit().stream().map(AuditEntry::action).toList());
    }

    @Test
    void concurrentApprovalsOfOneStepHaveOneWinner() throws InterruptedException {
        ApprovalRequest r = engine.submit("emp", 100, "x");
        AtomicInteger successes = new AtomicInteger();
        List<Thread> threads = new ArrayList<>();
        for (int i = 0; i < 16; i++) {
            threads.add(new Thread(() -> {
                try { engine.execute(r.id(), new Approve("mgr", "")); successes.incrementAndGet(); } catch (WorkflowException ignored) { }
            }));
        }
        threads.forEach(Thread::start);
        for (Thread t : threads) t.join();
        assertEquals(1, successes.get());
        assertEquals(2, r.audit().size());
    }
}
```

## Concurrency

- **One lock per request.** `execute` and `escalateOverdue` both run commands inside `synchronized (request)`, so an approval, a rejection and an escalation on the same request are serialised. Different requests proceed in parallel.
- **Check-then-act inside the lock.** Every command re-validates status and approver under the lock; that's what makes "16 clicks on Approve" produce one approval and one audit entry.
- **The escalation job** reads requests without a global lock and takes each request's lock in turn — it never holds two, so it can't deadlock with user actions.
- **In a database:** keep `version` on the request row and update with `WHERE id = ? AND version = ?`; insert the audit row in the same transaction.

## Common mistakes and alternatives

- **Hard-coding `if (amount > 10000) needDirector()`** in the engine — every policy change is a code change.
- **Mutable or deletable audit records** — the trail stops being evidence.
- **Escalating without re-checking under the lock** — a request approved a millisecond ago gets reassigned anyway.
- **Letting the org chart route approval back to the requester** — self-approval through the back door.
- **Alternative:** a BPMN workflow engine (Camunda, Temporal) for long-running processes with timers, parallel branches and versioned definitions; worth it when workflows are many and change often.

## Follow-up questions

````reveal title="Parallel approvals (any one of / all of)"
Make a step a **group**: `AllOf(legal, security)` completes when every member approved; `AnyOf(fin1, fin2, fin3)` when the first one does. The step instance tracks per-member decisions; the request advances when the group's rule is satisfied. Commands stay the same — `Approve` now targets the group the actor belongs to.
````

````reveal title="Delegation while on leave"
A `Delegate(from, to, until)` command records an out-of-office rule. Approver resolution checks active delegations before assigning a step, and existing steps assigned to `from` are reassigned with an audit entry — the same `reassign` used by escalation.
````

````reveal title="Changing the policy safely"
Version workflow definitions. Each request stores the definition version it was submitted under; new requests use the latest. That's why the chain is copied into `StepInstance`s at submission instead of looked up live.
````

## Complexity

- `submit`: O(S) for S configured steps.
- `execute`: O(1) plus the audit append.
- `escalateOverdue` and `inbox`: O(R) over pending requests (index requests by current approver and by SLA deadline to make them O(results)).

## Interviewer checklist

- [ ] Workflow definition separate from request instances
- [ ] Chain built per request from step conditions
- [ ] Actions as commands with validation; separation of duties
- [ ] Escalation by SLA with re-check under the lock
- [ ] Append-only audit trail capturing who/what/when/status
- [ ] Parallel steps, delegation and versioned definitions discussed
