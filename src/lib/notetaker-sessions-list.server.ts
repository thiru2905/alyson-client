import type { NotetakerSession } from "@/lib/alyson-notetaker-functions";
import { scheduleNotetakerCatalogMaintenance } from "@/lib/notetaker-session-catalog.server";
import {
  listPersistedSessionsFromS3,
  mergeNotetakerSessions,
} from "@/lib/notetaker-sessions-history.server";
import {
  countScheduledBotsForDay,
  listAllUnifiedScheduledBotSessions,
} from "@/lib/unifiedMeetingsService";
import { notetakerUpstream } from "@/lib/notetaker-upstream.server";

export type NotetakerSessionsListResult = {
  sessions: NotetakerSession[];
  hasRecallConfig: boolean;
  hasGroqConfig: boolean;
  /** Distinct bots scheduled for meetings occurring today (IST). */
  scheduledBotsToday: number;
};

async function listUnifiedScheduledSessions(): Promise<{
  sessions: NotetakerSession[];
  scheduledBotsToday: number;
}> {
  const rows = await listAllUnifiedScheduledBotSessions();
  return {
    sessions: rows.map((r) => ({
      botId: r.botId,
      title: r.title,
      meetingUrl: r.meetingUrl,
      createdAt: r.createdAt,
      status: r.status,
    })),
    scheduledBotsToday: countScheduledBotsForDay(rows),
  };
}

function scheduleBackgroundMaintenance(sessions: NotetakerSession[]) {
  // Always backfill S3 when the sessions list loads — do not rely on opening each session.
  scheduleNotetakerCatalogMaintenance(sessions);
}

/** Fast path: parallel fetch, no per-session upstream probes, maintenance in background. */
export async function buildNotetakerSessionsList(): Promise<NotetakerSessionsListResult> {
  const source = String(process.env.NOTETAKER_SESSIONS_SOURCE || "").trim().toLowerCase();

  const [unifiedScheduled, s3Sessions] = await Promise.all([
    listUnifiedScheduledSessions(),
    listPersistedSessionsFromS3({ includeBotIndex: true }).catch(() => [] as NotetakerSession[]),
  ]);
  const { sessions: unifiedScheduledSessions, scheduledBotsToday } = unifiedScheduled;

  if (source === "s3") {
    const sessions = mergeNotetakerSessions(s3Sessions, unifiedScheduledSessions);
    scheduleBackgroundMaintenance(sessions);
    return { sessions, hasRecallConfig: true, hasGroqConfig: true, scheduledBotsToday };
  }

  try {
    const data = (await notetakerUpstream("/api/sessions")) as {
      sessions: NotetakerSession[];
      hasRecallConfig: boolean;
      hasGroqConfig: boolean;
    };

    const sessions = mergeNotetakerSessions(
      data.sessions ?? [],
      unifiedScheduledSessions,
      s3Sessions,
    );
    scheduleBackgroundMaintenance(sessions);

    return {
      sessions,
      hasRecallConfig: Boolean(data.hasRecallConfig),
      hasGroqConfig: Boolean(data.hasGroqConfig),
      scheduledBotsToday,
    };
  } catch {
    const sessions = mergeNotetakerSessions(s3Sessions, unifiedScheduledSessions);
    if (sessions.length) {
      scheduleBackgroundMaintenance(sessions);
      return { sessions, hasRecallConfig: true, hasGroqConfig: true, scheduledBotsToday };
    }
    throw new Error(
      `Notetaker API unavailable and no S3/unified sessions found. Check ALYSON_NOTETAKER_BASE_URL.`,
    );
  }
}
