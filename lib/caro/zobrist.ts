// Position key for Cờ Ca-rô. The engine has no repetition rule (stones
// never move), so this is only a cheap identity hash for caches and
// restore bookkeeping — an FNV-1a over the engine's state key.
import { stateKey, type CaroState } from "./engine";

export type ZKey = string;

export function zobristHash(st: CaroState): ZKey {
  const s = stateKey(st);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
