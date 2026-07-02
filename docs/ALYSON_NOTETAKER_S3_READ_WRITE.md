# Alyson Notetaker S3 Read/Write Documentation

This document explains how S3 is used for:

- `Alyson Notetaker`
- `Meeting List`
- `Meeting Calendar`

It covers:

- where data is stored in S3
- how data is read from S3
- how data is written ("dumped") to S3
- which routes/server functions trigger each operation

---

## 1) S3 Buckets, Credentials, and Core Paths

## Required environment variables

These server-side modules depend on S3 env vars:

- `AWS_REGION` (or `S3_REGION`)
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_S3_BUCKET` (or `S3_BUCKET`)

Most notetaker S3 modules fail fast if these are missing.

## Primary S3 key layout

All notetaker assets are organized under `alyson-notetaker/`:

- `alyson-notetaker/transcripts/<prefix>/transcript.txt`
- `alyson-notetaker/meetingnotes/<prefix>/notes.md`
- `alyson-notetaker/meetingtasks/<prefix>/tasks.json`
- `alyson-notetaker/bot-index/<url-encoded-botId>.json`
- `alyson-notetaker/sessions/index.json`

Where `<prefix>` is generated as:

`<sanitized-meeting-title>_<YYYY-MM-DD>_<HH-MM-SS>` (UTC)

This prefix is the shared join key across transcript, notes, and tasks.

---

## 2) Data Model by S3 Object

## `transcript.txt`

- Plain text transcript lines in format like `Speaker: text`.
- Stored as `text/plain; charset=utf-8`.
- Metadata includes bot/session context.

## `notes.md`

- Markdown meeting notes generated from transcript (smart notes pipeline).
- Stored as `text/markdown; charset=utf-8`.

## `tasks.json`

- Per-person extracted tasks (from notes + transcript).
- Stored as JSON with:
  - `version`
  - `people[]`
  - `model`
  - `generatedAt`
  - `sourceHash`
  - `warnings[]`
- `sourceHash` is critical for cache validity against current notes/transcript content.

## `bot-index/<botId>.json`

Acts as the canonical per-bot pointer/index:

- bot metadata (`botId`, `title`, `prefix`)
- pointers to transcript/notes keys
- counts/hashes (`lineCount`, `wordCount`, `transcriptHash`, `notesHash`)
- cron stability fields (`cronLastHash`, `cronStablePasses`, etc.)

## `sessions/index.json`

Catalog snapshot of sessions for fast session list hydration.

---

## 3) Alyson Notetaker Module (`/alyson-notetaker`)

Primary route: `src/routes/alyson-notetaker/index.tsx`

### Read flow (from S3)

Session-level reads are resolved through:

- `src/lib/notetaker-sessions-history.server.ts`
- `src/lib/notetaker-sessions-s3.server.ts`
- `src/lib/notetaker-s3-calendar.server.ts`

Main behavior:

1. Load session list via notetaker APIs.
2. Merge with persisted S3 history/catalog (`sessions/index.json` + optional `bot-index` scan).
3. When live upstream session data is unavailable, load archive from S3 via bot index:
   - read `bot-index/<botId>.json`
   - read `transcript.txt`
   - read `notes.md` (if available)
4. Render persisted session as fallback payload.

### Write flow (dump to S3)

Writes are handled by:

- `src/lib/notetaker-persistence.server.ts`
- `src/lib/notetaker-auto-persist.server.ts`

Key write triggers:

- Manual "Persist" action in UI (`finalizeAndPersistNotetakerSession`)
- Auto-persist checkpoints while meeting is live
- Auto-persist at/after meeting end

What gets written:

1. `transcript.txt` (if changed hash)
2. `notes.md` (if generated and changed hash)
3. `bot-index/<botId>.json` (always updated as index-of-record)
4. `sessions/index.json` (best-effort catalog merge/update)

### Idempotency and duplicate prevention

Persistence logic compares content hashes:

- `transcriptHash`
- `notesHash`

If unchanged, write is skipped (`skippedDuplicate`/`unchanged` behavior).

---

## 4) Meeting List Module (`/alyson-notetaker/meeting-list`)

Primary route: `src/routes/alyson-notetaker/meeting-list.tsx`
Server fn gateway: `src/lib/notetaker-s3-calendar-functions.ts`

### Read flow (from S3)

The page fetches meetings by date range via:

- `listMeetingsFromS3Range` -> `listMeetingsFromS3`

`listMeetingsFromS3` performs S3 scans for:

- notes prefixes with `notes.md`
- transcript prefixes with `transcript.txt`
- task prefixes with `tasks.json`

It merges these prefix sets, filters by requested day range, enriches titles from:

- bot-index docs
- sessions index fallback

Then returns rows with:

- `prefix`, `botId`, `day`, `title`, `startedAt`
- key pointers (`notesKey`, `transcriptKey`, `tasksKey`)
- booleans (`hasNotes`, `hasTranscript`, `hasTasks`)

### Participant read flow

Meeting List then calls `getMeetingParticipantsBatch`:

- resolves transcript speakers + calendar attendees
- performs parallel S3 transcript reads where needed
- returns `participantsByPrefix`

### Tasks read/write flow in Meeting List context

Tasks are resolved through `getMeetingTasksFromS3` -> `resolveMeetingListTasks`:

1. Load `notes.md` and `transcript.txt` from S3.
2. Build `sourceHash`.
3. Try read existing `tasks.json` and validate matching `sourceHash`.
4. If valid, return S3 result (`fromS3: true`).
5. If missing/stale, run extraction model and then write `tasks.json` back to S3.

So Meeting List is both:

- S3 reader for existing tasks
- S3 writer when generating or refreshing tasks

---

## 5) Meeting Calendar Module (`/alyson-notetaker/calendar`)

Primary route: `src/routes/alyson-notetaker/calendar.tsx`
Server fn gateway: `src/lib/notetaker-s3-calendar-functions.ts`

### Calendar read flow

Calendar month view calls:

- `listMeetingsFromS3Range`

Same backend source as Meeting List:

- scans S3 for transcripts/notes/tasks
- builds per-day meeting rows

### Document popup reads

When user opens a meeting item:

- Notes tab -> `getMeetingNotesMdFromS3` (reads `notes.md`)
- Transcript tab -> `getMeetingTranscriptTextFromS3` (reads `transcript.txt`)
- Tasks tab -> `getMeetingTasksFromS3` (reads/possibly regenerates `tasks.json`)

### Notes generation/backfill writes

Calendar supports "generate notes if missing":

- `ensureMeetingNotesInS3Fn`
  - tries bot-based generation path
  - falls back to prefix-based generation if needed
  - writes `notes.md` to S3
  - updates bot-index notes pointer/hash when possible

Coverage and backfill:

- `auditNotetakerNotesCoverage` -> read-only S3 audit
- `backfillMissingNotetakerNotes` -> bulk write missing `notes.md`

### Tasks backfill writes

Admin-only flows:

- `auditMeetingTasksCoverage` (read-only)
- `backfillAllMeetingTasks` (writes missing `tasks.json`)

These require Clerk server verification (`requireMeetingTasksBackfillAdmin`).

---

## 6) End-to-End Lifecycle (Typical Meeting)

1. Bot session starts (live notetaker path).
2. Transcript lines are checkpointed to S3 (`transcript.txt`) during/after call.
3. At end (or via repair path), notes are generated and written (`notes.md`).
4. When notes+transcript are ready, tasks may be generated and written (`tasks.json`).
5. `bot-index/<botId>.json` remains the authoritative pointer for the meeting.
6. `sessions/index.json` is updated for fast persisted session listings.
7. Meeting List and Meeting Calendar discover meetings by scanning S3 assets and merging by `<prefix>`.

---

## 7) Caching Behavior

Several caches reduce repeated S3 scans:

- Bot-index cache in `notetaker-s3-calendar.server.ts` (5 min)
- Session index cache in `notetaker-sessions-history.server.ts` (20 sec)
- In-memory tasks cache in `notetaker-meeting-list-tasks.server.ts` (30 min)

Invalidation hooks:

- `invalidateNotetakerCalendarS3Cache()` after writes that change calendar/list visibility
- `invalidatePersistedSessionsS3Cache()` after session index updates

---

## 8) Failure/Recovery Paths

## Missing notes

- If transcript exists but `notes.md` missing:
  - generate notes from transcript and write to S3
  - fallback from bot-id path to prefix path if index is incomplete

## Missing tasks

- If notes+transcript exist but `tasks.json` missing:
  - generate tasks and persist to S3
  - admin backfill can bulk repair historical gaps

## Upstream TTL/Recall expiry

- S3 archived payload (transcript/notes + bot-index + sessions index) allows loading historical meetings even when upstream no longer returns live session metadata.

---

## 9) Quick File Map (Where Logic Lives)

- S3 listing/read/write primitives for calendar/list/tasks:
  - `src/lib/notetaker-s3-calendar.server.ts`
- Route-facing server functions:
  - `src/lib/notetaker-s3-calendar-functions.ts`
- Persist transcript/notes and bot-index:
  - `src/lib/notetaker-persistence.server.ts`
- Auto-persist orchestration and notes repair:
  - `src/lib/notetaker-auto-persist.server.ts`
- Tasks extraction + S3 persist:
  - `src/lib/notetaker-meeting-list-tasks.server.ts`
- Session history merge/fallback:
  - `src/lib/notetaker-sessions-history.server.ts`
- Sessions catalog object:
  - `src/lib/notetaker-sessions-s3.server.ts`
- UI modules:
  - `src/routes/alyson-notetaker/index.tsx`
  - `src/routes/alyson-notetaker/meeting-list.tsx`
  - `src/routes/alyson-notetaker/calendar.tsx`

---

## 10) Summary

- `Alyson Notetaker` writes transcripts/notes/indexes to S3 and can recover from S3 when upstream data is missing.
- `Meeting List` is primarily an S3-driven index view of meetings and participants, and can generate/write tasks.
- `Meeting Calendar` is an S3-driven day/month explorer that reads notes/transcripts/tasks and supports notes/tasks backfill into S3.

The shared contract across all three modules is the stable meeting `prefix` and the `bot-index` pointer document.

