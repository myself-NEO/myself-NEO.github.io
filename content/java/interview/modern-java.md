# Java 8+ Features

### What does this compile to, and does it compile at all?
`id: var-diamond-object` `level: beginner` `kind: output` `tricky` `lessons: var-text-blocks-switch`

```java
var list = new ArrayList<>();
list.add(1);
list.add("two");
System.out.println(list);
```

#### Hints
1. Where does the diamond `<>` normally get its type argument from?
2. What target type is there when the variable is declared with `var`?

#### Answer
It compiles and prints `[1, two]`. With `var` there's no declared target type for the diamond to infer from, so `new ArrayList<>()` becomes **`ArrayList<Object>`**, and anything can be added. The type safety you expected from generics is gone, without any warning.

Write `var list = new ArrayList<String>();` or `List<String> list = new ArrayList<>();`.

#### Why other answers fall short
- **"Compile error: cannot infer type."** Inference succeeds, with `Object`.
- **"`var` makes the list dynamically typed."** The type is static and fixed at compile time; it's just `ArrayList<Object>`.

#### Follow-up
**Where is `var` not allowed?** Without an initializer (`var x;`), with `null`, array initializers or lambdas as initializers, in compound declarations (`var a = 1, b = 2;`), and for fields, method parameters and return types.

### Switch expressions: what do arrow labels, `yield` and exhaustiveness give you?
`id: switch-expression-basics` `level: beginner` `kind: concept` `lessons: var-text-blocks-switch`

#### Hints
1. What happens in an old `switch` when you forget `break`?
2. How does a block inside a switch expression produce its value?

#### Answer
Switch expressions (final in Java 14):
- produce a **value**: `String label = switch (status) { ... };`
- use **arrow labels** that never fall through, which removes the forgotten-`break` bug class;
- allow **several labels per case**: `case SATURDAY, SUNDAY -> true;`
- use **`yield`** to produce a value from a block body: `case X -> { log(); yield 42; }` (`return` would leave the method);
- must be **exhaustive**: every enum constant (or permitted sealed subtype) listed, or a `default`.

A branch may also throw: `default -> throw new IllegalArgumentException(...)`.

#### Why other answers fall short
- **"It's just new syntax for the same switch."** The expression form adds values, exhaustiveness checking and no fall-through.
- **"`yield` is like `return`."** `yield` produces the switch's value; `return` exits the enclosing method.

#### Follow-up
**Why leave out `default` in an enum switch expression?** Then adding a constant to the enum makes the switch fail to compile, which points you to every place that must handle it.

### An enum gains a new constant and is recompiled, but the class with the switch isn't. What happens at run time?
`id: enum-switch-new-constant` `level: advanced` `kind: internals` `tricky` `lessons: var-text-blocks-switch,sealed-classes-and-pattern-matching`

```java
enum Color { RED, GREEN }            // later recompiled as { RED, GREEN, BLUE }

static String name(Color c) {
    return switch (c) {              // exhaustive for RED and GREEN, no default
        case RED -> "red";
        case GREEN -> "green";
    };
}
```

#### Hints
1. Does `javac` really trust that an exhaustive switch can never meet an unknown value?
2. What could separate compilation break?

#### Answer
`name(Color.BLUE)` throws, rather than returning `null` or skipping. For exhaustive switch expressions, `javac` adds a **hidden default branch**:
- compiled for **Java 21+**: it throws **`MatchException`**;
- compiled for Java 14–20 (for example `--release 17`): it throws **`IncompatibleClassChangeError`**.

Both behaviours were confirmed by compiling the switch against the two-constant enum, recompiling only the enum with `BLUE`, and running. The same applies to pattern switches over sealed hierarchies when a new permitted subtype appears.

#### Why other answers fall short
- **"It returns null."** Switch expressions never silently produce no value.
- **"It won't compile."** That's true only if the switch's class is recompiled; this is about stale binaries.

#### Follow-up
**And an old-style `switch` *statement* over the enum without `default`?** Statements needn't be exhaustive, so an unknown constant just matches no case and execution continues after the switch.

### What does this print? (Dots show spaces.)
`id: text-block-indentation` `level: intermediate` `kind: output` `tricky` `lessons: var-text-blocks-switch`

```java
String s = """
        Hello
          World
      """;
System.out.print(s.replace(' ', '.'));
```

The content lines are indented by 8 and 10 spaces, and the closing `"""` by 6.

#### Hints
1. Which lines take part in computing the indentation to remove?
2. Does the closing delimiter's line count?

#### Answer
```text
..Hello
....World
```

The compiler strips the **minimum indentation** over the content lines *and* the closing delimiter's line: min(8, 10, 6) = 6. That leaves two spaces before `Hello` and four before `World`. The closing delimiter on its own line also means the string ends with a newline.

#### Why other answers fall short
- **"Hello / ..World"**: that ignores the closing delimiter, which is exactly what lets you keep indentation on purpose.
- **"The source indentation is kept as is."** Incidental indentation is always removed.

#### Follow-up
**How do you keep a trailing space, or join two lines?** `\s` produces a space that survives trailing-whitespace stripping, and a `\` at the end of a line joins it with the next.

### Are records immutable?
`id: records-shallow-immutability` `level: intermediate` `kind: concept` `tricky` `lessons: records,immutable-classes`

#### Hints
1. What are the component fields declared as?
2. What if a component is a `List`?

#### Answer
**Shallowly.** The compiler generates `private final` fields, a canonical constructor and accessors, with no setters, so a record's *references* can't change. But a mutable component, such as a `List`, an array or a `Date`, can still be modified through the accessor or through the caller's original reference.

For real immutability, copy defensively in the compact constructor and use immutable types:

```java
record Team(String name, List<String> members) {
    Team {
        members = List.copyOf(members);   // unmodifiable, decoupled from the caller's list
    }
}
```

#### Why other answers fall short
- **"Yes, records are immutable."** Only the fields are final; the objects they point to are not protected.
- **"No, because you can override accessors."** Accessors can't change the fields; that isn't the issue.

#### Follow-up
**Why can't records declare extra instance fields?** A record's state is defined to be exactly its components: that's what makes the generated `equals`, `hashCode`, `toString` and deserialization correct. Only static fields may be added.

### What does this print?
`id: record-array-component` `level: intermediate` `kind: output` `tricky` `lessons: records`

```java
record Samples(int[] values) { }

System.out.println(new Samples(new int[] {1, 2}).equals(new Samples(new int[] {1, 2})));
```

#### Hints
1. How does the generated `equals` compare reference-type components?
2. Do arrays override `equals`?

#### Answer
`false`. A record's generated `equals` compares reference components with `Objects.equals`, which calls the component's own `equals`. Arrays inherit `Object.equals` (identity), so two records holding equal but distinct arrays are not equal, and their `hashCode`s differ too. `toString` would print something like `Samples[values=[I@1b6d3586]`.

Fix: use `List<Integer>` (value-based equality), or override `equals`, `hashCode` and `toString` with `Arrays.equals`, `Arrays.hashCode` and `Arrays.toString`, and clone the array in the constructor and accessor.

#### Why other answers fall short
- **"true, records compare all components by value."** They do, but "by value" means `equals`, which for arrays is identity.

#### Follow-up
**And for `record R(double d)`, is `new R(0.0).equals(new R(-0.0))`?** `false`. Primitive components are compared like `Double.compare`, so `0.0` and `-0.0` differ, while `NaN` equals `NaN`. That's the opposite of `==` in both cases.

### What does this print?
`id: record-accessor-override` `level: advanced` `kind: output` `tricky` `lessons: records`

```java
record Temperature(double celsius) {
    @Override
    public double celsius() {
        return Math.round(celsius * 10) / 10.0;
    }
}

Temperature t = new Temperature(21.4567);
System.out.println(t.celsius() + " " + t);
```

#### Hints
1. What does the generated `toString` read: the field or the accessor?
2. How are `toString`, `equals` and `hashCode` generated for records?

#### Answer
```text
21.5 Temperature[celsius=21.4567]
```

The overridden accessor rounds, but the generated `toString`, `equals` and `hashCode` are built (via `invokedynamic` and `ObjectMethods`) from the **fields**, not the accessor methods. Two temperatures that both "read" as 21.5 through the accessor aren't `equals` unless their stored values match.

Normalise in the compact constructor instead (`celsius = Math.round(celsius * 10) / 10.0;`), so that the stored value, the accessor and the generated members all agree.

#### Why other answers fall short
- **"21.5 Temperature[celsius=21.5]."** That assumes `toString` calls the accessor.
- **"Compile error: accessors can't be overridden."** They can, as long as they're `public` with the same return type.

#### Follow-up
**What rules apply to an overridden accessor?** It must be `public`, have the component's exact return type, take no parameters, and throw no checked exceptions.

### Why would you make a type `sealed`?
`id: sealed-why` `level: intermediate` `kind: concept` `lessons: sealed-classes-and-pattern-matching`

#### Hints
1. What does a `switch` over an open interface always need?
2. What must every permitted subclass declare?

#### Answer
A `sealed` class or interface lists its permitted direct subtypes (`sealed interface Shape permits Circle, Square, Polygon`). Each subtype must be `final`, `sealed` or `non-sealed`, and live in the same module (or package). Benefits:
- **Exhaustive pattern matching**: a `switch` over the sealed type that covers every subtype needs no `default`, and adding a subtype makes every incomplete switch a compile error.
- **Domain modelling**: together with records you get algebraic data types (`PaymentResult = Approved | Declined | Pending`).
- **Protection**: no unknown implementations, which the JVM enforces at class loading.
- **Documentation**: the complete set of cases is visible in one place.

#### Why other answers fall short
- **"It's like `final`."** `final` allows no subclasses; `sealed` allows a fixed list of them.
- **"It's a security feature for libraries."** That's a side effect; the main win is compiler-checked exhaustiveness.

#### Follow-up
**What does `non-sealed` do?** It re-opens one branch, so anyone may extend that subtype. Switches then need a case for the non-sealed type itself, which covers all its unknown subclasses.

### Why doesn't this compile?
`id: pattern-dominance` `level: intermediate` `kind: debugging` `tricky` `lessons: sealed-classes-and-pattern-matching`

```java
static String f(Object o) {
    return switch (o) {
        case CharSequence cs -> "chars";
        case String s -> "string";
        default -> "other";
    };
}

static String g(Object o) {
    return switch (o) {
        case Integer i -> "int";
        case Integer i when i > 10 -> "big";
        default -> "other";
    };
}
```

#### Hints
1. Can any `String` reach the second case?
2. Can an `Integer` greater than 10 reach the guarded case?

#### Answer
Both switches fail with `error: this case label is dominated by a preceding case label`. Every `String` is a `CharSequence`, so `case String s` is unreachable after `case CharSequence cs`. In `g`, the unguarded `case Integer i` matches every `Integer`, so the guarded case can never run.

Order cases from **specific to general**, and put **guarded cases before** the unguarded case for the same type:

```java
case String s -> "string";
case CharSequence cs -> "chars";

case Integer i when i > 10 -> "big";
case Integer i -> "int";
```

#### Why other answers fall short
- **"Cases are tried in order, so it compiles and returns `chars`."** Unreachable patterns are rejected at compile time, unlike old-style `case` constants.
- **"Guards can't be combined with plain type patterns."** They can; the order is the problem.

#### Follow-up
**Does a guarded case count toward exhaustiveness?** No. Because the guard may be false, you still need an unguarded case (or `default`) for that type.

### How does Java's release cadence work, and what is a preview feature?
`id: release-cadence-preview` `level: beginner` `kind: concept` `lessons: java-version-history`

#### Hints
1. How often is a feature release shipped, and in which months?
2. Which versions do most companies run in production?

#### Answer
Since Java 10 (2018), a **feature release ships every six months**, in March and September, with whatever is ready. Most releases receive updates for about six months. **LTS** releases, **8, 11, 17, 21 and 25** so far, get years of support from vendors and are what most production systems run. LTS came every 3 years until 17, and every 2 years since, so the next is planned for 29.

A **preview feature** is complete and specified but not yet permanent:
- it needs `--enable-preview` together with `--release N` when compiling, and `--enable-preview` when running;
- it runs only on that exact release;
- it may change or be withdrawn, as string templates were after 22.

**Incubator** modules (`jdk.incubator.*`) do the same for APIs.

#### Why other answers fall short
- **"Every release is LTS."** Only selected ones are.
- **"Preview means beta quality."** Previews are fully implemented; what isn't final is the *design*.

#### Follow-up
**What does `UnsupportedClassVersionError: class file version 65.0` mean on a Java 17 runtime?** The class was compiled for Java 21 (class-file version 65); Java 17 understands up to 61. Run it on a newer JVM, or compile with `--release 17`.

### You're upgrading a Spring service from Java 8 to 17. What will break, and how do you approach it?
`id: upgrade-8-to-17` `level: advanced` `kind: scenario` `lessons: java-version-history`

#### Hints
1. Which modules were removed from the JDK in Java 11?
2. What changed for reflection into JDK internals in 16 and 17?

#### Answer
Typical breakages:
- **Removed Java EE and CORBA modules** (11): JAXB, JAX-WS, `javax.annotation`, `javax.activation`. Add them as explicit dependencies (Jakarta artefacts).
- **Strong encapsulation** (16/17): reflective access to JDK internals throws `InaccessibleObjectException`. Old versions of Lombok, Mockito, ByteBuddy, cglib, Hibernate and Spring 4 often do this.
- **Removed or internal APIs**: `sun.misc.BASE64Encoder` (use `java.util.Base64`), Nashorn (removed in 15).
- **Build tooling**: old Maven and Gradle plugins, ASM-based tools that can't read new class files.
- **Behaviour changes**: the default GC changed to G1 (9), and the class loader hierarchy changed (the app class loader is no longer a `URLClassLoader`).

Approach:
1. Run `jdeps --jdk-internals` and `jdeprscan`.
2. Upgrade build plugins and libraries first, ideally to versions that support both JDKs.
3. Run CI on JDK 17 while still targeting 8 (`--release 8`).
4. Add temporary `--add-opens` flags only where unavoidable, and document them.
5. Switch the runtime, then the language level.
6. Plan Spring Boot 3 separately: it requires 17+ and moves from `javax.*` to `jakarta.*`.

#### Why other answers fall short
- **"Just change the JDK; Java is backward compatible."** The language is, but removed modules and encapsulation break real applications.
- **"Add `--illegal-access=permit`."** That option no longer exists in 17.

#### Follow-up
**What do you gain after the upgrade?** Records, text blocks, switch expressions, `var`, helpful NPEs, better GCs (G1 improvements, ZGC), container awareness, and a supported runtime. It also opens the path to 21's virtual threads.

### What does this print on Java 25, and what would the classic Java 21 version print?
`id: flexible-constructor-bodies` `level: advanced` `kind: output` `tricky` `lessons: java-21-to-25-features,object-initialization-order`

```java
class Account {
    Account() { System.out.println("sees " + describe()); }
    String describe() { return "account"; }
}

class Savings extends Account {
    private final double rate;

    Savings(double rate) {
        if (rate < 0) throw new IllegalArgumentException("negative rate");
        this.rate = rate;          // Java 25: allowed before super()
        super();
    }

    @Override
    String describe() { return "savings at " + rate; }
}

new Savings(0.03);
```

#### Hints
1. In Java 21, where must `super()` be, and when are subclass fields assigned?
2. What may a Java 25 constructor do before calling `super(...)`?

#### Answer
On **Java 25**, it prints `sees savings at 0.03`. Flexible constructor bodies (JEP 513) allow a **prologue** before `super(...)`: validating arguments and **assigning the class's own fields**. By the time `Account()` calls the overridden `describe()`, `rate` is already set.

The classic version, with `super()` first and `this.rate = rate` after it (required before Java 25), prints `sees savings at 0.0`. The superclass constructor runs before the subclass's field assignments, so the override sees the default value. That's the long-standing "don't call overridable methods from constructors" trap.

The prologue still can't *read* fields, call instance methods, or pass `this` anywhere.

#### Why other answers fall short
- **"Compile error: `super()` must be the first statement."** That was the rule until Java 25.
- **"0.03 on both versions."** Without the prologue, the field isn't assigned yet when the superclass constructor runs.

#### Follow-up
**Is calling overridable methods from constructors now fine?** It's safer when the subclass initialises its fields in the prologue, but other subclasses might not. Keep constructors simple and prefer final or private helper methods.

### What problem do Java 21's sequenced collections solve?
`id: sequenced-collections` `level: intermediate` `kind: concept` `lessons: java-21-to-25-features`

#### Hints
1. How did you get the last element of a `List`, a `Deque` and a `LinkedHashSet` before Java 21?
2. What does `reversed()` return?

#### Answer
Ordered collections had no common API for their ends:
- lists: `list.get(list.size() - 1)`;
- deques: `deque.getLast()`;
- sorted sets: `sortedSet.last()`;
- `LinkedHashSet`: iterate to the end;
- `LinkedHashMap`: iterate the entry set.

Java 21 adds three interfaces, retrofitted with default methods:
- **`SequencedCollection`** (`List`, `Deque`, `LinkedHashSet`, `SortedSet`): `getFirst`, `getLast`, `addFirst`, `addLast`, `removeFirst`, `removeLast` and `reversed`;
- **`SequencedSet`**;
- **`SequencedMap`** (`LinkedHashMap`, `SortedMap`): `firstEntry`, `lastEntry`, `pollFirstEntry`, `putFirst`, `putLast`, `reversed` and sequenced views of keys, values and entries.

Points to remember:
- `reversed()` is a **live view**.
- `putLast` and `addFirst` **move** existing entries in linked collections.
- Sorted collections reject `addFirst`/`addLast` with `UnsupportedOperationException`.
- `getFirst()` on an empty collection throws `NoSuchElementException`.

#### Why other answers fall short
- **"They're new collection classes."** They're new *interfaces* over the existing classes.
- **"`reversed()` copies the list."** It's a view: writes go through to the original.

#### Follow-up
**How would you build an LRU cache with these methods?** A `LinkedHashMap` where each access does `putLast(key, value)` (moving the key to the end), and eviction does `pollFirstEntry()` when the size exceeds the limit. Alternatively, use the access-order constructor and `removeEldestEntry`.
