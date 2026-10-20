// cr-sql-smoke.mjs — grant-faithful smoke test for the Cờ Ca-rô (cr_)
// migration set (001→011). Runs every migration in order against a REAL
// Postgres (PGlite/WASM) with Supabase stubs whose `profiles` matches
// production's real shape (NO email column), then runs behavioral +
// grant probes, including the room-chat and room-delete trio sections.
//
// GRANT-FAITHFUL: no blanket function grants anywhere — privileges come
// ONLY from the migrations themselves + Postgres defaults. Probes run
// under SET ROLE anon / authenticated with a GUC-driven auth.uid() stub,
// and denials assert role-specific error codes (42501 / not_leader /
// match_in_progress), so a probe running as the wrong role cannot pass.
//
// Usage: node tools/cr-sql-smoke.mjs
// PGlite lives in the shared family tools dir on this machine; fall
// back to its absolute path when the package isn't installed here.
const { PGlite } = await import("@electric-sql/pglite").catch(() =>
  import("/home/hatch/workspace/tools/node_modules/@electric-sql/pglite/dist/index.js")
);
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const POS15 = "cr1:15:1:" + "0".repeat(225);
const POS20 = "cr1:20:1:" + "0".repeat(400);
// 20 plies, comma-separated cell indices (room/correspondence format).
const MOVES20 = Array.from({ length: 20 }, (_, i) => 100 + i).join(" ");

const db = new PGlite();
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  -- GUC-driven uid stub: SET request.jwt.claim.sub='<uuid>' to impersonate.
  create or replace function auth.uid() returns uuid
    language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  -- Production-shape profiles: NO email column (email lives in auth.users).
  create table public.profiles (
    id uuid primary key, username text, full_name text, birth_date date,
    avatar_url text, city text, country text,
    created_at timestamptz not null default now());
  -- Hub registry stub (hub migration 001+004 columns used by 009).
  create table public.game_registry (
    slug text primary key, name_vi text not null, name_en text not null,
    tagline_vi text, tagline_en text, site_url text not null,
    stats_source text, icon text, accent text, sort int,
    prefix text not null default '', match_col_a text, match_col_b text,
    active boolean not null default true);
  create publication supabase_realtime;
`);

// Supabase's default privileges (what production has): tables created in
// the public schema are granted to anon/authenticated; RLS policies then
// do the actual access control. This is NOT a function grant — function
// privileges still come only from the migrations.
await db.exec(`
  alter default privileges for role postgres in schema public
    grant select, insert, update, delete on tables to authenticated;
  alter default privileges for role postgres in schema public
    grant select on tables to anon;
`);

const FILES = [
  "001_cr_foundation.sql", "002_cr_game_events.sql", "003_cr_rooms.sql",
  "004_cr_room_play.sql", "005_cr_correspondence.sql", "006_cr_puzzles.sql",
  "007_cr_push.sql", "008_cr_setups.sql", "009_cr_registry.sql",
  "010_cr_room_chat.sql", "011_cr_room_delete.sql",
];
for (const f of FILES) {
  const sql = readFileSync(path.join(root, "supabase/migrations", f), "utf8");
  try {
    await db.exec(sql);
    console.log(`OK   ${f}`);
  } catch (e) {
    console.log(`FAIL ${f}\n  ${e.message.split("\n")[0]}`);
    process.exit(1);
  }
}

// ---------- probe helpers ----------
let pass = 0, fail = 0;
async function asRole(role, uid) {
  await db.exec(`reset role; reset request.jwt.claim.sub;`);
  if (role) await db.exec(`set role ${role};`);
  if (uid) await db.exec(`set request.jwt.claim.sub = '${uid}';`);
}
const q = (sql) => db.query(sql);
async function ok(name, fn) {
  try { await fn(); pass++; console.log(`PASS ${name}`); }
  catch (e) { fail++; console.log(`FAIL ${name}\n  ${e.message.split("\n")[0]}`); }
}
function eq(a, b, what) {
  if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
async function expectDenied(name, sql) {
  try { await db.query(sql); fail++; console.log(`FAIL ${name}: expected 42501, succeeded`); }
  catch (e) {
    if (/42501|permission denied|policy/.test(e.message)) { pass++; console.log(`PASS ${name}`); }
    else { fail++; console.log(`FAIL ${name}: wrong error: ${e.message.split("\n")[0]}`); }
  }
}
async function expectRaise(name, sql, code) {
  try { await db.query(sql); fail++; console.log(`FAIL ${name}: expected raise ${code}, succeeded`); }
  catch (e) {
    if (e.message.includes(code)) { pass++; console.log(`PASS ${name}`); }
    else { fail++; console.log(`FAIL ${name}: wrong error: ${e.message.split("\n")[0]}`); }
  }
}

// ---------- seed users ----------
const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const C = "33333333-3333-3333-3333-333333333333";
const D = "44444444-4444-4444-4444-444444444444";
await asRole(null, null);
for (const [u, em, fn] of [
  [A, "mai@example.com", "Mai Chi"], [B, "kien@example.com", "Kiên"],
  [C, "c@example.com", "C"], [D, "d@example.com", "D"],
]) {
  await q(`insert into auth.users (id, email) values ('${u}', '${em}')`);
  await q(`insert into profiles (id, username, full_name) values ('${u}', '${fn}', '${fn}')`);
}

// ---------- 1. hand-computed Elo probes (solo record RPC) ----------
// Win vs L1 (ai 300) from 800: expected=1/(1+10^-1.25)=0.94677,
// delta=floor(40*(1-0.94677)+0.5)=floor(2.629)=2 -> 802. XP=10+5*1=15.
await ok("solo win L1 -> rating 802, xp 15", async () => {
  await asRole("authenticated", A);
  const r = await q(`select public.cr_record_game_result('x',1,'win',20,'112 113') as xp`);
  eq(r.rows[0].xp, 15, "xp");
  const s = await q(`select rating, peak_rating, xp, games_played, wins from cr_stats where user_id='${A}'`);
  eq(s.rows[0].rating, 802, "rating"); eq(s.rows[0].peak_rating, 802, "peak");
  eq(s.rows[0].xp, 15, "stats xp"); eq(s.rows[0].games_played, 1, "games"); eq(s.rows[0].wins, 1, "wins");
  const h = await q(`select rating, xp from cr_rating_history where user_id='${A}' order by created_at`);
  eq(h.rows.length, 1, "history rows"); eq(h.rows[0].rating, 802, "history rating");
});
// Loss vs L12 (ai 2400) at 802: expected~0.0001, delta=floor(40*(0-0.0001)+0.5)=0 -> 802. XP=15+3=18.
await ok("solo loss L12 -> rating stays 802", async () => {
  await asRole("authenticated", A);
  const r = await q(`select public.cr_record_game_result('x',12,'loss',30,'112 113') as xp`);
  eq(r.rows[0].xp, 3, "xp");
  const s = await q(`select rating, xp, games_played from cr_stats where user_id='${A}'`);
  eq(s.rows[0].rating, 802, "rating"); eq(s.rows[0].xp, 18, "xp"); eq(s.rows[0].games_played, 2, "games");
});
// Win vs L12 at 802: delta=floor(40*(1-0.0001)+0.5)=40 -> 842. XP=18+70=88.
await ok("solo win L12 -> rating 842", async () => {
  await asRole("authenticated", A);
  const r = await q(`select public.cr_record_game_result('x',12,'win',40,'112 113') as xp`);
  eq(r.rows[0].xp, 70, "xp");
  const s = await q(`select rating, peak_rating, xp from cr_stats where user_id='${A}'`);
  eq(s.rows[0].rating, 842, "rating"); eq(s.rows[0].peak_rating, 842, "peak"); eq(s.rows[0].xp, 88, "xp");
});
// Floor: drop A to 105, loss vs L1 -> raw 95 -> floored to 100.
await ok("rating floor 100", async () => {
  await asRole(null, null);
  await q(`update cr_stats set rating=105 where user_id='${A}'`);
  await asRole("authenticated", A);
  await q(`select public.cr_record_game_result('x',1,'loss',20,'112 113')`);
  const s = await q(`select rating from cr_stats where user_id='${A}'`);
  eq(s.rows[0].rating, 100, "floored rating");
});
// Guest path: row recorded with NULL user_id, no stats/Elo touched.
await ok("guest record: history row, no stats", async () => {
  await asRole("anon", null);
  const r = await q(`select public.cr_record_game_result('x',1,'win',20,'112 113') as xp`);
  eq(r.rows[0].xp, 15, "guest xp returned");
  await asRole(null, null); // RLS hides NULL-user rows from anon; verify as owner
  const g = await q(`select count(*)::int c from cr_games where user_id is null`);
  eq(g.rows[0].c, 1, "guest row");
});
// Default start_pos = the serialized empty 15x15 board.
await ok("default start_pos is the empty 15x15 board", async () => {
  await asRole(null, null);
  const r = await q(`select start_pos from cr_games order by created_at desc limit 1`);
  eq(r.rows[0].start_pos, POS15, "start_pos");
});
// CvC rows excluded from stats.
await ok("cvc rows excluded from stats", async () => {
  await asRole("authenticated", B);
  await q(`select public.cr_record_game_result('cvc',12,'win',60,'112 113')`);
  const s = await q(`select count(*)::int c from cr_stats where user_id='${B}'`);
  eq(s.rows[0].c, 0, "no stats row for cvc-only player");
});

await ok("record: board_size stored (explicit 20, bogus 12 -> 15)", async () => {
  await asRole("authenticated", B);
  await q(`select public.cr_record_game_result(p_color := 'x', p_level := 1, p_result := 'win', p_plies := 3, p_moves := '112', p_board_size := 20)`);
  await q(`select public.cr_record_game_result(p_color := 'x', p_level := 1, p_result := 'win', p_plies := 3, p_moves := '112', p_board_size := 12)`);
  const g = await q(`select board_size from cr_games where user_id='${B}' order by created_at desc limit 2`);
  eq(g.rows[0].board_size, 15, "bogus size coerced to 15");
  eq(g.rows[1].board_size, 20, "explicit 20 stored");
  // Clean up so later sections see B's original footprint.
  await asRole(null, null);
  await q(`delete from cr_games where user_id='${B}' and moves='112'`);
  await q(`delete from cr_rating_history where user_id='${B}'`);
  await q(`delete from cr_stats where user_id='${B}'`);
});

// ---------- 2. check-in + quests ----------
await ok("checkin: streak 1, +10 xp, idempotent", async () => {
  await asRole("authenticated", A);
  const r1 = await q(`select * from public.cr_claim_checkin()`);
  eq(r1.rows[0].streak, 1, "streak"); eq(r1.rows[0].xp_awarded, 10, "xp"); eq(r1.rows[0].already_claimed, false, "fresh");
  const r2 = await q(`select * from public.cr_claim_checkin()`);
  eq(r2.rows[0].already_claimed, true, "idempotent"); eq(r2.rows[0].xp_awarded, 0, "no double xp");
});
await ok("welcome + quests", async () => {
  await asRole("authenticated", C);
  eq((await q(`select public.cr_claim_welcome()`)).rows[0].cr_claim_welcome, true, "welcome");
  eq((await q(`select public.cr_claim_welcome()`)).rows[0].cr_claim_welcome, false, "welcome once");
  eq((await q(`select public.cr_claim_quest('play_1')`)).rows[0].cr_claim_quest, false, "play_1 not done");
  await q(`select public.cr_record_game_result('x',1,'loss',10,'112')`);
  eq((await q(`select public.cr_claim_quest('play_1')`)).rows[0].cr_claim_quest, true, "play_1");
  eq((await q(`select public.cr_claim_quest('play_1')`)).rows[0].cr_claim_quest, false, "play_1 once");
  eq((await q(`select public.cr_claim_quest('bogus')`)).rows[0].cr_claim_quest, false, "bogus quest");
});

// ---------- 3. room flow (board size 20 end-to-end) ----------
let roomCode, roomId, matchId;
await ok("create room via RPC with board_size 20", async () => {
  await asRole("authenticated", A);
  const r = await q(`select * from public.cr_create_room('Test room', true, 8, 20)`);
  roomCode = r.rows[0].code; roomId = r.rows[0].id;
  eq(r.rows[0].code.length, 6, "code len");
  eq(r.rows[0].board_size, 20, "board_size stored");
  eq(r.rows[0].turn_order[0], A, "leader first in turn_order");
  const m = await q(`select count(*)::int c from cr_room_members where room_id='${roomId}'`);
  eq(m.rows[0].c, 1, "leader member row");
});
await ok("create room with bogus size falls back to 15", async () => {
  await asRole("authenticated", A);
  const r = await q(`select * from public.cr_create_room('Size check', false, 8, 12)`);
  eq(r.rows[0].board_size, 15, "fallback 15");
});
await ok("join room by code (idempotent)", async () => {
  await asRole("authenticated", B);
  const r = await q(`select * from public.cr_join_room('${roomCode}')`);
  eq(r.rows[0].id, roomId, "same room");
  const r2 = await q(`select * from public.cr_join_room('${roomCode}')`);
  eq(r2.rows[0].id, roomId, "idempotent");
  const o = await q(`select turn_order from cr_rooms where id='${roomId}'`);
  eq(o.rows[0].turn_order.join(","), [A, B].join(","), "turn_order");
});
await ok("non-leader cannot start match", async () => {
  await asRole("authenticated", B);
  await expectRaise("non-leader start denied (not_leader)", `select * from public.cr_start_next_match('${roomId}')`, "not_leader");
});
await ok("start match: seats + board_size + serialized start_pos", async () => {
  await asRole("authenticated", A);
  const r = await q(`select * from public.cr_start_next_match('${roomId}')`);
  matchId = r.rows[0].id;
  eq(r.rows[0].x_id, A, "x_id = first player");
  eq(r.rows[0].o_id, B, "o_id = second player");
  eq(r.rows[0].board_size, 20, "match board_size copied from room");
  eq(r.rows[0].start_pos, POS20, "start_pos = empty 20x20");
  eq(r.rows[0].status, "active", "active");
});
await ok("player can update own match moves (space indices)", async () => {
  await asRole("authenticated", A);
  await q(`update cr_room_matches set moves='${MOVES20}' where id='${matchId}'`);
  const r = await q(`select moves from cr_room_matches where id='${matchId}'`);
  eq(r.rows[0].moves.split(" ").length, 20, "20 plies");
});
await ok("finish match: XP + pairwise Elo", async () => {
  // Pre-match: A rating 100 (from floor probe), B rating 800, both games<20 -> K=40.
  // A(X,100) beats B(O,800): A expected=1/(1+10^1.75)=0.01747,
  //   delta=floor(40*0.98253+0.5)=39 -> 139.
  // B expected=1/(1+10^-1.75)=0.98253, delta=floor(40*(-0.98253)+0.5)=-39 -> 761.
  await asRole("authenticated", A);
  const r = await q(`select public.cr_finish_room_match('${matchId}','x','five') as j`);
  const j = r.rows[0].j;
  eq(j.play_xp, 15, "winner play xp"); eq(j.host_xp, 5, "host xp"); eq(j.daily_xp, 10, "daily xp");
  const sa = await q(`select rating, xp, games_played, wins from cr_stats where user_id='${A}'`);
  eq(sa.rows[0].rating, 139, "A rating"); eq(sa.rows[0].wins, 3, "A wins");
  const sb = await q(`select rating, xp, games_played, losses from cr_stats where user_id='${B}'`);
  eq(sb.rows[0].rating, 761, "B rating"); eq(sb.rows[0].losses, 1, "B losses");
  // XP: A = 91 solo +10 checkin +15 play +5 host +10 daily = 131; B = 5 +10 daily = 15
  eq(sa.rows[0].xp, 131, "A xp total"); eq(sb.rows[0].xp, 15, "B xp total");
  const h = await q(`select count(*)::int c from cr_rating_history where user_id in ('${A}','${B}') and xp > 0`);
  eq(h.rows[0].c >= 2, true, "room history snapshots");
  const r2 = await q(`select public.cr_finish_room_match('${matchId}','x','five') as j`);
  eq(r2.rows[0].j.play_xp, 0, "re-finish pays 0");
  const sa2 = await q(`select xp from cr_stats where user_id='${A}'`);
  eq(sa2.rows[0].xp, 131, "no double award");
});
await ok("rematch swaps colors, keeps size", async () => {
  await asRole("authenticated", B);
  const r = await q(`select * from public.cr_rematch('${roomId}')`);
  eq(r.rows[0].x_id, B, "swapped X"); eq(r.rows[0].o_id, A, "swapped O");
  eq(r.rows[0].board_size, 20, "rematch board_size"); eq(r.rows[0].start_pos, POS20, "rematch start_pos");
  await asRole("authenticated", A); // leader cancels
  await q(`select public.cr_cancel_room_match('${r.rows[0].id}')`);
});
await ok("comment XP trigger (+2, daily attempt)", async () => {
  await asRole("authenticated", B);
  const before = (await q(`select xp from cr_stats where user_id='${B}'`)).rows[0].xp;
  await q(`insert into cr_room_comments (room_id, user_id, body, move_number) values ('${roomId}','${B}','Nice five!',20)`);
  const after = (await q(`select xp from cr_stats where user_id='${B}'`)).rows[0].xp;
  eq(after - before, 2, "comment +2 (daily already paid by match)");
});

// ---------- 4. tournaments ----------
await ok("tournament: pairings use x/o keys, write-back finishes", async () => {
  await asRole("authenticated", C);
  await q(`select * from public.cr_join_room('${roomCode}')`);
  await asRole("authenticated", A);
  const t = await q(`select * from public.cr_create_tournament('${roomId}','T1')`);
  const tid = t.rows[0].id;
  const pr = t.rows[0].pairings;
  eq(pr.length, 3, "3 pairings for 3 players");
  if (!pr.every((p) => p.x && p.o && "result" in p)) throw new Error("pairing keys");
  for (let k = 0; k < 3; k++) {
    const m = (await q(`select * from public.cr_tournament_next_match('${tid}')`)).rows[0];
    eq(m.start_pos, POS20, `tourney match ${k} start_pos`);
    eq(m.board_size, 20, `tourney match ${k} board_size`);
    await q(`update cr_room_matches set moves='${MOVES20}' where id='${m.id}'`);
    await q(`select public.cr_finish_room_match('${m.id}','draw','agreed')`);
  }
  const st = await q(`select status from cr_tournaments where id='${tid}'`);
  eq(st.rows[0].status, "finished", "auto-finished");
});

// ---------- 5. challenges ----------
await ok("challenge flow with room_code", async () => {
  await asRole("authenticated", A);
  const rm = await q(`select * from public.cr_create_room('duel', false, 2)`);
  await q(`insert into cr_challenges (challenger_id, challenged_id, room_id, room_code)
           values ('${A}','${D}','${rm.rows[0].id}','${rm.rows[0].code}')`);
  await asRole("authenticated", D);
  const ch = await q(`select room_code, status from cr_challenges where challenged_id='${D}'`);
  eq(ch.rows[0].room_code, rm.rows[0].code, "room_code visible pre-join");
  await q(`update cr_challenges set status='accepted' where challenged_id='${D}'`);
  await q(`select * from public.cr_join_room('${rm.rows[0].code}')`); // accept = join by code
  const m = await q(`select count(*)::int c from cr_room_members where room_id='${rm.rows[0].id}'`);
  eq(m.rows[0].c, 2, "both in room");
});

// ---------- 6. correspondence ----------
await ok("correspondence RLS + board_size", async () => {
  await asRole("authenticated", A);
  const g = await q(`insert into cr_corr_games (x_id, o_id, board_size) values ('${A}','${B}',10) returning id, board_size`);
  const gid = g.rows[0].id;
  eq(g.rows[0].board_size, 10, "board_size stored");
  await asRole("authenticated", B);
  eq((await q(`select count(*)::int c from cr_corr_games where id='${gid}'`)).rows[0].c, 1, "B reads");
  await q(`update cr_corr_games set moves='112 113' where id='${gid}'`);
  await asRole("authenticated", C);
  eq((await q(`select count(*)::int c from cr_corr_games where id='${gid}'`)).rows[0].c, 0, "C cannot read");
});

// ---------- 7. puzzles ----------
await ok("daily puzzle solve +15 once", async () => {
  await asRole("authenticated", D);
  eq((await q(`select public.cr_record_puzzle_solve('2026-10-20')`)).rows[0].cr_record_puzzle_solve, true, "first");
  eq((await q(`select public.cr_record_puzzle_solve('2026-10-20')`)).rows[0].cr_record_puzzle_solve, false, "repeat");
  eq((await q(`select xp from cr_stats where user_id='${D}'`)).rows[0].xp, 15, "xp");
});
let cpId;
await ok("community puzzle: publish, solve XP, like, feature", async () => {
  await asRole("authenticated", A);
  const p = await q(`insert into cr_community_puzzles (creator_id, title, pos, board_size, moves_to_mate, solution)
    values ('${A}','Open four','${POS15}',20,'1','109 114') returning id`);
  cpId = p.rows[0].id;
  await asRole("anon", null);
  const cards = await q(`select * from public.cr_community_puzzle_cards('new',10,0,false)`);
  eq(cards.rows.length, 1, "anon sees card"); eq(cards.rows[0].liked_by_me, false, "anon like state");
  eq(cards.rows[0].creator_name, "Mai Chi", "creator credited");
  eq(cards.rows[0].board_size, 20, "card board_size plumbed");
  await asRole("authenticated", B);
  const xpB0 = (await q(`select xp from cr_stats where user_id='${B}'`)).rows[0].xp;
  const xpA0 = (await q(`select xp from cr_stats where user_id='${A}'`)).rows[0].xp;
  eq((await q(`select public.cr_solve_community_puzzle('${cpId}')`)).rows[0].cr_solve_community_puzzle, 10, "solver +10");
  eq((await q(`select public.cr_solve_community_puzzle('${cpId}')`)).rows[0].cr_solve_community_puzzle, 0, "re-solve 0");
  eq((await q(`select xp from cr_stats where user_id='${B}'`)).rows[0].xp, xpB0 + 10, "B xp");
  eq((await q(`select xp from cr_stats where user_id='${A}'`)).rows[0].xp, xpA0 + 5, "creator +5");
  await asRole("authenticated", A);
  const xpA1 = (await q(`select xp from cr_stats where user_id='${A}'`)).rows[0].xp;
  eq((await q(`select public.cr_solve_community_puzzle('${cpId}')`)).rows[0].cr_solve_community_puzzle, 0, "self-solve 0");
  eq((await q(`select xp from cr_stats where user_id='${A}'`)).rows[0].xp, xpA1, "creator xp unchanged");
  await asRole(null, null);
  const extra = [];
  for (let k = 5; k <= 12; k++) {
    const u = `00000000-0000-4000-8000-${String(k).padStart(12, "0")}`;
    await q(`insert into auth.users (id, email) values ('${u}','u${k}@x')`);
    await q(`insert into profiles (id, username) values ('${u}','u${k}')`);
    extra.push(u);
  }
  const likers = [B, C, D, ...extra].slice(0, 8);
  for (const u of likers) {
    await asRole("authenticated", u);
    await q(`select public.cr_toggle_community_like('${cpId}')`);
  }
  const fin = await q(`select is_featured, likes from cr_community_puzzles where id='${cpId}'`);
  eq(fin.rows[0].is_featured, true, "featured at 8 likes"); eq(fin.rows[0].likes, 8, "likes count");
  eq((await q(`select xp from cr_stats where user_id='${A}'`)).rows[0].xp, xpA1 + 50, "creator +50 feature");
});

// ---------- 8. push / notifications / setups ----------
await ok("push subscriptions owner-only; notifications server-written", async () => {
  await asRole("authenticated", A);
  await q(`insert into cr_push_subscriptions (user_id, endpoint, p256dh, auth)
           values ('${A}','https://x','p','a')`);
  await asRole("authenticated", B);
  eq((await q(`select count(*)::int c from cr_push_subscriptions`)).rows[0].c, 0, "B cannot read A's subscription");
  await expectDenied("B insert for A denied", `insert into cr_push_subscriptions (user_id, endpoint, p256dh, auth) values ('${A}','https://y','p','a')`);
  await asRole("authenticated", A);
  await expectDenied("no client insert on notifications", `insert into cr_notifications (user_id, kind, title) values ('${A}','turn','t')`);
  await asRole(null, null); // server (service role equivalent) writes
  await q(`insert into cr_notifications (user_id, kind, title, url) values ('${A}','turn','Đến lượt bạn','/?room=${roomCode}')`);
  await asRole("authenticated", A);
  eq((await q(`select count(*)::int c from cr_notifications`)).rows[0].c, 1, "A reads own");
  await asRole("authenticated", B);
  eq((await q(`select count(*)::int c from cr_notifications`)).rows[0].c, 0, "B reads none");
});
await ok("setups self-only", async () => {
  await asRole("authenticated", A);
  await q(`insert into cr_setups (user_id, name, pos) values ('${A}','trap','${POS15}')`);
  eq((await q(`select count(*)::int c from cr_setups`)).rows[0].c, 1, "A reads own");
  await asRole("authenticated", B);
  eq((await q(`select count(*)::int c from cr_setups`)).rows[0].c, 0, "B reads none");
});

// ---------- 9. room chat (trio) ----------
await ok("room chat: members post/read, outsiders + anon locked out", async () => {
  // A (leader) and B (player) are members of roomId; make C a spectator.
  await asRole("authenticated", A);
  await q(`insert into cr_room_messages (room_id, user_id, body) values ('${roomId}','${A}','Chào!')`);
  await asRole("authenticated", B);
  await q(`insert into cr_room_messages (room_id, user_id, body) values ('${roomId}','${B}','Chào bạn!')`);
  eq((await q(`select count(*)::int c from cr_room_messages where room_id='${roomId}'`)).rows[0].c, 2, "member reads both");
  await asRole("authenticated", D); // not a member of this room
  eq((await q(`select count(*)::int c from cr_room_messages where room_id='${roomId}'`)).rows[0].c, 0, "non-member reads none");
  await expectDenied("non-member insert denied (42501)", `insert into cr_room_messages (room_id, user_id, body) values ('${roomId}','${D}','sneak')`);
  await asRole("anon", null);
  eq((await q(`select count(*)::int c from cr_room_messages where room_id='${roomId}'`)).rows[0].c, 0, "anon reads none");
  await expectDenied("anon insert denied (42501)", `insert into cr_room_messages (room_id, user_id, body) values ('${roomId}','${A}','sneak')`);
});

// ---------- 10. room delete (trio) ----------
await ok("room delete: not_leader / match_in_progress / success / anon 42501", async () => {
  await asRole("authenticated", C);
  const rm = await q(`select * from public.cr_create_room('to-delete', false, 4)`);
  const rid = rm.rows[0].id, rcode = rm.rows[0].code;
  await asRole("authenticated", D);
  await q(`select * from public.cr_join_room('${rcode}')`);
  await expectRaise("non-leader delete denied (not_leader)", `select public.cr_delete_room('${rid}')`, "not_leader");
  await asRole("authenticated", C);
  const m = await q(`select * from public.cr_start_next_match('${rid}')`);
  await expectRaise("delete during match denied (match_in_progress)", `select public.cr_delete_room('${rid}')`, "match_in_progress");
  await q(`select public.cr_cancel_room_match('${m.rows[0].id}')`);
  await q(`select public.cr_delete_room('${rid}')`);
  const st = await q(`select status from cr_rooms where id='${rid}'`);
  eq(st.rows[0].status, "closed", "room closed");
  await asRole("anon", null);
  await expectDenied("anon delete denied (42501)", `select public.cr_delete_room('${rid}')`);
});

// ---------- 11. grant posture ----------
await ok("grant posture probes", async () => {
  await asRole("anon", null);
  await expectDenied("anon cannot claim checkin", `select * from public.cr_claim_checkin()`);
  await expectDenied("anon cannot call award_room_xp", `select public.cr_award_room_xp('${A}','play','${A}',5)`);
  await expectDenied("anon cannot call gen_room_code", `select public.cr_gen_room_code()`);
  await expectDenied("anon cannot read game_stats aggregate", `select public.cr_game_stats()`);
  await expectDenied("anon cannot call finish_room_match", `select public.cr_finish_room_match('${matchId}','x','five')`);
  await expectDenied("anon cannot call ai_rating", `select public.cr_ai_rating(1)`);
  await expectDenied("anon cannot create room", `select * from public.cr_create_room('x', false, 8, 15)`);
  // anon CAN: event write, discovery RPCs, leaderboard, puzzle cards
  await q(`select public.record_cr_game_event('start', null, 1, 'x', null)`);
  await q(`select * from public.cr_preview_room('${roomCode}')`);
  await q(`select * from public.cr_list_public_rooms()`);
  await q(`select * from public.cr_room_leaderboard()`);
  await q(`select * from public.cr_leaderboard(15, 0)`);
  await q(`select public.cr_guest_room_detail('${roomId}')`);
  await asRole("authenticated", A);
  await expectDenied("authenticated cannot call award_room_xp", `select public.cr_award_room_xp('${A}','play','${A}',5)`);
  await expectDenied("authenticated cannot call gen_room_code", `select public.cr_gen_room_code()`);
  await expectDenied("authenticated cannot call ai_rating", `select public.cr_ai_rating(1)`);
  // RLS helpers keep anon+authenticated execute (policy evaluation)
  await asRole("anon", null);
  await q(`select public.is_cr_room_member('${roomId}')`);
  await asRole("authenticated", C);
  await q(`select public.is_cr_room_leader('${roomId}')`);
});

// ---------- 12. RLS isolation + leaderboard + registry ----------
await ok("RLS isolation + leaderboard + registry", async () => {
  await asRole("authenticated", B);
  eq((await q(`select count(*)::int c from cr_games`)).rows[0].c, 1, "B sees only own games (cvc row)");
  await asRole("authenticated", A);
  if ((await q(`select count(*)::int c from cr_games`)).rows[0].c < 3) throw new Error("A should see own rows");
  await asRole("anon", null);
  const lb = await q(`select * from public.cr_leaderboard(15,0)`);
  if (lb.rows.length === 0) throw new Error("leaderboard empty");
  eq(String(lb.rows[0].rank), "1", "rank 1 first");
  await asRole(null, null);
  const reg = await q(`select slug, name_en, prefix, match_col_a, match_col_b, site_url, icon, accent from game_registry where slug='caro'`);
  eq(reg.rows[0].prefix, "cr_", "prefix");
  eq(reg.rows[0].name_en, "Gomoku", "name_en");
  eq(reg.rows[0].match_col_a, "x_id", "match col a");
  eq(reg.rows[0].match_col_b, "o_id", "match col b");
  eq(reg.rows[0].icon, "✖️", "icon");
  eq(reg.rows[0].accent, "#0e7fa8", "accent");
  if (!reg.rows[0].site_url.includes("cocaro.synerworlds.com")) throw new Error("site_url");
});

// ---------- 13. game events aggregate ----------
await ok("game_stats aggregate", async () => {
  await asRole("authenticated", A);
  const s = await q(`select public.cr_game_stats() as j`);
  const j = s.rows[0].j;
  if (j.plays_total < 1) throw new Error("plays_total");
  eq(j.plays_guest >= 1, true, "guest plays counted");
  eq(j.members_total, 12, "12 seeded members");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
