// Test runner. From the caro workspace root:
//   bun lib/caro/tests/run.ts
// (or simply: node tools/verify-caro.mjs)
// Exits non-zero when any check fails.

import { runEngineTests } from "../engine.test";
import { runAiTests } from "../ai.test";

declare const process: { exit(code: number): void };

let pass = 0;
let fail = 0;
for (const suite of [runEngineTests, runAiTests]) {
  const r = suite();
  pass += r.pass;
  fail += r.fail;
}
console.log(`\nTOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
