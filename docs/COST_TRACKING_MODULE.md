# Cost Tracking Module Documentation

## Purpose

Recall Cost Tracking (`/alyson-notetaker/cost-tracking`) monitors **Recall.ai bot and transcript billing** for Alyson Notetaker: usage hours, estimated USD costs, per-meeting cost, and AI-generated insights.

## Route

- **File:** `src/routes/alyson-notetaker/cost-tracking.tsx`
- **Path:** `/alyson-notetaker/cost-tracking`

## Server Functions

| Function | Purpose |
|----------|---------|
| `getRecallCostReport` | Build cost report for date range |
| `getRecallCostInsights` | LLM summary of report trends |

Implementation: `recall-cost-report.server.ts`, `recall-cost-insights.server.ts`

## Data Sources

| Source | Usage |
|--------|-------|
| Recall billing API | Bot seconds, transcript seconds (`recall-billing.server.ts`) |
| S3 meeting index | Meeting counts, bot linkage, notes/transcript coverage |
| S3 bot-index | Bots created in range |

## Report Fields

- **Usage:** bot hours, bot cost, transcript cost, total USD
- **Meetings:** total S3 meetings, with bot, with transcript, with notes
- **Costs:** per-meeting and per-Recall-meeting averages; hourly rates
- **Calendar month:** rollup for current month
- **Daily:** per-day bot hours + costs (estimated when Recall rate-limits billing API — 5 calls/min)

## Key Behaviors

- Date range picker with session persistence (`recall-cost-session.ts`)
- Charts: daily cost line, meeting count bar
- Refresh + cached report display
- AI insights panel via Groq

## Environment

- Recall API key / billing config (see `recallBotHourRateUsd`, `recallTranscriptHourRateUsd`)

## Access

All authenticated roles (not in main nav; reachable via Notetaker sub-nav or direct URL)

## File Map

| File | Role |
|------|------|
| `src/routes/alyson-notetaker/cost-tracking.tsx` | Page |
| `src/lib/recall-cost-functions.ts` | Server API |
| `src/lib/recall-cost-report.server.ts` | Report builder |
| `src/lib/recall/recall-billing.server.ts` | Recall billing API |
