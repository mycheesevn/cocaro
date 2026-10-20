"use client";

import { useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/caro/engineApi";
import {
  ROOM_CHAT_PAGE,
  fetchRoomMessages,
  postRoomMessage,
  subscribeRoomMessages,
  type RoomChatMessage,
} from "@/lib/supabase/roomChat";
import { fetchNames } from "@/lib/supabase/rooms";
import { useAuth } from "./AuthProvider";

/**
 * In-room private text chat (family pattern, references/room-chat.md).
 * Members-only stream for the room (not a match), cloned from
 * MatchSocial's markup: same feed rows, sticky auto-scroll that only
 * follows when the reader is near the bottom, names via fetchNames.
 * Guests see nothing (select is member-only) and cannot post. Send
 * failures surface as visible error text — never swallowed.
 */
export function RoomChat({
  roomId,
  lang,
  disabled,
}: {
  roomId: string;
  lang: Lang;
  disabled?: boolean;
}) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<RoomChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);

  // Sticky auto-scroll: follow new messages while the reader stays near
  // the bottom (MatchSocial pattern).
  useEffect(() => {
    const el = feedRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const onScroll = () => {
    const el = feedRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    let live = true;
    fetchRoomMessages(roomId)
      .then((rows) => {
        if (!live) return;
        setMessages(rows);
        setHasMore(rows.length >= ROOM_CHAT_PAGE);
      })
      .catch(() => {
        if (live)
          setError(
            lang === "vi" ? "Không tải được chat phòng." : "Could not load room chat."
          );
      });
    const ch = subscribeRoomMessages(roomId, async (m) => {
      // Realtime rows arrive without the author name; resolve it the
      // same way the comments path does (fetchNames).
      let row = m;
      if (!m.user_name) {
        const names = await fetchNames([m.user_id]).catch(
          (): Record<string, string> => ({})
        );
        if (!live) return;
        row = { ...m, user_name: names[m.user_id] ?? "…" };
      }
      // Dedupe the local-post/realtime echo by id (comments path parity).
      setMessages((prev) =>
        prev.some((x) => x.id === row.id) ? prev : [...prev, row]
      );
    });
    return () => {
      live = false;
      ch.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const loadMore = async () => {
    if (loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const older = await fetchRoomMessages(roomId, messages[0].created_at);
      setMessages((prev) => [...older, ...prev]);
      setHasMore(older.length >= ROOM_CHAT_PAGE);
    } catch {
      /* keep the visible feed; a retry is always possible */
    } finally {
      setLoadingMore(false);
    }
  };

  const doPost = async () => {
    const body = draft.trim();
    if (!body || !user || sending || disabled) return;
    setSending(true);
    setError(null);
    try {
      await postRoomMessage(roomId, body);
      setDraft("");
      const fresh = await fetchRoomMessages(roomId);
      setMessages(fresh);
      setHasMore(fresh.length >= ROOM_CHAT_PAGE);
    } catch {
      setError(
        lang === "vi" ? "Không gửi được tin nhắn." : "Could not send the message."
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="cr-social">
      <div className="cr-comments" ref={feedRef} onScroll={onScroll}>
        <h4 className="cr-hint">
          ✉️ {lang === "vi" ? "Chat phòng" : "Room chat"} ({messages.length})
        </h4>
        {hasMore && (
          <button
            type="button"
            className="cr-btn cr-btn-sm"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {lang === "vi" ? "Tải thêm" : "Load more"}
          </button>
        )}
        {messages.length === 0 && (
          <p className="cr-hint">
            {lang === "vi" ? "Chưa có tin nhắn nào." : "No messages yet."}
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="cr-comment">
            <div className="cr-comment-body">
              <div className="cr-comment-meta">
                <strong>{m.user_name ?? "…"}</strong>
                <time className="cr-comment-time">
                  {new Date(m.created_at).toLocaleString(
                    lang === "vi" ? "vi-VN" : "en-US",
                    {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "2-digit",
                      month: "2-digit",
                    }
                  )}
                </time>
              </div>
              <div>{m.body}</div>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p className="cr-msg cr-msg-error" role="alert">
          {error}
        </p>
      )}

      {user && (
        <div className="cr-comment-form">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void doPost()}
            placeholder={lang === "vi" ? "Nhắn tin trong phòng..." : "Message the room..."}
            className="cr-input"
            maxLength={500}
            disabled={disabled || sending}
            aria-label={lang === "vi" ? "Chat phòng" : "Room chat"}
          />
          <button
            type="button"
            className="cr-btn cr-btn-sm"
            onClick={() => void doPost()}
            disabled={!draft.trim() || sending || disabled}
          >
            {lang === "vi" ? "Gửi" : "Send"}
          </button>
        </div>
      )}
    </div>
  );
}
