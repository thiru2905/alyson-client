import { cn } from "@/lib/utils";

export type MovingCardItem = {
  quote: string;
  name: string;
  title: string;
  handle?: string;
};

export function InfiniteMovingCards({
  items,
  className,
  speed = "normal",
}: {
  items: MovingCardItem[];
  className?: string;
  speed?: "slow" | "normal" | "fast";
}) {
  const duration = speed === "slow" ? "40s" : speed === "fast" ? "18s" : "26s";

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div
        className="flex w-max gap-4 py-2 will-change-transform [animation:alyson-marquee_var(--dur)_linear_infinite] hover:[animation-play-state:paused]"
        style={{ ["--dur" as any]: duration }}
      >
        {[...items, ...items].map((t, idx) => (
          // eslint-disable-next-line react/no-array-index-key
          <TweetCard key={idx} {...t} />
        ))}
      </div>

      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent" />
    </div>
  );
}

function TweetCard({ quote, name, title, handle }: MovingCardItem) {
  return (
    <div className="w-[320px] shrink-0 rounded-2xl border border-border bg-paper shadow-[var(--shadow-soft)] p-5">
      <div className="text-sm leading-relaxed text-foreground/90">“{quote}”</div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium truncate">{name}</div>
          <div className="text-[11px] text-muted-foreground truncate">{title}</div>
        </div>
        {handle ? (
          <div className="text-[11px] text-muted-foreground font-mono shrink-0">{handle}</div>
        ) : null}
      </div>
    </div>
  );
}

