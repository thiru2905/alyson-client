import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchLeaveBalances, fetchLeaveTypes } from "@/lib/queries-ext";
import { PageHeader, TableScroll, EmptyState } from "@/components/AppShell";
import { PageSkeleton } from "@/components/Skeleton";
import { Plus, Calendar } from "lucide-react";
import { useState } from "react";
import { LeaveRequestDrawer } from "@/components/drawers/LeaveRequestDrawer";
import { useDecideWorkflow } from "@/lib/workflow-actions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/leave")({
  head: () => ({ meta: [{ title: "Leave — Alyson HR" }] }),
  component: LeavePage,
});

const TABS = ["requests", "approvals", "balances", "calendar", "policies"] as const;
type Tab = (typeof TABS)[number];

function LeavePage() {
  const types = useQuery({ queryKey: ["leave-types"], queryFn: fetchLeaveTypes });
  const balances = useQuery({ queryKey: ["leave-balances"], queryFn: fetchLeaveBalances });
  const requests = useQuery({
    queryKey: ["leave-requests"],
    queryFn: async () => {
      const { data } = await supabase
        .from("leave_requests")
        .select("*, employees(full_name), leave_types(name, color)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  const policies = useQuery({
    queryKey: ["leave-policies"],
    queryFn: async () => {
      const { data } = await supabase.from("leave_policies").select("*, leave_types(name, color)").order("name");
      return data ?? [];
    },
  });

  const [tab, setTab] = useState<Tab>("requests");
  const [reqOpen, setReqOpen] = useState(false);

  if (types.isLoading || balances.isLoading) return <PageSkeleton />;

  const typeRows = types.data ?? [];
  const balanceRows = balances.data ?? [];
  const reqRows = requests.data ?? [];
  const policyRows = policies.data ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="People"
        title="Leave"
        description="Balances, requests, and policies in one place."
        actions={<button onClick={() => setReqOpen(true)} className="h-8 px-3 rounded-md bg-foreground text-background text-xs flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" />Request leave</button>}
      />
      <div className="px-5 md:px-8 py-6 md:py-7 space-y-6">
        <div className="border-b border-border flex gap-1 overflow-x-auto -mx-5 md:-mx-8 px-5 md:px-8">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                "px-3 py-2 text-[12.5px] font-medium border-b-2 transition-colors capitalize whitespace-nowrap " +
                (tab === t ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "requests" && (
          <RequestsTable rows={reqRows} />
        )}

        {tab === "approvals" && (
          <ApprovalsTable rows={reqRows.filter((r: any) => r.status === "pending")} />
        )}

        {tab === "balances" && (
          <div className="ops-dense">
            {balanceRows.length === 0 ? (
              <EmptyState icon={Calendar} title="No leave balances yet" description="Balances populate once policies are assigned to employees." />
            ) : (
              <TableScroll>
                <table className="ops-table w-full">
                  <thead><tr><th align="left">Employee</th><th align="left">Type</th><th align="right">Entitled</th><th align="right">Taken</th><th align="right">Remaining</th><th>Year</th></tr></thead>
                  <tbody>
                    {balanceRows.slice(0, 30).map((b) => (
                      <tr key={b.id}>
                        <td>{(b as any).employees?.full_name ?? "—"}</td>
                        <td><span className="pill pill-neutral">{(b as any).leave_types?.name ?? "—"}</span></td>
                        <td align="right" className="font-mono">{Number(b.entitled).toFixed(1)}</td>
                        <td align="right" className="font-mono text-muted-foreground">{Number(b.taken).toFixed(1)}</td>
                        <td align="right" className="font-mono font-medium">{Number(b.remaining).toFixed(1)}</td>
                        <td className="text-muted-foreground">{b.year}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            )}
          </div>
        )}

        {tab === "calendar" && (
          <CalendarView requests={reqRows} />
        )}

        {tab === "policies" && (
          <div>
            {typeRows.length === 0 ? (
              <EmptyState icon={Calendar} title="No leave types configured" description="Add types like vacation, sick, and parental leave to start tracking balances." />
            ) : (
              <>
                <h3 className="font-display text-lg mb-3">Leave types</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
                  {typeRows.map((t) => (
                    <div key={t.id} className="surface-card p-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: t.color }} />
                        <div className="font-medium text-sm truncate">{t.name}</div>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1">{t.code} · {t.paid ? "Paid" : "Unpaid"}</div>
                    </div>
                  ))}
                </div>

                <h3 className="font-display text-lg mb-3">Policies</h3>
                {policyRows.length === 0 ? (
                  <div className="surface-card p-6 text-center text-[13px] text-muted-foreground">No policies configured.</div>
                ) : (
                  <TableScroll>
                    <table className="ops-table w-full">
                      <thead><tr><th align="left">Policy</th><th align="left">Type</th><th align="right">Annual days</th><th align="right">Rollover</th><th align="left">Country</th><th>Status</th></tr></thead>
                      <tbody>
                        {policyRows.map((p: any) => (
                          <tr key={p.id}>
                            <td>{p.name}</td>
                            <td className="text-muted-foreground">{p.leave_types?.name ?? "—"}</td>
                            <td align="right" className="font-mono">{Number(p.annual_days).toFixed(1)}</td>
                            <td align="right" className="font-mono">{Number(p.rollover_days).toFixed(1)}</td>
                            <td className="text-muted-foreground">{p.country ?? "Global"}</td>
                            <td>{p.active ? <span className="pill pill-success">Active</span> : <span className="pill pill-neutral">Paused</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableScroll>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <LeaveRequestDrawer open={reqOpen} onClose={() => setReqOpen(false)} />
    </div>
  );
}

function RequestsTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <EmptyState icon={Calendar} title="No leave requests" description="Submit a request to populate this table." />;
  return (
    <TableScroll>
      <table className="ops-table w-full">
        <thead><tr><th align="left">Employee</th><th align="left">Type</th><th align="left">Start</th><th align="left">End</th><th align="right">Days</th><th>Status</th><th align="left">Reason</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.employees?.full_name ?? "—"}</td>
              <td><span className="pill pill-neutral">{r.leave_types?.name ?? "—"}</span></td>
              <td className="text-muted-foreground">{fmtDate(r.start_date)}</td>
              <td className="text-muted-foreground">{fmtDate(r.end_date)}</td>
              <td align="right" className="font-mono">{Number(r.days).toFixed(1)}</td>
              <td>
                <span className={`pill ${r.status === "approved" ? "pill-success" : r.status === "rejected" ? "pill-danger" : "pill-warning"}`}>
                  {r.status}
                </span>
              </td>
              <td className="text-muted-foreground text-[12px] max-w-[260px] truncate">{r.reason ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}

function ApprovalsTable({ rows }: { rows: any[] }) {
  const qc = useQueryClient();
  const decide = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const { error } = await supabase
        .from("leave_requests")
        .update({ status, decided_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      toast.success(`Request ${v.status}`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  if (!rows.length) return <EmptyState icon={Calendar} title="Nothing to approve" description="Pending leave requests show up here." />;
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="surface-card p-3 flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-medium text-[13px]">{r.employees?.full_name ?? "—"}</div>
            <div className="text-[11px] text-muted-foreground">
              {r.leave_types?.name ?? ""} · {fmtDate(r.start_date)} – {fmtDate(r.end_date)} · {Number(r.days).toFixed(1)}d
            </div>
            {r.reason && <div className="text-[12px] text-muted-foreground italic mt-1">"{r.reason}"</div>}
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => decide.mutate({ id: r.id, status: "rejected" })}
              disabled={decide.isPending}
              className="h-7 px-3 rounded-md border border-destructive/40 text-destructive text-[11.5px] hover:bg-destructive/10"
            >
              Reject
            </button>
            <button
              onClick={() => decide.mutate({ id: r.id, status: "approved" })}
              disabled={decide.isPending}
              className="h-7 px-3 rounded-md bg-foreground text-background text-[11.5px]"
            >
              Approve
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function CalendarView({ requests }: { requests: any[] }) {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const days = Array.from({ length: 35 }).map((_, i) => {
    const d = new Date(monthStart);
    d.setDate(monthStart.getDate() - monthStart.getDay() + i);
    return d;
  });

  const onDay = (d: Date) =>
    requests.filter((r: any) => {
      const start = new Date(r.start_date);
      const end = new Date(r.end_date);
      return d >= start && d <= end && r.status === "approved";
    });

  return (
    <div className="surface-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
        {today.toLocaleDateString("en", { month: "long", year: "numeric" })}
      </div>
      <div className="grid grid-cols-7 gap-1 text-[10.5px] text-muted-foreground mb-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="text-center py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d, i) => {
          const events = onDay(d);
          const inMonth = d.getMonth() === today.getMonth();
          const isToday = d.toDateString() === today.toDateString();
          return (
            <div
              key={i}
              className={
                "min-h-[60px] rounded-md border p-1.5 text-[11px] " +
                (isToday ? "border-primary bg-primary/5 " : "border-border ") +
                (inMonth ? "" : "opacity-40")
              }
            >
              <div className="font-medium">{d.getDate()}</div>
              <div className="space-y-0.5 mt-0.5">
                {events.slice(0, 2).map((e: any) => (
                  <div
                    key={e.id}
                    className="truncate rounded px-1 py-0.5 text-[10px] text-white"
                    style={{ background: e.leave_types?.color ?? "var(--muted-foreground)" }}
                    title={`${e.employees?.full_name} — ${e.leave_types?.name}`}
                  >
                    {e.employees?.full_name?.split(" ")[0]}
                  </div>
                ))}
                {events.length > 2 && <div className="text-[10px] text-muted-foreground">+{events.length - 2}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
