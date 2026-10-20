// Shared canvas mark renderer: draws Cờ Ca-rô ballpoint X / O marks on a
// 2D context. Used by the share card and the replay video so every exported
// image/video matches the in-app board.

import type { Color } from "./engineApi";
import { MARK_COLORS, MARK_STROKE, O_CIRCLE, X_STROKES } from "./pieceArt";

/** Draw a mark centered at (cx, cy), `size` px tall/wide (art is 100×100). */
export function drawCanvasPiece(
  ctx: CanvasRenderingContext2D,
  color: Color,
  cx: number,
  cy: number,
  size: number
) {
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 100, size / 100);
  ctx.strokeStyle = MARK_COLORS[color];
  ctx.lineWidth = MARK_STROKE;
  ctx.lineCap = "round";
  if (color === "x") {
    for (const [x1, y1, x2, y2] of X_STROKES) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.arc(O_CIRCLE.cx, O_CIRCLE.cy, O_CIRCLE.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw the notebook board (white paper + cyan grid) into a rect, then all
 * marks from a raw cell array. Coordinates match the in-app SVG board:
 * cell (x, y) sits at the intersection (margin + x*cell, margin + y*cell).
 */
export function drawCanvasBoard(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number;
    y: number;
    /** Board pixel span (grid area incl. margins). */
    span: number;
    size: number;
    cells: ArrayLike<number>;
    /** Highlight these cells (winning run). */
    highlight?: number[] | null;
    /** Last-move cell (soft disc under the mark). */
    lastIdx?: number | null;
    gridColor?: string;
  }
) {
  const { x, y, span, size, cells } = opts;
  const margin = span * 0.055;
  const cell = (span - margin * 2) / (size - 1);
  const gridColor = opts.gridColor ?? "#2FA8D2";
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = Math.max(1.5, span * 0.0022);
  const r = span * 0.018;
  ctx.beginPath();
  ctx.roundRect(x, y, span, span, r);
  ctx.fill();
  ctx.globalAlpha = 0.75;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = Math.max(1, span * 0.0016);
  ctx.strokeStyle = gridColor;
  for (let i = 0; i < size; i++) {
    const p = margin + i * cell;
    ctx.globalAlpha = i === 0 || i === size - 1 ? 0.95 : 0.6;
    ctx.beginPath();
    ctx.moveTo(x + p, y + margin);
    ctx.lineTo(x + p, y + span - margin);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + margin, y + p);
    ctx.lineTo(x + span - margin, y + p);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const highlight = new Set(opts.highlight ?? []);
  for (let i = 0; i < cells.length; i++) {
    const v = cells[i];
    if (v === 0) continue;
    const cx = x + margin + (i % size) * cell;
    const cy = y + margin + Math.floor(i / size) * cell;
    if (i === opts.lastIdx) {
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.44, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 212, 59, 0.38)";
      ctx.fill();
    }
    if (highlight.has(i)) {
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.47, 0, Math.PI * 2);
      ctx.strokeStyle = "#f5a300";
      ctx.lineWidth = Math.max(2, cell * 0.07);
      ctx.stroke();
    }
    drawCanvasPiece(ctx, v === 1 ? "x" : "o", cx, cy, cell * 0.92);
  }
  ctx.restore();
}
