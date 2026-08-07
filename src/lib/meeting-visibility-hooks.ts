import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useAuth } from "@/lib/auth";

export type MeetingVisibilityAuthPayload = {
  clerkToken: string;
  emailHint?: string;
};

export async function meetingVisibilityAuthPayload(
  getToken: () => Promise<string | null>,
  email?: string | null,
): Promise<MeetingVisibilityAuthPayload> {
  const token = await getToken();
  if (!token) throw new Error("Sign in with Clerk to view meetings");
  const emailHint = email?.trim().toLowerCase() || undefined;
  return emailHint ? { clerkToken: token, emailHint } : { clerkToken: token };
}

/** Clerk session + optional email hint for meeting privacy server fns. */
export function useMeetingVisibilityAuth() {
  const clerkAuth = useClerkAuth();
  const { user } = useAuth();
  return () => meetingVisibilityAuthPayload(() => clerkAuth.getToken(), user?.email);
}
