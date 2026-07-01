import { linkBotToNotetakerSession } from "@/lib/notetaker-bot-dispatch.server";
import { isNotetakerSessionActivationDue } from "@/lib/notetaker-bot-join-timing.server";
import {
  isActiveUnifiedScheduledStatus,
  patchUnifiedScheduledByBotId,
} from "@/lib/unified-scheduled-lifecycle.server";
import {
  readUnifiedScheduledStateFromS3,
  unifiedScheduledStateUsesS3,
} from "@/lib/unified-scheduled-s3.server";

export type ScheduledBotActivationResult = {
  scanned: number;
  activated: number;
  skipped: number;
  errors: string[];
};

/**
 * Deferred Recall bots are scheduled with join_at but Notetaker session wake is skipped
 * so the bot does not enter the waiting room early. Shortly before join_at, wire
 * Notetaker for live transcripts (same as near-term create-bot path).
 */
export async function activateDueScheduledBotSessions(): Promise<ScheduledBotActivationResult> {
  const result: ScheduledBotActivationResult = {
    scanned: 0,
    activated: 0,
    skipped: 0,
    errors: [],
  };

  if (!unifiedScheduledStateUsesS3()) return result;

  const state = await readUnifiedScheduledStateFromS3();
  for (const row of state.scheduled) {
    result.scanned += 1;
    const botId = String(row.recallBotId || "").trim();
    if (!botId || !row.botJoinAt || !row.meetingUrl) {
      result.skipped += 1;
      continue;
    }
    if (!isActiveUnifiedScheduledStatus(row.status)) {
      result.skipped += 1;
      continue;
    }
    if (row.notetakerActivatedAt) {
      result.skipped += 1;
      continue;
    }
  // Notetaker-managed bots are live from create-bot; only Recall-deferred need activation.
    if (row.creationSource === "notetaker_managed") {
      result.skipped += 1;
      continue;
    }
    if (!isNotetakerSessionActivationDue(row.botJoinAt)) {
      result.skipped += 1;
      continue;
    }

    try {
      await linkBotToNotetakerSession({
        botId,
        title: row.title || "Meeting",
        meetingUrl: row.meetingUrl,
        botJoinAt: row.botJoinAt,
        allowSessionWake: true,
        metadata: {
          source: "scheduled_bot_activation",
          recall_calendar_event_id: row.recallCalendarEventId,
          scheduled_join_at: row.botJoinAt,
        },
      });
      await patchUnifiedScheduledByBotId(botId, {
        notetakerActivatedAt: new Date().toISOString(),
        status: "dispatched",
      });
      result.activated += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push(`${botId}: ${msg}`);
    }
  }

  return result;
}

export function scheduledBotActivationCronEnabled(): boolean {
  return String(process.env.SCHEDULED_BOT_ACTIVATION_CRON_ENABLED ?? "true").trim().toLowerCase() !== "false";
}
