"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { Pagination } from "./Pagination";
import {
  deleteSetup,
  listSavedSetups,
  saveSetup,
  type SavedSetup,
} from "@/lib/caro/savedSetups";
import { Board } from "./Board";
import { DiscPieceAt } from "./Pieces";
import {
  boardToState,
  colorOfPlayer,
  initialState,
  LEVELS,
  parsePosition,
  idxToRC,
  serializePosition,
  stateToBoard,
  type Board as BoardT,
  type CaroState,
  type Color,
  type Lang,
  type Level,
  type Piece,
  type Square,
} from "@/lib/caro/engineApi";
import { BOARD_SIZES, DEFAULT_SIZE } from "@/lib/caro/engine";
import { STR } from "@/lib/caro/i18n";
import {
  SETUP_COLORS,
  cloneBoard,
  emptyBoard,
  validateSetup,
  type SetupError,
} from "@/lib/caro/setup";

interface Props {
  lang: Lang;
  onPlay: (st: CaroState, playerColor: Color) => void;
  /** Watch two engines play the position out (computer vs computer). */
  onCvc: (st: CaroState) => void;
  /** The app's shared play-config difficulty (AppShell state) — the
   * setup form edits it directly, so the game starts at this level. */
  level: Level;
  onLevelChange: (level: Level) => void;
}

type Tool =
  | { kind: "move" }
  | { kind: "erase" }
  | { kind: "place"; color: Color };

const ERROR_KEYS: Record<SetupError, "setupErrEmpty" | "setupErrNoMoves"> = {
  empty: "setupErrEmpty",
  noMoves: "setupErrNoMoves",
};

export function SetupView({ lang, onPlay, onCvc, level, onLevelChange }: Props) {
  const s = STR[lang];
  const [size, setSize] = useState<number>(DEFAULT_SIZE);
  const [board, setBoard] = useState<BoardT>(() => stateToBoard(initialState()));
  const [tool, setTool] = useState<Tool>({ kind: "place", color: "x" });
  const [lifted, setLifted] = useState<Square | null>(null);
  const [playerColor, setPlayerColor] = useState<Color>("x");
  const [turn, setTurn] = useState<Color>("x");
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const [savedList, setSavedList] = useState<SavedSetup[]>([]);
  const [savedName, setSavedName] = useState("");
  const [savedPage, setSavedPage] = useState(0);

  useEffect(() => {
    let live = true;
    listSavedSetups(user?.id ?? null)
      .then((rows) => {
        if (live) setSavedList(rows);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [user?.id]);

  const changeSize = (n: number) => {
    setSize(n);
    setBoard(emptyBoard(n));
    setLifted(null);
    setError(null);
  };

  const onSaveSetup = async () => {
    const name =
      savedName.trim() ||
      `${s.setupsUnnamed} ${new Date().toLocaleDateString(
        lang === "vi" ? "vi-VN" : "en-US"
      )}`;
    try {
      const row = await saveSetup(
        user?.id ?? null,
        name,
        serializePosition(boardToState(board, turn))
      );
      setSavedList((prev) => [row, ...prev]);
      setSavedName("");
      setSavedPage(0);
      setError(null);
    } catch {
      setError(s.setupsSaveFailed);
    }
  };

  const onLoadSetup = (row: SavedSetup) => {
    const st = parsePosition(row.pos);
    if (!st) return;
    setSize(st.size);
    setBoard(stateToBoard(st));
    setTurn(colorOfPlayer(st.turn));
    setLifted(null);
    setError(null);
  };

  const onDeleteSetup = async (row: SavedSetup) => {
    try {
      await deleteSetup(user?.id ?? null, row.id);
      setSavedList((prev) => prev.filter((x) => x.id !== row.id));
    } catch {
      /* best-effort */
    }
  };

  const setSquare = (sq: Square, piece: Piece | null) => {
    const { r, c } = idxToRC(sq, size);
    setBoard((prev) => {
      const next = cloneBoard(prev);
      next[r][c] = piece;
      return next;
    });
  };

  const onSquareClick = (sq: Square) => {
    setError(null);
    if (tool.kind === "place") {
      setSquare(sq, { color: tool.color });
      setLifted(null);
      return;
    }
    if (tool.kind === "erase") {
      setSquare(sq, null);
      setLifted(null);
      return;
    }

    // Move tool: tap once to lift a mark, again on the destination to
    // drop it. Dropping replaces any mark already on that cell.
    if (lifted !== null) {
      if (lifted === sq) {
        setLifted(null);
        return;
      }
      const { r: lr, c: lc } = idxToRC(lifted, size);
      const { r, c } = idxToRC(sq, size);
      setBoard((prev) => {
        const next = cloneBoard(prev);
        next[r][c] = next[lr][lc];
        next[lr][lc] = null;
        return next;
      });
      setLifted(null);
    } else {
      const { r, c } = idxToRC(sq, size);
      if (board[r][c]) setLifted(sq);
    }
  };

  const toolActive = (candidate: Tool) =>
    tool.kind === candidate.kind &&
    (candidate.kind !== "place" ||
      (tool.kind === "place" && tool.color === candidate.color));

  const chooseTool = (next: Tool) => {
    setTool(next);
    setLifted(null);
    setError(null);
  };

  const renderPieceButton = (color: Color) => {
    const candidate: Tool = { kind: "place", color };
    const colorName = color === "x" ? s.xName : s.oName;
    return (
      <button
        key={color}
        type="button"
        className={`cr-palbtn${toolActive(candidate) ? " active" : ""}`}
        onClick={() => chooseTool(candidate)}
        aria-pressed={toolActive(candidate)}
        title={colorName}
      >
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <DiscPieceAt color={color} x={50} y={50} size={92} />
        </svg>
      </button>
    );
  };

  const start = () => {
    const setupError = validateSetup(board, turn);
    if (setupError) {
      setError(s[ERROR_KEYS[setupError]]);
      return;
    }
    setError(null);
    onPlay(boardToState(board, turn), playerColor);
  };

  const startCvc = () => {
    const setupError = validateSetup(board, turn);
    if (setupError) {
      setError(s[ERROR_KEYS[setupError]]);
      return;
    }
    setError(null);
    onCvc(boardToState(board, turn));
  };

  const reset = () => {
    setBoard(stateToBoard(initialState(size)));
    setTurn("x");
    setLifted(null);
    setError(null);
  };

  const clear = () => {
    setBoard(emptyBoard(size));
    setLifted(null);
    setError(null);
  };

  return (
    <div className="cr-page">
      <div className="cr-layout">
        <div className="cr-board-area">
          <div className="cr-board-fit">
            <Board
              board={board}
              size={size}
              flipped={false}
              selected={lifted}
              interactive
              boardLabel={s.setupTitle}
              onSquareClick={onSquareClick}
            />
          </div>
        </div>

        <aside className="cr-panel cr-setup-panel">
          <div>
            <h2 className="cr-setup-title">🧩 {s.setupTitle}</h2>
            <p className="cr-hint">{s.setupHint}</p>
          </div>

          <section>
            <h2>{s.boardSize}</h2>
            <div className="cr-size-row" role="group" aria-label={s.boardSize}>
              {BOARD_SIZES.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`cr-btn cr-size-btn${size === n ? " active" : ""}`}
                  onClick={() => changeSize(n)}
                >
                  {n}×{n}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2>{s.setupPieces}</h2>
            <div className="cr-palette">
              <button
                type="button"
                className={`cr-palbtn cr-palbtn-tool${tool.kind === "move" ? " active" : ""}`}
                onClick={() => chooseTool({ kind: "move" })}
                aria-pressed={tool.kind === "move"}
                title={s.setupMove}
              >
                ✥ <span>{s.setupMove}</span>
              </button>
              <button
                type="button"
                className={`cr-palbtn cr-palbtn-tool${tool.kind === "erase" ? " active" : ""}`}
                onClick={() => chooseTool({ kind: "erase" })}
                aria-pressed={tool.kind === "erase"}
                title={s.setupErase}
              >
                🧽 <span>{s.setupErase}</span>
              </button>
            </div>
            <div className="cr-palette">
              {SETUP_COLORS.map((c) => renderPieceButton(c))}
            </div>
          </section>

          <section>
            <h2>{s.setupTitle}</h2>
            <div className="cr-setup-form">
              <label className="cr-field">
                <span>{s.level}</span>
                <select
                  className="cr-select"
                  value={level}
                  onChange={(e) => onLevelChange(Number(e.target.value))}
                >
                  {LEVELS.map((l) => (
                    <option key={l.level} value={l.level}>
                      {s.levelLabel(l.level)} — {s.levelDesc[l.level - 1]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="cr-field">
                <span>{s.youPlay}</span>
                <select
                  className="cr-select"
                  value={playerColor}
                  onChange={(e) => setPlayerColor(e.target.value as Color)}
                >
                  <option value="x">{s.xName}</option>
                  <option value="o">{s.oName}</option>
                </select>
              </label>
              <label className="cr-field">
                <span>{s.setupTurn}</span>
                <select
                  className="cr-select"
                  value={turn}
                  onChange={(e) => setTurn(e.target.value as Color)}
                >
                  <option value="x">{s.xName}</option>
                  <option value="o">{s.oName}</option>
                </select>
              </label>
            </div>

            {error && (
              <p className="cr-error cr-setup-error" role="alert">
                {error}
              </p>
            )}

            <div className="cr-setup-actions">
              <button type="button" className="cr-btn cr-btn-primary" onClick={start}>
                {s.setupStart}
              </button>
              <button type="button" className="cr-btn" onClick={startCvc}>
                {s.setupCvc}
              </button>
              <button type="button" className="cr-btn" onClick={reset}>
                {s.setupReset}
              </button>
              <button type="button" className="cr-btn" onClick={clear}>
                {s.setupClear}
              </button>
            </div>
          </section>

          <section>
            <h2>{s.setupsTitle}</h2>
            <div className="cr-setup-form">
              <label className="cr-field">
                <input
                  className="cr-input"
                  type="text"
                  value={savedName}
                  maxLength={60}
                  placeholder={s.setupsNamePh}
                  onChange={(e) => setSavedName(e.target.value)}
                />
              </label>
              <button type="button" className="cr-btn" onClick={onSaveSetup}>
                💾 {s.setupsSave}
              </button>
            </div>
            {savedList.length === 0 ? (
              <p className="cr-hint">{s.setupsEmpty}</p>
            ) : (
              <>
                <ul className="cr-board-list">
                  {savedList
                    .slice(savedPage * 5, savedPage * 5 + 5)
                    .map((row) => (
                      <li key={row.id} className="cr-lb-row">
                        <span className="cr-lb-name">{row.name}</span>
                        <span className="cr-lb-title">
                          {new Date(row.created_at).toLocaleDateString(
                            lang === "vi" ? "vi-VN" : "en-US"
                          )}
                        </span>
                        <button
                          type="button"
                          className="cr-btn cr-btn-sm"
                          onClick={() => onLoadSetup(row)}
                        >
                          {s.setupsLoad}
                        </button>
                        <button
                          type="button"
                          className="cr-btn cr-btn-sm"
                          aria-label="✕"
                          onClick={() => onDeleteSetup(row)}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                </ul>
                <Pagination
                  page={savedPage}
                  pageCount={Math.max(1, Math.ceil(savedList.length / 5))}
                  onPage={setSavedPage}
                />
              </>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
