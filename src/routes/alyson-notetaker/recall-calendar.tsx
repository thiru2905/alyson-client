import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { addMonths, endOfMonth, startOfMonth } from "date-fns";
import {
  AlertTriangle,
  Bot,
  CalendarDays,
  Captions,
  CheckCircle2,
  Clock,
  DoorOpen,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { PageHeader, TableScroll } from "@/components/AppShell";
import { FetchingBar } from "@/components/Skeleton";
import { getBotJoinReport } from "@/lib/notetaker-bot-join-functions";
import {
  DEFAULT_BOT_JOIN_REPORT_EMAIL,
  type BotJoinReport,
  type BotJoinReportRow,
  type MissedMeetingDetail,
} from "@/lib/notetaker-bot-join-report.types";

export const Route = createFileRoute("/alyson-notetaker/recall-calendar")({
  head: () => ({ meta: [{ title: "Recall Calendar — Alyson Notetaker" }] }),
  component: RecallCalendarPage,
});

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const WEEKDAYS_SHORT = ["M", "T", "W", "T", "F", "S", "S"] as const;

type ViewMode = "daily" | "weekly" | "notetaker";
type DayStatus = "joined" | "partial" | "missed" | "empty";
type AttendanceMark = "Present" | "Late" | "Waiting" | "Absent";

type DayEvent =
  | { kind: "joined"; row: BotJoinReportRow }
  | { kind: "missed"; row: MissedMeetingDetail };

type WeekBucket = {
  id: string;
  label: string;
  subLabel: string;
  days: string[];
  joined: number;
  missed: number;
  events: DayEvent[];
};

type AttendanceRow = {
  key: string;
  day: string;
  startAt: string | null;
  title: string;
  mark: AttendanceMark;
  detail: string;
  waitingRoom?: string | null;
  lateLabel?: string | null;
};

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

function monthLabel(d: Date) {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function weekdayIndexMondayFirst(dayIso: string) {
  const dow = new Date(`${dayIso}T12:00:00Z`).getUTCDay();
  return dow === 0 ? 6 : dow - 1;
}

function weekdayName(dayIso: string, short = false) {
  const d = new Date(`${dayIso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", {
    weekday: short ? "short" : "long",
    timeZone: "UTC",
  });
}

function formatDayHeader(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function dayFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function mondayOfIsoDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  const dow = d.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + mondayOffset);
  return d.toISOString().slice(0, 10);
}

function buildCalendarCells(month: Date): (string | null)[] {
  const s = startOfMonth(month);
  const e = endOfMonth(month);
  const firstIso = isoDay(s);
  const lead = weekdayIndexMondayFirst(firstIso);
  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = new Date(s); d <= e; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1))) {
    cells.push(isoDay(d));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function eventsByDay(report: BotJoinReport | undefined): Map<string, DayEvent[]> {
  const map = new Map<string, DayEvent[]>();
  if (!report) return map;

  const push = (day: string | null, event: DayEvent) => {
    if (!day) return;
    const arr = map.get(day) ?? [];
    arr.push(event);
    map.set(day, arr);
  };

  for (const row of report.joinedMeetings) {
    push(dayFromIso(row.meetingStartAt || row.scheduledStart || row.botJoinAt), { kind: "joined", row });
  }
  for (const row of report.missedMeetings) {
    push(dayFromIso(row.startTime), { kind: "missed", row });
  }

  for (const [day, events] of map) {
    events.sort((a, b) => {
      const aIso = a.kind === "joined" ? a.row.meetingStartAt || a.row.scheduledStart || "" : a.row.startTime;
      const bIso = b.kind === "joined" ? b.row.meetingStartAt || b.row.scheduledStart || "" : b.row.startTime;
      return aIso.localeCompare(bIso);
    });
    map.set(day, events);
  }
  return map;
}

function dayStatus(events: DayEvent[]): DayStatus {
  if (!events.length) return "empty";
  const joined = events.filter((e) => e.kind === "joined").length;
  const missed = events.length - joined;
  if (joined > 0 && missed === 0) return "joined";
  if (joined === 0 && missed > 0) return "missed";
  return "partial";
}

function statusTone(status: DayStatus) {
  if (status === "joined") return "border-emerald-500/40 bg-emerald-500/10";
  if (status === "missed") return "border-destructive/35 bg-destructive/10";
  if (status === "partial") return "border-amber-500/40 bg-amber-500/10";
  return "border-border";
}

function StatusDot({ status }: { status: DayStatus }) {
  if (status === "empty") return null;
  const cls =
    status === "joined" ? "bg-emerald-500" : status === "missed" ? "bg-destructive" : "bg-amber-500";
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${cls}`} aria-hidden />;
}

function clusterWeeks(byDay: Map<string, DayEvent[]>, monthDays: string[]): WeekBucket[] {
  const groups = new Map<string, string[]>();
  for (const day of monthDays) {
    const mon = mondayOfIsoDay(day);
    const arr = groups.get(mon) ?? [];
    arr.push(day);
    groups.set(mon, arr);
  }

  return [...groups.entries()].map(([mon, days], i) => {
    const events: DayEvent[] = [];
    let joined = 0;
    let missed = 0;
    for (const day of days) {
      for (const e of byDay.get(day) ?? []) {
        events.push(e);
        if (e.kind === "joined") joined += 1;
        else missed += 1;
      }
    }
    const first = days[0]!;
    const last = days[days.length - 1]!;
    return {
      id: mon,
      label: `Week ${i + 1}`,
      subLabel: first === last ? formatDayHeader(first) : `${formatDayHeader(first)}–${formatDayHeader(last)}`,
      days,
      joined,
      missed,
      events,
    };
  });
}

function attendanceMarkForJoined(row: BotJoinReportRow): AttendanceMark {
  if (row.stuckInWaitingRoom) return "Waiting";
  if ((row.lateMinutes ?? 0) > 2) return "Late";
  return "Present";
}

function attendanceMarkForMissed(row: MissedMeetingDetail): AttendanceMark {
  if (row.waitingRoomLabel || /waiting/i.test(row.outcomeLabel)) return "Waiting";
  return "Absent";
}

function buildAttendanceRows(byDay: Map<string, DayEvent[]>): AttendanceRow[] {
  const rows: AttendanceRow[] = [];
  const days = [...byDay.keys()].sort();
  for (const day of days) {
    for (const event of byDay.get(day) ?? []) {
      if (event.kind === "joined") {
        const row = event.row;
        const mark = attendanceMarkForJoined(row);
        rows.push({
          key: `j-${row.botId}-${day}`,
          day,
          startAt: row.meetingStartAt || row.scheduledStart || null,
          title: row.title || "Untitled meeting",
          mark,
          detail: row.finalStatus || "Joined meeting",
          waitingRoom: row.waitingRoomLabel,
          lateLabel: row.lateToStartLabel,
        });
      } else {
        const row = event.row;
        rows.push({
          key: `m-${row.googleEventId}-${day}`,
          day,
          startAt: row.startTime,
          title: row.title || "Untitled meeting",
          mark: attendanceMarkForMissed(row),
          detail: row.outcomeLabel,
          waitingRoom: row.waitingRoomLabel,
        });
      }
    }
  }
  return rows;
}

function MarkBadge({ mark }: { mark: AttendanceMark }) {
  const cls =
    mark === "Present"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
      : mark === "Late"
        ? "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30"
        : mark === "Waiting"
          ? "bg-sky-500/15 text-sky-800 dark:text-sky-300 border-sky-500/30"
          : "bg-destructive/10 text-destructive border-destructive/30";
  return (
    <span className={`inline-flex h-6 items-center px-2 rounded-md border text-[11px] font-medium ${cls}`}>
      {mark}
    </span>
  );
}

function ViewModeToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  const options: Array<{ key: ViewMode; label: string }> = [
    { key: "daily", label: "Daily" },
    { key: "weekly", label: "Weekly" },
    { key: "notetaker", label: "Notetaker" },
  ];
  return (
    <div
      className="inline-flex items-center rounded-full border border-border bg-paper p-0.5"
      role="group"
      aria-label="Recall calendar view"
    >
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          className={
            "h-7 px-3 rounded-full text-[11.5px] font-medium transition-colors " +
            (value === opt.key
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground")
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function RecallCalendarPage() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const [picked, setPicked] = useState<string | null>(null);
  const [pickedWeekId, setPickedWeekId] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const range = useMemo(() => {
    const s = startOfMonth(month);
    const e = endOfMonth(month);
    return { start: isoDay(s), end: isoDay(e) };
  }, [month]);

  const q = useQuery({
    queryKey: ["recall-calendar", range.start, range.end, DEFAULT_BOT_JOIN_REPORT_EMAIL],
    queryFn: async () => {
      const r = await getBotJoinReport({
        data: {
          start: range.start,
          end: range.end,
          calendarEmail: DEFAULT_BOT_JOIN_REPORT_EMAIL,
        },
      });
      return r.report as BotJoinReport;
    },
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const report = q.data;
  const byDay = useMemo(() => eventsByDay(report), [report]);
  const calendarCells = useMemo(() => buildCalendarCells(month), [month]);
  const monthDays = useMemo(
    () => calendarCells.filter((d): d is string => Boolean(d)),
    [calendarCells],
  );
  const weeks = useMemo(() => clusterWeeks(byDay, monthDays), [byDay, monthDays]);
  const attendanceRows = useMemo(() => buildAttendanceRows(byDay), [byDay]);
  const pickedEvents = picked ? byDay.get(picked) ?? [] : [];
  const pickedWeek = weeks.find((w) => w.id === pickedWeekId) ?? null;
  const coldLoad = q.isLoading && !report;
  const isBusy = q.isFetching;

  const monthSummary = useMemo(() => {
    let joined = 0;
    let missed = 0;
    for (const events of byDay.values()) {
      for (const e of events) {
        if (e.kind === "joined") joined += 1;
        else missed += 1;
      }
    }
    const total = joined + missed;
    return {
      joined,
      missed,
      total,
      joinRate: total > 0 ? Math.round((joined / total) * 1000) / 10 : null,
    };
  }, [byDay]);

  const attendanceSummary = useMemo(() => {
    const counts: Record<AttendanceMark, number> = {
      Present: 0,
      Late: 0,
      Waiting: 0,
      Absent: 0,
    };
    for (const row of attendanceRows) counts[row.mark] += 1;
    return counts;
  }, [attendanceRows]);

  useEffect(() => {
    if (!picked && !pickedWeekId) return;
    const t = window.setTimeout(() => {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [picked, pickedWeekId]);

  const setMode = (mode: ViewMode) => {
    setViewMode(mode);
    setPicked(null);
    setPickedWeekId(null);
  };

  return (
    <div className="ops-dense min-w-0">
      <PageHeader
        eyebrow="Operations"
        title="Recall Calendar"
        description={`Alyson Notetaker attendance for ${DEFAULT_BOT_JOIN_REPORT_EMAIL} — daily grid, weekly clusters, or full attendance register.`}
        dense
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to="/alyson-notetaker/bot-join-report"
              className="h-7 px-2.5 rounded-md border border-border bg-background text-[11.5px] font-medium inline-flex items-center gap-1.5"
            >
              <Bot className="h-3.5 w-3.5" />
              Bot Join Report
            </Link>
            <Link
              to="/alyson-notetaker/calendar"
              className="h-7 px-2.5 rounded-md border border-border bg-background text-[11.5px] font-medium inline-flex items-center gap-1.5"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Meeting Calendar
            </Link>
            <Link
              to="/alyson-notetaker/unified-meetings"
              className="h-7 px-2.5 rounded-md border border-border bg-background text-[11.5px] font-medium inline-flex items-center gap-1.5"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Unified Meetings
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

      <div className="app-page-gutter py-4 space-y-4 min-w-0">
        <div className="surface-card p-2.5 sm:p-3 flex flex-wrap items-center gap-2">
          <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <div className="text-[13px] font-medium">{monthLabel(month)}</div>
          <div className="text-[11px] text-muted-foreground">
            {coldLoad
              ? "Loading…"
              : `${monthSummary.total} meeting${monthSummary.total === 1 ? "" : "s"} · ${monthSummary.joined} joined · ${monthSummary.missed} missed`}
            {monthSummary.joinRate != null ? ` · ${monthSummary.joinRate}% join` : ""}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <ViewModeToggle value={viewMode} onChange={setMode} />
            <button
              type="button"
              onClick={() => void q.refetch()}
              disabled={isBusy}
              className="h-7 px-2.5 rounded-md border border-border text-[11px] hover:bg-muted inline-flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${isBusy ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => {
                setMonth((m) => addMonths(m, -1));
                setPicked(null);
                setPickedWeekId(null);
              }}
              className="h-7 px-2.5 rounded-md border border-border text-[11px] hover:bg-muted"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => {
                setMonth(startOfMonth(new Date()));
                setPicked(null);
                setPickedWeekId(null);
              }}
              className="h-7 px-2.5 rounded-md border border-border text-[11px] hover:bg-muted"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                setMonth((m) => addMonths(m, 1));
                setPicked(null);
                setPickedWeekId(null);
              }}
              className="h-7 px-2.5 rounded-md border border-border text-[11px] hover:bg-muted"
            >
              Next
            </button>
          </div>
        </div>

        <FetchingBar active={isBusy && !coldLoad} />

        {q.isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-[12px] text-destructive">
            {q.error instanceof Error ? q.error.message : "Failed to load Recall calendar."}
          </div>
        ) : null}

        {!report?.calendarAvailable && report?.calendarError ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-900 dark:text-amber-200">
            Calendar baseline unavailable: {report.calendarError}. Showing bot join rows only.
          </div>
        ) : null}

        {viewMode === "daily" ? (
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> All joined
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> Mixed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-destructive" /> Missed
            </span>
          </div>
        ) : null}

        {viewMode === "notetaker" ? (
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span>Attendance marks for Alyson Notetaker:</span>
            <span>Present {attendanceSummary.Present}</span>
            <span>· Late {attendanceSummary.Late}</span>
            <span>· Waiting {attendanceSummary.Waiting}</span>
            <span>· Absent {attendanceSummary.Absent}</span>
          </div>
        ) : null}

        {coldLoad ? (
          <div className="surface-card p-10 flex items-center justify-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading Recall attendance for {monthLabel(month)}…
          </div>
        ) : viewMode === "daily" ? (
          <div className="surface-card p-2 sm:p-3 space-y-2 min-w-0">
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((label, i) => (
                <div
                  key={label}
                  className="text-center text-[9px] sm:text-[10px] uppercase tracking-wide font-medium text-muted-foreground py-1 px-0.5 rounded bg-muted/40 border border-border/60"
                  title={label}
                >
                  <span className="hidden sm:inline">{label}</span>
                  <span className="sm:hidden">{WEEKDAYS_SHORT[i]}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {calendarCells.map((d, idx) => {
                if (!d) {
                  return (
                    <div
                      key={`pad-${idx}`}
                      className="min-h-[64px] sm:min-h-[72px] rounded border border-transparent"
                      aria-hidden
                    />
                  );
                }
                const events = byDay.get(d) ?? [];
                const status = dayStatus(events);
                const joined = events.filter((e) => e.kind === "joined").length;
                const missed = events.length - joined;
                const active = picked === d;
                const isToday = d === isoDay(new Date());

                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setPickedWeekId(null);
                      setPicked(d);
                    }}
                    aria-pressed={active}
                    aria-label={`${weekdayName(d)} ${d}: ${joined} joined, ${missed} missed`}
                    className={
                      "text-left transition-all relative flex flex-col rounded border p-1.5 sm:p-2 min-h-[64px] sm:min-h-[72px] hover:shadow-sm " +
                      statusTone(status) +
                      (active ? " ring-2 ring-offset-1 ring-offset-background ring-foreground z-[1]" : "") +
                      (isToday ? " border-foreground/50" : "")
                    }
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] sm:text-[12px] font-medium tabular-nums">{d.slice(8)}</span>
                      <StatusDot status={status} />
                    </div>
                    <div className="text-[9px] text-muted-foreground mt-0.5 truncate">{weekdayName(d, true)}</div>
                    {events.length > 0 ? (
                      <div className="mt-auto pt-1 text-[10px] tabular-nums text-muted-foreground leading-tight">
                        {joined > 0 ? <div className="text-emerald-700 dark:text-emerald-400">{joined} joined</div> : null}
                        {missed > 0 ? <div className="text-destructive/90">{missed} missed</div> : null}
                      </div>
                    ) : (
                      <div className="mt-auto pt-1 text-[10px] text-muted-foreground/40">—</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : viewMode === "weekly" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {weeks.map((week) => {
              const total = week.joined + week.missed;
              const rate = total > 0 ? Math.round((week.joined / total) * 1000) / 10 : null;
              const active = pickedWeekId === week.id;
              const tone =
                total === 0
                  ? "border-border"
                  : week.missed === 0
                    ? "border-emerald-500/35 bg-emerald-500/5"
                    : week.joined === 0
                      ? "border-destructive/30 bg-destructive/5"
                      : "border-amber-500/35 bg-amber-500/5";
              return (
                <button
                  key={week.id}
                  type="button"
                  onClick={() => {
                    setPicked(null);
                    setPickedWeekId(week.id);
                  }}
                  className={
                    "surface-card text-left p-4 border transition-all hover:shadow-sm " +
                    tone +
                    (active ? " ring-2 ring-offset-1 ring-offset-background ring-foreground" : "")
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[14px] font-medium">{week.label}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{week.subLabel}</div>
                    </div>
                    {rate != null ? (
                      <div className="text-[12px] font-medium tabular-nums">{rate}%</div>
                    ) : (
                      <div className="text-[11px] text-muted-foreground">—</div>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                    <div>
                      <div className="text-muted-foreground">Meetings</div>
                      <div className="font-medium tabular-nums mt-0.5">{total}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Joined</div>
                      <div className="font-medium tabular-nums mt-0.5 text-emerald-700 dark:text-emerald-400">
                        {week.joined}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Missed</div>
                      <div className="font-medium tabular-nums mt-0.5 text-destructive">{week.missed}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="surface-card p-3 flex flex-wrap items-center gap-2 text-[12px]">
              <Captions className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Notetaker attendance register</span>
              <span className="text-muted-foreground">
                Alyson Notetaker is marked Present / Late / Waiting / Absent for each eligible meeting.
              </span>
            </div>
            <TableScroll>
              <table className="ops-table w-full min-w-[720px]">
                <thead>
                  <tr>
                    <th align="left">When</th>
                    <th align="left">Meeting</th>
                    <th align="left">Attendee</th>
                    <th align="left">Mark</th>
                    <th align="left">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-[12px] text-muted-foreground">
                        No meetings in this month for attendance.
                      </td>
                    </tr>
                  ) : (
                    attendanceRows.map((row) => (
                      <tr key={row.key} className="align-top">
                        <td className="text-[12px] whitespace-nowrap">
                          <div className="font-medium">{formatDayHeader(row.day)}</div>
                          <div className="text-[11px] text-muted-foreground">{formatTime(row.startAt)}</div>
                        </td>
                        <td className="text-[13px] font-medium max-w-[18rem]">
                          <div className="line-clamp-2" title={row.title}>
                            {row.title}
                          </div>
                        </td>
                        <td className="text-[12px] text-muted-foreground">
                          <div className="inline-flex items-center gap-1.5">
                            <Bot className="h-3.5 w-3.5" />
                            Alyson Notetaker
                          </div>
                        </td>
                        <td>
                          <MarkBadge mark={row.mark} />
                        </td>
                        <td className="text-[12px] text-muted-foreground max-w-[20rem]">
                          <div className="line-clamp-3">{row.detail}</div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[11px]">
                            {row.waitingRoom ? (
                              <span className="inline-flex items-center gap-1">
                                <DoorOpen className="h-3 w-3" />
                                {row.waitingRoom}
                              </span>
                            ) : null}
                            {row.lateLabel ? (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {row.lateLabel}
                              </span>
                            ) : null}
                            {row.mark === "Absent" ? (
                              <span className="inline-flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Missed join
                              </span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </TableScroll>
          </div>
        )}

        {viewMode === "daily" && picked ? (
          <div ref={detailRef} id="recall-calendar-day-detail" className="surface-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  Day attendance
                </div>
                <h2 className="text-[15px] font-medium mt-0.5">
                  {weekdayName(picked)} · {picked}
                </h2>
                <p className="text-[12px] text-muted-foreground mt-1">
                  {pickedEvents.length === 0
                    ? "No eligible meetings with bot join activity this day."
                    : `${pickedEvents.filter((e) => e.kind === "joined").length} joined · ${
                        pickedEvents.filter((e) => e.kind === "missed").length
                      } missed`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="h-7 px-2.5 rounded-md border border-border text-[11px] hover:bg-muted"
              >
                Close
              </button>
            </div>
            <EventList events={pickedEvents} empty="Nothing scheduled / tracked." />
          </div>
        ) : null}

        {viewMode === "weekly" && pickedWeek ? (
          <div ref={detailRef} className="surface-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  Weekly attendance
                </div>
                <h2 className="text-[15px] font-medium mt-0.5">
                  {pickedWeek.label} · {pickedWeek.subLabel}
                </h2>
                <p className="text-[12px] text-muted-foreground mt-1">
                  {pickedWeek.joined} joined · {pickedWeek.missed} missed
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPickedWeekId(null)}
                className="h-7 px-2.5 rounded-md border border-border text-[11px] hover:bg-muted"
              >
                Close
              </button>
            </div>
            <EventList events={pickedWeek.events} empty="No meetings in this week." />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EventList({ events, empty }: { events: DayEvent[]; empty: string }) {
  if (!events.length) {
    return <p className="text-[13px] text-muted-foreground py-4 text-center">{empty}</p>;
  }

  return (
    <div className="space-y-2">
      {events.map((event, i) => {
        if (event.kind === "joined") {
          const row = event.row;
          return (
            <div
              key={`j-${row.botId}-${i}`}
              className="rounded-md border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 space-y-1.5"
            >
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium truncate" title={row.title}>
                    {row.title || "Untitled meeting"}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Start {formatTime(row.meetingStartAt || row.scheduledStart)}
                    {row.admittedAt ? ` · Admitted ${formatTime(row.admittedAt)}` : ""}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[11px] text-muted-foreground">
                    {row.waitingRoomLabel ? (
                      <span className="inline-flex items-center gap-1">
                        <DoorOpen className="h-3 w-3" />
                        Wait: {row.waitingRoomLabel}
                      </span>
                    ) : null}
                    {row.lateToStartLabel ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {row.lateToStartLabel}
                      </span>
                    ) : null}
                    <span className="capitalize">{row.finalStatus || "joined"}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        }

        const row = event.row;
        return (
          <div
            key={`m-${row.googleEventId}-${i}`}
            className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2.5 space-y-1.5"
          >
            <div className="flex items-start gap-2">
              <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium truncate" title={row.title}>
                  {row.title || "Untitled meeting"}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Start {formatTime(row.startTime)}
                  {row.botAttempted ? " · Bot attempted" : " · No bot attempt"}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1.5">{row.outcomeLabel}</div>
                {row.waitingRoomLabel ? (
                  <div className="text-[11px] text-muted-foreground mt-1 inline-flex items-center gap-1">
                    <DoorOpen className="h-3 w-3" />
                    {row.waitingRoomLabel}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
