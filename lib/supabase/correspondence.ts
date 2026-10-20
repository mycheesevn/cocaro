import { createClient } from "./client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface CorrGame {
  id: string;
  x_id: string;
  o_id: string;
  status: string;
  /** Comma-separated cell indices in play order. */
  moves: string;
  /** Board size chosen at creation (10 / 15 / 20). */
  board_size: number;
  result: string | null;
  winner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CorrGameRow extends CorrGame {
  x_name: string;
  o_name: string;
}

function displayName(p: { full_name?: string | null; username?: string | null } | null): string {
  return p?.full_name || p?.username || "Player";
}

export async function listMyCorrGames(): Promise<CorrGameRow[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("cr_corr_games")
    .select(
      "*, x:profiles!cr_corr_games_x_id_fkey(full_name, username), o:profiles!cr_corr_games_o_id_fkey(full_name, username)"
    )
    .or(`x_id.eq.${user.id},o_id.eq.${user.id}`)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return ((data ?? []) as unknown as Array<
    CorrGame & {
      x: { full_name?: string | null; username?: string | null } | null;
      o: { full_name?: string | null; username?: string | null } | null;
    }
  >).map((g) => ({
    ...g,
    x_name: displayName(g.x),
    o_name: displayName(g.o),
  }));
}

export async function createCorrGame(opponentId: string, boardSize = 15): Promise<CorrGame> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  if (opponentId === user.id) throw new Error("Cannot play yourself");
  // Randomize seats
  const iAmX = Math.random() < 0.5;
  const { data, error } = await supabase
    .from("cr_corr_games")
    .insert({
      x_id: iAmX ? user.id : opponentId,
      o_id: iAmX ? opponentId : user.id,
      board_size: boardSize,
    })
    .select()
    .single();
  if (error) throw error;
  return data as CorrGame;
}

export async function getCorrGame(id: string): Promise<CorrGame | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("cr_corr_games")
    .select("*")
    .eq("id", id)
    .single();
  return (data as CorrGame) ?? null;
}

export async function pushCorrMove(gameId: string, uciMoves: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("cr_corr_games")
    .update({ moves: uciMoves, updated_at: new Date().toISOString() })
    .eq("id", gameId)
    .eq("status", "active");
  if (error) throw error;
}

export async function finishCorrGame(
  gameId: string,
  result: "x" | "o" | "draw",
  winnerId: string | null
): Promise<void> {
  const supabase = createClient();
  await supabase
    .from("cr_corr_games")
    .update({
      status: "finished",
      result,
      winner_id: winnerId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", gameId);
}

export async function resignCorrGame(gameId: string): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const game = await getCorrGame(gameId);
  if (!game || game.status !== "active") return;
  const winnerId = game.x_id === user.id ? game.o_id : game.x_id;
  const result = game.x_id === user.id ? "o" : ("x" as const);
  await finishCorrGame(gameId, result, winnerId);
}

export function subscribeCorrGame(
  gameId: string,
  onUpdate: (g: CorrGame) => void
): RealtimeChannel {
  const supabase = createClient();
  return supabase
    .channel(`corr:${gameId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "cr_corr_games",
        filter: `id=eq.${gameId}`,
      },
      (payload: { new: CorrGame }) => onUpdate(payload.new as CorrGame)
    )
    .subscribe();
}
