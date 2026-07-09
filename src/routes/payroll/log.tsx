import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { Cloud, Loader2 } from "lucide-react";
import { FetchingBar } from "@/components/Skeleton";
import { getPayrollLog } from "@/lib/payroll-functions";
import { payrollClerkToken } from "@/lib/payroll-rbac-hooks";
import { fmtCurrency, fmtDate } from "@/lib/format";
import { payCycleLabel, type PayrollPayCycle } from "@/lib/payroll-schema";

export const Route = createFileRoute("/payroll/log")({
  head: () => ({ meta: [{ title: "Payroll log — Alyson HR" }] }),
  component: PayrollLogPage,
});

function opLabel(op: string) {
  switch (op) {
    case "mark_paid":
      return "Marked paid";
    case "unmark_paid":
      return "Unmarked paid";
    case "update_employee":
      return "Employee updated";
    case "update_period_fx":
      return "FX rate updated";
    case "bootstrap":
      return "Bootstrap";
    default:
      return op.replace(/_/g, " ");
  }
}

function PayrollLogPage() {
  const clerkAuth = useClerkAuth();
  const q = useQuery({
    queryKey: ["payroll-log"],
    queryFn: async () =>
      getPayrollLog({ data: { clerkToken: await payrollClerkToken(() => clerkAuth.getToken()) } }),
    staleTime: 10_000,
  });

  const entries = q.data?.entries ?? [];

  return (
    <div className="px-5 md:px-8 py-6 space-y-5">
      <FetchingBar active={q.isFetching} />

      <div className="surface-card p-4">
        <div className="font-display text-lg">Payment log</div>
        <div className="text-[12px] text-muted-foreground mt-1 max-w-2xl">
          Append-only record of payroll actions — who was marked paid, compensation edits, and FX updates.
          Use this to verify past pay cycles.
        </div>
        {q.data?.bucket && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
            <Cloud className="h-3.5 w-3.5 shrink-0" />
            s3://{q.data.bucket}/{q.data.logKey}
          </div>
        )}
      </div>

      <div className="surface-ops overflow-x-auto">
        <div className="min-w-[960px]">
          <table className="ops-table w-full">
            <thead>
              <tr>
                <th align="left">Timestamp</th>
                <th align="left">Action</th>
                <th align="left">Employee</th>
                <th align="left">Pay month</th>
                <th align="left">Cycle</th>
                <th align="right">Amount</th>
                <th align="right">Amount USD</th>
                <th align="left">Actor</th>
                <th align="left">Note</th>
              </tr>
            </thead>
            <tbody>
              {q.isLoading ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin inline-block" />
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-muted-foreground text-[13px]">
                    No payroll operations logged yet.
                  </td>
                </tr>
              ) : (
                entries.map((r, i) => (
                  <tr key={`${r.ts}-${i}`}>
                    <td className="text-muted-foreground text-[12px] whitespace-nowrap">
                      {fmtDate(r.ts.slice(0, 10))} {r.ts.slice(11, 19)}
                    </td>
                    <td className="font-medium text-[12px]">{opLabel(r.operation)}</td>
                    <td>{r.employeeName || r.employeeId || "—"}</td>
                    <td className="text-muted-foreground">{r.payMonth || "—"}</td>
                    <td className="text-muted-foreground text-[12px]">
                      {r.payCycle ? payCycleLabel(r.payCycle as PayrollPayCycle) : "—"}
                    </td>
                    <td align="right" className="font-mono text-[12px]">
                      {r.amountLocal != null
                        ? fmtCurrency(r.amountLocal, {
                            currency: r.localCurrency ?? (r.payCycle === "india_15th" ? "INR" : "PKR"),
                          })
                        : "—"}
                    </td>
                    <td align="right" className="font-mono text-[12px]">
                      {r.amountUsd != null ? fmtCurrency(r.amountUsd) : "—"}
                    </td>
                    <td className="text-muted-foreground text-[12px]">{r.actor || "—"}</td>
                    <td className="text-muted-foreground text-[12px] max-w-[200px] truncate">{r.note || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
