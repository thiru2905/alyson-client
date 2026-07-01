import { getRecallCalendar } from "@/lib/recall/recall-calendar-v2.server";
import { isRecallCalendarEmailAllowed } from "@/lib/recall/recall-calendar-allowlist.server";
import {
  getConnectedRecallCalendars,
  readRecallCalendarState,
} from "@/lib/recall/recall-calendar-state-s3.server";
import {
  MAX_NEW_BOTS_PER_SYNC,
  previewRecallCalendarPending,
  syncRecallCalendarEvents,
} from "@/lib/recall/recall-calendar-sync.server";

export type RecallCalendarSyncCronResult = {
  ok: boolean;
  calendarsProcessed: number;
  totalScheduled: number;
  totalSkipped: number;
  totalErrors: number;
  calendars: Array<{
    email: string;
    calendarId: string;
    pendingBefore: number;
    scheduled: number;
    skipped: number;
    errors: string[];
    skippedRun?: boolean;
    reason?: string;
  }>;
};

/** Automated Sync now for allowlisted connected calendars (pending meetings only). */
export async function runRecallCalendarAutoSyncCron(): Promise<RecallCalendarSyncCronResult> {
  const state = await readRecallCalendarState();
  const connections = getConnectedRecallCalendars(state).filter((c) =>
    isRecallCalendarEmailAllowed(c.email),
  );

  const result: RecallCalendarSyncCronResult = {
    ok: true,
    calendarsProcessed: 0,
    totalScheduled: 0,
    totalSkipped: 0,
    totalErrors: 0,
    calendars: [],
  };

  for (const conn of connections) {
    try {
      await getRecallCalendar(conn.recallCalendarId);
    } catch {
      result.calendars.push({
        email: conn.email,
        calendarId: conn.recallCalendarId,
        pendingBefore: 0,
        scheduled: 0,
        skipped: 0,
        errors: [],
        skippedRun: true,
        reason: "Calendar not found in Recall",
      });
      continue;
    }

    let pendingBefore = 0;
    try {
      pendingBefore = (await previewRecallCalendarPending(conn.recallCalendarId)).pendingCount;
    } catch {
      // Non-fatal — still attempt sync.
    }

    if (pendingBefore === 0) {
      result.calendars.push({
        email: conn.email,
        calendarId: conn.recallCalendarId,
        pendingBefore: 0,
        scheduled: 0,
        skipped: 0,
        errors: [],
        skippedRun: true,
        reason: "No pending meetings",
      });
      continue;
    }

    const sync = await syncRecallCalendarEvents({
      calendarId: conn.recallCalendarId,
      ownerEmail: conn.email,
      scheduleAll: true,
      verifyExistingBots: false,
      maxNewBots: MAX_NEW_BOTS_PER_SYNC,
    });

    result.calendarsProcessed += 1;
    result.totalScheduled += sync.scheduled;
    result.totalSkipped += sync.skipped;
    result.totalErrors += sync.errors.length;
    if (sync.errors.length) result.ok = false;

    result.calendars.push({
      email: conn.email,
      calendarId: conn.recallCalendarId,
      pendingBefore,
      scheduled: sync.scheduled,
      skipped: sync.skipped,
      errors: sync.errors,
    });
  }

  return result;
}

export function recallCalendarSyncCronEnabled(): boolean {
  return String(process.env.RECALL_CALENDAR_SYNC_CRON_ENABLED ?? "true").trim().toLowerCase() !== "false";
}
