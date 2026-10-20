// XP curve and titles for caro. Level thresholds shared across the app.

export const LEVEL_THRESHOLDS = [
  0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000, 5000,
];

export interface Title {
  vi: string;
  en: string;
}

export const TITLES: Title[] = [
  { vi: "Tân Thủ", en: "Beginner" },
  { vi: "Tập Sự", en: "Novice" },
  { vi: "Học Viên", en: "Apprentice" },
  { vi: "Kỳ Thủ", en: "Club Player" },
  { vi: "Cao Thủ", en: "Expert" },
  { vi: "Đại Cao Thủ", en: "Master" },
  { vi: "Kiện Tướng", en: "National Master" },
  { vi: "Đại Kiện Tướng", en: "Grandmaster" },
  { vi: "Huyền Thoại", en: "Legend" },
  { vi: "Vô Địch", en: "Champion" },
  { vi: "Thiên Tài", en: "Prodigy" },
  { vi: "Vĩ Nhân", en: "Immortal" },
];

export function levelForXp(xp: number): number {
  let lvl = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) lvl = i + 1;
  }
  return lvl;
}

export function titleForLevel(level: number, lang: "vi" | "en"): string {
  const t = TITLES[Math.min(level - 1, TITLES.length - 1)];
  return lang === "vi" ? t.vi : t.en;
}

export function xpForNextLevel(xp: number): number | null {
  for (const th of LEVEL_THRESHOLDS) {
    if (xp < th) return th;
  }
  return null; // max level
}

export interface LevelProgress {
  level: number;
  /** 0..1 progress WITHIN the current level (PacClone formula). */
  prog: number;
  into: number;
  needed: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const cur = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const next = LEVEL_THRESHOLDS[level];
  if (next === undefined || next <= cur) {
    return { level, prog: 1, into: xp - cur, needed: 1 };
  }
  return {
    level,
    prog: Math.min(1, Math.max(0, (xp - cur) / (next - cur))),
    into: xp - cur,
    needed: next - cur,
  };
}

// ------------------------------------------------------ Rating titles ------
// Mirror PacClone's RATING_BANDS: titles by Elo band, not by level.

export interface RatingBand {
  min: number;
  vi: string;
  en: string;
}

export const RATING_BANDS: RatingBand[] = [
  { min: 1800, vi: "Đại Kiện Tướng", en: "Grandmaster" },
  { min: 1500, vi: "Kiện Tướng", en: "Master" },
  { min: 1200, vi: "Cao Cấp", en: "Advanced" },
  { min: 900, vi: "Trung Cấp", en: "Intermediate" },
  { min: 600, vi: "Sơ Cấp", en: "Beginner" },
  { min: 0, vi: "Tân Thủ", en: "Novice" },
];

/** Title for a rating, e.g. "Kiện Tướng". */
export function ratingTitle(rating: number, lang: "vi" | "en"): string {
  const band =
    RATING_BANDS.find((b) => rating >= b.min) ??
    RATING_BANDS[RATING_BANDS.length - 1];
  return lang === "vi" ? band.vi : band.en;
}
