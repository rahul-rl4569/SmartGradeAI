# SmartGrade AI Implementation Checklist

## Phase 1 — Foundation

- [x] React/Vite and Express workspace structure created
- [x] Environment validation and SQLite initialization
- [x] Health endpoint
- [ ] Verify full local startup and production frontend build in the target Windows environment

## Phase 2 — Public website

- [x] Responsive home, about, features, how-it-works, and contact pages
- [x] Contact API with validation, rate limiting, and SQLite persistence
- [ ] Verify browser behavior and end-to-end contact submission

## Phase 3 — Authentication

- [x] Signup/login/logout/me API routes
- [x] bcrypt password hashing
- [x] HttpOnly JWT cookie sessions and database session invalidation
- [x] Public signup restricted to teacher/student roles
- [x] Expiring single-use password reset tokens
- [x] Frontend login/signup/forgot/reset pages connected to API
- [ ] Configure production password reset email provider
- [ ] Execute full auth tests and production build in target environment

## Phase 4 — Database and core APIs

- [x] Classes, enrollments, and assignments tables with foreign keys and indexes
- [x] Teacher class creation, listing, details, editing, and archiving
- [x] Student enrollment by class code; duplicate enrollment prevention
- [x] Teacher enrollment roster and authorized student removal
- [x] Assignment create/list/details/edit/publish/close/archive APIs
- [x] Server-side role and ownership checks for core routes
- [x] Audit events for class, enrollment, and assignment changes
- [x] API documentation updated
- [x] Phase 4 integration test added
- [ ] Install dependencies and execute tests in a configured environment
- [ ] Add pagination/filtering for larger class and assignment collections

## Remaining phases

- [ ] Phase 5: teacher dashboard, question extraction, and rubric workflows
- [ ] Phase 6: student dashboard and assignment submissions
- [ ] Phase 7: AI evaluation, teacher review, and grade approval
- [ ] Phase 8: marks, feedback, analytics, and report exports
- [ ] Phase 9: security review, end-to-end tests, and final handover

## Phase 5 — Teacher workspace (current)

- [x] Replace teacher dashboard placeholder with an authenticated teacher workspace
- [x] Dashboard metrics loaded from the classes and assignments APIs
- [x] Create classes through the existing authenticated API
- [x] Show class roster counts and enrollment codes; copy code action
- [x] Archive classes through the existing API
- [x] Create assignments and save as drafts
- [x] Publish, close, and archive assignments through the existing API
- [x] Search/filter class and assignment lists in the interface
- [x] Add question-paper area with bounded `.txt` preview and explicit limitation messaging
- [ ] PDF/DOCX extraction, OCR, AI question extraction, question editing/persistence, and rubric workflows
- [ ] Execute frontend build and browser/API end-to-end tests after dependencies are installed

## Phase 6 — Student workspace and text submissions

- [x] Student dashboard with overview metrics, enrolled classes, published assignments, and submission history.
- [x] Join active classes with enrollment codes.
- [x] Read assignment instructions and submit or update a text answer while the assignment is open and before its due date.
- [x] SQLite submissions table with one submission per student per assignment and timestamps.
- [x] Student-owned submission retrieval and teacher-only roster/submission review endpoint.
- [x] Submission endpoints enforce role, class enrollment, publication state, active class, and due date.
- [ ] File uploads, AI evaluation, grading rubric, teacher approval/release, marks and feedback are not part of Phase 6.

## Phase 7 — Teacher review and grading foundation

- [x] Teacher can select an assignment and review its submitted answers.
- [x] Teacher can save scores and feedback privately as a draft.
- [x] Teacher can explicitly release grades and feedback to the student.
- [x] Score is validated against the assignment's total marks.
- [x] Student submission history displays grades/feedback only after release.
- [x] Additive SQLite migration preserves existing submission records.
- [ ] AI-assisted grading, rubric builder, file uploads, and end-to-end UI verification remain future work.

## Phase 8 — AI-assisted grading suggestions

- [x] Teacher-only endpoint generates a grading suggestion for submissions belonging to the teacher's assignments.
- [x] Optional rubric / marking criteria can be provided with the request.
- [x] Local mock mode provides an explicitly labeled heuristic demo, not a real AI model or external API integration.
- [x] Teacher UI displays suggested score, feedback, possible strengths, improvements, and rationale.
- [x] Teacher must explicitly copy a suggestion into the grading form and save or release it; generation never saves or releases grades automatically.
- [x] Audit log records suggestion generation without storing the student answer in audit metadata.
- [ ] Full build and browser/API end-to-end testing require installing dependencies in the user's local environment.

### Phase 8 configuration and limitations

The mock grader runs locally without a provider key. It is a demonstration heuristic only and should not be used to determine real student grades. It cannot evaluate scanned PDFs without selectable text. Suggestions can be wrong; teachers must independently verify answers, rubric, score, and feedback before saving or releasing results.

## Phase 9 — Question Paper Upload & Extraction

- [x] Teacher-only PDF/DOCX/TXT upload with size and file-type checks
- [x] Extract selectable PDF text, DOCX text, and TXT content
- [x] Detect numbered question candidates with a heuristic parser
- [x] Persist uploaded paper metadata and editable question list in SQLite
- [x] Teacher-owned list, detail, update, and delete endpoints
- [x] Question paper library and editor in Teacher Dashboard
- [ ] Create an assignment directly from selected extracted questions
- [ ] Full frontend build and browser end-to-end verification

## Phase 10 — Assessment Builder

- [x] Build an assessment draft from a saved teacher-owned question paper.
- [x] Select which questions to include and assign marks per selected question.
- [x] Calculate the total from selected question marks and validate it on the API.
- [x] Persist structured question data in assignments with an additive SQLite migration.
- [x] Display structured questions to enrolled students on published assignments.
- [x] Keep assignment drafts unpublished until a teacher explicitly publishes them.
- [ ] Per-question answer fields, per-question grading, scanned question-paper OCR, and full end-to-end browser verification remain future work.

## Phase 11 — Per-question submission and grading

- [x] Add an additive SQLite `submission_answers` table for question-indexed responses and grading fields.
- [x] Students answer each structured assessment question separately.
- [x] Validate that a structured assessment submission includes the expected question indexes.
- [x] Teachers can score and give feedback on each question, with a per-question marks cap.
- [x] Keep private question grades hidden from students.
- [x] Automatically calculate the overall score once every question grade is released.
- [x] Preserve legacy single-text submission behavior for assignments without structured questions.
- [ ] Complete local frontend build and browser end-to-end testing.

## Phase 13 — Assessment Analytics

- [x] Teacher-only analytics endpoint with ownership checks
- [x] Class and enrollment summary metrics
- [x] Assignment submission and grading progress
- [x] Released-score average and distribution
- [x] Per-question released-grade analysis
- [x] Responsive Analytics workspace in teacher sidebar
- [x] Notes describing metric interpretation and grade visibility
- [ ] Full production build and browser end-to-end test (requires local dependency installation)

## Phase 13 — Exportable Reports

- [x] Add teacher-scoped CSV export endpoint for released grades.
- [x] Support all assignments or one selected assignment.
- [x] Include class, assignment, student, score, percentage, feedback, and timestamps.
- [x] Exclude private/unreleased grades from exports.
- [x] Add Analytics export button and document privacy handling.

## Phase 14 — PDF reports

Added `GET /api/reports/teacher/results.pdf`, a teacher-authenticated PDF report export. Reports can be scoped to one assignment or all assignments belonging to the authenticated teacher. Only released grades are included; private/unreleased grades are excluded. The PDF includes SmartGrade AI branding, generated timestamp, released-result count, average percentage across included released rows, class/assignment groupings, student names/emails, marks, percentages, submission dates, and released feedback. The Analytics workspace now has a **Download PDF report** action alongside the Phase 13 CSV export. PDF generation uses PDFKit on the server; no PDF content or student data is generated in the browser.

### Phase 14 verification

Run `npm install`, `npm test`, and `npm run build` from the project root. Backend route syntax can be checked with `node --check server/src/routes/pdfReports.js` and `node --check server/src/app.js`. A full production build and end-to-end PDF rendering test must be performed locally after dependencies are installed.

## Phase 15 — Student Progress & Learning Insights

- [x] Add a student-facing Progress & Insights navigation section.
- [x] Calculate average percentage using released assignment grades only.
- [x] Display released result history and subject-level averages.
- [x] Display question-level performance where question grades have been released.
- [x] Provide transparent, rule-based study prompts based on available results.
- [x] Keep private/unreleased grades excluded from student insights.
- [ ] Complete frontend production build and browser-based end-to-end testing in the target environment.

### Phase 15 limitations

Insights are descriptive and rule-based, not a validated educational assessment or a predictive model. Recommendations are general study prompts, and question-level summaries depend on released question grades being present in the API response.

## Phase 16 — Notifications

- [x] Notification table and index added to SQLite schema.
- [x] Authenticated notification list and unread count endpoint.
- [x] Mark-one-read and mark-all-read endpoints.
- [x] Notify enrolled students when a teacher publishes an assignment.
- [x] Notify teacher on first student submission.
- [x] Notify student when all structured question grades are released or a whole-assignment grade is released.
- [x] Notification bell and dropdown added to teacher and student workspaces.
- [ ] Scheduled due-date reminders are not included; they require a scheduled worker/automation.

## Phase 18 — Email Notifications

- [x] Optional SMTP delivery service and environment configuration
- [x] Per-user email opt-in and event preferences
- [x] Emails for assignment publication, submission received, grade released, and due reminders
- [x] Delivery audit log with sent/skipped/failed states
- [x] Additive SQLite migration for existing databases
- [ ] Verify SMTP credentials and deliverability in the deployment environment
- [ ] Complete browser-based end-to-end testing

- [x] Phase 19 admin dashboard, user status management, audit log and email delivery views (local integration testing still required).

## Phase 20 — Production Readiness & Deployment

- [x] Configurable host binding
- [x] Production environment validation for JWT secret and frontend origin
- [x] Health endpoint uptime field
- [x] Idempotent shutdown signal handling
- [x] Production deployment and release checklist
- [ ] Clean-install dependency verification in target environment
- [ ] Full frontend build and end-to-end browser test
- [ ] Backup/restore drill and deployment security review
