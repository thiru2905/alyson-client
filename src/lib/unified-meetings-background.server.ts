import { runRecallCalendarAutoSyncCron } from "@/lib/recall/recall-calendar-sync-cron.server";
import { refreshUnifiedMeetings } from "@/lib/unifiedMeetingsService";

export type UnifiedMeetingsBackgroundResult = {
  meetingsRefreshed: boolean;
  meetingsReturned: number;
  calendarCalendarsProcessed: number;
  calendarBotsScheduled: number;
  warnings: string[];
};

/**
 * Refresh Google Workspace calendar meetings + auto-schedule pending Recall calendar bots.
 * Runs on transcript cron (~5 min) and Recall calendar webhooks — page visit is fallback only.
 */
export async function runUnifiedMeetingsBackgroundMaintenance(): Promise<UnifiedMeetingsBackgroundResult> {
  const warnings: string[] = [];
  let meetingsRefreshed = false;
  let meetingsReturned = 0;
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
    calendarCalendarsProcessed,
    calendarBotsScheduled,
    warnings: warnings.slice(0, 8),
  };
}
