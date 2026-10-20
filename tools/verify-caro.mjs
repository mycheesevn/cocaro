// Verification entry point for the Cờ Ca-rô engine + AI.
// Runs the bun test suites (family workspace convention)
// and reports wall-clock time. Usage: node tools/verify-caro.mjs
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const t0 = Date.now();
const r = spawnSync("bun", ["lib/caro/tests/run.ts"], {
  cwd: root,
  stdio: "inherit",
});
if (r.error) {
  console.error("verify-caro: failed to launch bun:", r.error.message);
  process.exit(1);
}
console.log(
  `\nverify-caro: finished in ${((Date.now() - t0) / 1000).toFixed(1)}s`
);
process.exit(r.status ?? 1);
