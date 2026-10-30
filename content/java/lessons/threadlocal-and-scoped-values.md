## Concept explanation

### ThreadLocal: one variable, one value per thread

A `ThreadLocal<T>` gives **each thread its own independent copy** of a value:

```java
private static final ThreadLocal<SimpleDateFormat> FORMAT =
        ThreadLocal.withInitial(() -> new SimpleDateFormat("yyyy-MM-dd"));   // lazily, per thread

FORMAT.get().format(date);      // this thread's instance, no locking needed
FORMAT.set(other);              // replaces this thread's value only
FORMAT.remove();                // clears this thread's value
```

Two uses dominate:
1. **Per-thread instances of non-thread-safe objects** (`SimpleDateFormat`, `Random` before `ThreadLocalRandom`, buffers), avoiding both locks and allocation per call.
2. **Implicit context** carried through a call chain without passing parameters: the current user and transaction (Spring Security's `SecurityContextHolder`, `TransactionSynchronizationManager`), the request id in log lines (SLF4J's **MDC**), locale.

### The big pitfall: thread pools

A thread-local value lives **as long as the thread**, unless removed. Pool threads live forever and are reused by unrelated tasks, so:
- **data leaks between requests**: task B sees the user that task A set, which is a **security bug**;
- **memory leaks**: values, and through them whole class loaders after a redeploy, stay reachable.

The rule: **every `set` in pooled code has a matching `remove()` in `finally`**:

```java
CURRENT_USER.set(user);
try {
    handle(request);
} finally {
    CURRENT_USER.remove();
}
```

Context **doesn't follow work** to other threads either. A task submitted to an executor runs on a pool thread that doesn't have the submitter's values. Frameworks wrap tasks to capture and restore context (Spring's `TaskDecorator`, Micrometer context propagation).

### InheritableThreadLocal

The values are **copied to child threads at creation time** (`new Thread()` while the value is set). Later changes in either thread aren't shared. Pool threads were created long before a request arrived, so they **don't** inherit request context. That makes `InheritableThreadLocal` unreliable with executors.

### Scoped values (final in Java 25)

**`ScopedValue<T>`** (JEP 506; previews in Java 21–24) is the modern alternative for *context passing*:

```java
static final ScopedValue<User> CURRENT_USER = ScopedValue.newInstance();

ScopedValue.where(CURRENT_USER, user).run(() -> handle(request));   // bound only inside run()
CURRENT_USER.get();                                                  // anywhere below in the call chain
```

| | `ThreadLocal` | `ScopedValue` |
|---|---|---|
| Mutability | `set` any time | **immutable** binding (rebind only in a nested scope) |
| Lifetime | until `remove()` or thread death | **exactly the `run`/`call` scope**: automatic cleanup |
| Leak risk in pools | high | none |
| Child threads | copied per thread (`Inheritable…`), expensive | **shared** with subtasks of a `StructuredTaskScope`, cheap |
| Cost with millions of virtual threads | a map entry per thread | designed for it |

`ThreadLocal` remains right for **per-thread caches** of objects; `ScopedValue` is better for **passing context downward**.

## Internal working

- **Where the values live**: each `Thread` has a field `threadLocals` holding a **`ThreadLocalMap`**, an open-addressing hash table keyed by `ThreadLocal` objects (each with a fixed hash code), so `get()` is a lookup in the *current thread's* map: no locking, no contention.
- **Weak keys, strong values**: the map's entries are `WeakReference<ThreadLocal>` keys with **strong values**. If the `ThreadLocal` object itself becomes unreachable, its key is cleared, but the value stays until a later `get`/`set`/`remove` on that map happens to expunge stale entries. With long-lived pool threads, that may be never, which is the classic leak, especially when the value's class belongs to a redeployed web app.
- **`InheritableThreadLocal`** values are copied in the `Thread` constructor from the parent's `inheritableThreadLocals` map (`childValue()` can transform them). Copying happens once, at creation.
- **Virtual threads** support thread locals (each virtual thread has its own map). The JDK avoids caching objects in thread locals on virtual threads, and the guidance is to avoid big per-thread caches when threads are cheap and numerous.
- **Scoped values** are stored in a per-thread chain of immutable *snapshots*. `where(...).run(...)` pushes a binding for the duration of the call and pops it afterwards, even on exceptions. Lookups are cached per thread, so repeated `get()` is fast. Structured-concurrency subtasks see the parent's bindings, because the snapshot is shared rather than copied.

## Visual representation

```text title="ThreadLocal storage and the pool leak"
  Thread "http-1"                Thread "http-2"
  threadLocals (ThreadLocalMap)  threadLocals
   [ USER  -> "alice" ]           [ USER  -> "bob" ]
   [ FORMAT-> SDF#1   ]           [ FORMAT-> SDF#2 ]          USER.get() reads the CURRENT thread's map

  pooled thread "pool-1":  task A: USER.set("alice") ... (no remove)
                           task B: USER.get()  -> "alice"   <- leaked context: wrong user!
  fix:                     try { USER.set(...); work(); } finally { USER.remove(); }

  ScopedValue:   where(USER, "alice").run(() -> {  ...USER.get() == "alice"...  })   // unbound again afterwards
```

## Java code example

```java title="ThreadLocalDemo.java" file="ThreadLocalDemo.java"
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class ThreadLocalDemo {
    static final ThreadLocal<SimpleDateFormat> FORMAT = ThreadLocal.withInitial(() -> {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd");   // not thread-safe: one per thread
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f;
    });
    static final ThreadLocal<Integer> CALLS = ThreadLocal.withInitial(() -> 0);
    static final ThreadLocal<String> CURRENT_USER = new ThreadLocal<>();
    static final InheritableThreadLocal<String> REQUEST_ID = new InheritableThreadLocal<>();

    static String handle(String user) {
        CURRENT_USER.set(user);
        try {
            return "handled for " + CURRENT_USER.get();
        } finally {
            CURRENT_USER.remove();                               // always clean up in pooled threads
        }
    }

    public static void main(String[] args) throws Exception {
        // 1. Each thread gets its own value
        List<Thread> threads = new ArrayList<>();
        String[] report = new String[2];
        for (int t = 0; t < 2; t++) {
            int id = t;
            Thread thread = new Thread(() -> {
                for (int i = 0; i < (id == 0 ? 3 : 5); i++) {
                    CALLS.set(CALLS.get() + 1);
                }
                report[id] = "thread " + id + " counted " + CALLS.get() + " and formatted the epoch as "
                        + FORMAT.get().format(new Date(0)) + " with its own SimpleDateFormat";
            });
            threads.add(thread);
            thread.start();
        }
        for (Thread t : threads) {
            t.join();
        }
        System.out.println(report[0]);
        System.out.println(report[1]);
        System.out.println("main's own counter is untouched: " + CALLS.get());

        // 2. The pool leak: a reused thread still carries the previous task's value
        ExecutorService pool = Executors.newSingleThreadExecutor();      // one thread, reused for every task
        pool.submit(() -> CURRENT_USER.set("alice")).get();               // task A forgets to clean up
        System.out.println("task B sees user: " + pool.submit(CURRENT_USER::get).get() + "  <- leaked from task A");
        pool.submit(CURRENT_USER::remove).get();
        System.out.println("with set/remove in finally: " + pool.submit(() -> handle("bob")).get()
                + ", next task sees: " + pool.submit(CURRENT_USER::get).get());

        // 3. InheritableThreadLocal: copied when a thread is CREATED
        ExecutorService earlyPool = Executors.newSingleThreadExecutor();
        earlyPool.submit(() -> { }).get();                                // its thread exists before the request id is set
        REQUEST_ID.set("req-42");
        String[] childSaw = new String[1];
        Thread child = new Thread(() -> {
            childSaw[0] = REQUEST_ID.get();
            REQUEST_ID.set("changed-in-child");                           // doesn't affect the parent
        });
        child.start();
        child.join();
        System.out.println("child thread created after set() inherited: " + childSaw[0] + "; parent still has: " + REQUEST_ID.get());
        System.out.println("pool thread created earlier sees: " + earlyPool.submit(REQUEST_ID::get).get());

        pool.shutdown();
        earlyPool.shutdown();
    }
}
```

Scoped values on **Java 25**:

```java title="ScopedValueDemo.java" file="ScopedValueDemo.java" java="25"
import java.util.NoSuchElementException;

public class ScopedValueDemo {
    static final ScopedValue<String> USER = ScopedValue.newInstance();
    static final ScopedValue<String> TENANT = ScopedValue.newInstance();

    static String service() {                                    // deep in the call chain: no parameters
        return "user=" + USER.get() + ", tenant=" + TENANT.orElse("default");
    }

    public static void main(String[] args) throws Exception {
        System.out.println("outside any scope, bound: " + USER.isBound());
        ScopedValue.where(USER, "alice").run(() -> {
            System.out.println("in scope:  " + service());
            ScopedValue.where(USER, "admin").where(TENANT, "acme").run(() ->
                    System.out.println("nested:    " + service()));   // rebinding only for the nested scope
            System.out.println("back:      " + service());
        });
        String result = ScopedValue.where(USER, "bob").call(ScopedValueDemo::service);
        System.out.println("call() returned: " + result);
        try {
            USER.get();
        } catch (NoSuchElementException e) {
            System.out.println("after the scope ends, get() -> NoSuchElementException (nothing to clean up, nothing leaks)");
        }
    }
}
```

## Output

`ThreadLocalDemo.java`:

```text title="Output" output="ThreadLocalDemo.java"
thread 0 counted 3 and formatted the epoch as 1970-01-01 with its own SimpleDateFormat
thread 1 counted 5 and formatted the epoch as 1970-01-01 with its own SimpleDateFormat
main's own counter is untouched: 0
task B sees user: alice  <- leaked from task A
with set/remove in finally: handled for bob, next task sees: null
child thread created after set() inherited: req-42; parent still has: req-42
pool thread created earlier sees: null
```

`ScopedValueDemo.java` (Java 25):

```text title="Output" output="ScopedValueDemo.java"
outside any scope, bound: false
in scope:  user=alice, tenant=default
nested:    user=admin, tenant=acme
back:      user=alice, tenant=default
call() returned: user=bob, tenant=default
after the scope ends, get() -> NoSuchElementException (nothing to clean up, nothing leaks)
```

- Each thread counted independently and used its own `SimpleDateFormat`, with no synchronisation at all, and `main`'s counter stayed 0.
- In the single-thread pool, task B saw **"alice"**, set by task A. That's the real-world bug where one user's identity leaks into another user's request. With `set`/`remove` in `finally`, the next task saw `null`.
- The child thread created after `set()` inherited the request id, and its own change didn't affect the parent. The pool thread that existed beforehand saw nothing.
- Scoped values were visible exactly inside `run`/`call` (rebinding applied only to the nested scope), and automatically unbound afterwards.

## Real-world application

- **Logging context**: SLF4J/Logback **MDC** (`MDC.put("requestId", id)` in a filter, `MDC.clear()` in `finally`) adds request ids to every log line of the request.
- **Security and transactions**: Spring's `SecurityContextHolder` and `TransactionSynchronizationManager`, and Hibernate's current session, are thread-local by default. That's why `@Async` methods lose the security context unless it's propagated (`DelegatingSecurityContextExecutor`, `TaskDecorator`).
- **Tracing**: OpenTelemetry and Micrometer Tracing keep the current span in context storage and propagate it across executors and reactive operators.
- **Per-thread caches**: formatters, `MessageDigest`, compression buffers, reused to avoid allocation and locks.
- **Java 25+ code on virtual threads**: scoped values (with structured concurrency) are the intended replacement for request context.

## Common mistakes

- **No `remove()` in pooled threads**, causing data leaks between requests and memory or class-loader leaks.
- **Expecting thread-locals to follow tasks to other threads** (executors, `CompletableFuture`, parallel streams, reactive pipelines).
- **Relying on `InheritableThreadLocal` with thread pools.**
- **Storing large objects or big caches per thread**, which is especially costly with many virtual threads.
- **Using `ThreadLocal` as a hidden global** that makes code hard to test and reason about. Prefer explicit parameters when practical.
- **Using `ThreadLocal`s for mutable shared state**: each thread sees its own copy, which is the opposite of sharing.

## Interview questions

**Q1. What is a `ThreadLocal`, and how does it work internally?**

````reveal title="Answer"
A variable with a separate value per thread. `get()`/`set()` read and write the *current* thread's copy. Internally, each `Thread` has a `ThreadLocalMap`: an open-addressing hash table whose keys are weak references to `ThreadLocal` instances and whose values are strong references. Because the map belongs to the thread, there's no synchronisation. `withInitial` supplies a lazily created per-thread initial value.
````

**Q2. How can `ThreadLocal` cause memory leaks or data leaks?**

````reveal title="Answer"
In thread pools, threads live and are reused indefinitely. If a task sets a value and never removes it:
- the next task on the same thread can see it (a data or security leak);
- the value stays strongly reachable from the thread's map (a memory leak). In application servers this can pin a whole web-app class loader after redeploy.

The weak key doesn't help, because the value is strong and stale entries are only expunged lazily. Always call `remove()` in `finally`.
````

**Q3. What is `InheritableThreadLocal`, and what's its limitation?**

````reveal title="Answer"
A `ThreadLocal` whose value is copied from the parent thread into a child thread when the child is constructed (optionally transformed via `childValue`). After that, the two copies are independent. Its limitation: it only works for threads created after the value was set. Pool threads are created in advance and reused, so tasks submitted to executors don't get the submitter's values. Use explicit context capture and restore (task decorators) or scoped values instead.
````

**Q4. What are scoped values, and why were they introduced?**

````reveal title="Answer"
`ScopedValue` (final in Java 25) lets you bind a value for the dynamic extent of a call: `ScopedValue.where(KEY, v).run(...)`. Code inside, at any depth, reads it with `KEY.get()`. Bindings are immutable (rebinding is only possible in nested scopes), automatically end when the scope exits (no leaks, no `remove()`), and are cheaply shared with structured-concurrency subtasks. They were designed for virtual threads, where millions of threads make thread-local maps and inheritance copying expensive and error-prone.
````

**Q5. How do you propagate a request context to tasks running in a thread pool?**

````reveal title="Answer"
Capture the context on the submitting thread and restore it in the worker. Wrap the `Runnable`/`Callable`:
1. read the thread-local values at submission;
2. in the worker, set them before running the task;
3. clear or restore the previous values in `finally`.

Frameworks provide this: Spring's `TaskDecorator`, `DelegatingSecurityContextExecutorService`, MDC-aware executors, Micrometer's `ContextExecutorService`. With virtual threads and structured concurrency, scoped values are inherited by subtasks automatically.
````

## Hands-on exercise

Write a **context-propagating executor wrapper**:
- `static final ThreadLocal<String> REQUEST_ID`;
- `ContextExecutor.submit(Callable<T>)` captures `REQUEST_ID.get()` at submission time, then in the worker sets it before running the task and **restores the worker's previous value** in `finally` (removing it if there was none);
- use a single-thread pool so the same worker thread runs every task.

Submit three tasks from "requests" `req-1`, `req-2` and `req-3` (setting `REQUEST_ID` on `main` before each submit). Each task returns the id it sees. Finally, show the worker thread has **no** request id left afterwards.

````hint title="Hint"
`String captured = REQUEST_ID.get(); return delegate.submit(() -> { String previous = REQUEST_ID.get(); REQUEST_ID.set(captured); try { return task.call(); } finally { if (previous == null) REQUEST_ID.remove(); else REQUEST_ID.set(previous); } });`. Check the leftover state by submitting `REQUEST_ID::get` straight to the delegate, unwrapped.
````

````solution title="Solution"
```java title="ContextPropagation.java" file="ContextPropagation.java"
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

public class ContextPropagation {
    static final ThreadLocal<String> REQUEST_ID = new ThreadLocal<>();

    static final class ContextExecutor {
        private final ExecutorService delegate;

        ContextExecutor(ExecutorService delegate) {
            this.delegate = delegate;
        }

        <T> Future<T> submit(Callable<T> task) {
            String captured = REQUEST_ID.get();                    // read on the SUBMITTING thread
            return delegate.submit(() -> {
                String previous = REQUEST_ID.get();                // whatever the worker had before
                REQUEST_ID.set(captured);
                try {
                    return task.call();
                } finally {
                    if (previous == null) {
                        REQUEST_ID.remove();                       // leave the worker clean
                    } else {
                        REQUEST_ID.set(previous);
                    }
                }
            });
        }
    }

    public static void main(String[] args) throws Exception {
        ExecutorService pool = Executors.newSingleThreadExecutor();
        ContextExecutor executor = new ContextExecutor(pool);

        List<Future<String>> results = new ArrayList<>();
        for (String id : List.of("req-1", "req-2", "req-3")) {
            REQUEST_ID.set(id);                                    // e.g. set by a servlet filter
            results.add(executor.submit(() -> "task ran on " + Thread.currentThread().getName().replaceAll("\\d+", "N")
                    + " with " + REQUEST_ID.get()));
        }
        REQUEST_ID.remove();
        for (Future<String> f : results) {
            System.out.println(f.get());
        }
        System.out.println("worker's request id afterwards: " + pool.submit(REQUEST_ID::get).get());
        pool.shutdown();
    }
}
```

```text title="Output" output="ContextPropagation.java"
task ran on pool-N-thread-N with req-1
task ran on pool-N-thread-N with req-2
task ran on pool-N-thread-N with req-3
worker's request id afterwards: null
```

All three tasks ran on the same pooled thread, yet each saw its own submitter's request id, and the thread was left clean afterwards. Spring's `TaskDecorator` and MDC-aware executors follow the same pattern: capture at submission, set in the worker, and restore in `finally`.
````

## Knowledge check

```quiz
? Where does a ThreadLocal's value for a thread actually live?
+ In a ThreadLocalMap owned by that Thread object
- In a global synchronized map inside the ThreadLocal
- On the thread's stack
> That's why access needs no locking.

? A pooled thread runs task A, which sets a ThreadLocal and doesn't remove it. What can task B on the same thread see?
+ Task A's value
- null, always
- An exception
> Always remove() in finally.

? When are InheritableThreadLocal values copied to a child thread?
+ When the child Thread is constructed
- Every time the parent changes the value
- When the child first calls get()
> Pool threads created earlier don't inherit request values.

? What happens to a ScopedValue binding after ScopedValue.where(K, v).run(...) returns?
+ It is gone; K is unbound again (outside any other binding)
- It stays until remove() is called
- It's copied to the thread's ThreadLocalMap
> Bindings live exactly for the scope.

? In which Java release did ScopedValue become a final (non-preview) API?
+ Java 25
- Java 21
- Java 17
> It was previewed in Java 21 to 24.
```

## Key takeaways

- **`ThreadLocal`** = one value per thread, stored in the thread's own `ThreadLocalMap` (weak keys, **strong values**). Use it for per-thread instances and implicit context (MDC, security, transactions).
- In **thread pools**, always **`remove()` in `finally`**, or you'll leak data between requests and memory (even class loaders).
- Thread-locals **don't follow tasks** to other threads. Propagate context explicitly (task decorators); **`InheritableThreadLocal`** only copies at thread creation.
- **`ScopedValue`** (final in **Java 25**): immutable, scope-bound, leak-free context passing, designed for virtual threads and structured concurrency.
- Keep thread-local values small, especially with many virtual threads.
