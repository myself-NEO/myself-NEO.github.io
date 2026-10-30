## Concept explanation

### Two families

`java.io` has two parallel hierarchies:

| | **Byte streams** | **Character streams** |
|---|---|---|
| Base types | `InputStream` / `OutputStream` | `Reader` / `Writer` |
| Unit | `byte` (raw binary) | `char` (UTF-16 code units: text) |
| Use for | images, archives, network protocols, serialized objects, anything binary | text: CSV, JSON, logs, config |
| Bridges | `InputStreamReader(in, charset)` decodes bytes → chars; `OutputStreamWriter(out, charset)` encodes chars → bytes | |

Text on disk or on the wire is **always bytes**. Turning characters into bytes needs a **charset** (an encoding):
- **UTF-8**: 1–4 bytes per character; ASCII-compatible; the default since Java 18.
- **ISO-8859-1**: 1 byte per character; only 256 characters.
- **UTF-16**: 2 or 4 bytes per character.

Reading bytes with the wrong charset produces **mojibake** (`Ã©` instead of `é`). Characters the target charset can't represent become `?`. So **always name the charset** (`StandardCharsets.UTF_8`), especially for code that must run on JDKs before 18, where the default was the platform's.

### The decorator design

`java.io` is the textbook **Decorator pattern**:
- **concrete sources and sinks**: `FileInputStream`, `ByteArrayOutputStream`, `Socket.getInputStream()`;
- **decorators** (`FilterInputStream`/`FilterOutputStream` subclasses, `BufferedReader`…) that wrap another stream and add behaviour.

You compose capabilities by nesting:

```java
try (DataOutputStream out = new DataOutputStream(          // typed primitives
        new BufferedOutputStream(                          // fewer system calls
            new GZIPOutputStream(                          // compression
                Files.newOutputStream(path))))) {          // the actual file
    out.writeInt(42);
}
```

Closing the **outermost** stream closes the whole chain, flushing buffers on the way down.

| Decorator | Adds |
|---|---|
| `BufferedInputStream`/`BufferedOutputStream`, `BufferedReader`/`BufferedWriter` | an in-memory buffer: far fewer calls to the underlying stream; `readLine()` |
| `DataInputStream`/`DataOutputStream` | big-endian primitives and `writeUTF` |
| `ObjectInputStream`/`ObjectOutputStream` | serialization (next lessons) |
| `GZIPInputStream`/`GZIPOutputStream`, `CheckedInputStream`/`CheckedOutputStream` | compression; checksums (CRC32) |
| `PrintStream`/`PrintWriter` | `print`/`printf` convenience, swallowing `IOException`s (check `checkError()`) |
| `InputStreamReader`/`OutputStreamWriter` | the byte ↔ char bridge, with a charset |

### Why buffering matters

Each `read()`/`write()` on a file or socket stream can become a **system call**: a switch into the kernel costing microseconds. Writing a file byte by byte means millions of system calls. A buffer (8 KB by default) collects data in memory and passes it down in large chunks, often making I/O **10–100× faster**. Remember to `flush()` (or `close()`), or the last bufferful never arrives.

## Internal working

- **`FileOutputStream.write(int)`** calls a native `write(fd, …)` for that single byte. `BufferedOutputStream` keeps a `byte[8192]` and calls the underlying `write(byte[], off, len)` only when the buffer is full, or on `flush`/`close`. A write larger than the buffer goes straight through.
- **`BufferedReader`** reads 8 K characters at a time from its source and serves `read()`/`readLine()` from memory. `readLine` strips `\n`, `\r` and `\r\n`.
- **Charset decoding** is done by a `CharsetDecoder`:
  - `InputStreamReader` uses a `StreamDecoder` that reads bytes in chunks and decodes them, handling multi-byte sequences split across chunk boundaries;
  - malformed input is replaced with `U+FFFD` by default in readers, but causes `MalformedInputException` in `Files.readString`.
- **`String.getBytes(charset)` and `new String(bytes, charset)`** encode and decode in memory, with fast paths for Latin-1 and UTF-8 thanks to compact strings.
- **Modern conveniences**:
  - `InputStream.transferTo(out)` (9), `readAllBytes()` (9), `readNBytes(n)` (11);
  - `Reader.transferTo` (10);
  - `InputStream.nullInputStream()`/`OutputStream.nullOutputStream()` (11).
- **Closing**: `close()` on a decorator flushes it, then closes the wrapped stream. If a decorator's constructor throws (for example `GZIPInputStream` reading a bad header), the inner stream isn't closed automatically, which is why declaring each stream as its own try-with-resources resource is the most robust form.

## Visual representation

```text title="A decorated output chain"
  your code: out.writeInt(42); out.writeUTF("hi")
        |
  DataOutputStream        -> turns values into bytes (00 00 00 2A, 00 02 68 69)
        |
  BufferedOutputStream    -> collects bytes in an 8 KB array; passes them down in big chunks
        |
  FileOutputStream        -> native write() system calls to the OS file

  text needs a charset:   "h" + e-acute    --UTF-8-->      68 C3 A9    (3 bytes)
                                           --ISO-8859-1--> 68 E9       (2 bytes)
  decode C3 A9 as ISO-8859-1  ->  "A-tilde" + copyright sign  ("mojibake")
```

## Java code example

Non-ASCII characters are built from code points and printed as `\uXXXX` escapes, so the output doesn't depend on your console's encoding.

```java title="StreamsDemo.java" file="StreamsDemo.java"
import java.io.BufferedOutputStream;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.FilterOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

public class StreamsDemo {
    // A decorator that counts how often the stream BELOW it is called
    static final class CountingOutputStream extends FilterOutputStream {
        int calls;

        CountingOutputStream(OutputStream out) {
            super(out);
        }

        @Override
        public void write(int b) throws IOException {
            calls++;
            out.write(b);
        }

        @Override
        public void write(byte[] b, int off, int len) throws IOException {
            calls++;
            out.write(b, off, len);
        }
    }

    static String escape(String s) {
        StringBuilder sb = new StringBuilder();
        for (char c : s.toCharArray()) {
            sb.append(c < 128 ? String.valueOf(c) : String.format("\\u%04X", (int) c));
        }
        return sb.toString();
    }

    public static void main(String[] args) throws IOException {
        // 1. Characters vs bytes: the charset decides the bytes
        String text = "h" + (char) 0xE9 + "llo " + (char) 0x20AC;   // h, e-acute, llo, space, euro sign
        System.out.println("text " + escape(text) + " has " + text.length() + " chars");
        System.out.println("  UTF-8      " + text.getBytes(StandardCharsets.UTF_8).length + " bytes: "
                + HexFormat.ofDelimiter(" ").formatHex(text.getBytes(StandardCharsets.UTF_8)));
        System.out.println("  ISO-8859-1 " + text.getBytes(StandardCharsets.ISO_8859_1).length + " bytes (euro becomes '?'): "
                + escape(new String(text.getBytes(StandardCharsets.ISO_8859_1), StandardCharsets.ISO_8859_1)));
        System.out.println("  UTF-16     " + text.getBytes(StandardCharsets.UTF_16).length + " bytes (2-byte BOM + 2 per char)");
        String mojibake = new String(text.getBytes(StandardCharsets.UTF_8), StandardCharsets.ISO_8859_1);
        System.out.println("UTF-8 bytes decoded as ISO-8859-1: " + escape(mojibake) + " (mojibake)");

        // 2. The byte <-> char bridge with an explicit charset
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(bytes, StandardCharsets.UTF_8))) {
            writer.write(text);
            writer.newLine();
            writer.write("second line");
        }
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(new ByteArrayInputStream(bytes.toByteArray()), StandardCharsets.UTF_8))) {
            System.out.println("round trip: line 1 equals original: " + text.equals(reader.readLine()) + ", line 2: " + reader.readLine());
        }

        // 3. Decorators: Data + Buffered + GZIP over a byte array
        ByteArrayOutputStream sink = new ByteArrayOutputStream();
        try (DataOutputStream out = new DataOutputStream(new BufferedOutputStream(new GZIPOutputStream(sink)))) {
            out.writeInt(42);
            out.writeDouble(3.5);
            out.writeUTF("decorated");
            out.write(new byte[10_000]);                          // compresses very well
        }
        try (DataInputStream in = new DataInputStream(new GZIPInputStream(new ByteArrayInputStream(sink.toByteArray())))) {
            System.out.println("decorated chain: " + in.readInt() + ", " + in.readDouble() + ", " + in.readUTF()
                    + "; 10,023 raw bytes compressed to " + sink.size() + " bytes");
        }

        // 4. Buffering: count the calls that reach the underlying stream
        CountingOutputStream unbufferedCounter = new CountingOutputStream(OutputStream.nullOutputStream());
        for (int i = 0; i < 10_000; i++) {
            unbufferedCounter.write('x');
        }
        CountingOutputStream bufferedCounter = new CountingOutputStream(OutputStream.nullOutputStream());
        try (BufferedOutputStream buffered = new BufferedOutputStream(bufferedCounter)) {  // 8192-byte buffer
            for (int i = 0; i < 10_000; i++) {
                buffered.write('x');
            }
        }
        System.out.println("10,000 single-byte writes: unbuffered " + unbufferedCounter.calls + " calls below, buffered " + bufferedCounter.calls);

        // 5. Forgetting to flush: data stays in the buffer
        ByteArrayOutputStream target = new ByteArrayOutputStream();
        BufferedWriter pending = new BufferedWriter(new OutputStreamWriter(target, StandardCharsets.UTF_8));
        pending.write("important data");
        System.out.println("bytes in target before flush: " + target.size());
        pending.flush();
        System.out.println("bytes in target after flush: " + target.size());
        pending.close();

        // 6. Modern helpers
        BufferedReader lines = new BufferedReader(new StringReader("a\nb\nc"));
        System.out.println("lines(): " + lines.lines().toList()
                + ", readAllBytes: " + new ByteArrayInputStream(new byte[] {1, 2, 3}).readAllBytes().length
                + ", transferTo copied " + new ByteArrayInputStream(new byte[2048]).transferTo(OutputStream.nullOutputStream()) + " bytes");
    }
}
```

## Output

```text title="Output" output="StreamsDemo.java"
text h\u00E9llo \u20AC has 7 chars
  UTF-8      10 bytes: 68 c3 a9 6c 6c 6f 20 e2 82 ac
  ISO-8859-1 7 bytes (euro becomes '?'): h\u00E9llo ?
  UTF-16     16 bytes (2-byte BOM + 2 per char)
UTF-8 bytes decoded as ISO-8859-1: h\u00C3\u00A9llo \u00E2\u0082\u00AC (mojibake)
round trip: line 1 equals original: true, line 2: second line
decorated chain: 42, 3.5, decorated; 10,023 raw bytes compressed to 67 bytes
10,000 single-byte writes: unbuffered 10000 calls below, buffered 2
bytes in target before flush: 0
bytes in target after flush: 14
lines(): [a, b, c], readAllBytes: 3, transferTo copied 2048 bytes
```

- The same 7-character string is 10 bytes in UTF-8, 7 in ISO-8859-1 (where the euro sign isn't representable and became `?`), and 16 in UTF-16.
- Decoding UTF-8 bytes as ISO-8859-1 turned `é` (`C3 A9`) into `Ã©`: the classic mojibake. With the same charset on both sides, the round trip was exact.
- Three decorators were stacked over a byte array: typed values in, typed values out, and 10,023 bytes (4 + 8 + 11 + 10,000) compressed to 67.
- 10,000 single-byte writes reached the underlying stream 10,000 times unbuffered, and twice with an 8 KB buffer: one full buffer, plus the rest on close.
- Until `flush()`, the written text sat in the writer's buffer and the target was empty.

## Real-world application

- **Always specify UTF-8** for files, HTTP bodies, database exports and message payloads. Charset bugs ("works on my Mac, broken on the Windows server") came from platform defaults before Java 18.
- **Buffered I/O** around every file and socket stream, unless you already read or write large chunks. Missing buffering is a classic cause of slow exports and imports.
- **Decorator stacks** in practice: gzip-compressed log or backup files (`GZIPOutputStream`), checksummed transfers (`CheckedInputStream` + CRC32), length-prefixed binary protocols (`DataOutputStream`), encryption (`CipherOutputStream`).
- **Streaming large payloads**: `InputStream.transferTo` from an HTTP request body to a file, without loading it into memory.
- **Servlet and HTTP APIs**: request and response bodies are byte streams; frameworks wrap them in readers and writers using the declared `Content-Type` charset.

## Common mistakes

- **Using `FileReader`/`FileWriter`/`new String(bytes)`/`getBytes()` without a charset** on older JDKs, where the platform default applies.
- **Reading binary data with a `Reader`**, which corrupts it, or text with byte-level code that splits multi-byte characters.
- **Unbuffered single-byte or single-char I/O on files or sockets.**
- **Not flushing or closing writers**, losing the last buffered data, or calling `flush()` after every byte, which defeats buffering.
- **Closing an inner stream while still using the outer decorator**, or closing only the inner one: the buffered data is lost.
- **`PrintWriter`/`PrintStream` swallowing `IOException`s** silently. Check `checkError()`, or use plain writers.
- **Assuming `read(byte[])` fills the array.** It may return fewer bytes. Loop, or use `readNBytes`/`readFully`.

## Interview questions

**Q1. What's the difference between byte streams and character streams?**

````reveal title="Answer"
Byte streams (`InputStream`/`OutputStream`) move raw 8-bit bytes and are used for binary data. Character streams (`Reader`/`Writer`) move 16-bit `char`s and are used for text. The two are connected by `InputStreamReader`/`OutputStreamWriter`, which decode and encode with a charset. Since all text is stored and transmitted as bytes, the charset must match between writer and reader, so specify it explicitly (`StandardCharsets.UTF_8`).
````

**Q2. Explain the decorator pattern in `java.io`.**

````reveal title="Answer"
Base abstractions (`InputStream`, `OutputStream`, `Reader`, `Writer`) have concrete endpoints (file, byte array, socket streams) and decorators (`Filter*` subclasses, `Buffered*`, `Data*`, `GZIP*`, `Object*`, `InputStreamReader`) that wrap another instance of the same abstraction and add behaviour. Features combine by nesting, for example `new DataOutputStream(new BufferedOutputStream(new FileOutputStream(f)))`, rather than by subclassing every combination. Closing the outermost decorator flushes and closes the chain.
````

**Q3. Why does buffering speed up I/O so much?**

````reveal title="Answer"
Unbuffered file and socket streams turn each `read`/`write` call into a system call (a user-kernel transition costing microseconds) and possibly a device operation. A buffered stream accumulates data in an in-memory array (8 KB by default) and transfers it in large chunks, reducing thousands of calls to a handful. In the lesson, 10,000 single-byte writes became 2 calls to the underlying stream. Remember to flush or close, so the final partial buffer is written.
````

**Q4. What is mojibake, and how do you avoid it?**

````reveal title="Answer"
Garbled text produced by decoding bytes with a different charset from the one used to encode them. For example, UTF-8 `é` (bytes `C3 A9`) decoded as ISO-8859-1 shows as `Ã©`. Avoid it by using one explicit charset end to end (UTF-8): when writing files, in HTTP `Content-Type` headers, in database connection settings, and when reading. Never rely on the platform default, which before Java 18 differed between machines.
````

**Q5. Does `InputStream.read(byte[] buf)` always fill the buffer?**

````reveal title="Answer"
No. It reads *up to* `buf.length` bytes and returns how many were actually read (or −1 at end of stream). Network and pipe streams often return partial reads. Loop until you have what you need, or use `readNBytes(buf, 0, n)`/`readNBytes(n)` (Java 9/11), `DataInputStream.readFully`, or `readAllBytes()` for small inputs.
````

## Hands-on exercise

Write two decorators of your own and compose them with JDK ones:
1. **`LineNumberingWriter extends FilterWriter`**: prefixes every line with `"001: "`, `"002: "`… Override `write(int)` and `write(char[]/String, off, len)`, and detect line starts.
2. **`UpperCaseInputStream extends FilterInputStream`**: upper-cases ASCII letters as they're read (override both `read()` and `read(byte[], int, int)`).

Use them on a `StringWriter` and a `ByteArrayInputStream`, together with `BufferedReader`/`InputStreamReader`, and print the results.

````hint title="Hint"
In the writer, keep a `boolean atLineStart = true`. In `write(int c)`, if at a line start, write the formatted prefix first, then write `c`, and set `atLineStart = (c == '\n')`. Make the array and String overloads loop over `write(int)`. In the input stream, call `super.read(b, off, len)` and then upper-case the bytes in `b[off .. off+n)`.
````

````solution title="Solution"
```java title="CustomDecorators.java" file="CustomDecorators.java"
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.FilterInputStream;
import java.io.FilterWriter;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.StringWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;

public class CustomDecorators {
    static final class LineNumberingWriter extends FilterWriter {
        private int line = 0;
        private boolean atLineStart = true;

        LineNumberingWriter(Writer out) {
            super(out);
        }

        @Override
        public void write(int c) throws IOException {
            if (atLineStart) {
                out.write(String.format("%03d: ", ++line));
            }
            out.write(c);
            atLineStart = c == '\n';
        }

        @Override
        public void write(char[] buf, int off, int len) throws IOException {
            for (int i = off; i < off + len; i++) {
                write(buf[i]);
            }
        }

        @Override
        public void write(String s, int off, int len) throws IOException {
            for (int i = off; i < off + len; i++) {
                write(s.charAt(i));
            }
        }
    }

    static final class UpperCaseInputStream extends FilterInputStream {
        UpperCaseInputStream(InputStream in) {
            super(in);
        }

        @Override
        public int read() throws IOException {
            int b = super.read();
            return b >= 'a' && b <= 'z' ? b - 32 : b;
        }

        @Override
        public int read(byte[] buf, int off, int len) throws IOException {
            int n = super.read(buf, off, len);
            for (int i = off; i < off + Math.max(n, 0); i++) {
                if (buf[i] >= 'a' && buf[i] <= 'z') {
                    buf[i] -= 32;
                }
            }
            return n;
        }
    }

    public static void main(String[] args) throws IOException {
        StringWriter target = new StringWriter();
        try (Writer out = new LineNumberingWriter(target)) {
            out.write("first line\nsecond line\n");
            out.write("third line\n");
        }
        System.out.print(target);

        byte[] data = "decorators compose\nlike lego\n".getBytes(StandardCharsets.UTF_8);
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                new UpperCaseInputStream(new ByteArrayInputStream(data)), StandardCharsets.UTF_8))) {
            reader.lines().forEach(l -> System.out.println("read: " + l));
        }
    }
}
```

```text title="Output" output="CustomDecorators.java"
001: first line
002: second line
003: third line
read: DECORATORS COMPOSE
read: LIKE LEGO
```

Each decorator does one job and knows nothing about the others. `BufferedReader` and `InputStreamReader` worked on top of the custom stream unchanged, because it's just another `InputStream`. Overriding the bulk `read(byte[], …)` is essential: buffered readers call it, not the single-byte `read()`.
````

## Knowledge check

```quiz
? Which classes should you use to read a text file?
+ A Reader (e.g. BufferedReader over InputStreamReader) with an explicit charset
- An ObjectInputStream
- A DataInputStream with readInt()
> Text needs decoding from bytes to chars with a charset.

? How many bytes does the euro sign take in UTF-8?
+ 3
- 1
- 2
> UTF-8 uses 1-4 bytes; ASCII characters use 1.

? What does wrapping a FileOutputStream in a BufferedOutputStream change?
+ Many small writes become a few large calls to the underlying stream
- The data is compressed
- Writes become thread-safe
> Buffering reduces system calls.

? You write to a BufferedWriter and the program exits without close() or flush(). What can happen?
+ The last buffered data is never written
- Nothing; writes are always immediate
- An exception is thrown at exit
> Close or flush, preferably via try-with-resources.

? Why is java.io described as using the Decorator pattern?
+ Streams wrap other streams of the same type to add behaviour such as buffering or compression
- Every stream class has a decorate() method
- Streams are annotated with @Decorator
> new DataOutputStream(new BufferedOutputStream(new FileOutputStream(f))).
```

## Key takeaways

- **Byte streams** for binary data; **character streams** for text. They're bridged by `InputStreamReader`/`OutputStreamWriter`, **always with an explicit charset** (UTF-8).
- Charset mismatches cause **mojibake**; unrepresentable characters become `?`. UTF-8 uses 1–4 bytes per character.
- `java.io` is the **Decorator pattern**: stack buffering, data, compression and checksums around a source or sink, and close the outermost stream.
- **Buffering** turns many tiny system calls into a few big ones. Flush or close to push out the last buffer.
- `read(byte[])` may return fewer bytes. Use `readNBytes`, `readAllBytes` and `transferTo`, and close everything with try-with-resources.
