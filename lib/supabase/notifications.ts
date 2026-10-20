import { createClient } from "./client";

export interface CaroNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  url: string;
  ref_id: string | null;
  read_at: string | null;
  created_at: string;
}

async function authHeader(): Promise<Record<string, string>> {
  const sb = createClient();
  const {
    data: { session },
  } = await sb.auth.getSession();
  const token = session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchNotifications(
  before?: string
): Promise<{ notifications: CaroNotification[]; unread: number }> {
  const url = before
    ? `/api/notifications?before=${encodeURIComponent(before)}`
    : "/api/notifications";
  const res = await fetch(url, { headers: await authHeader() });
  if (!res.ok) return { notifications: [], unread: 0 };
  const j = await res.json();
  return {
    notifications: (j.notifications ?? []) as CaroNotification[],
    unread: j.unread ?? 0,
  };
}

export async function markNotificationRead(id: string): Promise<void> {
  await fetch("/api/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ id }),
  }).catch(() => {});
}

export async function markAllNotificationsRead(): Promise<void> {
  await fetch("/api/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ all: true }),
  }).catch(() => {});
}

/** Just the unread count (for the header badge). */
export async function fetchUnreadCount(): Promise<number> {
  const { unread } = await fetchNotifications();
  return unread;
}
