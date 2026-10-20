// Daily caro puzzles: composed positions, engine-verified.
// Two kinds:
//  - "win":   the side to move has at least one move that completes
//             five in a row immediately (VN rules: exactly-5 blocked
//             at both ends does NOT count; 6+ always counts).
//  - "block": the opponent threatens an immediate five; the side to
//             move must play a cell after which the opponent has no
//             immediate winning move (or win outright themselves).
// The set of acceptable solution cells is COMPUTED by the verified
// engine/AI helpers at runtime (and asserted by tools/verify-puzzles),
// never hand-listed — any cell in the computed set solves the puzzle.

import { createFromBoard, idxOf, type Player } from "./engine";
import { findWinningMove, winsAt } from "./ai";
import type { Color } from "./engineApi";

export interface CaroPuzzle {
  id: string;
  size: number;
  /** Stones as [x, y, who] triples; who: 1 = X, 2 = O. x = column, y = row. */
  stones: [number, number, 1 | 2][];
  /** Side to move: "x" = X, "o" = O (family seat naming). */
  turn: Color;
  kind: "win" | "block";
  titleVi: string;
  titleEn: string;
}

const X = 1 as const;
const O = 2 as const;

export const PUZZLES: CaroPuzzle[] = [
  {
    id: "win-001",
    size: 15,
    stones: [
      [5, 7, X], [6, 7, X], [7, 7, X], [8, 7, X],
      [3, 3, O], [10, 4, O], [4, 10, O], [11, 11, O],
    ],
    turn: "x",
    kind: "win",
    titleVi: "X đi — nối 5 để thắng ngay",
    titleEn: "X to move — complete five to win now",
  },
  {
    id: "win-002",
    size: 15,
    stones: [
      [5, 7, X], [6, 7, X], [8, 7, X], [9, 7, X],
      [2, 2, O], [12, 5, O], [6, 12, O], [11, 10, O],
    ],
    turn: "x",
    kind: "win",
    titleVi: "X đi — lấp khoảng trống, thắng trong 1 nước",
    titleEn: "X to move — fill the gap, win in 1",
  },
  {
    id: "win-003",
    size: 15,
    stones: [
      [5, 7, X], [6, 7, X], [7, 7, X], [8, 7, X], [4, 7, O],
      [3, 11, O], [11, 3, O], [9, 12, O],
    ],
    turn: "x",
    kind: "win",
    titleVi: "X đi — một đầu đã bị chặn, chỉ còn một nước thắng",
    titleEn: "X to move — one end blocked, only one winning move",
  },
  {
    id: "win-004",
    size: 15,
    stones: [
      [4, 4, X], [5, 5, X], [6, 6, X], [7, 7, X],
      [11, 2, O], [2, 11, O], [12, 12, O], [9, 3, O],
    ],
    turn: "x",
    kind: "win",
    titleVi: "X đi — đường chéo đang chờ nước cuối",
    titleEn: "X to move — the diagonal awaits its last stone",
  },
  {
    id: "win-005",
    size: 15,
    stones: [
      [7, 5, X], [7, 6, X], [7, 8, X], [7, 9, X],
      [3, 2, O], [11, 6, O], [5, 12, O], [12, 11, O],
    ],
    turn: "x",
    kind: "win",
    titleVi: "X đi — cột dọc thiếu đúng một ô",
    titleEn: "X to move — the column misses exactly one cell",
  },
  {
    id: "win-006",
    size: 15,
    stones: [
      [5, 7, X], [6, 7, X], [7, 7, X], [8, 7, X],
      [9, 4, X], [9, 5, X], [9, 6, X], [9, 8, X],
      [4, 7, O], [2, 3, O], [12, 10, O], [6, 12, O],
    ],
    turn: "x",
    kind: "win",
    titleVi: "X đi — một ô thắng cho cả hai đường",
    titleEn: "X to move — one cell wins on two lines at once",
  },
  {
    id: "win-007",
    size: 15,
    stones: [
      [4, 7, X], [5, 7, X], [6, 7, X], [8, 7, X], [9, 7, X], [10, 7, X],
      [2, 2, O], [12, 4, O], [5, 11, O], [11, 12, O], [8, 3, O],
    ],
    turn: "x",
    kind: "win",
    titleVi: "X đi — nối dài thành 7 quân vẫn thắng (quá 5 vẫn tính)",
    titleEn: "X to move — extend to seven: overlines still win",
  },
  {
    id: "win-008",
    size: 15,
    stones: [
      [3, 10, O], [4, 10, O], [5, 10, O], [6, 10, O],
      [8, 3, X], [4, 5, X], [11, 8, X], [7, 12, X],
    ],
    turn: "o",
    kind: "win",
    titleVi: "O đi — nối 5 để thắng ngay",
    titleEn: "O to move — complete five to win now",
  },
  {
    id: "win-009",
    size: 15,
    stones: [
      [0, 10, X], [0, 11, X], [0, 12, X], [0, 13, X],
      [5, 3, O], [9, 6, O], [6, 11, O], [12, 13, O],
    ],
    turn: "x",
    kind: "win",
    titleVi: "X đi — sát biên vẫn nối được 5",
    titleEn: "X to move — five along the edge still counts",
  },
  {
    id: "win-010",
    size: 15,
    stones: [
      [6, 3, X], [6, 4, X], [6, 5, X], [6, 6, X], [6, 2, O],
      [3, 9, O], [10, 8, O], [12, 12, O], [4, 12, X],
    ],
    turn: "x",
    kind: "win",
    titleVi: "X đi — đầu trên bị chặn, thắng ở đầu dưới",
    titleEn: "X to move — top end blocked, win at the bottom",
  },
  {
    id: "block-001",
    size: 15,
    stones: [
      [5, 7, O], [6, 7, O], [7, 7, O], [8, 7, O],
      [5, 12, X], [6, 12, X], [7, 12, X], [8, 12, X],
      [3, 3, X], [11, 11, O],
    ],
    turn: "x",
    kind: "block",
    titleVi: "X đi — đừng mải chặn: thắng luôn còn hơn!",
    titleEn: "X to move — forget blocking: winning beats it!",
  },
  {
    id: "block-002",
    size: 15,
    stones: [
      [5, 7, O], [6, 7, O], [8, 7, O], [9, 7, O],
      [2, 4, X], [11, 3, X], [7, 12, X], [12, 10, X],
    ],
    turn: "x",
    kind: "block",
    titleVi: "X đi — bịt khoảng trống của đối thủ",
    titleEn: "X to move — plug the opponent's gap",
  },
  {
    id: "block-003",
    size: 15,
    stones: [
      [10, 4, O], [9, 5, O], [8, 6, O], [7, 7, O], [11, 3, X],
      [3, 3, X], [12, 9, X], [5, 12, X],
    ],
    turn: "x",
    kind: "block",
    titleVi: "X đi — đường chéo của O chỉ còn một đầu hở",
    titleEn: "X to move — O's diagonal has one open end left",
  },
  {
    id: "block-004",
    size: 15,
    stones: [
      [11, 4, O], [11, 5, O], [11, 7, O], [11, 8, O],
      [4, 4, X], [8, 10, X], [3, 12, X], [13, 2, X],
    ],
    turn: "x",
    kind: "block",
    titleVi: "X đi — chặn cột dọc của O",
    titleEn: "X to move — stop O's column",
  },
  {
    id: "win-011",
    size: 15,
    stones: [
      [3, 3, X], [4, 4, X], [5, 5, X], [7, 7, X], [8, 8, X],
      [10, 2, O], [2, 10, O], [12, 11, O], [6, 12, O], [11, 6, O],
    ],
    turn: "x",
    kind: "win",
    titleVi: "X đi — đường chéo dài: nối thành 6 quân",
    titleEn: "X to move — long diagonal: join up into six",
  },
  {
    id: "block-005",
    size: 15,
    stones: [
      [4, 9, O], [5, 9, O], [6, 9, O], [7, 9, O], [3, 9, X],
      [9, 4, X], [5, 5, X], [12, 12, X],
    ],
    turn: "x",
    kind: "block",
    titleVi: "X đi — O bị chặn một đầu, vẫn phải bịt đầu còn lại",
    titleEn: "X to move — O is blocked at one end; seal the other",
  },
];

/** Build the engine state for a puzzle. */
export function puzzlePosition(p: CaroPuzzle) {
  const board = new Uint8Array(p.size * p.size);
  for (const [x, y, who] of p.stones) board[idxOf(p.size, x, y)] = who;
  const turn: Player = p.turn === "x" ? 1 : 2;
  return createFromBoard(p.size, board, turn);
}

/**
 * The SET of acceptable solution cells for a puzzle, computed by the
 * verified engine helpers:
 * - win:   every empty cell where the side to move completes five.
 * - block: every empty cell after which the opponent has no immediate
 *          winning move (includes cells that win outright).
 */
export function solutionCells(p: CaroPuzzle): number[] {
  const state = puzzlePosition(p);
  const me = state.turn;
  const opp = (me === 1 ? 2 : 1) as Player;
  const out: number[] = [];
  for (let i = 0; i < state.board.length; i++) {
    if (state.board[i] !== 0) continue;
    if (p.kind === "win") {
      if (winsAt(state, i, me)) out.push(i);
    } else {
      if (winsAt(state, i, me)) {
        out.push(i); // winning outright also solves a block puzzle
        continue;
      }
      const next = createFromBoard(state.size, state.board, opp);
      next.board[i] = me;
      if (findWinningMove(next, opp) === -1) out.push(i);
    }
  }
  return out;
}

/** Deterministic daily pick: days since Unix epoch mod puzzle count. */
export function dailyPuzzleIndex(date: Date = new Date()): number {
  const days = Math.floor(date.getTime() / 86400000);
  return ((days % PUZZLES.length) + PUZZLES.length) % PUZZLES.length;
}

export function dailyPuzzle(date: Date = new Date()): CaroPuzzle {
  return PUZZLES[dailyPuzzleIndex(date)];
}

/** UTC date string YYYY-MM-DD for streak/solve tracking. */
export function puzzleDateStr(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
