import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { buildPayrollAnalyticsReport } from "@/lib/payroll-analytics";
import { buildPayrollReport } from "@/lib/payroll-report.server";
import {
  ensurePayrollOnS3,
  getPayrollOperationsLog,
  markPayrollEmployeePaid,
  unmarkPayrollEmployeePaid,
  upsertPayrollEmployeeOverrides,
  upsertPayrollPeriodSettings,
} from "@/lib/payroll-s3.server";

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);

const reportInputSchema = z.object({
  month: monthSchema,
  payCycleFilter: z.enum(["all", "india_15th", "pakistan_month_end"]).optional(),
  activeOnly: z.boolean().optional(),
});

const employeePatchSchema = z.object({
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
});

const periodPatchSchema = z.object({
  month: monthSchema,
  usdToInrRate: z.number().positive().optional().nullable(),
  usdToPkrRate: z.number().positive().optional().nullable(),
  rateAsOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

const markPaidSchema = z.object({
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

const actorSchema = z.object({
  actor: z.string().email().optional().nullable(),
});

export const getPayrollReport = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => reportInputSchema.parse(data ?? {}))
  .handler(async ({ data }) => buildPayrollReport(data));

export const getPayrollAnalytics = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => reportInputSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const report = await buildPayrollReport(data);
    return buildPayrollAnalyticsReport(report.rows);
  });

export const updatePayrollEmployee = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    employeePatchSchema.extend({ actor: z.string().email().optional().nullable() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { employeeId, actor, ...patch } = data;
    const saved = await upsertPayrollEmployeeOverrides(employeeId, patch, actor ?? null);
    return { employee: saved };
  });

export const updatePayrollPeriodFx = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    periodPatchSchema.extend({ actor: z.string().email().optional().nullable() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { month, actor, ...patch } = data;
    const saved = await upsertPayrollPeriodSettings(month, patch, actor ?? null);
    return { period: saved };
  });

export const markPayrollPaid = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => markPaidSchema.parse(data))
  .handler(async ({ data }) => {
    const paid = await markPayrollEmployeePaid({
      record: {
        employeeId: data.employeeId,
        payMonth: data.payMonth,
        payCycle: data.payCycle,
        localCurrency: data.localCurrency,
        paidAt: new Date().toISOString(),
        paidBy: data.actor ?? null,
        amountLocal: data.amountLocal,
        amountUsd: data.amountUsd,
        note: data.note ?? null,
      },
      employeeName: data.employeeName,
      actor: data.actor ?? null,
    });
    return { paid };
  });

export const unmarkPayrollPaid = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    markPaidSchema
      .pick({ employeeId: true, payMonth: true, payCycle: true, employeeName: true, actor: true })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const result = await unmarkPayrollEmployeePaid({
      employeeId: data.employeeId,
      payMonth: data.payMonth,
      payCycle: data.payCycle,
      employeeName: data.employeeName,
      actor: data.actor ?? null,
    });
    return result;
  });

export const getPayrollMeta = createServerFn({ method: "GET" }).handler(async () => {
  const file = await ensurePayrollOnS3();
  return { bucket: file.bucket, key: file.key, logKey: file.logKey, updatedAt: file.updatedAt };
});

export const getPayrollLog = createServerFn({ method: "GET" }).handler(async () => {
  const file = await ensurePayrollOnS3();
  const entries = await getPayrollOperationsLog(800);
  return { entries, bucket: file.bucket, logKey: file.logKey };
});
