## The problem

Some objects have **many fields, most of them optional**: an HTTP request, a pizza order, a hotel booking, a notification. Constructors quickly become unreadable and error-prone:

```java
new Pizza("LARGE", "THIN", true, false, true, null, 2, List.of("olives"), false);
// Which boolean is extra cheese? Is null allowed? Did I swap two arguments of the same type?
```

The usual alternatives are bad too. **Telescoping constructors** (one per combination) explode in number. **Setters** make the object mutable, and it's temporarily invalid while being set up.

**Builder** separates **construction** from **representation**: a separate builder object accumulates parameters with **named methods**, validates them, and then produces an **immutable** object in one step.

## When to use it — and when not

**Use when:**

- More than ~4 constructor parameters, especially optional ones or several of the same type.
- The result should be **immutable** and **validated as a whole** ("delivery time required if delivery type is SCHEDULED").
- You want readable test fixtures.

**Don't use when:**

- There are 2–3 required parameters: a constructor or record is clearer.
- All fields are required: a record with a compact constructor is enough.

## Core idea

- A static nested `Builder` class holds mutable copies of the fields.
- Fluent setter-like methods return `this`.
- `build()` validates the combination and calls a **private** constructor of the product.
- Required parameters go into the builder's constructor or factory method, so they can't be forgotten.

## UML

```uml title="Builder"
class Notification
  - recipient: String
  - channel: Channel
  - subject: String
  - body: String
  - priority: Priority
  - Notification(b: Builder)
  + builder(recipient: String, channel: Channel): Builder
class Builder
  - recipient: String
  - subject: String
  + subject(s: String): Builder
  + body(b: String): Builder
  + priority(p: Priority): Builder
  + build(): Notification
Builder ..> Notification : builds
```

## Java implementation

```java title="An immutable, validated object built step by step" file="BuilderDemo.java"
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

public class BuilderDemo {
    public static void main(String[] args) {
        Notification welcome = Notification.builder("asha@example.com", Channel.EMAIL)
                .subject("Welcome!")
                .body("Thanks for signing up.")
                .priority(Priority.LOW)
                .attach("terms.pdf")
                .build();
        System.out.println(welcome);

        Notification otp = Notification.builder("+91-98765", Channel.SMS)
                .body("Your OTP is 482913")
                .priority(Priority.HIGH)
                .build();
        System.out.println(otp);

        try {
            Notification.builder("+91-98765", Channel.SMS).body("hi").subject("not allowed").build();
        } catch (IllegalStateException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
    }
}

enum Channel { EMAIL, SMS, PUSH }
enum Priority { LOW, NORMAL, HIGH }

final class Notification {
    private final String recipient;
    private final Channel channel;
    private final String subject;          // optional (email only)
    private final String body;
    private final Priority priority;       // defaults to NORMAL
    private final Instant sendAfter;       // optional
    private final List<String> attachments;

    private Notification(Builder b) {
        this.recipient = b.recipient;
        this.channel = b.channel;
        this.subject = b.subject;
        this.body = b.body;
        this.priority = b.priority;
        this.sendAfter = b.sendAfter;
        this.attachments = List.copyOf(b.attachments);
    }

    /** Required parameters up front: they can't be forgotten. */
    static Builder builder(String recipient, Channel channel) { return new Builder(recipient, channel); }

    @Override public String toString() {
        return channel + " to " + recipient + " [" + priority + "]"
                + (subject != null ? " '" + subject + "'" : "") + ": " + body
                + (attachments.isEmpty() ? "" : " +" + attachments)
                + (sendAfter != null ? " after " + sendAfter : "");
    }

    static final class Builder {
        private final String recipient;
        private final Channel channel;
        private String subject;
        private String body;
        private Priority priority = Priority.NORMAL;
        private Instant sendAfter;
        private final List<String> attachments = new ArrayList<>();

        private Builder(String recipient, Channel channel) {
            if (recipient == null || recipient.isBlank()) throw new IllegalArgumentException("recipient required");
            if (channel == null) throw new IllegalArgumentException("channel required");
            this.recipient = recipient;
            this.channel = channel;
        }

        Builder subject(String subject) { this.subject = subject; return this; }
        Builder body(String body) { this.body = body; return this; }
        Builder priority(Priority priority) { this.priority = priority; return this; }
        Builder sendAfter(Instant when) { this.sendAfter = when; return this; }
        Builder attach(String file) { this.attachments.add(file); return this; }

        /** Cross-field validation happens once, here. */
        Notification build() {
            if (body == null || body.isBlank()) throw new IllegalStateException("body required");
            if (channel == Channel.SMS && subject != null) throw new IllegalStateException("SMS has no subject");
            if (channel == Channel.SMS && body.length() > 160) throw new IllegalStateException("SMS body too long");
            if (channel != Channel.EMAIL && !attachments.isEmpty()) throw new IllegalStateException("only email supports attachments");
            return new Notification(this);
        }
    }
}
```

## Realistic use case

The JDK's `HttpRequest.newBuilder().uri(...).header(...).timeout(...).POST(...).build()` is a Builder. In LLD problems, builders fit **orders** (items, delivery instructions, coupon, schedule), **hotel bookings** (guests, dates, preferences, add-ons) and **test fixtures** (`aBooking().forGuest("asha").nights(3).build()`), where they make tests readable and resilient to new fields. See [Food Ordering](problem:food-ordering).

## Trade-offs and alternatives

- **Pros:** readable call sites; immutability; one place for cross-field validation; easy defaults.
- **Cons:** more code (the builder duplicates the fields); invalid combinations are only caught at `build()`, at runtime.
- **Alternatives:**
  - **Records** for all-required data.
  - **Static factories with names** for a few common variants (`Notification.sms(to, body)`).
  - **Wither methods** on immutable objects (`booking.withGuests(3)`) for small modifications.
  - **Step builders** (each step returns a different interface) when the compiler must enforce required steps. Heavyweight; rarely worth it.

## Recognising it in an interview

- "An order can have optional delivery instructions, a coupon, a scheduled time, gift wrapping…"
- You're about to write a constructor with more than four parameters.
- The interviewer asks how you'd write tests for an object with many fields.

## Common mistakes

- Builders for tiny objects (overengineering).
- A **mutable product** with setters *and* a builder — choose immutability.
- No validation in `build()`, so invalid objects still get created.
- Reusing a builder after `build()` and accidentally sharing mutable state, such as the attachments list (copy it in the product's constructor).

## Key takeaways

- Builder gives **named, step-by-step construction** of complex **immutable** objects.
- Put **required** parameters in the builder's entry point, **optional** ones in fluent methods.
- Do **cross-field validation** in `build()`.
- Use records or factories when objects are small or all-required.

## Knowledge check

```quiz
? Which situation most justifies a Builder?
- A Point(x, y) record
+ An Order with 3 required and 8 optional fields, plus rules spanning several fields
- A class with no fields
> Many optional fields and cross-field validation are the classic Builder cues.

? Where should "SMS notifications cannot have a subject" be validated?
- In each fluent method
+ In build(), where all fields are known
- In the caller
> Cross-field rules need the complete picture, which build() has.

? Why are required parameters passed to `builder(recipient, channel)` instead of fluent methods?
+ So they can't be forgotten: the builder can't exist without them
- Fluent methods can't take Strings
- To make the builder mutable
> Putting required data in the entry point uses the compiler to enforce it.
```

## Exercise

Write a builder for a `HotelBooking` with: required `guestName`, `checkIn` and `checkOut` (`LocalDate`); optional `guests` (default 1, max 4), `breakfastIncluded` (default false), `specialRequests` (list), and `roomType` (default `STANDARD`). Validate that check-out is after check-in and that `SUITE` allows up to 6 guests.

````hint title="Hint"
Guest validation depends on room type, so it belongs in `build()`.
````

````solution title="Reference solution"
```java file="HotelBookingBuilderDemo.java"
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

public class HotelBookingBuilderDemo {
    public static void main(String[] args) {
        HotelBooking b = HotelBooking.builder("Asha", LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 4))
                .roomType(RoomType.SUITE).guests(5).breakfast(true).request("late check-out").build();
        System.out.println(b);
    }
}

enum RoomType {
    STANDARD(4), SUITE(6);
    final int maxGuests;
    RoomType(int maxGuests) { this.maxGuests = maxGuests; }
}

record HotelBooking(String guestName, LocalDate checkIn, LocalDate checkOut, int guests,
                    boolean breakfastIncluded, List<String> specialRequests, RoomType roomType) {

    static Builder builder(String guestName, LocalDate checkIn, LocalDate checkOut) {
        return new Builder(guestName, checkIn, checkOut);
    }

    static final class Builder {
        private final String guestName;
        private final LocalDate checkIn, checkOut;
        private int guests = 1;
        private boolean breakfast;
        private final List<String> requests = new ArrayList<>();
        private RoomType roomType = RoomType.STANDARD;

        private Builder(String guestName, LocalDate checkIn, LocalDate checkOut) {
            this.guestName = guestName;
            this.checkIn = checkIn;
            this.checkOut = checkOut;
        }

        Builder guests(int n) { this.guests = n; return this; }
        Builder breakfast(boolean b) { this.breakfast = b; return this; }
        Builder request(String r) { this.requests.add(r); return this; }
        Builder roomType(RoomType t) { this.roomType = t; return this; }

        HotelBooking build() {
            if (guestName == null || guestName.isBlank()) throw new IllegalStateException("guest name required");
            if (!checkOut.isAfter(checkIn)) throw new IllegalStateException("check-out must be after check-in");
            if (guests < 1 || guests > roomType.maxGuests) {
                throw new IllegalStateException(roomType + " allows 1.." + roomType.maxGuests + " guests");
            }
            return new HotelBooking(guestName, checkIn, checkOut, guests, breakfast, List.copyOf(requests), roomType);
        }
    }
}
```
````
