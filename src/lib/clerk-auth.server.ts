import { createClerkClient, verifyToken } from "@clerk/backend";
import {
  isMeetingTasksBackfillAdmin,
  MEETING_TASKS_BACKFILL_ADMIN_EMAIL,
} from "@/lib/notetaker-tasks-backfill-auth";

export function clerkServerConfigured(): boolean {
  return Boolean(process.env.CLERK_SECRET_KEY?.trim());
}

export function isDevClerkBypass(): boolean {
  return process.env.NODE_ENV === "development" && !clerkServerConfigured();
}

function clerkSecretKey() {
  const key = process.env.CLERK_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("Missing CLERK_SECRET_KEY — required to verify Clerk session on the server.");
  }
  return key;
}

export async function requireClerkEmailFromSessionToken(sessionToken: string): Promise<string> {
  const token = String(sessionToken || "").trim();
  if (!token) throw new Error("Sign in required");

  const secretKey = clerkSecretKey();
  const payload = await verifyToken(token, { secretKey });
  const userId = String(payload.sub || "").trim();
  if (!userId) throw new Error("Invalid Clerk session");

  const clerk = createClerkClient({ secretKey });
  const user = await clerk.users.getUser(userId);
  const email =
    user.primaryEmailAddress?.emailAddress?.trim() ||
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress?.trim() ||
    user.emailAddresses[0]?.emailAddress?.trim() ||
    "";

  if (!email) throw new Error("Clerk user has no email address");
  return email.toLowerCase();
}

export async function requireMeetingTasksBackfillAdmin(sessionToken: string): Promise<string> {
  const email = await requireClerkEmailFromSessionToken(sessionToken);
  if (!isMeetingTasksBackfillAdmin(email)) {
    throw new Error(`Forbidden — bulk task generation is limited to ${MEETING_TASKS_BACKFILL_ADMIN_EMAIL}`);
  }
  return email;
}
