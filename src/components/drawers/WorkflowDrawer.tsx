import { Drawer } from "@/components/Drawer";
import { useDecideWorkflow } from "@/lib/workflow-actions";
import { fmtRelative } from "@/lib/format";
import { useState } from "react";
import { CheckCircle2, XCircle, RotateCcw } from "lucide-react";
import { Field, TextArea, PrimaryBtn, GhostBtn, DangerBtn } from "@/components/forms/FormField";

type WF = {
  id: string;
  subject: string;
  module: string;
  status: string;
  current_step: number;
  due_at: string | null;
  created_at: string;
  workflow_templates?: { name: string; steps: any } | null;
};

export function WorkflowDrawer({ wf, onClose }: { wf: WF | null; onClose: () => void }) {
  const decide = useDecideWorkflow();
  const [comment, setComment] = useState("");

  const act = (decision: "approve" | "reject" | "request_changes") => {
    if (!wf) return;
    decide.mutate(
      { id: wf.id, decision, comment: comment || undefined },
      {
        onSuccess: () => {
          setComment("");
          onClose();
        },
      },
    );
  };

  return (
    <Drawer open={!!wf} onClose={onClose} title={wf?.subject ?? ""} eyebrow={wf ? `${wf.module} · ${wf.workflow_templates?.name ?? ""}` : undefined} width="lg">
      {wf && (
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Status" value={wf.status} />
            <Stat label="Step" value={`${wf.current_step + 1}`} />
            <Stat label="Created" value={fmtRelative(wf.created_at)} />
          </div>

          {wf.due_at && (
            <div className="text-[12px] text-muted-foreground">
              Due {fmtRelative(wf.due_at)}
            </div>
          )}

          {wf.workflow_templates?.steps && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Approval chain</div>
              <div className="space-y-1.5">
                {(Array.isArray(wf.workflow_templates.steps) ? wf.workflow_templates.steps : []).map((s: any, i: number) => (
                  <div key={i} className={"surface-card p-3 flex items-center gap-3 " + (i === wf.current_step ? "ring-2 ring-primary/30" : "")}>
                    <div className="h-6 w-6 rounded-full bg-muted grid place-items-center text-[11px] font-medium">{i + 1}</div>
                    <div className="text-[13px] flex-1">{s.role ?? s.name ?? `Step ${i + 1}`}</div>
                    {i < wf.current_step && <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {wf.status === "pending" && (
            <div className="space-y-3 border-t border-border pt-4">
              <Field label="Decision comment" hint="Visible to the requester and stored in audit log.">
                <TextArea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional…" />
              </Field>
              <div className="flex flex-wrap gap-2 justify-end">
                <GhostBtn onClick={() => act("request_changes")} disabled={decide.isPending}>
                  <RotateCcw className="h-3.5 w-3.5" />Request changes
                </GhostBtn>
                <DangerBtn onClick={() => act("reject")} disabled={decide.isPending}>
                  <XCircle className="h-3.5 w-3.5" />Reject
                </DangerBtn>
                <PrimaryBtn onClick={() => act("approve")} disabled={decide.isPending}>
                  <CheckCircle2 className="h-3.5 w-3.5" />Approve
                </PrimaryBtn>
              </div>
            </div>
          )}
        </div>
      )}
    </Drawer>
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
