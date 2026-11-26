# Phase 20 — Production Readiness & Deployment

This phase adds safer production configuration checks and deployment guidance. It does not mean the app has been deployed or independently security-audited.

## Changes

- `HOST` is configurable for local use or hosting environments.
- Startup refuses unsafe production configuration, including the built-in development JWT secret or a localhost frontend origin.
- Health response includes uptime and database readiness.
- Shutdown handling ignores duplicate termination signals while the server is closing.
- Added this deployment checklist and release-verification plan.

## Local run

From the project root:

```powershell
npm install
npm test
npm run build
npm run dev
```

## Production configuration

Set these in the hosting provider's secret/configuration manager, not in frontend source:

- `NODE_ENV=production`
- `HOST=0.0.0.0` if required by the host
- `PORT` to the port supplied by the host
- `CLIENT_URL` to the exact deployed frontend origin
- `JWT_SECRET` to a unique random secret with at least 32 characters
- `DATABASE_PATH` to a persistent writable disk location
- `UPLOAD_DIRECTORY` to a persistent writable location, with backups and access controls
- SMTP variables only if email delivery is intentionally enabled

Do not commit `.env`, API keys, SMTP passwords, production database files, or uploaded student documents.

## Before launch checklist

1. Run `npm ci` in a clean checkout where a lockfile is available; otherwise use `npm install` and commit the generated lockfile.
2. Run backend tests and frontend production build; resolve all failures.
3. Verify login, logout, password reset, role access, enrollment, assignment publishing, submission, grading, result release, exports, and notifications with separate teacher/student/admin test accounts.
4. Verify unauthorized users cannot view other users' submissions, unreleased grades, exports, question papers, or admin routes.
5. Test database backup and restore using a copy of the database.
6. Confirm persistent storage for SQLite and uploaded files. Do not deploy SQLite to an ephemeral filesystem.
7. Configure HTTPS at the deployment edge and verify secure cookie behavior for the deployed origin.
8. Configure database/file backup retention, log retention, alerting, and a rollback plan.
9. Review rate limits, upload limits, CORS origin, allowed file types, and email provider credentials.
10. Send a test email only after SMTP configuration is verified.
11. Keep mock AI grading clearly identified as demo behavior; manually review AI-generated marks and feedback.
12. Run a final smoke test after deployment using non-sensitive test accounts and test data.

## Verification record

Record the following in the release ticket before launch:

- `npm test`: pass/fail and date
- `npm run build`: pass/fail and date
- Teacher/student/admin end-to-end tests: pass/fail
- Backup restore test: pass/fail
- Deployment URL and rollback revision

The automated checks in this repository are not a substitute for an end-to-end test or security review.
