-- 009_cr_registry.sql — SynerWorlds hub registration for Caro.
-- One registry row lights the game up across the whole hub (home,
-- profiles, rooms, friends-playing, activity, LFG, family statistics):
-- the hub's aggregators loop registry rows (hub migration 004) using
-- prefix 'cr_', stats source 'cr_stats', and the room-match seat
-- columns x_id (first to move) / o_id.
-- Run in the Dashboard SQL editor AFTER 008 (on the shared project).

insert into public.game_registry
  (slug, name_vi, name_en, tagline_vi, tagline_en, site_url, stats_source,
   icon, accent, sort, prefix, match_col_a, match_col_b)
values
  ('caro', 'Cờ Ca-rô', 'Gomoku',
   'Cờ Ca-rô — nối 5 quân trên bàn ô ly 10×10, 15×15, 20×20',
   'Gomoku — five in a row on 10×10, 15×15, 20×20 boards',
   'https://cocaro.synerworlds.com', 'cr_stats', '✖️', '#0e7fa8', 96,
   'cr_', 'x_id', 'o_id')
on conflict (slug) do update set
  name_vi = excluded.name_vi, name_en = excluded.name_en,
  tagline_vi = excluded.tagline_vi, tagline_en = excluded.tagline_en,
  site_url = excluded.site_url, stats_source = excluded.stats_source,
  icon = excluded.icon, accent = excluded.accent, sort = excluded.sort,
  prefix = excluded.prefix,
  match_col_a = excluded.match_col_a, match_col_b = excluded.match_col_b,
  active = true;
