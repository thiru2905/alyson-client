# Performance Module Implementation

## Purpose

The Performance module (`/performance`) provides review-cycle visibility, calibration metrics, and export actions for employee performance records.

It combines review records with employee overview data to show both process status (submitted/calibrated) and compensation/performance correlations.

## Route and Entry Point

- Route file: `src/routes/performance.tsx`
- Route path: `/performance`
- Page component: `PerformancePage`

## Data Read Path

The page runs two queries in parallel:

1. `fetchReviews()` from `src/lib/queries-ext.ts`
2. `fetchOverview()` from `src/lib/queries.ts`

## Review dataset

`fetchReviews()` reads Supabase `reviews` with joins:

- `employees` (name, role, performance score)
- `review_cycles` (cycle name and status)

Ordered by rating descending.

## Overview dataset

`fetchOverview()` provides employee totals and performance scores (S3/Supabase fallback strategy described in Team module docs). Performance uses this to build scatter chart points:

- `perf`: employee performance score
- `comp`: total compensation in thousands

## UI Composition

## KPI cards

Derived from review rows:

- Average rating
- Submitted reviews count
- Promotion-ready count

## Performance vs compensation chart

Rendered with `recharts` (`ScatterChart`) using overview data.

## Current-cycle reviews table

Table shows:

- Employee
- Cycle
- Rating
- Multiplier
- Status
- Promotion readiness

Rows are clickable and open detail drawer.

## Drawers and Actions

- `ReviewCycleDrawer`: start new cycle flow (`Start cycle` action)
- `ReviewDrawer`: inspect selected review row
- `Export` action: generates CSV via `downloadCSV`

CSV includes employee/cycle metadata and review metrics (`rating`, `multiplier`, `status`, comments, promotion flag).

## Role and Access Model

Current route implementation does not apply explicit role guard in `performance.tsx`; access control is expected to be handled by higher-level app auth/nav rules.

If stricter gating is needed, this is the place to add `useAuth()` role checks or route-level guards.

## State and Query Behavior

- Uses React Query (`useQuery`) for fetching.
- Loading state: `PageSkeleton` while either query is pending.
- Empty-state behavior:
  - If no reviews: `EmptyState` prompts user to start a cycle.
- Export guard:
  - Prevents CSV export when dataset is empty.

## Dependencies

- Route: `src/routes/performance.tsx`
- Reviews query: `src/lib/queries-ext.ts` (`fetchReviews`)
- Employee overview query: `src/lib/queries.ts` (`fetchOverview`)
- Drawers: `src/components/drawers/ReviewCycleDrawer`, `src/components/drawers/ReviewDrawer`
- CSV utility: `src/lib/csv`

## Extension Points

Typical next enhancements:

- Add cycle/year/team filters before table rendering.
- Add role-based mutation controls for managers/HR.
- Move review writes to audited server functions if write capability expands.
- Add pagination/server-side limits beyond `slice(0, 30)`.
