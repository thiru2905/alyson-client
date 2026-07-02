# Alyson Notetaker Module Documentation

## Purpose

The main Notetaker page (`/alyson-notetaker`) provides **live bot control**: create Recall bots, list sessions, stream live transcripts (SSE), generate smart notes, persist to S3, and chat over meeting context.

## Route

- **Layout:** `src/routes/alyson-notetaker/route.tsx`
- **Index:** `src/routes/alyson-notetaker/index.tsx`

## Server Functions

| Function | Purpose |
|----------|---------|
| `listNotetakerSessions` | Merged session list |
| `createNotetakerRecallBot` | Dispatch bot via Notetaker upstream |
| `getNotetakerSession` | Session + S3 merge + auto-persist |
| `loadNotetakerSessionArchive` | S3-only archive load |
| `getNotetakerLiveDiagnostics` | Live pipeline diagnostics |
| `finalizeAndPersistNotetakerSession` | Force persist ended meeting |
| `syncNotetakerSessionsIndexToS3` | Write `sessions/index.json` |
| `deleteNotetakerSessionFromS3` | Remove S3 artifacts |
| `generateSmartMeetingNotes` | LLM notes from transcript |

## Session List Sources (`notetaker-sessions-list.server.ts`)

1. Notetaker upstream `GET /api/sessions`
2. S3 bot-index + sessions index
3. Unified scheduled state

Override: `NOTETAKER_SESSIONS_SOURCE=s3` skips upstream.

## Live Transcript

- Browser SSE → `{NOTETAKER_BASE}/session/{botId}/events`
- Server polls upstream every 10s
- On ended meetings: checkpoint transcript → S3, generate notes, update bot-index

## External APIs

| API | Usage |
|-----|-------|
| Alyson Notetaker service | Sessions, create-bot, SSE |
| Recall.ai (via Notetaker) | Bot join/recording |
| Groq | Smart notes + session chat |

## S3 Writes

- `transcripts/<prefix>/transcript.txt`
- `meetingnotes/<prefix>/notes.md`
- `bot-index/<botId>.json`
- `sessions/index.json`

## Access

All authenticated roles (Ops nav)

## Related Docs

- [ALYSON_NOTETAKER_S3_READ_WRITE.md](./ALYSON_NOTETAKER_S3_READ_WRITE.md) — full S3 contract
- Child modules: Meeting List, Calendar, Analytics, etc. (see [index](./ALYSON_HR_MODULES_INDEX.md))

## File Map

| File | Role |
|------|------|
| `src/lib/alyson-notetaker-functions.ts` | Core server fns |
| `src/lib/notetaker-get-session-functions.ts` | Session load |
| `src/lib/notetaker-persistence.server.ts` | S3 persist |
| `src/lib/notetaker-upstream.server.ts` | HTTP client |
