import { MARK_COLORS, MARK_STROKE, O_CIRCLE, X_STROKES } from "@/lib/caro/pieceArt";
import type { Color, Piece } from "@/lib/caro/engineApi";

/**
 * A ballpoint mark (X or O) drawn in a 100×100 space. A deterministic
 * micro-rotation per instance gives a hand-drawn feel without randomness
 * between renders (seeded by the caller through `seed`).
 */
export function MarkGlyph100({
  color,
  seed = 0,
  ghost = false,
}: {
  color: Color;
  seed?: number;
  ghost?: boolean;
}) {
  const ink = MARK_COLORS[color];
  const rot = ((seed * 37) % 5) - 2; // -2..2 degrees
  return (
    <g
      transform={`rotate(${rot} 50 50)`}
      opacity={ghost ? 0.35 : 1}
      stroke={ink}
      strokeWidth={MARK_STROKE}
      strokeLinecap="round"
      fill="none"
    >
      {color === "x" ? (
        X_STROKES.map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))
      ) : (
        <circle cx={O_CIRCLE.cx} cy={O_CIRCLE.cy} r={O_CIRCLE.r} />
      )}
    </g>
  );
}

/** A mark centered at (x, y) with the given on-board size. */
export function MarkAt({
  color,
  x,
  y,
  size,
  seed = 0,
  ghost = false,
}: {
  color: Color;
  x: number;
  y: number;
  size: number;
  seed?: number;
  ghost?: boolean;
}) {
  return (
    <g
      transform={`translate(${x - size / 2} ${y - size / 2}) scale(${size / 100})`}
      style={{ pointerEvents: "none" }}
    >
      <MarkGlyph100 color={color} seed={seed} ghost={ghost} />
    </g>
  );
}

/** Single-mark renderer (the board draws the same via MarkGlyph). */
export function DiscPieceAt({
  color,
  x,
  y,
  size,
}: {
  color: Color;
  x: number;
  y: number;
  size: number;
}) {
  return <MarkAt color={color} x={x} y={y} size={size} />;
}

/** A mark in the 100×100 space (palette buttons, glyphs). */
export function DiscPiece({ color }: { color: Color }) {
  return <MarkGlyph100 color={color} />;
}

/** Convenience wrapper taking a full Piece. */
export function PieceShape({
  piece,
  x,
  y,
  size,
}: {
  piece: Piece;
  x: number;
  y: number;
  size: number;
}) {
  return <MarkAt color={piece.color} x={x} y={y} size={size} />;
}
