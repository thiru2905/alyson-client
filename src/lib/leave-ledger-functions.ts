import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { buildLeaveAnalyticsReport } from "@/lib/leave-analytics";
import type { EmployeeLeaveLedger } from "@/lib/leave-schema";
import {
  appendLeaveRecord,
  ensureLeaveOnS3,
  getLeaveOperationsLog,
  voidLeaveRecord,
} from "@/lib/leave-s3.server";

const actorSchema = z.object({
  actor: z.string().email().optional().nullable(),
});

const appendLeaveSchema = actorSchema.extend({
  employeeId: z.string().min(1),
  leaveType: z.enum(["annual", "sick", "personal", "unpaid", "other"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.number().positive().optional(),
  note: z.string().optional(),
});

const voidEventSchema = actorSchema.extend({
  employeeId: z.string().min(1),
  eventId: z.string().min(1),
});

const analyticsInputSchema = z.object({
  year: z.number().int().min(2020).max(2100).optional(),
});

function ledgersToArray(employees: Record<string, EmployeeLeaveLedger>) {
  return Object.values(employees).sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.employeeName.localeCompare(b.employeeName, undefined, { sensitivity: "base" });
  });
}

export const getLeaveLedger = createServerFn({ method: "GET" }).handler(async () => {
  const data = await ensureLeaveOnS3();
    return {
      ledgers: ledgersToArray(data.employees),
      updatedAt: data.updatedAt,
      syncedFromOnboardingAt: data.syncedFromOnboardingAt,
      bucket: data.bucket,
      key: data.key,
      logKey: data.logKey,
    };
});

export const syncLeaveWithTimeDoctor = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => actorSchema.parse(data))
  .handler(async ({ data }) => {
    const result = await ensureLeaveOnS3(data.actor ?? null);
    return {
      ledgers: ledgersToArray(result.employees),
      updatedAt: result.updatedAt,
      syncedFromOnboardingAt: result.syncedFromOnboardingAt,
      bucket: result.bucket,
      key: result.key,
    };
  });

/** @deprecated Use syncLeaveWithTimeDoctor */
export const syncLeaveWithOnboarding = syncLeaveWithTimeDoctor;

export const recordLeave = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => appendLeaveSchema.parse(data))
  .handler(async ({ data }) => {
    const result = await appendLeaveRecord({
      employeeId: data.employeeId,
      leaveType: data.leaveType,
      startDate: data.startDate,
      endDate: data.endDate,
      days: data.days,
      note: data.note,
      actor: data.actor ?? null,
    });
    return { event: result.event, ledger: result.ledger };
  });

export const voidLeave = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => voidEventSchema.parse(data))
  .handler(async ({ data }) => {
    const result = await voidLeaveRecord({
      employeeId: data.employeeId,
      eventId: data.eventId,
      actor: data.actor ?? null,
    });
    return { removed: result.removed, ledger: result.ledger };
  });

export const getLeaveAnalytics = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => analyticsInputSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const file = await ensureLeaveOnS3();
    const ledgers = ledgersToArray(file.employees);
    const year = data.year ?? new Date().getFullYear();
    return buildLeaveAnalyticsReport(ledgers, file.updatedAt, year);
  });

export const getLeaveAuditLog = createServerFn({ method: "GET" }).handler(async () => {
  const log = await getLeaveOperationsLog(300);
  return { entries: log.entries, bucket: log.bucket, key: log.key };
});
