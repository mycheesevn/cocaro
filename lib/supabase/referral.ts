// Caro referral helpers.
// Caro's referral scheme uses the user's own id as the referral code:
// invite links look like `/?ref=<user-id>` and are captured in AppShell,
// which calls the `cr_claim_referral(p_referrer_id)` RPC (+20 XP both).

import { createClient } from "./client";

/** The current user's own referral code (their user id) + share link. */
export async function fetchMyReferralCode(): Promise<string | null> {
  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  return user?.id ?? null;
}

/** How many users this user has invited (for the ambassador line). */
export async function fetchMyInviteCount(): Promise<number> {
  try {
    const sb = createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return 0;
    const { count, error } = await sb
      .from("cr_referrals")
      .select("id", { count: "exact" })
      .eq("referrer_id", user.id)
      .limit(1);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}
