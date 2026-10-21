// Daily caro puzzle: composed win-in-1 / block-or-lose positions.
// The player clicks ONE cell; any cell in the engine-computed solution
// set solves it (a position can have several acceptable cells).

"use client";

import { useEffect, useMemo, useState } from "react";
import { Board } from "./Board";
import { useAuth } from "./AuthProvider";
import { bumpGuestStat } from "@/lib/guestStats";
import {
  dailyPuzzle,
  puzzleDateStr,
  puzzlePosition,
  solutionCells,
  type CaroPuzzle,
} from "@/lib/caro/puzzles";
import { renderShareCard, shareCard } from "@/lib/caro/shareCard";
import { CaroPuzzleRush } from "./CaroPuzzleRush";
import { alreadySolved, recordPuzzleSolve } from "@/lib/supabase/puzzles";
import { STR } from "@/lib/caro/i18n";
import {
  applyMove,
  makeMove,
  stateToBoard,
  type Color,
  type Lang,
  type Position,
} from "@/lib/caro/engineApi";

const STREAK_KEY = "caro-puzzle-streak";
const SOLVED_KEY = "caro-puzzle-solved";

interface Streak {
  date: string;
  count: number;
}

function loadStreak(): Streak {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Streak;
      if (typeof s.count === "number" && typeof s.date === "string") return s;
    }
  } catch {
    /* ignore */
  }
  return { date: "", count: 0 };
}

function loadSolved(): string[] {
  try {
    const raw = localStorage.getItem(SOLVED_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch {
    /* ignore */
  }
  return [];
}

export function PuzzleView({ lang }: { lang: Lang }) {
  const s = STR[lang];
  const { user, refreshProfile } = useAuth();
  const [rushMode, setRushMode] = useState(false);
  const [puzzle] = useState<CaroPuzzle>(() => dailyPuzzle());
  const [dateStr] = useState(() => puzzleDateStr());
  const [pos, setPos] = useState<Position>(() => puzzlePosition(puzzle));
  const [picked, setPicked] = useState<number | null>(null);
  const [solved, setSolved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [streak, setStreak] = useState<Streak>(loadStreak);
  const [wasSolved, setWasSolved] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const side: Color = puzzle.turn;
  const solutions = useMemo(() => new Set(solutionCells(puzzle)), [puzzle]);

  useEffect(() => {
    alreadySolved(dateStr).then((v) => setWasSolved(v));
    setWasSolved(loadSolved().includes(`${dateStr}:${puzzle.id}`));
  }, [puzzle.id, dateStr]);

  const onSolve = async () => {
    setSolved(true);
    const today = puzzleDateStr();
    setStreak((prev) => {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const count =
        prev.date === today ? prev.count : prev.date === yesterday ? prev.count + 1 : 1;
      const next = { date: today, count };
      try {
        localStorage.setItem(STREAK_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    const key = `${dateStr}:${puzzle.id}`;
    try {
      const arr = loadSolved();
      if (!arr.includes(key)) {
        arr.push(key);
        localStorage.setItem(SOLVED_KEY, JSON.stringify(arr));
      }
    } catch {
      /* ignore */
    }
    if (user) {
      try {
        await recordPuzzleSolve(dateStr);
        refreshProfile();
      } catch {
        /* ignore — background sync */
      }
    } else {
      bumpGuestStat("puzzles");
    }
  };

  const onSquareClick = (sq: number) => {
    if (solved || failed) return;
    if (pos.board[sq] !== 0) return;
    setPicked(sq);
    if (solutions.has(sq)) {
      setPos(applyMove(pos, makeMove(sq, pos.size)).state);
      onSolve();
    } else {
      setFailed(true);
    }
  };

  const reset = () => {
    setPos(puzzlePosition(puzzle));
    setPicked(null);
    setSolved(false);
    setFailed(false);
  };

  const doShare = async () => {
    const blob = await renderShareCard({
      pos,
      playerColor: side,
      headline: lang === "vi" ? "🧩 Giải đố thành công!" : "🧩 Puzzle solved!",
      subline: puzzle[lang === "vi" ? "titleVi" : "titleEn"],
      appName: "✖️ Cờ Ca-rô",
      appUrl: "cocaro.synerworlds.com",
    });
    const url = await shareCard(
      blob,
      lang === "vi" ? "Đố Cờ Ca-rô" : "Gomoku Puzzle",
      `${puzzle[lang === "vi" ? "titleVi" : "titleEn"]} https://cocaro.synerworlds.com`,
      "https://cocaro.synerworlds.com",
      "caro-puzzle.png",
    );
    setShareUrl(url);
  };

  if (rushMode) {
    return <CaroPuzzleRush lang={lang} onExit={() => setRushMode(false)} />;
  }

  const prompt =
    puzzle.kind === "win"
      ? lang === "vi"
        ? "Tìm nước thắng ngay!"
        : "Find the immediate win!"
      : lang === "vi"
        ? "Đối thủ sắp thắng — hãy chặn lại!"
        : "Your opponent is about to win — stop them!";

  return (
    <div className="cr-layout">
      <div className="cr-board-area">
        <div className="cr-board-fit">
          <Board
            board={stateToBoard(pos)}
            size={pos.size}
            flipped={side === "o"}
            lastMove={picked != null ? makeMove(picked, pos.size) : null}
            winningRun={pos.result.winningRun}
            ghostColor={!solved && !failed ? side : null}
            interactive={!solved && !failed}
            boardLabel={puzzle[lang === "vi" ? "titleVi" : "titleEn"]}
            onSquareClick={onSquareClick}
          />
        </div>
      </div>
      <div className="cr-panel">
        <div className="cr-panel-head">
          <div className="cr-puzzle-title">
            🧩 {puzzle[lang === "vi" ? "titleVi" : "titleEn"]}
          </div>
          <div className="cr-puzzle-streak">
            🔥 {streak.count} {s.dayStreak}
          </div>
        </div>
        <div className="cr-puzzle-body">
          {!solved && !failed && (
            <p>
              {prompt}{" "}
              <b>
                {lang === "vi"
                  ? side === "x"
                    ? "Bạn cầm X"
                    : "Bạn cầm O"
                  : side === "x"
                    ? "You play X"
                    : "You play O"}
              </b>
            </p>
          )}
          {solved && (
            <div className="cr-puzzle-solved">
              <p>🎉 {s.puzzleSolved}</p>
              <div className="cr-row">
                <button type="button" className="cr-btn" onClick={doShare}>
                  📤 {s.share}
                </button>
                <button
                  type="button"
                  className="cr-btn cr-btn-rush"
                  onClick={() => setRushMode(true)}
                >
                  ⚡ {s.puzzleRush}
                </button>
              </div>
              {shareUrl && (
                <a href={shareUrl} target="_blank" rel="noreferrer">
                  {shareUrl}
                </a>
              )}
            </div>
          )}
          {failed && (
            <div className="cr-puzzle-failed">
              <p>❌ {s.puzzleFailed}</p>
              <button type="button" className="cr-btn cr-btn-primary" onClick={reset}>
                ↩ {s.tryAgain}
              </button>
            </div>
          )}
          {wasSolved && !solved && (
            <p className="cr-muted">✅ {s.puzzleAlreadySolved}</p>
          )}
        </div>
      </div>
    </div>
  );
}
