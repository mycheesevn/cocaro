// Cờ Ca-rô AI — 12-level ladder (1 = weakest, 12 = strongest).
//
// Evaluation is pattern-based and RULE-AWARE: a direction is scored by the
// maximal run a stone would complete (length x open ends) using the exact
// engine semantics — an exactly-5 with both ends blocked is a capped "dead
// five", never a win — plus broken patterns (XX_X, X_XX, ...) found by
// sliding 5-cell windows along each line. Scores sum over the 4 directions,
// so a move that opens two lines at once naturally out-scores a single
// threat; at levels with the double-threat bonus, two simultaneous
// three-tier-or-better threats are valued near an open four (nước đôi).
//
// Tactics (levels >= 5) are EXACT, computed with the engine's own win test:
// take an immediate win, block the opponent's immediate winning cell.
// Levels 7+ run negamax alpha-beta (depth 2-4) over the top-K candidate
// moves, ordered by the pattern heuristic. Candidate moves are the empty
// cells within Chebyshev distance 2 of any stone (center on an empty board).
//
// chooseMove is deterministic given the supplied rng.

import {
  CaroState,
  DIRECTIONS,
  EMPTY,
  Player,
  applyMove,
  centerIndex,
  inBoard,
  isWinRun,
  lineThrough,
  opponent,
  undoMove,
  xOf,
  yOf,
} from "./engine";

// ---------------------------------------------------------------------------
// Pattern scores (per direction, from the moving side's perspective)
// ---------------------------------------------------------------------------

const WIN_SCORE = 10_000_000;
const OPEN4_SCORE = 1_200_000;
const DOUBLE_SCORE = 1_000_000;
const FOUR_SCORE = 150_000; // blocked four: exactly one winning cell
const BROKEN4_SCORE = 140_000; // XX_XX-style: one move from five
const OPEN3_SCORE = 110_000;
const BROKEN3_SCORE = 70_000; // XX_X-style: one move from an open four
const THREE_SCORE = 12_000; // blocked three
const CAPPED3_SCORE = 20_000; // 3-in-a-window that can only become a blocked four
const OPEN2_SCORE = 1_600;
const BROKEN2_SCORE = 700;
const TWO_SCORE = 350;
const ONE_SCORE = 40;
const DEAD5_SCORE = 2_000; // exactly-5, both ends blocked: capped, cannot grow

/** Threat rank of one direction: 0 none, 1 two-tier, 2 three-tier,
 *  3 four-tier, 4 open-four, 5 winning. */
interface DirScore {
  value: number;
  rank: number;
}

/**
 * Best 5-window potential along one line through idx: the largest number of
 * `color` stones in any 5 consecutive cells that contain idx and hold no
 * opponent stone / board edge (idx itself counts as `color`; the board
 * must already have the hypothetical stone poked in).
 */
function windowPotential(
  state: CaroState,
  idx: number,
  color: Player,
  dx: number,
  dy: number
): number {
  const { size, board } = state;
  const opp = opponent(color);
  const x = xOf(size, idx);
  const y = yOf(size, idx);
  let best = 0;
  for (let s = -4; s <= 0; s++) {
    let mine = 0;
    let blocked = false;
    for (let k = s; k < s + 5; k++) {
      const cx = x + dx * k;
      const cy = y + dy * k;
      if (!inBoard(size, cx, cy)) {
        blocked = true;
        break;
      }
      const v = board[cy * size + cx];
      if (v === opp) {
        blocked = true;
        break;
      }
      if (v === color) mine++;
    }
    if (!blocked && mine > best) best = mine;
  }
  return best;
}

/**
 * Second-order check along one line (idx must already be poked): can ONE
 * more `color` stone on this line create a run of exactly `wantLen` with
 * `wantOpen` open ends — or, when wantLen is 5, any winning run? Window
 * counts alone over-rate capped patterns: a 3-in-a-window whose only
 * four is blocked at one end (opponent stone just outside the window)
 * can never become an open four, so it is not a true three-tier threat.
 */
function gapFillCreates(
  state: CaroState,
  idx: number,
  color: Player,
  dx: number,
  dy: number,
  wantLen: number,
  wantOpen: number
): boolean {
  const { size, board } = state;
  const x = xOf(size, idx);
  const y = yOf(size, idx);
  for (let k = -4; k <= 4; k++) {
    if (k === 0) continue;
    const ex = x + dx * k;
    const ey = y + dy * k;
    if (!inBoard(size, ex, ey)) continue;
    const e = ey * size + ex;
    if (board[e] !== EMPTY) continue;
    board[e] = color;
    const run = lineThrough(board, size, e, dx, dy);
    board[e] = EMPTY;
    if (
      wantLen === 5
        ? isWinRun(run.len, run.openEnds)
        : run.len === wantLen && run.openEnds === wantOpen
    ) {
      return true;
    }
  }
  return false;
}

/** Score one direction for hypothetically playing `color` at empty idx. */
function dirAttack(
  state: CaroState,
  idx: number,
  color: Player,
  dx: number,
  dy: number
): DirScore {
  const { size, board } = state;
  board[idx] = color; // poke the hypothetical stone; restored below
  const run = lineThrough(board, size, idx, dx, dy);
  let value: number;
  let rank: number;
  if (isWinRun(run.len, run.openEnds)) {
    value = WIN_SCORE;
    rank = 5;
  } else if (run.len === 5) {
    value = DEAD5_SCORE; // both ends blocked (else it would be a win)
    rank = 1;
  } else if (run.len === 4) {
    if (run.openEnds === 2) {
      value = OPEN4_SCORE;
      rank = 4;
    } else if (run.openEnds === 1) {
      value = FOUR_SCORE;
      rank = 3;
    } else {
      value = 200;
      rank = 0;
    }
  } else if (run.len === 3) {
    if (run.openEnds === 2) {
      value = OPEN3_SCORE;
      rank = 2;
    } else if (run.openEnds === 1) {
      value = THREE_SCORE;
      rank = 1;
    } else {
      value = 60;
      rank = 0;
    }
  } else if (run.len === 2) {
    if (run.openEnds === 2) {
      value = OPEN2_SCORE;
      rank = 1;
    } else if (run.openEnds === 1) {
      value = TWO_SCORE;
      rank = 0;
    } else {
      value = 30;
      rank = 0;
    }
  } else {
    value = run.openEnds === 2 ? ONE_SCORE : 12;
    rank = 0;
  }

  // Broken patterns (one gap) the contiguous run cannot see. The tier is
  // only awarded when the gap-fill genuinely produces the pattern: a
  // broken four must fill to a WINNING five (a both-ends-blocked five is
  // dead under the Vietnamese rule), and a broken three must be able to
  // become an OPEN four — a merely blocked four is stoppable, hence not
  // a three-tier threat.
  if (rank < 3) {
    const pot = windowPotential(state, idx, color, dx, dy);
    if (pot === 4) {
      if (gapFillCreates(state, idx, color, dx, dy, 5, 0)) {
        if (BROKEN4_SCORE > value) value = BROKEN4_SCORE;
        rank = 3;
      } else if (value < DEAD5_SCORE) {
        value = DEAD5_SCORE; // fills only to a dead five
      }
    } else if (pot === 3 && rank < 2) {
      if (gapFillCreates(state, idx, color, dx, dy, 4, 2)) {
        if (BROKEN3_SCORE > value) value = BROKEN3_SCORE;
        rank = 2;
      } else if (value < CAPPED3_SCORE) {
        value = CAPPED3_SCORE; // can only ever become a blocked four
      }
    } else if (pot === 2 && rank < 1 && BROKEN2_SCORE > value) {
      value = BROKEN2_SCORE;
      rank = 1;
    }
  }

  board[idx] = EMPTY;
  return { value, rank };
}

export interface AttackInfo {
  score: number;
  /** Directions at three-tier or better (rank >= 2). */
  threats: number;
}

/**
 * Total attacking value of playing `color` at empty idx, summed over the
 * 4 directions. With `doubleBonus`, two or more simultaneous threats are
 * raised to DOUBLE_SCORE (near open-four): the defender can only answer one.
 */
export function attackScore(
  state: CaroState,
  idx: number,
  color: Player,
  doubleBonus = true
): AttackInfo {
  if (state.board[idx] !== EMPTY) return { score: 0, threats: 0 };
  let total = 0;
  let threats = 0;
  for (const [dx, dy] of DIRECTIONS) {
    const d = dirAttack(state, idx, color, dx, dy);
    total += d.value;
    if (d.rank >= 2) threats++;
  }
  if (doubleBonus && threats >= 2) {
    total = Math.max(total, DOUBLE_SCORE);
  }
  return { score: total, threats };
}

/** Exact win test for a hypothetical placement (engine rules, incl. the
 *  blocked-both-ends exactly-5 exception and poisoned four ends). */
export function winsAt(state: CaroState, idx: number, color: Player): boolean {
  if (state.board[idx] !== EMPTY) return false;
  const { size, board } = state;
  board[idx] = color;
  let win = false;
  for (const [dx, dy] of DIRECTIONS) {
    const run = lineThrough(board, size, idx, dx, dy);
    if (isWinRun(run.len, run.openEnds)) {
      win = true;
      break;
    }
  }
  board[idx] = EMPTY;
  return win;
}

/** The first cell (in candidate order) where `color` wins immediately,
 *  or -1 when there is none. Exact — safe to hard-wire into tactics. */
export function findWinningMove(state: CaroState, color: Player): number {
  for (const idx of candidateMoves(state)) {
    if (winsAt(state, idx, color)) return idx;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

/** Empty cells within Chebyshev distance 2 of any stone (center if empty). */
export function candidateMoves(state: CaroState): number[] {
  const { size, board } = state;
  if (state.stoneCount === 0) return [centerIndex(size)];
  const near = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y * size + x] === EMPTY) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const cx = x + dx;
          const cy = y + dy;
          if (inBoard(size, cx, cy)) near[cy * size + cx] = 1;
        }
      }
    }
  }
  const out: number[] = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] === EMPTY && near[i] === 1) out.push(i);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Static evaluation (search leaves)
// ---------------------------------------------------------------------------

function runMaterialValue(len: number, openEnds: number): number {
  if (len >= 5) return len >= 6 || openEnds >= 1 ? 500_000 : 400; // dead five
  if (len === 4) return openEnds === 2 ? 120_000 : openEnds === 1 ? 18_000 : 50;
  if (len === 3) return openEnds === 2 ? 5_000 : openEnds === 1 ? 350 : 20;
  if (len === 2) return openEnds === 2 ? 180 : openEnds === 1 ? 30 : 5;
  return openEnds === 2 ? 10 : 2;
}

/** Sum of run values over all maximal runs of `color` (run starts only). */
function runMaterial(state: CaroState, color: Player): number {
  const { size, board } = state;
  let total = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y * size + x] !== color) continue;
      for (const [dx, dy] of DIRECTIONS) {
        const px = x - dx;
        const py = y - dy;
        if (inBoard(size, px, py) && board[py * size + px] === color) continue;
        let len = 0;
        let cx = x;
        let cy = y;
        while (inBoard(size, cx, cy) && board[cy * size + cx] === color) {
          len++;
          cx += dx;
          cy += dy;
        }
        let openEnds = 0;
        if (inBoard(size, px, py) && board[py * size + px] === EMPTY) openEnds++;
        if (inBoard(size, cx, cy) && board[cy * size + cx] === EMPTY) openEnds++;
        total += runMaterialValue(len, openEnds);
      }
    }
  }
  return total;
}

/** Leaf score from the side-to-move's perspective: material plus the
 *  best immediate threat each side holds (the mover realizes theirs first,
 *  which the negamax sign convention accounts for). */
function staticEval(state: CaroState, doubleBonus: boolean): number {
  const me = state.turn;
  const opp = opponent(me);
  let myBest = 0;
  let oppBest = 0;
  for (const idx of candidateMoves(state)) {
    const a = attackScore(state, idx, me, doubleBonus).score;
    if (a > myBest) myBest = a;
    const b = attackScore(state, idx, opp, doubleBonus).score;
    if (b > oppBest) oppBest = b;
  }
  return (
    runMaterial(state, me) - runMaterial(state, opp) + myBest - oppBest * 0.92
  );
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

interface LevelCfg {
  mode: "random" | "greedy" | "search";
  blunder: number; // greedy: probability of a random candidate instead
  noise: number; // greedy: uniform score jitter amplitude
  defW: number; // weight of the opponent's attack when scoring a cell
  tactics: boolean; // exact immediate win / block hard-wired
  depth: number; // search plies
  topK: number; // search branching cap
  doubleBonus: boolean;
  rootNoise: number; // search: root ordering jitter (opening variety)
}

const LEVELS: Record<number, LevelCfg> = {
  1: { mode: "random", blunder: 1, noise: 0, defW: 0, tactics: false, depth: 0, topK: 0, doubleBonus: true, rootNoise: 0 },
  2: { mode: "greedy", blunder: 0.5, noise: 4000, defW: 0.5, tactics: false, depth: 0, topK: 0, doubleBonus: true, rootNoise: 0 },
  3: { mode: "greedy", blunder: 0.28, noise: 1500, defW: 0.7, tactics: false, depth: 0, topK: 0, doubleBonus: true, rootNoise: 0 },
  4: { mode: "greedy", blunder: 0.14, noise: 600, defW: 0.85, tactics: false, depth: 0, topK: 0, doubleBonus: true, rootNoise: 0 },
  5: { mode: "greedy", blunder: 0.05, noise: 200, defW: 0.95, tactics: true, depth: 0, topK: 0, doubleBonus: true, rootNoise: 0 },
  6: { mode: "greedy", blunder: 0, noise: 60, defW: 1.0, tactics: true, depth: 0, topK: 0, doubleBonus: true, rootNoise: 0 },
  7: { mode: "search", blunder: 0, noise: 0, defW: 1.0, tactics: true, depth: 2, topK: 12, doubleBonus: false, rootNoise: 500 },
  8: { mode: "search", blunder: 0, noise: 0, defW: 1.0, tactics: true, depth: 2, topK: 18, doubleBonus: true, rootNoise: 400 },
  9: { mode: "search", blunder: 0, noise: 0, defW: 1.0, tactics: true, depth: 3, topK: 12, doubleBonus: true, rootNoise: 300 },
  10: { mode: "search", blunder: 0, noise: 0, defW: 1.0, tactics: true, depth: 3, topK: 18, doubleBonus: true, rootNoise: 250 },
  11: { mode: "search", blunder: 0, noise: 0, defW: 1.0, tactics: true, depth: 4, topK: 12, doubleBonus: true, rootNoise: 200 },
  12: { mode: "search", blunder: 0, noise: 0, defW: 1.0, tactics: true, depth: 4, topK: 18, doubleBonus: true, rootNoise: 150 },
};

function levelCfg(level: number): LevelCfg {
  const lv = Math.max(1, Math.min(12, Math.round(level)));
  return LEVELS[lv];
}

/** Combined greedy score of a cell: my attack + weighted denial value. */
function moveScore(
  state: CaroState,
  idx: number,
  color: Player,
  cfg: LevelCfg
): number {
  const atk = attackScore(state, idx, color, cfg.doubleBonus).score;
  if (cfg.defW === 0) return atk;
  const def = attackScore(state, idx, opponent(color), cfg.doubleBonus).score;
  return atk + cfg.defW * def;
}

/** Candidates ordered by the side-to-move's combined score (own attack +
 *  weighted denial of the opponent's attack), capped at topK. The denial
 *  term is essential: a pure-attack ordering can push the one critical
 *  BLOCKING cell below the cap, and the search then hallucinates a forced
 *  win through it. Blocking cells sit on the opponent's best attack cells,
 *  so the combined score always keeps them in the list. */
function orderedCandidates(state: CaroState, cfg: LevelCfg): number[] {
  const me = state.turn;
  const scored = candidateMoves(state).map((idx) => ({
    idx,
    s: moveScore(state, idx, me, cfg),
  }));
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, cfg.topK).map((c) => c.idx);
}

/** Negamax alpha-beta; returns the value for the player to move. */
function negamax(
  state: CaroState,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  cfg: LevelCfg
): number {
  const status = state.result.status;
  if (status === "draw") return 0;
  if (status !== "ongoing") return -(WIN_SCORE - ply); // side to move has lost
  if (depth === 0) return staticEval(state, cfg.doubleBonus);

  let best = -Infinity;
  for (const idx of orderedCandidates(state, cfg)) {
    applyMove(state, idx);
    const v = -negamax(state, depth - 1, -beta, -alpha, ply + 1, cfg);
    undoMove(state);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * Pick a move for the side to move at the given level (1..12).
 * Returns -1 when the game is over / no move exists.
 * Deterministic given `rng` (default Math.random).
 */
export function chooseMove(
  state: CaroState,
  level: number,
  rng: () => number = Math.random
): number {
  if (state.result.status !== "ongoing") return -1;
  const cfg = levelCfg(level);
  const me = state.turn;
  const cands = candidateMoves(state);
  if (cands.length === 0) return -1;

  if (cfg.mode === "random") {
    return cands[(rng() * cands.length) | 0];
  }

  // Exact tactics: win now; else block the opponent's winning cell.
  if (cfg.tactics) {
    const win = findWinningMove(state, me);
    if (win >= 0) return win;
    const block = findWinningMove(state, opponent(me));
    if (block >= 0) return block;
  }

  if (cfg.mode === "greedy") {
    if (rng() < cfg.blunder) {
      return cands[(rng() * cands.length) | 0];
    }
    let best = cands[0];
    let bestScore = -Infinity;
    for (const idx of cands) {
      const s = moveScore(state, idx, me, cfg) + rng() * cfg.noise;
      if (s > bestScore) {
        bestScore = s;
        best = idx;
      }
    }
    return best;
  }

  // Search: order root moves by the combined heuristic (+ jitter so
  // self-play openings vary), then negamax each within the top-K.
  const scored = cands
    .map((idx) => ({
      idx,
      s: moveScore(state, idx, me, cfg) + rng() * cfg.rootNoise,
    }))
    .sort((a, b) => b.s - a.s)
    .slice(0, cfg.topK);

  let best = scored[0].idx;
  let bestVal = -Infinity;
  let alpha = -Infinity;
  for (const { idx } of scored) {
    applyMove(state, idx);
    const v = -negamax(state, cfg.depth - 1, -Infinity, -alpha, 1, cfg);
    undoMove(state);
    if (v > bestVal) {
      bestVal = v;
      best = idx;
    }
    if (v > alpha) alpha = v;
  }
  return best;
}

/** Small seedable PRNG (mulberry32) — handy for tests and replays. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
