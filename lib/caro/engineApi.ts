// Engine adapter — the SINGLE import point for the Cờ Ca-rô engine.
//
// The pure engine (lib/caro/engine.ts) is a MUTABLE CaroState with cell
// indices; lib/caro/ai.ts is the verified 12-level ladder. This adapter
// presents the family app contract (immutable Position values, Move
// objects, seat colors "x" = X / "o" = O) on top of it:
//
// - Position  = engine CaroState, treated as immutable (applyMove clones).
// - Move      = { path: [cellIdx], captured: [] } — one placement, no
//               captures ever. `size` rides along so labels render right.
// - gameStatus derives from the engine result: a win reports kind
//   "five" (a completed five-in-a-row), a full board reports the draw
//   kind "full-board". There is no repetition rule.

import {
  BOARD_SIZES,
  DEFAULT_SIZE,
  DIRECTIONS,
  EMPTY,
  O,
  X,
  applyMove as engApply,
  createFromBoard,
  createGame,
  isWinRun,
  legalMoves as engLegalCells,
  lineThrough,
  opponent as engOpponent,
  xOf,
  yOf,
  type CaroState,
  type Player,
} from "./engine";
import { attackScore, candidateMoves, chooseMove, findWinningMove } from "./ai";
import { cellLabel, gameToString, labelToCell, moveToLabel, moveToToken, parseMoveToken } from "./notation";
import { zobristHash, type ZKey } from "./zobrist";
import {
  colorOfPlayer,
  opposite,
  playerOfColor,
  type Board,
  type Color,
  type Level,
  type Move,
  type Piece,
  type Position,
} from "./types";
import {
  LEVEL_THRESHOLDS,
  TITLES,
  levelForXp,
  titleForLevel,
  xpForNextLevel,
  levelProgress,
  RATING_BANDS,
  ratingTitle,
} from "./levels";

export type {
  Board,
  CaroState,
  Color,
  Level,
  Move,
  Piece,
  Position,
  ZKey,
};
export {
  BOARD_SIZES,
  DEFAULT_SIZE,
  LEVEL_THRESHOLDS,
  RATING_BANDS,
  TITLES,
  cellLabel,
  colorOfPlayer,
  gameToString,
  labelToCell,
  levelForXp,
  levelProgress,
  moveToLabel,
  moveToToken,
  opposite,
  parseMoveToken,
  playerOfColor,
  ratingTitle,
  titleForLevel,
  xpForNextLevel,
  zobristHash,
};

/** UI language. The engine is language-agnostic; strings live in i18n.ts. */
export type Lang = "en" | "vi";

/** A cell index on the board (0 .. size*size-1). */
export type Square = number;

export interface ApplyResult {
  state: Position;
  captured: Piece[];
  /** Caro has no promotion; always false (family API compat). */
  promoted: boolean;
  movedMan: boolean;
  /** Caro has no captures; always false (family API compat). */
  isCapture: boolean;
}

export type GameResult =
  | { over: false }
  | { over: true; kind: "five"; winner: Color }
  | { over: true; kind: "full-board"; winner: null };

export interface LevelConfig {
  level: number;
  /** Display depth (the caro ladder is heuristic + shallow negamax). */
  depth: number;
  jitter: number;
  timeCapMs: number;
}

export const LEVELS: LevelConfig[] = [
  { level: 1, depth: 0, jitter: 300, timeCapMs: 0 },
  { level: 2, depth: 0, jitter: 200, timeCapMs: 0 },
  { level: 3, depth: 0, jitter: 120, timeCapMs: 0 },
  { level: 4, depth: 0, jitter: 60, timeCapMs: 0 },
  { level: 5, depth: 1, jitter: 0, timeCapMs: 0 },
  { level: 6, depth: 1, jitter: 0, timeCapMs: 0 },
  { level: 7, depth: 2, jitter: 0, timeCapMs: 0 },
  { level: 8, depth: 2, jitter: 0, timeCapMs: 0 },
  { level: 9, depth: 3, jitter: 0, timeCapMs: 0 },
  { level: 10, depth: 3, jitter: 0, timeCapMs: 0 },
  { level: 11, depth: 4, jitter: 0, timeCapMs: 0 },
  { level: 12, depth: 4, jitter: 0, timeCapMs: 0 },
];

export function getLevelConfig(level: Level): LevelConfig {
  const clamped = Math.min(12, Math.max(1, Math.round(level)));
  return LEVELS[clamped - 1];
}

export interface SearchStats {
  depth: number;
  nodes: number;
  timeMs: number;
}

export interface SearchParams {
  state: Position;
}

export interface PositionAnalysis {
  bestMove: Move | null;
  /** Centipawn-ish score from the side-to-move's perspective. */
  score: number;
}

/** |score| above this bound means a forced win was found. */
export const WIN_SCORE_BOUND = 99000;

// ---------------------------------------------------------------------------
// State plumbing (the engine mutates; the app treats positions as values).
// ---------------------------------------------------------------------------

export function cloneState(st: CaroState): CaroState {
  return {
    size: st.size,
    board: Int8Array.from(st.board),
    turn: st.turn,
    moves: [...st.moves],
    stoneCount: st.stoneCount,
    result: {
      status: st.result.status,
      winner: st.result.winner,
      winningRun: st.result.winningRun ? [...st.result.winningRun] : null,
    },
  };
}

export function initialState(size: number = DEFAULT_SIZE): Position {
  return createGame(size);
}

export function initialBoard(size: number = DEFAULT_SIZE): Board {
  return Array.from({ length: size }, () => Array<Piece | null>(size).fill(null));
}

export function makeMove(idx: number, size: number): Move {
  return { path: [idx], captured: [], size };
}

/** Apply a placement move, returning a NEW position (input untouched). */
export function applyMove(st: Position, m: Move): ApplyResult {
  const idx = m.path[m.path.length - 1];
  const next = cloneState(st);
  const ok = engApply(next, idx);
  if (!ok) {
    return { state: st, captured: [], promoted: false, movedMan: true, isCapture: false };
  }
  return { state: next, captured: [], promoted: false, movedMan: true, isCapture: false };
}

/** All legal placements (every empty cell while the game is ongoing). */
export function legalMoves(st: Position): Move[] {
  return engLegalCells(st).map((idx) => makeMove(idx, st.size));
}

/**
 * "Moves from a square" in caro = placing ON that square: the single
 * placement when the cell is empty, otherwise nothing.
 */
export function legalMovesForSquare(st: Position, sq: Square): Move[] {
  if (st.result.status !== "ongoing") return [];
  if (sq < 0 || sq >= st.board.length || st.board[sq] !== EMPTY) return [];
  return [makeMove(sq, st.size)];
}

export const legalMovesFrom = legalMovesForSquare;

/** Caro has no captures; kept for family API compatibility. */
export function captureMoves(_st: Position): Move[] {
  return [];
}

export function isCaptureMove(_m: Move): boolean {
  return false;
}

export function gameStatus(
  st: Position,
  _quietPlies?: number,
  _positionCounts?: Map<string, number>
): GameResult {
  const r = st.result;
  if (r.status === "ongoing") return { over: false };
  if (r.status === "draw") return { over: true, kind: "full-board", winner: null };
  return { over: true, kind: "five", winner: colorOfPlayer(r.winner as Player) };
}

/** Piece on a cell, or null. Caro pieces are always plain marks. */
export function pieceAt(st: Position, sq: Square): Piece | null {
  const v = st.board[sq];
  if (v === EMPTY) return null;
  return { color: colorOfPlayer(v as Player) };
}

/** Stones per seat. */
export function countPieces(st: Position): { x: number; o: number } {
  let x = 0;
  let o = 0;
  for (const v of st.board) {
    if (v === X) x++;
    else if (v === O) o++;
  }
  return { x, o };
}

/** Position -> size×size grid ([y][x]) of pieces for rendering/editing. */
export function stateToBoard(st: Position): Board {
  const grid: Board = [];
  for (let y = 0; y < st.size; y++) {
    const row: (Piece | null)[] = [];
    for (let x = 0; x < st.size; x++) {
      const v = st.board[y * st.size + x];
      row.push(v === EMPTY ? null : { color: colorOfPlayer(v as Player) });
    }
    grid.push(row);
  }
  return grid;
}

/** Grid + side to move -> Position (setup editor / puzzle entry point). */
export function boardToState(board: Board, turn: Color = "x"): Position {
  const size = board.length;
  const cells = new Int8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = board[y][x];
      cells[y * size + x] = p ? (playerOfColor(p.color) as number) : EMPTY;
    }
  }
  return createFromBoard(size, cells, playerOfColor(turn));
}

/** Build a position directly from a raw cell array (puzzles, tests). */
export function stateFromCells(
  size: number,
  cells: ArrayLike<number>,
  turn: Color
): Position {
  return createFromBoard(size, cells, playerOfColor(turn));
}

/** Cell index -> {r, c} with r 0..size-1 top->bottom, c 0..size-1 left->right. */
export function idxToRC(sq: Square, size: number = DEFAULT_SIZE): { r: number; c: number } {
  return { r: yOf(size, sq), c: xOf(size, sq) };
}

/** {r, c} -> cell index. */
export function rcToIdx(r: number, c: number, size: number = DEFAULT_SIZE): Square {
  return r * size + c;
}

/** The placement cell of a move (its only path entry). */
export function moveStart(m: Move): Square {
  return m.path[0];
}

/** The placement cell of a move (same as moveStart for caro). */
export function moveEnd(m: Move): Square {
  return m.path[m.path.length - 1];
}

// ---------------------------------------------------------------------------
// Position serialization (saved setups, room start positions, game restore).
// Format: "cr1:<size>:<turn 1|2>:<cells>" where cells is one char per cell
// ('0' empty, '1' X, '2' O) in row-major order. DB/URL-safe.
// ---------------------------------------------------------------------------

export function serializePosition(st: Position): string {
  return `cr1:${st.size}:${st.turn}:${Array.from(st.board).join("")}`;
}

export function parsePosition(s: string): Position | null {
  try {
    if (!s) return null;
    const parts = s.trim().split(":");
    if (parts.length !== 4 || parts[0] !== "cr1") return null;
    const size = parseInt(parts[1], 10);
    const turn = parseInt(parts[2], 10);
    const cellsStr = parts[3];
    if (!Number.isInteger(size) || size < 5 || size > 30) return null;
    if (turn !== 1 && turn !== 2) return null;
    if (cellsStr.length !== size * size || /[^012]/.test(cellsStr)) return null;
    const cells = new Int8Array(size * size);
    for (let i = 0; i < cellsStr.length; i++) cells[i] = cellsStr.charCodeAt(i) - 48;
    return createFromBoard(size, cells, turn as Player);
  } catch {
    return null;
  }
}

/** The standard starting position (empty board, X to move) serialized. */
export function standardStartSerialized(size: number = DEFAULT_SIZE): string {
  return serializePosition(createGame(size));
}

/**
 * Replay a list of cell indices from a start position; returns the final
 * position, or null if any step is illegal.
 */
export function replayMoves(start: Position, moves: number[]): Position | null {
  let st = cloneState(start);
  for (const idx of moves) {
    const next = cloneState(st);
    if (!engApply(next, idx)) return null;
    st = next;
  }
  return st;
}

/** Parse a stored move list: space-separated cell indices ("112 113 …"). */
export function parseMoveList(s: string | null | undefined): number[] {
  if (!s) return [];
  return s
    .split(/\s+/)
    .map((t) => parseInt(t.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 0);
}

export function moveListToString(moves: number[]): string {
  return moves.join(" ");
}

/**
 * Match a stored token (a numeric cell index) against the position's legal
 * moves. Used when replaying stored games.
 */
export function matchMove(st: Position, token: string): Move | null {
  const parsed = parseMoveToken(token, st.size);
  if (!parsed) return null;
  const idx = parsed.path[0];
  if (st.result.status !== "ongoing" || st.board[idx] !== EMPTY) return null;
  return makeMove(idx, st.size);
}

// ---------------------------------------------------------------------------
// AI surface (verified ladder lives in ai.ts; this is the app-shaped view).
// ---------------------------------------------------------------------------

/** Find the ladder's move for the side to move. */
export function findBestMove(
  input: Position | SearchParams,
  level: Level,
  _seen?: Map<string, number>
): { move: Move | null; stats: SearchStats } {
  const st = (input as SearchParams).state ?? (input as Position);
  const t0 = Date.now();
  const idx = chooseMove(cloneState(st), Math.min(12, Math.max(1, Math.round(level))));
  const timeMs = Date.now() - t0;
  return {
    move: idx >= 0 ? makeMove(idx, st.size) : null,
    stats: {
      depth: getLevelConfig(level).depth,
      nodes: st.result.status === "ongoing" ? candidateMoves(st).length : 0,
      timeMs,
    },
  };
}

// Run-value table for the static evaluation (centipawn-ish).
const RUN_VALUE: Record<string, number> = {
  // key: `${len capped at 4},${openEnds}` for non-terminal runs
  "4,2": 5200, // open four — wins next move whatever happens
  "4,1": 950, // blocked four — one winning cell
  "3,2": 720, // open three
  "3,1": 110,
  "2,2": 85,
  "2,1": 22,
  "1,2": 7,
  "1,1": 2,
};

function sideScore(st: Position, color: Player): number {
  const { size, board } = st;
  let total = 0;
  // Existing runs (evaluate each maximal run once, at its start cell).
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== color) continue;
    for (const [dx, dy] of DIRECTIONS) {
      const px = xOf(size, i) - dx;
      const py = yOf(size, i) - dy;
      const prevIn = px >= 0 && py >= 0 && px < size && py < size;
      if (prevIn && board[py * size + px] === color) continue; // not a start
      const run = lineThrough(board, size, i, dx, dy);
      if (isWinRun(run.len, run.openEnds)) {
        total += 100000;
      } else if (run.len >= 2 || run.openEnds > 0) {
        const key = `${Math.min(run.len, 4)},${run.openEnds}`;
        total += RUN_VALUE[key] ?? 0;
      }
    }
  }
  // Attack potential: the best placement this side could make right now.
  let best = 0;
  for (const idx of candidateMoves(st)) {
    const a = attackScore(st, idx, color);
    if (a.score > best) best = a.score;
  }
  return total + best * 0.55;
}

/**
 * Static evaluation from the SIDE TO MOVE's perspective, in centipawn-ish
 * units (terminal positions saturate past WIN_SCORE_BOUND).
 */
export function evaluate(st: Position): number {
  const r = st.result;
  if (r.status === "draw") return 0;
  if (r.status !== "ongoing") {
    return r.winner === st.turn ? 100000 : -100000;
  }
  const me = st.turn;
  const opp = engOpponent(me);
  const diff = sideScore(st, me) - sideScore(st, opp);
  return Math.max(-9000, Math.min(9000, Math.round(diff)));
}

/** Best move (strongest ladder level) + static score for the eval bar/hints. */
export function analyzePosition(st: Position, _timeCapMs?: number): PositionAnalysis {
  if (st.result.status !== "ongoing") {
    return { bestMove: null, score: evaluate(st) };
  }
  const winIdx = findWinningMove(st, st.turn);
  const idx = winIdx >= 0 ? winIdx : chooseMove(cloneState(st), 12);
  return {
    bestMove: idx >= 0 ? makeMove(idx, st.size) : null,
    score: evaluate(st),
  };
}

/** Quiet-ply counter compat (caro draws only on a full board). */
export function nextQuietPlies(quietPlies: number, _r: ApplyResult): number {
  return quietPlies + 1;
}
