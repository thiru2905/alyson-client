import { cn } from "@/lib/utils";

export function GlowingCard({
  children,
  className,
  innerClassName,
}: {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  return (
    <div className={cn("group relative rounded-2xl", className)}>
      <div
        className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 blur-md transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in oklab, var(--foreground) 12%, transparent), color-mix(in oklab, var(--muted-foreground) 8%, transparent))",
        }}
        aria-hidden
      />
      <div className={cn("relative surface-card h-full rounded-2xl transition-transform duration-300 group-hover:-translate-y-0.5", innerClassName)}>
        {children}
      </div>
    </div>
  );
}
