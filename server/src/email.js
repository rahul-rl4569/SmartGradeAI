import nodemailer from "nodemailer";
import { db } from "./database/db.js";
import { env } from "./config/env.js";

let transporter;
function getTransporter() {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.EMAIL_FROM)
    return null;
  if (!transporter)
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  return transporter;
}

function preferenceColumn(eventType) {
  if (eventType === "assignment_published") return "email_assignments_enabled";
  if (eventType === "submission_received") return "email_submissions_enabled";
  if (eventType === "grade_released") return "email_grades_enabled";
  if (eventType === "due_reminder") return "email_reminders_enabled";
  return null;
}

export async function sendEventEmail({
  userId,
  eventType,
  subject,
  text,
  entityType = "event",
  entityId = 0,
}) {
  const user = db
    .prepare(
      "SELECT id,email,full_name AS fullName FROM users WHERE id=? AND status='active'",
    )
    .get(Number(userId));
  if (!user) return { status: "skipped", reason: "user_not_found" };
  const eventPref = preferenceColumn(eventType);
  const prefs = db
    .prepare("SELECT * FROM notification_preferences WHERE user_id=?")
    .get(user.id);
  if (
    !prefs ||
    !prefs.email_notifications_enabled ||
    (eventPref && !prefs[eventPref])
  ) {
    return { status: "skipped", reason: "email_disabled" };
  }
  const eventKey = `${user.id}:${eventType}:${entityType}:${entityId}`;
  const alreadySent = db
    .prepare(
      "SELECT id FROM email_delivery_logs WHERE user_id=? AND event_key=? AND status='sent'",
    )
    .get(user.id, eventKey);
  if (alreadySent) return { status: "skipped", reason: "already_sent" };
  const mailer = getTransporter();
  if (!mailer) {
    db.prepare(
      "INSERT INTO email_delivery_logs (user_id,event_key,recipient_email,subject,status,error_message) VALUES (?,?,?,?,?,?)",
    ).run(
      user.id,
      eventKey,
      user.email,
      subject,
      "skipped",
      "SMTP is not configured.",
    );
    return { status: "skipped", reason: "smtp_not_configured" };
  }
  try {
    await mailer.sendMail({
      from: env.EMAIL_FROM,
      to: user.email,
      subject,
      text: `Hello ${user.fullName},\n\n${text}\n\nOpen SmartGrade AI to view the details.\n\nIf you no longer want these emails, update your email notification preferences in SmartGrade AI.`,
    });
    db.prepare(
      "INSERT INTO email_delivery_logs (user_id,event_key,recipient_email,subject,status) VALUES (?,?,?,?,?)",
    ).run(user.id, eventKey, user.email, subject, "sent");
    return { status: "sent" };
  } catch (error) {
    db.prepare(
      "INSERT INTO email_delivery_logs (user_id,event_key,recipient_email,subject,status,error_message) VALUES (?,?,?,?,?,?)",
    ).run(
      user.id,
      eventKey,
      user.email,
      subject,
      "failed",
      String(error?.message || "Email delivery failed").slice(0, 500),
    );
    console.error(
      "Email notification delivery failed:",
      error?.message || "unknown error",
    );
    return { status: "failed" };
  }
}
