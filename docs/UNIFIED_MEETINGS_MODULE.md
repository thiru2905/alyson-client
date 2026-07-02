# Unified Meetings Module Documentation

## Purpose

Unified Meetings (`/alyson-notetaker/unified-meetings`) is the **admin console** for the unified meeting pipeline: scheduled state, attendee resolution, bot scheduling, and reconciliation between Google Calendar, Recall, and S3.

## Route

- **File:** `src/routes/alyson-notetaker/unified-meetings.tsx`

## Server Functions

| Function | Purpose |
|----------|---------|
| `listUnifiedMeetings` | Paginated scheduled state |
| `getUnifiedMeetingDetail` | Single meeting + attendees |
| `scheduleUnifiedMeetingBot` | Dispatch Recall bot |
| `rescheduleUnifiedMeetingBot` | Update bot schedule |
| `cancelUnifiedMeetingBot` | Cancel bot |
| `syncUnifiedMeetingsFromCalendar` | Pull calendar → state |
| `reconcileUnifiedMeetings` | Fix drift vs Recall/S3 |

Implementation spread across `unified-meetings*.server.ts` files.

## Data Model

- Supabase `unified_meetings` (or equivalent scheduled state table)
- Fields: meeting URL, start/end, calendar user, recall bot ID, status, attendees JSON

## Key Behaviors

- Filter by date range, status, calendar user
- Inline bot actions (schedule / reschedule / cancel)
- Manual sync + reconcile triggers
- Used as attendee source for Meeting List participant resolution

## Access

Typically admin / ops roles (Clerk-verified server functions)

## Related

- [BOT_JOIN_REPORT_MODULE.md](./BOT_JOIN_REPORT_MODULE.md) — uses same scheduled state
- [MEETING_LIST_MODULE.md](./MEETING_LIST_MODULE.md) — participant batch lookup

## File Map

| File | Role |
|------|------|
| `src/routes/alyson-notetaker/unified-meetings.tsx` | Page |
| `src/lib/unified-meetings-functions.ts` | Server API |
| `src/lib/unified-meetings-scheduled-state.server.ts` | State CRUD |
