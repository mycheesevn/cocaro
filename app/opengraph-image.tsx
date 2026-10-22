import { ImageResponse } from "next/og";

export const alt = "Cờ Ca-rô — Gomoku";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#0e7fa8";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#14100c",
          padding: "64px 72px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              width: 120,
              height: 10,
              borderRadius: 5,
              backgroundColor: ACCENT,
              marginBottom: 44,
            }}
          />
          <div
            style={{
              fontSize: 76,
              fontWeight: 700,
              color: "#ffffff",
              lineHeight: 1.15,
            }}
          >
            Cờ Ca-rô — Gomoku
          </div>
          <div
            style={{
              marginTop: 28,
              fontSize: 34,
              color: "#d6cfc4",
              lineHeight: 1.4,
            }}
          >
            Chơi cờ ca-rô với máy 12 cấp độ trên bàn 10×10, 15×15, 20×20. Song ngữ Việt/Anh, miễn phí.
          </div>
        </div>
        <div
          style={{
            fontSize: 26,
            color: ACCENT,
          }}
        >
          SynerWorlds · Chơi miễn phí trên trình duyệt · Free to play in your browser
        </div>
      </div>
    ),
    { ...size },
  );
}
