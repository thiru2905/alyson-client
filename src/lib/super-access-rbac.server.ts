import { verifyToken, createClerkClient } from "@clerk/backend";
import { isDevClerkBypass } from "@/lib/clerk-auth.server";
import { isSuperAccessEmail } from "@/lib/super-access-constants";
import {
  ensureSuperAccessOnS3,
  findSuperAccessMember,
  linkSuperAccessClerkUser,
  loadSuperAccessMembers,
  superAccessRbacAccessKey,
  superAccessRbacBucketName,
  syncSuperAccessBootstrapMembers,
} from "@/lib/super-access-rbac-s3.server";
import type { SuperAccessCheckResult } from "@/lib/super-access-rbac.schema";

const MISSING_CLERK_SECRET_MSG =
  "Missing CLERK_SECRET_KEY — add CLERK_SECRET_KEY=sk_... to .env (Clerk Dashboard → API Keys), then restart npm run dev.";

function clerkSecretKey() {
  const key = process.env.CLERK_SECRET_KEY?.trim();
  if (!key) throw new Error(MISSING_CLERK_SECRET_MSG);
  return key;
}

async function checkSuperAccessDevBypass(emailHint: string): Promise<SuperAccessCheckResult> {
  const email = emailHint.trim().toLowerCase();
  if (!email) throw new Error(MISSING_CLERK_SECRET_MSG);

  try {
    await syncSuperAccessBootstrapMembers();
    const members = await loadSuperAccessMembers();
    const member = findSuperAccessMember(members, email, undefined);
    const allowed = Boolean(member) || isSuperAccessEmail(email);
    if (!allowed) {
      throw new Error(
        `Forbidden — super access is restricted to approved users in s3://${superAccessRbacBucketName()}/${superAccessRbacAccessKey()}`,
      );
    }
    const meta = await ensureSuperAccessOnS3();
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
    if (!isSuperAccessEmail(email)) throw new Error(MISSING_CLERK_SECRET_MSG);
    return {
      allowed: true,
      email,
      bucket: superAccessRbacBucketName(),
      key: superAccessRbacAccessKey(),
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

export async function checkSuperAccessForToken(
  sessionToken: string,
  emailHint?: string,
): Promise<SuperAccessCheckResult> {
  if (isDevClerkBypass()) {
    const email = String(emailHint || "").trim().toLowerCase();
    if (!email) throw new Error(MISSING_CLERK_SECRET_MSG);
    return checkSuperAccessDevBypass(email);
  }

  const { email, userId } = await clerkIdentityFromToken(sessionToken);

  try {
    await syncSuperAccessBootstrapMembers();
    const members = await loadSuperAccessMembers();
    const member = findSuperAccessMember(members, email, userId);

    if (member) {
      await linkSuperAccessClerkUser(email, userId);
    }

    const allowed = Boolean(member) || isSuperAccessEmail(email);
    const meta = await ensureSuperAccessOnS3();
    return {
      allowed,
      email,
      memberId: member?.id,
      clerkUserId: member?.clerkUserId ?? userId,
      bucket: meta.bucket,
      key: meta.key,
    };
  } catch {
    const allowed = isSuperAccessEmail(email);
    return {
      allowed,
      email,
      clerkUserId: userId,
      bucket: superAccessRbacBucketName(),
      key: superAccessRbacAccessKey(),
    };
  }
}

export async function requireSuperAccess(
  sessionToken: string,
  emailHint?: string,
): Promise<SuperAccessCheckResult> {
  const result = await checkSuperAccessForToken(sessionToken, emailHint);
  if (!result.allowed) {
    throw new Error(
      `Forbidden — super access is restricted to approved users in s3://${superAccessRbacBucketName()}/${superAccessRbacAccessKey()}`,
    );
  }
  return result;
}
