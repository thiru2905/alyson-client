/** Client-safe payroll allowlist — kept in sync with S3 bootstrap members. */
export const PAYROLL_BOOTSTRAP_EMAILS = ["mohita@cintara.ai", "thirumalai@cintara.ai"] as const;

export function isPayrollBootstrapEmail(email: string | null | undefined): boolean {
  const e = String(email || "").trim().toLowerCase();
  return (PAYROLL_BOOTSTRAP_EMAILS as readonly string[]).includes(e);
}
