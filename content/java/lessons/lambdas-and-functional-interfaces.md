## Concept explanation

### From objects to behaviour

Before Java 8, passing *behaviour* (a comparison, a callback, a task) meant writing an object that carried it, usually an **anonymous class**:

```java
button.addActionListener(new ActionListener() {
    @Override
    public void actionPerformed(ActionEvent e) {
        save();
    }
});
```

Five lines of ceremony for one line of intent. A **lambda expression** is a compact way to write that one method:

```java
button.addActionListener(e -> save());
```

This is the core idea of **functional programming** in Java: treat behaviour as a value you can pass to methods, return from methods and store in variables. Java stays object-oriented. A lambda is still an object implementing an interface, but the syntax lets you focus on *what* to do.

### Lambda syntax

| Form | Example |
|---|---|
| no parameters | `() -> 42` |
| one parameter (parentheses optional) | `x -> x * 2` |
| several parameters | `(a, b) -> a + b` |
| explicit types | `(String s, int n) -> s.repeat(n)` |
| `var` parameters (Java 11, allows annotations) | `(var s) -> s.trim()` |
| block body (needs `return` for a value) | `(a, b) -> { int sum = a + b; return sum * sum; }` |

Within one lambda, either all parameters are typed or none are; you can't mix `(String a, b)`.

### Functional interfaces

A lambda has **no type of its own**. It can only appear where the compiler expects a **functional interface**: an interface with **exactly one abstract method** (a *single abstract method*, or SAM, type).

- **Default** and **static** methods don't count, so an interface can have many of them and still be functional.
- Abstract methods that match a `public` method of `Object` (`equals`, `hashCode`, `toString`) don't count either. That is why `Comparator`, which declares `boolean equals(Object)`, is still functional.
- **`@FunctionalInterface`** is optional but recommended. The compiler then rejects the interface if someone adds a second abstract method.

Existing single-method interfaces became lambda-compatible automatically: `Runnable`, `Callable`, `Comparator`, `ActionListener`, `FileFilter`. Java 8 also added the `java.util.function` package (`Predicate`, `Function`, `Supplier`…), covered in the next lesson.

### Target typing

The compiler infers a lambda's type from its **context**: an assignment, a method argument, a return statement or a cast. The same text can therefore become different types:

```java
Supplier<String> s = () -> "done";     // a Supplier
Callable<String> c = () -> "done";     // a Callable: same text, different interface
```

The parameter types come from the interface method, so `x -> x * 2` needs no types when assigned to `IntUnaryOperator`.

### Capturing variables

A lambda can use variables from the enclosing scope:

- **Local variables and parameters** must be **effectively final**: assigned once and never changed, even if not declared `final`. Changing the variable anywhere, before or after the lambda, is a compile error.
- **Instance and static fields** can be read *and* modified, because the lambda captures `this` (or nothing for statics), not the field's value.

Why the rule? A lambda may run later, or on another thread, after the method has returned and its stack frame is gone. So Java **copies** the value of a local into the lambda. If the local could change afterwards, the copy and the variable would silently disagree. Requiring effectively final variables makes the copy indistinguishable from the variable.

### Lambda vs anonymous class

| | Lambda | Anonymous class |
|---|---|---|
| Implements | functional interfaces only | any interface or class, any number of methods |
| `this` | the **enclosing** instance | the anonymous object itself |
| Own state (fields) | no | yes |
| Shadowing a local name | compile error | allowed |
| Compiled to | a private method + `invokedynamic` | a separate `Outer$1.class` file |
| Instances | non-capturing ones are typically reused | a new object on every evaluation |

## Internal working

What `javac` and the JVM do with `Runnable r = () -> System.out.println(name);`:

1. **Desugaring.** `javac` moves the lambda body into a private method of the enclosing class, for example `private static void lambda$main$0(String name)`. Captured values become leading parameters. If the body uses `this` or instance members, the method is an instance method.
2. **`invokedynamic`.** Where the lambda appears, `javac` emits an `invokedynamic` instruction whose *bootstrap method* is `LambdaMetafactory.metafactory`. No `.class` file is generated for the lambda.
3. **First execution.** The bootstrap method runs once per lambda expression. It spins a **hidden class** (Java 15+) implementing `Runnable`, whose `run()` calls `lambda$main$0`. It then links a `CallSite` to a factory for that class.
4. **Later executions.** The linked call site just produces an instance:
   - **non-capturing** lambdas: in HotSpot today, the same singleton every time;
   - **capturing** lambdas: a new small object holding the captured values.

Why this design rather than inner classes?
- **Smaller binaries.** No class file per lambda.
- **Cheaper startup.** A class is generated only for lambdas that actually run.
- **Freedom to change the strategy later.** The bytecode only says "give me a `Runnable`", so the JDK can improve the implementation without recompiling code.

Two practical consequences:
- **Don't rely on identity.** Never use `==` or `equals` on lambdas, or synchronise on them. Whether you get a shared or a new instance is an implementation detail.
- **Stack traces show the desugared name.** Look for frames like `lambda$main$0`.

Checked exceptions follow the interface: a lambda can throw a checked exception only if the functional interface's method declares it. `Callable.call()` declares `throws Exception`; `Runnable.run()` and the `java.util.function` types declare nothing.

## Visual representation

```text title="How a lambda is compiled and linked"
  source                          javac output                         run time
  ------------------------        ---------------------------------    -------------------------------------
  String name = "ada";            private static void                  first time the invokedynamic runs:
  Runnable r =                      lambda$main$0(String name) {         LambdaMetafactory.metafactory(...)
      () -> print(name);              print(name);                         -> defines hidden class
                                  }                                          LambdaDemo$$Lambda implements Runnable
                                                                           -> links the CallSite
                                  invokedynamic run(String)            every time:
                                    bootstrap: LambdaMetafactory           CallSite(name) -> new $$Lambda(name)
                                    -> returns a Runnable                  (non-capturing: one shared instance)

  anonymous class:  new Runnable() { ... }   ->   LambdaDemo$1.class on disk, loaded like any class,
                                                  "new LambdaDemo$1(...)" on every evaluation
```

## Java code example

```java title="LambdaDemo.java" file="LambdaDemo.java"
import java.util.List;
import java.util.concurrent.Callable;
import java.util.function.Supplier;

public class LambdaDemo {
    @FunctionalInterface
    interface Validator {
        boolean validate(String input);               // the single abstract method

        default Validator and(Validator other) {      // default methods don't count
            return input -> validate(input) && other.validate(input);
        }

        static Validator minLength(int n) {           // neither do static methods
            return input -> input.length() >= n;
        }
    }

    private final String name = "outer instance";

    public static void main(String[] args) throws Exception {
        // 1. Before Java 8: an anonymous class
        Validator notEmptyOld = new Validator() {
            @Override
            public boolean validate(String input) {
                return !input.isEmpty();
            }
        };

        // 2. The same idea as lambdas, in each syntactic form
        Validator notEmpty = input -> !input.isEmpty();                  // one inferred parameter
        Validator noSpaces = (String input) -> input.indexOf(' ') < 0;   // explicit type
        Validator hasDigit = (var input) -> {                            // var (Java 11) + block body
            for (char c : input.toCharArray()) {
                if (Character.isDigit(c)) {
                    return true;
                }
            }
            return false;
        };
        Runnable noArgs = () -> System.out.println("no parameters: ()");
        noArgs.run();

        Validator password = Validator.minLength(8).and(noSpaces).and(hasDigit);
        for (String candidate : List.of("secret", "secret pass1", "secret123")) {
            System.out.println(candidate + " -> " + password.validate(candidate));
        }
        System.out.println("old style agrees: " + (notEmptyOld.validate("x") == notEmpty.validate("x")));

        // 3. Target typing: the same lambda text becomes different interfaces
        Supplier<String> supplier = () -> "done";
        Callable<String> callable = () -> "done";
        System.out.println(supplier.get() + " / " + callable.call());

        // 4. Capture: locals must be effectively final; fields need not be
        int limit = 3;                        // effectively final: never reassigned
        // limit++;                           // would make the next line fail to compile
        Validator shortText = s -> s.length() <= limit;
        System.out.println("short? " + shortText.validate("abcd"));

        int[] counter = {0};                  // the array reference is final; its contents are not
        Runnable increment = () -> counter[0]++;
        increment.run();
        increment.run();
        System.out.println("counter via array: " + counter[0] + " (compiles, but not thread-safe)");

        new LambdaDemo().thisDemo();

        // 5. How lambdas are implemented
        Runnable lambda = () -> { };
        Runnable anonymous = new Runnable() {
            @Override
            public void run() { }
        };
        System.out.println("lambda class is hidden: " + lambda.getClass().isHidden());
        System.out.println("anonymous class: " + anonymous.getClass().getName() + ", hidden: " + anonymous.getClass().isHidden());
        System.out.println("non-capturing lambda reused: " + (constant() == constant()));
        System.out.println("capturing lambda reused: " + (capture("a") == capture("a")));
    }

    void thisDemo() {
        Runnable viaLambda = () -> System.out.println("lambda this -> " + this.name);
        Runnable viaAnonymous = new Runnable() {
            private final String name = "anonymous instance";

            @Override
            public void run() {
                System.out.println("anonymous this -> " + this.name);
            }
        };
        viaLambda.run();
        viaAnonymous.run();
    }

    static Supplier<String> constant() {
        return () -> "same";
    }

    static Supplier<String> capture(String value) {
        return () -> value;
    }
}
```

## Output

```text title="Output" output="LambdaDemo.java"
no parameters: ()
secret -> false
secret pass1 -> false
secret123 -> true
old style agrees: true
done / done
short? false
counter via array: 2 (compiles, but not thread-safe)
lambda this -> outer instance
anonymous this -> anonymous instance
lambda class is hidden: true
anonymous class: LambdaDemo$2, hidden: false
non-capturing lambda reused: true
capturing lambda reused: false
```

- `Validator` stays functional despite its `default` and `static` methods. `and` returns a *new* lambda that captures both validators, which is how `Predicate.and` works in the JDK.
- `() -> "done"` became a `Supplier` in one place and a `Callable` in another. The context decides the type.
- The array trick compiles because `counter` itself is never reassigned. It is a code smell: it hides shared mutable state and breaks under concurrency. Prefer an `AtomicInteger`, or a stream reduction.
- `this` inside the lambda is the enclosing `LambdaDemo`; inside the anonymous class it is the anonymous object, with its own `name` field.
- The lambda's class is a run-time **hidden class**; the anonymous class `LambdaDemo$2` is an ordinary class compiled to disk. The non-capturing lambda came back as the same instance; the capturing one did not. Both are HotSpot behaviour, not something the language guarantees.

## Real-world application

- **Callbacks and event handlers**: UI listeners, `CompletableFuture.thenApply(result -> ...)`, HTTP client response handlers.
- **Tasks for executors**: `executor.submit(() -> generateReport(id))`, scheduled jobs, `new Thread(() -> ...)`.
- **Strategies without classes**: comparators, retry policies, validation rules and pricing rules passed as lambdas instead of one class per variant.
- **Framework hooks**: Spring's `JdbcTemplate.query(sql, (rs, row) -> new User(...))`, `TransactionTemplate.execute(status -> ...)`, and security configuration DSLs such as `http.authorizeHttpRequests(auth -> auth.anyRequest().authenticated())`.
- **Streams**: every `filter`, `map` and `sorted` call takes a lambda (later in this stage).

## Common mistakes

- **Modifying a captured local** (`count++` inside a lambda). Use a stream reduction, an `AtomicInteger`, or a field, not the one-element-array hack.
- **Long multi-statement lambdas.** If it needs a comment or more than a few lines, extract a named method and use a method reference.
- **Checked exceptions.** `list.forEach(f -> Files.delete(f))` doesn't compile because `Consumer.accept` declares no checked exceptions. Handle the exception inside, or wrap it with an adapter (see the exercise).
- **Confusing `this`.** In a lambda, `this` is the enclosing object, not the lambda. Use an anonymous class if you need the object to refer to itself.
- **Relying on lambda identity or `equals`.** Two identical lambda expressions are not equal, and caching behaviour is unspecified.
- **Ambiguous overloads.** `executor.submit(() -> { throw new IOException(); })` matches `Callable` (which may throw) but not `Runnable`. Lambdas whose body could fit either `Runnable` or `Callable` can resolve differently from what you expect, so add a cast or a typed variable to make the intent explicit.

## Interview questions

**Q1. What is a functional interface? Is `Comparator` one, given that it declares two abstract methods?**

````reveal title="Answer"
A functional interface has exactly one abstract method; default and static methods don't count, and neither do abstract methods that redeclare a public `Object` method. `Comparator` declares `compare` and `equals(Object)`; `equals` is inherited from `Object` in every implementation, so only `compare` counts. That makes `Comparator` functional. `@FunctionalInterface` asks the compiler to enforce the rule.
````

**Q2. Why must local variables used in a lambda be effectively final?**

````reveal title="Answer"
The lambda may outlive the method's stack frame (stored, returned or run on another thread), so the JVM captures the variable's *value*, not the variable. If the local could change afterwards, the lambda's copy and the variable would disagree silently, and concurrent access to a stack variable would be a data race. Requiring effectively final variables makes the copy semantics invisible. Fields don't have this restriction because the lambda captures `this` and reads the field at the time it runs.
````

**Q3. How is a lambda different from an anonymous class?**

````reveal title="Answer"
- **Shape.** A lambda implements exactly one abstract method of a functional interface; an anonymous class can extend a class, implement any interface and have state and several methods.
- **`this`.** In a lambda, `this` is the enclosing instance; in an anonymous class it is the anonymous object.
- **Scope.** A lambda can't shadow local variables of the enclosing scope.
- **Compilation.** A lambda becomes a private method plus an `invokedynamic` call site, with a hidden class created at run time. An anonymous class is a separate `.class` file instantiated with `new` on every evaluation, and it always holds a reference to the enclosing instance when declared in an instance context, which can cause memory leaks.
````

**Q4. How does the JVM implement lambdas?**

````reveal title="Answer"
`javac` compiles the body to a private synthetic method (`lambda$main$0`) and emits `invokedynamic` with `LambdaMetafactory` as the bootstrap method. On first execution the bootstrap generates a hidden class implementing the functional interface and links the call site. Each evaluation then returns an instance: a cached singleton for non-capturing lambdas in current HotSpot, or a new object holding the captured values. This avoids a class file per lambda and lets the JDK change the strategy without recompiling user code.
````

**Q5. Can a lambda throw a checked exception?**

````reveal title="Answer"
Only if the functional interface method declares it. A lambda for `Callable<V>` may throw `Exception`; one for `Runnable`, `Function` or `Consumer` may not. The options are: catch and handle inside the lambda, rethrow as an unchecked exception (`UncheckedIOException` for `IOException`), or define your own functional interface whose method declares `throws` and adapt it to the standard type.
````

## Hands-on exercise

`Function.apply` can't throw checked exceptions, yet many useful methods do. Write a `@FunctionalInterface ThrowingFunction<T, R>` whose `apply` declares `throws Exception`, plus a static adapter `unchecked(ThrowingFunction<T, R>)` that returns a normal `Function<T, R>`:

- runtime exceptions pass through unchanged;
- checked exceptions are wrapped in an `IllegalStateException` that names the failing input and keeps the original as its cause.

Use it with `static int parsePort(String) throws Exception`, which rejects ports outside 1–65535. Parse `"80"`, `" 443 "` and `"8080"` successfully, then show what happens for `"70000"`.

````hint title="Hint"
The adapter is `t -> { try { return f.apply(t); } catch (RuntimeException e) { throw e; } catch (Exception e) { throw new IllegalStateException(..., e); } }`. Catch `RuntimeException` first so it isn't wrapped. Call it as `ThrowingFunction.unchecked(text -> parsePort(text))`.
````

````solution title="Solution"
```java title="CheckedLambdas.java" file="CheckedLambdas.java"
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

public class CheckedLambdas {
    @FunctionalInterface
    interface ThrowingFunction<T, R> {
        R apply(T t) throws Exception;

        static <T, R> Function<T, R> unchecked(ThrowingFunction<T, R> f) {
            return t -> {
                try {
                    return f.apply(t);
                } catch (RuntimeException e) {
                    throw e;                                      // already unchecked: pass through
                } catch (Exception e) {
                    throw new IllegalStateException("failed on '" + t + "': " + e.getMessage(), e);
                }
            };
        }
    }

    static int parsePort(String text) throws Exception {         // an API with a checked exception
        int port = Integer.parseInt(text.trim());
        if (port < 1 || port > 65_535) {
            throw new Exception("port out of range: " + port);
        }
        return port;
    }

    public static void main(String[] args) {
        // Function<String, Integer> broken = text -> parsePort(text);  // unreported exception Exception
        Function<String, Integer> parse = ThrowingFunction.unchecked(text -> parsePort(text));

        List<Integer> ports = new ArrayList<>();
        for (String text : List.of("80", " 443 ", "8080")) {
            ports.add(parse.apply(text));
        }
        System.out.println("parsed " + ports);

        try {
            parse.apply("70000");
        } catch (IllegalStateException e) {
            System.out.println(e.getMessage() + " (cause: " + e.getCause().getClass().getSimpleName() + ")");
        }
        try {
            parse.apply("http");
        } catch (NumberFormatException e) {
            System.out.println("runtime exception passed through: " + e.getMessage());
        }
    }
}
```

```text title="Output" output="CheckedLambdas.java"
parsed [80, 443, 8080]
failed on '70000': port out of range: 70000 (cause: Exception)
runtime exception passed through: For input string: "http"
```

The adapter keeps the standard `Function` type, so it plugs into any API that expects one, including streams. In real code, prefer a specific wrapper (`UncheckedIOException` for `IOException`) so callers can still tell failures apart.
````

## Knowledge check

```quiz
? Which interface is a valid functional interface?
+ One abstract method plus several default and static methods
- Two abstract methods with different names
- An interface with only default methods
> Only abstract methods that aren't public Object methods count.

? Inside a lambda written in an instance method, what does `this` refer to?
+ The enclosing instance
- The lambda object
- Nothing; this is not allowed in lambdas
> Lambdas don't introduce a new scope for this, unlike anonymous classes.

? Which local variable can a lambda use?
+ One assigned once and never changed, even without the final keyword
- Any local, as long as the lambda runs immediately
- Only locals declared static
> Effectively final means never reassigned anywhere in the method.

? How does javac compile a lambda expression?
+ A private synthetic method plus an invokedynamic call site
- A separate Outer$1.class file
- Reflection at run time
> LambdaMetafactory creates a hidden class when the call site first runs.

? Can the lambda `(a, b) -> a + b` be assigned to both BinaryOperator<Integer> and BiFunction<Integer, Integer, Integer>?
+ Yes, its type comes from the target
- No, a lambda has exactly one type
- Only with an explicit cast
> Target typing lets the same lambda text implement different interfaces.
```

## Key takeaways

- A **lambda** is a concise implementation of a **functional interface**, an interface with exactly one abstract method. `@FunctionalInterface` makes the compiler enforce it.
- Lambdas have **no type of their own**; the target context decides it.
- Captured **locals must be effectively final** because their values are copied; fields can change.
- In a lambda **`this` is the enclosing instance**. Lambdas can't hold state or shadow locals.
- Compiled to a **private method + `invokedynamic`**, with a hidden class generated at run time. Don't depend on lambda identity.
- Checked exceptions are allowed only if the interface method declares them.
