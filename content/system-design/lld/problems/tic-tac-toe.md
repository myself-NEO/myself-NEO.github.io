## Problem statement

Design a game of tic-tac-toe for two players. Players take turns placing their symbol on an N×N board; the first to fill a complete row, column or diagonal wins. If the board fills up with no winner, it's a draw. Players can be humans or computer players.

> [!TIP] Try it first
> This looks trivial, which is exactly why it's used: interviewers watch how you separate the board, rules, turn order and players — and whether your win check is O(1) or rescans the board after every move.

## Clarifying questions

1. Board size — always 3×3, or N×N?
2. Win condition — a full row, or K in a row?
3. Players — two humans, or computer players too?
4. Do we need undo, or a move history?
5. What should happen on an invalid move?

````reveal title="Answers we'll assume"
- **N×N** board (N ≥ 3), with a **full row, column or diagonal** needed to win.
- Two players with symbols X and O; X moves first. Players are **pluggable** (human input or a simple computer strategy).
- Invalid moves (out of bounds, occupied cell, wrong turn, game already over) are **rejected with an exception**, and the game state is unchanged.
- A move history is nice to have; undo is a follow-up.
- No UI — a text rendering is enough.
````

## Requirements

1. Create a game with board size N and two players.
2. Make a move (row, col) for the current player; validate it.
3. After each move, detect win or draw **in O(1)**.
4. Expose game status: `IN_PROGRESS`, `X_WON`, `O_WON`, `DRAW`.
5. Players can be human or computer (strategy).

## Step 1 — Entities

````reveal title="Entities and responsibilities"
| Entity | Responsibility |
|---|---|
| `Game` | Turn order, status, applying moves through the board, the win/draw decision |
| `Board` | Cells; validates and places symbols; read-only view for players |
| `Symbol` | X / O enum (with `opponent()`) |
| `Move` | Record (row, col, symbol) |
| `Player` | Interface: `Move chooseMove(BoardView)`; human and computer implementations |
| `WinTracker` | Row/column/diagonal counters for O(1) win detection |
| `GameStatus` | Enum |

Not needed: `Cell` objects (a 2D array of `Symbol` is enough), a `GameManager` singleton, or a factory.
````

## Step 2 — O(1) win detection

Before opening: how can you tell, after placing a symbol at (r, c), whether that player just won — without scanning rows?

````reveal title="Counter technique"
Keep an integer counter per row, per column, and for the two diagonals. Add **+1 for X and −1 for O**. After a move at (r, c):

- `rows[r] += v`, `cols[c] += v`;
- if `r == c`, `diag += v`; if `r + c == n − 1`, `antiDiag += v`;
- the player wins if any of those four counters reaches **±n**.

Each move is O(1) time, and memory is O(n). A draw is detected when the move count reaches n² without a win.
````

## Step 3 — Class design

```uml title="Tic-tac-toe"
class Game
  - board: Board
  - players: Map<Symbol, Player>
  - current: Symbol
  - status: GameStatus
  - tracker: WinTracker
  + play(row: int, col: int): GameStatus
  + playTurn(): GameStatus
class Board
  - cells: Symbol[][]
  + place(m: Move): void
  + isEmpty(r: int, c: int): boolean
interface Player
  + chooseMove(view: Board, me: Symbol): Move
class FirstFreeCellPlayer
class ScriptedPlayer
class WinTracker
  - rows: int[]
  - cols: int[]
  + record(m: Move): boolean
enum GameStatus
  IN_PROGRESS
  X_WON
  O_WON
  DRAW
Game *-- "1" Board
Game *-- "1" WinTracker
Game --> "2" Player
FirstFreeCellPlayer ..|> Player
ScriptedPlayer ..|> Player
```

```states title="Game status"
[*] --> IN_PROGRESS
IN_PROGRESS --> IN_PROGRESS : valid move, no result
IN_PROGRESS --> X_WON : X completes a line
IN_PROGRESS --> O_WON : O completes a line
IN_PROGRESS --> DRAW : board full
X_WON --> [*]
O_WON --> [*]
DRAW --> [*]
```

## Step 4 — Implementation

````hint title="Hint — where does validation live?"
`Board` validates **geometry** (in bounds, cell empty). `Game` validates **rules** (game not over, correct turn). Neither should do the other's job.
````

````solution title="Complete Java solution"
```java title="TicTacToeDemo.java" file="TicTacToeDemo.java"
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

public class TicTacToeDemo {
    public static void main(String[] args) {
        // Human-like scripted moves for X; a simple computer player for O.
        Game game = new Game(3, new ScriptedPlayer(List.of(new int[]{1, 1}, new int[]{0, 2}, new int[]{2, 0})),
                new FirstFreeCellPlayer());
        while (game.status() == GameStatus.IN_PROGRESS) {
            game.playTurn();
            System.out.println(game.board().render());
        }
        System.out.println("Result: " + game.status() + " after " + game.history().size() + " moves");

        try {
            game.play(0, 1);
        } catch (IllegalStateException e) {
            System.out.println("Rejected: " + e.getMessage());
        }
    }
}

enum Symbol {
    X, O;
    Symbol opponent() { return this == X ? O : X; }
}

enum GameStatus { IN_PROGRESS, X_WON, O_WON, DRAW }

record Move(int row, int col, Symbol symbol) {}

final class Board {
    private final int size;
    private final Symbol[][] cells;

    Board(int size) {
        if (size < 3) throw new IllegalArgumentException("board size must be >= 3");
        this.size = size;
        this.cells = new Symbol[size][size];
    }

    int size() { return size; }

    boolean isEmpty(int r, int c) { return inBounds(r, c) && cells[r][c] == null; }

    void place(Move m) {
        if (!inBounds(m.row(), m.col())) throw new IllegalArgumentException("(" + m.row() + "," + m.col() + ") is off the board");
        if (cells[m.row()][m.col()] != null) throw new IllegalArgumentException("(" + m.row() + "," + m.col() + ") is occupied");
        cells[m.row()][m.col()] = m.symbol();
    }

    String render() {
        StringBuilder sb = new StringBuilder();
        for (Symbol[] row : cells) {
            for (Symbol s : row) sb.append(s == null ? '.' : s.name().charAt(0));
            sb.append('\n');
        }
        return sb.toString().trim();
    }

    private boolean inBounds(int r, int c) { return r >= 0 && c >= 0 && r < size && c < size; }
}

/** O(1) win detection with +1/-1 counters per line. */
final class WinTracker {
    private final int n;
    private final int[] rows, cols;
    private int diag, antiDiag;

    WinTracker(int n) {
        this.n = n;
        this.rows = new int[n];
        this.cols = new int[n];
    }

    /** Records the move and returns true if it completes a line. */
    boolean record(Move m) {
        int v = m.symbol() == Symbol.X ? 1 : -1;
        rows[m.row()] += v;
        cols[m.col()] += v;
        if (m.row() == m.col()) diag += v;
        if (m.row() + m.col() == n - 1) antiDiag += v;
        int target = v * n;
        return rows[m.row()] == target || cols[m.col()] == target || diag == target || antiDiag == target;
    }
}

interface Player {
    Move chooseMove(Board board, Symbol me);
}

/** A trivial computer player: first free cell in reading order. */
final class FirstFreeCellPlayer implements Player {
    public Move chooseMove(Board board, Symbol me) {
        for (int r = 0; r < board.size(); r++)
            for (int c = 0; c < board.size(); c++)
                if (board.isEmpty(r, c)) return new Move(r, c, me);
        throw new IllegalStateException("no free cell");
    }
}

/** Stands in for a human: plays pre-recorded coordinates. */
final class ScriptedPlayer implements Player {
    private final Deque<int[]> moves;
    ScriptedPlayer(List<int[]> moves) { this.moves = new ArrayDeque<>(moves); }
    public Move chooseMove(Board board, Symbol me) {
        int[] rc = moves.poll();
        if (rc == null) throw new IllegalStateException("script exhausted");
        return new Move(rc[0], rc[1], me);
    }
}

final class Game {
    private final Board board;
    private final WinTracker tracker;
    private final Map<Symbol, Player> players = new EnumMap<>(Symbol.class);
    private final List<Move> history = new ArrayList<>();
    private Symbol current = Symbol.X;
    private GameStatus status = GameStatus.IN_PROGRESS;

    Game(int size, Player x, Player o) {
        this.board = new Board(size);
        this.tracker = new WinTracker(size);
        players.put(Symbol.X, x);
        players.put(Symbol.O, o);
    }

    /** Asks the current player for a move and applies it. */
    GameStatus playTurn() {
        requireInProgress();
        Move m = players.get(current).chooseMove(board, current);
        return apply(m);
    }

    /** Applies a move for the current player at (row, col). */
    GameStatus play(int row, int col) {
        requireInProgress();
        return apply(new Move(row, col, current));
    }

    private GameStatus apply(Move m) {
        if (m.symbol() != current) throw new IllegalStateException("it is " + current + "'s turn");
        board.place(m);                        // throws on invalid geometry; nothing changed yet
        history.add(m);
        if (tracker.record(m)) status = current == Symbol.X ? GameStatus.X_WON : GameStatus.O_WON;
        else if (history.size() == board.size() * board.size()) status = GameStatus.DRAW;
        else current = current.opponent();
        return status;
    }

    private void requireInProgress() {
        if (status != GameStatus.IN_PROGRESS) throw new IllegalStateException("game is over: " + status);
    }

    GameStatus status() { return status; }
    Board board() { return board; }
    List<Move> history() { return List.copyOf(history); }
}
```
````

## Design decisions

- **`Board` validates geometry, `Game` validates rules** — clear responsibilities, each testable on its own.
- **`WinTracker` is separate** from the board: the win rule can change (K-in-a-row, or a different board shape) without touching cell storage.
- **`Player` is a strategy**, so humans, scripted players and AIs are interchangeable. The game loop doesn't know which it's talking to.
- **No `Cell` class**: a `Symbol[][]` is enough. Introduce a richer cell only if cells gain behaviour.
- **The move history** is a list of immutable records, which makes undo, replay and logging easy follow-ups.

## Patterns and principles

[Strategy](lesson:strategy) (`Player`), [SRP](lesson:single-responsibility) (`Board` / `WinTracker` / `Game`), [state machine](lesson:state-machines) for status, and [enums with behaviour](lesson:enums-and-records) (`Symbol.opponent()`).

## Example execution flow

The demo pits a scripted "human" X against the first-free-cell computer O, so the run is fully deterministic:

```text
X -> (1,1)   tracker: rows[1]=1 cols[1]=1 diag=1 antiDiag=1
O -> (0,0)   first free cell; rows[0]=-1 cols[0]=-1 diag=0
X -> (0,2)   rows[0]=0 cols[2]=1 antiDiag=2
O -> (0,1)   first free cell
X -> (2,0)   antiDiag = 3 = n  ->  X_WON  (no board scan needed)
play(0,1)    game is over -> IllegalStateException
```

Program output:

```text
...
.X.
...
O..
.X.
...
O.X
.X.
...
OOX
.X.
...
OOX
.X.
X..
Result: X_WON after 5 moves
Rejected: game is over: X_WON
```

## Edge cases

- Move after the game ended → `IllegalStateException`.
- Out-of-bounds or occupied cell → `IllegalArgumentException`, and the state is unchanged (no turn switch).
- A win on the very last cell → reported as a win, not a draw (the win is checked first).
- N = 1 or 2 → rejected (meaningless games).
- Anti-diagonal on even N (for example, 4×4): `r + c == n − 1` is correct for any N.

## Tests

```java title="TicTacToeTest.java" file="TicTacToeTest.java" test="TicTacToeDemo.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class TicTacToeTest {
    private static Game humanGame(int n) {
        return new Game(n, new FirstFreeCellPlayer(), new FirstFreeCellPlayer());
    }

    @Test
    void rowWin() {
        Game g = humanGame(3);
        g.play(0, 0); g.play(1, 0);
        g.play(0, 1); g.play(1, 1);
        assertEquals(GameStatus.X_WON, g.play(0, 2));
    }

    @Test
    void columnWinForO() {
        Game g = humanGame(3);
        g.play(0, 0); g.play(0, 1);
        g.play(1, 0); g.play(1, 1);
        g.play(2, 2); 
        assertEquals(GameStatus.O_WON, g.play(2, 1));
    }

    @Test
    void antiDiagonalWinOnFourByFour() {
        Game g = humanGame(4);
        int[][] xs = {{0, 3}, {1, 2}, {2, 1}, {3, 0}};
        int[][] os = {{0, 0}, {0, 1}, {0, 2}};
        for (int i = 0; i < 3; i++) { g.play(xs[i][0], xs[i][1]); g.play(os[i][0], os[i][1]); }
        assertEquals(GameStatus.X_WON, g.play(3, 0));
    }

    @Test
    void drawWhenBoardFills() {
        Game g = humanGame(3);
        int[][] moves = {{0, 0}, {0, 1}, {0, 2}, {1, 1}, {1, 0}, {1, 2}, {2, 1}, {2, 0}, {2, 2}};
        GameStatus s = null;
        for (int[] m : moves) s = g.play(m[0], m[1]);
        assertEquals(GameStatus.DRAW, s);
    }

    @Test
    void invalidMovesDoNotChangeTurn() {
        Game g = humanGame(3);
        g.play(1, 1);                                                   // X
        assertThrows(IllegalArgumentException.class, () -> g.play(1, 1)); // O tries an occupied cell
        assertThrows(IllegalArgumentException.class, () -> g.play(3, 0)); // off the board
        g.play(0, 0);                                                   // still O's turn
        assertEquals(Symbol.O, g.history().get(1).symbol());
    }

    @Test
    void noMovesAfterGameOver() {
        Game g = humanGame(3);
        g.play(0, 0); g.play(1, 0); g.play(0, 1); g.play(1, 1); g.play(0, 2);
        assertThrows(IllegalStateException.class, () -> g.play(2, 2));
    }
}
```

## Concurrency

Turn-based and single-threaded by nature. If the game is played over a network (two clients), wrap `play` in `synchronized` and validate "is it your turn?" against the authenticated player rather than trusting the client. Two simultaneous submissions for the same turn then can't both apply.

## Common mistakes and alternatives

- **Scanning the whole board after each move** — O(n²) per move. Fine for 3×3, but interviewers often ask for the O(1) counter trick.
- **The board deciding whose turn it is** — mixes the board's geometry with the game's rules.
- **`if (player.type == HUMAN)` branches** in the game loop instead of a `Player` strategy.
- **Switching turns before validating** the move.
- **Alternative:** K-in-a-row on large boards (Gomoku): counters don't work. Check the four directions from the last move, counting consecutive symbols — O(K) per move.

## Follow-up questions

````reveal title="Support undo"
The history is already a list of `Move` records. `undo()` pops the last move, clears the cell, reverses the counters (`record` with the negated value) and restores the turn and status. That's the [Command](lesson:command) idea, with moves as data.
````

````reveal title="Smarter computer player"
Add `MinimaxPlayer implements Player`. Minimax explores the game tree on a **copy** of the board (see [Prototype](lesson:prototype)), with alpha-beta pruning for larger boards. `Game` is unchanged.
````

````reveal title="K-in-a-row on an N×N board"
Replace `WinTracker` with a `LineChecker` interface: `CounterLineChecker` for full lines and `DirectionalLineChecker(k)` that counts consecutive symbols in the 4 directions from the last move. Inject it into `Game`.
````

## Complexity

- `play`: **O(1)** time (array access + four counter updates).
- Memory: O(n²) for the board + O(n) for the counters.

## Interviewer checklist

- [ ] Board size and win rule clarified
- [ ] Separate board, rules and players
- [ ] O(1) win detection explained
- [ ] Invalid moves rejected without changing state
- [ ] Draw detection; win checked before draw
- [ ] Players pluggable via an interface
- [ ] Follow-ups: undo, AI, K-in-a-row as local changes
