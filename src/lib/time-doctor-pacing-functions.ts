import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const MonthSchema = z.string().regex(/^\d{4}-\d{2}$/);

const MonthlyPacingInput = z
  .object({
    month: MonthSchema.optional(),
    day: DateSchema.optional(),
    start: DateSchema.optional(),
    end: DateSchema.optional(),
  })
  .refine((d) => !(d.start && !d.end) && !(d.end && !d.start), {
    message: "Custom range requires both start and end dates",
  })
  .refine((d) => !d.start || !d.end || d.start <= d.end, {
    message: "Start date must be on or before end date",
  });

const WeeklyPacingInput = z.object({
  targetHours: z.number().min(1).max(168).optional(),
  day: DateSchema.optional(),
});

const WeeklyTrendInput = z.object({
  weekCount: z.number().min(4).max(26).optional(),
  targetHours: z.number().min(1).max(168).optional(),
  location: z.string().optional(),
  team: z.string().optional(),
  active: z.string().optional(),
});

const PacingRowSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  title: z.string(),
  location: z.string().nullable(),
  team: z.string().nullable(),
  managerName: z.string().nullable(),
  managerEmail: z.string().nullable(),
  hoursWorkedLogged: z.number(),
  leaveDays: z.number(),
  leaveDaysPersonal: z.number(),
  leaveDaysTeam: z.number(),
  leaveHoursCredit: z.number(),
  hoursWorked: z.number(),
  avgDailyPace: z.number(),
  hoursRemaining: z.number(),
  hoursOver: z.number(),
  projectedPace: z.number(),
  hoursExpected: z.number(),
  paceDelta: z.number(),
  remainingWorkDays: z.number(),
  requiredHoursPerDay: z.number(),
  weekProgressPct: z.number(),
  metTarget: z.boolean(),
  active: z.boolean(),
  computedActive: z.boolean().optional(),
  activeOverridden: z.boolean().optional(),
  status: z.enum(["target_met", "on_track", "behind", "at_risk", "critical"]),
});

const SetWeeklyPacingActiveInput = z.object({
  employeeId: z.string().min(1),
  email: z.string(),
  name: z.string(),
  active: z.boolean(),
});

const WeeklyPacingInsightsInput = z.object({
  report: z.object({
    company: z.object({ id: z.string(), name: z.string() }),
    targetHours: z.number(),
    timeZone: z.string(),
    timeZoneLabel: z.string(),
    today: z.string(),
    week: z.object({ start: z.string(), end: z.string() }),
    pacingSampleDays: z.array(z.string()),
    elapsedWorkDays: z.number(),
    totalWorkDays: z.number(),
    remainingWorkDays: z.number(),
    generatedAt: z.string(),
    warnings: z.array(z.string()),
    rows: z.array(PacingRowSchema).optional(),
  }),
  summary: z.object({
    metTarget: z.number(),
    underTarget: z.number(),
    critical: z.number(),
    atRisk: z.number(),
    behind: z.number(),
  }),
  filterSummary: z.string().nullable(),
  rows: z.array(PacingRowSchema),
  trend: z
    .object({
      targetHours: z.number(),
      priorAverageHours: z.number(),
      liftHours: z.number(),
      liftPct: z.number(),
      latestWeek: z
        .object({
          weekStart: z.string(),
          weekEnd: z.string(),
          weekLabel: z.string(),
          avgHoursWorked: z.number(),
          employeeCount: z.number(),
          isCurrentWeek: z.boolean().optional(),
        })
        .nullable(),
      points: z
        .array(
          z.object({
            weekStart: z.string(),
            weekEnd: z.string(),
            weekLabel: z.string(),
            avgHoursWorked: z.number(),
            employeeCount: z.number(),
            isCurrentWeek: z.boolean().optional(),
          }),
        )
        .optional(),
    })
    .nullable()
    .optional(),
});

export const fetchWeeklyPacingReport = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => WeeklyPacingInput.parse(data ?? {}))
  .handler(async ({ data }) => {
    const { buildWeeklyPacingReport } = await import("@/lib/time-doctor-pacing.server");
    return buildWeeklyPacingReport(data);
  });

export const fetchMonthlyPacingReport = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => MonthlyPacingInput.parse(data ?? {}))
  .handler(async ({ data }) => {
    const { buildMonthlyPacingReport } = await import("@/lib/time-doctor-pacing.server");
    return buildMonthlyPacingReport(data);
  });

export const fetchWeeklyHoursTrend = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => WeeklyTrendInput.parse(data ?? {}))
  .handler(async ({ data }) => {
    const { buildWeeklyHoursTrendReport } = await import("@/lib/time-doctor-pacing.server");
    return buildWeeklyHoursTrendReport(data);
  });

export const getWeeklyPacingInsights = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => WeeklyPacingInsightsInput.parse(data))
  .handler(async ({ data }) => {
    const { generateWeeklyPacingInsights } = await import("@/lib/weekly-pacing-insights.server");
    return generateWeeklyPacingInsights(data as Parameters<typeof generateWeeklyPacingInsights>[0]);
  });

/** Persist Active Yes/No override to S3 (survives redeploys; used on every future report). */
export const setWeeklyPacingActiveOverride = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SetWeeklyPacingActiveInput.parse(data))
  .handler(async ({ data }) => {
    const { upsertWeeklyPacingActiveOverride } = await import("@/lib/weekly-pacing-active-s3.server");
    const entry = await upsertWeeklyPacingActiveOverride(data);
    return { entry };
  });
