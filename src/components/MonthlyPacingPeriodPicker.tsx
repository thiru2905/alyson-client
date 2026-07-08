import { MonthlyPacingMonthPicker } from "@/components/MonthlyPacingMonthPicker";
import { TimeDashboardRangePicker } from "@/components/TimeDashboardRangePicker";

export type MonthlyPacingPeriodMode = "month" | "range";

type Props = {
  mode: MonthlyPacingPeriodMode;
  onModeChange: (mode: MonthlyPacingPeriodMode) => void;
  month: string;
  onMonthChange: (v: string) => void;
  rangeStart: string;
  rangeEnd: string;
  onRangeStartChange: (v: string) => void;
  onRangeEndChange: (v: string) => void;
  onApply: () => void;
  isBusy?: boolean;
  draftMatchesApplied?: boolean;
};

export function MonthlyPacingPeriodPicker({
  mode,
  onModeChange,
  month,
  onMonthChange,
  rangeStart,
  rangeEnd,
  onRangeStartChange,
  onRangeEndChange,
  onApply,
  isBusy = false,
  draftMatchesApplied = true,
}: Props) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="inline-flex rounded-md border border-border p-0.5 bg-muted/30">
        <button
          type="button"
          onClick={() => onModeChange("month")}
          disabled={isBusy}
          className={`h-7 px-3 rounded text-[11.5px] font-medium transition-colors ${
            mode === "month"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Calendar month
        </button>
        <button
          type="button"
          onClick={() => onModeChange("range")}
          disabled={isBusy}
          className={`h-7 px-3 rounded text-[11.5px] font-medium transition-colors ${
            mode === "range"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Custom range
        </button>
      </div>

      {mode === "month" ? (
        <MonthlyPacingMonthPicker
          month={month}
          onMonthChange={onMonthChange}
          onApply={onApply}
          isBusy={isBusy}
          draftMatchesApplied={draftMatchesApplied}
        />
      ) : (
        <TimeDashboardRangePicker
          start={rangeStart}
          end={rangeEnd}
          onStartChange={onRangeStartChange}
          onEndChange={onRangeEndChange}
          onApply={onApply}
          isBusy={isBusy}
          draftMatchesApplied={draftMatchesApplied}
        />
      )}
    </div>
  );
}
