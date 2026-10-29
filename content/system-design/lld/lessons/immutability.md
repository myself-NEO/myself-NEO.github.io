## Why immutability

An **immutable object** cannot change after it's constructed. That sounds limiting, but it removes entire classes of bugs:

- **No invalid states later.** If the constructor validated it, it stays valid forever.
- **Safe sharing.** You can hand the same object to ten callers; none can change it under the others.
- **Thread safety for free.** Immutable objects can be shared across threads without locks.
- **Reliable hash keys.** An object whose fields can't change can't "move" inside a `HashMap`.
- **Easier reasoning.** You never have to ask "who else might modify this?"

In LLD, use immutability for **value objects** (`Money`, `DateRange`, `Position`, `Coordinate`) and **events/messages**. Entities with lifecycles (`Order`, `Booking`) are usually mutable, but they should still protect their internal state.

## Recipe for an immutable class

1. Make the class `final` (or use a `record`), so subclasses can't add mutability.
2. Make all fields `private final`.
3. Provide no setters; "modifications" return a **new** object.
4. Validate everything in the constructor.
5. **Defensively copy** mutable inputs and outputs (collections, arrays, `java.util.Date`).

```java title="An immutable Money value object" file="MoneyDemo.java"
import java.util.Objects;

public class MoneyDemo {
    public static void main(String[] args) {
        Money price = Money.of(499, "INR");
        Money withTax = price.plus(Money.of(90, "INR"));
        System.out.println(price + " -> " + withTax);       // price is unchanged
        System.out.println(withTax.times(3));
        try {
            price.plus(Money.of(5, "USD"));
        } catch (IllegalArgumentException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
    }
}

final class Money {
    private final long minorUnits;     // paise/cents: never use double for money
    private final String currency;

    private Money(long minorUnits, String currency) {
        if (minorUnits < 0) throw new IllegalArgumentException("Money cannot be negative");
        this.currency = Objects.requireNonNull(currency, "currency");
        this.minorUnits = minorUnits;
    }

    static Money of(long minorUnits, String currency) { return new Money(minorUnits, currency); }

    Money plus(Money other) {
        requireSameCurrency(other);
        return new Money(Math.addExact(minorUnits, other.minorUnits), currency);   // new object
    }

    Money times(int factor) { return new Money(Math.multiplyExact(minorUnits, factor), currency); }

    private void requireSameCurrency(Money other) {
        if (!currency.equals(other.currency)) throw new IllegalArgumentException(currency + " vs " + other.currency);
    }

    @Override public boolean equals(Object o) {
        return o instanceof Money m && m.minorUnits == minorUnits && m.currency.equals(currency);
    }
    @Override public int hashCode() { return Objects.hash(minorUnits, currency); }
    @Override public String toString() { return currency + " " + minorUnits; }
}
```

## Records: immutability with less code

Java `record`s (Java 16+) give you `private final` fields, a canonical constructor, accessors, `equals`, `hashCode` and `toString`. Add validation in a **compact constructor**:

```java
record DateRange(java.time.LocalDate start, java.time.LocalDate end) {
    DateRange {
        if (!end.isAfter(start)) throw new IllegalArgumentException("end must be after start");
    }
    boolean overlaps(DateRange other) { return start.isBefore(other.end) && other.start.isBefore(end); }
}
```

> [!WARNING] Records are shallowly immutable
> A record's fields are final, but if a field is a mutable `List`, callers can still change the list's contents. Copy it in the compact constructor.

## Leaking mutable state

This class *looks* encapsulated but isn't:

```java title="Leaky: callers can mutate internal state"
class Playlist {
    private final List<String> songs;
    Playlist(List<String> songs) { this.songs = songs; }   // keeps caller's list!
    List<String> songs() { return songs; }                  // hands out the internal list!
}

List<String> input = new ArrayList<>(List.of("a", "b"));
Playlist p = new Playlist(input);
input.clear();                 // empties the playlist
p.songs().add("hacked");       // modifies it again
```

Fix both directions with **defensive copies**:

```java title="Defensive copies in and out" file="PlaylistDemo.java"
import java.util.ArrayList;
import java.util.List;

public class PlaylistDemo {
    public static void main(String[] args) {
        List<String> input = new ArrayList<>(List.of("Intro", "Theme"));
        Playlist playlist = new Playlist("Focus", input);
        input.clear();                                   // no effect on playlist
        System.out.println(playlist.songs());

        try {
            playlist.songs().add("Hacked");
        } catch (UnsupportedOperationException e) {
            System.out.println("Cannot modify songs() result");
        }

        Playlist longer = playlist.withSong("Outro");    // "modification" returns a new object
        System.out.println(playlist.songs() + " vs " + longer.songs());
    }
}

record Playlist(String name, List<String> songs) {
    Playlist {
        songs = List.copyOf(songs);   // copy in: immutable snapshot (also rejects nulls)
    }

    Playlist withSong(String song) {
        List<String> next = new ArrayList<>(songs);
        next.add(song);
        return new Playlist(name, next);
    }
}
```

`List.copyOf` returns an unmodifiable copy, so the accessor can safely return it directly.

## Mutable entities: encapsulate, don't expose

Entities like `ShoppingCart` legitimately change. Immutability ideas still help:

- Keep collections private and expose **unmodifiable views** or **copies**.
- Change state only through **domain methods** (`cart.add(item)`), never by handing out internals.
- Use immutable **value objects** for the entity's attributes (`Money total`, `DateRange stay`).

## Real-world example

A pricing service cached `Price` objects and shared them across requests. One code path applied a discount by calling `price.setAmount(price.getAmount() * 0.9)` — mutating the cached object. Every subsequent customer got the discount. Making `Price` immutable (`price.discounted(10)` returns a new object) made the bug impossible to write.

## Common mistakes

- Using `double` for money (rounding errors). Use `long` minor units or `BigDecimal`.
- Forgetting the **input** copy (the caller keeps a reference to your internal list).
- Returning internal arrays (arrays are always mutable).
- Assuming `final` on a field makes the *object it points to* immutable — it only makes the *reference* final.
- Making large, frequently changing entities immutable, which causes excessive copying. Apply immutability where it fits.

## In the interview

> [!INTERVIEW] Where to use it
> Mention immutability when you introduce value objects: *"`Money` and `TimeSlot` are immutable records, so I can share them freely and use them as map keys — and they're thread-safe without locks."* It's a quick, strong signal, especially when concurrency comes up.

## Key takeaways

- Immutable objects are **always valid, safely shareable and thread-safe**.
- Recipe: `final` class or `record`, `private final` fields, no setters, validate in the constructor, **copy mutable inputs and outputs**.
- Records are **shallowly** immutable; copy collections in the compact constructor.
- Mutable entities should still hide their internals and use immutable value objects.

## Knowledge check

```quiz
? A record has a `List<String> tags` component. What should its compact constructor do?
- Nothing — records are deeply immutable
+ `tags = List.copyOf(tags);` to take an unmodifiable snapshot
- Make the list field `volatile`
> Records are shallowly immutable; copying protects against later changes to the caller's list.

? Why are immutable objects automatically thread-safe?
+ Their state cannot change after construction, so concurrent readers can never see a partial update
- The JVM locks them automatically
- They are stored on the stack
> No writes after construction means no data races.

? `Money.plus()` returns a new Money instead of modifying `this`. What problem does this prevent?
- It makes the code shorter
+ A shared Money (such as a cached price) can't be accidentally modified by one caller and affect others
- It allows Money to be subclassed
> Returning new objects means shared values can't be changed underneath other users.
```

## Exercise

Make this class properly immutable and add a `withParticipant(String)` method that returns a new meeting:

```java
public class Meeting {
    public String title;
    public java.util.Date start;
    public java.util.List<String> participants;
}
```

````hint title="Hint"
`java.util.Date` is mutable — prefer `java.time.Instant`, which is immutable. Watch both the constructor and the accessors.
````

````solution title="Reference solution"
```java file="MeetingDemo.java"
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public class MeetingDemo {
    public static void main(String[] args) {
        Meeting m = new Meeting("Design review", Instant.parse("2026-03-01T10:00:00Z"), List.of("asha"));
        Meeting m2 = m.withParticipant("ravi");
        System.out.println(m.participants() + " / " + m2.participants());
    }
}

record Meeting(String title, Instant start, List<String> participants) {
    Meeting {
        Objects.requireNonNull(start, "start");
        if (title == null || title.isBlank()) throw new IllegalArgumentException("title required");
        participants = List.copyOf(participants);
    }

    Meeting withParticipant(String person) {
        if (participants.contains(person)) return this;   // no change needed
        List<String> next = new ArrayList<>(participants);
        next.add(person);
        return new Meeting(title, start, next);
    }
}
```
````
