/**
 * Meeting notes/transcript visibility.
 * Per-meeting invite/attendance filtering is disabled — any signed-in user
 * can view all meetings. Re-enable by restoring an allowlist check here.
 */
export const MEETING_FULL_ACCESS_EMAILS = [
  "alysonclient@cintara.ai",
  "mohita@cintara.ai",
  "arman@cintara.ai",
  "thirumalai@cintara.ai",
] as const;

/** Always true — all authenticated users get company-wide meeting access. */
export function isMeetingFullAccessEmail(_email?: string | null): boolean {
  return true;
}
