"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Board } from "./Board";
import {
  createCorrGame,
  finishCorrGame,
  getCorrGame,
  listMyCorrGames,
  pushCorrMove,
  resignCorrGame,
  subscribeCorrGame,
  type CorrGame,
  type CorrGameRow,
} from "@/lib/supabase/correspondence";
import { listFriends, type FriendRow } from "@/lib/supabase/friends";
import { useAuth } from "./AuthProvider";
import { usePagination, Pagination } from "./Pagination";
import { notifyPushTrigger } from "@/lib/push/client";
import {
  applyMove,
  colorOfPlayer,
  gameStatus,
  initialState,
  makeMove,
  parseMoveList,
  stateToBoard,
  type Color,
  type Lang,
  type Move,
  type Position,
} from "@/lib/caro/engineApi";
import { BOARD_SIZES } from "@/lib/caro/engine";

interface BoardState {
  pos: Position;
  lastMove: Move | null;
}

function replay(movesStr: string, size: number): BoardState {
  let pos = initialState(size);
  let lastMove: Move | null = null;
  for (const idx of parseMoveList(movesStr)) {
    const m = makeMove(idx, size);
    const r = applyMove(pos, m);
    if (r.state === pos) break;
    pos = r.state;
    lastMove = m;
  }
  return { pos, lastMove };
}

function moveCount(moves: string): number {
  return parseMoveList(moves).length;
}

export function CorrView({
  lang,
  initialGameId,
  onInitialConsumed,
}: {
  lang: Lang;
  /** Deep-link: open this game on mount (e.g. from a notification). */
  initialGameId?: string | null;
  onInitialConsumed?: () => void;
}) {
  const { user } = useAuth();
  const [games, setGames] = useState<CorrGameRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setGames(await listMyCorrGames());
    } catch {
      /* not configured */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) load();
    else setLoading(false);
  }, [user, load]);

  // Refresh the list when returning from a board view
  useEffect(() => {
    if (activeId === null && user) load();
  }, [activeId, user, load]);

  // Deep-link: open the requested game once the list loads.
  useEffect(() => {
    if (initialGameId && games.some((g) => g.id === initialGameId)) {
      setActiveId(initialGameId);
      onInitialConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialGameId, games]);

  const { page, pageCount, pageItems, setPage } = usePagination(games, 10);

  if (!user) {
    return (
      <div className="cr-view">
        <p>
          {lang === "vi"
            ? "Đăng nhập để chơi cờ thư."
            : "Sign in to play correspondence caro."}
        </p>
      </div>
    );
  }

  if (activeId) {
    return (
      <CorrBoard
        gameId={activeId}
        lang={lang}
        onBack={() => setActiveId(null)}
      />
    );
  }

  return (
    <div className="cr-view">
      <div className="cr-view-head">
        <h2>✉️ {lang === "vi" ? "Cờ thư" : "Correspondence"}</h2>
        <button
          type="button"
          className="cr-btn cr-btn-primary cr-btn-sm"
          onClick={() => setShowNew((v) => !v)}
        >
          ＋ {lang === "vi" ? "Ván mới" : "New game"}
        </button>
      </div>
      {showNew && (
        <NewCorrGame
          lang={lang}
          onCreated={(id) => {
            setShowNew(false);
            setActiveId(id);
          }}
        />
      )}
      {loading ? (
        <p>…</p>
      ) : games.length === 0 ? (
        <p className="cr-hint">
          {lang === "vi"
            ? "Chưa có ván cờ thư nào. Tạo ván mới để chơi với bạn bè theo nhịp của bạn."
            : "No correspondence games yet. Start one to play with friends at your own pace."}
        </p>
      ) : (
        <>
          <ul className="cr-board-list">
            {pageItems.map((g) => {
              const myColor: Color =
                g.x_id === user.id ? "x" : "o";
              const oppName =
                myColor === "x" ? g.o_name : g.x_name;
              const myTurn =
                g.status === "active" &&
                (moveCount(g.moves) % 2 === 0) === (myColor === "x");
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    className="cr-room-row"
                    onClick={() => setActiveId(g.id)}
                  >
                    <span>
                      {oppName}{" "}
                      <span className="cr-lb-title">
                        ({lang === "vi"
                          ? myColor === "x"
                            ? "bạn cầm X"
                            : "bạn cầm O"
                          : myColor === "x"
                            ? "you play X"
                            : "you play O"}
                        )
                      </span>
                    </span>
                    <span>
                      {g.status === "finished" ? (
                        <span className="cr-lb-title">
                          {g.result === "draw"
                            ? lang === "vi"
                              ? "Hòa"
                              : "Draw"
                            : g.winner_id === user.id
                              ? lang === "vi"
                                ? "Thắng"
                                : "Won"
                              : lang === "vi"
                                ? "Thua"
                                : "Lost"}
                        </span>
                      ) : myTurn ? (
                        <span className="cr-turn-badge">
                          {lang === "vi" ? "Đến lượt bạn" : "Your turn"}
                        </span>
                      ) : (
                        <span className="cr-lb-title">
                          {lang === "vi" ? "Chờ đối thủ" : "Waiting"}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <Pagination page={page} pageCount={pageCount} onPage={setPage} />
        </>
      )}
    </div>
  );
}

function NewCorrGame({
  lang,
  onCreated,
}: {
  lang: Lang;
  onCreated: (id: string) => void;
}) {
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [size, setSize] = useState(15);

  useEffect(() => {
    listFriends().then(setFriends).catch(() => {});
  }, []);

  const start = async (opponentId: string) => {
    setBusy(true);
    setMsg("");
    try {
      const g = await createCorrGame(opponentId, size);
      onCreated(g.id);
    } catch {
      setMsg(lang === "vi" ? "Lỗi tạo ván." : "Failed to create game.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cr-corr-new">
      <h3>{lang === "vi" ? "Chọn đối thủ" : "Choose opponent"}</h3>
      <div className="cr-size-row" role="group" aria-label={lang === "vi" ? "Cỡ bàn" : "Board size"}>
        {BOARD_SIZES.map((n) => (
          <button
            key={n}
            type="button"
            className={`cr-btn cr-size-btn${size === n ? " active" : ""}`}
            onClick={() => setSize(n)}
          >
            {n}×{n}
          </button>
        ))}
      </div>
      {friends.length === 0 ? (
        <p className="cr-hint">
          {lang === "vi"
            ? "Kết bạn trước (tab Bạn bè) để mời chơi cờ thư."
            : "Follow friends first (Friends tab) to invite them."}
        </p>
      ) : (
        <ul className="cr-board-list">
          {friends.map((f) => (
            <li key={f.id} className="cr-lb-row">
              <span className="cr-lb-name">
                {f.full_name || f.username || "Player"}
              </span>
              <button
                type="button"
                className="cr-btn cr-btn-primary cr-btn-sm"
                disabled={busy}
                onClick={() => start(f.id)}
              >
                {lang === "vi" ? "Mời chơi" : "Invite"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="cr-msg">{msg}</p>}
    </div>
  );
}

function CorrBoard({
  gameId,
  lang,
  onBack,
}: {
  gameId: string;
  lang: Lang;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const [game, setGame] = useState<CorrGame | null>(null);
  const [resigning, setResigning] = useState(false);
  const gameRef = useRef<CorrGame | null>(null);
  gameRef.current = game;

  useEffect(() => {
    getCorrGame(gameId).then((g) => g && setGame(g));
  }, [gameId]);

  useEffect(() => {
    if (!game) return;
    const ch = subscribeCorrGame(game.id, (g) => {
      const local = moveCount(gameRef.current?.moves ?? "");
      const remote = moveCount(g.moves ?? "");
      if (remote >= local) setGame(g);
    });
    return () => {
      ch.unsubscribe();
    };
  }, [game?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const size = game?.board_size ?? 15;
  const bs = useMemo(() => replay(game?.moves ?? "", size), [game?.moves, size]);
  const turnColor = colorOfPlayer(bs.pos.turn);

  const myColor: Color | null = useMemo(() => {
    if (!user || !game) return null;
    return game.x_id === user.id ? "x" : "o";
  }, [user, game]);

  const status = useMemo(() => gameStatus(bs.pos), [bs]);

  // Finish when the game ends (the player who just moved reports)
  const finishedRef = useRef(false);
  useEffect(() => {
    if (!status.over || !game || game.status !== "active" || finishedRef.current)
      return;
    finishedRef.current = true;
    const result =
      status.winner === "x"
        ? ("x" as const)
        : status.winner === "o"
          ? ("o" as const)
          : ("draw" as const);
    const winnerId =
      status.winner === "x"
        ? game.x_id
        : status.winner === "o"
          ? game.o_id
          : null;
    finishCorrGame(game.id, result, winnerId).catch(() => {});
    notifyPushTrigger({ kind: "corr_end", gameId: game.id });
  }, [status, game]);

  const doMove = useCallback(
    async (idx: number) => {
      if (!game || game.status !== "active") return;
      const newMoves = [...parseMoveList(game.moves), idx].join(" ");
      setGame({ ...game, moves: newMoves });
      try {
        await pushCorrMove(game.id, newMoves);
        notifyPushTrigger({ kind: "corr", gameId: game.id });
      } catch {
        /* realtime will correct */
      }
    },
    [game]
  );

  const myTurn =
    !!myColor && turnColor === myColor && !status.over && game?.status === "active";
  const onSquareClick = useCallback(
    (sq: number) => {
      if (!myTurn) return;
      if (bs.pos.board[sq] !== 0) return;
      doMove(sq);
    },
    [myTurn, bs, doMove]
  );

  const doResign = async () => {
    if (!game || resigning) return;
    setResigning(true);
    try {
      await resignCorrGame(game.id);
      notifyPushTrigger({ kind: "corr_end", gameId: game.id });
      const g = await getCorrGame(game.id);
      if (g) setGame(g);
    } catch {
      /* ignore */
    } finally {
      setResigning(false);
    }
  };

  if (!game) {
    return (
      <div className="cr-view">
        <p>…</p>
      </div>
    );
  }

  const turnLabel =
    lang === "vi"
      ? turnColor === "x"
        ? "X đi"
        : "O đi"
      : turnColor === "x"
        ? "X to move"
        : "O to move";

  return (
    <div className="cr-view">
      <button type="button" className="cr-btn cr-btn-sm" onClick={onBack}>
        ← {lang === "vi" ? "Danh sách" : "Games"}
      </button>
      <div className="cr-room-match">
        <div className="cr-room-match-main">
          <div className="cr-board-area">
            <div className="cr-board-fit">
              <Board
                board={stateToBoard(bs.pos)}
                size={size}
                flipped={myColor === "o"}
                lastMove={bs.lastMove}
                winningRun={bs.pos.result.winningRun}
                ghostColor={myTurn ? myColor : null}
                interactive={myTurn}
                boardLabel=""
                onSquareClick={onSquareClick}
              />
            </div>
          </div>
          <aside className="cr-panel cr-room-side">
            <button type="button" className="cr-btn cr-btn-sm cr-room-exit" onClick={onBack}>
              ← {lang === "vi" ? "Danh sách" : "Games"}
            </button>
        <div className="cr-room-status">
          {status.over || game.status === "finished" ? (
            <span>
              {game.result === "draw"
                ? lang === "vi"
                  ? "Hòa!"
                  : "Draw!"
                : game.winner_id === user?.id
                  ? lang === "vi"
                    ? "Bạn thắng! 🎉"
                    : "You won! 🎉"
                  : lang === "vi"
                    ? "Bạn thua."
                    : "You lost."}
            </span>
          ) : (
            <span>
              {turnLabel}
              {myColor === turnColor && (lang === "vi" ? " (bạn)" : " (you)")}
            </span>
          )}
        </div>
        {game.status === "active" && !status.over && (
          <div className="cr-room-form">
            <button
              type="button"
              className="cr-btn cr-btn-sm"
              disabled={resigning}
              onClick={doResign}
            >
              🏳️ {lang === "vi" ? "Đầu hàng" : "Resign"}
            </button>
          </div>
        )}
          </aside>
        </div>
      </div>
    </div>
  );
}
