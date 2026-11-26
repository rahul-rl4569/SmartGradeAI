import React from "react";
import { useEffect, useState } from "react";
import axios from "axios";
import { Bell, Check, CheckCheck, X } from "lucide-react";
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://127.0.0.1:4000/api",
  withCredentials: true,
  timeout: 15000,
});
export default function Notifications() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPreferences, setShowPreferences] = useState(false);
  const [preferences, setPreferences] = useState({
    notificationsEnabled: true,
    dueRemindersEnabled: true,
    reminder24hEnabled: true,
    reminder1hEnabled: true,
    emailNotificationsEnabled: false,
    emailAssignmentsEnabled: true,
    emailSubmissionsEnabled: true,
    emailGradesEnabled: true,
    emailRemindersEnabled: true,
  });
  const [savingPreferences, setSavingPreferences] = useState(false);
  async function load() {
    try {
      const r = await api.get("/notifications");
      setItems(r.data.notifications || []);
      setUnread(r.data.unreadCount || 0);
      setError("");
    } catch {
      setError("Notifications are temporarily unavailable.");
    }
  }
  async function loadPreferences() {
    try {
      const r = await api.get("/notifications/preferences");
      setPreferences(r.data.preferences);
    } catch {
      setError("Could not load notification preferences.");
    }
  }
  useEffect(() => {
    load();
    loadPreferences();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, []);
  async function savePreferences() {
    setSavingPreferences(true);
    try {
      await api.put("/notifications/preferences", preferences);
      setError("");
      setShowPreferences(false);
      await load();
    } catch {
      setError("Could not save notification preferences.");
    } finally {
      setSavingPreferences(false);
    }
  }
  async function markRead(item) {
    try {
      await api.post(`/notifications/${item.id}/read`);
      await load();
    } catch {
      setError("Could not update this notification.");
    }
  }
  async function markAll() {
    setBusy(true);
    try {
      await api.post("/notifications/read-all");
      await load();
    } catch {
      setError("Could not mark notifications as read.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="notification-wrap">
      <button
        className="notification-bell"
        aria-label={`Notifications, ${unread} unread`}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="notification-count">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <section className="notification-popover" aria-label="Notifications">
          <div className="notification-head">
            <div>
              <strong>Notifications</strong>
              <small>{unread} unread</small>
            </div>
            <div className="notification-head-actions">
              <button
                title="Notification preferences"
                onClick={() => {
                  setShowPreferences((v) => !v);
                  loadPreferences();
                }}
                aria-label="Notification preferences"
              >
                ⚙
              </button>
              <button
                title="Mark all as read"
                disabled={!unread || busy}
                onClick={markAll}
              >
                <CheckCheck size={16} />
              </button>
              <button
                title="Close notifications"
                onClick={() => setOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
          </div>
          {error && <p className="notification-error">{error}</p>}
          {showPreferences && (
            <div className="notification-preferences">
              <strong>Preferences</strong>
              {[
                ["notificationsEnabled", "Enable in-app notifications"],
                ["dueRemindersEnabled", "Due-date reminders"],
                ["reminder24hEnabled", "Reminder about 24 hours before"],
                ["reminder1hEnabled", "Reminder about 1 hour before"],
                ["emailNotificationsEnabled", "Enable email notifications"],
                [
                  "emailAssignmentsEnabled",
                  "Email when assignments are published",
                ],
                [
                  "emailSubmissionsEnabled",
                  "Email when students submit (teacher accounts)",
                ],
                ["emailGradesEnabled", "Email when grades are released"],
                ["emailRemindersEnabled", "Email due-date reminders"],
              ].map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={preferences[key]}
                    onChange={(e) =>
                      setPreferences((v) => ({ ...v, [key]: e.target.checked }))
                    }
                  />
                  {label}
                </label>
              ))}
              <button
                className="notification-save"
                disabled={savingPreferences}
                onClick={savePreferences}
              >
                {savingPreferences ? "Saving…" : "Save preferences"}
              </button>
            </div>
          )}
          {items.length === 0 && !error && (
            <p className="notification-empty">You're all caught up.</p>
          )}
          <div className="notification-list">
            {items.map((item) => (
              <article
                key={item.id}
                className={`notification-item ${item.readAt ? "read" : ""}`}
              >
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.message}</p>
                  <small>
                    {new Date(item.createdAt + "Z").toLocaleString()}
                  </small>
                </div>
                {!item.readAt && (
                  <button
                    aria-label="Mark as read"
                    title="Mark as read"
                    onClick={() => markRead(item)}
                  >
                    <Check size={15} />
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
