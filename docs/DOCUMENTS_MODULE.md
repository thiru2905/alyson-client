# Documents Module Documentation

## Purpose

Documents (`/documents`) is a lightweight document registry: upload metadata, tag, link external files, and browse by tag.

## Route

- **File:** `src/routes/documents.tsx`
- **Path:** `/documents`

## Data Sources

- Supabase `documents` (title, doc_type, visibility, tags, file_url, expires_at)

## Server / Client Functions

| Function | Purpose |
|----------|---------|
| `fetchDocuments()` | List all docs |
| `UploadDocumentDrawer` | `documents.insert` |

## Key Behaviors

- Card grid with search + tag filter
- Upload drawer for new documents
- Detail drawer: metadata, tags, external file link

## Access

All authenticated roles

## File Map

| File | Role |
|------|------|
| `src/routes/documents.tsx` | Page |
| `src/lib/queries-ext.ts` | `fetchDocuments` |
| `src/components/drawers/UploadDocumentDrawer.tsx` | Upload |
| `src/components/drawers/DocumentDrawer.tsx` | Detail |
