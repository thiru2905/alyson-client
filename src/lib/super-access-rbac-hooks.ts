import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { checkSuperAccess } from "@/lib/super-access-rbac-functions";
import { isSuperAccessEmail } from "@/lib/super-access-constants";
import type { SuperAccessCheckResult } from "@/lib/super-access-rbac.schema";

function fallbackAccess(email: string | null | undefined): SuperAccessCheckResult {
  const normalized = String(email || "").trim().toLowerCase();
  return {
    allowed: isSuperAccessEmail(normalized),
    email: normalized,
    bucket: "",
    key: "",
  };
}

export function useSuperAccess() {
  const clerkAuth = useClerkAuth();
  const { user } = useAuth();
  const emailHint = user?.email?.toLowerCase() ?? "";

  return useQuery({
    queryKey: ["super-access", clerkAuth.userId, emailHint],
    queryFn: async (): Promise<SuperAccessCheckResult> => {
      const token = await clerkAuth.getToken();
      if (!token) return fallbackAccess(emailHint);
      try {
        return await checkSuperAccess({
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

export function useSuperAccessNavVisible() {
  const { user } = useAuth();
  const accessQ = useSuperAccess();
  return isSuperAccessEmail(user?.email) || accessQ.data?.allowed === true;
}

export type SuperAccessAuthPayload = {
  clerkToken: string;
  emailHint?: string;
};

export async function superAccessAuthPayload(
  getToken: () => Promise<string | null>,
  email?: string | null,
): Promise<SuperAccessAuthPayload> {
  const token = await getToken();
  if (!token) throw new Error("Sign in with Clerk to access this module");
  const emailHint = email?.trim().toLowerCase() || undefined;
  return emailHint ? { clerkToken: token, emailHint } : { clerkToken: token };
}

export function useSuperAccessAuth() {
  const clerkAuth = useClerkAuth();
  const { user } = useAuth();
  return () => superAccessAuthPayload(() => clerkAuth.getToken(), user?.email);
}
