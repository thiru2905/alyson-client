import { isDevClerkBypass, requireClerkEmailFromSessionToken } from "@/lib/clerk-auth.server";
import { canonicalOfficialEmail } from "@/lib/cintara-email";
import { getOrgChartRosterLookup } from "@/lib/org-chart-roster.server";
import { isSuperAccessEmail } from "@/lib/super-access-constants";
import { checkSuperAccessForToken } from "@/lib/super-access-rbac.server";
import { resolveTimeDashboardTeamScope } from "@/lib/time-dashboard-manager-scope";
import type { TimeDashboardAccessResult } from "@/lib/time-dashboard-access.schema";

const MISSING_CLERK_MSG =
  "Missing CLERK_SECRET_KEY — add CLERK_SECRET_KEY=sk_... to .env (Clerk Dashboard → API Keys), then restart npm run dev.";

export type ResolvedTimeDashboardScope =
  | { level: "full"; email: string }
  | {
      level: "team";
      viewerEmail: string;
      managerEmail: string;
      managerName: string;
      allowedEmails: Set<string>;
    }
  | { level: "none"; email: string };

function toResult(scope: ResolvedTimeDashboardScope): TimeDashboardAccessResult {
  if (scope.level === "full") {
    return { level: "full", email: scope.email };
  }
  if (scope.level === "team") {
    return {
      level: "team",
      email: scope.viewerEmail,
      scopeManagerEmail: scope.managerEmail,
      managerName: scope.managerName,
      allowedEmployeeEmails: [...scope.allowedEmails],
      directReportCount: scope.allowedEmails.size,
    };
  }
  return { level: "none", email: scope.email };
}

async function resolveViewerEmail(clerkToken: string, emailHint?: string): Promise<string> {
  if (isDevClerkBypass()) {
    const email = String(emailHint || "").trim().toLowerCase();
    if (!email) throw new Error(MISSING_CLERK_MSG);
    return email;
  }
  return requireClerkEmailFromSessionToken(clerkToken);
}

export async function resolveTimeDashboardScope(
  clerkToken: string,
  emailHint?: string,
): Promise<ResolvedTimeDashboardScope> {
  const email = await resolveViewerEmail(clerkToken, emailHint);

  if (isSuperAccessEmail(email)) {
    return { level: "full", email };
  }

  try {
    const superCheck = await checkSuperAccessForToken(clerkToken, emailHint);
    if (superCheck.allowed) return { level: "full", email };
  } catch {
    if (isSuperAccessEmail(email)) return { level: "full", email };
  }

  const lookup = getOrgChartRosterLookup();
  const teamScope = resolveTimeDashboardTeamScope(email, lookup);
  if (teamScope) {
    return {
      level: "team",
      viewerEmail: teamScope.viewerEmail,
      managerEmail: teamScope.managerEmail,
      managerName: teamScope.team.managerName,
      allowedEmails: new Set(teamScope.team.directReports.map((r) => r.email)),
    };
  }

  return { level: "none", email };
}

export async function checkTimeDashboardAccessForToken(
  clerkToken: string,
  emailHint?: string,
): Promise<TimeDashboardAccessResult> {
  const scope = await resolveTimeDashboardScope(clerkToken, emailHint);
  return toResult(scope);
}

export function employeeEmailInScope(
  employeeEmail: string,
  scope: ResolvedTimeDashboardScope,
): boolean {
  if (scope.level === "full") return true;
  if (scope.level === "none") return false;
  const key = canonicalOfficialEmail(employeeEmail)?.toLowerCase();
  return Boolean(key && scope.allowedEmails.has(key));
}

export async function requireTimeDashboardScope(
  clerkToken: string,
  emailHint?: string,
): Promise<ResolvedTimeDashboardScope> {
  const scope = await resolveTimeDashboardScope(clerkToken, emailHint);
  if (scope.level === "none") {
    throw new Error(
      "Forbidden — Time Dashboard is limited to super admins and people managers with direct reports.",
    );
  }
  return scope;
}
