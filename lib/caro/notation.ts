// Notation for Cờ Ca-rô — ONE stored encoding, one display rendering.
//
// STORED (the only form ever written to the DB / localStorage):
// a move is its zero-based cell index; a move list is the indices in
// play order joined by single spaces, e.g. "112 113 98" on a 15×15
// board. Positions use the engine serialization (see engineApi):
// "cr1:<size>:<turn>:<cells>".
//
// DISPLAY (never stored): an algebraic label — column letter (A =
// leftmost) plus a row number counted from the BOTTOM (1 = bottom
// row), chess-style. Examples on 15×15: center = H8, bottom-left = A1,
// top-right = O15.
import { DEFAULT_SIZE, xOf, yOf } from "./engine";
import type { Move } from "./types";

/** Cell index -> "H8" (display only). */
export function cellLabel(idx: number, size: number): string {
  const x = xOf(size, idx);
  const y = yOf(size, idx);
  return `${String.fromCharCode(65 + x)}${size - y}`;
}

/** "H8" -> cell index, or -1 when malformed / off-board. */
export function labelToCell(label: string, size: number): number {
  const m = /^([A-T])(\d{1,2})$/i.exec(label.trim());
  if (!m) return -1;
  const x = m[1].toUpperCase().charCodeAt(0) - 65;
  const row = parseInt(m[2], 10);
  const y = size - row;
  if (x < 0 || x >= size || y < 0 || y >= size) return -1;
  return y * size + x;
}

/** Display label for a move (its single placement cell). */
export function moveToLabel(m: Move): string {
  const idx = m.path[m.path.length - 1];
  return cellLabel(idx, m.size ?? DEFAULT_SIZE);
}

/** Stored token for a move: its cell index as a decimal string. */
export function moveToToken(m: Move): string {
  return String(m.path[m.path.length - 1]);
}

/** Parse a stored token (a bare numeric cell index) into a Move, or null. */
export function parseMoveToken(text: string, size: number = DEFAULT_SIZE): Move | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const idx = parseInt(t, 10);
  if (idx < 0 || idx >= size * size) return null;
  return { path: [idx], captured: [], size };
}

/** A whole game in stored form: space-separated index tokens. */
export function gameToString(moves: Move[]): string {
  return moves.map((m) => moveToToken(m)).join(" ");
}
