import { z } from "zod";
import type { LeaveType } from "@/lib/leave-schema";

export const LEAVE_EMAIL_MAILBOX_DEFAULT = "people-ops@cintara.ai";

/** LLMs often return 2.0 or 1.5 — normalize to whole weekday leave days. */
export const leaveDaysFromLlmSchema = z.preprocess(
  (val) => {
    if (val == null || val === "") return null;
    const n = typeof val === "number" ? val : Number(val);
    if (!Number.isFinite(n)) return val;
    if (n < 0) return val;
    if (n > 0 && n < 1) return 1;
    return Math.round(n);
  },
  z.number().int().nonnegative().nullable(),
);

export const LeaveEmailToneSchema = z.object({
  label: z.enum(["formal", "casual", "urgent", "apologetic", "neutral"]),
  summary: z.string(),
});

export const LeaveEmailExtractionSchema = z.object({
  isLeaveRequest: z.boolean(),
  confidence: z.number().min(0).max(1),
  employee: z.object({
    name: z.string(),
    email: z.string().optional().nullable(),
    matchedFrom: z.enum(["from_header", "body_signature", "manager_on_behalf", "unknown"]),
  }),
  leave: z.object({
    leaveType: z.enum(["annual", "sick", "personal", "unpaid", "other"]),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    days: leaveDaysFromLlmSchema,
    reason: z.string().optional().nullable(),
    halfDay: z.boolean().optional(),
    isCancellation: z.boolean().optional(),
    cancelsEventId: z.string().optional().nullable(),
  }),
  tone: LeaveEmailToneSchema,
  warnings: z.array(z.string()).default([]),
  rawSummary: z.string(),
});

export type LeaveEmailExtraction = z.infer<typeof LeaveEmailExtractionSchema>;

export type LeaveEmailQueueStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "unmatched"
  | "duplicate"
  | "not_leave"
  | "extraction_failed";

export type LeaveEmailQueueItem = {
  id: string;
  gmailMessageId: string;
  threadId: string;
  receivedAt: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  bodySnippet: string;
  bodyText: string;
  extraction: LeaveEmailExtraction | null;
  extractionError?: string;
  matchedEmployeeId: string | null;
  matchedEmployeeName: string | null;
  status: LeaveEmailQueueStatus;
  linkedLeaveEventId?: string | null;
  salaryDeductionRisk?: boolean;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  source: "sync" | "backfill";
  createdAt: string;
  updatedAt: string;
};

export type LeaveEmailQueueFile = {
  version: 1;
  updatedAt: string;
  items: LeaveEmailQueueItem[];
};

export type LeaveEmailProcessedEntry = {
  ts: string;
  gmailMessageId: string;
  threadId?: string;
  status: LeaveEmailQueueStatus;
  linkedLeaveEventId?: string | null;
  queueItemId?: string;
};

export type LeaveEmailSyncState = {
  version: 1;
  lastSyncAt: string | null;
  lastBackfillThrough: string | null;
  lastError?: string;
};

export function leaveEmailMailbox(): string {
  return process.env.LEAVE_EMAIL_MAILBOX?.trim().toLowerCase() || LEAVE_EMAIL_MAILBOX_DEFAULT;
}

export function leaveEmailSyncEnabled(): boolean {
  return String(process.env.LEAVE_EMAIL_SYNC_ENABLED ?? "true").trim().toLowerCase() !== "false";
}

/** When false (default), leave is auto-applied to the ledger on sync — no HR approve step. */
export function leaveEmailHrReviewEnabled(): boolean {
  return String(process.env.LEAVE_EMAIL_HR_REVIEW_ENABLED ?? "false").trim().toLowerCase() === "true";
}

export function leaveEmailBackfillMonths(): number {
  const raw = Number(process.env.LEAVE_EMAIL_BACKFILL_MONTHS ?? "24");
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 60) : 24;
}

/**
 * Workspace user whose Gmail inbox is read via DWD (same as Workspace Activity).
 * people-ops@ is usually a group — impersonate a real user and filter mail to that address.
 */
export function leaveEmailGmailUser(): string {
  return (
    process.env.LEAVE_EMAIL_GMAIL_USER?.trim().toLowerCase() ||
    process.env.GOOGLE_WORKSPACE_ADMIN_SUBJECT_EMAIL?.trim().toLowerCase() ||
    ""
  );
}

/** When true, impersonate LEAVE_EMAIL_MAILBOX directly (only if it is a real Workspace user). */
export function leaveEmailImpersonateMailbox(): boolean {
  return String(process.env.LEAVE_EMAIL_IMPERSONATE_MAILBOX ?? "false").trim().toLowerCase() === "true";
}

export function toLeaveType(value: string): LeaveType {
  const v = value as LeaveType;
  if (["annual", "sick", "personal", "unpaid", "other"].includes(v)) return v;
  return "annual";
}
