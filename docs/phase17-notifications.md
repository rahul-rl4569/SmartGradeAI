# Phase 17 — Due-date reminders and notification preferences

## Included

- Persistent per-user preferences for in-app notifications, due-date reminders, and 24-hour / 1-hour reminder windows.
- Authenticated GET/PUT `/api/notifications/preferences` endpoints.
- Server-side reminder scan every five minutes for published assignments with due dates.
- Reminders are sent to enrolled students who have not submitted yet.
- A unique dispatch record prevents duplicate reminders for the same assignment, student, and reminder window, including after server restarts.
- Notification dropdown contains preference toggles.

## Behavior and limitations

- Reminders are in-app only; no email, SMS, browser push, or external scheduler is configured.
- The 24-hour reminder window is between 23 and 24 hours before due time; the 1-hour window is between 0 and 1 hour before due time. The five-minute scheduler may run slightly after a window opens.
- Notifications are generated only while the API process is running.
- Existing users default to all preferences enabled.
- A student who has already submitted is excluded from reminders.
