## Concept explanation

### What it is

A class can be declared **inside** another type. There are four kinds:

| Kind | Declared | Has an outer instance? | Typical use |
|---|---|---|---|
| **Static nested class** | `static class Node` inside a class | **no** | helpers tied to the outer class: builders, nodes, map entries |
| **Inner class** (non-static member) | `class Itr` inside a class | **yes** — a hidden reference to the enclosing object | objects that need the outer object's state (an iterator over its collection) |
| **Local class** | inside a method body | yes, if declared in an instance method; captures effectively final locals | a named helper used only in one method |
| **Anonymous class** | `new Interface() { ... }` expression | same as local | one-off implementations (pre-Java 8 callbacks) |

All nested classes can access the outer class's **private** members, and the outer class can access theirs.

### Why it exists

- **Encapsulation and grouping:** a class used only by one other class (e.g. `LinkedList.Node`) belongs next to it, often `private`, keeping the package's public surface small.
- **Access to the outer object:** an inner-class iterator can read its list's private array directly.
- **Readable one-off behaviour:** anonymous and local classes put small implementations where they're used.

### When to use which

- Default to a **static nested class**. It's simpler and doesn't keep the outer object alive.
- Use an **inner class** only when each instance genuinely belongs to one outer instance and needs its state.
- For a single-method interface, prefer a **lambda** over an anonymous class (Java 8+). Use an anonymous class when you need state, several methods, or `this` to mean the implementation.
- Use a **local class** when a helper with a name and several methods is needed only inside one method (Java 16 also allows **local records, enums and interfaces**, which are implicitly static).

### Syntax essentials

```java
Outer.StaticNested a = new Outer.StaticNested();       // no outer instance needed
Outer outer = new Outer();
Outer.Inner b = outer.new Inner();                      // needs an outer instance
// Inside Inner: Outer.this.field refers to the enclosing object's field
```

### Anonymous class vs lambda

| | Anonymous class | Lambda |
|---|---|---|
| Implements | any interface or abstract/concrete class, any number of methods | functional interfaces only (one abstract method) |
| `this` means | the anonymous object | the enclosing instance |
| State | can have fields | none (captures effectively final locals) |
| Compiled to | a separate `Outer$1.class` | an `invokedynamic` call site + a private method |

## Internal working

- Every nested class compiles to its **own class file**: `Outer$StaticNested.class`, `Outer$Inner.class`, `Outer$1Local.class`, `Outer$1.class` (anonymous). The JVM has no special notion of "inner"; `javac` generates the plumbing.
- An **inner class** gets a synthetic `final` field (`this$0`) holding the outer instance, and its constructors take the outer instance as a hidden first parameter. `outer.new Inner()` passes it; inside the outer class, `new Inner()` passes `this`.
- **Captured local variables** of local/anonymous classes are copied into synthetic fields (`val$name`) via the constructor — that's why they must be effectively final.
- **Private access across the nest:** before Java 11, `javac` generated synthetic accessor methods (`access$000`). Since Java 11 (JEP 181, nest-based access control) the class files declare a *nest* (`NestHost`/`NestMembers`) and the JVM permits private access directly.
- **Memory leak risk:** because an inner or anonymous class instance holds `this$0`, anything that keeps the inner object alive (a listener registry, a static cache, a long-running task) also keeps the **whole outer object** alive.
- Lambdas don't capture `this` unless they use instance members, which makes them less leak-prone than anonymous classes.

## Visual representation

```text title="Hidden outer reference of an inner class"
   static nested                          inner
   +-------------------+                 +-------------------+
   | Outer.Builder     |                 | Outer.Itr         |
   |   fields...       |                 |   this$0 ---------+-----> Outer instance
   +-------------------+                 |   cursor          |       (kept alive as long
   no link to any Outer                  +-------------------+        as the Itr is)

   anonymous Runnable in an instance method:
   +-------------------+
   | Outer$1           |
   |   this$0 ---------+-----> Outer (even if the code never uses it before Java 18*)
   |   val$count = 3   |       captured local copied in
   +-------------------+
   * javac 18+ omits this$0 when the anonymous/inner class doesn't use the outer instance.
```

## Java code example

```java title="NestedClassesDemo.java" file="NestedClassesDemo.java"
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.function.Supplier;

public class NestedClassesDemo {
    public static void main(String[] args) {
        // Static nested class: a builder that needs no outer instance
        Pizza pizza = new Pizza.Builder("large").topping("olives").topping("basil").build();
        System.out.println(pizza);

        // Inner class: an iterator that reads its outer collection's private state
        Bag bag = new Bag();
        bag.add("pen");
        bag.add("ink");
        for (String item : bag) {
            System.out.print(item + " ");
        }
        System.out.println();
        Bag.Cursor cursor = bag.new Cursor();               // explicit outer.new Inner()
        System.out.println("cursor belongs to bag: " + (cursor.owner() == bag));

        // Local class with captured, effectively final locals
        System.out.println(new Greeter("Hello").greetAll(List.of("Ada", "Linus")));

        // Anonymous class vs lambda: what does `this` mean?
        Greeter greeter = new Greeter("Hi");
        System.out.println(greeter.anonymousThis().get());
        System.out.println(greeter.lambdaThis().get());
    }
}

final class Pizza {
    private final String size;
    private final List<String> toppings;

    private Pizza(Builder b) {                               // outer can read the builder's private fields
        this.size = b.size;
        this.toppings = List.copyOf(b.toppings);
    }

    static final class Builder {                             // static nested: no hidden outer reference
        private final String size;
        private final List<String> toppings = new ArrayList<>();

        Builder(String size) {
            this.size = size;
        }

        Builder topping(String t) {
            toppings.add(t);
            return this;
        }

        Pizza build() {
            return new Pizza(this);
        }
    }

    @Override
    public String toString() {
        return size + " pizza with " + toppings;
    }
}

final class Bag implements Iterable<String> {
    private final String[] items = new String[10];
    private int size;

    void add(String item) {
        items[size++] = item;
    }

    @Override
    public Iterator<String> iterator() {
        return new Cursor();                                 // inside Bag: `this` is passed implicitly
    }

    final class Cursor implements Iterator<String> {         // inner: holds a reference to its Bag
        private int index;

        @Override
        public boolean hasNext() {
            return index < size;                             // reads Bag.this.size
        }

        @Override
        public String next() {
            if (!hasNext()) {
                throw new NoSuchElementException();
            }
            return items[index++];                           // reads Bag.this.items (private)
        }

        Bag owner() {
            return Bag.this;                                 // qualified this
        }
    }
}

final class Greeter {
    private final String greeting;

    Greeter(String greeting) {
        this.greeting = greeting;
    }

    String greetAll(List<String> names) {
        String punctuation = "!";                            // effectively final, captured below
        class Line {                                         // local class
            String format(String name) {
                return greeting + ", " + name + punctuation;
            }
        }
        StringBuilder out = new StringBuilder();
        Line line = new Line();
        for (String n : names) {
            out.append(line.format(n)).append(' ');
        }
        return out.toString().trim();
    }

    Supplier<String> anonymousThis() {
        return new Supplier<>() {
            @Override
            public String get() {
                return "anonymous: this is " + (this instanceof Supplier ? "the Supplier object" : "?");
            }
        };
    }

    Supplier<String> lambdaThis() {
        return () -> "lambda: this is " + (this == (Object) this ? "the Greeter (" + greeting + ")" : "?");
    }
}
```

## Output

```text title="Output" output="NestedClassesDemo.java"
large pizza with [olives, basil]
pen ink 
cursor belongs to bag: true
Hello, Ada! Hello, Linus!
anonymous: this is the Supplier object
lambda: this is the Greeter (Hi)
```

- `Pizza.Builder` is static: you create it without a `Pizza`, and it can't accidentally keep one alive.
- `Bag.Cursor` reads `Bag`'s private `items` and `size` through its hidden outer reference; `Bag.this` names that reference.
- The local class `Line` captured `greeting` (through `this`) and the effectively final `punctuation`.
- Inside the anonymous class `this` is the anonymous object; inside the lambda it's the enclosing `Greeter`.

## Real-world application

- **JDK collections**: `HashMap.Node` (static nested), `ArrayList.Itr` (inner), `Map.Entry` (nested interface).
- **Builders** are almost always static nested classes (`HttpRequest.Builder`, Lombok's `@Builder`).
- **UI and event code**: Swing/Android listeners were anonymous classes; a famous Android leak is an anonymous `Handler`/`AsyncTask` holding the `Activity` after rotation.
- **Tests** use nested classes (`@Nested` in JUnit 5) to group related cases.

## Common mistakes

- **Using an inner class where a static nested class would do** — extra memory per instance and leak risk.
- **Long-lived inner/anonymous instances** (listeners, tasks, caches) keeping large outer objects alive.
- **Anonymous classes for single-method interfaces** where a lambda is clearer.
- **Confusing `this`** inside anonymous classes and lambdas.
- **Trying to modify captured locals** from a lambda or local class (compile error); use a field or an `AtomicInteger` if mutation is really needed.
- **Deeply nested class hierarchies** that are hard to navigate; move big nested classes to top level.

## Interview questions

**Q1. What is the difference between a static nested class and an inner class?**

````reveal title="Answer"
A static nested class is an ordinary class scoped inside another; it has no link to an outer instance and is created with `new Outer.Nested()`. An inner (non-static) class instance is bound to an outer instance: the compiler adds a hidden `this$0` field, it's created with `outer.new Inner()`, and it can access the outer instance's fields directly. Inner classes can therefore keep their outer object alive.
````

**Q2. Why can anonymous and local classes only capture effectively final variables?**

````reveal title="Answer"
The values are copied into synthetic fields of the inner object when it's constructed. If the local variable could change afterwards, the copy and the variable would diverge silently. Requiring effectively final makes the copy semantically identical to the variable.
````

**Q3. How can an inner class cause a memory leak?**

````reveal title="Answer"
Every inner/anonymous instance (that uses the enclosing instance) holds a strong reference to its outer object. If the inner object is stored somewhere long-lived — a static collection, an event bus, a thread pool task, a cache — the outer object (and everything it references, e.g. an Android `Activity` with its views) can't be garbage-collected. Fix: use static nested classes, lambdas that don't capture `this`, weak references, or unregister listeners.
````

**Q4. What does `this` refer to inside a lambda versus an anonymous class?**

````reveal title="Answer"
In an anonymous class, `this` is the anonymous class instance (the object implementing the interface). In a lambda, `this` is the enclosing instance — a lambda doesn't introduce a new scope or object identity for `this`. Same for `super`.
````

## Hands-on exercise

Implement a minimal singly linked `IntStack` with:

- a **private static nested** `Node` class (`value`, `next`),
- `push`, `pop`, `peek`, `isEmpty`,
- an `iterator()` returning an **anonymous** `Iterator<Integer>` that walks from top to bottom,
- a `toString()` using the iterator.

Explain in a comment why `Node` should be static.

````hint title="Hint"
`Node` doesn't need to reach the stack itself, so making it static saves a reference per node and avoids tying nodes to a particular stack. The iterator needs `top`, so an anonymous class (or inner class) is appropriate there.
````

````solution title="Solution"
```java title="IntStackDemo.java" file="IntStackDemo.java"
import java.util.Iterator;
import java.util.NoSuchElementException;

public class IntStackDemo {
    public static void main(String[] args) {
        IntStack stack = new IntStack();
        stack.push(1);
        stack.push(2);
        stack.push(3);
        System.out.println(stack + " peek=" + stack.peek());
        System.out.println("pop=" + stack.pop() + " -> " + stack);
    }
}

final class IntStack implements Iterable<Integer> {
    /** Static: a node never needs its stack, so it carries no hidden reference (saves memory). */
    private static final class Node {
        final int value;
        final Node next;

        Node(int value, Node next) {
            this.value = value;
            this.next = next;
        }
    }

    private Node top;

    void push(int value) {
        top = new Node(value, top);
    }

    int pop() {
        int v = peek();
        top = top.next;
        return v;
    }

    int peek() {
        if (top == null) {
            throw new NoSuchElementException("empty stack");
        }
        return top.value;
    }

    boolean isEmpty() {
        return top == null;
    }

    @Override
    public Iterator<Integer> iterator() {
        return new Iterator<>() {                         // anonymous: needs the stack's `top`
            private Node current = top;

            @Override
            public boolean hasNext() {
                return current != null;
            }

            @Override
            public Integer next() {
                if (current == null) {
                    throw new NoSuchElementException();
                }
                int v = current.value;
                current = current.next;
                return v;
            }
        };
    }

    @Override
    public String toString() {
        StringBuilder sb = new StringBuilder("[");
        for (int v : this) {
            if (sb.length() > 1) {
                sb.append(", ");
            }
            sb.append(v);
        }
        return sb.append("]").toString();
    }
}
```

```text title="Output" output="IntStackDemo.java"
[3, 2, 1] peek=3
pop=3 -> [2, 1]
```
````

## Knowledge check

```quiz
? Which nested class type holds a hidden reference to an instance of the enclosing class?
- Static nested class
+ Inner (non-static member) class
- Local record
> Inner classes get a synthetic this$0 field.

? How do you create an instance of inner class `Inner` from outside `Outer`?
+ `outer.new Inner()`
- `new Outer.Inner()`
- `Outer.Inner.create()`
> An inner instance needs an outer instance.

? Inside an anonymous class implementing Runnable, what is `this`?
+ The anonymous Runnable object
- The enclosing object
> Lambdas use the enclosing this; anonymous classes introduce their own.

? Why should builders usually be static nested classes?
+ They're created before the outer object exists and shouldn't hold a reference to one
- Static classes are faster to instantiate
- Inner classes can't have fields
> A builder has no outer instance to bind to.

? What file does javac produce for an anonymous class inside `Shop`?
+ Shop$1.class
- Shop.class only
- Anonymous.class
> Every nested class gets its own class file.
```

## Key takeaways

- Four kinds: **static nested**, **inner**, **local**, **anonymous**; all share private access with the outer class.
- Inner/anonymous instances carry a hidden **outer reference** — default to **static nested** classes.
- Local and anonymous classes capture **effectively final** locals by copying them.
- Prefer **lambdas** to anonymous classes for single-method interfaces; remember `this` differs.
- Long-lived inner instances can **leak** their outer objects.
