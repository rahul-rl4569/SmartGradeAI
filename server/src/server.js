import fs from "node:fs";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { db } from "./database/db.js";
import { dispatchDueDateReminders } from "./reminders.js";

fs.mkdirSync(env.uploadDirectory, { recursive: true });
const server = app.listen(env.PORT, env.HOST, () => {
  console.log(`SmartGrade AI API listening at http://${env.HOST}:${env.PORT}`);
  const gradingConfigured = Boolean(
    env.GRADING_AI_BASE_URL && env.GRADING_AI_API_KEY && env.GRADING_AI_MODEL,
  );
  console.log(
    `Environment: ${env.NODE_ENV}; grading AI: ${gradingConfigured ? "configured" : "not configured"}`,
  );
  // Check every five minutes; reminders are idempotent and preferences are respected.
  try {
    console.log(
      `Initial due-date reminders queued: ${dispatchDueDateReminders()}`,
    );
  } catch (err) {
    console.error("Initial reminder check failed:", err.message);
  }
});
const reminderTimer = setInterval(
  () => {
    try {
      dispatchDueDateReminders();
    } catch (err) {
      console.error("Due-date reminder check failed:", err.message);
    }
  },
  5 * 60 * 1000,
);
reminderTimer.unref();
let isShuttingDown = false;
function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`${signal} received; shutting down SmartGrade AI API...`);
  clearInterval(reminderTimer);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
