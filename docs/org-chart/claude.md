# Org Chart (Team) — Claude Build Spec

Paste this into Cursor/Claude to rebuild Alyson’s **Team directory + Org chart** exactly. This is the people graph other HR modules enrich from (location, team, manager).

**Related:** `docs/claude.md` (index) · `orgchart.md` · Onboarding consumes roster fields · Leave/Payroll use location+team.

---

## 0. What this module is

Org chart is **not** its own top-level route. It lives inside **Team** (`/team`) as a view toggle:

| View | Purpose |
|------|---------|
| **Directory** | Searchable employee cards (dept filter) |
| **Org chart** | React Flow reporting graph (drag, rewire, terminate, add dummy) |

Production graph state is split across **S3 objects** and merged into one snapshot. Browser keeps an optimistic `localStorage` cache.

---

## 1. Routes & files

| Path / piece | File |
|--------------|------|
| `/team` | `src/routes/team.tsx` |
| Chart UI (lazy) | `src/components/OrgChart.tsx` |
| Server fns | `src/lib/orgchart-functions.ts` |
| S3 IO | `src/lib/orgchart-s3.server.ts` |
| CSV roster map | `src/lib/org-chart-roster.ts` |
| Server roster lookup | `src/lib/org-chart-roster.server.ts` |
| Directory data | `src/lib/queries.ts` → `fetchOverview` |
| HR overview sync | `src/lib/hr-s3-overview-functions.ts` |
| Seed CSVs | `src/data/org-chart-roster.csv`, `src/data/onboarding-roster.csv` |
| Nav | `AppShell` → People → Team (all signed-in) |

Marketing-only visual (ignore for HR rebuild): `src/components/landing/LandingOrgChart.tsx`.

---

## 2. S3 layout (do not flatten into one file blindly)

Bucket: `ALYSON_HR_ORGCHART_S3_BUCKET` || `alyson-hr-orgchart`

```
main/state.json              # positions + managerOverrides
roster/overview.json         # written from Team persist
terminations/index.json
additions/index.json         # dummy / manually added people
logs/index.json
logs/by-date/YYYY-MM-DD/<eventId>.json
```

**Read path:** merge the four logical slices → `OrgChartSnapshot`.  
**Write path:** partial prefix updates + mandatory audit event.  
**Reset:** wipe draft slices (`main`, terminations, additions) but **keep** `logs/by-date/**` for forensics.

---

## 3. Data sources for directory employees

`fetchOverview` resolves in this order (simplified):

1. Configured HR overview source (`VITE_HR_OVERVIEW_SOURCE`)
2. Supabase **or** S3 `ALYSON_HR_S3_BUCKET` / `ALYSON_HR_S3_KEY` (defaults often `alyson-hr-dummy-datas` / `alyson-hr/overview.json`)
3. RevCloud / bundled seed fallback

Chart nodes = overview employees ⊕ S3 additions − terminations, with positions + manager overrides applied.

---

## 4. Core types

```ts
EmployeeFull // directory + chart identity (id, name, email, dept, title, ...)

OrgChartSnapshot = {
  positions: Record<id, { x, y }>
  managerOverrides: Record<reportId, managerId | null>
  terminated: OrgChartTerminationRecord[]
  added: EmployeeFull[]           // includes dummy-* people
  events: OrgChartAuditEvent[]
}

OrgChartAuditEvent.kind =
  | "manager_change"
  | "terminate"
  | "add_person"
  | "positions_saved"
  | "reset"
  | "publish"
```

Dummy people:

- id: `dummy-<uuid>`
- email: `*@dummy.local`

---

## 5. Server functions to implement

| Fn | Method | Behavior |
|----|--------|----------|
| `getOrgChartFromS3` | GET | Merge prefixes → snapshot |
| `applyOrgChartEvent` | POST | Apply one mutation + write affected prefixes + log |
| `putOrgChartToS3` | POST | Replace graph slices |
| `resetOrgChartOnS3` | POST | Clear draft slices + `reset` event |
| `persistOrgChartRosterToS3` | POST | Write `roster/overview.json` from current employees |

Also used from Team: `syncHrOverviewToS3` (different bucket — HR overview plane).

---

## 6. User flows (implement in this order)

### 6.1 Directory

1. Load `/team` with React Query overview
2. Search + department filter
3. Open employee drawer / (super_admin) create user drawer
4. On load, fire `persistOrgChartRosterToS3({ employees, source })`

### 6.2 Chart hydrate

1. Toggle view → `chart`
2. Lazy-load `OrgChart`
3. Read `localStorage` `alyson-orgchart-layout-v2`
4. Fetch S3 snapshot and **merge over** local cache
5. Render React Flow nodes/edges (edge = manager → report)

### 6.3 Edit mode (super_admin only)

1. Enter Edit
2. Drag nodes → update positions
3. Connect/break edges → manager overrides
4. Add person (dummy) → additions index
5. Terminate → type-to-confirm → mark terminated + **reparent** direct reports
6. Each change → `applyOrgChartEvent` (optimistic UI; on failure, node should “snap back”)

### 6.4 Toolbar

- Save layout → `positions_saved`
- Publish → `publish`
- Reset → confirm → `resetOrgChartOnS3`

---

## 7. Auth

| Action | Who |
|--------|-----|
| View directory/chart | Any signed-in user |
| Edit graph / sync / create user | UI: `super_admin` |

**Rebuild improvement:** re-check Clerk role (or Super-access) inside orgchart server fns — Alyson historically gated only in the UI.

---

## 8. Downstream contracts

Other modules read **location / team / manager** via:

- `getOrgChartRosterLookup()` (bundled CSV ⊕ onboarding CSV patterns)
- `roster/overview.json` when available

Consumers: Time Dashboard manager scope, Leave enrichment, Payroll India supplements.

**Known gap:** Onboarding “Sync org chart fields” currently merges from **bundled seed CSV**, not live React Flow edges. If rebuilding cleanly, sync from S3 snapshot / roster overview instead.

---

## 9. Env & scripts

```bash
ALYSON_HR_ORGCHART_S3_BUCKET=alyson-hr-orgchart
AWS_REGION=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
# Directory overview (separate plane)
ALYSON_HR_S3_BUCKET=...
ALYSON_HR_S3_KEY=...
VITE_HR_OVERVIEW_SOURCE=...
```

Scripts: `npm run inspect:orgchart`, `npm run export:org-roster`. No org-chart cron.

---

## 10. UI structure

- `TeamPage`: header, search, dept select, Directory|Chart toggle, card grid
- `OrgChart`: React Flow canvas, sync status pill, edit toolbar, AddPersonModal, TerminateConfirmModal, history panel
- Drawers: `EmployeeDrawer`, `CreateUserDrawer`

---

## 11. Gotchas

1. Split S3 + merge reader — don’t store only one JSON unless you migrate deliberately
2. localStorage can diverge if S3 write fails
3. Hard-coded manager shortcuts/overrides may exist in `org-chart-roster.ts` — treat as data, not magic forever
4. Create-user path may still touch legacy Supabase `user_roles` / `employees`
5. Persisting roster on every Team load can spam S3 — debounce if rebuilding

---

## 12. Build checklist

- [ ] `/team` directory with overview fetch
- [ ] React Flow org chart with manager edges
- [ ] Split S3 layout + merge + audit events
- [ ] localStorage hydrate + reconcile
- [ ] Edit: drag, rewire, add dummy, terminate+reparent
- [ ] Save / publish / reset
- [ ] `roster/overview.json` persist
- [ ] Server-side auth on mutations
- [ ] Document roster lookup for Leave/Payroll

---

## 13. Implementation prompt

> Implement Alyson Team + Org Chart per `docs/org-chart/claude.md`. Use React Flow, split S3 prefixes under `alyson-hr-orgchart`, localStorage cache key `alyson-orgchart-layout-v2`, and audit every mutation. Super-admin edit only; harden server auth. Expose a roster lookup (location/team/manager) for Leave and Payroll.
