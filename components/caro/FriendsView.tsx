"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  acceptChallenge,
  declineChallenge,
  displayNameOf,
  fetchFriendMatchStatus,
  listFriends,
  listPendingChallenges,
  sendChallenge,
  subscribeOnline,
  unfollowUser,
  type Challenge,
  type FriendRow,
} from "@/lib/supabase/friends";
import { notifyPushTrigger } from "@/lib/push/client";
import { useAuth } from "./AuthProvider";
import { STR } from "@/lib/caro/i18n";
import type { Lang } from "@/lib/caro/engineApi";

interface Props {
  lang: Lang;
  /** Open a room by its id (challenge accept / challenge sent). */
  onOpenRoom: (roomId: string) => void;
  /** Open a room by invite code (watch a friend's match). */
  onWatchRoom?: (code: string) => void;
  /** Deep-link: highlight this incoming challenge (e.g. from a notification). */
  highlightChallengeId?: string | null;
  onHighlightConsumed?: () => void;
}

/** Friends list: online status, active matches, challenges, unfollow. */
export function FriendsView({
  lang,
  onOpenRoom,
  onWatchRoom,
  highlightChallengeId,
  onHighlightConsumed,
}: Props) {
  const s = STR[lang];
  const { user } = useAuth();
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [matchStatus, setMatchStatus] = useState<
    Record<string, { room_id: string; code: string }>
  >({});
  const [incoming, setIncoming] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const highlightRef = useRef<HTMLLIElement>(null);

  // Deep-link: scroll to and flash the highlighted challenge once loaded.
  useEffect(() => {
    if (
      highlightChallengeId &&
      incoming.some((c) => c.id === highlightChallengeId)
    ) {
      highlightRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      const t = setTimeout(() => onHighlightConsumed?.(), 3000);
      return () => clearTimeout(t);
    }
  }, [highlightChallengeId, incoming, onHighlightConsumed]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [fs, cs] = await Promise.all([
        listFriends(),
        listPendingChallenges(),
      ]);
      setFriends(fs);
      setIncoming(cs);
      if (fs.length > 0) {
        setMatchStatus(await fetchFriendMatchStatus(fs.map((f) => f.id)));
      } else {
        setMatchStatus({});
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    return subscribeOnline(setOnlineIds);
  }, [reload]);

  if (!user) {
    return (
      <div className="cr-view">
        <p>{s.friendsSignIn}</p>
      </div>
    );
  }

  const doChallenge = async (f: FriendRow) => {
    if (busyId) return;
    setBusyId(f.id);
    setMsg("");
    try {
      const ch = await sendChallenge(f.id, displayNameOf(f));
      notifyPushTrigger({ kind: "challenge", challengeId: ch.id });
      if (ch.room_id) onOpenRoom(ch.room_id);
    } catch {
      setMsg(s.friendsActionError);
    } finally {
      setBusyId(null);
    }
  };

  const doUnfollow = async (f: FriendRow) => {
    if (busyId) return;
    setBusyId(f.id);
    setMsg("");
    try {
      await unfollowUser(f.id);
      setFriends((prev) => prev.filter((x) => x.id !== f.id));
    } catch {
      setMsg(s.friendsActionError);
    } finally {
      setBusyId(null);
    }
  };

  const doAccept = async (c: Challenge) => {
    if (busyId) return;
    setBusyId(c.id);
    setMsg("");
    try {
      const roomId = await acceptChallenge(c);
      setIncoming((prev) => prev.filter((x) => x.id !== c.id));
      if (roomId) onOpenRoom(roomId);
    } catch {
      setMsg(s.friendsActionError);
    } finally {
      setBusyId(null);
    }
  };

  const doDecline = async (c: Challenge) => {
    if (busyId) return;
    setBusyId(c.id);
    setMsg("");
    try {
      await declineChallenge(c.id);
      setIncoming((prev) => prev.filter((x) => x.id !== c.id));
      notifyPushTrigger({ kind: "challenge_declined", challengeId: c.id });
    } catch {
      setMsg(s.friendsActionError);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="cr-view">
        <p className="cr-muted">{s.friendsLoading}</p>
      </div>
    );
  }

  return (
    <div className="cr-view">
      <div className="cr-friends">
        <h2>
          {s.friendsTitle} ({friends.length})
        </h2>
        {msg && (
          <p className="cr-msg cr-msg-error" role="alert">
            {msg}
          </p>
        )}

        {incoming.length > 0 && (
          <section>
            <h3>{s.friendsChallengeIncoming}</h3>
            <ul className="cr-board-list">
              {incoming.map((c) => (
                <li
                  key={c.id}
                  ref={c.id === highlightChallengeId ? highlightRef : undefined}
                  className={`cr-lb-row${
                    c.id === highlightChallengeId ? " cr-challenge-highlight" : ""
                  }`}
                >
                  <span className="cr-lb-name">
                    <strong>{s.friendsChallengeFrom(c.challenger_name ?? "?")}</strong>
                  </span>
                  <span className="cr-room-order-btns">
                    <button
                      type="button"
                      className="cr-btn cr-btn-sm"
                      disabled={busyId === c.id}
                      onClick={() => doAccept(c)}
                    >
                      {s.friendsAccept}
                    </button>
                    <button
                      type="button"
                      className="cr-btn cr-btn-sm"
                      disabled={busyId === c.id}
                      onClick={() => doDecline(c)}
                    >
                      {s.friendsDecline}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {friends.length === 0 ? (
          <p className="cr-muted">{s.friendsEmpty}</p>
        ) : (
          <ul className="cr-board-list">
            {friends.map((f) => {
              const online = onlineIds.has(f.id);
              const ms = matchStatus[f.id];
              return (
                <li key={f.id} className="cr-lb-row">
                  <span className="cr-friend-avatar">
                    {f.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={f.avatar_url}
                        alt=""
                        className="cr-friend-avatar-img"
                      />
                    ) : (
                      displayNameOf(f).slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <span className="cr-lb-name">
                    <strong>
                      <span
                        className={`cr-online-dot${online ? " on" : ""}`}
                        aria-label={online ? s.friendsOnline : undefined}
                      />
                      {displayNameOf(f)}
                    </strong>
                    <span className="cr-friend-sub">
                      ⭐ {f.rating}
                      {online && ` · ${s.friendsOnline}`}
                      {ms && ` · 🔴 ${s.friendsInMatch}`}
                    </span>
                  </span>
                  <span className="cr-room-order-btns">
                    {ms?.code && onWatchRoom && (
                      <button
                        type="button"
                        className="cr-btn cr-btn-sm"
                        onClick={() => onWatchRoom(ms.code)}
                      >
                        {s.friendsWatch}
                      </button>
                    )}
                    <button
                      type="button"
                      className="cr-btn cr-btn-sm"
                      disabled={busyId === f.id}
                      onClick={() => doChallenge(f)}
                    >
                      {s.friendsChallengeBtn}
                    </button>
                    <button
                      type="button"
                      className="cr-btn cr-btn-sm"
                      disabled={busyId === f.id}
                      onClick={() => doUnfollow(f)}
                      title={s.friendsUnfriend}
                    >
                      ✕
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
