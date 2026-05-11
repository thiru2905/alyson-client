import { Drawer } from "@/components/Drawer";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchPayrollItems } from "@/lib/queries-ext";
import { supabase } from "@/integrations/supabase/client";
import { fmtCurrency } from "@/lib/format";
import { downloadCSV } from "@/lib/csv";
import { toast } from "sonner";
import { Download, CheckCircle2, XCircle, Edit3 } from "lucide-react";
import { useState } from "react";
import { GhostBtn, PrimaryBtn, DangerBtn, TextInput, TextArea, Field } from "@/components/forms/FormField";

type Run = {
  id: string;
  period: string;
  status: string;
  total_amount: number;
  total_employees: number;
  notes: string | null;
};

export function PayrollRunDrawer({ run, onClose }: { run: Run | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: items } = useQuery({
    queryKey: ["payroll-items", run?.id],
    queryFn: () => fetchPayrollItems(run!.id),
    enabled: !!run,
  });

  const updateStatus = useMutation({
    mutationFn: async (status: "approved" | "manager_review" | "finance_review" | "paid") => {
      const patch: any = { status };
      if (status === "approved") patch.approved_at = new Date().toISOString();
      if (status === "paid") patch.paid_at = new Date().toISOString();
      const { error } = await supabase.from("payroll_runs").update(patch).eq("id", run!.id);
      if (error) throw error;
    },
    onSuccess: (_, status) => {
      qc.invalidateQueries({ queryKey: ["payroll-runs"] });
      qc.invalidateQueries({ queryKey: ["payroll-items", run?.id] });
      toast.success(`Run marked ${status.replace(/_/g, " ")}`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  const exportCSV = () => {
    if (!items?.length) return toast.error("No items to export");
    const rows = items.map((i: any) => ({
      employee: i.employees?.full_name ?? "",
      type: i.item_type,
      amount: Number(i.amount).toFixed(2),
      currency: i.currency,
      override_reason: i.override_reason ?? "",
      override_note: i.override_note ?? "",
    }));
    downloadCSV(`payroll-${run?.period?.slice(0, 7) ?? "run"}.csv`, rows);
    toast.success("Wise CSV downloaded");
  };

  return (
    <Drawer
      open={!!run}
      onClose={onClose}
      title={run ? new Date(run.period).toLocaleDateString("en", { month: "long", year: "numeric" }) : ""}
      eyebrow="Payroll run"
      width="xl"
    >
      {run && (
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Status" value={run.status.replace(/_/g, " ")} />
            <Stat label="Employees" value={String(run.total_employees)} />
            <Stat label="Total" value={fmtCurrency(Number(run.total_amount), { compact: true })} />
          </div>

          <div className="flex flex-wrap gap-2">
            <GhostBtn onClick={exportCSV}><Download className="h-3.5 w-3.5" />Export Wise CSV</GhostBtn>
            {run.status !== "approved" && run.status !== "paid" && (
              <PrimaryBtn onClick={() => updateStatus.mutate("approved")}>
                <CheckCircle2 className="h-3.5 w-3.5" />Approve run
              </PrimaryBtn>
            )}
            {run.status === "approved" && (
              <PrimaryBtn onClick={() => updateStatus.mutate("paid")}>Mark paid</PrimaryBtn>
            )}
            {run.status === "approved" && (
              <DangerBtn onClick={() => updateStatus.mutate("manager_review")}>
                <XCircle className="h-3.5 w-3.5" />Send back
              </DangerBtn>
            )}
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Line items ({items?.length ?? 0})
            </div>
            <div className="space-y-1">
              {(items ?? []).map((it: any) => (
                <ItemRow key={it.id} item={it} runId={run.id} />
              ))}
              {!items?.length && <div className="text-[13px] text-muted-foreground italic py-4 text-center">No line items.</div>}
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}

function ItemRow({ item, runId }: { item: any; runId: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(item.amount));
  const [reason, setReason] = useState(item.override_reason ?? "");
  const [note, setNote] = useState(item.override_note ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("payroll_items")
        .update({ amount: Number(amount), override_reason: reason || null, override_note: note || null })
        .eq("id", item.id);
      if (error) throw error;
      await supabase.from("audit_log").insert({
        action: "payroll.override",
        entity_type: "payroll_item",
        entity_id: item.id,
        details: { from: item.amount, to: amount, reason, note },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-items", runId] });
      toast.success("Override saved");
      setEditing(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  return (
    <div className="surface-card p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-[13px] truncate">{item.employees?.full_name ?? "—"}</div>
          <div className="text-[11px] text-muted-foreground capitalize">
            {item.item_type.replace(/_/g, " ")}
            {item.override_reason && <span className="ml-2 pill pill-warning">overridden</span>}
          </div>
        </div>
        <div className="font-mono text-[13px]">{fmtCurrency(Number(item.amount))}</div>
        <button
          onClick={() => setEditing((v) => !v)}
          className="text-muted-foreground hover:text-foreground"
          title="Override"
        >
          <Edit3 className="h-3.5 w-3.5" />
        </button>
      </div>
      {editing && (
        <div className="mt-3 space-y-2 pt-3 border-t border-border">
          <Field label="New amount">
            <TextInput type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Reason">
            <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. retroactive raise" />
          </Field>
          <Field label="Note">
            <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex gap-2 justify-end">
            <GhostBtn onClick={() => setEditing(false)}>Cancel</GhostBtn>
            <PrimaryBtn onClick={() => save.mutate()} disabled={save.isPending}>Save override</PrimaryBtn>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-medium text-[14px] mt-0.5 capitalize">{value}</div>
    </div>
  );
}
