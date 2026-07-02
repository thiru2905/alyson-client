# Meeting List Module Documentation

## Purpose

Meeting List (`/alyson-notetaker/meeting-list`) shows a **month-scoped table** of S3-persisted meetings with participants, notes, transcript, and tasks drill-down.

## Route

- **File:** `src/routes/alyson-notetaker/meeting-list.tsx`
- **Component:** `MeetingListView.tsx`

## Server Functions

| Function | Purpose |
|----------|---------|
| `listMeetingsFromS3Range` | Month meeting rows from S3 scan |
| `getMeetingParticipantsBatch` | Attendees + speaker resolution |
| `getMeetingTasksFromS3` | Read or generate `tasks.json` |

Gateway: `notetaker-s3-calendar-functions.ts` → `notetaker-s3-calendar.server.ts`

## Data Flow

```
listMeetingsFromS3Range
  → scan meetingnotes/, transcripts/, meetingtasks/, bot-index/
  → merge by <prefix>

getMeetingParticipantsBatch
  → unified meetings attendees by recallBotId
  → resolveMeetingParticipants + parallel transcript reads
```

## S3 Keys

- Read: `transcripts/`, `meetingnotes/`, `meetingtasks/`, `bot-index/`
- Write: `meetingtasks/<prefix>/tasks.json` on demand

## Caching

- Participants: `meeting-list-participants-cache.ts` (localStorage, 30 min)
- React Query: `notetaker-meeting-list`, `notetaker-meeting-list-participants`

## Admin

- `MeetingTasksBackfillButton` → `backfillAllMeetingTasks` (Clerk admin)

## Related

- [ALYSON_NOTETAKER_S3_READ_WRITE.md](./ALYSON_NOTETAKER_S3_READ_WRITE.md) — detailed read/write flows

## File Map

| File | Role |
|------|------|
| `src/routes/alyson-notetaker/meeting-list.tsx` | Route |
| `src/components/MeetingListView.tsx` | UI |
| `src/lib/notetaker-meeting-list-tasks.server.ts` | Task generation |
