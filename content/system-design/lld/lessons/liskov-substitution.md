## The principle

> **Objects of a subtype must be usable anywhere their supertype is expected, without breaking the program's correctness.**

Barbara Liskov's principle is about **behavioural contracts**, not just method signatures. The compiler checks that `Square extends Rectangle` has the right methods. It can't check that a `Square` *behaves* like a `Rectangle` everywhere a `Rectangle` is used. That's on you.

A subtype must:

- **Not strengthen preconditions** — it must accept everything the parent accepts.
- **Not weaken postconditions** — it must guarantee everything the parent guarantees.
- **Preserve invariants** — the parent's always-true rules stay true.
- **Not throw new kinds of exceptions** that callers of the parent wouldn't expect.

## Analogy

You rent a car. The contract says "a car: you can drive it, refuel it, and it seats four". The agency gives you a "car" that seats two and runs only on a special fuel sold at one station. It's technically a car, but your plans — four friends, normal petrol stations — break. The substitute violated the contract.

## The problematic version: Square / Rectangle

```java title="❌ A square is a rectangle… mathematically" file="LspViolationDemo.java"
public class LspViolationDemo {
    public static void main(String[] args) {
        Rectangle r = new Square();
        resizeAndCheck(r);   // works for Rectangle, fails for Square
    }

    /** Written against Rectangle's contract: width and height are independent. */
    static void resizeAndCheck(Rectangle r) {
        r.setWidth(5);
        r.setHeight(4);
        int area = r.area();
        System.out.println(area == 20 ? "OK: area 20" : "BROKEN: expected 20, got " + area);
    }
}

class Rectangle {
    protected int width, height;
    void setWidth(int w) { width = w; }
    void setHeight(int h) { height = h; }
    int area() { return width * height; }
}

class Square extends Rectangle {
    @Override void setWidth(int w) { width = w; height = w; }    // keeps the square "square"...
    @Override void setHeight(int h) { width = h; height = h; }   // ...but breaks Rectangle's contract
}
```

`Rectangle`'s implicit contract is *"setting the height doesn't change the width"*. `Square` violates it, so code written correctly against `Rectangle` breaks when given a `Square`.

## The improved version

The fix is to **stop pretending** a mutable square is a mutable rectangle. Model what they genuinely share:

```java title="✅ Share only the true contract" file="LspFixedDemo.java"
import java.util.List;

public class LspFixedDemo {
    public static void main(String[] args) {
        List<Shape> shapes = List.of(new Rectangle(5, 4), new Square(3));
        shapes.forEach(s -> System.out.println(s + " area=" + s.area()));

        Rectangle wider = new Rectangle(5, 4).withWidth(8);   // immutable "changes"
        System.out.println(wider);
    }
}

interface Shape {
    int area();   // the only promise both make
}

record Rectangle(int width, int height) implements Shape {
    Rectangle {
        if (width <= 0 || height <= 0) throw new IllegalArgumentException("sides must be positive");
    }
    public int area() { return width * height; }
    Rectangle withWidth(int w) { return new Rectangle(w, height); }
}

record Square(int side) implements Shape {
    Square {
        if (side <= 0) throw new IllegalArgumentException("side must be positive");
    }
    public int area() { return side * side; }
}
```

Both are `Shape`s with an honest contract (`area()`), and neither promises behaviour the other can't keep. [Immutability](lesson:immutability) helps too: many LSP problems come from setters that subtypes can't honour.

## LSP violations you'll meet in LLD problems

**1. Refusing to implement an inherited method**

```java
class Bird { void fly() { ... } }
class Penguin extends Bird {
    @Override void fly() { throw new UnsupportedOperationException(); }   // BAD: surprise exception
}
```

Fix: don't put `fly()` on `Bird`. Use capability interfaces (`Flyer`) — see [Interface Segregation](lesson:interface-segregation).

**2. Strengthened preconditions**

```java
interface PaymentMethod { void pay(long amount); }               // any positive amount
class GiftCard implements PaymentMethod {
    public void pay(long amount) {
        if (amount > 5_000) throw new IllegalArgumentException();  // BAD: new restriction callers don't know about
    }
}
```

Fix: make the limit part of the contract for all methods (for example `boolean canPay(long amount)`), or model gift cards so the checkout asks about limits first.

**3. Weakened postconditions**

```java
interface Repository<T> { List<T> findAll(); }   // contract: never null
class CachedRepository<T> implements Repository<T> {
    public List<T> findAll() { return cacheReady ? cache : null; }  // BAD: callers crash
}
```

**4. Read-only subtype of a mutable type**

`class ReadOnlyAccount extends Account` overriding `withdraw` to throw. If read-only accounts exist, the hierarchy should be `Account` (read operations) → `TransactionalAccount` (adds `withdraw`), not the other way round.

## Why it works

When subtypes keep their parent's promises, callers can rely on **one contract** and stay ignorant of concrete types. Violations force callers to add `instanceof` checks — which re-creates the type switches that [OCP](lesson:open-closed) and polymorphism were meant to remove.

## A practical LSP test

For each subtype, ask:

1. Can I pass it to **every** method that takes the parent, without that method needing to know?
2. Does it **accept all inputs** the parent accepts?
3. Does it **guarantee everything** the parent guarantees, including return values, side effects and exceptions?
4. Would a **test suite written for the parent** pass unchanged against the subtype? (A useful technique: write contract tests as an abstract test class and run them for every implementation.)

## Real-world example

A team added `ReadOnlyFileStorage implements Storage` for audit snapshots. `Storage.write()` threw `UnsupportedOperationException` in the read-only version. A background cleanup job, written against `Storage`, crashed nightly when it hit an audit snapshot. Splitting the interface into `ReadableStorage` and `WritableStorage` made the job's dependency explicit: it requires `WritableStorage`, and the compiler rejected the read-only store.

## Common mistakes

- Modelling hierarchies from **real-world taxonomy** ("a square is a rectangle") rather than **behavioural contracts**.
- Using `UnsupportedOperationException` as a design tool in your own domain types.
- Subclasses that ignore calls (`void fly() {}` — a silent no-op is also a violation if callers rely on the effect).
- Overriding `equals` in a subclass in a way that breaks symmetry with the parent.

## Interview questions

> [!INTERVIEW] Likely questions
> - *"Explain LSP with an example."* → Square/Rectangle or Penguin/Bird, then the fix.
> - *"`ElectricCar extends Car` but can't `refuel()`. What do you do?"* → "That's an LSP smell. Fuel is a capability: `Car` has an `EnergySource` (composition), or there are `Refuelable` and `Rechargeable` interfaces."
> - *"How do you detect LSP violations in a codebase?"* → "`instanceof` checks before calling methods, `UnsupportedOperationException` overrides, and subclasses whose tests differ from the parent's."

## Key takeaways

- LSP is about **behavioural compatibility**: subtypes keep the parent's promises.
- Don't strengthen preconditions, weaken postconditions, break invariants or add surprise exceptions.
- Fix violations by **reshaping the hierarchy**: smaller interfaces, composition, or immutable types.
- `instanceof` checks and `UnsupportedOperationException` are warning signs.

## Knowledge check

```quiz
? `Penguin extends Bird` overrides `fly()` to throw UnsupportedOperationException. What's the best fix?
- Catch the exception wherever fly() is called
+ Move flying into a separate capability (such as a Flyer interface) that only flying birds implement
- Make fly() return a boolean indicating failure
> The parent promised something not all subtypes can do; move that promise to a narrower type.

? A subclass rejects inputs that the parent accepts. Which LSP rule does it break?
+ It strengthens preconditions
- It weakens preconditions
- It strengthens postconditions
> Subtypes must accept at least everything the parent accepts.

? Which is a good signal that a hierarchy violates LSP?
- Subclasses override abstract methods
+ Callers need instanceof checks before calling certain methods
- The parent class is abstract
> Type checks before calls mean the subtypes aren't truly substitutable.
```

## Exercise

A file-storage library has:

```java
interface Storage {
    byte[] read(String path);
    void write(String path, byte[] data);
    void delete(String path);
}
class S3Storage implements Storage { ... }
class HttpReadOnlyStorage implements Storage {
    public void write(String p, byte[] d) { throw new UnsupportedOperationException(); }
    public void delete(String p) { throw new UnsupportedOperationException(); }
    ...
}
```

Redesign the types so the read-only store is substitutable everywhere it's accepted, and show the signatures of a `BackupJob` (reads and writes) and a `ThumbnailViewer` (reads only).

````hint title="Hint"
Which clients need which operations? Give each client the narrowest type it needs.
````

````solution title="Sample answer"
```java
interface ReadableStorage { byte[] read(String path); }
interface WritableStorage extends ReadableStorage {
    void write(String path, byte[] data);
    void delete(String path);
}

class S3Storage implements WritableStorage { /* all operations */ }
class HttpReadOnlyStorage implements ReadableStorage { /* read only - no lies */ }

class BackupJob {
    BackupJob(ReadableStorage source, WritableStorage target) { /* ... */ }
}
class ThumbnailViewer {
    ThumbnailViewer(ReadableStorage storage) { /* ... */ }   // accepts both kinds
}
```

Every implementation keeps every promise of the types it implements, and the compiler stops anyone passing a read-only store where writing is needed. This is also [Interface Segregation](lesson:interface-segregation) at work.
````
