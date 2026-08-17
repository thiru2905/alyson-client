import { useState } from "react";

export function LandingCompare() {
  const [pos, setPos] = useState(52);

  return (
    <section className="mx-auto max-w-6xl px-5 md:px-8 py-16 md:py-20">
      <div className="max-w-xl mb-8">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
          Before / after
        </div>
        <h2 className="font-display text-3xl font-semibold tracking-tight mt-1.5">
          Manual HR vs. Alyson
        </h2>
      </div>

      <div className="surface-card relative overflow-hidden rounded-2xl border border-border">
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-[220px]">
          <div className="border-b md:border-b-0 md:border-r border-border p-6" style={{ opacity: 1 - pos / 100 + 0.35 }}>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Before</div>
            <ul className="mt-3 space-y-2 text-[13px] text-muted-foreground">
              <li>· Chase timesheets in Slack</li>
              <li>· Export calendar for meeting load</li>
              <li>· Payroll spreadsheets across tools</li>
              <li>· Reviews written from scratch</li>
            </ul>
          </div>
          <div className="p-6 bg-muted/30" style={{ opacity: pos / 100 + 0.35 }}>
            <div className="text-[11px] uppercase tracking-wider text-foreground font-medium">With Alyson</div>
            <ul className="mt-3 space-y-2 text-[13px] text-foreground/90">
              <li>· Time Dashboard pacing auto-updates</li>
              <li>· Meeting Hours emailed weekly</li>
              <li>· Pay · bonus · equity in one board</li>
              <li>· Agent-drafted review summaries</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border bg-muted/20 px-5 py-4">
          <label className="flex items-center gap-3 text-[12px] text-muted-foreground">
            <span className="shrink-0">Manual</span>
            <input
              type="range"
              min={0}
              max={100}
              value={pos}
              onChange={(e) => setPos(Number(e.target.value))}
              className="w-full accent-[var(--foreground)]"
              aria-label="Compare manual HR versus Alyson"
            />
            <span className="shrink-0">Alyson</span>
          </label>
        </div>
      </div>
    </section>
  );
}
