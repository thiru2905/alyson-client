<div align="center">

# Alyson HR Client

**TanStack Start · React 19 · Vite · Clerk · Supabase · S3**

Full-stack HR operations platform: people directory, payroll & bonus, leave & attendance, workspace analytics, AI insights, and meeting notetaker.

</div>

---

## What this app is

Alyson HR (`alyson-client`) is a **colocated full-stack web app** — React UI and server logic live in one repo, deployed as a single Vercel/Nitro app. It is **not** Next.js.

| Layer | Technology |
|-------|------------|
| UI | React 19, TanStack Router, TanStack Query, Tailwind, Radix |
| Server | TanStack Start `createServerFn`, Nitro (Vercel preset) |
| Auth | Clerk (`publicMetadata.roles`) |
| Transactional HR | Supabase (Postgres) |
| Ledgers & notetaker artifacts | AWS S3 |
| Integrations | Google Workspace DWD, Time Doctor, Recall.ai, Groq/DeepSeek, Resend |

**Product positioning:** vertical **HR + ops cockpit** with an AI layer (Alyson Brain) and meeting intelligence (Notetaker) — not a horizontal enterprise search tool like Glean.

---

## Quick start

```bash
npm install
cp .env.example .env   # or copy from team vault
npm run dev            # http://localhost:3001
npm run dev:ops        # same + notetaker URLs → localhost:3003
```

| Script | Port | Notes |
|--------|------|-------|
| `npm run dev` | **3001** | Default local UI |
| `npm run dev:ops` | 3001 | Sets `ALYSON_NOTETAKER_BASE_URL` / `VITE_ALYSON_NOTETAKER_BASE_URL` to `3003` |
| `npm run preview` | 3000 | Production build preview |

The **notetaker backend** is a separate process (default `localhost:3003`). `dev:ops` only wires URLs; it does not start that service.

---

## Architecture

```text
Browser (React)
    │
    ├─► TanStack server functions (createServerFn)  →  *.server.ts
    ├─► HTTP /api/* routes                         →  crons, webhooks, analytics REST
    ├─► Supabase client                            →  workflows, payroll, documents, …
    └─► External APIs                              →  Time Doctor, Recall, Google, Groq

S3 (alyson-hr-orgchart / AWS_S3_BUCKET)
    ├─ HR overview, org chart, onboarding, bonus, leave ledgers
    └─ alyson-notetaker/ transcripts, notes, tasks, bot-index, unified-scheduled
```

---

## Modules & routes

Full per-module docs: **[docs/ALYSON_HR_MODULES_INDEX.md](./docs/ALYSON_HR_MODULES_INDEX.md)** (28 module guides).

### Workspace

| Module | Route |
|--------|-------|
| Alyson Brain | `/alyson-brain` |
| Dashboard | `/app` |

### People

| Module | Route |
|--------|-------|
| Team | `/team` |
| Boarding | `/boarding` |
| Employee Onboarding | `/employee-onboarding` |
| Time Dashboard | `/time-dashboard` |
| Performance | `/performance` |
| Leave | `/leave` |
| Attendance | `/attendance` |

### Money

| Module | Route |
|--------|-------|
| Payroll | `/payroll` |
| Bonus | `/bonus` |
| Equity | `/equity` |

### Ops

| Module | Route |
|--------|-------|
| Workflows | `/workflows` |
| Documents | `/documents` |
| Handover Docs | `/handover-documentation` |
| Workspace Activity | `/workspace-activity` |
| Employee Scoring | `/employee-scoring` |
| Reports | `/reports` |

### Alyson Notetaker (Ops)

| Module | Route |
|--------|-------|
| Live Notetaker | `/alyson-notetaker` |
| Meeting List | `/alyson-notetaker/meeting-list` |
| Meeting Calendar | `/alyson-notetaker/calendar` |
| Analytics | `/alyson-notetaker/analytics` |
| Bot Join Report | `/alyson-notetaker/bot-join-report` |
| Unified Meetings | `/alyson-notetaker/unified-meetings` |
| Tasks | `/alyson-notetaker/tasks` |
| Recall Cost Tracking | `/alyson-notetaker/cost-tracking` |

### Admin

| Module | Route |
|--------|-------|
| Admin | `/admin` |
| Help | `/help` |
| Auth | `/auth` |

Nav role gates are defined in `src/components/AppShell.tsx`.

---

## Alyson Notetaker (summary)

> **Deep dives:** [docs/ALYSON_NOTETAKER_MODULE.md](./docs/ALYSON_NOTETAKER_MODULE.md) · [docs/ALYSON_NOTETAKER_S3_READ_WRITE.md](./docs/ALYSON_NOTETAKER_S3_READ_WRITE.md) · [notetaker-architecture.md](./notetaker-architecture.md)

The **Create** button on `/alyson-notetaker` does **not** call Recall from the browser. Flow:

1. Browser → TanStack server fn `createNotetakerRecallBot`
2. Server → notetaker service `POST /api/create-bot`
3. Notetaker → Recall.ai (join meeting)
4. Browser → notetaker SSE `GET /session/{botId}/events` for live transcript
5. On end → persist to S3 (`transcripts/`, `meetingnotes/`, `meetingtasks/`, `bot-index/`)

Supported meeting URLs: **Google Meet, Zoom, Teams** (via Recall).

### Notetaker env

| Variable | Purpose |
|----------|---------|
| `ALYSON_NOTETAKER_BASE_URL` | Server proxy to notetaker API |
| `VITE_ALYSON_NOTETAKER_BASE_URL` | Browser SSE + client |
| `RECALL_API_KEY`, `RECALL_BASE_URL` | Used by server-side Recall paths |
| `AWS_S3_BUCKET` / `S3_BUCKET` | Persist transcripts & notes |

### Quick curl (notetaker must be running on :3003)

```bash
curl -X POST http://localhost:3003/api/create-bot \
  -H "Content-Type: application/json" \
  -d '{"meeting_url":"YOUR_MEETING_URL","bot_name":"Alyson Notetaker","title":"Test"}'
```

---

## Unified Meetings & bot scheduling

> **Doc:** [docs/UNIFIED_MEETINGS_MODULE.md](./docs/UNIFIED_MEETINGS_MODULE.md)

**Route:** `/alyson-notetaker/unified-meetings`

Shows company calendar meetings (next 24h) via **Google Workspace Domain-Wide Delegation**, with Recall Calendar V2 for auto-join.

### Scheduling options

| Method | Description |
|--------|-------------|
| **Schedule** (per row) | `POST /api/analytics/unified-meetings/:meetingId/schedule` |
| **Unschedule** (per row) | `DELETE /api/analytics/unified-meetings/:meetingId/unschedule` — cancels Recall bot + removes S3 scheduled state |
| **Sync now** | Recall Calendar bulk sync for connected calendar |
| **Connect Google Calendar** | OAuth via `/api/recall/calendar/connect` |

Bots join **~2 minutes before** meeting start. Company-wide bulk `schedule-bots` cron returns **410 Gone** (disabled).

### Google DWD prerequisites

- Service account: `GOOGLE_DWD_SERVICE_ACCOUNT_JSON` (deploy) or `GOOGLE_APPLICATION_CREDENTIALS` (local file)
- Admin scopes: `admin.directory.user.readonly`, `calendar.events.readonly`
- `GOOGLE_WORKSPACE_DOMAIN`, `GOOGLE_WORKSPACE_ADMIN_SUBJECT_EMAIL`

### Unified Meetings API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/analytics/unified-meetings` | List meetings (cached scan) |
| `POST` | `/api/analytics/unified-meetings/refresh` | Force cache refresh |
| `POST` | `/api/analytics/unified-meetings/:meetingId/schedule` | Schedule one meeting |
| `DELETE` | `/api/analytics/unified-meetings/:meetingId/unschedule` | Cancel scheduled bot |
| `GET\|POST` | `/api/analytics/unified-meetings/schedule-bots` | **410 disabled** |

### Bot Join Report

Tracks whether bots joined calendar meetings for a report user (default `alysonclient@cintara.ai`). See [docs/BOT_JOIN_REPORT_MODULE.md](./docs/BOT_JOIN_REPORT_MODULE.md).

---

## HTTP API routes (cron & webhooks)

| Path | Purpose |
|------|---------|
| `/api/cron/daily-reports` | Daily stakeholder email ZIP |
| `/api/cron/notetaker-transcripts` | Transcript checkpoint cron |
| `/api/cron/recall-calendar-sync` | Recall calendar sync |
| `/api/cron/scheduled-bot-activation` | Activate due scheduled bots |
| `/api/cron/time-doctor-token` | Time Doctor token refresh |
| `/api/recall/calendar/*` | Recall Calendar OAuth + status |
| `/api/recall/webhooks/calendar` | Recall calendar webhooks |
| `/api/analytics/workspace-activity` | Workspace activity REST (optional) |
| `/api/analytics/employee-scoring` | Employee scoring REST (optional) |

Server functions (`createServerFn`) are the primary API for UI modules; `/api/*` is for crons, webhooks, and external consumers.

---

## Environment variables

Copy from team vault. Grouped overview:

### Auth & database

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk (browser) |
| `CLERK_SECRET_KEY` | Clerk (server) |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase client |

### AWS S3

| Variable | Purpose |
|----------|---------|
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | S3 credentials |
| `AWS_S3_BUCKET` / `S3_BUCKET` | Notetaker + general artifacts |
| `ALYSON_HR_ORGCHART_S3_BUCKET` | Org chart, onboarding, bonus, leave (default `alyson-hr-orgchart`) |
| `ALYSON_HR_S3_BUCKET` / `ALYSON_HR_S3_KEY` | Team HR overview snapshot |
| `VITE_HR_OVERVIEW_SOURCE` | `s3` or `supabase` for team directory |
| `UNIFIED_SCHEDULED_STATE_SOURCE` | `s3` / `file` / `auto` for bot schedule index |

### Notetaker & Recall

| Variable | Purpose |
|----------|---------|
| `ALYSON_NOTETAKER_BASE_URL` / `VITE_ALYSON_NOTETAKER_BASE_URL` | Notetaker service |
| `RECALL_API_KEY`, `RECALL_BASE_URL`, `RECALL_REGION` | Recall.ai |
| `BOT_NAME` | Bot display name in calls |
| `PUBLIC_WEBHOOK_BASE_URL` | Recall webhooks (notetaker service) |

### Google Workspace

| Variable | Purpose |
|----------|---------|
| `GOOGLE_DWD_SERVICE_ACCOUNT_JSON` | Service account JSON (deploy) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Local JSON path |
| `GOOGLE_WORKSPACE_DOMAIN` | e.g. `cintara.ai` |
| `GOOGLE_WORKSPACE_ADMIN_SUBJECT_EMAIL` | Impersonation subject |

### Time Doctor, email, AI

| Variable | Purpose |
|----------|---------|
| `TIME_DOCTOR_*` | OAuth + API (see [docs/TIME_DOCTOR_OAUTH.md](./docs/TIME_DOCTOR_OAUTH.md)) |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Daily reports |
| `DAILY_REPORT_RECIPIENTS`, `DAILY_REPORT_CRON_SECRET` | Stakeholder emails |
| `GROQ_API_KEY` / DeepSeek keys | Notes, tasks, Alyson Brain insights |

Deploy checklist: **[docs/VERCEL_PRODUCTION.md](./docs/VERCEL_PRODUCTION.md)**

---

## Useful scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server on port **3001** |
| `npm run dev:ops` | Dev + notetaker at `localhost:3003` |
| `npm run build` | Production build |
| `npm run seed:revcloud` | Seed RevCloud roster to HR overview S3 |
| `npm run inspect:orgchart` | Print org-chart S3 state |
| `npm run export:org-roster` | Export org roster sheet |
| `npm run audit:notetaker-notes` | Audit S3 notes coverage |
| `npm run backfill:notetaker-notes` | Backfill missing meeting notes |
| `npm run cron:notetaker-transcripts` | Run transcript cron locally |

### Diagnostics

```bash
# Check if a bot joined a specific meeting URL or ID
npx dotenv-cli -e .env -- npx tsx scripts/check-meeting-bot.ts "4154126965" 60

# Single-bot transcript / lifecycle diagnose
npx dotenv-cli -e .env -- npx tsx scripts/diagnose-bot-transcripts.ts <botId>
```

---

## Documentation index

| Doc | Topic |
|-----|--------|
| **[docs/ALYSON_HR_MODULES_INDEX.md](./docs/ALYSON_HR_MODULES_INDEX.md)** | **Master index — all 28 modules** |
| [docs/ALYSON_NOTETAKER_S3_READ_WRITE.md](./docs/ALYSON_NOTETAKER_S3_READ_WRITE.md) | S3 read/write contract for notetaker |
| [docs/ALYSON_MEETING_MANAGER.md](./docs/ALYSON_MEETING_MANAGER.md) | Meeting manager architecture |
| [docs/ALYSON_BOT_SCHEDULING_BLOCKERS.md](./docs/ALYSON_BOT_SCHEDULING_BLOCKERS.md) | Bot scheduling edge cases |
| [docs/DAILY_STAKEHOLDER_REPORTS.md](./docs/DAILY_STAKEHOLDER_REPORTS.md) | Daily email reports |
| [docs/TIME_DOCTOR_OAUTH.md](./docs/TIME_DOCTOR_OAUTH.md) | Time Doctor OAuth |
| [docs/VERCEL_PRODUCTION.md](./docs/VERCEL_PRODUCTION.md) | Production deployment |
| [notetaker-architecture.md](./notetaker-architecture.md) | Notetaker + Recall flow |
| [orgchart.md](./orgchart.md) | Org chart UI & S3 layout |
| [boarding.md](./boarding.md) | Boarding workflow spec |

---

## Repo layout (high level)

```text
src/
  routes/           # TanStack file routes (pages + /api/*)
  lib/              # Server functions, *.server.ts business logic
  components/       # UI (AppShell, drawers, charts, …)
  pages/            # Some page shells (e.g. Dashboard)
docs/               # Module & technical documentation
scripts/            # Seeds, audits, diagnostics, crons
```

---

## Production

Deployed via Vercel (Nitro preset). Production URL and env checklist: [docs/VERCEL_PRODUCTION.md](./docs/VERCEL_PRODUCTION.md).
