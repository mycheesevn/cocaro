-- 010_cr_room_chat.sql
-- In-room private chat (family pattern,
-- references/room-chat.md in the boardgame-engagement skill).
--
-- Room-scoped chat for game rooms: members of a room (players AND
-- spectators) can message each other inside the room. Only room members
-- can read or post. This is NOT the per-move match comments
-- (cr_room_comments, public, tied to a match + move number); room chat
-- is a separate, member-only stream that lives for the room, not a match.
--
-- Direct table access + RLS via is_cr_room_member, no RPC — mirrors
-- cr_room_comments exactly (select/insert policies via the membership
-- helper). v1 is insert-only, so the default replica identity suffices.
--
-- IMPORTANT (the family production lesson): the two RLS helpers
-- is_cr_room_member / is_cr_room_leader must KEEP execute for
-- authenticated AND anon (003 grants both roles). Policy expressions
-- evaluate with the caller's privileges — revoking them broke every room
-- query in a sibling game. This migration does NOT touch helper grants.
--
-- NOTE: run AFTER 001–009 in the Dashboard SQL editor.

create table if not exists cr_room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references cr_rooms(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists cr_room_messages_room_idx
  on cr_room_messages (room_id, created_at);

alter table cr_room_messages enable row level security;

drop policy if exists "cr_messages member read" on cr_room_messages;
create policy "cr_messages member read" on cr_room_messages
  for select using (is_cr_room_member(room_id));

drop policy if exists "cr_messages member write" on cr_room_messages;
create policy "cr_messages member write" on cr_room_messages
  for insert with check (is_cr_room_member(room_id) and auth.uid() = user_id);

do $$ begin
  alter publication supabase_realtime add table public.cr_room_messages;
exception when duplicate_object then null;
end $$;
