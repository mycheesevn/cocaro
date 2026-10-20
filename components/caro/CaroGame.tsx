"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Board, DiscGlyph } from "./Board";
import { GameOverPanel } from "./GameOverPanel";
import { EvalBar } from "./EvalBar";
import { burstConfetti } from "@/lib/caro/confetti";
import { VideoExportModal, type VideoGame } from "./VideoExportModal";
import {
  recordCaroGameEvent,
  type CaroGameEventMeta,
} from "@/lib/supabase/stats";
import {
  playCheckmateFanfare,
  playHint,
  playMove,
  playSadTrombone,
} from "@/lib/caro/sound";
import {
  analyzePosition,
  applyMove,
  cellLabel,
  countPieces,
  findBestMove,
  gameStatus,
  getLevelConfig,
  initialState,
  makeMove,
  moveToLabel,
  moveToToken,
  opposite,
  parsePosition,
  replayMoves,
  serializePosition,
  standardStartSerialized,
  stateToBoard,
  WIN_SCORE_BOUND,
  type Color,
  type Lang,
  type Level,
  type Move,
  type Position,
  type SearchStats,
  type Square,
} from "@/lib/caro/engineApi";
import { BOARD_SIZES } from "@/lib/caro/engine";
import { STR } from "@/lib/caro/i18n";

export type GameResult = "win" | "loss" | "draw";
export type GameOverReason = "five" | "full-board" | "flag";

interface GameOver {
  winner: Color | null;
  draw: boolean;
  reason: GameOverReason;
}

interface InProgress {
  v: 2;
  /** Cell indices in play order, replayed from startPos. */
  moves: number[];
  size: number;
  level: number;
  playerColor: Color;
  tcMs: TcMs;
  clocksMs: { x: number; o: number } | null;
  /** Serialized position this game started from (custom setup games). */
  startPos?: string;
}

const IN_PROGRESS_KEY = "caro-in-progress";

function loadProgress(): InProgress | null {
  try {
    const raw = localStorage.getItem(IN_PROGRESS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as InProgress;
    if (p.v !== 2 || !Array.isArray(p.moves)) return null;
    return p;
  } catch {
    return null;
  }
}

function saveProgress(p: InProgress): void {
  try {
    localStorage.setItem(IN_PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

function clearSaved(): void {
  try {
    localStorage.removeItem(IN_PROGRESS_KEY);
  } catch {
    /* ignore */
  }
}

export type TcMs = "none" | number;

interface GameState {
  pos: Position;
  lastMove: Move | null;
  /** Display labels in play order. */
  log: string[];
  /** Cell indices in play order (parallel to log). */
  moves: number[];
  /** Position before each move, for undo. */
  history: Position[];
  gameOver: GameOver | null;
}

function freshState(start: Position): GameState {
  return { pos: start, lastMove: null, log: [], moves: [], history: [], gameOver: null };
}

function formatNodes(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}

export function CaroGame({
  onGameEnd,
  lang,
  level,
  onLevelChange,
  playerColor,
  onPlayerColorChange,
  tcMs,
  onTcChange,
  configNonce,
  customStart = null,
  onCustomStartConsumed,
}: {
  onGameEnd?: (
    result: GameResult,
    color: Color,
    level: number,
    plies: number,
    movesText: string,
    startPos: string,
    boardSize: number
  ) => void;
  lang: Lang;
  // Play configuration (level / side / time control) is owned by AppShell —
  // it lives in the drawer's play-settings section (PacClone pattern).
  level: Level;
  onLevelChange: (l: Level) => void;
  playerColor: Color;
  onPlayerColorChange: (c: Color) => void;
  tcMs: TcMs;
  onTcChange: (tc: TcMs) => void;
  /** Bumped by AppShell when the drawer changes side/time → start a new game. */
  configNonce: number;
  /** One-shot custom position requested from the board setup editor. */
  customStart?: { pos: string; nonce: number } | null;
  /** Called once an initial/nonce custom start has been taken over. */
  onCustomStartConsumed?: (nonce: number) => void;
}) {
  const initialCustomStartRef = useRef(customStart);
  const [initialStart] = useState<Position>(() => {
    const raw = initialCustomStartRef.current?.pos;
    return (raw && parsePosition(raw)) || initialState();
  });
  const gameStartRef = useRef<Position>(initialStart);
  const gameStartPosRef = useRef(serializePosition(initialStart));
  const [state, setState] = useState<GameState>(() => freshState(initialStart));
  const [size, setSize] = useState<number>(initialStart.size);
  const setLevel = onLevelChange;
  const setPlayerColor = onPlayerColorChange;
  const setTcMs = onTcChange;
  const [thinking, setThinking] = useState(false);
  const [aiStats, setAiStats] = useState<SearchStats | null>(null);
  const reportedEnd = useRef<string | number>(0);
  // Site statistics — "start" fires on the first move of a game, "finish"
  // with the game-over report, "abandon" when a started game is left.
  const statsStartedRef = useRef(false);
  const statsMetaRef = useRef<CaroGameEventMeta>({});
  // Replay video export (skill: replay-video.md).
  const [videoGame, setVideoGame] = useState<VideoGame | null>(null);
  useEffect(() => {
    statsMetaRef.current = {
      level,
      playerColor,
      timeControl: tcMs === "none" ? null : Math.round(tcMs / 1000),
    };
  }, [level, playerColor, tcMs]);
  // Hint.
  const [hintMove, setHintMove] = useState<Move | null>(null);
  const [hintThinking, setHintThinking] = useState(false);
  const [hintToast, setHintToast] = useState<string | null>(null);
  const hintTimer = useRef<number | null>(null);
  // Live eval bar.
  const [evalInfo, setEvalInfo] = useState({
    winProbBlack: 0.5,
    cpBlack: 0,
    forced: false,
  });
  const evalGen = useRef(0);
  // Blitz clocks.
  const [clocksMs, setClocksMs] = useState<{ x: number; o: number } | null>(null);
  const clocksMsRef = useRef(clocksMs);
  clocksMsRef.current = clocksMs;
  // Resume.
  const [restoreToast, setRestoreToast] = useState<string | null>(null);

  const s = STR[lang];
  const num = (v: string) => (lang === "vi" ? v.replace(".", ",") : v);
  const aiColor = opposite(playerColor);
  const stateRef = useRef(state);
  stateRef.current = state;

  /** Open the video-export modal for the just-finished game. */
  const openVideoExport = useCallback(() => {
    const st = stateRef.current;
    const go = st.gameOver;
    if (!go || st.log.length === 0) return;
    const won = !go.draw && go.winner === playerColor;
    const title = won
      ? lang === "vi"
        ? `Tôi đã thắng máy Cấp ${level}! 🏆`
        : `I beat the computer (Level ${level})! 🏆`
      : go.draw
        ? lang === "vi"
          ? "Hòa! 🤝"
          : "It's a draw! 🤝"
        : lang === "vi"
          ? "Thua một ván hay! 💪"
          : "Lost a good game! 💪";
    setVideoGame({
      moves: [...st.log],
      startPos: serializePosition(gameStartRef.current),
      playerColor,
      title,
      subtitle:
        lang === "vi"
          ? `${st.log.length} nước · Cấp ${level}`
          : `${st.log.length} moves · Level ${level}`,
      shareUrl: window.location.origin,
    });
  }, [lang, level, playerColor]);

  const clearHint = useCallback(() => {
    if (hintTimer.current) window.clearTimeout(hintTimer.current);
    setHintMove(null);
    setHintToast(null);
    setHintThinking(false);
  }, []);

  // Resume an in-progress game (auto-saved on every move). A custom-start
  // request takes precedence: it is a one-shot handoff from Setup, so any
  // older saved game is discarded and the request is consumed immediately.
  useEffect(() => {
    const requested = initialCustomStartRef.current;
    if (requested) {
      clearSaved();
      setClocksMs(tcMs === "none" ? null : { x: tcMs, o: tcMs });
      onCustomStartConsumed?.(requested.nonce);
      return;
    }
    const saved = loadProgress();
    if (!saved) return;
    const start = (saved.startPos && parsePosition(saved.startPos)) || initialState(saved.size || 15);
    if (saved.moves.length === 0 && serializePosition(start) === standardStartSerialized(start.size))
      return;
    const finalPos = replayMoves(start, saved.moves);
    if (!finalPos) {
      clearSaved();
      return;
    }
    try {
      // Rebuild history + labels by stepping through the saved moves.
      const history: Position[] = [];
      const log: string[] = [];
      let pos = start;
      for (const idx of saved.moves) {
        history.push(pos);
        const mv = makeMove(idx, start.size);
        log.push(moveToToken(mv));
        pos = applyMove(pos, mv).state;
      }
      gameStartRef.current = start;
      gameStartPosRef.current = serializePosition(start);
      setSize(start.size);
      setLevel(Math.min(12, Math.max(1, Math.round(saved.level) || 5)));
      setPlayerColor(saved.playerColor === "o" ? "o" : "x");
      setTcMs(saved.tcMs);
      setClocksMs(saved.clocksMs);
      setState({
        pos,
        lastMove: saved.moves.length ? makeMove(saved.moves[saved.moves.length - 1], start.size) : null,
        log,
        moves: [...saved.moves],
        history,
        gameOver: null,
      });
      setRestoreToast(s.restoreToast);
      window.setTimeout(() => setRestoreToast(null), 4000);
    } catch {
      clearSaved();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("caro-lang", lang);
    } catch {
      /* storage unavailable */
    }
    document.documentElement.lang = lang;
  }, [lang]);

  // Report game end once for XP recording.
  useEffect(() => {
    if (!state.gameOver || !onGameEnd) return;
    const id = `${state.log.length}`;
    if (reportedEnd.current === id) return;
    reportedEnd.current = id;
    const go = state.gameOver;
    const result: GameResult = go.draw
      ? "draw"
      : go.winner === playerColor
        ? "win"
        : "loss";
    onGameEnd(
      result,
      playerColor,
      level,
      state.log.length,
      state.log.join(" "),
      gameStartPosRef.current,
      state.pos.size
    );
    recordCaroGameEvent("finish", { ...statsMetaRef.current, result });
    // Party popper + fanfare when the player wins (skill: excitement.md).
    if (!go.draw) {
      if (go.winner === playerColor) {
        burstConfetti();
        playCheckmateFanfare();
      } else {
        playSadTrombone();
      }
    }
  }, [state.gameOver, state.log, onGameEnd, playerColor, level]);

  const commitMove = useCallback(
    (move: Move) => {
      const prev = stateRef.current;
      if (prev.gameOver) return;
      // Statistics: a game counts as a "play" on its first move.
      if (!statsStartedRef.current) {
        statsStartedRef.current = true;
        recordCaroGameEvent("start", statsMetaRef.current);
      }
      const r = applyMove(prev.pos, move);
      const nextPos = r.state;
      const st = gameStatus(nextPos);
      let go: GameOver | null = null;
      if (st.over) {
        go =
          st.winner !== null && st.winner !== undefined
            ? { winner: st.winner, draw: false, reason: "five" }
            : { winner: null, draw: true, reason: "full-board" };
      }
      const idx = move.path[move.path.length - 1];
      const nextLog = [...prev.log, moveToToken(move)];
      const nextMoves = [...prev.moves, idx];
      setState({
        pos: nextPos,
        lastMove: move,
        log: nextLog,
        moves: nextMoves,
        history: [...prev.history, prev.pos],
        gameOver: go,
      });
      clearHint();
      if (go) clearSaved();
      else
        saveProgress({
          v: 2,
          moves: nextMoves,
          size: nextPos.size,
          level,
          playerColor,
          tcMs,
          clocksMs: clocksMsRef.current,
          startPos: gameStartPosRef.current,
        });
      playMove();
    },
    [level, playerColor, tcMs, clearHint]
  );

  // Computer move.
  useEffect(() => {
    if (state.gameOver) return;
    if (!isAiTurn(state.pos, playerColor)) return;
    setThinking(true);
    const t = window.setTimeout(() => {
      const t0 = Date.now();
      const { move, stats } = findBestMove({ state: state.pos }, level);
      setAiStats(stats);
      const wait = Math.max(0, 650 - (Date.now() - t0));
      window.setTimeout(() => {
        setThinking(false);
        if (move) commitMove(move);
      }, wait);
      void t0;
    }, 250);
    return () => window.clearTimeout(t);
  }, [state.pos, state.gameOver, playerColor, level, commitMove]);

  // Blitz clocks: tick the side to move. Starts on the first move.
  const clocksActive = !!clocksMs && !state.gameOver && state.log.length > 0;
  useEffect(() => {
    if (!clocksActive) return;
    const t = window.setInterval(() => {
      const side = stateRef.current.pos.turn === 1 ? "x" : "o";
      setClocksMs((prev) => {
        if (!prev) return prev;
        return { ...prev, [side]: Math.max(0, prev[side] - 100) };
      });
    }, 100);
    return () => window.clearInterval(t);
  }, [clocksActive]);

  // Flag fall = loss for the flagged side.
  useEffect(() => {
    if (!clocksMs || state.gameOver) return;
    const loser: Color | null =
      clocksMs.x <= 0 ? "x" : clocksMs.o <= 0 ? "o" : null;
    if (loser) {
      clearSaved();
      setState((prev) => ({
        ...prev,
        gameOver: { winner: opposite(loser), draw: false, reason: "flag" },
      }));
    }
  }, [clocksMs, state.gameOver]);

  // Live eval bar.
  useEffect(() => {
    const gen = ++evalGen.current;
    const t = window.setTimeout(() => {
      if (evalGen.current !== gen) return;
      const { pos } = stateRef.current;
      const a = analyzePosition(pos, 400);
      if (evalGen.current !== gen) return;
      const cpBlack = pos.turn === 1 ? a.score : -a.score;
      setEvalInfo({
        winProbBlack: 1 / (1 + Math.pow(10, -cpBlack / 400)),
        cpBlack: Math.max(-99999, Math.min(99999, cpBlack)),
        forced: Math.abs(a.score) > WIN_SCORE_BOUND,
      });
    }, 60);
    return () => window.clearTimeout(t);
  }, [state.pos, state.gameOver]);

  // Hint: engine best move, gold ring on the cell + a toast naming it.
  const doHint = useCallback(() => {
    if (thinking || state.gameOver || hintThinking) return;
    const snap = stateRef.current;
    if (!isPlayerTurn(snap.pos, playerColor)) return;
    setHintThinking(true);
    window.setTimeout(() => {
      try {
        const { bestMove } = analyzePosition(snap.pos, 1500);
        if (bestMove && isPlayerTurn(stateRef.current.pos, playerColor)) {
          setHintMove(bestMove);
          playHint();
          setHintToast(s.hintToast(moveToLabel(bestMove)));
          if (hintTimer.current) window.clearTimeout(hintTimer.current);
          hintTimer.current = window.setTimeout(() => {
            setHintMove(null);
            setHintToast(null);
          }, 4500);
        }
      } finally {
        setHintThinking(false);
      }
    }, 50);
  }, [thinking, state.gameOver, hintThinking, playerColor, s]);

  const onSquareClick = useCallback(
    (sq: Square) => {
      if (thinking || state.gameOver) return;
      const cur = stateRef.current;
      if (!isPlayerTurn(cur.pos, playerColor)) return;
      if (cur.pos.board[sq] !== 0) return;
      commitMove(makeMove(sq, cur.pos.size));
    },
    [thinking, state.gameOver, playerColor, commitMove]
  );

  const undo = useCallback(() => {
    if (thinking) return;
    const prev = stateRef.current;
    if (prev.history.length === 0) return;
    clearHint();
    reportedEnd.current = 0;
    // Undo a full round: pop until it's the player's turn (or the start).
    const h = [...prev.history];
    let pos = h.pop()!;
    while (h.length > 0 && !isPlayerTurn(pos, playerColor)) {
      pos = h.pop()!;
    }
    const keep = h.length;
    const moves = prev.moves.slice(0, keep);
    const log = prev.log.slice(0, keep);
    setClocksMs((c) => c); // clocks stay as-is (casual undo)
    if (moves.length === 0) clearSaved();
    else
      saveProgress({
        v: 2,
        moves,
        size: pos.size,
        level,
        playerColor,
        tcMs,
        clocksMs: clocksMsRef.current,
        startPos: gameStartPosRef.current,
      });
    setState({
      pos,
      lastMove: moves.length ? makeMove(moves[moves.length - 1], pos.size) : null,
      log,
      moves,
      history: h,
      gameOver: null,
    });
  }, [thinking, playerColor, level, tcMs, clearHint]);

  const newGame = useCallback(
    (color: Color, opts?: { tc?: TcMs; size?: number }) => {
      // Statistics: leaving a started but unfinished game = abandoned.
      if (statsStartedRef.current && !stateRef.current.gameOver) {
        recordCaroGameEvent("abandon", statsMetaRef.current);
      }
      statsStartedRef.current = false;
      const t = opts?.tc ?? tcMs;
      const sz = opts?.size ?? size;
      setPlayerColor(color);
      setThinking(false);
      setAiStats(null);
      setClocksMs(t === "none" ? null : { x: t, o: t });
      clearHint();
      clearSaved();
      reportedEnd.current = 0;
      const start = initialState(sz);
      gameStartRef.current = start;
      gameStartPosRef.current = serializePosition(start);
      setSize(sz);
      setState(freshState(start));
    },
    [tcMs, size, clearHint, setPlayerColor]
  );

  // Drawer play-settings: when AppShell bumps configNonce (side or time
  // control changed in the drawer), start a fresh game with the new config.
  const seenNonce = useRef(configNonce);
  useEffect(() => {
    if (seenNonce.current === configNonce) return;
    seenNonce.current = configNonce;
    newGame(playerColor, { tc: tcMs });
  }, [configNonce, newGame, playerColor, tcMs]);

  // Board setup editor: a new customStart nonce replaces the current game.
  const seenCustomNonce = useRef(customStart?.nonce ?? 0);
  useEffect(() => {
    if (!customStart || seenCustomNonce.current === customStart.nonce) return;
    seenCustomNonce.current = customStart.nonce;
    const start = parsePosition(customStart.pos);
    if (!start) {
      onCustomStartConsumed?.(customStart.nonce);
      return;
    }
    if (statsStartedRef.current && !stateRef.current.gameOver) {
      recordCaroGameEvent("abandon", statsMetaRef.current);
    }
    statsStartedRef.current = false;
    setThinking(false);
    setAiStats(null);
    setClocksMs(tcMs === "none" ? null : { x: tcMs, o: tcMs });
    clearHint();
    clearSaved();
    reportedEnd.current = `custom:${customStart.nonce}`;
    gameStartRef.current = start;
    gameStartPosRef.current = serializePosition(start);
    setSize(start.size);
    setState(freshState(start));
    onCustomStartConsumed?.(customStart.nonce);
  }, [customStart, onCustomStartConsumed, tcMs, clearHint]);

  const counts = useMemo(() => countPieces(state.pos), [state.pos]);
  const board8 = useMemo(() => stateToBoard(state.pos), [state.pos]);

  const statusText = state.gameOver
    ? state.gameOver.draw
      ? s.drawQuiet()
      : state.gameOver.reason === "flag"
        ? s.flagged(state.gameOver.winner === "x" ? s.xName : s.oName)
        : s.winNoMoves(state.gameOver.winner === "x" ? s.xName : s.oName)
    : s.toMove(state.pos.turn === 1 ? s.xName : s.oName, false);

  const fmtClock = (ms: number): string => {
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    if (ms < 20000) {
      const tenths = Math.floor((ms % 1000) / 100);
      return `${m}:${sec.toString().padStart(2, "0")}.${tenths}`;
    }
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const logPairs = useMemo(() => {
    const pairs: Array<[string, string?]> = [];
    const label = (tok?: string) =>
      tok === undefined ? undefined : cellLabel(parseInt(tok, 10), state.pos.size);
    for (let i = 0; i < state.log.length; i += 2)
      pairs.push([label(state.log[i])!, label(state.log[i + 1])]);
    return pairs;
  }, [state.log, state.pos.size]);

  const playerWon =
    !!state.gameOver && !state.gameOver.draw && state.gameOver.winner === playerColor;
  const playerTurnNow = isPlayerTurn(state.pos, playerColor);

  return (
    <div className="cr-page">
      <div className="cr-quick">
        <button
          type="button"
          className="cr-btn"
          onClick={undo}
          disabled={thinking || state.history.length === 0}
        >
          ↩ {s.undo}
        </button>
        <button
          type="button"
          className="cr-btn"
          onClick={() => newGame(opposite(playerColor))}
          disabled={thinking}
          title={s.switchSides}
        >
          {s.switchSides}
        </button>
        <button
          type="button"
          className="cr-btn"
          onClick={doHint}
          disabled={thinking || !!state.gameOver || !playerTurnNow || hintThinking}
          title={s.hint}
        >
          {hintThinking ? s.hintBusy : s.hint}
        </button>
        <span className="cr-quicr-spacer" />
        <button
          type="button"
          className="cr-btn cr-btn-primary"
          onClick={() => newGame(playerColor)}
        >
          ＋ {s.newGame}
        </button>
      </div>

      <div className="cr-layout">
        <div className={`cr-board-area ${thinking ? "is-thinking" : ""}`}>
          <div className="cr-board-col">
            {clocksMs && (
              <div className="cr-clocr-row">
                <span
                  className={`cr-clock${state.pos.turn === (aiColor === "x" ? 1 : 2) && !state.gameOver ? " active" : ""}${clocksMs[aiColor] < 20000 ? " low" : ""}`}
                >
                  <DiscGlyph color={aiColor} size={22} /> {fmtClock(clocksMs[aiColor])}
                </span>
              </div>
            )}
            <div className="cr-board-with-eval">
              <EvalBar
                winProbBlack={evalInfo.winProbBlack}
                cpBlack={evalInfo.cpBlack}
                mate={evalInfo.forced}
                flipped={playerColor === "x"}
              />
              <div className="cr-board-fit">
                <Board
                  board={board8}
                  size={state.pos.size}
                  flipped={playerColor === "o"}
                  lastMove={state.lastMove}
                  winningRun={state.pos.result.winningRun}
                  hintMove={hintMove}
                  ghostColor={!thinking && !state.gameOver && playerTurnNow ? playerColor : null}
                  interactive={!thinking && !state.gameOver && playerTurnNow}
                  boardLabel={s.boardLabel}
                  onSquareClick={onSquareClick}
                />
                {thinking && (
                  <div className="cr-think-overlay" aria-hidden="true">
                    <span className="cr-spinner cr-spinner-lg" />
                  </div>
                )}
                {playerWon && (
                  <div className="cr-mate-overlay" aria-hidden="true">
                    <div key={state.log.length} className="cr-mate-banner">
                      <span className="cr-mate-trophy">🏆</span>
                      <span>{s.winBadge}</span>
                    </div>
                  </div>
                )}
                {state.gameOver && (
                  <GameOverPanel
                    gameOver={state.gameOver}
                    playerColor={playerColor}
                    level={level}
                    moves={state.log.length}
                    pos={state.pos}
                    lang={lang}
                    onNewGame={() => newGame(playerColor)}
                    onExportVideo={openVideoExport}
                  />
                )}
              </div>
            </div>
            {clocksMs && (
              <div className="cr-clocr-row">
                <span
                  className={`cr-clock${state.pos.turn === (playerColor === "x" ? 1 : 2) && !state.gameOver ? " active" : ""}${clocksMs[playerColor] < 20000 ? " low" : ""}`}
                >
                  <DiscGlyph color={playerColor} size={22} /> {fmtClock(clocksMs[playerColor])}
                </span>
              </div>
            )}
          </div>
        </div>

        {hintToast && (
          <div className="cr-hint-toast" role="status">
            {hintToast}
          </div>
        )}
        {restoreToast && <div className="cr-toast">{restoreToast}</div>}
        <VideoExportModal lang={lang} game={videoGame} onClose={() => setVideoGame(null)} />

        <aside className="cr-panel">
          <div
            className={`cr-status ${state.gameOver ? "cr-status-over" : ""} ${
              thinking ? "cr-status-thinking" : ""
            }`}
            role="status"
            aria-live="polite"
          >
            {thinking ? (
              <span className="cr-thinking">
                <span className="cr-spinner" aria-hidden="true" />
                <span>
                  {s.thinking}
                  <span className="cr-dots" aria-hidden="true">
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                  </span>
                  <span className="cr-think-meta">
                    {s.thinkMeta(s.levelLabel(level), getLevelConfig(level).depth)}
                  </span>
                </span>
              </span>
            ) : (
              statusText
            )}
          </div>

          <section>
            <h2>{s.boardSize}</h2>
            <div className="cr-size-row" role="group" aria-label={s.boardSize}>
              {BOARD_SIZES.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`cr-btn cr-size-btn${size === n ? " active" : ""}`}
                  onClick={() => {
                    if (n !== size) newGame(playerColor, { size: n });
                  }}
                  disabled={thinking}
                >
                  {n}×{n}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2>{s.computer}</h2>
            <div className="cr-captured-row">
              <span className="cr-captured-label">{s.strength}</span>
              <span>
                {s.levelLabel(level)} · {s.levelDesc[level - 1]}
              </span>
            </div>
            <div className="cr-captured-row">
              <span className="cr-captured-label">{s.lastSearch}</span>
              <span className="cr-stats">
                {aiStats
                  ? s.searchStats(
                      aiStats.depth,
                      num(formatNodes(aiStats.nodes)),
                      num((aiStats.timeMs / 1000).toFixed(1))
                    )
                  : "—"}
              </span>
            </div>
          </section>

          <section>
            <h2>{s.stonesOnBoard}</h2>
            <div className="cr-captured-row">
              <span className="cr-captured-label">
                <DiscGlyph color="x" size={22} /> {s.xName}
              </span>
              <span className="cr-stats">{counts.x}</span>
            </div>
            <div className="cr-captured-row">
              <span className="cr-captured-label">
                <DiscGlyph color="o" size={22} /> {s.oName}
              </span>
              <span className="cr-stats">{counts.o}</span>
            </div>
          </section>

          <section className="cr-moves">
            <h2>{s.moves}</h2>
            <ol className="cr-log">
              {logPairs.length === 0 && <li className="cr-log-empty">{s.noMoves}</li>}
              {logPairs.map(([a, b], i) => (
                <li key={i}>
                  <span className="cr-log-num">{i + 1}.</span> {a}
                  {b ? <span> {b}</span> : null}
                </li>
              ))}
            </ol>
          </section>

          <section className="cr-help">
            <h2>{s.howToPlay}</h2>
            <ul>
              {s.helpBullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

/** Is it the human's turn? (engine turn 1 = X, 2 = O) */
function isPlayerTurn(pos: Position, playerColor: Color): boolean {
  return pos.turn === (playerColor === "x" ? 1 : 2);
}

function isAiTurn(pos: Position, playerColor: Color): boolean {
  return pos.result.status === "ongoing" && !isPlayerTurn(pos, playerColor);
}
