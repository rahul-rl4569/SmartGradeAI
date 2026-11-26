import { db } from "./database/db.js";
import { notify } from "./notifications.js";

// Run periodically; unique dispatch keys prevent duplicate reminders across ticks/restarts.
export function dispatchDueDateReminders(now = new Date()) {
  const windows = [
    {
      key: "24h",
      hours: 24,
      lower: 23,
      upper: 24,
      pref: "reminder_24h_enabled",
      title: "Assignment due tomorrow",
    },
    {
      key: "1h",
      hours: 1,
      lower: 0,
      upper: 1,
      pref: "reminder_1h_enabled",
      title: "Assignment due soon",
    },
  ];
  let sent = 0;
  const candidates = db
    .prepare(
      `SELECT a.id AS assignmentId, a.title, a.due_at AS dueAt, ce.student_id AS studentId
    FROM assignments a JOIN class_enrollments ce ON ce.class_id=a.class_id AND ce.status='active'
    JOIN classes c ON c.id=a.class_id AND c.status='active'
    LEFT JOIN submissions s ON s.assignment_id=a.id AND s.student_id=ce.student_id
    WHERE a.status='published' AND a.due_at IS NOT NULL AND s.id IS NULL`,
    )
    .all();
  const claim = db.prepare(
    "INSERT OR IGNORE INTO reminder_dispatches (assignment_id,student_id,reminder_window) VALUES (?,?,?)",
  );
  for (const row of candidates) {
    const due = Date.parse(row.dueAt);
    if (!Number.isFinite(due) || due <= now.getTime()) continue;
    const hoursLeft = (due - now.getTime()) / 3600000;
    for (const w of windows) {
      if (!(hoursLeft <= w.upper && hoursLeft > w.lower)) continue;
      const pref = db
        .prepare(
          `SELECT notifications_enabled AS allEnabled,due_reminders_enabled AS dueEnabled, ${w.pref} AS windowEnabled FROM notification_preferences WHERE user_id=?`,
        )
        .get(row.studentId);
      if (pref && (!pref.allEnabled || !pref.dueEnabled || !pref.windowEnabled))
        continue;
      const result = claim.run(row.assignmentId, row.studentId, w.key);
      if (!result.changes) continue;
      try {
        notify(
          row.studentId,
          "due_reminder",
          w.title,
          `${row.title} is due in approximately ${w.hours === 24 ? "24 hours" : "1 hour"}. Submit it before the deadline.`,
          "assignment",
          row.assignmentId,
        );
        sent++;
      } catch (err) {
        db.prepare(
          "DELETE FROM reminder_dispatches WHERE assignment_id=? AND student_id=? AND reminder_window=?",
        ).run(row.assignmentId, row.studentId, w.key);
        throw err;
      }
    }
  }
  return sent;
}
