import { iconPngResponse } from "@/lib/caro/iconResponse";
import type { IconVariant } from "@/lib/caro/iconSvg";

const FILES: Record<string, { size: number; variant: IconVariant }> = {
  "icon-192.png": { size: 192, variant: "rounded" },
  "icon-512.png": { size: 512, variant: "rounded" },
  "icon-maskable.png": { size: 512, variant: "maskable" },
  "apple-touch-icon.png": { size: 180, variant: "bleed" },
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;
  const entry = FILES[file];
  if (!entry) return new Response("Not found", { status: 404 });
  const res = iconPngResponse(entry.size, entry.variant);
  res.headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return res;
}
