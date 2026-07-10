import { Loader2, Users } from "lucide-react";
import { useTimeDashboardAccess } from "@/lib/time-dashboard-access-hooks";
import { hasTimeDashboardFullScope } from "@/lib/time-dashboard-access-constants";
import { useSuperAccess } from "@/lib/super-access-rbac-hooks";
import { useAuth } from "@/lib/auth";

/** RBAC gate — super admins and roster managers only (before the access-code lock). */
export function TimeDashboardRbacGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const accessQ = useTimeDashboardAccess();
  const superAccessQ = useSuperAccess();
  const email = user?.email?.toLowerCase() ?? "";

  const allowed =
    hasTimeDashboardFullScope(email) ||
    superAccessQ.data?.allowed === true ||
    accessQ.data?.level === "full" ||
    accessQ.data?.level === "team";

  if (accessQ.isLoading) {
    return (
      <div className="app-page-gutter py-16 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="app-page-gutter py-10">
        <div className="surface-card p-10 text-center">
          <div className="mx-auto h-10 w-10 rounded-full bg-muted grid place-items-center text-muted-foreground mb-3">
            <Users className="h-5 w-5" />
          </div>
          <div className="font-medium text-[15px]">Manager or super admin access required</div>
          <div className="text-[13px] text-muted-foreground mt-1 max-w-md mx-auto">
            Time Dashboard is available to super admins (full company data) and people managers
            (their direct reports only). Contact HR if you believe you should have access.
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
