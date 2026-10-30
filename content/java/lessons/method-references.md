## Concept explanation

### What a method reference is

When a lambda does nothing but call one existing method, a **method reference** names that method directly:

```java
names.forEach(name -> System.out.println(name));   // lambda
names.forEach(System.out::println);                // method reference: same behaviour
```

A method reference is just shorter syntax for a lambda. It needs a functional-interface target type, and the compiler checks that the method's parameters and return type fit that interface's single abstract method.

### The four kinds

| Kind | Syntax | Equivalent lambda | Example |
|---|---|---|---|
| **Static method** | `Class::staticMethod` | `(a, b) -> Class.staticMethod(a, b)` | `Integer::parseInt`, `Math::max` |
| **Bound instance method** (receiver known) | `expression::method` | `(a) -> expression.method(a)` | `System.out::println`, `greeting::startsWith`, `this::validate` |
| **Unbound instance method** (receiver is the first argument) | `Class::instanceMethod` | `(obj, a) -> obj.method(a)` | `String::length`, `String::compareToIgnoreCase` |
| **Constructor** | `Class::new`, `Type[]::new` | `(a) -> new Class(a)`, `n -> new Type[n]` | `ArrayList::new`, `Book::new`, `String[]::new` |

The **unbound** form is the one that surprises people. In `String::length` there's no string yet; the *first parameter* of the functional interface becomes the receiver. That's why `String::length` fits `Function<String, Integer>`: one input, the string itself. Likewise `String::startsWith` fits `BiPredicate<String, String>`: `(s, prefix) -> s.startsWith(prefix)`.

Also available: `super::method` (call the parent's version) and `this::method`.

### Constructor references pick the overload from the target

```java
Supplier<Book> a = Book::new;                      // calls Book()
Function<String, Book> b = Book::new;              // calls Book(String)
BiFunction<String, Integer, Book> c = Book::new;   // calls Book(String, int)
IntFunction<String[]> d = String[]::new;           // new String[n]
```

That makes constructors usable as **factories**: `toArray(String[]::new)`, `Collectors.toCollection(TreeSet::new)`, `map.computeIfAbsent(key, k -> new ArrayList<>())` (a lambda here, because the key must be ignored).

### When a lambda reads better

Use a method reference when it is *clearer*, not always:

- **Reordered or extra arguments** need a lambda: `x -> Math.pow(x, 2)`, `s -> s.split(",")`, `k -> new ArrayList<>()` (ignores `k`).
- **More than one call** needs a lambda: `p -> p.address().city()`.
- **Ambiguity**: `Integer::toString` as a `Function<Integer, String>` is ambiguous, because both static `toString(int)` and instance `toString()` match. Use `i -> i.toString()` or `String::valueOf`.

```java
Function<Integer, String> f = Integer::toString;
// error: incompatible types: invalid method reference
//   reference to toString is ambiguous
//     both method toString(int) in Integer and method toString() in Integer match
```

## Internal working

- **Same `invokedynamic` machinery as lambdas.** `LambdaMetafactory` receives a method handle that points straight at the target method (`String.length`, `ArrayList.<init>`), so usually **no synthetic `lambda$` method** is generated. `javac` still emits a small synthetic helper when the handle can't be used directly, for example for varargs adaptation, `super::` references, or array constructors.
- **Bound receivers are evaluated once, at creation time.** For `expr::method`, `javac` evaluates `expr`, null-checks it (`Objects.requireNonNull`), and captures the resulting object, as if you had written `var r = expr; x -> r.method(x)`. Consequences:
  - `nullRef::length` throws `NullPointerException` **immediately**, while `() -> nullRef.length()` throws only when called;
  - the receiver variable doesn't need to be effectively final (only its value at that moment is captured);
  - `System.out::println` captures the current `System.out`. A later `System.setOut` doesn't affect it.
- **Resolution.** For `Class::name`, the compiler searches for both a static method taking all the interface's parameters and an instance method taking all but the first. If both match it reports ambiguity; if neither does, "invalid method reference".
- **Better type inference.** An *exact* method reference (one non-overloaded method) gives the compiler type information a bare lambda doesn't. `Comparator.comparing(Book::title).reversed()` compiles, but `Comparator.comparing(b -> b.title()).reversed()` fails: the call to `reversed()` removes the target type, so `b` is inferred as `Object`.

## Visual representation

```text title="Which argument goes where"
  functional interface method          method reference        what actually runs
  -------------------------------      -------------------     -------------------------------
  Integer apply(String s)              Integer::parseInt       Integer.parseInt(s)          static
  boolean test(String p)               greeting::startsWith    greeting.startsWith(p)       bound: receiver fixed
  Integer apply(String s)              String::length          s.length()                   unbound: 1st arg = receiver
  boolean test(String s, String p)     String::startsWith      s.startsWith(p)              unbound
  Book apply(String t, Integer n)      Book::new               new Book(t, n)               constructor
  String[] apply(int n)                String[]::new           new String[n]                array constructor

  bound receiver:   Supplier<Integer> s = text::length;
                    -> javac: tmp = text; Objects.requireNonNull(tmp); s = () -> tmp.length();
```

## Java code example

```java title="MethodRefDemo.java" file="MethodRefDemo.java"
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.function.BiFunction;
import java.util.function.BiPredicate;
import java.util.function.Function;
import java.util.function.IntFunction;
import java.util.function.Supplier;
import java.util.function.ToIntFunction;
import java.util.function.UnaryOperator;

public class MethodRefDemo extends Base {
    record Book(String title, int pages) {
        Book(String title) {
            this(title, 100);
        }

        static int byPages(Book a, Book b) {
            return Integer.compare(a.pages(), b.pages());
        }
    }

    public static void main(String[] args) {
        // 1. Static method: Class::staticMethod
        Function<String, Integer> parse = Integer::parseInt;              // s -> Integer.parseInt(s)
        System.out.println("static:  " + (parse.apply("41") + 1));

        // 2. Bound instance method: expression::method
        String greeting = "Hello";
        Function<String, Boolean> greetingStarts = greeting::startsWith;   // p -> greeting.startsWith(p)
        Supplier<Integer> greetingLength = greeting::length;               // () -> greeting.length()
        System.out.println("bound:   " + greetingStarts.apply("He") + " " + greetingLength.get());

        // 3. Unbound instance method: Class::instanceMethod, first argument is the receiver
        Function<String, String> upper = String::toUpperCase;              // s -> s.toUpperCase()
        BiPredicate<String, String> starts = String::startsWith;           // (s, p) -> s.startsWith(p)
        ToIntFunction<String> length = String::length;                     // s -> s.length()
        System.out.println("unbound: " + upper.apply("java") + " " + starts.test("lambda", "lam") + " " + length.applyAsInt("four"));

        // 4. Constructor and array-constructor references
        Supplier<List<String>> newList = ArrayList::new;                   // () -> new ArrayList<>()
        Function<String, Book> byTitle = Book::new;                        // t -> new Book(t)
        BiFunction<String, Integer, Book> full = Book::new;                // (t, p) -> new Book(t, p)
        IntFunction<String[]> newArray = String[]::new;                    // n -> new String[n]
        List<String> titles = newList.get();
        titles.add("Dune");
        titles.add("Emma");
        System.out.println("ctor:    " + byTitle.apply("Dune") + " " + full.apply("Emma", 474) + " array of " + newArray.apply(3).length);
        System.out.println("toArray: " + Arrays.toString(titles.toArray(String[]::new)));

        // Method references with sorting
        List<Book> books = new ArrayList<>(List.of(new Book("Dune", 412), new Book("Emma", 474), new Book("Ubik", 202)));
        books.sort(Book::byPages);                                         // static, two arguments
        System.out.println("by pages:      " + books);
        books.sort(Comparator.comparing(Book::title).reversed());          // exact ref helps inference
        System.out.println("by title desc: " + books);

        new MethodRefDemo().thisAndSuper();

        // 5. A bound receiver is evaluated once, when the reference is created
        StringBuilder log = new StringBuilder("first");
        Supplier<String> viaRef = log::toString;
        log.append("+more");                       // same object, so both see the change
        System.out.println("mutated receiver: " + viaRef.get());

        String name = "ada";
        Supplier<String> upperName = name::toUpperCase;   // captures the String "ada" now
        name = "grace";                                    // allowed: name need not be effectively final
        System.out.println("captured receiver: " + upperName.get() + " (name is now " + name + ")");

        String missing = null;
        Supplier<Integer> lazy = () -> missing.length();   // nothing evaluated yet
        System.out.println("lambda over null created");
        try {
            Supplier<Integer> eager = missing::length;      // null-checked right here
            System.out.println("never printed " + eager.get());
        } catch (NullPointerException e) {
            System.out.println("method reference on null fails at creation");
        }
        try {
            lazy.get();
        } catch (NullPointerException e) {
            System.out.println("lambda fails only when called");
        }
    }

    @Override
    String describe() {
        return "child";
    }

    String decorate(String s) {
        return "<" + s + ">";
    }

    void thisAndSuper() {
        UnaryOperator<String> deco = this::decorate;
        Supplier<String> mine = this::describe;
        Supplier<String> parents = super::describe;
        System.out.println("this/super: " + deco.apply("x") + " " + mine.get() + " " + parents.get());
    }
}

class Base {
    String describe() {
        return "base";
    }
}
```

## Output

```text title="Output" output="MethodRefDemo.java"
static:  42
bound:   true 5
unbound: JAVA true 4
ctor:    Book[title=Dune, pages=100] Book[title=Emma, pages=474] array of 3
toArray: [Dune, Emma]
by pages:      [Book[title=Ubik, pages=202], Book[title=Dune, pages=412], Book[title=Emma, pages=474]]
by title desc: [Book[title=Ubik, pages=202], Book[title=Emma, pages=474], Book[title=Dune, pages=412]]
this/super: <x> child base
mutated receiver: first+more
captured receiver: ADA (name is now grace)
lambda over null created
method reference on null fails at creation
lambda fails only when called
```

- `String::length` and `String::startsWith` received the string as their *first* argument: the unbound form.
- `Book::new` resolved to different constructors depending on whether the target was `Function` or `BiFunction`.
- `Comparator.comparing(Book::title).reversed()` compiled because `Book::title` is exact. With `b -> b.title()` the same line fails to compile.
- `name::toUpperCase` captured the string `"ada"` when the reference was created, so reassigning `name` afterwards had no effect and was even allowed.
- `missing::length` threw at creation, while the equivalent lambda waited until `get()`.

## Real-world application

- **Streams**: `.map(String::trim)`, `.filter(Objects::nonNull)`, `.mapToInt(Integer::intValue)`, `.forEach(results::add)`, `.toArray(Order[]::new)`.
- **Comparators**: `Comparator.comparing(Employee::department).thenComparing(Employee::salary, Comparator.reverseOrder())`.
- **Factories and registries**: `Map<String, Supplier<Parser>> parsers = Map.of("json", JsonParser::new, "csv", CsvParser::new)`, and `Collectors.toCollection(TreeSet::new)`.
- **Callbacks into your own object**: `executor.submit(this::refreshCache)`, `button.setOnAction(this::onSave)`, `CompletableFuture.supplyAsync(repo::loadAll)`.
- **Spring and other frameworks**: `Optional.map(UserDto::from)`, `RouterFunctions.route(GET("/users"), handler::listUsers)`.

## Common mistakes

- **Forcing a method reference** where it needs extra arguments or a chain of calls. `p -> p.address().city()` can't be one reference, and that's fine.
- **Ambiguous references** such as `Integer::toString` with `Function<Integer, String>`. Pick an unambiguous method (`String::valueOf`) or write a lambda.
- **Expecting `nullable::method` to be lazy.** It null-checks at creation, so an `Optional`-style "maybe call later" flow breaks.
- **Losing inference in chains**: `Comparator.comparing(x -> x.name()).reversed()` fails to compile. Use `Comparator.comparing(Person::name).reversed()` or add a type, `(Person x) -> x.name()`.
- **Confusing bound and unbound**: `str::length` (a `Supplier`, fixed string) vs `String::length` (a `Function`, any string).
- **Overusing `this::method` for private helpers** called once. A named method is great; a method reference doesn't make code faster.

## Interview questions

**Q1. What are the four kinds of method reference?**

````reveal title="Answer"
1. Static: `Integer::parseInt`.
2. Bound instance method on a specific object: `System.out::println`, `this::save`.
3. Unbound instance method of an arbitrary object of a type: `String::length`, where the first parameter becomes the receiver.
4. Constructor: `ArrayList::new`, `int[]::new`.

`super::method` is a variant of the bound form.
````

**Q2. Explain `String::compareToIgnoreCase` used as a `Comparator<String>`.**

````reveal title="Answer"
It's an unbound instance method reference. `Comparator<String>.compare(a, b)` takes two strings; the first becomes the receiver and the second the argument: `(a, b) -> a.compareToIgnoreCase(b)`. So `list.sort(String::compareToIgnoreCase)` sorts case-insensitively.
````

**Q3. What's the difference between `obj::method` and `() -> obj.method()` if `obj` is `null` or changes later?**

````reveal title="Answer"
For the method reference, `obj` is evaluated and null-checked once, when the reference is created. A `null` receiver throws `NullPointerException` immediately, and later reassignments of the variable don't matter (it doesn't even need to be effectively final). The lambda captures the variable's value but calls the method only when invoked, so a `null` fails only on call, and the variable must be effectively final.
````

**Q4. Why doesn't `Function<Integer, String> f = Integer::toString;` compile?**

````reveal title="Answer"
Two methods fit the shape: the static `Integer.toString(int)` (the argument is passed as a parameter) and the instance `Integer.toString()` (the argument is the receiver). The compiler reports "reference to toString is ambiguous". Use `String::valueOf`, `Object::toString` or `i -> i.toString()`.
````

**Q5. Are method references faster than lambdas?**

````reveal title="Answer"
Not meaningfully. Both use `invokedynamic` and `LambdaMetafactory`. A method reference usually skips the synthetic `lambda$` method because the handle points straight at the target, which saves one tiny, easily inlined call. Choose based on readability.
````

## Hands-on exercise

Build a shape factory driven by text commands, using constructor references:

- `interface Shape { double area(); String name(); }` with records `Circle(double radius)`, `Square(double side)` and `Hexagon(double side)` (area = 3√3/2 · side²).
- A `LinkedHashMap<String, DoubleFunction<Shape>>` registry filled with `Circle::new`, `Square::new` and `Hexagon::new`.
- `create("circle 1")` splits the command, looks up the factory and applies it. An unknown name throws `IllegalArgumentException`.
- Create shapes from `"circle 1"`, `"square 3"`, `"hexagon 1.5"` and `"circle 0.5"`. Sort them by area, largest first, using a method reference, print each shape, then try `"triangle 2"`.

````hint title="Hint"
A record's canonical constructor `Circle(double)` matches `DoubleFunction<Shape>` because `Circle` *is a* `Shape`. Sort with `Comparator.comparingDouble(Shape::area).reversed()`. With a lambda instead of `Shape::area` you'd need an explicit parameter type.
````

````solution title="Solution"
```java title="ShapeFactory.java" file="ShapeFactory.java"
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.DoubleFunction;

public class ShapeFactory {
    interface Shape {
        double area();

        String name();
    }

    record Circle(double radius) implements Shape {
        public double area() {
            return Math.PI * radius * radius;
        }

        public String name() {
            return "circle";
        }
    }

    record Square(double side) implements Shape {
        public double area() {
            return side * side;
        }

        public String name() {
            return "square";
        }
    }

    record Hexagon(double side) implements Shape {
        public double area() {
            return 3 * Math.sqrt(3) / 2 * side * side;
        }

        public String name() {
            return "hexagon";
        }
    }

    static final Map<String, DoubleFunction<Shape>> FACTORIES = new LinkedHashMap<>();

    static {
        FACTORIES.put("circle", Circle::new);       // radius -> new Circle(radius)
        FACTORIES.put("square", Square::new);
        FACTORIES.put("hexagon", Hexagon::new);
    }

    static Shape create(String command) {
        String[] parts = command.trim().split("\\s+");
        DoubleFunction<Shape> factory = FACTORIES.get(parts[0]);
        if (factory == null) {
            throw new IllegalArgumentException("unknown shape '" + parts[0] + "', expected one of " + FACTORIES.keySet());
        }
        return factory.apply(Double.parseDouble(parts[1]));
    }

    public static void main(String[] args) {
        List<Shape> shapes = new ArrayList<>();
        for (String command : List.of("circle 1", "square 3", "hexagon 1.5", "circle 0.5")) {
            shapes.add(create(command));
        }
        shapes.sort(Comparator.comparingDouble(Shape::area).reversed());
        for (Shape shape : shapes) {
            System.out.printf("%-8s area %6.3f  %s%n", shape.name(), shape.area(), shape);
        }
        try {
            create("triangle 2");
        } catch (IllegalArgumentException e) {
            System.out.println(e.getMessage());
        }
    }
}
```

```text title="Output" output="ShapeFactory.java"
square   area  9.000  Square[side=3.0]
hexagon  area  5.846  Hexagon[side=1.5]
circle   area  3.142  Circle[radius=1.0]
circle   area  0.785  Circle[radius=0.5]
unknown shape 'triangle', expected one of [circle, square, hexagon]
```

Adding a new shape is one record plus one `FACTORIES.put(..., Pentagon::new)`. The registry stores constructors as values, which is the Factory pattern without a factory class per type.
````

## Knowledge check

```quiz
? Which functional interface does String::length fit?
+ Function<String, Integer>
- Supplier<Integer>
- Consumer<String>
> Unbound reference: the string is the first (and only) argument.

? What does BiFunction<String, Integer, Book> f = Book::new call?
+ The Book(String, int) constructor
- The no-argument constructor
- A static factory named new
> The target type's parameters select the constructor overload.

? `String s = null; Supplier<Integer> r = s::length;` What happens?
+ NullPointerException when the reference is created
- NullPointerException only when r.get() is called
- It compiles to a lambda that returns 0
> Bound receivers are evaluated and null-checked eagerly.

? Why does Comparator.comparing(p -> p.name()).reversed() fail to compile?
+ The chained call removes the target type, so p is inferred as Object
- Lambdas can't be used with Comparator
- reversed() requires a method reference
> An exact method reference such as Person::name carries the type itself.

? Which is NOT a valid method reference?
+ list::get(0)
- String[]::new
- super::toString
> A method reference can't contain arguments; use a lambda: () -> list.get(0).
```

## Key takeaways

- A method reference is shorthand for a lambda that calls one method: **static**, **bound**, **unbound** (first argument = receiver) or **constructor** (`Class::new`, `Type[]::new`).
- The **target type** decides which overload or constructor is used. Ambiguity (`Integer::toString`) is a compile error.
- **Bound receivers are evaluated and null-checked at creation time**; lambdas evaluate on each call.
- Exact method references help type inference in chains like `comparing(...).reversed()`.
- Use them when they read better; keep lambdas for extra arguments, reordering or chained calls.
