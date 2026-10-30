## Concept explanation

### What it is

**Inheritance** lets a class (the **subclass**) be defined as an extension of another (the **superclass**) with `extends`. The subclass **inherits** the superclass's accessible fields and methods, can **add** new ones, and can **override** instance methods to specialise behaviour.

```java
class Vehicle {
    protected final String plate;
    Vehicle(String plate) { this.plate = plate; }
    int wheels() { return 4; }
}

class Motorcycle extends Vehicle {
    Motorcycle(String plate) { super(plate); }   // must call a superclass constructor
    @Override int wheels() { return 2; }          // specialise
}
```

Every class has exactly **one** direct superclass (`Object` if you don't write `extends`): Java has **single inheritance of classes** (and multiple inheritance of interface types).

### What is and isn't inherited

| Member | Inherited? |
|---|---|
| `public` / `protected` fields and methods | yes |
| package-private members | only if the subclass is in the same package |
| `private` fields and methods | **no** — they exist inside the object, but subclass code can't access them |
| constructors | **no** — each class declares its own and calls `super(...)` |
| static members | accessible through the subclass, but **hidden**, not overridden |
| initialiser blocks | no (they're part of the superclass's construction) |

### `super`

- `super(args)` — call a superclass constructor (first statement of a constructor).
- `super.method()` — call the superclass's version of an overridden method.
- `super.field` — reach a superclass field hidden by a subclass field (a sign of a design problem).

### Why it exists

Inheritance models a genuine **is-a** relationship and lets the subclass **reuse** the superclass's code and be **used wherever the superclass is expected** (substitutability, see [polymorphism](lesson:polymorphism-and-overriding)).

### When to use it — and when not to

Use it when the subclass **is truly a specialised kind** of the superclass, honours all its promises (Liskov substitution), and the superclass was **designed for extension** (documented hooks, protected constructors, final methods where needed).

Don't use it just to reuse code. A subclass is tightly coupled to its superclass's implementation details — the **fragile base class problem**: a harmless-looking change in the parent (say, `addAll` starting to call `add`) breaks subclasses that override one of them. Prefer **composition** (hold an instance and delegate) for reuse — see [composition vs inheritance](lesson:composition-and-relationships).

## Internal working

- **Object layout:** a subclass instance contains **all** fields of every superclass, including private ones, laid out superclass-first; the subclass just can't name the private ones. That's why a `Motorcycle` object is at least as big as a `Vehicle`.
- **Construction:** `new Motorcycle(...)` allocates the whole object once, then runs `<init>` methods top-down: `Object` → `Vehicle` → `Motorcycle`, each running its field initialisers after its `super(...)` call returns.
- **Method lookup:** each class has a **virtual method table** (vtable) in HotSpot: a slot per overridable method, filled with the most specific implementation. The subclass's vtable starts as a copy of the parent's, with overridden slots replaced. `invokevirtual` uses the object's actual class to pick the slot.
- **Fields are not virtual:** a field access is resolved at compile time from the **declared type** of the reference. A subclass field with the same name **hides** the parent field; `((Vehicle) moto).plate` and `moto.plate` can be different variables.
- **`super.method()`** compiles to `invokespecial`, which bypasses virtual dispatch and calls the parent's exact implementation.

## Visual representation

```text title="Hierarchy, object layout and the constructor chain"
        Object
          ^
          |  extends
        Vehicle  (plate, wheels())
          ^
          |  extends
      Motorcycle (sidecar, wheels() overridden)

  new Motorcycle("KA-01", true)               one object on the heap:
     Object.<init>()        runs 1st          +-----------------------------+
     Vehicle.<init>(plate)  runs 2nd          | header                      |
     Motorcycle.<init>(...) runs 3rd          | Vehicle.plate   = "KA-01"   |
                                              | Motorcycle.sidecar = true   |
                                              +-----------------------------+
  vtable(Motorcycle): wheels -> Motorcycle.wheels, toString -> Vehicle.toString, ...
```

## Java code example

```java title="InheritanceDemo.java" file="InheritanceDemo.java"
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;

public class InheritanceDemo {
    public static void main(String[] args) {
        Vehicle car = new Vehicle("KA-01-1234");
        Motorcycle bike = new Motorcycle("KA-05-9999", true);
        System.out.println(car.describe());
        System.out.println(bike.describe());

        Vehicle asVehicle = bike;                          // a Motorcycle IS-A Vehicle
        System.out.println("through a Vehicle reference: wheels = " + asVehicle.wheels());
        System.out.println("field hiding: bike.label = " + bike.label + ", ((Vehicle) bike).label = " + ((Vehicle) bike).label);

        // The fragile base class problem
        InstrumentedHashSet<String> counted = new InstrumentedHashSet<>();
        counted.addAll(List.of("a", "b", "c"));
        System.out.println("InstrumentedHashSet counted " + counted.addCount() + " adds for 3 elements");

        CountingSet<String> composed = new CountingSet<>();
        composed.addAll(List.of("a", "b", "c"));
        System.out.println("CountingSet (composition) counted " + composed.addCount());
    }
}

class Vehicle {
    protected final String plate;
    String label = "vehicle";                          // hidden by Motorcycle.label (avoid this!)
    private int serviceCount;                          // exists in every Motorcycle, but private to Vehicle

    Vehicle(String plate) {
        this.plate = plate;
        System.out.println("  Vehicle constructor for " + plate);
    }

    int wheels() {
        return 4;
    }

    String describe() {
        serviceCount++;
        return getClass().getSimpleName() + " " + plate + " has " + wheels() + " wheels (described " + serviceCount + "x)";
    }
}

class Motorcycle extends Vehicle {
    private final boolean sidecar;
    String label = "motorcycle";

    Motorcycle(String plate, boolean sidecar) {
        super(plate);                                  // first: initialise the Vehicle part
        this.sidecar = sidecar;
        System.out.println("  Motorcycle constructor, sidecar=" + sidecar);
    }

    @Override
    int wheels() {
        return sidecar ? 3 : 2;
    }

    @Override
    String describe() {
        return super.describe() + (sidecar ? " [sidecar]" : "");   // extend, don't duplicate
    }
}

/** Inheritance for reuse: depends on HashSet's self-use of add() inside addAll(). */
class InstrumentedHashSet<E> extends HashSet<E> {
    private int addCount;

    @Override
    public boolean add(E e) {
        addCount++;
        return super.add(e);
    }

    @Override
    public boolean addAll(Collection<? extends E> c) {
        addCount += c.size();
        return super.addAll(c);                        // HashSet.addAll calls add() for each element...
    }

    int addCount() {
        return addCount;
    }
}

/** Composition: wraps a set and forwards; immune to the wrapped class's internals. */
class CountingSet<E> {
    private final HashSet<E> inner = new HashSet<>();
    private int addCount;

    boolean add(E e) {
        addCount++;
        return inner.add(e);
    }

    boolean addAll(Collection<? extends E> c) {
        addCount += c.size();
        return inner.addAll(new ArrayList<>(c));
    }

    int addCount() {
        return addCount;
    }
}
```

## Output

```text title="Output" output="InheritanceDemo.java"
  Vehicle constructor for KA-01-1234
  Vehicle constructor for KA-05-9999
  Motorcycle constructor, sidecar=true
Vehicle KA-01-1234 has 4 wheels (described 1x)
Motorcycle KA-05-9999 has 3 wheels (described 1x) [sidecar]
through a Vehicle reference: wheels = 3
field hiding: bike.label = motorcycle, ((Vehicle) bike).label = vehicle
InstrumentedHashSet counted 6 adds for 3 elements
CountingSet (composition) counted 3
```

- Constructing a `Motorcycle` ran `Vehicle`'s constructor first.
- `Vehicle.describe()` called `wheels()`, which dispatched to `Motorcycle.wheels()` — overriding works even from code in the superclass.
- The private `serviceCount` lives inside the motorcycle object and is updated by inherited code, though `Motorcycle` can't touch it.
- Fields don't override: the cast changed which `label` was read.
- `InstrumentedHashSet` double-counted because `HashSet.addAll` (inherited from `AbstractCollection`) calls `add` — an implementation detail the subclass silently depended on. The composed version is immune.

## Real-world application

- **Framework base classes designed for extension**: `HttpServlet` (`doGet`/`doPost`), `Thread` (historically), `TimerTask`, JUnit/Spring abstract test classes.
- **Exception hierarchies** are the healthiest common use of inheritance: `IOException` → `FileNotFoundException`, and your own `OrderException` → `PaymentDeclinedException` (see [custom exceptions](lesson:custom-exceptions)).
- **Domain models**: JPA supports entity inheritance (`@Inheritance`), but most teams keep it shallow and favour composition and enums.
- The **InstrumentedHashSet** example is the canonical argument (from *Effective Java*) for "favour composition over inheritance".

## Common mistakes

- **Inheriting for code reuse** where there's no true *is-a* (a `Stack extends Vector` — exactly the JDK's own historical mistake).
- **Breaking the superclass contract** in an override (a `Square extends Rectangle` whose `setWidth` also changes height breaks code written for rectangles).
- **Deep hierarchies** (more than two or three levels) that are hard to follow.
- **Field hiding** by redeclaring a field with the same name.
- **Calling overridable methods from constructors** (they run before the subclass is initialised).
- **Forgetting `super.method()`** when an override should extend, not replace, behaviour.

## Interview questions

**Q1. Why doesn't Java support multiple inheritance of classes?**

````reveal title="Answer"
To avoid the **diamond problem** with state and implementation: if `C extends A, B` and both define a field or method `x`, which one does `C` get, and how many copies of a shared ancestor's fields does it hold? Single class inheritance keeps object layout and constructor chaining simple. Java allows multiple inheritance of **types** (interfaces), and since Java 8 of default **behaviour**, with explicit rules to resolve conflicts — but never of instance state.
````

**Q2. Are private members inherited?**

````reveal title="Answer"
Not in the language sense: subclass code can't access or override them, and the JLS says they are not inherited. But they are part of every subclass **object** — the memory is there and inherited superclass methods can use them. So "the subclass object contains them, the subclass code can't see them".
````

**Q3. What is the fragile base class problem?**

````reveal title="Answer"
A subclass that relies on the superclass's internal behaviour (e.g. which methods call which) can break when the superclass changes, even though the superclass's public contract didn't change. Example: overriding both `add` and `addAll` in a `HashSet` subclass double-counts because `addAll` calls `add`. Mitigations: favour composition, design classes explicitly for inheritance (document self-use, provide hooks, make other methods final), or make classes final.
````

**Q4. What is the order of constructor execution in a three-level hierarchy?**

````reveal title="Answer"
Top-down: `Object`, then the grandparent, parent and finally the class itself. Each constructor first calls its superclass constructor (explicitly or implicitly), then runs its own instance field initialisers and initialiser blocks, then its body. Static initialisers of all three classes run earlier, once, parent first, when the classes are initialised.
````

## Hands-on exercise

A teammate wrote `class AuditedList<E> extends ArrayList<E>` that logs every addition by overriding `add(E)`. Calls to `addAll` and `add(int, E)` aren't logged, and a new JDK version could change that further.

Rewrite it as a **composition-based** `AuditedList<E>` that implements a small interface `Store<E>` with `add`, `addAll`, `size` and `snapshot()`, logging **every** element exactly once.

````hint title="Hint"
Keep a private `List<E>` and a private `List<String>` log. Implement `addAll` by looping over your own `add`, so logging happens in one place you control.
````

````solution title="Solution"
```java title="AuditedListDemo.java" file="AuditedListDemo.java"
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

public class AuditedListDemo {
    public static void main(String[] args) {
        Store<String> store = new AuditedList<>();
        store.add("alpha");
        store.addAll(List.of("beta", "gamma"));
        System.out.println("size = " + store.size() + ", items = " + store.snapshot());
        System.out.println("audit = " + ((AuditedList<String>) store).auditLog());
    }
}

interface Store<E> {
    void add(E element);

    void addAll(Collection<? extends E> elements);

    int size();

    List<E> snapshot();
}

final class AuditedList<E> implements Store<E> {
    private final List<E> items = new ArrayList<>();
    private final List<String> audit = new ArrayList<>();

    @Override
    public void add(E element) {
        items.add(element);
        audit.add("added " + element);
    }

    @Override
    public void addAll(Collection<? extends E> elements) {
        for (E e : elements) {
            add(e);                                 // single place that logs
        }
    }

    @Override
    public int size() {
        return items.size();
    }

    @Override
    public List<E> snapshot() {
        return List.copyOf(items);
    }

    List<String> auditLog() {
        return List.copyOf(audit);
    }
}
```

```text title="Output" output="AuditedListDemo.java"
size = 3, items = [alpha, beta, gamma]
audit = [added alpha, added beta, added gamma]
```
````

## Knowledge check

```quiz
? Which members does a subclass NOT inherit?
- Public methods
- Protected fields
+ Constructors
> Constructors are never inherited; each class declares its own.

? `Parent p = new Child();` Both declare a field `name`. What does `p.name` read?
+ Parent's field
- Child's field
> Fields are resolved by the declared type; only instance methods are dispatched dynamically.

? In what order do constructors run for `new C()` where C extends B extends A?
+ A, B, C
- C, B, A
- Only C
> Each constructor first calls its superclass constructor.

? Why did InstrumentedHashSet count 6 adds for 3 elements?
- A bug in HashSet
+ The inherited addAll calls the overridden add, so elements were counted twice
- Sets count duplicates
> The subclass depended on an implementation detail of its superclass.

? How many classes can a Java class directly extend?
+ One
- Two
- Unlimited
> Single inheritance of classes; multiple interfaces.
```

## Key takeaways

- `extends` creates an **is-a** relationship: inherit accessible members, add new ones, override instance methods.
- **Constructors and private members aren't inherited**, but superclass fields still exist inside every subclass object.
- Constructors run **top-down**; `super(...)` comes first.
- Methods are dispatched on the **object**, fields on the **declared type**.
- Inheritance couples you to the parent's implementation (**fragile base class**); use it for true specialisation, composition for reuse.
