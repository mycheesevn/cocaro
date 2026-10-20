"use client";

import { useState } from "react";
import { renderShareCard, shareCard } from "@/lib/caro/shareCard";
import type { Color, Lang, Position } from "@/lib/caro/engineApi";
import type { GameOverReason } from "./CaroGame";
import { STR } from "@/lib/caro/i18n";

interface Props {
  gameOver: {
    winner: Color | null;
    draw: boolean;
    reason: GameOverReason;
  };
  playerColor: Color;
  level: number;
  moves: number;
  pos: Position;
  lang: Lang;
  onNewGame: () => void;
  onExportVideo?: () => void;
}

export function GameOverPanel({
  gameOver,
  playerColor,
  level,
  moves,
  pos,
  lang,
  onNewGame,
  onExportVideo,
}: Props) {
  const [sharing, setSharing] = useState(false);
  const s = STR[lang];
  const won = !gameOver.draw && gameOver.winner === playerColor;

  const headline = gameOver.draw
    ? lang === "vi"
      ? "Hòa! 🤝"
      : "Draw! 🤝"
    : gameOver.reason === "flag"
      ? won
        ? lang === "vi"
          ? "⏱ Đối thủ hết giờ — bạn thắng!"
          : "⏱ Opponent flagged — you win!"
        : lang === "vi"
          ? "⏱ Bạn hết giờ — bạn thua!"
          : "⏱ You flagged — you lose!"
      : won
        ? lang === "vi"
          ? "Bạn thắng! 🏆"
          : "You won! 🏆"
        : lang === "vi"
          ? "Bạn thua — phục thù nào!"
          : "You lost — rematch?";

  const doShare = async () => {
    setSharing(true);
    try {
      const blob = await renderShareCard({
        pos,
        playerColor,
        headline,
        subline:
          lang === "vi"
            ? `Thắng máy cấp ${level} · ${moves} nước đi`
            : `Beat level ${level} · ${moves} moves`,
        appName: "Cờ Ca-rô · Caro",
        appUrl: window.location.origin,
      });
      await shareCard(blob, headline, headline, window.location.origin);
    } catch {
      /* share cancelled or failed */
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="cr-gameover">
      <div className="cr-gameover-card">
        <h3>{headline}</h3>
        <div className="cr-gameover-actions">
          <button
            type="button"
            className="cr-btn cr-btn-primary"
            onClick={doShare}
            disabled={sharing}
          >
            📤 {s.achShare}
          </button>
          {onExportVideo && (
            <button type="button" className="cr-btn" onClick={onExportVideo}>
              🎬 {lang === "vi" ? "Xuất video" : "Video"}
            </button>
          )}
          <button type="button" className="cr-btn" onClick={onNewGame}>
            {lang === "vi" ? "Ván mới" : "New game"}
          </button>
        </div>
      </div>
    </div>
  );
}
