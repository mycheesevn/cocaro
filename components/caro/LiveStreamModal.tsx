"use client";

import { useEffect, useState } from "react";
import { STR } from "@/lib/caro/i18n";
import type { Lang } from "@/lib/caro/engineApi";
import { useAuth } from "./AuthProvider";
import {
  LiveError,
  clearSavedKeys,
  liveCaptureSupported,
  loadSavedKeys,
  storeSavedKeys,
  type LiveDestination,
} from "@/lib/live/client";

interface Props {
  lang: Lang;
  onClose: () => void;
  onRequireLogin: () => void;
  /** Starts the broadcast; resolves once on-air (parent closes the modal
   *  and switches the page into stream mode), rejects with LiveError. */
  onStart: (destinations: LiveDestination[]) => Promise<void>;
}

/**
 * 📡 Go Live — collects the player's own YouTube/Facebook stream keys and
 * starts the broadcast. The modal closes the moment the stream is on air,
 * so the keys never appear on the broadcast itself (the page is captured)
 * and the player can play unobstructed; stream controls live in the
 * LiveOverlay bar from then on.
 */
export function LiveStreamModal({ lang, onClose, onRequireLogin, onStart }: Props) {
  const s = STR[lang];
  const { user } = useAuth();
  const supported = liveCaptureSupported();

  const [starting, setStarting] = useState(false);
  const [ytKey, setYtKey] = useState("");
  const [fbKey, setFbKey] = useState("");
  const [saveKeys, setSaveKeys] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadSavedKeys();
    setYtKey(saved.youtube);
    setFbKey(saved.facebook);
  }, []);

  const start = async () => {
    const destinations: LiveDestination[] = [];
    if (ytKey.trim())
      destinations.push({ platform: "youtube", key: ytKey.trim() });
    if (fbKey.trim())
      destinations.push({ platform: "facebook", key: fbKey.trim() });
    if (destinations.length === 0) {
      setError(s.liveNeedKey);
      return;
    }
    setError(null);
    setStarting(true);
    try {
      await onStart(destinations);
      if (saveKeys)
        storeSavedKeys({ youtube: ytKey.trim(), facebook: fbKey.trim() });
      else clearSavedKeys();
      // Parent closes the modal and shows the stream overlay.
    } catch (e) {
      setStarting(false);
      if (e instanceof LiveError) {
        if (e.code === "cancelled") return; // picker dismissed — stay silent
        if (e.code === "not_configured") setError(s.liveNotConfigured);
        else if (e.code === "unauthorized") setError(s.liveNeedLogin);
        else if (e.code === "capture")
          // The tab picker never opened (or was blocked): show the reason
          // instead of silently resetting, e.g. "(NotAllowedError)".
          setError(
            s.liveCaptureDenied + (e.detail ? ` (${e.detail})` : "")
          );
        else setError(s.liveFailed);
      } else {
        setError(s.liveFailed);
      }
    }
  };

  return (
    <div className="cr-modal-root" onClick={onClose}>
      <div className="cr-modal cr-live-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{s.liveTitle}</h3>

        {!user ? (
          <>
            <p className="cr-live-note">{s.liveNeedLogin}</p>
            <div className="cr-modal-actions">
              <button
                type="button"
                className="cr-btn cr-btn-primary"
                onClick={onRequireLogin}
              >
                {s.liveLoginBtn}
              </button>
              <button type="button" className="cr-btn" onClick={onClose}>
                ✕
              </button>
            </div>
          </>
        ) : !supported ? (
          <>
            <p className="cr-live-note">{s.liveUnsupported}</p>
            <div className="cr-modal-actions">
              <button type="button" className="cr-btn" onClick={onClose}>
                ✕
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="cr-live-note">{s.liveIntro}</p>
            <p className="cr-live-note">{s.livePickTab}</p>
            <label className="cr-field">
              <span>{s.liveYoutubeKey}</span>
              <input
                className="cr-input"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={s.liveKeyPh}
                value={ytKey}
                onChange={(e) => setYtKey(e.target.value)}
              />
            </label>
            <label className="cr-field">
              <span>{s.liveFacebookKey}</span>
              <input
                className="cr-input"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={s.liveKeyPh}
                value={fbKey}
                onChange={(e) => setFbKey(e.target.value)}
              />
            </label>
            <label className="cr-live-check">
              <input
                type="checkbox"
                checked={saveKeys}
                onChange={(e) => setSaveKeys(e.target.checked)}
              />
              <span>{s.liveSaveKeys}</span>
            </label>
            {error && <p className="cr-live-error">{error}</p>}
            <div className="cr-modal-actions">
              <button
                type="button"
                className="cr-btn cr-btn-primary"
                onClick={start}
                disabled={starting}
              >
                {starting ? s.liveStarting : s.liveStart}
              </button>
              <button type="button" className="cr-btn" onClick={onClose}>
                ✕
              </button>
            </div>
            <p className="cr-live-note cr-live-keynote">{s.liveKeyNote}</p>
          </>
        )}
      </div>
    </div>
  );
}
