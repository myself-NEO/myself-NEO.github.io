## Problem statement

Design a two-player chess game. The board starts in the standard position; players alternate moves; each piece moves by its own rules; a move that leaves your own king in check is illegal. The game detects check, checkmate and stalemate, and supports undoing moves.

> [!TIP] Try it first
> Every piece "knows how it moves" — but **legality depends on the whole board** (you can't leave your king in check). Decide which part of the rules lives in the pieces and which part lives in the game.

## Clarifying questions

1. Full rules, or a subset? Castling, en passant, promotion?
2. Draws: stalemate only, or also threefold repetition and the 50-move rule?
3. Input format: algebraic notation (`Nf3`) or squares (`g1 f3`)?
4. Do we need undo? Move history?
5. Clocks? An AI opponent? Online play?

````reveal title="Answers we'll assume"
- Standard moves for all six pieces, captures, **pawn promotion (to a queen)**, check, checkmate and stalemate. **Castling and en passant are follow-ups** — the design must make them easy to add.
- Stalemate is the only draw for now.
- Moves are given as two squares: `move("e2", "e4")`.
- **Undo** is required, and the game keeps a move history.
- No clocks, no AI, no networking.
````

## Requirements

**Functional**

1. Set up the standard position; white moves first; turns alternate.
2. Reject moves that are off-pattern, blocked, capture your own piece, or leave your king in check.
3. After each move, report `ACTIVE`, `CHECK`, `CHECKMATE` or `STALEMATE`.
4. Promote a pawn reaching the last rank to a queen.
5. Undo the last move (including captures and promotions).

**Non-functional**

6. Adding a piece type or a special move doesn't require editing the others.
7. Positions can be set up directly, for tests.

## Step 1 — Split the rules

````reveal title="Pseudo-legal moves vs legal moves"
- **Pseudo-legal** moves come from the piece's movement pattern on the current board: a rook slides until blocked, a knight jumps, a pawn pushes or captures diagonally. Each `Piece` subclass answers this — polymorphism.
- **Legal** moves are the pseudo-legal ones that don't leave your own king attacked. That needs the whole board, so the `Game` decides it: **make the move, ask "is my king attacked?", undo it**.

"Is square X attacked by colour C?" asks every piece of C for the squares it **attacks**. For most pieces that's the same as its moves; a pawn is the exception (it attacks diagonally even when it can't move there), so `Pawn` overrides `attacks`.

Checkmate and stalemate fall out of the same tool: the side to move has **no legal move**; it's mate if their king is attacked, stalemate otherwise.
````

## Step 2 — Class design

```uml title="Chess"
class Game
  - board: Board
  - turn: Color
  - status: GameStatus
  - history: Deque<Move>
  + move(from: String, to: String): GameStatus
  + undo(): void
class Board
  - grid: Piece[8][8]
  + get(s: Square): Piece
  + set(s: Square, p: Piece): void
  + isAttacked(s: Square, by: Color): boolean
  + isInCheck(c: Color): boolean
abstract class Piece
  - color: Color
  + moves(b: Board, from: Square): List<Square>
  + attacks(b: Board, from: Square): List<Square>
  # slide(b: Board, from: Square, dirs: int[][]): List<Square>
  # jump(b: Board, from: Square, offsets: int[][]): List<Square>
class King
class Queen
class Rook
class Bishop
class Knight
class Pawn
class Move
  - from: Square
  - to: Square
  - moved: Piece
  - captured: Piece
  + execute(b: Board): void
  + undo(b: Board): void
record Square
  + file: int
  + rank: int
enum GameStatus
  ACTIVE
  CHECK
  CHECKMATE
  STALEMATE
Game *-- "1" Board
Game o-- "0..*" Move
Board o-- "0..32" Piece
King --|> Piece
Queen --|> Piece
Rook --|> Piece
Bishop --|> Piece
Knight --|> Piece
Pawn --|> Piece
```

## Step 3 — Implementation

````hint title="Hint — moves as commands"
Make `Move` a command with `execute(board)` and `undo(board)`. It remembers the captured piece (and the original pawn when promoting). The same object then serves three purposes: playing a move, testing a move for legality (execute, check, undo), and the undo history.
````

````solution title="Complete Java solution"
```java title="ChessDemo.java" file="ChessDemo.java"
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

public class ChessDemo {
    public static void main(String[] args) {
        Game game = new Game();
        attempt(game, "e7", "e5");                 // black can't move first
        play(game, "e2", "e4");
        play(game, "e7", "e5");
        play(game, "f1", "c4");
        play(game, "b8", "c6");
        play(game, "d1", "h5");
        attempt(game, "f7", "f6");                 // would expose the black king to the queen on h5
        attempt(game, "c6", "c4");                 // not a knight move
        play(game, "g8", "f6");
        play(game, "h5", "f7");                    // scholar's mate
        System.out.print(game.board().render());
        attempt(game, "e8", "f7");

        game.undo();
        System.out.println("after undo: " + game.status() + ", " + game.turn() + " to move, f7 holds a "
                + game.board().get(Square.of("f7")).name());
        System.out.println("history: " + game.history());
    }

    static void play(Game game, String from, String to) {
        GameStatus s = game.move(from, to);
        System.out.println(game.history().get(game.history().size() - 1) + " -> " + s
                + (s == GameStatus.CHECKMATE ? " (" + game.winner() + " wins)" : ""));
    }

    static void attempt(Game game, String from, String to) {
        try {
            play(game, from, to);
        } catch (ChessException e) {
            System.out.println("Rejected " + from + "-" + to + ": " + e.getMessage());
        }
    }
}

class ChessException extends RuntimeException {
    ChessException(String message) { super(message); }
}

enum Color {
    WHITE, BLACK;
    Color opponent() { return this == WHITE ? BLACK : WHITE; }
}

enum GameStatus { ACTIVE, CHECK, CHECKMATE, STALEMATE }

/** file 0..7 = a..h, rank 0..7 = 1..8. May be off the board while generating moves. */
record Square(int file, int rank) {
    static Square of(String s) {
        if (s.length() != 2 || s.charAt(0) < 'a' || s.charAt(0) > 'h' || s.charAt(1) < '1' || s.charAt(1) > '8') {
            throw new ChessException("bad square " + s);
        }
        return new Square(s.charAt(0) - 'a', s.charAt(1) - '1');
    }

    boolean onBoard() { return file >= 0 && file < 8 && rank >= 0 && rank < 8; }
    Square plus(int df, int dr) { return new Square(file + df, rank + dr); }

    @Override public String toString() { return "" + (char) ('a' + file) + (rank + 1); }
}

// ---------- Pieces ----------

abstract class Piece {
    static final int[][] STRAIGHT = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
    static final int[][] DIAGONAL = {{1, 1}, {1, -1}, {-1, 1}, {-1, -1}};
    static final int[][] ALL_DIRECTIONS = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}, {1, 1}, {1, -1}, {-1, 1}, {-1, -1}};

    final Color color;

    Piece(Color color) { this.color = color; }

    abstract String name();
    abstract char letter();

    /** Pseudo-legal destinations: the movement pattern on this board, ignoring checks. */
    abstract List<Square> moves(Board board, Square from);

    /** Squares this piece threatens. Same as moves for every piece except the pawn. */
    List<Square> attacks(Board board, Square from) { return moves(board, from); }

    char symbol() { return color == Color.WHITE ? letter() : Character.toLowerCase(letter()); }

    protected List<Square> slide(Board board, Square from, int[][] directions) {
        List<Square> out = new ArrayList<>();
        for (int[] d : directions) {
            for (Square s = from.plus(d[0], d[1]); s.onBoard(); s = s.plus(d[0], d[1])) {
                Piece p = board.get(s);
                if (p == null) {
                    out.add(s);
                    continue;
                }
                if (p.color != color) out.add(s);             // capture, then stop
                break;
            }
        }
        return out;
    }

    protected List<Square> jump(Board board, Square from, int[][] offsets) {
        List<Square> out = new ArrayList<>();
        for (int[] o : offsets) {
            Square s = from.plus(o[0], o[1]);
            if (s.onBoard() && (board.get(s) == null || board.get(s).color != color)) out.add(s);
        }
        return out;
    }
}

final class King extends Piece {
    King(Color c) { super(c); }
    String name() { return "King"; }
    char letter() { return 'K'; }
    List<Square> moves(Board b, Square from) { return jump(b, from, ALL_DIRECTIONS); }
}

final class Queen extends Piece {
    Queen(Color c) { super(c); }
    String name() { return "Queen"; }
    char letter() { return 'Q'; }
    List<Square> moves(Board b, Square from) { return slide(b, from, ALL_DIRECTIONS); }
}

final class Rook extends Piece {
    Rook(Color c) { super(c); }
    String name() { return "Rook"; }
    char letter() { return 'R'; }
    List<Square> moves(Board b, Square from) { return slide(b, from, STRAIGHT); }
}

final class Bishop extends Piece {
    Bishop(Color c) { super(c); }
    String name() { return "Bishop"; }
    char letter() { return 'B'; }
    List<Square> moves(Board b, Square from) { return slide(b, from, DIAGONAL); }
}

final class Knight extends Piece {
    private static final int[][] L_SHAPES = {{1, 2}, {2, 1}, {2, -1}, {1, -2}, {-1, -2}, {-2, -1}, {-2, 1}, {-1, 2}};
    Knight(Color c) { super(c); }
    String name() { return "Knight"; }
    char letter() { return 'N'; }
    List<Square> moves(Board b, Square from) { return jump(b, from, L_SHAPES); }
}

final class Pawn extends Piece {
    Pawn(Color c) { super(c); }
    String name() { return "Pawn"; }
    char letter() { return 'P'; }

    int direction() { return color == Color.WHITE ? 1 : -1; }
    int lastRank() { return color == Color.WHITE ? 7 : 0; }

    List<Square> moves(Board b, Square from) {
        List<Square> out = new ArrayList<>();
        Square one = from.plus(0, direction());
        if (one.onBoard() && b.get(one) == null) {
            out.add(one);
            Square two = from.plus(0, 2 * direction());
            int startRank = color == Color.WHITE ? 1 : 6;
            if (from.rank() == startRank && b.get(two) == null) out.add(two);
        }
        for (Square s : attacks(b, from)) {
            if (b.get(s) != null && b.get(s).color != color) out.add(s);   // diagonal only to capture
        }
        return out;
    }

    @Override List<Square> attacks(Board b, Square from) {
        List<Square> out = new ArrayList<>();
        for (int df : new int[] {-1, 1}) {
            Square s = from.plus(df, direction());
            if (s.onBoard()) out.add(s);
        }
        return out;
    }
}

// ---------- Board ----------

final class Board {
    private final Piece[][] grid = new Piece[8][8];

    static Board empty() { return new Board(); }

    static Board standard() {
        Board b = new Board();
        String backRank = "RNBQKBNR";
        for (int f = 0; f < 8; f++) {
            b.grid[f][0] = create(backRank.charAt(f), Color.WHITE);
            b.grid[f][1] = new Pawn(Color.WHITE);
            b.grid[f][6] = new Pawn(Color.BLACK);
            b.grid[f][7] = create(backRank.charAt(f), Color.BLACK);
        }
        return b;
    }

    /** Factory method for set-up. */
    static Piece create(char letter, Color c) {
        return switch (letter) {
            case 'K' -> new King(c);
            case 'Q' -> new Queen(c);
            case 'R' -> new Rook(c);
            case 'B' -> new Bishop(c);
            case 'N' -> new Knight(c);
            case 'P' -> new Pawn(c);
            default -> throw new IllegalArgumentException("unknown piece " + letter);
        };
    }

    Board place(String square, Piece p) {
        set(Square.of(square), p);
        return this;
    }

    Piece get(Square s) { return grid[s.file()][s.rank()]; }
    void set(Square s, Piece p) { grid[s.file()][s.rank()] = p; }

    List<Square> squaresOf(Color c) {
        List<Square> out = new ArrayList<>();
        for (int f = 0; f < 8; f++) {
            for (int r = 0; r < 8; r++) if (grid[f][r] != null && grid[f][r].color == c) out.add(new Square(f, r));
        }
        return out;
    }

    boolean isAttacked(Square target, Color by) {
        for (Square s : squaresOf(by)) if (get(s).attacks(this, s).contains(target)) return true;
        return false;
    }

    boolean isInCheck(Color c) {
        for (Square s : squaresOf(c)) if (get(s) instanceof King) return isAttacked(s, c.opponent());
        throw new IllegalStateException(c + " has no king");
    }

    String render() {
        StringBuilder sb = new StringBuilder();
        for (int r = 7; r >= 0; r--) {
            sb.append(r + 1);
            for (int f = 0; f < 8; f++) sb.append(' ').append(grid[f][r] == null ? '.' : grid[f][r].symbol());
            sb.append('\n');
        }
        return sb.append("  a b c d e f g h\n").toString();
    }
}

// ---------- Moves (commands) ----------

final class Move {
    private final Square from;
    private final Square to;
    private final Piece moved;
    private Piece captured;
    private Piece placed;

    Move(Square from, Square to, Piece moved) {
        this.from = from;
        this.to = to;
        this.moved = moved;
    }

    void execute(Board b) {
        captured = b.get(to);
        boolean promotes = moved instanceof Pawn pawn && to.rank() == pawn.lastRank();
        placed = promotes ? new Queen(moved.color) : moved;
        b.set(to, placed);
        b.set(from, null);
    }

    void undo(Board b) {
        b.set(from, moved);                                    // the original pawn comes back, not the queen
        b.set(to, captured);
    }

    @Override public String toString() {
        return "" + moved.letter() + from + (captured == null ? "-" : "x") + to + (placed != moved ? "=Q" : "");
    }
}

// ---------- Game ----------

final class Game {
    private final Board board;
    private final Deque<Move> history = new ArrayDeque<>();
    private Color turn;
    private GameStatus status;

    Game() { this(Board.standard(), Color.WHITE); }

    Game(Board board, Color toMove) {
        this.board = board;
        this.turn = toMove;
        this.status = evaluate();
    }

    synchronized GameStatus move(String fromSquare, String toSquare) {
        if (status == GameStatus.CHECKMATE || status == GameStatus.STALEMATE) throw new ChessException("the game is over");
        Square from = Square.of(fromSquare);
        Square to = Square.of(toSquare);
        Piece piece = board.get(from);
        if (piece == null) throw new ChessException("no piece on " + from);
        if (piece.color != turn) throw new ChessException("it is " + turn + "'s turn");
        if (!piece.moves(board, from).contains(to)) throw new ChessException("illegal move for " + piece.name());
        Move m = new Move(from, to, piece);
        m.execute(board);
        if (board.isInCheck(turn)) {
            m.undo(board);
            throw new ChessException("move would leave the " + turn + " king in check");
        }
        history.addLast(m);
        turn = turn.opponent();
        status = evaluate();
        return status;
    }

    synchronized void undo() {
        Move last = history.pollLast();
        if (last == null) throw new ChessException("nothing to undo");
        last.undo(board);
        turn = turn.opponent();
        status = evaluate();
    }

    synchronized GameStatus status() { return status; }
    synchronized Color turn() { return turn; }
    synchronized Color winner() { return status == GameStatus.CHECKMATE ? turn.opponent() : null; }
    synchronized List<String> history() { return history.stream().map(Move::toString).toList(); }
    Board board() { return board; }

    private GameStatus evaluate() {
        boolean inCheck = board.isInCheck(turn);
        if (hasLegalMove(turn)) return inCheck ? GameStatus.CHECK : GameStatus.ACTIVE;
        return inCheck ? GameStatus.CHECKMATE : GameStatus.STALEMATE;
    }

    /** Tries every pseudo-legal move: execute, test, undo. */
    private boolean hasLegalMove(Color c) {
        for (Square from : board.squaresOf(c)) {
            Piece p = board.get(from);
            for (Square to : p.moves(board, from)) {
                Move m = new Move(from, to, p);
                m.execute(board);
                boolean legal = !board.isInCheck(c);
                m.undo(board);
                if (legal) return true;
            }
        }
        return false;
    }
}
```
````

## Design decisions

- **Polymorphic move generation.** Each piece class implements `moves`; the game never switches on piece type. A new fairy piece is one subclass (see [The four pillars](lesson:four-pillars)).
- **An abstract class, not an interface, for `Piece`.** Pieces share state (colour) and helpers (`slide`, `jump`), which an abstract class can hold (see [Interfaces vs abstract classes](lesson:interfaces-vs-abstract-classes)).
- **`attacks` vs `moves`.** The pawn is the one piece whose threatened squares differ from where it may move. Overriding `attacks` keeps every piece substitutable in `isAttacked` — the contract is "squares you threaten", and the pawn honours it (see [Liskov substitution](lesson:liskov-substitution)).
- **Legality in `Game`, by simulation.** Make the move, check the king, undo. No special cases for pins or discovered checks — they're all "your king ends up attacked".
- **Moves are commands.** `Move.execute`/`undo` give us undo, legality testing and a printable history from one class (see [Command](lesson:command)).
- **`Board.create` as a factory** for set-up, so positions can be built from letters in tests (see [Factory Method](lesson:factory-method)).

## Patterns and principles

[Command](lesson:command) (`Move`), polymorphism and [Liskov substitution](lesson:liskov-substitution) (`Piece` subclasses), shared helpers in an [abstract base class](lesson:interfaces-vs-abstract-classes), [Factory Method](lesson:factory-method) (`Board.create`), and [Strategy](lesson:strategy) in spirit: each piece is the movement strategy for its square.

## Example execution flow

```text
move(e7, e5)   piece is BLACK, turn is WHITE -> rejected
e2-e4, e7-e5, Bf1-c4, Nb8-c6, Qd1-h5
move(f7, f6)   pawn push is pseudo-legal; execute; is BLACK king attacked?
               Queen h5 slides g6, f7 (now empty), e8 -> yes -> undo, rejected
move(c6, c4)   c4 not in the knight's L-shapes -> rejected
Ng8-f6
Qh5xf7         execute (captures pawn); BLACK to move and in check
               try every black move -> none legal -> CHECKMATE
undo           restore the queen to h5 and the pawn to f7; WHITE to move; ACTIVE
```

```text title="Program output"
Rejected e7-e5: it is WHITE's turn
Pe2-e4 -> ACTIVE
Pe7-e5 -> ACTIVE
Bf1-c4 -> ACTIVE
Nb8-c6 -> ACTIVE
Qd1-h5 -> ACTIVE
Rejected f7-f6: move would leave the BLACK king in check
Rejected c6-c4: illegal move for Knight
Ng8-f6 -> ACTIVE
Qh5xf7 -> CHECKMATE (WHITE wins)
8 r . b q k b . r
7 p p p p . Q p p
6 . . n . . n . .
5 . . . . p . . .
4 . . B . P . . .
3 . . . . . . . .
2 P P P P . P P P
1 R N B . K . N R
  a b c d e f g h
Rejected e8-f7: the game is over
after undo: ACTIVE, WHITE to move, f7 holds a Pawn
history: [Pe2-e4, Pe7-e5, Bf1-c4, Nb8-c6, Qd1-h5, Ng8-f6]
```

## Edge cases

- **Moving the opponent's piece, or from an empty square** → rejected.
- **Sliding through pieces / capturing your own** → never generated.
- **Pinned pieces and discovered checks** → caught by the simulate-and-check rule.
- **King moving next to the enemy king** → the enemy king "attacks" that square, so it's illegal.
- **Pawn diagonal without a capture** → not a move, but still an attacked square.
- **Promotion** → a queen appears; undo brings back the pawn.
- **Stalemate** → no legal move and not in check → draw.

## Tests

```java title="ChessTest.java" file="ChessTest.java" test="ChessDemo.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class ChessTest {
    @Test
    void whiteMovesFirstAndTurnsAlternate() {
        Game g = new Game();
        assertThrows(ChessException.class, () -> g.move("d7", "d5"));
        g.move("d2", "d4");
        assertThrows(ChessException.class, () -> g.move("e2", "e4"));
        g.move("d7", "d5");
    }

    @Test
    void blockedPiecesCannotMoveButKnightsJump() {
        Game g = new Game();
        assertThrows(ChessException.class, () -> g.move("a1", "a3"));
        assertThrows(ChessException.class, () -> g.move("c1", "e3"));
        assertEquals(GameStatus.ACTIVE, g.move("g1", "f3"));
    }

    @Test
    void pinnedPieceCannotLeaveTheLine() {
        Board b = Board.empty().place("e1", new King(Color.WHITE)).place("e2", new Rook(Color.WHITE))
                .place("e8", new Rook(Color.BLACK)).place("a8", new King(Color.BLACK));
        Game g = new Game(b, Color.WHITE);
        assertThrows(ChessException.class, () -> g.move("e2", "d2"));
        g.move("e2", "e5");                                      // moving along the pin is fine
    }

    @Test
    void foolsMateIsCheckmate() {
        Game g = new Game();
        g.move("f2", "f3");
        g.move("e7", "e5");
        g.move("g2", "g4");
        assertEquals(GameStatus.CHECKMATE, g.move("d8", "h4"));
        assertEquals(Color.BLACK, g.winner());
    }

    @Test
    void stalemateIsDetected() {
        Board b = Board.empty().place("f7", new King(Color.WHITE)).place("g6", new Queen(Color.WHITE)).place("h8", new King(Color.BLACK));
        assertEquals(GameStatus.STALEMATE, new Game(b, Color.BLACK).status());
    }

    @Test
    void promotionGivesCheckAndUndoRestoresThePawn() {
        Board b = Board.empty().place("e1", new King(Color.WHITE)).place("a7", new Pawn(Color.WHITE)).place("e8", new King(Color.BLACK));
        Game g = new Game(b, Color.WHITE);
        assertEquals(GameStatus.CHECK, g.move("a7", "a8"));
        assertInstanceOf(Queen.class, b.get(Square.of("a8")));
        g.undo();
        assertInstanceOf(Pawn.class, b.get(Square.of("a7")));
        assertEquals(null, b.get(Square.of("a8")));
    }
}
```

## Concurrency

Chess is turn-based: `Game.move` and `undo` are `synchronized` so two clients (say, a double-click) can't interleave a move. In an online version, each game is an actor or has its own lock; moves carry the **move number** they were made against, and a move for a stale position is rejected (optimistic concurrency, see [Race conditions](lesson:concurrent-state-transitions)).

## Common mistakes and alternatives

- **A giant `switch (pieceType)`** in the game for move rules — every new piece or rule edits it.
- **Checking pins with special-case geometry** — simulate-and-check is simpler and catches everything.
- **Using `moves` to test attacks** — pawns then "attack" the square in front of them, and kings can walk into pawn attacks.
- **Undo by replaying the game from the start** — works, but O(n) per undo; commands make it O(1).
- **Alternative:** bitboards (one 64-bit mask per piece type) for an engine that searches millions of positions; overkill for game logic and much harder to read.

## Follow-up questions

````reveal title="Add castling"
Castling needs history (has the king or rook moved?) and attack checks on the squares the king passes. Track a `hasMoved` flag per piece (set by `Move.execute`, restored by `undo`). `King.moves` adds castling destinations when the flags and empty squares allow; `Game` additionally rejects castling out of, through, or into check. `Move` gets a `CastlingMove` subclass that also moves the rook.
````

````reveal title="Add en passant"
The right to capture en passant exists only immediately after a two-square pawn push. Keep `enPassantTarget` on the board (set by the push, cleared by the next move, restored on undo). `Pawn.moves` adds it as a diagonal destination; an `EnPassantMove` removes the pawn **beside** the destination.
````

````reveal title="Threefold repetition"
Hash the position (pieces, side to move, castling and en passant rights) after each move — Zobrist hashing makes this O(1) incrementally — and count occurrences in a map. Undo decrements the count.
````

## Complexity

- Pseudo-legal moves for one piece: O(8) to O(27).
- `isAttacked`: O(pieces × moves) ≈ O(16 × 27).
- Legality of one move: one execute/check/undo, so the same.
- Checkmate detection: O(all moves × isAttacked) — tiny for a single position.

## Interviewer checklist

- [ ] Pieces as polymorphic subclasses; no type switch in the game
- [ ] Pseudo-legal vs legal split; king safety by simulation
- [ ] Pawn's attacks differ from its moves (LSP discussion)
- [ ] Move as a command with undo
- [ ] Check, checkmate and stalemate from "no legal moves"
- [ ] Castling/en passant/promotion extensions sketched
