import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { BarChart3, DollarSign, FileText, Loader2 } from "lucide-react";
import { usePayrollAccess } from "@/lib/payroll-rbac-hooks";

export const Route = createFileRoute("/payroll")({
  head: () => ({ meta: [{ title: "Payroll — Alyson HR" }] }),
  component: PayrollLayout,
});

function PayrollLayout() {
  const accessQ = usePayrollAccess();
  const canView = accessQ.data?.allowed === true;

  if (accessQ.isLoading) {
    return (
      <div className="px-5 md:px-8 py-16 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canView) return <AccessDenied />;

  return (
    <div className="ops-dense">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-6 px-5 md:px-8 pt-5 pb-4 border-b border-border">
        <div className="min-w-0">
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium mb-1.5">
            Money
          </div>
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-muted-foreground shrink-0" />
            <h1 className="font-display text-xl md:text-2xl font-semibold tracking-tight text-foreground leading-tight truncate">
              Payroll
            </h1>
          </div>
          <p className="mt-1.5 text-[13px] md:text-[14px] text-muted-foreground max-w-3xl leading-relaxed">
            Compensation board with Time Doctor hours per pay period (India 15th–15th · Pakistan calendar month).
            Mark employees paid and review distribution in Analytics.
          </p>
        </div>

        <div className="shrink-0 flex items-center gap-2 flex-wrap">
          <Tab to="/payroll" label="Payroll board" />
          <Tab to="/payroll/log" label="Payment log" icon={FileText} />
          <Tab to="/payroll/analytics" label="Analytics" icon={BarChart3} />
        </div>
      </div>

      <Outlet />
    </div>
  );
}

function Tab({
  to,
  label,
  icon: Icon,
}: {
  to: "/payroll" | "/payroll/log" | "/payroll/analytics";
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

function AccessDenied() {
  return (
    <div className="px-5 md:px-8 py-10">
      <div className="surface-card p-10 text-center">
        <div className="font-medium text-[15px]">Access denied</div>
        <div className="text-[13px] text-muted-foreground mt-1 max-w-md mx-auto">
          Payroll is restricted to users listed in the S3 payroll access table. Contact an admin if you need access.
        </div>
      </div>
    </div>
  );
}
