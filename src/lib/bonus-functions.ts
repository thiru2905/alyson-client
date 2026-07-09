import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  appendBonusCashEvent,
  appendShareLedgerEvent,
  ensureBonusOnS3,
  getBonusOperationsLog,
  voidBonusCashEvent,
  voidShareLedgerEvent,
} from "@/lib/bonus-s3.server";
import { buildBonusAnalyticsReport } from "@/lib/bonus-analytics";
import { superAccessInputSchema } from "@/lib/super-access-input";
import { requireSuperAccess } from "@/lib/super-access-rbac.server";
import type { EmployeeCompensationLedger } from "@/lib/bonus-schema";

const actorWithAuthSchema = superAccessInputSchema.extend({
  actor: z.string().email().optional().nullable(),
});

const appendBonusSchema = actorWithAuthSchema.extend({
  employeeId: z.string().min(1),
  amountUsd: z.number().positive(),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodLabel: z.string().optional(),
  note: z.string().optional(),
});

const appendShareSchema = actorWithAuthSchema.extend({
  employeeId: z.string().min(1),
  eventType: z.enum(["grant", "vest", "adjustment", "note"]),
  shares: z.number(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  strikePriceUsd: z.number().optional().nullable(),
  note: z.string().optional(),
});

const voidEventSchema = actorWithAuthSchema.extend({
  employeeId: z.string().min(1),
  eventId: z.string().min(1),
});

function ledgersToArray(employees: Record<string, EmployeeCompensationLedger>) {
  return Object.values(employees).sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.employeeName.localeCompare(b.employeeName, undefined, { sensitivity: "base" });
  });
}

export const getBonusLedger = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => superAccessInputSchema.parse(data))
  .handler(async ({ data }) => {
    await requireSuperAccess(data.clerkToken, data.emailHint);
    const bonusData = await ensureBonusOnS3();
    return {
      ledgers: ledgersToArray(bonusData.employees),
      updatedAt: bonusData.updatedAt,
      syncedFromOnboardingAt: bonusData.syncedFromOnboardingAt,
      onboardingUpdatedAt: bonusData.onboardingUpdatedAt,
      bucket: bonusData.bucket,
      key: bonusData.key,
      logKey: bonusData.logKey,
    };
  });

export const syncBonusWithOnboarding = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => actorWithAuthSchema.parse(data))
  .handler(async ({ data }) => {
    await requireSuperAccess(data.clerkToken, data.emailHint);
    const result = await ensureBonusOnS3(data.actor ?? null);
    return {
      ledgers: ledgersToArray(result.employees),
      updatedAt: result.updatedAt,
      syncedFromOnboardingAt: result.syncedFromOnboardingAt,
      bucket: result.bucket,
      key: result.key,
    };
  });

export const recordBonusPayment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => appendBonusSchema.parse(data))
  .handler(async ({ data }) => {
    await requireSuperAccess(data.clerkToken, data.emailHint);
    const { clerkToken: _t, emailHint: _e, ...rest } = data;
    const result = await appendBonusCashEvent({
      employeeId: rest.employeeId,
      amountUsd: rest.amountUsd,
      paidOn: rest.paidOn,
      periodLabel: rest.periodLabel,
      note: rest.note,
      actor: rest.actor ?? null,
    });
    return { event: result.event, ledger: result.ledger };
  });

export const recordShareEvent = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => appendShareSchema.parse(data))
  .handler(async ({ data }) => {
    await requireSuperAccess(data.clerkToken, data.emailHint);
    const { clerkToken: _t, emailHint: _e, ...rest } = data;
    const result = await appendShareLedgerEvent({
      employeeId: rest.employeeId,
      eventType: rest.eventType,
      shares: rest.shares,
      effectiveDate: rest.effectiveDate,
      strikePriceUsd: rest.strikePriceUsd,
      note: rest.note,
      actor: rest.actor ?? null,
    });
    return { event: result.event, ledger: result.ledger };
  });

export const voidBonusPayment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => voidEventSchema.parse(data))
  .handler(async ({ data }) => {
    await requireSuperAccess(data.clerkToken, data.emailHint);
    const { clerkToken: _t, emailHint: _e, ...rest } = data;
    const result = await voidBonusCashEvent({
      employeeId: rest.employeeId,
      eventId: rest.eventId,
      actor: rest.actor ?? null,
    });
    return { removed: result.removed, ledger: result.ledger };
  });

export const voidShareEvent = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => voidEventSchema.parse(data))
  .handler(async ({ data }) => {
    await requireSuperAccess(data.clerkToken, data.emailHint);
    const { clerkToken: _t, emailHint: _e, ...rest } = data;
    const result = await voidShareLedgerEvent({
      employeeId: rest.employeeId,
      eventId: rest.eventId,
      actor: rest.actor ?? null,
    });
    return { removed: result.removed, ledger: result.ledger };
  });

export const getBonusAnalytics = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => superAccessInputSchema.parse(data))
  .handler(async ({ data }) => {
    await requireSuperAccess(data.clerkToken, data.emailHint);
    const bonusData = await ensureBonusOnS3();
    const ledgers = ledgersToArray(bonusData.employees);
    return buildBonusAnalyticsReport(ledgers, bonusData.updatedAt);
  });

export const getBonusAuditLog = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => superAccessInputSchema.parse(data))
  .handler(async ({ data }) => {
    await requireSuperAccess(data.clerkToken, data.emailHint);
    const log = await getBonusOperationsLog(300);
    return {
      entries: log.entries,
      bucket: log.bucket,
      key: log.key,
    };
  });
