-- 007_cr_push.sql — Web Push subscriptions + in-app notification inbox
-- for caro. Run in the Dashboard SQL editor AFTER 006. Idempotent.

-- Web Push subscriptions (VAPID). One row per user+endpoint.
create table if not exists public.cr_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);
alter table public.cr_push_subscriptions enable row level security;
drop policy if exists "cr_push_subscriptions owner all" on public.cr_push_subscriptions;
create policy "cr_push_subscriptions owner all"
  on public.cr_push_subscriptions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- In-app notification inbox: every push-worthy event is also stored here
-- so users can review missed notifications later.
-- kind: 'challenge' | 'challenge_declined' | 'turn' | 'corr' | 'corr_end'
create table if not exists public.cr_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  kind text not null,
  title text not null,
  body text not null default '',
  url text not null default '/',
  ref_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists cr_notifications_user_idx
  on public.cr_notifications(user_id, created_at desc);
alter table public.cr_notifications enable row level security;

drop policy if exists "Users can view own caro notifications" on public.cr_notifications;
create policy "Users can view own caro notifications"
  on public.cr_notifications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can mark own caro notifications read" on public.cr_notifications;
create policy "Users can mark own caro notifications read"
  on public.cr_notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- NOTE: no client INSERT policy on purpose — rows are written by the
-- server-side push trigger with the service-role key.
