import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { resolveTimeDashboardTeamScope } from "@/lib/time-dashboard-manager-scope";
import { BUNDLED_ORG_CHART_ROSTER_CSV } from "@/lib/bundled-data";
import {
  buildOrgChartRosterLookup,
  parseOrgChartRosterCsv,
} from "@/lib/org-chart-roster";
import { isSuperAccessEmail } from "@/lib/super-access-constants";
import { useSuperAccess } from "@/lib/super-access-rbac-hooks";
import { checkTimeDashboardAccess } from "@/lib/time-dashboard-access-functions";
import type { TimeDashboardAccessResult } from "@/lib/time-dashboard-access.schema";

const rosterLookup = buildOrgChartRosterLookup(parseOrgChartRosterCsv(BUNDLED_ORG_CHART_ROSTER_CSV));

function fallbackTimeDashboardAccess(email: string | null | undefined): TimeDashboardAccessResult {
  const normalized = String(email || "").trim().toLowerCase();
  if (isSuperAccessEmail(normalized)) {
    return { level: "full", email: normalized };
  }
  const teamScope = resolveTimeDashboardTeamScope(normalized, rosterLookup);
  if (teamScope) {
    return {
      level: "team",
      email: teamScope.viewerEmail,
      scopeManagerEmail: teamScope.managerEmail,
      managerName: teamScope.team.managerName,
      allowedEmployeeEmails: teamScope.team.directReports.map((r) => r.email),
      directReportCount: teamScope.team.directReports.length,
    };
  }
  return { level: "none", email: normalized };
}

export function useTimeDashboardAccess() {
  const clerkAuth = useClerkAuth();
  const { user } = useAuth();
  const emailHint = user?.email?.toLowerCase() ?? "";

  return useQuery({
    queryKey: ["time-dashboard-access", clerkAuth.userId, emailHint],
    queryFn: async (): Promise<TimeDashboardAccessResult> => {
      const token = await clerkAuth.getToken();
      if (!token) return fallbackTimeDashboardAccess(emailHint);
      try {
        return await checkTimeDashboardAccess({
          data: { clerkToken: token, emailHint: user?.email?.toLowerCase() },
        });
      } catch {
        return fallbackTimeDashboardAccess(emailHint);
      }
    },
    enabled: clerkAuth.isSignedIn,
    initialData: emailHint ? fallbackTimeDashboardAccess(emailHint) : undefined,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function useTimeDashboardNavVisible() {
  const { user } = useAuth();
  const accessQ = useTimeDashboardAccess();
  const superAccessQ = useSuperAccess();
  const email = user?.email?.toLowerCase() ?? "";
  return (
    isSuperAccessEmail(email) ||
    superAccessQ.data?.allowed === true ||
    accessQ.data?.level === "full" ||
    accessQ.data?.level === "team"
  );
}

export async function timeDashboardAuthPayload(
  getToken: () => Promise<string | null>,
  email?: string | null,
) {
  const token = await getToken();
  if (!token) throw new Error("Sign in with Clerk to access Time Dashboard");
  const emailHint = email?.trim().toLowerCase() || undefined;
  return emailHint ? { clerkToken: token, emailHint } : { clerkToken: token };
}

export function useTimeDashboardAuth() {
  const clerkAuth = useClerkAuth();
  const { user } = useAuth();
  return () => timeDashboardAuthPayload(() => clerkAuth.getToken(), user?.email);
}

export {
  filterRowsForTimeDashboardAccess,
  timeDashboardManagerEmailParam,
} from "@/lib/time-dashboard-manager-scope";
