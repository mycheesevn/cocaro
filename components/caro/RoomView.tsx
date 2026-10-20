"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteRoom,
  createRoom,
  fetchHotRooms,
  fetchNames,
  fetchPastMatches,
  fetchRoom,
  fetchRoomMembers,
  getActiveMatch,
  getLastFinishedMatch,
  joinRoom,
  kickMember,
  leaveRoom,
  listMyRooms,
  listPublicRooms,
  roomErrorKey,
  setMemberRole,
  setRoomPublic,
  setTurnOrder,
  startNextMatch,
  subscribeRoom,
  updateRoomRules,
  type HotRoom,
  type PublicRoom,
  type Room,
  type RoomMatch,
  type RoomMember,
  type RoomWithCount,
} from "@/lib/supabase/rooms";
import { useAuth } from "./AuthProvider";
import { GuestRooms } from "./GuestRooms";
import { RoomMatchView, reasonLabel } from "./RoomMatchView";
import { TournamentView } from "./TournamentView";
import { FriendButton } from "./FriendButton";
import { listFriends } from "@/lib/supabase/friends";
import { Pagination, usePagination } from "./Pagination";
import type { Lang } from "@/lib/caro/engineApi";
import { BOARD_SIZES } from "@/lib/caro/engine";
import { STR } from "@/lib/caro/i18n";
import {
  renderRoomPromoCard,
  canvasToPngBlob,
  shareCard,
} from "@/lib/caro/shareCard";

const MAX_PLAYER_OPTIONS = [2, 3, 4, 5, 6, 8, 10, 12, 16, 20];

function errText(key: string, lang: Lang): string {
  const vi: Record<string, string> = {
    room_not_found: "Không tìm thấy phòng.",
    room_full: "Phòng đã đầy.",
    room_closed: "Phòng đã đóng.",
    not_leader: "Chỉ trưởng phòng mới làm được.",
    leader_cannot_leave: "Trưởng phòng không thể rời phòng (hãy xoá phòng).",
    leader_must_play: "Trưởng phòng phải là người chơi.",
    cannot_kick_self: "Không thể tự đuổi mình.",
    room_need_two_players: "Cần ít nhất 2 người chơi trong thứ tự thi đấu.",
    match_in_progress: "Đang có ván đấu diễn ra.",
    match_not_found: "Không tìm thấy ván đấu.",
    not_allowed: "Bạn không có quyền làm việc này.",
    generic: "Có lỗi xảy ra.",
  };
  const en: Record<string, string> = {
    room_not_found: "Room not found.",
    room_full: "The room is full.",
    room_closed: "The room is closed.",
    not_leader: "Only the room leader can do this.",
    leader_cannot_leave: "The leader cannot leave (delete the room instead).",
    leader_must_play: "The leader must be a player.",
    cannot_kick_self: "You cannot kick yourself.",
    room_need_two_players: "Need at least 2 players in the match order.",
    match_in_progress: "A match is already in progress.",
    match_not_found: "Match not found.",
    not_allowed: "You are not allowed to do this.",
    generic: "Something went wrong.",
  };
  return (lang === "vi" ? vi : en)[key] ?? (lang === "vi" ? vi.generic : en.generic);
}

export function RoomView({
  lang,
  initialRoomId,
  onInitialConsumed,
  initialRoomCode,
  onRoomCodeConsumed,
  onRequireLogin,
}: {
  lang: Lang;
  /** Open this room as soon as it's in the room list (e.g. after accepting a challenge). */
  initialRoomId?: string | null;
  onInitialConsumed?: () => void;
  /** Auto-join this room code (from a ?room=CODE invite link). */
  initialRoomCode?: string | null;
  onRoomCodeConsumed?: () => void;
  onRequireLogin?: () => void;
}) {
  const { user } = useAuth();
  const [myRooms, setMyRooms] = useState<RoomWithCount[]>([]);
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([]);
  const [hotRooms, setHotRooms] = useState<HotRoom[]>([]);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const consumedRef = useRef<string | null>(null);
  const consumedCodeRef = useRef<string | null>(null);
  const [roomName, setRoomName] = useState("");
  const [boardSize, setBoardSize] = useState(15);
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [isPublic, setIsPublic] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      setMyRooms(await listMyRooms());
      setPublicRooms(await listPublicRooms());
      setHotRooms(await fetchHotRooms());
    } catch {
      /* not configured */
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  // Open a deep-linked room (challenge accept) once the list is loaded.
  useEffect(() => {
    if (!initialRoomId || consumedRef.current === initialRoomId) return;
    const found = myRooms.find((r) => r.id === initialRoomId);
    if (found) {
      consumedRef.current = initialRoomId;
      setActiveRoom(found);
      onInitialConsumed?.();
    }
  }, [initialRoomId, myRooms, onInitialConsumed]);

  // Invite link (?room=CODE) while logged in: join (idempotent) + open.
  useEffect(() => {
    if (!initialRoomCode || !user || consumedCodeRef.current === initialRoomCode)
      return;
    consumedCodeRef.current = initialRoomCode;
    joinRoom(initialRoomCode)
      .then(async (room) => {
        await load();
        setActiveRoom(room);
      })
      .catch((e) => setMsg(errText(roomErrorKey(e), lang)))
      .finally(() => onRoomCodeConsumed?.());
  }, [initialRoomCode, user, lang, load, onRoomCodeConsumed]);

  if (!user) {
    return (
      <GuestRooms
        lang={lang}
        initialCode={initialRoomCode}
        onCodeConsumed={onRoomCodeConsumed}
        onRequireLogin={onRequireLogin}
      />
    );
  }

  if (activeRoom) {
    return (
      <div className="cr-view">
        <button
          type="button"
          className="cr-btn cr-btn-sm"
          onClick={() => {
            setActiveRoom(null);
            load();
          }}
        >
          ← {activeRoom.name} ({activeRoom.code})
        </button>
        <RoomDetail
          room={activeRoom}
          lang={lang}
          onExit={() => {
            setActiveRoom(null);
            load();
          }}
        />
      </div>
    );
  }

  const doCreate = async () => {
    if (!roomName.trim()) return;
    setBusy(true);
    setMsg("");
    try {
      const room = await createRoom(roomName.trim(), isPublic, maxPlayers, boardSize);
      setRoomName("");
      await load();
      setActiveRoom(room);
    } catch (e) {
      setMsg(errText(roomErrorKey(e), lang));
    } finally {
      setBusy(false);
    }
  };

  const doJoin = async () => {
    if (!joinCode.trim()) return;
    setBusy(true);
    setMsg("");
    try {
      const room = await joinRoom(joinCode.trim());
      setJoinCode("");
      await load();
      setActiveRoom(room);
    } catch (e) {
      setMsg(errText(roomErrorKey(e), lang));
    } finally {
      setBusy(false);
    }
  };

  const openListedRoom = async (id: string, code: string) => {
    const mine = myRooms.find((r) => r.id === id);
    if (mine) {
      setActiveRoom(mine);
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const room = await joinRoom(code);
      await load();
      setActiveRoom(room);
    } catch (e) {
      setMsg(errText(roomErrorKey(e), lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cr-view">
      <h2>👥 {lang === "vi" ? "Phòng chơi" : "Game rooms"}</h2>

      <div className="cr-room-form">
        <input
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          placeholder={lang === "vi" ? "Tên phòng mới" : "New room name"}
          className="cr-input"
          maxLength={60}
        />
        <select
          className="cr-input cr-select-sm"
          value={boardSize}
          onChange={(e) => setBoardSize(Number(e.target.value))}
          aria-label={lang === "vi" ? "Cỡ bàn" : "Board size"}
        >
          {BOARD_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}×{n}
            </option>
          ))}
        </select>
        <select
          className="cr-input cr-select-sm"
          value={maxPlayers}
          onChange={(e) => setMaxPlayers(Number(e.target.value))}
          aria-label={lang === "vi" ? "Số người tối đa" : "Max players"}
        >
          {MAX_PLAYER_OPTIONS.map((n) => (
            <option key={n} value={n}>
              👥 {n}
            </option>
          ))}
        </select>
        <label className="cr-check">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
          />
          🌐 {lang === "vi" ? "Phòng công khai" : "Public room"}
        </label>
        <button type="button" className="cr-btn cr-btn-primary" disabled={busy} onClick={doCreate}>
          {lang === "vi" ? "Tạo phòng" : "Create room"}
        </button>
      </div>

      <div className="cr-room-form">
        <input
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && doJoin()}
          placeholder={lang === "vi" ? "Nhập mã phòng" : "Enter room code"}
          className="cr-input"
          maxLength={6}
        />
        <button type="button" className="cr-btn" disabled={busy} onClick={doJoin}>
          {lang === "vi" ? "Tham gia" : "Join"}
        </button>
      </div>
      {msg && <p className="cr-msg">{msg}</p>}

      <h3>{lang === "vi" ? "Phòng của tôi" : "My rooms"}</h3>
      {myRooms.length === 0 ? (
        <p className="cr-hint">—</p>
      ) : (
        <ul className="cr-board-list">
          {myRooms.map((r) => (
            <li key={r.id}>
              <button type="button" className="cr-room-row" onClick={() => setActiveRoom(r)}>
                <span>
                  {r.status === "playing" ? "🔴 " : ""}
                  {r.name}
                  {r.status === "closed" ? (lang === "vi" ? " (đã đóng)" : " (closed)") : ""}
                </span>
                <span className="cr-hint">
                  {r.board_size}×{r.board_size} 👥 {r.member_count}/{r.max_players}
                  <code>{r.code}</code>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3>🌐 {lang === "vi" ? "Sảnh chung" : "Public lobby"}</h3>
      {publicRooms.length === 0 ? (
        <p className="cr-hint">—</p>
      ) : (
        <ul className="cr-board-list">
          {publicRooms.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="cr-room-row"
                disabled={busy}
                onClick={() => openListedRoom(r.id, r.code)}
              >
                <span>
                  {r.has_active_match ? "🔴 " : ""}
                  {r.name}
                </span>
                <span className="cr-hint">
                  👥 {r.member_count}/{r.max_players}
                  {r.has_active_match ? (lang === "vi" ? " · đang đấu" : " · live") : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {hotRooms.length > 0 && (
        <>
          <h3>🔥 {lang === "vi" ? "Phòng sôi động" : "Hot rooms"}</h3>
          <ul className="cr-board-list">
            {hotRooms.map((r) => (
              <li key={r.room_id}>
                <button
                  type="button"
                  className="cr-room-row"
                  disabled={busy}
                  onClick={() => openListedRoom(r.room_id, r.code)}
                >
                  <span>{r.name}</span>
                  <span className="cr-hint">
                    🔥 {r.matches_7d} {lang === "vi" ? "ván/7 ngày" : "games/7d"} · 👥 {r.member_count}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/* ------------------------------ Room detail ------------------------------ */

function RoomDetail({
  room: initialRoom,
  lang,
  onExit,
}: {
  room: Room;
  lang: Lang;
  onExit: () => void;
}) {
  const { user } = useAuth();
  const [room, setRoom] = useState<Room>(initialRoom);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [past, setPast] = useState<RoomMatch[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [viewMatchId, setViewMatchId] = useState<string | null>(null);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [kicked, setKicked] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [rulesDraft, setRulesDraft] = useState(initialRoom.rules ?? "");
  const [rulesSaved, setRulesSaved] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [armKick, setArmKick] = useState<string | null>(null);
  const [reloadSignal, setReloadSignal] = useState(0);
  const lastActiveIdRef = useRef<string | null>(null);
  const initialFollowDoneRef = useRef(false);
  const loadedOnceRef = useRef(false);
  const statusRef = useRef(initialRoom.status);
  const [hasOpenTournament, setHasOpenTournament] = useState(false);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const isLeader = !!user && room.leader_id === user.id;

  const loadAll = useCallback(async () => {
    try {
      const [freshRoom, memberList, pastList, active, lastFin] = await Promise.all([
        fetchRoom(initialRoom.id),
        fetchRoomMembers(initialRoom.id).catch(() => [] as RoomMember[]),
        fetchPastMatches(initialRoom.id).catch(() => [] as RoomMatch[]),
        getActiveMatch(initialRoom.id),
        getLastFinishedMatch(initialRoom.id),
      ]);
      if (freshRoom) setRoom(freshRoom);
      // Room deleted while we were inside (family pattern,
      // references/room-delete.md): members get the notice screen
      // (deleted), the leader exits directly. Opening an already-closed
      // room for replay stays viewable — only the transition to closed
      // triggers.
      const prevStatus = statusRef.current;
      statusRef.current = freshRoom?.status ?? prevStatus;
      if (prevStatus !== "closed" && freshRoom?.status === "closed") {
        if (user && freshRoom?.leader_id === user.id) {
          onExitRef.current();
        } else {
          setDeleted(true);
        }
        return;
      }
      setMembers(memberList);
      setPast(pastList);
      // Kicked (or removed) while inside: my member row disappeared.
      if (loadedOnceRef.current && user && memberList.length > 0 &&
          !memberList.some((m) => m.user_id === user.id)) {
        setKicked(true);
      }
      loadedOnceRef.current = true;
      // Names: members first, then any past-match players who left.
      const merged: Record<string, string> = {};
      for (const m of memberList) merged[m.user_id] = m.name;
      const missing = new Set<string>();
      for (const p of pastList) {
        for (const id of [p.x_id, p.o_id]) {
          if (id && !merged[id]) missing.add(id);
        }
      }
      if (missing.size > 0) {
        const extra = await fetchNames([...missing]).catch(() => ({}));
        Object.assign(merged, extra);
      }
      setNames(merged);
      // Follow the live match; on first load also surface the last
      // finished match so its result panel survives a reload.
      setActiveMatchId(active?.id ?? null);
      if (active) {
        initialFollowDoneRef.current = true;
        if (active.id !== lastActiveIdRef.current) {
          lastActiveIdRef.current = active.id;
          setViewMatchId(active.id);
        }
      } else if (!initialFollowDoneRef.current) {
        initialFollowDoneRef.current = true;
        if (lastFin) setViewMatchId(lastFin.id);
      }
      setReloadSignal((n) => n + 1);
    } catch {
      /* offline / not configured */
    }
  }, [initialRoom.id, user]);

  const loadAllRef = useRef(loadAll);
  loadAllRef.current = loadAll;

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Following set for the per-member follow buttons (PacClone parity).
  useEffect(() => {
    if (!user) return;
    listFriends()
      .then((rows) => setFollowing(new Set(rows.map((r) => r.id))))
      .catch(() => {});
  }, [user]);

  // Realtime nudges + 4s polling fallback (realtime can silently fail).
  useEffect(() => {
    const ch = subscribeRoom(initialRoom.id, {
      myUserId: user?.id ?? null,
      onChange: () => loadAllRef.current(),
      onKicked: () => setKicked(true),
    });
    const t = window.setInterval(() => loadAllRef.current(), 4000);
    return () => {
      ch.unsubscribe();
      window.clearInterval(t);
    };
  }, [initialRoom.id, user?.id]);

  const pastPaging = usePagination(past, 10);

  if (kicked) {
    return (
      <div className="cr-room-detail">
        <p className="cr-msg">
          {lang === "vi" ? "Bạn đã bị đuổi khỏi phòng." : "You were removed from the room."}
        </p>
        <button type="button" className="cr-btn" onClick={onExit}>
          ← {lang === "vi" ? "Về danh sách phòng" : "Back to rooms"}
        </button>
      </div>
    );
  }

  if (deleted) {
    return (
      <div className="cr-room-detail">
        <p className="cr-msg">
          🗑 {lang === "vi" ? "Phòng đã bị chủ phòng xoá." : "The room was deleted by its owner."}
        </p>
        <button type="button" className="cr-btn" onClick={onExit}>
          ← {lang === "vi" ? "Về danh sách phòng" : "Back to rooms"}
        </button>
      </div>
    );
  }

  const nameOf = (id: string | null | undefined) =>
    (id && names[id]) || "Player";
  const playerIds = members.filter((m) => m.role === "player").map((m) => m.user_id);
  const orderPreview = [
    ...room.turn_order.filter((id) => playerIds.includes(id)),
    ...playerIds.filter((id) => !room.turn_order.includes(id)),
  ];
  const nextPair =
    orderPreview.length >= 2 ? ([orderPreview[0], orderPreview[1]] as const) : null;

  const act = async (fn: () => Promise<void>, after?: () => void) => {
    setMsg("");
    setBusy(true);
    try {
      await fn();
      await loadAll();
      after?.();
    } catch (e) {
      setMsg(errText(roomErrorKey(e), lang));
    } finally {
      setBusy(false);
    }
  };

  // Owner-only permanent room deletion (family pattern,
  // references/room-delete.md). The owner exits directly; members inside
  // get the deleted-notice screen via the rooms realtime UPDATE.
  const doDelete = async () => {
    setMsg("");
    setBusy(true);
    try {
      await deleteRoom(room.id);
      onExitRef.current();
    } catch (e) {
      const key = roomErrorKey(e);
      setMsg(
        key === "match_in_progress"
          ? lang === "vi"
            ? "Đang có ván đấu diễn ra — hãy kết thúc hoặc hủy ván trước."
            : "A match is in progress — finish or cancel the match first."
          : errText(key, lang)
      );
    } finally {
      setBusy(false);
      setConfirmClose(false);
    }
  };

  const doStart = async () => {
    setMsg("");
    setBusy(true);
    try {
      const m = await startNextMatch(room.id);
      lastActiveIdRef.current = m.id;
      setViewMatchId(m.id);
      await loadAll();
    } catch (e) {
      setMsg(errText(roomErrorKey(e), lang));
    } finally {
      setBusy(false);
    }
  };

  const moveInOrder = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= orderPreview.length) return;
    const next = [...orderPreview];
    [next[idx], next[j]] = [next[j], next[idx]];
    act(() => setTurnOrder(room.id, next));
  };

  const copyText = async (text: string, which: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  /** Generate a promo image card and open the native share sheet (PacClone pattern). */
  const promoteRoom = async () => {
    if (promoting) return;
    setPromoting(true);
    try {
      const link = `${window.location.origin}/?room=${room.code}`;
      const canvas = renderRoomPromoCard({
        roomName: room.name,
        code: room.code,
        memberLine: STR[lang].roomPromoMembers(members.length),
        footer: STR[lang].roomPromoFooter,
        lang,
      });
      const blob = await canvasToPngBlob(canvas);
      await shareCard(
        blob,
        room.name,
        `${room.name}\n${STR[lang].roomPromoCodeLabel}: ${room.code}`,
        link,
        `phong-${room.code}.png`
      );
    } catch {
      /* user cancelled or share failed */
    } finally {
      setPromoting(false);
    }
  };

  /* Viewing a match takes over the detail (PacClone pattern); the
     finished match stays until "Back to room". */
  if (viewMatchId) {
    return (
      <div className="cr-room-detail">
        <RoomMatchView
          key={viewMatchId}
          roomId={room.id}
          matchId={viewMatchId}
          lang={lang}
          isLeader={isLeader}
          onBackToRoom={() => setViewMatchId(null)}
          onExitRoom={onExit}
          onViewMatch={(id) => setViewMatchId(id)}
          roomCode={room.code}
        />
      </div>
    );
  }

  return (
    <div className="cr-room-detail">
      {/* code card */}
      <div className="cr-room-code-card">
        <div>
          <span className="cr-hint">{lang === "vi" ? "Mã phòng" : "Room code"}</span>
          <div className="cr-room-code-big">{room.code}</div>
          <span className="cr-hint">
            {room.status === "closed"
              ? lang === "vi"
                ? "Đã đóng"
                : "Closed"
              : room.status === "playing"
                ? "🔴 " + (lang === "vi" ? "Đang đấu" : "Live")
                : lang === "vi"
                  ? "Đang mở"
                  : "Open"}
            {" · "}👥 {members.length}/{room.max_players}
            {" · "}
            {room.is_public
              ? lang === "vi"
                ? "Công khai"
                : "Public"
              : lang === "vi"
                ? "Riêng tư"
                : "Private"}
          </span>
        </div>
        <div className="cr-room-code-actions">
          <button type="button" className="cr-btn cr-btn-sm" onClick={() => copyText(room.code, "code")}>
            {copied === "code" ? (lang === "vi" ? "Đã chép!" : "Copied!") : `📋 ${lang === "vi" ? "Chép mã" : "Copy code"}`}
          </button>
          <button
            type="button"
            className="cr-btn cr-btn-sm"
            onClick={() => copyText(`${window.location.origin}/?room=${room.code}`, "link")}
          >
            {copied === "link" ? (lang === "vi" ? "Đã chép!" : "Copied!") : `🔗 ${lang === "vi" ? "Chép link mời" : "Copy invite link"}`}
          </button>
          <button
            type="button"
            className="cr-btn cr-btn-sm"
            onClick={promoteRoom}
            disabled={promoting}
          >
            📣 {promoting ? "…" : STR[lang].roomPromote}
          </button>
          {isLeader && room.status !== "closed" && (
            <button
              type="button"
              className="cr-btn cr-btn-sm"
              disabled={busy}
              onClick={() => act(() => setRoomPublic(room.id, !room.is_public))}
            >
              {room.is_public
                ? lang === "vi"
                  ? "🔒 Chuyển riêng tư"
                  : "🔒 Make private"
                : lang === "vi"
                  ? "🌐 Chuyển công khai"
                  : "🌐 Make public"}
            </button>
          )}
        </div>
      </div>

      {msg && <p className="cr-msg">{msg}</p>}

      {/* start / live match */}
      {activeMatchId ? (
        <div className="cr-row-gap">
          <span className="cr-hint">🔴 {lang === "vi" ? "Đang có ván đấu diễn ra" : "A match is live"}</span>
          <button type="button" className="cr-btn cr-btn-primary cr-btn-sm" onClick={() => setViewMatchId(activeMatchId)}>
            👁 {lang === "vi" ? "Xem ván đấu" : "Watch match"}
          </button>
        </div>
      ) : isLeader && room.status !== "closed" && !hasOpenTournament ? (
        <div className="cr-row-gap">
          <button
            type="button"
            className="cr-btn cr-btn-primary"
            disabled={busy || orderPreview.length < 2}
            onClick={doStart}
            title={
              orderPreview.length < 2
                ? lang === "vi"
                  ? "Cần ít nhất 2 người chơi trong thứ tự thi đấu."
                  : "Need at least 2 players in the match order."
                : undefined
            }
          >
            ▶ {lang === "vi" ? "Bắt đầu ván mới" : "Start match"}
          </button>
          {nextPair && (
            <span className="cr-hint">
              {lang === "vi" ? "Tiếp theo: " : "Next: "}⚪ {nameOf(nextPair[0])}{" "}
              {lang === "vi" ? "gặp" : "vs"} ⚫ {nameOf(nextPair[1])}
            </span>
          )}
        </div>
      ) : (
        <p className="cr-hint">
          {room.status === "closed"
            ? lang === "vi"
              ? "Phòng đã đóng."
              : "This room is closed."
            : lang === "vi"
              ? "Chờ trưởng phòng bắt đầu ván…"
              : "Waiting for the leader to start…"}
        </p>
      )}

      {/* rules */}
      <div className="cr-room-section">
        <h4>📜 {lang === "vi" ? "Nội quy phòng" : "Room rules"}</h4>
        {isLeader ? (
          <>
            <textarea
              className="cr-input cr-rules-input"
              value={rulesDraft}
              onChange={(e) => {
                setRulesDraft(e.target.value);
                setRulesSaved(false);
              }}
              placeholder={
                lang === "vi"
                  ? "Ví dụ: không chat tục, thua không quịt…"
                  : "e.g. be kind, no rage-quitting…"
              }
              maxLength={500}
              rows={2}
            />
            <button
              type="button"
              className="cr-btn cr-btn-sm"
              disabled={busy}
              onClick={() =>
                act(
                  () => updateRoomRules(room.id, rulesDraft),
                  () => setRulesSaved(true)
                )
              }
            >
              {rulesSaved ? (lang === "vi" ? "Đã lưu ✓" : "Saved ✓") : lang === "vi" ? "Lưu nội quy" : "Save rules"}
            </button>
          </>
        ) : room.rules ? (
          <p>{room.rules}</p>
        ) : (
          <p className="cr-hint">—</p>
        )}
      </div>

      {/* members */}
      <div className="cr-room-section">
        <h4>
          👥 {lang === "vi" ? "Thành viên" : "Members"} ({members.length})
        </h4>
        <ul className="cr-member-list">
          {members.map((m) => {
            const orderIdx = orderPreview.indexOf(m.user_id);
            const isMe = user?.id === m.user_id;
            return (
              <li key={m.user_id} className="cr-member-row">
                {m.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.avatar_url} alt="" className="cr-member-avatar" />
                ) : (
                  <span className="cr-member-avatar cr-member-avatar-fallback">
                    {m.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="cr-member-name">
                  {m.name}
                  {room.leader_id === m.user_id ? " 👑" : ""}
                  {isMe ? (lang === "vi" ? " (bạn)" : " (you)") : ""}
                </span>
                {m.role === "player" && orderIdx >= 0 && (
                  <span className="cr-order-num">#{orderIdx + 1}</span>
                )}
                <span className="cr-role-chip">
                  {m.role === "player"
                    ? lang === "vi"
                      ? "Người chơi"
                      : "Player"
                    : lang === "vi"
                      ? "Khán giả"
                      : "Spectator"}
                </span>
                {!isMe && user && (
                  <FriendButton
                    lang={lang}
                    userId={m.user_id}
                    following={following}
                    onChanged={(uid, nowFollowing) =>
                      setFollowing((prev) => {
                        const next = new Set(prev);
                        if (nowFollowing) next.add(uid);
                        else next.delete(uid);
                        return next;
                      })
                    }
                  />
                )}
                {isLeader && !isMe && (
                  <span className="cr-member-controls">
                    {m.role === "player" && (
                      <>
                        <button type="button" className="cr-btn cr-btn-sm" disabled={busy || orderIdx <= 0} onClick={() => moveInOrder(orderIdx, -1)} aria-label="up">▲</button>
                        <button type="button" className="cr-btn cr-btn-sm" disabled={busy || orderIdx >= orderPreview.length - 1} onClick={() => moveInOrder(orderIdx, 1)} aria-label="down">▼</button>
                      </>
                    )}
                    <button
                      type="button"
                      className="cr-btn cr-btn-sm"
                      disabled={busy}
                      onClick={() =>
                        act(() =>
                          setMemberRole(room.id, m.user_id, m.role === "player" ? "spectator" : "player")
                        )
                      }
                      title={m.role === "player" ? (lang === "vi" ? "Chuyển khán giả" : "Make spectator") : lang === "vi" ? "Chuyển người chơi" : "Make player"}
                    >
                      {m.role === "player" ? "👀" : "🎮"}
                    </button>
                    {armKick === m.user_id ? (
                      <button
                        type="button"
                        className="cr-btn cr-btn-sm cr-btn-danger"
                        disabled={busy}
                        onClick={() =>
                          act(
                            () => kickMember(room.id, m.user_id),
                            () => setArmKick(null)
                          )
                        }
                      >
                        {lang === "vi" ? "Đuổi?" : "Kick?"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="cr-btn cr-btn-sm"
                        onClick={() => {
                          setArmKick(m.user_id);
                          window.setTimeout(() => setArmKick(null), 3000);
                        }}
                        title={lang === "vi" ? "Đuổi khỏi phòng" : "Kick from room"}
                      >
                        ✕
                      </button>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <p className="cr-hint">
          {lang === "vi"
            ? "Thứ tự thi đấu: hai người đầu sẽ đấu ván tiếp theo, người đầu xoay xuống cuối sau mỗi ván."
            : "Match order: the first two play the next match; the first rotates to the end after each match."}
        </p>
        <div className="cr-row-gap">
          {!isLeader &&
            (confirmLeave ? (
              <button
                type="button"
                className="cr-btn cr-btn-sm cr-btn-danger"
                disabled={busy}
                onClick={() => act(() => leaveRoom(room.id), onExit)}
              >
                {lang === "vi" ? "Xác nhận rời phòng?" : "Confirm leave?"}
              </button>
            ) : (
              <button type="button" className="cr-btn cr-btn-sm" onClick={() => setConfirmLeave(true)}>
                🚪 {lang === "vi" ? "Rời phòng" : "Leave room"}
              </button>
            ))}
          {isLeader &&
            room.status !== "closed" &&
            (confirmClose ? (
              <button
                type="button"
                className="cr-btn cr-btn-sm cr-btn-danger"
                disabled={busy}
                onClick={doDelete}
              >
                {lang === "vi" ? "Xoá phòng này?" : "Delete this room?"}
              </button>
            ) : (
              <button type="button" className="cr-btn cr-btn-sm" onClick={() => setConfirmClose(true)}>
                🗑 {lang === "vi" ? "Xoá phòng" : "Delete room"}
              </button>
            ))}
        </div>
      </div>

      {/* past matches */}
      {past.length > 0 && (
        <div className="cr-room-section">
          <h4>🕘 {lang === "vi" ? "Các ván đã đấu" : "Past matches"}</h4>
          <ul className="cr-board-list">
            {pastPaging.pageItems.map((p) => {
              const plies = p.moves ? p.moves.trim().split(/\s+/).filter(Boolean).length : 0;
              return (
                <li key={p.id}>
                  <button type="button" className="cr-room-row" onClick={() => setViewMatchId(p.id)}>
                    <span>
                      {p.result === "x" ? "⚪" : p.result === "o" ? "⚫" : "½"}{" "}
                      {nameOf(p.x_id)} · {nameOf(p.o_id)}
                    </span>
                    <span className="cr-hint">
                      {plies} {lang === "vi" ? "nước" : "plies"}
                      {p.reason ? ` · ${reasonLabel(p.reason, lang)}` : ""}
                      {p.finished_at
                        ? ` · ${new Date(p.finished_at).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-US")}`
                        : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <Pagination page={pastPaging.page} pageCount={pastPaging.pageCount} onPage={pastPaging.setPage} />
        </div>
      )}

      <TournamentView
        roomId={room.id}
        isLeader={isLeader}
        lang={lang}
        names={names}
        reloadSignal={reloadSignal}
        onViewMatch={(id) => setViewMatchId(id)}
        playersCount={orderPreview.length}
        onOpenTournamentChange={setHasOpenTournament}
      />
    </div>
  );
}
