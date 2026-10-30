# Object-Oriented Programming

### Can you override a static method?
`id: override-static` `level: beginner` `kind: concept` `tricky` `lessons: static-keyword,polymorphism-and-overriding`

#### Hints
1. How is a static method call resolved: by the object or by a type?
2. What happens when a subclass declares a static method with the same signature?

#### Answer
No. Static methods belong to the class and are bound at **compile time** (`invokestatic`) using the declared type or class name. A subclass static method with the same signature **hides** the parent's method; it doesn't override it. So:

```java
Parent p = new Child();
p.greet();          // Parent.greet() if greet is static — the object is ignored
```

`@Override` on a static method is a compile error, and an instance method can't override a static one (or vice versa) — that's also a compile error. Only instance methods take part in dynamic dispatch.

#### Why other answers fall short
- **"Yes, if the signatures match."** Matching signatures give *hiding*; the call is still chosen by the static type.
- **"No, static methods aren't inherited."** They are accessible through subclasses (`Child.parentStatic()` compiles); they just aren't polymorphic.

#### Follow-up
**What does `((Parent) null).greet()` do if `greet` is static?** It calls `Parent.greet()` normally — no `NullPointerException`, because the reference is only used for its type.

### Can constructors be inherited or overridden?
`id: constructors-inherited` `level: beginner` `kind: concept` `tricky` `lessons: constructors-and-this,inheritance`

#### Hints
1. Does a constructor have a return type or participate in dynamic dispatch?
2. What must every subclass constructor do first?

#### Answer
Neither. Constructors are **not members** that subclasses inherit, and they aren't virtual, so overriding doesn't apply. Each class declares its own constructors; each subclass constructor must invoke a superclass constructor (`super(...)`, or the implicit `super()`), which is how the parent's part of the object is initialised. Constructors **can** be overloaded within a class and chained with `this(...)`.

Consequence: if the parent has only `Parent(String name)`, a subclass without an explicit constructor won't compile — the generated default constructor calls `super()`, which doesn't exist.

#### Why other answers fall short
- **"Yes, a subclass gets the parent's constructors."** Then `new Child("x")` would work without declaring `Child(String)` — it doesn't.
- **"Overriding happens when the subclass declares the same parameter list."** That's just a separate constructor of the subclass that calls `super(...)`.

#### Follow-up
**Can a constructor be `private`? Why would it be?** Yes — for singletons, utility classes (no instances), and value classes that expose static factories (`Temperature.ofCelsius`).

### What does this print?
`id: overload-vs-override-output` `level: intermediate` `kind: output` `tricky` `lessons: polymorphism-and-overriding,methods`

```java
class A { String who(Object o) { return "A-Object"; } String who(String s) { return "A-String"; } }
class B extends A { @Override String who(Object o) { return "B-Object"; } }

A a = new B();
Object text = "hi";
System.out.println(a.who("hi") + " " + a.who(text) + " " + a.who(null));
```

#### Hints
1. Step one happens in `javac`: which overload does each call select, from **static** types?
2. Step two happens at run time: which class's implementation of *that* signature runs?

#### Answer
`A-String B-Object A-String`

- `a.who("hi")`: the static argument type is `String`, so the compiler picks `who(String)`. `B` doesn't override it → `A-String`.
- `a.who(text)`: static type `Object` → `who(Object)`; the object is a `B`, which overrides it → `B-Object`.
- `a.who(null)`: both overloads are applicable; `String` is more specific than `Object` → `who(String)` → `A-String`.

Overloading is resolved by **static types at compile time**; overriding by the **receiver's run-time class**.

#### Why other answers fall short
- **`B-Object` for the first call** — assumes overload selection looks at the run-time type of the receiver or argument.
- **`A-Object` for the second** — forgets that the selected signature is then dispatched dynamically.
- **"Compile error for `null`"** — it's ambiguous only when neither candidate is more specific (e.g. `String` vs `Integer`).

#### Follow-up
**Add `String who(Integer i)` to `A`. What happens to `a.who(null)`?** Compile error: `who(String)` and `who(Integer)` are both applicable and neither is more specific.

### What does this print?
`id: constructor-calls-override` `level: intermediate` `kind: output` `tricky` `lessons: object-initialization-order,polymorphism-and-overriding`

```java
class Base {
    Base() { print(); }
    void print() { System.out.println("Base"); }
}
class Derived extends Base {
    private final String name = "derived".toUpperCase();
    private int count = 5;
    @Override void print() { System.out.println(name + " " + count); }
}
new Derived();
```

#### Hints
1. When do `Derived`'s field initialisers run relative to `Base()`?
2. Does dynamic dispatch work while a superclass constructor is running?

#### Answer
`null 0`.

`new Derived()` zeroes all fields, then `Derived()` calls `super()` **before** its own field initialisers run. `Base()` calls `print()`, which dispatches to `Derived.print()` (dynamic dispatch works during construction) — but `name` and `count` still hold their defaults. Even the `final` field reads `null`.

The fix is design, not syntax: never call overridable methods from constructors; use a factory method or a separate initialisation step after construction.

#### Why other answers fall short
- **`DERIVED 5`** — assumes subclass initialisers run before the superclass constructor.
- **`Base`** — assumes dispatch is disabled during construction (true in C++, false in Java).
- **"Compile error: final field read before assignment"** — the compiler can't see through the virtual call.

#### Follow-up
**What if the field were `private final String name = "derived";`?** Then it prints `derived 0`. A `final` primitive or `String` field initialised with a constant expression is a *constant variable* (JLS 4.12.4); `javac` replaces every read of it with the literal, so `print()` never reads the still-`null` field. `count` isn't final, so it still prints `0`. (Verified on JDK 17: the literal version prints `derived 0`, the `toUpperCase()` version `null 0`.)

### Abstract class or interface?
`id: abstract-vs-interface` `level: beginner` `kind: concept` `lessons: interfaces,abstraction-and-abstract-classes`

#### Hints
1. Which one can hold per-object state and constructors?
2. How many of each can a class extend or implement?

#### Answer
| | Interface | Abstract class |
|---|---|---|
| State | no instance fields (constants only) | any fields |
| Constructors | no | yes |
| Methods | abstract, `default`, `static`, `private` | any, including `final` and `protected` |
| Multiplicity | a class implements many | a class extends one |
| Lambdas | yes, if functional | no |

Use an **interface** for a contract or capability that unrelated classes may provide, or that a class adds alongside others (`Comparable`, `PaymentGateway`). Use an **abstract class** to share state and implementation among closely related classes, typically as a template method with hooks. Many APIs offer both: `List` plus `AbstractList`.

#### Why other answers fall short
- **"Interfaces can't have method implementations."** Not since Java 8 (default and static methods) and Java 9 (private methods).
- **"Abstract classes are faster."** Dispatch cost is equivalent after JIT inlining; the choice is about design.

#### Follow-up
**Why can interfaces have multiple inheritance of behaviour but classes can't?** Interfaces carry no instance state, so there's no ambiguity about field copies or constructor order; conflicting defaults must be resolved explicitly by the class.

### Two interfaces provide the same default method. What happens?
`id: default-method-diamond` `level: intermediate` `kind: concept` `lessons: interfaces`

```java
interface Polite { default String hello() { return "Polite"; } }
interface Loud   { default String hello() { return "LOUD"; } }
class Robot implements Polite, Loud { }
```

#### Hints
1. Is either interface more specific than the other?
2. What syntax calls a specific interface's default method?

#### Answer
`Robot` **doesn't compile**: it inherits two unrelated defaults with the same signature. Java's resolution rules are: (1) a method from a class or superclass wins over any interface default; (2) otherwise the most specific sub-interface wins (if `Loud extends Polite`, `Loud`'s version is used); (3) otherwise the class must override and may delegate:

```java
class Robot implements Polite, Loud {
    @Override public String hello() { return Polite.super.hello() + " " + Loud.super.hello(); }
}
```

#### Why other answers fall short
- **"The first interface in the `implements` list wins."** Order is irrelevant.
- **"It throws at run time."** The conflict is detected at compile time.

#### Follow-up
**If `Robot extends Person` and `Person` has `public String hello()`, does it compile without an override?** Yes — rule 1, the class method wins.

### Why favour composition over inheritance?
`id: composition-over-inheritance` `level: intermediate` `kind: scenario` `lessons: composition-and-relationships,inheritance`

A teammate wants `class AuditedList<E> extends ArrayList<E>` that logs every element added, by overriding `add`. What problems do you point out and what do you propose?

#### Hints
1. Which other methods add elements, and how are they implemented internally?
2. What happens if a future JDK changes those internals?

#### Answer
Problems:

- **Incomplete interception**: `addAll`, `add(int, E)`, `set` and list iterators add or replace elements without necessarily calling `add(E)`.
- **Fragile base class**: correctness depends on `ArrayList`'s *internal* self-use (does `addAll` call `add`?). Overriding both can double-count (the classic `InstrumentedHashSet` bug); a JDK change can silently break it.
- **API leakage**: callers get every `ArrayList` method, including ones that bypass the audit.

Proposal: **composition** — a class (or decorator implementing `List<E>`/a narrower interface) that holds a private list and routes every mutation through one method that logs. It depends only on the public API, exposes exactly the operations you want, and can wrap *any* list implementation.

#### Why other answers fall short
- **"Inheritance is always bad."** It's right for genuine, substitutable is-a relationships with classes designed for extension (exception hierarchies, framework base classes).
- **"Just override all the add methods."** Still depends on undocumented self-use and breaks on JDK changes.

#### Follow-up
**Name a JDK class that got this wrong.** `Stack extends Vector` (exposes index-based mutation that breaks LIFO) and `Properties extends Hashtable<Object,Object>` (lets non-String entries in).

### Why must `equals` and `hashCode` be overridden together?
`id: equals-hashcode-together` `level: beginner` `kind: concept` `tricky` `lessons: equals-and-hashcode`

#### Hints
1. What's the hashCode contract for two objects that are `equals`?
2. In what order does a `HashMap` lookup use the two methods?

#### Answer
The contract: **if `a.equals(b)`, then `a.hashCode() == b.hashCode()`**. Hash-based collections first use `hashCode` to pick a bucket and only then call `equals` on entries in that bucket. Override `equals` alone and two equal objects keep different identity hash codes, land in different buckets, and `equals` is never even consulted: a `HashSet` stores "duplicates", `HashMap.get` returns `null` for an equal key, `remove` fails.

Override both, using the **same fields**; make those fields immutable (a key whose hash changes after insertion is lost). Records generate both for you; `javac -Xlint:overrides` warns when only `equals` is overridden.

#### Why other answers fall short
- **"For performance."** It's a correctness requirement; performance is about the *quality* of the hash.
- **"Because `equals` calls `hashCode`."** It doesn't; collections call both.
- **"Equal hash codes mean equal objects."** Collisions are allowed; the implication only goes one way.

#### Follow-up
**Is overriding `hashCode` without `equals` a bug?** Not a correctness bug — equality stays identity-based and the contract still holds — but it's pointless.

### How do you make a class immutable?
`id: immutable-class-rules` `level: intermediate` `kind: implementation` `lessons: immutable-classes,final-keyword`

#### Hints
1. What stops a subclass from adding mutable state?
2. What about a `List` or `Date` passed into the constructor, or returned from a getter?

#### Answer
1. Make the class **`final`** (or use a private constructor with static factories).
2. Make all fields **`private final`**; provide **no mutators** — "changes" return new instances (`withX(...)`).
3. **Copy mutable inputs first, then validate the copies** (avoids time-of-check/time-of-use races).
4. **Never expose mutable internals**: store unmodifiable copies (`List.copyOf`) or return copies (arrays, `Date`).
5. Don't let `this` escape during construction.

```java
public final class Team {
    private final String name;
    private final List<String> members;
    public Team(String name, List<String> members) {
        this.members = List.copyOf(members);          // copy (also rejects nulls)
        this.name = Objects.requireNonNull(name);
    }
    public List<String> members() { return members; } // unmodifiable: safe to return
    public Team withMember(String m) { var l = new ArrayList<>(members); l.add(m); return new Team(name, l); }
}
```

Records do steps 1–2 automatically; add a compact constructor for step 3–4.

#### Why other answers fall short
- **"Make all fields final."** A final reference to a mutable list is still mutable.
- **"Remove the setters."** Without final class and defensive copies, subclasses and shared inputs can still change state.

#### Follow-up
**Why are immutable objects thread-safe?** Nothing writes to them after construction, and `final` fields are guaranteed visible to all threads once the constructor completes (if `this` didn't escape).

### `final`, `finally`, `finalize` — and is a `final` list immutable?
`id: final-finally-finalize` `level: beginner` `kind: concept` `lessons: final-keyword,object-class-methods`

#### Hints
1. One is a modifier, one is a block, one is a method.
2. What exactly does `final` protect: the variable or the object?

#### Answer
- **`final`** — modifier: a final variable can't be reassigned, a final method can't be overridden, a final class can't be extended.
- **`finally`** — block after `try`/`catch` that always runs (except when the JVM halts), used for clean-up; prefer try-with-resources for resources.
- **`finalize()`** — `Object` method once called by the GC before reclaiming an object; unpredictable, slow, **deprecated for removal since Java 18**. Use try-with-resources or `Cleaner`.

A `final List<String> list = new ArrayList<>()` is **not** immutable: `list.add("x")` works. `final` protects the reference, not the object. Use `List.of`/`List.copyOf` for an unmodifiable list.

#### Why other answers fall short
- **"`finalize` is like a destructor."** C++ destructors run deterministically; `finalize` might never run.
- **"`final` makes the list read-only."** Only reassignment is prevented.

#### Follow-up
**Can a `finally` block change what a method returns?** Yes — a `return` in `finally` overrides the `try`'s return value (and even swallows a thrown exception). It's legal but a well-known anti-pattern.

### What's the difference between aggregation and composition?
`id: aggregation-vs-composition` `level: beginner` `kind: concept` `lessons: composition-and-relationships`

#### Hints
1. Who owns the part, and can it be shared?
2. What happens to the part when the whole goes away?

#### Answer
Both are "has-a" whole–part relationships:

- **Composition** — the whole **owns** the part: it creates it, doesn't share it, and the part's lifetime ends with the whole. `Order` → `OrderLine`, `House` → `Room`. In Java: created inside the owner, never exposed mutably (copies/read-only views).
- **Aggregation** — the whole **uses** parts that exist independently and can be shared. `Team` → `Player`, `Department` → `Employee`. In Java: parts created elsewhere and passed in.

Association is the weakest ("knows about"); inheritance is "is-a".

#### Why other answers fall short
- **"Composition uses a list, aggregation a single field."** Cardinality is unrelated.
- **"They're the same in Java."** The language has no keyword, but ownership and lifetime are expressed through who creates the part and whether references escape.

#### Follow-up
**How can a composition accidentally become an aggregation?** By returning the internal list of parts (or accepting externally created parts without copying), letting outsiders keep and share references to them.
