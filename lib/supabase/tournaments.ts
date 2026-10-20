import { createClient } from "./client";

export interface Tournament {
  id: string;
  room_id: string;
  name: string;
  status: string;
  pairings: Array<{
    x: string;
    o: string;
    result: string | null;
    match_id?: string | null;
  }>;
}

export async function listTournaments(roomId: string): Promise<Tournament[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cr_tournaments")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Tournament[];
}

export async function createTournament(
  roomId: string,
  name: string
): Promise<Tournament> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("cr_create_tournament", {
    p_room_id: roomId,
    p_name: name,
  });
  if (error) throw error;
  return data as Tournament;
}

export function standings(t: Tournament): Array<{ player: string; score: number; wins: number; played: number }> {
  const scores = new Map<string, { score: number; wins: number; played: number }>();
  const acc = (id: string) => {
    let r = scores.get(id);
    if (!r) {
      r = { score: 0, wins: 0, played: 0 };
      scores.set(id, r);
    }
    return r;
  };
  for (const p of t.pairings) {
    if (!p.result) continue;
    const xp = acc(p.x);
    const op = acc(p.o);
    xp.played++;
    op.played++;
    if (p.result === "x") {
      xp.score += 1;
      xp.wins += 1;
    } else if (p.result === "o") {
      op.score += 1;
      op.wins += 1;
    } else if (p.result === "draw") {
      xp.score += 0.5;
      op.score += 0.5;
    }
  }
  return [...scores.entries()]
    .map(([player, s]) => ({ player, score: s.score, wins: s.wins, played: s.played }))
    .sort((a, b) => b.score - a.score || b.wins - a.wins);
}

/** Start the next unplayed pairing as a live match (leader, via RPC).
 *  Returns the created match id. */
export async function tournamentNextMatch(tournamentId: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("cr_tournament_next_match", {
    p_tournament_id: tournamentId,
  });
  if (error) throw error;
  return (data as { id: string }).id;
}

/** End an open tournament early (leader, via RPC). */
export async function cancelTournament(tournamentId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("cr_cancel_tournament", {
    p_tournament_id: tournamentId,
  });
  if (error) throw error;
}
