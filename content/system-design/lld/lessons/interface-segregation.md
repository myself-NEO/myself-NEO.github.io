## The principle

> **Clients should not be forced to depend on methods they do not use.**

A "fat" interface bundles many operations. Every client that depends on it is coupled to *all* of them: it recompiles when any of them changes, and every implementation must provide *all* of them, even when some make no sense. ISP says: shape interfaces around **what clients need** — *role interfaces* — rather than around everything an implementation can do.

## Analogy

A TV remote with 60 buttons serves the technician who calibrates the TV, not the person who wants volume and channel. Hotels hand guests a simple remote with six buttons. Same TV, different interface per client.

## The problematic version

```java title="❌ One interface for every kind of machine"
interface Machine {
    void print(Document d);
    void scan(Document d);
    void fax(Document d, String number);
    void staple(Document d);
}

class BasicPrinter implements Machine {
    public void print(Document d) { /* ... */ }
    public void scan(Document d)  { throw new UnsupportedOperationException(); }   // BAD
    public void fax(Document d, String n) { throw new UnsupportedOperationException(); }  // BAD
    public void staple(Document d) { throw new UnsupportedOperationException(); }  // BAD
}

class PrintQueue {
    private final Machine machine;   // only ever calls print(), but depends on fax/scan/staple too
}
```

Problems:

- `BasicPrinter` must implement operations it can't support — an [LSP](lesson:liskov-substitution) violation waiting to happen.
- `PrintQueue` is coupled to fax changes it doesn't care about.
- Test doubles for `PrintQueue` must stub four methods to test one.

## The improved version

```java title="✅ Role interfaces" file="IspDemo.java"
import java.util.ArrayList;
import java.util.List;

public class IspDemo {
    public static void main(String[] args) {
        BasicPrinter basic = new BasicPrinter();
        OfficeMachine office = new OfficeMachine();

        PrintQueue queue = new PrintQueue(basic);          // needs only Printer
        queue.submit(new Document("report.pdf"));
        queue.submit(new Document("slides.pdf"));
        queue.flush();

        ArchiveJob archive = new ArchiveJob(office);       // needs Scanner
        archive.archive(new Document("contract.pdf"));

        PrintQueue officeQueue = new PrintQueue(office);   // office machine is also a Printer
        officeQueue.submit(new Document("memo.pdf"));
        officeQueue.flush();
    }
}

record Document(String name) {}

interface Printer { void print(Document d); }
interface Scanner { byte[] scan(Document d); }
interface Fax { void fax(Document d, String number); }

class BasicPrinter implements Printer {
    public void print(Document d) { System.out.println("Basic printer: " + d.name()); }
}

/** A multi-function device implements several roles. */
class OfficeMachine implements Printer, Scanner, Fax {
    public void print(Document d) { System.out.println("Office machine prints " + d.name()); }
    public byte[] scan(Document d) { System.out.println("Office machine scans " + d.name()); return new byte[0]; }
    public void fax(Document d, String number) { System.out.println("Faxing " + d.name() + " to " + number); }
}

/** Depends only on what it uses. */
class PrintQueue {
    private final Printer printer;
    private final List<Document> pending = new ArrayList<>();

    PrintQueue(Printer printer) { this.printer = printer; }
    void submit(Document d) { pending.add(d); }
    void flush() {
        pending.forEach(printer::print);
        pending.clear();
    }
}

class ArchiveJob {
    private final Scanner scanner;
    ArchiveJob(Scanner scanner) { this.scanner = scanner; }
    void archive(Document d) { System.out.println("Archived " + scanner.scan(d).length + " bytes"); }
}
```

```uml title="Role interfaces"
interface Printer
  + print(d: Document): void
interface Scanner
  + scan(d: Document): byte[]
interface Fax
  + fax(d: Document, number: String): void
class BasicPrinter
class OfficeMachine
class PrintQueue
class ArchiveJob
BasicPrinter ..|> Printer
OfficeMachine ..|> Printer
OfficeMachine ..|> Scanner
OfficeMachine ..|> Fax
PrintQueue --> Printer
ArchiveJob --> Scanner
```

## Why it works

- Implementations only promise what they can deliver, so no `UnsupportedOperationException`.
- Clients depend on **narrow** contracts, so they're insulated from unrelated changes.
- Test doubles are tiny — often a lambda, because single-method interfaces are functional interfaces.
- Capabilities compose: a device that can print and scan simply implements both.

## Designing role interfaces

1. **Start from the clients.** List who calls the interface and which methods each uses.
2. **Group by client need** — one interface per role.
3. **Combine with inheritance** where one role builds on another (`WritableStorage extends ReadableStorage`).
4. **Don't go too far.** One method per interface for a class whose clients always use all of its methods is just noise.

> [!TIP] Interfaces belong to clients
> A good question is "what does *this caller* need?", not "what can *this class* do?" This also sets up [Dependency Inversion](lesson:dependency-inversion), where the high-level client *owns* the interface it needs.

## Real-world example

A banking app's `AccountService` interface had 40 methods used by mobile, web, batch and admin clients. A change to an admin-only method forced every client team to rebuild and redeploy. Splitting it into `AccountQueries`, `Transfers`, `StatementExports` and `AccountAdministration` gave each client a small dependency, and releases were decoupled.

## Common mistakes

- **Interface per class** ("header interfaces") mirroring every public method of one implementation.
- **Over-splitting** into dozens of one-method interfaces that are always used together.
- **Splitting by implementation** (what the class can do) rather than by client (what callers need).
- **Default methods that throw** — the fat interface problem with extra steps.

## Interview questions

> [!INTERVIEW] Likely questions
> - *"Your `ParkingLotAdmin` and `ParkingLotCustomer` both use `ParkingLot`. Should they?"* → "Customers need `park`/`unpark`; admins need `addLevel`/`setRates`. I'd expose two role interfaces implemented by the same class, so customer code can't call admin operations."
> - *"How is ISP different from SRP?"* → "SRP is about a class's reasons to change; ISP is about a client's dependencies. A class with one responsibility can still expose different role interfaces to different clients."

## Key takeaways

- Clients should depend only on the methods they **use**.
- Design **role interfaces** around client needs; one class may implement several.
- Fat interfaces cause forced implementations, LSP violations and unnecessary coupling.
- Balance against **interface explosion**: group methods that are used together.

## Knowledge check

```quiz
? A ReportViewer only reads reports but depends on a ReportStore interface with read, write, delete and purge. What's the ISP fix?
- Add a no-op implementation of write/delete/purge to ReportViewer
+ Introduce a ReportReader interface with read(); ReportViewer depends on that
- Make ReportStore an abstract class
> Give the client a role interface containing only what it needs.

? Which situation is the clearest ISP violation?
+ An implementation throws UnsupportedOperationException for half of an interface's methods
- A class implements two interfaces
- An interface has three methods
> Being forced to implement methods you can't support is the classic symptom of a fat interface.

? Who should an interface be designed for?
- The implementing class
+ The clients that call it
- The database
> Role interfaces are shaped around client needs.
```

## Exercise

An ATM depends on `BankBackend` with: `authenticate(card, pin)`, `balance(account)`, `withdraw(account, amount)`, `deposit(account, amount)`, `openAccount(customer)`, `closeAccount(account)` and `generateMonthlyStatements()`. The ATM never opens or closes accounts or generates statements. Split the interface and show which clients use which parts: ATM, branch teller desktop, nightly batch job.

````hint title="Hint"
List each client's calls, then group methods into roles. A class can still implement all the roles.
````

````solution title="Sample answer"
```java
interface Authenticator      { Session authenticate(String card, String pin); }
interface AccountQueries     { long balance(String account); }
interface CashTransactions   { void withdraw(String account, long amount); void deposit(String account, long amount); }
interface AccountLifecycle   { String openAccount(Customer c); void closeAccount(String account); }
interface StatementGenerator { void generateMonthlyStatements(); }

class CoreBankingService implements Authenticator, AccountQueries, CashTransactions, AccountLifecycle, StatementGenerator { ... }
```

| Client | Depends on |
|---|---|
| ATM | `Authenticator`, `AccountQueries`, `CashTransactions` |
| Teller desktop | `AccountQueries`, `CashTransactions`, `AccountLifecycle` |
| Nightly batch | `StatementGenerator` |

The ATM can no longer even *see* `closeAccount`. See the [ATM](problem:atm) problem.
````
