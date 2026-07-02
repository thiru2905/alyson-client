# Leave Module Implementation

## Purpose

The Leave module is a multi-route HR subsystem that manages:

- Per-employee leave ledgers
- Team leave blocks
- Calendar visualization
- Leave analytics
- Append-only audit log

It is implemented on top of S3-backed canonical state, with roster synchronization from Time Doctor and active-status enrichment from Weekly Pacing.

## Route Structure

Parent layout route:

- `src/routes/leave/route.tsx` -> `/leave`

Child routes:

- `src/routes/leave/index.tsx` -> `/leave` (employee ledger)
- `src/routes/leave/calendar.tsx` -> `/leave/calendar`
- `src/routes/leave/analytics.tsx` -> `/leave/analytics`
- `src/routes/leave/audit.tsx` -> `/leave/audit`

Layout tabs expose all child pages and enforce top-level access checks.

## Access Control

In `leave/route.tsx`:

- `canView = hasAnyRole(["super_admin", "ceo", "hr"])`
- Non-authorized users see an Access Denied view.

Mutation permissions in child pages:

- Edit actions generally require the same role set.
- Super Admin gets deeper visibility in audit event payload rendering.

## Server Function Layer

`src/lib/leave-ledger-functions.ts` exposes server functions:

- Reads: `getLeaveLedger`, `getLeaveAnalytics`, `getLeaveAuditLog`
- Sync: `syncLeaveWithTimeDoctor`
- Employee leave writes: `recordLeave`, `voidLeave`
- Team leave writes: `recordTeamLeave`, `voidTeamLeave`

All mutating endpoints validate input using `zod`.

## Canonical S3 Storage

Implemented in `src/lib/leave-s3.server.ts`.

Default object locations:

- Bucket: `alyson-hr-orgchart`
- Data file: `leave/data.json`
- Log file: `leave/operations.log.jsonl`

Data file contains:

- `employees`: employeeId -> `EmployeeLeaveLedger`
- `teamLeaves`: list of team leave blocks
- timestamps and version metadata

Log file is append-only JSONL with operation metadata and event snapshots.

## Roster Sync and Bootstrap

`ensureLeaveOnS3()` does the foundational sync pipeline:

1. Fetch company/users from Time Doctor pacing APIs.
2. Load existing leave S3 state (if any).
3. Merge roster via `syncLeaveLedgersWithTimeDoctor`.
4. Enrich active flags via `enrichLeaveLedgersWithPacingActive`.
5. Detect bootstrap or roster changes.
6. Persist snapshot to S3 when needed (`op = bootstrap|sync`).

If no roster changes are detected, existing S3 snapshot metadata is reused.

## Employee Leave Write Flow

`recordLeave` -> `appendLeaveRecord`:

1. Ensure fresh S3 state.
2. Validate employee exists and is active.
3. Compute business-day duration (`leaveDaysInclusive`).
4. Enforce lifetime limit via `validateLifetimeLeaveLimit`.
5. Create immutable event with ID/timestamps.
6. Write full updated snapshot.
7. Append log entry (`append_leave`) with event details.

`voidLeave` removes an event by ID and logs `void_leave`.

## Team Leave Write Flow

`recordTeamLeave` -> `appendTeamLeaveRecord`:

1. Validate location/team inputs.
2. Compute working-day duration.
3. Resolve active affected employees by team/location match.
4. Persist team event in `teamLeaves`.
5. Append `append_team_leave` audit log entry.

`voidTeamLeave` removes a team event and logs `void_team_leave`.

## Child Route Behavior

## `/leave` (Employees)

- Search/filter active ledgers
- Show used vs remaining lifetime leave
- Record or void personal leave from drawer
- Trigger roster sync from Time Dashboard/Time Doctor
- Manage team leave through shared panel

## `/leave/calendar`

- Builds merged calendar event stream from personal + team leave (`leave-calendar.ts`)
- Buckets by timing (active/upcoming/past)
- Supports focused day and month navigation
- Allows create/remove team leave inline

## `/leave/analytics`

- Fetches computed report (`getLeaveAnalytics`) for selected year
- Supports filters: team and took-leave status
- Renders trend, participation, team distribution, leave-type charts
- Displays employee-level breakdown table

## `/leave/audit`

- Reads append-only operations log (`getLeaveAuditLog`)
- Shows operation type, actor, details, employee metadata
- Super Admin can inspect full serialized event snapshots

## Query Invalidation Strategy

Mutations invalidate dependent query keys to keep screens consistent:

- `["leave-ledger"]`
- `["leave-audit-log"]`
- `["leave-analytics"]`
- Weekly/monthly pacing keys where leave hours impact metrics

## Coupling With Other Modules

Primary dependencies:

- Time Dashboard/Time Doctor: roster source-of-truth
- Weekly/Monthly Pacing: leave contributes to pacing credit
- Org chart roster mapping: team/location identity enrichment

Leave is intentionally designed as an audited, centralized ledger shared across employee, calendar, and analytics views.
