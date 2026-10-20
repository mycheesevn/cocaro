// Cờ Ca-rô (Vietnamese Gomoku) rules engine — pure TypeScript, no deps.
//
// Board: N x N with N in {10, 15, 20} (any 5..30 accepted); flat Int8Array,
// idx = y * N + x (x = column 0..N-1 left→right, y = row 0..N-1 top→bottom).
// Stones: 1 = X (moves first), 2 = O, 0 = empty.
//
// WIN RULE (Vietnamese schoolyard — locked by the user 2026-10-20):
//   * a maximal run of length >= 6 ALWAYS wins;
//   * a maximal run of EXACTLY 5 wins only if at least one end is open —
//     an end is BLOCKED when the cell just beyond the run holds an opponent
//     stone OR is off the board; exactly-5 blocked at both ends is NOT a
//     win and play continues;
//   * board full with no winning run = draw.
// No captures, no renju forbidden moves (double-3 / double-4 are legal).

export const EMPTY = 0;
export const X = 1;
export const O = 2;

export type Player = 1 | 2;

/** Product board sizes (room host picks one at creation). */
export const BOARD_SIZES: readonly number[] = [10, 15, 20];
export const DEFAULT_SIZE = 15;

/** The four line directions as [dx, dy]. */
export const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], // horizontal
  [0, 1], // vertical
  [1, 1], // diagonal ↘
  [1, -1], // diagonal ↗
];

export type GameStatus = "ongoing" | "x-win" | "o-win" | "draw";

export interface GameResult {
  status: GameStatus;
  /** 0 while ongoing / on a draw, else X or O. */
  winner: 0 | Player;
  /** Cells of the winning run (union if one stone completes two lines). */
  winningRun: number[] | null;
}

export interface CaroState {
  size: number;
  board: Int8Array;
  turn: Player;
  /** Move history (cell indices in play order). Empty for setup states. */
  moves: number[];
  stoneCount: number;
  result: GameResult;
}

/** A maximal contiguous run of one color through a cell, with end openness. */
export interface RunInfo {
  len: number;
  /** 0..2: ends whose beyond-cell is on-board and empty. */
  openEnds: number;
  cells: number[];
}

const ONGOING: GameResult = { status: "ongoing", winner: 0, winningRun: null };

export function opponent(p: Player): Player {
  return p === X ? O : X;
}

export function idxOf(size: number, x: number, y: number): number {
  return y * size + x;
}

export function xOf(size: number, idx: number): number {
  return idx % size;
}

export function yOf(size: number, idx: number): number {
  return (idx / size) | 0;
}

export function inBoard(size: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < size && y < size;
}

export function centerIndex(size: number): number {
  const c = size >> 1;
  return c * size + c;
}

/** The locked Vietnamese win test for one maximal run. */
export function isWinRun(len: number, openEnds: number): boolean {
  return len >= 6 || (len === 5 && openEnds >= 1);
}

function checkSize(size: number): void {
  if (!Number.isInteger(size) || size < 5 || size > 30) {
    throw new RangeError(`invalid board size: ${size}`);
  }
}

export function createGame(size: number = DEFAULT_SIZE): CaroState {
  checkSize(size);
  return {
    size,
    board: new Int8Array(size * size),
    turn: X,
    moves: [],
    stoneCount: 0,
    result: { ...ONGOING },
  };
}

/**
 * Maximal run of board[idx]'s color through idx along (dx, dy).
 * idx must hold a stone. An end is open iff the cell just beyond the run
 * is on-board and empty (opponent stone or board edge = blocked).
 */
export function lineThrough(
  board: Int8Array,
  size: number,
  idx: number,
  dx: number,
  dy: number
): RunInfo {
  const color = board[idx];
  const x = xOf(size, idx);
  const y = yOf(size, idx);
  const cells: number[] = [idx];
  let openEnds = 0;

  let cx = x - dx;
  let cy = y - dy;
  while (inBoard(size, cx, cy) && board[cy * size + cx] === color) {
    cells.push(cy * size + cx);
    cx -= dx;
    cy -= dy;
  }
  if (inBoard(size, cx, cy) && board[cy * size + cx] === EMPTY) openEnds++;

  cx = x + dx;
  cy = y + dy;
  while (inBoard(size, cx, cy) && board[cy * size + cx] === color) {
    cells.push(cy * size + cx);
    cx += dx;
    cy += dy;
  }
  if (inBoard(size, cx, cy) && board[cy * size + cx] === EMPTY) openEnds++;

  cells.sort((a, b) => a - b);
  return { len: cells.length, openEnds, cells };
}

/** Full-board result scan — used for setup/puzzle states. */
function scanResult(
  size: number,
  board: Int8Array,
  turn: Player,
  stoneCount: number
): GameResult {
  let winX: number[] | null = null;
  let winO: number[] | null = null;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const color = board[y * size + x];
      if (color === EMPTY) continue;
      for (const [dx, dy] of DIRECTIONS) {
        const px = x - dx;
        const py = y - dy;
        // Only evaluate at a run start (previous cell not the same color).
        if (inBoard(size, px, py) && board[py * size + px] === color) continue;
        const cells: number[] = [y * size + x];
        let cx = x + dx;
        let cy = y + dy;
        while (inBoard(size, cx, cy) && board[cy * size + cx] === color) {
          cells.push(cy * size + cx);
          cx += dx;
          cy += dy;
        }
        let openEnds = 0;
        if (inBoard(size, px, py) && board[py * size + px] === EMPTY) openEnds++;
        if (inBoard(size, cx, cy) && board[cy * size + cx] === EMPTY) openEnds++;
        if (isWinRun(cells.length, openEnds)) {
          if (color === X && winX === null) winX = cells;
          if (color === O && winO === null) winO = cells;
        }
      }
    }
  }
  // In legal play only the player who just moved (opponent of `turn`) can
  // hold a winning run; prefer theirs when an arbitrary setup has both.
  const lastMover = opponent(turn);
  const winRun = lastMover === X ? winX ?? winO : winO ?? winX;
  if (winRun !== null) {
    const winner: Player = winRun === winX ? X : O;
    return {
      status: winner === X ? "x-win" : "o-win",
      winner,
      winningRun: [...winRun].sort((a, b) => a - b),
    };
  }
  if (stoneCount === size * size) {
    return { status: "draw", winner: 0, winningRun: null };
  }
  return { ...ONGOING };
}

/**
 * Build a state from a raw board (setup editor, puzzles, tests).
 * Move history is unknown, so `moves` is empty and undo is unavailable;
 * the result is computed with a full-board scan.
 */
export function createFromBoard(
  size: number,
  cells: ArrayLike<number>,
  turn: Player
): CaroState {
  checkSize(size);
  if (cells.length !== size * size) {
    throw new RangeError(`expected ${size * size} cells, got ${cells.length}`);
  }
  const board = new Int8Array(size * size);
  let stoneCount = 0;
  for (let i = 0; i < cells.length; i++) {
    const v = cells[i];
    if (v !== EMPTY && v !== X && v !== O) {
      throw new RangeError(`invalid cell value ${v} at ${i}`);
    }
    board[i] = v;
    if (v !== EMPTY) stoneCount++;
  }
  return {
    size,
    board,
    turn,
    moves: [],
    stoneCount,
    result: scanResult(size, board, turn, stoneCount),
  };
}

/** All empty cells, or [] once the game is over. */
export function legalMoves(state: CaroState): number[] {
  if (state.result.status !== "ongoing") return [];
  const out: number[] = [];
  for (let i = 0; i < state.board.length; i++) {
    if (state.board[i] === EMPTY) out.push(i);
  }
  return out;
}

/**
 * Place the side-to-move's stone at idx. Returns false (state untouched)
 * for out-of-range / occupied cells and once the game is over.
 * The result is updated INCREMENTALLY: only runs through the new stone
 * can change, so only those are examined.
 */
export function applyMove(state: CaroState, idx: number): boolean {
  if (state.result.status !== "ongoing") return false;
  if (!Number.isInteger(idx) || idx < 0 || idx >= state.board.length) {
    return false;
  }
  if (state.board[idx] !== EMPTY) return false;

  const mover = state.turn;
  state.board[idx] = mover;
  state.moves.push(idx);
  state.stoneCount++;

  let winning: number[] | null = null;
  for (const [dx, dy] of DIRECTIONS) {
    const run = lineThrough(state.board, state.size, idx, dx, dy);
    if (isWinRun(run.len, run.openEnds)) {
      winning = winning === null ? run.cells : [...new Set([...winning, ...run.cells])];
    }
  }
  if (winning !== null) {
    winning.sort((a, b) => a - b);
    state.result = {
      status: mover === X ? "x-win" : "o-win",
      winner: mover,
      winningRun: winning,
    };
  } else if (state.stoneCount === state.size * state.size) {
    state.result = { status: "draw", winner: 0, winningRun: null };
  } else {
    state.result = { ...ONGOING };
  }
  state.turn = opponent(mover);
  return true;
}

/**
 * Take back the last applied move. The pre-move state was necessarily
 * ongoing (a game can only end on the move just played), so undo always
 * restores the ongoing result. Returns false when there is no history.
 */
export function undoMove(state: CaroState): boolean {
  const idx = state.moves.pop();
  if (idx === undefined) return false;
  state.board[idx] = EMPTY;
  state.stoneCount--;
  state.turn = opponent(state.turn);
  state.result = { ...ONGOING };
  return true;
}

export function getResult(state: CaroState): GameResult {
  return state.result;
}

/** Compact identity of a position — for tests and debugging. */
export function stateKey(state: CaroState): string {
  return `${state.size}|${state.turn}|${state.result.status}|${state.board.join(",")}`;
}
