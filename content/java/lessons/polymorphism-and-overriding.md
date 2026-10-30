## Concept explanation

### What it is

**Polymorphism** ("many forms") means one piece of code works with objects of different types through a common type, and each object responds in its own way. Java has two kinds:

| | Compile-time (static) polymorphism | Run-time (dynamic) polymorphism |
|---|---|---|
| Mechanism | **method overloading** | **method overriding** |
| Decided by | the compiler, from the **declared (static) types** of the arguments | the JVM, from the **actual (run-time) class** of the receiver |
| Example | `print(int)` vs `print(String)` | `shape.area()` on a `Circle` or a `Square` |

When people say "polymorphism" in OOP they almost always mean **overriding + dynamic dispatch**.

### Why it exists

It lets you write code against an abstraction and add new behaviours **without changing that code** (the open–closed principle). `for (Shape s : shapes) total += s.area();` works for shapes that didn't exist when the loop was written.

### Overriding rules

A subclass method **overrides** a superclass instance method when it has the **same name and parameter types**. Rules:

1. **Return type**: the same, or a **subtype** (covariant return, Java 5+). Primitives must match exactly.
2. **Access**: the same or **wider** (`protected` → `public` is fine; `public` → `protected` isn't).
3. **Checked exceptions**: the override may throw **fewer or narrower** checked exceptions, never new or broader ones. Unchecked exceptions are unrestricted.
4. **Can't override** `final` methods, `static` methods (those are *hidden*), `private` methods (not inherited — a same-named method is a new method), or constructors.
5. Use **`@Override`**: the compiler then reports a mistake (e.g. `equals(MyType other)` that overloads instead of overriding `equals(Object)`).

### Overloading recap

Same name, **different parameter lists**, resolved at compile time from the declared argument types (exact/widening → boxing → varargs; see [methods](lesson:methods)). Overloading does **not** look at the run-time class of an argument.

### When to use it

- **Overriding**: to give subtypes their own behaviour behind a common contract — strategies, handlers, shapes, payment methods.
- **Overloading**: convenience variants of one operation (`println(int)`, `println(String)`); keep overloads semantically identical.
- If you find `if (x instanceof A) … else if (x instanceof B) …` spread through code, polymorphism (or a sealed type with pattern matching) is usually the better design.

## Internal working

- `shape.area()` compiles to **`invokevirtual Shape.area()D`**. The compiler checks that `Shape` has an applicable `area()` and records that symbolic reference; it **doesn't** know the object's class.
- At run time HotSpot reads the receiver's class pointer from its header and looks up the method in that class's **vtable** (virtual method table), where each overridable method has a fixed slot. A subclass's vtable copies the parent's, replacing overridden slots — so dispatch is an indexed load, not a search.
- Interface calls use **`invokeinterface`** and **itables** (per-interface method tables), because a class can implement many interfaces in any order.
- The **JIT** makes most virtual calls nearly free: with *class hierarchy analysis* and *inline caches* it notices when a call site only ever sees one or two receiver classes (monomorphic/bimorphic) and **inlines** the target behind a cheap type check, deoptimising if a new class shows up. Truly **megamorphic** call sites (many classes) stay as table lookups.
- `private`, `static`, constructor and `super.x()` calls use `invokespecial`/`invokestatic`: no dynamic dispatch.
- **Overload resolution** happens entirely in `javac`, which writes the exact chosen signature (e.g. `print:(Ljava/lang/Object;)V`) into the bytecode.
- **Fields are never dispatched dynamically**: `getfield` uses the declared type.

## Visual representation

```text title="Static type picks the method signature; run-time class picks the implementation"
   Animal a = new Dog();
   a.speak(new Cat());          // Animal declares speak(Animal) and speak(Cat)

   COMPILE TIME (javac, static types only)
     receiver type  Animal  -> look in Animal
     argument type  Cat     -> choose overload speak(Cat)
     emits: invokevirtual Animal.speak(Cat)

   RUN TIME (JVM, actual class of the receiver)
     a is really a Dog -> Dog's vtable slot for speak(Cat)
     -> Dog.speak(Cat) runs if Dog overrides it, else Animal.speak(Cat)

   vtable(Animal): [toString, equals, ..., speak(Animal), speak(Cat)]
   vtable(Dog):    [toString, equals, ..., Dog.speak(Animal), Animal.speak(Cat)]
```

## Java code example

```java title="PolymorphismDemo.java" file="PolymorphismDemo.java"
import java.io.IOException;
import java.util.List;

public class PolymorphismDemo {
    // Overloads: chosen by the STATIC type of the argument
    static String feed(Animal a) { return "feed(Animal)"; }
    static String feed(Dog d)    { return "feed(Dog)"; }

    public static void main(String[] args) throws Exception {
        List<Animal> zoo = List.of(new Animal(), new Dog(), new Puppy());
        for (Animal a : zoo) {
            System.out.println(a.getClass().getSimpleName() + " says " + a.sound());   // dynamic dispatch
        }

        Animal maybeDog = new Dog();
        System.out.println("feed(maybeDog) -> " + feed(maybeDog));                 // static type Animal
        System.out.println("feed((Dog) maybeDog) -> " + feed((Dog) maybeDog));

        // Overloading inside an overriding method: both rules at once
        Animal rex = new Dog();
        Dog fido = new Dog();
        System.out.println("rex.greet(fido)      -> " + rex.greet(fido));
        System.out.println("rex.greet((Animal) fido) -> " + rex.greet((Animal) fido));

        // Fields are not polymorphic; methods are
        Animal shadow = new Dog();
        System.out.println("field via Animal ref: " + shadow.name + ", method: " + shadow.name());

        // Covariant return type
        Dog copy = fido.copy();                                          // no cast needed
        System.out.println("covariant copy is a " + copy.getClass().getSimpleName());

        // Narrower checked exception in the override
        Reader file = new FileReader();
        System.out.println(file.read());

        // The classic equals-overload bug
        Point p = new Point(1, 2);
        Object samePoint = new Point(1, 2);
        System.out.println("p.equals(samePoint) with an overload: " + p.equals(samePoint));
    }
}

class Animal {
    String name = "animal-field";

    String sound() { return "..."; }
    String name() { return "animal"; }
    String greet(Animal other) { return "Animal.greet(Animal)"; }
    String greet(Dog other)    { return "Animal.greet(Dog)"; }
    Animal copy() { return new Animal(); }
}

class Dog extends Animal {
    String name = "dog-field";                                           // hides, doesn't override

    @Override String sound() { return "Woof"; }
    @Override String name() { return "dog"; }
    @Override String greet(Animal other) { return "Dog.greet(Animal)"; }
    @Override Dog copy() { return new Dog(); }                           // covariant return
}

class Puppy extends Dog {
    @Override String sound() { return super.sound() + " (squeaky)"; }   // extend the parent's behaviour
}

abstract class Reader {
    abstract String read() throws IOException;
}

class FileReader extends Reader {
    @Override
    String read() {                                                      // may drop the checked exception
        return "read without throwing IOException";
    }
}

class Point {
    private final int x;
    private final int y;

    Point(int x, int y) { this.x = x; this.y = y; }

    // BUG on purpose: this OVERLOADS equals(Object) instead of overriding it.
    // With @Override the compiler would have reported the mistake.
    public boolean equals(Point other) {
        return other != null && x == other.x && y == other.y;
    }

    @Override
    public int hashCode() { return 31 * x + y; }
}
```

## Output

```text title="Output" output="PolymorphismDemo.java"
Animal says ...
Dog says Woof
Puppy says Woof (squeaky)
feed(maybeDog) -> feed(Animal)
feed((Dog) maybeDog) -> feed(Dog)
rex.greet(fido)      -> Animal.greet(Dog)
rex.greet((Animal) fido) -> Dog.greet(Animal)
field via Animal ref: animal-field, method: dog
covariant copy is a Dog
read without throwing IOException
p.equals(samePoint) with an overload: false
```

Read the tricky lines slowly:

- `feed(maybeDog)`: the variable's **static** type is `Animal`, so the compiler picked `feed(Animal)`. Overloads ignore the run-time class.
- `rex.greet(fido)`: the compiler (static types `Animal` and `Dog`) chose the overload `greet(Dog)`. At run time `Dog` hasn't overridden `greet(Dog)`, so `Animal.greet(Dog)` ran.
- `rex.greet((Animal) fido)`: the overload `greet(Animal)` was chosen; `Dog` overrides that one, so `Dog.greet(Animal)` ran.
- `shadow.name` read `Animal`'s field; `shadow.name()` dispatched to `Dog`.
- `p.equals(samePoint)`: the argument's static type is `Object`, so `Object.equals(Object)` (identity) was called — the `equals(Point)` overload never ran.

## Real-world application

- **Strategy-style designs**: `PricingStrategy`, `PaymentProcessor`, `NotificationChannel` implementations chosen by configuration; the calling code never changes.
- **Collections**: code written against `List` runs on `ArrayList`, `LinkedList` or an unmodifiable list.
- **Frameworks** call your overrides: `Runnable.run`, `Comparable.compareTo`, servlet `doGet`, `toString`/`equals`/`hashCode` used by collections and loggers.
- **Performance**: hot polymorphic call sites with one or two receiver types are inlined by the JIT, so clean polymorphic design rarely costs speed.

## Common mistakes

- **Overloading where you meant to override** (`equals(Point)`), especially without `@Override`.
- **Expecting overload selection by run-time type** (`feed(maybeDog)`).
- **Hiding fields** and expecting them to behave like methods.
- **Reducing visibility or adding checked exceptions** in an override (compile errors).
- **Calling overridable methods from a constructor**: the override runs before the subclass's fields are set.
- **`instanceof` chains** instead of putting behaviour in the types.

## Interview questions

**Q1. What is the difference between overloading and overriding?**

````reveal title="Answer"
Overloading: same method name, different parameter lists, in the same class or a subclass; resolved at **compile time** from static argument types; return type may differ. Overriding: a subclass redefines an inherited instance method with the same signature; resolved at **run time** by the receiver's actual class (dynamic dispatch); must keep a compatible return type (covariant allowed), not reduce access, and not throw broader checked exceptions.
````

**Q2. Can you override a private or static method?**

````reveal title="Answer"
No. Private methods aren't inherited, so a same-signature method in the subclass is a brand-new method (no dispatch between them). Static methods are bound at compile time; a same-signature static method in the subclass **hides** the parent's. `@Override` on either is a compile error.
````

**Q3. How does the JVM decide which overridden method to call?**

````reveal title="Answer"
`javac` emits `invokevirtual` (or `invokeinterface`) with the method signature it resolved against the static type. At run time the JVM takes the receiver's actual class and finds the implementation for that signature — in HotSpot via the class's vtable (or itable for interfaces), a fixed-slot lookup. The JIT often inlines the target when profiling shows only one or two receiver classes at that call site.
````

**Q4. What does this print?**

```java
class A { void show() { System.out.println("A"); } A() { show(); } }
class B extends A { int x = 5; void show() { System.out.println("B " + x); } }
new B();
```

````reveal title="Answer"
`B 0`. `A`'s constructor runs first and calls `show()`, which dispatches to `B.show()` — but `B`'s field initialiser (`x = 5`) hasn't run yet, so `x` is still the default `0`. This is why constructors must not call overridable methods.
````

**Q5. Is method overloading really polymorphism?**

````reveal title="Answer"
It's called *compile-time* or *ad-hoc* polymorphism: one name, several implementations, chosen by the compiler. It doesn't give you the key OOP benefit — code that adapts to new subtypes at run time — which only overriding with dynamic dispatch provides.
````

## Hands-on exercise

Predict every line, then run:

```java
class Base {
    String who(Object o) { return "Base.who(Object)"; }
    String who(String s) { return "Base.who(String)"; }
}
class Derived extends Base {
    @Override String who(Object o) { return "Derived.who(Object)"; }
}
Base b = new Derived();
Object text = "hi";
System.out.println(b.who("hi"));
System.out.println(b.who(text));
System.out.println(((Derived) b).who(42));
```

Then fix `Point` from the example so that `equals` works through an `Object` reference and in a `HashSet`.

````hint title="Hint"
Step 1, compile time: pick the overload from the static types. Step 2, run time: find the most specific override of *that* signature in the receiver's class. For `Point`, override `equals(Object)` with `@Override` and keep `hashCode` consistent.
````

````solution title="Solution"
```java title="DispatchQuiz.java" file="DispatchQuiz.java"
import java.util.HashSet;
import java.util.Set;

public class DispatchQuiz {
    public static void main(String[] args) {
        Base b = new Derived();
        Object text = "hi";
        System.out.println(b.who("hi"));            // overload who(String); Derived doesn't override it
        System.out.println(b.who(text));            // overload who(Object); Derived overrides it
        System.out.println(((Derived) b).who(42));  // Integer -> who(Object)

        Set<FixedPoint> set = new HashSet<>();
        set.add(new FixedPoint(1, 2));
        Object other = new FixedPoint(1, 2);
        System.out.println("equals via Object: " + new FixedPoint(1, 2).equals(other) + ", set contains: " + set.contains(other));
    }
}

class Base {
    String who(Object o) {
        return "Base.who(Object)";
    }

    String who(String s) {
        return "Base.who(String)";
    }
}

class Derived extends Base {
    @Override
    String who(Object o) {
        return "Derived.who(Object)";
    }
}

final class FixedPoint {
    private final int x;
    private final int y;

    FixedPoint(int x, int y) {
        this.x = x;
        this.y = y;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof FixedPoint)) {
            return false;
        }
        FixedPoint p = (FixedPoint) o;
        return x == p.x && y == p.y;
    }

    @Override
    public int hashCode() {
        return 31 * x + y;
    }
}
```

```text title="Output" output="DispatchQuiz.java"
Base.who(String)
Derived.who(Object)
Derived.who(Object)
equals via Object: true, set contains: true
```
````

## Knowledge check

```quiz
? `Animal a = new Dog(); a.sound();` — which `sound()` runs if Dog overrides it?
+ Dog.sound()
- Animal.sound()
> Instance methods are dispatched on the object's run-time class.

? `static void f(Object o)` and `static void f(String s)` exist. `Object x = "hi"; f(x);` calls?
- f(String)
+ f(Object)
> Overloads are chosen from the static type of the argument.

? An overriding method can...
+ return a subtype of the overridden method's return type
- reduce visibility from public to protected
- throw a broader checked exception
> Covariant returns are allowed; the other two break substitutability.

? Which methods can't be overridden?
+ final, static and private methods
- protected methods
- methods that return void
> final forbids it; static methods are hidden; private methods aren't inherited.

? Which call is NOT dynamically dispatched?
- `list.size()` on a List reference
+ `super.toString()`
- `shape.area()`
> super calls use invokespecial and target the parent's exact implementation.
```

## Key takeaways

- **Overloading** = compile-time choice by **static argument types**; **overriding** = run-time choice by the **receiver's class**.
- Override rules: same signature, **covariant** return allowed, **no narrower access**, **no broader checked exceptions**; always use `@Override`.
- `final`, `static` and `private` methods aren't overridden; **fields are never polymorphic**.
- HotSpot dispatches through **vtables/itables** and the JIT inlines monomorphic call sites.
- Don't call overridable methods from constructors.
