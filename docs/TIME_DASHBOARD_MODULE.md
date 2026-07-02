# Time Dashboard Module Documentation

This document explains the Time Dashboard module end-to-end:

- architecture and routes
- data sources and server APIs
- metrics and calculations
- tab behavior and exports
- Weekly/Monthly Pacing extensions
- access control and failure handling

---

## 1) Purpose

The Time Dashboard module provides people-performance visibility using Time Doctor data:

- team-level time tracking overview (`/time-dashboard`)
- employee-level deep dives (`/time-dashboard/$userId`)
- weekly pacing report (`/time-dashboard/pacing`)
- monthly pacing report (`/time-dashboard/monthly-pacing`)

The module is read-heavy and server-aggregated. UI talks to server functions, and server functions query Time Doctor upstream APIs.

---

## 2) Route Structure

## Primary routes

- `src/routes/time-dashboard.tsx`
  - Team summary table, range picker, sorting, CSV export, under-hours PDF.
- `src/routes/time-dashboard.$userId.tsx`
  - Per-user details with tabs:
    - Overview
    - Attendance
    - Apps & Websites
    - Projects & Tasks
- `src/routes/time-dashboard.pacing.tsx`
  - Weekly pacing (target-based performance and risk).
- `src/routes/time-dashboard.monthly-pacing.tsx`
  - Monthly pacing (month-to-date projection and status).

## Access gate

- `src/components/TimeDashboardGate.tsx`
  - Blocks the module until user enters the Time Dashboard code.
  - Uses `useAuth().canAccessTimeDashboard`.

---

## 3) Core Data Layer

## Main server functions

File: `src/lib/time-doctor-functions.ts`

Primary exported server functions:

- `fetchTimeDoctorEmployeesTable`
- `fetchTimeDoctorUserDetail`
- `fetchTimeDoctorMonthlyUnderHoursReport`
- `fetchUserWorklogEntriesForRange`

These are `createServerFn` handlers and are the main backend contract for Time Dashboard screens.

## Pacing server functions

File: `src/lib/time-doctor-pacing-functions.ts`

- `fetchWeeklyPacingReport`
- `fetchMonthlyPacingReport`
- `fetchWeeklyHoursTrend`
- `setWeeklyPacingActiveOverride`
- `getWeeklyPacingInsights`

Implementation logic is in:

- `src/lib/time-doctor-pacing.server.ts`

## Upstream API adapter

`upstreamFetch(...)` in `time-doctor-functions.ts` handles:

- Time Doctor API URL and query construction
- access token retrieval
- auto-refresh-on-401/403 (if refresh is configured)
- auth error normalization via `time-doctor-auth-errors.ts`
- JSON parsing and error surfacing

---

## 4) Authentication and Access Behavior

There are two access layers:

1. **App-level gate** (`TimeDashboardGate`)
   - User must unlock Time Dashboard in session.
2. **Time Doctor token validity**
   - Server fetches valid access token.
   - If token expires, auto-refresh path is attempted.
   - If still unauthorized, returns formatted reauth error messages.

Related files:

- `src/lib/auth.tsx`
- `src/components/TimeDashboardGate.tsx`
- `src/lib/time-doctor-token-manager.server.ts`
- `src/lib/time-doctor-auth-errors.ts`

---

## 5) Team View (`/time-dashboard`)

File: `src/routes/time-dashboard.tsx`

## Inputs

- Date range from query params (`start`, `end`) with safe defaults from `time-dashboard-range`.
- Sort field + direction.
- Search text filter.

## Main query

- `useQuery(["time-doctor-employees-table", start, end], fetchTimeDoctorEmployeesTable)`

Returned payload includes:

- company metadata
- normalized range
- rollup windows (today / week / calendar month)
- warnings
- employee rows

## Employee row metrics

Each row includes:

- `dailySeconds` (today)
- `weeklySeconds` (week-to-date)
- `monthlySeconds` (calendar month-to-date)
- `rangeSeconds` (selected period)

All rendered as hours in UI (`seconds / 3600`).

## UX safeguards

- Uses `keepPreviousData` to avoid table flashing.
- Shows stale-data overlay while new range is loading.
- Uses status banners for loading/refetch/error states.
- Emits toast when new range fully applies.

## Exports

- CSV export for table rows.
- Monthly under-hours PDF (`fetchTimeDoctorMonthlyUnderHoursReport` + PDF generator).

---

## 6) User Detail View (`/time-dashboard/$userId`)

File: `src/routes/time-dashboard.$userId.tsx`

## Tabs and data shape

Uses `fetchTimeDoctorUserDetail({ userId, start, end, tab })`.

### `overview`

- aggregate productive/poor seconds
- daily trend chart
- weekly/monthly rollups

### `attendance`

- absent/late counts
- date/status records table

### `apps`

- productive/neutral/distracting distribution
- top tools/apps/sites

### `work`

- time by project
- top tasks

## Performance behavior

- Query key includes `tab`, so each tab has isolated cache.
- Placeholder data kept only when same tab is refetching.
- Shows stale overlay during range updates.

## Exports

Tab-aware CSV export:

- attendance CSV
- apps CSV
- work CSV
- monthly rollup CSV (overview)

---

## 7) Weekly Pacing (`/time-dashboard/pacing`)

Files:

- UI: `src/routes/time-dashboard.pacing.tsx`
- API wrapper: `src/lib/time-doctor-pacing-functions.ts`
- Engine: `src/lib/time-doctor-pacing.server.ts`

## What it computes

For each employee:

- logged hours (Time Doctor)
- leave days and leave-hour credit
- worked hours = logged + leave credit
- average daily pace (Mon–Thu sample)
- projected pace
- hours remaining / over target
- required hours per day
- status classification:
  - `target_met`
  - `on_track`
  - `behind`
  - `at_risk`
  - `critical`

## Additional capabilities

- Active Yes/No override persisted to S3 (`setWeeklyPacingActiveOverride`).
- Weekly trend report (`fetchWeeklyHoursTrend`) for chart panel.
- AI report generation (`getWeeklyPacingInsights`).
- CSV/PDF export for filtered rows.

## Leave integration

Pacing enriches tracked hours using leave context:

- personal leave
- team/location leave events
- leave-hour credit per workday (`PACING_LEAVE_HOURS_PER_DAY`)

---

## 8) Monthly Pacing (`/time-dashboard/monthly-pacing`)

Files:

- UI: `src/routes/time-dashboard.monthly-pacing.tsx`
- Engine: `src/lib/time-doctor-pacing.server.ts` (`buildMonthlyPacingReport`)

## What it computes

Month-to-date pacing using:

- month start to rollup day
- elapsed / total / remaining workdays in month
- target derived from workdays
- same row model as weekly pacing (logged + leave + projected + status)

## UX behavior

- Month picker (YYYY-MM).
- Filter chips and dropdowns for location/team/active.
- Sortable columns.
- CSV export of filtered table.

---

## 9) Timezone and Date Logic

Timezone handling is centralized in `time-doctor-functions.ts`:

- maps Time Doctor timezone labels to IANA zones
- computes "today" in company timezone (`timeDoctorTodayIso`)
- exposes timezone label for UI descriptions

Why this matters:

- "today", weekly, and calendar-month rollups must align with company timezone, not browser local time.
- prevents mismatches between Time Doctor backend windows and dashboard windows.

---

## 10) Data Normalization and Rollups

Key normalization helpers in `time-doctor-functions.ts`:

- user normalization (`normalizeUser`)
- worklog normalization (`normalizeWorklog`)
- poor-time normalization (`normalizePoorTime`)
- absent/late normalization (`normalizeAbsentLate`)

Rollup strategies:

- per-range user aggregation
- per-day maps for trend and rollup windows
- merged seconds maps where needed
- fallback week start (Sunday) if Monday-based weekly window comes back empty while month has data

---

## 11) Caching and Performance

## Client-side

- React Query with `staleTime`
- `keepPreviousData` for smooth transitions
- tab/range-specific query keys

## Server-side light caches

Inside `time-doctor-functions.ts`:

- lightweight users cache (`tdUsersLightCache`)
- company cache (`tdCompanyCache`)

These reduce repetitive upstream calls for helper/report workflows.

---

## 12) Error and Resilience Model

The module is designed to degrade gracefully:

- Partial upstream failures become warnings in payload (`warnings[]`) instead of hard crashes when possible.
- UI shows warning cards and retry controls.
- Token errors are mapped to human-readable remediation messages.
- Stale-data overlays avoid blank screens during refetch.

---

## 13) Integrations with Other Modules

Time Dashboard/Pacing depends on:

- Leave module data (`leave-s3`, `weekly-pacing-leave`)
- Org chart roster for manager/team/location enrichment
- Active member lookup
- Weekly active override S3 persistence
- PDF/CSV utility modules

This creates a unified workforce view: tracked work + leave context + org metadata.

---

## 14) File Map (Quick Reference)

## Routes

- `src/routes/time-dashboard.tsx`
- `src/routes/time-dashboard.$userId.tsx`
- `src/routes/time-dashboard.pacing.tsx`
- `src/routes/time-dashboard.monthly-pacing.tsx`

## Core backend

- `src/lib/time-doctor-functions.ts`
- `src/lib/time-doctor-token-manager.server.ts`
- `src/lib/time-doctor-auth-errors.ts`

## Pacing backend

- `src/lib/time-doctor-pacing-functions.ts`
- `src/lib/time-doctor-pacing.server.ts`
- `src/lib/weekly-pacing.ts`
- `src/lib/monthly-pacing.ts`
- `src/lib/weekly-pacing-leave.server.ts`
- `src/lib/weekly-pacing-active.server.ts`

## UI helpers

- `src/components/TimeDashboardGate.tsx`
- `src/components/TimeDashboardRangePicker.tsx`
- `src/components/WeeklyPacingWeekPicker.tsx`
- `src/components/WeeklyPacingTrendPanel.tsx`
- `src/components/WeeklyPacingActiveCell.tsx`

---

## 15) Summary

The Time Dashboard module is a server-aggregated analytics surface built on Time Doctor APIs, with:

- robust date/timezone handling
- range-based and tab-based rollups
- progressive loading and stale-state UX
- pacing intelligence (weekly/monthly) enhanced by leave and org context
- export and AI insight features for operational usage

It is designed for stability under imperfect upstream conditions while preserving actionable visibility for people operations.

