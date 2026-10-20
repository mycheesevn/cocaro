"use client";

import { useEffect, useRef, useState } from "react";
import { STR } from "@/lib/caro/i18n";
import {
  exportReplayVideo,
  type ReplayVideoInput,
} from "@/lib/caro/replayVideo";
import type {
  Color,
  Lang,
} from "@/lib/caro/engineApi";

export interface VideoGame {
  /** Stored move tokens (cell indices as strings). */
  moves: string[];
  startPos?: string;
  playerColor: Color;
  title: string;
  subtitle: string;
  shareUrl?: string;
}

interface Props {
  lang: Lang;
  game: VideoGame | null;
  onClose: () => void;
}

type Phase = "ready" | "recording" | "done" | "error";

/** Export a game replay as a shareable video clip (MP4 on Safari, WebM on Chrome). */
export function VideoExportModal({ lang, game, onClose }: Props) {
  const s = STR[lang];
  const [phase, setPhase] = useState<Phase>("ready");
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [micOn, setMicOn] = useState(false);
  const [micError, setMicError] = useState(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stopMic = () => {
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
  };

  const toggleMic = async () => {
    if (micOn) {
      stopMic();
      setMicOn(false);
      setMicError(false);
      return;
    }
    setMicError(false);
    try {
      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = ms;
      setMicOn(true);
    } catch {
      setMicError(true);
    }
  };

  useEffect(() => {
    if (game) {
      setPhase("ready");
      setProgress(0);
      setVideoUrl((u) => {
        if (u) URL.revokeObjectURL(u);
        return null;
      });
      setFile(null);
    } else {
      abortRef.current?.abort();
      stopMic();
      setMicOn(false);
      setMicError(false);
    }
  }, [game]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      stopMic();
      setVideoUrl((u) => {
        if (u) URL.revokeObjectURL(u);
        return null;
      });
    };
  }, []);

  if (!game) return null;

  const startRecording = async () => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPhase("recording");
    setProgress(0);
    try {
      const input: ReplayVideoInput = {
        moves: game.moves,
        startPos: game.startPos,
        playerColor: game.playerColor,
        title: game.title,
        subtitle: game.subtitle,
        lang,
        speed,
        micStream: micStreamRef.current,
        signal: ctrl.signal,
        onProgress: (p) => setProgress(p),
      };
      const f = await exportReplayVideo(input);
      setFile(f);
      setVideoUrl(URL.createObjectURL(f));
      setPhase("done");
    } catch (e) {
      if (e instanceof Error && e.message === "cancelled") {
        setPhase("ready");
        setProgress(0);
      } else {
        setPhase("error");
      }
    } finally {
      abortRef.current = null;
    }
  };

  const shareFile = async () => {
    if (!file || busy) return;
    setBusy(true);
    try {
      const url = game.shareUrl ?? window.location.origin;
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: game.title,
          text: `${game.title}\n${game.subtitle}`,
          url,
        });
      } else {
        downloadFile();
        try {
          await navigator.clipboard.writeText(
            `${game.title} ${game.subtitle} ${url}`
          );
        } catch {
          /* clipboard unavailable */
        }
      }
    } catch {
      /* share cancelled */
    } finally {
      setBusy(false);
    }
  };

  const downloadFile = () => {
    if (!videoUrl || !file) return;
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="cr-modal-root" onClick={onClose}>
      <div className="cr-modal" onClick={(e) => e.stopPropagation()}>
        <h2>🎬 {s.videoTitle}</h2>
        {phase === "ready" && (
          <>
            <p className="cr-empty-note">{s.videoDesc}</p>
            <p className="cr-empty-note">{s.videoMoves(game.moves.length)}</p>
            <div className="cr-video-row">
              <span className="cr-video-label">{s.videoSpeed}</span>
              <div className="cr-seg" role="group" aria-label={s.videoSpeed}>
                {(
                  [
                    { v: 0.5, label: s.videoSpeedSlow },
                    { v: 1, label: s.videoSpeedNormal },
                    { v: 1.5, label: s.videoSpeedFast },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    className={speed === o.v ? "active" : ""}
                    onClick={() => setSpeed(o.v)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="cr-video-mic">
              <input type="checkbox" checked={micOn} onChange={toggleMic} />
              <span>{s.videoMic}</span>
            </label>
            {micError && <p className="cr-form-error">{s.videoMicDenied}</p>}
            <div className="cr-modal-actions">
              <button type="button" className="cr-btn cr-btn-primary" onClick={startRecording}>
                ● {s.videoStart}
              </button>
              <button type="button" className="cr-btn cr-btn-sm" onClick={onClose}>
                {s.videoClose}
              </button>
            </div>
          </>
        )}
        {phase === "recording" && (
          <>
            <p className="cr-empty-note">{s.videoRecording}</p>
            <div className="cr-progress">
              <div
                className="cr-progress-fill"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <p className="cr-empty-note">{Math.round(progress * 100)}%</p>
            <div className="cr-modal-actions">
              <button
                type="button"
                className="cr-btn cr-btn-sm"
                onClick={() => abortRef.current?.abort()}
              >
                {s.videoCancel}
              </button>
            </div>
          </>
        )}
        {phase === "done" && videoUrl && (
          <>
            <p className="cr-empty-note">{s.videoDone}</p>
            <video className="cr-video-preview" src={videoUrl} controls playsInline />
            <div className="cr-modal-actions">
              <button
                type="button"
                className="cr-btn cr-btn-primary"
                disabled={busy}
                onClick={shareFile}
              >
                📤 {s.videoShare}
              </button>
              <button type="button" className="cr-btn cr-btn-sm" onClick={downloadFile}>
                ⬇️ {s.videoDownload}
              </button>
              <button type="button" className="cr-btn cr-btn-sm" onClick={onClose}>
                {s.videoClose}
              </button>
            </div>
          </>
        )}
        {phase === "error" && (
          <>
            <p className="cr-form-error">{s.videoError}</p>
            <div className="cr-modal-actions">
              <button type="button" className="cr-btn cr-btn-sm" onClick={onClose}>
                {s.videoClose}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
