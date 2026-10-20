import { iconPngResponse } from "@/lib/caro/iconResponse";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return iconPngResponse(180, "bleed");
}
