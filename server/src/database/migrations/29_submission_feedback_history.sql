CREATE TABLE IF NOT EXISTS submission_feedback_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK(scope IN ('overall', 'question')),
  question_index INTEGER CHECK(question_index IS NULL OR question_index >= 0),
  score REAL NOT NULL,
  max_marks REAL NOT NULL,
  feedback TEXT NOT NULL DEFAULT '',
  released_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  released_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_submission_feedback_history
  ON submission_feedback_history(submission_id, released_at DESC, id DESC);

INSERT INTO submission_feedback_history
  (submission_id,scope,score,max_marks,feedback,released_by,released_at)
SELECT s.id,'overall',s.score,a.total_marks,COALESCE(s.feedback,''),s.graded_by,
       COALESCE(s.graded_at,s.submitted_at,datetime('now'))
FROM submissions s
JOIN assignments a ON a.id=s.assignment_id
WHERE s.grading_status='released' AND s.score IS NOT NULL;

INSERT INTO submission_feedback_history
  (submission_id,scope,question_index,score,max_marks,feedback,released_by,released_at)
SELECT sa.submission_id,'question',sa.question_index,sa.score,sa.max_marks,
       COALESCE(sa.feedback,''),sa.graded_by,
       COALESCE(sa.graded_at,s.graded_at,s.submitted_at,datetime('now'))
FROM submission_answers sa
JOIN submissions s ON s.id=sa.submission_id
WHERE sa.grading_status='released' AND sa.score IS NOT NULL;
