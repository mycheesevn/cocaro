import {
  boardToState,
  countPieces,
  gameStatus,
  legalMoves,
  type Board,
  type Color,
} from "./engineApi";
import { DEFAULT_SIZE } from "./engine";

export type SetupError = "empty" | "noMoves";

export function emptyBoard(size: number = DEFAULT_SIZE): Board {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.slice());
}

/**
 * Validate a manually arranged position before it is handed to the engine.
 * - at least two stones on the board ("empty") — a bare board is just a
 *   new game, not a setup;
 * - the position must not already be decided, and the side to move needs
 *   at least one legal placement ("noMoves").
 * A side with no stones yet is fine in caro (it simply
 * places its first mark when its turn comes).
 */
export function validateSetup(board: Board, turn: Color): SetupError | null {
  let st;
  try {
    st = boardToState(board, turn);
  } catch {
    return "empty";
  }
  const c = countPieces(st);
  if (c.x + c.o < 2) return "empty";
  if (legalMoves(st).length === 0) return "noMoves";
  const g = gameStatus(st);
  if (g.over) return "noMoves";
  return null;
}

/** The two placeable marks in palette order (X first, then O). */
export const SETUP_COLORS: Color[] = ["x", "o"];
