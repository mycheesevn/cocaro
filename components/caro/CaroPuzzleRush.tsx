// Puzzle Rush: solve as many one-move puzzles as you can in 3 minutes.
// 3 lives — a wrong move costs one. Any solution-set cell counts.

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Board } from "./Board";
import {
  PUZZLES,
  puzzlePosition,
  solutionCells,
  type CaroPuzzle,
} from "@/lib/caro/puzzles";
import { STR } from "@/lib/caro/i18n";
import {
  applyMove,
  makeMove,
  stateToBoard,
  type Color,
  type Lang,
  type Position,
} from "@/lib/caro/engineApi";

const RUSH_TIME = 180; // 3 minutes
const RUSH_LIVES = 3;
const BEST_KEY = "caro-rush-best";

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function CaroPuzzleRush({
  lang,
  onExit,
}: {
  lang: Lang;
  onExit: () => void;
}) {
  const s = STR[lang];
  const [order] = useState(() => shuffled(PUZZLES));
  const [idx, setIdx] = useState(0);
  const [pos, setPos] = useState<Position>(() => puzzlePosition(order[0]));
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(RUSH_LIVES);
  const [timeLeft, setTimeLeft] = useState(RUSH_TIME);
  const [best, setBest] = useState(loadBest);
  const [over, setOver] = useState(false);

  const puzzle: CaroPuzzle = order[idx % order.length];
  const side: Color = puzzle.turn;
  const solutions = useMemo(() => new Set(solutionCells(puzzle)), [puzzle]);

  useEffect(() => {
    if (over) return;
    const t = window.setInterval(() => {
      setTimeLeft((v) => {
        if (v <= 1) {
          window.clearInterval(t);
          setOver(true);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [over]);

  useEffect(() => {
    if (over && score > best) {
      setBest(score);
      try {
        localStorage.setItem(BEST_KEY, String(score));
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over]);

  const nextPuzzle = useCallback(() => {
    const nidx = idx + 1;
    setIdx(nidx);
    setPos(puzzlePosition(order[nidx % order.length]));
    setPicked(null);
  }, [idx, order]);

  const onSquareClick = (sq: number) => {
    if (over) return;
    if (pos.board[sq] !== 0) return;
    setPicked(sq);
    if (solutions.has(sq)) {
      setScore((v) => v + 1);
      nextPuzzle();
    } else {
      const nl = lives - 1;
      setLives(nl);
      if (nl <= 0) setOver(true);
      else {
        setPos(puzzlePosition(puzzle));
        setPicked(null);
      }
    }
  };

  const mm = Math.floor(timeLeft / 60);
  const ss = String(timeLeft % 60).padStart(2, "0");

  return (
    <div className="cr-layout">
      <div className="cr-board-area">
        <div className="cr-board-fit">
          <Board
            board={stateToBoard(pos)}
            size={pos.size}
            flipped={side === "o"}
            lastMove={picked != null ? makeMove(picked, pos.size) : null}
            ghostColor={!over ? side : null}
            interactive={!over}
            boardLabel={`⚡ ${score}`}
            onSquareClick={onSquareClick}
          />
        </div>
      </div>
      <div className="cr-panel">
        <div className="cr-panel-head">
          <button type="button" className="cr-btn" onClick={onExit}>
            ← {s.back}
          </button>
          <div className="cr-rush-stats">
            <span>⏱ {mm}:{ss}</span>
            <span>❤️ {"❤️".repeat(Math.max(0, lives))}</span>
            <span>⭐ {score}</span>
          </div>
        </div>
        <div className="cr-puzzle-body">
          {over ? (
            <div className="cr-rush-over">
              <h3>🏁 {s.rushOver}</h3>
              <p>
                {s.score}: <b>{score}</b> · {s.best}: <b>{Math.max(best, score)}</b>
              </p>
              <button
                type="button"
                className="cr-btn cr-btn-primary"
                onClick={() => {
                  setIdx(0);
                  setPos(puzzlePosition(order[0]));
                  setPicked(null);
                  setScore(0);
                  setLives(RUSH_LIVES);
                  setTimeLeft(RUSH_TIME);
                  setOver(false);
                }}
              >
                ↻ {s.playAgain}
              </button>
            </div>
          ) : (
            <p>
              {puzzle.kind === "win"
                ? lang === "vi"
                  ? "Tìm nước thắng ngay!"
                  : "Find the immediate win!"
                : lang === "vi"
                  ? "Chặn nước thắng của đối thủ!"
                  : "Block the opponent's win!"}{" "}
              <b>
                {lang === "vi"
                  ? side === "x"
                    ? "Bạn cầm X"
                    : "Bạn cầm O"
                  : side === "x"
                    ? "You play X"
                    : "You play O"}
              </b>{" "}
              — {puzzle[lang === "vi" ? "titleVi" : "titleEn"]}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
