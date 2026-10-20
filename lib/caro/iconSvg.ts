// App icon: a page of ô-ly notebook paper — white sheet, cyan grid,
// a blue ballpoint X and a red ballpoint O on the intersections — on
// the family's deep-cyan ground. Instantly reads as Cờ Ca-rô.
//
// Variants:
// - rounded:  favicon / general use (transparent corners, framed)
// - bleed:    full-bleed square (apple touch icon — iOS applies its mask)
// - maskable: full-bleed with the artwork inside the maskable safe zone

export type IconVariant = "rounded" | "bleed" | "maskable";

/** Bump this whenever the icon artwork changes. Home-screen icons are
 * snapshots (an installed shortcut never re-reads the icon), and the
 * /pwa PNG routes are served with a 1-year immutable cache — the ONLY
 * way existing devices ever fetch a new icon is a new URL, so every
 * icon URL carries `?v=${ICON_VERSION}` (manifest + layout metadata). */
export const ICON_VERSION = 2;

export function caroIconSvg(variant: IconVariant = "rounded"): string {
  const bleed = variant !== "rounded";
  const frame = bleed
    ? { x: 0, y: 0, w: 512, rx: 0 }
    : { x: 6, y: 6, w: 500, rx: 112 };
  const contentScale = variant === "maskable" ? 0.82 : 1;
  // Notebook sheet: white paper inset on the cyan ground, cyan grid
  // lines through the intersections, X (blue) top-left, O (red) bottom-right.
  const sheet = `
    <rect x="86" y="86" width="340" height="340" rx="26" fill="#ffffff"/>
    <g stroke="#2FA8D2" stroke-width="7" opacity="0.85">
      <line x1="86" y1="171" x2="426" y2="171"/>
      <line x1="86" y1="256" x2="426" y2="256"/>
      <line x1="86" y1="341" x2="426" y2="341"/>
      <line x1="171" y1="86" x2="171" y2="426"/>
      <line x1="256" y1="86" x2="256" y2="426"/>
      <line x1="341" y1="86" x2="341" y2="426"/>
    </g>
    <g stroke="#1a5fc1" stroke-width="21" stroke-linecap="round">
      <line x1="140" y1="140" x2="202" y2="202"/>
      <line x1="202" y1="140" x2="140" y2="202"/>
    </g>
    <circle cx="341" cy="341" r="33" fill="none" stroke="#d92b2b" stroke-width="19"/>`;
  const content =
    contentScale === 1
      ? sheet
      : `<g transform="translate(256 256) scale(${contentScale}) translate(-256 -256)">${sheet}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <clipPath id="iconClip"><rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.w}" rx="${frame.rx}"/></clipPath>
    <radialGradient id="bgCyan" cx="0.35" cy="0.3" r="1.1">
      <stop offset="0" stop-color="#1290bd"/><stop offset="1" stop-color="#0b6e8f"/>
    </radialGradient>
  </defs>
  <g clip-path="url(#iconClip)">
    <rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.w}" fill="url(#bgCyan)"/>
    ${content}
  </g>
</svg>`;
}
