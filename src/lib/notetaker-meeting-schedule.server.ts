/**
 * Canonical meeting day/time for S3 calendar + meeting list.
 *
 * Prefer: title DDMMYYYY → earliest historical folder → session start → folder stamp.
 * Re-persists often rewrite folder/finalize stamps to "today"; those must not win.
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
  /** Oldest S3 folder date seen for this normalized title (non-generic). */
  earliestFolderDay?: string | null;
}): {
  day: string;
  startedAt: string | null;
  folderDate: string;
  daySource: "title" | "history" | "event" | "folder";
} {
  const parsed = parseS3MeetingPrefix(args.prefix);
  const fromTitle = parseLeadingDdMmYyyy(args.title);
  const fromName =
    parseLeadingDdMmYyyy(parsed.displayName) || parseLeadingDdMmYyyy(parsed.name.replaceAll("-", " "));
  const titledDay = fromTitle || fromName;
  const eventDay = isoDayFromTimestamp(args.eventAt);
  const historyDay =
    args.earliestFolderDay && /^\d{4}-\d{2}-\d{2}$/.test(args.earliestFolderDay)
      ? args.earliestFolderDay
      : null;

  // Title date always wins. Then older historical folder beats corrupted "today" event/folder stamps.
  let day = titledDay || null;
  let daySource: "title" | "history" | "event" | "folder" = "folder";

  if (titledDay) {
    day = titledDay;
    daySource = "title";
  } else if (historyDay && (!parsed.folderDate || historyDay < parsed.folderDate)) {
    day = historyDay;
    daySource = "history";
  } else if (historyDay && eventDay && historyDay < eventDay) {
    day = historyDay;
    daySource = "history";
  } else if (eventDay && parsed.folderDate && eventDay > parsed.folderDate) {
    // Sessions index / finalize stamp rewrote "now" — trust older folder.
    day = parsed.folderDate;
    daySource = "folder";
  } else if (eventDay) {
    day = eventDay;
    daySource = "event";
  } else {
    day = parsed.folderDate;
    daySource = "folder";
  }

  let startedAt = parsed.folderStartedAt;
  if (args.eventAt && Number.isFinite(Date.parse(args.eventAt)) && daySource === "event") {
    startedAt = new Date(args.eventAt).toISOString();
  }
  if (day && parsed.time && (daySource === "title" || daySource === "history")) {
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
  daySource?: "title" | "history" | "event" | "folder";
};

function contentScore(row: MeetingScheduleRow): number {
  return (
    (row.hasTranscript ? 4 : 0) +
    (row.hasNotes ? 2 : 0) +
    (row.hasTasks ? 1 : 0) +
    (row.isCanonical ? 8 : 0) +
    (row.daySource === "title" ? 3 : row.daySource === "history" ? 2 : row.daySource === "event" ? 1 : 0)
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

  return a.folderDate <= b.folderDate ? a : b;
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
 * Hard collapse: one row per (day, normalized title), including case variants
 * and near-duplicate re-persist bot IDs ("Rev"/"rev", "Meeting"/"meeting").
 */
export function dedupeMeetingsByTitleDay<T extends MeetingScheduleRow>(rows: T[]): T[] {
  const byTitleDay = new Map<string, T>();

  for (const row of rows) {
    const titleKey = normalizeMeetingTitleKey(row.title) || "meeting";
    const key = `${row.day}|${titleKey}`;
    const prev = byTitleDay.get(key);
    byTitleDay.set(key, prev ? pickPreferredMeetingRow(prev, row) : row);
  }

  return [...byTitleDay.values()];
}

/**
 * Generic untitled rows are almost always re-persist junk / test bots.
 * Keep them out of calendar + meeting list so they cannot inflate "today".
 */
export function filterGenericMeetingClutter<T extends MeetingScheduleRow>(rows: T[]): T[] {
  return rows.filter((row) => {
    const titleKey = normalizeMeetingTitleKey(row.title);
    return !isGenericNormalizedTitle(titleKey);
  });
}
