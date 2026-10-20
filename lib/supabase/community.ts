import { createClient } from "./client";

/** A community puzzle card (cr_community_puzzle_cards / _card RPC row). */
export interface CommunityPuzzleCard {
  id: string;
  title: string;
  /** Serialized start position (`cr1:<size>:<turn>:<cells>`). */
  pos: string;
  /** Board size (10/15/20), denormalized from pos for list display. */
  board_size: number;
  moves_to_mate: number;
  /** Space-separated acceptable solution cell indices (a SET). */
  solution: string;
  solves: number;
  likes: number;
  is_featured: boolean;
  creator_id: string;
  creator_name: string;
  liked_by_me: boolean;
  solved_by_me: boolean;
  created_at: string;
}

export type CommunitySort = "new" | "popular" | "weekly" | "mine";

export async function fetchCommunityPuzzles(
  sort: CommunitySort,
  limit = 10,
  offset = 0
): Promise<CommunityPuzzleCard[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("cr_community_puzzle_cards", {
    p_sort: sort,
    p_limit: limit,
    p_offset: offset,
    p_mine: sort === "mine",
  });
  if (error) throw error;
  return (data ?? []) as CommunityPuzzleCard[];
}

export async function fetchCommunityPuzzle(
  id: string
): Promise<CommunityPuzzleCard | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("cr_community_puzzle_card", {
    p_id: id,
  });
  if (error) throw error;
  const rows = (data ?? []) as CommunityPuzzleCard[];
  return rows[0] ?? null;
}

/** Record a solve. Returns the XP earned by the solver (0 if none). */
export async function solveCommunityPuzzle(id: string): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("cr_solve_community_puzzle", {
    p_id: id,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function toggleCommunityLike(
  id: string
): Promise<{ liked: boolean; likes: number }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("cr_toggle_community_like", {
    p_id: id,
  });
  if (error) throw error;
  return data as { liked: boolean; likes: number };
}

export async function publishCommunityPuzzle(input: {
  title: string;
  pos: string;
  /** Board size of the position (10/15/20). */
  boardSize: number;
  solution: string;
}): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { data, error } = await supabase
    .from("cr_community_puzzles")
    .insert({
      creator_id: user.id,
      title: input.title.slice(0, 60),
      pos: input.pos,
      board_size: input.boardSize,
      moves_to_mate: 1,
      solution: input.solution,
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function renameCommunityPuzzle(
  id: string,
  title: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("cr_community_puzzles")
    .update({ title: title.slice(0, 60) })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteCommunityPuzzle(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("cr_community_puzzles")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
