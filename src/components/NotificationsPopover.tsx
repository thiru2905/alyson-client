import { Bell, AlertCircle, Inbox } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchWorkflows } from "@/lib/queries-ext";
import { Link } from "@tanstack/react-router";
import { fmtRelative } from "@/lib/format";

export function NotificationsPopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data } = useQuery({ queryKey: ["workflows"], queryFn: fetchWorkflows });
  const pending = (data ?? []).filter((w: any) => w.status === "pending");

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative h-8 w-8 grid place-items-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {pending.length > 0 && (
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive" />
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-10 w-[340px] surface-lifted z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="font-medium text-[13px]">Notifications</div>
            <span className="text-[11px] text-muted-foreground">{pending.length} pending</span>
          </div>
          <div className="max-h-[340px] overflow-y-auto">
            {pending.length === 0 ? (
              <div className="py-8 text-center">
                <Inbox className="h-5 w-5 mx-auto text-muted-foreground mb-1.5" />
                <div className="text-[12px] text-muted-foreground">All clear.</div>
              </div>
            ) : (
              pending.slice(0, 8).map((w: any) => (
                <Link
                  key={w.id}
                  to="/workflows"
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-2 px-4 py-2.5 hover:bg-muted/50 border-b border-border last:border-0"
                >
                  <AlertCircle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] truncate">{w.subject}</div>
                    <div className="text-[11px] text-muted-foreground">{w.module} · {fmtRelative(w.created_at)}</div>
                  </div>
                </Link>
              ))
            )}
          </div>
          <Link to="/workflows" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-[12px] text-primary border-t border-border hover:bg-muted/30">
            Open inbox →
          </Link>
        </div>
      )}
    </div>
  );
}
