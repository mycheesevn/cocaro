"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Board, DiscGlyph } from "./Board";
import { burstConfetti } from "@/lib/caro/confetti";
import {
  applyMove,
  findBestMove,
  gameStatus,
  initialState,
  moveToToken,
  cellLabel,
  parsePosition,
  serializePosition,
  stateToBoard,
  type CaroState,
  type Color,
  type Lang,
  type Level,
  type Move,
} from "@/lib/caro/engineApi";
import { useAuth } from "./AuthProvider";
import { saveCvcGame } from "@/lib/supabase/engagement";
import { STR } from "@/lib/caro/i18n";
import { playMove, playWin } from "@/lib/caro/sound";

interface Props {
  lang: Lang;
  /** Serialized position from the setup editor. */
  pos: string;
  /** Both engines play at this level (the setup form's level). */
  level: Level;
  onExit: () => void;
}

/** Computer-vs-computer: both engines play out a custom setup position
 *  so the user can watch the solution to a position they found. Purely
 *  a spectator/analysis mode — nothing is recorded to stats/history XP.
 *  The finished game IS saved to History (player_color='cvc') so it can
 *  be replayed and exported to video; the result is stored from X's
 *  (X, the first player's) point of view. */
export function CvCView({ lang, pos, level, onExit }: Props) {
  const s = STR[lang];
  const initial = useMemo<CaroState>(
    () => parsePosition(pos) ?? initialState(),
    [pos]
  );
  const maxPlies = initial.size * initial.size;

  const { user } = useAuth();
  const [st, setSt] = useState<CaroState>(initial);
  const [tokens, setTokens] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [capped, setCapped] = useState(false);
  const [over, setOver] = useState<{
    winner: Color | null;
    draw: boolean;
    reason: string;
  } | null>(null);
  const timers = useRef<number[]>([]);
  const celebratedRef = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const stRef = useRef(st);
  stRef.current = st;

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

  // Engine loop: while playing, the side to move thinks, then moves.
  useEffect(() => {
    if (!playing || over) return;
    let cancelled = false;
    const think = window.setTimeout(() => {
      if (cancelled) return;
      const cur = stRef.current;
      const { move } = findBestMove({ state: cur }, level);
      if (!move || cancelled) return;
      const r = applyMove(cur, move);
      const g = gameStatus(r.state);
      const tok = moveToToken(move);
      setSt(r.state);
      setTokens((prev) => {
        const next = [...prev, tok];
        if (next.length >= maxPlies) setCapped(true);
        return next;
      });
      setLastMove(move);
      playMove();
      if (g.over) {
        if (g.winner !== null && g.winner !== undefined) {
          setOver({ winner: g.winner, draw: false, reason: "win" });
        } else {
          setOver({ winner: null, draw: true, reason: "quiet" });
        }
      }
    }, 550 / speed);
    timers.current.push(think);
    return () => {
      cancelled = true;
      window.clearTimeout(think);
    };
  }, [playing, over, st, level, speed, maxPlies]);

  const finalOver = capped && !over
    ? { winner: null as Color | null, draw: true, reason: "cap" }
    : over;

  // Save the finished game to History once (signed-in users only) so
  // it can be replayed and exported to video like any other game.
  const savedRef = useRef(false);
  useEffect(() => {
    if (!finalOver || savedRef.current || !user || tokens.length === 0) return;
    savedRef.current = true;
    const result: "win" | "loss" | "draw" = finalOver.draw
      ? "draw"
      : finalOver.winner === "x"
        ? "win"
        : "loss";
    saveCvcGame(user.id, {
      level,
      result,
      moves: tokens,
      startPos: serializePosition(initial),
      boardSize: initial.size,
    }).catch(() => {});
  }, [finalOver, user, tokens, level, initial]);

  // Celebrate a decisive finish once.
  useEffect(() => {
    if (finalOver && !finalOver.draw && !celebratedRef.current) {
      celebratedRef.current = true;
      playWin();
      burstConfetti();
    }
  }, [finalOver]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [tokens]);

  const restart = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    celebratedRef.current = false;
    savedRef.current = false;
    setSt(initial);
    setTokens([]);
    setLastMove(null);
    setCapped(false);
    setOver(null);
    setPlaying(true);
  };

  const resultText = !finalOver
    ? null
    : finalOver.reason === "cap"
      ? `${s.cvcDrawn} — ${s.cvcReasonCap}`
      : finalOver.draw
        ? `${s.cvcDrawn} — ${s.cvcReasonDraw}`
        : `${finalOver.winner === "x" ? s.cvcXWon : s.cvcOWon} — ${s.cvcReasonWin}`;

  const pairs: Array<[string, string | null]> = [];
  for (let i = 0; i < tokens.length; i += 2)
    pairs.push([
      cellLabel(parseInt(tokens[i], 10), st.size),
      tokens[i + 1] !== undefined ? cellLabel(parseInt(tokens[i + 1], 10), st.size) : null,
    ]);

  const board8 = useMemo(() => stateToBoard(st), [st]);
  const turnColor: Color = st.turn === 1 ? "x" : "o";

  return (
    <div className="cr-page">
      <div className="cr-layout">
        <div className="cr-board-area">
          <div className="cr-board-fit">
            <Board
              board={board8}
              size={st.size}
              flipped={false}
              lastMove={lastMove}
              winningRun={st.result.winningRun}
              interactive={false}
              boardLabel={s.cvcTitle}
              onSquareClick={() => {}}
            />
          </div>
        </div>

        <aside className="cr-panel">
          <div>
            <h2 className="cr-setup-title">🤖 {s.cvcTitle}</h2>
            <p className="cr-hint">{s.cvcHint}</p>
            <p className="cr-hint">
              {s.level}: {s.levelLabel(level)} · {s.cvcTurn}:{" "}
              <DiscGlyph color={turnColor} size={18} />{" "}
              {turnColor === "x" ? s.xName : s.oName}
              {!finalOver && playing ? ` · ${s.cvcThinking}` : ""}
            </p>
          </div>

          {resultText && (
            <p className="cr-cvc-result" role="status">
              {resultText}
            </p>
          )}

          <div className="cr-setup-actions">
            {!finalOver && (
              <button
                type="button"
                className="cr-btn cr-btn-primary"
                onClick={() => setPlaying((p) => !p)}
              >
                {playing ? s.cvcPause : s.cvcPlay}
              </button>
            )}
            <button type="button" className="cr-btn" onClick={restart}>
              {s.cvcRestart}
            </button>
            <button type="button" className="cr-btn" onClick={onExit}>
              {s.cvcBackToSetup}
            </button>
          </div>

          <label className="cr-field">
            <span>{s.cvcSpeed}</span>
            <select
              className="cr-select"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              <option value={0.5}>0.5×</option>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
            </select>
          </label>

          <div className="cr-cvc-moves" ref={listRef}>
            {pairs.map(([b, r], i) => (
              <div key={i} className="cr-cvc-move-row">
                <span className="cr-cvc-move-no">{i + 1}.</span>
                <span>{b}</span>
                <span>{r ?? ""}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
