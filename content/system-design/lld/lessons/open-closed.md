## The principle

> **Software entities should be open for extension but closed for modification.**

You should be able to **add new behaviour** by **adding new code** — a new class — rather than editing existing, tested code. In Java, the main mechanism is **polymorphism**: define an abstraction, and add implementations.

OCP is never absolute. You decide **which kinds of change** your design should absorb cheaply. Those are your *extension points*.

## Analogy

A power strip is closed for modification — you don't rewire it — but open for extension: plug in a lamp, a laptop or a phone charger. The socket is the abstraction; each device is an implementation. Rewiring the strip for each new device would be absurd, yet that's exactly what a growing `switch` statement does.

## The problematic version

```java title="❌ Every new discount edits this method"
class DiscountCalculator {
    long discount(Order order, String couponType) {
        switch (couponType) {
            case "FLAT100":
                return Math.min(100, order.total());
            case "PERCENT10":
                return order.total() / 10;
            case "BOGO":
                return order.cheapestItemPrice();
            default:
                return 0;
        }
    }
}
```

Problems:

- Each new coupon type means **modifying** this class, and re-testing every existing branch.
- The switch tends to be **duplicated** — validation, display text and analytics all switch on `couponType` too.
- Coupon-specific data (thresholds, caps, eligible categories) has nowhere natural to live.

## The improved version

```java title="✅ New discounts are new classes" file="OcpDemo.java"
import java.util.List;
import java.util.Map;

public class OcpDemo {
    public static void main(String[] args) {
        Order order = new Order(List.of(300L, 150L, 50L));
        Map<String, Discount> coupons = Map.of(
                "FLAT100", new FlatDiscount(100),
                "PERCENT10", new PercentageDiscount(10, 200),
                "BOGO", new CheapestItemFree(),
                "NEWYEAR", new PercentageDiscount(25, 500));   // added later: no existing code changed

        for (var entry : coupons.entrySet()) {
            System.out.println(entry.getKey() + " -> " + entry.getValue().amountOff(order));
        }
    }
}

record Order(List<Long> itemPrices) {
    long total() { return itemPrices.stream().mapToLong(Long::longValue).sum(); }
    long cheapestItemPrice() { return itemPrices.stream().mapToLong(Long::longValue).min().orElse(0); }
}

/** The extension point. */
interface Discount {
    long amountOff(Order order);
}

class FlatDiscount implements Discount {
    private final long amount;
    FlatDiscount(long amount) { this.amount = amount; }
    public long amountOff(Order order) { return Math.min(amount, order.total()); }
}

class PercentageDiscount implements Discount {
    private final int percent;
    private final long cap;                       // discount-specific data has a home
    PercentageDiscount(int percent, long cap) { this.percent = percent; this.cap = cap; }
    public long amountOff(Order order) { return Math.min(cap, order.total() * percent / 100); }
}

class CheapestItemFree implements Discount {
    public long amountOff(Order order) { return order.itemPrices().size() >= 2 ? order.cheapestItemPrice() : 0; }
}
```

The code that *uses* discounts — checkout, invoices — depends only on `Discount`. Registering a new coupon happens in one place (a map, a factory or configuration). See [Factory Method](lesson:factory-method) and [Extensible APIs](lesson:extensible-apis).

```uml title="Discount extension point"
interface Discount
  + amountOff(order: Order): long
class FlatDiscount
class PercentageDiscount
class CheapestItemFree
class Checkout
  + total(order: Order, d: Discount): long
FlatDiscount ..|> Discount
PercentageDiscount ..|> Discount
CheapestItemFree ..|> Discount
Checkout --> Discount : depends on
```

## Why it works

- **Existing code is untouched** when a coupon is added, so existing behaviour can't regress.
- Each discount is **independently testable**.
- Discount-specific state lives **inside its class**.
- The switch on type appears **once** (if at all), in the registration or factory, instead of throughout the codebase.

## Choosing extension points wisely

OCP has a cost: indirection and more types. Apply it where change is **likely**:

| Likely to vary → extension point | Unlikely to vary → keep simple |
|---|---|
| Pricing, discounts, fees | The parking lot's basic park/unpark flow |
| Notification channels | The fact that a ticket has an ID |
| Payment providers | The coin denominations in a single country |
| Matching/eviction/scheduling algorithms | Board size in classic chess |

The first time a new variant appears, a simple `if` can be fine. The **second** time, refactor to an extension point. This is the "rule of three" approach, which keeps you honest about [YAGNI](lesson:dry-kiss-yagni).

## Real-world example

A ride-hailing app's fare calculation had a switch over city codes. Every city launch required a code change to the core fare service and a full regression cycle. Moving to a `FareRule` interface with per-city implementations loaded by a registry let city teams add rules independently, and the core service stopped changing for launches.

## Common mistakes

- **Speculative extension points** for things that never vary, such as interfaces with one implementation "just in case".
- **Leaky abstractions.** An interface method like `amountOff(Order, String couponType)` that still needs the type defeats the purpose.
- **Fake OCP.** Replacing a `switch` with `if (d instanceof FlatDiscount)` checks elsewhere.
- **Believing OCP means never editing code.** Bug fixes and requirement changes to *existing* behaviour still modify code. OCP is about *adding* variants.

## Interview questions

> [!INTERVIEW] Likely questions
> - *"How would you add a new vehicle type / payment method / notification channel?"* — the canonical OCP follow-up. The ideal answer: *"Add one class implementing X and register it; nothing else changes."*
> - *"Isn't an interface with one implementation over-engineering?"* → "Yes, unless the requirements or the domain make a second implementation likely. Here pricing changes often, so the interface earns its keep."
> - *"Where does the switch go then?"* → "One place: the factory or registry that maps coupon codes to implementations — or configuration."

## Key takeaways

- **Extend by adding classes**, not by editing a growing conditional.
- Polymorphism (interfaces + implementations) is the main tool; [Strategy](lesson:strategy) is the canonical pattern.
- Choose extension points where **change is likely**; don't abstract everything.
- Type selection belongs in **one** registry or factory.

## Knowledge check

```quiz
? Which change best satisfies OCP for adding a new shipping provider?
- Add a new case to the switch in ShippingService
+ Create a new class implementing ShippingProvider and register it
- Copy ShippingService and modify the copy
> New behaviour arrives as a new implementation of an existing abstraction.

? When is adding an extension point most justified?
+ When the requirements or domain make new variants likely, such as pricing rules or payment methods
- For every class in the design
- Only for classes with more than 500 lines
> Extension points cost indirection; spend them where change is expected.

? An interface is `amountOff(Order order, String couponType)`. What's wrong?
- Nothing
+ Implementations still need the type code, so the conditional logic hasn't really been removed
- Interfaces can't take two parameters
> If the abstraction still needs to know the concrete type, the type switch is merely hidden.
```

## Exercise

A parking lot computes fees with:

```java
long fee(VehicleType type, Duration d) {
    long hours = Math.max(1, d.toHours());
    if (type == VehicleType.BIKE) return hours * 10;
    if (type == VehicleType.CAR) return hours * 40;
    if (type == VehicleType.TRUCK) return hours * 100 + 200;   // entry surcharge
    throw new IllegalArgumentException();
}
```

The business wants (a) electric cars at 30/hour with free first hour, and (b) a weekend rate that doubles all prices. Refactor so both can be added without editing the existing pricing code.

````hint title="Hint 1"
There are two separate concerns: per-vehicle base pricing, and a time-based adjustment. Should they be one abstraction or two?
````

````hint title="Hint 2"
A weekend multiplier can *wrap* any base pricing rule — think [Decorator](lesson:decorator).
````

````solution title="Reference solution"
```java file="ParkingOcpDemo.java"
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Map;

public class ParkingOcpDemo {
    public static void main(String[] args) {
        Map<String, PricingRule> rules = Map.of(
                "BIKE", new HourlyRule(10, 0),
                "CAR", new HourlyRule(40, 0),
                "TRUCK", new HourlyRule(100, 200),
                "EV", new FreeFirstHourRule(new HourlyRule(30, 0)));

        LocalDateTime saturday = LocalDateTime.of(2026, 1, 3, 10, 0);
        PricingRule weekendCar = new WeekendMultiplier(rules.get("CAR"), 2);
        System.out.println("EV 3h: " + rules.get("EV").fee(Duration.ofHours(3), saturday));
        System.out.println("Car 2h on Saturday: " + weekendCar.fee(Duration.ofHours(2), saturday));
    }
}

interface PricingRule {
    long fee(Duration parked, LocalDateTime exitTime);
}

class HourlyRule implements PricingRule {
    private final long perHour, surcharge;
    HourlyRule(long perHour, long surcharge) { this.perHour = perHour; this.surcharge = surcharge; }
    public long fee(Duration parked, LocalDateTime exit) {
        return Math.max(1, parked.toHours()) * perHour + surcharge;
    }
}

class FreeFirstHourRule implements PricingRule {
    private final PricingRule base;
    FreeFirstHourRule(PricingRule base) { this.base = base; }
    public long fee(Duration parked, LocalDateTime exit) {
        Duration billable = parked.minusHours(1);
        return billable.isNegative() || billable.isZero() ? 0 : base.fee(billable, exit);
    }
}

class WeekendMultiplier implements PricingRule {
    private final PricingRule base;
    private final int factor;
    WeekendMultiplier(PricingRule base, int factor) { this.base = base; this.factor = factor; }
    public long fee(Duration parked, LocalDateTime exit) {
        DayOfWeek day = exit.getDayOfWeek();
        boolean weekend = day == DayOfWeek.SATURDAY || day == DayOfWeek.SUNDAY;
        return base.fee(parked, exit) * (weekend ? factor : 1);
    }
}
```

EV pricing and weekend pricing are new classes. `HourlyRule` is never edited.
````
