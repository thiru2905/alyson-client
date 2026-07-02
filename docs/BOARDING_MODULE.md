# Boarding Module Documentation

## Purpose

The Boarding module (`/boarding`) provides schema-driven onboarding/offboarding checklist tables based on `boardingdetails.pdf`. It is a **local-state demo/workflow UI** — not the canonical S3 roster (see Employee Onboarding).

## Route

- **File:** `src/routes/boarding.tsx`
- **Path:** `/boarding`

## Data Sources

- Table schema: `src/lib/boarding-pdf-schema.ts` (`BOARDING_PDF_TABLES`)
- Sample/generated rows: `src/lib/boarding-mock-data.ts`
- Employee names for row generation: `fetchOverview()` (HR overview)

**No S3 persistence** on this page — rows live in React state.

## Key Behaviors

- Toggle **Onboarding** / **Offboarding** flows
- Horizontal tab strip per PDF table section
- Editable `BoardingDataTable` — **Super Admin only** (`canEdit`)
- Links to `/employee-onboarding` (S3 roster), `/team`, `/documents`, `/workflows`

## Access

`super_admin`, `ceo`, `hr`

## File Map

| File | Role |
|------|------|
| `src/routes/boarding.tsx` | Page |
| `src/lib/boarding-pdf-schema.ts` | Table definitions |
| `src/lib/boarding-mock-data.ts` | Row builders |
| `src/components/BoardingDataTable.tsx` | Shared table |

## Related

- [EMPLOYEE_ONBOARDING_MODULE.md](./EMPLOYEE_ONBOARDING_MODULE.md) — production S3 onboarding roster
