import { createClient } from "./client";

export interface Quest {
  id: string;
  xp: number;
}

export const QUESTS: { id: string; xp: number }[] = [
  { id: "play_1", xp: 20 },
  { id: "win_1", xp: 20 },
  { id: "join_room", xp: 20 },
];

export async function claimWelcome(): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("cr_claim_welcome");
  if (error) throw error;
  return data as boolean;
}

export async function claimQuest(questId: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("cr_claim_quest", {
    p_quest_id: questId,
  });
  if (error) throw error;
  return data as boolean;
}

export async function claimedQuests(): Promise<Set<string>> {
  const supabase = createClient();
  const { data } = await supabase.from("cr_quests").select("quest_id");
  return new Set((data ?? []).map((r: { quest_id: string }) => r.quest_id));
}
