"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { fetchMyStats, type CaroStats } from "@/lib/supabase/engagement";

export interface Profile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

interface AuthCtx {
  user: User | null;
  profile: Profile | null;
  caroStats: CaroStats | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithFacebook: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  displayName: string;
  /** True when the session ended WITHOUT the user asking (expired /
   *  refresh failed) — the shell shows a "session expired" notice. */
  sessionExpired: boolean;
  dismissSessionExpired: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [caroStats, setCaroStats] = useState<CaroStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const explicitSignOutRef = useRef(false);

  const loadProfile = useCallback(async (uid: string) => {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url")
        .eq("id", uid)
        .single();
      if (data) setProfile(data as Profile);
      setCaroStats(await fetchMyStats(uid));
    } catch {
      /* supabase not configured */
    }
  }, []);

  useEffect(() => {
    // Client-side only: never touch Supabase during SSR/prerender.
    let sub: { unsubscribe: () => void } | null = null;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        setUser(data.session?.user ?? null);
        if (data.session?.user) await loadProfile(data.session.user.id);
        const { data: s } = supabase.auth.onAuthStateChange(
          (event: string, session: Session | null) => {
            if (session?.user) {
              setSessionExpired(false);
              setUser(session.user);
              loadProfile(session.user.id);
              return;
            }
            if (event === "SIGNED_OUT" && !explicitSignOutRef.current) {
              // A failed token refresh can emit SIGNED_OUT while the
              // stored session is still valid — verify before demoting
              // the player to guest mid-game (caro used to record
              // nothing after such a silent downgrade). Only a verified
              // dead session demotes, and it says so out loud.
              void supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
                if (data.session?.user) {
                  setUser(data.session.user);
                  loadProfile(data.session.user.id);
                } else {
                  setUser(null);
                  setProfile(null);
                  setCaroStats(null);
                  setSessionExpired(true);
                }
              });
              return;
            }
            explicitSignOutRef.current = false;
            setUser(null);
            setProfile(null);
            setCaroStats(null);
          }
        );
        sub = s.subscription;
      } catch {
        /* supabase not configured — stay signed out */
      } finally {
        setLoading(false);
      }
    })();
    return () => sub?.unsubscribe();
  }, [loadProfile]);

  const signInWithGoogle = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  }, []);

  const signInWithFacebook = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "facebook",
      options: { redirectTo: window.location.origin },
    });
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await createClient().auth.signInWithPassword({
        email,
        password,
      });
      return { error: error ? error.message : null };
    } catch {
      return { error: "Supabase not configured" };
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await createClient().auth.signUp({ email, password });
      return { error: error ? error.message : null };
    } catch {
      return { error: "Supabase not configured" };
    }
  }, []);

  // Apply the display name stashed at signup (it takes precedence over the
  // email-prefix default the DB trigger sets). Email confirmation may delay
  // the first session, hence this runs on every login until the stash is gone.
  useEffect(() => {
    if (!user) return;
    let stashed: string | null = null;
    try {
      stashed = localStorage.getItem("caro-username");
      localStorage.removeItem("caro-username");
    } catch {
      /* storage unavailable */
    }
    const name = stashed?.trim().slice(0, 30);
    if (!name) return;
    try {
      createClient().from("profiles").update({ username: name }).eq("id", user.id);
    } catch {
      /* ignore */
    }
  }, [user]);

  const signOut = useCallback(async () => {
    explicitSignOutRef.current = true;
    try {
      await createClient().auth.signOut();
    } catch {
      /* ignore */
    }
  }, []);

  const dismissSessionExpired = useCallback(() => setSessionExpired(false), []);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id);
  }, [user, loadProfile]);

  const displayName = useMemo(() => {
    if (profile?.full_name) return profile.full_name;
    if (profile?.username) return profile.username;
    if (user?.email) return user.email.split("@")[0];
    return "Player";
  }, [profile, user]);

  const value = useMemo(
    () => ({
      user,
      profile,
      caroStats,
      loading,
      signInWithGoogle,
      signInWithFacebook,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      displayName,
      sessionExpired,
      dismissSessionExpired,
    }),
    [user, profile, caroStats, loading, signInWithGoogle, signInWithFacebook, signIn, signUp, signOut, refreshProfile, displayName, sessionExpired, dismissSessionExpired]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
