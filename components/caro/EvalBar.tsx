"use client";

interface Props {
  /** Win probability for X, 0..1. */
  winProbBlack: number;
  /** Score from X's perspective (engine units). */
  cpBlack: number;
  /** A forced win was found. */
  mate: boolean;
  /** True when X is at the bottom of the board (board flipped). */
  flipped: boolean;
}

/**
 * Live evaluation bar: vertical beside the board on desktop, thin
 * horizontal above the board on phones (CSS switches orientation).
 * The bottom side's color always fills from the bottom/left.
 */
export function EvalBar({ winProbBlack, cpBlack, mate, flipped }: Props) {
  const bottomProb = flipped ? winProbBlack : 1 - winProbBlack;
  const pct = Math.max(0, Math.min(100, Math.round(bottomProb * 100)));
  const label = mate
    ? cpBlack > 0
      ? "M"
      : "-M"
    : `${cpBlack >= 0 ? "+" : ""}${(cpBlack / 100).toFixed(1)}`;
  return (
    <div className="cr-evalbar-wrap" aria-hidden="true">
      <div className={`cr-evalbar${flipped ? " flipped" : ""}`}>
        <div
          className="cr-evalbar-fill"
          style={{ "--fill": `${pct}%` } as React.CSSProperties}
        />
      </div>
      <div className="cr-evalbar-label">{label}</div>
    </div>
  );
}
