import { Drawer } from "@/components/Drawer";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Field, TextInput, PrimaryBtn, GhostBtn, FormFooter } from "@/components/forms/FormField";

export function ReviewCycleDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState(`${new Date().getFullYear()} Q${Math.floor(new Date().getMonth() / 3) + 1} Review`);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("review_cycles").insert({
        name,
        start_date: start,
        end_date: end,
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews"] });
      qc.invalidateQueries({ queryKey: ["review-cycles"] });
      toast.success("Cycle created");
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Drawer open={open} onClose={onClose} title="Start review cycle" eyebrow="Performance" width="md">
      <form
        className="flex flex-col h-full"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="p-5 space-y-4 flex-1">
          <Field label="Cycle name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <TextInput type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
            </Field>
            <Field label="End date">
              <TextInput type="date" value={end} onChange={(e) => setEnd(e.target.value)} required />
            </Field>
          </div>
        </div>
        <FormFooter>
          <GhostBtn type="button" onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn type="submit" disabled={create.isPending}>Create cycle</PrimaryBtn>
        </FormFooter>
      </form>
    </Drawer>
  );
}
