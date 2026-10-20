"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { claimCheckin, checkinHistory } from "@/lib/supabase/engagement";
import type { Lang } from "@/lib/caro/engineApi";

export function CheckinView({ lang }: { lang: Lang }) {
  const { user, refreshProfile } = useAuth();
  const [streak, setStreak] = useState<number | null>(null);
  const [claimed, setClaimed] = useState(false);
  const [history, setHistory] = useState<{ date: string; streak: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!user) return;
    checkinHistory()
      .then((h) => {
        setHistory(h);
        const today = new Date().toISOString().slice(0, 10);
        const todayRow = h.find((r) => r.date === today);
        if (todayRow) {
          setStreak(todayRow.streak);
          setClaimed(true);
        }
      })
      .catch(() => {});
  }, [user]);

  const claim = async () => {
    setBusy(true);
    setMsg("");
    try {
      const r = await claimCheckin();
      setStreak(r.streak);
      setClaimed(true);
      setMsg(
        lang === "vi"
          ? `+${r.xp_awarded} XP! Chuỗi ${r.streak} ngày 🔥`
          : `+${r.xp_awarded} XP! ${r.streak}-day streak 🔥`
      );
      await refreshProfile();
      const h = await checkinHistory();
      setHistory(h);
    } catch {
      setMsg(lang === "vi" ? "Lỗi, thử lại sau." : "Error, try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <div className="cr-view">
        <p>{lang === "vi" ? "Đăng nhập để điểm danh mỗi ngày." : "Sign in to check in daily."}</p>
      </div>
    );
  }

  return (
    <div className="cr-view">
      <h2>📅 {lang === "vi" ? "Điểm danh hằng ngày" : "Daily checr-in"}</h2>
      {streak !== null && (
        <p className="cr-streak">
          🔥 {lang === "vi" ? "Chuỗi hiện tại" : "Current streak"}: {streak}{" "}
          {lang === "vi" ? "ngày" : "days"}
        </p>
      )}
      <button
        type="button"
        className="cr-btn cr-btn-primary"
        disabled={claimed || busy}
        onClick={claim}
      >
        {claimed
          ? lang === "vi"
            ? "Đã điểm danh hôm nay ✓"
            : "Checked in today ✓"
          : busy
            ? "…"
            : lang === "vi"
              ? "Điểm danh nhận XP"
              : "Check in for XP"}
      </button>
      {msg && <p className="cr-msg">{msg}</p>}
      {history.length > 0 && (
        <div className="cr-cal">
          {history.map((h) => (
            <div key={h.date} className="cr-cal-day">
              <span>✅</span>
              <small>{h.date.slice(5)}</small>
            </div>
          ))}
        </div>
      )}
      <p className="cr-hint">
        {lang === "vi"
          ? "10 XP cơ bản, +5 mỗi ngày liên tiếp, tối đa 40 XP/ngày."
          : "10 base XP, +5 per consecutive day, capped at 40 XP/day."}
      </p>
    </div>
  );
}
