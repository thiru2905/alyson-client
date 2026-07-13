import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { buildLeaveAnalyticsReport } from "@/lib/leave-analytics";
import { superAccessInputSchema } from "@/lib/super-access-input";
import { requireSuperAccess } from "@/lib/super-access-rbac.server";
import type { EmployeeLeaveLedger } from "@/lib/leave-schema";
import {
  appendLeaveRecord,
  appendTeamLeaveRecord,
  ensureLeaveOnS3,
  getLeaveFromS3,
  getLeaveOperationsLog,
  voidLeaveRecord,
  voidTeamLeaveRecord,
} from "@/lib/leave-s3.server";

const actorWithAuthSchema = superAccessInputSchema.extend({
  actor: z.string().email().optional().nullable(),
});

const appendLeaveSchema = actorWithAuthSchema.extend({
  employeeId: z.string().min(1),
  leaveType: z.enum(["annual", "sick", "personal", "unpaid", "other"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.number().positive().optional(),
  halfDay: z.boolean().optional(),
  note: z.string().optional(),
  allowOverLimit: z.boolean().optional(),
});

const voidTeamLeaveSchema = actorWithAuthSchema.extend({
  eventId: z.string().min(1),
});

const appendTeamLeaveSchema = actorWithAuthSchema.extend({
  location: z.string().min(1),
  team: z.string().min(1),
  leaveType: z.enum(["annual", "sick", "personal", "unpaid", "other"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.number().positive().optional(),
  note: z.string().optional(),
});

const voidEventSchema = actorWithAuthSchema.extend({
  employeeId: z.string().min(1),
  eventId: z.string().min(1),
});

const analyticsInputSchema = superAccessInputSchema.extend({
  year: z.number().int().min(2020).max(2100).optional(),
});

function ledgersToArray(employees: Record<string, EmployeeLeaveLedger>) {
  return Object.values(employees).sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.employeeName.localeCompare(b.employeeName, undefined, { sensitivity: "base" });
  });
}

export const getLeaveLedger = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => superAccessInputSchema.parse(data))
  .handler(async ({ data }) => {
    await requireSuperAccess(data.clerkToken, data.emailHint);
    const leaveData = await ensureLeaveOnS3();
    const direct = await getLeaveFromS3();
    const teamLeaves = direct.file?.teamLeaves ?? leaveData.teamLeaves ?? [];
    return {
      ledgers: ledgersToArray(leaveData.employees),
      teamLeaves,
      updatedAt: leaveData.updatedAt,
      syncedFromOnboardingAt: leaveData.syncedFromOnboardingAt,
      bucket: leaveData.bucket,
      key: leaveData.key,
      logKey: leaveData.logKey,
    };
  });

export const syncLeaveWithTimeDoctor = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => actorWithAuthSchema.parse(data))
  .handler(async ({ data }) => {
    await requireSuperAccess(data.clerkToken, data.emailHint);
    const result = await ensureLeaveOnS3(data.actor ?? null);
    return {
      ledgers: ledgersToArray(result.employees),
      teamLeaves: result.teamLeaves ?? [],
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
    await requireSuperAccess(data.clerkToken, data.emailHint);
    const { clerkToken: _t, emailHint: _e, ...rest } = data;
    const result = await appendLeaveRecord({
      employeeId: rest.employeeId,
      leaveType: rest.leaveType,
      startDate: rest.startDate,
      endDate: rest.endDate,
      days: rest.days,
      halfDay: rest.halfDay,
      note: rest.note,
      actor: rest.actor ?? null,
      allowOverLimit: rest.allowOverLimit,
    });
    return { event: result.event, ledger: result.ledger };
  });

export const voidLeave = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => voidEventSchema.parse(data))
  .handler(async ({ data }) => {
    await requireSuperAccess(data.clerkToken, data.emailHint);
    const { clerkToken: _t, emailHint: _e, ...rest } = data;
    const result = await voidLeaveRecord({
      employeeId: rest.employeeId,
      eventId: rest.eventId,
      actor: rest.actor ?? null,
    });
    return { removed: result.removed, ledger: result.ledger };
  });

export const recordTeamLeave = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => appendTeamLeaveSchema.parse(data))
  .handler(async ({ data }) => {
    await requireSuperAccess(data.clerkToken, data.emailHint);
    const { clerkToken: _t, emailHint: _e, ...rest } = data;
    const result = await appendTeamLeaveRecord({
      location: rest.location,
      team: rest.team,
      leaveType: rest.leaveType,
      startDate: rest.startDate,
      endDate: rest.endDate,
      days: rest.days,
      note: rest.note,
      actor: rest.actor ?? null,
    });
    return {
      event: result.event,
      affectedCount: result.affectedCount,
      teamLeaves: result.teamLeaves,
    };
  });

export const voidTeamLeave = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => voidTeamLeaveSchema.parse(data))
  .handler(async ({ data }) => {
    await requireSuperAccess(data.clerkToken, data.emailHint);
    const { clerkToken: _t, emailHint: _e, ...rest } = data;
    const result = await voidTeamLeaveRecord({
      eventId: rest.eventId,
      actor: rest.actor ?? null,
    });
    return { removed: result.removed, teamLeaves: result.teamLeaves };
  });

export const getLeaveAnalytics = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => analyticsInputSchema.parse(data))
  .handler(async ({ data }) => {
    await requireSuperAccess(data.clerkToken, data.emailHint);
    const file = await ensureLeaveOnS3();
    const ledgers = ledgersToArray(file.employees);
    const year = data.year ?? new Date().getFullYear();
    return buildLeaveAnalyticsReport(ledgers, file.updatedAt, year);
  });

export const getLeaveAuditLog = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => superAccessInputSchema.parse(data))
  .handler(async ({ data }) => {
    await requireSuperAccess(data.clerkToken, data.emailHint);
    const log = await getLeaveOperationsLog(300);
    return { entries: log.entries, bucket: log.bucket, key: log.key };
  });
