# Notetaker Analytics Module Documentation

## Purpose

Notetaker Analytics (`/alyson-notetaker/analytics`) aggregates meeting metrics from S3: counts, duration, participant stats, and trends over a selectable date range.

## Route

- **File:** `src/routes/alyson-notetaker/analytics.tsx`

## Server Functions

| Function | Purpose |
|----------|---------|
| `getNotetakerAnalytics` | Range rollup from S3 meeting index |

Implementation: `notetaker-analytics.server.ts` (scans `meetingnotes/`, `transcripts/`, `bot-index/`)

## Metrics

- Total meetings, total duration
- Meetings with notes / transcript / tasks coverage
- Per-day histogram
- Top participants (from unified meeting attendees when available)

## Data Sources

- S3 notetaker bucket (`NOTETAKER_S3_BUCKET` / related env)
- Optional merge with unified scheduled state for attendee names

## Caching

- Server-side in-memory cache per range key (short TTL)

## Access

All authenticated roles (Ops nav)

## Related

- [MEETING_LIST_MODULE.md](./MEETING_LIST_MODULE.md)
- [ALYSON_NOTETAKER_S3_READ_WRITE.md](./ALYSON_NOTETAKER_S3_READ_WRITE.md)

## File Map

| File | Role |
|------|------|
| `src/routes/alyson-notetaker/analytics.tsx` | Page |
| `src/lib/notetaker-analytics-functions.ts` | Server fn |
| `src/lib/notetaker-analytics.server.ts` | S3 aggregation |
