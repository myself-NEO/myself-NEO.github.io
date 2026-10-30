## Concept explanation

A **variable** is a named storage location with a **type** fixed at compile time. Java has three kinds, distinguished by where they are declared:

| Kind | Declared | Lives | Default value | Lifetime |
|---|---|---|---|---|
| **Local variable** (incl. parameters) | inside a method, constructor or block | the thread's stack frame | **none — must be assigned before use** | until the block ends |
| **Instance variable (field)** | in a class, without `static` | inside each object on the heap | `0`, `0.0`, `false`, `'\u0000'`, `null` | as long as the object |
| **Static variable (class field)** | in a class, with `static` | with the class (one copy) | same defaults as fields | as long as the class is loaded |

### Declaration, initialisation, assignment

```java
int count;            // declaration
count = 10;           // assignment
int total = 0;        // declaration + initialisation
int a = 1, b = 2;     // several at once (legal, but one per line reads better)
```

### Constants

A constant is a `final` variable whose value never changes. Class-level constants are conventionally `static final` and named in `UPPER_SNAKE_CASE`:

```java
public static final int MAX_RETRIES = 3;
public static final Duration TIMEOUT = Duration.ofSeconds(2);
```

If a `static final` primitive or `String` is initialised with a **compile-time constant expression**, `javac` inlines its value into every class that uses it. Changing the constant then requires recompiling the users — a classic library-versioning trap.

### `var` (Java 10+)

`var` asks the compiler to infer a **local** variable's type from its initialiser. The variable is still statically typed:

```java
var names = new ArrayList<String>();   // type is ArrayList<String>
var reader = Files.newBufferedReader(path);
```

`var` is not allowed for fields, method parameters or return types, without an initialiser, or with `null` alone (`var x = null;` doesn't compile). Use it when the type is obvious from the right-hand side.

### Naming rules

Identifiers start with a letter, `_` or `$`, then letters, digits, `_` or `$`. They are case-sensitive and can't be keywords. Since Java 9 a single underscore `_` is not a valid identifier (Java 22 reuses it for *unnamed variables*). Conventions: `camelCase` for variables and methods, `PascalCase` for types, `UPPER_SNAKE_CASE` for constants.

### Scope and shadowing

**Scope** is the region of code where a name is visible. A local variable's scope runs from its declaration to the end of its enclosing block. Inner blocks can see outer variables but not the reverse.

- A local variable **can't** redeclare another local in an enclosing scope of the same method (`int i` inside a loop when `i` already exists → compile error).
- A local variable or parameter **can shadow a field** of the same name. Inside that scope the bare name means the local; `this.name` reaches the field.

## Internal working

- **Locals** live in the method's **stack frame**, in numbered *local-variable slots*. Bytecode refers to them by slot index (`iload_1`, `aload_2`); the names exist only as debug information. Each thread has its own stack, so locals are never shared between threads.
- **Instance fields** are laid out inside each object on the **heap**. When the JVM allocates an object it zeroes the memory, which is why fields have defaults.
- **Static fields** are stored with the class's runtime data (in HotSpot, inside the `java.lang.Class` mirror object on the heap, since JDK 7). They are set to defaults during class *preparation*, then assigned their initial values when the class is *initialised*.
- **Definite assignment**: the compiler proves along every path that a local is assigned before it is read. That's why `int x; if (flag) x = 1; System.out.println(x);` fails to compile, while the JVM never needs to zero locals.
- **`final` locals and fields** are checked at compile time: a `final` local must be assigned exactly once ("blank finals" can be assigned later, once, on every path); a `final` field must be assigned by the end of every constructor.

## Visual representation

```text title="Where each kind of variable lives"
 Thread "main" stack                      Heap
 +-------------------------------+       +----------------------------+
 | frame: main(String[] args)    |       | Counter object             |
 |   slot 0: args  -----------------+    |   header                   |
 |   slot 1: c     ---------------+ |    |   int value = 3            |
 |   slot 2: step  = 2            | |    +----------------------------+
 +-------------------------------+ |    | String[] (args array)       |
                                    | +-> +----------------------------+
                                    +---> Counter object (above)
 Class Counter (one per loaded class)
 +-------------------------------+
 | static int created = 1        |
 +-------------------------------+
```

## Java code example

```java title="VariablesDemo.java" file="VariablesDemo.java"
import java.util.ArrayList;

public class VariablesDemo {
    static final int MAX_STEPS = 3;          // constant (compile-time, inlined)
    static int created;                       // static: one copy, default 0

    private int value;                        // instance field: default 0
    private final String name;                // blank final: assigned once in the constructor

    VariablesDemo(String name) {
        this.name = name;                     // parameter shadows the field; this.name is the field
        created++;
    }

    void advance(int step) {
        int before = value;                   // local: must be assigned before use
        value += step;
        System.out.println(name + ": " + before + " -> " + value);
    }

    public static void main(String[] args) {
        VariablesDemo a = new VariablesDemo("a");
        VariablesDemo b = new VariablesDemo("b");
        for (int i = 1; i <= MAX_STEPS; i++) {  // i is scoped to the loop
            a.advance(i);
        }
        b.advance(10);
        System.out.println("created = " + created);

        var labels = new ArrayList<String>();   // inferred ArrayList<String>
        labels.add("x");
        System.out.println("labels is an " + labels.getClass().getSimpleName() + ": " + labels);

        int result;
        if (args.length > 0) {
            result = args.length;
        } else {
            result = -1;                         // every path assigns: definitely assigned
        }
        System.out.println("result = " + result);
    }
}
```

## Output

```text title="Output" output="VariablesDemo.java"
a: 0 -> 1
a: 1 -> 3
a: 3 -> 6
b: 0 -> 10
created = 2
labels is an ArrayList: [x]
result = -1
```

- `a` and `b` each have their own `value` field (instance state), starting at the default `0`.
- `created` is static: both constructors incremented the same variable, so it ends at `2`.
- `var labels` is an ordinary statically typed `ArrayList<String>`.
- `result` compiles only because both branches assign it; remove the `else` and `javac` reports *variable result might not have been initialized*.

## Real-world application

- **Configuration constants** (`static final Duration TIMEOUT`) centralise magic numbers. For values that change per environment, load them at startup instead of making them compile-time constants.
- **Thread safety starts with scope**: data kept in local variables is confined to one thread and needs no locking. Shared mutable statics are a common source of concurrency bugs in web applications.
- **`final` fields** document intent and, in the Java Memory Model, guarantee that other threads see their constructed values (see [the Java Memory Model](lesson:java-memory-model)).
- **Code review**: narrow scopes (declare variables where they're first needed) make methods easier to read and refactor.

## Common mistakes

- **Reading an uninitialised local**: fields get defaults, locals don't.
- **Accidentally shadowing a field**: `void setName(String name) { name = name; }` assigns the parameter to itself; use `this.name = name`.
- **Mutable `public static` fields** (`public static List<String> CACHE`): global, shared, unsynchronised state.
- **Treating `final` as "immutable"**: a `final List` can still have elements added. `final` only stops reassignment of the reference.
- **Public constants in libraries changed without recompiling clients**: inlined values stay stale.
- **Overusing `var`** where the type isn't obvious: `var result = service.process(x);` hides what `result` is.

## Interview questions

**Q1. What are the default values of local, instance and static variables?**

````reveal title="Answer"
Instance and static fields get defaults: `0` for numeric types, `'\u0000'` for `char`, `false` for `boolean`, `null` for references — because the JVM zeroes memory on allocation and during class preparation. Local variables have **no default**; the compiler's definite-assignment analysis rejects any read that might happen before assignment.
````

**Q2. What is a blank final, and where can it be assigned?**

````reveal title="Answer"
A `final` variable declared without an initialiser. A blank final **instance** field must be assigned exactly once in every constructor (or an instance initialiser); a blank final **static** field exactly once in a static initialiser; a blank final **local** exactly once on every path before use. The compiler enforces all of this.
````

**Q3. Is `var` dynamic typing?**

````reveal title="Answer"
No. `var` is local-variable **type inference**: the compiler infers the static type from the initialiser, and the variable keeps that type forever. `var x = 1; x = "s";` doesn't compile. It is only allowed for locals with initialisers (and loop/try-with-resources variables, lambda parameters since Java 11).
````

**Q4. Why can't you declare a local variable with the same name as another local in an enclosing scope, when you can shadow a field?**

````reveal title="Answer"
The JLS forbids it to prevent confusing code within a single method, where both declarations are visible to the reader at once. Fields are part of the class, and shadowing them with parameters is an established idiom (constructors, setters), resolved with `this.`.
````

## Hands-on exercise

Write `Thermostat.java` with:

- a constant `MIN_TEMP = 5` and `MAX_TEMP = 30`;
- an instance field `target` (default value), and a static counter of how many thermostats were created;
- a method `set(int requested)` that clamps the value into range using a local variable and prints `requested -> stored`.

Create two thermostats, call `set(40)` on one and `set(-3)` on the other, and print the counter.

````hint title="Hint"
`Math.max(MIN_TEMP, Math.min(MAX_TEMP, requested))` clamps a value. Increment the static counter in the constructor.
````

````solution title="Solution"
```java title="Thermostat.java" file="Thermostat.java"
public class Thermostat {
    static final int MIN_TEMP = 5;
    static final int MAX_TEMP = 30;
    static int created;

    private int target;

    Thermostat() {
        created++;
    }

    void set(int requested) {
        int clamped = Math.max(MIN_TEMP, Math.min(MAX_TEMP, requested));
        System.out.println(requested + " -> " + clamped + " (was " + target + ")");
        target = clamped;
    }

    public static void main(String[] args) {
        Thermostat living = new Thermostat();
        Thermostat garage = new Thermostat();
        living.set(40);
        garage.set(-3);
        System.out.println("thermostats created: " + created);
    }
}
```

```text title="Output" output="Thermostat.java"
40 -> 30 (was 0)
-3 -> 5 (was 0)
thermostats created: 2
```
````

## Knowledge check

```quiz
? Which variable gets a default value automatically?
- A local `int` inside a method
+ An instance field `int count;`
- A method parameter
> Fields are zeroed on allocation; locals must be definitely assigned.

? What does `var list = new ArrayList<String>();` declare?
- A dynamically typed variable that can later hold a String
+ A local variable whose static type is ArrayList<String>
- A field of type Object
> var infers the type at compile time; it never changes.

? `void setAge(int age) { age = age; }` — what happens to the field `age`?
+ Nothing: the parameter is assigned to itself
- The field is updated
- Compile error
> The parameter shadows the field; use this.age = age.

? Which statement about `static final int LIMIT = 10;` is true?
- Every object has its own copy of LIMIT
+ Classes that use LIMIT get the value 10 inlined at compile time
- It can be reassigned in a constructor
> Compile-time constants are copied into the bytecode of their users.
```

## Key takeaways

- **Locals** live in stack frames and must be assigned before use; **fields** live in objects and get defaults; **statics** have one copy per class.
- `final` prevents reassignment; `static final` + compile-time constant = an **inlined** constant.
- `var` is **compile-time inference** for locals, not dynamic typing.
- Keep scopes narrow; use `this.` to resolve field shadowing.
- Local variables are thread-confined; shared mutable statics are a concurrency risk.
