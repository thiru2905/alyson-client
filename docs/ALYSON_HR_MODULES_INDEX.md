# Alyson HR — Module Documentation Index

Complete module documentation for the Alyson HR application (`alyson-client`). Each module has a dedicated Markdown file in `docs/`.

---

## Workspace

| Module | Route | Doc |
|--------|-------|-----|
| Dashboard | `/app` | [DASHBOARD_MODULE.md](./DASHBOARD_MODULE.md) |
| Alyson Brain | `/alyson-brain` | [ALYSON_BRAIN_MODULE.md](./ALYSON_BRAIN_MODULE.md) |

## People

| Module | Route | Doc |
|--------|-------|-----|
| Team | `/team` | [TEAM_MODULE.md](./TEAM_MODULE.md) |
| Boarding | `/boarding` | [BOARDING_MODULE.md](./BOARDING_MODULE.md) |
| Employee Onboarding | `/employee-onboarding` | [EMPLOYEE_ONBOARDING_MODULE.md](./EMPLOYEE_ONBOARDING_MODULE.md) |
| Time Dashboard | `/time-dashboard` | [TIME_DASHBOARD_MODULE.md](./TIME_DASHBOARD_MODULE.md) |
| Performance | `/performance` | [PERFORMANCE_MODULE.md](./PERFORMANCE_MODULE.md) |
| Leave | `/leave` | [LEAVE_MODULE.md](./LEAVE_MODULE.md) |
| Attendance | `/attendance` | [ATTENDANCE_MODULE.md](./ATTENDANCE_MODULE.md) |

## Money

| Module | Route | Doc |
|--------|-------|-----|
| Payroll | `/payroll` | [PAYROLL_MODULE.md](./PAYROLL_MODULE.md) |
| Bonus & Shares | `/bonus` | [BONUS_MODULE.md](./BONUS_MODULE.md) |
| Equity | `/equity` | [EQUITY_MODULE.md](./EQUITY_MODULE.md) |

## Ops

| Module | Route | Doc |
|--------|-------|-----|
| Workflows | `/workflows` | [WORKFLOWS_MODULE.md](./WORKFLOWS_MODULE.md) |
| Documents | `/documents` | [DOCUMENTS_MODULE.md](./DOCUMENTS_MODULE.md) |
| Handover Docs | `/handover-documentation` | [HANDOVER_DOCUMENTATION_MODULE.md](./HANDOVER_DOCUMENTATION_MODULE.md) |
| Workspace Activity | `/workspace-activity` | [WORKSPACE_ACTIVITY_MODULE.md](./WORKSPACE_ACTIVITY_MODULE.md) |
| Employee Scoring | `/employee-scoring` | [EMPLOYEE_SCORING_MODULE.md](./EMPLOYEE_SCORING_MODULE.md) |
| Reports | `/reports` | [REPORTS_MODULE.md](./REPORTS_MODULE.md) |

### Alyson Notetaker (Ops)

| Module | Route | Doc |
|--------|-------|-----|
| Notetaker (live) | `/alyson-notetaker` | [ALYSON_NOTETAKER_MODULE.md](./ALYSON_NOTETAKER_MODULE.md) |
| Meeting List | `/alyson-notetaker/meeting-list` | [MEETING_LIST_MODULE.md](./MEETING_LIST_MODULE.md) |
| Meeting Calendar | `/alyson-notetaker/calendar` | [MEETING_CALENDAR_MODULE.md](./MEETING_CALENDAR_MODULE.md) |
| Analytics | `/alyson-notetaker/analytics` | [NOTETAKER_ANALYTICS_MODULE.md](./NOTETAKER_ANALYTICS_MODULE.md) |
| Bot Join Report | `/alyson-notetaker/bot-join-report` | [BOT_JOIN_REPORT_MODULE.md](./BOT_JOIN_REPORT_MODULE.md) |
| Unified Meetings | `/alyson-notetaker/unified-meetings` | [UNIFIED_MEETINGS_MODULE.md](./UNIFIED_MEETINGS_MODULE.md) |
| Tasks | `/alyson-notetaker/tasks` | [NOTETAKER_TASKS_MODULE.md](./NOTETAKER_TASKS_MODULE.md) |
| Cost Tracking | `/alyson-notetaker/cost-tracking` | [COST_TRACKING_MODULE.md](./COST_TRACKING_MODULE.md) |

**S3 deep-dive (Notetaker + Meeting List + Calendar):** [ALYSON_NOTETAKER_S3_READ_WRITE.md](./ALYSON_NOTETAKER_S3_READ_WRITE.md)

## Admin

| Module | Route | Doc |
|--------|-------|-----|
| Admin | `/admin` | [ADMIN_MODULE.md](./ADMIN_MODULE.md) |
| Help | `/help` | [HELP_MODULE.md](./HELP_MODULE.md) |
| Auth | `/auth` | [AUTH_MODULE.md](./AUTH_MODULE.md) |

---

## Other technical docs

| Doc | Topic |
|-----|-------|
| [ALYSON_MEETING_MANAGER.md](./ALYSON_MEETING_MANAGER.md) | Meeting manager |
| [ALYSON_BOT_SCHEDULING_BLOCKERS.md](./ALYSON_BOT_SCHEDULING_BLOCKERS.md) | Bot scheduling blockers |
| [DAILY_STAKEHOLDER_REPORTS.md](./DAILY_STAKEHOLDER_REPORTS.md) | Daily email reports |
| [TIME_DOCTOR_OAUTH.md](./TIME_DOCTOR_OAUTH.md) | Time Doctor OAuth |
| [VERCEL_PRODUCTION.md](./VERCEL_PRODUCTION.md) | Production deployment |

---

## Stack summary

- **Frontend:** React 19 + Vite + TanStack Router + TanStack Query
- **Backend:** TanStack Start server functions + Nitro (Vercel)
- **Auth:** Clerk (`publicMetadata.roles`)
- **Databases:** Supabase (HR transactional), AWS S3 (ledgers, notetaker, onboarding)
- **Integrations:** Time Doctor, Recall.ai, Google Workspace DWD, Groq/DeepSeek
