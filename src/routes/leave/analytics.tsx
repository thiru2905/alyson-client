import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Loader2, RefreshCw } from "lucide-react";
import { FetchingBar } from "@/components/Skeleton";
import { getLeaveAnalytics } from "@/lib/leave-ledger-functions";
import { useSuperAccessAuth } from "@/lib/super-access-rbac-hooks";
import { buildLeaveWeekdayBoard, LEAVE_WEEKDAY_LABELS } from "@/lib/leave-analytics";
import { leaveTypeLabel } from "@/lib/leave-schema";

export const Route = createFileRoute("/leave/analytics")({
  component: LeaveAnalyticsPage,
});

const QUERY_KEY = ["leave-analytics"];
const TEAM_COLORS = ["#3b82f6", "#60a5fa", "#64748b", "#94a3b8", "#f59e0b", "#8b5cf6", "#06b6d4"];

function LeaveAnalyticsPage() {
  const superAuth = useSuperAccessAuth();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [teamFilter, setTeamFilter] = useState("__all__");
  const [tookLeaveFilter, setTookLeaveFilter] = useState<"all" | "yes" | "no">("all");

  const q = useQuery({
    queryKey: [...QUERY_KEY, year],
    queryFn: async () => getLeaveAnalytics({ data: { year, ...(await superAuth()) } }),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const base = q.data;

  const teamOptions = useMemo(() => {
    if (!base) return [];
    return [...new Set(base.employeeBreakdown.map((e) => e.team))].sort();
  }, [base]);

  const report = useMemo(() => {
    if (!base) return null;

    let employeeBreakdown = base.employeeBreakdown;
    let allLeave = base.allLeave;
    let byTeam = base.byTeam;

    if (teamFilter !== "__all__") {
      employeeBreakdown = employeeBreakdown.filter((e) => e.team === teamFilter);
      allLeave = allLeave.filter((p) => p.team === teamFilter);
      byTeam = byTeam.filter((t) => t.team === teamFilter);
    }
    if (tookLeaveFilter === "yes") {
      employeeBreakdown = employeeBreakdown.filter((e) => e.tookLeave);
    } else if (tookLeaveFilter === "no") {
      employeeBreakdown = employeeBreakdown.filter((e) => !e.tookLeave);
    }

    const withLeave = employeeBreakdown.filter((e) => e.tookLeave).length;
    const activeEmployees = employeeBreakdown.length;
    const totalDays = allLeave.reduce((s, p) => s + p.days, 0);
    const weekdayBoard = buildLeaveWeekdayBoard(allLeave);

    return {
      ...base,
      allLeave,
      byTeam,
      employeeBreakdown,
      weekdayBoard,
      summary: {
        ...base.summary,
        totalDays,
        leaveCount: allLeave.length,
        activeEmployees,
        employeesWithLeave: withLeave,
        employeesWithoutLeave: Math.max(0, activeEmployees - withLeave),
        participationPct: activeEmployees ? Math.round((withLeave / activeEmployees) * 100) : 0,
      },
    };
  }, [base, teamFilter, tookLeaveFilter]);

  const participationPie = useMemo(
    () =>
      report
        ? [
            { name: "Took leave", value: report.summary.employeesWithLeave },
            { name: "No leave", value: report.summary.employeesWithoutLeave },
          ]
        : [],
    [report],
  );

  const teamParticipationChart = useMemo(
    () =>
      report?.byTeam.map((t) => ({
        team: t.team,
        withLeave: t.withLeave,
        withoutLeave: t.withoutLeave,
        totalDays: t.totalDays,
      })) ?? [],
    [report],
  );

  const weekdayTrendChart = useMemo(() => report?.weekdayBoard.trend ?? [], [report]);

  return (
    <div className="px-5 md:px-8 py-6 space-y-5">
      <FetchingBar active={q.isFetching} />

      <div className="surface-card p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-medium text-[13px]">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            Leave analytics
          </div>
          <div className="text-[12px] text-muted-foreground mt-1">
            Active employees only (Weekly Pacing Active status). Team participation and trends.
          </div>
        </div>
        <button
          type="button"
          onClick={() => void q.refetch()}
          disabled={q.isFetching}
          className="h-8 px-3 rounded-md border border-border text-xs font-medium hover:bg-muted flex items-center gap-1.5 self-start"
        >
          {q.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="h-8 px-2 rounded-md border border-border bg-background text-[12px]"
        >
          {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          className="h-8 px-2 rounded-md border border-border bg-background text-[12px]"
        >
          <option value="__all__">All teams</option>
          {teamOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={tookLeaveFilter}
          onChange={(e) => setTookLeaveFilter(e.target.value as "all" | "yes" | "no")}
          className="h-8 px-2 rounded-md border border-border bg-background text-[12px]"
        >
          <option value="all">All employees</option>
          <option value="yes">Took leave only</option>
          <option value="no">No leave only</option>
        </select>
      </div>

      {q.isLoading ? (
        <div className="surface-card p-10 text-center text-muted-foreground text-[13px]">Loading analytics…</div>
      ) : !report ? (
        <div className="surface-card p-10 text-center text-muted-foreground text-[13px]">No data</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Total leave days" value={String(report.summary.totalDays)} />
            <Stat label="Leave records" value={String(report.summary.leaveCount)} />
            <Stat label="Participation" value={`${report.summary.participationPct}%`} />
            <Stat
              label="With / without leave"
              value={`${report.summary.employeesWithLeave} / ${report.summary.employeesWithoutLeave}`}
            />
          </div>

          <div className="surface-card p-4 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
              <div>
                <div className="font-medium text-[13px]">Leave by day of week</div>
                <div className="text-[12px] text-muted-foreground mt-0.5">
                  Who took leave on Mon–Fri in {year}
                  {teamFilter !== "__all__" ? ` · ${teamFilter}` : ""}. Weekends excluded.
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px]">
                {report.weekdayBoard.columns.map((col) => (
                  <span
                    key={col.label}
                    className="px-2 py-1 rounded-md border border-border bg-muted/30 tabular-nums"
                  >
                    <span className="font-medium text-foreground">{col.label}</span>
                    <span className="text-muted-foreground"> · {col.totalDays}d · {col.uniqueEmployees} people</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="h-[220px]">
              {weekdayTrendChart.every((d) => d.totalDays === 0) ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekdayTrendChart} margin={{ left: 8, right: 8, top: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="totalDays" name="Leave days" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="uniqueEmployees" name="People" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {report.weekdayBoard.columns.map((col) => (
                <div
                  key={col.label}
                  className="rounded-lg border border-border bg-background/60 flex flex-col h-[min(360px,55vh)] min-h-[220px] overflow-hidden"
                >
                  <div className="px-3 py-2 border-b border-border bg-muted/20 shrink-0">
                    <div className="font-medium text-[12px]">{col.label}</div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">
                      {col.totalDays} day{col.totalDays === 1 ? "" : "s"} · {col.uniqueEmployees} people
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-2 pr-1 space-y-1.5">
                    {col.employees.length === 0 ? (
                      <div className="text-[11px] text-muted-foreground text-center py-6">No leave</div>
                    ) : (
                      col.employees.map((e) => (
                        <div
                          key={e.employeeId}
                          className="rounded-md border border-border/80 px-2 py-1.5 bg-background"
                          title={`${e.name} · ${e.team}`}
                        >
                          <div className="text-[11px] font-medium truncate">{e.name}</div>
                          <div className="text-[10px] text-muted-foreground flex justify-between gap-1">
                            <span className="truncate">{e.team}</span>
                            <span className="tabular-nums shrink-0">
                              {e.days}d
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="surface-ops overflow-x-auto">
            <div className="px-4 py-3 font-medium text-[13px]">Weekday pattern by employee ({year})</div>
            <table className="ops-table w-full min-w-[720px]">
              <thead>
                <tr>
                  <th align="left">Employee</th>
                  <th align="left">Team</th>
                  {LEAVE_WEEKDAY_LABELS.map((d) => (
                    <th key={d} align="right">
                      {d}
                    </th>
                  ))}
                  <th align="right">Total</th>
                </tr>
              </thead>
              <tbody>
                {report.weekdayBoard.employeeMatrix.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-muted-foreground text-[12px]">
                      No weekday leave in this period
                    </td>
                  </tr>
                ) : (
                  report.weekdayBoard.employeeMatrix.map((e) => (
                    <tr key={e.employeeId}>
                      <td className="font-medium">{e.name}</td>
                      <td className="text-muted-foreground">{e.team}</td>
                      {LEAVE_WEEKDAY_LABELS.map((d) => (
                        <td key={d} align="right" className="font-mono text-[12px]">
                          {e.byWeekday[d] > 0 ? e.byWeekday[d] : "—"}
                        </td>
                      ))}
                      <td align="right" className="font-mono font-medium">
                        {e.total}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="surface-card p-4">
              <div className="font-medium text-[13px]">Leave days over time</div>
              <div className="text-[12px] text-muted-foreground mt-0.5">Monthly totals in {year}</div>
              <div className="h-[260px] mt-3">
                {report.byMonth.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={report.byMonth} margin={{ left: 8, right: 10, top: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="totalDays" name="Leave days" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="surface-card p-4">
              <div className="font-medium text-[13px]">Active employee participation</div>
              <div className="text-[12px] text-muted-foreground mt-0.5">Who took leave in {year}</div>
              <div className="h-[260px] mt-3">
                {participationPie.every((p) => p.value === 0) ? (
                  <EmptyChart />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={participationPie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={88} paddingAngle={2}>
                        <Cell fill="#3b82f6" />
                        <Cell fill="#94a3b8" />
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          <div className="surface-card p-4">
            <div className="font-medium text-[13px]">Team participation</div>
            <div className="text-[12px] text-muted-foreground mt-0.5">
              Active employees who took leave vs did not (stacked by team)
            </div>
            <div className="h-[300px] mt-3">
              {teamParticipationChart.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={teamParticipationChart} margin={{ left: 8, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="team" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="withLeave" name="Took leave" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="withoutLeave" name="No leave" stackId="a" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="surface-card p-4">
              <div className="font-medium text-[13px]">Leave days by team</div>
              <div className="h-[280px] mt-3">
                {report.byTeam.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.byTeam} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.25} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="team" width={100} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="totalDays" name="Leave days" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="surface-card p-4">
              <div className="font-medium text-[13px]">By leave type</div>
              <div className="h-[280px] mt-3">
                {report.byLeaveType.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={report.byLeaveType.map((t) => ({
                          name: leaveTypeLabel(t.leaveType as never),
                          value: t.totalDays,
                        }))}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={88}
                        paddingAngle={2}
                      >
                        {report.byLeaveType.map((_, i) => (
                          <Cell key={i} fill={TEAM_COLORS[i % TEAM_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          <div className="surface-ops overflow-x-auto">
            <div className="px-4 py-3 font-medium text-[13px]">Employee breakdown ({year})</div>
            <table className="ops-table w-full min-w-[640px]">
              <thead>
                <tr>
                  <th align="left">Employee</th>
                  <th align="left">Team</th>
                  <th align="left">Status</th>
                  <th align="right">Days</th>
                  <th align="right"># Records</th>
                </tr>
              </thead>
              <tbody>
                {report.employeeBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-muted-foreground text-[12px]">
                      No active employees
                    </td>
                  </tr>
                ) : (
                  report.employeeBreakdown.map((e) => (
                    <tr key={e.employeeId}>
                      <td className="font-medium">{e.name}</td>
                      <td className="text-muted-foreground">{e.team}</td>
                      <td>
                        <span className={`pill ${e.tookLeave ? "pill-info" : "pill-neutral"}`}>
                          {e.tookLeave ? "Took leave" : "No leave"}
                        </span>
                      </td>
                      <td align="right" className="font-mono">
                        {e.totalDays || "—"}
                      </td>
                      <td align="right" className="text-muted-foreground">
                        {e.leaveCount || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-4">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function EmptyChart() {
  return <div className="h-full grid place-items-center text-[12px] text-muted-foreground">No data for this period</div>;
}
