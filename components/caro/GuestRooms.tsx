"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchHotRooms,
  guestRoomDetail,
  listPublicRooms,
  previewRoom,
  type GuestRoomDetail,
  type HotRoom,
  type PublicRoom,
  type RoomPreview,
} from "@/lib/supabase/rooms";
import { RoomMatchView } from "./RoomMatchView";
import type { Lang } from "@/lib/caro/engineApi";

/** Guest (logged-out) rooms: public lobby + hot rooms + read-only
 *  spectating via anon-safe RPCs. Every write action becomes a login
 *  teaser — watching is free, joining is the signup motivation. */
export function GuestRooms({
  lang,
  initialCode,
  onCodeConsumed,
  onRequireLogin,
}: {
  lang: Lang;
  initialCode?: string | null;
  onCodeConsumed?: () => void;
  onRequireLogin?: () => void;
}) {
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([]);
  const [hotRooms, setHotRooms] = useState<HotRoom[]>([]);
  const [preview, setPreview] = useState<RoomPreview | null>(null);
  const [previewInvalid, setPreviewInvalid] = useState(false);
  const [detail, setDetail] = useState<GuestRoomDetail | null>(null);
  const consumedRef = useRef<string | null>(null);

  useEffect(() => {
    listPublicRooms().then(setPublicRooms).catch(() => {});
    fetchHotRooms().then(setHotRooms).catch(() => {});
  }, []);

  // Invite deep link (?room=CODE) → preview card.
  useEffect(() => {
    if (!initialCode || consumedRef.current === initialCode) return;
    consumedRef.current = initialCode;
    previewRoom(initialCode)
      .then((p) => {
        if (p) setPreview(p);
        else setPreviewInvalid(true);
      })
      .catch(() => setPreviewInvalid(true))
      .finally(() => onCodeConsumed?.());
  }, [initialCode, onCodeConsumed]);

  // Poll the open room's detail (live match moves + comments).
  useEffect(() => {
    if (!detail) return;
    const id = detail.id;
    const t = window.setInterval(() => {
      guestRoomDetail(id).then((d) => {
        if (d) setDetail(d);
      }).catch(() => {});
    }, 5000);
    return () => window.clearInterval(t);
  }, [detail?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const openRoom = async (roomId: string) => {
    try {
      const d = await guestRoomDetail(roomId);
      if (d) setDetail(d);
    } catch {
      /* ignore */
    }
  };

  if (detail) {
    return (
      <div className="cr-view">
        <button type="button" className="cr-btn cr-btn-sm" onClick={() => setDetail(null)}>
          ← {detail.name} ({detail.code})
        </button>
        <p className="cr-guest-banner">
          {lang === "vi"
            ? "Bạn đang xem với tư cách khách. Đăng nhập để tham gia, reaction và bình luận!"
            : "You are spectating as a guest. Log in to join, react and comment!"}
        </p>
        <p className="cr-hint">
          👥 {detail.member_count}/{detail.max_players} ·{" "}
          {detail.members.map((m) => m.name).join(", ")}
        </p>
        {detail.rules && (
          <p className="cr-hint">📜 {detail.rules}</p>
        )}
        {detail.active_match ? (
          <>
            <RoomMatchView
              key={detail.active_match.id}
              roomId={detail.id}
              matchId={detail.active_match.id}
              lang={lang}
              guest
              hideSocial
              onRequireLogin={onRequireLogin}
              namesOverride={{
                x: detail.active_match.x_name,
                o: detail.active_match.o_name,
              }}
            />
            {detail.comments.length > 0 && (
              <div className="cr-comments">
                {detail.comments.map((c, i) => (
                  <div key={i} className="cr-comment">
                    <strong>{c.user_name}</strong>: {c.body}
                  </div>
                ))}
              </div>
            )}
            <p className="cr-hint">
              💬 {lang === "vi" ? "Đăng nhập để bình luận" : "Log in to comment"}
            </p>
          </>
        ) : (
          <p className="cr-hint">
            {lang === "vi"
              ? "Hiện chưa có ván đấu nào đang diễn ra trong phòng này."
              : "No match is live in this room right now."}
          </p>
        )}
        <button type="button" className="cr-btn cr-btn-primary" onClick={onRequireLogin}>
          🔑 {lang === "vi" ? "Đăng nhập để tham gia" : "Log in to join"}
        </button>
      </div>
    );
  }

  return (
    <div className="cr-view">
      <h2>👥 {lang === "vi" ? "Phòng chơi" : "Game rooms"}</h2>

      {preview && (
        <div className="cr-invite-card">
          <p>
            💌 {lang === "vi" ? "Bạn được mời vào phòng" : "You've been invited to a room"}
          </p>
          <strong>{preview.name}</strong>
          <p className="cr-hint">
            👥 {preview.member_count} {lang === "vi" ? "thành viên" : "members"}
            {preview.rules ? ` · 📜 ${preview.rules}` : ""}
          </p>
          <button type="button" className="cr-btn cr-btn-primary" onClick={onRequireLogin}>
            🔑 {lang === "vi" ? "Đăng nhập để tham gia" : "Log in to join"}
          </button>
        </div>
      )}
      {previewInvalid && (
        <p className="cr-msg">
          {lang === "vi" ? "Mã phòng không hợp lệ." : "That room code is invalid."}
        </p>
      )}

      <h3>🌐 {lang === "vi" ? "Sảnh chung" : "Public lobby"}</h3>
      {publicRooms.length === 0 ? (
        <p className="cr-hint">
          {lang === "vi" ? "Chưa có phòng công khai nào." : "No public rooms yet."}
        </p>
      ) : (
        <ul className="cr-board-list">
          {publicRooms.map((r) => (
            <li key={r.id}>
              <button type="button" className="cr-room-row" onClick={() => openRoom(r.id)}>
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
                <button type="button" className="cr-room-row" onClick={() => openRoom(r.room_id)}>
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

      <p className="cr-hint">
        {lang === "vi"
          ? "Đăng nhập để tạo phòng, tham gia và thi đấu."
          : "Sign in to create rooms, join and play."}
      </p>
      <button type="button" className="cr-btn cr-btn-primary" onClick={onRequireLogin}>
        🔑 {lang === "vi" ? "Đăng nhập" : "Log in"}
      </button>
    </div>
  );
}
