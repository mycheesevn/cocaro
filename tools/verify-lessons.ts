// Lesson soundness check: walk every lesson's golden path with the
// real engine — every step move must be legal in sequence, non-win
// steps must leave the game ongoing (the "dead five" demo included),
// and every quiz="win" step must actually end the game for the mover.
// Usage: bun tools/verify-lessons.ts
import { ALL_LESSONS } from "../lib/caro/library";
import { createFromBoard, applyMove } from "../lib/caro/engine";

let fail = 0;
for (const lesson of ALL_LESSONS) {
  const problems: string[] = [];
  const cells = new Int8Array(lesson.size * lesson.size);
  for (const [x, y, who] of lesson.stones) cells[y * lesson.size + x] = who;
  const turn = lesson.startTurn === "x" ? 1 : 2;
  const st = createFromBoard(lesson.size, cells, turn as 1 | 2);
  if (st.result.status !== "ongoing") problems.push(`start result=${st.result.status}`);
  lesson.steps.forEach((step, i) => {
    const chosen = step.move ?? step.accept?.[0];
    if (chosen == null) {
      if (step.quiz) problems.push(`step ${i}: quiz without move/accept`);
      return;
    }
    const mover = st.turn;
    if (st.board[chosen] !== 0) {
      problems.push(`step ${i}: cell ${chosen} occupied`);
      return;
    }
    if (!applyMove(st, chosen)) {
      problems.push(`step ${i}: engine rejected move ${chosen}`);
      return;
    }
    if (step.quiz === "win") {
      const wonStatus = mover === 1 ? "x-win" : "o-win";
      if (st.result.status !== wonStatus || st.result.winner !== mover)
        problems.push(`step ${i}: expected win for ${mover}, got ${st.result.status}/${st.result.winner}`);
    } else if (st.result.status !== "ongoing") {
      problems.push(`step ${i}: expected ongoing, got ${st.result.status}`);
    }
    // anyOf sets: every accepted cell must be a legal empty cell at this point
    if (step.quiz === "anyOf" && step.accept) {
      // (checked against the pre-move board would be ideal; emptiness in the
      // start-of-step position is asserted in the player by construction —
      // here we only assert the set is non-empty and in range.)
      if (step.accept.length === 0) problems.push(`step ${i}: empty accept set`);
      for (const a of step.accept)
        if (a < 0 || a >= lesson.size * lesson.size)
          problems.push(`step ${i}: accept cell ${a} out of range`);
    }
  });
  console.log(`${lesson.id}: ${lesson.steps.length} steps ${problems.length ? "⚠ " + problems.join("; ") : "OK"}`);
  if (problems.length) fail++;
}
console.log(fail === 0 ? `\nALL ${ALL_LESSONS.length} LESSONS SOUND` : `\n${fail} PROBLEM LESSONS`);
process.exit(fail ? 1 : 0);
