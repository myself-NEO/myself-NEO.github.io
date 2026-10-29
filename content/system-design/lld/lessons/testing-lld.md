## Why testing belongs in an LLD discussion

A design that's hard to test is usually hard to change: it hides dependencies, mixes concerns, or relies on global state. Interviewers often ask *"how would you test this?"* precisely because the answer reveals design quality. If your answer is *"I'd inject a fake clock and an in-memory repository and assert on the result"*, your design is probably good. If it's *"I'd need to spin up the database and wait two minutes"*, it isn't.

## Design for testability

Testable designs share a few traits, all covered in earlier lessons:

| Trait | Why it helps tests | Lesson |
|---|---|---|
| Dependencies injected through constructors | Swap real implementations for fakes or mocks | [Dependency Injection](lesson:dependency-injection) |
| Time, randomness and IDs injected (`Clock`, `IdGenerator`, `Random`) | Deterministic results, no sleeping | [DI](lesson:dependency-injection) |
| Rules in domain objects, I/O at the edges | Pure logic is tested with plain objects | [Repositories](lesson:repository-pattern) |
| Small interfaces | Tiny fakes, often lambdas | [ISP](lesson:interface-segregation) |
| Explicit state machines and invariants | Clear expected outcomes per transition | [State Machines](lesson:state-machines) |

## Test doubles: which one when?

| Double | What it is | Use for |
|---|---|---|
| **Fake** | A working lightweight implementation (in-memory repository) | Stateful collaborators; most readable tests |
| **Stub** | Returns canned answers (`clock` fixed at 10:00) | Providing inputs |
| **Mock** | Records calls so you can **verify interactions** (Mockito) | Verifying that a side effect happened (a notification sent, a refund requested) |
| **Spy** | Wraps a real object, recording calls | Rarely; legacy code |

Prefer **fakes and stubs** and assertions on **state and outputs**. Use **mocks** for **outgoing side effects** that have no observable state, such as "an SMS was sent" or "the gateway was asked to refund". Over-mocking — verifying every internal call — makes tests break on every refactor.

## A worked example

The code under test: a small coupon redemption service with a repository, a clock and a notifier.

```java title="Code under test" file="CouponRedemption.java"
import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

public class CouponRedemption {
    public static void main(String[] args) {
        InMemoryCoupons coupons = new InMemoryCoupons();
        coupons.save(new Coupon("SAVE50", 50, Instant.parse("2030-01-01T00:00:00Z"), 1));
        CouponService service = new CouponService(coupons, Clock.systemUTC(), (u, m) -> System.out.println("notify " + u + ": " + m));
        System.out.println("Discount: " + service.redeem("SAVE50", "asha"));
    }
}

record Coupon(String code, long discount, Instant expiresAt, int remainingUses) {
    Coupon useOnce() { return new Coupon(code, discount, expiresAt, remainingUses - 1); }
}

interface CouponRepository {
    Optional<Coupon> find(String code);
    void save(Coupon coupon);
}

interface Notifier { void notify(String userId, String message); }

class CouponExpiredException extends RuntimeException { CouponExpiredException(String c) { super(c + " expired"); } }
class CouponExhaustedException extends RuntimeException { CouponExhaustedException(String c) { super(c + " fully used"); } }

class InMemoryCoupons implements CouponRepository {
    private final Map<String, Coupon> store = new HashMap<>();
    public Optional<Coupon> find(String code) { return Optional.ofNullable(store.get(code)); }
    public void save(Coupon coupon) { store.put(coupon.code(), coupon); }
}

class CouponService {
    private final CouponRepository coupons;
    private final Clock clock;
    private final Notifier notifier;

    CouponService(CouponRepository coupons, Clock clock, Notifier notifier) {
        this.coupons = coupons;
        this.clock = clock;
        this.notifier = notifier;
    }

    synchronized long redeem(String code, String userId) {
        Coupon c = coupons.find(code).orElseThrow(() -> new IllegalArgumentException("unknown coupon " + code));
        if (!clock.instant().isBefore(c.expiresAt())) throw new CouponExpiredException(code);
        if (c.remainingUses() <= 0) throw new CouponExhaustedException(code);
        coupons.save(c.useOnce());
        notifier.notify(userId, "You saved " + c.discount());
        return c.discount();
    }
}
```

The tests: JUnit 5 for structure and assertions, a **fake** repository and a **fixed clock** for state, and **Mockito** only to verify the outgoing notification.

```java title="CouponServiceTest.java — JUnit 5 + Mockito" file="CouponServiceTest.java" test="CouponRedemption.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class CouponServiceTest {
    private static final Instant NOW = Instant.parse("2026-06-01T10:00:00Z");

    private InMemoryCoupons coupons;          // fake: real behaviour, in memory
    private Notifier notifier;                // mock: verify the outgoing side effect
    private CouponService service;

    @BeforeEach
    void setUp() {
        coupons = new InMemoryCoupons();
        notifier = mock(Notifier.class);
        Clock fixed = Clock.fixed(NOW, ZoneOffset.UTC);   // stub: deterministic time
        service = new CouponService(coupons, fixed, notifier);
    }

    @Test
    @DisplayName("redeeming a valid coupon returns the discount and uses it once")
    void redeemsValidCoupon() {
        coupons.save(new Coupon("SAVE50", 50, NOW.plusSeconds(3600), 2));

        long discount = service.redeem("SAVE50", "asha");

        assertEquals(50, discount);
        assertEquals(1, coupons.find("SAVE50").orElseThrow().remainingUses());   // state-based assertion
        verify(notifier).notify("asha", "You saved 50");                        // interaction for side effect
    }

    @Test
    void rejectsExpiredCouponAtTheExactExpiryInstant() {
        coupons.save(new Coupon("OLD", 10, NOW, 5));                             // boundary: expires exactly now

        assertThrows(CouponExpiredException.class, () -> service.redeem("OLD", "asha"));
        verify(notifier, never()).notify(anyString(), anyString());
    }

    @Test
    void rejectsExhaustedCoupon() {
        coupons.save(new Coupon("ONCE", 10, NOW.plusSeconds(60), 0));
        assertThrows(CouponExhaustedException.class, () -> service.redeem("ONCE", "asha"));
    }

    @Test
    void rejectsUnknownCoupon() {
        assertThrows(IllegalArgumentException.class, () -> service.redeem("NOPE", "asha"));
    }

    @Test
    void concurrentRedemptionsNeverExceedTheUseLimit() throws InterruptedException {
        coupons.save(new Coupon("LIMITED", 5, NOW.plusSeconds(60), 10));
        CouponService realNotifierService = new CouponService(coupons, Clock.fixed(NOW, ZoneOffset.UTC), (u, m) -> { });
        AtomicInteger successes = new AtomicInteger();
        ExecutorService pool = Executors.newFixedThreadPool(8);
        for (int i = 0; i < 100; i++) {
            String user = "u" + i;
            pool.submit(() -> {
                try {
                    realNotifierService.redeem("LIMITED", user);
                    successes.incrementAndGet();
                } catch (CouponExhaustedException expected) {
                    // losers are expected
                }
            });
        }
        pool.shutdown();
        pool.awaitTermination(10, TimeUnit.SECONDS);

        assertEquals(10, successes.get());
        assertEquals(0, coupons.find("LIMITED").orElseThrow().remainingUses());
    }
}
```

Things to notice:

- **Arrange–Act–Assert** structure in every test.
- **Boundary test**: "expires exactly now" is the classic off-by-one. Decide the rule (here: `now >= expiry` means expired) and pin it with a test.
- **No `Thread.sleep`** anywhere: time is injected.
- The **concurrency test** releases many threads at a shared object and asserts the invariant (exactly 10 uses), not the timing.
- Mockito verifies only the **notification**, which is a side effect with no state to inspect.

## What to test in an LLD solution

1. **Happy path** of each core use case.
2. **Each guard and invariant** — one test per rule ("can't book an overlapping slot").
3. **Boundaries** — exactly at capacity, exactly at expiry, zero, empty, back-to-back intervals.
4. **State machine transitions** — legal moves succeed; illegal ones throw.
5. **Strategies** in isolation — each pricing or eviction policy with a table of inputs and outputs (use `@ParameterizedTest`).
6. **Concurrency invariants** — N threads, assert the invariant holds.

## Testing and refactoring

Tests are what make [refactoring](lesson:refactoring-to-good-design) safe. Tests that assert **behaviour** (inputs → outputs, state, essential side effects) survive refactors. Tests that assert **implementation** (method A called method B with argument C) break on every structural improvement. That's the main argument against over-mocking.

## Real-world example

A team had 2,000 Mockito-heavy tests, each verifying exact call sequences. Every refactor broke hundreds of them, so the team stopped refactoring and the design rotted. Rewriting the core tests around in-memory fakes and state assertions cut the suite to 600 tests, halved the run time, and made refactoring routine again.

## Common mistakes

- `Thread.sleep()` to wait for time-based behaviour (slow and flaky). Inject a clock.
- **Mocking value objects** or the class under test.
- **Verifying every interaction** instead of outcomes.
- **One giant test** asserting ten things — failures become hard to diagnose.
- **No boundary or concurrency tests** in designs where they matter most.

## In the interview

> [!INTERVIEW] A 30-second testing answer
> *"Because the repository, clock and notifier are injected, `BookingService` tests use an in-memory repository and a fixed clock. I'd test: a successful booking; an overlap rejection; the exact-boundary back-to-back case; hold expiry at exactly ten minutes; illegal state transitions; and a concurrency test where 50 threads book the same slot and exactly one succeeds. I'd use a Mockito mock only to verify the confirmation email."*

## Key takeaways

- Testability is a **design property**: inject dependencies, time and IDs; keep rules in domain objects.
- Prefer **fakes and state assertions**; use **mocks** for outgoing side effects.
- Test **happy paths, guards, boundaries, transitions, strategies and concurrency invariants**.
- Behaviour-focused tests enable **refactoring**; implementation-focused tests block it.

## Knowledge check

```quiz
? Which test double is best for a repository in most service tests?
+ A fake: an in-memory implementation with real behaviour
- A Mockito mock verifying every save() call
- The production database
> Fakes keep tests readable and behaviour-focused.

? How should you test that a 10-minute hold expires?
- Thread.sleep(600_000)
+ Inject a Clock and advance it (or create the service with a fixed clock past the expiry time)
- Skip the test
> Injected time makes time-based logic deterministic and fast.

? When is verifying an interaction with Mockito most appropriate?
+ When the behaviour is an outgoing side effect with no observable state, such as sending a notification
- For every method call inside the service
- For getters
> Verify side effects; assert on state and results for everything else.
```

## Exercise

Write JUnit 5 test **names and one-line descriptions** (no code needed) for the [Parking Lot](problem:parking-lot) design: at least eight tests covering the happy path, guards, boundaries, strategies and concurrency. Then pick the trickiest one and write it in full.

````hint title="Hint"
Think: smallest fitting spot; full lot; the same vehicle twice; unknown ticket; a stay of zero minutes (minimum one hour?); pricing at exactly 60 minutes; a truck with only small spots free; N threads competing for the last spots.
````

````solution title="Sample answer"
1. `parksCarInNearestFittingSpot` — the lowest level, smallest fitting spot is chosen.
2. `throwsLotFullWhenNoFittingSpot` — a truck with only small spots free → `LotFullException`.
3. `rejectsParkingSameVehicleTwice` — the second `park` for the same plate fails.
4. `unparkReleasesSpotAndChargesViaStrategy` — a fake strategy returns 99; the fee is 99 and the spot is free again.
5. `rejectsUnknownTicket` — `unpark("nope")` → `IllegalArgumentException`.
6. `rejectsDoubleUnpark` — the second `unpark` of the same ticket fails.
7. `hourlyPricingRoundsUpAndChargesMinimumOneHour` — parameterised: 0 min → 1h, 60 min → 1h, 61 min → 2h.
8. `concurrentParkingNeverAssignsTheSameSpotTwice` — 100 threads, 50 spots → exactly 50 tickets, all with distinct spot IDs.

The concurrency test in full looks like `concurrentRedemptionsNeverExceedTheUseLimit` above: submit 100 tasks to an executor, count successes, and assert `tickets.size() == 50` and `tickets.stream().map(Ticket::spotId).distinct().count() == 50`. The Parking Lot problem page includes a runnable test class.
````
