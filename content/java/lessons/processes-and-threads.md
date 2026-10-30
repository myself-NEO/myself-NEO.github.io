## Concept explanation

### Process vs thread

A **process** is a running program with its **own address space**: its own heap, its own copy of every static field, its own open files. A **thread** is a path of execution **inside** a process. All threads of a process share its memory, and each has its own stack and program counter.

| | Process | Thread |
|---|---|---|
| Memory | isolated; communicates via files, sockets, pipes, shared-memory segments | **shares the heap** with the other threads of its process |
| Creation cost | high (new address space, new JVM start-up) | lower (a stack plus kernel bookkeeping) |
| Context switch | expensive (address-space switch) | cheaper |
| Failure isolation | a crash affects only that process | a fatal error or `System.exit` takes down every thread |
| Java API | `ProcessBuilder`, `ProcessHandle` | `Thread`, `ExecutorService` |

Each `java` command starts one process: one JVM, with many threads inside it, some of them yours, plus GC, JIT and housekeeping threads.

### Why threads?

- **Parallelism**: use several CPU cores at once for CPU-bound work.
- **Concurrency**: make progress on many tasks that spend most of their time *waiting* (network calls, disk, users) by overlapping the waits.
- **Responsiveness**: keep a UI or server loop responsive while background work runs.

The price is **shared mutable state**: when threads read and write the same objects, you need the tools in the rest of this stage.

### Platform threads in Java

A classic `java.lang.Thread` is a **platform thread**: a thin wrapper around an **OS thread** (1:1). The OS scheduler decides when it runs, on which core. Each one reserves a stack (about 1 MB by default) and kernel resources, so thousands are fine but hundreds of thousands aren't. Java 21's **virtual threads** remove that limit for I/O-heavy code; they're covered at the end of this stage.

### Three ways to define work

| Way | Signature | Returns a value? | Checked exceptions? |
|---|---|---|---|
| extend `Thread`, override `run()` | `void run()` | no | no |
| **`Runnable`** passed to a `Thread` (or an executor) | `void run()` | no | no |
| **`Callable<V>`** run via `FutureTask` or an executor | `V call() throws Exception` | **yes**, through a **`Future<V>`** | **yes**, wrapped in `ExecutionException` |

Prefer `Runnable`/`Callable` over subclassing `Thread`. It separates *what* to run from *how* it runs (thread, pool, virtual thread), and leaves your class free to extend something else. In real code you rarely create threads by hand: you submit tasks to an **`ExecutorService`** (see Executors).

### `start()` vs `run()`

- **`start()`** asks the JVM to create a new OS thread, which then calls `run()`.
- **Calling `run()` directly** is just an ordinary method call on the **current** thread: no concurrency at all.
- A `Thread` object can be started **only once**. A second `start()` throws `IllegalThreadStateException`.

## Internal working

- **`Thread.start()`** calls into the JVM (`JVM_StartThread`), which creates a native thread with the requested stack size, registers it, and runs `Thread.run()` on it. The `Thread` object's state changes from `NEW` to `RUNNABLE`.
- **When `run()` returns or throws**, the thread terminates, its stack is freed, and `join()`ers are notified.
- **Uncaught exceptions** go to the thread's `UncaughtExceptionHandler`, then the thread group's, then the default handler, which prints the stack trace to `System.err`. They don't crash the process, which is how failures in background threads go unnoticed.
- **`FutureTask`** implements both `Runnable` and `Future`. When run, it calls the `Callable`, stores either the result or the thrown exception, and wakes threads blocked in `get()`. `get()` rethrows a stored exception wrapped in `ExecutionException`.
- **Memory visibility**:
  - everything a thread did before `start()` is visible to the new thread;
  - everything a thread did is visible to whoever `join()`s it successfully, or receives its result through a `Future`.

  These are *happens-before* edges (Java Memory Model lesson). Without such an edge, other threads may see stale values.
- **The JVM exits** when all **non-daemon** threads have finished, or `System.exit` is called. Daemon threads are killed abruptly at that point.

## Visual representation

```text title="Two processes vs threads in one process"
  process A (JVM)                                 process B (JVM)
  +-----------------------------------------+     +---------------------------+
  | HEAP: objects, statics (one copy)       |     | HEAP: its OWN statics      |
  |   ^            ^              ^         |     |                           |
  |   |            |              |         |     |  no shared memory with A: |
  | [main stack] [worker stack] [GC thread] |     |  talk via sockets/files   |
  |  PC, frames   PC, frames                |     |                           |
  +-----------------------------------------+     +---------------------------+

  thread.start()                          thread.run()
  main ----+--------------------> main    main --> run() body --> main   (same thread, no concurrency)
           |
           +--> new OS thread: run()
```

## Java code example

```java title="ThreadBasics.java" file="ThreadBasics.java"
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.FutureTask;

public class ThreadBasics {
    static int shared = 1;                 // one copy per PROCESS, visible to all of its threads

    static class Greeter extends Thread {  // way 1: subclass Thread
        Greeter() {
            super("greeter");
        }

        @Override
        public void run() {
            System.out.println("extends Thread  -> running in " + Thread.currentThread().getName());
        }
    }

    public static void main(String[] args) throws Exception {
        if (args.length == 1) {                                        // we are the child process
            shared += 100;
            System.out.println("child process changed ITS copy to " + shared);
            return;
        }

        // 1. Processes don't share memory; threads do
        Process child = new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", "java").toString(),
                "-cp", System.getProperty("java.class.path"), "ThreadBasics", "child").redirectErrorStream(true).start();
        System.out.print(new String(child.getInputStream().readAllBytes()));
        child.waitFor();
        System.out.println("parent's copy after the child process: " + shared);
        Thread adder = new Thread(() -> shared += 100, "adder");
        adder.start();
        adder.join();                                                  // join also makes the write visible
        System.out.println("parent's copy after a THREAD changed it: " + shared);

        // 2. Three ways to define work
        Greeter greeter = new Greeter();
        greeter.start();
        greeter.join();
        Runnable task = () -> System.out.println("Runnable        -> running in " + Thread.currentThread().getName());
        Thread runner = new Thread(task, "runner");
        runner.start();
        runner.join();
        Callable<Integer> sum = () -> {
            int total = 0;
            for (int i = 1; i <= 100; i++) {
                total += i;
            }
            return total;
        };
        FutureTask<Integer> future = new FutureTask<>(sum);
        new Thread(future, "calculator").start();
        System.out.println("Callable        -> result via Future.get(): " + future.get());

        // 3. run() is a plain method call; start() creates a thread
        Thread worker = new Thread(() -> System.out.println("   body executes in: " + Thread.currentThread().getName()), "worker");
        System.out.println("worker.run():");
        worker.run();
        System.out.println("worker.start():");
        worker.start();
        worker.join();
        try {
            worker.start();
        } catch (IllegalThreadStateException e) {
            System.out.println("second start() -> IllegalThreadStateException");
        }

        // 4. Exceptions: uncaught handler vs Future
        Thread failing = new Thread(() -> {
            throw new IllegalStateException("boom");
        }, "failing");
        failing.setUncaughtExceptionHandler((t, e) -> System.out.println("uncaught in '" + t.getName() + "': " + e.getMessage()));
        failing.start();
        failing.join();
        FutureTask<Integer> failingTask = new FutureTask<>(() -> {
            throw new IllegalArgumentException("bad input");
        });
        new Thread(failingTask).start();
        try {
            failingTask.get();
        } catch (ExecutionException e) {
            System.out.println("Future.get() -> ExecutionException caused by " + e.getCause());
        }

        // 5. Splitting work across threads that write to separate slots
        int[] partial = new int[4];
        List<Thread> threads = new ArrayList<>();
        for (int w = 0; w < 4; w++) {
            int id = w;
            Thread t = new Thread(() -> {
                for (int i = id * 250 + 1; i <= (id + 1) * 250; i++) {
                    partial[id] += i;
                }
            }, "sum-" + w);
            threads.add(t);
            t.start();
        }
        for (Thread t : threads) {
            t.join();
        }
        System.out.println("4 threads summed 1..1000 = " + Arrays.stream(partial).sum() + " from parts " + Arrays.toString(partial));
    }
}
```

## Output

```text title="Output" output="ThreadBasics.java"
child process changed ITS copy to 101
parent's copy after the child process: 1
parent's copy after a THREAD changed it: 101
extends Thread  -> running in greeter
Runnable        -> running in runner
Callable        -> result via Future.get(): 5050
worker.run():
   body executes in: main
worker.start():
   body executes in: worker
second start() -> IllegalThreadStateException
uncaught in 'failing': boom
Future.get() -> ExecutionException caused by java.lang.IllegalArgumentException: bad input
4 threads summed 1..1000 = 500500 from parts [31375, 93875, 156375, 218875]
```

- The child **process** changed its own copy of `shared`; the parent's copy stayed 1. The **thread** changed the one copy the whole process shares.
- All three styles ran their body on a new thread named after the `Thread`. Only `Callable` handed back a value, through a `Future`.
- `worker.run()` executed on `main`. Only `start()` created a new thread, and only once.
- The uncaught exception didn't stop the program; it went to the handler. The `Callable`'s exception came back wrapped in `ExecutionException`.
- Each summing thread wrote to its own array slot, so no coordination was needed beyond `join()`.

## Real-world application

- **Web servers** (Tomcat, Jetty) serve each request on a pooled thread: platform threads traditionally, virtual threads since Java 21 (`spring.threads.virtual.enabled=true` in Spring Boot 3.2+).
- **Background work**: scheduled jobs, cache refreshes, sending emails asynchronously, Kafka consumers polling in their own threads.
- **Parallel computation**: splitting CPU-bound work (image processing, report generation, simulations) across cores, usually via executors, fork/join or parallel streams rather than raw threads.
- **Process isolation** is still used when failures must not spread: separate microservices, worker processes for untrusted code, or tools launched with `ProcessBuilder`.

## Common mistakes

- **Calling `run()` instead of `start()`**, and wondering why nothing runs in parallel.
- **Creating a new `Thread` per task** in a server. Use a pool or virtual threads instead.
- **Ignoring exceptions in background threads**: set an `UncaughtExceptionHandler`, or use executors and inspect the `Future`s.
- **Subclassing `Thread`** for task logic, which couples the work to the execution mechanism.
- **Sharing mutable data without synchronisation**: correctness depends on happens-before edges (`join`, `Future.get`, locks, `volatile`), not on timing.
- **Starting threads in constructors**: `this` escapes before construction finishes.

## Interview questions

**Q1. What is the difference between a process and a thread?**

````reveal title="Answer"
A process is an executing program with its own isolated address space and resources. A thread is a unit of execution within a process. Threads share the process's heap and resources, and each has its own stack and program counter. Threads are cheaper to create and switch between and communicate through shared memory, which requires synchronisation. Processes are isolated, so a crash or memory corruption in one doesn't affect others, but they must communicate through IPC.
````

**Q2. What's the difference between `start()` and `run()`?**

````reveal title="Answer"
`start()` asks the JVM to create a new thread of execution, which then invokes `run()` concurrently with the caller. Calling `run()` directly just executes the method on the current thread, like any other method call, with no new thread. A thread can be started only once; calling `start()` again throws `IllegalThreadStateException`.
````

**Q3. `Runnable` vs `Callable`?**

````reveal title="Answer"
`Runnable.run()` returns nothing and can't throw checked exceptions. `Callable<V>.call()` returns a value and may throw checked exceptions. A `Callable` is run via an `ExecutorService` (`submit`) or a `FutureTask`, and its result or exception is obtained from a `Future<V>`: `get()` returns the value, or throws `ExecutionException` wrapping the task's exception.
````

**Q4. What happens to an exception thrown inside a thread?**

````reveal title="Answer"
It terminates that thread only. It's passed to the thread's `UncaughtExceptionHandler`, or the thread group's or the default one, which by default prints the stack trace to `System.err`. Other threads keep running, and the JVM doesn't exit unless all non-daemon threads end. Tasks submitted to an executor with `submit` capture the exception in their `Future` instead, and you only see it when you call `get()`.
````

**Q5. Why prefer implementing `Runnable` over extending `Thread`?**

````reveal title="Answer"
It separates the task from the execution mechanism: the same `Runnable` can run on a new thread, a thread pool, a virtual thread or a scheduler. It leaves your class free to extend another class (Java has single inheritance) and works naturally with lambdas. Extending `Thread` is only justified when you're customising thread behaviour itself.
````

## Hands-on exercise

Count words in parallel. Split four text chunks across four threads, each running a `Callable<Map<String, Integer>>` wrapped in a `FutureTask`. Then merge the partial maps on the main thread into a sorted total, and print the five most frequent words.

Text chunks:
1. `"the quick brown fox jumps over the lazy dog"`
2. `"the dog barks and the fox runs"`
3. `"a quick brown dog and a quick fox"`
4. `"the end of the story of the fox"`

````hint title="Hint"
Each `Callable` builds its own `HashMap`, so nothing is shared while the threads run. After starting all four threads, call `future.get()` on each, which waits for that task and makes its map safely visible, then merge with `total.merge(word, count, Integer::sum)`. Sort the entries by count descending, then by word.
````

````solution title="Solution"
```java title="ParallelWordCount.java" file="ParallelWordCount.java"
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.Callable;
import java.util.concurrent.FutureTask;

public class ParallelWordCount {
    public static void main(String[] args) throws Exception {
        List<String> chunks = List.of(
                "the quick brown fox jumps over the lazy dog",
                "the dog barks and the fox runs",
                "a quick brown dog and a quick fox",
                "the end of the story of the fox");

        List<FutureTask<Map<String, Integer>>> tasks = new ArrayList<>();
        for (int i = 0; i < chunks.size(); i++) {
            String text = chunks.get(i);
            Callable<Map<String, Integer>> count = () -> {
                Map<String, Integer> local = new HashMap<>();          // confined to this thread
                for (String word : text.split(" ")) {
                    local.merge(word, 1, Integer::sum);
                }
                return local;
            };
            FutureTask<Map<String, Integer>> task = new FutureTask<>(count);
            tasks.add(task);
            new Thread(task, "counter-" + i).start();
        }

        Map<String, Integer> total = new TreeMap<>();
        for (FutureTask<Map<String, Integer>> task : tasks) {
            task.get().forEach((word, n) -> total.merge(word, n, Integer::sum));   // get() waits for the task
        }
        System.out.println("distinct words: " + total.size());
        total.entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey()))
                .limit(5)
                .forEach(e -> System.out.println(e.getKey() + " = " + e.getValue()));
    }
}
```

```text title="Output" output="ParallelWordCount.java"
distinct words: 15
the = 7
fox = 4
dog = 3
quick = 3
a = 2
```

No locks were needed: each thread worked on its own map (**thread confinement**), and the main thread combined the results only after `Future.get()` guaranteed each task had finished and its map was visible.
````

## Knowledge check

```quiz
? What do threads of the same process share?
+ The heap, including static fields
- Their stacks
- Their program counters
> Each thread has its own stack and PC; the heap is shared.

? What happens if you call thread.run() instead of thread.start()?
+ run() executes on the current thread; no new thread is created
- A new thread is created and run immediately
- It throws IllegalThreadStateException
> run() is an ordinary method call.

? Which interface lets a task return a value and throw a checked exception?
+ Callable
- Runnable
- Thread
> Results and exceptions come back through a Future.

? What does calling start() a second time on the same Thread do?
+ Throws IllegalThreadStateException
- Restarts the thread
- Does nothing
> A Thread object runs at most once.

? An exception escapes run() in a worker thread. What happens to the rest of the program?
+ Only that thread dies; the uncaught-exception handler is invoked
- The JVM exits immediately
- The exception propagates to the main thread
> Background failures are easy to miss for exactly this reason.
```

## Key takeaways

- **Processes** are isolated address spaces; **threads** share one process's heap and each has its own stack and PC. Java platform threads map 1:1 to OS threads.
- Define work with **`Runnable`** (no result) or **`Callable`** (result + checked exceptions via **`Future`**); avoid subclassing `Thread`.
- **`start()`** creates a thread; **`run()`** is just a method call; a thread starts only once.
- Uncaught exceptions kill only their thread; `Future.get()` wraps task exceptions in `ExecutionException`.
- `start`, `join` and `Future.get` create visibility guarantees; shared mutable state needs the synchronisation tools that follow.
