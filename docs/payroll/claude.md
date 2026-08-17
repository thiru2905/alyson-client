# Payroll — Claude Build Spec

Paste this into Cursor/Claude to rebuild Alyson’s **S3 Payroll board** (India/Pakistan cycles, FX, Time Doctor hours, Bonus, paid flags, snapshots).

**Related:** `docs/claude.md` (index) · Onboarding · Bonus · Leave/pacing · Time Doctor.  
**Do not** rebuild against legacy Supabase `payroll_runs` — that is a separate/demo path.

---

## 0. What this module is

Operations compensation board:

- Builds a **live monthly report** from Onboarding ⊕ org CSV ⊕ Time Doctor ⊕ Leave credit ⊕ Bonus
- Supports two pay cycles (India 15th–15th, Pakistan month-end)
- Stores overrides, FX, and paid flags on S3
- Freezes past months into **snapshots**
- Tabs: Board / Payment log / Analytics
- Dual gate: **Super-access + PIN**

---

## 1. Routes & files

| Path | File |
|------|------|
| Layout | `src/routes/payroll/route.tsx` |
| `/payroll` | `payroll/index.tsx` — board |
| `/payroll/log` | `payroll/log.tsx` |
| `/payroll/analytics` | `payroll/analytics.tsx` |

| Lib | Role |
|-----|------|
| `payroll-functions.ts` | Server fns (all POST + Clerk token) |
| `payroll-s3.server.ts` | data.json, log, snapshots |
| `payroll-report.server.ts` | Live report + snapshot read/backfill |
| `payroll-schema.ts` | Types, eligibility, currency |
| `payroll-period.ts` | `resolvePayPeriod` |
| `payroll-pacing.server.ts` | TD hours for pay window |
| `payroll-roster.server.ts` | Onboarding ⊕ India org CSV |
| `payroll-analytics.ts` | Aggregations |
| `payroll-rbac.server.ts` | `requireSuperAccess` |
| `payroll-rbac-hooks.ts` | Client auth payload |
| `module-access-lock.ts` | PIN / session unlock |
| `PayrollGate.tsx` | Unlock UI |
| `PayrollEmployeeDrawer.tsx` | Edit / mark paid |

Nav: Money → Payroll (`superAccess: true`).

---

## 2. Pay cycles (do not invent)

| Cycle id | Who | Period window |
|----------|-----|---------------|
| `india_15th` | India markers (e.g. Pune) | **Prior month 15th → pay-month 15th** |
| `pakistan_month_end` | Pakistan markers (e.g. Lahore) | **Calendar month** → month-end |

Assignment is **string-marker based** (prefer **team** markers, then **location**). Keep deterministic.

Local currencies: `INR` | `PKR`.  
Period FX fields: `usdToInrRate`, `usdToPkrRate`, `rateAsOf`.  
Historical defaults often ~`84` / ~`278` — make configurable.

---

## 3. S3 objects

```
payroll/data.json                 # employees overrides, periods FX, paid map
payroll/operations.log.jsonl
payroll/snapshots/YYYY-MM.json    # frozen reports for past months
```

Env:

- `ALYSON_HR_PAYROLL_S3_KEY`
- `ALYSON_HR_PAYROLL_LOG_S3_KEY`
- `ALYSON_HR_PAYROLL_SNAPSHOT_S3_PREFIX`

```ts
PayrollDataFile = {
  version: 1
  employees: Record<employeeId, PayrollEmployeeOverrides>
  periods: Record<YYYY-MM, PayrollPeriodSettings>
  paid: Record<`${employeeId}:${payMonth}:${payCycle}`, PayrollPaidRecord>
}
```

Paid key format is part of the contract — don’t change casually.

---

## 4. Live report pipeline

```
ensureOnboardingOnS3()
  ⊕ India-only org CSV supplements (payroll-roster)
  → isPayrollEligibleEmployee (status + hard exclusions)
  → assign payCycle + localCurrency from location/team
  → resolvePayPeriod(payMonth, cycle) → [startDay, endDay]
  → TD hours for window (+ leave credit via pacing helpers)
  → Bonus cash in period from ensureBonusOnS3()
  → Apply overrides (local salary/benefits/credits)
  → Compute totals (USD + local via FX)
  → Attach paid flags
```

**TD-adjusted salary concept:**

```
salaryAccordingToTdHours ≈ base × min(percentCompleted, 100)
```

### Snapshots

- Past months: read `payroll/snapshots/YYYY-MM.json` if present
- If missing: compute live once → `savePayrollMonthSnapshot`
- Client may call `backfillPayrollSnapshotsFn` once (`staleTime: Infinity`)

Mark/unmark paid should update live data and merge into snapshot when relevant.

---

## 5. Server functions (all Super-access)

| Fn | Purpose |
|----|---------|
| `getPayrollReport` | Board rows |
| `getPayrollAnalytics` | Charts |
| `updatePayrollEmployee` | Overrides |
| `updatePayrollPeriodFx` | FX for month |
| `markPayrollPaid` / `unmarkPayrollPaid` | Paid + log |
| `getPayrollMeta` | Bucket/key metadata |
| `getPayrollLog` | Audit tail (~800) |
| `backfillPayrollSnapshotsFn` | Fill past N months |

Every call: `clerkToken` (+ optional `emailHint`) → `requirePayrollAccess` (= `requireSuperAccess`).

---

## 6. Auth (both layers required)

1. **Super-access** — email allowlist + S3 RBAC (`super-access/rbac/access.json`)
2. **PIN** — `PayrollGate` / `canAccessPayroll` / session key (e.g. `alyson-payroll-unlocked`) via `module-access-lock.ts`

UI shows Access denied if Super-access fails; PIN gate wraps the board after that.

---

## 7. UI flows

1. Enter `/payroll` → Super-access → PIN
2. Pick month, cycle filter, active-only toggle
3. Edit FX rates for the month
4. Open drawer: salary/benefits/credits; mark paid
5. CSV export of filtered board
6. Log tab — operations table
7. Analytics — team/location/cycle/paid charts (Recharts)

India vs Pakistan often rendered as separate tables on the board.

---

## 8. Dependencies

| Module | Use |
|--------|-----|
| Employee Onboarding | Roster + base salary/benefits/status |
| Org chart CSV | Supplement missing India workers |
| Bonus S3 | Period bonus + `active` enrichment |
| Time Doctor + Leave/pacing | Hours / leave credit / required hours |
| Super-access | Gate |

---

## 9. Gotchas

1. Dashboard “recent payroll” may still read Supabase — ignore for this module
2. `active` frequently comes from **bonus ledger**, not onboarding alone
3. Hardcoded excluded emails/names in `isPayrollEligibleEmployee`
4. No payroll cron — snapshot backfill is client-triggered
5. Cycle detection via location/team strings is brittle — document your markers
6. Concurrent editors: full `data.json` replace

---

## 10. Env

```bash
ALYSON_HR_ORGCHART_S3_BUCKET=alyson-hr-orgchart
ALYSON_HR_PAYROLL_S3_KEY=payroll/data.json
ALYSON_HR_PAYROLL_LOG_S3_KEY=payroll/operations.log.jsonl
ALYSON_HR_PAYROLL_SNAPSHOT_S3_PREFIX=payroll/snapshots/
# + AWS, Clerk, Time Doctor, Onboarding/Bonus readable
```

---

## 11. Build checklist

- [ ] `resolvePayPeriod` for both cycles
- [ ] Roster merge + eligibility
- [ ] Live report builder (TD + leave + bonus + FX)
- [ ] Snapshots for past months
- [ ] Paid map + JSONL audit
- [ ] Super-access on every server fn
- [ ] PIN gate UI
- [ ] Board / log / analytics tabs + drawer + CSV

---

## 12. Implementation prompt

> Implement S3 Payroll per `docs/payroll/claude.md`. Support `india_15th` and `pakistan_month_end`, FX, TD-adjusted hours with leave credit, Bonus column, paid flags, monthly snapshots, Super-access + PIN. Do not use Supabase payroll_runs for the production board.
