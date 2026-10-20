// Bí Kíp (playbook) library: interactive Gomoku lessons.
// Every lesson line is engine-verified (lib/caro/library.ts +
// tools/verify-lessons.ts).

"use client";

import { useEffect, useRef, useState } from "react";
import { Board } from "./Board";
import { burstConfetti } from "@/lib/caro/confetti";
import { createFromBoard } from "@/lib/caro/engine";
import { STR } from "@/lib/caro/i18n";
import {
  LIBRARY,
  allLessonIds,
  findLesson,
  isLessonUnlocked,
  nextLessonId,
  type LibraryLesson,
} from "@/lib/caro/library";
import {
  completeLesson,
  loadLocalDone,
  syncLibraryProgress,
} from "@/lib/supabase/libraryProgress";
import {
  applyMove,
  colorOfPlayer,
  makeMove,
  playerOfColor,
  stateToBoard,
  type Lang,
  type Position,
} from "@/lib/caro/engineApi";

type View =
  | { name: "home" }
  | { name: "lesson"; lessonId: string };

/** Position at the start of a lesson (from its stone list). */
function lessonStart(lesson: LibraryLesson): Position {
  const cells = new Int8Array(lesson.size * lesson.size);
  for (const [x, y, who] of lesson.stones) cells[y * lesson.size + x] = who;
  return createFromBoard(lesson.size, cells, playerOfColor(lesson.startTurn));
}

/** Position after applying the first `upto` lesson steps (golden path). */
function positionAt(lesson: LibraryLesson, upto: number): Position {
  let st = lessonStart(lesson);
  for (let i = 0; i < upto && i < lesson.steps.length; i++) {
    const step = lesson.steps[i];
    const cell = step.move ?? step.accept?.[0];
    if (cell == null) continue;
    st = applyMove(st, makeMove(cell, lesson.size)).state;
  }
  return st;
}

export function LibraryView({ lang }: { lang: Lang }) {
  const s = STR[lang];
  const [view, setView] = useState<View>({ name: "home" });
  const [done, setDone] = useState<Set<string>>(() => new Set(loadLocalDone()));

  useEffect(() => {
    let live = true;
    syncLibraryProgress().then((merged) => {
      if (live) setDone(new Set(merged));
    });
    return () => {
      live = false;
    };
  }, []);

  const markDone = async (lessonId: string) => {
    const merged = await completeLesson(lessonId);
    setDone(new Set(merged));
  };

  if (view.name === "lesson") {
    const lesson = findLesson(view.lessonId);
    if (!lesson) return null;
    return (
      <LessonPlayer
        key={lesson.id}
        lesson={lesson}
        lang={lang}
        onDone={markDone}
        onExit={() => setView({ name: "home" })}
        onNext={(id) => setView({ name: "lesson", lessonId: id })}
      />
    );
  }

  const doneCount = allLessonIds().filter((id) => done.has(id)).length;
  return (
    <div className="cr-scroll-area">
      <div className="cr-lib-home">
        <div className="cr-lib-head">
          <h2>📕 {s.library}</h2>
          <div className="cr-lib-progress">
            {doneCount}/{allLessonIds().length}
          </div>
        </div>
        {LIBRARY.map((ch) => (
          <div key={ch.id} className="cr-lib-chapter">
            <div className="cr-lib-chapter-head">
              <span className="cr-lib-chapter-icon">{ch.icon}</span>
              <div>
                <div className="cr-lib-chapter-title">{ch.title[lang]}</div>
                <div className="cr-lib-chapter-sub">{ch.subtitle[lang]}</div>
              </div>
            </div>
            <div className="cr-lib-lessons">
              {ch.lessons.map((l) => {
                const unlocked = isLessonUnlocked(l.id, [...done]);
                const isDone = done.has(l.id);
                return (
                  <button
                    key={l.id}
                    type="button"
                    className={`cr-lib-lesson${isDone ? " done" : ""}${unlocked ? "" : " locked"}`}
                    disabled={!unlocked}
                    onClick={() => setView({ name: "lesson", lessonId: l.id })}
                  >
                    <span className="cr-lib-lesson-status">
                      {isDone ? "✅" : unlocked ? "▶️" : "🔒"}
                    </span>
                    <span className="cr-lib-lesson-title">{l.title[lang]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LessonPlayer({
  lesson,
  lang,
  onDone,
  onExit,
  onNext,
}: {
  lesson: LibraryLesson;
  lang: Lang;
  onDone: (id: string) => void;
  onExit: () => void;
  onNext: (id: string) => void;
}) {
  const s = STR[lang];
  const [stepIdx, setStepIdx] = useState(0);
  const [pos, setPos] = useState<Position>(() => positionAt(lesson, 0));
  const [lastCell, setLastCell] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [wrongKey, setWrongKey] = useState(0);
  const [finished, setFinished] = useState(false);
  const autoTimer = useRef<number | null>(null);

  const step = lesson.steps[stepIdx];
  const isQuiz = !!step?.quiz;
  const quizDone = stepIdx >= lesson.steps.length;
  const turnColor = colorOfPlayer(pos.turn);

  // Reset when the lesson changes.
  useEffect(() => {
    setStepIdx(0);
    setPos(positionAt(lesson, 0));
    setLastCell(null);
    setMessage(null);
    setFinished(false);
  }, [lesson]);

  // Auto-play non-quiz steps after a short delay.
  useEffect(() => {
    if (quizDone || isQuiz || finished) return;
    const cell = step?.move ?? step?.accept?.[0];
    if (cell == null) {
      autoTimer.current = window.setTimeout(() => setStepIdx((i) => i + 1), 1200);
      return () => {
        if (autoTimer.current) window.clearTimeout(autoTimer.current);
      };
    }
    autoTimer.current = window.setTimeout(() => {
      setPos((p) => applyMove(p, makeMove(cell, lesson.size)).state);
      setLastCell(cell);
      setStepIdx((i) => i + 1);
    }, 1600);
    return () => {
      if (autoTimer.current) window.clearTimeout(autoTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx, lesson, finished]);

  const doWrong = () => {
    setWrongKey((k) => k + 1);
    setMessage(s.tryAgain);
  };

  /** Check whether a clicked cell satisfies the current quiz. */
  const quizAccepts = (cell: number): boolean => {
    if (!step) return false;
    if (step.quiz === "exact") return cell === step.move;
    if (step.quiz === "anyOf") return (step.accept ?? []).includes(cell);
    if (step.quiz === "win") {
      const r = applyMove(pos, makeMove(cell, lesson.size));
      return r.state.result.winner === pos.turn && r.state.result.status !== "ongoing";
    }
    return false;
  };

  const onSquareClick = (sq: number) => {
    if (finished || quizDone || !isQuiz) return;
    setMessage(null);
    if (pos.board[sq] !== 0) {
      doWrong();
      return;
    }
    if (!quizAccepts(sq)) {
      doWrong();
      return;
    }
    setPos(applyMove(pos, makeMove(sq, lesson.size)).state);
    setLastCell(sq);
    setMessage(s.correct);
    window.setTimeout(() => setStepIdx((i) => i + 1), 900);
  };

  const finish = () => {
    setFinished(true);
    burstConfetti();
    onDone(lesson.id);
  };

  useEffect(() => {
    if (quizDone && !finished) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizDone]);

  const nextId = nextLessonId(lesson.id);
  const intro = stepIdx === 0 && !isQuiz;

  return (
    <div className="cr-layout">
      <div className="cr-board-area">
        <div className="cr-board-fit" key={wrongKey}>
          <Board
            board={stateToBoard(pos)}
            size={lesson.size}
            flipped={false}
            lastMove={lastCell != null ? makeMove(lastCell, lesson.size) : null}
            winningRun={pos.result.winningRun}
            ghostColor={isQuiz && !finished ? turnColor : null}
            interactive={isQuiz && !finished}
            boardLabel={lesson.title[lang]}
            onSquareClick={onSquareClick}
          />
        </div>
      </div>
      <div className="cr-panel">
        <div className="cr-panel-head">
          <button type="button" className="cr-btn" onClick={onExit}>
            ← {s.back}
          </button>
          <div className="cr-lesson-title">{lesson.title[lang]}</div>
        </div>
        <div className="cr-lesson-body">
          {intro && <p className="cr-lesson-intro">{lesson.intro[lang]}</p>}
          {!quizDone && step && (
            <div className="cr-lesson-step">
              <div className="cr-lesson-step-num">
                {s.step} {stepIdx + 1}/{lesson.steps.length}
              </div>
              <p>
                {isQuiz && step.quizPrompt
                  ? step.quizPrompt[lang]
                  : step.text[lang]}
              </p>
            </div>
          )}
          {message && <div className="cr-lesson-msg">{message}</div>}
          {quizDone && (
            <div className="cr-lesson-outro">
              <p>🎉 {lesson.outro[lang]}</p>
              <div className="cr-lesson-actions">
                {nextId && (
                  <button
                    type="button"
                    className="cr-btn cr-btn-primary"
                    onClick={() => onNext(nextId)}
                  >
                    {s.nextLesson} →
                  </button>
                )}
                <button type="button" className="cr-btn" onClick={onExit}>
                  {s.backToLibrary}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
