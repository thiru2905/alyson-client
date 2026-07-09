import { verifyToken, createClerkClient } from "@clerk/backend";
import { isDevClerkBypass } from "@/lib/clerk-auth.server";
import { isPayrollBootstrapEmail } from "@/lib/payroll-rbac-constants";
import {
  ensurePayrollAccessOnS3,
  findPayrollAccessMember,
  linkPayrollAccessClerkUser,
  loadPayrollAccessMembers,
  payrollRbacAccessKey,
  payrollRbacBucketName,
} from "@/lib/payroll-rbac-s3.server";
import type { PayrollAccessCheckResult } from "@/lib/payroll-rbac.schema";

const MISSING_CLERK_SECRET_MSG =
  "Missing CLERK_SECRET_KEY — add CLERK_SECRET_KEY=sk_... to .env (Clerk Dashboard → API Keys), then restart npm run dev.";

function clerkSecretKey() {
  const key = process.env.CLERK_SECRET_KEY?.trim();
  if (!key) throw new Error(MISSING_CLERK_SECRET_MSG);
  return key;
}

async function checkPayrollAccessDevBypass(emailHint: string): Promise<PayrollAccessCheckResult> {
  const email = emailHint.trim().toLowerCase();
  if (!email) throw new Error(MISSING_CLERK_SECRET_MSG);

  try {
    const members = await loadPayrollAccessMembers();
    const member = findPayrollAccessMember(members, email, undefined);
    const allowed = Boolean(member) || isPayrollBootstrapEmail(email);
    if (!allowed) {
      throw new Error(
        `Forbidden — payroll is restricted to approved users in s3://${payrollRbacBucketName()}/${payrollRbacAccessKey()}`,
      );
    }
    const meta = await ensurePayrollAccessOnS3();
    return {
      allowed: true,
      email,
      memberId: member?.id,
      clerkUserId: member?.clerkUserId ?? null,
      bucket: meta.bucket,
      key: meta.key,
    };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Forbidden")) throw err;
    if (!isPayrollBootstrapEmail(email)) throw new Error(MISSING_CLERK_SECRET_MSG);
    return {
      allowed: true,
      email,
      bucket: payrollRbacBucketName(),
      key: payrollRbacAccessKey(),
    };
  }
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

export async function checkPayrollAccessForToken(
  sessionToken: string,
  emailHint?: string,
): Promise<PayrollAccessCheckResult> {
  if (isDevClerkBypass()) {
    const email = String(emailHint || "").trim().toLowerCase();
    if (!email) throw new Error(MISSING_CLERK_SECRET_MSG);
    return checkPayrollAccessDevBypass(email);
  }

  const { email, userId } = await clerkIdentityFromToken(sessionToken);

  try {
    const members = await loadPayrollAccessMembers();
    const member = findPayrollAccessMember(members, email, userId);

    if (member) {
      await linkPayrollAccessClerkUser(email, userId);
    }

    const allowed = Boolean(member) || isPayrollBootstrapEmail(email);
    const meta = await ensurePayrollAccessOnS3();
    return {
      allowed,
      email,
      memberId: member?.id,
      clerkUserId: member?.clerkUserId ?? userId,
      bucket: meta.bucket,
      key: meta.key,
    };
  } catch {
    const allowed = isPayrollBootstrapEmail(email);
    return {
      allowed,
      email,
      clerkUserId: userId,
      bucket: payrollRbacBucketName(),
      key: payrollRbacAccessKey(),
    };
  }
}

export async function requirePayrollAccess(
  sessionToken: string,
  emailHint?: string,
): Promise<PayrollAccessCheckResult> {
  const result = await checkPayrollAccessForToken(sessionToken, emailHint);
  if (!result.allowed) {
    throw new Error(
      `Forbidden — payroll is restricted to approved users in s3://${payrollRbacBucketName()}/${payrollRbacAccessKey()}`,
    );
  }
  return result;
}
