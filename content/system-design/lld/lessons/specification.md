## The problem

Business rules about **whether something qualifies** tend to spread and tangle: *"a member can borrow if they have fewer than 5 loans and no unpaid fines, unless they're staff"*; *"apply the discount if the cart total is over ₹1,000 and the customer is new or it's a festival day"*; *"flag the transaction if it's over ₹50,000 from a new device, or abroad"*. Written inline, these become long boolean expressions duplicated across validation, querying and reporting — and nobody can read them back as rules.

**Specification** encapsulates a business rule as an object with one method, `isSatisfiedBy(candidate)`, and lets you **combine** rules with `and`, `or` and `not` to build complex rules from simple, named, testable pieces.

## When to use it — and when not

**Use when:**

- Rules are **composed** from smaller conditions, and the combinations change.
- The same rule is needed in **several places** (validation, filtering, explaining *why* something failed).
- Rules should be **configurable** (a rule engine) or **named** in the domain language.

**Don't use when:**

- A single simple condition is needed in one place: a method like `member.canBorrow()` is clearer.

## Core idea

- `Specification<T>` with `boolean isSatisfiedBy(T t)`.
- Leaf specifications for atomic rules (`HasNoUnpaidFines`).
- **Composite** specifications for combinators (`And`, `Or`, `Not`) — this is the [Composite](lesson:composite) pattern applied to predicates.
- In Java, it's natural to build on `java.util.function.Predicate<T>`, which already has `and`, `or` and `negate`. A custom interface adds **names** and **explanations**.

## UML

```uml title="Specification"
interface Specification<T>
  + isSatisfiedBy(t: T): boolean
  + and(other: Specification): Specification
  + or(other: Specification): Specification
  + not(): Specification
class AndSpec
class OrSpec
class NotSpec
class HasFewerLoansThan
class HasNoUnpaidFines
class IsStaff
AndSpec ..|> Specification
OrSpec ..|> Specification
NotSpec ..|> Specification
HasFewerLoansThan ..|> Specification
HasNoUnpaidFines ..|> Specification
IsStaff ..|> Specification
AndSpec o-- Specification : left, right
```

## Java implementation

```java title="Named, composable, explainable rules" file="SpecificationDemo.java"
import java.util.List;
import java.util.function.Predicate;

public class SpecificationDemo {
    public static void main(String[] args) {
        Spec<Member> canBorrow =
                Spec.named("fewer than 5 loans", (Member m) -> m.activeLoans() < 5)
                    .and(Spec.named("no unpaid fines", m -> m.unpaidFines() == 0))
                    .or(Spec.named("is staff", Member::staff));

        List<Member> members = List.of(
                new Member("asha", 2, 0, false),
                new Member("ravi", 5, 0, false),
                new Member("meera", 6, 300, true),
                new Member("kabir", 1, 120, false));

        for (Member m : members) {
            System.out.println(m.name() + ": " + (canBorrow.isSatisfiedBy(m) ? "OK" : "DENIED") + "  -- " + canBorrow.explain(m));
        }

        // The same rule reused as a filter.
        System.out.println("Eligible: " + members.stream().filter(canBorrow::isSatisfiedBy).map(Member::name).toList());
    }
}

record Member(String name, int activeLoans, long unpaidFines, boolean staff) {}

interface Spec<T> {
    boolean isSatisfiedBy(T candidate);

    /** Human-readable reason, useful for error messages and audits. */
    String explain(T candidate);

    static <T> Spec<T> named(String name, Predicate<T> rule) {
        return new Spec<>() {
            public boolean isSatisfiedBy(T c) { return rule.test(c); }
            public String explain(T c) { return (rule.test(c) ? "PASS " : "FAIL ") + name; }
        };
    }

    default Spec<T> and(Spec<T> other) {
        Spec<T> self = this;
        return new Spec<>() {
            public boolean isSatisfiedBy(T c) { return self.isSatisfiedBy(c) && other.isSatisfiedBy(c); }
            public String explain(T c) { return "(" + self.explain(c) + " AND " + other.explain(c) + ")"; }
        };
    }

    default Spec<T> or(Spec<T> other) {
        Spec<T> self = this;
        return new Spec<>() {
            public boolean isSatisfiedBy(T c) { return self.isSatisfiedBy(c) || other.isSatisfiedBy(c); }
            public String explain(T c) { return "(" + self.explain(c) + " OR " + other.explain(c) + ")"; }
        };
    }

    default Spec<T> not() {
        Spec<T> self = this;
        return new Spec<>() {
            public boolean isSatisfiedBy(T c) { return !self.isSatisfiedBy(c); }
            public String explain(T c) { return "NOT " + self.explain(c); }
        };
    }
}
```

The rule reads almost like the requirement, each part is testable on its own, and the same object validates, filters *and* explains.

## Specifications vs `Predicate`

`Predicate<T>` already composes (`p1.and(p2).or(p3.negate())`), and for many cases that's enough. Reach for a custom `Specification` type when you need **names**, **explanations**, **serialisation** (rules stored as configuration), or translation into **queries** (for example, to SQL `WHERE` clauses or JPA Criteria, as Spring Data's `Specification` does).

## Realistic use case

- **[Rule Engine](problem:rule-engine)**: discount eligibility, fraud flags and feature-flag targeting built from configurable specifications.
- **[Library](problem:library-management)**: borrowing eligibility reused by the borrow endpoint, the member dashboard ("why can't I borrow?") and nightly reports.
- **Search filters**: "available rooms with capacity ≥ 8 AND has projector" — the same spec filters in memory or converts to a query.
- **Spring Data JPA** ships a `Specification<T>` for composable query predicates.

## Trade-offs and alternatives

- **Pros:** rules are named, reusable, composable and individually testable; supports explanations and configuration.
- **Cons:** indirection for simple rules; deeply nested compositions are hard to debug without `explain()`; in-memory specs don't automatically become efficient database queries.
- **Alternatives:** methods on the entity (`member.canBorrow()`) for fixed rules; plain `Predicate` composition; [Chain of Responsibility](lesson:chain-of-responsibility) when rules are ordered checks with early exit and error messages.

## Recognising it in an interview

"Eligibility", "qualifies for", "matches criteria", "configurable rules", "AND/OR conditions", "explain why it was rejected". Mention Specification when rules are numerous and combinable. Otherwise a well-named method is better.

## Common mistakes

- **Spec explosion** — a class per trivial condition. Use lambdas with names.
- **Side effects inside `isSatisfiedBy`** — specifications must be pure.
- **Duplicating the rule** in SQL and Java independently, so they drift. Generate one from the other or keep a single source of truth.
- **Losing the reason** — returning only `false` where users need to know which part failed.

## Key takeaways

- Specification turns business rules into **composable predicate objects**.
- Combinators (`and`, `or`, `not`) are a **Composite** of rules.
- Reuse one spec for **validation, filtering and explanation**.
- Use plain `Predicate` or entity methods when names and explanations aren't needed.

## Knowledge check

```quiz
? What's a key advantage of Specification over an inline boolean expression?
+ Rules become named, reusable, testable objects that can be composed and can explain results
- It runs faster
- It removes the need for tests
> Composition, naming and reuse are the point.

? Which JDK type already supports and/or/negate composition?
+ java.util.function.Predicate
- java.util.Optional
- java.lang.Runnable
> Predicate has default and, or and negate methods.

? Which situation least needs Specification?
- A configurable discount engine with dozens of combinable conditions
+ A single check `age >= 18` used in one place
- Eligibility rules that must be explained to users
> One simple condition in one place is clearer as a plain method.
```

## Exercise

Build a **room search** for meeting rooms with fields `capacity`, `hasProjector`, `floor` and `isBooked`. Create specs `MinCapacity(n)`, `HasProjector`, `OnFloor(f)` and `Available`, and compose: "available AND capacity ≥ 6 AND (has projector OR on floor 3)". Filter a list of rooms with it and print the explanation for one rejected room.

````hint title="Hint"
You can reuse the `Spec` interface from the lesson: `Spec.named("capacity >= 6", r -> r.capacity() >= 6)`.
````

````solution title="Reference solution"
```java file="RoomSpecDemo.java"
import java.util.List;
import java.util.function.Predicate;

public class RoomSpecDemo {
    public static void main(String[] args) {
        Rule<Room> query = available().and(minCapacity(6)).and(hasProjector().or(onFloor(3)));

        List<Room> rooms = List.of(
                new Room("Everest", 10, true, 2, false),
                new Room("K2", 8, false, 3, false),
                new Room("Nilgiri", 4, true, 3, false),
                new Room("Kanchenjunga", 12, true, 5, true));

        System.out.println(rooms.stream().filter(query::test).map(Room::name).toList());   // [Everest, K2]
        System.out.println("Nilgiri rejected because: " + query.explain(rooms.get(2)));
    }

    static Rule<Room> available() { return Rule.of("available", r -> !r.booked()); }
    static Rule<Room> minCapacity(int n) { return Rule.of("capacity >= " + n, r -> r.capacity() >= n); }
    static Rule<Room> hasProjector() { return Rule.of("has projector", Room::projector); }
    static Rule<Room> onFloor(int f) { return Rule.of("on floor " + f, r -> r.floor() == f); }
}

record Room(String name, int capacity, boolean projector, int floor, boolean booked) {}

/** A compact specification: a predicate plus a description tree. */
record Rule<T>(Predicate<T> predicate, java.util.function.Function<T, String> explainer) {
    static <T> Rule<T> of(String name, Predicate<T> p) {
        return new Rule<>(p, t -> (p.test(t) ? "yes: " : "NO: ") + name);
    }
    boolean test(T t) { return predicate.test(t); }
    String explain(T t) { return explainer.apply(t); }
    Rule<T> and(Rule<T> o) { return new Rule<>(predicate.and(o.predicate), t -> "(" + explain(t) + " AND " + o.explain(t) + ")"); }
    Rule<T> or(Rule<T> o) { return new Rule<>(predicate.or(o.predicate), t -> "(" + explain(t) + " OR " + o.explain(t) + ")"); }
}
```
````
