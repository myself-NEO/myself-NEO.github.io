## Why bother with UML?

The **Unified Modeling Language** is a standard notation for drawing software designs. In LLD you only need a small part of it — mostly **class diagrams** — to communicate structure quickly. A good diagram lets an interviewer see your whole design at a glance before you write any code.

You don't need perfect UML. You need **clear, consistent** UML.

## The class box

```text
┌──────────────────────────────┐
│        «interface»           │  ← stereotype (optional)
│        PaymentMethod         │  ← name (italic = abstract)
├──────────────────────────────┤
│ - id: String                 │  ← fields:  visibility name: Type
│ # createdAt: Instant         │
├──────────────────────────────┤
│ + pay(amount: Money): Receipt│  ← methods: visibility name(params): ReturnType
│ + refund(r: Receipt): void   │
└──────────────────────────────┘
```

**Visibility symbols:** `+` public, `-` private, `#` protected, `~` package-private. **Static** members are underlined; on a whiteboard, write `static` or `{static}` instead.

You can omit compartments. In interviews it's common to show only a class name and its key methods.

## The six relationships

| Relationship | Notation | Read as | Java |
|---|---|---|---|
| **Inheritance** (generalisation) | `Child ──▷ Parent` (solid line, hollow triangle) | "is a" | `extends` |
| **Realization** | `Impl - - ▷ Interface` (dashed line, hollow triangle) | "implements" | `implements` |
| **Composition** | `Whole ◆── Part` (filled diamond at the whole) | "owns" | field, created internally, lifetime bound |
| **Aggregation** | `Whole ◇── Part` (hollow diamond at the whole) | "has" | field, part passed in or shared |
| **Association** | `A ──> B` (solid line, open arrow) | "knows / refers to" | field of type B |
| **Dependency** | `A - - > B` (dashed line, open arrow) | "uses temporarily" | parameter, local variable, return type |

Add **multiplicities** at the ends (`1`, `0..1`, `*`, `1..*`) and optional **role labels** (`owner`, `items`). The [previous lesson](lesson:object-relationships) covers what each relationship means.

## A complete small example

```uml title="Library — class diagram"
class Library
  - catalogue: Map<String, Book>
  + addCopy(isbn: String, copyId: String): void
  + findAvailableCopy(isbn: String): Optional<BookCopy>
class Book
  - isbn: String
  - title: String
class BookCopy
  - copyId: String
  - status: CopyStatus
  + checkOut(member: Member): Loan
  + checkIn(): void
enum CopyStatus
  AVAILABLE
  ON_LOAN
  LOST
class Member
  - memberId: String
  - activeLoans: List<Loan>
  + canBorrow(): boolean
class Loan
  - dueDate: LocalDate
  + isOverdue(today: LocalDate): boolean
interface FinePolicy
  + fineFor(loan: Loan, today: LocalDate): long
class FlatDailyFine
Library *-- "0..*" Book : catalogue
Book *-- "1..*" BookCopy : copies
BookCopy --> CopyStatus
Loan --> "1" BookCopy
Loan --> "1" Member
Member o-- "0..5" Loan : active
FlatDailyFine ..|> FinePolicy
Library ..> FinePolicy : uses
```

And the same design as Java skeletons. Notice how every line of the diagram corresponds to a Java construct:

```java title="Diagram → code" file="LibraryUmlDemo.java"
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public class LibraryUmlDemo {
    public static void main(String[] args) {
        Library library = new Library();
        library.addCopy("978-0134685991", "Effective Java", "EJ-1");
        Member asha = new Member("M1");
        BookCopy copy = library.findAvailableCopy("978-0134685991").orElseThrow();
        Loan loan = copy.checkOut(asha, LocalDate.of(2026, 1, 1));
        System.out.println("Overdue on Jan 20? " + loan.isOverdue(LocalDate.of(2026, 1, 20)));
        System.out.println("Fine: " + new FlatDailyFine(5).fineFor(loan, LocalDate.of(2026, 1, 20)));
    }
}

enum CopyStatus { AVAILABLE, ON_LOAN, LOST }

class Library {
    private final Map<String, Book> catalogue = new HashMap<>();            // composition: Library *-- Book

    void addCopy(String isbn, String title, String copyId) {
        catalogue.computeIfAbsent(isbn, i -> new Book(i, title)).addCopy(copyId);
    }

    Optional<BookCopy> findAvailableCopy(String isbn) {
        Book book = catalogue.get(isbn);
        return book == null ? Optional.empty() : book.availableCopy();
    }
}

class Book {
    private final String isbn;
    private final String title;
    private final List<BookCopy> copies = new ArrayList<>();                 // composition: Book *-- 1..* BookCopy

    Book(String isbn, String title) { this.isbn = isbn; this.title = title; }

    void addCopy(String copyId) { copies.add(new BookCopy(copyId)); }

    Optional<BookCopy> availableCopy() {
        return copies.stream().filter(c -> c.status() == CopyStatus.AVAILABLE).findFirst();
    }
}

class BookCopy {
    private final String copyId;
    private CopyStatus status = CopyStatus.AVAILABLE;                        // association to an enum

    BookCopy(String copyId) { this.copyId = copyId; }

    CopyStatus status() { return status; }

    Loan checkOut(Member member, LocalDate today) {
        if (status != CopyStatus.AVAILABLE) throw new IllegalStateException(copyId + " is " + status);
        if (!member.canBorrow()) throw new IllegalStateException("borrow limit reached");
        status = CopyStatus.ON_LOAN;
        Loan loan = new Loan(this, member, today.plusDays(14));
        member.addLoan(loan);
        return loan;
    }

    void checkIn() { status = CopyStatus.AVAILABLE; }
}

class Member {
    private static final int MAX_LOANS = 5;
    private final String memberId;
    private final List<Loan> activeLoans = new ArrayList<>();                // aggregation: Member o-- 0..5 Loan

    Member(String memberId) { this.memberId = memberId; }
    boolean canBorrow() { return activeLoans.size() < MAX_LOANS; }
    void addLoan(Loan loan) { activeLoans.add(loan); }
}

class Loan {
    private final BookCopy copy;      // association: Loan --> 1 BookCopy
    private final Member member;      // association: Loan --> 1 Member
    private final LocalDate dueDate;

    Loan(BookCopy copy, Member member, LocalDate dueDate) {
        this.copy = copy; this.member = member; this.dueDate = dueDate;
    }

    boolean isOverdue(LocalDate today) { return today.isAfter(dueDate); }
    LocalDate dueDate() { return dueDate; }
}

interface FinePolicy { long fineFor(Loan loan, LocalDate today); }

class FlatDailyFine implements FinePolicy {                                  // realization: ..|>
    private final long perDay;
    FlatDailyFine(long perDay) { this.perDay = perDay; }

    public long fineFor(Loan loan, LocalDate today) {
        if (!loan.isOverdue(today)) return 0;
        return perDay * java.time.temporal.ChronoUnit.DAYS.between(loan.dueDate(), today);
    }
}
```

## How much UML in an interview?

- **Do:** boxes with class names, key fields and methods; arrows with multiplicities for the important relationships; interfaces marked clearly.
- **Don't:** spend ten minutes perfecting arrowheads, show every getter, or draw diagrams for trivial classes.
- **Simple boxes and labelled arrows are fine** if you explain them. Many interviewers prefer plain-English labels ("owns 1..*") to strict notation.

> [!TIP] Draw incrementally
> Start with 4–6 boxes and relationships (entities step). Add fields and methods during class design. The diagram grows with your understanding instead of being a big up-front artefact.

## Real-world example

Before a refactor of a billing module, a senior engineer drew the current class diagram on a wiki page. It revealed two classes with bidirectional associations and a cycle through four packages — invisible in code review, obvious in the diagram. The refactor plan was simply "break these two arrows".

## Common mistakes

- Putting the diamond on the wrong end. It goes on the **whole** (owner), not the part.
- Using inheritance arrows for "uses" relationships.
- Diagrams that don't match the code you then write — the diagram must describe the code.
- Over-detailed diagrams that hide the important structure.

## In the interview

> [!INTERVIEW] Narrate the arrows
> As you draw: *"Library owns Books, a Book owns one or more physical copies, a Loan links one copy to one member, and fines are a pluggable policy."* The narration matters more than the arrowheads.

## Key takeaways

- A class box has **name, fields, methods** with visibility (`+ - # ~`).
- Six relationships: **inheritance, realization, composition, aggregation, association, dependency** — each maps to a Java construct.
- Add **multiplicities** and short labels.
- Keep interview diagrams **lean and consistent with your code**.

## Knowledge check

```quiz
? Which notation means "ShoppingCart owns its CartItems, which cannot exist without it"?
+ ShoppingCart ◆── CartItem (filled diamond at the cart)
- ShoppingCart ◇── CartItem (hollow diamond)
- CartItem ──▷ ShoppingCart (hollow triangle)
- ShoppingCart - - > CartItem (dashed arrow)
> A filled diamond at the whole means composition: exclusive ownership with a bound lifetime.

? A method `print(Invoice invoice)` uses Invoice but doesn't store it. Which relationship is that?
- Association
- Aggregation
+ Dependency
> Temporary use through a parameter is a dependency (dashed arrow).

? What does `- balance: long` mean in a class box?
+ A private field named balance of type long
- A method that subtracts from balance
- A protected static field
> `-` is private visibility; fields are written `name: Type`.
```

## Exercise

Draw (in text or on paper) a class diagram for a **vending machine** with: `VendingMachine`, `Slot`, `Product`, `Coin` (enum), and a `ChangeMaker` interface with a `GreedyChangeMaker` implementation. Include multiplicities, then write the Java field declarations implied by your diagram.

````hint title="Hint"
Does the machine own its slots? Is a product shared between slots, or does each slot have its own? Does the machine store the change maker or just use it?
````

````solution title="Sample answer"
```uml title="Vending machine"
class VendingMachine
  - slots: Map<String, Slot>
  - insertedCoins: List<Coin>
  - changeMaker: ChangeMaker
  + select(code: String): void
  + insert(coin: Coin): void
  + dispense(): List<Coin>
class Slot
  - code: String
  - quantity: int
  + takeOne(): Product
record Product
  + name: String
  + price: int
enum Coin
  ONE
  TWO
  FIVE
  TEN
interface ChangeMaker
  + makeChange(amount: int, till: Map<Coin, Integer>): List<Coin>
class GreedyChangeMaker
VendingMachine *-- "1..*" Slot : owns
Slot --> "1" Product : stocks
VendingMachine --> ChangeMaker : uses
GreedyChangeMaker ..|> ChangeMaker
VendingMachine ..> Coin
```

```java
class VendingMachine {
    private final Map<String, Slot> slots = new HashMap<>();   // composition
    private final List<Coin> insertedCoins = new ArrayList<>();
    private final ChangeMaker changeMaker;                     // association to an interface, injected
}
class Slot { private final String code; private Product product; private int quantity; }
```

The full design is in [Vending Machine](problem:vending-machine).
````
