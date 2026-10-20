# Cờ Ca-rô (Gomoku) — SQL launch notes

Run order: **001 → 011, in numeric order, in the Supabase Dashboard SQL editor**
on the shared family project (the same project that hosts the other games'
tables, `profiles`, and `game_registry`). Every file is idempotent — safe
to re-run if a step is interrupted. Paste each file **verbatim** (standing
rule: never retype SQL).

## Files

| File | What it does |
|---|---|
| `001_cr_foundation.sql` | Core: `cr_stats` (XP, Elo rating/peak, W/L/D, welcome flag) + public leaderboard policy; `cr_ai_rating()` (internal AI pseudo-ratings 300–2400); `cr_leaderboard()` (server-ranked board, anon-safe names); daily check-ins `cr_claim_checkin()` (Asia/Ho_Chi_Minh day boundary, streak, XP 10→40); quests `cr_claim_welcome()` (+50) / `cr_claim_quest()` (+20: play_1, win_1, join_room); vs-computer history `cr_games` (seats are **X/O end to end**: `player_color` `'x'|'o'|'cvc'`; moves = space-separated zero-based cell indices — algebraic labels like H8 are display-only, never stored; `start_pos` = serialized `cr1:` position; **`board_size`** 10/15/20 stored per game, `cr_record_game_result(..., p_board_size)` coerces anything else to 15); `cr_rating_history` (sparkline); `cr_record_game_result()` — the single write path: **solo win XP = 10+5×level**, draw 5, loss 3; Elo start 800, K40 (<20 games) → 24, floor 100, peak tracked, `floor(x+0.5)` rounding; guests recorded (NULL user), CvC rows (`player_color='cvc'`) excluded from stats/Elo. Also ensures the shared `library_progress` table + own-rows policy. |
| `002_cr_game_events.sql` | Site stats: `cr_game_events` (start/finish/abandon, guests included); `cr_game_stats()` aggregate (authenticated-only); `record_cr_game_event()` write RPC (anon + authenticated). |
| `003_cr_rooms.sql` | Rooms core: `cr_rooms` (with **`board_size`** — host's pick of 10/15/20) / `cr_room_members`; `is_cr_room_member()` / `is_cr_room_leader()` helpers (kept executable by anon+authenticated — RLS policies evaluate with caller privileges); room SELECT policy with leader clause; `cr_create_room(name, public, max, board_size)` RPC (server-side code, leader member row, atomic; invalid size falls back to 15); `cr_challenges` (denormalized `room_code`, status check, **replica identity full** for the accept subscription); `cr_referrals` + `cr_claim_referral()` (+20/+20). |
| `004_cr_room_play.sql` | Room play: `cr_room_matches` (**`x_id`/`o_id`** seats, X = first to move; **`board_size` copied from the room** and `start_pos` = serialized empty board at that size; moves = space-separated cell indices; results `'x'`/`'o'`/`'draw'`); `cr_room_comments` (with `move_number` from day one); `cr_match_reactions`; `cr_tournaments` (pairings keyed `x`/`o`); XP ledger + internal `cr_award_room_xp()`; membership RPCs (join/leave/kick/role/turn-order/close/rules/public); match RPCs — `cr_start_next_match` (rotation, X seat = v_order[1]), `cr_finish_room_match` (XP: win 15 / draw 8 / loss 5, ≥10 plies anti-farm — plies counted on the space-separated format; host +5 cap 10/day; daily +10; **pairwise Elo** both players from pre-match snapshots; tournament write-back; idempotent), `cr_cancel_room_match`, `cr_rematch` (swapped seats, same size); tournament RPCs (create/next/cancel, matches inherit room size); comment-XP trigger (+2, cap 10/day, fires daily bonus); guest discovery RPCs (`cr_preview_room`, `cr_list_public_rooms`, `cr_room_leaderboard`, `cr_guest_room_detail` incl. match `board_size`) — all anon-safe; anon SELECT policies for public rooms; realtime publication for all room tables. |
| `005_cr_correspondence.sql` | Async games: `cr_corr_games` (`x_id`/`o_id` seats, **`board_size`** chosen at creation, moves = space-separated cell indices, player-only RLS, realtime). |
| `006_cr_puzzles.sql` | Daily puzzles: `cr_puzzle_solves` + `cr_record_puzzle_solve()` (+15 XP, idempotent). Community puzzles: `cr_community_puzzles` / `_solves` / `_likes` (public read; owner insert/update/delete) + RPCs: `cr_community_puzzle_cards` / `cr_community_puzzle_card` (anon-safe, `new`/`popular`/`weekly`/`mine` sorts), `cr_solve_community_puzzle` (solver +10 cap 5/day, creator +5 per distinct solver cap 50, self-solve 0), `cr_toggle_community_like`, internal `cr_maybe_feature_puzzle` (8 likes or 20 solves → featured + creator +50). Caro semantics: `pos` = serialized position, **`board_size`** denormalized from it (also returned by the cards/card RPCs), `solution` = space-separated SET of acceptable winning cell indices, `moves_to_mate` = 1. |
| `007_cr_push.sql` | `cr_push_subscriptions` (owner-only RLS) + `cr_notifications` inbox (user SELECT/UPDATE own; **no client INSERT** — server writes via service-role key). |
| `008_cr_setups.sql` | Saved setups: `cr_setups` (name + serialized `pos` + denormalized `board_size`, self-RLS, direct client CRUD). |
| `009_cr_registry.sql` | Hub `game_registry` row: slug `caro`, name_en `Gomoku`, ✖️, accent `#0e7fa8`, `https://cocaro.synerworlds.com`, stats `cr_stats`, prefix `cr_`, seat columns `x_id`/`o_id`, sort 96. Lights the game up on the hub with zero hub changes. |
| `010_cr_room_chat.sql` | In-room private chat: `cr_room_messages` (members — players AND spectators — read/post via `is_cr_room_member` policies; direct table access, no RPC; realtime). Client channel: `cr-room-chat:<roomId>`. |
| `011_cr_room_delete.sql` | Owner room deletion: `cr_delete_room()` — soft-close (`status='closed'`) with server-side guards: non-leader → `not_leader`, active match → `match_in_progress`. Authenticated-only. |

## Conventions baked in

- **Seats are X and O everywhere** (schema, code, UI): `x_id` / `o_id` on every match table (rooms, tournaments, correspondence); **X moves first**; results are stored from **X's** point of view. Human = X vs computer = O in solo play.
- **One move encoding:** move lists are space-separated zero-based cell indices in every table (`cr_games`, `cr_room_matches`, `cr_corr_games`, community `solution` sets); positions are the `cr1:` serialization; algebraic labels (H8) are display-only.
- **Serialized position** (`start_pos` defaults in `cr_games`/`cr_room_matches`, `pos` columns in setups/puzzles):
  `cr1:<size>:<turn 1=X | 2=O>:<cells row-major, '0' empty / '1' X / '2' O>` — the default literal is `cr1:15:1:` followed by 225 zeros (empty 15×15, X to move). Room matches generate theirs from the room's `board_size`.
- **Grant posture:** every `SECURITY DEFINER` function revokes from `public` **and** `anon`, then grants only to the roles that need it (internal helpers revoked from everyone including `authenticated`; the two RLS helpers keep anon+authenticated because policy evaluation needs them). All PL/pgSQL variables are `v_`-prefixed. RLS on every table; anon reads only explicitly public data (leaderboard, public rooms, puzzles, discovery RPCs).
- **Display names:** `full_name` → `username` → email prefix from `auth.users` (the shared `profiles` table has **no** email column).

## After the SQL (launch pack)

1. **Vercel env** for project `cocaro` (prj_XdBWy1oRdiw6fsczitbsy8Xiq4q8): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key), `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, plus the Cloudflare TURN pair (same values as the other 12 projects). Framework preset is already `nextjs`; `vercel.json` disables git auto-deploy (manual batched deploys, family regime).
2. **Domain:** `cocaro.synerworlds.com` attached at Cloudflare/Vercel (same pattern as the other subdomains).
3. **Supabase Dashboard → Authentication → URL Configuration:** add `https://cocaro.synerworlds.com/**` to redirect URLs (shared-SSO cookie domain `.synerworlds.com` is already the family setup).
4. **Play-tests (two accounts):** SSO sign-in, solo game + XP/Elo landing, room match at 10×10 and 20×20, room chat + voice (incl. spectator listener), room delete guards, challenge accept auto-entering the room, correspondence move + push, daily + community puzzle solve, push subscribe (SW registers from the layout snippet).

## Verification

`tools/cr-sql-smoke.mjs` (in this repo) — grant-faithful PGlite harness
(production-shape `profiles` without email, GUC-driven `auth.uid()`,
Supabase default table privileges, **no** blanket function grants;
denials assert role-specific codes). Run: `node tools/cr-sql-smoke.mjs`.
Current: **48/48 probes pass** over the full 001→011 chain, incl.
hand-computed Elo sequences (solo 800→802→842, floor clamp at 100;
room pairwise 100→139 / 800→761), XP totals, idempotent re-finish,
board-size plumbing (room 20 → match `board_size` + `cr1:20:…`
start_pos; bogus size → 15; rematch/tournament inherit), comment
trigger, tournament write-back, challenge room_code flow,
correspondence RLS, community-puzzle XP/feature thresholds,
room chat (member ok / non-member + anon 42501), room delete
(`not_leader` / `match_in_progress` / success / anon 42501), and
grant-denial probes for every internal/authenticated-only RPC.

Engine + content: `node tools/verify-caro.mjs` (68/68),
`bun tools/verify-puzzles.ts` (16/16), `bun tools/verify-lessons.ts` (6/6).
