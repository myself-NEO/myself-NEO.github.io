## The problem

Some systems have **many objects that need to coordinate with each other**. In an airport, planes must not take the same runway at once. In a chat room, users send messages to each other. In a building with several elevators, each car's decision depends on what the others are doing. If every object talks directly to every other one, you get a **many-to-many web** of dependencies: *n* objects means up to *n(n−1)* links, and changing one interaction rule means touching many classes.

**Mediator** introduces a central object that **encapsulates how a set of objects interact**. The colleagues talk only to the mediator, never to each other, and the coordination rules live in one place.

## When to use it — and when not

**Use when:**

- Several peers must **coordinate** (avoid conflicts, share resources, react to each other).
- Interaction rules are complex and change, and you want them in **one** place.
- Peers should be reusable without knowing about each other.

**Don't use when:**

- Communication is one-to-many broadcasting with no coordination ([Observer](lesson:observer) is enough).
- It's a simple entry point into a subsystem ([Facade](lesson:facade)).
- Only two objects interact.

## Core idea

- **Mediator** — knows all colleagues and implements the coordination logic (`requestRunway(plane)`, `dispatch(request)`).
- **Colleagues** — hold a reference to the mediator and **notify it** of events or **ask it** for decisions instead of calling peers directly.

```text
Without mediator                     With mediator
 A ─── B                              A     B
 │ ╲ ╱ │                               ╲   ╱
 │  ╳  │                             Mediator
 │ ╱ ╲ │                               ╱   ╲
 C ─── D                              C     D
```

## UML

```uml title="Mediator"
interface ControlTower
  + requestLanding(f: Flight): boolean
  + reportRunwayClear(f: Flight): void
class Tower
  - runwayBusy: boolean
  - queue: Deque<Flight>
class Flight
  - tower: ControlTower
  + approach(): void
  + land(): void
Tower ..|> ControlTower
Flight --> ControlTower : talks only to
Tower o-- "0..*" Flight : coordinates
```

## Java implementation

```java title="An air-traffic control tower coordinating flights" file="MediatorDemo.java"
import java.util.ArrayDeque;
import java.util.Deque;

public class MediatorDemo {
    public static void main(String[] args) {
        Tower tower = new Tower();
        Flight ai101 = new Flight("AI101", tower);
        Flight sg202 = new Flight("SG202", tower);
        Flight uk303 = new Flight("UK303", tower);

        ai101.approach();     // gets the runway
        sg202.approach();     // must hold
        uk303.approach();     // must hold
        ai101.landed();       // tower clears SG202 next
        sg202.landed();       // tower clears UK303
        uk303.landed();
    }
}

interface ControlTower {
    void requestLanding(Flight flight);
    void runwayVacated(Flight flight);
}

/** All coordination rules live here; flights never reference each other. */
class Tower implements ControlTower {
    private Flight onRunway;
    private final Deque<Flight> holding = new ArrayDeque<>();

    public void requestLanding(Flight flight) {
        if (onRunway == null) {
            clear(flight);
        } else {
            holding.addLast(flight);
            flight.hold(holding.size());
        }
    }

    public void runwayVacated(Flight flight) {
        if (flight != onRunway) throw new IllegalStateException(flight.code() + " was not on the runway");
        onRunway = null;
        Flight next = holding.pollFirst();
        if (next != null) clear(next);
    }

    private void clear(Flight flight) {
        onRunway = flight;
        flight.clearedToLand();
    }
}

class Flight {
    private final String code;
    private final ControlTower tower;

    Flight(String code, ControlTower tower) { this.code = code; this.tower = tower; }

    String code() { return code; }

    void approach() {
        System.out.println(code + ": requesting landing");
        tower.requestLanding(this);
    }

    void landed() {
        System.out.println(code + ": landed, vacating runway");
        tower.runwayVacated(this);
    }

    // Called by the mediator.
    void clearedToLand() { System.out.println("  TOWER -> " + code + ": cleared to land"); }
    void hold(int position) { System.out.println("  TOWER -> " + code + ": hold, number " + position + " in queue"); }
}
```

Adding a rule — say, emergencies jump the queue, or there are two runways — changes only `Tower`. Flights stay simple and unaware of each other.

## Realistic use case

- **Multiple elevators**: a `Dispatcher` assigns hall calls to cars based on position and direction; cars report their status to it ([Elevator](problem:elevator) follow-up).
- **Ride-sharing**: a `MatchingService` coordinates riders and drivers, who never talk directly ([Ride-Sharing](problem:ride-sharing)).
- **Chat rooms**: users send messages via a `ChatRoom`, which applies mute and block rules and routes messages.
- **UI forms**: a dialog mediator enables "Submit" only when the fields are valid, so widgets don't reference each other.

## Trade-offs and alternatives

- **Pros:** removes many-to-many coupling; centralises interaction rules; colleagues are simpler and reusable.
- **Cons:** the mediator can become a **god object**; a central point of contention in concurrent systems (it may need locking or a single thread).
- **Compared with similar patterns:**
  - **[Observer](lesson:observer)** — one-way broadcast; often used *by* a mediator to notify colleagues.
  - **[Facade](lesson:facade)** — a one-way, simplified entry point to a subsystem; the subsystem doesn't talk back to it.

## Recognising it in an interview

"Multiple X must coordinate to avoid conflicts", "assign requests to one of many workers/cars/drivers", "users interact through a room". If you notice your entities holding lists of references to *each other*, introduce a mediator.

## Common mistakes

- **Mediators that absorb domain rules** belonging to the colleagues (a flight's fuel calculations don't belong in the tower).
- **Colleagues bypassing the mediator** "just this once".
- **Unbounded growth** — split mediators by concern (runway scheduling vs gate assignment).
- **Ignoring concurrency** — a mediator touched by many threads needs synchronisation.

## Key takeaways

- Mediator centralises **coordination among peers**; colleagues talk only to it.
- It turns many-to-many links into **one-to-many**.
- Keep it focused on interaction rules to avoid a god object.
- It often uses Observer-style callbacks to notify colleagues.

## Knowledge check

```quiz
? Which scenario best fits Mediator?
- Notifying five dashboards when a price changes
+ Coordinating several elevator cars so each hall call is assigned to the best car
- Converting a vendor API to your interface
> Peers coordinating through a central decision-maker is the Mediator scenario.

? What's the main risk of a Mediator?
+ It can grow into a god object containing too much logic
- It increases coupling between colleagues
- It can't be tested
> Keep mediators focused on coordination and split them by concern.

? How do colleagues communicate in the Mediator pattern?
- Directly with each other
+ Only through the mediator
- Through global static fields
> That's the whole point: colleagues don't reference each other.
```

## Exercise

Design a **chat room mediator**: `User`s join a `ChatRoom`, send messages to the room or privately to another user by name, and can block other users (blocked users' messages aren't delivered to them). Users must never hold references to other users. Write the classes.

````hint title="Hint"
The room keeps `Map<String, User>` and each user's blocked set. `User.send(...)` just calls `room.broadcast(...)` or `room.direct(...)`.
````

````solution title="Reference solution"
```java file="ChatMediatorDemo.java"
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

public class ChatMediatorDemo {
    public static void main(String[] args) {
        ChatRoom room = new ChatRoom();
        User asha = new User("asha", room), ravi = new User("ravi", room), meera = new User("meera", room);
        meera.block("ravi");
        ravi.say("hello everyone");
        asha.whisper("meera", "lunch?");
        ravi.whisper("meera", "hi?");        // blocked: not delivered
    }
}

class ChatRoom {
    private final Map<String, User> members = new LinkedHashMap<>();
    private final Map<String, Set<String>> blocked = new HashMap<>();

    void join(User u) { members.put(u.name(), u); }
    void block(String who, String target) { blocked.computeIfAbsent(who, k -> new HashSet<>()).add(target); }

    void broadcast(String from, String text) {
        members.values().stream()
                .filter(u -> !u.name().equals(from))
                .filter(u -> !isBlocked(u.name(), from))
                .forEach(u -> u.receive(from, text));
    }

    void direct(String from, String to, String text) {
        User target = members.get(to);
        if (target == null) throw new IllegalArgumentException("no user " + to);
        if (isBlocked(to, from)) { System.out.println("  (" + from + " -> " + to + " suppressed)"); return; }
        target.receive(from + " (private)", text);
    }

    private boolean isBlocked(String receiver, String sender) {
        return blocked.getOrDefault(receiver, Set.of()).contains(sender);
    }
}

class User {
    private final String name;
    private final ChatRoom room;

    User(String name, ChatRoom room) { this.name = name; this.room = room; room.join(this); }

    String name() { return name; }
    void say(String text) { room.broadcast(name, text); }
    void whisper(String to, String text) { room.direct(name, to, text); }
    void block(String other) { room.block(name, other); }
    void receive(String from, String text) { System.out.println(name + " got from " + from + ": " + text); }
}
```
````
