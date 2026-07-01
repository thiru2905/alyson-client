/** Clerk user allowed to run bulk meeting-task generation from the UI. */
export const MEETING_TASKS_BACKFILL_ADMIN_EMAIL = "thirumalai@cintara.ai";

export function isMeetingTasksBackfillAdmin(email: string | null | undefined): boolean {
  return String(email || "")
    .trim()
    .toLowerCase() === MEETING_TASKS_BACKFILL_ADMIN_EMAIL;
}
