"use client";

import { useState } from "react";
import type { Lang } from "@/lib/caro/engineApi";
import { followUser, unfollowUser } from "@/lib/supabase/friends";

interface Props {
  lang: Lang;
  userId: string;
  following: Set<string>;
  onChanged: (userId: string, nowFollowing: boolean) => void;
}

/** Compact ＋/✓ friend toggle for member lists and leaderboard rows (PacClone parity). */
export function FriendButton({ lang, userId, following, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const isFollowing = following.has(userId);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (isFollowing) {
        await unfollowUser(userId);
        onChanged(userId, false);
      } else {
        await followUser(userId);
        onChanged(userId, true);
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={`cr-btn cr-btn-sm${isFollowing ? " cr-friend-on" : ""}`}
      disabled={busy}
      onClick={toggle}
      title={
        isFollowing
          ? lang === "vi"
            ? "Đang theo dõi"
            : "Following"
          : lang === "vi"
            ? "Theo dõi"
            : "Follow"
      }
      aria-label={
        isFollowing
          ? lang === "vi"
            ? "Đang theo dõi"
            : "Following"
          : lang === "vi"
            ? "Theo dõi"
            : "Follow"
      }
    >
      {isFollowing ? "✓" : "＋"}
    </button>
  );
}
