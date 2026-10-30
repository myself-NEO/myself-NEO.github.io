## Concept explanation

An **array** is a fixed-length, ordered container of elements of one type, accessed by a zero-based index.

```java
int[] scores = new int[5];               // five ints, all 0
String[] names = {"Ana", "Ben", "Chen"}; // array initialiser
int[] copy = new int[] {1, 2, 3};        // anonymous array (needed outside declarations)
scores[0] = 90;                          // write
int first = names.length;                // length is a field, not a method
```

Key properties:

- **Fixed length** once created. To "grow" an array you allocate a bigger one and copy (which is what `ArrayList` does internally).
- **Elements get default values**: `0`, `false`, `'\u0000'` or `null`.
- **Bounds are checked**: an index outside `0 .. length-1` throws `ArrayIndexOutOfBoundsException`.
- **Arrays are objects**: the variable holds a reference; arrays can be `null`, are passed by reference value, and `==` compares identity.

### Multidimensional and jagged arrays

Java has no true 2D arrays: an `int[][]` is an **array of references to `int[]` rows**. Rows can have different lengths ("jagged"):

```java
int[][] grid = new int[3][4];       // 3 rows of 4
int[][] triangle = new int[3][];    // rows allocated separately
triangle[0] = new int[1];
triangle[1] = new int[2];
triangle[2] = new int[3];
```

### The `java.util.Arrays` toolbox

| Method | Purpose |
|---|---|
| `Arrays.toString(a)` / `deepToString(a)` | readable output (printing an array directly shows `[I@1b6d3586`) |
| `Arrays.sort(a)` | sort in place; `Arrays.sort(a, from, to)`; with a `Comparator` for objects |
| `Arrays.binarySearch(a, key)` | O(log n) search in a **sorted** array |
| `Arrays.fill(a, v)` | set every element |
| `Arrays.copyOf(a, newLength)` / `copyOfRange` | copy, truncating or padding with defaults |
| `Arrays.equals(a, b)` / `deepEquals` | element-wise comparison (`a.equals(b)` is identity!) |
| `Arrays.asList(a)` | fixed-size `List` **view** backed by the array |
| `Arrays.stream(a)` | stream the elements |

`System.arraycopy(src, srcPos, dest, destPos, length)` is the low-level bulk copy that most of these use.

### Array covariance

If `Integer` is a subtype of `Number`, then `Integer[]` is a subtype of `Number[]`. This lets you write methods that accept `Object[]`, but it is unsound: storing a `Double` into a `Number[]` that is really an `Integer[]` compiles and then throws `ArrayStoreException` at run time. Generics were designed to be **invariant** precisely to avoid this (see [bounded types and wildcards](lesson:bounded-types-and-wildcards)).

## Internal working

- An array object has a header (mark word, class pointer) plus a **length** field, followed by the elements stored **contiguously**. Element *i* lives at `base + i * elementSize`, which is why indexing is O(1) and why sequential scans are fast (CPU caches prefetch neighbouring memory).
- Bytecodes: `newarray` (primitives), `anewarray` (references), `multianewarray`, `iaload`/`iastore` (int element access), `aaload`/`aastore`, `arraylength`. Every load and store includes a bounds check; the JIT removes checks it can prove are redundant (for example in a `for (i = 0; i < a.length; i++)` loop).
- `aastore` also performs the **covariance check**: it verifies that the stored object is compatible with the array's actual element type, throwing `ArrayStoreException` otherwise.
- In an `Object[]` or `String[]`, the elements are **references**; the objects live elsewhere on the heap. An `int[]` stores the values themselves — much more compact and cache-friendly than `Integer[]` or `List<Integer>`.
- `Arrays.sort` uses **dual-pivot quicksort** for primitives (not stable, O(n log n) expected) and **TimSort** for objects (stable, O(n log n), very fast on partially sorted data).

## Visual representation

```text title="int[][] grid = new int[3][4] is an array of row references"
  grid ----> +--------+
             | length=3|
             | [0] ---------> +---+---+---+---+   int[4]
             | [1] ---------> +---+---+---+---+   int[4]
             | [2] ---------> +---+---+---+---+   int[4]
             +--------+

  Jagged: triangle[0] -> [ . ]
          triangle[1] -> [ . . ]
          triangle[2] -> [ . . . ]
```

## Java code example

```java title="ArraysDemo.java" file="ArraysDemo.java"
import java.util.Arrays;
import java.util.List;

public class ArraysDemo {
    public static void main(String[] args) {
        int[] data = {42, 7, 19, 3, 25};
        System.out.println("printed directly looks like [I@...: " + data.toString().startsWith("[I@"));
        System.out.println("toString: " + Arrays.toString(data) + ", length " + data.length);

        int[] sorted = Arrays.copyOf(data, data.length);
        Arrays.sort(sorted);
        System.out.println("sorted copy: " + Arrays.toString(sorted) + ", original: " + Arrays.toString(data));
        System.out.println("binarySearch(19) = " + Arrays.binarySearch(sorted, 19));

        int[] grown = Arrays.copyOf(data, 7);          // padded with zeros
        System.out.println("grown: " + Arrays.toString(grown));

        int[] same = {42, 7, 19, 3, 25};
        System.out.println("data.equals(same) = " + data.equals(same) + ", Arrays.equals = " + Arrays.equals(data, same));

        // 2D and jagged arrays
        int[][] grid = new int[3][4];
        grid[1][2] = 5;
        System.out.println("grid: " + Arrays.deepToString(grid));
        int[][] triangle = new int[4][];
        for (int r = 0; r < triangle.length; r++) {
            triangle[r] = new int[r + 1];
            triangle[r][0] = 1;
            triangle[r][r] = 1;
            for (int c = 1; c < r; c++) {
                triangle[r][c] = triangle[r - 1][c - 1] + triangle[r - 1][c];
            }
        }
        System.out.println("Pascal: " + Arrays.deepToString(triangle));

        // asList is a fixed-size view backed by the array
        String[] letters = {"a", "b", "c"};
        List<String> view = Arrays.asList(letters);
        view.set(0, "z");
        System.out.println("array after view.set: " + Arrays.toString(letters));
        try {
            view.add("d");
        } catch (UnsupportedOperationException e) {
            System.out.println("asList cannot grow: UnsupportedOperationException");
        }

        // Covariance: compiles, fails at run time
        Object[] objects = new String[2];
        try {
            objects[0] = 1;
        } catch (ArrayStoreException e) {
            System.out.println("ArrayStoreException: " + e.getMessage());
        }

        // Bounds check
        try {
            System.out.println(data[data.length]);
        } catch (ArrayIndexOutOfBoundsException e) {
            System.out.println("AIOOBE: " + e.getMessage());
        }
    }
}
```

## Output

```text title="Output" output="ArraysDemo.java"
printed directly looks like [I@...: true
toString: [42, 7, 19, 3, 25], length 5
sorted copy: [3, 7, 19, 25, 42], original: [42, 7, 19, 3, 25]
binarySearch(19) = 2
grown: [42, 7, 19, 3, 25, 0, 0]
data.equals(same) = false, Arrays.equals = true
grid: [[0, 0, 0, 0], [0, 0, 5, 0], [0, 0, 0, 0]]
Pascal: [[1], [1, 1], [1, 2, 1], [1, 3, 3, 1]]
array after view.set: [z, b, c]
asList cannot grow: UnsupportedOperationException
ArrayStoreException: java.lang.Integer
AIOOBE: Index 5 out of bounds for length 5
```

- `data.toString()` is `Object.toString()` — the type code `[I` plus a hash — which is why you always use `Arrays.toString`.
- Arrays don't override `equals`, so `data.equals(same)` is identity; `Arrays.equals` compares elements.
- `Arrays.asList` writes through to the array but can't change its size.
- Assigning an `Integer` into what is really a `String[]` compiled fine and failed at run time.

## Real-world application

- **Performance-critical code** (parsers, codecs, matrix maths, ring buffers, game engines) uses primitive arrays for contiguous memory and no boxing.
- **Collections are built on arrays**: `ArrayList`, `ArrayDeque`, `HashMap`'s bucket table and `PriorityQueue`'s heap are all arrays underneath (see [ArrayList internals](lesson:arraylist-internals)).
- **Byte arrays** carry network payloads, file contents and cryptographic keys (`byte[]` is the currency of I/O).
- **Grids** in coding interviews (islands, paths, dynamic programming tables) are `int[][]` or `char[][]`.

## Common mistakes

- **Printing an array** with `println(array)` instead of `Arrays.toString`.
- **Comparing arrays** with `==` or `equals` instead of `Arrays.equals`/`deepEquals`.
- **Off-by-one**: `for (i = 0; i <= a.length; i++)`.
- **Shallow copies of 2D arrays**: `grid.clone()` copies the row references, so both "copies" share rows. Copy each row.
- **Treating `Arrays.asList` as a normal list**: no `add`/`remove`; changes write through. Use `new ArrayList<>(Arrays.asList(a))` or `List.of` for an immutable copy.
- **`Arrays.asList(intArray)`** gives a `List<int[]>` with one element, not a list of numbers.
- **Binary search on an unsorted array**: undefined result.

## Interview questions

**Q1. Why is `array.length` a field but `string.length()` a method?**

````reveal title="Answer"
An array's length is fixed at creation and stored in the array object's header, and the JVM exposes it through the `arraylength` instruction — it behaves like a final field. `String` is an ordinary class that encapsulates its storage (a `byte[]` plus a coder since Java 9), so its length is computed by a method.
````

**Q2. What is array covariance and why is it considered a design flaw?**

````reveal title="Answer"
`S[]` is a subtype of `T[]` whenever `S` is a subtype of `T`. It lets a `String[]` be passed where an `Object[]` is expected, but makes the type system unsound for writes: the compiler accepts storing any object, so the JVM must check every reference store at run time and throw `ArrayStoreException`. Generics are invariant (`List<String>` is not a `List<Object>`) so errors are caught at compile time instead.
````

**Q3. How does `Arrays.sort` sort primitives versus objects, and why the difference?**

````reveal title="Answer"
Primitives use dual-pivot quicksort: fast in practice and in-place, and stability doesn't matter because equal primitives are indistinguishable. Objects use TimSort, a stable merge sort/insertion sort hybrid, because stability matters when sorting records by one key after another, and it's adaptive to already-sorted runs.
````

**Q4. How do you copy a 2D array correctly?**

````reveal title="Answer"
Copy each row: `int[][] copy = new int[src.length][]; for (int i = 0; i < src.length; i++) copy[i] = src[i].clone();` (or `Arrays.copyOf`). `src.clone()` alone is a shallow copy that shares the row arrays.
````

## Hands-on exercise

Write `MatrixTools.java` with:

1. `static int[][] transpose(int[][] m)` for rectangular matrices,
2. `static void rotateInPlace(int[] a, int k)` that rotates right by `k` positions in O(n) time and O(1) extra space,
3. a `main` that prints both results with `Arrays.deepToString` / `Arrays.toString`.

````hint title="Hint 1"
Transpose: the result has `m[0].length` rows and `m.length` columns; `t[c][r] = m[r][c]`.
````

````hint title="Hint 2"
Rotate by reversing: reverse the whole array, then reverse the first `k` elements and the remaining `n - k`. Normalise `k` with `k % n` first.
````

````solution title="Solution"
```java title="MatrixTools.java" file="MatrixTools.java"
import java.util.Arrays;

public class MatrixTools {
    static int[][] transpose(int[][] m) {
        int rows = m.length;
        int cols = m[0].length;
        int[][] t = new int[cols][rows];
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                t[c][r] = m[r][c];
            }
        }
        return t;
    }

    static void rotateInPlace(int[] a, int k) {
        int n = a.length;
        if (n == 0) {
            return;
        }
        k = Math.floorMod(k, n);
        reverse(a, 0, n - 1);
        reverse(a, 0, k - 1);
        reverse(a, k, n - 1);
    }

    private static void reverse(int[] a, int from, int to) {
        while (from < to) {
            int tmp = a[from];
            a[from++] = a[to];
            a[to--] = tmp;
        }
    }

    public static void main(String[] args) {
        int[][] m = {{1, 2, 3}, {4, 5, 6}};
        System.out.println(Arrays.deepToString(transpose(m)));
        int[] a = {1, 2, 3, 4, 5, 6, 7};
        rotateInPlace(a, 3);
        System.out.println(Arrays.toString(a));
        rotateInPlace(a, -3);
        System.out.println(Arrays.toString(a));
    }
}
```

```text title="Output" output="MatrixTools.java"
[[1, 4], [2, 5], [3, 6]]
[5, 6, 7, 1, 2, 3, 4]
[1, 2, 3, 4, 5, 6, 7]
```

Rotation by reversal touches each element twice: O(n) time, O(1) space. `floorMod` makes negative `k` rotate left.
````

## Knowledge check

```quiz
? What does `new boolean[3]` contain?
+ [false, false, false]
- [null, null, null]
- Uninitialised garbage
> Array elements always get default values.

? `int[] a = {1, 2}; int[] b = {1, 2};` What is `a.equals(b)`?
- true
+ false
- Compile error
> Arrays inherit Object.equals (identity); use Arrays.equals.

? `Object[] arr = new String[1]; arr[0] = 42;` — what happens?
- Compile error
+ ArrayStoreException at run time
- arr[0] becomes "42"
> Array covariance defers the type check to run time.

? What does `int[][] copy = grid.clone();` produce?
- A deep copy
+ A new outer array that shares the same row arrays
- Compile error
> clone on arrays is shallow.

? Which sort does `Arrays.sort(String[])` use?
- Dual-pivot quicksort
+ TimSort (stable)
- Heap sort
> Object arrays need a stable sort.
```

## Key takeaways

- Arrays are **fixed-length objects** with contiguous elements, O(1) indexing, default values and **bounds checks**.
- A 2D array is an **array of row arrays**; rows may be jagged, and `clone` is shallow.
- Use `java.util.Arrays` for printing, sorting, searching, copying and comparing.
- Arrays are **covariant** (`ArrayStoreException` risk); generics are invariant for safety.
- Primitive arrays are the most memory- and cache-efficient structure in Java.
