import { format } from "date-fns";
import type {
  AlysonBrainDashboardPayload,
  AlysonBrainEmployeeDashboard,
  AlysonBrainRange,
  AlysonBrainResolvedEmployee,
} from "@/lib/alyson-brain/alyson-brain-types";
import { loadEmployeePickerDirectory } from "@/lib/employee-picker-directory.server";
import {
  parseEmployeeNamesFromQuestion,
  parseRangeFromQuestion,
  resolveEmployeesFromNames,
} from "@/lib/alyson-brain/alyson-brain-parse.server";

function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

function normalizeName(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isoToDate(iso: string) {
  return format(new Date(iso), "yyyy-MM-dd");
}

function monthFromIso(iso: string) {
  return format(new Date(iso), "yyyy-MM");
}

function nameMatches(emp: AlysonBrainResolvedEmployee, ...candidates: Array<string | undefined>) {
  const targets = [normalizeName(emp.displayName), normalizeName(emp.queryName), normalizeEmail(emp.email)];
  for (const c of candidates) {
    const n = normalizeName(c || "");
    if (!n) continue;
    if (targets.some((t) => t === n || t.includes(n) || n.includes(t.split(" ")[0] || ""))) return true;
  }
  return false;
}

function findBonusLedger(
  employees: Record<string, { officialEmail: string; employeeId: string; employeeName: string }>,
  emp: AlysonBrainResolvedEmployee,
) {
  return Object.values(employees).find(
    (l) =>
      normalizeEmail(l.officialEmail) === normalizeEmail(emp.email) ||
      nameMatches(emp, l.employeeName) ||
      l.employeeId === emp.email,
  );
}

async function resolveQuery(question: string) {
  const warnings: string[] = [];
  const range = parseRangeFromQuestion(question);
  const nameQueries = parseEmployeeNamesFromQuestion(question);
  const directory = await loadEmployeePickerDirectory();
  if (directory.warnings?.length) warnings.push(...directory.warnings);

  const employees =
    nameQueries.length > 0 ? resolveEmployeesFromNames(nameQueries, directory.employees) : [];

  if (!employees.length) {
    warnings.push('No employee detected — try: "Report on Thirumalai for past 3 months".');
  }

  return { range, employees, warnings };
}

function emptyDashboard(emp: AlysonBrainResolvedEmployee): AlysonBrainEmployeeDashboard {
  return {
    employee: emp,
    scoring: null,
    workspace: null,
    timeDoctor: null,
    weeklyPacing: null,
    monthlyPacing: null,
    bonus: null,
    leave: null,
    meetings: null,
    tasks: null,
  };
}

/** Fast sources: scoring, workspace, time doctor, pacing, leave, bonus */
export async function buildAlysonBrainFastDashboard(question: string): Promise<AlysonBrainDashboardPayload> {
  const { range, employees, warnings } = await resolveQuery(question);
  const tdStart = isoToDate(range.startIso);
  const tdEnd = isoToDate(range.endIso);
  const month = monthFromIso(range.endIso);

  const [
    scoringData,
    workspaceData,
    tdData,
    weeklyData,
    monthlyData,
    bonusData,
    leaveData,
  ] = await Promise.allSettled([
    (async () => {
      const { getEmployeeScoring } = await import("@/lib/employee-scoring-functions");
      return getEmployeeScoring({ data: { start: range.startIso, end: range.endIso } });
    })(),
    (async () => {
      const { runGetWorkspaceActivity } = await import("@/lib/workspace-activity.server");
      return runGetWorkspaceActivity({ start: range.startIso, end: range.endIso, accurateMeetings: true });
    })(),
    (async () => {
      const { fetchTimeDoctorEmployeesTable } = await import("@/lib/time-doctor-functions");
      return fetchTimeDoctorEmployeesTable({ data: { start: tdStart, end: tdEnd } });
    })(),
    (async () => {
      const { buildWeeklyPacingReport } = await import("@/lib/time-doctor-pacing.server");
      return buildWeeklyPacingReport({ day: tdEnd });
    })(),
    (async () => {
      const { buildMonthlyPacingReport } = await import("@/lib/time-doctor-pacing.server");
      return buildMonthlyPacingReport({ month, day: tdEnd });
    })(),
    (async () => {
      const { ensureBonusOnS3 } = await import("@/lib/bonus-s3.server");
      return ensureBonusOnS3();
    })(),
    (async () => {
      const { ensureLeaveOnS3 } = await import("@/lib/leave-s3.server");
      return ensureLeaveOnS3();
    })(),
  ]);

  const scoring = scoringData.status === "fulfilled" ? scoringData.value : null;
  const workspace = workspaceData.status === "fulfilled" ? workspaceData.value : null;
  const td = tdData.status === "fulfilled" ? tdData.value : null;
  const weekly = weeklyData.status === "fulfilled" ? weeklyData.value : null;
  const monthly = monthlyData.status === "fulfilled" ? monthlyData.value : null;
  const bonusS3 = bonusData.status === "fulfilled" ? bonusData.value : null;
  const leaveS3 = leaveData.status === "fulfilled" ? leaveData.value : null;

  if (scoringData.status === "rejected") warnings.push(`Scoring: ${String(scoringData.reason)}`);
  if (workspaceData.status === "rejected") warnings.push(`Workspace: ${String(workspaceData.reason)}`);
  if (tdData.status === "rejected") warnings.push(`Time Doctor: ${String(tdData.reason)}`);

  const secToHours = (s: number) => Math.round((s / 3600) * 100) / 100;

  const dashboards: AlysonBrainEmployeeDashboard[] = employees.map((emp) => {
    if (!emp.email) {
      warnings.push(`Could not resolve "${emp.queryName}" in employee directory.`);
      return emptyDashboard(emp);
    }

    const email = normalizeEmail(emp.email);
    const scoreRow =
      scoring?.rows.find(
        (r) =>
          normalizeEmail(r.userEmail) === email ||
          r.linkedEmails?.some((le) => normalizeEmail(le) === email) ||
          nameMatches(emp, r.displayName),
      ) ?? null;

    const wsRow =
      workspace?.rows.find(
        (r) => normalizeEmail(r.userEmail) === email || nameMatches(emp, r.userEmail.split("@")[0]),
      ) ?? null;

    const tdRow =
      td?.employees.find(
        (e) => normalizeEmail(e.email) === email || nameMatches(emp, e.name),
      ) ?? null;

    const weeklyRow = weekly?.rows?.find((r) => normalizeEmail(r.email) === email) ?? null;
    const monthlyRow = monthly?.rows?.find((r) => normalizeEmail(r.email) === email) ?? null;

    const bonusLedger = bonusS3 ? findBonusLedger(bonusS3.employees, emp) : null;
    const leaveLedger = leaveS3
      ? Object.values(leaveS3.employees).find(
          (l) =>
            normalizeEmail(l.officialEmail) === email ||
            nameMatches(emp, l.employeeName) ||
            l.employeeId === emp.email,
        )
      : null;

    const bonusInRange =
      bonusLedger?.bonusEvents.filter((e) => e.paidOn >= tdStart && e.paidOn <= tdEnd) ?? [];
    const leaveInRange =
      leaveLedger?.leaveEvents.filter((e) => e.endDate >= tdStart && e.startDate <= tdEnd) ?? [];

    return {
      employee: emp,
      scoring: scoreRow
        ? {
            rank: scoreRow.rank,
            grade: scoreRow.grade,
            compositeScore: scoreRow.compositeScore,
            workHours: scoreRow.workHours,
            hoursPerDay: scoreRow.hoursPerDay,
            emailsSent: scoreRow.emailsSent,
            meetingsCreated: scoreRow.meetingsCreated,
            docsCreated: scoreRow.docsCreated,
            chatMessagesSent: scoreRow.chatMessagesSent,
            percentile: scoreRow.percentile,
          }
        : null,
      workspace: wsRow
        ? {
            emailsSent: wsRow.emailsSent,
            meetingsCreated: wsRow.meetingsCreated,
            docsCreated: wsRow.docsCreated,
            chatMessagesSent: wsRow.chatMessagesSent,
          }
        : null,
      timeDoctor: tdRow
        ? {
            name: tdRow.name,
            title: tdRow.title,
            rangeHours: secToHours(tdRow.rangeSeconds ?? 0),
            dailyHours: secToHours(tdRow.dailySeconds ?? 0),
            weeklyHours: secToHours(tdRow.weeklySeconds ?? 0),
            monthlyHours: secToHours(tdRow.monthlySeconds ?? 0),
          }
        : null,
      weeklyPacing: weeklyRow
        ? {
            hoursWorked: weeklyRow.hoursWorked,
            hoursExpected: weeklyRow.hoursExpected,
            paceDelta: weeklyRow.paceDelta,
            projectedPace: weeklyRow.projectedPace,
            leaveDays: weeklyRow.leaveDays,
            status: weeklyRow.status,
            metTarget: weeklyRow.metTarget,
            requiredHoursPerDay: weeklyRow.requiredHoursPerDay,
          }
        : null,
      monthlyPacing: monthlyRow
        ? {
            hoursWorked: monthlyRow.hoursWorked,
            hoursExpected: monthlyRow.hoursExpected,
            paceDelta: monthlyRow.paceDelta,
            projectedPace: monthlyRow.projectedPace,
            leaveDays: monthlyRow.leaveDays,
            status: monthlyRow.status,
            metTarget: monthlyRow.metTarget,
          }
        : null,
      bonus: bonusLedger
        ? {
            employeeName: bonusLedger.employeeName,
            team: bonusLedger.team,
            jobTitle: bonusLedger.jobTitle,
            bonusPaidUsd: bonusInRange.reduce((s, e) => s + e.amountUsd, 0),
            totalBonusAllTime: bonusLedger.bonusEvents.reduce((s, e) => s + e.amountUsd, 0),
            bonusEventCount: bonusInRange.length,
          }
        : null,
      leave: leaveLedger
        ? {
            employeeName: leaveLedger.employeeName,
            team: leaveLedger.team,
            daysTakenInRange: leaveInRange.reduce((s, e) => s + e.days, 0),
            leaveEventCount: leaveInRange.length,
          }
        : null,
      meetings: null,
      tasks: null,
    };
  });

  return {
    range,
    employees: dashboards,
    warnings,
    generatedAt: new Date().toISOString(),
  };
}

/** Slow sources: meeting analytics + task extraction */
export async function buildAlysonBrainSlowSlice(args: {
  question: string;
  email: string;
}): Promise<Pick<AlysonBrainEmployeeDashboard, "meetings" | "tasks">> {
  const { range, employees } = await resolveQuery(args.question);
  const emp = employees.find((e) => normalizeEmail(e.email) === normalizeEmail(args.email));
  if (!emp?.email) return { meetings: null, tasks: null };

  const tdStart = isoToDate(range.startIso);
  const tdEnd = isoToDate(range.endIso);
  const email = normalizeEmail(emp.email);

  const [meetingsR, tasksR] = await Promise.allSettled([
    (async () => {
      const { buildNotetakerAnalyticsReport } = await import("@/lib/notetaker-analytics.server");
      const report = await buildNotetakerAnalyticsReport({
        start: tdStart,
        end: tdEnd,
        speakerFilters: [emp.displayName, emp.queryName, emp.email.split("@")[0] || ""],
        maxMeetings: 25,
      });
      const first = normalizeName(emp.displayName).split(" ")[0] || "";
      const speaker =
        report.topSpeakers.find((s) => normalizeName(s.speaker).includes(first)) ??
        report.topSpeakers.find((s) => speakerMatchesLoose(s.speaker, emp)) ??
        null;
      return {
        meetingsAttended: report.meetingCount,
        analyzedMeetings: report.analyzedCount,
        totalUtterances: speaker?.utterances ?? 0,
        totalWords: speaker?.words ?? 0,
        meetingsSpoken: speaker?.meetingsSpoken ?? 0,
        topMeetings: report.meetings.slice(0, 6).map((m) => ({
          title: m.title,
          day: m.day,
          utterances: m.totalUtterances,
        })),
      };
    })(),
    (async () => {
      const { buildNotetakerTasksReport } = await import("@/lib/notetaker-tasks.server");
      const report = await buildNotetakerTasksReport({
        start: tdStart,
        end: tdEnd,
        assigneeEmail: email,
        assigneeName: emp.displayName,
        maxMeetings: 10,
      });
      const rollup = report.users.find((u) => normalizeEmail(u.assigneeEmail) === email) ?? report.users[0];
      const tasks = rollup?.tasks ?? [];
      return {
        taskCount: report.totalTasks,
        openCount: rollup?.openCount ?? 0,
        meetingsAnalyzed: report.analyzedMeetings,
        tasks: tasks.slice(0, 12).map((t) => ({
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueHint: t.dueHint,
          meetingTitle: t.meetingTitle,
        })),
      };
    })(),
  ]);

  return {
    meetings: meetingsR.status === "fulfilled" ? meetingsR.value : null,
    tasks: tasksR.status === "fulfilled" ? tasksR.value : null,
  };
}

function speakerMatchesLoose(speaker: string, emp: AlysonBrainResolvedEmployee) {
  const s = normalizeName(speaker);
  const n = normalizeName(emp.displayName);
  const q = normalizeName(emp.queryName);
  return s.includes(q) || n.includes(s) || s.includes(n.split(" ")[0] || "");
}

export async function buildAlysonBrainContextJson(question: string): Promise<string> {
  const fast = await buildAlysonBrainFastDashboard(question);
  const enriched = await Promise.all(
    fast.employees.map(async (e) => {
      if (!e.employee.email) return e;
      const slow = await buildAlysonBrainSlowSlice({ question, email: e.employee.email });
      return { ...e, ...slow };
    }),
  );
  return JSON.stringify({ ...fast, employees: enriched }, null, 2);
}
