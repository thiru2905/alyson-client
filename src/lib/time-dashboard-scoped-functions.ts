import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { timeDashboardScopedAuthSchema } from "@/lib/time-dashboard-access.schema";
import { requireTimeDashboardScope } from "@/lib/time-dashboard-access.server";
import {
  assertUserDetailAllowed,
  filterEmployeesTableForScope,
  filterMonthlyPacingReportForScope,
  filterUnderHoursReportForScope,
  filterWeeklyPacingReportForScope,
} from "@/lib/time-dashboard-scope-filter.server";

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const MonthSchema = z.string().regex(/^\d{4}-\d{2}$/);

const EmployeesTableScopedInput = timeDashboardScopedAuthSchema.extend({
  day: DateSchema.optional(),
  start: DateSchema.optional(),
  end: DateSchema.optional(),
});

const WeeklyPacingScopedInput = timeDashboardScopedAuthSchema.extend({
  targetHours: z.number().min(1).max(168).optional(),
  day: DateSchema.optional(),
});

const MonthlyPacingScopedInput = timeDashboardScopedAuthSchema
  .extend({
    month: MonthSchema.optional(),
    day: DateSchema.optional(),
    start: DateSchema.optional(),
    end: DateSchema.optional(),
  })
  .refine((d) => !(d.start && !d.end) && !(d.end && !d.start), {
    message: "Custom range requires both start and end dates",
  });

const UserDetailScopedInput = timeDashboardScopedAuthSchema.extend({
  userId: z.string().min(1),
  start: DateSchema.optional(),
  end: DateSchema.optional(),
  tab: z.enum(["overview", "attendance", "apps", "work"]).optional(),
});

const MonthlyUnderHoursScopedInput = timeDashboardScopedAuthSchema.extend({
  month: MonthSchema,
  thresholdHours: z.number().min(1).max(168).optional(),
});

const WeeklyTrendScopedInput = timeDashboardScopedAuthSchema.extend({
  weekCount: z.number().min(4).max(26).optional(),
  targetHours: z.number().min(1).max(168).optional(),
  location: z.string().optional(),
  team: z.string().optional(),
  active: z.string().optional(),
});

export const fetchWeeklyHoursTrendScoped = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => WeeklyTrendScopedInput.parse(data))
  .handler(async ({ data }) => {
    const { clerkToken, emailHint, ...query } = data;
    const scope = await requireTimeDashboardScope(clerkToken, emailHint);
    const { buildWeeklyHoursTrendReport } = await import("@/lib/time-doctor-pacing.server");
    const report = await buildWeeklyHoursTrendReport({
      ...query,
      managerEmail: scope.level === "team" ? scope.email : undefined,
    });
    return report;
  });

export const fetchTimeDoctorEmployeesTableScoped = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => EmployeesTableScopedInput.parse(data))
  .handler(async ({ data }) => {
    const { clerkToken, emailHint, ...query } = data;
    const scope = await requireTimeDashboardScope(clerkToken, emailHint);
    const { fetchTimeDoctorEmployeesTable } = await import("@/lib/time-doctor-functions");
    const report = await fetchTimeDoctorEmployeesTable({ data: query });
    return filterEmployeesTableForScope(report, scope);
  });

export const fetchWeeklyPacingReportScoped = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => WeeklyPacingScopedInput.parse(data))
  .handler(async ({ data }) => {
    const { clerkToken, emailHint, ...query } = data;
    const scope = await requireTimeDashboardScope(clerkToken, emailHint);
    const { fetchWeeklyPacingReport } = await import("@/lib/time-doctor-pacing-functions");
    const report = await fetchWeeklyPacingReport({ data: query });
    return filterWeeklyPacingReportForScope(report, scope);
  });

export const fetchMonthlyPacingReportScoped = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => MonthlyPacingScopedInput.parse(data))
  .handler(async ({ data }) => {
    const { clerkToken, emailHint, ...query } = data;
    const scope = await requireTimeDashboardScope(clerkToken, emailHint);
    const { fetchMonthlyPacingReport } = await import("@/lib/time-doctor-pacing-functions");
    const report = await fetchMonthlyPacingReport({ data: query });
    return filterMonthlyPacingReportForScope(report, scope);
  });

export const fetchTimeDoctorUserDetailScoped = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => UserDetailScopedInput.parse(data))
  .handler(async ({ data }) => {
    const { clerkToken, emailHint, ...query } = data;
    const scope = await requireTimeDashboardScope(clerkToken, emailHint);
    const { fetchTimeDoctorUserDetail } = await import("@/lib/time-doctor-functions");
    const detail = await fetchTimeDoctorUserDetail({ data: query });
    assertUserDetailAllowed(detail.user.email, scope);
    return detail;
  });

export const fetchTimeDoctorMonthlyUnderHoursReportScoped = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => MonthlyUnderHoursScopedInput.parse(data))
  .handler(async ({ data }) => {
    const { clerkToken, emailHint, ...query } = data;
    const scope = await requireTimeDashboardScope(clerkToken, emailHint);
    const { fetchTimeDoctorMonthlyUnderHoursReport } = await import("@/lib/time-doctor-functions");
    const report = await fetchTimeDoctorMonthlyUnderHoursReport({ data: query });
    return filterUnderHoursReportForScope(report, scope);
  });

export const setWeeklyPacingActiveOverrideScoped = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    timeDashboardScopedAuthSchema
      .extend({
        employeeId: z.string().min(1),
        email: z.string(),
        name: z.string(),
        active: z.boolean(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { clerkToken, emailHint, employeeId, email, name, active } = data;
    const scope = await requireTimeDashboardScope(clerkToken, emailHint);
    assertUserDetailAllowed(email, scope);
    const { setWeeklyPacingActiveOverride } = await import("@/lib/time-doctor-pacing-functions");
    return setWeeklyPacingActiveOverride({ data: { employeeId, email, name, active } });
  });
