## Problem statement

A reporting service slowly runs out of memory: heap usage after each full GC rises all day until the pods are OOM-killed. A heap dump shows two dominators:
- an `ArrayList` inside the **event bus**, holding thousands of lambdas;
- a static **session cache** `HashMap`.

The starter contains a minimal reproduction:
- every request opens a `ReportScreen` (holding a 16 KB rendering buffer) that subscribes to the `EventBus` to refresh itself on data changes;
- sessions are cached in a static map;
- screens are "closed" when requests finish, but the memory is never freed.

**Your tasks**:
1. Explain the **retention path** (GC root → … → buffer) for each leak.
2. Fix the bus:
   - `subscribe` returns a `Subscription` (`AutoCloseable`) that unsubscribes;
   - `ReportScreen.close()` uses it;
   - publishing must be safe while listeners unsubscribe.
3. Provide `WeakEventBus` as a safety net, holding listeners through `WeakReference`s and purging cleared ones. Show its classic pitfall: a lambda that only the bus references disappears immediately.
4. Replace the unbounded cache with `BoundedSessionCache(maxEntries)`, which evicts least recently used sessions.
5. Prove the fixes: listener counts return to zero, a closed screen becomes **collectable** (its `WeakReference` is cleared after GC), and retained heap drops.

## Starter code

```java title="LeakHunt.java" starter="true"
import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class LeakHunt {
    private LeakHunt() { }

    interface Listener { void onEvent(String event); }

    interface Subscription extends AutoCloseable {
        @Override void close();                       // no checked exception
    }

    // The leaky bus: subscribe, but never unsubscribe
    static final class EventBus {
        private final List<Listener> listeners = new ArrayList<>();
        Subscription subscribe(Listener listener) {
            listeners.add(listener);
            return () -> { };                         // TODO: actually unsubscribe
        }
        void publish(String event) { for (Listener l : listeners) l.onEvent(event); }
        int listenerCount() { return listeners.size(); }
    }

    static final class WeakEventBus {
        Subscription subscribe(Listener listener) { throw new UnsupportedOperationException("TODO"); }
        void publish(String event) { throw new UnsupportedOperationException("TODO"); }
        int listenerCount() { throw new UnsupportedOperationException("TODO"); }
    }

    // The leaky cache: static, unbounded
    static final class SessionCache {
        private static final Map<String, byte[]> SESSIONS = new HashMap<>();
        static void put(String id, byte[] data) { SESSIONS.put(id, data); }
        static int size() { return SESSIONS.size(); }
    }

    static final class BoundedSessionCache {
        BoundedSessionCache(int maxEntries) { }
        void put(String id, byte[] data) { throw new UnsupportedOperationException("TODO"); }
        byte[] get(String id) { throw new UnsupportedOperationException("TODO"); }
        int size() { throw new UnsupportedOperationException("TODO"); }
    }

    static final class ReportScreen implements AutoCloseable {
        private final byte[] renderBuffer = new byte[16 * 1024];
        private final Subscription subscription;
        int refreshes;

        ReportScreen(EventBus bus) {
            subscription = bus.subscribe(this::refresh);     // the lambda captures 'this'
        }

        private void refresh(String event) { refreshes++; renderBuffer[0]++; }

        @Override public void close() { /* TODO: release the subscription */ }
    }

    static long usedHeapAfterGc() {
        for (int i = 0; i < 3; i++) System.gc();
        Runtime rt = Runtime.getRuntime();
        return rt.totalMemory() - rt.freeMemory();
    }

    static boolean collectable(WeakReference<?> ref) {
        for (int i = 0; i < 20 && ref.get() != null; i++) System.gc();
        return ref.get() == null;
    }

    @SuppressWarnings("try")                                 // the screens are used only for their lifecycle
    public static void main(String[] args) {
        long baseline = usedHeapAfterGc();
        EventBus bus = new EventBus();
        for (int i = 0; i < 2_000; i++) {
            try (ReportScreen screen = new ReportScreen(bus)) {
                bus.publish("data-changed");
            }
        }
        long retainedMb = (usedHeapAfterGc() - baseline) / (1024 * 1024);
        System.out.println("2,000 screens opened and closed -> listeners still registered: " + bus.listenerCount()
                + ", retained heap above 25 MB: " + (retainedMb > 25));
        ReportScreen probe = new ReportScreen(bus);
        WeakReference<ReportScreen> ref = new WeakReference<>(probe);
        probe.close();
        probe = null;
        System.out.println("closed screen collectable: " + collectable(ref));
        for (int i = 0; i < 10_000; i++) SessionCache.put("session-" + i, new byte[1024]);
        System.out.println("static session cache after 10,000 sessions: " + SessionCache.size() + " entries");
    }
}
```

## Hints

````hint title="Hint 1: find the path from a GC root"
An object leaks when something **reachable from a GC root** still references it:
- `bus` (a local of `main`, or a long-lived singleton in a real service) → `listeners` (`ArrayList`) → the lambda `this::refresh` → **the captured `ReportScreen`** → `renderBuffer`;
- the class `SessionCache` (classes are GC roots while their loader lives) → the static `SESSIONS` map → every entry.

"Closing" the screen didn't break any of those references. In a heap analyser (MAT), "Path to GC Roots" shows exactly these chains.
````

````hint title="Hint 2: unsubscription and safe publishing"
- `subscribe` should return `() -> listeners.remove(listener)`.
- A `CopyOnWriteArrayList` makes `publish` safe even if a listener unsubscribes (or subscribes) during the loop. It iterates a snapshot, and writes are rare compared with publishes.
- Store the `Subscription` in the screen and close it in `close()`, ideally via try-with-resources.
````

````hint title="Hint 3: weak listeners and bounded caches"
- A `WeakEventBus` stores `WeakReference<Listener>`, and `publish` and `listenerCount` remove references whose `get()` is `null`.
- **Pitfall**: `bus.subscribe(this::refresh)` creates a lambda that *nothing else* references, so the GC can clear it at any time and the screen silently stops refreshing. With weak buses, the subscriber must keep a strong reference to its listener (a field) for as long as it wants events.
- For the cache, use `LinkedHashMap` in access order with `removeEldestEntry` returning `size() > max`.
````

## Test cases

| Scenario | Expected |
|---|---|
| 2,000 screens opened and closed (fixed bus) | 0 listeners registered; retained heap under 5 MB |
| Same with the leaky starter | 2,000 listeners; over 25 MB retained |
| A closed screen, its reference dropped, after GC | its `WeakReference` cleared (collectable) |
| A listener unsubscribing during `publish` | no `ConcurrentModificationException`; the other listeners still notified |
| `WeakEventBus` with a lambda only the bus references | the listener disappears after GC (pitfall) |
| `WeakEventBus` with a listener held in a field | still notified while its owner is alive |
| `BoundedSessionCache(500)` after 10,000 sessions | size 500; the newest sessions are present, the oldest evicted |

## Expected output

```text title="Expected output" output="LeakHunt.java"
BEFORE: 2,000 screens never unsubscribed -> listeners 2000, retained heap above 25 MB: true
AFTER: 2,000 screens opened and closed -> listeners still registered: 0, retained heap under 5 MB: true
closed screen collectable: true
listener unsubscribing during publish: no exception, other listener notified 1 time(s), listeners now 1
weak bus after GC: listeners 1, unreferenced lambda called 0 time(s), screen-held listener called 1 time(s)
static cache: 10000 entries; bounded cache: 500 entries, newest present true, oldest evicted true
```

## Reference solution

````solution title="Reference solution (LeakHunt.java)"
```java title="LeakHunt.java" file="LeakHunt.java" run="-XX:+UseSerialGC -Xmx128m"
import java.lang.ref.WeakReference;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

public final class LeakHunt {
    private LeakHunt() { }

    interface Listener { void onEvent(String event); }

    interface Subscription extends AutoCloseable {
        @Override void close();                       // no checked exception
    }

    // Fix 1: explicit unsubscription; publishing iterates a snapshot
    static final class EventBus {
        private final List<Listener> listeners = new CopyOnWriteArrayList<>();

        Subscription subscribe(Listener listener) {
            listeners.add(listener);
            return () -> listeners.remove(listener);
        }

        void publish(String event) {
            for (Listener l : listeners) l.onEvent(event);   // safe even if a listener unsubscribes here
        }

        int listenerCount() { return listeners.size(); }
    }

    // Fix 2 (safety net): the bus doesn't keep listeners alive
    static final class WeakEventBus {
        private final List<WeakReference<Listener>> listeners = new CopyOnWriteArrayList<>();

        Subscription subscribe(Listener listener) {
            WeakReference<Listener> ref = new WeakReference<>(listener);
            listeners.add(ref);
            return () -> listeners.remove(ref);
        }

        void publish(String event) {
            for (WeakReference<Listener> ref : listeners) {
                Listener l = ref.get();                       // read once: it may be cleared at any moment
                if (l == null) listeners.remove(ref); else l.onEvent(event);
            }
        }

        int listenerCount() {
            listeners.removeIf(ref -> ref.get() == null);
            return listeners.size();
        }
    }

    // The original leak, kept for comparison
    static final class SessionCache {
        private static final Map<String, byte[]> SESSIONS = new HashMap<>();
        static void put(String id, byte[] data) { SESSIONS.put(id, data); }
        static int size() { return SESSIONS.size(); }
    }

    // Fix 3: a bounded LRU cache
    static final class BoundedSessionCache {
        private final Map<String, byte[]> sessions;

        BoundedSessionCache(int maxEntries) {
            this.sessions = new LinkedHashMap<>(16, 0.75f, true) {
                private static final long serialVersionUID = 1L;

                @Override
                protected boolean removeEldestEntry(Map.Entry<String, byte[]> eldest) {
                    return size() > maxEntries;
                }
            };
        }

        synchronized void put(String id, byte[] data) { sessions.put(id, data); }
        synchronized byte[] get(String id) { return sessions.get(id); }
        synchronized int size() { return sessions.size(); }
    }

    static final class ReportScreen implements AutoCloseable {
        private final byte[] renderBuffer = new byte[16 * 1024];
        private final Subscription subscription;
        int refreshes;

        ReportScreen(EventBus bus) {
            subscription = bus.subscribe(this::refresh);     // the lambda captures 'this'
        }

        private void refresh(String event) { refreshes++; renderBuffer[0]++; }

        @Override public void close() { subscription.close(); }   // breaks bus -> lambda -> screen
    }

    // A screen for the weak bus keeps its own strong reference to the listener
    static final class WeakAwareScreen {
        int refreshes;
        private final Listener listener = e -> refreshes++;  // strong reference: lives as long as the screen

        WeakAwareScreen(WeakEventBus bus) {
            bus.subscribe(listener);
        }
    }

    static long usedHeapAfterGc() {
        for (int i = 0; i < 3; i++) System.gc();
        Runtime rt = Runtime.getRuntime();
        return rt.totalMemory() - rt.freeMemory();
    }

    static boolean collectable(WeakReference<?> ref) {
        for (int i = 0; i < 20 && ref.get() != null; i++) System.gc();
        return ref.get() == null;
    }

    // The leaky behaviour, for comparison: subscribe without ever unsubscribing
    static void leakyRequests(EventBus bus, int n) {
        for (int i = 0; i < n; i++) {
            ReportScreen screen = new ReportScreen(bus);
            bus.publish("data-changed");
            // missing: screen.close()
        }
    }

    @SuppressWarnings("try")                                 // the screens are used only for their lifecycle
    public static void main(String[] args) {
        long baseline = usedHeapAfterGc();
        EventBus leakyBus = new EventBus();
        leakyRequests(leakyBus, 2_000);
        long leakedMb = (usedHeapAfterGc() - baseline) / (1024 * 1024);
        System.out.println("BEFORE: 2,000 screens never unsubscribed -> listeners " + leakyBus.listenerCount()
                + ", retained heap above 25 MB: " + (leakedMb > 25));
        leakyBus = null;

        baseline = usedHeapAfterGc();
        EventBus bus = new EventBus();
        for (int i = 0; i < 2_000; i++) {
            try (ReportScreen screen = new ReportScreen(bus)) {
                bus.publish("data-changed");
            }
        }
        long retainedMb = (usedHeapAfterGc() - baseline) / (1024 * 1024);
        System.out.println("AFTER: 2,000 screens opened and closed -> listeners still registered: " + bus.listenerCount()
                + ", retained heap under 5 MB: " + (retainedMb < 5));

        ReportScreen probe = new ReportScreen(bus);
        WeakReference<ReportScreen> ref = new WeakReference<>(probe);
        probe.close();
        probe = null;
        System.out.println("closed screen collectable: " + collectable(ref));

        Subscription[] self = new Subscription[1];
        int[] others = { 0 };
        self[0] = bus.subscribe(e -> self[0].close());       // unsubscribes while being notified
        bus.subscribe(e -> others[0]++);
        bus.publish("tick");
        System.out.println("listener unsubscribing during publish: no exception, other listener notified " + others[0]
                + " time(s), listeners now " + bus.listenerCount());

        WeakEventBus weakBus = new WeakEventBus();
        int[] lambdaCalls = { 0 };
        weakBus.subscribe(e -> lambdaCalls[0]++);             // pitfall: nothing else references this lambda
        WeakAwareScreen screen = new WeakAwareScreen(weakBus);
        usedHeapAfterGc();
        weakBus.publish("tick");
        System.out.println("weak bus after GC: listeners " + weakBus.listenerCount() + ", unreferenced lambda called "
                + lambdaCalls[0] + " time(s), screen-held listener called " + screen.refreshes + " time(s)");

        for (int i = 0; i < 10_000; i++) SessionCache.put("session-" + i, new byte[1024]);
        BoundedSessionCache cache = new BoundedSessionCache(500);
        for (int i = 0; i < 10_000; i++) cache.put("session-" + i, new byte[1024]);
        System.out.println("static cache: " + SessionCache.size() + " entries; bounded cache: " + cache.size()
                + " entries, newest present " + (cache.get("session-9999") != null) + ", oldest evicted " + (cache.get("session-0") == null));
    }
}
```
````

## Step-by-step explanation

````solution title="Step-by-step explanation"
**Diagnosing**
1. **The symptom**: the heap *after full GC* (the live set) keeps rising. A normal heap is a sawtooth around a stable floor.
2. **The evidence**: a heap dump (`jcmd <pid> GC.heap_dump` or `-XX:+HeapDumpOnOutOfMemoryError`), opened in a dominator tree, shows the biggest retainers. Then "Path to GC Roots" for one leaked `ReportScreen` shows: `EventBus` (reachable from a static/singleton) → `listeners` → `Object[]` → lambda (`LeakHunt$$Lambda…`, field `arg$1`) → `ReportScreen` → `byte[16384]`.
3. **The root cause**: subscribing created a reference *from a long-lived object to a short-lived one*, and nothing removed it. The lambda `this::refresh` captures `this`, so registering it is the same as registering the screen. The static cache is the same pattern: a long-lived map, short-lived contents, no removal.

**Fixing**
1. **Explicit lifecycle (preferred)**: `subscribe` returns a `Subscription`, and `close()` removes the listener. Making the screen `AutoCloseable` lets try-with-resources guarantee the cleanup even if the request fails. After 2,000 requests, the bus is back to 0 listeners, and a probe screen's `WeakReference` is cleared by GC: the screen is collectable.
2. **Safe publishing**: `CopyOnWriteArrayList` iterates an immutable snapshot, so a listener can unsubscribe itself (or others) during `publish` without `ConcurrentModificationException`. That's the right trade-off for listener lists: frequent reads, rare writes.
3. **Weak listeners (a safety net, not a substitute)**: the bus holds `WeakReference`s, so forgotten subscribers can't leak. But **weak references to lambdas are a trap**: the demo's anonymous lambda was collected before the first event and never called, while the listener stored in a screen field kept working. Weak buses require subscribers to hold their listeners strongly, which makes them easy to misuse. Prefer explicit unsubscription.
4. **Bounded cache**: the static map grew to 10,000 entries (and would never stop). The LRU version stays at 500, keeping the hot (newest) sessions. Production caches add expiry (`expireAfterAccess`) and use Caffeine.

**Proving it**: listener counts, cache sizes, retained heap after GC (with SerialGC and a fixed heap, for repeatable numbers) and `WeakReference` probes turn "it seems better" into evidence. The same probes make good regression tests.
````

## Edge cases

- **Forgetting `close()` on an exception path**: use try-with-resources or `finally`, which is exactly what the fixed demo does.
- **Anonymous inner classes and lambdas** capture `this` whenever they use instance members, so they're a frequent hidden retention path.
- **`WeakHashMap`** keys are weak, but **values that reference their own key** keep the entry alive forever. It's also unsuitable for `String` keys that may be interned.
- **`ThreadLocal`s in thread pools**: values live as long as the pooled thread unless `remove()` is called. That's the same leak class, with a thread as the GC root.
- **Class loader leaks**: a static reference from a shared library class to an application class keeps the whole web application's class loader (and Metaspace) alive after redeploys.
- **Measurement noise**: `Runtime.totalMemory() - freeMemory()` after `System.gc()` is approximate. Use thresholds rather than exact byte counts, or count objects (listeners, entries) as primary evidence.
- **Soft references** as a cache are cleared only under memory pressure, which causes erratic GC behaviour. A bounded cache with explicit eviction is more predictable.
- **Non-capturing lambdas** (`e -> { }`) are created once and cached by the JVM at their call site, so a weak reference to one is *never* cleared. Capturing lambdas (using locals or `this`) create a new object on each evaluation. Don't base lifecycle logic on lambda identity.
- **Testing collectability**: a local variable keeps its object reachable until the method returns, at least in interpreted code, even after its block ends. Create the object in a helper method, as the tests do, before expecting the GC to clear it.

## JUnit tests

```java title="LeakHuntTest.java" file="LeakHuntTest.java" test="LeakHunt.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.lang.ref.WeakReference;
import org.junit.jupiter.api.Test;

class LeakHuntTest {
    @Test
    void subscriptionCloseRemovesListener() {
        LeakHunt.EventBus bus = new LeakHunt.EventBus();
        int[] calls = { 0 };
        LeakHunt.Subscription s = bus.subscribe(e -> calls[0]++);
        bus.publish("a");
        s.close();
        bus.publish("b");
        assertEquals(1, calls[0]);
        assertEquals(0, bus.listenerCount());
    }

    @Test
    void closedScreensDoNotAccumulate() {
        LeakHunt.EventBus bus = new LeakHunt.EventBus();
        for (int i = 0; i < 500; i++) {
            try (LeakHunt.ReportScreen screen = new LeakHunt.ReportScreen(bus)) {
                bus.publish("x");
                assertEquals(1, screen.refreshes);
            }
        }
        assertEquals(0, bus.listenerCount());
    }

    @Test
    void closedScreenIsCollectable() {
        LeakHunt.EventBus bus = new LeakHunt.EventBus();
        LeakHunt.ReportScreen screen = new LeakHunt.ReportScreen(bus);
        WeakReference<LeakHunt.ReportScreen> ref = new WeakReference<>(screen);
        screen.close();
        screen = null;
        assertTrue(LeakHunt.collectable(ref), "the bus must not retain closed screens");
    }

    @Test
    void unsubscribingDuringPublishIsSafe() {
        LeakHunt.EventBus bus = new LeakHunt.EventBus();
        LeakHunt.Subscription[] self = new LeakHunt.Subscription[1];
        int[] others = { 0 };
        self[0] = bus.subscribe(e -> self[0].close());
        bus.subscribe(e -> others[0]++);
        bus.publish("tick");
        bus.publish("tock");
        assertEquals(2, others[0]);
        assertEquals(1, bus.listenerCount());
    }

    // In its own method, so no stack slot of the test keeps the listener alive
    private static WeakReference<LeakHunt.Listener> subscribeUnreferenced(LeakHunt.WeakEventBus bus) {
        int[] ignored = { 0 };
        LeakHunt.Listener temp = e -> ignored[0]++;      // capturing lambda: a new object per evaluation
        bus.subscribe(temp);
        return new WeakReference<>(temp);
    }

    @Test
    void weakBusDropsUnreferencedListenersButKeepsHeldOnes() {
        LeakHunt.WeakEventBus bus = new LeakHunt.WeakEventBus();
        int[] held = { 0 };
        LeakHunt.Listener strong = e -> held[0]++;
        bus.subscribe(strong);
        WeakReference<LeakHunt.Listener> probe = subscribeUnreferenced(bus);
        assertTrue(LeakHunt.collectable(probe));
        bus.publish("x");
        assertEquals(1, held[0]);
        assertEquals(1, bus.listenerCount());
        assertNotNull(strong);
    }

    @Test
    void boundedCacheEvictsLeastRecentlyUsed() {
        LeakHunt.BoundedSessionCache cache = new LeakHunt.BoundedSessionCache(3);
        cache.put("a", new byte[1]);
        cache.put("b", new byte[1]);
        cache.put("c", new byte[1]);
        cache.get("a");                                   // a is now most recent
        cache.put("d", new byte[1]);                      // evicts b
        assertEquals(3, cache.size());
        assertNull(cache.get("b"));
        assertNotNull(cache.get("a"));
        for (int i = 0; i < 1_000; i++) cache.put("s" + i, new byte[1]);
        assertEquals(3, cache.size());
    }
}
```
