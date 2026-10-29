## The problem

Business logic needs to **load and save** domain objects. If it talks to the database directly — SQL strings in services, JPA annotations on domain classes, `ResultSet` parsing inside `Order` — then:

- Rules can't be tested without a database.
- A storage change (MySQL → DynamoDB, or adding a cache) ripples into business code.
- Domain classes get shaped by tables rather than by behaviour.

The fix is to **separate domain logic from infrastructure**, and the main tool for persistence is the **repository**: an interface, owned by the domain, that looks like an in-memory **collection of aggregates**.

## The layers

```text
 Interface / API layer   controllers, CLI, message consumers      parse input, map errors
          │
          ▼
 Application layer       use-case services (facades)              orchestrate, transactions
          │
          ▼
 Domain layer            entities, value objects, domain           rules & invariants
                         services, REPOSITORY INTERFACES (ports)
          ▲
          │ implements
 Infrastructure          JDBC/JPA repositories, HTTP clients,      adapters to the outside world
                         message brokers

 Source-code dependencies point INWARD, toward the domain.
```

This is [Dependency Inversion](lesson:dependency-inversion) applied to architecture, also known as **hexagonal** ("ports and adapters") or **clean** architecture. The domain defines **ports** (repository and gateway interfaces); infrastructure provides **adapters**.

## Designing a repository interface

- **One repository per aggregate root**, not per table. `OrderRepository` saves the whole `Order` including its lines; there's no `OrderLineRepository`.
- **Domain language** methods: `findActiveByMember(memberId)`, `findAvailable(showId)` — not `executeQuery(String sql)`.
- **Collection semantics**: `save`, `findById` returning `Optional`, a few purpose-built queries.
- **No infrastructure types** in signatures: no `ResultSet`, `EntityManager` or `Page<Entity>` from a specific library.

```java title="Domain-owned repository, two implementations" file="RepositoryDemo.java"
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

public class RepositoryDemo {
    public static void main(String[] args) {
        // Composition root chooses the adapter; the domain and application code are identical either way.
        LoanRepository repo = new InMemoryLoanRepository();
        LendingService lending = new LendingService(repo);

        lending.borrow("M1", "COPY-1", LocalDate.of(2026, 1, 1));
        lending.borrow("M1", "COPY-2", LocalDate.of(2026, 1, 5));
        lending.giveBack("COPY-1", LocalDate.of(2026, 1, 10));
        System.out.println("Active for M1: " + repo.findActiveByMember("M1"));
        System.out.println("Overdue on Feb 1: " + lending.overdue(LocalDate.of(2026, 2, 1)));

        // Same code against a "SQL" adapter (simulated with row maps).
        LendingService lending2 = new LendingService(new FakeSqlLoanRepository());
        lending2.borrow("M2", "COPY-9", LocalDate.of(2026, 1, 1));
        System.out.println("SQL-backed overdue: " + lending2.overdue(LocalDate.of(2026, 2, 1)));
    }
}

// ------------- Domain layer -------------
final class Loan {
    private final String copyId;
    private final String memberId;
    private final LocalDate dueDate;
    private LocalDate returnedOn;

    Loan(String copyId, String memberId, LocalDate dueDate, LocalDate returnedOn) {
        this.copyId = copyId; this.memberId = memberId; this.dueDate = dueDate; this.returnedOn = returnedOn;
    }

    static Loan start(String copyId, String memberId, LocalDate today) { return new Loan(copyId, memberId, today.plusDays(14), null); }

    void markReturned(LocalDate today) {
        if (returnedOn != null) throw new IllegalStateException(copyId + " already returned");
        returnedOn = today;
    }

    boolean isActive() { return returnedOn == null; }
    boolean isOverdue(LocalDate today) { return isActive() && today.isAfter(dueDate); }
    String copyId() { return copyId; }
    String memberId() { return memberId; }
    LocalDate dueDate() { return dueDate; }
    LocalDate returnedOn() { return returnedOn; }
    @Override public String toString() { return copyId + "->" + memberId + (isActive() ? " due " + dueDate : " returned"); }
}

/** Port: defined in domain terms, owned by the domain. */
interface LoanRepository {
    void save(Loan loan);
    Optional<Loan> findActiveByCopy(String copyId);
    List<Loan> findActiveByMember(String memberId);
    List<Loan> findAllActive();
}

// ------------- Application layer -------------
final class LendingService {
    private static final int MAX_ACTIVE = 3;
    private final LoanRepository loans;

    LendingService(LoanRepository loans) { this.loans = loans; }

    Loan borrow(String memberId, String copyId, LocalDate today) {
        if (loans.findActiveByCopy(copyId).isPresent()) throw new IllegalStateException(copyId + " is on loan");
        if (loans.findActiveByMember(memberId).size() >= MAX_ACTIVE) throw new IllegalStateException("limit reached");
        Loan loan = Loan.start(copyId, memberId, today);
        loans.save(loan);
        return loan;
    }

    void giveBack(String copyId, LocalDate today) {
        Loan loan = loans.findActiveByCopy(copyId).orElseThrow(() -> new IllegalArgumentException("no active loan for " + copyId));
        loan.markReturned(today);          // rule lives in the entity
        loans.save(loan);                  // persist the new state
    }

    List<String> overdue(LocalDate today) {
        return loans.findAllActive().stream().filter(l -> l.isOverdue(today)).map(Loan::copyId).collect(Collectors.toList());
    }
}

// ------------- Infrastructure layer (adapters) -------------
final class InMemoryLoanRepository implements LoanRepository {
    private final Map<String, List<Loan>> byCopy = new ConcurrentHashMap<>();

    public void save(Loan loan) {
        List<Loan> history = byCopy.computeIfAbsent(loan.copyId(), k -> new ArrayList<>());
        if (!history.contains(loan)) history.add(loan);
    }
    public Optional<Loan> findActiveByCopy(String copyId) {
        return byCopy.getOrDefault(copyId, List.of()).stream().filter(Loan::isActive).findFirst();
    }
    public List<Loan> findActiveByMember(String memberId) {
        return findAllActive().stream().filter(l -> l.memberId().equals(memberId)).toList();
    }
    public List<Loan> findAllActive() {
        return byCopy.values().stream().flatMap(List::stream).filter(Loan::isActive).toList();
    }
}

/** Stands in for a JDBC adapter: maps between rows and domain objects. */
final class FakeSqlLoanRepository implements LoanRepository {
    private final List<Map<String, Object>> table = new ArrayList<>();   // "loans" table

    public void save(Loan loan) {
        table.removeIf(r -> r.get("copy_id").equals(loan.copyId()) && r.get("returned_on") == null);
        Map<String, Object> row = new HashMap<>();
        row.put("copy_id", loan.copyId());
        row.put("member_id", loan.memberId());
        row.put("due_date", loan.dueDate().toString());
        row.put("returned_on", loan.returnedOn() == null ? null : loan.returnedOn().toString());
        table.add(row);
    }
    public Optional<Loan> findActiveByCopy(String copyId) {
        return findAllActive().stream().filter(l -> l.copyId().equals(copyId)).findFirst();
    }
    public List<Loan> findActiveByMember(String memberId) {
        return findAllActive().stream().filter(l -> l.memberId().equals(memberId)).toList();
    }
    public List<Loan> findAllActive() {   // "SELECT * FROM loans WHERE returned_on IS NULL"
        return table.stream().filter(r -> r.get("returned_on") == null).map(FakeSqlLoanRepository::toDomain).toList();
    }
    private static Loan toDomain(Map<String, Object> r) {
        return new Loan((String) r.get("copy_id"), (String) r.get("member_id"), LocalDate.parse((String) r.get("due_date")), null);
    }
}
```

The `LendingService` and `Loan` code is identical whichever adapter is used, and the in-memory adapter doubles as a **test fake**.

> [!NOTE] Mutation and saving
> With an in-memory repository, mutating a loaded object changes the stored one too (same reference). With a real database, you must call `save` after mutating. Always calling `save` keeps the application code correct for both.

## Repositories in an LLD interview

You rarely implement a database. But:

- Declaring `XRepository` **interfaces** and passing them into services shows architectural judgement.
- An **in-memory implementation** (a `HashMap`) is exactly what the interview needs.
- It makes the testing story trivial: *"Tests use the in-memory repository."*

Keep it light: one interface per aggregate, two to four domain-named methods, and a `ConcurrentHashMap`-backed implementation if concurrency matters.

## Transactions and consistency (briefly)

When a use case changes **several aggregates** (debit account A, credit account B), you need either a **transaction** spanning both saves (a database feature, coordinated in the application layer, often with a `UnitOfWork` or the framework's transaction manager) or **eventual consistency** with compensations and events. In LLD interviews, saying *"the application service runs these saves in one transaction"* is usually enough. Modelling the invariant inside **one aggregate** avoids the problem entirely — see [Domain Invariants](lesson:domain-invariants).

## Real-world example

A fintech team's domain classes were JPA entities with lazy-loaded collections, so business rules triggered unexpected queries ("N+1"), and unit tests required an embedded database. Moving to plain domain classes plus repository adapters that mapped JPA entities to domain objects cut test time from 12 minutes to 40 seconds and made the query patterns explicit in the adapters.

## Common mistakes

- **Generic `Repository<T>` with `query(String sql)`** — leaks infrastructure upward.
- **One repository per table** (`OrderLineRepository`), which breaks aggregate boundaries.
- **Business rules inside repositories** (`saveIfNotOverdue`).
- **Repository interfaces in the infrastructure package**, so the domain depends on infrastructure.
- **Returning mutable internal collections** from in-memory implementations.

## In the interview

> [!INTERVIEW] One sentence of architecture
> *"Services depend on repository interfaces defined in the domain — `ShowRepository`, `BookingRepository` — and I'll use in-memory implementations backed by `ConcurrentHashMap`. In production these become JDBC adapters without touching the domain."*

## Key takeaways

- Separate **domain** (rules) from **infrastructure** (storage, I/O); dependencies point **inward**.
- A **repository** is a domain-owned, collection-like interface per **aggregate root**.
- Use **domain language** methods; keep infrastructure types out of signatures.
- In-memory implementations serve both **interviews and tests**.

## Knowledge check

```quiz
? Where should the LoanRepository interface live?
+ In the domain (or application) layer, next to the code that uses it
- In the infrastructure package next to the JDBC code
- In the controller layer
> Ports belong to the domain; adapters in infrastructure implement them.

? Which repository method signature is best?
- `List<Map<String, Object>> query(String sql)`
+ `List<Loan> findActiveByMember(String memberId)`
- `ResultSet loans()`
> Domain-named methods with domain types keep infrastructure out of the business code.

? An Order aggregate contains OrderLines. How many repositories?
+ One: OrderRepository, which saves and loads the whole aggregate
- Two: OrderRepository and OrderLineRepository
- None: lines are saved by the controller
> Repositories are per aggregate root, not per table.
```

## Exercise

For a **hotel reservation** system, define the repository interfaces (with 2–4 domain-named methods each) for the aggregates `Hotel` (rooms and room types), `Reservation` and `Guest`. Then write an in-memory `ReservationRepository` that supports "find reservations for a room overlapping a date range" efficiently enough for an interview.

````hint title="Hint"
Index reservations by room ID; for each room keep a list (or a `TreeMap` by check-in date) and filter by overlap.
````

````solution title="Sample answer"
```java
interface HotelRepository { Optional<Hotel> findById(String hotelId); List<Hotel> findByCity(String city); }
interface GuestRepository { Optional<Guest> findById(String guestId); Optional<Guest> findByEmail(String email); void save(Guest g); }
interface ReservationRepository {
    void save(Reservation r);
    Optional<Reservation> findById(String id);
    List<Reservation> findOverlapping(String roomId, DateRange range);
    List<Reservation> findByGuest(String guestId);
}

final class InMemoryReservationRepository implements ReservationRepository {
    private final Map<String, Reservation> byId = new ConcurrentHashMap<>();
    private final Map<String, NavigableMap<LocalDate, Reservation>> byRoom = new ConcurrentHashMap<>();

    public synchronized void save(Reservation r) {
        byId.put(r.id(), r);
        byRoom.computeIfAbsent(r.roomId(), k -> new TreeMap<>()).put(r.range().checkIn(), r);
    }
    public Optional<Reservation> findById(String id) { return Optional.ofNullable(byId.get(id)); }
    public synchronized List<Reservation> findOverlapping(String roomId, DateRange range) {
        NavigableMap<LocalDate, Reservation> m = byRoom.getOrDefault(roomId, new TreeMap<>());
        // Only reservations starting before range.checkOut can overlap.
        return m.headMap(range.checkOut(), false).values().stream()
                .filter(r -> r.isActive() && r.range().overlaps(range)).toList();
    }
    public List<Reservation> findByGuest(String guestId) {
        return byId.values().stream().filter(r -> r.guestId().equals(guestId)).toList();
    }
}
```

Note that the **no-overlap invariant** is still enforced by a domain object (for example, a per-room schedule) under a lock. The repository only stores and finds. See [Hotel Reservation](problem:hotel-reservation).
````
