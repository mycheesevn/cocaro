"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  currentSubscription,
  fetchPushStatus,
  pushCapability,
  pushPermission,
  sendTestPush,
  subscribePush,
  unsubscribePush,
} from "@/lib/push/client";
import type { Lang } from "@/lib/caro/engineApi";
import type { PushStatus } from "@/lib/push/client";

type PushState =
  | { kind: "unsupported"; reason: string }
  | { kind: "denied" }
  | { kind: "off" }
  | { kind: "on" }
  | { kind: "working" };

export function PushSettings({ lang }: { lang: Lang }) {
  const [state, setState] = useState<PushState>({ kind: "working" });
  const [tested, setTested] = useState(false);
  const [diag, setDiag] = useState<PushStatus | null>(null);
  const [showDiag, setShowDiag] = useState(false);

  const refresh = useCallback(async () => {
    const cap = pushCapability();
    if (!cap.ok) {
      setState({
        kind: "unsupported",
        reason:
          cap.reason === "ios-needs-install"
            ? lang === "vi"
              ? "iOS: cài app ra màn hình chính mới bật được thông báo."
              : "iOS: install the app to Home Screen to enable notifications."
            : lang === "vi"
              ? "Trình duyệt không hỗ trợ thông báo đẩy."
              : "Push notifications not supported.",
      });
      return;
    }
    if (pushPermission() === "denied") {
      setState({ kind: "denied" });
      return;
    }
    // currentSubscription() awaits navigator.serviceWorker.ready, which can
    // hang indefinitely if the SW registration is broken. Timeout after 5s
    // and treat as "off" so the UI never sticks on Loading.
    try {
      const sub = await Promise.race([
        currentSubscription(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);
      setState({ kind: sub ? "on" : "off" });
    } catch {
      setState({ kind: "off" });
    }
  }, [lang]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const accessToken = async (): Promise<string | null> => {
    const sb = createClient();
    const { data } = await sb.auth.getSession();
    return data?.session?.access_token || null;
  };

  const enable = async () => {
    setState({ kind: "working" });
    try {
      const token = await accessToken();
      if (!token) throw new Error("not_authenticated");
      await subscribePush(token);
      setState({ kind: "on" });
    } catch (e) {
      if ((e as Error).message === "denied") setState({ kind: "denied" });
      else refresh();
    }
  };

  const disable = async () => {
    setState({ kind: "working" });
    try {
      const token = await accessToken();
      if (token) await unsubscribePush(token);
    } finally {
      setState({ kind: "off" });
    }
  };

  const test = async () => {
    const token = await accessToken();
    if (!token) return;
    const ok = await sendTestPush(token);
    setTested(ok);
    setTimeout(() => setTested(false), 3000);
  };

  const checkDiag = async () => {
    const token = await accessToken();
    if (!token) return;
    setDiag(await fetchPushStatus(token));
    setShowDiag(true);
  };

  return (
    <div className="cr-view">
      <h2>🔔 {lang === "vi" ? "Thông báo đẩy" : "Push notifications"}</h2>
      {state.kind === "working" && <p className="cr-hint">…</p>}
      {state.kind === "unsupported" && <p className="cr-hint">{state.reason}</p>}
      {state.kind === "denied" && (
        <p className="cr-hint">
          {lang === "vi"
            ? "Bạn đã chặn thông báo. Mở cài đặt trình duyệt để bật lại."
            : "Notifications blocked. Enable them in browser settings."}
        </p>
      )}
      {(state.kind === "on" || state.kind === "off") && (
        <label className="cr-checr-toggle">
          <input
            type="checkbox"
            checked={state.kind === "on"}
            onChange={(e) => (e.target.checked ? enable() : disable())}
          />
          <span>
            {state.kind === "on"
              ? lang === "vi" ? "Tắt thông báo" : "Turn off"
              : lang === "vi" ? "Bật thông báo" : "Turn on"}
          </span>
        </label>
      )}
      {state.kind === "on" && (
        <>
          <button type="button" className="cr-btn" onClick={test}>
            {tested ? "✓" : lang === "vi" ? "📨 Gửi thử" : "📨 Send test"}
          </button>
          <button
            type="button"
            className="cr-btn"
            onClick={checkDiag}
            style={{ marginTop: 6 }}
          >
            🔍 {lang === "vi" ? "Kiểm tra lỗi" : "Diagnose"}
          </button>
        </>
      )}
      {showDiag && diag && (
        <div className="cr-hint" style={{ marginTop: 6 }}>
          <div>
            VAPID: {diag.vapidConfigured ? "✓" : "✗"}{" "}
            {lang === "vi" ? "đã cấu hình" : "configured"}
          </div>
          <div>
            Keys: {diag.keysMatch ? "✓" : "✗"}{" "}
            {lang === "vi" ? "khớp nhau" : "match"}
          </div>
          <div>
            {lang === "vi" ? "Đăng ký" : "Subscriptions"}: {diag.subscriptionCount}
          </div>
          {!diag.vapidConfigured && (
            <div>
              {lang === "vi"
                ? "Thiếu VAPID key trên server."
                : "Missing VAPID keys on server."}
            </div>
          )}
          {diag.vapidConfigured && !diag.keysMatch && (
            <div>
              {lang === "vi"
                ? "Public/private key không khớp — kiểm tra lại env vars."
                : "Public/private keys don't match — check env vars."}
            </div>
          )}
          {diag.subscriptionCount === 0 && (
            <div>
              {lang === "vi"
                ? "Chưa có đăng ký nào — tắt rồi bật lại thông báo."
                : "No subscriptions — toggle push off and on."}
            </div>
          )}
        </div>
      )}
      <p className="cr-hint">
        {lang === "vi"
          ? "Nhận tin khi có lời thách đấu, đến lượt đi trong phòng và cờ thư."
          : "Get notified about challenges, your turn in rooms and correspondence games."}
      </p>
    </div>
  );
}
