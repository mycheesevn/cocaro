"use client";

import { useMemo, useState } from "react";
import type { Board as BoardT, Color, Move, Square } from "@/lib/caro/engineApi";
import { GRID_COLORS, useBoardTheme } from "@/lib/caro/boardTheme";
import { MarkAt } from "./Pieces";

export interface BoardProps {
  /** size×size array board (the parent derives it via stateToBoard). */
  board: BoardT;
  size: number;
  flipped: boolean;
  /** Cell to ring as "selected" (editors / puzzle focus), if any. */
  selected?: Square | null;
  /** Last move played — its cell gets a soft highlight. */
  lastMove?: Move | null;
  /** Cells of the winning run to celebrate, if the game is decided. */
  winningRun?: number[] | null;
  /** Engine hint: gold pulsing ring on the hint move's cell. */
  hintMove?: Move | null;
  /** When set, hovering an empty cell previews this seat's mark. */
  ghostColor?: Color | null;
  interactive: boolean;
  boardLabel: string;
  onSquareClick: (sq: Square) => void;
}

export function Board({
  board,
  size,
  flipped,
  selected = null,
  lastMove = null,
  winningRun = null,
  hintMove = null,
  ghostColor = null,
  interactive,
  boardLabel,
  onSquareClick,
}: BoardProps) {
  const theme = useBoardTheme();
  const grid = GRID_COLORS[theme];
  const [hover, setHover] = useState<Square | null>(null);

  const CELL = size >= 20 ? 38 : 46;
  const MARGIN = 42;
  const W = (size - 1) * CELL + MARGIN * 2;
  const H = W;

  const px = (idx: Square) => {
    const c = idx % size;
    const dc = flipped ? size - 1 - c : c;
    return MARGIN + dc * CELL;
  };
  const py = (idx: Square) => {
    const r = Math.floor(idx / size);
    const dr = flipped ? size - 1 - r : r;
    return MARGIN + dr * CELL;
  };

  const cellFromEvent = (e: React.MouseEvent<SVGSVGElement>): Square | null => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = Math.min(rect.width / W, rect.height / H);
    if (scale <= 0) return null;
    const offX = (rect.width - W * scale) / 2;
    const offY = (rect.height - H * scale) / 2;
    const sx = (e.clientX - rect.left - offX) / scale;
    const sy = (e.clientY - rect.top - offY) / scale;
    const dc = Math.round((sx - MARGIN) / CELL);
    const dr = Math.round((sy - MARGIN) / CELL);
    if (dc < 0 || dr < 0 || dc >= size || dr >= size) return null;
    const c = flipped ? size - 1 - dc : dc;
    const r = flipped ? size - 1 - dr : dr;
    return r * size + c;
  };

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!interactive) return;
    const sq = cellFromEvent(e);
    if (sq !== null) onSquareClick(sq);
  };

  const lines = [];
  for (let i = 0; i < size; i++) {
    const p = MARGIN + i * CELL;
    const end = MARGIN + (size - 1) * CELL;
    lines.push(
      <line key={`v${i}`} x1={p} y1={MARGIN} x2={p} y2={end} stroke={grid.line} strokeWidth={i === 0 || i === size - 1 ? 2.2 : 1.4} opacity={0.75} />
    );
    lines.push(
      <line key={`h${i}`} x1={MARGIN} y1={p} x2={end} y2={p} stroke={grid.line} strokeWidth={i === 0 || i === size - 1 ? 2.2 : 1.4} opacity={0.75} />
    );
  }

  // Coordinate labels: letters (columns) top + bottom, numbers (rows,
  // counted from the bottom) left + right.
  const coords = [];
  for (let i = 0; i < size; i++) {
    const disp = flipped ? size - 1 - i : i;
    const letter = String.fromCharCode(65 + disp);
    const num = size - disp;
    const p = MARGIN + i * CELL;
    coords.push(
      <text key={`ct${i}`} x={p} y={MARGIN - 24} textAnchor="middle" fontSize={15} fontWeight={600} fill={grid.coord} pointerEvents="none">{letter}</text>
    );
    coords.push(
      <text key={`cb${i}`} x={p} y={H - MARGIN + 32} textAnchor="middle" fontSize={15} fontWeight={600} fill={grid.coord} pointerEvents="none">{letter}</text>
    );
    coords.push(
      <text key={`cl${i}`} x={MARGIN - 26} y={p} textAnchor="middle" dominantBaseline="central" fontSize={15} fontWeight={600} fill={grid.coord} pointerEvents="none">{num}</text>
    );
    coords.push(
      <text key={`crr${i}`} x={W - MARGIN + 26} y={p} textAnchor="middle" dominantBaseline="central" fontSize={15} fontWeight={600} fill={grid.coord} pointerEvents="none">{num}</text>
    );
  }

  const lastIdx = lastMove ? lastMove.path[lastMove.path.length - 1] : null;
  const winSet = useMemo(() => new Set(winningRun ?? []), [winningRun]);
  const winLine = useMemo(() => {
    if (!winningRun || winningRun.length < 2) return null;
    const pts = [...winningRun].sort((a, b) => a - b);
    // For ↗ runs index order runs bottom-left -> top-right already after
    // sorting by (x - y) — simplest robust order: sort by px then py.
    const ordered = [...winningRun].sort((a, b) => px(a) - px(b) || py(a) - py(b));
    void pts;
    return ordered;
  }, [winningRun, flipped, size]);

  const marks = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const p = board[r][c];
      if (!p) continue;
      const idx = r * size + c;
      marks.push(
        <g key={`m${idx}`}>
          {idx === lastIdx && (
            <circle cx={px(idx)} cy={py(idx)} r={CELL * 0.44} fill="#ffd43b" opacity={0.38} pointerEvents="none" />
          )}
          {winSet.has(idx) && (
            <circle cx={px(idx)} cy={py(idx)} r={CELL * 0.46} fill="none" stroke="#f5a300" strokeWidth={3.5} pointerEvents="none" />
          )}
          <MarkAt color={p.color} x={px(idx)} y={py(idx)} size={CELL * 0.92} seed={idx} />
        </g>
      );
    }
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="cr-board-svg"
      style={{ cursor: interactive ? "pointer" : "default", touchAction: "manipulation" }}
      onClick={handleClick}
      onMouseMove={(e) => {
        if (!interactive || !ghostColor) return;
        setHover(cellFromEvent(e));
      }}
      onMouseLeave={() => setHover(null)}
      role="img"
      aria-label={boardLabel}
    >
      <defs>
        <filter id="boardShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="14" floodOpacity="0.28" />
        </filter>
      </defs>

      <g filter="url(#boardShadow)">
        <rect x={6} y={6} width={W - 12} height={H - 12} rx={14} fill="#ffffff" />
        <rect x={6} y={6} width={W - 12} height={H - 12} rx={14} fill="none" stroke={grid.border} strokeWidth={2} opacity={0.6} />
      </g>

      {lines}
      {coords}

      {/* winning run connector */}
      {winLine && winLine.length >= 2 && (
        <polyline
          points={winLine.map((idx) => `${px(idx)},${py(idx)}`).join(" ")}
          fill="none"
          stroke="#f5a300"
          strokeWidth={5}
          strokeLinecap="round"
          opacity={0.45}
          pointerEvents="none"
        />
      )}

      {marks}

      {/* selected cell ring */}
      {selected !== null && (
        <rect
          x={px(selected) - CELL / 2 + 3}
          y={py(selected) - CELL / 2 + 3}
          width={CELL - 6}
          height={CELL - 6}
          fill="none"
          stroke="#ffd43b"
          strokeWidth={3.5}
          rx={8}
          pointerEvents="none"
        />
      )}

      {/* hover ghost */}
      {interactive && ghostColor && hover !== null && board[Math.floor(hover / size)][hover % size] === null && (
        <MarkAt
          color={ghostColor}
          x={px(hover)}
          y={py(hover)}
          size={CELL * 0.92}
          seed={hover}
          ghost
        />
      )}

      {/* hint ring */}
      {hintMove && (
        <g className="cr-hint-ring" pointerEvents="none">
          <circle
            cx={px(hintMove.path[hintMove.path.length - 1])}
            cy={py(hintMove.path[hintMove.path.length - 1])}
            r={CELL * 0.44}
            fill="none"
            stroke="#ffd43b"
            strokeWidth={5}
          />
        </g>
      )}
    </svg>
  );
}

/** Seat mark (X or O) for clocks / headers. */
export function DiscGlyph({ color, size = 20 }: { color: Color; size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <MarkAt color={color} x={50} y={50} size={96} />
    </svg>
  );
}
