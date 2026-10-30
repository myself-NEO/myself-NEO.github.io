## Problem statement

Design an in-process task scheduler: application code submits tasks to run **once after a delay** or **repeatedly at a fixed rate**. Tasks run on a pool of worker threads. A failing task is retried with exponential backoff; a task can be cancelled at any time. Think of a small `ScheduledExecutorService` with retries and observable task states.

> [!TIP] Try it first
> One thread has to know **which task is due next** and sleep exactly until then — but a new task due sooner can arrive while it sleeps. Pick the data structure and the waiting mechanism before anything else.

## Clarifying questions

1. One-off and recurring tasks? Fixed rate or fixed delay?
2. If the scheduler falls behind (a long GC pause), should a recurring task run all the missed times?
3. Retries: how many, with what backoff? Do recurring tasks retry too?
4. What does cancel mean for a task that is running right now?
5. How many worker threads? Can tasks run in parallel?
6. Do we need to persist tasks across restarts?

````reveal title="Answers we'll assume"
- **One-off** (`schedule(delay)`) and **fixed-rate recurring** (`scheduleAtFixedRate(initialDelay, period)`).
- Missed runs of a recurring task are **skipped**, not replayed in a burst; the next run is the next period boundary after now.
- One-off tasks retry up to `maxAttempts` with **exponential backoff** (`b, 2b, 4b, ...`) and then end as `FAILED`. A recurring task retries the same way and, if it still fails, simply waits for its next period.
- Cancelling a scheduled task prevents its future runs; a running task finishes its current run and is not rescheduled.
- Workers are a pool supplied by the caller; different tasks run in parallel; the same task never overlaps itself.
- In memory only; persistence is a follow-up.
````

## Requirements

**Functional**

1. `schedule(name, job, delay, retry)` and `scheduleAtFixedRate(name, job, initialDelay, period, retry)` return a handle.
2. The handle exposes the task's state and `cancel()`.
3. Due tasks run on worker threads, in due-time order.
4. Retries with exponential backoff; recurring tasks continue after failures.

**Non-functional**

5. The dispatcher sleeps until the next due time — no busy polling — and wakes early when an earlier task arrives.
6. Thread-safe submission from any thread.
7. Deterministic tests: time and execution are injectable.

## Step 1 — Data structure and waiting

````reveal title="A priority queue ordered by next run time, and a condition variable"
- **`PriorityQueue<ScheduledTask>`** ordered by `nextRunAt` (ties broken by submission order): `peek` gives the next due task in O(1), `add`/`poll` cost O(log n).
- One **dispatcher thread** loops: lock; if the queue is empty, `await()`; if the head isn't due yet, `awaitNanos(timeUntilDue)`; otherwise poll every due task, unlock, and hand them to the workers.
- **Submitting a task signals the condition.** If the new task is due before the one the dispatcher is sleeping for, the dispatcher wakes, re-reads the head, and sleeps for the shorter time.
- **Cancellation is lazy:** a cancelled task stays in the queue until it reaches the head, where it is skipped. Removing from the middle of a heap is O(n); skipping is O(1).
````

## Step 2 — Task lifecycle

```states title="Scheduled task"
[*] --> SCHEDULED
SCHEDULED --> RUNNING : due and dispatched
RUNNING --> SCHEDULED : recurring (next period) or retry (backoff)
RUNNING --> DONE : one-off succeeded
RUNNING --> FAILED : one-off out of attempts
SCHEDULED --> CANCELLED : cancel
RUNNING --> CANCELLED : cancel (current run finishes, no reschedule)
DONE --> [*]
FAILED --> [*]
CANCELLED --> [*]
```

## Step 3 — Class design

```uml title="Task scheduler"
class TaskScheduler
  - queue: PriorityQueue<ScheduledTask>
  - lock: ReentrantLock
  - changed: Condition
  - workers: Executor
  - clock: Clock
  + schedule(name: String, job: Job, delay: Duration, retry: RetryPolicy): TaskHandle
  + scheduleAtFixedRate(name: String, job: Job, initialDelay: Duration, period: Duration, retry: RetryPolicy): TaskHandle
  + runDue(): int
  + start(): void
  + close(): void
interface Job
  + run(): void
interface TaskHandle
  + name(): String
  + state(): TaskState
  + cancel(): boolean
class ScheduledTask
  - job: Job
  - nextRunAt: Instant
  - period: Duration
  - attempts: int
  - state: AtomicReference<TaskState>
record RetryPolicy
  + maxAttempts: int
  + backoff: Duration
TaskScheduler o-- "0..*" ScheduledTask
ScheduledTask ..|> TaskHandle
ScheduledTask --> Job
ScheduledTask --> RetryPolicy
```

## Step 4 — Implementation

````hint title="Hint — separate 'what is due' from 'waiting for it'"
Put the "poll every due task and dispatch it" logic in a method `runDue()` that uses the clock and returns. The dispatcher thread calls it after waking; tests call it directly with a fake clock and a same-thread executor. That one split makes the whole scheduler testable without sleeping.
````

````solution title="Complete Java solution"
```java title="TaskSchedulerDemo.java" file="TaskSchedulerDemo.java"
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.PriorityQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Consumer;

public class TaskSchedulerDemo {
    public static void main(String[] args) throws Exception {
        Instant start = Instant.parse("2026-05-01T09:00:00Z");
        MutableClock clock = new MutableClock(start);
        TaskScheduler scheduler = new TaskScheduler(Runnable::run, clock,     // run jobs on the calling thread: deterministic
                event -> System.out.println("t=" + Duration.between(start, clock.instant()).toSeconds() + "s " + event));

        AtomicInteger syncCalls = new AtomicInteger();
        TaskHandle report = scheduler.schedule("report", () -> { }, Duration.ofSeconds(5), RetryPolicy.NONE);
        TaskHandle heartbeat = scheduler.scheduleAtFixedRate("heartbeat", () -> { }, Duration.ZERO, Duration.ofSeconds(2), RetryPolicy.NONE);
        TaskHandle sync = scheduler.schedule("sync", () -> {
            if (syncCalls.incrementAndGet() < 3) throw new IllegalStateException("timeout");
        }, Duration.ofSeconds(1), new RetryPolicy(3, Duration.ofSeconds(1)));
        TaskHandle email = scheduler.schedule("email", () -> { throw new IllegalStateException("smtp down"); },
                Duration.ofSeconds(3), new RetryPolicy(2, Duration.ofSeconds(1)));

        for (int second = 0; second <= 8; second++) {
            clock.set(start.plusSeconds(second));
            scheduler.runDue();
            if (second == 5) System.out.println("t=5s cancel heartbeat -> " + heartbeat.cancel());
        }
        for (TaskHandle h : List.of(report, heartbeat, sync, email)) System.out.println(h.name() + ": " + h.state());

        // The same scheduler with a real clock, a dispatcher thread and a worker pool.
        ExecutorService pool = Executors.newFixedThreadPool(4);
        try (TaskScheduler live = new TaskScheduler(pool, Clock.systemUTC(), e -> { })) {
            live.start();
            CountDownLatch done = new CountDownLatch(3);
            List<String> order = new ArrayList<>();
            for (String[] t : new String[][] {{"c", "300"}, {"a", "100"}, {"b", "200"}}) {
                live.schedule(t[0], () -> { synchronized (order) { order.add(t[0]); } done.countDown(); },
                        Duration.ofMillis(Long.parseLong(t[1])), RetryPolicy.NONE);
            }
            TaskHandle never = live.schedule("never", () -> order.add("never"), Duration.ofMillis(150), RetryPolicy.NONE);
            never.cancel();
            System.out.println("live run finished: " + done.await(5, TimeUnit.SECONDS) + ", order " + order + ", cancelled task: " + never.state());
        } finally {
            pool.shutdown();
        }
    }
}

/** The command: what to run. */
@FunctionalInterface
interface Job {
    void run() throws Exception;
}

enum TaskState { SCHEDULED, RUNNING, DONE, FAILED, CANCELLED }

record RetryPolicy(int maxAttempts, Duration backoff) {
    static final RetryPolicy NONE = new RetryPolicy(1, Duration.ZERO);

    /** Exponential: backoff, 2 x backoff, 4 x backoff ... after the 1st, 2nd, 3rd failure. */
    Duration delayAfter(int failures) { return backoff.multipliedBy(1L << (failures - 1)); }
}

interface TaskHandle {
    String name();
    TaskState state();
    /** True if this call stopped future runs. */
    boolean cancel();
}

final class ScheduledTask implements TaskHandle {
    final String name;
    final Job job;
    final Duration period;                     // null for one-off tasks
    final RetryPolicy retry;
    final long seq;                            // tie-breaker: submission order
    final AtomicReference<TaskState> state = new AtomicReference<>(TaskState.SCHEDULED);
    volatile Instant nextRunAt;
    volatile Instant periodAnchor;             // the period boundary this run belongs to
    int failures;                              // only touched by the worker running this task

    ScheduledTask(String name, Job job, Instant firstRun, Duration period, RetryPolicy retry, long seq) {
        this.name = name; this.job = job; this.period = period; this.retry = retry; this.seq = seq;
        this.nextRunAt = firstRun;
        this.periodAnchor = firstRun;
    }

    public String name() { return name; }
    public TaskState state() { return state.get(); }

    public boolean cancel() {
        return state.compareAndSet(TaskState.SCHEDULED, TaskState.CANCELLED)
                || state.compareAndSet(TaskState.RUNNING, TaskState.CANCELLED);
    }
}

final class TaskScheduler implements AutoCloseable {
    private final PriorityQueue<ScheduledTask> queue =
            new PriorityQueue<>(Comparator.comparing((ScheduledTask t) -> t.nextRunAt).thenComparingLong(t -> t.seq));
    private final ReentrantLock lock = new ReentrantLock();
    private final Condition changed = lock.newCondition();
    private final Executor workers;
    private final Clock clock;
    private final Consumer<String> events;
    private final AtomicLong seq = new AtomicLong();
    private volatile boolean running;
    private Thread dispatcher;

    TaskScheduler(Executor workers, Clock clock, Consumer<String> events) {
        this.workers = workers;
        this.clock = clock;
        this.events = events;
    }

    TaskHandle schedule(String name, Job job, Duration delay, RetryPolicy retry) {
        return submit(new ScheduledTask(name, job, clock.instant().plus(delay), null, retry, seq.incrementAndGet()));
    }

    TaskHandle scheduleAtFixedRate(String name, Job job, Duration initialDelay, Duration period, RetryPolicy retry) {
        if (period.isZero() || period.isNegative()) throw new IllegalArgumentException("period must be positive");
        return submit(new ScheduledTask(name, job, clock.instant().plus(initialDelay), period, retry, seq.incrementAndGet()));
    }

    private TaskHandle submit(ScheduledTask t) {
        lock.lock();
        try {
            queue.add(t);
            changed.signal();                  // the new task may be due before the one the dispatcher waits for
        } finally {
            lock.unlock();
        }
        return t;
    }

    /** Dispatches every task that is due now. Called by the dispatcher thread, or directly in tests. */
    int runDue() {
        List<ScheduledTask> due = new ArrayList<>();
        lock.lock();
        try {
            Instant now = clock.instant();
            while (!queue.isEmpty() && !queue.peek().nextRunAt.isAfter(now)) due.add(queue.poll());
        } finally {
            lock.unlock();
        }
        int dispatched = 0;
        for (ScheduledTask t : due) {
            if (t.state.compareAndSet(TaskState.SCHEDULED, TaskState.RUNNING)) {   // cancelled tasks are skipped here
                workers.execute(() -> execute(t));
                dispatched++;
            }
        }
        return dispatched;
    }

    private void execute(ScheduledTask t) {
        try {
            t.job.run();
            t.failures = 0;
            events.accept(t.name + " ran");
            if (t.period == null) {
                t.state.compareAndSet(TaskState.RUNNING, TaskState.DONE);
            } else {
                reschedule(t, nextPeriod(t));
            }
        } catch (Exception e) {
            t.failures++;
            if (t.failures < t.retry.maxAttempts()) {
                Duration wait = t.retry.delayAfter(t.failures);
                events.accept(t.name + " failed (" + e.getMessage() + "), attempt " + t.failures + ", retry in " + wait.toSeconds() + "s");
                reschedule(t, clock.instant().plus(wait));
            } else if (t.period != null) {
                events.accept(t.name + " failed " + t.failures + " times, waiting for the next period");
                t.failures = 0;
                reschedule(t, nextPeriod(t));
            } else {
                events.accept(t.name + " failed (" + e.getMessage() + "), giving up after " + t.failures + " attempts");
                t.state.compareAndSet(TaskState.RUNNING, TaskState.FAILED);
            }
        }
    }

    /** Fixed rate: the next period boundary after now; missed boundaries are skipped, not replayed. */
    private Instant nextPeriod(ScheduledTask t) {
        Instant now = clock.instant();
        Instant next = t.periodAnchor.plus(t.period);
        while (!next.isAfter(now)) next = next.plus(t.period);
        t.periodAnchor = next;
        return next;
    }

    private void reschedule(ScheduledTask t, Instant at) {
        t.nextRunAt = at;
        if (t.state.compareAndSet(TaskState.RUNNING, TaskState.SCHEDULED)) submit(t);   // fails if cancelled meanwhile
    }

    void start() {
        running = true;
        dispatcher = new Thread(this::dispatchLoop, "task-dispatcher");
        dispatcher.setDaemon(true);
        dispatcher.start();
    }

    private void dispatchLoop() {
        while (running) {
            lock.lock();
            try {
                ScheduledTask head = queue.peek();
                if (head == null) {
                    changed.await();
                    continue;
                }
                long waitNanos = Duration.between(clock.instant(), head.nextRunAt).toNanos();
                if (waitNanos > 0) {
                    changed.awaitNanos(waitNanos);   // wakes on timeout or when an earlier task is submitted
                    continue;
                }
            } catch (InterruptedException e) {
                return;
            } finally {
                lock.unlock();
            }
            runDue();
        }
    }

    @Override public void close() {
        running = false;
        if (dispatcher != null) {
            dispatcher.interrupt();
            try {
                dispatcher.join();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();                  // keep the interrupt for the caller to see
            }
        }
    }
}

final class MutableClock extends Clock {
    private volatile Instant now;
    MutableClock(Instant start) { now = start; }
    void set(Instant t) { now = t; }
    @Override public Instant instant() { return now; }
    @Override public ZoneId getZone() { return ZoneOffset.UTC; }
    @Override public Clock withZone(ZoneId zone) { return this; }
}
```
````

## Design decisions

- **Tasks are commands.** A `Job` is "something to run"; `ScheduledTask` wraps it with when, how often, and how to retry. The scheduler never knows what a job does (see [Command](lesson:command)).
- **Heap + condition variable.** The dispatcher sleeps exactly until the earliest task is due and is woken by `signal()` when something earlier arrives — no polling loop, no missed deadlines (see [Choosing data structures](lesson:data-structure-selection) and [Coordination](lesson:coordination)).
- **Dispatch and execution are separate.** The dispatcher only moves due tasks to the worker pool, so a slow job never delays other tasks' start times. A task is in the queue **or** running, never both, so the same task can't overlap itself.
- **State changes are CAS operations.** `cancel()` and the worker's `RUNNING → SCHEDULED` race safely: if cancel wins, the reschedule's CAS fails and the task stops.
- **Time and execution are injected.** A `MutableClock` plus `Runnable::run` as the executor turns the scheduler into a deterministic simulation in the demo and tests; production passes the system clock and a thread pool (see [Resource lifecycle](lesson:resource-lifecycle) for owning and closing them).

## Patterns and principles

[Command](lesson:command) (`Job`), [Strategy](lesson:strategy) (`RetryPolicy`), [choosing data structures](lesson:data-structure-selection) (priority queue), [coordination](lesson:coordination) with a condition variable, [CAS state transitions](lesson:concurrent-state-transitions), and [resource lifecycle](lesson:resource-lifecycle) (`close()` stops the dispatcher).

## Example execution flow

```text
t=0  heartbeat due (first run at 0)       -> ran; next period boundary 2s
t=1  sync due                             -> fails (1/3) -> retry in 1s (at 2s)
t=2  heartbeat (2s, seq 2), sync (2s, seq 3) -> heartbeat ran; sync fails (2/3) -> retry in 2s (at 4s)
t=3  email due                            -> fails (1/2) -> retry in 1s
t=4  heartbeat ran; sync succeeds -> DONE; email fails (2/2) -> FAILED
t=5  report ran -> DONE; cancel(heartbeat): SCHEDULED -> CANCELLED
t=6  heartbeat reaches the head -> CAS SCHEDULED->RUNNING fails -> skipped
live: tasks c (300ms), a (100ms), b (200ms) run in due order a, b, c on the pool; "never" was cancelled
```

```text title="Program output"
t=0s heartbeat ran
t=1s sync failed (timeout), attempt 1, retry in 1s
t=2s heartbeat ran
t=2s sync failed (timeout), attempt 2, retry in 2s
t=3s email failed (smtp down), attempt 1, retry in 1s
t=4s heartbeat ran
t=4s sync ran
t=4s email failed (smtp down), giving up after 2 attempts
t=5s report ran
t=5s cancel heartbeat -> true
report: DONE
heartbeat: CANCELLED
sync: DONE
email: FAILED
live run finished: true, order [a, b, c], cancelled task: CANCELLED
```

## Edge cases

- **Two tasks due at the same instant** → submission order (`seq`) breaks the tie.
- **A task submitted that is due before the current head** → `signal()` wakes the dispatcher, which re-plans.
- **The scheduler falls behind** → a recurring task runs once and skips to the next future boundary.
- **Cancel while running** → the run completes; the reschedule CAS fails; state stays `CANCELLED`.
- **Cancel twice** → second call returns `false`.
- **Zero or negative period** → rejected.

## Tests

```java title="TaskSchedulerTest.java" file="TaskSchedulerTest.java" test="TaskSchedulerDemo.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class TaskSchedulerTest {
    private final Instant t0 = Instant.parse("2026-01-01T00:00:00Z");
    private MutableClock clock;
    private TaskScheduler scheduler;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(t0);
        scheduler = new TaskScheduler(Runnable::run, clock, e -> { });
    }

    private void at(long seconds) {
        clock.set(t0.plusSeconds(seconds));
        scheduler.runDue();
    }

    @Test
    void oneOffTaskRunsOnlyWhenDue() {
        AtomicInteger runs = new AtomicInteger();
        TaskHandle h = scheduler.schedule("x", runs::incrementAndGet, Duration.ofSeconds(10), RetryPolicy.NONE);
        at(9);
        assertEquals(0, runs.get());
        at(10);
        assertEquals(1, runs.get());
        assertEquals(TaskState.DONE, h.state());
    }

    @Test
    void fixedRateSkipsMissedRuns() {
        AtomicInteger runs = new AtomicInteger();
        scheduler.scheduleAtFixedRate("tick", runs::incrementAndGet, Duration.ZERO, Duration.ofSeconds(1), RetryPolicy.NONE);
        at(0);
        at(10);                                    // nine boundaries missed
        assertEquals(2, runs.get());
        at(10);
        assertEquals(2, runs.get());
        at(11);
        assertEquals(3, runs.get());
    }

    @Test
    void exponentialBackoffThenFailure() {
        List<Long> attemptsAt = new ArrayList<>();
        TaskHandle h = scheduler.schedule("x", () -> {
            attemptsAt.add(Duration.between(t0, clock.instant()).toSeconds());
            throw new IllegalStateException("no");
        }, Duration.ZERO, new RetryPolicy(4, Duration.ofSeconds(1)));
        for (int s = 0; s <= 10; s++) at(s);
        assertEquals(List.of(0L, 1L, 3L, 7L), attemptsAt);       // waits of 1, 2, 4 seconds
        assertEquals(TaskState.FAILED, h.state());
    }

    @Test
    void cancelledTasksNeverRunAgain() {
        AtomicInteger runs = new AtomicInteger();
        TaskHandle h = scheduler.scheduleAtFixedRate("tick", runs::incrementAndGet, Duration.ZERO, Duration.ofSeconds(1), RetryPolicy.NONE);
        at(0);
        assertTrue(h.cancel());
        assertFalse(h.cancel());
        at(1);
        at(2);
        assertEquals(1, runs.get());
    }

    @Test
    void cancelDuringRunStopsTheNextRun() {
        AtomicInteger runs = new AtomicInteger();
        TaskHandle[] self = new TaskHandle[1];
        self[0] = scheduler.scheduleAtFixedRate("tick", () -> { runs.incrementAndGet(); self[0].cancel(); },
                Duration.ZERO, Duration.ofSeconds(1), RetryPolicy.NONE);
        at(0);
        at(1);
        assertEquals(1, runs.get());
        assertEquals(TaskState.CANCELLED, self[0].state());
    }

    @Test
    void realDispatcherWakesForAnEarlierTask() throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try (TaskScheduler live = new TaskScheduler(pool, Clock.systemUTC(), e -> { })) {
            live.start();
            CountDownLatch ran = new CountDownLatch(1);
            live.schedule("late", () -> { }, Duration.ofHours(1), RetryPolicy.NONE);   // dispatcher sleeps for an hour...
            live.schedule("soon", ran::countDown, Duration.ofMillis(50), RetryPolicy.NONE);
            assertTrue(ran.await(2, TimeUnit.SECONDS));                                 // ...but is woken for this one
        } finally {
            pool.shutdown();
        }
    }
}
```

## Concurrency

- **One lock protects the heap.** Submissions and the dispatcher take it briefly; jobs run outside it, on the workers.
- **The condition variable avoids both busy-waiting and oversleeping.** `awaitNanos` returns on timeout or `signal()`; the loop re-reads the head either way, so spurious wake-ups are harmless.
- **Task fields:** `nextRunAt` and `periodAnchor` are `volatile` (written by a worker, read by the dispatcher); `failures` is touched only by the single worker that owns the running task.
- **Shutdown:** `close()` stops and joins the dispatcher. The executor belongs to the caller, who decides whether to wait for running jobs (`shutdown` + `awaitTermination`) or interrupt them.

## Common mistakes and alternatives

- **`while (true) { check queue; Thread.sleep(100); }`** — burns CPU, and every task is up to 100 ms late.
- **Running jobs on the dispatcher thread** — one slow job delays every other task.
- **Removing cancelled tasks from the middle of the heap** — O(n); lazy skipping is O(1).
- **Fixed-rate catch-up bursts** — after a pause, replaying 100 missed runs back-to-back is rarely what anyone wants.
- **`Thread.sleep` in tests** — slow and flaky; inject the clock and the executor instead.
- **Alternative:** `java.util.concurrent.DelayQueue` with a pool of threads calling `take()` — the JDK version of the same idea. For huge numbers of timers (millions of timeouts), a **hierarchical timing wheel** gives O(1) insert and cancel.

## Follow-up questions

````reveal title="Fixed delay instead of fixed rate"
Fixed delay measures from the **end** of the previous run: `nextRunAt = finishTime + delay`. It never overlaps and never bursts, at the cost of drift. Add a `Schedule` strategy (`FixedRate`, `FixedDelay`, `Cron`) that computes the next run time from the previous anchor and the finish time.
````

````reveal title="Survive restarts"
Store each task's definition and `nextRunAt` in a table. On start-up, load scheduled tasks into the heap. With several scheduler instances, a task is claimed with `UPDATE task SET owner = ?, state = 'RUNNING' WHERE id = ? AND state = 'SCHEDULED' AND next_run_at <= now()` so exactly one instance runs it.
````

````reveal title="Priorities and per-task timeouts"
Add a priority to the heap's comparator after the due time, so urgent tasks that are due at the same moment go first. For timeouts, submit the job with `ExecutorService.submit` and have a watchdog cancel the `Future` after the limit; the task's failure path then applies retries as usual.
````

## Complexity

- `schedule`: O(log n). `cancel`: O(1) (lazy).
- `runDue`: O(k log n) for k due tasks.
- Memory: O(n) tasks, including cancelled ones until they reach the head.

## Interviewer checklist

- [ ] Priority queue by next run time; one dispatcher with a timed wait
- [ ] Wake-up when an earlier task is submitted
- [ ] Workers separate from the dispatcher; a task never overlaps itself
- [ ] Fixed-rate semantics with missed-run policy
- [ ] Retries with exponential backoff; cancel semantics for running tasks
- [ ] Deterministic tests with a fake clock and a same-thread executor
