import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";
import { checkPayrollAccess } from "@/lib/payroll-rbac-functions";

export function usePayrollAccess() {
  const clerkAuth = useClerkAuth();

  return useQuery({
    queryKey: ["payroll-access", clerkAuth.userId],
    queryFn: async () => {
      const token = await clerkAuth.getToken();
      if (!token) return { allowed: false, email: "", bucket: "", key: "" };
      return checkPayrollAccess({ data: { clerkToken: token } });
    },
    enabled: clerkAuth.isSignedIn,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export async function payrollClerkToken(getToken: () => Promise<string | null>): Promise<string> {
  const token = await getToken();
  if (!token) throw new Error("Sign in with Clerk to access payroll");
  return token;
}
