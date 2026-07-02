# Workspace Activity Module Documentation

## Purpose

Workspace Activity (`/workspace-activity`) reports Google Workspace usage per user: emails sent, meetings, docs created, chat messages — with charts, PDF export, and per-item AI insights.

## Routes

| Path | File |
|------|------|
| `/workspace-activity` | `src/routes/workspace-activity.tsx` |
| `/workspace-activity/$userEmail` | `src/routes/workspace-activity.$userEmail.tsx` |

## Server Functions

| Function | Purpose |
|----------|---------|
| `getWorkspaceActivity` | Team rollup report |
| `getWorkspaceUserActivityDetail` | Per-user detail |
| `getWorkspaceActivityItemInsight` | AI summary per item |

Implementation: `workspace-activity.server.ts`, `workspace-activity-content.server.ts`, `workspace-activity-insight.server.ts`

## Data Sources

- Google Admin SDK audit reports (Gmail, Drive, Chat, Calendar)
- Service account JWT + domain-wide delegation
- Optional accurate meeting counts via Calendar API
- 5-minute server cache; 90s timeout guard

## Key Behaviors

- Custom datetime range + presets (1/7/30/45/90 days); URL params `start`/`end`
- Sortable table, search, rank medals
- Lazy charts; CSV + PDF export
- Session restore (`workspace-activity-session.ts`)
- Detail tabs: overview, emails, chat, docs, meetings

## Access

`super_admin`, `ceo`, `hr`

## File Map

| File | Role |
|------|------|
| `src/lib/workspace-activity-functions.ts` | Server fn API |
| `src/lib/workspace-activity.server.ts` | Google API adapter |
| `src/components/WorkspaceActivityCharts.tsx` | Charts |
