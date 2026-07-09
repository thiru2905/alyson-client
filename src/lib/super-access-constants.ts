/** Privileged users — client-safe allowlist; kept in sync with S3 super-access bootstrap. */
export const SUPER_ACCESS_EMAILS = [
  "thirumalai@cintara.ai",
  "mohita@cintara.ai",
  "arman@cintara.ai",
  "alysonclient@cintara.ai",
] as const;

export type SuperAccessModule = "payroll" | "bonus" | "equity" | "workspace-activity" | "leave";

export const SUPER_ACCESS_MODULE_ROUTES: Record<SuperAccessModule, string> = {
  payroll: "/payroll",
  bonus: "/bonus",
  equity: "/equity",
  "workspace-activity": "/workspace-activity",
  leave: "/leave",
};

export function isSuperAccessEmail(email: string | null | undefined): boolean {
  const e = String(email || "").trim().toLowerCase();
  return (SUPER_ACCESS_EMAILS as readonly string[]).includes(e);
}
