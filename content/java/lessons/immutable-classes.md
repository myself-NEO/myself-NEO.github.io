## Concept explanation

### What it is

An **immutable object** can't change state after construction. `String`, `Integer`, `BigDecimal`, `LocalDate`, `UUID`, `Path` and `List.of(...)` results are all immutable. "Changing" one returns a **new** object: `date.plusDays(1)`, `amount.add(fee)`.

### The rules (from *Effective Java*)

1. **Don't provide mutators** (no setters, no methods that change fields).
2. **Prevent subclassing**: make the class `final` (or the constructor private with static factories) — otherwise a subclass can add mutable state or override methods to lie.
3. **Make all fields `private final`.**
4. **Ensure exclusive access to mutable components**:
   - copy mutable arguments **in** the constructor (*defensive copy*), **before** validating them;
   - never return a reference to an internal mutable object — return a copy or an unmodifiable view, or store an immutable copy in the first place (`List.copyOf`).
5. **Don't let `this` escape** during construction.

### Why it exists

| Benefit | Because |
|---|---|
| **Thread safety** | nothing to synchronise: no thread can ever change the object |
| **Safe sharing and caching** | instances can be reused freely (`Integer.valueOf`, `BigDecimal.ZERO`) |
| **Reliable map keys / set elements** | the hash can't change after insertion |
| **Simpler reasoning** | an object is valid once, forever — no defensive copies at call sites |
| **Failure atomicity** | an operation either returns a new valid object or throws; nothing is half-modified |

The cost is allocation: every change creates an object. For long chains of changes, use a mutable companion (`StringBuilder` for `String`, a builder for complex values) and build the immutable result at the end.

### Records: immutability with less code

A **record** (Java 16) is a final class with `private final` fields, a canonical constructor, accessors, `equals`, `hashCode` and `toString`. It is **shallowly** immutable: a record holding a `List` is only immutable if you store an unmodifiable copy in a **compact constructor**:

```java
record Team(String name, List<String> members) {
    Team {                                    // compact canonical constructor
        Objects.requireNonNull(name);
        members = List.copyOf(members);       // defensive, unmodifiable copy
    }
}
```

### When to use it

By default for **value types**: money, quantities, identifiers, coordinates, date ranges, configuration snapshots, events, DTOs and messages crossing threads. Mutable classes remain right for entities with a lifecycle (an `Order` moving through states) and for performance-critical buffers — but even then, keep their mutable state encapsulated.

## Internal working

- **`final` fields and the JMM:** once the constructor completes, any thread that obtains a reference to the object sees the final fields' values (and everything reachable through them as of that moment), **even if the reference was published without synchronisation** — as long as `this` didn't escape during construction. That's the formal reason immutable objects are thread-safe.
- **`List.copyOf` / `Map.copyOf` / `Set.copyOf`** (Java 10) return unmodifiable collections that also **reject nulls**, and return the argument itself if it's already an immutable collection — so repeated defensive copying is cheap.
- **Unmodifiable view vs immutable copy:** `Collections.unmodifiableList(list)` is a *view*: if someone still holds `list` and modifies it, the view changes. `List.copyOf(list)` is a snapshot.
- **Copy before validate:** if you validate an argument and then copy it, another thread could modify it between the check and the copy (a time-of-check/time-of-use race). Copy first, validate the copy.
- **Caching:** immutable classes can cache derived values (`String` caches its hash) and offer interned instances through static factories.
- **JIT**: immutable value objects that don't escape a method are good candidates for escape analysis and scalar replacement, softening the allocation cost.

## Visual representation

```text title="Leaky vs truly immutable"
  caller                       LeakyPeriod                  ImmutablePeriod
  Date start ---------------> start (same Date object)      start = new Date(copy)
  start.setTime(...)  ------> start CHANGED                  unaffected
  p.start().setTime(...)  --> start CHANGED                  returns a copy -> unaffected

  Collections.unmodifiableList(list)       List.copyOf(list)
     view ---> original list                  snapshot (independent)
     original.add(x) -> view shows x          original.add(x) -> snapshot unchanged
```

## Java code example

```java title="ImmutabilityDemo.java" file="ImmutabilityDemo.java"
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Objects;

public class ImmutabilityDemo {
    public static void main(String[] args) {
        // 1. A "final" class that still leaks mutable state
        Date start = new Date(0);
        LeakyPeriod leaky = new LeakyPeriod(start, new Date(86_400_000L));
        start.setTime(172_800_000L);                         // caller changes its Date afterwards
        System.out.println("leaky start after caller's change: " + leaky.start().getTime() + ", valid? " + leaky.isValid());

        // 2. Defensive copies in and out
        Date s2 = new Date(0);
        Period period = new Period(s2, new Date(86_400_000L));
        s2.setTime(172_800_000L);
        period.start().setTime(999L);                        // modifies only the returned copy
        System.out.println("immutable start: " + period.start().getTime() + ", valid? " + period.isValid());

        // 3. View vs copy
        List<String> source = new ArrayList<>(List.of("a"));
        List<String> view = Collections.unmodifiableList(source);
        List<String> snapshot = List.copyOf(source);
        source.add("b");
        System.out.println("view = " + view + ", snapshot = " + snapshot);

        // 4. "Modification" returns new objects
        Money price = Money.of(1_999, "EUR");
        Money withTax = price.plusPercent(20);
        System.out.println(price + " -> " + withTax + ", same object? " + (price == withTax));

        // 5. Record with a compact constructor
        List<String> members = new ArrayList<>(List.of("Ada", "Linus"));
        Team team = new Team("core", members);
        members.add("Mallory");
        System.out.println("team members: " + team.members());
        try {
            team.members().add("Eve");
        } catch (UnsupportedOperationException e) {
            System.out.println("record list is unmodifiable");
        }
    }
}

final class LeakyPeriod {
    private final Date start;                                // final reference to a MUTABLE object
    private final Date end;

    LeakyPeriod(Date start, Date end) {
        if (start.after(end)) {
            throw new IllegalArgumentException("start after end");
        }
        this.start = start;                                  // no copy: caller still controls it
        this.end = end;
    }

    Date start() {
        return start;                                        // leaks the internal object
    }

    boolean isValid() {
        return !start.after(end);
    }
}

final class Period {
    private final Date start;
    private final Date end;

    Period(Date start, Date end) {
        this.start = new Date(start.getTime());              // copy FIRST...
        this.end = new Date(end.getTime());
        if (this.start.after(this.end)) {                    // ...then validate the copies
            throw new IllegalArgumentException("start after end");
        }
    }

    Date start() {
        return new Date(start.getTime());                    // copy out
    }

    boolean isValid() {
        return !start.after(end);
    }
}

final class Money {
    private final long cents;
    private final String currency;

    private Money(long cents, String currency) {
        this.cents = cents;
        this.currency = Objects.requireNonNull(currency);
    }

    static Money of(long cents, String currency) {
        return new Money(cents, currency);
    }

    Money plusPercent(int pct) {
        return new Money(cents + cents * pct / 100, currency);   // new object; this stays the same
    }

    @Override
    public String toString() {
        return String.format("%d.%02d %s", cents / 100, cents % 100, currency);
    }
}

record Team(String name, List<String> members) {
    Team {
        Objects.requireNonNull(name);
        members = List.copyOf(members);                      // shallow-immutable record made deep
    }
}
```

## Output

```text title="Output" output="ImmutabilityDemo.java"
leaky start after caller's change: 172800000, valid? false
immutable start: 0, valid? true
view = [a, b], snapshot = [a]
19.99 EUR -> 23.98 EUR, same object? false
team members: [Ada, Linus]
record list is unmodifiable
```

- `LeakyPeriod` is `final` with `final` fields, yet the caller broke its invariant after construction (start is now after end). `final` fields don't make referenced objects immutable.
- `Period` copied in and out: the caller's changes and changes to returned copies don't reach it.
- The unmodifiable **view** reflected the later `add`; the **copy** didn't.
- `plusPercent` returned a new `Money`; the original is unchanged.
- The record's compact constructor made its list both independent and unmodifiable.

## Real-world application

- **`java.time`** replaced the mutable `Date`/`Calendar`: immutable types ended a whole class of bugs where shared dates were modified.
- **Concurrency**: passing immutable messages between threads (actors, queues, events in Kafka consumers) needs no locking.
- **Configuration snapshots**: a service builds an immutable config object at startup or on reload and swaps the reference atomically (`AtomicReference<Config>`).
- **Value objects in domain models** (`Money`, `Email`, `OrderId`) and **cache keys** are immutable by design.
- **Functional-style code** (streams, `Collectors.toUnmodifiableList`) assumes elements aren't mutated mid-pipeline.

## Common mistakes

- **Equating `final` with immutable.**
- **Forgetting defensive copies** of `Date`, arrays, lists, maps passed in or returned.
- **Validating before copying** (TOCTOU race).
- **Using `Collections.unmodifiableList(field)` on a list someone else still holds.**
- **Non-final immutable classes** that can be subclassed into mutable ones.
- **Records with mutable components** and no compact constructor copy.
- **Arrays in immutable classes** returned directly (`return values;`) — arrays can't be made read-only; copy them or use a `List`.

## Interview questions

**Q1. How do you create an immutable class in Java?**

````reveal title="Answer"
Make the class `final` (or use a private constructor with factories); make all fields `private final`; provide no mutators; validate in the constructor; defensively copy mutable inputs (before validating) and never expose mutable internals (return copies or store unmodifiable copies such as `List.copyOf`); don't let `this` escape during construction. For simple value carriers, use a record with a compact constructor that copies mutable components.
````

**Q2. Is a class with only `final` fields immutable?**

````reveal title="Answer"
Not necessarily. `final` prevents reassigning the field, but if a field refers to a mutable object (`List`, `Date`, array) that's shared with callers, its contents can change. The class must also own its mutable components exclusively (defensive copies, unmodifiable copies) and be non-extensible.
````

**Q3. Why are immutable objects thread-safe?**

````reveal title="Answer"
Data races require a write; immutable objects are never written after construction. In addition, the Java Memory Model guarantees that `final` fields set in a constructor are visible to all threads once construction completes (if `this` didn't escape), even when the reference is shared without synchronisation. So threads can share them freely.
````

**Q4. What's the difference between `Collections.unmodifiableList` and `List.copyOf`?**

````reveal title="Answer"
`unmodifiableList` returns a read-only **view** of the original list; changes made through the original are visible through the view. `List.copyOf` returns an unmodifiable **copy** (snapshot) that's independent of the source, rejects null elements, and is returned as-is if the input is already an immutable list.
````

## Hands-on exercise

Make this class truly immutable without changing how callers construct it or read from it:

```java
public class Schedule {
    private String owner;
    private List<LocalDate> holidays;
    private int[] workHours;          // e.g. {9, 17}
    public Schedule(String owner, List<LocalDate> holidays, int[] workHours) {
        this.owner = owner; this.holidays = holidays; this.workHours = workHours;
    }
    public String getOwner() { return owner; }
    public List<LocalDate> getHolidays() { return holidays; }
    public int[] getWorkHours() { return workHours; }
    public void setOwner(String owner) { this.owner = owner; }
}
```

Replace `setOwner` with a `withOwner(String)` that returns a new `Schedule`.

````hint title="Hint"
`LocalDate` is immutable, so `List.copyOf(holidays)` is a sufficient deep copy. Arrays must be cloned on the way in **and** out. Make the class final and the fields `private final`.
````

````solution title="Solution"
```java title="ScheduleDemo.java" file="ScheduleDemo.java"
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class ScheduleDemo {
    public static void main(String[] args) {
        List<LocalDate> holidays = new ArrayList<>(List.of(LocalDate.of(2026, 12, 25)));
        int[] hours = {9, 17};
        Schedule s = new Schedule("ops", holidays, hours);
        holidays.add(LocalDate.of(2026, 1, 1));            // caller changes its inputs...
        hours[0] = 6;
        s.getWorkHours()[1] = 23;                          // ...and the returned array
        Schedule renamed = s.withOwner("sre");
        System.out.println(s);
        System.out.println(renamed);
    }
}

final class Schedule {
    private final String owner;
    private final List<LocalDate> holidays;
    private final int[] workHours;

    Schedule(String owner, List<LocalDate> holidays, int[] workHours) {
        int[] hoursCopy = workHours.clone();                // copy first
        if (hoursCopy.length != 2 || hoursCopy[0] >= hoursCopy[1]) {
            throw new IllegalArgumentException("work hours must be {start, end}");
        }
        this.owner = owner;
        this.holidays = List.copyOf(holidays);              // LocalDate is immutable
        this.workHours = hoursCopy;
    }

    String getOwner() {
        return owner;
    }

    List<LocalDate> getHolidays() {
        return holidays;                                    // unmodifiable already
    }

    int[] getWorkHours() {
        return workHours.clone();                           // arrays must be copied out
    }

    Schedule withOwner(String newOwner) {
        return new Schedule(newOwner, holidays, workHours);
    }

    @Override
    public String toString() {
        return owner + " " + holidays + " " + Arrays.toString(workHours);
    }
}
```

```text title="Output" output="ScheduleDemo.java"
ops [2026-12-25] [9, 17]
sre [2026-12-25] [9, 17]
```
````

## Knowledge check

```quiz
? Why should an immutable class be final?
+ So subclasses can't add mutable state or override methods to change observed behaviour
- final classes are faster
- Records require it
> A mutable subclass could be passed wherever the immutable type is expected.

? In which order should a constructor handle a mutable argument?
+ Copy it, then validate the copy
- Validate it, then copy it
- Validate it, no copy needed
> Validating first leaves a window for another thread to change the argument.

? `List<String> v = Collections.unmodifiableList(src); src.add("x");` — does v contain "x"?
+ Yes, it's a view
- No, it's a copy
> unmodifiableList wraps the original.

? A record has a `List<String>` component and no compact constructor. Is it immutable?
- Yes, records are always deeply immutable
+ Only shallowly: the list it was given can still change
> Copy mutable components in a compact constructor.

? What does `LocalDate.plusDays(1)` do?
+ Returns a new LocalDate; the original is unchanged
- Changes the date in place
> java.time types are immutable.
```

## Key takeaways

- Immutable = **no mutators, final class, private final fields, exclusive ownership of mutable parts**.
- **Copy mutable inputs first, then validate**; never return internal mutable objects.
- `final` fields give a **JMM visibility guarantee**, making immutables thread-safe without locks.
- **`List.copyOf`** (snapshot) ≠ **`Collections.unmodifiableList`** (view).
- **Records** are shallowly immutable; make them deep with a compact constructor.
