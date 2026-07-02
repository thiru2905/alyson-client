# Employee Scoring Module Documentation

## Purpose

Employee Scoring (`/employee-scoring`) ranks employees by a composite percentile score blending Time Doctor work hours and Google Workspace activity (meetings, emails, chat, docs).

## Routes

| Path | File |
|------|------|
| `/employee-scoring` | `src/routes/employee-scoring.tsx` |
| `/employee-scoring/$userEmail` | `src/routes/employee-scoring.$userEmail.tsx` |

## Scoring Weights (`SCORING_WEIGHTS`)

| Metric | Weight |
|--------|--------|
| Work hours (Time Doctor) | 60% |
| Meetings | 16.7% |
| Emails | 10% |
| Chat | 8% |
| Docs | 5.3% |

Grades A–F from cohort composite percentile.

## Server Functions

| Function | Purpose |
|----------|---------|
| `getEmployeeScoring` | Cohort ranked table |
| `getEmployeeScoringDetail` | Per-employee breakdown |
| `analyzeEmployeeWorkspaceFocus` | AI focus clustering (detail) |

## Data Sources

- `getWorkspaceActivity` + `fetchTimeDoctorEmployeesTable`
- Speaker identity index for multi-email merge
- 90s in-memory server cache per window

## Key Behaviors

- Date range picker + presets; session caching
- Ranked table with grade badges, medals, CSV/PDF
- Detail route with workspace/AI tabs
- Embedded hourly activity sub-panel

## Access

`super_admin`, `ceo`, `hr`

## File Map

| File | Role |
|------|------|
| `src/lib/employee-scoring-functions.ts` | List API |
| `src/lib/employee-scoring-rules.ts` | Weights + grading |
| `src/lib/employee-scoring-merge.server.ts` | Identity merge |
| `src/lib/employee-scoring-detail-functions.ts` | Detail API |
