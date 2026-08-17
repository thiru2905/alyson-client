# Alyson HR Modules — Claude Build Spec Index

Share **one module file at a time** with Cursor/Claude (or the whole set). Each file is a deep rebuild blueprint like `docs/pacing/claude.md`.

## Module specs

| # | Module | Spec file |
|---|--------|-----------|
| 1 | Org chart (Team) | [`docs/org-chart/claude.md`](./org-chart/claude.md) |
| 2 | Employee onboarding | [`docs/employee-onboarding/claude.md`](./employee-onboarding/claude.md) |
| 3 | Payroll | [`docs/payroll/claude.md`](./payroll/claude.md) |
| 4 | Leave calendar (+ ledger / email) | [`docs/leave/claude.md`](./leave/claude.md) |
| 5 | Bonus (& shares) | [`docs/bonus/claude.md`](./bonus/claude.md) |
| 6 | Handover documentation | [`docs/handover-documentation/claude.md`](./handover-documentation/claude.md) |
| 7 | Workspace activity | [`docs/workspace-activity/claude.md`](./workspace-activity/claude.md) |
| 8 | Employee scoring | [`docs/employee-scoring/claude.md`](./employee-scoring/claude.md) |

**Also required for Leave → hours math:** [`docs/pacing/claude.md`](./pacing/claude.md)

**Full product encyclopedia:** [`docs/alysonHR.md`](./alysonHR.md)

---

## Rebuild order (dependencies)

```
Platform (Clerk, AppShell, S3, Super-access)
  → Org chart
  → Employee onboarding
      → Bonus
      → Payroll (also needs TD + Leave + Bonus)
  → Leave (+ pacing credit)
  → Google DWD → Workspace activity → Employee scoring
  → Handover documentation (anytime / last)
```

## Access cheat sheet

| Module | Typical gate |
|--------|----------------|
| Org chart | Signed-in view; `super_admin` edit |
| Onboarding | Nav `super_admin/ceo/hr`; mutations `super_admin` |
| Leave / Bonus / Payroll / Workspace Activity | **Super-access** (UI + server) |
| Payroll | Super-access **+ PIN** |
| Handover / Scoring | Nav roles — **harden server** when rebuilding |

## How to use with a friend / Claude

1. Send them **this index** + the **platform notes inside the first modules they build**
2. Paste **one** `claude.md` and ask Claude to implement only that module
3. After Onboarding exists, paste Bonus then Payroll
4. After Leave exists, paste Pacing + Scoring
5. Prefer live `src/` over old `*_MODULE.md` if docs disagree on auth
