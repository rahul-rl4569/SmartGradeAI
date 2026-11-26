import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { env } from "../config/env.js";

fs.mkdirSync(path.dirname(env.databasePath), { recursive: true });
export const db = new Database(env.databasePath);
db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");
const schemaPath = new URL("./schema.sql", import.meta.url);
db.exec(fs.readFileSync(schemaPath, "utf8"));
// Safe additive migration for databases created before Phase 3.
const userColumns = db
  .prepare("PRAGMA table_info(users)")
  .all()
  .map((column) => column.name);
if (!userColumns.includes("token_version"))
  db.exec(
    "ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0",
  );

export function databaseReady() {
  const result = db.prepare("SELECT 1 AS ready").get();
  return result?.ready === 1;
}

// Phase 7: add grading/release fields without deleting existing submission data.
const submissionColumns = db
  .prepare("PRAGMA table_info(submissions)")
  .all()
  .map((column) => column.name);
if (!submissionColumns.includes("score"))
  db.exec("ALTER TABLE submissions ADD COLUMN score REAL");
if (!submissionColumns.includes("feedback"))
  db.exec("ALTER TABLE submissions ADD COLUMN feedback TEXT");
if (!submissionColumns.includes("grading_status"))
  db.exec(
    "ALTER TABLE submissions ADD COLUMN grading_status TEXT NOT NULL DEFAULT 'ungraded'",
  );
if (!submissionColumns.includes("graded_by"))
  db.exec(
    "ALTER TABLE submissions ADD COLUMN graded_by INTEGER REFERENCES users(id) ON DELETE SET NULL",
  );
if (!submissionColumns.includes("graded_at"))
  db.exec("ALTER TABLE submissions ADD COLUMN graded_at TEXT");
db.prepare("INSERT OR IGNORE INTO schema_migrations(version) VALUES (4)").run();

// Phase 21: add assignment file metadata without deleting existing submissions.
const fileColumns = {
  file_name: "TEXT",
  stored_file_name: "TEXT",
  file_mime_type: "TEXT",
  file_size: "INTEGER",
};

for (const [column, definition] of Object.entries(fileColumns)) {
  if (!submissionColumns.includes(column)) {
    db.exec(`ALTER TABLE submissions ADD COLUMN ${column} ${definition}`);
  }
}

db.prepare(
  "INSERT OR IGNORE INTO schema_migrations(version) VALUES (11)",
).run();

// Phase 10: add structured question data to existing assignments without deleting records.
const assignmentColumns = db
  .prepare("PRAGMA table_info(assignments)")
  .all()
  .map((column) => column.name);
if (!assignmentColumns.includes("questions_json"))
  db.exec(
    "ALTER TABLE assignments ADD COLUMN questions_json TEXT NOT NULL DEFAULT '[]'",
  );
db.prepare("INSERT OR IGNORE INTO schema_migrations(version) VALUES (6)").run();

// Phase 23: add assignment attachment metadata safely.
const assignmentFileColumns = {
  attachment_original_name: "TEXT",
  attachment_stored_name: "TEXT",
  attachment_mime_type: "TEXT",
  attachment_file_size: "INTEGER",
};

const existingAssignmentColumns = db
  .prepare("PRAGMA table_info(assignments)")
  .all()
  .map((column) => column.name);

for (const [column, definition] of Object.entries(assignmentFileColumns)) {
  if (!existingAssignmentColumns.includes(column)) {
    db.exec(`ALTER TABLE assignments ADD COLUMN ${column} ${definition}`);
  }
}

db.prepare(
  "INSERT OR IGNORE INTO schema_migrations(version) VALUES (23)",
).run();

// Phase 11: per-question answer records are additive and preserve legacy submissions.
db.prepare("INSERT OR IGNORE INTO schema_migrations(version) VALUES (7)").run();

// Phase 18: add email notification preferences safely to existing databases.
const preferenceColumns = db
  .prepare("PRAGMA table_info(notification_preferences)")
  .all()
  .map((column) => column.name);
const emailPreferenceColumns = {
  email_notifications_enabled:
    "INTEGER NOT NULL DEFAULT 0 CHECK(email_notifications_enabled IN (0,1))",
  email_assignments_enabled:
    "INTEGER NOT NULL DEFAULT 1 CHECK(email_assignments_enabled IN (0,1))",
  email_submissions_enabled:
    "INTEGER NOT NULL DEFAULT 1 CHECK(email_submissions_enabled IN (0,1))",
  email_grades_enabled:
    "INTEGER NOT NULL DEFAULT 1 CHECK(email_grades_enabled IN (0,1))",
  email_reminders_enabled:
    "INTEGER NOT NULL DEFAULT 1 CHECK(email_reminders_enabled IN (0,1))",
};
for (const [column, definition] of Object.entries(emailPreferenceColumns)) {
  if (!preferenceColumns.includes(column))
    db.exec(
      `ALTER TABLE notification_preferences ADD COLUMN ${column} ${definition}`,
    );
}
db.prepare(
  "INSERT OR IGNORE INTO schema_migrations(version) VALUES (10)",
).run();

// Phase 22: student roll numbers and admin-issued teacher signup codes.
const userColumnsPhase22 = db
  .prepare("PRAGMA table_info(users)")
  .all()
  .map((column) => column.name);

if (!userColumnsPhase22.includes("roll_number")) {
  db.exec("ALTER TABLE users ADD COLUMN roll_number TEXT");
}

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_student_roll_number
  ON users(roll_number)
  WHERE role = 'student' AND roll_number IS NOT NULL AND roll_number != '';

  CREATE TABLE IF NOT EXISTS teacher_signup_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_code_hash TEXT NOT NULL UNIQUE,
    teacher_email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    expires_at TEXT,
    used_at TEXT,
    used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.prepare(
  "INSERT OR IGNORE INTO schema_migrations(version) VALUES (22)",
).run();

// Apply numbered additive migrations atomically and only once per database.
const migrationsDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations",
);
if (fs.existsSync(migrationsDirectory)) {
  const migrationFiles = fs
    .readdirSync(migrationsDirectory)
    .filter((name) => /^\d+_.+\.sql$/i.test(name))
    .sort((a, b) => Number(a.match(/^\d+/)[0]) - Number(b.match(/^\d+/)[0]));
  for (const name of migrationFiles) {
    const version = Number(name.match(/^\d+/)[0]);
    const applied = db
      .prepare("SELECT 1 FROM schema_migrations WHERE version=?")
      .get(version);
    if (applied) continue;
    const sql = fs.readFileSync(path.join(migrationsDirectory, name), "utf8");
    db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations(version) VALUES (?)").run(
        version,
      );
    })();
  }
}
