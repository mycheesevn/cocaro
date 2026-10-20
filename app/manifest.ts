import { ICON_VERSION } from "@/lib/caro/iconSvg";
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "✖️ Cờ Ca-rô",
    short_name: "Cờ Ca-rô",
    description:
      "Play Gomoku (Cờ Ca-rô) against the computer with 12 difficulty levels, on 10×10, 15×15 or 20×20 notebook boards. Free online in Vietnamese and English.",
    lang: "vi",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b6e8f",
    theme_color: "#0b6e8f",
    icons: [
      {
        src: `/icon.svg?v=${ICON_VERSION}`,
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: `/apple-icon?v=${ICON_VERSION}`,
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
