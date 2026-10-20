import { createClient } from "@/lib/supabase/client";

export interface SavedSetup {
  id: string;
  name: string;
  pos: string;
  /** Board size (10/15/20), denormalized from pos for list display. */
  board_size: number;
  created_at: string;
}

/** Saved board setups from the setup editor. Signed-in users store
 *  them in cr_setups (migration 018, self-RLS) so they follow the
 *  account; guests fall back to localStorage on this device. */
const LS_KEY = "cr-saved-setups";

/** Board size encoded in a serialized position (cr1:<size>:…). */
function parsePosSize(pos: string): number {
  const m = /^cr1:(10|15|20):/.exec(pos);
  return m ? parseInt(m[1], 10) : 15;
}

function lsRead(): SavedSetup[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? (JSON.parse(raw) as SavedSetup[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function lsWrite(list: SavedSetup[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export async function listSavedSetups(userId: string | null): Promise<SavedSetup[]> {
  if (!userId) return lsRead();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cr_setups")
    .select("id, name, pos, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SavedSetup[];
}

export async function saveSetup(
  userId: string | null,
  name: string,
  pos: string
): Promise<SavedSetup> {
  const boardSize = parsePosSize(pos);
  if (!userId) {
    const row: SavedSetup = {
      id: `local-${Date.now()}`,
      name,
      pos,
      board_size: boardSize,
      created_at: new Date().toISOString(),
    };
    lsWrite([row, ...lsRead()]);
    return row;
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cr_setups")
    .insert({ user_id: userId, name, pos, board_size: boardSize })
    .select("id, name, pos, board_size, created_at")
    .single();
  if (error) throw error;
  return data as SavedSetup;
}

export async function deleteSetup(userId: string | null, id: string): Promise<void> {
  if (!userId) {
    lsWrite(lsRead().filter((x) => x.id !== id));
    return;
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("cr_setups")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}
