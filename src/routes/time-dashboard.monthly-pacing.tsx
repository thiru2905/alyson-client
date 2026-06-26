import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  Download,
  RefreshCw,
  Search,
  TrendingDown,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { PageHeader, TableScroll } from "@/components/AppShell";
import { FetchingBar } from "@/components/Skeleton";
import { TimeDashboardGate } from "@/components/TimeDashboardGate";
import { MonthlyPacingMonthPicker } from "@/components/MonthlyPacingMonthPicker";
import { WeeklyPacingActiveCell } from "@/components/WeeklyPacingActiveCell";
import { downloadCSV } from "@/lib/csv";
import { fmtDate } from "@/lib/format";
import { pacingTodayIso } from "@/lib/weekly-pacing";
import { monthYearFromIso, isPastMonth } from "@/lib/monthly-pacing";
import { useAuth } from "@/lib/auth";
import {
  filterPacingRows,
  formatActiveLabel,
  formatLeaveBreakdown,
  pacingFilterExportSlug,
  pacingFilterSummaryLabel,
  PACING_LEAVE_HOURS_PER_DAY,
  PACING_STATUS_LABEL,
  sortPacingRows,
  type WeeklyPacingRow,
  type WeeklyPacingSortField,
  type WeeklyPacingStatus,
} from "@/lib/weekly-pacing";
import {
  fetchMonthlyPacingReport,
  setWeeklyPacingActiveOverride,
} from "@/lib/time-doctor-pacing-functions";

export const Route = createFileRoute("/time-dashboard/monthly-pacing")({
  head: () => ({ meta: [{ title: "Monthly Pacing — Alyson HR" }] }),
  validateSearch: z
    .object({
      month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    })
    .parse,
  component: MonthlyPacingPage,
});

function statusClass(status: WeeklyPacingStatus): string {
  switch (status) {
    case "target_met":
      return "bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 ring-1 ring-emerald-500/30";
    case "on_track":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "behind":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-300";
    case "at_risk":
      return "bg-orange-500/15 text-orange-800 dark:text-orange-300";
    case "critical":
      return "bg-red-500/15 text-red-700 dark:text-red-300";
  }
}

function rowClass(row: WeeklyPacingRow): string {
  if (row.metTarget) return "bg-emerald-500/[0.06] hover:bg-emerald-500/10";
  if (row.leaveDays > 0) return "bg-sky-500/[0.05] hover:bg-sky-500/10";
  return "hover:bg-muted/30";
}

function MonthlyPacingPage() {
  const auth = useAuth();
  const canAccess = auth.canAccessTimeDashboard;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const today = pacingTodayIso();
  const defaultMonth = monthYearFromIso(today);

  const [sortBy, setSortBy] = useState<WeeklyPacingSortField>("hoursRemaining");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [searchQ, setSearchQ] = useState("");
  const [locationFilter, setLocationFilter] = useState("__all__");
  const [teamFilter, setTeamFilter] = useState("__all__");
  const [activeFilter, setActiveFilter] = useState("__all__");
  const [month, setMonth] = useState(search.month ?? defaultMonth);

  useEffect(() => {
    if (search.month) setMonth(search.month);
  }, [search.month]);

  const appliedMonth = search.month ?? defaultMonth;
  const draftMatchesApplied = month === appliedMonth;
  const isHistoricalMonth = isPastMonth(appliedMonth, today);

  const q = useQuery({
    queryKey: ["monthly-pacing-report", appliedMonth],
    queryFn: () => fetchMonthlyPacingReport({ data: { month: appliedMonth } }),
    enabled: canAccess,
    placeholderData: keepPreviousData,
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });

  const activeM = useMutation({
    mutationFn: (payload: {
      employeeId: string;
      email: string;
      name: string;
      active: boolean;
    }) => setWeeklyPacingActiveOverride({ data: payload }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["monthly-pacing-report"] });
      void queryClient.invalidateQueries({ queryKey: ["weekly-pacing-report"] });
    },
  });

  const isBusy = q.isFetching;
  const report = q.data;
  const allRows = report?.rows ?? [];

  const locationOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRows) set.add(r.location?.trim() || "__empty__");
    return [...set].sort((a, b) => {
      if (a === "__empty__") return 1;
      if (b === "__empty__") return -1;
      return a.localeCompare(b);
    });
  }, [allRows]);

  const teamOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRows) set.add(r.team?.trim() || "__empty__");
    return [...set].sort((a, b) => {
      if (a === "__empty__") return 1;
      if (b === "__empty__") return -1;
      return a.localeCompare(b);
    });
  }, [allRows]);

  const facetFilteredRows = useMemo(() => {
    return allRows.filter((r) => {
      const loc = r.location?.trim() || "__empty__";
      const team = r.team?.trim() || "__empty__";
      if (locationFilter !== "__all__" && loc !== locationFilter) return false;
      if (teamFilter !== "__all__" && team !== teamFilter) return false;
      if (activeFilter === "yes" && !r.active) return false;
      if (activeFilter === "no" && r.active) return false;
      return true;
    });
  }, [activeFilter, allRows, locationFilter, teamFilter]);

  const filteredRows = useMemo(
    () => filterPacingRows(facetFilteredRows, searchQ),
    [facetFilteredRows, searchQ],
  );

  const rows = useMemo(
    () => sortPacingRows(filteredRows, sortBy, sortDir),
    [filteredRows, sortBy, sortDir],
  );

  const facetFilters = useMemo(
    () => ({ location: locationFilter, team: teamFilter, active: activeFilter }),
    [activeFilter, locationFilter, teamFilter],
  );

  const filterSummary = useMemo(() => pacingFilterSummaryLabel(facetFilters), [facetFilters]);
  const hasAnyFilters =
    locationFilter !== "__all__" ||
    teamFilter !== "__all__" ||
    activeFilter !== "__all__" ||
    Boolean(searchQ.trim());

  const summary = useMemo(() => {
    let metTarget = 0;
    let underTarget = 0;
    let critical = 0;
    let atRisk = 0;
    let behind = 0;
    for (const r of filteredRows) {
      if (r.metTarget) metTarget += 1;
      else underTarget += 1;
      if (r.status === "critical") critical += 1;
      else if (r.status === "at_risk") atRisk += 1;
      else if (r.status === "behind") behind += 1;
    }
    return { metTarget, underTarget, critical, atRisk, behind };
  }, [filteredRows]);

  const leaveSummary = report?.leaveSummary;

  function applyMonth() {
    navigate({
      to: "/time-dashboard/monthly-pacing",
      search: { month },
      replace: true,
    });
  }

  function exportCsv() {
    if (!report || !rows.length) return;
    const slug = pacingFilterExportSlug(facetFilters);
    const csvHeaders = [
      "email",
      "name",
      "location",
      "team",
      "manager_name",
      "manager_email",
      "hours_worked",
      "avg_daily_pace_mon_thu",
      "projected_pace",
      "pace_vs_target",
      "hours_remaining",
      "hours_over_target",
      "pace_delta",
      "remaining_work_days",
      "required_hours_per_day",
      "active",
      "status",
    ] as const;
    downloadCSV(
      `monthly-pacing-${appliedMonth}${slug ? `-${slug}` : ""}.csv`,
      rows.map((r) => ({
        email: r.email,
        name: r.name,
        location: r.location ?? "",
        team: r.team ?? "",
        manager_name: r.managerName ?? "",
        manager_email: r.managerEmail ?? "",
        hours_worked: r.hoursWorked.toFixed(2),
        avg_daily_pace_mon_thu: r.avgDailyPace.toFixed(2),
        projected_pace: r.projectedPace.toFixed(2),
        pace_vs_target: r.paceDelta.toFixed(2),
        hours_remaining: r.hoursRemaining.toFixed(2),
        hours_over_target: r.hoursOver.toFixed(2),
        pace_delta: r.paceDelta.toFixed(2),
        remaining_work_days: r.remainingWorkDays,
        required_hours_per_day: r.requiredHoursPerDay.toFixed(2),
        active: formatActiveLabel(r.active),
        status: PACING_STATUS_LABEL[r.status],
      })),
      [...csvHeaders],
    );
    toast.success(`CSV downloaded (${rows.length} employees)`);
  }

  if (!canAccess) return <TimeDashboardGate />;

  return (
    <div className="ops-dense">
      <PageHeader
        eyebrow="People"
        title="Monthly Pacing Report"
        description={
          report
            ? `${report.company.name} · ${report.month.label} (${report.timeZoneLabel}) · as of ${fmtDate(report.today)} · Target ${report.targetHours}h (${report.totalWorkDays} workdays × ${PACING_LEAVE_HOURS_PER_DAY}h) · ${filteredRows.length}${hasAnyFilters ? `/${allRows.length}` : ""} employees${filterSummary ? ` · ${filterSummary}` : ""}`
            : "Loading monthly pacing from Time Doctor…"
        }
        dense
        actions={
          <>
            <Link
              to="/time-dashboard"
              className="h-8 px-3 rounded-md border border-border text-xs flex items-center gap-1.5 hover:bg-muted"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Time Dashboard
            </Link>
            <Link
              to="/time-dashboard/pacing"
              className="h-8 px-3 rounded-md border border-border text-xs flex items-center gap-1.5 hover:bg-muted"
            >
              Weekly Pacing
            </Link>
            <button
              type="button"
              onClick={() => (draftMatchesApplied ? void q.refetch() : applyMonth())}
              disabled={isBusy}
              className="h-8 px-3 rounded-md border border-border text-xs flex items-center gap-1.5 hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isBusy ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={!rows.length || isBusy}
              className="h-8 px-3 rounded-md border border-border text-xs flex items-center gap-1.5 hover:bg-muted disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </>
        }
      />

      <div className="px-5 md:px-8 py-6 space-y-5">
        <FetchingBar active={isBusy && !q.data} />

        {q.isError ? (
          <div className="surface-card p-4 text-sm text-destructive">
            {q.error instanceof Error ? q.error.message : "Failed to load monthly pacing"}
          </div>
        ) : null}

        {report ? (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <MonthlyPacingMonthPicker
                month={month}
                onMonthChange={setMonth}
                onApply={applyMonth}
                isBusy={isBusy}
                draftMatchesApplied={draftMatchesApplied}
              />
              <div className="relative w-full sm:max-w-xs">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Search name, email, location, team…"
                  className="w-full h-8 pl-8 pr-3 rounded-md border border-border bg-background text-[13px]"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <FacetSelect
                label="Location"
                value={locationFilter}
                onChange={setLocationFilter}
                options={locationOptions}
              />
              <FacetSelect
                label="Team"
                value={teamFilter}
                onChange={setTeamFilter}
                options={teamOptions}
              />
              <FacetSelect
                label="Active"
                value={activeFilter}
                onChange={setActiveFilter}
                options={["yes", "no"]}
                labels={{ yes: "Active", no: "Inactive" }}
              />
            </div>

            {isHistoricalMonth ? (
              <p className="text-[12px] text-muted-foreground">
                Viewing a completed month — metrics are frozen as of <strong>{fmtDate(report.today)}</strong>.
              </p>
            ) : (
              <p className="text-[12px] text-muted-foreground">
                Month-to-date through <strong>{fmtDate(report.today)}</strong> · projected pace extrapolates using
                average daily hours × remaining workdays.
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Kpi
                label="Target met"
                value={String(summary.metTarget)}
                hint={`≥ ${report.targetHours}h this month`}
                accent
              />
              <Kpi label="Under target" value={String(summary.underTarget)} />
              <Kpi
                label="On leave"
                value={String(leaveSummary?.employeesOnLeave ?? 0)}
                hint={`+${leaveSummary?.totalLeaveHoursCredit.toFixed(0) ?? 0}h credit`}
                icon={<Calendar className="h-3 w-3" />}
              />
              <Kpi
                label="Month progress"
                value={`${report.elapsedWorkDays}/${report.totalWorkDays}`}
                hint={`${report.remainingWorkDays} workday${report.remainingWorkDays === 1 ? "" : "s"} left`}
              />
              <Kpi
                label="Needs attention"
                value={String(summary.critical + summary.atRisk)}
                hint={`${summary.critical} critical · ${summary.atRisk} at risk`}
                icon={<TrendingDown className="h-5 w-5 text-orange-600" />}
              />
            </div>

            {leaveSummary && leaveSummary.teamLeaveEvents.length > 0 ? (
              <div className="surface-card p-4 space-y-2 border-sky-500/20 bg-sky-500/[0.03]">
                <div className="font-medium text-[13px]">Team leave this month</div>
                <div className="flex flex-wrap gap-2">
                  {leaveSummary.teamLeaveEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="rounded-md border border-sky-500/25 bg-background px-2.5 py-1.5 text-[11px]"
                    >
                      <span className="font-medium">{ev.teamLabel} · {ev.location}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {fmtDate(ev.startDate)} – {fmtDate(ev.endDate)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <p className="text-[12px] text-muted-foreground max-w-4xl">
              Same rules as Weekly Pacing: <strong>Worked</strong> = logged + leave credit (+{PACING_LEAVE_HOURS_PER_DAY}h/workday).
              Monthly target = all workdays in the month × {PACING_LEAVE_HOURS_PER_DAY}h (equivalent to 35h/week).
            </p>

            <TableScroll>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th align="left">Employee</th>
                    <th align="left">Location</th>
                    <th align="left">Team</th>
                    <th align="right">Logged</th>
                    <th align="right">Leave</th>
                    <th align="right">+Credit</th>
                    <th align="right">Worked</th>
                    <th align="right">Avg/day</th>
                    <th align="right">Remaining</th>
                    <th align="right">Projected</th>
                    <th align="left">Active</th>
                    <th align="left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="text-center text-muted-foreground py-8">
                        No employees match the current filters.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.id} className={rowClass(r)}>
                        <td>
                          <div className="font-medium">{r.name}</div>
                          <div className="text-[11px] text-muted-foreground">{r.email}</div>
                        </td>
                        <td>{r.location || "—"}</td>
                        <td>{r.team || "—"}</td>
                        <td align="right" className="font-mono tabular-nums text-muted-foreground">
                          {r.hoursWorkedLogged.toFixed(2)}h
                        </td>
                        <td align="right" className="font-mono tabular-nums" title={formatLeaveBreakdown(r)}>
                          {r.leaveDays > 0 ? `${r.leaveDays}d` : "—"}
                        </td>
                        <td align="right" className="font-mono tabular-nums text-sky-700 dark:text-sky-300">
                          {r.leaveHoursCredit > 0 ? `+${r.leaveHoursCredit.toFixed(1)}h` : "—"}
                        </td>
                        <td align="right" className="font-mono tabular-nums font-medium">
                          {r.hoursWorked.toFixed(2)}h
                        </td>
                        <td align="right" className="font-mono tabular-nums">
                          {r.avgDailyPace.toFixed(2)}h
                        </td>
                        <td align="right" className="font-mono tabular-nums">
                          {r.hoursRemaining > 0 ? `${r.hoursRemaining.toFixed(2)}h` : "—"}
                        </td>
                        <td align="right" className="font-mono tabular-nums">
                          {r.projectedPace.toFixed(2)}h
                        </td>
                        <td>
                          <WeeklyPacingActiveCell
                            row={r}
                            disabled={activeM.isPending}
                            onConfirmChange={(active) =>
                              activeM.mutate({
                                employeeId: r.id,
                                email: r.email,
                                name: r.name,
                                active,
                              })
                            }
                          />
                        </td>
                        <td>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClass(r.status)}`}
                          >
                            {PACING_STATUS_LABEL[r.status]}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </TableScroll>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  accent,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="surface-card p-4">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div
        className={`text-2xl font-semibold mt-1 ${accent ? "text-emerald-700 dark:text-emerald-300" : ""}`}
      >
        {value}
      </div>
      {hint ? <div className="text-[11px] text-muted-foreground mt-1">{hint}</div> : null}
    </div>
  );
}

function FacetSelect({
  label,
  value,
  onChange,
  options,
  labels,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  labels?: Record<string, string>;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 px-2 rounded-md border border-border bg-background text-[11px]"
      >
        <option value="__all__">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {labels?.[o] ?? (o === "__empty__" ? "Not set" : o)}
          </option>
        ))}
      </select>
    </label>
  );
}
