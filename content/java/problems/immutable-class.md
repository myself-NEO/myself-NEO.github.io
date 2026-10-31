## Problem statement

A payroll service has an `Employee` class that's shared between threads and used as a key in caches. It's **mutable in five different ways**:
- callers can change the `Date` they passed in, or the one they got back;
- they can change the skills list they passed in, or the one returned;
- there are setters.

Bugs have appeared: employees changing their join date, cache entries going missing, and a report thread seeing half-updated objects.

Make `Employee` **truly immutable** while keeping this API:

| Member | Contract |
|---|---|
| `Employee(String name, Date joinedOn, List<String> skills)` | rejects a blank name (`IllegalArgumentException("name must not be blank")`), a `null` date or list, and `null` skills (`NullPointerException`) |
| `String name()` | the name |
| `Date joinedOn()` | the join date. Callers may modify what they get without affecting the employee |
| `List<String> skills()` | the skills, in the given order. The returned list can't be modified |
| `Employee withSkill(String skill)` | returns a **new** employee with the skill appended. The original is unchanged |
| `equals`/`hashCode`/`toString` | value-based. `toString` prints the date as an ISO instant (UTC) |

You can't change the parameter type `java.util.Date`: other modules still pass it. Don't use any libraries.

## Starter code

This is the current, leaky implementation, already shaped to the target API. Run it first: the demo shows every leak.

```java title="Employee.java" starter="true"
import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class Employee {
    private String name;
    private Date joinedOn;
    private List<String> skills;

    public Employee(String name, Date joinedOn, List<String> skills) {
        this.name = name;              // TODO: validate
        this.joinedOn = joinedOn;      // TODO: the caller still holds this Date
        this.skills = skills;          // TODO: the caller still holds this List
    }

    public String name() { return name; }
    public Date joinedOn() { return joinedOn; }          // TODO: leaks internal state
    public List<String> skills() { return skills; }      // TODO: leaks internal state

    public void setName(String name) { this.name = name; }   // TODO: immutable objects have no setters

    public Employee withSkill(String skill) {
        skills.add(skill);                               // TODO: must not modify this object
        return this;
    }

    // TODO: value-based equals, hashCode and toString

    public static void main(String[] args) {
        Date joined = Date.from(java.time.Instant.parse("2021-04-01T00:00:00Z"));
        List<String> skills = new ArrayList<>(List.of("java", "sql"));
        Employee ada = new Employee("Ada Lovelace", joined, skills);
        System.out.println("created: " + ada);

        joined.setTime(0);
        System.out.println("caller mutates the Date it passed in -> joinedOn " + ada.joinedOn().toInstant());
        ada.joinedOn().setTime(0);
        System.out.println("caller mutates the Date it got back -> joinedOn " + ada.joinedOn().toInstant());
        skills.add("hacking");
        System.out.println("caller mutates its skills list -> skills " + ada.skills());
        try {
            ada.skills().add("hacking");
            System.out.println("skills().add(\"hacking\") -> no exception: LEAK, skills " + ada.skills());
        } catch (UnsupportedOperationException e) {
            System.out.println("skills().add(\"hacking\") -> UnsupportedOperationException");
        }
        Employee withKotlin = ada.withSkill("kotlin");
        System.out.println("withSkill(\"kotlin\") -> " + withKotlin.skills() + "; original " + ada.skills()
                + ", same object: " + (withKotlin == ada));

        try {
            new Employee("  ", joined, List.of());
            System.out.println("blank name -> accepted: BUG");
        } catch (IllegalArgumentException e) {
            System.out.println("blank name -> IllegalArgumentException: " + e.getMessage());
        }
        try {
            new Employee("Bob", joined, java.util.Arrays.asList("java", null));
            System.out.println("null skill -> accepted: BUG");
        } catch (NullPointerException e) {
            System.out.println("null skill -> NullPointerException");
        }
        Date d = Date.from(java.time.Instant.parse("2020-01-01T00:00:00Z"));
        Employee a = new Employee("Cy", d, List.of("go"));
        Employee b = new Employee("Cy", new Date(d.getTime()), new ArrayList<>(List.of("go")));
        Set<Employee> set = new HashSet<>(List.of(a, b));
        System.out.println("equal copies: equals " + a.equals(b) + ", same hash " + (a.hashCode() == b.hashCode())
                + ", HashSet size " + set.size());
    }
}
```

## Hints

````hint title="Hint 1: the rules"
An immutable class needs five things:
1. a `final` class, so no subclass can add mutable state or override behaviour;
2. `private final` fields;
3. no setters, and no methods that modify state;
4. **defensive copies** of mutable inputs in the constructor;
5. **no leaked references**: copies or unmodifiable views from getters.

`String` is immutable, so it needs no copy. `Date` and `ArrayList` are mutable.
````

````hint title="Hint 2: copy first, then validate"
- Copy the inputs **before** validating them, and validate the copy. Otherwise another thread could change the argument between your check and your copy (a time-of-check/time-of-use bug).
- `new Date(joinedOn.getTime())` copies a date safely. Avoid `clone()`: a malicious `Date` subclass could override it.
- `List.copyOf(skills)` makes an unmodifiable copy and rejects `null` elements in one call.
````

````hint title="Hint 3: withers and equality"
- `withSkill` builds a new list (copy plus append) and calls the constructor, which validates and copies again.
- Base `equals` and `hashCode` on all three fields. `Date.equals` compares instants, and `List.equals` compares elements in order.
- For `toString`, use `joinedOn.toInstant()`, which prints in UTC regardless of the machine's time zone.
````

## Test cases

| Scenario | Expected |
|---|---|
| Change the `Date` passed to the constructor | `joinedOn()` unchanged |
| Change the `Date` returned by `joinedOn()` | the next `joinedOn()` call unchanged |
| Add to the list passed to the constructor | `skills()` unchanged |
| `skills().add(...)` | `UnsupportedOperationException` |
| `withSkill("kotlin")` | a new object with `[java, sql, kotlin]`; the original still `[java, sql]` |
| Name `"  "` | `IllegalArgumentException("name must not be blank")` |
| Skills `["java", null]` | `NullPointerException` |
| Two employees with equal values | `equals` true, same `hashCode`, one entry in a `HashSet` |
| Reflection check | the class is `final`, all fields are `private final`, there are no `set*` methods |

## Expected output

```text title="Expected output" output="Employee.java"
created: Employee[name=Ada Lovelace, joinedOn=2021-04-01T00:00:00Z, skills=[java, sql]]
caller mutates the Date it passed in -> joinedOn 2021-04-01T00:00:00Z
caller mutates the Date it got back -> joinedOn 2021-04-01T00:00:00Z
caller mutates its skills list -> skills [java, sql]
skills().add("hacking") -> UnsupportedOperationException
withSkill("kotlin") -> [java, sql, kotlin]; original [java, sql], same object: false
blank name -> IllegalArgumentException: name must not be blank
null skill -> NullPointerException
equal copies: equals true, same hash true, HashSet size 1
```

## Reference solution

````solution title="Reference solution (Employee.java)"
```java title="Employee.java" file="Employee.java"
import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

public final class Employee {                            // 1. final: no mutable subclasses
    private final String name;                           // 2. private final fields
    private final Date joinedOn;
    private final List<String> skills;

    public Employee(String name, Date joinedOn, List<String> skills) {
        // 4. copy first (so the caller can't change the values after validation), then validate the copies
        Date dateCopy = new Date(Objects.requireNonNull(joinedOn, "joinedOn").getTime());
        List<String> skillsCopy = List.copyOf(Objects.requireNonNull(skills, "skills"));   // NPE on null elements
        Objects.requireNonNull(name, "name");
        if (name.isBlank()) {
            throw new IllegalArgumentException("name must not be blank");
        }
        this.name = name;
        this.joinedOn = dateCopy;
        this.skills = skillsCopy;
    }

    public String name() {
        return name;                                     // String is immutable: safe to share
    }

    public Date joinedOn() {
        return new Date(joinedOn.getTime());             // 5. never hand out the internal Date
    }

    public List<String> skills() {
        return skills;                                   // already unmodifiable (List.copyOf)
    }

    public Employee withSkill(String skill) {            // 3. "modification" returns a new object
        List<String> more = new ArrayList<>(skills);
        more.add(Objects.requireNonNull(skill, "skill"));
        return new Employee(name, joinedOn, more);
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof Employee e && name.equals(e.name) && joinedOn.equals(e.joinedOn) && skills.equals(e.skills);
    }

    @Override
    public int hashCode() {
        return Objects.hash(name, joinedOn, skills);
    }

    @Override
    public String toString() {
        return "Employee[name=" + name + ", joinedOn=" + joinedOn.toInstant() + ", skills=" + skills + "]";
    }

    public static void main(String[] args) {
        Date joined = Date.from(java.time.Instant.parse("2021-04-01T00:00:00Z"));
        List<String> skills = new ArrayList<>(List.of("java", "sql"));
        Employee ada = new Employee("Ada Lovelace", joined, skills);
        System.out.println("created: " + ada);

        joined.setTime(0);
        System.out.println("caller mutates the Date it passed in -> joinedOn " + ada.joinedOn().toInstant());
        ada.joinedOn().setTime(0);
        System.out.println("caller mutates the Date it got back -> joinedOn " + ada.joinedOn().toInstant());
        skills.add("hacking");
        System.out.println("caller mutates its skills list -> skills " + ada.skills());
        try {
            ada.skills().add("hacking");
            System.out.println("skills().add(\"hacking\") -> no exception: LEAK, skills " + ada.skills());
        } catch (UnsupportedOperationException e) {
            System.out.println("skills().add(\"hacking\") -> UnsupportedOperationException");
        }
        Employee withKotlin = ada.withSkill("kotlin");
        System.out.println("withSkill(\"kotlin\") -> " + withKotlin.skills() + "; original " + ada.skills()
                + ", same object: " + (withKotlin == ada));

        try {
            new Employee("  ", joined, List.of());
            System.out.println("blank name -> accepted: BUG");
        } catch (IllegalArgumentException e) {
            System.out.println("blank name -> IllegalArgumentException: " + e.getMessage());
        }
        try {
            new Employee("Bob", joined, java.util.Arrays.asList("java", null));
            System.out.println("null skill -> accepted: BUG");
        } catch (NullPointerException e) {
            System.out.println("null skill -> NullPointerException");
        }
        Date d = Date.from(java.time.Instant.parse("2020-01-01T00:00:00Z"));
        Employee a = new Employee("Cy", d, List.of("go"));
        Employee b = new Employee("Cy", new Date(d.getTime()), new ArrayList<>(List.of("go")));
        Set<Employee> set = new HashSet<>(List.of(a, b));
        System.out.println("equal copies: equals " + a.equals(b) + ", same hash " + (a.hashCode() == b.hashCode())
                + ", HashSet size " + set.size());
    }
}
```

**A record version.** Records give you `final` fields, accessors, `equals`, `hashCode` and `toString` for free. You still need the defensive copies, in a compact constructor and an overridden accessor:

```java title="EmployeeRecord.java"
public record EmployeeRecord(String name, Date joinedOn, List<String> skills) {
    public EmployeeRecord {
        joinedOn = new Date(Objects.requireNonNull(joinedOn).getTime());   // reassigns the parameter
        skills = List.copyOf(skills);
        if (name.isBlank()) throw new IllegalArgumentException("name must not be blank");
    }

    @Override
    public Date joinedOn() {
        return new Date(joinedOn.getTime());                               // the generated accessor would leak it
    }
}
```
````

## Step-by-step explanation

````solution title="Step-by-step explanation"
1. **Declare the class `final`.** Otherwise a subclass could add setters or override `name()` to return something else, and code holding an `Employee` reference couldn't rely on immutability.
2. **Make every field `private final`.** `final` prevents reassignment after construction. It also gives a JMM guarantee: once the constructor finishes, any thread that sees the reference sees the fully initialised fields, with no synchronisation (*safe initialisation*). That fixes the half-updated objects the report thread saw.
3. **Copy mutable inputs first, then validate.** The caller still owns the `Date` and the `ArrayList` it passed. Storing them directly lets the caller change the employee later. `new Date(getTime())` and `List.copyOf` break the link. Copying *before* validation means the values you check are the values you keep, even if another thread mutates the argument concurrently.
4. **Choose a copy technique that is itself safe.**
   - `List.copyOf` returns an unmodifiable list, rejects `null` elements, and skips the copy if the input is already an unmodifiable list.
   - For `Date`, construct a new one from `getTime()` rather than calling `clone()`, which an untrusted subclass could override.
5. **Never return internal mutable state.** `joinedOn()` returns a fresh `Date` each time. `skills()` can return the field directly because it's already unmodifiable, so `add` throws `UnsupportedOperationException`.
6. **Replace setters with withers.** `withSkill` creates a new list and passes it through the constructor, reusing all its validation and copying. The original object never changes, which is what makes immutable objects safe to share and to use as map keys.
7. **Make equality value-based and consistent.** `equals` and `hashCode` use the same three fields. Because the fields never change, the hash code can't change while the object sits in a `HashSet` or `HashMap`. That's the cache bug fixed.
8. **Print deterministically.** `Date.toString()` uses the JVM's default time zone, so `toInstant()` gives the same text on every machine.
````

## Edge cases

- **A `Date` subclass** (for example a `java.sql.Timestamp`, or a malicious subclass) passed in. Copying via `getTime()` normalises it to a plain `Date`, and `Timestamp`'s nanoseconds are dropped. Document that if it matters.
- **`null` arguments**: `Objects.requireNonNull` with a parameter name gives a precise message.
- **`null` inside the list**: `List.copyOf` throws `NullPointerException`.
- **Empty skills** are valid (`List.of()`), and **duplicate skills** are kept as given. Use a `Set` if the domain says otherwise.
- **The caller passes an already immutable list** (`List.of(...)`): `List.copyOf` returns it as-is, with no wasted copy.
- **Serialization**: if `Employee` implemented `Serializable`, a crafted byte stream could bypass the constructor. You'd need `readObject` with defensive copies, or a serialization proxy.
- **Reflection** (`setAccessible` on a `final` field) can still break any Java class: immutability protects against mistakes, not against hostile code inside the JVM.
- **Prefer `java.time`** (`LocalDate`, `Instant` are immutable) in new code. The `Date` copy dance exists only because of legacy APIs.

## JUnit tests

```java title="EmployeeTest.java" file="EmployeeTest.java" test="Employee.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class EmployeeTest {
    private static final Instant JOINED = Instant.parse("2021-04-01T00:00:00Z");

    private static Employee ada(List<String> skills) {
        return new Employee("Ada", Date.from(JOINED), skills);
    }

    @Test
    void constructorCopiesTheDate() {
        Date date = Date.from(JOINED);
        Employee e = new Employee("Ada", date, List.of("java"));
        date.setTime(0);
        assertEquals(JOINED, e.joinedOn().toInstant());
    }

    @Test
    void getterReturnsACopyOfTheDate() {
        Employee e = ada(List.of("java"));
        e.joinedOn().setTime(0);
        assertEquals(JOINED, e.joinedOn().toInstant());
        assertNotSame(e.joinedOn(), e.joinedOn());
    }

    @Test
    void constructorCopiesTheList() {
        List<String> skills = new ArrayList<>(List.of("java", "sql"));
        Employee e = ada(skills);
        skills.add("hacking");
        assertEquals(List.of("java", "sql"), e.skills());
    }

    @Test
    void skillsCannotBeModified() {
        Employee e = ada(List.of("java"));
        assertThrows(UnsupportedOperationException.class, () -> e.skills().add("x"));
    }

    @Test
    void withSkillReturnsANewEmployee() {
        Employee e = ada(List.of("java", "sql"));
        Employee more = e.withSkill("kotlin");
        assertEquals(List.of("java", "sql", "kotlin"), more.skills());
        assertEquals(List.of("java", "sql"), e.skills());
        assertNotSame(e, more);
    }

    @Test
    void validatesArguments() {
        IllegalArgumentException blank = assertThrows(IllegalArgumentException.class,
                () -> new Employee(" ", Date.from(JOINED), List.of()));
        assertEquals("name must not be blank", blank.getMessage());
        assertThrows(NullPointerException.class, () -> new Employee(null, Date.from(JOINED), List.of()));
        assertThrows(NullPointerException.class, () -> new Employee("Ada", null, List.of()));
        assertThrows(NullPointerException.class, () -> new Employee("Ada", Date.from(JOINED), null));
        assertThrows(NullPointerException.class, () -> ada(Arrays.asList("java", null)));
    }

    @Test
    void valueBasedEqualityWorksInHashSets() {
        Employee a = ada(List.of("go"));
        Employee b = ada(new ArrayList<>(List.of("go")));
        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
        Set<Employee> set = new HashSet<>(List.of(a, b));
        assertEquals(1, set.size());
        assertFalse(a.equals(a.withSkill("rust")));
    }

    @Test
    void toStringIsTimeZoneIndependent() {
        assertEquals("Employee[name=Ada, joinedOn=2021-04-01T00:00:00Z, skills=[java]]", ada(List.of("java")).toString());
    }

    @Test
    void classIsStructurallyImmutable() {
        assertTrue(Modifier.isFinal(Employee.class.getModifiers()), "class must be final");
        for (Field f : Employee.class.getDeclaredFields()) {
            assertTrue(Modifier.isPrivate(f.getModifiers()) && Modifier.isFinal(f.getModifiers()), f.getName() + " must be private final");
        }
        for (Method m : Employee.class.getMethods()) {
            assertFalse(m.getName().startsWith("set"), "unexpected setter " + m.getName());
        }
    }
}
```
