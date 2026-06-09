import {
  automationCalendarUserEmail,
  scheduleEligibleUnifiedBotsForUser,
  type UnifiedUserScheduleSummary,
} from "@/lib/unifiedMeetingsService";

export type MeetingBotScheduleCronResult = {
  ok: boolean;
  enabled: boolean;
  ranAt: string;
  summary?: UnifiedUserScheduleSummary;
  error?: string;
};

export function meetingBotScheduleCronEnabled(): boolean {
  return String(process.env.MEETING_BOT_CRON_ENABLED ?? "true").trim().toLowerCase() !== "false";
}

export async function runMeetingBotScheduleCron(): Promise<MeetingBotScheduleCronResult> {
  const ranAt = new Date().toISOString();

  if (!meetingBotScheduleCronEnabled()) {
    return { ok: true, enabled: false, ranAt };
  }

  try {
    const summary = await scheduleEligibleUnifiedBotsForUser(automationCalendarUserEmail());
    return { ok: true, enabled: true, ranAt, summary };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Meeting bot schedule cron failed";
    return { ok: false, enabled: true, ranAt, error };
  }
}
