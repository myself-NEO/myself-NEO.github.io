## Why the format matters

An LLD interview is not a test of whether you have memorised the "right" parking lot design. There is no single right design. The interviewer is collecting **evidence** that you can do the job of designing and writing maintainable code with other engineers. Knowing what evidence they look for lets you spend your 45–60 minutes producing it.

## The five signals

Most companies' LLD rubrics boil down to five signals. Senior rounds add a sixth.

| Signal | What the interviewer looks for | Evidence you produce |
|---|---|---|
| **Problem analysis** | You turn a vague prompt into concrete, scoped requirements | Clarifying questions, a written requirements list, an explicit out-of-scope list |
| **Class design** | Sensible entities with clear responsibilities and relationships | Entity list, class outline, a short justification for each class |
| **Code quality** | Readable, encapsulated, idiomatic code | Working Java for core flows, good names, no public mutable fields |
| **Extensibility** | The design absorbs likely changes without rewrites | Interfaces at the right seams; calm, local answers to "what if…" questions |
| **Communication** | You think aloud, check in, and adapt to hints | Narrated decisions, trade-offs stated, interviewer kept in the loop |
| **Correctness under pressure** (senior) | Edge cases, invariants, concurrency where relevant | Guard clauses, state machines, a thread-safety story |

> [!INTERVIEW] The hidden signal
> Interviewers also notice **judgement**: knowing what *not* to build. A candidate who says "I'll leave payments as an interface because it's out of scope" scores higher than one who spends ten minutes designing a payment gateway nobody asked for.

## How a round is paced

A typical 60-minute round has about 45 minutes of design time. A practical budget, which [the delivery framework](lesson:delivery-framework) expands on:

| Phase | 45-min round | 60-min round | Output |
|---|---|---|---|
| Requirements & scope | 5 min | 5–7 min | Requirements + out-of-scope list |
| Entities & relationships | 3–5 min | 5 min | Boxes and arrows |
| Class design (state + behaviour) | 10 min | 10–15 min | Class outline / interfaces |
| Implementation of core flows | 15 min | 15–20 min | Java for 2–3 key methods |
| Extensibility & follow-ups | 5 min | 5–10 min | Targeted changes, trade-offs |

The most common failure is not a bad design. It is **running out of time** before showing working code, usually because requirements or class design ran long.

## Strong vs weak signals

| Area | Weak signal | Strong signal |
|---|---|---|
| Requirements | Starts coding immediately | Asks 4–6 focused questions, writes them down |
| Entities | 15 classes in the first 3 minutes | 4–6 core entities, adds more only when a requirement needs them |
| Responsibilities | A `Manager` class with all logic; entities are getter/setter bags | Each rule lives in the object that owns the data |
| Patterns | Names patterns up front ("I'll use Factory, Singleton, Observer") | Introduces a pattern to solve a specific, stated problem |
| Code | Pseudo-code that hides the hard parts | Real Java for the tricky method, with guards and clear names |
| Follow-ups | Rewrites half the design | Points to the one class or interface that changes |

## What code quality looks like in 10 lines

The interviewer often forms an opinion from the first class you write. Compare:

```java title="Weak: data bag + logic elsewhere"
public class Spot {
    public int id;
    public boolean occupied;
    public String vehiclePlate;
}
// ...elsewhere, in a 200-line manager:
if (!spot.occupied) { spot.occupied = true; spot.vehiclePlate = plate; }
```

```java title="Strong: the spot protects its own rule" file="SpotDemo.java"
public class SpotDemo {
    public static void main(String[] args) {
        Spot spot = new Spot(42);
        spot.assign("KA-01-1234");
        System.out.println("Spot 42 free? " + spot.isFree());
        try {
            spot.assign("MH-02-9999");
        } catch (IllegalStateException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
    }
}

class Spot {
    private final int id;
    private String plate; // null when free

    Spot(int id) { this.id = id; }

    boolean isFree() { return plate == null; }

    void assign(String vehiclePlate) {
        if (!isFree()) throw new IllegalStateException("Spot " + id + " is occupied");
        this.plate = vehiclePlate;
    }

    void release() {
        if (isFree()) throw new IllegalStateException("Spot " + id + " is already free");
        this.plate = null;
    }
}
```

The second version tells the interviewer you understand **encapsulation** and **invariants** ("a spot holds at most one vehicle") without you saying a word about them.

## Format variations

- **Whiteboard / doc OOD.** Talk, draw, and write code for the important methods. Most common at large US tech companies.
- **Machine coding.** 60–120 minutes to build a *running* program, sometimes with a provided test harness. Common in India-based hiring. Code completeness and structure matter more than diagrams.
- **Pseudo-code friendly.** Some interviewers accept structured pseudo-code. Ask: *"Would you like real Java or is pseudo-code fine for the method bodies?"*
- **Take-home.** Rare for LLD; graded heavily on tests and readability.

> [!TIP]
> Ask about the expected level of detail early. "Do you want me to focus on class design or should I get to running code?" is a perfectly normal question.

## Real-world example

Two candidates get "Design Tic-Tac-Toe".

- **Candidate A** writes a `Game` class with a `char[][]` board and a 60-line `play()` method mixing input parsing, move validation and win checking. It works for 3×3. When asked for an N×N board with a "4 in a row" rule, they rewrite the win check.
- **Candidate B** asks whether the board size and win length are fixed, notes "N×N, K-in-a-row" as a likely follow-up, creates `Board`, `Player`, `Move` and `Game`, puts move validation in `Board` and turn order in `Game`, and implements an O(1) win check using row/column/diagonal counters. The follow-up becomes a constructor parameter.

Both "solved" the problem. Only Candidate B produced evidence for all five signals.

## Common mistakes

- **Silent design.** Thinking for five minutes without speaking gives the interviewer no evidence.
- **Pattern bingo.** Announcing patterns before identifying problems they solve.
- **Skipping invariants.** Letting objects reach impossible states (a spot with two cars, a negative balance).
- **Gold-plating.** Building admin panels, reporting, or persistence nobody asked for.
- **Ignoring hints.** When the interviewer asks "what happens if two people book the same seat?", that is a requirement, not small talk.

## In the interview

Use this as a self-check in the last five minutes:

1. Did I write down requirements and an out-of-scope list?
2. Can I name each class's responsibility in one sentence?
3. Did I write real code for at least the trickiest method?
4. Did I handle at least two edge cases explicitly?
5. Can I show where the next likely requirement plugs in?

## Key takeaways

- Interviewers score **problem analysis, class design, code quality, extensibility and communication** — plus correctness and concurrency for senior roles.
- Time management is a skill: the most common failure is never reaching working code.
- Small details such as private state, guard clauses and good names send strong signals.
- Judgement — what you leave out and why — is part of the score.

## Knowledge check

```quiz
? An interviewer asks "What if two users try to book the last seat at the same time?" What is the best interpretation?
- It's small talk; mention it briefly and move on
+ It's a requirement about concurrency that the design should address
- It's an HLD question that is out of scope for LLD
> Follow-up questions are new requirements. Address them in the design (for example, with an atomic hold on the seat).

? Which behaviour gives the strongest "class design" signal?
- Listing every possible class in the first three minutes
- Putting all business rules in a single Manager class
+ Starting with a few core entities and assigning each rule to the object that owns the data
> Strong designs start small and give each rule a clear owner.

? You have 45 minutes. Where is the most common time trap?
+ Spending too long on requirements and class design, never reaching working code
- Spending too long on the extensibility discussion
- Writing unit tests
> Candidates most often run out of time before implementing the core flows. Time-box the early phases.
```

## Exercise

Read this opening from a mock interview for **"Design a library management system"** and score it from 1 (weak) to 3 (strong) on each of the five signals. Write one sentence of feedback per signal.

> Candidate: "OK, so I'll have a `LibraryManager` singleton, a `Book` class, a `User` class, an `Admin` class extending `User`, a `NotificationFactory`, an `Observer` for due dates and a `Database` class. Let me start with `LibraryManager`…" *(starts writing code immediately)*

````hint title="Hint — what's missing before the first class?"
Which questions did the candidate ask? What did they decide was out of scope? Which of those classes are justified by a stated requirement?
````

````solution title="Sample scoring"
- **Problem analysis — 1.** No clarifying questions: borrowing limits, fines, reservations, multiple copies and so on are all undefined.
- **Class design — 1–2.** `Book` and `User` are reasonable, but there's no `BookCopy` (one title, many copies), and a singleton manager suggests a god object.
- **Code quality — n/a yet.** But a `Database` class inside the domain hints at mixed concerns.
- **Extensibility — 1.** Patterns are chosen before any change axis is identified; `Admin extends User` may be a role, not a subtype.
- **Communication — 2.** They narrate, but they don't check in ("does this scope sound right?").

**Better opening:** ask 4–5 questions (Can members reserve? Are there fines? Multiple copies per title? Any notifications?), write the requirements, then list `Book`, `BookCopy`, `Member`, `Loan` and a `LibraryService`, adding more only as requirements demand.
````
