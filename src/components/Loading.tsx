export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={"animate-pulse rounded-md bg-muted/70 " + className} />;
}

export function PageSkeleton() {
  return (
    <div className="p-10 space-y-6">
      <Skeleton className="h-10 w-72" />
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}

export function ErrorState({ error }: { error: Error }) {
  return (
    <div className="p-10">
      <div className="surface-card p-6 max-w-2xl">
        <div className="text-sm font-medium text-destructive">Failed to load data</div>
        <div className="mt-1 text-sm text-muted-foreground">{error.message}</div>
      </div>
    </div>
  );
}
