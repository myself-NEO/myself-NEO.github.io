## Concept explanation

### What it is

`java.lang.Object` is the root of every class hierarchy: every class extends it directly or indirectly, and arrays are `Object`s too. Its methods are therefore available on **every** object:

| Method | Purpose | Override it? |
|---|---|---|
| `boolean equals(Object o)` | logical equality; default is identity (`==`) | yes, for value-like classes (with `hashCode`) |
| `int hashCode()` | hash for hash-based collections; must agree with `equals` | yes, whenever you override `equals` |
| `String toString()` | human-readable description; default `ClassName@hexHash` | almost always, for debugging and logs |
| `Class<?> getClass()` | the run-time class (final) | can't |
| `Object clone()` | field-by-field copy, only if the class implements `Cloneable` (protected) | rarely; prefer copy constructors |
| `void wait()`, `wait(long)`, `notify()`, `notifyAll()` | condition waiting on the object's monitor (final) | can't; see [wait and notify](lesson:wait-and-notify) |
| `void finalize()` | called by the GC before reclaiming; **deprecated for removal** | no |

`equals` and `hashCode` get their own lesson ([equals and hashCode](lesson:equals-and-hashcode)) and `clone` too ([cloning](lesson:cloning-and-copying)). This lesson covers the rest, especially **`toString`**.

### Why it exists

A single root type lets the platform treat all objects uniformly: collections can store and compare anything, `println` can print anything, synchronisation works on any object, and reflection can describe any object's class.

### Writing a good `toString()`

- Include the **identifying and most useful state**: `Order{id=ORD-7, status=PAID, total=59.98}`.
- Keep it **cheap and side-effect free**: it's called by debuggers, loggers and string concatenation.
- **Never include secrets** (passwords, tokens, card numbers, personal data) — `toString` output ends up in logs.
- Avoid infinite recursion between objects that refer to each other (`Parent.toString` printing children that print their parent).
- Don't make other code **parse** your `toString`; expose proper accessors instead.
- Records generate `ClassName[field=value, …]` automatically.

### `getClass()` versus `instanceof`

`getClass()` returns the exact run-time class (`ArrayList.class`), never a supertype. `x instanceof List` is true for any subtype. This difference is central to how `equals` handles subclasses.

### `finalize()` and its replacement

`finalize` ran at an unpredictable time (or never), slowed garbage collection, and could resurrect objects. It was deprecated in Java 9 and **deprecated for removal in Java 18 (JEP 421)**. Release resources deterministically with `try`-with-resources ([try-with-resources](lesson:try-with-resources)); as a safety net for native resources use `java.lang.ref.Cleaner`.

## Internal working

- **Default `toString`** is `getClass().getName() + "@" + Integer.toHexString(hashCode())`.
- **Default `hashCode`** (the *identity hash code*) is generated lazily the first time it's requested (HotSpot uses a thread-local random number generator by default, not the memory address) and stored in the object's **header** (mark word), so it never changes even when the GC moves the object. `System.identityHashCode(o)` returns it even if the class overrides `hashCode`.
- **`getClass()`** reads the header's class pointer — it's a native, intrinsic call; the returned `Class` object is unique per class per class loader, so `a.getClass() == b.getClass()` is a valid exact-type check.
- **`wait`/`notify`** use the object's **monitor**, which HotSpot ties to the header (thin locks, inflated to an `ObjectMonitor` when there's contention or waiting).
- String concatenation (`"x" + obj`) calls `String.valueOf(obj)`, which returns `"null"` for `null` and otherwise calls `toString()`.
- `Object` has no fields; its constructor is empty. Arrays inherit `Object`'s `equals`, `hashCode` and `toString` unchanged — which is why you need `Arrays.equals/hashCode/toString`.

## Visual representation

```text title="Where Object's methods sit and what they use"
                      java.lang.Object
   +------------------------------------------------------------+
   | equals(Object)  -> this == o            (override with hashCode)
   | hashCode()      -> identity hash, stored in the header
   | toString()      -> getClass().getName() + "@" + hex(hashCode())
   | getClass()      -> header's class pointer        (final, native)
   | clone()         -> shallow copy if Cloneable     (protected)
   | wait/notify     -> the object's monitor          (final)
   | finalize()      -> deprecated for removal
   +------------------------------------------------------------+
          ^ every class, every array, every record, every enum

   object header:  [ mark word: identity hash | lock bits | GC age ][ class pointer ]
```

## Java code example

```java title="ObjectMethodsDemo.java" file="ObjectMethodsDemo.java"
import java.util.ArrayList;
import java.util.List;

public class ObjectMethodsDemo {
    public static void main(String[] args) {
        // Default toString vs a useful one
        Plain plain = new Plain();
        String dflt = plain.toString();
        System.out.println("default toString looks like Plain@<hex>: " + dflt.matches("Plain@[0-9a-f]+"));
        System.out.println("matches identity hash: " + dflt.equals("Plain@" + Integer.toHexString(System.identityHashCode(plain))));

        Customer c = new Customer("C-42", "ada@example.com", "s3cr3t-token");
        System.out.println("customer: " + c);                        // concatenation calls toString()

        Customer nobody = null;
        System.out.println("null in concatenation: " + nobody);       // String.valueOf -> "null"

        // getClass versus instanceof
        List<String> list = new ArrayList<>();
        System.out.println("getClass: " + list.getClass().getSimpleName() + ", instanceof List: " + (list instanceof List));
        System.out.println("same exact class: " + (list.getClass() == new ArrayList<Integer>().getClass()));

        // Arrays use Object's methods unchanged
        int[] nums = {1, 2, 3};
        System.out.println("array toString starts with [I@: " + nums.toString().startsWith("[I@"));

        // Records get toString/equals/hashCode for free
        System.out.println("record: " + new Point(3, 4));

        // Avoid recursive toString between related objects
        Department dept = new Department("Platform");
        dept.hire(new Employee("Linus", dept));
        System.out.println(dept);
    }
}

class Plain {
}

final class Customer {
    private final String id;
    private final String email;
    private final String apiToken;              // secret: must never appear in toString

    Customer(String id, String email, String apiToken) {
        this.id = id;
        this.email = email;
        this.apiToken = apiToken;
    }

    @Override
    public String toString() {
        return "Customer{id=" + id + ", email=" + mask(email) + ", apiToken=***}";
    }

    private static String mask(String email) {
        int at = email.indexOf('@');
        return email.charAt(0) + "***" + email.substring(at);
    }

    String apiToken() {
        return apiToken;
    }
}

record Point(int x, int y) {
}

final class Department {
    private final String name;
    private final List<Employee> staff = new ArrayList<>();

    Department(String name) {
        this.name = name;
    }

    void hire(Employee e) {
        staff.add(e);
    }

    String name() {
        return name;
    }

    @Override
    public String toString() {
        return "Department{" + name + ", staff=" + staff + "}";
    }
}

final class Employee {
    private final String name;
    private final Department department;

    Employee(String name, Department department) {
        this.name = name;
        this.department = department;
    }

    @Override
    public String toString() {
        // Print the department's NAME, not the department itself: avoids infinite recursion.
        return "Employee{" + name + ", dept=" + department.name() + "}";
    }
}
```

## Output

```text title="Output" output="ObjectMethodsDemo.java"
default toString looks like Plain@<hex>: true
matches identity hash: true
customer: Customer{id=C-42, email=a***@example.com, apiToken=***}
null in concatenation: null
getClass: ArrayList, instanceof List: true
same exact class: true
array toString starts with [I@: true
record: Point[x=3, y=4]
Department{Platform, staff=[Employee{Linus, dept=Platform}]}
```

- The default `toString` is the class name plus the hex identity hash — useless in logs, which is why you override it.
- `Customer.toString` masks the email and hides the token.
- `getClass()` ignores generics: `ArrayList<String>` and `ArrayList<Integer>` share one `Class` object (type erasure).
- If `Employee.toString` printed the whole `Department`, the two methods would call each other until `StackOverflowError`.

## Real-world application

- **Logging and debugging**: every log line with an object relies on `toString`; good ones turn incident investigation from guesswork into reading.
- **Data-protection compliance**: masking or omitting personal data in `toString` keeps it out of log aggregation systems (Lombok's `@ToString.Exclude` and records' customisable `toString` serve the same purpose).
- **Hash-based collections** call `hashCode` and `equals` on every lookup — the next lesson.
- **Resource safety**: replacing `finalize` with try-with-resources and `Cleaner` is a common modernisation task in older codebases.

## Common mistakes

- **Leaving the default `toString`** on domain classes.
- **Secrets or personal data in `toString`.**
- **Expensive `toString`** (database calls, huge collections) triggered by debug logging.
- **Recursive `toString`** between bidirectionally linked objects (common with JPA entities).
- **Parsing `toString` output** in other code.
- **Relying on `finalize`** to close files or connections.
- **Using `System.identityHashCode` or default `hashCode` as a memory address** — it isn't one.

## Interview questions

**Q1. Which methods does `Object` provide, and which do you usually override?**

````reveal title="Answer"
`equals`, `hashCode`, `toString`, `getClass`, `clone`, `wait` (three overloads), `notify`, `notifyAll`, and the deprecated `finalize`. Typically override `toString` for nearly every class, and `equals`+`hashCode` together for value-like classes. `getClass`, `wait` and `notify*` are `final`. `clone` is best avoided in favour of copy constructors.
````

**Q2. Is the default `hashCode` the object's memory address?**

````reveal title="Answer"
No. In HotSpot it's a number generated on first request (by default from a thread-local pseudo-random generator) and stored in the object header, so it stays stable when the GC moves the object. The JLS/Javadoc only require consistency; "address" was true of some very old JVMs and is a common misconception.
````

**Q3. Why was `finalize` deprecated, and what replaces it?**

````reveal title="Answer"
It may run late or never, runs on an unspecified thread, slows allocation and GC (objects with finalizers need extra GC cycles), can resurrect objects, and exceptions in it are ignored. It's deprecated for removal since Java 18. Use try-with-resources for deterministic clean-up, and `java.lang.ref.Cleaner` (or `PhantomReference`) only as a safety net for native resources.
````

**Q4. What's the difference between `getClass() == o.getClass()` and `o instanceof MyClass` in `equals`?**

````reveal title="Answer"
`getClass()` requires exactly the same run-time class, so a subclass instance is never equal to a superclass instance — safe for symmetry but breaks substitutability (a proxy or subclass with no extra state won't equal its parent). `instanceof` accepts subclasses, which is natural for final classes or when subclasses add no state, but can violate symmetry if a subclass adds fields and overrides `equals`. Final value classes and records sidestep the issue.
````

## Hands-on exercise

Write a `BankCard` class with `holderName`, `cardNumber` (16 digits), `expiry` (`YearMonth`) and `cvv`. Implement `toString()` so that it:

- shows the holder and expiry,
- masks the card number as `**** **** **** 1234`,
- never shows the CVV,
- is safe if `holderName` is `null`.

````hint title="Hint"
`cardNumber.substring(cardNumber.length() - 4)` gives the last four digits. `Objects.toString(holderName, "<unknown>")` handles null.
````

````solution title="Solution"
```java title="BankCardDemo.java" file="BankCardDemo.java"
import java.time.YearMonth;
import java.util.Objects;

public class BankCardDemo {
    public static void main(String[] args) {
        System.out.println(new BankCard("Ada Lovelace", "4111111111111234", YearMonth.of(2028, 4), "123"));
        System.out.println(new BankCard(null, "5500000000009876", YearMonth.of(2027, 12), "999"));
    }
}

final class BankCard {
    private final String holderName;
    private final String cardNumber;
    private final YearMonth expiry;
    private final String cvv;

    BankCard(String holderName, String cardNumber, YearMonth expiry, String cvv) {
        if (cardNumber == null || !cardNumber.matches("\\d{16}")) {
            throw new IllegalArgumentException("card number must be 16 digits");
        }
        this.holderName = holderName;
        this.cardNumber = cardNumber;
        this.expiry = expiry;
        this.cvv = cvv;
    }

    @Override
    public String toString() {
        String last4 = cardNumber.substring(cardNumber.length() - 4);
        return "BankCard{holder=" + Objects.toString(holderName, "<unknown>")
                + ", number=**** **** **** " + last4
                + ", expiry=" + expiry + "}";                 // cvv deliberately omitted
    }

    boolean cvvMatches(String attempt) {
        return cvv.equals(attempt);
    }
}
```

```text title="Output" output="BankCardDemo.java"
BankCard{holder=Ada Lovelace, number=**** **** **** 1234, expiry=2028-04}
BankCard{holder=<unknown>, number=**** **** **** 9876, expiry=2027-12}
```
````

## Knowledge check

```quiz
? What does `Object.toString()` return by default?
+ The class name, "@", and the hex identity hash code
- The object's memory address
- All field values
> getClass().getName() + "@" + Integer.toHexString(hashCode()).

? Which Object methods are final?
+ getClass, wait, notify, notifyAll
- equals and hashCode
- toString
> They can't be overridden; equals/hashCode/toString can.

? `String s = "x" + obj;` where obj is null. What happens?
+ s is "xnull"
- NullPointerException
- s is "x"
> Concatenation uses String.valueOf, which handles null.

? What should replace finalize() for closing a file?
+ try-with-resources
- System.gc()
- Overriding finalize more carefully
> Deterministic clean-up beats GC-dependent clean-up.
```

## Key takeaways

- Every object inherits `equals`, `hashCode`, `toString`, `getClass`, `clone`, `wait`/`notify*` (and deprecated `finalize`).
- Override **`toString`**: useful, cheap, no secrets, no recursion; records do it for you.
- The default `hashCode` is an **identity hash stored in the header**, not an address.
- `getClass()` is the exact run-time class; `instanceof` includes subclasses.
- Don't use `finalize`; use **try-with-resources** (and `Cleaner` as a safety net).
