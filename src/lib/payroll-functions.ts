import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { buildPayrollAnalyticsReport } from "@/lib/payroll-analytics";
import { backfillPayrollSnapshots, buildPayrollReport } from "@/lib/payroll-report.server";
import { requirePayrollAccess } from "@/lib/payroll-rbac.server";
import {
  ensurePayrollOnS3,
  getPayrollOperationsLog,
  markPayrollEmployeePaid,
  unmarkPayrollEmployeePaid,
  upsertPayrollEmployeeOverrides,
  upsertPayrollPeriodSettings,
} from "@/lib/payroll-s3.server";

const clerkTokenSchema = z.object({
  clerkToken: z.string().min(1),
  emailHint: z.string().email().optional(),
});

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);

const reportInputSchema = clerkTokenSchema.extend({
  month: monthSchema,
  payCycleFilter: z.enum(["all", "india_15th", "pakistan_month_end"]).optional(),
  activeOnly: z.boolean().optional(),
});

const employeePatchSchema = clerkTokenSchema.extend({
  employeeId: z.string().min(1),
  startingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  lastSalaryRevisionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  nextSalaryReviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  startingBaseSalaryLocal: z.number().optional().nullable(),
  incrementLocal: z.number().optional().nullable(),
  benefitsLocal: z.number().optional().nullable(),
  reimbursementLocal: z.number().optional().nullable(),
  meetingCreditsHours: z.number().optional().nullable(),
  additionalCreditsHours: z.number().optional().nullable(),
  actor: z.string().email().optional().nullable(),
});

const periodPatchSchema = clerkTokenSchema.extend({
  month: monthSchema,
  usdToInrRate: z.number().positive().optional().nullable(),
  usdToPkrRate: z.number().positive().optional().nullable(),
  rateAsOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  actor: z.string().email().optional().nullable(),
});

const markPaidSchema = clerkTokenSchema.extend({
  employeeId: z.string().min(1),
  employeeName: z.string().optional(),
  payMonth: monthSchema,
  payCycle: z.enum(["india_15th", "pakistan_month_end"]),
  localCurrency: z.enum(["INR", "PKR"]),
  amountLocal: z.number(),
  amountUsd: z.number(),
  note: z.string().optional().nullable(),
  actor: z.string().email().optional().nullable(),
});

export const getPayrollReport = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => reportInputSchema.parse(data))
  .handler(async ({ data }) => {
    await requirePayrollAccess(data.clerkToken, data.emailHint);
    const { clerkToken: _token, ...reportArgs } = data;
    return buildPayrollReport(reportArgs);
  });

export const getPayrollAnalytics = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => reportInputSchema.parse(data))
  .handler(async ({ data }) => {
    await requirePayrollAccess(data.clerkToken, data.emailHint);
    const { clerkToken: _token, ...reportArgs } = data;
    const report = await buildPayrollReport(reportArgs);
    return buildPayrollAnalyticsReport(report.rows);
  });

export const updatePayrollEmployee = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => employeePatchSchema.parse(data))
  .handler(async ({ data }) => {
    await requirePayrollAccess(data.clerkToken, data.emailHint);
    const { employeeId, actor, clerkToken: _token, ...patch } = data;
    const saved = await upsertPayrollEmployeeOverrides(employeeId, patch, actor ?? null);
    return { employee: saved };
  });

export const updatePayrollPeriodFx = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => periodPatchSchema.parse(data))
  .handler(async ({ data }) => {
    await requirePayrollAccess(data.clerkToken, data.emailHint);
    const { month, actor, clerkToken: _token, ...patch } = data;
    const saved = await upsertPayrollPeriodSettings(month, patch, actor ?? null);
    return { period: saved };
  });

export const markPayrollPaid = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => markPaidSchema.parse(data))
  .handler(async ({ data }) => {
    await requirePayrollAccess(data.clerkToken, data.emailHint);
    const { clerkToken: _token, ...rest } = data;
    const paid = await markPayrollEmployeePaid({
      record: {
        employeeId: rest.employeeId,
        payMonth: rest.payMonth,
        payCycle: rest.payCycle,
        localCurrency: rest.localCurrency,
        paidAt: new Date().toISOString(),
        paidBy: rest.actor ?? null,
        amountLocal: rest.amountLocal,
        amountUsd: rest.amountUsd,
        note: rest.note ?? null,
      },
      employeeName: rest.employeeName,
      actor: rest.actor ?? null,
    });
    return { paid };
  });

export const unmarkPayrollPaid = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    markPaidSchema
      .pick({
        clerkToken: true,
        emailHint: true,
        employeeId: true,
        payMonth: true,
        payCycle: true,
        employeeName: true,
        actor: true,
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await requirePayrollAccess(data.clerkToken, data.emailHint);
    const result = await unmarkPayrollEmployeePaid({
      employeeId: data.employeeId,
      payMonth: data.payMonth,
      payCycle: data.payCycle,
      employeeName: data.employeeName,
      actor: data.actor ?? null,
    });
    return result;
  });

export const getPayrollMeta = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => clerkTokenSchema.parse(data))
  .handler(async ({ data }) => {
    await requirePayrollAccess(data.clerkToken, data.emailHint);
    const file = await ensurePayrollOnS3();
    return { bucket: file.bucket, key: file.key, logKey: file.logKey, updatedAt: file.updatedAt };
  });

export const getPayrollLog = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => clerkTokenSchema.parse(data))
  .handler(async ({ data }) => {
    await requirePayrollAccess(data.clerkToken, data.emailHint);
    const file = await ensurePayrollOnS3();
    const entries = await getPayrollOperationsLog(800);
    return { entries, bucket: file.bucket, logKey: file.logKey };
  });

export const backfillPayrollSnapshotsFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    clerkTokenSchema
      .extend({
        monthsBack: z.number().int().min(1).max(24).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await requirePayrollAccess(data.clerkToken, data.emailHint);
    const result = await backfillPayrollSnapshots(data.monthsBack ?? 12);
    const { logPayrollOperation } = await import("@/lib/payroll-s3.server");
    if (result.saved.length) {
      await logPayrollOperation("backfill_snapshots", {
        detailsJson: JSON.stringify(result),
      });
    }
    return result;
  });
