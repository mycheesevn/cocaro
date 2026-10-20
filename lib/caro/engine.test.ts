// Engine rules tests: the Vietnamese win rule (exactly-5 needs an open
// end; overline always wins), move legality, undo, draws, setup states.

import {
  CaroState,
  EMPTY,
  O,
  Player,
  X,
  applyMove,
  createFromBoard,
  createGame,
  getResult,
  idxOf,
  legalMoves,
  stateKey,
  undoMove,
} from "./engine";
import { Counts, check, newCounts } from "./tests/assert";

/** Build a board array from [x, y, stone] triples. */
function boardWith(
  size: number,
  stones: Array<[number, number, Player]>
): Int8Array {
  const b = new Int8Array(size * size);
  for (const [x, y, s] of stones) b[idxOf(size, x, y)] = s;
  return b;
}

function setup(
  size: number,
  stones: Array<[number, number, Player]>,
  turn: Player
): CaroState {
  return createFromBoard(size, boardWith(size, stones), turn);
}

/** Play a sequence of [x, y] moves (engine enforces alternation). */
function play(state: CaroState, cells: Array<[number, number]>): boolean {
  for (const [x, y] of cells) {
    if (!applyMove(state, idxOf(state.size, x, y))) return false;
  }
  return true;
}

/** Harmless filler cells on row 14 of a 15x15 board, spaced so no two
 *  are ever adjacent (they can never form a run). */
const FILLERS: Array<[number, number]> = [
  [0, 14],
  [2, 14],
  [4, 14],
  [6, 14],
  [8, 14],
  [10, 14],
  [12, 14],
  [14, 14],
];

export function runEngineTests(): Counts {
  const c = newCounts();
  console.log("engine: basics");
  {
    const g = createGame(15);
    check(c, "new game: X to move, ongoing", g.turn === X && getResult(g).status === "ongoing");
    check(c, "new game: 225 legal moves", legalMoves(g).length === 225);
    check(c, "sizes 10/20 accepted", createGame(10).board.length === 100 && createGame(20).board.length === 400);
    check(c, "applyMove ok + turn flips", applyMove(g, idxOf(15, 7, 7)) && g.turn === O);
    check(c, "legal moves shrink by one", legalMoves(g).length === 224);
    const before = stateKey(g);
    check(c, "occupied cell rejected", !applyMove(g, idxOf(15, 7, 7)));
    check(c, "out-of-range rejected", !applyMove(g, -1) && !applyMove(g, 225));
    check(c, "state untouched after rejects", stateKey(g) === before);
  }

  console.log("engine: straight wins by play");
  {
    // Horizontal five, open ends.
    const g = createGame(15);
    const ok = play(g, [
      [3, 7], FILLERS[0], [4, 7], FILLERS[1], [5, 7], FILLERS[2], [6, 7], FILLERS[3],
    ]);
    check(c, "h5: ongoing before the fifth stone", ok && getResult(g).status === "ongoing");
    check(c, "h5: fifth stone wins", applyMove(g, idxOf(15, 7, 7)) && getResult(g).status === "x-win");
    const run = getResult(g).winningRun ?? [];
    check(c, "h5: winning run is the five cells", run.length === 5 && run[0] === idxOf(15, 3, 7) && run[4] === idxOf(15, 7, 7));
    check(c, "no moves after game over", !applyMove(g, idxOf(15, 0, 0)) && legalMoves(g).length === 0);

    // Vertical five.
    const v = createGame(15);
    play(v, [[7, 3], FILLERS[0], [7, 4], FILLERS[1], [7, 5], FILLERS[2], [7, 6], FILLERS[3], [7, 7]]);
    check(c, "vertical five wins", getResult(v).status === "x-win");

    // Diagonal ↘ five.
    const d1 = createGame(15);
    play(d1, [[3, 3], FILLERS[0], [4, 4], FILLERS[1], [5, 5], FILLERS[2], [6, 6], FILLERS[3], [7, 7]]);
    check(c, "diagonal ↘ five wins", getResult(d1).status === "x-win");

    // Diagonal ↗ five.
    const d2 = createGame(15);
    play(d2, [[3, 11], FILLERS[0], [4, 10], FILLERS[1], [5, 9], FILLERS[2], [6, 8], FILLERS[3], [7, 7]]);
    check(c, "diagonal ↗ five wins", getResult(d2).status === "x-win");

    // Gap fill completes exactly five: XXX_X -> XXXXX.
    const gap = createGame(15);
    play(gap, [[3, 7], FILLERS[0], [4, 7], FILLERS[1], [5, 7], FILLERS[2], [7, 7], FILLERS[3]]);
    check(c, "gap-four is not yet a win", getResult(gap).status === "ongoing");
    check(c, "filling the gap wins", applyMove(gap, idxOf(15, 6, 7)) && getResult(gap).status === "x-win");
  }

  console.log("engine: the Vietnamese exactly-5 rule (setup states)");
  {
    // Exactly 5, one end blocked by a stone, other end open -> WIN.
    const s1 = setup(15, [
      [2, 7, O], [3, 7, X], [4, 7, X], [5, 7, X], [6, 7, X], [7, 7, X],
    ], O);
    check(c, "exactly-5, one end stone-blocked, one open: win", getResult(s1).status === "x-win");

    // Exactly 5, BOTH ends blocked by stones -> NOT a win, play continues.
    const s2 = setup(15, [
      [2, 7, O], [3, 7, X], [4, 7, X], [5, 7, X], [6, 7, X], [7, 7, X], [8, 7, O],
    ], O);
    check(c, "exactly-5, both ends stone-blocked: NOT a win", getResult(s2).status === "ongoing");
    check(c, "blocked-5 game continues (O can move)", applyMove(s2, idxOf(15, 0, 0)));

    // Exactly 5, one end at the board edge, other end blocked by a stone -> NOT a win.
    const s3 = setup(15, [
      [0, 7, X], [1, 7, X], [2, 7, X], [3, 7, X], [4, 7, X], [5, 7, O],
    ], O);
    check(c, "exactly-5, edge + stone-blocked: NOT a win", getResult(s3).status === "ongoing");

    // Exactly 5, one end at the board edge, other end open -> WIN.
    const s4 = setup(15, [
      [0, 7, X], [1, 7, X], [2, 7, X], [3, 7, X], [4, 7, X],
    ], O);
    check(c, "exactly-5, edge + open end: win", getResult(s4).status === "x-win");

    // Blocked-5 completed by PLAY (blockers placed first) -> still ongoing.
    const g = createGame(15);
    play(g, [
      [3, 7], [2, 7], // X stone, O blocker left
      [4, 7], [8, 7], // X stone, O blocker right
      [5, 7], FILLERS[0],
      [6, 7], FILLERS[1],
      [7, 7], // completes exactly-5 with both ends blocked
    ]);
    check(c, "blocked-5 completed in play: NOT a win", getResult(g).status === "ongoing");
    check(c, "blocked-5: next move still applies", applyMove(g, idxOf(15, 0, 0)));
  }

  console.log("engine: overline (6+) always wins");
  {
    // Gap-fill creates a 6-run with BOTH ends blocked by stones -> WIN.
    const s = setup(15, [
      [2, 7, O], [9, 7, O],
      [3, 7, X], [4, 7, X], [5, 7, X], [7, 7, X], [8, 7, X],
    ], X);
    check(c, "overline setup is ongoing", getResult(s).status === "ongoing");
    check(c, "filling the middle makes 6 and wins despite blocked ends",
      applyMove(s, idxOf(15, 6, 7)) && getResult(s).status === "x-win");
    const run = getResult(s).winningRun ?? [];
    check(c, "overline winning run has 6 cells", run.length === 6);

    // A pre-formed 6-run (setup scan) also wins.
    const s2 = setup(15, [
      [3, 3, O], [4, 3, O], [5, 3, O], [6, 3, O], [7, 3, O], [8, 3, O],
    ], X);
    check(c, "setup scan: O overline wins", getResult(s2).status === "o-win");
  }

  console.log("engine: draw on a full board");
  {
    // 2-wide stripe tiling: max run in any direction is 2, and the stone
    // counts balance 50/50 on 10x10 — a genuine full-board draw.
    const size = 10;
    const cells = new Int8Array(size * size);
    let xs = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const isX = ((x >> 1) + y) % 2 === 0;
        cells[idxOf(size, x, y)] = isX ? X : O;
        if (isX) xs++;
      }
    }
    check(c, "draw pattern balances 50/50", xs === 50);
    const s = createFromBoard(size, cells, X);
    check(c, "full board with no winning run: draw", getResult(s).status === "draw",
      `got ${getResult(s).status}`);
    check(c, "draw: no legal moves", legalMoves(s).length === 0);
    check(c, "draw: applyMove rejected", !applyMove(s, idxOf(size, 0, 0)));
    check(c, "EMPTY export unused sanity", EMPTY === 0);
  }

  console.log("engine: undo restores exactly");
  {
    const g = createGame(15);
    const keys: string[] = [stateKey(g)];
    const seq: Array<[number, number]> = [
      [3, 7], [0, 0], [4, 7], [0, 2], [5, 7], [0, 4], [6, 7], [0, 6], [7, 7], // X wins on the last
    ];
    for (const [x, y] of seq) {
      applyMove(g, idxOf(15, x, y));
      keys.push(stateKey(g));
    }
    check(c, "sequence ends in x-win", getResult(g).status === "x-win");
    let restored = true;
    for (let i = seq.length - 1; i >= 0; i--) {
      if (!undoMove(g)) restored = false;
      if (stateKey(g) !== keys[i]) restored = false;
    }
    check(c, "undo walks back through every earlier state", restored);
    check(c, "undo on empty history returns false", !undoMove(g));
    check(c, "fully undone game is the initial state", stateKey(g) === keys[0]);
  }

  console.log("engine: other sizes");
  {
    const g = createGame(20);
    play(g, [[16, 16], [0, 0], [17, 17], [0, 2], [18, 18], [0, 4], [19, 19], [0, 6], [15, 15]]);
    // Run (15,15)..(19,19): one end at the corner edge, other end open -> win.
    check(c, "20x20 corner diagonal five wins", getResult(g).status === "x-win");
    const g10 = createGame(10);
    play(g10, [[0, 0], [9, 9], [1, 0], [9, 7], [2, 0], [9, 5], [3, 0], [9, 3], [4, 0]]);
    // Run (0,0)..(4,0): edge end + open end -> win on 10x10 too.
    check(c, "10x10 edge five wins", getResult(g10).status === "x-win");
  }

  return c;
}
