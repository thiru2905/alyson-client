import { isSuperAccessEmail } from "@/lib/super-access-constants";

/** Full company Time Dashboard scope without other super-access modules (payroll, leave, etc.). */
export const TIME_DASHBOARD_FULL_ACCESS_EMAILS = ["om.podey@cintara.ai"] as const;

export function isTimeDashboardFullAccessEmail(email: string | null | undefined): boolean {
  const e = String(email || "").trim().toLowerCase();
  return (TIME_DASHBOARD_FULL_ACCESS_EMAILS as readonly string[]).includes(e);
}

/** Full Time Dashboard data scope (all employees), not team-scoped. */
export function hasTimeDashboardFullScope(email: string | null | undefined): boolean {
  return isSuperAccessEmail(email) || isTimeDashboardFullAccessEmail(email);
}
