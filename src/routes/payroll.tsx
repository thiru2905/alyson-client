import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchPayrollRuns } from "@/lib/queries-ext";
import { PageHeader, TableScroll, EmptyState } from "@/components/AppShell";
import { PageSkeleton } from "@/components/Skeleton";
import { fmtCurrency } from "@/lib/format";
import { downloadCSV } from "@/lib/csv";
import { Download, Plus, DollarSign } from "lucide-react";
import { useState } from "react";
import { NewPayrollRunDrawer } from "@/components/drawers/NewPayrollRunDrawer";
import { PayrollRunDrawer } from "@/components/drawers/PayrollRunDrawer";
import { toast } from "sonner";

export const Route = createFileRoute("/payroll")({
  head: () => ({ meta: [{ title: "Payroll — Alyson HR" }] }),
  component: PayrollPage,
});

function PayrollPage() {
  const { data, isLoading } = useQuery({ queryKey: ["payroll-runs"], queryFn: fetchPayrollRuns });
  const [newOpen, setNewOpen] = useState(false);
  const [picked, setPicked] = useState<any | null>(null);

  if (isLoading) return <PageSkeleton />;
  const rows = data ?? [];

  const total = rows.reduce((s, r) => s + Number(r.total_amount), 0);
  const open = rows.filter((r) => r.status !== "paid").length;

  const exportAll = () => {
    if (!rows.length) return toast.error("No runs to export");
    downloadCSV(
      `payroll-runs-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((r: any) => ({
        period: r.period,
        status: r.status,
        employees: r.total_employees,
        total: Number(r.total_amount).toFixed(2),
        approved_at: r.approved_at ?? "",
        paid_at: r.paid_at ?? "",
        notes: r.notes ?? "",
      })),
    );
    toast.success("Wise CSV downloaded");
  };

  return (
    <div className="ops-dense">
      <PageHeader
        eyebrow="Money"
        title="Payroll"
        description="Run, review, approve, and export payroll. Connected to Wise and Acme Bank."
        dense
        actions={
          <>
            <button onClick={exportAll} className="h-8 px-3 rounded-md border border-border text-xs flex items-center gap-1.5 hover:bg-muted"><Download className="h-3.5 w-3.5" />Wise CSV</button>
            <button onClick={() => setNewOpen(true)} className="h-8 px-3 rounded-md bg-foreground text-background text-xs flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" />New run</button>
          </>
        }
      />
      <div className="px-5 md:px-8 py-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Stat label="YTD payroll" value={fmtCurrency(total, { compact: true })} />
          <Stat label="Open runs" value={String(open)} />
          <Stat label="Avg run" value={fmtCurrency(total / Math.max(1, rows.length), { compact: true })} />
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={DollarSign}
            title="No payroll runs yet"
            description="When you create a payroll run, it'll appear here with status, totals, and a link to its line items."
            action={<button onClick={() => setNewOpen(true)} className="h-8 px-3 rounded-md bg-foreground text-background text-xs flex items-center gap-1.5 mx-auto"><Plus className="h-3.5 w-3.5" />Create first run</button>}
          />
        ) : (
          <TableScroll>
            <table className="ops-table w-full">
              <thead><tr>
                <th align="left">Period</th><th align="left">Status</th><th align="right">Employees</th>
                <th align="right">Total</th><th align="left">Approved</th><th align="left">Paid</th><th align="left">Notes</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => setPicked(r)} className="hover:bg-muted/40 cursor-pointer">
                    <td className="font-medium">{new Date(r.period).toLocaleDateString("en", { month: "long", year: "numeric" })}</td>
                    <td><Pill status={r.status} /></td>
                    <td align="right">{r.total_employees}</td>
                    <td align="right" className="font-mono">{fmtCurrency(Number(r.total_amount))}</td>
                    <td className="text-muted-foreground">{r.approved_at ? new Date(r.approved_at).toLocaleDateString() : "—"}</td>
                    <td className="text-muted-foreground">{r.paid_at ? new Date(r.paid_at).toLocaleDateString() : "—"}</td>
                    <td className="text-muted-foreground text-[12px] max-w-[240px] truncate">{r.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </div>

      <NewPayrollRunDrawer open={newOpen} onClose={() => setNewOpen(false)} />
      <PayrollRunDrawer run={picked} onClose={() => setPicked(null)} />
    </div>
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
function Pill({ status }: { status: string }) {
  const map: Record<string, string> = { paid: "pill-success", approved: "pill-info", finance_review: "pill-warning", manager_review: "pill-warning", draft: "pill-neutral" };
  return <span className={`pill ${map[status] ?? "pill-neutral"}`}>{status.replace(/_/g, " ")}</span>;
}
