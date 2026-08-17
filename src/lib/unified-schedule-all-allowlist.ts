/** Calendars that Unified Meetings → Schedule all is allowed to book bots for. */
export const UNIFIED_SCHEDULE_ALL_EMAILS = [
  "aditya@cintara.ai",
  "alysonclient@cintara.ai",
  "mohita@cintara.ai",
  "arman@cintara.ai",
  "vinit@cintara.ai",
  "aryan@cintara.ai",
  "zaman@cintara.ai",
] as const;

const ALLOWED = new Set(UNIFIED_SCHEDULE_ALL_EMAILS.map((email) => email.toLowerCase()));

export function normalizeScheduleAllEmail(email: string | null | undefined): string {
  return String(email || "")
    .trim()
    .toLowerCase();
}

export function isUnifiedScheduleAllEmailAllowed(email: string | null | undefined): boolean {
  const normalized = normalizeScheduleAllEmail(email);
  return Boolean(normalized) && ALLOWED.has(normalized);
}
