import { createClient } from "./client";
import { fetchNames } from "./rooms";

/**
 * In-room private chat (family pattern, references/room-chat.md).
 * Room-scoped, members-only — distinct from the public per-move match
 * comments (cr_room_comments). Direct table access + RLS via
 * is_cr_room_member, no RPC, exactly like the comments path.
 * Display names resolve via the same fetchNames helper the comments
 * path uses.
 */

export interface RoomChatMessage {
  id: string;
  room_id: string;
  user_id: string;
  body: string;
  created_at: string;
  user_name?: string;
}

export const ROOM_CHAT_PAGE = 50;

/** Newest-first page (chronological for display); pass `before`
 *  (created_at) for load-more. */
export async function fetchRoomMessages(
  roomId: string,
  before?: string | null
): Promise<RoomChatMessage[]> {
  const supabase = createClient();
  let q = supabase
    .from("cr_room_messages")
    .select("id, room_id, user_id, body, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(ROOM_CHAT_PAGE);
  if (before) q = q.lt("created_at", before);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as RoomChatMessage[];
  const names = await fetchNames(rows.map((m) => m.user_id)).catch(
    (): Record<string, string> => ({})
  );
  return rows
    .map((m) => ({ ...m, user_name: names[m.user_id] ?? "…" }))
    .reverse();
}

export async function postRoomMessage(
  roomId: string,
  body: string
): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { error } = await supabase.from("cr_room_messages").insert({
    room_id: roomId,
    user_id: user.id,
    body: body.trim().slice(0, 500),
  });
  if (error) throw error;
}

/** Dedicated channel per room (Caro convention: one channel per
 *  feature, like room:/room-matches:/match:) — INSERT handler on
 *  cr_room_messages filtered by room_id. */
export function subscribeRoomMessages(
  roomId: string,
  onNew: (m: RoomChatMessage) => void
) {
  const supabase = createClient();
  return supabase
    .channel(`cr-room-chat:${roomId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "cr_room_messages",
        filter: `room_id=eq.${roomId}`,
      },
      (payload: { new: RoomChatMessage }) =>
        onNew(payload.new as RoomChatMessage)
    )
    .subscribe();
}
