-- 002_cr_game_events.sql — site statistics (family standard):
-- append-only vs-computer game events + one aggregate RPC.
-- The member counts below intentionally read the shared profiles table
-- (one community across the family). Run in the Dashboard SQL editor.

create table if not exists cr_game_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  event text not null check (event in ('start','finish','abandon')),
  result text check (result in ('win','loss','draw')),
  level int,
  player_color text,
  time_control int,
  created_at timestamptz not null default now()
);
create index if not exists cr_game_events_created_idx on cr_game_events (created_at desc);
create index if not exists cr_game_events_event_idx on cr_game_events (event);
alter table cr_game_events enable row level security;
drop policy if exists "Anyone can record caro game events" on cr_game_events;
create policy "Anyone can record caro game events" on cr_game_events
  for insert to anon, authenticated with check (true);

-- Aggregates. Authenticated only (guests recording is fine; viewing is
-- a member surface). Buckets: {d: bucket-start date, c: count}.
create or replace function public.cr_game_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_r jsonb;
begin
  select jsonb_build_object(
    'plays_total',   (select count(*) from cr_game_events where event = 'start'),
    'plays_member',  (select count(*) from cr_game_events where event = 'start' and user_id is not null),
    'plays_guest',   (select count(*) from cr_game_events where event = 'start' and user_id is null),
    'finished',      (select count(*) from cr_game_events where event = 'finish'),
    'abandoned',     (select count(*) from cr_game_events where event = 'abandon'),
    'members_total', (select count(*) from profiles),
    'members_today', (select count(*) from profiles where created_at >= date_trunc('day', now())),
    'members_week',  (select count(*) from profiles where created_at >= date_trunc('week', now())),
    'members_month', (select count(*) from profiles where created_at >= date_trunc('month', now())),
    'plays_daily', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'c', c) order by d), '[]'::jsonb)
      from (select date_trunc('day', created_at)::date as d, count(*) as c
            from cr_game_events where event = 'start' and created_at >= date_trunc('day', now()) - interval '29 days'
            group by 1) t),
    'plays_weekly', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'c', c) order by d), '[]'::jsonb)
      from (select date_trunc('week', created_at)::date as d, count(*) as c
            from cr_game_events where event = 'start' and created_at >= date_trunc('week', now()) - interval '11 weeks'
            group by 1) t),
    'plays_monthly', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'c', c) order by d), '[]'::jsonb)
      from (select date_trunc('month', created_at)::date as d, count(*) as c
            from cr_game_events where event = 'start' and created_at >= date_trunc('month', now()) - interval '11 months'
            group by 1) t),
    'plays_yearly', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'c', c) order by d), '[]'::jsonb)
      from (select date_trunc('year', created_at)::date as d, count(*) as c
            from cr_game_events where event = 'start'
            group by 1) t),
    'members_daily', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'c', c) order by d), '[]'::jsonb)
      from (select date_trunc('day', created_at)::date as d, count(*) as c
            from profiles where created_at >= date_trunc('day', now()) - interval '29 days'
            group by 1) t),
    'members_weekly', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'c', c) order by d), '[]'::jsonb)
      from (select date_trunc('week', created_at)::date as d, count(*) as c
            from profiles where created_at >= date_trunc('week', now()) - interval '11 weeks'
            group by 1) t),
    'members_monthly', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'c', c) order by d), '[]'::jsonb)
      from (select date_trunc('month', created_at)::date as d, count(*) as c
            from profiles where created_at >= date_trunc('month', now()) - interval '11 months'
            group by 1) t),
    'members_yearly', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'c', c) order by d), '[]'::jsonb)
      from (select date_trunc('year', created_at)::date as d, count(*) as c
            from profiles
            group by 1) t)
  ) into v_r;
  return v_r;
end;
$function$;
revoke all on function public.cr_game_stats() from public;
revoke all on function public.cr_game_stats() from anon;
grant execute on function public.cr_game_stats() to authenticated;

-- Write path: SECURITY DEFINER, server stamps auth.uid() (guests NULL).
create or replace function public.record_cr_game_event(
  p_event text,
  p_result text default null,
  p_level int default null,
  p_player_color text default null,
  p_time_control int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if p_event not in ('start', 'finish', 'abandon') then
    raise exception 'invalid event';
  end if;
  insert into cr_game_events (user_id, event, result, level, player_color, time_control)
  values (auth.uid(), p_event, p_result, p_level, p_player_color, p_time_control);
end;
$function$;
revoke all on function public.record_cr_game_event(text, text, int, text, int) from public;
revoke all on function public.record_cr_game_event(text, text, int, text, int) from anon;
grant execute on function public.record_cr_game_event(text, text, int, text, int) to anon, authenticated;
