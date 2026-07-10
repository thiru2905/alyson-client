import { cn } from "@/lib/utils";

export type MovingCardItem = {
  quote: string;
  name: string;
  title: string;
  handle?: string;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function InfiniteMovingCards({
  items,
  className,
  speed = "normal",
  fadeFrom = "from-background",
}: {
  items: MovingCardItem[];
  className?: string;
  speed?: "slow" | "normal" | "fast";
  /** Tailwind gradient stop class for edge fade, e.g. `from-background` or `from-muted/20` */
  fadeFrom?: string;
}) {
  const duration = speed === "slow" ? "48s" : speed === "fast" ? "22s" : "32s";
  const loop = [...items, ...items];

  return (
    <div className={cn("relative w-full overflow-hidden", className)}>
      <div
        className="flex w-max min-w-full gap-4 py-2 will-change-transform motion-reduce:animate-none [animation:alyson-marquee_var(--dur)_linear_infinite] hover:[animation-play-state:paused]"
        style={{ ["--dur" as string]: duration }}
      >
        {loop.map((t, idx) => (
          // eslint-disable-next-line react/no-array-index-key
          <TweetCard key={`${t.handle ?? t.name}-${idx}`} {...t} />
        ))}
      </div>

      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 z-10 w-16 sm:w-28 bg-gradient-to-r to-transparent",
          fadeFrom,
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 z-10 w-16 sm:w-28 bg-gradient-to-l to-transparent",
          fadeFrom,
        )}
      />
    </div>
  );
}

function TweetCard({ quote, name, title, handle }: MovingCardItem) {
  const at = handle?.startsWith("@") ? handle : handle ? `@${handle.replace(/^@/, "")}` : null;

  return (
    <article className="w-[min(340px,78vw)] shrink-0 rounded-2xl border border-border bg-paper p-4 shadow-[var(--shadow-soft)] transition-shadow hover:shadow-[var(--shadow-lift)]">
      <div className="flex items-start gap-3">
        <div
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-muted/50 text-[11px] font-semibold text-foreground"
          aria-hidden
        >
          {initials(name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-[13px] font-semibold">{name}</div>
            {at ? (
              <div className="truncate text-[12px] text-muted-foreground font-normal">{at}</div>
            ) : null}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">{title}</div>
        </div>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-foreground/90">{quote}</p>
    </article>
  );
}
