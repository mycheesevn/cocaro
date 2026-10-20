"use client";

import type { Lang } from "@/lib/caro/engineApi";
import { useRoomVoice, type VoiceMode } from "@/lib/voice/useRoomVoice";

interface Props {
  lang: Lang;
  roomId: string;
  myUserId: string;
  /** Player mode only; null in listener mode. */
  peerUserId: string | null;
  mode: VoiceMode;
}

/**
 * In-room voice chat (WebRTC, audio only, peer-to-peer).
 * Player mode: the two match players talk to each other (+ optional
 * consent toggle letting spectators listen).
 * Listener mode: signed-in room members spectate by ear (no microphone).
 */
export function RoomVoice({ lang, roomId, myUserId, peerUserId, mode }: Props) {
  const {
    status,
    joined,
    muted,
    error,
    join,
    leave,
    toggleMute,
    listenersAllowed,
    setListenersAllowed,
    listenerCount,
  } = useRoomVoice({ roomId, myUserId, peerUserId, mode });

  const statusText =
    status === "connecting"
      ? lang === "vi"
        ? "Đang kết nối…"
        : "Connecting…"
      : status === "waiting"
        ? mode === "listener"
          ? lang === "vi"
            ? "Đang chờ người chơi cho phép nghe…"
            : "Waiting for a player to allow listening…"
          : lang === "vi"
            ? "Đang chờ đối thủ…"
            : "Waiting for opponent…"
        : status === "connected"
          ? mode === "listener"
            ? lang === "vi"
              ? "Đang nghe ván đấu"
              : "Listening to the match"
            : lang === "vi"
              ? "Đã kết nối thoại"
              : "Voice connected"
          : null;

  return (
    <div className="cr-social">
      <h4 className="cr-hint">
        🎙️ {lang === "vi" ? "Trò chuyện thoại" : "Voice chat"}
      </h4>
      {!joined && (
        <button type="button" className="cr-btn cr-btn-sm" onClick={join}>
          {mode === "listener"
            ? lang === "vi"
              ? "🔊 Nghe ván đấu"
              : "🔊 Listen"
            : lang === "vi"
              ? "🎙️ Vào kênh thoại"
              : "🎙️ Join voice"}
        </button>
      )}
      {joined && statusText && <p className="cr-hint">{statusText}</p>}
      {joined && mode === "player" && (
        <div className="cr-comment-form">
          <button type="button" className="cr-btn cr-btn-sm" onClick={toggleMute}>
            {muted
              ? lang === "vi"
                ? "🔇 Bật mic"
                : "🔇 Unmute"
              : lang === "vi"
                ? "🎤 Tắt mic"
                : "🎤 Mute"}
          </button>
          <button type="button" className="cr-btn cr-btn-sm" onClick={leave}>
            {lang === "vi" ? "Rời kênh" : "Leave"}
          </button>
        </div>
      )}
      {joined && mode === "player" && (
        <div className="cr-comment-form">
          <button
            type="button"
            className="cr-btn cr-btn-sm"
            onClick={() => setListenersAllowed(!listenersAllowed)}
            aria-pressed={listenersAllowed}
          >
            {listenersAllowed
              ? `🔊 ${lang === "vi" ? "Cho khán giả nghe" : "Let spectators listen"} ✓`
              : `🔇 ${lang === "vi" ? "Cho khán giả nghe" : "Let spectators listen"}`}
          </button>
        </div>
      )}
      {mode === "player" && listenerCount > 0 && (
        <p className="cr-hint">
          👂 {lang === "vi" ? "Đang có khán giả nghe" : "Spectators are listening"}
        </p>
      )}
      {joined && mode === "listener" && (
        <div className="cr-comment-form">
          <button type="button" className="cr-btn cr-btn-sm" onClick={leave}>
            {lang === "vi" ? "Rời kênh" : "Leave"}
          </button>
        </div>
      )}
      {error && (
        <p className="cr-msg cr-msg-error" role="alert">
          ⚠️{" "}
          {error === "mic"
            ? lang === "vi"
              ? "Không dùng được micrô."
              : "Microphone unavailable."
            : lang === "vi"
              ? "Kết nối thoại thất bại."
              : "Voice connection failed."}
        </p>
      )}
    </div>
  );
}
