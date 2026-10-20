-- 001_cr_foundation.sql — Caro (Cờ Ca-rô) core: stats/XP/Elo, vs-computer
-- game history, daily check-ins, quests, leaderboard, library progress.
--
-- Seat naming: X and O everywhere (x_id / o_id seat columns;
-- player_color 'x' | 'o' | 'cvc'). X moves first; the human plays X,
-- the computer O. Match/game results are recorded from X's point of view.
--
-- THE caro data encoding (one format, used by every table below and by
-- rooms / correspondence / puzzles):
--   Position literal: cr1:<size>:<turn 1=X | 2=O>:<cells row-major,
--     '0' empty / '1' X / '2' O>  (the engine's serialization; the
--     default is the empty board: cr1:15:1: followed by 225 zeros).
--   Move list: SPACE-SEPARATED ZERO-BASED CELL INDICES in play order
--     (e.g. '112 113 98' on a 15x15 board). Algebraic labels (H8) are
--     a display-only rendering of an index, never stored.
--
-- Run in the Supabase Dashboard SQL editor. Idempotent.

-- ============ STATS (per-game XP + Elo; extends shared profiles) ============
create table if not exists cr_stats (
  user_id uuid primary key references profiles(id) on delete cascade,
  xp int not null default 0,
  rating int not null default 800,
  peak_rating int not null default 800,
  games_played int not null default 0,
  wins int not null default 0,
  losses int not null default 0,
  draws int not null default 0,
  welcome_claimed boolean not null default false,
  created_at timestamptz not null default now()
);
alter table cr_stats enable row level security;
drop policy if exists "cr_stats self" on cr_stats;
create policy "cr_stats self" on cr_stats
  for all using (auth.uid() = user_id);
-- Public leaderboard: anyone (incl. guests) may read the board.
drop policy if exists "cr_stats leaderboard" on cr_stats;
create policy "cr_stats leaderboard" on cr_stats
  for select using (true);

-- AI pseudo-rating by level (family AI_RATINGS scale). Internal helper:
-- only called from SECURITY DEFINER bodies, never by clients.
create or replace function public.cr_ai_rating(p_level int)
returns int
language sql immutable set search_path = public as $$
  select case p_level
    when 1 then 300
    when 2 then 500
    when 3 then 700
    when 4 then 900
    when 5 then 1100
    when 6 then 1300
    when 7 then 1500
    when 8 then 1700
    when 9 then 1900
    when 10 then 2100
    when 11 then 2250
    else 2400
  end;
$$;
revoke all on function public.cr_ai_rating(int) from public;
revoke all on function public.cr_ai_rating(int) from anon;
revoke all on function public.cr_ai_rating(int) from authenticated;

-- Leaderboard: server-computed ranks, display names resolved server-side
-- so the shared profiles table is never exposed to anon.
create or replace function public.cr_leaderboard(p_limit int default 15, p_offset int default 0)
returns table (rank bigint, user_id uuid, rating int, xp int,
               games_played int, wins int, display_name text)
language sql security definer stable set search_path = public as $$
  select row_number() over (order by s.rating desc, s.xp desc, s.user_id),
         s.user_id, s.rating, s.xp, s.games_played, s.wins,
         coalesce(nullif(p.full_name, ''), nullif(p.username, ''),
                  split_part(u.email, '@', 1), 'Player')
  from cr_stats s
  join profiles p on p.id = s.user_id
  left join auth.users u on u.id = s.user_id
  order by s.rating desc, s.xp desc, s.user_id
  limit greatest(coalesce(p_limit, 15), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke all on function public.cr_leaderboard(int, int) from public;
revoke all on function public.cr_leaderboard(int, int) from anon;
grant execute on function public.cr_leaderboard(int, int) to anon, authenticated;

-- ============ DAILY CHECK-IN ============
create table if not exists cr_checkins (
  user_id uuid not null references profiles(id) on delete cascade,
  checkin_date date not null,
  streak int not null default 1,
  primary key (user_id, checkin_date)
);
alter table cr_checkins enable row level security;
drop policy if exists "cr_checkin self" on cr_checkins;
create policy "cr_checkin self" on cr_checkins
  for all using (auth.uid() = user_id);

create or replace function public.cr_claim_checkin()
returns table(streak int, xp_awarded int, already_claimed boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_yesterday date := v_today - 1;
  v_prev_streak int;
  v_new_streak int;
  v_xp int;
begin
  if exists (select 1 from cr_checkins where user_id = auth.uid() and checkin_date = v_today) then
    select cr_checkins.streak into v_new_streak from cr_checkins
      where user_id = auth.uid() and checkin_date = v_today;
    return query select v_new_streak, 0, true;
    return;
  end if;
  select cr_checkins.streak into v_prev_streak from cr_checkins
    where user_id = auth.uid() and checkin_date = v_yesterday;
  v_new_streak := coalesce(v_prev_streak, 0) + 1;
  v_xp := least(10 + 5 * (v_new_streak - 1), 40);
  insert into cr_checkins (user_id, checkin_date, streak)
    values (auth.uid(), v_today, v_new_streak);
  insert into cr_stats (user_id, xp) values (auth.uid(), v_xp)
    on conflict (user_id) do update set xp = cr_stats.xp + excluded.xp;
  return query select v_new_streak, v_xp, false;
end $$;
revoke all on function public.cr_claim_checkin() from public;
revoke all on function public.cr_claim_checkin() from anon;
grant execute on function public.cr_claim_checkin() to authenticated;

-- ============ QUESTS + WELCOME BONUS ============
create table if not exists cr_quests (
  user_id uuid not null references profiles(id) on delete cascade,
  quest_id text not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, quest_id)
);
alter table cr_quests enable row level security;
drop policy if exists "cr_quests self" on cr_quests;
create policy "cr_quests self" on cr_quests
  for all using (auth.uid() = user_id);

-- Claim welcome bonus (+50 XP, one time). Returns true if newly granted.
create or replace function public.cr_claim_welcome()
returns boolean language plpgsql security definer set search_path = public as $$
declare v_already boolean;
begin
  select welcome_claimed into v_already from cr_stats where user_id = auth.uid();
  if v_already then return false; end if;
  insert into cr_stats (user_id, xp, welcome_claimed)
    values (auth.uid(), 50, true)
    on conflict (user_id) do update set
      xp = cr_stats.xp + 50,
      welcome_claimed = true;
  return true;
end $$;
revoke all on function public.cr_claim_welcome() from public;
revoke all on function public.cr_claim_welcome() from anon;
grant execute on function public.cr_claim_welcome() to authenticated;

-- Claim a quest (+20 XP each, one time per quest).
-- quest_id: 'play_1' | 'win_1' | 'join_room'
create or replace function public.cr_claim_quest(p_quest_id text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_done_ok boolean := false;
begin
  if p_quest_id = 'play_1' then
    select exists (select 1 from cr_games
      where user_id = auth.uid() and player_color <> 'cvc') into v_done_ok;
  elsif p_quest_id = 'win_1' then
    select exists (select 1 from cr_games
      where user_id = auth.uid() and result = 'win'
        and player_color in ('x', 'o')) into v_done_ok;
  elsif p_quest_id = 'join_room' then
    select exists (select 1 from cr_room_members
      where user_id = auth.uid()) into v_done_ok;
  else
    return false;
  end if;
  if not v_done_ok then return false; end if;
  insert into cr_quests (user_id, quest_id) values (auth.uid(), p_quest_id)
    on conflict do nothing;
  if found then
    insert into cr_stats (user_id, xp) values (auth.uid(), 20)
      on conflict (user_id) do update set xp = cr_stats.xp + 20;
    return true;
  end if;
  return false;
end $$;
revoke all on function public.cr_claim_quest(text) from public;
revoke all on function public.cr_claim_quest(text) from anon;
grant execute on function public.cr_claim_quest(text) to authenticated;

-- ============ VS-COMPUTER GAME HISTORY ============
-- player_color: 'x' | 'o' (the human's seat) | 'cvc' (computer vs
-- computer rows, recorded from X's point of view and EXCLUDED from
-- stats/Elo below).
-- moves: space-separated zero-based cell indices, e.g. '112 113 98'.
-- start_pos: serialized position (standard games use the default).
create table if not exists cr_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  player_color text not null check (player_color in ('x', 'o', 'cvc')),
  ai_level int not null,
  board_size int not null default 15 check (board_size in (10, 15, 20)),
  result text not null check (result in ('win', 'loss', 'draw')),
  plies int not null default 0,
  moves text not null default '',
  start_pos text not null
    default 'cr1:15:1:000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
  created_at timestamptz not null default now()
);
alter table cr_games add column if not exists board_size int not null default 15
  check (board_size in (10, 15, 20));
alter table cr_games enable row level security;
drop policy if exists "cr_games self" on cr_games;
create policy "cr_games self" on cr_games
  for all using (auth.uid() = user_id);

-- ============ RATING HISTORY (sparkline) ============
create table if not exists cr_rating_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  rating int not null,
  xp int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists cr_rating_history_user_idx
  on cr_rating_history (user_id, created_at);
alter table cr_rating_history enable row level security;
drop policy if exists "cr_rating_history self read" on cr_rating_history;
create policy "cr_rating_history self read" on cr_rating_history
  for select using (auth.uid() = user_id);
-- No client INSERT policy: rows are written only by the
-- SECURITY DEFINER record RPC below.

-- ============ RECORD RESULT: XP + ELO, SERVER-SIDE ============
-- The ONLY write path for vs-computer results (guests included: a guest's
-- game row is recorded with user_id NULL, stats/Elo skipped).
--   XP: win 10 + 5*level (frozen), draw 5, loss 3.
--   Elo: start 800, AI pseudo-ratings 300..2400, expected score
--     1/(1+10^((opp-me)/400)), K = 40 for the first 20 recorded games
--     else 24, floor 100, peak tracked.
--   Delta rounding uses floor(x + 0.5) to match JS Math.round exactly.
-- CvC rows (p_color = 'cvc') record the game row only — no stats, no Elo.
drop function if exists public.cr_record_game_result(text, int, text, int, text, text);
create or replace function public.cr_record_game_result(
  p_color text,
  p_level int,
  p_result text,
  p_plies int,
  p_moves text default '',
  p_start_pos text default 'cr1:15:1:000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
,
  p_board_size int default 15
) returns int language plpgsql security definer set search_path = public as $$
declare
  v_gain int;
  v_uid uuid := auth.uid();
  v_rating int;
  v_games int;
  v_score numeric;
  v_expected numeric;
  v_k int;
  v_new int;
  v_xp int;
begin
  if p_result not in ('win', 'loss', 'draw') then
    raise exception 'invalid result';
  end if;
  v_gain := case p_result
    when 'win' then 10 + 5 * p_level
    when 'draw' then 5
    else 3 end;

  insert into cr_games (
    user_id, player_color, ai_level, board_size, result, plies, moves, start_pos
  )
  values (
    v_uid,
    p_color,
    p_level,
    case when p_board_size in (10, 15, 20) then p_board_size else 15 end,
    p_result,
    p_plies,
    p_moves,
    coalesce(
      nullif(p_start_pos, ''),
      'cr1:15:1:000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
    )
  );

  -- Guests and CvC games: history row only, no stats/Elo.
  if v_uid is null or p_color = 'cvc' then
    return v_gain;
  end if;

  select rating, games_played into v_rating, v_games
    from cr_stats where user_id = v_uid;
  v_rating := coalesce(v_rating, 800);
  v_games := coalesce(v_games, 0);
  v_score := case p_result when 'win' then 1 when 'draw' then 0.5 else 0 end;
  v_expected := 1.0 / (1.0 + power(10.0, (public.cr_ai_rating(p_level) - v_rating) / 400.0));
  v_k := case when v_games < 20 then 40 else 24 end;
  v_new := greatest(100, v_rating + floor(v_k * (v_score - v_expected) + 0.5)::int);

  insert into cr_stats (user_id, xp, games_played, wins, rating, peak_rating)
    values (
      v_uid, v_gain, 1,
      case when p_result = 'win' then 1 else 0 end,
      v_new,
      greatest(800, v_new)
    )
    on conflict (user_id) do update set
      xp = cr_stats.xp + excluded.xp,
      games_played = cr_stats.games_played + 1,
      wins = cr_stats.wins + excluded.wins,
      rating = v_new,
      peak_rating = greatest(cr_stats.peak_rating, v_new)
  returning cr_stats.xp into v_xp;

  insert into cr_rating_history (user_id, rating, xp)
    values (v_uid, v_new, v_xp);

  return v_gain;
end $$;
revoke all on function public.cr_record_game_result(text,int,text,int,text,text,int) from public;
revoke all on function public.cr_record_game_result(text,int,text,int,text,text,int) from anon;
grant execute on function public.cr_record_game_result(text,int,text,int,text,text,int) to anon, authenticated;

-- ============ LIBRARY PROGRESS (shared table, caro- lesson ids) ============
-- The table already exists in the shared database (created for Xiangqi);
-- this is idempotent and only ensures the table and an own-rows policy exist.
create table if not exists library_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id text not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
alter table library_progress enable row level security;
drop policy if exists "Caro users manage own library progress" on library_progress;
create policy "Caro users manage own library progress"
  on library_progress for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
