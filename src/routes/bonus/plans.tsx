import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { useAuth } from "@/lib/auth";
import { fmtCurrency } from "@/lib/format";
import { MOCK_PLANS } from "@/lib/bonus/mock";

export const Route = createFileRoute("/bonus/plans")({
  component: BonusPlansPage,
});

function BonusPlansPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("super_admin");

  const [plans, setPlans] = useState(MOCK_PLANS);
  const activeCount = useMemo(() => plans.filter((p) => p.active).length, [plans]);

  return (
    <div className="px-5 md:px-8 py-6 space-y-6">
      <div className="surface-card p-4 flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-lg">Plans</div>
          <div className="text-[12px] text-muted-foreground mt-1">
            Mock plans (demo). Use this page to define plan metadata and formulas.
          </div>
        </div>
        <button
          disabled={!canEdit}
          onClick={() => {
            const id = `bp_${String(plans.length + 1).padStart(3, "0")}`;
            setPlans((p) => [
              {
                id,
                name: `New Bonus Plan (${id})`,
                description: "Describe how this plan allocates the pool.",
                cycle: "Q4",
                bonus_type: "variable_pool",
                active: false,
                pool_amount: null,
                formula: "TotalPool = GP * poolPct; split; distribute by points; caps",
              },
              ...p,
            ]);
          }}
          className="h-8 px-3 rounded-md bg-foreground text-background text-xs flex items-center gap-1.5 disabled:opacity-50"
          title={!canEdit ? "Super Admin only" : "Create plan"}
        >
          <Plus className="h-3.5 w-3.5" />
          New plan
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Active plans" value={String(activeCount)} />
        <Stat label="Total plans" value={String(plans.length)} />
        <Stat label="Default pool (demo)" value={fmtCurrency(0, { compact: true })} />
      </div>

      {plans.length === 0 ? (
        <div className="surface-card p-10 text-center">
          <div className="font-medium text-[15px]">No bonus plans yet</div>
          <div className="text-[13px] text-muted-foreground mt-1">Create your first plan to start simulating awards.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {plans.map((p) => (
            <div key={p.id} className="surface-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-[12px] text-muted-foreground mt-0.5">{p.description}</div>
                </div>
                <span className={"pill whitespace-nowrap " + (p.active ? "pill-info" : "pill-neutral")}>{p.active ? "Active" : "Paused"}</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
                <Field label="Cycle" value={p.cycle} />
                <Field label="Type" value={p.bonus_type.replace(/_/g, " ")} />
                <Field label="Pool" value={p.pool_amount ? fmtCurrency(Number(p.pool_amount), { compact: true }) : "—"} />
              </div>
              {p.formula && (
                <div className="mt-3 font-mono text-[11px] bg-muted/50 px-2 py-1.5 rounded text-muted-foreground overflow-x-auto whitespace-nowrap">
                  {p.formula}
                </div>
              )}
              {canEdit && (
                <div className="mt-3 pt-3 border-t border-border flex justify-end gap-2">
                  <button
                    onClick={() => setPlans((prev) => prev.map((x) => (x.id === p.id ? { ...x, active: !x.active } : x)))}
                    className="h-7 px-2.5 rounded-md border border-border text-[11.5px] hover:bg-muted"
                  >
                    {p.active ? "Pause" : "Activate"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-4">
      <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-medium">{label}</div>
      <div className="font-display text-2xl mt-1">{value}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium truncate">{value}</div>
    </div>
  );
}

