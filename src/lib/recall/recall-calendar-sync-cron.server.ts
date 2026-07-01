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

/** Automated Sync now for one allowlisted calendar when pending > 0 (same as UI Sync now). */
export async function autoSyncRecallCalendarIfPending(args: {
  calendarId: string;
  ownerEmail: string;
}): Promise<{
  ran: boolean;
  pendingBefore: number;
  scheduled: number;
  skipped: number;
  errors: string[];
  reason?: string;
}> {
  const calendarId = String(args.calendarId || "").trim();
  const ownerEmail = String(args.ownerEmail || "").trim();
  if (!calendarId) {
    return { ran: false, pendingBefore: 0, scheduled: 0, skipped: 0, errors: [], reason: "Missing calendar id" };
  }
  if (!isRecallCalendarEmailAllowed(ownerEmail)) {
    return {
      ran: false,
      pendingBefore: 0,
      scheduled: 0,
      skipped: 0,
      errors: [],
      reason: `Auto-schedule disabled for ${ownerEmail || "unknown"}`,
    };
  }

  try {
    await getRecallCalendar(calendarId);
  } catch {
    return {
      ran: false,
      pendingBefore: 0,
      scheduled: 0,
      skipped: 0,
      errors: [],
      reason: "Calendar not found in Recall",
    };
  }

  let pendingBefore = 0;
  try {
    pendingBefore = (await previewRecallCalendarPending(calendarId)).pendingCount;
  } catch {
    // Non-fatal — still attempt sync when preview fails.
  }

  if (pendingBefore === 0) {
    return {
      ran: false,
      pendingBefore: 0,
      scheduled: 0,
      skipped: 0,
      errors: [],
      reason: "No pending meetings",
    };
  }

  const sync = await syncRecallCalendarEvents({
    calendarId,
    ownerEmail,
    scheduleAll: true,
    verifyExistingBots: false,
    maxNewBots: MAX_NEW_BOTS_PER_SYNC,
  });

  return {
    ran: true,
    pendingBefore,
    scheduled: sync.scheduled,
    skipped: sync.skipped,
    errors: sync.errors,
  };
}

/** Automated Sync now for all allowlisted connected calendars (pending meetings only). */
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
    const run = await autoSyncRecallCalendarIfPending({
      calendarId: conn.recallCalendarId,
      ownerEmail: conn.email,
    });

    if (!run.ran) {
      result.calendars.push({
        email: conn.email,
        calendarId: conn.recallCalendarId,
        pendingBefore: run.pendingBefore,
        scheduled: 0,
        skipped: 0,
        errors: [],
        skippedRun: true,
        reason: run.reason,
      });
      continue;
    }

    result.calendarsProcessed += 1;
    result.totalScheduled += run.scheduled;
    result.totalSkipped += run.skipped;
    result.totalErrors += run.errors.length;
    if (run.errors.length) result.ok = false;

    result.calendars.push({
      email: conn.email,
      calendarId: conn.recallCalendarId,
      pendingBefore: run.pendingBefore,
      scheduled: run.scheduled,
      skipped: run.skipped,
      errors: run.errors,
    });
  }

  return result;
}

export function recallCalendarSyncCronEnabled(): boolean {
  return String(process.env.RECALL_CALENDAR_SYNC_CRON_ENABLED ?? "true").trim().toLowerCase() !== "false";
}
