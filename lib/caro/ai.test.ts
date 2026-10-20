// AI tests: legality at every level, exact tactics (take the win, block
// the win), double-threat creation/defense at high levels, determinism,
// and ladder self-play (higher level must dominate lower).

import {
  CaroState,
  O,
  Player,
  X,
  applyMove,
  createFromBoard,
  createGame,
  getResult,
  idxOf,
} from "./engine";
import { attackScore, candidateMoves, chooseMove, findWinningMove, seededRng } from "./ai";
import { Counts, check, newCounts } from "./tests/assert";

function setup(
  size: number,
  stones: Array<[number, number, Player]>,
  turn: Player
): CaroState {
  const b = new Int8Array(size * size);
  for (const [x, y, s] of stones) b[idxOf(size, x, y)] = s;
  return createFromBoard(size, b, turn);
}

/** A quiet mid-game position with no immediate tactics for either side. */
function midGame(): CaroState {
  return setup(15, [
    [7, 7, X], [8, 7, O], [7, 8, O], [6, 6, X], [9, 9, X], [5, 5, O],
    [10, 6, O], [6, 10, X], [11, 11, O], [4, 8, X],
  ], X);
}

interface GameOutcome {
  winner: 0 | Player;
  moves: number;
}

function playGame(
  size: number,
  levelX: number,
  levelO: number,
  seed: number
): GameOutcome {
  const g = createGame(size);
  const rngX = seededRng(seed * 2 + 1);
  const rngO = seededRng(seed * 2 + 2);
  while (getResult(g).status === "ongoing") {
    const level = g.turn === X ? levelX : levelO;
    const mv = chooseMove(g, level, g.turn === X ? rngX : rngO);
    if (mv < 0 || !applyMove(g, mv)) {
      throw new Error(`illegal AI move ${mv} at level ${level}`);
    }
  }
  return { winner: getResult(g).winner, moves: g.moves.length };
}

export function runAiTests(): Counts {
  const c = newCounts();

  console.log("ai: legality at every level");
  {
    for (let level = 1; level <= 12; level++) {
      const g = midGame();
      const mv = chooseMove(g, level, seededRng(100 + level));
      check(c, `level ${level} returns an empty cell`, mv >= 0 && g.board[mv] === 0);
    }
    const empty = createGame(15);
    check(c, "level 12 opens at the center", chooseMove(empty, 12, seededRng(7)) === idxOf(15, 7, 7));
    check(c, "chooseMove on a finished game is -1", (() => {
      const done = setup(15, [[3, 7, X], [4, 7, X], [5, 7, X], [6, 7, X], [7, 7, X]], O);
      return chooseMove(done, 12, seededRng(1)) === -1;
    })());
    const a = chooseMove(midGame(), 10, seededRng(42));
    const b = chooseMove(midGame(), 10, seededRng(42));
    check(c, "deterministic for a fixed seed", a === b);
  }

  console.log("ai: exact tactics (level >= 5 hard-wired, checked at 6)");
  {
    // (a) Take an immediate win — open four, either end wins.
    const winOpen = setup(15, [
      [7, 7, X], [8, 7, X], [9, 7, X], [10, 7, X], [2, 2, O], [3, 3, O],
    ], X);
    const mv1 = chooseMove(winOpen, 6, seededRng(5));
    applyMove(winOpen, mv1);
    check(c, "takes the win from an open four", getResult(winOpen).status === "x-win");

    // (a2) Take an immediate win — gap four XXX_X has exactly one cell.
    const winGap = setup(15, [
      [7, 7, X], [8, 7, X], [9, 7, X], [11, 7, X], [2, 2, O], [3, 3, O],
    ], X);
    check(c, "gap-four winning cell is exact", chooseMove(winGap, 6, seededRng(5)) === idxOf(15, 10, 7));

    // (b) Block a four that has exactly one winning cell (blocked four).
    const blockFour = setup(15, [
      [6, 7, X], [7, 7, O], [8, 7, O], [9, 7, O], [10, 7, O], [2, 2, X],
    ], X);
    check(c, "blocks the blocked-four's only winning cell",
      chooseMove(blockFour, 6, seededRng(5)) === idxOf(15, 11, 7));

    // (b2) Block an open three at one of its two ends (else it becomes
    // an open four, which cannot be stopped by a single block).
    const blockThree = setup(15, [
      [7, 7, O], [8, 7, O], [9, 7, O], [2, 2, X], [12, 12, X],
    ], X);
    const mv2 = chooseMove(blockThree, 6, seededRng(5));
    check(c, "blocks an open three at an end",
      mv2 === idxOf(15, 6, 7) || mv2 === idxOf(15, 10, 7), `got ${mv2}`);

    // (b3) A "four" whose only extension makes a both-ends-blocked five
    // is DEAD under the Vietnamese rule: no winning move exists at all.
    const deadFour = setup(15, [
      [6, 7, X], [12, 7, X],
      [7, 7, O], [8, 7, O], [9, 7, O], [10, 7, O],
    ], O);
    check(c, "dead four has no winning move (exact rule)",
      findWinningMove(deadFour, O) === -1);
    const liveFour = setup(15, [
      [6, 7, X],
      [7, 7, O], [8, 7, O], [9, 7, O], [10, 7, O],
    ], O);
    check(c, "live blocked four has exactly its one winning move",
      findWinningMove(liveFour, O) === idxOf(15, 11, 7));
  }

  console.log("ai: double threats (nước đôi) at level >= 10");
  {
    // Creation: X to move. (9,7) completes a blocked four horizontally
    // (O at (5,7) caps the left) AND an open three vertically — two
    // threats at once; O can only answer one.
    const create = setup(15, [
      [5, 7, O],
      [6, 7, X], [7, 7, X], [8, 7, X],
      [9, 5, X], [9, 6, X],
      [2, 2, O], [13, 13, O],
    ], X);
    check(c, "level 10 creates the double threat",
      chooseMove(create, 10, seededRng(9)) === idxOf(15, 9, 7));
    check(c, "level 12 creates the double threat",
      chooseMove(create, 12, seededRng(9)) === idxOf(15, 9, 7));

    // Defense: same geometry for O — if O plays (9,7) next, X faces a
    // blocked four + open three. Correct defenses are exactly the moves
    // that collapse the double threat:
    //   (9,7)  the shared cell — kills both lines at once;
    //   (10,7) the four's only winning cell — the four becomes dead even
    //          if O takes (9,7), leaving a single three to block;
    //   (9,4) / (9,8) cap one end of the three — O's (9,7) then makes
    //          only a blocked three beside the four, and (10,7) is
    //          blocked next move.
    // Any other move loses: O takes (9,7), X stops the four, O converts
    // the open three to an open four and wins at the far end.
    const defend = setup(15, [
      [5, 7, X],
      [6, 7, O], [7, 7, O], [8, 7, O],
      [9, 5, O], [9, 6, O],
      [2, 2, X], [13, 13, X],
    ], X);
    const defenses = new Set([
      idxOf(15, 9, 7), idxOf(15, 10, 7), idxOf(15, 9, 4), idxOf(15, 9, 8),
    ]);
    for (const level of [10, 12]) {
      const mv = chooseMove(defend, level, seededRng(9));
      check(c, `level ${level} answers a looming double threat with a real defense`,
        defenses.has(mv), `got (${mv % 15},${(mv / 15) | 0})`);
      // Property: after the AI's move, O has no winning move and no
      // move creating two simultaneous threats anywhere.
      const after = setup(15, [
        [5, 7, X],
        [6, 7, O], [7, 7, O], [8, 7, O],
        [9, 5, O], [9, 6, O],
        [2, 2, X], [13, 13, X],
      ], X);
      applyMove(after, mv);
      let oDouble = false;
      for (const cell of candidateMoves(after)) {
        if (attackScore(after, cell, O, true).threats >= 2) oDouble = true;
      }
      check(c, `level ${level} defense leaves O no double threat and no win`,
        !oDouble && findWinningMove(after, O) === -1);
    }
  }

  console.log("ai: ladder self-play (15x15)");
  {
    // Level 10 vs level 3, 10 games alternating colors.
    let w10 = 0, w3 = 0, draws = 0;
    const lines: string[] = [];
    for (let i = 0; i < 10; i++) {
      const l10IsX = i % 2 === 0;
      const r = playGame(15, l10IsX ? 10 : 3, l10IsX ? 3 : 10, 1000 + i);
      if (r.winner === 0) draws++;
      else if ((r.winner === X) === l10IsX) w10++;
      else w3++;
      lines.push(`g${i + 1}:${r.winner === 0 ? "draw" : r.winner === X ? "X" : "O"}/${r.moves}`);
    }
    console.log(`    L10 vs L3: L10 ${w10} — L3 ${w3}, draws ${draws}  [${lines.join(" ")}]`);
    check(c, "level 10 wins the large majority vs level 3", w10 >= 8, `L10=${w10} L3=${w3} D=${draws}`);

    // Level 12 vs level 8, 6 games alternating colors.
    let w12 = 0, w8 = 0, d2 = 0;
    const lines2: string[] = [];
    for (let i = 0; i < 6; i++) {
      const l12IsX = i % 2 === 0;
      const r = playGame(15, l12IsX ? 12 : 8, l12IsX ? 8 : 12, 2000 + i);
      if (r.winner === 0) d2++;
      else if ((r.winner === X) === l12IsX) w12++;
      else w8++;
      lines2.push(`g${i + 1}:${r.winner === 0 ? "draw" : r.winner === X ? "X" : "O"}/${r.moves}`);
    }
    console.log(`    L12 vs L8: L12 ${w12} — L8 ${w8}, draws ${d2}  [${lines2.join(" ")}]`);
    check(c, "level 12 beats level 8 head-to-head", w12 > w8, `L12=${w12} L8=${w8} D=${d2}`);
  }

  return c;
}
