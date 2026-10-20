-- 004_cr_room_play.sql — Caro room matches, comments, reactions,
-- tournaments, the room XP ledger, membership/match/tournament RPCs, the
-- comment-XP trigger, and guest discovery RPCs.
-- Run in the Dashboard SQL editor AFTER 003. Idempotent.
--
-- Match result vocabulary: 'x' | 'o' | 'draw' (from the FIRST seat's
-- — X's — point of view). Every match starts from the EMPTY board at
-- the room's board_size (serialized start_pos, X to move). Match moves
-- are space-separated zero-based cell indices in play order.

create table if not exists cr_room_matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references cr_rooms(id) on delete cascade,
  x_id uuid references profiles(id),
  o_id uuid references profiles(id),
  status text not null default 'active'
    check (status in ('active', 'finished', 'cancelled')),
  moves text not null default '',
  board_size int not null default 15 check (board_size in (10, 15, 20)),
  start_pos text not null
    default 'cr1:15:1:000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
  result text check (result in ('x', 'o', 'draw')),
  reason text,
  winner_id uuid references profiles(id),
  tournament_id uuid,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table cr_room_matches enable row level security;
alter table cr_room_matches
  add column if not exists board_size int not null default 15
  check (board_size in (10, 15, 20));
drop policy if exists "cr_matches member read" on cr_room_matches;
create policy "cr_matches member read" on cr_room_matches
  for select using (is_cr_room_member(room_id));
drop policy if exists "cr_matches player update" on cr_room_matches;
create policy "cr_matches player update" on cr_room_matches
  for update using (
    status = 'active' and (auth.uid() = x_id or auth.uid() = o_id));

create table if not exists cr_room_comments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references cr_rooms(id) on delete cascade,
  match_id uuid references cr_room_matches(id) on delete cascade,
  move_number int not null default 0,
  user_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
alter table cr_room_comments enable row level security;
drop policy if exists "cr_comments member read" on cr_room_comments;
create policy "cr_comments member read" on cr_room_comments
  for select using (is_cr_room_member(room_id));
drop policy if exists "cr_comments member write" on cr_room_comments;
create policy "cr_comments member write" on cr_room_comments
  for insert with check (is_cr_room_member(room_id) and auth.uid() = user_id);

create table if not exists cr_match_reactions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references cr_rooms(id) on delete cascade,
  match_id uuid not null references cr_room_matches(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now()
);
alter table cr_match_reactions enable row level security;
drop policy if exists "cr_reactions member" on cr_match_reactions;
create policy "cr_reactions member" on cr_match_reactions
  for all using (is_cr_room_member(room_id));

create table if not exists cr_tournaments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references cr_rooms(id) on delete cascade,
  name text not null,
  status text not null default 'open' check (status in ('open', 'finished')),
  pairings jsonb not null default '[]',
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table cr_tournaments enable row level security;
drop policy if exists "cr_tournaments member read" on cr_tournaments;
create policy "cr_tournaments member read" on cr_tournaments
  for select using (is_cr_room_member(room_id));

alter table cr_room_matches
  add column if not exists tournament_id uuid
  references cr_tournaments(id) on delete set null;

do $$ begin
  alter publication supabase_realtime add table public.cr_room_matches;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.cr_room_comments;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.cr_match_reactions;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.cr_tournaments;
exception when duplicate_object then null;
end $$;

-- ---------- 1. Room XP ledger (anti-double-award guard) ----------
create table if not exists cr_room_xp_ledger (
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('play','host','comment','daily')),
  ref_id uuid not null,
  day date not null default current_date,
  xp int not null,
  primary key (user_id, kind, ref_id, day)
);
alter table cr_room_xp_ledger enable row level security;
drop policy if exists "cr_room_xp self read" on cr_room_xp_ledger;
create policy "cr_room_xp self read" on cr_room_xp_ledger
  for select to authenticated using (auth.uid() = user_id);

-- Internal award helper: inserts into the ledger (idempotent); only
-- when the insert lands, atomically adds XP to cr_stats. NEVER granted
-- to any client role — only other DEFINER functions/triggers call it.
create or replace function public.cr_award_room_xp(
  p_user_id uuid, p_kind text, p_ref_id uuid, p_xp int
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_inserted boolean := false;
begin
  insert into cr_room_xp_ledger (user_id, kind, ref_id, day, xp)
  values (p_user_id, p_kind, p_ref_id, current_date, p_xp)
  on conflict do nothing
  returning true into v_inserted;
  if coalesce(v_inserted, false) then
    insert into cr_stats (user_id, xp)
    values (p_user_id, p_xp)
    on conflict (user_id) do update set xp = cr_stats.xp + excluded.xp;
    return true;
  end if;
  return false;
end $$;
revoke all on function public.cr_award_room_xp(uuid, text, uuid, int) from public;
revoke all on function public.cr_award_room_xp(uuid, text, uuid, int) from anon;
revoke all on function public.cr_award_room_xp(uuid, text, uuid, int) from authenticated;

-- ---------- 2. Membership RPCs ----------
create or replace function public.cr_join_room(p_code text)
returns cr_rooms
language plpgsql security definer set search_path = public as $$
declare
  v_room cr_rooms;
  v_count int;
begin
  select * into v_room from cr_rooms where code = upper(trim(p_code));
  if not found then raise exception 'room_not_found'; end if;
  if exists (select 1 from cr_room_members
             where room_id = v_room.id and user_id = auth.uid()) then
    return v_room; -- idempotent for existing members
  end if;
  if v_room.status = 'closed' then raise exception 'room_closed'; end if;
  select count(*) into v_count from cr_room_members where room_id = v_room.id;
  if v_count >= v_room.max_players then raise exception 'room_full'; end if;
  insert into cr_room_members (room_id, user_id, role)
  values (v_room.id, auth.uid(), 'player');
  if not (auth.uid() = any (v_room.turn_order)) then
    update cr_rooms
      set turn_order = turn_order || auth.uid()
      where id = v_room.id
      returning * into v_room;
  end if;
  return v_room;
end $$;
revoke all on function public.cr_join_room(text) from public;
revoke all on function public.cr_join_room(text) from anon;
grant execute on function public.cr_join_room(text) to authenticated;

create or replace function public.cr_leave_room(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if is_cr_room_leader(p_room_id) then
    raise exception 'leader_cannot_leave';
  end if;
  delete from cr_room_members
    where room_id = p_room_id and user_id = auth.uid();
  update cr_rooms
    set turn_order = array_remove(turn_order, auth.uid())
    where id = p_room_id;
end $$;
revoke all on function public.cr_leave_room(uuid) from public;
revoke all on function public.cr_leave_room(uuid) from anon;
grant execute on function public.cr_leave_room(uuid) to authenticated;

create or replace function public.cr_kick_member(p_room_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_cr_room_leader(p_room_id) then raise exception 'not_leader'; end if;
  if p_user_id = auth.uid() then raise exception 'cannot_kick_self'; end if;
  delete from cr_room_members
    where room_id = p_room_id and user_id = p_user_id;
  update cr_rooms
    set turn_order = array_remove(turn_order, p_user_id)
    where id = p_room_id;
end $$;
revoke all on function public.cr_kick_member(uuid, uuid) from public;
revoke all on function public.cr_kick_member(uuid, uuid) from anon;
grant execute on function public.cr_kick_member(uuid, uuid) to authenticated;

create or replace function public.cr_set_member_role(
  p_room_id uuid, p_user_id uuid, p_role text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_room cr_rooms;
begin
  if not is_cr_room_leader(p_room_id) then raise exception 'not_leader'; end if;
  if p_role not in ('player','spectator') then raise exception 'invalid_role'; end if;
  select * into v_room from cr_rooms where id = p_room_id;
  if p_user_id = v_room.leader_id and p_role = 'spectator' then
    raise exception 'leader_must_play';
  end if;
  update cr_room_members set role = p_role
    where room_id = p_room_id and user_id = p_user_id;
  if p_role = 'spectator' then
    update cr_rooms
      set turn_order = array_remove(turn_order, p_user_id)
      where id = p_room_id;
  elsif not (p_user_id = any (v_room.turn_order)) then
    update cr_rooms
      set turn_order = turn_order || p_user_id
      where id = p_room_id;
  end if;
end $$;
revoke all on function public.cr_set_member_role(uuid, uuid, text) from public;
revoke all on function public.cr_set_member_role(uuid, uuid, text) from anon;
grant execute on function public.cr_set_member_role(uuid, uuid, text) to authenticated;

create or replace function public.cr_set_turn_order(p_room_id uuid, p_order uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare v_clean uuid[];
begin
  if not is_cr_room_leader(p_room_id) then raise exception 'not_leader'; end if;
  -- Keep the requested order for current players only (deduped)…
  select coalesce(array_agg(m.user_id order by array_position(p_order, m.user_id)), '{}')
    into v_clean
    from cr_room_members m
    where m.room_id = p_room_id and m.role = 'player'
      and m.user_id = any (p_order);
  -- …then append any current players the list forgot, by join order.
  select v_clean || coalesce(array_agg(m.user_id order by m.joined_at), '{}')
    into v_clean
    from cr_room_members m
    where m.room_id = p_room_id and m.role = 'player'
      and not (m.user_id = any (v_clean));
  update cr_rooms set turn_order = v_clean where id = p_room_id;
end $$;
revoke all on function public.cr_set_turn_order(uuid, uuid[]) from public;
revoke all on function public.cr_set_turn_order(uuid, uuid[]) from anon;
grant execute on function public.cr_set_turn_order(uuid, uuid[]) to authenticated;

create or replace function public.cr_close_room(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_cr_room_leader(p_room_id) then raise exception 'not_leader'; end if;
  update cr_rooms set status = 'closed' where id = p_room_id;
end $$;
revoke all on function public.cr_close_room(uuid) from public;
revoke all on function public.cr_close_room(uuid) from anon;
grant execute on function public.cr_close_room(uuid) to authenticated;

create or replace function public.cr_update_room_rules(p_room_id uuid, p_rules text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_cr_room_leader(p_room_id) then raise exception 'not_leader'; end if;
  update cr_rooms
    set rules = nullif(left(trim(coalesce(p_rules, '')), 500), '')
    where id = p_room_id;
end $$;
revoke all on function public.cr_update_room_rules(uuid, text) from public;
revoke all on function public.cr_update_room_rules(uuid, text) from anon;
grant execute on function public.cr_update_room_rules(uuid, text) to authenticated;

create or replace function public.cr_set_room_public(p_room_id uuid, p_public boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_cr_room_leader(p_room_id) then raise exception 'not_leader'; end if;
  update cr_rooms set is_public = p_public where id = p_room_id;
end $$;
revoke all on function public.cr_set_room_public(uuid, boolean) from public;
revoke all on function public.cr_set_room_public(uuid, boolean) from anon;
grant execute on function public.cr_set_room_public(uuid, boolean) to authenticated;

-- ---------- 3. Match RPCs ----------
-- Sanitized rotation order shared by start_next_match: current
-- players in stored turn_order first, then any unlisted players.
create or replace function public.cr_start_next_match(p_room_id uuid)
returns cr_room_matches
language plpgsql security definer set search_path = public as $$
declare
  v_room cr_rooms;
  v_order uuid[];
  v_match cr_room_matches;
begin
  if not is_cr_room_leader(p_room_id) then raise exception 'not_leader'; end if;
  select * into v_room from cr_rooms where id = p_room_id;
  if v_room.status = 'closed' then raise exception 'room_closed'; end if;
  if exists (select 1 from cr_room_matches
             where room_id = p_room_id and status = 'active') then
    raise exception 'match_in_progress';
  end if;
  select coalesce(array_agg(m.user_id order by array_position(v_room.turn_order, m.user_id)), '{}')
    into v_order
    from cr_room_members m
    where m.room_id = p_room_id and m.role = 'player'
      and m.user_id = any (v_room.turn_order);
  select v_order || coalesce(array_agg(m.user_id order by m.joined_at), '{}')
    into v_order
    from cr_room_members m
    where m.room_id = p_room_id and m.role = 'player'
      and not (m.user_id = any (v_order));
  if coalesce(array_length(v_order, 1), 0) < 2 then
    raise exception 'room_need_two_players';
  end if;
  -- X moves first: the first player in the rotation takes it.
  insert into cr_room_matches (room_id, x_id, o_id, board_size, start_pos)
  values (p_room_id, v_order[1], v_order[2], v_room.board_size,
          'cr1:' || v_room.board_size || ':1:' ||
            repeat('0', v_room.board_size * v_room.board_size))
  returning * into v_match;
  -- Rotate: the first player goes to the end so everyone cycles.
  update cr_rooms
    set turn_order = v_order[2:] || v_order[1], status = 'playing'
    where id = p_room_id;
  return v_match;
end $$;
revoke all on function public.cr_start_next_match(uuid) from public;
revoke all on function public.cr_start_next_match(uuid) from anon;
grant execute on function public.cr_start_next_match(uuid) to authenticated;

create or replace function public.cr_finish_room_match(
  p_match_id uuid, p_result text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_match cr_room_matches;
  v_room cr_rooms;
  v_winner uuid;
  v_loser uuid;
  v_plies int;
  v_play int := 0;
  v_host int := 0;
  v_daily int := 0;
  v_nil uuid := '00000000-0000-0000-0000-000000000000';
  v_host_today int;
  v_pairings jsonb;
  v_new_pairings jsonb;
  v_elem jsonb;
  v_remaining int;
  v_ok boolean;
  -- Pairwise Elo state (ratings snapshotted PRE-match).
  v_ids uuid[];
  v_ratings int[];
  v_gamess int[];
  v_scores numeric[];
  v_uid uuid;
  v_rating int;
  v_games int;
  v_score numeric;
  v_opp_rating int;
  v_expected numeric;
  v_k int;
  v_new int;
  v_elo_xp int;
  v_xp_x int := 0;
  v_xp_o int := 0;
  v_i int;
begin
  if p_result not in ('x', 'o', 'draw') then
    raise exception 'invalid result';
  end if;
  select * into v_match from cr_room_matches where id = p_match_id;
  if not found then raise exception 'match_not_found'; end if;
  select * into v_room from cr_rooms where id = v_match.room_id;
  if auth.uid() <> v_match.x_id and auth.uid() <> v_match.o_id
     and auth.uid() <> v_room.leader_id then
    raise exception 'not_allowed';
  end if;
  if v_match.status <> 'active' then
    return jsonb_build_object('play_xp', 0, 'host_xp', 0, 'daily_xp', 0);
  end if;
  v_winner := case p_result
    when 'x' then v_match.x_id
    when 'o' then v_match.o_id
    else null end;
  v_loser := case p_result
    when 'x' then v_match.o_id
    when 'o' then v_match.x_id
    else null end;
  update cr_room_matches
    set status = 'finished', result = p_result, reason = p_reason,
        winner_id = v_winner, finished_at = now()
    where id = p_match_id;
  update cr_rooms set status = 'open'
    where id = v_match.room_id and status = 'playing';

  v_plies := case when trim(v_match.moves) = '' then 0
    else array_length(string_to_array(trim(v_match.moves), ' '), 1) end;

  -- Match XP (anti-farm: only games with >= 10 plies pay out).
  -- Award calls run into v_ok FIRST: side-effecting functions must
  -- never sit inside an AND condition (Postgres may reorder it).
  if v_plies >= 10 then
    if p_result = 'draw' then
      v_ok := cr_award_room_xp(v_match.x_id, 'play', p_match_id, 8);
      if v_ok then v_xp_x := v_xp_x + 8; end if;
      v_ok := cr_award_room_xp(v_match.o_id, 'play', p_match_id, 8);
      if v_ok then v_xp_o := v_xp_o + 8; end if;
    else
      v_ok := cr_award_room_xp(v_winner, 'play', p_match_id, 15);
      if v_ok then
        if v_winner = v_match.x_id then v_xp_x := v_xp_x + 15;
        else v_xp_o := v_xp_o + 15; end if;
      end if;
      v_ok := cr_award_room_xp(v_loser, 'play', p_match_id, 5);
      if v_ok then
        if v_loser = v_match.x_id then v_xp_x := v_xp_x + 5;
        else v_xp_o := v_xp_o + 5; end if;
      end if;
    end if;
    -- Host bonus +5/match, capped at 10 XP/day.
    select coalesce(sum(xp), 0) into v_host_today from cr_room_xp_ledger
      where user_id = v_room.leader_id and kind = 'host' and day = current_date;
    if v_host_today < 10 then
      v_ok := cr_award_room_xp(v_room.leader_id, 'host', p_match_id, 5);
      if v_ok and auth.uid() = v_room.leader_id then v_host := 5; end if;
    end if;
    -- Daily participation +10 once/day for both players.
    v_ok := cr_award_room_xp(v_match.x_id, 'daily', v_nil, 10);
    if v_ok then v_xp_x := v_xp_x + 10; end if;
    if v_ok and auth.uid() = v_match.x_id then v_daily := 10; end if;
    v_ok := cr_award_room_xp(v_match.o_id, 'daily', v_nil, 10);
    if v_ok then v_xp_o := v_xp_o + 10; end if;
    if v_ok and auth.uid() = v_match.o_id then v_daily := 10; end if;

    -- Pairwise Elo (frozen design): each player's rating moves against
    -- the other from PRE-match snapshots. Same K/floor/peak model as
    -- solo play: K = 40 for the first 20 recorded games else 24,
    -- floor 100, peak tracked. Gated on the same >= 10 plies.
    v_ids := array[v_match.x_id, v_match.o_id];
    select coalesce(array_agg(coalesce(st.rating, 800) order by u.ord), '{}')
      into v_ratings
      from unnest(v_ids) with ordinality as u(pid, ord)
      left join cr_stats st on st.user_id = u.pid;
    select coalesce(array_agg(coalesce(st.games_played, 0) order by u.ord), '{}')
      into v_gamess
      from unnest(v_ids) with ordinality as u(pid, ord)
      left join cr_stats st on st.user_id = u.pid;
    v_scores := case p_result
      when 'x' then array[1.0, 0.0]
      when 'o' then array[0.0, 1.0]
      else array[0.5, 0.5] end;
    for v_i in 1..2 loop
      v_uid := v_ids[v_i];
      v_rating := v_ratings[v_i];
      v_games := v_gamess[v_i];
      v_score := v_scores[v_i];
      v_opp_rating := v_ratings[3 - v_i];
      v_expected := 1.0 / (1.0 + power(10.0, (v_opp_rating - v_rating) / 400.0));
      v_k := case when v_games < 20 then 40 else 24 end;
      v_new := greatest(100, v_rating + floor(v_k * (v_score - v_expected) + 0.5)::int);
      v_elo_xp := case when v_i = 1 then v_xp_x else v_xp_o end;
      insert into cr_stats (user_id, xp, games_played, wins, losses, draws, rating, peak_rating)
        values (v_uid, 0, 1,
          case when v_score = 1 then 1 else 0 end,
          case when v_score = 0 then 1 else 0 end,
          case when v_score = 0.5 then 1 else 0 end,
          v_new, greatest(800, v_new))
        on conflict (user_id) do update set
          games_played = cr_stats.games_played + 1,
          wins = cr_stats.wins + excluded.wins,
          losses = cr_stats.losses + excluded.losses,
          draws = cr_stats.draws + excluded.draws,
          rating = v_new,
          peak_rating = greatest(cr_stats.peak_rating, v_new);
      insert into cr_rating_history (user_id, rating, xp)
        values (v_uid, v_new, v_elo_xp);
    end loop;

    -- The caller's own play XP for this match (for the toast): read
    -- back from the ledger so an idempotent re-finish reports 0.
    v_play := 0;
    select coalesce(sum(xp), 0) into v_play from cr_room_xp_ledger
      where user_id = auth.uid() and kind = 'play' and ref_id = p_match_id;
  end if;

  -- Tournament write-back: stamp this pairing's result; auto-finish
  -- the tournament when every pairing has a result.
  if v_match.tournament_id is not null then
    select pairings into v_pairings from cr_tournaments
      where id = v_match.tournament_id;
    if v_pairings is not null then
      v_new_pairings := '[]'::jsonb;
      for v_elem in select * from jsonb_array_elements(v_pairings) loop
        if v_elem ->> 'match_id' = p_match_id::text then
          v_elem := v_elem || jsonb_build_object('result', p_result);
        end if;
        v_new_pairings := v_new_pairings || v_elem;
      end loop;
      select count(*) into v_remaining from jsonb_array_elements(v_new_pairings) e
        where e ->> 'result' is null;
      update cr_tournaments
        set pairings = v_new_pairings,
            status = case when v_remaining = 0 then 'finished' else status end,
            finished_at = case when v_remaining = 0 then now() else finished_at end
        where id = v_match.tournament_id;
    end if;
  end if;

  return jsonb_build_object('play_xp', v_play, 'host_xp', v_host, 'daily_xp', v_daily);
end $$;
revoke all on function public.cr_finish_room_match(uuid, text, text) from public;
revoke all on function public.cr_finish_room_match(uuid, text, text) from anon;
grant execute on function public.cr_finish_room_match(uuid, text, text) to authenticated;

create or replace function public.cr_cancel_room_match(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_match cr_room_matches;
begin
  select * into v_match from cr_room_matches where id = p_match_id;
  if not found then raise exception 'match_not_found'; end if;
  if not is_cr_room_leader(v_match.room_id) then
    raise exception 'not_leader';
  end if;
  update cr_room_matches
    set status = 'cancelled', reason = 'cancelled', finished_at = now()
    where id = p_match_id and status = 'active';
  update cr_rooms set status = 'open'
    where id = v_match.room_id and status = 'playing';
end $$;
revoke all on function public.cr_cancel_room_match(uuid) from public;
revoke all on function public.cr_cancel_room_match(uuid) from anon;
grant execute on function public.cr_cancel_room_match(uuid) to authenticated;

create or replace function public.cr_rematch(p_room_id uuid)
returns cr_room_matches
language plpgsql security definer set search_path = public as $$
declare
  v_prev cr_room_matches;
  v_match cr_room_matches;
begin
  select * into v_prev from cr_room_matches
    where room_id = p_room_id and status = 'finished'
    order by finished_at desc nulls last, created_at desc
    limit 1;
  if not found then raise exception 'match_not_found'; end if;
  if auth.uid() <> v_prev.x_id and auth.uid() <> v_prev.o_id then
    raise exception 'not_allowed';
  end if;
  if exists (select 1 from cr_room_matches
             where room_id = p_room_id and status = 'active') then
    raise exception 'match_in_progress';
  end if;
  -- Same two players, swapped colors, same board size.
  insert into cr_room_matches (room_id, x_id, o_id, board_size, start_pos)
  values (p_room_id, v_prev.o_id, v_prev.x_id, v_prev.board_size,
          'cr1:' || v_prev.board_size || ':1:' ||
            repeat('0', v_prev.board_size * v_prev.board_size))
  returning * into v_match;
  update cr_rooms set status = 'playing' where id = p_room_id;
  return v_match;
end $$;
revoke all on function public.cr_rematch(uuid) from public;
revoke all on function public.cr_rematch(uuid) from anon;
grant execute on function public.cr_rematch(uuid) to authenticated;

-- ---------- 4. Tournament RPCs ----------
create or replace function public.cr_create_tournament(p_room_id uuid, p_name text)
returns cr_tournaments
language plpgsql security definer set search_path = public as $$
declare
  v_players uuid[];
  v_pairings jsonb := '[]'::jsonb;
  v_t cr_tournaments;
  v_i int; v_j int; v_n int;
begin
  if not is_cr_room_leader(p_room_id) then raise exception 'not_leader'; end if;
  if exists (select 1 from cr_tournaments where room_id = p_room_id and status = 'open') then
    raise exception 'tournament_in_progress'; end if;
  if exists (select 1 from cr_room_matches
             where room_id = p_room_id and status = 'active') then
    raise exception 'match_in_progress'; end if;
  select array_agg(m.user_id) into v_players
    from cr_room_members m where m.room_id = p_room_id and m.role = 'player';
  v_n := coalesce(array_length(v_players, 1), 0);
  if v_n < 3 then raise exception 'not_enough_players'; end if;
  for v_i in 1..v_n loop
    for v_j in v_i + 1..v_n loop
      v_pairings := v_pairings || jsonb_build_object(
        'x', case when (v_i + v_j) % 2 = 0 then v_players[v_i] else v_players[v_j] end,
        'o', case when (v_i + v_j) % 2 = 0 then v_players[v_j] else v_players[v_i] end,
        'result', null);
    end loop;
  end loop;
  insert into cr_tournaments (room_id, name, pairings)
    values (p_room_id, left(nullif(trim(p_name), ''), 60), v_pairings)
    returning * into v_t;
  return v_t;
end $$;
revoke all on function public.cr_create_tournament(uuid, text) from public;
revoke all on function public.cr_create_tournament(uuid, text) from anon;
grant execute on function public.cr_create_tournament(uuid, text) to authenticated;

create or replace function public.cr_tournament_next_match(p_tournament_id uuid)
returns cr_room_matches
language plpgsql security definer set search_path = public as $$
declare
  v_t cr_tournaments;
  v_new_pairings jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_x uuid;
  v_o uuid;
  v_match cr_room_matches;
  v_stamped boolean := false;
begin
  select * into v_t from cr_tournaments where id = p_tournament_id;
  if not found then raise exception 'tournament_not_found'; end if;
  if not is_cr_room_leader(v_t.room_id) then raise exception 'not_leader'; end if;
  if v_t.status <> 'open' then raise exception 'tournament_finished'; end if;
  if exists (select 1 from cr_room_matches
             where room_id = v_t.room_id and status = 'active') then
    raise exception 'match_in_progress';
  end if;
  for v_elem in select * from jsonb_array_elements(v_t.pairings) loop
    if not v_stamped and v_elem ->> 'result' is null then
      v_x := (v_elem ->> 'x')::uuid;
      v_o := (v_elem ->> 'o')::uuid;
      insert into cr_room_matches (room_id, x_id, o_id, tournament_id, board_size, start_pos)
      values (v_t.room_id, v_x, v_o, p_tournament_id,
              (select board_size from cr_rooms where id = v_t.room_id),
              'cr1:' || (select board_size from cr_rooms where id = v_t.room_id)
                || ':1:' || repeat('0', (select board_size from cr_rooms where id = v_t.room_id)
                                        * (select board_size from cr_rooms where id = v_t.room_id)))
      returning * into v_match;
      v_elem := v_elem || jsonb_build_object('match_id', v_match.id);
      v_stamped := true;
    end if;
    v_new_pairings := v_new_pairings || v_elem;
  end loop;
  if not v_stamped then raise exception 'tournament_finished'; end if;
  update cr_tournaments set pairings = v_new_pairings where id = p_tournament_id;
  update cr_rooms set status = 'playing' where id = v_t.room_id;
  return v_match;
end $$;
revoke all on function public.cr_tournament_next_match(uuid) from public;
revoke all on function public.cr_tournament_next_match(uuid) from anon;
grant execute on function public.cr_tournament_next_match(uuid) to authenticated;

create or replace function public.cr_cancel_tournament(p_tournament_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_t cr_tournaments;
begin
  select * into v_t from cr_tournaments where id = p_tournament_id;
  if not found then raise exception 'tournament_not_found'; end if;
  if not is_cr_room_leader(v_t.room_id) then raise exception 'not_leader'; end if;
  update cr_tournaments
    set status = 'finished', finished_at = now()
    where id = p_tournament_id and status = 'open';
end $$;
revoke all on function public.cr_cancel_tournament(uuid) from public;
revoke all on function public.cr_cancel_tournament(uuid) from anon;
grant execute on function public.cr_cancel_tournament(uuid) to authenticated;

-- ---------- 5. Comment XP trigger (+2/comment, cap 10/day) ----------
create or replace function public.cr_award_comment_xp()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_today int;
begin
  if length(trim(new.body)) >= 4 then
    select coalesce(sum(xp), 0) into v_today from cr_room_xp_ledger
      where user_id = new.user_id and kind = 'comment' and day = current_date;
    if v_today < 10 then
      perform cr_award_room_xp(new.user_id, 'comment', new.id, 2);
    end if;
  end if;
  perform cr_award_room_xp(
    new.user_id, 'daily', '00000000-0000-0000-0000-000000000000', 10);
  return new;
end $$;
revoke all on function public.cr_award_comment_xp() from public;
revoke all on function public.cr_award_comment_xp() from anon;
revoke all on function public.cr_award_comment_xp() from authenticated;
drop trigger if exists cr_comments_xp on cr_room_comments;
create trigger cr_comments_xp
  after insert on cr_room_comments
  for each row execute function public.cr_award_comment_xp();

-- ---------- 6. Discovery & guest RPCs (anon-safe) ----------
create or replace function public.cr_preview_room(p_code text)
returns table (name text, member_count bigint, is_public boolean, status text, rules text)
language sql security definer stable set search_path = public as $$
  select r.name,
         (select count(*) from cr_room_members m where m.room_id = r.id),
         r.is_public, r.status, r.rules
  from cr_rooms r
  where r.code = upper(trim(p_code));
$$;
revoke all on function public.cr_preview_room(text) from public;
revoke all on function public.cr_preview_room(text) from anon;
grant execute on function public.cr_preview_room(text) to anon, authenticated;

create or replace function public.cr_list_public_rooms()
returns table (id uuid, code text, name text, member_count bigint,
               max_players int, has_active_match boolean)
language sql security definer stable set search_path = public as $$
  select r.id, r.code, r.name,
         (select count(*) from cr_room_members m where m.room_id = r.id),
         r.max_players,
         exists (select 1 from cr_room_matches mt
                 where mt.room_id = r.id and mt.status = 'active')
  from cr_rooms r
  where r.is_public and r.status <> 'closed'
  order by 6 desc, 4 desc
  limit 30;
$$;
revoke all on function public.cr_list_public_rooms() from public;
revoke all on function public.cr_list_public_rooms() from anon;
grant execute on function public.cr_list_public_rooms() to anon, authenticated;

create or replace function public.cr_room_leaderboard()
returns table (room_id uuid, name text, code text,
               matches_7d bigint, member_count bigint)
language sql security definer stable set search_path = public as $$
  select r.id, r.name, r.code,
         (select count(*) from cr_room_matches m
          where m.room_id = r.id and m.status = 'finished'
            and m.created_at > now() - interval '7 days'),
         (select count(*) from cr_room_members mb where mb.room_id = r.id)
  from cr_rooms r
  where r.is_public and r.status <> 'closed'
  order by 4 desc, 5 desc
  limit 20;
$$;
revoke all on function public.cr_room_leaderboard() from public;
revoke all on function public.cr_room_leaderboard() from anon;
grant execute on function public.cr_room_leaderboard() to anon, authenticated;

-- Guest room detail: profile names are resolved server-side so the
-- profiles table is never exposed to anon.
create or replace function public.cr_guest_room_detail(p_room_id uuid)
returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare
  v_room cr_rooms;
  v_match cr_room_matches;
  v_result jsonb;
begin
  select * into v_room from cr_rooms where id = p_room_id;
  if not found or not v_room.is_public or v_room.status = 'closed' then
    return null;
  end if;
  select * into v_match from cr_room_matches
    where room_id = p_room_id and status = 'active'
    order by created_at desc limit 1;
  select jsonb_build_object(
    'id', v_room.id,
    'code', v_room.code,
    'name', v_room.name,
    'max_players', v_room.max_players,
    'status', v_room.status,
    'rules', v_room.rules,
    'member_count', (select count(*) from cr_room_members where room_id = p_room_id),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', coalesce(nullif(p.full_name, ''), nullif(p.username, ''),
                         split_part(u.email, '@', 1), 'Player'),
        'role', m.role) order by m.joined_at)
      from cr_room_members m join profiles p on p.id = m.user_id
      left join auth.users u on u.id = p.id
      where m.room_id = p_room_id), '[]'::jsonb),
    'active_match', case when v_match.id is null then null else jsonb_build_object(
      'id', v_match.id,
      'x_id', v_match.x_id,
      'o_id', v_match.o_id,
      'x_name', (select coalesce(nullif(p.full_name, ''), nullif(p.username, ''),
                             split_part(u.email, '@', 1), 'Player')
                     from profiles p left join auth.users u on u.id = p.id
                     where p.id = v_match.x_id),
      'o_name', (select coalesce(nullif(p.full_name, ''), nullif(p.username, ''),
                             split_part(u.email, '@', 1), 'Player')
                     from profiles p left join auth.users u on u.id = p.id
                     where p.id = v_match.o_id),
      'moves', v_match.moves,
      'board_size', v_match.board_size,
      'status', v_match.status) end,
    'comments', coalesce((
      select jsonb_agg(c order by created_at desc) from (
        select jsonb_build_object(
          'user_name', coalesce(nullif(p.full_name, ''), nullif(p.username, ''),
                                split_part(u.email, '@', 1), 'Player'),
          'body', cm.body,
          'created_at', cm.created_at) as c,
          cm.created_at
        from cr_room_comments cm join profiles p on p.id = cm.user_id
        left join auth.users u on u.id = p.id
        where cm.room_id = p_room_id
        order by cm.created_at desc limit 20) t), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;
revoke all on function public.cr_guest_room_detail(uuid) from public;
revoke all on function public.cr_guest_room_detail(uuid) from anon;
grant execute on function public.cr_guest_room_detail(uuid) to anon, authenticated;

-- ---------- 7. Anon read policies for public rooms ----------
-- Lets guests actually load the board/comments of a public room and
-- receive realtime updates. Write access stays member-only.
drop policy if exists "cr_matches public read" on cr_room_matches;
create policy "cr_matches public read" on cr_room_matches
  for select to anon, authenticated using (
    exists (select 1 from cr_rooms r
            where r.id = room_id and r.is_public and r.status <> 'closed'));
drop policy if exists "cr_comments public read" on cr_room_comments;
create policy "cr_comments public read" on cr_room_comments
  for select to anon, authenticated using (
    exists (select 1 from cr_rooms r
            where r.id = room_id and r.is_public and r.status <> 'closed'));
drop policy if exists "cr_reactions public read" on cr_match_reactions;
create policy "cr_reactions public read" on cr_match_reactions
  for select to anon, authenticated using (
    exists (select 1 from cr_rooms r
            where r.id = room_id and r.is_public and r.status <> 'closed'));
drop policy if exists "cr_tournaments public read" on cr_tournaments;
create policy "cr_tournaments public read" on cr_tournaments
  for select to anon, authenticated using (
    exists (select 1 from cr_rooms r
            where r.id = room_id and r.is_public and r.status <> 'closed'));

