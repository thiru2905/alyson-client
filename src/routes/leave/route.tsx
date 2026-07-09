import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { BarChart3, Calendar, FileText, Mail } from "lucide-react";
import { SuperAccessGate } from "@/components/SuperAccessGate";
import { PACING_LEAVE_HOURS_PER_DAY } from "@/lib/weekly-pacing";

export const Route = createFileRoute("/leave")({
  head: () => ({ meta: [{ title: "Leave — Alyson HR" }] }),
  component: LeaveLayout,
});

function LeaveLayout() {
  return (
    <SuperAccessGate moduleLabel="Leave">
      <div className="ops-dense">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-6 px-5 md:px-8 pt-5 pb-4 border-b border-border">
          <div className="min-w-0">
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium mb-1.5">People</div>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-muted-foreground shrink-0" />
              <h1 className="font-display text-xl md:text-2xl font-semibold tracking-tight text-foreground leading-tight truncate">
                Leave
              </h1>
            </div>
            <p className="mt-1.5 text-[13px] md:text-[14px] text-muted-foreground max-w-2xl leading-relaxed">
              Per-employee leave ledger and team calendar. Personal leave is recorded per employee; team blocks and individual leave both appear on the calendar — +{PACING_LEAVE_HOURS_PER_DAY}h/workday in Weekly Pacing.
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-2 flex-wrap">
            <Tab to="/leave" label="Employees" />
            <Tab to="/leave/email-inbox" label="Email inbox" icon={Mail} />
            <Tab to="/leave/calendar" label="Team calendar" icon={Calendar} />
            <Tab to="/leave/analytics" label="Analytics" icon={BarChart3} />
            <Tab to="/leave/audit" label="Audit log" icon={FileText} />
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
  to: "/leave" | "/leave/email-inbox" | "/leave/calendar" | "/leave/analytics" | "/leave/audit";
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
