## Concept explanation

### `java.io.File` vs NIO.2

Java has two file APIs:

| | `java.io.File` (Java 1.0) | **NIO.2: `Path` + `Files`** (Java 7) |
|---|---|---|
| Errors | many methods return `false` or `null` with **no reason** (`delete()`, `mkdir()`, `listFiles()`) | throw **specific exceptions** (`NoSuchFileException`, `AccessDeniedException`, `DirectoryNotEmptyException`) |
| Symbolic links | barely supported | first-class (`LinkOption.NOFOLLOW_LINKS`, `readSymbolicLink`) |
| Attributes | size, timestamps, little else | full attribute views: POSIX permissions, owners, DOS flags, creation time |
| Large directories | `listFiles()` loads everything | lazy streams: `Files.list`, `Files.walk`, `Files.find` |
| Copy, move, atomic operations | none (manual stream copying) | `Files.copy`, `Files.move(ATOMIC_MOVE)`, `REPLACE_EXISTING` |
| File systems | the default one only | pluggable: zip/jar file systems, in-memory (Jimfs) for tests |

Use **`Path` and `Files`** in new code. Convert at boundaries with `file.toPath()` and `path.toFile()`.

### Path: a location, not a file

A `Path` is just a sequence of name elements. Creating one doesn't touch the disk, and the file may not exist.

| Operation | Example | Result |
|---|---|---|
| create | `Path.of("reports", "2024", "q1.csv")` | `reports/2024/q1.csv` (`\` on Windows) |
| parts | `getFileName()`, `getParent()`, `getNameCount()`, `getName(i)` | `q1.csv`, `reports/2024`, 3 |
| combine | `dir.resolve("q2.csv")`, `file.resolveSibling("q2.csv")` | child path, sibling path |
| clean | `Path.of("a/./b/../c").normalize()` | `a/c` |
| relate | `base.relativize(other)` | the relative path from `base` to `other` |
| absolute / real | `toAbsolutePath()`, `toRealPath()` | `toRealPath` resolves symlinks and requires existence |

### Files: the operations

| Task | Method |
|---|---|
| small text files | `Files.readString(p)`, `Files.writeString(p, text, options…)` (Java 11; UTF-8 by default) |
| all lines | `Files.readAllLines(p)` (eager), `Files.lines(p)` (**lazy stream: close it**) |
| bytes | `Files.readAllBytes`, `Files.write(p, bytes)` |
| big or streamed data | `Files.newBufferedReader/Writer(p, UTF_8)`, `Files.newInputStream/OutputStream` |
| directories | `createDirectory`, `createDirectories` (no error if it exists), `list`, `walk`, `find`, `newDirectoryStream(p, "*.csv")` |
| copy, move, delete | `copy`, `move(…, REPLACE_EXISTING, ATOMIC_MOVE)`, `delete`, `deleteIfExists` |
| inspect | `exists`, `isDirectory`, `isRegularFile`, `size`, `readAttributes(p, BasicFileAttributes.class)`, `mismatch` (Java 12) |
| temporary files | `createTempFile`, `createTempDirectory` (deleting them is your job) |

**Open options** for writes:
- default `CREATE, TRUNCATE_EXISTING, WRITE`;
- `APPEND`;
- `CREATE_NEW`, which fails if the file exists: a simple file-based lock or idempotency check;
- `SYNC`/`DSYNC` for durability.

**Atomic writes**: write to a temporary file in the same directory, then `Files.move(tmp, target, ATOMIC_MOVE, REPLACE_EXISTING)`. Readers see either the old file or the complete new one, never half a file.

## Internal working

- **The `FileSystem` provider model**: `Path.of(...)` uses `FileSystems.getDefault()`, whose provider (`UnixFileSystemProvider`, `WindowsFileSystemProvider`) implements every `Files` operation with native system calls. Zip and jar archives have their own provider (`FileSystems.newFileSystem(zipPath)`), so the same `Files.walk`/`copy` code works inside archives.
- **Separators**: a `Path` stores names; `toString()` joins them with the platform separator (`/` or `\`). Always build paths with `Path.of(a, b)`/`resolve` rather than string concatenation.
- **`Files.lines` and `Files.walk` hold an open file handle or directory stream** until the stream is closed. They're `AutoCloseable` streams, and forgetting try-with-resources leaks file descriptors (`Too many open files`).
- **`readString`/`readAllLines` load the whole file into memory.** Fine for configuration; wrong for multi-gigabyte logs (use `lines` or a `BufferedReader`). Malformed input for the charset throws `MalformedInputException`, and since Java 18 the default charset is UTF-8 everywhere.
- **`Files.walk` order** depends on the file system (directory entry order isn't sorted or guaranteed), so sort the results if order matters. `walk` follows symlinks only with `FileVisitOption.FOLLOW_LINKS`, with cycle detection. `Files.walkFileTree` with a `FileVisitor` gives fine control: skip subtrees, handle errors per file.
- **`ATOMIC_MOVE`** maps to `rename(2)`, which is atomic only within one file system. Across file systems it throws `AtomicMoveNotSupportedException`.

## Visual representation

```text title="Path operations are pure; Files touches the disk"
  Path base = Path.of("data");                       (nothing on disk yet)
  Path file = base.resolve("2024/q1.csv")            data/2024/q1.csv
       file.getFileName()                            q1.csv
       file.getParent()                              data/2024
       base.relativize(file)                         2024/q1.csv
       Path.of("data/./2024/../2025").normalize()    data/2025

  Files.createDirectories(file.getParent())   ->  disk: data/ 2024/
  Files.writeString(file, "id,amount\n")      ->  disk: data/2024/q1.csv (10 bytes)
  try (Stream<String> lines = Files.lines(file)) { ... }    lazy; the file handle is closed by try-with-resources

  atomic replace:  write data/2024/q1.csv.tmp  ->  Files.move(tmp, q1.csv, ATOMIC_MOVE, REPLACE_EXISTING)
```

## Java code example

Paths are printed with `/` through a small helper, so the output is the same on Windows and Unix. Everything happens in a temporary directory, which is deleted at the end.

```java title="FilesDemo.java" file="FilesDemo.java"
import java.io.BufferedWriter;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

public class FilesDemo {
    static String show(Path p) {                               // print with / on every OS
        List<String> parts = new ArrayList<>();
        p.forEach(name -> parts.add(name.toString()));
        return String.join("/", parts);
    }

    public static void main(String[] args) throws IOException {
        // 1. Paths are just names: nothing touches the disk
        Path file = Path.of("reports", "2024", "q1.csv");
        System.out.println("name " + file.getFileName() + ", parent " + show(file.getParent()) + ", parts " + file.getNameCount());
        System.out.println("resolveSibling " + show(file.resolveSibling("q2.csv"))
                + ", normalize " + show(Path.of("a", ".", "b", "..", "c").normalize())
                + ", relativize " + show(Path.of("reports").relativize(file)));

        Path root = Files.createTempDirectory("files-demo");
        try {
            // 2. Writing and reading text
            Path csv = root.resolve("data/2024/q1.csv");
            Files.createDirectories(csv.getParent());          // creates every missing parent
            Files.writeString(csv, "id,amount\n1,250\n2,100\n");
            Files.writeString(csv, "3,75\n", StandardOpenOption.APPEND);
            System.out.println("readString: " + Files.readString(csv).strip().replace("\n", " | "));
            System.out.println("readAllLines: " + Files.readAllLines(csv).size() + " lines, size " + Files.size(csv) + " bytes");
            try (Stream<String> lines = Files.lines(csv)) {     // lazy: must be closed
                int total = lines.skip(1).mapToInt(l -> Integer.parseInt(l.split(",")[1])).sum();
                System.out.println("lines() summed amounts: " + total);
            }
            try (BufferedWriter out = Files.newBufferedWriter(root.resolve("data/notes.txt"), StandardCharsets.UTF_8)) {
                out.write("written with an explicit UTF-8 writer");
                out.newLine();
            }

            // 3. Copy, atomic move, CREATE_NEW
            Path backup = Files.copy(csv, root.resolve("data/2024/q1.bak"), StandardCopyOption.REPLACE_EXISTING);
            System.out.println("copy identical: " + (Files.mismatch(csv, backup) == -1));
            Path tmp = root.resolve("data/2024/q2.csv.tmp");
            Files.writeString(tmp, "id,amount\n9,999\n");
            Path q2 = Files.move(tmp, root.resolve("data/2024/q2.csv"), StandardCopyOption.ATOMIC_MOVE);
            System.out.println("atomic move: " + show(root.relativize(q2)) + " exists, tmp gone: " + Files.notExists(tmp));
            try {
                Files.writeString(q2, "x", StandardOpenOption.CREATE_NEW);
            } catch (FileAlreadyExistsException e) {
                System.out.println("CREATE_NEW on an existing file -> FileAlreadyExistsException");
            }

            // 4. Walking a tree (sorted: file-system order isn't guaranteed)
            try (Stream<Path> tree = Files.walk(root)) {
                tree.filter(Files::isRegularFile)
                        .map(p -> show(root.relativize(p)))
                        .sorted()
                        .forEach(p -> System.out.println("  walk: " + p));
            }
            try (Stream<Path> found = Files.find(root, 10, (p, attrs) -> attrs.isRegularFile() && p.toString().endsWith(".csv"))) {
                System.out.println("find *.csv: " + found.count() + " files");
            }
            BasicFileAttributes attrs = Files.readAttributes(csv, BasicFileAttributes.class);
            System.out.println("attributes: regular=" + attrs.isRegularFile() + ", dir=" + attrs.isDirectory() + ", size=" + attrs.size());

            // 5. Why java.io.File is legacy: silent failures vs informative exceptions
            File missing = root.resolve("nope.txt").toFile();
            System.out.println("File.delete() on a missing file returns " + missing.delete() + " (no reason given)");
            try {
                Files.delete(missing.toPath());
            } catch (NoSuchFileException e) {
                System.out.println("Files.delete() throws NoSuchFileException naming the file: " + Path.of(e.getFile()).getFileName());
            }
        } finally {
            deleteRecursively(root);
            System.out.println("temp directory deleted: " + Files.notExists(root));
        }
    }

    static void deleteRecursively(Path root) throws IOException {
        try (Stream<Path> all = Files.walk(root)) {
            for (Path p : all.sorted(Comparator.reverseOrder()).toList()) {   // children before parents
                Files.delete(p);
            }
        }
    }
}
```

## Output

```text title="Output" output="FilesDemo.java"
name q1.csv, parent reports/2024, parts 3
resolveSibling reports/2024/q2.csv, normalize a/c, relativize 2024/q1.csv
readString: id,amount | 1,250 | 2,100 | 3,75
readAllLines: 4 lines, size 27 bytes
lines() summed amounts: 425
copy identical: true
atomic move: data/2024/q2.csv exists, tmp gone: true
CREATE_NEW on an existing file -> FileAlreadyExistsException
  walk: data/2024/q1.bak
  walk: data/2024/q1.csv
  walk: data/2024/q2.csv
  walk: data/notes.txt
find *.csv: 2 files
attributes: regular=true, dir=false, size=27
File.delete() on a missing file returns false (no reason given)
Files.delete() throws NoSuchFileException naming the file: nope.txt
temp directory deleted: true
```

- Creating and manipulating `Path`s (`resolveSibling`, `normalize`, `relativize`) didn't touch the disk.
- `createDirectories` built the missing parents. `writeString`/`APPEND`/`readString`/`readAllLines` handled small text, and `Files.lines` streamed it lazily inside try-with-resources.
- `copy` + `mismatch` verified an identical copy. The temporary-file + `ATOMIC_MOVE` pattern published `q2.csv` in one step, and `CREATE_NEW` refused to overwrite.
- `Files.walk` visited the whole tree. Sorting made the order deterministic.
- `File.delete()` just said `false`, while `Files.delete` explained *why* with a specific exception. Deleting the tree in reverse order removed files before their directories.

## Real-world application

- **Configuration and resources**: `Files.readString(Path.of("config/app.yaml"))`, or with Spring's `Resource` abstraction underneath.
- **Batch processing and ETL**: `Files.lines` over large CSV and log files, filtered and aggregated as streams without loading them into memory.
- **Safe file publication**: report generators, cache files and export jobs write to a temp file and atomically move it, so downstream readers never see partial files.
- **Housekeeping jobs**: `Files.walk` + attributes to delete old logs and temp files; `walkFileTree` for robust recursive operations with per-file error handling.
- **Zip handling**: `FileSystems.newFileSystem(zip)` + `Files.copy` to read or write archive entries as if they were files.
- **Tests**: `@TempDir` in JUnit 5 provides a temporary directory that's cleaned up automatically, and Jimfs provides in-memory file systems.

## Common mistakes

- **Not closing `Files.lines`/`walk`/`list`/`newDirectoryStream`**, which leaks file handles.
- **`readAllLines`/`readString` on huge files**, risking `OutOfMemoryError`.
- **Relying on the platform default charset** (before Java 18) or mixing charsets. Name the charset explicitly.
- **Building paths with string concatenation and hard-coded `/` or `\`.** Use `Path.of(...)`/`resolve`.
- **Ignoring `File` methods' boolean results** (`mkdir()`, `delete()`), so failures pass silently.
- **Writing directly to the final file name** while readers may be reading it. Write to a temp file, then move it atomically.
- **Assuming `Files.walk` returns files in sorted order**, or forgetting that `Files.exists` can be false *and* `notExists` false (when access is denied).
- **Path traversal**: resolving user input (`base.resolve(userInput)`) without checking that `normalize()` stays inside `base`.

## Interview questions

**Q1. Why prefer `Path`/`Files` over `java.io.File`?**

````reveal title="Answer"
NIO.2 (Java 7) gives:
- meaningful exceptions instead of `false`/`null` (`NoSuchFileException`, `AccessDeniedException`);
- proper symbolic-link support;
- rich file attributes and permissions;
- lazy, closeable streams for large directories (`list`, `walk`, `find`);
- built-in copy and move, including atomic moves;
- convenience methods (`readString`, `writeString`, `lines`);
- pluggable file systems (zip, in-memory).

`File` remains only for legacy APIs; convert with `toPath()`/`toFile()`.
````

**Q2. How do you read a 10 GB log file in Java?**

````reveal title="Answer"
Lazily, never all at once:
- `try (Stream<String> lines = Files.lines(path, UTF_8)) { lines.filter(…).forEach(…); }`;
- or a `BufferedReader` loop from `Files.newBufferedReader`;
- or a `FileChannel` / memory-mapped buffer for binary or random access.

Avoid `readAllLines`/`readString`/`readAllBytes`, which load everything into memory. Always close the stream or reader (try-with-resources) and specify the charset.
````

**Q3. How do you write a file so that readers never see a partially written version?**

````reveal title="Answer"
Write the content to a temporary file in the same directory, flush (and `SYNC`/`force` it if durability matters), then `Files.move(tmp, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)`. The rename is atomic within a file system, so readers see either the old file or the complete new one. Across file systems, atomic moves aren't possible (`AtomicMoveNotSupportedException`).
````

**Q4. What's the difference between `Path.resolve`, `relativize` and `normalize`?**

````reveal title="Answer"
- `resolve(other)` appends `other` to this path (or returns `other` if it's absolute): `data.resolve("a.txt")` → `data/a.txt`.
- `relativize(other)` computes the relative path from this path to `other`: `data` → `data/2024/a.txt` gives `2024/a.txt`.
- `normalize()` removes redundant `.` and `name/..` elements syntactically, without checking the disk or resolving links. `toRealPath()` does that, and requires the file to exist.
````

**Q5. Why must the stream returned by `Files.lines` or `Files.walk` be closed?**

````reveal title="Answer"
They're lazily backed by an open file or directory handle (a native resource), which stays open until the stream is closed. Terminal operations don't close streams automatically. Without try-with-resources, each call leaks a file descriptor, eventually causing `Too many open files` errors, or locked files on Windows that can't be deleted.
````

## Hands-on exercise

Write a **directory summary** tool:
1. In a temporary directory, create `logs/app.log` (1,200 bytes), `logs/old/app-1.log` (3,000 bytes), `data/users.csv` (500 bytes), `data/orders.csv` (2,500 bytes) and `README.md` (80 bytes), using `Files.write` with byte arrays of those sizes.
2. Use one `Files.walk` to compute the number of files, the total bytes, bytes per extension (sorted), and the two largest files (relative paths, printed with `/`).
3. Delete the whole tree, and confirm it's gone.

````hint title="Hint"
`try (Stream<Path> s = Files.walk(root)) { List<Path> files = s.filter(Files::isRegularFile).toList(); }`. Extension: `name.substring(name.lastIndexOf('.') + 1)`. Per extension: `Collectors.groupingBy(ext, TreeMap::new, Collectors.summingLong(size))`, where `size` wraps `Files.size` and turns `IOException` into `UncheckedIOException`. Delete in `Comparator.reverseOrder()`.
````

````solution title="Solution"
```java title="DirectorySummary.java" file="DirectorySummary.java"
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class DirectorySummary {
    static long size(Path p) {
        try {
            return Files.size(p);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    static String extension(Path p) {
        String name = p.getFileName().toString();
        return name.substring(name.lastIndexOf('.') + 1);
    }

    static String show(Path p) {
        List<String> parts = new ArrayList<>();
        p.forEach(n -> parts.add(n.toString()));
        return String.join("/", parts);
    }

    public static void main(String[] args) throws IOException {
        Path root = Files.createTempDirectory("summary");
        Map<String, Integer> layout = Map.of("logs/app.log", 1_200, "logs/old/app-1.log", 3_000,
                "data/users.csv", 500, "data/orders.csv", 2_500, "README.md", 80);
        for (Map.Entry<String, Integer> e : layout.entrySet()) {
            Path p = root.resolve(e.getKey());
            Files.createDirectories(p.getParent());
            Files.write(p, new byte[e.getValue()]);
        }

        List<Path> files;
        try (Stream<Path> tree = Files.walk(root)) {
            files = tree.filter(Files::isRegularFile).toList();
        }
        long total = files.stream().mapToLong(DirectorySummary::size).sum();
        Map<String, Long> byExtension = files.stream().collect(
                Collectors.groupingBy(DirectorySummary::extension, TreeMap::new, Collectors.summingLong(DirectorySummary::size)));
        List<String> largest = files.stream()
                .sorted(Comparator.comparingLong(DirectorySummary::size).reversed())
                .limit(2)
                .map(p -> show(root.relativize(p)) + " (" + size(p) + " B)")
                .toList();
        System.out.println(files.size() + " files, " + total + " bytes");
        System.out.println("bytes per extension: " + byExtension);
        System.out.println("largest: " + largest);

        try (Stream<Path> all = Files.walk(root)) {
            for (Path p : all.sorted(Comparator.reverseOrder()).toList()) {
                Files.delete(p);
            }
        }
        System.out.println("tree deleted: " + Files.notExists(root));
    }
}
```

```text title="Output" output="DirectorySummary.java"
5 files, 7280 bytes
bytes per extension: {csv=3000, log=4200, md=80}
largest: [logs/old/app-1.log (3000 B), data/orders.csv (2500 B)]
tree deleted: true
```

A single lazy walk feeds three different summaries. `UncheckedIOException` is the standard way to carry an `IOException` out of a lambda. Deleting in reverse-sorted order guarantees children are removed before their parent directories.
````

## Knowledge check

```quiz
? Does Path.of("missing", "file.txt") fail if the file doesn't exist?
+ No, a Path is only a name; Files operations touch the disk
- Yes, it throws NoSuchFileException
- It returns null
> Existence is checked only by Files methods.

? Which call should be wrapped in try-with-resources?
+ Files.lines(path)
- Files.readString(path)
- Path.of("a").resolve("b")
> lines(), walk(), list() and find() keep a file handle open until the stream is closed.

? What does Path.of("a", ".", "b", "..", "c").normalize() return?
+ a/c
- a/b/c
- c
> . is removed and b/.. cancels out.

? What does File.delete() return if the file doesn't exist?
+ false, without saying why
- It throws NoSuchFileException
- true
> Files.delete throws a descriptive exception instead.

? How do you replace a file so readers never see a half-written version?
+ Write to a temp file in the same directory, then Files.move with ATOMIC_MOVE
- Open the target with TRUNCATE_EXISTING and write quickly
- Delete the target first, then write it
> The atomic rename makes the switch a single step.
```

## Key takeaways

- Use **`Path` + `Files`** (NIO.2), not `java.io.File`: real exceptions, attributes, symlinks, atomic moves, lazy directory streams, pluggable file systems.
- A `Path` is just a name (`resolve`, `relativize`, `normalize` are pure). `Files` performs I/O.
- Small files: `readString`/`writeString`. Big files: **`Files.lines`/`BufferedReader`, closed with try-with-resources**. Always use explicit UTF-8.
- **Atomic replace** = temp file + `ATOMIC_MOVE`. `CREATE_NEW` prevents overwriting.
- `walk`/`list`/`find` order isn't guaranteed (sort it), and their streams must be closed. Guard `resolve(userInput)` against path traversal.
