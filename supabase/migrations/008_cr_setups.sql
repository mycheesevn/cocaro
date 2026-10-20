-- 008_cr_setups.sql — Saved board setups: users arrange a position in
-- the setup editor and reuse it later without re-placing every piece.
-- One row per saved position (name + serialized position `cr1:...`,
-- which carries the board size, the stones, and the side to move).
-- Same self-RLS pattern as cr_games: the client CRUDs its own rows
-- directly, no RPC needed. Run AFTER 007. Idempotent.

create table if not exists cr_setups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  pos text not null,
  board_size int not null default 15 check (board_size in (10, 15, 20)),
  created_at timestamptz not null default now()
);
alter table cr_setups add column if not exists board_size int not null default 15
  check (board_size in (10, 15, 20));
create index if not exists cr_setups_user_idx
  on cr_setups (user_id, created_at desc);

alter table cr_setups enable row level security;
drop policy if exists "cr_setups self" on cr_setups;
create policy "cr_setups self" on cr_setups
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
