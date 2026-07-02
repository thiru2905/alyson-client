# Payroll Module Documentation

## Purpose

Payroll (`/payroll`) manages payroll run lifecycle: create runs, review items, approve, mark paid, and export Wise CSV.

## Route

- **File:** `src/routes/payroll.tsx`
- **Path:** `/payroll`

## Data Sources

- Supabase `payroll_runs`, `payroll_items` (with employee join in drawer)
- `audit_log` on status changes

## Server / Client Functions

| Function | Type |
|----------|------|
| `fetchPayrollRuns()` | Client Supabase query |
| `fetchPayrollItems(runId)` | Client Supabase query |
| Drawer mutations | `supabase.from("payroll_runs").insert/update` |

## Key Behaviors

- Stats: YTD payroll, open runs, avg run size
- Status pills: `draft`, `manager_review`, `finance_review`, `approved`, `paid`
- `NewPayrollRunDrawer`, `PayrollRunDrawer` (approve/mark paid)
- Wise CSV export of all runs

## Access

`super_admin`, `ceo`, `finance`, `hr`

## File Map

| File | Role |
|------|------|
| `src/routes/payroll.tsx` | Page |
| `src/lib/queries-ext.ts` | `fetchPayrollRuns`, `fetchPayrollItems` |
| `src/components/drawers/NewPayrollRunDrawer.tsx` | Create |
| `src/components/drawers/PayrollRunDrawer.tsx` | Detail/actions |
