import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { PageHeader, TableScroll } from "@/components/AppShell";
import { MeetingHoursEmailDialog } from "@/components/MeetingHoursEmailDialog";
import { SuperAccessGate } from "@/components/SuperAccessGate";
import { FetchingBar, TableSkeleton } from "@/components/Skeleton";
import { getMeetingHoursReport } from "@/lib/meeting-hours-functions";
import {
  getMeetingHoursEmailInfo,
  previewMeetingHoursReportEmailFn,
  sendMeetingHoursReportEmail,
} from "@/lib/meeting-hours-email-functions";
import type { MeetingHoursEmailPreview } from "@/lib/meeting-hours-email.server";
import type { MeetingHoursReport, MeetingHoursEmployeeRow } from "@/lib/meeting-hours-report.server";
import { useSuperAccessAuth, useSuperAccessNavVisible } from "@/lib/super-access-rbac-hooks";
import { Bot, CalendarDays, Captions, DollarSign, Loader2, Mail, RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/alyson-notetaker/meeting-hours")({
  head: () => ({ meta: [{ title: "Meeting Hours — Alyson Notetaker" }] }),
  component: MeetingHoursRoute,
});

function MeetingHoursRoute() {
  return (
    <SuperAccessGate moduleLabel="Meeting Hours">
      <MeetingHoursPage />
    </SuperAccessGate>
  );
}

const PRESET_DAYS = [7, 30, 60] as const;
type PresetDays = (typeof PRESET_DAYS)[number];
type PeriodMode = "preset" | "lastMonth" | "last2Months" | "custom";

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

function rangeForLastDays(days: number) {
  const end = isoDay(new Date());
  const startDate = new Date();
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
  return { start: isoDay(startDate), end };
}

function lastCalendarMonthRange(monthsAgo = 1) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo + 1, 0));
  return { start: isoDay(start), end: isoDay(end) };
}

function lastTwoCalendarMonthsRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return { start: isoDay(start), end: isoDay(end) };
}

function daySpanInclusive(start: string, end: string) {
  return Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000) + 1;
}

function isIsoDate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function formatDayHeader(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatRangeLabel(start: string, end: string) {
  if (start === end) return formatDayHeader(start);
  return `${formatDayHeader(start)} – ${formatDayHeader(end)}`;
}

function formatHours(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "—";
  return n < 10 ? `${n.toFixed(1)}h` : `${Math.round(n * 10) / 10}h`;
}

const DAY_COL_CLASS = "border-r border-border/70";
const TOTAL_COL_CLASS = "border-l border-border";

type ViewMode = "daily" | "weekly";

type WeekBucket = {
  id: string;
  label: string;
  subLabel: string;
  days: string[];
};

type PeriodCellData = {
  key: string;
  hours: number;
  meetingCount: number;
};

/** Monday (UTC) of the ISO calendar week containing `day`. */
function mondayOfIsoDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0 = Sun
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + mondayOffset);
  return d.toISOString().slice(0, 10);
}

function clusterDaysIntoWeeks(days: string[]): WeekBucket[] {
  const groups = new Map<string, string[]>();
  for (const day of days) {
    const mon = mondayOfIsoDay(day);
    const arr = groups.get(mon) ?? [];
    arr.push(day);
    groups.set(mon, arr);
  }
  return [...groups.entries()].map(([mon, weekDays], i) => {
    const first = weekDays[0]!;
    const last = weekDays[weekDays.length - 1]!;
    return {
      id: mon,
      label: `Week ${i + 1}`,
      subLabel:
        first === last
          ? formatDayHeader(first)
          : `${formatDayHeader(first)}–${formatDayHeader(last)}`,
      days: weekDays,
    };
  });
}

function PeriodCell({
  hours,
  meetingCount,
  showCount,
}: {
  hours: number;
  meetingCount: number;
  showCount?: boolean;
}) {
  if (hours <= 0 && meetingCount <= 0) {
    return <span className="text-muted-foreground/50">—</span>;
  }
  return (
    <div className="leading-tight">
      <div className="font-medium tabular-nums">{formatHours(hours)}</div>
      {showCount && meetingCount > 0 ? (
        <div className="text-[10px] text-muted-foreground tabular-nums">{meetingCount} mtg</div>
      ) : null}
    </div>
  );
}

function matchesEmployeeSearch(row: MeetingHoursEmployeeRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return row.name.toLowerCase().includes(q) || row.email.toLowerCase().includes(q);
}

function EmployeeComparePicker({
  allEmployees,
  compareEmails,
  onCompareEmailsChange,
  searchQuery,
  onSearchQueryChange,
}: {
  allEmployees: MeetingHoursEmployeeRow[];
  compareEmails: string[];
  onCompareEmailsChange: (emails: string[]) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selectedSet = useMemo(
    () => new Set(compareEmails.map((email) => email.toLowerCase())),
    [compareEmails],
  );

  const selectedRows = useMemo(
    () =>
      compareEmails
        .map((email) => allEmployees.find((row) => row.email.toLowerCase() === email.toLowerCase()))
        .filter((row): row is MeetingHoursEmployeeRow => Boolean(row)),
    [allEmployees, compareEmails],
  );

  const suggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const pool = allEmployees.filter((row) => !selectedSet.has(row.email.toLowerCase()));
    if (!q) return pool.slice(0, 8);
    return pool
      .filter((row) => row.name.toLowerCase().includes(q) || row.email.toLowerCase().includes(q))
      .slice(0, 8);
  }, [allEmployees, searchQuery, selectedSet]);

  const addEmployee = (email: string) => {
    const key = email.toLowerCase();
    if (selectedSet.has(key)) return;
    onCompareEmailsChange([...compareEmails, email]);
    onSearchQueryChange("");
    setOpen(false);
  };

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div className="space-y-2" ref={wrapRef}>
      <div className="relative max-w-xl">
        <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => {
            onSearchQueryChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && suggestions[0]) {
              e.preventDefault();
              addEmployee(suggestions[0].email);
            }
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Search name or email — add multiple people to compare"
          className="w-full h-8 pl-8 pr-8 rounded-md border border-border bg-background text-[12px]"
          aria-label="Search employees to compare"
          aria-expanded={open && suggestions.length > 0}
          aria-controls="meeting-hours-compare-suggestions"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => {
              onSearchQueryChange("");
              setOpen(false);
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {open && suggestions.length > 0 ? (
          <div
            id="meeting-hours-compare-suggestions"
            className="absolute z-20 mt-1 w-full rounded-md border border-border bg-background shadow-lg max-h-52 overflow-y-auto"
          >
            {suggestions.map((row) => (
              <button
                key={row.email}
                type="button"
                onClick={() => addEmployee(row.email)}
                className="w-full px-3 py-2 text-left hover:bg-muted/60 border-b border-border/50 last:border-b-0"
              >
                <div className="text-[12px] font-medium truncate">{row.name}</div>
                <div className="text-[10px] text-muted-foreground truncate">{row.email}</div>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {selectedRows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">Comparing</span>
          {selectedRows.map((row) => (
            <span
              key={row.email}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 pl-2.5 pr-1 py-0.5 text-[11px] max-w-[220px]"
            >
              <span className="truncate" title={`${row.name} · ${row.email}`}>
                {row.name}
              </span>
              <button
                type="button"
                onClick={() =>
                  onCompareEmailsChange(
                    compareEmails.filter((email) => email.toLowerCase() !== row.email.toLowerCase()),
                  )
                }
                className="h-5 w-5 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
                aria-label={`Remove ${row.name} from compare`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => onCompareEmailsChange([])}
            className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Clear all
          </button>
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground">
          Type a name, pick from suggestions, and repeat to compare meeting hours side by side.
        </div>
      )}
    </div>
  );
}

function MeetingHoursContent({
  report,
  showingStaleRange,
  employees,
  allEmployees,
  compareEmails,
  onCompareEmailsChange,
  searchQuery,
  onSearchQueryChange,
  totalEmployeeCount,
}: {
  report: MeetingHoursReport;
  showingStaleRange: boolean;
  employees: MeetingHoursEmployeeRow[];
  allEmployees: MeetingHoursEmployeeRow[];
  compareEmails: string[];
  onCompareEmailsChange: (emails: string[]) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  totalEmployeeCount: number;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const days = report.days;
  const comparing = compareEmails.length > 0;
  const filterActive = comparing || searchQuery.trim().length > 0;

  const weeks = useMemo(() => clusterDaysIntoWeeks(days), [days]);

  const periodColumns = useMemo(() => {
    if (viewMode === "daily") {
      return days.map((day) => ({
        key: day,
        label: formatDayHeader(day),
        title: day,
        subLabel: null as string | null,
        dayKeys: [day],
      }));
    }
    return weeks.map((w) => ({
      key: w.id,
      label: w.label,
      title: `${w.label}: ${w.subLabel} (${w.days.length} day${w.days.length === 1 ? "" : "s"})`,
      subLabel: w.subLabel,
      dayKeys: w.days,
    }));
  }, [viewMode, days, weeks]);

  const employeePeriodCells = useMemo(() => {
    const byEmail = new Map<string, PeriodCellData[]>();
    for (const row of employees) {
      const dayMap = new Map(row.days.map((c) => [c.day, c]));
      byEmail.set(
        row.email,
        periodColumns.map((col) => {
          let hours = 0;
          let meetingCount = 0;
          for (const day of col.dayKeys) {
            const cell = dayMap.get(day);
            if (!cell) continue;
            hours += cell.hours;
            meetingCount += cell.meetingCount;
          }
          return {
            key: col.key,
            hours: Math.round(hours * 100) / 100,
            meetingCount,
          };
        }),
      );
    }
    return byEmail;
  }, [employees, periodColumns]);

  const displayTotals = useMemo(() => {
    if (!filterActive) return report.totals;
    const meetings = employees.reduce((s, r) => s + r.totalMeetings, 0);
    const hours = employees.reduce((s, r) => s + r.totalHours, 0);
    return {
      meetings,
      hours: Math.round(hours * 100) / 100,
      avgHoursPerEmployee:
        employees.length > 0 ? Math.round((hours / employees.length) * 100) / 100 : 0,
    };
  }, [employees, report.totals, filterActive]);

  return (
    <>
      <div
        className={`grid grid-cols-1 sm:grid-cols-3 gap-3 transition-opacity ${showingStaleRange ? "opacity-90" : ""}`}
      >
        <div className="surface-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Meetings</div>
          <div className="text-xl font-semibold tabular-nums mt-1">{displayTotals.meetings}</div>
          <div className="text-[11px] text-muted-foreground">
            {comparing
              ? `Comparing ${employees.length} people`
              : filterActive
                ? `For ${employees.length} filtered`
                : "With join URL in range"}
          </div>
        </div>
        <div className="surface-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total hours</div>
          <div className="text-xl font-semibold tabular-nums mt-1">{formatHours(displayTotals.hours)}</div>
          <div className="text-[11px] text-muted-foreground">Scheduled meeting time</div>
        </div>
        <div className="surface-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg / employee</div>
          <div className="text-xl font-semibold tabular-nums mt-1">
            {formatHours(displayTotals.avgHoursPerEmployee)}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Total hours ÷ {employees.length || totalEmployeeCount} people
          </div>
        </div>
      </div>

      <div className="relative min-h-[12rem] min-w-0">
        {showingStaleRange ? (
          <div
            className="absolute inset-0 z-10 rounded-lg bg-background/55 backdrop-blur-[1px] pointer-events-none flex items-start justify-center pt-10"
            aria-hidden
          >
            <span className="inline-flex items-center gap-2 text-[12px] text-muted-foreground bg-paper border border-border px-3 py-1.5 rounded-full shadow-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Updating meeting hours…
            </span>
          </div>
        ) : null}
        <div
          className={
            showingStaleRange
              ? "opacity-60 pointer-events-none select-none transition-opacity min-w-0"
              : "min-w-0"
          }
        >
          <div className="surface-card min-w-0">
            <div className="px-4 py-3 border-b border-border space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div>
                  <div className="text-[13px] font-medium">
                    {viewMode === "weekly" ? "Weekly meeting load" : "Daily meeting load"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {viewMode === "weekly"
                      ? "Cell = hours (and meeting count) per calendar week · Avg = total hours ÷ days in range"
                      : "Cell = hours that day · Avg = total hours ÷ days in range"}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <div
                    className="inline-flex items-center rounded-full border border-border bg-paper p-0.5"
                    role="group"
                    aria-label="Table granularity"
                  >
                    <button
                      type="button"
                      onClick={() => setViewMode("daily")}
                      className={
                        "h-7 px-3 rounded-full text-[11.5px] font-medium transition-colors " +
                        (viewMode === "daily"
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground")
                      }
                    >
                      Daily
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("weekly")}
                      className={
                        "h-7 px-3 rounded-full text-[11.5px] font-medium transition-colors " +
                        (viewMode === "weekly"
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground")
                      }
                    >
                      Weekly
                    </button>
                  </div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    {comparing
                      ? `Comparing ${employees.length} people`
                      : filterActive
                        ? `${employees.length} of ${totalEmployeeCount} employees`
                        : `${totalEmployeeCount} employees`}
                    {viewMode === "weekly" ? ` · ${weeks.length} weeks` : ""}
                  </div>
                </div>
              </div>
              <EmployeeComparePicker
                allEmployees={allEmployees}
                compareEmails={compareEmails}
                onCompareEmailsChange={onCompareEmailsChange}
                searchQuery={searchQuery}
                onSearchQueryChange={onSearchQueryChange}
              />
            </div>
            <TableScroll className="rounded-none border-0 shadow-none bg-transparent">
              <table className="w-full text-[11.5px] border-collapse min-w-max">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className={`sticky left-0 z-10 bg-muted/95 backdrop-blur px-3 py-2 text-left font-medium min-w-[180px] border-r border-border`}>
                      Employee
                    </th>
                    {periodColumns.map((col) => (
                      <th
                        key={col.key}
                        className={`px-2 py-2 text-center font-medium text-muted-foreground ${
                          viewMode === "weekly" ? "min-w-[88px]" : "min-w-[52px]"
                        } ${DAY_COL_CLASS}`}
                        title={col.title}
                      >
                        <div>{col.label}</div>
                        {col.subLabel ? (
                          <div className="text-[10px] font-normal text-muted-foreground/80 mt-0.5 whitespace-nowrap">
                            {col.subLabel}
                          </div>
                        ) : null}
                      </th>
                    ))}
                    <th className={`px-3 py-2 text-right font-medium min-w-[72px] ${TOTAL_COL_CLASS}`}>Total</th>
                    <th className="px-3 py-2 text-right font-medium min-w-[72px]">Avg/day</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.length === 0 ? (
                    <tr>
                      <td
                        colSpan={periodColumns.length + 3}
                        className="px-4 py-10 text-center text-[12px] text-muted-foreground"
                      >
                        {comparing
                          ? "Add people above to compare their meeting hours."
                          : `No employees match "${searchQuery.trim()}"`}
                      </td>
                    </tr>
                  ) : (
                    employees.map((row: MeetingHoursEmployeeRow) => (
                      <tr key={row.email} className="border-b border-border/60 hover:bg-muted/20">
                        <td className="sticky left-0 z-10 bg-background px-3 py-2 border-r border-border">
                          <div className="font-medium truncate max-w-[200px]" title={row.name}>
                            {row.name}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">{row.email}</div>
                        </td>
                        {(employeePeriodCells.get(row.email) ?? []).map((cell) => (
                          <td
                            key={cell.key}
                            className={`px-2 py-2 text-center align-top tabular-nums ${DAY_COL_CLASS}`}
                          >
                            <PeriodCell
                              hours={cell.hours}
                              meetingCount={cell.meetingCount}
                              showCount={viewMode === "weekly"}
                            />
                          </td>
                        ))}
                        <td className={`px-3 py-2 text-right align-top font-medium tabular-nums ${TOTAL_COL_CLASS}`}>
                          {formatHours(row.totalHours)}
                        </td>
                        <td className="px-3 py-2 text-right align-top font-medium tabular-nums">
                          {formatHours(row.avgHoursPerDay)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </TableScroll>
          </div>
        </div>
      </div>
    </>
  );
}

function MeetingHoursPage() {
  const canSendReport = useSuperAccessNavVisible();
  const getSuperAccessAuth = useSuperAccessAuth();
  const defaultRange = useMemo(() => rangeForLastDays(30), []);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("preset");
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailPreview, setEmailPreview] = useState<MeetingHoursEmailPreview | null>(null);
  const [periodDays, setPeriodDays] = useState<PresetDays>(30);
  const [customStart, setCustomStart] = useState(defaultRange.start);
  const [customEnd, setCustomEnd] = useState(defaultRange.end);
  const [compareEmails, setCompareEmails] = useState<string[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [applied, setApplied] = useState(() => ({
    ...defaultRange,
    periodMode: "preset" as PeriodMode,
    periodDays: 30 as PresetDays,
  }));

  const q = useQuery({
    queryKey: ["meeting-hours-report", applied.start, applied.end],
    queryFn: async () => {
      const auth = await getSuperAccessAuth();
      return getMeetingHoursReport({
        data: { ...auth, start: applied.start, end: applied.end },
      });
    },
    placeholderData: keepPreviousData,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const emailInfoQ = useQuery({
    queryKey: ["meeting-hours-email-info"],
    queryFn: async () => {
      const auth = await getSuperAccessAuth();
      return getMeetingHoursEmailInfo({ data: auth });
    },
    enabled: canSendReport,
    staleTime: 5 * 60_000,
  });

  const report = q.data?.report;
  const filteredEmployees = useMemo(() => {
    if (!report) return [];
    if (compareEmails.length > 0) {
      const order = new Map(compareEmails.map((email, index) => [email.toLowerCase(), index]));
      return report.employees
        .filter((row) => order.has(row.email.toLowerCase()))
        .sort(
          (a, b) =>
            (order.get(a.email.toLowerCase()) ?? 0) - (order.get(b.email.toLowerCase()) ?? 0),
        );
    }
    if (!employeeSearch.trim()) return report.employees;
    return report.employees.filter((row) => matchesEmployeeSearch(row, employeeSearch));
  }, [report, compareEmails, employeeSearch]);

  const coldLoad = q.isPending && !report;
  const isBusy = q.isFetching;
  const showingStaleRange = q.isPlaceholderData && isBusy;

  const lastToastKey = useRef<string | null>(null);
  useEffect(() => {
    if (!q.isSuccess || q.isPlaceholderData || !report) return;
    const key = `${applied.start}:${applied.end}`;
    if (lastToastKey.current === key) return;
    if (lastToastKey.current !== null) {
      toast.success("Meeting hours updated");
    }
    lastToastKey.current = key;
  }, [q.isSuccess, q.isPlaceholderData, report, applied.start, applied.end]);

  const applyFilters = () => {
    let next: { start: string; end: string };
    let mode = periodMode;
    let days = periodDays;

    if (periodMode === "custom") {
      if (!isIsoDate(customStart) || !isIsoDate(customEnd)) {
        toast.error("Enter valid start and end dates");
        return;
      }
      if (customStart > customEnd) {
        toast.error("Start date must be on or before end date");
        return;
      }
      next = { start: customStart, end: customEnd };
    } else if (periodMode === "lastMonth") {
      next = lastCalendarMonthRange(1);
    } else if (periodMode === "last2Months") {
      next = lastTwoCalendarMonthsRange();
    } else {
      next = rangeForLastDays(periodDays);
      mode = "preset";
    }

    if (daySpanInclusive(next.start, next.end) > 93) {
      toast.error("Maximum range is 93 days — narrow the period");
      return;
    }

    setApplied({ ...next, periodMode: mode, periodDays: days });
  };

  const emailPreviewM = useMutation({
    mutationFn: async () => {
      const auth = await getSuperAccessAuth();
      return previewMeetingHoursReportEmailFn({
        data: {
          ...auth,
          start: applied.start,
          end: applied.end,
          employeeCount: report?.employees.length ?? null,
        },
      });
    },
    onSuccess: (preview) => {
      setEmailPreview(preview);
      setEmailOpen(true);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not prepare email"),
  });

  const emailSendM = useMutation({
    mutationFn: async (args: {
      subject: string;
      recipients: Array<{ name: string; email: string }>;
    }) => {
      const auth = await getSuperAccessAuth();
      return sendMeetingHoursReportEmail({
        data: {
          ...auth,
          forceRefresh: true,
          start: applied.start,
          end: applied.end,
          subject: args.subject,
          recipients: args.recipients,
        },
      });
    },
    onSuccess: (result) => {
      toast.success(
        `Meeting hours email sent to ${result.recipients.length} recipient${result.recipients.length === 1 ? "" : "s"}`,
      );
      setEmailOpen(false);
      setEmailPreview(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to send meeting hours email"),
  });

  const statusBanner = (() => {
    if (coldLoad) {
      return {
        tone: "loading" as const,
        text: "Scanning Google Calendars for meeting hours — this can take 30–90 seconds for all employees.",
      };
    }
    if (showingStaleRange) {
      return {
        tone: "loading" as const,
        text: `Updating ${formatRangeLabel(applied.start, applied.end)} — previous table stays visible until ready.`,
      };
    }
    if (isBusy) {
      return { tone: "loading" as const, text: "Refreshing meeting hours…" };
    }
    if (q.isError && !report) {
      return {
        tone: "error" as const,
        text: q.error instanceof Error ? q.error.message : "Failed to load meeting hours",
      };
    }
    return null;
  })();

  return (
    <div className="ops-dense">
      <PageHeader
        eyebrow="Operations"
        title="Meeting hours"
        description={
          coldLoad
            ? "Connecting to Google Calendar…"
            : report
              ? `${formatRangeLabel(report.range.start, report.range.end)} · ${report.timeZone} · join-URL meetings only`
              : "Per-employee daily meeting count and hours from Google Calendar."
        }
        dense
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/alyson-notetaker/calendar"
              className="h-7 px-2.5 rounded-md border border-border bg-background text-[11.5px] font-medium inline-flex items-center gap-1.5"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Calendar
            </Link>
            <Link
              to="/alyson-notetaker/recall-calendar"
              className="h-7 px-2.5 rounded-md border border-border bg-background text-[11.5px] font-medium inline-flex items-center gap-1.5"
            >
              <Bot className="h-3.5 w-3.5" />
              Recall Calendar
            </Link>
            <Link
              to="/alyson-notetaker/cost-tracking"
              className="h-7 px-2.5 rounded-md border border-border bg-background text-[11.5px] font-medium inline-flex items-center gap-1.5"
            >
              <DollarSign className="h-3.5 w-3.5" />
              Cost tracking
            </Link>
            <Link
              to="/alyson-notetaker"
              reloadDocument
              className="h-7 px-2.5 rounded-md border border-border bg-background text-[11.5px] font-medium inline-flex items-center gap-1.5"
            >
              <Captions className="h-3.5 w-3.5" />
              Notetaker
            </Link>
          </div>
        }
      />

      <div className="app-page-gutter py-6 space-y-5 min-w-0">
        <div
          className={`surface-card p-4 space-y-3 transition-opacity ${isBusy ? "opacity-90" : ""}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Period</span>
            {PRESET_DAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setPeriodMode("preset");
                  setPeriodDays(d);
                }}
                disabled={isBusy && periodMode === "preset" && periodDays === d}
                className={
                  "h-7 px-3 rounded-full text-[11.5px] font-medium border transition-colors disabled:opacity-50 " +
                  (periodMode === "preset" && periodDays === d
                    ? "bg-foreground text-background border-foreground"
                    : "bg-paper border-border text-muted-foreground hover:text-foreground")
                }
              >
                Last {d} days
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPeriodMode("lastMonth")}
              disabled={isBusy && periodMode === "lastMonth"}
              className={
                "h-7 px-3 rounded-full text-[11.5px] font-medium border transition-colors disabled:opacity-50 " +
                (periodMode === "lastMonth"
                  ? "bg-foreground text-background border-foreground"
                  : "bg-paper border-border text-muted-foreground hover:text-foreground")
              }
            >
              Last month
            </button>
            <button
              type="button"
              onClick={() => setPeriodMode("last2Months")}
              disabled={isBusy && periodMode === "last2Months"}
              className={
                "h-7 px-3 rounded-full text-[11.5px] font-medium border transition-colors disabled:opacity-50 " +
                (periodMode === "last2Months"
                  ? "bg-foreground text-background border-foreground"
                  : "bg-paper border-border text-muted-foreground hover:text-foreground")
              }
            >
              Last 2 months
            </button>
            <button
              type="button"
              onClick={() => setPeriodMode("custom")}
              className={
                "h-7 px-3 rounded-full text-[11.5px] font-medium border transition-colors " +
                (periodMode === "custom"
                  ? "bg-foreground text-background border-foreground"
                  : "bg-paper border-border text-muted-foreground hover:text-foreground")
              }
            >
              Custom range
            </button>
          </div>

          {periodMode === "custom" ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-[11px] text-muted-foreground">
                Start
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="mt-1 block h-8 px-2 rounded-md border border-border bg-background text-[12px]"
                />
              </label>
              <label className="text-[11px] text-muted-foreground">
                End
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="mt-1 block h-8 px-2 rounded-md border border-border bg-background text-[12px]"
                />
              </label>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={applyFilters}
              disabled={isBusy}
              className="h-8 px-3 rounded-md bg-foreground text-background text-[12px] font-medium disabled:opacity-50"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => q.refetch()}
              disabled={isBusy}
              className="h-8 px-3 rounded-md border border-border text-[12px] inline-flex items-center gap-1.5 hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isBusy ? "animate-spin" : ""}`} />
              Refresh
            </button>
            {canSendReport ? (
              <button
                type="button"
                onClick={() => emailPreviewM.mutate()}
                disabled={
                  emailPreviewM.isPending ||
                  emailSendM.isPending ||
                  emailInfoQ.data?.sesConfigured === false
                }
                title={
                  emailInfoQ.data?.sesConfigured === false
                    ? "SES is not configured on the server"
                    : `Email ${formatRangeLabel(applied.start, applied.end)} to stakeholders`
                }
                className="h-8 px-3 rounded-md border border-border text-[12px] inline-flex items-center gap-1.5 hover:bg-muted disabled:opacity-50"
              >
                <Mail
                  className={`h-3.5 w-3.5 ${emailPreviewM.isPending || emailSendM.isPending ? "animate-pulse" : ""}`}
                />
                {emailPreviewM.isPending ? "Preparing…" : emailSendM.isPending ? "Sending…" : "Send report"}
              </button>
            ) : null}
            <span className="text-[11px] text-muted-foreground tabular-nums">
              Showing {applied.start} → {applied.end}
              {report?.timeZone ? ` · ${report.timeZone}` : ""}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            Pick a period, then Apply — the table stays visible and blurs while new meeting hours load.
          </div>
        </div>

        <FetchingBar active={isBusy && !coldLoad} />

        {statusBanner ? (
          <div
            className={
              "rounded-md border px-3 py-2.5 text-[12px] flex items-center gap-2 " +
              (statusBanner.tone === "error"
                ? "border-destructive/40 bg-destructive/5 text-destructive"
                : "border-border bg-muted/40 text-foreground")
            }
            role="status"
            aria-live="polite"
          >
            {statusBanner.tone === "loading" ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
            ) : null}
            <span>{statusBanner.text}</span>
            {statusBanner.tone === "error" ? (
              <button
                type="button"
                onClick={() => q.refetch()}
                className="ml-auto h-7 px-2.5 rounded-md bg-foreground text-background text-[11px] inline-flex items-center gap-1"
              >
                <RefreshCw className="h-3 w-3" /> Retry
              </button>
            ) : null}
          </div>
        ) : null}

        {report?.warnings?.length && !showingStaleRange ? (
          <div className="surface-card p-3 text-[12px] text-amber-800 dark:text-amber-200 bg-amber-500/10 border border-amber-500/20">
            {report.warnings.map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>
        ) : null}

        {coldLoad ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="surface-card p-3 space-y-2 animate-pulse">
                  <div className="h-3 w-20 rounded-md bg-muted/60" />
                  <div className="h-8 w-16 rounded-md bg-muted/60" />
                  <div className="h-2.5 w-28 rounded-md bg-muted/60" />
                </div>
              ))}
            </div>
            <TableSkeleton rows={10} />
          </>
        ) : null}

        {report && !coldLoad ? (
          <MeetingHoursContent
            report={report}
            showingStaleRange={showingStaleRange}
            employees={filteredEmployees}
            allEmployees={report.employees}
            compareEmails={compareEmails}
            onCompareEmailsChange={setCompareEmails}
            searchQuery={employeeSearch}
            onSearchQueryChange={setEmployeeSearch}
            totalEmployeeCount={report.employees.length}
          />
        ) : null}
      </div>

      <MeetingHoursEmailDialog
        open={emailOpen}
        preview={emailPreview}
        sending={emailSendM.isPending}
        onClose={() => {
          if (emailSendM.isPending) return;
          setEmailOpen(false);
          setEmailPreview(null);
        }}
        onSend={(args) => emailSendM.mutate(args)}
      />
    </div>
  );
}
