## Problem statement

Design a library management system. The library has a catalogue of books, each with one or more physical copies. Members search the catalogue, borrow copies, return them, and place holds on books whose copies are all out. Late returns incur fines.

> [!TIP] Try it first
> The key modelling insight in this problem is a single distinction. Find it before you reveal the entities.

## Clarifying questions

1. Do we distinguish a *book* (title) from a *copy* (physical item)?
2. Borrowing rules: how many items, and for how long?
3. Fines: how are they calculated, and do they block borrowing?
4. Holds and reservations: queue order, and how long a held copy waits?
5. Search: by what fields?
6. Concurrency: can two members borrow the last copy at the same time?

````reveal title="Answers we'll assume"
- **Book** (ISBN, title, author) vs **BookCopy** (copy ID, status) — one title, many copies.
- At most **3 active loans** per member; loan period **14 days**.
- Fine: **₹10 per day late** (the policy may change). Members with **unpaid fines can't borrow**.
- Holds: when no copy is available, a member can **join a FIFO hold queue** for the ISBN. A returned copy goes **ON_HOLD** for the first member in the queue for **3 days**; after that it passes to the next member, or becomes available.
- Search by **title or author** (case-insensitive substring).
- Yes — borrowing must be **safe under concurrency**.
- Out of scope: payments (we just record "fine paid"), notifications (a hook only), librarians' UI.
````

## Requirements

**Functional**

1. Add books and copies; search by title or author.
2. Borrow by ISBN: assign an available copy (or the copy on hold for this member).
3. Return a copy: close the loan, compute any fine, and hand the copy to the next holder or make it available.
4. Place a hold when no copy is available.
5. Pay fines.

**Non-functional**

6. No copy is ever lent to two members; concurrent borrows are safe.
7. The fine policy is replaceable; time is injectable for testing.

## Step 1 — Entities

````reveal title="Entities and responsibilities"
| Entity | Kind | Responsibility |
|---|---|---|
| `Book` | Value (record) | ISBN, title, author |
| `BookCopy` | Entity | Status lifecycle: AVAILABLE ↔ ON_LOAN, ON_HOLD (for a member until a date) |
| `Member` | Entity | Active loan count, unpaid fines; the rule "can I borrow?" |
| `Loan` | Entity | Copy, member, due date, returned date; "how many days late?" |
| `FinePolicy` | Strategy | Fine for a returned loan |
| `Library` | Facade / application service | Catalogue, holds queues and borrow/return orchestration |

**The key insight:** `Book` ≠ `BookCopy`. Availability, loans and holds attach to **copies**; search and holds queues attach to **books**.
````

## Step 2 — Copy lifecycle

```states title="A book copy"
[*] --> AVAILABLE
AVAILABLE --> ON_LOAN : borrow
ON_LOAN --> AVAILABLE : return [no one waiting]
ON_LOAN --> ON_HOLD : return [hold queue not empty] / reserve for first member
ON_HOLD --> ON_LOAN : borrow [by the holding member]
ON_HOLD --> ON_HOLD : hold expired [queue not empty] / pass to next member
ON_HOLD --> AVAILABLE : hold expired [queue empty]
```

## Step 3 — Class design

```uml title="Library"
class Library
  - books: Map<String, Book>
  - copiesByIsbn: Map<String, List<BookCopy>>
  - holds: Map<String, Deque<String>>
  - activeLoans: Map<String, Loan>
  - finePolicy: FinePolicy
  - clock: Clock
  + search(text: String): List<Book>
  + borrow(memberId: String, isbn: String): Loan
  + returnCopy(copyId: String): long
  + placeHold(memberId: String, isbn: String): int
record Book
  + isbn: String
  + title: String
  + author: String
class BookCopy
  - id: String
  - status: CopyStatus
  - heldFor: String
  - holdUntil: LocalDate
  + lendTo(memberId: String): void
  + holdFor(memberId: String, until: LocalDate): void
class Member
  - activeLoans: int
  - unpaidFines: long
  + checkCanBorrow(max: int): void
class Loan
  - dueOn: LocalDate
  - returnedOn: LocalDate
  + daysLate(): long
interface FinePolicy
  + fineFor(loan: Loan): long
class PerDayFine
Library *-- "0..*" BookCopy
Library o-- "0..*" Member
Library o-- "0..*" Loan : active
Loan --> BookCopy
Loan --> Member
Library --> FinePolicy
PerDayFine ..|> FinePolicy
```

## Step 4 — Implementation

````hint title="Hint 1 — picking a copy"
When a member borrows, first look for a copy that's **ON_HOLD for that member**; otherwise any **AVAILABLE** copy. If neither exists, tell them to place a hold.
````

````hint title="Hint 2 — expiring holds without a background job"
Expire holds **lazily**: before any borrow or hold operation on an ISBN, check that ISBN's ON_HOLD copies whose hold date has passed, and pass each one to the next member in the queue (or make it available).
````

````solution title="Complete Java solution"
```java title="LibraryDemo.java" file="LibraryDemo.java"
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

public class LibraryDemo {
    public static void main(String[] args) {
        MutableClock clock = new MutableClock(Instant.parse("2026-01-01T10:00:00Z"));
        Library lib = new Library(new PerDayFine(10), clock);
        lib.addBook(new Book("978-0132350884", "Clean Code", "Robert C. Martin"), "CC-1");
        lib.addBook(new Book("978-0134757599", "Refactoring", "Martin Fowler"), "RF-1", "RF-2");
        for (String m : List.of("asha", "ravi", "meera")) lib.addMember(m);

        System.out.println("Search 'martin': " + lib.search("martin").stream().map(Book::title).toList());

        Loan asha = lib.borrow("asha", "978-0132350884");
        System.out.println("asha borrowed " + asha.copyId() + ", due " + asha.dueOn());
        tryRun(() -> lib.borrow("ravi", "978-0132350884"));
        System.out.println("ravi's hold position: " + lib.placeHold("ravi", "978-0132350884"));

        clock.advance(Duration.ofDays(19));                                   // returned 5 days late
        System.out.println("asha returns, fine = " + lib.returnCopy("CC-1"));
        tryRun(() -> lib.borrow("meera", "978-0132350884"));                  // copy is held for ravi
        System.out.println("ravi borrowed " + lib.borrow("ravi", "978-0132350884").copyId());

        tryRun(() -> lib.borrow("asha", "978-0134757599"));                   // unpaid fine blocks
        lib.payFine("asha", 50);
        System.out.println("asha borrowed " + lib.borrow("asha", "978-0134757599").copyId());
    }

    static void tryRun(Runnable r) {
        try {
            r.run();
        } catch (LibraryException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
    }
}

record Book(String isbn, String title, String author) {}

enum CopyStatus { AVAILABLE, ON_LOAN, ON_HOLD }

class LibraryException extends RuntimeException {
    LibraryException(String message) { super(message); }
}

final class BookCopy {
    private final String id;
    private final String isbn;
    private CopyStatus status = CopyStatus.AVAILABLE;
    private String heldFor;
    private LocalDate holdUntil;

    BookCopy(String id, String isbn) { this.id = id; this.isbn = isbn; }

    String id() { return id; }
    String isbn() { return isbn; }
    CopyStatus status() { return status; }

    boolean isAvailableFor(String memberId) {
        return status == CopyStatus.AVAILABLE || (status == CopyStatus.ON_HOLD && memberId.equals(heldFor));
    }

    void lendTo(String memberId) {
        if (!isAvailableFor(memberId)) throw new LibraryException(id + " is not available to " + memberId);
        status = CopyStatus.ON_LOAN;
        heldFor = null;
        holdUntil = null;
    }

    void holdFor(String memberId, LocalDate until) {
        status = CopyStatus.ON_HOLD;
        heldFor = memberId;
        holdUntil = until;
    }

    void makeAvailable() {
        status = CopyStatus.AVAILABLE;
        heldFor = null;
        holdUntil = null;
    }

    boolean holdExpired(LocalDate today) { return status == CopyStatus.ON_HOLD && today.isAfter(holdUntil); }
}

final class Member {
    private final String id;
    private int activeLoans;
    private long unpaidFines;

    Member(String id) { this.id = id; }

    void checkCanBorrow(int maxLoans) {
        if (unpaidFines > 0) throw new LibraryException(id + " has unpaid fines of " + unpaidFines);
        if (activeLoans >= maxLoans) throw new LibraryException(id + " already has " + activeLoans + " loans");
    }

    void loanStarted() { activeLoans++; }
    void loanEnded(long fine) { activeLoans--; unpaidFines += fine; }

    void pay(long amount) {
        if (amount <= 0 || amount > unpaidFines) throw new LibraryException("invalid payment " + amount);
        unpaidFines -= amount;
    }
}

final class Loan {
    private final String copyId;
    private final String memberId;
    private final LocalDate borrowedOn;
    private final LocalDate dueOn;
    private LocalDate returnedOn;

    Loan(String copyId, String memberId, LocalDate borrowedOn, LocalDate dueOn) {
        this.copyId = copyId; this.memberId = memberId; this.borrowedOn = borrowedOn; this.dueOn = dueOn;
    }

    String copyId() { return copyId; }
    String memberId() { return memberId; }
    LocalDate dueOn() { return dueOn; }

    void close(LocalDate on) {
        if (returnedOn != null) throw new LibraryException("loan for " + copyId + " already closed");
        returnedOn = on;
    }

    long daysLate() {
        if (returnedOn == null) throw new IllegalStateException("loan still open");
        return Math.max(0, ChronoUnit.DAYS.between(dueOn, returnedOn));
    }
}

interface FinePolicy { long fineFor(Loan returnedLoan); }

final class PerDayFine implements FinePolicy {
    private final long perDay;
    PerDayFine(long perDay) { this.perDay = perDay; }
    public long fineFor(Loan loan) { return loan.daysLate() * perDay; }
}

final class Library {
    static final int MAX_LOANS = 3;
    static final int LOAN_DAYS = 14;
    static final int HOLD_DAYS = 3;

    private final Map<String, Book> books = new HashMap<>();
    private final Map<String, List<BookCopy>> copiesByIsbn = new HashMap<>();
    private final Map<String, BookCopy> copies = new HashMap<>();
    private final Map<String, Deque<String>> holds = new HashMap<>();
    private final Map<String, Loan> activeLoans = new HashMap<>();          // copyId -> loan
    private final Map<String, Member> members = new HashMap<>();
    private final FinePolicy finePolicy;
    private final Clock clock;

    Library(FinePolicy finePolicy, Clock clock) { this.finePolicy = finePolicy; this.clock = clock; }

    synchronized void addBook(Book book, String... copyIds) {
        books.putIfAbsent(book.isbn(), book);
        for (String id : copyIds) {
            BookCopy copy = new BookCopy(id, book.isbn());
            if (copies.putIfAbsent(id, copy) != null) throw new LibraryException("duplicate copy " + id);
            copiesByIsbn.computeIfAbsent(book.isbn(), k -> new ArrayList<>()).add(copy);
        }
    }

    synchronized void addMember(String id) { members.putIfAbsent(id, new Member(id)); }

    synchronized List<Book> search(String text) {
        String q = text.toLowerCase(Locale.ROOT);
        return books.values().stream()
                .filter(b -> b.title().toLowerCase(Locale.ROOT).contains(q) || b.author().toLowerCase(Locale.ROOT).contains(q))
                .sorted((a, b) -> a.title().compareTo(b.title()))
                .toList();
    }

    /** Check-then-act on copies happens under one lock, so a copy can't be lent twice. */
    synchronized Loan borrow(String memberId, String isbn) {
        Member member = member(memberId);
        requireBook(isbn);
        expireHolds(isbn);
        member.checkCanBorrow(MAX_LOANS);
        BookCopy copy = findCopyFor(memberId, isbn)
                .orElseThrow(() -> new LibraryException("no copy of " + books.get(isbn).title() + " available; place a hold"));
        LocalDate today = today();
        copy.lendTo(memberId);
        Loan loan = new Loan(copy.id(), memberId, today, today.plusDays(LOAN_DAYS));
        activeLoans.put(copy.id(), loan);
        member.loanStarted();
        holds.getOrDefault(isbn, new ArrayDeque<>()).remove(memberId);   // a fulfilled hold leaves the queue
        return loan;
    }

    /** Returns the fine charged for this loan. */
    synchronized long returnCopy(String copyId) {
        Loan loan = activeLoans.remove(copyId);
        if (loan == null) throw new LibraryException("no active loan for " + copyId);
        loan.close(today());
        long fine = finePolicy.fineFor(loan);
        member(loan.memberId()).loanEnded(fine);
        BookCopy copy = copies.get(copyId);
        handOver(copy);
        return fine;
    }

    /** Returns the member's 1-based position in the queue. */
    synchronized int placeHold(String memberId, String isbn) {
        member(memberId);
        requireBook(isbn);
        expireHolds(isbn);
        if (findCopyFor(memberId, isbn).isPresent()) throw new LibraryException("a copy is available; borrow it instead");
        Deque<String> queue = holds.computeIfAbsent(isbn, k -> new ArrayDeque<>());
        if (queue.contains(memberId)) throw new LibraryException(memberId + " already holds " + isbn);
        queue.addLast(memberId);
        return queue.size();
    }

    synchronized void payFine(String memberId, long amount) { member(memberId).pay(amount); }

    // ---------- helpers ----------

    private Optional<BookCopy> findCopyFor(String memberId, String isbn) {
        List<BookCopy> list = copiesByIsbn.getOrDefault(isbn, List.of());
        Optional<BookCopy> held = list.stream().filter(c -> c.status() == CopyStatus.ON_HOLD && c.isAvailableFor(memberId)).findFirst();
        return held.isPresent() ? held : list.stream().filter(c -> c.status() == CopyStatus.AVAILABLE).findFirst();
    }

    /** Gives a returned (or expired-hold) copy to the next waiting member, or makes it available. */
    private void handOver(BookCopy copy) {
        Deque<String> queue = holds.getOrDefault(copy.isbn(), new ArrayDeque<>());
        String next = queue.pollFirst();
        if (next == null) copy.makeAvailable();
        else copy.holdFor(next, today().plusDays(HOLD_DAYS));
    }

    private void expireHolds(String isbn) {
        LocalDate today = today();
        for (BookCopy c : copiesByIsbn.getOrDefault(isbn, List.of())) {
            if (c.holdExpired(today)) handOver(c);
        }
    }

    private Member member(String id) {
        Member m = members.get(id);
        if (m == null) throw new LibraryException("unknown member " + id);
        return m;
    }

    private void requireBook(String isbn) {
        if (!books.containsKey(isbn)) throw new LibraryException("unknown ISBN " + isbn);
    }

    private LocalDate today() { return LocalDate.ofInstant(clock.instant(), ZoneOffset.UTC); }
}

final class MutableClock extends Clock {
    private volatile Instant now;
    MutableClock(Instant start) { now = start; }
    void advance(Duration d) { now = now.plus(d); }
    @Override public Instant instant() { return now; }
    @Override public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
    @Override public Clock withZone(java.time.ZoneId zone) { return this; }
}
```
````

## Design decisions

- **`Book` vs `BookCopy`.** Availability, loans and holds belong to copies; search belongs to books.
- **Rules live with their data:** `Member.checkCanBorrow` (limit and fines), `BookCopy.lendTo` (availability, including "held for me"), `Loan.daysLate`.
- **`Library` orchestrates** borrow, return and hold sequencing, and owns the hold queues (they span copies of an ISBN).
- **Lazy hold expiry** keeps the design free of background threads; holds are expired whenever the ISBN is touched.
- **Coarse `synchronized`** on the service: simple and correct. For a large library, lock **per ISBN** instead (`ConcurrentHashMap<String, Object>` of locks), because every operation touches exactly one ISBN.
- The **fine policy is a strategy**, and time is injected.

## Patterns and principles

[Facade](lesson:facade) (`Library`), [Strategy](lesson:strategy) (`FinePolicy`), [state machine](lesson:state-machines) (`CopyStatus` with guarded transitions), [information expert](lesson:entities-and-responsibilities), [repositories](lesson:repository-pattern) (the maps stand in for repository interfaces in a real system), and [Specification](lesson:specification) as an option for complex eligibility rules.

## Example execution flow

```text
borrow(asha, Clean Code)     CC-1 AVAILABLE -> ON_LOAN, due Jan 15
borrow(ravi, Clean Code)     no AVAILABLE copy, none held for ravi -> rejected
placeHold(ravi)              queue [ravi] -> position 1
+19 days, returnCopy(CC-1)   5 days late -> fine 50 -> queue not empty -> CC-1 ON_HOLD for ravi until Jan 23
borrow(meera, Clean Code)    CC-1 held for ravi -> rejected
borrow(ravi, Clean Code)     CC-1 held for ravi -> ON_LOAN
borrow(asha, Refactoring)    unpaid fine 50 -> rejected; payFine -> borrow RF-1
```

```text title="Program output"
Search 'martin': [Clean Code, Refactoring]
asha borrowed CC-1, due 2026-01-15
Rejected: no copy of Clean Code available; place a hold
ravi's hold position: 1
asha returns, fine = 50
Rejected: no copy of Clean Code available; place a hold
ravi borrowed CC-1
Rejected: asha has unpaid fines of 50
asha borrowed RF-1
```

## Edge cases

- **Returning a copy that isn't on loan** → rejected (`activeLoans.remove` returns null).
- **Hold placed while a copy is available** → rejected ("borrow it instead").
- **Duplicate hold by the same member** → rejected.
- **Holder never collects** → after 3 days, the copy passes to the next member or becomes available (lazy expiry).
- **A member at the loan limit holding a copy** → they can't borrow; the hold expires and passes on.
- **Returned early** → `daysLate` is 0, so no fine (`max(0, …)`).

## Tests

```java title="LibraryTest.java" file="LibraryTest.java" test="LibraryDemo.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class LibraryTest {
    private static final String ISBN = "111";
    private MutableClock clock;
    private Library lib;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(Instant.parse("2026-01-01T10:00:00Z"));
        lib = new Library(new PerDayFine(10), clock);
        lib.addBook(new Book(ISBN, "Domain-Driven Design", "Eric Evans"), "C1");
        lib.addMember("a");
        lib.addMember("b");
        lib.addMember("c");
    }

    @Test
    void lateReturnChargesPerDayAndBlocksBorrowingUntilPaid() {
        lib.borrow("a", ISBN);
        clock.advance(Duration.ofDays(16));                       // 2 days late
        assertEquals(20, lib.returnCopy("C1"));
        assertThrows(LibraryException.class, () -> lib.borrow("a", ISBN));
        lib.payFine("a", 20);
        assertEquals("C1", lib.borrow("a", ISBN).copyId());
    }

    @Test
    void returnedCopyGoesToFirstHolderOnly() {
        lib.borrow("a", ISBN);
        assertEquals(1, lib.placeHold("b", ISBN));
        assertEquals(2, lib.placeHold("c", ISBN));
        lib.returnCopy("C1");
        assertThrows(LibraryException.class, () -> lib.borrow("c", ISBN));
        assertEquals("C1", lib.borrow("b", ISBN).copyId());
    }

    @Test
    void expiredHoldPassesToNextMember() {
        lib.borrow("a", ISBN);
        lib.placeHold("b", ISBN);
        lib.placeHold("c", ISBN);
        lib.returnCopy("C1");                                     // held for b until +3 days
        clock.advance(Duration.ofDays(4));
        assertEquals("C1", lib.borrow("c", ISBN).copyId());       // b's hold expired, c is next
    }

    @Test
    void loanLimitIsEnforced() {
        lib.addBook(new Book("222", "B2", "X"), "D1", "D2", "D3", "D4");
        for (int i = 0; i < 3; i++) lib.borrow("a", "222");
        assertThrows(LibraryException.class, () -> lib.borrow("a", "222"));
    }

    @Test
    void cannotHoldWhenACopyIsAvailable() {
        assertThrows(LibraryException.class, () -> lib.placeHold("a", ISBN));
    }

    @Test
    void concurrentBorrowsOfLastCopyHaveExactlyOneWinner() throws InterruptedException {
        for (int i = 0; i < 50; i++) lib.addMember("m" + i);
        AtomicInteger wins = new AtomicInteger();
        ExecutorService pool = Executors.newFixedThreadPool(8);
        CountDownLatch go = new CountDownLatch(1);
        for (int i = 0; i < 50; i++) {
            String m = "m" + i;
            pool.submit(() -> {
                go.await();
                try { lib.borrow(m, ISBN); wins.incrementAndGet(); } catch (LibraryException ignored) { }
                return null;
            });
        }
        go.countDown();
        pool.shutdown();
        pool.awaitTermination(10, TimeUnit.SECONDS);
        assertEquals(1, wins.get());
    }
}
```

## Concurrency

Every operation that reads and changes copy state runs under the library's lock, so "pick an available copy and lend it" is atomic. Two members racing for the last copy get one success and one rejection (the concurrency test checks this). To scale, lock **per ISBN**: borrow, return and hold for different books then proceed in parallel, and no operation needs two ISBN locks, so there's no deadlock risk.

## Common mistakes and alternatives

- **Merging `Book` and `BookCopy`**, which breaks as soon as there are two copies.
- **Status on `Book`** ("available"), which can't express "2 of 3 copies out".
- **Fines computed in the controller** instead of a policy object with injected time.
- **Background thread for hold expiry** in an interview, when lazy expiry is simpler.
- **Alternative:** a `Reservation` entity with its own lifecycle (WAITING → READY → FULFILLED / EXPIRED) instead of a queue of member IDs — better if reservations need history or notifications.

## Follow-up questions

````reveal title="Notify members when their hold is ready"
`handOver()` emits a `HoldReady(memberId, copyId, until)` event to an injected `LibraryEvents` listener ([Observer](lesson:observer)). An email or SMS adapter subscribes. The library doesn't know about channels.
````

````reveal title="Different rules for student vs faculty members"
Give `Member` a `MembershipType` with `maxLoans`, `loanDays` and a fine multiplier (an enum, or a `BorrowingPolicy` strategy if the rules differ a lot). `Library` asks the member's policy instead of using static constants.
````

````reveal title="Renewals"
`Loan.renew(today)` extends `dueOn` if: it isn't overdue, it has been renewed fewer than 2 times, and **no one holds the ISBN** (the library checks the queue). These are rules on `Loan` plus one cross-aggregate check in `Library`.
````

## Complexity

- `borrow` / `returnCopy` / `placeHold`: O(c) where c is the number of copies of that ISBN (usually tiny), plus O(1) map operations.
- `search`: O(B) over all books. Add an inverted index (word → books) if the catalogue is large.

## Interviewer checklist

- [ ] Book vs copy distinction made early
- [ ] Borrow rules on `Member`, availability on `BookCopy`, lateness on `Loan`
- [ ] Hold queue semantics clarified (FIFO, hold window, expiry)
- [ ] Fine policy behind an interface; clock injected
- [ ] Concurrency: atomic borrow of the last copy
- [ ] Edge cases: early returns, double returns, holds when available, expired holds
