import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Cloud, Loader2 } from "lucide-react";
import { FetchingBar } from "@/components/Skeleton";
import { useAuth } from "@/lib/auth";
import { useSuperAccessAuth } from "@/lib/super-access-rbac-hooks";
import { isSuperAccessEmail } from "@/lib/super-access-constants";
import { getLeaveAuditLog } from "@/lib/leave-ledger-functions";
import type { LeaveOperation } from "@/lib/leave-schema";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/leave/audit")({
  component: LeaveAuditPage,
});

const QUERY_KEY = ["leave-audit-log"];

function LeaveAuditPage() {
  const { user } = useAuth();
  const superAuth = useSuperAccessAuth();
  const isSuperAdmin = isSuperAccessEmail(user?.email);

  const q = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => getLeaveAuditLog({ data: await superAuth() }),
  });

  const entries = q.data?.entries ?? [];

  return (
    <div className="app-page-gutter py-6 space-y-6">
      <FetchingBar active={q.isFetching} />

      <div className="surface-card p-4">
        <div className="font-display text-lg">Operations log</div>
        <div className="text-[12px] text-muted-foreground mt-1">
          Append-only audit trail for leave records. Every sync and leave entry is persisted to S3 forever.
        </div>
        {q.data?.bucket && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
            <Cloud className="h-3.5 w-3.5 shrink-0" />
            s3://{q.data.bucket}/{q.data.key}
          </div>
        )}
      </div>

      <div className="surface-ops app-table-flush overflow-x-auto">
        <div className="min-w-[900px]">
          <table className="ops-table w-full">
            <thead>
              <tr>
                <th align="left">Timestamp</th>
                <th align="left">Operation</th>
                <th align="left">Employee</th>
                <th align="left">Actor</th>
                <th align="left">Details</th>
                {isSuperAdmin && <th align="left">Event</th>}
              </tr>
            </thead>
            <tbody>
              {q.isLoading ? (
                <tr>
                  <td colSpan={isSuperAdmin ? 6 : 5} className="text-center py-10 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin inline-block" />
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={isSuperAdmin ? 6 : 5} className="text-center py-10 text-muted-foreground text-[13px]">
                    No operations logged yet.
                  </td>
                </tr>
              ) : (
                entries.map((r, i) => (
                  <tr key={`${r.ts}-${i}`}>
                    <td className="text-muted-foreground text-[12px] whitespace-nowrap">
                      {fmtDate(r.ts.slice(0, 10))} {r.ts.slice(11, 19)}
                    </td>
                    <td>
                      <span className={"pill " + pillFor(r.op)}>{r.op.replace(/_/g, " ")}</span>
                    </td>
                    <td className="text-muted-foreground text-[12px]">{r.employeeName || r.employeeId || "—"}</td>
                    <td className="text-muted-foreground text-[12px]">{r.actor || "—"}</td>
                    <td className="text-[12px] max-w-[280px]">{r.details || "—"}</td>
                    {isSuperAdmin && (
                      <td className="font-mono text-[11px] text-muted-foreground max-w-[320px] overflow-x-auto whitespace-nowrap">
                        {r.event || r.teamEvent ? JSON.stringify(r.event ?? r.teamEvent) : "—"}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function pillFor(op: LeaveOperation): string {
  if (op === "void_leave" || op === "void_team_leave") return "pill-danger";
  if (op === "append_leave" || op === "append_team_leave") return "pill-info";
  return "pill-neutral";
}
