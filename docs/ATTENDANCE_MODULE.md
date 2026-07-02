# Attendance Module Implementation

## Purpose

The Attendance module (`/attendance`) presents recent attendance and activity records, supports export, and provides an adjustment workflow through a drawer UI.

It currently reads from Supabase attendance tables and provides a UI-level "sync" action indicator for Time Doctor refresh feedback.

## Route and Entry Point

- Route file: `src/routes/attendance.tsx`
- Route path: `/attendance`
- Page component: `AttendancePage`

## Data Read Path

The route runs:

- `useQuery({ queryKey: ["attendance"], queryFn: () => fetchAttendance(14) })`

`fetchAttendance` lives in `src/lib/queries-ext.ts` and performs:

1. Computes `since = today - 14 days`.
2. Queries Supabase `attendance_records`.
3. Joins employee metadata (`employees(full_name, department_id)`).
4. Filters by `work_date >= since`.
5. Orders descending by work date.

Returned fields used by UI include:

- `source_hours`
- `approved_hours`
- `adjusted_hours`
- `activity_score`
- `adjustment_note`
- employee relation fields

## UI Behavior

## KPI cards

Computed from fetched rows:

- Total approved hours (14d)
- Count of adjusted entries
- Average activity score

## Attendance table

For each row:

- Employee + date
- Source/approved/adjusted hours
- Activity score pill with threshold coloring
- Adjustment affordance (`Adjust ->`)

Rows are clickable and open `AttendanceAdjustDrawer`.

## Actions

## Export

- Uses `downloadCSV` from `src/lib/csv`.
- Exports current in-memory dataset to `attendance-YYYY-MM-DD.csv`.
- Includes employee/date/hours/activity/adjustment note fields.

## Sync Time Doctor button

- Current implementation is UI feedback only:
  - Sets local `lastSync` timestamp
  - Shows success toast
  - Does not trigger a server-side ingestion/write pipeline in this route file

If backend sync is required, this button should be wired to a server function and invalidate `["attendance"]`.

## Loading and Empty States

- Loading: `PageSkeleton`
- Empty dataset: `EmptyState` prompting Time Doctor connection or CSV import

## Permissions

No explicit route-level role guard is implemented in `attendance.tsx`. Access control is assumed to be handled by app-wide auth/nav policy.

Adjustment editability controls, if required, should be enforced both:

- in drawer mutation handlers (server-side validation), and
- in route-level button/drawer entry conditions.

## Dependencies

- Route UI: `src/routes/attendance.tsx`
- Data query: `src/lib/queries-ext.ts` (`fetchAttendance`)
- Drawer: `src/components/drawers/AttendanceAdjustDrawer`
- CSV helper: `src/lib/csv`

## Extension Points

Recommended hardening steps:

- Add true server-side Time Doctor sync endpoint.
- Persist attendance adjustment mutations with audit trail.
- Add filters (team/date range/activity bands).
- Add pagination or virtualized rendering for larger datasets.
