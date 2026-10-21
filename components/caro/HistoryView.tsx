"use client";

import { useEffect, useMemo, useState } from "react";
import { Board } from "./Board";
import { VideoExportModal, type VideoGame } from "./VideoExportModal";
import { STR } from "@/lib/caro/i18n";
import { Pagination, usePagination } from "./Pagination";
import { burstConfetti } from "@/lib/caro/confetti";
import { useAuth } from "./AuthProvider";
import {
  fetchCaroRatingHistory,
  fetchGameHistory,
  fetchGameStats,
  type CaroGameRow,
  type CaroRatingPoint,
} from "@/lib/supabase/engagement";
import {
  fetchMyRoomMatches,
  type MyRoomMatch,
} from "@/lib/supabase/rooms";
import { reasonLabel } from "./RoomMatchView";
import {
  applyMove,
  gameStatus,
  initialState,
  matchMove,
  moveStart,
  parsePosition,
  pieceAt,
  stateToBoard,
  type Color,
  type Lang,
  type Move,
  type Position,
} from "@/lib/caro/engineApi";
import { useRef } from "react";

interface BoardState {
  pos: Position;
}

function boardStateAfter(
  movesStr: string,
  plyCount: number,
  startPos?: string | null
): BoardState {
  let pos: Position = startPos ? parsePosition(startPos) ?? initialState() : initialState();
  const tokens = movesStr.trim().split(/\s+/).filter(Boolean).slice(0, plyCount);
  for (const tok of tokens) {
    const move = matchMove(pos, tok);
    if (!move) break;
    pos = applyMove(pos, move).state;
  }
  return { pos };
}

function boardAfter(
  movesStr: string,
  plyCount: number,
  startPos?: string | null
): Position {
  return boardStateAfter(movesStr, plyCount, startPos).pos;
}

/** SVG polyline points for the rating sparkline (300x60 viewBox). */
function ratingSparkPoints(pts: { rating: number }[]): string {
  const n = pts.length;
  const min = Math.min(...pts.map((p) => p.rating));
  const max = Math.max(...pts.map((p) => p.rating));
  const span = Math.max(1, max - min);
  return pts
    .map((p, i) => {
      const x = n === 1 ? 150 : (i / (n - 1)) * 300;
      const y = 56 - ((p.rating - min) / span) * 48;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function HistoryView({ lang }: { lang: Lang }) {
  const { user } = useAuth();
  const [games, setGames] = useState<CaroGameRow[]>([]);
  const [totals, setTotals] = useState({ wins: 0, losses: 0, draws: 0 });
  const [ratingPts, setRatingPts] = useState<CaroRatingPoint[]>([]);
  const [roomMatches, setRoomMatches] = useState<MyRoomMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [replay, setReplay] = useState<CaroGameRow | null>(null);
  const [ply, setPly] = useState(0);
  const [videoGame, setVideoGame] = useState<VideoGame | null>(null);

  const openVideoExport = (g: CaroGameRow) => {
    const ucis = g.moves.trim().split(/\s+/).filter(Boolean);
    if (ucis.length === 0) return;
    const date = new Date(g.created_at).toLocaleDateString(
      lang === "vi" ? "vi-VN" : "en-US"
    );
    const title =
      g.player_color === "cvc"
        ? g.result === "win"
          ? lang === "vi"
            ? "🤖 Máy đấu máy: X thắng! 🏆"
            : "🤖 Computer vs Computer: X wins! 🏆"
          : g.result === "draw"
            ? lang === "vi"
              ? "🤖 Máy đấu máy: Hòa! 🤝"
              : "🤖 Computer vs Computer: Draw! 🤝"
            : lang === "vi"
              ? "🤖 Máy đấu máy: O thắng! 🏆"
              : "🤖 Computer vs Computer: O wins! 🏆"
        : g.result === "win"
        ? lang === "vi"
          ? `Thắng máy cấp ${g.ai_level}! 🏆`
          : `Beat the computer (Level ${g.ai_level})! 🏆`
        : g.result === "draw"
          ? lang === "vi"
            ? "Hòa! 🤝"
            : "It's a draw! 🤝"
          : lang === "vi"
            ? "Thua một ván hay! 💪"
            : "Lost a good game! 💪";
    setVideoGame({
      moves: ucis,
      startPos: g.start_pos ?? undefined,
      playerColor: g.player_color === "o" ? "o" : "x",
      title,
      subtitle:
        lang === "vi"
          ? `${ucis.length} nước · ${date}`
          : `${ucis.length} moves · ${date}`,
      shareUrl: "https://cocaro.synerworlds.com",
    });
  };

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    fetchGameHistory(100)
      .then(setGames)
      .catch(() => {})
      .finally(() => setLoading(false));
    fetchGameStats(user.id).then(setTotals).catch(() => {});
    fetchCaroRatingHistory(user.id).then(setRatingPts).catch(() => {});
    fetchMyRoomMatches(50).then(setRoomMatches).catch(() => {});
  }, [user]);

  const { page, pageCount, pageItems, setPage } = usePagination(games, 10);
  const roomPaging = usePagination(roomMatches, 10);

  // --- replay celebration state ---
  const [shakeKey, setShakeKey] = useState(0);
  const [autoplay, setAutoplay] = useState(false);
  const celebratedRef = useRef<string | null>(null);
  const fightTimer = useRef<number | null>(null);

  const replayUcis = useMemo(
    () =>
      replay
        ? replay.moves.trim().split(/\s+/).filter(Boolean)
        : [],
    [replay]
  );
  const totalPlies = replayUcis.length;

  // Final position + status (for the win celebration).
  const finalState = useMemo(
    () => (replay ? boardStateAfter(replay.moves, totalPlies, replay.start_pos) : null),
    [replay, totalPlies]
  );
  const finalStatus = useMemo(
    () =>
      finalState ? gameStatus(finalState.pos, 0, new Map()) : null,
    [finalState]
  );
  const endedInFive =
    !!replay && ply === totalPlies && totalPlies > 0 &&
    !!finalStatus?.over && finalStatus.kind === "five";

  // New game: reset celebration bookkeeping.
  useEffect(() => {
    celebratedRef.current = null;
    setAutoplay(false);
    if (fightTimer.current) window.clearTimeout(fightTimer.current);
  }, [replay?.id]);

  // Five-in-a-row celebration when stepping (or autoplaying) to the final ply.
  useEffect(() => {
    if (!replay || !endedInFive) return;
    if (celebratedRef.current === replay.id) return;
    celebratedRef.current = replay.id;
    setShakeKey((k) => k + 1);
    burstConfetti();
  }, [replay, endedInFive, ply]); // eslint-disable-line react-hooks/exhaustive-deps


  // Autoplay.
  useEffect(() => {
    if (!autoplay || !replay) return;
    if (ply >= totalPlies) {
      setAutoplay(false);
      return;
    }
    const t = window.setTimeout(() => setPly((p) => p + 1), 700);
    return () => window.clearTimeout(t);
  }, [autoplay, ply, replay, totalPlies]);

  const currentMove: Move | null =
    replay && ply > 0 && replayUcis[ply - 1]
      ? matchMove(boardStateAfter(replay.moves, ply - 1, replay.start_pos).pos, replayUcis[ply - 1]) ?? null
      : null;


  if (!user) {
    return (
      <div className="cr-scroll-area">
        <div className="cr-view">
          <p>{lang === "vi" ? "Đăng nhập để xem lịch sử." : "Sign in to view history."}</p>
        </div>
      </div>
    );
  }

  if (replay) {
    return (
      <div className="cr-page">
        <div className="cr-layout">
          <div className="cr-board-area">
            <div key={shakeKey} className={`cr-board-fit${shakeKey > 0 ? " shake" : ""}`}>
            <Board
              board={stateToBoard(boardAfter(replay.moves, ply, replay.start_pos))}
              size={(replay.start_pos ? parsePosition(replay.start_pos) : null)?.size ?? 15}
              flipped={replay.player_color === "o"}
              lastMove={currentMove}
              winningRun={
                ply === totalPlies
                  ? boardAfter(replay.moves, ply, replay.start_pos).result.winningRun
                  : null
              }
              interactive={false}
              boardLabel=""
              onSquareClick={() => {}}
            />
              {endedInFive && (
                <div className="cr-mate-overlay" aria-hidden="true">
                  <div className="cr-mate-banner">
                    <span>🏆</span>
                    <span>{lang === "vi" ? "Thắng!" : "Win!"}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
          <aside className="cr-panel">
            <button type="button" className="cr-btn cr-btn-sm" onClick={() => setReplay(null)}>
              ← {lang === "vi" ? "Lịch sử" : "History"}
            </button>
            <div className="cr-replay-controls">
          <button type="button" className="cr-btn cr-btn-sm" disabled={ply === 0} onClick={() => setPly(0)}>
            ⏮
          </button>
          <button type="button" className="cr-btn cr-btn-sm" disabled={ply === 0} onClick={() => setPly((p) => p - 1)}>
            ◀
          </button>
          <span>
            {ply} / {totalPlies}
          </span>
          <button
            type="button"
            className="cr-btn cr-btn-sm"
            disabled={ply === totalPlies}
            onClick={() => setPly((p) => p + 1)}
          >
            ▶
          </button>
          <button
            type="button"
            className="cr-btn cr-btn-sm"
            disabled={ply === totalPlies}
            onClick={() => setPly(totalPlies)}
          >
            ⏭
          </button>
              <button
                type="button"
                className="cr-btn cr-btn-sm"
                disabled={ply === totalPlies}
                onClick={() => setAutoplay((a) => !a)}
              >
                {autoplay
                  ? lang === "vi" ? "⏸ Dừng" : "⏸ Pause"
                  : lang === "vi" ? "⏵ Tự chạy" : "⏵ Auto"}
              </button>
            </div>
            <p className="cr-hint">
              {lang === "vi" ? "Máy cấp" : "Level"} {replay.ai_level} ·{" "}
              {replay.plies} {lang === "vi" ? "nước" : "plies"} ·{" "}
              {new Date(replay.created_at).toLocaleDateString(
                lang === "vi" ? "vi-VN" : "en-US"
              )}
            </p>
            <button
              type="button"
              className="cr-btn cr-btn-sm"
              onClick={() => openVideoExport(replay)}
            >
              🎬 {STR[lang].videoExport}
            </button>
          </aside>
        </div>
        <VideoExportModal
          lang={lang}
          game={videoGame}
          onClose={() => setVideoGame(null)}
        />
      </div>
    );
  }

  const resultIcon = (r: string) =>
    r === "win" ? "✅" : r === "loss" ? "❌" : "➖";

  return (
    <div className="cr-scroll-area">
    <div className="cr-view">
      <h2>📜 {lang === "vi" ? "Lịch sử ván đấu" : "Game history"}</h2>
      {loading ? (
        <p>…</p>
      ) : games.length === 0 && roomMatches.length === 0 ? (
        <p className="cr-hint">
          {lang === "vi" ? "Chưa có ván nào." : "No games yet."}
        </p>
      ) : (
        <>
          {games.length > 0 && (
            <>
          <div className="cr-stats-row">
            <span>🏆 {totals.wins} {STR[lang].wins}</span>
            <span>💔 {totals.losses} {STR[lang].losses}</span>
            <span>🤝 {totals.draws} {STR[lang].draws}</span>
          </div>
          {ratingPts.length > 1 && (
            <div className="cr-spark">
              <div className="cr-spark-head">
                <span>📈 {STR[lang].ratingProgress}</span>
                <span>
                  {ratingPts[0].rating} →{" "}
                  {ratingPts[ratingPts.length - 1].rating} (
                  {(ratingPts[ratingPts.length - 1].rating >= ratingPts[0].rating
                    ? "+"
                    : "") +
                    (ratingPts[ratingPts.length - 1].rating - ratingPts[0].rating)}
                  )
                </span>
              </div>
              <svg
                viewBox="0 0 300 60"
                preserveAspectRatio="none"
                className="cr-spark-svg"
                aria-hidden="true"
              >
                <polyline
                  points={ratingSparkPoints(ratingPts)}
                  fill="none"
                  stroke="#ffd43b"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>
          )}
          <ul className="cr-board-list">
            {pageItems.map((g) => (
              <li key={g.id} className="cr-lb-row">
                <span>{resultIcon(g.result)}</span>
                <span className="cr-lb-name">
                  {g.player_color === "cvc"
                    ? `🤖 ${STR[lang].cvcTitle} · ${lang === "vi" ? "cấp" : "Lv"} ${g.ai_level} · `
                    : `${lang === "vi" ? "Máy cấp" : "Level"} ${g.ai_level} · `}
                  {g.plies} {lang === "vi" ? "nước" : "plies"}
                </span>
                <span className="cr-lb-title">
                  {new Date(g.created_at).toLocaleDateString(
                    lang === "vi" ? "vi-VN" : "en-US"
                  )}
                </span>
                {g.moves && (
                  <button
                    type="button"
                    className="cr-btn cr-btn-sm"
                    onClick={() => {
                      setReplay(g);
                      setPly(0);
                    }}
                  >
                    {lang === "vi" ? "Xem lại" : "Replay"}
                  </button>
                )}
                {g.moves && (
                  <button
                    type="button"
                    className="cr-btn cr-btn-sm"
                    title={STR[lang].videoExport}
                    onClick={() => openVideoExport(g)}
                  >
                    🎬
                  </button>
                )}
              </li>
            ))}
          </ul>
          <Pagination page={page} pageCount={pageCount} onPage={setPage} />
            </>
          )}
          {roomMatches.length > 0 && (
            <>
              <h3>👥 {lang === "vi" ? "Ván đấu trong phòng" : "Room matches"}</h3>
              <ul className="cr-board-list">
                {roomPaging.pageItems.map((rm) => {
                  const plies = rm.match.moves
                    ? rm.match.moves.split(",").filter((t) => t.trim() !== "").length
                    : 0;
                  const icon =
                    rm.match.result === "draw"
                      ? "➖"
                      : rm.match.result === rm.myColor
                        ? "✅"
                        : "❌";
                  return (
                    <li key={rm.match.id} className="cr-lb-row">
                      <span>{icon}</span>
                      <span className="cr-lb-name">
                        {lang === "vi" ? "gặp" : "vs"} {rm.opponentName} · {rm.roomName}
                      </span>
                      <span className="cr-lb-title">
                        {plies} {lang === "vi" ? "nước" : "plies"}
                        {rm.match.reason
                          ? ` · ${reasonLabel(rm.match.reason, lang)}`
                          : ""}
                        {" · "}
                        {new Date(
                          rm.match.finished_at ?? rm.match.created_at ?? ""
                        ).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-US")}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <Pagination
                page={roomPaging.page}
                pageCount={roomPaging.pageCount}
                onPage={roomPaging.setPage}
              />
            </>
          )}
        </>
      )}
    </div>
    <VideoExportModal
      lang={lang}
      game={videoGame}
      onClose={() => setVideoGame(null)}
    />
    </div>
  );
}
