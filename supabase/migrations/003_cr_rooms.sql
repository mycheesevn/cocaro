-- 003_cr_rooms.sql — Caro rooms: tables, RLS, room-creation RPC,
-- challenges (with denormalized room_code + replica identity full), referrals.
-- Run in the Dashboard SQL editor AFTER 001. Idempotent.
--
-- Room status vocabulary: 'open' | 'playing' | 'closed'.

-- ============ ROOMS ============
create table if not exists cr_rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  leader_id uuid references profiles(id),
  max_players int not null default 8 check (max_players between 2 and 20),
  board_size int not null default 15 check (board_size in (10, 15, 20)),
  is_public boolean not null default false,
  status text not null default 'open' check (status in ('open', 'playing', 'closed')),
  turn_order uuid[] not null default '{}',
  rules text,
  created_at timestamptz not null default now()
);
alter table cr_rooms enable row level security;
-- Board size chosen by the host at creation (idempotent add for chains
-- where the table predates this column).
alter table cr_rooms
  add column if not exists board_size int not null default 15
  check (board_size in (10, 15, 20));

create table if not exists cr_room_members (
  room_id uuid not null references cr_rooms(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'player' check (role in ('player', 'spectator')),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table cr_room_members enable row level security;

-- RLS helpers. Evaluated with the CALLER's privileges inside policies, so
-- they MUST keep execute grants for anon + authenticated (revoking them
-- breaks every room read). Not revoked.
create or replace function public.is_cr_room_member(rid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from cr_room_members where room_id = rid and user_id = auth.uid());
$$;
create or replace function public.is_cr_room_leader(rid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from cr_rooms where id = rid and leader_id = auth.uid());
$$;
-- Explicit posture (uniform with every other DEFINER function): revoke
-- from public AND anon, then grant exactly the roles that need it.
-- anon + authenticated MUST keep execute here: RLS policy expressions
-- evaluate with the CALLER's privileges, so revoking them would break
-- every room read (family lesson from CCT 007).
revoke all on function public.is_cr_room_member(uuid) from public;
revoke all on function public.is_cr_room_member(uuid) from anon;
grant execute on function public.is_cr_room_member(uuid) to anon, authenticated;
revoke all on function public.is_cr_room_leader(uuid) from public;
revoke all on function public.is_cr_room_leader(uuid) from anon;
grant execute on function public.is_cr_room_leader(uuid) to anon, authenticated;

-- A brand-new PRIVATE room is invisible to its own creator until the
-- leader member row exists, so the SELECT policy carries a leader clause
-- (belt-and-braces; creation itself goes through the RPC below).
drop policy if exists "cr_rooms member read" on cr_rooms;
create policy "cr_rooms member read" on cr_rooms
  for select using (
    is_cr_room_member(id) or is_cr_room_leader(id) or is_public
  );
drop policy if exists "cr_rooms leader insert" on cr_rooms;
create policy "cr_rooms leader insert" on cr_rooms
  for insert to authenticated with check (auth.uid() = leader_id);
drop policy if exists "cr_rooms leader update" on cr_rooms;
create policy "cr_rooms leader update" on cr_rooms
  for update using (is_cr_room_leader(id));
drop policy if exists "cr_members read" on cr_room_members;
create policy "cr_members read" on cr_room_members
  for select using (is_cr_room_member(room_id));
drop policy if exists "cr_members self join" on cr_room_members;
create policy "cr_members self join" on cr_room_members
  for insert with check (auth.uid() = user_id);

do $$ begin
  alter publication supabase_realtime add table public.cr_rooms;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.cr_room_members;
exception when duplicate_object then null;
end $$;

-- Room-code generator (same alphabet/length as the family standard:
-- ABCDEFGHJKLMNPQRSTUVWXYZ23456789, 6 chars). Internal helper: never
-- granted to any client role.
create or replace function public.cr_gen_room_code()
returns text
language plpgsql volatile set search_path = public as $$
declare
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text := '';
  v_i int;
begin
  for v_i in 1..6 loop
    v_code := v_code || substr(
      v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
  end loop;
  return v_code;
end $$;
revoke all on function public.cr_gen_room_code() from public;
revoke all on function public.cr_gen_room_code() from anon;
revoke all on function public.cr_gen_room_code() from authenticated;

-- Create-room RPC (family pattern): atomically insert the room
-- (turn_order = [leader]), insert the leader member row, generate the
-- invite code server-side, return the room. Clients must NEVER insert
-- into cr_rooms/cr_room_members directly to create a room.
-- The 3-arg predecessor signature must not linger as an
-- overload: PostgREST named-arg dispatch would be ambiguous.
drop function if exists public.cr_create_room(text, boolean, int);
create or replace function public.cr_create_room(
  p_name text,
  p_is_public boolean default false,
  p_max_players int default 8,
  p_board_size int default 15
) returns cr_rooms
language plpgsql security definer set search_path = public as $$
declare
  v_room cr_rooms;
  v_code text;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_max int := coalesce(p_max_players, 8);
  v_size int := coalesce(p_board_size, 15);
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if v_name is null then v_name := 'Phòng chơi'; end if;
  v_name := left(v_name, 60);
  if v_max < 2 then v_max := 2; end if;
  if v_max > 20 then v_max := 20; end if;
  if v_size not in (10, 15, 20) then v_size := 15; end if;
  loop
    v_code := cr_gen_room_code();
    exit when not exists (select 1 from cr_rooms where code = v_code);
  end loop;
  insert into cr_rooms (code, name, leader_id, is_public, max_players, board_size, turn_order)
  values (v_code, v_name, auth.uid(), coalesce(p_is_public, false), v_max,
          v_size, array[auth.uid()])
  returning * into v_room;
  insert into cr_room_members (room_id, user_id, role)
  values (v_room.id, auth.uid(), 'player');
  return v_room;
end $$;
revoke all on function public.cr_create_room(text, boolean, int, int) from public;
revoke all on function public.cr_create_room(text, boolean, int, int) from anon;
grant execute on function public.cr_create_room(text, boolean, int, int) to authenticated;

-- ============ CHALLENGES ============
-- room_code is denormalized onto the row: the challenged player is NOT a
-- room member yet and rooms RLS hides the private room from them, so the
-- code must be readable from the challenge row itself.
create table if not exists cr_challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references profiles(id) on delete cascade,
  challenged_id uuid not null references profiles(id) on delete cascade,
  room_id uuid references cr_rooms(id) on delete cascade,
  room_code text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
create index if not exists cr_challenges_challenged_idx
  on cr_challenges (challenged_id, created_at desc);
do $$ begin
  alter table cr_challenges
    add constraint cr_challenges_status_check
    check (status in ('pending', 'accepted', 'declined'));
exception when duplicate_object then null;
end $$;
alter table cr_challenges enable row level security;
drop policy if exists "cr_challenges party" on cr_challenges;
drop policy if exists "cr_challenges select party" on cr_challenges;
create policy "cr_challenges select party" on cr_challenges
  for select to authenticated
  using (auth.uid() = challenger_id or auth.uid() = challenged_id);
drop policy if exists "cr_challenges insert" on cr_challenges;
create policy "cr_challenges insert" on cr_challenges
  for insert to authenticated
  with check (auth.uid() = challenger_id and auth.uid() != challenged_id);
drop policy if exists "cr_challenges update" on cr_challenges;
create policy "cr_challenges update" on cr_challenges
  for update to authenticated
  using (auth.uid() = challenged_id)
  with check (auth.uid() = challenged_id);
-- REPLICA IDENTITY FULL is mandatory: the challenge-accept realtime
-- subscription filters UPDATEs on challenger_id (a non-PK column). Under
-- the default replica identity the WAL record carries only the PK +
-- changed columns, so the filter can never match and the subscription
-- silently never fires.
alter table cr_challenges replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.cr_challenges;
exception when duplicate_object then null;
end $$;

-- ============ REFERRALS ============
create table if not exists cr_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references profiles(id) on delete cascade,
  referee_id uuid not null references profiles(id) on delete cascade unique,
  created_at timestamptz not null default now()
);
alter table cr_referrals enable row level security;
drop policy if exists "cr_referrals party" on cr_referrals;
create policy "cr_referrals party" on cr_referrals
  for select using (auth.uid() = referrer_id or auth.uid() = referee_id);

create or replace function public.cr_claim_referral(p_referrer_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_referrer_id = auth.uid() then return false; end if;
  insert into cr_referrals (referrer_id, referee_id)
    values (p_referrer_id, auth.uid())
  on conflict (referee_id) do nothing;
  if found then
    insert into cr_stats (user_id, xp) values (p_referrer_id, 20)
      on conflict (user_id) do update set xp = cr_stats.xp + 20;
    insert into cr_stats (user_id, xp) values (auth.uid(), 20)
      on conflict (user_id) do update set xp = cr_stats.xp + 20;
    return true;
  end if;
  return false;
end $$;
revoke all on function public.cr_claim_referral(uuid) from public;
revoke all on function public.cr_claim_referral(uuid) from anon;
grant execute on function public.cr_claim_referral(uuid) to authenticated;
