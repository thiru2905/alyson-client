# Alyson HR

**Alyson HR** (`alyson-client`) is the internal HR + operations cockpit for Cintara. It covers people, time, leave, payroll, bonus, workspace productivity, and meeting intelligence (Alyson Notetaker).

This is the **single master document**. Every module is documented in this file — there are no separate per-module markdown files.

Notetaker-only deep dive: [ALYSON_NOTETAKER.md](./ALYSON_NOTETAKER.md).

---

## What this product is

A colocated full-stack web app: React UI and server logic live in one repo and deploy as a single Vercel/Nitro app. It is **not** Next.js.

| Layer | Technology |
|-------|------------|
| UI | React 19, TanStack Router, TanStack Query, Tailwind, Radix |
| Server | TanStack Start `createServerFn`, Nitro (Vercel preset) |
| Auth | Clerk (`publicMetadata.roles`) |
| Transactional / demo HR | Supabase (Postgres) |
| Production ledgers + notetaker artifacts | AWS S3 |
| Graph (optional) | Neo4j |
| Integrations | Google Workspace DWD, Time Doctor, Recall.ai, Groq / DeepSeek, Resend / SES |

**Positioning:** vertical HR + ops cockpit with an AI layer (Alyson Brain) and meeting intelligence (Notetaker) — not a horizontal enterprise search tool.

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
| `npm run dev:ops` | 3001 | Wires notetaker URLs to `localhost:3003` (does not start that service) |
| `npm run preview` | 3000 | Production build preview |
| `npm run build` | — | Production build |

---

## Architecture

```text
Browser (React + Clerk)
    │
    ├─► TanStack server functions (createServerFn)  →  *.server.ts
    ├─► HTTP /api/* routes                         →  crons, webhooks, analytics REST
    ├─► Supabase client                            →  demo/legacy HR tables
    └─► External APIs                              →  Time Doctor, Recall, Google, Groq/DeepSeek

S3 (alyson-hr-orgchart)
    ├─ onboarding/, leave/, bonus/, payroll/, org chart, handover, super-access RBAC
    └─ Time Doctor OAuth tokens, pacing overrides

S3 (AWS_S3_BUCKET)
    └─ alyson-notetaker/ transcripts, notes, tasks, bot-index, unified-scheduled
```

### Two data planes

| Plane | Used by | Store |
|-------|---------|-------|
| **Production ops** | Leave, Bonus ledger, Payroll, Onboarding, Org chart, Handover, Super-access RBAC | S3 (`alyson-hr-orgchart`) |
| **Demo / legacy HR** | Dashboard KPIs (partly), Performance, Attendance, Equity, Workflows, Documents, Reports KPI catalog | Supabase |

Notetaker artifacts live in a **separate** S3 bucket (`AWS_S3_BUCKET` / `S3_BUCKET`).

---

## Module index

Jump to any module in this file:

### Workspace

| Module | Section |
|--------|---------|
| Alyson Brain | [#alyson-brain](#alyson-brain) |
| Dashboard | [#dashboard](#dashboard) |

### People

| Module | Section |
|--------|---------|
| Team | [#team](#team) |
| Boarding (legacy) | [#boarding-legacy](#boarding-legacy) |
| Employee Onboarding | [#employee-onboarding](#employee-onboarding) |
| Time Dashboard | [#time-dashboard](#time-dashboard) |
| Performance | [#performance](#performance) |
| Leave | [#leave](#leave) |
| Attendance | [#attendance](#attendance) |

### Money

| Module | Section |
|--------|---------|
| Payroll | [#payroll](#payroll) |
| Bonus & Shares | [#bonus--shares](#bonus--shares) |
| Equity | [#equity](#equity) |

### Ops

| Module | Section |
|--------|---------|
| Workflows | [#workflows](#workflows) |
| Documents | [#documents](#documents) |
| Handover Documentation | [#handover-documentation](#handover-documentation) |
| Workspace Activity | [#workspace-activity](#workspace-activity) |
| Employee Scoring | [#employee-scoring](#employee-scoring) |
| Reports | [#reports](#reports) |

### Alyson Notetaker (Ops)

| Module | Section |
|--------|---------|
| Alyson Notetaker (live) | [#alyson-notetaker-live](#alyson-notetaker-live) |
| Meeting Hours | [#meeting-hours](#meeting-hours) |
| Meeting List | [#meeting-list](#meeting-list) |
| Meeting Calendar | [#meeting-calendar](#meeting-calendar) |
| Recall Calendar (bot attendance) | [#recall-calendar-bot-attendance](#recall-calendar-bot-attendance) |
| Notetaker Analytics | [#notetaker-analytics](#notetaker-analytics) |
| Bot Join Report | [#bot-join-report](#bot-join-report) |
| Unified Meetings | [#unified-meetings](#unified-meetings) |
| Notetaker Tasks (legacy rollup) | [#notetaker-tasks-legacy-rollup](#notetaker-tasks-legacy-rollup) |
| Cost Tracking (Recall) | [#cost-tracking-recall](#cost-tracking-recall) |
| Knowledge Graph | [#knowledge-graph](#knowledge-graph) |
| Meeting Notes | [#meeting-notes](#meeting-notes) |
| Meeting Transcript | [#meeting-transcript](#meeting-transcript) |

### Admin & platform

| Module | Section |
|--------|---------|
| Admin | [#admin](#admin) |
| Help | [#help](#help) |
| Auth | [#auth](#auth) |
| App Shell | [#app-shell](#app-shell) |
| RBAC & Access | [#rbac--access](#rbac--access) |
| Crons & HTTP APIs | [#crons--http-apis](#crons--http-apis) |
| Landing & marketing | [#landing--marketing](#landing--marketing) |

---

## Access model (summary)

Roles come from Clerk `publicMetadata.roles`:

`super_admin` · `ceo` · `finance` · `hr` · `manager` · `employee`

| Gate | Modules |
|------|---------|
| All signed-in | Dashboard, Team, Performance, Attendance, Workflows, Documents, Help, Notetaker (most) |
| Clerk roles | Brain, Onboarding, Handover, Scoring, Reports, Admin |
| **Super-access** (email allowlist + S3 RBAC) | Leave, Payroll, Bonus, Equity, Workspace Activity, Meeting Hours |
| PIN (session) | Time Dashboard, Payroll, Super Admin role unlock |
| Time Dashboard scope | Super-access emails + managers (direct reports) + extra hours allowlist |
| Meeting visibility | Non-admins only see meetings they were invited to or spoke in |

Full detail: [RBAC & Access](#rbac--access).

---

## Cross-module data flow

```text
Onboarding S3  ──► Bonus ledger, Payroll roster
Org chart S3   ──► Team graph, manager Time Dashboard scope, leave/payroll location+team
Leave S3       ──► Weekly/Monthly pacing credit, Employee Scoring hours, Payroll period hours
Time Doctor    ──► Time Dashboard, Pacing, Leave roster sync, Scoring, Brain, Reports hourly
Google WS      ──► Workspace Activity, Scoring, Brain, Reports hourly, Meeting Hours, Unified Meetings
Notetaker S3   ──► Calendar, List, Analytics, Tasks, Knowledge Graph
Recall.ai      ──► Live bots, transcripts, Calendar V2, cost tracking, bot-join
```

---

## Repo layout

```text
src/
  routes/           # TanStack file routes (pages + /api/*)
  lib/              # Server functions, *.server.ts business logic
  components/       # UI (AppShell, drawers, charts, landing)
  pages/            # Some page shells (e.g. Dashboard)
docs/
  alysonHR.md       # This file — full project + every module
scripts/            # Seeds, audits, diagnostics, crons
```

---

## Environment (grouped)

Copy from team vault. High-level groups:

| Group | Typical variables |
|-------|-------------------|
| Auth | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` |
| Supabase | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |
| AWS S3 | `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET` / `S3_BUCKET`, `ALYSON_HR_ORGCHART_S3_BUCKET` |
| Notetaker / Recall | `ALYSON_NOTETAKER_BASE_URL`, `VITE_ALYSON_NOTETAKER_BASE_URL`, `RECALL_API_KEY`, `RECALL_BASE_URL` |
| Google Workspace | `GOOGLE_DWD_SERVICE_ACCOUNT_JSON`, `GOOGLE_WORKSPACE_DOMAIN`, `GOOGLE_WORKSPACE_ADMIN_SUBJECT_EMAIL` |
| Time Doctor | `TIME_DOCTOR_*` (see [TIME_DOCTOR_OAUTH.md](./TIME_DOCTOR_OAUTH.md)) |
| Email / AI | `RESEND_API_KEY`, `GROQ_API_KEY`, `DEEPSEEK_API_KEY` |
| Knowledge graph | `KNOWLEDGE_GRAPH_ENABLED`, `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` |

Production checklist: [VERCEL_PRODUCTION.md](./VERCEL_PRODUCTION.md).

---

## How to use this document

1. Use the [module index](#module-index) to jump to a section.
2. Each module uses the same subsections: **Purpose**, **Routes**, **Access**, **Data sources**, **Behaviors**, **File map**, **Integrations**.
3. Technical deep-dives (S3 contracts, OAuth, deploy) still live as separate docs under `docs/`. This file is the canonical full-project + module source.

---

# Modules

## Workspace

---
### Alyson Brain

#### Purpose

Natural-language employee intelligence. Ask something like “Report on Thirumalai for the past 3 months” and Alyson Brain aggregates scoring, hours, pacing, leave, bonus, workspace activity, then meetings/tasks, and writes a DeepSeek narrative. Supports PDF export.

#### Routes

| Path | File |
|------|------|
| `/alyson-brain` | `src/routes/alyson-brain.tsx` |

UI shell: `src/components/AlysonBrainDashboard.tsx`.

#### Access

- **Nav:** `super_admin`, `ceo`, `hr`, `manager`
- Server functions do **not** call `requireSuperAccess`. Anyone who can hit the route can run a report.

#### Data sources

No dedicated table. Aggregates from other modules:

| Slice | Source |
|-------|--------|
| Directory | Employee picker directory |
| Hours / pacing | Time Doctor + weekly/monthly pacing |
| Leave / bonus | S3 leave + bonus ledgers |
| Workspace | Google Workspace activity |
| Scoring | Employee scoring composite |
| Meetings / tasks | Notetaker S3 (slow second pass) |
| Narrative | DeepSeek via `groq-chat.server.ts` |

Last report is restored from session storage.

#### Behaviors

- Search box + suggested prompts
- Phased load: fast dashboard → insights → per-email slow slice (meetings/tasks)
- PDF download of the generated report
- Session restore so a refresh does not lose the last report

#### File map

| File | Role |
|------|------|
| `src/lib/alyson-brain-functions.ts` | `fetchAlysonBrainDashboard`, `fetchAlysonBrainSlowData`, `fetchAlysonBrainInsights` |
| `src/lib/alyson-brain/alyson-brain-context.server.ts` | Context assembly |
| `src/lib/alyson-brain/alyson-brain.server.ts` | Server orchestration |
| `src/lib/alyson-brain/alyson-brain-parse.server.ts` | Query parsing |
| `src/lib/alyson-brain-session.ts` | Session restore |
| `src/lib/alyson-brain-pdf.ts` | PDF export |

#### Integrations

Time Doctor, Google Workspace, S3 leave/bonus, Notetaker S3, DeepSeek.

#### Related

[employee-scoring.md](#employee-scoring) · [time-dashboard.md](#time-dashboard) · [workspace-activity.md](#workspace-activity) · [leave.md](#leave)

---
### Dashboard

#### Purpose

Executive HR home: headcount, compensation, bonus exposure, payroll preview, workflows inbox, and scenario forecasts. Greeting is role-aware (Clerk email + `ROLE_LABEL[primaryRole]`).

#### Routes

| Path | File |
|------|------|
| `/app` | `src/routes/app.tsx` → `src/pages/DashboardPage.tsx` |

Signed-in users landing on `/` or `/auth` are redirected here.

#### Access

All authenticated users. No PIN. Compensation numbers on this page are visible to anyone who can open `/app`.

#### Data sources

| Dataset | Source |
|---------|--------|
| Employees, departments, comp, history | `fetchOverview()` → S3 `alyson-hr/overview.json` (default) or Supabase if `VITE_HR_OVERVIEW_SOURCE=supabase` |
| Payroll runs | Supabase `payroll_runs` (legacy — not the S3 payroll board) |
| Bonus awards | Supabase `bonus_awards` (legacy — not the S3 bonus ledger) |
| Workflows | Supabase `workflow_instances` |
| Vesting events | Supabase `vesting_events` |

Client forecast: `src/lib/forecast.ts`.

#### Behaviors

- KPI cards: total comp, bonus, headcount, avg performance, payroll/equity forecasts (3/6 mo)
- Scenario toggle: conservative / base / growth via `buildForecast()`
- Charts: 12-month forecast area, historical comp line, headcount-by-dept bar
- Pending approvals inbox (top 5) → `/workflows`
- Recent payroll preview → `/payroll`
- Click KPI / forecast month for formula explainers (drawer)

#### File map

| File | Role |
|------|------|
| `src/routes/app.tsx` | Route |
| `src/pages/DashboardPage.tsx` | UI |
| `src/lib/queries.ts` | `fetchOverview` |
| `src/lib/queries-ext.ts` | Payroll, bonus, workflows, vesting |
| `src/lib/queries-hr-parts.ts` | Overview parts |
| `src/lib/forecast.ts` | Scenario forecasts |
| `src/lib/hr-s3-overview-functions.ts` | S3 overview server fns |

#### Integrations

None live. RevCloud roster can seed S3 if empty (`npm run seed:revcloud`).

#### Related

[team.md](#team) · [payroll.md](#payroll) · [workflows.md](#workflows) · [rbac-and-access.md](#rbac--access)

#### Notes

Dashboard payroll/bonus widgets still read **Supabase**. The live Payroll and Bonus modules use **S3 ledgers**. Treat Dashboard numbers as overview/demo unless those Supabase tables are populated.

---

## People

---
### Team

#### Purpose

People directory plus an interactive org chart (React Flow). Super admins can sync the roster to S3, create users, and edit the graph (reparent, terminate, add dummy nodes, persist positions).

#### Routes

| Path | File |
|------|------|
| `/team` | `src/routes/team.tsx` |

UI: `src/components/OrgChart.tsx`, `EmployeeDrawer`, `CreateUserDrawer`.

#### Access

- **View:** all signed-in users
- **Sync / create / edit org:** `super_admin`
- Create-user path still uses legacy Supabase `user_roles` + `employees` / `profiles` (Clerk vs Supabase mismatch is a known leftover)

#### Data sources

| Dataset | Location |
|---------|----------|
| Roster / directory | Same overview as Dashboard: S3 `alyson-hr/overview.json` or Supabase |
| Org graph | S3 `alyson-hr-orgchart` |

Org chart S3 layout:

| Key | Content |
|-----|---------|
| `main/state.json` | Positions + manager overrides |
| `roster/overview.json` | Roster snapshot |
| `terminations/index.json` | Terminations |
| `additions/index.json` | Additions |
| `logs/index.json`, `logs/by-date/<date>/<id>.json` | Audit history |

#### Behaviors

- Toggle **Directory** vs **Org chart**
- Search and department filter
- Employee cards open a detail drawer
- Edit mode: drag nodes, break reporting line, terminate (reparents reports), add person
- Save / publish / reset + audit history
- Super admin: sync roster to S3, create user

#### File map

| File | Role |
|------|------|
| `src/routes/team.tsx` | Page |
| `src/components/OrgChart.tsx` | React Flow graph |
| `src/lib/orgchart-functions.ts` | Server fns |
| `src/lib/orgchart-s3.server.ts` | S3 read/write |
| `src/lib/org-chart-roster.ts` | Roster mapping |
| `src/lib/admin-functions.ts` | Create user |
| `orgchart.md` (repo root) | Older UI/S3 layout notes |

#### Integrations

S3. Optional RevCloud seed. Org roster feeds Time Dashboard manager scope, Leave, and Payroll location/team.

#### Related

[employee-onboarding.md](#employee-onboarding) · [dashboard.md](#dashboard) · [time-dashboard.md](#time-dashboard)

---
### Boarding (legacy)

#### Purpose

Older PDF-checklist onboarding flow. **Superseded by Employee Onboarding.** The nav item is commented out in `AppShell`.

#### Routes

| Path | File | Behavior |
|------|------|----------|
| `/boarding` | `src/routes/boarding.tsx` | `beforeLoad` **redirects to `/employee-onboarding`** |

Spec leftovers: `boarding.md` (repo root), `src/lib/boarding-spec.ts`, `boarding-storage.ts`, `boarding-pdf-schema.ts`, `boarding-mock-data.ts`.

#### Access

N/A — users never stay on this route.

#### Data sources

Unused by the live product. Do not write new boarding data here.

#### Behaviors

Any navigation to `/boarding` lands on Employee Onboarding.

#### Related

[employee-onboarding.md](#employee-onboarding)

#### Notes

Keep the redirect so old bookmarks and links still work. Do not re-enable the sidebar item.

---
### Employee Onboarding

#### Purpose

Spreadsheet-style onboarding roster: PII, salary, equity, bank, access, employment status. This is a **production S3 ledger** and the roster source for Bonus and Payroll.

#### Routes

| Path | File |
|------|------|
| `/employee-onboarding` | `src/routes/employee-onboarding.tsx` |

UI: `BoardingDataTable`, `OnboardingEmployeeFormDrawer`.

#### Access

- **Nav:** `super_admin`, `ceo`, `hr`
- **Writes (UI):** `super_admin` only (`canEdit`)
- Server functions do **not** re-check Clerk role beyond being signed in — treat UI gate as the primary control

#### Data sources

| Object | Bucket / key |
|--------|----------------|
| Roster | `s3://alyson-hr-orgchart/onboarding/data.json` (`ALYSON_HR_ONBOARDING_S3_KEY`) |
| Audit log | `onboarding/operations.log.jsonl` |

Columns are defined in `src/lib/onboarding-schema.ts` (Employee ID, Name, Location, emails, Team, Manager, status, phones, job title, HR, salary, benefits, shares, national ID, bank, access, etc.).

#### Behaviors

- Facet filters: Location, Team, Status
- CSV export of the filtered view
- Add / edit via form drawer
- Sync org-chart fields (location / team / manager / status)
- Delete requires explicit confirm
- Super Admin CRUD; other nav roles can view

#### File map

| File | Role |
|------|------|
| `src/lib/onboarding-functions.ts` | `getOnboardingRoster`, `saveOnboardingRoster`, `addOnboardingUser`, `syncOnboardingOrgChartFields`, `deleteOnboardingUser` |
| `src/lib/onboarding-s3.server.ts` | S3 persistence |
| `src/lib/onboarding-schema.ts` | Column / record schema |
| `src/lib/onboarding-csv.ts` | CSV export |
| `src/components/BoardingDataTable.tsx` | Grid |
| `src/components/OnboardingEmployeeFormDrawer.tsx` | Form |

#### Integrations

Org chart roster sync. **Bonus** and **Payroll** consume this roster.

#### Related

[boarding.md](#boarding-legacy) · [team.md](#team) · [bonus.md](#bonus--shares) · [payroll.md](#payroll)

---
### Time Dashboard

#### Purpose

Live Time Doctor hours, productivity, and weekly/monthly pacing against a **35h target**. Leave credit is applied (+8h per workday, +4h half-day) from the Leave S3 ledger.

This is the **production** time module. Attendance (`/attendance`) is a separate Supabase demo table.

#### Routes

| Path | File | Role |
|------|------|------|
| `/time-dashboard` | `src/routes/time-dashboard.tsx` | Company / team hours table |
| `/time-dashboard/pacing` | `src/routes/time-dashboard.pacing.tsx` | Weekly pacing |
| `/time-dashboard/monthly-pacing` | `src/routes/time-dashboard.monthly-pacing.tsx` | Monthly pacing |
| `/time-dashboard/$userId` | `src/routes/time-dashboard.$userId.tsx` | Employee detail |

#### Access

Two layers (both required for the full UI):

1. **Scope (nav + data)**
   - Super-access emails + extra hours allowlist (`om.podey@cintara.ai`) → full company
   - Org-chart **managers** → direct reports only (`TimeDashboardRbacGate`)
   - Nav is hidden if the user has neither full nor team scope
2. **PIN** — `TimeDashboardGate` (sessionStorage). All roles, including super admin, must unlock.

See [rbac-and-access.md](#rbac--access). Codes live in `src/lib/module-access-lock.ts`.

#### Data sources

| Source | Use |
|--------|-----|
| Time Doctor Web API | Hours, apps, attendance, work |
| S3 `integrations/time-doctor/oauth-tokens.json` | OAuth tokens |
| Leave S3 | Pacing credit |
| S3 `pacing/active-overrides.json` | Active-status overrides |
| Org chart roster | Manager scope, location, team |
| Cron `/api/cron/time-doctor-token` | Token refresh |

#### Behaviors

##### Hours table (`/time-dashboard`)

- Date range picker; sort by period / today / week / month / name
- Rank medals; CSV + under-hours PDF
- Links to Weekly and Monthly Pacing
- Row click → `/time-dashboard/$userId`

##### Weekly / monthly pacing

- Week or month pickers
- Filters: location, team, employment type, active
- Status pills (`target_met` … `critical`)
- Active override; leave breakdown
- CSV / PDF; AI weekly insights (DeepSeek)
- Monthly quick locations: Pune, Lahore, Bahawalpur

##### Employee detail

Tabs: overview, attendance, apps, work (charts).

#### File map

| File | Role |
|------|------|
| `src/lib/time-doctor-functions.ts` | Employees table, user detail, under-hours report |
| `src/lib/time-doctor-pacing-functions.ts` | Pacing server fns |
| `src/lib/time-doctor-pacing.server.ts` | Pacing computation |
| `src/lib/time-dashboard-access-functions.ts` | Scope checks |
| `src/lib/time-dashboard-scoped-functions.ts` | Scoped queries |
| `src/lib/weekly-pacing.ts` / `weekly-pacing-*.server.ts` | Weekly pacing |
| `src/components/TimeDashboardGate.tsx` | PIN gate |
| `src/components/TimeDashboardRbacGate.tsx` | Scope gate |
| `src/components/WeeklyPacingTrendPanel.tsx` | Trend UI |

#### Integrations

Time Doctor, S3 leave, org roster, DeepSeek (weekly insights).

#### Related

[leave.md](#leave) · [attendance.md](#attendance) · [employee-scoring.md](#employee-scoring) · [reports.md](#reports)

#### Notes

Help copy still says Time Dashboard is super-admin-only. Code also allows managers (team scope) and the extra hours allowlist.

---
### Performance

#### Purpose

Review cycles, ratings, calibration, and promotion-ready flags. Includes a scatter of performance vs total compensation.

This module is **Supabase demo/legacy** unless those tables are populated in production.

#### Routes

| Path | File |
|------|------|
| `/performance` | `src/routes/performance.tsx` |

Drawers: `ReviewCycleDrawer`, `ReviewDrawer`.

#### Access

All signed-in users. No Super-access gate and no PIN.

#### Data sources

Supabase:

- `reviews` (join `employees`, `review_cycles`)
- Overview employees for the scatter
- `kpi_definitions` exists in schema but is unused here

#### Behaviors

- Stats: avg rating, submitted count, promo-ready
- Scatter: performance vs total comp
- Reviews table → detail drawer
- Start a review cycle
- CSV export

#### File map

| File | Role |
|------|------|
| `src/routes/performance.tsx` | Page |
| `src/lib/queries-ext.ts` | `fetchReviews` |
| `src/components/drawers/ReviewCycleDrawer.tsx` | Start cycle |
| `src/components/drawers/ReviewDrawer.tsx` | Review detail |

#### Integrations

None. No S3 performance ledger.

#### Related

[dashboard.md](#dashboard) · [employee-scoring.md](#employee-scoring)

---
### Leave

#### Purpose

Production leave ledger: per-employee events, team leave blocks, calendar, analytics, append-only audit, and a Gmail inbox that auto-extracts leave requests.

Leave days credit **Time Dashboard pacing** (+8h / workday, +4h half-day). Lifetime cap is **10 days** across all types.

#### Routes

Parent layout: `src/routes/leave/route.tsx` → `/leave`

| Path | File | Tab |
|------|------|-----|
| `/leave` | `leave/index.tsx` | Employee ledgers |
| `/leave/email-inbox` | `leave/email-inbox.tsx` | Email inbox |
| `/leave/calendar` | `leave/calendar.tsx` | Team calendar |
| `/leave/analytics` | `leave/analytics.tsx` | Analytics |
| `/leave/audit` | `leave/audit.tsx` | Audit log |

#### Access

**Super-access only.** `SuperAccessGate` on the layout + `requireSuperAccess` on mutating server functions.

#### Data sources

Canonical S3 (`alyson-hr-orgchart`):

| Object | Content |
|--------|---------|
| `leave/data.json` | Employees → `EmployeeLeaveLedger`, `teamLeaves`, version metadata |
| `leave/operations.log.jsonl` | Append-only operations |
| `leave/email-queue.json` | Inbox queue |
| `leave/email-processed.jsonl` | Processed emails |
| `leave/email-sync-state.json` | Gmail sync cursor |

Roster sync: Time Doctor users + org chart. Cron: `/api/cron/leave-email-sync` (also optionally run from the notetaker transcript cron).

**Legacy unused by this UI:** `leave-functions.ts` → Supabase `leave_types`, `leave_requests`, `leave_balances` (still referenced by `LeaveRequestDrawer` if mounted elsewhere).

#### Behaviors

##### Employees (`/leave`)

- Search / filter active ledgers
- Record or void personal leave (including half-day) from a drawer
- Team leave by location + team
- Sync roster from Time Doctor / Time Dashboard

##### Email inbox

- Scan window 7 days–24 months
- Retry failed LLM extraction
- Filter leave vs all mail

##### Calendar

- Merged personal + team events (`leave-calendar.ts`)
- Month navigation, focused day
- Create / remove team leave inline

##### Analytics

- Year + team + took-leave filters
- Trend, participation, team distribution, leave-type charts
- Employee-level breakdown

##### Audit

- Append-only operations log
- Super-access emails can inspect full event snapshots

#### Server functions

`src/lib/leave-ledger-functions.ts`:

- Reads: `getLeaveLedger`, `getLeaveAnalytics`, `getLeaveAuditLog`
- Sync: `syncLeaveWithTimeDoctor`
- Writes: `recordLeave`, `voidLeave`, `recordTeamLeave`, `voidTeamLeave`

Email: `leave-email-functions.ts` + `leave-email-gmail.server.ts` + `leave-email-extract.server.ts`.

Mutations validate with Zod. Writes append a log entry (`append_leave`, `void_leave`, `append_team_leave`, …).

#### File map

| File | Role |
|------|------|
| `src/lib/leave-ledger-functions.ts` | Public server fns |
| `src/lib/leave-s3.server.ts` | Snapshot + log |
| `src/lib/leave-roster.server.ts` | Roster merge |
| `src/lib/leave-email-*.ts` | Gmail ingest + LLM extract |
| `src/lib/leave-over-limit.server.ts` | Lifetime cap |
| `src/components/LeaveCalendarView.tsx` | Calendar UI |
| `src/components/LeaveTeamLeavePanel.tsx` | Team leave |
| `src/components/LeaveEmployeeLedgerDrawer.tsx` | Employee drawer |

#### Integrations

Time Doctor roster, Gmail (DWD/OAuth), LLM extract, Weekly/Monthly pacing query invalidation.

#### Related

[time-dashboard.md](#time-dashboard) · [payroll.md](#payroll) · [employee-scoring.md](#employee-scoring) · [rbac-and-access.md](#rbac--access)

---
### Attendance

#### Purpose

Last-14-day attendance table from **Supabase** (source / approved / adjusted hours, activity score).

This is **not** live Time Doctor data. Production hours live in [Time Dashboard](#time-dashboard).

#### Routes

| Path | File |
|------|------|
| `/attendance` | `src/routes/attendance.tsx` |

Drawer: `AttendanceAdjustDrawer`.

#### Access

All signed-in users. No Super-access, no PIN.

#### Data sources

Supabase `attendance_records` joined with `employees`. Fetched via `fetchAttendance(14)` in `queries-ext.ts`.

#### Behaviors

- KPI cards + table + CSV export
- Click a row to adjust hours
- **“Sync Time Doctor” is a client toast only** — it does not call Time Doctor

#### File map

| File | Role |
|------|------|
| `src/routes/attendance.tsx` | Page |
| `src/lib/queries-ext.ts` | `fetchAttendance` |
| `src/components/drawers/AttendanceAdjustDrawer.tsx` | Adjust hours |

#### Integrations

None live. Do not confuse with Time Dashboard.

#### Related

[time-dashboard.md](#time-dashboard) · [performance.md](#performance)

---

## Money

---
### Payroll

#### Purpose

Production compensation board: India **15th–15th** vs Pakistan **calendar month**, FX, Time Doctor hours in period, mark paid, analytics, and an append-only audit log.

Dashboard “recent payroll runs” still reads Supabase `payroll_runs` — a **different** dataset from this S3 board.

#### Routes

Parent: `src/routes/payroll/route.tsx`

| Path | File | Tab |
|------|------|-----|
| `/payroll` | `payroll/index.tsx` | Board |
| `/payroll/log` | `payroll/log.tsx` | Audit log |
| `/payroll/analytics` | `payroll/analytics.tsx` | Analytics |

#### Access

**Super-access** *and* **PIN** (`PayrollGate`, session-only). See [rbac-and-access.md](#rbac--access). Code lives in `src/lib/module-access-lock.ts`.

RBAC file: `payroll/rbac/access.json` (aliased to the shared super-access store).

#### Data sources

S3 (`alyson-hr-orgchart`):

| Object | Content |
|--------|---------|
| `payroll/data.json` | Live board |
| `payroll/operations.log.jsonl` | Audit |
| `payroll/snapshots/<month>.json` | Monthly snapshots |

Also:

- Roster: onboarding S3 + org chart (`payroll-roster.server.ts`)
- Hours: Time Doctor pacing for the pay period
- Bonus S3 for the bonus column
- FX rates stored per month (INR / PKR)

#### Behaviors

- Month + pay-cycle + active filters
- Employee drawer: salary, benefits, credits
- Mark / unmark paid
- CSV export
- Analytics: team / location / cycle / paid pie + bar
- Log: append-only actions

#### File map

| File | Role |
|------|------|
| `src/lib/payroll-functions.ts` | Server fns |
| `src/lib/payroll-s3.server.ts` | Persistence |
| `src/lib/payroll-report.server.ts` | Report build |
| `src/lib/payroll-pacing.server.ts` | Hours in period |
| `src/lib/payroll-analytics.ts` | Analytics |
| `src/lib/payroll-period.ts` | India vs Pakistan cycles |
| `src/lib/payroll-rbac-functions.ts` | Re-exports super-access |
| `src/components/PayrollGate.tsx` | PIN gate |
| `src/components/PayrollEmployeeDrawer.tsx` | Employee drawer |

#### Integrations

Time Doctor, Onboarding, Bonus, org chart, FX.

#### Related

[employee-onboarding.md](#employee-onboarding) · [bonus.md](#bonus--shares) · [time-dashboard.md](#time-dashboard) · [leave.md](#leave)

---
### Bonus & Shares

#### Purpose

Production **cash + share ledger** (append-only, synced from Onboarding). Analytics and audit sit on the same S3 store.

Separate **demo** pages exist for plans / simulate / approvals (mock data, not in the tab bar).

#### Routes

Parent: `src/routes/bonus/route.tsx` (`SuperAccessGate`)

| Path | File | Live? |
|------|------|-------|
| `/bonus` | `bonus/index.tsx` | **S3 ledger** |
| `/bonus/analytics` | `bonus/analytics.tsx` | **S3** |
| `/bonus/audit` | `bonus/audit.tsx` | **S3** |
| `/bonus/plans` | `bonus/plans.tsx` | Mock `MOCK_PLANS` |
| `/bonus/simulate` | `bonus/simulate.tsx` | Mock engine |
| `/bonus/approvals` | `bonus/approvals.tsx` | Mock Manager→HR→Finance→CEO |

Dashboard still uses Supabase `bonus_awards` / `bonus_plans` (legacy).

#### Access

- Live tabs: **Super-access**
- Mock plans/simulate: UI checks `super_admin` (CEO on some simulate controls)

#### Data sources

| Object | Content |
|--------|---------|
| `s3://alyson-hr-orgchart/bonus/data.json` | Ledgers |
| `bonus/operations.log.jsonl` | Audit |
| Onboarding S3 | Roster sync |

#### Behaviors (live)

- Search + active filter
- Ledger drawer: record / void bonus and share events
- Sync from onboarding
- Analytics: team / location / granularity charts

#### File map

| File | Role |
|------|------|
| `src/lib/bonus-functions.ts` | Server fns (`requireSuperAccess`) |
| `src/lib/bonus-s3.server.ts` | Persistence |
| `src/lib/bonus-schema.ts` | Schema |
| `src/lib/bonus-analytics.ts` | Analytics |
| `src/lib/bonus/mock.ts`, `engine.ts` | Demo simulator |
| `src/components/BonusEmployeeLedgerDrawer.tsx` | Ledger UI |

#### Integrations

Onboarding S3. Payroll reads bonus totals for the period.

#### Related

[employee-onboarding.md](#employee-onboarding) · [payroll.md](#payroll) · [equity.md](#equity)

#### Notes

Share **events** live here. The Equity module is a separate Supabase cap-table UI and is not this ledger.

---
### Equity

#### Purpose

Cap table UI: holders, grants, vesting, strike, cliff. Pie chart by holder type.

This is **Supabase demo/legacy**. Live share *events* are recorded on the [Bonus](#bonus--shares) S3 ledger.

#### Routes

| Path | File |
|------|------|
| `/equity` | `src/routes/equity.tsx` |

Drawers: `NewGrantDrawer`, `GrantDrawer`.

#### Access

**Super-access** (`SuperAccessGate`). No extra PIN.

#### Data sources

Supabase `equity_holders` with nested `equity_grants`. Dashboard vesting widgets read `vesting_events`.

No S3 equity module.

#### Behaviors

- Stats + pie by holder type
- Grants table
- CSV “Cap table”
- New grant / grant detail drawers

#### File map

| File | Role |
|------|------|
| `src/routes/equity.tsx` | Page |
| `src/lib/queries-ext.ts` | `fetchEquityHolders` |
| `src/components/drawers/NewGrantDrawer.tsx` | Create grant |
| `src/components/drawers/GrantDrawer.tsx` | Grant detail |

#### Integrations

None beyond Supabase.

#### Related

[bonus.md](#bonus--shares) · [dashboard.md](#dashboard)

---

## Ops

---
### Workflows

#### Purpose

Approval inbox across leave / payroll / equity / compensation. **Supabase demo/legacy** unless `workflow_instances` is populated.

#### Routes

| Path | File |
|------|------|
| `/workflows` | `src/routes/workflows.tsx` |

Drawer: `WorkflowDrawer`.

#### Access

All signed-in users.

#### Data sources

Supabase `workflow_instances` + `workflow_templates` via `fetchWorkflows()` in `queries-ext.ts`.

#### Behaviors

- Status counts
- Filter chips: all / pending / approved / rejected / overdue
- Table → detail drawer
- Dashboard pending-approvals widget links here

#### File map

| File | Role |
|------|------|
| `src/routes/workflows.tsx` | Page |
| `src/lib/queries-ext.ts` | `fetchWorkflows` |
| `src/lib/workflow-actions.ts` | Action helpers |
| `src/components/drawers/WorkflowDrawer.tsx` | Detail |

#### Related

[dashboard.md](#dashboard) · [leave.md](#leave) · [payroll.md](#payroll)

---
### Documents

#### Purpose

Policy / contract / template library with tags and visibility. **Supabase demo/legacy**.

#### Routes

| Path | File |
|------|------|
| `/documents` | `src/routes/documents.tsx` |

Drawers: `UploadDocumentDrawer`, `DocumentDrawer`.

#### Access

All signed-in users.

#### Data sources

Supabase `documents` via `fetchDocuments()` in `queries-ext.ts`.

#### Behaviors

- Search + tag filter
- Card grid
- Upload and open document drawers

#### File map

| File | Role |
|------|------|
| `src/routes/documents.tsx` | Page |
| `src/lib/queries-ext.ts` | `fetchDocuments` |
| `src/components/drawers/UploadDocumentDrawer.tsx` | Upload |
| `src/components/drawers/DocumentDrawer.tsx` | Detail |

#### Related

[handover-documentation.md](#handover-documentation) · [help.md](#help)

#### Notes

Handover Docs is a **different** module: name → URL registry on S3, not this document library.

---
### Handover Documentation

#### Purpose

Employee name → documentation URL registry for knowledge transfer / handovers. Production S3 index (not the Documents library).

#### Routes

| Path | File |
|------|------|
| `/handover-documentation` | `src/routes/handover-documentation.tsx` |

#### Access

- **Nav:** `super_admin`, `ceo`, `hr`
- Server functions are **not** Super-access gated beyond being signed in

#### Data sources

`s3://alyson-hr-orgchart/alyson-hr-handoverdocumetnation/index.json`  
(`ALYSON_HR_HANDOVERDOCS_S3_KEY` — note the historical key spelling)

#### Behaviors

- Add form (name + URL)
- Table with open-link
- CSV export
- Delete requires typing `DELETE`

#### File map

| File | Role |
|------|------|
| `src/lib/handover-docs-functions.ts` | Server fns |
| `src/lib/handover-docs-s3.server.ts` | S3 index |

#### Related

[documents.md](#documents) · [team.md](#team)

---
### Workspace Activity

#### Purpose

Google Workspace productivity: emails sent, meetings, Docs created, Chat messages. Custom time windows, per-user drill-down, AI insight, and full Gmail body/thread.

#### Routes

| Path | File |
|------|------|
| `/workspace-activity` | `src/routes/workspace-activity.tsx` |
| `/workspace-activity/$userEmail` | `src/routes/workspace-activity.$userEmail.tsx` |

Search params: `?start=` `&end=` (ISO datetimes).

Optional REST: `/api/analytics/workspace-activity`, `/api/analytics/workspace-activity/$userEmail`.

#### Access

**Super-access** (`SuperAccessGate` + `requireSuperAccess` on server fns).

#### Data sources

Google Admin SDK (directory + reports audit), Calendar, Gmail, Drive via Domain-Wide Delegation (`google-dwd-jwt.server.ts`).

No S3 for metrics — in-memory cache (~5 minutes).

#### Behaviors

##### List

- Range picker + presets (1 / 7 / 30 / 45 / 90 days)
- Search; sort by emails / meetings / docs / chat
- Rank medals; charts (lazy); CSV / PDF
- Session restore

##### Detail (`/$userEmail`)

Tabs: overview, emails, chat, docs, meetings. Sparkles insight. Open full email / thread.

#### File map

| File | Role |
|------|------|
| `src/lib/workspace-activity-functions.ts` | Server fns |
| `src/lib/workspace-activity.server.ts` | Aggregation |
| `src/lib/workspace-activity-content.server.ts` | Gmail/Drive/Chat bodies |
| `src/lib/workspace-activity-insight.server.ts` | LLM insight |
| `src/lib/workspace-activity-types.ts` | Types |
| `src/components/WorkspaceActivityRangePicker.tsx` | Range UI |
| `src/components/WorkspaceActivityCharts.tsx` | Charts |

#### Integrations

Google Workspace DWD; LLM for item insights.

#### Related

[employee-scoring.md](#employee-scoring) · [alyson-brain.md](#alyson-brain) · [reports.md](#reports)

---
### Employee Scoring

#### Purpose

Composite 0–100 grade from cohort percentiles. Merges multi-email identities. Leave credit is applied like Time Dashboard pacing.

Default weights:

| Signal | Weight |
|--------|--------|
| Work hours | 60% |
| Meetings | 16.7% |
| Emails | 10% |
| Chat | 8% |
| Docs | 5.3% |

#### Routes

| Path | File |
|------|------|
| `/employee-scoring` | `src/routes/employee-scoring.tsx` |
| `/employee-scoring/$userEmail` | `src/routes/employee-scoring.$userEmail.tsx` |

Detail requires `?start=` `&end=`. Optional REST: `/api/analytics/employee-scoring`, `/api/analytics/employee-scoring/$userEmail`.

#### Access

- **Nav:** `super_admin`, `ceo`, `hr`
- `getEmployeeScoring` is GET and does **not** call `requireSuperAccess`

#### Data sources

Workspace Activity + Time Doctor + Leave S3 + speaker-identity merge. Cache ~90s.

#### Behaviors

##### List

- Window + presets
- Search; grades A–F; medals
- CSV / PDF
- Hourly activity embed
- Click → detail

##### Detail

Tabs: overview, emails, chat, docs, meetings, focus, AI workspace analysis.

#### File map

| File | Role |
|------|------|
| `src/lib/employee-scoring-functions.ts` | List report |
| `src/lib/employee-scoring-rules.ts` | Weights / grades |
| `src/lib/employee-scoring-types.ts` | Types |
| `src/lib/employee-scoring-merge.server.ts` | Identity merge |
| `src/lib/employee-scoring-leave.server.ts` | Leave credit |
| `src/lib/employee-scoring-detail-functions.ts` | Detail |
| `src/lib/employee-workspace-ai-analysis.server.ts` | AI analysis |

#### Integrations

Google Workspace, Time Doctor, Leave S3, DeepSeek (detail AI).

#### Related

[workspace-activity.md](#workspace-activity) · [time-dashboard.md](#time-dashboard) · [alyson-brain.md](#alyson-brain)

---
### Reports

#### Purpose

Three tabs: hourly activity mix, daily stakeholder email, and a KPI catalog.

#### Routes

| Path | File |
|------|------|
| `/reports` | `src/routes/reports.tsx` |

Components: `HourlyActivityReport`, `DailyStakeholderReportsPanel`.

#### Access

- **Nav:** `super_admin`, `ceo`, `finance`, `hr`
- Daily “Send now” requires the server cron secret / send code
- Hourly and KPI server fns are not Super-access gated

#### Data sources

| Tab | Source |
|-----|--------|
| Hourly | Time Doctor + Workspace Activity (`hourly-activity-functions.ts`) |
| Daily email | Resend / SES; `DAILY_REPORT_RECIPIENTS`, `DAILY_REPORT_CRON_SECRET` |
| KPIs | Supabase `kpi_definitions` |

Cron: `/api/cron/daily-reports` (configured for 6:00 AM IST on Vercel).

#### Behaviors

- **Hourly:** pick employee + window; hour-by-hour mix; PDF
- **Daily email:** show cron config (masked recipients); Send now
- **KPIs:** category chips; formula + plain English; CSV; “schedule weekly” is a toast only

#### File map

| File | Role |
|------|------|
| `src/lib/hourly-activity-functions.ts` | Hourly report fns |
| `src/lib/hourly-activity-report.server.ts` | Aggregation |
| `src/lib/hourly-activity-pdf.ts` | PDF |
| `src/lib/daily-stakeholder-reports-functions.ts` | Daily send fns |
| `src/lib/daily-stakeholder-reports.server.ts` | Bundle + mail |
| `src/components/HourlyActivityReport.tsx` | Hourly UI |
| `src/components/DailyStakeholderReportsPanel.tsx` | Daily UI |

Deeper email spec: [DAILY_STAKEHOLDER_REPORTS.md](./DAILY_STAKEHOLDER_REPORTS.md).

#### Integrations

Time Doctor, Google Workspace, Resend/SES, Vercel cron.

#### Related

[time-dashboard.md](#time-dashboard) · [workspace-activity.md](#workspace-activity) · [crons-and-apis.md](#crons--http-apis)

---

## Alyson Notetaker

---
### Alyson Notetaker (live)

#### Purpose

Create a Recall.ai bot for a live Zoom / Google Meet / Teams URL, stream the transcript via SSE, generate smart notes, persist to S3, email notes, and chat against the meeting.

This is the **Create / live session** page. History lives in Meeting List + Meeting Calendar.

#### Routes

| Path | File |
|------|------|
| `/alyson-notetaker` | `src/routes/alyson-notetaker/index.tsx` |
| (layout) | `src/routes/alyson-notetaker/route.tsx` |

#### Access

Clerk session + **meeting visibility**:

- Full-access emails see every meeting
- Everyone else only sees meetings they were invited to or spoke in

Creating a bot is **not** visibility-gated — any signed-in user can dispatch.

#### Data sources

| Need | Source |
|------|--------|
| Session list | Upstream `/api/sessions` + S3 bot-index + unified scheduled |
| Session payload | Upstream `/api/session/:botId`, then S3 archive, then local datastore |
| Live lines | Browser `EventSource` → `{VITE_ALYSON_NOTETAKER_BASE_URL}/session/{botId}/events` |

S3 prefixes (bucket `AWS_S3_BUCKET`):

| Prefix | Content |
|--------|---------|
| `alyson-notetaker/transcripts/{prefix}/transcript.txt` | Transcript |
| `alyson-notetaker/meetingnotes/{prefix}/notes.md` | Notes |
| `alyson-notetaker/meetingtasks/{prefix}/tasks.json` | Tasks |
| `alyson-notetaker/bot-index/{botId}.json` | Canonical index |
| `alyson-notetaker/sessions/index.json` | Session list snapshot |

`prefix` = `{sanitized-title}_{YYYY-MM-DD}_{HH-MM-SS}`.

#### Behaviors

- Header chip → Unified Meetings with today’s scheduled bot count
- Sessions search; **S3** badge when persisted; **Persist list** writes `sessions/index.json`
- Create form: title, meeting URL, bot name, auto JPEG avatar from `/images/alyson-mini.svg`
- Bot `join_at` = now + 20s
- SSE merge with polled lines (dedupe by time \| text \| participant)
- Empty-transcript troubleshoot (SSE status, upstream line count, env hint)
- Notes: copy / download / email (SES, **manual** — auto-send is disabled)
- Persist to S3 / Sync Recall buttons
- Auto-toast when `autoPersistedToS3` is set on poll
- IST clock in header
- Mini-AI chat scoped to the meeting

**Create does not call Recall from the browser.** Flow:

1. Browser → `createNotetakerRecallBot`
2. Server → notetaker service `POST /api/create-bot`
3. Notetaker → Recall.ai
4. Browser SSE for live transcript
5. On end → persist to S3

#### File map

| File | Role |
|------|------|
| `src/lib/alyson-notetaker-functions.ts` | List / create / session fns |
| `src/lib/notetaker-get-session-functions.ts` | Get session |
| `src/lib/notetaker-bot-dispatch.server.ts` | Dispatch bot |
| `src/lib/notetaker-persistence-functions.ts` | Persist |
| `src/lib/notetaker-auto-persist.server.ts` | Auto persist |
| `src/lib/notetaker-sessions-list.server.ts` | Combined list |
| `src/lib/notetaker-smart-notes.ts` | Groq then DeepSeek notes |
| `src/lib/notetaker-upstream.server.ts` | Proxy to :3003 |
| `src/components/MeetingNotesEmailControl.tsx` | Manual SES email |

#### Integrations

Recall.ai, Notetaker service (`ALYSON_NOTETAKER_BASE_URL`, default `:3003`), Groq/DeepSeek, S3, SES.

#### Related

[meeting-list.md](#meeting-list) · [meeting-calendar.md](#meeting-calendar) · [unified-meetings.md](#unified-meetings) · [meeting-notes.md](#meeting-notes) · [crons-and-apis.md](#crons--http-apis)

---
### Meeting Hours

#### Purpose

Per-employee meeting hours from **Google Calendar DWD**, not from Recall or S3. Ops report for `@cintara.ai` staff.

Do not confuse with [cost-tracking.md](#cost-tracking-recall) (Recall billing hours).

#### Routes

| Path | File |
|------|------|
| `/alyson-notetaker/meeting-hours` | `src/routes/alyson-notetaker/meeting-hours.tsx` |

Cron: `GET|POST /api/cron/meeting-hours-report` (Bearer `MEETING_HOURS_REPORT_CRON_SECRET` or `CRON_SECRET`; flag `MEETING_HOURS_REPORT_ENABLED`).

#### Access

**Super-access** on UI (`SuperAccessGate`) and `requireSuperAccess` on the report server fn.

#### Data sources

`buildMeetingHoursReport` scans the employee directory, then each user’s primary calendar (`listCalendarEventsForUser`). Eligible events via `parseEligibleCalendarMeeting` (skips OOO / focus / lunch / etc.). Hours in **Asia/Kolkata**. Cached 10 minutes.

#### Behaviors

- Presets: 7 / 30 / 60 days, last month, last 2 months, custom range
- Daily vs weekly (ISO weeks) grid
- Employee search / compare
- Email dialog (SES) to stakeholders; default recipients = Super-access emails or `MEETING_HOURS_REPORT_RECIPIENTS`
- Link to Cost Tracking

#### File map

| File | Role |
|------|------|
| `src/lib/meeting-hours-functions.ts` | Server fns |
| `src/lib/meeting-hours-report.server.ts` | Report build |
| `src/lib/meeting-hours-email.server.ts` | Email send |
| `src/lib/meeting-calendar-read.server.ts` | DWD calendar read |
| `src/components/MeetingHoursEmailDialog.tsx` | Email UI |

#### Integrations

Google DWD, SES, employee picker directory. **Not** Recall.

#### Related

[cost-tracking.md](#cost-tracking-recall) · [unified-meetings.md](#unified-meetings) · [workspace-activity.md](#workspace-activity)

---
### Meeting List

#### Purpose

Month-scoped list of S3-persisted meetings with participants and per-person tasks. Same assets as Meeting Calendar; list UX instead of a month grid.

#### Routes

| Path | File |
|------|------|
| `/alyson-notetaker/meeting-list` | `src/routes/alyson-notetaker/meeting-list.tsx` |

#### Access

Clerk + meeting visibility. Task backfill is restricted to `MEETING_TASKS_BACKFILL_ADMIN_EMAIL`.

#### Data sources

- `listMeetingsFromS3Range` (bot-index + notes / transcript / tasks prefixes)
- `getMeetingParticipantsBatch` (calendar attendees + transcript speakers)
- Client cache: `meeting-list-participants-cache.ts`
- Tasks: `meetingtasks/{prefix}/tasks.json` (DeepSeek)

#### Behaviors

- Month prev / next
- Dedupe by bot / title / day
- Open notes / transcript (same as calendar)
- Generate / view tasks per meeting
- Admin: audit + backfill all meeting tasks

#### File map

| File | Role |
|------|------|
| `src/components/MeetingListView.tsx` | List UI |
| `src/lib/notetaker-s3-calendar-functions.ts` | Range list |
| `src/lib/notetaker-meeting-list-tasks.server.ts` | DeepSeek → `tasks.json` |
| `src/lib/notetaker-meeting-participants.server.ts` | Speakers + invitees |
| `src/lib/notetaker-meeting-ui.ts` | Shared UI helpers |
| `src/components/MeetingTasksBackfillButton.tsx` | Admin backfill |

#### Integrations

S3, Google calendar attendees, DeepSeek, speaker identity / roster.

#### Related

[meeting-calendar.md](#meeting-calendar) · [meeting-notes.md](#meeting-notes) · [notetaker-tasks.md](#notetaker-tasks-legacy-rollup)

#### Notes

Calendar/list tasks (`tasks.json`) are the **current** pipeline. The `/alyson-notetaker/tasks` page is a **legacy Groq rollup** and is hidden from the sidebar.

---
### Meeting Calendar

#### Purpose

Month grid of persisted S3 meetings. Deep-link into transcript, notes, or tasks.

This is **S3 history**, not the live Google calendar. Live scheduling is [Unified Meetings](#unified-meetings). Bot attendance is [Recall Calendar](#recall-calendar-bot-attendance).

#### Routes

| Path | File |
|------|------|
| `/alyson-notetaker/calendar` | `src/routes/alyson-notetaker/calendar.tsx` |

Search params (zod, captured then stripped): `day`, `botId`, `prefix`, `transcriptKey`, `notesKey`, `open=transcript|notes|tasks`.

#### Access

Clerk + meeting visibility. Meeting Hours / Cost Tracking links shown only for Super-access.

#### Data sources

`listMeetingsFromS3Range` for the visible month. Notes/tasks generated on demand from transcript if missing.

#### Behaviors

- Monday-first UTC month grid
- Click day → meetings; click meeting → notes / transcript / tasks
- Deep links from notes emails (`meeting-notes-email-deeplink.server.ts`)
- Notes coverage audit / backfill UI
- AppShell mini-AI has deterministic calendar answers (`module === "notetaker-calendar"`)

#### File map

| File | Role |
|------|------|
| `src/lib/notetaker-s3-calendar-functions.ts` | Range list |
| `src/lib/notetaker-s3-calendar.server.ts` | S3 scan |
| `src/components/MeetingTasksPanel.tsx` | Tasks panel |
| `src/components/MeetingDocPage.tsx` | Shared notes/transcript page |

#### Integrations

S3, Groq/DeepSeek (on-demand notes/tasks), SES deep links.

#### Related

[meeting-list.md](#meeting-list) · [meeting-notes.md](#meeting-notes) · [meeting-transcript.md](#meeting-transcript) · [unified-meetings.md](#unified-meetings)

---
### Recall Calendar (bot attendance)

#### Purpose

**Attendance calendar for Alyson’s bot**, not the OAuth connect screen. Visualizes `getBotJoinReport` for `alysonclient@cintara.ai`: joined vs missed vs partial days.

Recall Calendar **V2 OAuth** (Connect Google / Sync now) lives on [Unified Meetings](#unified-meetings) under `/api/recall/calendar/*`.

#### Routes

| Path | File |
|------|------|
| `/alyson-notetaker/recall-calendar` | `src/routes/alyson-notetaker/recall-calendar.tsx` |

#### Access

No Super-access or meeting-visibility filter. Org ops page; calendar email is hardcoded to the bot-join report user.

#### Data sources

Same pipeline as Bot Join Report: Recall bot lifecycles + Google DWD eligible meetings + S3 / unified / Recall Calendar V2 state.

#### Behaviors

- Views: Daily / Weekly / Notetaker
- Day status: joined (green), missed (red), partial (amber)
- Attendance marks: Present / Late (>2 min) / Waiting / Absent
- Month navigation; uses bot-join report cache

#### File map

| File | Role |
|------|------|
| `src/lib/notetaker-bot-join-functions.ts` | `getBotJoinReport` |
| `src/lib/notetaker-bot-join-report.server.ts` | Report build |
| `src/lib/notetaker-bot-join-timing.server.ts` | Lateness / waiting |

#### Integrations

Recall bot status API, Google DWD, S3 indexes, Recall Calendar V2 events.

#### Related

[bot-join-report.md](#bot-join-report) · [unified-meetings.md](#unified-meetings)

---
### Notetaker Analytics

#### Purpose

Speaker / utterance analytics over S3 transcripts for a date range, plus AI insights and HTML/PDF export.

#### Routes

| Path | File |
|------|------|
| `/alyson-notetaker/analytics` | `src/routes/alyson-notetaker/analytics.tsx` |

Alias UI for unified meetings: `/alyson-notetaker/analytics/unified-meetings` — see [unified-meetings.md](#unified-meetings).

#### Access

Clerk + meeting visibility. Non-admins only analyze their meetings; prefixes are clamped to the visible set.

#### Data sources

- Meeting picker: `listMeetingsFromS3Range`
- Report: `buildNotetakerAnalyticsReport` (parse transcripts, speaker-identity merge, rollups)
- Session restore: `notetaker-analytics-session.ts` (localStorage)

#### Behaviors

- Presets 7 / 15 / 30 / 45 / 60 / 90 days or custom ≤ 365 days
- Multi-select speakers + meetings; fuzzy search
- Charts: pie (speakers), bar (meetings/day, speaker-by-meeting)
- Export HTML / print / PDF
- Groq insights
- Link to Cost Tracking

#### File map

| File | Role |
|------|------|
| `src/lib/notetaker-analytics-functions.ts` | Server fns |
| `src/lib/notetaker-analytics.server.ts` | Report build |
| `src/lib/notetaker-analytics-insights.server.ts` | Groq insights |
| `src/lib/notetaker-analytics-export.ts` / `notetaker-analytics-pdf.ts` | Export |
| `src/lib/notetaker-transcript-parse.server.ts` | Transcript parse |
| `src/lib/speaker-identity.ts` | Speaker merge |

#### Integrations

S3 transcripts, Groq, speaker identity.

#### Related

[meeting-list.md](#meeting-list) · [cost-tracking.md](#cost-tracking-recall) · [employee-scoring.md](#employee-scoring)

---
### Bot Join Report

#### Purpose

Did the Alyson bot actually get into eligible Google Meet calls? Join rate, waiting room, lateness, failures.

Default report user: `alysonclient@cintara.ai`.

#### Routes

| Path | File |
|------|------|
| `/alyson-notetaker/bot-join-report` | `src/routes/alyson-notetaker/bot-join-report.tsx` |

#### Access

Ungated beyond being signed into the app.

#### Data sources (`buildBotJoinReport`)

- Google DWD calendar for the report email
- Recall bot list / lifecycle (`recall-bot-status.server.ts`)
- Unified scheduled S3, bot-index, live sessions, Recall Calendar V2 events

#### Behaviors

- Periods: 7 / 15 / 30 / 60 days or last 24h (`windowHours=24`)
- Charts: pie (outcomes), bar/line (daily join rate / lateness)
- PDF download
- Session/cache in `bot-join-report-session.ts`
- `forceRefresh` on explicit refresh

#### File map

| File | Role |
|------|------|
| `src/lib/notetaker-bot-join-functions.ts` | Server fn |
| `src/lib/notetaker-bot-join-report.server.ts` | ~1100-line report builder |
| `src/lib/notetaker-bot-join-report.pdf.ts` | PDF |
| `src/lib/recall/recall-bot-status.server.ts` | Recall lifecycle |

#### Integrations

Recall + Google DWD + S3.

#### Related

[recall-calendar.md](#recall-calendar-bot-attendance) · [unified-meetings.md](#unified-meetings) · [alyson-notetaker.md](#alyson-notetaker-live)

---
### Unified Meetings

#### Purpose

Company calendar scan (Google Workspace DWD) plus Recall Calendar V2 connect/sync. Schedule one bot per Meet instance (~2 minutes before start). Primary ops console for “will Alyson join?”

#### Routes

| Path | File |
|------|------|
| `/alyson-notetaker/unified-meetings` | `unified-meetings.tsx` (re-export) |
| `/alyson-notetaker/analytics/unified-meetings` | `analytics.unified-meetings.tsx` (full UI) |

#### Access

No meeting-visibility filter (full calendar dump). Connect / auto-schedule is **allowlist-enforced** server-side (`recall-calendar-allowlist.server.ts`).

#### Data sources (REST, not server fns)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/analytics/unified-meetings` | List (DWD scan, ~60s cache) |
| `POST` | `/api/analytics/unified-meetings/refresh` | Force refresh |
| `POST` | `/api/analytics/unified-meetings/:meetingId/schedule` | Schedule one (`?redispatch=1`) |
| `DELETE` | `/api/analytics/unified-meetings/:meetingId/unschedule` | Cancel bot + S3 state |
| `GET\|POST` | `/api/analytics/unified-meetings/schedule-bots` | **410 disabled** |
| `GET` | `/api/recall/calendar/connect` | Google OAuth |
| `GET\|POST` | `/api/recall/calendar/status` | Connections + Sync / Disconnect |

Scheduled state: `alyson-notetaker/unified-scheduled/index.json`.

#### Behaviors

- Filters: search, email, has Meet link
- Per-row Schedule / Unschedule
- Recall Calendar panel: Connect Google, pending count, **Sync now** (reserves up to 30 bots)
- Auto-sync on page load when upcoming − scheduled > 0 (`VITE_RECALL_CALENDAR_AUTO_SYNC`, 90s cooldown)
- Bot joins ~2 min before start; immediate join uses +20s `join_at`
- Dedupe key: `meetingUrl|startTime`
- Smart schedule by `eventIds` is **503 disabled** (waiting-room / transcript issues)
- Company-wide bulk schedule is permanently **410**

##### Google DWD prerequisites

- Service account: `GOOGLE_DWD_SERVICE_ACCOUNT_JSON` or `GOOGLE_APPLICATION_CREDENTIALS`
- Scopes: `admin.directory.user.readonly`, `calendar.events.readonly`
- `GOOGLE_WORKSPACE_DOMAIN`, `GOOGLE_WORKSPACE_ADMIN_SUBJECT_EMAIL`

#### File map

| File | Role |
|------|------|
| `src/lib/unifiedMeetingsService.ts` | DWD scan + schedule/unschedule |
| `src/lib/unified-scheduled-s3.server.ts` | Scheduled index |
| `src/lib/unified-meetings-background.server.ts` | Background maintenance |
| `src/lib/meeting-bot-reserve.server.ts` | Dedupe reserve |
| `src/lib/recall/recall-calendar-v2.server.ts` | Calendar V2 |
| `src/lib/recall/recall-calendar-sync.server.ts` | Sync |

#### Integrations

Google DWD (list), Google OAuth + Recall Calendar V2 (auto-schedule), Recall bots, S3.

#### Related

[alyson-notetaker.md](#alyson-notetaker-live) · [bot-join-report.md](#bot-join-report) · [crons-and-apis.md](#crons--http-apis)

---
### Notetaker Tasks (legacy rollup)

#### Purpose

Per-assignee rollup of action items extracted from notes/transcripts with Groq. **Outdated.** Sidebar item is commented out; route and code are kept.

This is **not** the current task pipeline. Meeting List / Calendar write `meetingtasks/{prefix}/tasks.json` via DeepSeek.

#### Routes

| Path | File |
|------|------|
| `/alyson-notetaker/tasks` | `src/routes/alyson-notetaker/tasks.tsx` |

#### Access

No meeting-visibility filter. Employee picker for assignee. Anyone signed in who knows the URL.

#### Data sources

S3 meetings in range → Groq extract → filter by `assigneeEmail`.

#### Behaviors

- Windows: 7 / 14 / 30 days or custom ≤ 90
- Employee email picker
- Links to notes / transcript
- AI insights (`getNotetakerTasksInsights`)

#### File map

| File | Role |
|------|------|
| `src/lib/notetaker-tasks-functions.ts` | Server fns |
| `src/lib/notetaker-tasks.server.ts` | Groq extract |
| `src/lib/notetaker-tasks-types.ts` | Types |

**Current pipeline:** `src/lib/notetaker-meeting-list-tasks.server.ts` + `MeetingTasksPanel`.

#### Integrations

Groq, S3, employee directory, speaker identity.

#### Related

[meeting-list.md](#meeting-list) · [meeting-calendar.md](#meeting-calendar)

#### Notes

Do not re-enable the sidebar item without reconciling the two task systems.

---
### Cost Tracking (Recall)

#### Purpose

Recall.ai usage cost: bot hours + transcription hours from the Recall billing API, plus meeting counts from S3.

Default rates: bot **$0.50/hr**, transcription **$0.15/hr** (`RECALL_BOT_HOUR_USD` / `RECALL_TRANSCRIPT_HOUR_USD`).

#### Routes

| Path | File |
|------|------|
| `/alyson-notetaker/cost-tracking` | `src/routes/alyson-notetaker/cost-tracking.tsx` |

Linked from Meeting Hours, Calendar, and Analytics. REST: `GET /api/analytics/recall-cost?start&end`.

#### Access

No Super-access gate (URL-reachable). Meeting Hours link only shows for Super-access users.

#### Data sources

- Recall `GET /api/v1/billing/usage/` (`bot_total` seconds)
- S3 meeting counts
- Billing API is 5 req/min — client caches 1 hour
- Daily split is **estimated** from the period total
- Storage / DSDK extras are **not** included

#### Behaviors

- Presets 7 / 30 / 60 / 90 days
- Charts: cost vs hours vs meetings
- Groq insights
- Session cache `recall-cost-session.ts`

#### File map

| File | Role |
|------|------|
| `src/lib/recall-cost-functions.ts` | Server fns |
| `src/lib/recall-cost-report.server.ts` | Report |
| `src/lib/recall-cost-insights.server.ts` | Groq insights |
| `src/lib/recall/recall-billing.server.ts` | Billing API |

#### Integrations

Recall billing + S3.

#### Related

[meeting-hours.md](#meeting-hours) · [notetaker-analytics.md](#notetaker-analytics)

#### Notes

Meeting Hours = Google Calendar hours. Cost Tracking = Recall billed bot/transcript hours. They will not match.

---
### Knowledge Graph

#### Purpose

Explore a Neo4j graph of `@cintara.ai` people / meetings / projects / tasks / topics extracted from S3 notes + transcripts via DeepSeek.

**Off by default.** Set `KNOWLEDGE_GRAPH_ENABLED=true`. Does not touch bot dispatch or notes email.

Deeper runbook: [KNOWLEDGE_GRAPH.md](./KNOWLEDGE_GRAPH.md).

#### Routes

| Path | File |
|------|------|
| `/alyson-notetaker/knowledge-graph` | `src/routes/alyson-notetaker/knowledge-graph.tsx` |

Cron: `/api/cron/knowledge-graph-sync` (Bearer transcript cron secret).

CLI: `scripts/kg-sync.ts`, `kg-schema.ts`, `kg-status.ts`. Docker: `docker/neo4j/docker-compose.yml`.

#### Access

No extra gate. Sync is a no-op unless the flag is on. Local Docker Neo4j is not reachable from Vercel — use Aura in production.

#### Data sources

- Neo4j (`NEO4J_URI`, default `bolt://localhost:7687`)
- Sync reads S3 bot-index + notes/transcripts
- LLM map requires `DEEPSEEK_API_KEY`

##### Graph model

| Node | Key | Source |
|------|-----|--------|
| Person | email | DeepSeek + ATTENDED |
| Meeting | botId | S3 bot-index |
| Project | key | DeepSeek ABOUT |
| Task | key | DeepSeek + HAS_TASK |
| Topic | key | DeepSeek |

A meeting is **ready** when it has `botId` + prefix, is not superseded, has transcript or notes, and a finalize marker. Skip if hashes already match `kgSynced*`.

#### Behaviors

- Stat cards; rank lists (people / projects / topics)
- React Flow neighborhood (Meeting / Person / Project / Topic / Task)
- Person email search
- Schema bootstrap + batch sync (default 25, max 500)

#### File map

| File | Role |
|------|------|
| `src/lib/knowledge-graph-functions.ts` | UI server fns |
| `src/lib/knowledge-graph/kg-config.server.ts` | Flags / creds |
| `src/lib/knowledge-graph/kg-neo4j.server.ts` | Driver |
| `src/lib/knowledge-graph/kg-schema.server.ts` | Constraints |
| `src/lib/knowledge-graph/kg-deepseek-map.server.ts` | LLM extract |
| `src/lib/knowledge-graph/kg-write.server.ts` | MERGE nodes |
| `src/lib/knowledge-graph/kg-queries.server.ts` | Queries |
| `src/lib/knowledge-graph/kg-sync-meetings.server.ts` | Batch sync |
| `src/lib/knowledge-graph/kg-workspace-ingest.server.ts` | Planned Gmail/Drive ingest |

#### Integrations

DeepSeek, Neo4j, S3. Google DWD ingest is planned, not live.

#### Related

[alyson-notetaker.md](#alyson-notetaker-live) · [meeting-calendar.md](#meeting-calendar) · [crons-and-apis.md](#crons--http-apis)

---
### Meeting Notes

#### Purpose

Full-page markdown notes viewer. Opened from Calendar, Meeting List, or notes-email deep links.

#### Routes

| Path | File |
|------|------|
| `/alyson-notetaker/notes` | `src/routes/alyson-notetaker/notes.tsx` |

Required search: `notesKey`. Optional: `day`, `title`, `botId`, `prefix`.

Implementation: `MeetingDocPage kind="notes"`.

#### Access

Same meeting visibility as Calendar / List (`assertViewerCanAccessMeetingAsset`).

#### Data sources

`getMeetingNotesMdFromS3`. If missing, `ensureMeetingNotesInS3Fn` generates from transcript (Groq, then DeepSeek).

S3: `alyson-notetaker/meetingnotes/{prefix}/notes.md`.

Notes generation waits until the transcript is idle ≥ `NOTETAKER_NOTES_IDLE_STABLE_MS` (default 15 minutes). **Auto SES send is disabled**; email is manual from the UI.

#### Behaviors

- Copy / download
- Email control (SES)
- Generate-if-missing
- Back-link to calendar day

#### File map

| File | Role |
|------|------|
| `src/components/MeetingDocPage.tsx` | Shared viewer |
| `src/components/MeetingNotesMarkdown.tsx` | Render |
| `src/components/MeetingNotesEmailControl.tsx` | Email |
| `src/lib/notetaker-smart-notes.ts` | Generation |
| `src/lib/meeting-notes-email.server.ts` | SES |

#### Related

[meeting-calendar.md](#meeting-calendar) · [meeting-transcript.md](#meeting-transcript) · [alyson-notetaker.md](#alyson-notetaker-live)

---
### Meeting Transcript

#### Purpose

Full-page transcript viewer. Opened from Calendar, Meeting List, or email deep links.

#### Routes

| Path | File |
|------|------|
| `/alyson-notetaker/transcript` | `src/routes/alyson-notetaker/transcript.tsx` |

Required search: `transcriptKey`. Optional: `day`, `title`, `botId`, `prefix`.

Implementation: `MeetingDocPage kind="transcript"` → `getMeetingTranscriptTextFromS3` + `MeetingTranscriptView`.

#### Access

Same meeting visibility as Notes.

#### Data sources

S3: `alyson-notetaker/transcripts/{prefix}/transcript.txt`.

Cron `/api/cron/notetaker-transcripts` checkpoints live/ended bots into S3. After persist with a non-empty transcript, Recall media is deleted best-effort.

#### Behaviors

- Speaker-aware transcript view
- Back-link to calendar day
- Used as input for notes, tasks, analytics, and knowledge graph

#### File map

| File | Role |
|------|------|
| `src/components/MeetingDocPage.tsx` | Shared viewer |
| `src/components/MeetingTranscriptView.tsx` | Transcript UI |
| `src/lib/notetaker-transcript-cron.server.ts` | Cron persist |
| `src/lib/notetaker-transcript-parse.server.ts` | Parse for analytics |

#### Related

[meeting-notes.md](#meeting-notes) · [meeting-calendar.md](#meeting-calendar) · [notetaker-analytics.md](#notetaker-analytics) · [crons-and-apis.md](#crons--http-apis)

---

## Admin & platform

---
### Admin

#### Purpose

Super-admin workspace settings. **Users & roles** is the live drawer; most other cards are stubs.

#### Routes

| Path | File |
|------|------|
| `/admin` | `src/routes/admin.tsx` |

Drawer: `UsersRolesDrawer`.

#### Access

Route checks `hasRole("super_admin")` after Super Admin PIN unlock in the shell. Server create/delete still checks **Supabase** `user_roles.super_admin` (legacy vs Clerk).

#### Data sources

Legacy Supabase: `user_roles`, `profiles`, `employees`. User create/delete uses `supabaseAdmin.auth.admin.*`.

#### Behaviors

- Role pills
- **Users & roles** — live drawer
- Security & SSO / Data sources / Webhooks / API keys / Audit log → “coming soon” toasts

#### File map

| File | Role |
|------|------|
| `src/routes/admin.tsx` | Page |
| `src/lib/admin-functions.ts` | `createUserAsAdmin`, `createEmployeeAndUserAsAdmin`, delete |
| `src/components/drawers/UsersRolesDrawer.tsx` | Users UI |
| `src/components/drawers/CreateUserDrawer.tsx` | Also used from Team |

#### Integrations

Supabase Auth Admin API. Live login is **Clerk**; this path is partially leftover.

#### Related

[auth.md](#auth) · [rbac-and-access.md](#rbac--access) · [team.md](#team)

---
### Help

#### Purpose

In-app FAQ: getting started, Notetaker, Meeting calendar, Handover, Workspace Activity, Time Dashboard, payroll/equity primers, and support contact.

#### Routes

| Path | File |
|------|------|
| `/help` | `src/routes/help.tsx` |

#### Access

All signed-in users.

#### Data sources

Static copy only. Support: `thirumalai@cintara.ai`.

#### Behaviors

Accordion FAQ. No server functions.

#### File map

| File | Role |
|------|------|
| `src/routes/help.tsx` | Page |

#### Related

[app-shell.md](#app-shell) · [landing.md](#landing--marketing)

#### Notes

FAQ text may lag the product (e.g. Time Dashboard is no longer super-admin-only). Prefer this documentation set when the Help copy disagrees.

---
### Auth

#### Purpose

Clerk Sign In / Sign Up. Public. Signed-in users are redirected to `/app`.

#### Routes

| Path | File |
|------|------|
| `/auth` | `src/routes/auth.tsx` |

Root gate: `src/routes/__root.tsx` — unsigned users → `/auth`; signed-in on `/` or `/auth` → `/app`. Marketing paths stay public (see [landing.md](#landing--marketing)).

#### Access

Public. Everything else in the app requires a Clerk session (except marketing pages).

#### Data sources

Clerk `publicMetadata.roles`. Super-admin is filtered out of effective roles until the Super Admin PIN is entered.

#### Behaviors

- Split brand + Clerk widgets
- Login / signup toggle
- Demo-role tip (role switcher lives in App Shell after sign-in)

#### File map

| File | Role |
|------|------|
| `src/routes/auth.tsx` | Sign-in page |
| `src/lib/auth.tsx` | `ClerkProvider`, roles, demo override, PIN unlocks |
| `src/lib/clerk-auth.server.ts` | Token verify + optional dev bypass |
| `src/lib/module-access-lock.ts` | Time Dashboard + Payroll PIN helpers |
| `src/integrations/supabase/auth-middleware.ts` | Legacy Supabase middleware |

Env: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.

#### Integrations

Clerk.

#### Related

[rbac-and-access.md](#rbac--access) · [app-shell.md](#app-shell) · [admin.md](#admin)

---
### App Shell

#### Purpose

Authenticated chrome around every product page: sidebar nav, theme, command palette, notifications, in-app Alyson chat, and per-module mini-AI.

#### Routes

Not a route. `AppShell` wraps signed-in pages from `__root.tsx`.

File: `src/components/AppShell.tsx`.

#### Access

Nav items are filtered by Clerk roles, Super-access, and Time Dashboard scope. See [rbac-and-access.md](#rbac--access).

#### Nav groups

Defined as `NAV` in `AppShell.tsx`. Groups persist collapsed state in `localStorage`.

| Group | Items |
|-------|-------|
| Workspace | Alyson Brain, Dashboard |
| People | Team, Employee Onboarding, Time Dashboard, Performance, Leave, Attendance |
| Money | Payroll, Bonus, Equity |
| Ops | Workflows, Documents, Handover Docs, Workspace Activity, Employee Scoring, Reports, Alyson Notetaker (+ children) |
| Admin | Admin, Help |

**Commented out of nav (routes kept):** Boarding, Notetaker Tasks.

**Notetaker children in sidebar:** Meeting Hours, Meeting List, Meeting Calendar, Recall Calendar, Analytics, Bot Join Report, Unified Meetings.

**Reachable but not in sidebar:** Cost Tracking, Knowledge Graph, Notes, Transcript, Bonus plans/simulate/approvals.

#### Behaviors

- Collapsible / resizable sidebar (width 220–380, default 268)
- Mobile drawer
- Theme + palette switcher
- Command palette (`CommandPalette`)
- Notifications popover
- Announcement banner
- In-app Alyson chat (`streamAlyson`)
- Per-module mini-AI (`askMiniModuleAi`) — calendar has deterministic answers
- Demo role switcher (localStorage)
- Super Admin PIN prompt
- Build SHA / env chip (`__BUILD_SHA__`, `__BUILD_ENV__`)

#### File map

| File | Role |
|------|------|
| `src/components/AppShell.tsx` | Shell + `NAV` |
| `src/components/CommandPalette.tsx` | ⌘K |
| `src/components/NotificationsPopover.tsx` | Notifications |
| `src/components/AppAnnouncementBanner.tsx` | Banner |
| `src/lib/mini-module-ai.ts` | Page-scoped AI |
| `src/lib/ai-client.ts` | `streamAlyson` |
| `src/lib/theme.ts` | Theme |
| `src/lib/app-scroll.ts` | Scroll reset |

#### Related

[auth.md](#auth) · [rbac-and-access.md](#rbac--access) · [help.md](#help)

---
### RBAC & Access

#### Purpose

How Alyson HR decides who can see a module, a row, or a meeting. Several independent gates stack; failing any one hides or locks the UI.

#### Roles (Clerk)

Source: `user.publicMetadata.roles`. Type: `src/lib/auth.tsx`.

`super_admin` · `ceo` · `finance` · `hr` · `manager` · `employee`

Priority for `primaryRole`: super_admin → ceo → finance → hr → manager → employee.

A **demo role switcher** (localStorage `alyson-demo-role`) can override effective roles in the UI. Super Admin is stripped from effective roles until the Super Admin PIN is unlocked.

#### Gate 1 — Clerk role (nav)

`AppShell` `roles?: AppRole[]`. Used by Brain, Onboarding, Handover, Scoring, Reports, Admin.

#### Gate 2 — Super-access (email + S3)

Used by **Leave, Payroll, Bonus, Equity, Workspace Activity, Meeting Hours**.

- UI: `SuperAccessGate` / `useSuperAccessNavVisible`
- Server: `requireSuperAccess`
- Default emails: `src/lib/super-access-constants.ts`
- Canonical store: `s3://alyson-hr-orgchart/super-access/rbac/access.json`  
  (`ALYSON_SUPER_ACCESS_RBAC_S3_*`)

#### Gate 3 — Module PIN (session)

Codes live in `src/lib/module-access-lock.ts` (do not copy them into chat/docs outside this repo).

| Module | Gate component | Storage |
|--------|----------------|---------|
| Super Admin role | `tryUnlockSuperAdmin` in `auth.tsx` | sessionStorage |
| Time Dashboard | `TimeDashboardGate` | sessionStorage |
| Payroll | `PayrollGate` | sessionStorage |

Payroll requires **Super-access + PIN**. Time Dashboard requires **scope + PIN**.

#### Gate 4 — Time Dashboard scope

Independent of Clerk role:

- Super-access emails + extra hours allowlist (`om.podey@cintara.ai`) → full company
- Org-chart managers → **direct reports only**
- Nav hidden if neither applies

Files: `time-dashboard-access-functions.ts`, `TimeDashboardRbacGate.tsx`.

#### Gate 5 — Meeting visibility

Used by live Notetaker, Meeting List, Calendar, Notes, Transcript, Analytics listing.

- Full-access emails see all meetings (`meeting-visibility-constants.ts`)
- Others: invited (Google attendees) or present (transcript speakers via roster / speaker-identity)

#### Gate 6 — Recall Calendar allowlist

Auto-schedule only for a small email set + `RECALL_CALENDAR_AUTO_SCHEDULE_EMAILS`. See [unified-meetings.md](#unified-meetings).

#### Gate 7 — Tasks backfill admin

`MEETING_TASKS_BACKFILL_ADMIN_EMAIL` for meeting-tasks backfill.

#### Weaker server RBAC (document honestly)

These UIs are role-gated in nav but some server fns do not re-check Super-access / Clerk role:

- Alyson Brain fetches
- Onboarding writes
- Handover CRUD
- Employee Scoring GET
- Cost Tracking (no Super-access)

Treat as “nav is the lock” unless you add server checks.

#### File map

| File | Role |
|------|------|
| `src/lib/auth.tsx` | Roles, demo override, PIN unlocks |
| `src/lib/module-access-lock.ts` | TD + Payroll PIN |
| `src/lib/super-access-constants.ts` | Default emails |
| `src/lib/super-access-rbac-functions.ts` | Server + hooks |
| `src/lib/super-access-rbac.server.ts` | S3 RBAC file |
| `src/components/SuperAccessGate.tsx` | UI gate |
| `src/components/SensitiveModuleLock.tsx` | Generic lock |
| `src/lib/meeting-visibility.server.ts` | Meeting ACL |
| `src/lib/time-dashboard-access.server.ts` | TD scope |

#### Related

[auth.md](#auth) · [app-shell.md](#app-shell) · [admin.md](#admin)

---
### Crons & HTTP APIs

#### Purpose

Most UI modules talk to TanStack `createServerFn` (not REST). `/api/*` exists for Vercel crons, webhooks, OAuth callbacks, and a few analytics JSON endpoints.

#### Auth patterns

| Pattern | Used by |
|---------|---------|
| Bearer `CRON_SECRET` / module-specific secret | Most crons |
| `assertDailyReportCronAuth` | Daily reports, scheduled-bot, recall-calendar-sync |
| Clerk session (server fn / some REST) | Analytics pages that also have REST twins |
| Svix signature | Recall calendar + transcript webhooks |

#### Cron routes

| Path | Purpose | Flag / secret |
|------|---------|----------------|
| `/api/cron/daily-reports` | Daily stakeholder email ZIP | `DAILY_REPORT_CRON_SECRET` |
| `/api/cron/time-doctor-token` | Refresh Time Doctor OAuth | cron secret |
| `/api/cron/leave-email-sync` | Gmail → leave inbox | also optionally from transcript cron |
| `/api/cron/notetaker-transcripts` | Persist bots, notes after idle, tasks, integrity, unified maintenance | `NOTETAKER_TRANSCRIPT_CRON_ENABLED`, `NOTETAKER_TRANSCRIPT_CRON_SECRET` |
| `/api/cron/notetaker-meeting-integrity` | Repair folder days / supersede dupes | `?repair=false` to dry-run |
| `/api/cron/scheduled-bot-activation` | Wake deferred bots near `join_at` | `SCHEDULED_BOT_ACTIVATION_CRON_ENABLED` |
| `/api/cron/recall-calendar-sync` | Unified meetings background sync | `recallCalendarSyncCronEnabled()` |
| `/api/cron/meeting-hours-report` | Email meeting-hours report | `MEETING_HOURS_REPORT_ENABLED` |
| `/api/cron/knowledge-graph-sync` | DeepSeek → Neo4j batch | `KNOWLEDGE_GRAPH_ENABLED` |

The transcript cron is the **hub**: persist, notes, tasks, sessions index, Recall media cleanup, unified maintenance, optional leave-email, integrity repair. It generates notes after idle but does **not** auto-send SES (duplicate-send was disabled).

#### Recall HTTP

| Path | Role |
|------|------|
| `/api/recall/calendar/connect` | Start Google OAuth |
| `/api/recall/calendar/callback` | Exchange code, register Recall Calendar V2 |
| `/api/recall/calendar/status` | GET connections; POST bootstrap / sync / disconnect |
| `/api/recall/webhooks/calendar` | Calendar V2 webhooks (Svix) |
| `/webhooks/recall` | Forwards transcript webhooks to Notetaker `{base}/webhooks/recall/transcript` |

#### Analytics REST

| Path | Module |
|------|--------|
| `/api/analytics/unified-meetings` | Unified Meetings list |
| `/api/analytics/unified-meetings/refresh` | Force DWD rescan |
| `/api/analytics/unified-meetings/:id/schedule` | Schedule one |
| `/api/analytics/unified-meetings/:id/unschedule` | Unschedule |
| `/api/analytics/unified-meetings/schedule-bots` | **410 disabled** |
| `/api/analytics/recall-cost` | Cost tracking JSON |
| `/api/analytics/workspace-activity` | Workspace Activity |
| `/api/analytics/workspace-activity/$userEmail` | WA detail |
| `/api/analytics/employee-scoring` | Scoring list |
| `/api/analytics/employee-scoring/$userEmail` | Scoring detail |

#### Local scripts (same jobs)

| Script | Job |
|--------|-----|
| `npm run cron:notetaker-transcripts` | Transcript cron |
| `npm run cron:notetaker-meeting-integrity` | Integrity |
| `npx tsx scripts/kg-sync.ts` | Knowledge graph sync |
| `npx tsx scripts/check-meeting-bot.ts` | Did a bot join? |
| `npx tsx scripts/diagnose-bot-transcripts.ts` | Single-bot diagnose |

#### File map

| Area | Location |
|------|----------|
| Cron routes | `src/routes/api/cron/*` |
| Analytics REST | `src/routes/api/analytics/*` |
| Recall OAuth / webhooks | `src/routes/api/recall/*`, `src/routes/webhooks/recall.ts` |
| Vercel schedule | project Vercel cron config (see [VERCEL_PRODUCTION.md](./VERCEL_PRODUCTION.md)) |

#### Related

[unified-meetings.md](#unified-meetings) · [alyson-notetaker.md](#alyson-notetaker-live) · [reports.md](#reports) · [leave.md](#leave) · [knowledge-graph.md](#knowledge-graph)

---
### Landing & marketing

#### Purpose

Public marketing site in the same TanStack Start app. Unsigned users can browse these paths without hitting `/auth`. Signed-in users hitting `/` are redirected to `/app`.

#### Routes

| Path | File | Page |
|------|------|------|
| `/` | `src/routes/index.tsx` | Home (hero, modules, FAQ, CTA) |
| `/about` | `src/routes/about.tsx` | About |
| `/features` | `src/routes/features.tsx` | Features |
| `/how-it-works` | `src/routes/how-it-works.tsx` | How it works |
| `/modules` | `src/routes/modules.tsx` | Module catalog |
| `/faq` | `src/routes/faq.tsx` | FAQ |
| `/careers` | `src/routes/careers.tsx` | Careers |
| `/contact` | `src/routes/contact.tsx` | Contact |
| `/voices` | `src/routes/voices.tsx` | Voices / testimonials |
| `/privacy` | `src/routes/privacy.tsx` | Privacy |
| `/cookies` | `src/routes/cookies.tsx` | Cookies |
| `/terms` | `src/routes/terms.tsx` | Terms |

Gate logic: `src/routes/__root.tsx`.

#### Access

Public. No Clerk session required.

#### Data sources

Static marketing copy + landing components. No HR ledgers.

#### Behaviors

Shared chrome: `LandingPageLayout`, `LandingNavbar`, `LandingFooter`. Home composes hero, logo cloud, features, compare, module snapshots, org-chart teaser, testimonials, FAQ, final CTA.

#### File map

| File | Role |
|------|------|
| `src/components/landing/*` | Marketing sections |
| `src/components/landing/LandingPageLayout.tsx` | Layout |
| `src/components/landing/LandingDocPage.tsx` | Legal/doc pages |
| `src/components/AlysonLogo.tsx` | Logo |

#### Related

[auth.md](#auth) · [help.md](#help) · [dashboard.md](#dashboard)

