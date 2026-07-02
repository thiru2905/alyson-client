# Meeting Calendar Module Documentation

## Purpose

Meeting Calendar (`/alyson-notetaker/calendar`) displays a **month grid** of S3-persisted meetings with popup tabs for notes, transcript, and tasks. Supports notes/tasks coverage audit and backfill.

## Route

- **File:** `src/routes/alyson-notetaker/calendar.tsx`

## Search Params (deep links)

```ts
{ day?: "YYYY-MM-DD", transcriptKey?: string, open?: "transcript"|"notes"|"tasks" }
```

## Server Functions

| Function | Purpose |
|----------|---------|
| `listMeetingsFromS3Range` | Month rows |
| `getMeetingNotesMdFromS3` | Read notes.md |
| `getMeetingTranscriptTextFromS3` | Read transcript.txt |
| `getMeetingTasksFromS3` | Read/generate tasks.json |
| `ensureMeetingNotesInS3Fn` | Generate missing notes |
| `auditNotetakerNotesCoverage` | Gap audit (read-only) |
| `backfillMissingNotetakerNotes` | Bulk notes backfill |
| `auditMeetingTasksCoverage` | Tasks gap audit (admin) |
| `backfillAllMeetingTasks` | Bulk tasks backfill (admin) |

## Key Behaviors

- Day cell click → popup with Notes / Transcript / Tasks tabs
- Admin backfill buttons for missing notes and tasks
- Shared `MeetingTasksPanel` component

## S3

Same prefix contract as Meeting List. See [ALYSON_NOTETAKER_S3_READ_WRITE.md](./ALYSON_NOTETAKER_S3_READ_WRITE.md).

## External APIs

- Groq for notes generation and task extraction

## File Map

| File | Role |
|------|------|
| `src/routes/alyson-notetaker/calendar.tsx` | Page |
| `src/lib/notetaker-s3-calendar-functions.ts` | Server API |
| `src/components/MeetingTasksPanel.tsx` | Tasks UI |
