## The question

Both inheritance and composition let one class reuse another's behaviour:

- **Inheritance (is-a):** `class Car extends Vehicle` — `Car` *is* a `Vehicle` and inherits its code.
- **Composition (has-a):** `class Car { private final Engine engine; }` — `Car` *has* an `Engine` and delegates to it.

The classic guideline, from *Design Patterns* (1994) and *Effective Java*, is **"favour composition over inheritance."** This lesson shows why, and when inheritance is still the right tool.

## Problem 1 — the fragile base class

Inheritance couples a subclass to the *implementation details* of its parent, not just its public contract. Here is the classic demonstration: we want a set that counts how many elements were ever added.

```java title="Looks right, is wrong" file="FragileBaseDemo.java"
import java.util.HashSet;
import java.util.List;

public class FragileBaseDemo {
    public static void main(String[] args) {
        CountingSet<String> set = new CountingSet<>();
        set.addAll(List.of("a", "b", "c"));
        System.out.println("Expected 3, got " + set.getAddCount());
    }
}

class CountingSet<E> extends HashSet<E> {
    private int addCount = 0;

    @Override public boolean add(E e) {
        addCount++;
        return super.add(e);
    }

    @Override public boolean addAll(java.util.Collection<? extends E> c) {
        addCount += c.size();
        return super.addAll(c);   // HashSet.addAll calls add() internally -> double counting!
    }

    int getAddCount() { return addCount; }
}
```

It prints **6**, not 3: `HashSet.addAll` happens to call `add` for each element, so every element is counted twice. Our subclass depended on an undocumented detail of the parent. If a future JDK changed that detail, the bug would appear or disappear without any change to our code. That is the **fragile base class problem**.

## The composition fix: wrap and forward

```java title="Composition: depend only on the public contract" file="CountingSetDemo.java"
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class CountingSetDemo {
    public static void main(String[] args) {
        CountingSet<String> set = new CountingSet<>(new HashSet<>());
        set.addAll(List.of("a", "b", "c"));
        System.out.println("Count: " + set.addCount() + ", contains b? " + set.contains("b"));
    }
}

class CountingSet<E> {
    private final Set<E> delegate;   // has-a
    private int addCount = 0;

    CountingSet(Set<E> delegate) { this.delegate = delegate; }

    boolean add(E e) {
        addCount++;
        return delegate.add(e);
    }

    boolean addAll(java.util.Collection<? extends E> c) {
        boolean changed = false;
        for (E e : c) changed |= add(e);   // we control exactly what is counted
        return changed;
    }

    boolean contains(Object o) { return delegate.contains(o); }
    int addCount() { return addCount; }
}
```

Now `CountingSet` depends only on the `Set` *interface*. It works with `HashSet`, `TreeSet` or any other implementation, chosen at construction time. (A full version would implement `Set<E>` and forward every method — that's the [Decorator](lesson:decorator) pattern.)

## Problem 2 — the subclass explosion

Suppose ducks can fly or not and quack or squeak. With inheritance you get `FlyingQuackingDuck`, `FlyingSqueakingDuck`, `NonFlyingQuackingDuck`… The number of classes is the *product* of the variations. Add a third behaviour and it multiplies again.

With composition, each behaviour is an independent component:

```java title="Behaviours as components" file="DuckDemo.java"
public class DuckDemo {
    public static void main(String[] args) {
        Duck mallard = new Duck("Mallard", new Wings(), new Quack());
        Duck rubber = new Duck("Rubber duck", new NoFlight(), new Squeak());
        mallard.perform();
        rubber.perform();

        rubber.setFlight(new RocketPack());   // behaviour can even change at runtime
        rubber.perform();
    }
}

interface FlightBehaviour { String fly(); }
interface SoundBehaviour { String sound(); }

class Wings implements FlightBehaviour { public String fly() { return "flaps wings"; } }
class NoFlight implements FlightBehaviour { public String fly() { return "can't fly"; } }
class RocketPack implements FlightBehaviour { public String fly() { return "zooms on a rocket"; } }
class Quack implements SoundBehaviour { public String sound() { return "Quack"; } }
class Squeak implements SoundBehaviour { public String sound() { return "Squeak"; } }

class Duck {
    private final String name;
    private FlightBehaviour flight;
    private final SoundBehaviour sound;

    Duck(String name, FlightBehaviour flight, SoundBehaviour sound) {
        this.name = name;
        this.flight = flight;
        this.sound = sound;
    }

    void setFlight(FlightBehaviour flight) { this.flight = flight; }

    void perform() { System.out.println(name + ": " + sound.sound() + ", " + flight.fly()); }
}
```

Two flight options × two sounds needs **four small classes**, not four duck subclasses. Add a third flight option and you add one class, not two. This is exactly the [Strategy pattern](lesson:strategy).

```uml title="Composition with behaviour interfaces"
class Duck
  - flight: FlightBehaviour
  - sound: SoundBehaviour
  + perform(): void
interface FlightBehaviour
  + fly(): String
interface SoundBehaviour
  + sound(): String
class Wings
class NoFlight
class Quack
Duck --> FlightBehaviour
Duck --> SoundBehaviour
Wings ..|> FlightBehaviour
NoFlight ..|> FlightBehaviour
Quack ..|> SoundBehaviour
```

## When inheritance *is* right

Inheritance is appropriate when **all** of these hold:

1. **True is-a.** The subclass is a genuine specialisation and satisfies the parent's contract everywhere ([Liskov Substitution](lesson:liskov-substitution)).
2. **You control both classes**, or the parent is explicitly designed and documented for extension (for example, an abstract class with clear hooks — see [Template Method](lesson:template-method)).
3. **The hierarchy is shallow and stable.** One or two levels, not five.
4. **The variation is along one axis.** If behaviour varies along two or more independent axes, composition wins.

Good examples: `abstract class Piece` → `Knight`, `Bishop` in chess (fixed set, true is-a, one axis); framework base classes designed for extension; exception hierarchies.

> [!TIP] A quick test
> Ask "is-a *and* always substitutable?" If you hesitate, or the honest answer is "has-a" or "behaves-like", use composition.

## Real-world example

An HR system modelled `Manager extends Employee` and `Contractor extends Employee`. Then a contractor became a manager. The hierarchy could not express it without a `ContractorManager` class, and promotions required *changing an object's class*, which Java can't do. Modelling role and employment type as components (`Employee` has an `EmploymentType` and a set of `Role`s) made promotions a field update.

## Common mistakes

- **Inheriting for code reuse** when there is no real is-a relationship (`Stack extends ArrayList`, `Car extends Engine`).
- **Deep hierarchies** (`Vehicle → MotorVehicle → Car → ElectricCar → TeslaModel3`). Each level adds coupling.
- **Modelling roles as subclasses.** Roles change over time; classes don't. Use composition.
- **Overriding to disable behaviour** (`throw new UnsupportedOperationException()`). This is usually an LSP violation telling you the hierarchy is wrong.

## In the interview

> [!INTERVIEW] What to say
> When you introduce a hierarchy, justify it: *"`Car` and `Truck` are genuinely vehicles with the same contract, and the set is small, so a sealed hierarchy is fine. Pricing varies independently, so I'll compose a `PricingStrategy` instead of making `HourlyCar` and `DailyCar` subclasses."*

## Key takeaways

- Inheritance couples you to the parent's **implementation**; composition couples you only to an **interface**.
- Inheritance with several varying behaviours leads to a **class explosion**; composition grows additively.
- Composition allows behaviour to be chosen — or changed — **at runtime**.
- Use inheritance for **true, stable, single-axis is-a** relationships you control.

## Knowledge check

```quiz
? Why did CountingSet extends HashSet report 6 instead of 3?
- HashSet stores duplicates
+ HashSet.addAll internally calls add(), so each element was counted in both overridden methods
- The list contained duplicates
> The subclass depended on an internal implementation detail of HashSet: the fragile base class problem.

? Notifications vary by channel (email, SMS) and by urgency handling (immediate, batched). Which design scales best?
- Four subclasses: ImmediateEmail, BatchedEmail, ImmediateSms, BatchedSms
+ A Notification that composes a Channel and a DeliveryPolicy
- A single class with a switch for each combination
> Two independent axes of variation call for composition; subclasses would multiply.

? Which is a reasonable use of inheritance?
- `class Stack<E> extends ArrayList<E>`
- `class AdminUser extends User` where users can be promoted to admin at runtime
+ `abstract class ChessPiece` with `Knight`, `Rook` and so on as subclasses
> Chess pieces are a fixed, stable set with a true is-a relationship along one axis.
```

## Exercise

A parking system has `Vehicle` subclasses for `Car`, `Bike` and `Truck`. The business now wants three pricing schemes (hourly, flat daily, weekend special) and two membership levels (regular, premium with 20% off). A teammate proposes 3 × 3 × 2 = 18 subclasses. Propose a composition-based design and sketch the Java types.

````hint title="Hint"
Which concepts vary independently? Each independent axis can become an interface with a few small implementations.
````

````solution title="Sample design"
Three independent axes: **vehicle type**, **pricing scheme**, **membership**. Keep vehicle type as a small enum (or sealed hierarchy) and compose the rest:

```java file="PricingCompositionDemo.java"
import java.time.Duration;

public class PricingCompositionDemo {
    public static void main(String[] args) {
        FeeCalculator calc = new FeeCalculator(new HourlyPricing(), new PremiumMembership());
        System.out.println(calc.fee(VehicleType.CAR, Duration.ofMinutes(150)));    // 3 hours * 40 * 0.8 = 96
        System.out.println(calc.fee(VehicleType.TRUCK, Duration.ofMinutes(60)));   // 1 hour * 100 * 0.8 = 80
    }
}

enum VehicleType {
    BIKE(10), CAR(40), TRUCK(100);
    final long hourlyRate;
    VehicleType(long hourlyRate) { this.hourlyRate = hourlyRate; }
}

interface PricingScheme { long baseFee(VehicleType type, Duration parked); }

class HourlyPricing implements PricingScheme {
    public long baseFee(VehicleType type, Duration parked) {
        long hours = Math.max(1, (parked.toMinutes() + 59) / 60);   // round up, minimum 1 hour
        return hours * type.hourlyRate;
    }
}

class FlatDailyPricing implements PricingScheme {
    public long baseFee(VehicleType type, Duration parked) {
        long days = Math.max(1, (parked.toHours() + 23) / 24);
        return days * type.hourlyRate * 8;
    }
}

interface Membership { long applyDiscount(long fee); }

class RegularMembership implements Membership { public long applyDiscount(long fee) { return fee; } }

class PremiumMembership implements Membership { public long applyDiscount(long fee) { return fee * 80 / 100; } }

class FeeCalculator {
    private final PricingScheme scheme;
    private final Membership membership;

    FeeCalculator(PricingScheme scheme, Membership membership) {
        this.scheme = scheme;
        this.membership = membership;
    }

    long fee(VehicleType type, Duration parked) {
        return membership.applyDiscount(scheme.baseFee(type, parked));
    }
}
```

Total types: 1 enum + 3 schemes + 2 memberships, and every new option adds exactly one class.
````
