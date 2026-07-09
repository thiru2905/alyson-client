export type SuperAccessMember = {
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

export type SuperAccessFile = {
  version: 1;
  updatedAt: string;
  members: SuperAccessMember[];
};

export type SuperAccessCheckResult = {
  allowed: boolean;
  email: string;
  memberId?: string;
  clerkUserId?: string | null;
  bucket: string;
  key: string;
};
