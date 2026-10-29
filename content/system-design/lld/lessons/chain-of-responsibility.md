## The problem

A request must pass through **a series of checks or handlers**, and which ones apply — and in what order — changes over time:

- An expense claim is approved by a team lead up to ₹10,000, a manager up to ₹1,00,000, and a director above that.
- An HTTP request passes through authentication, rate limiting, validation and logging before reaching the business logic.
- An ATM dispenses cash using ₹2,000, then ₹500, then ₹100 notes.

Hard-coding this as a long `if/else` couples the sender to every handler and makes reordering or adding steps risky.

**Chain of Responsibility** passes a request along a **chain of handler objects**. Each handler decides whether to **handle it**, **pass it on**, or **both** (handle part of it and forward the rest).

## When to use it — and when not

**Use when:**

- Several handlers might process a request, and the right one (or the set of them) isn't known in advance.
- Handlers and their order should be **configurable**.
- You're building **pipelines/middleware**: each step does its part and forwards, or stops the request.

**Don't use when:**

- There's one handler, or the selection is a simple lookup (use a `Map`).
- You need **every** handler to run with no early exit, and order doesn't matter (a plain list loop or [Observer](lesson:observer) is simpler).

## Core idea — two flavours

1. **Classic "first match handles"**: each handler either handles the request completely or forwards it. An approval chain is the canonical example.
2. **Pipeline / middleware**: each handler does some work and decides whether to **continue** — for example, a validation pipeline that stops at the first failure, or servlet filters.

## UML

```uml title="Chain of Responsibility"
abstract class Approver
  - next: Approver
  + linkWith(next: Approver): Approver
  + approve(claim: ExpenseClaim): Decision
  # canApprove(claim: ExpenseClaim): boolean
class TeamLead
class Manager
class Director
TeamLead --|> Approver
Manager --|> Approver
Director --|> Approver
Approver --> Approver : next
```

## Java implementation

```java title="Approval chain and validation pipeline" file="ChainDemo.java"
import java.util.ArrayList;
import java.util.List;

public class ChainDemo {
    public static void main(String[] args) {
        // 1. Classic chain: the first handler able to approve does so.
        Approver chain = new TeamLead("Ravi");
        chain.linkWith(new Manager("Meera")).linkWith(new Director("Kabir"));

        for (long amount : new long[]{8_000, 45_000, 7_50_000, 60_00_000}) {
            System.out.println(amount + " -> " + chain.approve(new ExpenseClaim("asha", amount, "travel")));
        }

        // 2. Pipeline: every validator runs until one fails.
        RequestPipeline pipeline = new RequestPipeline(List.of(
                req -> req.userId() == null ? "unauthenticated" : null,
                req -> req.body().length() > 1_000 ? "payload too large" : null,
                req -> req.body().isBlank() ? "empty body" : null));
        System.out.println(pipeline.check(new ApiRequest("u1", "{\"ok\":true}")));
        System.out.println(pipeline.check(new ApiRequest(null, "{}")));
        System.out.println(pipeline.check(new ApiRequest("u2", " ")));
    }
}

record ExpenseClaim(String employee, long amount, String category) {}
record Decision(boolean approved, String by, String note) {}

abstract class Approver {
    private Approver next;
    protected final String name;

    protected Approver(String name) { this.name = name; }

    /** Returns the appended handler so chains can be built fluently. */
    Approver linkWith(Approver next) {
        this.next = next;
        return next;
    }

    final Decision approve(ExpenseClaim claim) {
        if (canApprove(claim)) return new Decision(true, getClass().getSimpleName() + " " + name, "within limit");
        if (next != null) return next.approve(claim);
        return new Decision(false, "nobody", "exceeds every approval limit");   // end of chain
    }

    protected abstract boolean canApprove(ExpenseClaim claim);
}

class TeamLead extends Approver {
    TeamLead(String name) { super(name); }
    protected boolean canApprove(ExpenseClaim c) { return c.amount() <= 10_000; }
}

class Manager extends Approver {
    Manager(String name) { super(name); }
    protected boolean canApprove(ExpenseClaim c) { return c.amount() <= 1_00_000; }
}

class Director extends Approver {
    Director(String name) { super(name); }
    protected boolean canApprove(ExpenseClaim c) { return c.amount() <= 10_00_000 && !c.category().equals("gifts"); }
}

// -- Pipeline flavour with lambdas --
record ApiRequest(String userId, String body) {}

@FunctionalInterface
interface Validator { String check(ApiRequest req); }   // null = OK, otherwise an error message

class RequestPipeline {
    private final List<Validator> validators;
    RequestPipeline(List<Validator> validators) { this.validators = new ArrayList<>(validators); }

    String check(ApiRequest req) {
        for (Validator v : validators) {
            String error = v.check(req);
            if (error != null) return "REJECTED: " + error;   // short-circuit
        }
        return "ACCEPTED";
    }
}
```

> [!TIP] Linked handlers vs a list
> The classic pattern links handlers with `next` references. In modern Java, a **`List<Handler>` iterated by a small runner** is often clearer: ordering is visible in one place, and handlers don't need to know about each other. Both are Chain of Responsibility.

## Realistic use case

- **Approval workflows** — amount- and category-based escalation ([Approval Workflow](problem:approval-workflow)).
- **ATM cash dispensing** — each denomination handler dispenses what it can and passes the remainder on ([ATM](problem:atm)).
- **Logging** — levels and filters deciding whether a message proceeds to appenders ([Logging Framework](problem:logging-framework)).
- **Web middleware** — servlet filters, Spring interceptors and Express/Koa middleware.
- **Support ticket triage** — bot → L1 → L2 → engineering.

## Trade-offs and alternatives

- **Pros:** sender decoupled from receivers; handlers are single-purpose and reorderable; easy to add steps.
- **Cons:** **a request may go unhandled** (always define the end-of-chain behaviour); harder debugging (which handler acted?); misconfigured order causes subtle bugs.
- **Alternatives:**
  - **[Decorator](lesson:decorator)** — similar wrapping, but every layer always delegates; there's no "handle and stop".
  - **Rule tables / [Specification](lesson:specification)** — when the logic is mostly declarative conditions.
  - **A `Map` lookup** — when exactly one handler applies, selected by key.

## Recognising it in an interview

"Escalate to the next level", "approval limits", "a series of validations", "middleware", "dispense using the largest notes first". Say: *"Each level is a handler; the chain is configured in one place, so adding a VP level is one class and one link."*

## Common mistakes

- **No terminal handling** — a request silently falls off the end of the chain.
- **Handlers that know about specific other handlers** (hard-coded `next = new Manager()`).
- **Cycles** in the chain.
- Using a chain where a **lookup** would do.

## Key takeaways

- Chain of Responsibility passes a request **along handlers** until handled, or through a **pipeline** of steps.
- Build chains in **one place**; handlers stay ignorant of each other.
- Always define what happens when **no handler** accepts the request.
- A `List` of handlers plus a runner is a clean modern form.

## Knowledge check

```quiz
? An expense of ₹50,00,000 passes TeamLead, Manager and Director and nobody can approve it. What should happen?
- The last handler approves it anyway
+ The chain returns an explicit "not approved / escalate manually" result
- An infinite loop
> Always define end-of-chain behaviour so requests aren't silently dropped.

? What's the key difference between Chain of Responsibility and Decorator?
+ A chain handler may stop the request (handle it and not forward); a decorator always delegates to the wrapped object
- Decorators can't be stacked
- Chains require inheritance
> The ability to short-circuit is characteristic of Chain of Responsibility.

? Which problem best fits Chain of Responsibility?
- Choosing a pricing algorithm by vehicle type
+ Validating an API request through authentication, size and schema checks, stopping at the first failure
- Notifying five services that an order shipped
> An ordered sequence of checks with early exit is a chain or pipeline.
```

## Exercise

Implement **ATM cash dispensing** as a chain: handlers for ₹2000, ₹500, ₹200 and ₹100 notes, each with a limited count. Each handler dispenses as many of its notes as possible (without exceeding its count) and passes the remainder on. If the remainder isn't zero at the end, the whole withdrawal must fail **without** changing any note counts.

````hint title="Hint"
Do it in two phases: first compute a plan through the chain (no mutation), then commit the plan if the remainder is zero.
````

````solution title="Reference solution"
```java file="CashChainDemo.java"
import java.util.LinkedHashMap;
import java.util.Map;

public class CashChainDemo {
    public static void main(String[] args) {
        NoteDispenser chain = new NoteDispenser(2000, 2);
        chain.linkWith(new NoteDispenser(500, 3)).linkWith(new NoteDispenser(200, 5)).linkWith(new NoteDispenser(100, 10));

        System.out.println(withdraw(chain, 5_700));   // {2000=2, 500=3, 200=1}
        System.out.println(withdraw(chain, 50));      // impossible: nothing changes
        System.out.println(withdraw(chain, 900));     // 200x4, 100x1
    }

    static String withdraw(NoteDispenser chain, int amount) {
        Map<Integer, Integer> plan = new LinkedHashMap<>();
        int remainder = chain.plan(amount, plan);
        if (remainder != 0) return "Cannot dispense " + amount;
        chain.commit(plan);
        return "Dispensed " + plan;
    }
}

class NoteDispenser {
    private final int denomination;
    private int count;
    private NoteDispenser next;

    NoteDispenser(int denomination, int count) { this.denomination = denomination; this.count = count; }

    NoteDispenser linkWith(NoteDispenser next) { this.next = next; return next; }

    /** Phase 1: plan only, no mutation. Returns the undispensed remainder. */
    int plan(int amount, Map<Integer, Integer> plan) {
        int use = Math.min(amount / denomination, count);
        if (use > 0) plan.put(denomination, use);
        int remaining = amount - use * denomination;
        return next == null ? remaining : next.plan(remaining, plan);
    }

    /** Phase 2: apply the plan along the chain. */
    void commit(Map<Integer, Integer> plan) {
        count -= plan.getOrDefault(denomination, 0);
        if (next != null) next.commit(plan);
    }
}
```

Greedy dispensing can fail even when a solution exists (for example, with only ₹500 and ₹200 notes for ₹600 = 3×200). The [ATM](problem:atm) problem discusses when that matters and how to fall back.
````
