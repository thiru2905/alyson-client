import { google } from "googleapis";
import { JWT } from "google-auth-library";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  fetchRecallBotLifecycles,
  listRecallBotsInJoinRange,
  parseRecallBotLifecycle,
} from "@/lib/recall/recall-bot-status.server";
import { isReservingBotId } from "@/lib/meeting-bot-reserve.server";
import { eventTitleFromRaw, listAllRecallCalendarEvents } from "@/lib/recall/recall-calendar-v2.server";
import { buildNotetakerSessionsList } from "@/lib/notetaker-sessions-list.server";
import { getMeetingUrl } from "@/lib/unifiedMeetingsService";
import {
  readUnifiedScheduledStateFromS3,
  unifiedScheduledStateUsesS3,
  type UnifiedScheduledStateEntry,
} from "@/lib/unified-scheduled-s3.server";
import { listAllBotIndexDocs } from "@/lib/notetaker-sessions-history.server";
import { readRecallCalendarState } from "@/lib/recall/recall-calendar-state-s3.server";
import {
  DEFAULT_BOT_JOIN_REPORT_EMAIL,
  type BotJoinCriticalMetrics,
  type BotJoinDailyPoint,
  type BotJoinReport,
  type BotJoinReportDiagnostics,
  type BotJoinReportRow,
  type CalendarMeetingRef,
  type MissedMeetingDetail,
} from "@/lib/notetaker-bot-join-report.types";
import {
  applyAdmissionTimingToRow,
  computeAdmissionTiming,
  LATE_GRACE_SECONDS,
  resolveMeetingStartForCandidate,
} from "@/lib/notetaker-bot-join-timing.server";

export { DEFAULT_BOT_JOIN_REPORT_EMAIL };
export type {
  BotJoinReport,
  BotJoinReportRow,
  CalendarMeetingRef,
  BotJoinCriticalMetrics,
  BotJoinReportDiagnostics,
  BotJoinDailyPoint,
  MissedMeetingDetail,
};

type ScheduledState = { scheduled: UnifiedScheduledStateEntry[] };

const reportCache = new Map<string, { at: number; report: BotJoinReport }>();
const REPORT_CACHE_TTL_MS = 10 * 60_000;

function reportCacheKey(calendarEmail: string, start: string, end: string, windowHours?: number) {
  return `${calendarEmail}|${start}|${end}|${windowHours ?? "days"}`;
}

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function recallConfigured(): boolean {
  return Boolean(process.env.RECALL_API_KEY?.trim());
}

function dwdConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_DWD_SERVICE_ACCOUNT_JSON?.trim() ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim(),
  );
}


function eventDay(iso: string): string | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

function inRangeDay(day: string | null, start: string, end: string): boolean {
  if (!day) return false;
  return day >= start && day <= end;
}

function rollingWindowBounds(windowHours: number): { windowStart: string; windowEnd: string; floorMs: number } {
  const windowEnd = new Date().toISOString();
  const floorMs = Date.now() - windowHours * 3600_000;
  return { windowStart: new Date(floorMs).toISOString(), windowEnd, floorMs };
}

function inReportWindow(
  iso: string | null | undefined,
  start: string,
  end: string,
  windowHours?: number,
  floorMs?: number,
): boolean {
  if (!iso) return false;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return false;
  if (windowHours) {
    const floor = floorMs ?? Date.now() - windowHours * 3600_000;
    return ms >= floor && ms <= Date.now();
  }
  return inRangeDay(eventDay(iso), start, end);
}

function normalizeStartIso(iso: string): string {
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? new Date(ms).toISOString() : String(iso).trim();
}

function meetingDedupeKey(meetingUrl: string, startTime: string): string {
  return `${String(meetingUrl).trim()}|${normalizeStartIso(startTime)}`;
}

function googleMeetCode(url: string | null | undefined): string | null {
  const raw = String(url || "").trim().toLowerCase();
  if (!raw) return null;
  const m = raw.match(/([a-z]{3,4}-[a-z]{3,4}-[a-z]{3,4})/i);
  return m ? m[1].toLowerCase() : null;
}

function meetUrlsEquivalent(a: string | null | undefined, b: string | null | undefined): boolean {
  const sa = String(a || "").trim();
  const sb = String(b || "").trim();
  if (!sa || !sb) return false;
  if (sa === sb) return true;
  const ca = googleMeetCode(sa);
  const cb = googleMeetCode(sb);
  return Boolean(ca && cb && ca === cb);
}

function scheduledEntryIndicatesJoin(entry: UnifiedScheduledStateEntry): boolean {
  if (entry.joinedAt) return true;
  const s = String(entry.status || "");
  return s === "done" || s === "in_call" || s === "no_transcript";
}

function findScheduledForCalendarMeeting(
  meeting: CalendarMeetingRef,
  scheduled: UnifiedScheduledStateEntry[],
): UnifiedScheduledStateEntry | undefined {
  if (meeting.googleEventId) {
    const byEvent = scheduled.find((s) => s.googleEventId === meeting.googleEventId);
    if (byEvent) return byEvent;
  }
  const keys = new Set(dedupeKeysForMeeting(meeting.meetingUrl, meeting.startTime));
  for (const entry of scheduled) {
    if (entry.dedupeKey && keys.has(entry.dedupeKey)) return entry;
    if (!meetUrlsEquivalent(entry.meetingUrl, meeting.meetingUrl)) continue;
    const meetingMs = Date.parse(meeting.startTime);
    const entryMs = Date.parse(entry.startTime || entry.botJoinAt || "");
    if (!Number.isFinite(meetingMs) || !Number.isFinite(entryMs)) continue;
    const delta = Math.abs(entryMs - meetingMs);
    if (delta <= 15 * 60_000) return entry;
  }
  const titleNorm = meeting.title.trim().toLowerCase();
  const meetingMs = Date.parse(meeting.startTime);
  for (const entry of scheduled) {
    if (String(entry.title || "").trim().toLowerCase() !== titleNorm) continue;
    const entryMs = Date.parse(entry.startTime || entry.botJoinAt || "");
    if (!Number.isFinite(meetingMs) || !Number.isFinite(entryMs)) continue;
    if (Math.abs(entryMs - meetingMs) <= 15 * 60_000) return entry;
  }
  return undefined;
}

function containsSkipKeywords(title: string): boolean {
  const t = title.toLowerCase();
  return ["out of office", "ooo", "lunch", "break", "holiday"].some((k) => t.includes(k));
}

function historicalSkipReason(event: any, meetingUrl: string | null): string | null {
  const status = String(event?.status || "");
  if (status === "cancelled") return "Event is cancelled";
  if (!meetingUrl) return "No meeting URL";
  if (!event?.start?.dateTime) return "Missing start dateTime";
  const eventType = String(event?.eventType || "");
  if (eventType === "outOfOffice" || eventType === "focusTime") return `Skipped eventType ${eventType}`;
  const title = String(event?.summary || "Untitled meeting");
  if (containsSkipKeywords(title)) return "Skipped by title keyword";
  return null;
}

async function loadServiceAccountJwtForSubject(subject: string, scopes: string[]) {
  let parsed: { client_email?: string; private_key?: string };
  const inlineJson = process.env.GOOGLE_DWD_SERVICE_ACCOUNT_JSON?.trim();
  if (inlineJson) {
    try {
      parsed = JSON.parse(inlineJson) as { client_email?: string; private_key?: string };
    } catch {
      throw new Error("Invalid GOOGLE_DWD_SERVICE_ACCOUNT_JSON (must be valid JSON)");
    }
  } else {
    const credentialsPath = env("GOOGLE_APPLICATION_CREDENTIALS");
    const txt = await fs.readFile(credentialsPath, "utf8");
    parsed = JSON.parse(txt) as { client_email?: string; private_key?: string };
  }

  const clientEmail = parsed.client_email || env("GOOGLE_DWD_SERVICE_ACCOUNT_EMAIL");
  const privateKey = parsed.private_key;
  if (!privateKey) {
    throw new Error("Failed to load private_key from GOOGLE_DWD_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS");
  }
  return new JWT({
    email: clientEmail,
    key: privateKey,
    scopes,
    subject,
  });
}

async function listCalendarEventsForUser(email: string, timeMin: string, timeMax: string): Promise<any[]> {
  const auth = await loadServiceAccountJwtForSubject(email, [
    "https://www.googleapis.com/auth/calendar.events.readonly",
  ]);
  const calendar = google.calendar({ version: "v3", auth });
  const out: any[] = [];
  let pageToken: string | undefined;
  do {
    const r = await calendar.events.list({
      calendarId: "primary",
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      showDeleted: false,
      pageToken,
      maxResults: 250,
    });
    out.push(...(r.data.items ?? []));
    pageToken = r.data.nextPageToken || undefined;
  } while (pageToken);
  return out;
}

async function readScheduledState(): Promise<ScheduledState> {
  if (unifiedScheduledStateUsesS3()) {
    try {
      const fromS3 = await readUnifiedScheduledStateFromS3();
      return { scheduled: fromS3.scheduled };
    } catch {
      // fall through
    }
  }
  const configured = process.env.ALYSON_SCHEDULED_STATE_PATH?.trim();
  const file =
    configured ||
    (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
      ? path.join(process.env.TMPDIR?.trim() || "/tmp", "alyson_scheduled_state.json")
      : path.resolve(process.cwd(), "alyson_scheduled_state.json"));
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as ScheduledState;
    return { scheduled: Array.isArray(parsed?.scheduled) ? parsed.scheduled : [] };
  } catch {
    return { scheduled: [] };
  }
}

function formatWaitingRoom(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

/** Matches recall-bot-config automatic_leave waiting_room_timeout / noone_joined_timeout. */
const RECALL_BOT_WAIT_MINUTES = 20;

function isHostSideJoinTimeout(bot: BotJoinReportRow | undefined): boolean {
  if (!bot || bot.joinedMeeting) return false;
  const sub = String(bot.fatalSubCode || "").toLowerCase();
  if (
    sub.includes("waiting_room") ||
    sub.includes("noone") ||
    sub.includes("no_one") ||
    sub.includes("nobody")
  ) {
    return true;
  }
  if (bot.stuckInWaitingRoom) return true;
  if (bot.waitingRoomEnteredAt && !bot.joinedMeeting) return true;
  if (
    bot.joiningCallAt &&
    !bot.admittedAt &&
    (bot.finalStatus === "fatal" || bot.finalStatus === "call_ended")
  ) {
    return true;
  }
  if ((bot.waitingRoomSeconds ?? 0) >= 15 * 60) return true;
  return false;
}

function buildMissedMeetingDetail(
  meeting: CalendarMeetingRef,
  bot: BotJoinReportRow | undefined,
  sched: UnifiedScheduledStateEntry | undefined,
): MissedMeetingDetail {
  const botAttempted = Boolean(
    bot?.joiningCallAt ||
      bot?.waitingRoomEnteredAt ||
      bot?.botId ||
      sched?.recallBotId,
  );
  const hostSideTimeout = isHostSideJoinTimeout(bot);

  let outcomeLabel: string;
  if (hostSideTimeout) {
    const waitNote =
      bot?.waitingRoomLabel && bot.waitingRoomLabel !== "—"
        ? ` (waited ${bot.waitingRoomLabel})`
        : "";
    outcomeLabel =
      `Bot waited up to ${RECALL_BOT_WAIT_MINUTES} min${waitNote} — ` +
      "meeting not started or host did not admit the bot (host-side, not a bot failure)";
  } else if (bot?.joiningCallAt && !bot.joinedMeeting) {
    outcomeLabel = `Bot attempted to join (${bot.finalStatus}) — not admitted to the call`;
  } else if (bot?.recallFetchError) {
    outcomeLabel = `Bot scheduled — ${bot.recallFetchError}`;
  } else if (bot || sched) {
    outcomeLabel = `Bot scheduled — no successful join (${bot?.finalStatus || sched?.status || "unknown"})`;
  } else {
    outcomeLabel = "No bot was scheduled for this meeting";
  }

  return {
    ...meeting,
    botId: bot?.botId || (sched ? String(sched.recallBotId) : null),
    botAttempted,
    hostSideTimeout,
    outcomeLabel,
    waitingRoomLabel: bot?.waitingRoomLabel ?? null,
    finalStatus: bot?.finalStatus ?? null,
    fatalSubCode: bot?.fatalSubCode ?? null,
  };
}

function daysBetweenInclusive(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${start}T12:00:00Z`);
  const endMs = new Date(`${end}T12:00:00Z`).getTime();
  while (cur.getTime() <= endMs) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function buildDailySeries(args: {
  start: string;
  end: string;
  eligibleMeetings: CalendarMeetingRef[];
  joinedMeetings: BotJoinReportRow[];
  missedMeetings: CalendarMeetingRef[];
}): BotJoinDailyPoint[] {
  const days = daysBetweenInclusive(args.start, args.end);
  const eligibleByDay = new Map<string, number>();
  const joinedByDay = new Map<string, number>();
  const missedByDay = new Map<string, number>();
  const lateByDay = new Map<string, number[]>();

  for (const day of days) {
    eligibleByDay.set(day, 0);
    joinedByDay.set(day, 0);
    missedByDay.set(day, 0);
    lateByDay.set(day, []);
  }

  for (const m of args.eligibleMeetings) {
    const day = eventDay(m.startTime);
    if (day) eligibleByDay.set(day, (eligibleByDay.get(day) ?? 0) + 1);
  }

  for (const m of args.missedMeetings) {
    const day = eventDay(m.startTime);
    if (day) missedByDay.set(day, (missedByDay.get(day) ?? 0) + 1);
  }

  for (const row of args.joinedMeetings) {
    const day = eventDay(row.meetingStartAt || row.scheduledStart || "");
    if (!day) continue;
    joinedByDay.set(day, (joinedByDay.get(day) ?? 0) + 1);
    if (row.lateMinutes != null) {
      lateByDay.get(day)?.push(row.lateMinutes);
    }
  }

  return days.map((day) => {
    const eligible = eligibleByDay.get(day) ?? 0;
    const joined = joinedByDay.get(day) ?? 0;
    const missed = missedByDay.get(day) ?? 0;
    const lates = lateByDay.get(day) ?? [];
    return {
      day,
      eligibleMeetings: eligible,
      meetingsJoined: joined,
      meetingsMissed: missed,
      joinRatePercent:
        eligible > 0
          ? Math.min(100, Math.round((Math.min(joined, eligible) / eligible) * 1000) / 10)
          : null,
      avgLateMinutes:
        lates.length > 0
          ? Math.round((lates.reduce((a, b) => a + b, 0) / lates.length) * 10) / 10
          : null,
      maxLateMinutes: lates.length > 0 ? Math.max(...lates) : null,
    };
  });
}

type BotCandidate = {
  botId: string;
  title: string;
  meetingUrl: string | null;
  scheduledStart: string | null;
  calendarUserEmail: string;
  googleEventId?: string;
  dedupeKey?: string;
  source: BotJoinReportRow["source"];
  creationSource?: string;
  scheduledAt?: string;
  botJoinAt?: string;
};

function meetingDedupeKeyRaw(meetingUrl: string, startTime: string): string {
  return `${String(meetingUrl).trim()}|${String(startTime).trim()}`;
}

function dedupeKeysForMeeting(meetingUrl: string, startTime: string): string[] {
  return [...new Set([meetingDedupeKey(meetingUrl, startTime), meetingDedupeKeyRaw(meetingUrl, startTime)])];
}

function buildEligibleKeySet(meetings: CalendarMeetingRef[]): Set<string> {
  const keys = new Set<string>();
  for (const meeting of meetings) {
    for (const key of dedupeKeysForMeeting(meeting.meetingUrl, meeting.startTime)) {
      keys.add(key);
    }
  }
  return keys;
}

/** Match bot rows to report calendar meetings by URL + start (not calendarUserEmail). */
function candidateMatchesEligibleMeeting(
  meetingUrl: string | null | undefined,
  scheduledStart: string | null | undefined,
  eligibleMeetings: CalendarMeetingRef[],
  eligibleKeys: Set<string>,
): boolean {
  const url = String(meetingUrl || "").trim();
  const start = String(scheduledStart || "").trim();
  if (!url || !start) return false;

  for (const key of dedupeKeysForMeeting(url, start)) {
    if (eligibleKeys.has(key)) return true;
  }

  const startMs = Date.parse(start);
  if (!Number.isFinite(startMs)) return false;
  for (const meeting of eligibleMeetings) {
    if (!meetUrlsEquivalent(meeting.meetingUrl, url)) continue;
    const meetingMs = Date.parse(meeting.startTime);
    if (!Number.isFinite(meetingMs)) continue;
    const delta = startMs - meetingMs;
    // Exact start match, or bot join_at ~2m early (up to 30m before / 15m after scheduled start).
    if (Math.abs(delta) <= 60_000 || (delta >= -30 * 60_000 && delta <= 15 * 60_000)) return true;
  }
  return false;
}

function resolveBotCalendarEmail(
  botId: string,
  stateByBot: Map<string, UnifiedScheduledStateEntry>,
): string | null {
  const email = String(stateByBot.get(botId)?.calendarUserEmail || "").trim().toLowerCase();
  return email || null;
}

function botBelongsToAccount(
  botId: string,
  allowedEmails: Set<string>,
  stateByBot: Map<string, UnifiedScheduledStateEntry>,
): boolean {
  const email = resolveBotCalendarEmail(botId, stateByBot);
  return email !== null && allowedEmails.has(email);
}

async function collectBotCandidates(
  calendarEmail: string,
  start: string,
  end: string,
  windowHours?: number,
  floorMs?: number,
  eligibleMeetings: CalendarMeetingRef[] = [],
): Promise<{ candidates: BotCandidate[]; diagnostics: BotJoinReportDiagnostics }> {
  const normalizedEmail = calendarEmail.trim().toLowerCase();
  const allowedEmails = new Set([normalizedEmail]);
  const warnings: string[] = [];
  const scopeByEligibleMeetings = eligibleMeetings.length > 0;
  const eligibleKeys = buildEligibleKeySet(eligibleMeetings);

  const matchesReportScope = (
    meetingUrl: string | null | undefined,
    scheduledStart: string | null | undefined,
    botId: string,
    stateByBot: Map<string, UnifiedScheduledStateEntry>,
  ): boolean => {
    if (scopeByEligibleMeetings) {
      return candidateMatchesEligibleMeeting(meetingUrl, scheduledStart, eligibleMeetings, eligibleKeys);
    }
    return botBelongsToAccount(botId, allowedEmails, stateByBot);
  };

  let recallCalendarIds = new Set<string>();
  try {
    const calState = await readRecallCalendarState();
    for (const conn of calState.connections) {
      if (scopeByEligibleMeetings || allowedEmails.has(conn.email.trim().toLowerCase())) {
        recallCalendarIds.add(conn.recallCalendarId);
      }
    }
  } catch (e) {
    warnings.push(`Recall calendar state: ${e instanceof Error ? e.message : String(e)}`);
  }

  const byBotId = new Map<string, BotCandidate>();
  let botsFromNotetakerSessions = 0;
  let botsFromUnifiedState = 0;
  let botsFromS3Index = 0;
  let botsFromRecallCalendar = 0;

  let stateByBot = new Map<string, UnifiedScheduledStateEntry>();
  let scheduledRows: UnifiedScheduledStateEntry[] = [];
  try {
    const state = await readScheduledState();
    scheduledRows = state.scheduled;
    stateByBot = new Map(scheduledRows.map((row) => [String(row.recallBotId), row]));
  } catch (e) {
    warnings.push(`Unified schedule state: ${e instanceof Error ? e.message : String(e)}`);
  }

  const addCandidate = (candidate: BotCandidate, bucket: keyof Omit<BotJoinReportDiagnostics, "warnings">) => {
    const botId = String(candidate.botId || "").trim();
    if (!botId) return;
    const isNew = !byBotId.has(botId);
    if (isNew) {
      if (bucket === "botsFromNotetakerSessions") botsFromNotetakerSessions += 1;
      if (bucket === "botsFromUnifiedState") botsFromUnifiedState += 1;
      if (bucket === "botsFromS3Index") botsFromS3Index += 1;
      if (bucket === "botsFromRecallCalendar") botsFromRecallCalendar += 1;
    }
    const prev = byBotId.get(botId);
    byBotId.set(botId, { ...prev, ...candidate, botId });
  };

  try {
    const { sessions } = await buildNotetakerSessionsList();
    for (const s of sessions) {
      const botId = String(s.botId || "").trim();
      if (!botId) continue;
      const row = stateByBot.get(botId);
      const meetingUrl = row?.meetingUrl || s.meetingUrl || null;
      const scheduledStart = row?.startTime || row?.botJoinAt || row?.scheduledAt || s.createdAt || null;
      const anchor = String(scheduledStart || "").trim();
      if (anchor && !inReportWindow(anchor, start, end, windowHours, floorMs)) continue;
      if (!matchesReportScope(meetingUrl, scheduledStart, botId, stateByBot)) continue;
      const rowEmail = resolveBotCalendarEmail(botId, stateByBot) || normalizedEmail;
      addCandidate(
        {
          botId,
          title: String(row?.title || s.title || "Meeting").trim() || "Meeting",
          meetingUrl,
          scheduledStart: scheduledStart || null,
          calendarUserEmail: rowEmail,
          source: "notetaker_session",
        },
        "botsFromNotetakerSessions",
      );
    }
  } catch (e) {
    warnings.push(`Notetaker sessions: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    for (const row of scheduledRows) {
      const botId = String(row.recallBotId || "").trim();
      if (!botId || isReservingBotId(botId)) continue;
      const meetingUrl = row.meetingUrl || null;
      const scheduledStart = row.startTime || row.botJoinAt || row.scheduledAt || null;
      const anchor = String(scheduledStart || "").trim();
      if (anchor && !inReportWindow(anchor, start, end, windowHours, floorMs)) continue;
      if (!matchesReportScope(meetingUrl, scheduledStart, botId, stateByBot)) continue;

      const rowEmail = String(row.calendarUserEmail || "").trim().toLowerCase() || normalizedEmail;
      addCandidate(
        {
          botId,
          title: String(row.title || "Meeting").trim() || "Meeting",
          meetingUrl,
          scheduledStart,
          calendarUserEmail: rowEmail,
          googleEventId: row.googleEventId,
          dedupeKey:
            meetingUrl && scheduledStart ? meetingDedupeKey(meetingUrl, scheduledStart) : undefined,
          source: "unified_scheduled",
          creationSource: row.creationSource,
          scheduledAt: row.scheduledAt,
          botJoinAt: row.botJoinAt,
        },
        "botsFromUnifiedState",
      );
    }
  } catch (e) {
    warnings.push(`Unified schedule rows: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (recallCalendarIds.size > 0 && recallConfigured()) {
    const updatedAtGte = new Date(`${start}T00:00:00.000Z`).getTime() - 7 * 86400000;
    for (const calendarId of recallCalendarIds) {
      try {
        const events = await listAllRecallCalendarEvents({
          calendarId,
          updatedAtGte: new Date(updatedAtGte).toISOString(),
        });
        for (const event of events) {
          if (!inReportWindow(event.start_time, start, end, windowHours, floorMs)) continue;
          const botId = String(event.bots?.[0]?.bot_id || "").trim();
          if (!botId) continue;
          const meetingUrl = String(event.meeting_url || "").trim() || null;
          if (!matchesReportScope(meetingUrl, event.start_time, botId, stateByBot)) continue;
          addCandidate(
            {
              botId,
              title: eventTitleFromRaw(event),
              meetingUrl,
              scheduledStart: event.start_time,
              calendarUserEmail: normalizedEmail,
              dedupeKey: meetingUrl ? meetingDedupeKey(meetingUrl, event.start_time) : undefined,
              source: "recall_calendar",
              creationSource: "recall_calendar_v2",
            },
            "botsFromRecallCalendar",
          );
        }
      } catch (e) {
        warnings.push(`Recall calendar ${calendarId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  try {
    const docs = await listAllBotIndexDocs();
    for (const doc of docs) {
      const botId = String(doc.botId || "").trim();
      if (!botId) continue;
      const row = stateByBot.get(botId);
      const meetingUrl = row?.meetingUrl || null;
      const scheduledStart = row?.startTime || row?.botJoinAt || null;
      const anchor = String(scheduledStart || row?.scheduledAt || doc.finalizedAt || doc.cronFinalizedAt || "").trim();
      const prefixDay = String(doc.prefix || "").split("_").slice(-2, -1)[0];
      const day = eventDay(anchor) || (/^\d{4}-\d{2}-\d{2}$/.test(prefixDay) ? prefixDay : null);
      const anchorIso = anchor || (day ? `${day}T12:00:00.000Z` : null);
      if (!inReportWindow(anchorIso, start, end, windowHours, floorMs)) continue;
      if (!matchesReportScope(meetingUrl, scheduledStart || anchorIso, botId, stateByBot)) continue;
      const rowEmail = resolveBotCalendarEmail(botId, stateByBot) || normalizedEmail;

      addCandidate(
        {
          botId,
          title: String(row?.title || doc.title || "Meeting").trim() || "Meeting",
          meetingUrl,
          scheduledStart: scheduledStart || anchor || null,
          calendarUserEmail: rowEmail,
          source: "s3_index",
        },
        "botsFromS3Index",
      );
    }
  } catch (e) {
    warnings.push(`S3 bot index: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (scopeByEligibleMeetings && recallConfigured()) {
    const joinAtAfter = floorMs
      ? new Date(floorMs).toISOString()
      : `${start}T00:00:00.000Z`;
    const joinAtBefore = new Date().toISOString();
    try {
      const listed = await listRecallBotsInJoinRange({ joinAtAfter, joinAtBefore });
      for (const bot of listed) {
        const lifecycle = parseRecallBotLifecycle("", bot);
        const botId = String(lifecycle.botId || "").trim();
        if (!botId || byBotId.has(botId)) continue;
        const meetingUrl = lifecycle.meetingUrl || null;
        const scheduledStart = lifecycle.joinAt || null;
        if (!matchesReportScope(meetingUrl, scheduledStart, botId, stateByBot)) continue;
        addCandidate(
          {
            botId,
            title: lifecycle.botName || "Meeting",
            meetingUrl,
            scheduledStart,
            calendarUserEmail: resolveBotCalendarEmail(botId, stateByBot) || normalizedEmail,
            source: "unknown",
            botJoinAt: lifecycle.joinAt,
          },
          "botsFromRecallCalendar",
        );
      }
    } catch (e) {
      warnings.push(`Recall list bots: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const candidates = [...byBotId.values()].sort(
    (a, b) => Date.parse(b.scheduledStart || b.botJoinAt || "") - Date.parse(a.scheduledStart || a.botJoinAt || ""),
  );

  if (candidates.length === 0) {
    if (scopeByEligibleMeetings) {
      warnings.push(
        `No bots matched ${eligibleMeetings.length} eligible meeting(s) on ${normalizedEmail}'s calendar in this period.`,
      );
    } else {
      warnings.push(
        "No bots found in this date range. Schedule meetings from Unified Meetings, or widen the period (Last 60 days).",
      );
    }
  }

  return {
    candidates,
    diagnostics: {
      botsFromNotetakerSessions,
      botsFromUnifiedState,
      botsFromS3Index,
      botsFromRecallCalendar,
      warnings,
    },
  };
}

async function listEligibleCalendarMeetings(
  calendarEmail: string,
  start: string,
  end: string,
  windowHours?: number,
  floorMs?: number,
): Promise<CalendarMeetingRef[]> {
  const timeMin = windowHours
    ? new Date(floorMs ?? Date.now() - windowHours * 3600_000).toISOString()
    : `${start}T00:00:00.000Z`;
  const timeMax = windowHours ? new Date().toISOString() : `${end}T23:59:59.999Z`;
  const events = await listCalendarEventsForUser(calendarEmail, timeMin, timeMax);
  const out: CalendarMeetingRef[] = [];

  for (const event of events) {
    const startTime = String(event?.start?.dateTime || "");
    if (!inReportWindow(startTime, start, end, windowHours, floorMs)) continue;
    const meetingUrl = getMeetingUrl(event);
    if (historicalSkipReason(event, meetingUrl)) continue;
    if (!meetingUrl) continue;

    out.push({
      googleEventId: String(event?.id || ""),
      title: String(event?.summary || "Untitled meeting").trim() || "Untitled meeting",
      startTime,
      endTime: event?.end?.dateTime ? String(event.end.dateTime) : null,
      meetingUrl,
      dedupeKey: meetingDedupeKey(meetingUrl, startTime),
    });
  }

  out.sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
  return out;
}

function findBotForMeeting(
  meeting: CalendarMeetingRef,
  rows: BotJoinReportRow[],
): BotJoinReportRow | undefined {
  const keys = new Set(dedupeKeysForMeeting(meeting.meetingUrl, meeting.startTime));
  const byKey = rows.find((r) => {
    if (!r.meetingUrl || !r.scheduledStart) return false;
    return keys.has(meetingDedupeKey(r.meetingUrl, r.scheduledStart)) ||
      keys.has(meetingDedupeKeyRaw(r.meetingUrl, r.scheduledStart));
  });
  if (byKey) return byKey;

  const startMs = Date.parse(meeting.startTime);
  return rows.find((r) => {
    if (!r.meetingUrl || !meetUrlsEquivalent(r.meetingUrl, meeting.meetingUrl)) return false;
    const candidateStart = r.scheduledStart || r.meetingStartAt || r.botJoinAt;
    if (!candidateStart) return false;
    const candidateMs = Date.parse(candidateStart);
    if (!Number.isFinite(candidateMs)) return false;
    const delta = candidateMs - startMs;
    return Math.abs(delta) <= 60_000 || (delta >= -30 * 60_000 && delta <= 15 * 60_000);
  });
}

export async function buildBotJoinReport(args: {
  start: string;
  end: string;
  calendarEmail?: string;
  forceRefresh?: boolean;
  windowHours?: number;
}): Promise<BotJoinReport> {
  const calendarEmail = (args.calendarEmail || DEFAULT_BOT_JOIN_REPORT_EMAIL).trim().toLowerCase();
  const windowHours = args.windowHours;
  const rolling = windowHours ? rollingWindowBounds(windowHours) : null;
  const cacheKey = reportCacheKey(calendarEmail, args.start, args.end, windowHours);
  if (!args.forceRefresh) {
    const hit = reportCache.get(cacheKey);
    if (hit && Date.now() - hit.at < REPORT_CACHE_TTL_MS) {
      return hit.report;
    }
  }

  let calendarAvailable = false;
  let calendarError: string | undefined;
  let eligibleMeetings: CalendarMeetingRef[] = [];

  if (dwdConfigured()) {
    try {
      env("GOOGLE_WORKSPACE_ADMIN_SUBJECT_EMAIL");
      eligibleMeetings = await listEligibleCalendarMeetings(
        calendarEmail,
        args.start,
        args.end,
        windowHours,
        rolling?.floorMs,
      );
      calendarAvailable = true;
    } catch (e) {
      calendarError = e instanceof Error ? e.message : String(e);
    }
  } else {
    calendarError = "Google DWD credentials not configured";
  }

  const { candidates, diagnostics } = await collectBotCandidates(
    calendarEmail,
    args.start,
    args.end,
    windowHours,
    rolling?.floorMs,
    calendarAvailable ? eligibleMeetings : [],
  );

  const recallOk = recallConfigured();
  const joinAtAfter = rolling?.windowStart ?? `${args.start}T00:00:00.000Z`;
  const joinAtBefore = rolling?.windowEnd ?? `${args.end}T23:59:59.999Z`;
  const lifecycleResult = recallOk
    ? await fetchRecallBotLifecycles(candidates.map((c) => c.botId), {
        joinAtAfter,
        joinAtBefore,
      })
    : { lifecycles: new Map(), skippedIndividualFetch: 0, fromListApi: 0, fromCache: 0 };
  const lifecycles = lifecycleResult.lifecycles;

  if (lifecycleResult.skippedIndividualFetch > 0) {
    diagnostics.warnings.push(
      `${lifecycleResult.skippedIndividualFetch} bot(s) skipped individual Recall fetch (rate-limit protection). Cached/list: ${lifecycleResult.fromCache + lifecycleResult.fromListApi}. Retry in ~10 min.`,
    );
  }
  diagnostics.recallBotsFromListApi = lifecycleResult.fromListApi;
  diagnostics.recallBotsFromCache = lifecycleResult.fromCache;
  diagnostics.recallBotsSkippedFetch = lifecycleResult.skippedIndividualFetch;

  const rows: BotJoinReportRow[] = candidates.map((c) => {
    const life = lifecycles.get(c.botId);
    const joinedMeeting = Boolean(life?.joinedMeeting);
    const stuckInWaitingRoom = Boolean(life?.stuckInWaitingRoom);
    const finalStatus = life?.finalStatusCode ?? (recallOk ? "no_data" : "recall_not_configured");
    const admittedAt = life?.admittedAt ?? null;
    const joiningCallAt = life?.joiningCallAt ?? null;
    const botJoinAt = c.botJoinAt || life?.joinAt;

    const { meetingStartAt, reliable } = resolveMeetingStartForCandidate({
      meetingUrl: c.meetingUrl || life?.meetingUrl || null,
      scheduledStart: c.scheduledStart,
      source: c.source,
      botJoinAt,
      admittedAt,
      joiningCallAt,
      eligibleMeetings,
    });

    const timing = computeAdmissionTiming({
      meetingStartAt,
      meetingStartReliable: reliable,
      admittedAt,
      joiningCallAt,
      joinedMeeting,
    });

    return {
      botId: c.botId,
      title: c.title,
      meetingUrl: c.meetingUrl || life?.meetingUrl || null,
      scheduledStart: meetingStartAt || c.scheduledStart,
      meetingStartAt: timing.meetingStartAt,
      meetingStartReliable: timing.meetingStartReliable,
      calendarUserEmail: c.calendarUserEmail,
      googleEventId: c.googleEventId,
      source: c.source,
      creationSource: c.creationSource,
      scheduledAt: c.scheduledAt,
      botJoinAt,
      joiningCallAt,
      waitingRoomEnteredAt: life?.waitingRoomEnteredAt ?? null,
      admittedAt,
      waitingRoomSeconds: life?.waitingRoomSeconds ?? null,
      waitingRoomLabel: formatWaitingRoom(life?.waitingRoomSeconds ?? null),
      lateToStartSeconds: timing.lateToStartSeconds,
      lateToStartLabel: timing.lateToStartLabel,
      lateMinutes: timing.lateMinutes,
      finalStatus,
      joinedMeeting,
      stuckInWaitingRoom,
      fatalSubCode: life?.fatalSubCode ?? null,
      recallFetchError: life?.fetchError,
    };
  });

  let scheduledEntries: UnifiedScheduledStateEntry[] = [];
  try {
    if (unifiedScheduledStateUsesS3()) {
      scheduledEntries = (await readUnifiedScheduledStateFromS3()).scheduled;
    }
  } catch {
    // best-effort — Recall rows still usable without schedule index
  }
  const scheduledByBotId = new Map(
    scheduledEntries.map((s) => [String(s.recallBotId), s]),
  );

  let botIndexByBotId = new Map<string, { lineCount?: number; transcriptKey?: string }>();
  try {
    const docs = await listAllBotIndexDocs();
    botIndexByBotId = new Map(docs.map((d) => [String(d.botId), d]));
  } catch {
    // ignore
  }

  for (const row of rows) {
    const sched = scheduledByBotId.get(row.botId);
    const idx = botIndexByBotId.get(row.botId);
    const joinedFromSchedule = sched ? scheduledEntryIndicatesJoin(sched) : false;
    const joinedFromS3 = Boolean(idx && ((idx.lineCount ?? 0) > 0 || idx.transcriptKey));
    if (joinedFromSchedule || joinedFromS3) {
      row.joinedMeeting = true;
      row.stuckInWaitingRoom = false;
    }
  }

  const joinedMeetings: BotJoinReportRow[] = [];
  const missedMeetings: MissedMeetingDetail[] = [];

  if (calendarAvailable) {
    for (const meeting of eligibleMeetings) {
      const bot = findBotForMeeting(meeting, rows);
      const sched = findScheduledForCalendarMeeting(meeting, scheduledEntries);
      const idx = sched ? botIndexByBotId.get(String(sched.recallBotId)) : undefined;
      const joinedFromSchedule = sched ? scheduledEntryIndicatesJoin(sched) : false;
      const joinedFromS3 = Boolean(idx && ((idx.lineCount ?? 0) > 0 || idx.transcriptKey));
      const joined = Boolean(bot?.joinedMeeting) || joinedFromSchedule || joinedFromS3;

      if (joined) {
        const base: BotJoinReportRow =
          bot ??
          ({
            botId: String(sched!.recallBotId),
            title: meeting.title,
            meetingUrl: meeting.meetingUrl,
            scheduledStart: meeting.startTime,
            meetingStartAt: meeting.startTime,
            meetingStartReliable: true,
            calendarUserEmail: sched!.calendarUserEmail,
            googleEventId: meeting.googleEventId,
            source: "unified_scheduled",
            joiningCallAt: null,
            waitingRoomEnteredAt: null,
            admittedAt: sched!.joinedAt ?? null,
            waitingRoomSeconds: null,
            waitingRoomLabel: "—",
            lateToStartSeconds: null,
            lateToStartLabel: "—",
            lateMinutes: null,
            finalStatus: String(sched!.status || "done"),
            joinedMeeting: true,
            stuckInWaitingRoom: false,
            fatalSubCode: null,
          } as BotJoinReportRow);
        joinedMeetings.push(
          applyAdmissionTimingToRow(
            {
              ...base,
              joinedMeeting: true,
              stuckInWaitingRoom: false,
              title: meeting.title,
              meetingUrl: meeting.meetingUrl,
              googleEventId: meeting.googleEventId,
              scheduledStart: meeting.startTime,
              meetingStartAt: meeting.startTime,
              meetingStartReliable: true,
            },
            eligibleMeetings,
          ),
        );
      } else {
        missedMeetings.push(buildMissedMeetingDetail(meeting, bot, sched));
      }
    }
  }

  joinedMeetings.sort(
    (a, b) => Date.parse(b.scheduledStart || "") - Date.parse(a.scheduledStart || ""),
  );

  const eligibleKeys = calendarAvailable ? buildEligibleKeySet(eligibleMeetings) : null;
  const scopedRows = calendarAvailable
    ? rows.filter((r) =>
        candidateMatchesEligibleMeeting(
          r.meetingUrl,
          r.meetingStartAt || r.scheduledStart,
          eligibleMeetings,
          eligibleKeys!,
        ),
      )
    : rows.filter((r) => r.calendarUserEmail.trim().toLowerCase() === calendarEmail);
  const accountRows = scopedRows;
  const joinedFromBots = accountRows.filter((r) => r.joinedMeeting);

  const meetingsJoined = calendarAvailable ? joinedMeetings.length : joinedFromBots.length;
  const totalEligibleMeetings = calendarAvailable ? eligibleMeetings.length : accountRows.length;
  const meetingsMissed = calendarAvailable
    ? missedMeetings.length
    : Math.max(0, accountRows.length - joinedFromBots.length);

  const lateMinutesList = joinedMeetings
    .map((r) => r.lateMinutes)
    .filter((n): n is number => n != null && Number.isFinite(n));
  const lateSecondsList = joinedMeetings
    .map((r) => r.lateToStartSeconds)
    .filter((n): n is number => n != null && n > LATE_GRACE_SECONDS);

  const critical: BotJoinCriticalMetrics = {
    totalEligibleMeetings,
    meetingsJoined,
    meetingsMissed,
    joinRatePercent:
      totalEligibleMeetings > 0
        ? Math.min(
            100,
            Math.round(
              (Math.min(meetingsJoined, totalEligibleMeetings) / totalEligibleMeetings) * 1000,
            ) / 10,
          )
        : null,
    avgLateMinutes:
      lateMinutesList.length > 0
        ? Math.round((lateMinutesList.reduce((a, b) => a + b, 0) / lateMinutesList.length) * 10) / 10
        : null,
    maxLateMinutes:
      lateMinutesList.length > 0 ? Math.max(...lateMinutesList) : null,
    meetingsJoinedLate: lateSecondsList.length,
    stuckInWaitingRoom: accountRows.filter((r) => r.stuckInWaitingRoom).length,
    failedJoins: accountRows.filter((r) => r.finalStatus === "fatal").length,
    scheduledNotJoined: accountRows.filter(
      (r) => !r.joinedMeeting && !r.stuckInWaitingRoom && r.finalStatus !== "fatal",
    ).length,
  };

  const daily = buildDailySeries({
    start: args.start,
    end: args.end,
    eligibleMeetings,
    joinedMeetings,
    missedMeetings,
  });

  const report: BotJoinReport = {
    range: {
      start: args.start,
      end: args.end,
      ...(windowHours
        ? {
            windowHours,
            windowStart: rolling!.windowStart,
            windowEnd: rolling!.windowEnd,
          }
        : {}),
    },
    calendarEmail,
    generatedAt: new Date().toISOString(),
    recallConfigured: recallOk,
    calendarAvailable,
    calendarError,
    diagnostics,
    critical,
    joinedMeetings,
    missedMeetings,
    daily,
    rows: scopedRows,
  };

  reportCache.set(cacheKey, { at: Date.now(), report });
  return report;
}
