## Concept explanation

### The proxy pattern, generated at run time

A **proxy** stands in front of a real object, implements the same interface, and adds behaviour around each call: logging, caching, retries, transactions, security checks, lazy loading, remote calls. Writing a proxy class by hand per interface is tedious. A **dynamic proxy** is generated **at run time** for any interface, and every call is routed to a single **`InvocationHandler`**:

```java
PriceService proxy = (PriceService) Proxy.newProxyInstance(
        PriceService.class.getClassLoader(),
        new Class<?>[] { PriceService.class },          // interfaces to implement
        (p, method, args) -> {                          // InvocationHandler
            System.out.println("calling " + method.getName());
            return method.invoke(target, args);         // forward (and unwrap exceptions!)
        });
```

### JDK proxies vs class-based proxies

| | JDK dynamic proxy (`java.lang.reflect.Proxy`) | Subclass proxy (CGLIB, ByteBuddy) |
|---|---|---|
| Proxies | **interfaces only** | concrete classes (generates a subclass) |
| Can't intercept | methods not in the interfaces | `final` classes and methods, `private` and `static` methods |
| `proxy instanceof Impl` | **false**: injecting by class type fails | true |
| Used by | Spring AOP for interfaces (when not proxying the target class), Java RMI, `java.lang.annotation` instances, MyBatis mappers, Retrofit, Feign | Spring (Boot's default `proxyTargetClass=true`), Hibernate lazy entities, Mockito mocks |

### What every handler must get right

1. **Unwrap `InvocationTargetException`.** `method.invoke` wraps whatever the target throws. If the handler rethrows the wrapper (a checked exception the interface doesn't declare), the proxy turns it into **`UndeclaredThrowableException`**, and callers can no longer catch the real exception.
2. **`equals`, `hashCode`, `toString`** also go through the handler (methods declared by `Object`), so decide what they mean.
3. **Default methods** can be called with **`InvocationHandler.invokeDefault(proxy, method, args)`** (Java 16+). The default method then runs with `this` = the proxy, so its internal calls are intercepted again.
4. **Self-invocation isn't intercepted.** When the real object calls its own method (`this.price()`), the call never passes through the proxy. This is why Spring's `@Transactional`/`@Cacheable` "doesn't work" on a method called from the same class.

## Internal working

- `Proxy.newProxyInstance(loader, interfaces, handler)`:
  - **generates a class at run time** (named `$Proxy0`, `$Proxy1`, …) that is `final`, extends `java.lang.reflect.Proxy`, and implements the given interfaces;
  - caches the generated class per (class loader, interface list), so the second proxy for the same interfaces reuses it;
  - places the class in the package of a non-public interface; for public interfaces it uses a dynamic module (`jdk.proxy1`, …) since JDK 16.
- **Each generated method** looks like:

  ```java
  public final long price(String sku) {
      try {
          return (Long) h.invoke(this, m3, new Object[] { sku });   // m3 = static Method field
      } catch (RuntimeException | Error e) {
          throw e;
      } catch (Throwable t) {
          throw new UndeclaredThrowableException(t);   // only if the interface method doesn't declare it
      }
  }
  ```

  - arguments are **boxed into an `Object[]`** and return values unboxed;
  - a `null` returned for a primitive return type throws `NullPointerException`.
- The `Method` passed to the handler is the **interface's** method, so annotations must be on the **interface** method for the handler to see them, not on the implementation class.
- **Subclass proxies** (ByteBuddy/CGLIB) generate bytecode for a subclass that overrides each non-final method to call an interceptor. They need a non-final class and an accessible constructor; Objenesis can skip constructors.
- **Cost**: a handler call involves an `Object[]` allocation, boxing and a reflective `Method.invoke` (method-handle based since JDK 18). That's fine for service-level calls, but too slow for inner loops.

## Visual representation

```text title="A chain of proxies around one service"
 caller --price("A1")--> [retry proxy] --> [cache proxy] --> [logging proxy] --> WarehousePriceService
                              |                 |                   |
                     retries IOException   memoises @Cached    records call and result
                                           methods

 self-invocation:  caller --quote()--> proxies --> real.quote() --this.price()--> real.price()
                                                                 (no proxy in this path: not cached, not logged)

 default method:   caller --describe()--> retry proxy --invokeDefault--> describe() runs with this = proxy
                                                       --this.price()--> back through all the proxies
```

## Java code example

```java title="ProxyDemo.java" file="ProxyDemo.java"
import java.io.IOException;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.lang.reflect.Proxy;
import java.lang.reflect.UndeclaredThrowableException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public class ProxyDemo {
    @Retention(RetentionPolicy.RUNTIME) @Target(ElementType.METHOD) @interface Cached { }
    @Retention(RetentionPolicy.RUNTIME) @Target(ElementType.METHOD) @interface Retry { int value(); }

    interface PriceService {
        @Cached long price(String sku);

        @Retry(3) String stockLevel(String sku) throws IOException;

        String quote(String sku, int quantity);

        default String describe(String sku) {
            return sku + " costs " + price(sku);         // "this" is whatever object runs this default method
        }
    }

    static class WarehousePriceService implements PriceService {
        int priceLookups;
        int stockAttempts;

        @Override
        public long price(String sku) {
            priceLookups++;
            return switch (sku) {
                case "A1" -> 1_999;
                case "B2" -> 4_500;
                default -> throw new IllegalArgumentException("unknown sku " + sku);
            };
        }

        @Override
        public String stockLevel(String sku) throws IOException {
            stockAttempts++;
            if (stockAttempts < 3) {
                throw new IOException("warehouse timeout #" + stockAttempts);
            }
            return sku + ": 12 in stock";
        }

        @Override
        public String quote(String sku, int quantity) {
            return quantity + " x " + sku + " = " + quantity * price(sku);   // self-invocation: bypasses proxies
        }

        @Override
        public String toString() {
            return "WarehousePriceService[lookups=" + priceLookups + "]";
        }
    }

    // forward to the target and unwrap the exception it threw
    static Object forward(Method method, Object target, Object[] args) throws Throwable {
        try {
            return method.invoke(target, args);
        } catch (InvocationTargetException e) {
            throw e.getCause();
        }
    }

    static <T> T proxy(Class<T> type, InvocationHandler handler) {
        return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[] { type }, handler));
    }

    static String describeCall(Method method, Object[] args) {
        String argList = args == null ? "" : Arrays.stream(args).map(String::valueOf).collect(Collectors.joining(", "));
        return method.getName() + "(" + argList + ")";
    }

    static <T> T logging(Class<T> type, T target, List<String> log) {
        return proxy(type, (p, method, args) -> {
            if (method.isDefault()) {
                return InvocationHandler.invokeDefault(p, method, args);
            }
            try {
                Object result = forward(method, target, args);
                log.add("log: " + describeCall(method, args) + " -> " + result);
                return result;
            } catch (Throwable t) {
                log.add("log: " + describeCall(method, args) + " threw " + t);
                throw t;
            }
        });
    }

    static <T> T caching(Class<T> type, T target, List<String> log) {
        Map<List<Object>, Object> cache = new HashMap<>();
        return proxy(type, (p, method, args) -> {
            if (method.isDefault()) {
                return InvocationHandler.invokeDefault(p, method, args);
            }
            if (!method.isAnnotationPresent(Cached.class)) {   // the interface method carries the annotation
                return forward(method, target, args);
            }
            List<Object> key = List.of(method.getName(), Arrays.asList(args));
            if (cache.containsKey(key)) {
                log.add("cache hit: " + describeCall(method, args));
                return cache.get(key);
            }
            Object result = forward(method, target, args);
            cache.put(key, result);
            return result;
        });
    }

    static <T> T retrying(Class<T> type, T target, List<String> log) {
        return proxy(type, (p, method, args) -> {
            if (method.isDefault()) {
                return InvocationHandler.invokeDefault(p, method, args);
            }
            Retry retry = method.getAnnotation(Retry.class);
            int attempts = retry == null ? 1 : retry.value();
            for (int attempt = 1; ; attempt++) {
                try {
                    return forward(method, target, args);
                } catch (IOException e) {
                    if (attempt >= attempts) {
                        throw e;
                    }
                    log.add("retry: attempt " + attempt + " of " + method.getName() + " failed (" + e.getMessage() + ")");
                }
            }
        });
    }

    static void step(String title, Object result, List<String> log) {
        System.out.println(title + " => " + result);
        log.forEach(line -> System.out.println("    " + line));
        log.clear();
    }

    public static void main(String[] args) throws IOException {
        WarehousePriceService real = new WarehousePriceService();
        List<String> log = new ArrayList<>();
        PriceService service = retrying(PriceService.class,
                caching(PriceService.class,
                        logging(PriceService.class, real, log), log), log);

        step("price(A1)", service.price("A1"), log);
        step("price(A1) again", service.price("A1"), log);
        step("describe(B2) [default method]", service.describe("B2"), log);
        step("quote(A1, 3) [self-invocation]", service.quote("A1", 3), log);
        step("stockLevel(A1)", service.stockLevel("A1"), log);
        try {
            service.price("ZZ");
        } catch (IllegalArgumentException e) {
            step("price(ZZ)", "caller caught " + e, log);
        }
        step("toString()", service.toString(), log);
        System.out.println("real price lookups: " + real.priceLookups);

        // A handler that forgets to unwrap InvocationTargetException
        PriceService naive = proxy(PriceService.class, (p, method, a) -> method.invoke(real, a));
        try {
            naive.price("ZZ");
        } catch (UndeclaredThrowableException e) {
            System.out.println("naive handler: " + e.getClass().getSimpleName() + " caused by "
                    + e.getCause().getClass().getSimpleName() + " caused by " + e.getCause().getCause());
        }

        Class<?> proxyClass = service.getClass();
        System.out.println("proxy class: isProxyClass " + Proxy.isProxyClass(proxyClass)
                + ", final " + Modifier.isFinal(proxyClass.getModifiers())
                + ", superclass " + proxyClass.getSuperclass().getSimpleName()
                + ", instanceof PriceService " + (service instanceof PriceService)
                + ", instanceof WarehousePriceService " + ((Object) service instanceof WarehousePriceService));
        System.out.println("same generated class reused for another proxy: "
                + (naive.getClass() == proxyClass));
    }
}
```

## Output

```text title="Output" output="ProxyDemo.java"
price(A1) => 1999
    log: price(A1) -> 1999
price(A1) again => 1999
    cache hit: price(A1)
describe(B2) [default method] => B2 costs 4500
    log: price(B2) -> 4500
quote(A1, 3) [self-invocation] => 3 x A1 = 5997
    log: quote(A1, 3) -> 3 x A1 = 5997
stockLevel(A1) => A1: 12 in stock
    log: stockLevel(A1) threw java.io.IOException: warehouse timeout #1
    retry: attempt 1 of stockLevel failed (warehouse timeout #1)
    log: stockLevel(A1) threw java.io.IOException: warehouse timeout #2
    retry: attempt 2 of stockLevel failed (warehouse timeout #2)
    log: stockLevel(A1) -> A1: 12 in stock
price(ZZ) => caller caught java.lang.IllegalArgumentException: unknown sku ZZ
    log: price(ZZ) threw java.lang.IllegalArgumentException: unknown sku ZZ
toString() => WarehousePriceService[lookups=4]
    log: toString() -> WarehousePriceService[lookups=4]
real price lookups: 4
naive handler: UndeclaredThrowableException caused by InvocationTargetException caused by java.lang.IllegalArgumentException: unknown sku ZZ
proxy class: isProxyClass true, final true, superclass Proxy, instanceof PriceService true, instanceof WarehousePriceService false
same generated class reused for another proxy: true
```

Reading the trace:
- **First `price(A1)`**: it went through all three proxies, and the logging proxy recorded the real call. **The second** was answered by the cache, so the real service was never reached.
- **`describe(B2)`**: a default method. The outer proxy ran it with `invokeDefault`, so its internal `price(B2)` call **re-entered the proxy chain** and was logged.
- **`quote(A1, 3)`**: the proxies saw `quote`, but the real object's internal `this.price(A1)` **bypassed them all**. There was no cache hit even though `A1` was cached, and no log line for the price. That's the self-invocation trap behind "my `@Transactional`/`@Cacheable` is ignored".
- **`stockLevel`**: the retry proxy retried two `IOException`s. Because every layer unwraps `InvocationTargetException`, each one saw the real exception type.
- **`price(ZZ)`**: the caller caught a plain `IllegalArgumentException`. The naive handler that rethrows the wrapper produced `UndeclaredThrowableException`, wrapping `InvocationTargetException`, wrapping the real exception.
- **`toString()`** was forwarded like any other method.
- The proxy is a **final class extending `Proxy`**; it's a `PriceService` but **not** a `WarehousePriceService`. All proxies for the same interface (and class loader) share one generated class.

## Real-world application

- **Spring AOP**: `@Transactional`, `@Cacheable`, `@Async`, `@Retryable`, `@PreAuthorize` and `@Validated` beans are proxies. The interceptor chain (`MethodInterceptor`s) is exactly the layered handlers above. Self-invocation and `private`/`final` methods are the classic pitfalls. Fixes: move the method to another bean, inject the proxy, or use AspectJ weaving.
- **Declarative HTTP and SQL clients**: Retrofit, OpenFeign, Spring's `@HttpExchange` interfaces, MyBatis mappers and Spring Data repositories are **interfaces with no implementation**. A proxy's handler turns each method call into an HTTP request or a query, based on the method's name and annotations.
- **Remote objects**: Java RMI stubs and many RPC frameworks use proxies to make remote calls look local.
- **Lazy loading**: Hibernate returns subclass proxies for `@ManyToOne(fetch = LAZY)` associations that load on first access (and throw `LazyInitializationException` outside a session).
- **Testing**: Mockito creates subclass proxies (ByteBuddy) whose interceptor records calls and returns stubbed answers (next lessons).
- **Decorators**: metrics, tracing (OpenTelemetry instrumentation), circuit breakers (Resilience4j decorators) and access control all wrap services with interceptors.

## Common mistakes

- **Not unwrapping `InvocationTargetException`**: callers get `UndeclaredThrowableException` instead of their exception.
- **Expecting interception on self-calls**, or on `private`/`final`/`static` methods with class-based proxies.
- **Injecting the implementation class** when the bean is a JDK proxy (`BeanNotOfRequiredTypeException` in Spring). Program to interfaces, or use class-based proxies.
- **Annotating the implementation method** when the handler reads the **interface** `Method`. Look up the target's method (`target.getClass().getMethod(...)`) or use a framework helper (Spring's `AopUtils.getMostSpecificMethod`).
- **Returning `null` for a primitive return type** from a handler: it throws `NullPointerException` in the generated method.
- **Forgetting `equals`/`hashCode`/`toString`**: they also reach the handler, and naive forwarding can break identity in sets and maps.
- **Proxying hot inner-loop calls**: the boxing, array allocation and reflection add up.

## Interview questions

**Q1. How does a JDK dynamic proxy work?**

````reveal title="Answer"
`Proxy.newProxyInstance(loader, interfaces, handler)` generates (once per loader and interface list) a final class extending `Proxy` and implementing the interfaces. Every method, including `equals`, `hashCode` and `toString`, packs its arguments into an `Object[]` and calls `handler.invoke(proxy, method, args)` with the interface's `Method`. The handler decides what to do: usually it adds behaviour and forwards to a target with `method.invoke`. Checked exceptions not declared by the interface method are wrapped in `UndeclaredThrowableException`.
````

**Q2. JDK proxy vs CGLIB proxy?**

````reveal title="Answer"
JDK proxies implement **interfaces** only: the proxy isn't an instance of the target class, and only interface methods are intercepted. CGLIB/ByteBuddy generate a **subclass** of the target class: they work without interfaces and pass `instanceof Impl`, but can't intercept `final` classes or methods, or `private` and `static` methods, and they need a usable constructor. Spring Boot defaults to class-based proxies (`proxyTargetClass=true`) to avoid injection-by-class surprises.
````

**Q3. Why doesn't `@Transactional` work when a method calls another `@Transactional` method of the same class?**

````reveal title="Answer"
The transaction logic lives in the proxy that wraps the bean. External callers go through the proxy, but inside the bean, `this.otherMethod()` is a plain call on the real object, so no proxy and no interceptor are involved. The inner method's annotation (for example `REQUIRES_NEW`) is ignored. Fixes:
- move the method to another bean;
- inject the bean's own proxy (`@Lazy` self-injection or `ObjectProvider`);
- `AopContext.currentProxy()` with `exposeProxy`;
- AspectJ compile-time or load-time weaving, which modifies the class itself.
````

**Q4. What is `UndeclaredThrowableException`?**

````reveal title="Answer"
A runtime exception the proxy throws when the handler throws a **checked** exception that the invoked interface method doesn't declare. The most common cause is a handler that lets `InvocationTargetException` from `method.invoke` escape instead of rethrowing `getCause()`. Callers then see `UndeclaredThrowableException`, wrapping `InvocationTargetException`, wrapping the real exception, and their `catch (IllegalArgumentException)` blocks stop working.
````

**Q5. How do Feign or Spring Data create implementations for interfaces you never implemented?**

````reveal title="Answer"
They create a dynamic proxy for the interface. The handler inspects the invoked `Method`'s name, parameters, generic return type and annotations (`@GetMapping("/users/{id}")`, `@Query`, or method-name conventions like `findByEmail`) and performs the corresponding HTTP request or database query. It converts arguments and results with codecs or mappers. The metadata is usually parsed once per method and cached, so each call is a lookup plus the I/O.
````

## Hands-on exercise

Implement a **`@Transactional` proxy**:
- `@Transactional` (runtime, methods) on interface methods of `AccountService { void transfer(String from, String to, long cents); long balance(String id); }`;
- a tiny `TxManager` over a `Map<String, Long>` of balances: `begin()` snapshots the map and prints `BEGIN`, `commit()` prints `COMMIT`, `rollback(Throwable)` restores the snapshot and prints `ROLLBACK (cause)`;
- the proxy wraps only `@Transactional` methods: begin, forward, commit, or roll back and **rethrow the original exception** on failure;
- `InMemoryAccounts.transfer` withdraws first, then deposits, throwing `IllegalArgumentException("unknown account x")` for an unknown destination, so a failure happens **after** the withdrawal.

Show a successful transfer, a failing transfer whose withdrawal is rolled back, and a non-transactional `balance` call.

````hint title="Hint"
Inside the handler, `method.getAnnotation(Transactional.class)` reads the interface method's annotation. Wrap `forward` in try/catch: `catch (Throwable t) { tx.rollback(t); throw t; }`. Snapshot with `new HashMap<>(balances)` and restore with `clear()` plus `putAll`.
````

````solution title="Solution"
```java title="TransactionalProxy.java" file="TransactionalProxy.java"
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.util.HashMap;
import java.util.Map;
import java.util.TreeMap;

public class TransactionalProxy {
    @Retention(RetentionPolicy.RUNTIME)
    @Target(ElementType.METHOD)
    @interface Transactional { }

    interface AccountService {
        @Transactional void transfer(String from, String to, long cents);

        long balance(String id);
    }

    static class TxManager {
        private final Map<String, Long> data;
        private Map<String, Long> snapshot;

        TxManager(Map<String, Long> data) {
            this.data = data;
        }

        void begin() {
            snapshot = new HashMap<>(data);
            System.out.println("  BEGIN");
        }

        void commit() {
            snapshot = null;
            System.out.println("  COMMIT");
        }

        void rollback(Throwable cause) {
            data.clear();
            data.putAll(snapshot);
            snapshot = null;
            System.out.println("  ROLLBACK (" + cause + ")");
        }
    }

    static class InMemoryAccounts implements AccountService {
        final Map<String, Long> balances;

        InMemoryAccounts(Map<String, Long> balances) {
            this.balances = balances;
        }

        @Override
        public void transfer(String from, String to, long cents) {
            balances.merge(from, -cents, Long::sum);                         // step 1: withdraw
            if (!balances.containsKey(to)) {
                throw new IllegalArgumentException("unknown account " + to);  // step 2 fails
            }
            balances.merge(to, cents, Long::sum);
        }

        @Override
        public long balance(String id) {
            return balances.getOrDefault(id, 0L);
        }
    }

    static AccountService transactional(AccountService target, TxManager tx) {
        return (AccountService) Proxy.newProxyInstance(AccountService.class.getClassLoader(),
                new Class<?>[] { AccountService.class },
                (proxy, method, args) -> {
                    boolean transactional = method.isAnnotationPresent(Transactional.class);
                    if (transactional) {
                        tx.begin();
                    }
                    try {
                        Object result = method.invoke(target, args);
                        if (transactional) {
                            tx.commit();
                        }
                        return result;
                    } catch (InvocationTargetException e) {
                        Throwable cause = e.getCause();
                        if (transactional) {
                            tx.rollback(cause);
                        }
                        throw cause;                                         // rethrow the original
                    }
                });
    }

    public static void main(String[] args) {
        Map<String, Long> balances = new HashMap<>(Map.of("ada", 10_000L, "bob", 2_000L));
        AccountService accounts = transactional(new InMemoryAccounts(balances), new TxManager(balances));

        System.out.println("transfer ada -> bob 2500");
        accounts.transfer("ada", "bob", 2_500);
        System.out.println("  balances " + new TreeMap<>(balances));

        System.out.println("transfer ada -> zed 1000");
        try {
            accounts.transfer("ada", "zed", 1_000);
        } catch (IllegalArgumentException e) {
            System.out.println("  caller caught: " + e.getMessage());
        }
        System.out.println("  balances " + new TreeMap<>(balances) + " (withdrawal undone)");

        System.out.println("balance(ada) without a transaction: " + accounts.balance("ada"));
    }
}
```

```text title="Output" output="TransactionalProxy.java"
transfer ada -> bob 2500
  BEGIN
  COMMIT
  balances {ada=7500, bob=4500}
transfer ada -> zed 1000
  BEGIN
  ROLLBACK (java.lang.IllegalArgumentException: unknown account zed)
  caller caught: unknown account zed
  balances {ada=7500, bob=4500} (withdrawal undone)
balance(ada) without a transaction: 7500
```

Spring's `TransactionInterceptor` follows the same shape: begin (or join an existing transaction, depending on propagation), proceed, then commit, or roll back and rethrow. One difference: by default Spring rolls back only for `RuntimeException` and `Error`, **not for checked exceptions**, unless you configure `rollbackFor`.
````

## Knowledge check

```quiz
? What can a JDK dynamic proxy implement?
+ Only interfaces
- Any non-final class
- Interfaces and abstract classes
> Class-based proxies need CGLIB or ByteBuddy.

? A handler rethrows the InvocationTargetException from method.invoke. What does the caller of a method without a throws clause receive?
+ UndeclaredThrowableException
- The original exception
- InvocationTargetException
> Always rethrow e.getCause().

? A bean method calls this.save(), where save() is @Transactional. Why isn't a transaction started?
+ The internal call goes to the real object, not through the proxy
- @Transactional only works on interfaces
- Transactions can't be nested
> Self-invocation bypasses the proxy.

? Which proxy calls go through the InvocationHandler?
+ Interface methods plus equals, hashCode and toString
- Only interface methods
- Only methods with annotations
> Object's public non-final methods are proxied too.

? Where must an annotation be placed for a JDK proxy handler to see it via method.getAnnotation?
+ On the interface method
- On the implementation class method
- On the implementation class
> The handler receives the interface's Method.
```

## Key takeaways

- A dynamic proxy is a **run-time-generated** class that implements interfaces and routes every call to one `InvocationHandler`: the basis of AOP, declarative clients, RPC stubs, and annotation instances.
- **JDK proxies are interface-only**; CGLIB and ByteBuddy subclass proxies cover classes but not `final`/`private`/`static` methods.
- Handlers must **unwrap `InvocationTargetException`**, handle `equals`/`hashCode`/`toString`, and use `invokeDefault` for default methods.
- **Self-invocation bypasses the proxy**. That's the root cause of most "`@Transactional`/`@Cacheable` doesn't work" bugs.
- Proxies can be layered (retry → cache → logging → target). This is exactly an interceptor chain.
