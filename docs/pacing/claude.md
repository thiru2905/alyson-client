# Pacing Module — Claude Build Spec (Cursor / Claude handoff)

Paste this file into Cursor or Claude and implement **Weekly + Monthly Pacing** correctly. This is the **exact logic** used in Alyson HR Time Dashboard. Get monthly pacing right — formulas differ from weekly.

---

## 0. What pacing is

Pacing answers: *Is this employee on track to hit their hours target for the week / month / custom period?*

It combines:

1. **Time Doctor worklogs** (actual logged seconds → hours)
2. **Leave credit** from the Leave module S3 ledger (+8h per full leave weekday, +4h half-day)
3. A **projection** of where they’ll land if current daily pace continues
4. A **status** bucket: `target_met` | `on_track` | `behind` | `at_risk` | `critical`

Routes:

| Path | Purpose |
|------|---------|
| `/time-dashboard/pacing` | **Weekly pacing** (35h target) |
| `/time-dashboard/monthly-pacing` | **Monthly / custom-range pacing** (weekdays × 7h target) |

Parent: `/time-dashboard` (team hours). Both pages share leave credit, Active filtering, and status thresholds — **but projection math differs**.

---

## 1. Constants (do not invent different numbers)

```ts
WEEKLY_HOURS_TARGET = 35                 // weekly target
PACING_TARGET_HOURS_PER_WORKDAY = 7      // 35 / 5 — monthly & period target per weekday
PACING_LEAVE_HOURS_PER_DAY = 8           // full leave day credit
HALF_DAY_LEAVE_DAYS = 0.5                // → +4h credit
```

**Workday** = Monday–Friday only. Weekends never count for targets, leave days, or pace samples.

There is **no separate public holiday calendar**. “Holidays” in pacing = **team leave** blocks from Leave S3 (location ± team).

---

## 2. Shared building blocks

### 2.1 Timezone / “today”

- Rollup “today” comes from Time Doctor company timezone (`TIME_DOCTOR_TIMEZONE` override or company TZ; map may include `Asia/Kolkata`).
- Store all period dates as `YYYY-MM-DD`.
- Parse mid-day UTC (`T12:00:00Z`) when converting to Date to avoid DST edge flips.

### 2.2 Leave credit (identical for weekly + monthly)

Load leave from S3 (`leave/data.json`) for the period:

1. **Personal leave** events on the employee ledger (supports `halfDay`)
2. **Team leave** matching employee location + team (`all` team = whole location)

Union rules:

- Only Mon–Fri inside the report window
- Same calendar day: take **max** day-fraction (full day beats half day)
- Personal + team same day: **union** (never double-count)

```
leaveDays         = union of weekday fractions in range
leaveHoursCredit  = leaveDays × 8
# half day 0.5 → +4h
```

**Inactive employees:** leave credit = **0** (and Active = No).

Per sample day for pace charts:

```
dailyHours[i] = TD_hours(day) + leave_hours(day)   # 8 or 4 or 0
```

### 2.3 Status resolver (shared)

```ts
function resolvePacingStatus({ hoursWorked, projectedPace, hoursRemaining, remainingWorkDays, targetHours }) {
  if (hoursWorked >= targetHours) return "target_met";
  if (projectedPace >= targetHours) return "on_track";
  if (remainingWorkDays <= 0 && hoursRemaining > 0) return "critical";
  if (projectedPace < targetHours * 0.65 || (remainingWorkDays <= 1 && hoursRemaining > 8)) {
    return "critical";
  }
  if (projectedPace < targetHours * 0.85) return "at_risk";
  if (projectedPace < targetHours - 0.5) return "behind";
  return "on_track";
}
```

UI “ahead” is not a status enum — it’s positive `paceDelta` / projected ≥ target styling.

```
paceDelta = projectedPace − targetHours
hoursRemaining = max(0, target − hoursWorked) when under target else 0
hoursOver      = max(0, hoursWorked − target) when met else 0
requiredHoursPerDay = hoursRemaining / remainingWorkDays  (or hoursRemaining if 0 days left)
```

---

## 3. Weekly pacing logic

### Period

- ISO week Monday–Sunday containing the rollup day.
- Past weeks: rollup = **Friday**. Current week: rollup = today (capped).
- Fallback: if Monday-start worklogs are all zero, retry **Sunday-start** TD window.

### Target

```
targetHours = 35
```

### Actual

```
hoursWorkedLogged = weeklySeconds / 3600     // TD worklogs Mon → rollupDay
hoursWorked       = hoursWorkedLogged + leaveHoursCredit
```

### Projection (CRITICAL — not the same as monthly)

Pace sample = weekdays from **Monday through min(today, Thursday)** only  
(Friday’s hours are intentionally **not** in the pace sample.)

```
dailyHours[i]  = TD_h(day) + leave_h(day)   for each sample day
avgDailyPace   = mean(dailyHours)
projectedPace  = sum(dailyHours) + avgDailyPace
# i.e. Mon–Thu total + ONE average day ≈ project through Friday
# NOT: worked + avg × remainingDays
```

### Remaining calendar workdays

```
elapsedWorkDays   = weekdays Mon → rollupDay
totalWorkDays     = weekdays Mon → Sun  (typically 5)
remainingWorkDays = weekdays (rollupDay+1) → Sun
weekProgressPct   = elapsed / total × 100
```

---

## 4. Monthly pacing logic (implement this carefully)

### Period

- Default: calendar month `YYYY-MM` → `start = YYYY-MM-01`, `end = last day of month`.
- Or custom `start`/`end` (clamp to max **366** days).
- Rollup day:
  - Past month → month-end
  - Current month → today (clamped into month)
  - Custom range → today if in progress, else period end

### Target (EXPECTED HOURS)

```
totalWorkDays = count of Mon–Fri inclusive in [periodStart, periodEnd]
targetHours   = totalWorkDays × 7
```

Examples:

- Month with 22 weekdays → target **154h**
- Month with 20 weekdays → target **140h**

### Actual

```
hoursWorkedLogged = TD seconds(periodStart → rollupDay) / 3600
hoursWorked       = hoursWorkedLogged + leaveHoursCredit
```

### Projection (CRITICAL — differs from weekly)

Pace sample = **all elapsed weekdays** from period start through rollup day (inclusive).

```
dailyHours[i]  = TD_h(day) + leave_h(day)   for each elapsed weekday
avgDailyPace   = mean(dailyHours)           # 0 if no sample days
remainingWorkDays = weekdays from (rollupDay+1) through periodEnd
                    # 0 if rollupDay >= periodEnd

projectedPace =
  remainingWorkDays > 0
    ? hoursWorked + avgDailyPace × remainingWorkDays
    : hoursWorked
```

Round money-style to 2 decimals (`Math.round(x * 100) / 100`).

### Progress

```
elapsedWorkDays = weekdays periodStart → rollupDay
monthProgressPct = elapsed / totalWorkDays × 100
```

### Status

Same `resolvePacingStatus` as weekly, with this month’s `targetHours`.

---

## 5. Side-by-side formula cheat sheet

```
# SHARED
WORKDAY          = Mon–Fri
LEAVE_CREDIT     = leaveDays × 8          # inactive → 0
worked           = TD_logged_hours + LEAVE_CREDIT

# WEEKLY
target           = 35
sample           = Mon..min(Thu, rollup) weekdays
avg              = mean(dailyHours[sample])
projected        = sum(dailyHours[sample]) + avg

# MONTHLY / CUSTOM PERIOD / PAYROLL-STYLE PERIOD
target           = weekday_count(period) × 7
sample           = weekdays periodStart..rollup
avg              = mean(dailyHours[sample])
projected        = worked + avg × remaining_weekdays   # or worked if remaining=0
```

**Do not** reuse weekly projection for monthly. That is a common bug.

---

## 6. Data sources

| Need | Source |
|------|--------|
| Logged seconds | Time Doctor `GET /companies/{id}/worklogs` (`consolidated=1`, paginated). Worklogs only — not “poor time”. |
| Users | TD `GET /companies/{id}/users` |
| Company / TZ | TD company account + optional `TIME_DOCTOR_TIMEZONE` |
| Location / team / manager | Org-chart roster |
| Leave | S3 `leave/data.json` |
| Active overrides | S3 `pacing/active-overrides.json` |
| Active computed | Domain member list + force-inactive names/emails + Sabtain-team allowlist |

Drop TD users with empty email.

---

## 7. Active flag

Default filter: **Active = Yes**.

Computed Active:

1. Match employee against Cintara domain roster / org identity
2. Force **No** for hardcoded former/blocked names/emails
3. Sabtain Ashiq sourcer team: only allowlisted people → Yes
4. S3 override wins when present (`activeOverridden`)

Inactive → no leave credit in pacing rows.

---

## 8. Auth / gates

Two layers:

1. **RBAC** — Super Access emails and/or full-access emails see all rows; org-chart managers see direct reports only.
2. **Session unlock** — 6-digit Time Dashboard code (even for privileged users).

Server report builders may not re-filter; client/scoped fetch must apply manager scope.

---

## 9. Env vars

```bash
API_BASE_URL=https://webapi.timedoctor.com/v1.1
API_ACCESS_TOKEN=...                 # required Time Doctor bearer
TIME_DOCTOR_TIMEZONE=...             # optional IANA override for "today"

AWS_REGION=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
# Leave + pacing overrides live on HR orgchart bucket (e.g. alyson-hr-orgchart)

ALYSON_PACING_INSIGHTS_MODEL=...     # optional AI insights
ALYSON_PACING_INSIGHTS_MAX_TOKENS=...
```

No dedicated pacing cron — client `staleTime` + manual Refresh (weekly ~60s, monthly ~120s).

---

## 10. Suggested file layout

```
src/lib/weekly-pacing.ts                 # constants, week math, weekly row, status, filters
src/lib/monthly-pacing.ts                # month/period metrics + monthly projection
src/lib/time-doctor-pacing.server.ts     # orchestrate weekly/monthly/trend reports
src/lib/time-doctor-pacing-functions.ts  # createServerFn API
src/lib/weekly-pacing-leave.server.ts    # leave context + daily leave hours
src/lib/weekly-pacing-active.server.ts   # resolve Active
src/lib/weekly-pacing-active-s3.server.ts
src/lib/weekly-pacing-insights.server.ts # optional AI narrative
src/lib/payroll-pacing.server.ts         # reuse MONTHLY-style math for pay periods

src/routes/time-dashboard.pacing.tsx
src/routes/time-dashboard.monthly-pacing.tsx
src/components/WeeklyPacingWeekPicker.tsx
src/components/MonthlyPacingMonthPicker.tsx
src/components/MonthlyPacingPeriodPicker.tsx
src/components/WeeklyPacingTrendPanel.tsx
src/components/WeeklyPacingActiveCell.tsx
```

---

## 11. Server API contract

```ts
fetchWeeklyPacingReport({ targetHours?: 35, day?: "YYYY-MM-DD" })
fetchMonthlyPacingReport({ month?: "YYYY-MM" } | { start, end } | { day? })
fetchWeeklyHoursTrend({ weekCount?, filters..., managerEmail? })
setWeeklyPacingActiveOverride({ employeeId, email, name, active })
getWeeklyPacingInsights({ report, summary, rows, trend? })  // optional
```

Each row (shared shape) should expose at least:

`id, email, name, title, hoursWorkedLogged, leaveHoursCredit, hoursWorked, targetHours, avgDailyPace, projectedPace, paceDelta, hoursRemaining, hoursOver, requiredHoursPerDay, remainingWorkDays, status, active, leaveDays, …`

---

## 12. Edge cases checklist

- [ ] Weekends never in targets / leave / samples  
- [ ] Half-day leave = +4h, weekday only  
- [ ] Personal ∪ team leave, max fraction per day  
- [ ] Inactive → 0 leave credit  
- [ ] Monthly target = weekdays × 7 (not fixed 35×4)  
- [ ] Monthly projection = `worked + avg × remaining` (not weekly’s `sum + avg`)  
- [ ] Weekly projection sample stops at Thursday  
- [ ] Past month rollup = month-end; current = today  
- [ ] Custom range max 366 days with warning if clipped  
- [ ] Empty email users dropped  
- [ ] Sunday-start TD fallback when Mon-start empty (weekly)  
- [ ] Status thresholds: 0.65 critical, 0.85 at_risk, target−0.5 behind  
- [ ] Round to 2 decimals consistently  

---

## 13. Acceptance tests (numeric)

### Monthly

Given a month with **22 weekdays**, target must be **154**.

If through rollup an employee has:

- logged 70h  
- leave credit 8h (1 full day)  
- `hoursWorked = 78`  
- 10 elapsed sample weekdays with mean daily (including leave days) = 7.8  
- 12 remaining weekdays  

Then:

```
projectedPace = 78 + 7.8 × 12 = 171.6
paceDelta     = 171.6 − 154 = +17.6
status        = target_met if hoursWorked≥154 else on_track (projected ≥ target)
```

### Weekly

Target **35**. Sample Mon–Thu only.  
`projected = sum(Mon–Thu daily) + avg(Mon–Thu)` — **not** × remaining Fri.

### Leave

One approved half-day Wednesday → +4h to `leaveHoursCredit` and +4h into that day’s `dailyHours`.

---

## 14. Implementation order

1. Constants + weekday helpers + status resolver  
2. Leave load + union + credit (shared)  
3. TD worklog range loader  
4. **Monthly** metrics + projection + row builder  
5. Weekly metrics + Mon–Thu projection  
6. Active resolution + filters/sort  
7. UI pages + pickers  
8. Manager scope + unlock gate  
9. Trend / PDF / insights (optional)

---

## 15. Non-negotiable for “monthly pacing done properly”

1. `targetHours = weekday_count(month) × 7`  
2. `hoursWorked = TD_logged + leaveDays×8`  
3. `projectedPace = hoursWorked + avgDailyPace × remainingWorkDays`  
4. Same status thresholds as weekly  
5. Leave union rules + inactive = 0 credit  

If any of those five are wrong, monthly pacing is wrong.
