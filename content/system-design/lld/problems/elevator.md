## Problem statement

Design the controller for a single elevator car in a building. People inside press buttons for destination floors; people on each floor press up or down buttons to call the car. The controller decides where the car goes next, opens doors at stops, and serves requests efficiently.

> [!TIP] Try it first
> Before designing classes, decide the **scheduling rule**. "Go to the oldest request" (FCFS) makes the car zig-zag. What does a real elevator do?

## Clarifying questions

1. One car or several?
2. Which requests exist — in-car destinations, hall calls with direction, or both?
3. Scheduling policy?
4. Do we simulate time (floor by floor) or just compute the order?
5. Door handling, overload, maintenance or emergency modes?

````reveal title="Answers we'll assume"
- **One car**, floors 0..N−1. (Multiple cars is a follow-up.)
- **In-car requests** (go to floor F) and **hall calls** (floor F, direction UP/DOWN).
- **LOOK scheduling** (the "elevator algorithm"): keep moving in the current direction while there are stops ahead, serving them in order; reverse when nothing is left ahead.
- A hall call for UP is served when the car passes going **up** (or when it's the turning point).
- Simulate with a `step()` tick: the car moves one floor per tick or opens its doors at a stop.
- Out of scope: door sensors, weight, emergency mode — but a maintenance mode is a likely follow-up.
````

## Requirements

1. Accept in-car requests and hall calls (validated floor range).
2. Each `step()`: if the current floor is a stop for the current direction, open the doors and clear it; otherwise move one floor toward the next stop, or go idle.
3. Serve stops with LOOK: same-direction stops in order, then reverse.
4. Requests may arrive at any time, including from other threads (buttons) — thread-safe.
5. The scheduling policy should be swappable.

## Step 1 — Model the state

````reveal title="States and data"
```states title="Elevator car"
[*] --> IDLE
IDLE --> MOVING_UP : request above
IDLE --> MOVING_DOWN : request below
IDLE --> DOORS_OPEN : request at current floor
MOVING_UP --> DOORS_OPEN : reached a stop
MOVING_DOWN --> DOORS_OPEN : reached a stop
DOORS_OPEN --> MOVING_UP : more stops above (keep direction)
DOORS_OPEN --> MOVING_DOWN : more stops below
DOORS_OPEN --> IDLE : no stops left
```

**Data:** two sorted sets of floors.
- `upStops` (a `TreeSet`): in-car requests above, plus hall calls going UP.
- `downStops` (a `TreeSet`, read in descending order): in-car requests below, plus hall calls going DOWN.

LOOK then becomes: going up, the next target is `upStops.ceiling(current)`; if there's none, turn around and use `downStops.floor(current)`, or the highest down stop.
````

## Step 2 — Class design

```uml title="Elevator controller"
class ElevatorController
  - car: ElevatorCar
  - upStops: TreeSet<Integer>
  - downStops: TreeSet<Integer>
  - policy: SchedulingPolicy
  + requestFloor(f: int): void
  + hallCall(f: int, d: Direction): void
  + step(): CarState
class ElevatorCar
  - floor: int
  - direction: Direction
  - doorsOpen: boolean
interface SchedulingPolicy
  + nextTarget(floor: int, dir: Direction, up: NavigableSet, down: NavigableSet): Optional<Target>
class LookPolicy
enum Direction
  UP
  DOWN
  IDLE
ElevatorController *-- "1" ElevatorCar
ElevatorController --> SchedulingPolicy
LookPolicy ..|> SchedulingPolicy
```

**Responsibilities:** the controller owns the request sets and the tick loop; the policy only **decides**, as a pure function of the state, so it's easy to test and swap; the car is plain state (floor, direction, doors).

## Step 3 — Implementation

````hint title="Hint — where does an in-car request go?"
If the requested floor is **above** the car, it goes in `upStops`; if **below**, in `downStops`; if it's the **current** floor, open the doors now (or on the next tick). Hall calls go into the set matching their **direction**, regardless of where the car is.
````

````solution title="Complete Java solution"
```java title="ElevatorDemo.java" file="ElevatorDemo.java"
import java.util.NavigableSet;
import java.util.Optional;
import java.util.TreeSet;

public class ElevatorDemo {
    public static void main(String[] args) {
        ElevatorController ctl = new ElevatorController(10, new LookPolicy());
        ctl.requestFloor(5);                 // someone inside wants 5
        ctl.hallCall(3, Direction.UP);       // someone at 3 wants to go up
        ctl.hallCall(7, Direction.DOWN);     // someone at 7 wants to go down
        ctl.hallCall(2, Direction.DOWN);     // someone at 2 wants to go down

        for (int tick = 1; tick <= 40 && !ctl.isIdle(); tick++) {
            CarState s = ctl.step();
            if (s.doorsOpen()) System.out.println("tick " + tick + ": doors open at " + s.floor() + " (" + s.direction() + ")");
            if (tick == 4) ctl.requestFloor(9);   // the passenger who boarded at 3 presses 9
        }
        System.out.println("final: " + ctl.state());
    }
}

enum Direction { UP, DOWN, IDLE }

record CarState(int floor, Direction direction, boolean doorsOpen) {}

/** The next stop, and which request set it belongs to (= the direction the car continues in after serving it). */
record Target(int floor, Direction direction) {}

interface SchedulingPolicy {
    Optional<Target> nextTarget(int floor, Direction dir, NavigableSet<Integer> up, NavigableSet<Integer> down);
}

/** LOOK: continue in the current direction while stops remain ahead, otherwise reverse. */
final class LookPolicy implements SchedulingPolicy {
    @Override
    public Optional<Target> nextTarget(int floor, Direction dir, NavigableSet<Integer> up, NavigableSet<Integer> down) {
        if (up.isEmpty() && down.isEmpty()) return Optional.empty();
        if (dir != Direction.DOWN) {                                  // UP or IDLE
            Integer ahead = up.ceiling(floor);
            if (ahead != null) return Optional.of(new Target(ahead, Direction.UP));
            if (!down.isEmpty()) return Optional.of(new Target(down.last(), Direction.DOWN));   // turn at the highest DOWN stop
            return Optional.of(new Target(up.first(), Direction.UP)); // only UP stops below: go to the lowest one
        }
        Integer ahead = down.floor(floor);
        if (ahead != null) return Optional.of(new Target(ahead, Direction.DOWN));
        if (!up.isEmpty()) return Optional.of(new Target(up.first(), Direction.UP));         // turn at the lowest UP stop
        return Optional.of(new Target(down.last(), Direction.DOWN));  // only DOWN stops above: go to the highest one
    }
}

final class ElevatorController {
    private final int floors;
    private final SchedulingPolicy policy;
    private final TreeSet<Integer> upStops = new TreeSet<>();
    private final TreeSet<Integer> downStops = new TreeSet<>();
    private int floor = 0;
    private Direction direction = Direction.IDLE;
    private boolean doorsOpen = false;

    ElevatorController(int floors, SchedulingPolicy policy) {
        if (floors < 2) throw new IllegalArgumentException("need at least 2 floors");
        this.floors = floors;
        this.policy = policy;
    }

    synchronized void requestFloor(int f) {
        validate(f);
        if (f > floor) upStops.add(f);
        else if (f < floor) downStops.add(f);
        else if (!doorsOpen) (direction == Direction.DOWN ? downStops : upStops).add(f);   // reopen on next tick
    }

    synchronized void hallCall(int f, Direction d) {
        validate(f);
        if (d == Direction.IDLE) throw new IllegalArgumentException("hall call needs UP or DOWN");
        if (f == 0 && d == Direction.DOWN || f == floors - 1 && d == Direction.UP) throw new IllegalArgumentException("no such button");
        (d == Direction.UP ? upStops : downStops).add(f);
    }

    /** One tick: close doors, then either stop here, move one floor, or go idle. */
    synchronized CarState step() {
        doorsOpen = false;
        Optional<Target> target = policy.nextTarget(floor, direction, upStops, downStops);
        if (target.isEmpty()) {
            direction = Direction.IDLE;
            return state();
        }
        Target t = target.get();
        if (t.floor() == floor) {                          // arrived: serve this stop
            (t.direction() == Direction.UP ? upStops : downStops).remove(floor);
            direction = remainingWork() ? t.direction() : Direction.IDLE;
            doorsOpen = true;
            return state();
        }
        direction = t.floor() > floor ? Direction.UP : Direction.DOWN;
        floor += direction == Direction.UP ? 1 : -1;
        return state();
    }

    synchronized boolean isIdle() { return direction == Direction.IDLE && upStops.isEmpty() && downStops.isEmpty() && !doorsOpen; }

    synchronized CarState state() { return new CarState(floor, direction, doorsOpen); }

    private boolean remainingWork() { return !upStops.isEmpty() || !downStops.isEmpty(); }

    private void validate(int f) {
        if (f < 0 || f >= floors) throw new IllegalArgumentException("floor " + f + " out of range 0.." + (floors - 1));
    }
}
```
````

## Design decisions

- **Two sorted sets instead of a FIFO queue.** LOOK needs "next stop at or above my floor" (`ceiling`) and "next stop at or below" (`floor`) — both O(log n) on a `TreeSet`. A queue would force FCFS zig-zagging.
- **Direction-aware hall calls.** A DOWN call at floor 3 isn't served while the car passes 3 going up. It goes in `downStops` and is picked up on the way down.
- **The policy is a pure function** of (floor, direction, stop sets) → the next target. Swapping in FCFS, or "nearest first" for testing, is one class.
- **A target names the request set it came from**, not just a floor. When the car descends to pick up someone going *up*, the stop is cleared from the UP set on arrival and the car continues upward. Confusing "travel direction" with "which set" is the classic bug here: the stop never gets cleared and the doors reopen forever.
- **A tick-based simulation** (`step()`) makes the behaviour deterministic and testable without threads or sleeping. A real controller calls `step()` from its motor/timer loop.
- **Coarse `synchronized`**: button presses can come from other threads while the controller ticks.

## Patterns and principles

[State](lesson:state-machines) (IDLE / MOVING / DOORS_OPEN), [Strategy](lesson:strategy) (`SchedulingPolicy`), [choosing data structures](lesson:data-structure-selection) (`TreeSet` for ordered stop lookup), and [Observer](lesson:observer) for displays (a follow-up).

## Example execution flow

```text
start floor 0, IDLE. Stops: up={3(hall UP), 5(car)}, down={2(hall DOWN), 7(hall DOWN)}
going up: 0->1->2 (2 is a DOWN call: skipped)->3 open (UP call)
tick 4: passenger presses 9 -> up={5, 9}
->4->5 open (car) ->6->7? 7 is a DOWN call: skipped on the way up ->8->9 open
no UP stops left: turn; highest DOWN stop is 7 -> 8->7 open (DOWN) -> 6..2 open (DOWN) -> idle
```

```text title="Program output"
tick 4: doors open at 3 (UP)
tick 7: doors open at 5 (UP)
tick 12: doors open at 9 (UP)
tick 15: doors open at 7 (DOWN)
tick 21: doors open at 2 (IDLE)
final: CarState[floor=2, direction=IDLE, doorsOpen=false]
```

## Edge cases

- **Request for the current floor while idle** → doors open on the next tick.
- **Hall call DOWN at the bottom floor, or UP at the top** → rejected (the button doesn't exist).
- **Requests arriving mid-travel** → inserted into the sorted sets and served when reached, if they're ahead in the current direction.
- **Duplicate presses** → sets ignore duplicates.
- **Out-of-range floor** → `IllegalArgumentException`.

## Tests

```java title="ElevatorTest.java" file="ElevatorTest.java" test="ElevatorDemo.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class ElevatorTest {
    private static List<Integer> runUntilIdle(ElevatorController c) {
        List<Integer> stops = new ArrayList<>();
        for (int i = 0; i < 100 && !c.isIdle(); i++) {
            CarState s = c.step();
            if (s.doorsOpen()) stops.add(s.floor());
        }
        return stops;
    }

    @Test
    void servesUpwardStopsInOrderThenDownward() {
        ElevatorController c = new ElevatorController(10, new LookPolicy());
        c.requestFloor(6);
        c.requestFloor(2);
        c.hallCall(4, Direction.DOWN);
        c.hallCall(3, Direction.UP);
        assertEquals(List.of(2, 3, 6, 4), runUntilIdle(c));
    }

    @Test
    void downHallCallIsNotServedOnTheWayUp() {
        ElevatorController c = new ElevatorController(10, new LookPolicy());
        c.requestFloor(8);
        c.hallCall(5, Direction.DOWN);
        assertEquals(List.of(8, 5), runUntilIdle(c));
    }

    @Test
    void requestAtCurrentFloorOpensDoors() {
        ElevatorController c = new ElevatorController(5, new LookPolicy());
        c.requestFloor(0);
        assertTrue(c.step().doorsOpen());
        assertTrue(c.isIdle() || !c.step().doorsOpen());
    }

    @Test
    void invalidRequestsRejected() {
        ElevatorController c = new ElevatorController(5, new LookPolicy());
        assertThrows(IllegalArgumentException.class, () -> c.requestFloor(5));
        assertThrows(IllegalArgumentException.class, () -> c.hallCall(0, Direction.DOWN));
        assertThrows(IllegalArgumentException.class, () -> c.hallCall(4, Direction.UP));
    }

    @Test
    void movesOneFloorPerTick() {
        ElevatorController c = new ElevatorController(10, new LookPolicy());
        c.requestFloor(3);
        assertEquals(1, c.step().floor());
        assertEquals(2, c.step().floor());
        assertEquals(3, c.step().floor());
        assertTrue(c.step().doorsOpen());
    }
}
```

## Concurrency

Buttons are pressed from other threads (or hardware interrupts) while the control loop calls `step()`. All mutators are `synchronized`, so a request either lands before a tick's decision or after it, never half-way. The **policy runs inside the lock**, so it must be fast and must not block — it is: two `TreeSet` lookups.

## Common mistakes and alternatives

- **A single FIFO queue** — zig-zags and starves floors in the middle.
- **Ignoring hall-call direction** — picking up someone going down while travelling up.
- **Real `Thread.sleep()` timing** in the design — untestable. Model time as ticks.
- **Putting scheduling inside `ElevatorCar`** — mixes the physical state with policy.
- **Alternatives:** SCAN (always travel to the end floor before reversing); "nearest stop first" (risk of starvation); destination dispatch in modern buildings (people enter their destination in the lobby and are assigned a car).

## Follow-up questions

````reveal title="Multiple elevators"
Add a `Dispatcher` ([Mediator](lesson:mediator)) that receives **hall calls** and assigns each one to the best car — for example, the car that's idle or moving toward the call in the same direction, with the smallest estimated time of arrival. **In-car requests** stay with their own car. Each car keeps its own `ElevatorController`. The dispatcher's cost function is a strategy, too.
````

````reveal title="Display panels on each floor"
`ElevatorController` publishes `CarMoved(floor, direction)` and `DoorsOpened(floor)` events after each step ([Observer](lesson:observer)). Each floor's display subscribes. Publish outside the lock, or hand the events to an executor.
````

````reveal title="Maintenance and emergency modes"
Add `MAINTENANCE` and `EMERGENCY` states. In maintenance, new requests are rejected and the car finishes its current stop, then parks. In an emergency, the car clears all stops and goes to the ground floor. The `step()` logic consults the mode first — a good moment to move to the [State pattern](lesson:state-pattern) if each mode has distinct behaviour.
````

## Complexity

- `requestFloor` / `hallCall`: O(log n) (TreeSet insert).
- `step`: O(log n) for the policy lookups.
- Memory: O(number of pending stops) ≤ O(2 × floors).

## Interviewer checklist

- [ ] Scheduling rule chosen and justified (LOOK/SCAN vs FCFS)
- [ ] Hall-call direction respected
- [ ] Data structures support efficient next-stop lookup
- [ ] Time modelled as ticks (testable), not sleeps
- [ ] Thread safety for requests arriving during movement
- [ ] Policy swappable; multi-car dispatch discussed as a mediator
