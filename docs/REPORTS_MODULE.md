# Reports Module Documentation

## Purpose

Reports (`/reports`) consolidates operational reporting: hourly activity segments, daily stakeholder email triggers, and KPI definition catalog.

## Route

- **File:** `src/routes/reports.tsx`
- **Path:** `/reports`

## Tabs

### 1. Hourly Activity (default)

- Component: `HourlyActivityReport.tsx`
- Server: `getHourlyActivityReport` → `hourly-activity-report.server.ts`
- Sources: Google audit + Calendar + Time Doctor hourly segments (max 7-day window)
- CSV/PDF export; session persistence

### 2. Daily Email

- Component: `DailyStakeholderReportsPanel.tsx`
- Server: `getDailyReportUiInfo`, `triggerDailyStakeholderReports`
- Resend email (`DAILY_REPORT_*` env); cron 6 AM IST
- Manual trigger with send code

### 3. KPI Catalog

- `fetchKpiDefinitions()` from Supabase `kpi_definitions`
- Category filters, formula display, per-KPI CSV export

## Access

`super_admin`, `ceo`, `finance`, `hr`

## File Map

| File | Role |
|------|------|
| `src/routes/reports.tsx` | Tab shell |
| `src/lib/hourly-activity-functions.ts` | Hourly report API |
| `src/lib/daily-stakeholder-reports-functions.ts` | Daily email API |
| `src/components/HourlyActivityReport.tsx` | Hourly UI |
| `src/components/DailyStakeholderReportsPanel.tsx` | Email UI |

## Related

- [DAILY_STAKEHOLDER_REPORTS.md](./DAILY_STAKEHOLDER_REPORTS.md)
