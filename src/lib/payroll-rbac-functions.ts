import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PayrollAccessCheckResult } from "@/lib/payroll-rbac.schema";

export type { PayrollAccessCheckResult } from "@/lib/payroll-rbac.schema";

const clerkTokenSchema = z.object({
  clerkToken: z.string().min(1),
  emailHint: z.string().email().optional(),
});

export const checkPayrollAccess = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => clerkTokenSchema.parse(data))
  .handler(async ({ data }): Promise<PayrollAccessCheckResult> => {
    const { checkPayrollAccessForToken } = await import("@/lib/payroll-rbac.server");
    return checkPayrollAccessForToken(data.clerkToken, data.emailHint);
  });
