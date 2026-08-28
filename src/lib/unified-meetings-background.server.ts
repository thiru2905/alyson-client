import { runRecallCalendarAutoSyncCron } from "@/lib/recall/recall-calendar-sync-cron.server";
import { refreshUnifiedMeetings, scheduleAllowlistedUnifiedBots } from "@/lib/unifiedMeetingsService";

export type UnifiedMeetingsBackgroundResult = {
  meetingsRefreshed: boolean;
  meetingsReturned: number;
  allowlistedBotsScheduled: number;
  calendarCalendarsProcessed: number;
  calendarBotsScheduled: number;
  warnings: string[];
};

/**
 * Refresh Google Workspace calendar meetings + auto-schedule allowlisted bots
 * + auto-schedule pending Recall calendar bots.
 * Runs on transcript cron (~5 min) and Recall calendar webhooks — page visit is fallback only.
 */
export async function runUnifiedMeetingsBackgroundMaintenance(): Promise<UnifiedMeetingsBackgroundResult> {
  const warnings: string[] = [];
  let meetingsRefreshed = false;
  let meetingsReturned = 0;
  let allowlistedBotsScheduled = 0;
  let calendarCalendarsProcessed = 0;
  let calendarBotsScheduled = 0;

  try {
    const summary = await refreshUnifiedMeetings();
    meetingsRefreshed = true;
    meetingsReturned = summary.meetingsReturned ?? 0;
  } catch (e) {
    warnings.push(`google_calendar_scan: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const allow = await scheduleAllowlistedUnifiedBots({ maxNewBots: 120 });
    allowlistedBotsScheduled = allow.scheduled;
    if (allow.errors.length) {
      warnings.push(`allowlisted_schedule: ${allow.errors.slice(0, 3).join("; ")}`);
    }
  } catch (e) {
    warnings.push(`allowlisted_schedule: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const cal = await runRecallCalendarAutoSyncCron();
    calendarCalendarsProcessed = cal.calendarsProcessed;
    calendarBotsScheduled = cal.totalScheduled;
    if (cal.totalErrors > 0) {
      warnings.push(`recall_calendar_sync: ${cal.totalErrors} calendar error(s)`);
    }
  } catch (e) {
    warnings.push(`recall_calendar_sync: ${e instanceof Error ? e.message : String(e)}`);
  }

  return {
    meetingsRefreshed,
    meetingsReturned,
    allowlistedBotsScheduled,
    calendarCalendarsProcessed,
    calendarBotsScheduled,
    warnings: warnings.slice(0, 8),
  };
}
