-- 005_cr_correspondence.sql — Correspondence (async) caro: slow games
-- where each side moves whenever they are online. One row per game, moves
-- as space-separated zero-based cell indices (e.g. '112 113 98').
-- Run in the Dashboard SQL editor AFTER 004. Idempotent.

create table if not exists cr_corr_games (
  id uuid primary key default gen_random_uuid(),
  x_id uuid not null references profiles(id) on delete cascade,
  o_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'finished')),
  board_size int not null default 15 check (board_size in (10, 15, 20)),
  moves text not null default '',
  result text check (result in ('x', 'o', 'draw')),
  winner_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table cr_corr_games enable row level security;
alter table cr_corr_games
  add column if not exists board_size int not null default 15
  check (board_size in (10, 15, 20));

drop policy if exists "cr_corr_games player read" on cr_corr_games;
create policy "cr_corr_games player read" on cr_corr_games
  for select using (auth.uid() = x_id or auth.uid() = o_id);
drop policy if exists "cr_corr_games player insert" on cr_corr_games;
create policy "cr_corr_games player insert" on cr_corr_games
  for insert with check (auth.uid() = x_id or auth.uid() = o_id);
drop policy if exists "cr_corr_games player update" on cr_corr_games;
create policy "cr_corr_games player update" on cr_corr_games
  for update using (
    status = 'active' and (auth.uid() = x_id or auth.uid() = o_id));

-- Realtime so opponent moves arrive live.
do $$ begin
  alter publication supabase_realtime add table public.cr_corr_games;
exception when duplicate_object then null;
end $$;
