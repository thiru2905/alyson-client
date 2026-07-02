# Handover Documentation Module Documentation

## Purpose

Handover Docs (`/handover-documentation`) stores per-employee documentation URLs in S3 for offboarding/handover tracking.

## Route

- **File:** `src/routes/handover-documentation.tsx`
- **Path:** `/handover-documentation`

## S3 Storage

| Variable | Default |
|----------|---------|
| `ALYSON_HR_ORGCHART_S3_BUCKET` | `alyson-hr-orgchart` |
| Key | `alyson-hr-handoverdocumetnation/index.json` |

Requires `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.

## Server Functions

| Function | Purpose |
|----------|---------|
| `getHandoverDocs` | Read index from S3 |
| `upsertHandoverDoc` | Add/update employee + URL |
| `deleteHandoverDoc` | Remove entry |

Implementation: `src/lib/handover-docs-s3.server.ts`

## Key Behaviors

- Form: employee name + documentation URL
- Delete requires typing `DELETE` to confirm
- CSV export

## Access

`super_admin`, `ceo`, `hr`

## File Map

| File | Role |
|------|------|
| `src/routes/handover-documentation.tsx` | Page |
| `src/lib/handover-docs-functions.ts` | Server fn API |
| `src/lib/handover-docs-s3.server.ts` | S3 CRUD |
