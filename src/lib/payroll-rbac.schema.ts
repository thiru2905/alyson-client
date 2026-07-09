export type PayrollAccessMember = {
  /** Stable id in S3 — use when linking Clerk user id after first sign-in. */
  id: string;
  email: string;
  clerkUserId?: string | null;
  displayName?: string | null;
  grantedAt: string;
  grantedBy?: string | null;
  linkedAt?: string | null;
  active: boolean;
  note?: string | null;
};

export type PayrollAccessFile = {
  version: 1;
  updatedAt: string;
  members: PayrollAccessMember[];
};

export type PayrollAccessCheckResult = {
  allowed: boolean;
  email: string;
  memberId?: string;
  clerkUserId?: string | null;
  bucket: string;
  key: string;
};
