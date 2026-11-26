ALTER TABLE submissions ADD COLUMN extracted_text TEXT NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN extraction_status TEXT NOT NULL DEFAULT 'not_processed';
ALTER TABLE submissions ADD COLUMN evaluation_flags_json TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS ai_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  suggested_score REAL NOT NULL,
  total_marks REAL NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  feedback TEXT NOT NULL DEFAULT '',
  strengths_json TEXT NOT NULL DEFAULT '[]',
  improvements_json TEXT NOT NULL DEFAULT '[]',
  rationale TEXT NOT NULL DEFAULT '',
  flags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_evaluations_submission_created
  ON ai_evaluations(submission_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_ai_evaluations_teacher_created
  ON ai_evaluations(teacher_id, created_at DESC);
