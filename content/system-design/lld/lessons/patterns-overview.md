## What a design pattern is

A **design pattern** is a named, reusable solution to a recurring design problem. The 1994 *Design Patterns* book (the "Gang of Four", or GoF) catalogued 23 of them. Their real value is twofold:

1. **A proven shape** for a common problem, so you don't reinvent it badly.
2. **A shared vocabulary.** Saying "pricing is a Strategy" communicates a whole structure in three words.

A pattern is **not** a goal, a checklist item or something to collect. It's a tool you pick up **when you have the problem it solves**.

## The three families

| Family | Question it answers | Patterns in this track |
|---|---|---|
| **Creational** | How are objects created, without coupling callers to concrete classes? | [Singleton](lesson:singleton), [Factory Method](lesson:factory-method), [Abstract Factory](lesson:abstract-factory), [Builder](lesson:builder), [Prototype](lesson:prototype) |
| **Structural** | How are objects composed into larger structures? | [Adapter](lesson:adapter), [Decorator](lesson:decorator), [Facade](lesson:facade), [Composite](lesson:composite), [Proxy](lesson:proxy), [Bridge](lesson:bridge) |
| **Behavioral** | How do objects distribute responsibility and communicate? | [Strategy](lesson:strategy), [Observer](lesson:observer), [State](lesson:state-pattern), [Command](lesson:command), [Template Method](lesson:template-method), [Chain of Responsibility](lesson:chain-of-responsibility), [Iterator](lesson:iterator), [Mediator](lesson:mediator), [Specification](lesson:specification) |

## The patterns that matter most in LLD interviews

Ranked by how often they genuinely fit interview problems:

1. **Strategy** — pricing, matching, eviction, scheduling, splitting rules. Appears in about half of all problems.
2. **State** (or an enum state machine) — vending machine, elevator, order, booking, payment lifecycles.
3. **Observer** — notifications, event-driven updates, pub/sub.
4. **Factory** — creating the right variant from input (vehicle types, pieces, notifications).
5. **Builder** — complex immutable objects (orders, requests, configurations).
6. **Decorator / Chain of Responsibility** — layered behaviour (toppings, middleware, validation, approval chains).
7. **Command** — undo/redo, queued or scheduled work, audit logs.
8. **Composite** — trees (file systems, menus, rule groups).
9. **Adapter / Facade** — integrating third-party APIs; simplifying a subsystem.

The rest are good to recognise but rarely central.

## How to choose a pattern: start from the problem

Never ask "which patterns can I use here?" Ask **"what problem do I have?"** and see whether a pattern answers it:

| You notice… | Consider |
|---|---|
| A `switch` on a type/algorithm that keeps growing | Strategy (or plain polymorphism) |
| Behaviour depends heavily on the current status, with many `if (status == …)` | State |
| Many objects need to react when something happens | Observer |
| Callers shouldn't know which concrete class to instantiate | Factory Method |
| A constructor with many optional parameters | Builder |
| Optional features stack in arbitrary combinations | Decorator |
| A request must pass through a sequence of handlers or checks | Chain of Responsibility |
| You need undo, queuing, retry or logging of operations | Command |
| Part-whole trees where leaves and groups are treated alike | Composite |
| A third-party API doesn't match your interface | Adapter |

## The cost of every pattern

Every pattern adds **indirection**: more types, more files and more hops when reading the code. That cost is worth paying only when the pattern removes a bigger cost — duplicated conditionals, rigid coupling, combinatorial classes.

```java title="Pattern for its own sake ❌"
interface GreetingStrategy { String greet(String name); }
class EnglishGreeting implements GreetingStrategy { public String greet(String n) { return "Hello " + n; } }
class GreetingStrategyFactory { static GreetingStrategy create() { return new EnglishGreeting(); } }
// Requirements: "print Hello <name>". There is one language, and no variation is mentioned.
```

```java title="Just enough ✅"
String greet(String name) { return "Hello " + name; }
```

## Java has absorbed many patterns

Modern Java gives you lightweight versions of several patterns:

- **Strategy / Command** → a functional interface plus a lambda: `Comparator<Order> byTotal = Comparator.comparing(Order::total);`
- **Iterator** → `Iterable` and the enhanced `for` loop.
- **Observer** → `Consumer<Event>` listeners.
- **Template Method** → often replaced by passing lambdas for the varying steps.
- **Singleton** → an `enum` with one constant, or (better) a single instance wired by DI.

Knowing the classic structure still matters: it's what you'll *say* and what interviewers expect to recognise.

```java title="Strategy as a lambda" file="LambdaStrategyDemo.java"
import java.util.Comparator;
import java.util.List;
import java.util.function.ToLongFunction;

public class LambdaStrategyDemo {
    public static void main(String[] args) {
        List<Driver> drivers = List.of(new Driver("D1", 1.2, 4.9), new Driver("D2", 0.4, 4.1), new Driver("D3", 0.9, 4.7));

        // Each Comparator is a matching strategy; no class hierarchy needed for simple cases.
        Comparator<Driver> nearest = Comparator.comparingDouble(Driver::distanceKm);
        Comparator<Driver> bestRated = Comparator.comparingDouble(Driver::rating).reversed();

        System.out.println("Nearest: " + pick(drivers, nearest).id());
        System.out.println("Best rated: " + pick(drivers, bestRated).id());

        ToLongFunction<Driver> eta = d -> Math.round(d.distanceKm() * 3);   // minutes
        System.out.println("ETA for nearest: " + eta.applyAsLong(pick(drivers, nearest)) + " min");
    }

    static Driver pick(List<Driver> drivers, Comparator<Driver> strategy) {
        return drivers.stream().min(strategy).orElseThrow();
    }
}

record Driver(String id, double distanceKm, double rating) {}
```

Promote a lambda to a named class when the strategy needs **state**, **dependencies**, **configuration** or **its own tests**.

## Real-world example

A team reviewing a junior engineer's notification module found an `AbstractNotificationFactoryBuilder`, an `ObserverRegistry` and a `NotificationStrategyContext` for a feature that sent one kind of email. Replacing it with a `Notifier` interface and one `EmailNotifier` cut 600 lines to 60. Six months later, SMS support arrived: one new class. The pattern (Strategy, via an interface) arrived exactly when it was needed.

## Common mistakes

- **Pattern-first design**: announcing patterns before understanding requirements.
- **Patterns as resume keywords**: "I used Singleton, Factory and Observer" with no problem each one solved.
- **Ignoring simpler language features** — enums and lambdas often suffice.
- **Pattern-name pedantry**: arguing whether something is Strategy or State instead of whether it's clear.

## In the interview

> [!INTERVIEW] Name the problem, then the pattern
> *"Fee calculation varies by vehicle and will change, so I'll make it a Strategy — `PricingStrategy` with `HourlyPricing` for now."* That order — **problem → pattern → minimal implementation** — is what interviewers want. If they ask "why not a pattern for X?", *"It doesn't vary, so it would only add indirection"* is a great answer.

## Key takeaways

- Patterns are **named solutions to recurring problems** and a **shared vocabulary**.
- **Creational** (creating objects), **structural** (composing them), **behavioral** (distributing behaviour).
- Start from the **problem**; every pattern has an indirection cost.
- Strategy, State, Observer, Factory, Builder, Decorator/Chain, Command and Composite cover most interview needs.
- Modern Java (enums, lambdas, records) gives lighter versions of many patterns.

## Knowledge check

```quiz
? What's the best first question when considering a design pattern?
- Which patterns does this company like?
+ What concrete problem do I have, and does a pattern solve it better than simple code?
- How many patterns can I fit in?
> Patterns are justified by problems, not by their own existence.

? Which family does Builder belong to?
+ Creational
- Structural
- Behavioral
> Builder is about constructing complex objects.

? When should a lambda-based strategy become a named class?
- Never; lambdas are always better
+ When the strategy needs state, dependencies, configuration or its own tests
- When there are more than two strategies
> Named classes carry state and dependencies and are easier to test and document.
```

## Exercise

For each scenario, name the problem in one sentence and decide whether a pattern is justified. If so, which one?

1. A parking lot must support hourly pricing now and "weekend" and "event" pricing next quarter.
2. A tic-tac-toe game prints the board to the console.
3. A text editor needs undo and redo for typing, deleting and formatting.
4. A food delivery app has optional add-ons (extra cheese, extra sauce, large size) that combine freely and each change the price.
5. A logging library writes every message to the console.

````hint title="Hint"
Look for stated variation, combinations, history (undo) and fan-out. Where none of these exist, simple code wins.
````

````solution title="Sample answer"
1. **Pricing varies and will grow** → Strategy (`PricingStrategy`).
2. **Rendering doesn't vary** → no pattern; a `render()` method or a small `ConsoleRenderer` kept separate from game logic.
3. **Operations must be reversible and recorded** → Command (with undo stacks).
4. **Features combine freely** → Decorator (or simply a list of `AddOn` value objects summed by the order — often simpler).
5. **One destination, no variation stated** → no pattern yet. If destinations are listed as a requirement, introduce an `Appender` interface (Strategy/Observer). See [Logging Framework](problem:logging-framework).
````
