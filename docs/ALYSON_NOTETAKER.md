# Alyson Notetaker — Detailed Technical Guide

How Alyson Notetaker works end-to-end: live bots, SSE, S3, webhooks, Unified Meetings, crons, and every related HTTP API.

Full HR platform docs: [alysonHR.md](./alysonHR.md). S3 contract deep-dive: [ALYSON_NOTETAKER_S3_READ_WRITE.md](./ALYSON_NOTETAKER_S3_READ_WRITE.md).

---

## Table of contents

1. [Overview](#1-overview)
2. [Route map](#2-route-map)
3. [Access model](#3-access-model)
4. [Live bot create flow](#4-live-bot-create-flow)
5. [Live session poll + SSE](#5-live-session-poll--sse)
6. [S3 layout and persist pipeline](#6-s3-layout-and-persist-pipeline)
7. [Transcript cron hub](#7-transcript-cron-hub)
8. [Recall webhooks](#8-recall-webhooks)
9. [Unified Meetings + Recall Calendar V2](#9-unified-meetings--recall-calendar-v2)
10. [HTTP API catalog](#10-http-api-catalog)
11. [Meeting Hours](#11-meeting-hours)
12. [Bot Join Report + Recall Calendar page](#12-bot-join-report--recall-calendar-page)
13. [Analytics](#13-analytics)
14. [Cost Tracking](#14-cost-tracking)
15. [Tasks](#15-tasks)
16. [Notes email](#16-notes-email)
17. [Knowledge Graph](#17-knowledge-graph)
18. [Environment reference](#18-environment-reference)
19. [Key file index](#19-key-file-index)
20. [Operational constraints](#20-operational-constraints)

---

## 1. Overview

Alyson Notetaker is the meeting-intelligence slice of Alyson HR. It:

1. Joins Zoom / Google Meet / Teams via **Recall.ai** bots
2. Streams / checkpoints **transcripts**
3. Writes durable artifacts to **S3** (transcript, notes, tasks, bot-index)
4. Schedules bots from **Google Calendar** (DWD + Recall Calendar V2)
5. Surfaces history, analytics, ops reports, and an optional **Neo4j** knowledge graph

```text
Browser (Alyson HR)
  │
  ├─ Create bot ──► TanStack server fn
  │                    ├─ PRIMARY: POST Recall /api/v1/bot/
  │                    ├─ link ──► Notetaker :3003 /api/register-bot
  │                    └─ FALLBACK: POST Notetaker /api/create-bot
  │
  ├─ Live lines ──► EventSource ──► Notetaker /session/{botId}/events  (direct, not proxied)
  │
  ├─ Poll session ──► getNotetakerSession ──► Notetaker /api/session/{botId} + S3 merge
  │
  ├─ History / analytics ──► S3 bot-index + transcripts/notes/tasks
  │
  ├─ Unified Meetings ──► Google DWD + schedule/unschedule APIs + Recall Calendar OAuth
  │
  └─ Crons ──► persist, notes, tasks, integrity, bot activation, calendar sync, KG
```

| System | Role |
|--------|------|
| Alyson HR (`alyson-client`) | UI + server fns + `/api/*` crons/webhooks |
| Notetaker service (`ALYSON_NOTETAKER_BASE_URL`, default `:3003`) | Session catalog, SSE, notes endpoint, webhook ingest |
| Recall.ai | Bots, recording/transcript streaming, Calendar V2, billing |
| AWS S3 | Durable meeting artifacts |
| Google Workspace DWD | Company calendar scan, meeting hours, bot-join eligibility |
| Groq / DeepSeek | Notes, tasks, insights, KG extract |
| Neo4j (optional) | Knowledge graph |
| SES | Manual notes email + meeting-hours report |

---

## 2. Route map

| Page | Route | Sidebar | Purpose |
|------|-------|---------|---------|
| Live | `/alyson-notetaker` | Yes | Create bot + live transcript |
| Meeting Hours | `/alyson-notetaker/meeting-hours` | Yes | Google Calendar hours (Super-access) |
| Meeting List | `/alyson-notetaker/meeting-list` | Yes | Month list of S3 meetings + tasks |
| Meeting Calendar | `/alyson-notetaker/calendar` | Yes | Month grid of S3 meetings |
| Recall Calendar | `/alyson-notetaker/recall-calendar` | Yes | Bot attendance (joined/missed) |
| Analytics | `/alyson-notetaker/analytics` | Yes | Speaker analytics over transcripts |
| Bot Join Report | `/alyson-notetaker/bot-join-report` | Yes | Join-rate ops report |
| Unified Meetings | `/alyson-notetaker/unified-meetings` | Yes | Schedule bots for company calendar |
| Unified (alias) | `/alyson-notetaker/analytics/unified-meetings` | — | Same Unified Meetings UI |
| Tasks (legacy) | `/alyson-notetaker/tasks` | Hidden | Old Groq assignee rollup |
| Cost Tracking | `/alyson-notetaker/cost-tracking` | Linked | Recall $ usage |
| Knowledge Graph | `/alyson-notetaker/knowledge-graph` | Direct URL | Neo4j explore |
| Notes | `/alyson-notetaker/notes?notesKey=` | Deep-link | Full-page notes |
| Transcript | `/alyson-notetaker/transcript?transcriptKey=` | Deep-link | Full-page transcript |

Nav: `src/components/AppShell.tsx` → Ops → Alyson Notetaker.

### Three “calendars” (do not mix them up)

| Name | What it is |
|------|------------|
| **Meeting Calendar** | Past meetings already in **S3** |
| **Unified Meetings** | Upcoming **Google** events + schedule/unschedule |
| **Recall Calendar page** | Bot **attendance** UI for `alysonclient@` |
| **Recall Calendar V2** | OAuth + Sync API under `/api/recall/calendar/*` (used by Unified Meetings) |

---

## 3. Access model

### Meeting visibility

Used by: live session list (poll), Meeting List, Calendar, Notes, Transcript, Analytics meeting picker.

| Viewer | Sees |
|--------|------|
| Full-access emails (`meeting-visibility-constants.ts`) | All meetings |
| Everyone else | Only meetings they were **invited to** (Google attendees) or **spoke in** (transcript speakers via roster / speaker-identity) |

Creating a bot is **not** visibility-gated.

### Super-access

**Meeting Hours** requires Super-access (`SuperAccessGate` + `requireSuperAccess` on the server fn).

### Recall Calendar allowlist

Connect / auto-schedule / webhook sync only for allowlisted emails.

Defaults always included (`recall-calendar-allowlist.server.ts`):

`alysonclient@`, `notetaker@`, `mohita@`, `thirumalai@`, `vinit@` **@cintara.ai**

Env `RECALL_CALENDAR_AUTO_SCHEDULE_EMAILS` **extends** that list (comma / semicolon / whitespace).

### Tasks backfill admin

`MEETING_TASKS_BACKFILL_ADMIN_EMAIL` — only that Clerk user can run meeting-tasks backfill.

---

## 4. Live bot create flow

### Entry

| Layer | Location |
|-------|----------|
| UI | `src/routes/alyson-notetaker/index.tsx` → `CreateBotForm` |
| Server fn | `createNotetakerRecallBot` in `src/lib/alyson-notetaker-functions.ts` |
| Dispatch | `dispatchBotWithLiveTranscripts` in `src/lib/notetaker-bot-dispatch.server.ts` |

### Input / output

**Input (Zod):**

```ts
{
  meeting_url: string;       // required — Zoom / Meet / Teams URL
  bot_name: string;          // required
  title?: string;
  avatar_jpeg_b64?: string;  // JPEG base64, no data: prefix; discarded if > ~180KB
}
```

**Response:**

```ts
{
  botId: string;
  creationSource: "notetaker_managed" | "direct_recall_fallback";
  joinAt: string;  // ISO — typically now + 20s
}
```

### Step-by-step

```text
1. UI submits CreateBotForm
2. createNotetakerRecallBot:
     joinAt = now + 20_000 ms
     strip oversized avatar
3. dispatchBotWithLiveTranscripts({ meetingUrl, botJoinAt, title, botName, avatar, metadata })
4. PRIMARY path — createViaRecallDirect:
     POST {RECALL_BASE_URL}/api/v1/bot/
       Authorization: Token {RECALL_API_KEY}
       body: meeting_url, bot_name, join_at, recording_config, metadata
5. linkBotToNotetakerSession:
     PATCH Recall recording config (ensure webhook)
     POST {notetakerBase}/api/register-bot
       { bot_id, botId, title, meeting_url, join_at, metadata }
     If register fails and join is not deferred:
       GET {notetakerBase}/api/session/{botId}  // wake
     registerScheduledBotInSessionsCatalog(...)
6. FALLBACK (only if Recall primary fails) — createViaNotetaker:
     POST {notetakerBase}/api/create-bot
       { meeting_url, bot_name, title, join_at, metadata, recording_config, optional avatar }
     catalog register only
7. Return botId + creationSource + joinAt to UI
```

**Important:** Recall is **always tried first** (retention / billing). Notetaker `/api/create-bot` is **fallback only**.

`creationSource` naming is historical:

| Value | Meaning |
|-------|---------|
| `direct_recall_fallback` | Preferred Recall-direct path **succeeded** |
| `notetaker_managed` | Fell back to Notetaker create-bot |

### Notetaker base URL resolution

Order in `notetakerBaseUrl()`:

1. `ALYSON_NOTETAKER_BASE_URL`
2. `VITE_ALYSON_NOTETAKER_BASE_URL`
3. `TEST_BOTV2_BASE_URL`
4. `VITE_TEST_BOTV2_BASE_URL`
5. `http://localhost:3003`

### Recording / transcript webhook config

From `recallBotRecordingConfig()` (`src/lib/recall/recall-bot-config.server.ts`):

| Setting | Default / source |
|---------|------------------|
| Retention | Timed, **48h** (`RECALL_RECORDING_RETENTION_HOURS`, max 168) |
| Transcript | `recallai_streaming`, language `TRANSCRIPT_LANGUAGE` or `en` |
| Realtime webhook events | `transcript.data`, `transcript.partial_data` |
| Waiting room leave | 1200s |
| No-one joined leave | 1200s |
| Everyone left leave | 2s |

**Transcript webhook URL resolution** (`resolveRecallTranscriptWebhookUrl`):

1. `RECALL_TRANSCRIPT_WEBHOOK_URL` if set
2. `{ALYSON_APP_BASE_URL|VERCEL_URL}/webhooks/recall`
3. `{PUBLIC_WEBHOOK_BASE_URL}/webhooks/recall` if host looks like Alyson client
4. Else `{notetakerBase}/webhooks/recall/transcript`

In production, Recall usually hits Alyson’s `/webhooks/recall`, which **proxies** to the Notetaker service (see [§8](#8-recall-webhooks)).

### Metadata stamped on create

Includes roughly:

- `source` — e.g. `manual_create`, `unified_meetings`, `recall_calendar_v2`
- `bot_join_offset_minutes`
- `scheduled_join_at`
- `transcript_webhook_url`
- optional `meeting_url`, `meeting_start_time`, `summary`

---

## 5. Live session poll + SSE

After create, the UI does **two parallel things**:

### A) SSE (live lines) — browser → Notetaker directly

```ts
const base = VITE_ALYSON_NOTETAKER_BASE_URL || VITE_TEST_BOTV2_BASE_URL || "http://localhost:3003";
const es = new EventSource(`${base}/session/${botId}/events`);
// message: { type: "line", line: NotetakerTranscriptLine }
```

**Not proxied through Alyson.** The browser must reach the Notetaker host. Keep `VITE_*` aligned with the running service (`npm run dev:ops` wires `:3003`).

### B) Poll session — TanStack server fn every ~10s

`getNotetakerSession` (`notetaker-get-session-functions.ts`):

**Input:** `{ botId, clerkToken, emailHint? }` (POST server fn)

**Steps:**

1. Meeting-visibility assert
2. `GET {notetakerBase}/api/session/{botId}` (timeout `NOTETAKER_UPSTREAM_TIMEOUT_MS`, default 8s)
3. Normalize → session, lines, participantCount, flags
4. If in-call with **empty lines**: best-effort `patchRecallBotRecordingConfig` (120s cooldown)
5. Merge longer transcript / notes from S3 archive if present
6. Local persist + `maybeCheckpointTranscriptToS3` when lines exist
7. If meeting ended + lines:
   - Pull notes from upstream `/api/session/{id}/notes` if missing
   - `autoPersistEndedMeetingToS3` → may set `autoPersistedToS3`
8. On upstream failure: try local datastore → S3 archive → throw with ops hint

**Line shape:**

```ts
{
  received_at: string;
  event: string;
  text?: string;
  participant?: { id?: string; name?: string } | null;
  initials?: string;
  clock?: string;
}
```

### Auto-persist while live / on end

| Flag | Default | Role |
|------|---------|------|
| `NOTETAKER_AUTO_PERSIST_S3` | on (`"false"` disables) | Master persist gate |
| `NOTETAKER_CHECKPOINT_MIN_MS` | 10s (clamp 3–60) | Live checkpoint throttle |
| `NOTETAKER_NOTES_IDLE_STABLE_MS` | **15 min** | Notes only after transcript idle |

While live: checkpoint transcript when hash changes.  
When ended: write transcript; generate notes only after idle ≥ 15m (or forced).  
**SES email is not sent from auto-persist** (see [§16](#16-notes-email)).

UI also exposes **Persist to S3** / **Sync Recall** buttons and toasts when `autoPersistedToS3` flips true.

---

## 6. S3 layout and persist pipeline

Bucket: `AWS_S3_BUCKET` or `S3_BUCKET`.

### Key formats

`prefix` = `{sanitized-title}_{YYYY-MM-DD}_{HH-MM-SS}` (UTC; title day `DDMMYYYY` preferred when it disagrees with `createdAt`).

| Asset | Key |
|-------|-----|
| Transcript | `alyson-notetaker/transcripts/{prefix}/transcript.txt` |
| Notes | `alyson-notetaker/meetingnotes/{prefix}/notes.md` |
| Tasks | `alyson-notetaker/meetingtasks/{prefix}/tasks.json` |
| Bot index | `alyson-notetaker/bot-index/{encodeURIComponent(botId)}.json` |
| Sessions list | `alyson-notetaker/sessions/index.json` |
| Unified scheduled | `alyson-notetaker/unified-scheduled/index.json` |
| Recall calendar connections | `alyson-notetaker/recall-calendar/connections.json` |

### Bot-index (canonical pointer)

Notable fields:

- `botId`, `title`, `prefix`, `meetingDay`
- `transcriptKey`, `notesKey`
- `transcriptHash`, `notesHash`, line/word counts
- `transcriptUnchangedSince`, `cronFinalizedAt`, `cronFinalized*`
- `recallCallEndedAt`, `finalizedAt`
- `recallMediaDeletedAt`
- `notesEmailSentAt`, recipients / messageId
- `kgSyncedAt`, `kgSynced*` hashes
- `supersededByBotId` (integrity repair)

### Write path (`persistMeetingToS3`)

1. Build prefix + object keys
2. Compute SHA-256 of transcript (+ notes if present)
3. **Skip** write if hashes unchanged vs bot-index
4. Put transcript / notes; always update bot-index
5. Best-effort `deleteRecallMediaAfterS3Persist` when transcript non-empty
6. Cost-allocation tags via `s3CostAllocationTagging("notetaker", …)`

### Read path

Meeting List / Calendar / Analytics use `listMeetingsFromS3Range` / bot-index scan (`notetaker-s3-calendar.server.ts`), then load transcript/notes/tasks by key. Visibility filter applied before returning to the client.

More detail: [ALYSON_NOTETAKER_S3_READ_WRITE.md](./ALYSON_NOTETAKER_S3_READ_WRITE.md).

---

## 7. Transcript cron hub

### Endpoint

| | |
|--|--|
| Path | `GET\|POST /api/cron/notetaker-transcripts` |
| File | `src/routes/api/cron/notetaker-transcripts.ts` |
| Runner | `runNotetakerTranscriptCron` in `notetaker-transcript-cron.server.ts` |
| Auth | Bearer `NOTETAKER_TRANSCRIPT_CRON_SECRET` or `CRON_SECRET` |
| Enable | `NOTETAKER_TRANSCRIPT_CRON_ENABLED` (default true) |
| Local | `npm run cron:notetaker-transcripts` |

Missing secret → **503** in production/Vercel; open locally for convenience.

### Ordered steps

```text
1. If disabled → early { ok, enabled: false }
2. activateDueScheduledBotSessions()
     Wake Notetaker for due Recall-deferred bots (~near join_at)
3. collectBotIds() = union of:
     - Notetaker GET /api/sessions
     - listAllUnifiedScheduledBotSessions()
     - listPersistedSessionsFromS3({ includeBotIndex: true })
4. Prefetch all bot-index docs
5. For each botId → driveSessionPersistToS3(botId, { bypassThrottle, skipRecallFetch if finalized }):
     written     → maybeAutoSendMeetingNotesEmail (notes gen only)
                 → maybeGenerateMeetingTasksWhenReady
     unchanged / skipped_complete → notes catch-up
     empty       → up to 8× backfillTranscriptFromRecall per cron run
6. Rebuild sessions list → mergeSessionsIndexToS3 → invalidate cache
7. runRecallMediaCleanup()
     Delete Recall media ≥ 2 days after S3 finalize markers
8. runUnifiedMeetingsBackgroundMaintenance()
     refreshUnifiedMeetings() + Recall calendar auto-sync for allowlisted connections
9. Optional leave-email sync (if leaveEmailSyncEnabled)
10. runNotetakerMeetingIntegrityCheck({ repair: true })
11. sweepAutoSendMeetingNotesEmails()  → currently no-op (auto SES disabled)
```

### Cron result shape

```ts
{
  ok: boolean;
  ranAt: string;
  enabled: boolean;
  scanned: number;
  written: number;
  notesWritten: number;
  skippedUnchanged: number;
  skippedFinalized: number;
  newlyFinalized: number;
  skippedEmpty: number;
  upstreamUnavailable: number;
  errors: number;
  warnings: string[];  // capped
  recallMediaCleanup?: { ... };
  scheduledBotActivation?: { scanned, activated, skipped, errors };
  meetingIntegrity?: { scanned, repaired, superseded, issueCount };
  notesAutoEmail?: { scanned, attempted, sent, skipped, errors };
}
```

### Stability / finalize

- Cron may require **N identical hashes** before marking finalized (`NOTETAKER_CRON_STABLE_PASSES_REQUIRED`, default **2**)
- Notes generation waits until transcript idle ≥ `NOTETAKER_NOTES_IDLE_STABLE_MS` (default **15 minutes**)
- Integrity cron (same Bearer): `GET|POST /api/cron/notetaker-meeting-integrity?repair=`  
  Repairs wrong folder days, supersedes duplicate bots

### Related crons

| Path | Auth | Does |
|------|------|------|
| `/api/cron/scheduled-bot-activation` | Daily-report secret | Only bot wake (also step 2 of hub) |
| `/api/cron/recall-calendar-sync` | Daily-report secret | Unified background maintenance only |
| `/api/cron/meeting-hours-report` | Hours / cron secret | SES hours email |
| `/api/cron/knowledge-graph-sync` | Transcript cron secret | Neo4j batch |

---

## 8. Recall webhooks

### A) Transcript proxy — `POST /webhooks/recall`

**File:** `src/routes/webhooks/recall.ts`

| | |
|--|--|
| Auth | None in Alyson — forwards Svix / `webhook-*` / `Authorization` headers as-is |
| Body | Raw text |
| Forwards to | `{notetakerBaseUrl()}/webhooks/recall/transcript` |
| Response | Upstream status/body, or **502** on network error |

**Why it exists:** Recall’s public webhook URL points at the Alyson HR host; Alyson proxies into the Notetaker service so transcript streaming lands in the live session store.

```text
Recall.ai
  → POST https://{alyson-app}/webhooks/recall
    → POST {ALYSON_NOTETAKER_BASE_URL}/webhooks/recall/transcript
      → Notetaker session lines → SSE to browser
```

### B) Calendar V2 — `POST /api/recall/webhooks/calendar`

**File:** `src/routes/api/recall/webhooks/calendar.ts`

| | |
|--|--|
| Auth | `verifyRecallCalendarWebhook(rawBody, headers)` |
| Secret | `RECALL_CALENDAR_WEBHOOK_SECRET` or `RECALL_VERIFICATION_SECRET` |
| If no secret configured | Verification returns **true** (open — set a secret in prod) |
| Signature | Svix-style: `svix-id` / `svix-timestamp` / `svix-signature` (or `webhook-*` aliases). HMAC-SHA256 over `{msgId}.{timestamp}.{rawBody}` |

**Handled events:**

| Event | Behavior |
|-------|----------|
| `calendar.sync_events` | Allowlist check → `refreshUnifiedMeetings()` → `autoSyncRecallCalendarIfPending({ scheduleAll: true })` |
| `calendar.update` | If Recall calendar disconnected → mark S3 connection disconnected; else note |
| other | `{ action: "ignored" }` |

**Response:** `{ ok: true, result }` or 401 / 400 / 500.

---

## 9. Unified Meetings + Recall Calendar V2

Primary ops console: “will Alyson join this company calendar meeting?”

**UI:** `/alyson-notetaker/unified-meetings` (and analytics alias).

### 9.1 List company meetings (Google DWD)

```text
GET /api/analytics/unified-meetings?email&botStatus&hasMeetLink&shouldBotJoin&search
  → getUnifiedMeetings()
  → Domain-Wide Delegation scan of workspace calendars
  → Merge with S3 unified-scheduled bot state
  → ~60s cache
```

**Refresh:** `POST /api/analytics/unified-meetings/refresh` → `refreshUnifiedMeetings()` (force rescan).

**Meeting id:** `base64url(email::googleEventId)`.

No meeting-visibility filter on this list (full calendar dump for ops). Scheduling still respects Recall Calendar **allowlist** for OAuth/auto-sync paths.

### 9.2 Schedule / unschedule one meeting

| Action | Method | Path |
|--------|--------|------|
| Schedule | `POST` | `/api/analytics/unified-meetings/{meetingId}/schedule?redispatch=1` or `force=1` |
| Unschedule | `DELETE` or `POST` | `/api/analytics/unified-meetings/{meetingId}/unschedule` |

**Schedule (`scheduleUnifiedMeetingById` → `scheduleMeetingInternal`):**

1. Load Google event by meetingId
2. Compute `join_at` = meeting start − **2 minutes** (`BOT_JOIN_OFFSET_MS`)
3. Dedupe key `meetingUrl|startTime` against S3 `unified-scheduled/index.json`
4. `dispatchBotWithLiveTranscripts` with `metadata.source: "unified_meetings"`
5. Commit reservation to S3
6. Response: `{ ok, message, botId?, redispatched? }` (400 if not scheduled)

**Unschedule:**

1. Blocked if bot status is `joining` | `in_call` | `done`
2. `cancelScheduledRecallBot` (DELETE Recall bot)
3. Best-effort `removeBotFromRecallCalendarEvent`
4. Remove S3 scheduled row
5. `{ ok, message, botId? }`

### 9.3 Bulk company schedule — permanently disabled

```text
GET|POST /api/analytics/unified-meetings/schedule-bots
  → 410 Gone
  → { error: "Company-wide bot scheduling is disabled", hint: "..." }
```

Use per-row Schedule, or allowlisted Recall Calendar **Sync now**, or the background crons.

### 9.4 Recall Calendar V2 OAuth

| Step | Method | Path |
|------|--------|------|
| Start | `GET` | `/api/recall/calendar/connect?returnTo=` |
| Callback | `GET` | `/api/recall/calendar/callback?code&state` |
| Status | `GET` | `/api/recall/calendar/status` |
| Actions | `POST` | `/api/recall/calendar/status` |

**Connect flow:**

```text
1. startRecallCalendarConnect
     Signed OAuth state (HMAC with RECALL_API_KEY | CRON_SECRET | "dev")
2. Redirect to Google OAuth
     scopes: calendar.events.readonly + userinfo.email
     access_type=offline, prompt=consent
3. Callback exchanges code → refresh_token (required)
4. assertRecallCalendarEmailAllowed(email)
5. Create or reuse Recall Calendar V2 (/api/v2/calendars/)
6. Persist connection → S3 alyson-notetaker/recall-calendar/connections.json
7. Redirect to UI (Unified Meetings)
     Does NOT sync bots on connect (timeout avoidance)
     User must click Sync now
```

Redirect URI: `RECALL_CALENDAR_OAUTH_REDIRECT_URI` or `{origin}/api/recall/calendar/callback`.

**POST `/api/recall/calendar/status` body:**

```ts
{
  action: "bootstrap" | "sync" | "disconnect";
  calendarId?: string;
  eventIds?: string[];   // Smart schedule — currently returns 503 if present
  scheduleAll?: boolean;
  maxNewBots?: number;
}
```

| Action | Behavior |
|--------|----------|
| `bootstrap` | `registerRecallCalendarFromEnvIfNeeded` (needs `GOOGLE_OAUTH_REFRESH_TOKEN`) |
| `sync` + `eventIds` | **503** — Smart schedule temporarily disabled |
| `sync` + `calendarId` | `syncRecallCalendarNow` — UI Sync now sends `scheduleAll: true` |
| `disconnect` | Delete Recall calendar + remove S3 connection |

**Sync now (`scheduleAll: true`):**

1. List Recall calendar events (lookback/ahead window)
2. Filter upcoming + joinable + not already scheduled
3. Cap new bots (`MAX_NEW_BOTS_PER_SYNC` = **30** for auto; UI may pass `maxNewBots`)
4. Per event: remove Recall-native calendar bots → `dispatchBotWithLiveTranscripts` (`source: "recall_calendar_v2"`) → commit unified-scheduled reservation

### 9.5 Background maintenance

`runUnifiedMeetingsBackgroundMaintenance`:

1. `refreshUnifiedMeetings()` — DWD rescan
2. For each allowlisted connected calendar → `autoSyncRecallCalendarIfPending({ scheduleAll: true })`

Triggered by:

- Transcript cron hub (step 8)
- `/api/cron/recall-calendar-sync`
- Calendar webhook `calendar.sync_events`

UI may also auto-sync on page load when `upcoming − scheduled > 0` (`VITE_RECALL_CALENDAR_AUTO_SYNC`, ~90s cooldown).

### 9.6 Google DWD prerequisites

| Variable | Purpose |
|----------|---------|
| `GOOGLE_DWD_SERVICE_ACCOUNT_JSON` or `GOOGLE_APPLICATION_CREDENTIALS` | Service account |
| `GOOGLE_WORKSPACE_DOMAIN` | e.g. `cintara.ai` |
| `GOOGLE_WORKSPACE_ADMIN_SUBJECT_EMAIL` | Impersonation subject |
| Scopes | `admin.directory.user.readonly`, `calendar.events.readonly` |

---

## 10. HTTP API catalog

### Analytics

| Method | Path | Auth | Query / body | Does | Response |
|--------|------|------|--------------|------|----------|
| `GET` | `/api/analytics/unified-meetings` | None in route | filters | List + summary | `{ meetings, summary }` |
| `POST` | `/api/analytics/unified-meetings/refresh` | None | — | Force DWD scan | scan summary |
| `POST` | `/api/analytics/unified-meetings/:id/schedule` | None | `?redispatch=1` | Schedule one | `{ ok, message, botId? }` 200/400 |
| `DELETE`/`POST` | `/api/analytics/unified-meetings/:id/unschedule` | None | — | Cancel | `{ ok, message, botId? }` |
| `GET`/`POST` | `/api/analytics/unified-meetings/schedule-bots` | n/a | — | Disabled | **410** |
| `GET` | `/api/analytics/recall-cost` | None | **required** `start`, `end` (YYYY-MM-DD) | Cost report | `{ report }` |

### Recall

| Method | Path | Auth | Does |
|--------|------|------|------|
| `GET` | `/api/recall/calendar/connect` | — | 302 Google OAuth |
| `GET` | `/api/recall/calendar/callback` | OAuth state | Complete connect, 302 UI |
| `GET` | `/api/recall/calendar/status` | — | Connections + pending + webhook URL |
| `POST` | `/api/recall/calendar/status` | — | bootstrap / sync / disconnect |
| `POST` | `/api/recall/webhooks/calendar` | Svix (optional secret) | Calendar sync/update events |
| `POST` | `/webhooks/recall` | Forwarded headers | Proxy transcript webhook → Notetaker |

### Crons

| Method | Path | Auth | Enable | Does |
|--------|------|------|--------|------|
| `GET`/`POST` | `/api/cron/notetaker-transcripts` | Transcript secret | `NOTETAKER_TRANSCRIPT_CRON_ENABLED` | Hub §7 |
| `GET`/`POST` | `/api/cron/notetaker-meeting-integrity` | Transcript secret | — | Integrity; `?repair=` |
| `GET`/`POST` | `/api/cron/recall-calendar-sync` | Daily-report secret | always on helper | Unified background maintenance |
| `GET`/`POST` | `/api/cron/scheduled-bot-activation` | Daily-report secret | `SCHEDULED_BOT_ACTIVATION_CRON_ENABLED` | Wake due bots |
| `GET`/`POST` | `/api/cron/meeting-hours-report` | Hours / cron secret | `MEETING_HOURS_REPORT_ENABLED` | SES hours email |
| `GET`/`POST` | `/api/cron/knowledge-graph-sync` | Transcript secret | `KNOWLEDGE_GRAPH_ENABLED` | Neo4j sync |

**Daily-report secret:** `DAILY_REPORT_CRON_SECRET` or `CRON_SECRET`.

Most UI modules use TanStack `createServerFn` instead of REST; `/api/*` is for crons, webhooks, OAuth, and a few analytics consumers.

---

## 11. Meeting Hours

**Route:** `/alyson-notetaker/meeting-hours` · **Super-access only**

Not Recall hours. Per-employee meeting time from **Google Calendar DWD**.

```text
UI / cron
  → buildMeetingHoursReport
  → employee directory
  → for each user: listCalendarEventsForUser (DWD)
  → parseEligibleCalendarMeeting (skip OOO / focus / lunch / …)
  → aggregate hours in Asia/Kolkata
  → cache ~10 minutes
```

| Behavior | Detail |
|----------|--------|
| Presets | 7 / 30 / 60 days, last month(s), custom |
| Grid | Daily or ISO weekly |
| Email | SES via dialog or cron |
| Cron | `GET\|POST /api/cron/meeting-hours-report` |
| Recipients | `MEETING_HOURS_REPORT_RECIPIENTS` or Super-access emails |
| Range (cron) | `MEETING_HOURS_REPORT_DAYS` (default 7, max 31) |

**Files:** `meeting-hours-functions.ts`, `meeting-hours-report.server.ts`, `meeting-calendar-read.server.ts`, `MeetingHoursEmailDialog.tsx`

≠ [Cost Tracking](#14-cost-tracking) (Recall billed bot/transcript hours).

---

## 12. Bot Join Report + Recall Calendar page

### Bot Join Report

**Route:** `/alyson-notetaker/bot-join-report`  
**Server fn:** `getBotJoinReport` (not REST)

Default calendar email: `alysonclient@cintara.ai`.

```text
buildBotJoinReport({ start, end, calendarEmail?, forceRefresh?, windowHours? })
  → Google DWD eligible meetings for report user
  → Recall bot lifecycles (recall-bot-status.server.ts)
  → unified-scheduled S3 + bot-index + live sessions + Recall Calendar V2 events
  → outcomes: joined / missed / waiting room / late / failed
  → charts + PDF
```

Periods: 7 / 15 / 30 / 60 days or last 24h (`windowHours=24`).

### Recall Calendar page (attendance)

**Route:** `/alyson-notetaker/recall-calendar`

Same data pipeline as Bot Join Report, month-grid UX:

- Views: Daily / Weekly / Notetaker
- Day colors: joined / missed / partial
- Marks: Present / Late (>2 min) / Waiting / Absent

**Not** the OAuth connect screen — that lives on Unified Meetings.

---

## 13. Analytics

**Route:** `/alyson-notetaker/analytics`

```text
listMeetingsFromS3Range (visibility-filtered)
  → user picks meetings / speakers / date range
  → buildNotetakerAnalyticsReport
       parse transcripts, speaker-identity merge, rollups
  → optional getNotetakerAnalyticsInsights (Groq)
  → charts + HTML / print / PDF export
```

Presets: 7 / 15 / 30 / 45 / 60 / 90 days or custom ≤ 365. Session restore in localStorage.

**Files:** `notetaker-analytics-functions.ts`, `notetaker-analytics.server.ts`, `notetaker-analytics-insights.server.ts`, `speaker-identity.ts`

---

## 14. Cost Tracking

**Route:** `/alyson-notetaker/cost-tracking` (linked from Hours / Calendar / Analytics)  
**REST:** `GET /api/analytics/recall-cost?start=YYYY-MM-DD&end=YYYY-MM-DD`

```text
buildRecallCostReport
  → Recall GET /api/v1/billing/usage/  (bot_total seconds)
  → cost = bot_hours × RECALL_BOT_HOUR_USD (default 0.50)
         + transcript_hours × RECALL_TRANSCRIPT_HOUR_USD (default 0.15)
  → meeting counts from S3
  → daily split ESTIMATED from period total × meeting density
  → cache ~1h (billing API ≤ 5 req/min)
```

Storage / DSDK extras are **not** included. Groq insights optional.

---

## 15. Tasks

### Current (Meeting List / Calendar)

```text
maybeGenerateMeetingTasksWhenReady(botId)
  → load transcript + notes from S3
  → DeepSeek extract per-person action items
  → write alyson-notetaker/meetingtasks/{prefix}/tasks.json
  → sourceHash cache (skip if notes/transcript unchanged)
```

UI: `MeetingTasksPanel`, generate/view from list/calendar. Admin backfill: `MeetingTasksBackfillButton` + `MEETING_TASKS_BACKFILL_ADMIN_EMAIL`.

### Legacy (hidden)

**Route:** `/alyson-notetaker/tasks` — sidebar commented out.

Groq assignee rollup across a date range. **Do not re-enable** without reconciling with `tasks.json`.

---

## 16. Notes email

### Manual (active)

```text
UI MeetingNotesEmailControl
  → previewMeetingNotesEmailFn / sendMeetingNotesEmailFn
  → sendMeetingNotesEmail
       recipients = cintara.ai participants + monitor thirumalai@cintara.ai
       load notes from override or S3
       SES send
  → recordMeetingNotesEmailSent on bot-index
       notesEmailSentAt, messageId, recipients
```

### Cron / auto SES (disabled)

Transcript cron calls `maybeAutoSendMeetingNotesEmail` after persist:

- **Still generates notes** after ≥ 15m transcript idle
- Returns `skipped: "auto_email_disabled"`, `sent: false`
- `sweepAutoSendMeetingNotesEmails` is a no-op

Reason: avoid duplicate SES races. Send from the UI after reviewing notes.

### Notes generation (shared)

- Live / UI: Groq then DeepSeek (`runSmartMeetingNotes` / `generateSmartMeetingNotes`)
- Cron: same idle gate (`isTranscriptIdleStable`)
- Deep-link page: `/alyson-notetaker/notes?notesKey=…` → `MeetingDocPage` → generate-if-missing

---

## 17. Knowledge Graph

**Route:** `/alyson-notetaker/knowledge-graph`  
**Off by default:** `KNOWLEDGE_GRAPH_ENABLED=true`

```text
Cron GET|POST /api/cron/knowledge-graph-sync
  (Bearer = transcript cron secret)
  → runKnowledgeGraphMeetingSync
  → ensure Neo4j schema
  → list bot-index docs
  → ready meetings: ended/finalized/has notes or transcript, not superseded
  → skip if kgSynced* hashes match
  → load notes/transcript from S3
  → mapMeetingToKnowledgeGraph (DeepSeek)
  → applyExtractedGraph (MERGE Person/Meeting/Project/Task/Topic + edges)
  → mark bot-index kgSyncedAt
```

| Cap | Default |
|-----|---------|
| Meetings per run | 25 (`KNOWLEDGE_GRAPH_MAX_MEETINGS_PER_RUN`, max 500) |
| Transcript chars | 12000 (`KNOWLEDGE_GRAPH_TRANSCRIPT_CHARS`) |

Local Neo4j: `docker/neo4j/docker-compose.yml`. Vercel cannot reach localhost — use Aura in production.

Runbook: [KNOWLEDGE_GRAPH.md](./KNOWLEDGE_GRAPH.md).

---

## 18. Environment reference

### Core

| Variable | Purpose |
|----------|---------|
| `ALYSON_NOTETAKER_BASE_URL` | Server → Notetaker API |
| `VITE_ALYSON_NOTETAKER_BASE_URL` | Browser SSE / client |
| `RECALL_API_KEY`, `RECALL_BASE_URL`, `RECALL_REGION` | Recall |
| `BOT_NAME` | Default bot display name |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | S3 |
| `AWS_S3_BUCKET` / `S3_BUCKET` | Notetaker artifacts |

### Webhooks / public URLs

| Variable | Purpose |
|----------|---------|
| `RECALL_TRANSCRIPT_WEBHOOK_URL` | Override transcript webhook |
| `ALYSON_APP_BASE_URL` / `VERCEL_URL` | Build `/webhooks/recall` |
| `PUBLIC_WEBHOOK_BASE_URL` | Alternate public host |
| `RECALL_CALENDAR_WEBHOOK_SECRET` / `RECALL_VERIFICATION_SECRET` | Calendar Svix |
| `RECALL_RECORDING_RETENTION_HOURS` | Timed retention (default 48) |
| `TRANSCRIPT_LANGUAGE` | Streaming transcript language |

### Google / Calendar V2

| Variable | Purpose |
|----------|---------|
| `GOOGLE_DWD_SERVICE_ACCOUNT_JSON` | DWD service account JSON |
| `GOOGLE_APPLICATION_CREDENTIALS` | Local SA file path |
| `GOOGLE_WORKSPACE_DOMAIN` | Workspace domain |
| `GOOGLE_WORKSPACE_ADMIN_SUBJECT_EMAIL` | Impersonation |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | Calendar connect |
| `RECALL_CALENDAR_OAUTH_REDIRECT_URI` | OAuth callback override |
| `RECALL_CALENDAR_AUTO_SCHEDULE_EMAILS` | Extra allowlist |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | Env bootstrap calendar |
| `VITE_RECALL_CALENDAR_AUTO_SYNC` | UI auto-sync on load |

### Cron / persist

| Variable | Purpose |
|----------|---------|
| `NOTETAKER_TRANSCRIPT_CRON_SECRET` / `CRON_SECRET` | Hub + integrity + KG |
| `NOTETAKER_TRANSCRIPT_CRON_ENABLED` | Hub switch |
| `NOTETAKER_AUTO_PERSIST_S3` | Persist gate |
| `NOTETAKER_NOTES_IDLE_STABLE_MS` | Notes idle (default 15m) |
| `NOTETAKER_CRON_STABLE_PASSES_REQUIRED` | Finalize stability (default 2) |
| `NOTETAKER_CHECKPOINT_MIN_MS` | Live checkpoint throttle |
| `NOTETAKER_UPSTREAM_TIMEOUT_MS` | Upstream HTTP timeout |
| `NOTETAKER_SESSION_RECALL_CHECK_MS` | Throttle Recall GETs |
| `DAILY_REPORT_CRON_SECRET` | Calendar sync + bot activation crons |
| `SCHEDULED_BOT_ACTIVATION_CRON_ENABLED` | Activation cron |
| `MEETING_HOURS_REPORT_ENABLED` / `_SECRET` / `_DAYS` / `_RECIPIENTS` | Hours email |

### AI / cost / KG

| Variable | Purpose |
|----------|---------|
| `GROQ_API_KEY` | Notes / insights |
| `DEEPSEEK_API_KEY` | Notes fallback, tasks, KG |
| `RECALL_BOT_HOUR_USD` | Cost (default 0.50) |
| `RECALL_TRANSCRIPT_HOUR_USD` | Cost (default 0.15) |
| `RECALL_BILLING_CACHE_MS` | Billing cache (default 1h) |
| `KNOWLEDGE_GRAPH_ENABLED` | KG master switch |
| `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD` | Neo4j |
| `KNOWLEDGE_GRAPH_MAX_MEETINGS_PER_RUN` | Sync batch size |
| `SES_FROM_EMAIL` / Resend vars | Outbound email |

Dev tip: `npm run dev:ops` sets notetaker URLs to `localhost:3003` but does **not** start that service.

---

## 19. Key file index

| Area | Files |
|------|-------|
| Live UI | `src/routes/alyson-notetaker/index.tsx`, `route.tsx` |
| Create / list | `alyson-notetaker-functions.ts`, `notetaker-bot-dispatch.server.ts` |
| Session poll | `notetaker-get-session-functions.ts`, `notetaker-upstream.server.ts`, `notetaker-auto-persist.server.ts` |
| Persist | `notetaker-persistence.server.ts`, `notetaker-session-persist-drive.server.ts` |
| Cron hub | `routes/api/cron/notetaker-transcripts.ts`, `notetaker-transcript-cron.server.ts` |
| Webhooks | `routes/webhooks/recall.ts`, `routes/api/recall/webhooks/calendar.ts` |
| Calendar V2 | `recall/recall-calendar-*.ts`, `google-calendar-oauth.server.ts`, `recall-calendar-allowlist.server.ts` |
| Unified | `unifiedMeetingsService.ts`, `unified-meetings-background.server.ts`, `unified-scheduled-s3.server.ts`, `meeting-bot-reserve.server.ts` |
| S3 calendar | `notetaker-s3-calendar.server.ts`, `notetaker-s3-calendar-functions.ts` |
| Tasks | `notetaker-meeting-list-tasks.server.ts`, `MeetingTasksPanel.tsx` |
| Notes email | `meeting-notes-email.server.ts`, `notetaker-meeting-notes-auto-email.server.ts` |
| Hours / cost / KG | `meeting-hours-*.ts`, `recall-cost-*.ts`, `knowledge-graph/*` |
| Bot join | `notetaker-bot-join-report.server.ts`, `recall/recall-bot-status.server.ts` |
| Visibility | `meeting-visibility.server.ts`, `meeting-visibility-constants.ts` |

---

## 20. Operational constraints

1. **Recall-first dispatch** — Notetaker `/api/create-bot` is fallback only.
2. **SSE is direct to Notetaker** — mis-set `VITE_ALYSON_NOTETAKER_BASE_URL` = empty live transcript.
3. **Bulk `schedule-bots` is 410** — use per-row schedule or allowlisted Sync now.
4. **Smart schedule by `eventIds` is 503** — waiting-room / transcript issues.
5. **Notes email is manual** — cron still generates notes after idle; SES auto-send is off.
6. **Meeting Hours ≠ Cost Tracking** — Google calendar time vs Recall billing $.
7. **Meeting Calendar ≠ Unified Meetings** — S3 history vs live Google + schedule.
8. **Two task systems** — only `tasks.json` (DeepSeek) is current.
9. **Knowledge graph off by default** — needs Neo4j + DeepSeek; local Docker ≠ Vercel.
10. **Calendar webhook with no secret is open** — set `RECALL_CALENDAR_WEBHOOK_SECRET` in prod.
11. **Media deleted ~2 days after S3 finalize** — rely on S3 as source of truth after that.
12. **Allowlist gates Calendar V2 auto-schedule** — random workspace users cannot Connect/Sync bots.

---

## Related docs

| Doc | Topic |
|-----|--------|
| [alysonHR.md](./alysonHR.md) | Full Alyson HR master doc |
| [ALYSON_NOTETAKER_S3_READ_WRITE.md](./ALYSON_NOTETAKER_S3_READ_WRITE.md) | S3 read/write contract |
| [ALYSON_MEETING_MANAGER.md](./ALYSON_MEETING_MANAGER.md) | Meeting manager |
| [ALYSON_BOT_SCHEDULING_BLOCKERS.md](./ALYSON_BOT_SCHEDULING_BLOCKERS.md) | Scheduling edge cases |
| [KNOWLEDGE_GRAPH.md](./KNOWLEDGE_GRAPH.md) | Neo4j runbook |
| [../notetaker-architecture.md](../notetaker-architecture.md) | Older architecture notes |
