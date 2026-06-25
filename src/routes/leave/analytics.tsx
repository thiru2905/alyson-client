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
import { leaveTypeLabel } from "@/lib/leave-schema";

export const Route = createFileRoute("/leave/analytics")({
  component: LeaveAnalyticsPage,
});

const QUERY_KEY = ["leave-analytics"];
const TEAM_COLORS = ["#3b82f6", "#60a5fa", "#64748b", "#94a3b8", "#f59e0b", "#8b5cf6", "#06b6d4"];

function LeaveAnalyticsPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [teamFilter, setTeamFilter] = useState("__all__");
  const [tookLeaveFilter, setTookLeaveFilter] = useState<"all" | "yes" | "no">("all");

  const q = useQuery({
    queryKey: [...QUERY_KEY, year],
    queryFn: () => getLeaveAnalytics({ data: { year } }),
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

    return {
      ...base,
      allLeave,
      byTeam,
      employeeBreakdown,
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
