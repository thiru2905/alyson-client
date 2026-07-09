import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { checkPayrollAccess } from "@/lib/payroll-rbac-functions";
import { isPayrollBootstrapEmail } from "@/lib/payroll-rbac-constants";
import type { PayrollAccessCheckResult } from "@/lib/payroll-rbac.schema";

function fallbackAccess(email: string | null | undefined): PayrollAccessCheckResult {
  const normalized = String(email || "").trim().toLowerCase();
  return {
    allowed: isPayrollBootstrapEmail(normalized),
    email: normalized,
    bucket: "",
    key: "",
  };
}

export function usePayrollAccess() {
  const clerkAuth = useClerkAuth();
  const { user } = useAuth();
  const emailHint = user?.email?.toLowerCase() ?? "";

  return useQuery({
    queryKey: ["payroll-access", clerkAuth.userId, emailHint],
    queryFn: async (): Promise<PayrollAccessCheckResult> => {
      const token = await clerkAuth.getToken();
      if (!token) return fallbackAccess(emailHint);
      try {
        return await checkPayrollAccess({
          data: { clerkToken: token, emailHint: user?.email?.toLowerCase() },
        });
      } catch {
        return fallbackAccess(emailHint);
      }
    },
    enabled: clerkAuth.isSignedIn,
    initialData: emailHint ? fallbackAccess(emailHint) : undefined,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export type PayrollAuthPayload = {
  clerkToken: string;
  emailHint?: string;
};

export async function payrollAuthPayload(
  getToken: () => Promise<string | null>,
  email?: string | null,
): Promise<PayrollAuthPayload> {
  const token = await getToken();
  if (!token) throw new Error("Sign in with Clerk to access payroll");
  const emailHint = email?.trim().toLowerCase() || undefined;
  return emailHint ? { clerkToken: token, emailHint } : { clerkToken: token };
}

/** @deprecated Use payrollAuthPayload */
export async function payrollClerkToken(getToken: () => Promise<string | null>): Promise<string> {
  const { clerkToken } = await payrollAuthPayload(getToken);
  return clerkToken;
}

export function usePayrollNavVisible() {
  const { user } = useAuth();
  const accessQ = usePayrollAccess();
  return (
    isPayrollBootstrapEmail(user?.email) ||
    accessQ.data?.allowed === true
  );
}
