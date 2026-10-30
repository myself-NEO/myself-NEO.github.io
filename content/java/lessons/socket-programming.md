## Concept explanation

### TCP in one paragraph

**TCP** gives two programs a **reliable, ordered, bidirectional byte stream** over the network. Data arrives complete and in order, or the connection fails. A **server** listens on a port; a **client** connects to `host:port`. The resulting connection is identified by both endpoints. TCP doesn't preserve message boundaries: it's one continuous stream, so the **application protocol** must define where messages begin and end (newline-terminated lines, length prefixes, HTTP headers…).

### The Java API (`java.net`)

| Class | Role |
|---|---|
| `ServerSocket` | listens on a port; `accept()` blocks until a client connects, then returns a `Socket` for that client |
| `Socket` | one end of a connection: `getInputStream()`, `getOutputStream()`, `close()` |
| `InetSocketAddress` | host + port; `InetAddress.getLoopbackAddress()` for localhost |

```java
try (ServerSocket server = new ServerSocket(8080)) {
    while (true) {
        Socket client = server.accept();                    // one per connection
        executor.submit(() -> handle(client));              // serve concurrently
    }
}
```

The streams are byte streams, so wrap them: `BufferedReader(InputStreamReader(in, UTF_8))` for line protocols, `DataInputStream` for binary, and always buffer.

### Serving many clients

`accept()` and reads **block**, so one thread can't serve several clients with plain sockets. The options:

| Model | Notes |
|---|---|
| a thread per connection (platform) | simple; limited to thousands of connections |
| a bounded thread pool | protects the server; slow clients occupy threads |
| **a virtual thread per connection** (Java 21+) | simple blocking code that scales to very many connections |
| NIO selectors / Netty event loops | few threads, non-blocking; more complex; used by high-performance frameworks |

### Timeouts and failure modes

A network call without a timeout can hang **forever**: a dead peer, a dropped packet, a half-open connection.

| Setting | Effect |
|---|---|
| `socket.connect(addr, connectTimeoutMs)` | fail if the connection can't be established in time (`SocketTimeoutException`) |
| `socket.setSoTimeout(ms)` | each blocking `read` fails with `SocketTimeoutException` after that long without data |
| `ConnectException: Connection refused` | nothing listening on that port |
| `SocketException: Connection reset` / EOF (`read` returns −1) | the peer closed or crashed |

Also useful: `setTcpNoDelay(true)` (disable Nagle's algorithm for small interactive messages), `setKeepAlive(true)`, and `shutdownOutput()` (half-close: "I'm done sending").

### Higher level: `java.net.http.HttpClient` (Java 11)

For HTTP, don't hand-roll sockets. `HttpClient` supports HTTP/1.1 and HTTP/2, TLS, timeouts, redirects, and both sync and async APIs:

```java
HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
HttpRequest request = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(5)).GET().build();
HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
client.sendAsync(request, BodyHandlers.ofString()).thenApply(HttpResponse::body);   // CompletableFuture
```

## Internal working

- **The kernel does the TCP work.**
  - `new ServerSocket(port)` performs `socket()` + `bind()` + `listen()` with a **backlog** queue: the kernel completes handshakes for waiting clients even before `accept()` is called.
  - `accept()` dequeues one connection.
  - `Socket.connect` performs the three-way handshake (SYN, SYN-ACK, ACK).
- **Ports**: port `0` asks the OS for any free **ephemeral** port (`getLocalPort()` tells you which), which is ideal for tests. Binding to the loopback address keeps a server off the network.
- **Reads and writes go through kernel buffers.** `write` returns once data is copied to the send buffer, not when the peer receives it. `read` returns whatever has arrived, possibly part of a message, which is why line or length framing matters.
- **Closing**:
  - `close()` sends FIN; the peer's `read` returns −1 (`readLine` returns `null`);
  - an abort (process killed, `setSoLinger(true, 0)`) sends RST, which shows up as "Connection reset";
  - closing a socket's stream closes the socket.
- **The java.net implementation** was rewritten in JDK 13 (JEP 353) on top of NIO, which allows blocking socket operations on **virtual threads** to park the virtual thread instead of blocking an OS thread.
- **The JDK's built-in HTTP server** (`com.sun.net.httpserver.HttpServer`, in the `jdk.httpserver` module) is handy for tests and tools. `jwebserver` (Java 18) serves static files from the command line.

## Visual representation

```text title="A line-based echo protocol over TCP"
  client                                   server (127.0.0.1:port)
  ------                                   ----------------------------------------------
                                           ServerSocket.bind + listen (backlog)
  Socket.connect  --- SYN/SYN-ACK/ACK -->  accept() returns Socket  -> handed to a worker thread
  "UPPER hello\n"  ---------------------->  readLine() = "UPPER hello"
                   <----------------------  "HELLO\n"
  "ADD 2 3\n"      ---------------------->  "5\n"
  "QUIT\n"         ---------------------->  "BYE\n", close()  (FIN)
  readLine() == null  <- end of stream

  timeouts:  connect(addr, 1000)   setSoTimeout(500): read() waits at most 500 ms
```

## Java code example

The server and clients run in the same program, on the loopback address and an OS-assigned port, so it works offline and never collides with other services.

```java title="SocketDemo.java" file="SocketDemo.java"
import com.sun.net.httpserver.HttpServer;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.net.ConnectException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

public class SocketDemo {
    static final InetAddress LOCALHOST = InetAddress.getLoopbackAddress();

    static String respond(String line) {
        String[] parts = line.split(" ", 2);
        return switch (parts[0]) {
            case "UPPER" -> parts[1].toUpperCase();
            case "ADD" -> {
                String[] nums = parts[1].split(" ");
                yield String.valueOf(Integer.parseInt(nums[0]) + Integer.parseInt(nums[1]));
            }
            case "QUIT" -> "BYE";
            default -> "ERROR unknown command " + parts[0];
        };
    }

    static void handle(Socket client) {
        try (client;
             BufferedReader in = new BufferedReader(new InputStreamReader(client.getInputStream(), StandardCharsets.UTF_8));
             PrintWriter out = new PrintWriter(client.getOutputStream(), true, StandardCharsets.UTF_8)) {
            for (String line = in.readLine(); line != null; line = in.readLine()) {
                String reply = respond(line);
                out.println(reply);
                if (reply.equals("BYE")) {
                    return;                                       // closes the connection
                }
            }
        } catch (IOException e) {
            // client went away: nothing else to do for this connection
        }
    }

    static List<String> session(int port, String... commands) throws IOException {
        List<String> replies = new ArrayList<>();
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(LOCALHOST, port), 1_000);   // connect timeout
            socket.setSoTimeout(2_000);                                      // read timeout
            BufferedReader in = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
            PrintWriter out = new PrintWriter(socket.getOutputStream(), true, StandardCharsets.UTF_8);
            for (String command : commands) {
                out.println(command);
                replies.add(in.readLine());
            }
            replies.add("after QUIT the server closed: " + (in.readLine() == null));
        }
        return replies;
    }

    public static void main(String[] args) throws Exception {
        ExecutorService workers = Executors.newFixedThreadPool(8);   // Java 21+: newVirtualThreadPerTaskExecutor()
        try (ServerSocket server = new ServerSocket(0, 50, LOCALHOST)) {
            int port = server.getLocalPort();                       // OS-assigned ephemeral port
            Thread acceptor = new Thread(() -> {
                while (!server.isClosed()) {
                    try {
                        Socket client = server.accept();
                        workers.submit(() -> handle(client));
                    } catch (IOException e) {
                        return;                                     // server socket closed
                    }
                }
            }, "acceptor");
            acceptor.start();

            // 1. One client session
            System.out.println("session: " + session(port, "UPPER hello sockets", "ADD 2 3", "PING", "QUIT"));

            // 2. Many concurrent clients
            ExecutorService clients = Executors.newFixedThreadPool(5);
            List<Future<String>> results = new ArrayList<>();
            for (int i = 1; i <= 5; i++) {
                int n = i;
                results.add(clients.submit(() -> session(port, "ADD " + n + " " + (n * 10), "QUIT").get(0)));
            }
            List<String> sums = new ArrayList<>();
            for (Future<String> f : results) {
                sums.add(f.get());
            }
            System.out.println("5 concurrent clients got: " + sums);
            clients.shutdown();
        }

        // 3. A read timeout: the server accepts but never answers
        try (ServerSocket silent = new ServerSocket(0, 50, LOCALHOST);
             Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(LOCALHOST, silent.getLocalPort()), 1_000);
            socket.setSoTimeout(300);
            long start = System.nanoTime();
            try {
                socket.getInputStream().read();
            } catch (SocketTimeoutException e) {
                System.out.println("read timed out after >= 300 ms: " + ((System.nanoTime() - start) / 1_000_000 >= 290));
            }
        }

        // 4. Nothing listening: connection refused
        int closedPort;
        try (ServerSocket temp = new ServerSocket(0, 50, LOCALHOST)) {
            closedPort = temp.getLocalPort();
        }
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(LOCALHOST, closedPort), 1_000);
        } catch (ConnectException e) {
            System.out.println("connecting to a closed port -> ConnectException");
        }

        // 5. Higher level: java.net.http.HttpClient against the JDK's built-in HTTP server
        HttpServer http = HttpServer.create(new InetSocketAddress(LOCALHOST, 0), 0);
        http.createContext("/hello", exchange -> {
            byte[] body = "{\"message\":\"hello\"}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            try (var os = exchange.getResponseBody()) {
                os.write(body);
            }
        });
        http.start();
        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + http.getAddress().getPort() + "/hello"))
                .timeout(Duration.ofSeconds(2)).GET().build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        System.out.println("HttpClient: status " + response.statusCode() + ", content-type "
                + response.headers().firstValue("content-type").orElse("?") + ", body " + response.body());
        String asyncBody = client.sendAsync(request, HttpResponse.BodyHandlers.ofString()).thenApply(HttpResponse::body).join();
        System.out.println("sendAsync body: " + asyncBody);
        http.stop(0);
        workers.shutdownNow();
    }
}
```

## Output

```text title="Output" output="SocketDemo.java"
session: [HELLO SOCKETS, 5, ERROR unknown command PING, BYE, after QUIT the server closed: true]
5 concurrent clients got: [11, 22, 33, 44, 55]
read timed out after >= 300 ms: true
connecting to a closed port -> ConnectException
HttpClient: status 200, content-type application/json, body {"message":"hello"}
sendAsync body: {"message":"hello"}
```

- One client ran a whole session over a single connection: each newline-terminated command got one reply, an unknown command got an error, and after `QUIT` the server closed the socket, which the client saw as end of stream (`readLine()` returned `null`).
- Five clients were served **concurrently**: the acceptor thread handed each connection to a worker, so one slow client couldn't block the others.
- `setSoTimeout(300)` turned an endless wait on a silent server into a `SocketTimeoutException`. Connecting to a port with no listener failed immediately with `ConnectException`.
- `HttpClient` handled HTTP framing, headers and bodies, both synchronously and asynchronously (`sendAsync` returns a `CompletableFuture`).

## Real-world application

- **Most services use frameworks**: Spring MVC/WebFlux, Netty, gRPC and Kafka clients all sit on sockets. Understanding sockets explains their timeouts, connection pools and failure modes.
- **Timeouts and pools in production clients**: JDBC drivers, HTTP clients and Redis clients all need connect and read timeouts. A missing read timeout is a classic cause of threads stuck forever on a dead dependency.
- **Custom protocols**: line-based (SMTP, Redis RESP, memcached text), length-prefixed binary (Kafka, many game and trading protocols), or framed messages over TLS (`SSLSocket`).
- **Tests and tooling**: servers on port 0 and the loopback address for integration tests; the JDK `HttpServer` or WireMock to stub HTTP dependencies.
- **Virtual threads**: thread-per-connection servers (and blocking clients) become a viable high-concurrency design on Java 21+.

## Common mistakes

- **No timeouts**: `connect`/`read` without limits hang threads forever on network failures.
- **Assuming one `read` returns one message.** TCP is a stream, so frame messages (newlines, length prefixes) and loop until a whole message has arrived.
- **Serving clients on the accept thread**, so one slow client blocks everyone. Hand connections to workers or virtual threads.
- **Not closing sockets** (resource leaks, `Too many open files`), or closing one side's stream and unknowingly closing the socket.
- **Default charsets on socket readers and writers.** Specify UTF-8 on both ends.
- **Unbuffered streams** with many small writes, which become a packet or system call each. Buffer, and set `TCP_NODELAY` deliberately.
- **Binding test servers to fixed ports** (collisions in CI) or to all interfaces when only localhost is needed.
- **Writing an HTTP client by hand** instead of using `java.net.http.HttpClient`.

## Interview questions

**Q1. How do you write a simple TCP server in Java that handles many clients?**

````reveal title="Answer"
1. Create a `ServerSocket` bound to a port.
2. Loop on `accept()`, which blocks until a client connects and returns a `Socket`.
3. Hand each socket to a worker: an executor task (bounded pool) or, on Java 21+, a virtual thread per connection.
4. In the worker, wrap the streams in buffered readers and writers with an explicit charset, implement the framing (for example line-based), set `setSoTimeout`, and close the socket in `finally` or try-with-resources.

For very high connection counts with few threads, use NIO selectors or Netty.
````

**Q2. Why are timeouts essential for network code, and which ones exist?**

````reveal title="Answer"
Without timeouts, a dead or slow peer can block a thread forever. TCP may not detect a vanished peer for hours, and under load the stuck threads exhaust the pool. Java offers:
- the connect timeout (`socket.connect(addr, ms)`, or `HttpClient.Builder.connectTimeout`);
- the read timeout (`setSoTimeout`, or `HttpRequest.timeout`);
- application-level deadlines (`CompletableFuture.orTimeout`, executor timeouts).

Set all of them deliberately, together with retries and back-off.
````

**Q3. Does one `read()` from a socket return one message?**

````reveal title="Answer"
Not necessarily. TCP is a byte stream without message boundaries: one `write` can arrive split across several `read`s, and several writes can arrive in one. Protocols must define framing: newline-terminated lines (`BufferedReader.readLine`), length-prefixed messages (`DataInputStream.readInt` then `readFully`), or delimiters with escaping. Readers must loop until a complete message is assembled.
````

**Q4. What do `ConnectException`, `SocketTimeoutException` and "Connection reset" mean?**

````reveal title="Answer"
- `ConnectException: Connection refused`: nothing is listening at that address and port (or a firewall rejected the connection).
- `SocketTimeoutException`: a connect or read didn't complete within the configured timeout.
- `SocketException: Connection reset`: the peer aborted the connection with an RST (a crash, a forced close, or a write to a connection the peer already closed).

A graceful close shows up instead as end of stream: `read()` returns −1 and `readLine()` returns `null`.
````

**Q5. When would you use `HttpClient` instead of raw sockets?**

````reveal title="Answer"
Whenever the protocol is HTTP, which covers most service communication. `java.net.http.HttpClient` (Java 11) implements HTTP/1.1 and HTTP/2, TLS, redirects, authentication hooks, connection pooling, timeouts, and sync or async (`CompletableFuture`) APIs, plus streaming body handlers. Raw sockets are for custom TCP protocols, or for learning how things work underneath. Frameworks (Spring `RestClient`/`WebClient`, OkHttp, Apache HttpClient) offer even more conveniences.
````

## Hands-on exercise

Build a tiny **key–value server** over TCP with a line protocol:
- `SET key value` → `OK`
- `GET key` → the value, or `NOT_FOUND`
- `COUNT` → the number of keys
- `QUIT` → `BYE`, then close the connection

Store data in a `ConcurrentHashMap`, and serve each connection on its own worker thread. Then:
1. client A sets `lang=java` and `version=25`;
2. **four clients concurrently** set `user-i = name-i`;
3. client B reads `lang`, a missing key, `user-3` and `COUNT`.

Use loopback, port 0, and timeouts.

````hint title="Hint"
Reuse the structure of the lesson's example: an acceptor thread with `server.accept()` handing sockets to an executor, a `handle(Socket)` loop with `readLine`, and a client helper that sends commands and collects replies. Split commands with `line.split(" ", 3)`. Wait for the four concurrent clients (with futures) before client B queries, so `COUNT` is deterministic: 6.
````

````solution title="Solution"
```java title="KeyValueServer.java" file="KeyValueServer.java"
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

public class KeyValueServer {
    static final InetAddress LOCALHOST = InetAddress.getLoopbackAddress();
    static final Map<String, String> STORE = new ConcurrentHashMap<>();

    static String execute(String line) {
        String[] p = line.split(" ", 3);
        return switch (p[0]) {
            case "SET" -> {
                STORE.put(p[1], p[2]);
                yield "OK";
            }
            case "GET" -> STORE.getOrDefault(p[1], "NOT_FOUND");
            case "COUNT" -> String.valueOf(STORE.size());
            case "QUIT" -> "BYE";
            default -> "ERROR";
        };
    }

    static void serve(Socket socket) {
        try (socket;
             BufferedReader in = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
             PrintWriter out = new PrintWriter(socket.getOutputStream(), true, StandardCharsets.UTF_8)) {
            socket.setSoTimeout(5_000);
            for (String line = in.readLine(); line != null; line = in.readLine()) {
                String reply = execute(line);
                out.println(reply);
                if (reply.equals("BYE")) {
                    return;
                }
            }
        } catch (IOException e) {
            // connection dropped
        }
    }

    static List<String> client(int port, String... commands) throws IOException {
        List<String> replies = new ArrayList<>();
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(LOCALHOST, port), 1_000);
            socket.setSoTimeout(2_000);
            BufferedReader in = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
            PrintWriter out = new PrintWriter(socket.getOutputStream(), true, StandardCharsets.UTF_8);
            for (String c : commands) {
                out.println(c);
                replies.add(in.readLine());
            }
        }
        return replies;
    }

    public static void main(String[] args) throws Exception {
        ExecutorService workers = Executors.newCachedThreadPool();
        try (ServerSocket server = new ServerSocket(0, 50, LOCALHOST)) {
            int port = server.getLocalPort();
            Thread acceptor = new Thread(() -> {
                while (!server.isClosed()) {
                    try {
                        Socket s = server.accept();
                        workers.submit(() -> serve(s));
                    } catch (IOException e) {
                        return;
                    }
                }
            });
            acceptor.start();

            System.out.println("client A: " + client(port, "SET lang java", "SET version 25", "QUIT"));

            ExecutorService clients = Executors.newFixedThreadPool(4);
            List<Future<List<String>>> writes = new ArrayList<>();
            for (int i = 1; i <= 4; i++) {
                int n = i;
                writes.add(clients.submit(() -> client(port, "SET user-" + n + " name-" + n, "QUIT")));
            }
            for (Future<List<String>> f : writes) {
                f.get();
            }
            clients.shutdown();
            System.out.println("4 concurrent clients stored their keys");

            System.out.println("client B: " + client(port, "GET lang", "GET missing", "GET user-3", "COUNT", "QUIT"));
        }
        workers.shutdownNow();
    }
}
```

```text title="Output" output="KeyValueServer.java"
client A: [OK, OK, BYE]
4 concurrent clients stored their keys
client B: [java, NOT_FOUND, name-3, 6, BYE]
```

The server is a minimal Redis: a text protocol, one worker per connection, and a thread-safe map shared by all workers. Each client sees the others' writes because the map is concurrent and the clients ran in a known order.
````

## Knowledge check

```quiz
? What does ServerSocket.accept() do?
+ Blocks until a client connects, then returns a Socket for that client
- Sends data to all connected clients
- Accepts data from the client
> Each accepted Socket is one connection.

? A client calls readLine() and the server closes the connection gracefully. What does readLine() return?
+ null
- An empty string
- It throws SocketTimeoutException
> End of stream is signalled by -1 / null.

? Why should a server hand each accepted connection to another thread (or virtual thread)?
+ Reads block; serving on the accept thread lets one slow client stall all others
- Sockets can only be read from non-main threads
- Each socket needs its own JVM thread by specification
> Use a pool or, on Java 21+, virtual threads.

? What does socket.setSoTimeout(500) do?
+ Makes blocking reads throw SocketTimeoutException after 500 ms without data
- Closes the socket after 500 ms
- Limits the connect time to 500 ms
> Use connect(address, timeout) for the connect timeout.

? Why bind test servers to port 0?
+ The OS assigns a free ephemeral port, avoiding collisions
- Port 0 is faster
- Port 0 doesn't need a firewall rule
> Read the actual port with getLocalPort().
```

## Key takeaways

- TCP gives reliable, ordered **byte streams**: `ServerSocket.accept()` per connection, `Socket` streams for I/O, **you define the message framing**.
- Serve each connection on a worker (a pool, or a **virtual thread** on Java 21+); never on the accept thread.
- **Always set timeouts** (`connect(addr, ms)`, `setSoTimeout`). Know refused vs timeout vs reset vs end of stream.
- Buffer and set the charset on socket streams; close sockets with try-with-resources; use port 0 and the loopback address in tests.
- For HTTP, use **`java.net.http.HttpClient`** (sync and async), not raw sockets.
