## Problem statement

A configuration registry must exist **exactly once** per JVM, and it's expensive to build, so it should ideally be created lazily. Implement the classic singleton variants in `Singletons.java` and **prove** which ones are correct under concurrency:

| Class | Requirement |
|---|---|
| `NaiveLazy` | given in the starter (`if (instance == null) instance = new NaiveLazy();`). Show that two threads can create **two** instances |
| `Eager` | `private static final` instance, created when the class is initialised |
| `SynchronizedLazy` | lazy, with a `synchronized` `getInstance()` |
| `DoubleChecked` | lazy, with double-checked locking: correct only with a **`volatile`** field |
| `HolderSingleton` | lazy via the *initialisation-on-demand holder* idiom: no locking in `getInstance()` |
| `EnumSingleton` | `enum EnumSingleton { INSTANCE }`, which must survive reflection and serialization attacks |

Each constructor records its creation in `Singletons.CREATED` (a map from class name to the number of instances created). Your program must show:
1. the naive version creating two instances when two threads overlap (deterministically, using the provided test hook);
2. each safe version returning **one** instance to 32 threads that start simultaneously;
3. that `Eager` is created as soon as its class is used for anything, while `HolderSingleton` waits until `getInstance()` is called;
4. that reflection can create a second `HolderSingleton` but not a second `EnumSingleton`;
5. that a `Serializable` singleton needs `readResolve` to keep its guarantee.

## Starter code

```java title="Singletons.java" starter="true"
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public final class Singletons {
    /** Instances created per class (lives outside the singleton classes, so reading it initialises nothing). */
    static final Map<String, Integer> CREATED = new ConcurrentHashMap<>();

    static void created(String name) {
        CREATED.merge(name, 1, Integer::sum);
    }

    static final class NaiveLazy {
        static volatile CountDownLatch overlapHook;          // test hook: null in production
        private static NaiveLazy instance;

        private NaiveLazy() {
            created("NaiveLazy");
            CountDownLatch hook = overlapHook;
            if (hook != null) {                               // hold the race window open for the demo
                hook.countDown();
                try {
                    hook.await(2, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
        }

        static NaiveLazy getInstance() {
            if (instance == null) {                           // check ...
                instance = new NaiveLazy();                   // ... then act: not atomic
            }
            return instance;
        }
    }

    static final class Eager {
        static Eager getInstance() { return null; }           // TODO
        static String describe() { return "eager"; }
    }

    static final class SynchronizedLazy {
        static SynchronizedLazy getInstance() { return null; }   // TODO
    }

    static final class DoubleChecked {
        static DoubleChecked getInstance() { return null; }      // TODO
    }

    static final class HolderSingleton {
        static HolderSingleton getInstance() { return null; }    // TODO
        static String describe() { return "holder"; }
    }

    enum EnumSingleton {
        INSTANCE
    }

    static final class SerializableSingleton implements java.io.Serializable {
        private static final long serialVersionUID = 1L;
        private static final SerializableSingleton INSTANCE = new SerializableSingleton();
        static SerializableSingleton getInstance() { return INSTANCE; }
        // TODO: keep the guarantee across serialization
    }

    static final class LeakySerializableSingleton implements java.io.Serializable {
        private static final long serialVersionUID = 1L;
        private static final LeakySerializableSingleton INSTANCE = new LeakySerializableSingleton();
        static LeakySerializableSingleton getInstance() { return INSTANCE; }
    }

    /** Releases {@code threads} threads at once, each calling {@code getter}; returns the number of distinct objects seen. */
    static int distinctInstances(java.util.function.Supplier<?> getter, int threads) throws Exception {
        java.util.concurrent.CyclicBarrier start = new java.util.concurrent.CyclicBarrier(threads);
        java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(threads);
        try {
            java.util.List<java.util.concurrent.Future<Object>> results = new java.util.ArrayList<>();
            for (int i = 0; i < threads; i++) {
                results.add(pool.submit(() -> {
                    start.await();
                    return getter.get();
                }));
            }
            java.util.Set<Object> distinct = java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<>());
            for (java.util.concurrent.Future<Object> f : results) distinct.add(f.get(10, TimeUnit.SECONDS));
            return distinct.size();
        } finally {
            pool.shutdownNow();
        }
    }

    /** Serializes and deserializes an object in memory. */
    @SuppressWarnings("unchecked")
    static <T> T roundTrip(T object) throws Exception {
        java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
        try (java.io.ObjectOutputStream out = new java.io.ObjectOutputStream(bytes)) {
            out.writeObject(object);
        }
        try (java.io.ObjectInputStream in = new java.io.ObjectInputStream(new java.io.ByteArrayInputStream(bytes.toByteArray()))) {
            return (T) in.readObject();
        }
    }

    public static void main(String[] args) throws Exception {
        NaiveLazy.overlapHook = new CountDownLatch(2);
        Thread t1 = new Thread(NaiveLazy::getInstance);
        Thread t2 = new Thread(NaiveLazy::getInstance);
        t1.start();
        t2.start();
        t1.join();
        t2.join();
        System.out.println("naive lazy, two overlapping threads -> instances created: " + CREATED.get("NaiveLazy"));
        // TODO: demonstrate the safe versions, laziness, reflection and serialization
    }
}
```

## Hints

````hint title="Hint 1: why the naive version breaks"
`if (instance == null) instance = new X();` is a **check-then-act** sequence. Two threads can both see `null` before either assigns. There's a second, subtler problem too: without synchronisation or `volatile`, another thread may see a non-null reference to an object whose constructor writes aren't yet visible to it. The JMM allows that reordering.
````

````hint title="Hint 2: double-checked locking, done right"
```java
private static volatile DoubleChecked instance;
static DoubleChecked getInstance() {
    DoubleChecked local = instance;              // one volatile read on the fast path
    if (local == null) {
        synchronized (DoubleChecked.class) {
            local = instance;
            if (local == null) instance = local = new DoubleChecked();
        }
    }
    return local;
}
```

Without `volatile`, the reference can be published before the constructor's writes are visible.
````

````hint title="Hint 3: let class initialisation do the work"
The JVM initialises a class **once**, under a lock, on first active use (JLS 12.4.2), and the result is safely published to every thread. A nested `private static class Holder { static final X INSTANCE = new X(); }` is initialised only when `getInstance()` reads `Holder.INSTANCE`, which gives laziness with no `synchronized` and no `volatile`. An `enum` gets the same guarantee, plus protection against reflection (`Constructor.newInstance` refuses enums) and serialization (enums deserialise by name).
````

## Test cases

| Check | Expected |
|---|---|
| `NaiveLazy` with the overlap hook, 2 threads | 2 instances created |
| Each safe version, 32 threads released by a barrier | exactly 1 distinct instance |
| `Eager.describe()` before any `getInstance()` | the instance is already created (eager) |
| `HolderSingleton.describe()` before `getInstance()` | no instance yet; created on `getInstance()` |
| `DoubleChecked`'s instance field | declared `volatile` |
| Reflection on `HolderSingleton`'s private constructor | a second instance (the idiom can't stop it) |
| Reflection on `EnumSingleton` | `IllegalArgumentException: Cannot reflectively create enum objects` |
| Serialize and deserialize a singleton with / without `readResolve` | same instance / a different instance |

## Expected output

```text title="Expected output" output="Singletons.java"
naive lazy, two overlapping threads -> instances created: 2
Eager.describe() -> eager; instance created already: true
HolderSingleton.describe() -> holder; instance created already: false
after HolderSingleton.getInstance(): created 1
32 simultaneous threads, distinct instances seen: {Eager=1, SynchronizedLazy=1, DoubleChecked=1, HolderSingleton=1, EnumSingleton=1}
reflection on HolderSingleton -> second instance: true
reflection on EnumSingleton -> IllegalArgumentException: Cannot reflectively create enum objects
serialization round trip, with readResolve -> same instance: true; without -> same instance: false; enum -> same instance: true
```

## Reference solution

````solution title="Reference solution (Singletons.java)"
```java title="Singletons.java" file="Singletons.java"
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.io.Serializable;
import java.lang.reflect.Constructor;
import java.util.ArrayList;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

public final class Singletons {
    /** Instances created per class (lives outside the singleton classes, so reading it initialises nothing). */
    static final Map<String, Integer> CREATED = new ConcurrentHashMap<>();

    static void created(String name) {
        CREATED.merge(name, 1, Integer::sum);
    }

    // 0. Broken: check-then-act race, and unsafe publication
    static final class NaiveLazy {
        static volatile CountDownLatch overlapHook;          // test hook: null in production
        private static NaiveLazy instance;

        private NaiveLazy() {
            created("NaiveLazy");
            CountDownLatch hook = overlapHook;
            if (hook != null) {                               // hold the race window open for the demo
                hook.countDown();
                try {
                    hook.await(2, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
        }

        static NaiveLazy getInstance() {
            if (instance == null) {                           // check ...
                instance = new NaiveLazy();                   // ... then act: not atomic
            }
            return instance;
        }
    }

    // 1. Eager: created during class initialisation, which the JVM does exactly once, thread-safely
    static final class Eager {
        private static final Eager INSTANCE = new Eager();
        private Eager() { created("Eager"); }
        static Eager getInstance() { return INSTANCE; }
        static String describe() { return "eager"; }
    }

    // 2. Synchronized: correct and lazy, but every call takes the lock
    static final class SynchronizedLazy {
        private static SynchronizedLazy instance;
        private SynchronizedLazy() { created("SynchronizedLazy"); }

        static synchronized SynchronizedLazy getInstance() {
            if (instance == null) {
                instance = new SynchronizedLazy();
            }
            return instance;
        }
    }

    // 3. Double-checked locking: lock only on the first calls; volatile is essential
    static final class DoubleChecked {
        private static volatile DoubleChecked instance;
        private DoubleChecked() { created("DoubleChecked"); }

        static DoubleChecked getInstance() {
            DoubleChecked local = instance;                   // a single volatile read on the fast path
            if (local == null) {
                synchronized (DoubleChecked.class) {
                    local = instance;
                    if (local == null) {
                        instance = local = new DoubleChecked();
                    }
                }
            }
            return local;
        }
    }

    // 4. Holder idiom: lazy, lock-free, safe (class initialisation does the synchronisation)
    static final class HolderSingleton {
        private HolderSingleton() { created("HolderSingleton"); }

        private static final class Holder {
            static final HolderSingleton INSTANCE = new HolderSingleton();
        }

        static HolderSingleton getInstance() { return Holder.INSTANCE; }
        static String describe() { return "holder"; }
    }

    // 5. Enum: the JVM guarantees one instance, even against reflection and serialization
    enum EnumSingleton {
        INSTANCE;
        EnumSingleton() { created("EnumSingleton"); }
    }

    // Serializable singletons need readResolve, or deserialization creates a new object
    static final class SerializableSingleton implements Serializable {
        private static final long serialVersionUID = 1L;
        private static final SerializableSingleton INSTANCE = new SerializableSingleton();
        static SerializableSingleton getInstance() { return INSTANCE; }
        private Object readResolve() { return INSTANCE; }    // replace the deserialised copy
    }

    static final class LeakySerializableSingleton implements Serializable {
        private static final long serialVersionUID = 1L;
        private static final LeakySerializableSingleton INSTANCE = new LeakySerializableSingleton();
        static LeakySerializableSingleton getInstance() { return INSTANCE; }
    }

    static int distinctInstances(Supplier<?> getter, int threads) throws Exception {
        CyclicBarrier start = new CyclicBarrier(threads);
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            List<Future<Object>> results = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                results.add(pool.submit(() -> {
                    start.await();                            // release all threads at the same moment
                    return getter.get();
                }));
            }
            Set<Object> distinct = Collections.newSetFromMap(new IdentityHashMap<>());
            for (Future<Object> f : results) {
                distinct.add(f.get(10, TimeUnit.SECONDS));
            }
            return distinct.size();
        } finally {
            pool.shutdownNow();
        }
    }

    @SuppressWarnings("unchecked")
    static <T> T roundTrip(T object) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ObjectOutputStream out = new ObjectOutputStream(bytes)) {
            out.writeObject(object);
        }
        try (ObjectInputStream in = new ObjectInputStream(new ByteArrayInputStream(bytes.toByteArray()))) {
            return (T) in.readObject();
        }
    }

    public static void main(String[] args) throws Exception {
        NaiveLazy.overlapHook = new CountDownLatch(2);
        Thread t1 = new Thread(NaiveLazy::getInstance);
        Thread t2 = new Thread(NaiveLazy::getInstance);
        t1.start();
        t2.start();
        t1.join();
        t2.join();
        System.out.println("naive lazy, two overlapping threads -> instances created: " + CREATED.get("NaiveLazy"));

        System.out.println("Eager.describe() -> " + Eager.describe() + "; instance created already: " + CREATED.containsKey("Eager"));
        System.out.println("HolderSingleton.describe() -> " + HolderSingleton.describe() + "; instance created already: "
                + CREATED.containsKey("HolderSingleton"));
        HolderSingleton.getInstance();
        System.out.println("after HolderSingleton.getInstance(): created " + CREATED.get("HolderSingleton"));

        Map<String, Supplier<?>> safe = new LinkedHashMap<>();
        safe.put("Eager", Eager::getInstance);
        safe.put("SynchronizedLazy", SynchronizedLazy::getInstance);
        safe.put("DoubleChecked", DoubleChecked::getInstance);
        safe.put("HolderSingleton", HolderSingleton::getInstance);
        safe.put("EnumSingleton", () -> EnumSingleton.INSTANCE);
        Map<String, Integer> distinct = new LinkedHashMap<>();
        for (Map.Entry<String, Supplier<?>> e : safe.entrySet()) {
            distinct.put(e.getKey(), distinctInstances(e.getValue(), 32));
        }
        System.out.println("32 simultaneous threads, distinct instances seen: " + distinct);

        Constructor<HolderSingleton> holderCtor = HolderSingleton.class.getDeclaredConstructor();
        holderCtor.setAccessible(true);
        System.out.println("reflection on HolderSingleton -> second instance: " + (holderCtor.newInstance() != HolderSingleton.getInstance()));
        try {
            Constructor<EnumSingleton> enumCtor = EnumSingleton.class.getDeclaredConstructor(String.class, int.class);
            enumCtor.setAccessible(true);
            enumCtor.newInstance("INSTANCE_2", 1);
        } catch (IllegalArgumentException e) {
            System.out.println("reflection on EnumSingleton -> IllegalArgumentException: " + e.getMessage());
        }

        System.out.println("serialization round trip, with readResolve -> same instance: "
                + (roundTrip(SerializableSingleton.getInstance()) == SerializableSingleton.getInstance())
                + "; without -> same instance: " + (roundTrip(LeakySerializableSingleton.getInstance()) == LeakySerializableSingleton.getInstance())
                + "; enum -> same instance: " + (roundTrip(EnumSingleton.INSTANCE) == EnumSingleton.INSTANCE));
    }
}
```
````

## Step-by-step explanation

````solution title="Step-by-step explanation"
1. **Reproduce the race deterministically.** A real race is timing-dependent, so the starter gives `NaiveLazy` a test hook: inside the constructor, the first thread waits until the second thread has *also* entered the constructor. Both threads passed `instance == null` before either assigned, so two instances were created, every time. In production the window is tiny, which is why such bugs survive testing and appear under load.
2. **Eager.** `private static final` plus class initialisation: the JVM runs a class's static initialiser once, holding an initialisation lock, and every thread that later uses the class sees the fully constructed object (JLS 12.4.2). It's correct and simple. The cost is no laziness: *any* use of the class (even `Eager.describe()`) creates the instance, as the demo shows.
3. **Synchronized lazy.** Correct, because the lock makes check-then-act atomic and its happens-before edge publishes the object safely. But every call acquires the monitor, even long after initialisation: usually cheap, but a contention point on hot paths.
4. **Double-checked locking.**
   - The fast path reads the field without locking; only the first callers synchronise.
   - **`volatile` is mandatory.** Without it, the write of the reference may become visible before the constructor's writes (the JMM permits that reordering), and another thread could use a half-initialised object.
   - With `volatile`, the write *happens-before* every later read.
   - The `local` variable avoids a second volatile read on the fast path.
5. **The holder idiom.** `HolderSingleton.describe()` initialised the outer class, but **not** the nested `Holder`. That happens only when `getInstance()` first reads `Holder.INSTANCE`. Laziness and thread safety both come from class initialisation, with no locks and no `volatile` in user code. This is the best choice for lazy class-based singletons.
6. **Enum.** The JVM guarantees one instance per constant:
   - `Constructor.newInstance` explicitly refuses enum types (*"Cannot reflectively create enum objects"*), whereas the holder's private constructor can be called with `setAccessible(true)`;
   - serialization writes enum constants by name and resolves them back to the same object.
   
   It's eager (created when the enum is initialised) and can't extend another class.
7. **Serialization.** Deserialising normally creates a fresh object without calling the constructor. `readResolve` replaces it with the canonical instance. Without it, "singleton" stops meaning anything after a round trip.
8. **Proving it.** 32 threads released together by a `CyclicBarrier` call `getInstance()`, and an identity-based set counts the distinct results. One per safe version. In applications, the usual answer is a DI-managed singleton (one Spring bean), which is also testable.
````

## Edge cases

- **Exceptions in a static initialiser**: if `Eager`'s constructor throws, the class becomes unusable. Every later access throws `NoClassDefFoundError: Could not initialize class …`. Lazy versions can retry after a failure.
- **Several class loaders**: "singleton" means one per class loader. Two web applications in one server can each have their own copy.
- **Reflection-proof class singletons**: throw from the private constructor if the instance already exists. That's still not fully proof against `Unsafe` or serialization tricks, which is why enums are recommended when it matters.
- **Testing code that uses singletons** is hard: there's global state and no injection point. Prefer passing the instance in (dependency injection) and keep `getInstance()` only at the composition root.
- **DCL with a `final`-fields-only object**: thanks to `final` field semantics it can work without `volatile`, but that's fragile reasoning. Use `volatile`, or the holder idiom.
- **Virtual threads**: `synchronized` pinned carrier threads before JDK 24. That's harmless here, since the lock is held only for construction.

## JUnit tests

```java title="SingletonsTest.java" file="SingletonsTest.java" test="Singletons.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.lang.reflect.Constructor;
import java.lang.reflect.Modifier;
import java.util.concurrent.CountDownLatch;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;

class SingletonsTest {
    private static void assertSingleInstance(Supplier<?> getter) throws Exception {
        assertNotNull(getter.get());
        assertEquals(1, Singletons.distinctInstances(getter, 32));
        assertSame(getter.get(), getter.get());
    }

    @Test
    void naiveLazyCanCreateTwoInstances() throws Exception {
        Singletons.NaiveLazy.overlapHook = new CountDownLatch(2);
        try {
            Thread t1 = new Thread(Singletons.NaiveLazy::getInstance);
            Thread t2 = new Thread(Singletons.NaiveLazy::getInstance);
            t1.start();
            t2.start();
            t1.join();
            t2.join();
            assertEquals(2, Singletons.CREATED.get("NaiveLazy"));
        } finally {
            Singletons.NaiveLazy.overlapHook = null;
        }
    }

    @Test
    void eagerIsSingle() throws Exception {
        assertSingleInstance(Singletons.Eager::getInstance);
    }

    @Test
    void synchronizedIsSingle() throws Exception {
        assertSingleInstance(Singletons.SynchronizedLazy::getInstance);
    }

    @Test
    void doubleCheckedIsSingleAndVolatile() throws Exception {
        assertSingleInstance(Singletons.DoubleChecked::getInstance);
        assertTrue(Modifier.isVolatile(Singletons.DoubleChecked.class.getDeclaredField("instance").getModifiers()),
                "double-checked locking needs a volatile field");
    }

    @Test
    void holderIsSingleAndLazy() throws Exception {
        assertEquals("holder", Singletons.HolderSingleton.describe());
        assertTrue(!Singletons.CREATED.containsKey("HolderSingleton"), "describe() must not create the instance");
        assertSingleInstance(Singletons.HolderSingleton::getInstance);
        assertEquals(1, Singletons.CREATED.get("HolderSingleton"));
    }

    @Test
    void enumResistsReflection() throws Exception {
        assertSingleInstance(() -> Singletons.EnumSingleton.INSTANCE);
        Constructor<Singletons.EnumSingleton> c = Singletons.EnumSingleton.class.getDeclaredConstructor(String.class, int.class);
        c.setAccessible(true);
        assertThrows(IllegalArgumentException.class, () -> c.newInstance("X", 1));
    }

    @Test
    void readResolvePreservesTheSingletonAcrossSerialization() throws Exception {
        assertSame(Singletons.SerializableSingleton.getInstance(), Singletons.roundTrip(Singletons.SerializableSingleton.getInstance()));
        assertNotSame(Singletons.LeakySerializableSingleton.getInstance(), Singletons.roundTrip(Singletons.LeakySerializableSingleton.getInstance()));
        assertSame(Singletons.EnumSingleton.INSTANCE, Singletons.roundTrip(Singletons.EnumSingleton.INSTANCE));
    }
}
```
