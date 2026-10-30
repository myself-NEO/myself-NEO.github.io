## Concept explanation

### What Java serialization does

**Serialization** turns an object graph into bytes; **deserialization** rebuilds it. Java's built-in mechanism (`java.io.Serializable`, `ObjectOutputStream`, `ObjectInputStream`) has existed since Java 1.1:

```java
try (ObjectOutputStream out = new ObjectOutputStream(Files.newOutputStream(path))) {
    out.writeObject(account);                        // the whole reachable graph
}
try (ObjectInputStream in = new ObjectInputStream(Files.newInputStream(path))) {
    Account copy = (Account) in.readObject();
}
```

The rules:
- **`Serializable` is a marker interface.** Every object reachable from the root must be serializable, or you get `NotSerializableException`.
- **All non-`static`, non-`transient` fields are written**, including private ones and those of serializable superclasses.
- **`transient` fields are skipped** and come back as `0`, `null` or `false`. Use it for passwords, caches, and fields holding non-serializable resources (connections, threads).
- **`static` fields belong to the class**, not the object, so they're never serialized.
- **The object graph is preserved**: shared references stay shared and cycles work, because each object is written once and later occurrences become back-references (*handles*).
- **Constructors don't run** for serializable classes during deserialization. Fields are set directly. Only the no-arg constructor of the first **non**-serializable superclass runs.

### serialVersionUID

Each serializable class has a version number, `serialVersionUID`, written into the stream. On reading, the stream's value must equal the local class's, or deserialization fails with `InvalidClassException: local class incompatible`.
- If you **don't declare it**, the JVM **computes** one from the class's structure (name, fields, methods, interfaces). Almost any change, even adding a method or a different compiler's synthetic members, alters it and breaks old data.
- **Declare it explicitly** (`private static final long serialVersionUID = 1L;`) and change it only when you deliberately break compatibility.
- **Compatible changes** with a fixed UID: adding fields (old streams give them default values) and removing fields (extra stream data is ignored).
- **Incompatible changes**: changing a field's type, or a class's position in the hierarchy.

### Hooks for custom behaviour

| Hook | Purpose |
|---|---|
| `private void writeObject(ObjectOutputStream)` / `readObject(ObjectInputStream)` | custom format; **validate invariants** after `defaultReadObject()`; restore transient fields |
| `Object writeReplace()` | serialize a different object instead (the **serialization proxy** pattern) |
| `Object readResolve()` | replace the deserialized object, for example with a singleton instance |
| `Externalizable` | you write and read everything yourself (`writeExternal`/`readExternal`); requires a public no-arg constructor |
| `serialPersistentFields` | declare the serialized form independently of the actual fields |

**Enums** serialize by name and always resolve to the existing constant. **Records** (Java 16) serialize their components, and are **deserialized through the canonical constructor**, so validation runs. That makes them far safer than ordinary classes.

### The security problem

Deserializing **untrusted bytes** is one of Java's most serious vulnerability classes:
- **Code execution**: `readObject`, `readResolve`, `hashCode`/`equals` (when deserializing into a `HashMap`) and other methods of classes on the class path **run during deserialization**. Attackers chain these "gadgets" from common libraries (the 2015 Apache Commons Collections exploits, and many since) into remote code execution, *before your code ever sees the object*.
- **Invariant bypass**: because constructors are skipped, a crafted stream can create objects with field values your constructor would reject.
- **Denial of service**: deeply nested graphs, huge array lengths, or hash-collision sets exhaust CPU and memory.

Defences:
1. **Don't deserialize untrusted data with Java serialization.** Use JSON (Jackson, without default typing), Protocol Buffers, Avro, or similar data-only formats.
2. If you must use it, install an **`ObjectInputFilter`** (Java 9, JEP 290): an **allow-list** of classes, plus limits on depth, references, array sizes and bytes. A JVM-wide filter can be set with `-Djdk.serialFilter=...`, and Java 17 added context-specific filter factories (JEP 415).
3. **Validate in `readObject`/`readResolve`**, use records, or use the serialization proxy pattern.

## Internal working

- **The stream format**:
  - a magic number `AC ED` and a version `00 05`;
  - then, for each new class, a **class descriptor**: name, `serialVersionUID`, flags, and field names and types;
  - then field values (primitives first, then references, recursively).

  Each object and class gets a **handle** number; a repeated reference writes `TC_REFERENCE` + the handle, which is how sharing and cycles survive. That's also why `ObjectOutputStream` keeps a table of every object written: reset it (`reset()`) when streaming many objects, or memory grows.
- **Reading**:
  - `ObjectInputStream` resolves each class by name (`resolveClass`), compares `serialVersionUID`s;
  - it allocates the object *without* calling serializable classes' constructors, using a constructor of the first non-serializable superclass, typically `Object()`;
  - it then sets fields reflectively, calls `readObject` hooks, then `readResolve`.

  Filters are consulted for every class, array and reference **before** it's instantiated.
- **The computed `serialVersionUID`** is a SHA-1 hash over the class name, modifiers, interfaces, fields and non-private methods and constructors. Compilers can add synthetic members, so the value can differ between compilers.
- **Records** take a different path: the stream's component values are read first, then the canonical constructor is invoked with them. `readObject`/`writeObject` hooks are ignored for records.
- **Java serialization's future**: OpenJDK considers it a mistake ("a horrible mistake", Mark Reinhold); there are long-term plans for safer serialization based on records and patterns. RMI, the main remaining user, is legacy.

## Visual representation

```text title="What goes into the stream"
  AC ED 00 05                                   magic + version
  TC_OBJECT  TC_CLASSDESC "Account" suid=1L     class descriptor, written once per class
             fields: [I id] [L owner Ljava/lang/String;] [L address LAddress;]
             values: id=7, owner="ada", address -> TC_OBJECT ... Address(...)   handle #5
  second customer with the same address  ->  TC_REFERENCE #5        sharing and cycles preserved
  transient password                      ->  (not written)          comes back as null
  static counter                          ->  (not written)          belongs to the class

  readObject():  resolve class -> check suid -> FILTER? -> allocate WITHOUT constructor -> set fields
                 -> call readObject()/readResolve() hooks   <- attacker-chosen classes' code runs here
```

## Java code example

```java title="SerializationDemo.java" file="SerializationDemo.java"
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InvalidClassException;
import java.io.ObjectInputFilter;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.io.Serializable;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.List;

public class SerializationDemo {
    static int constructorCalls;

    static class Address implements Serializable {
        private static final long serialVersionUID = 1L;
        final String city;

        Address(String city) {
            this.city = city;
        }
    }

    static class Account implements Serializable {
        private static final long serialVersionUID = 1L;
        static String region = "EU";                    // static: not serialized
        final int id;
        final Address address;
        transient String password;                      // transient: not serialized
        Account partner;                                // allows a cycle

        Account(int id, Address address, String password) {
            constructorCalls++;
            this.id = id;
            this.address = address;
            this.password = password;
        }
    }

    static class Person implements Serializable {       // validates in its constructor only
        private static final long serialVersionUID = 1L;
        final String name;
        final int age;

        Person(String name, int age) {
            if (age < 0) {
                throw new IllegalArgumentException("age must be >= 0");
            }
            this.name = name;
            this.age = age;
        }
    }

    record Adult(String name, int age) implements Serializable {
        Adult {
            if (age < 18) {
                throw new IllegalArgumentException("age must be >= 18 but was " + age);
            }
        }
    }

    static class Gadget implements Serializable {      // stands in for a dangerous library class
        private static final long serialVersionUID = 1L;
        String action = "delete /data/backups";

        private void readObject(ObjectInputStream in) throws IOException, ClassNotFoundException {
            in.defaultReadObject();
            System.out.println("  !! Gadget.readObject ran during deserialization and could now: " + action);
        }
    }

    static byte[] serialize(Object o) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ObjectOutputStream out = new ObjectOutputStream(bytes)) {
            out.writeObject(o);
        }
        return bytes.toByteArray();
    }

    static Object deserialize(byte[] data, ObjectInputFilter filter) throws IOException, ClassNotFoundException {
        try (ObjectInputStream in = new ObjectInputStream(new ByteArrayInputStream(data))) {
            if (filter != null) {
                in.setObjectInputFilter(filter);
            }
            return in.readObject();
        }
    }

    static int find(byte[] data, byte[] pattern) {     // locate bytes we want to tamper with
        outer:
        for (int i = 0; i <= data.length - pattern.length; i++) {
            for (int j = 0; j < pattern.length; j++) {
                if (data[i + j] != pattern[j]) {
                    continue outer;
                }
            }
            return i;
        }
        throw new IllegalStateException("pattern not found");
    }

    public static void main(String[] args) throws Exception {
        // 1. transient, static, constructors and the object graph
        Address shared = new Address("Oslo");
        Account a = new Account(7, shared, "s3cret");
        Account b = new Account(8, shared, "hunter2");
        a.partner = b;
        b.partner = a;                                  // a cycle
        byte[] bytes = serialize(List.of(a, b));
        Account.region = "US";                          // changed after writing
        int callsBefore = constructorCalls;
        @SuppressWarnings("unchecked")
        List<Account> copy = (List<Account>) deserialize(bytes, null);
        Account a2 = copy.get(0);
        Account b2 = copy.get(1);
        System.out.println("stream: " + bytes.length + " bytes, starts with " + String.format("%02X %02X", bytes[0], bytes[1]));
        System.out.println("id " + a2.id + ", password (transient) " + a2.password + ", region (static) " + Account.region);
        System.out.println("constructors called during deserialization: " + (constructorCalls - callsBefore));
        System.out.println("shared address still shared: " + (a2.address == b2.address) + ", cycle intact: " + (a2.partner.partner == a2));

        // 2. serialVersionUID mismatch (simulating a stream written by another version of the class)
        byte[] person = serialize(new Person("ada", 4242));
        byte[] otherVersion = person.clone();
        byte[] className = Person.class.getName().getBytes(StandardCharsets.UTF_8);
        ByteBuffer.wrap(otherVersion, find(otherVersion, className) + className.length, 8).putLong(2L);   // the uid follows the name
        try {
            deserialize(otherVersion, null);
        } catch (InvalidClassException e) {
            System.out.println("suid mismatch: " + e.getMessage().replace(Person.class.getName() + "; ", ""));
        }

        // 3. Constructors are bypassed: tampered data creates invalid objects (records are protected)
        byte[] tampered = person.clone();
        ByteBuffer.wrap(tampered, find(tampered, new byte[] {0, 0, 0x10, (byte) 0x92}), 4).putInt(-5);   // 4242 -> -5
        Person invalid = (Person) deserialize(tampered, null);
        System.out.println("tampered class instance accepted with age " + invalid.age + " (constructor never ran)");
        byte[] adult = serialize(new Adult("bob", 4242));
        ByteBuffer.wrap(adult, find(adult, new byte[] {0, 0, 0x10, (byte) 0x92}), 4).putInt(5);
        try {
            deserialize(adult, null);
        } catch (IOException e) {
            System.out.println("tampered record rejected: " + e.getClass().getSimpleName() + ": " + e.getMessage());
        }

        // 4. Code runs during deserialization; an allow-list filter stops it first
        System.out.println("deserializing a Gadget without a filter:");
        deserialize(serialize(new Gadget()), null);
        ObjectInputFilter allowList = ObjectInputFilter.Config.createFilter(
                "SerializationDemo$Account;SerializationDemo$Address;java.base/*;!*;maxdepth=10;maxbytes=10000");
        try {
            deserialize(serialize(new Gadget()), allowList);
        } catch (InvalidClassException e) {
            System.out.println("with an allow-list filter: " + e.getMessage() + " (readObject never ran)");
        }
        System.out.println("allowed classes still work: " + ((Account) deserialize(serialize(a), allowList)).id);
    }
}
```

## Output

```text title="Output" output="SerializationDemo.java"
stream: 288 bytes, starts with AC ED
id 7, password (transient) null, region (static) US
constructors called during deserialization: 0
shared address still shared: true, cycle intact: true
suid mismatch: local class incompatible: stream classdesc serialVersionUID = 2, local class serialVersionUID = 1
tampered class instance accepted with age -5 (constructor never ran)
tampered record rejected: InvalidObjectException: age must be >= 18 but was 5
deserializing a Gadget without a filter:
  !! Gadget.readObject ran during deserialization and could now: delete /data/backups
with an allow-list filter: filter status: REJECTED (readObject never ran)
allowed classes still work: 7
```

- The stream starts with the magic `AC ED`.
- The `transient` password came back `null`. The static `region` showed its *current* value (`US`), because statics aren't in the stream.
- **No constructor ran** during deserialization.
- The shared `Address` was still a single object, and the partner cycle was intact: Java serialization preserves object identity within a stream.
- Changing the `serialVersionUID` in the stream (as if an older class version wrote it) made deserialization fail with the classic "local class incompatible" message.
- The tampered `Person` stream produced an object with `age -5`, which its constructor would have rejected. The `Adult` record's canonical constructor ran during deserialization and refused the forged value.
- Merely deserializing the `Gadget` executed its `readObject`. With an allow-list filter, the class was rejected **before** any of its code ran.

## Real-world application

- **Where Java serialization still appears**: RMI and JMX remoting, legacy `HttpSession` replication, some caches and message brokers (older JMS `ObjectMessage`, Ehcache disk stores), Spark and Hadoop internals. Audit and filter all of them.
- **Security incidents**: deserialization flaws in WebLogic, JBoss, Jenkins, Apache Commons Collections gadgets and many enterprise products led to remote code execution and appear on OWASP's lists. Many security scanners flag `ObjectInputStream.readObject` on network input.
- **Modern practice**: JSON (Jackson or Gson, with polymorphic typing restricted), Protobuf, Avro or MessagePack for data exchange and persistence. They're explicit schemas, language-neutral, and carry no code-execution semantics.
- **When you own both ends** (for example, in-JVM deep copies or short-lived caches), serialization can still be convenient. Prefer records, declare `serialVersionUID`, and set a JVM-wide `jdk.serialFilter`.

## Common mistakes

- **Deserializing untrusted input** (network, uploads, cookies, message queues) with `ObjectInputStream`.
- **Not declaring `serialVersionUID`**, so harmless refactors break existing serialized data.
- **Forgetting `transient` for secrets or non-serializable fields** (`NotSerializableException`, or passwords persisted in plain bytes).
- **Assuming constructor validation protects deserialized objects.** It doesn't run: validate in `readObject`, or use records or the proxy pattern.
- **Singletons without `readResolve`**: deserialization creates a second instance. Use an enum.
- **Serializing large object graphs repeatedly through one `ObjectOutputStream` without `reset()`**: the handle table grows, and stale shared objects aren't re-sent.
- **Using Jackson default typing or similar "polymorphic deserialization" on untrusted JSON**: the same gadget problem in another format.

## Interview questions

**Q1. What does the `transient` keyword do, and what about `static` fields?**

````reveal title="Answer"
`transient` fields are excluded from default serialization; after deserialization they hold default values (`null`, `0`, `false`) unless restored in `readObject`. Use it for secrets, caches and non-serializable resources. `static` fields are never serialized because they belong to the class, not the instance: after deserialization, the class's current static value is what you see.
````

**Q2. What is `serialVersionUID`, and why declare it?**

````reveal title="Answer"
It's the version identifier of a serializable class, stored in the stream and compared on deserialization. A mismatch throws `InvalidClassException`. If not declared, it's computed from the class's structure (a hash of fields, methods and interfaces), so trivial changes, or a different compiler, change it and break compatibility with previously serialized data. Declare it explicitly so compatible evolution (adding or removing fields) keeps working, and change it only to signal a deliberate incompatible change.
````

**Q3. Are constructors called during deserialization?**

````reveal title="Answer"
Not for serializable classes. The JVM allocates the object and sets its fields directly from the stream. Only the no-arg constructor of the nearest non-serializable superclass (often `Object`) runs. Consequently, constructor validation is bypassed and a crafted stream can create objects that violate invariants. Validate in `readObject`, use the serialization proxy pattern, or use records, which are deserialized through their canonical constructor.
````

**Q4. Why is Java deserialization of untrusted data dangerous, and how do you mitigate it?**

````reveal title="Answer"
Deserialization instantiates classes named in the stream and invokes their hooks (`readObject`, `readResolve`, plus `hashCode`/`equals`/`compareTo` when rebuilding collections) before your code can inspect the result. Attackers chain such "gadgets" from libraries on the class path into remote code execution, or craft streams that exhaust memory and CPU. Mitigations:
- don't use Java serialization for untrusted data; use JSON, Protobuf and similar formats;
- otherwise, apply `ObjectInputFilter` allow-lists and resource limits (JEP 290/415, `jdk.serialFilter`);
- keep libraries patched;
- validate objects.
````

**Q5. How do you keep a singleton a singleton across serialization?**

````reveal title="Answer"
Implement `readResolve()` to return the canonical instance, so the deserialized copy is discarded and all fields are `transient` (or there are none). The simplest robust solution is an `enum` singleton: enums are serialized by name and always resolved to the existing constant, and they're also safe against reflection attacks.
````

## Hands-on exercise

Implement the **serialization proxy pattern** (from *Effective Java*) for an immutable, validated `Period(long startDay, long endDay)` with `startDay <= endDay`:
- `Period` implements `Serializable` and its constructor validates.
- `writeReplace()` returns a private static nested `Proxy` holding the two values.
- `Proxy.readResolve()` returns `new Period(startDay, endDay)`, so the constructor's validation always runs.
- `Period.readObject(ObjectInputStream)` throws `InvalidObjectException("proxy required")`, so a stream claiming to contain a `Period` directly is rejected.

Show:
1. a normal round trip;
2. a tampered proxy stream (swap the values so start > end) being rejected by the constructor.

````hint title="Hint"
Use distinctive values such as 20000 (`0x4E20`) and 20030 (`0x4E3E`) so you can find them in the bytes: in the proxy's serialized form they appear as 8-byte longs. Swap them with `ByteBuffer.wrap(bytes, index, 8).putLong(...)`. The `IllegalArgumentException` from the constructor propagates out of `readObject()` through `readResolve`.
````

````solution title="Solution"
```java title="SerializationProxy.java" file="SerializationProxy.java"
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InvalidObjectException;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.io.Serializable;
import java.nio.ByteBuffer;

public class SerializationProxy {
    static final class Period implements Serializable {
        private static final long serialVersionUID = 1L;
        private final long startDay;
        private final long endDay;

        Period(long startDay, long endDay) {
            if (startDay > endDay) {
                throw new IllegalArgumentException("start " + startDay + " is after end " + endDay);
            }
            this.startDay = startDay;
            this.endDay = endDay;
        }

        private Object writeReplace() {
            return new Proxy(startDay, endDay);              // serialize the proxy, never the Period itself
        }

        private void readObject(ObjectInputStream in) throws InvalidObjectException {
            throw new InvalidObjectException("proxy required");   // reject forged direct Period streams
        }

        @Override
        public String toString() {
            return "Period[" + startDay + ".." + endDay + "]";
        }

        private static final class Proxy implements Serializable {
            private static final long serialVersionUID = 1L;
            private final long startDay;
            private final long endDay;

            Proxy(long startDay, long endDay) {
                this.startDay = startDay;
                this.endDay = endDay;
            }

            private Object readResolve() {
                return new Period(startDay, endDay);         // validation always runs on the way in
            }
        }
    }

    static byte[] write(Object o) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ObjectOutputStream out = new ObjectOutputStream(bytes)) {
            out.writeObject(o);
        }
        return bytes.toByteArray();
    }

    static Object read(byte[] data) throws IOException, ClassNotFoundException {
        try (ObjectInputStream in = new ObjectInputStream(new ByteArrayInputStream(data))) {
            return in.readObject();
        }
    }

    static int indexOfLong(byte[] data, long value) {
        byte[] pattern = ByteBuffer.allocate(8).putLong(value).array();
        outer:
        for (int i = 0; i <= data.length - 8; i++) {
            for (int j = 0; j < 8; j++) {
                if (data[i + j] != pattern[j]) {
                    continue outer;
                }
            }
            return i;
        }
        throw new IllegalStateException("not found");
    }

    public static void main(String[] args) throws Exception {
        byte[] bytes = write(new Period(20_000, 20_030));
        System.out.println("round trip: " + read(bytes));

        int start = indexOfLong(bytes, 20_000);
        int end = indexOfLong(bytes, 20_030);
        ByteBuffer.wrap(bytes, start, 8).putLong(20_030);           // swap: start > end
        ByteBuffer.wrap(bytes, end, 8).putLong(20_000);
        try {
            read(bytes);
        } catch (IllegalArgumentException e) {
            System.out.println("tampered stream rejected by the constructor: " + e.getMessage());
        }
    }
}
```

```text title="Output" output="SerializationProxy.java"
round trip: Period[20000..20030]
tampered stream rejected by the constructor: start 20030 is after end 20000
```

The proxy makes the constructor the only way a `Period` can come into existence, even from bytes. Forged streams are rejected by the same validation as ordinary code. Records give you this property automatically, which is one more reason to prefer them for serializable value types.
````

## Knowledge check

```quiz
? What value does a transient String field have after deserialization?
+ null
- The value it had when serialized
- An empty string
> Transient fields are skipped and get default values.

? What happens if the stream's serialVersionUID differs from the local class's?
+ InvalidClassException: local class incompatible
- The extra fields are ignored
- The JVM recomputes the uid and continues
> Declare serialVersionUID explicitly to control compatibility.

? During deserialization of a Serializable class, which constructor runs?
+ Only the no-arg constructor of the first non-serializable superclass
- The class's own constructor
- The canonical constructor
> Records are the exception: their canonical constructor runs.

? Why is deserializing untrusted data with ObjectInputStream dangerous?
+ Methods of attacker-chosen classes (readObject etc.) run during deserialization
- It is slow
- It only works with trusted networks
> Gadget chains can lead to remote code execution.

? What does an ObjectInputFilter allow-list do?
+ Rejects classes not on the list before they are instantiated
- Encrypts the stream
- Validates field values after deserialization
> Combine it with limits on depth, references and bytes.
```

## Key takeaways

- Java serialization writes **all non-static, non-transient fields** of a **`Serializable`** object graph, preserving shared references and cycles. **Constructors don't run** on the way back.
- **Declare `serialVersionUID`** to control compatibility. Mismatches throw `InvalidClassException`.
- Customise with `writeObject`/`readObject` (validate!), `writeReplace`/`readResolve` (proxies, singletons) or `Externalizable`. **Records** deserialize through their canonical constructor.
- **Never deserialize untrusted data** with `ObjectInputStream`: gadget chains give remote code execution, and crafted streams bypass invariants or exhaust resources. Use JSON or Protobuf; otherwise use **`ObjectInputFilter` allow-lists** and limits.
- Prefer enums for singletons, and the serialization proxy pattern (or records) for validated value types.
