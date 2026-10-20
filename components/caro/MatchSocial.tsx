"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchCommentAuthor,
  fetchComments,
  postComment,
  subscribeComments,
  type RoomComment,
} from "@/lib/supabase/comments";
import { useAuth } from "./AuthProvider";
import type { Lang } from "@/lib/caro/engineApi";

/** Comments only — the reaction bar lives in RoomMatchView's actions row
 *  directly under the board (PacClone anatomy), not in this panel. */

export function MatchSocial({
  roomId,
  matchId,
  lang,
  moveNumber,
  disabled,
}: {
  roomId: string;
  matchId: string;
  lang: Lang;
  moveNumber?: number | null;
  /** Match cancelled: read-only, like PacClone's RoomComments. */
  disabled?: boolean;
}) {
  const { user } = useAuth();
  const [comments, setComments] = useState<RoomComment[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);

  // Sticky auto-scroll: follow new comments while the user stays near
  // the bottom (PacClone pattern).
  useEffect(() => {
    const el = feedRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [comments.length]);

  const onScroll = () => {
    const el = feedRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    fetchComments(matchId).then(setComments).catch(() => {});
    const cc = subscribeComments(matchId, async (c) => {
      // Realtime rows arrive without the profile join — attach the
      // author's name/avatar so other users' comments render correctly.
      let row = c;
      if (c.user_id && !c.user_name) {
        const author = await fetchCommentAuthor(c.user_id).catch(() => null);
        if (author) row = { ...c, ...author };
      }
      setComments((prev) => (prev.some((x) => x.id === row.id) ? prev : [...prev, row]));
    });
    return () => {
      cc.unsubscribe();
    };
  }, [matchId]);

  const doPost = async () => {
    const body = draft.trim();
    if (!body || !user || sending || disabled) return;
    setSending(true);
    try {
      await postComment(roomId, matchId, body, moveNumber ?? null);
      setDraft("");
      const fresh = await fetchComments(matchId);
      setComments(fresh);
    } catch {
      /* keep the draft so the text isn't lost */
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="cr-social">
      <div className="cr-comments" ref={feedRef} onScroll={onScroll}>
        <h4 className="cr-hint">
          💬 {lang === "vi" ? "Bình luận" : "Comments"} ({comments.length})
        </h4>
        {comments.length === 0 && (
          <p className="cr-hint">
            {lang === "vi" ? "Chưa có bình luận nào." : "No comments yet."}
          </p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="cr-comment">
            {c.avatar_url ? (
              <img src={c.avatar_url} alt="" className="cr-comment-avatar" />
            ) : (
              <span className="cr-comment-avatar cr-comment-avatar-fallback">♟</span>
            )}
            <div className="cr-comment-body">
              <div className="cr-comment-meta">
                <strong>{c.user_name}</strong>
                {c.move_number != null && (
                  <span className="cr-comment-move">
                    {lang === "vi" ? `nước ${c.move_number}` : `move ${c.move_number}`}
                  </span>
                )}
                <time className="cr-comment-time">
                  {new Date(c.created_at).toLocaleString(
                    lang === "vi" ? "vi-VN" : "en-US",
                    { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }
                  )}
                </time>
              </div>
              <div>{c.body}</div>
            </div>
          </div>
        ))}
      </div>

      {user && (
        <div className="cr-comment-form">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doPost()}
            placeholder={lang === "vi" ? "Bình luận..." : "Comment..."}
            className="cr-input"
            maxLength={500}
            disabled={disabled || sending}
            aria-label={lang === "vi" ? "Bình luận" : "Comments"}
          />
          <button
            type="button"
            className="cr-btn cr-btn-sm"
            onClick={doPost}
            disabled={!draft.trim() || sending || disabled}
          >
            {lang === "vi" ? "Gửi" : "Send"}
          </button>
        </div>
      )}
    </div>
  );
}
