## Why you need a framework

An LLD interview is 45–60 minutes of solving an open-ended problem while being observed. Without a plan, candidates either dive into code too early (and build the wrong thing) or spend too long on requirements and diagrams (and never show working code). A **repeatable framework** solves both problems: it tells you what to do next, keeps the interviewer oriented, and makes sure you produce evidence for every signal they score (see [What LLD Interviews Evaluate](lesson:interview-expectations)).

This framework has **12 steps grouped into 5 time-boxed phases**. We'll run it on a running example: **"Design a parking lot."**

| Phase | Steps | 45-min round | 60-min round |
|---|---|---|---|
| **1. Requirements** | 1–2 | ~5 min | ~7 min |
| **2. Entities & relationships** | 3–4 | ~4 min | ~5 min |
| **3. Class design & APIs** | 5–7 | ~10 min | ~13 min |
| **4. Implementation & walkthrough** | 8–9 | ~18 min | ~23 min |
| **5. Hardening & extensibility** | 10–12 | ~8 min | ~12 min |

> [!TIP] Announce the plan
> Open with: *"I'll start by clarifying requirements, then identify the core entities, outline the classes and their APIs, implement the core flows in Java, walk through a scenario, and finish with edge cases, concurrency and extensions. I'll check in with you at each step."* Interviewers relax when they can see where you're going.

---

## Phase 1 — Requirements

### Step 1: Clarify the problem

**Goal:** turn a one-line prompt into a shared understanding.

**What to say:**
> "Before designing, let me clarify scope. Is it one lot or several? Multiple levels? Which vehicle types, and what spot sizes? How is pricing calculated? Do we need payments, or just fee calculation? Is there concurrency — multiple entry gates at once?"

**What to write:** the questions with the answers next to them, plus any assumptions you made when the answer was "your call".

### Step 2: List functional requirements and constraints

**Goal:** a numbered requirements list plus an out-of-scope list. See [Requirements Gathering](lesson:requirements-gathering).

```text
Functional
 1. Park a vehicle: assign the nearest free spot that fits; issue a ticket.
 2. Unpark: free the spot, compute the fee from duration and vehicle type.
 3. Vehicle types: bike, car, truck; spot sizes: small, medium, large.
 4. Show free spot counts per level.
Non-functional
 5. Multiple entry/exit gates operate concurrently — no double allocation.
 6. Pricing rules will change (weekend, event pricing).
Out of scope
 - Payment processing (fee only), reservations, EV charging, UI.
```

**Checkpoint:** *"Does this capture what you had in mind?"*

**Pitfall:** asking twenty questions. Four to eight, grouped, is plenty.

---

## Phase 2 — Entities & relationships

### Step 3: Define core entities and responsibilities

**Goal:** 4–7 core entities, each with a one-line responsibility. See [Entities & Responsibilities](lesson:entities-and-responsibilities).

**What to say:**
> "The core entities are `ParkingLot` (orchestrates parking), `Level` (owns its spots and finds a free one), `Spot` (knows its size and whether it's free), `Vehicle` (plate and type), `Ticket` (records entry time and spot), and a `PricingStrategy` for fees."

### Step 4: Identify relationships and invariants

**Goal:** a box-and-arrow sketch plus the rules that must **always** hold.

```text
ParkingLot ◆── 1..* Level ◆── 1..* Spot
ParkingLot ──> PricingStrategy
Ticket ──> Spot, Vehicle

Invariants:
 • A spot holds at most one vehicle.
 • A vehicle has at most one active ticket.
 • A ticket's exit time is after its entry time.
```

**What to say:** *"These invariants tell me where the important checks live: `Spot` guards single occupancy, and `ParkingLot` guards one active ticket per vehicle."*

**Pitfall:** perfect UML. Simple boxes and labelled arrows are fine. Spend the time on the invariants instead.

---

## Phase 3 — Class design & APIs

### Step 5: Define public interfaces and APIs

**Goal:** the public methods each class offers — signatures, not bodies. Work **top-down** from the entry point.

```java
class ParkingLot {
    Ticket park(Vehicle vehicle);              // req 1
    long unpark(String ticketId);              // req 2 -> fee
    Map<Integer, Integer> freeSpotsByLevel();  // req 4
}
class Level { Optional<Spot> findFreeSpot(VehicleType type); }
class Spot  { boolean fits(VehicleType t); void occupy(Vehicle v); void release(); }
interface PricingStrategy { long fee(Ticket ticket, Instant exitTime); }
```

**What to say:** *"Each public method maps to a requirement — I'm deliberately not adding methods nobody asked for."*

### Step 6: Model states and transitions

**Goal:** for anything with a status, sketch its lifecycle. See [State Machines](lesson:state-machines).

```text
Spot:   FREE ──occupy──▶ OCCUPIED ──release──▶ FREE
Ticket: ACTIVE ──unpark──▶ PAID (closed)
```

**What to say:** *"Spot is a two-state machine, so a nullable occupant field is enough. Ticket has a clear lifecycle: unparking an already-closed ticket must fail."*

### Step 7: Apply principles and patterns — only when justified

**Goal:** name each pattern alongside the requirement that needs it.

| Requirement | Decision | Why |
|---|---|---|
| 6. Pricing will change | **Strategy** (`PricingStrategy`) | New pricing = new class |
| 3. Vehicle → spot fit | Enum rule (`SpotSize.fits`) | Fixed set; no pattern needed |
| 5. Concurrency | Lock per level, or atomic spot claims | Avoid a global bottleneck |
| — | **No** Singleton, Factory or Observer | Nothing requires them |

**What to say:** *"I'm using Strategy for pricing because you said it'll change. I'm not making `ParkingLot` a singleton — I'll create one instance and pass it in, which keeps it testable."*

**Pitfall:** pattern bingo. See [Interview Anti-Patterns](lesson:interview-anti-patterns).

---

## Phase 4 — Implementation & walkthrough

### Step 8: Implement the core classes in Java

**Goal:** working code for the **2–3 most important methods**, not every getter.

**What to say first:** *"I'll implement `park` and `unpark` fully, since they carry the core logic, and stub the rest. Is real Java OK, or would you prefer pseudo-code?"*

Order of work:

1. The **happy path** of the most important method.
2. **Guard clauses** for invalid input and state.
3. The second core method.

```java title="Core flow (abridged — the full solution is in the Parking Lot problem)"
public Ticket park(Vehicle vehicle) {
    if (activeTickets.containsKey(vehicle.plate())) throw new IllegalStateException("already parked");
    for (Level level : levels) {
        Optional<Spot> spot = level.claimFreeSpot(vehicle);     // atomic per level
        if (spot.isPresent()) {
            Ticket t = new Ticket(ids.next(), vehicle, spot.get(), clock.instant());
            activeTickets.put(vehicle.plate(), t);
            return t;
        }
    }
    throw new LotFullException(vehicle.type());
}
```

**Pitfall:** spending ten minutes on boilerplate (getters, `toString`, input parsing). Say *"I'll skip getters"* and move on.

### Step 9: Walk through important scenarios

**Goal:** prove the design works by tracing a concrete scenario through your code. See [Sequence Diagrams](lesson:sequence-diagrams).

**What to say:**
> "Let me trace a car arriving: `park(car)` → level 1 has no medium spot → level 2's `claimFreeSpot` returns M-7 → ticket T1 is created at 10:00. At 12:30, `unpark(T1)` releases M-7 and `HourlyPricing` charges 3 hours × 40 = 120."

Tracing often reveals bugs, such as forgetting to remove the ticket from `activeTickets`. Fixing them live is a positive signal.

---

## Phase 5 — Hardening & extensibility

### Step 10: Error handling, concurrency and edge cases

**Goal:** show you think beyond the happy path.

- **Errors:** *"Lot full → `LotFullException`; unknown ticket → `IllegalArgumentException`; unparking twice → `IllegalStateException`."*
- **Edge cases:** zero-minute stays (minimum one hour), a truck when only small spots are free, clock skew (exit before entry).
- **Concurrency:** *"Two gates could claim the same spot. I make `claimFreeSpot` synchronized per level, so gates on different levels don't block each other. `activeTickets` is a `ConcurrentHashMap`, and I use `putIfAbsent` so the same car can't be parked twice."* See [Thread Safety](lesson:thread-safety).

### Step 11: Write or describe unit tests

**Goal:** show the design is testable and name the important cases. See [Testing](lesson:testing-lld).

```text
- park assigns the smallest fitting spot on the lowest level
- park throws LotFullException when no spot fits
- unpark frees the spot and charges via the injected strategy (fake strategy returns 99)
- the same vehicle can't be parked twice
- concurrent: 100 threads park 50 cars into 50 spots → 50 tickets, no duplicate spots
```

**What to say:** *"Because the clock, ID generator and pricing are injected, these are plain unit tests with no sleeps or mocks of statics."*

### Step 12: Explain trade-offs and future improvements

**Goal:** close with judgement.

- **Trade-offs made:** *"Linear scan of levels is O(levels × spots); fine for a few thousand spots. For 100k spots I'd keep per-size free-spot queues for O(1) allocation."*
- **Extensions:** *"Reservations would add a `RESERVED` spot state; EV charging is a new `SpotFeature`; weekend pricing is a new strategy."*
- **What I'd do with more time:** persistence behind a repository, metrics, a display board via an observer.

---

## How interviewers challenge your design

Expect pushback mid-interview. It's rarely a sign you're wrong; it's how they test depth.

| Challenge | Weak response | Strong response |
|---|---|---|
| *"Why is pricing a separate class?"* | "Because Strategy is a best practice." | "Pricing changes independently of allocation — you mentioned weekend rates — so isolating it means adding a rule touches no allocation code." |
| *"Isn't that over-engineered?"* | Defends every abstraction. | "Fair. If pricing truly never changed, a method on `ParkingLot` would do. I'm keeping one interface because of requirement 6, and I've deliberately avoided others." |
| *"What if two cars arrive at the same time?"* | "Java handles that." | "The race is in claiming a spot. I make the claim atomic per level, so two gates can't get the same spot, and different levels don't contend." |
| *"Add electric charging spots."* | Starts a rewrite. | "Spots gain a feature set; `fits()` checks it, and pricing adds a charging component as a decorator. No change to `park()`." |

The pattern: **acknowledge → explain the reason (tied to a requirement) → offer the alternative or the local change.** The [worked interview](lesson:mock-interview-walkthrough) shows this end to end.

## Common mistakes

- **Coding before requirements are agreed.**
- **No checkpoints**, so the interviewer can't steer you.
- **Implementing everything shallowly** instead of the core flows properly.
- **Never tracing a scenario**, so bugs survive.
- **Running out of time** before concurrency and extensibility. Watch the clock: at the halfway point you should be writing core code.

## In the interview

> [!INTERVIEW] Time checks
> Glance at the clock at the end of each phase. If you're behind, say so and adapt: *"I'm conscious of time — I'll implement `park` fully and describe `unpark` verbally, then cover concurrency."* Managing time out loud is itself a positive signal.

## Key takeaways

- **12 steps, 5 phases:** requirements → entities → class design → implementation → hardening.
- At each step, know **what to say** and **what to draw or write**, and check in.
- Implement the **core 2–3 methods** properly; trace a scenario to validate them.
- Justify patterns with **requirements**; handle pushback with **acknowledge → reason → local change**.

## Knowledge check

```quiz
? You're 25 minutes into a 45-minute interview and still refining the class diagram. What's the best move?
- Keep perfecting the diagram so the code is right
+ Say you're moving to implementation, code the core method, and cover the rest verbally if needed
- Ask the interviewer for more time
> Showing working core code is essential; adapt your plan out loud.

? The interviewer asks "Isn't this over-engineered?" about your PricingStrategy. What's the strongest response?
+ Acknowledge the cost, tie the abstraction to a stated requirement, and say what you'd do without that requirement
- Insist that design patterns are always best practice
- Immediately delete the interface
> Show judgement: the abstraction exists because of a requirement, and you know the simpler alternative.

? What's the main purpose of Step 9 (walking through scenarios)?
- To fill time
+ To validate the design and code against a concrete case, catching bugs and wrong ownership
- To draw a use-case diagram
> Tracing a scenario proves the design works and often reveals fixes.
```

## Exercise

Run the framework on **"Design a library management system"** in 45 minutes with a timer. Produce: (1) clarifying questions, (2) a numbered requirements list with an out-of-scope section, (3) entities with invariants, (4) public API signatures, (5) one state diagram, (6) Java for `borrow` and `returnCopy`, (7) a traced scenario, (8) five test names, (9) two extensions you'd discuss. Then compare with the [Library Management](problem:library-management) breakdown.

````hint title="Hint — where candidates usually stumble"
The `Book` vs `BookCopy` distinction (title vs physical item), and where the borrowing limit lives (on `Member`, because it needs the member's active loans).
````

````solution title="Self-review checklist"
- [ ] Requirements written and confirmed, with an out-of-scope list
- [ ] Book and BookCopy separated
- [ ] Invariants: a copy is on loan to at most one member; a member has ≤ N active loans; return requires an active loan
- [ ] `BookCopy` state machine: AVAILABLE → ON_LOAN → AVAILABLE (+ LOST)
- [ ] `borrow` and `returnCopy` have guard clauses and change state only after all checks pass
- [ ] Fines behind a `FinePolicy` (if fines were in scope) and an injected `Clock`
- [ ] Traced "borrow, then return late → fine"
- [ ] Concurrency mentioned: two members borrowing the last copy
- [ ] Extensions: reservations/holds queue; notifications via an observer
````
