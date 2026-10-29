## What a use-case diagram is for

A **use-case diagram** shows **who** interacts with a system (**actors**) and **what** they want to achieve (**use cases**), without saying anything about classes or code. It's a requirements tool: a one-glance picture of scope.

In interviews you rarely draw a formal one. But the *thinking* — list the actors, list each actor's goals — is the fastest way to make sure your requirements are complete before you design classes.

## The notation

```text
            ┌──────────────────── ATM System ────────────────────┐
            │                                                    │
  ┌─────┐   │   ( Authenticate )◀·····«include»·····┐            │
  │Cust-│───┼──▶( Withdraw cash )───────────────────┤            │
  │omer │───┼──▶( Check balance )···«include»·······┘            │
  └─────┘───┼──▶( Deposit cash )                                 │
            │        ▲                                           │
            │        ·  «extend» (if receipt requested)          │
            │   ( Print receipt )                                │
  ┌─────┐   │                                                    │
  │Oper-│───┼──▶( Refill cash )                                  │
  │ator │───┼──▶( View audit log )                               │
  └─────┘   │                                                    │
            │                         ( Approve transaction )────┼───┌──────┐
            │                                                    │   │ Bank │
            └────────────────────────────────────────────────────┘   └──────┘
```

| Element | Meaning |
|---|---|
| **Actor** (stick figure or box outside the system) | A role that interacts with the system: a person, another system, or a timer |
| **Use case** (oval) | A goal an actor achieves: verb + noun, such as "Withdraw cash" |
| **System boundary** (rectangle) | What's inside your system vs. outside |
| **Association** (line) | The actor participates in the use case |
| **«include»** | A use case **always** uses another (withdraw always includes authenticate) |
| **«extend»** | A use case **optionally** adds behaviour to another, under a condition (print receipt extends withdraw) |

> [!TIP]
> Actors are **roles**, not people. One person can be both a `Customer` and an `Operator`. External systems (bank core, payment gateway) and **time** ("every night at 2am") are actors too.

## From use cases to requirements

Each use case expands into a short scenario: a main success path plus alternatives.

```text
Use case: Withdraw cash          Actor: Customer
Precondition: card inserted and authenticated
Main flow:
  1. Customer selects "Withdraw" and enters an amount.
  2. System checks amount is a multiple of 100 and within daily limit.
  3. System asks Bank to approve the debit.
  4. System dispenses notes using available denominations.
  5. System updates the cash inventory and records the transaction.
Alternatives:
  2a. Invalid amount → show error, return to step 1.
  3a. Bank declines → show "insufficient funds", end.
  4a. Cannot make the amount with available notes → reverse debit, show error.
```

Every numbered step is a candidate **method or collaboration**, and every alternative is an **edge case** you must handle. Scenarios like this feed straight into [sequence diagrams](lesson:sequence-diagrams).

## From use cases to an API

Use cases grouped by actor often become **role interfaces** (see [Interface Segregation](lesson:interface-segregation)):

```java title="Actors → role interfaces" file="AtmUseCasesDemo.java"
import java.util.ArrayList;
import java.util.List;

public class AtmUseCasesDemo {
    public static void main(String[] args) {
        Atm atm = new Atm(5_000);
        CustomerOperations customer = atm;   // customer sees only customer use cases
        OperatorOperations operator = atm;   // operator sees only operator use cases

        customer.authenticate("CARD-1", "1234");
        System.out.println("Dispensed: " + customer.withdraw(1_500));
        operator.refill(2_000);
        System.out.println("Audit: " + operator.auditLog());
    }
}

/** Use cases of the Customer actor. */
interface CustomerOperations {
    void authenticate(String card, String pin);
    long withdraw(long amount);             // <<include>> authenticate: enforced by state check
}

/** Use cases of the Operator actor. */
interface OperatorOperations {
    void refill(long amount);
    List<String> auditLog();
}

class Atm implements CustomerOperations, OperatorOperations {
    private long cash;
    private boolean authenticated;
    private final List<String> audit = new ArrayList<>();

    Atm(long initialCash) { this.cash = initialCash; }

    public void authenticate(String card, String pin) {
        authenticated = "1234".equals(pin);   // stand-in for a Bank actor call
        audit.add("auth " + card + " -> " + authenticated);
    }

    public long withdraw(long amount) {
        if (!authenticated) throw new IllegalStateException("authenticate first");
        if (amount <= 0 || amount % 100 != 0) throw new IllegalArgumentException("amount must be a positive multiple of 100");
        if (amount > cash) throw new IllegalStateException("ATM has insufficient cash");
        cash -= amount;
        audit.add("withdraw " + amount);
        return amount;
    }

    public void refill(long amount) {
        cash += amount;
        audit.add("refill " + amount);
    }

    public List<String> auditLog() { return List.copyOf(audit); }
}
```

## Real-world example

Before building a clinic appointment system, a team listed actors: patient, receptionist, doctor, *the SMS gateway* and *the nightly scheduler*. The last two weren't people, but listing them surfaced requirements nobody had mentioned: reminder messages 24 hours before appointments, and auto-cancelling unconfirmed bookings at midnight. Both became first-class use cases instead of surprises in week six.

## Common mistakes

- **Use cases that are UI steps** ("Click OK button"), not goals.
- **Functional decomposition** — dozens of tiny use cases forming a call tree. Keep them at the goal level.
- **Overusing «include» / «extend».** They're optional; plain lines are fine in interviews.
- **Forgetting non-human actors**: external systems and time.

## In the interview

> [!INTERVIEW] A lightweight version
> You don't need ovals. Say: *"Actors are Customer, Operator and the Bank. Customers authenticate, withdraw, deposit and check balance; operators refill and audit; the bank approves debits."* Then write the list. That's a use-case diagram in thirty seconds, and it drives your requirements.

## Key takeaways

- Use-case diagrams capture **actors** and their **goals** — scope, not structure.
- Actors are **roles**, including external systems and time.
- Expand each use case into a **main flow plus alternatives**; alternatives are your edge cases.
- Use cases grouped by actor map naturally to **role interfaces**.

## Knowledge check

```quiz
? In an ATM, "Authenticate" must happen before every withdrawal. Which relationship expresses that?
+ Withdraw «include» Authenticate
- Authenticate «extend» Withdraw
- Withdraw inherits from Authenticate
> «include» means the base use case always incorporates the included one.

? Which is an appropriate actor for a library system?
- The Book class
+ A nightly job that sends overdue notices
- The "Return book" button
> Actors are roles outside the system boundary, including timers and external systems.

? What is the main value of listing use-case alternatives (like "bank declines")?
- They make diagrams bigger
+ They reveal edge cases and error handling the design must support
- They replace class diagrams
> Alternatives are where most edge cases come from.
```

## Exercise

For a **food delivery app**, list the actors (at least four, including one non-human) and 2–4 use cases for each. Then write the main flow and two alternative flows for "Place order".

````hint title="Hint"
Think beyond the customer: the restaurant, the delivery partner, the payment gateway, and the clock.
````

````solution title="Sample answer"
**Actors and use cases**
- *Customer*: browse restaurants, place order, track order, cancel order, rate delivery.
- *Restaurant*: accept or reject order, mark food ready, update menu.
- *Delivery partner*: accept delivery, mark picked up, mark delivered.
- *Payment gateway* (system): authorise payment, refund.
- *Timer* (time): auto-cancel orders not accepted within 10 minutes.

**Place order — main flow:** (1) Customer reviews the cart from a single restaurant; (2) the system validates that items are available and the restaurant is open; (3) the system calculates the total with fees and discounts; (4) the payment gateway authorises payment; (5) the order is created as PLACED and the restaurant is notified.

**Alternatives:** 2a — an item became unavailable: show an updated cart and require confirmation. 4a — payment declined: the order isn't created; show a retry option.

Continue in the [Food Ordering](problem:food-ordering) problem.
````
