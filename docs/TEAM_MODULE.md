# Team Module Implementation

## Purpose

The Team module powers the `/team` route and serves as the central people directory for Alyson HR. It provides two primary views:

- Directory cards with search and department filtering.
- Org chart visualization with manager relationships.

It is also the module that hydrates and synchronizes org-chart-compatible employee roster data into S3 for downstream modules.

## Route and Entry Point

- Route file: `src/routes/team.tsx`
- Route path: `/team`
- Page component: `TeamPage`

The page uses `useQuery` with `fetchOverview` to load a unified HR dataset (departments, employees, compensation-derived totals).

## Data Sources and Read Path

## `fetchOverview` decision flow

Implementation lives in `src/lib/queries.ts`.

1. Reads `VITE_HR_OVERVIEW_SOURCE`.
2. If set to `supabase`, tries `fetchOverviewPartsFromSupabase()`.
3. If Supabase returns usable employee data, it normalizes and returns that.
4. Otherwise, falls back to S3 via `getHrOverviewFromS3()`.
5. If S3 read fails, falls back to bundled RevCloud seed data.

This makes Team resilient in partially configured environments.

## Data shaping

`toOverviewFull()` computes:

- `department_name` from `department_id`
- `effective_bonus` from base salary, bonus %, and performance
- `total_comp` = base + effective bonus + equity + benefits

It also enriches hierarchy data via `withManagerIds()`:

- Resolves manager IDs from manager names (with alias normalization).
- Handles self-managed or missing-manager records as roots.

## UI Behavior

## Directory mode

The default mode renders card tiles for each filtered employee with:

- Name, role, email
- Department and level pills
- Performance score pill
- Total compensation summary

Filters:

- Text search over name, role, email
- Department dropdown (`all` or specific department)

## Org chart mode

Loads `OrgChart` lazily and renders hierarchy using the same normalized employee list.

## Permissions and Role Behavior

`useAuth()` determines privileges:

- Super Admin (`super_admin`) can:
  - Open employee details drawer (`EmployeeDrawer`)
  - Open create-user drawer (`CreateUserDrawer`)
  - Trigger manual sync to S3
- Non-super-admin users have read-only directory/chart experience.

## Write and Sync Operations

## Sync roster to S3

Action button: `Sync roster -> S3`

- Calls `syncHrOverviewToS3({ source: "revcloud" })`
- On success: toast + `refetch()`
- Purpose: persist team snapshot into S3 canonical HR overview storage

## Persist org chart roster to S3

On every successful data load (`useEffect` on `data.employees`):

- Calls `persistOrgChartRosterToS3(...)`
- Writes a normalized roster payload (`id`, names, email, role, level, department, manager fields)

This side-effect feeds modules that rely on organization structure data.

## Error Handling and Empty States

- Loading state: `PageSkeleton`
- Error state:
  - Generic message for runtime/query failures
  - Special copy for missing Supabase env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`)
- Empty search/dept result: `EmptyState` with filter-reset guidance

## Key Dependencies

- Route/UI: `src/routes/team.tsx`
- Data assembly: `src/lib/queries.ts`
- S3 sync function: `src/lib/hr-s3-overview-functions`
- Org roster sync: `src/lib/orgchart-functions`
- Drawers: `src/components/drawers/EmployeeDrawer`, `src/components/drawers/CreateUserDrawer`
- Org chart: `src/components/OrgChart`

## Module Contracts for Other Features

The Team module is upstream for:

- Org-chart-aware fields used by onboarding and leave workflows.
- Consistent employee identity fields (`id`, `email`, manager linkage).
- Role-restricted editing entry points for HR administration.

Any schema change in Team employee rows should be coordinated with:

- Onboarding S3 schema merge logic
- Leave roster sync logic
- Org chart rendering assumptions
