import { Drawer } from "@/components/Drawer";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmtCurrency } from "@/lib/format";
import { toast } from "sonner";
import { PrimaryBtn, GhostBtn } from "@/components/forms/FormField";
import { CheckCircle2 } from "lucide-react";

type Plan = { id: string; name: string; bonus_type: string };

export function BonusSimulationDrawer({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: awards } = useQuery({
    queryKey: ["bonus-awards-plan", plan?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("bonus_awards")
        .select("*, employees(full_name, role)")
        .eq("plan_id", plan!.id)
        .order("predicted_amount", { ascending: false });
      return data ?? [];
    },
    enabled: !!plan,
  });

  const total = (awards ?? []).reduce((s: number, a: any) => s + Number(a.predicted_amount), 0);

  const approveAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("bonus_awards")
        .update({ status: "manager_approved" })
        .eq("plan_id", plan!.id)
        .in("status", ["draft", "simulated"]);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bonus-awards-plan", plan?.id] });
      qc.invalidateQueries({ queryKey: ["bonus-awards"] });
      toast.success("Cycle approved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Drawer open={!!plan} onClose={onClose} title={plan?.name ?? ""} eyebrow="Bonus simulation" width="xl">
      {plan && (
        <div className="p-5 space-y-4">
          <div className="surface-card p-4 bg-muted/30 flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Predicted total</div>
              <div className="font-display text-2xl mt-1">{fmtCurrency(total)}</div>
              <div className="text-[11px] text-muted-foreground">{awards?.length ?? 0} awards</div>
            </div>
            <PrimaryBtn onClick={() => approveAll.mutate()} disabled={approveAll.isPending}>
              <CheckCircle2 className="h-3.5 w-3.5" />Approve cycle
            </PrimaryBtn>
          </div>

          <div className="space-y-1">
            {(awards ?? []).map((a: any) => (
              <div key={a.id} className="surface-card p-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-[13px] truncate">{a.employees?.full_name ?? "—"}</div>
                  <div className="text-[11px] text-muted-foreground">{a.employees?.role ?? ""}</div>
                </div>
                <span className="pill pill-neutral capitalize">{a.status.replace(/_/g, " ")}</span>
                <div className="font-mono text-[13px] w-24 text-right">{fmtCurrency(Number(a.predicted_amount))}</div>
              </div>
            ))}
            {!awards?.length && <div className="py-6 text-center text-[13px] text-muted-foreground">No awards predicted yet for this plan.</div>}
          </div>

          <div className="flex justify-end pt-2">
            <GhostBtn onClick={onClose}>Close</GhostBtn>
          </div>
        </div>
      )}
    </Drawer>
  );
}
