import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Loader2 } from "lucide-react";
import { FetchingBar } from "@/components/Skeleton";
import { filterPayrollAnalytics } from "@/lib/payroll-analytics";
import { getPayrollAnalytics } from "@/lib/payroll-functions";
import { useAuth } from "@/lib/auth";
import { payrollAuthPayload } from "@/lib/payroll-rbac-hooks";
import { fmtCurrency } from "@/lib/format";

export const Route = createFileRoute("/payroll/analytics")({
  head: () => ({ meta: [{ title: "Payroll analytics — Alyson HR" }] }),
  component: PayrollAnalyticsPage,
});

const TEAM_COLORS = ["#10b981", "#34d399", "#64748b", "#94a3b8", "#f59e0b", "#8b5cf6", "#06b6d4"];

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function PayrollAnalyticsPage() {
  const { canAccessPayroll, user } = useAuth();
  const clerkAuth = useClerkAuth();
  const [month, setMonth] = useState(currentMonth);
  const [teamFilter, setTeamFilter] = useState("__all__");
  const [locationFilter, setLocationFilter] = useState("__all__");
  const [payCycleFilter, setPayCycleFilter] = useState("__all__");
  const [paidFilter, setPaidFilter] = useState<"all" | "paid" | "unpaid">("all");

  const q = useQuery({
    queryKey: ["payroll-analytics", month],
    queryFn: async () =>
      getPayrollAnalytics({
        data: {
          month,
          payCycleFilter: "all",
          activeOnly: false,
          ...(await payrollAuthPayload(() => clerkAuth.getToken(), user?.email)),
        },
      }),
    staleTime: 15_000,
    enabled: clerkAuth.isSignedIn && canAccessPayroll,
    retry: 1,
  });

  const base = q.data;

  const teamOptions = useMemo(() => {
    if (!base) return [];
    return [...new Set(base.allRows.map((r) => r.team))].sort();
  }, [base]);

  const locationOptions = useMemo(() => {
    if (!base) return [];
    return [...new Set(base.allRows.map((r) => r.location))].sort();
  }, [base]);

  const cycleOptions = useMemo(() => {
    if (!base) return [];
    return [...new Set(base.allRows.map((r) => r.payCycle))].sort();
  }, [base]);

  const report = useMemo(() => {
    if (!base) return null;
    return filterPayrollAnalytics(base, {
      team: teamFilter,
      location: locationFilter,
      payCycle: payCycleFilter,
      paidOnly: paidFilter === "paid",
      unpaidOnly: paidFilter === "unpaid",
    });
  }, [base, teamFilter, locationFilter, payCycleFilter, paidFilter]);

  const teamPie = useMemo(
    () => report?.byTeam.map((t) => ({ name: t.team, value: t.totalUsd })) ?? [],
    [report],
  );

  const locationPie = useMemo(
    () => report?.byLocation.map((t) => ({ name: t.location, value: t.totalUsd })) ?? [],
    [report],
  );

  return (
    <div className="px-5 md:px-8 py-6 space-y-5">
      <FetchingBar active={q.isFetching} />

      <div className="surface-card p-4 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-medium text-[13px]">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            Payroll analytics
          </div>
          <div className="text-[12px] text-muted-foreground mt-1">
            Pay distribution by team, location, and pay cycle for the selected pay month.
          </div>
        </div>
        <label className="text-[12px] text-muted-foreground">
          Pay month
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="mt-1 block h-9 rounded-md border border-border bg-background px-2 text-[13px]"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <FilterSelect label="Team" value={teamFilter} onChange={setTeamFilter} options={teamOptions} />
        <FilterSelect label="Location" value={locationFilter} onChange={setLocationFilter} options={locationOptions} />
        <FilterSelect label="Pay cycle" value={payCycleFilter} onChange={setPayCycleFilter} options={cycleOptions} />
        <label className="text-[12px] text-muted-foreground">
          Payment status
          <select
            value={paidFilter}
            onChange={(e) => setPaidFilter(e.target.value as typeof paidFilter)}
            className="mt-1 block h-9 rounded-md border border-border bg-background px-2 text-[13px] min-w-[120px]"
          >
            <option value="all">All</option>
            <option value="paid">Paid only</option>
            <option value="unpaid">Unpaid only</option>
          </select>
        </label>
      </div>

      {q.isLoading ? (
        <div className="py-16 text-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin inline-block" />
        </div>
      ) : report ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Kpi label="Employees" value={String(report.summary.employeeCount)} />
            <Kpi label="Total USD" value={fmtCurrency(report.summary.totalUsd, { compact: true })} />
            <Kpi label="Total INR" value={fmtCurrency(report.summary.totalInr, { currency: "INR", compact: true })} />
            <Kpi label="Total PKR" value={fmtCurrency(report.summary.totalPkr, { currency: "PKR", compact: true })} />
            <Kpi label="Paid" value={`${report.summary.paidCount} / ${report.summary.employeeCount}`} />
            <Kpi label="Unpaid USD" value={fmtCurrency(report.summary.unpaidUsd, { compact: true })} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="By team (USD)">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={report.byTeam.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="team" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => fmtCurrency(Number(v ?? 0))} />
                  <Bar dataKey="totalUsd" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="By location (USD)">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={report.byLocation.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="location" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => fmtCurrency(Number(v ?? 0))} />
                  <Bar dataKey="totalUsd" fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Team share (USD)">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={teamPie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                    {teamPie.map((_, i) => (
                      <Cell key={i} fill={TEAM_COLORS[i % TEAM_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => fmtCurrency(Number(v ?? 0))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Pay cycle split">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={report.byPayCycle}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="payCycle" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => fmtCurrency(Number(v ?? 0))} />
                  <Bar dataKey="totalUsd" fill="var(--chart-3)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ChartCard title="Top compensation">
            <div className="overflow-x-auto">
              <table className="ops-table w-full text-[12px]">
                <thead>
                  <tr>
                    <th align="left">Employee</th>
                    <th align="left">Team</th>
                    <th align="left">Location</th>
                    <th align="right">Local</th>
                    <th align="right">USD</th>
                  </tr>
                </thead>
                <tbody>
                  {report.topByComp.map((r) => (
                    <tr key={r.employeeId}>
                      <td className="font-medium">{r.name}</td>
                      <td className="text-muted-foreground">{r.team}</td>
                      <td>{r.location}</td>
                      <td align="right" className="font-mono">
                        {fmtCurrency(r.totalLocal, { currency: r.localCurrency })}
                      </td>
                      <td align="right" className="font-mono">
                        {fmtCurrency(r.totalUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </>
      ) : null}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-4">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-display text-xl mt-1">{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="surface-card p-4">
      <div className="font-medium text-[13px] mb-3">{title}</div>
      {children}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="text-[12px] text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block h-9 rounded-md border border-border bg-background px-2 text-[13px] min-w-[140px]"
      >
        <option value="__all__">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
