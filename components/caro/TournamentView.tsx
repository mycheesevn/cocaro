"use client";

import { useEffect, useState } from "react";
import {
  cancelTournament,
  createTournament,
  listTournaments,
  standings,
  tournamentNextMatch,
  type Tournament,
} from "@/lib/supabase/tournaments";
import { roomErrorKey } from "@/lib/supabase/rooms";
import { useAuth } from "./AuthProvider";
import type { Lang } from "@/lib/caro/engineApi";

function errText(key: string, lang: Lang): string {
  const vi: Record<string, string> = {
    not_enough_players: "Cần ít nhất 3 người chơi để tạo giải.",
    tournament_in_progress: "Đang có giải chưa kết thúc.",
    match_in_progress: "Đang có ván đấu diễn ra.",
    not_leader: "Chỉ trưởng phòng mới làm được.",
    tournament_finished: "Giải đã kết thúc.",
    generic: "Có lỗi xảy ra.",
  };
  const en: Record<string, string> = {
    not_enough_players: "Need at least 3 players for a tournament.",
    tournament_in_progress: "A tournament is already open.",
    match_in_progress: "A match is in progress.",
    not_leader: "Only the room leader can do this.",
    tournament_finished: "The tournament is finished.",
    generic: "Something went wrong.",
  };
  return (lang === "vi" ? vi : en)[key] ?? (lang === "vi" ? vi.generic : en.generic);
}

export function TournamentView({
  roomId,
  isLeader,
  lang,
  names,
  reloadSignal,
  onViewMatch,
  playersCount,
  onOpenTournamentChange,
}: {
  roomId: string;
  isLeader: boolean;
  lang: Lang;
  names: Record<string, string>;
  reloadSignal?: number;
  onViewMatch?: (matchId: string) => void;
  /** Players in the match order — create is gated at 3+ (PacClone pattern). */
  playersCount?: number;
  /** Reports whether any tournament is open (hides the casual start button). */
  onOpenTournamentChange?: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState<string | null>(null);

  const load = () => {
    listTournaments(roomId)
      .then((ts) => {
        setTournaments(ts);
        onOpenTournamentChange?.(ts.some((t) => t.status === "open"));
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (user) load();
  }, [roomId, user, reloadSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null;

  const nameOf = (id: string) => names[id] ?? "Player";
  const hasOpen = tournaments.some((t) => t.status === "open");
  const enoughPlayers = (playersCount ?? 0) >= 3;

  const doCreate = async () => {
    setMsg("");
    setBusy(true);
    try {
      await createTournament(
        roomId,
        name.trim() || (lang === "vi" ? "Giải đấu" : "Tournament")
      );
      setName("");
      load(); // refetch + report open state to the room detail
    } catch (e) {
      setMsg(errText(roomErrorKey(e), lang));
    } finally {
      setBusy(false);
    }
  };

  const doNext = async (t: Tournament) => {
    setMsg("");
    setBusy(true);
    try {
      const matchId = await tournamentNextMatch(t.id);
      load();
      onViewMatch?.(matchId);
    } catch (e) {
      setMsg(errText(roomErrorKey(e), lang));
    } finally {
      setBusy(false);
    }
  };

  const doEnd = async (t: Tournament) => {
    setBusy(true);
    try {
      await cancelTournament(t.id);
      setConfirmEnd(null);
      load();
    } catch (e) {
      setMsg(errText(roomErrorKey(e), lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cr-tournaments">
      <h3>🏆 {lang === "vi" ? "Giải đấu" : "Tournaments"}</h3>
      {isLeader && !hasOpen && (
        <div className="cr-room-form">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={lang === "vi" ? "Tên giải" : "Tournament name"}
            className="cr-input"
          />
          <button
            type="button"
            className="cr-btn cr-btn-sm"
            disabled={busy || !enoughPlayers}
            onClick={doCreate}
            title={enoughPlayers ? undefined : errText("not_enough_players", lang)}
          >
            {lang === "vi" ? "Tạo giải" : "Create"}
          </button>
        </div>
      )}
      {msg && <p className="cr-msg">{msg}</p>}
      {tournaments.slice(0, 3).map((t) => {
        const played = t.pairings.filter((p) => p.result).length;
        return (
          <div key={t.id} className="cr-tournament">
            <div className="cr-tournament-head">
              <strong>{t.name}</strong>
              <span className="cr-hint">
                {t.status === "open"
                  ? lang === "vi"
                    ? `Đang diễn ra · ${played}/${t.pairings.length} ván`
                    : `Open · ${played}/${t.pairings.length} games`
                  : lang === "vi"
                    ? "Đã kết thúc"
                    : "Finished"}
              </span>
            </div>
            <ol className="cr-board-list">
              {standings(t).map((s, i) => (
                <li key={s.player} className="cr-lb-row">
                  <span className="cr-lb-rank">#{i + 1}</span>
                  <span className="cr-lb-name">{nameOf(s.player)}</span>
                  <span className="cr-lb-xp">
                    {s.score} {lang === "vi" ? "điểm" : "pts"}
                    {" · "}
                    {s.wins}
                    {lang === "vi" ? " thắng" : "W"}
                  </span>
                </li>
              ))}
            </ol>
            <div className="cr-pairings">
              {t.pairings.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  className="cr-pairing"
                  disabled={!p.match_id}
                  onClick={() => p.match_id && onViewMatch?.(p.match_id)}
                  title={p.match_id ? (lang === "vi" ? "Xem ván này" : "View this game") : ""}
                >
                  <span>
                    ✕ {nameOf(p.x)} · ◯ {nameOf(p.o)}
                  </span>
                  <span>
                    {p.result === "x"
                      ? "1–0"
                      : p.result === "o"
                        ? "0–1"
                        : p.result === "draw"
                          ? "½–½"
                          : p.match_id
                            ? "👁"
                            : "…"}
                  </span>
                </button>
              ))}
            </div>
            {isLeader && t.status === "open" && (
              <div className="cr-row-gap">
                <button
                  type="button"
                  className="cr-btn cr-btn-primary cr-btn-sm"
                  disabled={busy}
                  onClick={() => doNext(t)}
                >
                  ▶ {lang === "vi" ? "Ván tiếp theo" : "Next match"}
                </button>
                {confirmEnd === t.id ? (
                  <button
                    type="button"
                    className="cr-btn cr-btn-sm cr-btn-danger"
                    disabled={busy}
                    onClick={() => doEnd(t)}
                  >
                    {lang === "vi" ? "Xác nhận kết thúc?" : "Confirm end?"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="cr-btn cr-btn-sm"
                    onClick={() => setConfirmEnd(t.id)}
                  >
                    {lang === "vi" ? "Kết thúc giải" : "End tournament"}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
