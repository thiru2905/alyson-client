# Leave (Calendar + Ledger + Email) — Claude Build Spec

Paste this into Cursor/Claude to rebuild Alyson’s **Leave** system: employee ledgers, team leave, month calendar, analytics, audit, and Gmail→LLM inbox.

**Related:** `docs/claude.md` (index) · **`docs/pacing/claude.md`** (leave hour credit math — must match) · Time Doctor roster · Org chart location/team · Employee Scoring.

---

## 0. What this module is

Production leave subsystem:

1. Per-employee leave ledgers (S3)
2. Team-wide leave blocks (location ± team)
3. Month **calendar** UI
4. Analytics + append-only audit
5. Optional **Gmail DWD + LLM** pipeline that extracts leave and auto-applies

Leave credits Time Dashboard pacing: **+8h** per full leave weekday, **+4h** half-day. Lifetime cap: **10 days** across all types.

---

## 1. Routes & files

| Path | Purpose |
|------|---------|
| `/leave` (layout) | `src/routes/leave/route.tsx` + `SuperAccessGate` |
| `/leave` | Employee ledgers |
| `/leave/calendar` | Month calendar |
| `/leave/email-inbox` | Extraction queue |
| `/leave/analytics` | Year analytics |
| `/leave/audit` | Ops log |
| `/api/cron/leave-email-sync` | Cron |

| Lib | Role |
|-----|------|
| `leave-schema.ts` | Types, lifetime limit, weekday union |
| `leave-s3.server.ts` | Snapshot + ops log |
| `leave-ledger-functions.ts` | Public server fns |
| `leave-roster.server.ts` | TD roster + org enrichment |
| `leave-calendar.ts` | Merge → calendar events |
| `leave-analytics.ts` | Year report |
| `leave-email-*.ts` | Gmail, extract, match, queue, sync |
| `weekly-pacing-leave.server.ts` | Pacing consumer |

UI: `LeaveCalendarView`, `LeaveTeamLeavePanel`, `LeaveEmployeeLedgerDrawer`.

**Ignore:** legacy `leave-functions.ts` / Supabase `leave_requests` for this UI.

Nav: People → Leave (`superAccess: true`).

---

## 2. S3 objects

Bucket typically hardcoded as orgchart bucket in leave-s3:

```
leave/data.json
leave/operations.log.jsonl
leave/email-queue.json
leave/email-processed.jsonl
leave/email-sync-state.json
```

```ts
LeaveDataFile = {
  version: 1
  employees: EmployeeLeaveLedger[]
  teamLeaves?: TeamLeaveEvent[]
  syncedFromOnboardingAt?: string
  updatedAt: string
}
```

---

## 3. Core models

```ts
LeaveType = "annual" | "sick" | "personal" | "unpaid" | "other"

LeaveRecordEvent = {
  id, type, start, end, days, halfDay?: boolean, note?, actor?, timestamps...
}

EmployeeLeaveLedger = {
  tdUserId, name, email, title?, team, location, active, leaveEvents: LeaveRecordEvent[]
}

TeamLeaveEvent = {
  id, location, team, // team may be "__all_teams__" = whole location
  start, end, days, note?, ...
}

LeaveCalendarEvent = { kind: "team" | "personal", timing: "upcoming" | "active" | "past", ... }
```

Email queue statuses: `pending | approved | rejected | unmatched | duplicate | not_leave | extraction_failed`.

---

## 4. Day-count rules (MUST match pacing)

Copy these exactly — Scoring and Payroll hours depend on them.

1. Count **Monday–Friday only** (parse dates at mid-day UTC to avoid DST flips)
2. Weekends never count
3. Half-day → `days = 0.5` → **+4h** credit
4. Full day → `days = 1` → **+8h** credit
5. Same calendar day personal ∪ team: take **max** fraction (never double-count)
6. Lifetime sum of days ≤ **10** unless `allowOverLimit`

Pacing consumer:

```
leaveDays        = union of weekday fractions in range
leaveHoursCredit = leaveDays × 8
```

Team leave is **not** copied onto every personal ledger. At read time, pacing matches employee `location` + `team` to team blocks.

See `docs/pacing/claude.md` for weekly/monthly projection (separate from leave storage).

---

## 5. Server functions

**Ledger (all Super-access):**

- `getLeaveLedger`, `syncLeaveWithTimeDoctor`
- `recordLeave`, `voidLeave`
- `recordTeamLeave`, `voidTeamLeave`
- `getLeaveAnalytics`, `getLeaveAuditLog`

**Email:**

- `getLeaveEmailInbox`, `scanLeaveEmailInbox`, `syncLeaveEmailInbox`, `backfillLeaveEmailInbox`
- `retryLeaveEmailExtraction`, `retryAllFailedLeaveEmailExtractions`
- approve/reject/archive when `LEAVE_EMAIL_HR_REVIEW_ENABLED=true`

**Cron:** `GET|POST /api/cron/leave-email-sync` → e.g. `runLeaveEmailSync({ lookbackDays: 14, maxMessages: 40 })`.

---

## 6. User flows

### Employees (`/leave`)

1. `getLeaveLedger` → `ensureLeaveOnS3` (TD roster + pacing active flags)
2. Search/filter; open drawer
3. Record/void personal leave (half-day supported)
4. Team leave panel create/void
5. Manual Sync → `syncLeaveWithTimeDoctor`
6. Invalidate React Query keys for leave + pacing

### Calendar (`/leave/calendar`)

1. Build events from teamLeaves + ledgers
2. Month nav; chips: team=sky, personal=amber, over-limit=red
3. Day detail lists; inline team leave form

### Email inbox

1. Cron or UI scan Gmail via DWD
2. LLM extracts structured leave JSON
3. Match to employee; detect overlap/duplicate
4. Auto-append (default) or HR review queue
5. Retry failed extractions

### Analytics / Audit

- Year charts + per-employee table
- Last ~300 JSONL ops; full payload for privileged viewers

---

## 7. Auth

- Layout: `<SuperAccessGate>`
- Mutations: `requireSuperAccess(clerkToken, emailHint)`
- Client: `useSuperAccessAuth()` on every call

Older docs saying Clerk `hr` alone are **stale**.

---

## 8. Env

```bash
AWS_REGION=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
# Email pipeline
LEAVE_EMAIL_MAILBOX=people-ops@yourdomain.com
LEAVE_EMAIL_SYNC_ENABLED=true
LEAVE_EMAIL_HR_REVIEW_ENABLED=false
LEAVE_EMAIL_BACKFILL_MONTHS=24
LEAVE_EMAIL_GMAIL_USER=...   # or GOOGLE_WORKSPACE_ADMIN_SUBJECT_EMAIL
LEAVE_EMAIL_IMPERSONATE_MAILBOX=false
GOOGLE_DWD_SERVICE_ACCOUNT_JSON=...
DEEPSEEK_API_KEY=...   # and/or GROQ_API_KEY
# Time Doctor for roster sync
```

---

## 9. Gotchas

1. Leave S3 keys may be hardcoded — unlike Bonus env overrides
2. JSONL “append” is read-modify-write
3. No ETag concurrency control
4. Mailbox may be a Google Group — DWD impersonates a real user, then filters
5. Team leave matching must stay consistent with pacing
6. Invalidate pacing query keys after leave mutations

---

## 10. Build checklist

- [ ] Schema + weekday union + lifetime cap
- [ ] S3 ledger + team leave + audit log
- [ ] TD roster sync + org location/team enrichment
- [ ] Calendar builder + UI
- [ ] Ledger + team leave CRUD under Super-access
- [ ] Optional Gmail+LLM inbox + cron
- [ ] Wire `loadPacingLeaveContext` / weekly-pacing-leave consumer
- [ ] Analytics + audit pages

---

## 11. Implementation prompt

> Implement Leave per `docs/leave/claude.md`. S3 ledgers + team leave, calendar UI, Super-access everywhere, Mon–Fri day math with half-days, lifetime 10 days, +8h/+4h pacing credit matching `docs/pacing/claude.md`. Optional Gmail DWD + LLM auto-apply with cron.
