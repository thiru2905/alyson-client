/**
 * Full meeting-notes/transcript visibility (no per-meeting filter).
 * Everyone else only sees meetings they were invited to or present in.
 */
export const MEETING_FULL_ACCESS_EMAILS = [
  "alysonclient@cintara.ai",
  "mohita@cintara.ai",
  "arman@cintara.ai",
  "thirumalai@cintara.ai",
] as const;

export function isMeetingFullAccessEmail(email: string | null | undefined): boolean {
  const e = String(email || "").trim().toLowerCase();
  return (MEETING_FULL_ACCESS_EMAILS as readonly string[]).includes(e);
}
