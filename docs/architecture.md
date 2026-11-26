# SmartGrade AI architecture (Phase 1)

## Request flow

React/Vite client -> HTTP/JSON -> Express API -> reusable services/repositories (to be added in later phases) -> SQLite database access layer.

The browser never connects directly to SQLite. Authentication, role checks, ownership checks, and validation belong on the server. Grading suggestions use a local mock heuristic and do not call an external AI provider.

## Phase 1 decisions

- React 18 + Vite + React Router; plain CSS design tokens for a small, consistent starting design system.
- Express 4, Zod, Helmet, CORS allowlist, API rate limit, and better-sqlite3.
- SQLite foreign keys and WAL mode are enabled at startup.
- Version 1 schema uses `schema_migrations` and initializes idempotently; starting the server does not delete data.
- Uploaded files are stored outside the public client directory.
- Current logo is included as the uploaded raster reference. It has not been represented as an original vector asset.
- The homepage dashboard preview is explicitly illustrative, not live analytics.

## Current schema

- `users`: account profile, role, status, password hash.
- `contact_messages`: validated website contact submissions.
- `audit_logs`: base for security-sensitive action records.
- `schema_migrations`: applied schema versions.

Later phases add class, enrollment, assignment, question, rubric, submission, evaluation, feedback, approval, and reporting tables.
