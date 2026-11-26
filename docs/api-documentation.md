# SmartGrade AI API Documentation

Base URL during local development: `http://127.0.0.1:4000/api`

Browser authentication uses the HttpOnly `smartgrade_session` cookie. Send credentials with browser requests (`withCredentials: true`). Protected routes require an active session and enforce role/ownership checks server-side. JSON error shape: `{ "error": { "code": "...", "message": "..." } }`.

## Health and public contact

- `GET /health` — API and database readiness.
- `POST /contact` — persist a validated contact message. Body: `{ "name", "email", "subject", "message" }`.

## Authentication

- `POST /auth/signup` — create teacher/student account. Requires `fullName`, `email`, `password` (10+ characters), `role` (`teacher` or `student`), `termsAccepted: true`.
- `POST /auth/login` — authenticate with `email` and `password`.
- `GET /auth/me` — current session user.
- `POST /auth/logout` — invalidate current session.
- `POST /auth/forgot-password` — request reset token (development token only outside production until email delivery is configured).
- `POST /auth/reset-password` — reset using `token` and a new password.

## Classes — authenticated teacher/student

- `GET /classes` — teachers get their classes; students get active enrolled classes. Enrollment codes are never returned to students.
- `POST /classes` — teacher only. Body: `{ "name", "subject", "description?" }`. Returns class details and enrollment code.
- `GET /classes/:id` — owner teacher or active enrolled student.
- `PATCH /classes/:id` — owner teacher only. Partial body fields: `name`, `subject`, `description`.
- `POST /classes/:id/archive` — owner teacher only; archives class and its non-archived assignments.
- `GET /classes/:id/enrollments` — owner teacher only; lists enrolled students.

## Enrollments

- `POST /enrollments/join` — student only. Body: `{ "enrollmentCode": "..." }`. Duplicate active enrollment returns `409`.
- `DELETE /enrollments/:id` — teacher only; removes enrollment only if the teacher owns its class.

## Assignments

- `GET /assignments` — teacher gets their assignments; student gets published assignments for active enrolled classes.
- `POST /assignments` — teacher only. Body: `{ "classId": number, "title": string, "instructions?": string, "totalMarks": number, "dueAt?": ISO-8601 string or null }`. Class must be active and owned by teacher.
- `GET /assignments/:id` — owner teacher or enrolled student for a published assignment. Student responses omit teacher ID.
- `PATCH /assignments/:id` — owner teacher only; partial fields `title`, `instructions`, `totalMarks`, `dueAt`. Published/closed assignment total marks are locked.
- `POST /assignments/:id/publish` — publish a draft assignment in an active class.
- `POST /assignments/:id/close` — close a published assignment.
- `POST /assignments/:id/archive` — archive an assignment.

## Database tables introduced in Phase 4

- `classes`: teacher-owned classes and unique enrollment codes.
- `class_enrollments`: student-to-class memberships with active/removed status.
- `assignments`: class-linked assignments, ownership, due dates, marks, and lifecycle status.

All SQL uses parameterized statements. Foreign keys are enabled. Audit records are written for core class, enrollment, and assignment changes. Phase 4 does not yet implement questions, submissions, rubrics, grading, or reports; those are subsequent phases.

## Teacher workspace endpoints used in Phase 5

The teacher dashboard consumes existing authenticated endpoints:

- `GET /api/classes` — list classes owned by the teacher, including active enrollment counts and enrollment codes.
- `POST /api/classes` — create a class.
- `POST /api/classes/:id/archive` — archive an owned class and its eligible assignments.
- `GET /api/assignments` — list the teacher's assignments.
- `POST /api/assignments` — create a draft assignment for an active class owned by the teacher.
- `POST /api/assignments/:id/publish` — publish a draft assignment.
- `POST /api/assignments/:id/close` — close a published assignment.
- `POST /api/assignments/:id/archive` — archive an assignment.

All endpoints require the authenticated session cookie and enforce teacher role/ownership in the backend. The Phase 5 question-paper text preview is client-side only and does not call an API or persist question content.

## Phase 6 — Submissions

All endpoints require an authenticated session.

- `GET /api/submissions/mine` — student: returns only the signed-in student's submissions and associated assignment/class details.
- `POST /api/submissions/:assignmentId` — student: body `{ "answerText": "..." }`; creates or updates the student's text answer for a published assignment in an active class, if enrolled and before the due date.
- `GET /api/submissions/assignment/:assignmentId` — teacher: returns submissions for an assignment owned by that teacher, including student name/email and answer text.

A student can have one current text submission per assignment. Re-submitting updates that record and marks its status `resubmitted`. This phase does not award marks or release feedback.

## Phase 7 — Grading endpoints

- `GET /api/submissions/assignment/:assignmentId` (teacher): lists submissions only for an assignment owned by the signed-in teacher. Returns answer text and grading state.
- `PATCH /api/submissions/:submissionId/grade` (teacher): body `{ "score": 8, "feedback": "Good reasoning", "release": false }`. Set `release: true` to make score and feedback visible to the student. Scores must be between zero and the assignment's `totalMarks`.
- `GET /api/submissions/mine` (student): includes score and feedback only after grading status is `released`.

## Phase 8: AI-assisted grading suggestion

### `POST /api/submissions/:submissionId/ai-suggest`

Teacher-only. The submission must belong to an assignment owned by the signed-in teacher.

Request JSON:

```json
{ "rubric": "Optional marking criteria or expected answer points" }
```

The rubric field is optional and limited to 5,000 characters. Response includes a `suggestion` with `score`, `feedback`, `strengths`, `improvements`, `rationale`, and `provider`, plus `requiresTeacherReview: true`. The suggestion is stored as a draft AI-evaluation record for the teacher; it does not save an official grade or release anything to the student.

Grading suggestions use a local deterministic mock heuristic; no external AI provider or API key is configured. The mock uses answer length and overlap with assignment-instruction terms and is only for development/workflow testing, not reliable grading. Scanned PDFs without selectable text cannot be evaluated by the mock grader. Teachers must review all suggestions and explicitly approve and publish a grade using the hybrid evaluation endpoints below.

## Question papers (teacher only)

- `GET /api/question-papers` — list current teacher's saved papers.
- `POST /api/question-papers` — multipart form field `file`; accepts PDF, DOCX, TXT up to 10 MB; extracts selectable text and question candidates.
- `GET /api/question-papers/:id` — get owned paper, source text, and question list.
- `PUT /api/question-papers/:id` — save `title` and editable `questions` array.
- `DELETE /api/question-papers/:id` — delete owned paper and stored upload.

Question detection is pattern-based and must be checked by the teacher. Scanned question papers without selectable text cannot be extracted by this upload route.

## Hybrid evaluation and reporting

All endpoints below require the existing authenticated session cookie. Teacher endpoints verify class ownership; student endpoints return only the signed-in student's published results.

`POST /api/question-papers/:id/approve-structure` lets the owning teacher approve a non-empty edited extracted question structure. Editing the question list clears that approval.

- `GET /api/question-papers/:id/file` lets the owning teacher download the preserved original question paper for manual review.

- `POST /api/evaluations/assignments/:assignmentId/rubrics` — teacher creates a rubric draft. Body: `{ "criteria": [{ "questionIndex": 0, "key": "q1_core", "name": "Core concepts", "maxMarks": 5, "expectedAnswer": "...", "keywords": ["concept"], "topic": "...", "scoringMode": "hybrid", "questionType": "text" }] }`. Modes: `rule`, `ai`, `hybrid`; types: `text`, `math`, `code`.
- `POST /api/evaluations/rubrics/:rubricVersionId/approve` — teacher approves and versions the rubric/question structure.
- `POST /api/evaluations/submissions/:submissionId/jobs` — queue evaluation for a submission with the current approved rubric. Existing active work is returned idempotently.
- `GET /api/evaluations/jobs/:jobId` — teacher polls one owned processing job.
- `POST /api/evaluations/jobs/:jobId/retry` — start a new job for a failed job.
- `GET /api/evaluations/submissions/:submissionId` — teacher gets extraction, question mapping, evidence, flags, criteria, and suggestions. The owning student may read only after publication; draft AI/rule marks and extraction text are filtered.
- `POST /api/evaluations/results/:resultId/approve` — teacher supplies `{ "finalScore": 8, "feedback": "...", "teacherComment": "...", "criterionScores": [{ "criterionResultId": 10, "score": 2, "feedback": "..." }] }`; saves a private teacher-approved grade and optional criterion-level marks.
- `POST /api/evaluations/results/:resultId/reject` — teacher supplies `{ "reason": "..." }` and returns the evaluation to a re-evaluation workflow.
- `POST /api/evaluations/results/:resultId/publish` — publish a previously approved grade to the student.
- `GET /api/evaluations/classes/:classId/marks` — class roster/assignment marks with suggestions distinguished from published official marks.
- `GET /api/evaluations/classes/:classId/marks.xlsx` — ownership-scoped Excel workbook of class marks, with filters and headers.
- `GET /api/evaluations/assignments/:assignmentId/marks.xlsx` — ownership-scoped single-assignment marks workbook.
- `GET /api/evaluations/students/:studentId/report.xlsx` — ownership-scoped workbook of the student's published results across the teacher's classes.
- `GET /api/evaluations/classes/:classId/topics.xlsx` and `GET /api/evaluations/classes/:classId/reliability.xlsx` — teacher-approved topic performance and comparable grading records.
- `GET /api/evaluations/classes/:classId/analytics` — counts, published-mark summary, topic performance, and sufficiently sampled knowledge gaps.
- `GET /api/evaluations/classes/:classId/reliability` — MAE, RMSE, agreement and adjustment metrics against published teacher-approved marks; at least three comparable evaluations are required.
- `POST /api/evaluations/classes/:classId/recommendations` — teacher creates a draft or published student next step with a topic and reason.
- `GET /api/evaluations/classes/:classId/recommendations` — owner teacher lists draft and published recommendations for that class.
- `POST /api/evaluations/classes/:classId/recommendations/generate` — creates draft recommendations using approved topic/criterion aggregates. The evidence reason is calculated from approved marks. Duplicates are skipped.
- `PATCH /api/evaluations/recommendations/:recommendationId` — owning teacher edits, publishes, or dismisses a recommendation.
- `GET /api/evaluations/student/results` and `GET /api/evaluations/student/recommendations` — signed-in student's published results/recommendations and their own in-progress evaluation states. Legacy manually released grades are included.

When a student submits or resubmits a file, an approved assignment rubric causes the backend to enqueue the submission automatically. Teachers can also enqueue/retry from the Hybrid evaluation dashboard.

Job states are `pending`, `extracting`, `segmenting`, `evaluating`, `review_required`, `completed`, and `failed`. AI suggestions never become official marks without teacher approval and publication.

## Phase 10: Assessment Builder

`POST /api/assignments` accepts optional structured questions alongside existing assignment fields:

```json
{
  "classId": 12,
  "title": "Chapter 2 Assessment",
  "instructions": "Answer all selected questions.",
  "totalMarks": 15,
  "dueAt": null,
  "questions": [
    { "text": "Explain the main concept.", "marks": 5 },
    { "text": "Give two examples.", "marks": 10 }
  ]
}
```

Question marks must be positive and their sum must match `totalMarks`. Assignment responses include a `questions` array. The migration adds `assignments.questions_json` without deleting existing assignment records. The student assignment view displays these questions, but responses are still submitted as one text answer for the whole assignment.

### Phase 11 — Per-question answers and grading

- `POST /api/submissions/:assignmentId` accepts `{ "answers": [{ "questionIndex": 0, "answerText": "..." }] }` for structured assessments. The list must match the assignment's question indexes. Legacy assignments accept `{ "answerText": "..." }`.
- `GET /api/submissions/mine` returns the student's answers and only exposes question scores/feedback when the corresponding question grade is released.
- `GET /api/submissions/assignment/:assignmentId` returns each submission's question answers for the assignment-owning teacher.
- `PATCH /api/submissions/:submissionId/answers/:questionIndex/grade` accepts `{ "score": 2, "feedback": "...", "release": false }`. Scores cannot exceed the question's maximum marks. When all question grades are released, the API calculates and releases the overall score and compiles question feedback.

## Phase 12: Analytics

### `GET /api/analytics/teacher`

Teacher-only. Returns summary counts and per-assignment analytics for the authenticated teacher's assignments. Optional query parameter `assignmentId` filters to one assignment owned by the teacher. Response includes submission count, enrolled count, grading progress, average released score, released score distribution, and per-question averages for released question grades. Private/draft grades are excluded from score analytics. Returns `404` when a requested assignment does not belong to the teacher.

### Export released results CSV — Phase 13

`GET /api/analytics/teacher/export.csv`

Teacher-authenticated endpoint. Optional query parameter `assignmentId=<positive integer>` filters to one assignment owned by the signed-in teacher. Without it, exports released results for all of that teacher's assignments. The CSV includes class, assignment, student name/email, score, total marks, percentage, feedback, submission timestamp, and grading timestamp. Only rows with `grading_status='released'` and a non-null score are included. Responses use `text/csv`, attachment disposition, and `Cache-Control: no-store`.

### Phase 18 email preferences

`GET /api/notifications/preferences` now includes `emailNotificationsEnabled`, `emailAssignmentsEnabled`, `emailSubmissionsEnabled`, `emailGradesEnabled`, and `emailRemindersEnabled`. `PUT /api/notifications/preferences` requires these booleans alongside the existing in-app and due-reminder preference fields. Email delivery requires server-side SMTP environment variables and is opt-in per user.
