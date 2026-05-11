import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchWorkflows } from "@/lib/queries-ext";
import { PageHeader, TableScroll, EmptyState } from "@/components/AppShell";
import { PageSkeleton } from "@/components/Skeleton";
import { fmtRelative } from "@/lib/format";
import { Clock, CheckCircle2, XCircle, GitBranch } from "lucide-react";
import { useState } from "react";
import { WorkflowDrawer } from "@/components/drawers/WorkflowDrawer";

export const Route = createFileRoute("/workflows")({
  head: () => ({ meta: [{ title: "Workflows — Alyson HR" }] }),
  component: WorkflowsPage,
});

const FILTERS = ["all", "pending", "approved", "rejected", "overdue"] as const;
type Filter = (typeof FILTERS)[number];

function WorkflowsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["workflows"], queryFn: fetchWorkflows });
  const [filter, setFilter] = useState<Filter>("all");
  const [picked, setPicked] = useState<any | null>(null);

  if (isLoading) return <PageSkeleton />;
  const rows = data ?? [];

  const groups = ["pending", "approved", "rejected", "overdue"] as const;
  const filtered = filter === "all" ? rows : rows.filter((w) => w.status === filter);

  return (
    <div className="ops-dense">
      <PageHeader eyebrow="Operations" title="Workflows" description="Every approval routed through Alyson — leave, payroll, equity, comp changes." dense />
      <div className="px-5 md:px-8 py-6 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {groups.map((g) => (
            <Stat key={g} label={cap(g)} value={String(rows.filter((w) => w.status === g).length)} />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                "h-7 px-3 rounded-full text-[11.5px] font-medium border transition-colors capitalize " +
                (filter === f ? "bg-foreground text-background border-foreground" : "bg-paper border-border text-muted-foreground hover:text-foreground")
              }
            >
              {f} {f !== "all" && <span className="ml-1 opacity-60">({rows.filter((w) => w.status === f).length})</span>}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={GitBranch} title="No workflows" description="Approval requests will appear here as they're initiated." />
        ) : (
          <TableScroll>
            <table className="ops-table w-full">
              <thead><tr><th align="left">Subject</th><th align="left">Module</th><th align="left">Template</th><th align="left">Step</th><th align="left">Status</th><th align="left">Due</th><th align="left">Created</th></tr></thead>
              <tbody>
                {filtered.map((w) => (
                  <tr key={w.id} onClick={() => setPicked(w)} className="hover:bg-muted/40 cursor-pointer">
                    <td className="font-medium max-w-[280px] truncate">{w.subject}</td>
                    <td><span className="pill pill-neutral capitalize">{w.module}</span></td>
                    <td className="text-muted-foreground text-[12px]">{(w as any).workflow_templates?.name ?? "—"}</td>
                    <td className="text-muted-foreground">Step {w.current_step + 1}</td>
                    <td><StatusPill status={w.status} /></td>
                    <td className="text-muted-foreground">{w.due_at ? fmtRelative(w.due_at) : "—"}</td>
                    <td className="text-muted-foreground">{fmtRelative(w.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </div>

      <WorkflowDrawer wf={picked} onClose={() => setPicked(null)} />
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div className="surface-card p-4"><div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium">{label}</div><div className="font-display text-2xl mt-1">{value}</div></div>;
}
function StatusPill({ status }: { status: string }) {
  if (status === "approved") return <span className="pill pill-success"><CheckCircle2 className="h-3 w-3" />approved</span>;
  if (status === "rejected") return <span className="pill pill-danger"><XCircle className="h-3 w-3" />rejected</span>;
  if (status === "overdue") return <span className="pill pill-danger"><Clock className="h-3 w-3" />overdue</span>;
  return <span className="pill pill-warning"><Clock className="h-3 w-3" />pending</span>;
}
function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
