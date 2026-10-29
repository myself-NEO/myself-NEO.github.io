## The problem

An object behaves **differently depending on its current state**, and many of its methods start with the same question: *"what state am I in?"*

```java
void insertCoin(int amount) {
    if (state == IDLE) { ... state = HAS_MONEY; }
    else if (state == HAS_MONEY) { ... }
    else if (state == DISPENSING) { throw ...; }
    else if (state == OUT_OF_SERVICE) { refund(amount); }
}
void selectProduct(String code) {
    if (state == IDLE) { ... } else if (state == HAS_MONEY) { ... } ...   // again
}
void cancel() { /* and again */ }
```

Every method repeats the state switch. Adding a state means editing every method, and the behaviour for one state is scattered across the class.

**State** lets an object alter its behaviour when its internal state changes. Each state becomes its **own class** implementing a common interface, and the object (the *context*) delegates to its current state object. Transitions replace the current state object.

## When to use it — and when not

**Use when:**

- Several operations behave differently in several states (a **matrix** of state × operation).
- Each state has **substantial, distinct behaviour** (not just "allowed or not").
- States and transitions are likely to grow.

**Don't use when:**

- States only gate which operations are allowed. An **enum plus a transition table** is simpler — see [State Machines & Lifecycle](lesson:state-machines).
- There are only two or three states with trivial behaviour.

## Core idea

- **State interface** — one method per event or operation (`insertCoin`, `select`, `cancel`, `dispense`).
- **Concrete states** — implement each operation for that state, including **which state comes next**.
- **Context** — holds the current state, delegates every operation to it, and exposes a way for states to change it.

## UML

```uml title="State"
class VendingMachine
  - state: MachineState
  - balance: int
  + insertCoin(amount: int): void
  + select(code: String): void
  + cancel(): void
  ~ setState(s: MachineState): void
interface MachineState
  + insertCoin(m: VendingMachine, amount: int): void
  + select(m: VendingMachine, code: String): void
  + cancel(m: VendingMachine): void
class IdleState
class HasMoneyState
class OutOfServiceState
VendingMachine --> MachineState : current
IdleState ..|> MachineState
HasMoneyState ..|> MachineState
OutOfServiceState ..|> MachineState
```

```states title="Vending machine transitions"
[*] --> Idle
Idle --> HasMoney : insertCoin
HasMoney --> HasMoney : insertCoin
HasMoney --> Idle : select [paid >= price] / dispense + change
HasMoney --> Idle : cancel / refund
Idle --> OutOfService : stock empty
OutOfService --> Idle : restock
```

## Java implementation

```java title="Each state owns its behaviour" file="StatePatternDemo.java"
import java.util.HashMap;
import java.util.Map;

public class StatePatternDemo {
    public static void main(String[] args) {
        VendingMachine vm = new VendingMachine();
        vm.restock("A1", new Product("Chips", 30), 1);

        vm.select("A1");                 // Idle: "insert money first"
        vm.insertCoin(20);
        vm.insertCoin(20);
        vm.select("A1");                 // dispenses, change 10, now out of stock -> OutOfService
        vm.insertCoin(10);               // OutOfService: refunds immediately
        vm.restock("A1", new Product("Chips", 30), 5);
        vm.insertCoin(50);
        vm.cancel();                     // refund 50
        System.out.println("Final state: " + vm.stateName());
    }
}

record Product(String name, int price) {}

interface MachineState {
    void insertCoin(VendingMachine m, int amount);
    void select(VendingMachine m, String code);
    void cancel(VendingMachine m);
    default String name() { return getClass().getSimpleName(); }
}

final class IdleState implements MachineState {
    public void insertCoin(VendingMachine m, int amount) {
        m.addBalance(amount);
        m.setState(new HasMoneyState());
    }
    public void select(VendingMachine m, String code) { m.display("Insert money first"); }
    public void cancel(VendingMachine m) { m.display("Nothing to cancel"); }
}

final class HasMoneyState implements MachineState {
    public void insertCoin(VendingMachine m, int amount) { m.addBalance(amount); }

    public void select(VendingMachine m, String code) {
        Product p = m.productAt(code);
        if (p == null) { m.display("Unknown or empty slot " + code); return; }
        if (m.balance() < p.price()) { m.display("Insert " + (p.price() - m.balance()) + " more"); return; }
        m.takeOne(code);
        m.display("Dispensed " + p.name() + ", change " + (m.balance() - p.price()));
        m.resetBalance();
        m.setState(m.isEmpty() ? new OutOfServiceState() : new IdleState());
    }

    public void cancel(VendingMachine m) {
        m.display("Refunded " + m.balance());
        m.resetBalance();
        m.setState(new IdleState());
    }
}

final class OutOfServiceState implements MachineState {
    public void insertCoin(VendingMachine m, int amount) { m.display("Out of service, returning " + amount); }
    public void select(VendingMachine m, String code) { m.display("Out of service"); }
    public void cancel(VendingMachine m) { m.display("Nothing to cancel"); }
}

/** Context: holds data and delegates behaviour to the current state. */
class VendingMachine {
    private final Map<String, Product> products = new HashMap<>();
    private final Map<String, Integer> stock = new HashMap<>();
    private MachineState state = new OutOfServiceState();
    private int balance;

    // Public API: pure delegation.
    void insertCoin(int amount) {
        if (amount <= 0) throw new IllegalArgumentException("amount must be positive");
        state.insertCoin(this, amount);
    }
    void select(String code) { state.select(this, code); }
    void cancel() { state.cancel(this); }

    // Operator action, valid in any state.
    void restock(String code, Product product, int qty) {
        products.put(code, product);
        stock.merge(code, qty, Integer::sum);
        if (state instanceof OutOfServiceState) setState(new IdleState());
    }

    String stateName() { return state.name(); }

    // Package-private hooks used by the states.
    void setState(MachineState next) {
        System.out.println("  [" + state.name() + " -> " + next.name() + "]");
        state = next;
    }
    void display(String msg) { System.out.println(msg); }
    int balance() { return balance; }
    void addBalance(int amount) { balance += amount; }
    void resetBalance() { balance = 0; }
    Product productAt(String code) { return stock.getOrDefault(code, 0) > 0 ? products.get(code) : null; }
    void takeOne(String code) { stock.merge(code, -1, Integer::sum); }
    boolean isEmpty() { return stock.values().stream().allMatch(q -> q == 0); }
}
```

Each state class answers *"what do all operations do in this state?"* in one place. Adding a `MaintenanceState` means adding a class and the transitions into and out of it, without touching the `if` chains of every method (there are none).

## State vs enum + transition table

| | Enum + transition table | State pattern |
|---|---|---|
| Best for | States that **gate** operations; simple actions | States with **rich, different behaviour** per operation |
| Code size | Small | One class per state |
| Visibility | The whole machine in one table | Behaviour per state in one class |
| Adding a state | One enum constant + table rows | One class + transitions |

Many interview solutions start with an enum and upgrade to the State pattern when behaviour per state grows. Saying exactly that is a strong signal. See [State Machines](lesson:state-machines).

## Realistic use case

- [Vending Machine](problem:vending-machine) and [ATM](problem:atm): card inserted / authenticated / transaction / out of cash.
- [Elevator](problem:elevator): idle / moving up / moving down / doors open / maintenance.
- TCP connections (listen, established, closed), document workflows (draft, review, published), media players (playing, paused, stopped).

## Trade-offs and alternatives

- **Pros:** no repeated state switches; each state's behaviour is cohesive; adding states is open/closed.
- **Cons:** many small classes; transitions spread across state classes (harder to see the whole machine); states need access to context internals.
- **Tips:** stateless state objects can be **shared singletons** (an enum implementing the interface works well); keep the transition list documented, ideally as a diagram.

## Recognising it in an interview

The prompt has a **lifecycle**, and **the same action means different things** at different times: "pressing the button while moving does X, while idle does Y". That's State. If actions are merely *allowed or not* per status, use an enum state machine.

## Common mistakes

- Using the State pattern for 2–3 trivial states (overengineering).
- States that mutate context fields freely, with no clear API — keep the hooks small.
- Forgetting **invalid operations** in some states. Every state must answer every operation, even if the answer is "not allowed".
- Not thinking about **concurrency**: two threads triggering transitions at once (see [Race Conditions](lesson:concurrent-state-transitions)).

## Key takeaways

- State replaces repeated state switches with **one class per state** behind a common interface.
- The context **delegates** to the current state; states decide **transitions**.
- Prefer an **enum + transition table** when states only gate operations.
- Strategy and State share a structure; in State, the object **changes its own** behaviour.

## Knowledge check

```quiz
? Which symptom most strongly suggests the State pattern?
+ Many methods each start with the same switch on the current status, with substantially different behaviour per status
- A class has many fields
- Two algorithms compute a price
> A state × operation matrix of distinct behaviour is the classic cue.

? An Order has PLACED, PAID, SHIPPED and CANCELLED states, and each operation is either allowed or rejected. What's simplest?
- The State pattern with four classes
+ An enum with a transition table that rejects illegal moves
- A Strategy per state
> When states only gate operations, an enum state machine is clearer.

? In the State pattern, who decides the next state?
- The client
+ Typically the current state object, as part of handling an operation
- A static utility class
> States encapsulate their own transitions.
```

## Exercise

Model a **document workflow** with states `Draft`, `InReview`, `Published` and `Archived`, and operations `edit(text)`, `submit()`, `approve(reviewer)`, `reject(reason)` and `archive()`. Rules: only drafts can be edited; the author can't approve their own document; rejection returns the document to `Draft` with a comment; only published documents can be archived. Implement it with the State pattern.

````hint title="Hint"
Make the states stateless and use an enum that implements the state interface — each constant overrides only the operations it allows; the default throws.
````

````solution title="Reference solution"
```java file="DocumentWorkflowDemo.java"
import java.util.ArrayList;
import java.util.List;

public class DocumentWorkflowDemo {
    public static void main(String[] args) {
        Document doc = new Document("asha");
        doc.edit("First draft");
        doc.submit();
        try {
            doc.approve("asha");
        } catch (IllegalStateException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
        doc.reject("ravi", "Add numbers");
        doc.edit("Second draft with numbers");
        doc.submit();
        doc.approve("ravi");
        doc.archive();
        System.out.println(doc.state() + " " + doc.history());
    }
}

interface DocState {
    default void edit(Document d, String text) { throw d.illegal("edit"); }
    default void submit(Document d) { throw d.illegal("submit"); }
    default void approve(Document d, String reviewer) { throw d.illegal("approve"); }
    default void reject(Document d, String reviewer, String reason) { throw d.illegal("reject"); }
    default void archive(Document d) { throw d.illegal("archive"); }
}

enum States implements DocState {
    DRAFT {
        @Override public void edit(Document d, String text) { d.setText(text); }
        @Override public void submit(Document d) { d.moveTo(IN_REVIEW, "submitted"); }
    },
    IN_REVIEW {
        @Override public void approve(Document d, String reviewer) {
            if (reviewer.equals(d.author())) throw new IllegalStateException("authors cannot approve their own document");
            d.moveTo(PUBLISHED, "approved by " + reviewer);
        }
        @Override public void reject(Document d, String reviewer, String reason) { d.moveTo(DRAFT, "rejected by " + reviewer + ": " + reason); }
    },
    PUBLISHED {
        @Override public void archive(Document d) { d.moveTo(ARCHIVED, "archived"); }
    },
    ARCHIVED
}

class Document {
    private final String author;
    private String text = "";
    private States state = States.DRAFT;
    private final List<String> history = new ArrayList<>();

    Document(String author) { this.author = author; }

    void edit(String t) { state.edit(this, t); }
    void submit() { state.submit(this); }
    void approve(String reviewer) { state.approve(this, reviewer); }
    void reject(String reviewer, String reason) { state.reject(this, reviewer, reason); }
    void archive() { state.archive(this); }

    String author() { return author; }
    States state() { return state; }
    List<String> history() { return List.copyOf(history); }
    void setText(String t) { text = t; }
    void moveTo(States next, String note) { history.add(state + "->" + next + " (" + note + ")"); state = next; }
    IllegalStateException illegal(String op) { return new IllegalStateException("cannot " + op + " in " + state); }
}
```

An enum implementing the state interface gives you the State pattern's per-state behaviour with enum-level compactness — a nice middle ground. The [Approval Workflow](problem:approval-workflow) problem extends this to multi-step approvals.
````
