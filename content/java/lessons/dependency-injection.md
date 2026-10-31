## Concept explanation

### Don't create your dependencies, receive them

A class that creates its collaborators (`new SmtpMailer()`, `new JdbcOrderRepository(url)`, `Instant.now()`) is **welded** to them. You can't test it without a mail server and a database, you can't swap implementations, and its dependencies are hidden inside method bodies. **Dependency injection (DI)** inverts this: a class **declares** what it needs, usually as constructor parameters typed by interfaces, and something outside provides them.

```java
// Without DI: hidden, hard-wired, untestable
class OrderService {
    private final OrderRepository repo = new JdbcOrderRepository("jdbc:postgresql://prod/db");
    void place(Order o) { o.setCreatedAt(Instant.now()); repo.save(o); }
}

// With DI: explicit, swappable, testable
class OrderService {
    private final OrderRepository repo;
    private final Clock clock;
    OrderService(OrderRepository repo, Clock clock) { this.repo = repo; this.clock = clock; }
    void place(Order o) { o.setCreatedAt(clock.instant()); repo.save(o); }
}
```

The objects are created and connected in one place, the **composition root**:
- `main()` in plain Java;
- the **container** (an `ApplicationContext`) in Spring;
- a component graph that Dagger generates at compile time.

That's **Inversion of Control**: the framework calls your code and supplies the objects, rather than your code fetching its own.

### Forms of injection

| Form | Verdict |
|---|---|
| **Constructor injection** | **preferred**: dependencies are explicit and `final`, the object is complete after construction, and tests just call `new`. A long parameter list is a design smell, a sign of too many responsibilities |
| Setter injection | for genuinely optional or reconfigurable dependencies |
| Field injection (`@Autowired private X x;`) | concise but hides dependencies, prevents `final`, and needs reflection (or a container) in tests. Avoid it in production code |
| **Service locator** (`Registry.get(X.class)` inside methods) | an anti-pattern: dependencies are hidden again, just behind a global lookup |

### Container concepts

| Concept | Meaning (Spring terms) |
|---|---|
| **Bean** | an object managed by the container |
| **Scope** | **singleton** (one per container, the default), **prototype** (a new one per injection), request/session (web), plus custom scopes |
| **Qualifier** | choose between several implementations: `@Qualifier("fast")`, `@Primary`, or inject `List<Strategy>`/`Map<String, Strategy>` |
| **Lifecycle** | `@PostConstruct` after injection, `@PreDestroy` on shutdown (in reverse creation order) |
| **Configuration** | `@Component` scanning, `@Bean` factory methods, `@Configuration` classes, profiles (`@Profile("test")`), properties |
| **Lazy and provider injection** | `ObjectProvider<T>`/`Provider<T>`/`@Lazy` to defer creation, access shorter-lived scopes, or break cycles |

## Internal working

How a reflective container such as **Spring** builds the graph:
1. **Collect definitions**: classpath scanning finds `@Component` classes (reading class files with ASM), and `@Configuration` classes contribute `@Bean` methods. Each becomes a `BeanDefinition` (class, scope, dependencies, init and destroy methods).
2. **Post-process definitions** (`BeanFactoryPostProcessor`): property placeholders, conditional beans (Spring Boot's `@ConditionalOnClass`, which powers auto-configuration).
3. **Instantiate singletons eagerly**, at start-up, so configuration errors fail fast:
   - choose the constructor (the single constructor, or the `@Autowired` one);
   - **recursively resolve each parameter** by type (and qualifier), creating dependencies first;
   - then call `newInstance`.
4. **Inject** fields and setters, then run **`BeanPostProcessor`s**. This is where `@PostConstruct` runs and where **AOP proxies** replace the raw object (`@Transactional`, `@Async`, `@Cacheable`), so other beans receive the proxy.
5. **Shut down** in reverse dependency order, calling `@PreDestroy`.

Further details:
- **Circular dependencies**:
  - with **constructor injection**, A needs B to be constructed and B needs A, so it's impossible: the container reports the cycle (`BeanCurrentlyInCreationException`), which is a design smell made visible;
  - Spring historically resolved field and setter cycles through an "early reference" cache, but Spring Boot 2.6+ **forbids cycles by default**.
  - The fix is to extract the shared logic into a third bean, use events, or inject a lazy `ObjectProvider`.
- **Compile-time DI**: **Dagger** (Android) and **Micronaut**/**Quarkus** compute the graph with annotation processors at build time and generate plain factory code: no reflection, fast start-up, errors reported at compile time, and native-image friendly. Spring's AOT engine (Spring Boot 3 native images) does a similar pre-computation.
- **Scopes and proxies**: injecting a short-lived (request) bean into a singleton requires a **scoped proxy**: the singleton holds a proxy that looks up the current request's instance on each call. Otherwise the singleton captures one request's object forever.

## Visual representation

```text title="A container resolving a dependency graph"
 get(CheckoutController)
   needs OrderService            -> get(OrderService)
       needs OrderRepository        -> binding: InMemoryOrderRepository -> create, run @Init, cache (singleton)
       needs PaymentGateway         -> binding: FakeGateway             -> create, cache
       needs Clock                  -> registered instance (Clock.fixed)
     create OrderService, cache
   needs RequestContext          -> @Prototype: create a NEW one every time
 create CheckoutController

 cycle: get(A) -> needs B -> get(B) -> needs A -> A is "in creation" -> error "A -> B -> A"
```

## Java code example

This program builds a **tiny reflective DI container**, around 60 lines with the same core algorithm as Spring and Guice. It's followed by the hand-written composition root it replaces.

```java title="TinyContainer.java" file="TinyContainer.java"
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class TinyContainer {
    @Retention(RetentionPolicy.RUNTIME) @Target(ElementType.TYPE) @interface Prototype { }
    @Retention(RetentionPolicy.RUNTIME) @Target(ElementType.METHOD) @interface Init { }
    @Retention(RetentionPolicy.RUNTIME) @Target(ElementType.CONSTRUCTOR) @interface Inject { }

    // ===================== the container =====================
    static final class Container {
        private final Map<Class<?>, Class<?>> bindings = new HashMap<>();
        private final Map<Class<?>, Object> singletons = new LinkedHashMap<>();
        private final Deque<Class<?>> inCreation = new ArrayDeque<>();

        <T> Container bind(Class<T> type, Class<? extends T> implementation) {
            bindings.put(type, implementation);
            return this;
        }

        <T> Container instance(Class<T> type, T object) {
            singletons.put(type, object);
            return this;
        }

        <T> T get(Class<T> type) {
            if (singletons.containsKey(type)) {
                return type.cast(singletons.get(type));
            }
            Class<?> impl = bindings.getOrDefault(type, type);
            if (impl.isInterface() || Modifier.isAbstract(impl.getModifiers())) {
                throw new IllegalStateException("no binding for " + type.getSimpleName());
            }
            boolean prototype = impl.isAnnotationPresent(Prototype.class);
            if (!prototype && singletons.containsKey(impl)) {
                return type.cast(singletons.get(impl));
            }
            if (inCreation.contains(impl)) {
                StringBuilder path = new StringBuilder();
                for (Iterator<Class<?>> it = inCreation.descendingIterator(); it.hasNext(); ) {
                    path.append(it.next().getSimpleName()).append(" -> ");
                }
                throw new IllegalStateException("circular dependency: " + path + impl.getSimpleName());
            }
            inCreation.push(impl);
            try {
                Constructor<?> ctor = constructorOf(impl);
                Object[] args = Arrays.stream(ctor.getParameterTypes()).map(this::get).toArray();   // resolve recursively
                Object bean = ctor.newInstance(args);
                Method[] methods = impl.getDeclaredMethods();
                Arrays.sort(methods, Comparator.comparing(Method::getName));
                for (Method m : methods) {
                    if (m.isAnnotationPresent(Init.class)) {
                        m.invoke(bean);
                    }
                }
                System.out.println("  created " + impl.getSimpleName() + (prototype ? " (prototype)" : " (singleton)")
                        + (args.length == 0 ? "" : " with " + Arrays.stream(args).map(a -> a.getClass().getSimpleName()).toList()));
                if (!prototype) {
                    singletons.put(impl, bean);
                }
                return type.cast(bean);
            } catch (InvocationTargetException e) {
                throw new IllegalStateException("failed to create " + impl.getSimpleName(), e.getCause());
            } catch (ReflectiveOperationException e) {
                throw new IllegalStateException("failed to create " + impl.getSimpleName(), e);
            } finally {
                inCreation.pop();
            }
        }

        private static Constructor<?> constructorOf(Class<?> impl) {
            Constructor<?>[] all = impl.getDeclaredConstructors();
            List<Constructor<?>> marked = Arrays.stream(all).filter(c -> c.isAnnotationPresent(Inject.class)).toList();
            if (marked.size() == 1) return marked.get(0);
            if (all.length == 1) return all[0];
            throw new IllegalStateException(impl.getSimpleName() + ": several constructors, mark one with @Inject");
        }
    }

    // ===================== the application =====================
    interface PaymentGateway { String charge(String orderId, long cents); }
    interface OrderRepository { void save(String orderId, String status); Map<String, String> all(); }

    static final class FakeGateway implements PaymentGateway {
        public String charge(String orderId, long cents) { return "approved " + orderId + " for " + cents; }
    }

    static final class InMemoryOrderRepository implements OrderRepository {
        private final Map<String, String> rows = new LinkedHashMap<>();
        @Init void seed() { rows.put("o-0", "ARCHIVED"); }
        public void save(String orderId, String status) { rows.put(orderId, status); }
        public Map<String, String> all() { return rows; }
    }

    static final class OrderService {
        private final OrderRepository repo;
        private final PaymentGateway gateway;
        private final Clock clock;

        OrderService(OrderRepository repo, PaymentGateway gateway, Clock clock) {
            this.repo = repo;
            this.gateway = gateway;
            this.clock = clock;
        }

        String place(String orderId, long cents) {
            String receipt = gateway.charge(orderId, cents);
            repo.save(orderId, "PAID at " + clock.instant());
            return receipt;
        }
    }

    @Prototype
    static final class RequestContext {
        private static int counter;
        final int requestNumber = ++counter;
    }

    @Prototype
    static final class CheckoutController {
        final OrderService service;
        final RequestContext context;

        CheckoutController(OrderService service, RequestContext context) {
            this.service = service;
            this.context = context;
        }
    }

    static final class A { A(B b) { } }
    static final class B { B(A a) { } }

    public static void main(String[] args) {
        Clock fixed = Clock.fixed(Instant.parse("2025-01-15T09:30:00Z"), ZoneOffset.UTC);

        System.out.println("container wiring:");
        Container container = new Container()
                .bind(PaymentGateway.class, FakeGateway.class)
                .bind(OrderRepository.class, InMemoryOrderRepository.class)
                .instance(Clock.class, fixed);
        CheckoutController first = container.get(CheckoutController.class);
        CheckoutController second = container.get(CheckoutController.class);
        System.out.println("place: " + first.service.place("o-1", 2_500));
        System.out.println("same OrderService singleton in both controllers: " + (first.service == second.service));
        System.out.println("RequestContext is prototype: request numbers " + first.context.requestNumber + " and " + second.context.requestNumber);
        System.out.println("repository after @Init seed and order: " + container.get(OrderRepository.class).all());

        for (Class<?> broken : List.of(A.class, Runnable.class)) {
            try {
                container.get(broken);
            } catch (IllegalStateException e) {
                System.out.println("error: " + e.getMessage());
            }
        }

        // The same graph, wired by hand in a composition root: no reflection, checked by the compiler
        System.out.println("manual wiring:");
        OrderRepository repo = new InMemoryOrderRepository();
        OrderService service = new OrderService(repo, new FakeGateway(), fixed);
        CheckoutController controller = new CheckoutController(service, new RequestContext());
        System.out.println("place: " + controller.service.place("o-2", 990) + ", repository " + repo.all());
    }
}
```

## Output

```text title="Output" output="TinyContainer.java"
container wiring:
  created InMemoryOrderRepository (singleton)
  created FakeGateway (singleton)
  created OrderService (singleton) with [InMemoryOrderRepository, FakeGateway, FixedClock]
  created RequestContext (prototype)
  created CheckoutController (prototype) with [OrderService, RequestContext]
  created RequestContext (prototype)
  created CheckoutController (prototype) with [OrderService, RequestContext]
place: approved o-1 for 2500
same OrderService singleton in both controllers: true
RequestContext is prototype: request numbers 1 and 2
repository after @Init seed and order: {o-0=ARCHIVED, o-1=PAID at 2025-01-15T09:30:00Z}
error: circular dependency: A -> B -> A
error: no binding for Runnable
manual wiring:
place: approved o-2 for 990, repository {o-2=PAID at 2025-01-15T09:30:00Z}
```

- **Resolution order**: the container resolved the graph **depth first**, creating dependencies before their dependents: repository (running its `@Init` method), gateway, service, then the controller. That's exactly the order Spring logs at start-up.
- **Scopes**: the controller and `RequestContext` are `@Prototype`, so each `get` built a new controller with a fresh context (request numbers 1 and 2). `OrderService` was created once and cached, so both controllers share the same singleton. The pre-built `Clock` was registered as an instance, as you'd register a `@Bean` method's result.
- **Fail fast**: the cycle `A -> B -> A` and the missing binding for `Runnable` were reported with precise messages, instead of a `StackOverflowError` or a `null` field.
- **Manual wiring** built the same graph in four lines with full compile-time checking. For small applications and libraries, that's often all you need.

## Real-world application

- **Spring Boot**:
  - constructor injection is the standard (Spring injects a class's single constructor without `@Autowired`), typically with Lombok's `@RequiredArgsConstructor` or records for configuration properties;
  - `@Configuration` classes with `@Bean` methods wire third-party objects (`ObjectMapper`, `RestClient`, `Clock`);
  - profiles and `@ConditionalOn…` swap implementations per environment (an in-memory fake in tests, the real gateway in production).
- **Testing**:
  - constructor-injected classes are tested with `new OrderService(fakeRepo, mockGateway, Clock.fixed(...))`, with no container at all;
  - Spring's test slices (`@WebMvcTest`, `@DataJpaTest`) and `@MockitoBean` replace beans in a partial context;
  - injecting `Clock`, `Random`/`IdGenerator` and the time zone makes time- and randomness-dependent code deterministic.
- **Strategy registries**: inject `List<PaymentProvider>` or `Map<String, PaymentProvider>` (bean name → bean) to dispatch dynamically. Adding a provider is just a new `@Component`.
- **Start-up time and native images**: Micronaut, Quarkus and Dagger move DI to compile time, and Spring AOT precomputes bean definitions. That matters for serverless functions and CLI tools.
- **Architecture**:
  - DI makes the hexagonal / ports-and-adapters structure natural: the domain defines `PaymentGateway` (a port), and infrastructure provides `StripeGateway` (an adapter), wired at the root;
  - ArchUnit tests can enforce that the domain never imports infrastructure.

## Common mistakes

- **Field injection** in production code: hidden dependencies, no `final`, and classes that can't be built without the container.
- **Service locator calls** (`ApplicationContext.getBean(...)`) sprinkled through business logic.
- **Constructors with 8+ dependencies**: the class has too many responsibilities, so split it.
- **Circular dependencies** worked around with `@Lazy` or setter injection instead of fixing the design (extract a third component, or use events).
- **Injecting a request- or session-scoped bean into a singleton** without a scoped proxy or `ObjectProvider`: one user's data leaks to everyone.
- **Calling `new` on a managed bean**: the object bypasses the container, so it gets no injection, no `@Transactional` proxy and no lifecycle callbacks.
- **Static access to time, randomness or configuration** (`Instant.now()`, `System.getenv` deep in logic), which makes tests nondeterministic. Inject `Clock` and configuration objects.
- **Doing heavy work in constructors** (network calls, threads): use lifecycle callbacks or explicit start methods, and keep construction cheap and side-effect-free.

## Interview questions

**Q1. Why is constructor injection preferred over field injection?**

````reveal title="Answer"
- Dependencies are explicit in the signature and can be `final`, so the object is immutable and fully initialised after construction.
- Required dependencies can't be forgotten: there's no half-built object with `null` fields.
- Tests can instantiate the class with plain `new` and fakes, without a container or reflection.
- Cycles fail fast at start-up.
- Long constructor parameter lists reveal classes that do too much.

Field injection hides all of this and ties the class to the container.
````

**Q2. What's the difference between IoC, DI and the service locator?**

````reveal title="Answer"
**Inversion of Control** is the general principle that a framework controls the flow and calls your code (callbacks, lifecycle) instead of your code driving everything. **Dependency injection** is one form of IoC for object creation: dependencies are pushed into an object from outside (constructor or setters). With a **service locator**, the object **pulls** dependencies from a registry (`locator.get(Repo.class)`). The dependencies are hidden and the code is coupled to the locator, which makes testing and reasoning harder, so DI is generally preferred.
````

**Q3. How does Spring create beans and apply `@Transactional`?**

````reveal title="Answer"
1. Spring scans for components and `@Bean` methods and registers `BeanDefinition`s.
2. For each singleton (eagerly at start-up), it picks a constructor, resolves the arguments by type and qualifier (creating them recursively), instantiates the bean, and injects fields and setters.
3. It runs `BeanPostProcessor`s: one calls `@PostConstruct`, and the auto-proxy creator wraps beans with matching advice (`@Transactional`, `@Async`, `@Cacheable`) in a JDK or CGLIB proxy.
4. Other beans receive the proxy, whose interceptor opens and commits the transaction around each call.

This is why self-invocation bypasses `@Transactional`.
````

**Q4. How do you handle circular dependencies?**

````reveal title="Answer"
First, treat the cycle as a design problem. Two classes that need each other usually share a responsibility that should be extracted into a third component, or one direction should become an event or callback. With constructor injection, Spring can't resolve a cycle and reports it, and Spring Boot 2.6+ forbids cycles by default even for field injection. Technical escape hatches exist (`@Lazy` proxies, `ObjectProvider` lookups, setter injection), but they hide the coupling rather than remove it.
````

**Q5. Singleton vs prototype scope, and what goes wrong when you mix them?**

````reveal title="Answer"
A singleton bean has one instance per container, shared by all injection points: it should be stateless or thread-safe. A prototype bean gets a new instance for every injection or lookup, and the container doesn't manage its destruction. If a prototype or request-scoped bean is injected into a singleton, injection happens **once**, so the singleton keeps the same instance forever. Fix that with `ObjectProvider<T>.getObject()`/`Provider<T>` per use, a scoped proxy (`proxyMode = TARGET_CLASS`), or method injection (`@Lookup`).
````

## Hands-on exercise

Make a **time-dependent service testable** with constructor injection:
- `PromotionService` decides whether a coupon is valid. A coupon has a code, a percentage and a validity window `[startsAt, endsAt)`, comes from a `CouponRepository` (an interface), and is valid only inside its window **and** if `usage < limit` (tracked by the repository);
- `apply(String code, long cents)` returns the discounted price or throws `IllegalArgumentException` with the reason (`"unknown coupon"`, `"expired"`, `"not started"`, `"usage limit reached"`), and records a usage on success;
- write a **production composition root** (`Clock.systemUTC()`, an in-memory repository seeded with coupons) and a **test composition root** with `Clock.fixed`;
- in the test wiring, check behaviour **before**, **during** and **after** the window, and at the usage limit, deterministically.

````hint title="Hint"
Inject `Clock` and compare `clock.instant()` with the window: `now.isBefore(startsAt)` → not started, `!now.isBefore(endsAt)` → expired. For "time travel" in tests, create a new service with `Clock.fixed(...)` for each instant (or a mutable test clock). The repository can keep a `Map<String, Integer>` of usage counts.
````

````solution title="Solution"
```java title="PromotionWiring.java" file="PromotionWiring.java"
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

public class PromotionWiring {
    record Coupon(String code, int percentOff, Instant startsAt, Instant endsAt, int limit) { }

    interface CouponRepository {
        Optional<Coupon> find(String code);
        int usage(String code);
        void recordUsage(String code);
    }

    static final class InMemoryCouponRepository implements CouponRepository {
        private final Map<String, Coupon> coupons = new HashMap<>();
        private final Map<String, Integer> usage = new HashMap<>();

        InMemoryCouponRepository add(Coupon c) { coupons.put(c.code(), c); return this; }
        public Optional<Coupon> find(String code) { return Optional.ofNullable(coupons.get(code)); }
        public int usage(String code) { return usage.getOrDefault(code, 0); }
        public void recordUsage(String code) { usage.merge(code, 1, Integer::sum); }
    }

    static final class PromotionService {
        private final CouponRepository coupons;
        private final Clock clock;

        PromotionService(CouponRepository coupons, Clock clock) {   // dependencies are explicit
            this.coupons = coupons;
            this.clock = clock;
        }

        long apply(String code, long cents) {
            Coupon c = coupons.find(code).orElseThrow(() -> new IllegalArgumentException("unknown coupon"));
            Instant now = clock.instant();
            if (now.isBefore(c.startsAt())) throw new IllegalArgumentException("not started");
            if (!now.isBefore(c.endsAt())) throw new IllegalArgumentException("expired");
            if (coupons.usage(code) >= c.limit()) throw new IllegalArgumentException("usage limit reached");
            coupons.recordUsage(code);
            return cents - cents * c.percentOff() / 100;
        }
    }

    static CouponRepository seededRepository() {
        return new InMemoryCouponRepository()
                .add(new Coupon("DIWALI20", 20, Instant.parse("2025-10-18T00:00:00Z"), Instant.parse("2025-10-25T00:00:00Z"), 2));
    }

    // Production composition root
    static PromotionService production() {
        return new PromotionService(seededRepository(), Clock.systemUTC());
    }

    // Test composition root: a fixed clock makes time a test input
    static PromotionService at(String instant, CouponRepository repo) {
        return new PromotionService(repo, Clock.fixed(Instant.parse(instant), ZoneOffset.UTC));
    }

    static void attempt(String label, PromotionService service, String code) {
        try {
            System.out.println(label + ": 10000 -> " + service.apply(code, 10_000));
        } catch (IllegalArgumentException e) {
            System.out.println(label + ": rejected (" + e.getMessage() + ")");
        }
    }

    public static void main(String[] args) {
        System.out.println("production wiring created: " + (production() != null) + " (its result depends on today's date, so it isn't asserted)");

        CouponRepository repo = seededRepository();
        attempt("before the window", at("2025-10-17T23:59:59Z", repo), "DIWALI20");
        attempt("first use in window", at("2025-10-20T12:00:00Z", repo), "DIWALI20");
        attempt("second use in window", at("2025-10-21T08:00:00Z", repo), "DIWALI20");
        attempt("third use in window", at("2025-10-22T08:00:00Z", repo), "DIWALI20");
        attempt("at the end instant", at("2025-10-25T00:00:00Z", seededRepository()), "DIWALI20");
        attempt("unknown code", at("2025-10-20T12:00:00Z", repo), "FREESHIP");
    }
}
```

```text title="Output" output="PromotionWiring.java"
production wiring created: true (its result depends on today's date, so it isn't asserted)
before the window: rejected (not started)
first use in window: 10000 -> 8000
second use in window: 10000 -> 8000
third use in window: rejected (usage limit reached)
at the end instant: rejected (expired)
unknown code: rejected (unknown coupon)
```

Because `Clock` and `CouponRepository` are injected, every time-related rule, including the exact boundary instant (`endsAt` is exclusive), is tested deterministically with no mocking library, no container and no waiting. In Spring, the production wiring is a `@Bean Clock clock() { return Clock.systemUTC(); }`, and tests replace that one bean.
````

## Knowledge check

```quiz
? Which injection style makes dependencies explicit and allows final fields?
+ Constructor injection
- Field injection
- Service locator
> The object is complete after construction.

? Two beans need each other through their constructors. What does a DI container do?
+ Reports a circular dependency at start-up
- Creates both with null fields
- Picks one randomly
> Fix the design by extracting a third component or using events.

? A request-scoped bean is injected directly into a singleton. What is the problem?
+ The singleton keeps the first instance forever, sharing one request's data
- Nothing, the container re-injects it automatically
- Start-up fails
> Use a scoped proxy or ObjectProvider.

? Why inject java.time.Clock instead of calling Instant.now()?
+ Tests can pass Clock.fixed and get deterministic results
- Clock is faster
- Instant.now() is deprecated
> Time becomes an input.

? What distinguishes Dagger or Micronaut DI from Spring's classic approach?
+ The dependency graph is generated at compile time, without runtime reflection
- They don't support singletons
- They only support field injection
> Faster start-up and compile-time errors.
```

## Key takeaways

- **DI**: classes declare their dependencies (constructor parameters typed by interfaces), and a **composition root** or container creates and wires them. That gives testability, swappability and explicit dependencies.
- Prefer **constructor injection**; avoid field injection and service locators. Long constructors signal too many responsibilities.
- Containers resolve graphs recursively, cache singletons, create prototypes per injection, run lifecycle callbacks, and wrap beans in proxies (AOP).
- **Cycles** are design smells: extract a component or use events. Mind **scope mismatches** (scoped proxies, `ObjectProvider`).
- Inject time, randomness and configuration (`Clock`) to make code deterministic. Compile-time DI (Dagger, Micronaut) trades flexibility for start-up speed and earlier errors.
