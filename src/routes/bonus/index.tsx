import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  LineChart,
  Line,
  CartesianGrid,
  Legend as ReLegend,
} from "recharts";

import { useAuth } from "@/lib/auth";
import { fmtCurrency } from "@/lib/format";
import { allocateBonus, normalizeInputs } from "@/lib/bonus/engine";
import { DEFAULT_BONUS_INPUTS } from "@/lib/bonus/mock";
import type { BonusCategory, BonusEmployee, BonusInputs } from "@/lib/bonus/types";
import { fetchOverview, type EmployeeFull } from "@/lib/queries";
import { buildAnnualTrend, buildMonthlyTrendForYear } from "@/lib/bonus/trends";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export const Route = createFileRoute("/bonus/")({
  component: BonusOverviewPage,
});

const CATEGORY_LABEL: Record<BonusCategory, string> = {
  TOP_MGMT: "Top Performer (Management)",
  TOP_EPD: "Top Performer (EPD)",
  GOOD: "Good Standing",
  PIP: "PIP (Ineligible)",
  NOTICE: "Notice/Resigned (Ineligible)",
};

function BonusOverviewPage() {
  const { hasRole } = useAuth();
  const canEditAll = hasRole("super_admin");
  const canEditControls = canEditAll || hasRole("ceo");

  const [inputs, setInputs] = useState<BonusInputs>(DEFAULT_BONUS_INPUTS);
  const overview = useQuery({ queryKey: ["overview"], queryFn: fetchOverview });
  const [employees, setEmployees] = useState<BonusEmployee[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [trendMode, setTrendMode] = useState<"annual" | "monthly">("annual");
  const [trendYear, setTrendYear] = useState<number>(2027);
  const [compareYears, setCompareYears] = useState<number[]>([2027, 2030]);

  const normalized = useMemo(() => normalizeInputs(inputs), [inputs]);
  const allocation = useMemo(() => allocateBonus(employees, normalized), [employees, normalized]);

  // Sync bonus employees from People directory (once data loads).
  // We intentionally keep edits local to the Bonus module state.
  useEffect(() => {
    if (!overview.data?.employees?.length) return;
    setEmployees((prev) => {
      if (prev.length > 0) return prev;
      return overview.data.employees.map(mapEmployeeToBonus);
    });
  }, [overview.data?.employees]);

  const donutData = useMemo(
    () => [
      { name: "Management", value: allocation.totals.mgmt },
      { name: "EPD", value: allocation.totals.epd },
      { name: "Good Standing", value: allocation.totals.good },
      { name: "Ineligible", value: allocation.totals.ineligible },
    ],
    [allocation.totals]
  );

  const barData = useMemo(
    () => [
      {
        name: "Pool",
        Management: allocation.totals.mgmt,
        EPD: allocation.totals.epd,
        Good: allocation.totals.good,
      },
    ],
    [allocation.totals]
  );

  const onSet = <K extends keyof BonusInputs>(k: K, v: BonusInputs[K]) => setInputs((p) => ({ ...p, [k]: v }));

  const annualTrend = useMemo(() => {
    const synthetic = buildAnnualTrend({ startYear: 2021, endYear: 2030, seed: 77 });
    // If real history exists, blend by replacing matching years.
    const history = overview.data?.history ?? [];
    const byYear = new Map<number, { totalBonus: number; avgPerfSum: number; n: number }>();
    for (const r of history) {
      const year = parseYear(r.period);
      if (!year) continue;
      const cur = byYear.get(year) ?? { totalBonus: 0, avgPerfSum: 0, n: 0 };
      cur.totalBonus += Number(r.total_bonus ?? 0);
      cur.avgPerfSum += Number(r.avg_performance ?? 0);
      cur.n += 1;
      byYear.set(year, cur);
    }
    return synthetic.map((p) => {
      const real = byYear.get(p.year);
      if (!real) return p;
      return {
        year: p.year,
        totalBonus: Math.round(real.totalBonus),
        avgPerformance: Math.round((real.avgPerfSum / Math.max(1, real.n)) * 100) / 100,
      };
    });
  }, [overview.data?.history]);

  const monthlyTrend = useMemo(() => {
    const annual = annualTrend.find((p) => p.year === trendYear) ?? annualTrend[0];
    const annualBonus = annual?.totalBonus ?? 0;
    return buildMonthlyTrendForYear(trendYear, annualBonus, 77);
  }, [annualTrend, trendYear]);

  const monthlyCompare = useMemo(() => {
    const years = [...new Set(compareYears)].filter((y) => y >= 2021 && y <= 2030).slice(0, 4);
    const base = MONTHS.map((m) => ({ month: m })) as Array<Record<string, any>>;
    for (const y of years) {
      const annual = annualTrend.find((p) => p.year === y);
      const pts = buildMonthlyTrendForYear(y, annual?.totalBonus ?? 0, 77);
      for (let i = 0; i < base.length; i++) {
        base[i]![`bonus_${y}`] = pts[i]!.bonus;
      }
    }
    return { years, data: base };
  }, [annualTrend, compareYears]);

  const sortedRows = useMemo(() => {
    const rows = [...allocation.rows].sort((a, b) => b.bonus - a.bonus);
    return showAll ? rows : rows.slice(0, 10);
  }, [allocation.rows, showAll]);

  return (
    <div className="px-5 md:px-8 py-6 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="surface-card p-4 lg:col-span-1">
          <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium">Control Center</div>
          <div className="mt-3 space-y-4">
            <Control
              label="Quarterly Gross Profit (GP)"
              value={normalized.grossProfit}
              right={fmtCurrency(normalized.grossProfit, { compact: true })}
            >
              <input
                type="number"
                value={normalized.grossProfit}
                disabled={!canEditControls}
                onChange={(e) => onSet("grossProfit", Number(e.target.value))}
                className="w-full h-9 px-3 rounded-md border border-border bg-background text-[13px] disabled:opacity-60"
                min={0}
              />
            </Control>

            <Control
              label="Bonus Pool %"
              value={normalized.bonusPoolPct}
              right={`${normalized.bonusPoolPct.toFixed(0)}%`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={25}
                  step={1}
                  value={normalized.bonusPoolPct}
                  disabled={!canEditControls}
                  onChange={(e) => onSet("bonusPoolPct", Number(e.target.value))}
                  className="w-full"
                />
                <input
                  type="number"
                  min={0}
                  max={25}
                  value={normalized.bonusPoolPct}
                  disabled={!canEditControls}
                  onChange={(e) => onSet("bonusPoolPct", Number(e.target.value))}
                  className="w-20 h-9 px-2 rounded-md border border-border bg-background text-[13px] disabled:opacity-60"
                />
              </div>
            </Control>

            <Control
              label="Pool split — Top Performers"
              value={normalized.splitTopPct}
              right={`${normalized.splitTopPct.toFixed(0)}% / ${normalized.splitGoodPct.toFixed(0)}%`}
            >
              <div className="space-y-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={normalized.splitTopPct}
                  disabled={!canEditControls}
                  onChange={(e) => onSet("splitTopPct", Number(e.target.value))}
                  className="w-full"
                />
                <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                  <div>Top: {normalized.splitTopPct.toFixed(0)}%</div>
                  <div>Good: {normalized.splitGoodPct.toFixed(0)}%</div>
                </div>
              </div>
            </Control>

            <div className="pt-3 border-t border-border">
              <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium">Point Weights</div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <MiniNumber
                  label="Mgmt"
                  value={normalized.points.topMgmt}
                  disabled={!canEditAll}
                  onChange={(v) => setInputs((p) => ({ ...p, points: { ...p.points, topMgmt: v } }))}
                />
                <MiniNumber
                  label="EPD"
                  value={normalized.points.topEpd}
                  disabled={!canEditAll}
                  onChange={(v) => setInputs((p) => ({ ...p, points: { ...p.points, topEpd: v } }))}
                />
                <MiniNumber
                  label="Good"
                  value={normalized.points.good}
                  disabled={!canEditAll}
                  onChange={(v) => setInputs((p) => ({ ...p, points: { ...p.points, good: v } }))}
                />
              </div>
              {!canEditAll && (
                <div className="mt-2 text-[12px] text-muted-foreground">
                  Point weights are editable by Super Admin only.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Stat label="Quarterly GP" value={fmtCurrency(normalized.grossProfit, { compact: true })} />
            <Stat label="Bonus pool" value={fmtCurrency(allocation.totalPool, { compact: true })} />
            <Stat label="Qualified headcount" value={String(allocation.qualifiedHeadcount)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Stat label="Management total" value={fmtCurrency(allocation.totals.mgmt, { compact: true })} />
            <Stat label="EPD total" value={fmtCurrency(allocation.totals.epd, { compact: true })} />
            <Stat label="Good Standing total" value={fmtCurrency(allocation.totals.good, { compact: true })} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="surface-card p-4">
              <div className="font-medium text-[13px]">Allocation breakdown</div>
              <div className="text-[12px] text-muted-foreground mt-1">Donut shows the distribution across groups.</div>
              <div className="h-[220px] mt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={88} paddingAngle={2}>
                      {donutData.map((_, i) => (
                        <Cell key={i} fill={["#10b981", "#34d399", "#64748b", "#94a3b8"][i] ?? "#64748b"} />
                      ))}
                    </Pie>
                    <ReTooltip formatter={(v: any) => fmtCurrency(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[12px]">
                <Legend label="Management" value={fmtCurrency(allocation.totals.mgmt, { compact: true })} />
                <Legend label="EPD" value={fmtCurrency(allocation.totals.epd, { compact: true })} />
                <Legend label="Good Standing" value={fmtCurrency(allocation.totals.good, { compact: true })} />
                <Legend label="Ineligible" value={fmtCurrency(allocation.totals.ineligible, { compact: true })} />
              </div>
            </div>

            <div className="surface-card p-4">
              <div className="font-medium text-[13px]">Pool consumption</div>
              <div className="text-[12px] text-muted-foreground mt-1">Stacked bar shows how the pool splits across groups.</div>
              <div className="h-[220px] mt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 10 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" hide />
                    <ReTooltip formatter={(v: any) => fmtCurrency(Number(v))} />
                    <Bar dataKey="Management" stackId="a" fill="#10b981" radius={[6, 0, 0, 6]} />
                    <Bar dataKey="EPD" stackId="a" fill="#34d399" />
                    <Bar dataKey="Good" stackId="a" fill="#64748b" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 text-[12px] text-muted-foreground">
                Exact distribution always matches the configured pool.
              </div>
            </div>
          </div>

          <div className="surface-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-[13px]">Annual trend (boardroom view)</div>
                <div className="text-[12px] text-muted-foreground mt-1">
                  2021–2030 view. Uses real history when available, otherwise deterministic synthetic data.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={trendMode}
                  onChange={(e) => setTrendMode(e.target.value as any)}
                  className="h-8 px-2 rounded-md border border-border bg-background text-[12px]"
                >
                  <option value="annual">Annual</option>
                  <option value="monthly">Monthly (compare years)</option>
                </select>
                {trendMode === "annual" ? (
                  <select
                    value={trendYear}
                    onChange={(e) => setTrendYear(Number(e.target.value))}
                    className="h-8 px-2 rounded-md border border-border bg-background text-[12px]"
                    title="Pick a year (used for drill defaults)"
                  >
                    {annualTrend.map((p) => (
                      <option key={p.year} value={p.year}>
                        {p.year}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={trendYear}
                    onChange={(e) => {
                      const y = Number(e.target.value);
                      setTrendYear(y);
                      setCompareYears((prev) => (prev.includes(y) ? prev : [...prev, y].slice(-4)));
                    }}
                    className="h-8 px-2 rounded-md border border-border bg-background text-[12px]"
                    title="Add year to comparison"
                  >
                    {annualTrend.map((p) => (
                      <option key={p.year} value={p.year}>
                        Add {p.year}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            <div className="h-[240px] mt-3">
              <ResponsiveContainer width="100%" height="100%">
                {trendMode === "annual" ? (
                  <LineChart data={annualTrend} margin={{ left: 8, right: 10, top: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 12 }}
                      tickFormatter={(v) => (typeof v === "number" ? `${Math.round(v / 1000)}k` : "")}
                    />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} domain={[0, 5]} />
                    <ReTooltip
                      formatter={(v: any, name: any) => {
                        if (name === "totalBonus") return fmtCurrency(Number(v));
                        if (name === "avgPerformance") return Number(v).toFixed(2);
                        return String(v);
                      }}
                      labelFormatter={(l: any) => `Year ${l}`}
                    />
                    <ReLegend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="totalBonus"
                      name="Total bonus ($)"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="avgPerformance"
                      name="Avg performance"
                      stroke="#64748b"
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                    />
                  </LineChart>
                ) : (
                  <LineChart data={monthlyCompare.data} margin={{ left: 8, right: 10, top: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => (typeof v === "number" ? `${Math.round(v / 1000)}k` : "")} />
                    <ReTooltip formatter={(v: any) => fmtCurrency(Number(v))} />
                    <ReLegend />
                    {monthlyCompare.years.map((y, idx) => (
                      <Line
                        key={y}
                        type="monotone"
                        dataKey={`bonus_${y}`}
                        name={`${y}`}
                        stroke={["#10b981", "#34d399", "#64748b", "#94a3b8"][idx] ?? "#64748b"}
                        strokeWidth={2}
                        dot={false}
                        connectNulls={false}
                      />
                    ))}
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
            {trendMode === "monthly" && (
              <div className="mt-2 flex flex-wrap gap-2">
                {monthlyCompare.years.map((y) => (
                  <button
                    key={y}
                    onClick={() => setCompareYears((prev) => prev.filter((x) => x !== y))}
                    className="h-7 px-2.5 rounded-md border border-border text-[11.5px] hover:bg-muted"
                    title="Remove year"
                  >
                    Remove {y}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="surface-ops overflow-x-auto">
        <div className="min-w-[980px]">
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <div className="font-display text-lg">Distribution table</div>
              <div className="text-[12px] text-muted-foreground">
                Synced from Team directory. Sorted by bonus. Showing {showAll ? "all" : "top 10"}.
              </div>
            </div>
            {!canEditAll && (
              <div className="text-[12px] text-muted-foreground">
                Editing is restricted to Super Admin.
              </div>
            )}
            <button
              onClick={() => setShowAll((v) => !v)}
              className="h-8 px-3 rounded-md border border-border text-xs hover:bg-muted"
            >
              {showAll ? "Show top 10" : "Show more"}
            </button>
          </div>
          <table className="ops-table w-full">
            <thead>
              <tr>
                <th align="left">Name</th>
                <th align="left">Role</th>
                <th align="left">Team</th>
                <th align="left">Category</th>
                <th align="right">TL</th>
                <th align="right">Perf</th>
                <th align="right">OKR</th>
                <th align="right">Hours</th>
                <th align="right">Points</th>
                <th align="right">Bonus</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => {
                const emp = employees.find((e) => e.id === r.employeeId)!;
                return (
                  <tr key={r.employeeId}>
                    <td className="font-medium">{r.employeeName}</td>
                    <td className="text-muted-foreground">{r.role}</td>
                    <td className="text-muted-foreground">{r.team}</td>
                    <td>
                      <select
                        value={emp.category}
                        disabled={!canEditAll}
                        onChange={(e) => {
                          const next = e.target.value as BonusCategory;
                          setEmployees((prev) => prev.map((x) => (x.id === emp.id ? { ...x, category: next } : x)));
                        }}
                        className="h-7 rounded bg-paper border border-border text-[12px] px-2 disabled:opacity-60"
                      >
                        {Object.entries(CATEGORY_LABEL).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td align="right">
                      <MiniCellNumber
                        value={emp.metrics.teamLeadFeedback}
                        disabled={!canEditAll}
                        min={0}
                        max={5}
                        step={1}
                        onChange={(v) => patchEmp(emp.id, { metrics: { ...emp.metrics, teamLeadFeedback: v } }, setEmployees)}
                      />
                    </td>
                    <td align="right">
                      <MiniCellNumber
                        value={emp.metrics.performanceScore}
                        disabled={!canEditAll}
                        min={0}
                        max={100}
                        step={1}
                        onChange={(v) => patchEmp(emp.id, { metrics: { ...emp.metrics, performanceScore: v } }, setEmployees)}
                      />
                    </td>
                    <td align="right">
                      <MiniCellNumber
                        value={emp.metrics.okrScore}
                        disabled={!canEditAll}
                        min={0}
                        max={1}
                        step={0.01}
                        onChange={(v) => patchEmp(emp.id, { metrics: { ...emp.metrics, okrScore: v } }, setEmployees)}
                      />
                    </td>
                    <td align="right">
                      <MiniCellNumber
                        value={emp.metrics.workingHours}
                        disabled={!canEditAll}
                        min={0}
                        max={800}
                        step={1}
                        onChange={(v) => patchEmp(emp.id, { metrics: { ...emp.metrics, workingHours: v } }, setEmployees)}
                      />
                    </td>
                    <td align="right">
                      <MiniCellNumber
                        value={typeof emp.pointsOverride === "number" ? emp.pointsOverride : r.points}
                        disabled={!canEditAll}
                        min={0}
                        max={100}
                        step={1}
                        onChange={(v) => patchEmp(emp.id, { pointsOverride: v }, setEmployees)}
                      />
                    </td>
                    <td align="right">
                      <MiniCellNumber
                        value={typeof emp.bonusOverride === "number" ? emp.bonusOverride : r.bonus}
                        disabled={!canEditAll}
                        min={0}
                        max={1_000_000}
                        step={1}
                        onChange={(v) => patchEmp(emp.id, { bonusOverride: v }, setEmployees)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function parseYear(period: string): number | null {
  const m = String(period).match(/(19|20)\d{2}/);
  if (!m) return null;
  const y = Number(m[0]);
  return Number.isFinite(y) ? y : null;
}

function mapEmployeeToBonus(e: EmployeeFull): BonusEmployee {
  const perf = Number(e.performance_score ?? 0);
  const role = String(e.role ?? "");
  const dept = String(e.department_name ?? "");

  const isMgmt = /(vp|head|chief|director|manager|lead)/i.test(role);
  const team: BonusEmployee["team"] =
    /(sales|revenue|growth)/i.test(dept) ? "Revenue" : /(ops|operations)/i.test(dept) ? "Operations" : "Support";

  const category: BonusCategory =
    perf >= 4 ? (isMgmt ? "TOP_MGMT" : "TOP_EPD") : perf >= 3 ? "GOOD" : "PIP";

  const baseSalary = Number(e.comp?.base_salary ?? 0);

  return {
    id: e.id,
    name: e.full_name,
    email: e.email,
    role: e.role,
    team,
    baseSalary,
    status: category === "PIP" ? "PIP" : "ACTIVE",
    category,
    pointsOverride: null,
    bonusOverride: null,
    metrics: {
      teamLeadFeedback: clampNum(perf, 0, 5),
      performanceScore: clampNum(perf * 20, 0, 100),
      okrScore: clampNum(perf / 5, 0, 1),
      workingHours: 480,
    },
  };
}

function patchEmp(
  id: string,
  patch: Partial<BonusEmployee>,
  setEmployees: React.Dispatch<React.SetStateAction<BonusEmployee[]>>
) {
  setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
}

function clampNum(n: number, min: number, max: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function MiniCellNumber({
  value,
  disabled,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  disabled: boolean;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      disabled={disabled}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-[92px] h-7 px-2 rounded-md border border-border bg-background text-[12px] font-mono text-right disabled:opacity-60"
    />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-4">
      <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium">{label}</div>
      <div className="font-display text-2xl mt-1">{value}</div>
    </div>
  );
}

function Control({
  label,
  right,
  children,
}: {
  label: string;
  value: number;
  right: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[12px] font-medium">{label}</div>
        <div className="text-[12px] text-muted-foreground font-mono">{right}</div>
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function MiniNumber({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <input
        type="number"
        min={0}
        max={10}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-9 px-3 rounded-md border border-border bg-background text-[13px] disabled:opacity-60"
      />
    </div>
  );
}

function Legend({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border border-border rounded-md px-2.5 py-2 bg-muted/30">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-mono">{value}</div>
    </div>
  );
}

