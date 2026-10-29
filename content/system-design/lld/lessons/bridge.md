## The problem

Two independent dimensions vary in the same feature. Notifications come in **kinds** (alert, reminder, marketing — each with its own formatting and rules) and are sent over **channels** (email, SMS, push). Modelling both with inheritance gives a class per combination: `EmailAlert`, `SmsAlert`, `PushAlert`, `EmailReminder`… — 3 × 3 = 9 classes, and every new kind or channel adds a whole row or column.

**Bridge** splits the design into two hierarchies — an **abstraction** and an **implementation** — connected by **composition** (the bridge), so each can vary independently.

## When to use it — and when not

**Use when:**

- A class varies along **two (or more) orthogonal dimensions**.
- You want to switch the implementation **at runtime** (send this alert by SMS instead of email).
- Both sides will grow independently (new kinds *and* new channels).

**Don't use when:**

- Only one dimension varies: use [Strategy](lesson:strategy) or simple polymorphism.
- The dimensions aren't truly independent (some combinations are invalid or need special handling).

## Core idea

- **Abstraction** (`Notification`) — the high-level concept; its subclasses (`Alert`, `Reminder`) refine **what** is sent.
- **Implementor** (`Channel`) — the low-level interface; its implementations (`EmailChannel`, `SmsChannel`) define **how** it is delivered.
- The abstraction **holds a reference** to an implementor and delegates the delivery to it.

Bridge is essentially "**composition over inheritance** applied to two hierarchies at once".

## UML

```uml title="Bridge"
abstract class Notification
  # channel: Channel
  + send(to: String): void
  # render(): String
class Alert
class Reminder
interface Channel
  + deliver(to: String, content: String): void
class EmailChannel
class SmsChannel
class PushChannel
Alert --|> Notification
Reminder --|> Notification
Notification --> Channel : bridge
EmailChannel ..|> Channel
SmsChannel ..|> Channel
PushChannel ..|> Channel
```

## Java implementation

```java title="Kinds × channels without a class explosion" file="BridgeDemo.java"
import java.time.LocalDateTime;

public class BridgeDemo {
    public static void main(String[] args) {
        Channel email = new EmailChannel();
        Channel sms = new SmsChannel();

        new Alert(sms, "Card used abroad", 9).send("+91-98765");
        new Alert(email, "Card used abroad", 9).send("asha@example.com");
        new Reminder(email, "Dentist", LocalDateTime.of(2026, 3, 4, 10, 30)).send("asha@example.com");
        new Reminder(new PushChannel(), "Dentist", LocalDateTime.of(2026, 3, 4, 10, 30)).send("device-77");
    }
}

// -- Implementor hierarchy: HOW it's delivered --
interface Channel {
    void deliver(String to, String content);
    int maxLength();
}

class EmailChannel implements Channel {
    public void deliver(String to, String content) { System.out.println("EMAIL " + to + " :: " + content); }
    public int maxLength() { return 10_000; }
}

class SmsChannel implements Channel {
    public void deliver(String to, String content) { System.out.println("SMS   " + to + " :: " + content); }
    public int maxLength() { return 160; }
}

class PushChannel implements Channel {
    public void deliver(String to, String content) { System.out.println("PUSH  " + to + " :: " + content); }
    public int maxLength() { return 100; }
}

// -- Abstraction hierarchy: WHAT is sent --
abstract class Notification {
    protected final Channel channel;            // the bridge
    protected Notification(Channel channel) { this.channel = channel; }

    final void send(String to) {
        String content = render();
        if (content.length() > channel.maxLength()) content = content.substring(0, channel.maxLength() - 3) + "...";
        channel.deliver(to, content);
    }

    protected abstract String render();
}

class Alert extends Notification {
    private final String message;
    private final int severity;
    Alert(Channel channel, String message, int severity) {
        super(channel);
        this.message = message;
        this.severity = severity;
    }
    protected String render() { return (severity >= 8 ? "[URGENT] " : "[ALERT] ") + message; }
}

class Reminder extends Notification {
    private final String event;
    private final LocalDateTime at;
    Reminder(Channel channel, String event, LocalDateTime at) {
        super(channel);
        this.event = event;
        this.at = at;
    }
    protected String render() { return "Reminder: " + event + " at " + at.toLocalTime() + " on " + at.toLocalDate(); }
}
```

Adding a `WhatsAppChannel` is one class, and it works with every notification kind. Adding a `MarketingMessage` kind is one class, and it works with every channel. That's **3 + 3 classes instead of 3 × 3**, growing additively.

## Realistic use case

- **JDBC**: your code (abstraction) uses `Connection` and `Statement`; vendor drivers (implementations) vary independently.
- **Rendering**: shapes (circle, rectangle) × renderers (SVG, canvas, PDF).
- **Remote controls × devices**: basic and advanced remotes working with any TV or radio.
- **Notifications × channels**, as above ([Notification Service](problem:notification-service)).

## Trade-offs and alternatives

- **Pros:** additive growth; runtime switching of the implementation; each hierarchy evolves independently.
- **Cons:** more indirection up front; the split must reflect *real* independent dimensions, or it adds complexity for nothing.
- **Compared with similar patterns:**
  - **[Strategy](lesson:strategy)** — one context with a pluggable algorithm. Bridge is like a strategy where the context *also* has its own hierarchy.
  - **[Adapter](lesson:adapter)** — makes an existing interface fit after the fact; Bridge is designed up front to keep two dimensions apart.
  - **[Abstract Factory](lesson:abstract-factory)** — can create the right implementor for a given abstraction.

## Recognising it in an interview

The sign is a **multiplication of class names**: `EmailAlert`, `SmsAlert`, `EmailReminder`… or a design where "type of thing" and "way of doing it" both have several options. Say: *"These are two independent dimensions, so I'll compose them rather than multiply subclasses."*

## Common mistakes

- Applying Bridge when only one dimension varies.
- Leaking implementation details into the abstraction (for example, `if (channel instanceof SmsChannel)` inside `Alert`). Use capabilities on the implementor interface (`maxLength()`) instead.
- Splitting along the wrong axis (combinations that aren't really independent).

## Key takeaways

- Bridge separates an **abstraction** hierarchy from an **implementation** hierarchy and connects them by **composition**.
- It turns **multiplicative** class growth into **additive** growth.
- It's composition-over-inheritance across two dimensions.
- Use it only when both dimensions genuinely vary.

## Knowledge check

```quiz
? Shapes (circle, square, triangle) must be drawn by renderers (SVG, Canvas). How many classes does Bridge need compared with inheritance per combination?
+ About 3 + 2 classes instead of 3 × 2
- Exactly the same number
- 3 × 2 classes plus a bridge class
> Bridge makes growth additive across the two dimensions.

? What is the "bridge" in the Bridge pattern?
- A static utility method
+ The reference from the abstraction to the implementor interface
- An abstract factory
> The abstraction holds and delegates to an implementor, which is the bridge.

? Alert needs to know the channel's length limit. What keeps the design clean?
- An `instanceof SmsChannel` check inside Alert
+ A capability method such as `maxLength()` on the Channel interface
- A separate SmsAlert subclass
> Expose what the abstraction needs through the implementor interface.
```

## Exercise

A report system has report types (sales, inventory, payroll) and export formats (PDF, CSV, XLSX). The current design has `SalesPdfReport`, `SalesCsvReport`… Sketch a Bridge design: name the abstraction and implementor interfaces, their key methods, and show how a client creates "an inventory report as CSV".

````hint title="Hint"
What does each report type decide (which data, which columns)? What does each format decide (how to write rows)?
````

````solution title="Sample answer"
```java
interface ReportWriter {                 // implementor: HOW
    void header(List<String> columns);
    void row(List<String> values);
    byte[] finish();
}
class PdfWriter implements ReportWriter { ... }
class CsvWriter implements ReportWriter { ... }
class XlsxWriter implements ReportWriter { ... }

abstract class Report {                  // abstraction: WHAT
    protected final ReportWriter writer;
    protected Report(ReportWriter writer) { this.writer = writer; }
    final byte[] generate() {
        writer.header(columns());
        rows().forEach(writer::row);
        return writer.finish();
    }
    protected abstract List<String> columns();
    protected abstract List<List<String>> rows();
}
class SalesReport extends Report { ... }
class InventoryReport extends Report { ... }
class PayrollReport extends Report { ... }

byte[] csv = new InventoryReport(new CsvWriter(), warehouse).generate();
```

Six classes instead of nine, and a new format (JSON) is one class that works for every report.
````
