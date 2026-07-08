/**
 * Canonical meeting schedule for calendar + meeting list.
 *
 * Rules (intentionally strict — no cross-meeting title guessing):
 * 1. Leading DDMMYYYY in title/prefix wins (e.g. 08072026 … → 2026-07-08).
 * 2. Otherwise use THIS meeting's own S3 folder date.
 * 3. Session createdAt may refine time, but cannot move the day earlier/later than
 *    the folder day unless it matches the folder day.
 * 4. Never remap "test"/"rev"/etc. onto some other meeting's older folder.
 */

export function parseLeadingDdMmYyyy(text: string): string | null {
  const m = String(text || "")
    .trim()
    .match(/^(\d{2})(\d{2})(\d{4})\b/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const day = `${yyyy}-${mm}-${dd}`;
  if (!Number.isFinite(Date.parse(`${day}T12:00:00Z`))) return null;
  const month = Number(mm);
  const date = Number(dd);
  if (month < 1 || month > 12 || date < 1 || date > 31) return null;
  return day;
}

export function parseS3MeetingPrefix(prefix: string) {
  const parts = prefix.split("_");
  const time = parts.pop() || "";
  const folderDate = parts.pop() || "";
  const name = parts.join("_") || "meeting";
  const iso = `${folderDate}T${time.replaceAll("-", ":")}Z`;
  const folderStartedAt = Number.isFinite(Date.parse(iso)) ? iso : null;
  return {
    name,
    displayName: name.replaceAll("-", " "),
    folderDate,
    time,
    folderStartedAt,
  };
}

/** Case/punctuation-insensitive title key for duplicate detection. */
export function normalizeMeetingTitleKey(title: string): string {
  return String(title || "")
    .trim()
    .toLowerCase()
    .replace(/^\d{8}[\s\-_]*/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Only untitled system defaults — never hide real names like "test". */
export function isGenericNormalizedTitle(titleKey: string): boolean {
  return (
    !titleKey ||
    titleKey === "meeting" ||
    titleKey === "live meeting" ||
    titleKey === "untitled meeting" ||
    titleKey === "live unified meeting" ||
    titleKey === "scheduled meeting" ||
    titleKey === "unified meeting"
  );
}

export function isoDayFromTimestamp(iso: string | null | undefined): string | null {
  const raw = String(iso || "").trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

export function resolveMeetingSchedule(args: {
  title: string;
  prefix: string;
  eventAt?: string | null;
}): {
  day: string;
  startedAt: string | null;
  folderDate: string;
  daySource: "title" | "event" | "folder";
} {
  const parsed = parseS3MeetingPrefix(args.prefix);
  const fromTitle = parseLeadingDdMmYyyy(args.title);
  const fromName =
    parseLeadingDdMmYyyy(parsed.displayName) || parseLeadingDdMmYyyy(parsed.name.replaceAll("-", " "));
  const titledDay = fromTitle || fromName;
  const eventDay = isoDayFromTimestamp(args.eventAt);
  const folderDay = /^\d{4}-\d{2}-\d{2}$/.test(parsed.folderDate) ? parsed.folderDate : "";

  let day: string;
  let daySource: "title" | "event" | "folder";

  if (titledDay) {
    day = titledDay;
    daySource = "title";
  } else if (folderDay) {
    // This meeting's folder stamp is authoritative for undated titles ("test", "Rev", …).
    day = folderDay;
    daySource = "folder";
  } else if (eventDay) {
    day = eventDay;
    daySource = "event";
  } else {
    day = "";
    daySource = "folder";
  }

  let startedAt = parsed.folderStartedAt;
  // Use event time only when it falls on the same resolved day (avoids "finalize now" moving day).
  if (args.eventAt && eventDay && eventDay === day && Number.isFinite(Date.parse(args.eventAt))) {
    startedAt = new Date(args.eventAt).toISOString();
  }
  if (day && parsed.time && daySource === "title" && day !== folderDay) {
    const candidate = `${day}T${parsed.time.replaceAll("-", ":")}Z`;
    if (Number.isFinite(Date.parse(candidate))) startedAt = candidate;
  }

  return { day, startedAt, folderDate: parsed.folderDate, daySource };
}

export type MeetingScheduleRow = {
  prefix: string;
  botId: string | null;
  day: string;
  folderDate: string;
  title: string;
  startedAt?: string | null;
  hasNotes?: boolean;
  hasTranscript?: boolean;
  hasTasks?: boolean;
  isCanonical?: boolean;
  daySource?: "title" | "event" | "folder";
};

function contentScore(row: MeetingScheduleRow): number {
  return (
    (row.hasTranscript ? 4 : 0) +
    (row.hasNotes ? 2 : 0) +
    (row.hasTasks ? 1 : 0) +
    (row.isCanonical ? 8 : 0) +
    (row.daySource === "title" ? 2 : 0)
  );
}

export function pickPreferredMeetingRow<T extends MeetingScheduleRow>(a: T, b: T): T {
  const scoreA = contentScore(a);
  const scoreB = contentScore(b);
  if (scoreA !== scoreB) return scoreA > scoreB ? a : b;

  const aAligned = a.day === a.folderDate;
  const bAligned = b.day === b.folderDate;
  if (aAligned && !bAligned) return a;
  if (bAligned && !aAligned) return b;

  const aStart = a.startedAt || "";
  const bStart = b.startedAt || "";
  if (aStart && bStart && aStart !== bStart) return aStart <= bStart ? a : b;

  return a.prefix <= b.prefix ? a : b;
}

export function dedupeMeetingsByBotId<T extends MeetingScheduleRow>(rows: T[]): T[] {
  const withoutBot: T[] = [];
  const byBot = new Map<string, T>();

  for (const row of rows) {
    const botId = String(row.botId || "").trim();
    if (!botId) {
      withoutBot.push(row);
      continue;
    }
    const prev = byBot.get(botId);
    byBot.set(botId, prev ? pickPreferredMeetingRow(prev, row) : row);
  }

  return [...withoutBot, ...byBot.values()];
}

/**
 * Collapse only near-duplicates: same day + same title (case-insensitive) +
 * started within 15 minutes. Separate "test" meetings hours apart are kept.
 */
export function dedupeMeetingsByTitleDay<T extends MeetingScheduleRow>(rows: T[]): T[] {
  const NEAR_MS = 15 * 60_000;
  const kept: T[] = [];

  const sorted = [...rows].sort((a, b) => (a.startedAt || a.day).localeCompare(b.startedAt || b.day));

  for (const row of sorted) {
    const titleKey = normalizeMeetingTitleKey(row.title) || "meeting";
    const rowMs = Date.parse(String(row.startedAt || ""));
    let merged = false;

    for (let i = 0; i < kept.length; i++) {
      const prev = kept[i]!;
      if (prev.day !== row.day) continue;
      const prevKey = normalizeMeetingTitleKey(prev.title) || "meeting";
      if (prevKey !== titleKey) continue;

      const prevMs = Date.parse(String(prev.startedAt || ""));
      const close =
        Number.isFinite(prevMs) && Number.isFinite(rowMs)
          ? Math.abs(prevMs - rowMs) <= NEAR_MS
          : !row.startedAt || !prev.startedAt;

      if (close) {
        kept[i] = pickPreferredMeetingRow(prev, row);
        merged = true;
        break;
      }
    }

    if (!merged) kept.push(row);
  }

  return kept;
}

/** Drop only untitled system defaults — keep "test", "Rev", named meetings. */
export function filterGenericMeetingClutter<T extends MeetingScheduleRow>(rows: T[]): T[] {
  return rows.filter((row) => !isGenericNormalizedTitle(normalizeMeetingTitleKey(row.title)));
}
