import type { EmployeeLeaveLedger, LeaveRecordEvent } from "@/lib/leave-schema";

export type LeaveRecordFact = {
  eventId: string;
  employeeId: string;
  employeeName: string;
  team: string;
  location: string;
  jobTitle: string;
  active: boolean;
  leaveType: LeaveRecordEvent["leaveType"];
  startDate: string;
  endDate: string;
  days: number;
  note?: string;
  createdAt: string;
};

export type LeaveAnalyticsReport = {
  generatedAt: string;
  ledgerUpdatedAt: string | null;
  year: number;
  summary: {
    totalDays: number;
    leaveCount: number;
    activeEmployees: number;
    employeesWithLeave: number;
    employeesWithoutLeave: number;
    participationPct: number;
    teamCount: number;
    avgDaysPerLeave: number;
  };
  byTeam: Array<{
    team: string;
    activeEmployees: number;
    withLeave: number;
    withoutLeave: number;
    participationPct: number;
    totalDays: number;
    leaveCount: number;
  }>;
  byLocation: Array<{ location: string; totalDays: number; leaveCount: number; employees: number }>;
  byMonth: Array<{ key: string; label: string; totalDays: number; count: number }>;
  byLeaveType: Array<{ leaveType: string; totalDays: number; count: number }>;
  employeeBreakdown: Array<{
    employeeId: string;
    name: string;
    team: string;
    location: string;
    tookLeave: boolean;
    totalDays: number;
    leaveCount: number;
  }>;
  recentLeave: LeaveRecordFact[];
  allLeave: LeaveRecordFact[];
};

function normLabel(v: string, fallback: string): string {
  const t = v.trim();
  return t || fallback;
}

function monthKey(day: string): string {
  return day.slice(0, 7);
}

function monthLabel(key: string): string {
  const d = new Date(`${key}-01T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function flattenLeaveRecords(ledgers: EmployeeLeaveLedger[], year?: number): LeaveRecordFact[] {
  const out: LeaveRecordFact[] = [];
  for (const ledger of ledgers) {
    for (const e of ledger.leaveEvents) {
      if (year != null && !e.startDate.startsWith(String(year))) continue;
      out.push({
        eventId: e.id,
        employeeId: ledger.employeeId,
        employeeName: ledger.employeeName,
        team: normLabel(ledger.team, "Unassigned"),
        location: normLabel(ledger.location, "Unknown"),
        jobTitle: ledger.jobTitle,
        active: ledger.active,
        leaveType: e.leaveType,
        startDate: e.startDate,
        endDate: e.endDate,
        days: e.days,
        note: e.note,
        createdAt: e.createdAt,
      });
    }
  }
  return out.sort((a, b) => b.startDate.localeCompare(a.startDate) || b.createdAt.localeCompare(a.createdAt));
}

export function buildLeaveAnalyticsReport(
  ledgers: EmployeeLeaveLedger[],
  ledgerUpdatedAt: string | null,
  year = new Date().getFullYear(),
): LeaveAnalyticsReport {
  const activeLedgers = ledgers.filter((l) => l.active);
  const allLeave = flattenLeaveRecords(ledgers, year);
  const totalDays = allLeave.reduce((s, p) => s + p.days, 0);
  const leaveCount = allLeave.length;
  const employeesWithLeaveSet = new Set(allLeave.map((p) => p.employeeId));
  const employeesWithLeave = activeLedgers.filter((l) => employeesWithLeaveSet.has(l.employeeId)).length;
  const activeEmployees = activeLedgers.length;
  const employeesWithoutLeave = Math.max(0, activeEmployees - employeesWithLeave);

  const teamRoster = new Map<string, EmployeeLeaveLedger[]>();
  for (const l of activeLedgers) {
    const team = normLabel(l.team, "Unassigned");
    const list = teamRoster.get(team) ?? [];
    list.push(l);
    teamRoster.set(team, list);
  }

  const teamLeaveStats = new Map<string, { totalDays: number; leaveCount: number; withLeave: Set<string> }>();
  for (const p of allLeave) {
    const stat = teamLeaveStats.get(p.team) ?? { totalDays: 0, leaveCount: 0, withLeave: new Set<string>() };
    stat.totalDays += p.days;
    stat.leaveCount += 1;
    stat.withLeave.add(p.employeeId);
    teamLeaveStats.set(p.team, stat);
  }

  const byTeam = [...teamRoster.entries()]
    .map(([team, roster]) => {
      const stat = teamLeaveStats.get(team) ?? { totalDays: 0, leaveCount: 0, withLeave: new Set<string>() };
      const withLeave = stat.withLeave.size;
      const activeCount = roster.length;
      return {
        team,
        activeEmployees: activeCount,
        withLeave,
        withoutLeave: Math.max(0, activeCount - withLeave),
        participationPct: activeCount ? Math.round((withLeave / activeCount) * 100) : 0,
        totalDays: stat.totalDays,
        leaveCount: stat.leaveCount,
      };
    })
    .sort((a, b) => b.totalDays - a.totalDays);

  const locationMap = new Map<string, { totalDays: number; leaveCount: number; employees: Set<string> }>();
  const monthMap = new Map<string, { totalDays: number; count: number }>();
  const typeMap = new Map<string, { totalDays: number; count: number }>();

  for (const p of allLeave) {
    const loc = locationMap.get(p.location) ?? { totalDays: 0, leaveCount: 0, employees: new Set<string>() };
    loc.totalDays += p.days;
    loc.leaveCount += 1;
    loc.employees.add(p.employeeId);
    locationMap.set(p.location, loc);

    const mk = monthKey(p.startDate);
    const mo = monthMap.get(mk) ?? { totalDays: 0, count: 0 };
    mo.totalDays += p.days;
    mo.count += 1;
    monthMap.set(mk, mo);

    const ty = typeMap.get(p.leaveType) ?? { totalDays: 0, count: 0 };
    ty.totalDays += p.days;
    ty.count += 1;
    typeMap.set(p.leaveType, ty);
  }

  const byLocation = [...locationMap.entries()]
    .map(([location, v]) => ({
      location,
      totalDays: v.totalDays,
      leaveCount: v.leaveCount,
      employees: v.employees.size,
    }))
    .sort((a, b) => b.totalDays - a.totalDays);

  const byMonth = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({ key, label: monthLabel(key), totalDays: v.totalDays, count: v.count }));

  const byLeaveType = [...typeMap.entries()]
    .map(([leaveType, v]) => ({ leaveType, totalDays: v.totalDays, count: v.count }))
    .sort((a, b) => b.totalDays - a.totalDays);

  const employeeBreakdown = activeLedgers
    .map((l) => {
      const events = l.leaveEvents.filter((e) => e.startDate.startsWith(String(year)));
      const days = events.reduce((s, e) => s + e.days, 0);
      return {
        employeeId: l.employeeId,
        name: l.employeeName,
        team: normLabel(l.team, "Unassigned"),
        location: normLabel(l.location, "Unknown"),
        tookLeave: events.length > 0,
        totalDays: days,
        leaveCount: events.length,
      };
    })
    .sort((a, b) => b.totalDays - a.totalDays || a.name.localeCompare(b.name));

  return {
    generatedAt: new Date().toISOString(),
    ledgerUpdatedAt,
    year,
    summary: {
      totalDays,
      leaveCount,
      activeEmployees,
      employeesWithLeave,
      employeesWithoutLeave,
      participationPct: activeEmployees ? Math.round((employeesWithLeave / activeEmployees) * 100) : 0,
      teamCount: teamRoster.size,
      avgDaysPerLeave: leaveCount ? totalDays / leaveCount : 0,
    },
    byTeam,
    byLocation,
    byMonth,
    byLeaveType,
    employeeBreakdown,
    recentLeave: allLeave.slice(0, 25),
    allLeave,
  };
}

export function filterLeaveAnalytics(
  report: LeaveAnalyticsReport,
  filters: { team?: string; location?: string; tookLeave?: "all" | "yes" | "no" },
): LeaveAnalyticsReport {
  let leave = report.allLeave;
  if (filters.team && filters.team !== "__all__") {
    leave = leave.filter((p) => p.team === filters.team);
  }
  if (filters.location && filters.location !== "__all__") {
    leave = leave.filter((p) => p.location === filters.location);
  }

  const fakeLedgers: EmployeeLeaveLedger[] = [];
  const byEmployee = new Map<string, EmployeeLeaveLedger>();
  for (const p of leave) {
    let ledger = byEmployee.get(p.employeeId);
    if (!ledger) {
      ledger = {
        employeeId: p.employeeId,
        employeeName: p.employeeName,
        officialEmail: "",
        jobTitle: p.jobTitle,
        team: p.team,
        location: p.location,
        active: p.active,
        leaveEvents: [],
        updatedAt: p.createdAt,
      };
      byEmployee.set(p.employeeId, ledger);
      fakeLedgers.push(ledger);
    }
    ledger.leaveEvents.push({
      id: p.eventId,
      leaveType: p.leaveType,
      startDate: p.startDate,
      endDate: p.endDate,
      days: p.days,
      note: p.note,
      createdAt: p.createdAt,
    });
  }

  const rebuilt = buildLeaveAnalyticsReport(fakeLedgers, report.ledgerUpdatedAt, report.year);
  if (filters.tookLeave === "yes") {
    rebuilt.employeeBreakdown = rebuilt.employeeBreakdown.filter((e) => e.tookLeave);
  } else if (filters.tookLeave === "no") {
    rebuilt.employeeBreakdown = rebuilt.employeeBreakdown.filter((e) => !e.tookLeave);
  }
  return rebuilt;
}
