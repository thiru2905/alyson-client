# Handover Documentation — Claude Build Spec

Paste this into Cursor/Claude to rebuild Alyson’s **Handover Docs** registry (employee name → documentation URL).

**Related:** `docs/claude.md` (index). Standalone — no hard dependency on Onboarding/Leave. Distinct from the Documents library module.

---

## 0. What this module is

Minimal ops tool for offboarding / knowledge transfer:

- Store **employee name** + **documentation URL**
- Upsert by case-insensitive name
- CSV export
- Typed delete confirmation

Single page, single S3 JSON index. No cron, no Google APIs, no Time Doctor.

---

## 1. Routes & files

| Piece | File |
|-------|------|
| `/handover-documentation` | `src/routes/handover-documentation.tsx` |
| Server fns | `src/lib/handover-docs-functions.ts` |
| S3 | `src/lib/handover-docs-s3.server.ts` |
| Nav | Ops → Handover Docs (`super_admin`, `ceo`, `hr`) |

UI is self-contained on the page (form + table + AlertDialog). No dedicated components folder required.

---

## 2. S3 object

```
s3://{ALYSON_HR_ORGCHART_S3_BUCKET||alyson-hr-orgchart}/
  {ALYSON_HR_HANDOVERDOCS_S3_KEY || alyson-hr-handoverdocumetnation/index.json}
```

**Intentional typo** in the default key: `handoverdocumetnation`. Preserve it unless you migrate deliberately.

Optional: auto-create bucket; apply cost allocation tags (`s3CostAllocationTagging("handover", "index")`).

---

## 3. Models

```ts
HandoverDocRow = {
  id: string
  employeeName: string
  docUrl: string
  createdAt: string
  updatedAt: string
}

HandoverDocsFile = {
  version: 1
  updatedAt: string
  rows: HandoverDocRow[]
}
```

**Upsert key:** case-insensitive `employeeName` (updates `docUrl` + `updatedAt` in place).  
Sort rows by name on read/write.

---

## 4. Server functions

| Fn | Method | Notes |
|----|--------|-------|
| `getHandoverDocs` | GET | Return sorted rows |
| `upsertHandoverDoc` | POST | Zod: name + `.url()` |
| `deleteHandoverDoc` | POST | By `id` |

Every write rewrites the full index JSON.

---

## 5. User flows

1. Load list (`["handover-documentation"]` query key)
2. Add/update via form (name + URL)
3. Open documentation link in new tab
4. Export CSV (`employee_name`, `documentation_link`)
5. Delete: type `DELETE` in AlertDialog → remove by id

---

## 6. Auth (harden when rebuilding)

| Layer | Alyson today | Rebuild recommendation |
|-------|--------------|------------------------|
| Nav | `super_admin`, `ceo`, `hr` | Keep |
| Server | Historically signed-in only / Zod | **Add role or Super-access checks** |

Nav hiding is not security — server must enforce.

---

## 7. Optional upgrades

- Pick employee from Onboarding roster (store `employeeId` + email)
- Prevent duplicates on rename by using employee id as upsert key
- Soft-delete + audit JSONL (match other ledgers)

---

## 8. Env

```bash
ALYSON_HR_ORGCHART_S3_BUCKET=alyson-hr-orgchart
ALYSON_HR_HANDOVERDOCS_S3_KEY=alyson-hr-handoverdocumetnation/index.json
AWS_REGION=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

---

## 9. Gotchas

1. Misspelled default S3 key
2. Name-based upsert → renames create duplicate rows
3. Weak server auth in original Alyson code
4. Not the Documents module — different product surface

---

## 10. Build checklist

- [ ] S3 index get/upsert/delete
- [ ] Name-keyed upsert + sorted list
- [ ] Form + table + CSV export + typed delete
- [ ] Nav role filter
- [ ] **Server-side** role or Super-access enforcement

---

## 11. Implementation prompt

> Implement Handover Documentation per `docs/handover-documentation/claude.md`. Single S3 JSON index of employeeName→docUrl, case-insensitive upsert, CSV export, typed delete. Enforce `super_admin|ceo|hr` (or Super-access) on the server, not only in nav.
