## Problem statement

Design an in-memory file system with a Unix-like API: `mkdir -p`, `ls`, writing, appending and reading files, moving and renaming (`mv`), removing (`rm`, `rm -r`), the total size of a directory, and walking the tree. Paths are absolute strings like `/docs/notes/todo.txt`.

> [!TIP] Try it first
> A directory contains files **and other directories**, and many operations (size, walk, delete) must treat both the same way. Which pattern lets "a thing in the tree" be either?

## Clarifying questions

1. Absolute paths only? Do `.` and `..` need to work?
2. Does `ls` on a file return just its name?
3. Does writing to `/a/b.txt` create `/a` automatically?
4. `mv` semantics: into an existing directory, rename, or overwrite?
5. Is size the content length? Do directories have a size of their own?
6. Permissions, links, timestamps?
7. Concurrent access?

````reveal title="Answers we'll assume"
- **Absolute paths**; `.` and `..` are resolved lexically (`/a/./b/../c` is `/a/c`).
- `ls` on a directory lists children sorted by name (directories with a trailing `/`); on a file, just its name.
- Writing requires the parent directory to exist (like a shell); `mkdir -p` creates parents.
- `mv src dst`: if `dst` is an existing directory, move **into** it; otherwise rename to `dst` (its parent must exist). Never overwrite. A directory can't move into its own subtree.
- Size = bytes of file content; a directory's size is the sum of everything under it.
- No permissions, links or timestamps (follow-ups).
- Many threads may use the file system at once.
````

## Requirements

**Functional**

1. `mkdirs`, `ls`, `write`, `append`, `read`, `move`, `remove(recursive)`, `size`, `walk`, `find`.
2. Clear, specific errors: no such path, not a directory, is a directory, already exists, directory not empty, invalid move.

**Non-functional**

3. Files and directories are handled uniformly where it makes sense (size, walk, delete).
4. Thread-safe; readers don't block each other.

## Step 1 — Model the tree

````reveal title="Composite: a node is a file or a directory"
```text
/                 Directory
+- docs/          Directory
   +- readme.md   File      (6 bytes)
   +- notes/      Directory
      +- todo.txt File      (18 bytes)
```

`Node` is the common type (name, parent, `size()`, `path()`). `FileNode` is a leaf; `Directory` is a composite holding child `Node`s in a sorted map. `Directory.size()` just sums its children's `size()` — it doesn't care whether a child is a file or another directory.

With Java 17, `Node` can be a **sealed** class that permits exactly `FileNode` and `Directory`, so code that branches on the kind knows there are only two.
````

## Step 2 — Class design

```uml title="In-memory file system"
class FileSystem
  - root: Directory
  - lock: ReadWriteLock
  + mkdirs(path: String): void
  + ls(path: String): List<String>
  + write(path: String, content: String): void
  + append(path: String, content: String): void
  + read(path: String): String
  + move(from: String, to: String): void
  + remove(path: String, recursive: boolean): void
  + size(path: String): long
  + walk(path: String): List<String>
abstract class Node
  - name: String
  - parent: Directory
  + size(): long
  + path(): String
class FileNode
  - content: String
class Directory
  - children: TreeMap<String, Node>
  + child(name: String): Node
  + isAncestorOf(n: Node): boolean
class TreeIterator
  - stack: Deque<Node>
  + hasNext(): boolean
  + next(): Node
class FsException
FileNode --|> Node
Directory --|> Node
Directory o-- "0..*" Node : children
FileSystem *-- "1" Directory : root
TreeIterator ..> Node
FileSystem ..> FsException : throws
```

## Step 3 — Implementation

````hint title="Hint — resolve once, then act"
Write one `resolve(path)` that walks from the root through `Directory.child(name)` and throws `NoSuchPathException` or `NotADirectoryException` with the exact failing prefix. Every operation starts with it (or with "resolve the parent, then look up the last name"), so error handling is consistent everywhere.
````

````solution title="Complete Java solution"
```java title="FileSystemDemo.java" file="FileSystemDemo.java"
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Deque;
import java.util.Iterator;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.TreeMap;
import java.util.concurrent.locks.ReadWriteLock;
import java.util.concurrent.locks.ReentrantReadWriteLock;
import java.util.function.Predicate;
import java.util.function.Supplier;

public class FileSystemDemo {
    public static void main(String[] args) {
        FileSystem fs = new FileSystem();
        fs.mkdirs("/docs/notes");
        fs.write("/docs/notes/todo.txt", "buy milk");
        fs.append("/docs/notes/todo.txt", ", call mom");
        fs.write("/docs/readme.md", "# Docs");
        System.out.println("ls / -> " + fs.ls("/"));
        System.out.println("ls /docs -> " + fs.ls("/docs"));
        System.out.println("ls /docs/notes/todo.txt -> " + fs.ls("/docs/notes/todo.txt"));
        System.out.println("cat todo.txt -> " + fs.read("/docs/./notes/../notes/todo.txt"));
        System.out.println("du /docs -> " + fs.size("/docs") + " bytes");

        attempt(() -> fs.write("/docs/notes", "oops"));
        attempt(() -> fs.read("/docs/missing.txt"));
        attempt(() -> fs.mkdirs("/docs/readme.md/sub"));

        fs.mkdirs("/archive");
        fs.move("/docs/notes", "/archive");                         // into an existing directory
        fs.move("/docs/readme.md", "/archive/README.md");           // rename while moving
        attempt(() -> fs.move("/archive", "/archive/notes/old"));
        attempt(() -> fs.move("/archive/README.md", "/archive/notes/todo.txt"));
        System.out.println("walk / -> " + fs.walk("/"));
        System.out.println("find *.txt -> " + fs.find("/", name -> name.endsWith(".txt")));

        attempt(() -> fs.remove("/archive", false));
        fs.remove("/archive", true);
        System.out.println("after rm -r /archive: " + fs.walk("/"));
    }

    static void attempt(Runnable action) {
        try {
            action.run();
        } catch (FsException e) {
            System.out.println("Rejected (" + e.getClass().getSimpleName() + "): " + e.getMessage());
        }
    }
}

// ---------- Domain exceptions ----------

class FsException extends RuntimeException {
    FsException(String message) { super(message); }
}

final class NoSuchPathException extends FsException {
    NoSuchPathException(String path) { super("no such file or directory: " + path); }
}

final class NotADirectoryException extends FsException {
    NotADirectoryException(String path) { super("not a directory: " + path); }
}

final class IsADirectoryException extends FsException {
    IsADirectoryException(String path) { super("is a directory: " + path); }
}

final class PathExistsException extends FsException {
    PathExistsException(String path) { super("already exists: " + path); }
}

final class DirectoryNotEmptyException extends FsException {
    DirectoryNotEmptyException(String path) { super("directory not empty: " + path); }
}

final class InvalidMoveException extends FsException {
    InvalidMoveException(String message) { super(message); }
}

// ---------- Composite ----------

abstract sealed class Node permits FileNode, Directory {
    private String name;
    private Directory parent;

    Node(String name, Directory parent) {
        this.name = name;
        this.parent = parent;
    }

    String name() { return name; }
    Directory parent() { return parent; }

    void attach(Directory newParent, String newName) {
        this.parent = newParent;
        this.name = newName;
    }

    abstract long size();

    String path() {
        if (parent == null) return "/";
        String p = parent.path();
        return (p.equals("/") ? "" : p) + "/" + name;
    }
}

final class FileNode extends Node {
    private String content = "";

    FileNode(String name, Directory parent) { super(name, parent); }

    String read() { return content; }
    void write(String text) { content = text; }
    void append(String text) { content = content + text; }

    @Override long size() { return content.getBytes(StandardCharsets.UTF_8).length; }
}

final class Directory extends Node {
    private final TreeMap<String, Node> children = new TreeMap<>();

    Directory(String name, Directory parent) { super(name, parent); }

    Node child(String name) { return children.get(name); }
    Collection<Node> children() { return children.values(); }
    void add(Node n) { children.put(n.name(), n); }
    void removeChild(String name) { children.remove(name); }

    /** Composite: a directory's size is the sum of its children's, whatever they are. */
    @Override long size() {
        long total = 0;
        for (Node c : children.values()) total += c.size();
        return total;
    }

    boolean isAncestorOf(Node n) {
        for (Node x = n; x != null; x = x.parent()) if (x == this) return true;
        return false;
    }
}

/** Iterator: depth-first, pre-order, children in name order, without recursion. */
final class TreeIterator implements Iterator<Node> {
    private final Deque<Node> stack = new ArrayDeque<>();

    TreeIterator(Node start) { stack.push(start); }

    public boolean hasNext() { return !stack.isEmpty(); }

    public Node next() {
        if (stack.isEmpty()) throw new NoSuchElementException();
        Node n = stack.pop();
        if (n instanceof Directory d) {
            List<Node> kids = new ArrayList<>(d.children());
            for (int i = kids.size() - 1; i >= 0; i--) stack.push(kids.get(i));   // reversed, so the first child pops first
        }
        return n;
    }
}

// ---------- Facade ----------

final class FileSystem {
    private final Directory root = new Directory("", null);
    private final ReadWriteLock lock = new ReentrantReadWriteLock();

    void mkdirs(String path) {
        writeLocked(() -> {
            Directory dir = root;
            for (String part : parts(path)) {
                Node next = dir.child(part);
                if (next == null) {
                    next = new Directory(part, dir);
                    dir.add(next);
                } else if (!(next instanceof Directory)) {
                    throw new NotADirectoryException(next.path());
                }
                dir = (Directory) next;
            }
            return null;
        });
    }

    List<String> ls(String path) {
        return readLocked(() -> {
            Node n = resolve(path);
            if (n instanceof FileNode) return List.of(n.name());
            return ((Directory) n).children().stream().map(c -> c instanceof Directory ? c.name() + "/" : c.name()).toList();
        });
    }

    void write(String path, String content) { writeLocked(() -> { fileForWriting(path).write(content); return null; }); }

    void append(String path, String content) { writeLocked(() -> { fileForWriting(path).append(content); return null; }); }

    String read(String path) {
        return readLocked(() -> {
            Node n = resolve(path);
            if (n instanceof FileNode f) return f.read();
            throw new IsADirectoryException(n.path());
        });
    }

    long size(String path) { return readLocked(() -> resolve(path).size()); }

    void move(String from, String to) {
        writeLocked(() -> {
            Node src = resolve(from);
            if (src == root) throw new InvalidMoveException("cannot move the root");
            Node target = lookup(to);
            Directory newParent;
            String newName;
            if (target instanceof Directory d) {                 // mv x dir  -> dir/x
                newParent = d;
                newName = src.name();
            } else if (target != null) {
                throw new PathExistsException(target.path());
            } else {                                            // mv x /new/name -> rename
                List<String> p = parts(to);
                newParent = directory(p.subList(0, p.size() - 1));
                newName = p.get(p.size() - 1);
            }
            if (newParent.child(newName) != null) throw new PathExistsException(newParent.child(newName).path());
            if (src instanceof Directory d && d.isAncestorOf(newParent)) {
                throw new InvalidMoveException("cannot move " + src.path() + " into itself");
            }
            src.parent().removeChild(src.name());
            src.attach(newParent, newName);
            newParent.add(src);
            return null;
        });
    }

    void remove(String path, boolean recursive) {
        writeLocked(() -> {
            Node n = resolve(path);
            if (n == root) throw new InvalidMoveException("cannot remove the root");
            if (n instanceof Directory d && !d.children().isEmpty() && !recursive) throw new DirectoryNotEmptyException(n.path());
            n.parent().removeChild(n.name());                   // the whole subtree goes with it
            return null;
        });
    }

    List<String> walk(String path) { return find(path, name -> true); }

    List<String> find(String path, Predicate<String> namePredicate) {
        return readLocked(() -> {
            List<String> out = new ArrayList<>();
            for (Iterator<Node> it = new TreeIterator(resolve(path)); it.hasNext(); ) {
                Node n = it.next();
                if (namePredicate.test(n.name())) out.add(n.path());
            }
            return out;
        });
    }

    // ---------- path handling ----------

    static List<String> parts(String path) {
        if (path == null || !path.startsWith("/")) throw new FsException("path must be absolute: " + path);
        Deque<String> out = new ArrayDeque<>();
        for (String p : path.split("/")) {
            if (p.isEmpty() || p.equals(".")) continue;
            if (p.equals("..")) {
                if (!out.isEmpty()) out.removeLast();
                continue;
            }
            out.addLast(p);
        }
        return List.copyOf(out);
    }

    private Node resolve(String path) {
        Node n = lookup(path);
        if (n == null) throw new NoSuchPathException(path);
        return n;
    }

    /** Null if the last component is missing; throws if an intermediate component is missing or a file. */
    private Node lookup(String path) {
        List<String> p = parts(path);
        if (p.isEmpty()) return root;
        return directory(p.subList(0, p.size() - 1)).child(p.get(p.size() - 1));
    }

    private Directory directory(List<String> parts) {
        Node n = root;
        for (String part : parts) {
            if (!(n instanceof Directory d)) throw new NotADirectoryException(n.path());
            Node next = d.child(part);
            if (next == null) throw new NoSuchPathException((d == root ? "" : d.path()) + "/" + part);
            n = next;
        }
        if (n instanceof Directory d) return d;
        throw new NotADirectoryException(n.path());
    }

    private FileNode fileForWriting(String path) {
        List<String> p = parts(path);
        if (p.isEmpty()) throw new IsADirectoryException("/");
        Directory parent = directory(p.subList(0, p.size() - 1));
        Node existing = parent.child(p.get(p.size() - 1));
        if (existing instanceof Directory) throw new IsADirectoryException(existing.path());
        if (existing instanceof FileNode f) return f;
        FileNode created = new FileNode(p.get(p.size() - 1), parent);
        parent.add(created);
        return created;
    }

    private <T> T readLocked(Supplier<T> action) {
        lock.readLock().lock();
        try {
            return action.get();
        } finally {
            lock.readLock().unlock();
        }
    }

    private <T> T writeLocked(Supplier<T> action) {
        lock.writeLock().lock();
        try {
            return action.get();
        } finally {
            lock.writeLock().unlock();
        }
    }
}
```
````

## Design decisions

- **Composite.** `FileNode` and `Directory` share `Node`; recursive operations (`size`, walking, removing a subtree) are written once and work at every level (see [Composite](lesson:composite)).
- **Sealed hierarchy.** `Node` permits exactly two subclasses, so `instanceof` checks are exhaustive by construction and nobody can add a third node type by accident.
- **Iterator for traversal.** `TreeIterator` walks depth-first with an explicit stack (no recursion depth limit) and hides the tree's shape from callers; `walk` and `find` are a few lines on top of it (see [Iterator](lesson:iterator)).
- **Parent pointers.** Each node knows its parent, which makes `path()`, moves and the "into its own subtree?" check O(depth) (see [Object relationships](lesson:object-relationships)).
- **Specific exceptions.** `NoSuchPathException`, `IsADirectoryException`, `DirectoryNotEmptyException`… tell callers exactly what went wrong and let them react per case — the same as real file-system errors (see [Domain exceptions](lesson:domain-exceptions)).
- **One read-write lock for the tree.** `mv` touches two directories; a single lock avoids deadlocks between moves in opposite directions, and readers still run in parallel.

## Patterns and principles

[Composite](lesson:composite) (`Node`, `FileNode`, `Directory`), [Iterator](lesson:iterator) (`TreeIterator`), [Facade](lesson:facade) (`FileSystem`), [domain exceptions](lesson:domain-exceptions), and bidirectional [object relationships](lesson:object-relationships) (parent ↔ children).

## Example execution flow

```text
mkdirs /docs/notes        root -> create docs -> create notes
write todo.txt, append    parent /docs/notes resolved; file created, then appended
read /docs/./notes/../notes/todo.txt   normalised to /docs/notes/todo.txt
size /docs                Directory.size = readme.md (6) + notes.size (todo.txt 18) = 24
write /docs/notes         existing node is a Directory -> IsADirectoryException
mkdirs /docs/readme.md/sub  readme.md is a file -> NotADirectoryException
move /docs/notes /archive        /archive is a directory -> becomes /archive/notes
move /archive /archive/notes/old  /archive is an ancestor of /archive/notes -> InvalidMoveException
remove /archive (not recursive)  has children -> DirectoryNotEmptyException; recursive -> subtree detached
```

```text title="Program output"
ls / -> [docs/]
ls /docs -> [notes/, readme.md]
ls /docs/notes/todo.txt -> [todo.txt]
cat todo.txt -> buy milk, call mom
du /docs -> 24 bytes
Rejected (IsADirectoryException): is a directory: /docs/notes
Rejected (NoSuchPathException): no such file or directory: /docs/missing.txt
Rejected (NotADirectoryException): not a directory: /docs/readme.md
Rejected (InvalidMoveException): cannot move /archive into itself
Rejected (PathExistsException): already exists: /archive/notes/todo.txt
walk / -> [/, /archive, /archive/README.md, /archive/notes, /archive/notes/todo.txt, /docs]
find *.txt -> [/archive/notes/todo.txt]
Rejected (DirectoryNotEmptyException): directory not empty: /archive
after rm -r /archive: [/, /docs]
```

## Edge cases

- **`..` above the root** → stays at the root (`/..` is `/`).
- **Trailing or repeated slashes** → ignored (`/docs//notes/` is `/docs/notes`).
- **`mkdirs` on an existing directory** → no-op; through a file → `NotADirectoryException`.
- **Writing to a path whose parent doesn't exist** → `NoSuchPathException` naming the missing directory.
- **Moving onto an existing file, or a directory into its own subtree** → rejected.
- **Removing or moving the root** → rejected.
- **Relative paths** → rejected.

## Tests

```java title="FileSystemTest.java" file="FileSystemTest.java" test="FileSystemDemo.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class FileSystemTest {
    private FileSystem fs;

    @BeforeEach
    void setUp() {
        fs = new FileSystem();
        fs.mkdirs("/a/b");
        fs.write("/a/b/f.txt", "hello");
        fs.write("/a/g.txt", "hi");
    }

    @Test
    void mkdirsIsIdempotentAndRefusesToGoThroughAFile() {
        fs.mkdirs("/a/b");
        assertEquals(List.of("b/", "g.txt"), fs.ls("/a"));
        assertThrows(NotADirectoryException.class, () -> fs.mkdirs("/a/g.txt/x"));
    }

    @Test
    void writeOverwritesAndAppendAppends() {
        fs.write("/a/g.txt", "new");
        fs.append("/a/g.txt", "er");
        assertEquals("newer", fs.read("/a/g.txt"));
        assertThrows(NoSuchPathException.class, () -> fs.write("/nope/x.txt", "x"));
        assertThrows(IsADirectoryException.class, () -> fs.read("/a"));
    }

    @Test
    void sizeIsRecursive() {
        assertEquals(7, fs.size("/"));
        assertEquals(5, fs.size("/a/b"));
    }

    @Test
    void moveIntoRenameAndGuardrails() {
        fs.mkdirs("/c");
        fs.move("/a/b", "/c");
        assertEquals("hello", fs.read("/c/b/f.txt"));
        fs.move("/a/g.txt", "/c/b/h.txt");
        assertEquals(List.of("f.txt", "h.txt"), fs.ls("/c/b"));
        assertThrows(InvalidMoveException.class, () -> fs.move("/c", "/c/b"));
        assertThrows(PathExistsException.class, () -> fs.move("/c/b/f.txt", "/c/b/h.txt"));
    }

    @Test
    void removeNeedsRecursiveForNonEmptyDirectories() {
        assertThrows(DirectoryNotEmptyException.class, () -> fs.remove("/a", false));
        fs.remove("/a/b/f.txt", false);
        fs.remove("/a/b", false);
        fs.remove("/a", true);
        assertEquals(List.of("/"), fs.walk("/"));
        assertThrows(InvalidMoveException.class, () -> fs.remove("/", true));
    }

    @Test
    void pathsAreNormalisedAndMustBeAbsolute() {
        assertEquals("hello", fs.read("/a/./b/../b//f.txt"));
        assertEquals(List.of("a", "c"), FileSystem.parts("/../a/b/../c/"));
        assertThrows(FsException.class, () -> fs.read("a/g.txt"));
    }

    @Test
    void walkIsPreOrderInNameOrder() {
        assertEquals(List.of("/", "/a", "/a/b", "/a/b/f.txt", "/a/g.txt"), fs.walk("/"));
    }

    @Test
    void concurrentWritersAndReaders() throws InterruptedException {
        List<Thread> threads = new ArrayList<>();
        for (int t = 0; t < 8; t++) {
            int id = t;
            threads.add(new Thread(() -> {
                fs.mkdirs("/load/t" + id);
                for (int i = 0; i < 200; i++) {
                    fs.write("/load/t" + id + "/f" + i, "x");
                    fs.size("/");
                    fs.walk("/a");
                }
            }));
        }
        threads.forEach(Thread::start);
        for (Thread th : threads) th.join();
        assertEquals(1_600, fs.size("/load"));
    }
}
```

## Concurrency

- **Read-write lock over the tree:** `ls`, `read`, `size`, `walk` and `find` share the read lock; changes take the write lock. `walk` and `find` run their iterator **inside** the read lock, so they never see a half-done move.
- **Why not one lock per directory?** It allows more parallel writes, but `mv /a/x /b/` needs both `/a` and `/b`, and a concurrent `mv /b/y /a/` locks them in the opposite order — deadlock, unless locks are always taken in a global order (for example, by path). A single tree lock is the right first answer.
- **Iterators over a live tree** are not safe to use outside the lock; that's why the public API returns lists.

## Common mistakes and alternatives

- **Separate `File` and `Directory` with no common type** — every recursive operation needs two versions.
- **Storing full paths as map keys** (`Map<String, Node>`) — `mv` of a directory must rewrite every key below it.
- **Recursive `walk`** — fine for normal trees, but a very deep one overflows the stack; an explicit stack doesn't.
- **Forgetting the "into its own subtree" check** — the moved directory detaches from the root and disappears with its contents.
- **Generic `RuntimeException("error")`** — callers can't distinguish "missing" from "not empty".

## Follow-up questions

````reveal title="Permissions"
Give each `Node` an owner and a mode (`rwx` for owner/group/others). `resolve` checks execute permission on each directory it passes through; reads and writes check the target. A `User` is passed into each call (or bound to a session object).
````

````reveal title="Hard links and symbolic links"
Hard link: two directory entries pointing at the same `FileNode` (content and size shared; delete removes the entry, the file goes when the last entry is gone — reference counting). Symlink: a third node type storing a path; `resolve` follows it, with a hop limit to stop loops. The sealed hierarchy grows by one permitted subclass.
````

````reveal title="Large files"
Store content as a list of fixed-size blocks instead of one `String`. Writes at an offset touch only the affected blocks, appends add blocks, and size is `blocks × blockSize` minus the unused tail — the in-memory version of how real file systems lay out data.
````

## Complexity

- `resolve`: O(d) for path depth d (a `TreeMap` lookup per level, O(log c) for c children).
- `ls`: O(c); `size` and `walk`: O(n) for n nodes in the subtree.
- `move`: O(d) (path resolution plus the ancestor check).

## Interviewer checklist

- [ ] Composite tree; uniform recursive operations
- [ ] Path normalisation and a single resolve routine
- [ ] `mv` semantics including the subtree check
- [ ] Specific domain exceptions
- [ ] Iterator-based traversal
- [ ] Locking strategy for moves (single lock or ordered locks)
