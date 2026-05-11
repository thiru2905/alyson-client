import { cn } from "@/lib/utils";

export function BentoGrid({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("grid gap-4 md:gap-5", className)}>{children}</div>;
}

export function BentoCard({
  className,
  eyebrow,
  title,
  description,
  icon,
  children,
}: {
  className?: string;
  eyebrow?: string;
  title: string;
  description: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-paper shadow-[var(--shadow-soft)]",
        "transition-transform duration-300 hover:-translate-y-0.5",
        className,
      )}
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <div
          className="absolute -inset-16 blur-2xl"
          style={{ background: "linear-gradient(120deg, color-mix(in oklab, var(--primary) 22%, transparent), transparent 55%)" }}
        />
      </div>
      <div className="relative p-5 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            {eyebrow ? (
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">{eyebrow}</div>
            ) : null}
            <div className="mt-2 font-display text-xl md:text-2xl font-semibold tracking-tight">{title}</div>
            <div className="mt-2 text-sm text-muted-foreground leading-relaxed">{description}</div>
          </div>
          {icon ? (
            <div className="h-10 w-10 rounded-xl border border-border bg-muted/40 grid place-items-center text-foreground shrink-0">
              {icon}
            </div>
          ) : null}
        </div>
        {children ? <div className="mt-5">{children}</div> : null}
      </div>
    </div>
  );
}

