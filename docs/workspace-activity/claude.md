# Workspace Activity — Claude Build Spec

Paste this into Cursor/Claude to rebuild Alyson’s **Google Workspace Activity** analytics (list + per-user detail).

**Related:** `docs/claude.md` (index) · Google DWD · **Employee Scoring** (consumes this) · Alyson Brain / daily reports.

---

## 0. What this module is

For a custom datetime window, rank each Workspace user on:

- Emails sent
- Meetings (prefer **attended/scheduled via Calendar API**, not only audit creates)
- Google Docs created
- Chat messages sent

Plus drill-down with content enrichment and Groq per-item insights.

**Metrics are computed live** (memory cache) — not stored as an S3 ledger.

---

## 1. Routes & files

| Path | File |
|------|------|
| `/workspace-activity` | List |
| `/workspace-activity/$userEmail` | Detail (`?start&end`) |
| `/api/analytics/workspace-activity` | REST twin (harden auth!) |
| `/api/analytics/workspace-activity/$userEmail` | REST twin |

| Lib | Role |
|-----|------|
| `workspace-activity-functions.ts` | Server fns + Zod + Super-access |
| `workspace-activity.server.ts` | Directory + Reports aggregation |
| `workspace-activity-content.server.ts` | Gmail/Drive/Docs/Chat enrichment |
| `workspace-activity-insight.server.ts` | Groq item summary |
| `workspace-activity-types.ts` | Client-safe types |
| `workspace-activity-range.ts` | Datetime helpers |
| `workspace-activity-session.ts` | localStorage session + snapshots |
| `workspace-activity-pdf.ts` | PDF export |
| `google-reports-activities.ts` | activities.list shim |
| `WorkspaceActivityRangePicker.tsx` | Range UI |
| `WorkspaceActivityCharts.tsx` | Lazy charts |

Nav: Ops → Workspace Activity (`superAccess: true`).

---

## 2. Data sources

1. Google Admin **Directory** — all users (`my_customer`)
2. Google Admin **Reports** audit — gmail / calendar / drive / chat
3. Per-user **DWD** — Calendar, Gmail, Drive, Docs, Chat (detail)
4. **Groq** — item insights (`GROQ_API_KEY`)

Shared DWD env:

```bash
GOOGLE_DWD_SERVICE_ACCOUNT_JSON=...   # or GOOGLE_APPLICATION_CREDENTIALS
GOOGLE_WORKSPACE_ADMIN_SUBJECT_EMAIL=admin@yourdomain.com
GOOGLE_WORKSPACE_DOMAIN=yourdomain.com
WORKSPACE_ACTIVITY_TIMEOUT_MS=90000
WORKSPACE_ACTIVITY_ACCURATE_MEETINGS=1  # optional global force
GROQ_API_KEY=...
```

---

## 3. Metric definitions

| Metric | Rule |
|--------|------|
| Emails | Outbound SMTP delivery (`isOutboundSmtpDelivery`) |
| Docs | Google Docs create events |
| Chat | `message_posted` |
| Meetings (default audit) | `create_event` — **undercounts “attended”** |
| Meetings (**accurate**) | Calendar `events.list` per user — **use this for UI + Scoring** |

Always pass `accurateMeetings: true` from the main UI and from Employee Scoring.

---

## 4. Models

```ts
WorkspaceActivityRow = {
  userEmail: string
  emailsSent: number
  meetingsCreated: number
  docsCreated: number
  chatMessagesSent: number
}

WorkspaceActivityResponse = {
  range: { start, end }
  generatedAt: string
  usersProcessed: number
  rows: WorkspaceActivityRow[]
  warnings: string[]
}

WorkspaceActivityItem = { at, kind, title, preview?, category?, source?, meta?, ... }

WorkspaceUserActivityDetail = {
  emails[], chats[], docs[], meetings[]
  stats, focusHints
  *Enriched flags
  warnings[]
}
```

---

## 5. Server functions (Super-access POST)

| Fn | Purpose |
|----|---------|
| `getWorkspaceActivity` | Aggregated list |
| `getWorkspaceUserActivityDetail` | Per-user items + enrichment |
| `getWorkspaceActivityItemInsight` | Groq one-item summary |
| `getWorkspaceActivityEmailBody` | Full Gmail body/thread |

Internal exports used by Scoring/Brain:

- `runGetWorkspaceActivity`
- `fetchWorkspaceUserActivityDetailImpl`

---

## 6. Performance design

- In-memory Map cache ~**5 minutes**
- Hard timeout (default **90s**)
- Audit pagination caps (~40 pages/app)
- Detail item caps (~50 per kind)
- Accurate Calendar concurrency ~**16** — large orgs can time out

Use `heavyReportQueryOptions` on the client (long `staleTime`, no refetch-on-focus spam). Persist session via `workspace-activity-session.ts` + `report-snapshot-store.ts`.

---

## 7. User flows

### List

1. `SuperAccessGate`
2. Hydrate session / URL `?start&end`
3. Draft vs applied range; presets 1/7/30/45/90 days
4. `getWorkspaceActivity` with `accurateMeetings: true`
5. Search/sort; rank medals; lazy charts
6. CSV / PDF export; refresh
7. Row click → detail route with same range

### Detail

1. `getWorkspaceUserActivityDetail`
2. Tabs: overview | emails | chat | docs | meetings
3. Sparkles → item insight
4. Open email → `getWorkspaceActivityEmailBody` (fallback to preview)

---

## 8. Auth

- UI + server fns: **Super-access**
- REST `/api/analytics/workspace-activity*` in Alyson is historically **ungated** — **require auth** when rebuilding

---

## 9. Consumers

- Employee Scoring (`accurateMeetings: true`)
- Alyson Brain context
- Daily stakeholder reports
- Hourly activity reports

---

## 10. Gotchas

1. Audit meetings ≠ attended — always offer accurate mode
2. Accurate mode is slow; expect timeouts without caching
3. Gmail/Chat bodies need extra DWD scopes; otherwise preview-only warnings
4. Module docs that say “Clerk roles only” are wrong for live code (Super-access)

---

## 11. Build checklist

- [ ] DWD JWT helper + Directory listing
- [ ] Reports aggregation for 4 metrics
- [ ] Accurate Calendar meetings path
- [ ] List UI + Super-access + range picker + export
- [ ] Detail enrichment + insight + email body
- [ ] Memory cache + timeout + caps
- [ ] Session/snapshot persistence
- [ ] Lock down REST twins
- [ ] Export `runGetWorkspaceActivity` for Scoring

---

## 12. Implementation prompt

> Implement Workspace Activity per `docs/workspace-activity/claude.md`. Google Admin Directory + Reports + DWD enrichment, Super-access on all sensitive fns, `accurateMeetings` Calendar path for fair meeting counts, list+detail UI with Groq insights. Cache aggressively; secure any REST twins. Export aggregation helpers for Employee Scoring.
