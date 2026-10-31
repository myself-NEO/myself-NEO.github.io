## Concept explanation

### Why and what to test

Automated tests let you change code without fear. They catch regressions, document behaviour, and push the design towards small, decoupled units. The **test pyramid** describes a healthy mix:

| Level | Scope | Speed | Tools |
|---|---|---|---|
| **Unit** (many) | one class or function, with collaborators replaced by test doubles | milliseconds | JUnit 5, AssertJ, Mockito |
| **Integration** (some) | real wiring with real infrastructure: database, HTTP, message broker | seconds | Spring Boot test slices, **Testcontainers**, WireMock |
| **End-to-end** (few) | the deployed system through its public interface | minutes | REST Assured, Playwright, Selenium |

A good unit test is **FIRST**: Fast, Independent (no order dependence), Repeatable (no clock, network or randomness surprises), Self-validating (asserts, no eyeballing), and Timely. Structure each test as **Arrange, Act, Assert** (or *given, when, then*), and test **behaviour through the public API**, not private implementation details.

### JUnit 5 (Jupiter) essentials

| Feature | Use |
|---|---|
| `@Test`, `@DisplayName("...")` | a test method, with a readable name |
| `@BeforeEach`/`@AfterEach`, `@BeforeAll`/`@AfterAll` | per-test and per-class setup and teardown |
| `assertEquals`, `assertTrue`, `assertThrows`, `assertAll`, `assertTimeout` | assertions. `assertThrows` returns the exception for further checks |
| `@ParameterizedTest` + `@ValueSource`/`@CsvSource`/`@MethodSource`/`@EnumSource` | one test, many inputs |
| `@Nested` | group related tests in inner classes with shared setup |
| `@Tag`, `@Disabled`, `@Timeout`, `@TempDir`, `@RepeatedTest` | filtering, skipping, time limits, temporary directories, repetition |
| `@ExtendWith(...)` | extensions: Mockito, Spring (`SpringExtension`), Testcontainers |

### Test doubles and Mockito

| Double | What it does |
|---|---|
| **Dummy** | passed but never used |
| **Stub** | returns canned answers (`when(repo.find(1)).thenReturn(user)`) |
| **Fake** | a working lightweight implementation (in-memory repository) |
| **Mock** | records interactions so you can **verify** them (`verify(mailer).send(...)`) |
| **Spy** | wraps a real object: real behaviour, but calls are recorded and some can be stubbed |

Mockito in one breath:
- create with **`mock(X.class)`** or `@Mock`, and inject with `@InjectMocks`;
- stub with **`when(...).thenReturn/thenThrow/thenAnswer`**;
- verify with **`verify(mock, times(n)/never()).method(args)`**, `inOrder`, `verifyNoInteractions`;
- capture arguments with **`ArgumentCaptor`**, and match loosely with **matchers** (`any()`, `eq()`, `argThat(...)`), using matchers for **all** arguments or none.

Mock **roles you own** (ports like `PaymentGateway`). Don't mock value objects, or types you don't own, in detail; prefer fakes or real objects where cheap.

## Internal working

- **The JUnit Platform** is the launcher API used by IDEs, Maven Surefire and Gradle.
  - **Test engines** are discovered via `ServiceLoader`: **Jupiter** (JUnit 5), **Vintage** (JUnit 4), and third-party engines such as Spock, Cucumber and jqwik.
  - The launcher builds a **test plan** (a tree: engine → classes → methods → parameterised invocations), executes it, and reports to `TestExecutionListener`s.
  - The examples below call the same API from `main`.
- **Jupiter's lifecycle**:
  - creates a **new instance of the test class for every test method** (`Lifecycle.PER_METHOD`), so instance fields can't leak state between tests;
  - runs `@BeforeEach` methods, the test, then `@AfterEach`;
  - **extensions** hook into each phase (parameter resolution, instance post-processing, exception handling). `MockitoExtension` creates `@Mock` fields there and checks for unused stubs afterwards ("strict stubs").
- **How Mockito works**:
  - `mock(X.class)` uses **ByteBuddy** to create a subclass (or, with the inline mock maker, the default since Mockito 5, it instruments the class itself via a Java agent, so **final classes and methods** can be mocked too);
  - every call is intercepted and recorded, and returns a default (`null`, `0`, `false`, empty collections, empty `Optional`) unless stubbed.
- **Stubbing syntax**:
  - `when(mock.charge("o-1", 2500))` first **calls** the mock (recorded as the "last invocation", returning the default);
  - `thenReturn` then attaches the answer to that recorded invocation;
  - that's why `when(spy.realMethod())` executes the real method; use `doReturn(x).when(spy).realMethod()` for spies.
- **Matchers**: `any()`/`eq()` push matchers onto a thread-local stack and return dummy values. Mixing raw values and matchers in one call, or using matchers outside stubbing or verification, leaves the stack inconsistent, hence `InvalidUseOfMatchersException`.
- **Verification** searches the recorded invocations. `inOrder` checks relative order; `verifyNoMoreInteractions` fails on unverified calls, which is often too strict, so use it sparingly.

## Visual representation

```text title="A unit test with test doubles"
            +-------------------- CheckoutService (real, under test) -----------------+
  test ---> | checkout(order)                                                          |
            |   gateway.charge(id, cents) --> [MOCK PaymentGateway]  stub: APPROVED    |
            |   repo.save(order, "PAID")  --> [MOCK OrderRepository] recorded          |
            |   mailer.send(email, subj)  --> [MOCK Mailer]          recorded          |
            +--------------------------------------------------------------------------+
  assert: returned "PAID"
  verify: repo.save(order, "PAID") once; mailer.send captured subject "Order o-1 confirmed"
  inOrder: charge before save          never: no email when DECLINED

 JUnit Platform: Launcher -> discovers engines (Jupiter) -> TestPlan tree -> execute -> listeners
                 (IDE, Maven Surefire, Gradle, or our main method)
```

## Java code example

The file holds the production code, a JUnit 5 + Mockito test class, and a `main` method that runs the tests through the **JUnit Platform launcher** and prints the results (sorted). This is what your IDE does when you click "Run tests":

```java title="CheckoutTests.java" file="CheckoutTests.java" classpath="junit"
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.platform.engine.discovery.DiscoverySelectors.selectClass;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.platform.engine.TestExecutionResult;
import org.junit.platform.launcher.Launcher;
import org.junit.platform.launcher.LauncherDiscoveryRequest;
import org.junit.platform.launcher.TestExecutionListener;
import org.junit.platform.launcher.TestIdentifier;
import org.junit.platform.launcher.TestPlan;
import org.junit.platform.launcher.core.LauncherDiscoveryRequestBuilder;
import org.junit.platform.launcher.core.LauncherFactory;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

// ===================== production code =====================
record Order(String id, String customerEmail, long totalCents) { }

enum PaymentResult { APPROVED, DECLINED }

interface PaymentGateway { PaymentResult charge(String orderId, long cents); }

interface OrderRepository {
    void save(Order order, String status);
    Optional<String> statusOf(String orderId);
}

interface Mailer { void send(String to, String subject); }

final class CheckoutService {
    private final PaymentGateway gateway;
    private final OrderRepository repository;
    private final Mailer mailer;

    CheckoutService(PaymentGateway gateway, OrderRepository repository, Mailer mailer) {
        this.gateway = gateway;
        this.repository = repository;
        this.mailer = mailer;
    }

    String checkout(Order order) {
        if (order.totalCents() <= 0) {
            throw new IllegalArgumentException("total must be positive");
        }
        PaymentResult result = gateway.charge(order.id(), order.totalCents());
        String status = result == PaymentResult.APPROVED ? "PAID" : "PAYMENT_FAILED";
        repository.save(order, status);
        if (result == PaymentResult.APPROVED) {
            mailer.send(order.customerEmail(), "Order " + order.id() + " confirmed");
        }
        return status;
    }

    static long shippingFee(long totalCents) {
        return totalCents >= 5_000 ? 0 : totalCents >= 2_000 ? 299 : 599;
    }
}

// ===================== tests =====================
@ExtendWith(MockitoExtension.class)
@DisplayName("CheckoutService")
class CheckoutServiceTest {
    @Mock PaymentGateway gateway;
    @Mock OrderRepository repository;
    @Mock Mailer mailer;
    @InjectMocks CheckoutService service;                 // constructor injection of the three mocks
    @Captor ArgumentCaptor<String> subject;

    final Order order = new Order("o-1", "ada@example.com", 2_500);

    @Test
    @DisplayName("approved payment: saves PAID and emails a confirmation")
    void approved() {
        when(gateway.charge("o-1", 2_500)).thenReturn(PaymentResult.APPROVED);   // arrange

        String status = service.checkout(order);                                // act

        assertEquals("PAID", status);                                           // assert
        verify(repository).save(order, "PAID");
        verify(mailer).send(eq("ada@example.com"), subject.capture());
        assertEquals("Order o-1 confirmed", subject.getValue());
    }

    @Test
    @DisplayName("declined payment: charges before saving, sends no email")
    void declined() {
        when(gateway.charge(anyString(), any(Long.class))).thenReturn(PaymentResult.DECLINED);

        assertEquals("PAYMENT_FAILED", service.checkout(order));

        InOrder sequence = inOrder(gateway, repository);
        sequence.verify(gateway).charge("o-1", 2_500);
        sequence.verify(repository).save(order, "PAYMENT_FAILED");
        verify(mailer, never()).send(anyString(), anyString());
    }

    @Test
    @DisplayName("non-positive total: rejected before touching the gateway")
    void rejectsZero() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.checkout(new Order("o-2", "bob@example.com", 0)));
        assertEquals("total must be positive", e.getMessage());
        verifyNoInteractions(gateway, repository, mailer);
    }

    @Test
    @DisplayName("gateway failure: exception propagates, nothing saved")
    void gatewayFails() {
        when(gateway.charge("o-1", 2_500)).thenThrow(new IllegalStateException("gateway timeout"));

        assertThrows(IllegalStateException.class, () -> service.checkout(order));
        verify(repository, never()).save(any(), any());
    }

    @ParameterizedTest(name = "shipping for {0} cents is {1}")
    @CsvSource({ "1999, 599", "2000, 299", "4999, 299", "5000, 0" })
    void shipping(long total, long expectedFee) {
        assertEquals(expectedFee, CheckoutService.shippingFee(total));   // boundaries on both sides
    }

    @Nested
    @DisplayName("with an in-memory fake repository")
    class WithFakeRepository {
        final Map<String, String> rows = new HashMap<>();
        CheckoutService realisticService;

        @BeforeEach
        void setUp() {
            OrderRepository fake = new OrderRepository() {             // a fake: real behaviour, in memory
                public void save(Order o, String status) { rows.put(o.id(), status); }
                public Optional<String> statusOf(String id) { return Optional.ofNullable(rows.get(id)); }
            };
            realisticService = new CheckoutService((id, cents) -> cents < 10_000 ? PaymentResult.APPROVED : PaymentResult.DECLINED,
                    fake, (to, subj) -> { });
        }

        @Test
        @DisplayName("stores the final status of each order")
        void storesStatuses() {
            realisticService.checkout(new Order("o-10", "a@x.com", 500));
            realisticService.checkout(new Order("o-11", "b@x.com", 50_000));
            assertAll(
                    () -> assertEquals("PAID", rows.get("o-10")),
                    () -> assertEquals("PAYMENT_FAILED", rows.get("o-11")),
                    () -> assertEquals(2, rows.size()));
        }
    }
}

@DisplayName("What a failure looks like")
class FailureExampleTest {
    @Test
    @DisplayName("deliberately wrong expectation")
    void wrongExpectation() {
        String status = new CheckoutService((id, c) -> PaymentResult.DECLINED, new OrderRepository() {
            public void save(Order o, String s) { }
            public Optional<String> statusOf(String id) { return Optional.empty(); }
        }, (to, s) -> { }).checkout(new Order("o-3", "c@x.com", 100));
        assertEquals("PAID", status, "status for a declined card");
    }
}

// ===================== a tiny test runner (what IDEs and build tools do) =====================
public class CheckoutTests {
    public static void main(String[] args) {
        LauncherDiscoveryRequest request = LauncherDiscoveryRequestBuilder.request()
                .selectors(selectClass(CheckoutServiceTest.class), selectClass(FailureExampleTest.class))
                .build();
        List<String> lines = new ArrayList<>();
        TestExecutionListener listener = new TestExecutionListener() {
            TestPlan plan;

            @Override
            public void testPlanExecutionStarted(TestPlan testPlan) {
                plan = testPlan;
            }

            @Override
            public void executionFinished(TestIdentifier id, TestExecutionResult result) {
                if (!id.isTest()) {
                    return;
                }
                StringBuilder path = new StringBuilder(id.getDisplayName());
                for (Optional<TestIdentifier> p = plan.getParent(id); p.isPresent() && p.get().getParentId().isPresent(); p = plan.getParent(p.get())) {
                    if (!p.get().getDisplayName().startsWith("shipping(")) {   // skip the parameterised container node
                        path.insert(0, p.get().getDisplayName() + " > ");
                    }
                }
                String failure = result.getThrowable().map(t -> "\n      " + t.getClass().getSimpleName() + ": " + t.getMessage()).orElse("");
                lines.add(String.format("%-10s %s%s", result.getStatus(), path, failure));
            }
        };
        Launcher launcher = LauncherFactory.create();
        launcher.execute(request, listener);
        lines.stream().sorted().forEach(System.out::println);
        long passed = lines.stream().filter(l -> l.startsWith("SUCCESSFUL")).count();
        System.out.println(lines.size() + " tests: " + passed + " passed, " + (lines.size() - passed) + " failed");
    }
}
```

## Output

```text title="Output" output="CheckoutTests.java"
FAILED     What a failure looks like > deliberately wrong expectation
      AssertionFailedError: status for a declined card ==> expected: <PAID> but was: <PAYMENT_FAILED>
SUCCESSFUL CheckoutService > approved payment: saves PAID and emails a confirmation
SUCCESSFUL CheckoutService > declined payment: charges before saving, sends no email
SUCCESSFUL CheckoutService > gateway failure: exception propagates, nothing saved
SUCCESSFUL CheckoutService > non-positive total: rejected before touching the gateway
SUCCESSFUL CheckoutService > shipping for 1999 cents is 599
SUCCESSFUL CheckoutService > shipping for 2000 cents is 299
SUCCESSFUL CheckoutService > shipping for 4999 cents is 299
SUCCESSFUL CheckoutService > shipping for 5000 cents is 0
SUCCESSFUL CheckoutService > with an in-memory fake repository > stores the final status of each order
10 tests: 9 passed, 1 failed
```

- Every `CheckoutServiceTest` test ran with fresh mocks: Jupiter creates a new test instance per test, and `MockitoExtension` re-initialises the `@Mock` fields.
- The **approved** test **stubbed** the gateway, **verified** the save, and **captured** the email subject.
- The **declined** test checked the **order** of calls and that no email was sent. The **validation** test proved no collaborator was touched.
- The **failure** test showed that exceptions from a dependency propagate and nothing is saved.
- The **parameterised** test covered both sides of each shipping boundary. The **nested** group used a **fake** repository instead of a mock, which is often more readable when you care about state rather than interactions.
- The deliberately failing test shows the message format: the custom message, then `expected: <PAID> but was: <PAYMENT_FAILED>`. That's why good assertion messages and display names matter when CI fails at 2 a.m.

## Real-world application

- **Build integration**: Maven Surefire (unit tests, `*Test`) and Failsafe (integration tests, `*IT`), or Gradle `test` with `useJUnitPlatform()`. CI runs everything on every pull request, and JaCoCo reports coverage. Coverage is a guide, not a goal; mutation testing (PIT) checks whether tests really catch bugs.
- **Spring Boot testing**:
  - `@WebMvcTest` (controllers, with `MockMvc` and `@MockitoBean` services);
  - `@DataJpaTest` (repositories against a real database via Testcontainers);
  - `@SpringBootTest` for full wiring;
  - **WireMock** to fake external HTTP APIs;
  - Testcontainers for PostgreSQL, Kafka and Redis in integration tests.
- **Readable assertions**: AssertJ (`assertThat(orders).extracting(Order::id).containsExactly("o-1", "o-2")`) and Hamcrest give fluent, descriptive failures.
- **Designing for testability**:
  - constructor injection and interfaces at the boundaries (gateway, repository, clock) make unit tests trivial;
  - code that is hard to test (statics, `new` inside logic, `Instant.now()`) is usually hard to change too.
- **Test-driven development (TDD)**: red, green, refactor. Write a failing test for the next small behaviour, make it pass simply, then clean up. It's especially effective for business rules and bug fixes: write a test reproducing the bug first.
- **Flaky tests** (timing, shared state, order dependence, real clocks or networks) erode trust. Quarantine them, fix the root cause (inject the clock, await conditions with Awaitility rather than `Thread.sleep`), and keep the suite fast.

## Common mistakes

- **Testing implementation details**: verifying every internal call, or mocking private collaborators, makes tests break on harmless refactorings. Assert outcomes; verify only interactions that *are* the behaviour (an email sent, a payment charged).
- **Over-mocking**: mocking value objects, collections or the class under test. Use real objects and fakes where cheap.
- **Mixing raw values and matchers** (`verify(m).send("a", anyString())`): wrap raw values in `eq(...)`.
- **`when(spy.method())` on spies** runs the real method. Use `doReturn(...).when(spy).method()`.
- **Shared mutable state between tests** (static fields, a shared database without cleanup) causes order-dependent failures.
- **`Thread.sleep` in tests**: slow and flaky. Inject a clock or sleeper, or await a condition.
- **Assertions without messages** in loops, or `assertTrue(a.equals(b))` that hides the values. Use `assertEquals` or AssertJ, and `assertAll` for groups.
- **Tests that never fail**: missing asserts, swallowed exceptions, or `assertThrows` around the wrong statement.
- **Only happy paths**: add boundaries (0, 1, max, the limit ±1), errors, empty inputs and concurrency where relevant.

## Interview questions

**Q1. What's the difference between a mock, a stub and a fake?**

````reveal title="Answer"
- A **stub** returns predefined answers so the code under test can run (`when(repo.find(1)).thenReturn(user)`); you assert on the outcome.
- A **mock** additionally records interactions so you can **verify** behaviour (`verify(mailer).send(...)`), which you use when the interaction *is* the requirement.
- A **fake** is a working lightweight implementation (an in-memory repository, a local SMTP server): realistic behaviour without infrastructure.

Mockito objects can serve as stubs or mocks. Fakes are written by hand or provided by libraries (H2, embedded Kafka).
````

**Q2. How does `when(mock.method()).thenReturn(x)` work, given that `mock.method()` is called first?**

````reveal title="Answer"
The mock intercepts the call, records it as the most recent invocation, and returns a default value (null, 0 or empty). `when(...)` ignores that value and takes the last recorded invocation from Mockito's thread-local progress state. `thenReturn(x)` registers an answer for invocations matching that method and those arguments. Consequence: on a **spy**, `when(spy.method())` executes the real method first, so use `doReturn(x).when(spy).method()` instead.
````

**Q3. Why does JUnit 5 create a new test-class instance per test method?**

````reveal title="Answer"
To isolate tests: instance fields (mocks, fixtures, collections) start fresh for every test, so one test's mutations can't affect another and tests can run in any order (or in parallel). Shared expensive setup goes in `static` `@BeforeAll` methods, or you opt into `@TestInstance(Lifecycle.PER_CLASS)` explicitly, accepting the responsibility to reset state.
````

**Q4. What makes a test flaky, and how do you fix it?**

````reveal title="Answer"
- **Nondeterminism**: real time (`Instant.now()`), randomness, `Thread.sleep`-based waiting, concurrency races, iteration order of `HashMap`/`HashSet`, shared state between tests (static fields, databases), and external services and networks.
- **Fixes**: inject `Clock` and seeded randomness; await conditions with timeouts (Awaitility) instead of sleeping; isolate state (fresh fixtures, transactional rollback, unique ids); fake external services (WireMock, Testcontainers); don't depend on unordered iteration; run tests in random order in CI to expose hidden coupling.
````

**Q5. What should you verify with Mockito, and what shouldn't you?**

````reveal title="Answer"
Verify interactions that are **the observable behaviour** of the unit: commands sent to collaborators that have effects outside it (charge a card, send an email, publish an event, save an entity), including "never called" in failure paths. Don't verify queries whose results you already assert on (stubbed lookups), or internal call sequences that could change in a refactoring without changing behaviour. Avoid `verifyNoMoreInteractions` everywhere. Over-verification couples tests to implementation and makes them brittle.
````

## Hands-on exercise

Test a **retrying HTTP client**:

```java
interface Transport { String get(String url) throws IOException; }
interface Sleeper { void sleep(Duration d) throws InterruptedException; }

final class RetryingClient {
    RetryingClient(Transport transport, Sleeper sleeper, int maxAttempts) { ... }
    // retries IOExceptions with exponential backoff 100 ms, 200 ms, 400 ms...; rethrows the last one
    String get(String url) throws IOException, InterruptedException { ... }
}
```

1. Implement `RetryingClient`.
2. Write JUnit 5 + Mockito tests:
   - **succeeds on the third attempt**: consecutive stubbing, `thenThrow(...).thenThrow(...).thenReturn(...)`; verify `get` was called 3 times and capture the sleep durations, expecting `[PT0.1S, PT0.2S]`;
   - **gives up after maxAttempts**: the last `IOException` is rethrown;
   - **doesn't retry on success**: `verifyNoInteractions(sleeper)`;
   - a **parameterised** test of the backoff for attempts 1..4.
3. Run them from `main` with the launcher.

````hint title="Hint"
Inject the `Sleeper` so tests never actually sleep. Compute the backoff as `Duration.ofMillis(100L << (attempt - 1))`. Use `@Captor ArgumentCaptor<Duration>` and `verify(sleeper, times(2)).sleep(captor.capture())`, then `captor.getAllValues()`. Mockito's `thenThrow` accepts checked exceptions if the method declares them.
````

````solution title="Solution"
```java title="RetryTests.java" file="RetryTests.java" classpath="junit"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.platform.engine.discovery.DiscoverySelectors.selectClass;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.platform.engine.TestExecutionResult;
import org.junit.platform.launcher.TestExecutionListener;
import org.junit.platform.launcher.TestIdentifier;
import org.junit.platform.launcher.core.LauncherDiscoveryRequestBuilder;
import org.junit.platform.launcher.core.LauncherFactory;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

interface Transport { String get(String url) throws IOException; }

interface Sleeper { void sleep(Duration d) throws InterruptedException; }

final class RetryingClient {
    private final Transport transport;
    private final Sleeper sleeper;
    private final int maxAttempts;

    RetryingClient(Transport transport, Sleeper sleeper, int maxAttempts) {
        this.transport = transport;
        this.sleeper = sleeper;
        this.maxAttempts = maxAttempts;
    }

    static Duration backoff(int attempt) {
        return Duration.ofMillis(100L << (attempt - 1));
    }

    String get(String url) throws IOException, InterruptedException {
        for (int attempt = 1; ; attempt++) {
            try {
                return transport.get(url);
            } catch (IOException e) {
                if (attempt >= maxAttempts) {
                    throw e;
                }
                sleeper.sleep(backoff(attempt));
            }
        }
    }
}

@ExtendWith(MockitoExtension.class)
class RetryingClientTest {
    @Mock Transport transport;
    @Mock Sleeper sleeper;
    @Captor ArgumentCaptor<Duration> pauses;
    RetryingClient client;

    @BeforeEach
    void setUp() {
        client = new RetryingClient(transport, sleeper, 3);
    }

    @Test
    @DisplayName("succeeds on the third attempt with 100 ms then 200 ms backoff")
    void succeedsAfterRetries() throws Exception {
        when(transport.get("/stock"))
                .thenThrow(new IOException("reset"))
                .thenThrow(new IOException("timeout"))
                .thenReturn("42 in stock");

        assertEquals("42 in stock", client.get("/stock"));
        verify(transport, times(3)).get("/stock");
        verify(sleeper, times(2)).sleep(pauses.capture());
        assertEquals(List.of(Duration.ofMillis(100), Duration.ofMillis(200)), pauses.getAllValues());
    }

    @Test
    @DisplayName("gives up after maxAttempts and rethrows the last failure")
    void givesUp() throws Exception {
        when(transport.get("/stock")).thenThrow(new IOException("down"));

        IOException e = assertThrows(IOException.class, () -> client.get("/stock"));
        assertEquals("down", e.getMessage());
        verify(transport, times(3)).get("/stock");
        verify(sleeper, times(2)).sleep(pauses.capture());
    }

    @Test
    @DisplayName("does not sleep when the first call succeeds")
    void noRetryOnSuccess() throws Exception {
        when(transport.get("/health")).thenReturn("ok");

        assertEquals("ok", client.get("/health"));
        verifyNoInteractions(sleeper);
    }

    @ParameterizedTest(name = "backoff after attempt {0} is {1} ms")
    @CsvSource({ "1, 100", "2, 200", "3, 400", "4, 800" })
    void backoff(int attempt, long millis) {
        assertEquals(Duration.ofMillis(millis), RetryingClient.backoff(attempt));
    }
}

public class RetryTests {
    public static void main(String[] args) {
        List<String> lines = new ArrayList<>();
        LauncherFactory.create().execute(
                LauncherDiscoveryRequestBuilder.request().selectors(selectClass(RetryingClientTest.class)).build(),
                new TestExecutionListener() {
                    @Override
                    public void executionFinished(TestIdentifier id, TestExecutionResult result) {
                        if (id.isTest()) {
                            lines.add(result.getStatus() + " " + id.getDisplayName()
                                    + result.getThrowable().map(t -> " -> " + t).orElse(""));
                        }
                    }
                });
        lines.stream().sorted().forEach(System.out::println);
    }
}
```

```text title="Output" output="RetryTests.java"
SUCCESSFUL backoff after attempt 1 is 100 ms
SUCCESSFUL backoff after attempt 2 is 200 ms
SUCCESSFUL backoff after attempt 3 is 400 ms
SUCCESSFUL backoff after attempt 4 is 800 ms
SUCCESSFUL does not sleep when the first call succeeds
SUCCESSFUL gives up after maxAttempts and rethrows the last failure
SUCCESSFUL succeeds on the third attempt with 100 ms then 200 ms backoff
```

The injected `Sleeper` made a retry policy with real delays testable in microseconds. Consecutive stubbing scripted the flaky dependency, `ArgumentCaptor` checked the exact backoff schedule, and `verifyNoInteractions` proved the happy path never waits. The same design (inject time, randomness and I/O) is what makes production code testable in general.
````

## Knowledge check

```quiz
? How many instances of a JUnit 5 test class are created for a class with 3 @Test methods (default lifecycle)?
+ 3, one per test method
- 1, shared by all tests
- 0, tests are static
> PER_METHOD lifecycle isolates tests.

? verify(mailer).send("ada@example.com", anyString()) throws InvalidUseOfMatchersException. Why?
+ Raw values and matchers are mixed; use eq("ada@example.com")
- verify can't be used with void methods
- anyString() doesn't match null
> Use matchers for all arguments or none.

? Which test double is an in-memory implementation of a repository?
+ A fake
- A mock
- A dummy
> Fakes have working, lightweight behaviour.

? What does when(spy.compute()).thenReturn(5) do on a Mockito spy?
+ Calls the real compute() once during stubbing, then returns 5 afterwards
- Only stubs, without calling compute()
- Throws an exception
> Use doReturn(5).when(spy).compute() to avoid the real call.

? A test uses Thread.sleep(500) to wait for an async task and occasionally fails in CI. What is the best fix?
+ Await the condition with a timeout (or inject a controllable executor/clock)
- Increase the sleep to 5 seconds
- Mark the test @Disabled
> Sleep-based waiting is a classic cause of flaky tests.
```

## Key takeaways

- Follow the **test pyramid**: many fast unit tests, some integration tests with real infrastructure (Testcontainers), few end-to-end tests. Tests should be FIRST and structured as arrange-act-assert.
- **JUnit 5**: `@Test`, lifecycle methods, `assertThrows` and `assertAll`, parameterised tests for boundaries, `@Nested` for grouping, and extensions (`MockitoExtension`, `SpringExtension`). A new instance per test isolates state.
- **Mockito**: stub with `when`/`thenReturn`/`thenThrow` (consecutive answers), verify with `verify`/`never`/`inOrder`, capture with `ArgumentCaptor`, and use matchers consistently. Use `doReturn` with spies.
- Verify **behaviour that matters**, prefer fakes and real objects where cheap, and avoid testing implementation details.
- Testability is a design property: inject collaborators, time and randomness. Hard-to-test code is a design smell.
