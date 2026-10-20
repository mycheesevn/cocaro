"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { STR } from "@/lib/caro/i18n";
import type { Lang } from "@/lib/caro/engineApi";

interface Props {
  lang: Lang;
  onClose: () => void;
  initialMode?: "in" | "up";
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="#1877F2"
        d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.89v2.26h3.32l-.53 3.49h-2.79V24C19.61 23.09 24 18.1 24 12.07z"
      />
    </svg>
  );
}

export function AuthModal({ lang, onClose, initialMode }: Props) {
  const s = STR[lang];
  const { signUp, signIn, signInWithGoogle, signInWithFacebook } = useAuth();
  const [mode, setMode] = useState<"in" | "up">(initialMode ?? "in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const oauth = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch {
      /* redirect flow failed */
    }
    setBusy(false);
    // On success the browser redirects to the provider, so nothing else to do.
  };

  const submit = async () => {
    if (!email.includes("@") || password.length < 6) {
      setError(s.authInvalid);
      return;
    }
    setBusy(true);
    setError(null);
    const fn = mode === "in" ? signIn : signUp;
    const { error: err } = await fn(email.trim(), password);
    setBusy(false);
    if (err) {
      setError(err);
    } else if (mode === "up") {
      // Stash the display name: it is applied to the profile on first login
      // (email confirmation may be required before a session exists).
      if (name.trim()) {
        try {
          localStorage.setItem("caro-username", name.trim().slice(0, 30));
        } catch {
          /* storage unavailable */
        }
      }
      setDone(s.authCheckEmail);
    } else {
      onClose();
    }
  };

  return (
    <div className="cr-modal-root" onClick={onClose}>
      <div className="cr-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{mode === "in" ? s.authLogin : s.authSignup}</h2>
        <div className="cr-oauth">
          <button
            type="button"
            className="cr-btn cr-oauth-btn"
            onClick={() => oauth(signInWithGoogle)}
            disabled={busy}
          >
            <GoogleIcon /> {s.authContinueWith} Google
          </button>
          <button
            type="button"
            className="cr-btn cr-oauth-btn"
            onClick={() => oauth(signInWithFacebook)}
            disabled={busy}
          >
            <FacebookIcon /> {s.authContinueWith} Facebook
          </button>
        </div>
        <div className="cr-or">
          <span>{s.authOr}</span>
        </div>
        <label className="cr-field">
          <span>Email</span>
          <input
            type="email"
            className="cr-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </label>
        {mode === "up" && (
          <label className="cr-field">
            <span>{s.authDisplayName}</span>
            <input
              type="text"
              className="cr-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={s.authDisplayNamePh}
              autoComplete="nickname"
              maxLength={30}
            />
          </label>
        )}
        <label className="cr-field">
          <span>{s.authPassword}</span>
          <input
            type="password"
            className="cr-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </label>
        {error && <p className="cr-error">{error}</p>}
        {done && <p className="cr-ok">{done}</p>}
        <div className="cr-buttons">
          <button
            type="button"
            className="cr-btn cr-btn-primary"
            onClick={submit}
            disabled={busy}
          >
            {busy ? "…" : mode === "in" ? s.authLogin : s.authSignup}
          </button>
          <button type="button" className="cr-btn" onClick={onClose}>
            {s.authClose}
          </button>
        </div>
        <p className="cr-hint" style={{ textAlign: "center" }}>
          {mode === "in" ? (
            <>
              {s.authNoAccount}{" "}
              <button
                type="button"
                className="cr-link"
                onClick={() => {
                  setMode("up");
                  setError(null);
                }}
              >
                {s.authSignup}
              </button>
            </>
          ) : (
            <>
              {s.authHaveAccount}{" "}
              <button
                type="button"
                className="cr-link"
                onClick={() => {
                  setMode("in");
                  setError(null);
                }}
              >
                {s.authLogin}
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
