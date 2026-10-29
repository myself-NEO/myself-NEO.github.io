## The problem

Some things should exist **exactly once** in a process: a configuration snapshot, a connection pool, an ID generator, a metrics registry. If every caller creates its own, you get inconsistent state or wasted resources. **Singleton** ensures a class has **one instance** and provides **global access** to it.

## When to use it — and when not

**Reasonable uses:**

- Truly process-wide, stateless or immutable resources: a default `Clock`, an immutable configuration loaded at startup.
- Infrastructure where a framework manages lifecycle (Spring beans are singletons *by scope*, injected via DI).

**Avoid when:**

- The "only one" requirement is an assumption ("there's only one parking lot") rather than a hard constraint. Tomorrow there are two.
- The object holds **mutable state** that tests need to reset.
- You use it to avoid passing dependencies around. That's a global variable with extra ceremony.

> [!WARNING] Singleton in LLD interviews
> Making `ParkingLot`, `LibraryManager` or `Game` a singleton is a **common red flag**. It hides dependencies, prevents multiple instances (multiple lots, parallel tests) and complicates concurrency. Prefer creating one instance in `main` and passing it in. If an interviewer asks, explain the trade-off.

## Core idea

1. A **private constructor**, so no one else can instantiate.
2. A **static** holder of the single instance.
3. A **static accessor** (`getInstance()`), or an `enum`.

## UML

```uml title="Singleton"
class IdGenerator
  - INSTANCE: IdGenerator
  - counter: AtomicLong
  - IdGenerator()
  + getInstance(): IdGenerator
  + next(): long
IdGenerator --> IdGenerator : holds the only instance
```

## Java implementations

```java title="Three thread-safe singletons" file="SingletonDemo.java"
import java.util.concurrent.atomic.AtomicLong;

public class SingletonDemo {
    public static void main(String[] args) {
        System.out.println(EagerIdGenerator.getInstance().next());
        System.out.println(EagerIdGenerator.getInstance().next());          // same instance -> 2
        System.out.println(LazyRegistry.getInstance() == LazyRegistry.getInstance());
        System.out.println(AppClock.INSTANCE.nowMillis() > 0);
    }
}

/** 1. Eager: created when the class is initialised. Simple and thread-safe. */
final class EagerIdGenerator {
    private static final EagerIdGenerator INSTANCE = new EagerIdGenerator();
    private final AtomicLong counter = new AtomicLong();

    private EagerIdGenerator() {}

    static EagerIdGenerator getInstance() { return INSTANCE; }

    long next() { return counter.incrementAndGet(); }
}

/** 2. Lazy holder idiom: created on first use; the JVM's class-init lock makes it thread-safe. */
final class LazyRegistry {
    private LazyRegistry() { System.out.println("LazyRegistry created"); }

    private static final class Holder {
        static final LazyRegistry INSTANCE = new LazyRegistry();
    }

    static LazyRegistry getInstance() { return Holder.INSTANCE; }
}

/** 3. Enum singleton: serialization- and reflection-safe (Effective Java's recommendation). */
enum AppClock {
    INSTANCE;
    long nowMillis() { return System.currentTimeMillis(); }
}
```

The classic **double-checked locking** version (`volatile` field plus a `synchronized` block) also works in modern Java, but it's easy to get wrong. The holder idiom and the enum are simpler.

```java title="❌ Broken lazy singleton (race condition)"
static Config getInstance() {
    if (instance == null) {          // two threads can both see null...
        instance = new Config();     // ...and both create an instance
    }
    return instance;
}
```

## The DI alternative (usually better)

You can have "exactly one instance" without the Singleton pattern: **create one in the composition root and inject it everywhere.**

```java
public static void main(String[] args) {
    IdGenerator ids = new SequentialIdGenerator();          // one instance, by convention
    TicketService tickets = new TicketService(ids);
    InvoiceService invoices = new InvoiceService(ids);
}
```

You get the single instance *and* visible dependencies, swappable implementations, and fresh instances per test.

## Realistic use case

A logging framework's `LoggerRegistry` (like SLF4J's `LoggerFactory`) is effectively a singleton. Every class asks it for a logger by name, and it caches one logger per name. That's acceptable because logging is a cross-cutting, process-wide concern, and the registry is safe to share. See [Logging Framework](problem:logging-framework).

## Trade-offs and alternatives

| | Singleton | Injected single instance |
|---|---|---|
| Guarantees one instance | Yes (per class loader) | By convention |
| Dependencies visible | No (hidden static access) | Yes (constructor) |
| Swap for tests | Hard | Trivial |
| Multiple instances later | Requires redesign | Just create another |

## Recognising it in an interview

The prompt says "the system has one X". Pause. Is that a **hard constraint** (one JVM-wide registry) or just the **current scope** (one parking lot)? For domain objects it's almost always the latter: use a normal class and create one instance.

## Common mistakes

- Singleton domain objects (`ParkingLot.getInstance()`).
- Non-thread-safe lazy initialisation.
- Mutable singleton state that leaks between tests.
- Forgetting that serialization or reflection can create second instances (the enum version avoids both).

## Key takeaways

- Singleton = private constructor + one static instance + static access.
- Use the **holder idiom** or an **enum** for thread-safe lazy creation.
- Prefer **one instance injected via DI** for anything in your domain.
- Singleton is a frequent overengineering signal in LLD interviews — justify it or avoid it.

## Knowledge check

```quiz
? Why is `ParkingLot.getInstance()` usually a poor choice in an LLD interview?
- Singletons can't have methods
+ It hides dependencies, blocks multiple lots and test isolation, and "one lot" is a scope assumption, not a constraint
- It makes the code too short
> Creating one instance and passing it explicitly gives the same result without the downsides.

? Which lazy singleton implementation is thread-safe without explicit locking?
- Check `if (instance == null)` then create
+ The static nested Holder class idiom
- A non-final public static field
> The JVM guarantees class initialisation happens once, under a lock.

? What does Effective Java recommend for a serialization-safe singleton?
+ A single-element enum
- A class with a public constructor
- A static method that always returns a new instance
> Enum singletons are protected against reflection and serialization producing extra instances.
```

## Exercise

Refactor this code so `OrderService` and `ShipmentService` share a single `IdGenerator` without using a static singleton, and show how a test could use a predictable generator.

```java
class IdGenerator {
    private static final IdGenerator INSTANCE = new IdGenerator();
    private long next = 1;
    static IdGenerator get() { return INSTANCE; }
    synchronized long next() { return next++; }
}
class OrderService { long create() { return IdGenerator.get().next(); } }
class ShipmentService { long create() { return IdGenerator.get().next(); } }
```

````hint title="Hint"
Extract an interface, inject it through constructors, and create one instance in `main`.
````

````solution title="Reference solution"
```java file="SharedIdsDemo.java"
import java.util.concurrent.atomic.AtomicLong;

public class SharedIdsDemo {
    public static void main(String[] args) {
        IdGenerator ids = new SequentialIds();                 // the one shared instance
        OrderService orders = new OrderService(ids);
        ShipmentService shipments = new ShipmentService(ids);
        System.out.println(orders.create() + ", " + shipments.create() + ", " + orders.create());   // 1, 2, 3

        IdGenerator fixed = () -> 42;                         // test double
        System.out.println(new OrderService(fixed).create()); // 42
    }
}

interface IdGenerator { long next(); }

class SequentialIds implements IdGenerator {
    private final AtomicLong counter = new AtomicLong();
    public long next() { return counter.incrementAndGet(); }
}

class OrderService {
    private final IdGenerator ids;
    OrderService(IdGenerator ids) { this.ids = ids; }
    long create() { return ids.next(); }
}

class ShipmentService {
    private final IdGenerator ids;
    ShipmentService(IdGenerator ids) { this.ids = ids; }
    long create() { return ids.next(); }
}
```
````
