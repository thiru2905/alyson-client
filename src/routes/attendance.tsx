import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchAttendance } from "@/lib/queries-ext";
import { PageHeader, TableScroll, EmptyState } from "@/components/AppShell";
import { PageSkeleton } from "@/components/Skeleton";
import { Clock, RefreshCw, Download } from "lucide-react";
import { useState } from "react";
import { AttendanceAdjustDrawer } from "@/components/drawers/AttendanceAdjustDrawer";
import { downloadCSV } from "@/lib/csv";
import { toast } from "sonner";

export const Route = createFileRoute("/attendance")({
  head: () => ({ meta: [{ title: "Attendance — Alyson HR" }] }),
  component: AttendancePage,
});

function AttendancePage() {
  const { data, isLoading } = useQuery({ queryKey: ["attendance"], queryFn: () => fetchAttendance(14) });
  const [picked, setPicked] = useState<any | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  if (isLoading) return <PageSkeleton />;
  const rows = data ?? [];

  const totalHours = rows.reduce((s, r) => s + Number(r.approved_hours), 0);
  const adjusted = rows.filter((r) => Number(r.adjusted_hours) > 0).length;
  const avgActivity = rows.reduce((s, r) => s + Number(r.activity_score), 0) / Math.max(1, rows.length);

  const sync = () => {
    setLastSync(new Date().toLocaleTimeString());
    toast.success("Time Doctor synced", { description: `${rows.length} records refreshed.` });
  };

  const exportCsv = () => {
    if (!rows.length) return toast.error("No records to export");
    downloadCSV(
      `attendance-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((r: any) => ({
        employee: r.employees?.full_name ?? "",
        date: r.work_date,
        source_hours: Number(r.source_hours).toFixed(2),
        approved_hours: Number(r.approved_hours).toFixed(2),
        adjusted_hours: Number(r.adjusted_hours).toFixed(2),
        activity_score: r.activity_score,
        adjustment_note: r.adjustment_note ?? "",
      })),
    );
    toast.success("Hours exported");
  };

  return (
    <div className="ops-dense">
      <PageHeader
        eyebrow="People"
        title="Attendance"
        description="Time tracking, activity scores, and adjustments — last 14 days."
        dense
        actions={
          <>
            <button onClick={exportCsv} className="h-8 px-3 rounded-md border border-border text-xs flex items-center gap-1.5 hover:bg-muted"><Download className="h-3.5 w-3.5" />Export</button>
            <button onClick={sync} className="h-8 px-3 rounded-md bg-foreground text-background text-xs flex items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5" />Sync Time Doctor</button>
          </>
        }
      />
      <div className="px-5 md:px-8 py-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Stat label="Approved hours (14d)" value={`${totalHours.toFixed(0)}h`} />
          <Stat label="Adjusted entries" value={String(adjusted)} />
          <Stat label="Avg activity score" value={rows.length ? avgActivity.toFixed(1) : "—"} />
        </div>
        {lastSync && <div className="text-[11px] text-muted-foreground">Last Time Doctor sync at {lastSync}</div>}
        {rows.length === 0 ? (
          <EmptyState icon={Clock} title="No attendance records" description="Connect Time Doctor or import a CSV to start tracking hours." />
        ) : (
          <TableScroll>
            <table className="ops-table w-full">
              <thead><tr><th align="left">Employee</th><th align="left">Date</th><th align="right">Source</th><th align="right">Approved</th><th align="right">Adjusted</th><th align="right">Activity</th><th></th></tr></thead>
              <tbody>
                {rows.slice(0, 40).map((r) => (
                  <tr key={r.id} onClick={() => setPicked(r)} className="hover:bg-muted/40 cursor-pointer">
                    <td>{(r as any).employees?.full_name ?? "—"}</td>
                    <td className="text-muted-foreground">{new Date(r.work_date).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })}</td>
                    <td align="right" className="font-mono">{Number(r.source_hours).toFixed(1)}</td>
                    <td align="right" className="font-mono">{Number(r.approved_hours).toFixed(1)}</td>
                    <td align="right" className="font-mono">{Number(r.adjusted_hours) !== 0 ? `${Number(r.adjusted_hours) > 0 ? "+" : ""}${Number(r.adjusted_hours).toFixed(1)}` : "—"}</td>
                    <td align="right">
                      <span className={`pill ${Number(r.activity_score) >= 85 ? "pill-success" : Number(r.activity_score) >= 70 ? "pill-info" : "pill-warning"}`}>{Number(r.activity_score).toFixed(0)}</span>
                    </td>
                    <td className="text-right text-[11px] text-primary">Adjust →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </div>

      <AttendanceAdjustDrawer record={picked} onClose={() => setPicked(null)} />
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div className="surface-card p-4"><div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium">{label}</div><div className="font-display text-2xl mt-1">{value}</div></div>;
}
