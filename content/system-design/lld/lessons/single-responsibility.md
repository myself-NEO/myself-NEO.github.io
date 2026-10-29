## The principle

> **A class should have one, and only one, reason to change.**

"Reason to change" is the key phrase. It doesn't mean "a class should do one thing" (then every class would have one method). It means a class should serve **one source of change** — often one *actor* or stakeholder. Robert C. Martin's later phrasing: *a module should be responsible to one, and only one, actor.*

## Analogy

A restaurant has a chef, a cashier and a cleaner. If the menu changes, only the chef's work changes. If the payment system changes, only the cashier's. Now imagine one person doing all three jobs with one shared notebook: a new tax rule means rewriting pages that also contain recipes, and a mistake in one can spill into the others.

## The problematic version

```java title="❌ One class, three actors"
class Employee {
    private final String name;
    private final long monthlySalary;
    private final int overtimeHours;

    Employee(String name, long monthlySalary, int overtimeHours) { /* ... */ }

    // Actor 1: Finance (payroll rules)
    long calculatePay() {
        return monthlySalary + regularHourRate() * overtimeHours * 3 / 2;
    }

    // Actor 2: HR (reporting format)
    String hoursReport() {
        return name + " overtime: " + overtimeHours + "h at " + regularHourRate();
    }

    // Actor 3: IT/DBA (persistence)
    void save(java.sql.Connection connection) { /* INSERT INTO employees ... */ }

    // Shared helper - the trap
    private long regularHourRate() { return monthlySalary / 160; }
}
```

What goes wrong:

1. **Accidental coupling.** HR asks for the report to show hours based on a 168-hour month. A developer changes `regularHourRate()` — and silently changes everyone's **pay**.
2. **Merge conflicts.** Finance's and HR's changes collide in the same file.
3. **Heavy dependencies.** Anything that needs `calculatePay()` drags in `java.sql` because `save()` lives in the same class.
4. **Hard to test.** Testing pay logic means constructing a class that knows about databases.

## The improved version

Separate by actor. Keep the **data** in a small class or record, and give each actor's logic its own home:

```java title="✅ One reason to change per class" file="SrpDemo.java"
import java.util.HashMap;
import java.util.Map;

public class SrpDemo {
    public static void main(String[] args) {
        EmployeeRecord asha = new EmployeeRecord("E1", "Asha", 160_000, 10);

        PayCalculator payroll = new PayCalculator();
        HoursReporter hr = new HoursReporter();
        EmployeeRepository repo = new InMemoryEmployeeRepository();

        System.out.println("Pay: " + payroll.monthlyPay(asha));
        System.out.println(hr.overtimeReport(asha));
        repo.save(asha);
        System.out.println("Saved: " + repo.findById("E1").name());
    }
}

/** Data shared by all actors - no actor-specific logic. */
record EmployeeRecord(String id, String name, long monthlySalary, int overtimeHours) {}

/** Finance owns this. */
class PayCalculator {
    private static final int PAYROLL_HOURS_PER_MONTH = 160;

    long monthlyPay(EmployeeRecord e) {
        long hourly = e.monthlySalary() / PAYROLL_HOURS_PER_MONTH;
        return e.monthlySalary() + hourly * e.overtimeHours() * 3 / 2;
    }
}

/** HR owns this - free to use its own hour convention. */
class HoursReporter {
    private static final int REPORTING_HOURS_PER_MONTH = 168;

    String overtimeReport(EmployeeRecord e) {
        return e.name() + " overtime: " + e.overtimeHours() + "h (reference rate " + e.monthlySalary() / REPORTING_HOURS_PER_MONTH + "/h)";
    }
}

/** IT owns this. */
interface EmployeeRepository {
    void save(EmployeeRecord e);
    EmployeeRecord findById(String id);
}

class InMemoryEmployeeRepository implements EmployeeRepository {
    private final Map<String, EmployeeRecord> store = new HashMap<>();
    public void save(EmployeeRecord e) { store.put(e.id(), e); }
    public EmployeeRecord findById(String id) { return store.get(id); }
}
```

## Why it works

- Each class changes for **one** actor's reasons, so changes don't leak across.
- The duplicated-looking "hourly rate" is **not real duplication**: Finance's and HR's conventions just happened to match at first. They are different knowledge that may diverge (see [DRY](lesson:dry-kiss-yagni)).
- `PayCalculator` has no I/O dependencies, so it's trivial to unit test.
- If callers want a single entry point, add a thin [Facade](lesson:facade) — it delegates and contains no rules.

```uml title="After applying SRP"
record EmployeeRecord
  + id: String
  + monthlySalary: long
class PayCalculator
  + monthlyPay(e: EmployeeRecord): long
class HoursReporter
  + overtimeReport(e: EmployeeRecord): String
interface EmployeeRepository
  + save(e: EmployeeRecord): void
class InMemoryEmployeeRepository
PayCalculator ..> EmployeeRecord
HoursReporter ..> EmployeeRecord
InMemoryEmployeeRepository ..|> EmployeeRepository
```

## How to find the responsibilities

- **List the actors** who could request changes: finance, ops, compliance, UX, the DBA.
- **Group methods by actor.** Each group is a candidate class.
- **Look for "and"** in the class description.
- **Look at imports.** A domain class importing `java.sql`, `java.net.http` and a JSON library is serving several masters.
- **Look at the git history.** If unrelated features keep touching the same file, it has several reasons to change.

## Real-world example

An `InvoiceService` generated invoice numbers, calculated GST, rendered PDFs and emailed them. A change to the PDF template library broke GST calculation tests (shared helper functions), and two teams were blocked on each other's releases. Splitting into `InvoiceNumberGenerator`, `TaxCalculator`, `InvoiceRenderer` and `InvoiceMailer` — coordinated by a small `InvoiceService` — let the teams release independently.

## Common mistakes

- **Over-splitting.** `UserValidator`, `UserNameValidator`, `UserEmailValidator`, `UserAgeValidator`… each with one method, always changing together. That's fragmentation, not SRP. Responsibilities are about **reasons to change**, not method counts.
- **Anaemic data + "service per verb".** SRP doesn't mean removing behaviour from entities. `Order.cancel()` enforcing its own cancellation rule *is* the order's responsibility.
- **SRP as an excuse for god services.** Moving everything from `Order` into `OrderService` just relocates the problem.

## Interview questions

> [!INTERVIEW] Likely questions
> - *"What does Single Responsibility mean to you?"* → "One reason to change — one actor. Not one method."
> - *"Your `ParkingLot` calculates fees, assigns spots and prints receipts. Is that OK?"* → "Fees change for business reasons, allocation for operational ones, receipts for UX. I'd extract `PricingStrategy` and a `ReceiptPrinter`, and keep allocation in the lot."
> - *"Isn't that over-engineering?"* → "Only if those concerns never change independently. Pricing nearly always does, so it earns its own class; receipt printing I'd leave inline until it grows."

## Key takeaways

- SRP = **one reason to change** (one actor), not "one method".
- Mixed responsibilities cause **accidental coupling**, merge conflicts and hard-to-test code.
- Split along **actors and change axes**; keep shared data simple.
- Don't fragment code that always changes together, and don't strip behaviour from entities.

## Knowledge check

```quiz
? Which best describes SRP?
- Each class should have exactly one public method
+ Each class should have one reason to change, typically one actor or stakeholder
- Each class should be under 100 lines
> SRP is about sources of change, not size or method count.

? Payroll and HR reports share a private `hourlyRate()` helper, and HR changes it for their report. What's the risk?
+ Payroll calculations silently change, because both actors depend on the same code
- None — sharing code is always good
- The code won't compile
> Logic shared across actors couples their changes: the classic SRP violation.

? Which split is most likely over-applying SRP?
- Separating pricing rules from spot allocation in a parking lot
+ Creating separate classes for validating a user's first name, last name and middle name that always change together
- Moving SQL out of a domain class into a repository
> Classes that always change together belong together.
```

## Exercise

Identify the responsibilities in this class, the actor behind each, and propose a split:

```java
class ReportGenerator {
    List<Sale> loadSales(LocalDate day) { /* SQL query */ }
    Summary summarise(List<Sale> sales) { /* totals by region, top products */ }
    String toHtml(Summary s) { /* HTML table with company CSS */ }
    void emailToManagers(String html) { /* SMTP, recipient list from config */ }
}
```

````hint title="Hint"
Who would ask for a change to each method? The DBA? The sales director? The brand team? IT ops?
````

````solution title="Sample answer"
| Method | Actor | New home |
|---|---|---|
| `loadSales` | DBA / data team | `SalesRepository` interface (with a JDBC implementation) |
| `summarise` | Sales leadership (business rules) | `SalesSummariser` — pure logic, easy to test |
| `toHtml` | Brand / UX | `SummaryRenderer` (with an `HtmlSummaryRenderer`) |
| `emailToManagers` | IT ops | `ReportDistributor` / `Notifier` |

Keep a thin `DailySalesReportJob` that wires them together: `repo.load → summariser → renderer → distributor`. It contains orchestration, not rules.
````
