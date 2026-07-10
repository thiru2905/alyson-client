const LOGOS = [
  "Google Workspace",
  "Time Doctor",
  "Clerk",
  "Recall.ai",
  "Amazon SES",
  "Google Calendar",
] as const;

export function LandingLogoCloud() {
  return (
    <section className="border-b border-border bg-muted/15 py-8" aria-label="Integrations">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <p className="text-center text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium mb-5">
          Works with your stack
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 md:gap-4">
          {LOGOS.map((name) => (
            <div
              key={name}
              className="rounded-lg border border-border bg-paper/80 px-4 py-2 text-[12px] font-medium text-muted-foreground grayscale transition-all hover:grayscale-0 hover:text-foreground hover:border-border"
            >
              {name}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
