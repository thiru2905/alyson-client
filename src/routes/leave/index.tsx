import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cloud, CalendarDays, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { LeaveEmployeeLedgerDrawer } from "@/components/LeaveEmployeeLedgerDrawer";
import { LeaveTeamLeavePanel } from "@/components/LeaveTeamLeavePanel";
import { FetchingBar } from "@/components/Skeleton";
import { useAuth } from "@/lib/auth";
import {
  getLeaveLedger,
  recordLeave,
  recordTeamLeave,
  syncLeaveWithTimeDoctor,
  voidLeave,
  voidTeamLeave,
} from "@/lib/leave-ledger-functions";
import type { EmployeeLeaveLedger } from "@/lib/leave-schema";
import {
  leaveTypeLabel,
  LIFETIME_LEAVE_DAYS_LIMIT,
  remainingLifetimeLeaveDays,
  sumLeaveDays,
  sumLeaveDaysInYear,
} from "@/lib/leave-schema";
import { PACING_LEAVE_HOURS_PER_DAY } from "@/lib/weekly-pacing";

export const Route = createFileRoute("/leave/")({
  component: LeaveEmployeesPage,
});

const QUERY_KEY = ["leave-ledger"];

function LeaveEmployeesPage() {
  const auth = useAuth();
  const canEdit = auth.hasAnyRole(["super_admin", "ceo", "hr"]);
  const actor = auth.user?.email ?? null;
  const qc = useQueryClient();
  const year = new Date().getFullYear();

  const [searchQ, setSearchQ] = useState("");
  const [selected, setSelected] = useState<EmployeeLeaveLedger | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const q = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => getLeaveLedger(),
  });

  const syncM = useMutation({
    mutationFn: () => syncLeaveWithTimeDoctor({ data: { actor } }),
    onSuccess: () => {
      toast.success("Synced employee roster from Time Dashboard");
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
      void qc.invalidateQueries({ queryKey: ["leave-analytics"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sync failed"),
  });

  const recordM = useMutation({
    mutationFn: (payload: {
      employeeId: string;
      leaveType: "annual" | "sick" | "personal" | "unpaid" | "other";
      startDate: string;
      endDate: string;
      note?: string;
    }) => recordLeave({ data: { ...payload, actor } }),
    onSuccess: (r) => {
      toast.success(`Recorded ${r.event.days} day(s) leave`);
      setSelected(r.ledger);
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
      void qc.invalidateQueries({ queryKey: ["leave-analytics"] });
      void qc.invalidateQueries({ queryKey: ["weekly-pacing-report"] });
      void qc.invalidateQueries({ queryKey: ["monthly-pacing-report"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to record leave"),
  });

  const voidM = useMutation({
    mutationFn: (payload: { employeeId: string; eventId: string }) =>
      voidLeave({ data: { ...payload, actor } }),
    onSuccess: (r) => {
      toast.success("Leave record removed");
      setSelected(r.ledger);
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
      void qc.invalidateQueries({ queryKey: ["leave-audit-log"] });
      void qc.invalidateQueries({ queryKey: ["leave-analytics"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to remove leave"),
  });

  const teamLeaveM = useMutation({
    mutationFn: (payload: {
      location: string;
      team: string;
      leaveType: "annual" | "sick" | "personal" | "unpaid" | "other";
      startDate: string;
      endDate: string;
      note?: string;
    }) => recordTeamLeave({ data: { ...payload, actor } }),
    onSuccess: (r) => {
      toast.success(
        `Team leave recorded — ${r.affectedCount} employee${r.affectedCount === 1 ? "" : "s"} · visible on Team calendar`,
      );
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
      void qc.invalidateQueries({ queryKey: ["leave-audit-log"] });
      void qc.invalidateQueries({ queryKey: ["weekly-pacing-report"] });
      void qc.invalidateQueries({ queryKey: ["monthly-pacing-report"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to record team leave"),
  });

  const voidTeamM = useMutation({
    mutationFn: (eventId: string) => voidTeamLeave({ data: { eventId, actor } }),
    onSuccess: () => {
      toast.success("Team leave removed");
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
      void qc.invalidateQueries({ queryKey: ["leave-audit-log"] });
      void qc.invalidateQueries({ queryKey: ["weekly-pacing-report"] });
      void qc.invalidateQueries({ queryKey: ["monthly-pacing-report"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to remove team leave"),
  });

  const ledgers = q.data?.ledgers ?? [];
  const teamLeaves = q.data?.teamLeaves ?? [];
  const activeLedgers = useMemo(() => ledgers.filter((l) => l.active), [ledgers]);

  const filtered = useMemo(() => {
    const qNorm = searchQ.trim().toLowerCase();
    return activeLedgers.filter((l) => {
      if (!qNorm) return true;
      return (
        l.employeeName.toLowerCase().includes(qNorm) ||
        l.officialEmail.toLowerCase().includes(qNorm) ||
        l.team.toLowerCase().includes(qNorm) ||
        l.location.toLowerCase().includes(qNorm) ||
        l.employeeId.toLowerCase().includes(qNorm)
      );
    });
  }, [activeLedgers, searchQ]);

  const totals = useMemo(() => {
    let lifetimeUsed = 0;
    let atLimit = 0;
    let withLeave = 0;
    for (const l of filtered) {
      const used = sumLeaveDays(l.leaveEvents);
      lifetimeUsed += used;
      if (used >= LIFETIME_LEAVE_DAYS_LIMIT) atLimit += 1;
      if (sumLeaveDaysInYear(l.leaveEvents, year) > 0) withLeave += 1;
    }
    return { lifetimeUsed, atLimit, withLeave, count: filtered.length };
  }, [filtered, year]);

  const openLedger = (ledger: EmployeeLeaveLedger) => {
    setSelected(ledger);
    setDrawerOpen(true);
  };

  const saving = recordM.isPending || voidM.isPending || teamLeaveM.isPending || voidTeamM.isPending;

  return (
    <div className="px-5 md:px-8 py-6 space-y-5">
      <FetchingBar active={q.isFetching} />

      <div className="surface-card p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="font-medium text-[13px]">Active employee leave ledger</div>
          <div className="text-[12px] text-muted-foreground mt-1 max-w-2xl">
            Employee list and emails come from{" "}
            <Link to="/time-dashboard" className="text-foreground underline underline-offset-2">
              Time Dashboard
            </Link>{" "}
            (Time Doctor — @cintara.ai / @revcloud.com). Only employees marked <strong>Active</strong> in{" "}
            <Link to="/time-dashboard/pacing" className="text-foreground underline underline-offset-2">
              Weekly Pacing
            </Link>{" "}
            are shown. Lifetime leave limit: <strong>{LIFETIME_LEAVE_DAYS_LIMIT} days</strong> per employee.
          </div>
          {q.data?.bucket && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
              <Cloud className="h-3.5 w-3.5 shrink-0" />
              s3://{q.data.bucket}/{q.data.key}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Link
            to="/leave/calendar"
            className="h-8 px-3 rounded-md border border-border text-xs font-medium hover:bg-muted inline-flex items-center gap-1.5"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Team calendar
          </Link>
          <button
            type="button"
            onClick={() => syncM.mutate()}
            disabled={syncM.isPending || !canEdit}
            className="h-8 px-3 rounded-md border border-border text-xs font-medium hover:bg-muted disabled:opacity-50 flex items-center gap-1.5"
          >
            {syncM.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sync Time Dashboard
          </button>
        </div>
      </div>

      <LeaveTeamLeavePanel
        ledgers={ledgers}
        teamLeaves={teamLeaves}
        canEdit={canEdit}
        saving={teamLeaveM.isPending || voidTeamM.isPending}
        onRecord={(payload) => teamLeaveM.mutate(payload)}
        onVoid={(eventId) => voidTeamM.mutate(eventId)}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MiniStat label="Active employees" value={String(totals.count)} />
        <MiniStat label="At lifetime limit (10d)" value={String(totals.atLimit)} />
        <MiniStat label={`Took leave in ${year}`} value={`${totals.withLeave} / ${totals.count}`} />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search name, email, team, location…"
            className="w-full h-9 pl-8 pr-3 rounded-md border border-border bg-background text-[13px]"
          />
        </div>
        <div className="text-[12px] text-muted-foreground sm:ml-auto">
          Showing {filtered.length} active · {activeLedgers.length} total active in ledger
        </div>
      </div>

      <div className="surface-ops overflow-x-auto">
        <div className="min-w-[960px]">
          <table className="ops-table w-full">
            <thead>
              <tr>
                <th align="left">Employee</th>
                <th align="left">Team</th>
                <th align="left">Location</th>
                <th align="right">Used / {LIFETIME_LEAVE_DAYS_LIMIT}</th>
                <th align="right">Remaining</th>
                <th align="right"># Records</th>
                <th align="left">Last leave</th>
                <th align="left">Status</th>
                <th align="right" />
              </tr>
            </thead>
            <tbody>
              {q.isLoading ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-muted-foreground text-[13px]">
                    Loading ledger from S3…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-muted-foreground text-[13px]">
                    No active employees match your search.
                  </td>
                </tr>
              ) : (
                filtered.map((l) => {
                  const used = sumLeaveDays(l.leaveEvents);
                  const remaining = remainingLifetimeLeaveDays(l.leaveEvents);
                  const yearEvents = l.leaveEvents.filter((e) => e.startDate.startsWith(String(year)));
                  const last = [...l.leaveEvents].sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
                  return (
                    <tr key={l.employeeId} className="hover:bg-muted/30">
                      <td>
                        <div className="font-medium">{l.employeeName}</div>
                        <div className="text-[11px] text-muted-foreground">{l.officialEmail || l.employeeId}</div>
                      </td>
                      <td className="text-muted-foreground">{l.team || "—"}</td>
                      <td className="text-muted-foreground">{l.location || "—"}</td>
                      <td align="right" className="font-mono">
                        {used} / {LIFETIME_LEAVE_DAYS_LIMIT}
                      </td>
                      <td align="right" className={`font-mono ${remaining === 0 ? "text-destructive" : ""}`}>
                        {remaining}
                      </td>
                      <td align="right" className="text-muted-foreground">
                        {yearEvents.length || "—"}
                      </td>
                      <td className="text-muted-foreground text-[12px]">
                        {last
                          ? `${leaveTypeLabel(last.leaveType)} · ${last.days}d · ${last.startDate}`
                          : "—"}
                      </td>
                      <td>
                        <span
                          className={`pill ${
                            remaining === 0 ? "pill-danger" : used > 0 ? "pill-info" : "pill-neutral"
                          }`}
                        >
                          {remaining === 0 ? "Limit reached" : used > 0 ? "Took leave" : "No leave"}
                        </span>
                      </td>
                      <td align="right">
                        <button
                          type="button"
                          onClick={() => openLedger(l)}
                          className="h-8 px-3 rounded-md border border-border text-[12px] font-medium hover:bg-muted"
                        >
                          View ledger
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <LeaveEmployeeLedgerDrawer
        open={drawerOpen}
        ledger={selected}
        canEdit={canEdit}
        saving={saving}
        onClose={() => setDrawerOpen(false)}
        onRecordLeave={(payload) => {
          if (!selected) return;
          recordM.mutate({ employeeId: selected.employeeId, ...payload });
        }}
        onVoidLeave={(eventId) => {
          if (!selected) return;
          voidM.mutate({ employeeId: selected.employeeId, eventId });
        }}
      />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-4">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
