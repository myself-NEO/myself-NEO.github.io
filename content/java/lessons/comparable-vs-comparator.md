## Concept explanation

### What it is

Java separates **how to compare** objects from the objects themselves in two interfaces:

| | `Comparable<T>` | `Comparator<T>` |
|---|---|---|
| Package | `java.lang` | `java.util` |
| Method | `int compareTo(T other)` | `int compare(T a, T b)` |
| Implemented by | the class itself | a separate object (often a lambda) |
| Defines | the **natural ordering** — one per class | **any number** of external orderings |
| Used by | `Collections.sort(list)`, `TreeSet`, `TreeMap`, `PriorityQueue` with no comparator | `list.sort(cmp)`, `new TreeSet<>(cmp)`, `stream.sorted(cmp)` |

Both return **negative** if the first argument sorts before the second, **zero** if equal in ordering, **positive** if after.

`String`, the wrappers, `BigDecimal`, `LocalDate`, enums and records-you-write-`Comparable`-for have natural orderings.

### The contract

For a valid ordering (`sgn` = sign):

1. `sgn(compare(a, b)) == -sgn(compare(b, a))` (antisymmetric);
2. transitive: `a > b` and `b > c` ⇒ `a > c`;
3. `compare(a, b) == 0` ⇒ `a` and `b` compare the same against every `c`.

Strongly recommended: **consistent with equals** — `compare(a, b) == 0` exactly when `a.equals(b)`. Sorted collections (`TreeSet`, `TreeMap`) use the comparator **instead of `equals`**, so an ordering that says two different objects are "equal" makes one of them disappear from a `TreeSet`.

`BigDecimal` is the famous exception: `new BigDecimal("1.0").compareTo(new BigDecimal("1.00")) == 0` but `equals` is false, so a `HashSet` keeps both and a `TreeSet` keeps one.

### Building comparators (Java 8+)

```java
Comparator<Employee> byDeptThenSalaryDesc =
    Comparator.comparing(Employee::department)
              .thenComparing(Employee::salary, Comparator.reverseOrder())
              .thenComparing(Employee::name);

Comparator.comparingInt(Employee::age);          // no boxing
Comparator.nullsFirst(Comparator.naturalOrder()); // handle null keys
cmp.reversed();                                   // flip the whole comparator
```

### When to use which

- **`Comparable`** when the class has one obvious, intrinsic order that is consistent with `equals` (amounts, dates, version numbers, IDs).
- **`Comparator`** for every other order (by name, by price descending, by a field of a class you don't own), and for classes whose "natural" order would be arbitrary.

## Internal working

- **Sorting**: `List.sort`/`Collections.sort`/`Arrays.sort(Object[])` use **TimSort** — a stable, adaptive merge sort that is O(n log n) worst case and close to O(n) on partly sorted data. *Stable* means equal elements keep their relative order, which is what makes multi-pass sorting and `thenComparing` predictable. TimSort can detect a broken comparator and throw `IllegalArgumentException: Comparison method violates its general contract!`.
- **`TreeMap`/`TreeSet`** call `compare` on every insertion and lookup to walk the red-black tree: `compare == 0` means "same key", so the value is replaced (map) or the element rejected (set).
- **`PriorityQueue`** calls `compare` while sifting elements up and down its binary heap.
- **Comparator combinators** build small object graphs: `comparing(f)` returns a lambda `(a, b) -> f(a).compareTo(f(b))`; `thenComparing` wraps it. `comparingInt` avoids boxing by using `Integer.compare` on the extracted `int`s.
- **Never subtract** to compare (`return a.age - b.age;`): `int` subtraction overflows for large magnitudes and returns the wrong sign. Use `Integer.compare`.

## Visual representation

```text title="How thenComparing decides"
  people: (Ops, 70k, Ana) (Dev, 90k, Raj) (Dev, 90k, Bea) (Ops, 85k, Kim)

  comparing(department)            Dev Dev | Ops Ops          ties remain inside each group
     .thenComparing(salary, desc)  Dev: 90k 90k | Ops: 85k 70k
     .thenComparing(name)          Dev: Bea Raj | Ops: Kim Ana

  result: (Dev,90k,Bea) (Dev,90k,Raj) (Ops,85k,Kim) (Ops,70k,Ana)

  TreeSet with comparing(department) only:
     add Ana(Ops) -> stored          add Raj(Dev) -> stored
     add Bea(Dev) -> compare == 0 with Raj -> REJECTED (treated as duplicate!)
```

## Java code example

```java title="OrderingDemo.java" file="OrderingDemo.java"
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

public class OrderingDemo {
    public static void main(String[] args) {
        // Natural ordering via Comparable
        List<Version> versions = new ArrayList<>(List.of(new Version(1, 10, 0), new Version(1, 2, 3), new Version(0, 9, 9)));
        versions.sort(null);                                          // null = natural ordering
        System.out.println("natural: " + versions);

        // External orderings via Comparator
        List<Employee> staff = new ArrayList<>(List.of(
                new Employee("Ana", "Ops", 70_000), new Employee("Raj", "Dev", 90_000),
                new Employee("Bea", "Dev", 90_000), new Employee("Kim", "Ops", 85_000)));
        staff.sort(Comparator.comparing(Employee::department)
                .thenComparing(Employee::salary, Comparator.reverseOrder())
                .thenComparing(Employee::name));
        System.out.println("dept, salary desc, name: " + staff);
        staff.sort(Comparator.comparingInt(Employee::salary).reversed());
        System.out.println("salary desc (stable for ties): " + staff);

        // Comparator inconsistent with equals: the TreeSet silently drops an employee
        Set<Employee> byDept = new TreeSet<>(Comparator.comparing(Employee::department));
        byDept.addAll(staff);
        System.out.println("TreeSet by department only keeps " + byDept.size() + " of " + staff.size() + ": " + byDept);

        // BigDecimal: compareTo and equals disagree
        Set<BigDecimal> hashed = new HashSet<>(List.of(new BigDecimal("1.0"), new BigDecimal("1.00")));
        Set<BigDecimal> treed = new TreeSet<>(List.of(new BigDecimal("1.0"), new BigDecimal("1.00")));
        System.out.println("BigDecimal 1.0 vs 1.00 -> HashSet size " + hashed.size() + ", TreeSet size " + treed.size());

        // Subtraction comparator overflows
        Integer[] values = {Integer.MIN_VALUE, 1, 0};
        Comparator<Integer> broken = (a, b) -> a - b;
        Arrays.sort(values, broken);
        System.out.println("sorted with a - b:            " + Arrays.toString(values));
        Arrays.sort(values, Integer::compare);
        System.out.println("sorted with Integer.compare:  " + Arrays.toString(values));

        // nulls
        List<String> names = new ArrayList<>(Arrays.asList("delta", null, "alpha"));
        names.sort(Comparator.nullsLast(Comparator.naturalOrder()));
        System.out.println("nullsLast: " + names);
    }
}

record Version(int major, int minor, int patch) implements Comparable<Version> {
    private static final Comparator<Version> ORDER =
            Comparator.comparingInt(Version::major).thenComparingInt(Version::minor).thenComparingInt(Version::patch);

    @Override
    public int compareTo(Version other) {
        return ORDER.compare(this, other);                            // consistent with record equals
    }

    @Override
    public String toString() {
        return major + "." + minor + "." + patch;
    }
}

record Employee(String name, String department, int salary) {
    @Override
    public String toString() {
        return name + "(" + department + "," + salary / 1000 + "k)";
    }
}
```

## Output

```text title="Output" output="OrderingDemo.java"
natural: [0.9.9, 1.2.3, 1.10.0]
dept, salary desc, name: [Bea(Dev,90k), Raj(Dev,90k), Kim(Ops,85k), Ana(Ops,70k)]
salary desc (stable for ties): [Bea(Dev,90k), Raj(Dev,90k), Kim(Ops,85k), Ana(Ops,70k)]
TreeSet by department only keeps 2 of 4: [Bea(Dev,90k), Kim(Ops,85k)]
BigDecimal 1.0 vs 1.00 -> HashSet size 2, TreeSet size 1
sorted with a - b:            [0, 1, -2147483648]
sorted with Integer.compare:  [-2147483648, 0, 1]
nullsLast: [alpha, delta, null]
```

- Versions sort numerically (`1.2.3` before `1.10.0`), which plain string sorting would get wrong.
- Re-sorting by salary kept `Bea` before `Raj`: TimSort is **stable**, so equal salaries keep their previous order.
- The `TreeSet` treated employees in the same department as duplicates because its comparator only looked at the department.
- `BigDecimal` shows the "inconsistent with equals" problem in the JDK itself.
- `a - b` overflowed for `MIN_VALUE`, producing a wrong order.

## Real-world application

- **Sorting API results** by user-selected fields: build comparators dynamically (`Comparator.comparing(fieldExtractor)`, `.reversed()` for descending).
- **Leaderboards and schedulers** use `TreeMap`/`PriorityQueue` with comparators (highest score first, earliest deadline first).
- **Version and date ordering** in deployment tools and data pipelines (`Comparable` versions, `LocalDate` natural order).
- **Database parity**: when the database sorts with a collation, Java-side sorting needs a `Collator`-based comparator to agree.

## Common mistakes

- **Subtraction comparators** (`a - b`) that overflow.
- **Comparators inconsistent with equals** used in `TreeSet`/`TreeMap` (elements vanish, values overwritten).
- **Mutating fields used for ordering** while an object is in a `TreeSet`/`PriorityQueue` — the structure becomes corrupt.
- **Natural orderings for classes without an obvious one** (what's the natural order of a `User`?).
- **Sorting strings for humans with `compareTo`** — it's by UTF-16 code unit, so `"Zebra" < "apple"` and accents sort oddly. Use `String.CASE_INSENSITIVE_ORDER` or a `Collator`.
- **Boxing in hot comparators** (`comparing(Employee::salary)` on an `int` field) — use `comparingInt`.

## Interview questions

**Q1. What is the difference between `Comparable` and `Comparator`?**

````reveal title="Answer"
`Comparable` is implemented by the class itself (`compareTo`) and defines its single natural ordering, used by default by sorting and sorted collections. `Comparator` is a separate object (`compare(a, b)`) defining an external ordering; you can have many, use them for classes you don't control, and compose them with `comparing`, `thenComparing`, `reversed`, `nullsFirst`.
````

**Q2. What does "consistent with equals" mean and why does it matter?**

````reveal title="Answer"
An ordering is consistent with equals when `compare(a, b) == 0` exactly when `a.equals(b)`. `TreeSet`/`TreeMap` use the comparator, not `equals`, to detect duplicates, so an inconsistent ordering makes them drop elements (or overwrite map values) that `equals` considers different — and makes them disagree with `HashSet` about the same data. `BigDecimal("1.0")` vs `"1.00"` is the classic example.
````

**Q3. Why shouldn't you write `return this.age - other.age;`?**

````reveal title="Answer"
Integer subtraction can overflow (e.g. `Integer.MIN_VALUE - 1`), flipping the sign and violating the comparator contract; sorting may then misorder or throw "Comparison method violates its general contract". Use `Integer.compare(this.age, other.age)` or `Comparator.comparingInt`.
````

**Q4. Is `Collections.sort` stable? Why does it matter?**

````reveal title="Answer"
Yes — object sorting uses TimSort, which is stable: elements that compare equal keep their original relative order. That lets you sort by a secondary key first and then by the primary key, and makes results predictable for users (rows with equal values don't shuffle between requests).
````

## Hands-on exercise

Sort a list of `Product(String name, String category, BigDecimal price, double rating)`:

1. by category (A→Z), then price ascending, then rating descending;
2. find the three highest-rated products with a `PriorityQueue` of size 3 (a min-heap on rating);
3. put products in a `TreeSet` ordered by price **in a way that doesn't lose products with equal prices**.

````hint title="Hint"
For (3), break ties with a unique field: `comparing(Product::price).thenComparing(Product::name)`. For (2), keep a min-heap by rating; when its size exceeds 3, `poll()` removes the lowest.
````

````solution title="Solution"
```java title="ProductSorting.java" file="ProductSorting.java"
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.PriorityQueue;
import java.util.TreeSet;

public class ProductSorting {
    record Product(String name, String category, BigDecimal price, double rating) {
        @Override
        public String toString() {
            return name;
        }
    }

    public static void main(String[] args) {
        List<Product> products = new ArrayList<>(List.of(
                new Product("Mouse", "Accessories", new BigDecimal("25.00"), 4.4),
                new Product("Cable", "Accessories", new BigDecimal("9.99"), 4.1),
                new Product("Laptop", "Computers", new BigDecimal("999.00"), 4.7),
                new Product("Hub", "Accessories", new BigDecimal("25.00"), 4.6),
                new Product("Tablet", "Computers", new BigDecimal("499.00"), 4.2)));

        products.sort(Comparator.comparing(Product::category)
                .thenComparing(Product::price)
                .thenComparing(Product::rating, Comparator.reverseOrder()));
        System.out.println("sorted: " + products);

        PriorityQueue<Product> top = new PriorityQueue<>(Comparator.comparingDouble(Product::rating));
        for (Product p : products) {
            top.offer(p);
            if (top.size() > 3) {
                top.poll();                                    // evict the lowest rating
            }
        }
        List<Product> best = new ArrayList<>(top);
        best.sort(Comparator.comparingDouble(Product::rating).reversed());
        System.out.println("top 3 by rating: " + best);

        TreeSet<Product> byPrice = new TreeSet<>(Comparator.comparing(Product::price).thenComparing(Product::name));
        byPrice.addAll(products);
        System.out.println("by price, none lost (" + byPrice.size() + "): " + byPrice);
    }
}
```

```text title="Output" output="ProductSorting.java"
sorted: [Cable, Hub, Mouse, Tablet, Laptop]
top 3 by rating: [Laptop, Hub, Mouse]
by price, none lost (5): [Cable, Hub, Mouse, Tablet, Laptop]
```

`Hub` and `Mouse` both cost 25.00; the rating tie-breaker put `Hub` (4.6) first, and the name tie-breaker kept both in the `TreeSet`.
````

## Knowledge check

```quiz
? Which method does Comparable declare?
+ int compareTo(T other)
- int compare(T a, T b)
- boolean lessThan(T other)
> Comparator declares compare(a, b).

? A TreeSet uses a comparator that returns 0 for two different objects. What happens on the second add?
+ It's rejected as a duplicate
- Both are stored
- ClassCastException
> Sorted sets use the comparator, not equals.

? What's wrong with `(a, b) -> a - b` for Integers?
+ Subtraction can overflow and give the wrong sign
- It's slower than Integer.compare
- It doesn't compile
> Use Integer.compare or comparingInt.

? Is List.sort stable for objects?
+ Yes (TimSort)
- No (quicksort)
> Equal elements keep their relative order.

? How do you sort by name descending?
+ `Comparator.comparing(Person::name).reversed()`
- `Comparator.comparing(Person::name, -1)`
- `Collections.reverse(Comparator.comparing(...))`
> reversed() flips any comparator.
```

## Key takeaways

- **`Comparable`** = the class's one natural order (`compareTo`); **`Comparator`** = any external order (`compare`).
- Keep orderings **consistent with equals** for `TreeSet`/`TreeMap`, or elements disappear.
- Build comparators with **`comparing` / `thenComparing` / `reversed` / `nullsFirst`**; use `comparingInt` to avoid boxing.
- Never compare by **subtraction**.
- Object sorting is **stable TimSort**; sorted collections call `compare` on every operation.
