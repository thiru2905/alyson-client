import { verifyToken, createClerkClient } from "@clerk/backend";
import {
  ensurePayrollAccessOnS3,
  findPayrollAccessMember,
  linkPayrollAccessClerkUser,
  loadPayrollAccessMembers,
  payrollRbacAccessKey,
  payrollRbacBucketName,
} from "@/lib/payroll-rbac-s3.server";
import type { PayrollAccessCheckResult } from "@/lib/payroll-rbac.schema";

function clerkSecretKey() {
  const key = process.env.CLERK_SECRET_KEY?.trim();
  if (!key) throw new Error("Missing CLERK_SECRET_KEY — required for payroll access checks.");
  return key;
}

async function clerkIdentityFromToken(sessionToken: string): Promise<{ email: string; userId: string }> {
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
  return { email: email.toLowerCase(), userId };
}

export async function checkPayrollAccessForToken(sessionToken: string): Promise<PayrollAccessCheckResult> {
  const { email, userId } = await clerkIdentityFromToken(sessionToken);
  const members = await loadPayrollAccessMembers();
  const member = findPayrollAccessMember(members, email, userId);

  if (member) {
    await linkPayrollAccessClerkUser(email, userId);
  }

  const meta = await ensurePayrollAccessOnS3();
  return {
    allowed: Boolean(member),
    email,
    memberId: member?.id,
    clerkUserId: member?.clerkUserId ?? userId,
    bucket: meta.bucket,
    key: meta.key,
  };
}

export async function requirePayrollAccess(sessionToken: string): Promise<PayrollAccessCheckResult> {
  const result = await checkPayrollAccessForToken(sessionToken);
  if (!result.allowed) {
    throw new Error(
      `Forbidden — payroll is restricted to approved users in s3://${payrollRbacBucketName()}/${payrollRbacAccessKey()}`,
    );
  }
  return result;
}
