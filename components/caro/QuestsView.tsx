"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { QUESTS, claimQuest, claimedQuests } from "@/lib/supabase/quests";
import type { Lang } from "@/lib/caro/engineApi";

const QUEST_LABEL: Record<string, { vi: string; en: string }> = {
  play_1: { vi: "Chơi 1 ván với máy", en: "Play 1 game vs computer" },
  win_1: { vi: "Thắng 1 ván", en: "Win 1 game" },
  join_room: { vi: "Tham gia 1 phòng", en: "Join 1 room" },
};

export function QuestsView({ lang }: { lang: Lang }) {
  const { user, refreshProfile } = useAuth();
  const [claimed, setClaimed] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!user) return;
    claimedQuests().then(setClaimed).catch(() => {});
  }, [user]);

  if (!user) {
    return (
      <div className="cr-view">
        <p>{lang === "vi" ? "Đăng nhập để làm nhiệm vụ." : "Sign in for quests."}</p>
      </div>
    );
  }

  const doClaim = async (id: string) => {
    setMsg("");
    try {
      const ok = await claimQuest(id);
      if (ok) {
        setClaimed(new Set(claimed).add(id));
        setMsg(lang === "vi" ? "+20 XP! 🎉" : "+20 XP! 🎉");
        await refreshProfile();
      } else {
        setMsg(
          lang === "vi" ? "Chưa hoàn thành hoặc đã nhận." : "Not completed or already claimed."
        );
      }
    } catch {
      setMsg(lang === "vi" ? "Lỗi." : "Error.");
    }
  };

  return (
    <div className="cr-view">
      <h2>🌱 {lang === "vi" ? "Nhiệm vụ tân thủ" : "Beginner quests"}</h2>
      {msg && <p className="cr-msg">{msg}</p>}
      <ul className="cr-board-list">
        {QUESTS.map((q) => {
          const label = QUEST_LABEL[q.id];
          const done = claimed.has(q.id);
          return (
            <li key={q.id} className="cr-lb-row">
              <span className="cr-lb-name">{lang === "vi" ? label.vi : label.en}</span>
              <span className="cr-lb-xp">+{q.xp} XP</span>
              <button
                type="button"
                className="cr-btn cr-btn-sm"
                disabled={done}
                onClick={() => doClaim(q.id)}
              >
                {done ? "✓" : lang === "vi" ? "Nhận" : "Claim"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
