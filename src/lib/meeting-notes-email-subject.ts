function formatMeetingDatePrefix(startTimeIso: string): string {
  const d = new Date(startTimeIso);
  if (!Number.isFinite(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}${mm}${yyyy}`;
}

/** Inbox subject line for meeting notes emails. */
export function buildMeetingNotesEmailSubject(title: string, meetingStartAt?: string | null): string {
  const clean = String(title || "Meeting").trim() || "Meeting";
  const prefix = meetingStartAt ? formatMeetingDatePrefix(meetingStartAt) : "";
  if (prefix && !clean.startsWith(`${prefix} `)) {
    return `Meeting notes — ${prefix} ${clean}`;
  }
  return `Meeting notes — ${clean}`;
}
