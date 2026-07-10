import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { BarChart3, Gift, FileText } from "lucide-react";
import { SuperAccessGate } from "@/components/SuperAccessGate";
import { useAppScrollTop } from "@/lib/app-scroll";

export const Route = createFileRoute("/bonus")({
  head: () => ({ meta: [{ title: "Bonus — Alyson HR" }] }),
  component: BonusLayout,
});

function BonusLayout() {
  useAppScrollTop();

  return (
    <SuperAccessGate moduleLabel="Bonus">
      <div className="ops-dense w-full">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-6 app-page-gutter pt-5 pb-4 border-b border-border">
          <div className="min-w-0">
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium mb-1.5">Money</div>
            <div className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-muted-foreground shrink-0" />
              <h1 className="font-display text-xl md:text-2xl font-semibold tracking-tight text-foreground leading-tight truncate">
                Bonus & Shares
              </h1>
            </div>
            <p className="mt-1.5 text-[13px] md:text-[14px] text-muted-foreground max-w-2xl leading-relaxed">
              Per-employee cash bonus and equity ledger, synced with Employee Onboarding. All payments are append-only and
              persisted to S3 forever.
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-2 flex-wrap">
            <Tab to="/bonus" label="Employees" />
            <Tab to="/bonus/analytics" label="Analytics" icon={BarChart3} />
            <Tab to="/bonus/audit" label="Audit log" icon={FileText} />
          </div>
        </div>

        <Outlet />
      </div>
    </SuperAccessGate>
  );
}

function Tab({
  to,
  label,
  icon: Icon,
}: {
  to: "/bonus" | "/bonus/analytics" | "/bonus/audit";
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link
      to={to}
      activeProps={{ className: "bg-muted text-foreground border-border" }}
      inactiveProps={{ className: "text-muted-foreground hover:text-foreground hover:bg-muted/60 border-transparent" }}
      className="h-8 px-3 rounded-md border text-xs font-medium transition-colors flex items-center gap-1.5"
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
    </Link>
  );
}
