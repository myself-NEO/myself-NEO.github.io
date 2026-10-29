## Four tools, four problems

The "four pillars of OOP" are often recited as definitions. It's more useful to remember the **design problem each one solves**:

| Pillar | Problem it solves |
|---|---|
| **Encapsulation** | "Anyone can change this data and break the rules." |
| **Abstraction** | "Callers have to know too much about how this works." |
| **Inheritance** | "Several types share an identity and some behaviour." |
| **Polymorphism** | "I keep writing `if (type == X) … else if (type == Y)`." |

## Encapsulation — protect state behind behaviour

Encapsulation means an object **owns its data and the rules about that data**. Fields are private; the only way to change them is through methods that keep the object valid.

A helpful slogan is **"Tell, don't ask"**: tell an object what you want done instead of asking for its data and doing the work yourself.

```java title="Ask (weak) vs tell (strong)"
// Ask: the caller pulls data out and makes the decision.
if (cart.getItems().size() < 10 && !cart.isCheckedOut()) {
    cart.getItems().add(item);
}

// Tell: the cart enforces its own rules.
cart.add(item);   // throws if checked out or full
```

In the "ask" version, every caller must remember both rules. In the "tell" version, the rules live in one place, and `getItems()` doesn't even need to exist.

## Abstraction — expose what, hide how

Abstraction means presenting a **simple model** to callers and hiding the details. In Java, interfaces are the main abstraction tool:

```java
interface PaymentGateway {
    PaymentResult charge(String customerId, long amountInPaise);
}
```

The checkout code calls `charge()` without knowing about HTTP clients, retries, card networks or signature schemes. That knowledge lives inside an implementation like `RazorpayGateway`.

Encapsulation and abstraction are related but different. **Encapsulation** hides *data* behind methods inside one class. **Abstraction** hides *implementation* behind a contract, often across many classes.

## Inheritance — share identity and behaviour

Inheritance (`extends`) creates an **is-a** relationship: a `SavingsAccount` *is a* `BankAccount`. The subclass inherits fields and methods and can override behaviour.

```java
abstract class Account {
    protected long balance;
    void deposit(long amount) { balance += amount; }
    abstract long monthlyFee();
}

class SavingsAccount extends Account {
    @Override long monthlyFee() { return balance >= 10_000 ? 0 : 100; }
}
```

Inheritance is powerful but **tightly couples** subclass to superclass. Changes to the parent ripple into every child. The next lesson, [Composition vs Inheritance](lesson:composition-vs-inheritance), covers when to avoid it.

## Polymorphism — one interface, many behaviours

Polymorphism ("many forms") means code written against a supertype works with any subtype, and the **right method is chosen at runtime** (dynamic dispatch). It is the cure for type-checking conditionals.

```java title="Without polymorphism: a switch that grows forever"
long shippingCost(Order order) {
    switch (order.shippingType()) {
        case "STANDARD": return 40;
        case "EXPRESS":  return order.weightKg() > 5 ? 150 : 100;
        case "SAME_DAY": return 250;
        default: throw new IllegalArgumentException("Unknown type");
    }
}
// Adding "DRONE" means editing this method - and every other switch on shippingType.
```

```java title="With polymorphism: each type knows its own cost" file="ShippingDemo.java"
import java.util.List;

public class ShippingDemo {
    public static void main(String[] args) {
        List<ShippingMethod> methods = List.of(new Standard(), new Express(), new SameDay());
        for (ShippingMethod m : methods) {
            System.out.println(m.name() + " for 7kg costs " + m.cost(7));   // dynamic dispatch
        }
    }
}

interface ShippingMethod {
    String name();
    long cost(double weightKg);
}

class Standard implements ShippingMethod {
    public String name() { return "Standard"; }
    public long cost(double weightKg) { return 40; }
}

class Express implements ShippingMethod {
    public String name() { return "Express"; }
    public long cost(double weightKg) { return weightKg > 5 ? 150 : 100; }
}

class SameDay implements ShippingMethod {
    public String name() { return "Same day"; }
    public long cost(double weightKg) { return 250; }
}
```

Adding drone delivery is now a **new class**; no existing code changes. That's the [Open/Closed Principle](lesson:open-closed) in action, and the core of the [Strategy pattern](lesson:strategy).

```uml title="Polymorphic shipping"
interface ShippingMethod
  + name(): String
  + cost(weightKg: double): long
class Standard
class Express
class SameDay
Standard ..|> ShippingMethod
Express ..|> ShippingMethod
SameDay ..|> ShippingMethod
```

> [!NOTE] Overloading is not polymorphism (in this sense)
> *Overloading* — several methods with the same name and different parameters — is resolved at compile time. *Overriding* — a subclass replacing a supertype method — is resolved at runtime. Design discussions about polymorphism are about overriding.

## Real-world example

A food delivery app calculated discounts with a 300-line `switch` over coupon types spread across the cart, checkout and invoice services. Each new coupon type needed edits in three places, and one place was always forgotten. Replacing the switch with a `Discount` interface (`FlatDiscount`, `PercentageDiscount`, `BuyOneGetOne`) meant new coupons were new classes registered in one place. Invoices and checkout simply call `discount.apply(cart)`.

## Common mistakes

- **Getters and setters for everything** and calling it encapsulation. If every field has a public setter, nothing is protected.
- **Inheritance for code reuse only.** `class Stack extends ArrayList` inherits `add(index, e)`, which breaks stack semantics. Reuse via composition instead.
- **Abstraction for its own sake.** An interface with exactly one implementation and no foreseeable second one is often noise. See [YAGNI](lesson:dry-kiss-yagni).
- **`instanceof` chains** that re-create the type switch in a different form.

## In the interview

> [!INTERVIEW] Spot the switch
> When you notice yourself writing a `switch` or `if/else` on a type field (vehicle type, payment method, user role), say: *"This will grow with every new type; I'll make it polymorphic."* It's one of the clearest design signals you can send.

## Key takeaways

- **Encapsulation**: private state plus methods that enforce rules. *Tell, don't ask.*
- **Abstraction**: callers depend on what an object does, not how.
- **Inheritance**: is-a reuse with tight coupling — use deliberately.
- **Polymorphism**: replace type conditionals with objects that know their own behaviour.

## Knowledge check

```quiz
? Which change best applies "tell, don't ask"?
- Add getters so callers can inspect the order's status before cancelling
+ Replace `if (order.getStatus() == PLACED) order.setStatus(CANCELLED)` with `order.cancel()`, which enforces the rule
- Make the status field public
> Telling the object to cancel itself keeps the rule inside the object that owns the status.

? A `calculateFee()` method switches on `vehicle.getType()`. A new vehicle type arrives every quarter. What's the best refactor?
- Add another case each quarter
+ Introduce a polymorphic method (or a pricing strategy) so each type supplies its own fee
- Convert the switch into nested if/else statements
> Polymorphism removes the growing conditional and lets new types be added without editing existing code.

? What is the key difference between encapsulation and abstraction?
+ Encapsulation hides an object's data behind its methods; abstraction hides implementation behind a simpler contract
- They are the same thing
- Abstraction requires inheritance; encapsulation requires interfaces
> Encapsulation protects state inside a class; abstraction presents a simplified contract such as an interface.
```

## Exercise

Refactor this code so that adding a new notification channel does not require editing `send()`:

```java
class Notifier {
    void send(String channel, String to, String message) {
        if (channel.equals("EMAIL")) {
            System.out.println("Email to " + to + ": " + message);
        } else if (channel.equals("SMS")) {
            if (message.length() > 160) message = message.substring(0, 160);
            System.out.println("SMS to " + to + ": " + message);
        } else if (channel.equals("PUSH")) {
            System.out.println("Push to device " + to + ": " + message);
        }
    }
}
```

````hint title="Hint"
Each branch has its own rules (SMS truncation). Which object should own those rules? What single method would all channels share?
````

````solution title="Reference solution"
```java file="NotifierDemo.java"
import java.util.Map;

public class NotifierDemo {
    public static void main(String[] args) {
        Notifier notifier = new Notifier(Map.of(
                "EMAIL", new EmailChannel(),
                "SMS", new SmsChannel(),
                "PUSH", new PushChannel()));
        notifier.send("SMS", "+91-99999", "Your order has shipped!");
        notifier.send("EMAIL", "asha@example.com", "Receipt attached");
    }
}

interface Channel {
    void deliver(String to, String message);
}

class EmailChannel implements Channel {
    public void deliver(String to, String message) { System.out.println("Email to " + to + ": " + message); }
}

class SmsChannel implements Channel {
    private static final int MAX_LENGTH = 160;
    public void deliver(String to, String message) {
        String body = message.length() > MAX_LENGTH ? message.substring(0, MAX_LENGTH) : message;
        System.out.println("SMS to " + to + ": " + body);
    }
}

class PushChannel implements Channel {
    public void deliver(String to, String message) { System.out.println("Push to device " + to + ": " + message); }
}

class Notifier {
    private final Map<String, Channel> channels;

    Notifier(Map<String, Channel> channels) { this.channels = Map.copyOf(channels); }

    void send(String channelName, String to, String message) {
        Channel channel = channels.get(channelName);
        if (channel == null) throw new IllegalArgumentException("Unknown channel: " + channelName);
        channel.deliver(to, message);
    }
}
```

A new channel (WhatsApp, say) is a new `Channel` implementation registered in the map — `Notifier` doesn't change. The full design is in [Notification Service](problem:notification-service).
````
