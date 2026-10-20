import { ImageResponse } from "next/og";
import { createElement } from "react";
import { caroIconSvg, type IconVariant } from "./iconSvg";

/**
 * Renders the app icon SVG to a PNG response at the requested size.
 * Used by the apple-icon route and the /pwa icon routes — the PNG files
 * in the repo stay unnecessary: one SVG source of truth, PNGs on demand.
 */
export function iconPngResponse(size: number, variant: IconVariant) {
  const svg = caroIconSvg(variant);
  const src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  return new ImageResponse(
    createElement(
      "div",
      { style: { display: "flex", width: size, height: size } },
      createElement("img", { src, width: size, height: size, alt: "" })
    ),
    { width: size, height: size }
  );
}
