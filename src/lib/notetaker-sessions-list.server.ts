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

function isLiveSessionStatus(session: NotetakerSession): boolean {
  const s = String(session.status || "").toLowerCase();
  const looksLive =
    s.includes("recording") ||
    s === "in_call" ||
    s.includes("joining") ||
    s === "dispatched" ||
    s === "waiting_room" ||
    s.includes("waiting_room");
  if (!looksLive) return false;

  const today = new Date().toISOString().slice(0, 10);
  const day = sessionDay(session);
  if (day === today) return true;

  // Allow a short grace window for timezone skew, but ignore stale "joining" from weeks ago.
  const startMs = Date.parse(String(session.createdAt || ""));
  if (!Number.isFinite(startMs)) return false;
  return Date.now() - startMs < 6 * 60 * 60_000;
}

/** DDMMYYYY title prefix → YYYY-MM-DD (e.g. 07082026 → 2026-08-07). */
function dayFromDatedTitle(title?: string | null): string | null {
  const m = String(title || "").trim().match(/^(\d{2})(\d{2})(\d{4})\b/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const day = `${yyyy}-${mm}-${dd}`;
  const t = Date.parse(`${day}T12:00:00Z`);
  return Number.isFinite(t) ? day : null;
}

function dayFromIso(iso?: string | null): string | null {
  const t = Date.parse(String(iso || ""));
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Recurring Google Meet links reuse the same URL every day. Collapse only
 * duplicate bots for the same URL on the same calendar day — never across days.
 */
function sessionOccurrenceKey(session: NotetakerSession): string {
  const url = normalizeMeetingUrl(session.meetingUrl);
  const day =
    dayFromDatedTitle(session.title) ||
    dayFromIso(session.createdAt) ||
    "unknown";
  if (!url) return `bot:${session.botId}`;
  return `${url}|${day}`;
}

/**
 * When two bots hit the same meeting URL on the same day, keep the one with
 * more transcript lines (fallback: richer live status).
 */
export function preferLongerTranscriptSessions(
  sessions: NotetakerSession[],
  lineCounts: Map<string, number>,
): NotetakerSession[] {
  const byOccurrence = new Map<string, NotetakerSession[]>();

  for (const session of sessions) {
    const key = sessionOccurrenceKey(session);
    const arr = byOccurrence.get(key) ?? [];
    arr.push(session);
    byOccurrence.set(key, arr);
  }

  const kept: NotetakerSession[] = [];
  for (const group of byOccurrence.values()) {
    if (group.length === 1) {
      kept.push(group[0]!);
      continue;
    }
    group.sort((a, b) => {
      const lineDiff = (lineCounts.get(b.botId) ?? 0) - (lineCounts.get(a.botId) ?? 0);
      if (lineDiff !== 0) return lineDiff;
      const statusDiff = statusRichness(b.status) - statusRichness(a.status);
      if (statusDiff !== 0) return statusDiff;
      return sessionDay(b).localeCompare(sessionDay(a));
    });
    kept.push(group[0]!);
  }

  const today = new Date().toISOString().slice(0, 10);
  return kept.sort((a, b) => {
    // Truly live bots first — do not let future "scheduled" outrank today's recordings.
    const liveDiff = Number(isLiveSessionStatus(b)) - Number(isLiveSessionStatus(a));
    if (liveDiff !== 0) return liveDiff;

    const dayA = sessionDay(a);
    const dayB = sessionDay(b);
    // Today first, then past (newest first), then future scheduled last.
    const bucket = (day: string) => {
      if (day === today) return 2;
      if (day && day < today) return 1;
      return 0;
    };
    const bucketDiff = bucket(dayB) - bucket(dayA);
    if (bucketDiff !== 0) return bucketDiff;
    if (dayA !== dayB) return dayB.localeCompare(dayA);

    // Prefer meetings that actually captured transcript over empty scheduled shells.
    const lineDiff = (lineCounts.get(b.botId) ?? 0) - (lineCounts.get(a.botId) ?? 0);
    if (lineDiff !== 0) return lineDiff;
    const statusDiff = statusRichness(b.status) - statusRichness(a.status);
    if (statusDiff !== 0) return statusDiff;
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
}

function sessionDay(session: NotetakerSession): string {
  return dayFromDatedTitle(session.title) || dayFromIso(session.createdAt) || "";
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
