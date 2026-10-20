// Puzzle soundness check: every builtin puzzle is ongoing, has at least
// one engine-computed solution cell, win puzzles give the opponent no
// immediate win, block puzzles face a real immediate threat.
// Usage: bun tools/verify-puzzles.ts
import { PUZZLES, puzzlePosition, solutionCells } from "../lib/caro/puzzles";
import { findWinningMove } from "../lib/caro/ai";

let fail = 0;
for (const p of PUZZLES) {
  const st = puzzlePosition(p);
  const sols = solutionCells(p);
  const opp = st.turn === 1 ? 2 : 1;
  const oppThreat = findWinningMove(st, opp as 1 | 2);
  const problems: string[] = [];
  if (st.result.status !== "ongoing") problems.push(`result=${st.result.status}`);
  if (sols.length === 0) problems.push("NO solutions");
  if (p.kind === "win" && oppThreat !== -1) problems.push(`opponent also threatens at ${oppThreat}`);
  if (p.kind === "block" && oppThreat === -1) problems.push("block puzzle but opponent has NO immediate win");
  const xs = p.stones.filter((s) => s[2] === 1).length;
  const os = p.stones.filter((s) => s[2] === 2).length;
  console.log(
    `${p.id} kind=${p.kind} turn=${p.turn} X=${xs} O=${os} solutions=[${sols.join(",")}]${problems.length ? "  ⚠ " + problems.join("; ") : ""}`
  );
  if (problems.length) fail++;
}
console.log(fail === 0 ? `\nALL ${PUZZLES.length} PUZZLES SOUND` : `\n${fail} PROBLEM PUZZLES`);
process.exit(fail ? 1 : 0);
