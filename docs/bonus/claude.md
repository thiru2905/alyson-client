# Bonus (& Shares) — Claude Build Spec

Paste this into Cursor/Claude to rebuild Alyson’s **Bonus / Shares S3 ledger**.

**Related:** `docs/claude.md` (index) · **Employee Onboarding** (roster source) · **Payroll** (reads period bonus + active). Equity cap-table module is separate.

---

## 0. What this module is

Per-employee compensation ledger of:

- **Cash bonus events** (USD amounts with paid-on dates)
- **Share / equity events** (grant, vest, adjustment, note)

Append-only events; **void** removes from the live ledger but keeps an audit snapshot. Roster shells come from **Onboarding S3**, not Time Doctor.

Production UI tabs: **Employees / Analytics / Audit**.  
Routes `/bonus/plans`, `/simulate`, `/approvals` are **mock/demo** — do not treat as production.

---

## 1. Routes & files

| Path | Live? |
|------|-------|
| `/bonus` layout + `SuperAccessGate` | Yes |
| `/bonus` employees ledger | Yes |
| `/bonus/analytics` | Yes (cash only) |
| `/bonus/audit` | Yes |
| `/bonus/plans`, `/simulate`, `/approvals` | Mock only |

| Lib | Role |
|-----|------|
| `bonus-schema.ts` | Types + sum helpers |
| `bonus-s3.server.ts` | S3 + onboarding sync |
| `bonus-functions.ts` | Server fns |
| `bonus-analytics.ts` | Cash analytics |
| `BonusEmployeeLedgerDrawer.tsx` | History / record cash / record shares |

Nav: Money → Bonus (`superAccess: true`).

---

## 2. S3 objects

```
bonus/data.json
bonus/operations.log.jsonl
```

Env:

- `ALYSON_HR_BONUS_S3_KEY` (default `bonus/data.json`)
- `ALYSON_HR_BONUS_LOG_S3_KEY`

```ts
BonusDataFile = {
  version: 1
  employees: EmployeeCompensationLedger[]
  syncedFromOnboardingAt?: string
  updatedAt: string
}
```

---

## 3. Core models

```ts
BonusCashEvent = {
  id: string           // e.g. bonus_...
  amountUsd: number
  paidOn: string       // ISO date
  periodLabel?: string
  note?: string
}

ShareEvent = {
  kind: "grant" | "vest" | "adjustment" | "note"
  shares: number
  effectiveDate: string
  strike?: number
  note?: string
}

EmployeeCompensationLedger = {
  // onboarding identity
  employeeId, name, email, location, team, ...
  bonusEvents: BonusCashEvent[]
  shareEvents: ShareEvent[]
  active: boolean
}
```

Ops log kinds: `bootstrap | sync | append_bonus | append_share | void_bonus | void_share`.

Helpers:

- `sumBonusEvents(events)`
- `sumShareGrants(events)` — typically **grant + adjustment** only
- `periodLabelFromIso(date)`

---

## 4. Server functions (all Super-access)

| Fn | Purpose |
|----|---------|
| `getBonusLedger` | Ensure + return ledgers |
| `syncBonusWithOnboarding` | Refresh shells from onboarding |
| `recordBonusPayment` | Append cash |
| `recordShareEvent` | Append share |
| `voidBonusPayment` | Void cash (audit keeps payload) |
| `voidShareEvent` | Void share |
| `getBonusAnalytics` | Cash facts for charts |
| `getBonusAuditLog` | Last ~300 ops |

No dedicated bonus cron.

---

## 5. Sync rules with Onboarding

On `ensureBonusOnS3` / sync:

1. For each onboarding row → ensure a ledger shell (identity fields refreshed)
2. If employee removed from onboarding → keep history, set `active: false`
3. Do **not** delete historical bonus/share events on sync

Payroll uses `active` and period cash totals from this file.

---

## 6. User flows

1. Open `/bonus` → `getBonusLedger`
2. Search; active-only filter; summary cards
3. Open drawer → History | Record bonus | Record shares
4. Void with typed confirm
5. Sync onboarding button
6. Analytics: flatten cash events → team/location/time charts (**shares excluded**)
7. Audit table

---

## 7. Auth

- Layout: `SuperAccessGate`
- Server: `requireSuperAccess` on every fn
- Older docs mentioning only `finance`/`hr` Clerk roles are stale for the live ledger

---

## 8. Downstream: Payroll

`payroll-report.server.ts` calls `ensureBonusOnS3()` to:

- Add bonus column for the pay period
- Enrich `active` flags on the board

Keep event dates/`paidOn` aligned with payroll period windows.

---

## 9. Gotchas

1. Dashboard Supabase `bonus_awards` / `bonus_plans` ≠ this module
2. Analytics is **cash-only**
3. Full-document S3 replace — last write wins
4. Void ≠ silent delete
5. Mock plan/simulate/approval routes can confuse rebuilds — leave unlinked or delete

---

## 10. Env

```bash
ALYSON_HR_ORGCHART_S3_BUCKET=alyson-hr-orgchart
ALYSON_HR_BONUS_S3_KEY=bonus/data.json
ALYSON_HR_BONUS_LOG_S3_KEY=bonus/operations.log.jsonl
AWS_REGION=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
# Onboarding must be readable
```

---

## 11. Build checklist

- [ ] Schema + sum helpers
- [ ] S3 ensure + onboarding sync (`active: false` on removal)
- [ ] Append/void cash + shares + JSONL audit
- [ ] Employees / analytics / audit UI under Super-access
- [ ] Payroll `ensureBonusOnS3` consumer
- [ ] Do not wire mock plans UI as production

---

## 12. Implementation prompt

> Implement Bonus/Shares per `docs/bonus/claude.md`. Onboarding-synced S3 ledgers, append/void cash and share events with JSONL audit, cash-only analytics, Super-access on all server fns. Expose data to Payroll for period bonus and active flags.
