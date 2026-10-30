## Concept explanation

Once a `String` object is created, its characters can never change. The class is `final` (no subclass can add mutation), its `value` array is `private final` and never exposed, and every method that looks like a modification returns a new string.

### Why String is immutable

1. **Security and integrity.** Strings carry class names, file paths, URLs, hostnames, SQL and credentials. If a string could change after a security check (`checkPermission(path)` then `open(path)`), an attacker holding another reference could swap the contents in between — a time-of-check/time-of-use bug. Class loading by name relies on the same guarantee.
2. **The string pool.** Because no one can modify a string, the JVM can safely **share** one instance of each literal across the whole program.
3. **Hash caching.** `hashCode()` is computed once and cached. That only works if the content can't change — and it makes strings fast, reliable `HashMap`/`HashSet` keys. A mutable key whose hash changed would become unfindable.
4. **Thread safety for free.** Immutable objects can be shared between threads without synchronisation; the Java Memory Model guarantees that `final` fields are seen correctly after construction.

The cost: every change allocates a new object. That's why `StringBuilder` exists for building text.

### The string pool

The JVM keeps a table of canonical `String` instances (the *string table*, also called the intern pool).

- **String literals** and compile-time constant expressions (`"ja" + "va"`, `static final` constants) are **interned automatically**: every occurrence of `"java"` in any class refers to the same object.
- `new String("java")` always creates a **new** object on the heap, distinct from the pooled literal.
- Concatenation involving a **non-constant** (`a + "va"` where `a` is a non-final variable) is computed at run time and produces a new, non-pooled string.
- `s.intern()` returns the pooled instance with the same content, adding `s` to the pool if absent.

This is why `==` on strings *sometimes* returns `true` — and why relying on it is a bug.

## Internal working

- **Where the pool lives:** in HotSpot the string table is a native hash table whose entries reference `String` objects on the **regular heap** (since JDK 7; before that, interned strings lived in PermGen). Pooled strings are garbage-collected like any object once nothing references them (literals stay alive while their class is loaded). `-XX:StringTableSize` sets the bucket count; `jcmd <pid> VM.stringtable` shows statistics.
- **Literal resolution:** a class file stores literals in its constant pool. The first time an `ldc` instruction loads a given literal, the JVM interns it; later `ldc`s return the same reference.
- **Constant folding:** `javac` folds `"ja" + "va"` into the single literal `"java"` at compile time, so it is pooled. `final String a = "ja"; a + "va"` is also a constant expression; without `final` it isn't.
- **Compact strings (Java 9+):** `byte[] value` + `byte coder`, 1 byte per char for Latin-1 text. The `value` array is never handed out: `toCharArray()` and `getBytes()` return copies.
- **String deduplication (G1, `-XX:+UseStringDeduplication`)** is different from interning: the GC makes distinct `String` objects with equal content share one backing array, without changing their identity.

## Visual representation

```text title="Literals, new String and intern()"
   String a = "java";                 Heap
   String b = "java";            +--------------------------------+
   String c = new String("java");|  string pool (string table)    |
   String d = c.intern();        |     "java"  <----- a, b, d     |
                                 |                                |
                                 |  String object "java" <---- c  |
                                 |  (separate copy)               |
                                 +--------------------------------+
   a == b  -> true   (same pooled object)
   a == c  -> false  (c is a different object)
   a == d  -> true   (intern() returned the pooled instance)
   a.equals(c) -> true (same characters)
```

## Java code example

```java title="StringPoolDemo.java" file="StringPoolDemo.java"
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class StringPoolDemo {
    static final String CONST_PREFIX = "ja";      // compile-time constant

    public static void main(String[] args) {
        String a = "java";
        String b = "java";
        String c = new String("java");
        String d = c.intern();

        System.out.println("a == b          : " + (a == b));
        System.out.println("a == c          : " + (a == c));
        System.out.println("a == d          : " + (a == d));
        System.out.println("a.equals(c)     : " + a.equals(c));

        String folded = "ja" + "va";                   // folded by javac
        String fromConstant = CONST_PREFIX + "va";      // constant expression too
        String prefix = "ja";                           // NOT final
        String runtime = prefix + "va";                 // built at run time
        System.out.println("folded == a     : " + (folded == a));
        System.out.println("fromConstant == a: " + (fromConstant == a));
        System.out.println("runtime == a    : " + (runtime == a));
        System.out.println("runtime.intern() == a: " + (runtime.intern() == a));

        // "Modifying" returns a new object; the original is untouched
        String original = "immutable";
        String upper = original.toUpperCase();
        System.out.println(original + " / " + upper + " / same object? " + (original == upper));

        // Why immutability matters for hash keys: a mutable key with a content-based hash gets lost
        Map<List<String>, String> badMap = new HashMap<>();
        List<String> mutableKey = new ArrayList<>(List.of("k"));
        badMap.put(mutableKey, "value");
        mutableKey.add("changed");                       // hashCode of the list changes
        System.out.println("lookup with the SAME (mutated) key object: " + badMap.get(mutableKey));

        Map<String, Integer> goodMap = new HashMap<>();
        goodMap.put("key", 1);
        System.out.println("String key lookup: " + goodMap.get("k" + "ey") + ", hash cached and stable: " + ("key".hashCode() == "key".hashCode()));
    }
}
```

## Output

```text title="Output" output="StringPoolDemo.java"
a == b          : true
a == c          : false
a == d          : true
a.equals(c)     : true
folded == a     : true
fromConstant == a: true
runtime == a    : false
runtime.intern() == a: true
immutable / IMMUTABLE / same object? false
lookup with the SAME (mutated) key object: null
String key lookup: 1, hash cached and stable: true
```

- `a`, `b`, `d` are the same pooled object; `c` is a separate copy with equal content.
- `"ja" + "va"` and `CONST_PREFIX + "va"` are constant expressions, folded by `javac` into the literal `"java"`. `prefix + "va"` uses a non-final variable, so it's built at run time — a new object until interned.
- The `List` key was stored in the bucket for its old hash code. After mutation its hash changed, so `get` searches a different bucket and returns `null` — even with the very same object. A `String` key can never do this, because its content (and therefore its cached hash) can't change. More in [equals and hashCode](lesson:equals-and-hashcode).

## Real-world application

- **Configuration keys, HTTP header names, JSON field names** are strings used as map keys millions of times; cached hashes make those lookups cheap.
- **Security**: passwords are better held in a `char[]` that you can zero after use, because a `String` stays in memory, immutable, until garbage-collected and may be interned or logged. (Many APIs, such as `java.io.Console.readPassword` and `KeyStore`, use `char[]` for this reason.)
- **Memory tuning**: services holding millions of duplicate strings (status values, country codes from parsed JSON) reduce heap with G1 string deduplication, explicit interning of a small fixed set of values, or enums.
- **Thread safety**: immutable strings can be shared across request threads without locks; mutable builders cannot.

## Common mistakes

- **Comparing with `==`** because it worked in a test with literals.
- **Interning everything** to "save memory": the string table is a global hash table with its own costs; intern only small, highly repeated sets.
- **Believing `substring` leaks memory**: true only before Java 7u6.
- **Expecting `toUpperCase()` to modify the string in place.**
- **Storing secrets in Strings** that end up in heap dumps and logs.

## Interview questions

**Q1. Why is String immutable in Java?**

````reveal title="Answer"
Four reasons that reinforce each other: **security** (strings hold paths, URLs, class names and credentials; they can't change between validation and use), the **string pool** (sharing literals is only safe if no one can mutate them), **hash caching** (the hash is computed once and stays valid, making strings reliable `HashMap` keys), and **thread safety** (immutable objects can be shared without synchronisation). The trade-off is extra allocation, handled by `StringBuilder`.
````

**Q2. How many objects does `String s = new String("hello");` create?**

````reveal title="Answer"
Up to two. The literal `"hello"` is interned once, when the constant is first resolved (unless an equal string is already pooled), and `new String(...)` creates one **new** `String` object every time the statement runs. (In current JDKs that new object shares the literal's internal `byte[]` rather than copying it.) So: one pooled literal for the program's lifetime, plus one new object per execution.
````

**Q3. What does `intern()` do, and where is the pool in modern JVMs?**

````reveal title="Answer"
`intern()` returns the canonical pooled `String` with the same content, adding this string to the pool if none exists, so `a.intern() == b.intern()` iff `a.equals(b)`. Since JDK 7, HotSpot's string table references objects on the normal heap (not PermGen), and unreferenced interned strings can be garbage-collected.
````

**Q4. Is a String thread-safe? Is a `final StringBuilder` thread-safe?**

````reveal title="Answer"
A `String` is thread-safe because it's immutable. A `final StringBuilder` is not: `final` only prevents reassigning the reference; concurrent `append` calls on the same builder corrupt its state. Immutability is about the object, not the reference.
````

## Hands-on exercise

Predict each `true`/`false` before running:

```java
String s1 = "Hello";
String s2 = "Hel" + "lo";
String s3 = "Hel";
String s4 = s3 + "lo";
final String s5 = "Hel";
String s6 = s5 + "lo";
String s7 = s4.intern();
```

Compare `s1` with each of `s2`, `s4`, `s6`, `s7` using `==`. Then write a tiny `Credentials` class that stores a password as `char[]`, offers `boolean matches(char[] attempt)`, and a `wipe()` method that zeroes the array.

````hint title="Hint"
Constant expressions (literals and `final` variables initialised with constants) are folded and pooled. Anything involving a non-final variable is built at run time. `java.util.Arrays.fill(array, '\0')` wipes a char array; `MessageDigest.isEqual` or `Arrays.equals` compares.
````

````solution title="Solution"
```java title="PoolQuiz.java" file="PoolQuiz.java"
import java.util.Arrays;

public class PoolQuiz {
    static final class Credentials {
        private final char[] password;

        Credentials(char[] password) {
            this.password = password.clone();      // defensive copy
        }

        boolean matches(char[] attempt) {
            return Arrays.equals(password, attempt);
        }

        void wipe() {
            Arrays.fill(password, '\0');
        }
    }

    public static void main(String[] args) {
        String s1 = "Hello";
        String s2 = "Hel" + "lo";
        String s3 = "Hel";
        String s4 = s3 + "lo";
        final String s5 = "Hel";
        String s6 = s5 + "lo";
        String s7 = s4.intern();
        System.out.println((s1 == s2) + " " + (s1 == s4) + " " + (s1 == s6) + " " + (s1 == s7));

        char[] typed = {'s', '3', 'c', 'r', '3', 't'};
        Credentials credentials = new Credentials(typed);
        Arrays.fill(typed, '\0');                         // caller wipes its own copy too
        System.out.println("matches: " + credentials.matches(new char[] {'s', '3', 'c', 'r', '3', 't'}));
        credentials.wipe();
        System.out.println("after wipe: " + credentials.matches(new char[] {'s', '3', 'c', 'r', '3', 't'}));
    }
}
```

```text title="Output" output="PoolQuiz.java"
true false true true
matches: true
after wipe: false
```

`s4` is built at run time from a non-final variable; `s6` uses a `final` constant, so it's folded at compile time. (Production code compares secrets in constant time, e.g. `MessageDigest.isEqual` on hashed bytes.)
````

## Knowledge check

```quiz
? Which reason for String's immutability relies on the content never changing after hashCode() is first computed?
- The string pool
+ Hash caching for HashMap keys
- Compact strings
> The cached hash would be wrong if the content could change.

? `String x = "a"; String y = x + "b"; System.out.println(y == "ab");` prints?
- true
+ false
- Compile error
> x is not final, so x + "b" is computed at run time into a new object.

? What does `new String("abc") == "abc"` evaluate to?
- true
+ false
> new always creates a distinct object.

? Since JDK 7, where do interned strings live in HotSpot?
- PermGen
+ On the regular heap, referenced from the string table
- In the thread stacks
> Interned strings moved out of PermGen and can be garbage-collected.

? Why do password APIs prefer char[] over String?
+ A char[] can be wiped after use; a String stays in memory until collected and can't be cleared
- char[] is encrypted by the JVM
- Strings can't hold special characters
> Immutability means you cannot overwrite a String's contents.
```

## Key takeaways

- `String` is **immutable**: final class, private final storage, every change returns a new object.
- Reasons: **security**, **safe pooling**, **cached hash codes**, **thread safety**.
- **Literals and constant expressions are pooled**; `new String` and run-time concatenation create new objects; `intern()` returns the pooled instance.
- Never compare strings with `==`; the pool makes it *look* like it works.
- The pool lives on the **heap** (JDK 7+); since Java 9 strings are **compact**.
