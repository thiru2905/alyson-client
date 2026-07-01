import { Loader2 } from "lucide-react";
import type {
  AlysonBrainDashboardPayload,
  AlysonBrainEmployeeDashboard,
  AlysonBrainInsights,
} from "@/lib/alyson-brain/alyson-brain-types";

function fmtNum(n: number | null | undefined, suffix = "") {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${typeof n === "number" && n % 1 !== 0 ? n.toFixed(1) : n}${suffix}`;
}

function gradeClass(grade: string | undefined) {
  switch (grade) {
    case "A":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "B":
      return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
    case "C":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-200";
    case "D":
      return "bg-orange-500/15 text-orange-800 dark:text-orange-200";
    default:
      return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
  }
}

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="surface-card px-4 py-3.5">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-[12px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function SectionCard({
  title,
  loading,
  empty,
  children,
}: {
  title: string;
  loading?: boolean;
  empty?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="surface-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h3 className="text-[12px] font-semibold text-foreground">{title}</h3>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      <div className="px-4 py-3 text-[13px]">
        {loading ? (
          <div className="space-y-2 py-2">
            <div className="h-2.5 w-full rounded bg-muted animate-pulse" />
            <div className="h-2.5 w-4/5 rounded bg-muted animate-pulse" />
            <p className="pt-1 text-[11px] text-muted-foreground">Loading transcript data…</p>
          </div>
        ) : empty ? (
          <p className="py-4 text-[12px] text-muted-foreground">No data for this period</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 py-2 last:border-0">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="text-[12px] font-medium tabular-nums">{value}</span>
    </div>
  );
}

function ScoreBar({ label, pct }: { label: string; pct: number }) {
  const v = Math.min(100, Math.max(0, pct));
  return (
    <div className="py-2">
      <div className="mb-1.5 flex justify-between text-[12px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{fmtNum(v)}%</span>
      </div>
      <div className="brain-progress-track">
        <div className="brain-progress-fill" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

function EmployeeDashboard({
  data,
  slowLoading,
}: {
  data: AlysonBrainEmployeeDashboard;
  slowLoading: boolean;
}) {
  const { employee, scoring, workspace, timeDoctor, weeklyPacing, monthlyPacing, bonus, leave, meetings, tasks } =
    data;

  return (
    <article className="space-y-5">
      <div className="border-b border-border pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">{employee.displayName}</h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {employee.email || "Employee not resolved"}
              {employee.queryName !== employee.displayName && (
                <span> · searched as &ldquo;{employee.queryName}&rdquo;</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {employee.matchConfidence !== "exact" && (
              <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                {employee.matchConfidence} match
              </span>
            )}
            {scoring?.grade && (
              <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${gradeClass(scoring.grade)}`}>
                Grade {scoring.grade}
              </span>
            )}
            {scoring?.rank != null && (
              <span className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                Rank #{scoring.rank}
              </span>
            )}
          </div>
        </div>
        {employee.alternatives?.length ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Did you mean: {employee.alternatives.join(" · ")}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Composite score"
          value={fmtNum(scoring?.compositeScore)}
          sub={scoring ? `Rank #${scoring.rank}` : undefined}
        />
        <KpiCard
          label="Work hours"
          value={fmtNum(timeDoctor?.rangeHours ?? scoring?.workHours, "h")}
          sub={timeDoctor ? `${fmtNum(timeDoctor.monthlyHours, "h")} this month` : undefined}
        />
        <KpiCard
          label="Leave taken"
          value={fmtNum(leave?.daysTakenInRange, " days")}
          sub={leave ? `${leave.leaveEventCount} events` : undefined}
        />
        <KpiCard
          label="Bonus paid"
          value={bonus ? `$${bonus.bonusPaidUsd.toLocaleString()}` : "—"}
          sub={bonus ? `$${bonus.totalBonusAllTime.toLocaleString()} all-time` : undefined}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <SectionCard title="Time & pacing" empty={!timeDoctor && !weeklyPacing && !monthlyPacing}>
          <MetricRow label="Range hours" value={fmtNum(timeDoctor?.rangeHours, "h")} />
          <MetricRow label="Daily hours" value={fmtNum(timeDoctor?.dailyHours, "h")} />
          <MetricRow label="Weekly hours" value={fmtNum(timeDoctor?.weeklyHours, "h")} />
          <MetricRow label="Monthly hours" value={fmtNum(timeDoctor?.monthlyHours, "h")} />
          {weeklyPacing && (
            <>
              <MetricRow
                label="Weekly pace"
                value={`${fmtNum(weeklyPacing.hoursWorked, "h")} / ${fmtNum(weeklyPacing.hoursExpected, "h")}`}
              />
              <MetricRow label="Weekly status" value={weeklyPacing.status.replace(/_/g, " ")} />
            </>
          )}
          {monthlyPacing && (
            <MetricRow
              label="Monthly pace"
              value={`${fmtNum(monthlyPacing.hoursWorked, "h")} / ${fmtNum(monthlyPacing.hoursExpected, "h")}`}
            />
          )}
        </SectionCard>

        <SectionCard title="Performance & scoring" empty={!scoring}>
          {scoring && (
            <>
              <ScoreBar label="Work hours" pct={scoring.percentile.workHours} />
              <ScoreBar label="Meetings" pct={scoring.percentile.meetings} />
              <ScoreBar label="Emails" pct={scoring.percentile.emails} />
              <ScoreBar label="Chat" pct={scoring.percentile.chat} />
              <ScoreBar label="Docs" pct={scoring.percentile.docs} />
            </>
          )}
        </SectionCard>

        <SectionCard title="Workspace activity" empty={!workspace}>
          <MetricRow label="Emails sent" value={fmtNum(workspace?.emailsSent)} />
          <MetricRow label="Meetings created" value={fmtNum(workspace?.meetingsCreated)} />
          <MetricRow label="Docs created" value={fmtNum(workspace?.docsCreated)} />
          <MetricRow label="Chat messages" value={fmtNum(workspace?.chatMessagesSent)} />
        </SectionCard>

        <SectionCard title="Leave & compensation" empty={!leave && !bonus}>
          <MetricRow label="Leave days" value={fmtNum(leave?.daysTakenInRange)} />
          <MetricRow label="Bonus in range" value={bonus ? `$${bonus.bonusPaidUsd}` : "—"} />
          <MetricRow label="Team" value={bonus?.team || leave?.team || "—"} />
          <MetricRow label="Role" value={bonus?.jobTitle || "—"} />
        </SectionCard>

        <SectionCard
          title="Meetings & speaking"
          loading={slowLoading && !meetings}
          empty={!slowLoading && !meetings}
        >
          {meetings && (
            <>
              <MetricRow label="Meetings" value={fmtNum(meetings.meetingsAttended)} />
              <MetricRow label="Transcripts analyzed" value={fmtNum(meetings.analyzedMeetings)} />
              <MetricRow label="Utterances" value={fmtNum(meetings.totalUtterances)} />
              <MetricRow label="Words spoken" value={fmtNum(meetings.totalWords)} />
              {meetings.topMeetings.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-border/60 pt-2">
                  {meetings.topMeetings.slice(0, 4).map((m, i) => (
                    <li key={i} className="text-[11px] text-muted-foreground">
                      <span className="text-foreground">{m.day}</span> — {m.title}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </SectionCard>

        <SectionCard title="Tasks & projects" loading={slowLoading && !tasks} empty={!slowLoading && !tasks}>
          {tasks && (
            <>
              <MetricRow label="Total tasks" value={fmtNum(tasks.taskCount)} />
              <MetricRow label="Open tasks" value={fmtNum(tasks.openCount)} />
              <MetricRow label="Meetings analyzed" value={fmtNum(tasks.meetingsAnalyzed)} />
              {tasks.tasks.length > 0 && (
                <ul className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
                  {tasks.tasks.slice(0, 5).map((t, i) => (
                    <li key={i} className="text-[12px]">
                      <span className="font-medium">{t.title}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {t.status} · {t.priority}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </SectionCard>
      </div>
    </article>
  );
}

export function AlysonBrainDashboardView({
  dashboard,
  insights,
  insightsLoading,
  slowLoadingByEmail,
  question,
}: {
  dashboard: AlysonBrainDashboardPayload;
  insights: AlysonBrainInsights | null;
  insightsLoading: boolean;
  slowLoadingByEmail: Record<string, boolean>;
  question: string;
}) {
  return (
    <div className="space-y-8">
      <div className="surface-card px-4 py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Report period
            </p>
            <p className="mt-0.5 font-display text-lg font-semibold">{dashboard.range.label}</p>
            <p className="mt-1 text-[12px] text-muted-foreground line-clamp-2">{question}</p>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Generated {new Date(dashboard.generatedAt).toLocaleString()}
          </p>
        </div>
      </div>

      {dashboard.warnings.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/8 px-3 py-2.5 text-[12px] text-amber-900 dark:text-amber-100">
          {dashboard.warnings.slice(0, 4).join(" · ")}
        </div>
      )}

      {dashboard.employees.map((emp, i) => (
        <div key={emp.employee.email || emp.employee.queryName}>
          {i > 0 && <hr className="mb-8 border-border" />}
          <EmployeeDashboard
            data={emp}
            slowLoading={Boolean(emp.employee.email && slowLoadingByEmail[emp.employee.email])}
          />
        </div>
      ))}

      <div className="surface-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div>
            <h3 className="text-[12px] font-semibold">Executive summary</h3>
            <p className="text-[11px] text-muted-foreground">AI-generated from report data</p>
          </div>
          {insightsLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        <div className="px-4 py-4">
          {insightsLoading ? (
            <div className="space-y-2">
              <div className="h-2.5 w-full rounded bg-muted animate-pulse" />
              <div className="h-2.5 w-[92%] rounded bg-muted animate-pulse" />
              <div className="h-2.5 w-[78%] rounded bg-muted animate-pulse" />
            </div>
          ) : (
            <p className="text-[13px] leading-[1.7] text-foreground/90 whitespace-pre-wrap">
              {insights?.narrative || "Summary will appear here once analysis completes."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
