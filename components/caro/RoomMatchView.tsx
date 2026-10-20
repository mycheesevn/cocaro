"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Board } from "./Board";
import { MatchSocial } from "./MatchSocial";
import { RoomChat } from "./RoomChat";
import { RoomVoice } from "./RoomVoice";
import { sendReaction, subscribeReactions } from "@/lib/supabase/comments";
import { notifyPushTrigger } from "@/lib/push/client";
import { STR } from "@/lib/caro/i18n";
import {
  cancelMatch,
  fetchNames,
  finishRoomMatch,
  getActiveMatch,
  getMatchById,
  pushMove,
  roomErrorKey,
  startRematch,
  subscribeMatch,
  subscribeRoomMatches,
  type RoomMatch,
  type XpEarned,
} from "@/lib/supabase/rooms";
import { useAuth } from "./AuthProvider";
import { burstConfetti } from "@/lib/caro/confetti";
import {
  playApplause,
  playLose,
  playMove,
  playWin,
} from "@/lib/caro/sound";
import {
  applyMove,
  colorOfPlayer,
  gameStatus,
  initialState,
  makeMove,
  moveToLabel,
  parseMoveList,
  stateToBoard,
  type Color,
  type Lang,
  type Move,
  type Position,
} from "@/lib/caro/engineApi";

interface BoardState {
  pos: Position;
  lastMove: Move | null;
}

/** Replay a stored move list (space-separated cell indices) at a board size. */
function replay(
  movesStr: string,
  size: number
): { state: BoardState; labels: string[]; indices: number[] } {
  let pos = initialState(size);
  let lastMove: Move | null = null;
  const labels: string[] = [];
  const indices = parseMoveList(movesStr);
  const played: number[] = [];
  for (const idx of indices) {
    const m = makeMove(idx, size);
    const r = applyMove(pos, m);
    if (r.state === pos) break; // illegal step — stop replay here
    pos = r.state;
    lastMove = m;
    played.push(idx);
    labels.push(moveToLabel(m));
  }
  return { state: { pos, lastMove }, labels, indices: played };
}

export function reasonLabel(reason: string | null, lang: Lang): string {
  const map: Record<string, [string, string]> = {
    five: ["Nối được 5 quân", "Five in a row"],
    resign: ["Đầu hàng", "Resignation"],
    cancelled: ["Đã hủy", "Cancelled"],
    "full-board": ["Hòa — kín bàn", "Draw — full board"],
    draw: ["Hòa", "Draw"],
  };
  const pair = reason ? map[reason] : undefined;
  if (!pair) return "";
  return lang === "vi" ? pair[0] : pair[1];
}

export function RoomMatchView({
  roomId,
  matchId,
  lang,
  isLeader = false,
  guest = false,
  hideSocial = false,
  namesOverride,
  roomCode,
  onBackToRoom,
  onExitRoom,
  onViewMatch,
  onRequireLogin,
}: {
  roomId: string;
  matchId: string | null;
  lang: Lang;
  isLeader?: boolean;
  guest?: boolean;
  hideSocial?: boolean;
  namesOverride?: { x: string | null; o: string | null };
  /** Room invite code — appended to the share-result text (PacClone pattern). */
  roomCode?: string | null;
  onBackToRoom?: () => void;
  onExitRoom?: () => void;
  onViewMatch?: (matchId: string) => void;
  /** Guests: tapping the react teaser asks the host to open login. */
  onRequireLogin?: () => void;
}) {
  const s = STR[lang];
  const { user } = useAuth();
  const [match, setMatch] = useState<RoomMatch | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [rematching, setRematching] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [xpEarned, setXpEarned] = useState<XpEarned | null>(null);
  const [names, setNames] = useState<{ x: string; o: string }>({
    x: "Player",
    o: "Player",
  });
  const [armResign, setArmResign] = useState(false);
  const [armCancel, setArmCancel] = useState(false);
  const [shared, setShared] = useState(false);
  const matchRef = useRef<RoomMatch | null>(null);
  matchRef.current = match;
  const finishedRef = useRef(false);
  const movesBoxRef = useRef<HTMLDivElement | null>(null);
  /** Win drama: banner + big shake + gold flash, once per match (PacClone parity). */
  const [mateBannerKey, setMateBannerKey] = useState(0);
  const [mateFxKey, setMateFxKey] = useState(0);
  const [bigShakeKey, setBigShakeKey] = useState(0);
  const celebratedMateRef = useRef<string | null>(null);

  /* ------------------------------ reaction floaters ------------------------------ */
  const [floaters, setFloaters] = useState<{ id: number; emoji: string; x: number }[]>([]);
  const floaterId = useRef(0);
  useEffect(() => {
    if (!match?.id) return;
    const ch = subscribeReactions(match.id, (emoji) => {
      const id = ++floaterId.current;
      const x = 8 + Math.random() * 76; // % across the board
      setFloaters((f) => [...f.slice(-11), { id, emoji, x }]);
      window.setTimeout(
        () => setFloaters((f) => f.filter((fl) => fl.id !== id)),
        2200
      );
    });
    return () => {
      ch.unsubscribe();
    };
  }, [match?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const REACTION_EMOJIS = ["👏", "🔥", "😱", "👍", "😮"];
  const lastReactRef = useRef(0);
  const doReact = async (emoji: string) => {
    if (!user || !match) return;
    const now = Date.now();
    if (now - lastReactRef.current < 1500) return; // throttle
    lastReactRef.current = now;
    try {
      await sendReaction(roomId, match.id, emoji);
    } catch {
      /* ignore */
    }
  };

  /* ------------------------------ loading ------------------------------ */
  useEffect(() => {
    let live = true;
    finishedRef.current = false;
    setXpEarned(null);
    const load = matchId ? getMatchById(matchId) : getActiveMatch(roomId);
    load.then((m) => {
      if (live) setMatch(m);
    });
    return () => {
      live = false;
    };
  }, [roomId, matchId]);

  useEffect(() => {
    if (!match) return;
    const ch = subscribeMatch(
      match.id,
      (m) => {
        const local = parseMoveList(matchRef.current?.moves).length;
        const remote = parseMoveList(m.moves).length;
        // Accept status changes even with equal moves (finish/cancel).
        if (remote >= local || m.status !== matchRef.current?.status) setMatch(m);
      },
      // Guests count as viewers too (PacClone pattern; identity falls back to "guest").
      { onPresence: setViewerCount, userId: user?.id }
    );
    return () => {
      ch.unsubscribe();
    };
  }, [match?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Switch to a newly created match in this room (e.g. a rematch).
  useEffect(() => {
    if (guest) return;
    const ch = subscribeRoomMatches(roomId, (m) => {
      if (m.status !== "active") return;
      const cur = matchRef.current;
      if (cur && cur.id === m.id) return;
      if (onViewMatch) {
        onViewMatch(m.id);
        return;
      }
      finishedRef.current = false;
      setMatch(m);
    });
    return () => {
      ch.unsubscribe();
    };
  }, [roomId, guest, onViewMatch]);

  // Player display names.
  useEffect(() => {
    if (namesOverride) {
      setNames({
        x: namesOverride.x ?? "Player",
        o: namesOverride.o ?? "Player",
      });
      return;
    }
    if (!match?.x_id && !match?.o_id) return;
    fetchNames([match.x_id ?? "", match.o_id ?? ""]).then((map) => {
      setNames({
        x: (match.x_id && map[match.x_id]) || "Player",
        o: (match.o_id && map[match.o_id]) || "Player",
      });
    });
  }, [match?.x_id, match?.o_id, namesOverride]); // eslint-disable-line react-hooks/exhaustive-deps

  const boardSize = match?.board_size ?? 15;
  const { state: bs, labels } = useMemo(
    () => replay(match?.moves ?? "", boardSize),
    [match?.moves, boardSize]
  );
  const plyCount = labels.length;
  const turnColor = colorOfPlayer(bs.pos.turn);

  const myColor: Color | null = useMemo(() => {
    if (!user || !match) return null;
    if (match.x_id === user.id) return "x";
    if (match.o_id === user.id) return "o";
    return null; // spectator
  }, [user, match]);

  /** Voice peer: the other match player (player mode only). */
  const peerUserId =
    match && myColor
      ? myColor === "x"
        ? match.o_id
        : match.x_id
      : null;

  const status = useMemo(() => gameStatus(bs.pos), [bs]);
  const isActive = match?.status === "active";
  const isFinished = match?.status === "finished";
  const isCancelled = match?.status === "cancelled";

  /* --------------- move sound on fresh remote moves --------------- */
  const soundedPly = useRef(0);
  useEffect(() => {
    if (!match) return;
    const n = parseMoveList(match.moves).length;
    if (n > soundedPly.current) {
      // Sound only live moves, not the initial history load.
      if (soundedPly.current > 0 || n === 1) playMove();
      soundedPly.current = n;
    } else if (n < soundedPly.current) {
      soundedPly.current = n; // new match — resync silently
    }
  }, [match?.moves, match?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the move list pinned to the latest move.
  useEffect(() => {
    const el = movesBoxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [plyCount]);

  /* ------------------------------ finishing ------------------------------ */
  const reportFinish = useCallback(
    async (result: "x" | "o" | "draw", reason: string) => {
      if (!match) return;
      try {
        const earned = await finishRoomMatch(match.id, result, reason);
        if (earned && earned.play_xp + earned.host_xp + earned.daily_xp > 0) {
          setXpEarned(earned);
        }
      } catch {
        /* realtime will still flip the row */
      }
      const fresh = await getMatchById(match.id);
      if (fresh) setMatch(fresh);
    },
    [match]
  );

  // Natural game over — the mover's client reports; the RPC is
  // idempotent so both clients may call safely.
  useEffect(() => {
    if (!status.over || !match || match.status !== "active" || finishedRef.current) return;
    finishedRef.current = true;
    const result =
      status.winner === "x"
        ? ("x" as const)
        : status.winner === "o"
          ? ("o" as const)
          : ("draw" as const);
    reportFinish(result, status.kind);
  }, [status, match, reportFinish]);

  // Win drama: banner + big board shake + gold flash + crowd sounds.
  useEffect(() => {
    if (
      match?.status !== "finished" ||
      match?.reason !== "five" ||
      celebratedMateRef.current === match?.id
    ) {
      return;
    }
    celebratedMateRef.current = match.id;
    setBigShakeKey((k) => k + 1);
    setMateFxKey((k) => k + 1);
    setMateBannerKey((k) => k + 1);
    window.setTimeout(() => setMateFxKey(0), 1300);
    const iWon = match.winner_id === user?.id;
    if (iWon) {
      window.setTimeout(() => {
        playWin();
        burstConfetti();
      }, 450);
      window.setTimeout(() => playApplause(), 1700);
    } else if (myColor) {
      window.setTimeout(() => playLose(), 450);
    } else {
      window.setTimeout(() => playWin(), 450);
      window.setTimeout(() => playApplause(), 1700);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.status, match?.reason, match?.id]);

  // Non-decisive finishes: win/lose jingles for the players.
  useEffect(() => {
    if (
      match?.status === "finished" &&
      myColor &&
      match?.reason !== "five"
    ) {
      if (match.winner_id === user?.id) playWin();
      else playLose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.status, match?.reason, match?.id]);

  const doMove = useCallback(
    async (idx: number) => {
      if (!match || match.status !== "active") return;
      const indices = [...parseMoveList(match.moves), idx];
      const newMoves = indices.join(" ");
      setMatch({ ...match, moves: newMoves }); // optimistic
      try {
        await pushMove(match.id, newMoves);
        notifyPushTrigger({ kind: "turn", matchId: match.id });
      } catch {
        /* realtime will correct */
      }
    },
    [match]
  );

  const doRematch = useCallback(async () => {
    if (!match || match.status === "active" || !myColor) return;
    setRematching(true);
    setActionMsg("");
    try {
      const m = await startRematch(roomId);
      if (onViewMatch) onViewMatch(m.id);
      // Otherwise the room INSERT subscription switches both players.
    } catch (e) {
      setActionMsg(
        roomErrorKey(e) === "match_in_progress"
          ? lang === "vi"
            ? "Đang có ván khác diễn ra."
            : "Another match is in progress."
          : lang === "vi"
            ? "Không thể bắt đầu ván mới."
            : "Could not start a rematch."
      );
    } finally {
      setRematching(false);
    }
  }, [match, myColor, roomId, lang, onViewMatch]);

  const doResign = useCallback(async () => {
    if (!match || !myColor || match.status !== "active") return;
    finishedRef.current = true;
    await reportFinish(myColor === "x" ? "o" : "x", "resign");
  }, [match, myColor, reportFinish]);

  const doCancel = useCallback(async () => {
    if (!match || match.status !== "active") return;
    try {
      await cancelMatch(match.id);
      const fresh = await getMatchById(match.id);
      if (fresh) setMatch(fresh);
    } catch {
      /* ignore */
    }
  }, [match]);

  const doShare = useCallback(async () => {
    if (!match) return;
    const winnerText = isCancelled
      ? lang === "vi"
        ? "Ván đã hủy"
        : "Match cancelled"
      : match.result === "draw"
        ? lang === "vi"
          ? "Hòa"
          : "Draw"
        : match.result === "x"
          ? `✖️ ${names.x} ${lang === "vi" ? "thắng" : "wins"}`
          : `⭕ ${names.o} ${lang === "vi" ? "thắng" : "wins"}`;
    const text = `📝 ${names.x} vs ${names.o} — ${winnerText}${
      match.reason ? ` (${reasonLabel(match.reason, lang)})` : ""
    } · ${plyCount} ${lang === "vi" ? "nước" : "plies"}${
      roomCode
        ? ` · ${lang === "vi" ? "Mã phòng" : "Room code"}: ${roomCode} — ${window.location.origin}/?room=${roomCode}`
        : ""
    }`;
    try {
      await navigator.clipboard.writeText(text);
      setShared(true);
      window.setTimeout(() => setShared(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }, [match, names, isCancelled, plyCount, lang, roomCode]);

  /* ------------------------------ board input ------------------------------ */
  const myTurn = !!myColor && turnColor === myColor && !status.over && isActive;
  const onSquareClick = useCallback(
    (sq: number) => {
      if (!myTurn) return;
      if (bs.pos.board[sq] !== 0) return;
      doMove(sq);
    },
    [myTurn, bs, doMove]
  );

  if (!match) {
    return (
      <div className="cr-room-match">
        <p className="cr-hint">
          {lang === "vi" ? "Chưa có ván đấu nào." : "No match yet."}
        </p>
        {onBackToRoom && (
          <button type="button" className="cr-btn cr-btn-sm" onClick={onBackToRoom}>
            ← {lang === "vi" ? "Về phòng" : "Back to room"}
          </button>
        )}
      </div>
    );
  }

  const watchers = myColor ? Math.max(0, viewerCount - 2) : viewerCount;
  const xpTotal = xpEarned ? xpEarned.play_xp + xpEarned.host_xp + xpEarned.daily_xp : 0;
  const resultTitle = isCancelled
    ? lang === "vi"
      ? "Ván đấu đã bị hủy"
      : "Match cancelled"
    : match.result === "x"
      ? `✖️ ${names.x} ${lang === "vi" ? "thắng!" : "wins!"}`
      : match.result === "o"
        ? `⭕ ${names.o} ${lang === "vi" ? "thắng!" : "wins!"}`
        : lang === "vi"
          ? "Hòa!"
          : "Draw!";

  return (
    <div className="cr-room-match">
      <div className="cr-room-match-main">
        <div className="cr-room-board-col">
        <div className="cr-board-area">
          <div
            key={`room-board-${bigShakeKey}`}
            className={`cr-board-fit${bigShakeKey > 0 ? " shake-big" : ""}`}
          >
            <Board
              board={stateToBoard(bs.pos)}
              size={boardSize}
              flipped={myColor === "o"}
              lastMove={bs.lastMove}
              winningRun={bs.pos.result.winningRun}
              ghostColor={myTurn ? myColor : null}
              interactive={myTurn}
              boardLabel={`${names.x} vs ${names.o}`}
              onSquareClick={onSquareClick}
            />
            {mateBannerKey > 0 && (
              <div
                key={mateBannerKey}
                className="cr-mate-banner"
                onAnimationEnd={() => setMateBannerKey(0)}
              >
                <span>🏆 {lang === "vi" ? "Thắng!" : "Win!"}</span>
              </div>
            )}
            {mateFxKey > 0 && <div key={mateFxKey} className="cr-mate-flash" />}
            {floaters.map((f) => (
              <span
                key={f.id}
                className="cr-reaction-float"
                style={{ left: `${f.x}%` }}
                aria-hidden="true"
              >
                {f.emoji}
              </span>
            ))}
          </div>
        </div>
        {isActive && !status.over && (
          <div className="cr-room-match-actions">
            {user && !guest && (
              <div
                className="cr-reaction-bar"
                role="group"
                aria-label={lang === "vi" ? "Thả biểu tượng" : "React"}
              >
                {REACTION_EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className="cr-reaction-btn"
                    onClick={() => doReact(e)}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
            {guest && onRequireLogin && (
              <button type="button" className="cr-btn cr-btn-sm" onClick={onRequireLogin}>
                👏🔥 {lang === "vi" ? "Đăng nhập để thả biểu tượng" : "Log in to react"}
              </button>
            )}
            {myColor &&
              (armResign ? (
                <button
                  type="button"
                  className="cr-btn cr-btn-sm cr-btn-danger"
                  onClick={() => {
                    setArmResign(false);
                    doResign();
                  }}
                >
                  {lang === "vi" ? "Xác nhận đầu hàng?" : "Confirm resignation?"}
                </button>
              ) : (
                <button
                  type="button"
                  className="cr-btn cr-btn-sm"
                  onClick={() => {
                    setArmResign(true);
                    window.setTimeout(() => setArmResign(false), 3000);
                  }}
                >
                  🏳 {lang === "vi" ? "Đầu hàng" : "Resign"}
                </button>
              ))}
            {isLeader &&
              (armCancel ? (
                <button
                  type="button"
                  className="cr-btn cr-btn-sm cr-btn-danger"
                  onClick={() => {
                    setArmCancel(false);
                    doCancel();
                  }}
                >
                  {lang === "vi" ? "Xác nhận hủy ván?" : "Confirm cancel?"}
                </button>
              ) : (
                <button
                  type="button"
                  className="cr-btn cr-btn-sm"
                  onClick={() => {
                    setArmCancel(true);
                    window.setTimeout(() => setArmCancel(false), 3000);
                  }}
                >
                  ✕ {lang === "vi" ? "Hủy ván" : "Cancel match"}
                </button>
              ))}
          </div>
        )}
        </div>
        <aside className="cr-panel cr-room-side">
          {onExitRoom && (
            <button type="button" className="cr-btn cr-btn-sm cr-room-exit" onClick={onExitRoom}>
              ← {lang === "vi" ? "Danh sách phòng" : "Room list"}
            </button>
          )}
          {onBackToRoom && !isFinished && !isCancelled && (
            <button type="button" className="cr-btn cr-btn-sm" onClick={onBackToRoom}>
              ← {lang === "vi" ? "Về phòng" : "Back to room"}
            </button>
          )}
      <div className="cr-room-vs">
        <span>✖️ {names.x}</span>
        <span className="cr-room-vs-mid">vs</span>
        <span>⭕ {names.o}</span>
      </div>
      <div className="cr-room-status">
        {isFinished || isCancelled ? (
          <span>
            {resultTitle}
            {match.reason && !isCancelled ? ` · ${reasonLabel(match.reason, lang)}` : ""}
          </span>
        ) : status.over ? (
          <span>{lang === "vi" ? "Đang chốt kết quả…" : "Finalizing…"}</span>
        ) : (
          <span>
            {turnColor === "x" ? `✖️ ${names.x}` : `⭕ ${names.o}`}
            {lang === "vi" ? " đi" : " to move"}
            {myColor === turnColor && (lang === "vi" ? " (bạn)" : " (you)")}
            {myColor === null && (lang === "vi" ? " · khán giả" : " · spectating")}
          </span>
        )}
        {watchers > 0 && (
          <span className="cr-viewers" title={lang === "vi" ? "Đang xem" : "Watching"}>
            👁 {watchers}
          </span>
        )}
      </div>

      {/* Live comms first (family aside order): voice, then private text
          chat, then the move list, public comments last. Guests
          (hideSocial) never see these. */}
      {!hideSocial && user && match && myColor && peerUserId && !isCancelled && (
        <RoomVoice
          lang={lang}
          roomId={roomId}
          myUserId={user.id}
          peerUserId={peerUserId}
          mode="player"
        />
      )}
      {!hideSocial && user && match && !myColor && !isCancelled && (
        <RoomVoice
          lang={lang}
          roomId={roomId}
          myUserId={user.id}
          peerUserId={null}
          mode="listener"
        />
      )}
      {!hideSocial && user && match && (
        <RoomChat roomId={roomId} lang={lang} disabled={isCancelled} />
      )}

      {(isFinished || isCancelled) && (
        <div className="cr-result-panel">
          {isFinished && (
            <p className="cr-result-title">
              {match.result === "draw"
                ? lang === "vi"
                  ? "🤝 Hòa!"
                  : "🤝 Draw!"
                : `🏆 ${match.result === "x" ? names.x : names.o} ${
                    lang === "vi" ? "thắng!" : "wins!"
                  }`}
              {match.reason && !isCancelled ? ` · ${reasonLabel(match.reason, lang)}` : ""}
            </p>
          )}
          {isCancelled && (
            <p className="cr-result-title">
              {lang === "vi" ? "Ván đấu đã bị hủy." : "This match was cancelled."}
            </p>
          )}
          {xpTotal > 0 && (
            <p className="cr-xp-earned">
              ⭐ {lang === "vi" ? `Bạn nhận +${xpTotal} XP` : `You earned +${xpTotal} XP`}
            </p>
          )}
          <div className="cr-row-gap">
            {myColor && !isCancelled && (
              <button
                type="button"
                className="cr-btn cr-btn-primary cr-btn-sm"
                disabled={rematching}
                onClick={doRematch}
              >
                🔁 {lang === "vi" ? "Đấu lại" : "Rematch"}
              </button>
            )}
            <button type="button" className="cr-btn cr-btn-sm" onClick={doShare}>
              {shared
                ? lang === "vi"
                  ? "Đã chép kết quả!"
                  : "Result copied!"
                : `📤 ${lang === "vi" ? "Chia sẻ" : "Share"}`}
            </button>
            {onBackToRoom && (
              <button type="button" className="cr-btn cr-btn-sm" onClick={onBackToRoom}>
                ← {lang === "vi" ? "Về phòng" : "Back to room"}
              </button>
            )}
          </div>
          {actionMsg && <p className="cr-msg">{actionMsg}</p>}
        </div>
      )}

      {labels.length > 0 && (
        <div className="cr-room-moves" ref={movesBoxRef}>
          {Array.from({ length: Math.ceil(labels.length / 2) }, (_, i) => (
            <div key={i} className="cr-room-move-row">
              <span className="cr-room-move-num">{i + 1}.</span>
              <span>{labels[i * 2]}</span>
              <span>{labels[i * 2 + 1] ?? ""}</span>
            </div>
          ))}
        </div>
      )}

      {!hideSocial && (
        <MatchSocial
          roomId={roomId}
          matchId={match.id}
          lang={lang}
          moveNumber={plyCount}
          disabled={isCancelled}
        />
      )}
        </aside>
      </div>
    </div>
  );
}
