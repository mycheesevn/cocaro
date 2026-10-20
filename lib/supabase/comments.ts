import { createClient } from "./client";

export interface RoomComment {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  user_name?: string;
  avatar_url?: string | null;
  move_number?: number | null;
}

export async function fetchComments(matchId: string): Promise<RoomComment[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cr_room_comments")
    .select("id, user_id, body, created_at, move_number, user:profiles!inner(full_name, username, avatar_url)")
    .eq("match_id", matchId)
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) throw error;
  return ((data ?? []) as unknown as Array<
    RoomComment & { user: { full_name: string | null; username: string | null; avatar_url: string | null } }
  >).map((c) => ({
    id: c.id,
    user_id: c.user_id,
    body: c.body,
    created_at: c.created_at,
    user_name: c.user.full_name || c.user.username || "Player",
    avatar_url: c.user.avatar_url,
    move_number: (c as { move_number?: number | null }).move_number ?? null,
  }));
}

export async function postComment(
  roomId: string,
  matchId: string,
  body: string,
  moveNumber?: number | null
): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { error } = await supabase.from("cr_room_comments").insert({
    room_id: roomId,
    match_id: matchId,
    user_id: user.id,
    body: body.slice(0, 500),
    ...(moveNumber != null ? { move_number: moveNumber } : {}),
  });
  if (error) throw error;
}

export async function sendReaction(
  roomId: string,
  matchId: string,
  emoji: string
): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await supabase.from("cr_match_reactions").insert({
    room_id: roomId,
    match_id: matchId,
    user_id: user.id,
    emoji,
  });
}

/** Fetch a comment author's display info (avatars + names for
 *  realtime comment rows, which arrive without the profile join). */
export async function fetchCommentAuthor(
  userId: string
): Promise<{ user_name: string; avatar_url: string | null }> {
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("full_name, username, avatar_url")
    .eq("id", userId)
    .single();
  const p = (data ?? {}) as {
    full_name?: string | null;
    username?: string | null;
    avatar_url?: string | null;
  };
  return {
    user_name: p.full_name || p.username || "Player",
    avatar_url: p.avatar_url ?? null,
  };
}

export function subscribeComments(
  matchId: string,
  onNew: (c: RoomComment) => void
) {
  const supabase = createClient();
  return supabase
    .channel(`caro-comments:${matchId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "cr_room_comments",
        filter: `match_id=eq.${matchId}`,
      },
      (payload: { new: RoomComment }) => onNew(payload.new as RoomComment)
    )
    .subscribe();
}

export function subscribeReactions(
  matchId: string,
  onNew: (emoji: string) => void
) {
  const supabase = createClient();
  return supabase
    .channel(`caro-reactions:${matchId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "cr_match_reactions",
        filter: `match_id=eq.${matchId}`,
      },
      (payload: { new: { emoji: string } }) => onNew(payload.new.emoji)
    )
    .subscribe();
}
