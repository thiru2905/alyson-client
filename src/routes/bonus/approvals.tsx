import { createFileRoute } from "@tanstack/react-router";
import { Check, X } from "lucide-react";
import { useMemo, useState } from "react";

import { useAuth } from "@/lib/auth";
import { MOCK_APPROVALS } from "@/lib/bonus/mock";

export const Route = createFileRoute("/bonus/approvals")({
  component: BonusApprovalsPage,
});

type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
type ApproverRole = "MANAGER" | "HR" | "FINANCE" | "CEO";

type ApprovalRow = {
  id: string;
  employeeId: string;
  employee: string;
  cycle: string;
  approver_role: ApproverRole;
  status: ApprovalStatus;
  comments: string;
  approved_at: string | null;
};

const ROLE_ORDER: ApproverRole[] = ["MANAGER", "HR", "FINANCE", "CEO"];

function BonusApprovalsPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("super_admin");

  const [rows, setRows] = useState<ApprovalRow[]>(MOCK_APPROVALS as unknown as ApprovalRow[]);

  const grouped = useMemo(() => {
    const map = new Map<string, ApprovalRow[]>();
    for (const r of rows) {
      const key = `${r.cycle}::${r.employeeId}`;
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return [...map.entries()].map(([key, approvals]) => {
      approvals.sort((a, b) => ROLE_ORDER.indexOf(a.approver_role) - ROLE_ORDER.indexOf(b.approver_role));
      return { key, approvals };
    });
  }, [rows]);

  return (
    <div className="px-5 md:px-8 py-6 space-y-6">
      <div className="surface-card p-4">
        <div className="font-display text-lg">Approvals</div>
        <div className="text-[12px] text-muted-foreground mt-1">
          Demo workflow ordering: Manager → HR → Finance → CEO. Super Admin can toggle statuses.
        </div>
      </div>

      <div className="surface-ops overflow-x-auto">
        <div className="min-w-[860px]">
          <table className="ops-table w-full">
            <thead>
              <tr>
                <th align="left">Cycle</th>
                <th align="left">Employee</th>
                <th align="left">Stage</th>
                <th align="left">Status</th>
                <th align="left">Comments</th>
                <th align="left">Approved at</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {grouped.flatMap(({ key, approvals }) =>
                approvals.map((r, idx) => (
                  <tr key={`${key}::${r.id}`}>
                    <td className="text-muted-foreground">{idx === 0 ? r.cycle : ""}</td>
                    <td className="font-medium">{idx === 0 ? r.employee : ""}</td>
                    <td className="text-muted-foreground">{r.approver_role}</td>
                    <td>
                      <span className={"pill capitalize " + pillFor(r.status)}>{r.status.toLowerCase()}</span>
                    </td>
                    <td className="text-muted-foreground text-[12px] max-w-[280px] truncate">{r.comments || "—"}</td>
                    <td className="text-muted-foreground text-[12px]">{r.approved_at ?? "—"}</td>
                    <td align="right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          disabled={!canEdit}
                          onClick={() => setRows((prev) => prev.map((x) => (x.id === r.id ? setStatus(x, "APPROVED") : x)))}
                          className="h-7 w-7 grid place-items-center rounded-md border border-border hover:bg-muted disabled:opacity-50"
                          title={!canEdit ? "Super Admin only" : "Approve"}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          disabled={!canEdit}
                          onClick={() => setRows((prev) => prev.map((x) => (x.id === r.id ? setStatus(x, "REJECTED") : x)))}
                          className="h-7 w-7 grid place-items-center rounded-md border border-border hover:bg-muted disabled:opacity-50"
                          title={!canEdit ? "Super Admin only" : "Reject"}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <button
                          disabled={!canEdit}
                          onClick={() => setRows((prev) => prev.map((x) => (x.id === r.id ? setStatus(x, "PENDING") : x)))}
                          className="h-7 px-2 rounded-md border border-border text-[11.5px] hover:bg-muted disabled:opacity-50"
                          title={!canEdit ? "Super Admin only" : "Reset"}
                        >
                          Reset
                        </button>
                      </div>
                    </td>
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

function setStatus(row: ApprovalRow, status: ApprovalStatus): ApprovalRow {
  if (status === "PENDING") return { ...row, status, approved_at: null };
  return { ...row, status, approved_at: new Date().toISOString().slice(0, 10) };
}

function pillFor(status: ApprovalStatus) {
  if (status === "APPROVED") return "pill-info";
  if (status === "REJECTED") return "pill-danger";
  return "pill-neutral";
}

