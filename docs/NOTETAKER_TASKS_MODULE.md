# Notetaker Tasks Module Documentation

## Purpose

Notetaker Tasks (`/alyson-notetaker/tasks`) is a dedicated view for **meeting action items** extracted from transcripts/notes and stored in S3 as `tasks.json` per meeting prefix.

## Route

- **File:** `src/routes/alyson-notetaker/tasks.tsx`

## Server Functions

| Function | Purpose |
|----------|---------|
| `listMeetingsWithTasksFromS3` | Meetings that have or can have tasks |
| `getMeetingTasksFromS3` | Read or LLM-generate tasks |
| `ensureMeetingTasksInS3` | Persist generated tasks |
| `backfillAllMeetingTasks` | Admin bulk backfill |

Implementation: `notetaker-meeting-list-tasks.server.ts`, `notetaker-s3-calendar.server.ts`

## S3 Storage

```
meetingtasks/<prefix>/tasks.json
```

Schema: array of `{ id, title, assignee?, dueDate?, status?, source? }`

## Generation Flow

1. Load transcript + notes from S3
2. Groq prompt extracts actionable items
3. Write `tasks.json` under meeting prefix
4. Hooked after notes persist on session end (see notetaker persistence)

## UI

- Filterable task list across meetings
- Per-meeting drill-down via `MeetingTasksPanel`
- Shared with Meeting List and Calendar popups

## Access

All authenticated roles; backfill requires Clerk admin

## Related

- [MEETING_LIST_MODULE.md](./MEETING_LIST_MODULE.md)
- [MEETING_CALENDAR_MODULE.md](./MEETING_CALENDAR_MODULE.md)
- [ALYSON_NOTETAKER_S3_READ_WRITE.md](./ALYSON_NOTETAKER_S3_READ_WRITE.md)

## File Map

| File | Role |
|------|------|
| `src/routes/alyson-notetaker/tasks.tsx` | Page |
| `src/lib/notetaker-meeting-list-tasks.server.ts` | Task CRUD + LLM |
| `src/components/MeetingTasksPanel.tsx` | Shared UI |
