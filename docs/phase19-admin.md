# Phase 19 — Admin Dashboard & Platform Management

## Included

- Admin-only overview metrics for users, classes, assignments, submissions, and 30-day email delivery status.
- Search/filter/paginate user list.
- Enable/disable teacher and student accounts. Disabling increments `token_version`, invalidating existing sessions.
- Admins cannot disable themselves or other admin accounts through this screen.
- Audit log and email delivery log views.
- Server-side `requireAuth` + `requireRole('admin')` protection on every admin endpoint.
- Admin console at `/admin/dashboard`. Public signup still cannot create an administrator.

## Create the first administrator

From the project root, set environment variables in the current PowerShell session and run the one-time script:

```powershell
$env:ADMIN_NAME = 'Platform Administrator'
$env:ADMIN_EMAIL = 'admin@example.com'
$env:ADMIN_PASSWORD = 'use-a-unique-password-at-least-14-characters'
npm run admin:create --workspace server
Remove-Item Env:ADMIN_NAME, Env:ADMIN_EMAIL, Env:ADMIN_PASSWORD
```

Use a unique, strong password. Do not commit credentials to `.env`, source code, or version control. Log in via `/login`; successful admin login redirects to `/admin/dashboard`.

## Endpoints

- `GET /api/admin/overview` — summary metrics and recent audit events
- `GET /api/admin/users?q=&role=&status=&limit=&offset=` — filtered account list
- `PATCH /api/admin/users/:id/status` — set a teacher/student to `active` or `disabled`
- `GET /api/admin/audit-logs?limit=` — recent audit events
- `GET /api/admin/email-deliveries?limit=` — recent email delivery logs

All endpoints require an active administrator session. Sensitive password hashes and tokens are never returned. Email delivery logs may include recipient addresses and provider errors; limit access to trusted admins.

## Verification

Run `npm test` from the project root and `npm run build`. A successful syntax check alone does not replace browser-based authorization and workflow testing.
