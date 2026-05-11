import { Drawer } from "@/components/Drawer";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Field, TextInput, TextArea, PrimaryBtn, GhostBtn, FormFooter, Select } from "@/components/forms/FormField";

export function NewPayrollRunDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const today = new Date();
  const defaultPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const [period, setPeriod] = useState(defaultPeriod);
  const [status, setStatus] = useState<"draft" | "manager_review">("draft");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("payroll_runs").insert({
        period,
        status,
        notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-runs"] });
      toast.success("Payroll run created");
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create"),
  });

  return (
    <Drawer open={open} onClose={onClose} title="New payroll run" eyebrow="Payroll" width="md">
      <form
        className="flex flex-col h-full"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="p-5 space-y-4 flex-1">
          <Field label="Period start" hint="The first of the month being paid.">
            <TextInput type="date" value={period} onChange={(e) => setPeriod(e.target.value)} required />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="draft">Draft</option>
              <option value="manager_review">Manager review</option>
            </Select>
          </Field>
          <Field label="Notes" hint="Optional context for finance.">
            <TextArea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <FormFooter>
          <GhostBtn type="button" onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn type="submit" disabled={create.isPending}>Create run</PrimaryBtn>
        </FormFooter>
      </form>
    </Drawer>
  );
}
