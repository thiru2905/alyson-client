import { Loader2 } from "lucide-react";
import { monthYearFromIso, resolveMonthlyRollupDay } from "@/lib/monthly-pacing";
import { pacingTodayIso } from "@/lib/weekly-pacing";

export type MonthlyPacingPresetId = "this_month" | "last_month" | "two_months_ago";

const PRESETS: Array<{ id: MonthlyPacingPresetId; label: string }> = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "two_months_ago", label: "2 months ago" },
];

function shiftMonth(monthYear: string, delta: number): string {
  const [y, m] = monthYear.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

export function resolveMonthlyPreset(id: MonthlyPacingPresetId, ref = pacingTodayIso()): string {
  const cur = monthYearFromIso(ref);
  switch (id) {
    case "this_month":
      return cur;
    case "last_month":
      return shiftMonth(cur, -1);
    case "two_months_ago":
      return shiftMonth(cur, -2);
    default:
      return cur;
  }
}

type Props = {
  month: string;
  onMonthChange: (v: string) => void;
  onApply: () => void;
  isBusy?: boolean;
  draftMatchesApplied?: boolean;
};

export function MonthlyPacingMonthPicker({
  month,
  onMonthChange,
  onApply,
  isBusy = false,
  draftMatchesApplied = true,
}: Props) {
  const pendingDraft = !draftMatchesApplied && !isBusy;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="h-8 px-2 rounded-md border border-border bg-background text-[12px] max-w-[10rem] disabled:opacity-60"
        defaultValue=""
        disabled={isBusy}
        onChange={(e) => {
          const v = e.target.value as MonthlyPacingPresetId | "";
          if (!v) return;
          onMonthChange(resolveMonthlyPreset(v));
          e.target.value = "";
        }}
        aria-label="Quick month"
      >
        <option value="">Quick month…</option>
        {PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <div
        className={
          "flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors " +
          (pendingDraft
            ? "border-foreground/25 bg-foreground/[0.03] ring-1 ring-foreground/10"
            : "border-border bg-paper")
        }
      >
        <label className="text-[11px] text-muted-foreground whitespace-nowrap">Month</label>
        <input
          type="month"
          value={month}
          onChange={(e) => onMonthChange(e.target.value)}
          disabled={isBusy}
          className="h-7 rounded bg-transparent text-[12.5px] text-foreground px-1.5 disabled:opacity-60"
          aria-label="Select month"
        />
        <button
          type="button"
          onClick={onApply}
          disabled={isBusy}
          className="h-7 px-2.5 rounded bg-foreground text-background text-[11.5px] font-medium inline-flex items-center gap-1.5 disabled:opacity-70 min-w-[4.75rem] justify-center"
        >
          {isBusy ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading…
            </>
          ) : draftMatchesApplied ? (
            "Refresh"
          ) : (
            "Apply"
          )}
        </button>
      </div>
      {pendingDraft ? (
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">Unapplied changes</span>
      ) : null}
    </div>
  );
}

/** Representative as-of day when applying a month from the picker. */
export function rollupDayForMonth(monthYear: string, today = pacingTodayIso()): string {
  return resolveMonthlyRollupDay(monthYear, today);
}
