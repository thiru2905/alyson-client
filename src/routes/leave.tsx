import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchLeaveBalances, fetchLeaveTypes } from "@/lib/queries-ext";
import { PageHeader, TableScroll, EmptyState } from "@/components/AppShell";
import { PageSkeleton } from "@/components/Skeleton";
import { Plus, Calendar } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LeaveRequestDrawer } from "@/components/drawers/LeaveRequestDrawer";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { useMyEmployeeId } from "@/hooks/useMyEmployeeId";
import { decideLeaveRequestAsSuperAdmin } from "@/lib/leave-functions";

const TAB_VALUES = ["requests", "approvals", "balances", "calendar", "policies"] as const;
type Tab = (typeof TAB_VALUES)[number];

const leaveSearchSchema = z.object({
  tab: z.enum(TAB_VALUES).optional(),
});

export const Route = createFileRoute("/leave")({
  head: () => ({ meta: [{ title: "Leave — Alyson HR" }] }),
  validateSearch: leaveSearchSchema.parse,
  component: LeavePage,
});

function LeavePage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const isSuperAdmin = auth.hasRole("super_admin");
  const myEmp = useMyEmployeeId();
  const myEmpId = myEmp.data ?? null;

  const tabFromUrl = search.tab;
  const [tab, setTabState] = useState<Tab>(() => (tabFromUrl && TAB_VALUES.includes(tabFromUrl) ? tabFromUrl : "requests"));

  useEffect(() => {
    if (tabFromUrl && TAB_VALUES.includes(tabFromUrl)) setTabState(tabFromUrl);
  }, [tabFromUrl]);

  useEffect(() => {
    if (!isSuperAdmin && tab === "approvals") {
      setTabState("requests");
      navigate({ to: "/leave", search: { tab: "requests" }, replace: true });
    }
  }, [isSuperAdmin, tab, navigate]);

  const setTab = (t: Tab) => {
    setTabState(t);
    navigate({ to: "/leave", search: { tab: t }, replace: true });
  };

  const visibleTabs = useMemo(() => {
    if (isSuperAdmin) return [...TAB_VALUES];
    return TAB_VALUES.filter((t) => t !== "approvals");
  }, [isSuperAdmin]);

  const types = useQuery({ queryKey: ["leave-types"], queryFn: fetchLeaveTypes });
  const balances = useQuery({ queryKey: ["leave-balances"], queryFn: fetchLeaveBalances });

  const empReady = isSuperAdmin || !myEmp.isPending;
  const requests = useQuery({
    queryKey: ["leave-requests", isSuperAdmin ? "all" : myEmpId ?? "none"],
    queryFn: async () => {
      let q = supabase
        .from("leave_requests")
        .select("*, employees(full_name, email), leave_types(name, color)")
        .order("created_at", { ascending: false });
      if (!isSuperAdmin) {
        if (!myEmpId) return [];
        q = q.eq("employee_id", myEmpId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: empReady && !!types.data,
  });

  const policies = useQuery({
    queryKey: ["leave-policies"],
    queryFn: async () => {
      const { data } = await supabase.from("leave_policies").select("*, leave_types(name, color)").order("name");
      return data ?? [];
    },
  });

  const [reqOpen, setReqOpen] = useState(false);

  if (types.isLoading || balances.isLoading || (!isSuperAdmin && myEmp.isPending)) return <PageSkeleton />;

  const typeRows = types.data ?? [];
  const balanceRowsAll = balances.data ?? [];
  const balanceRows = isSuperAdmin ? balanceRowsAll : balanceRowsAll.filter((b: any) => b.employee_id === myEmpId);
  const reqRows = requests.data ?? [];
  const policyRows = policies.data ?? [];

  const personalApproved = reqRows.filter((r: any) => r.status === "approved" && r.employee_id === myEmpId);
  /** Logged-in user’s approved leave; super admins without an employee link see all approved (ops view). */
  const calendarRequests =
    myEmpId != null ? personalApproved : isSuperAdmin ? reqRows.filter((r: any) => r.status === "approved") : [];

  return (
    <div>
      <PageHeader
        eyebrow="People"
        title="Leave"
        description={
          isSuperAdmin
            ? "10 days annual allowance per employee (default type). Super admins approve requests; you’ll see pending items in the bell."
            : "10 days annual allowance (default leave type). Requests are approved by a super admin. Your approved time appears on the Calendar tab."
        }
        actions={
          <button
            type="button"
            onClick={() => setReqOpen(true)}
            className="h-8 px-3 rounded-md bg-foreground text-background text-xs flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Request leave
          </button>
        }
      />
      <div className="px-5 md:px-8 py-6 md:py-7 space-y-6">
        {!isSuperAdmin && myEmp.isSuccess && !myEmpId && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-950 dark:text-amber-100">
            Your account is not linked to a team employee. Ask an admin to link your profile to an employee, or ensure your login email matches an employee email on the Team page.
          </div>
        )}

        <div className="border-b border-border flex gap-1 overflow-x-auto -mx-5 md:-mx-8 px-5 md:px-8">
          {visibleTabs.map((t) => (
            <button
              key={t}
              type="button"
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

        {tab === "requests" && <RequestsTable rows={reqRows} />}

        {tab === "approvals" && isSuperAdmin && <ApprovalsTable rows={reqRows.filter((r: any) => r.status === "pending")} />}

        {tab === "balances" && (
          <div className="ops-dense">
            {balanceRows.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="No leave balances yet"
                description="Open “Request leave” once to sync your 10-day allowance, or ask a super admin to configure leave types."
              />
            ) : (
              <TableScroll>
                <table className="ops-table w-full">
                  <thead>
                    <tr>
                      <th align="left">Employee</th>
                      <th align="left">Type</th>
                      <th align="right">Entitled</th>
                      <th align="right">Taken</th>
                      <th align="right">Remaining</th>
                      <th>Year</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balanceRows.slice(0, 60).map((b: any) => (
                      <tr key={b.id}>
                        <td>{b.employees?.full_name ?? "—"}</td>
                        <td>
                          <span className="pill pill-neutral">{b.leave_types?.name ?? "—"}</span>
                        </td>
                        <td align="right" className="font-mono">
                          {Number(b.entitled).toFixed(1)}
                        </td>
                        <td align="right" className="font-mono text-muted-foreground">
                          {Number(b.taken).toFixed(1)}
                        </td>
                        <td align="right" className="font-mono font-medium">
                          {Number(b.remaining).toFixed(1)}
                        </td>
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
          <div className="space-y-2">
            {calendarRequests.length === 0 && !isSuperAdmin && !myEmpId ? (
              <EmptyState icon={Calendar} title="Calendar" description="Link your account to an employee to see your approved leave on the calendar." />
            ) : calendarRequests.length === 0 ? (
              <EmptyState icon={Calendar} title="No approved leave" description="Approved requests will appear on the calendar for the visible range." />
            ) : (
              <>
                <p className="text-[12px] text-muted-foreground">
                  {myEmpId != null ? "Your approved leave only." : "All approved leave (super admin view)."}
                </p>
                <CalendarView requests={calendarRequests} anchorMonth={new Date()} />
              </>
            )}
          </div>
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
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {t.code} · {t.paid ? "Paid" : "Unpaid"}
                      </div>
                    </div>
                  ))}
                </div>

                <h3 className="font-display text-lg mb-3">Policies</h3>
                {policyRows.length === 0 ? (
                  <div className="surface-card p-6 text-center text-[13px] text-muted-foreground">No policies configured.</div>
                ) : (
                  <TableScroll>
                    <table className="ops-table w-full">
                      <thead>
                        <tr>
                          <th align="left">Policy</th>
                          <th align="left">Type</th>
                          <th align="right">Annual days</th>
                          <th align="right">Rollover</th>
                          <th align="left">Country</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {policyRows.map((p: any) => (
                          <tr key={p.id}>
                            <td>{p.name}</td>
                            <td className="text-muted-foreground">{p.leave_types?.name ?? "—"}</td>
                            <td align="right" className="font-mono">
                              {Number(p.annual_days).toFixed(1)}
                            </td>
                            <td align="right" className="font-mono">
                              {Number(p.rollover_days).toFixed(1)}
                            </td>
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
        <thead>
          <tr>
            <th align="left">Employee</th>
            <th align="left">Type</th>
            <th align="left">Start</th>
            <th align="left">End</th>
            <th align="right">Days</th>
            <th>Status</th>
            <th align="left">Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.employees?.full_name ?? "—"}</td>
              <td>
                <span className="pill pill-neutral">{r.leave_types?.name ?? "—"}</span>
              </td>
              <td className="text-muted-foreground">{fmtDate(r.start_date)}</td>
              <td className="text-muted-foreground">{fmtDate(r.end_date)}</td>
              <td align="right" className="font-mono">
                {Number(r.days).toFixed(1)}
              </td>
              <td>
                <span
                  className={`pill ${r.status === "approved" ? "pill-success" : r.status === "rejected" ? "pill-danger" : "pill-warning"}`}
                >
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
      const { data: sess, error: sErr } = await supabase.auth.getSession();
      if (sErr) throw sErr;
      const accessToken = sess.session?.access_token;
      if (!accessToken) throw new Error("Not signed in");
      const res = await decideLeaveRequestAsSuperAdmin({ data: { accessToken, requestId: id, status } });
      return res;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      qc.invalidateQueries({ queryKey: ["leave-balances"] });
      qc.invalidateQueries({ queryKey: ["pending-leave-for-bell"] });
      toast.success(`Request ${v.status}`);
    },
    onError: async (e: unknown) => {
      if (e instanceof Response) {
        toast.error(await e.text());
        return;
      }
      toast.error(e instanceof Error ? e.message : "Failed");
    },
  });

  if (!rows.length) return <EmptyState icon={Calendar} title="Nothing to approve" description="Pending leave requests show up here for super admins." />;
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="surface-card p-3 flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-medium text-[13px]">{r.employees?.full_name ?? "—"}</div>
            <div className="text-[11px] text-muted-foreground">
              {r.leave_types?.name ?? ""} · {fmtDate(r.start_date)} – {fmtDate(r.end_date)} · {Number(r.days).toFixed(1)}d
            </div>
            {r.reason && <div className="text-[12px] text-muted-foreground italic mt-1">&quot;{r.reason}&quot;</div>}
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => decide.mutate({ id: r.id, status: "rejected" })}
              disabled={decide.isPending}
              className="h-7 px-3 rounded-md border border-destructive/40 text-destructive text-[11.5px] hover:bg-destructive/10"
            >
              Reject
            </button>
            <button
              type="button"
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

function CalendarView({ requests, anchorMonth }: { requests: any[]; anchorMonth: Date }) {
  const today = new Date();
  const monthStart = new Date(anchorMonth.getFullYear(), anchorMonth.getMonth(), 1);
  const days = Array.from({ length: 35 }).map((_, i) => {
    const d = new Date(monthStart);
    d.setDate(monthStart.getDate() - monthStart.getDay() + i);
    return d;
  });

  const onDay = (d: Date) =>
    requests.filter((r: any) => {
      const start = new Date(r.start_date + "T12:00:00");
      const end = new Date(r.end_date + "T12:00:00");
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      return x >= start && x <= end;
    });

  return (
    <div className="surface-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
        {anchorMonth.toLocaleDateString("en", { month: "long", year: "numeric" })}
      </div>
      <div className="grid grid-cols-7 gap-1 text-[10.5px] text-muted-foreground mb-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d, i) => {
          const events = onDay(d);
          const inMonth = d.getMonth() === anchorMonth.getMonth();
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
                {events.slice(0, 3).map((e: any) => (
                  <div
                    key={e.id}
                    className="truncate rounded px-1 py-0.5 text-[10px] text-white"
                    style={{ background: e.leave_types?.color ?? "var(--muted-foreground)" }}
                    title={e.leave_types?.name ?? "Leave"}
                  >
                    {e.leave_types?.name ?? "Leave"}
                  </div>
                ))}
                {events.length > 3 && <div className="text-[10px] text-muted-foreground">+{events.length - 3}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
