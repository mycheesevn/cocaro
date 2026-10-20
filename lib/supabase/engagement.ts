import { createClient } from "./client";
import { standardStartSerialized } from "@/lib/caro/engineApi";

export interface CheckinResult {
  streak: number;
  xp_awarded: number;
  already_claimed: boolean;
}

export async function claimCheckin(): Promise<CheckinResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("cr_claim_checkin");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    streak: row.streak,
    xp_awarded: row.xp_awarded,
    already_claimed: row.already_claimed,
  };
}

export async function checkinHistory(): Promise<{ date: string; streak: number }[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cr_checkins")
    .select("checkin_date, streak")
    .order("checkin_date", { ascending: false })
    .limit(7);
  if (error) throw error;
  return (data ?? []).map((r: { checkin_date: string; streak: number }) => ({
    date: r.checkin_date,
    streak: r.streak,
  }));
}

export async function recordGameResult(
  color: "x" | "o",
  level: number,
  result: "win" | "loss" | "draw",
  plies: number,
  moves: string = "",
  startPos: string = standardStartSerialized(),
  boardSize: number = 15
): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("cr_record_game_result", {
    p_color: color,
    p_level: level,
    p_result: result,
    p_plies: plies,
    p_moves: moves,
    p_start_pos: startPos,
    p_board_size: boardSize,
  });
  if (error) throw error;
  return data as number;
}

export interface CaroGameRow {
  id: string;
  player_color: string;
  ai_level: number;
  /** Board size the game was played on (10/15/20). */
  board_size: number;
  result: string;
  plies: number;
  moves: string;
  start_pos?: string | null;
  created_at: string;
}

/** Save a finished computer-vs-computer game to the user's history
 *  WITHOUT touching stats/XP/rating (CvC is a spectator tool). The
 *  row is marked player_color = 'cvc' so HistoryView can label it,
 *  exclude it from the personal W/L tally, and title its videos
 *  correctly; result is stored from X's (the first player's) point of view. The
 *  cr_games "self" RLS policy (FOR ALL, own rows) allows the
 *  direct insert — no RPC and no migration needed. */
export async function saveCvcGame(
  userId: string,
  args: { level: number; result: "win" | "loss" | "draw"; moves: string[]; startPos: string; boardSize: number }
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("cr_games").insert({
    user_id: userId,
    player_color: "cvc",
    ai_level: args.level,
    board_size: args.boardSize,
    result: args.result,
    plies: args.moves.length,
    moves: args.moves.join(" "),
    start_pos: args.startPos,
  });
  if (error) throw error;
}

/** All-time W/L/D totals across the user's vs-computer games
 *  (PacClone History parity). CvC spectator rows are excluded —
 *  they aren't the user's results. Counts every row, not just the
 *  history page's fetch window. */
export async function fetchGameStats(userId: string): Promise<{
  wins: number;
  losses: number;
  draws: number;
}> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cr_games")
    .select("result")
    .eq("user_id", userId)
    .neq("player_color", "cvc");
  if (error) throw error;
  let wins = 0,
    losses = 0,
    draws = 0;
  for (const r of (data ?? []) as { result: string }[]) {
    if (r.result === "win") wins++;
    else if (r.result === "loss") losses++;
    else draws++;
  }
  return { wins, losses, draws };
}

export interface CaroRatingPoint {
  rating: number;
  xp: number;
  created_at: string;
}

/** Rating snapshots (migration 019), oldest first — feeds the
 *  History sparkline. Empty until 019 runs / games are recorded. */
export async function fetchCaroRatingHistory(
  userId: string,
  limit = 200
): Promise<CaroRatingPoint[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cr_rating_history")
    .select("rating, xp, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as CaroRatingPoint[];
}

export async function fetchGameHistory(limit = 100): Promise<CaroGameRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cr_games")
    .select("id, player_color, ai_level, board_size, result, plies, moves, start_pos, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as CaroGameRow[];
}

export interface LeaderboardRow {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  xp: number;
  rating: number;
  games_played: number;
  wins: number;
}

export async function fetchLeaderboard(limit = 50): Promise<LeaderboardRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cr_stats")
    .select("xp, rating, games_played, wins, user:profiles!inner(id, username, full_name, avatar_url)")
    .order("rating", { ascending: false })
    .order("xp", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as unknown as Array<{
    xp: number;
    rating: number;
    games_played: number;
    wins: number;
    user: { id: string; username: string | null; full_name: string | null; avatar_url: string | null };
  }>).map((r) => ({
    id: r.user.id,
    username: r.user.username,
    full_name: r.user.full_name,
    avatar_url: r.user.avatar_url,
    xp: r.xp,
    rating: r.rating,
    games_played: r.games_played,
    wins: r.wins,
  }));
}

/** 1-based rank of a user, mirroring the board's order exactly
 *  (rating desc, XP desc as the tiebreak). Null with no stats row. */
export async function fetchMyRank(userId: string): Promise<number | null> {
  const supabase = createClient();
  const { data: me } = await supabase
    .from("cr_stats")
    .select("rating, xp")
    .eq("user_id", userId)
    .maybeSingle();
  if (!me) return null;
  const myRating = (me as { rating: number }).rating ?? 800;
  const myXp = (me as { xp: number }).xp ?? 0;
  const higher = await supabase
    .from("cr_stats")
    .select("user_id", { count: "exact", head: true })
    .gt("rating", myRating);
  const tiedHigherXp = await supabase
    .from("cr_stats")
    .select("user_id", { count: "exact", head: true })
    .eq("rating", myRating)
    .gt("xp", myXp);
  return (higher.count ?? 0) + (tiedHigherXp.count ?? 0) + 1;
}

export interface CaroStats {
  xp: number;
  rating: number;
  /** Peak rating (migration 017); falls back to rating before it lands. */
  peak_rating: number;
  games_played: number;
  wins: number;
}

export async function fetchMyStats(userId: string): Promise<CaroStats | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cr_stats")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (error) return null;
  const row = data as CaroStats & { peak_rating?: number | null };
  return {
    xp: row.xp ?? 0,
    rating: row.rating ?? 800,
    peak_rating: row.peak_rating ?? row.rating ?? 800,
    games_played: row.games_played ?? 0,
    wins: row.wins ?? 0,
  };
}
