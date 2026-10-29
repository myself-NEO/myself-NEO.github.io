## The problem

Code that needs an object often doesn't care **which concrete class** it gets — only that it fulfils an interface. But `new ConcreteClass()` welds the caller to that class. When the choice depends on input ("create the right `Vehicle` for this licence type") or configuration ("use the sandbox payment gateway in staging"), `new` statements and type switches spread through the codebase.

**Factory Method** moves creation behind a method, so callers depend on the **product interface**, and the creation decision lives in **one place**.

## When to use it — and when not

**Use when:**

- The concrete type is chosen at runtime from input, configuration or environment.
- Creation involves logic (validation, caching, choosing a subtype) that shouldn't be duplicated.
- You want to hide implementation classes behind an interface (`List.of(...)` returns an internal class).

**Don't use when:**

- There is one concrete class and no variation: just call the constructor.
- A factory would merely wrap `new` with no decision logic.

## Core idea — three common forms

1. **Static factory method** — `Money.of(100, "INR")`, `List.of(...)`, `Optional.empty()`. Named, can cache, can return subtypes. The most common in practice.
2. **Simple factory** — a class with a method that switches on input to create a product. Not a GoF pattern, but extremely common and fine.
3. **GoF Factory Method** — an abstract "creator" declares `createProduct()`, and subclasses override it to decide the concrete product. The creator's other methods use the product without knowing its type.

## UML (GoF form)

```uml title="Factory Method"
interface Notification
  + send(to: String, body: String): void
abstract class NotificationSender
  + notifyUser(to: String, body: String): void
  # createNotification(): Notification
class EmailSender
  # createNotification(): Notification
class SmsSender
  # createNotification(): Notification
class EmailNotification
class SmsNotification
EmailSender --|> NotificationSender
SmsSender --|> NotificationSender
EmailNotification ..|> Notification
SmsNotification ..|> Notification
NotificationSender ..> Notification : creates via factory method
```

## Java implementation

```java title="Static, simple and GoF factory methods" file="FactoryMethodDemo.java"
import java.util.Map;
import java.util.function.Supplier;

public class FactoryMethodDemo {
    public static void main(String[] args) {
        // 1. Static factory methods: named and validated
        Money fee = Money.ofRupees(150);
        System.out.println(fee);

        // 2. Simple factory: input -> concrete type, in one place
        VehicleFactory factory = new VehicleFactory();
        Vehicle v1 = factory.create("CAR", "KA-01-1111");
        Vehicle v2 = factory.create("TRUCK", "KA-02-2222");
        System.out.println(v1.plate() + " needs " + v1.spotSize() + ", " + v2.plate() + " needs " + v2.spotSize());

        // 3. GoF factory method: subclasses decide the product
        NotificationSender sender = new SmsSender();
        sender.notifyUser("+91-98765", "Your cab is arriving");
    }
}

// -- 1. Static factory --
record Money(long paise) {
    Money {
        if (paise < 0) throw new IllegalArgumentException("negative money");
    }
    static Money ofRupees(long rupees) { return new Money(Math.multiplyExact(rupees, 100)); }
}

// -- 2. Simple factory with a registry instead of a switch --
enum SpotSize { SMALL, MEDIUM, LARGE }

interface Vehicle {
    String plate();
    SpotSize spotSize();
}

record Bike(String plate) implements Vehicle { public SpotSize spotSize() { return SpotSize.SMALL; } }
record Car(String plate) implements Vehicle { public SpotSize spotSize() { return SpotSize.MEDIUM; } }
record Truck(String plate) implements Vehicle { public SpotSize spotSize() { return SpotSize.LARGE; } }

class VehicleFactory {
    private final Map<String, java.util.function.Function<String, Vehicle>> creators = Map.of(
            "BIKE", Bike::new,
            "CAR", Car::new,
            "TRUCK", Truck::new);

    Vehicle create(String type, String plate) {
        var creator = creators.get(type);
        if (creator == null) throw new IllegalArgumentException("Unknown vehicle type: " + type);
        return creator.apply(plate);
    }
}

// -- 3. GoF Factory Method --
interface Notification { void send(String to, String body); }

class EmailNotification implements Notification {
    public void send(String to, String body) { System.out.println("EMAIL to " + to + ": " + body); }
}

class SmsNotification implements Notification {
    public void send(String to, String body) {
        System.out.println("SMS to " + to + ": " + (body.length() > 160 ? body.substring(0, 160) : body));
    }
}

abstract class NotificationSender {
    /** The algorithm uses the product without knowing its concrete type. */
    final void notifyUser(String to, String body) {
        if (to == null || to.isBlank()) throw new IllegalArgumentException("recipient required");
        createNotification().send(to, body);
    }

    /** The factory method: subclasses decide what to create. */
    protected abstract Notification createNotification();
}

class EmailSender extends NotificationSender {
    protected Notification createNotification() { return new EmailNotification(); }
}

class SmsSender extends NotificationSender {
    protected Notification createNotification() { return new SmsNotification(); }
}
```

> [!TIP] Registry beats switch
> The `VehicleFactory` uses a map of constructors instead of a `switch`. Adding a vehicle type is one new map entry, and the map can be populated from configuration or plugins. See [Extensible APIs](lesson:extensible-apis).

## Realistic use case

A payment module creates a `PaymentGateway` per merchant country: `RazorpayGateway` for India, `StripeGateway` for the US, and a `SandboxGateway` in test environments. A `PaymentGatewayFactory.forMerchant(merchant, env)` encapsulates that choice. The checkout code depends only on `PaymentGateway` and never changes when a country is added.

## Trade-offs and alternatives

- **Pros:** decouples callers from concrete classes; centralises creation logic; named constructors read better.
- **Cons:** another class or method to maintain; the GoF subclassing version is heavyweight.
- **Alternatives:**
  - **Dependency injection** — if the choice is made once at startup, just inject the right instance; no factory needed.
  - **`Supplier<T>`** or a constructor reference — a lightweight factory you can pass around.
  - **[Abstract Factory](lesson:abstract-factory)** — when you create *families* of related products.
  - **[Builder](lesson:builder)** — when construction has many optional parameters.

## Recognising it in an interview

- "Create the right *X* based on *type/input*" — vehicles, chess pieces, notifications, shapes.
- The interviewer asks *"How do you add a new type?"* → "Add the class and register it in the factory."
- You notice `new` for one of several implementations scattered in business logic.

## Common mistakes

- Factories that are just `return new X();` with no decision logic.
- A `switch` factory duplicated across the codebase (it defeats the purpose).
- Factories that also configure, validate and persist — creation should be just creation.
- Returning `null` for unknown types instead of failing fast.

## Key takeaways

- Factory Method hides **which concrete class** is created behind a method that returns an interface.
- Prefer **static factories** and **simple registry-based factories**; use the GoF subclass form when a base algorithm needs a pluggable product.
- Centralise the type decision in **one place**.
- If the choice is fixed at startup, **DI** is simpler than a factory.

## Knowledge check

```quiz
? What is the main benefit of a factory method?
+ Callers depend on an interface while the choice of concrete class lives in one place
- It makes objects immutable
- It removes the need for constructors
> Factories centralise the creation decision and decouple callers from concrete types.

? Which is a static factory method in the JDK?
- `new ArrayList<>()`
+ `List.of(1, 2, 3)`
- `list.add(4)`
> `List.of` is a named static method that returns an implementation of the interface.

? The payment gateway is chosen once from configuration at startup. What's simplest?
- An abstract factory hierarchy
+ Build the right gateway in the composition root and inject it
- A singleton factory called from every service
> If the decision is made once, DI is enough.
```

## Exercise

Write a `ChessPieceFactory` that creates pieces from FEN-style characters: uppercase for white and lowercase for black (`'K'`, `'q'`, `'n'`…). Unknown characters must fail fast. Each piece should expose `symbol()` and `colour()`. Avoid a giant `switch`.

````hint title="Hint"
Map the lowercase letter to a constructor reference that takes a colour; derive the colour from the letter's case.
````

````solution title="Reference solution"
```java file="ChessFactoryDemo.java"
import java.util.Map;
import java.util.function.Function;

public class ChessFactoryDemo {
    public static void main(String[] args) {
        ChessPieceFactory factory = new ChessPieceFactory();
        for (char c : "KqNp".toCharArray()) {
            Piece p = factory.fromFen(c);
            System.out.println(c + " -> " + p.colour() + " " + p.getClass().getSimpleName());
        }
        try {
            factory.fromFen('x');
        } catch (IllegalArgumentException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
    }
}

enum Colour { WHITE, BLACK }

interface Piece {
    Colour colour();
    char symbol();
}

record King(Colour colour) implements Piece { public char symbol() { return 'k'; } }
record Queen(Colour colour) implements Piece { public char symbol() { return 'q'; } }
record Knight(Colour colour) implements Piece { public char symbol() { return 'n'; } }
record Pawn(Colour colour) implements Piece { public char symbol() { return 'p'; } }
record Rook(Colour colour) implements Piece { public char symbol() { return 'r'; } }
record Bishop(Colour colour) implements Piece { public char symbol() { return 'b'; } }

class ChessPieceFactory {
    private static final Map<Character, Function<Colour, Piece>> CREATORS = Map.of(
            'k', King::new, 'q', Queen::new, 'n', Knight::new,
            'p', Pawn::new, 'r', Rook::new, 'b', Bishop::new);

    Piece fromFen(char c) {
        Function<Colour, Piece> creator = CREATORS.get(Character.toLowerCase(c));
        if (creator == null) throw new IllegalArgumentException("Unknown piece '" + c + "'");
        return creator.apply(Character.isUpperCase(c) ? Colour.WHITE : Colour.BLACK);
    }
}
```
````
