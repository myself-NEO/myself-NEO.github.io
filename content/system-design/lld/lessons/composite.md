## The problem

Many domains are **trees**: folders contain files and folders; a menu contains items and sub-menus; an org chart contains employees and teams; a rule group contains rules and rule groups. Clients want to treat a single item and a group **the same way**: "what's the size of this?", "render this", "does this match?" — without `if (node instanceof Folder)` everywhere.

**Composite** composes objects into tree structures and lets clients treat **individual objects (leaves)** and **compositions (containers)** uniformly through one interface.

## When to use it — and when not

**Use when:**

- The domain is genuinely **part-whole hierarchical**, with arbitrary depth.
- Operations apply recursively: size, cost, render, search, evaluate.
- Clients shouldn't care whether they hold a leaf or a group.

**Don't use when:**

- The hierarchy is fixed and shallow (a `Country` has `State`s, which have `City`s, each with different behaviour). Plain classes are clearer.
- Leaves and containers share almost no operations.

## Core idea

- **Component** — the common interface (`size()`, `name()`).
- **Leaf** — has no children and implements operations directly (`File`).
- **Composite** — holds child components and implements operations by **delegating to its children** and combining the results (`Directory.size()` = sum of children's sizes).

## UML

```uml title="Composite"
interface FileSystemNode
  + name(): String
  + size(): long
class File
  - bytes: long
class Directory
  - children: Map<String, FileSystemNode>
  + add(node: FileSystemNode): void
  + remove(name: String): void
File ..|> FileSystemNode
Directory ..|> FileSystemNode
Directory o-- "0..*" FileSystemNode : children
```

## Java implementation

```java title="Files and directories, uniformly" file="CompositeDemo.java"
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

public class CompositeDemo {
    public static void main(String[] args) {
        Directory root = new Directory("root");
        Directory docs = new Directory("docs");
        Directory photos = new Directory("photos");
        root.add(docs);
        root.add(photos);
        root.add(new File("readme.txt", 1_200));
        docs.add(new File("cv.pdf", 85_000));
        docs.add(new File("notes.md", 4_300));
        photos.add(new File("goa.jpg", 2_400_000));

        System.out.println("Total size: " + root.size());           // recursion handled by the structure
        System.out.println("docs size:  " + docs.size());
        root.print("");
        System.out.println("PDFs anywhere: " + root.find(n -> n.name().endsWith(".pdf")));   // no type checks needed
    }
}

/** Component: what clients see for every node. */
interface FileSystemNode {
    String name();
    long size();
    void print(String indent);
    void collect(java.util.function.Predicate<FileSystemNode> test, List<String> out, String path);

    default List<String> find(java.util.function.Predicate<FileSystemNode> test) {
        List<String> out = new ArrayList<>();
        collect(test, out, "");
        return out;
    }
}

/** Leaf. */
record File(String name, long size) implements FileSystemNode {
    File {
        if (name.contains("/")) throw new IllegalArgumentException("invalid name " + name);
        if (size < 0) throw new IllegalArgumentException("negative size");
    }
    public void print(String indent) { System.out.println(indent + name + " (" + size + " B)"); }
    public void collect(java.util.function.Predicate<FileSystemNode> test, List<String> out, String path) {
        if (test.test(this)) out.add(path + "/" + name);
    }
}

/** Composite. */
final class Directory implements FileSystemNode {
    private final String name;
    private final Map<String, FileSystemNode> children = new TreeMap<>();   // sorted, unique names

    Directory(String name) { this.name = name; }

    void add(FileSystemNode node) {
        if (children.putIfAbsent(node.name(), node) != null) {
            throw new IllegalStateException(node.name() + " already exists in " + name);
        }
    }

    void remove(String childName) { children.remove(childName); }

    public String name() { return name; }

    /** Delegates to children; works at any depth. */
    public long size() { return children.values().stream().mapToLong(FileSystemNode::size).sum(); }

    public void print(String indent) {
        System.out.println(indent + name + "/");
        children.values().forEach(c -> c.print(indent + "  "));
    }

    public void collect(java.util.function.Predicate<FileSystemNode> test, List<String> out, String path) {
        String here = path + "/" + name;
        if (test.test(this)) out.add(here);
        children.values().forEach(c -> c.collect(test, out, here));
    }
}
```

Notice that `root.size()` doesn't know or care how deep the tree is. Adding a new node type (say, a `SymbolicLink` whose size is 0) needs no changes to `Directory`.

## Design decision: where do child-management methods go?

- **Transparent design**: `add`/`remove` on the Component interface. Clients treat everything uniformly, but leaves must throw on `add` — an [LSP](lesson:liskov-substitution) smell.
- **Safe design** (used above): `add`/`remove` only on `Directory`. Clients need to know they hold a directory to modify it, but no leaf ever lies about its capabilities.

Prefer the **safe** design in Java.

## Realistic use case

- **File systems** — the canonical example ([File System](problem:file-system)).
- **Rule engines** — `AndRule` and `OrRule` composites containing `Rule`s; `evaluate(facts)` recurses ([Rule Engine](problem:rule-engine)).
- **Pricing bundles** — a bundle's price is the sum of its items, which may themselves be bundles.
- **UI trees** — panels containing widgets and panels.
- **Org charts** — total salary cost of a department.

## Trade-offs and alternatives

- **Pros:** uniform client code; recursion handled by the structure; easy to add node types.
- **Cons:** can make the design *too* general (hard to restrict which children a composite allows); deep trees risk stack overflow with naive recursion; cycles must be prevented.
- **Related patterns:** [Iterator](lesson:iterator) to traverse the tree; Visitor (not covered in depth here) to add operations without changing node classes; [Specification](lesson:specification), which is often built as a composite of predicates.

## Recognising it in an interview

"Folders and files", "nested categories", "a bundle can contain products or other bundles", "conditions combined with AND/OR". Any time a container can hold things of **its own kind**, think Composite.

## Common mistakes

- `instanceof` checks in clients — the point is to avoid them.
- Leaves throwing on child operations (the transparent design's LSP problem).
- Allowing **cycles** (a folder inside itself). Validate when moving nodes.
- Recomputing expensive aggregates repeatedly in huge trees. Cache with invalidation if needed.

## Key takeaways

- Composite lets clients treat **leaves and groups uniformly** through one interface.
- Composites implement operations by **delegating to children** and combining results.
- Prefer the **safe** design: child management only on composites.
- Use it for genuine part-whole trees: file systems, rule groups, bundles, menus.

## Knowledge check

```quiz
? How does Directory.size() work in the Composite pattern?
+ It sums size() of its children, which may themselves be directories
- It queries the operating system
- It throws for nested directories
> Composites delegate to children and combine the results recursively.

? Why prefer putting add()/remove() only on the composite (the "safe" design)?
- It's faster
+ Leaves won't have to throw UnsupportedOperationException, which would violate LSP
- Java doesn't allow add() on interfaces
> Safe design keeps every type honest about its capabilities.

? Which domain is the best fit for Composite?
- A fixed three-level Country → State → City model with different behaviour at each level
+ Discount rules combined with nested AND/OR groups of arbitrary depth
- A single list of products
> Arbitrary-depth part-whole structures with uniform operations are the Composite sweet spot.
```

## Exercise

Model an **org chart** where an `Employee` has a salary and a `Team` has a name and members, which are employees or other teams. Implement `totalCost()` and `headcount()` uniformly, and a `largestTeam()` query on any team that returns the name of the team (at any depth) with the most direct members.

````hint title="Hint"
`headcount()` of a team is the sum of its members' headcounts; an employee's is 1. For `largestTeam`, recurse through member teams.
````

````solution title="Reference solution"
```java file="OrgChartDemo.java"
import java.util.ArrayList;
import java.util.List;

public class OrgChartDemo {
    public static void main(String[] args) {
        Team platform = new Team("Platform");
        platform.add(new Employee("Ravi", 200));
        platform.add(new Employee("Meera", 180));
        platform.add(new Employee("Kabir", 150));
        Team eng = new Team("Engineering");
        eng.add(new Employee("Asha", 300));
        eng.add(platform);
        System.out.println(eng.headcount() + " people, cost " + eng.totalCost() + ", largest team: " + eng.largestTeam().name());
    }
}

interface OrgUnit {
    long totalCost();
    int headcount();
}

record Employee(String name, long salary) implements OrgUnit {
    public long totalCost() { return salary; }
    public int headcount() { return 1; }
}

final class Team implements OrgUnit {
    private final String name;
    private final List<OrgUnit> members = new ArrayList<>();

    Team(String name) { this.name = name; }
    void add(OrgUnit unit) {
        if (unit == this) throw new IllegalArgumentException("a team cannot contain itself");
        members.add(unit);
    }
    String name() { return name; }

    public long totalCost() { return members.stream().mapToLong(OrgUnit::totalCost).sum(); }
    public int headcount() { return members.stream().mapToInt(OrgUnit::headcount).sum(); }

    Team largestTeam() {
        Team best = this;
        for (OrgUnit m : members) {
            if (m instanceof Team t) {
                Team candidate = t.largestTeam();
                if (candidate.members.size() > best.members.size()) best = candidate;
            }
        }
        return best;
    }
}
```

The `instanceof` check inside `largestTeam` is acceptable: it's a query specific to teams, implemented *inside* the composite rather than in client code.
````
