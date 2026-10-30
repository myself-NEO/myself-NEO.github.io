## Concept explanation

`java.nio` (Java 1.4) models I/O as **channels** moving data in and out of **buffers**, rather than as streams of single bytes. It adds:
- explicit, reusable buffers;
- **direct** (off-heap) memory;
- **memory-mapped files**;
- zero-copy transfers;
- **non-blocking** sockets with selectors.

### ByteBuffer: position, limit, capacity

A buffer is a fixed-size array with three cursors, `0 <= position <= limit <= capacity`:
- **capacity**: the total size, which never changes;
- **position**: the next index to read or write;
- **limit**: the first index you may *not* read or write.

| Call | Effect | When |
|---|---|---|
| `put(...)` / `get(...)` (relative) | write or read at `position`, then advance it | filling / draining |
| **`flip()`** | `limit = position; position = 0` | switch from **writing into** the buffer to **reading from** it |
| `clear()` | `position = 0; limit = capacity` (the data isn't erased) | ready to fill again |
| `compact()` | move the unread bytes to the start, `position` after them, `limit = capacity` | keep leftovers, continue filling |
| `rewind()` | `position = 0` | re-read |
| `mark()` / `reset()` | remember / return to a position | |
| `get(int i)` / `put(int i, b)` (absolute) | don't move `position` | random access |

The classic bug is **forgetting `flip()`** before writing a buffer to a channel, which writes nothing (or garbage).

Other features:
- typed views (`asIntBuffer`, `getInt`, `putDouble`) and byte order (`order(ByteOrder.LITTLE_ENDIAN)`; the default is big-endian);
- `CharBuffer` + `Charset.encode`/`decode` for text.

### Heap vs direct buffers

- `ByteBuffer.allocate(n)` creates a **heap** buffer backed by a `byte[]` (`hasArray()`). It's cheap to create and garbage-collected normally.
- `ByteBuffer.allocateDirect(n)` creates a **direct** buffer in native memory. The OS can do I/O on it without copying into a temporary native buffer, so it's best for long-lived buffers in heavy I/O (Netty pools them). It's expensive to allocate, counts against `-XX:MaxDirectMemorySize`, and is freed by a `Cleaner` when the buffer object is collected.

### Channels

`FileChannel`, `SocketChannel`, `ServerSocketChannel`, `DatagramChannel` and `Pipe` channels read **into** and write **from** buffers:
- `read(buf)`/`write(buf)` return the number of bytes moved, which may be fewer than requested, so loop;
- **positional I/O**: `read(buf, position)` and `write(buf, position)` for random access;
- **scatter/gather**: `write(ByteBuffer[])` writes a header and a body in one call;
- **`transferTo`/`transferFrom`**: channel-to-channel copies that can use the OS's zero-copy `sendfile`;
- **`map()`**: a **`MappedByteBuffer`** whose memory *is* the file (via the OS page cache). Reads and writes are plain memory accesses: great for large random-access files and shared memory. `force()` flushes changes to disk. Mappings are released only when the buffer is garbage-collected (Java 22's FFM API offers `Arena`-scoped mappings that close deterministically).
- **locking**: `lock()`/`tryLock()` for advisory file locks between processes.

### Selectors and non-blocking I/O (overview)

A `SocketChannel` in **non-blocking** mode returns immediately from `read`/`write`, even when no data is ready. A **`Selector`** lets **one thread watch many channels**, waking it when some are ready (`OP_ACCEPT`, `OP_READ`, `OP_WRITE`). This is how Netty, Tomcat's NIO connector and other high-concurrency servers handle tens of thousands of connections on a few threads. With Java 21's **virtual threads**, simple blocking code per connection achieves similar scalability, so direct selector programming is now mostly for framework authors.

## Internal working

- **Heap buffers and native I/O**: when you pass a heap buffer to a channel, the JDK copies it into a temporary **direct** buffer (cached per thread), because the OS needs memory that the GC won't move. Direct buffers skip that copy. Their memory is reserved through `Bits.reserveMemory`, which is where `OutOfMemoryError: Cannot reserve … direct buffer memory` comes from.
- **`FileChannel.transferTo`** uses `sendfile` (Linux) or `TransmitFile` (Windows) when possible: data moves from the page cache to the destination without entering user space.
- **Memory mapping** uses `mmap`:
  - the file's pages are mapped into the process's address space, loaded lazily on page faults, and written back by the OS (or by `force()`);
  - mapped memory doesn't count against the heap or `MaxDirectMemorySize`, but it does count against the process's address space and RSS;
  - on Windows, a mapped file can't be deleted while the mapping is alive.
- **Selectors** are implemented with `epoll` (Linux), `kqueue` (macOS) and `WEPoll` (Windows). `select()` blocks until at least one registered key is ready, then you iterate `selectedKeys()`. The NIO poller behind **virtual threads** uses the same mechanism to unpark virtual threads waiting on sockets.
- **Byte order**: buffers default to big-endian (network order). Use `ByteOrder.nativeOrder()` for data shared with native code.

## Visual representation

```text title="Buffer cursors through a write -> read cycle (capacity 8)"
  allocate(8)         [ _ _ _ _ _ _ _ _ ]   pos=0 lim=8 cap=8
  put(a,b,c)          [ a b c _ _ _ _ _ ]   pos=3 lim=8          (writing)
  flip()              [ a b c _ _ _ _ _ ]   pos=0 lim=3          (now reading)
  get(), get()        [ a b c _ _ _ _ _ ]   pos=2 lim=3          read a, b
  compact()           [ c _ _ _ _ _ _ _ ]   pos=1 lim=8          unread 'c' moved to the front; keep writing
  clear()             [ c _ _ _ _ _ _ _ ]   pos=0 lim=8          ready to fill (data not erased)

  FileChannel ----read(buf)----> [buffer] ----write(buf)----> SocketChannel
  FileChannel ----transferTo(socket)----> SocketChannel        (zero-copy where supported)
  FileChannel ----map()----> MappedByteBuffer == the file's pages in memory
```

## Java code example

```java title="NioDemo.java" file="NioDemo.java"
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.CharBuffer;
import java.nio.MappedByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.channels.Pipe;
import java.nio.channels.SelectionKey;
import java.nio.channels.Selector;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.Comparator;
import java.util.stream.Stream;

public class NioDemo {
    static String state(ByteBuffer b) {
        return "pos=" + b.position() + " lim=" + b.limit() + " cap=" + b.capacity();
    }

    static void uppercaseFirstLetter(Path file) throws IOException {
        try (FileChannel ch = FileChannel.open(file, StandardOpenOption.READ, StandardOpenOption.WRITE)) {
            MappedByteBuffer mapped = ch.map(FileChannel.MapMode.READ_WRITE, 0, ch.size());
            mapped.put(0, (byte) Character.toUpperCase(mapped.get(0)));   // a memory write IS a file write
            mapped.force();                                                // flush to disk
        }
    }

    public static void main(String[] args) throws Exception {
        // 1. The buffer state machine
        ByteBuffer buf = ByteBuffer.allocate(8);
        System.out.println("allocate(8)   " + state(buf));
        buf.put((byte) 'a').put((byte) 'b').put((byte) 'c');
        System.out.println("put a,b,c     " + state(buf));
        buf.flip();
        System.out.println("flip()        " + state(buf));
        System.out.println("get, get      read '" + (char) buf.get() + (char) buf.get() + "', " + state(buf));
        buf.compact();
        System.out.println("compact()     " + state(buf) + ", first byte now '" + (char) buf.get(0) + "'");
        buf.clear();
        System.out.println("clear()       " + state(buf));

        ByteBuffer typed = ByteBuffer.allocate(12);
        typed.putInt(258).putDouble(1.5).flip();
        System.out.println("typed: int " + typed.getInt() + ", double " + typed.getDouble() + "; 258 big-endian bytes "
                + ByteBuffer.allocate(4).putInt(258).array()[2] + "," + ByteBuffer.allocate(4).putInt(258).array()[3]
                + " vs little-endian first byte " + ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(258).array()[0]);
        ByteBuffer direct = ByteBuffer.allocateDirect(64);
        System.out.println("heap buffer hasArray=" + buf.hasArray() + "; direct buffer isDirect=" + direct.isDirect() + ", hasArray=" + direct.hasArray());

        Path dir = Files.createTempDirectory("nio-demo");
        try {
            // 2. FileChannel: gather-write a header and a body, then read back
            Path file = dir.resolve("data.bin");
            try (FileChannel out = FileChannel.open(file, StandardOpenOption.CREATE, StandardOpenOption.WRITE)) {
                ByteBuffer header = StandardCharsets.UTF_8.encode("HDR:");
                ByteBuffer body = StandardCharsets.UTF_8.encode("hello channels");
                long written = out.write(new ByteBuffer[] {header, body});   // gathering write
                System.out.println("gathering write: " + written + " bytes, file size " + out.size());
            }
            try (FileChannel in = FileChannel.open(file, StandardOpenOption.READ)) {
                ByteBuffer readBuf = ByteBuffer.allocate(64);
                while (in.read(readBuf) > 0) {
                    // keep reading until the channel reports end of file
                }
                readBuf.flip();                                              // forget this and you decode nothing
                CharBuffer chars = StandardCharsets.UTF_8.decode(readBuf);
                System.out.println("read back: " + chars);
                ByteBuffer positional = ByteBuffer.allocate(5);
                in.read(positional, 4);                                      // absolute read: position 4
                System.out.println("positional read at 4: " + new String(positional.array(), StandardCharsets.UTF_8));
            }

            // 3. Zero-copy style copy with transferTo
            Path copy = dir.resolve("copy.bin");
            try (FileChannel src = FileChannel.open(file, StandardOpenOption.READ);
                 FileChannel dst = FileChannel.open(copy, StandardOpenOption.CREATE, StandardOpenOption.WRITE)) {
                long moved = src.transferTo(0, src.size(), dst);
                System.out.println("transferTo copied " + moved + " bytes, identical: " + (Files.mismatch(file, copy) == -1));
            }

            // 4. Memory-mapped file: edit the file through memory
            Path text = dir.resolve("mapped.txt");
            Files.writeString(text, "hello mapped world");
            uppercaseFirstLetter(text);
            System.out.println("after mapped write: " + Files.readString(text));

            // 5. Selector: one thread waits for readiness on a non-blocking channel
            Pipe pipe = Pipe.open();
            pipe.source().configureBlocking(false);
            try (Selector selector = Selector.open()) {
                pipe.source().register(selector, SelectionKey.OP_READ);
                Thread writer = new Thread(() -> {
                    try {
                        pipe.sink().write(StandardCharsets.UTF_8.encode("ready via selector"));
                        pipe.sink().close();
                    } catch (IOException e) {
                        throw new IllegalStateException(e);
                    }
                });
                writer.start();
                StringBuilder received = new StringBuilder();
                ByteBuffer chunk = ByteBuffer.allocate(8);
                boolean open = true;
                while (open) {
                    selector.select();                                       // blocks until something is ready
                    selector.selectedKeys().clear();
                    int n;
                    while ((n = pipe.source().read(chunk)) > 0) {            // non-blocking: returns 0 when drained
                        chunk.flip();
                        received.append(StandardCharsets.UTF_8.decode(chunk));
                        chunk.clear();
                    }
                    open = n != -1;                                          // -1: the writer closed the pipe
                }
                writer.join();
                pipe.source().close();
                System.out.println("selector loop received: " + received + " (in 8-byte chunks)");
            }
        } finally {
            try (Stream<Path> all = Files.walk(dir)) {
                for (Path p : all.sorted(Comparator.reverseOrder()).toList()) {
                    Files.delete(p);
                }
            }
        }
    }
}
```

## Output

```text title="Output" output="NioDemo.java"
allocate(8)   pos=0 lim=8 cap=8
put a,b,c     pos=3 lim=8 cap=8
flip()        pos=0 lim=3 cap=8
get, get      read 'ab', pos=2 lim=3 cap=8
compact()     pos=1 lim=8 cap=8, first byte now 'c'
clear()       pos=0 lim=8 cap=8
typed: int 258, double 1.5; 258 big-endian bytes 1,2 vs little-endian first byte 2
heap buffer hasArray=true; direct buffer isDirect=true, hasArray=false
gathering write: 18 bytes, file size 18
read back: HDR:hello channels
positional read at 4: hello
transferTo copied 18 bytes, identical: true
after mapped write: Hello mapped world
selector loop received: ready via selector (in 8-byte chunks)
```

- The cursor values trace the state machine exactly:
  - after writing three bytes `pos=3`;
  - `flip()` set `lim=3, pos=0` for reading;
  - after reading two bytes, `compact()` moved the unread `c` to index 0 and set `pos=1` to continue writing;
  - `clear()` reset the cursors without erasing anything.
- 258 is `0x00000102`: big-endian stores `01 02` at the end; little-endian puts `02` first. Direct buffers have no backing array.
- A single gathering `write` stored the header and the body. Reading needed a `flip()` before decoding, and a positional read jumped to byte 4 without moving the channel's position.
- `transferTo` produced an identical copy; a write into the mapped buffer changed the file on disk.
- The selector woke the single reading thread when data was available. Non-blocking reads returned the data in 8-byte chunks until the writer closed the pipe.

## Real-world application

- **Netty, gRPC, Tomcat NIO and Kafka**: selectors, direct (pooled) buffers and `transferTo` (Kafka serves log segments to consumers with zero-copy `sendfile`).
- **Databases and search engines**: Lucene and Elasticsearch, Chronicle Map and many embedded stores memory-map their files for fast random access, relying on the OS page cache.
- **Binary formats and protocols**: `ByteBuffer.getInt`/`putLong` with explicit byte order for file headers, network packets and fixed-width records.
- **Large-file processing**: `FileChannel` positional reads for random access, and `transferTo` for efficient copies and uploads.
- **Off-heap caches**: direct buffers or the FFM API (Java 22) keep large data out of the GC's way.

## Common mistakes

- **Forgetting `flip()`** between writing into a buffer and reading from it, or `clear()`/`compact()` before refilling it.
- **Assuming `read`/`write` transfer the whole buffer.** Loop until done (`while (buf.hasRemaining()) ch.write(buf);`).
- **Allocating direct buffers per request**: they're expensive and freed late, which leads to direct-memory OOMs. Pool them, or use heap buffers.
- **Expecting `MappedByteBuffer` to be unmapped on `close()`.** The mapping lives until GC; on Windows the file can't be deleted while it's mapped.
- **Mixing byte orders** with files or protocols written by other systems.
- **Busy-looping on non-blocking channels** instead of using a selector, or forgetting to clear `selectedKeys()`.
- **Writing selector-based servers by hand** for application code, when Netty or virtual threads with blocking sockets are simpler.

## Interview questions

**Q1. Explain `position`, `limit`, `capacity` and `flip()`.**

````reveal title="Answer"
Capacity is the buffer's fixed size. Position is the index of the next element to read or write. Limit is the first index that must not be read or written. While filling, position advances and limit equals capacity. `flip()` sets limit to the current position and position to 0, so you can read exactly what was written. `clear()` resets for filling again (position 0, limit = capacity) without erasing data, and `compact()` keeps unread data by moving it to the front.
````

**Q2. Heap vs direct `ByteBuffer`?**

````reveal title="Answer"
A heap buffer wraps a Java `byte[]`: cheap to allocate, GC-managed, but native I/O must copy it into a temporary direct buffer. A direct buffer lives in native memory, so the OS can read and write it without that copy. It's better for long-lived I/O buffers, but expensive to allocate, limited by `-XX:MaxDirectMemorySize`, and freed only when its Java object is collected (via a `Cleaner`). Pool direct buffers; don't create them per request.
````

**Q3. What is a memory-mapped file, and when would you use one?**

````reveal title="Answer"
`FileChannel.map` maps a region of a file into the process's virtual memory. The returned `MappedByteBuffer` reads and writes the file's pages directly through the OS page cache, loaded on demand by page faults and written back by the OS (or `force()`). Use it for large files with random access (indexes, databases), fast sequential scans, or inter-process shared memory. Caveats: the mapping can't be explicitly unmapped before GC (use FFM `Arena`s in Java 22+), it consumes address space, and I/O errors surface as unexpected exceptions on memory access.
````

**Q4. What is zero-copy, and how does Java expose it?**

````reveal title="Answer"
Transferring data between a file and a socket (or between files) without copying it through user-space buffers. The kernel moves pages from the page cache to the destination (`sendfile`). Java exposes it through `FileChannel.transferTo` and `transferFrom`, which use those system calls when available. Kafka uses this to serve log data to consumers efficiently.
````

**Q5. What is a `Selector`, and is it still needed with virtual threads?**

````reveal title="Answer"
A selector multiplexes many non-blocking channels in one thread: channels register interest (`OP_ACCEPT`, `OP_READ`, `OP_WRITE`), `select()` blocks until some are ready, and the thread handles only the ready keys. This let NIO servers handle many thousands of connections with few threads. With Java 21's virtual threads, a simple blocking thread-per-connection design scales similarly, because the JDK itself uses the poller underneath. Selectors remain relevant for frameworks (Netty) and event-loop architectures.
````

## Hands-on exercise

Build a **fixed-length record file** with random access:
- each record is 16 bytes: `int id` (4), `double price` (8) and `int stock` (4);
- write 1,000 records (`id = i`, `price = i * 1.25`, `stock = i % 7`) with a `FileChannel` and one reused buffer;
- read **record #730 directly** with a positional read at offset `730 × 16`, without reading the rest;
- update its stock in place with a positional write of 4 bytes at `730 × 16 + 12`, and read it back;
- print the file size, and delete the file.

````hint title="Hint"
Write: `buf.clear(); buf.putInt(i).putDouble(i * 1.25).putInt(i % 7); buf.flip(); while (buf.hasRemaining()) ch.write(buf);`. Read: `ch.read(rec, 730L * 16)`, then `rec.flip()` and `getInt()`/`getDouble()`/`getInt()`. Update: `ch.write(ByteBuffer.allocate(4).putInt(99).flip(), 730L * 16 + 12)`.
````

````solution title="Solution"
```java title="RecordFile.java" file="RecordFile.java"
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

public class RecordFile {
    static final int RECORD = 16;                         // int id + double price + int stock

    static String read(FileChannel ch, int index) throws IOException {
        ByteBuffer rec = ByteBuffer.allocate(RECORD);
        ch.read(rec, (long) index * RECORD);               // positional: jump straight to the record
        rec.flip();
        return "id=" + rec.getInt() + " price=" + rec.getDouble() + " stock=" + rec.getInt();
    }

    public static void main(String[] args) throws IOException {
        Path file = Files.createTempFile("records", ".bin");
        try (FileChannel ch = FileChannel.open(file, StandardOpenOption.READ, StandardOpenOption.WRITE)) {
            ByteBuffer buf = ByteBuffer.allocate(RECORD);
            for (int i = 0; i < 1_000; i++) {
                buf.clear();
                buf.putInt(i).putDouble(i * 1.25).putInt(i % 7);
                buf.flip();
                while (buf.hasRemaining()) {
                    ch.write(buf);
                }
            }
            System.out.println("file size: " + ch.size() + " bytes (1,000 x 16)");
            System.out.println("record 730: " + read(ch, 730));

            ByteBuffer newStock = ByteBuffer.allocate(4).putInt(99);
            newStock.flip();
            ch.write(newStock, 730L * RECORD + 12);            // update one field in place
            System.out.println("after update: " + read(ch, 730));
            System.out.println("neighbour untouched: " + read(ch, 731));
        } finally {
            Files.delete(file);
        }
    }
}
```

```text title="Output" output="RecordFile.java"
file size: 16000 bytes (1,000 x 16)
record 730: id=730 price=912.5 stock=2
after update: id=730 price=912.5 stock=99
neighbour untouched: id=731 price=913.75 stock=3
```

Fixed-size records turn "find record *n*" into arithmetic (`n × 16`), so reads and updates touch only the bytes they need, whatever the file size. That's the basic idea behind database pages and index files.
````

## Knowledge check

```quiz
? You put 3 bytes into an 8-byte buffer and call flip(). What are position and limit?
+ position 0, limit 3
- position 3, limit 8
- position 0, limit 8
> flip prepares exactly the written bytes for reading.

? What does compact() do?
+ Moves unread bytes to the start and positions after them for more writing
- Frees unused capacity
- Erases the buffer
> Use it when a partial read leaves leftover bytes.

? Which allocation lives outside the Java heap?
+ ByteBuffer.allocateDirect(n)
- ByteBuffer.allocate(n)
- ByteBuffer.wrap(array)
> Direct buffers count against MaxDirectMemorySize.

? What does FileChannel.transferTo enable?
+ Copying between channels, potentially with zero-copy sendfile
- Converting bytes to characters
- Non-blocking file reads
> The data needn't pass through user-space buffers.

? Why might a channel.write(buffer) call need to be in a loop?
+ It may write fewer bytes than remain in the buffer
- It always writes one byte
- Channels require a write per buffer element
> Loop while buffer.hasRemaining().
```

## Key takeaways

- NIO = **channels + buffers**. Master the **position/limit/capacity** cursors: `flip()` before reading, `clear()`/`compact()` before refilling.
- **Heap** buffers are cheap and GC'd; **direct** buffers avoid copies for I/O but are costly and off-heap, so pool them.
- **`FileChannel`**: positional reads and writes, scatter/gather, **`transferTo`** (zero-copy), **`map`** (memory-mapped files), file locks.
- **Selectors** let one thread serve many non-blocking channels, the basis of Netty-style servers. Virtual threads make blocking code competitive again.
- Loop on partial reads and writes, mind the byte order, and remember mapped files stay mapped until GC.
