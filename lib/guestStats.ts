/** Local counters of what a guest has done — fuels the signup teaser.
 *  Ported from PacClone (lib/guestStats.ts). */

const KEY = "cr-guest-stats";

export interface GuestStats {
  games: number;
  puzzles: number;
}

function read(): GuestStats {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { games: 0, puzzles: 0 };
    const p = JSON.parse(raw) as Partial<GuestStats>;
    return {
      games: typeof p.games === "number" ? p.games : 0,
      puzzles: typeof p.puzzles === "number" ? p.puzzles : 0,
    };
  } catch {
    return { games: 0, puzzles: 0 };
  }
}

export function loadGuestStats(): GuestStats {
  return read();
}

/** Increment a guest counter. Returns the updated stats. */
export function bumpGuestStat(kind: "games" | "puzzles"): GuestStats {
  const s = read();
  s[kind] += 1;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
  return s;
}
