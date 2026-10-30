## Concept explanation

### What it is

Objects collaborate through **relationships**. UML and interviews distinguish three "has-a" kinds plus the "is-a" of inheritance:

| Relationship | Meaning | Lifetime | Java shape | Example |
|---|---|---|---|---|
| **Association** | "uses / knows about" | independent | a field or parameter referring to another object | a `Doctor` treats `Patient`s |
| **Aggregation** | "has, but doesn't own" (whole–part, shared) | the part can outlive the whole | a field holding objects created elsewhere and passed in | a `Team` has `Player`s, who exist without the team |
| **Composition** | "owns" (strong whole–part) | the part's life is bound to the whole | the whole creates the part and never exposes it for others to keep | an `Order` owns its `OrderLine`s; a `House` its `Room`s |
| **Inheritance** | "is a kind of" | same object | `extends` | a `SavingsAccount` is an `Account` |

Java has no keywords for these: they're **design intent**, expressed through who creates the object, who holds references to it, and whether it's exposed.

### Composition vs inheritance

"**Favour composition over inheritance**" (Gang of Four, *Effective Java*) means: to reuse behaviour, **hold an instance and delegate to it** rather than extending a class.

| | Inheritance | Composition + delegation |
|---|---|---|
| Coupling | to the parent's **implementation** (fragile base class) | only to the collaborator's **public API** |
| Flexibility | fixed at compile time; one parent | swap collaborators at run time; many collaborators |
| API exposure | inherits **every** public method (wanted or not) | exposes only what you choose |
| Testability | hard to isolate from the parent | inject a fake collaborator |
| Best for | true *is-a* with a class designed for extension | reuse, varying behaviour, wrappers (decorators) |

### Why it exists

Inheritance is the strongest coupling in Java. Composition keeps classes small and focused, lets behaviour vary at run time (the **Strategy** pattern), and lets you wrap behaviour around an object (the **Decorator** pattern) without touching it.

### When to use which

- Use **inheritance** when the subclass is substitutable everywhere the parent is used, and the parent was designed to be extended.
- Use **composition** for everything else — especially "has-a", "uses-a", and "behaves-like-this-sometimes".
- Interfaces + composition give most of inheritance's benefits (polymorphism) with none of its coupling.

## Internal working

- **References are the mechanism**: every relationship is a field holding a reference. Composition vs aggregation differs in **who else holds references** — which also decides garbage collection: a composed part becomes unreachable together with its owner; an aggregated part stays alive while anyone else references it.
- **Delegation cost**: a forwarding method (`return engine.start();`) is tiny and the JIT inlines it, so composition has no meaningful run-time overhead compared with inheritance.
- **Defensive copying** enforces composition: if an `Order` returns its internal `List<OrderLine>` directly, outsiders can keep and modify parts, quietly turning composition into aggregation.
- **Interfaces at the seams**: holding the collaborator as an interface type (`PricingPolicy`) rather than a concrete class is what makes run-time swapping and test fakes possible.

## Visual representation

```text title="UML notation and the Java behind it"
  Doctor  -------->  Patient           association: Doctor has a reference (or parameter)
  Team    <>------>  Player            aggregation: Team holds players created elsewhere
  Order   <*>----->  OrderLine         composition: Order creates/owns lines; they die with it
  Savings ----|>     Account           inheritance

  Composition + strategy (behaviour chosen at run time):

     +--------------------+        +-----------------------+
     | Checkout           |------->| <<interface>>         |
     |  - pricing: Pricing|        | PricingPolicy         |
     |  + total(cart)     |        |  price(Cart): Money   |
     +--------------------+        +-----------------------+
                                       ^             ^
                             RegularPricing    BlackFridayPricing
```

## Java code example

```java title="CompositionDemo.java" file="CompositionDemo.java"
import java.util.ArrayList;
import java.util.List;

public class CompositionDemo {
    public static void main(String[] args) {
        // Composition: the Order creates and owns its lines
        Order order = new Order("ORD-1");
        order.addLine("keyboard", 2, 4_500);
        order.addLine("mouse", 1, 1_999);
        System.out.println(order + " total=" + order.totalCents());
        try {
            order.lines().clear();                          // callers get a read-only view
        } catch (UnsupportedOperationException e) {
            System.out.println("lines can't be modified from outside the Order");
        }

        // Aggregation: players exist independently of any team
        Player ada = new Player("Ada");
        Team red = new Team("Red");
        Team blue = new Team("Blue");
        red.add(ada);
        blue.add(ada);                                       // the same player in two teams
        System.out.println(red + ", " + blue);

        // Composition + strategy: behaviour swapped at run time, no subclassing
        Checkout checkout = new Checkout(new RegularPricing());
        System.out.println("regular:      " + checkout.total(order));
        checkout.setPricing(new PercentOffPricing(25));
        System.out.println("25% campaign: " + checkout.total(order));

        // Decorator: wrap behaviour around an object without touching it
        PricingPolicy logged = new LoggingPricing(new PercentOffPricing(10));
        System.out.println("10% (logged): " + new Checkout(logged).total(order));
    }
}

final class Order {
    private final String id;
    private final List<OrderLine> lines = new ArrayList<>();   // owned parts

    Order(String id) {
        this.id = id;
    }

    void addLine(String sku, int qty, long unitCents) {
        lines.add(new OrderLine(sku, qty, unitCents));         // the whole creates the part
    }

    List<OrderLine> lines() {
        return List.copyOf(lines);                             // never hand out the internal list
    }

    long totalCents() {
        long total = 0;
        for (OrderLine line : lines) {
            total += line.subtotal();
        }
        return total;
    }

    @Override
    public String toString() {
        return id + lines;
    }
}

record OrderLine(String sku, int qty, long unitCents) {
    long subtotal() {
        return qty * unitCents;
    }
}

record Player(String name) {
}

final class Team {
    private final String name;
    private final List<Player> players = new ArrayList<>();   // shared parts, created elsewhere

    Team(String name) {
        this.name = name;
    }

    void add(Player p) {
        players.add(p);
    }

    @Override
    public String toString() {
        return name + players;
    }
}

interface PricingPolicy {
    long price(Order order);
}

final class RegularPricing implements PricingPolicy {
    @Override
    public long price(Order order) {
        return order.totalCents();
    }
}

final class PercentOffPricing implements PricingPolicy {
    private final int pct;

    PercentOffPricing(int pct) {
        this.pct = pct;
    }

    @Override
    public long price(Order order) {
        return order.totalCents() * (100 - pct) / 100;
    }
}

final class LoggingPricing implements PricingPolicy {
    private final PricingPolicy inner;                        // wraps another policy

    LoggingPricing(PricingPolicy inner) {
        this.inner = inner;
    }

    @Override
    public long price(Order order) {
        long result = inner.price(order);                     // delegate
        System.out.println("  [log] priced " + order.lines().size() + " lines -> " + result);
        return result;
    }
}

final class Checkout {
    private PricingPolicy pricing;                            // has-a, not is-a

    Checkout(PricingPolicy pricing) {
        this.pricing = pricing;
    }

    void setPricing(PricingPolicy pricing) {
        this.pricing = pricing;
    }

    long total(Order order) {
        return pricing.price(order);
    }
}
```

## Output

```text title="Output" output="CompositionDemo.java"
ORD-1[OrderLine[sku=keyboard, qty=2, unitCents=4500], OrderLine[sku=mouse, qty=1, unitCents=1999]] total=10999
lines can't be modified from outside the Order
Red[Player[name=Ada]], Blue[Player[name=Ada]]
regular:      10999
25% campaign: 8249
  [log] priced 2 lines -> 9899
10% (logged): 9899
```

- `Order` creates its `OrderLine`s and only exposes copies: a composition the outside world can't break.
- The same `Player` belongs to two teams: aggregation (shared, independent lifetime).
- `Checkout` changed pricing behaviour at run time by swapping its collaborator — no subclass of `Checkout` was needed.
- `LoggingPricing` added logging around another policy without modifying it (a decorator).

## Real-world application

- **Services are composed**, not inherited: an `OrderService` holds an `OrderRepository`, a `PaymentGateway` and an `EventPublisher`, all injected as interfaces.
- **The JDK's I/O streams** are decorators: `new BufferedReader(new InputStreamReader(socket.getInputStream(), UTF_8))` composes buffering and decoding around a raw stream.
- **Collections wrappers**: `Collections.unmodifiableList(list)` and `synchronizedList(list)` wrap rather than subclass.
- **LLD interviews** expect you to label relationships correctly in class diagrams and justify composition — see [object relationships](#system-design/lld/learn/object-relationships) in the System Design track.

## Common mistakes

- **Inheriting to reuse a few methods** (`class Cart extends ArrayList<Item>`) — exposes `clear`, `set`, `removeIf` … that bypass your rules.
- **Leaking owned parts** (`return lines;`), turning composition into accidental aggregation.
- **Composing concrete classes** (`new StripeGateway()` inside a service) instead of depending on an interface — you lose swapping and testability.
- **Over-composing**: a dozen tiny one-method collaborators for a simple class.
- **Confusing aggregation and composition** in interviews: the question is ownership and lifetime, not "is it a collection".

## Interview questions

**Q1. What is the difference between aggregation and composition?**

````reveal title="Answer"
Both are "has-a" (whole–part). In **composition** the whole owns the part: it creates it, doesn't share it, and the part's lifetime ends with the whole (an `Order` and its `OrderLine`s). In **aggregation** the part exists independently and may be shared (a `Team` and its `Player`s). In Java the difference shows in who creates the part, whether references to it escape, and therefore when it becomes unreachable.
````

**Q2. Why "favour composition over inheritance"?**

````reveal title="Answer"
Inheritance couples the subclass to the superclass's implementation (fragile base class), fixes the relationship at compile time, allows only one parent, and inherits the entire public API. Composition depends only on a collaborator's public interface, can be changed at run time (strategy), can combine many collaborators, exposes only what you choose, and is easy to test with fakes. Inheritance remains right for genuine, substitutable *is-a* relationships with classes designed for extension.
````

**Q3. How would you add logging to every call of a third-party class you can't modify?**

````reveal title="Answer"
Wrap it: define (or use) an interface for the operations, implement a decorator that holds the original and forwards each call with logging around it, and inject the decorator. If there's no interface, write an adapter that exposes your own interface. For many interfaces at once, a dynamic proxy or AOP framework automates the wrapper.
````

**Q4. Is `class Stack extends Vector` good design?**

````reveal title="Answer"
No — it's the JDK's own cautionary tale. A stack is not a vector: inheriting exposes `add(index, e)`, `remove(index)` and `get(index)`, which let callers violate LIFO behaviour. Composition (a stack class holding a list and exposing only `push`/`pop`/`peek`) or `ArrayDeque` is the right design.
````

## Hands-on exercise

`class Car extends Engine` exists in a codebase "so cars can `start()`". Electric cars now need a different engine and some cars swap engines at the garage.

Redesign with composition:

- `interface Engine { String start(); int horsepower(); }` with `PetrolEngine` and `ElectricMotor`.
- `Car` **has** an `Engine`, delegates `start()`, and supports `replaceEngine(Engine)`.
- `Car` owns its `Wheel`s (composition) — created in the constructor, never exposed mutably.

````hint title="Hint"
Hold `private Engine engine;` and `private final List<Wheel> wheels;` built inside the constructor. `start()` returns something like `model + ": " + engine.start()`.
````

````solution title="Solution"
```java title="CarDemo.java" file="CarDemo.java"
import java.util.ArrayList;
import java.util.List;

public class CarDemo {
    public static void main(String[] args) {
        Car car = new Car("Roadster", new PetrolEngine(180));
        System.out.println(car.start() + " | " + car.horsepower() + " hp | wheels " + car.wheelCount());
        car.replaceEngine(new ElectricMotor(300));
        System.out.println(car.start() + " | " + car.horsepower() + " hp");
    }
}

interface Engine {
    String start();

    int horsepower();
}

record PetrolEngine(int horsepower) implements Engine {
    @Override
    public String start() {
        return "vroom";
    }
}

record ElectricMotor(int horsepower) implements Engine {
    @Override
    public String start() {
        return "hmmm (silent)";
    }
}

record Wheel(int position) {
}

final class Car {
    private final String model;
    private final List<Wheel> wheels = new ArrayList<>();   // composition: created and owned here
    private Engine engine;                                   // aggregation-like: replaceable part

    Car(String model, Engine engine) {
        this.model = model;
        this.engine = engine;
        for (int i = 1; i <= 4; i++) {
            wheels.add(new Wheel(i));
        }
    }

    String start() {
        return model + ": " + engine.start();                // delegation
    }

    int horsepower() {
        return engine.horsepower();
    }

    void replaceEngine(Engine newEngine) {
        this.engine = newEngine;
    }

    int wheelCount() {
        return wheels.size();
    }
}
```

```text title="Output" output="CarDemo.java"
Roadster: vroom | 180 hp | wheels 4
Roadster: hmmm (silent) | 300 hp
```
````

## Knowledge check

```quiz
? A `Library` holds `Book` objects that are also referenced by a `Catalogue`. Which relationship is Library–Book?
- Composition
+ Aggregation
- Inheritance
> The books are shared and exist independently of the library object.

? What's the main risk of `class Cart extends ArrayList<Item>`?
+ Callers get every List method and can bypass the cart's rules
- ArrayList is final
- Carts can't be serialised
> Inheritance exposes the whole parent API.

? Which pattern swaps behaviour at run time by composing a collaborator?
+ Strategy
- Singleton
- Template method
> Strategy holds an interface-typed collaborator that can be replaced.

? How do you keep a composition from turning into aggregation?
+ Don't let references to the owned parts escape (return copies or read-only views)
- Mark the parts final
- Use inheritance instead
> If outsiders keep references to parts, they are no longer exclusively owned.
```

## Key takeaways

- **Association** = uses; **aggregation** = has, shared, independent lifetime; **composition** = owns, same lifetime; **inheritance** = is-a.
- In Java, relationships are references; ownership is enforced by **who creates parts and whether references escape**.
- **Favour composition + interfaces** for reuse and variation (strategy, decorator); reserve inheritance for true, designed-for *is-a*.
- Delegation is cheap; coupling to a parent's implementation is expensive.
