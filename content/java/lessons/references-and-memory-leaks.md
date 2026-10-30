## Concept explanation

### Four strengths of reachability

Normal references are **strong**: as long as a strong path from a GC root exists, the object stays. The `java.lang.ref` package adds weaker kinds that let the GC decide:

| Reference | `get()` returns | Cleared when | Typical use |
|---|---|---|---|
| **Strong** (`Object o = …`) | always the object | never, while reachable | everything normal |
| **`SoftReference`** | the object until cleared | the object is only softly reachable **and memory is needed**. All are cleared **before** an `OutOfMemoryError` | memory-sensitive caches (with care) |
| **`WeakReference`** | the object until cleared | **at the next GC** after the object becomes only weakly reachable | canonicalising maps, metadata attached to objects you don't own, listeners |
| **`PhantomReference`** | **always `null`** | enqueued after the object is finalised and is about to be reclaimed | post-mortem cleanup of native resources (via `Cleaner`) |

A **`ReferenceQueue`** passed to the reference constructor receives the reference object after the GC clears it, so you can react (remove a map entry, free native memory).

**`WeakHashMap`** holds its *keys* weakly: when a key is no longer strongly reachable elsewhere, its entry disappears. Its *values* are strong, so a value that references its own key keeps the entry alive forever.

**`java.lang.ref.Cleaner`** (Java 9) is the modern replacement for `finalize()`. Register an object and a cleanup action, and the action runs on a cleaner thread once the object becomes phantom-reachable. The action must not refer to the object itself, or it will never become unreachable. Use it as a **safety net**; the primary path should still be `close()` with try-with-resources.

### Memory leaks in a garbage-collected language

The GC frees unreachable objects, so a Java "leak" is always **unintended reachability**: something still references objects you'll never use again. Classic sources:

| Pattern | Why it leaks | Fix |
|---|---|---|
| **static collections / caches** that only grow | statics are GC roots | bounded caches with eviction (`LinkedHashMap.removeEldestEntry`, Caffeine), TTLs |
| **listeners / callbacks / observers** never unregistered | the subject's list strongly references every listener and whatever it captured | unregister (return an `AutoCloseable` subscription), or weak listeners |
| **`ThreadLocal`** in thread pools | pooled threads never die, so their thread-local maps keep values (and class loaders) alive | `try { tl.set(v); … } finally { tl.remove(); }`, or scoped values |
| **mutable keys in `HashMap`/`HashSet`** | after the key's `hashCode` changes, the entry can't be found or removed | immutable keys (records, `String`) |
| **inner classes and lambdas** capturing an outer object | a non-static inner instance or lambda keeps its enclosing instance alive | static nested classes; capture only what's needed |
| **unclosed resources** | streams, connections and direct buffers hold native memory and OS handles | try-with-resources |
| **class-loader leaks** on redeploy | any reference from a long-lived loader to a webapp class pins the whole loader and its Metaspace | deregister drivers and threads on shutdown; avoid static caches in shared libraries |
| **unbounded queues and sessions** | a producer outpaces its consumer; sessions hold too much | bounded queues, back-pressure, session limits |

## Internal working

- **Reference processing** happens during GC. After marking, the collector finds `Reference` objects whose referents weren't strongly marked and clears them according to their type:
  - soft references by policy;
  - weak references always;
  - phantom references after finalisation.

  It then appends them to a pending list. The **Reference Handler** thread moves them onto their `ReferenceQueue`s asynchronously, so a queue (or `WeakHashMap.size()`) may lag slightly behind the GC itself.
- **SoftReference policy**: HotSpot keeps a soft reference if it was accessed recently relative to free heap: `-XX:SoftRefLRUPolicyMSPerMB` (default 1000 ms per free MB). Under pressure they're cleared, and **all** are cleared before an OOME is thrown. Soft-reference caches behave unpredictably across GCs and heap sizes, and can cause GC thrashing, so prefer explicit size or TTL-bounded caches.
- **`WeakHashMap`** expunges stale entries lazily, by polling its queue on access (`get`, `put`, `size`). **Interned string keys** (literals) are referenced from the string table and class constant pools, so they're effectively never collected.
- **`Cleaner`** uses `PhantomReference` internally plus a daemon thread. The JDK uses it for direct `ByteBuffer`s and other native resources.
- **`finalize()`** delayed reclamation by at least one extra GC, ran on a single `Finalizer` thread (a slow finaliser backs up the whole JVM), allowed resurrection, and was unpredictable. It's deprecated for removal; `--finalization=disabled` (Java 18+) turns it off for testing.
- **Proving a leak**:
  1. The old generation's occupancy **after full GCs** (the baseline) keeps rising (GC logs, `jstat -gcutil`).
  2. Take two **heap dumps** some time apart (`jcmd <pid> GC.heap_dump file.hprof`).
  3. Compare them in **Eclipse MAT** or VisualVM: look at the **dominator tree**, the biggest retained sizes, and "**path to GC roots**" for the suspicious objects. That path names the static, thread or listener list that keeps them alive.

  JFR's `OldObjectSample` event can also point to leak candidates with allocation stack traces at low overhead.

## Visual representation

```text title="Reachability strength and what the GC does"
  ROOT --strong--> Cache --strong--> entry          kept
  ROOT --strong--> SoftReference ----soft----> big   kept while memory is fine; cleared before OOME
  ROOT --strong--> WeakReference ----weak----> obj   cleared at the next GC (if no strong path)
  ROOT --strong--> PhantomReference --phantom--> res  get() == null; enqueued when res is reclaimed
                         |                                       |
                         +--> ReferenceQueue <-- Reference Handler thread enqueues cleared refs

  a leak = an unwanted strong path:
  ROOT(static) -> EventBus.listeners (ArrayList) -> Listener lambda -> captured Screen -> 50 MB of images
                                       ^ "path to GC roots" in a heap dump shows exactly this chain
```

## Java code example

Run with `-XX:+UseSerialGC -Xmx32m`, so `System.gc()` triggers a full collection and memory pressure is easy to create.

```java title="ReferencesDemo.java" file="ReferencesDemo.java" run="-XX:+UseSerialGC -Xmx32m"
import java.lang.ref.Cleaner;
import java.lang.ref.PhantomReference;
import java.lang.ref.Reference;
import java.lang.ref.ReferenceQueue;
import java.lang.ref.SoftReference;
import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.WeakHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public class ReferencesDemo {
    static final class Key {                       // a deliberately MUTABLE key
        int id;

        Key(int id) {
            this.id = id;
        }

        @Override
        public boolean equals(Object o) {
            return o instanceof Key k && k.id == id;
        }

        @Override
        public int hashCode() {
            return Objects.hash(id);
        }
    }

    public static void main(String[] args) throws Exception {
        // 1. Weak vs soft vs strong after a full GC
        Object strong = new Object();
        WeakReference<Object> weakToStrong = new WeakReference<>(strong);
        WeakReference<Object> weak = new WeakReference<>(new Object());
        SoftReference<byte[]> soft = new SoftReference<>(new byte[1024]);
        System.gc();
        System.out.println("weak (no strong path) cleared: " + (weak.get() == null));
        System.out.println("weak (strong path exists) kept: " + (weakToStrong.get() != null));
        System.out.println("soft kept while memory is fine: " + (soft.get() != null));
        Reference.reachabilityFence(strong);

        // 2. Soft references are cleared before OutOfMemoryError
        SoftReference<byte[]> cached = new SoftReference<>(new byte[8 * 1024 * 1024]);
        List<byte[]> pressure = new ArrayList<>();
        try {
            while (true) {
                pressure.add(new byte[1024 * 1024]);
            }
        } catch (OutOfMemoryError e) {
            pressure.clear();                          // release, then continue normally
        }
        System.out.println("soft cleared under memory pressure: " + (cached.get() == null));

        // 3. Phantom references + ReferenceQueue: notification after the object is gone
        ReferenceQueue<Object> queue = new ReferenceQueue<>();
        PhantomReference<Object> phantom = new PhantomReference<>(new Object(), queue);
        System.out.println("phantom.get() is always null: " + (phantom.get() == null));
        System.gc();
        System.out.println("phantom enqueued after collection: " + (queue.remove(2_000) == phantom));

        // 4. WeakHashMap drops entries whose keys are no longer strongly reachable
        WeakHashMap<Object, String> metadata = new WeakHashMap<>();
        Object alive = new Object();
        metadata.put(alive, "kept");
        metadata.put(new Object(), "orphaned");
        for (int i = 0; i < 50 && metadata.size() > 1; i++) {   // queue processing is asynchronous
            System.gc();
            Thread.sleep(20);
        }
        System.out.println("WeakHashMap entries left: " + metadata.size() + " " + metadata.values());
        Reference.reachabilityFence(alive);

        // 5. Cleaner: cleanup without finalize()
        Cleaner cleaner = Cleaner.create();
        CountDownLatch cleaned = new CountDownLatch(1);
        Object resource = new Object();
        cleaner.register(resource, cleaned::countDown);   // the action must not reference 'resource'
        resource = null;
        System.gc();
        System.out.println("Cleaner action ran: " + cleaned.await(5, TimeUnit.SECONDS));

        // 6. A leak without any GC bug: a mutable key lost inside a HashMap
        Map<Key, String> sessions = new HashMap<>();
        Key key = new Key(1);
        sessions.put(key, "session data");
        key.id = 2;                                      // hashCode changes: the entry is now unreachable by lookup
        System.out.println("lookup after mutation: " + sessions.get(key) + ", remove succeeded: " + (sessions.remove(key) != null)
                + ", map still holds " + sessions.size() + " entry");
    }
}
```

## Output

```text title="Output" output="ReferencesDemo.java"
weak (no strong path) cleared: true
weak (strong path exists) kept: true
soft kept while memory is fine: true
soft cleared under memory pressure: true
phantom.get() is always null: true
phantom enqueued after collection: true
WeakHashMap entries left: 1 [kept]
Cleaner action ran: true
lookup after mutation: null, remove succeeded: false, map still holds 1 entry
```

- The weak reference with no strong path was cleared by the first full GC. The one whose referent was still strongly referenced survived.
- The soft reference survived a normal GC, but was cleared once the heap ran out. The JVM sacrificed it before giving up with `OutOfMemoryError`.
- A phantom reference never hands out its referent, but its arrival on the queue reliably signals "the object is gone".
- `WeakHashMap` kept only the entry whose key was still strongly referenced.
- The `Cleaner` ran its action after the registered object became unreachable.
- Mutating a key after insertion made the entry impossible to find or remove: a leak with nothing wrong in the GC at all.

## Real-world application

- **Caches**: production caches use explicit bounds (Caffeine's `maximumSize`, `expireAfterWrite`, LRU via `LinkedHashMap`) rather than soft references. `WeakHashMap`-style caches fit when entries should live exactly as long as their keys, such as per-class metadata (`ClassValue` is even better) or decorations attached to objects you don't own.
- **Native resources**: JDK direct buffers, JNA and Netty use `Cleaner` or phantom references as a safety net that frees native memory if `close()` was forgotten.
- **Event systems**: GUI frameworks and event buses offer weak listeners or require explicit unsubscribe tokens, to avoid "window closed but still in memory" leaks.
- **Thread pools and `ThreadLocal`**: request-scoped data in `ThreadLocal`s (MDC logging, security context, transactions) must be cleared in `finally`. Frameworks like Spring do this, and custom filters often forget.
- **Incident response**: when a service's old generation climbs until it dies, the playbook is: confirm with GC logs, take heap dumps (or use `-XX:+HeapDumpOnOutOfMemoryError`), and find the dominator and its path to GC roots in MAT.

## Common mistakes

- **Using `SoftReference` as a cache policy.** Clearing is unpredictable, depends on heap size, and can cause near-OOM thrashing.
- **`WeakHashMap` values that reference their keys** (directly or indirectly), which keep entries alive forever. Interned or literal string keys never go away either.
- **Cleaner actions or lambdas that capture the object being cleaned**, so it never becomes unreachable.
- **Relying on `finalize()`** for anything. It's deprecated, slow and unreliable.
- **Assuming a growing heap means a leak.** Check occupancy **after full GC** over time; a sawtooth that returns to the same baseline is healthy.
- **Forgetting `ThreadLocal.remove()`** in pooled threads, which leaks data and, after redeploys, entire class loaders.
- **Registering listeners in constructors and never unregistering** them.

## Interview questions

**Q1. Explain strong, soft, weak and phantom references.**

````reveal title="Answer"
- **Strong**: normal references; the object stays while it's strongly reachable.
- **Soft**: cleared at the GC's discretion when memory is needed, and guaranteed to be cleared before `OutOfMemoryError`. Historically used for memory-sensitive caches.
- **Weak**: cleared at the next GC once no strong (or soft) path exists. Used for canonicalising maps (`WeakHashMap`) and associating data with objects without keeping them alive.
- **Phantom**: `get()` always returns `null`; it's enqueued after the object has been finalised and is about to be reclaimed. Used for post-mortem cleanup, as in `Cleaner`.

All of them can be registered with a `ReferenceQueue` to learn when they're cleared.
````

**Q2. How can Java have memory leaks if it has a garbage collector?**

````reveal title="Answer"
The GC only frees *unreachable* objects. A leak is objects that are still reachable but no longer needed:
- growing static collections and caches without eviction;
- listeners never unregistered;
- `ThreadLocal` values in pooled threads;
- mutable keys lost in hash maps;
- inner classes or lambdas capturing large outer objects;
- class loaders pinned across redeploys.

There are also native leaks from unclosed streams, connections or direct buffers. The GC is working correctly; the program is holding references it shouldn't.
````

**Q3. How would you find a memory leak in production?**

````reveal title="Answer"
1. Confirm it: old-generation occupancy after full GCs rises steadily (GC logs, `jstat`, metrics), or `OutOfMemoryError: Java heap space` recurs.
2. Capture evidence: heap dumps with `jcmd <pid> GC.heap_dump` (two, some time apart) or automatically with `-XX:+HeapDumpOnOutOfMemoryError`. `jcmd GC.class_histogram` gives a quick count per class.
3. Analyse in Eclipse MAT or VisualVM: the dominator tree and leak suspects, then the path to GC roots for the biggest retainers, which identifies the static, thread or listener holding them.
4. Fix the reference and verify with a load test.

JFR `OldObjectSample` events help find where leaking objects were allocated.
````

**Q4. How does `WeakHashMap` work, and what's a common pitfall?**

````reveal title="Answer"
It wraps each key in a `WeakReference` registered with an internal `ReferenceQueue`. When a key becomes only weakly reachable and the GC clears it, the reference is enqueued, and the map expunges that entry the next time it's accessed. Pitfalls:
- values are strong, so a value that references its key keeps the entry forever;
- interned strings and other constants never become unreachable;
- it isn't thread-safe;
- removal is lazy and asynchronous, so `size()` immediately after a GC may still include stale entries.
````

**Q5. Why was `finalize()` deprecated, and what replaces it?**

````reveal title="Answer"
Finalisation is unpredictable: it may run late or never. It delays reclamation by at least one GC cycle, runs on a single `Finalizer` thread that can back up, allows objects to be resurrected, and exceptions in finalisers are ignored. It's deprecated for removal. Replace it with explicit `close()` via `AutoCloseable` and try-with-resources, plus `java.lang.ref.Cleaner` as a safety net for native resources.
````

## Hands-on exercise

An `EventBus` keeps listeners in a static list. Screens register a listener that captures the screen, and never unregister, so closed screens (each holding a 1 MB image buffer) leak.

1. Reproduce the leak: create and "close" a `Screen` (drop all references), call `System.gc()`, and show via a `WeakReference` that it's **still alive**, and why (the bus has N listeners).
2. Fix it: make `subscribe` return a `Subscription` (an `AutoCloseable` whose `close()` throws no checked exception) that removes the listener. Have `Screen` implement `AutoCloseable` and close its subscription, and use try-with-resources. Show that the closed screen is **collected**.

````hint title="Hint"
A lambda like `event -> this.render(event)` captures `this`, so the bus → listener → screen chain is a strong path from a static root. `subscribe` can be `listeners.add(l); return () -> listeners.remove(l);`. Create each screen inside a helper method that returns a `WeakReference` to it, so no local variable in `main` keeps it alive. After `System.gc()`, `ref.get() == null` means it was collected.
````

````solution title="Solution"
```java title="ListenerLeak.java" file="ListenerLeak.java" run="-XX:+UseSerialGC -Xmx64m"
import java.lang.ref.WeakReference;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;

public class ListenerLeak {
    interface Subscription extends AutoCloseable {
        @Override
        void close();                                   // no checked exception: easy to use
    }

    static final class EventBus {
        static final List<Consumer<String>> LISTENERS = new CopyOnWriteArrayList<>();   // a static GC root

        static void subscribeForever(Consumer<String> listener) {
            LISTENERS.add(listener);
        }

        static Subscription subscribe(Consumer<String> listener) {
            LISTENERS.add(listener);
            return () -> LISTENERS.remove(listener);
        }

        static void publish(String event) {
            LISTENERS.forEach(l -> l.accept(event));
        }
    }

    static class LeakyScreen {
        final byte[] image = new byte[1024 * 1024];     // 1 MB the screen holds on to
        int events;

        LeakyScreen() {
            EventBus.subscribeForever(e -> events++);     // captures 'this' and never unsubscribes
        }
    }

    static class Screen implements AutoCloseable {
        final byte[] image = new byte[1024 * 1024];
        int events;
        private final Subscription subscription;

        Screen() {
            subscription = EventBus.subscribe(e -> events++);
        }

        @Override
        public void close() {
            subscription.close();                       // break the path from the static root
        }
    }

    // Each screen lives only inside its method, so no local variable can keep it alive afterwards.
    static WeakReference<LeakyScreen> openLeakyScreen() {
        LeakyScreen screen = new LeakyScreen();
        EventBus.publish("opened");
        return new WeakReference<>(screen);             // the user closes the screen when we return
    }

    static WeakReference<Screen> openScreen() {
        try (Screen screen = new Screen()) {
            EventBus.publish("opened");
            System.out.println("events seen by the open screen: " + screen.events);
            return new WeakReference<>(screen);
        }
    }

    public static void main(String[] args) {
        WeakReference<LeakyScreen> leaky = openLeakyScreen();
        System.gc();
        System.out.println("leaky screen collected: " + (leaky.get() == null)
                + " (bus still holds " + EventBus.LISTENERS.size() + " listener)");

        WeakReference<Screen> fixed = openScreen();
        System.gc();
        System.out.println("fixed screen collected: " + (fixed.get() == null)
                + " (bus holds " + EventBus.LISTENERS.size() + " listener, the leaked one)");
    }
}
```

```text title="Output" output="ListenerLeak.java"
leaky screen collected: false (bus still holds 1 listener)
events seen by the open screen: 1
fixed screen collected: true (bus holds 1 listener, the leaked one)
```

The leak's path to GC roots is `EventBus.LISTENERS` → lambda → `LeakyScreen` → its 1 MB image. A heap dump shows exactly that chain. Returning a closeable subscription makes the lifecycle explicit, and try-with-resources guarantees cleanup even when exceptions happen. Weak listeners are an alternative, but they can disappear unexpectedly if nothing else holds them.
````

## Knowledge check

```quiz
? When is a WeakReference's referent cleared?
+ At the next GC after the object is no longer strongly or softly reachable
- Only when memory is low
- Never, until get() returns null
> Soft references wait for memory pressure; weak ones don't.

? What does PhantomReference.get() return?
+ Always null
- The referent, until it is collected
- A copy of the referent
> Phantom references only signal collection through their queue.

? Which is guaranteed before the JVM throws OutOfMemoryError: Java heap space?
+ All softly reachable objects have been cleared
- All weak references have been enqueued
- finalize() has run for all objects
> Soft references are the JVM's last reserve.

? A WeakHashMap entry never disappears. What is a likely cause?
+ The value strongly references the key
- The map is too small
- The key's class overrides equals
> Values are held strongly, so they can keep their own keys reachable.

? Which pattern is NOT a typical Java memory leak?
+ A large temporary array created inside a method and not returned
- A static HashMap cache with no eviction
- A ThreadLocal set in a pooled thread and never removed
> Unreachable temporaries are reclaimed by the next GC.
```

## Key takeaways

- **Strong** keeps objects; **soft** is cleared under memory pressure (always before OOME); **weak** is cleared at the next GC; **phantom** signals collection via a **`ReferenceQueue`**. `WeakHashMap` has weak keys and strong values.
- Use **`Cleaner`** + `AutoCloseable` instead of `finalize()`, and keep cleanup actions from capturing the object.
- Java leaks are **unintended reachability**: static caches, listeners, `ThreadLocal`s in pools, mutable hash keys, captured outer objects, class-loader pins, unclosed native resources.
- Prove leaks with **old-gen-after-GC trends**, **heap dumps**, the **dominator tree** and **paths to GC roots** (MAT), and JFR's `OldObjectSample`.
- Prefer explicitly bounded caches and explicit unsubscription over soft or weak tricks.
