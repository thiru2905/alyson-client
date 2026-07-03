/** DDMMYYYY prefix — e.g. 03072026 for 3 Jul 2026 (recurring meetings disambiguation). */
export function formatMeetingDatePrefix(startTimeIso: string): string {
  const d = new Date(startTimeIso);
  if (!Number.isFinite(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}${mm}${yyyy}`;
}

/** Prefix meeting title with occurrence date: `03072026 DE standup`. Idempotent if already prefixed. */
export function buildDatedMeetingTitle(title: string, startTimeIso: string): string {
  const cleanTitle = String(title || "Meeting").trim() || "Meeting";
  const prefix = formatMeetingDatePrefix(startTimeIso);
  if (!prefix) return cleanTitle;
  if (cleanTitle.startsWith(`${prefix} `) || cleanTitle === prefix) return cleanTitle;
  return `${prefix} ${cleanTitle}`;
}

export function resolveMeetingStartFromMetadata(metadata?: Record<string, unknown>): string | undefined {
  const raw = metadata?.meeting_start_time ?? metadata?.meetingStartTime ?? metadata?.scheduled_join_at;
  const s = String(raw || "").trim();
  return s || undefined;
}
