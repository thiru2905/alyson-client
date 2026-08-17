import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type MasonryTestimonial = {
  quote: string;
  name: string;
  title: string;
  handle: string;
  avatar?: string;
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

function splitColumns<T>(items: T[], count: number): T[][] {
  const cols: T[][] = Array.from({ length: count }, () => []);
  items.forEach((item, i) => cols[i % count]!.push(item));
  return cols;
}

export function TweetMasonryCard({
  quote,
  name,
  title,
  handle,
  avatar,
  verified = true,
}: MasonryTestimonial) {
  const at = handle.startsWith("@") ? handle : `@${handle}`;

  return (
    <article className="group rounded-2xl border border-white/10 bg-[#111111] p-5 text-left shadow-[0_0_0_1px_rgba(255,255,255,0.03)] transition-colors hover:border-white/20">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {avatar ? (
            <img
              src={avatar}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-white/10"
            />
          ) : (
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-[11px] font-semibold text-white">
              {initials(name)}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="truncate text-[14px] font-semibold text-white">{name}</span>
              {verified ? (
                <BadgeCheck className="h-4 w-4 shrink-0 fill-[#1d9bf0] text-[#1d9bf0]" aria-label="Verified" />
              ) : null}
            </div>
            <div className="flex items-center gap-1.5 text-[13px] text-neutral-400">
              <span className="truncate">{at}</span>
              <span className="hidden text-neutral-600 sm:inline">·</span>
              <span className="hidden truncate sm:inline">{title}</span>
            </div>
          </div>
        </div>
        <XLogo className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500 transition-colors group-hover:text-neutral-300" />
      </div>
      <p className="mt-3 text-[14px] leading-relaxed text-neutral-200">{quote}</p>
    </article>
  );
}

export function TestimonialsMasonryGrid({
  items,
  className,
}: {
  items: MasonryTestimonial[];
  className?: string;
}) {
  const cols2 = splitColumns(items, 2);
  const cols3 = splitColumns(items, 3);
  const cols4 = splitColumns(items, 4);

  return (
    <div className={cn("w-full", className)}>
      <div className="grid grid-cols-1 gap-4 sm:hidden">
        {items.map((t) => (
          <TweetMasonryCard key={t.handle} {...t} />
        ))}
      </div>
      <div className="hidden sm:grid sm:grid-cols-2 lg:hidden gap-4">
        {cols2.map((col, i) => (
          <div key={i} className="flex flex-col gap-4">
            {col.map((t) => (
              <TweetMasonryCard key={t.handle} {...t} />
            ))}
          </div>
        ))}
      </div>
      <div className="hidden lg:grid lg:grid-cols-3 xl:hidden gap-4">
        {cols3.map((col, i) => (
          <div key={i} className="flex flex-col gap-4">
            {col.map((t) => (
              <TweetMasonryCard key={t.handle} {...t} />
            ))}
          </div>
        ))}
      </div>
      <div className="hidden xl:grid xl:grid-cols-4 gap-4">
        {cols4.map((col, i) => (
          <div key={i} className="flex flex-col gap-4">
            {col.map((t) => (
              <TweetMasonryCard key={t.handle} {...t} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
