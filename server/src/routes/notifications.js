import { Router } from "express";
import { db } from "../database/db.js";
import { requireAuth } from "../middleware/auth.js";
import { parsePositiveId } from "../services.js";
const router = Router();
router.use(requireAuth);
router.get("/", (req, res) => {
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(req.query.limit || "30", 10) || 30),
  );
  db.prepare(
    "DELETE FROM notifications WHERE user_id=? AND (read_at IS NOT NULL OR created_at < datetime('now','-2 days'))",
  ).run(req.user.id);
  const notifications = db
    .prepare(
      "SELECT id,type,title,message,entity_type AS entityType,entity_id AS entityId,read_at AS readAt,created_at AS createdAt FROM notifications WHERE user_id=? AND read_at IS NULL AND created_at >= datetime('now','-2 days') ORDER BY created_at DESC,id DESC LIMIT ?",
    )
    .all(req.user.id, limit);
  const unreadCount = db
    .prepare(
      "SELECT COUNT(*) AS count FROM notifications WHERE user_id=? AND read_at IS NULL AND created_at >= datetime('now','-2 days')",
    )
    .get(req.user.id).count;
  res.json({ notifications, unreadCount });
});
router.post("/:id/read", (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id)
    return res.status(400).json({
      error: {
        code: "INVALID_ID",
        message: "Notification ID must be a positive integer.",
      },
    });
  const result = db
    .prepare("DELETE FROM notifications WHERE id=? AND user_id=?")
    .run(id, req.user.id);
  if (!result.changes) {
    const exists = db
      .prepare("SELECT id FROM notifications WHERE id=? AND user_id=?")
      .get(id, req.user.id);
    if (!exists)
      return res.status(404).json({
        error: {
          code: "NOTIFICATION_NOT_FOUND",
          message: "Notification not found.",
        },
      });
  }
  return res.json({ message: "Notification marked as read." });
});
router.post("/read-all", (req, res) => {
  const result = db
    .prepare("DELETE FROM notifications WHERE user_id=?")
    .run(req.user.id);
  res.json({
    message: "Notifications marked as read.",
    updated: result.changes,
  });
});
export default router;

// Phase 17: per-user notification and reminder preferences.
router.get("/preferences", (req, res) => {
  const row = db
    .prepare(
      `SELECT notifications_enabled AS notificationsEnabled, due_reminders_enabled AS dueRemindersEnabled, reminder_24h_enabled AS reminder24hEnabled, reminder_1h_enabled AS reminder1hEnabled, email_notifications_enabled AS emailNotificationsEnabled, email_assignments_enabled AS emailAssignmentsEnabled, email_submissions_enabled AS emailSubmissionsEnabled, email_grades_enabled AS emailGradesEnabled, email_reminders_enabled AS emailRemindersEnabled FROM notification_preferences WHERE user_id=?`,
    )
    .get(req.user.id);
  res.json({
    preferences: row
      ? Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Boolean(v)]))
      : {
          notificationsEnabled: true,
          dueRemindersEnabled: true,
          reminder24hEnabled: true,
          reminder1hEnabled: true,
          emailNotificationsEnabled: false,
          emailAssignmentsEnabled: true,
          emailSubmissionsEnabled: true,
          emailGradesEnabled: true,
          emailRemindersEnabled: true,
        },
  });
});
router.put("/preferences", (req, res) => {
  const keys = [
    "notificationsEnabled",
    "dueRemindersEnabled",
    "reminder24hEnabled",
    "reminder1hEnabled",
    "emailNotificationsEnabled",
    "emailAssignmentsEnabled",
    "emailSubmissionsEnabled",
    "emailGradesEnabled",
    "emailRemindersEnabled",
  ];
  if (!req.body || keys.some((k) => typeof req.body[k] !== "boolean"))
    return res.status(400).json({
      error: {
        code: "INVALID_PREFERENCES",
        message:
          "Provide boolean values for all notification preference fields.",
      },
    });
  const p = req.body;
  db.prepare(
    `INSERT INTO notification_preferences (user_id,notifications_enabled,due_reminders_enabled,reminder_24h_enabled,reminder_1h_enabled,email_notifications_enabled,email_assignments_enabled,email_submissions_enabled,email_grades_enabled,email_reminders_enabled,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(user_id) DO UPDATE SET notifications_enabled=excluded.notifications_enabled,due_reminders_enabled=excluded.due_reminders_enabled,reminder_24h_enabled=excluded.reminder_24h_enabled,reminder_1h_enabled=excluded.reminder_1h_enabled,email_notifications_enabled=excluded.email_notifications_enabled,email_assignments_enabled=excluded.email_assignments_enabled,email_submissions_enabled=excluded.email_submissions_enabled,email_grades_enabled=excluded.email_grades_enabled,email_reminders_enabled=excluded.email_reminders_enabled,updated_at=datetime('now')`,
  ).run(
    req.user.id,
    +p.notificationsEnabled,
    +p.dueRemindersEnabled,
    +p.reminder24hEnabled,
    +p.reminder1hEnabled,
    +p.emailNotificationsEnabled,
    +p.emailAssignmentsEnabled,
    +p.emailSubmissionsEnabled,
    +p.emailGradesEnabled,
    +p.emailRemindersEnabled,
  );
  res.json({ message: "Notification preferences saved.", preferences: p });
});
