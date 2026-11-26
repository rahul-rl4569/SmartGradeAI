## Phase 2 public website

Implemented public routes: `/`, `/about`, `/features`, `/how-it-works`, and `/contact`. The contact form posts to `POST /api/contact`; validated messages are stored in the SQLite `contact_messages` table. The endpoint is rate limited. It does not send email or include an admin inbox yet. Login, signup, and password reset are intentionally informational until Phase 3 implements real authentication.

API documentation: `docs/api-documentation.md`. Phase progress: `docs/phase-checklist.md`.

## Phase 3: Authentication

Implemented authentication endpoints:

- `POST /api/auth/signup` — creates teacher/student accounts; public admin registration is not permitted.
- `POST /api/auth/login` — validates credentials and sets an HttpOnly, SameSite=Strict session cookie.
- `GET /api/auth/me` — returns the current authenticated user.
- `POST /api/auth/logout` — invalidates the user's existing sessions and clears the cookie.
- `POST /api/auth/forgot-password` — creates an expiring single-use reset token. In development only, the response exposes the token because no email delivery provider is configured.
- `POST /api/auth/reset-password` — validates and consumes a reset token, updates the password hash, and invalidates existing sessions.

Passwords are hashed with bcryptjs. Sessions use signed JWT cookies and a database token-version check. Role-protected entry routes exist at `/teacher/dashboard` and `/student/dashboard`; these are authenticated placeholders, not the completed dashboards. State-changing requests are checked against the configured frontend Origin.

### Local setup

1. Copy `.env.example` to `.env` in the project root if you have not already done so.
2. Replace `JWT_SECRET` with a random secret of at least 32 characters. In PowerShell you can generate one with: `-join ((1..48) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })` (then paste the result into `.env`). For production, use a cryptographically secure secret manager/generator.
3. Run `npm install`, then `npm run dev`.
4. Open `/signup`, create a teacher or student account, and verify you land on the corresponding protected entry page.
5. To test password reset locally, use `/forgot-password`; the development-only reset token is shown in the response and can be used to continue to `/reset-password`. Never expose this token in production.

### Phase 3 limitations and verification

- A production password-reset email provider is not configured. Production responses intentionally do not expose reset tokens; wire a trusted email provider before enabling user-facing production password recovery.
- Session cookies are HttpOnly and SameSite=Strict. HTTPS is required in production for the Secure cookie setting to be enabled.
- This phase establishes account/session authentication and protected entry routes; class, assignment, and detailed role authorization will be expanded in later phases.
- Run `npm test` and `npm run build` locally after installing dependencies. No test or build result is claimed unless it has been executed in the current environment.

## Phase 4: Database and core APIs

Phase 4 adds persistent classes, class enrollment, and assignment management while retaining the Phase 3 authentication routes. New authenticated API groups:

- `/api/classes` — teacher-owned class creation, listing, details, updates, archiving, and enrollment roster.
- `/api/enrollments` — students join with an enrollment code; a teacher can remove an enrollment only from a class they own.
- `/api/assignments` — teacher assignment creation/editing, status transitions, and student-visible published assignments.

The schema adds `classes`, `class_enrollments`, and `assignments` with foreign keys, uniqueness constraints, status checks, and indexes. Existing records are not intentionally reset; the schema uses `CREATE TABLE IF NOT EXISTS` and an additive migration version marker. Teachers can only manage their own classes and assignments. Students can only list classes they are enrolled in and see published assignments for active classes. Enrollment codes are not returned in student class responses.

### Phase 4 local verification

From the project root run:

```powershell
npm install
npm test
npm run build
```

The new integration test in `server/tests/phase4.test.js` exercises teacher class creation, student enrollment and duplicate rejection, draft assignment privacy, publication, student assignment access, and class ownership. Dependency installation timed out in the authoring environment, so the automated test suite and frontend production build have not been executed here. Run the commands above on the Windows development machine and address any reported errors before treating the phase as verified.

### Phase 4 scope boundary

Question papers, assignment questions, student submissions, rubric creation, AI grading, and grade release are not implemented by this phase; they are planned for subsequent phases.

## Phase 5: Teacher workspace

The authenticated `/teacher/dashboard` route now renders a teacher workspace with Overview, My Classes, Assignments, and Question Papers sections. The dashboard loads actual class and assignment data through the existing protected API. Teachers can create classes, copy enrollment codes, archive classes, create draft assignments, publish drafts, close published assignments, and archive eligible assignments. Class and assignment actions rely on backend role and ownership checks.

The Question Papers section currently supports a limited plain-text (`.txt`, up to 1 MB) preview in the browser. It does not yet extract structured questions, persist question edits, process PDF/DOCX, run OCR, or call an AI provider. The preview explicitly tells the user these limits; do not treat the preview as a saved question paper or AI extraction result. Rubric generation/approval is also not implemented in Phase 5.

### Phase 5 verification

Backend JavaScript syntax checks passed for the existing API files. `npm run build` could not run because frontend dependencies (Vite) are not installed in the authoring environment. Install dependencies on the Windows computer and run `npm test` and `npm run build` before treating the phase as verified. No successful end-to-end browser test is claimed.

### Phase 6: student workflow

Students can join a class using an enrollment code, view enrolled classes and published assignments, submit/update text answers, and view their submission history. Teachers can retrieve submissions for their own assignments through `GET /api/submissions/assignment/:assignmentId`. File uploads, AI grading, marking, and feedback release are not implemented in this phase.

### Phase 7: teacher review and grading

Teachers can open **Review submissions**, select an assignment, read submitted answers, save scores and feedback privately, and explicitly release the result. Students see score and feedback in **My submissions** only after release. AI grading and rubric authoring are not implemented in this phase.

## Phase 8 — AI-assisted grading suggestions

The teacher submission review screen offers an optional rubric field and a draft local mock suggestion. It uses a deterministic heuristic based on answer length and assignment-instruction word overlap; it does not call an external AI service and is not a real AI model. Suggestions are not released automatically. Scanned PDFs without selectable text must be reviewed manually. Always verify suggestions against the original submission before saving or releasing a grade. See `docs/api-documentation.md` and `docs/phase-checklist.md`.

## Phase 9 — Question Paper Upload & Extraction

- Teacher-only upload and storage for PDF, DOCX, and TXT question papers (10 MB maximum).
- Server-side text extraction for selectable PDF text and DOCX. Scanned student submissions and scanned question papers without selectable text cannot be extracted by the local mock grader. 
- Heuristic question-number detection, editable question candidates and optional marks, with persistence in SQLite.
- Teacher-scoped listing, editing, and deletion.
- Dependencies: multer, pdf-parse, mammoth. Run `npm install` after extracting the phase ZIP.

Extraction is a convenience, not a guarantee: teachers should verify text, question boundaries, and marks before using extracted content in an assessment.

## Phase 10 — Assessment Builder

Teachers can launch **Build assessment** from a saved question paper, choose an active class, select the questions to include, set positive marks per question, and create an assignment draft. The total mark value is calculated from selected questions; the API validates that question marks add up to the assignment total. Structured questions are stored in `assignments.questions_json` through an additive SQLite migration, so existing assignments and records are preserved. Students see the question list in the assignment dialog and submit their response through the existing text-answer flow. Teachers still review and publish drafts manually.

Limitations: answers are submitted as one text response rather than separate per-question responses; there is no automatic question-to-assignment publishing, file-based student answers, per-question grading, or automatic AI grading. Review the question text and marks before publishing.

## Phase 11 — Per-question answers and grading

Phase 11 extends assessments with separate student answer fields for each question and teacher grading controls for each response. The backend stores individual answers in `submission_answers`, validates question indexes and score limits, and restricts grading to the teacher who owns the assignment. Question grades are private until individually released. When all question grades are released, the server calculates and releases the overall score and combines question feedback. Existing free-text assignments remain compatible.

### Test Phase 11

1. Publish an assessment containing two or more questions.
2. Log in as an enrolled student, open the assessment, enter answers in the separate question fields, and submit.
3. Log in as the owning teacher and open **Review submissions**.
4. Score each question within its maximum marks and save privately or release it.
5. Release each question grade. Once all are released, the overall score is calculated automatically.
6. Log in as the student and confirm that only released question scores and feedback are visible.

The per-question scoring workflow requires an assessment created with structured questions. Legacy assignments with no structured questions continue to use the single-answer form.

## Phase 12 — Assessment analytics

Phase 12 adds a teacher-only Analytics workspace and `GET /api/analytics/teacher` endpoint. It reports active classes/enrollments, published assignments, submissions, released results, assignment-level submission and grading progress, released-score averages and distributions, and released per-question averages. Optional `assignmentId` filters the response to a teacher-owned assignment. Analytics use released grades only for score averages/distributions; draft/private grades are excluded.

To run locally, use `npm install` then `npm run dev` from this project root. Open the teacher workspace and choose **Analytics** in the sidebar. All data is calculated from the current SQLite database; empty datasets are shown as empty states rather than fabricated results.

## Phase 13 — Exportable Results Reports

The Analytics workspace now includes **Export released results CSV**. The export can be filtered to the selected assignment or include all of the authenticated teacher's assignments. It contains class, assignment, student, score, total marks, percentage, feedback, submission time, and grading time. Only released grades are included; private or ungraded results are excluded. The server scopes exports to the signed-in teacher's assignments and guards CSV cells against spreadsheet formula injection.

### Exporting a report

1. Sign in as a teacher and open **Analytics**.
2. Optionally choose a specific assignment in the filter.
3. Select **Export released results CSV**.
4. Open the downloaded CSV in Excel or another spreadsheet application.

CSV exports are intended for reporting and can contain student information. Store and share them according to your institution's privacy rules.

## Phase 14 — PDF reports

The Analytics tab now offers **Download PDF report**. Choose an assignment in the existing filter to export one assignment, or leave **All assignments** selected to export released results across your own assignments. The report includes summary figures and released result rows with marks, percentages, submission dates, and feedback. Private/unreleased grades are intentionally excluded. The server generates the PDF using PDFKit; the API requires teacher authentication and enforces assignment ownership.

Install the added PDFKit dependency with `npm install` from the root folder. Verify with `npm test` and `npm run build`. PDF reports contain student personal data and should be stored and shared securely.

## Phase 15 — Student Progress & Learning Insights

The student workspace now includes a **Progress & insights** section. It summarizes released grades, displays assignment score history and subject averages, surfaces question-level performance where available, and offers general study prompts. Only released grades are used; private or unreleased marks are excluded. These insights are descriptive, rule-based summaries rather than validated predictions or professional educational judgments.

To run locally, open a terminal in the project root, run `npm install`, then `npm run dev`. The website is expected at `http://127.0.0.1:5173`. Verify the full build and workflow in your environment before production use.

## Phase 16 — In-app notifications

Phase 16 adds authenticated in-app notification APIs and SQLite storage. Notifications are created when a teacher publishes an assignment, a student submits an answer for the first time, and assessment results are released. Users can list their own notifications, mark one as read, or mark all as read. Notifications are private to the recipient.

API: `GET /api/notifications`, `POST /api/notifications/:id/read`, and `POST /api/notifications/read-all`.

The teacher and student dashboards include a notification bell with unread count, recent notification list, mark-one-read, and mark-all-read controls. Due-date reminders are not sent automatically in this phase; they require a scheduled worker/automation and are not claimed as implemented.

## Phase 17 — Due-date reminders & preferences

Phase 17 adds per-user notification preferences and an idempotent in-app reminder worker for published assignments. Students can enable/disable reminders approximately 24 hours and 1 hour before a deadline. The API checks every five minutes while running; no email or push notifications are configured. See `docs/phase17-notifications.md`.

## Phase 19 — Admin Dashboard

Phase 19 adds a role-protected platform admin dashboard, account management, audit log viewing, email delivery status, and one-time admin bootstrap instructions. See `docs/phase19-admin.md`.

## Phase 20 — Production Readiness & Deployment

See `docs/phase20-production-readiness.md` for production environment requirements, the deployment checklist, and release verification steps. Production deployment and end-to-end validation must be completed in the target hosting environment.
