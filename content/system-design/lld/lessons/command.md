## The problem

Usually you call a method and it runs immediately. Sometimes you need to treat the **request itself as data**:

- **Undo/redo** — remember what was done so it can be reversed (text editors, drawing tools, a chess move history).
- **Queue or schedule** work to run later or on another thread (task schedulers, job queues).
- **Retry** failed operations, or **log** them for audit and replay.
- **Decouple** the thing that triggers an action (a button, a CLI, an API endpoint) from the thing that performs it.

**Command** encapsulates a request as an **object** containing everything needed to perform it (and, optionally, to undo it).

## When to use it — and when not

**Use when** you need undo/redo, queuing, scheduling, retries, macros (composite commands) or an audit log of operations.

**Don't use when** you just need to call a method. Wrapping every method call in a command object is ceremony without benefit.

## Core idea

- **Command interface** — `execute()` and, for undoable commands, `undo()`.
- **Concrete commands** — hold the **receiver** (the object that does the work) and the **parameters**.
- **Invoker** — triggers commands: a button, a queue worker, a scheduler, an undo manager. It knows nothing about what commands do.
- **Receiver** — the domain object that actually performs the operation (`TextDocument`, `Account`).

## UML

```uml title="Command with undo"
interface Command
  + execute(): void
  + undo(): void
class InsertText
  - doc: TextDocument
  - position: int
  - text: String
class DeleteText
  - doc: TextDocument
  - deleted: String
class TextDocument
  + insert(pos: int, s: String): void
  + delete(pos: int, len: int): String
class Editor
  - undoStack: Deque<Command>
  - redoStack: Deque<Command>
  + run(c: Command): void
  + undo(): void
  + redo(): void
InsertText ..|> Command
DeleteText ..|> Command
InsertText --> TextDocument : receiver
DeleteText --> TextDocument : receiver
Editor o-- Command : history
```

## Java implementation

```java title="Undo/redo with command objects" file="CommandDemo.java"
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;

public class CommandDemo {
    public static void main(String[] args) {
        TextDocument doc = new TextDocument();
        Editor editor = new Editor();

        editor.run(new InsertText(doc, 0, "Hello"));
        editor.run(new InsertText(doc, 5, " world"));
        editor.run(new DeleteText(doc, 0, 6));
        System.out.println("'" + doc + "'");          // 'world'

        editor.undo();
        System.out.println("'" + doc + "'");          // 'Hello world'
        editor.undo();
        System.out.println("'" + doc + "'");          // 'Hello'
        editor.redo();
        System.out.println("'" + doc + "'");          // 'Hello world'

        // A macro: several commands executed and undone as one.
        editor.run(new MacroCommand(List.of(new InsertText(doc, 0, ">> "), new InsertText(doc, 14, " <<"))));
        System.out.println("'" + doc + "'");
        editor.undo();
        System.out.println("'" + doc + "'");
    }
}

/** Receiver: knows how to do the work, knows nothing about undo. */
class TextDocument {
    private final StringBuilder text = new StringBuilder();

    void insert(int pos, String s) { text.insert(pos, s); }

    String delete(int pos, int len) {
        String removed = text.substring(pos, pos + len);
        text.delete(pos, pos + len);
        return removed;
    }

    @Override public String toString() { return text.toString(); }
}

interface Command {
    void execute();
    void undo();
}

class InsertText implements Command {
    private final TextDocument doc;
    private final int position;
    private final String text;

    InsertText(TextDocument doc, int position, String text) { this.doc = doc; this.position = position; this.text = text; }

    public void execute() { doc.insert(position, text); }
    public void undo() { doc.delete(position, text.length()); }
}

class DeleteText implements Command {
    private final TextDocument doc;
    private final int position, length;
    private String deleted;                               // captured at execute time, needed for undo

    DeleteText(TextDocument doc, int position, int length) { this.doc = doc; this.position = position; this.length = length; }

    public void execute() { deleted = doc.delete(position, length); }
    public void undo() { doc.insert(position, deleted); }
}

class MacroCommand implements Command {
    private final List<Command> steps;
    MacroCommand(List<Command> steps) { this.steps = List.copyOf(steps); }

    public void execute() { steps.forEach(Command::execute); }
    public void undo() {
        for (int i = steps.size() - 1; i >= 0; i--) steps.get(i).undo();   // reverse order
    }
}

/** Invoker: manages history, unaware of what commands do. */
class Editor {
    private final Deque<Command> undoStack = new ArrayDeque<>();
    private final Deque<Command> redoStack = new ArrayDeque<>();

    void run(Command c) {
        c.execute();
        undoStack.push(c);
        redoStack.clear();                                // a new action invalidates the redo history
    }

    void undo() {
        if (undoStack.isEmpty()) return;
        Command c = undoStack.pop();
        c.undo();
        redoStack.push(c);
    }

    void redo() {
        if (redoStack.isEmpty()) return;
        Command c = redoStack.pop();
        c.execute();
        undoStack.push(c);
    }
}
```

## Commands for queues and scheduling

Without undo, a command is often just a `Runnable` or `Callable` with a name, an ID and metadata:

```java
record ScheduledJob(String id, Instant runAt, int attempt, Runnable action) {}
// A PriorityQueue<ScheduledJob> ordered by runAt is a scheduler; a worker pops and runs jobs.
```

Because the request is an object, the scheduler can **retry** it (re-enqueue with `attempt + 1`), **cancel** it (remove by ID), or **persist** it (serialise the parameters). See [Task Scheduler](problem:task-scheduler).

## Realistic use case

- **Editors** — undo/redo of typing, formatting and drawing.
- **Chess / games** — `Move` objects that can be undone (takebacks) and replayed (PGN history) ([Chess](problem:chess)).
- **Elevator requests** — floor requests queued as commands ([Elevator](problem:elevator)).
- **Banking** — transactions as commands with an audit log; compensating commands instead of undo.
- **Job queues** — `ExecutorService.submit(Runnable)` is the JDK's command queue.

## Trade-offs and alternatives

- **Pros:** decouples invoker from receiver; enables undo/redo, queuing, retries, logging and macros.
- **Cons:** a class per operation; undo can be **hard** (deleting a file, sending an email — some actions can only be *compensated*, not undone); stored commands hold references that can keep large objects alive.
- **Alternatives:**
  - **Lambdas / `Runnable`** for simple deferred actions.
  - **Memento** — snapshot the receiver's state for undo instead of writing an inverse operation (simpler for complex state, heavier on memory).
  - **Event sourcing** — persisted commands and events as the source of truth (an HLD-scale relative).

## Recognising it in an interview

"Undo/redo", "queue requests", "retry", "schedule this to run later", "keep a history of moves", "audit every operation". Any of these phrases points to Command.

## Common mistakes

- Commands that **don't capture enough state** to undo (forgetting the deleted text).
- **Undo in the wrong order** for macros (it must be reversed).
- **Not clearing the redo stack** after a new command.
- Commands with **business rules** — they should delegate to the receiver, which owns the rules.
- Treating irreversible side effects (payments, emails) as undoable; use **compensating** commands.

## Key takeaways

- Command turns a **request into an object** with `execute()` (and maybe `undo()`).
- Invoker, command and receiver are decoupled; the invoker manages history or queues.
- Enables **undo/redo, macros, scheduling, retries and audit logs**.
- Capture the state needed for undo at execute time; undo macros in reverse.

## Knowledge check

```quiz
? Why does DeleteText store the deleted string during execute()?
+ Undo needs to re-insert exactly what was removed, which isn't known until execution
- To make execute() faster
- Java requires commands to have fields
> Commands must capture whatever state their undo requires.

? A user undoes twice, then types something new. What should happen to the redo stack?
- Keep it so the user can still redo
+ Clear it, because the new action creates a different history branch
- Execute everything on it
> New actions invalidate the redo history.

? Which JDK API is essentially a command queue?
+ ExecutorService.submit(Runnable)
- String.format
- Optional.map
> Runnables are command objects executed later by worker threads.
```

## Exercise

Implement a bank `Account` with `deposit` and `withdraw`, plus `DepositCommand` and `WithdrawCommand` with undo. Add a `TransactionLog` invoker that executes commands, keeps a history, and supports `undoLast()`. Withdrawals that would overdraw must fail **without** being added to history.

````hint title="Hint"
Execute first; only push to history if execute didn't throw. Undo of a deposit is a withdrawal of the same amount, and vice versa.
````

````solution title="Reference solution"
```java file="BankCommandDemo.java"
import java.util.ArrayDeque;
import java.util.Deque;

public class BankCommandDemo {
    public static void main(String[] args) {
        Account acc = new Account(100);
        TransactionLog log = new TransactionLog();
        log.run(new DepositCommand(acc, 50));
        log.run(new WithdrawCommand(acc, 30));
        try {
            log.run(new WithdrawCommand(acc, 1_000));
        } catch (IllegalStateException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
        System.out.println("Balance " + acc.balance() + ", history " + log.size());
        log.undoLast();
        System.out.println("After undo: " + acc.balance());
    }
}

class Account {
    private long balance;
    Account(long opening) { balance = opening; }
    void deposit(long amt) { if (amt <= 0) throw new IllegalArgumentException("amount"); balance += amt; }
    void withdraw(long amt) {
        if (amt <= 0) throw new IllegalArgumentException("amount");
        if (amt > balance) throw new IllegalStateException("insufficient funds");
        balance -= amt;
    }
    long balance() { return balance; }
}

interface TxCommand { void execute(); void undo(); }

record DepositCommand(Account account, long amount) implements TxCommand {
    public void execute() { account.deposit(amount); }
    public void undo() { account.withdraw(amount); }
}

record WithdrawCommand(Account account, long amount) implements TxCommand {
    public void execute() { account.withdraw(amount); }
    public void undo() { account.deposit(amount); }
}

class TransactionLog {
    private final Deque<TxCommand> history = new ArrayDeque<>();
    void run(TxCommand c) {
        c.execute();            // throws -> never recorded
        history.push(c);
    }
    void undoLast() { if (!history.isEmpty()) history.pop().undo(); }
    int size() { return history.size(); }
}
```

In a real bank, "undo" would be a new **compensating** transaction in the ledger rather than deleting history — the audit trail must be append-only.
````
