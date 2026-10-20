import { createClient } from "./client";

/** Record today's solve. Returns true if XP was newly awarded. */
export async function recordPuzzleSolve(puzzleDate: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("cr_record_puzzle_solve", {
    p_date: puzzleDate,
  });
  if (error) throw error;
  return data as boolean;
}

/** True if the signed-in user already solved the given puzzle date. */
export async function alreadySolved(puzzleDate: string): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase
    .from("cr_puzzle_solves")
    .select("puzzle_date")
    .eq("user_id", user.id)
    .eq("puzzle_date", puzzleDate)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}
