// Cờ Ca-rô mark artwork: ballpoint X / O in a 100×100 space.
// The black seat draws X in blue ballpoint ink; the red seat draws O in
// red ballpoint ink — the school-notebook look. Shared by the SVG renderer
// (Pieces.tsx) and the canvas painter (pieceCanvas.ts).

import type { Color } from "./types";

/** Ballpoint ink color per seat. */
export const MARK_COLORS: Record<Color, string> = {
  x: "#1a5fc1", // X — blue ballpoint
  o: "#d92b2b", // O — red ballpoint
};

/** X strokes in the 100×100 space (two crossing strokes, slight overhang). */
export const X_STROKES: ReadonlyArray<readonly [number, number, number, number]> = [
  [30, 28, 72, 74],
  [71, 27, 29, 73],
];

/** O circle in the 100×100 space. */
export const O_CIRCLE = { cx: 50, cy: 50, r: 21 };

/** Stroke width in the 100×100 space. */
export const MARK_STROKE = 10;
