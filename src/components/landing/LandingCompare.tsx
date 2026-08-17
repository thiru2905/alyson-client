import { Check, X } from "lucide-react";

const BEFORE = [
  "Chase timesheets in Slack",
  "Export calendar for meeting load",
  "Payroll spreadsheets across tools",
  "Reviews written from scratch",
];

const AFTER = [
  "Time Dashboard pacing auto-updates",
  "Meeting Hours emailed weekly",
  "Pay · bonus · equity in one board",
  "Agent-drafted review summaries",
];

export function LandingCompare() {
  return (
    <section className="mx-auto max-w-6xl px-5 md:px-8 py-16 md:py-20">
      <div className="mx-auto max-w-2xl text-center mb-10">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
          Before / after
        </div>
        <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mt-1.5">
          Manual HR vs. Alyson
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-muted/20 p-6 md:p-8">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Before</div>
          <h3 className="font-display mt-2 text-xl font-semibold text-muted-foreground">The spreadsheet stack</h3>
          <ul className="mt-5 space-y-3">
            {BEFORE.map((item) => (
              <li key={item} className="flex items-start gap-3 text-[14px] text-muted-foreground">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-border">
                  <X className="h-3 w-3" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-foreground/20 bg-foreground text-background p-6 md:p-8 shadow-[var(--shadow-lift)]">
          <div className="text-[11px] uppercase tracking-wider text-background/70 font-medium">With Alyson</div>
          <h3 className="font-display mt-2 text-xl font-semibold">One agentic workspace</h3>
          <ul className="mt-5 space-y-3">
            {AFTER.map((item) => (
              <li key={item} className="flex items-start gap-3 text-[14px]">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-background text-foreground">
                  <Check className="h-3 w-3" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
