import { Bell, AlertCircle, Inbox, Calendar } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchWorkflows } from "@/lib/queries-ext";
import { Link } from "@tanstack/react-router";
import { fmtRelative } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

type LeavePendingRow = {
  id: string;
  created_at: string;
  days: number;
  employees: { full_name: string } | null;
  leave_types: { name: string } | null;
};

export function NotificationsPopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const auth = useAuth();
  const isSuperAdmin = auth.hasRole("super_admin");

  const { data } = useQuery({ queryKey: ["workflows"], queryFn: fetchWorkflows });
  const pendingWorkflows = (data ?? []).filter((w: any) => w.status === "pending");

  const { data: pendingLeave } = useQuery({
    queryKey: ["pending-leave-for-bell"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("leave_requests")
        .select("id, created_at, days, employees(full_name), leave_types(name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (rows ?? []) as LeavePendingRow[];
    },
    enabled: isSuperAdmin,
  });

  const leaveList = isSuperAdmin ? pendingLeave ?? [] : [];
  const pendingCount = pendingWorkflows.length + leaveList.length;

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
        {pendingCount > 0 && <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive" />}
      </button>
      {open && (
        <div className="absolute right-0 top-10 w-[340px] surface-lifted z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="font-medium text-[13px]">Notifications</div>
            <span className="text-[11px] text-muted-foreground">{pendingCount} pending</span>
          </div>
          <div className="max-h-[340px] overflow-y-auto">
            {pendingCount === 0 ? (
              <div className="py-8 text-center">
                <Inbox className="h-5 w-5 mx-auto text-muted-foreground mb-1.5" />
                <div className="text-[12px] text-muted-foreground">All clear.</div>
              </div>
            ) : (
              <>
                {leaveList.map((r) => (
                  <Link
                    key={`leave-${r.id}`}
                    to="/leave"
                    search={{ tab: "approvals" }}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-2 px-4 py-2.5 hover:bg-muted/50 border-b border-border"
                  >
                    <Calendar className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] truncate">Leave: {r.employees?.full_name ?? "Employee"}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {r.leave_types?.name ?? "Leave"} · {Number(r.days).toFixed(1)}d · {fmtRelative(r.created_at)}
                      </div>
                    </div>
                  </Link>
                ))}
                {pendingWorkflows.slice(0, 8).map((w: any) => (
                  <Link
                    key={w.id}
                    to="/workflows"
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-2 px-4 py-2.5 hover:bg-muted/50 border-b border-border last:border-0"
                  >
                    <AlertCircle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] truncate">{w.subject}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {w.module} · {fmtRelative(w.created_at)}
                      </div>
                    </div>
                  </Link>
                ))}
              </>
            )}
          </div>
          <div className="border-t border-border divide-y divide-border">
            {isSuperAdmin && leaveList.length > 0 && (
              <Link
                to="/leave"
                search={{ tab: "approvals" }}
                onClick={() => setOpen(false)}
                className="block px-4 py-2.5 text-[12px] text-primary hover:bg-muted/30"
              >
                Review leave requests →
              </Link>
            )}
            <Link to="/workflows" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-[12px] text-primary hover:bg-muted/30">
              Open workflow inbox →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
