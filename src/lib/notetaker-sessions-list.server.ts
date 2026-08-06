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

function normalizeMeetingUrl(url?: string | null): string {
  return String(url || "")
    .trim()
    .toLowerCase()
    .replace(/\?.*$/, "");
}

function statusRichness(status?: string): number {
  const s = String(status || "").toLowerCase();
  if (s.includes("recording") || s === "in_call") return 4;
  if (s === "joining" || s === "dispatched" || s === "scheduled") return 2;
  if (s === "done" || s === "persisted") return 1;
  if (s === "failed" || s === "no_transcript") return 0;
  return 1;
}

/**
 * When two bots hit the same meeting URL, keep the one with more transcript lines
 * (fallback: richer live status) so the UI surfaces the copy with less data loss.
 */
export function preferLongerTranscriptSessions(
  sessions: NotetakerSession[],
  lineCounts: Map<string, number>,
): NotetakerSession[] {
  const noUrl: NotetakerSession[] = [];
  const byUrl = new Map<string, NotetakerSession[]>();

  for (const session of sessions) {
    const url = normalizeMeetingUrl(session.meetingUrl);
    if (!url) {
      noUrl.push(session);
      continue;
    }
    const arr = byUrl.get(url) ?? [];
    arr.push(session);
    byUrl.set(url, arr);
  }

  const kept: NotetakerSession[] = [...noUrl];
  for (const group of byUrl.values()) {
    if (group.length === 1) {
      kept.push(group[0]!);
      continue;
    }
    group.sort((a, b) => {
      const lineDiff = (lineCounts.get(b.botId) ?? 0) - (lineCounts.get(a.botId) ?? 0);
      if (lineDiff !== 0) return lineDiff;
      const statusDiff = statusRichness(b.status) - statusRichness(a.status);
      if (statusDiff !== 0) return statusDiff;
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
    kept.push(group[0]!);
  }

  return kept.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

async function listUnifiedScheduledSessions(): Promise<{
  sessions: NotetakerSession[];
  scheduledBotsToday: number;
  lineCounts: Map<string, number>;
}> {
  const rows = await listAllUnifiedScheduledBotSessions();
  const lineCounts = new Map<string, number>();
  for (const r of rows) {
    const n = Number(r.transcriptLineCount || 0);
    if (n > 0) lineCounts.set(r.botId, n);
  }
  return {
    sessions: rows.map((r) => ({
      botId: r.botId,
      title: r.title,
      meetingUrl: r.meetingUrl,
      createdAt: r.createdAt,
      status: r.status,
    })),
    scheduledBotsToday: countScheduledBotsForDay(rows),
    lineCounts,
  };
}

function scheduleBackgroundMaintenance(sessions: NotetakerSession[], enabled: boolean) {
  if (!enabled) return;
  // Always backfill S3 when the sessions list loads — do not rely on opening each session.
  scheduleNotetakerCatalogMaintenance(sessions);
}

function finalizeSessions(
  sessions: NotetakerSession[],
  lineCounts: Map<string, number>,
): NotetakerSession[] {
  return preferLongerTranscriptSessions(sessions, lineCounts);
}

/** Fast path: parallel fetch, no per-session upstream probes, maintenance in background. */
export async function buildNotetakerSessionsList(options?: {
  /** When true (e.g. transcript cron), only build the list — skip duplicate S3 persist sweep. */
  skipMaintenance?: boolean;
}): Promise<NotetakerSessionsListResult> {
  const source = String(process.env.NOTETAKER_SESSIONS_SOURCE || "").trim().toLowerCase();
  const runMaintenance = !options?.skipMaintenance;

  const [unifiedScheduled, s3Sessions] = await Promise.all([
    listUnifiedScheduledSessions(),
    listPersistedSessionsFromS3({ includeBotIndex: true }).catch(() => [] as NotetakerSession[]),
  ]);
  const {
    sessions: unifiedScheduledSessions,
    scheduledBotsToday,
    lineCounts,
  } = unifiedScheduled;

  if (source === "s3") {
    const sessions = finalizeSessions(
      mergeNotetakerSessions(s3Sessions, unifiedScheduledSessions),
      lineCounts,
    );
    scheduleBackgroundMaintenance(sessions, runMaintenance);
    return { sessions, hasRecallConfig: true, hasGroqConfig: true, scheduledBotsToday };
  }

  try {
    const data = (await notetakerUpstream("/api/sessions")) as {
      sessions: NotetakerSession[];
      hasRecallConfig: boolean;
      hasGroqConfig: boolean;
    };

    const sessions = finalizeSessions(
      mergeNotetakerSessions(data.sessions ?? [], unifiedScheduledSessions, s3Sessions),
      lineCounts,
    );
    scheduleBackgroundMaintenance(sessions, runMaintenance);

    return {
      sessions,
      hasRecallConfig: Boolean(data.hasRecallConfig),
      hasGroqConfig: Boolean(data.hasGroqConfig),
      scheduledBotsToday,
    };
  } catch {
    const sessions = finalizeSessions(
      mergeNotetakerSessions(s3Sessions, unifiedScheduledSessions),
      lineCounts,
    );
    if (sessions.length) {
      scheduleBackgroundMaintenance(sessions, runMaintenance);
      return { sessions, hasRecallConfig: true, hasGroqConfig: true, scheduledBotsToday };
    }
    throw new Error(
      `Notetaker API unavailable and no S3/unified sessions found. Check ALYSON_NOTETAKER_BASE_URL.`,
    );
  }
}
