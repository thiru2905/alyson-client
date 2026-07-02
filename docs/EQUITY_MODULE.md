# Equity Module Documentation

## Purpose

Equity (`/equity`) tracks cap table holders, equity grants, vesting events, and grant creation.

## Route

- **File:** `src/routes/equity.tsx`
- **Path:** `/equity`

## Data Sources

- Supabase: `equity_holders`, `equity_grants`, `vesting_events`
- Audit log on grant actions

## Server / Client Functions

| Function | Purpose |
|----------|---------|
| `fetchEquityHolders()` | Holders + grants join |
| `fetchVestingEvents()` | Vesting timeline |
| `NewGrantDrawer` | Insert into `equity_grants` |

## Key Behaviors

- KPIs: total shares, holders, active grants
- Pie chart by holder type (employee/founder/investor/advisor)
- Grants table (top 25) → `GrantDrawer`
- Cap table CSV export

## Access

All authenticated roles (no nav filter)

## File Map

| File | Role |
|------|------|
| `src/routes/equity.tsx` | Page |
| `src/lib/queries-ext.ts` | Queries |
| `src/components/drawers/NewGrantDrawer.tsx` | Create grant |
| `src/components/drawers/GrantDrawer.tsx` | Detail |
