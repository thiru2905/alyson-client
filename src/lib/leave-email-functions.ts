import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  leaveEmailBackfillMonths,
  leaveEmailHrReviewEnabled,
  leaveEmailMailbox,
  leaveEmailSyncEnabled,
} from "@/lib/leave-email-schema";
import { gmailConfigured, probeLeaveEmailMailbox } from "@/lib/leave-email-gmail.server";
import { readLeaveEmailQueue, readLeaveEmailSyncState } from "@/lib/leave-email-queue-s3.server";
import {
  runLeaveEmailBackfill,
  runLeaveEmailScan,
  runLeaveEmailSync,
  retryAllFailedLeaveEmailExtractions as runRetryAllFailedLeaveEmailExtractions,
  retryLeaveEmailQueueItem,
} from "@/lib/leave-email-sync.server";
import type { LeaveEmailScanPeriod } from "@/lib/leave-email-sync.server";
import { ensureLeaveOnS3 } from "@/lib/leave-s3.server";
import { superAccessInputSchema } from "@/lib/super-access-input";
import { requireSuperAccess } from "@/lib/super-access-rbac.server";

const actorWithAuthSchema = superAccessInputSchema.extend({
  actor: z.string().email().optional().nullable(),
});

/* HR manual review — disabled for now (set LEAVE_EMAIL_HR_REVIEW_ENABLED=true to re-enable).

const approveSchema = actorSchema.extend({
  queueItemId: z.string().min(1),
  employeeId: z.string().optional(),
  leaveType: z.enum(["annual", "sick", "personal", "unpaid", "other"]).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  days: z.number().positive().optional(),
  allowOverLimit: z.boolean().optional(),
});

const queueItemSchema = actorSchema.extend({
  queueItemId: z.string().min(1),
});

*/

export const getLeaveEmailInbox = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => superAccessInputSchema.parse(data))
  .handler(async ({ data }) => {
    await requireSuperAccess(data.clerkToken, data.emailHint);
  const [queue, syncState, roster, mailboxProbe] = await Promise.all([
    readLeaveEmailQueue(),
    readLeaveEmailSyncState(),
    ensureLeaveOnS3(),
    probeLeaveEmailMailbox(),
  ]);

  const allEmails = [...queue.items].sort(
    (a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt),
  );

  const pending = allEmails.filter((i) =>
    ["pending", "unmatched", "extraction_failed"].includes(i.status),
  );
  const leaveRequests = allEmails.filter(
    (i) => i.extraction?.isLeaveRequest || i.extraction?.leave.isCancellation,
  );

  return {
    mailbox: leaveEmailMailbox(),
    syncEnabled: leaveEmailSyncEnabled(),
    hrReviewEnabled: leaveEmailHrReviewEnabled(),
    gmailConfigured: gmailConfigured(),
    mailboxProbe,
    syncState,
    allEmails,
    pending,
    leaveRequests,
    stats: {
      totalEmails: allEmails.length,
      totalLeaveEmails: leaveRequests.length,
      applied: leaveRequests.filter((i) => i.status === "approved").length,
      alreadyOnLedger: leaveRequests.filter((i) => i.status === "duplicate").length,
      needsAttention: pending.length,
      unmatched: leaveRequests.filter((i) => i.status === "unmatched").length,
      notLeave: allEmails.filter((i) => i.status === "not_leave").length,
      extractionFailed: allEmails.filter((i) => i.status === "extraction_failed").length,
    },
    employees: Object.values(roster.employees)
      .filter((e) => e.active)
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName)),
  };
});

export const scanLeaveEmailInbox = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    actorWithAuthSchema
      .extend({
        period: z.enum(["7d", "30d", "90d", "6mo", "12mo", "24mo"]),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await requireSuperAccess(data.clerkToken, data.emailHint);
    return runLeaveEmailScan(data.period as LeaveEmailScanPeriod);
  });

export const syncLeaveEmailInbox = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    actorWithAuthSchema
      .extend({
        lookbackDays: z.number().int().positive().optional(),
        maxMessages: z.number().int().positive().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await requireSuperAccess(data.clerkToken, data.emailHint);
    const result = await runLeaveEmailSync({
      lookbackDays: data.lookbackDays,
      maxMessages: data.maxMessages,
    });
    return result;
  });

export const backfillLeaveEmailInbox = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    actorWithAuthSchema
      .extend({
        monthsBack: z.number().int().positive().optional(),
        maxMessagesPerMonth: z.number().int().positive().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await requireSuperAccess(data.clerkToken, data.emailHint);
    const result = await runLeaveEmailBackfill({
      monthsBack: data.monthsBack ?? leaveEmailBackfillMonths(),
      maxMessagesPerMonth: data.maxMessagesPerMonth ?? 500,
    });
    return result;
  });

export const retryLeaveEmailExtraction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    actorWithAuthSchema.extend({
      queueItemId: z.string().min(1),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireSuperAccess(data.clerkToken, data.emailHint);
    return retryLeaveEmailQueueItem({
      queueItemId: data.queueItemId,
      actor: data.actor ?? null,
    });
  });

export const retryAllFailedLeaveEmailExtractions = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => actorWithAuthSchema.parse(data))
  .handler(async ({ data }) => {
    await requireSuperAccess(data.clerkToken, data.emailHint);
    return runRetryAllFailedLeaveEmailExtractions({ actor: data.actor ?? null });
  });

/* HR manual review — disabled for now.

export const approveLeaveEmail = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => approveSchema.parse(data))
  .handler(async ({ data }) => {
    return approveLeaveEmailQueueItem({
      queueItemId: data.queueItemId,
      actor: data.actor ?? null,
      employeeId: data.employeeId,
      leaveType: data.leaveType,
      startDate: data.startDate,
      endDate: data.endDate,
      days: data.days,
      allowOverLimit: data.allowOverLimit,
    });
  });

export const rejectLeaveEmail = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => queueItemSchema.parse(data))
  .handler(async ({ data }) => {
    await rejectLeaveEmailQueueItem({
      queueItemId: data.queueItemId,
      actor: data.actor ?? null,
    });
    return { ok: true };
  });

export const archiveLeaveEmailReviewed = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => actorSchema.parse(data))
  .handler(async () => {
    const removed = await archiveReviewedLeaveEmailItems();
    return { removed };
  });

*/
