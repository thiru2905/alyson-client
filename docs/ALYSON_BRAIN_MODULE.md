# Alyson Brain Module Documentation

## Purpose

Alyson Brain (`/alyson-brain`) is a natural-language HR intelligence dashboard. Ask a question with an employee name and date range; the system aggregates scoring, workspace activity, Time Doctor, pacing, bonus, leave, and (slow path) notetaker data, then generates AI insights.

## Route

- **File:** `src/routes/alyson-brain.tsx`
- **Component:** `AlysonBrainDashboard.tsx`
- **Path:** `/alyson-brain`

## Server Functions

| Function | Purpose |
|----------|---------|
| `fetchAlysonBrainDashboard` | Fast dashboard slice |
| `fetchAlysonBrainSlowData` | Meetings + tasks per employee |
| `fetchAlysonBrainInsights` | AI narrative (DeepSeek via `groq-chat.server`) |

## Data Sources

- Employee scoring, Google Workspace activity, Time Doctor hours
- Weekly/monthly pacing, bonus S3 ledger, leave S3 ledger
- Notetaker analytics + tasks (slow load)
- NL parsing: `alyson-brain-parse.server.ts` (name + date range from question)

## Key Behaviors

- Two-phase load: fast dashboard first, then slow slice + parallel AI insights
- Browser session persistence (`alyson-brain-session.ts`)
- PDF export (`alyson-brain-pdf.ts`)
- Suggested prompt chips

## Access

`super_admin`, `ceo`, `hr`, `manager`

## File Map

| File | Role |
|------|------|
| `src/lib/alyson-brain-functions.ts` | Server fn API |
| `src/lib/alyson-brain/alyson-brain-context.server.ts` | Dashboard assembly |
| `src/lib/alyson-brain/alyson-brain.server.ts` | AI narrative |
| `src/components/AlysonBrainDashboard.tsx` | UI |
