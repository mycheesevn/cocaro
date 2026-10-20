// Tiny assertion helper for the engine test suites (mirrors caro).

export interface Counts {
  pass: number;
  fail: number;
}

export function newCounts(): Counts {
  return { pass: 0, fail: 0 };
}

export function check(
  counts: Counts,
  name: string,
  cond: boolean,
  extra = ""
): void {
  if (cond) {
    counts.pass++;
    console.log(`  ok   ${name}`);
  } else {
    counts.fail++;
    console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`);
  }
}
