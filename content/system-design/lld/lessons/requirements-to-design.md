## The goal of this lesson

So far you've seen each tool in isolation: requirements, entities, relationships, class, sequence and state diagrams. This lesson strings them together on one fresh problem — **a gym class booking system** — so you can see the *process* of going from user stories to working Java, and how each artefact feeds the next.

## Step 1 — User stories

```text
US1  As a member, I can see upcoming classes (yoga, spin…) with free spots.
US2  As a member, I can book a spot in a class if it isn't full.
US3  As a member, if a class is full I can join its waitlist.
US4  As a member, I can cancel a booking up to 2 hours before the class starts.
US5  When a booking is cancelled, the first person on the waitlist gets the spot automatically.
US6  Basic members can hold at most 3 upcoming bookings; premium members are unlimited.
US7  As a trainer, I can see the attendee list for my class.
```

**Clarifying questions** (with assumed answers): Single gym? *Yes.* Can a member be on the waitlist and booked for the same class? *No.* Is waitlist promotion automatic? *Yes.* Payments? *Out of scope.* Concurrency? *Two members may book the last spot at the same time — must not overbook.*

## Step 2 — Nouns, verbs, and what kind of object each is

| Noun | Kind | Reasoning |
|---|---|---|
| Member | Entity | Identity, membership tier |
| MembershipTier | Enum with a rule | BASIC (3), PREMIUM (unlimited) — fixed set |
| FitnessClass (a scheduled session) | Entity — **aggregate root** | Owns capacity, bookings and waitlist; enforces "never overbook" |
| Booking | Part of FitnessClass | Member + booking time. Kept as a map entry inside the class until it needs behaviour of its own |
| Waitlist | Part of FitnessClass | An ordered queue — a `Deque`, not its own class yet |
| Trainer | Entity / value | Only needs an ID and name here |
| Schedule / catalogue | Repository | Finds classes; storage is a detail |
| Booking rules across classes (US6) | **Domain service** | Needs data from *several* classes (a member's upcoming bookings) |

**Verbs → methods:** book (US2), join waitlist (US3), cancel (US4), promote (US5), list attendees (US7), count upcoming bookings (US6).

## Step 3 — Domain objects vs services

The key decision is **where each rule lives**:

- *"A class can't exceed capacity"*, *"cancel promotes the waitlist"* and *"no cancellation within 2 hours"* all concern **one class's own data** → methods on `FitnessClass`.
- *"Basic members may hold at most 3 upcoming bookings"* needs data **across many classes** → it can't live in one `FitnessClass`. It belongs in an application-level `BookingService` that consults a repository, or in a dedicated `BookingPolicy`.

This is the general rule: **rules about one aggregate live in that aggregate; rules spanning aggregates live in a service.** Services orchestrate; they shouldn't absorb rules that a single entity could own.

## Step 4 — Class diagram

```uml title="Gym booking — domain model"
class BookingService
  - classes: ClassRepository
  - clock: Clock
  + book(memberId: String, classId: String): BookingResult
  + cancel(memberId: String, classId: String): void
class FitnessClass
  - id: String
  - startsAt: Instant
  - capacity: int
  - confirmed: LinkedHashMap<String, Instant>
  - waitlist: Deque<String>
  + book(memberId: String, now: Instant): BookingResult
  + cancel(memberId: String, now: Instant): Optional<String>
  + attendees(): List<String>
class Member
  - id: String
  - tier: MembershipTier
enum MembershipTier
  BASIC
  PREMIUM
enum BookingResult
  CONFIRMED
  WAITLISTED
interface ClassRepository
  + findById(id: String): Optional<FitnessClass>
  + upcomingFor(memberId: String, now: Instant): List<FitnessClass>
BookingService --> ClassRepository
BookingService ..> FitnessClass
BookingService ..> Member : checks tier
FitnessClass ..> BookingResult
Member --> MembershipTier
```

## Step 5 — Sequence diagram for the trickiest story (US4 + US5)

```text
Member → BookingService: cancel(m1, yoga-7am)
BookingService → ClassRepository: findById(yoga-7am)
BookingService → FitnessClass: cancel(m1, now)
   FitnessClass: check now <= startsAt - 2h        (else throw CancellationWindowClosed)
   FitnessClass: remove m1 from confirmed
   FitnessClass: promote first waitlisted member (m4) → confirmed
FitnessClass → BookingService: Optional[m4]
BookingService → Notifier: notify(m4, "You're in!")   (out of scope: shown as a hook)
```

Walking it through confirms that **promotion happens inside `FitnessClass`** (it owns both the bookings and the waitlist, so it can do both atomically) and that the service merely reports the result.

## Step 6 — State of a booking slot

```states title="A member's place in a class"
[*] --> WAITLISTED : book() [class full]
[*] --> CONFIRMED : book() [spot free]
WAITLISTED --> CONFIRMED : promoted (someone cancelled)
WAITLISTED --> REMOVED : leaveWaitlist()
CONFIRMED --> CANCELLED : cancel() [>= 2h before start]
CANCELLED --> [*]
REMOVED --> [*]
```

## Step 7 — Java

```java title="Gym booking — from diagrams to code" file="GymBookingDemo.java"
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public class GymBookingDemo {
    public static void main(String[] args) {
        Clock clock = Clock.fixed(Instant.parse("2026-06-01T06:00:00Z"), ZoneOffset.UTC);
        InMemoryClassRepository repo = new InMemoryClassRepository();
        repo.save(new FitnessClass("yoga-7am", Instant.parse("2026-06-01T09:00:00Z"), 2));

        Map<String, Member> members = Map.of(
                "m1", new Member("m1", MembershipTier.BASIC),
                "m2", new Member("m2", MembershipTier.PREMIUM),
                "m3", new Member("m3", MembershipTier.BASIC));
        BookingService service = new BookingService(repo, members::get, clock);

        System.out.println("m1: " + service.book("m1", "yoga-7am"));   // CONFIRMED
        System.out.println("m2: " + service.book("m2", "yoga-7am"));   // CONFIRMED
        System.out.println("m3: " + service.book("m3", "yoga-7am"));   // WAITLISTED
        service.cancel("m1", "yoga-7am");                              // promotes m3
        System.out.println("Attendees: " + repo.findById("yoga-7am").orElseThrow().attendees());
    }
}

enum MembershipTier {
    BASIC(3), PREMIUM(Integer.MAX_VALUE);
    final int maxUpcomingBookings;
    MembershipTier(int max) { this.maxUpcomingBookings = max; }
}

enum BookingResult { CONFIRMED, WAITLISTED }

record Member(String id, MembershipTier tier) {}

class CancellationWindowClosedException extends RuntimeException {
    CancellationWindowClosedException(String classId) { super("Too late to cancel " + classId); }
}

/** Aggregate root: every rule about one class's spots lives here. */
class FitnessClass {
    private static final Duration CANCEL_CUTOFF = Duration.ofHours(2);

    private final String id;
    private final Instant startsAt;
    private final int capacity;
    private final LinkedHashMap<String, Instant> confirmed = new LinkedHashMap<>();  // memberId -> bookedAt
    private final Deque<String> waitlist = new ArrayDeque<>();

    FitnessClass(String id, Instant startsAt, int capacity) {
        if (capacity <= 0) throw new IllegalArgumentException("capacity must be positive");
        this.id = id;
        this.startsAt = startsAt;
        this.capacity = capacity;
    }

    String id() { return id; }
    Instant startsAt() { return startsAt; }

    boolean involves(String memberId) { return confirmed.containsKey(memberId) || waitlist.contains(memberId); }

    // synchronized: two members racing for the last spot must not both get it.
    synchronized BookingResult book(String memberId, Instant now) {
        if (!now.isBefore(startsAt)) throw new IllegalStateException(id + " has already started");
        if (involves(memberId)) throw new IllegalStateException(memberId + " is already booked or waitlisted");
        if (confirmed.size() < capacity) {
            confirmed.put(memberId, now);
            return BookingResult.CONFIRMED;
        }
        waitlist.addLast(memberId);
        return BookingResult.WAITLISTED;
    }

    /** Cancels and promotes the next waitlisted member atomically. Returns who was promoted. */
    synchronized Optional<String> cancel(String memberId, Instant now) {
        if (waitlist.remove(memberId)) return Optional.empty();       // leaving the waitlist is always allowed
        if (!confirmed.containsKey(memberId)) throw new IllegalArgumentException(memberId + " has no booking");
        if (now.isAfter(startsAt.minus(CANCEL_CUTOFF))) throw new CancellationWindowClosedException(id);
        confirmed.remove(memberId);
        String promoted = waitlist.pollFirst();
        if (promoted != null) confirmed.put(promoted, now);
        return Optional.ofNullable(promoted);
    }

    synchronized List<String> attendees() { return List.copyOf(confirmed.keySet()); }

    synchronized boolean isConfirmed(String memberId) { return confirmed.containsKey(memberId); }
}

interface ClassRepository {
    Optional<FitnessClass> findById(String id);
    List<FitnessClass> upcomingFor(String memberId, Instant now);
}

class InMemoryClassRepository implements ClassRepository {
    private final Map<String, FitnessClass> classes = new HashMap<>();
    void save(FitnessClass c) { classes.put(c.id(), c); }
    public Optional<FitnessClass> findById(String id) { return Optional.ofNullable(classes.get(id)); }
    public List<FitnessClass> upcomingFor(String memberId, Instant now) {
        List<FitnessClass> result = new ArrayList<>();
        for (FitnessClass c : classes.values()) {
            if (c.startsAt().isAfter(now) && c.isConfirmed(memberId)) result.add(c);
        }
        return result;
    }
}

interface MemberDirectory { Member find(String id); }

/** Application service: orchestrates and enforces the cross-class rule (US6). */
class BookingService {
    private final ClassRepository classes;
    private final MemberDirectory members;
    private final Clock clock;

    BookingService(ClassRepository classes, MemberDirectory members, Clock clock) {
        this.classes = classes;
        this.members = members;
        this.clock = clock;
    }

    BookingResult book(String memberId, String classId) {
        Instant now = clock.instant();
        Member member = members.find(memberId);
        if (member == null) throw new IllegalArgumentException("unknown member " + memberId);
        int upcoming = classes.upcomingFor(memberId, now).size();
        if (upcoming >= member.tier().maxUpcomingBookings) {
            throw new IllegalStateException(memberId + " reached the " + member.tier() + " booking limit");
        }
        return load(classId).book(memberId, now);
    }

    void cancel(String memberId, String classId) {
        load(classId).cancel(memberId, clock.instant())
                .ifPresent(promoted -> System.out.println("Notify " + promoted + ": you're off the waitlist!"));
    }

    private FitnessClass load(String classId) {
        return classes.findById(classId).orElseThrow(() -> new IllegalArgumentException("unknown class " + classId));
    }
}
```

How the code maps back to the design:

- Every single-class rule (capacity, waitlist, the 2-hour cutoff, promotion) is in `FitnessClass`, and its methods are `synchronized` to satisfy the "never overbook" NFR.
- The cross-class rule (US6) is in `BookingService`, which only orchestrates and checks a policy.
- Storage and member lookup are interfaces, so the domain is testable and storage-agnostic ([Repositories](lesson:repository-pattern)).
- Time comes from an injected `Clock` ([Dependency Injection](lesson:dependency-injection)).

> [!WARNING] A subtle race
> The US6 limit check in `BookingService` isn't atomic with the booking. Two simultaneous bookings by the same basic member for *different* classes could both pass the check. That's acceptable if the business tolerates rare overshoots; otherwise you need a per-member lock or a member-level counter. Saying this out loud in an interview is a strong signal — see [Race Conditions](lesson:concurrent-state-transitions).

## Using diagrams to communicate decisions

Each artefact answered a different question:

- **User stories** → what must the system do?
- **Noun/verb table** → what are the candidate objects, and what kind is each?
- **Class diagram** → who owns which data and rule?
- **Sequence diagram** → does the trickiest flow work, and where does atomicity matter?
- **State diagram** → what are the legal lifecycle moves?

In an interview you won't draw all of these formally. You'll *think* in all of them and draw the two or three that carry the most information.

## Common mistakes

- **Putting every rule in the service**, leaving `FitnessClass` as a data holder.
- **Splitting promotion out of the class** (into a `WaitlistManager`), which makes the cancel-and-promote step non-atomic.
- **Forgetting cross-aggregate rules** like US6, or forcing them into a single entity that doesn't have the data.
- **Modelling the waitlist as its own entity** before it has any behaviour of its own (YAGNI).

## In the interview

> [!INTERVIEW] Narrate the reasoning
> *"Capacity and waitlist rules concern one class, so they live in `FitnessClass`, which also lets me make cancel-and-promote atomic. The 3-booking limit spans classes, so the `BookingService` checks it via the repository."* This one sentence demonstrates information expert, aggregates, services and concurrency awareness.

## Key takeaways

- Go **stories → nouns/verbs → entity kinds → class diagram → scenario walk-through → code**.
- **Single-aggregate rules** live in the aggregate; **cross-aggregate rules** live in a service or policy.
- Use diagrams to **check** your design, not as decoration.
- Keep operations that must be atomic **inside one object**.

## Knowledge check

```quiz
? Which rule should live in FitnessClass rather than BookingService?
+ "When a booking is cancelled, the first waitlisted member is promoted"
- "Basic members can hold at most 3 upcoming bookings across all classes"
- "Send a push notification to the promoted member"
> It concerns one class's own data (bookings and waitlist) and must be atomic.

? Why is the US6 limit enforced in BookingService?
- Services should contain all business rules
+ It needs information from many FitnessClass aggregates, which no single class has
- FitnessClass is immutable
> Cross-aggregate rules belong in an orchestrating service or policy.

? What does walking the cancel scenario through a sequence diagram reveal?
+ Cancellation and promotion must happen together inside FitnessClass to avoid giving the spot away twice
- That BookingService needs more fields
- That waitlists should be stored in a database table
> The scenario shows where atomicity is needed.
```

## Exercise

Extend the gym design with two new stories, and say where each change goes and why:

- **US8:** Classes can be cancelled by the gym; all confirmed and waitlisted members must be notified, and the class can no longer be booked.
- **US9:** Members who don't show up three times in a month are blocked from booking for a week.

````hint title="Hint"
US8 changes the class's own lifecycle. US9 is about a member's history across many classes. Would a state enum help for US8?
````

````solution title="Sample answer"
**US8 → `FitnessClass`.** Add a `ClassStatus` enum (`SCHEDULED`, `CANCELLED`, `COMPLETED`). `FitnessClass.cancelClass()` moves to `CANCELLED`, returns everyone affected (confirmed + waitlist), and makes `book()` throw when not `SCHEDULED`. `BookingService` passes the returned member IDs to a `Notifier`. The rule belongs to the class because it's about the class's own state.

**US9 → `Member` (data) + `BookingService` (check).** Record no-shows on `Member` (or in a `MemberStanding` object with `recordNoShow(date)` and `isBlocked(today)`). `BookingService.book()` checks `standing.isBlocked(today)` alongside the tier limit. Attendance is marked after the class (`FitnessClass.markAttendance(...)`), and the service updates standings for absentees. It's a cross-aggregate rule driven by history, so it doesn't belong in `FitnessClass`.
````
