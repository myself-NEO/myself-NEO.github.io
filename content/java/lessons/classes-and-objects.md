## Concept explanation

### What it is

A **class** is a blueprint: it declares what data its instances hold (**fields**) and what they can do (**methods**). An **object** is one instance of a class, created at run time with `new`, with its own copy of the instance fields.

Every object has three properties:

| Property | Meaning | In Java |
|---|---|---|
| **State** | the data it holds right now | the values of its fields |
| **Behaviour** | what it can do | its methods |
| **Identity** | which object it is, independent of its state | its reference; `==` compares identity |

Two `BankAccount` objects with the same owner and balance are still two different accounts: equal state, different identity.

### Why it exists

Procedural code passes data structures to functions that operate on them, and any function can modify any field. As programs grow, nobody can say which code is allowed to change a balance or what values are legal. A class **puts the data and the rules that protect it in one place**: the only way to change a `BankAccount`'s balance is through `deposit` and `withdraw`, which enforce the rules. That's the foundation for every other OOP idea in this stage.

### Anatomy of a class

```java
public class BankAccount {                       // class declaration
    private final String owner;                  // fields (state)
    private long balanceCents;

    public BankAccount(String owner) {           // constructor: creates a valid object
        this.owner = owner;
    }

    public void deposit(long cents) {            // methods (behaviour)
        if (cents <= 0) throw new IllegalArgumentException("deposit must be positive");
        balanceCents += cents;
    }

    public long balanceCents() { return balanceCents; }
}
```

```java
BankAccount alice = new BankAccount("Alice");    // create an object, keep a reference
alice.deposit(5_000);                             // send it a message
```

### When to use it

Create a class when you have **data plus rules** that belong together (an `Order` and its line items, a `Money` amount and its currency), or a **role** with behaviour (`PaymentGateway`, `RateLimiter`). If you only need to carry a few values with no rules, a **record** (Java 16) is usually a better fit; if you only have stateless functions, a static utility method may be enough.

## Internal working

What `new BankAccount("Alice")` does, step by step:

1. **Class loading.** If `BankAccount` hasn't been used yet, the JVM loads, links and initialises it (once).
2. **Allocation.** The JVM computes the instance size (object header + fields, padded to 8 bytes) and allocates it on the heap. HotSpot usually does this with a pointer bump inside the thread's **TLAB** (thread-local allocation buffer) — a handful of instructions.
3. **Zeroing.** All fields are set to default values (`0`, `null`, `false`), and the header is written (mark word + pointer to the class metadata).
4. **Constructor.** The `<init>` method runs: the superclass constructor first (`Object()`), then field initialisers, then the constructor body.
5. **Reference returned.** `new` evaluates to a reference, stored in `alice`.

In bytecode this is `new BankAccount` → `dup` → `ldc "Alice"` → `invokespecial BankAccount.<init>` → `astore_1`.

**Method calls** such as `alice.deposit(5_000)` compile to `invokevirtual`: the receiver (`alice`) is passed as a hidden first argument, which the method sees as `this`. Methods are **not** copied into each object; there is one copy per class, in metaspace, shared by all instances. Only fields are per object.

An object lives as long as it is **reachable** from a GC root (a local variable of a running method, a static field, …). When the last reference disappears, the garbage collector can reclaim it — there's no `delete`.

## Visual representation

```text title="One class, two objects"
  Metaspace (class metadata, one copy)        Heap (one block per object)
  +-------------------------------+           +-------------------------------+
  | class BankAccount             |<----------| header (mark word | klass ptr) |
  |   fields: owner, balanceCents |   klass   | owner        -> "Alice"        |
  |   methods: deposit(),         |   pointer | balanceCents  = 5000           |
  |            balanceCents()     |           +-------------------------------+
  +-------------------------------+           +-------------------------------+
                ^------------------------------| header                         |
                                               | owner        -> "Bob"          |
  Stack (main)                                 | balanceCents  = 0              |
   alice ---> first object                     +-------------------------------+
   bob   ---> second object
```

## Java code example

```java title="ClassesDemo.java" file="ClassesDemo.java"
public class ClassesDemo {
    public static void main(String[] args) {
        BankAccount alice = new BankAccount("Alice");
        BankAccount bob = new BankAccount("Bob");

        alice.deposit(5_000);
        alice.withdraw(1_250);
        bob.deposit(300);

        System.out.println(alice);
        System.out.println(bob);

        // Identity versus state
        BankAccount aliceAgain = alice;                 // same object, second reference
        BankAccount twin = new BankAccount("Alice");
        twin.deposit(3_750);
        System.out.println("alice == aliceAgain: " + (alice == aliceAgain));
        System.out.println("alice == twin (same state): " + (alice == twin));

        // Rules are enforced by the object itself
        try {
            bob.withdraw(1_000);
        } catch (IllegalStateException e) {
            System.out.println("rejected: " + e.getMessage());
        }
        System.out.println("accounts opened: " + BankAccount.opened());
    }
}

class BankAccount {
    private static int opened;                  // shared by the class, not per object

    private final String owner;
    private long balanceCents;

    BankAccount(String owner) {
        if (owner == null || owner.isBlank()) {
            throw new IllegalArgumentException("owner required");
        }
        this.owner = owner;
        opened++;
    }

    void deposit(long cents) {
        if (cents <= 0) {
            throw new IllegalArgumentException("deposit must be positive");
        }
        balanceCents += cents;
    }

    void withdraw(long cents) {
        if (cents > balanceCents) {
            throw new IllegalStateException(owner + " has only " + format(balanceCents));
        }
        balanceCents -= cents;
    }

    static int opened() {
        return opened;
    }

    private static String format(long cents) {
        return String.format("%d.%02d", cents / 100, cents % 100);
    }

    @Override
    public String toString() {
        return owner + ": " + format(balanceCents);
    }
}
```

## Output

```text title="Output" output="ClassesDemo.java"
Alice: 37.50
Bob: 3.00
alice == aliceAgain: true
alice == twin (same state): false
rejected: Bob has only 3.00
accounts opened: 3
```

- Each object keeps its own `balanceCents`; the static `opened` counter is shared and reached `3`.
- `alice` and `aliceAgain` are two references to one object. `twin` has the same state but is a different object, so `==` is `false`.
- The `withdraw` rule lives inside the class; callers can't put an account into an invalid state.

## Real-world application

- **Domain models** in services are classes: `Order`, `Invoice`, `Shipment`, each guarding its own rules (an order can't be shipped before it's paid).
- **Framework-managed objects**: Spring "beans" are ordinary objects the container creates once and wires together; JPA entities are objects mapped to database rows.
- **Value-like data** (DTOs, API payloads, events) is usually modelled as records instead of hand-written classes.
- In LLD interviews, the first step is identifying the **classes and their responsibilities** — see [entities and responsibilities](#system-design/lld/learn/entities-and-responsibilities) in the System Design track.

## Common mistakes

- **Public mutable fields** (`account.balance = -100`): the class can no longer protect its rules.
- **"Anemic" classes**: only getters and setters, with all the logic in some `Service` class that manipulates them.
- **God classes** that know everything (`Manager`, `Utils` with 3,000 lines).
- **Confusing the class with the object**: calling instance methods from a `static` method without an instance (`non-static method cannot be referenced from a static context`).
- **Comparing objects with `==`** when you mean "same state" (override `equals`; see [equals and hashCode](lesson:equals-and-hashcode)).
- **Thinking each object carries its own copy of the methods**: only fields are per object.

## Interview questions

**Q1. What is the difference between a class and an object?**

````reveal title="Answer"
A class is a compile-time definition — a type with fields, methods and constructors, loaded once into the JVM. An object is a run-time instance of that class, allocated on the heap with its own copy of the instance fields. One class can have any number of objects; all of them share the class's methods and static fields.
````

**Q2. What happens in memory when you write `new Car()`?**

````reveal title="Answer"
The class is loaded and initialised if necessary; the JVM allocates heap memory for the object (in HotSpot, usually a TLAB pointer bump), zeroes the fields and writes the object header; then the constructor chain runs (superclass constructors first, then field initialisers and the constructor body); finally the expression yields a reference to the new object.
````

**Q3. What are state, behaviour and identity?**

````reveal title="Answer"
State is the current values of an object's fields; behaviour is the set of methods it supports; identity is what distinguishes it from every other object even when the state is equal — in Java, its reference. `==` tests identity, `equals` (if overridden) tests state.
````

**Q4. Where are methods stored — in each object?**

````reveal title="Answer"
No. Method code exists once per class (bytecode and metadata in metaspace, JIT-compiled code in the code cache). An instance method receives the object as the implicit `this` parameter. Only instance fields are stored per object.
````

## Hands-on exercise

Model a `ParkingMeter`:

- It is created with a `ratePerHourCents` (must be positive).
- `insertCoins(long cents)` adds paid time; `minutesRemaining()` reports it.
- `tick(int minutes)` consumes time but never goes below zero.
- Keep the fields private and print the meter with a meaningful `toString`.

Create two meters with different rates and show that they keep independent state.

````hint title="Hint"
Store the remaining time in seconds or minutes as a field. Converting cents to minutes is `cents * 60 / ratePerHourCents`. Validate arguments in the constructor and in `insertCoins`.
````

````solution title="Solution"
```java title="ParkingMeterDemo.java" file="ParkingMeterDemo.java"
public class ParkingMeterDemo {
    public static void main(String[] args) {
        ParkingMeter downtown = new ParkingMeter(400);   // 4.00 per hour
        ParkingMeter suburb = new ParkingMeter(100);     // 1.00 per hour
        downtown.insertCoins(200);
        suburb.insertCoins(200);
        System.out.println(downtown);
        System.out.println(suburb);
        downtown.tick(45);
        suburb.tick(45);
        System.out.println(downtown);
        System.out.println(suburb);
    }
}

class ParkingMeter {
    private final long ratePerHourCents;
    private long minutesRemaining;

    ParkingMeter(long ratePerHourCents) {
        if (ratePerHourCents <= 0) {
            throw new IllegalArgumentException("rate must be positive");
        }
        this.ratePerHourCents = ratePerHourCents;
    }

    void insertCoins(long cents) {
        if (cents <= 0) {
            throw new IllegalArgumentException("insert a positive amount");
        }
        minutesRemaining += cents * 60 / ratePerHourCents;
    }

    void tick(int minutes) {
        minutesRemaining = Math.max(0, minutesRemaining - minutes);
    }

    long minutesRemaining() {
        return minutesRemaining;
    }

    @Override
    public String toString() {
        return "meter@" + ratePerHourCents + "c/h: " + minutesRemaining + " min left";
    }
}
```

```text title="Output" output="ParkingMeterDemo.java"
meter@400c/h: 30 min left
meter@100c/h: 120 min left
meter@400c/h: 0 min left
meter@100c/h: 75 min left
```
````

## Knowledge check

```quiz
? Which of these is stored separately in every object?
- The bytecode of instance methods
+ The values of instance fields
- Static fields
> Methods and statics exist once per class; instance fields are per object.

? Two distinct objects have identical field values. What does `a == b` return?
- true
+ false
> == compares identity (references), not state.

? What does `new` return?
+ A reference to the newly created object
- A copy of the object
- The object's hash code
> The variable stores a reference; the object lives on the heap.

? When can the garbage collector reclaim an object?
- When its method returns
+ When it is no longer reachable from any GC root
- When delete is called
> Java has no delete; reachability decides.
```

## Key takeaways

- A **class** declares state (fields) and behaviour (methods); an **object** is a run-time instance with its own fields.
- Objects have **state, behaviour and identity**; `==` compares identity.
- `new` loads the class if needed, **allocates and zeroes** memory, runs the **constructor chain**, and returns a **reference**.
- Methods exist **once per class**; `this` is passed implicitly.
- Classes exist to keep **data and the rules that protect it together**.
