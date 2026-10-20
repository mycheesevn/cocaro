// Replay-to-video export for Cờ Ca-rô: re-render a game on canvas —
// notebook board, ballpoint marks popping in one by one — capture it
// with canvas.captureStream + MediaRecorder, and return a video file.
// Fully client-side; Safari records MP4, Chrome records WebM.
//
// Family timeline (user directive):
//   intro 2.0s WITH site CTA → moves → decisive finish → 2.2s celebration
//   (final board full-bright + result banner + confetti, NO card overlay)
//   → outro exactly 2.0s with the CTA.

import { STR } from "./i18n";
import { drawCanvasBoard, drawCanvasPiece } from "./pieceCanvas";
import {
  applyMove,
  colorOfPlayer,
  initialState,
  matchMove,
  parsePosition,
  type Color,
  type Lang,
  type Position,
} from "./engineApi";

export interface ReplayVideoInput {
  /** Move labels (e.g. "H8") of the game, in order. */
  /** Move tokens (cell indices as strings), in play order. */
  moves: string[];
  /** Serialized start position (omit = empty board, size from moves). */
  startPos?: string;
  /** The board is drawn from this player's perspective. */
  playerColor: Color;
  title: string;
  subtitle: string;
  lang: Lang;
  /** Moves per second multiplier. */
  speed?: number;
  micStream?: MediaStream | null;
  signal?: AbortSignal;
  onProgress?: (p: number) => void;
}

const W = 1080;
const H = 1350; // portrait — matches the share card
const BOARD = 900;
const BX = (W - BOARD) / 2;
const BY = 210;

const INK_DEEP = "#0b6e8f";
const INK_ACCENT = "#2FA8D2";
const CTA = "#ffd166";

function drawChrome(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = INK_DEEP;
  ctx.fillRect(0, 0, W, H);
}

function drawIntro(ctx: CanvasRenderingContext2D, title: string, subtitle: string, site: string) {
  drawChrome(ctx);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "bold 84px system-ui, sans-serif";
  ctx.fillText("✖️⭕", W / 2, 420);
  ctx.font = "bold 64px system-ui, sans-serif";
  wrapText(ctx, title, W / 2, 560, W - 120, 72);
  ctx.font = "40px system-ui, sans-serif";
  ctx.fillStyle = "#bdeefc";
  wrapText(ctx, subtitle, W / 2, 700, W - 120, 48);
  ctx.font = "bold 44px system-ui, sans-serif";
  ctx.fillStyle = CTA;
  ctx.fillText(site, W / 2, H - 160);
}

function drawOutro(ctx: CanvasRenderingContext2D, site: string, lang: Lang) {
  const s = STR[lang];
  drawChrome(ctx);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "bold 72px system-ui, sans-serif";
  ctx.fillText("✖️ " + s.gameName, W / 2, 480);
  ctx.font = "40px system-ui, sans-serif";
  ctx.fillStyle = "#bdeefc";
  ctx.fillText(s.playNow, W / 2, 580);
  ctx.font = "bold 52px system-ui, sans-serif";
  ctx.fillStyle = CTA;
  ctx.fillText(site, W / 2, H - 200);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lh: number,
) {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (ctx.measureText(t).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
}

/** Deterministic confetti particles for the celebration beat. */
function makeConfetti(n: number) {
  const colors = ["#2FA8D2", "#ffd166", "#ffffff", "#d92b2b", "#1a5fc1"];
  let seed = 1234567;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  return Array.from({ length: n }, () => ({
    x: rnd() * W,
    y: -40 - rnd() * 300,
    vy: 3 + rnd() * 5,
    vx: -2 + rnd() * 4,
    rot: rnd() * Math.PI * 2,
    vr: -0.1 + rnd() * 0.2,
    w: 8 + rnd() * 10,
    h: 6 + rnd() * 8,
    color: colors[Math.floor(rnd() * colors.length)],
  }));
}

export async function exportReplayVideo(input: ReplayVideoInput): Promise<File> {
  const {
    moves: moveTokens,
    startPos,
    playerColor,
    title,
    subtitle,
    lang,
    speed = 1,
    signal,
    onProgress,
  } = input;
  const s = STR[lang];
  const site = typeof window !== "undefined" ? window.location.origin : "";

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const stream = canvas.captureStream(30);
  const mime = MediaRecorder.isTypeSupported("video/mp4")
    ? "video/mp4"
    : "video/webm";
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const done = new Promise<void>((res) => {
    rec.onstop = () => res();
  });
  rec.start();

  const checkAbort = () => {
    if (signal?.aborted) throw new Error("cancelled");
  };
  const sleep = (ms: number) =>
    new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, ms / speed);
      signal?.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new Error("cancelled"));
      });
    });

  const flip = playerColor === "o";
  const start: Position = startPos
    ? parsePosition(startPos) ?? initialState()
    : initialState();
  const size = start.size;

  // Resolve the move labels against the real engine once.
  const moves: { idx: number; who: Color }[] = [];
  {
    let pos = start;
    for (const label of moveTokens) {
      const m = matchMove(pos, label);
      if (!m) throw new Error(`Illegal move in replay: ${label}`);
      moves.push({ idx: m.path[0], who: colorOfPlayer(pos.turn) });
      pos = applyMove(pos, m).state;
    }
  }
  const finalPos = moves.reduce(
    (p, mv) => applyMove(p, { path: [mv.idx], captured: [] }).state,
    start
  );

  /** Draw the board from a raw cell snapshot, optionally popping one mark. */
  const drawFrame = (
    cells: ArrayLike<number>,
    opts?: {
      lastIdx?: number | null;
      highlight?: number[] | null;
      popIdx?: number | null;
      popScale?: number;
      popColor?: Color;
    }
  ) => {
    drawChrome(ctx);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "bold 44px system-ui, sans-serif";
    ctx.fillText(title, W / 2, 110);
    ctx.font = "30px system-ui, sans-serif";
    ctx.fillStyle = "#bdeefc";
    ctx.fillText(subtitle, W / 2, 155);
    const drawCells = opts?.popIdx != null ? Array.from(cells) : cells;
    if (opts?.popIdx != null) (drawCells as number[])[opts.popIdx] = 0;
    drawCanvasBoard(ctx, {
      x: BX,
      y: BY,
      span: BOARD,
      size,
      cells: drawCells,
      highlight: opts?.highlight ?? null,
      lastIdx: opts?.lastIdx ?? null,
      gridColor: INK_ACCENT,
    });
    if (opts?.popIdx != null && opts.popColor) {
      const margin = BOARD * 0.055;
      const cell = (BOARD - margin * 2) / (size - 1);
      const col = opts.popIdx % size;
      const row = Math.floor(opts.popIdx / size);
      const dc = flip ? size - 1 - col : col;
      const dr = flip ? size - 1 - row : row;
      const cx = BX + margin + dc * cell;
      const cy = BY + margin + dr * cell;
      const scale = opts.popScale ?? 1;
      drawCanvasPiece(ctx, opts.popColor, cx, cy, cell * 0.92 * scale);
    }
    ctx.fillStyle = CTA;
    ctx.textAlign = "center";
    ctx.font = "bold 34px system-ui, sans-serif";
    ctx.fillText(site.replace(/^https?:\/\//, ""), W / 2, H - 60);
  };

  const totalBeats = 2 + moves.length + 2; // intro + moves + celebration + outro
  let beat = 0;
  const progress = () => onProgress?.(beat / totalBeats);

  try {
    // Intro 2.0s WITH site CTA.
    drawIntro(ctx, title, subtitle, site.replace(/^https?:\/\//, ""));
    beat++;
    progress();
    await sleep(2000);

    // Moves: each mark pops in (scale 0.4 → 1.08 → 1.0), then settles.
    const cells = Array.from(start.board);
    drawFrame(cells);
    await sleep(250);
    for (const mv of moves) {
      checkAbort();
      const frames = 6;
      for (let f = 1; f <= frames; f++) {
        const t = f / frames;
        const scale = t < 0.7 ? 0.4 + (t / 0.7) * 0.68 : 1.08 - ((t - 0.7) / 0.3) * 0.08;
        drawFrame(cells, { popIdx: mv.idx, popScale: scale, popColor: mv.who, lastIdx: mv.idx });
        await sleep(26);
      }
      cells[mv.idx] = mv.who === "x" ? 1 : 2;
      drawFrame(cells, { lastIdx: mv.idx });
      beat++;
      progress();
      await sleep(240);
    }

    // Decisive finish: hold the final board, then 2.2s celebration
    // (full-bright board + result banner + confetti, NO card overlay).
    const winnerColor: Color | null =
      finalPos.result.winner !== 0
        ? colorOfPlayer(finalPos.result.winner)
        : null;
    const winRun = finalPos.result.winningRun;
    drawFrame(cells, { highlight: winRun, lastIdx: null });
    await sleep(600);
    const banner = winnerColor
      ? winnerColor === playerColor
        ? s.youWin
        : s.youLose
      : s.draw;
    const confetti = makeConfetti(140);
    const t0 = performance.now();
    while (performance.now() - t0 < 2200) {
      checkAbort();
      drawFrame(cells, { highlight: winRun, lastIdx: null });
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      const bw = 760;
      ctx.fillRect((W - bw) / 2, 60, bw, 110);
      ctx.fillStyle = CTA;
      ctx.textAlign = "center";
      ctx.font = "bold 56px system-ui, sans-serif";
      ctx.fillText(banner, W / 2, 135);
      for (const p of confetti) {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y > H + 40) {
          p.y = -40;
          p.x = Math.random() * W;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      await sleep(33);
    }
    beat += 2;
    progress();

    // Outro exactly 2.0s with the CTA.
    drawOutro(ctx, site.replace(/^https?:\/\//, ""), lang);
    await sleep(2000);
  } finally {
    rec.stop();
  }
  await done;
  const ext = mime === "video/mp4" ? "mp4" : "webm";
  return new File(chunks, `co-ca-ro-replay.${ext}`, { type: mime });
}
