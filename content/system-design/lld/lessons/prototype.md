## The problem

Sometimes building an object from scratch is **expensive or complex** — it's assembled from configuration, involves many steps, or comes from a template a user designed — and you need **many similar copies** with small variations. Examples: document templates, game units spawned from a configured archetype, pre-configured rule sets, a starting chess position.

**Prototype** creates new objects by **copying an existing, fully configured instance** (the prototype) and then adjusting the copy.

## When to use it — and when not

**Use when:**

- Construction is costly or long, and copies with minor variations are common.
- The set of "kinds" is defined **at runtime** (users create templates) rather than as classes.
- You need snapshots of an object's state, such as for undo or what-if simulations.

**Don't use when:**

- Objects are cheap to construct: just construct them.
- Objects are immutable: share the same instance, and use withers for variations.

## Core idea

Each prototype knows how to **copy itself** — usually a `copy()` method or a copy constructor. A **registry** can map names to prototypes ("the `invoice-template`"). Clients ask the registry for a copy rather than calling constructors.

The crucial question is **shallow vs deep copy**:

- **Shallow copy:** copies field values. Mutable referenced objects (lists, nested objects) are **shared** between original and copy.
- **Deep copy:** recursively copies mutable referenced objects, so the copy is fully independent.

## UML

```uml title="Prototype with a registry"
interface Prototype
  + copy(): Prototype
class DocumentTemplate
  - title: String
  - sections: List<Section>
  + copy(): DocumentTemplate
class TemplateRegistry
  - prototypes: Map<String, DocumentTemplate>
  + register(name: String, t: DocumentTemplate): void
  + create(name: String): DocumentTemplate
DocumentTemplate ..|> Prototype
TemplateRegistry o-- DocumentTemplate : prototypes
```

## Java implementation

Avoid `Object.clone()` and `Cloneable` — they're awkward and error-prone (Effective Java item 13). Use **copy constructors** or explicit `copy()` methods.

```java title="Deep-copying prototypes from a registry" file="PrototypeDemo.java"
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class PrototypeDemo {
    public static void main(String[] args) {
        TemplateRegistry registry = new TemplateRegistry();
        DocumentTemplate invoice = new DocumentTemplate("Invoice");
        invoice.addSection(new Section("Header", "ACME Corp, Bengaluru"));
        invoice.addSection(new Section("Terms", "Pay within 30 days"));
        registry.register("invoice", invoice);

        DocumentTemplate forAsha = registry.create("invoice");
        forAsha.section("Header").setText("ACME Corp - Invoice for Asha");
        forAsha.addSection(new Section("Items", "3 x Keyboard"));

        System.out.println("Prototype: " + registry.create("invoice"));
        System.out.println("Copy:      " + forAsha);
    }
}

class Section {
    private final String name;
    private String text;

    Section(String name, String text) { this.name = name; this.text = text; }
    Section(Section other) { this(other.name, other.text); }   // copy constructor

    String name() { return name; }
    void setText(String text) { this.text = text; }
    @Override public String toString() { return name + "=" + text; }
}

class DocumentTemplate {
    private final String title;
    private final List<Section> sections = new ArrayList<>();

    DocumentTemplate(String title) { this.title = title; }

    /** Deep copy: new list AND new Section objects. A shallow copy would share Sections. */
    DocumentTemplate copy() {
        DocumentTemplate clone = new DocumentTemplate(title);
        for (Section s : sections) clone.sections.add(new Section(s));
        return clone;
    }

    void addSection(Section s) { sections.add(s); }

    Section section(String name) {
        return sections.stream().filter(s -> s.name().equals(name)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("no section " + name));
    }

    @Override public String toString() { return title + " " + sections; }
}

class TemplateRegistry {
    private final Map<String, DocumentTemplate> prototypes = new HashMap<>();

    void register(String name, DocumentTemplate prototype) { prototypes.put(name, prototype.copy()); }

    DocumentTemplate create(String name) {
        DocumentTemplate prototype = prototypes.get(name);
        if (prototype == null) throw new IllegalArgumentException("no template " + name);
        return prototype.copy();   // callers never get the prototype itself
    }
}
```

Try changing `copy()` to reuse the same `Section` objects (`clone.sections.addAll(sections)`): editing Asha's header would then **corrupt the prototype** for everyone. That's the shallow-copy bug in action.

## Realistic use case

In a [Rule Engine](problem:rule-engine), administrators build a "fraud check" rule set in a UI, which is expensive to assemble and validate. Each merchant gets a **copy** of the standard rule set that they can tweak (lower thresholds, extra rules) without affecting the template or other merchants. In games, spawning 500 "orc" units from one configured archetype is a classic prototype use.

## Trade-offs and alternatives

- **Pros:** fast creation of pre-configured objects; new "kinds" defined at runtime without new classes; easy snapshots.
- **Cons:** deep-copy logic must be maintained as fields change; cyclic object graphs are tricky; it's easy to accidentally copy shallowly.
- **Alternatives:**
  - **Immutable objects + withers** — no copying needed; variations are new objects that share unchanged parts safely.
  - **[Builder](lesson:builder)** pre-filled from a template (`Notification.builderFrom(template)`).
  - **Factory methods** for a fixed set of configurations.

## Recognising it in an interview

- "Users can create templates and instantiate them many times."
- "Copy the configuration of X and modify it."
- Undo or simulation: "try a move on a *copy* of the board" (chess AI, what-if analysis).

## Common mistakes

- **Shallow copies of mutable state** (shared lists, shared nested objects).
- Using `Cloneable`/`clone()` with its pitfalls (it bypasses constructors and needs casts and exception handling).
- Returning the **prototype itself** from the registry instead of a copy.
- Copying when immutability would make copying unnecessary.

## Key takeaways

- Prototype creates objects by **copying a configured instance**.
- Be explicit about **deep vs shallow** copies; deep-copy mutable parts.
- Prefer **copy constructors / `copy()` methods** over `clone()`.
- **Immutability** often removes the need for Prototype altogether.

## Knowledge check

```quiz
? A copy() method creates a new list but adds the same Section objects to it. Editing a section in the copy changes the original. Why?
+ It's a shallow copy: the Section objects are shared between original and copy
- Lists can't be copied in Java
- Sections are immutable
> Copying the list isn't enough; mutable elements must be copied too.

? When is Prototype least useful?
- Users design templates at runtime and instantiate them often
+ Objects are immutable and cheap to construct
- A chess AI explores moves on board copies
> Immutable, cheap objects can just be shared or constructed.

? Why does the registry return `prototype.copy()` rather than the prototype?
- To save memory
+ So callers can't modify the shared template
- Because maps can't return objects
> Handing out the prototype would let one caller corrupt it for everyone else.
```

## Exercise

A chess engine evaluates candidate moves by applying them to a **copy** of the board. `Board` holds a `Piece[8][8]` array, and pieces are immutable records. Implement `Board.copy()` correctly, and explain why you don't need to copy the pieces themselves.

````hint title="Hint"
Arrays are mutable — and a 2D array is an array of arrays. What does `board.clone()` copy?
````

````solution title="Reference solution"
```java file="BoardCopyDemo.java"
public class BoardCopyDemo {
    public static void main(String[] args) {
        Board original = new Board();
        original.place(0, 0, new Piece('R', "WHITE"));
        Board trial = original.copy();
        trial.move(0, 0, 3, 0);
        System.out.println("Original a1: " + original.at(0, 0) + ", trial a1: " + trial.at(0, 0));
    }
}

record Piece(char symbol, String colour) {}   // immutable: safe to share between boards

class Board {
    private final Piece[][] squares = new Piece[8][8];

    Board copy() {
        Board b = new Board();
        for (int r = 0; r < 8; r++) {
            b.squares[r] = squares[r].clone();   // copy each row; pieces are shared (immutable)
        }
        return b;
    }

    void place(int r, int c, Piece p) { squares[r][c] = p; }
    Piece at(int r, int c) { return squares[r][c]; }

    void move(int fr, int fc, int tr, int tc) {
        squares[tr][tc] = squares[fr][fc];
        squares[fr][fc] = null;
    }
}
```

`squares.clone()` alone would copy only the outer array and still share the row arrays, so moves on the trial board would corrupt the original. Each row must be copied. Pieces don't need copying because they're immutable, so sharing them is safe.
````
