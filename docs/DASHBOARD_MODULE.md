# Dashboard Module Documentation

## Purpose

The Dashboard (`/app`) is the executive HR overview: headcount, compensation, bonus exposure, payroll runs, workflows inbox, and forecast charts.

## Route

- **File:** `src/routes/app.tsx`
- **Page:** `src/pages/DashboardPage.tsx`
- **Path:** `/app`

## Data Sources

| Dataset | Source |
|---------|--------|
| Employees, departments, comp, history | `fetchOverview()` → S3 HR overview (default), Supabase, or RevCloud seed |
| Payroll runs | Supabase `payroll_runs` |
| Bonus awards | Supabase `bonus_awards` |
| Workflows | Supabase `workflow_instances` |
| Vesting events | Supabase `vesting_events` |

## Key Behaviors

- Role-aware greeting via `useAuth().primaryRole`
- KPI cards: total comp, bonus, headcount, avg performance, payroll/equity forecasts (3/6 mo)
- Scenario toggle: `base` / `upside` / `downside` via `buildForecast()`
- Charts: forecast area, historical comp line, headcount-by-dept bar
- Pending approvals inbox (top 5) → links to `/workflows`
- Recent payroll preview → `/payroll`
- KPI drill-down drawer

## Access

All authenticated users (no nav role filter).

## File Map

| File | Role |
|------|------|
| `src/routes/app.tsx` | Route |
| `src/pages/DashboardPage.tsx` | UI |
| `src/lib/queries.ts` | `fetchOverview` |
| `src/lib/queries-ext.ts` | Payroll, bonus, workflows, vesting |
| `src/lib/forecast.ts` | Scenario forecasts |
