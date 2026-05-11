import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchOverview } from "@/lib/queries";
import { fetchPayrollRuns, fetchBonusAwards, fetchWorkflows, fetchVestingEvents } from "@/lib/queries-ext";
import { PageHeader, EmptyState } from "@/components/AppShell";
import { PageSkeleton } from "@/components/Skeleton";
import { KpiCard } from "@/components/KpiCard";
import { Drawer } from "@/components/Drawer";
import { fmtCurrency, fmtNumber } from "@/lib/format";
import { useAuth, ROLE_LABEL } from "@/lib/auth";
import { useState, useMemo } from "react";
import {
  Users,
  DollarSign,
  TrendingUp,
  Gift,
  AlertCircle,
  Inbox,
  PieChart as PieIcon,
  Calendar as CalIcon,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Area,
  AreaChart,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { buildForecast, SCENARIO_LABEL, type Scenario, type ForecastPoint } from "@/lib/forecast";

type DrillKind = null | { kind: "kpi"; metric: KpiKey } | { kind: "forecast"; point: ForecastPoint; scenario: Scenario };

type KpiKey =
  | "totalComp"
  | "bonus"
  | "headcount"
  | "perf"
  | "payrollNext"
  | "payroll3"
  | "payroll6"
  | "equity3"
  | "equity6";

export function DashboardPage() {
  const { primaryRole, user } = useAuth();
  const overview = useQuery({ queryKey: ["overview"], queryFn: fetchOverview });
  const runs = useQuery({ queryKey: ["payroll-runs"], queryFn: fetchPayrollRuns });
  const awards = useQuery({ queryKey: ["bonus-awards"], queryFn: fetchBonusAwards });
  const workflows = useQuery({ queryKey: ["workflows"], queryFn: fetchWorkflows });
  const vesting = useQuery({ queryKey: ["vesting-events"], queryFn: fetchVestingEvents });

  const [scenario, setScenario] = useState<Scenario>("base");
  const [drill, setDrill] = useState<DrillKind>(null);

  const employees = overview.data?.employees ?? [];
  const history = overview.data?.history ?? [];
  const totalComp = employees.reduce((s, e) => s + e.total_comp, 0);
  const totalBonus = (awards.data ?? []).reduce((s, a) => s + Number(a.predicted_amount), 0);
  const headcount = employees.length;
  const avgPerf = employees.reduce((s, e) => s + Number(e.performance_score), 0) / Math.max(1, employees.length);
  const monthlyPayroll = totalComp / 12;
  const monthlyEquityCost = (vesting.data ?? []).slice(0, 6).reduce((s, v) => s + Number(v.shares_vested), 0) * 12 / 6;

  const forecast3 = useMemo(
    () => buildForecast(monthlyPayroll, totalBonus, monthlyEquityCost, 3, scenario),
    [monthlyPayroll, totalBonus, monthlyEquityCost, scenario],
  );
  const forecast6 = useMemo(
    () => buildForecast(monthlyPayroll, totalBonus, monthlyEquityCost, 6, scenario),
    [monthlyPayroll, totalBonus, monthlyEquityCost, scenario],
  );
  const forecast12 = useMemo(
    () => buildForecast(monthlyPayroll, totalBonus, monthlyEquityCost, 12, scenario),
    [monthlyPayroll, totalBonus, monthlyEquityCost, scenario],
  );

  const byDept = useMemo(() => {
    const m = new Map<string, number>();
    employees.forEach((e) => m.set(e.department_name, (m.get(e.department_name) ?? 0) + 1));
    return Array.from(m.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [employees]);

  if (overview.isLoading) return <PageSkeleton />;
  if (!overview.data) return null;

  const trendComp = history.slice(-12).map((h) => Number(h.total_compensation));
  const pendingWf = (workflows.data ?? []).filter((w) => w.status === "pending").length;

  const payrollNext = forecast12[0]?.payroll ?? 0;
  const payroll3Total = forecast3.reduce((s, p) => s + p.payroll, 0);
  const payroll6Total = forecast6.reduce((s, p) => s + p.payroll, 0);
  const equity3Total = forecast3.reduce((s, p) => s + p.equityCost, 0);
  const equity6Total = forecast6.reduce((s, p) => s + p.equityCost, 0);

  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  const payrollChange =
    last && prev
      ? ((Number(last.total_compensation) - Number(prev.total_compensation)) / Number(prev.total_compensation)) * 100
      : 0;

  const roleHello = ROLE_LABEL[primaryRole];
  const greeting = (user?.email ?? "").split("@")[0];
  const wfRows = workflows.data ?? [];
  const runRows = runs.data ?? [];

  return (
    <div className="ops-dense">
      <PageHeader
        eyebrow={`Signed in as ${roleHello}`}
        title={`Good ${timeOfDay()}, ${capitalize(greeting)}.`}
        description="Forward-looking command center for people, pay, and equity."
        actions={
          <div className="inline-flex rounded-md border border-border p-0.5 bg-paper">
            {(["conservative", "base", "growth"] as Scenario[]).map((s) => (
              <button
                key={s}
                onClick={() => setScenario(s)}
                className={
                  "h-7 px-2.5 rounded text-[11.5px] font-medium transition-colors " +
                  (scenario === s ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")
                }
              >
                {SCENARIO_LABEL[s]}
              </button>
            ))}
          </div>
        }
      />

      <div className="px-5 md:px-8 py-6 md:py-7 space-y-6 md:space-y-7">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <button onClick={() => setDrill({ kind: "kpi", metric: "totalComp" })} className="text-left">
            <KpiCard
              label="Total compensation"
              value={fmtCurrency(totalComp, { compact: true })}
              hint="annualized"
              icon={DollarSign}
              trend={trendComp}
              change={payrollChange}
            />
          </button>
          <button onClick={() => setDrill({ kind: "kpi", metric: "bonus" })} className="text-left">
            <KpiCard label="Bonus pool (Q)" value={fmtCurrency(totalBonus, { compact: true })} hint="predicted" icon={Gift} />
          </button>
          <button onClick={() => setDrill({ kind: "kpi", metric: "headcount" })} className="text-left">
            <KpiCard label="Headcount" value={fmtNumber(headcount)} hint="active employees" icon={Users} />
          </button>
          <button onClick={() => setDrill({ kind: "kpi", metric: "perf" })} className="text-left">
            <KpiCard label="Avg performance" value={avgPerf.toFixed(2)} hint="of 5.0" icon={TrendingUp} />
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <button onClick={() => setDrill({ kind: "kpi", metric: "payrollNext" })} className="text-left">
            <KpiCard label="Payroll next month" value={fmtCurrency(payrollNext, { compact: true })} hint={SCENARIO_LABEL[scenario]} icon={CalIcon} />
          </button>
          <button onClick={() => setDrill({ kind: "kpi", metric: "payroll3" })} className="text-left">
            <KpiCard label="Payroll next 3mo" value={fmtCurrency(payroll3Total, { compact: true })} hint="projected" icon={DollarSign} />
          </button>
          <button onClick={() => setDrill({ kind: "kpi", metric: "payroll6" })} className="text-left">
            <KpiCard label="Payroll next 6mo" value={fmtCurrency(payroll6Total, { compact: true })} hint="projected" icon={DollarSign} />
          </button>
          <button onClick={() => setDrill({ kind: "kpi", metric: "equity6" })} className="text-left">
            <KpiCard label="Equity expense 6mo" value={fmtCurrency(equity6Total, { compact: true })} hint="vesting cost" icon={PieIcon} />
          </button>
        </div>

        <div className="surface-card p-4 md:p-5">
          <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
            <div>
              <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium">Forward 12 months</div>
              <h3 className="font-display text-lg mt-0.5">Payroll + bonus + equity projection</h3>
            </div>
            <div className="text-[11px] text-muted-foreground">Click any month to inspect contributing employees & assumptions.</div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart
              data={forecast12}
              margin={{ top: 5, right: 10, bottom: 0, left: 0 }}
              onClick={(e: any) => {
                const idx = e?.activeTooltipIndex;
                if (typeof idx === "number" && forecast12[idx]) setDrill({ kind: "forecast", point: forecast12[idx], scenario });
              }}
            >
              <defs>
                <linearGradient id="grad-pay" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip
                contentStyle={{ background: "var(--paper)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
                formatter={(v: any, name: any) => [fmtCurrency(Number(v ?? 0)), String(name)] as [string, string]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="payroll" stroke="var(--chart-1)" fill="url(#grad-pay)" name="Payroll" />
              <Area type="monotone" dataKey="bonus" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.18} name="Bonus" />
              <Area type="monotone" dataKey="equityCost" stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.18} name="Equity" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
          <div className="lg:col-span-2 surface-card p-4 md:p-5">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium">Historical</div>
                <h3 className="font-display text-lg mt-0.5">Total compensation over time</h3>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={history.slice(-12)} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="period"
                  tickFormatter={(v) => new Date(v).toLocaleDateString("en", { month: "short" })}
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: "var(--paper)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
                  formatter={(v) => fmtCurrency(Number(v))}
                />
                <Line type="monotone" dataKey="total_compensation" stroke="var(--primary)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="surface-card p-4 md:p-5">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium">Inbox</div>
                <h3 className="font-display text-lg mt-0.5">Pending approvals</h3>
              </div>
              <span className="pill pill-warning">{pendingWf}</span>
            </div>
            <div className="space-y-2">
              {wfRows.slice(0, 5).map((w) => (
                <Link
                  key={w.id}
                  to="/workflows"
                  className="flex items-start gap-2 py-1.5 border-b border-border last:border-0 hover:bg-muted/40 -mx-2 px-2 rounded"
                >
                  <AlertCircle className="h-3.5 w-3.5 text-warning mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] truncate">{w.subject}</div>
                    <div className="text-[11px] text-muted-foreground capitalize">
                      {w.module} · step {w.current_step + 1}
                    </div>
                  </div>
                </Link>
              ))}
              {wfRows.length === 0 && (
                <div className="py-6 text-center">
                  <Inbox className="h-5 w-5 text-muted-foreground mx-auto mb-1.5" />
                  <div className="text-xs text-muted-foreground">All clear.</div>
                </div>
              )}
            </div>
            <Link to="/workflows" className="text-xs text-primary mt-3 inline-flex items-center gap-1 hover:underline">
              Open inbox <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
          <div className="surface-card p-4 md:p-5">
            <h3 className="font-display text-lg mb-3">Headcount by org unit</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byDept} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 10 }}>
                <CartesianGrid stroke="var(--border)" horizontal={false} />
                <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis dataKey="name" type="category" width={110} stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip contentStyle={{ background: "var(--paper)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} />
                <Bar dataKey="count" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="surface-card p-4 md:p-5">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="font-display text-lg">Recent payroll runs</h3>
              <Link to="/payroll" className="text-xs text-primary hover:underline">
                View all →
              </Link>
            </div>
            {runRows.length === 0 ? (
              <EmptyState icon={DollarSign} title="No payroll runs yet" />
            ) : (
              <div className="space-y-1.5">
                {runRows.slice(0, 5).map((r) => (
                  <Link
                    key={r.id}
                    to="/payroll"
                    className="flex items-center justify-between py-2 px-2 -mx-2 rounded hover:bg-muted/40 border-b border-border last:border-0"
                  >
                    <div>
                      <div className="text-[13px] font-medium">
                        {new Date(r.period).toLocaleDateString("en", { month: "long", year: "numeric" })}
                      </div>
                      <div className="text-[11px] text-muted-foreground capitalize">
                        {String(r.status).replace(/_/g, " ")} · {r.total_employees} ppl
                      </div>
                    </div>
                    <div className="font-mono text-[13px]">{fmtCurrency(Number(r.total_amount), { compact: true })}</div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Drawer
        open={drill !== null}
        onClose={() => setDrill(null)}
        title={drill?.kind === "forecast" ? `${drill.point.label} forecast` : drill?.kind === "kpi" ? KPI_META[drill.metric].title : ""}
        eyebrow={
          drill?.kind === "forecast"
            ? `${SCENARIO_LABEL[drill.scenario]} · ${drill.point.period.slice(0, 7)}`
            : drill?.kind === "kpi"
              ? "KPI explainer"
              : undefined
        }
        width="lg"
      >
        {drill?.kind === "kpi" && (
          <KpiDrill
            metric={drill.metric}
            ctx={{
              totalComp,
              totalBonus,
              headcount,
              avgPerf,
              payrollNext,
              payroll3Total,
              payroll6Total,
              equity3Total,
              equity6Total,
              scenario,
            }}
          />
        )}
        {drill?.kind === "forecast" && <ForecastDrill point={drill.point} employees={employees} />}
      </Drawer>
    </div>
  );
}

const KPI_META: Record<KpiKey, { title: string; formula: string; plain: string; sources: string[] }> = {
  totalComp: {
    title: "Total compensation",
    formula: "Σ(base + (base * bonus_pct/100 * perf/3) + equity + benefits)",
    plain:
      "Annualized cost of all currently-active employees, including benefits and effective bonus weighted by performance.",
    sources: ["employees", "compensation"],
  },
  bonus: {
    title: "Bonus pool",
    formula: "Σ predicted_amount where status ∈ {draft, simulated, manager_approved, finance_approved}",
    plain: "Sum of all predicted bonus awards in the active cycle, before final approvals.",
    sources: ["bonus_awards"],
  },
  headcount: {
    title: "Headcount",
    formula: "COUNT(employees WHERE termination_date IS NULL)",
    plain: "Active employees across all employment types.",
    sources: ["employees"],
  },
  perf: {
    title: "Average performance",
    formula: "AVG(employees.performance_score)",
    plain: "Cross-org performance score (1–5). Heavily smoothed — pair with calibration.",
    sources: ["employees"],
  },
  payrollNext: {
    title: "Payroll next month",
    formula: "totalComp/12 * (1 + scenario_growth)",
    plain: "Projected payroll for the next month under the selected scenario.",
    sources: ["compensation", "scenario inputs"],
  },
  payroll3: {
    title: "Payroll — next 3 months",
    formula: "Σ payroll_month for months 1..3",
    plain: "Sum of the next three months of projected payroll.",
    sources: ["compensation", "scenario inputs"],
  },
  payroll6: {
    title: "Payroll — next 6 months",
    formula: "Σ payroll_month for months 1..6",
    plain: "Sum of the next six months of projected payroll.",
    sources: ["compensation", "scenario inputs"],
  },
  equity3: {
    title: "Equity cost — next 3 months",
    formula: "vesting_cost_monthly * 3 * scenario_factor",
    plain: "Projected equity expense from vesting events under the selected scenario.",
    sources: ["vesting_events", "equity_grants"],
  },
  equity6: {
    title: "Equity cost — next 6 months",
    formula: "vesting_cost_monthly * 6 * scenario_factor",
    plain: "Projected equity expense from vesting events under the selected scenario.",
    sources: ["vesting_events", "equity_grants"],
  },
};

function KpiDrill({ metric, ctx }: { metric: KpiKey; ctx: any }) {
  const m = KPI_META[metric];
  const value = ctx[metric] as number | undefined;
  return (
    <div className="p-5 space-y-5">
      {typeof value === "number" && (
        <div className="surface-card p-4 bg-muted/30">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Current value</div>
          <div className="font-display text-3xl mt-1">{metric === "perf" ? value.toFixed(2) : fmtCurrency(value, { compact: true })}</div>
        </div>
      )}
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Plain English</div>
        <p className="text-[13.5px] leading-relaxed">{m.plain}</p>
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Formula</div>
        <code className="block font-mono text-[12px] bg-muted/60 p-3 rounded whitespace-pre-wrap break-words">{m.formula}</code>
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Source tables</div>
        <div className="flex flex-wrap gap-1.5">{m.sources.map((s) => <span key={s} className="pill pill-neutral font-mono">{s}</span>)}</div>
      </div>
      <div className="text-[11px] text-muted-foreground border-t border-border pt-4">
        Need a deeper breakdown? Open{" "}
        <Link to="/reports" className="text-primary hover:underline">
          Reports & KPIs
        </Link>{" "}
        for full lineage.
      </div>
    </div>
  );
}

function ForecastDrill({ point, employees }: { point: ForecastPoint; employees: any[] }) {
  const top = [...employees].sort((a, b) => b.total_comp - a.total_comp).slice(0, 8);
  const total = point.payroll + point.bonus + point.equityCost;
  return (
    <div className="p-5 space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Mini label="Payroll" value={point.payroll} />
        <Mini label="Bonus" value={point.bonus} />
        <Mini label="Equity" value={point.equityCost} />
      </div>
      <div className="surface-card p-4 bg-muted/30">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Total month cost</div>
        <div className="font-display text-2xl mt-1">{fmtCurrency(total)}</div>
        <div className="text-[11px] text-muted-foreground mt-1">
          Cumulative through {point.label}: {fmtCurrency(point.cumulative)}
        </div>
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Top contributors (by total comp)</div>
        <div className="space-y-1">
          {top.map((e) => (
            <div key={e.id} className="flex items-center justify-between text-[13px] py-1.5 border-b border-border last:border-0">
              <div className="min-w-0 flex-1 truncate">{e.full_name}</div>
              <div className="text-muted-foreground text-[11px] mr-3 truncate hidden sm:block">{e.role}</div>
              <div className="font-mono">{fmtCurrency(e.total_comp / 12, { compact: true })}/mo</div>
            </div>
          ))}
        </div>
      </div>
      <div className="text-[11px] text-muted-foreground border-t border-border pt-4 leading-relaxed">
        <Sparkles className="h-3 w-3 inline-block mr-1 text-primary" />
        Assumptions: monthly payroll grows at the scenario rate; bonus accrues evenly across the year; equity expense is amortized
        from the next 6 vesting events.
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="surface-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display text-lg mt-1">{fmtCurrency(value, { compact: true })}</div>
    </div>
  );
}

function timeOfDay() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}
function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
