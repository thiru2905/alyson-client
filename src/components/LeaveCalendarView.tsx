import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  buildMonthCalendarGrid,
  monthLabel,
  shiftMonth,
  type LeaveCalendarDay,
  type LeaveCalendarEvent,
  type LeaveEventTiming,
} from "@/lib/leave-calendar";
import { PACING_LEAVE_HOURS_PER_DAY } from "@/lib/weekly-pacing";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Props = {
  yearMonth: string;
  todayIso: string;
  events: LeaveCalendarEvent[];
  totalTeamLeaveCount: number;
  selectedDay: string | null;
  onMonthChange: (yearMonth: string) => void;
  onSelectDay: (iso: string) => void;
  onSelectEvent?: (event: LeaveCalendarEvent) => void;
};

function dayNumber(iso: string): number {
  return Number(iso.slice(8, 10));
}

function eventChipClass(timing: LeaveEventTiming): string {
  const base = "bg-sky-500/15 text-sky-900 dark:text-sky-100 border-sky-500/25";
  if (timing === "past") return `${base} opacity-70`;
  if (timing === "upcoming") return `${base} border-dashed`;
  return base;
}

export function LeaveCalendarView({
  yearMonth,
  todayIso,
  events,
  totalTeamLeaveCount,
  selectedDay,
  onMonthChange,
  onSelectDay,
  onSelectEvent,
}: Props) {
  const weeks = useMemo(
    () => buildMonthCalendarGrid(yearMonth, events, todayIso),
    [yearMonth, events, todayIso],
  );

  const monthTeamBlocks = useMemo(() => {
    const { start, end } = monthBoundsFromYearMonth(yearMonth);
    return events.filter((e) => e.startDate <= end && e.endDate >= start).length;
  }, [events, yearMonth]);

  return (
    <div className="surface-card p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-medium text-[15px]">{monthLabel(yearMonth)}</div>
          <div className="text-[12px] text-muted-foreground mt-0.5">
            {monthTeamBlocks} team leave block{monthTeamBlocks === 1 ? "" : "s"} this month ·{" "}
            {totalTeamLeaveCount} total in ledger · +{PACING_LEAVE_HOURS_PER_DAY}h/workday in Weekly Pacing
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMonthChange(shiftMonth(yearMonth, -1))}
            className="h-8 w-8 grid place-items-center rounded-md border border-border hover:bg-muted"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(todayIso.slice(0, 7))}
            className="h-8 px-2.5 rounded-md border border-border text-[11px] font-medium hover:bg-muted"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(shiftMonth(yearMonth, 1))}
            className="h-8 w-8 grid place-items-center rounded-md border border-border hover:bg-muted"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-sky-500/30 border border-sky-500/40" />
          Active team leave
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-sky-500/50 bg-sky-500/10" />
          Scheduled (upcoming)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-sky-500/20 border border-sky-500/30 opacity-70" />
          Past team leave
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden border border-border">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="bg-muted/50 text-[10px] font-medium uppercase tracking-wide text-muted-foreground py-2 text-center"
              >
                {d}
              </div>
            ))}
            {weeks.flat().map((day) => (
              <CalendarDayCell
                key={day.iso}
                day={day}
                todayIso={todayIso}
                selected={selectedDay === day.iso}
                onSelect={() => onSelectDay(day.iso)}
                onSelectEvent={onSelectEvent}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function monthBoundsFromYearMonth(yearMonth: string) {
  const [y, mo] = yearMonth.split("-").map(Number);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { start: `${yearMonth}-01`, end: `${yearMonth}-${String(last).padStart(2, "0")}` };
}

function CalendarDayCell({
  day,
  todayIso,
  selected,
  onSelect,
  onSelectEvent,
}: {
  day: LeaveCalendarDay;
  todayIso: string;
  selected: boolean;
  onSelect: () => void;
  onSelectEvent?: (event: LeaveCalendarEvent) => void;
}) {
  const visible = day.events.slice(0, 4);
  const more = day.events.length - visible.length;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`min-h-[92px] p-1.5 text-left align-top bg-background transition-colors hover:bg-muted/40 ${
        !day.inMonth ? "opacity-50" : ""
      } ${day.isWeekend ? "bg-muted/20" : ""} ${
        day.isToday ? "ring-2 ring-inset ring-sky-500/50" : ""
      } ${selected ? "bg-sky-500/10" : ""}`}
    >
      <div
        className={`text-[11px] font-medium tabular-nums mb-1 ${
          day.isToday ? "text-sky-700 dark:text-sky-300" : "text-muted-foreground"
        }`}
      >
        {dayNumber(day.iso)}
      </div>
      <div className="space-y-0.5">
        {visible.map((ev) => {
          const timing =
            ev.endDate < todayIso ? "past" : ev.startDate > todayIso ? "upcoming" : "active";
          return (
            <div
              key={ev.id}
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onSelectEvent?.(ev);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  onSelectEvent?.(ev);
                }
              }}
              className={`rounded px-1 py-0.5 text-[9px] leading-tight border truncate ${eventChipClass(timing)}`}
              title={`${ev.label} · ${ev.location} · ${ev.leaveType}`}
            >
              {ev.label} · {ev.location}
            </div>
          );
        })}
        {more > 0 ? (
          <div className="text-[9px] text-muted-foreground px-0.5">+{more} more</div>
        ) : null}
      </div>
    </button>
  );
}
