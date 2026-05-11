import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/bonus/audit")({
  component: BonusAuditPage,
});

type AuditAction = "CREATE" | "UPDATE" | "DELETE";

type AuditRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: AuditAction;
  changed_by: string;
  timestamp: string;
  change_data: Record<string, unknown>;
};

function BonusAuditPage() {
  const { hasRole, user } = useAuth();
  const isSuperAdmin = hasRole("super_admin");

  const rows = useMemo<AuditRow[]>(
    () => [
      {
        id: "al_001",
        entity_type: "BonusCycle",
        entity_id: "bc_q4",
        action: "UPDATE",
        changed_by: user?.email ?? "system@acme.com",
        timestamp: "2026-04-12 09:14",
        change_data: { bonus_pool_percentage: { from: 5, to: 8 } },
      },
      {
        id: "al_002",
        entity_type: "EmployeeBucket",
        entity_id: "e_004",
        action: "UPDATE",
        changed_by: "super_admin@acme.com",
        timestamp: "2026-04-12 10:02",
        change_data: { bucket: { from: "GOOD", to: "TOP_EPD" } },
      },
    ],
    [user?.email]
  );

  return (
    <div className="px-5 md:px-8 py-6 space-y-6">
      <div className="surface-card p-4">
        <div className="font-display text-lg">Audit log</div>
        <div className="text-[12px] text-muted-foreground mt-1">
          Mock audit entries (demo). In production, this should reflect immutable server-side logs.
        </div>
        {!isSuperAdmin && (
          <div className="mt-2 text-[12px] text-muted-foreground">
            Full audit detail is typically restricted to Super Admin.
          </div>
        )}
      </div>

      <div className="surface-ops overflow-x-auto">
        <div className="min-w-[860px]">
          <table className="ops-table w-full">
            <thead>
              <tr>
                <th align="left">Timestamp</th>
                <th align="left">Action</th>
                <th align="left">Entity</th>
                <th align="left">By</th>
                <th align="left">Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="text-muted-foreground text-[12px]">{r.timestamp}</td>
                  <td>
                    <span className={"pill " + pillFor(r.action)}>{r.action.toLowerCase()}</span>
                  </td>
                  <td className="text-muted-foreground">{r.entity_type} · {r.entity_id}</td>
                  <td className="text-muted-foreground text-[12px]">{r.changed_by}</td>
                  <td className="font-mono text-[11px] text-muted-foreground overflow-x-auto whitespace-nowrap max-w-[460px]">
                    {isSuperAdmin ? JSON.stringify(r.change_data) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function pillFor(a: AuditAction) {
  if (a === "CREATE") return "pill-info";
  if (a === "DELETE") return "pill-danger";
  return "pill-neutral";
}

