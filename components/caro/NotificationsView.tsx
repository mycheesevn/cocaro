"use client";

import { useCallback, useEffect, useState } from "react";
import type { Lang } from "@/lib/caro/engineApi";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type CaroNotification,
} from "@/lib/supabase/notifications";

function fmtDate(iso: string, lang: Lang): string {
  try {
    return new Date(iso).toLocaleString(lang === "vi" ? "vi-VN" : "en-US", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

interface Props {
  lang: Lang;
  /** Called after the list changes (e.g. marked read) so the header badge refreshes. */
  onChanged?: () => void;
}

export function NotificationsView({ lang, onChanged }: Props) {
  const [items, setItems] = useState<CaroNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { notifications } = await fetchNotifications();
    setItems(notifications);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openNotification = (n: CaroNotification) => {
    if (!n.read_at) {
      markNotificationRead(n.id);
      setItems((prev) =>
        prev.map((x) =>
          x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x
        )
      );
      onChanged?.();
    }
    window.location.href = n.url || "/";
  };

  const markAll = async () => {
    await markAllNotificationsRead();
    setItems((prev) =>
      prev.map((x) => (x.read_at ? x : { ...x, read_at: new Date().toISOString() }))
    );
    onChanged?.();
  };

  const unreadCount = items.filter((x) => !x.read_at).length;

  return (
    <div className="cr-view">
      <div className="cr-view-head">
        <h2>🔔 {lang === "vi" ? "Thông báo" : "Notifications"}</h2>
        {unreadCount > 0 && (
          <button
            type="button"
            className="cr-btn cr-btn-sm"
            onClick={markAll}
          >
            ✓ {lang === "vi" ? "Đánh dấu đã đọc hết" : "Mark all read"}
          </button>
        )}
      </div>
      {loading ? (
        <p className="cr-empty-note">
          {lang === "vi" ? "Đang tải…" : "Loading…"}
        </p>
      ) : items.length === 0 ? (
        <p className="cr-empty-note">
          {lang === "vi"
            ? "Chưa có thông báo nào."
            : "No notifications yet."}
        </p>
      ) : (
        <ul className="cr-board-list">
          {items.map((n) => (
            <li
              key={n.id}
              className="cr-lb-row"
              style={!n.read_at ? { fontWeight: 600 } : undefined}
            >
              <button
                type="button"
                onClick={() => openNotification(n)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  textAlign: "left",
                  cursor: "pointer",
                  flex: 1,
                  color: "inherit",
                  font: "inherit",
                }}
              >
                {!n.read_at && (
                  <span
                    aria-hidden="true"
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#4dabf7",
                      marginRight: 6,
                    }}
                  />
                )}
                <strong>{n.title}</strong>
                <div className="cr-lb-title">
                  {n.body}
                  <br />
                  {fmtDate(n.created_at, lang)}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
