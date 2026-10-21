// Canvas share cards: (1) a result card rendering the notebook board
// with the same painter as the in-app board (drawCanvasBoard), and
// (2) a room promo card with the big join code. Cyan family branding.

import type { Color, Position } from "./engineApi";
import { drawCanvasBoard, drawCanvasPiece } from "./pieceCanvas";

const SIZE = 1080;
const BOARD_PAD = 90;
const BOARD_SIZE = SIZE - BOARD_PAD * 2;

const INK_DEEP = "#0b6e8f";

export interface ShareCardOpts {
  pos: Position;
  playerColor: Color;
  headline: string; // e.g. "You won!"
  subline: string; // e.g. "Beat Level 5 · 34 moves"
  appName: string;
  appUrl: string;
}

export async function renderShareCard(opts: ShareCardOpts): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;

  // Background: deep cyan.
  const bg = ctx.createLinearGradient(0, 0, 0, SIZE);
  bg.addColorStop(0, "#0d7ea6");
  bg.addColorStop(1, INK_DEEP);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Headline
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 64px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(opts.headline, SIZE / 2, 110);

  ctx.fillStyle = "#bdeefc";
  ctx.font = "40px system-ui, sans-serif";
  ctx.fillText(opts.subline, SIZE / 2, 165);

  // Board (rotate 180° when the player sits at O so their marks are
  // at the bottom, matching the in-app flipped view).
  const size = opts.pos.size;
  const flipped = opts.playerColor === "o";
  const cells = Array.from(opts.pos.board);
  if (flipped) cells.reverse();
  drawCanvasBoard(ctx, {
    x: BOARD_PAD,
    y: 210,
    span: BOARD_SIZE,
    size,
    cells,
    highlight: opts.pos.result.winningRun,
    lastIdx:
      opts.pos.moves.length > 0
        ? opts.pos.moves[opts.pos.moves.length - 1]
        : null,
  });

  // Footer
  ctx.fillStyle = "#bdeefc";
  ctx.font = "32px system-ui, sans-serif";
  ctx.fillText(`${opts.appName} · ${opts.appUrl}`, SIZE / 2, SIZE - 40);

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}

export async function shareCard(
  blob: Blob,
  title: string,
  text: string,
  url: string,
  fileName = "caro-result.png"
) {
  const file = new File([blob], fileName, { type: "image/png" });
  // The shared text itself must carry the (canonical) URL — some share
  // targets drop the separate `url` field when files are attached.
  const shareText = text.includes(url) ? text : `${text} ${url}`;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title, text: shareText, url });
    return "shared";
  }
  // Fallback: download + copy link
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  try {
    await navigator.clipboard.writeText(shareText);
  } catch {
    /* clipboard unavailable */
  }
  return "downloaded";
}

// ---------------------------------------------------------------------------
// Room promo card (PacClone anatomy, Caro cyan branding)
// ---------------------------------------------------------------------------

export interface RoomPromoInput {
  /** Room display name. */
  roomName: string;
  /** Join code, e.g. "X7K2P". */
  code: string;
  /** "Phòng có 3 thành viên" style member line. */
  memberLine: string;
  /** Footer CTA, e.g. "👉 Thách đấu ngay tại cocaro.synerworlds.com". */
  footer: string;
  lang: "vi" | "en";
}

/** Convert a canvas to a PNG Blob. */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/png"
    );
  });
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Render a shareable room-promo card (no board, big join code) to a canvas.
 * Branded header, room name + member line, giant code panel, decorative
 * X/O medallions, footer CTA — plus the SynerWork "S" mark under the panel.
 */
export function renderRoomPromoCard(input: RoomPromoInput): HTMLCanvasElement {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Background: deep cyan gradient (caro brand).
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0d7ea6");
  bg.addColorStop(0.5, "#0b6e8f");
  bg.addColorStop(1, "#084a61");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Frame.
  ctx.strokeStyle = "#7fd4f2";
  ctx.lineWidth = 6;
  ctx.strokeRect(18, 18, W - 36, H - 36);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Header.
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 72px Georgia, 'Times New Roman', serif";
  ctx.fillText(input.lang === "vi" ? "✖️ CỜ CA-RÔ" : "✖️ GOMOKU", W / 2, 110);
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 52px system-ui, sans-serif";
  const name =
    input.roomName.length > 28 ? input.roomName.slice(0, 27) + "…" : input.roomName;
  ctx.fillText(name, W / 2, 205, W - 120);
  ctx.fillStyle = "#bdeefc";
  ctx.font = "400 36px system-ui, sans-serif";
  ctx.fillText(input.memberLine, W / 2, 270, W - 120);

  // Big code panel (white notebook paper).
  const pw = 720;
  const ph = 420;
  const px = (W - pw) / 2;
  const py = 370;
  ctx.fillStyle = "#ffffff";
  roundRectPath(ctx, px, py, pw, ph, 24);
  ctx.fill();
  ctx.strokeStyle = "#2FA8D2";
  ctx.lineWidth = 4;
  roundRectPath(ctx, px, py, pw, ph, 24);
  ctx.stroke();
  ctx.fillStyle = "#5b7d8c";
  ctx.font = "600 40px system-ui, sans-serif";
  ctx.fillText(input.lang === "vi" ? "MÃ PHÒNG" : "ROOM CODE", W / 2, py + 88);
  ctx.fillStyle = "#12303c";
  ctx.font = "800 130px system-ui, sans-serif";
  ctx.fillText(input.code, W / 2, py + 228);
  ctx.fillStyle = "#5b7d8c";
  ctx.font = "400 32px system-ui, sans-serif";
  ctx.fillText(
    input.lang === "vi" ? "Nhập mã để vào phòng" : "Enter the code to join",
    W / 2,
    py + 348
  );

  // Decorative X/O medallions.
  const medallions: Array<"x" | "o"> = ["x", "o", "x"];
  medallions.forEach((color, i) => {
    const cx = W / 2 + (i - 1) * 170;
    const cy = 935;
    ctx.beginPath();
    ctx.arc(cx, cy, 52, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#2FA8D2";
    ctx.stroke();
    drawCanvasPiece(ctx, color, cx, cy, 92);
  });

  // SynerWork "S" mark (two shards: red + blue) under the medallions.
  const sCx = W / 2;
  const sCy = 1062;
  const sS = 34;
  const shard = (
    pts: Array<[number, number]>,
    color: string
  ) => {
    ctx.beginPath();
    pts.forEach(([qx, qy], k) => {
      const x = sCx + (qx - 247) * (sS / 500);
      const y = sCy + (qy - 252) * (sS / 500);
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  shard(
    [[240, 50], [95, 360], [240, 450]],
    "#FF0000"
  );
  shard(
    [[255, 105], [398, 368], [255, 453]],
    "#0000FF"
  );
  ctx.fillStyle = "#bdeefc";
  ctx.font = "400 26px system-ui, sans-serif";
  ctx.fillText("SynerWork Inc.", W / 2, sCy + 52);

  // Footer CTA.
  ctx.fillStyle = "#ffd166";
  ctx.font = "600 40px system-ui, sans-serif";
  ctx.fillText(input.footer, W / 2, 1200, W - 120);

  return canvas;
}
