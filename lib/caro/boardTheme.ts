import { useSyncExternalStore } from "react";

/**
 * Grid ink preference for the notebook board: "cyan" (classic ô-ly blue)
 * or "teal" (turquoise-leaning). Stored in localStorage and shared by every
 * board in the app via a tiny external store, so changing it in Settings
 * re-renders all boards at once.
 */
export type BoardTheme = "cyan" | "teal";

const KEY = "caro-board-theme";

let current: BoardTheme = "cyan";
try {
  const v = localStorage.getItem(KEY);
  if (v === "cyan" || v === "teal") current = v;
} catch {
  /* storage unavailable */
}

const listeners = new Set<() => void>();

export function setBoardTheme(t: BoardTheme) {
  current = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useBoardTheme(): BoardTheme {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => "cyan" as BoardTheme
  );
}

/** Grid line colors per theme (line / strong border / coordinate text). */
export const GRID_COLORS: Record<
  BoardTheme,
  { line: string; border: string; coord: string }
> = {
  cyan: { line: "#3dabd8", border: "#2FA8D2", coord: "#7dafc4" },
  teal: { line: "#2bb3a3", border: "#17a398", coord: "#7fb5ad" },
};
