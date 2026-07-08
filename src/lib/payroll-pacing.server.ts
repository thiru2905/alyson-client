import {
  loadPacingLeaveContext,
  resolveDailyLeaveHoursForPacingSample,
  resolveLeaveBreakdownForPacingEmployee,
} from "@/lib/weekly-pacing-leave.server";
import { canonicalOfficialEmail, emailLookupKeys } from "@/lib/cintara-email";
import { getOrgChartRosterLookup } from "@/lib/org-chart-roster.server";
import { attachManagerToPacingRow } from "@/lib/org-chart-roster";
import { getCintaraActiveMemberLookup } from "@/lib/cintara-active-members.server";
import {
  loadWeeklyPacingActiveOverridesForReport,
  resolvePacingActiveWithOverrides,
} from "@/lib/weekly-pacing-active.server";
import {
  timeDoctorPacingGetCompany,
  timeDoctorPacingListUsers,
  timeDoctorPacingLoadRangeSeconds,
} from "@/lib/time-doctor-functions";
import {
  countWeekdaysInclusive,
  enumerateDaysIso,
  isWeekdayIso,
  PACING_LEAVE_HOURS_PER_DAY,
  type WeeklyPacingRow,
} from "@/lib/weekly-pacing";
import { buildMonthlyPacingRow } from "@/lib/monthly-pacing";
import { resolvePayPeriodRollupDay, type PayPeriod } from "@/lib/payroll-period";

export type PayPeriodPacingReport = {
  periodStart: string;
  periodEnd: string;
  rollupDay: string;
  targetHours: number;
  totalWorkDays: number;
  elapsedWorkDays: number;
  remainingWorkDays: number;
  rows: WeeklyPacingRow[];
  warnings: string[];
};

function periodSampleDays(periodStart: string, rollupDay: string, periodEnd: string): string[] {
  const sampleEnd = rollupDay <= periodEnd ? rollupDay : periodEnd;
  if (sampleEnd < periodStart) return [];
  return enumerateDaysIso(periodStart, sampleEnd).filter(isWeekdayIso);
}

export async function buildPayPeriodPacingReport(period: PayPeriod): Promise<PayPeriodPacingReport> {
  const rollupDay = resolvePayPeriodRollupDay(period);
  const warnings: string[] = [];
  const company = await timeDoctorPacingGetCompany();
  const rangeCache = new Map<string, Map<string, number>>();

  const sampleDays = periodSampleDays(period.periodStart, rollupDay, period.periodEnd);
  const totalWorkDays = countWeekdaysInclusive(period.periodStart, period.periodEnd);
  const elapsedWorkDays = countWeekdaysInclusive(period.periodStart, rollupDay);
  const tomorrow = rollupDay < period.periodEnd ? enumerateDaysIso(rollupDay, period.periodEnd).find((d) => d > rollupDay) : null;
  const remainingWorkDays =
    rollupDay >= period.periodEnd ? 0 : countWeekdaysInclusive(tomorrow ?? rollupDay, period.periodEnd);
  const targetHours = totalWorkDays * PACING_LEAVE_HOURS_PER_DAY;

  let periodSeconds = new Map<string, number>();
  try {
    periodSeconds = await timeDoctorPacingLoadRangeSeconds(
      company.id,
      period.periodStart,
      rollupDay,
      rangeCache,
    );
  } catch (e) {
    warnings.push(`period-worklogs: ${String(e)}`);
  }

  await Promise.all(
    sampleDays.map(async (day) => {
      try {
        await timeDoctorPacingLoadRangeSeconds(company.id, day, day, rangeCache);
      } catch (e) {
        warnings.push(`daily-worklogs-${day}: ${String(e)}`);
      }
    }),
  );

  let users: Awaited<ReturnType<typeof timeDoctorPacingListUsers>> = [];
  try {
    users = await timeDoctorPacingListUsers(company.id);
  } catch (e) {
    warnings.push(`users: ${String(e)}`);
  }

  const rosterLookup = getOrgChartRosterLookup();
  const activeLookup = getCintaraActiveMemberLookup();
  const activeOverrides = await loadWeeklyPacingActiveOverridesForReport();

  let leaveCtx: Awaited<ReturnType<typeof loadPacingLeaveContext>> = {
    lookup: { byEmployeeId: new Map(), byEmail: new Map() },
    teamLeaves: [],
    employees: {},
    rangeStart: period.periodStart,
    rangeEnd: period.periodEnd,
  };
  try {
    leaveCtx = await loadPacingLeaveContext(period.periodStart, period.periodEnd);
  } catch (e) {
    warnings.push(`leave-ledger: ${String(e)}`);
  }

  const metrics = {
    targetHours,
    monthEnd: period.periodEnd,
    pacingSampleDays: sampleDays,
    elapsedWorkDays,
    totalWorkDays,
    remainingWorkDays,
    monthProgressPct: totalWorkDays > 0 ? Math.round((elapsedWorkDays / totalWorkDays) * 1000) / 10 : 0,
  };

  const rows = users
    .map((u) => {
      const email = (u.email || "").trim();
      const name = (u.name || u.email || "").trim();
      const meta = attachManagerToPacingRow({ email, name }, rosterLookup);
      const { active } = resolvePacingActiveWithOverrides(
        activeOverrides,
        activeLookup,
        rosterLookup,
        { employeeId: u.id, email, name },
      );
      const leaveArgs = {
        employeeId: u.id,
        email,
        team: meta.team,
        location: meta.location,
      };
      const leave = resolveLeaveBreakdownForPacingEmployee(leaveCtx, active, leaveArgs);
      const dailyLeaveHours = resolveDailyLeaveHoursForPacingSample(
        leaveCtx,
        active,
        leaveArgs,
        sampleDays,
      );
      const daySeconds = sampleDays.map((day) => {
        const cacheKey = `${company.id}:${day}:${day}`;
        return rangeCache.get(cacheKey)?.get(u.id) ?? 0;
      });
      const row = buildMonthlyPacingRow({
        id: u.id,
        email,
        name,
        title: u.title ?? "",
        periodSeconds: periodSeconds.get(u.id) ?? 0,
        dailyHours: daySeconds.map((s) => Math.round((s / 3600) * 100) / 100),
        metrics,
        rollupDay,
        leaveDays: leave.leaveDays,
        leaveDaysPersonal: leave.leaveDaysPersonal,
        leaveDaysTeam: leave.leaveDaysTeam,
      });
      if (!row) return null;
      return {
        ...row,
        location: meta.location,
        team: meta.team,
        managerName: meta.managerName,
        managerEmail: meta.managerEmail,
        active,
      };
    })
    .filter((r): r is WeeklyPacingRow => Boolean(r));

  return {
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    rollupDay,
    targetHours,
    totalWorkDays,
    elapsedWorkDays,
    remainingWorkDays,
    rows,
    warnings: warnings.slice(0, 8),
  };
}

export type PacingRowLookup = {
  byEmail: Map<string, WeeklyPacingRow>;
  byName: Map<string, WeeklyPacingRow>;
};

function normPersonName(name: string): string {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Index TD pacing rows by canonical/legacy emails and display name (same rules as Weekly Pacing). */
export function buildPacingRowLookup(rows: WeeklyPacingRow[]): PacingRowLookup {
  const byEmail = new Map<string, WeeklyPacingRow>();
  const byName = new Map<string, WeeklyPacingRow>();

  for (const row of rows) {
    for (const key of emailLookupKeys(row.email)) {
      if (key.includes("@")) byEmail.set(key.toLowerCase(), row);
    }
    const nn = normPersonName(row.name);
    if (nn) byName.set(nn, row);
  }

  return { byEmail, byName };
}

export function lookupPacingRow(
  lookup: PacingRowLookup,
  args: { email: string; name?: string },
): WeeklyPacingRow | undefined {
  const email = canonicalOfficialEmail(args.email);
  for (const key of emailLookupKeys(email || args.email)) {
    if (!key.includes("@")) continue;
    const hit = lookup.byEmail.get(key.toLowerCase());
    if (hit) return hit;
  }

  const nn = normPersonName(args.name ?? "");
  if (nn) return lookup.byName.get(nn);

  return undefined;
}

/** @deprecated Prefer buildPacingRowLookup + lookupPacingRow for roster joins. */
export function pacingByEmail(rows: WeeklyPacingRow[]): Map<string, WeeklyPacingRow> {
  return buildPacingRowLookup(rows).byEmail;
}

export function isLowActivity(pacing: WeeklyPacingRow | undefined, active: boolean): boolean {
  if (!active) return true;
  if (!pacing) return false;
  if (!pacing.active) return true;
  return pacing.status === "at_risk" || pacing.status === "critical" || pacing.status === "behind";
}

export { PACING_LEAVE_HOURS_PER_DAY };
