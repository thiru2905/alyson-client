# Employee Onboarding — Claude Build Spec

Paste this into Cursor/Claude to rebuild Alyson’s **Employee Onboarding** ledger. This is the **canonical HR profile roster** that Bonus and Payroll sync from.

**Related:** `docs/claude.md` (index) · Org chart (identity fields) · Bonus · Payroll. Legacy `/boarding` redirects here.

---

## 0. What this module is

Spreadsheet-style production roster of employees with PII, compensation, equity, bank, access, and employment status — stored as a versioned JSON document on S3 with a JSONL audit log.

It is **not** a PDF checklist. Older Boarding UI is deprecated.

| Route | Behavior |
|-------|----------|
| `/employee-onboarding` | Live roster editor |
| `/boarding` | `beforeLoad` redirect → `/employee-onboarding` |

---

## 1. Routes & files

| Piece | File |
|-------|------|
| Page | `src/routes/employee-onboarding.tsx` |
| Server fns | `src/lib/onboarding-functions.ts` |
| S3 | `src/lib/onboarding-s3.server.ts` |
| Schema | `src/lib/onboarding-schema.ts` |
| CSV parse/serialize | `src/lib/onboarding-csv.ts` |
| Audit diffs | `src/lib/onboarding-audit.ts` |
| Bundled seed | `src/lib/bundled-data.ts` + `src/data/onboarding-roster.csv` |
| Table UI | `src/components/BoardingDataTable.tsx` |
| Form drawer | `src/components/OnboardingEmployeeFormDrawer.tsx` |
| Nav | People → Employee Onboarding (`super_admin`, `ceo`, `hr`) |

Ignore leftover PDF boarding stack (`boarding-spec.ts`, etc.) unless you need migration.

---

## 2. S3 objects

Bucket: `ALYSON_HR_ORGCHART_S3_BUCKET` || `alyson-hr-orgchart`

```
onboarding/data.json              # { version: 1, updatedAt, rows[] }
onboarding/operations.log.jsonl   # audit trail
```

Env overrides:

- `ALYSON_HR_ONBOARDING_S3_KEY`
- `ALYSON_HR_ONBOARDING_LOG_S3_KEY`

**Bootstrap:** if object missing/empty → seed from `BUNDLED_ONBOARDING_ROSTER_CSV`.

**Write pattern:** every save replaces the **entire** `data.json` (last-write-wins, typically no ETag). Log append = read JSONL + rewrite.

---

## 3. Schema (keep names stable)

```ts
ONBOARDING_COLUMNS = [
  "Employee ID",
  "Name",
  "Location",
  "Personal Email",
  "Official Email",
  "Team",
  "Manager",
  "Employment Status",
  "Last Woking Date", // historical typo — preserve unless migrating all consumers
  "Contact Phone Number",
  "Emergency Contact Phone Number",
  "Job Title",
  "Employment Type",
  "HR",
  "Shared",
  "Age",
  "DOB",
  "National ID Number",
  "Home Address",
  "Permanent Address",
  "Bank Account Information",
  "Base Salary",
  "Benefits",
  "Gender",
  "Shares/Equity",
  "Shares Awarded Date",
  "Company Property",
  "Access",
]

type OnboardingRow = Record<OnboardingColumn, string> & { _rowId: string }

type OnboardingDataFile = {
  version: 1
  updatedAt: string
  rows: OnboardingRow[]
}

type OnboardingLogEntry = {
  ts: string
  op: "create" | "update" | "delete" | "bulk_replace" | "bootstrap" | ...
  actor?: string
  employeeId?: string
  changes?: ...
}
```

Employee IDs: `onb_{slug}_{timestamp36}` via `generateOnboardingEmployeeId`.

---

## 4. Server functions

| Fn | Purpose |
|----|---------|
| `getOnboardingRoster` | Load (+ auto-seed) |
| `saveOnboardingRoster` | Full replace + log (`op` distinguishes create/update/bulk) |
| `addOnboardingUser` | Server helper to append one row |
| `deleteOnboardingUser` | Remove by employee id |
| `syncOnboardingOrgChartFields` | Merge Location/Team/Manager/Employment Status from seed CSV |

Match keys for org sync: **Employee ID** first, else **Official Email**.

---

## 5. User flows

1. Open page → `getOnboardingRoster`
2. Facet filters: Location / Team / Employment Status
3. CSV export of **filtered** view
4. **Add** (super_admin): blank row in drawer → save `op: "create"`
5. **Edit**: drawer → `op: "update"`; audit field diffs
6. **Delete**: confirm → `deleteOnboardingUser`; rollback local rows on failure
7. **Sync org chart fields**: merge from bundled seed → `bulk_replace`
8. Keep `rowsDirty` so refetch does not clobber in-flight local edits

Drawer sections: Identity, Employment, Personal, Addresses, Compensation, Other.

---

## 6. Auth

| Action | Who |
|--------|-----|
| Nav | `super_admin`, `ceo`, `hr` |
| View | Those roles (and anyone who can open the route) |
| Add / edit / delete / sync | UI: **`super_admin` only** |

**Rebuild improvement:** enforce the same checks in server fns (Alyson historically trusted the UI).

---

## 7. Downstream consumers (contracts)

| Consumer | Fields used |
|----------|-------------|
| **Bonus** | Employee id, name, emails, location, team → ledger shells; `active` if still present |
| **Payroll** | Base Salary, Benefits, Employment Status, Location/Team (cycle), Official Email |
| **Org roster lookup** | Location, Team, Manager, Official Email |

If you change column names or ID format, update Bonus + Payroll in the same PR.

---

## 8. Env

```bash
ALYSON_HR_ORGCHART_S3_BUCKET=alyson-hr-orgchart
ALYSON_HR_ONBOARDING_S3_KEY=onboarding/data.json
ALYSON_HR_ONBOARDING_LOG_S3_KEY=onboarding/operations.log.jsonl
AWS_REGION=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

No onboarding cron. No Google Sheets live sync in production path (CSV is bundled/seed).

---

## 9. Gotchas

1. Full-document replace — concurrent editors overwrite each other
2. Contains sensitive PII — treat as production ledger (access logs, encryption at rest)
3. Preserve `Last Woking Date` spelling unless you migrate
4. “Sync org chart fields” uses **seed CSV**, not live Org Chart S3 edges (improve if rebuilding)
5. No in-app audit viewer — only JSONL on S3

---

## 10. Build checklist

- [ ] Column schema + blank row + ID generator
- [ ] S3 ensure/bootstrap from CSV
- [ ] get/save/delete server fns + JSONL audit diffs
- [ ] Table + facet filters + CSV export
- [ ] Add/Edit drawer
- [ ] Org-field sync
- [ ] Server-side role checks
- [ ] Wire `ensureOnboardingOnS3` for Bonus + Payroll

---

## 11. Implementation prompt

> Implement Employee Onboarding per `docs/employee-onboarding/claude.md`. S3 ledger `onboarding/data.json` + JSONL audit, bootstrap from CSV, full-document saves, super_admin mutations, and stable column names including `Last Woking Date`. Expose `ensureOnboardingOnS3()` for Bonus and Payroll.
