import { format } from "date-fns";
import { extractLeaveFromEmail } from "@/lib/leave-email-extract.server";
import {
  gmailConfigured,
  leaveEmailMonthWindows,
  listLeaveEmailMessages,
  type LeaveEmailMessage,
} from "@/lib/leave-email-gmail.server";
import {
  findOverlappingLeaveEvent,
  matchLeaveEmailToEmployee,
} from "@/lib/leave-email-match.server";
import {
  appendLeaveEmailProcessed,
  loadProcessedGmailIds,
  newLeaveEmailQueueItemId,
  readLeaveEmailQueue,
  readLeaveEmailSyncState,
  upsertLeaveEmailQueueItem,
  writeLeaveEmailQueue,
  writeLeaveEmailSyncState,
} from "@/lib/leave-email-queue-s3.server";
import { wouldExceedLifetimeLeaveLimit } from "@/lib/leave-over-limit.server";
import type { LeaveEmailQueueItem } from "@/lib/leave-email-schema";
import { leaveEmailBackfillMonths, leaveEmailHrReviewEnabled, toLeaveType } from "@/lib/leave-email-schema";
import { leaveDaysInclusive } from "@/lib/leave-schema";
import { appendLeaveRecord, ensureLeaveOnS3, voidLeaveRecord } from "@/lib/leave-s3.server";

export type LeaveEmailSyncResult = {
  scanned: number;
  queued: number;
  applied: number;
  skippedProcessed: number;
  notLeave: number;
  unmatched: number;
  duplicates: number;
  errors: string[];
};

function resolveLeaveDays(
  startDate: string,
  endDate: string,
  days: number | null | undefined,
  halfDay?: boolean,
): number {
  if (halfDay) return 0.5;
  if (days != null && days > 0) {
    if (days > 0 && days < 1) return 0.5;
    return Math.round(days);
  }
  return leaveDaysInclusive(startDate, endDate);
}

export function queueItemToLeaveEmailMessage(item: LeaveEmailQueueItem): LeaveEmailMessage {
  return {
    id: item.gmailMessageId,
    threadId: item.threadId,
    receivedAt: item.receivedAt,
    fromEmail: item.fromEmail,
    fromName: item.fromName,
    subject: item.subject,
    snippet: item.bodySnippet,
    bodyText: item.bodyText || item.bodySnippet,
  };
}

async function processLeaveEmailMessage(
  msg: LeaveEmailMessage,
  employees: Awaited<ReturnType<typeof ensureLeaveOnS3>>["employees"],
  opts: { source: "sync" | "backfill"; existing?: LeaveEmailQueueItem },
): Promise<{ item: LeaveEmailQueueItem; bucket: keyof LeaveEmailSyncResult }> {
  const now = new Date().toISOString();
  const base: LeaveEmailQueueItem = opts.existing
    ? {
        ...opts.existing,
        updatedAt: now,
        extraction: null,
        extractionError: undefined,
        matchedEmployeeId: null,
        matchedEmployeeName: null,
        linkedLeaveEventId: null,
        salaryDeductionRisk: undefined,
        reviewedBy: null,
        reviewedAt: null,
        status: "pending",
      }
    : {
        id: newLeaveEmailQueueItemId(),
        gmailMessageId: msg.id,
        threadId: msg.threadId,
        receivedAt: msg.receivedAt,
        fromEmail: msg.fromEmail,
        fromName: msg.fromName,
        subject: msg.subject,
        bodySnippet: msg.snippet,
        bodyText: msg.bodyText,
        extraction: null,
        matchedEmployeeId: null,
        matchedEmployeeName: null,
        status: "pending",
        source: opts.source,
        createdAt: now,
        updatedAt: now,
      };

  try {
    const extraction = await extractLeaveFromEmail(msg);
    base.extraction = extraction;

    if (!extraction.isLeaveRequest) {
      base.status = "not_leave";
      return { item: base, bucket: "notLeave" };
    }

    if (extraction.leave.isCancellation) {
      const match = await matchLeaveEmailToEmployee({
        extraction,
        fromEmail: msg.fromEmail,
        fromName: msg.fromName,
        employees,
      });
      if (match) {
        base.matchedEmployeeId = match.employeeId;
        base.matchedEmployeeName = match.employeeName;
      }
      base.status = "pending";
      return { item: base, bucket: "queued" };
    }

    const startDate = extraction.leave.startDate;
    const endDate = extraction.leave.endDate;
    if (!startDate || !endDate) {
      base.status = "pending";
      return { item: base, bucket: "queued" };
    }

    const match = await matchLeaveEmailToEmployee({
      extraction,
      fromEmail: msg.fromEmail,
      fromName: msg.fromName,
      employees,
    });

    if (!match) {
      base.status = "unmatched";
      return { item: base, bucket: "unmatched" };
    }

    base.matchedEmployeeId = match.employeeId;
    base.matchedEmployeeName = match.employeeName;

    const ledger = employees[match.employeeId];
    const days = resolveLeaveDays(
      startDate,
      endDate,
      extraction.leave.days,
      extraction.leave.halfDay,
    );
    const existing = ledger ? findOverlappingLeaveEvent(ledger, startDate, endDate) : null;
    if (existing) {
      base.status = "duplicate";
      base.linkedLeaveEventId = existing.id;
      return { item: base, bucket: "duplicates" };
    }

    base.salaryDeductionRisk = ledger
      ? wouldExceedLifetimeLeaveLimit(ledger.leaveEvents, days)
      : false;
    base.status = "pending";
    return { item: base, bucket: "queued" };
  } catch (e) {
    base.status = "extraction_failed";
    base.extractionError = e instanceof Error ? e.message : String(e);
    return { item: base, bucket: "errors" };
  }
}

async function processOneEmail(
  msg: LeaveEmailMessage,
  employees: Awaited<ReturnType<typeof ensureLeaveOnS3>>["employees"],
  source: "sync" | "backfill",
): Promise<{ item: LeaveEmailQueueItem; bucket: keyof LeaveEmailSyncResult }> {
  return processLeaveEmailMessage(msg, employees, { source });
}

/** Auto-write matched leave to ledger when HR review is disabled. */
async function tryAutoApplyLeaveEmailItem(
  item: LeaveEmailQueueItem,
  actor: string | null = "leave-email-sync",
): Promise<"applied" | "queued" | "error"> {
  if (leaveEmailHrReviewEnabled()) return "queued";
  if (!item.matchedEmployeeId && !item.extraction?.leave.isCancellation) return "queued";
  if (!item.extraction?.isLeaveRequest && !item.extraction?.leave.isCancellation) return "queued";

  try {
    await approveLeaveEmailQueueItem({
      queueItemId: item.id,
      actor,
      allowOverLimit: item.salaryDeductionRisk ?? false,
    });
    return "applied";
  } catch (e) {
    item.extractionError = e instanceof Error ? e.message : String(e);
    item.status = item.status === "pending" ? "extraction_failed" : item.status;
    await upsertLeaveEmailQueueItem(item);
    return "error";
  }
}

async function handleProcessedEmail(
  msg: Awaited<ReturnType<typeof listLeaveEmailMessages>>[number],
  item: LeaveEmailQueueItem,
  bucket: keyof LeaveEmailSyncResult,
  result: LeaveEmailSyncResult,
): Promise<void> {
  if (bucket === "queued") {
    const outcome = await tryAutoApplyLeaveEmailItem(item);
    if (outcome === "applied") result.applied += 1;
    else if (outcome === "queued") result.queued += 1;
    else result.errors.push(`${msg.subject}: ${item.extractionError}`);
    return;
  }
  if (bucket === "notLeave") {
    result.notLeave += 1;
    await appendLeaveEmailProcessed({
      ts: new Date().toISOString(),
      gmailMessageId: msg.id,
      threadId: msg.threadId,
      status: "not_leave",
      queueItemId: item.id,
    });
  } else if (bucket === "unmatched") result.unmatched += 1;
  else if (bucket === "duplicates") {
    result.duplicates += 1;
    await appendLeaveEmailProcessed({
      ts: new Date().toISOString(),
      gmailMessageId: msg.id,
      threadId: msg.threadId,
      status: "duplicate",
      queueItemId: item.id,
      linkedLeaveEventId: item.linkedLeaveEventId ?? null,
    });
  } else if (bucket === "errors") result.errors.push(`${msg.subject}: ${item.extractionError}`);
}

/** Retry queue items that matched but were not yet written (e.g. before auto-apply existed). */
async function retryPendingLeaveEmailItems(result: LeaveEmailSyncResult): Promise<void> {
  const queue = await readLeaveEmailQueue();
  const retry = queue.items.filter(
    (i) =>
      i.status === "pending" &&
      i.matchedEmployeeId &&
      (i.extraction?.isLeaveRequest || i.extraction?.leave.isCancellation),
  );
  for (const item of retry) {
    const outcome = await tryAutoApplyLeaveEmailItem(item);
    if (outcome === "applied") result.applied += 1;
    else if (outcome === "queued") result.queued += 1;
    else if (item.extractionError) result.errors.push(`${item.subject}: ${item.extractionError}`);
  }
}

async function ingestLeaveEmailBatch(args: {
  messages: LeaveEmailMessage[];
  employees: Awaited<ReturnType<typeof ensureLeaveOnS3>>["employees"];
  source: "sync" | "backfill";
  processed: Set<string>;
  existingIds: Set<string>;
  failedByGmailId: Map<string, LeaveEmailQueueItem>;
  result: LeaveEmailSyncResult;
}): Promise<Awaited<ReturnType<typeof ensureLeaveOnS3>>["employees"]> {
  let data = { employees: args.employees } as Awaited<ReturnType<typeof ensureLeaveOnS3>>;

  for (const msg of args.messages) {
    args.result.scanned += 1;
    const failedExisting = args.failedByGmailId.get(msg.id);
    if (
      !failedExisting &&
      (args.processed.has(msg.id) || args.existingIds.has(msg.id))
    ) {
      args.result.skippedProcessed += 1;
      continue;
    }

    const { item, bucket } = failedExisting
      ? await processLeaveEmailMessage(msg, data.employees, {
          source: failedExisting.source,
          existing: failedExisting,
        })
      : await processOneEmail(msg, data.employees, args.source);
    await upsertLeaveEmailQueueItem(item);
    args.existingIds.add(msg.id);
    if (failedExisting) {
      if (item.status === "extraction_failed") {
        args.failedByGmailId.set(msg.id, item);
      } else {
        args.failedByGmailId.delete(msg.id);
      }
    }
    await handleProcessedEmail(msg, item, bucket, args.result);
    if (bucket === "queued" && !leaveEmailHrReviewEnabled()) {
      data = await ensureLeaveOnS3("leave-email-sync");
    }
  }

  return data.employees;
}

export type LeaveEmailScanPeriod = "7d" | "30d" | "90d" | "6mo" | "12mo" | "24mo";

export const LEAVE_EMAIL_SCAN_OPTIONS: { value: LeaveEmailScanPeriod; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "6mo", label: "Last 6 months" },
  { value: "12mo", label: "Last 12 months" },
  { value: "24mo", label: "Last 24 months (slow)" },
];

export async function runLeaveEmailScan(period: LeaveEmailScanPeriod): Promise<LeaveEmailSyncResult> {
  switch (period) {
    case "7d":
      return runLeaveEmailSync({ lookbackDays: 7, maxMessages: 60 });
    case "30d":
      return runLeaveEmailSync({ lookbackDays: 30, maxMessages: 100 });
    case "90d":
      return runLeaveEmailSync({ lookbackDays: 90, maxMessages: 200 });
    case "6mo":
      return runLeaveEmailBackfill({ monthsBack: 6, maxMessagesPerMonth: 200 });
    case "12mo":
      return runLeaveEmailBackfill({ monthsBack: 12, maxMessagesPerMonth: 250 });
    case "24mo":
      return runLeaveEmailBackfill({ monthsBack: 24, maxMessagesPerMonth: 300 });
  }
}

export async function runLeaveEmailSync(args?: {
  /** How far back to scan on routine sync (default 14 days). */
  lookbackDays?: number;
  maxMessages?: number;
}): Promise<LeaveEmailSyncResult> {
  const result: LeaveEmailSyncResult = {
    scanned: 0,
    queued: 0,
    applied: 0,
    skippedProcessed: 0,
    notLeave: 0,
    unmatched: 0,
    duplicates: 0,
    errors: [],
  };

  if (!gmailConfigured()) {
    result.errors.push("Google DWD not configured for Gmail read");
    return result;
  }

  await retryPendingLeaveEmailItems(result);

  const syncState = await readLeaveEmailSyncState();
  const lookbackDays = args?.lookbackDays ?? (syncState.lastBackfillThrough ? 30 : 90);
  const after = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const processed = await loadProcessedGmailIds();
  let data = await ensureLeaveOnS3("leave-email-sync");
  const messages = await listLeaveEmailMessages({
    after,
    maxResults: args?.maxMessages ?? (syncState.lastBackfillThrough ? 80 : 250),
  });

  const queue = await readLeaveEmailQueue();
  const existingIds = new Set(queue.items.map((i) => i.gmailMessageId));
  const failedByGmailId = new Map(
    queue.items
      .filter((i) => i.status === "extraction_failed")
      .map((i) => [i.gmailMessageId, i] as const),
  );

  try {
    data.employees = await ingestLeaveEmailBatch({
      messages,
      employees: data.employees,
      source: "sync",
      processed,
      existingIds,
      failedByGmailId,
      result,
    });
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
  }

  await writeLeaveEmailSyncState({
    lastSyncAt: new Date().toISOString(),
    lastError: result.errors.length ? result.errors[0] : "",
  });

  return result;
}

/** Scan historical People Ops mail month-by-month (Gmail only returns newest N per query). */
export async function runLeaveEmailBackfill(args?: {
  monthsBack?: number;
  maxMessagesPerMonth?: number;
}): Promise<LeaveEmailSyncResult> {
  const monthsBack = args?.monthsBack ?? leaveEmailBackfillMonths();
  const perMonth = args?.maxMessagesPerMonth ?? 500;
  const result: LeaveEmailSyncResult = {
    scanned: 0,
    queued: 0,
    applied: 0,
    skippedProcessed: 0,
    notLeave: 0,
    unmatched: 0,
    duplicates: 0,
    errors: [],
  };

  if (!gmailConfigured()) {
    result.errors.push("Google DWD not configured");
    return result;
  }

  await retryPendingLeaveEmailItems(result);

  const processed = await loadProcessedGmailIds();
  let data = await ensureLeaveOnS3("leave-email-backfill");
  const queue = await readLeaveEmailQueue();
  const existingIds = new Set(queue.items.map((i) => i.gmailMessageId));
  const failedByGmailId = new Map(
    queue.items
      .filter((i) => i.status === "extraction_failed")
      .map((i) => [i.gmailMessageId, i] as const),
  );

  const windows = leaveEmailMonthWindows(monthsBack);

  for (const window of windows) {
    try {
      const messages = await listLeaveEmailMessages({
        after: window.after,
        before: window.before,
        maxResults: perMonth,
      });
      data.employees = await ingestLeaveEmailBatch({
        messages,
        employees: data.employees,
        source: "backfill",
        processed,
        existingIds,
        failedByGmailId,
        result,
      });
    } catch (e) {
      result.errors.push(
        `${format(window.after, "yyyy-MM")}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  await writeLeaveEmailSyncState({
    lastBackfillThrough: new Date().toISOString(),
    lastError: result.errors.length ? result.errors[0] : "",
  });

  return result;
}

export type LeaveEmailRetryResult = {
  ok: boolean;
  item: LeaveEmailQueueItem;
  applied: boolean;
  error?: string;
};

export type LeaveEmailRetryAllResult = {
  retried: number;
  succeeded: number;
  applied: number;
  errors: string[];
};

async function finalizeRetriedLeaveEmailItem(
  item: LeaveEmailQueueItem,
  bucket: keyof LeaveEmailSyncResult,
  actor: string | null,
): Promise<LeaveEmailRetryResult> {
  await upsertLeaveEmailQueueItem(item);

  if (bucket === "errors") {
    return { ok: false, item, applied: false, error: item.extractionError };
  }

  if (bucket === "queued") {
    const outcome = await tryAutoApplyLeaveEmailItem(item, actor ?? "leave-email-retry");
    if (outcome === "applied") {
      return { ok: true, item, applied: true };
    }
    if (outcome === "error") {
      return { ok: false, item, applied: false, error: item.extractionError };
    }
    return { ok: true, item, applied: false };
  }

  if (bucket === "notLeave") {
    await appendLeaveEmailProcessed({
      ts: new Date().toISOString(),
      gmailMessageId: item.gmailMessageId,
      threadId: item.threadId,
      status: "not_leave",
      queueItemId: item.id,
    });
  } else if (bucket === "duplicates") {
    await appendLeaveEmailProcessed({
      ts: new Date().toISOString(),
      gmailMessageId: item.gmailMessageId,
      threadId: item.threadId,
      status: "duplicate",
      queueItemId: item.id,
      linkedLeaveEventId: item.linkedLeaveEventId ?? null,
    });
  }

  return { ok: true, item, applied: false };
}

/** Re-run DeepSeek extraction for one queue item (stored email body — no Gmail fetch). */
export async function retryLeaveEmailQueueItem(args: {
  queueItemId: string;
  actor?: string | null;
}): Promise<LeaveEmailRetryResult> {
  const file = await readLeaveEmailQueue();
  const existing = file.items.find((i) => i.id === args.queueItemId);
  if (!existing) throw new Error("Queue item not found");
  if (existing.status !== "extraction_failed") {
    throw new Error("Only failed extractions can be retried");
  }
  if (!existing.bodyText?.trim() && !existing.bodySnippet?.trim()) {
    throw new Error("Email body missing — run Scan mail to refresh this message");
  }

  const data = await ensureLeaveOnS3(args.actor ?? "leave-email-retry");
  const msg = queueItemToLeaveEmailMessage(existing);
  const { item, bucket } = await processLeaveEmailMessage(msg, data.employees, {
    source: existing.source,
    existing,
  });
  return finalizeRetriedLeaveEmailItem(item, bucket, args.actor ?? null);
}

/** Re-run DeepSeek for every extraction_failed item in the queue. */
export async function retryAllFailedLeaveEmailExtractions(args?: {
  actor?: string | null;
}): Promise<LeaveEmailRetryAllResult> {
  const queue = await readLeaveEmailQueue();
  const failed = queue.items.filter((i) => i.status === "extraction_failed");
  const result: LeaveEmailRetryAllResult = {
    retried: 0,
    succeeded: 0,
    applied: 0,
    errors: [],
  };

  for (const item of failed) {
    try {
      const r = await retryLeaveEmailQueueItem({
        queueItemId: item.id,
        actor: args?.actor ?? null,
      });
      result.retried += 1;
      if (r.ok) result.succeeded += 1;
      if (r.applied) result.applied += 1;
      else if (r.error) result.errors.push(`${item.subject || item.id}: ${r.error}`);
    } catch (e) {
      result.errors.push(
        `${item.subject || item.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return result;
}

export async function approveLeaveEmailQueueItem(args: {
  queueItemId: string;
  actor: string | null;
  employeeId?: string;
  leaveType?: string;
  startDate?: string;
  endDate?: string;
  days?: number;
  allowOverLimit?: boolean;
}): Promise<{ eventId: string; ledgerEmployeeId: string }> {
  const file = await readLeaveEmailQueue();
  const item = file.items.find((i) => i.id === args.queueItemId);
  if (!item) throw new Error("Queue item not found");
  if (item.status === "approved") throw new Error("Already approved");

  const extraction = item.extraction;
  if (!extraction?.isLeaveRequest && !extraction?.leave.isCancellation) {
    throw new Error("Not a leave request");
  }

  const employeeId = args.employeeId || item.matchedEmployeeId;
  if (!employeeId) throw new Error("No employee matched — select an employee before approving");

  if (extraction.leave.isCancellation) {
    const data = await ensureLeaveOnS3(args.actor);
    const ledger = data.employees[employeeId];
    if (!ledger) throw new Error("Employee not found");
    const start = extraction.leave.startDate;
    const end = extraction.leave.endDate;
    const match = ledger.leaveEvents.find(
      (e) =>
        (!start || e.startDate === start) && (!end || e.endDate === end),
    );
    if (match) {
      await voidLeaveRecord({ employeeId, eventId: match.id, actor: args.actor });
    }
    item.status = "approved";
    item.reviewedBy = args.actor;
    item.reviewedAt = new Date().toISOString();
    item.updatedAt = item.reviewedAt;
    await upsertLeaveEmailQueueItem(item);
    await appendLeaveEmailProcessed({
      ts: item.reviewedAt,
      gmailMessageId: item.gmailMessageId,
      threadId: item.threadId,
      status: "approved",
      queueItemId: item.id,
      linkedLeaveEventId: match?.id ?? null,
    });
    return { eventId: match?.id ?? "", ledgerEmployeeId: employeeId };
  }

  const startDate = args.startDate || extraction.leave.startDate;
  const endDate = args.endDate || extraction.leave.endDate;
  if (!startDate || !endDate) throw new Error("Missing leave dates");

  const data = await ensureLeaveOnS3(args.actor);
  const ledger = data.employees[employeeId];
  if (!ledger) throw new Error("Employee not found in leave ledger");

  const existing = findOverlappingLeaveEvent(ledger, startDate, endDate);
  if (existing) {
    const reviewedAt = new Date().toISOString();
    item.status = "duplicate";
    item.linkedLeaveEventId = existing.id;
    item.matchedEmployeeId = employeeId;
    item.reviewedBy = args.actor;
    item.reviewedAt = reviewedAt;
    item.updatedAt = reviewedAt;
    await upsertLeaveEmailQueueItem(item);
    await appendLeaveEmailProcessed({
      ts: reviewedAt,
      gmailMessageId: item.gmailMessageId,
      threadId: item.threadId,
      status: "duplicate",
      queueItemId: item.id,
      linkedLeaveEventId: existing.id,
    });
    return { eventId: existing.id, ledgerEmployeeId: employeeId };
  }

  const halfDay = Boolean(extraction.leave.halfDay);
  const days =
    args.days ??
    resolveLeaveDays(startDate, endDate, extraction.leave.days, halfDay);

  const note = [
    "Email leave",
    `msg:${item.gmailMessageId}`,
    `tone:${extraction.tone.label}`,
    extraction.rawSummary,
    item.subject,
  ]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 500);

  const { event } = await appendLeaveRecord({
    employeeId,
    leaveType: toLeaveType(args.leaveType || extraction.leave.leaveType),
    startDate,
    endDate: halfDay ? startDate : endDate,
    days,
    halfDay,
    note,
    actor: args.actor ?? "leave-email-agent",
    allowOverLimit: args.allowOverLimit ?? item.salaryDeductionRisk ?? false,
  });

  item.status = "approved";
  item.linkedLeaveEventId = event.id;
  item.matchedEmployeeId = employeeId;
  item.reviewedBy = args.actor;
  item.reviewedAt = new Date().toISOString();
  item.updatedAt = item.reviewedAt;
  await upsertLeaveEmailQueueItem(item);
  await appendLeaveEmailProcessed({
    ts: item.reviewedAt,
    gmailMessageId: item.gmailMessageId,
    threadId: item.threadId,
    status: "approved",
    queueItemId: item.id,
    linkedLeaveEventId: event.id,
  });

  return { eventId: event.id, ledgerEmployeeId: employeeId };
}

/* HR manual review — disabled for now (set LEAVE_EMAIL_HR_REVIEW_ENABLED=true to re-enable).

export async function rejectLeaveEmailQueueItem(args: {
  queueItemId: string;
  actor: string | null;
}): Promise<void> {
  const file = await readLeaveEmailQueue();
  const item = file.items.find((i) => i.id === args.queueItemId);
  if (!item) throw new Error("Queue item not found");
  item.status = "rejected";
  item.reviewedBy = args.actor;
  item.reviewedAt = new Date().toISOString();
  item.updatedAt = item.reviewedAt;
  await upsertLeaveEmailQueueItem(item);
  await appendLeaveEmailProcessed({
    ts: item.reviewedAt,
    gmailMessageId: item.gmailMessageId,
    threadId: item.threadId,
    status: "rejected",
    queueItemId: item.id,
  });
}

// Clear rejected/approved from active queue view (archive).
export async function archiveReviewedLeaveEmailItems(): Promise<number> {
  const file = await readLeaveEmailQueue();
  const keep = file.items.filter(
    (i) => !["approved", "rejected", "not_leave", "duplicate"].includes(i.status),
  );
  const removed = file.items.length - keep.length;
  if (removed > 0) await writeLeaveEmailQueue(keep);
  return removed;
}
*/
