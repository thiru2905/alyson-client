# Workflows Module Documentation

## Purpose

Workflows (`/workflows`) is the approval inbox for HR/finance processes: view pending items, approve, reject, or request changes.

## Route

- **File:** `src/routes/workflows.tsx`
- **Path:** `/workflows`

## Data Sources

- Supabase `workflow_instances` + join `workflow_templates`
- `audit_log` on decisions

## Server / Client Functions

| Function | Purpose |
|----------|---------|
| `fetchWorkflows()` | List instances |
| `useDecideWorkflow()` | Approve/reject/request changes |

## Key Behaviors

- Summary stats: pending, approved, rejected, overdue
- Filter chips: all / pending / approved / rejected / overdue
- `WorkflowDrawer` for actions
- Also surfaced on Dashboard inbox and Notifications popover

## Access

All authenticated roles

## File Map

| File | Role |
|------|------|
| `src/routes/workflows.tsx` | Page |
| `src/lib/queries-ext.ts` | `fetchWorkflows` |
| `src/lib/workflow-actions.ts` | Decision mutations |
| `src/components/drawers/WorkflowDrawer.tsx` | Detail drawer |
