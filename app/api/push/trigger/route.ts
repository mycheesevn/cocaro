import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { needAuth } from "../_auth";
import { sendPushToUser } from "@/lib/push/server";

/**
 * Event-verified push triggers for caro. Server re-checks DB state before sending.
 * kinds:
 *  - { kind: "challenge", challengeId } — notify the challenged player.
 *  - { kind: "challenge_declined", challengeId } — notify the challenger.
 *  - { kind: "turn", matchId } — notify whoever's turn it now is (room match).
 *  - { kind: "corr", gameId } — notify the opponent in a correspondence game.
 *  - { kind: "corr_end", gameId } — notify the opponent when a corr game finishes.
 */

const lastSent = new Map<string, number>();
function throttled(key: string, minIntervalMs: number): boolean {
  const now = Date.now();
  const prev = lastSent.get(key) || 0;
  if (now - prev < minIntervalMs) return true;
  lastSent.set(key, now);
  return false;
}

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("push_not_configured");
  return createClient(url, serviceKey);
}

function displayName(p: { full_name?: string | null; username?: string | null } | null): string {
  if (!p) return "A player";
  return p.full_name || p.username || "A player";
}

/**
 * Best-effort inbox write: persist the notification so users can review
 * missed pushes. Never throws (must not break the push itself).
 */
async function recordNotification(
  sb: ReturnType<typeof service>,
  n: {
    user_id: string;
    kind: string;
    title: string;
    body: string;
    url: string;
    ref_id?: string;
  }
): Promise<void> {
  try {
    // De-dupe: don't stack identical unread rows for the same event.
    let q = sb
      .from("cr_notifications")
      .select("id")
      .eq("user_id", n.user_id)
      .eq("kind", n.kind)
      .is("read_at", null)
      .limit(1);
    q = n.ref_id ? q.eq("ref_id", n.ref_id) : q.is("ref_id", null);
    const { data: existing } = await q;
    if (existing && existing.length > 0) return;
    await sb.from("cr_notifications").insert({
      user_id: n.user_id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      url: n.url,
      ref_id: n.ref_id ?? null,
    });
  } catch {
    /* inbox is best-effort */
  }
}

export async function POST(req: Request) {
  const auth = await needAuth(req);
  if ("error" in auth) return auth.error;
  const { uid } = auth;

  let body: { kind?: string; challengeId?: string; matchId?: string; gameId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    if (body.kind === "challenge" && body.challengeId) {
      return await onChallenge(uid, body.challengeId);
    }
    if (body.kind === "challenge_declined" && body.challengeId) {
      return await onChallengeDeclined(uid, body.challengeId);
    }
    if (body.kind === "turn" && body.matchId) {
      return await onTurn(uid, body.matchId);
    }
    if (body.kind === "corr" && body.gameId) {
      return await onCorr(uid, body.gameId);
    }
    if (body.kind === "corr_end" && body.gameId) {
      return await onCorrEnd(uid, body.gameId);
    }
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    const status = msg === "push_not_configured" ? 500 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

async function onChallenge(challengerId: string, challengeId: string) {
  if (throttled(`challenge:${challengeId}`, 5 * 60 * 1000)) {
    return NextResponse.json({ ok: true, skipped: "throttled" });
  }
  const sb = service();
  const { data: ch, error } = await sb
    .from("cr_challenges")
    .select("id, challenger_id, challenged_id, status, room_id, created_at")
    .eq("id", challengeId)
    .single();
  if (error || !ch) throw new Error("not_found");
  if (ch.challenger_id !== challengerId) throw new Error("forbidden");
  if (ch.status !== "pending") throw new Error("not_pending");
  if (Date.now() - new Date(ch.created_at).getTime() > 10 * 60 * 1000) {
    throw new Error("stale");
  }
  const { data: me } = await sb
    .from("profiles")
    .select("full_name, username")
    .eq("id", challengerId)
    .single();
  const name = displayName(me);
  // Deep-link to the challenge itself (Friends view highlights it for accept/decline).
  const url = `/?challenge=${ch.id}`;
  const title = "⚔️ Challenge!";
  const body = `${name} challenged you to a caro game.`;
  const { sent } = await sendPushToUser(ch.challenged_id, {
    title,
    body,
    url,
    tag: `challenge-${ch.id}`,
  });
  await recordNotification(sb, {
    user_id: ch.challenged_id,
    kind: "challenge",
    title,
    body,
    url,
    ref_id: ch.id,
  });
  return NextResponse.json({ ok: true, sent });
}

async function onChallengeDeclined(declinerId: string, challengeId: string) {
  if (throttled(`challenge_declined:${challengeId}`, 5 * 60 * 1000)) {
    return NextResponse.json({ ok: true, skipped: "throttled" });
  }
  const sb = service();
  const { data: ch, error } = await sb
    .from("cr_challenges")
    .select("id, challenger_id, challenged_id, status")
    .eq("id", challengeId)
    .single();
  if (error || !ch) throw new Error("not_found");
  // Only the challenged player can report a decline, and only once.
  if (ch.challenged_id !== declinerId) throw new Error("forbidden");
  if (ch.status !== "declined") throw new Error("not_declined");
  const { data: me } = await sb
    .from("profiles")
    .select("full_name, username")
    .eq("id", declinerId)
    .single();
  const name = displayName(me);
  const title = "😞 Challenge declined";
  const body = `${name} declined your challenge.`;
  // No deep link: the challenge is over, just open the app.
  const { sent } = await sendPushToUser(ch.challenger_id, {
    title,
    body,
    url: "/",
    tag: `challenge-declined-${ch.id}`,
  });
  await recordNotification(sb, {
    user_id: ch.challenger_id,
    kind: "challenge_declined",
    title,
    body,
    url: "/",
    ref_id: ch.id,
  });
  return NextResponse.json({ ok: true, sent });
}

async function onTurn(moverId: string, matchId: string) {
  if (throttled(`turn:${matchId}:${moverId}`, 30 * 1000)) {
    return NextResponse.json({ ok: true, skipped: "throttled" });
  }
  const sb = service();
  const { data: m, error } = await sb
    .from("cr_room_matches")
    .select("id, room_id, x_id, o_id, status, moves")
    .eq("id", matchId)
    .single();
  if (error || !m) throw new Error("not_found");
  if (m.status !== "active") throw new Error("not_active");
  const plies = m.moves ? m.moves.trim().split(/\s+/).filter(Boolean).length : 0;
  const toMoveId = plies % 2 === 0 ? m.x_id : m.o_id;
  if (!toMoveId || toMoveId === moverId) throw new Error("not_their_turn");
  if (moverId !== m.x_id && moverId !== m.o_id) throw new Error("forbidden");

  const { data: room } = await sb.from("cr_rooms").select("name").eq("id", m.room_id).single();
  const title = "♟️ Your move!";
  const body = room?.name ? `Your turn in room ${room.name}.` : "Your turn to move.";
  const { sent } = await sendPushToUser(toMoveId, {
    title,
    body,
    url: "/",
    tag: `turn-${m.id}-${plies}`,
  });
  await recordNotification(sb, {
    user_id: toMoveId,
    kind: "turn",
    title,
    body,
    url: "/",
    ref_id: m.id,
  });
  return NextResponse.json({ ok: true, sent });
}

async function onCorr(moverId: string, gameId: string) {
  if (throttled(`corr:${gameId}:${moverId}`, 30 * 1000)) {
    return NextResponse.json({ ok: true, skipped: "throttled" });
  }
  const sb = service();
  const { data: g, error } = await sb
    .from("cr_corr_games")
    .select("id, x_id, o_id, status, moves")
    .eq("id", gameId)
    .single();
  if (error || !g) throw new Error("not_found");
  if (g.status !== "active") throw new Error("not_active");
  if (moverId !== g.x_id && moverId !== g.o_id) throw new Error("forbidden");
  const plies = g.moves ? g.moves.trim().split(/\s+/).filter(Boolean).length : 0;
  const toMoveId = plies % 2 === 0 ? g.x_id : g.o_id;
  if (!toMoveId || toMoveId === moverId) throw new Error("not_their_turn");

  const { data: me } = await sb
    .from("profiles")
    .select("full_name, username")
    .eq("id", moverId)
    .single();
  const name = displayName(me);
  const url = `/?corr=${g.id}`;
  const pushTitle = "✉️ Correspondence — your move!";
  const pushBody = `${name} moved. Your turn.`;
  const { sent } = await sendPushToUser(toMoveId, {
    title: pushTitle,
    body: pushBody,
    url,
    tag: `corr-${g.id}-${plies}`,
  });
  await recordNotification(sb, {
    user_id: toMoveId,
    kind: "corr",
    title: pushTitle,
    body: pushBody,
    url,
    ref_id: g.id,
  });
  return NextResponse.json({ ok: true, sent });
}

async function onCorrEnd(finisherId: string, gameId: string) {
  if (throttled(`corr_end:${gameId}`, 5 * 60 * 1000)) {
    return NextResponse.json({ ok: true, skipped: "throttled" });
  }
  const sb = service();
  const { data: g, error } = await sb
    .from("cr_corr_games")
    .select("id, x_id, o_id, status, result, winner_id")
    .eq("id", gameId)
    .single();
  if (error || !g) throw new Error("not_found");
  if (g.status !== "finished") throw new Error("not_finished");
  if (finisherId !== g.x_id && finisherId !== g.o_id)
    throw new Error("forbidden");
  // Notify the OTHER player (who may be offline).
  const otherId = finisherId === g.x_id ? g.o_id : g.x_id;
  if (!otherId) throw new Error("no_opponent");
  const { data: me } = await sb
    .from("profiles")
    .select("full_name, username")
    .eq("id", finisherId)
    .single();
  const name = displayName(me);
  const url = `/?corr=${g.id}`;
  let title: string;
  let body: string;
  if (g.winner_id === otherId) {
    title = "🏆 You won the correspondence game!";
    body = `${name} finished the game. Open the app to review it.`;
  } else if (g.winner_id === finisherId) {
    title = "♚ Correspondence game over";
    body = `You lost to ${name}. Open the app to review the game.`;
  } else {
    title = "🤝 Correspondence game drawn";
    body = `Your game with ${name} ended in a draw.`;
  }
  const { sent } = await sendPushToUser(otherId, {
    title,
    body,
    url,
    tag: `corr-end-${g.id}`,
  });
  await recordNotification(sb, {
    user_id: otherId,
    kind: "corr_end",
    title,
    body,
    url,
    ref_id: g.id,
  });
  return NextResponse.json({ ok: true, sent });
}
