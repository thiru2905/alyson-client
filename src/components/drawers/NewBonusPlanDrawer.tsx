import { Drawer } from "@/components/Drawer";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Field, TextInput, TextArea, Select, PrimaryBtn, GhostBtn, FormFooter } from "@/components/forms/FormField";

export function NewBonusPlanDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [bonusType, setBonusType] = useState<"fixed" | "discretionary" | "team_pool" | "target" | "review_score" | "formula">("target");
  const [cycle, setCycle] = useState("quarterly");
  const [pool, setPool] = useState("");
  const [formula, setFormula] = useState("base * bonus_pct/100 * (perf/3)");

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("bonus_plans").insert({
        name,
        description: description || null,
        bonus_type: bonusType,
        cycle,
        pool_amount: pool ? Number(pool) : null,
        formula: formula || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bonus-plans"] });
      toast.success("Plan created");
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Drawer open={open} onClose={onClose} title="New bonus plan" eyebrow="Bonus" width="lg">
      <form
        className="flex flex-col h-full"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return toast.error("Plan name is required");
          create.mutate();
        }}
      >
        <div className="p-5 space-y-4 flex-1 overflow-y-auto">
          <Field label="Plan name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Engineering Q4 Bonus" required />
          </Field>
          <Field label="Description">
            <TextArea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={bonusType} onChange={(e) => setBonusType(e.target.value as any)}>
                <option value="fixed">Fixed</option>
                <option value="discretionary">Discretionary</option>
                <option value="team_pool">Team pool</option>
                <option value="target">Target</option>
                <option value="review_score">Review score</option>
                <option value="formula">Formula</option>
              </Select>
            </Field>
            <Field label="Cycle">
              <Select value={cycle} onChange={(e) => setCycle(e.target.value)}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </Select>
            </Field>
          </div>
          <Field label="Pool amount" hint="Total budget for this cycle. Leave blank for per-employee plans.">
            <TextInput type="number" value={pool} onChange={(e) => setPool(e.target.value)} placeholder="100000" />
          </Field>
          <Field label="Formula" hint="Reference: base, bonus_pct, perf, multiplier.">
            <TextInput value={formula} onChange={(e) => setFormula(e.target.value)} className="font-mono" />
          </Field>
        </div>
        <FormFooter>
          <GhostBtn type="button" onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn type="submit" disabled={create.isPending}>Create plan</PrimaryBtn>
        </FormFooter>
      </form>
    </Drawer>
  );
}
