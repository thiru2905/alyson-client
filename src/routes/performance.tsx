import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchReviews } from "@/lib/queries-ext";
import { fetchOverview } from "@/lib/queries";
import { PageHeader, TableScroll, EmptyState } from "@/components/AppShell";
import { PageSkeleton } from "@/components/Skeleton";
import { ScatterChart, Scatter, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { TrendingUp, Plus, Download } from "lucide-react";
import { useState } from "react";
import { ReviewCycleDrawer } from "@/components/drawers/ReviewCycleDrawer";
import { ReviewDrawer } from "@/components/drawers/ReviewDrawer";
import { downloadCSV } from "@/lib/csv";
import { toast } from "sonner";

export const Route = createFileRoute("/performance")({
  head: () => ({ meta: [{ title: "Performance — Alyson HR" }] }),
  component: PerformancePage,
});

function PerformancePage() {
  const reviews = useQuery({ queryKey: ["reviews"], queryFn: fetchReviews });
  const overview = useQuery({ queryKey: ["overview"], queryFn: fetchOverview });
  const [cycleOpen, setCycleOpen] = useState(false);
  const [picked, setPicked] = useState<any | null>(null);

  if (reviews.isLoading || overview.isLoading) return <PageSkeleton />;

  const reviewRows = reviews.data ?? [];
  const promo = reviewRows.filter((r) => r.promotion_ready).length;
  const submitted = reviewRows.filter((r) => r.status === "submitted" || r.status === "calibrated").length;
  const avgRating = reviewRows.reduce((s, r) => s + Number(r.rating), 0) / Math.max(1, reviewRows.length);

  const scatter = (overview.data?.employees ?? []).map((e) => ({ name: e.full_name, perf: e.performance_score, comp: e.total_comp / 1000 }));

  const exportCsv = () => {
    if (!reviewRows.length) return toast.error("No reviews to export");
    downloadCSV(
      `reviews-${new Date().toISOString().slice(0, 10)}.csv`,
      reviewRows.map((r: any) => ({
        employee: r.employees?.full_name ?? "",
        cycle: r.review_cycles?.name ?? "",
        rating: Number(r.rating).toFixed(1),
        multiplier: Number(r.multiplier).toFixed(2),
        status: r.status,
        promotion_ready: r.promotion_ready ? "yes" : "no",
        comments: r.comments ?? "",
      })),
    );
    toast.success("Reviews exported");
  };

  return (
    <div>
      <PageHeader
        eyebrow="People"
        title="Performance"
        description="Reviews, ratings, calibration, and promotion candidates."
        actions={
          <>
            <button onClick={exportCsv} className="h-8 px-3 rounded-md border border-border text-xs flex items-center gap-1.5 hover:bg-muted"><Download className="h-3.5 w-3.5" />Export</button>
            <button onClick={() => setCycleOpen(true)} className="h-8 px-3 rounded-md bg-foreground text-background text-xs flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" />Start cycle</button>
          </>
        }
      />
      <div className="px-5 md:px-8 py-6 md:py-7 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Stat label="Avg rating" value={avgRating ? avgRating.toFixed(2) : "—"} />
          <Stat label="Submitted reviews" value={`${submitted} / ${reviewRows.length}`} />
          <Stat label="Promotion-ready" value={String(promo)} />
        </div>

        <div className="surface-card p-4 md:p-5">
          <h3 className="font-display text-lg mb-3">Performance vs total compensation</h3>
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart>
              <CartesianGrid stroke="var(--border)" />
              <XAxis type="number" dataKey="perf" name="Performance" domain={[1, 5]} stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis type="number" dataKey="comp" name="Comp ($k)" stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip contentStyle={{ background: "var(--paper)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} />
              <Scatter data={scatter} fill="var(--primary)" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        <div className="ops-dense">
          <h3 className="font-display text-lg mb-3">Reviews — current cycle</h3>
          {reviewRows.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="No reviews yet"
              description="Reviews will appear here once managers begin submitting drafts for the active cycle."
              action={<button onClick={() => setCycleOpen(true)} className="h-8 px-3 rounded-md bg-foreground text-background text-xs flex items-center gap-1.5 mx-auto"><Plus className="h-3.5 w-3.5" />Start cycle</button>}
            />
          ) : (
            <TableScroll>
              <table className="ops-table w-full">
                <thead><tr><th align="left">Employee</th><th align="left">Cycle</th><th align="right">Rating</th><th align="right">Multiplier</th><th>Status</th><th>Promotion</th></tr></thead>
                <tbody>
                  {reviewRows.slice(0, 30).map((r) => (
                    <tr key={r.id} onClick={() => setPicked(r)} className="hover:bg-muted/40 cursor-pointer">
                      <td>{(r as any).employees?.full_name ?? "—"}</td>
                      <td className="text-muted-foreground">{(r as any).review_cycles?.name ?? "—"}</td>
                      <td align="right"><span className={`pill ${Number(r.rating) >= 4 ? "pill-success" : Number(r.rating) >= 3 ? "pill-info" : "pill-warning"}`}>{Number(r.rating).toFixed(1)}</span></td>
                      <td align="right" className="font-mono">{Number(r.multiplier).toFixed(2)}×</td>
                      <td><span className="pill pill-neutral capitalize">{r.status}</span></td>
                      <td>{r.promotion_ready ? <span className="pill pill-success">Ready</span> : <span className="text-muted-foreground text-xs">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </div>
      </div>

      <ReviewCycleDrawer open={cycleOpen} onClose={() => setCycleOpen(false)} />
      <ReviewDrawer review={picked} onClose={() => setPicked(null)} />
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div className="surface-card p-4"><div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium">{label}</div><div className="font-display text-2xl mt-1">{value}</div></div>;
}
