import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type TweetTestimonial = {
  quote: string;
  name: string;
  title: string;
  handle: string;
  verified?: boolean;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function TweetCard({ quote, name, title, handle, verified = true }: TweetTestimonial) {
  const at = handle.startsWith("@") ? handle : `@${handle}`;

  return (
    <article className="group w-[min(340px,78vw)] shrink-0 rounded-2xl border border-border bg-paper p-4 shadow-[var(--shadow-soft)] transition-all duration-300 hover:border-border hover:shadow-[var(--shadow-lift)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-muted/40 text-[11px] font-semibold"
            aria-hidden
          >
            {initials(name)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="truncate text-[13px] font-semibold">{name}</span>
              {verified ? (
                <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Verified" />
              ) : null}
            </div>
            <div className="truncate text-[12px] text-muted-foreground">{at}</div>
          </div>
        </div>
        <XLogo className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-foreground/90">{quote}</p>
      <div className="mt-3 text-[11px] text-muted-foreground">{title}</div>
    </article>
  );
}

function MarqueeRow({
  items,
  reverse = false,
  duration,
}: {
  items: TweetTestimonial[];
  reverse?: boolean;
  duration: string;
}) {
  const loop = [...items, ...items];

  return (
    <div className="relative overflow-hidden">
      <div
        className={cn(
          "flex w-max gap-4 py-2 will-change-transform motion-reduce:animate-none hover:[animation-play-state:paused]",
          reverse
            ? "[animation:alyson-marquee-reverse_var(--dur)_linear_infinite]"
            : "[animation:alyson-marquee_var(--dur)_linear_infinite]",
        )}
        style={{ ["--dur" as string]: duration }}
      >
        {loop.map((t, idx) => (
          <TweetCard key={`${t.handle}-${idx}`} {...t} />
        ))}
      </div>
    </div>
  );
}

export function TestimonialsMarqueeGrid({
  rowA,
  rowB,
  className,
}: {
  rowA: TweetTestimonial[];
  rowB: TweetTestimonial[];
  className?: string;
}) {
  return (
    <div className={cn("relative w-full space-y-4", className)}>
      <MarqueeRow items={rowA} duration="42s" />
      <MarqueeRow items={rowB} reverse duration="48s" />
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-background to-transparent sm:w-28" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-background to-transparent sm:w-28" />
    </div>
  );
}
