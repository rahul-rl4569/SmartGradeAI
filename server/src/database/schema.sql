PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL CHECK(length(trim(full_name)) BETWEEN 2 AND 120),
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  token_version INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL CHECK(role IN ('teacher','student','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status);
CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 120),
  email TEXT NOT NULL COLLATE NOCASE,
  subject TEXT NOT NULL CHECK(length(trim(subject)) BETWEEN 2 AND 160),
  message TEXT NOT NULL CHECK(length(trim(message)) BETWEEN 5 AND 5000),
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','in_progress','closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id);

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 120),
  subject TEXT NOT NULL CHECK(length(trim(subject)) BETWEEN 2 AND 120),
  description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 2000),
  enrollment_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_classes_teacher_status ON classes(teacher_id, status);
CREATE TABLE IF NOT EXISTS class_enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','removed')),
  enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(class_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_status ON class_enrollments(student_id, status);
CREATE INDEX IF NOT EXISTS idx_enrollments_class_status ON class_enrollments(class_id, status);
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 2 AND 160),
  instructions TEXT NOT NULL DEFAULT '' CHECK(length(instructions) <= 10000),
  questions_json TEXT NOT NULL DEFAULT '[]',
  total_marks REAL NOT NULL CHECK(total_marks > 0 AND total_marks <= 10000),
  due_at TEXT,

  -- Assignment task attachment (separate from question papers)
  attachment_original_name TEXT,
  attachment_stored_name TEXT UNIQUE,
  attachment_mime_type TEXT,
  attachment_file_size INTEGER,

  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','closed','archived')),
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assignments_class_status ON assignments(class_id, status);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher_created ON assignments(teacher_id, created_at);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL CHECK(length(trim(answer_text)) BETWEEN 1 AND 50000),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','resubmitted')),
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(assignment_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_submissions_student_updated ON submissions(student_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment_submitted ON submissions(assignment_id, submitted_at);
INSERT OR IGNORE INTO schema_migrations(version) VALUES (3);
INSERT OR IGNORE INTO schema_migrations(version) VALUES (1);
INSERT OR IGNORE INTO schema_migrations(version) VALUES (2);


-- Phase 9: persist uploaded question papers and teacher-edited extracted questions.
CREATE TABLE IF NOT EXISTS question_papers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 2 AND 180),
  original_name TEXT NOT NULL CHECK(length(original_name) <= 255),
  stored_name TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK(file_size > 0),
  extracted_text TEXT NOT NULL DEFAULT '',
  questions_json TEXT NOT NULL DEFAULT '[]',
  question_count INTEGER NOT NULL DEFAULT 0 CHECK(question_count BETWEEN 0 AND 200),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_question_papers_teacher_updated ON question_papers(teacher_id, updated_at);
INSERT OR IGNORE INTO schema_migrations(version) VALUES (5);
INSERT OR IGNORE INTO schema_migrations(version) VALUES (6);

-- Phase 11: individual answers and marks for each assessment question.
CREATE TABLE IF NOT EXISTS submission_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL CHECK(question_index >= 0),
  question_text TEXT NOT NULL,
  max_marks REAL NOT NULL CHECK(max_marks > 0),
  answer_text TEXT NOT NULL DEFAULT '',
  score REAL,
  feedback TEXT NOT NULL DEFAULT '',
  grading_status TEXT NOT NULL DEFAULT 'ungraded' CHECK(grading_status IN ('ungraded','draft','released')),
  graded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  graded_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(submission_id, question_index)
);
CREATE INDEX IF NOT EXISTS idx_submission_answers_submission ON submission_answers(submission_id, question_index);
INSERT OR IGNORE INTO schema_migrations(version) VALUES (7);


-- Phase 16: in-app notifications for assignment, submission, and grading events.
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('assignment_published','submission_received','grade_released','due_reminder','system')),
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 180),
  message TEXT NOT NULL CHECK(length(trim(message)) BETWEEN 1 AND 1000),
  entity_type TEXT,
  entity_id INTEGER,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at, created_at DESC);
INSERT OR IGNORE INTO schema_migrations(version) VALUES (8);


-- Phase 17: user notification preferences and idempotent due-date reminder dispatch.
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  notifications_enabled INTEGER NOT NULL DEFAULT 1 CHECK(notifications_enabled IN (0,1)),
  due_reminders_enabled INTEGER NOT NULL DEFAULT 1 CHECK(due_reminders_enabled IN (0,1)),
  reminder_24h_enabled INTEGER NOT NULL DEFAULT 1 CHECK(reminder_24h_enabled IN (0,1)),
  reminder_1h_enabled INTEGER NOT NULL DEFAULT 1 CHECK(reminder_1h_enabled IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reminder_dispatches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reminder_window TEXT NOT NULL CHECK(reminder_window IN ('24h','1h')),
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(assignment_id, student_id, reminder_window)
);
CREATE INDEX IF NOT EXISTS idx_reminder_dispatch_assignment ON reminder_dispatches(assignment_id, student_id);
INSERT OR IGNORE INTO schema_migrations(version) VALUES (9);


-- Phase 18: configurable email notifications and delivery audit trail.
CREATE TABLE IF NOT EXISTS email_delivery_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  event_key TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('sent','skipped','failed')),
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_email_delivery_user_created ON email_delivery_logs(user_id, created_at DESC);
INSERT OR IGNORE INTO schema_migrations(version) VALUES (10);

CREATE TABLE IF NOT EXISTS user_recovery_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  recovery_code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);