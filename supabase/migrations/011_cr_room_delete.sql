-- 011_cr_room_delete.sql
-- Owner-only room deletion (family pattern,
-- references/room-delete.md in the boardgame-engagement skill).
--
-- Delete = permanent soft close (cr_rooms.status := 'closed'), never
-- hard DELETE. cr_room_members, cr_room_matches, cr_room_comments and
-- cr_room_messages all reference cr_rooms(id) on delete cascade, so a
-- hard DELETE would destroy finished-match history — NOT wanted.
--
-- The 'closed' state is the family's visibility gate:
-- cr_list_public_rooms, cr_room_leaderboard, cr_guest_room_detail and
-- cr_join_room all exclude closed rooms, and listMyRooms gains the
-- client-side closed filter alongside this feature (its join query shape
-- makes a server filter a bigger change). Closing makes the room vanish
-- everywhere: the in-game list, the hub, join-by-code, deep links and
-- guests.
--
-- Guards (server-side, never UI-only):
--   * owner-only: non-owner members and non-members are denied
--     (not_leader)
--   * active-match block: deleting while any cr_room_matches row is
--     status='active' is refused (match_in_progress); the UI maps it to
--     a visible message telling the leader to finish or cancel the match
--     first. Note the pre-existing cr_close_room had NO such guard —
--     this RPC closes that gap (the leader cancel-match control stays
--     the way to end a match).
--
-- IMPORTANT (the family production lesson): this migration does NOT
-- touch the is_cr_room_member / is_cr_room_leader helper grants — the
-- helpers must keep EXECUTE for authenticated AND anon (granted in 003).
--
-- There is no reopen path in the app, so closing here is effectively
-- irreversible by design.
--
-- NOTE: run AFTER 001–010 in the Dashboard SQL editor.

create or replace function public.cr_delete_room(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_active int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not is_cr_room_leader(p_room_id) then raise exception 'not_leader'; end if;
  select count(*) into v_active
  from cr_room_matches
  where room_id = p_room_id and status = 'active';
  if v_active > 0 then raise exception 'match_in_progress'; end if;
  update cr_rooms set status = 'closed' where id = p_room_id;
end $$;

revoke all on function public.cr_delete_room(uuid) from public;
revoke all on function public.cr_delete_room(uuid) from anon;
grant execute on function public.cr_delete_room(uuid) to authenticated;
