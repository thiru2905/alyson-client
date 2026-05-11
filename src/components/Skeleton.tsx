/** Reusable loading shimmers — keep visual continuity instead of "Loading…". */
export function Shimmer({ className = "" }: { className?: string }) {
  return (
    <div
      className={
        "animate-pulse rounded-md bg-gradient-to-r from-muted/60 via-muted to-muted/60 " +
        className
      }
    />
  );
}

export function PageSkeleton() {
  return (
    <div className="px-5 md:px-8 py-7 space-y-6 animate-in fade-in">
      <div className="space-y-2">
        <Shimmer className="h-3 w-24" />
        <Shimmer className="h-8 w-72" />
        <Shimmer className="h-4 w-96" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Shimmer key={i} className="h-24" />
        ))}
      </div>
      <Shimmer className="h-72" />
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="surface-card p-4 space-y-2">
      <Shimmer className="h-6 w-40" />
      {Array.from({ length: rows }).map((_, i) => (
        <Shimmer key={i} className="h-9" />
      ))}
    </div>
  );
}
