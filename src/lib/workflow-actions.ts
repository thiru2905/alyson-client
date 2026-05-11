import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export type WorkflowDecision = "approve" | "reject" | "request_changes";

/**
 * Decide a workflow instance — flips its status and records an audit row.
 * Maps "request_changes" -> "pending" and adds a comment so we don't add a
 * new enum just for this convenience action.
 */
export function useDecideWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      decision,
      comment,
    }: {
      id: string;
      decision: WorkflowDecision;
      comment?: string;
    }) => {
      const newStatus =
        decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "pending";
      const { error } = await supabase
        .from("workflow_instances")
        .update({ status: newStatus })
        .eq("id", id);
      if (error) throw error;
      // best-effort audit
      await supabase.from("audit_log").insert({
        action: `workflow.${decision}`,
        entity_type: "workflow_instance",
        entity_id: id,
        details: { comment: comment ?? null },
      });
      return { id, decision };
    },
    onSuccess: ({ decision }) => {
      qc.invalidateQueries({ queryKey: ["workflows"] });
      const map: Record<WorkflowDecision, string> = {
        approve: "Approved",
        reject: "Rejected",
        request_changes: "Changes requested",
      };
      toast.success(map[decision]);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update workflow"),
  });
}
