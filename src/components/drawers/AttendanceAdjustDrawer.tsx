import { Drawer } from "@/components/Drawer";
import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Field, TextInput, TextArea, PrimaryBtn, GhostBtn, FormFooter } from "@/components/forms/FormField";

type Record = {
  id: string;
  work_date: string;
  source_hours: number;
  approved_hours: number;
  adjusted_hours: number;
  adjustment_note: string | null;
  employees?: { full_name?: string } | null;
};

export function AttendanceAdjustDrawer({ record, onClose }: { record: Record | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [adjusted, setAdjusted] = useState("0");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (record) {
      setAdjusted(String(record.adjusted_hours ?? 0));
      setNote(record.adjustment_note ?? "");
    }
  }, [record]);

  const save = useMutation({
    mutationFn: async () => {
      const adj = Number(adjusted);
      const newApproved = Number(record!.source_hours) + adj;
      const { error } = await supabase
        .from("attendance_records")
        .update({
          adjusted_hours: adj,
          adjustment_note: note || null,
          approved_hours: newApproved,
        })
        .eq("id", record!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance"] });
      toast.success("Adjustment saved");
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Drawer open={!!record} onClose={onClose} title="Adjust hours" eyebrow={record?.employees?.full_name ?? ""} width="md">
      {record && (
        <form
          className="flex flex-col h-full"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="p-5 space-y-4 flex-1">
            <div className="surface-card p-3 bg-muted/30 grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Date</div>
                <div className="font-medium text-[13px]">{new Date(record.work_date).toLocaleDateString()}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Source hours</div>
                <div className="font-mono text-[13px]">{Number(record.source_hours).toFixed(1)}h</div>
              </div>
            </div>
            <Field label="Adjustment (hours)" hint="Positive to add, negative to subtract.">
              <TextInput type="number" step="0.25" value={adjusted} onChange={(e) => setAdjusted(e.target.value)} />
            </Field>
            <Field label="Note" hint="Required when adjusting.">
              <TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} required />
            </Field>
            <div className="surface-card p-3 bg-muted/30">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">New approved total</div>
              <div className="font-mono text-[15px] mt-1">
                {(Number(record.source_hours) + Number(adjusted || 0)).toFixed(1)}h
              </div>
            </div>
          </div>
          <FormFooter>
            <GhostBtn type="button" onClick={onClose}>Cancel</GhostBtn>
            <PrimaryBtn type="submit" disabled={save.isPending}>Save adjustment</PrimaryBtn>
          </FormFooter>
        </form>
      )}
    </Drawer>
  );
}
