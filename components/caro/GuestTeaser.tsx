"use client";

import { STR } from "@/lib/caro/i18n";
import type { Lang } from "@/lib/caro/engineApi";
import { loadGuestStats } from "@/lib/guestStats";

interface Props {
  lang: Lang;
}

/** "Look what you'd keep" nudge for guests, with their real numbers.
 *  Ported from PacClone (components/xiangqi/GuestTeaser.tsx). */
export function GuestTeaser({ lang }: Props) {
  const s = STR[lang];
  const stats = loadGuestStats();
  const parts: string[] = [];
  if (stats.games > 0) parts.push(s.guestTeaserGames(stats.games));
  if (stats.puzzles > 0) parts.push(s.guestTeaserPuzzles(stats.puzzles));

  return (
    <div className="cr-guest-teaser">
      {parts.length > 0 && (
        <p className="cr-guest-teaser-stats">📊 {parts.join(", ")}.</p>
      )}
      <p>{s.guestTeaserCta}</p>
      <button
        type="button"
        className="cr-btn cr-btn-primary"
        onClick={() => window.dispatchEvent(new CustomEvent("ch:open-auth"))}
      >
        🔑 {s.authLogin}
      </button>
    </div>
  );
}
