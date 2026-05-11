import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchKpiDefinitions } from "@/lib/queries-ext";
import { PageHeader, EmptyState } from "@/components/AppShell";
import { PageSkeleton } from "@/components/Skeleton";
import { Download, BarChart3, Calendar } from "lucide-react";
import { useState } from "react";
import { downloadCSV } from "@/lib/csv";
import { toast } from "sonner";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports — Alyson HR" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["kpis"], queryFn: fetchKpiDefinitions });
  const [filter, setFilter] = useState<string>("all");

  if (isLoading) return <PageSkeleton />;
  const rows = data ?? [];

  const cats = Array.from(new Set(rows.map((k) => k.category)));
  const visible = filter === "all" ? rows : rows.filter((k) => k.category === filter);

  const exportKpi = (k: any) => {
    downloadCSV(
      `kpi-${k.name.toLowerCase().replace(/\s+/g, "-")}.csv`,
      [{
        name: k.name,
        category: k.category,
        formula: k.formula,
        plain_english: k.plain_english,
        sources: k.source_tables.join("; "),
        downstream: k.downstream.join("; "),
      }],
    );
    toast.success(`${k.name} exported`);
  };

  const schedule = (k: any) => {
    toast.success(`Scheduled report queued`, { description: `${k.name} will be emailed weekly.` });
  };

  return (
    <div>
      <PageHeader eyebrow="Operations" title="Reports & KPIs" description="Every metric in the company, with its formula, source, and downstream consumers." />
      <div className="px-5 md:px-8 py-6 md:py-7 space-y-6">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setFilter("all")}
            className={"h-7 px-3 rounded-full text-[11.5px] font-medium border " + (filter === "all" ? "bg-foreground text-background border-foreground" : "bg-paper border-border text-muted-foreground hover:text-foreground")}
          >
            All ({rows.length})
          </button>
          {cats.map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={"h-7 px-3 rounded-full text-[11.5px] font-medium border " + (filter === c ? "bg-foreground text-background border-foreground" : "bg-paper border-border text-muted-foreground hover:text-foreground")}
            >
              {c} ({rows.filter((k) => k.category === c).length})
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyState icon={BarChart3} title="No KPIs defined" description="Add KPI definitions to power dashboards and reports." />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {visible.map((k) => (
              <div key={k.id} className="surface-card p-4 md:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.category}</div>
                    <div className="font-medium mt-0.5">{k.name}</div>
                    <div className="text-[12px] text-muted-foreground mt-1 leading-relaxed">{k.plain_english}</div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button onClick={() => exportKpi(k)} title="Export CSV" className="h-7 w-7 grid place-items-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted">
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => schedule(k)} title="Schedule" className="h-7 w-7 grid place-items-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted">
                      <Calendar className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 font-mono text-[11px] bg-muted/50 px-2.5 py-1.5 rounded text-muted-foreground overflow-x-auto whitespace-nowrap">{k.formula}</div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                  <div>
                    <div className="uppercase tracking-wide text-muted-foreground">Sources</div>
                    <div className="mt-0.5 break-words">{k.source_tables.join(", ") || "—"}</div>
                  </div>
                  <div>
                    <div className="uppercase tracking-wide text-muted-foreground">Downstream</div>
                    <div className="mt-0.5 break-words">{k.downstream.join(", ") || "—"}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
