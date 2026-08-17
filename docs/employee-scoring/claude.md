# Employee Scoring — Claude Build Spec

Paste this into Cursor/Claude to rebuild Alyson’s **Employee Scoring** (cohort-relative 0–100 grades).

**Related:** `docs/claude.md` (index) · **`docs/workspace-activity/claude.md`** · **`docs/leave/claude.md`** · **`docs/pacing/claude.md`** (leave hour semantics) · Time Doctor · speaker identity.

---

## 0. What this module is

Composite productivity score for a date window:

1. Pull **Workspace Activity** (with accurate meetings)
2. Pull **Time Doctor** hours
3. **Merge** multi-email identities into one person
4. Add **Leave credit** (+8h full weekday / +4h half-day)
5. Convert each metric to a cohort **percentile**, then weighted sum → grade A–F

Scores are **computed**, not written to an S3 ledger (short server memory cache only).

---

## 1. Routes & files

| Path | File |
|------|------|
| `/employee-scoring` | List |
| `/employee-scoring/$userEmail` | Detail — **requires** `?start&end` |
| `/api/analytics/employee-scoring*` | REST twins (harden auth!) |

| Lib | Role |
|-----|------|
| `employee-scoring-functions.ts` | List pipeline + cache |
| `employee-scoring-rules.ts` | Weights, percentile, grades |
| `employee-scoring-types.ts` | Response types |
| `employee-scoring-merge.server.ts` | Sum by canonical email |
| `employee-scoring-leave.server.ts` | Leave hour credit |
| `employee-scoring-detail-*.ts` | Detail payload |
| `employee-scoring-session.ts` | Client session |
| `employee-scoring-pdf.ts` | PDF |
| `employee-workspace-ai-analysis*.ts` | Groq focus clusters |
| `speaker-identity*.ts` | Canonical email index |
| `HourlyActivityReport.tsx` | Embedded hourly panel |

Nav: Ops → Employee Scoring (`roles: super_admin, ceo, hr`).

---

## 2. Weights (do not invent)

```ts
SCORING_WEIGHTS = {
  workHours: 0.60,      // 60%
  meetings:  0.167,     // 16.7%
  emails:    0.10,      // 10%
  chat:      0.08,      // 8%
  docs:      0.053,     // 5.3%
}
```

### Algorithm

1. For each metric, compute **mid-rank percentile** in the cohort (0–100)
2. `compositeScore = Σ (percentile × weight)`
3. Grade bands:
   - **A** ≥ 80
   - **B** ≥ 65
   - **C** ≥ 50
   - **D** ≥ 35
   - **F** else

Keep rules text in UI in sync with these constants.

---

## 3. Pipeline

```
runGetWorkspaceActivity({ start, end, accurateMeetings: true })
  ∥ fetchTimeDoctorEmployeesTable (clamp ~last 366 calendar days)
  → speaker-identity / resolveCanonicalEmail
  → merge rows: sum metrics across linked emails
  → load Leave S3 → leave credit into workSeconds
       (+8h × full weekdays, +4h × half-days; same union rules as pacing)
  → computeEmployeeScores → rank
```

Preserve raw TD hours separately if you show both:

- `workHoursLogged` = raw TD
- scoring input hours = logged + leave credit

---

## 4. Models

```ts
EmployeeScoreInput = {
  userEmail, displayName?
  emailsSent, meetingsCreated, docsCreated, chatMessagesSent
  workSeconds, windowDays
  linkedEmails?: string[]
  leaveDays?: number
  leaveHoursCredit?: number
}

EmployeeScoreRow = EmployeeScoreInput & {
  rank: number
  workHours: number
  hoursPerDay: number
  percentile: Record<metric, number>
  compositeScore: number
  grade: "A" | "B" | "C" | "D" | "F"
}

EmployeeScoringResponse = {
  range, timeDoctorRange, windowDays
  weights, rules
  rows: EmployeeScoreRow[]
  mergedAccountCount: number
  warnings: string[]
}

EmployeeScoringDetail = {
  score: EmployeeScoreRow
  workspace: WorkspaceUserActivityDetail  // merged across linked emails
  timeDoctor: { overview, topApps, topProjects }
}
```

---

## 5. Server functions

| Fn | Alyson auth today | Rebuild |
|----|-------------------|---------|
| `getEmployeeScoring` GET | Often ungated | **Add Super-access or role check** |
| `getEmployeeScoringDetail` GET | Often ungated | Same |
| `analyzeEmployeeWorkspaceFocus` GET | Often ungated | Same |

List cache ~**90 seconds** per `start|end` key.

Detail AI: build corpus from WA items → Groq JSON clusters; cache ~10 min; only when AI tab selected.

---

## 6. User flows

### List

1. Nav role gate (consider adding `SuperAccessGate`)
2. Restore session; presets 1/7/14/30/45/90
3. Fetch scoring; search by email/name/linkedEmails
4. Medals + grade badges; CSV/PDF
5. Optional hourly activity embed
6. Row → detail with same range query params

### Detail

1. Reuse list scoring; match primary or linked email
2. Merge WA details across mailboxes
3. Load TD user apps/projects
4. Tabs: overview | emails | chat | docs | meetings | Time Doctor | AI focus

---

## 7. Leave credit contract

Must match Leave + pacing:

```
PACING_LEAVE_HOURS_PER_DAY = 8
half day → 4h
weekdays only; max fraction per day when personal∪team overlap
```

Source: `getLeaveFromS3` / `loadPacingLeaveContext`.

---

## 8. Identity merge

Use Google Directory ⊕ Time Doctor roster (`speaker-identity`) so the same human with multiple emails becomes one scored row. Rank **after** merge. Surface `linkedEmails` in the UI so operators understand merges.

---

## 9. Gotchas

1. Weak server RBAC in original Alyson — fix it
2. TD window is calendar-clamped; may differ slightly from ISO WA window — expose both in response
3. Accurate meetings makes Scoring slow — cache + warn
4. Don’t double-count leave into displayed “logged” hours
5. REST analytics twins need auth

---

## 10. Env

```bash
# Via Workspace Activity
GOOGLE_DWD_SERVICE_ACCOUNT_JSON=...
GOOGLE_WORKSPACE_ADMIN_SUBJECT_EMAIL=...
# Time Doctor
TIME_DOCTOR_*=...
# Leave S3
ALYSON_HR_ORGCHART_S3_BUCKET=alyson-hr-orgchart
AWS_*=...
# AI focus
GROQ_API_KEY=...
```

---

## 11. Build checklist

- [ ] Pure scoring rules (weights + percentile + grades)
- [ ] WA + TD fetch with accurate meetings
- [ ] Canonical email merge
- [ ] Leave hour credit matching pacing
- [ ] List + detail UI + exports + session
- [ ] Optional AI focus tab
- [ ] Server auth hardened
- [ ] Secure REST twins

---

## 12. Implementation prompt

> Implement Employee Scoring per `docs/employee-scoring/claude.md`. Weights 60/16.7/10/8/5.3, mid-rank percentiles, grades A–F. Pipeline: Workspace Activity (accurate meetings) + Time Doctor + identity merge + Leave +8h/+4h credit. Harden server auth. Detail page merges linked emails and optional Groq focus analysis.
