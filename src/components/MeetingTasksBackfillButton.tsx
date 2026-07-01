import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import {
  auditMeetingTasksCoverage,
  backfillAllMeetingTasks,
} from "@/lib/notetaker-s3-calendar-functions";
import { isMeetingTasksBackfillAdmin } from "@/lib/notetaker-tasks-backfill-auth";

type Props = {
  className?: string;
  invalidateQueryKeys?: string[][];
};

export function MeetingTasksBackfillButton({ className, invalidateQueryKeys = [] }: Props) {
  const auth = useAuth();
  const clerkAuth = useClerkAuth();
  const qc = useQueryClient();
  const isAdmin = isMeetingTasksBackfillAdmin(auth.user?.email);

  async function clerkToken() {
    const token = await clerkAuth.getToken();
    if (!token) throw new Error("Sign in with Clerk to continue");
    return token;
  }

  const coverageQ = useQuery({
    queryKey: ["notetaker-tasks-coverage"],
    queryFn: async () => {
      const report = await auditMeetingTasksCoverage({ data: { clerkToken: await clerkToken() } });
      return report.report;
    },
    enabled: isAdmin && clerkAuth.isSignedIn,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const backfillM = useMutation({
    mutationFn: async () => backfillAllMeetingTasks({ data: { clerkToken: await clerkToken() } }),
    onSuccess: (res) => {
      toast.success(
        `Tasks generated — ${res.succeeded} saved, ${res.failed} failed, ${res.remainingMissing} still missing`,
      );
      void qc.invalidateQueries({ queryKey: ["notetaker-tasks-coverage"] });
      for (const key of invalidateQueryKeys) {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Task backfill failed"),
  });

  if (!isAdmin) return null;

  const coverage = coverageQ.data;
  const missing = coverage?.missingTasks.length ?? 0;

  return (
    <button
      type="button"
      onClick={() => backfillM.mutate()}
      disabled={backfillM.isPending || missing === 0}
      className={
        className ??
        "text-[10px] text-muted-foreground/70 hover:text-foreground underline underline-offset-2 disabled:opacity-40"
      }
      title="Generate tasks for all meetings in S3 (notes + transcript, no tasks yet)"
    >
      {backfillM.isPending
        ? "Generating tasks…"
        : coverageQ.isLoading
          ? "Generate tasks"
          : missing > 0
            ? `Generate tasks (${missing})`
            : "Generate tasks"}
    </button>
  );
}
