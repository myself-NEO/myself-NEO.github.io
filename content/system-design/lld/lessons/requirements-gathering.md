## Why requirements come first

Interview prompts are deliberately vague: *"Design a vending machine."* Does it accept cards? Can it run out of change? Does it support multiple machines? Every unanswered question is a fork in your design. If you guess wrong, you either build the wrong thing or spend the follow-up phase rewriting it.

Requirements gathering converts a vague prompt into a **short, explicit contract** between you and the interviewer. It usually takes about five minutes and it shapes everything after it.

## The four question categories

Group your clarifying questions so you cover the space quickly without asking twenty random questions.

| Category | What you're finding out | Example (vending machine) |
|---|---|---|
| **Primary capabilities** | What must the system do? Who uses it? | Select product, insert money, dispense, return change. Is there an operator who restocks? |
| **Rules & completion** | What constraints govern each action? When is an action "done"? | Exact change only, or does it make change? Which coins and notes? One item per transaction? |
| **Errors & edge cases** | What can go wrong, and what should happen? | Product sold out, not enough money, cannot make change, user cancels |
| **Scope boundaries** | What is explicitly *not* included? | Card payments? Remote monitoring? Multiple machines? |

> [!TIP] Ask in batches
> "I'd like to clarify four things: payment methods, change-making, what happens when an item is sold out, and whether restocking is in scope." One sentence, four answers, and you look organised.

## Functional vs non-functional requirements

**Functional requirements** describe *what* the system does — the behaviours a user can observe:

- "A customer can select a product by its slot code."
- "The machine returns change using the fewest coins possible."

**Non-functional requirements (NFRs)** describe *how well* it does it — qualities and constraints:

- **Concurrency:** "Multiple gates can issue tickets at the same time."
- **Extensibility:** "New payment methods will be added later."
- **Performance:** "Lookups must be O(1) or O(log n)."
- **Consistency / correctness:** "A seat can never be booked twice."
- **Testability:** "Time-based logic must be testable without waiting."

In HLD, NFRs are about scale and availability. In LLD they are mostly about **correctness, concurrency, extensibility and testability** — and each one translates into a design decision:

| NFR | Design consequence |
|---|---|
| Thread-safe allocation | Locks or atomic operations around the allocation step |
| New payment methods later | A `PaymentMethod` interface rather than an `if/else` on type |
| Time-dependent rules | Inject a `java.time.Clock` instead of calling `Instant.now()` everywhere |
| No double booking | A state machine with atomic transitions on the seat |

## Writing the requirements down

Write a compact list where the interviewer can see it. Number items so you can refer back ("that's requirement 3").

```text
Functional
 1. Machine holds products in slots (code, product, price, quantity).
 2. Customer selects a slot, inserts coins/notes (1, 2, 5, 10, 20).
 3. Machine dispenses when paid >= price and returns change.
 4. Customer can cancel and get a full refund before dispensing.
 5. Operator can restock slots and collect cash.

Rules / errors
 6. Sold-out slots cannot be selected.
 7. If exact change can't be returned, refund and reject the sale.

Non-functional
 8. Single machine, single user at a time (no concurrency needed).
 9. Design should allow card payments later.

Out of scope
 - Card/UPI payment implementation, remote telemetry, multiple machines.
```

## From requirements to an API

Requirements map almost one-to-one onto a public API. Before you design any internal class, you can sketch the operations the outside world needs:

```java title="Requirements become the public interface" file="VendingApiSketch.java"
import java.util.List;
import java.util.Map;

public class VendingApiSketch {
    public static void main(String[] args) {
        System.out.println("Operations derived from requirements 1-5: " + VendingMachine.class.getDeclaredMethods().length);
    }
}

enum Coin { ONE, TWO, FIVE, TEN, TWENTY }

record Product(String name, int priceInRupees) {}

/** One method per functional requirement; internals come later. */
interface VendingMachine {
    void selectSlot(String slotCode);              // req 2, 6
    void insert(Coin coin);                        // req 2
    Map<Coin, Integer> dispense();                 // req 3, 7 - returns change
    List<Coin> cancel();                           // req 4 - returns refund
    void restock(String slotCode, Product product, int quantity); // req 5
}
```

This sketch is enough to confirm scope with the interviewer: *"Does this cover what you had in mind?"*

## Real-world example

A product manager asks for "the ability to schedule reports". A junior engineer builds a cron-style scheduler with time zones, retries and an admin UI over three sprints. The actual need was "email the weekly sales report every Monday at 9am to five people". Ten minutes of clarifying questions — *how often, which reports, who receives them, what happens on failure* — would have scoped it to two days of work.

Interviews reward the same habit: the questions you ask are evidence of how you will behave on the job.

## Common mistakes

- **No questions at all.** Jumping straight into classes signals that you will build the wrong thing at work too.
- **Too many questions.** Twenty minutes of questions leaves no time to design. Aim for 4–8, grouped.
- **Questions without decisions.** If the interviewer says "your call", *make the call and write it down*: "I'll assume exact coins only."
- **Forgetting out-of-scope.** Without an explicit list, scope creeps during the interview.
- **HLD questions in an LLD round.** "How many requests per second?" rarely matters for a parking lot class design — unless concurrency is in play.

## In the interview

> [!INTERVIEW] What to say
> "Before designing, I'd like to pin down scope. I'll ask about capabilities, rules, error cases and what's out of scope, then write down a short requirements list so we're aligned."

Then, after the answers: "Here's what I've captured — 7 functional requirements, 2 non-functional, and payments are out of scope except as an interface. Shall I move on to entities?"

## Key takeaways

- Group clarifying questions into **capabilities, rules, errors and scope**.
- Separate **functional** (what) from **non-functional** (how well) requirements; in LLD, NFRs usually mean correctness, concurrency, extensibility and testability.
- Write a **numbered list** plus an **out-of-scope** list, and confirm it.
- Requirements map directly onto the **public API** of your design.

## Knowledge check

```quiz
? Which of these is a non-functional requirement?
- A member can borrow up to five books
- A ticket is issued when a car enters
+ Two entry gates may issue tickets concurrently without assigning the same spot
- The machine returns change after a purchase
> Concurrency and correctness constraints describe how well the system behaves, not a user-visible feature.

? The interviewer answers your question with "up to you". What should you do?
- Ask a different question until they give a definite answer
+ Make a reasonable assumption, state it, and write it in the requirements list
- Design for every possibility to be safe
> Making and recording a sensible assumption keeps you moving and shows judgement.

? Why write an explicit out-of-scope list?
- Interviewers require it for scoring
+ It prevents scope creep and shows you're making deliberate trade-offs
- It makes the design longer
> Writing down what you are not building keeps the interview focused and demonstrates judgement.
```

## Exercise

The prompt is **"Design an elevator system"**. Write:

1. Six clarifying questions — at least one from each of the four categories.
2. A requirements list with at least five functional and two non-functional requirements.
3. An out-of-scope list.

````hint title="Hint 1 — capabilities"
How many elevators and floors? Are requests made from inside the car, from each floor, or both?
````

````hint title="Hint 2 — rules and errors"
What order are requests served in? What happens on overload, or if a door is blocked? Is there a maintenance mode?
````

````solution title="Sample answer"
**Questions:** (1) One elevator or many? (2) How many floors? (3) Hall calls with up/down buttons as well as in-car buttons? (4) Scheduling — serve in the current direction first (the "elevator algorithm")? (5) Overweight and door-obstruction handling? (6) Fire or maintenance modes in scope?

**Functional:**
1. Passengers request a floor from inside the car.
2. People on a floor call the elevator with an up or down button.
3. The elevator serves pending stops in its current direction before reversing.
4. Doors open at each stop and close after a timeout.
5. The display shows current floor and direction.

**Non-functional:**
6. Requests can arrive while the elevator moves (thread-safe request queue).
7. The scheduling policy should be swappable (for example, nearest-car for multiple elevators later).

**Out of scope:** multiple elevator banks, fire mode, weight sensors, physical motor control.

See the [Elevator Controller](problem:elevator) problem for a full design.
````
