// Core Cờ Ca-rô (Gomoku) app types.
//
// Seats are X and O, end to end (types, DB, i18n): "x" is the FIRST
// player (blue ballpoint ✕), "o" the second (red ballpoint ◯).
import type { CaroState, Player } from "./engine";
import { X } from "./engine";

export type Color = "x" | "o";

/** A stone on the board UI model: nothing but its seat. Caro stones
 *  have no ranks or kinds — no kings, no captures. */
export interface Piece {
  color: Color;
}

/** size×size array board for UI / setup-editor use; [y][x], y = row 0 (top). */
export type Board = (Piece | null)[][];

/** The app treats the engine state as an immutable position value. */
export type Position = CaroState;
export type { CaroState };

/**
 * A move is a single placement. The path shape mirrors the family Move
 * contract (path of squares + captured list); caro paths hold exactly one
 * cell index and nothing is ever captured.
 */
export interface Move {
  path: number[];
  captured: number[];
  /** Board size the move belongs to (labels need it). */
  size?: number;
}

export type Level = number;


export function opposite(c: Color): Color {
  return c === "x" ? "o" : "x";
}

/** Engine player (1 / 2) -> seat (X / O). */
export function colorOfPlayer(p: Player): Color {
  return p === X ? "x" : "o";
}

/** Seat color -> engine player. */
export function playerOfColor(c: Color): Player {
  return (c === "x" ? 1 : 2) as Player;
}
