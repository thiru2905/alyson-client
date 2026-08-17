const LOGOS = [
  "Google Workspace",
  "Time Doctor",
  "Clerk",
  "Recall.ai",
  "Amazon SES",
  "Google Calendar",
] as const;

export function LandingLogoCloud() {
  const loop = [...LOGOS, ...LOGOS];

  return (
    <section className="border-b border-border bg-muted/15 py-10 overflow-hidden" aria-label="Integrations">
      <p className="text-center text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium mb-6 px-5">
        Works with your stack
      </p>
      <div className="relative">
        <div
          className="flex w-max gap-3 py-1 will-change-transform motion-reduce:animate-none [animation:alyson-marquee_32s_linear_infinite] hover:[animation-play-state:paused]"
        >
          {loop.map((name, i) => (
            <div
              key={`${name}-${i}`}
              className="rounded-full border border-border bg-paper/80 px-5 py-2 text-[12px] font-medium text-muted-foreground whitespace-nowrap"
            >
              {name}
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background to-transparent sm:w-28" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent sm:w-28" />
      </div>
    </section>
  );
}
