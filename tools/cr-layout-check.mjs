/**
 * Cờ Ca-rô layout fixture: boots the production build (next start) as a
 * guest and measures board geometry across Play / Daily puzzle / Setup /
 * CvC (launched from Setup) / Library lesson views, desktop + mobile,
 * plus boot checks (no h-overflow) for the Rooms / Correspondence /
 * Community list views. Asserts the family shell invariants:
 *  - every board renders through .cr-board-area > .cr-board-fit,
 *  - the board is square, fully inside the viewport, same size in
 *    every board view,
 *  - no page-level horizontal overflow, no unfiltered console errors.
 * The RoomMatch board is NOT guest-fixtureable (needs a signed-in room
 * member); it renders through the same .cr-board-area > .cr-board-fit
 * chain (components/caro/RoomMatchView.tsx) whose geometry is asserted
 * here for every other view.
 * Usage: node tools/cr-layout-check.mjs [baseUrl]
 */
import { chromium } from "playwright-core";

const BASE = process.argv[2] || "http://localhost:3141";
const CHROME = "/home/hatch/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome";

async function measure(browser, viewport, tag) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + String(e).split("\n")[0]));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text().slice(0, 140));
  });
  await page.goto(BASE, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(1500);

  const grab = () =>
    page.evaluate(() => {
      const r = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return {
          x: Math.round(b.x), y: Math.round(b.y),
          w: Math.round(b.width), h: Math.round(b.height),
          bottom: Math.round(b.bottom), right: Math.round(b.right),
        };
      };
      return {
        boardFit: r(".cr-board-fit"),
        boardSvg: r(".cr-board-svg"),
        panel: r(".cr-panel"),
        innerW: window.innerWidth,
        innerH: window.innerHeight,
        bodyScrollW: document.body.scrollWidth,
      };
    });

  const views = {};
  views.play = await grab();
  await page.screenshot({ path: `/tmp/cr-layout-${tag}-play.png` });

  // Drawer navigation: first .cr-drawer-modes group = NAV_ENTRIES order
  // [play, puzzle, library, setup, history, ranks, rooms, corr, ...]
  const openMode = async (idx) => {
    await page.click('button[aria-label="Menu"]');
    await page.waitForSelector(".cr-drawer-modes button", { timeout: 5000 });
    await page.evaluate((i) => {
      document.querySelectorAll(".cr-drawer-modes")[0]
        .querySelectorAll("button")[i].click();
    }, idx);
    await page.waitForTimeout(900);
  };
  await openMode(1); // daily puzzle
  views.puzzle = await grab();
  await page.screenshot({ path: `/tmp/cr-layout-${tag}-puzzle.png` });
  await openMode(3); // setup
  views.setup = await grab();
  await page.screenshot({ path: `/tmp/cr-layout-${tag}-setup.png` });
  // CvC: launched from the Setup start form (family rule: CvC lives only
  // inside Setup). .cr-setup-actions order: Start, CvC, Reset, Clear.
  await page.evaluate(() => {
    document.querySelectorAll(".cr-setup-actions button")[1]?.click();
  });
  await page.waitForTimeout(1200);
  views.cvc = await grab();
  await page.screenshot({ path: `/tmp/cr-layout-${tag}-cvc.png` });
  await openMode(2); // library — open the first unlocked lesson for its board
  await page.evaluate(() => {
    document.querySelector(".cr-lib-lesson:not([disabled])")?.click();
  });
  await page.waitForTimeout(900);
  views.library = await grab();
  await page.screenshot({ path: `/tmp/cr-layout-${tag}-library.png` });
  await openMode(6); // rooms (list view, no board — boot check only)
  views.rooms = await grab();
  await openMode(7); // correspondence (list view — boot check only)
  views.corr = await grab();
  await openMode(9); // community puzzles (list view — boot check only)
  views.community = await grab();
  await page.close();

  const real = errors.filter(
    (e) =>
      !e.includes("ERR_") && !e.includes("favicon") && !e.includes("Failed to fetch") &&
      !e.includes("WebSocket") && !e.includes("net::") && !e.includes("supabase") &&
      !e.includes("localhost") && !e.includes("Load failed")
  );
  return { views, real };
}

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
let fail = 0;
const check = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}`);
  if (!cond) fail++;
};

for (const [tag, vp] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const { views, real } = await measure(browser, vp, tag);
  console.log(`--- ${tag} ${vp.width}x${vp.height} ---`);
  for (const v of ["play", "puzzle", "setup", "cvc", "library"]) {
    const m = views[v];
    check(!!m.boardFit, `${tag}/${v}: board-fit present`);
    if (!m.boardFit) continue;
    check(Math.abs(m.boardFit.w - m.boardFit.h) <= 2, `${tag}/${v}: board square (${m.boardFit.w}x${m.boardFit.h})`);
    check(m.boardFit.y >= 0 && m.boardFit.bottom <= m.innerH + 1,
      `${tag}/${v}: board fully in viewport (y=${m.boardFit.y}, bottom=${m.boardFit.bottom}/${m.innerH})`);
    check(m.boardFit.x >= 0 && m.boardFit.right <= m.innerW + 1,
      `${tag}/${v}: board not clipped horizontally (right=${m.boardFit.right}/${m.innerW})`);
    check(m.bodyScrollW <= m.innerW + 1, `${tag}/${v}: no page h-overflow (${m.bodyScrollW}/${m.innerW})`);
  }
  const sizes = ["play", "puzzle", "setup", "cvc", "library"].map((v) => views[v].boardFit?.w ?? -1);
  check(Math.max(...sizes) - Math.min(...sizes) <= 2,
    `${tag}: board same size across views (${sizes.join("/")})`);
  check(views.rooms.bodyScrollW <= views.rooms.innerW + 1, `${tag}/rooms: boots, no h-overflow`);
  check(views.corr.bodyScrollW <= views.corr.innerW + 1, `${tag}/corr: boots, no h-overflow`);
  check(views.community.bodyScrollW <= views.community.innerW + 1, `${tag}/community: boots, no h-overflow`);
  check(real.length === 0, `${tag}: no console/page errors${real.length ? " — " + real.slice(0, 3).join(" | ") : ""}`);
}
await browser.close();
console.log(fail === 0 ? "LAYOUT FIXTURE: ALL PASS" : `LAYOUT FIXTURE: ${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
