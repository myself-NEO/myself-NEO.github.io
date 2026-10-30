## Concept explanation

Every Java type is either a **primitive** (the eight from the previous lesson) or a **reference type**: classes, interfaces, enums, records, arrays and type variables. A variable of a reference type does not contain the object; it contains a **reference** — a value that lets the JVM find an object on the heap (or the special value `null`).

```java
int count = 3;                       // the variable holds 3
StringBuilder sb = new StringBuilder("hi");   // the variable holds a reference to a heap object
StringBuilder alias = sb;            // copies the reference: two variables, ONE object
alias.append("!");
System.out.println(sb);              // hi!  - both names see the change
```

### `==` versus `equals()`

- `==` on references compares **identity**: do both references point at the same object?
- `equals()` compares **logical equality** as defined by the class. `String`, `Integer`, `List`, records and most value-like classes override it; `Object.equals` falls back to identity.

### Java is always pass-by-value

When you call a method, each argument's **value is copied** into the parameter. For a reference type, the copied value is the reference. Consequences:

- The method **can mutate** the object the reference points to (both caller and callee see the same object).
- The method **cannot make the caller's variable point somewhere else**: reassigning the parameter only changes the local copy.

This is why "Java passes objects by reference" is wrong: it passes *references* by *value*.

### `null`

`null` is the absence of an object. Calling a method or reading a field through a `null` reference throws `NullPointerException`. Since Java 14, *helpful NullPointerExceptions* name the exact expression that was null (`Cannot invoke "String.length()" because "name" is null`).

## Internal working

- **Stack vs heap (HotSpot's picture).** Local variables (including references) live in the current thread's stack frame. Objects are allocated on the shared **heap** and stay there while they are **reachable** from GC roots; the garbage collector reclaims them afterwards. (With *escape analysis*, the JIT may avoid heap allocation for objects that never escape a method — an optimisation you can't observe.)
- **What a reference is.** The JVM specification leaves it abstract. In HotSpot it is a pointer to the object's start, usually stored as a 32-bit **compressed oop** on 64-bit JVMs with heaps under 32 GB.
- **Object header.** Every object begins with a header (mark word + class pointer) that holds its identity hash code, lock state and GC age, followed by its fields. `==` compares the references themselves, never the contents.
- **Assignment and argument passing** copy the reference bits; no object is copied unless you explicitly clone or construct one.
- **Arrays are objects** too: `int[] a` is a reference to a heap object containing a length and the elements.

## Visual representation

```text title="Two references, one object; reassignment inside a method"
  main() frame               Heap
  +----------------+         +-----------------------+
  | sb    ---------+-------->| StringBuilder "hi!"   |
  | alias ---------+-------->|                       |
  +----------------+         +-----------------------+

  rename(sb) frame           (parameter `b` is a COPY of the reference)
  +----------------+
  | b  ------------+-----> same StringBuilder        b.append(...)  -> caller sees it
  |                |
  | b = new ...  --+-----> a NEW StringBuilder       caller's `sb` is unchanged
  +----------------+
```

## Java code example

```java title="ReferencesDemo.java" file="ReferencesDemo.java"
import java.util.ArrayList;
import java.util.List;

public class ReferencesDemo {
    static void mutate(List<String> list) {
        list.add("added in mutate");            // changes the shared object
    }

    static void reassign(List<String> list) {
        list = new ArrayList<>();               // only the local copy now points elsewhere
        list.add("added to a new list");
    }

    static void increment(int n) {
        n++;                                    // primitives: the copy changes, caller doesn't
    }

    public static void main(String[] args) {
        List<String> items = new ArrayList<>();
        mutate(items);
        reassign(items);
        System.out.println("items = " + items);

        int count = 5;
        increment(count);
        System.out.println("count = " + count);

        String a = new String("java");
        String b = new String("java");
        System.out.println("a == b      : " + (a == b));         // different objects
        System.out.println("a.equals(b) : " + a.equals(b));      // same characters

        StringBuilder first = new StringBuilder("x");
        StringBuilder second = first;                            // alias
        second.append("y");
        System.out.println("first = " + first + ", same object: " + (first == second));

        int[] numbers = {1, 2, 3};
        int[] copy = numbers.clone();                            // a real copy
        copy[0] = 99;
        System.out.println("numbers[0] = " + numbers[0] + ", copy[0] = " + copy[0]);

        String missing = null;
        try {
            System.out.println(missing.length());
        } catch (NullPointerException e) {
            System.out.println("NPE: " + e.getMessage());
        }
    }
}
```

## Output

```text title="Output" output="ReferencesDemo.java"
items = [added in mutate]
count = 5
a == b      : false
a.equals(b) : true
first = xy, same object: true
numbers[0] = 1, copy[0] = 99
NPE: Cannot invoke "String.length()" because "missing" is null
```

- `mutate` changed the list the caller sees; `reassign` did not, because it only redirected its own copy of the reference.
- `increment` changed a copy of `5`.
- Two `new String("java")` calls create two objects: `==` is `false`, `equals` is `true`.
- `clone()` on an array creates a new array, so changing the copy leaves the original alone.
- The helpful NPE message (Java 14+) names the exact null expression. Local variable names appear because the class was compiled with debug information (`javac -g`, which IDEs and Maven/Gradle use by default); without it the message says `"<local7>"` instead.

## Real-world application

- **Defensive copies**: a class that stores a caller's `List` or `Date` keeps a reference to a mutable object the caller can still change. Immutable classes copy on the way in and out (see [immutable classes](lesson:immutable-classes)).
- **Caches and maps** store references: mutating an object after putting it in a `HashSet` can make it unfindable if its `hashCode` changes.
- **API design**: methods that mutate their arguments surprise callers; prefer returning new values or document mutation clearly.
- **Null handling** at system boundaries (deserialised JSON, database rows, optional config) is a major source of production NPEs; validate early with `Objects.requireNonNull` and use `Optional` for "maybe absent" return values.

## Common mistakes

- **Comparing strings or boxed numbers with `==`.** Use `equals` (or `Objects.equals(a, b)` when either might be null).
- **Believing a method can swap two caller variables.** `swap(a, b)` that reassigns parameters does nothing for the caller.
- **Assuming assignment copies an object.** `List<String> backup = list;` is an alias, not a backup.
- **Returning internal mutable state** (`return this.items;`) and letting callers modify it.
- **Calling methods on possibly-null references**, especially results of `Map.get`.

## Interview questions

**Q1. Is Java pass-by-value or pass-by-reference?**

````reveal title="Answer"
Always pass-by-value. For primitives the value is the number; for objects the value is the **reference**. The callee can mutate the object through its copy of the reference, but reassigning the parameter never affects the caller's variable. A true pass-by-reference language (C++ `&`, C# `ref`) would let the callee rebind the caller's variable.
````

**Q2. What is the difference between `==` and `equals()`?**

````reveal title="Answer"
For references, `==` checks whether two references point to the same object (identity). `equals()` checks logical equality as defined by the class; `Object`'s default implementation is identity, while `String`, wrappers, collections and records compare contents. For primitives, `==` compares values.
````

**Q3. Where are objects and references stored?**

````reveal title="Answer"
Conceptually, objects live on the heap and references held in local variables live in the thread's stack frame; references held in fields live inside their containing object on the heap; static references live with the class. HotSpot's JIT can scalar-replace objects that don't escape a method, so "always on the heap" is the model, not a guarantee about machine code.
````

**Q4. What does this print? `String s = "a"; change(s); System.out.println(s);` where `change(String x) { x = x + "b"; }`**

````reveal title="Answer"
`a`. The method builds a new string and points its local parameter at it; strings are immutable, and the caller's reference still points at `"a"`.
````

## Hands-on exercise

Write a `Wallet` class with a `long balance` field. Then write two static methods:

- `topUp(Wallet w, long amount)` that adds to the balance, and
- `replace(Wallet w)` that assigns `w = new Wallet()` and sets a balance of 1,000.

Predict what `main` prints after calling both on the same wallet, then run it.

````hint title="Hint"
One method changes the object the reference points to; the other only changes its own copy of the reference.
````

````solution title="Solution"
```java title="WalletDemo.java" file="WalletDemo.java"
public class WalletDemo {
    static class Wallet {
        long balance;
    }

    static void topUp(Wallet w, long amount) {
        w.balance += amount;          // visible to the caller: same object
    }

    static void replace(Wallet w) {
        w = new Wallet();             // local copy now refers to a new object
        w.balance = 1_000;
    }

    public static void main(String[] args) {
        Wallet mine = new Wallet();
        topUp(mine, 250);
        replace(mine);
        System.out.println("balance = " + mine.balance);
    }
}
```

```text title="Output" output="WalletDemo.java"
balance = 250
```
````

## Knowledge check

```quiz
? `List<String> b = a; b.add("x");` — what happens to `a`?
+ It contains "x": a and b refer to the same list
- Nothing: b is a copy
- Compile error
> Assignment copies the reference, not the object.

? Which comparison should you use to check whether two String variables hold the same text?
- `s1 == s2`
+ `s1.equals(s2)` (or `Objects.equals(s1, s2)` if either may be null)
- `s1.hashCode() == s2.hashCode()`
> == checks identity; equal hash codes don't imply equal strings.

? A method receives an object reference and assigns `param = null`. What does the caller see?
- Its variable becomes null
+ Nothing changes for the caller's variable
- NullPointerException
> The parameter is a copy of the reference.

? What does a reference variable of a class type hold?
- The object's fields
+ A value that locates an object on the heap (or null)
- A copy of the object
> Objects are only reached through references.
```

## Key takeaways

- Reference variables hold **references**, not objects; assignment copies the reference (**aliasing**).
- Java is **always pass-by-value**; for objects, the value passed is the reference.
- `==` is **identity**, `equals()` is **logical equality**; compare strings and boxed numbers with `equals`.
- Objects live on the **heap** while reachable; locals live in **stack frames**.
- `null` dereferences throw `NullPointerException`; Java 14+ messages name the culprit.
