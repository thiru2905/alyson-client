import { Loader2 } from "lucide-react";
import { isoForInput } from "@/lib/workspace-activity-range";

type Props = {
  draftStart: string;
  draftEnd: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  onApply: () => void;
  isBusy?: boolean;
  draftMatchesApplied?: boolean;
  compact?: boolean;
  presetDays?: readonly number[];
  onPreset?: (days: number) => void;
};

export function WorkspaceActivityRangePicker({
  draftStart,
  draftEnd,
  onStartChange,
  onEndChange,
  onApply,
  isBusy,
  draftMatchesApplied,
  compact,
  presetDays,
  onPreset,
}: Props) {
  const presets = presetDays?.length ? presetDays : null;

  if (compact) {
    return (
      <div className="flex flex-wrap items-end gap-2">
        {presets && onPreset ? (
          <div className="flex flex-wrap items-center gap-1 mr-1">
            {presets.map((days) => (
              <button
                key={days}
                type="button"
                disabled={isBusy}
                onClick={() => onPreset(days)}
                className="h-8 px-2 rounded-md border border-border text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
              >
                {days === 1 ? "24h" : `${days}d`}
              </button>
            ))}
          </div>
        ) : null}
        <label className="space-y-0.5">
          <span className="text-[10px] text-muted-foreground">Start</span>
          <input
            type="datetime-local"
            value={draftStart}
            onChange={(e) => onStartChange(e.target.value)}
            disabled={isBusy}
            className="h-8 px-2 rounded-md border border-border bg-background text-xs w-[11.5rem] disabled:opacity-60"
          />
        </label>
        <label className="space-y-0.5">
          <span className="text-[10px] text-muted-foreground">End</span>
          <input
            type="datetime-local"
            value={draftEnd}
            onChange={(e) => onEndChange(e.target.value)}
            disabled={isBusy}
            className="h-8 px-2 rounded-md border border-border bg-background text-xs w-[11.5rem] disabled:opacity-60"
          />
        </label>
        <button
          type="button"
          onClick={onApply}
          disabled={isBusy}
          className="h-8 px-3 rounded-md bg-foreground text-background text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-70"
        >
          {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {draftMatchesApplied ? "Refresh" : "Apply"}
        </button>
      </div>
    );
  }

  return (
    <div className="surface-card p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
      {presets && onPreset ? (
        <div className="md:col-span-4 flex flex-wrap gap-1.5 pb-1">
          {presets.map((days) => (
            <button
              key={days}
              type="button"
              disabled={isBusy}
              onClick={() => onPreset(days)}
              className="h-7 px-2.5 rounded-md border border-border text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
            >
              Last {days === 1 ? "24 hours" : `${days} days`}
            </button>
          ))}
        </div>
      ) : null}
      <label className="space-y-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Start (local)</span>
        <input
          type="datetime-local"
          value={draftStart}
          onChange={(e) => onStartChange(e.target.value)}
          disabled={isBusy}
          className="w-full h-8 px-2 rounded-md border border-border bg-background text-sm disabled:opacity-60"
        />
      </label>
      <label className="space-y-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">End (local)</span>
        <input
          type="datetime-local"
          value={draftEnd}
          onChange={(e) => onEndChange(e.target.value)}
          disabled={isBusy}
          className="w-full h-8 px-2 rounded-md border border-border bg-background text-sm disabled:opacity-60"
        />
      </label>
      <button
        type="button"
        onClick={onApply}
        disabled={isBusy}
        className="h-8 px-4 rounded-md bg-foreground text-background text-xs font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-70 min-w-[9rem]"
      >
        {isBusy ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading…
          </>
        ) : draftMatchesApplied ? (
          "Recompute"
        ) : (
          "Apply window"
        )}
      </button>
      <div className="text-[11px] text-muted-foreground">Click any employee row to open their workspace detail page.</div>
    </div>
  );
}

export function workspacePresetRange(days: number) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { draftStart: isoForInput(start), draftEnd: isoForInput(end) };
}
