-- 006_cr_puzzles.sql — Daily puzzle solve tracking + community puzzles
-- (user-created tactics, family UGC pattern).
-- Run in the Dashboard SQL editor AFTER 005. Idempotent.
--
-- Positions use the `pos` column in the app's serialized form
-- (`cr1:<size>:<turn>:<cells>`, see 001). Solutions are the
-- SPACE-separated SET of acceptable winning cell indices.
-- moves_to_mate is kept at 1 for caro (every community puzzle is a
-- find-the-winning-move position, engine-verified at publish time).

-- ============ DAILY PUZZLES ============
-- Puzzles themselves live in the app's puzzle library (deterministic
-- daily pick); this table tracks solves + XP rewards.
create table if not exists cr_puzzle_solves (
  user_id uuid not null references profiles(id) on delete cascade,
  puzzle_date date not null,
  solved boolean not null default true,
  attempts int not null default 1,
  solved_at timestamptz not null default now(),
  primary key (user_id, puzzle_date)
);
alter table cr_puzzle_solves enable row level security;
drop policy if exists "cr_puzzle_solves self" on cr_puzzle_solves;
create policy "cr_puzzle_solves self" on cr_puzzle_solves
  for all using (auth.uid() = user_id);

-- Record a puzzle solve. Idempotent: +15 XP only on the first solve of the day.
-- Returns true if this call newly solved it (XP awarded), false otherwise.
create or replace function public.cr_record_puzzle_solve(p_date date)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from cr_puzzle_solves
    where user_id = auth.uid() and puzzle_date = p_date
  ) then
    update cr_puzzle_solves
      set attempts = attempts + 1
      where user_id = auth.uid() and puzzle_date = p_date;
    return false;
  end if;
  insert into cr_puzzle_solves (user_id, puzzle_date, solved, attempts)
    values (auth.uid(), p_date, true, 1);
  insert into cr_stats (user_id, xp) values (auth.uid(), 15)
    on conflict (user_id) do update set xp = cr_stats.xp + 15;
  return true;
end $$;
revoke all on function public.cr_record_puzzle_solve(date) from public;
revoke all on function public.cr_record_puzzle_solve(date) from anon;
grant execute on function public.cr_record_puzzle_solve(date) to authenticated;

-- ============ COMMUNITY PUZZLES ============
create table if not exists cr_community_puzzles (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references profiles(id) on delete cascade,
  title text not null default '',
  pos text not null,
  board_size int not null default 15 check (board_size in (10, 15, 20)),
  moves_to_mate smallint not null check (moves_to_mate between 1 and 3),
  solution text not null,
  solves integer not null default 0,
  likes integer not null default 0,
  is_featured boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists cr_community_puzzle_solves (
  puzzle_id uuid not null references cr_community_puzzles(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  solved_at timestamptz not null default now(),
  primary key (puzzle_id, user_id)
);
create table if not exists cr_community_puzzle_likes (
  puzzle_id uuid not null references cr_community_puzzles(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  liked_at timestamptz not null default now(),
  primary key (puzzle_id, user_id)
);

alter table cr_community_puzzles add column if not exists board_size int not null default 15
  check (board_size in (10, 15, 20));
alter table cr_community_puzzles enable row level security;
alter table cr_community_puzzle_solves enable row level security;
alter table cr_community_puzzle_likes enable row level security;

-- Publicly readable (guests browse; login is asked inline at the moment
-- of action). Writes go through the RPCs below; owners may rename/delete
-- their own puzzles directly.
drop policy if exists "cr_cpuzzles public read" on cr_community_puzzles;
create policy "cr_cpuzzles public read" on cr_community_puzzles
  for select to anon, authenticated using (true);
drop policy if exists "cr_cpuzzles owner insert" on cr_community_puzzles;
create policy "cr_cpuzzles owner insert" on cr_community_puzzles
  for insert to authenticated with check (auth.uid() = creator_id);
drop policy if exists "cr_cpuzzles owner write" on cr_community_puzzles;
create policy "cr_cpuzzles owner write" on cr_community_puzzles
  for update to authenticated
  using (auth.uid() = creator_id) with check (auth.uid() = creator_id);
drop policy if exists "cr_cpuzzles owner delete" on cr_community_puzzles;
create policy "cr_cpuzzles owner delete" on cr_community_puzzles
  for delete to authenticated using (auth.uid() = creator_id);
drop policy if exists "cr_cpuzzle_solves public read" on cr_community_puzzle_solves;
create policy "cr_cpuzzle_solves public read" on cr_community_puzzle_solves
  for select to anon, authenticated using (true);
drop policy if exists "cr_cpuzzle_likes public read" on cr_community_puzzle_likes;
create policy "cr_cpuzzle_likes public read" on cr_community_puzzle_likes
  for select to anon, authenticated using (true);

-- Card list with creator name + my like/solve state.
-- p_sort: 'new' | 'popular' | 'weekly' | 'mine'.
drop function if exists public.cr_community_puzzle_cards(text, int, int, boolean);
create or replace function public.cr_community_puzzle_cards(
  p_sort text default 'new', p_limit int default 10, p_offset int default 0,
  p_mine boolean default false
)
returns table (
  id uuid, title text, pos text, board_size int, moves_to_mate smallint, solution text,
  solves int, likes int, is_featured boolean, creator_id uuid,
  creator_name text, liked_by_me boolean, solved_by_me boolean,
  created_at timestamptz
)
language plpgsql security definer stable set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  return query
  select cp.id, cp.title, cp.pos, cp.board_size, cp.moves_to_mate, cp.solution,
         cp.solves, cp.likes, cp.is_featured, cp.creator_id,
         coalesce(nullif(p.full_name, ''), nullif(p.username, ''),
                  split_part(u.email, '@', 1), 'Player'),
         exists (select 1 from cr_community_puzzle_likes l
                 where l.puzzle_id = cp.id and l.user_id = v_uid),
         exists (select 1 from cr_community_puzzle_solves s
                 where s.puzzle_id = cp.id and s.user_id = v_uid),
         cp.created_at
  from cr_community_puzzles cp
  join profiles p on p.id = cp.creator_id
  left join auth.users u on u.id = cp.creator_id
  where (not p_mine or cp.creator_id = v_uid)
    and (p_sort <> 'weekly' or cp.created_at > now() - interval '7 days')
  order by
    case when p_sort = 'new' or p_sort = 'mine' then cp.created_at end desc,
    case when p_sort in ('popular', 'weekly') then cp.likes + cp.solves end desc,
    cp.created_at desc
  limit greatest(coalesce(p_limit, 10), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end $$;
revoke all on function public.cr_community_puzzle_cards(text, int, int, boolean) from public;
revoke all on function public.cr_community_puzzle_cards(text, int, int, boolean) from anon;
grant execute on function public.cr_community_puzzle_cards(text, int, int, boolean) to anon, authenticated;

-- Single card (powers the ?cpuzzle=<id> deep link).
drop function if exists public.cr_community_puzzle_card(uuid);
create or replace function public.cr_community_puzzle_card(p_id uuid)
returns table (
  id uuid, title text, pos text, board_size int, moves_to_mate smallint, solution text,
  solves int, likes int, is_featured boolean, creator_id uuid,
  creator_name text, liked_by_me boolean, solved_by_me boolean,
  created_at timestamptz
)
language plpgsql security definer stable set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  return query
  select cp.id, cp.title, cp.pos, cp.board_size, cp.moves_to_mate, cp.solution,
         cp.solves, cp.likes, cp.is_featured, cp.creator_id,
         coalesce(nullif(p.full_name, ''), nullif(p.username, ''),
                  split_part(u.email, '@', 1), 'Player'),
         exists (select 1 from cr_community_puzzle_likes l
                 where l.puzzle_id = cp.id and l.user_id = v_uid),
         exists (select 1 from cr_community_puzzle_solves s
                 where s.puzzle_id = cp.id and s.user_id = v_uid),
         cp.created_at
  from cr_community_puzzles cp
  join profiles p on p.id = cp.creator_id
  left join auth.users u on u.id = cp.creator_id
  where cp.id = p_id;
end $$;
revoke all on function public.cr_community_puzzle_card(uuid) from public;
revoke all on function public.cr_community_puzzle_card(uuid) from anon;
grant execute on function public.cr_community_puzzle_card(uuid) to anon, authenticated;

-- Internal featuring check: 8+ likes OR 20+ solves -> featured + creator +50 XP once.
create or replace function public.cr_maybe_feature_puzzle(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_creator uuid;
begin
  select creator_id into v_creator from cr_community_puzzles where id = p_id;
  if not found then return; end if;
  update cr_community_puzzles
    set is_featured = true
    where id = p_id and not is_featured
      and (likes >= 8 or solves >= 20);
  if found then
    insert into cr_stats (user_id, xp) values (v_creator, 50)
      on conflict (user_id) do update set xp = cr_stats.xp + 50;
  end if;
end $$;
revoke all on function public.cr_maybe_feature_puzzle(uuid) from public;
revoke all on function public.cr_maybe_feature_puzzle(uuid) from anon;
revoke all on function public.cr_maybe_feature_puzzle(uuid) from authenticated;

-- Solve a community puzzle. Solver +10 XP (cap 5/day); creator +5 per
-- distinct solver (cap 10 solvers = +50/puzzle). Self-solves pay nothing.
-- Returns the solver XP earned.
create or replace function public.cr_solve_community_puzzle(p_id uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_creator uuid;
  v_solves_today int;
  v_distinct int;
  v_xp int := 0;
begin
  select creator_id into v_creator from cr_community_puzzles where id = p_id;
  if not found then raise exception 'puzzle_not_found'; end if;
  insert into cr_community_puzzle_solves (puzzle_id, user_id)
    values (p_id, v_uid)
    on conflict do nothing;
  if not found then return 0; end if; -- already solved: no XP, no recount
  update cr_community_puzzles
    set solves = solves + 1 where id = p_id;
  if v_uid <> v_creator then
    select count(*) into v_solves_today from cr_community_puzzle_solves
      where user_id = v_uid and solved_at::date = current_date;
    if v_solves_today <= 5 then
      v_xp := 10;
      insert into cr_stats (user_id, xp) values (v_uid, 10)
        on conflict (user_id) do update set xp = cr_stats.xp + 10;
    end if;
    select count(distinct user_id) into v_distinct
      from cr_community_puzzle_solves
      where puzzle_id = p_id and user_id <> v_creator;
    if v_distinct <= 10 then
      insert into cr_stats (user_id, xp) values (v_creator, 5)
        on conflict (user_id) do update set xp = cr_stats.xp + 5;
    end if;
  end if;
  perform cr_maybe_feature_puzzle(p_id);
  return v_xp;
end $$;
revoke all on function public.cr_solve_community_puzzle(uuid) from public;
revoke all on function public.cr_solve_community_puzzle(uuid) from anon;
grant execute on function public.cr_solve_community_puzzle(uuid) to authenticated;

-- Toggle a like. Returns {liked, likes}. Runs the featuring check.
create or replace function public.cr_toggle_community_like(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_liked boolean;
  v_likes int;
begin
  if exists (select 1 from cr_community_puzzles where id = p_id) then
    delete from cr_community_puzzle_likes
      where puzzle_id = p_id and user_id = v_uid;
    if found then
      v_liked := false;
    else
      insert into cr_community_puzzle_likes (puzzle_id, user_id)
        values (p_id, v_uid);
      v_liked := true;
    end if;
    update cr_community_puzzles
      set likes = (select count(*) from cr_community_puzzle_likes
                   where puzzle_id = p_id)
      where id = p_id
      returning likes into v_likes;
    perform cr_maybe_feature_puzzle(p_id);
    return jsonb_build_object('liked', v_liked, 'likes', v_likes);
  end if;
  raise exception 'puzzle_not_found';
end $$;
revoke all on function public.cr_toggle_community_like(uuid) from public;
revoke all on function public.cr_toggle_community_like(uuid) from anon;
grant execute on function public.cr_toggle_community_like(uuid) to authenticated;
