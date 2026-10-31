## Problem statement

The user service keeps users in a `HashSet<User>` (to deduplicate sign-ups) and in a `HashMap<User, String>` (user → plan). Production has three bug reports:

1. **"Duplicate accounts"**: `ada@example.com` and `ADA@example.com` both appear in the set, although emails are case-insensitive.
2. **"Lost plan"**: after a user logs in, `plans.get(user)` returns `null`, and `plans.containsKey(user)` is `false`, for the very same object that was used to `put`.
3. **"contains() lies"**: `users.contains(new User("ada@example.com", "Ada"))` on an `ArrayList` returns `false` even though an equal user is in the list.

Find the root causes in `User`, fix them, and make sure the class now follows the `equals`/`hashCode` contract.

**Specification**: two users are equal if and only if their emails are equal **ignoring case** (in `Locale.ROOT`). The display name and the login counter are **not** part of a user's identity. `email()` still returns the email as it was given.

## Starter code

```java title="User.java" starter="true"
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public class User {
    private final String email;
    private final String name;
    private int loginCount;

    public User(String email, String name) {
        this.email = Objects.requireNonNull(email);
        this.name = Objects.requireNonNull(name);
    }

    public String email() { return email; }
    public String name() { return name; }
    public int loginCount() { return loginCount; }
    public void recordLogin() { loginCount++; }

    public boolean equals(User other) {
        return other != null && email.equalsIgnoreCase(other.email);
    }

    @Override
    public int hashCode() {
        return Objects.hash(email, loginCount);
    }

    @Override
    public String toString() {
        return "User[" + email + "]";
    }

    public static void main(String[] args) {
        Set<User> signups = new HashSet<>();
        signups.add(new User("ada@example.com", "Ada"));
        signups.add(new User("ADA@example.com", "Ada L."));
        System.out.println("HashSet with ada@example.com and ADA@example.com -> size " + signups.size());

        List<User> list = new ArrayList<>(List.of(new User("ada@example.com", "Ada")));
        System.out.println("ArrayList.contains(equal user) -> " + list.contains(new User("ada@example.com", "Ada")));

        Map<User, String> plans = new HashMap<>();
        User bob = new User("bob@example.com", "Bob");
        plans.put(bob, "premium");
        bob.recordLogin();
        System.out.println("HashMap.get(same object) after recordLogin() -> " + plans.get(bob) + ", containsKey " + plans.containsKey(bob));

        Object a = new User("cy@example.com", "Cy");
        Object b = new User("CY@EXAMPLE.COM", "Cyrus");
        System.out.println("equals via Object references -> " + a.equals(b) + ", hashCodes equal -> " + (a.hashCode() == b.hashCode()));
        System.out.println("equals(null) -> " + a.equals(null) + ", equals(\"cy@example.com\") -> " + a.equals("cy@example.com"));
        System.out.println("email() keeps the original text -> " + ((User) b).email());
    }
}
```

## Hints

````hint title="Hint 1: which equals does HashSet call?"
`HashSet`, `HashMap` and `ArrayList.contains` call `equals(Object)`. Look at the signature of the starter's `equals`: what happens if you put `@Override` on it?
````

````hint title="Hint 2: the hashCode contract"
- **Equal objects must have equal hash codes.** Is `"ada@example.com".hashCode() == "ADA@example.com".hashCode()`?
- A key's hash code must also **not change while it's in a hash-based collection**. Which field in `hashCode` changes on every login?
````

````hint title="Hint 3: one normalised key"
Compute a normalised key once in the constructor, `email.toLowerCase(Locale.ROOT)`, and use only that key in both `equals` and `hashCode`. That keeps them consistent with each other and immutable. Keep the original `email` for display.
````

## Test cases

| Scenario | Expected |
|---|---|
| Add `ada@example.com` and `ADA@example.com` to a `HashSet` | size 1 |
| `ArrayList.contains(new User("ada@example.com", ...))` | `true` |
| `put(user, "premium")`, then `user.recordLogin()`, then `get(user)` | `"premium"`, and `containsKey` is `true` |
| `equals` through `Object` references, different case and names | `true`, same `hashCode` |
| `equals(null)`, `equals("a string")` | `false`, `false` |
| `email()` of `CY@EXAMPLE.COM` | `CY@EXAMPLE.COM` (original kept) |
| Reflection | `equals(Object)` is declared by `User` |

## Expected output

```text title="Expected output" output="User.java"
HashSet with ada@example.com and ADA@example.com -> size 1
ArrayList.contains(equal user) -> true
HashMap.get(same object) after recordLogin() -> premium, containsKey true
equals via Object references -> true, hashCodes equal -> true
equals(null) -> false, equals("cy@example.com") -> false
email() keeps the original text -> CY@EXAMPLE.COM
```

## Reference solution

````solution title="Reference solution (User.java)"
```java title="User.java" file="User.java"
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public class User {
    private final String email;
    private final String emailKey;          // identity: normalised once, never changes
    private final String name;
    private int loginCount;                 // mutable state, deliberately NOT part of equality

    public User(String email, String name) {
        this.email = Objects.requireNonNull(email, "email");
        this.emailKey = email.toLowerCase(Locale.ROOT);
        this.name = Objects.requireNonNull(name, "name");
    }

    public String email() { return email; }
    public String name() { return name; }
    public int loginCount() { return loginCount; }
    public void recordLogin() { loginCount++; }

    @Override                               // the compiler now checks that this really overrides Object.equals
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof User)) return false;
        return emailKey.equals(((User) o).emailKey);
    }

    @Override
    public int hashCode() {
        return emailKey.hashCode();         // same field as equals: equal users -> equal hash codes
    }

    @Override
    public String toString() {
        return "User[" + email + "]";
    }

    public static void main(String[] args) {
        Set<User> signups = new HashSet<>();
        signups.add(new User("ada@example.com", "Ada"));
        signups.add(new User("ADA@example.com", "Ada L."));
        System.out.println("HashSet with ada@example.com and ADA@example.com -> size " + signups.size());

        List<User> list = new ArrayList<>(List.of(new User("ada@example.com", "Ada")));
        System.out.println("ArrayList.contains(equal user) -> " + list.contains(new User("ada@example.com", "Ada")));

        Map<User, String> plans = new HashMap<>();
        User bob = new User("bob@example.com", "Bob");
        plans.put(bob, "premium");
        bob.recordLogin();
        System.out.println("HashMap.get(same object) after recordLogin() -> " + plans.get(bob) + ", containsKey " + plans.containsKey(bob));

        Object a = new User("cy@example.com", "Cy");
        Object b = new User("CY@EXAMPLE.COM", "Cyrus");
        System.out.println("equals via Object references -> " + a.equals(b) + ", hashCodes equal -> " + (a.hashCode() == b.hashCode()));
        System.out.println("equals(null) -> " + a.equals(null) + ", equals(\"cy@example.com\") -> " + a.equals("cy@example.com"));
        System.out.println("email() keeps the original text -> " + ((User) b).email());
    }
}
```
````

## Step-by-step explanation

````solution title="Step-by-step explanation"
**Debugging approach**: reproduce each symptom with the smallest program (the starter's `main` does), then ask *which method does the collection call?* For hash-based collections that's `hashCode()` first, to find the bucket, then `equals(Object)` within it.

1. **Bug 1: `equals(User)` is an overload, not an override.** Collections call `equals(Object)`, which `User` didn't override, so they used `Object.equals`, i.e. identity. That explains "contains() lies" and half of the duplicates. Putting `@Override` on the starter's method makes the compiler report `method does not override or implement a method from a supertype`. That's why `@Override` belongs on every overriding method. The fix: a single `equals(Object o)` with an `instanceof` check.
2. **Bug 2: `hashCode` used `loginCount`, a mutable field.** `HashMap.put` stored Bob in the bucket for his hash *at that moment*. After `recordLogin()` his hash changed, so `get(bob)` looked in a different bucket and found nothing. The entry was still in the map, unreachable: a memory leak and a correctness bug at once. Rule: hash only the fields that define identity, and keep those immutable.
3. **Bug 3: `equals` and `hashCode` disagreed about case.** `equalsIgnoreCase` treats `ada@` and `ADA@` as equal, but `email.hashCode()` is case-sensitive, so equal users landed in different buckets and `equals` was never consulted. That's the other half of the duplicates. Fixing bug 1 alone wouldn't help; the contract requires equal objects to have equal hash codes.
4. **The fix uses one normalised identity key.** `emailKey = email.toLowerCase(Locale.ROOT)` is computed once in the constructor and is `final`. Both `equals` and `hashCode` use only that key, so they're consistent by construction, and the hash never changes. `Locale.ROOT` avoids locale surprises: in Turkish, `"I".toLowerCase()` is a dotless `ı`.
5. **The contract details**: `this == o` is a cheap fast path. `instanceof` returns `false` for `null` and for other types, which gives `equals(null) == false` and symmetry with strings. The class isn't `final`. If subclasses could add fields to equality, prefer `getClass() != o.getClass()`, or make the class `final` to keep `equals` symmetric.
````

## Edge cases

- **`null` email or name**: rejected in the constructor, so `equals`/`hashCode` never see `null`.
- **Locale-sensitive case mapping**: always `toLowerCase(Locale.ROOT)` for identifiers. Full Unicode case-insensitivity (`ß` vs `SS`) would need `Collator` or case folding, which is rarely needed for emails.
- **Whitespace** (`" ada@example.com"`): the spec doesn't trim. Decide explicitly, and normalise at the boundary (input validation) rather than in `equals`.
- **Subclasses** adding state, such as an `AdminUser` with a role: either make `User` `final`, or document that subclasses mustn't change equality (or use `getClass()` checks).
- **Mutable keys in general**: if identity fields must change (an email change), remove the entry, change it, and re-insert, or better, keep identity immutable and model the change as a new object.
- **Records**: `record User(String email, String name)` would generate `equals` over **both** fields, case-sensitively. Records are only correct when *all* components define identity.

## JUnit tests

```java title="UserTest.java" file="UserTest.java" test="User.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

class UserTest {
    @Test
    void setDeduplicatesEmailsIgnoringCase() {
        Set<User> set = new HashSet<>();
        set.add(new User("ada@example.com", "Ada"));
        set.add(new User("ADA@Example.com", "Ada L."));
        assertEquals(1, set.size());
    }

    @Test
    void listContainsUsesEqualsObject() {
        List<User> list = new ArrayList<>(List.of(new User("ada@example.com", "Ada")));
        assertTrue(list.contains(new User("ada@example.com", "someone else")));
    }

    @Test
    void mapLookupSurvivesStateChanges() {
        Map<User, String> plans = new HashMap<>();
        User bob = new User("bob@example.com", "Bob");
        plans.put(bob, "premium");
        bob.recordLogin();
        bob.recordLogin();
        assertEquals("premium", plans.get(bob));
        assertEquals("premium", plans.get(new User("BOB@example.com", "B")));
    }

    @Test
    void equalsContract() {
        Object a = new User("cy@example.com", "Cy");
        Object b = new User("CY@EXAMPLE.COM", "Cyrus");
        Object c = new User("cy@EXAMPLE.com", "C");
        assertEquals(a, a);                                   // reflexive
        assertEquals(a, b);
        assertEquals(b, a);                                   // symmetric
        assertEquals(b, c);
        assertEquals(a, c);                                   // transitive
        assertNotEquals(a, null);
        assertNotEquals(a, "cy@example.com");
        assertNotEquals(a, new User("dy@example.com", "Cy"));
    }

    @Test
    void equalUsersHaveEqualHashCodes() {
        assertEquals(new User("Ada@Example.com", "x").hashCode(), new User("ada@example.com", "y").hashCode());
    }

    @Test
    void hashCodeIsStableWhenStateChanges() {
        User u = new User("dan@example.com", "Dan");
        int before = u.hashCode();
        u.recordLogin();
        assertEquals(before, u.hashCode());
    }

    @Test
    void originalEmailIsKept() {
        assertEquals("CY@EXAMPLE.COM", new User("CY@EXAMPLE.COM", "Cy").email());
    }

    @Test
    void equalsObjectIsOverridden() throws NoSuchMethodException {
        assertEquals(User.class, User.class.getMethod("equals", Object.class).getDeclaringClass());
    }
}
```
