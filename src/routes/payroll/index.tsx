import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cloud, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { PayrollEmployeeDrawer } from "@/components/PayrollEmployeeDrawer";
import { FetchingBar } from "@/components/Skeleton";
import { useAuth } from "@/lib/auth";
import { downloadCSV } from "@/lib/csv";
import { fmtCurrency, fmtDate, fmtPct } from "@/lib/format";
import {
  getPayrollMeta,
  getPayrollReport,
  markPayrollPaid,
  unmarkPayrollPaid,
  updatePayrollEmployee,
  updatePayrollPeriodFx,
} from "@/lib/payroll-functions";
import { payCycleLabel, type PayrollLocalCurrency, type PayrollPayCycle, type PayrollReportRow } from "@/lib/payroll-schema";

export const Route = createFileRoute("/payroll/")({
  component: PayrollBoardPage,
});

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function PayrollBoardPage() {
  const auth = useAuth();
  const canEdit = auth.hasAnyRole(["super_admin", "ceo", "finance"]);
  const actor = auth.user?.email ?? null;
  const qc = useQueryClient();

  const [month, setMonth] = useState(currentMonth);
  const [payCycleFilter, setPayCycleFilter] = useState<"all" | PayrollPayCycle>("all");
  const [activeOnly, setActiveOnly] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [fxInr, setFxInr] = useState("");
  const [fxPkr, setFxPkr] = useState("");
  const [fxDate, setFxDate] = useState("");
  const [selected, setSelected] = useState<PayrollReportRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const q = useQuery({
    queryKey: ["payroll-report", month, payCycleFilter, activeOnly],
    queryFn: () => getPayrollReport({ data: { month, payCycleFilter, activeOnly } }),
  });

  const metaQ = useQuery({
    queryKey: ["payroll-meta"],
    queryFn: () => getPayrollMeta(),
  });

  const report = q.data;
  const rows = report?.rows ?? [];

  useEffect(() => {
    if (report?.usdToInrRate) setFxInr(String(report.usdToInrRate));
    if (report?.usdToPkrRate) setFxPkr(String(report.usdToPkrRate));
    if (report?.rateAsOf) setFxDate(report.rateAsOf);
  }, [report?.usdToInrRate, report?.usdToPkrRate, report?.rateAsOf]);

  const filtered = useMemo(() => {
    const qNorm = searchQ.trim().toLowerCase();
    if (!qNorm) return rows;
    return rows.filter(
      (r) =>
        r.employeeName.toLowerCase().includes(qNorm) ||
        r.officialEmail.toLowerCase().includes(qNorm) ||
        r.team.toLowerCase().includes(qNorm) ||
        r.location.toLowerCase().includes(qNorm),
    );
  }, [rows, searchQ]);

  const indiaRows = filtered.filter((r) => r.payCycle === "india_15th");
  const pakistanRows = filtered.filter((r) => r.payCycle === "pakistan_month_end");

  const saveEmployeeM = useMutation({
    mutationFn: (patch: {
      employeeId: string;
      startingDate?: string | null;
      lastSalaryRevisionDate?: string | null;
      nextSalaryReviewDate?: string | null;
      startingBaseSalaryLocal?: number | null;
      incrementLocal?: number | null;
      benefitsLocal?: number | null;
      reimbursementLocal?: number | null;
      meetingCreditsHours?: number | null;
      additionalCreditsHours?: number | null;
    }) => updatePayrollEmployee({ data: { ...patch, actor } }),
    onSuccess: () => {
      toast.success("Payroll fields saved");
      setDrawerOpen(false);
      void qc.invalidateQueries({ queryKey: ["payroll-report"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const saveFxM = useMutation({
    mutationFn: () =>
      updatePayrollPeriodFx({
        data: {
          month,
          usdToInrRate: Number(fxInr) || null,
          usdToPkrRate: Number(fxPkr) || null,
          rateAsOf: fxDate || null,
          actor,
        },
      }),
    onSuccess: () => {
      toast.success("FX rate saved for this month");
      void qc.invalidateQueries({ queryKey: ["payroll-report"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "FX save failed"),
  });

  const markPaidM = useMutation({
    mutationFn: (payload: { row: PayrollReportRow; note?: string }) =>
      markPayrollPaid({
        data: {
          employeeId: payload.row.employeeId,
          employeeName: payload.row.employeeName,
          payMonth: payload.row.payMonth,
          payCycle: payload.row.payCycle,
          localCurrency: payload.row.localCurrency,
          amountLocal: payload.row.totalLocal,
          amountUsd: payload.row.totalUsd,
          note: payload.note,
          actor,
        },
      }),
    onSuccess: () => {
      toast.success("Marked as paid");
      setDrawerOpen(false);
      void qc.invalidateQueries({ queryKey: ["payroll-report"] });
      void qc.invalidateQueries({ queryKey: ["payroll-log"] });
      void qc.invalidateQueries({ queryKey: ["payroll-analytics"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to mark paid"),
  });

  const unmarkPaidM = useMutation({
    mutationFn: (row: PayrollReportRow) =>
      unmarkPayrollPaid({
        data: {
          employeeId: row.employeeId,
          employeeName: row.employeeName,
          payMonth: row.payMonth,
          payCycle: row.payCycle,
          actor,
        },
      }),
    onSuccess: () => {
      toast.success("Payment mark removed");
      void qc.invalidateQueries({ queryKey: ["payroll-report"] });
      void qc.invalidateQueries({ queryKey: ["payroll-log"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to unmark"),
  });

  const exportCsv = () => {
    if (!filtered.length) return toast.error("Nothing to export");
    downloadCSV(
      `payroll-${month}-${payCycleFilter}.csv`,
      filtered.map((r) => ({
        employee: r.employeeName,
        email: r.officialEmail,
        team: r.team,
        location: r.location,
        pay_cycle: payCycleLabel(r.payCycle),
        td_period: r.periodLabel,
        pay_date: r.payDate,
        paid: r.paidAt ? "yes" : "no",
        starting_date: r.startingDate ?? "",
        months_worked: r.monthsWorked ?? "",
        currency: r.localCurrency,
        starting_base: r.startingBaseSalaryLocal,
        increment: r.incrementLocal,
        new_base: r.newBaseSalaryLocal,
        benefits: r.benefitsLocal,
        bonus: r.bonusLocal,
        reimbursement: r.reimbursementLocal,
        total_local: r.totalLocal,
        total_usd: r.totalUsd,
        td_logged_h: r.effectiveHours,
        td_required_h: r.totalRequiredHours,
        pct_completed: r.percentCompleted,
        salary_per_td: r.salaryAccordingToTdHours,
      })),
    );
    toast.success("Payroll CSV downloaded");
  };

  const openRow = (row: PayrollReportRow) => {
    setSelected(row);
    setDrawerOpen(true);
  };

  const saving = saveEmployeeM.isPending || markPaidM.isPending || unmarkPaidM.isPending;

  return (
    <div className="px-5 md:px-8 py-5 space-y-4">
      <FetchingBar active={q.isFetching} />

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[12px] text-muted-foreground">
          Pay month
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="mt-1 block h-9 rounded-md border border-border bg-background px-2 text-[13px]"
          />
        </label>

        <label className="text-[12px] text-muted-foreground">
          Pay cycle
          <select
            value={payCycleFilter}
            onChange={(e) => setPayCycleFilter(e.target.value as typeof payCycleFilter)}
            className="mt-1 block h-9 rounded-md border border-border bg-background px-2 text-[13px] min-w-[180px]"
          >
            <option value="all">All cycles</option>
            <option value="india_15th">India — 15th (TD 15th–15th)</option>
            <option value="pakistan_month_end">Pakistan — month end</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-[12px] text-muted-foreground pb-1 cursor-pointer">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
            className="rounded border-border"
          />
          Active only (Weekly Pacing)
        </label>

        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search employee…"
            className="w-full h-9 pl-8 pr-3 rounded-md border border-border bg-background text-[13px]"
          />
        </div>

        <button
          type="button"
          onClick={exportCsv}
          className="h-9 px-3 rounded-md border border-border text-xs hover:bg-muted"
        >
          Export CSV
        </button>
      </div>

      <div className="surface-ops p-3 flex flex-wrap items-end gap-3">
        <div className="text-[12px] text-muted-foreground font-medium">
          FX rates for {report?.payMonthLabel ?? month}
        </div>
        <label className="text-[12px] text-muted-foreground">
          USD → INR
          <input
            value={fxInr}
            onChange={(e) => setFxInr(e.target.value)}
            disabled={!canEdit}
            className="mt-1 block h-9 w-24 rounded-md border border-border bg-background px-2 text-[13px] font-mono"
          />
        </label>
        <label className="text-[12px] text-muted-foreground">
          USD → PKR
          <input
            value={fxPkr}
            onChange={(e) => setFxPkr(e.target.value)}
            disabled={!canEdit}
            className="mt-1 block h-9 w-24 rounded-md border border-border bg-background px-2 text-[13px] font-mono"
          />
        </label>
        <label className="text-[12px] text-muted-foreground">
          As of
          <input
            type="date"
            value={fxDate}
            onChange={(e) => setFxDate(e.target.value)}
            disabled={!canEdit}
            className="mt-1 block h-9 rounded-md border border-border bg-background px-2 text-[13px]"
          />
        </label>
        {canEdit && (
          <button
            type="button"
            onClick={() => saveFxM.mutate()}
            disabled={saveFxM.isPending}
            className="h-9 px-3 rounded-md bg-foreground text-background text-xs flex items-center gap-1.5"
          >
            {saveFxM.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save FX
          </button>
        )}
        {metaQ.data && (
          <div className="text-[11px] text-muted-foreground flex items-center gap-1 ml-auto">
            <Cloud className="h-3.5 w-3.5" />
            s3://{metaQ.data.bucket}/{metaQ.data.key}
          </div>
        )}
      </div>

      {report?.warnings?.length ? (
        <div className="text-[12px] text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
          {report.warnings.join(" · ")}
        </div>
      ) : null}

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <MiniStat label="Employees" value={String(filtered.length)} />
        <MiniStat label="India (INR)" value={String(indiaRows.length)} />
        <MiniStat label="Pakistan (PKR)" value={String(pakistanRows.length)} />
        <MiniStat label="Paid" value={String(filtered.filter((r) => r.paidAt).length)} />
        <MiniStat
          label="Total INR"
          value={fmtCurrency(
            filtered.filter((r) => r.localCurrency === "INR").reduce((s, r) => s + r.totalLocal, 0),
            { currency: "INR" },
          )}
        />
        <MiniStat
          label="Total PKR"
          value={fmtCurrency(
            filtered.filter((r) => r.localCurrency === "PKR").reduce((s, r) => s + r.totalLocal, 0),
            { currency: "PKR" },
          )}
        />
      </div>

      {payCycleFilter === "all" ? (
        <>
          <PayrollTable
            title="India — pay 15th · TD hours 15th prior month → 15th"
            rows={indiaRows}
            onRowClick={openRow}
          />
          <PayrollTable
            title="Pakistan — pay month end · TD hours calendar month"
            rows={pakistanRows}
            onRowClick={openRow}
          />
        </>
      ) : (
        <PayrollTable
          title={
            payCycleFilter === "india_15th"
              ? "India — pay 15th · TD hours 15th prior month → 15th"
              : "Pakistan — pay month end · TD hours calendar month"
          }
          rows={filtered}
          onRowClick={openRow}
        />
      )}

      <PayrollEmployeeDrawer
        open={drawerOpen}
        row={selected}
        canEdit={canEdit}
        saving={saving}
        onClose={() => setDrawerOpen(false)}
        onSave={(patch) => saveEmployeeM.mutate(patch)}
        onMarkPaid={
          canEdit && selected
            ? (p) => markPaidM.mutate({ row: selected, note: p.note })
            : undefined
        }
        onUnmarkPaid={
          canEdit && selected ? () => unmarkPaidM.mutate(selected) : undefined
        }
      />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-display text-lg mt-0.5">{value}</div>
    </div>
  );
}

function PayrollTable({
  title,
  rows,
  onRowClick,
}: {
  title: string;
  rows: PayrollReportRow[];
  onRowClick: (row: PayrollReportRow) => void;
}) {
  if (!rows.length) {
    return (
      <div className="surface-ops p-6 text-center text-[13px] text-muted-foreground">
        {title} — no employees for this filter.
      </div>
    );
  }

  const money = (n: number, currency: PayrollReportRow["localCurrency"]) =>
    fmtCurrency(n, { currency });

  const currencyLabel = rows[0]?.localCurrency ?? "INR";

  return (
    <div className="space-y-2">
      <h2 className="text-[13px] font-semibold text-foreground px-1">{title}</h2>
      <div className="surface-ops overflow-x-auto">
        <div className="min-w-[2400px]">
          <table className="ops-table w-full text-[12px]">
            <thead>
              <tr>
                <th align="left">Employee</th>
                <th align="left">Team</th>
                <th align="left">Location</th>
                <th align="center">Curr.</th>
                <th align="left">TD period</th>
                <th align="left">Pay date</th>
                <th align="center">Paid</th>
                <th align="right">TD hrs</th>
                <th align="right">Required</th>
                <th align="right">% done</th>
                <th align="right">Start base</th>
                <th align="right">Increment</th>
                <th align="right">New base</th>
                <th align="right">Benefits</th>
                <th align="right">Bonus</th>
                <th align="right">Reimb.</th>
                <th align="right">Total ({currencyLabel})</th>
                <th align="right">Total USD</th>
                <th align="right">Salary/TD</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.employeeId}-${r.payCycle}`}
                  className="hover:bg-muted/40 cursor-pointer"
                  onClick={() => onRowClick(r)}
                >
                  <td className="font-medium whitespace-nowrap">{r.employeeName}</td>
                  <td className="text-muted-foreground">{r.team || "—"}</td>
                  <td>{r.location || "—"}</td>
                  <td align="center" className="text-[11px] font-mono">
                    {r.localCurrency}
                  </td>
                  <td className="text-muted-foreground text-[11px] whitespace-nowrap">{r.periodLabel}</td>
                  <td>{fmtDate(r.payDate)}</td>
                  <td align="center">
                    <span className={`pill text-[10px] ${r.paidAt ? "pill-success" : "pill-neutral"}`}>
                      {r.paidAt ? "Yes" : "No"}
                    </span>
                  </td>
                  <td align="right">{r.effectiveHours}</td>
                  <td align="right">{r.totalRequiredHours}</td>
                  <td align="right">{fmtPct(r.percentCompleted)}</td>
                  <td align="right" className="font-mono">
                    {money(r.startingBaseSalaryLocal, r.localCurrency)}
                  </td>
                  <td align="right" className="font-mono">
                    {money(r.incrementLocal, r.localCurrency)}
                  </td>
                  <td align="right" className="font-mono">
                    {money(r.newBaseSalaryLocal, r.localCurrency)}
                  </td>
                  <td align="right" className="font-mono">
                    {money(r.benefitsLocal, r.localCurrency)}
                  </td>
                  <td align="right" className="font-mono">
                    {money(r.bonusLocal, r.localCurrency)}
                  </td>
                  <td align="right" className="font-mono">
                    {money(r.reimbursementLocal, r.localCurrency)}
                  </td>
                  <td align="right" className="font-mono font-medium">
                    {money(r.totalLocal, r.localCurrency)}
                  </td>
                  <td align="right" className="font-mono">
                    {fmtCurrency(r.totalUsd)}
                  </td>
                  <td align="right" className="font-mono">
                    {money(r.salaryAccordingToTdHours, r.localCurrency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
