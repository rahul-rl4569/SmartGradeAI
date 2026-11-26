ALTER TABLE ai_evaluations
ADD COLUMN question_suggestions_json TEXT NOT NULL DEFAULT '[]';
