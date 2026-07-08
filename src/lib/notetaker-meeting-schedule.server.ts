/**
 * Canonical meeting day/time for S3 calendar + meeting list.
 * Titles often lead with DDMMYYYY (e.g. 11062026 = 11 Jun 2026) while a re-persisted
 * S3 folder may incorrectly use today's YYYY-MM-DD suffix.
 */

export function parseLeadingDdMmYyyy(text: string): string | null {
  const m = String(text || "")
    .trim()
    .match(/^(\d{2})(\d{2})(\d{4})\b/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const day = `${yyyy}-${mm}-${dd}`;
  if (!Number.isFinite(Date.parse(`${day}T12:00:00Z`))) return null;
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

export function resolveMeetingSchedule(args: { title: string; prefix: string }): {
  day: string;
  startedAt: string | null;
  folderDate: string;
} {
  const parsed = parseS3MeetingPrefix(args.prefix);
  const fromTitle = parseLeadingDdMmYyyy(args.title);
  const fromName =
    parseLeadingDdMmYyyy(parsed.displayName) || parseLeadingDdMmYyyy(parsed.name.replaceAll("-", " "));
  const day = fromTitle || fromName || parsed.folderDate;

  let startedAt = parsed.folderStartedAt;
  if (day && parsed.time && day !== parsed.folderDate) {
    const candidate = `${day}T${parsed.time.replaceAll("-", ":")}Z`;
    if (Number.isFinite(Date.parse(candidate))) startedAt = candidate;
  }

  return { day, startedAt, folderDate: parsed.folderDate };
}

export type MeetingScheduleRow = {
  prefix: string;
  botId: string | null;
  day: string;
  folderDate: string;
};

/** When the same bot was persisted twice, keep the folder whose date matches the real meeting day. */
export function pickPreferredMeetingRow<T extends MeetingScheduleRow>(a: T, b: T): T {
  const aAligned = a.day === a.folderDate;
  const bAligned = b.day === b.folderDate;
  if (aAligned && !bAligned) return a;
  if (bAligned && !aAligned) return b;
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
